# Green Bat Music — Streaming Android player setup

The Android app keeps the existing Underground Record Vault interface and adds
remote audio streaming, automatic catalog refresh, and administrator-only song
and album updates. This is a personal, shareable Android **test APK**. It is
not published in Google Play.

## What is implemented

- Music groups, album artwork, lyrics, playlists and the turntable player are
  kept from the existing Green Bat Music library branch.
- Tracks stored on Cloudflare R2 are streamed over HTTPS, not downloaded for
  offline listening. The catalog syncs on open, on resume, on reconnection,
  and while the player stays open (about every 90 seconds).
- Anyone with the APK can listen to the public streaming catalog, without
  signing in. Only the owner with a secret administrator key may upload songs
  or create/edit/delete cloud albums and tracks.
- Previous songs uploaded in the PWA are still device-local. They are NOT
  automatically transferred to cloud storage. Re-upload those audio files
  after connecting the backend. Prompt editing remains device-local.

## 1. Provision cloud audio storage

A Cloudflare account is required. GitHub Actions build the APK; GitHub
itself is NOT used to serve audio. Do not put MP3, WAV, FLAC, M4A or private
credentials into a public GitHub repository.

1. Create an R2 bucket named `green-bat-music` in the Cloudflare dashboard
   (Standard storage). Note R2 may require billing activation even if
   usage stays within the free allowance.
2. In a trusted local terminal or Cloudflare-supported development
   environment, copy `worker/wrangler.toml.example` to
   `worker/wrangler.toml`.
3. From the `worker/` directory, run `npx wrangler login`.
4. Run `npx wrangler secret put ADMIN_TOKEN` and supply a unique random
   secret of at least 32 characters. Do not paste it into chat, GitHub,
   source code, workflow logs or the APK.
5. Run `npx wrangler deploy` to deploy the R2 streaming Worker. Save its
   HTTPS URL (for example `https://green-bat-music.account.workers.dev`).
6. Confirm `https://YOUR-WORKER/health` returns `{"ok":true}` and
   `https://YOUR-WORKER/library` returns an empty `tracks` and
   `albums` catalog.

The Worker enforces administrator authorization and generates audio IDs.
The public audio endpoint supports HTTP range requests for playback and
seeking. Upload limit: 50 MB per song. MP3 and M4A are recommended for mobile
streaming. Do not share administrator credentials with listeners.

**Security note:** This first version provides a public listening catalog:
anyone knowing the Worker URL could stream the hosted tracks. Private
per-listener authentication is not implemented. The R2 bucket itself should
remain private and accessible only through the Worker.

## 2. Connect the Vault to the Worker

Edit `cloud-config.js` in the development branch to set:

```js
window.GREEN_BAT_CLOUD_CONFIG = {
  endpoint: 'https://YOUR-WORKER-URL.workers.dev'
};
```

No secret belongs in this file. The URL must use HTTPS. Build the APK
again after setting the URL. On the catalog page, tap **Admin sign-in**
and enter the administrator key. Songs uploaded after that will appear
for all listeners when their app refreshes. Friends do not need the key.

## 3. Build and download the shareable APK

The workflow `.github/workflows/android-apk.yml` builds an Android
debug APK on GitHub's standard Linux hosted runner and uploads it as an
Actions artifact named `green-bat-music-test-apk`.

1. Open the repository **Actions** tab.
2. Open **Green Bat Music Android APK**.
3. Select the latest successful run on the development branch.
4. Under **Artifacts**, download `green-bat-music-test-apk` and unzip it.
5. Transfer `app-debug.apk` to the Android phone and install it. Android
   may prompt you to allow installs from that source.

**Important:** The debug APK is for testing and personal sharing, not
production distribution. Fresh GitHub runners may sign builds with
different debug keys, which can prevent an APK from updating an already
installed copy. Before distributing broadly, add a safely stored signing
keystore and configure a release-signed workflow so updates keep the same
signature. Never commit a release keystore or its password.

The app itself can update its shared music catalog without new APK builds.
Changes to its installed Android code require a new APK.

## Costs

GitHub's standard GitHub-hosted runners are currently free for public
repositories. The existing repository remains public; nothing in this
setup changes GitHub billing allowances. Cloudflare R2 has a Standard
storage free allowance and free internet egress, subject to current
account and request limits. Configure Cloudflare billing alerts yourself
before uploading the full catalog. No cloud resources or subscriptions
are provisioned by committing this code.

## Checks / limitations

- `npm run check` verifies JavaScript syntax.
- `npm test` exercises catalog reads, administrator protection, uploads,
  stream range requests, metadata updates and deletes with an R2 stub.
- `npm run build:web` stages the existing web graphics for Capacitor.
- Full Android device testing and live Cloudflare upload/stream tests
  require the deployed Worker and an Android device.
- A shared cloud catalog does not synchronize device-local favorites,
  prompt edits or previously uploaded audio files.
