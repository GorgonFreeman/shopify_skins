/**
 * Headless check of background renameTheme (GraphQL) with mocked fetch/storage.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const settingsSrc = fs.readFileSync(path.join(__dirname, 'settings.js'), 'utf8');
const backgroundSrc = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');

// background.js uses importScripts — strip that and load settings first in the sandbox.
const backgroundBody = backgroundSrc.replace(/^importScripts\('settings\.js'\);\s*/m, '');

const fetchCalls = [];
let fetchImpl = async () => {
  throw new Error('fetch not stubbed');
};

const localStore = {
  shopifySkinsSettings: {
    accessToken: '',
    accessTokensByStore: {
      'demo-shop': 'shpat_test_token',
    },
    themeRenameEnabled: true,
  },
};

const chrome = {
  storage: {
    local: {
      async get(key) {
        if (typeof key === 'string') {
          return { [key]: localStore[key] };
        }
        return { ...localStore };
      },
      async set(values) {
        Object.assign(localStore, values);
      },
    },
  },
  action: {
    async setPopup() {},
    async openPopup() {},
  },
  windows: {
    async create() {},
  },
  runtime: {
    getURL(p) {
      return `chrome-extension://test/${ p }`;
    },
    onMessage: {
      addListener() {},
    },
  },
};

const sandbox = {
  chrome,
  console,
  fetch: (...args) => {
    fetchCalls.push(args);
    return fetchImpl(...args);
  },
  URLSearchParams,
  String,
  Boolean,
  Object,
  Array,
  Promise,
  Error,
  JSON,
  setTimeout,
  clearTimeout,
};

vm.createContext(sandbox);
vm.runInContext(settingsSrc, sandbox);
vm.runInContext(backgroundBody, sandbox);

// Expose renameTheme — it's not on global; re-eval a tiny exporter.
// renameTheme is a function declaration in background — should be on sandbox.
if (typeof sandbox.renameTheme !== 'function') {
  // Function declarations in vm might not bind to sandbox in all Node versions.
  // Re-run with explicit assignment.
  vm.runInContext('this.renameTheme = renameTheme;', sandbox);
}

async function runCase(name, impl) {
  fetchCalls.length = 0;
  fetchImpl = impl;
  const result = await sandbox.renameTheme({
    storeHandle: 'demo-shop',
    themeId: '123456789',
    name: 'Dawn Renamed',
  });
  console.log(name, JSON.stringify({
    result,
    fetchUrl: fetchCalls[0]?.[0],
    fetchInit: fetchCalls[0]?.[1] && {
      method: fetchCalls[0][1].method,
      headers: fetchCalls[0][1].headers,
      body: JSON.parse(fetchCalls[0][1].body),
    },
  }, null, 2));
  return result;
}

const okResult = await runCase('success', async () => ({
  ok: true,
  status: 200,
  async json() {
    return {
      data: {
        themeUpdate: {
          theme: {
            id: 'gid://shopify/OnlineStoreTheme/123456789',
            name: 'Dawn Renamed',
          },
          userErrors: [],
        },
      },
    };
  },
}));

const authResult = await runCase('authFail', async () => ({
  ok: false,
  status: 401,
  async json() {
    return { errors: [{ message: 'Unauthorized' }] };
  },
}));

const missing = await sandbox.renameTheme({
  storeHandle: 'demo-shop',
  themeId: '123456789',
  name: 'X',
  accessToken: '',
});
// Clear token
localStore.shopifySkinsSettings.accessTokensByStore = {};
const missingToken = await sandbox.renameTheme({
  storeHandle: 'demo-shop',
  themeId: '123456789',
  name: 'X',
});
console.log('missingToken', missingToken);

const pass = okResult?.ok === true
  && authResult?.ok === false
  && authResult?.error?.code === 'AUTH_ERROR'
  && missingToken?.error?.code === 'MISSING_TOKEN'
  && fetchCalls.length >= 1;

if (!pass) {
  console.error('FAIL');
  process.exit(1);
}
console.log('PASS');
