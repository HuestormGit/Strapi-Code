"use strict";
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = {
  // 1️⃣ Create Razorpay Order
  async order(ctx) {
    try {
      const { amount, currency = "INR" } = ctx.request.body;
      const options = {
        amount: amount * 100, // in paise
        currency,
        payment_capture: 1,
      };

      const order = await razorpay.orders.create(options);
      return { order };
    } catch (err) {
      ctx.throw(500, err.message);
    }
  },

  // 2️⃣ Verify Payment + Update Order status in Strapi
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

      if (generatedSignature === razorpay_signature) {
        // ✅ Verified → Save as paid
        const order = await strapi.db.query("api::order.order").create({
          data: {
            customerName,
            email,
            phoneNumber,
            items,
            total,
            status: "paid",
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
          },
        });
        return { success: true, order };
      } else {
        // ❌ Signature mismatch → Save as failed
        const order = await strapi.db.query("api::order.order").create({
          data: {
            customerName,
            email,
            phoneNumber,
            items,
            total,
            status: "failed",
            razorpayOrderId: razorpay_order_id,
          },
        });
        return { success: false, order };
      }
    } catch (err) {
      ctx.throw(500, err.message);
    }
  },
};
