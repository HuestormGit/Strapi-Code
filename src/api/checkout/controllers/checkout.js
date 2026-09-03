'use strict';

module.exports = ({ strapi }) => ({
  async quote(ctx) {
    try {
      return {
        data: await strapi.service('api::checkout.checkout').quote(ctx.request.body),
      };
    } catch (error) {
      if (error.status === 400) return ctx.badRequest(error.message);
      throw error;
    }
  },

  async shippingOptions(ctx) {
    try {
      return {
        data: await strapi
          .service('api::checkout.shipping')
          .getOptions(ctx.request.body),
      };
    } catch (error) {
      if (error.status === 400) return ctx.badRequest(error.message);
      // A provider outage must stay distinguishable from "we do not deliver
      // there", so it is a 503 rather than a serviceable: false payload.
      if (error.status === 503) {
        ctx.status = 503;
        return {
          error: {
            status: 503,
            name: 'ShippingProviderError',
            message: error.message,
          },
        };
      }
      throw error;
    }
  },
});
