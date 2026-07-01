import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run: node --env-file=.env scripts/migrate.js');
  process.exit(1);
}

const schemaPath = resolve(process.cwd(), 'schema.sql');
const schema = readFileSync(schemaPath, 'utf8');
const pool = new Pool({ connectionString: DATABASE_URL });

try {
  console.log('Connecting to database...');
  const client = await pool.connect();
  console.log('Running schema migration...');
  await client.query(schema);
  client.release();
  console.log('Migration complete.');
} catch (error) {
  console.error('Migration failed:', error?.message ?? error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
