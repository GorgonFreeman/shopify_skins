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
      title
    }
  }
`.trim();

const COLLECTION_BY_HANDLE_QUERY = `
  query collectionByHandle($identifier: CollectionIdentifierInput!) {
    collection: collectionByIdentifier(identifier: $identifier) {
      id
      handle
    }
  }
`.trim();

const COLLECTION_BY_ID_QUERY = `
  query collectionById($id: ID!) {
    collection(id: $id) {
      id
      handle
      title
    }
  }
`.trim();

const CUSTOMER_BY_EMAIL_QUERY = `
  query customerByEmail($identifier: CustomerIdentifierInput!) {
    customer: customerByIdentifier(identifier: $identifier) {
      id
      email
    }
  }
`.trim();

const CUSTOMER_BY_ID_QUERY = `
  query customerById($id: ID!) {
    customer(id: $id) {
      id
      email
      firstName
      lastName
      displayName
    }
  }
`.trim();

const DISCOUNT_TITLE_FRAGMENTS = `
  ... on DiscountCodeBasic { title }
  ... on DiscountCodeBxgy { title }
  ... on DiscountCodeFreeShipping { title }
  ... on DiscountAutomaticBasic { title }
  ... on DiscountAutomaticBxgy { title }
  ... on DiscountAutomaticFreeShipping { title }
  ... on DiscountAutomaticApp { title }
`.trim();

const DISCOUNT_BY_ID_QUERY = `
  query discountById($codeId: ID!, $automaticId: ID!) {
    code: discountNode(id: $codeId) {
      id
      discount {
        ${ DISCOUNT_TITLE_FRAGMENTS }
      }
    }
    automatic: discountNode(id: $automaticId) {
      id
      discount {
        ${ DISCOUNT_TITLE_FRAGMENTS }
      }
    }
  }
`.trim();

const DISCOUNTS_BY_TITLE_QUERY = `
  query discountsByTitle($query: String!) {
    discountNodes(first: 25, query: $query) {
      nodes {
        id
        discount {
          ${ DISCOUNT_TITLE_FRAGMENTS }
        }
      }
    }
  }
`.trim();

const THEME_BY_ID_QUERY = `
  query themeById($id: ID!) {
    theme(id: $id) {
      id
      name
    }
  }
`.trim();

const THEMES_BY_NAME_QUERY = `
  query themesByName($names: [String!]) {
    themes(first: 10, names: $names) {
      nodes {
        id
        name
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

  const product = result.data?.product || null;
  const handle = String(product?.handle || '').trim();
  const title = String(product?.title || '').trim();
  if (!handle && !title) {
    return {
      ok: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: 'Could not resolve this product.',
      },
    };
  }

  return {
    ok: true,
    data: {
      handle,
      title,
      search: title || handle,
    },
  };
}

function adminResourceUrl(storeHandle, resource, id) {
  const store = String(storeHandle || '').trim();
  const path = String(resource || '').trim().replace(/^\/+|\/+$/g, '');
  const resourceId = gidToId(id);
  if (!store || !path || !resourceId) {
    return null;
  }
  return `https://admin.shopify.com/store/${ store }/${ path }/${ resourceId }`;
}

function resourceSearchUrl(storeHandle, resource, query) {
  const store = String(storeHandle || '').trim();
  const path = String(resource || '').trim().replace(/^\/+|\/+$/g, '');
  const q = String(query || '').trim();
  if (!store || !path || !q) {
    return null;
  }
  return `https://admin.shopify.com/store/${ store }/${ path }?q=${ encodeURIComponent(q) }`;
}

function discountTitle(discountNode) {
  return String(discountNode?.discount?.title || '').trim();
}

function escapeSearchValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function switchProductByHandle({
  id,
  targetStoreHandle,
  currentStoreHandle,
}) {
  if (!currentStoreHandle || !id) {
    return {
      ok: false,
      error: {
        code: 'MISSING_PRODUCT_ID',
        message: 'Open a product admin URL to switch by handle.',
      },
    };
  }

  const current = await findProductHandleById(currentStoreHandle, id);
  if (!current.ok) {
    return current;
  }

  const {
    handle,
    search,
  } = current.data;

  if (handle) {
    const lookup = await findProductByHandle(targetStoreHandle, handle);
    if (lookup.ok) {
      const nextUrl = adminResourceUrl(targetStoreHandle, 'products', lookup.data.product.id);
      if (!nextUrl) {
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
        url: nextUrl,
      };
    }
    if (lookup.error?.code !== 'PRODUCT_NOT_FOUND') {
      return lookup;
    }
  }

  const searchUrl = resourceSearchUrl(targetStoreHandle, 'products', search);
  if (!searchUrl) {
    return {
      ok: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: handle
          ? `No product with handle "${ handle }" on ${ targetStoreHandle }.`
          : 'Could not resolve a title to search for this product.',
      },
    };
  }

  return {
    ok: true,
    url: searchUrl,
  };
}

