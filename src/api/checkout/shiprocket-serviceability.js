'use strict';

const {
  ShiprocketError,
  shiprocketRequest,
} = require('./shiprocket-client');
const { normalizeCouriers } = require('./shiprocket-couriers');

const PINCODE_PATTERN = /^[0-9]{6}$/;

const fail = (code, message) => {
  throw new ShiprocketError(code, message);
};

const readPickupPincode = (env = process.env) => {
  const value =
    typeof env.SHIPROCKET_PICKUP_PINCODE === 'string'
      ? env.SHIPROCKET_PICKUP_PINCODE.trim()
      : '';
  if (!PINCODE_PATTERN.test(value)) {
    fail(
      'SHIPROCKET_CONFIG_ERROR',
      'Shiprocket pickup pincode is missing or invalid'
    );
  }
  return value;
};

// Temporary V1 shipping-weight policy: Product Variant weightGrams is used for
// Shiprocket rate estimation. This is the bare product weight, so the quoted
// rate is an approximation — immediate packaging (shippingWeightGrams), outer
// carton, filler and volumetric dimensions are intentionally deferred, not
// silently folded in here.
// ponytail: approximate weight, switch to shippingWeightGrams + packaging once
// those are populated and a packed-weight policy is agreed.
const calculateTotalWeightGrams = (lines) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    fail('SHIPROCKET_CATALOG_ERROR', 'Shipment has no valid cart lines');
  }

  let total = 0;
  for (const line of lines) {
    const weightGrams = line?.variant?.weightGrams;
    const quantity = line?.item?.quantity;
    if (!Number.isSafeInteger(weightGrams) || weightGrams <= 0) {
      fail(
        'SHIPROCKET_CATALOG_ERROR',
        'Product variant has invalid shipping weight'
      );
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      fail('SHIPROCKET_CATALOG_ERROR', 'Cart line has invalid quantity');
    }

    const lineWeight = weightGrams * quantity;
    if (!Number.isSafeInteger(lineWeight)) {
      fail('SHIPROCKET_CATALOG_ERROR', 'Shipment weight is too large');
    }
    total += lineWeight;
    if (!Number.isSafeInteger(total)) {
      fail('SHIPROCKET_CATALOG_ERROR', 'Shipment weight is too large');
    }
  }

  return total;
};

const gramsToKilograms = (weightGrams) => {
  if (!Number.isSafeInteger(weightGrams) || weightGrams <= 0) {
    fail('SHIPROCKET_CATALOG_ERROR', 'Shipment weight is invalid');
  }
  const weightKg = weightGrams / 1000;
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    fail('SHIPROCKET_CATALOG_ERROR', 'Shipment weight is invalid');
  }
  return weightKg;
};

const checkCourierServiceability = async (
  { destinationPincode, lines } = {},
  { env = process.env, request = shiprocketRequest } = {}
) => {
  const pickupPincode = readPickupPincode(env);
  if (
    typeof destinationPincode !== 'string' ||
    !PINCODE_PATTERN.test(destinationPincode)
  ) {
    fail(
      'SHIPROCKET_REQUEST_ERROR',
      'Shiprocket destination pincode is invalid'
    );
  }

  const response = await request(
    {
      method: 'GET',
      path: '/courier/serviceability/',
      params: {
        pickup_postcode: pickupPincode,
        delivery_postcode: destinationPincode,
        cod: 0,
        weight: gramsToKilograms(calculateTotalWeightGrams(lines)),
      },
    },
    { env }
  );

  if (
    !response ||
    typeof response !== 'object' ||
    Array.isArray(response) ||
    !response.data ||
    typeof response.data !== 'object' ||
    Array.isArray(response.data) ||
    !Array.isArray(response.data.available_courier_companies)
  ) {
    fail(
      'SHIPROCKET_RESPONSE_ERROR',
      'Shiprocket returned an invalid serviceability response'
    );
  }

  return normalizeCouriers(response.data.available_courier_companies);
};

module.exports = {
  readPickupPincode,
  calculateTotalWeightGrams,
  gramsToKilograms,
  checkCourierServiceability,
};
