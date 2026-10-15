const SETTINGS_STORAGE_KEY = 'shopifySkinsSettings';

const DEFAULT_SETTINGS = {
  // Legacy single token (migrated into accessTokensByStore on read).
  accessToken: '',
  accessTokensByStore: {},
  themePreviewEnabled: false,
  themeRenameEnabled: false,
  storeSwitchEnabled: false,
};

async function loadSettings() {
  const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const stored = result[SETTINGS_STORAGE_KEY] || {};
  const accessTokensByStore = {
    ...(stored.accessTokensByStore || {}),
  };

  // One-time migration from the old single-token field.
  if (stored.accessToken && typeof stored.accessToken === 'string') {
    const legacy = stored.accessToken.trim();
    if (legacy && !Object.keys(accessTokensByStore).length) {
      accessTokensByStore._default = legacy;
    }
  }

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    accessTokensByStore,
  };
}

async function saveSettings(settings) {
  const next = {
    ...DEFAULT_SETTINGS,
    ...settings,
    accessTokensByStore: {
      ...(settings.accessTokensByStore || {}),
    },
  };

  // Prefer the map; clear legacy field once we have store tokens.
  if (Object.keys(next.accessTokensByStore).length) {
    next.accessToken = '';
  }

  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: next,
  });
}

function tokenForStore(settings, storeHandle) {
  const map = settings.accessTokensByStore || {};
  const handle = String(storeHandle || '').trim();
  if (handle && map[handle]) {
    return String(map[handle]).trim();
  }
  if (map._default) {
    return String(map._default).trim();
  }
  return String(settings.accessToken || '').trim();
}

function hasKeyedTokenForStore(settings, storeHandle) {
  const map = settings.accessTokensByStore || {};
  const handle = String(storeHandle || '').trim();
  return Boolean(handle && String(map[handle] || '').trim());
}

function keyedStoreHandles(settings, {
  excludeHandle = '',
} = {}) {
  const map = settings?.accessTokensByStore || {};
  const exclude = String(excludeHandle || '').trim();
  return Object.keys(map)
    .filter((key) => key && key !== '_default')
    .filter((key) => Boolean(String(map[key] || '').trim()))
    .filter((key) => key !== exclude)
    .sort((a, b) => a.localeCompare(b));
}

async function saveTokenForStore(storeHandle, accessToken) {
  const settings = await loadSettings();
  const handle = String(storeHandle || '').trim();
  const token = String(accessToken || '').trim();
  const accessTokensByStore = {
    ...(settings.accessTokensByStore || {}),
  };

  if (handle) {
    if (token) {
      accessTokensByStore[handle] = token;
    } else {
      delete accessTokensByStore[handle];
    }
  } else if (token) {
    accessTokensByStore._default = token;
  }

  await saveSettings({
    ...settings,
    accessTokensByStore,
  });
}
