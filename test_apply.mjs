import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const themeStorage = fs.readFileSync(path.join(__dirname, 'theme_storage.js'), 'utf8');
const colourScheme = fs.readFileSync(path.join(__dirname, 'colour_scheme.js'), 'utf8');
const content = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');

const html = `<!DOCTYPE html>
<html>
<head><title>Polaris mock</title></head>
<body>
  <div data-polaris-custom-properties="true" class="Polaris-Frame" id="frame">
    <div class="Polaris-Frame__Main" id="AppFrameMain">Hello admin</div>
  </div>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    errors.push(msg.text());
  }
});

await page.setContent(html);

// Chrome content_scripts share one scope across the js[] list — concatenate like the browser does.
const bundled = [themeStorage, colourScheme, content].join('\n;\n');

await page.evaluate((source) => {
  const store = {
    shopifySkinsTheme: undefined,
  };
  const listeners = [];

  window.chrome = {
    storage: {
      sync: {
        async get(key) {
          if (typeof key === 'string') {
            return { [key]: store[key] };
          }
          return { ...store };
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
            listener(changes, 'sync');
          }
        },
      },
      onChanged: {
        addListener(fn) {
          listeners.push(fn);
        },
      },
    },
  };

  // Direct eval so top-level const binds into this function... but content scripts
  // need global bindings. Attach via script tag instead.
  const script = document.createElement('script');
  script.textContent = source;
  document.documentElement.appendChild(script);
  script.remove();
}, bundled);

// Wait for initial syncFromStorage
await page.waitForTimeout(100);

const afterLoad = await page.evaluate(() => {
  const style = document.getElementById('shopify-skins-style');
  const active = document.documentElement.getAttribute('data-shopify-skins');
  const frame = document.getElementById('frame');
  const bg = frame?.style.getPropertyValue('--p-color-app-bg') || '';
  return {
    hasStyle: Boolean(style),
    styleLen: style?.textContent?.length || 0,
    active,
    frameBg: bg,
    hasApplyHelper: typeof window.shopifySkinsApply === 'function',
  };
});

console.log('afterLoad', afterLoad);

const unapplyResult = await page.evaluate(async () => {
  const result = await window.shopifySkinsUnapply();
  return {
    result,
    hasStyle: Boolean(document.getElementById('shopify-skins-style')),
    active: document.documentElement.getAttribute('data-shopify-skins'),
    frameBg: document.getElementById('frame')?.style.getPropertyValue('--p-color-app-bg') || '',
  };
});
console.log('unapply', unapplyResult);

const applyResult = await page.evaluate(async () => {
  const result = await window.shopifySkinsApply();
  return {
    result,
    hasStyle: Boolean(document.getElementById('shopify-skins-style')),
    active: document.documentElement.getAttribute('data-shopify-skins'),
    frameBg: document.getElementById('frame')?.style.getPropertyValue('--p-color-app-bg') || '',
  };
});
console.log('apply', applyResult);

// Simulate Polaris remount: replace frame without our marks
const remountResult = await page.evaluate(async () => {
  const old = document.getElementById('frame');
  const next = document.createElement('div');
  next.id = 'frame';
  next.className = 'Polaris-Frame';
  next.setAttribute('data-polaris-custom-properties', 'true');
  next.innerHTML = '<div class="Polaris-Frame__Main" id="AppFrameMain">remounted</div>';
  old.replaceWith(next);

  await new Promise((r) => setTimeout(r, 120));

  return {
    hasStyle: Boolean(document.getElementById('shopify-skins-style')),
    active: document.documentElement.getAttribute('data-shopify-skins'),
    frameBg: document.getElementById('frame')?.style.getPropertyValue('--p-color-app-bg') || '',
    rooted: document.getElementById('frame')?.getAttribute('data-shopify-skins-rooted'),
  };
});
console.log('remount', remountResult);

console.log('pageErrors', errors);

await browser.close();

const ok = afterLoad.hasStyle
  && afterLoad.active === 'active'
  && unapplyResult.hasStyle === false
  && applyResult.hasStyle === true
  && applyResult.frameBg.length > 0
  && remountResult.frameBg.length > 0
  && errors.length === 0;

if (!ok) {
  console.error('FAIL');
  process.exit(1);
}
console.log('PASS');
