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
    url.searchParams.delete('sslmode');
    poolConfig.connectionString = url.toString();
    poolConfig.ssl = { rejectUnauthorized: false };
  } else {
    poolConfig.host = process.env.DB_HOST || '127.0.0.1';
    poolConfig.port = Number(process.env.DB_PORT || 5432);
    poolConfig.user = process.env.DB_USER || 'postgres';
    poolConfig.password = process.env.DB_PASSWORD || '';
    poolConfig.database = process.env.DB_NAME || 'inscripciones';
  }
  pool = new pg.Pool(poolConfig);
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
  return query(
    `SELECT t.id, t.nombre, t.descripcion, t.cupo, t.duracion_hs, t.fecha, t.hora, t.lugar, t.disertante, t.pareja_id,
       (SELECT COUNT(*) FROM inscripciones i WHERE i.taller_id = t.id) AS inscriptos
     FROM talleres t
     ORDER BY t.fecha, t.hora, t.id`
  );
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
        throw new HttpError(409, `El taller "${taller.nombre}" ya completó su cupo.`);
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
  return transaction(async (run) => {
    let importados = 0;
    let existentes = 0;
    for (const p of personas) {
      const previa = await run('SELECT id FROM encuentro_inscripciones WHERE dni = ?', [p.dni]);
      if (previa.length > 0) {
        existentes++;
        await run('UPDATE encuentro_inscripciones SET nombre = ?, apellido = ?, email = ?, telefono = ?, pago = ? WHERE dni = ?', [
          p.nombre,
          p.apellido,
          p.email,
          p.telefono,
          p.pago || '',
          p.dni,
        ]);
      } else {
        importados++;
        await run(
          'INSERT INTO encuentro_inscripciones (dni, nombre, apellido, email, telefono, pago) VALUES (?, ?, ?, ?, ?, ?)',
          [p.dni, p.nombre, p.apellido, p.email, p.telefono, p.pago || '']
        );
      }
      if (p.pago) {
        await run('UPDATE inscripciones SET estado_pago = ? WHERE dni = ?', [p.pago, p.dni]);
      }
    }
    return { importados, existentes };
  });
}

