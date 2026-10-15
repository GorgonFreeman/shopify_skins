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
  stripTrailingAdminResourceId,
  resolveStoreSwitch,
  registerStoreSwitchHandler,
  storeHandleFromAdminUrl,
} = context;

const productUrl = 'https://admin.shopify.com/store/alpha-shop/products/123?query=sku';
const orderUrl = 'https://admin.shopify.com/store/alpha-shop/orders/18939949318204';
const marketUrl = 'https://admin.shopify.com/store/alpha-shop/markets/27885628';
const listUrl = 'https://admin.shopify.com/store/alpha-shop/products?query=sku';

assert.equal(
  storeHandleFromAdminUrl(productUrl),
  'alpha-shop',
);

assert.equal(
  rewriteAdminStoreUrl(productUrl, 'beta-shop'),
  'https://admin.shopify.com/store/beta-shop/products/123?query=sku',
);

assert.equal(rewriteAdminStoreUrl('https://example.com/', 'beta-shop'), null);

assert.equal(
  stripTrailingAdminResourceId(orderUrl),
  'https://admin.shopify.com/store/alpha-shop/orders',
);

assert.equal(
  stripTrailingAdminResourceId(marketUrl),
  'https://admin.shopify.com/store/alpha-shop/markets',
);

assert.equal(stripTrailingAdminResourceId(listUrl), null);

{
  const result = await resolveStoreSwitch({
    url: orderUrl,
    targetStoreHandle: 'beta-shop',
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.url,
    'https://admin.shopify.com/store/beta-shop/orders',
  );
}

{
  const result = await resolveStoreSwitch({
    url: marketUrl,
    targetStoreHandle: 'beta-shop',
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.url,
    'https://admin.shopify.com/store/beta-shop/markets',
  );
}

{
  const result = await resolveStoreSwitch({
    url: listUrl,
    targetStoreHandle: 'beta-shop',
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.url,
    'https://admin.shopify.com/store/beta-shop/products?query=sku',
  );
}

{
  const result = await resolveStoreSwitch({
    url: productUrl,
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
    url: productUrl,
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
