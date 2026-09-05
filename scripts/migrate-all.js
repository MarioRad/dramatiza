/**
 * Migra TODOS los datos desde la BD local (192.168.100.129/inscripciones)
 * hacia Supabase (pooler en .env).
 *
 * Uso: node scripts/migrate-all.js
 *
 * Orden de ejecución:
 *  1. Truncar tablas en Supabase (respetando FKs)
 *  2. Migrar configuracion_evento, programa_bloques, dias_ponentes
 *  3. Migrar talleres (obtener nuevos IDs)
 *  4. Migrar ponentes (subir fotos a Storage)
 *  5. Migrar usuarios
 *  6. Migrar inscripciones (mapear taller_id)
 *  7. Migrar acreditaciones, encuentro_inscripciones, notificaciones
 *  8. Migrar planes_pago, asistente_planes, pagos_cuotas
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Client: PgClient } = require('pg');
const db = require('../src/db');
const { supabaseAdmin } = require('../src/supabase');

const STORAGE_BUCKET = 'ponentes-fotos';

// ── Conexión a BD local ───────────────────────────────────────────────
const LOCAL_DB = {
  host: '192.168.100.129',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'inscripciones',
  connectionTimeoutMillis: 10000,
};

// ── Fotos (buscar en cronograma/public/uploads) ───────────────────────
const CRONOGRAMA_UPLOADS = path.join(__dirname, '..', '..', 'cronograma', 'public', 'uploads');

async function uploadFotoToStorage(filename) {
  if (!filename) return null;
  const src = path.join(CRONOGRAMA_UPLOADS, filename);
  if (!fs.existsSync(src)) {
    console.log(`    [skip] Foto no encontrada: ${filename}`);
    return null;
  }
  const buffer = fs.readFileSync(src);
  const ext = path.extname(filename).toLowerCase();
  const contentType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg';
  const storagePath = `ponentes/${filename}`;
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) {
    console.error(`    [error] No se pudo subir ${filename}: ${error.message}`);
    return null;
  }
  return filename;
}

// ── Helpers ───────────────────────────────────────────────────────────
function filas(r) { return r.rows; }

async function truncateAll(pg) {
  console.log('\n=== TRUNCANDO TABLAS EN SUPABASE ===');
  const order = [
    'pagos_cuotas',
    'asistente_planes',
    'inscripciones',
    'acreditaciones',
    'encuentro_inscripciones',
    'comidas_asistencias',
    'notificaciones_leidas',
    'notificaciones',
    'eventos',
    'usuarios',
    'talleres',
    'ponentes',
    'dias_ponentes',
    'planes_pago',
    'programa_bloques',
    'configuracion_evento',
  ];
  for (const t of order) {
    try {
      await db.mutation(`DELETE FROM ${t}`);
      console.log(`  ✓ ${t}`);
    } catch (e) {
      console.log(`  ⚠ ${t}: ${e.message}`);
    }
  }
}

async function migrateConfiguracion(local) {
  console.log('\n=== MIGRANDO CONFIGURACION_EVENTO ===');
  const rows = filas(await local.query('SELECT clave, valor FROM configuracion_evento'));
  for (const r of rows) {
    await db.mutation(
      'INSERT INTO configuracion_evento (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor',
      [r.clave, r.valor]
    );
  }
  console.log(`  ✓ ${rows.length} registros`);
}

async function migratePrograma(local) {
  console.log('\n=== MIGRANDO PROGRAMA_BLOQUES ===');
  const rows = filas(await local.query(
    'SELECT dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos FROM programa_bloques ORDER BY dia, hora_inicio'
  ));
  let count = 0;
  for (const r of rows) {
    await db.mutation(
      `INSERT INTO programa_bloques (dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.dia, r.hora_inicio, r.hora_fin, r.tipo, r.titulo, r.descripcion || '', r.icono || '', r.orden || 0, r.datos || null]
    );
    count++;
  }
  console.log(`  ✓ ${count} bloques`);
}

async function migrateDias(local) {
  console.log('\n=== MIGRANDO DIAS_PONENTES ===');
  const rows = filas(await local.query('SELECT dia, fecha FROM dias_ponentes ORDER BY dia'));
  for (const r of rows) {
    await db.mutation(
      'INSERT INTO dias_ponentes (dia, fecha) VALUES (?, ?) ON CONFLICT (dia) DO UPDATE SET fecha = EXCLUDED.fecha',
      [r.dia, r.fecha]
    );
  }
  console.log(`  ✓ ${rows.length} días`);
}

async function migrateTalleres(local) {
  console.log('\n=== MIGRANDO TALLERES ===');
  const rows = filas(await local.query(
    'SELECT id, nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, ponente_id, pareja_id FROM talleres ORDER BY id'
  ));

  const idMap = {}; // old_id -> new_id
  let count = 0;

  for (const r of rows) {
    // First insert without foreign keys
    const res = await db.queryOne(
      `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, ponente_id, pareja_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [r.nombre, r.descripcion || '', r.cupo || 20, r.duracion_hs || 3, r.fecha || '', r.hora || '', r.lugar || '', r.disertante || '', null, null]
    );
    idMap[r.id] = res.id;
    count++;
  }

  console.log(`  ✓ ${count} talleres migrados`);
  console.log('  ID map:', JSON.stringify(idMap));
  return idMap;
}

async function migratePonentes(local) {
  console.log('\n=== MIGRANDO PONENTES (con fotos) ===');
  const rows = filas(await local.query(
    'SELECT id, nombre, tipo, dia, horario, dia2, horario2, titulo, descripcion, foto, foto_pos, cupo, orden FROM ponentes ORDER BY id'
  ));

  let fotosSubidas = 0;
  let count = 0;

  for (const r of rows) {
    // Upload photo first
    let foto = r.foto || null;
    if (foto) {
      const ok = await uploadFotoToStorage(foto);
      if (ok) fotosSubidas++;
    }

    await db.mutation(
      `INSERT INTO ponentes (nombre, tipo, dia, horario, dia2, horario2, titulo, descripcion, foto, foto_pos, cupo, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.nombre, r.tipo || 'ponencia', r.dia || 1, r.horario || '', r.dia2 || null, r.horario2 || '', r.titulo || '', r.descripcion || '', foto, r.foto_pos || '', r.cupo || 20, r.orden || 0]
    );
    count++;
  }
  console.log(`  ✓ ${count} ponentes, ${fotosSubidas} fotos subidas`);
}

async function migrateUsuarios(local) {
  console.log('\n=== MIGRANDO USUARIOS ===');
  const rows = filas(await local.query(
    'SELECT username, password_hash, nombre, rol, activo, perm_inscripciones, perm_talleres, perm_encuentro, perm_acreditacion FROM usuarios ORDER BY id'
  ));

  // Get permissions columns that may exist
  let hasPermPagos = false;
  try {
    await local.query('SELECT perm_pagos FROM usuarios LIMIT 1');
    hasPermPagos = true;
  } catch {}

  let count = 0;
  for (const r of rows) {
    // Get perm_pagos if column exists
    let permPagos = false;
    if (hasPermPagos) {
      try {
        const pr = await local.query('SELECT perm_pagos FROM usuarios WHERE username = $1', [r.username]);
        permPagos = pr.rows[0]?.perm_pagos || false;
      } catch {}
    }

    await db.mutation(
      `INSERT INTO usuarios (username, password_hash, nombre, rol, activo, perm_inscripciones, perm_talleres, perm_encuentro, perm_acreditacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         nombre = EXCLUDED.nombre,
         rol = EXCLUDED.rol,
         activo = EXCLUDED.activo,
         perm_inscripciones = EXCLUDED.perm_inscripciones,
         perm_talleres = EXCLUDED.perm_talleres,
         perm_encuentro = EXCLUDED.perm_encuentro,
         perm_acreditacion = EXCLUDED.perm_acreditacion`,
      [r.username, r.password_hash, r.nombre || '', r.rol || 'operador', r.activo !== false, r.perm_inscripciones !== false, r.perm_talleres !== false, r.perm_encuentro !== false, r.perm_acreditacion !== false]
    );
    count++;
  }
  console.log(`  ✓ ${count} usuarios`);
}

async function migrateInscripciones(local, idMap) {
  console.log('\n=== MIGRANDO INSCRIPCIONES ===');
  const rows = filas(await local.query(
    'SELECT nombre, apellido, dni, email, telefono, alimentacion, taller_id, en_encuentro, qr_code, qr_data, estado_pago FROM inscripciones ORDER BY id'
  ));

  let count = 0;
  let skipped = 0;
  for (const r of rows) {
    const newTallerId = idMap[r.taller_id];
    if (!newTallerId) {
      console.log(`  [skip] Inscripción #${r.dni} -> taller ${r.taller_id} no encontrado en mapa`);
      skipped++;
      continue;
    }
    try {
      await db.mutation(
        `INSERT INTO inscripciones (nombre, apellido, dni, email, telefono, alimentacion, taller_id, en_encuentro, qr_code, qr_data, estado_pago)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.nombre, r.apellido, r.dni, r.email || '', r.telefono || '', r.alimentacion || 'sin_restriccion', newTallerId, r.en_encuentro || false, r.qr_code || '', r.qr_data || null, r.estado_pago || 'no_pagado']
      );
      count++;
    } catch (e) {
      if (e.message.includes('duplicate') || e.message.includes('unique')) {
        console.log(`  [dup] ${r.nombre} ${r.apellido} DNI ${r.dni} taller ${newTallerId}`);
        skipped++;
      } else {
        console.error(`  [error] ${r.nombre} ${r.apellido}: ${e.message}`);
        skipped++;
      }
    }
  }
  console.log(`  ✓ ${count} inscripciones, ${skipped} omitidas`);
}

async function migrateAcreditaciones(local) {
  console.log('\n=== MIGRANDO ACREDITACIONES ===');
  const rows = filas(await local.query(
    'SELECT dni, nombre, apellido, qr_code, usuario FROM acreditaciones ORDER BY id'
  ));
  let count = 0;
  for (const r of rows) {
    try {
      await db.mutation(
        `INSERT INTO acreditaciones (dni, nombre, apellido, qr_code, usuario)
         VALUES (?, ?, ?, ?, ?)`,
        [r.dni, r.nombre || '', r.apellido || '', r.qr_code || '', r.usuario || '']
      );
      count++;
    } catch (e) {
      if (!e.message.includes('duplicate')) {
        console.error(`  [error] acreditación DNI ${r.dni}: ${e.message}`);
      }
    }
  }
  console.log(`  ✓ ${count} acreditaciones`);
}

async function migrateEncuentro(local) {
  console.log('\n=== MIGRANDO ENCUENTRO_INSCRIPCIONES ===');
  const rows = filas(await local.query('SELECT * FROM encuentro_inscripciones ORDER BY id'));
  let count = 0;
  for (const r of rows) {
    try {
      await db.mutation(
        'INSERT INTO encuentro_inscripciones (dni, nombre, apellido, email, telefono, pago) VALUES (?, ?, ?, ?, ?, ?)',
        [r.dni, r.nombre || '', r.apellido || '', r.email || '', r.telefono || '', r.pago || '']
      );
      count++;
    } catch (e) {
      if (!e.message.includes('duplicate')) console.error(`  [error] encuentro DNI ${r.dni}: ${e.message}`);
    }
  }
  console.log(`  ✓ ${count} encuentro_inscripciones`);
}

async function migrateNotificaciones(local) {
  console.log('\n=== MIGRANDO NOTIFICACIONES ===');
  const rows = filas(await local.query('SELECT titulo, mensaje, tipo, activa, creado_por FROM notificaciones ORDER BY id'));
  let count = 0;
  for (const r of rows) {
    try {
      await db.mutation(
        'INSERT INTO notificaciones (titulo, mensaje, tipo, activa, creado_por) VALUES (?, ?, ?, ?, ?)',
        [r.titulo, r.mensaje, r.tipo || 'info', r.activa !== false, r.creado_por || '']
      );
      count++;
    } catch (e) {
      console.error(`  [error] notificación: ${e.message}`);
    }
  }
  console.log(`  ✓ ${count} notificaciones`);
}

async function migratePlanesPago(local) {
  console.log('\n=== MIGRANDO PLANES_PAGO ===');
  const rows = filas(await local.query('SELECT id, nombre, descripcion, monto_total, cantidad_cuotas, activo FROM planes_pago ORDER BY id'));

  const planIdMap = {};
  let count = 0;
  for (const r of rows) {
    const res = await db.queryOne(
      'INSERT INTO planes_pago (nombre, descripcion, monto_total, cantidad_cuotas, activo) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [r.nombre, r.descripcion || '', r.monto_total || 0, r.cantidad_cuotas || 1, r.activo !== false]
    );
    planIdMap[r.id] = res.id;
    count++;
  }
  console.log(`  ✓ ${count} planes de pago`);
  return planIdMap;
}

async function migrateAsistentePlanes(local, planIdMap) {
  console.log('\n=== MIGRANDO ASISTENTE_PLANES ===');
  const rows = filas(await local.query('SELECT id, dni, plan_id, monto_total, cantidad_cuotas FROM asistente_planes ORDER BY id'));

  const apIdMap = {};
  let count = 0;
  for (const r of rows) {
    const newPlanId = planIdMap[r.plan_id];
    if (!newPlanId) {
      console.log(`  [skip] asistente_plan plan_id ${r.plan_id} no encontrado`);
      continue;
    }
    const res = await db.queryOne(
      'INSERT INTO asistente_planes (dni, plan_id, monto_total, cantidad_cuotas) VALUES (?, ?, ?, ?) RETURNING id',
      [r.dni, newPlanId, r.monto_total || 0, r.cantidad_cuotas || 1]
    );
    apIdMap[r.id] = res.id;
    count++;
  }
  console.log(`  ✓ ${count} asistente_planes`);
  return apIdMap;
}

async function migratePagosCuotas(local, apIdMap) {
  console.log('\n=== MIGRANDO PAGOS_CUOTAS ===');
  const rows = filas(await local.query('SELECT asistente_plan_id, numero_cuota, monto, fecha_pago FROM pagos_cuotas ORDER BY id'));

  let count = 0;
  for (const r of rows) {
    const newApId = apIdMap[r.asistente_plan_id];
    if (!newApId) {
      console.log(`  [skip] pago cuota asistente_plan_id ${r.asistente_plan_id} no encontrado`);
      continue;
    }
    try {
      await db.mutation(
        'INSERT INTO pagos_cuotas (asistente_plan_id, numero_cuota, monto, fecha_pago) VALUES (?, ?, ?, ?)',
        [newApId, r.numero_cuota, r.monto || 0, r.fecha_pago || null]
      );
      count++;
    } catch (e) {
      if (e.message.includes('duplicate')) {
        console.log(`  [dup] cuota ${r.numero_cuota} asistente_plan ${newApId}`);
      } else {
        console.error(`  [error] cuota: ${e.message}`);
      }
    }
  }
  console.log(`  ✓ ${count} pagos_cuotas`);
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('=== MIGRACIÓN COMPLETA: LOCAL → SUPABASE ===\n');

  // Connect to Supabase
  await db.initPool();
  console.log('✓ Conectado a Supabase');

  // Connect to local
  const local = new PgClient(LOCAL_DB);
  await local.connect();
  console.log('✓ Conectado a BD local (192.168.100.129/inscripciones)\n');

  // 1. Truncate
  await truncateAll(local);

  // 2. Migrate simple tables (no FK dependencies)
  await migrateConfiguracion(local);
  await migratePrograma(local);
  await migrateDias(local);

  // 3. Migrate talleres (returns ID map)
  const idMap = await migrateTalleres(local);

  // 4. Migrate ponentes (with photos)
  await migratePonentes(local);

  // 5. Migrate usuarios
  await migrateUsuarios(local);

  // 6. Migrate inscripciones (uses ID map)
  await migrateInscripciones(local, idMap);

  // 7. Migrate acreditaciones, encuentro, notificaciones
  await migrateAcreditaciones(local);
  await migrateEncuentro(local);
  await migrateNotificaciones(local);

  // 8. Migrate payment chain
  const planIdMap = await migratePlanesPago(local);
  const apIdMap = await migrateAsistentePlanes(local, planIdMap);
  await migratePagosCuotas(local, apIdMap);

  await local.end();
  console.log('\n=== MIGRACIÓN COMPLETADA ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error en migración:', err.message);
  console.error(err.stack);
  process.exit(1);
});
