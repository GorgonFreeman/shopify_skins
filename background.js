importScripts('utils.js', 'settings.js', 'store_switch.js');

const SHOPIFY_API_VERSION = '2025-10';

const THEME_UPDATE_MUTATION = `
  mutation themeUpdate($id: ID!, $input: OnlineStoreThemeInput!) {
    themeUpdate(id: $id, input: $input) {
      theme {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`.trim();

const PRODUCT_BY_HANDLE_QUERY = `
  query productByHandle($identifier: ProductIdentifierInput!) {
    product: productByIdentifier(identifier: $identifier) {
      id
      handle
    }
  }
`.trim();

const PRODUCT_BY_ID_QUERY = `
  query productById($id: ID!) {
    product(id: $id) {
      id
      handle
    }
  }
`.trim();

const PRODUCT_ADMIN_PATH = /admin\.shopify\.com\/store\/[^/?#]+\/products\/\d+/;

async function renameTheme({
  storeHandle,
  themeId,
  name,
  accessToken: accessTokenOverride,
}) {
  const settings = await loadSettings();
  const accessToken = String(
    accessTokenOverride || tokenForStore(settings, storeHandle) || '',
  ).trim();

  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to rename themes.',
      },
    };
  }

  if (!storeHandle || !themeId || !name) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle, theme id, and name.',
      },
    };
  }

  const url = `https://${ storeHandle }.myshopify.com/admin/api/${ SHOPIFY_API_VERSION }/graphql.json`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: THEME_UPDATE_MUTATION,
        variables: {
          id: `gid://shopify/OnlineStoreTheme/${ gidToId(themeId) }`,
          input: {
            name,
          },
        },
      }),
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Could not reach Shopify Admin API.',
        details: String(error?.message || error),
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
        message: `Shopify returned non-JSON (${ response.status }).`,
        details: String(error?.message || error),
      },
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Token rejected for this store. Enter a token for the current shop.',
        details: payload,
      },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: 'HTTP_ERROR',
        message: payload?.errors?.[0]?.message || `Shopify HTTP ${ response.status }`,
        details: payload,
      },
    };
  }

  if (payload?.errors?.length) {
    const message = payload.errors.map((error) => error.message).filter(Boolean).join('; ');
    const authish = /access|denied|unauthorized|forbidden|token/i.test(message);
    return {
      ok: false,
      error: {
        code: authish ? 'AUTH_ERROR' : 'GRAPHQL_ERROR',
        message: message || 'GraphQL error',
        details: payload.errors,
      },
    };
  }

  const themeUpdate = payload?.data?.themeUpdate;
  const userErrors = themeUpdate?.userErrors || [];
  if (userErrors.length) {
    return {
      ok: false,
      error: {
        code: 'USER_ERROR',
        message: userErrors.map((error) => error.message).filter(Boolean).join('; ') || 'Rename failed',
        details: userErrors,
      },
    };
  }

  return {
    ok: true,
    data: {
      theme: themeUpdate?.theme,
    },
  };
}

async function shopifyAdminGraphql({
  storeHandle,
  accessToken,
  query,
  variables,
}) {
  const url = `https://${ storeHandle }.myshopify.com/admin/api/${ SHOPIFY_API_VERSION }/graphql.json`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Could not reach Shopify Admin API.',
        details: String(error?.message || error),
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
        message: `Shopify returned non-JSON (${ response.status }).`,
        details: String(error?.message || error),
      },
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Token rejected for this store. Enter a token for the current shop.',
        details: payload,
      },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: 'HTTP_ERROR',
        message: payload?.errors?.[0]?.message || `Shopify HTTP ${ response.status }`,
        details: payload,
      },
    };
  }

  if (payload?.errors?.length) {
    const message = payload.errors.map((error) => error.message).filter(Boolean).join('; ');
    const authish = /access|denied|unauthorized|forbidden|token/i.test(message);
    return {
      ok: false,
      error: {
        code: authish ? 'AUTH_ERROR' : 'GRAPHQL_ERROR',
        message: message || 'GraphQL error',
        details: payload.errors,
      },
    };
  }

  return {
    ok: true,
    data: payload?.data,
  };
}

async function accessTokenForStore(storeHandle) {
  const settings = await loadSettings();
  return tokenForStore(settings, storeHandle);
}

