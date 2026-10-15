importScripts('utils.js', 'settings.js');

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

