import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Use WebSocket transport (more network-compatible than neon() HTTP API driver)
neonConfig.webSocketConstructor = ws;

const NullishQueryFunction = async () => {
  throw new Error(
    'DATABASE_URL is not set. Please add it to your .env file.'
  );
};
NullishQueryFunction.transaction = NullishQueryFunction;

// Wrap Pool.query() to support tagged-template-literal syntax: sql`SELECT ...`
function createSqlTaggedTemplate(pool) {
  // Suppress unhandled 'error' events on the pool itself (they surface as
  // ugly ErrorEvent dumps in the console when the DB host is unreachable).
  // The actual error will still be thrown inside sql`...` calls and caught
  // by each route's try/catch.
  pool.on('error', (err) => {
    // Log a clean one-liner instead of the full WebSocket ErrorEvent object
    const msg = err?.message || err?.toString?.() || 'Unknown pool error';
    console.error(`[db] Pool error: ${msg}`);
  });

  const sql = async function (strings, ...values) {
    let query = '';
    const params = [];
    strings.forEach((str, i) => {
      query += str;
      if (i < values.length) {
        params.push(values[i]);
        query += `$${params.length}`;
      }
    });
    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (err) {
      // Unwrap WebSocket ErrorEvent → plain Error so callers get a clean throw
      if (err && err[Symbol.for('nodejs.rejection')] === undefined && err.error) {
        throw err.error;
      }
      throw err;
    }
  };

  sql.transaction = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };

  return sql;
}

const sql = process.env.DATABASE_URL
  ? createSqlTaggedTemplate(new Pool({ connectionString: process.env.DATABASE_URL }))
  : NullishQueryFunction;

export default sql;