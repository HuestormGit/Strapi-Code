'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const createCheckoutController = require('../src/api/checkout/controllers/checkout');
const createCheckoutService = require('../src/api/checkout/services/checkout');
const checkoutRoutes = require('../src/api/checkout/routes/checkout');

const productA = {
  documentId: 'product-a',
  Title: 'Classic',
  publishedAt: '2026-09-02T00:00:00.000Z',
};
const productB = {
  documentId: 'product-b',
  Title: 'Soup',
  publishedAt: '2026-09-02T00:00:00.000Z',
};
const variantA = {
  documentId: 'variant-a',
  product: productA,
  name: 'Classic 250g',
  packSize: '250gms',
  sku: 'AHA-CLASSIC-250',
  mrpMinor: 10500,
  discountMinor: 1050,
  sellingPriceMinor: 9450,
  taxableBaseMinor: 9000,
  gstMinor: 450,
  gstRateBps: 500,
  isActive: true,
};
const variantB = {
  documentId: 'variant-b',
  product: productA,
  name: 'Classic 100g',
  packSize: '100gms',
  sku: 'AHA-CLASSIC-100',
  mrpMinor: 11000,
  discountMinor: 500,
  sellingPriceMinor: 10500,
  taxableBaseMinor: 10000,
  gstMinor: 500,
  gstRateBps: 500,
  isActive: true,
};

const line = (overrides = {}) => ({
  productDocumentId: 'product-a',
  variantDocumentId: 'variant-a',
  quantity: 1,
  ...overrides,
});

const makeService = ({
  products = [productA, productB],
  variants = [variantA, variantB],
} = {}) => {
  const records = {
    'api::product.product': new Map(products.map((item) => [item.documentId, item])),
    'api::product-variant.product-variant': new Map(
      variants.map((item) => [item.documentId, item])
    ),
  };
  const strapi = {
    documents: (uid) => ({
      findOne: async ({ documentId, status }) => {
        const record = records[uid].get(documentId) || null;
        return status === 'published' && !record?.publishedAt ? null : record;
      },
    }),
  };
  return createCheckoutService({ strapi });
};

const quote = (items, catalog) => makeService(catalog).quote({ items });
const rejects400 = (promise, pattern) =>
  assert.rejects(
    promise,
    (error) => error.status === 400 && pattern.test(error.message)
  );

test('registers only POST /checkout/quote and keeps default route authentication', () => {
  assert.equal(checkoutRoutes.routes.length, 1);
  assert.equal(checkoutRoutes.routes[0].method, 'POST');
  assert.equal(checkoutRoutes.routes[0].path, '/checkout/quote');
  assert.notEqual(checkoutRoutes.routes[0].config.auth, false);
});

test('controller returns the service quote in the Strapi data envelope', async () => {
  const expected = { currency: 'INR', totalPaise: 9450 };
  const controller = createCheckoutController({
    strapi: { service: () => ({ quote: async () => expected }) },
  });
  assert.deepEqual(await controller.quote({ request: { body: { items: [line()] } } }), {
    data: expected,
  });
});

test('controller turns validation failures into a 400 response', async () => {
  const error = Object.assign(new Error('items must be an array'), { status: 400 });
  const controller = createCheckoutController({
    strapi: { service: () => ({ quote: async () => { throw error; } }) },
  });
  const ctx = {
    request: { body: {} },
    badRequest: (message) => ({ status: 400, message }),
  };
  assert.deepEqual(await controller.quote(ctx), {
    status: 400,
    message: 'items must be an array',
  });
});

test('quotes one line with its authoritative price breakdown', async () => {
  assert.deepEqual(await quote([line()]), {
    currency: 'INR',
    items: [
      {
        productDocumentId: 'product-a',
        variantDocumentId: 'variant-a',
        productName: 'Classic',
        sku: 'AHA-CLASSIC-250',
        size: '250gms',
        quantity: 1,
        unitMrpPaise: 10500,
        unitDiscountPaise: 1050,
        unitTaxableBasePaise: 9000,
        unitGstPaise: 450,
        unitSellingPricePaise: 9450,
        unitPricePaise: 9450,
        gstRateBps: 500,
        lineMrpPaise: 10500,
        lineDiscountPaise: 1050,
        lineTaxableBasePaise: 9000,
        lineGstPaise: 450,
        lineTotalPaise: 9450,
      },
    ],
    mrpTotalPaise: 10500,
    discountTotalPaise: 1050,
    taxableSubtotalPaise: 9000,
    gstTotalPaise: 450,
    subtotalPaise: 9450,
    shippingPaise: 0,
    totalPaise: 9450,
  });
});

