'use strict';

// All Razorpay provider access and payment crypto lives here. Kept out of
// services/ on purpose, the same way checkout/cart-lines.js is: Strapi only
// auto-registers routes, controllers, services, policies, middlewares and
// content-types, so this stays a plain module instead of becoming a service.
//
// Nothing in this file logs, returns or embeds a credential. The key secret is
// read from the environment at call time and never leaves the module.

const crypto = require('node:crypto');
const Razorpay = require('razorpay');

const REQUIRED_ENV = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];

// Deliberately NOT part of REQUIRED_ENV. The webhook secret is a separate
// credential, generated independently in the Razorpay Dashboard when the
// webhook is configured, and it is never the API key secret. Keeping them apart
// means a leak of one does not forge the other, and an installation that has
// not set up webhooks yet still boots and still takes payments.
const WEBHOOK_SECRET_ENV = 'RAZORPAY_WEBHOOK_SECRET';

const CURRENCY = 'INR';

// Razorpay's own floor: an order below 100 paise is rejected by the provider.
const MIN_AMOUNT_PAISE = 100;

class PaymentProviderError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PaymentProviderError';
    this.status = 502;
    this.code = code;
  }
}

const isConfigured = (env = process.env) =>
  REQUIRED_ENV.every((name) => typeof env[name] === 'string' && env[name].trim());

const readConfig = (env = process.env) => {
  if (!isConfigured(env)) {
    throw new PaymentProviderError(
      'Online payment is not configured',
      'RAZORPAY_CONFIG_ERROR'
    );
  }
  return {
    keyId: env.RAZORPAY_KEY_ID.trim(),
    keySecret: env.RAZORPAY_KEY_SECRET.trim(),
  };
};

let cachedClient = null;
let cachedKeyId = null;

const getClient = (env = process.env) => {
  const { keyId, keySecret } = readConfig(env);
  if (cachedClient && cachedKeyId === keyId) return cachedClient;
  cachedClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  cachedKeyId = keyId;
  return cachedClient;
};

// Exposed for tests only: drops the memoised SDK instance.
const resetClient = () => {
  cachedClient = null;
  cachedKeyId = null;
};

// Provider errors are deliberately flattened to one opaque message. The raw
// Razorpay payload can carry request context we do not want on the wire, so it
// is returned to the caller for server-side logging and never rendered.
const providerFailed = (code, message, cause) => {
  const error = new PaymentProviderError(message, code);
  error.providerMessage =
    typeof cause?.error?.description === 'string'
      ? cause.error.description
      : cause?.message;
  throw error;
};

const requireAmountPaise = (amountPaise) => {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < MIN_AMOUNT_PAISE) {
    throw new PaymentProviderError(
      'Payment amount must be a whole number of paise of at least 100',
      'RAZORPAY_AMOUNT_INVALID'
    );
  }
  return amountPaise;
};

// amountPaise is ALREADY integer paise. There is deliberately no rupee
// conversion and no multiplication anywhere in this module.
const createOrder = async (
  { amountPaise, receipt, notes },
  { env = process.env, client = getClient(env) } = {}
) => {
  requireAmountPaise(amountPaise);
  if (typeof receipt !== 'string' || !receipt.trim()) {
    throw new PaymentProviderError(
      'Payment receipt is required',
      'RAZORPAY_RECEIPT_INVALID'
    );
  }

  let order;
  try {
    order = await client.orders.create({
      amount: amountPaise,
      currency: CURRENCY,
      receipt: receipt.trim(),
      ...(notes ? { notes } : {}),
    });
  } catch (error) {
    providerFailed(
      'RAZORPAY_ORDER_CREATE_FAILED',
      'Payment could not be started right now',
      error
    );
  }

  if (!order || typeof order.id !== 'string' || !order.id.trim()) {
    throw new PaymentProviderError(
      'Payment provider returned an unusable order',
      'RAZORPAY_ORDER_INVALID'
    );
  }
  // Trust nothing about the echo. These are returned so the caller can compare
  // them against its own stored expectation before storing the order id —
  // services/order.js does exactly that via providerOrderMismatch() — rather
  // than adopting any of them as authoritative here.
  return {
    id: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    status: order.status,
  };
};

const fetchPayment = async (
  paymentId,
  { env = process.env, client = getClient(env) } = {}
) => {
  if (typeof paymentId !== 'string' || !paymentId.trim()) {
    throw new PaymentProviderError(
      'Payment id is required',
      'RAZORPAY_PAYMENT_ID_INVALID'
    );
  }

  let payment;
  try {
    payment = await client.payments.fetch(paymentId.trim());
  } catch (error) {
    providerFailed(
      'RAZORPAY_PAYMENT_FETCH_FAILED',
      'Payment could not be confirmed with the payment provider',
      error
    );
  }

  if (!payment || typeof payment !== 'object') {
    throw new PaymentProviderError(
      'Payment provider returned an unusable payment',
      'RAZORPAY_PAYMENT_INVALID'
    );
  }
  return payment;
};

