(() => {
  let applyTimer = null;
  let lastTheme = DEFAULT_THEME;

  function runSync(theme) {
    lastTheme = {
      ...DEFAULT_THEME,
      ...(theme || {}),
    };
    return ColourScheme.sync(lastTheme);
  }

  function scheduleSync(theme) {
    if (applyTimer) {
      clearTimeout(applyTimer);
    }
    applyTimer = setTimeout(() => {
      runSync(theme);
    }, 50);
  }

  async function syncFromStorage() {
    let theme = DEFAULT_THEME;
    try {
      theme = await loadTheme();
    } catch (error) {
      console.log('shopifySkinsLoadThemeError', error);
    }
    runSync(theme);
  }

  // Public-ish helpers for debugging from the page console:
  //   window.shopifySkinsApply() / window.shopifySkinsUnapply()
  window.shopifySkinsApply = async () => {
    const theme = {
      ...(await loadTheme()),
      colourSchemeEnabled: true,
    };
    await saveTheme(theme);
    return runSync(theme);
  };

  window.shopifySkinsUnapply = async () => {
    const theme = {
      ...(await loadTheme()),
      colourSchemeEnabled: false,
    };
    await saveTheme(theme);
    return runSync(theme);
  };

  syncFromStorage();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncFromStorage, {
      once: true,
    });
  }

  window.addEventListener('load', syncFromStorage, {
    once: true,
  });

  const observer = new MutationObserver(() => {
    if (ColourScheme.isBusyApplying()) {
      return;
    }
    if (lastTheme.colourSchemeEnabled === false) {
      // Keep unapplied even if Polaris remounts marked nodes.
      if (ColourScheme.isApplied()) {
        ColourScheme.unapply(lastTheme);
      }
      return;
    }
    scheduleSync(lastTheme);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }
    if (changes[THEME_STORAGE_KEY]) {
      syncFromStorage();
    }
  });
})();
