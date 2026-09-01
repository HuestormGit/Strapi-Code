'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const app = require('../src');
const extendUsersPermissions = require('../src/extensions/users-permissions/strapi-server');

test('registration uses normalized email as Strapi username', async () => {
  /** @type {Parameters<typeof extendUsersPermissions>[0]} */
  const plugin = {
    controllers: {
      auth: () => ({
        register: async (ctx) => ctx.request.body,
      }),
    },
  };
  const ctx = /** @type {import('koa').Context} */ ({
    request: { body: { email: ' Customer@Example.COM ', password: 'secret' } },
  });

  extendUsersPermissions(plugin);
  const auth = plugin.controllers.auth({
    strapi: /** @type {import('@strapi/strapi').Core.Strapi} */ ({}),
  });

  assert.deepEqual(await auth.register(ctx), {
    email: 'customer@example.com',
    username: 'customer@example.com',
    password: 'secret',
  });
});

test('bootstrap configures Strapi reset email URL and SMTP sender', async () => {
  const previousEnv = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_REPLY_TO: process.env.SMTP_REPLY_TO,
  };
  const advanced = { allow_register: true, email_reset_password: null };
  const email = {
    reset_password: {
      options: {
        from: { name: 'Administration Panel', email: 'no-reply@strapi.io' },
        response_email: '',
      },
    },
  };
  const saved = {};
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.SMTP_FROM = 'no-reply@example.com';
  process.env.SMTP_REPLY_TO = 'support@example.com';

  try {
    await app.bootstrap({
      strapi: {
        store: () => ({
          get: async ({ key }) => ({ advanced, email })[key],
          set: async ({ key, value }) => {
            saved[key] = value;
          },
        }),
      },
    });
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.deepEqual(saved.advanced, {
    allow_register: true,
    email_reset_password: 'http://localhost:3000/reset-password',
  });
  assert.deepEqual(saved.email, {
    reset_password: {
      options: {
        from: { name: 'Administration Panel', email: 'no-reply@example.com' },
        response_email: 'support@example.com',
      },
    },
  });
});
