require('dotenv').config();

const DB_TYPE = (process.env.DB_TYPE || 'mysql').toLowerCase();
const isPg = DB_TYPE === 'postgres' || DB_TYPE === 'pg';

let pool = null;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function initPool() {
  if (pool) return pool;
  if (isPg) {
    const { Pool } = require('pg');
    pool = new Pool(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT || 5432),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'inscripciones',
          }
    );
  } else {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'inscripciones',
      connectionLimit: 10,
      waitForConnections: true,
    });
  }
  return pool;
}

function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function filas(resultado) {
  return isPg ? resultado.rows : resultado[0];
}

async function query(sql, params = []) {
  const p = await initPool();
  const res = await p.query(isPg ? toPgSql(sql) : sql, params);
  return filas(res);
}

async function queryOne(sql, params = []) {
  const filasRes = await query(sql, params);
  return filasRes[0] || null;
}

async function mutation(sql, params = []) {
  const p = await initPool();
  const res = await p.query(isPg ? toPgSql(sql) : sql, params);
  if (isPg) return { filasAfectadas: res.rowCount || 0, insertId: null };
  return { filasAfectadas: res[0].affectedRows || 0, insertId: res[0].insertId || null };
}

async function transaction(fn) {
  const p = await initPool();
  const conn = isPg ? await p.connect() : await p.getConnection();
  const run = async (sql, params = []) => {
    const res = await conn.query(isPg ? toPgSql(sql) : sql, params);
    return filas(res);
  };
  try {
    if (isPg) {
      await conn.query('BEGIN');
      const out = await fn(run);
      await conn.query('COMMIT');
      return out;
    }
    await conn.beginTransaction();
    const out = await fn(run);
    await conn.commit();
    return out;
  } catch (e) {
    try {
      if (isPg) await conn.query('ROLLBACK');
      else await conn.rollback();
    } catch (_) {
      /* noop */
    }
    throw e;
  } finally {
    conn.release();
  }
}

const TALLERES_SEMILLA = {
  manana: [
    ['Robótica y Programación', 'Introducción a la robótica y la programación por bloques.'],
    ['Fotografía Digital', 'Taller de fotografía con celular y cámara.'],
    ['Teatro y Expresión Corporal', 'Juegos teatrales y herramientas de expresión escénica.'],
    ['Ajedrez', 'Reglas, estrategias básicas y práctica en partidas.'],
    ['Huerta y Jardinería', 'Cultivá tus propias hortalizas en macetas.'],
  ],
  tarde: [
    ['Desarrollo de Videojuegos', 'Creá tu primer videojuego desde cero.'],
    ['Cerámica y Alfarería', 'Modelado manual y técnicas de cerámica.'],
    ['Danza Urbana', 'Coreografías y ritmos urbanos en grupo.'],
    ['Música y Guitarra', 'Acordes básicos y práctica en conjunto.'],
    ['Diseño 3D e Impresión', 'Modelado 3D y fabricación de piezas.'],
  ],
};

async function seed() {
  const filasRes = await query('SELECT COUNT(*) AS n FROM talleres');
  if (Number(filasRes[0].n) > 0) return;
  for (const turno of ['manana', 'tarde']) {
    for (const [i, [nombre, descripcion]] of TALLERES_SEMILLA[turno].entries()) {
      await query('INSERT INTO talleres (nombre, descripcion, turno, cupo, duracion_hs) VALUES (?, ?, ?, ?, ?)', [
        nombre,
        descripcion,
        turno,
        20,
        i < 2 ? 6 : 3,
      ]);
    }
  }
}

async function tieneColumna(tabla, columna) {
  const filasRes = await query(
    `SELECT 1 AS ok FROM information_schema.columns WHERE table_name = ? AND column_name = ?${
      isPg ? ' AND table_schema = current_schema()' : ' AND table_schema = DATABASE()'
    }`,
    [tabla, columna]
  );
  return filasRes.length > 0;
}