async function findCollectionByHandle(storeHandle, collectionHandle) {
  const accessToken = await accessTokenForStore(storeHandle);
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to look up collections.',
      },
    };
  }

  const handle = String(collectionHandle || '').trim();
  if (!storeHandle || !handle) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle and collection handle.',
      },
    };
  }

  const result = await shopifyAdminGraphql({
    storeHandle,
    accessToken,
    query: COLLECTION_BY_HANDLE_QUERY,
    variables: {
      identifier: {
        handle,
      },
    },
  });

  if (!result.ok) {
    return result;
  }

  const collection = result.data?.collection || null;
  if (!collection?.id) {
    return {
      ok: false,
      error: {
        code: 'COLLECTION_NOT_FOUND',
        message: `No collection with handle "${ handle }" on ${ storeHandle }.`,
      },
    };
  }

  return {
    ok: true,
    data: {
      collection,
    },
  };
}

async function findCollectionHandleById(storeHandle, collectionId) {
  const accessToken = await accessTokenForStore(storeHandle);
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to look up collections.',
      },
    };
  }

  const id = gidToId(collectionId);
  if (!storeHandle || !id) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle and collection id.',
      },
    };
  }

  const result = await shopifyAdminGraphql({
    storeHandle,
    accessToken,
    query: COLLECTION_BY_ID_QUERY,
    variables: {
      id: `gid://shopify/Collection/${ id }`,
    },
  });

  if (!result.ok) {
    return result;
  }

  const collection = result.data?.collection || null;
  const handle = String(collection?.handle || '').trim();
  const title = String(collection?.title || '').trim();
  if (!handle && !title) {
    return {
      ok: false,
      error: {
        code: 'COLLECTION_NOT_FOUND',
        message: 'Could not resolve this collection.',
      },
    };
  }

  return {
    ok: true,
    data: {
      handle,
      title,
      search: title || handle,
    },
  };
}

async function switchCollectionByHandle({
  id,
  targetStoreHandle,
  currentStoreHandle,
}) {
  if (!currentStoreHandle || !id) {
    return {
      ok: false,
      error: {
        code: 'MISSING_COLLECTION_ID',
        message: 'Open a collection admin URL to switch by handle.',
      },
    };
  }

  const current = await findCollectionHandleById(currentStoreHandle, id);
  if (!current.ok) {
    return current;
  }

  const {
    handle,
    search,
  } = current.data;

  if (handle) {
    const lookup = await findCollectionByHandle(targetStoreHandle, handle);
    if (lookup.ok) {
      const nextUrl = adminResourceUrl(
        targetStoreHandle,
        'collections',
        lookup.data.collection.id,
      );
      if (!nextUrl) {
        return {
          ok: false,
          error: {
            code: 'BAD_COLLECTION',
            message: 'Shopify returned a collection without an id.',
          },
        };
      }
      return {
        ok: true,
        url: nextUrl,
      };
    }
    if (lookup.error?.code !== 'COLLECTION_NOT_FOUND') {
      return lookup;
    }
  }

  const searchUrl = resourceSearchUrl(targetStoreHandle, 'collections', search);
  if (!searchUrl) {
    return {
      ok: false,
      error: {
        code: 'COLLECTION_NOT_FOUND',
        message: handle
          ? `No collection with handle "${ handle }" on ${ targetStoreHandle }.`
          : 'Could not resolve a title to search for this collection.',
      },
    };
  }

  return {
    ok: true,
    url: searchUrl,
  };
}

