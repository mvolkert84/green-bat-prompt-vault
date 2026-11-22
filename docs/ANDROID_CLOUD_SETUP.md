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

## 1. Connect your Cloudflare account — easiest dashboard method

You do not need to install a terminal, share credentials, or raise your
GitHub Actions budget. Cloudflare Workers Builds supports direct GitHub
integration.

1. In [Cloudflare R2](https://dash.cloudflare.com/?to=/:account/r2),
   create a **Standard** storage bucket named `green-bat-music`.
   Keep the bucket PRIVATE (no public bucket URL). R2 may require billing
   activation, even if usage remains inside its free allowance; review the
   dashboard's billing and alerts before enabling it.
2. Open **Workers & Pages → Create application → GitHub** (the interface
   may call this `Import a repository`). Authorize your GitHub account
   in Cloudflare if prompted.
3. Select **`mvolkert84/green-bat-prompt-vault`** and set:
   - Worker name: **`green-bat-music-cloud`**
   - Production branch: **`feature/green-bat-cloud-apk-2026-11`**
   - Root directory: **`worker`**
   - Build command: leave empty
   - Deploy command: **`npx wrangler deploy`**
   - Worker configuration: existing `worker/wrangler.toml` (contains
     R2 binding `MUSIC_BUCKET` to `green-bat-music`)
4. Select **Save and Deploy**. Note the generated HTTPS
   `https://green-bat-music-cloud.<your-subdomain>.workers.dev` URL.
   Creating the Worker does not automatically upload songs.
5. Under **Workers & Pages → green-bat-music-cloud →
   Settings → Variables and Secrets**, create a **Secret** named
   `ADMIN_TOKEN` with a new random value of at least 32 characters.
   Keep it in your password manager. Do not paste it into chat, GitHub
   source files, build settings, or screenshots.
6. Check the public URL's `/health` endpoint returns
   `{"ok":true}` and `/library` returns a JSON library with empty
   `tracks` and `albums` arrays. If `/health` returns an error,
   inspect the Worker build logs and R2 binding before proceeding.

Cloudflare Git integration deploys changes to the configured production
branch. Cloudflare's dashboard may require a slightly different sequence
or labels. The Worker name must match the `name` in Wrangler config.

**After deployment:** Share only the public `workers.dev` URL with
the developer so they can add it to `cloud-config.js` and rebuild
the APK. Never share the `ADMIN_TOKEN` secret.

### Alternative: manual Wrangler deployment

From `worker/`, run `npx wrangler login`, then
`npx wrangler deploy`. To add the administrator key use
`npx wrangler secret put ADMIN_TOKEN` and enter the value privately.
The tracked `worker/wrangler.toml` file is already configured.

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
