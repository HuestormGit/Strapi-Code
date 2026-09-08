'use strict';

// Server-authoritative Razorpay payment orchestration.
//
// The browser never supplies money. Every paise charged is rebuilt here from
// the catalogue (api::checkout.checkout) and a FRESH delivery rate check
// (api::checkout.shipping) at the moment payment is created. Any monetary
// field present in the request body is simply never read.
//
// Plain factory rather than createCoreService, matching api/checkout: the order
// routes are entirely custom, nothing calls the core CRUD service methods, and
// this shape is directly constructible in tests without booting Strapi.

const crypto = require('node:crypto');

const {
  addMoney,
  validateCartItems,
  resolveCartLines,
} = require('../../checkout/cart-lines');
const { generateOrderNumber } = require('../order-number');
const razorpayClient = require('../razorpay-client');

const ORDER_UID = 'api::order.order';
const ORDER_ITEM_UID = 'api::order-item.order-item';
const PAYMENT_ATTEMPT_UID = 'api::payment-attempt.payment-attempt';
const WEBHOOK_EVENT_UID = 'api::razorpay-webhook-event.razorpay-webhook-event';

const CURRENCY = 'INR';
const PINCODE_PATTERN = /^[0-9]{6}$/;
// Deliberately loose: a trust-boundary shape check, not an address validator.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT_LENGTH = 200;

// Provider statuses. "captured" is the only status that can ever mark an order
// paid; "authorized" earns a capture attempt first.
const STATUS_CAPTURED = 'captured';
const STATUS_AUTHORIZED = 'authorized';

// Releasing a verification claim lets the customer pay again, so it is only
// ever done on positive evidence from the provider that no money is held and
// none has moved. Every other outcome — a provider we could not reach very much
// included — keeps the claim and waits for reconciliation.
const NO_MONEY_STATUSES = new Set(['created', 'failed']);

// ---------------------------------------------------------------------------
// Payment state machine
//
//   pending ──claim(P)──▶ processing ──confirm(P)──▶ paid
//                              │
//                              └──release──▶ pending   (no money moved)
//
// Each arrow is ONE update statement whose WHERE clause names the expected
// current state, so PostgreSQL serialises the row and a second concurrent
// request simply changes 0 rows. The claim is taken BEFORE any provider call,
// which is what stops two different payment ids from both reaching capture.
// ---------------------------------------------------------------------------
const PAYMENT_PENDING = 'pending';
const PAYMENT_PROCESSING = 'processing';
const PAYMENT_PAID = 'paid';

// ---------------------------------------------------------------------------
// Webhook events
//
// Razorpay emits BOTH order.paid and payment.captured for one capture, may
// deliver either more than once, and may deliver them out of order. All of that
// is absorbed by reusing the state machine above: every arrow is still one
// guarded UPDATE, so a late or repeated event simply changes 0 rows.
//
// payment.authorized is recorded but never captured from — see the note on
// AUTHORIZED_NOT_CAPTURED below.
// ---------------------------------------------------------------------------
const EVENT_PAYMENT_AUTHORIZED = 'payment.authorized';
const EVENT_PAYMENT_CAPTURED = 'payment.captured';
const EVENT_PAYMENT_FAILED = 'payment.failed';
const EVENT_ORDER_PAID = 'order.paid';

const HANDLED_EVENTS = new Set([
  EVENT_PAYMENT_AUTHORIZED,
  EVENT_PAYMENT_CAPTURED,
  EVENT_PAYMENT_FAILED,
  EVENT_ORDER_PAID,
]);

// An event that reached one of these is finished: redelivery is answered
// straight from the row without touching the order again. `received` and
// `failed` are deliberately NOT here, so a crash mid-processing leaves the
// event retryable rather than permanently swallowed.
const EVENT_TERMINAL = new Set(['processed', 'ignored', 'conflict']);

const fail = (status, name, message, details) => {
  const error = new Error(message);
  error.status = status;
  error.name = name;
  if (details) error.details = details;
  throw error;
};

const invalidRequest = (message) => fail(400, 'ValidationError', message);

// Another request holds the claim on this order and is talking to the provider
// right now. Transient, and never a licence to pay a second time.
const verificationInProgress = () =>
  fail(
    409,
    'PaymentVerificationInProgress',
    'This payment is already being confirmed. Please do not pay again.',
    { code: 'PAYMENT_VERIFICATION_IN_PROGRESS' }
  );

const paymentAlreadyRecorded = () =>
  fail(
    409,
    'PaymentAlreadyRecorded',
    'This order has already been paid with a different payment',
    { code: 'PAYMENT_ALREADY_RECORDED' }
  );

// Razorpay Checkout ignores the client's `amount` whenever an order_id is
// present, so the provider's echo IS what the customer will be charged. It has
// to agree with what we asked for before its id is stored or reaches a browser.
const providerOrderMismatch = (providerOrder, expectedAmountMinor, expectedReceipt) => {
  if (typeof providerOrder?.id !== 'string' || !providerOrder.id.trim()) {
    return 'Provider order id is missing';
  }
  if (
    !Number.isSafeInteger(providerOrder.amount) ||
    providerOrder.amount !== expectedAmountMinor
  ) {
    return 'Provider order amount does not match the payable total';
  }
  if (providerOrder.currency !== CURRENCY) {
    return 'Provider order currency does not match the expected currency';
  }
  if (providerOrder.receipt !== expectedReceipt) {
    return 'Provider order receipt does not match the order number';
  }
  return null;
};