function customerSearchName(customer) {
  const displayName = String(customer?.displayName || '').trim();
  if (displayName) {
    return displayName;
  }
  return [customer?.firstName, customer?.lastName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}


async function findCustomerById(storeHandle, customerId) {
  const accessToken = await accessTokenForStore(storeHandle);
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to look up customers.',
      },
    };
  }

  const id = gidToId(customerId);
  if (!storeHandle || !id) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle and customer id.',
      },
    };
  }

  const result = await shopifyAdminGraphql({
    storeHandle,
    accessToken,
    query: CUSTOMER_BY_ID_QUERY,
    variables: {
      id: `gid://shopify/Customer/${ id }`,
    },
  });

  if (!result.ok) {
    return result;
  }

  const customer = result.data?.customer || null;
  if (!customer?.id) {
    return {
      ok: false,
      error: {
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Could not resolve this customer.',
      },
    };
  }

  return {
    ok: true,
    data: {
      customer,
      email: String(customer.email || '').trim(),
      name: customerSearchName(customer),
    },
  };
}

async function findCustomerByEmail(storeHandle, emailAddress) {
  const accessToken = await accessTokenForStore(storeHandle);
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to look up customers.',
      },
    };
  }

  const email = String(emailAddress || '').trim();
  if (!storeHandle || !email) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle and customer email.',
      },
    };
  }

  const result = await shopifyAdminGraphql({
    storeHandle,
    accessToken,
    query: CUSTOMER_BY_EMAIL_QUERY,
    variables: {
      identifier: {
        emailAddress: email,
      },
    },
  });

  if (!result.ok) {
    return result;
  }

  const customer = result.data?.customer || null;
  if (!customer?.id) {
    return {
      ok: false,
      error: {
        code: 'CUSTOMER_NOT_FOUND',
        message: `No customer with email "${ email }" on ${ storeHandle }.`,
      },
    };
  }

  return {
    ok: true,
    data: {
      customer,
    },
  };
}

async function switchCustomerByEmail({
  id,
  targetStoreHandle,
  currentStoreHandle,
}) {
  if (!currentStoreHandle || !id) {
    return {
      ok: false,
      error: {
        code: 'MISSING_CUSTOMER_ID',
        message: 'Open a customer admin URL to switch by email.',
      },
    };
  }

  const current = await findCustomerById(currentStoreHandle, id);
  if (!current.ok) {
    return current;
  }

  const {
    email,
    name,
  } = current.data;

  if (email) {
    const lookup = await findCustomerByEmail(targetStoreHandle, email);
    if (lookup.ok) {
      const nextUrl = adminResourceUrl(
        targetStoreHandle,
        'customers',
        lookup.data.customer.id,
      );
      if (!nextUrl) {
        return {
          ok: false,
          error: {
            code: 'BAD_CUSTOMER',
            message: 'Shopify returned a customer without an id.',
          },
        };
      }
      return {
        ok: true,
        url: nextUrl,
      };
    }
    if (lookup.error?.code !== 'CUSTOMER_NOT_FOUND') {
      return lookup;
    }
  }

  const searchUrl = resourceSearchUrl(targetStoreHandle, 'customers', name);
  if (!searchUrl) {
    return {
      ok: false,
      error: {
        code: 'CUSTOMER_NOT_FOUND',
        message: email
          ? `No customer with email "${ email }" on ${ targetStoreHandle }.`
          : 'Could not resolve a name to search for this customer.',
      },
    };
  }

  return {
    ok: true,
    url: searchUrl,
  };
}

