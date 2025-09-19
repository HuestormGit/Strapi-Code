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
  ],
};
