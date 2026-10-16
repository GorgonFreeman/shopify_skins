(() => {
  const BUTTON_ATTR = 'data-shopify-skins-rename-btn';
  const POPOVER_ID = 'shopify-skins-rename-popover';
  const PENCIL_SVG = `
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM12.379 4.793 3 14.172V17h2.828l9.379-9.379-2.828-2.828Z"/>
    </svg>
  `.trim();

  const {
    EDITING_ATTR,
    MAX_THEME_NAME_LENGTH,
  } = ThemeActions;

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

  function themesFromAdminJsonPayload(payload) {
    if (Array.isArray(payload?.themes)) {
      return payload.themes;
    }
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload?.data?.themes)) {
      return payload.data.themes;
    }
    if (Array.isArray(payload?.themes?.nodes)) {
      return payload.themes.nodes;
    }
    return [];
  }

  async function findThemeIdFromAdminJson(storeHandle, themeName) {
    const handle = String(storeHandle || '').trim();
    const name = String(themeName || '').trim().toLowerCase();
    if (!handle || !name) {
      return {
        ok: false,
        error: {
          code: 'MISSING_ARGS',
          message: 'Need store handle and theme name.',
        },
      };
    }

    let response;
    try {
      response = await fetch(
        `https://admin.shopify.com/store/${ handle }/themes.json`,
        {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
          },
        },
      );
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Could not reach admin themes.json.',
          details: String(error?.message || error),
        },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: response.status === 401 || response.status === 403
            ? 'AUTH_ERROR'
            : 'HTTP_ERROR',
          message: `themes.json returned HTTP ${ response.status }.`,
        },
      };
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'BAD_RESPONSE',
          message: 'themes.json returned non-JSON.',
          details: String(error?.message || error),
        },
      };
    }

    const themes = themesFromAdminJsonPayload(payload);
    const matches = themes.filter((theme) => (
      String(theme?.name || '').trim().toLowerCase() === name
    ));
    // Duplicate "Copy of …" names are common — prefer a still-processing theme,
    // then the newest by created_at.
    matches.sort((left, right) => {
      const processingDelta = Number(Boolean(right?.processing))
        - Number(Boolean(left?.processing));
      if (processingDelta !== 0) {
        return processingDelta;
      }
      const leftCreated = Date.parse(left?.created_at || '') || 0;
      const rightCreated = Date.parse(right?.created_at || '') || 0;
      return rightCreated - leftCreated;
    });
    const match = matches[0] || null;
    const themeId = gidToId(
      match?.admin_graphql_api_id || match?.id || match?.theme_id || '',
    );
    if (!themeId) {
      return {
        ok: false,
        error: {
          code: 'THEME_NOT_FOUND',
          message: `No theme named “${ themeName }” in themes.json.`,
        },
      };
    }

    return {
      ok: true,
      themeId,
      source: 'admin-json',
      processing: Boolean(match?.processing),
    };
  }

  async function resolveThemeIdByName(storeHandle, themeName, {
    attempts = 8,
    delayMs = 750,
  } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const apiResult = await chrome.runtime.sendMessage({
          type: 'shopifySkinsFindThemeByName',
          payload: {
            storeHandle,
            themeName,
          },
        });
        if (apiResult?.ok && apiResult?.data?.theme?.id) {
          return {
            ok: true,
            themeId: gidToId(apiResult.data.theme.id),
            source: 'admin-api',
          };
        }
        lastError = apiResult?.error || null;

        // No token, auth issue, or API doesn't see the theme yet — try session themes.json.
        const jsonResult = await findThemeIdFromAdminJson(storeHandle, themeName);
        if (jsonResult.ok) {
          return jsonResult;
        }
        lastError = jsonResult.error || lastError;
      } catch (error) {
        lastError = {
          message: String(error?.message || error),
        };
      }
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return {
      ok: false,
      error: lastError,
    };
  }

  function renameInBackground({
    storeHandle,
    themeId,
    name,
    lookupName,
    labelEl,
    originalHtml,
    previousName,
  }) {
    chrome.runtime.sendMessage({
      type: 'shopifySkinsRenameTheme',
      payload: {
        storeHandle,
        themeId: gidToId(themeId),
        name,
        lookupName,
      },
    }).then(async (result) => {
      if (!result?.ok) {
        labelEl.dataset.shopifySkinsThemeName = previousName;
        restoreLabel(
          labelEl,
          originalHtml,
          ThemeActions.labelTextWithName(labelEl, previousName),
        );
        ThemeActions.scheduleDecorate();
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
        labelEl.dataset.shopifySkinsThemeName = confirmedName;
        restoreLabel(
          labelEl,
          originalHtml,
          ThemeActions.labelTextWithName(labelEl, confirmedName),
        );
      }
      ThemeActions.scheduleDecorate();
      toast(`Renamed to “${ confirmedName }”.`, 'ok');
    }).catch((error) => {
      labelEl.dataset.shopifySkinsThemeName = previousName;
      restoreLabel(
        labelEl,
        originalHtml,
        ThemeActions.labelTextWithName(labelEl, previousName),
      );
      ThemeActions.scheduleDecorate();
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
    if (ThemeActions.isPaused()) {
      return;
    }

    const storeHandle = await ThemeActions.resolveStoreHandle();
    const rawThemeId = ThemeActions.findThemeIdNear(labelEl)
      || labelEl.dataset.shopifySkinsThemeId
      || '';
    const pendingCopy = labelEl.dataset.shopifySkinsPendingCopy === 'true'
      || ThemeActions.isPendingThemeId(rawThemeId);
    let themeId = pendingCopy ? '' : gidToId(rawThemeId);
    const previousName = ThemeActions.themeNameFromLabel(labelEl);
    const originalHtml = labelEl.innerHTML;

    if (!previousName) {
      toast('Could not find theme name for rename.', 'error');
      return;
    }
    if (!storeHandle) {
      toast('Could not detect store from this admin tab.', 'error');
      return;
    }
    if (!themeId && !pendingCopy) {
      toast('Could not find theme id for rename.', 'error');
      return;
    }

    ThemeActions.setPaused(true);
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
      ThemeActions.setPaused(false);
      labelEl.removeAttribute(EDITING_ATTR);
      removeRenamePopover();
      document.removeEventListener('pointerdown', onPointerDown, true);

      const nextName = input.value.trim().slice(0, MAX_THEME_NAME_LENGTH);

      if (!save || !nextName || nextName === previousName) {
        ThemeActions.scheduleDecorate();
        return;
      }

      labelEl.dataset.shopifySkinsThemeName = nextName;
      restoreLabel(labelEl, originalHtml, ThemeActions.labelTextWithName(labelEl, nextName));
      ThemeActions.scheduleDecorate();

      (async () => {
        let resolvedThemeId = themeId;
        if (!resolvedThemeId || pendingCopy) {
          toast('Waiting for copy to finish…');
          const resolved = await resolveThemeIdByName(storeHandle, previousName);
          if (!resolved.ok) {
            labelEl.dataset.shopifySkinsThemeName = previousName;
            restoreLabel(
              labelEl,
              originalHtml,
              ThemeActions.labelTextWithName(labelEl, previousName),
            );
            ThemeActions.scheduleDecorate();
            toast(
              resolved.error?.message
                || 'Theme is still copying. Try rename again in a moment.',
              'error',
            );
            return;
          }
          resolvedThemeId = resolved.themeId;
          labelEl.dataset.shopifySkinsThemeId = resolvedThemeId;
          delete labelEl.dataset.shopifySkinsPendingCopy;
        }

        renameInBackground({
          storeHandle,
          themeId: resolvedThemeId,
          name: nextName,
          lookupName: previousName,
          labelEl,
          originalHtml,
          previousName,
        });
      })();
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

    setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 0);

    input.focus();
    input.select();
  }

  ThemeActions.register({
    id: 'rename',
    buttonAttr: BUTTON_ATTR,
    title: 'Rename theme',
    svg: PENCIL_SVG,
    async isEnabled(settings, storeHandle) {
      const hasToken = Boolean(tokenForStore(settings, storeHandle));
      return hasToken && settings.themeRenameEnabled === true;
    },
    onActivate(labelEl) {
      beginRename(labelEl);
    },
  });

  window.shopifySkinsDebugRename = async () => {
    await ThemeActions.refreshAndDecorate();
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
    const targets = ThemeActions.collectThemeNameTargets().map((el) => ({
      tag: el.tagName,
      text: cleanText(el),
      themeId: el.dataset.shopifySkinsThemeId || ThemeActions.findThemeIdNear(el),
    }));
    const report = {
      enabled: ThemeActions.isEnabled('rename'),
      href: location.href,
      storeHandle: await ThemeActions.resolveStoreHandle(),
      themeLinkCount: links.length,
      links: links.slice(0, 20),
      targets,
      pencilCount: document.querySelectorAll(`[${ BUTTON_ATTR }]`).length,
    };
    console.log('shopifySkinsDebugRename', report);
    return report;
  };
})();
