# Chrome Web Store listing — Shopify Skins

Use these fields in https://chrome.google.com/webstore/devconsole  
Account: **johntheshopifydeveloper@gmail.com**

## Item

- **Name:** Shopify Skins
- **Summary (132 chars max):** Slack-style colour themes for Shopify admin, plus optional theme preview and Admin API rename.
- **Category:** Productivity (or Developer Tools)
- **Language:** English

## Description

```
Shopify Skins lets you restyle the Shopify admin with Slack-style colour themes, preview unpublished themes, and optionally rename themes from the Themes library.

Colour themes
• Paste a Slack theme string or pick primary, secondary, text, and accent colours
• Toggle the colour scheme on or off without losing your palette
• Changes apply live on admin.shopify.com
• Export your palette as CSV

Preview themes (optional)
• Enable “Preview themes” in the popup (no API key)
• On Online Store → Themes, click the eye next to a theme name
• Opens the storefront with ?preview_theme_id= for that theme

Theme rename (optional)
• Enter a Shopify Admin API access token in the popup
• Enable “Renaming themes”
• On Online Store → Themes, click the pencil next to a theme name
• Rename in a popover; the extension calls Shopify’s themeUpdate GraphQL API for that shop only

Your API token stays in chrome.storage.local and is only sent to your own {shop}.myshopify.com Admin API when renaming.

Open source: https://github.com/GorgonFreeman/shopify_skins
```

## Privacy

- **Single purpose:** Customise Shopify admin colours; optional theme preview links; optional theme rename with a merchant API key.
- **Privacy policy URL:** https://github.com/GorgonFreeman/shopify_skins/blob/main/PRIVACY.md
- **Permission justifications:**
  - `storage` — save colour theme and optional API tokens
  - `tabs` — read active admin tab URL to bind tokens to a store
  - Host `*.myshopify.com` — Admin GraphQL for theme rename only; open storefront preview URLs
  - Content scripts — apply CSS vars on admin; preview eye + rename pencil on themes iframe

## Package

Upload: `dist/shopify_skins.zip` (or rebuild with `npm run pack`)

## Screenshots (required)

Add at least 1 screenshot (1280×800 or 640×400). Capture:
1. Popup with colour scheme accordion on a themed admin page
2. Themes library with preview eye / rename pencil
