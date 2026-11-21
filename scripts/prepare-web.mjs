import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'www');
const files = [
  'index.html', '404.html', 'app.js', 'starter-data.js', 'starter-data.json',
  'audio-tags.js', 'cloud-config.js', 'cloud-client.js', 'music-library.js',
  'styles.css', 'record-vault.css', 'music-library.css',
  'manifest.webmanifest', 'service-worker.js'
];
const directories = ['assets', 'icons'];
fs.rmSync(output, {recursive:true, force:true});
fs.mkdirSync(output, {recursive:true});
for (const name of files) {
  const src = path.join(root, name);
  if (!fs.existsSync(src)) throw new Error('Missing player file: ' + name);
  fs.copyFileSync(src, path.join(output, name));
}
for (const name of directories) {
  fs.cpSync(path.join(root, name), path.join(output, name), {recursive:true});
}
const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
for (const script of ['cloud-config.js', 'cloud-client.js', 'music-library.js']) {
  if (!html.includes('./' + script)) throw new Error('Player HTML does not load ' + script);
}
console.log('Prepared native Android player in www/ (' + files.length + ' files + graphics).');
