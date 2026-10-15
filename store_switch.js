// Store switch: rewrite admin URLs across keyed shops.
// Custom handlers can register for specific URL patterns; otherwise base
// behaviour keeps the same path on another store.

const storeSwitchHandlers = [];

function registerStoreSwitchHandler(pattern, handle) {
  if (typeof pattern?.test !== 'function' || typeof handle !== 'function') {
    throw new Error('registerStoreSwitchHandler requires a pattern with .test and a function');
  }
  storeSwitchHandlers.push({
    pattern,
    handle,
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

function storeHandleFromAdminUrl(url) {
  const match = String(url || '').match(/admin\.shopify\.com\/store\/([^/?#]+)/);
  return match?.[1] || null;
}

async function resolveStoreSwitch({
  url,
  targetStoreHandle,
  currentStoreHandle,
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
    url: sourceUrl,
    targetStoreHandle: target,
    currentStoreHandle: current || null,
  };

  for (const handler of storeSwitchHandlers) {
    if (handler.pattern.test(sourceUrl)) {
      return handler.handle(ctx);
    }
  }

  const nextUrl = rewriteAdminStoreUrl(sourceUrl, target);
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
