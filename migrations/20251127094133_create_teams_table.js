/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('teams', function(table) {
    table.increments('id').primary();
    table.string('label').notNullable().unique(); // Lycan, Minet, Hypnos, etc.
    table.string('role_id').notNullable(); // Discord role ID
    table.timestamps(true, true); // created_at, updated_at
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('teams');
};
