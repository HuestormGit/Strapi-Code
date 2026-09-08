module.exports = {
  routes: [
    {
      method: "POST",
      path: "/orders/razorpay/create",
      handler: "order.createRazorpayOrder",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/orders/razorpay/verify",
      handler: "order.verifyPayment", // 👈 This must match your controller method name
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      // Server-to-server payment recovery. Razorpay's servers hold no customer
      // JWT, so `auth: false` is the only way this route can be reached at all —
      // and it is scoped to THIS route: create and verify above stay
      // authenticated and still require their users-permissions grant.
      //
      // Authentication here is the HMAC over the raw request body, checked in
      // the service before a single field of the payload is looked at. An
      // unsigned request therefore reaches no business logic, no database write
      // and no Razorpay call.
      method: "POST",
      path: "/orders/razorpay/webhook",
      handler: "order.razorpayWebhook",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
