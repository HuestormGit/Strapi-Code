'use strict';

// Real database uniqueness for the three payment identity columns.
//
// Strapi's `"unique": true` is enforced only by the entity validator, which
// reads before it writes — so two concurrent requests can both pass it and both
// insert. These indexes are the actual concurrency protection; the schema flags
// stay because they still produce the friendly validation message.
//
// The provider columns are PARTIAL: a pending order legitimately has no
// provider ids yet, and every such row has to stay insertable. PostgreSQL
// already treats NULLs as distinct, but saying so explicitly keeps the intent
// on the page and keeps the index out of the NULL rows entirely.
//
// Deliberately not CONCURRENTLY: Strapi runs every user migration inside a
// transaction, and CREATE INDEX CONCURRENTLY cannot run in one.

const INDEXES = [
  {
    name: 'orders_order_number_unique',
    create:
      'CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique ON orders (order_number)',
  },
  {
    name: 'orders_payment_provider_order_id_unique',
    create:
      'CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_provider_order_id_unique ' +
      'ON orders (payment_provider_order_id) WHERE payment_provider_order_id IS NOT NULL',
  },
  {
    name: 'orders_payment_provider_payment_id_unique',
    create:
      'CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_provider_payment_id_unique ' +
      'ON orders (payment_provider_payment_id) WHERE payment_provider_payment_id IS NOT NULL',
  },
];

// Partial indexes are PostgreSQL/SQLite syntax; MySQL cannot express them, so
// skip rather than fail the boot there. Postgres is the deployment target.
const supportsPartialIndexes = (knex) =>
  ['pg', 'postgres', 'postgresql', 'sqlite3', 'better-sqlite3'].includes(
    knex.client?.config?.client
  );

async function up(knex) {
  if (!supportsPartialIndexes(knex)) return;
  for (const { create } of INDEXES) {
    await knex.raw(create);
  }
}

async function down(knex) {
  if (!supportsPartialIndexes(knex)) return;
  for (const { name } of INDEXES) {
    await knex.raw(`DROP INDEX IF EXISTS ${name}`);
  }
}

module.exports = { up, down };
