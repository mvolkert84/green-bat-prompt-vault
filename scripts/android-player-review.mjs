import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

const app = 'com.greenbatmusic.player';
const output = 'android-review-proof';
const adb = (...args) => execFileSync('adb', args, {maxBuffer: 16 * 1024 * 1024});
async function until(get, description, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    const value = await get();
    if (value) return value;
    await delay(500);
  }
  throw new Error('Timed out waiting for ' + description);
}
mkdirSync(output, {recursive: true});
adb('shell', 'wm', 'size', '1080x2280');
adb('shell', 'wm', 'density', '480');
adb('install', 'android/app/build/outputs/apk/debug/app-debug.apk');
adb('shell', 'am', 'start', '-n', app + '/.MainActivity');
const pid = await until(() => {
  try { return adb('shell', 'pidof', app).toString().trim(); } catch { return ''; }
}, 'Android app process');
adb('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
const target = await until(async () => {
  try {
    const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
    return targets.find(x => x.url.startsWith('https://localhost'));
  } catch { return undefined; }
}, 'Capacitor WebView');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, {once:true});
  socket.addEventListener('error', reject, {once:true});
});
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', ({data}) => {
  const response = JSON.parse(data);
  if (!pending.has(response.id)) return;
  pending.get(response.id)(response);
  pending.delete(response.id);
});
async function evaluate(expression) {
  const id = ++nextId;
  const response = await new Promise(resolve => {
    pending.set(id, resolve);
    socket.send(JSON.stringify({id, method:'Runtime.evaluate',
      params:{expression, awaitPromise:true, returnByValue:true, userGesture:true}}));
  });
  if (response.error || response.result.exceptionDetails) throw new Error(JSON.stringify(response));
  return response.result.result.value;
}
const exists = selector => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
const click = async selector => {
  await until(() => exists(selector), selector);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
};

try {
  await until(() => exists('[data-group="vertigo"]'), 'home');
  await evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('greenbat-music-library', 1);
    request.onupgradeneeded = () => {
      for (const store of ['tracks','albums']) request.result.createObjectStore(store,{keyPath:'id'}).createIndex('group','groupId');
      request.result.createObjectStore('audio');
    };
    request.onerror = reject;
    request.onsuccess = () => {
      const samples = 960000;
      const bytes = new ArrayBuffer(44 + samples * 2);
      const dv = new DataView(bytes);
      const str = (offset, text) => Array.from(text).forEach((ch,i) => dv.setUint8(offset+i,ch.charCodeAt(0)));
      str(0,'RIFF'); dv.setUint32(4,bytes.byteLength-8,true); str(8,'WAVE'); str(12,'fmt ');
      dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
      dv.setUint32(24,8000,true); dv.setUint32(28,16000,true); dv.setUint16(32,2,true); dv.setUint16(34,16,true);
      str(36,'data'); dv.setUint32(40,samples*2,true);
      const db = request.result;
      const tx = db.transaction(['tracks','audio'], 'readwrite');
      const lyrics = '[00:00.00]Stars unfold beyond the blue\\n[00:03.00]Sail the universe with you\\n[00:10.00]Through the spirals, breaking free\\n[00:16.00]A thousand worlds in harmony';
      tx.objectStore('tracks').put({id:'qa-vinyl',groupId:'vertigo',albumId:'',title:'Sail The Universe',artist:'Vertigo',number:0,added:1,duration:120,lyrics});
      tx.objectStore('audio').put(new Blob([bytes],{type:'audio/wav'}),'qa-vinyl');
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = reject;
    };
  })`);
  await click('[data-group="vertigo"]');
  await click('[data-music="track"][data-id="qa-vinyl"]');
  await click('[data-music="open-player"]');
  const active = () => evaluate("document.querySelector('.lyrics-sheet [aria-current=true]')?.textContent");
  await until(async () => (await active()) === 'Sail the universe with you', 'second timed line');
  const rotation = () => evaluate("getComputedStyle(document.querySelector('.turntable-rotor'), '::before').transform");
  const before = await rotation();
  await delay(200);
  assert.notEqual(await rotation(), before);
  writeFileSync(output + '/Android-Player.png', adb('exec-out','screencap','-p'));
  adb('shell','screenrecord','--time-limit','4','/sdcard/green-bat-player.mp4');
  adb('pull','/sdcard/green-bat-player.mp4',output + '/Android-Vinyl-Demo.mp4');
  await click('#musicDeck [data-music="toggle"]');
  await until(() => evaluate("!document.querySelector('#musicDeck').classList.contains('is-playing')"), 'paused player');
  const paused = await rotation();
  await delay(250);
  assert.equal(await rotation(), paused);
  async function seek(seconds) {
    await evaluate(`(() => {const slider = document.querySelector('#musicDeck input[type=range]');
      slider.value = ${seconds}; slider.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  }
  await seek(17);
  assert.equal(await active(), 'A thousand worlds in harmony');
  await seek(1);
  assert.equal(await active(), 'Stars unfold beyond the blue');
  writeFileSync(output + '/Test-Results.txt', 'Passed on Android API 34 emulator at 1080 × 2280: playback, visible rotor motion, live cue advancement, pause, forward and backward seeking. Used synthetic local audio.\n');
} finally {
  socket.close();
}
