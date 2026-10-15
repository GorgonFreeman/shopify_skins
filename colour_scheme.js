/**
 * Colour scheme apply/unapply for Shopify admin.
 *
 * Responsibilities:
 * - TokenBuilder: map a theme palette → Polaris CSS variables + CSS text
 * - ColourSchemeApplier: apply() / unapply() against the live DOM
 */

const ColourScheme = (() => {
  const STYLE_ID = 'shopify-skins-style';
  const ROOT_MARK = 'data-shopify-skins-rooted';
  const ACTIVE_MARK = 'data-shopify-skins';

  const ROOT_SELECTORS = [
    '[data-polaris-custom-properties]',
    '[data-admin-next]',
    '.Polaris-Frame',
    '#PolarisPortalsContainer',
    '[class*="CustomPropertyOverrides"]',
    '[class*="ThemeProvider"]',
  ];

  function mix(a, b, amountA) {
    return `color-mix(in srgb, ${ a } ${ amountA }%, ${ b })`;
  }

  function buildShellBg(theme) {
    return mix(theme.primary, theme.secondary, 55);
  }

  /** @returns {Array<[string, string]>} */
  function buildTokenEntries(theme) {
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
    const shellBg = buildShellBg(theme);

    return [
      ['--shopify_skins_primary', primary],
      ['--shopify_skins_secondary', secondary],
      ['--shopify_skins_text', text],
      ['--shopify_skins_accent', accent],
      ['--shopify_skins_use_gradient', theme.useGradient ? '1' : '0'],

      ['--p-color-bg', shellBg],
      ['--p-color-app-bg', shellBg],
      ['--p-color-nav-bg', shellBg],
      ['--p-color-bg-app', shellBg],
      ['--p-color-bg-app-hover', primaryHover],
      ['--p-color-bg-app-selected', mix(primary, accent, 70)],
      ['--p-color-bg-app-active', primaryActive],
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
    ];
  }

  function buildCss(theme) {
    const {
      primary,
      secondary,
      text,
      accent,
      useGradient,
    } = theme;

    const shellBg = buildShellBg(theme);
    const pageBg = useGradient
      ? `linear-gradient(160deg, ${ primary } 0%, ${ mix(primary, accent, 55) } 55%, ${ accent } 100%)`
      : shellBg;

    const varBlock = buildTokenEntries(theme)
      .map(([name, value]) => `  ${ name }: ${ value } !important;`)
      .join('\n');

    const tokenTargets = [
      ':root',
      'html',
      'body',
      ...ROOT_SELECTORS,
    ].join(',\n');

    return `
${ tokenTargets } {
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

  function collectRoots() {
    const roots = new Set();
    if (document.documentElement) {
      roots.add(document.documentElement);
    }
    if (document.body) {
      roots.add(document.body);
    }

    for (const selector of ROOT_SELECTORS) {
      document.querySelectorAll(selector).forEach((element) => {
        roots.add(element);
      });
    }

    // Elements we previously marked, even if selectors drifted.
    document.querySelectorAll(`[${ ROOT_MARK }]`).forEach((element) => {
      roots.add(element);
    });

    return [...roots];
  }

  function ensureStyleElement() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
    }

    const parent = document.head || document.documentElement;
    if (style.parentNode !== parent) {
      parent.appendChild(style);
    } else if (parent.lastChild !== style) {
      parent.appendChild(style);
    }

    return style;
  }

  function removeStyleElement() {
    document.getElementById(STYLE_ID)?.remove();
  }

  // Remember Polaris' own inline custom properties so unapply can restore them
  // instead of leaving roots stripped (which looks like residual theming).
  const savedInlineTokens = new WeakMap();

  function writeInlineTokens(element, entries) {
    if (!element?.style) {
      return;
    }

    let saved = savedInlineTokens.get(element);
    if (!saved) {
      saved = new Map();
      savedInlineTokens.set(element, saved);
    }

    element.setAttribute(ROOT_MARK, '1');
    for (const [name, value] of entries) {
      if (!saved.has(name)) {
        const previous = element.style.getPropertyValue(name);
        saved.set(name, previous
          ? {
            value: previous,
            priority: element.style.getPropertyPriority(name),
          }
          : null);
      }
      element.style.setProperty(name, value, 'important');
    }
  }

  function clearInlineTokens(element, tokenNames) {
    if (!element?.style) {
      return;
    }

    const saved = savedInlineTokens.get(element);
    for (const name of tokenNames) {
      if (saved?.has(name)) {
        const previous = saved.get(name);
        if (previous) {
          element.style.setProperty(
            name,
            previous.value,
            previous.priority || '',
          );
        } else {
          element.style.removeProperty(name);
        }
      } else {
        element.style.removeProperty(name);
      }
    }
    savedInlineTokens.delete(element);
    element.removeAttribute(ROOT_MARK);
  }

  function collectMarkedRoots() {
    return [...document.querySelectorAll(`[${ ROOT_MARK }]`)];
  }

  let isBusy = false;

  function withBusy(fn) {
    isBusy = true;
    try {
      fn();
    } finally {
      // Allow mutation observers to settle before accepting new work.
      queueMicrotask(() => {
        isBusy = false;
      });
    }
  }

  function isBusyApplying() {
    return isBusy;
  }

  function isApplied() {
    return document.documentElement.getAttribute(ACTIVE_MARK) === 'active'
      || Boolean(document.getElementById(STYLE_ID))
      || Boolean(document.querySelector(`[${ ROOT_MARK }]`));
  }

  /**
   * Apply the colour scheme to the current document.
   */
  function apply(theme) {
    const normalised = {
      ...DEFAULT_THEME,
      ...(theme || {}),
    };

    withBusy(() => {
      const entries = buildTokenEntries(normalised);
      const style = ensureStyleElement();
      style.textContent = buildCss(normalised);

      for (const root of collectRoots()) {
        writeInlineTokens(root, entries);
      }

      document.documentElement.setAttribute(ACTIVE_MARK, 'active');
    });
  }

  /**
   * Remove all colour-scheme overrides and restore admin defaults.
   * Only touches nodes we previously marked — never strip Polaris roots cold.
   */
  function unapply(theme = DEFAULT_THEME) {
    const normalised = {
      ...DEFAULT_THEME,
      ...(theme || {}),
    };
    const tokenNames = buildTokenEntries(normalised).map(([name]) => name);

    withBusy(() => {
      removeStyleElement();

      for (const root of collectMarkedRoots()) {
        clearInlineTokens(root, tokenNames);
      }

      document.documentElement.removeAttribute(ACTIVE_MARK);
    });
  }

  /**
   * Apply or unapply based on theme.colourSchemeEnabled.
   */
  function sync(theme) {
    const normalised = {
      ...DEFAULT_THEME,
      ...(theme || {}),
    };

    if (normalised.colourSchemeEnabled === false) {
      unapply(normalised);
      return 'unapplied';
    }

    apply(normalised);
    return 'applied';
  }

  return {
    STYLE_ID,
    apply,
    unapply,
    sync,
    isApplied,
    isBusyApplying,
    buildCss,
    buildTokenEntries,
  };
})();

// Back-compat aliases used during the refactor.
function buildThemeCss(theme) {
  return ColourScheme.buildCss(theme);
}

function applyPolarisVarsInDocument(theme) {
  ColourScheme.apply(theme);
}

function clearPolarisVarsInDocument(theme) {
  ColourScheme.unapply(theme);
}
