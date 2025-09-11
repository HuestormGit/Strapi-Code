module.exports = {
  routes: [
    {
      method: "POST",
      path: "/razorpay/order",
      handler: "razorpay.createOrder",
      config: {
        auth: false, // make true if you want only logged in users
      },
    },
    {
      method: "POST",
      path: "/razorpay/verify",
      handler: "razorpay.verifyPayment",
      config: {
        auth: false,
      },
    },
    { method: "POST", path: "/razorpay/order", handler: "razorpay.order" },
    { method: "POST", path: "/razorpay/verify", handler: "razorpay.verify" },
  ],
};
