'use strict';

const configurationIncomplete = (message) => {
  const error = new Error(message);
  error.code = 'SHIPPING_CONFIGURATION_INCOMPLETE';
  error.status = 503;
  throw error;
};

const positiveSafeInteger = (value) =>
  Number.isSafeInteger(value) && value > 0;

const calculateSkuPackagedWeightTotalGrams = (lines) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    configurationIncomplete('Shipping configuration has no valid cart lines');
  }

  let total = 0;
  for (const line of lines) {
    const shippingWeightGrams = line?.variant?.shippingWeightGrams;
    const quantity = line?.item?.quantity;
    if (!positiveSafeInteger(shippingWeightGrams)) {
      configurationIncomplete('Product variant shipping weight is incomplete');
    }
    if (!positiveSafeInteger(quantity)) {
      configurationIncomplete('Cart line quantity is invalid for shipping');
    }

    const lineWeight = shippingWeightGrams * quantity;
    if (!Number.isSafeInteger(lineWeight)) {
      configurationIncomplete('SKU packaged weight subtotal is too large');
    }
    total += lineWeight;
    if (!Number.isSafeInteger(total)) {
      configurationIncomplete('SKU packaged weight subtotal is too large');
    }
  }

  return total;
};

const calculatePackedShipmentWeightGrams = (
  { skuPackagedWeightTotalGrams, outerPackagingWeightGrams } = {}
) => {
  if (!positiveSafeInteger(skuPackagedWeightTotalGrams)) {
    configurationIncomplete('SKU packaged weight subtotal is incomplete');
  }
  if (!positiveSafeInteger(outerPackagingWeightGrams)) {
    configurationIncomplete('Outer packaging weight is incomplete');
  }

  const total = skuPackagedWeightTotalGrams + outerPackagingWeightGrams;
  if (!Number.isSafeInteger(total)) {
    configurationIncomplete('Packed shipment weight is too large');
  }
  return total;
};

module.exports = {
  calculateSkuPackagedWeightTotalGrams,
  calculatePackedShipmentWeightGrams,
};
