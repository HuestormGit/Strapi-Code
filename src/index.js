'use strict';

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
