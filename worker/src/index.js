const CATALOG = 'library.json';
const AUDIO_PREFIX = 'audio/';
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const contentTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a',
  'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg', 'audio/webm']);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag'
};
const safe = (value, maximum = 180) => String(value ?? '').trim().slice(0, maximum);
const fail = (error, status = 400) => json({error}, status);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {...cors, 'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store'}
});
const blank = () => ({version:1, updatedAt:'', albums:[], tracks:[]});
const validId = value => /^[a-zA-Z0-9_-]{1,100}$/.test(value || '');
const positive = value => Math.max(0, Math.min(99999, Number(value) || 0));

async function authenticated(request, env) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) return false;
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([env.ADMIN_TOKEN, header.slice(7)].map(value =>
    crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
async function catalog(env) {
  const object = await env.MUSIC_BUCKET.get(CATALOG);
  if (!object) return blank();
  const data = await object.json();
  return {
    version: 1, updatedAt: safe(data.updatedAt, 50),
    tracks: Array.isArray(data.tracks) ? data.tracks : [],
    albums: Array.isArray(data.albums) ? data.albums : []
  };
}
async function save(env, library) {
  library.updatedAt = new Date().toISOString();
  await env.MUSIC_BUCKET.put(CATALOG, JSON.stringify(library), {
    httpMetadata: {contentType:'application/json'}
  });
}
function trackData(form, id) {
  return {
    id, groupId: safe(form.get('groupId'), 100),
    albumId: safe(form.get('albumId'), 100),
    title: safe(form.get('title')) || 'Untitled', artist: safe(form.get('artist')),
    lyrics: safe(form.get('lyrics'), 50000), duration: positive(form.get('duration')),
    number: positive(form.get('number')), added: Date.now()
  };
}
async function stream(request, env, id) {
  if (!validId(id)) return fail('Invalid track ID', 404);
  const range = request.headers.get('Range');
  const obj = await env.MUSIC_BUCKET.get(AUDIO_PREFIX + id, range ? {range: request.headers} : {});
  if (!obj) return fail('Track not found', 404);
  const headers = new Headers(cors);
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=3600');
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'audio/mpeg');
  const total = obj.size;
  if (range && obj.range && Number.isFinite(obj.range.offset)) {
    const start = obj.range.offset;
    const length = obj.range.length || (total - start);
    headers.set('Content-Range', 'bytes ' + start + '-' + (start + length - 1) + '/' + total);
    headers.set('Content-Length', String(length));
    return new Response(obj.body, {status:206, headers});
  }
  headers.set('Content-Length', String(total));
  return new Response(obj.body, {status:200, headers});
}
async function handler(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});
  if (!env.MUSIC_BUCKET) return fail('MUSIC_BUCKET binding missing', 503);
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/health' && request.method === 'GET') return json({ok:true});
  if (path === '/library' && request.method === 'GET') return json(await catalog(env));
  if (path.startsWith('/audio/') && request.method === 'GET') {
    return stream(request, env, decodeURIComponent(path.slice(7)));
  }
  if (!path.startsWith('/admin/')) return fail('Not found', 404);
  if (!await authenticated(request, env)) return fail('Administrator authorization required', 401);
  if (path === '/admin/session' && request.method === 'GET') return json({admin:true});

  if (path === '/admin/tracks' && request.method === 'POST') {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.stream !== 'function' || !file.size) return fail('Audio file required');
    if (file.size > MAX_AUDIO_BYTES) return fail('Audio files must be 50 MB or smaller', 413);
    const extension = safe(file.name || '', 120).toLowerCase().split('.').pop();
    const fallbackTypes = {mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',
      flac:'audio/flac',ogg:'audio/ogg',opus:'audio/ogg',webm:'audio/webm'};
    const type = safe(file.type || fallbackTypes[extension] || '', 80).toLowerCase();
    if (!contentTypes.has(type)) return fail('Use MP3, M4A, AAC, WAV, FLAC, OGG or WebM audio');
    const id = crypto.randomUUID();
    const track = trackData(form, id);
    if (!validId(track.groupId)) return fail('Invalid group');
    const library = await catalog(env);
    if (track.albumId && !library.albums.some(a => a.id === track.albumId && a.groupId === track.groupId)) {
      return fail('Album not found in group');
    }
    await env.MUSIC_BUCKET.put(AUDIO_PREFIX + id, file.stream(), {
      httpMetadata:{contentType: type === 'audio/mp3' ? 'audio/mpeg' : type}
    });
    try {
      library.tracks.push(track);
      await save(env, library);
    } catch (error) {
      await env.MUSIC_BUCKET.delete(AUDIO_PREFIX + id);
      throw error;
    }
    return json({track}, 201);
  }
  if (path === '/admin/albums' && request.method === 'POST') {
    const body = await request.json();
    const library = await catalog(env);
    const id = safe(body.id, 100) || crypto.randomUUID();
    const groupId = safe(body.groupId, 100);
    if (!validId(groupId) || !validId(id)) return fail('Invalid album or group');
    const existing = library.albums.find(a => a.id === id);
    if (existing && existing.groupId !== groupId) return fail('Album group cannot change');
    const artwork = safe(body.artwork, 250000);
    if (artwork && !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(artwork)) {
      return fail('Invalid cover image');
    }
    const album = {id, groupId, title:safe(body.title, 100) || 'Untitled Album',
      artwork, added:existing?.added || Date.now()};
    if (existing) Object.assign(existing, album); else library.albums.push(album);
    await save(env, library);
    return json({album});
  }
  const trackMatch = path.match(/^\/admin\/tracks\/([a-zA-Z0-9_-]+)$/);
  if (trackMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
    const library = await catalog(env);
    const track = library.tracks.find(t => t.id === trackMatch[1]);
    if (!track) return fail('Track not found', 404);
    if (request.method === 'PATCH') {
      const body = await request.json();
      const albumId = safe(body.albumId, 100);
      if (albumId && !library.albums.some(a => a.id === albumId && a.groupId === track.groupId)) {
        return fail('Album not found in group');
      }
      Object.assign(track, {albumId, title:safe(body.title) || track.title,
        artist:safe(body.artist), number:positive(body.number),
        lyrics:safe(body.lyrics, 50000)});
      await save(env, library);
      return json({track});
    }
    library.tracks = library.tracks.filter(t => t.id !== track.id);
    await save(env, library);
    await env.MUSIC_BUCKET.delete(AUDIO_PREFIX + track.id);
    return json({removed:true});
  }
  const albumMatch = path.match(/^\/admin\/albums\/([a-zA-Z0-9_-]+)$/);
  if (albumMatch && request.method === 'DELETE') {
    const library = await catalog(env);
    if (!library.albums.some(a => a.id === albumMatch[1])) return fail('Album not found', 404);
    library.albums = library.albums.filter(a => a.id !== albumMatch[1]);
    for (const track of library.tracks) if (track.albumId === albumMatch[1]) track.albumId = '';
    await save(env, library);
    return json({removed:true});
  }
  return fail('Not found', 404);
}
export default {
  async fetch(request, env) {
    try { return await handler(request, env); }
    catch (error) { return fail('Cloud library error. Try again.', 500); }
  }
};
