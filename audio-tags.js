(() => {
  'use strict';
  const MAX_TAG = 4 * 1024 * 1024;
  const utf8 = new TextDecoder();
  const latin = new TextDecoder('iso-8859-1');
  const utf16 = new TextDecoder('utf-16le');
  const utf16be = new TextDecoder('utf-16be');
  const keys = {TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', TRACKNUMBER: 'number',
    LYRICS: 'lyrics', USLT: 'lyrics', UNSYNCEDLYRICS: 'lyrics', UNSYNCED_LYRICS: 'lyrics', SYNCEDLYRICS: 'lyrics'};
  const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const label = (bytes, start, length) => latin.decode(bytes.subarray(start, start + length));
  const synchsafe = (bytes, start) => bytes.subarray(start, start + 4).reduce((value, byte) => value * 128 + (byte & 127), 0);
  const read = async (file, offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());

  function set(tags, key, value) {
    const clean = value.replaceAll('\0', '').trim();
    if (key && clean && !tags[key]) tags[key] = clean.slice(0, key === 'lyrics' ? 80000 : 180);
  }

  function removeUnsync(bytes) {
    return bytes.filter((byte, index) => byte !== 0 || bytes[index - 1] !== 255);
  }

  function readID3(bytes, tags) {
    const version = bytes[3];
    if (version < 2 || version > 4 || bytes.length < 10 || (version === 2 && (bytes[5] & 64))) return;
    const flags = bytes[5];
    const end = Math.min(bytes.length, 10 + synchsafe(bytes, 6));
    bytes = bytes.subarray(10, end);
    if (version < 4 && (flags & 128)) bytes = removeUnsync(bytes);
    const data = view(bytes);
    let offset = 0;
    if (version > 2 && (flags & 64)) {
      if (bytes.length < 4) return;
      offset = version === 4 ? synchsafe(bytes, 0) : 4 + data.getUint32(0);
    }
    const header = version === 2 ? 6 : 10;
    const textFrames = {TT2: 'title', TIT2: 'title', TP1: 'artist', TPE1: 'artist',
      TAL: 'album', TALB: 'album', TRK: 'number', TRCK: 'number'};
    while (offset + header <= bytes.length) {
      const id = label(bytes, offset, version === 2 ? 3 : 4);
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      const size = version === 2 ? (data.getUint32(offset + 2) & 0xffffff) :
        version === 3 ? data.getUint32(offset + 4) : synchsafe(bytes, offset + 4);
      const frameFlags = version === 2 ? 0 : bytes[offset + 9];
      const start = offset + header;
      offset = start + size;
      if (offset > bytes.length || size < 2 || (version === 3 && (frameFlags & 192)) ||
          (version === 4 && (frameFlags & 12))) continue;
      const skip = version === 3 ? Number(Boolean(frameFlags & 32)) :
        Number(Boolean(frameFlags & 64)) + (frameFlags & 1 ? 4 : 0);
      let frame = bytes.subarray(start + skip, offset);
      if (version === 4 && (frameFlags & 2 || flags & 128)) frame = removeUnsync(frame);
      const enc = frame[0];
      const decoder = [latin, utf16, utf16be, utf8][enc];
      if (!decoder) continue;
      const decode = field => enc === 1 && field[0] === 254 && field[1] === 255 ?
        utf16be.decode(field.subarray(2)) : decoder.decode(field);
      if (textFrames[id]) {
        set(tags, textFrames[id], decode(frame.subarray(1)));
      } else if (['USLT', 'ULT', 'TXXX', 'TXX', 'SYLT', 'SLT'].includes(id)) {
        const custom = id === 'TXXX' || id === 'TXX';
        const timed = id === 'SYLT' || id === 'SLT';
        const width = enc === 1 || enc === 2 ? 2 : 1;
        const first = custom ? 1 : timed ? 6 : 4;
        const terminator = from => {
          for (let i = from; i + width <= frame.length; i += width) {
            if (frame[i] === 0 && (width === 1 || frame[i + 1] === 0)) return i;
          }
          return frame.length;
        };
        const last = terminator(first);
        const key = custom ? keys[decode(frame.subarray(first, last)).trim().toUpperCase()] : 'lyrics';
        if (timed) {
          const lines = [];
          for (let start = last + width; start < frame.length;) {
            const end = terminator(start);
            if (end + width + 4 > frame.length) break;
            lines.push(decode(frame.subarray(start, end)));
            start = end + width + 4;
          }
          set(tags, key, lines.join('\n'));
        } else {
          set(tags, key, decode(frame.subarray(last + width)));
        }
      }
    }
  }

  function readComments(bytes, tags) {
    const data = view(bytes);
    if (bytes.length < 8) return;
    let offset = 4 + data.getUint32(0, true);
    if (offset + 4 > bytes.length) return;
    const count = data.getUint32(offset, true);
    offset += 4;
    for (let i = 0; i < count && offset + 4 <= bytes.length; i++) {
      const length = data.getUint32(offset, true);
      offset += 4;
      if (offset + length > bytes.length) return;
      const field = utf8.decode(bytes.subarray(offset, offset + length));
      offset += length;
      const equals = field.indexOf('=');
      if (equals > 0) set(tags, keys[field.slice(0, equals).toUpperCase()], field.slice(equals + 1));
    }
  }

  function readOgg(bytes, tags) {
    let offset = 0;
    let packet = [];
    let size = 0;
    const data = view(bytes);
    if (bytes.length < 27) return;
    const serial = data.getUint32(14, true);
    while (offset + 27 <= bytes.length && label(bytes, offset, 4) === 'OggS') {
      const segments = bytes[offset + 26];
      const end = offset + 27 + segments;
      if (end > bytes.length) return;
      let cursor = end;
      const sameStream = data.getUint32(offset + 14, true) === serial;
      for (const length of bytes.subarray(offset + 27, end)) {
        if (cursor + length > bytes.length) return;
        if (sameStream) {
          packet.push(bytes.subarray(cursor, cursor + length));
          size += length;
          if (length < 255) {
            const joined = new Uint8Array(size);
            let position = 0;
            for (const part of packet) { joined.set(part, position); position += part.length; }
            const header = label(joined, 0, 8);
            if (header === 'OpusTags') { readComments(joined.subarray(8), tags); return; }
            if (joined[0] === 3 && header.slice(1, 7) === 'vorbis') { readComments(joined.subarray(7), tags); return; }
            packet = [];
            size = 0;
          }
        }
        cursor += length;
      }
      offset = cursor;
    }
  }

  function readFlac(bytes, tags, offset) {
    for (let cursor = offset + 4; cursor + 4 <= bytes.length;) {
      const flag = bytes[cursor];
      const size = view(bytes).getUint32(cursor) & 0xffffff;
      const end = cursor + 4 + size;
      if (end > bytes.length) return;
      if ((flag & 127) === 4) readComments(bytes.subarray(cursor + 4, end), tags);
      if (flag & 128) return;
      cursor = end;
    }
  }

  async function readWave(file, tags) {
    for (let offset = 12, chunks = 0; offset + 8 <= file.size && chunks < 256; chunks++) {
      const header = await read(file, offset, 8);
      const size = view(header).getUint32(4, true);
      const type = label(header, 0, 4);
      const start = offset + 8;
      if (start + size > file.size) return;
      if (type.toLowerCase() === 'id3 ' && size <= MAX_TAG) readID3(await read(file, start, size), tags);
      if (type === 'LIST' && size <= MAX_TAG) {
        const list = await read(file, start, size);
        if (label(list, 0, 4) === 'INFO') {
          for (let i = 4; i + 8 <= list.length;) {
            const size = view(list).getUint32(i + 4, true);
            const name = label(list, i, 4);
            const end = i + 8 + size;
            if (end > list.length) break;
            const key = {INAM: 'title', IART: 'artist', IPRD: 'album', ITRK: 'number'}[name];
            set(tags, key, utf8.decode(list.subarray(i + 8, end)));
            i = end + (size % 2);
          }
        }
      }
      offset = start + size + (size % 2);
    }
  }

  async function readMP4(file, tags) {
    const fields = {'©nam': 'title', '©ART': 'artist', aART: 'artist', '©alb': 'album',
      '©lyr': 'lyrics', trkn: 'number'};
    let remaining = 4096;
    async function walk(start, end, path) {
      for (let offset = start; offset + 8 <= end && remaining > 0;) {
        remaining--;
        const bytes = await read(file, offset, Math.min(16, end - offset));
        const header = view(bytes);
        const type = label(bytes, 4, 4);
        let size = header.getUint32(0);
        let headerSize = 8;
        if (size === 1) {
          if (bytes.length < 16) return;
          size = Number(header.getBigUint64(8));
          headerSize = 16;
        }
        if (size === 0) size = end - offset;
        const body = offset + headerSize;
        const next = offset + size;
        if (size < headerSize || next > end) return;
        if ((!path && type === 'moov') || (path === 'moov' && type === 'udta') ||
            (['moov', 'udta'].includes(path) && type === 'meta') ||
            (path === 'meta' && type === 'ilst') || (path === 'ilst' && fields[type])) {
          await walk(body + (type === 'meta' ? 4 : 0), next, type);
        } else if (fields[path] && type === 'data' && next - body >= 8 && next - body - 8 <= MAX_TAG) {
          const value = await read(file, body + 8, next - body - 8);
          if (path === 'trkn') {
            if (value.length >= 4) set(tags, 'number', String(view(value).getUint16(2)));
          } else set(tags, fields[path], utf8.decode(value));
        }
        offset = next;
      }
    }
    await walk(0, file.size, '');
  }

  window.readAudioTags = async file => {
    const bytes = await read(file, 0, MAX_TAG);
    const tags = {};
    const type = label(bytes, 0, 4);
    if (type.startsWith('ID3')) {
      readID3(bytes, tags);
      const offset = 10 + synchsafe(bytes, 6) + (bytes[3] === 4 && bytes[5] & 16 ? 10 : 0);
      if (label(bytes, offset, 4) === 'fLaC') readFlac(bytes, tags, offset);
    } else if (type === 'fLaC') readFlac(bytes, tags, 0);
    else if (type === 'OggS') readOgg(bytes, tags);
    else if (type === 'RIFF' && label(bytes, 8, 4) === 'WAVE') await readWave(file, tags);
    else if (label(bytes, 4, 4) === 'ftyp') await readMP4(file, tags);
    if (!tags.title && /\.mp3$/i.test(file.name) && file.size >= 128) {
      const tail = await read(file, file.size - 128, 128);
      if (label(tail, 0, 3) === 'TAG') {
        set(tags, 'title', label(tail, 3, 30));
        set(tags, 'artist', label(tail, 33, 30));
        set(tags, 'album', label(tail, 63, 30));
      }
    }
    return tags;
  };
})();
