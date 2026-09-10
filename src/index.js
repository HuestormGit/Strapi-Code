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

// GET /api/orders — the Account page's order history, added alongside the
// Razorpay routes. It is the same kind of custom content-API route, so Strapi
// derives `api::order.order.find` for it and answers 403 until that grant
// exists. Granting it in the Admin UI would live only in the database of
// whichever machine it was clicked on, which is exactly how this route came to
// work on one setup and 403 on another; it belongs here with the rest.
//
// Authenticated only, never public: order.services listForCustomer scopes the
// read to ctx.state.user, and an anonymous caller has none.
const ACCOUNT_ACTIONS = ['api::order.order.find'];

// The Account page's saved delivery addresses. src/api/address defines these
// four as custom content-API routes — deliberately not createCoreRouter, so
// Strapi's generic CRUD (findOne, count, bulk actions) never exists to be
// granted by mistake — and derives `api::address.address.<handler>` for each.
//
// Authenticated only, and it must stay that way: every handler resolves the
// owner from ctx.state.user, so a public grant would expose a route whose whole
// authorisation model is the signed-in customer. Nothing here is readable
// anonymously, and no handler accepts a customer id from the request.
const ADDRESS_ACTIONS = [
  'api::address.address.find',
  'api::address.address.create',
  'api::address.address.update',
  'api::address.address.delete',
];

// The storefront is anonymous until checkout: the homepage lists the catalogue
// and /cart prices the basket and checks delivery, all before there is a
// customer to authenticate. Those four reads used to travel on a CMS API token
// shipped inside the React bundle, which is public by definition and carried
// far more authority than a storefront needs. They are ordinary public
// storefront operations, so they are granted to the public role instead.
//
// Read-only on purpose. No create/update/delete, and nothing that is not on a
// live call path in the React app:
//   product.find              -> homepage catalogue list
//   product-variant.find      -> the `variants` relation populated on that list.
//                                Strapi strips any relation whose target the
//                                caller cannot `find` (sanitize/visitors/
//                                remove-restricted-relations.js), so without
//                                this grant every product comes back with no
//                                variants and nothing is purchasable. The same
//                                rule is what keeps the variant's `orderItems`
//                                relation — and the orders behind it — out of
//                                the response: the public role has no
//                                order-item.find, so that key is removed.
//   checkout.quote            -> /cart price breakdown
//   checkout.shippingOptions  -> /cart delivery check
//
// Both totals stay server-authoritative; nothing here lets a browser name a
// price. Money still requires the customer JWT via PAYMENT_ACTIONS below.
const STOREFRONT_PUBLIC_ACTIONS = [
  'api::product.product.find',
  'api::product-variant.product-variant.find',
  'api::checkout.checkout.quote',
  'api::checkout.checkout.shippingOptions',
];

// The Account page's editable profile. `me` reads it, `updateMe` writes the
// three customer-owned fields (fullName, phone, email) handled in
// src/extensions/users-permissions/ — which also derives username from the
// normalised email rather than accepting one. Both actions are self-scoped by
// ctx.state.user, so neither can reach another customer's row.
//
// `update` is deliberately absent and must stay that way: the built-in
// user.update takes its target id from ctx.params and spreads the whole request
// body, so granting it here would hand every customer account takeover and role
// escalation. updateMe exists precisely so that grant is never needed.
const PROFILE_ACTIONS = [
  'plugin::users-permissions.user.me',
  'plugin::users-permissions.user.updateMe',
];

const grantPermissions = async (strapi, roleType, actions) => {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: roleType },
    select: ['id'],
  });

  if (!role) {
    strapi.log.warn(
      `[bootstrap] no ${roleType} role found; ${actions.length} permission(s) were not granted`
    );
    return;
  }

  for (const action of actions) {
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
    strapi.log.info(`[bootstrap] granted ${action} to the ${roleType} role`);
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
    await grantPermissions(strapi, 'authenticated', [
      ...PAYMENT_ACTIONS,
      ...ACCOUNT_ACTIONS,
      ...ADDRESS_ACTIONS,
      ...PROFILE_ACTIONS,
    ]);

    await grantPermissions(strapi, 'public', STOREFRONT_PUBLIC_ACTIONS);

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
