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
const useGradient = document.getElementById('useGradient');
const themeInput = document.getElementById('themeInput');
const accessToken = document.getElementById('accessToken');
const mineralUrl = document.getElementById('mineralUrl');
const exportButton = document.getElementById('exportButton');
const resetButton = document.getElementById('resetButton');
const status = document.getElementById('status');
const swatches = document.getElementById('swatches');
const popup = document.querySelector('.popup');

let saveTimer = null;
let settingsTimer = null;
let applyingForm = false;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status${ kind ? ` ${ kind }` : '' }`;
}

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
  popup.classList.toggle('is-colour-scheme-off', !enabled);
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
      setStatus(
        theme.colourSchemeEnabled === false
          ? 'Colour scheme off.'
          : 'Live on admin.',
        'ok',
      );
    } catch (error) {
      setStatus(error.message || 'Could not save theme.', 'error');
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
    setStatus(`Invalid ${ key } colour.`, 'error');
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
    writeThemeToForm(parsed);
    scheduleSave(parsed);
    setStatus('Imported Slack theme.', 'ok');
  } catch (error) {
    setStatus(error.message || 'Could not parse theme.', 'error');
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
  setStatus('CSV exported.', 'ok');
}

async function resetTheme() {
  writeThemeToForm(DEFAULT_THEME);
  await saveTheme(DEFAULT_THEME);
  setStatus('Reset to default.', 'ok');
}

function scheduleSaveSettings() {
  if (settingsTimer) {
    clearTimeout(settingsTimer);
  }
  settingsTimer = setTimeout(async () => {
    await saveSettings({
      accessToken: accessToken.value.trim(),
      mineralUrl: mineralUrl.value.trim() || DEFAULT_SETTINGS.mineralUrl,
    });
    setStatus('Rename settings saved locally.', 'ok');
  }, 120);
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
useGradient.addEventListener('change', applyFromForm);
themeInput.addEventListener('change', applyFromSlackPaste);
themeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    applyFromSlackPaste();
  }
});
exportButton.addEventListener('click', exportCsv);
resetButton.addEventListener('click', resetTheme);
accessToken.addEventListener('change', scheduleSaveSettings);
accessToken.addEventListener('input', scheduleSaveSettings);
mineralUrl.addEventListener('change', scheduleSaveSettings);
mineralUrl.addEventListener('input', scheduleSaveSettings);

async function hydrate() {
  const [theme, settings] = await Promise.all([
    loadTheme(),
    loadSettings(),
  ]);
  writeThemeToForm(theme);
  accessToken.value = settings.accessToken || '';
  mineralUrl.value = settings.mineralUrl || DEFAULT_SETTINGS.mineralUrl;
  setStatus('Live on admin.', 'ok');
}

hydrate();
