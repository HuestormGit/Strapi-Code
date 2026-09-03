'use strict';

const { invalid, validateCartItems, resolveCartLines } = require('../cart-lines');
const fixtureProvider = require('../shipping-provider');
const shiprocketProvider = require('../shiprocket-provider');

const PINCODE_PATTERN = /^[0-9]{6}$/;

// Shiprocket is the live provider as soon as its backend credentials exist;
// without them the fixture keeps local development and the tests working.
// An injected provider always wins, so tests never reach the network.
const defaultProvider = (env = process.env) =>
  shiprocketProvider.isConfigured(env) ? shiprocketProvider : fixtureProvider;

// A provider that is down is NOT the same as a pincode we do not deliver to, so
// it gets its own status and never collapses into serviceable: false.
const providerFailed = (message) => {
  const error = new Error(message);
  error.status = 503;
  throw error;
};

const validatePincode = (value) => {
  if (typeof value !== 'string') {
    invalid('destinationPincode must be a string');
  }
  if (!PINCODE_PATTERN.test(value)) {
    invalid('destinationPincode must be exactly 6 digits');
  }
  return value;
};

// Authoritative shipping inputs, read from the variant rows — never from the
// browser, and never derived from packSize (that is customer-facing copy).
// Missing weights stay null rather than being invented.
const packageDataFor = (lines) => {
  const items = lines.map(({ item, variant }) => ({
    variantDocumentId: item.variantDocumentId,
    quantity: item.quantity,
    weightGrams:
      Number.isSafeInteger(variant.weightGrams) && variant.weightGrams >= 0
        ? variant.weightGrams
        : null,
    dimensions: variant.dimensions || null,
  }));

  const complete = items.every((entry) => entry.weightGrams !== null);
  const total = complete
    ? items.reduce((sum, entry) => sum + entry.weightGrams * entry.quantity, 0)
    : null;

  return {
    items,
    totalWeightGrams: Number.isSafeInteger(total) ? total : null,
  };
};

const text = (value) => typeof value === 'string' && value.trim() !== '';
const days = (value) => Number.isSafeInteger(value) && value >= 0;

const normaliseOption = (option) => {
  if (!option || typeof option !== 'object') {
    providerFailed('Delivery provider returned an invalid option');
  }
  if (!text(option.id) || !text(option.label)) {
    providerFailed('Delivery provider returned an option without an id or label');
  }
  if (!Number.isSafeInteger(option.shippingPaise) || option.shippingPaise < 0) {
    providerFailed('Delivery provider returned an invalid shipping amount');
  }
  if (
    !days(option.estimatedDaysMin) ||
    !days(option.estimatedDaysMax) ||
    option.estimatedDaysMin > option.estimatedDaysMax
  ) {
    providerFailed('Delivery provider returned an invalid delivery estimate');
  }

  // Allowlist: only these fields ever reach the browser. Courier identity,
  // rating, mode and the raw provider record stay server-side.
  return {
    id: option.id.trim(),
    ...(text(option.type) ? { type: option.type.trim() } : {}),
    label: option.label.trim(),
    shippingPaise: option.shippingPaise,
    estimatedDaysMin: option.estimatedDaysMin,
    estimatedDaysMax: option.estimatedDaysMax,
  };
};

module.exports = ({ strapi, provider }) => ({
  async getOptions(body) {
    const destinationPincode = validatePincode(body?.destinationPincode);
    const items = validateCartItems(body);
    const lines = await resolveCartLines(strapi, items);
    const activeProvider = provider || defaultProvider();

    let result;
    try {
      result = await activeProvider.getOptions({
        destinationPincode,
        items,
        // Resolved catalogue rows: the live provider derives the shipment
        // weight from these, never from anything the browser sent.
        lines,
        packageData: packageDataFor(lines),
      });
    } catch (error) {
      strapi?.log?.error?.(`Delivery provider failed: ${error.message}`);
      providerFailed('Delivery availability could not be checked right now');
    }

    if (!result || typeof result !== 'object' || typeof result.serviceable !== 'boolean') {
      providerFailed('Delivery provider returned an unusable response');
    }
    if (!Array.isArray(result.options)) {
      providerFailed('Delivery provider returned an unusable response');
    }
    if (!result.serviceable) {
      return { destinationPincode, serviceable: false, options: [] };
    }
    if (result.options.length === 0) {
      providerFailed('Delivery provider returned no options for a serviceable pincode');
    }

    return {
      destinationPincode,
      serviceable: true,
      options: result.options.map(normaliseOption),
    };
  },
});
