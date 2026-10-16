function gidToId(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (!raw.includes('/')) {
    return raw;
  }
  const parts = raw.split('/');
  return parts[parts.length - 1] || '';
}

function parseAdminContext(url = location.href) {
  const storeMatch = url.match(/admin\.shopify\.com\/store\/([^/?#]+)/);
  const shopParam = url.match(/[?&](?:shop|store)=([^&]+)/i);
  let storeHandle = storeMatch?.[1] || null;
  if (!storeHandle && shopParam) {
    storeHandle = decodeURIComponent(shopParam[1])
      .replace(/\.myshopify\.com$/i, '')
      .split('.')[0] || null;
  }
  const themeMatch = url.match(/\/themes\/(\d+)/);
  return {
    storeHandle,
    themeId: themeMatch?.[1] || null,
  };
}

function extractThemeIdFromHref(href) {
  const match = String(href || '').match(/\/themes\/(\d+)/);
  return match?.[1] || null;
}

function cleanText(element) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function queryAllDeep(selector, root = document) {
  const results = [];
  const visit = (node) => {
    if (!node) {
      return;
    }
    if (node.querySelectorAll) {
      results.push(...node.querySelectorAll(selector));
    }
    const treeWalkerRoot = node === document ? document.documentElement : node;
    const elements = treeWalkerRoot?.querySelectorAll?.('*') || [];
    for (const el of elements) {
      if (el.shadowRoot) {
        visit(el.shadowRoot);
      }
    }
  };
  visit(root);
  return results;
}

function toast(message, kind = 'ok') {
  let el = document.getElementById('shopify-skins-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'shopify-skins-toast';
    el.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'left:50%',
      'bottom:24px',
      'transform:translateX(-50%)',
      'padding:10px 14px',
      'border-radius:10px',
      'font:600 13px/1.3 IBM Plex Sans,Segoe UI,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.18)',
      'pointer-events:none',
      'transition:opacity .2s ease',
    ].join(';');
    document.documentElement.appendChild(el);
  }

  el.textContent = message;
  el.style.background = kind === 'error' ? '#b42318' : '#1a1a1a';
  el.style.color = '#fff';
  el.style.opacity = '1';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.style.opacity = '0';
  }, 2400);
}

function actionButtonCss(colour) {
  return [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'width:28px',
    'height:28px',
    'margin-left:6px',
    'padding:0',
    'border:0',
    'border-radius:8px',
    'background:transparent',
    `color:${ colour }`,
    'cursor:pointer',
    'vertical-align:middle',
    'flex:0 0 auto',
  ].join(';');
}

