(() => {
  const MAX_THEME_NAME_LENGTH = 50;
  const EDITING_ATTR = 'data-shopify-skins-renaming';
  const BUTTON_ATTR = 'data-shopify-skins-rename-btn';
  const POPOVER_ID = 'shopify-skins-rename-popover';
  const TEAL = '#0D9488';
  const PENCIL_SVG = `
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM12.379 4.793 3 14.172V17h2.828l9.379-9.379-2.828-2.828Z"/>
    </svg>
  `.trim();

  let editing = false;
  let decorateTimer = null;
  let currentTheme = DEFAULT_THEME;
  let themeRenameEnabled = false;
  let cachedTabStoreHandle = null;

  function clearPencilButtons() {
    document.querySelectorAll(`[${ BUTTON_ATTR }]`).forEach((button) => {
      button.remove();
    });
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

  async function refreshRenameSettings() {
    try {
      const settings = await loadSettings();
      const storeHandle = await resolveStoreHandle();
      const hasToken = Boolean(tokenForStore(settings, storeHandle));
      themeRenameEnabled = hasToken && settings.themeRenameEnabled === true;
    } catch (_error) {
      themeRenameEnabled = false;
    }
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

    return parseAdminContext().themeId;
  }

  const ACTION_LABEL_RE = /^(customize|preview|edit code|actions?|publish|unpublish|remove|duplicate|download|rename|view|more|add theme|add|save|cancel|close|copy|open|editor)$/i;

  function cleanText(element) {
    return (element?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isActionLabel(text) {
    return ACTION_LABEL_RE.test(String(text || '').trim());
  }

  function extractThemeIdFromHref(href) {
    const match = String(href || '').match(/\/themes\/(\d+)/);
    return match?.[1] || null;
  }

  function looksLikeThemeName(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (element.matches('button, input, textarea, svg, script, style')) {
      return false;
    }
    if (element.matches(`[${ BUTTON_ATTR }]`) || element.closest(`[${ BUTTON_ATTR }]`)) {
      return false;
    }
    if (element.getAttribute(EDITING_ATTR) === 'true') {
      return false;
    }

    const text = cleanText(element);
    if (!text || text.length > MAX_THEME_NAME_LENGTH + 10) {
      return false;
    }
    if (isActionLabel(text)) {
      return false;
    }
    // Whole cards / action rows — too much structure to be a name.
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
    if (element.children.length === 0) {
      score += 10;
    } else if (element.children.length === 1) {
      score += 5;
    }
    if (element.querySelector('h1, h2, h3, h4')) {
      score -= 15;
    }
    // Prefer dedicated name nodes over long metadata lines.
    score -= Math.max(0, cleanText(element).length - 24) * 0.2;
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
        // Climbed into a list that contains multiple themes — stop.
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

  function pencilColour() {
    if (currentTheme.colourSchemeEnabled === false) {
      return TEAL;
    }
    return currentTheme.accent || DEFAULT_THEME.accent;
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

  function restoreLabel(labelEl, originalHtml, text) {
    labelEl.removeAttribute(EDITING_ATTR);
    labelEl.innerHTML = originalHtml;

    const walker = document.createTreeWalker(labelEl, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    if (textNode) {
      textNode.nodeValue = text;
      return;
    }

    labelEl.textContent = text;
  }

  function openTokenPopup(storeHandle) {
    return chrome.runtime.sendMessage({
      type: 'shopifySkinsOpenPopup',
      payload: {
        focusToken: true,
        storeHandle,
      },
    });
  }

  function renameInBackground({
    storeHandle,
    themeId,
    name,
    labelEl,
    originalHtml,
    previousName,
  }) {
    chrome.runtime.sendMessage({
      type: 'shopifySkinsRenameTheme',
      payload: {
        storeHandle,
        themeId,
        name,
      },
    }).then(async (result) => {
      if (!result?.ok) {
        restoreLabel(labelEl, originalHtml, previousName);
        scheduleDecorate();
        const code = result?.error?.code;
        if (code === 'MISSING_TOKEN' || code === 'AUTH_ERROR') {
          try {
            await openTokenPopup(storeHandle);
          } catch (_error) {
            // Toast still explains what to do.
          }
          toast(
            code === 'MISSING_TOKEN'
              ? 'Add an Admin API token in Shopify Skins, then try again.'
              : (result?.error?.message || 'Token rejected for this store.'),
            'error',
          );
          return;
        }
        toast(result?.error?.message || 'Rename failed.', 'error');
        return;
      }

      const confirmedName = result?.data?.theme?.name || name;
      if (confirmedName !== name) {
        restoreLabel(labelEl, originalHtml, confirmedName);
      }
      scheduleDecorate();
      toast(`Renamed to “${ confirmedName }”.`, 'ok');
    }).catch((error) => {
      restoreLabel(labelEl, originalHtml, previousName);
      scheduleDecorate();
      toast(error?.message || 'Rename failed.', 'error');
    });
  }

  function measureTextWidth(text, styles) {
    const canvas = measureTextWidth._canvas || document.createElement('canvas');
    measureTextWidth._canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      return text.length * 10;
    }
    context.font = [
      styles.fontStyle,
      styles.fontWeight,
      styles.fontSize,
      styles.fontFamily,
    ].filter(Boolean).join(' ');
    return context.measureText(text).width;
  }

  function removeRenamePopover() {
    document.getElementById(POPOVER_ID)?.remove();
  }

  async function beginRename(labelEl) {
    if (editing) {
      return;
    }

    const storeHandle = await resolveStoreHandle();
    const themeId = findThemeIdNear(labelEl)
      || labelEl.dataset.shopifySkinsThemeId
      || null;
    const previousName = (labelEl.textContent || '').trim();
    const originalHtml = labelEl.innerHTML;

    if (!themeId || !previousName) {
      toast('Could not find theme id for rename.', 'error');
      return;
    }
    if (!storeHandle) {
      toast('Could not detect store from this admin tab.', 'error');
      return;
    }

    editing = true;
    labelEl.setAttribute(EDITING_ATTR, 'true');
    removeRenamePopover();

    const labelStyles = getComputedStyle(labelEl);
    const labelRect = labelEl.getBoundingClientRect();
    const textWidth = measureTextWidth(previousName, labelStyles);
    const inputWidth = Math.ceil(Math.max(
      labelRect.width,
      textWidth + 24,
      220,
    ));
    const popoverWidth = Math.min(
      Math.max(inputWidth + 24, 260),
      Math.max(280, window.innerWidth - 24),
    );

    const popover = document.createElement('div');
    popover.id = POPOVER_ID;
    popover.setAttribute(EDITING_ATTR, 'true');
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Rename theme');

    const left = Math.min(
      Math.max(8, labelRect.left),
      window.innerWidth - popoverWidth - 8,
    );
    const openBelow = labelRect.bottom + 12 + 88 < window.innerHeight;
    const top = openBelow
      ? labelRect.bottom + 8
      : Math.max(8, labelRect.top - 96);

    popover.style.cssText = [
      'position:fixed',
      `top:${ top }px`,
      `left:${ left }px`,
      `width:${ popoverWidth }px`,
      'z-index:2147483646',
      'display:grid',
      'gap:10px',
      'padding:12px',
      'border-radius:12px',
      'background:#fff',
      'color:#1a1a1a',
      'box-shadow:0 12px 32px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.08)',
      'font:600 13px/1.3 IBM Plex Sans,Segoe UI,sans-serif',
      'box-sizing:border-box',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'Rename theme';
    title.style.cssText = 'font-weight:650;letter-spacing:-0.01em;';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = previousName;
    input.maxLength = MAX_THEME_NAME_LENGTH;
    input.setAttribute(EDITING_ATTR, 'true');
    input.setAttribute('aria-label', 'Theme name');
    input.style.cssText = [
      'width:100%',
      `min-width:${ Math.min(inputWidth, popoverWidth - 24) }px`,
      `font-family:${ labelStyles.fontFamily || 'inherit' }`,
      `font-size:${ labelStyles.fontSize || '16px' }`,
      `font-weight:${ labelStyles.fontWeight || '600' }`,
      `line-height:${ labelStyles.lineHeight || '1.3' }`,
      'color:#1a1a1a',
      'background:#f6f6f7',
      'border:1px solid rgba(0,0,0,.2)',
      'border-radius:8px',
      'padding:8px 10px',
      'box-sizing:border-box',
    ].join(';');

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = [
      'appearance:none',
      'border:1px solid rgba(0,0,0,.16)',
      'border-radius:8px',
      'padding:7px 12px',
      'background:#fff',
      'color:#5c5c5c',
      'font:650 12px/1 IBM Plex Sans,Segoe UI,sans-serif',
      'cursor:pointer',
    ].join(';');

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = 'Save';
    saveButton.style.cssText = [
      'appearance:none',
      'border:0',
      'border-radius:8px',
      'padding:7px 12px',
      'background:#008060',
      'color:#fff',
      'font:650 12px/1 IBM Plex Sans,Segoe UI,sans-serif',
      'cursor:pointer',
    ].join(';');

    actions.append(cancelButton, saveButton);
    popover.append(title, input, actions);
    document.documentElement.appendChild(popover);

    let finished = false;

    function finish(save) {
      if (finished) {
        return;
      }
      finished = true;
      editing = false;
      labelEl.removeAttribute(EDITING_ATTR);
      removeRenamePopover();
      document.removeEventListener('pointerdown', onPointerDown, true);

      const nextName = input.value.trim().slice(0, MAX_THEME_NAME_LENGTH);

      if (!save || !nextName || nextName === previousName) {
        scheduleDecorate();
        return;
      }

      restoreLabel(labelEl, originalHtml, nextName);
      scheduleDecorate();

      renameInBackground({
        storeHandle,
        themeId,
        name: nextName,
        labelEl,
        originalHtml,
        previousName,
      });
    }

    function onPointerDown(event) {
      if (popover.contains(event.target)) {
        return;
      }
      finish(true);
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    });

    cancelButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    });

    saveButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    });

    // Defer so the opening click does not immediately close the popover.
    setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 0);

    input.focus();
    input.select();
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

  function collectThemeNameTargets() {
    // themeId → best label element (Shopify cards put the name outside the Customize link)
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

      // Legacy: name nested inside the theme link.
      link.querySelectorAll?.('h1, h2, h3, h4, span, p')?.forEach((nested) => {
        consider(nested, themeId);
      });
      consider(link, themeId);

      // Current admin: title sits in the card; Customize/Preview is a sibling CTA link.
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

    // Preview URLs sometimes carry the id when Customize is a button without href.
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

    const { themeId: pageThemeId } = parseAdminContext();
    if (pageThemeId) {
      queryAllDeep('h1, h2, h3').forEach((heading) => {
        consider(heading, pageThemeId);
      });
    }

    for (const [themeId, element] of bestByThemeId) {
      element.dataset.shopifySkinsThemeId = themeId;
    }

    return [...bestByThemeId.values()];
  }

  function ensurePencilButton(labelEl) {
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

    let button = null;
    const next = labelEl.nextElementSibling;
    if (next?.hasAttribute?.(BUTTON_ATTR) && next.dataset.themeId === themeId) {
      button = next;
    } else {
      button = parent.querySelector(`[${ BUTTON_ATTR }][data-theme-id="${ themeId }"]`);
      if (button && button.previousElementSibling !== labelEl) {
        labelEl.insertAdjacentElement('afterend', button);
      }
    }

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.setAttribute(BUTTON_ATTR, 'true');
      button.dataset.themeId = themeId;
      button.title = 'Rename theme';
      button.setAttribute('aria-label', 'Rename theme');
      button.innerHTML = PENCIL_SVG;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginRename(labelEl);
      });
      labelEl.insertAdjacentElement('afterend', button);
    }

    const colour = pencilColour();
    button.style.cssText = [
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

  function decorateThemeNames() {
    if (!themeRenameEnabled) {
      clearPencilButtons();
      return;
    }

    if (editing) {
      return;
    }

    // Drop orphaned buttons whose labels disappeared.
    document.querySelectorAll(`[${ BUTTON_ATTR }]`).forEach((button) => {
      const label = button.previousElementSibling;
      if (!label || !document.contains(label)) {
        button.remove();
      }
    });

    collectThemeNameTargets().forEach((labelEl) => {
      ensurePencilButton(labelEl);
    });
  }

  function scheduleDecorate() {
    if (decorateTimer) {
      clearTimeout(decorateTimer);
    }
    decorateTimer = setTimeout(() => {
      decorateThemeNames();
    }, 120);
  }

  async function refreshTheme() {
    try {
      currentTheme = await loadTheme();
    } catch (_error) {
      currentTheme = DEFAULT_THEME;
    }
  }

  async function refreshAll() {
    await Promise.all([
      refreshTheme(),
      refreshRenameSettings(),
    ]);
    scheduleDecorate();
  }

  refreshAll();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes[THEME_STORAGE_KEY]) {
      refreshTheme().then(scheduleDecorate);
    }
    if (areaName === 'local' && changes[SETTINGS_STORAGE_KEY]) {
      refreshRenameSettings().then(scheduleDecorate);
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

  // Debug from admin console (content-script context):
  //   window.shopifySkinsDebugRename()
  window.shopifySkinsDebugRename = async () => {
    await refreshRenameSettings();
    const links = queryAllDeep('a[href*="/themes/"], [href*="/themes/"]')
      .map((link) => {
        const href = link.href || link.getAttribute?.('href') || '';
        return {
          href,
          themeId: extractThemeIdFromHref(href),
          text: cleanText(link).slice(0, 60),
        };
      })
      .filter((row) => row.themeId);
    const targets = collectThemeNameTargets().map((el) => ({
      tag: el.tagName,
      text: cleanText(el),
      themeId: el.dataset.shopifySkinsThemeId || findThemeIdNear(el),
    }));
    const report = {
      themeRenameEnabled,
      href: location.href,
      storeHandle: await resolveStoreHandle(),
      themeLinkCount: links.length,
      links: links.slice(0, 20),
      targets,
      pencilCount: document.querySelectorAll(`[${ BUTTON_ATTR }]`).length,
    };
    console.log('shopifySkinsDebugRename', report);
    return report;
  };
})();
