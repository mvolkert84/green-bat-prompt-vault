# Green Bat Music — Chromebook & browser player

The **same** Green Bat Music project serves two clients:
- **Chromebook / desktop:** Cloudflare Pages-hosted installable PWA.
- **Android phones:** signed APK created by the GitHub Actions workflow.

Both clients request the same public streaming catalog and audio from:
`https://green-bat-prompt-vault.mvolkert84.workers.dev`.

Cloudflare Pages hosts the web interface, **not** the audio files. The existing
R2 bucket `green-bat-music` and Worker `green-bat-prompt-vault` remain
unchanged. Do **not** modify the existing Worker or its R2 configuration while
creating the Pages site.

## First deployment — Cloudflare Pages

In your Cloudflare account:

1. Go to **Compute (Workers) → Workers & Pages → Create application → Pages
   → Connect to Git**. Pick **Pages**, not another Worker or Worker KV.
2. Authorize GitHub if requested, and select your existing repository:
   `mvolkert84/green-bat-prompt-vault`. No new repository is necessary.
3. Configure the new **Pages** project with these values:

   | Field | Value |
   | --- | --- |
   | Project name | `green-bat-music-player` (if available) |
   | Production branch | `feature/green-bat-cloud-apk-2026-11` |
   | Framework preset | None |
   | Root directory | leave empty / repository root (NOT `worker`) |
   | Build command | `npm run build:web` |
   | Build output directory | `www` |
   | Environment variables | none required |

   The project name is only a suggestion; Cloudflare assigns the actual
   `pages.dev` address. Do not assume any address until deployment succeeds.
4. Select **Save and Deploy**. You should get a site hosted at an actual
   `https://<project>.pages.dev` address (Cloudflare displays it).
5. Open that exact site in Chromebook Chrome. The **Green Bat Music**
   underground record-store interface should load.
6. Open a group. If the Worker is reachable, its music section should say
   **Streaming library · automatically synced**; an empty playlist is
   expected until audio is uploaded to the Worker/R2 bucket.

## Install as a Chromebook app

1. Open the deployed `pages.dev` URL in Chrome.
2. Chrome menu **⋮ → Cast, save, and share → Install page as app**. If an
   Install icon is available in the address bar, that also works.
3. Name or accept **Green Bat Music**. ChromeOS adds it to the Launcher.
4. Launch it from the Chromebook Launcher like another application.

The web app requires internet access to stream songs, because we did not add
offline song downloads. Its web interface may cache for convenience, but no
cloud audio files are deliberately downloaded for offline playback.

## Cloud syncing across devices

- Upload a track as administrator from **either** Chromebook PWA or Android
  player. It is saved to the **same** R2 bucket.
- Both clients refresh the catalog on opening, when returning to the app,
  on network reconnection, and periodically while open (about 90 seconds).
- Lyrics and album metadata in the shared cloud catalog follow the track.
- Existing device-local songs (IndexedDB), prompt edits, and local favorites
  are **not** synchronized across devices by this implementation.
- The shared library is **public to anyone who knows the Worker URL**;
  do not upload recordings you aren't ready to make accessible online.
- The `ADMIN_TOKEN` is a **Cloudflare Worker secret**, not a Cloudflare
  Pages secret. Keep it out of both GitHub and the APK.

## Android builds

The repository's **Green Bat Music Android APK** GitHub Actions workflow
still produces a test APK; a new APK is needed only when the Android app
itself changes. Uploading a new song does not require a new APK.

## Deployments / safety

- The Pages production branch above is a **development branch**, leaving
  GitHub `main` and the current GitHub Pages Vault unchanged.
- Pages and Workers are **different Cloudflare applications** using one
  GitHub repository. The Worker root is `worker`; the Pages root is the
  repository root.
- Build commands are source-only and do not alter your R2 bucket or
  Cloudflare billing configuration.
- Review Cloudflare's current free tier and usage settings in your account.

## Verification checklist

- Pages site loads with HTTP 200 and the Green Bat Music icon.
- Browser dev console shows no failed application scripts.
- `/manifest.webmanifest` and `/service-worker.js` are accessible.
- A group opens and the streaming catalog loads from the Worker.
- Upload one small MP3 after private admin authentication.
- Verify its album, lyrics (if available), and audio playback on Chromebook
  and then on Android.
