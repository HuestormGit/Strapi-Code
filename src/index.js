'use strict';

// The two Razorpay routes are custom content-API routes, so Strapi derives a
// permission scope of `api::order.order.<handler>` for each and refuses any
// request whose role lacks that grant — a 403 raised before the controller ever
// runs. Granting it by hand in the Admin UI would live only in one
// environment's database, so it is done here instead: additively, idempotently,
// and touching nothing else.
//
// These action ids are the ones Strapi itself composes onto the routes (read
// off the booted route metadata, not guessed), and they are exactly what
// users-permissions' own syncPermissions keeps, so the rows survive later boots.
const PAYMENT_ACTIONS = [
  'api::order.order.createRazorpayOrder',
  'api::order.order.verifyPayment',
];

const grantPaymentPermissions = async (strapi) => {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'authenticated' },
    select: ['id'],
  });

  if (!role) {
    strapi.log.warn(
      '[bootstrap] no authenticated role found; Razorpay payment permissions were not granted'
    );
    return;
  }

  for (const action of PAYMENT_ACTIONS) {
    // Scoped to this role on purpose: the same action granted to some other
    // role is a different row and must not suppress this one.
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: { action, role: { id: role.id } },
      select: ['id'],
    });

    if (existing) continue;

    await strapi.db.query('plugin::users-permissions.permission').create({
      data: { action, role: role.id },
    });
    strapi.log.info(`[bootstrap] granted ${action} to the authenticated role`);
  }
};

// NOTE: the example/demo seeder in ./bootstrap.js is deliberately NOT wired up
// here. It used to run on every boot and would import Strapi's demo content and
// widen public permissions the first time it met an empty database — including a
// fresh Strapi Cloud production database. Seed explicitly instead:
//
//   npm run seed:example
//
module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    await grantPaymentPermissions(strapi);

    const store = strapi.store({ type: 'plugin', name: 'users-permissions' });

    if (process.env.FRONTEND_URL) {
      const advanced = await store.get({ key: 'advanced' });
      const emailResetPassword = new URL('/reset-password', process.env.FRONTEND_URL).toString();

      if (advanced.email_reset_password !== emailResetPassword) {
        await store.set({
          key: 'advanced',
          value: { ...advanced, email_reset_password: emailResetPassword },
        });
      }
    }

    if (process.env.SMTP_FROM || process.env.SMTP_REPLY_TO) {
      const email = await store.get({ key: 'email' });
      const options = email.reset_password.options;
      const from = process.env.SMTP_FROM || options.from.email;
      const responseEmail = process.env.SMTP_REPLY_TO || options.response_email;

      if (options.from.email !== from || options.response_email !== responseEmail) {
        await store.set({
          key: 'email',
          value: {
            ...email,
            reset_password: {
              ...email.reset_password,
              options: {
                ...options,
                from: { ...options.from, email: from },
                response_email: responseEmail,
              },
            },
          },
        });
      }
    }
  },
};
