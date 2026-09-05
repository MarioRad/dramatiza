/**
 * Migra ponentes y fotos desde /home/mario/desarrollos/nodejs/cronograma
 * hacia la base de datos y uploads de este proyecto.
 *
 * Uso: node scripts/migrate-ponentes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');
const db = require('../src/db');
const { supabaseAdmin } = require('../src/supabase');

const CRONOGRAMA_DIR = path.join(__dirname, '..', '..', 'cronograma');
const CRONOGRAMA_UPLOADS = path.join(CRONOGRAMA_DIR, 'public', 'uploads');
const STORAGE_BUCKET = 'ponentes-fotos';

async function uploadFotoToStorage(foto) {
  const src = path.join(CRONOGRAMA_UPLOADS, foto);
  if (!fs.existsSync(src)) return null;
  const buffer = fs.readFileSync(src);
  const storagePath = `ponentes/${foto}`;
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, { upsert: true });
  if (error) {
    console.error(`No se pudo subir la foto ${foto}: ${error.message}`);
    return null;
  }
  return foto;
}

async function main() {
  await db.initPool();
  console.log('DB inicializada.');

  const cronogramaEnv = require('dotenv').config({ path: path.join(CRONOGRAMA_DIR, '.env') }).parsed || {};
  const pg = new PgClient({
    host: cronogramaEnv.PGHOST || 'localhost',
    port: Number(cronogramaEnv.PGPORT) || 5432,
    user: cronogramaEnv.PGUSER || 'postgres',
    password: cronogramaEnv.PGPASSWORD || '',
    database: cronogramaEnv.PGDATABASE || 'cronograma',
  });

  await pg.connect();
  console.log('Conectado a cronograma DB.');

  const { rows: ponentes } = await pg.query(
    'SELECT id, nombre, tipo, dia, horario, dia2, horario2, titulo, descripcion, foto, foto_pos, orden FROM ponentes ORDER BY orden, id'
  );
  const { rows: dias } = await pg.query('SELECT dia, fecha FROM dias ORDER BY dia');

  console.log(`Ponentes encontrados: ${ponentes.length}`);
  console.log(`Días encontrados: ${dias.length}`);

  // Subir fotos a Supabase Storage
  let fotosSubidas = 0;
  for (const p of ponentes) {
    if (!p.foto) continue;
    const ok = await uploadFotoToStorage(p.foto);
    if (ok) fotosSubidas++;
  }
  console.log(`Fotos subidas: ${fotosSubidas}`);

  // Insertar días
  for (const d of dias) {
    await db.guardarDiasPonentes([{ dia: d.dia, fecha: d.fecha }]);
  }
  console.log(`Días insertados: ${dias.length}`);

  // Insertar ponentes
  let insertados = 0;
  let duplicados = 0;
  for (const p of ponentes) {
    const existente = await db.obtenerPonentePorNombre(p.nombre);
    if (existente) {
      duplicados++;
      continue;
    }
    await db.crearPonente({
      nombre: p.nombre,
      tipo: p.tipo,
      dia: p.dia,
      horario: p.horario || '',
      dia2: p.dia2 || null,
      horario2: p.horario2 || '',
      titulo: p.titulo || '',
      descripcion: p.descripcion || '',
      foto: p.foto || null,
      fotoPos: p.foto_pos || '',
      orden: p.orden || 0,
    });
    insertados++;
  }
  console.log(`Ponentes insertados: ${insertados}, duplicados omitidos: ${duplicados}`);

  await pg.end();
  console.log('Migración completada.');
}

main().catch((err) => {
  console.error('Error en migración:', err.message);
  process.exit(1);
});
