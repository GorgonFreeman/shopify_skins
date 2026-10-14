const THEME_STORAGE_KEY = 'shopifySkinsTheme';

const DEFAULT_THEME = {
  primary: '#B9A3FF',
  secondary: '#FFFFFF',
  text: '#FF61DF',
  accent: '#94FFB2',
  useGradient: false,
  colourSchemeEnabled: true,
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

function formatThemeCsv(theme) {
  const header = 'primary,secondary,text,accent,use_gradient';
  const row = [
    theme.primary,
    theme.secondary,
    theme.text,
    theme.accent,
    theme.useGradient ? 'true' : 'false',
  ].join(',');
  return `${ header }\n${ row }\n`;
}

function mix(a, b, amountA) {
  return `color-mix(in srgb, ${ a } ${ amountA }%, ${ b })`;
}

function getPolarisVarEntries(theme) {
  const {
    primary,
    secondary,
    text,
    accent,
  } = theme;

  const primaryHover = mix(primary, '#000000', 88);
  const primaryActive = mix(primary, '#000000', 78);
  const secondaryHover = mix(secondary, text, 92);
  const secondaryActive = mix(secondary, text, 85);
  const accentHover = mix(accent, '#000000', 88);
  const accentActive = mix(accent, '#000000', 78);
  const textMuted = mix(text, secondary, 65);
  const textDisabled = mix(text, secondary, 40);
  const onAccent = mix('#1a1020', text, 85);
  const border = mix(text, secondary, 35);
  const borderStrong = mix(text, secondary, 55);

  return [
    ['--p-color-bg', primary],
    ['--p-color-bg-inverse', mix(text, '#000000', 45)],
    ['--p-color-bg-surface', secondary],
    ['--p-color-bg-surface-hover', secondaryHover],
    ['--p-color-bg-surface-active', secondaryActive],
    ['--p-color-bg-surface-selected', mix(secondary, accent, 88)],
    ['--p-color-bg-surface-disabled', mix(secondary, primary, 70)],
    ['--p-color-bg-surface-secondary', mix(primary, secondary, 70)],
    ['--p-color-bg-surface-secondary-hover', mix(primary, secondary, 60)],
    ['--p-color-bg-surface-secondary-active', mix(primary, secondary, 50)],
    ['--p-color-bg-surface-secondary-selected', mix(primary, accent, 65)],
    ['--p-color-bg-surface-tertiary', mix(primary, secondary, 55)],
    ['--p-color-bg-surface-brand', mix(accent, secondary, 75)],
    ['--p-color-bg-surface-brand-hover', mix(accent, secondary, 65)],
    ['--p-color-bg-surface-brand-active', mix(accent, secondary, 55)],
    ['--p-color-bg-surface-emphasis', mix(primary, secondary, 80)],
    ['--p-color-bg-surface-magic', mix(primary, secondary, 85)],
    ['--p-color-bg-surface-success', mix(accent, secondary, 70)],
    ['--p-color-bg-fill', secondary],
    ['--p-color-bg-fill-hover', secondaryHover],
    ['--p-color-bg-fill-active', secondaryActive],
    ['--p-color-bg-fill-secondary', mix(primary, secondary, 75)],
    ['--p-color-bg-fill-tertiary', mix(primary, secondary, 60)],
    ['--p-color-bg-fill-brand', accent],
    ['--p-color-bg-fill-brand-hover', accentHover],
    ['--p-color-bg-fill-brand-active', accentActive],
    ['--p-color-bg-fill-brand-selected', accent],
    ['--p-color-bg-fill-success', accentHover],
    ['--p-color-bg-fill-success-secondary', mix(accent, secondary, 75)],
    ['--p-color-bg-fill-emphasis', mix(text, primary, 55)],
    ['--p-color-bg-fill-magic', primaryHover],
    ['--p-color-text', text],
    ['--p-color-text-secondary', textMuted],
    ['--p-color-text-disabled', textDisabled],
    ['--p-color-text-link', text],
    ['--p-color-text-link-hover', mix(text, '#000000', 85)],
    ['--p-color-text-brand', mix(text, accent, 50)],
    ['--p-color-text-brand-on-bg-fill', onAccent],
    ['--p-color-text-success', mix(accent, '#000000', 55)],
    ['--p-color-icon', text],
    ['--p-color-icon-secondary', textMuted],
    ['--p-color-icon-brand', mix(text, accent, 50)],
    ['--p-color-icon-brand-on-bg-fill', onAccent],
    ['--p-color-border', border],
    ['--p-color-border-hover', borderStrong],
    ['--p-color-border-focus', accent],
    ['--p-color-border-brand', accent],
    ['--p-color-border-emphasis', text],
    ['--p-color-input-bg-surface', secondary],
    ['--p-color-input-border', border],
    ['--p-color-input-border-hover', borderStrong],
    ['--p-color-input-border-active', accent],
    // Admin shell (left nav + app frame + sticky bottom nav)
    ['--p-color-bg', mix(primary, secondary, 55)],
    ['--p-color-app-bg', mix(primary, secondary, 55)],
    ['--p-color-nav-bg', mix(primary, secondary, 55)],
    ['--p-color-bg-app', mix(primary, secondary, 55)],
    ['--p-color-bg-app-hover', primaryHover],
    ['--p-color-bg-app-selected', mix(primary, accent, 70)],
    ['--p-color-bg-app-active', primaryActive],
  ];
}

function buildThemeCss(theme) {
  const {
    primary,
    secondary,
    text,
    accent,
    useGradient,
  } = theme;

  const shellBg = mix(primary, secondary, 55);
  const pageBg = useGradient
    ? `linear-gradient(160deg, ${ primary } 0%, ${ mix(primary, accent, 55) } 55%, ${ accent } 100%)`
    : shellBg;

  const vars = getPolarisVarEntries(theme);
  const varBlock = vars
    .map(([name, value]) => `  ${ name }: ${ value } !important;`)
    .join('\n');

  const tokenTargets = [
    ':root',
    'html',
    'body',
    '[data-admin-next]',
    '[data-polaris-custom-properties]',
    '[p-color-scheme]',
    '.Polaris-Frame',
    '.Polaris-Frame__Main',
    '#PolarisPortalsContainer',
    '.Polaris-ThemeProvider',
    '[class*="CustomPropertyOverrides"]',
    '[class*="ThemeProvider"]',
  ].join(',\n');

  return `
${ tokenTargets } {
  --shopify_skins_primary: ${ primary };
  --shopify_skins_secondary: ${ secondary };
  --shopify_skins_text: ${ text };
  --shopify_skins_accent: ${ accent };
  --shopify_skins_use_gradient: ${ useGradient ? '1' : '0' };
  --p-color-app-bg: ${ shellBg } !important;
  --p-color-nav-bg: ${ shellBg } !important;
${ varBlock }
}

html,
body,
.Polaris-Frame,
.Polaris-Frame__Main,
#AppFrameMain,
[data-polaris-custom-properties] {
  background: ${ pageBg } !important;
  background-color: ${ shellBg } !important;
  color: ${ text } !important;
}

/* Main admin chrome — same shell as left column */
[data-admin-next] [class*="_AppFrame_"]:not([class*="_TransparentBackground_"]),
[class*="_StickyBottomNav_"],
.Polaris-Navigation,
.Polaris-TopBar,
#AppFrameNav {
  background-color: ${ shellBg } !important;
  background: ${ shellBg } !important;
}

.Polaris-LegacyCard,
.Polaris-ShadowBevel,
.Polaris-Box {
  background-color: ${ secondary } !important;
  color: ${ text } !important;
}

.Polaris-Button--variantPrimary,
.Polaris-Button--primary {
  background-color: ${ accent } !important;
  color: ${ mix('#1a1020', text, 85) } !important;
}
`.trim();
}

function polarisVarNames(theme) {
  return [
    ...getPolarisVarEntries(theme).map(([name]) => name),
    '--p-color-app-bg',
    '--p-color-nav-bg',
    '--shopify_skins_primary',
    '--shopify_skins_secondary',
    '--shopify_skins_text',
    '--shopify_skins_accent',
    '--shopify_skins_use_gradient',
  ];
}

function applyPolarisVarsToElement(element, theme) {
  if (!element || !element.style) {
    return;
  }

  for (const [name, value] of getPolarisVarEntries(theme)) {
    element.style.setProperty(name, value, 'important');
  }
}

function clearPolarisVarsFromElement(element, theme) {
  if (!element || !element.style) {
    return;
  }

  for (const name of polarisVarNames(theme)) {
    element.style.removeProperty(name);
  }
}

function themedRoots(theme) {
  const elements = [
    document.documentElement,
    document.body,
  ].filter(Boolean);

  const selectors = [
    '[data-polaris-custom-properties]',
    '.Polaris-Frame',
    '#PolarisPortalsContainer',
    '[class*="CustomPropertyOverrides"]',
  ];

  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((element) => {
      elements.push(element);
    });
  }

  document.querySelectorAll('*').forEach((element) => {
    if (element.shadowRoot) {
      elements.push(element);
    }
  });

  return elements;
}

function applyPolarisVarsInDocument(theme) {
  for (const element of themedRoots(theme)) {
    applyPolarisVarsToElement(element, theme);
  }
}

function clearPolarisVarsInDocument(theme) {
  for (const element of themedRoots(theme)) {
    clearPolarisVarsFromElement(element, theme);
  }
}

async function loadTheme() {
  const result = await chrome.storage.sync.get(THEME_STORAGE_KEY);
  return {
    ...DEFAULT_THEME,
    ...(result[THEME_STORAGE_KEY] || {}),
  };
}

async function saveTheme(theme) {
  await chrome.storage.sync.set({
    [THEME_STORAGE_KEY]: theme,
  });
}