test('doubles every line and aggregate amount for quantity two', async () => {
  const result = await quote([line({ quantity: 2 })]);
  assert.deepEqual(
    {
      lineMrpPaise: result.items[0].lineMrpPaise,
      lineDiscountPaise: result.items[0].lineDiscountPaise,
      lineTaxableBasePaise: result.items[0].lineTaxableBasePaise,
      lineGstPaise: result.items[0].lineGstPaise,
      lineTotalPaise: result.items[0].lineTotalPaise,
      mrpTotalPaise: result.mrpTotalPaise,
      discountTotalPaise: result.discountTotalPaise,
      taxableSubtotalPaise: result.taxableSubtotalPaise,
      gstTotalPaise: result.gstTotalPaise,
      subtotalPaise: result.subtotalPaise,
    },
    {
      lineMrpPaise: 21000,
      lineDiscountPaise: 2100,
      lineTaxableBasePaise: 18000,
      lineGstPaise: 900,
      lineTotalPaise: 18900,
      mrpTotalPaise: 21000,
      discountTotalPaise: 2100,
      taxableSubtotalPaise: 18000,
      gstTotalPaise: 900,
      subtotalPaise: 18900,
    }
  );
});

test('quotes multiple variants and sums every authoritative component', async () => {
  const result = await quote([
    line({ quantity: 2 }),
    line({ variantDocumentId: 'variant-b', quantity: 3 }),
  ]);
  assert.deepEqual(result.items.map((item) => ({
    lineMrpPaise: item.lineMrpPaise,
    lineDiscountPaise: item.lineDiscountPaise,
    lineTaxableBasePaise: item.lineTaxableBasePaise,
    lineGstPaise: item.lineGstPaise,
    lineTotalPaise: item.lineTotalPaise,
  })), [
    {
      lineMrpPaise: 21000,
      lineDiscountPaise: 2100,
      lineTaxableBasePaise: 18000,
      lineGstPaise: 900,
      lineTotalPaise: 18900,
    },
    {
      lineMrpPaise: 33000,
      lineDiscountPaise: 1500,
      lineTaxableBasePaise: 30000,
      lineGstPaise: 1500,
      lineTotalPaise: 31500,
    },
  ]);
  assert.equal(result.mrpTotalPaise, 54000);
  assert.equal(result.discountTotalPaise, 3600);
  assert.equal(result.taxableSubtotalPaise, 48000);
  assert.equal(result.gstTotalPaise, 2400);
  assert.equal(result.subtotalPaise, 50400);
  assert.equal(result.shippingPaise, 0);
  assert.equal(result.totalPaise, 50400);
  assert.equal(result.currency, 'INR');
});

test('temporary shipping fixture is isolated and returns zero paise', () => {
  assert.deepEqual(makeService().getTemporaryShippingQuote(), { shippingPaise: 0 });
});

test('rejects an unknown product', () =>
  rejects400(quote([line({ productDocumentId: 'missing' })]), /Product is unavailable/));

test('rejects an unpublished product', () =>
  rejects400(
    quote([line()], { products: [{ ...productA, publishedAt: null }] }),
    /Product is unavailable/
  ));

test('rejects an unknown variant', () =>
  rejects400(quote([line({ variantDocumentId: 'missing' })]), /variant is unavailable/));

test('rejects an inactive variant', () =>
  rejects400(
    quote([line()], { variants: [{ ...variantA, isActive: false }] }),
    /variant is inactive/
  ));

test('rejects a variant belonging to another product', () =>
  rejects400(
    quote([line()], { variants: [{ ...variantA, product: productB }] }),
    /does not belong/
  ));

test('rejects an orphaned variant', () =>
  rejects400(
    quote([line()], { variants: [{ ...variantA, product: null }] }),
    /has no product/
  ));

const invalidBodies = [
  ['missing items', {}, /items must be an array/],
  ['non-array items', { items: {} }, /items must be an array/],
  ['empty items', { items: [] }, /items must not be empty/],
  ['null line', { items: [null] }, /must be an object/],
  ['array line', { items: [[]] }, /must be an object/],
  ['missing product document ID', { items: [line({ productDocumentId: undefined })] }, /productDocumentId/],
  ['non-string product document ID', { items: [line({ productDocumentId: 1 })] }, /productDocumentId/],
  ['empty product document ID', { items: [line({ productDocumentId: '  ' })] }, /productDocumentId/],
  ['missing variant document ID', { items: [line({ variantDocumentId: undefined })] }, /variantDocumentId/],
  ['non-string variant document ID', { items: [line({ variantDocumentId: 1 })] }, /variantDocumentId/],
  ['empty variant document ID', { items: [line({ variantDocumentId: '  ' })] }, /variantDocumentId/],
];

for (const [name, body, pattern] of invalidBodies) {
  test(`rejects ${name}`, () => rejects400(makeService().quote(body), pattern));
}

