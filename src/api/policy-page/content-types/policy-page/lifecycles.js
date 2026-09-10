'use strict';

const { errors } = require('@strapi/utils');

const UID = 'api::policy-page.policy-page';

// The React routes resolve a policy by slug, so two documents sharing one slug
// would make which legal text a visitor sees a coin toss. The enumeration in
// schema.json already limits slugs to the four the site serves, but Strapi does
// not enforce `unique` on an enumeration — verified, not assumed — so the
// constraint is enforced here instead.
//
// The subtlety is Draft & Publish: a published document is a second row with the
// same slug and the same documentId as its draft. Publishing must therefore not
// look like a clash, which is why every check excludes the document's own id.

/** The documentId of the row this event is about, or null if it is a new one. */
const documentIdFor = async (event) => {
  // Publishing arrives as a create carrying the existing documentId; a brand new
  // draft arrives without one, and genuinely has no sibling row yet.
  if (event.params.data?.documentId) return event.params.data.documentId;

  const id = event.params.where?.id;
  if (!id) return null;

  const row = await strapi.db.query(UID).findOne({ where: { id }, select: ['documentId'] });
  return row?.documentId ?? null;
};

const assertSlugIsFree = async (event) => {
  const { slug } = event.params.data || {};
  // Partial updates that do not touch the slug leave it undefined; nothing to check.
  if (!slug) return;

  const documentId = await documentIdFor(event);

  const clash = await strapi.db.query(UID).findOne({
    where: { slug, ...(documentId ? { documentId: { $ne: documentId } } : {}) },
    select: ['id'],
  });

  if (clash) {
    throw new errors.ApplicationError(
      `Another policy page already uses the slug "${slug}". Each of the four legal pages exists exactly once — edit the existing page instead of creating a second one.`,
      { slug }
    );
  }
};

module.exports = {
  beforeCreate: assertSlugIsFree,
  beforeUpdate: assertSlugIsFree,
};
