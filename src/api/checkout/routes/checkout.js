'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/checkout/quote',
      handler: 'checkout.quote',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
