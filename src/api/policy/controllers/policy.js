'use strict';

module.exports = ({ strapi }) => ({
  async findOne(ctx) {
    const policy = await strapi.service('api::policy.policy').findBySlug(ctx.params.slug);

    // One answer for "no such policy" and "that policy is unpublished": both are
    // "there is nothing at this address right now", and the difference is not
    // the public's business.
    if (!policy) return ctx.notFound('Policy not found');

    return { data: policy };
  },
});
