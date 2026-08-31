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
  bootstrap(/*{ strapi }*/) {},
};
