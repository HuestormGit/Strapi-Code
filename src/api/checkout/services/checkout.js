'use strict';

const {
  invalid,
  requireSafeNonNegativeInteger,
  multiplyMoney,
  addMoney,
  validateCartItems,
  resolveCartLine,
} = require('../cart-lines');

// The quote endpoint prices the cart only. Delivery cost is quoted separately by
// POST /checkout/shipping-options, because it needs a destination pincode.
const getTemporaryShippingQuote = () => ({ shippingPaise: 0 });

module.exports = ({ strapi }) => ({
  getTemporaryShippingQuote,

  async quote(body) {
    const items = validateCartItems(body);
    const quotedItems = [];
    let mrpTotalPaise = 0;
    let discountTotalPaise = 0;
    let taxableSubtotalPaise = 0;
    let gstTotalPaise = 0;
    let subtotalPaise = 0;

    for (const item of items) {
      const { product, variant } = await resolveCartLine(strapi, item);

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
