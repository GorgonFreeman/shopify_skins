// Store switch: rewrite admin URLs across keyed shops.
// Handlers are a map of RegExp → function. The first matching regex wins;
// named capture groups (e.g. (?<id>\d+)) are passed into the handler.
// Otherwise base behaviour keeps the same path on another store, stripping a
// trailing numeric resource id to the index (orders/123 → /orders).

let storeSwitchHandlers = [];

function coerceHandlerPattern(pattern) {
  if (pattern instanceof RegExp) {
    return pattern;
  }
  // Object keys stringify RegExps as /source/flags — revive them.
  const raw = String(pattern);
  const lastSlash = raw.lastIndexOf('/');
  if (raw.startsWith('/') && lastSlash > 0) {
    return new RegExp(raw.slice(1, lastSlash), raw.slice(lastSlash + 1));
  }
  return new RegExp(raw);
}

function setStoreSwitchHandlers(handlerMap) {
  const entries = handlerMap instanceof Map
    ? [...handlerMap.entries()]
    : Array.isArray(handlerMap)
      ? handlerMap
      : Object.entries(handlerMap || {});

  storeSwitchHandlers = entries.map(([pattern, handle]) => {
    if (typeof handle !== 'function') {
      throw new Error('store switch handlers must be functions');
    }
    return [coerceHandlerPattern(pattern), handle];
  });
}

function rewriteAdminStoreUrl(url, targetStoreHandle) {
  const source = String(url || '');
  const handle = String(targetStoreHandle || '').trim();
  if (!handle) {
    return null;
  }
  if (!/admin\.shopify\.com\/store\/[^/?#]+/.test(source)) {
    return null;
  }
  return source.replace(
    /admin\.shopify\.com\/store\/[^/?#]+/,
    `admin.shopify.com/store/${ handle }`,
  );
}

// /store/x/orders/123 → /store/x/orders ; /store/x/markets/9 → /store/x/markets
function stripTrailingAdminResourceId(url) {
  const source = String(url || '');
  const next = source.replace(
    /^(https:\/\/admin\.shopify\.com\/store\/[^/?#]+\/.+?)\/\d+(?=[/?#]|$)/,
    '$1',
  );
  return next === source ? null : next;
}

function storeHandleFromAdminUrl(url) {
  const match = String(url || '').match(/admin\.shopify\.com\/store\/([^/?#]+)/);
  return match?.[1] || null;
}

async function resolveStoreSwitch({
  url,
  targetStoreHandle,
  currentStoreHandle,
  ...rest
} = {}) {
  const sourceUrl = String(url || '');
  const target = String(targetStoreHandle || '').trim();
  const current = String(currentStoreHandle || '').trim()
    || storeHandleFromAdminUrl(sourceUrl)
    || '';

  if (!target) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TARGET',
        message: 'Pick a store to switch to.',
      },
    };
  }

  if (current && current === target) {
    return {
      ok: false,
      error: {
        code: 'SAME_STORE',
        message: 'Already on that store.',
      },
    };
  }

  const ctx = {
    ...rest,
    url: sourceUrl,
    targetStoreHandle: target,
    currentStoreHandle: current || null,
  };

  for (const [pattern, handle] of storeSwitchHandlers) {
    const match = sourceUrl.match(pattern);
    if (!match) {
      continue;
    }
    return handle({
      ...ctx,
      ...(match.groups || {}),
    });
  }

  // Detail pages ending in a numeric id fall back to that resource's index
  // (orders → /orders, markets → /markets, etc.) unless a handler matched above.
  const resourceIndexUrl = stripTrailingAdminResourceId(sourceUrl) || sourceUrl;
  const nextUrl = rewriteAdminStoreUrl(resourceIndexUrl, target);
  if (!nextUrl) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_URL',
        message: 'Open a Shopify admin store URL to switch.',
      },
    };
  }

  return {
    ok: true,
    url: nextUrl,
  };
}