async function findProductByHandle(storeHandle, productHandle) {
  const accessToken = await accessTokenForStore(storeHandle);
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to look up products.',
      },
    };
  }

  const handle = String(productHandle || '').trim();
  if (!storeHandle || !handle) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle and product handle.',
      },
    };
  }

  const result = await shopifyAdminGraphql({
    storeHandle,
    accessToken,
    query: PRODUCT_BY_HANDLE_QUERY,
    variables: {
      identifier: {
        handle,
      },
    },
  });

  if (!result.ok) {
    return result;
  }

  const product = result.data?.product || null;
  if (!product?.id) {
    return {
      ok: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: `No product with handle "${ handle }" on ${ storeHandle }.`,
      },
    };
  }

  return {
    ok: true,
    data: {
      product,
    },
  };
}

async function findProductHandleById(storeHandle, productId) {
  const accessToken = await accessTokenForStore(storeHandle);
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to look up products.',
      },
    };
  }

  const id = gidToId(productId);
  if (!storeHandle || !id) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle and product id.',
      },
    };
  }

  const result = await shopifyAdminGraphql({
    storeHandle,
    accessToken,
    query: PRODUCT_BY_ID_QUERY,
    variables: {
      id: `gid://shopify/Product/${ id }`,
    },
  });

  if (!result.ok) {
    return result;
  }

  const handle = String(result.data?.product?.handle || '').trim();
  if (!handle) {
    return {
      ok: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: 'Could not resolve a handle for this product.',
      },
    };
  }

  return {
    ok: true,
    data: {
      handle,
    },
  };
}

async function switchProductByHandle({
  url,
  targetStoreHandle,
  currentStoreHandle,
  productHandle,
}) {
  let handle = String(productHandle || '').trim();

  // Prefer handle from the admin UI; fall back to looking it up on this store.
  if (!handle && currentStoreHandle) {
    const productId = String(url || '').match(/\/products\/(\d+)/)?.[1];
    if (productId) {
      const current = await findProductHandleById(currentStoreHandle, productId);
      if (current.ok) {
        handle = current.data.handle;
      } else if (current.error?.code !== 'MISSING_TOKEN') {
        return current;
      }
    }
  }

  if (!handle) {
    return {
      ok: false,
      error: {
        code: 'MISSING_PRODUCT_HANDLE',
        message: 'Could not read the product handle from this page.',
      },
    };
  }

  const lookup = await findProductByHandle(targetStoreHandle, handle);
  if (!lookup.ok) {
    return lookup;
  }

  const productId = gidToId(lookup.data.product.id);
  if (!productId) {
    return {
      ok: false,
      error: {
        code: 'BAD_PRODUCT',
        message: 'Shopify returned a product without an id.',
      },
    };
  }

  return {
    ok: true,
    url: `https://admin.shopify.com/store/${ targetStoreHandle }/products/${ productId }`,
  };
}

registerStoreSwitchHandler(PRODUCT_ADMIN_PATH, switchProductByHandle);

async function openExtensionPopup({
  focusToken = false,
  storeHandle = '',
} = {}) {
  const params = new URLSearchParams();
  if (focusToken) {
    params.set('focus', 'token');
  }
  if (storeHandle) {
    params.set('store', storeHandle);
  }
  const query = params.toString();
  const popupPath = query ? `popup.html?${ query }` : 'popup.html';

  await chrome.action.setPopup({
    popup: popupPath,
  });

  try {
    if (chrome.action.openPopup) {
      await chrome.action.openPopup();
      return {
        ok: true,
        data: {
          mode: 'action',
        },
      };
    }
    throw new Error('openPopup unavailable');
  } catch (error) {
    await chrome.windows.create({
      url: chrome.runtime.getURL(popupPath),
      type: 'popup',
      width: 380,
      height: 580,
      focused: true,
    });
    return {
      ok: true,
      data: {
        mode: 'window',
        fallback: String(error?.message || error),
      },
    };
  } finally {
    // Restore the default toolbar popup path.
    await chrome.action.setPopup({
      popup: 'popup.html',
    });
  }
}

