(() => {
  const STYLE_ID = 'shopify-skins-style';
  let applyTimer = null;
  let lastTheme = DEFAULT_THEME;

  function ensureStyleElement() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
    }

    const head = document.head || document.documentElement;
    if (style.parentNode !== head) {
      head.appendChild(style);
    } else if (head.lastChild !== style) {
      head.appendChild(style);
    }

    return style;
  }

  function removeStyleElement() {
    const style = document.getElementById(STYLE_ID);
    if (style) {
      style.remove();
    }
  }

  function clearPaint(theme) {
    removeStyleElement();
    clearPolarisVarsInDocument(theme);
    document.documentElement.removeAttribute('data-shopify-skins');
  }

  function paint(theme) {
    lastTheme = theme;

    if (theme.colourSchemeEnabled === false) {
      clearPaint(theme);
      return;
    }

    const style = ensureStyleElement();
    style.textContent = buildThemeCss(theme);
    applyPolarisVarsInDocument(theme);
    document.documentElement.setAttribute('data-shopify-skins', 'active');
  }

  function scheduleApply(theme) {
    if (applyTimer) {
      clearTimeout(applyTimer);
    }
    applyTimer = setTimeout(() => {
      paint(theme);
    }, 50);
  }

  async function applyTheme() {
    let theme = DEFAULT_THEME;
    try {
      theme = await loadTheme();
    } catch (error) {
      console.log('shopifySkinsLoadThemeError', error);
    }
    paint(theme);
  }

  // Only paint immediately if we don't yet know preferences;
  // loadTheme will correct once storage resolves.
  applyTheme();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTheme, {
      once: true,
    });
  }

  window.addEventListener('load', applyTheme, {
    once: true,
  });

  const observer = new MutationObserver(() => {
    if (lastTheme.colourSchemeEnabled === false) {
      return;
    }
    scheduleApply(lastTheme);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'data-polaris-custom-properties', 'p-color-scheme'],
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }
    if (changes[THEME_STORAGE_KEY]) {
      applyTheme();
    }
  });
})();
