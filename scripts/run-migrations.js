/**
 * Aplica las migraciones SQL de la carpeta supabase/migrations al proyecto.
 *
 * Uso: node scripts/run-migrations.js [archivo.sql]
 * Si no se pasa un archivo, aplica todas las migraciones en orden alfabético.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

async function getClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL en las variables de entorno.');
  }
  const u = new URL(process.env.DATABASE_URL);
  u.searchParams.delete('sslmode');
  const client = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function applyFile(client, file) {
  const sql = fs.readFileSync(file, 'utf8');
  console.log(`Aplicando ${path.basename(file)}...`);
  await client.query(sql);
  console.log(`Migración aplicada: ${path.basename(file)}`);
}

async function main() {
  const specific = process.argv[2];
  const client = await getClient();
  try {
    if (specific) {
      const file = path.join(MIGRATIONS_DIR, specific);
      if (!fs.existsSync(file)) throw new Error(`No existe la migración: ${file}`);
      await applyFile(client, file);
    } else {
      const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
      if (files.length === 0) {
        console.log('No hay migraciones en supabase/migrations.');
        return;
      }
      for (const f of files) {
        await applyFile(client, path.join(MIGRATIONS_DIR, f));
      }
    }
    console.log('Migraciones completadas.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
