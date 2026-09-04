'use strict';

// Thin HTTP adapters. No pricing, no shipping, no crypto, no provider calls and
// no entity orchestration live here — all of that is in services/order.js.
//
// Plain factory rather than createCoreController: routes/order.js defines only
// the two custom payment routes, so no core CRUD handler is needed.

// koa-body stashes the EXACT bytes it parsed under this global symbol whenever
// strapi::body runs with { includeUnparsed: true } — see config/middlewares.js.
// Razorpay signs those bytes, so this is the only body the webhook may verify:
// JSON.stringify(ctx.request.body) is a different byte string (key order,
// whitespace, number formatting) and would never match.
const UNPARSED_BODY = Symbol.for('unparsedBody');

// Every controlled failure the payment service can raise. Anything else is a
// bug and becomes a 500 with no detail on the wire.
const CONTROLLED_STATUSES = new Set([400, 401, 404, 409, 502, 503]);

const DEFAULT_ERROR_NAME = {
  400: 'ValidationError',
  401: 'UnauthorizedError',
  404: 'NotFoundError',
  409: 'ConflictError',
  502: 'PaymentProviderError',
  503: 'ShippingProviderError',
};

// cart-lines.js and the checkout services raise plain Errors carrying only a
// status, so fall back to the status's contract name rather than leaking "Error".
const errorName = (error, status) =>
  error.name && error.name !== 'Error' ? error.name : DEFAULT_ERROR_NAME[status];

const respond = (ctx, strapi, error) => {
  const status = CONTROLLED_STATUSES.has(error.status) ? error.status : 500;

  if (status === 500) {
    // Stack and message stay in the server log; the client gets Strapi's
    // generic 500 from the error middleware.
    strapi.log.error(`[order] unhandled payment error: ${error.stack || error.message}`);
    throw error;
  }

  ctx.status = status;
  return {
    error: {
      status,
      name: errorName(error, status),
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
};

module.exports = ({ strapi }) => ({
  async createRazorpayOrder(ctx) {
    try {
      return {
        data: await strapi.service('api::order.order').createPayment({
          user: ctx.state.user,
          body: ctx.request.body,
        }),
      };
    } catch (error) {
      return respond(ctx, strapi, error);
    }
  },

  async verifyPayment(ctx) {
    try {
      return {
        data: await strapi.service('api::order.order').verifyPayment({
          user: ctx.state.user,
          body: ctx.request.body,
        }),
      };
    } catch (error) {
      return respond(ctx, strapi, error);
    }
  },

  // Razorpay -> us. Nothing from ctx.state.user is read: this route is
  // unauthenticated by design and the HMAC is its credential.
  //
  // The response body is deliberately a bare acknowledgement. Razorpay only
  // reads the status code, and anything richer would be a channel for leaking
  // order state to whoever can reach the URL.
  async razorpayWebhook(ctx) {
    try {
      const { status } = await strapi.service('api::order.order').handleWebhook({
        rawBody: ctx.request.body?.[UNPARSED_BODY],
        signature: ctx.request.headers['x-razorpay-signature'],
        eventId: ctx.request.headers['x-razorpay-event-id'],
      });
      ctx.status = status;
      return { received: true };
    } catch (error) {
      return respond(ctx, strapi, error);
    }
  },
});
