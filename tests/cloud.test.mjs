import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/src/index.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function fakeR2() {
  const files = new Map();
  return {
    files,
    async put(key, source, options = {}) {
      const bytes = typeof source === 'string' ? encoder.encode(source) :
        new Uint8Array(await new Response(source).arrayBuffer());
      files.set(key, {bytes, type:options.httpMetadata?.contentType || 'application/octet-stream'});
    },
    async get(key, options = {}) {
      const entry = files.get(key);
      if (!entry) return null;
      const size = entry.bytes.length;
      const rangeHeader = options.range?.get('Range');
      const match = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);
      const start = match ? Number(match[1]) : 0;
      const stop = match && match[2] ? Number(match[2]) + 1 : size;
      const bytes = entry.bytes.slice(start, stop);
      return {
        size, range:match ? {offset:start,length:bytes.length} : undefined,
        body:new Blob([bytes]).stream(),
        httpMetadata:{contentType:entry.type},
        httpEtag:'"test-etag"',
        writeHttpMetadata(headers) { headers.set('Content-Type', entry.type); },
        json:async () => JSON.parse(decoder.decode(entry.bytes))
      };
    },
    async delete(key) { files.delete(key); }
  };
}
const token = 'test-admin-secret-is-more-than-thirty-two-characters';
const auth = {'Authorization':'Bearer ' + token};
function call(path, env, method = 'GET', body, headers = {}) {
  return worker.fetch(new Request('https://music.example.test' + path, {
    method, headers, ...(body === undefined ? {} : {body})
  }), env);
}
test('public catalog, private write, stream range and synchronized edits', async () => {
  const bucket = fakeR2();
  const env = {MUSIC_BUCKET:bucket, ADMIN_TOKEN:token};
  let response = await call('/library', env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).tracks, []);

  response = await call('/admin/session', env);
  assert.equal(response.status, 401);
  response = await call('/admin/session', env, 'GET', undefined, auth);
  assert.equal(response.status, 200);

  const album = {groupId:'vertigo',title:'Live at Midnight',artwork:''};
  response = await call('/admin/albums', env, 'POST', JSON.stringify(album), {
    ...auth,'Content-Type':'application/json'
  });
  assert.equal(response.status, 200);
  const albumId = (await response.json()).album.id;
  const form = new FormData();
  form.append('file', new Blob([encoder.encode('ID3fake-streaming-audio')], {
    type:'audio/mpeg'
  }), 'sample.mp3');
  for (const [key,value] of Object.entries({
    groupId:'vertigo', albumId, title:'Test Track',artist:'Vertigo',duration:123,lyrics:'Test lyric'
  })) form.append(key, String(value));
  response = await call('/admin/tracks', env, 'POST', form, auth);
  assert.equal(response.status, 201);
  const id = (await response.json()).track.id;

  response = await call('/library', env);
  const lib = await response.json();
  assert.equal(lib.tracks.length, 1);
  assert.equal(lib.tracks[0].albumId, albumId);
  assert.equal(lib.tracks[0].lyrics, 'Test lyric');

  response = await call('/audio/' + id, env, 'GET', undefined, {Range:'bytes=0-2'});
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 0-2/23');
  assert.equal(await response.text(), 'ID3');

  response = await call('/admin/tracks/' + id, env, 'PATCH', JSON.stringify({
    title:'Remastered',artist:'Vertigo',albumId,number:1
  }), {...auth, 'Content-Type':'application/json'});
  assert.equal(response.status, 200);

  response = await call('/admin/albums/' + albumId, env, 'DELETE', undefined, auth);
  assert.equal(response.status, 200);
  response = await call('/library', env);
  assert.equal((await response.json()).tracks[0].albumId, '');

  response = await call('/admin/tracks/' + id, env, 'DELETE', undefined, auth);
  assert.equal(response.status, 200);
  response = await call('/audio/' + id, env);
  assert.equal(response.status, 404);
});
