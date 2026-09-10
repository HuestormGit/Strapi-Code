'use strict';

const { POLICY_SLUGS, BUSINESS_FIELDS } = require('../policy-fields');

const PAGE_UID = 'api::policy-page.policy-page';
const SETTINGS_UID = 'api::policy-setting.policy-setting';

// {{name}} with nothing exotic inside — a bare identifier is the whole grammar.
// There is no expression to evaluate and no template engine involved: the
// replacement is a table lookup, so the worst a malformed placeholder can do is
// stay on the page as the literal text the editor typed.
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * Substitutes whitelisted business values into a string.
 *
 * Unknown names are left exactly as written rather than blanked, so a typo in
 * the Admin shows up as `{{suportEmail}}` on the page — visible and fixable —
 * instead of quietly deleting a sentence's subject. `vars` only ever holds the
 * BUSINESS_FIELDS keys, so no other property (`constructor`, `__proto__`, an
 * unrelated settings column) is reachable from policy copy.
 */
const fill = (value, vars) =>
  typeof value === 'string'
    ? value.replace(PLACEHOLDER, (literal, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : literal
      )
    : value;

/**
 * Walks a Strapi Blocks tree and substitutes inside its text nodes.
 *
 * Structure is copied, never interpreted: node types, marks and list formats
 * pass through untouched and only `text` (and a link's `url`, so
 * `mailto:{{supportEmail}}` works) is rewritten. Nothing here produces HTML.
 */
const fillBlocks = (nodes, vars) =>
  Array.isArray(nodes)
    ? nodes.map((node) => {
        if (!node || typeof node !== 'object') return node;
        const filled = { ...node };
        if (typeof filled.text === 'string') filled.text = fill(filled.text, vars);
        if (typeof filled.url === 'string') filled.url = fill(filled.url, vars);
        if (Array.isArray(filled.children)) filled.children = fillBlocks(filled.children, vars);
        return filled;
      })
    : [];

module.exports = ({ strapi }) => ({
  /**
   * The published policy page for `slug`, or null if there is none.
   *
   * Everything returned is assembled field by field below — the Strapi entity
   * is never spread into the response — so internal columns (documentId,
   * createdBy, draft state) cannot leak, and Policy Settings is readable only
   * through the BUSINESS_FIELDS projection.
   */
  async findBySlug(slug) {
    if (!POLICY_SLUGS.includes(slug)) return null;

    // status: 'published' is what keeps drafts off the live site. An unpublished
    // page has no published version, so this returns null and the route 404s.
    const page = await strapi.documents(PAGE_UID).findFirst({
      filters: { slug },
      populate: { sections: true },
      status: 'published',
    });

    if (!page) return null;

    const settings = await strapi.documents(SETTINGS_UID).findFirst({
      status: 'published',
    });

    // Unpublished or never-created settings degrade to an empty whitelist:
    // placeholders stay literal, `business` comes back with null values, and the
    // page still renders. Legal copy going missing is worse than a visible gap.
    const business = Object.fromEntries(
      BUSINESS_FIELDS.map((field) => [field, settings?.[field] ?? null])
    );

    const vars = Object.fromEntries(
      BUSINESS_FIELDS.filter((field) => typeof settings?.[field] === 'string').map((field) => [
        field,
        settings[field],
      ])
    );

    return {
      slug: page.slug,
      title: fill(page.title, vars),
      intro: fill(page.intro, vars),
      seoTitle: fill(page.seoTitle, vars),
      seoDescription: fill(page.seoDescription, vars),
      effectiveDate: page.effectiveDate ?? null,
      lastReviewedDate: page.lastReviewedDate ?? null,
      updatedAt: page.updatedAt ?? null,
      sections: (page.sections || []).map((section) => ({
        heading: fill(section.heading, vars),
        body: fillBlocks(section.body, vars),
      })),
      business,
    };
  },
});
