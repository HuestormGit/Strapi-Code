'use strict';

// Live Shiprocket delivery provider. Same swap contract as the fixture:
// getOptions({ destinationPincode, lines }) -> { serviceable, options[] }.
//
// Read-only. The only Shiprocket business endpoint touched here is
// GET /courier/serviceability/ — no order, shipment, AWB or pickup call.

const { checkCourierServiceability } = require('./shiprocket-serviceability');
const { selectDeliveryCouriers } = require('./shiprocket-delivery-selection');

const REQUIRED_ENV = [
  'SHIPROCKET_API_EMAIL',
  'SHIPROCKET_API_PASSWORD',
  'SHIPROCKET_API_BASE_URL',
  'SHIPROCKET_PICKUP_PINCODE',
];

// Shiprocket goes live only once every credential it needs is present, so a
// machine without them (a fresh checkout, CI) keeps the fixture instead of
// failing every delivery check.
const isConfigured = (env = process.env) =>
  REQUIRED_ENV.every((name) => typeof env[name] === 'string' && env[name].trim());

// V1 shipping price policy: the courier's freight charge IS the customer's
// shipping charge — no markup, handling, COD, insurance or ₹5/₹10 rounding.
// estimatedDays is already the canonical ETA, so min and max are the same day.
const toOption = (type, label, courier) => ({
  id: `shiprocket-${type}-${courier.courierCompanyId}`,
  type,
  label,
  shippingPaise: courier.freightChargePaise,
  estimatedDaysMin: courier.estimatedDays,
  estimatedDaysMax: courier.estimatedDays,
});

const getOptions = async (
  { destinationPincode, lines } = {},
  { env = process.env, serviceability = checkCourierServiceability } = {}
) => {
  const { eligibleCouriers } = await serviceability(
    { destinationPincode, lines },
    { env }
  );
  const { standardCourier, expressCourier } =
    selectDeliveryCouriers(eligibleCouriers);

  // No courier we are willing to ship with. That covers both "Shiprocket
  // offered nothing" and "it offered couriers we do not trust" — for the
  // customer both mean we do not deliver there. It is NOT a provider outage,
  // which throws instead and surfaces as a 503.
  if (!standardCourier) return { serviceable: false, options: [] };

  const options = [toOption('standard', 'Standard Delivery', standardCourier)];
  if (expressCourier) {
    options.push(toOption('express', 'Express Delivery', expressCourier));
  }
  return { serviceable: true, options };
};

module.exports = { name: 'shiprocket', REQUIRED_ENV, isConfigured, getOptions };
