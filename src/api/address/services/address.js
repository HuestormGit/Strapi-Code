'use strict';

// Saved delivery addresses for the Account page.
//
// Every ownership decision in this file is made from ctx.state.user, which the
// controller passes through untouched. A customer id is never read from a
// request body, a query string or a path — the only identity this service will
// act on is the one the JWT resolved to.
//
// Orders are unaffected by anything here: an order stores an immutable
// order.shipping-snapshot component copied at checkout, not a relation to these
// rows, so editing or deleting a saved address cannot rewrite order history.

const ADDRESS_UID = 'api::address.address';

// Mirrors api/order/services/order.js, so a saved address and the address
// validated at checkout accept exactly the same values.
const MAX_TEXT_LENGTH = 200;
const MAX_PHONE_LENGTH = 20;
const PINCODE_PATTERN = /^[0-9]{6}$/;

const LABELS = new Set(['home', 'work', 'other']);
const DEFAULT_LABEL = 'home';

// The account page renders every address it is given and has no pagination, so
// the collection is capped rather than left to grow. Enforced here, on the
// server, where a browser cannot reach around it.
const MAX_ADDRESSES_PER_CUSTOMER = 10;

// The only fields any response may contain. `customer` is deliberately absent
// and is never populated: an address response must not carry the account it
// belongs to. documentId is included because the frontend addresses PUT and
// DELETE by it.
const ADDRESS_FIELDS = [
  'id',
  'documentId',
  'fullName',
  'phone',
  'addressLine1',
  'addressLine2',
  'landmark',
  'city',
  'state',
  'postalCode',
  'country',
  'label',
  'isDefault',
  'createdAt',
  'updatedAt',
];

// country is set by the server and never accepted from a request, exactly as
// validateShippingAddress does at checkout.
const COUNTRY = 'India';

const fail = (status, name, message, details) => {
  const error = new Error(message);
  error.status = status;
  error.name = name;
  if (details) error.details = details;
  throw error;
};

const invalidRequest = (message) => fail(400, 'ValidationError', message);

// Fails closed, matching the payment and profile services: a CMS API token
// satisfies the route's auth but leaves ctx.state.user undefined, and that must
// not be enough to read — or write — somebody's saved addresses.
const requireUser = (user) => {
  if (!user || !Number.isInteger(user.id)) {
    fail(401, 'UnauthorizedError', 'You must be signed in to manage your addresses');
  }
  return user;
};

// A documentId that does not resolve to one of the caller's own rows is
// answered as "not found", never "forbidden": a 403 would confirm that the
// address exists and belongs to somebody else.
const notFound = () => fail(404, 'NotFoundError', 'Address not found');

const requiredText = (value, field, { max = MAX_TEXT_LENGTH } = {}) => {
  if (typeof value !== 'string' || !value.trim()) {
    invalidRequest(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    invalidRequest(`${field} is too long`);
  }
  return trimmed;
};

const optionalText = (value, field, { max = MAX_TEXT_LENGTH } = {}) => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') {
    invalidRequest(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    invalidRequest(`${field} is too long`);
  }
  return trimmed;
};

const validatePostalCode = (value) => {
  if (typeof value !== 'string' || !PINCODE_PATTERN.test(value.trim())) {
    invalidRequest('postalCode must be exactly 6 digits');
  }
  return value.trim();
};

// The same rule the checkout applies to shippingAddress.phone: 10 digits,
// tolerating the +91 / 91 / 0 prefixes people type, stored normalised.
const validatePhone = (value) => {
  const raw = requiredText(value, 'phone', { max: MAX_PHONE_LENGTH });
  const digits = raw.replace(/[\s()-]/g, '').replace(/^(?:\+?91|0)/, '');
  if (!/^[0-9]{10}$/.test(digits)) {
    invalidRequest('phone must be a 10-digit Indian mobile number');
  }
  return digits;
};

