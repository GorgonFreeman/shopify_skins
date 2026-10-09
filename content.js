(() => {
  const STYLE_ID = 'shopify-skins-style';

  function ensureStyleElement() {
    let style = document.getElementById(STYLE_ID);
    if (style) {
      return style;
    }

    style = document.createElement('style');
    style.id = STYLE_ID;
    (document.documentElement || document.head || document).appendChild(style);
    return style;
  }

  async function applyTheme() {
    const theme = await loadTheme();
    const style = ensureStyleElement();
    style.textContent = buildThemeCss(theme);
  }

  applyTheme();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }
    if (changes[THEME_STORAGE_KEY]) {
      applyTheme();
    }
  });
})();
