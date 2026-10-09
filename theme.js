const THEME_STORAGE_KEY = 'shopifySkinsTheme';

const DEFAULT_THEME = {
  primary: '#B9A3FF',
  secondary: '#FFFFFF',
  text: '#FF61DF',
  accent: '#94FFB2',
  useGradient: false,
};

/**
 * Parse a Slack-style theme string.
 * Example: #B9A3FF,#FFFFFF,#FF61DF,#94FFB2
 * Optional trailing boolean: #B9A3FF,#FFFFFF,#FF61DF,#94FFB2,true
 */
function parseThemeInput(raw) {
  const parts = String(raw || '')
    .trim()
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 4) {
    throw new Error('Theme needs four colours: primary, secondary, text, accent.');
  }

  const [primary, secondary, text, accent, gradientPart] = parts;
  const colours = [primary, secondary, text, accent];

  for (const colour of colours) {
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(colour)) {
      throw new Error(`Invalid colour: ${ colour }`);
    }
  }

  let useGradient = false;
  if (gradientPart !== undefined) {
    const normalised = gradientPart.toLowerCase();
    if (!['true', 'false', '1', '0'].includes(normalised)) {
      throw new Error('Gradient flag must be true or false.');
    }
    useGradient = normalised === 'true' || normalised === '1';
  }

  return {
    primary,
    secondary,
    text,
    accent,
    useGradient,
  };
}

function formatThemeInput(theme) {
  const base = [
    theme.primary,
    theme.secondary,
    theme.text,
    theme.accent,
  ].join(',');

  return theme.useGradient ? `${ base },true` : base;
}

function buildThemeCss(theme) {
  // Placeholder proof of concept — real selectors come next.
  return `
:root {
  --shopify-skins-primary: ${ theme.primary };
  --shopify-skins-secondary: ${ theme.secondary };
  --shopify-skins-text: ${ theme.text };
  --shopify-skins-accent: ${ theme.accent };
  --shopify-skins-use-gradient: ${ theme.useGradient ? '1' : '0' };
}

html {
  background: cyan;
}
`.trim();
}

async function loadTheme() {
  const result = await chrome.storage.sync.get(THEME_STORAGE_KEY);
  return result[THEME_STORAGE_KEY] || DEFAULT_THEME;
}

async function saveTheme(theme) {
  await chrome.storage.sync.set({
    [THEME_STORAGE_KEY]: theme,
  });
}
