import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

const bundled = [
  read('theme_storage.js'),
  read('colour_scheme.js'),
  read('settings.js'),
  read('utils.js'),
  read('content.js'),
  read('preview.js'),
  read('rename.js'),
].join('\n;\n');

// Mirrors current admin: title outside the Customize CTA link (often with an SVG).
const html = `<!DOCTYPE html>
<html>
<head><title>Themes</title></head>
<body>
  <div class="Polaris-Page">
    <div class="Polaris-ShadowBevel theme-card">
      <h2 class="Polaris-Text--root Polaris-Text--headingSm">Dawn</h2>
      <p class="Polaris-Text--root">Added yesterday</p>
      <a class="Polaris-Button" href="/store/demo-shop/themes/123456789/editor">
        <svg width="20" height="20"></svg>
        <span>Customize</span>
      </a>
    </div>
    <div class="Polaris-ShadowBevel theme-card">
      <h2 class="Polaris-Text--root Polaris-Text--headingSm">Horizon</h2>
      <p class="Polaris-Text--root">Last saved 2 hours ago</p>
      <a class="Polaris-Button" href="/store/demo-shop/themes/987654321/editor">
        <svg width="20" height="20"></svg>
        <span>Customize</span>
      </a>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
const messages = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    errors.push(msg.text());
  }
});

await page.route('https://admin.shopify.com/**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: html,
  });
});

await page.goto('https://admin.shopify.com/store/demo-shop/themes');

await page.evaluate((source) => {
  const syncStore = {};
  const localStore = {};
  const syncListeners = [];
  const localListeners = [];

  function makeArea(store, listeners) {
    return {
      async get(key) {
        if (typeof key === 'string') {
          return { [key]: store[key] };
        }
        const out = {};
        for (const k of Object.keys(key || {})) {
          out[k] = store[k];
        }
        return out;
      },
      async set(values) {
        const changes = {};
        for (const [k, v] of Object.entries(values)) {
          changes[k] = {
            newValue: v,
            oldValue: store[k],
          };
          store[k] = v;
        }
        for (const listener of listeners) {
          listener(changes, store === syncStore ? 'sync' : 'local');
        }
      },
    };
  }

  window.__renameMessages = [];

  window.chrome = {
    storage: {
      sync: makeArea(syncStore, syncListeners),
      local: makeArea(localStore, localListeners),
      onChanged: {
        addListener(fn) {
          syncListeners.push((changes, area) => fn(changes, area));
          localListeners.push((changes, area) => fn(changes, area));
        },
      },
    },
    runtime: {
      sendMessage(message) {
        window.__renameMessages.push(message);
        if (message?.type === 'shopifySkinsRenameTheme') {
          return Promise.resolve({
            ok: true,
            data: {
              theme: {
                id: `gid://shopify/OnlineStoreTheme/${ message.payload.themeId }`,
                name: message.payload.name,
              },
            },
          });
        }
        return Promise.resolve({ ok: true });
      },
    },
  };

  // Seed: API key + rename + preview enabled (as popup would save).
  localStore.shopifySkinsSettings = {
    accessToken: '',
    accessTokensByStore: {
      'demo-shop': 'shpat_test_token',
    },
    themePreviewEnabled: true,
    themeRenameEnabled: true,
  };

  const script = document.createElement('script');
  script.textContent = source;
  document.documentElement.appendChild(script);
  script.remove();
}, bundled);

// decorate uses 120ms debounce
await page.waitForTimeout(250);

const withRenameOn = await page.evaluate(() => {
  const pencils = [...document.querySelectorAll('[data-shopify-skins-rename-btn]')];
  const previews = [...document.querySelectorAll('[data-shopify-skins-preview-btn]')];
  return {
    href: location.href,
    pencilCount: pencils.length,
    previewCount: previews.length,
    themeIds: pencils.map((el) => el.dataset.themeId),
    previewThemeIds: previews.map((el) => el.dataset.themeId),
    labels: [...document.querySelectorAll('h2')].map((el) => el.textContent.trim()),
  };
});
console.log('withRenameOn', withRenameOn);

