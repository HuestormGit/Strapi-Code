'use strict';

// Thin HTTP adapters, the same shape as controllers/order.js. No validation, no
// ownership logic and no database access live here — all of that is in
// services/address.js, so there is exactly one place where a saved address can
// be reached and exactly one guard to audit.
//
// Plain factory rather than createCoreController: routes/address.js defines only
// the four custom routes, so no core CRUD handler is needed.

// Every controlled failure the address service can raise. Anything else is a
// bug and becomes a 500 with no detail on the wire.
const CONTROLLED_STATUSES = new Set([400, 401, 404, 409]);

const DEFAULT_ERROR_NAME = {
  400: 'ValidationError',
  401: 'UnauthorizedError',
  404: 'NotFoundError',
  409: 'ConflictError',
};

const errorName = (error, status) =>
  error.name && error.name !== 'Error' ? error.name : DEFAULT_ERROR_NAME[status];

const respond = (ctx, strapi, error) => {
  const status = CONTROLLED_STATUSES.has(error.status) ? error.status : 500;

  if (status === 500) {
    // Stack and message stay in the server log; the client gets Strapi's
    // generic 500 from the error middleware.
    strapi.log.error(`[address] unhandled error: ${error.stack || error.message}`);
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
  // ctx.query is deliberately not forwarded, exactly as in order.find: the
  // service scopes the read to ctx.state.user and chooses its own filters,
  // fields and sort, so there is no client-supplied filter or populate to
  // sanitise — and no way to widen the query into somebody else's rows.
  async find(ctx) {
    try {
      return {
        data: await strapi.service('api::address.address').listForCustomer({
          user: ctx.state.user,
        }),
      };
    } catch (error) {
      return respond(ctx, strapi, error);
    }
  },

  async create(ctx) {
    try {
      return {
        data: await strapi.service('api::address.address').createForCustomer({
          user: ctx.state.user,
          body: ctx.request.body,
        }),
      };
    } catch (error) {
      return respond(ctx, strapi, error);
    }
  },

  // The target comes from the path, but the path alone never decides anything:
  // the service resolves it against the caller's own rows and answers 404 when
  // it does not belong to them.
  async update(ctx) {
    try {
      return {
        data: await strapi.service('api::address.address').updateForCustomer({
          user: ctx.state.user,
          documentId: ctx.params.documentId,
          body: ctx.request.body,
        }),
      };
    } catch (error) {
      return respond(ctx, strapi, error);
    }
  },

  async delete(ctx) {
    try {
      return {
        data: await strapi.service('api::address.address').deleteForCustomer({
          user: ctx.state.user,
          documentId: ctx.params.documentId,
        }),
      };
    } catch (error) {
      return respond(ctx, strapi, error);
    }
  },
});
