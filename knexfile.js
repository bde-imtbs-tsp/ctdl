module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: './db/database.db'
    },
    useNullAsDefault: true,
    migrations: {
      directory: './migrations'
    }
  }
};
