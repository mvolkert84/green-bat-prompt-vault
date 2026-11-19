# Green Bat Prompt Vault — Underground Record Vault (v3)

## Locked design direction
The user-selected **Underground Record Vault** mockup is the visual reference for this private Suno style prompt library. The purpose remains instant retrieval and copying of style prompts. The design should evoke a collectible vinyl archive, not a generic productivity dashboard.

### Visual vocabulary
- Deep black / warm charcoal, walnut-like dark surfaces, muted emerald highlights, and antique brass details.
- Record sleeve artwork cards for groups, worn paper and edge textures, subtle concentric vinyl-groove patterning.
- Editorial/serif display headlines with clear sans-serif labels and readable functional text.
- Record crate details on group pages and modular rack/track-inspired prompt soundboards.
- Subdued lighting and restrained effects. No heavy animation or decorative interaction blocking use.

### Screen structure
1. **Vault home:** actual Green Bat Music logo in header, "Green Bat Prompt Vault", "Every sound. One vault.", Music Groups/Favorites actions, search, compact two-column sleeves on phone, larger responsive grid on Chromebook/desktop.
2. **Artist crate:** chosen sleeve artwork, band name, genre/description, prompt count, actual category filtering, search, edit group and cover.
3. **Style Prompt Soundboard:** each saved prompt shows an ornamental record label/disc, category, title, short preview, favorite, **View** (expands text), **Edit**, and conspicuous **Copy**. No audio playback exists: do not render fake working play buttons.
4. **Favorites:** same track modules and one-tap copying.
5. **Editing and backups:** keep add/edit/remove of groups and prompts, artwork upload/removal, JSON import/export, 1000-character Suno prompt limit and local-first behavior.

### Functionality to preserve
- Keep the `greenbat-prompt-vault-v2` localStorage key and existing library data schema. Never silently reset saved data during UI upgrades.
- Default seed includes the established eight music groups and 39 reconstructed starter prompts.
- Uploaded group artwork stays user-supplied. Uncustomized groups get CSS-designed placeholder sleeves; don't misrepresent placeholder graphics as actual band cover art.
- Copy controls copy the actual full prompt text, not abbreviated preview text.
- Browser/installable PWA works on Android, Chromebook, and desktop. Offline pages and CSS should refresh reliably via a versioned network-first app cache.
- Keyboard accessibility, focus outlines, reduced-motion preference and readable contrast remain supported.

## Implementation location
The design is implemented through `record-vault.css` and home/group/prompt rendering in `app.js`, while retaining forms, actions, storage and backups. Existing `styles.css` remains as a base layer for continuity.
