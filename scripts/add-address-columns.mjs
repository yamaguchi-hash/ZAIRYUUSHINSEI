import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Load env
const envContent = readFileSync('.env.local', 'utf-8');
const dbUrl = envContent.match(/DATABASE_URL="([^"]+)"/)?.[1];

const sql = neon(dbUrl);

await sql`
  ALTER TABLE applicant_master
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS japan_prefecture TEXT,
  ADD COLUMN IF NOT EXISTS japan_city TEXT,
  ADD COLUMN IF NOT EXISTS japan_address_line TEXT
`;

console.log('Migration OK: postal_code, japan_prefecture, japan_city, japan_address_line columns added to applicant_master');