async function findDiscountTitleById(storeHandle, discountId) {
  const accessToken = await accessTokenForStore(storeHandle);
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to look up discounts.',
      },
    };
  }

  const id = gidToId(discountId);
  if (!storeHandle || !id) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle and discount id.',
      },
    };
  }

  const result = await shopifyAdminGraphql({
    storeHandle,
    accessToken,
    query: DISCOUNT_BY_ID_QUERY,
    variables: {
      codeId: `gid://shopify/DiscountCodeNode/${ id }`,
      automaticId: `gid://shopify/DiscountAutomaticNode/${ id }`,
    },
  });

  if (!result.ok) {
    return result;
  }

  const node = result.data?.code || result.data?.automatic || null;
  const title = discountTitle(node);
  if (!title) {
    return {
      ok: false,
      error: {
        code: 'DISCOUNT_NOT_FOUND',
        message: 'Could not resolve a name for this discount.',
      },
    };
  }

  return {
    ok: true,
    data: {
      title,
    },
  };
}

async function findDiscountByTitle(storeHandle, discountTitleValue) {
  const accessToken = await accessTokenForStore(storeHandle);
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to look up discounts.',
      },
    };
  }

  const title = String(discountTitleValue || '').trim();
  if (!storeHandle || !title) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle and discount name.',
      },
    };
  }

  const result = await shopifyAdminGraphql({
    storeHandle,
    accessToken,
    query: DISCOUNTS_BY_TITLE_QUERY,
    variables: {
      query: `title:"${ escapeSearchValue(title) }"`,
    },
  });

  if (!result.ok) {
    return result;
  }

  const nodes = result.data?.discountNodes?.nodes || [];
  const match = nodes.find((node) => (
    discountTitle(node).toLowerCase() === title.toLowerCase()
  )) || nodes[0] || null;

  if (!match?.id) {
    return {
      ok: false,
      error: {
        code: 'DISCOUNT_NOT_FOUND',
        message: `No discount named "${ title }" on ${ storeHandle }.`,
      },
    };
  }

  return {
    ok: true,
    data: {
      discount: match,
    },
  };
}

async function switchDiscountByName({
  id,
  targetStoreHandle,
  currentStoreHandle,
}) {
  if (!currentStoreHandle || !id) {
    return {
      ok: false,
      error: {
        code: 'MISSING_DISCOUNT_ID',
        message: 'Open a discount admin URL to switch by name.',
      },
    };
  }

  const current = await findDiscountTitleById(currentStoreHandle, id);
  if (!current.ok) {
    return current;
  }

  const title = current.data.title;
  const lookup = await findDiscountByTitle(targetStoreHandle, title);
  if (lookup.ok) {
    const nextUrl = adminResourceUrl(targetStoreHandle, 'discounts', lookup.data.discount.id);
    if (!nextUrl) {
      return {
        ok: false,
        error: {
          code: 'BAD_DISCOUNT',
          message: 'Shopify returned a discount without an id.',
        },
      };
    }
    return {
      ok: true,
      url: nextUrl,
    };
  }
  if (lookup.error?.code !== 'DISCOUNT_NOT_FOUND') {
    return lookup;
  }

  const searchUrl = resourceSearchUrl(targetStoreHandle, 'discounts', title);
  if (!searchUrl) {
    return {
      ok: false,
      error: {
        code: 'DISCOUNT_NOT_FOUND',
        message: `No discount named "${ title }" on ${ targetStoreHandle }.`,
      },
    };
  }

  return {
    ok: true,
    url: searchUrl,
  };
}

