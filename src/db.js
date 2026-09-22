require('dotenv').config();

const pg = require('pg');

let pool = null;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function initPool() {
  if (pool) return pool;
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) =>
    v == null ? null : new Date(v.replace(' ', 'T') + 'Z')
  );
  const poolConfig = {
    options: '-c TimeZone=UTC',
  };
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const sslmode = url.searchParams.get('sslmode');
    url.searchParams.delete('sslmode');
    poolConfig.connectionString = url.toString();
    // SSL solo si sslmode=require/verify-* o host es Supabase/externo.
    // Para IPs privadas (192.168.x.x, 10.x, localhost) con sslmode=disable → sin SSL.
    const isPrivateHost = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(url.hostname);
    if (sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full') {
      poolConfig.ssl = { rejectUnauthorized: false };
    } else if (sslmode === 'disable' || sslmode === 'allow' || isPrivateHost) {
      poolConfig.ssl = false;
    } else if (/supabase\.co|pooler\.supabase\.com/.test(url.hostname)) {
      poolConfig.ssl = { rejectUnauthorized: false };
    } else {
      poolConfig.ssl = false;
    }
  } else {
    poolConfig.host = process.env.DB_HOST || '127.0.0.1';
    poolConfig.port = Number(process.env.DB_PORT || 5432);
    poolConfig.user = process.env.DB_USER || 'postgres';
    poolConfig.password = process.env.DB_PASSWORD || '';
    poolConfig.database = process.env.DB_NAME || 'inscripciones';
  }
  pool = new pg.Pool(poolConfig);
  // Auto-migración idempotente para producción (Vercel no ejecuta run-migrations.js)
  // 006_tallerista_50 + 005 cuotas (por si la DB de producción quedó desactualizada)
  pool.on('error', () => {});
  // Ejecutar en background sin bloquear el arranque
  (async () => {
    try {
      await pool.query('ALTER TABLE planes_pago ADD COLUMN IF NOT EXISTS cuotas JSONB');
      await pool.query('ALTER TABLE asistente_planes ADD COLUMN IF NOT EXISTS cuotas JSONB');
      await pool.query('ALTER TABLE planes_pago ADD COLUMN IF NOT EXISTS es_tallerista BOOLEAN NOT NULL DEFAULT FALSE');
      await pool.query('ALTER TABLE asistente_planes ADD COLUMN IF NOT EXISTS es_tallerista BOOLEAN NOT NULL DEFAULT FALSE');
      await pool.query('ALTER TABLE notificaciones_leidas ADD COLUMN IF NOT EXISTS leido_en TIMESTAMPTZ DEFAULT NOW()');
      await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perm_certificados BOOLEAN NOT NULL DEFAULT TRUE');
      try { await pool.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='usuarios_rol_check') THEN ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check; END IF; EXCEPTION WHEN others THEN NULL; END $$;`); } catch(_){}
      await pool.query(`ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin','superior','menu','operador'))`).catch(()=>{});
      await pool.query(`CREATE TABLE IF NOT EXISTS certificados (id SERIAL PRIMARY KEY, codigo VARCHAR(30) NOT NULL UNIQUE, tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('asistente','ponente','tallerista')), dni VARCHAR(20), ponente_id INTEGER REFERENCES ponentes(id) ON DELETE SET NULL, nombre TEXT NOT NULL, apellido TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', detalle JSONB, talleres_ids TEXT NOT NULL DEFAULT '', qr_data TEXT, hash_firma TEXT NOT NULL DEFAULT '', emitido_por TEXT NOT NULL DEFAULT '', creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_certificados_codigo ON certificados(codigo)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_certificados_dni ON certificados(dni)');
      await pool.query('CREATE TABLE IF NOT EXISTS taller_asistencias (id SERIAL PRIMARY KEY, dni TEXT NOT NULL, taller_id INTEGER NOT NULL REFERENCES talleres(id) ON DELETE CASCADE, bloque_id INTEGER REFERENCES programa_bloques(id) ON DELETE SET NULL, tipo TEXT NOT NULL CHECK (tipo IN (\'ingreso\',\'egreso\')), usuario TEXT, registrado_en TIMESTAMPTZ NOT NULL DEFAULT NOW())').catch(()=>{});
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_taller_asist ON taller_asistencias (dni, taller_id, COALESCE(bloque_id, -1), tipo)').catch(()=>{});
      // 007_roles_superior_menu_taller_asistencia: operador_taller_asignaciones
      await pool.query(`CREATE TABLE IF NOT EXISTS operador_taller_asignaciones (id SERIAL PRIMARY KEY, operador_username TEXT NOT NULL REFERENCES usuarios(username) ON DELETE CASCADE, taller_id INTEGER NOT NULL REFERENCES talleres(id) ON DELETE CASCADE, dia DATE NOT NULL, bloque_id INTEGER REFERENCES programa_bloques(id) ON DELETE SET NULL, creado_por TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(()=>{});
      await pool.query('CREATE INDEX IF NOT EXISTS idx_op_taller_asig_operador ON operador_taller_asignaciones(operador_username)').catch(()=>{});
      await pool.query('CREATE INDEX IF NOT EXISTS idx_op_taller_asig_dia ON operador_taller_asignaciones(dia)').catch(()=>{});
      // 009_múltiple ponentes: talleres ↔ ponentes y bloques ↔ ponentes
      await pool.query(`CREATE TABLE IF NOT EXISTS taller_ponentes (id SERIAL PRIMARY KEY, taller_id INTEGER NOT NULL REFERENCES talleres(id) ON DELETE CASCADE, ponente_id INTEGER NOT NULL REFERENCES ponentes(id) ON DELETE CASCADE, orden INTEGER NOT NULL DEFAULT 0, creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE (taller_id, ponente_id))`).catch(()=>{});
      await pool.query('CREATE INDEX IF NOT EXISTS idx_taller_ponentes_taller ON taller_ponentes(taller_id)').catch(()=>{});
      await pool.query('CREATE INDEX IF NOT EXISTS idx_taller_ponentes_ponente ON taller_ponentes(ponente_id)').catch(()=>{});
      await pool.query(`CREATE TABLE IF NOT EXISTS bloque_ponentes (id SERIAL PRIMARY KEY, bloque_id INTEGER NOT NULL REFERENCES programa_bloques(id) ON DELETE CASCADE, ponente_id INTEGER NOT NULL REFERENCES ponentes(id) ON DELETE CASCADE, orden INTEGER NOT NULL DEFAULT 0, creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE (bloque_id, ponente_id))`).catch(()=>{});
      await pool.query('CREATE INDEX IF NOT EXISTS idx_bloque_ponentes_bloque ON bloque_ponentes(bloque_id)').catch(()=>{});
      await pool.query('CREATE INDEX IF NOT EXISTS idx_bloque_ponentes_ponente ON bloque_ponentes(ponente_id)').catch(()=>{});
      // Comprobante encuentro (form nativo)
      await pool.query(`ALTER TABLE encuentro_inscripciones ADD COLUMN IF NOT EXISTS comprobante TEXT NOT NULL DEFAULT ''`).catch(()=>{});
      await pool.query(`ALTER TABLE encuentro_inscripciones ADD COLUMN IF NOT EXISTS comprobante_nombre TEXT NOT NULL DEFAULT ''`).catch(()=>{});
      await pool.query(`ALTER TABLE encuentro_inscripciones ADD COLUMN IF NOT EXISTS comprobante_tipo TEXT NOT NULL DEFAULT ''`).catch(()=>{});
      // Comprobantes por cuota (multi-comprobante según cantidad de cuotas)
      await pool.query(`ALTER TABLE pagos_cuotas ADD COLUMN IF NOT EXISTS comprobante TEXT NOT NULL DEFAULT ''`).catch(()=>{});
      await pool.query(`ALTER TABLE pagos_cuotas ADD COLUMN IF NOT EXISTS comprobante_nombre TEXT NOT NULL DEFAULT ''`).catch(()=>{});
      await pool.query(`ALTER TABLE pagos_cuotas ADD COLUMN IF NOT EXISTS comprobante_tipo TEXT NOT NULL DEFAULT ''`).catch(()=>{});
      // Migrar datos existentes si las tablas estaban vacías
      try { await pool.query(`INSERT INTO taller_ponentes (taller_id, ponente_id, orden) SELECT id, ponente_id, 0 FROM talleres WHERE ponente_id IS NOT NULL ON CONFLICT (taller_id, ponente_id) DO NOTHING`); } catch(_){}
    } catch (e) {
      console.error('[db] auto-migración es_tallerista/cuotas falló:', e.message);
    }
  })();
  return pool;
}

function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function filas(resultado) {
  return resultado.rows;
}

async function query(sql, params = []) {
  const p = await initPool();
  const res = await p.query(toPgSql(sql), params);
  return filas(res);
}

async function queryOne(sql, params = []) {
  const filasRes = await query(sql, params);
  return filasRes[0] || null;
}

async function mutation(sql, params = []) {
  const p = await initPool();
  const res = await p.query(toPgSql(sql), params);
  return { filasAfectadas: res.rowCount || 0, insertId: null };
}

async function transaction(fn) {
  const p = await initPool();
  const conn = await p.connect();
  const run = async (sql, params = []) => {
    const res = await conn.query(toPgSql(sql), params);
    const rows = filas(res);
    rows.filasAfectadas = res.rowCount || 0;
    return rows;
  };
  try {
    await conn.query('BEGIN');
    const out = await fn(run);
    await conn.query('COMMIT');
    return out;
  } catch (e) {
    try { await conn.query('ROLLBACK'); } catch (_) { /* noop */ }
    throw e;
  } finally {
    conn.release();
  }
}

async function listarTalleres() {
  const talleres = await query(
    `SELECT t.id, t.nombre, t.descripcion, t.cupo, t.duracion_hs, t.fecha, t.hora, t.lugar, t.disertante, t.pareja_id, t.ponente_id,
       (SELECT COUNT(*) FROM inscripciones i WHERE i.taller_id = t.id) AS inscriptos
     FROM talleres t
     ORDER BY t.fecha, t.hora, t.id`
  );
  // Adjuntar ponentes múltiples (taller_ponentes) + fallback a ponente_id/disertante
  try {
    const ids = talleres.map(t => Number(t.id));
    if (ids.length) {
      const filas = await query(
        `SELECT tp.taller_id, p.id, p.nombre, p.foto, p.tipo, p.titulo
         FROM taller_ponentes tp JOIN ponentes p ON p.id = tp.ponente_id
         WHERE tp.taller_id IN (${ids.map(() => '?').join(',')})
         ORDER BY tp.orden, p.nombre`,
        ids
      );
      const porTaller = new Map();
      for (const r of filas) {
        const tid = Number(r.taller_id);
        if (!porTaller.has(tid)) porTaller.set(tid, []);
        porTaller.get(tid).push({ id: Number(r.id), nombre: r.nombre, foto: r.foto, tipo: r.tipo, titulo: r.titulo });
      }
      for (const t of talleres) {
        const lista = porTaller.get(Number(t.id)) || [];
        // Fallback: si no hay filas en junction pero hay ponente_id legacy, agregar
        if (lista.length === 0 && t.ponente_id) {
          try {
            const p = await queryOne('SELECT id, nombre, foto, tipo, titulo FROM ponentes WHERE id = ?', [t.ponente_id]);
            if (p) lista.push({ id: Number(p.id), nombre: p.nombre, foto: p.foto, tipo: p.tipo, titulo: p.titulo });
          } catch (_) {}
        }
        t.ponentes = lista;
        // mantener compat: ponente_id principal
        t.ponente_id = lista[0] ? lista[0].id : (t.ponente_id ? Number(t.ponente_id) : null);
        // Si disertante vacío pero hay ponentes, sintetizar
        if ((!t.disertante || !String(t.disertante).trim()) && lista.length) {
          t.disertante = lista.map(p => p.nombre).join(' — ');
        }
      }
    } else {
      for (const t of talleres) t.ponentes = [];
    }
  } catch (_) {
    for (const t of talleres) t.ponentes = [];
  }
  return talleres;
}

async function obtenerTaller(id) {
  const t = await queryOne('SELECT * FROM talleres WHERE id = ?', [id]);
  if (!t) return null;
  try {
    const pon = await query(
      `SELECT p.id, p.nombre, p.foto, p.tipo, p.titulo FROM taller_ponentes tp JOIN ponentes p ON p.id = tp.ponente_id WHERE tp.taller_id = ? ORDER BY tp.orden, p.nombre`,
      [id]
    );
    t.ponentes = pon.map(r => ({ id: Number(r.id), nombre: r.nombre, foto: r.foto, tipo: r.tipo, titulo: r.titulo }));
    if (!t.ponentes.length && t.ponente_id) {
      const p = await queryOne('SELECT id, nombre, foto, tipo, titulo FROM ponentes WHERE id = ?', [t.ponente_id]);
      if (p) t.ponentes = [{ id: Number(p.id), nombre: p.nombre, foto: p.foto, tipo: p.tipo, titulo: p.titulo }];
    }
  } catch (_) { t.ponentes = []; }
  return t;
}

async function setTallerPonentes(tallerId, ponenteIds = [], run = null) {
  const ids = [...new Set((ponenteIds || []).map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0))];
  const exec = run ? run : async (sql, params) => query(sql, params);
  // Para run transaction, run ya es wrapper que hace query
  // Detectar si run es el wrapper transaction (retorna rows array con filasAfectadas) vs query
  const q = run ? run : query;
  // Limpiar
  if (run) {
    await q('DELETE FROM taller_ponentes WHERE taller_id = ?', [tallerId]);
    for (let i = 0; i < ids.length; i++) {
      await q('INSERT INTO taller_ponentes (taller_id, ponente_id, orden) VALUES (?, ?, ?) ON CONFLICT (taller_id, ponente_id) DO UPDATE SET orden = EXCLUDED.orden', [tallerId, ids[i], i]);
    }
    if (ids.length) {
      await q('UPDATE talleres SET ponente_id = ?, disertante = (SELECT STRING_AGG(p.nombre, \' — \' ORDER BY tp.orden) FROM taller_ponentes tp JOIN ponentes p ON p.id = tp.ponente_id WHERE tp.taller_id = ?) WHERE id = ?', [ids[0], tallerId, tallerId]);
    } else {
      await q('UPDATE talleres SET ponente_id = NULL WHERE id = ?', [tallerId]);
    }
  } else {
    await query('DELETE FROM taller_ponentes WHERE taller_id = ?', [tallerId]);
    for (let i = 0; i < ids.length; i++) {
      await query('INSERT INTO taller_ponentes (taller_id, ponente_id, orden) VALUES (?, ?, ?) ON CONFLICT (taller_id, ponente_id) DO UPDATE SET orden = EXCLUDED.orden', [tallerId, ids[i], i]);
    }
    if (ids.length) {
      const fila = await queryOne('SELECT STRING_AGG(p.nombre, \' — \' ORDER BY tp.orden) as nombres FROM taller_ponentes tp JOIN ponentes p ON p.id = tp.ponente_id WHERE tp.taller_id = ?', [tallerId]);
      await query('UPDATE talleres SET ponente_id = ?, disertante = ? WHERE id = ?', [ids[0], fila && fila.nombres ? fila.nombres : '', tallerId]);
    } else {
      await query('UPDATE talleres SET ponente_id = NULL WHERE id = ?', [tallerId]);
    }
  }
}
function bloquesHorario(t) {
  const fechaStr = String(t.fecha || '').trim();
  const horaStr = String(t.hora || '').trim();
  const mFecha = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const mHora = horaStr.match(/(\d{1,2}):(\d{2})/);
  if (!mFecha || !mHora) return [];
  const durHs = Number(t.duracion_hs) || 3;
  const numDias = durHs >= 6 ? 2 : 1;
  const inicio = new Date(Number(mFecha[1]), Number(mFecha[2]) - 1, Number(mFecha[3]), Number(mHora[1]), Number(mHora[2]));
  if (Number.isNaN(inicio.getTime())) return [];
  const durMs = durHs * 3600 * 1000;
  const bloques = [];
  for (let i = 0; i < numDias; i++) {
    const s = new Date(inicio.getTime() + i * 86400000);
    bloques.push([s.getTime(), s.getTime() + durMs]);
  }
  return bloques;
}

