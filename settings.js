const SETTINGS_STORAGE_KEY = 'shopifySkinsSettings';

const DEFAULT_SETTINGS = {
  accessToken: '',
  mineralUrl: 'http://127.0.0.1:8000',
};

async function loadSettings() {
  const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[SETTINGS_STORAGE_KEY] || {}),
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: {
      ...DEFAULT_SETTINGS,
      ...settings,
    },
  });
}
