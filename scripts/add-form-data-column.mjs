import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Load env
const envContent = readFileSync('.env.local', 'utf-8');
const dbUrl = envContent.match(/DATABASE_URL="([^"]+)"/)?.[1];

const sql = neon(dbUrl);
await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS form_data jsonb`;
console.log('Migration OK: form_data column added');
