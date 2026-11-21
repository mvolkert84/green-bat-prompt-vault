# Green Bat Music Vault

A mobile-first installable web app for listening to Green Bat Music and collecting Suno style prompts.

## Included
- Group playlists with multi-file audio upload and optional albums for releases, live sets and holiday collections
- A persistent player and full-size turntable view with embedded lyrics when available
- 10 music groups: Vertigo, After Dark, Loose Change, Ever After Project, Pillars, State of Tension, Enter The End, 4th Movement, Oblivion, Alan Walker Band
- 103 editable starter prompts across core styles and alternate variations
- One-tap **Copy**; searchable groups and style prompts; category filters; star favorites
- Add, edit and remove music groups or style prompts
- Suno-oriented 1,000-character limit and live count
- Offline access after initial loading when served over HTTPS
- Backup and restore the library as JSON

**Important:** Starter prompts are reconstructed from established group sound directions, **not verified word-for-word copies** of all original chat prompts. Edit them freely.

## Install on an Android phone using GitHub Pages (free)

1. Create a **new public repository** on GitHub, such as `green-bat-prompt-vault`. Do not upload anything private or sensitive to a public repository.
2. Unzip this folder and upload **all its files and the `icons/` folder** to the repository root. In particular, keep `index.html` at the top level.
3. Go to **Settings → Pages**, choose **Deploy from a branch**, then select **main / (root)** and save.
4. Open the resulting GitHub Pages HTTPS address in **Chrome on your Android phone**. The address typically looks like `https://YOUR-USERNAME.github.io/green-bat-prompt-vault/` (replace with your real account/repository names).
5. Open Chrome's **⋮** menu and choose **Add to Home screen** or **Install app**. Launch it using the new home screen icon.

**Note:** Use an HTTPS host to install the app and cache it for offline playback.

## Music library
- Open a group sleeve to reach its playlist. Create an album from that group or leave tracks in the group playlist. Edit a track to move it to an album or set its track number.
- Audio compatibility depends on the browser. The app reads common ID3, MP4/M4A and Vorbis-style metadata, including embedded lyrics when present. Open **Now playing** from the dock and expand **Lyrics**.
- Audio and albums are stored on the device in IndexedDB and are available offline after the app has cached its files. They do not sync across devices. JSON backups contain groups and prompts, so keep your original audio files.
- Group IDs link local audio to groups. If you replace the group library with a backup or starter presets that omit a custom group, restoring a backup with that group ID makes its music visible again.

## Storage and security
- Personal changes are stored in your browser's `localStorage` **on that device**, not in GitHub. They remain private unless you export and share them.
- Data **does not sync** between devices or browsers.
- Clearing Chrome's site data, uninstalling, or moving devices can erase local changes; periodically export a JSON backup in Library & Backups.
- Importing a backup **replaces** the current library and first asks for confirmation.
- The app makes no external requests and uses no analytics. It is not affiliated with Suno.

## Updating the app
Modify the source files in your GitHub repository to update the app for everyone. Starter data updates won't overwrite saved personal edits by default. The November 2026 Oblivion and Alan Walker Band releases each add a new group with 12 approved styles once to existing saved libraries, retaining all other groups and user changes. An existing local group named Alan Walker Band receives the new presets without being duplicated. Exception: the November 2026 Pillars rebuild replaces the previous three Pillars prompts with 12 new styles once per existing device; the old local Pillars list is backed up to `greenbat-pillars-before-rebuild-2026-11`. The service worker uses a versioned cache; bump the cache version in `service-worker.js` if changing shipped assets.

For a simple desktop preview, run `python3 -m http.server 8000` in this directory, then visit `http://localhost:8000`. Installing as an Android PWA requires HTTPS (GitHub Pages provides it).