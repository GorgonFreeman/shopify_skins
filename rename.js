(() => {
  const MAX_THEME_NAME_LENGTH = 50;
  const EDITING_ATTR = 'data-shopify-skins-renaming';
  const BUTTON_ATTR = 'data-shopify-skins-rename-btn';
  const TEAL = '#0D9488';
  const PENCIL_SVG = `
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM12.379 4.793 3 14.172V17h2.828l9.379-9.379-2.828-2.828Z"/>
    </svg>
  `.trim();

  let editing = false;
  let decorateTimer = null;
  let currentTheme = DEFAULT_THEME;

  function parseAdminContext(url = location.href) {
    const storeMatch = url.match(/admin\.shopify\.com\/store\/([^/?#]+)/);
    const themeMatch = url.match(/\/themes\/(\d+)/);
    return {
      storeHandle: storeMatch?.[1] || null,
      themeId: themeMatch?.[1] || null,
    };
  }

  function findThemeIdNear(element) {
    let node = element;
    while (node && node !== document.documentElement) {
      if (node instanceof HTMLAnchorElement) {
        const match = node.href.match(/\/themes\/(\d+)/);
        if (match) {
          return match[1];
        }
      }

      const link = node.querySelector?.('a[href*="/themes/"]');
      if (link) {
        const match = link.href.match(/\/themes\/(\d+)/);
        if (match) {
          return match[1];
        }
      }

      node = node.parentElement;
    }

    return parseAdminContext().themeId;
  }

  function looksLikeThemeName(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (element.matches(`[${ BUTTON_ATTR }]`)) {
      return false;
    }
    if (element.closest(`[${ BUTTON_ATTR }]`)) {
      return false;
    }

    const text = (element.textContent || '').trim();
    if (!text || text.length > MAX_THEME_NAME_LENGTH + 10) {
      return false;
    }
    if (element.querySelector('input, textarea, button, svg')) {
      return false;
    }
    if (element.children.length > 2) {
      return false;
    }

    const tag = element.tagName;
    return ['H1', 'H2', 'H3', 'H4', 'SPAN', 'P', 'A', 'DIV'].includes(tag);
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

  function beginRename(labelEl) {
    if (editing) {
      return;
    }

    const { storeHandle } = parseAdminContext();
    const themeId = findThemeIdNear(labelEl);
    const previousName = (labelEl.textContent || '').trim();
    const originalHtml = labelEl.innerHTML;

    if (!storeHandle || !themeId || !previousName) {
      toast('Could not find theme id for rename.', 'error');
      return;
    }

    editing = true;
    labelEl.setAttribute(EDITING_ATTR, 'true');

    // Hide nearby pencil while editing this label.
    labelEl.parentElement
      ?.querySelectorAll(`[${ BUTTON_ATTR }]`)
      .forEach((button) => {
        button.style.display = 'none';
      });

    const input = document.createElement('input');
    input.type = 'text';
    input.value = previousName;
    input.maxLength = MAX_THEME_NAME_LENGTH;
    input.setAttribute(EDITING_ATTR, 'true');
    input.style.cssText = [
      'width:min(320px,100%)',
      'font:inherit',
      'color:inherit',
      'background:rgba(255,255,255,.92)',
      'border:1px solid rgba(0,0,0,.25)',
      'border-radius:6px',
      'padding:2px 6px',
      'box-sizing:border-box',
    ].join(';');

    labelEl.textContent = '';
    labelEl.appendChild(input);
    input.focus();
    input.select();

    let finished = false;

    function finish(save) {
      if (finished) {
        return;
      }
      finished = true;
      editing = false;

      const nextName = input.value.trim().slice(0, MAX_THEME_NAME_LENGTH);
      input.remove();

      if (!save || !nextName || nextName === previousName) {
        restoreLabel(labelEl, originalHtml, previousName);
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

    input.addEventListener('blur', () => {
      finish(true);
    });
  }

  function collectThemeNameTargets() {
    const targets = new Set();
    const { themeId } = parseAdminContext();

    document.querySelectorAll('a[href*="/themes/"]').forEach((link) => {
      if (!/\/themes\/\d+/.test(link.href)) {
        return;
      }

      const nested = link.querySelector('h1, h2, h3, h4, span, p');
      if (nested && looksLikeThemeName(nested)) {
        targets.add(nested);
        return;
      }

      if (looksLikeThemeName(link)) {
        targets.add(link);
      }
    });

    if (themeId) {
      document.querySelectorAll('h1, h2, h3').forEach((heading) => {
        if (looksLikeThemeName(heading) && findThemeIdNear(heading)) {
          targets.add(heading);
        }
      });
    }

    return [...targets];
  }

  function ensurePencilButton(labelEl) {
    if (labelEl.getAttribute(EDITING_ATTR) === 'true') {
      return;
    }

    const themeId = findThemeIdNear(labelEl);
    if (!themeId) {
      return;
    }

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
    scheduleDecorate();
  }

  refreshTheme();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes[THEME_STORAGE_KEY]) {
      refreshTheme();
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
})();
