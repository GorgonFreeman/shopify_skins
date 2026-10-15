const colourFields = {
  primary: {
    colour: document.getElementById('primaryColour'),
    hex: document.getElementById('primaryHex'),
  },
  secondary: {
    colour: document.getElementById('secondaryColour'),
    hex: document.getElementById('secondaryHex'),
  },
  text: {
    colour: document.getElementById('textColour'),
    hex: document.getElementById('textHex'),
  },
  accent: {
    colour: document.getElementById('accentColour'),
    hex: document.getElementById('accentHex'),
  },
};

const colourSchemeEnabled = document.getElementById('colourSchemeEnabled');
const colourSchemeRow = document.getElementById('colourSchemeRow');
const colourSchemeExpand = document.getElementById('colourSchemeExpand');
const colourSchemeSettings = document.getElementById('colourSchemeSettings');
const useGradient = document.getElementById('useGradient');
const themeInput = document.getElementById('themeInput');
const accessToken = document.getElementById('accessToken');
const themePreviewEnabled = document.getElementById('themePreviewEnabled');
const themePreviewExpand = document.getElementById('themePreviewExpand');
const themePreviewSettings = document.getElementById('themePreviewSettings');
const themeRenameEnabled = document.getElementById('themeRenameEnabled');
const themeRenameRow = document.getElementById('themeRenameRow');
const themeRenameExpand = document.getElementById('themeRenameExpand');
const themeRenameSettings = document.getElementById('themeRenameSettings');
const storeSwitchEnabled = document.getElementById('storeSwitchEnabled');
const storeSwitchRow = document.getElementById('storeSwitchRow');
const storeSwitchExpand = document.getElementById('storeSwitchExpand');
const storeSwitchSettings = document.getElementById('storeSwitchSettings');
const storeSwitchHint = document.getElementById('storeSwitchHint');
const storeSwitchTargets = document.getElementById('storeSwitchTargets');
const exportButton = document.getElementById('exportButton');
const resetButton = document.getElementById('resetButton');
const swatches = document.getElementById('swatches');

const popupParams = new URLSearchParams(location.search);
let activeStoreHandle = popupParams.get('store') || '';

let saveTimer = null;
let settingsTimer = null;
let applyingForm = false;

