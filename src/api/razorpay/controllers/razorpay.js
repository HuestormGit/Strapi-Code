'use strict';

/**
 * A set of functions called "actions" for `razorpay`
 */
const Razorpay = require("razorpay");
module.exports = {
  async createOrder(ctx) {
    try {
      const { amount, currency } = ctx.request.body;

      const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const options = {
        amount: amount * 100, // amount in paise
        currency: currency || "INR",
        receipt: `receipt_${Date.now()}`,
      };

      const order = await instance.orders.create(options);

      return { success: true, order };
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async verifyPayment(ctx) {
    try {
      const crypto = require("crypto");
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = ctx.request.body;

      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest("hex");

      if (razorpay_signature === expectedSign) {
        return { success: true, message: "Payment verified successfully" };
      } else {
        return { success: false, message: "Invalid signature" };
      }
    } catch (err) {
      ctx.throw(500, err);
    }
  },
};
