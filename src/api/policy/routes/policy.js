'use strict';

// Read-only, and the only policy route that exists. Policy Page and Policy
// Settings deliberately ship no core router at all, so there is no
// POST/PUT/DELETE /api/policy-pages for a permission to be granted on by
// mistake — the Admin edits them through the Content Manager, which uses the
// admin API and is unaffected.
//
// Public: policy text is public by nature. Strapi derives
// `api::policy.policy.findOne` for this route and answers 403 until the public
// role holds it, which src/index.js grants (and grants nothing else).
module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/policies/:slug',
      handler: 'policy.findOne',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
