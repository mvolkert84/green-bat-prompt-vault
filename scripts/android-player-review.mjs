import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

const app = 'com.greenbatmusic.player';
const output = 'android-review-proof';
const adb = (...args) => execFileSync('adb', args, {maxBuffer: 16 * 1024 * 1024, timeout: 60000});
async function waitFor(marker, attempts = 90) {
  for (let i = 0; i < attempts; i++) {
    const logs = adb('logcat', '-d', '-t', '2500').toString();
    const failure = logs.split('\n').find(l => l.includes('VINYL_QA_FAILED'));
    if (failure) throw new Error(failure);
    if (logs.includes(marker)) return;
    await delay(500);
  }
  throw new Error('Emulator did not report ' + marker);
}

mkdirSync(output, {recursive: true});
adb('shell', 'wm', 'size', '1080x2280');
adb('shell', 'wm', 'density', '480');
adb('logcat', '-c');
adb('install', 'android/app/build/outputs/apk/debug/app-debug.apk');
adb('shell', 'am', 'start', '-n', app + '/.MainActivity');
await waitFor('VINYL_QA_ARMED');
adb('shell', 'input', 'tap', '540', '1140');
await waitFor('VINYL_QA_CAPTURE');
writeFileSync(output + '/Android-Player.png', adb('exec-out', 'screencap', '-p'));
adb('shell', 'screenrecord', '--size', '720x1520', '--time-limit', '4', '/sdcard/vinyl-review.mp4');
adb('pull', '/sdcard/vinyl-review.mp4', output + '/Android-Vinyl-Demo.mp4');
await waitFor('VINYL_QA_PASSED');
writeFileSync(output + '/Test-Results.txt',
  'Android API 34 emulator: real touch start, live cue progression, moving grooves, pause, backward and forward seeking passed. Synthetic audio fixture.\n');
