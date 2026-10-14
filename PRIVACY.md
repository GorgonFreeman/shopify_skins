# Privacy Policy — Shopify Skins

**Publisher contact:** johntheshopifydeveloper@gmail.com  
**Last updated:** 14 October 2026

Shopify Skins is a Chrome extension that customises the look of the Shopify admin and optionally renames themes via the Shopify Admin API.

## Data we store

- **Colour theme settings** (palette colours, gradient flag, colour-scheme on/off) are stored in `chrome.storage.sync` so they can sync with your Chrome profile.
- **Optional Shopify Admin API access tokens** are stored in `chrome.storage.local`, keyed by store when possible. Tokens never leave your browser except as described below.

## Data we transmit

- If you enable theme renaming and enter an API key, rename requests are sent only to your shop’s Shopify Admin GraphQL endpoint (`https://{store}.myshopify.com/admin/api/...`) with that key.
- We do not operate a backend for this extension. We do not sell, rent, or use your data for advertising.

## Data we do not collect

- No analytics SDKs
- No third-party trackers
- No account system of our own

## Permissions

- `storage` — save theme and optional API key settings
- `tabs` — detect the active admin store when saving a token / opening the popup
- Host access to `*.myshopify.com` — call the Admin API for theme rename only when you use that feature
- Content scripts on `admin.shopify.com` and `online-store-web.shopifyapps.com` — apply colours and show rename UI

## Contact

Questions about this policy: **johntheshopifydeveloper@gmail.com**