// A controlled value, not free text: anything outside the enum is rejected
// rather than stored, so the frontend can switch on it without a fallback.
const validateLabel = (value) => {
  if (typeof value !== 'string' || !LABELS.has(value.trim().toLowerCase())) {
    invalidRequest(`label must be one of: ${[...LABELS].join(', ')}`);
  }
  return value.trim().toLowerCase();
};

// isDefault is accepted only as a promotion. Passing false is not an error and
// not a demotion: an account with addresses always keeps exactly one default,
// so the flag moves by promoting a different address or by deleting the current
// one — there is no state in which clearing it on its own would be valid.
const validateIsDefault = (value) => {
  if (typeof value !== 'boolean') {
    invalidRequest('isDefault must be a boolean');
  }
  return value;
};

const FIELD_VALIDATORS = {
  fullName: (value) => requiredText(value, 'fullName'),
  phone: validatePhone,
  addressLine1: (value) => requiredText(value, 'addressLine1'),
  addressLine2: (value) => optionalText(value, 'addressLine2'),
  landmark: (value) => optionalText(value, 'landmark'),
  city: (value) => requiredText(value, 'city'),
  state: (value) => requiredText(value, 'state'),
  postalCode: validatePostalCode,
  label: validateLabel,
  isDefault: validateIsDefault,
};

const EDITABLE_FIELDS = Object.keys(FIELD_VALIDATORS);

const assertObjectBody = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalidRequest('Request body must be an object');
  }
  return body;
};

// Built from scratch, never spread. `customer` and `country` are absent from
// FIELD_VALIDATORS, so a client that sends either has it dropped here rather
// than written — the caller sets both itself, below.
const buildCreate = (body) => {
  assertObjectBody(body);

  return {
    fullName: FIELD_VALIDATORS.fullName(body.fullName),
    phone: FIELD_VALIDATORS.phone(body.phone),
    addressLine1: FIELD_VALIDATORS.addressLine1(body.addressLine1),
    addressLine2: FIELD_VALIDATORS.addressLine2(body.addressLine2),
    landmark: FIELD_VALIDATORS.landmark(body.landmark),
    city: FIELD_VALIDATORS.city(body.city),
    state: FIELD_VALIDATORS.state(body.state),
    postalCode: FIELD_VALIDATORS.postalCode(body.postalCode),
    label: body.label === undefined ? DEFAULT_LABEL : FIELD_VALIDATORS.label(body.label),
    country: COUNTRY,
  };
};

// Partial by design, the same shape buildProfileUpdate uses for PUT /users/me:
// a field absent from the body is left untouched, a field present is validated.
// That is what lets "set as default" send { isDefault: true } alone while the
// edit form sends the whole address.
const buildUpdate = (body) => {
  assertObjectBody(body);

  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    data[field] = FIELD_VALIDATORS[field](body[field]);
  }

  if (Object.keys(data).length === 0) {
    invalidRequest(`Provide at least one of: ${EDITABLE_FIELDS.join(', ')}`);
  }

  return data;
};

