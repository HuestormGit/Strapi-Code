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
    {
      method: 'POST',
      path: '/checkout/shipping-options',
      handler: 'checkout.shippingOptions',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