const invalidQuantities = [
  ['zero quantity', 0, /between 1 and 100/],
  ['negative quantity', -1, /between 1 and 100/],
  ['decimal quantity', 1.5, /safe integer/],
  ['numeric string quantity', '2', /safe integer/],
  ['malformed string quantity', 'nope', /safe integer/],
  ['null quantity', null, /safe integer/],
  ['missing quantity', undefined, /safe integer/],
  ['NaN quantity', Number.NaN, /safe integer/],
  ['infinite quantity', Number.POSITIVE_INFINITY, /safe integer/],
  ['unsafe integer quantity', Number.MAX_SAFE_INTEGER + 1, /safe integer/],
  ['quantity over the per-line maximum', 101, /between 1 and 100/],
];

for (const [name, quantity, pattern] of invalidQuantities) {
  test(`rejects ${name}`, () => rejects400(quote([line({ quantity })]), pattern));
}

test('rejects duplicate product and variant document IDs', () =>
  rejects400(quote([line(), line()]), /duplicates/));

for (const field of [
  'mrpMinor',
  'discountMinor',
  'sellingPriceMinor',
  'taxableBaseMinor',
  'gstMinor',
  'gstRateBps',
]) {
  for (const [kind, value] of [
    ['malformed', '1'],
    ['negative', -1],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ]) {
    test(`rejects ${kind} ${field}`, () =>
      rejects400(
        quote([line()], { variants: [{ ...variantA, [field]: value }] }),
        new RegExp(`invalid ${field}`)
      ));
  }
}

test('rejects an MRP and discount that do not reconcile to selling price', () =>
  rejects400(
    quote([line()], { variants: [{ ...variantA, discountMinor: 1049 }] }),
    /MRP and discount/
  ));

test('rejects a taxable base and GST that do not reconcile to selling price', () =>
  rejects400(
    quote([line()], { variants: [{ ...variantA, gstMinor: 449 }] }),
    /taxable base and GST/
  ));

test('allows a zero-priced variant', async () => {
  const result = await quote([line()], {
    variants: [{
      ...variantA,
      mrpMinor: 0,
      discountMinor: 0,
      sellingPriceMinor: 0,
      taxableBaseMinor: 0,
      gstMinor: 0,
      gstRateBps: 0,
    }],
  });
  assert.equal(result.items[0].lineTotalPaise, 0);
  assert.equal(result.totalPaise, 0);
});

test('rejects line multiplication overflow', () =>
  rejects400(
    quote([line({ quantity: 2 })], {
      variants: [{
        ...variantA,
        mrpMinor: Number.MAX_SAFE_INTEGER,
        discountMinor: 0,
        sellingPriceMinor: Number.MAX_SAFE_INTEGER,
        taxableBaseMinor: Number.MAX_SAFE_INTEGER,
        gstMinor: 0,
        gstRateBps: 0,
      }],
    }),
    /Line MRP is too large/
  ));

test('rejects subtotal overflow', () =>
  rejects400(
    quote(
      [line(), line({ variantDocumentId: 'variant-b' })],
      {
        variants: [
          {
            ...variantA,
            mrpMinor: Number.MAX_SAFE_INTEGER - 1,
            discountMinor: 0,
            sellingPriceMinor: Number.MAX_SAFE_INTEGER - 1,
            taxableBaseMinor: Number.MAX_SAFE_INTEGER - 1,
            gstMinor: 0,
            gstRateBps: 0,
          },
          {
            ...variantB,
            mrpMinor: 2,
            discountMinor: 0,
            sellingPriceMinor: 2,
            taxableBaseMinor: 2,
            gstMinor: 0,
            gstRateBps: 0,
          },
        ],
      }
    ),
    /Subtotal is too large/
  ));

for (const field of [
  'mrp',
  'discount',
  'taxable',
  'gst',
  'price',
  'subtotal',
  'shipping',
  'total',
  'currency',
]) {
  test(`ignores client ${field}`, async () => {
    const result = await makeService().quote({
      [field]: field === 'currency' ? 'USD' : 1,
      items: [line({ [field]: field === 'currency' ? 'USD' : 1 })],
    });
    assert.equal(result.items[0].unitMrpPaise, 10500);
    assert.equal(result.items[0].unitDiscountPaise, 1050);
    assert.equal(result.items[0].unitTaxableBasePaise, 9000);
    assert.equal(result.items[0].unitGstPaise, 450);
    assert.equal(result.items[0].unitSellingPricePaise, 9450);
    assert.equal(result.mrpTotalPaise, 10500);
    assert.equal(result.discountTotalPaise, 1050);
    assert.equal(result.taxableSubtotalPaise, 9000);
    assert.equal(result.gstTotalPaise, 450);
    assert.equal(result.subtotalPaise, 9450);
    assert.equal(result.shippingPaise, 0);
    assert.equal(result.totalPaise, 9450);
    assert.equal(result.currency, 'INR');
  });
}
