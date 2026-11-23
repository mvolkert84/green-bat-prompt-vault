// Copied into the emulator's temporary build only. Production uses its normal catalog.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, description) {
  for (let i = 0; i < 300; i++) {
    const value = read();
    if (value) return value;
    await pause(80);
  }
  throw new Error('Timed out: ' + description);
}
function makeAudio() {
  const dataSize = 8000 * 2 * 90;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const text = (at, value) => [...value].forEach((ch, i) => view.setUint8(at+i, ch.charCodeAt(0)));
  text(0,'RIFF'); view.setUint32(4,buffer.byteLength-8,true); text(8,'WAVE'); text(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,8000,true); view.setUint32(28,16000,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
  text(36,'data'); view.setUint32(40,dataSize,true);
  return new Blob([buffer], {type:'audio/wav'});
}
function seed() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('greenbat-music-library', 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      for (const store of ['tracks', 'albums']) {
        req.result.createObjectStore(store, {keyPath:'id'}).createIndex('group','groupId');
      }
      req.result.createObjectStore('audio');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['tracks', 'audio'], 'readwrite');
      const lyrics = '[00:00.00]Stars unfold beyond the blue\n[00:03.00]Sail the universe with you\n[00:06.00]Through the spirals, breaking free\n[00:12.00]A thousand worlds in harmony';
      tx.objectStore('tracks').put({id:'qa-vinyl',groupId:'vertigo',albumId:'',
        title:'Sail The Universe',artist:'Vertigo',number:1,added:1,duration:90,lyrics});
      tx.objectStore('audio').put(makeAudio(),'qa-vinyl');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}
const q = selector => document.querySelector(selector);
const active = () => q('.lyrics-sheet [aria-current=true]')?.textContent;
const rotation = () => getComputedStyle(q('.turntable-rotor'), '::before').transform;
async function run() {
  await seed();
  const group = await until(() => q('[data-group="vertigo"]'), 'Vertigo group');
  group.click();
  const track = await until(() => q('[data-music="track"][data-id="qa-vinyl"]'), 'fixture track');
  const touch = document.createElement('button');
  touch.textContent = 'Start Android player check';
  touch.style.cssText = 'position:fixed;inset:0;z-index:5000;background:#120d08;color:#f0e0be;';
  document.body.append(touch);
  console.info('VINYL_QA_ARMED');
  await new Promise(resolve => touch.addEventListener('click', () => {
    touch.remove();
    track.click();
    resolve();
  }, {once:true}));
  const open = await until(() => q('#musicDock:not([hidden]) [data-music="open-player"]'), 'playing dock');
  open.click();
  await until(() => active() === 'Sail the universe with you', 'second line on the audio clock');
  const before = rotation();
  await pause(220);
  if (rotation() === before) throw new Error('Groove texture did not rotate');
  console.info('VINYL_QA_CAPTURE');
  await until(() => active() === 'A thousand worlds in harmony', 'fourth line on the audio clock');
  q('#musicDeck [data-music="toggle"]').click();
  await until(() => !q('#musicDeck').classList.contains('is-playing'), 'paused player');
  const paused = rotation();
  await pause(260);
  if (rotation() !== paused) throw new Error('Grooves kept moving while paused');
  const slider = q('#musicDeck input[type=range]');
  function seek(seconds) {
    slider.value = seconds;
    slider.dispatchEvent(new Event('input', {bubbles:true}));
  }
  seek(5);
  if (active() !== 'Sail the universe with you') throw new Error('Backward seek failed');
  seek(13);
  if (active() !== 'A thousand worlds in harmony') throw new Error('Forward seek failed');
  console.info('VINYL_QA_PASSED');
}
run().catch(error => console.error('VINYL_QA_FAILED ' + error.message));
