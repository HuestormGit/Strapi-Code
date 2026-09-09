'use strict';

const { errors } = require('@strapi/utils');

const { ValidationError } = errors;

const MAX_FULL_NAME_LENGTH = 200;
const MAX_PHONE_LENGTH = 20;
// RFC 5321's limit, and comfortably inside the column's varchar(255).
const MAX_EMAIL_LENGTH = 254;
// The pattern already used by api/order/services/order.js and the auth forms.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_UID = 'plugin::users-permissions.user';

// The whitelist for PUT /users/me, and the only reason that route is safe.
// Everything else on the user model is either an authorisation field (role,
// blocked), a credential (password), verification state (confirmed,
// confirmationToken), or a value this endpoint derives for itself (username —
// see updateMe). The request body is never spread: the update payload is
// rebuilt from these three keys alone, so anything else a client sends is
// dropped rather than written.
const EDITABLE_PROFILE_FIELDS = ['fullName', 'phone', 'email'];

const validateFullName = (value) => {
  if (typeof value !== 'string') {
    throw new ValidationError('fullName must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_FULL_NAME_LENGTH) {
    throw new ValidationError('fullName is too long');
  }
  return trimmed;
};

// Same rule the checkout already applies to shippingAddress.phone: 10 digits,
// tolerating the +91 / 91 / 0 prefixes people type, stored normalised.
const validatePhone = (value) => {
  if (typeof value !== 'string') {
    throw new ValidationError('phone must be a string');
  }
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > MAX_PHONE_LENGTH) {
    throw new ValidationError('phone is too long');
  }
  const digits = trimmed.replace(/[\s()-]/g, '').replace(/^(?:\+?91|0)/, '');
  if (!/^[0-9]{10}$/.test(digits)) {
    throw new ValidationError('phone must be a 10-digit Indian mobile number');
  }
  return digits;
};

// Normalises before validating, and returns the normalised value, because the
// normalised form is what gets stored *and* what the uniqueness check compares.
// Lowercasing is not cosmetic: auth.callback looks users up with
// `email: identifier.toLowerCase()`, so an address stored with any uppercase
// character could never be logged in with.
const validateEmail = (value) => {
  if (typeof value !== 'string') {
    throw new ValidationError('email must be a string');
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new ValidationError('email is required');
  }
  if (normalized.length > MAX_EMAIL_LENGTH) {
    throw new ValidationError('email is too long');
  }
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new ValidationError('email must be a valid email address');
  }
  return normalized;
};

const PROFILE_VALIDATORS = {
  fullName: validateFullName,
  phone: validatePhone,
  email: validateEmail,
};

// Finds the account already using an address, for the uniqueness check.
//
// findMany + a JS re-check rather than findOne, on purpose: $eqi compiles to
// `LOWER(col) LIKE LOWER(?)`, so `_` and `%` inside an address would behave as
// wildcards and could collide two different people's emails. The SQL is only an
// index-friendly prefilter; the exact comparison below is what decides.
//
// username is checked as well as email because updateMe writes both, and
// neither column carries a unique constraint in the database.
const findAccountUsing = async (normalizedEmail) => {
  const rows = await strapi.db.query(USER_UID).findMany({
    where: {
      $or: [
        { email: { $eqi: normalizedEmail } },
        { username: { $eqi: normalizedEmail } },
      ],
    },
    select: ['id', 'email', 'username'],
  });

  return rows.find(
    (row) =>
      row.email?.toLowerCase() === normalizedEmail ||
      row.username?.toLowerCase() === normalizedEmail
  );
};

// Builds the update payload from scratch. A field absent from the body is left
// untouched; a field present is validated. fullName and phone may be set to ''
// to clear them; email may not, since it is the login identifier and its
// validator rejects an empty value.
const buildProfileUpdate = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const data = {};
  for (const field of EDITABLE_PROFILE_FIELDS) {
    if (body[field] === undefined) continue;
    data[field] = PROFILE_VALIDATORS[field](body[field]);
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError(`Provide at least one of: ${EDITABLE_PROFILE_FIELDS.join(', ')}`);
  }

  return data;
};

/**
 * @typedef {object} UsersPermissionsPlugin
 * @property {{
 *   auth: (options: { strapi: import('@strapi/strapi').Core.Strapi }) => {
 *     register: (ctx: import('koa').Context) => unknown
 *   },
 *   user: Record<string, (ctx: import('koa').Context) => unknown>
 * }} controllers
 * @property {{ 'content-api': { routes: object[] } }} routes
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

  // The Account page's editable profile. Deliberately NOT the built-in
  // user.update: that handler reads the target id from ctx.params, spreads the
  // whole request body into the update, and its validator explicitly permits
  // role, email and password — so granting it to the authenticated role would
  // let any customer take over another account or escalate their own role.
  //
  // Here the id is never taken from the request at all: the row updated is
  // ctx.state.user.id, so there is nothing for a caller to tamper with.
  //
  // plugin.controllers.user is a plain object (unlike auth, which is a
  // factory), so the action is added by assignment.
  plugin.controllers.user.updateMe = async (ctx) => {
    const authUser = ctx.state.user;

    // Fails closed, matching the payment services: a CMS API token satisfies
    // the route's auth but leaves ctx.state.user undefined, and that must not
    // be enough to write to somebody's profile.
    if (!authUser || !Number.isInteger(authUser.id)) {
      return ctx.unauthorized();
    }

    const data = buildProfileUpdate(ctx.request.body);

    if (data.email !== undefined) {
      // Excluding the caller's own row is what makes re-saving an unchanged
      // address (or the same address in different case) succeed instead of
      // reporting the user as a duplicate of themselves.
      const owner = await findAccountUsing(data.email);
      if (owner && owner.id !== authUser.id) {
        throw new ValidationError('This email address is already in use');
      }

      // username is derived here, never taken from the request: it is absent
      // from EDITABLE_PROFILE_FIELDS, so buildProfileUpdate cannot have copied
      // a client-supplied value into `data`. Assigning it alongside email means
      // both columns move in the single UPDATE that user.edit() issues, so the
      // two can never be left disagreeing.
      data.username = data.email;
    }

    // `confirmed` is deliberately absent from `data` and therefore preserved.
    // No confirmation email, token or pending-email state is involved: this
    // endpoint changes the address and nothing else.
    const updated = await strapi
      .plugin('users-permissions')
      .service('user')
      .edit(authUser.id, data);

    // The same sanitiser the built-in `me` uses, so private fields (password
    // and the reset/confirmation tokens) are stripped from the response and
    // field-level permissions still apply.
    const schema = strapi.getModel('plugin::users-permissions.user');
    ctx.body = await strapi.contentAPI.sanitize.output(updated, schema, {
      auth: ctx.state.auth,
    });
  };

  // unshift, not push: the plugin already registers PUT /users/:id and Koa
  // matches in registration order, so appending would let that route swallow
  // this one as id="me". prefix:'' keeps the path at /api/users/me, matching
  // the sibling GET /users/me rather than /api/users-permissions/....
  plugin.routes['content-api'].routes.unshift({
    method: 'PUT',
    path: '/users/me',
    handler: 'user.updateMe',
    config: {
      prefix: '',
    },
  });

  return plugin;
};
