'use strict';

// Customer-facing order identifier. Also used verbatim as the Razorpay
// `receipt`, so it must stay <= 40 characters and carry no PII.
//
// Shape: AR-YYYYMMDD-XXXXXXXXXXXX  (24 chars)
//   AR         brand prefix
//   YYYYMMDD   UTC date, so the same instant always yields the same prefix
//              regardless of server timezone
//   XXXX…      12 Crockford-style base32 characters = 60 bits of CSPRNG
//              entropy, which makes a same-day collision negligible. The
//              PostgreSQL unique index orders_order_number_unique (added by
//              database/migrations) is the final protection under concurrent
//              creation; Strapi's own `"unique": true` reads before it writes
//              and so cannot stop two simultaneous inserts on its own.

const { randomBytes } = require('node:crypto');

const PREFIX = 'AR';
// Crockford base32: no I, L, O or U, so a number read aloud or retyped from a
// support call cannot be confused with 1/0 or turn into an unintended word.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SUFFIX_LENGTH = 12;

const ORDER_NUMBER_PATTERN = /^AR-[0-9]{8}-[0-9A-HJKMNP-TV-Z]{12}$/;
const MAX_ORDER_NUMBER_LENGTH = 40;

const datePart = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('generateOrderNumber requires a valid Date');
  }
  return date.toISOString().slice(0, 10).replace(/-/g, '');
};

// Rejection sampling would be pointless here: 256 is a whole multiple of 32,
// so masking the low 5 bits of each random byte is already uniform.
const randomSuffix = (bytes = randomBytes) => {
  const source = bytes(SUFFIX_LENGTH);
  let suffix = '';
  for (let index = 0; index < SUFFIX_LENGTH; index += 1) {
    suffix += ALPHABET[source[index] % ALPHABET.length];
  }
  return suffix;
};

const generateOrderNumber = ({ now = new Date(), bytes = randomBytes } = {}) => {
  const orderNumber = `${PREFIX}-${datePart(now)}-${randomSuffix(bytes)}`;
  if (orderNumber.length > MAX_ORDER_NUMBER_LENGTH) {
    throw new Error('Generated order number exceeds the Razorpay receipt limit');
  }
  return orderNumber;
};

module.exports = {
  ALPHABET,
  MAX_ORDER_NUMBER_LENGTH,
  ORDER_NUMBER_PATTERN,
  SUFFIX_LENGTH,
  generateOrderNumber,
};
