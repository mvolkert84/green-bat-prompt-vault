import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourceRoot = path.join(root, 'android', 'app', 'src', 'main', 'res');
if (!fs.existsSync(resourceRoot)) throw new Error('Android project not generated yet');

const largeIcon = path.join(root, 'icons', 'icon-512.png');
const smallIcon = path.join(root, 'icons', 'icon-192.png');
const drawable = path.join(resourceRoot, 'drawable-nodpi');
fs.mkdirSync(drawable, {recursive:true});
fs.copyFileSync(largeIcon, path.join(drawable, 'green_bat_app_icon.png'));

const colors = path.join(resourceRoot, 'values', 'green_bat_launcher.xml');
fs.writeFileSync(colors, '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<resources><color name="green_bat_launcher_background">#0b0906</color></resources>\n');

const adaptiveFolder = path.join(resourceRoot, 'mipmap-anydpi-v26');
fs.mkdirSync(adaptiveFolder, {recursive:true});
const adaptive = '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n' +
  '  <background android:drawable="@color/green_bat_launcher_background" />\n' +
  '  <foreground android:drawable="@drawable/green_bat_app_icon" />\n' +
  '</adaptive-icon>\n';
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  fs.writeFileSync(path.join(adaptiveFolder, name), adaptive);
}
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const dir = path.join(resourceRoot, 'mipmap-' + density);
  fs.mkdirSync(dir, {recursive:true});
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    fs.copyFileSync(smallIcon, path.join(dir, name));
  }
}
console.log('Installed the Green Bat Music launcher icon for Android.');