async function contarEncuentro() {
  const filasRes = await query('SELECT COUNT(*) AS n FROM encuentro_inscripciones');
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

async function crearTaller({ nombre, descripcion, cupo, lugar, disertante, parts = [] }) {
  const nombreBase = limpiarNombreParte(nombre);
  const n = Number(cupo);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'El cupo debe ser un número entero mayor o igual a 0.');
  if (!parts.length) parts = [{ fecha: '', hora: '', duracion_hs: 3 }];

  const ids = [];
  const fn = async (run) => {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const duracionHs = Number(p.duracion_hs) || 3;
      const fecha = String(p.fecha || '').trim();
      const hora = String(p.hora || '').trim();
      const nombreParte = nombreBase + sufijoParte(i, parts.length);
      const parejaId = i > 0 ? ids[0] : null;

      const filasRes = await run(
        `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, pareja_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [nombreParte, descripcion, n, duracionHs, fecha, hora, lugar, disertante, parejaId]
      );
      ids.push(Number(filasRes[0].id));
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

async function actualizarTaller(id, { nombre, descripcion, cupo, lugar, disertante, parts = [] }) {
  const n = Number(cupo);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'El cupo debe ser un número entero mayor o igual a 0.');
  const conteo = await query('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id = ?', [id]);
  if (Number(conteo[0].n) > n) {
    throw new HttpError(409, `No se puede reducir el cupo: ya hay ${conteo[0].n} inscriptos.`);
  }
  if (!parts.length) parts = [{ id: null, fecha: '', hora: '', duracion_hs: 3 }];

  const fn = async (run) => {
    const mainRes = await run(
      'UPDATE talleres SET descripcion = ?, cupo = ?, lugar = ?, disertante = ? WHERE id = ?',
      [descripcion, n, lugar, disertante, id]
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

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const duracionHs = Number(p.duracion_hs) || 3;
      const fecha = String(p.fecha || '').trim();
      const hora = String(p.hora || '').trim();
      const nombreParte = nombreBase + sufijoParte(i, totalParts);

      if (p.id) {
        await run(
          'UPDATE talleres SET nombre = ?, descripcion = ?, duracion_hs = ?, fecha = ?, hora = ?, lugar = ?, disertante = ? WHERE id = ?',
          [nombreParte, descripcion, duracionHs, fecha, hora, lugar, disertante, p.id]
        );
      } else {
        const parejaId = i === 0 ? null : id;
        await run(
          `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, pareja_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [nombreParte, descripcion, n, duracionHs, fecha, hora, lugar, disertante, parejaId]
        );
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

async function registrarEvento(tipo, detalle, usuario = 'admin') {
  await query('INSERT INTO eventos (tipo, detalle, usuario) VALUES (?, ?, ?)', [tipo, detalle, usuario]);
}

async function listarEventos() {
  return query('SELECT id, tipo, detalle, usuario, creado_en FROM eventos ORDER BY id DESC');
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
  return queryOne('SELECT id, username, password_hash, nombre, rol, activo, perm_inscripciones, perm_talleres, perm_encuentro, perm_acreditacion FROM usuarios WHERE username = ?', [username]);
}

async function listarUsuarios() {
  const filasRes = await query('SELECT id, username, nombre, rol, activo, perm_inscripciones, perm_talleres, perm_encuentro, perm_acreditacion, creado_en FROM usuarios ORDER BY id');
  return filasRes.map((u) => ({ ...u, id: Number(u.id), activo: Boolean(u.activo) }));
}

async function actualizarUsuario(id, { nombre, rol, activo, passwordHash = null, permInscripciones = true, permTalleres = true, permEncuentro = true, permAcreditacion = true }) {
  if (passwordHash) {
    await mutation('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, password_hash = ?, perm_inscripciones = ?, perm_talleres = ?, perm_encuentro = ?, perm_acreditacion = ? WHERE id = ?', [
      nombre, rol, activo, passwordHash, permInscripciones, permTalleres, permEncuentro, permAcreditacion, id,
    ]);
  } else {
    await mutation('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, perm_inscripciones = ?, perm_talleres = ?, perm_encuentro = ?, perm_acreditacion = ? WHERE id = ?', [
      nombre, rol, activo, permInscripciones, permTalleres, permEncuentro, permAcreditacion, id,
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
    throw new HttpError(409, `El taller "${taller.nombre}" ya completó su cupo.`);
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
        throw new HttpError(409, `El taller "${taller.nombre}" ya completó su cupo.`);
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
  return query('SELECT * FROM programa_bloques ORDER BY dia, orden, hora_inicio');
}

async function listarDiasPrograma() {
  return query('SELECT DISTINCT dia FROM programa_bloques ORDER BY dia');
}

async function obtenerBloque(id) {
  return queryOne('SELECT * FROM programa_bloques WHERE id = ?', [id]);
}

async function crearBloque({ dia, hora_inicio, hora_fin, tipo, titulo, descripcion = '', icono = '', orden = 0, datos = null }) {
  const filasRes = await query(
    'INSERT INTO programa_bloques (dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos]
  );
  return Number(filasRes[0].id);
}

async function actualizarBloque(id, { dia, hora_inicio, hora_fin, tipo, titulo, descripcion = '', icono = '', orden = 0, datos = null }) {
  const res = await mutation(
    'UPDATE programa_bloques SET dia = ?, hora_inicio = ?, hora_fin = ?, tipo = ?, titulo = ?, descripcion = ?, icono = ?, orden = ?, datos = ? WHERE id = ?',
    [dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos, id]
  );
  if (!res.filasAfectadas) throw new HttpError(404, 'Bloque no encontrado.');
  return true;
}

async function eliminarBloque(id) {
  const res = await mutation('DELETE FROM programa_bloques WHERE id = ?', [id]);
  if (!res.filasAfectadas) throw new HttpError(404, 'Bloque no encontrado.');
  return true;
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
      await mutation(
        `UPDATE talleres SET nombre = ?, descripcion = ?, cupo = ?, duracion_hs = ?, fecha = ?, hora = ?, lugar = ?, disertante = ?, ponente_id = ? WHERE id = ?`,
        [datos.nombre, datos.descripcion, datos.cupo, datos.duracion_hs, fecha, hora, datos.lugar, datos.disertante, datos.ponente_id, main.id]
      );
      mainId = main.id;
    } else {
      const ins = await query(
        `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, ponente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [datos.nombre, datos.descripcion, datos.cupo, datos.duracion_hs, fecha, hora, datos.lugar, datos.disertante, datos.ponente_id]
      );
      mainId = Number(ins[0].id);
    }

    const fecha2 = convertirFechaDia(p.fecha_dia2);
    const hora2 = String(p.horario2 || '').trim();
    if (fecha2 && hora2) {
      const parte = await queryOne('SELECT id, nombre FROM talleres WHERE pareja_id = ?', [mainId]);
      const nombreParte = `${datos.nombre} (2° parte)`.slice(0, 120);
      if (parte) {
        await mutation(
          `UPDATE talleres SET nombre = ?, fecha = ?, hora = ?, lugar = ?, disertante = ?, cupo = ?, ponente_id = ? WHERE id = ?`,
          [nombreParte, fecha2, hora2, '', datos.disertante, datos.cupo, datos.ponente_id, parte.id]
        );
      } else {
        await query(
          `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, ponente_id, pareja_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [nombreParte, datos.descripcion, datos.cupo, 3, fecha2, hora2, '', datos.disertante, datos.ponente_id, mainId]
        );
      }
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
  const filasRes = await query(
    `SELECT t.id AS taller_id, t.nombre AS taller, t.fecha, t.hora,
       COUNT(DISTINCT i.id) AS inscriptos,
       COUNT(DISTINCT CASE WHEN a.dni IS NOT NULL THEN i.dni END) AS acreditados
     FROM talleres t
     LEFT JOIN inscripciones i ON i.taller_id = t.id
     LEFT JOIN acreditaciones a ON a.dni = i.dni
     GROUP BY t.id, t.nombre, t.fecha, t.hora
     ORDER BY t.fecha, t.hora, t.nombre`
  );
  return filasRes.map((f) => ({
    ...f,
    taller_id: Number(f.taller_id),
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

  return { servicios, dietas, porAsistente };
}

// ── Pagos y cuotas ────────────────────────────────────────────────────

function formatearMonto(v) {
  return Number(v ?? 0);
}

async function listarPlanesPago() {
  return query(
    `SELECT id, nombre, descripcion, monto_total, cantidad_cuotas, activo, creado_en
     FROM planes_pago ORDER BY id`
  );
}

async function crearPlanPago({ nombre, descripcion = '', montoTotal = 0, cantidadCuotas = 1 }) {
  return mutation(
    'INSERT INTO planes_pago (nombre, descripcion, monto_total, cantidad_cuotas) VALUES (?, ?, ?, ?)',
    [nombre, descripcion, formatearMonto(montoTotal), Number(cantidadCuotas) || 1]
  );
}

async function actualizarPlanPago(id, { nombre, descripcion, montoTotal, cantidadCuotas, activo }) {
  const existe = await queryOne('SELECT id FROM planes_pago WHERE id = ?', [id]);
  if (!existe) throw new HttpError(404, 'Plan no encontrado.');
  await mutation(
    'UPDATE planes_pago SET nombre = ?, descripcion = ?, monto_total = ?, cantidad_cuotas = ?, activo = ? WHERE id = ?',
    [nombre, descripcion, formatearMonto(montoTotal), Number(cantidadCuotas) || 1, activo ? true : false, id]
  );
}

async function eliminarPlanPago(id) {
  await mutation('DELETE FROM planes_pago WHERE id = ?', [id]);
}

async function asignarPlanAsistente(dni, planId) {
  if (!/^\d{7,8}$/.test(String(dni || '').trim())) throw new HttpError(400, 'DNI inválido.');
  const plan = await queryOne('SELECT id, monto_total, cantidad_cuotas FROM planes_pago WHERE id = ?', [planId]);
  if (!plan) throw new HttpError(404, 'Plan no encontrado.');
  await mutation(
    'INSERT INTO asistente_planes (dni, plan_id, monto_total, cantidad_cuotas) VALUES (?, ?, ?, ?)',
    [String(dni).trim(), planId, formatearMonto(plan.monto_total), Number(plan.cantidad_cuotas) || 1]
  );
  await sincronizarEstadoPagoPorDni(String(dni).trim());
}

async function listarPagos() {
  const planes = query(`SELECT id, nombre, monto_total, cantidad_cuotas FROM planes_pago`);
  const asistentes = query(
    `SELECT a.id AS asistente_plan_id, a.dni, a.plan_id, a.monto_total, a.cantidad_cuotas,
            COALESCE(e.nombre, '') AS nombre, COALESCE(e.apellido, '') AS apellido,
            COALESCE(e.email, '') AS email, COALESCE(e.telefono, '') AS telefono
     FROM asistente_planes a
     LEFT JOIN encuentro_inscripciones e ON e.dni = a.dni
     ORDER BY e.apellido, e.nombre, a.dni`
  );
  const pagos = query(
    `SELECT asistente_plan_id, numero_cuota, monto, fecha_pago FROM pagos_cuotas ORDER BY numero_cuota`
  );
  const [planesRes, asistentesRes, pagosRes] = await Promise.all([planes, asistentes, pagos]);

  const pagosPorPlan = new Map();
  for (const p of pagosRes) {
    const clave = Number(p.asistente_plan_id);
    if (!pagosPorPlan.has(clave)) pagosPorPlan.set(clave, []);
    pagosPorPlan.get(clave).push({ numero: Number(p.numero_cuota), monto: formatearMonto(p.monto), fecha: p.fecha_pago || '' });
  }

  const planPorId = new Map(planesRes.map((pl) => [Number(pl.id), pl]));

  return asistentesRes.map((a) => ({
    asistentePlanId: Number(a.asistente_plan_id),
    dni: a.dni,
    nombre: a.nombre,
    apellido: a.apellido,
    email: a.email,
    telefono: a.telefono,
    planId: Number(a.plan_id),
    planNombre: planPorId.get(Number(a.plan_id))?.nombre || '',
    montoTotal: formatearMonto(a.monto_total),
    cantidadCuotas: Number(a.cantidad_cuotas) || 1,
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
  const planes = await query(
    `SELECT ap.cantidad_cuotas,
            (SELECT COUNT(*) FROM pagos_cuotas pc WHERE pc.asistente_plan_id = ap.id) AS cuotas_pagadas
     FROM asistente_planes ap WHERE ap.dni = ?`,
    [dni]
  );
  if (planes.length === 0) return;
  let total = 0;
  let pagadas = 0;
  for (const p of planes) {
    total += Number(p.cantidad_cuotas) || 1;
    pagadas += Number(p.cuotas_pagadas) || 0;
  }
  const estado = total === 0 ? 'no_pagado' : pagadas >= total ? 'pago_completo' : pagadas > 0 ? 'pago_parcial' : 'no_pagado';
  await mutation('UPDATE inscripciones SET estado_pago = ? WHERE dni = ?', [estado, dni]);
  return estado;
}

// ── Notificaciones ──────────────────────────────────────────────────

const EPOCH_FECHA_SQL = "round(extract(epoch from creado_en AT TIME ZONE current_setting('TimeZone')))";

function formatearFechaServer(epoch) {
  const d = new Date(Number(epoch) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    'INSERT INTO notificaciones_leidas (usuario, notificacion_id) VALUES (?, ?) ON CONFLICT (usuario, notificacion_id) DO NOTHING',
    [usuario, notificacionId]
  );
}

async function marcarTodasNotificacionesLeidas(usuario) {
  await query(
    `INSERT INTO notificaciones_leidas (usuario, notificacion_id)
     SELECT ?, id FROM notificaciones WHERE activa = TRUE
     ON CONFLICT (usuario, notificacion_id) DO NOTHING`,
    [usuario]
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

module.exports = {
  HttpError,
  query,
  queryOne,
  transaction,
  mutation,
  initPool,
  listarTalleres,
  crearTaller,
  actualizarTaller,
  eliminarTaller,
  crearInscripcion,
  listarInscripciones,
  cambiarEstadoPagoInscripcion,
  eliminarInscripcion,
  eliminarInscripcionesPorDni,
  registrarEvento,
  listarEventos,
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
  contarEncuentro,
  vaciarEncuentro,
  listarPrograma,
  listarDiasPrograma,
  obtenerBloque,
  crearBloque,
  actualizarBloque,
  eliminarBloque,
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
  listarPagos,
  registrarPagoCuota,
  eliminarPagoCuota,
  sincronizarEstadoPagoPorDni,
  listarNotificaciones,
  listarNotificacionesActivas,
  contarNotificacionesSinLeer,
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
  crearNotificacion,
  actualizarNotificacion,
  eliminarNotificacion,
};
