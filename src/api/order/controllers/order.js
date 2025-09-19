const { factories } = require("@strapi/strapi");
const axios = require("axios");
const crypto = require("crypto");

module.exports = factories.createCoreController("api::order.order", ({ strapi }) => ({
  async createRazorpayOrder(ctx) {
    try {
      const { amount } = ctx.request.body;

      const orderPayload = {
        amount: amount * 100,
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        payment_capture: 1,
      };

      const auth = {
        username: process.env.RAZORPAY_KEY_ID,
        password: process.env.RAZORPAY_KEY_SECRET,
      };

      const response = await axios.post(
        "https://api.razorpay.com/v1/orders",
        orderPayload,
        { auth }
      );

      return { success: true, data: response.data };
    } catch (err) {
      console.error("❌ Razorpay Order Error:", err.response?.data || err.message);
      return ctx.badRequest("Failed to create Razorpay order", { error: err.message });
    }
  },

  async verifyPayment(ctx) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderData } = ctx.request.body;

      const generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (generatedSignature !== razorpay_signature) {
        return ctx.badRequest("Payment verification failed");
      }

      const createdOrder = await strapi.entityService.create("api::order.order", {
        data: {
          customerName: orderData.customerName,
          email: orderData.email,
          phoneNumber: orderData.phoneNumber,
          totalAmount: orderData.totalAmount,
          items: orderData.items,
          orderstatus: "Paid",
          paymentDetails: {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
          },
        },
      });

      return { success: true, data: createdOrder };
    } catch (err) {
      console.error("❌ Verification Error:", err);
      return ctx.badRequest("Payment verification failed", { error: err.message });
    }
  },
}));
