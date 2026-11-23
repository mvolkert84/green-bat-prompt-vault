const timestamp = /\[(\d+):([0-5]?\d)(?:[.:](\d{1,3}))?\]/y;
const metadata = /^\[(?:ar|al|ti|au|by|length|re|ve|offset):[^\]]*\]\s*$/i;

export function parseLyrics(input) {
  const text = String(input ?? '').trim();
  const offset = Number(text.match(/^\[offset:\s*([+-]?\d+)\s*\]\s*$/im)?.[1] || 0) / 1000;
  const entries = [];
  let lastTime = -1;
  for (const row of text.split(/\r\n?|\n/)) {
    let position = 0;
    const times = [];
    while (true) {
      timestamp.lastIndex = position;
      const match = timestamp.exec(row);
      if (!match) break;
      const time = Number(match[1]) * 60 + Number(match[2]) + Number('0.' + (match[3] || '0'));
      times.push(Math.max(0, time + offset));
      position = timestamp.lastIndex;
    }
    const line = row.slice(position).trim();
    if (times.length) {
      for (const time of times) entries.push({line, time, order: time});
      lastTime = times.at(-1);
    } else if (line && !metadata.test(line)) {
      entries.push({line, time: null, order: lastTime});
    }
  }
  if (!entries.some(entry => entry.time !== null && entry.line)) return {text, lines: [], cues: []};
  const lines = entries.sort((a, b) => a.order - b.order);
  const cues = lines.flatMap(({time}, index) => time === null ? [] : [{time, index}]);
  return {text, lines, cues};
}

export function activeLyric(cues, time) {
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cues[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? -1 : cues[lo - 1].index;
}

export function stampLyric(text, position, seconds) {
  const start = position === 0 ? 0 : text.lastIndexOf('\n', position - 1) + 1;
  const end = text.indexOf('\n', start);
  const finish = end < 0 ? text.length : end;
  const line = text.slice(start, finish);
  const centiseconds = Math.max(0, Math.floor(seconds * 100));
  const minutes = String(Math.floor(centiseconds / 6000)).padStart(2, '0');
  const secs = String(Math.floor(centiseconds / 100) % 60).padStart(2, '0');
  const fraction = String(centiseconds % 100).padStart(2, '0');
  timestamp.lastIndex = 0;
  const existing = timestamp.exec(line);
  const value = `[${minutes}:${secs}.${fraction}]${line.slice(existing?.[0].length || 0)}`;
  return {start, finish, value, next: start + value.length + (end < 0 ? 0 : 1)};
}
