module.exports = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  // includeUnparsed keeps the EXACT bytes koa-body parsed available on
  // ctx.request.body[Symbol.for('unparsedBody')]. Razorpay signs the raw
  // webhook body, so POST /api/orders/razorpay/webhook can only verify against
  // those bytes — a re-serialised ctx.request.body is a different byte string.
  //
  // Nothing else changes: koa-body ignores the flag on the multipart branch, so
  // file uploads are untouched, and the symbol key is invisible to
  // JSON.stringify, Object.keys and every existing handler.
  { name: 'strapi::body', config: { includeUnparsed: true } },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