const requireUser = (user) => {
  // Fails closed. A CMS API token satisfies the route's auth but leaves
  // ctx.state.user undefined, and that must not be enough to move money.
  if (!user || !Number.isInteger(user.id)) {
    fail(401, 'UnauthorizedError', 'You must be signed in to pay for an order');
  }
  return user;
};

const requiredText = (value, field, { max = MAX_TEXT_LENGTH } = {}) => {
  if (typeof value !== 'string' || !value.trim()) {
    invalidRequest(`shippingAddress.${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    invalidRequest(`shippingAddress.${field} is too long`);
  }
  return trimmed;
};

const optionalText = (value, field, { max = MAX_TEXT_LENGTH } = {}) => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') {
    invalidRequest(`shippingAddress.${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    invalidRequest(`shippingAddress.${field} is too long`);
  }
  return trimmed;
};

const validatePincode = (value, field) => {
  if (typeof value !== 'string' || !PINCODE_PATTERN.test(value.trim())) {
    invalidRequest(`${field} must be exactly 6 digits`);
  }
  return value.trim();
};

// Matches what the current checkout collects (10 digits), while tolerating the
// +91 / 91 / 0 prefixes people type. Stored normalised to the bare 10 digits.
const validatePhone = (value) => {
  const raw = requiredText(value, 'phone', { max: 20 });
  const digits = raw.replace(/[\s()-]/g, '').replace(/^(?:\+?91|0)/, '');
  if (!/^[0-9]{10}$/.test(digits)) {
    invalidRequest('shippingAddress.phone must be a 10-digit Indian mobile number');
  }
  return digits;
};

const validateEmail = (value) => {
  const email = requiredText(value, 'email').toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    invalidRequest('shippingAddress.email must be a valid email address');
  }
  return email;
};

// Returns the shipping-snapshot component payload. country and capturedAt are
// set here, never accepted from the request.
const validateShippingAddress = (address, destinationPincode) => {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    invalidRequest('shippingAddress must be an object');
  }

  const postalCode = validatePincode(address.postalCode, 'shippingAddress.postalCode');
  if (postalCode !== destinationPincode) {
    invalidRequest(
      'shippingAddress.postalCode must match destinationPincode'
    );
  }

  return {
    fullName: requiredText(address.fullName, 'fullName'),
    phone: validatePhone(address.phone),
    email: validateEmail(address.email),
    addressLine1: requiredText(address.addressLine1, 'addressLine1'),
    addressLine2: optionalText(address.addressLine2, 'addressLine2'),
    landmark: optionalText(address.landmark, 'landmark'),
    city: requiredText(address.city, 'city'),
    state: requiredText(address.state, 'state'),
    postalCode,
    country: 'India',
    capturedAt: new Date(),
  };
};

const validateSelectedShippingOptionId = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    invalidRequest('selectedShippingOptionId must be a non-empty string');
  }
  return value.trim();
};

const requiredProviderId = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    invalidRequest(`${field} is required`);
  }
  return value.trim();
};

// Order Item rows are built purely from the authoritative quote line plus the
// resolved catalogue row. Nothing here can originate in the request body.
const toOrderItemData = (quoteItem, variant) => ({
  productVariant: { documentId: variant.documentId },
  quantity: quoteItem.quantity,
  currency: CURRENCY,
  unitMrpMinor: quoteItem.unitMrpPaise,
  unitDiscountMinor: quoteItem.unitDiscountPaise,
  unitSellingPriceMinor: quoteItem.unitSellingPricePaise,
  unitTaxableBaseMinor: quoteItem.unitTaxableBasePaise,
  unitGstMinor: quoteItem.unitGstPaise,
  gstRateBps: quoteItem.gstRateBps,
  lineMrpTotalMinor: quoteItem.lineMrpPaise,
  lineDiscountMinor: quoteItem.lineDiscountPaise,
  lineTaxableBaseMinor: quoteItem.lineTaxableBasePaise,
  lineGstMinor: quoteItem.lineGstPaise,
  lineTotalMinor: quoteItem.lineTotalPaise,
  productTitleSnapshot: quoteItem.productName,
  skuSnapshot: quoteItem.sku,
  packSizeSnapshot: quoteItem.size,
  // Not exposed by the public quote projection, so read straight off the
  // resolved variant rather than widening that response.
  variantNameSnapshot: typeof variant.name === 'string' ? variant.name : '',
  weightGramsSnapshot: Number.isSafeInteger(variant.weightGrams)
    ? variant.weightGrams
    : null,
  hsnCodeSnapshot: typeof variant.hsnCode === 'string' ? variant.hsnCode : '',
});