// Click first pencil, rename, Enter (beginRename is async)
const renameFlow = await page.evaluate(async () => {
  const pencil = document.querySelector('[data-shopify-skins-rename-btn]');
  if (!pencil) {
    return { error: 'no pencil' };
  }
  pencil.click();

  let input = null;
  for (let i = 0; i < 20; i += 1) {
    input = document.querySelector('#shopify-skins-rename-popover input');
    if (input) {
      break;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  if (!input) {
    return {
      error: 'no popover input after click',
      toast: document.getElementById('shopify-skins-toast')?.textContent || null,
      messages: window.__renameMessages,
    };
  }

  input.value = 'Dawn Renamed';
  input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
  }));

  await new Promise((r) => setTimeout(r, 50));

  return {
    messages: window.__renameMessages,
    toast: document.getElementById('shopify-skins-toast')?.textContent || null,
    labelText: document.querySelector('h2')?.textContent?.trim() || null,
  };
});
console.log('renameFlow', JSON.stringify(renameFlow, null, 2));

// Toggle rename off via storage change — preview stays
const afterDisable = await page.evaluate(async () => {
  await chrome.storage.local.set({
    shopifySkinsSettings: {
      accessToken: '',
      accessTokensByStore: {
        'demo-shop': 'shpat_test_token',
      },
      themePreviewEnabled: true,
      themeRenameEnabled: false,
    },
  });
  await new Promise((r) => setTimeout(r, 200));
  return {
    pencilCount: document.querySelectorAll('[data-shopify-skins-rename-btn]').length,
    previewCount: document.querySelectorAll('[data-shopify-skins-preview-btn]').length,
  };
});
console.log('afterDisable', afterDisable);

// No token → no pencils even if flag true; preview still ok
const afterNoToken = await page.evaluate(async () => {
  await chrome.storage.local.set({
    shopifySkinsSettings: {
      accessToken: '',
      accessTokensByStore: {},
      themePreviewEnabled: true,
      themeRenameEnabled: true,
    },
  });
  await new Promise((r) => setTimeout(r, 200));
  return {
    pencilCount: document.querySelectorAll('[data-shopify-skins-rename-btn]').length,
    previewCount: document.querySelectorAll('[data-shopify-skins-preview-btn]').length,
  };
});
console.log('afterNoToken', afterNoToken);

// Preview off → no eyes
const afterPreviewOff = await page.evaluate(async () => {
  await chrome.storage.local.set({
    shopifySkinsSettings: {
      accessToken: '',
      accessTokensByStore: {
        'demo-shop': 'shpat_test_token',
      },
      themePreviewEnabled: false,
      themeRenameEnabled: true,
    },
  });
  await new Promise((r) => setTimeout(r, 200));
  return {
    pencilCount: document.querySelectorAll('[data-shopify-skins-rename-btn]').length,
    previewCount: document.querySelectorAll('[data-shopify-skins-preview-btn]').length,
  };
});
console.log('afterPreviewOff', afterPreviewOff);

console.log('pageErrors', errors);

await browser.close();

const renameMsg = renameFlow.messages?.find((m) => m.type === 'shopifySkinsRenameTheme');
const ok = withRenameOn.pencilCount === 2
  && withRenameOn.previewCount === 2
  && withRenameOn.themeIds.includes('123456789')
  && withRenameOn.previewThemeIds.includes('123456789')
  && renameMsg?.payload?.name === 'Dawn Renamed'
  && renameMsg?.payload?.storeHandle === 'demo-shop'
  && renameMsg?.payload?.themeId === '123456789'
  && afterDisable.pencilCount === 0
  && afterDisable.previewCount === 2
  && afterNoToken.pencilCount === 0
  && afterNoToken.previewCount === 2
  && afterPreviewOff.pencilCount === 2
  && afterPreviewOff.previewCount === 0
  && errors.length === 0;

if (!ok) {
  console.error('FAIL');
  process.exit(1);
}
console.log('PASS');
