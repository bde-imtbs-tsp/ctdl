/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('inscription_messages', function(table) {
    table.increments('id').primary();
    table.string('channel_id').notNullable();
    table.string('message_id').notNullable();
    table.string('inscrit_role_id');
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('inscription_messages');
};