module.exports = ({ strapi }) => {
  const documents = (uid) => strapi.documents(uid);

  // Guarded transitions go through knex rather than the Document Service
  // because only a single conditional UPDATE can be atomic: the Document
  // Service reads, then writes, which is exactly the race being closed here.
  // Every value below is a knex binding — nothing is interpolated into SQL.
  const orderRows = () => strapi.db.connection(strapi.db.metadata.get(ORDER_UID).tableName);

  // The guards key off the numeric row id. Losing it would silently widen an
  // UPDATE, so refuse instead of guessing.
  const numericId = (order) => {
    if (!Number.isInteger(order?.id)) {
      fail(500, 'OrderStateError', 'Order row id is unavailable');
    }
    return order.id;
  };

  // pending → processing. Wins for exactly one payment id; every other
  // concurrent caller changes 0 rows and never reaches the provider.
  const claimOrderForPayment = (orderId, providerPaymentId, now) =>
    orderRows()
      .where({ id: orderId, payment_status: PAYMENT_PENDING })
      .whereNull('payment_provider_payment_id')
      .update({
        payment_status: PAYMENT_PROCESSING,
        payment_provider_payment_id: providerPaymentId,
        last_payment_attempt_at: now,
        updated_at: now,
      });

  // processing → paid, still guarded on owning the claim.
  const confirmOrderPaid = (orderId, providerPaymentId, now) =>
    orderRows()
      .where({
        id: orderId,
        payment_status: PAYMENT_PROCESSING,
        payment_provider_payment_id: providerPaymentId,
      })
      .update({
        payment_status: PAYMENT_PAID,
        paid_at: now,
        last_payment_error: null,
        updated_at: now,
      });

  // processing → pending, clearing the id so a later attempt can claim. Only
  // called when the provider has told us no money moved.
  const releaseClaim = (orderId, providerPaymentId, reason, now) =>
    orderRows()
      .where({
        id: orderId,
        payment_status: PAYMENT_PROCESSING,
        payment_provider_payment_id: providerPaymentId,
      })
      .update({
        payment_status: PAYMENT_PENDING,
        payment_provider_payment_id: null,
        last_payment_error: reason,
        updated_at: now,
      });

  const findOrderByProviderOrderId = async (providerOrderId) => {
    const [order] = await documents(ORDER_UID).findMany({
      filters: { paymentProviderOrderId: providerOrderId },
      populate: { customer: true },
      limit: 1,
    });
    return order || null;
  };

  const findAttemptByReference = async (attemptReference) => {
    const [attempt] = await documents(PAYMENT_ATTEMPT_UID).findMany({
      filters: { attemptReference },
      limit: 1,
    });
    return attempt || null;
  };

  const markAttemptFailed = async (attemptReference, reason, providerPaymentId) => {
    const attempt = await findAttemptByReference(attemptReference);
    if (!attempt || attempt.status === 'succeeded') return;
    await documents(PAYMENT_ATTEMPT_UID).update({
      documentId: attempt.documentId,
      data: {
        status: 'failed',
        failureReason: reason,
        completedAt: new Date(),
        ...(providerPaymentId ? { providerPaymentId } : {}),
      },
    });
  };

  const paidResponse = (order) => ({
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    grandTotalMinor: order.grandTotalMinor,
    currency: order.currency || CURRENCY,
  });

  // How an order that is no longer `pending` answers this payment id. Returns
  // the idempotent success for a repeat of the winning payment, and throws for
  // every other combination; null means the order is still claimable.
  // adoptOwnClaim is the webhook's one and only difference, and it is a
  // liveness difference, not a security one: a browser that vanished mid-verify
  // leaves its own claim stranded in `processing`, and the webhook exists
  // precisely to finish it. Every rejection below stays identical for both
  // callers — a competing payment id is refused just as hard either way.
  const settledResponse = (order, razorpayPaymentId, { adoptOwnClaim = false } = {}) => {
    const ownsIt = order.paymentProviderPaymentId === razorpayPaymentId;

    if (order.paymentStatus === PAYMENT_PAID) {
      if (ownsIt) return paidResponse(order);
      strapi.log.warn(
        `[order] second payment id presented for already-paid order ${order.orderNumber}`
      );
      paymentAlreadyRecorded();
    }

    if (order.paymentStatus === PAYMENT_PROCESSING) {
      // Same payment, still in flight: transient for the browser, which must
      // not be told to pay again; resumable for the webhook, which is the
      // reconciliation path and already owns this exact payment id.
      if (ownsIt) {
        if (adoptOwnClaim) return null;
        verificationInProgress();
      }
      // A different payment id cannot take over a live claim, which is the
      // whole point — this is the request that never reaches capture.
      strapi.log.warn(
        `[order] competing payment id rejected for in-flight order ${order.orderNumber}`
      );
      paymentAlreadyRecorded();
    }

    return null;
  };

  // Every provider-side assertion in one place, so the capture path re-runs
  // exactly the same checks on the captured payment.
  const paymentMismatch = (payment, order, razorpayOrderId, razorpayPaymentId) => {
    // Strict: a provider response without a usable id is malformed, and a
    // malformed response must fail closed rather than skip the check.
    if (typeof payment.id !== 'string' || payment.id !== razorpayPaymentId) {
      return 'Payment id does not match the verified payment';
    }
    if (payment.order_id !== razorpayOrderId) {
      return 'Payment does not belong to the expected provider order';
    }
    if (
      !Number.isSafeInteger(payment.amount) ||
      payment.amount !== order.grandTotalMinor
    ) {
      return 'Payment amount does not match the expected order amount';
    }
    if (payment.currency !== CURRENCY) {
      return 'Payment currency does not match the expected order currency';
    }
    return null;
  };

  // ---------------------------------------------------------------------
  // THE SHARED RECONCILIATION. Both the browser callback and the Razorpay
  // webhook end here, so there is exactly ONE implementation of "is this
  // payment real, is it ours, is it the right money, and may this order become
  // paid". Neither caller can soften a check the other enforces.
  //
  // What differs between them is only how they earned the right to be here:
  // the callback authenticated a customer and checked the checkout signature,
  // the webhook verified an HMAC over the raw request body. From this line on
  // the rules are identical.
  // ---------------------------------------------------------------------
  const reconcileCapturedPayment = async ({
    order,
    razorpayOrderId,
    razorpayPaymentId,
    source,
  }) => {
    const adoptOwnClaim = source === 'webhook';

    // Idempotency and conflict rules, re-evaluated here so the webhook gets
    // them too. Cheap and pure — the callback having already run this changes
    // nothing.
    const settled = settledResponse(order, razorpayPaymentId, { adoptOwnClaim });
    if (settled) return settled;

    // A webhook resuming its own stranded claim already holds it; taking it
    // again would change 0 rows and look like a loss. Note this can only ever
    // be true for the SAME payment id — settledResponse above has already
    // refused every other id — so this is never a way to steal a claim.
    const holdsClaim =
      order.paymentStatus === PAYMENT_PROCESSING &&
      order.paymentProviderPaymentId === razorpayPaymentId;

    const orderId = numericId(order);

    // THE CLAIM. One atomic pending → processing transition carrying this
    // payment id. Exactly one concurrent request can win it, and the losers
    // return below without ever reaching the provider — which is what stops
    // two different payment ids from both being captured. A browser verify and
    // a webhook racing for the same payment both come through here, so exactly
    // one of them reaches capture and the other resolves off the stored row.
    if (!holdsClaim) {
      const claimed = await claimOrderForPayment(orderId, razorpayPaymentId, new Date());
      if (claimed !== 1) {
        const current = await documents(ORDER_UID).findOne({
          documentId: order.documentId,
        });
        const lost = current
          ? settledResponse(current, razorpayPaymentId, { adoptOwnClaim })
          : null;
        if (lost) return lost;
        // Lost the claim yet the row is neither paid nor processing: it moved
        // in a way this state machine does not model. Refuse rather than guess.
        verificationInProgress();
      }
    }

    // Past this point the claim is held, and every exit either confirms it,
    // releases it on positive evidence that no money moved, or leaves it in
    // place for reconciliation. It is never dropped silently.
    const abandonClaim = async (reason, { release }) => {
      strapi.log.warn(
        `[order] ${order.orderNumber}: ${reason} (claim ${release ? 'released' : 'retained'})`
      );
      await markAttemptFailed(razorpayOrderId, reason, razorpayPaymentId);
      if (release) {
        await releaseClaim(orderId, razorpayPaymentId, reason, new Date());
        return;
      }
      await documents(ORDER_UID).update({
        documentId: order.documentId,
        data: { lastPaymentError: reason },
      });
    };

    const rejectVerification = async (reason, { release }) => {
      await abandonClaim(reason, { release });
      fail(400, 'PaymentVerificationFailed', 'Payment could not be verified');
    };

    // Read-only provider confirmation. A provider outage must never fall
    // back to trusting the signature alone.
    let payment;
    try {
      payment = await razorpayClient.fetchPayment(razorpayPaymentId);
    } catch (error) {
      strapi.log.error(
        `[order] payment fetch failed for order ${order.orderNumber}: ${error.code || error.name}`
      );
      // We did not capture, but the provider's own auto-capture may have, and
      // with the provider unreachable we cannot tell. Keep the claim.
      await abandonClaim(
        'Payment could not be confirmed with the payment provider',
        { release: false }
      );
      fail(
        502,
        'PaymentProviderError',
        'Payment could not be confirmed with the payment provider'
      );
    }

    // Positive evidence that no money has been taken FOR THIS ORDER, which is
    // the only thing that justifies letting the customer pay again: either
    // the payment we fetched belongs to some other provider order, so this
    // one has no payment at all, or it is ours and its status says nothing
    // has moved. Anything else — including a status we do not recognise —
    // keeps the claim.
    const foreignPayment = payment.order_id !== razorpayOrderId;
    const noMoneyMoved = foreignPayment || NO_MONEY_STATUSES.has(payment.status);

    const mismatch = paymentMismatch(
      payment,
      order,
      razorpayOrderId,
      razorpayPaymentId
    );
    if (mismatch) await rejectVerification(mismatch, { release: noMoneyMoved });

    // Capture policy: "captured" is accepted; "authorized" is captured
    // explicitly for the SERVER's expected amount and must come back
    // captured, re-checked against the same assertions; anything else fails.
    let confirmed = payment;
    if (payment.status === STATUS_AUTHORIZED) {
      try {
        confirmed = await razorpayClient.capturePayment(
          razorpayPaymentId,
          order.grandTotalMinor
        );
      } catch (error) {
        strapi.log.error(
          `[order] capture failed for order ${order.orderNumber}: ${error.code || error.name}`
        );
        // The capture may well have succeeded with only its response lost, so
        // this order must never become payable again on its own.
        await abandonClaim('Payment could not be captured', { release: false });
        fail(502, 'PaymentProviderError', 'Payment could not be captured');
      }
      const captureMismatch = paymentMismatch(
        confirmed,
        order,
        razorpayOrderId,
        razorpayPaymentId
      );
      // Money has moved by now, whatever the mismatch says: keep the claim.
      if (captureMismatch) await rejectVerification(captureMismatch, { release: false });
    }

    if (confirmed.status !== STATUS_CAPTURED) {
      await rejectVerification(
        `Payment status ${confirmed.status} is not acceptable`,
        { release: noMoneyMoved }
      );
    }

    // THE CONFIRMATION. Still guarded on owning the claim, so a paid order can
    // only ever carry the payment id that won it.
    const paidAt = new Date();
    const won = await confirmOrderPaid(orderId, razorpayPaymentId, paidAt);
    if (won !== 1) {
      // Our own claim is gone and the money is captured — only an out-of-band
      // change (an admin edit, a future reconciliation job) does that. Report
      // whatever the row actually says now rather than re-driving the
      // transition: if it already reads paid with this payment id, that is
      // still the right answer for this caller.
      strapi.log.error(
        `[order] ${order.orderNumber}: paid transition lost its claim after a confirmed capture`
      );
      const current = await documents(ORDER_UID).findOne({
        documentId: order.documentId,
      });
      const resolved = current
        ? settledResponse(current, razorpayPaymentId, { adoptOwnClaim })
        : null;
      if (resolved) return resolved;
      paymentAlreadyRecorded();
    }

    const attempt = await findAttemptByReference(razorpayOrderId);
    if (attempt) {
      await documents(PAYMENT_ATTEMPT_UID).update({
        documentId: attempt.documentId,
        data: {
          status: 'succeeded',
          providerPaymentId: razorpayPaymentId,
          completedAt: paidAt,
          // An earlier failed attempt must not leave its reason hanging off a
          // succeeded one.
          failureReason: null,
          providerResponse: razorpayClient.safePaymentSnapshot(confirmed),
        },
      });
    }

    // Re-read: the guarded transitions went through knex, so the document
    // fetched before the claim is stale.
    const updated = await documents(ORDER_UID).findOne({
      documentId: order.documentId,
    });
    return paidResponse(
      updated || {
        ...order,
        paymentStatus: PAYMENT_PAID,
        paymentProviderPaymentId: razorpayPaymentId,
      }
    );
  };

  // --------------------------------------------------------------- webhook

  // Durable replay protection. The UNIQUE constraint on provider_event_id is
  // what actually decides a race, not the read: two workers handed the same
  // event both reach here and exactly one insert survives. The loser re-reads
  // the winner's row and carries on. None of the money safety rests on this
  // table — that is entirely the order claim above; this only stops duplicate
  // work and duplicate rows.
  const findWebhookEvent = async (providerEventId) => {
    const [row] = await documents(WEBHOOK_EVENT_UID).findMany({
      filters: { providerEventId },
      limit: 1,
    });
    return row || null;
  };

  const openWebhookEvent = async (data) => {
    try {
      return await documents(WEBHOOK_EVENT_UID).create({
        data: { ...data, status: 'received', receivedAt: new Date() },
      });
    } catch (error) {
      // Either the entity validator or the unique index refused it, which both
      // mean the same thing: someone else got there first.
      const existing = await findWebhookEvent(data.providerEventId);
      if (existing) return existing;
      throw error;
    }
  };

  const closeWebhookEvent = async (record, status, failureReason = null) => {
    if (!record?.documentId) return;
    await documents(WEBHOOK_EVENT_UID).update({
      documentId: record.documentId,
      data: { status, processedAt: new Date(), failureReason },
    });
  };

  // payment.failed. Monotonic by construction: a paid order returns before any
  // write, and releaseClaim is itself guarded on `processing` + this exact
  // payment id, so a late failure event can never walk an order backwards.
  // The claim is only let go on the SAME positive no-money evidence the
  // callback demands — an unreachable provider keeps it, deliberately.
  const releaseFailedPayment = async ({ order, razorpayOrderId, razorpayPaymentId }) => {
    if (order.paymentStatus === PAYMENT_PAID) {
      strapi.log.warn(
        `[order] failure event ignored for already-paid order ${order.orderNumber}`
      );
      return 'Order is already paid; failure event ignored';
    }

    if (
      order.paymentStatus !== PAYMENT_PROCESSING ||
      order.paymentProviderPaymentId !== razorpayPaymentId
    ) {
      // Nothing of ours is staked on this payment: record it and leave the
      // order exactly as it is. Notably this is also the branch that protects
      // an order claimed by a DIFFERENT payment id.
      await markAttemptFailed(
        razorpayOrderId,
        'Payment failed at the payment provider',
        razorpayPaymentId
      );
      return 'No matching claim to release';
    }

    let payment;
    try {
      payment = await razorpayClient.fetchPayment(razorpayPaymentId);
    } catch (error) {
      strapi.log.error(
        `[order] failure-event fetch failed for ${order.orderNumber}: ${error.code || error.name}`
      );
      // Fail closed: we cannot see whether money moved, so the claim stays.
      return 'Provider unreachable; claim retained for reconciliation';
    }

    await markAttemptFailed(
      razorpayOrderId,
      'Payment failed at the payment provider',
      razorpayPaymentId
    );

    const noMoneyMoved =
      payment.order_id !== razorpayOrderId || NO_MONEY_STATUSES.has(payment.status);
    if (!noMoneyMoved) {
      strapi.log.warn(
        `[order] ${order.orderNumber}: failure event but provider does not confirm the money is clear`
      );
      return 'Provider does not confirm the money is clear; claim retained';
    }

    await releaseClaim(
      numericId(order),
      razorpayPaymentId,
      'Payment failed at the payment provider',
      new Date()
    );
    return 'Claim released; the order can be paid again';
  };

  return {
    async createPayment({ user, body } = {}) {
      const customer = requireUser(user);

      // Shape validation first: nothing reaches the catalogue or the delivery
      // provider until the request itself is well formed.
      const destinationPincode = validatePincode(
        body?.destinationPincode,
        'destinationPincode'
      );
      const selectedShippingOptionId = validateSelectedShippingOptionId(
        body?.selectedShippingOptionId
      );
      const items = validateCartItems(body);
      const shippingAddress = validateShippingAddress(
        body?.shippingAddress,
        destinationPincode
      );

      // Authoritative cart pricing. Throws status 400 for any unavailable
      // product, inactive variant or inconsistent variant pricing.
      const quote = await strapi.service('api::checkout.checkout').quote({ items });

      // Authoritative delivery rates, re-checked right now. The rate the
      // browser saw on the cart page has no standing here.
      let shipping;
      try {
        shipping = await strapi
          .service('api::checkout.shipping')
          .getOptions({ destinationPincode, items });
      } catch (error) {
        if (error.status === 400) throw error;
        strapi.log.error(`[order] delivery rate check failed: ${error.message}`);
        fail(
          503,
          'ShippingProviderError',
          'Delivery availability could not be checked right now'
        );
      }

      if (!shipping.serviceable) {
        fail(
          409,
          'DeliveryUnserviceable',
          'Delivery is currently unavailable to this pincode',
          { code: 'DELIVERY_UNSERVICEABLE' }
        );
      }

      const selectedOption = shipping.options.find(
        (option) => option.id === selectedShippingOptionId
      );
      // No silent substitution: a customer who chose Express is never quietly
      // moved onto Standard, and a vanished option is never replaced.
      if (!selectedOption) {
        fail(
          409,
          'ShippingOptionUnavailable',
          'Delivery rates changed. Please re-check delivery.',
          { code: 'SHIPPING_OPTION_UNAVAILABLE' }
        );
      }

      // Integer paise throughout. No rupees, no /100, no *100, no parseFloat.
      const grandTotalMinor = addMoney(
        quote.subtotalPaise,
        selectedOption.shippingPaise,
        'Payable total'
      );
      if (
        !Number.isSafeInteger(grandTotalMinor) ||
        grandTotalMinor < razorpayClient.MIN_AMOUNT_PAISE
      ) {
        invalidRequest('Order total is below the minimum payable amount');
      }

      // Second resolution pass, only for the snapshot fields the public quote
      // projection does not carry (variant name, weight, HSN) and the variant
      // relation itself.
      const lines = await resolveCartLines(strapi, items);
      const variantsByDocumentId = new Map(
        lines.map(({ item, variant }) => [item.variantDocumentId, variant])
      );

      const orderNumber = generateOrderNumber();

      // (A) One transaction for the internal record. Deliberately closed
      // BEFORE any network call: a DB transaction must never stay open across
      // a request to Razorpay.
      const order = await strapi.db.transaction(async () => {
        const created = await documents(ORDER_UID).create({
          data: {
            orderNumber,
            customer: { id: customer.id },
            customerName: shippingAddress.fullName,
            email: shippingAddress.email,
            phoneNumber: shippingAddress.phone,
            currency: CURRENCY,
            itemsMrpTotalMinor: quote.mrpTotalPaise,
            discountMinor: quote.discountTotalPaise,
            subtotalMinor: quote.subtotalPaise,
            taxableBaseMinor: quote.taxableSubtotalPaise,
            taxMinor: quote.gstTotalPaise,
            shippingFeeMinor: selectedOption.shippingPaise,
            grandTotalMinor,
            paymentStatus: 'pending',
            shipmentStatus: 'pending',
            paymentProvider: 'razorpay',
            shippingSnapshot: shippingAddress,
          },
        });

        for (const quoteItem of quote.items) {
          const variant = variantsByDocumentId.get(quoteItem.variantDocumentId);
          if (!variant) {
            // Cannot happen: both passes validate the same cart lines. Fail
            // loudly rather than writing a half-formed order.
            fail(
              500,
              'OrderItemResolutionError',
              'Order line could not be resolved to a product variant'
            );
          }
          await documents(ORDER_ITEM_UID).create({
            data: {
              order: { documentId: created.documentId },
              ...toOrderItemData(quoteItem, variant),
            },
          });
        }

        return created;
      });

      // (B) Provider call, outside the transaction. A failure here leaves a
      // pending order with no provider id and no charge to the customer.
      let providerOrder;
      try {
        providerOrder = await razorpayClient.createOrder({
          amountPaise: grandTotalMinor,
          receipt: orderNumber,
        });
      } catch (error) {
        strapi.log.error(
          `[order] razorpay order create failed for ${orderNumber}: ${error.code || error.name}`
        );
        await documents(ORDER_UID).update({
          documentId: order.documentId,
          data: { lastPaymentError: 'Payment provider could not create the order' },
        });
        fail(502, 'PaymentProviderError', 'Payment could not be started right now');
      }

      // (B2) The provider echo decides what the customer is actually charged,
      // so a disagreement has to stop the flow here — before the id is stored
      // and before anything reaches the browser.
      const echoMismatch = providerOrderMismatch(
        providerOrder,
        grandTotalMinor,
        orderNumber
      );
      if (echoMismatch) {
        strapi.log.error(
          `[order] razorpay order echo rejected for ${orderNumber}: ${echoMismatch}`
        );
        await documents(ORDER_UID).update({
          documentId: order.documentId,
          data: { lastPaymentError: 'Payment provider returned an inconsistent order' },
        });
        fail(502, 'PaymentProviderError', 'Payment could not be started right now');
      }

      // (C) Both internal post-provider writes in one transaction, so the
      // provider link and its attempt row can never persist apart. The
      // Razorpay call is deliberately already done and outside it.
      const now = new Date();
      try {
        await strapi.db.transaction(async () => {
          await documents(ORDER_UID).update({
            documentId: order.documentId,
            data: {
              paymentProviderOrderId: providerOrder.id,
              paymentAttemptCount: 1,
              lastPaymentAttemptAt: now,
            },
          });

          await documents(PAYMENT_ATTEMPT_UID).create({
            data: {
              order: { documentId: order.documentId },
              attemptReference: providerOrder.id,
              attemptNumber: 1,
              provider: 'razorpay',
              providerOrderId: providerOrder.id,
              amountMinor: grandTotalMinor,
              currency: CURRENCY,
              status: 'initiated',
              initiatedAt: now,
            },
          });
        });
      } catch (error) {
        // Rolled back, so the order keeps no provider id and verification of
        // that provider order would 404 — it fails closed. The Razorpay order
        // is orphaned but unused, and an order alone charges nobody.
        strapi.log.error(
          `[order] provider link failed for ${orderNumber} (${providerOrder.id}): ${error.message}`
        );
        fail(502, 'PaymentProviderError', 'Payment could not be started right now');
      }

      return {
        razorpayOrderId: providerOrder.id,
        amountPaise: grandTotalMinor,
        currency: CURRENCY,
        orderNumber,
      };
    },

    async verifyPayment({ user, body } = {}) {
      const customer = requireUser(user);

      // Only these three fields are read. Any orderData, totalAmount, items or
      // address in the body is ignored entirely.
      const razorpayOrderId = requiredProviderId(
        body?.razorpay_order_id,
        'razorpay_order_id'
      );
      const razorpayPaymentId = requiredProviderId(
        body?.razorpay_payment_id,
        'razorpay_payment_id'
      );
      const signature = requiredProviderId(
        body?.razorpay_signature,
        'razorpay_signature'
      );

      const order = await findOrderByProviderOrderId(razorpayOrderId);
      // A wrong owner is reported exactly like a missing order, so verification
      // cannot be used to probe whether someone else's order exists.
      if (!order || order.customer?.id !== customer.id) {
        fail(404, 'OrderNotFound', 'Order not found');
      }

      // Idempotency, before any mutation. Also covers an order another request
      // is already verifying.
      const settled = settledResponse(order, razorpayPaymentId);
      if (settled) return settled;

      // Signature first, and always before the claim: an unsigned request must
      // not be able to park someone else's order in `processing`.
      if (
        !razorpayClient.verifySignature({
          razorpayOrderId,
          razorpayPaymentId,
          signature,
        })
      ) {
        strapi.log.warn(
          `[order] signature verification failed for order ${order.orderNumber}`
        );
        await markAttemptFailed(razorpayOrderId, 'Signature verification failed');
        await documents(ORDER_UID).update({
          documentId: order.documentId,
          data: { lastPaymentError: 'Signature verification failed' },
        });
        fail(400, 'PaymentVerificationFailed', 'Payment could not be verified');
      }

      return reconcileCapturedPayment({
        order,
        razorpayOrderId,
        razorpayPaymentId,
        source: 'callback',
      });
    },

    // Razorpay -> us, server to server. The BACKUP path: everything it can do,
    // the browser callback already does faster. It exists for the runs where
    // the browser never came back — closed tab, dead network, expired JWT — and
    // it reconciles payment state only.
    //
    // It cannot create a shipment. Nothing below touches shipmentStatus,
    // api::checkout.shipping or the Shiprocket client, so a reconciled order
    // leaves this method with shipmentStatus still `pending`.
    async handleWebhook({ rawBody, signature, eventId } = {}) {
      // (1) SIGNATURE FIRST. Not one field of the payload is looked at, and no
      // row is read or written, until the HMAC over the raw bytes verifies.
      let verified;
      try {
        verified = razorpayClient.verifyWebhookSignature(rawBody, signature);
      } catch (error) {
        // Only ever the missing-secret error. Surfaced as retryable so a
        // misconfigured deployment can be fixed and Razorpay will redeliver.
        strapi.log.error(
          `[order] razorpay webhook not processable: ${error.code || error.name}`
        );
        fail(503, 'PaymentWebhookUnavailable', 'Webhook processing is unavailable');
      }
      if (!verified) {
        // No body, no signature, malformed signature and wrong signature are
        // deliberately one answer: a caller who cannot sign learns nothing.
        strapi.log.warn('[order] razorpay webhook rejected: signature not verified');
        fail(400, 'PaymentWebhookSignatureInvalid', 'Webhook could not be verified');
      }

      // (2) Parse the VERIFIED bytes, not ctx.request.body, so what we act on is
      // provably what was signed.
      let event;
      try {
        event = JSON.parse(rawBody);
      } catch (error) {
        invalidRequest('Webhook body is not valid JSON');
      }

      const eventType = typeof event?.event === 'string' ? event.event : '';
      if (!HANDLED_EVENTS.has(eventType)) {
        // Subscribed to something we do not consume. Acknowledge and store
        // nothing rather than growing the table.
        return { status: 200, outcome: 'unsupported' };
      }

      // (3) Identity ONLY. Nothing monetary is read out of the payload — not
      // amount, not currency, not status. Those come from Razorpay's API in
      // reconcileCapturedPayment, checked against our own stored order.
      const paymentEntity = event?.payload?.payment?.entity;
      const razorpayPaymentId =
        typeof paymentEntity?.id === 'string' && paymentEntity.id.trim()
          ? paymentEntity.id.trim()
          : null;
      const razorpayOrderId =
        (typeof paymentEntity?.order_id === 'string' && paymentEntity.order_id.trim()) ||
        (typeof event?.payload?.order?.entity?.id === 'string' &&
          event.payload.order.entity.id.trim()) ||
        null;

      // Razorpay always sends X-Razorpay-Event-Id. A delivery without one still
      // has to dedup, so key it on the digest of the verified body instead —
      // the digest is stored, the body never is.
      const providerEventId =
        typeof eventId === 'string' && eventId.trim()
          ? eventId.trim()
          : `sha256:${crypto.createHash('sha256').update(rawBody).digest('hex')}`;

      // (4) Replay check. Only terminal outcomes short-circuit: an event left
      // `received` by a crashed worker, or `failed` by a transient error, is
      // reprocessed on Razorpay's next delivery.
      const seen = await findWebhookEvent(providerEventId);
      if (seen && EVENT_TERMINAL.has(seen.status)) {
        return { status: 200, outcome: 'duplicate' };
      }

      const record =
        seen ||
        (await openWebhookEvent({
          providerEventId,
          eventType,
          providerOrderId: razorpayOrderId,
          providerPaymentId: razorpayPaymentId,
        }));

      const settle = async (status, reason) => {
        await closeWebhookEvent(record, status, reason);
        return { status: 200, outcome: status };
      };

      if (!razorpayOrderId || !razorpayPaymentId) {
        return settle('ignored', 'Event carried no usable payment identity');
      }

      const order = await findOrderByProviderOrderId(razorpayOrderId);
      if (!order) {
        // Not ours: another integration, or another environment sharing the
        // Razorpay account. Acknowledge so Razorpay stops retrying.
        return settle('ignored', 'No internal order for this provider order');
      }

      // AUTHORIZED_NOT_CAPTURED. Recorded, never captured from.
      //
      // The claim model would in fact make a webhook capture safe — it is one
      // atomic pending -> processing transition, so two callers cannot both
      // reach capture. What is NOT safe is the money decision: capturing here
      // takes the customer's money on a signal that arrives while they may
      // still be mid-checkout, ahead of the callback that is about to do it
      // properly. Razorpay auto-capture and the callback both produce a
      // captured/order.paid event, and THAT reconciles.
      //
      // Limitation: on a manual-capture account where the browser
      // dies before the callback — no captured event ever fires and the
      // authorization voids at Razorpay (no money is taken, but the sale is
      // lost). Upgrade path if that account setting is ever used: capture here
      // behind a deliberate delay, reusing reconcileCapturedPayment unchanged.
      if (eventType === EVENT_PAYMENT_AUTHORIZED) {
        return settle(
          'ignored',
          'Authorized payments are captured by the callback or a later captured event'
        );
      }

      if (eventType === EVENT_PAYMENT_FAILED) {
        const outcome = await releaseFailedPayment({
          order,
          razorpayOrderId,
          razorpayPaymentId,
        });
        return settle('processed', outcome);
      }

      // payment.captured and order.paid. Razorpay emits both for one capture:
      // whichever lands first reconciles, and the other finds the order already
      // paid with the same payment id and returns the same idempotent success.
      try {
        await reconcileCapturedPayment({
          order,
          razorpayOrderId,
          razorpayPaymentId,
          source: 'webhook',
        });
      } catch (error) {
        if (error.details?.code === 'PAYMENT_ALREADY_RECORDED') {
          // A DIFFERENT payment id owns this order. Nothing was mutated, and
          // redelivery cannot change the answer, so record the conflict and
          // stop Razorpay retrying it forever.
          strapi.log.warn(
            `[order] webhook conflict on ${order.orderNumber}: another payment already owns it`
          );
          return settle('conflict', 'Another payment already owns this order');
        }
        // Everything else — provider unreachable, claim held by a concurrent
        // worker, a check that has not settled at Razorpay yet — is treated as
        // transient. The row stays retryable and Razorpay redelivers.
        strapi.log.warn(
          `[order] webhook reconcile deferred for ${order.orderNumber}: ${error.name}`
        );
        await closeWebhookEvent(record, 'failed', error.name);
        fail(503, 'PaymentWebhookRetry', 'Webhook could not be processed right now');
      }

      return settle('processed', null);
    },
  };
};
