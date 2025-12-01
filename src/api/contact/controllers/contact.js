'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::contact.contact', ({ strapi }) => ({
  async create(ctx) {
    try {
      const { name, email, phone, action, message } = ctx.request.body;

      // Save data into Strapi DB
      const entry = await strapi.db.query('api::contact.contact').create({
        data: { name, email, phone, action, message },
      });

      // ******** SEND EMAIL HERE ********
      await strapi.plugins['email'].services.email.send({
        to: "sales@aharasam.com",   // admin email (change if needed)
        from: "no-reply@strapi.io", // Strapi Cloud default sender
        subject: `New Enquiry Received`,
        text: `
New Contact Enquiry:
----------------------
Name: ${name}
Email: ${email}
Phone: ${phone}
Want to: ${action}
Message: ${message}
        `,
      });

      return { success: true, entry };
    } catch (error) {
      console.log("Email Send Error:", error);
      ctx.response.status = 500;
      return { error: 'Failed to save contact form or send email' };
    }
  },
}));
