(() => {
  const MAX_THEME_NAME_LENGTH = 50;
  const EDITING_ATTR = 'data-shopify-skins-renaming';
  let editing = false;

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

  function isEditableTarget(element) {
    if (!(element instanceof Element)) {
      return false;
    }
    if (element.closest(`[${ EDITING_ATTR }]`)) {
      return false;
    }
    if (element.closest('input, textarea, select, [contenteditable="true"]')) {
      return false;
    }
    return true;
  }

  function looksLikeThemeName(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const text = (element.textContent || '').trim();
    if (!text || text.length > MAX_THEME_NAME_LENGTH + 10) {
      return false;
    }
    if (element.children.length > 2) {
      return false;
    }

    const tag = element.tagName;
    if (['H1', 'H2', 'H3', 'H4', 'SPAN', 'P', 'A', 'DIV', 'BUTTON'].includes(tag)) {
      return true;
    }

    return Boolean(element.closest('a[href*="/themes/"]'));
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

    // Prefer updating the deepest text-bearing leaf so structure stays intact.
    const walker = document.createTreeWalker(labelEl, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    if (textNode) {
      textNode.nodeValue = text;
      return;
    }

    labelEl.textContent = text;
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
    }).then((result) => {
      if (!result?.ok) {
        restoreLabel(labelEl, originalHtml, previousName);
        toast(result?.error?.message || 'Rename failed.', 'error');
        return;
      }

      const confirmedName = result?.data?.theme?.name || name;
      if (confirmedName !== name) {
        restoreLabel(labelEl, originalHtml, confirmedName);
      }
      toast(`Renamed to “${ confirmedName }”.`, 'ok');
    }).catch((error) => {
      restoreLabel(labelEl, originalHtml, previousName);
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
        return;
      }

      // Optimistic: restore original markup with the new name immediately.
      restoreLabel(labelEl, originalHtml, nextName);

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

  document.addEventListener('dblclick', (event) => {
    const target = event.target;
    if (!isEditableTarget(target)) {
      return;
    }

    let candidate = target;
    if (!looksLikeThemeName(candidate)) {
      candidate = target.closest?.('a[href*="/themes/"] h1, a[href*="/themes/"] h2, a[href*="/themes/"] h3, a[href*="/themes/"] span, a[href*="/themes/"] p, h1, h2, h3');
    }

    if (!candidate || !looksLikeThemeName(candidate)) {
      return;
    }

    if (!findThemeIdNear(candidate) && !parseAdminContext().themeId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    beginRename(candidate);
  }, true);
})();
