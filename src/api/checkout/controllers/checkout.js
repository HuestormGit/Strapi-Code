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
});
