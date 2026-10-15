# Shopify Skins

Chrome extension that applies custom Slack-style colour themes to the Shopify admin, plus optional theme preview and Admin API rename.

**Public repo:** https://github.com/GorgonFreeman/shopify_skins  
**Releases:** https://github.com/GorgonFreeman/shopify_skins/releases

## Install as a custom extension

Chrome does not install arbitrary `.zip` / `.crx` sideloads the way it used to. Load the extension unpacked instead:

### From this repo

1. Clone or download the repo and keep the folder somewhere permanent
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select this project folder (the one that contains `manifest.json`)

Or from the repo root:

```bash
./install.sh
```

That opens the folder and `chrome://extensions` so you can **Load unpacked**.

### From a GitHub release

1. Download `shopify_skins.zip` from the [latest release](https://github.com/GorgonFreeman/shopify_skins/releases/latest)
2. Unzip it somewhere permanent
3. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the unzipped folder

After code changes: click **Reload** on the extension card, then hard-refresh Shopify admin tabs.

## Theme colours

Paste a Slack theme string in the popup:

```text
#B9A3FF,#FFFFFF,#FF61DF,#94FFB2
```

Mapped as **primary**, **secondary**, **text**, **accent**. Colour pickers update the admin live. Use **Colour scheme** to turn styling off without losing your palette. Export CSV from the popup when you want a snapshot.

## Preview themes

1. In the popup under **No API key needed**, turn on **Preview themes**.
2. Open **Online Store → Themes**.
3. Click the eye next to a theme name — opens
   `https://{store}.myshopify.com/?preview_theme_id={id}` in a new tab.

## Theme rename

1. In the popup under **Requires API key**, paste a Shopify Admin API key (`shpat_…`) with theme write access.
2. Turn on **Renaming themes** (greyed out until a key is entered).
3. Open **Online Store → Themes**. The themes UI loads in Shopify’s
   `online-store-web` iframe — pencils appear on theme titles there.
4. Click the pencil → rename in the popover → Save / Enter.
   Preview eye and rename pencil use your accent colour, or teal when the colour scheme is off.

Rename calls Shopify GraphQL `themeUpdate` directly (`STORE_HANDLE` from the admin URL + your key). The key is stored in `chrome.storage.local` only.

Note: Shopify may require a `write_themes` exemption for `themeUpdate` on some apps.

## Colour scheme architecture

- `theme_storage.js` — palette model + chrome.storage load/save
- `colour_scheme.js` — `ColourScheme.apply()` / `ColourScheme.unapply()` / `ColourScheme.sync()`
- `content.js` — listens for storage + DOM remounts and calls `sync()`
- `utils.js` — `gidToId`, shared DOM helpers, `ThemeActions` plugin host
- `preview.js` — theme preview eye buttons
- `rename.js` — rename pencils + popover (also on `online-store-web.shopifyapps.com`)

Toggle **Colour scheme** in the popup to apply/unapply live. From an admin console you can also run `shopifySkinsApply()` / `shopifySkinsUnapply()`.

## Chrome Web Store zip

Build the zip Google’s developer console expects (`manifest.json` at the zip root, no git/dev junk):

```bash
npm run pack
```

Output: `dist/shopify_skins.zip` — upload that file in the Chrome Web Store listing (or attach it to a GitHub release).

`npm run pack:chrome` is the same command.

## Privacy

- Colour themes are stored in `chrome.storage.sync`
- Optional Admin API keys are stored in `chrome.storage.local` (per store when possible)
- No analytics. Keys are only sent to the merchant’s own `{shop}.myshopify.com` Admin GraphQL API when renaming themes