function storeHandleFromUrl(url) {
  const match = String(url || '').match(/admin\.shopify\.com\/store\/([^/?#]+)/);
  if (match) {
    return match[1];
  }
  const shop = String(url || '').match(/[?&](?:shop|store)=([^&]+)/i);
  if (shop) {
    return decodeURIComponent(shop[1])
      .replace(/\.myshopify\.com$/i, '')
      .split('.')[0] || null;
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'shopifySkinsGetTabContext') {
    const tabUrl = sender?.tab?.url || '';
    sendResponse({
      ok: true,
      data: {
        tabUrl,
        storeHandle: storeHandleFromUrl(tabUrl),
      },
    });
    return false;
  }

  if (message?.type === 'shopifySkinsGetToken') {
    const storeHandle = message.payload?.storeHandle
      || storeHandleFromUrl(sender?.tab?.url);
    loadSettings()
      .then((settings) => sendResponse({
        ok: true,
        data: {
          accessToken: tokenForStore(settings, storeHandle),
          storeHandle: storeHandle || null,
        },
      }))
      .catch((error) => sendResponse({
        ok: false,
        error: {
          code: 'UNEXPECTED',
          message: String(error?.message || error),
        },
      }));
    return true;
  }

  if (message?.type === 'shopifySkinsSaveToken') {
    saveTokenForStore(
      message.payload?.storeHandle,
      message.payload?.accessToken,
    )
      .then(() => sendResponse({
        ok: true,
      }))
      .catch((error) => sendResponse({
        ok: false,
        error: {
          code: 'UNEXPECTED',
          message: String(error?.message || error),
        },
      }));
    return true;
  }

  if (message?.type === 'shopifySkinsOpenPopup') {
    openExtensionPopup(message.payload || {})
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        ok: false,
        error: {
          code: 'POPUP_FAILED',
          message: String(error?.message || error),
        },
      }));
    return true;
  }

  if (message?.type === 'shopifySkinsSwitchStore') {
    (async () => {
      const settings = await loadSettings();
      if (!settings.storeSwitchEnabled) {
        return {
          ok: false,
          error: {
            code: 'DISABLED',
            message: 'Turn on Switch stores in Shopify Skins.',
          },
        };
      }

      const targetStoreHandle = String(
        message.payload?.targetStoreHandle || '',
      ).trim();
      if (!hasKeyedTokenForStore(settings, targetStoreHandle)) {
        return {
          ok: false,
          error: {
            code: 'MISSING_TARGET_TOKEN',
            message: 'Enter an API key for that store first.',
          },
        };
      }

      let tab = sender?.tab || null;
      if (!tab?.id) {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        tab = tabs?.[0] || null;
      }

      if (!tab?.id || !tab.url) {
        return {
          ok: false,
          error: {
            code: 'NO_TAB',
            message: 'No active Shopify admin tab to switch.',
          },
        };
      }

      const resolved = await resolveStoreSwitch({
        url: tab.url,
        targetStoreHandle,
        currentStoreHandle: message.payload?.currentStoreHandle
          || storeHandleFromUrl(tab.url),
        productHandle: message.payload?.productHandle || '',
      });

      if (!resolved?.ok) {
        return resolved;
      }

      if (resolved.url && resolved.url !== tab.url) {
        await chrome.tabs.update(tab.id, {
          url: resolved.url,
        });
      }

      return {
        ok: true,
        data: {
          url: resolved.url,
          targetStoreHandle,
        },
      };
    })()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        ok: false,
        error: {
          code: 'UNEXPECTED',
          message: String(error?.message || error),
        },
      }));
    return true;
  }

  if (message?.type !== 'shopifySkinsRenameTheme') {
    return false;
  }

  const payload = {
    ...(message.payload || {}),
  };
  if (!payload.storeHandle) {
    payload.storeHandle = storeHandleFromUrl(sender?.tab?.url);
  }

  renameTheme(payload)
    .then(async (result) => {
      if (
        !result?.ok
        && ['MISSING_TOKEN', 'AUTH_ERROR'].includes(result?.error?.code)
      ) {
        try {
          await openExtensionPopup({
            focusToken: true,
            storeHandle: payload.storeHandle || '',
          });
        } catch (_error) {
          // Rename error still returned below.
        }
      }
      sendResponse(result);
    })
    .catch((error) => sendResponse({
      ok: false,
      error: {
        code: 'UNEXPECTED',
        message: String(error?.message || error),
      },
    }));

  return true;
});

