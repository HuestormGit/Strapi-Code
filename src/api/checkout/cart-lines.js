'use strict';

// Cart request validation and catalogue resolution shared by every checkout
// endpoint (quote, shipping options, and later payment creation). Kept out of
// services/ on purpose: Strapi only auto-registers routes, controllers,
// services, policies, middlewares and content-types, so this stays a plain
// module instead of becoming a second service.

const MAX_QUANTITY_PER_LINE = 100;
const PRODUCT_UID = 'api::product.product';
const VARIANT_UID = 'api::product-variant.product-variant';

const invalid = (message) => {
  const error = new Error(message);
  error.status = 400;
  throw error;
};

const requiredDocumentId = (value, field, index) => {
  if (typeof value !== 'string' || !value.trim()) {
    invalid(`items[${index}].${field} must be a non-empty string`);
  }
  return value.trim();
};

const requireSafeNonNegativeInteger = (variant, field) => {
  const value = variant[field];
  if (!Number.isSafeInteger(value) || value < 0) {
    invalid(`Product variant has invalid ${field}`);
  }
  return value;
};

const multiplyMoney = (value, quantity, label) => {
  const result = value * quantity;
  if (!Number.isSafeInteger(result)) invalid(`${label} is too large`);
  return result;
};

const addMoney = (left, right, label) => {
  const result = left + right;
  if (!Number.isSafeInteger(result)) invalid(`${label} is too large`);
  return result;
};

const validateCartItems = (body) => {
  if (!body || !Array.isArray(body.items)) invalid('items must be an array');
  if (body.items.length === 0) invalid('items must not be empty');

  const seen = new Set();
  return body.items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      invalid(`items[${index}] must be an object`);
    }

    const productDocumentId = requiredDocumentId(
      item.productDocumentId,
      'productDocumentId',
      index
    );
    const variantDocumentId = requiredDocumentId(
      item.variantDocumentId,
      'variantDocumentId',
      index
    );

    if (!Number.isSafeInteger(item.quantity)) {
      invalid(`items[${index}].quantity must be a safe integer`);
    }
    if (item.quantity <= 0 || item.quantity > MAX_QUANTITY_PER_LINE) {
      invalid(
        `items[${index}].quantity must be between 1 and ${MAX_QUANTITY_PER_LINE}`
      );
    }

    // NUL separator: ("ab","c") must not collide with ("a","bc").
    const key = `${productDocumentId}\u0000${variantDocumentId}`;
    if (seen.has(key)) invalid(`items[${index}] duplicates an earlier cart line`);
    seen.add(key);

    return { productDocumentId, variantDocumentId, quantity: item.quantity };
  });
};

// Resolves one validated cart line to its published product and active variant.
const resolveCartLine = async (strapi, item) => {
  const [product, variant] = await Promise.all([
    strapi.documents(PRODUCT_UID).findOne({
      documentId: item.productDocumentId,
      status: 'published',
    }),
    strapi.documents(VARIANT_UID).findOne({
      documentId: item.variantDocumentId,
      populate: { product: true },
    }),
  ]);

  if (!product || !product.publishedAt) invalid('Product is unavailable');
  if (!variant) invalid('Product variant is unavailable');
  if (!variant.isActive) invalid('Product variant is inactive');
  if (!variant.product?.documentId) invalid('Product variant has no product');
  if (variant.product.documentId !== item.productDocumentId) {
    invalid('Product variant does not belong to the requested product');
  }

  return { product, variant };
};

// Sequential on purpose: the first bad line is the one reported.
const resolveCartLines = async (strapi, items) => {
  const lines = [];
  for (const item of items) {
    lines.push({ item, ...(await resolveCartLine(strapi, item)) });
  }
  return lines;
};

module.exports = {
  MAX_QUANTITY_PER_LINE,
  PRODUCT_UID,
  VARIANT_UID,
  invalid,
  requireSafeNonNegativeInteger,
  multiplyMoney,
  addMoney,
  validateCartItems,
  resolveCartLine,
  resolveCartLines,
};