async function init() {
  await initPool();
  const id = isPg ? 'SERIAL' : 'INT AUTO_INCREMENT';

  await query(`CREATE TABLE IF NOT EXISTS talleres (
    id ${id} PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT,
    turno VARCHAR(20) NOT NULL,
    cupo INT NOT NULL DEFAULT 20,
    duracion_hs INT NOT NULL DEFAULT 3,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await query(`CREATE TABLE IF NOT EXISTS inscripciones (
    id ${id} PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    apellido VARCHAR(120) NOT NULL,
    dni VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telefono VARCHAR(30) NOT NULL DEFAULT '',
    alimentacion VARCHAR(50) NOT NULL DEFAULT 'sin_restriccion',
    taller_id INT NOT NULL,
    turno VARCHAR(20) NOT NULL,
    en_encuentro ${isPg ? 'BOOLEAN NOT NULL DEFAULT FALSE' : 'TINYINT(1) NOT NULL DEFAULT 0'},
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dni_turno UNIQUE (dni, turno),
    CONSTRAINT fk_taller FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE CASCADE
  )`);

  await query(`CREATE TABLE IF NOT EXISTS encuentro_inscripciones (
    id ${id} PRIMARY KEY,
    dni VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL DEFAULT '',
    apellido VARCHAR(120) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    telefono VARCHAR(30) NOT NULL DEFAULT '',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await query(`CREATE TABLE IF NOT EXISTS eventos (
    id ${id} PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL,
    detalle TEXT,
    usuario VARCHAR(255) NOT NULL DEFAULT '',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await query(`CREATE TABLE IF NOT EXISTS usuarios (
    id ${id} PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(120) NOT NULL DEFAULT '',
    rol VARCHAR(20) NOT NULL DEFAULT 'operador',
    activo ${isPg ? 'BOOLEAN NOT NULL DEFAULT TRUE' : 'TINYINT(1) NOT NULL DEFAULT 1'},
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  if (!(await tieneColumna('talleres', 'duracion_hs'))) {
    await query('ALTER TABLE talleres ADD COLUMN duracion_hs INT NOT NULL DEFAULT 3');
  }

  if (!(await tieneColumna('inscripciones', 'telefono'))) {
    await query(`ALTER TABLE inscripciones ADD COLUMN telefono VARCHAR(30) NOT NULL DEFAULT ''`);
  }

  if (!(await tieneColumna('inscripciones', 'alimentacion'))) {
    await query(`ALTER TABLE inscripciones ADD COLUMN alimentacion VARCHAR(50) NOT NULL DEFAULT 'sin_restriccion'`);
  }

  if (!(await tieneColumna('encuentro_inscripciones', 'telefono'))) {
    await query(`ALTER TABLE encuentro_inscripciones ADD COLUMN telefono VARCHAR(30) NOT NULL DEFAULT ''`);
  }

  if (!(await tieneColumna('inscripciones', 'en_encuentro'))) {
    await query(
      `ALTER TABLE inscripciones ADD COLUMN en_encuentro ${isPg ? 'BOOLEAN NOT NULL DEFAULT FALSE' : 'TINYINT(1) NOT NULL DEFAULT 0'}`
    );
  }

  if (!(await tieneColumna('talleres', 'fecha'))) {
    await query(`ALTER TABLE talleres ADD COLUMN fecha VARCHAR(30) NOT NULL DEFAULT ''`);
  }

  if (!(await tieneColumna('talleres', 'hora'))) {
    await query(`ALTER TABLE talleres ADD COLUMN hora VARCHAR(40) NOT NULL DEFAULT ''`);
  }

  if (!(await tieneColumna('talleres', 'lugar'))) {
    await query(`ALTER TABLE talleres ADD COLUMN lugar VARCHAR(255) NOT NULL DEFAULT ''`);
  }

  if (!(await tieneColumna('inscripciones', 'qr_code'))) {
    await query(`ALTER TABLE inscripciones ADD COLUMN qr_code VARCHAR(50) NOT NULL DEFAULT ''`);
  }

  if (!(await tieneColumna('inscripciones', 'qr_data'))) {
    await query(`ALTER TABLE inscripciones ADD COLUMN qr_data TEXT`);
  }

  if (!(await tieneColumna('inscripciones', 'estado_pago'))) {
    await query(`ALTER TABLE inscripciones ADD COLUMN estado_pago VARCHAR(20) NOT NULL DEFAULT 'no_pagado'`);
  }

  if (!(await tieneColumna('encuentro_inscripciones', 'pago'))) {
    await query(`ALTER TABLE encuentro_inscripciones ADD COLUMN pago VARCHAR(50) NOT NULL DEFAULT ''`);
  }

  await query(
    `UPDATE inscripciones SET en_encuentro = TRUE WHERE en_encuentro = FALSE AND dni IN (SELECT dni FROM encuentro_inscripciones)`
  );

  if (String(process.env.SEED_ON_START || '').trim().toLowerCase() === 'true') {
    await seed();
  }
}

async function listarTalleres() {
  return query(
    `SELECT t.id, t.nombre, t.descripcion, t.turno, t.cupo, t.duracion_hs, t.fecha, t.hora, t.lugar,
       (SELECT COUNT(*) FROM inscripciones i WHERE i.taller_id = t.id) AS inscriptos
     FROM talleres t
     ORDER BY t.turno, t.id`
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
  if (ba.length > 0 && bb.length > 0) {
    for (const x of ba) {
      for (const y of bb) {
        if (x[0] < y[1] && y[0] < x[1]) return true;
      }
    }
    return false;
  }
  if (a.turno === b.turno) {
    const da = diasDelTaller(a);
    const db = diasDelTaller(b);
    if (da.length > 0 && db.length > 0) {
      for (const x of da) {
        for (const y of db) {
          if (x === y) return true;
        }
      }
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

async function crearInscripcion({ nombre, apellido, dni, email, telefono = '', alimentacion = 'sin_restriccion', tallerManana, tallerTarde, enEncuentro = false, estadoPago = 'no_pagado' }) {
  const selecciones = [];
  if (tallerManana) selecciones.push({ id: Number(tallerManana), turno: 'manana' });
  if (tallerTarde) selecciones.push({ id: Number(tallerTarde), turno: 'tarde' });
  if (selecciones.length === 0) throw new HttpError(400, 'Debés seleccionar al menos un taller.');

  return transaction(async (run) => {
    const existentes = await run(
      `SELECT i.turno, t.nombre, t.fecha, t.hora, t.duracion_hs
       FROM inscripciones i JOIN talleres t ON t.id = i.taller_id
       WHERE i.dni = ?`,
      [dni]
    );
    const turnosTomados = new Set(existentes.map((e) => e.turno));
    if (selecciones.some((s) => turnosTomados.has(s.turno))) {
      const turnoRepetido = selecciones.find((s) => turnosTomados.has(s.turno)).turno;
      throw new HttpError(409, `El DNI ya tiene un taller en el turno ${turnoRepetido === 'manana' ? 'mañana' : 'tarde'}.`);
    }

    const seleccionados = [];
    for (const sel of selecciones) {
      const res = await run('SELECT id, nombre, turno, cupo, fecha, hora, duracion_hs FROM talleres WHERE id = ? FOR UPDATE', [sel.id]);
      const taller = res[0];
      if (!taller) throw new HttpError(400, 'Uno de los talleres seleccionados no existe.');
      if (taller.turno !== sel.turno) {
        throw new HttpError(400, `El taller "${taller.nombre}" no pertenece al turno ${sel.turno}.`);
      }
      const conteo = await run('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id = ?', [sel.id]);
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

    for (const sel of selecciones) {
      try {
        await run(
          'INSERT INTO inscripciones (nombre, apellido, dni, email, telefono, alimentacion, taller_id, turno, en_encuentro, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [nombre, apellido, dni, email, telefono, alimentacion, sel.id, sel.turno, enEncuentro, estadoPago]
        );
      } catch (e) {
        const duplicado = isPg ? e.code === '23505' : e.code === 'ER_DUP_ENTRY';
        if (duplicado) {
          throw new HttpError(409, 'El DNI ingresado ya tiene una inscripción en el turno seleccionado.');
        }
        throw e;
      }
    }
  });
}

async function listarInscripciones() {
  return query(
    `SELECT i.id, i.nombre, i.apellido, i.dni, i.email, i.telefono, i.alimentacion, i.turno, i.en_encuentro, i.creado_en,
       i.estado_pago, i.taller_id, t.nombre AS taller, t.duracion_hs
     FROM inscripciones i
     JOIN talleres t ON t.id = i.taller_id
     ORDER BY t.turno, t.id, i.id`
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
    `SELECT i.id, i.dni, i.nombre, i.apellido, i.email, i.telefono, i.alimentacion, i.turno,
       i.estado_pago, i.qr_code, i.taller_id, t.nombre AS taller, t.descripcion, t.duracion_hs, t.fecha, t.hora, t.lugar
     FROM inscripciones i
     JOIN talleres t ON t.id = i.taller_id
     WHERE i.dni = ?
     ORDER BY i.turno`,
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

async function crearTaller({ nombre, descripcion, turno, cupo, duracionHs = 3, fecha = '', hora = '', lugar = '' }) {
  if (isPg) {
    const filasRes = await query(
      'INSERT INTO talleres (nombre, descripcion, turno, cupo, duracion_hs, fecha, hora, lugar) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [nombre, descripcion, turno, cupo, duracionHs, fecha, hora, lugar]
    );
    return Number(filasRes[0].id);
  }
  const res = await mutation(
    'INSERT INTO talleres (nombre, descripcion, turno, cupo, duracion_hs, fecha, hora, lugar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [nombre, descripcion, turno, cupo, duracionHs, fecha, hora, lugar]
  );
  return res.insertId;
}

async function actualizarTaller(id, { nombre, descripcion, turno, cupo, duracionHs = 3, fecha = '', hora = '', lugar = '' }) {
  const n = Number(cupo);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'El cupo debe ser un número entero mayor o igual a 0.');
  const conteo = await query('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id = ?', [id]);
  if (Number(conteo[0].n) > n) {
    throw new HttpError(409, `No se puede reducir el cupo: ya hay ${conteo[0].n} inscriptos.`);
  }
  const res = await mutation(
    'UPDATE talleres SET nombre = ?, descripcion = ?, turno = ?, cupo = ?, duracion_hs = ?, fecha = ?, hora = ?, lugar = ? WHERE id = ?',
    [nombre, descripcion, turno, n, duracionHs, fecha, hora, lugar, id]
  );
  if (!res.filasAfectadas) throw new HttpError(404, 'Taller no encontrado.');
  return true;
}

async function eliminarTaller(id) {
  const taller = await queryOne('SELECT nombre FROM talleres WHERE id = ?', [id]);
  if (!taller) throw new HttpError(404, 'Taller no encontrado.');
  const conteo = await queryOne('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id = ?', [id]);
  const inscriptos = Number(conteo.n);
  await mutation('DELETE FROM talleres WHERE id = ?', [id]);
  return { nombre: taller.nombre, inscriptosEliminados: inscriptos };
}

async function eliminarInscripcion(id) {
  const res = await mutation('DELETE FROM inscripciones WHERE id = ?', [id]);
  return res.filasAfectadas > 0;
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
  if (isPg) {
    const filasRes = await query(
      'INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES (?, ?, ?, ?) RETURNING id',
      [username, passwordHash, nombre, rol]
    );
    return Number(filasRes[0].id);
  }
  const res = await mutation('INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES (?, ?, ?, ?)', [
    username,
    passwordHash,
    nombre,
    rol,
  ]);
  return res.insertId;
}

async function buscarUsuario(username) {
  return queryOne('SELECT id, username, password_hash, nombre, rol, activo FROM usuarios WHERE username = ?', [username]);
}

async function listarUsuarios() {
  const filasRes = await query('SELECT id, username, nombre, rol, activo, creado_en FROM usuarios ORDER BY id');
  return filasRes.map((u) => ({ ...u, id: Number(u.id), activo: Boolean(u.activo) }));
}

async function actualizarUsuario(id, { nombre, rol, activo, passwordHash = null }) {
  if (passwordHash) {
    await mutation('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, password_hash = ? WHERE id = ?', [
      nombre,
      rol,
      activo,
      passwordHash,
      id,
    ]);
  } else {
    await mutation('UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE id = ?', [nombre, rol, activo, id]);
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
  const inscripcion = await queryOne('SELECT id, dni, nombre, apellido, turno, taller_id FROM inscripciones WHERE id = ?', [
    id,
  ]);
  if (!inscripcion) throw new HttpError(404, 'Inscripción no encontrada.');
  if (Number(inscripcion.taller_id) === Number(nuevoTallerId)) {
    throw new HttpError(400, 'El participante ya está inscripto en ese taller.');
  }
  const taller = await queryOne('SELECT id, nombre, turno, cupo, fecha, hora, duracion_hs FROM talleres WHERE id = ?', [nuevoTallerId]);
  if (!taller) throw new HttpError(400, 'El taller seleccionado no existe.');
  if (taller.turno !== inscripcion.turno) {
    throw new HttpError(400, `El taller "${taller.nombre}" no pertenece al turno ${inscripcion.turno}.`);
  }
  const conteo = await query('SELECT COUNT(*) AS n FROM inscripciones WHERE taller_id = ? AND id <> ?', [nuevoTallerId, id]);
  if (Number(conteo[0].n) >= Number(taller.cupo)) {
    throw new HttpError(409, `El taller "${taller.nombre}" ya completó su cupo.`);
  }
  const otros = await query(
    `SELECT i.turno, t.nombre, t.fecha, t.hora, t.duracion_hs
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

module.exports = {
  HttpError,
  init,
  query,
  queryOne,
  transaction,
  mutation,
  listarTalleres,
  crearTaller,
  actualizarTaller,
  eliminarTaller,
  crearInscripcion,
  listarInscripciones,
  cambiarEstadoPagoInscripcion,
  eliminarInscripcion,
  registrarEvento,
  listarEventos,
  cambiarTallerInscripcion,
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
};
