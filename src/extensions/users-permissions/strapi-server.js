'use strict';

/**
 * @typedef {object} UsersPermissionsPlugin
 * @property {{
 *   auth: (options: { strapi: import('@strapi/strapi').Core.Strapi }) => {
 *     register: (ctx: import('koa').Context) => unknown
 *   }
 * }} controllers
 */

/**
 * @param {UsersPermissionsPlugin} plugin
 */
module.exports = (plugin) => {
  const createAuthController = plugin.controllers.auth;

  plugin.controllers.auth = ({ strapi }) => {
    const auth = createAuthController({ strapi });
    const register = auth.register;

    auth.register = async (ctx) => {
      if (typeof ctx.request.body?.email === 'string') {
        const email = ctx.request.body.email.trim().toLowerCase();
        ctx.request.body.email = email;
        ctx.request.body.username = email;
      }

      return register(ctx);
    };

    return auth;
  };

  return plugin;
};
