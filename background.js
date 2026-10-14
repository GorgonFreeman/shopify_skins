importScripts('settings.js');

async function renameThemeViaMineral({
  storeHandle,
  themeId,
  name,
}) {
  const settings = await loadSettings();
  const accessToken = String(settings.accessToken || '').trim();
  const mineralUrl = String(settings.mineralUrl || DEFAULT_SETTINGS.mineralUrl).replace(/\/$/, '');

  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'Add a Shopify Admin API access token in the Shopify Skins popup.',
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

  let response;
  try {
    response = await fetch(`${ mineralUrl }/shopifyThemeUpdate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        credsPayload: {
          credsObject: {
            STORE_HANDLE: storeHandle,
            API_KEY: accessToken,
          },
        },
        themeId: String(themeId),
        updatePayload: {
          name,
        },
      }),
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'MINERAL_UNREACHABLE',
        message: `Could not reach mineral at ${ mineralUrl }. Run npm run mineral in shopify_skins.`,
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
        message: `Mineral returned non-JSON (${ response.status }).`,
        details: String(error?.message || error),
      },
    };
  }

  if (!response.ok && payload?.ok !== true) {
    return {
      ok: false,
      error: payload?.error || {
        code: 'HTTP_ERROR',
        message: `Mineral HTTP ${ response.status }`,
        details: payload,
      },
    };
  }

  return payload;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'shopifySkinsRenameTheme') {
    return false;
  }

  renameThemeViaMineral(message.payload || {})
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({
      ok: false,
      error: {
        code: 'UNEXPECTED',
        message: String(error?.message || error),
      },
    }));

  return true;
});
