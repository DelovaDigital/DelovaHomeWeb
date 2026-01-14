const sql = require('mssql');

// DB configuration using environment variables with sensible defaults
// Set these in your environment (recommended) instead of editing this file:
// DB_USER, DB_PASSWORD, DB_SERVER, DB_PORT, DB_DATABASE, DB_INSTANCE,
// DB_ENCRYPT (true|false), DB_TRUST_CERT (true|false)
const config = {
  user: process.env.DB_USER || 'sa',
  server: process.env.DB_SERVER || '87.64.85.182',
  password: process.env.DB_PASSWORD || 'VIVes123',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
  database: process.env.DB_DATABASE || 'DelovaHub',
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000


  },
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true'
  }
};

// If you are connecting to a named instance (e.g. \\SERVER\SQLEXPRESS),
// set DB_INSTANCE=<instanceName> in your environment. That will use the
// instance name instead of a raw port.
if (process.env.DB_INSTANCE) {
  config.options.instanceName = process.env.DB_INSTANCE;
  // when using instanceName, remove explicit port so tedious uses the instance
  delete config.port;
}

let pool = null;
async function getPool() {
  if (pool) return pool;
  pool = await sql.connect(config);
  return pool;
}

async function testConnection() {
  try {
    const p = await getPool();
    // quick lightweight query
    await p.request().query('SELECT 1 AS OK');
    return true;
  } catch (err) {
    // rethrow so callers can handle and log nicely
    throw err;
  }
}

module.exports = { getPool, sql, config, testConnection };
