'use strict';

const { POLICY_SETTINGS, POLICY_PAGES } = require('./seed-content');

const PAGE_UID = 'api::policy-page.policy-page';
const SETTINGS_UID = 'api::policy-setting.policy-setting';

/**
 * Writes the initial legal content into an empty database, once.
 *
 * Create-if-absent, never update. The client owns this text the moment the
 * server first boots, so a restart must not be able to revert a policy they
 * rewrote, republish one they unpublished, or add a fifth copy of a page.
 *
 * The existence check runs at draft status, which in Strapi 5 sees every
 * document — a published page has a draft version too. So a page that the
 * client has deliberately unpublished still counts as existing and is left
 * alone rather than being seeded back into life.
 */
const seedPolicyContent = async (strapi) => {
  const settings = await strapi.documents(SETTINGS_UID).findFirst();

  if (!settings) {
    // Published on creation: the public endpoint reads published settings only,
    // so a draft-only single type would leave every {{placeholder}} unresolved.
    await strapi.documents(SETTINGS_UID).create({
      data: POLICY_SETTINGS,
      status: 'published',
    });
    strapi.log.info('[policy-seed] created Policy Settings with placeholder values');
  }

  for (const page of POLICY_PAGES) {
    const existing = await strapi.documents(PAGE_UID).findFirst({
      filters: { slug: page.slug },
      fields: ['slug'],
    });

    if (existing) continue;

    await strapi.documents(PAGE_UID).create({ data: page, status: 'published' });
    strapi.log.info(`[policy-seed] created and published policy page "${page.slug}"`);
  }
};

module.exports = { seedPolicyContent };
