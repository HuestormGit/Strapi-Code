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

      // NOTE: this endpoint predates the checkout-quote flow. It does not compute
      // line items, GST or shipping — those are owned by the upcoming quote step,
      // which will populate itemsMrpTotalMinor / taxableBaseMinor / taxMinor /
      // taxType / shippingFeeMinor and create the orderItems rows. Until then this
      // path records only what it actually knows, rather than inventing a breakup.
      //
      // The amount is still taken from the client and is NOT yet verified against
      // catalogue pricing — see the server-side price recomputation task.
      const grandTotalMinor = Math.round(Number(orderData.totalAmount) * 100);

      const createdOrder = await strapi.entityService.create("api::order.order", {
        data: {
          customerName: orderData.customerName,
          email: orderData.email,
          phoneNumber: orderData.phoneNumber,
          currency: "INR",
          subtotalMinor: grandTotalMinor,
          shippingFeeMinor: 0,
          grandTotalMinor,
          paymentStatus: "paid",
          shipmentStatus: "pending",
          paymentProvider: "razorpay",
          paymentProviderOrderId: razorpay_order_id,
          paymentProviderPaymentId: razorpay_payment_id,
          paidAt: new Date(),
          paymentAttemptCount: 1,
          lastPaymentAttemptAt: new Date(),
          // Shipping address is snapshotted onto the order so later edits to a
          // saved address can never rewrite this order's delivery details.
          shippingSnapshot: {
            fullName: orderData.customerName,
            phone: orderData.phoneNumber,
            email: orderData.email,
            addressLine1: orderData.address,
            city: orderData.city,
            state: orderData.state,
            postalCode: orderData.pincode,
            country: "India",
            capturedAt: new Date(),
          },
        },
      });

      await strapi.entityService.create("api::payment-attempt.payment-attempt", {
        data: {
          order: createdOrder.id,
          attemptReference: `${razorpay_order_id}:${razorpay_payment_id}`,
          attemptNumber: 1,
          provider: "razorpay",
          providerOrderId: razorpay_order_id,
          providerPaymentId: razorpay_payment_id,
          amountMinor: grandTotalMinor,
          currency: "INR",
          status: "succeeded",
          initiatedAt: new Date(),
          completedAt: new Date(),
        },
      });

      return { success: true, data: createdOrder };
    } catch (err) {
      console.error("❌ Verification Error:", err);
      return ctx.badRequest("Payment verification failed", { error: err.message });
    }
  },
}));
