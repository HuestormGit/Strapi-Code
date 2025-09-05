// 'use strict';

// /**
//  * contact controller
//  */

// const { createCoreController } = require('@strapi/strapi').factories;

// module.exports = createCoreController('api::contact.contact');
// 'use strict';

// const { createCoreController } = require('@strapi/strapi').factories;

// module.exports = createCoreController('api::contact.contact', ({ strapi }) => ({
//   async create(ctx) {
//     try {
//       const { name, email, phone, action, message } = ctx.request.body;

//       // ✅ Save data into Strapi DB
//       const entry = await strapi.db.query('api::contact.contact').create({
//         data: { name, email, phone, action, message },
//       });

//       // ✅ Send email to admin
//       await strapi.plugins['email'].services.email.send({
//         to: 'admin@example.com',   // change this to your admin email
//         from: email,               // sender (user’s email)
//         subject: `New Enquiry: ${action}`,
//         text: `
//           Name: ${name}
//           Email: ${email}
//           Phone: ${phone}
//           Action: ${action}
//           Message: ${message}
//         `,
//       });

//       // ✅ Respond to frontend
//       return { success: true, entry };
//     } catch (error) {
//       strapi.log.error('Contact form error:', error);
//       ctx.response.status = 500;
//       return { error: 'Something went wrong. Please try again later.' };
//     }
//   },
// }));
'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::contact.contact', ({ strapi }) => ({
  async create(ctx) {
    try {
      const { name, email, phone, action, message } = ctx.request.body;

      // Save data into Contact collection
      const entry = await strapi.db.query('api::contact.contact').create({
        data: { name, email, phone, action, message },
      });

      return { success: true, entry };
    } catch (error) {
      ctx.response.status = 500;
      return { error: 'Failed to save contact form' };
    }
  },
}));
