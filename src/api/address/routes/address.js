'use strict';

// A plain routes object rather than createCoreRouter, matching api::order: it
// declares exactly the four routes the Account page needs and nothing else, so
// Strapi's generic CRUD (findOne, count, bulk actions) is never registered and
// therefore can never be granted to a role by mistake.
//
// Every route is authenticated. Each one needs its users-permissions grant on
// the Authenticated role — handled in src/index.js, not the Admin UI — and must
// stay off Public: the service scopes every read and write to ctx.state.user,
// and an anonymous caller has none.
//
// :documentId is Strapi 5's stable document identifier. It is never trusted on
// its own: the service resolves it together with the caller's customer id, so a
// documentId belonging to somebody else simply does not resolve.
module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/addresses',
      handler: 'address.find',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/addresses',
      handler: 'address.create',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/addresses/:documentId',
      handler: 'address.update',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/addresses/:documentId',
      handler: 'address.delete',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
