# Shopify Skins

Chrome extension that applies custom Slack-style colour themes to the Shopify admin (`https://admin.shopify.com/store/*`).

## Theme input

Paste a Slack theme string:

```text
#B9A3FF,#FFFFFF,#FF61DF,#94FFB2
```

Mapped as **primary**, **secondary**, **text**, **accent**. Use the popup checkbox (or append `,true`) for gradient mode.

## Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder
4. Open any Shopify admin store page and click the extension icon to set a theme

## Current status

Scaffold only. Injected CSS is a proof of concept:

```css
html {
  background: cyan;
}
```

Theme values are stored and exposed as CSS variables for upcoming selectors.
