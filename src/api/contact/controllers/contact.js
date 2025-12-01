'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::contact.contact', ({ strapi }) => ({
  async create(ctx) {
    try {
      const { name, email, phone, action, message } = ctx.request.body;

      const entry = await strapi.db.query('api::contact.contact').create({
        data: { name, email, phone, action, message },
      });

      await strapi.plugins['email'].services.email.send({
        to: "sales@aharasam.com",
        from: process.env.SMTP_FROM,
        subject: "New Enquiry Received",
        text: `
Name: ${name}
Email: ${email}
Phone: ${phone}
Want to: ${action}
Message: ${message}
        `,
      });

      return { success: true, entry };
    } catch (error) {
      console.error("Email Error:", error);
      ctx.response.status = 500;
      return { error: "Failed to save or send email" };
    }
  },
}));