function createThemeActionButton({
  attr,
  themeId,
  title,
  svg,
  onClick,
}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute(attr, 'true');
  button.dataset.themeId = themeId;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.innerHTML = svg;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

/**
 * Shared host for theme-name action plugins (preview, rename, …).
 * Plugins depend on this abstraction; the host does not know feature details.
 * Content-script only — skipped in the service worker (which still uses gidToId).
 */
function createThemeActions() {
  const EDITING_ATTR = 'data-shopify-skins-renaming';
  const MAX_THEME_NAME_LENGTH = 50;
  const TEAL = '#0D9488';
  const ACTION_LABEL_RE = /^(customize|preview(\s*\(.*\))?|edit code|edit theme|edit default theme content|actions?|publish(:\s*.+)?|unpublish|remove|duplicate(\s+in\s+canvas)?|download(\s+theme(\s+file)?)?|rename|view|more(\s+actions)?|add theme|add|save|cancel|close|copy|open|editor|import|theme actions|click for more theme actions|create a new theme in canvas|version\s+[\d.]+)$/i;
  const ACTION_MENU_SELECTOR = [
    '.Polaris-ActionList',
    '.Polaris-ActionList__Item',
    '.Polaris-ActionList__Text',
    '[role="menu"]',
    '[role="menuitem"]',
    '[role="listbox"]',
  ].join(', ');
  const plugins = [];
  const enabledById = {};

  let decorateTimer = null;
  let paused = false;
  let currentTheme = typeof DEFAULT_THEME !== 'undefined' ? DEFAULT_THEME : {};
  let cachedTabStoreHandle = null;
  let booted = false;

  function isActionLabel(text) {
    return ACTION_LABEL_RE.test(String(text || '').trim());
  }

  function isInsideActionMenu(element) {
    return Boolean(element?.closest?.(ACTION_MENU_SELECTOR));
  }

  function splitLastSavedLabel(text) {
    const raw = String(text || '');
    const lastSavedIdx = raw.search(/\bLast saved:/i);
    if (lastSavedIdx <= 0) {
      return {
        name: raw.trim(),
        suffix: '',
      };
    }
    return {
      name: raw.slice(0, lastSavedIdx).replace(/[^\w)\]}'"]+$/u, '').trim(),
      suffix: raw.slice(lastSavedIdx).replace(/^\s*/, ' · '),
    };
  }

  function themeNameFromLabel(element) {
    if (element?.dataset?.shopifySkinsThemeName) {
      return element.dataset.shopifySkinsThemeName.trim();
    }
    return splitLastSavedLabel(cleanText(element)).name;
  }

  function labelTextWithName(element, nextName) {
    const { suffix } = splitLastSavedLabel(cleanText(element));
    return suffix ? `${ nextName }${ suffix }` : nextName;
  }

  function buttonAttrs() {
    return plugins.map((plugin) => plugin.buttonAttr);
  }

  function isActionButton(element) {
    return buttonAttrs().some((attr) => element?.hasAttribute?.(attr));
  }

  function actionButtonSelector() {
    const attrs = buttonAttrs();
    if (!attrs.length) {
      return null;
    }
    return attrs.map((attr) => `[${ attr }]`).join(', ');
  }

  function actionColour() {
    if (currentTheme.colourSchemeEnabled === false) {
      return TEAL;
    }
    return currentTheme.accent || DEFAULT_THEME.accent;
  }

  async function resolveStoreHandle() {
    const fromPage = parseAdminContext().storeHandle;
    if (fromPage) {
      cachedTabStoreHandle = fromPage;
      return fromPage;
    }
    if (cachedTabStoreHandle) {
      return cachedTabStoreHandle;
    }
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'shopifySkinsGetTabContext',
      });
      cachedTabStoreHandle = result?.data?.storeHandle || null;
    } catch (_error) {
      cachedTabStoreHandle = null;
    }
    return cachedTabStoreHandle;
  }

  function findThemeIdNear(element) {
    if (element?.dataset?.shopifySkinsThemeId) {
      return element.dataset.shopifySkinsThemeId;
    }

    let node = element;
    while (node && node !== document.documentElement) {
      if (node.dataset?.shopifySkinsThemeId) {
        return node.dataset.shopifySkinsThemeId;
      }

      if (node instanceof HTMLAnchorElement) {
        const fromSelf = extractThemeIdFromHref(node.href);
        if (fromSelf) {
          return fromSelf;
        }
      }

      const link = node.querySelector?.('a[href*="/themes/"]');
      if (link) {
        const fromLink = extractThemeIdFromHref(link.href);
        if (fromLink) {
          return fromLink;
        }
      }

      node = node.parentElement;
    }

    // Do not fall back to /themes/{id} from the URL — that matches the
    // theme editor/customize view, where we must not attach actions.
    return null;
  }

  function isThemeEditorPage(url = location.href) {
    return /\/themes\/\d+(?:\/|$|\?|#)/.test(String(url || ''));
  }

  function looksLikeThemeName(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (element.matches('button, input, textarea, svg, script, style')) {
      return false;
    }
    if (isInsideActionMenu(element)) {
      return false;
    }
    const selector = actionButtonSelector();
    if (selector && (element.matches(selector) || element.closest(selector))) {
      return false;
    }
    if (element.getAttribute(EDITING_ATTR) === 'true') {
      return false;
    }

    const text = cleanText(element);
    const name = themeNameFromLabel(element);
    if (!name || name.length > MAX_THEME_NAME_LENGTH + 10) {
      return false;
    }
    if (isActionLabel(name) || isActionLabel(text)) {
      return false;
    }
    if (element.children.length > 4) {
      return false;
    }
    if (element.querySelector('a[href*="/themes/"], button, input, textarea')) {
      return false;
    }

    const tag = element.tagName;
    const className = String(element.className || '');
    return ['H1', 'H2', 'H3', 'H4', 'SPAN', 'P', 'A', 'DIV', 'LEGEND', 'LABEL'].includes(tag)
      || className.includes('Polaris-Text');
  }

  function scoreNameCandidate(element) {
    let score = 0;
    if (/^H[1-4]$/.test(element.tagName)) {
      score += 20;
    }
    if (String(element.className || '').includes('Polaris-Text')) {
      score += 8;
    }
    if (String(element.className || '').includes('headingSm')) {
      score += 12;
    }
    if (element.dataset?.shopifySkinsThemeName) {
      score += 25;
    }
    if (element.children.length === 0) {
      score += 10;
    } else if (element.children.length === 1) {
      score += 5;
    }
    if (element.querySelector('h1, h2, h3, h4')) {
      score -= 15;
    }
    if (isInsideActionMenu(element)) {
      score -= 50;
    }
    score -= Math.max(0, themeNameFromLabel(element).length - 24) * 0.2;
    return score;
  }

  function themeIdsIn(element) {
    const ids = new Set();
    element?.querySelectorAll?.('a[href*="/themes/"]').forEach((link) => {
      const id = extractThemeIdFromHref(link.href);
      if (id) {
        ids.add(id);
      }
    });
    if (element instanceof HTMLAnchorElement) {
      const id = extractThemeIdFromHref(element.href);
      if (id) {
        ids.add(id);
      }
    }
    return ids;
  }

  function findCardRoot(fromEl) {
    const cardSelector = [
      '.Polaris-ShadowBevel',
      '.Polaris-LegacyCard',
      '.Polaris-ResourceItem',
      '[class*="ThemeCard"]',
      '[class*="theme-card"]',
      '[role="listitem"]',
      '[role="row"]',
      'li',
      'article',
    ].join(', ');

    let node = fromEl.parentElement;
    let best = fromEl.parentElement || fromEl;

    for (let depth = 0; depth < 12 && node; depth += 1) {
      const ids = themeIdsIn(node);
      if (ids.size > 1) {
        break;
      }
      if (ids.size === 1) {
        best = node;
        if (node.matches?.(cardSelector)) {
          return node;
        }
      }
      node = node.parentElement;
    }

    return best;
  }

  function collectThemeNameTargets() {
    if (isThemeEditorPage()) {
      return [];
    }

    const bestByThemeId = new Map();

    function consider(element, themeId) {
      if (!element || !themeId || !looksLikeThemeName(element)) {
        return;
      }
      const existing = bestByThemeId.get(themeId);
      if (!existing || scoreNameCandidate(element) > scoreNameCandidate(existing)) {
        bestByThemeId.set(themeId, element);
      }
    }

    const themeLinks = [
      ...queryAllDeep('a[href*="/themes/"]'),
      ...queryAllDeep('[href*="/themes/"]'),
    ].filter((el, index, all) => all.indexOf(el) === index);

    themeLinks.forEach((link) => {
      const href = link.href || link.getAttribute?.('href') || '';
      const themeId = extractThemeIdFromHref(href);
      if (!themeId) {
        return;
      }

      link.querySelectorAll?.('h1, h2, h3, h4, span, p')?.forEach((nested) => {
        consider(nested, themeId);
      });
      consider(link, themeId);

      const card = findCardRoot(link);
      const nameSelector = [
        'h1',
        'h2',
        'h3',
        'h4',
        'p',
        'span',
        'legend',
        '[class*="Polaris-Text"]',
        '[class*="heading"]',
        '[class*="Heading"]',
        '[class*="Title"]',
        '[class*="title"]',
      ].join(', ');

      queryAllDeep(nameSelector, card).forEach((candidate) => {
        consider(candidate, themeId);
      });
      card.querySelectorAll?.(nameSelector)?.forEach((candidate) => {
        consider(candidate, themeId);
      });
    });

    queryAllDeep('a[href*="preview_theme_id="], [href*="preview_theme_id="]').forEach((link) => {
      const href = link.href || link.getAttribute?.('href') || '';
      const themeId = href.match(/preview_theme_id=(\d+)/)?.[1];
      if (!themeId) {
        return;
      }
      const card = findCardRoot(link);
      queryAllDeep('h1, h2, h3, h4, p, span, [class*="Polaris-Text"]', card).forEach((candidate) => {
        consider(candidate, themeId);
      });
    });

    // Published theme card: name lives in a truncate span with " · Last saved",
    // while the clean name is on data-component-extra-theme-name.
    queryAllDeep('[data-component-extra-theme-name]').forEach((el) => {
      const name = el.getAttribute('data-component-extra-theme-name')?.trim();
      const themeId = findThemeIdNear(el);
      if (!name || !themeId) {
        return;
      }

      const card = el.closest('[class*="PublishedTheme"]') || findCardRoot(el);
      const nameSelector = [
        'h1',
        'h2',
        'h3',
        'h4',
        'p',
        'span',
        '[class*="Polaris-Text"]',
        '[class*="Truncate"]',
      ].join(', ');

      queryAllDeep(nameSelector, card).forEach((candidate) => {
        if (isInsideActionMenu(candidate)) {
          return;
        }
        const text = cleanText(candidate);
        const nameFromText = splitLastSavedLabel(text).name;
        if (text !== name && nameFromText !== name) {
          return;
        }
        candidate.dataset.shopifySkinsThemeName = name;
        consider(candidate, themeId);
      });
    });

    for (const [themeId, element] of bestByThemeId) {
      element.dataset.shopifySkinsThemeId = themeId;
    }

    return [...bestByThemeId.values()];
  }

  function findOwnedButton(parent, labelEl, attr, themeId) {
    let node = labelEl.nextElementSibling;
    while (node && isActionButton(node)) {
      if (node.hasAttribute(attr) && node.dataset.themeId === themeId) {
        return node;
      }
      node = node.nextElementSibling;
    }
    return parent.querySelector(`[${ attr }][data-theme-id="${ themeId }"]`);
  }

  function ensurePluginButton(plugin, labelEl, themeId, colour) {
    const parent = labelEl.parentElement;
    if (!parent) {
      return null;
    }

    let button = findOwnedButton(parent, labelEl, plugin.buttonAttr, themeId);
    if (!button) {
      button = createThemeActionButton({
        attr: plugin.buttonAttr,
        themeId,
        title: plugin.title,
        svg: plugin.svg,
        onClick: () => plugin.onActivate(labelEl, themeId),
      });
    }

    button.style.cssText = actionButtonCss(colour);
    return button;
  }

  function ensureButtonsForLabel(labelEl) {
    if (labelEl.getAttribute(EDITING_ATTR) === 'true') {
      return;
    }

    const themeId = labelEl.dataset.shopifySkinsThemeId || findThemeIdNear(labelEl);
    if (!themeId) {
      return;
    }
    labelEl.dataset.shopifySkinsThemeId = themeId;

    const parent = labelEl.parentElement;
    if (!parent) {
      return;
    }

    const colour = actionColour();
    const ordered = [];

    for (const plugin of plugins) {
      if (enabledById[plugin.id]) {
        ordered.push(ensurePluginButton(plugin, labelEl, themeId, colour));
      } else {
        parent.querySelectorAll(`[${ plugin.buttonAttr }][data-theme-id="${ themeId }"]`).forEach((el) => {
          el.remove();
        });
      }
    }

    let anchor = labelEl;
    ordered.filter(Boolean).forEach((button) => {
      if (button.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement('afterend', button);
      }
      anchor = button;
    });
  }

  function clearAllButtons() {
    const selector = actionButtonSelector();
    if (!selector) {
      return;
    }
    document.querySelectorAll(selector).forEach((button) => {
      button.remove();
    });
  }

  function decorate() {
    if (isThemeEditorPage()) {
      clearAllButtons();
      return;
    }

    const anyEnabled = plugins.some((plugin) => enabledById[plugin.id]);
    if (!anyEnabled) {
      clearAllButtons();
      return;
    }

    if (paused) {
      return;
    }

    const selector = actionButtonSelector();
    if (selector) {
      document.querySelectorAll(selector).forEach((button) => {
        let label = button.previousElementSibling;
        while (label && isActionButton(label)) {
          label = label.previousElementSibling;
        }
        if (!label || !document.contains(label)) {
          button.remove();
        }
      });
    }

    collectThemeNameTargets().forEach((labelEl) => {
      ensureButtonsForLabel(labelEl);
    });
  }

  function scheduleDecorate() {
    if (decorateTimer) {
      clearTimeout(decorateTimer);
    }
    decorateTimer = setTimeout(() => {
      decorate();
    }, 120);
  }

  async function refreshTheme() {
    try {
      currentTheme = await loadTheme();
    } catch (_error) {
      currentTheme = DEFAULT_THEME;
    }
  }

  async function refreshEnabled() {
    try {
      const settings = await loadSettings();
      const storeHandle = await resolveStoreHandle();
      await Promise.all(plugins.map(async (plugin) => {
        enabledById[plugin.id] = Boolean(await plugin.isEnabled(settings, storeHandle));
      }));
    } catch (_error) {
      for (const plugin of plugins) {
        enabledById[plugin.id] = false;
      }
    }
  }

  async function refreshAndDecorate() {
    await Promise.all([
      refreshTheme(),
      refreshEnabled(),
    ]);
    scheduleDecorate();
  }

  function register(plugin) {
    if (!plugin?.id || !plugin.buttonAttr) {
      throw new Error('ThemeActions.register requires id and buttonAttr');
    }
    if (plugins.some((existing) => existing.id === plugin.id)) {
      return;
    }
    plugins.push(plugin);
    if (booted) {
      refreshAndDecorate();
    }
  }

  function setPaused(value) {
    paused = Boolean(value);
  }

  function boot() {
    if (booted) {
      return;
    }
    booted = true;

    refreshAndDecorate();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes[THEME_STORAGE_KEY]) {
        refreshTheme().then(scheduleDecorate);
      }
      if (areaName === 'local' && changes[SETTINGS_STORAGE_KEY]) {
        refreshEnabled().then(scheduleDecorate);
      }
    });

    const observer = new MutationObserver(() => {
      scheduleDecorate();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scheduleDecorate, {
        once: true,
      });
    } else {
      scheduleDecorate();
    }

    window.addEventListener('load', scheduleDecorate, {
      once: true,
    });
  }

  // Macrotask so preview.js / rename.js can register in the same injection pass.
  setTimeout(() => {
    boot();
  }, 0);

  return {
    EDITING_ATTR,
    MAX_THEME_NAME_LENGTH,
    TEAL,
    register,
    setPaused,
    isPaused: () => paused,
    scheduleDecorate,
    refreshAndDecorate,
    resolveStoreHandle,
    findThemeIdNear,
    collectThemeNameTargets,
    themeNameFromLabel,
    labelTextWithName,
    actionColour,
    toast,
    queryAllDeep,
    cleanText,
    extractThemeIdFromHref,
    parseAdminContext,
    plugins: () => [...plugins],
    isEnabled: (id) => Boolean(enabledById[id]),
  };
}

const ThemeActions = (
  typeof document !== 'undefined'
  && typeof MutationObserver !== 'undefined'
)
  ? createThemeActions()
  : null;