module.exports = ({ strapi }) => {
  const documents = () => strapi.documents(ADDRESS_UID);

  const listOwned = (customerId) =>
    documents().findMany({
      filters: { customer: { id: customerId } },
      fields: [...ADDRESS_FIELDS],
      // The default sorts first so the frontend — and, later, checkout — can
      // take the head of the list without re-sorting.
      sort: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      limit: MAX_ADDRESSES_PER_CUSTOMER,
    });

  // The ownership guard, and the only way this service ever resolves a
  // documentId. Both conditions are in one query on purpose: there is no
  // window in which the row has been fetched but not yet checked.
  const findOwned = async (customerId, documentId) => {
    if (typeof documentId !== 'string' || !documentId.trim()) notFound();

    const [address] = await documents().findMany({
      filters: { documentId: documentId.trim(), customer: { id: customerId } },
      fields: [...ADDRESS_FIELDS],
      limit: 1,
    });

    return address || null;
  };

  const readOwned = async (customerId, documentId) => {
    const address = await findOwned(customerId, documentId);
    if (!address) notFound();
    return address;
  };

  // Clears the flag on every other address of this customer. Called only after
  // the promoted row is known to belong to them.
  //
  // ponytail: read-then-write rather than a transaction. Two concurrent
  // promotions could momentarily leave two rows flagged; the list sort is
  // deterministic regardless and the next write reconciles it. Wrap in
  // strapi.db.transaction if addresses ever become multi-writer.
  const clearOtherDefaults = async (customerId, keepDocumentId) => {
    const others = await documents().findMany({
      filters: {
        customer: { id: customerId },
        isDefault: true,
        documentId: { $ne: keepDocumentId },
      },
      fields: ['documentId'],
      limit: MAX_ADDRESSES_PER_CUSTOMER,
    });

    for (const other of others) {
      await documents().update({
        documentId: other.documentId,
        data: { isDefault: false },
      });
    }
  };

  return {
    async listForCustomer({ user } = {}) {
      const customer = requireUser(user);
      return listOwned(customer.id);
    },

    async createForCustomer({ user, body } = {}) {
      const customer = requireUser(user);
      const data = buildCreate(body);

      // Server-side and unconditional. The frontend hides the form at the
      // limit as a courtesy; this is what actually enforces it.
      const existing = await documents().count({
        filters: { customer: { id: customer.id } },
      });

      if (existing >= MAX_ADDRESSES_PER_CUSTOMER) {
        fail(
          409,
          'AddressLimitReached',
          `You can save up to ${MAX_ADDRESSES_PER_CUSTOMER} addresses. Delete one to add another.`,
          { code: 'ADDRESS_LIMIT_REACHED', limit: MAX_ADDRESSES_PER_CUSTOMER }
        );
      }

      // The first address is the default whatever the request said, so an
      // account with addresses always has exactly one.
      const isDefault =
        existing === 0
          ? true
          : body.isDefault === undefined
            ? false
            : validateIsDefault(body.isDefault);

      const created = await documents().create({
        // customer comes from the resolved JWT identity. buildCreate cannot
        // have copied one out of the body — the key is not a validated field.
        data: { ...data, isDefault, customer: { id: customer.id } },
        fields: [...ADDRESS_FIELDS],
      });

      if (isDefault) await clearOtherDefaults(customer.id, created.documentId);

      // The whole list, not just the created row. Promoting a default clears
      // the flag on another address, so returning one row would leave the
      // caller rendering a stale badge on a row it never asked about. Every
      // mutation here answers with the same projection as find, so the client
      // has one way to read a response and no reason to refetch.
      return listOwned(customer.id);
    },

    async updateForCustomer({ user, documentId, body } = {}) {
      const customer = requireUser(user);
      // Ownership first: a documentId belonging to somebody else is a 404 and
      // reaches no validation, no write and no field of the request body.
      const existing = await readOwned(customer.id, documentId);
      const data = buildUpdate(body);

      // Promotion only — see validateIsDefault. A row that is already the
      // default stays the default when the body says false.
      const promoting = data.isDefault === true;
      if (data.isDefault !== undefined) {
        data.isDefault = promoting || existing.isDefault;
      }

      await documents().update({
        documentId: existing.documentId,
        data,
        fields: [...ADDRESS_FIELDS],
      });

      if (promoting) await clearOtherDefaults(customer.id, existing.documentId);

      // The whole list, for the same reason as create above.
      return listOwned(customer.id);
    },

    async deleteForCustomer({ user, documentId } = {}) {
      const customer = requireUser(user);
      const existing = await readOwned(customer.id, documentId);

      await documents().delete({ documentId: existing.documentId });

      // Deleting the default must not leave the account without one. The
      // successor is the head of the remaining list, which is the most
      // recently updated address.
      if (existing.isDefault) {
        const [successor] = await documents().findMany({
          filters: { customer: { id: customer.id } },
          fields: ['documentId'],
          sort: [{ updatedAt: 'desc' }],
          limit: 1,
        });

        if (successor) {
          await documents().update({
            documentId: successor.documentId,
            data: { isDefault: true },
          });
        }
      }

      // The remaining addresses, so the caller renders the promoted default
      // without a second round trip.
      return listOwned(customer.id);
    },
  };
};