function diasDelTaller(t) {
  const m = String(t.fecha || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return [];
  const durHs = Number(t.duracion_hs) || 3;
  const numDias = durHs >= 6 ? 2 : 1;
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dias = [];
  for (let i = 0; i < numDias; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    dias.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dias;
}

function talleresSeSuperponen(a, b) {
  const ba = bloquesHorario(a);
  const bb = bloquesHorario(b);
  for (const x of ba) {
    for (const y of bb) {
      if (x[0] < y[1] && y[0] < x[1]) return true;
    }
  }
  return false;
}

function buscarConflictoHorario(existentes, nuevos) {
  const todos = [...existentes, ...nuevos];
  for (let i = 0; i < todos.length; i++) {
    for (let j = i + 1; j < todos.length; j++) {
      if (talleresSeSuperponen(todos[i], todos[j])) {
        return [todos[i], todos[j]];
      }
    }
  }
  return null;
}

async function crearInscripcion({ nombre, apellido, dni, email, telefono = '', alimentacion = 'sin_restriccion', tallerIds = [], enEncuentro = false, estadoPago = 'no_pagado' }) {
  const seleccionIds = Array.isArray(tallerIds) ? tallerIds.filter(n => Number.isInteger(n) && n > 0) : [];
  if (seleccionIds.length === 0) throw new HttpError(400, 'Debés seleccionar al menos un taller.');

  return transaction(async (run) => {
    const existentes = await run(
      `SELECT i.taller_id, t.nombre, t.fecha, t.hora, t.duracion_hs
       FROM inscripciones i JOIN talleres t ON t.id = i.taller_id
       WHERE i.dni = ?`,
      [dni]
    );

    const seleccionados = [];
    for (const id of seleccionIds) {
      const res = await run('SELECT id, nombre, cupo, fecha, hora, duracion_hs FROM talleres WHERE id = ? FOR UPDATE', [id]);
      const taller = res[0];
      if (!taller) throw new HttpError(400, 'Uno de los talleres seleccionados no existe.');
      const conteo = await run('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id = ?', [id]);
      if (Number(conteo[0].n) >= Number(taller.cupo)) {
        throw new HttpError(409, `No hay más cupos disponibles para el taller "${taller.nombre}".`);
      }
      seleccionados.push(taller);
    }

    const conflicto = buscarConflictoHorario(existentes, seleccionados);
    if (conflicto) {
      throw new HttpError(
        409,
        `Los talleres "${conflicto[0].nombre}" y "${conflicto[1].nombre}" se superponen en horario. Elegí otros talleres.`
      );
    }

    for (const id of seleccionIds) {
      try {
        await run(
          'INSERT INTO inscripciones (nombre, apellido, dni, email, telefono, alimentacion, taller_id, en_encuentro, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [nombre, apellido, dni, email, telefono, alimentacion, id, enEncuentro, estadoPago]
        );
      } catch (e) {
        if (e.code === '23505') {
          throw new HttpError(409, 'El DNI ingresado ya está inscripto en ese taller.');
        }
        throw e;
      }
    }
  });
}

async function listarInscripciones() {
  return query(
    `SELECT i.id, i.nombre, i.apellido, i.dni, i.email, i.telefono, i.alimentacion, i.en_encuentro, i.creado_en,
       i.estado_pago, i.taller_id, t.nombre AS taller, t.duracion_hs
     FROM inscripciones i
     JOIN talleres t ON t.id = i.taller_id
     ORDER BY t.fecha, t.hora, t.id, i.id`
  );
}

async function cambiarEstadoPagoInscripcion(id, estadoPago) {
  const inscripcion = await queryOne('SELECT id, dni, nombre, apellido FROM inscripciones WHERE id = ?', [id]);
  if (!inscripcion) throw new HttpError(404, 'Inscripción no encontrada.');
  await mutation('UPDATE inscripciones SET estado_pago = ? WHERE id = ?', [estadoPago, id]);
  return inscripcion;
}

async function esAsistenteEncuentro(dni) {
  const fila = await queryOne('SELECT id FROM encuentro_inscripciones WHERE dni = ?', [dni]);
  return !!fila;
}

async function buscarEncuentroPorDni(dni) {
  return queryOne('SELECT nombre, apellido, email, telefono, pago FROM encuentro_inscripciones WHERE dni = ?', [dni]);
}

async function listarInscripcionesPorDni(dni) {
  return query(
    `SELECT i.id, i.dni, i.nombre, i.apellido, i.email, i.telefono, i.alimentacion,
       i.estado_pago, i.qr_code, i.taller_id, t.nombre AS taller, t.descripcion, t.duracion_hs, t.fecha, t.hora, t.lugar
     FROM inscripciones i
     JOIN talleres t ON t.id = i.taller_id
     WHERE i.dni = ?
     ORDER BY t.fecha, t.hora`,
    [dni]
  );
}

async function importarEncuentro(personas) {
  if (personas.length === 0) return { importados: 0, existentes: 0 };
  const resultado = await transaction(async (run) => {
    let importados = 0;
    let existentes = 0;
    for (const p of personas) {
      const previa = await run('SELECT id FROM encuentro_inscripciones WHERE dni = ?', [p.dni]);
      if (previa.length > 0) {
        existentes++;
        await run(
          `UPDATE encuentro_inscripciones
           SET nombre = ?, apellido = ?, email = ?, telefono = ?, pago = ?,
               marca_temporal = ?, fecha_nacimiento = ?, provincia = ?, ciudad = ?,
               ocupacion = ?, opcion_pago = ?, oculto = FALSE
           WHERE dni = ?`,
          [
            p.nombre,
            p.apellido,
            p.email,
            p.telefono,
            p.pago || '',
            p.marcaTemporal || '',
            p.fechaNacimiento || '',
            p.provincia || '',
            p.ciudad || '',
            p.ocupacion || '',
            p.opcionPago || '',
            p.dni,
          ]
        );
      } else {
        importados++;
        await run(
          `INSERT INTO encuentro_inscripciones
             (dni, nombre, apellido, email, telefono, pago, marca_temporal, fecha_nacimiento, provincia, ciudad, ocupacion, opcion_pago)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.dni,
            p.nombre,
            p.apellido,
            p.email,
            p.telefono,
            p.pago || '',
            p.marcaTemporal || '',
            p.fechaNacimiento || '',
            p.provincia || '',
            p.ciudad || '',
            p.ocupacion || '',
            p.opcionPago || '',
          ]
        );
      }
      if (p.pago) {
        await run('UPDATE inscripciones SET estado_pago = ? WHERE dni = ?', [p.pago, p.dni]);
      }
    }
    return { importados, existentes };
  });
  await asignarPlanesAutomaticos(personas.map((p) => ({ dni: p.dni, marca_temporal: p.marcaTemporal })));
  return resultado;
}

async function crearEncuentroInscripcion({ dni, nombre, apellido, email, telefono = '', fechaNacimiento = '', provincia = '', ciudad = '', ocupacion = '', opcionPago = '', comprobante = '', comprobanteNombre = '', comprobanteTipo = '' }) {
  const dniLimpio = String(dni || '').replace(/\D/g, '');
  if (!/^\d{7,8}$/.test(dniLimpio)) throw new HttpError(400, 'DNI inválido (7 u 8 dígitos).');
  if (!String(nombre || '').trim() || String(nombre).trim().length < 2) throw new HttpError(400, 'Nombre inválido.');
  if (!String(apellido || '').trim() || String(apellido).trim().length < 2) throw new HttpError(400, 'Apellido inválido.');
  const emailLimpio = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) throw new HttpError(400, 'Email inválido.');
  const telLimpio = String(telefono || '').replace(/\D/g, '');
  if (!telLimpio || telLimpio.length < 8) throw new HttpError(400, 'Teléfono/celular obligatorio.');
  if (!['Docente','Estudiante'].includes(String(ocupacion||'').trim())) throw new HttpError(400, 'Ocupación debe ser Docente o Estudiante.');
  const existente = await queryOne('SELECT id, dni FROM encuentro_inscripciones WHERE dni = ?', [dniLimpio]);
  if (existente) throw new HttpError(409, 'Ese DNI ya está inscripto al encuentro.');
  const marcaTemporal = new Date().toISOString();
  await mutation(
    `INSERT INTO encuentro_inscripciones
       (dni, nombre, apellido, email, telefono, pago, marca_temporal, fecha_nacimiento, provincia, ciudad, ocupacion, opcion_pago, comprobante, comprobante_nombre, comprobante_tipo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dniLimpio,
      String(nombre).trim(),
      String(apellido).trim(),
      emailLimpio,
      String(telefono || '').replace(/\D/g, ''),
      '',
      marcaTemporal,
      String(fechaNacimiento || '').trim(),
      String(provincia || '').trim(),
      String(ciudad || '').trim(),
      String(ocupacion || '').trim(),
      String(opcionPago || '').trim(),
      String(comprobante || ''),
      String(comprobanteNombre || ''),
      String(comprobanteTipo || ''),
    ]
  );
  await asignarPlanAutomaticoAsistente(dniLimpio, marcaTemporal).catch(() => {});
  return { dni: dniLimpio };
}

function getComprobanteUrl(valor) {
  if (!valor) return '';
  if (/^https?:\/\//.test(valor)) return valor;
  // valor es nombre de archivo en storage o local
  return `/uploads/comprobantes/${valor}`;
}

async function listarEncuentro() {
  return query(
    `SELECT e.id, e.dni, e.nombre, e.apellido, e.email, e.telefono, e.pago,
            e.marca_temporal, e.fecha_nacimiento, e.provincia, e.ciudad, e.ocupacion,
            e.opcion_pago, e.comprobante, e.comprobante_nombre, e.comprobante_tipo, e.creado_en, e.oculto,
       EXISTS (SELECT 1 FROM inscripciones i WHERE i.dni = e.dni) AS tiene_talleres
     FROM encuentro_inscripciones e
     WHERE e.oculto = FALSE
     ORDER BY e.creado_en DESC, e.id DESC`
  );
}

async function actualizarEncuentroPersona(id, campos = {}) {
  const fila = await queryOne('SELECT id FROM encuentro_inscripciones WHERE id = ?', [id]);
  if (!fila) throw new HttpError(404, 'Registro del encuentro no encontrado.');
  await mutation(
    `UPDATE encuentro_inscripciones
     SET nombre = ?, apellido = ?, email = ?, telefono = ?, fecha_nacimiento = ?,
         provincia = ?, ciudad = ?, ocupacion = ?, opcion_pago = ?, marca_temporal = ?
     WHERE id = ?`,
    [
      String(campos.nombre || '').trim(),
      String(campos.apellido || '').trim(),
      String(campos.email || '').trim(),
      String(campos.telefono || '').trim(),
      String(campos.fechaNacimiento || '').trim(),
      String(campos.provincia || '').trim(),
      String(campos.ciudad || '').trim(),
      String(campos.ocupacion || '').trim(),
      String(campos.opcionPago || '').trim(),
      String(campos.marcaTemporal || '').trim(),
      id,
    ]
  );
}

async function ocultarEncuentroPersona(id) {
  const res = await mutation('UPDATE encuentro_inscripciones SET oculto = TRUE WHERE id = ? AND oculto = FALSE', [id]);
  if (res.filasAfectadas === 0) throw new HttpError(404, 'Registro del encuentro no encontrado.');
  return true;
}

async function contarEncuentro() {
  const filasRes = await query('SELECT COUNT(*) AS n FROM encuentro_inscripciones WHERE oculto = FALSE');
  return Number(filasRes[0].n);
}

async function vaciarEncuentro() {
  const res = await mutation('DELETE FROM encuentro_inscripciones');
  return res.filasAfectadas;
}

function limpiarNombreParte(nombre) {
  return String(nombre || '').replace(/\s*\(\d+°\s*parte\)\s*/gi, '').trim();
}

function sufijoParte(n, total) {
  if (total <= 1) return '';
  return ` (${n + 1}° parte)`;
}

async function crearTaller({ nombre, descripcion, cupo, lugar, disertante, parts = [], ponentes = [], ponenteIds = [] }) {
  const nombreBase = limpiarNombreParte(nombre);
  const n = Number(cupo);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'El cupo debe ser un número entero mayor o igual a 0.');
  if (!parts.length) parts = [{ fecha: '', hora: '', duracion_hs: 3 }];
  const ponIds = [...new Set([...(ponentes||[]), ...(ponenteIds||[])].map(v=> Number(v)).filter(v=> Number.isInteger(v) && v>0))];

  const ids = [];
  const fn = async (run) => {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const duracionHs = Number(p.duracion_hs) || 3;
      const fecha = String(p.fecha || '').trim();
      const hora = String(p.hora || '').trim();
      const nombreParte = nombreBase + sufijoParte(i, parts.length);
      const parejaId = i > 0 ? ids[0] : null;
      // Si hay ponentes múltiples, derivar disertante y ponente_id del primero
      let disertanteEfectivo = disertante;
      let ponenteIdEfectivo = ponIds[0] || null;
      if (ponIds.length) {
        try {
          const nombresRows = await run(`SELECT p.nombre FROM ponentes p WHERE p.id IN (${ponIds.map(()=> '?').join(',')}) ORDER BY array_position(ARRAY[${ponIds.join(',')}]::int[], p.id)`, ponIds);
          if (nombresRows && nombresRows.length) disertanteEfectivo = nombresRows.map(r=> r.nombre).join(' — ');
        } catch(_) {}
      }

      const filasRes = await run(
        `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, pareja_id, ponente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [nombreParte, descripcion, n, duracionHs, fecha, hora, lugar, disertanteEfectivo, parejaId, ponenteIdEfectivo]
      );
      const newId = Number(filasRes[0].id);
      ids.push(newId);
      // Insertar vínculos taller_ponentes para cada parte (main y pareja) con todos los ponentes
      for (let oi = 0; oi < ponIds.length; oi++) {
        await run('INSERT INTO taller_ponentes (taller_id, ponente_id, orden) VALUES (?, ?, ?) ON CONFLICT (taller_id, ponente_id) DO UPDATE SET orden = EXCLUDED.orden', [newId, ponIds[oi], oi]);
      }
    }
  };

  if (parts.length > 1) {
    await transaction(fn);
  } else {
    await fn(async (sql, params) => {
      const p = await initPool();
      const res = await p.query(toPgSql(sql), params);
      return filas(res);
    });
  }
  return ids[0];
}

async function actualizarTaller(id, { nombre, descripcion, cupo, lugar, disertante, parts = [], ponentes = [], ponenteIds = [] }) {
  const n = Number(cupo);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'El cupo debe ser un número entero mayor o igual a 0.');
  const conteo = await query('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id = ?', [id]);
  if (Number(conteo[0].n) > n) {
    throw new HttpError(409, `No se puede reducir el cupo: ya hay ${conteo[0].n} inscriptos.`);
  }
  if (!parts.length) parts = [{ id: null, fecha: '', hora: '', duracion_hs: 3 }];
  const ponIds = [...new Set([...(ponentes||[]), ...(ponenteIds||[])].map(v=> Number(v)).filter(v=> Number.isInteger(v) && v>0))];
  let disertanteEfectivo = disertante;
  let ponenteIdEfectivo = ponIds[0] || null;
  if (ponIds.length) {
    try {
      const filas = await query(`SELECT nombre FROM ponentes WHERE id IN (${ponIds.map(()=> '?').join(',')}) ORDER BY array_position(ARRAY[${ponIds.join(',')}]::int[], id)`, ponIds);
      if (filas && filas.length) disertanteEfectivo = filas.map(r=> r.nombre).join(' — ');
    } catch(_) {}
  }

  const fn = async (run) => {
    const mainRes = await run(
      'UPDATE talleres SET descripcion = ?, cupo = ?, lugar = ?, disertante = ?, ponente_id = ? WHERE id = ?',
      [descripcion, n, lugar, disertanteEfectivo, ponenteIdEfectivo, id]
    );
    if (!mainRes.filasAfectadas) throw new HttpError(404, 'Taller no encontrado.');

    const existentes = await run('SELECT id FROM talleres WHERE id = ? OR pareja_id = ?', [id, id]);
    const existentesIds = new Set(existentes.map(r => Number(r.id)));
    existentesIds.delete(id);

    const incomingIds = new Set(parts.filter(p => p.id).map(p => Number(p.id)));

    for (const eid of existentesIds) {
      if (!incomingIds.has(eid)) {
        await run('DELETE FROM talleres WHERE id = ?', [eid]);
      }
    }

    const nombreBase = limpiarNombreParte(nombre);
    const totalParts = parts.length;

    const idsFinales = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const duracionHs = Number(p.duracion_hs) || 3;
      const fecha = String(p.fecha || '').trim();
      const hora = String(p.hora || '').trim();
      const nombreParte = nombreBase + sufijoParte(i, totalParts);

      if (p.id) {
        if (Number(p.id) === Number(id)) {
          await run(
            'UPDATE talleres SET nombre = ?, descripcion = ?, cupo = ?, duracion_hs = ?, fecha = ?, hora = ?, lugar = ?, disertante = ?, ponente_id = ? WHERE id = ?',
            [nombreParte, descripcion, n, duracionHs, fecha, hora, lugar, disertanteEfectivo, ponenteIdEfectivo, p.id]
          );
          idsFinales.push(Number(p.id));
        } else {
          await run(
            'UPDATE talleres SET nombre = ?, descripcion = ?, cupo = ?, duracion_hs = ?, fecha = ?, hora = ?, lugar = ?, disertante = ?, ponente_id = ? WHERE id = ?',
            [nombreParte, descripcion, n, duracionHs, fecha, hora, lugar, disertanteEfectivo, ponenteIdEfectivo, p.id]
          );
          idsFinales.push(Number(p.id));
        }
      } else {
        const parejaId = i === 0 ? null : id;
        const ins = await run(
          `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, pareja_id, ponente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [nombreParte, descripcion, n, duracionHs, fecha, hora, lugar, disertanteEfectivo, parejaId, ponenteIdEfectivo]
        );
        const newId = Number(ins[0].id);
        idsFinales.push(newId);
      }
    }
    if (!idsFinales.includes(Number(id))) idsFinales.unshift(Number(id));

    // Sincronizar taller_ponentes para todos los ids finales
    for (const tid of idsFinales) {
      await run('DELETE FROM taller_ponentes WHERE taller_id = ?', [tid]);
      for (let oi = 0; oi < ponIds.length; oi++) {
        await run('INSERT INTO taller_ponentes (taller_id, ponente_id, orden) VALUES (?, ?, ?) ON CONFLICT (taller_id, ponente_id) DO UPDATE SET orden = EXCLUDED.orden', [tid, ponIds[oi], oi]);
      }
    }

    const nombreFinal = nombreBase + sufijoParte(0, totalParts);
    await run('UPDATE talleres SET nombre = ? WHERE id = ?', [nombreFinal, id]);
  };

  await transaction(fn);
  return true;
}

async function eliminarTaller(id) {
  const taller = await queryOne('SELECT nombre FROM talleres WHERE id = ?', [id]);
  if (!taller) throw new HttpError(404, 'Taller no encontrado.');
  const conteo = await queryOne('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id IN (SELECT id FROM talleres WHERE id = ? OR pareja_id = ?)', [id, id]);
  const inscriptos = Number(conteo.n);
  await mutation('DELETE FROM talleres WHERE id = ? OR pareja_id = ?', [id, id]);
  return { nombre: taller.nombre, inscriptosEliminados: inscriptos };
}

async function eliminarInscripcion(id) {
  const res = await mutation('DELETE FROM inscripciones WHERE id = ?', [id]);
  return res.filasAfectadas > 0;
}

async function eliminarInscripcionesPorDni(dni) {
  const res = await mutation('DELETE FROM inscripciones WHERE dni = ?', [dni]);
  return res.filasAfectadas;
}

// ── Asistentes (CRUD agregado sobre inscripciones) ────────────────────

async function listarAsistentes() {
  return query(
    `SELECT
       i.dni,
       MIN(i.nombre) AS nombre,
       MIN(i.apellido) AS apellido,
       MIN(i.email) AS email,
       MIN(i.telefono) AS telefono,
       MIN(i.alimentacion) AS alimentacion,
       BOOL_OR(i.en_encuentro) AS en_encuentro,
       MIN(i.estado_pago) AS estado_pago,
       MIN(i.creado_en) AS creado_en,
       COUNT(*) AS cantidad_talleres,
       STRING_AGG(t.nombre, ', ' ORDER BY t.fecha, t.hora) AS talleres_nombres,
       STRING_AGG(CAST(t.id AS TEXT), ',' ORDER BY t.fecha, t.hora) AS talleres_ids
     FROM inscripciones i
     JOIN talleres t ON t.id = i.taller_id
     GROUP BY i.dni
     ORDER BY MIN(i.apellido), MIN(i.nombre)`
  );
}

async function actualizarAsistente(dni, { nombre, apellido, email, telefono, alimentacion }) {
  const existe = await queryOne('SELECT dni FROM inscripciones WHERE dni = ? LIMIT 1', [dni]);
  if (!existe) throw new HttpError(404, 'Asistente no encontrado.');
  await mutation(
    'UPDATE inscripciones SET nombre = ?, apellido = ?, email = ?, telefono = ?, alimentacion = ? WHERE dni = ?',
    [String(nombre || '').trim(), String(apellido || '').trim(), String(email || '').trim(), String(telefono || '').trim().replace(/\D/g, ''), String(alimentacion || 'sin_restriccion').trim(), dni]
  );
  return true;
}

async function registrarEvento(tipo, detalle, usuario = 'admin') {
  await query('INSERT INTO eventos (tipo, detalle, usuario) VALUES (?, ?, ?)', [tipo, detalle, usuario]);
}

async function listarEventos({ limit = null, offset = null } = {}) {
  if (Number.isInteger(limit) && limit > 0) {
    const lim = Math.min(100, limit);
    const off = Number.isInteger(offset) && offset >= 0 ? offset : 0;
    return query('SELECT id, tipo, detalle, usuario, creado_en FROM eventos ORDER BY id DESC LIMIT ? OFFSET ?', [lim, off]);
  }
  return query('SELECT id, tipo, detalle, usuario, creado_en FROM eventos ORDER BY id DESC');
}

async function contarEventos() {
  const filasRes = await query('SELECT COUNT(*) AS n FROM eventos');
  return Number(filasRes[0].n);
}

async function hayUsuarios() {
  const filasRes = await query('SELECT COUNT(*) AS n FROM usuarios');
  return Number(filasRes[0].n) > 0;
}

async function crearUsuario({ username, passwordHash, nombre = '', rol = 'operador' }) {
  const filasRes = await query(
    'INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES (?, ?, ?, ?) RETURNING id',
    [username, passwordHash, nombre, rol]
  );
  return Number(filasRes[0].id);
}

async function buscarUsuario(username) {
  try {
    return await queryOne('SELECT id, username, password_hash, nombre, rol, activo, perm_inscripciones, perm_talleres, perm_encuentro, perm_acreditacion, perm_certificados FROM usuarios WHERE username = ?', [username]);
  } catch (e) {
    if (e.code === '42703') {
      return queryOne('SELECT id, username, password_hash, nombre, rol, activo, perm_inscripciones, perm_talleres, perm_encuentro, perm_acreditacion FROM usuarios WHERE username = ?', [username]);
    }
    throw e;
  }
}

async function listarUsuarios() {
  try {
    const filasRes = await query('SELECT id, username, nombre, rol, activo, perm_inscripciones, perm_talleres, perm_encuentro, perm_acreditacion, perm_certificados, creado_en FROM usuarios ORDER BY id');
    return filasRes.map((u) => ({ ...u, id: Number(u.id), activo: Boolean(u.activo) }));
  } catch (e) {
    if (e.code === '42703') {
      const filasRes = await query('SELECT id, username, nombre, rol, activo, perm_inscripciones, perm_talleres, perm_encuentro, perm_acreditacion, creado_en FROM usuarios ORDER BY id');
      return filasRes.map((u) => ({ ...u, id: Number(u.id), activo: Boolean(u.activo), perm_certificados: true }));
    }
    throw e;
  }
}

async function actualizarUsuario(id, { nombre, rol, activo, passwordHash = null, permInscripciones = true, permTalleres = true, permEncuentro = true, permAcreditacion = true, permCertificados = true }) {
  if (passwordHash) {
    await mutation('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, password_hash = ?, perm_inscripciones = ?, perm_talleres = ?, perm_encuentro = ?, perm_acreditacion = ?, perm_certificados = ? WHERE id = ?', [
      nombre, rol, activo, passwordHash, permInscripciones, permTalleres, permEncuentro, permAcreditacion, permCertificados, id,
    ]);
  } else {
    await mutation('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, perm_inscripciones = ?, perm_talleres = ?, perm_encuentro = ?, perm_acreditacion = ?, perm_certificados = ? WHERE id = ?', [
      nombre, rol, activo, permInscripciones, permTalleres, permEncuentro, permAcreditacion, permCertificados, id,
    ]);
  }
}

async function eliminarUsuario(id) {
  const res = await mutation('DELETE FROM usuarios WHERE id = ?', [id]);
  return res.filasAfectadas > 0;
}

async function guardarQrInscripcion(dni, qrCode, qrData) {
  await mutation('UPDATE inscripciones SET qr_code = ?, qr_data = ? WHERE dni = ?', [qrCode, qrData, dni]);
}

async function buscarAcreditacionPorDni(dni) {
  return queryOne(
    `SELECT i.dni, i.nombre, i.apellido, i.email, i.telefono, i.alimentacion, i.qr_code, i.qr_data, i.creado_en
     FROM inscripciones i
     WHERE i.dni = ? AND i.qr_code <> ''
     ORDER BY i.id DESC
     LIMIT 1`,
    [dni]
  );
}

async function cambiarTallerInscripcion(id, nuevoTallerId) {
  const inscripcion = await queryOne('SELECT id, dni, nombre, apellido, taller_id FROM inscripciones WHERE id = ?', [id]);
  if (!inscripcion) throw new HttpError(404, 'Inscripción no encontrada.');
  if (Number(inscripcion.taller_id) === Number(nuevoTallerId)) {
    throw new HttpError(400, 'El participante ya está inscripto en ese taller.');
  }
  const taller = await queryOne('SELECT id, nombre, cupo, fecha, hora, duracion_hs FROM talleres WHERE id = ?', [nuevoTallerId]);
  if (!taller) throw new HttpError(400, 'El taller seleccionado no existe.');
  const conteo = await query('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id = ? AND id <> ?', [nuevoTallerId, id]);
  if (Number(conteo[0].n) >= Number(taller.cupo)) {
    throw new HttpError(409, `No hay más cupos disponibles para el taller "${taller.nombre}".`);
  }
  const otros = await query(
    `SELECT i.taller_id, t.nombre, t.fecha, t.hora, t.duracion_hs
     FROM inscripciones i JOIN talleres t ON t.id = i.taller_id
     WHERE i.dni = ? AND i.id <> ?`,
    [inscripcion.dni, id]
  );
  const conflicto = buscarConflictoHorario(otros, [taller]);
  if (conflicto) {
    throw new HttpError(
      409,
      `Los talleres "${conflicto[0].nombre}" y "${conflicto[1].nombre}" se superponen en horario. Elegí otro taller.`
    );
  }
  const anterior = await queryOne('SELECT nombre FROM talleres WHERE id = ?', [inscripcion.taller_id]);
  await mutation('UPDATE inscripciones SET taller_id = ? WHERE id = ?', [nuevoTallerId, id]);
  return {
    dni: inscripcion.dni,
    nombre: inscripcion.nombre,
    apellido: inscripcion.apellido,
    anterior: anterior ? anterior.nombre : 'desconocido',
    nuevo: taller.nombre,
  };
}

async function reemplazarTalleresInscripcion(dni, ids) {
  const seleccionIds = Array.isArray(ids)
    ? [...new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (seleccionIds.length === 0) throw new HttpError(400, 'Debés seleccionar al menos un taller.');

  const persona = await queryOne(
    'SELECT dni, nombre, apellido, email, telefono, alimentacion FROM inscripciones WHERE dni = ? ORDER BY id LIMIT 1',
    [dni]
  );
  if (!persona) throw new HttpError(404, 'No se encontraron inscripciones para el DNI indicado.');

  return transaction(async (run) => {
    const actuales = await run(
      `SELECT i.id, i.taller_id, i.en_encuentro, i.estado_pago,
         t.nombre, t.fecha, t.hora, t.duracion_hs
       FROM inscripciones i JOIN talleres t ON t.id = i.taller_id
       WHERE i.dni = ?
       ORDER BY i.id`,
      [dni]
    );

    const actualesPorTaller = new Map(actuales.map((a) => [Number(a.taller_id), a]));
    const idsActuales = actuales.map((a) => Number(a.taller_id));

    const nuevosTalleres = [];
    for (const id of seleccionIds) {
      const t = await run('SELECT id, nombre, cupo, fecha, hora, duracion_hs FROM talleres WHERE id = ?', [id]);
      if (t.length === 0) throw new HttpError(400, 'Uno de los talleres seleccionados no existe.');
      const taller = t[0];
      if (actualesPorTaller.has(id)) continue;
      const conteo = await run('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id = ? AND dni <> ?', [id, dni]);
      if (Number(conteo[0].n) >= Number(taller.cupo)) {
        throw new HttpError(409, `No hay más cupos disponibles para el taller "${taller.nombre}".`);
      }
      nuevosTalleres.push(taller);
    }

    const finales = actuales
      .filter((a) => seleccionIds.includes(Number(a.taller_id)))
      .map((a) => ({ ...a, taller_id: Number(a.taller_id) }));
    for (const nt of nuevosTalleres) finales.push(nt);
    const conflicto = buscarConflictoHorario([], finales);
    if (conflicto) {
      throw new HttpError(
        409,
        `Los talleres "${conflicto[0].nombre}" y "${conflicto[1].nombre}" se superponen en horario. Elegí otros talleres.`
      );
    }

    const estadoPago = actuales[0] && actuales[0].estado_pago ? actuales[0].estado_pago : 'no_pagado';
    const enEncuentro = actuales.some((a) => a.en_encuentro) ? 1 : 0;

    for (const id of idsActuales) {
      if (!seleccionIds.includes(id)) {
        await run('DELETE FROM inscripciones WHERE dni = ? AND taller_id = ?', [dni, id]);
      }
    }
    for (const id of seleccionIds) {
      if (idsActuales.includes(id)) continue;
      try {
        await run(
          'INSERT INTO inscripciones (nombre, apellido, dni, email, telefono, alimentacion, taller_id, en_encuentro, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [persona.nombre, persona.apellido, persona.dni, persona.email, persona.telefono || '', persona.alimentacion || 'sin_restriccion', id, enEncuentro, estadoPago]
        );
      } catch (e) {
        if (e.code === '23505') throw new HttpError(409, 'El DNI ya está inscripto en ese taller.');
        throw e;
      }
    }
  }).then(() => ({ dni: persona.dni, nombre: persona.nombre, apellido: persona.apellido }));
}

// ── Programa ──────────────────────────────────────────────────────────

async function listarPrograma() {
  const bloques = await query('SELECT * FROM programa_bloques ORDER BY dia, orden, hora_inicio');
  try {
    const ids = bloques.map(b => Number(b.id));
    if (ids.length) {
      const filas = await query(
        `SELECT bp.bloque_id, p.id, p.nombre, p.foto, p.tipo, p.titulo FROM bloque_ponentes bp JOIN ponentes p ON p.id = bp.ponente_id WHERE bp.bloque_id IN (${ids.map(()=> '?').join(',')}) ORDER BY bp.orden, p.nombre`,
        ids
      );
      const porBloque = new Map();
      for (const r of filas) {
        const bid = Number(r.bloque_id);
        if (!porBloque.has(bid)) porBloque.set(bid, []);
        porBloque.get(bid).push({ id: Number(r.id), nombre: r.nombre, foto: r.foto, tipo: r.tipo, titulo: r.titulo });
      }
      for (const b of bloques) {
        b.ponentes = porBloque.get(Number(b.id)) || [];
        b.ponentes_ids = b.ponentes.map(p=> p.id);
      }
    } else {
      for (const b of bloques) { b.ponentes = []; b.ponentes_ids = []; }
    }
  } catch (_) {
    for (const b of bloques) { b.ponentes = []; b.ponentes_ids = []; }
  }
  return bloques;
}

async function listarDiasPrograma() {
  return query('SELECT DISTINCT dia FROM programa_bloques ORDER BY dia');
}

async function obtenerBloque(id) {
  const b = await queryOne('SELECT * FROM programa_bloques WHERE id = ?', [id]);
  if (!b) return null;
  try {
    const pon = await query(`SELECT p.id, p.nombre, p.foto, p.tipo, p.titulo FROM bloque_ponentes bp JOIN ponentes p ON p.id = bp.ponente_id WHERE bp.bloque_id = ? ORDER BY bp.orden, p.nombre`, [id]);
    b.ponentes = pon.map(r=> ({ id: Number(r.id), nombre: r.nombre, foto: r.foto, tipo: r.tipo, titulo: r.titulo }));
    b.ponentes_ids = b.ponentes.map(p=> p.id);
  } catch (_) { b.ponentes = []; b.ponentes_ids = []; }
  return b;
}

async function setBloquePonentes(bloqueId, ponenteIds = []) {
  const ids = [...new Set((ponenteIds||[]).map(n=> Number(n)).filter(n=> Number.isInteger(n) && n>0))];
  await query('DELETE FROM bloque_ponentes WHERE bloque_id = ?', [bloqueId]);
  for (let i=0;i<ids.length;i++) {
    await query('INSERT INTO bloque_ponentes (bloque_id, ponente_id, orden) VALUES (?, ?, ?) ON CONFLICT (bloque_id, ponente_id) DO UPDATE SET orden = EXCLUDED.orden', [bloqueId, ids[i], i]);
  }
}

async function crearBloque({ dia, hora_inicio, hora_fin, tipo, titulo, descripcion = '', icono = '', orden = 0, datos = null, ponentes = [], ponenteIds = [] }) {
  const filasRes = await query(
    'INSERT INTO programa_bloques (dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos]
  );
  const id = Number(filasRes[0].id);
  const ponIds = [...new Set([...(ponentes||[]), ...(ponenteIds||[])].map(v=> Number(v)).filter(v=> Number.isInteger(v) && v>0))];
  if (ponIds.length) await setBloquePonentes(id, ponIds);
  return id;
}

async function actualizarBloque(id, { dia, hora_inicio, hora_fin, tipo, titulo, descripcion = '', icono = '', orden = 0, datos = null, ponentes = [], ponenteIds = [] }) {
  const res = await mutation(
    'UPDATE programa_bloques SET dia = ?, hora_inicio = ?, hora_fin = ?, tipo = ?, titulo = ?, descripcion = ?, icono = ?, orden = ?, datos = ? WHERE id = ?',
    [dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos, id]
  );
  if (!res.filasAfectadas) throw new HttpError(404, 'Bloque no encontrado.');
  const ponIds = [...new Set([...(ponentes||[]), ...(ponenteIds||[])].map(v=> Number(v)).filter(v=> Number.isInteger(v) && v>0))];
  // Si se proveyó ponentes (aunque sea array vacío) actualizar vínculos; si no se proveyó, no tocar
  if (ponentes !== undefined || ponenteIds !== undefined) {
    await setBloquePonentes(id, ponIds);
  }
  return true;
}

async function eliminarBloque(id) {
  const res = await mutation('DELETE FROM programa_bloques WHERE id = ?', [id]);
  if (!res.filasAfectadas) throw new HttpError(404, 'Bloque no encontrado.');
  return true;
}

async function listarBloquePonentes(bloqueId) {
  return query(`SELECT p.id, p.nombre, p.foto, p.tipo FROM bloque_ponentes bp JOIN ponentes p ON p.id=bp.ponente_id WHERE bp.bloque_id = ? ORDER BY bp.orden`, [bloqueId]);
}

// ── Ponentes (catálogo) ───────────────────────────────────────────────

async function listarPonentes() {
  return query('SELECT * FROM ponentes ORDER BY dia, orden, id');
}

async function obtenerPonente(id) {
  return queryOne('SELECT * FROM ponentes WHERE id = ?', [id]);
}

async function obtenerPonentePorNombre(nombre) {
  return queryOne('SELECT * FROM ponentes WHERE nombre = ?', [nombre]);
}

async function crearPonente({ nombre, tipo = 'ponencia', dia = 1, horario = '', dia2 = null, horario2 = '', titulo = '', descripcion = '', foto = null, fotoPos = '', cupo = 20, orden = 0 }) {
  const filasRes = await query(
    'INSERT INTO ponentes (nombre, tipo, dia, horario, dia2, horario2, titulo, descripcion, foto, foto_pos, cupo, orden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [nombre, tipo, dia, horario, dia2, horario2, titulo, descripcion, foto, fotoPos, cupo, orden]
  );
  return Number(filasRes[0].id);
}

async function actualizarPonente(id, { nombre, tipo, dia, horario, dia2, horario2, titulo, descripcion, foto, fotoPos, cupo = 20, orden }) {
  if (orden === undefined) {
    const actual = await obtenerPonente(id);
    orden = actual?.orden ?? 0;
  }
  const res = await mutation(
    `UPDATE ponentes SET nombre = ?, tipo = ?, dia = ?, horario = ?, dia2 = ?, horario2 = ?, titulo = ?, descripcion = ?, foto = ?, foto_pos = ?, cupo = ?, orden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [nombre, tipo, dia, horario, dia2, horario2, titulo, descripcion, foto, fotoPos, cupo, orden, id]
  );
  if (!res.filasAfectadas) throw new HttpError(404, 'Ponente no encontrado.');
  return true;
}

async function eliminarPonente(id) {
  const res = await mutation('DELETE FROM ponentes WHERE id = ?', [id]);
  if (!res.filasAfectadas) throw new HttpError(404, 'Ponente no encontrado.');
  return true;
}

async function listarPonentesConFecha() {
  const filas = await query(
    `SELECT p.*, d.fecha AS fecha_dia, d2.fecha AS fecha_dia2
     FROM ponentes p
     LEFT JOIN dias_ponentes d ON d.dia = p.dia
     LEFT JOIN dias_ponentes d2 ON d2.dia = p.dia2
     ORDER BY p.dia, p.orden, p.id`
  );
  return filas;
}

function convertirFechaDia(fechaDDMMYYYY) {
  const m = String(fechaDDMMYYYY || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

async function sincronizarTalleresDesdePonentes() {
  const ponentes = await listarPonentesConFecha();
  const talleresPonente = ponentes.filter((p) => p.tipo === 'taller');

  const existentes = await query('SELECT id, ponente_id FROM talleres WHERE ponente_id IS NOT NULL');
  const noEnlazados = await query('SELECT id FROM talleres WHERE ponente_id IS NULL');

  const idsVigentes = new Set(talleresPonente.map((p) => Number(p.id)));

  for (const t of existentes) {
    if (!idsVigentes.has(Number(t.ponente_id))) {
      await mutation('DELETE FROM talleres WHERE id = ?', [t.id]);
    }
  }

  for (const t of noEnlazados) {
    const n = await queryOne('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id = ?', [t.id]);
    if (!n || Number(n.n) === 0) {
      await mutation('DELETE FROM talleres WHERE id = ?', [t.id]);
    }
  }

  for (let i = 0; i < talleresPonente.length; i++) {
    const p = talleresPonente[i];
    // Si este ponente ya es co-ponente de otro taller (segundo ponente), no crear taller propio
    const yaEsCoPonente = await queryOne('SELECT tp.taller_id FROM taller_ponentes tp JOIN talleres t ON t.id = tp.taller_id WHERE tp.ponente_id = ? AND t.ponente_id != ?', [p.id, p.id]);
    if (yaEsCoPonente) {
      // Ya está vinculado como segundo ponente a otro taller, omitir creación/actualización propia
      continue;
    }
    const fecha = convertirFechaDia(p.fecha_dia);
    if (!fecha) continue;
    const nombre = (String(p.titulo || '').trim() || String(p.nombre || '')).slice(0, 120);
    const hora = String(p.horario || '').trim();
    const cupo = Number(p.cupo) || 20;
    const datos = {
      nombre,
      descripcion: String(p.descripcion || ''),
      cupo,
      duracion_hs: 3,
      lugar: '',
      disertante: String(p.nombre || ''),
      ponente_id: Number(p.id),
    };

    let main = await queryOne('SELECT id FROM talleres WHERE ponente_id = ? AND pareja_id IS NULL', [p.id]);
    let mainId;
    if (main) {
      // Si el taller ya tiene múltiples ponentes, preservar disertante combinado y ponente_id principal
      const cntRow = await queryOne('SELECT COUNT(*) as n FROM taller_ponentes WHERE taller_id = ?', [main.id]);
      let disertanteFinal = datos.disertante;
      let ponenteIdFinal = datos.ponente_id;
      if (cntRow && Number(cntRow.n) > 1) {
        const agg = await queryOne('SELECT STRING_AGG(p.nombre, \' — \' ORDER BY tp.orden) as nombres FROM taller_ponentes tp JOIN ponentes p ON p.id=tp.ponente_id WHERE tp.taller_id = ?', [main.id]);
        if (agg && agg.nombres) disertanteFinal = agg.nombres;
        const first = await queryOne('SELECT ponente_id FROM taller_ponentes WHERE taller_id = ? ORDER BY orden LIMIT 1', [main.id]);
        if (first) ponenteIdFinal = Number(first.ponente_id);
        // No sobrescribir nombre si ya es combinado? mantener el de la actividad (puede ser igual)
      }
      await mutation(
        `UPDATE talleres SET nombre = ?, descripcion = ?, cupo = ?, duracion_hs = ?, fecha = ?, hora = ?, lugar = ?, disertante = ?, ponente_id = ? WHERE id = ?`,
        [datos.nombre, datos.descripcion, datos.cupo, datos.duracion_hs, fecha, hora, datos.lugar, disertanteFinal, ponenteIdFinal, main.id]
      );
      mainId = main.id;
      // asegurar vínculo en taller_ponentes
      await query('INSERT INTO taller_ponentes (taller_id, ponente_id, orden) VALUES (?, ?, 0) ON CONFLICT (taller_id, ponente_id) DO NOTHING', [mainId, p.id]).catch(()=>{});
    } else {
      const ins = await query(
        `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, ponente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [datos.nombre, datos.descripcion, datos.cupo, datos.duracion_hs, fecha, hora, datos.lugar, datos.disertante, datos.ponente_id]
      );
      mainId = Number(ins[0].id);
      await query('INSERT INTO taller_ponentes (taller_id, ponente_id, orden) VALUES (?, ?, 0) ON CONFLICT (taller_id, ponente_id) DO NOTHING', [mainId, p.id]).catch(()=>{});
    }

    const fecha2 = convertirFechaDia(p.fecha_dia2);
    const hora2 = String(p.horario2 || '').trim();
    if (fecha2 && hora2) {
      const parte = await queryOne('SELECT id, nombre FROM talleres WHERE pareja_id = ?', [mainId]);
      const nombreParte = `${datos.nombre} (2° parte)`.slice(0, 120);
      let parteId;
      if (parte) {
        await mutation(
          `UPDATE talleres SET nombre = ?, fecha = ?, hora = ?, lugar = ?, disertante = ?, cupo = ?, ponente_id = ? WHERE id = ?`,
          [nombreParte, fecha2, hora2, '', datos.disertante, datos.cupo, datos.ponente_id, parte.id]
        );
        parteId = parte.id;
      } else {
        const ins2 = await query(
          `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, ponente_id, pareja_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [nombreParte, datos.descripcion, datos.cupo, 3, fecha2, hora2, '', datos.disertante, datos.ponente_id, mainId]
        );
        parteId = Number(ins2[0].id);
      }
      await query('INSERT INTO taller_ponentes (taller_id, ponente_id, orden) VALUES (?, ?, 0) ON CONFLICT (taller_id, ponente_id) DO NOTHING', [parteId, p.id]).catch(()=>{});
    }
  }

  return true;
}

async function fechaDiaDesdeDia(dia) {
  const fila = await queryOne('SELECT fecha FROM dias_ponentes WHERE dia = ?', [dia]);
  return fila ? fila.fecha : '';
}

async function listarDiasPonentes() {
  return query('SELECT dia, fecha FROM dias_ponentes ORDER BY dia');
}

async function guardarDiasPonentes(dias) {
  for (const d of dias) {
    const dia = Number.parseInt(d.dia, 10);
    const fecha = String(d.fecha || '').trim();
    if (!Number.isFinite(dia) || dia <= 0) continue;
    await query(
      `INSERT INTO dias_ponentes (dia, fecha) VALUES (?, ?)
       ON CONFLICT (dia) DO UPDATE SET fecha = EXCLUDED.fecha`,
      [dia, fecha]
    );
  }
  return listarDiasPonentes();
}

// ── Configuración ─────────────────────────────────────────────────────

async function obtenerConfig(clave) {
  const fila = await queryOne('SELECT valor FROM configuracion_evento WHERE clave = ?', [clave]);
  return fila ? fila.valor : null;
}

async function obtenerTodaConfig() {
  const filas = await query('SELECT clave, valor FROM configuracion_evento ORDER BY clave');
  const config = {};
  for (const f of filas) config[f.clave] = f.valor;
  return config;
}

async function guardarConfig(clave, valor) {
  await query(
    `INSERT INTO configuracion_evento (clave, valor) VALUES (?, ?)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
    [clave, valor]
  );
}

async function guardarTodaConfig(obj) {
  for (const [clave, valor] of Object.entries(obj)) {
    await guardarConfig(clave, String(valor));
  }
}

// ── Asistentes ────────────────────────────────────────────────────────

async function contarAsistentesUnicos() {
  const fila = await queryOne('SELECT COUNT(DISTINCT i.dni) AS n FROM inscripciones i');
  return Number(fila.n);
}

// ── Acreditaciones y comidas ──────────────────────────────────────────

async function registrarAcreditacion({ dni, nombre = '', apellido = '', qrCode = '', usuario = '' }) {
  await query(
    'INSERT INTO acreditaciones (dni, nombre, apellido, qr_code, usuario) VALUES (?, ?, ?, ?, ?)',
    [dni, nombre || '', apellido || '', qrCode || '', usuario || '']
  );
}

async function contarAcreditados() {
  const fila = await queryOne('SELECT COUNT(DISTINCT dni) AS n FROM acreditaciones');
  return Number(fila.n);
}

async function listarAcreditacionesPorTaller() {
  // Unificar talleres de 2 partes: una sola fila por taller lógico (COALESCE(pareja_id, id))
  // Inscriptos = personas distintas (DNI) en cualquier parte del taller; coincide con cupo lógico.
  const filasRes = await query(
    `SELECT
       COALESCE(t.pareja_id, t.id) AS taller_id,
       MAX(CASE WHEN t.pareja_id IS NULL THEN t.nombre ELSE NULL END) AS taller,
       MAX(CASE WHEN t.pareja_id IS NULL THEN t.fecha ELSE NULL END) AS fecha,
       MAX(CASE WHEN t.pareja_id IS NULL THEN t.hora ELSE NULL END) AS hora,
       MIN(t.cupo) AS cupo,
       COUNT(DISTINCT i.dni) AS inscriptos,
       COUNT(DISTINCT CASE WHEN a.dni IS NOT NULL THEN i.dni END) AS acreditados
     FROM talleres t
     LEFT JOIN inscripciones i ON i.taller_id = t.id
     LEFT JOIN acreditaciones a ON a.dni = i.dni
     GROUP BY COALESCE(t.pareja_id, t.id)
     ORDER BY MAX(CASE WHEN t.pareja_id IS NULL THEN t.fecha ELSE NULL END), MAX(CASE WHEN t.pareja_id IS NULL THEN t.hora ELSE NULL END), MAX(CASE WHEN t.pareja_id IS NULL THEN t.nombre ELSE NULL END)`
  );
  // Normalizar nombre base (sin sufijo " (2° parte)") por si quedó algún sufijo residual
  const REG_SUFIJO = /\s*\(\s*\d+\s*[º°]\s*parte\s*\)\s*$/i;
  return filasRes.map((f) => ({
    taller_id: Number(f.taller_id),
    taller: String(f.taller || '').replace(REG_SUFIJO, '').trim() || String(f.taller || ''),
    fecha: f.fecha || '',
    hora: f.hora || '',
    cupo: Number(f.cupo),
    inscriptos: Number(f.inscriptos),
    acreditados: Number(f.acreditados),
  }));
}

async function listarBloquesBreak() {
  return query(
    `SELECT id, dia, titulo, hora_inicio, hora_fin FROM programa_bloques WHERE tipo = 'break' ORDER BY dia, hora_inicio`
  );
}

async function obtenerServicioComidaActivo(margenMs = 20 * 60 * 1000) {
  const bloques = await listarBloquesBreak();
  const ahora = Date.now();
  for (const b of bloques) {
    const d = String(b.dia || '').split('-').map(Number);
    if (d.length < 3 || d.some((n) => !Number.isFinite(n))) continue;
    const hi = String(b.hora_inicio || '').split(':').map(Number);
    const hf = String(b.hora_fin || '').split(':').map(Number);
    const inicio = new Date(d[0], d[1] - 1, d[2], hi[0] || 0, hi[1] || 0).getTime();
    const fin = new Date(d[0], d[1] - 1, d[2], hf[0] || 23, hf[1] || 59).getTime();
    if (Number.isNaN(inicio) || Number.isNaN(fin)) continue;
    if (ahora >= inicio - margenMs && ahora <= fin + margenMs) return b;
  }
  return null;
}

async function tieneAsistenciaComida(dni, bloqueId) {
  const fila = await queryOne(
    'SELECT id FROM comidas_asistencias WHERE dni = ? AND bloque_id = ?',
    [dni, bloqueId]
  );
  return Boolean(fila);
}

async function registrarAsistenciaComida(dni, bloqueId) {
  try {
    await query(
      'INSERT INTO comidas_asistencias (dni, bloque_id) VALUES (?, ?) ON CONFLICT (dni, bloque_id) DO NOTHING',
      [dni, bloqueId]
    );
    return true;
  } catch (_) {
    return false;
  }
}

async function resumenComidas() {
  const servicios = await query(
    `SELECT b.id AS bloque_id, b.dia, b.titulo, b.hora_inicio, b.hora_fin,
       COUNT(c.id) AS asistentes
     FROM programa_bloques b
     LEFT JOIN comidas_asistencias c ON c.bloque_id = b.id
     WHERE b.tipo = 'break'
     GROUP BY b.id, b.dia, b.titulo, b.hora_inicio, b.hora_fin
     ORDER BY b.dia, b.hora_inicio`
  );

  const dietas = await query(
    `SELECT c.bloque_id, COALESCE(NULLIF(x.alimentacion, ''), 'sin_restriccion') AS alimentacion,
       COUNT(*) AS cantidad
     FROM comidas_asistencias c
     JOIN (
       SELECT dni, MIN(alimentacion) AS alimentacion FROM inscripciones GROUP BY dni
     ) x ON x.dni = c.dni
     GROUP BY c.bloque_id, COALESCE(NULLIF(x.alimentacion, ''), 'sin_restriccion')`
  );

  const porAsistente = await query(
    `SELECT c.dni,
        MIN(a.primera_acreditacion) AS primera_acreditacion,
        COALESCE(MIN(p.apellido), '') AS apellido,
        COALESCE(MIN(p.nombre), '') AS nombre,
        COALESCE(MIN(p.alimentacion), 'sin_restriccion') AS alimentacion,
        SUM(CASE WHEN LOWER(b.titulo) LIKE '%desayuno%' THEN 1 ELSE 0 END) AS desayunos,
        SUM(CASE WHEN LOWER(b.titulo) LIKE '%merienda%' THEN 1 ELSE 0 END) AS meriendas,
        COUNT(*) AS total_servicios
      FROM comidas_asistencias c
      JOIN programa_bloques b ON b.id = c.bloque_id
      LEFT JOIN (
        SELECT dni, MIN(apellido) AS apellido, MIN(nombre) AS nombre, MIN(alimentacion) AS alimentacion
        FROM inscripciones GROUP BY dni
      ) p ON p.dni = c.dni
      LEFT JOIN (
        SELECT dni, MIN(registrado_en) AS primera_acreditacion
        FROM acreditaciones GROUP BY dni
      ) a ON a.dni = c.dni
      GROUP BY c.dni
      ORDER BY apellido, nombre`
  );

  // Conteo global de inscriptos a talleres por restricción alimentaria (DNI únicos)
  const inscriptosPorDietaRaw = await query(
    `SELECT COALESCE(NULLIF(alimentacion, ''), 'sin_restriccion') AS alimentacion,
        COUNT(*) AS cantidad
      FROM (SELECT dni, MIN(alimentacion) AS alimentacion FROM inscripciones GROUP BY dni) x
      GROUP BY COALESCE(NULLIF(alimentacion, ''), 'sin_restriccion')`
  );
  const inscriptosPorDieta = inscriptosPorDietaRaw.map(r => ({
    alimentacion: String(r.alimentacion || 'sin_restriccion'),
    cantidad: Number(r.cantidad) || 0,
  }));
  const totalInscriptos = inscriptosPorDieta.reduce((s, r) => s + r.cantidad, 0);

  // Listado de personas inscriptas por dieta (DNI únicos) para anticipar servicio — igual base que Inscripciones/Asistentes
  const inscriptosConDieta = await query(
    `SELECT dni,
        MIN(nombre) AS nombre,
        MIN(apellido) AS apellido,
        MIN(email) AS email,
        MIN(telefono) AS telefono,
        COALESCE(NULLIF(MIN(alimentacion), ''), 'sin_restriccion') AS alimentacion,
        COUNT(*) AS cantidad_talleres,
        STRING_AGG(t_nombre, ', ' ORDER BY t_nombre) AS talleres_nombres
      FROM (
        SELECT i.dni, i.nombre, i.apellido, i.email, i.telefono, i.alimentacion, t.nombre AS t_nombre
        FROM inscripciones i JOIN talleres t ON t.id = i.taller_id
      ) q
      GROUP BY dni
      ORDER BY MIN(apellido), MIN(nombre)`
  );
  const totalInscripcionesTalleres = inscriptosConDieta.reduce((s, r) => s + Number(r.cantidad_talleres || 0), 0);

  return { servicios, dietas, porAsistente, inscriptosPorDieta, totalInscriptos, inscriptosConDieta, totalInscripcionesTalleres };
}

// ── Pagos y cuotas ────────────────────────────────────────────────────

function formatearMonto(v) {
  return Number(v ?? 0);
}

// ── Planes automáticos según fecha de inscripción (marca temporal) ────

function parsearMarcaTemporal(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return null;
  const m = texto.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    let [, d, mes, y, h, min, s] = m;
    if (Number(mes) > 12) {
      const tmp = d;
      d = mes;
      mes = tmp;
    }
    const anio = y.length === 2 ? `20${y}` : y;
    const fecha = new Date(Number(anio), Number(mes) - 1, Number(d), Number(h) || 0, Number(min) || 0, Number(s) || 0);
    if (!Number.isNaN(fecha.getTime())) return fecha;
  }
  const fechaIso = new Date(texto);
  if (!Number.isNaN(fechaIso.getTime())) return fechaIso;
  return null;
}

function definirPlanAutomatico(fecha) {
  const mes = fecha.getMonth() + 1;
  const anio = fecha.getFullYear();
  if (mes === 5 || mes === 6) {
    return {
      nombre: 'Inscripción Mayo – Junio',
      descripcion: '3 cuotas de $30.000. Total $90.000.',
      montoTotal: 90000,
      cuotas: [
        { numero: 1, monto: 30000 },
        { numero: 2, monto: 30000 },
        { numero: 3, monto: 30000 },
      ],
    };
  }
  if (mes === 7 || mes === 8) {
    return {
      nombre: 'Inscripción Julio – Agosto',
      descripcion: '3 cuotas: 2 de $35.000 y 1 de $40.000. Total $110.000.',
      montoTotal: 110000,
      cuotas: [
        { numero: 1, monto: 35000 },
        { numero: 2, monto: 35000 },
        { numero: 3, monto: 40000 },
      ],
    };
  }
  if (mes === 9 || mes === 10) {
    return {
      nombre: 'Inscripción Septiembre – Octubre',
      descripcion: '2 cuotas de $65.000. Total $130.000. Fecha tope de la 2ª cuota: 05/10.',
      montoTotal: 130000,
      cuotas: [
        { numero: 1, monto: 65000 },
        { numero: 2, monto: 65000, fecha_tope: `${anio}-10-05` },
      ],
    };
  }
  return null;
}

const NOMBRES_PLANES_AUTOMATICOS = ['Inscripción Mayo – Junio', 'Inscripción Julio – Agosto', 'Inscripción Septiembre – Octubre'];

function normalizarDetalleCuotas(cuotasCol, cantidadCuotas, montoTotal) {
  let arr = null;
  if (Array.isArray(cuotasCol)) arr = cuotasCol;
  else if (typeof cuotasCol === 'string') {
    try { arr = JSON.parse(cuotasCol); } catch (_) { arr = null; }
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    const n = Math.max(1, Number(cantidadCuotas) || 1);
    const m = Number(montoTotal) || 0;
    arr = Array.from({ length: n }, (_, i) => ({ numero: i + 1, monto: n ? m / n : 0 }));
  }
  return arr.map((c, i) => ({
    numero: Number(c.numero) || i + 1,
    monto: Number(c.monto) || 0,
    fecha_tope: c.fecha_tope || '',
  }));
}

async function asegurarPlanAutomatico(def) {
  const plan = await queryOne('SELECT id FROM planes_pago WHERE nombre = ? ORDER BY id LIMIT 1', [def.nombre]);
  if (!plan) {
    const res = await query(
      `INSERT INTO planes_pago (nombre, descripcion, monto_total, cantidad_cuotas, cuotas, activo)
       VALUES (?, ?, ?, ?, ?, TRUE) RETURNING id`,
      [def.nombre, def.descripcion, formatearMonto(def.montoTotal), def.cuotas.length, JSON.stringify(def.cuotas)]
    );
    return { id: Number(res[0].id), nombre: def.nombre };
  }
  await mutation(
    `UPDATE planes_pago SET descripcion = ?, monto_total = ?, cantidad_cuotas = ?, cuotas = ?, activo = TRUE WHERE id = ?`,
    [def.descripcion, formatearMonto(def.montoTotal), def.cuotas.length, JSON.stringify(def.cuotas), plan.id]
  );
  return { id: Number(plan.id), nombre: def.nombre };
}

async function asignarPlanAutomaticoAsistente(dni, marcaTemporal) {
  const dniLimpio = String(dni || '').trim();
  if (!/^\d{7,8}$/.test(dniLimpio)) return null;
  const fecha = parsearMarcaTemporal(marcaTemporal);
  if (!fecha) return null;
  const def = definirPlanAutomatico(fecha);
  const existentes = await query(
    `SELECT ap.id, p.nombre FROM asistente_planes ap JOIN planes_pago p ON p.id = ap.plan_id WHERE ap.dni = ?`,
    [dniLimpio]
  );
  const tienePlanManual = existentes.length > 0 && existentes.every((e) => !NOMBRES_PLANES_AUTOMATICOS.includes(e.nombre));
  if (tienePlanManual) return { planId: null, nombre: null, manual: true };
  const plan = def ? await asegurarPlanAutomatico(def) : null;
  await transaction(async (run) => {
    for (const e of existentes) {
      if (NOMBRES_PLANES_AUTOMATICOS.includes(e.nombre)) {
        await run('DELETE FROM asistente_planes WHERE id = ?', [e.id]);
      }
    }
    if (plan) {
      await run(
        `INSERT INTO asistente_planes (dni, plan_id, monto_total, cantidad_cuotas, cuotas)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (dni, plan_id) DO UPDATE
           SET monto_total = EXCLUDED.monto_total,
               cantidad_cuotas = EXCLUDED.cantidad_cuotas,
               cuotas = EXCLUDED.cuotas`,
        [dniLimpio, plan.id, formatearMonto(def.montoTotal), def.cuotas.length, JSON.stringify(def.cuotas)]
      );
    }
  });
  await sincronizarEstadoPagoPorDni(dniLimpio);
  return plan ? { planId: Number(plan.id), nombre: def.nombre, manual: false } : { planId: null, nombre: null, manual: false };
}

async function asignarPlanesAutomaticos(personas) {
  for (const p of personas || []) {
    try {
      await asignarPlanAutomaticoAsistente(p.dni, p.marca_temporal);
    } catch (e) {
      console.error('[Plan automático] No se pudo asignar a DNI', p.dni, ':', e.message);
    }
  }
}

async function listarPlanesPago() {
  try {
    const planes = await query(
      `SELECT id, nombre, descripcion, monto_total, cantidad_cuotas, cuotas, activo, es_tallerista, creado_en
       FROM planes_pago ORDER BY id`
    );
    return planes.map((p) => ({
      ...p,
      id: Number(p.id),
      monto_total: Number(p.monto_total),
      cantidad_cuotas: Number(p.cantidad_cuotas),
      es_tallerista: Boolean(p.es_tallerista),
      cuotas: normalizarDetalleCuotas(p.cuotas, p.cantidad_cuotas, p.monto_total),
    }));
  } catch (e) {
    if (e.code === '42703' && String(e.message).includes('es_tallerista')) {
      const planes = await query(
        `SELECT id, nombre, descripcion, monto_total, cantidad_cuotas, cuotas, activo, creado_en
         FROM planes_pago ORDER BY id`
      );
      return planes.map((p) => ({
        ...p,
        id: Number(p.id),
        monto_total: Number(p.monto_total),
        cantidad_cuotas: Number(p.cantidad_cuotas),
        es_tallerista: false,
        cuotas: normalizarDetalleCuotas(p.cuotas, p.cantidad_cuotas, p.monto_total),
      }));
    }
    throw e;
  }
}

async function crearPlanPago({ nombre, descripcion = '', montoTotal = 0, cantidadCuotas = 1, cuotas = null, esTallerista = false }) {
  return mutation(
    `INSERT INTO planes_pago (nombre, descripcion, monto_total, cantidad_cuotas, cuotas, es_tallerista) VALUES (?, ?, ?, ?, ?, ?)`,
    [nombre, descripcion, formatearMonto(montoTotal), Number(cantidadCuotas) || 1, cuotas ? JSON.stringify(cuotas) : null, esTallerista ? true : false]
  );
}

async function actualizarPlanPago(id, { nombre, descripcion, montoTotal, cantidadCuotas, activo, cuotas = null, esTallerista = false }) {
  const existe = await queryOne('SELECT id FROM planes_pago WHERE id = ?', [id]);
  if (!existe) throw new HttpError(404, 'Plan no encontrado.');
  await mutation(
    'UPDATE planes_pago SET nombre = ?, descripcion = ?, monto_total = ?, cantidad_cuotas = ?, cuotas = ?, activo = ?, es_tallerista = ? WHERE id = ?',
    [nombre, descripcion, formatearMonto(montoTotal), Number(cantidadCuotas) || 1, cuotas ? JSON.stringify(cuotas) : null, activo ? true : false, esTallerista ? true : false, id]
  );
}

async function eliminarPlanPago(id) {
  await mutation('DELETE FROM planes_pago WHERE id = ?', [id]);
}

function aplicarDescuentoTalleristaACuotas(cuotasRaw, factor) {
  if (factor === 1) return cuotasRaw ? (typeof cuotasRaw === 'string' ? cuotasRaw : JSON.stringify(cuotasRaw)) : null;
  let arr = null;
  if (Array.isArray(cuotasRaw)) arr = cuotasRaw;
  else if (typeof cuotasRaw === 'string') { try { arr = JSON.parse(cuotasRaw); } catch (_) { arr = null; } }
  else if (cuotasRaw && typeof cuotasRaw === 'object') arr = cuotasRaw;
  if (!Array.isArray(arr) || arr.length === 0) return cuotasRaw ? (typeof cuotasRaw === 'string' ? cuotasRaw : JSON.stringify(cuotasRaw)) : null;
  const conDescuento = arr.map((c) => ({ ...c, monto: Number(c.monto || 0) * factor }));
  return JSON.stringify(conDescuento);
}

async function asignarPlanAsistente(dni, planId, esTallerista = false) {
  if (!/^\d{7,8}$/.test(String(dni || '').trim())) throw new HttpError(400, 'DNI inválido.');
  const plan = await queryOne('SELECT id, monto_total, cantidad_cuotas, cuotas, es_tallerista FROM planes_pago WHERE id = ?', [planId]);
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  const dniLimpio = String(dni).trim();
  const factor = esTallerista ? 0.5 : 1;
  // Si el plan base ya es de tallerista, no volver a descontar si esTallerista ya true - pero si plan es_tallerista, el monto del plan ya es el base; el asistente paga 50% con flag
  const montoFinal = formatearMonto(Number(plan.monto_total) * factor);
  const cuotasFinal = aplicarDescuentoTalleristaACuotas(plan.cuotas, factor);
  await transaction(async (run) => {
    const previos = await run(
      `SELECT ap.id, p.nombre FROM asistente_planes ap JOIN planes_pago p ON p.id = ap.plan_id WHERE ap.dni = ?`,
      [dniLimpio]
    );
    for (const pr of previos) {
      if (NOMBRES_PLANES_AUTOMATICOS.includes(pr.nombre)) {
        await run('DELETE FROM asistente_planes WHERE id = ?', [pr.id]);
      }
    }
    await run(
      'INSERT INTO asistente_planes (dni, plan_id, monto_total, cantidad_cuotas, cuotas, es_tallerista) VALUES (?, ?, ?, ?, ?, ?)',
      [dniLimpio, planId, montoFinal, Number(plan.cantidad_cuotas) || 1, cuotasFinal, esTallerista ? true : false]
    );
  });
  await sincronizarEstadoPagoPorDni(dniLimpio);
}

async function actualizarEsTalleristaAsistente(asistentePlanId, esTallerista) {
  const existente = await queryOne('SELECT id, plan_id, monto_total, cuotas, es_tallerista FROM asistente_planes WHERE id = ?', [asistentePlanId]);
  if (!existente) throw new HttpError(404, 'Plan de asistente no encontrado.');
  if (Boolean(existente.es_tallerista) === Boolean(esTallerista)) return existente;
  const plan = await queryOne('SELECT monto_total, cuotas FROM planes_pago WHERE id = ?', [existente.plan_id]);
  if (!plan) throw new HttpError(404, 'Plan base no encontrado.');
  const factor = esTallerista ? 0.5 : 1;
  // Si se activa tallerista, partir del monto base del plan; si se desactiva, restaurar base
  // Para cambios, recalcular desde plan base en vez de monto actual para evitar doble división
  const montoFinal = formatearMonto(Number(plan.monto_total) * factor);
  const cuotasFinal = aplicarDescuentoTalleristaACuotas(plan.cuotas, factor);
  await mutation('UPDATE asistente_planes SET monto_total = ?, cuotas = ?, es_tallerista = ? WHERE id = ?', [montoFinal, cuotasFinal, esTallerista ? true : false, asistentePlanId]);
  // sincronizar estado pago (por si cambió cantidad cuotas? no, solo monto)
  const fila = await queryOne('SELECT dni FROM asistente_planes WHERE id = ?', [asistentePlanId]);
  if (fila) await sincronizarEstadoPagoPorDni(String(fila.dni).trim());
  return { ...existente, monto_total: montoFinal, es_tallerista: Boolean(esTallerista) };
}

async function listarPagos() {
  const planes = query(`SELECT id, nombre, monto_total, cantidad_cuotas, es_tallerista FROM planes_pago`).catch((e) => {
    if (e.code === '42703' && String(e.message).includes('es_tallerista')) {
      return query(`SELECT id, nombre, monto_total, cantidad_cuotas FROM planes_pago`);
    }
    throw e;
  });
  const asistentes = query(
    `SELECT a.id AS asistente_plan_id, a.dni, a.plan_id, a.monto_total, a.cantidad_cuotas, a.cuotas, a.es_tallerista,
            COALESCE(e.nombre, '') AS nombre, COALESCE(e.apellido, '') AS apellido,
            COALESCE(e.email, '') AS email, COALESCE(e.telefono, '') AS telefono,
            COALESCE(e.id, 0) AS encuentro_id,
            COALESCE(e.comprobante, '') AS comprobante,
            COALESCE(e.comprobante_nombre, '') AS comprobante_nombre,
            COALESCE(e.comprobante_tipo, '') AS comprobante_tipo
     FROM asistente_planes a
     LEFT JOIN encuentro_inscripciones e ON e.dni = a.dni
     ORDER BY e.apellido, e.nombre, a.dni`
  ).catch(async (e) => {
    if (e.code === '42703' && String(e.message).includes('es_tallerista')) {
      return query(
        `SELECT a.id AS asistente_plan_id, a.dni, a.plan_id, a.monto_total, a.cantidad_cuotas, a.cuotas,
                COALESCE(e.nombre, '') AS nombre, COALESCE(e.apellido, '') AS apellido,
                COALESCE(e.email, '') AS email, COALESCE(e.telefono, '') AS telefono,
                COALESCE(e.id, 0) AS encuentro_id,
                COALESCE(e.comprobante, '') AS comprobante,
                COALESCE(e.comprobante_nombre, '') AS comprobante_nombre,
                COALESCE(e.comprobante_tipo, '') AS comprobante_tipo
         FROM asistente_planes a
         LEFT JOIN encuentro_inscripciones e ON e.dni = a.dni
         ORDER BY e.apellido, e.nombre, a.dni`
      );
    }
    throw e;
  });
  const pagos = query(
    `SELECT asistente_plan_id, numero_cuota, monto, fecha_pago, comprobante, comprobante_nombre, comprobante_tipo FROM pagos_cuotas ORDER BY numero_cuota`
  ).catch(async (e) => {
    if (e.code === '42703' && String(e.message).includes('comprobante')) {
      const fallback = await query(`SELECT asistente_plan_id, numero_cuota, monto, fecha_pago FROM pagos_cuotas ORDER BY numero_cuota`);
      return fallback.map(r => ({ ...r, comprobante: '', comprobante_nombre: '', comprobante_tipo: '' }));
    }
    throw e;
  });
  const [planesRes, asistentesRes, pagosRes] = await Promise.all([planes, asistentes, pagos]);

  const pagosPorPlan = new Map();
  for (const p of pagosRes) {
    const clave = Number(p.asistente_plan_id);
    if (!pagosPorPlan.has(clave)) pagosPorPlan.set(clave, []);
    pagosPorPlan.get(clave).push({
      numero: Number(p.numero_cuota),
      monto: formatearMonto(p.monto),
      fecha: p.fecha_pago || '',
      comprobante: p.comprobante || '',
      comprobanteNombre: p.comprobante_nombre || '',
      comprobanteTipo: p.comprobante_tipo || '',
      tieneComprobante: Boolean(p.comprobante),
    });
  }

  const planPorId = new Map(planesRes.map((pl) => [Number(pl.id), pl]));

  return asistentesRes.map((a) => ({
    asistentePlanId: Number(a.asistente_plan_id),
    dni: a.dni,
    nombre: a.nombre,
    apellido: a.apellido,
    email: a.email,
    telefono: a.telefono,
    encuentroId: a.encuentro_id ? Number(a.encuentro_id) : null,
    comprobante: a.comprobante || '',
    comprobanteNombre: a.comprobante_nombre || '',
    comprobanteTipo: a.comprobante_tipo || '',
    tieneComprobante: Boolean(a.comprobante),
    planId: Number(a.plan_id),
    planNombre: planPorId.get(Number(a.plan_id))?.nombre || '',
    montoTotal: formatearMonto(a.monto_total),
    cantidadCuotas: Number(a.cantidad_cuotas) || 1,
    es_tallerista: Boolean(a.es_tallerista),
    esTallerista: Boolean(a.es_tallerista),
    cuotasDetalle: normalizarDetalleCuotas(a.cuotas, a.cantidad_cuotas, a.monto_total),
    cuotas: pagosPorPlan.get(Number(a.asistente_plan_id)) || [],
  }));
}

async function registrarPagoCuota(asistentePlanId, numeroCuota, monto, fechaPago) {
  const plan = await queryOne('SELECT id, dni, monto_total, cantidad_cuotas FROM asistente_planes WHERE id = ?', [asistentePlanId]);
  if (!plan) throw new HttpError(404, 'Plan de asistente no encontrado.');
  if (Number(numeroCuota) < 1 || Number(numeroCuota) > Number(plan.cantidad_cuotas)) {
    throw new HttpError(400, `La cuota debe estar entre 1 y ${plan.cantidad_cuotas}.`);
  }
  const fecha = String(fechaPago || '').trim() || null;
  await mutation(
    'INSERT INTO pagos_cuotas (asistente_plan_id, numero_cuota, monto, fecha_pago) VALUES (?, ?, ?, ?) ON CONFLICT (asistente_plan_id, numero_cuota) DO UPDATE SET monto = EXCLUDED.monto, fecha_pago = EXCLUDED.fecha_pago',
    [asistentePlanId, Number(numeroCuota), formatearMonto(monto), fecha]
  );
  await sincronizarEstadoPagoPorDni(String(plan.dni).trim());
}

async function eliminarPagoCuota(asistentePlanId, numeroCuota) {
  const plan = await queryOne('SELECT dni FROM asistente_planes WHERE id = ?', [asistentePlanId]);
  await mutation('DELETE FROM pagos_cuotas WHERE asistente_plan_id = ? AND numero_cuota = ?', [asistentePlanId, Number(numeroCuota)]);
  if (plan) await sincronizarEstadoPagoPorDni(String(plan.dni).trim());
}

async function sincronizarEstadoPagoPorDni(dni) {
  const aps = await query('SELECT id, monto_total, cantidad_cuotas, cuotas FROM asistente_planes WHERE dni = ?', [dni]);
  if (aps.length === 0) return;
  let totalEsperado = 0;
  let totalPagado = 0;
  let todasCompletas = true;
  for (const ap of aps) {
    const detalle = normalizarDetalleCuotas(ap.cuotas, ap.cantidad_cuotas, ap.monto_total);
    const esperadoPlan = detalle.reduce((s,c)=> s + (Number(c.monto)||0), 0);
    totalEsperado += esperadoPlan;
    const pagos = await query('SELECT numero_cuota, monto FROM pagos_cuotas WHERE asistente_plan_id = ?', [ap.id]);
    const pagosMap = new Map(pagos.map(p=> [Number(p.numero_cuota), Number(p.monto)||0]));
    totalPagado += pagos.reduce((s,p)=> s + (Number(p.monto)||0), 0);
    for (const c of detalle) {
      const montoPagado = pagosMap.get(Number(c.numero));
      const esperado = Number(c.monto) || 0;
      if (montoPagado === undefined || montoPagado + 0.01 < esperado) {
        todasCompletas = false;
      }
    }
    // si hay pagos de cuotas no esperadas (fuera de detalle) igual cuentan, pero ya se sumaron
  }
  const estado = totalEsperado === 0 ? 'no_pagado' : (todasCompletas && totalPagado + 0.01 >= totalEsperado) ? 'pago_completo' : totalPagado > 0 ? 'pago_parcial' : 'no_pagado';
  await mutation('UPDATE inscripciones SET estado_pago = ? WHERE dni = ?', [estado, dni]);
  return estado;
}

async function actualizarComprobantePorId(id, comprobante, comprobanteNombre, comprobanteTipo) {
  const fila = await queryOne('SELECT id, comprobante FROM encuentro_inscripciones WHERE id = ?', [id]);
  if (!fila) throw new HttpError(404, 'Registro del encuentro no encontrado.');
  await mutation('UPDATE encuentro_inscripciones SET comprobante = ?, comprobante_nombre = ?, comprobante_tipo = ? WHERE id = ?', [String(comprobante||''), String(comprobanteNombre||''), String(comprobanteTipo||''), id]);
  return { id: Number(id), comprobante: String(comprobante||'') };
}

async function actualizarComprobantePorDni(dni, comprobante, comprobanteNombre, comprobanteTipo) {
  const dniLimpio = String(dni||'').replace(/\D/g,'');
  if (!/^\d{7,8}$/.test(dniLimpio)) throw new HttpError(400, 'DNI inválido (7 u 8 dígitos).');
  const existente = await queryOne('SELECT id FROM encuentro_inscripciones WHERE dni = ?', [dniLimpio]);
  if (existente) {
    await mutation('UPDATE encuentro_inscripciones SET comprobante = ?, comprobante_nombre = ?, comprobante_tipo = ? WHERE dni = ?', [String(comprobante||''), String(comprobanteNombre||''), String(comprobanteTipo||''), dniLimpio]);
    return { id: Number(existente.id), dni: dniLimpio, creado: false };
  }
  // Si no existe en encuentro, crear registro mínimo tomando datos de inscripciones si existe
  const insc = await queryOne('SELECT nombre, apellido, email, telefono FROM inscripciones WHERE dni = ? LIMIT 1', [dniLimpio]);
  const nombre = insc ? insc.nombre : '';
  const apellido = insc ? insc.apellido : '';
  const email = insc ? insc.email : '';
  const telefono = insc ? insc.telefono : '';
  // Si no hay inscripción tampoco, crear con datos mínimos (el admin luego puede completar)
  const filas = await query(
    `INSERT INTO encuentro_inscripciones (dni, nombre, apellido, email, telefono, comprobante, comprobante_nombre, comprobante_tipo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [dniLimpio, nombre, apellido, email, telefono, String(comprobante||''), String(comprobanteNombre||''), String(comprobanteTipo||'')]
  );
  const nuevoId = filas[0] ? Number(filas[0].id) : null;
  return { id: nuevoId, dni: dniLimpio, creado: true };
}

async function actualizarAsistentePlan(id, { dni, planId, esTallerista }) {
  const existente = await queryOne('SELECT id, dni, plan_id FROM asistente_planes WHERE id = ?', [id]);
  if (!existente) throw new HttpError(404, 'Registro de pago no encontrado.');
  const dniLimpio = String(dni || existente.dni).replace(/\D/g,'');
  if (!/^\d{7,8}$/.test(dniLimpio)) throw new HttpError(400, 'DNI inválido (7 u 8 dígitos).');
  // Validar unicidad: si cambia DNI o plan, verificar no duplique (dni, plan_id)
  const planIdFinal = planId ? Number(planId) : Number(existente.plan_id);
  if (!planIdFinal || !Number.isInteger(planIdFinal) || planIdFinal <= 0) throw new HttpError(400, 'Plan inválido.');
  const plan = await queryOne('SELECT id, monto_total, cantidad_cuotas, cuotas FROM planes_pago WHERE id = ?', [planIdFinal]);
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  // Si DNI cambió, verificar que no exista otro registro con mismo dni+plan
  if (dniLimpio !== existente.dni || planIdFinal !== Number(existente.plan_id)) {
    const dup = await queryOne('SELECT id FROM asistente_planes WHERE dni = ? AND plan_id = ? AND id <> ?', [dniLimpio, planIdFinal, id]);
    if (dup) throw new HttpError(409, 'Ya existe ese DNI con ese plan.');
  }
  const factor = esTallerista ? 0.5 : 1;
  const montoFinal = formatearMonto(Number(plan.monto_total) * factor);
  const cuotasFinal = aplicarDescuentoTalleristaACuotas(plan.cuotas, factor);
  await mutation('UPDATE asistente_planes SET dni = ?, plan_id = ?, monto_total = ?, cantidad_cuotas = ?, cuotas = ?, es_tallerista = ? WHERE id = ?', [dniLimpio, planIdFinal, montoFinal, Number(plan.cantidad_cuotas)||1, cuotasFinal, esTallerista ? true : false, id]);
  if (dniLimpio !== existente.dni) {
    // Ajustar sincronización de estado pago para ambos DNIs
    await sincronizarEstadoPagoPorDni(dniLimpio).catch(()=>{});
    await sincronizarEstadoPagoPorDni(String(existente.dni)).catch(()=>{});
  } else {
    await sincronizarEstadoPagoPorDni(dniLimpio).catch(()=>{});
  }
  return { id: Number(id), dni: dniLimpio, planId: planIdFinal };
}

async function eliminarAsistentePlan(id) {
  const existente = await queryOne('SELECT id, dni FROM asistente_planes WHERE id = ?', [id]);
  if (!existente) throw new HttpError(404, 'Registro de pago no encontrado.');
  await mutation('DELETE FROM asistente_planes WHERE id = ?', [id]);
  await sincronizarEstadoPagoPorDni(String(existente.dni)).catch(()=>{});
  return true;
}

async function actualizarComprobanteCuota(asistentePlanId, numeroCuota, comprobante, comprobanteNombre, comprobanteTipo) {
  const ap = await queryOne('SELECT id, dni, cantidad_cuotas, monto_total, cuotas FROM asistente_planes WHERE id = ?', [asistentePlanId]);
  if (!ap) throw new HttpError(404, 'Plan de asistente no encontrado.');
  const num = Number(numeroCuota);
  if (!Number.isInteger(num) || num < 1 || num > Number(ap.cantidad_cuotas)) throw new HttpError(400, `La cuota debe estar entre 1 y ${ap.cantidad_cuotas}.`);
  const detalle = normalizarDetalleCuotas(ap.cuotas, ap.cantidad_cuotas, ap.monto_total);
  const esperado = detalle.find(c => Number(c.numero) === num);
  const montoEsperado = esperado ? Number(esperado.monto) : (Number(ap.monto_total) || 0) / (Number(ap.cantidad_cuotas) || 1);
  const existente = await queryOne('SELECT id, monto, fecha_pago FROM pagos_cuotas WHERE asistente_plan_id = ? AND numero_cuota = ?', [asistentePlanId, num]);
  const hoy = new Date().toISOString().slice(0,10);
  if (existente) {
    const montoActual = Number(existente.monto) || 0;
    const fechaActual = existente.fecha_pago;
    const montoFinal = montoActual > 0 ? montoActual : formatearMonto(montoEsperado);
    const fechaFinal = fechaActual || hoy;
    await mutation('UPDATE pagos_cuotas SET comprobante = ?, comprobante_nombre = ?, comprobante_tipo = ?, monto = ?, fecha_pago = ? WHERE asistente_plan_id = ? AND numero_cuota = ?', [String(comprobante||''), String(comprobanteNombre||''), String(comprobanteTipo||''), montoFinal, fechaFinal, asistentePlanId, num]);
  } else {
    await mutation('INSERT INTO pagos_cuotas (asistente_plan_id, numero_cuota, monto, fecha_pago, comprobante, comprobante_nombre, comprobante_tipo) VALUES (?, ?, ?, ?, ?, ?, ?)', [asistentePlanId, num, formatearMonto(montoEsperado), hoy, String(comprobante||''), String(comprobanteNombre||''), String(comprobanteTipo||'')]);
  }
  await sincronizarEstadoPagoPorDni(String(ap.dni)).catch(()=>{});
  return { asistentePlanId: Number(asistentePlanId), numeroCuota: num, comprobante: String(comprobante||'') };
}

async function eliminarComprobanteCuota(asistentePlanId, numeroCuota) {
  const fila = await queryOne('SELECT id, comprobante FROM pagos_cuotas WHERE asistente_plan_id = ? AND numero_cuota = ?', [asistentePlanId, Number(numeroCuota)]);
  if (!fila) throw new HttpError(404, 'Cuota no encontrada.');
  await mutation('UPDATE pagos_cuotas SET comprobante = ?, comprobante_nombre = ?, comprobante_tipo = ? WHERE asistente_plan_id = ? AND numero_cuota = ?', ['', '', '', asistentePlanId, Number(numeroCuota)]);
  return true;
}

// ── Notificaciones ──────────────────────────────────────────────────

const EPOCH_FECHA_SQL = "round(extract(epoch from creado_en AT TIME ZONE current_setting('TimeZone')))";

const TZ_SALTA = 'America/Argentina/Salta';
function formatearFechaServer(epoch) {
  const d = new Date(Number(epoch) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  // Fecha y hora en Salta con segundos HH:MM:SS
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ_SALTA,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(d).replace(',', '');
}

async function listarNotificaciones() {
  const filas = await query(`SELECT id, titulo, mensaje, tipo, activa, creado_por, creado_en, ${EPOCH_FECHA_SQL} AS creado_en_epoch FROM notificaciones ORDER BY id DESC`);
  return filas.map((f) => ({
    ...f,
    id: Number(f.id),
    activa: Boolean(f.activa),
    creado_en_texto: formatearFechaServer(f.creado_en_epoch),
  }));
}

async function listarNotificacionesActivas(usuario = '') {
  const filas = await query(
    `SELECT n.id, n.titulo, n.mensaje, n.tipo, n.creado_en,
       ${EPOCH_FECHA_SQL} AS creado_en_epoch,
       CASE WHEN l.id IS NULL THEN FALSE ELSE TRUE END AS leida
     FROM notificaciones n
     LEFT JOIN notificaciones_leidas l
       ON l.notificacion_id = n.id AND l.usuario = ?
     WHERE n.activa = TRUE
     ORDER BY n.id DESC`,
    [usuario]
  );
  return filas.map((f) => ({
    ...f,
    id: Number(f.id),
    leida: Boolean(f.leida),
    creado_en_texto: formatearFechaServer(f.creado_en_epoch),
  }));
}

async function contarNotificacionesSinLeer(usuario) {
  const fila = await queryOne(
    `SELECT COUNT(*) AS n FROM notificaciones n
     WHERE n.activa = TRUE
       AND NOT EXISTS (
         SELECT 1 FROM notificaciones_leidas l
         WHERE l.notificacion_id = n.id AND l.usuario = ?
       )`,
    [usuario]
  );
  return Number(fila.n);
}

async function marcarNotificacionLeida(usuario, notificacionId) {
  await query(
    'INSERT INTO notificaciones_leidas (usuario, notificacion_id, leido_en) VALUES (?, ?, NOW()) ON CONFLICT (usuario, notificacion_id) DO UPDATE SET leido_en = NOW()',
    [usuario, notificacionId]
  );
}

async function marcarTodasNotificacionesLeidas(usuario) {
  await query(
    `INSERT INTO notificaciones_leidas (usuario, notificacion_id, leido_en)
     SELECT ?, id, NOW() FROM notificaciones WHERE activa = TRUE
     ON CONFLICT (usuario, notificacion_id) DO UPDATE SET leido_en = NOW()`,
    [usuario]
  );
}

async function listarNotificacionLectores(notificacionId) {
  return query(
    `SELECT l.usuario, l.leido_en, COALESCE(u.nombre,'') as nombre, COALESCE(u.rol,'') as rol
     FROM notificaciones_leidas l LEFT JOIN usuarios u ON u.username=l.usuario
     WHERE l.notificacion_id=? ORDER BY l.leido_en DESC`,
    [notificacionId]
  );
}

async function crearNotificacion({ titulo, mensaje, tipo = 'info', activa = true, creadoPor = '' }) {
  const filas = await query(
    'INSERT INTO notificaciones (titulo, mensaje, tipo, activa, creado_por) VALUES (?, ?, ?, ?, ?) RETURNING id',
    [titulo, mensaje, tipo, activa, creadoPor]
  );
  return Number(filas[0].id);
}

async function actualizarNotificacion(id, { titulo, mensaje, tipo, activa }) {
  const existe = await queryOne('SELECT id FROM notificaciones WHERE id = ?', [id]);
  if (!existe) throw new HttpError(404, 'Notificación no encontrada.');
  await mutation(
    'UPDATE notificaciones SET titulo = ?, mensaje = ?, tipo = ?, activa = ? WHERE id = ?',
    [titulo, mensaje, tipo, activa, id]
  );
  return true;
}

async function eliminarNotificacion(id) {
  const res = await mutation('DELETE FROM notificaciones WHERE id = ?', [id]);
  if (!res.filasAfectadas) throw new HttpError(404, 'Notificación no encontrada.');
  return true;
}

// ── Certificados ────────────────────────────────────────────────────────
async function listarCertificados() {
  try {
    return await query('SELECT id, codigo, tipo, dni, ponente_id, nombre, apellido, email, detalle, talleres_ids, qr_data, hash_firma, emitido_por, creado_en FROM certificados ORDER BY creado_en DESC, id DESC');
  } catch (e) {
    if (e.code === '42P01') return [];
    throw e;
  }
}
async function buscarCertificadoPorCodigo(codigo) {
  return queryOne('SELECT id, codigo, tipo, dni, ponente_id, nombre, apellido, email, detalle, talleres_ids, qr_data, hash_firma, emitido_por, creado_en FROM certificados WHERE codigo = ?', [codigo]);
}
async function buscarCertificadoPorId(id) {
  return queryOne('SELECT id, codigo, tipo, dni, ponente_id, nombre, apellido, email, detalle, talleres_ids, qr_data, hash_firma, emitido_por, creado_en FROM certificados WHERE id = ?', [id]);
}
async function crearCertificado({ codigo, tipo, dni = null, ponenteId = null, nombre, apellido, email = '', detalle = {}, talleresIds = '', qrData = '', hashFirma = '', emitidoPor = '' }) {
  const filas = await query(
    'INSERT INTO certificados (codigo, tipo, dni, ponente_id, nombre, apellido, email, detalle, talleres_ids, qr_data, hash_firma, emitido_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [codigo, tipo, dni, ponenteId, nombre, apellido, email, JSON.stringify(detalle), talleresIds, qrData, hashFirma, emitidoPor]
  );
  return Number(filas[0].id);
}
async function eliminarCertificado(id) {
  const res = await mutation('DELETE FROM certificados WHERE id = ?', [id]);
  if (!res.filasAfectadas) throw new HttpError(404, 'Certificado no encontrado.');
  return true;
}
async function verificarElegibilidadAsistente(dni) {
  const inscripciones = await query(
    `SELECT i.taller_id, t.nombre, t.fecha, t.hora FROM inscripciones i JOIN talleres t ON t.id=i.taller_id WHERE i.dni=? ORDER BY t.fecha, t.hora`,
    [dni]
  );
  if (inscripciones.length === 0) return { elegible: false, motivo: 'Sin inscripciones a talleres', inscripciones: [], asistencias: [] };
  const asistencias = [];
  let todasOk = true;
  for (const ins of inscripciones) {
    let rows = [];
    try { rows = await query('SELECT tipo FROM taller_asistencias WHERE dni=? AND taller_id=?', [dni, ins.taller_id]); } catch (e) { if (e.code !== '42P01') throw e; }
    const tieneIngreso = rows.some(r=> r.tipo==='ingreso');
    const tieneEgreso = rows.some(r=> r.tipo==='egreso');
    const ok = tieneIngreso && tieneEgreso;
    if (!ok) todasOk = false;
    asistencias.push({ taller_id: Number(ins.taller_id), taller: ins.nombre, fecha: ins.fecha||'', hora: ins.hora||'', tieneIngreso, tieneEgreso, completo: ok });
  }
  return { elegible: todasOk && asistencias.length>0, inscripciones, asistencias };
}

module.exports = {
  HttpError,
  query,
  queryOne,
  transaction,
  mutation,
  initPool,
  listarTalleres,
  obtenerTaller,
  setTallerPonentes,
  crearTaller,
  actualizarTaller,
  eliminarTaller,
  crearInscripcion,
  listarInscripciones,
  listarAsistentes,
  actualizarAsistente,
  cambiarEstadoPagoInscripcion,
  eliminarInscripcion,
  eliminarInscripcionesPorDni,
  registrarEvento,
  listarEventos,
  contarEventos,
  cambiarTallerInscripcion,
  reemplazarTalleresInscripcion,
  hayUsuarios,
  crearUsuario,
  buscarUsuario,
  listarUsuarios,
  actualizarUsuario,
  eliminarUsuario,
  guardarQrInscripcion,
  buscarAcreditacionPorDni,
  esAsistenteEncuentro,
  buscarEncuentroPorDni,
  listarInscripcionesPorDni,
  importarEncuentro,
  crearEncuentroInscripcion,
  listarEncuentro,
  actualizarEncuentroPersona,
  ocultarEncuentroPersona,
  contarEncuentro,
  vaciarEncuentro,
  listarPrograma,
  listarDiasPrograma,
  obtenerBloque,
  crearBloque,
  actualizarBloque,
  eliminarBloque,
  setBloquePonentes,
  listarBloquePonentes,
  listarPonentes,
  listarPonentesConFecha,
  obtenerPonente,
  obtenerPonentePorNombre,
  crearPonente,
  actualizarPonente,
  eliminarPonente,
  listarDiasPonentes,
  guardarDiasPonentes,
  sincronizarTalleresDesdePonentes,
  convertirFechaDia,
  obtenerConfig,
  obtenerTodaConfig,
  guardarConfig,
  guardarTodaConfig,
  contarAsistentesUnicos,
  registrarAcreditacion,
  contarAcreditados,
  listarAcreditacionesPorTaller,
  listarBloquesBreak,
  obtenerServicioComidaActivo,
  tieneAsistenciaComida,
  registrarAsistenciaComida,
  resumenComidas,
  listarPlanesPago,
  crearPlanPago,
  actualizarPlanPago,
  eliminarPlanPago,
  asignarPlanAsistente,
  actualizarEsTalleristaAsistente,
  listarPagos,
  registrarPagoCuota,
  eliminarPagoCuota,
  sincronizarEstadoPagoPorDni,
  parsearMarcaTemporal,
  definirPlanAutomatico,
  asegurarPlanAutomatico,
  asignarPlanAutomaticoAsistente,
  asignarPlanesAutomaticos,
  getComprobanteUrl,
  actualizarComprobantePorId,
  actualizarComprobantePorDni,
  actualizarAsistentePlan,
  eliminarAsistentePlan,
  actualizarComprobanteCuota,
  eliminarComprobanteCuota,
  listarNotificaciones,
  listarNotificacionesActivas,
  contarNotificacionesSinLeer,
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
  listarNotificacionLectores,
  crearNotificacion,
  actualizarNotificacion,
  eliminarNotificacion,
  listarCertificados,
  buscarCertificadoPorCodigo,
  buscarCertificadoPorId,
  crearCertificado,
  eliminarCertificado,
  verificarElegibilidadAsistente,
};
