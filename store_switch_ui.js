(() => {
  if (window !== window.top) {
    return;
  }

  const HOST_ID = 'shopify-skins-store-switch';
  const DRAG_THRESHOLD_PX = 5;
  const DEFAULT_OFFSET = {
    top: 12,
    right: 12,
  };

  let host = null;
  let shadow = null;
  let rootEl = null;
  let pillEl = null;
  let labelEl = null;
  let menuEl = null;
  let open = false;
  let drag = null;
  let refreshTimer = null;
  let lastHref = location.href;
  let listenersBound = false;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function currentStoreHandle() {
    return parseAdminContext(location.href).storeHandle || '';
  }

  function switchContextPayload(targetStoreHandle) {
    return {
      targetStoreHandle,
      currentStoreHandle: currentStoreHandle(),
    };
  }

  function defaultPosition() {
    return {
      left: Math.max(12, window.innerWidth - 200 - DEFAULT_OFFSET.right),
      top: DEFAULT_OFFSET.top,
    };
  }

  function readPosition(settings) {
    const stored = settings?.storeSwitchPillPosition;
    if (
      stored
      && Number.isFinite(stored.left)
      && Number.isFinite(stored.top)
    ) {
      return {
        left: stored.left,
        top: stored.top,
      };
    }
    return defaultPosition();
  }

  async function savePosition(left, top) {
    try {
      const settings = await loadSettings();
      await saveSettings({
        ...settings,
        storeSwitchPillPosition: {
          left,
          top,
        },
      });
    } catch (_error) {
      // Position is best-effort.
    }
  }

  function applyPosition(left, top) {
    if (!host) {
      return null;
    }
    const width = host.offsetWidth || 160;
    const height = host.offsetHeight || 36;
    const nextLeft = clamp(left, 8, Math.max(8, window.innerWidth - width - 8));
    const nextTop = clamp(top, 8, Math.max(8, window.innerHeight - height - 8));
    host.style.left = `${ nextLeft }px`;
    host.style.top = `${ nextTop }px`;
    host.style.right = 'auto';
    return {
      left: nextLeft,
      top: nextTop,
    };
  }

  function setOpen(nextOpen) {
    open = Boolean(nextOpen);
    if (!rootEl || !menuEl || !pillEl) {
      return;
    }
    rootEl.classList.toggle('is-open', open);
    pillEl.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuEl.hidden = !open;
  }

  function hideUi() {
    setOpen(false);
    if (host) {
      host.hidden = true;
    }
  }

  function onPointerDown(event) {
    if (event.button !== 0 || !host || host.hidden) {
      return;
    }
    const rect = host.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
    };
    try {
      pillEl.setPointerCapture(event.pointerId);
    } catch (_error) {
      // Capture is optional.
    }
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId || !host) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      drag.moved = true;
      setOpen(false);
    }
    if (!drag.moved) {
      return;
    }
    event.preventDefault();
    applyPosition(drag.originLeft + dx, drag.originTop + dy);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const wasDrag = drag.moved;
    const left = host ? host.getBoundingClientRect().left : 0;
    const top = host ? host.getBoundingClientRect().top : 0;
    drag = null;
    try {
      pillEl.releasePointerCapture(event.pointerId);
    } catch (_error) {
      // Ignore.
    }
    if (wasDrag) {
      const clamped = applyPosition(left, top);
      if (clamped) {
        savePosition(clamped.left, clamped.top);
      }
      return;
    }
    setOpen(!open);
  }

  function onMenuClick(event) {
    const option = event.target.closest('.option');
    if (!option?.dataset?.storeHandle) {
      return;
    }
    const targetStoreHandle = option.dataset.storeHandle;
    setOpen(false);

    chrome.runtime.sendMessage({
      type: 'shopifySkinsSwitchStore',
      payload: switchContextPayload(targetStoreHandle),
    }).then((result) => {
      if (!result?.ok) {
        toast(result?.error?.message || 'Could not switch stores.', 'error');
      }
    }).catch((_error) => {
      toast('Could not switch stores.', 'error');
    });
  }

  function onDocumentPointerDown(event) {
    if (!open || !host || host.hidden) {
      return;
    }
    const path = typeof event.composedPath === 'function'
      ? event.composedPath()
      : [];
    if (path.includes(host)) {
      return;
    }
    setOpen(false);
  }

  function onResize() {
    if (!host || host.hidden) {
      return;
    }
    const rect = host.getBoundingClientRect();
    applyPosition(rect.left, rect.top);
  }

  function bindListeners() {
    if (listenersBound || !pillEl || !menuEl) {
      return;
    }
    pillEl.addEventListener('pointerdown', onPointerDown);
    pillEl.addEventListener('pointermove', onPointerMove);
    pillEl.addEventListener('pointerup', onPointerUp);
    pillEl.addEventListener('pointercancel', onPointerUp);
    menuEl.addEventListener('click', onMenuClick);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    window.addEventListener('resize', onResize);
    listenersBound = true;
  }

  function ensureUi() {
    if (host) {
      return;
    }

    host = document.createElement('div');
    host.id = HOST_ID;
    host.hidden = true;
    host.style.position = 'fixed';
    host.style.zIndex = '2147483646';
    host.style.top = `${ DEFAULT_OFFSET.top }px`;
    host.style.right = `${ DEFAULT_OFFSET.right }px`;
    host.style.left = 'auto';

    shadow = host.attachShadow({
      mode: 'open',
    });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        }
        .root {
          position: relative;
          display: inline-block;
          user-select: none;
          -webkit-user-select: none;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          max-width: min(280px, calc(100vw - 24px));
          padding: 8px 10px 8px 12px;
          border: 0;
          border-radius: 999px;
          background: #111;
          color: #fff;
          font: 600 12px/1.2 "IBM Plex Sans", "Segoe UI", sans-serif;
          letter-spacing: 0.01em;
          cursor: grab;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
        }
        .pill:active {
          cursor: grabbing;
        }
        .pill:focus-visible {
          outline: 2px solid #94FFB2;
          outline-offset: 2px;
        }
        .label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: "IBM Plex Mono", ui-monospace, monospace;
          font-size: 12px;
          font-weight: 600;
        }
        .chevron {
          flex: 0 0 auto;
          width: 8px;
          height: 8px;
          border-right: 2px solid currentColor;
          border-bottom: 2px solid currentColor;
          transform: rotate(45deg);
          margin-top: -3px;
          opacity: 0.85;
          transition: transform 120ms ease;
        }
        .root.is-open .chevron {
          transform: rotate(225deg);
          margin-top: 3px;
        }
        .menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 100%;
          max-width: min(320px, calc(100vw - 24px));
          padding: 6px;
          border-radius: 12px;
          background: #111;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
        }
        .menu[hidden] {
          display: none;
        }
        .option {
          display: block;
          width: 100%;
          border: 0;
          border-radius: 8px;
          padding: 8px 10px;
          background: transparent;
          color: #fff;
          font: 600 12px/1.2 "IBM Plex Mono", ui-monospace, monospace;
          text-align: left;
          cursor: pointer;
        }
        .option:hover,
        .option:focus-visible {
          background: rgba(255, 255, 255, 0.12);
          outline: none;
        }
      </style>
      <div class="root">
        <button class="pill" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span class="label"></span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
        <div class="menu" role="listbox" hidden></div>
      </div>
    `;

    rootEl = shadow.querySelector('.root');
    pillEl = shadow.querySelector('.pill');
    labelEl = shadow.querySelector('.label');
    menuEl = shadow.querySelector('.menu');
    bindListeners();

    const mount = () => {
      if (!document.documentElement.contains(host)) {
        document.documentElement.appendChild(host);
      }
    };
    if (document.documentElement) {
      mount();
    } else {
      document.addEventListener('DOMContentLoaded', mount, {
        once: true,
      });
    }
  }

  function renderMenu(targets) {
    if (!menuEl) {
      return;
    }
    menuEl.replaceChildren();
    for (const handle of targets) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'option';
      option.setAttribute('role', 'option');
      option.dataset.storeHandle = handle;
      option.textContent = handle;
      menuEl.appendChild(option);
    }
  }

  async function refresh() {
    ensureUi();

    let settings;
    try {
      settings = await loadSettings();
    } catch (_error) {
      hideUi();
      return;
    }

    const storeHandle = currentStoreHandle();
    const allKeyed = keyedStoreHandles(settings);
    const targets = keyedStoreHandles(settings, {
      excludeHandle: storeHandle,
    });
    const shouldShow = Boolean(
      settings.storeSwitchEnabled
      && storeHandle
      && allKeyed.length > 1
      && targets.length > 0,
    );

    if (!shouldShow) {
      hideUi();
      return;
    }

    labelEl.textContent = storeHandle;
    pillEl.title = `Switch from ${ storeHandle }`;
    renderMenu(targets);

    const position = readPosition(settings);
    applyPosition(position.left, position.top);
    host.hidden = false;
  }

  function scheduleRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      refresh();
    }, 80);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_STORAGE_KEY]) {
      return;
    }
    scheduleRefresh();
  });

  setInterval(() => {
    if (location.href === lastHref) {
      return;
    }
    lastHref = location.href;
    setOpen(false);
    scheduleRefresh();
  }, 400);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleRefresh, {
      once: true,
    });
  } else {
    scheduleRefresh();
  }
})();
