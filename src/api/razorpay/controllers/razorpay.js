"use strict";
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = {
  // 1️⃣ Create Razorpay order
  async order(ctx) {
    try {
      const { amount, currency = "INR" } = ctx.request.body;

      console.log("Creating Razorpay order with:", amount, currency);

      const options = {
        amount: amount * 100, // convert to paise
        currency,
        payment_capture: 1,
      };

      const order = await razorpay.orders.create(options);
      return { order };
    } catch (err) {
      console.error("🔥 Razorpay order error:", err);
      ctx.throw(500, err.message);
    }
  },

  // 2️⃣ Verify payment & save order
  async verify(ctx) {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        customerName,
        email,
        phoneNumber,
        items,
        total,
      } = ctx.request.body;

      const generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest("hex");

      let status = "failed";
      if (generatedSignature === razorpay_signature) {
        status = "paid";
      }

      const order = await strapi.entityService.create("api::order.order", {
        data: {
          customerName,
          email,
          phoneNumber,
          items,
          total,
          status,
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
        },
      });

      return { success: status === "paid", order };
    } catch (err) {
      console.error("🔥 Razorpay verify error:", err);
      ctx.throw(500, err.message);
    }
  },
};
