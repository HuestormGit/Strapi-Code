'use strict';

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

const validateQuoteRequest = (body) => {
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

    const key = `${productDocumentId}\u0000${variantDocumentId}`;
    if (seen.has(key)) invalid(`items[${index}] duplicates an earlier cart line`);
    seen.add(key);

    return { productDocumentId, variantDocumentId, quantity: item.quantity };
  });
};

// Temporary zero-rate boundary. Replace this function with Shiprocket quoting later.
const getTemporaryShippingQuote = () => ({ shippingPaise: 0 });

module.exports = ({ strapi }) => ({
  getTemporaryShippingQuote,

  async quote(body) {
    const items = validateQuoteRequest(body);
    const quotedItems = [];
    let mrpTotalPaise = 0;
    let discountTotalPaise = 0;
    let taxableSubtotalPaise = 0;
    let gstTotalPaise = 0;
    let subtotalPaise = 0;

    for (const item of items) {
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

      const unitMrpPaise = requireSafeNonNegativeInteger(variant, 'mrpMinor');
      const unitDiscountPaise = requireSafeNonNegativeInteger(
        variant,
        'discountMinor'
      );
      const unitSellingPricePaise = requireSafeNonNegativeInteger(
        variant,
        'sellingPriceMinor'
      );
      const unitTaxableBasePaise = requireSafeNonNegativeInteger(
        variant,
        'taxableBaseMinor'
      );
      const unitGstPaise = requireSafeNonNegativeInteger(variant, 'gstMinor');
      const gstRateBps = requireSafeNonNegativeInteger(variant, 'gstRateBps');

      if (unitMrpPaise - unitDiscountPaise !== unitSellingPricePaise) {
        invalid('Product variant MRP and discount do not match its selling price');
      }
      if (
        addMoney(
          unitTaxableBasePaise,
          unitGstPaise,
          'Unit taxable base and GST'
        ) !== unitSellingPricePaise
      ) {
        invalid('Product variant taxable base and GST do not match its selling price');
      }

      const lineMrpPaise = multiplyMoney(
        unitMrpPaise,
        item.quantity,
        'Line MRP'
      );
      const lineDiscountPaise = multiplyMoney(
        unitDiscountPaise,
        item.quantity,
        'Line discount'
      );
      const lineTaxableBasePaise = multiplyMoney(
        unitTaxableBasePaise,
        item.quantity,
        'Line taxable base'
      );
      const lineGstPaise = multiplyMoney(
        unitGstPaise,
        item.quantity,
        'Line GST'
      );
      const lineTotalPaise = multiplyMoney(
        unitSellingPricePaise,
        item.quantity,
        'Line total'
      );

      subtotalPaise = addMoney(subtotalPaise, lineTotalPaise, 'Subtotal');
      mrpTotalPaise = addMoney(mrpTotalPaise, lineMrpPaise, 'MRP total');
      discountTotalPaise = addMoney(
        discountTotalPaise,
        lineDiscountPaise,
        'Discount total'
      );
      taxableSubtotalPaise = addMoney(
        taxableSubtotalPaise,
        lineTaxableBasePaise,
        'Taxable subtotal'
      );
      gstTotalPaise = addMoney(gstTotalPaise, lineGstPaise, 'GST total');

      quotedItems.push({
        productDocumentId: item.productDocumentId,
        variantDocumentId: item.variantDocumentId,
        productName: product.Title || '',
        sku: variant.sku || '',
        size: variant.packSize || variant.name || '',
        quantity: item.quantity,
        unitMrpPaise,
        unitDiscountPaise,
        unitTaxableBasePaise,
        unitGstPaise,
        unitSellingPricePaise,
        // Compatibility for the existing checkout consumer.
        unitPricePaise: unitSellingPricePaise,
        gstRateBps,
        lineMrpPaise,
        lineDiscountPaise,
        lineTaxableBasePaise,
        lineGstPaise,
        lineTotalPaise,
      });
    }

    const { shippingPaise } = getTemporaryShippingQuote(quotedItems);
    if (!Number.isSafeInteger(shippingPaise) || shippingPaise < 0) {
      invalid('Shipping quote has invalid pricing');
    }
    const totalPaise = addMoney(subtotalPaise, shippingPaise, 'Quote total');

    return {
      currency: 'INR',
      items: quotedItems,
      mrpTotalPaise,
      discountTotalPaise,
      taxableSubtotalPaise,
      gstTotalPaise,
      subtotalPaise,
      shippingPaise,
      totalPaise,
    };
  },
});