function normaliseHex(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  const withHash = raw.startsWith('#') ? raw : `#${ raw }`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${ r }${ r }${ g }${ g }${ b }${ b }`.toUpperCase();
  }
  return null;
}

function setFeatureExpanded(expandButton, settingsEl, expanded) {
  if (!expandButton || !settingsEl || settingsEl.classList.contains('is-empty')) {
    return;
  }
  expandButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  settingsEl.hidden = !expanded;
}

function toggleFeatureExpanded(expandButton, settingsEl) {
  const isOpen = expandButton.getAttribute('aria-expanded') === 'true';
  setFeatureExpanded(expandButton, settingsEl, !isOpen);
}

function readThemeFromForm() {
  return {
    primary: colourFields.primary.colour.value.toUpperCase(),
    secondary: colourFields.secondary.colour.value.toUpperCase(),
    text: colourFields.text.colour.value.toUpperCase(),
    accent: colourFields.accent.colour.value.toUpperCase(),
    useGradient: useGradient.checked,
    colourSchemeEnabled: colourSchemeEnabled.checked,
  };
}

function syncColourSchemeUi(enabled) {
  colourSchemeRow.classList.toggle('is-colour-scheme-off', !enabled);
}

function paintPreview(theme) {
  document.documentElement.style.setProperty('--preview-primary', theme.primary);
  document.documentElement.style.setProperty('--preview-secondary', theme.secondary);
  document.documentElement.style.setProperty('--preview-text', theme.text);
  document.documentElement.style.setProperty('--preview-accent', theme.accent);
  swatches.innerHTML = `
    <span class="primary" title="Primary"></span>
    <span class="secondary" title="Secondary"></span>
    <span class="text" title="Text"></span>
    <span class="accent" title="Accent"></span>
  `;
}

function writeThemeToForm(theme) {
  applyingForm = true;
  for (const key of ['primary', 'secondary', 'text', 'accent']) {
    const hex = normaliseHex(theme[key]) || DEFAULT_THEME[key];
    colourFields[key].colour.value = hex.toLowerCase();
    colourFields[key].hex.value = hex.toUpperCase();
  }
  useGradient.checked = Boolean(theme.useGradient);
  colourSchemeEnabled.checked = theme.colourSchemeEnabled !== false;
  themeInput.value = formatThemeInput({
    ...theme,
    useGradient: false,
  });
  paintPreview(theme);
  syncColourSchemeUi(colourSchemeEnabled.checked);
  applyingForm = false;
}

function scheduleSave(theme) {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(async () => {
    try {
      await saveTheme(theme);
    } catch (_error) {
      // Silent — popup stays quiet on save failures.
    }
  }, 80);
}

function applyFromForm() {
  if (applyingForm) {
    return;
  }
  const theme = readThemeFromForm();
  themeInput.value = formatThemeInput({
    ...theme,
    useGradient: false,
  });
  paintPreview(theme);
  syncColourSchemeUi(theme.colourSchemeEnabled !== false);
  scheduleSave(theme);
}

function syncHexFromColour(key) {
  const hex = colourFields[key].colour.value.toUpperCase();
  colourFields[key].hex.value = hex;
  applyFromForm();
}

function syncColourFromHex(key) {
  const hex = normaliseHex(colourFields[key].hex.value);
  if (!hex) {
    return;
  }
  colourFields[key].colour.value = hex.toLowerCase();
  colourFields[key].hex.value = hex;
  applyFromForm();
}

function applyFromSlackPaste() {
  try {
    const parsed = parseThemeInput(themeInput.value);
    parsed.useGradient = useGradient.checked || parsed.useGradient;
    parsed.colourSchemeEnabled = colourSchemeEnabled.checked;
    writeThemeToForm(parsed);
    scheduleSave(parsed);
  } catch (_error) {
    // Invalid paste — leave the previous theme in place.
  }
}

function exportCsv() {
  const theme = readThemeFromForm();
  const csv = formatThemeCsv(theme);
  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'shopify_skins_theme.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function resetTheme() {
  writeThemeToForm(DEFAULT_THEME);
  await saveTheme(DEFAULT_THEME);
}

function syncApiGatedUi() {
  const hasKey = Boolean(accessToken.value.trim());
  themeRenameEnabled.disabled = !hasKey;
  themeRenameRow.classList.toggle('is-enabled', hasKey);
  storeSwitchEnabled.disabled = !hasKey;
  storeSwitchRow.classList.toggle('is-enabled', hasKey);

  if (!hasKey && themeRenameEnabled.checked) {
    themeRenameEnabled.checked = false;
  }
  if (!hasKey && storeSwitchEnabled.checked) {
    storeSwitchEnabled.checked = false;
  }
}

function renderStoreSwitchTargets(settings, storeHandle) {
  const targets = keyedStoreHandles(settings, {
    excludeHandle: storeHandle,
  });
  const switchOn = storeSwitchEnabled.checked;

  storeSwitchTargets.replaceChildren();

  if (!targets.length) {
    storeSwitchHint.textContent = 'Enter API keys on other stores to switch between them.';
    return;
  }

  storeSwitchHint.textContent = switchOn
    ? 'Open the same admin page on another store you\'ve entered an API key for.'
    : 'Turn on Switch stores, then pick a destination.';

  for (const handle of targets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'storeSwitchTarget';
    button.textContent = handle;
    button.title = `Switch to ${ handle }`;
    button.disabled = !switchOn;
    button.addEventListener('click', () => {
      switchToStore(handle);
    });
    storeSwitchTargets.appendChild(button);
  }
}

async function switchToStore(targetStoreHandle) {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'shopifySkinsSwitchStore',
      payload: {
        targetStoreHandle,
        currentStoreHandle: activeStoreHandle,
      },
    });
    if (!result?.ok) {
      storeSwitchHint.textContent = result?.error?.message
        || 'Could not switch stores.';
    }
  } catch (_error) {
    storeSwitchHint.textContent = 'Could not switch stores.';
  }
}

function scheduleSaveSettings() {
  if (settingsTimer) {
    clearTimeout(settingsTimer);
  }
  settingsTimer = setTimeout(async () => {
    const token = accessToken.value.trim();
    await saveTokenForStore(activeStoreHandle, token);

    const settings = await loadSettings();
    const renameOn = Boolean(token) && themeRenameEnabled.checked;
    const switchOn = Boolean(token) && storeSwitchEnabled.checked;
    themeRenameEnabled.checked = renameOn;
    storeSwitchEnabled.checked = switchOn;
    syncApiGatedUi();
    renderStoreSwitchTargets(settings, activeStoreHandle);

    await saveSettings({
      ...settings,
      themePreviewEnabled: themePreviewEnabled.checked,
      themeRenameEnabled: renameOn,
      storeSwitchEnabled: switchOn,
    });
  }, 120);
}

async function resolveActiveStoreHandle() {
  if (activeStoreHandle) {
    return activeStoreHandle;
  }

  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = tabs?.[0]?.url || '';
    const match = url.match(/admin\.shopify\.com\/store\/([^/?#]+)/);
    if (match) {
      activeStoreHandle = match[1];
    }
  } catch (_error) {
    // Popup may be a detached window without tab access.
  }

  return activeStoreHandle;
}

for (const key of Object.keys(colourFields)) {
  colourFields[key].colour.addEventListener('input', () => syncHexFromColour(key));
  colourFields[key].hex.addEventListener('change', () => syncColourFromHex(key));
  colourFields[key].hex.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      syncColourFromHex(key);
    }
  });
}

colourSchemeEnabled.addEventListener('change', applyFromForm);
colourSchemeExpand.addEventListener('click', () => {
  toggleFeatureExpanded(colourSchemeExpand, colourSchemeSettings);
});
themePreviewExpand.addEventListener('click', () => {
  toggleFeatureExpanded(themePreviewExpand, themePreviewSettings);
});
themeRenameExpand.addEventListener('click', () => {
  toggleFeatureExpanded(themeRenameExpand, themeRenameSettings);
});
storeSwitchExpand.addEventListener('click', () => {
  toggleFeatureExpanded(storeSwitchExpand, storeSwitchSettings);
});
useGradient.addEventListener('change', applyFromForm);
themeInput.addEventListener('change', applyFromSlackPaste);
themeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    applyFromSlackPaste();
  }
});
exportButton.addEventListener('click', exportCsv);
resetButton.addEventListener('click', resetTheme);
accessToken.addEventListener('change', () => {
  syncApiGatedUi();
  scheduleSaveSettings();
});
accessToken.addEventListener('input', () => {
  syncApiGatedUi();
  scheduleSaveSettings();
});
themePreviewEnabled.addEventListener('change', scheduleSaveSettings);
themeRenameEnabled.addEventListener('change', scheduleSaveSettings);
storeSwitchEnabled.addEventListener('change', async () => {
  try {
    const settings = await loadSettings();
    renderStoreSwitchTargets(settings, activeStoreHandle);
  } catch (_error) {
    // Keep previous target list if settings reload fails.
  }
  scheduleSaveSettings();
});

async function hydrate() {
  const storeHandle = await resolveActiveStoreHandle();
  const [theme, settings] = await Promise.all([
    loadTheme(),
    loadSettings(),
  ]);
  writeThemeToForm(theme);
  accessToken.value = tokenForStore(settings, storeHandle) || '';
  const hasKey = Boolean(accessToken.value.trim());
  themePreviewEnabled.checked = settings.themePreviewEnabled === true;
  themeRenameEnabled.checked = hasKey && settings.themeRenameEnabled === true;
  storeSwitchEnabled.checked = hasKey && settings.storeSwitchEnabled === true;
  syncApiGatedUi();
  renderStoreSwitchTargets(settings, storeHandle);

  if (popupParams.get('focus') === 'token') {
    accessToken.focus();
    accessToken.select();
  }
}

hydrate();