async function findThemeNameById(storeHandle, themeId) {
  const accessToken = await accessTokenForStore(storeHandle);
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to look up themes.',
      },
    };
  }

  const id = gidToId(themeId);
  if (!storeHandle || !id) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle and theme id.',
      },
    };
  }

  const result = await shopifyAdminGraphql({
    storeHandle,
    accessToken,
    query: THEME_BY_ID_QUERY,
    variables: {
      id: `gid://shopify/OnlineStoreTheme/${ id }`,
    },
  });

  if (!result.ok) {
    return result;
  }

  const name = String(result.data?.theme?.name || '').trim();
  if (!name) {
    return {
      ok: false,
      error: {
        code: 'THEME_NOT_FOUND',
        message: 'Could not resolve a name for this theme.',
      },
    };
  }

  return {
    ok: true,
    data: {
      name,
    },
  };
}

async function findThemeByName(storeHandle, themeName) {
  const accessToken = await accessTokenForStore(storeHandle);
  if (!accessToken) {
    return {
      ok: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'An Admin API token is required to look up themes.',
      },
    };
  }

  const name = String(themeName || '').trim();
  if (!storeHandle || !name) {
    return {
      ok: false,
      error: {
        code: 'MISSING_ARGS',
        message: 'Need store handle and theme name.',
      },
    };
  }

  const result = await shopifyAdminGraphql({
    storeHandle,
    accessToken,
    query: THEMES_BY_NAME_QUERY,
    variables: {
      names: [name],
    },
  });

  if (!result.ok) {
    return result;
  }

  const nodes = result.data?.themes?.nodes || [];
  const match = nodes.find((theme) => (
    String(theme?.name || '').trim().toLowerCase() === name.toLowerCase()
  )) || nodes[0] || null;

  if (!match?.id) {
    return {
      ok: false,
      error: {
        code: 'THEME_NOT_FOUND',
        message: `No theme named "${ name }" on ${ storeHandle }.`,
      },
    };
  }

  return {
    ok: true,
    data: {
      theme: match,
    },
  };
}

function themeEditorUrl(storeHandle, themeId, sourceUrl) {
  const store = String(storeHandle || '').trim();
  const id = gidToId(themeId);
  if (!store || !id) {
    return null;
  }

  const source = String(sourceUrl || '');
  const suffixMatch = source.match(/\/themes\/\d+(\/[^?#]*)?/);
  const suffix = suffixMatch?.[1] || '/editor';
  const tail = source.match(/([?#].*)$/)?.[1] || '';

  return `https://admin.shopify.com/store/${ store }/themes/${ id }${ suffix }${ tail }`;
}

async function switchThemeByName({
  id,
  url,
  targetStoreHandle,
  currentStoreHandle,
}) {
  if (!currentStoreHandle || !id) {
    return {
      ok: false,
      error: {
        code: 'MISSING_THEME_ID',
        message: 'Open a theme editor URL to switch by name.',
      },
    };
  }

  const current = await findThemeNameById(currentStoreHandle, id);
  if (!current.ok) {
    return current;
  }

  const lookup = await findThemeByName(targetStoreHandle, current.data.name);
  if (!lookup.ok) {
    return lookup;
  }

  const nextUrl = themeEditorUrl(targetStoreHandle, lookup.data.theme.id, url);
  if (!nextUrl) {
    return {
      ok: false,
      error: {
        code: 'BAD_THEME',
        message: 'Shopify returned a theme without an id.',
      },
    };
  }

  return {
    ok: true,
    url: nextUrl,
  };
}

setStoreSwitchHandlers({
  [/\/products\/(?<id>\d+)/]: switchProductByHandle,
  [/\/collections\/(?<id>\d+)/]: switchCollectionByHandle,
  [/\/customers\/(?<id>\d+)/]: switchCustomerByEmail,
  [/\/discounts\/(?<id>\d+)/]: switchDiscountByName,
  [/\/themes\/(?<id>\d+)/]: switchThemeByName,
});

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

