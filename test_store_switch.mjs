import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'store_switch.js'), 'utf8');
const context = {};
vm.runInNewContext(source, context);

const {
  rewriteAdminStoreUrl,
  resolveStoreSwitch,
  registerStoreSwitchHandler,
  storeHandleFromAdminUrl,
} = context;

const sampleUrl = 'https://admin.shopify.com/store/alpha-shop/products/123?query=sku';

assert.equal(
  storeHandleFromAdminUrl(sampleUrl),
  'alpha-shop',
);

assert.equal(
  rewriteAdminStoreUrl(sampleUrl, 'beta-shop'),
  'https://admin.shopify.com/store/beta-shop/products/123?query=sku',
);

assert.equal(rewriteAdminStoreUrl('https://example.com/', 'beta-shop'), null);

{
  const result = await resolveStoreSwitch({
    url: sampleUrl,
    targetStoreHandle: 'beta-shop',
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.url,
    'https://admin.shopify.com/store/beta-shop/products/123?query=sku',
  );
}

{
  const result = await resolveStoreSwitch({
    url: sampleUrl,
    targetStoreHandle: 'alpha-shop',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'SAME_STORE');
}

registerStoreSwitchHandler(/\/products\/\d+/, async ({
  targetStoreHandle,
  productHandle,
}) => {
  assert.equal(productHandle, 'linen-shirt');
  return {
    ok: true,
    url: `https://admin.shopify.com/store/${ targetStoreHandle }/products/999`,
  };
});

{
  const result = await resolveStoreSwitch({
    url: sampleUrl,
    targetStoreHandle: 'beta-shop',
    productHandle: 'linen-shirt',
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.url,
    'https://admin.shopify.com/store/beta-shop/products/999',
  );
}

console.log('test_store_switch: ok');