// Capture is the ONLY mutating provider call in this module, and it always
// captures the server's expected amount, never a figure taken from the client
// or echoed back by the provider.
const capturePayment = async (
  paymentId,
  amountPaise,
  { env = process.env, client = getClient(env) } = {}
) => {
  requireAmountPaise(amountPaise);
  if (typeof paymentId !== 'string' || !paymentId.trim()) {
    throw new PaymentProviderError(
      'Payment id is required',
      'RAZORPAY_PAYMENT_ID_INVALID'
    );
  }

  let payment;
  try {
    payment = await client.payments.capture(paymentId.trim(), amountPaise, CURRENCY);
  } catch (error) {
    providerFailed(
      'RAZORPAY_PAYMENT_CAPTURE_FAILED',
      'Payment could not be captured',
      error
    );
  }

  if (!payment || typeof payment !== 'object') {
    throw new PaymentProviderError(
      'Payment provider returned an unusable capture result',
      'RAZORPAY_CAPTURE_INVALID'
    );
  }
  return payment;
};

// HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, KEY_SECRET).
// Compared with timingSafeEqual after an explicit length check, because
// timingSafeEqual throws on unequal lengths and a plain !== leaks timing.
const verifySignature = (
  { razorpayOrderId, razorpayPaymentId, signature },
  { env = process.env } = {}
) => {
  const { keySecret } = readConfig(env);
  if (
    typeof razorpayOrderId !== 'string' ||
    typeof razorpayPaymentId !== 'string' ||
    typeof signature !== 'string'
  ) {
    return false;
  }

  const expected = Buffer.from(
    crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex'),
    'utf8'
  );
  const received = Buffer.from(signature, 'utf8');

  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
};

// Webhook credential, read at call time and never returned, logged or cached.
const readWebhookSecret = (env = process.env) => {
  const secret = env[WEBHOOK_SECRET_ENV];
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new PaymentProviderError(
      'Payment webhooks are not configured',
      'RAZORPAY_WEBHOOK_CONFIG_ERROR'
    );
  }
  return secret.trim();
};

const isWebhookConfigured = (env = process.env) =>
  typeof env[WEBHOOK_SECRET_ENV] === 'string' && Boolean(env[WEBHOOK_SECRET_ENV].trim());

// HMAC_SHA256(EXACT raw request body, WEBHOOK_SECRET) as lowercase hex.
//
// rawBody must be the bytes Razorpay actually sent. JSON.stringify of a parsed
// body is a DIFFERENT byte string — key order, whitespace and number formatting
// all move — so it would fail here, which is the intended behaviour rather than
// something to work around. Compared with timingSafeEqual after an explicit
// length check, exactly as verifySignature does.
const verifyWebhookSignature = (rawBody, signature, { env = process.env } = {}) => {
  const secret = readWebhookSecret(env);

  // Shape check first: a signature that is not 64 hex characters is malformed
  // and can be rejected without hashing anything.
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  if (typeof rawBody === 'string') {
    if (!rawBody.length) return false;
  } else if (!Buffer.isBuffer(rawBody) || !rawBody.length) {
    return false;
  }

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex'),
    'utf8'
  );
  const received = Buffer.from(signature.toLowerCase(), 'utf8');

  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
};

// The only provider fields ever persisted. Card, bank, VPA, contact, email and
// every other provider internal is dropped rather than snapshotted.
const safePaymentSnapshot = (payment) => ({
  id: typeof payment?.id === 'string' ? payment.id : null,
  order_id: typeof payment?.order_id === 'string' ? payment.order_id : null,
  amount: Number.isSafeInteger(payment?.amount) ? payment.amount : null,
  currency: typeof payment?.currency === 'string' ? payment.currency : null,
  status: typeof payment?.status === 'string' ? payment.status : null,
  captured: typeof payment?.captured === 'boolean' ? payment.captured : null,
  method: typeof payment?.method === 'string' ? payment.method : null,
});

module.exports = {
  CURRENCY,
  MIN_AMOUNT_PAISE,
  REQUIRED_ENV,
  WEBHOOK_SECRET_ENV,
  PaymentProviderError,
  isConfigured,
  getClient,
  resetClient,
  createOrder,
  fetchPayment,
  capturePayment,
  verifySignature,
  isWebhookConfigured,
  verifyWebhookSignature,
  safePaymentSnapshot,
};
