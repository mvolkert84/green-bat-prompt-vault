# Green Bat Prompt Vault

The Underground Record Vault redesign uses the approved mobile mockup as its visual reference. The first four home sleeves and the crate materials come from the reference. The vinyl record and four additional default sleeves were generated for this redesign. The header uses the existing Green Bat artwork arranged horizontally.

The crate uses a rear stack and transparent foreground rails with an interchangeable artwork layer between them. The foreground includes the walnut and brass hardware. Saved cover uploads take priority over default art and are fitted inside the sleeve opening. Default assets live in `assets/vault` as 18 WebP files totaling about 371 KiB. The service worker precaches them for offline use.

The mobile library uses two columns. Wider screens show three or four columns and place the crate beside the group soundboard. Prompt rows keep category, favorite and full-text Copy controls visible. A chevron opens the prompt and its edit action.

The storage key remains `greenbat-prompt-vault-v2`. The existing data schema, starter library, artwork uploads, JSON backups and PWA app identity carry forward.

## Verification

Playwright Chromium captured the home and Vertigo screens at 393 × 852 with mobile touch emulation and at 1366 × 900. The mobile captures were compared to the reference. The reference prompt names and category chips are illustrative. The running app shows the saved library's real names, category chips and counts. Browser chrome, device bezels and the setting outside the phones belong to the reference presentation.

Browser checks covered search, category filtering, prompt expansion, full-text clipboard copying, prompt creation and editing, favorites, group creation and editing with artwork, JSON export and import, persisted changes across reload, and successful offline rendering with the cached crate and sleeve graphics.
