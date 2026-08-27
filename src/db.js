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
    if (isPg) {
      const rows = filas(res);
      rows.filasAfectadas = res.rowCount || 0;
      return rows;
    }
    const rows = Array.isArray(res[0]) ? res[0] : [];
    rows.filasAfectadas = res[0]?.affectedRows || 0;
    return rows;
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

const TALLERES_SEMILLA = [
  { nombre: 'Aprender a Producir (1° Parte)', descripcion: 'Taller de producción teatral.', fecha: '2026-10-09', hora: '15:00', lugar: 'A definir', disertante: 'Ester Trozzo', cupo: 25 },
  { nombre: 'El Cuerpo y La Palabra', descripcion: 'Exploración de la relación entre cuerpo y palabra en escena.', fecha: '2026-10-09', hora: '15:00', lugar: 'A definir', disertante: 'Lezcano', cupo: 25 },
  { nombre: 'Las llaves del aprendizaje: Dramaterapia (1° parte)', descripcion: 'Introducción a la dramaterapia como herramienta pedagógica.', fecha: '2026-10-09', hora: '15:00', lugar: 'A definir', disertante: 'Guerrero - Cartofiel', cupo: 25 },
  { nombre: 'Gaga Teatral', descripcion: 'Taller de expresión teatral gaga.', fecha: '2026-10-09', hora: '15:00', lugar: 'A definir', disertante: 'Saavedra', cupo: 25 },
  { nombre: 'El Juego de Improvisación Teatral (1º Parte)', descripcion: 'Juegos y técnicas de improvisación teatral.', fecha: '2026-10-09', hora: '15:00', lugar: 'A definir', disertante: 'Victor Galestok', cupo: 25 },

  { nombre: 'Teatro Antropológico (1º Parte)', descripcion: 'Exploración del teatro antropológico.', fecha: '2026-10-10', hora: '09:30', lugar: 'A definir', disertante: 'Jorge Holovatuck', cupo: 25 },
  { nombre: 'BUNRAKU: Marionetas (1º Parte)', descripcion: 'Técnicas de marionetas estilo bunraku.', fecha: '2026-10-10', hora: '09:30', lugar: 'A definir', disertante: 'Alberto Torres Sayas', cupo: 20 },
  { nombre: 'Recursos con sentido (1º Parte)', descripcion: 'Recursos escénicos con sentido pedagógico.', fecha: '2026-10-10', hora: '09:30', lugar: 'A definir', disertante: 'Juliana Rososzka', cupo: 25 },
  { nombre: 'Códigos del mimo y la pantomima', descripcion: 'Técnicas de mimo y pantomima.', fecha: '2026-10-10', hora: '09:30', lugar: 'A definir', disertante: 'Adrian Miguel Martinez', cupo: 25 },
  { nombre: 'Escuelas porosas: ESI (1º Parte)', descripcion: 'Educación Sexual Integral a través del teatro.', fecha: '2026-10-10', hora: '09:30', lugar: 'A definir', disertante: 'Mariela Piedrabuena', cupo: 25 },

  { nombre: 'Aprender a producir y apreciar (2º Parte)', descripcion: 'Segunda parte del taller de producción teatral.', fecha: '2026-10-10', hora: '15:30', lugar: 'A definir', disertante: 'Ester Trozzo', cupo: 25 },
  { nombre: 'Musicoterapia comunicativa', descripcion: 'Musicoterapia aplicada a la comunicación.', fecha: '2026-10-10', hora: '15:30', lugar: 'A definir', disertante: 'Andrea Marcela Peralta', cupo: 25 },
  { nombre: 'Dramaterapia (2º parte)', descripcion: 'Segunda parte del taller de dramaterapia.', fecha: '2026-10-10', hora: '15:30', lugar: 'A definir', disertante: 'Guerrero', cupo: 25 },
  { nombre: 'La sensorialidad y el Teatro (1º Parte)', descripcion: 'Exploración sensorial en la práctica teatral.', fecha: '2026-10-10', hora: '15:30', lugar: 'A definir', disertante: 'Fabiola Pavetto', cupo: 25 },
  { nombre: 'Improvisación teatral (2º Parte)', descripcion: 'Segunda parte del taller de improvisación.', fecha: '2026-10-10', hora: '15:30', lugar: 'A definir', disertante: 'Victor Galestok', cupo: 25 },

  { nombre: 'Teatro Antropológico (2º Parte)', descripcion: 'Segunda parte del teatro antropológico.', fecha: '2026-10-11', hora: '10:00', lugar: 'A definir', disertante: 'Jorge Holovatuck', cupo: 25 },
  { nombre: 'BUNRAKU: Marionetas (2º Parte)', descripcion: 'Segunda parte de marionetas bunraku.', fecha: '2026-10-11', hora: '10:00', lugar: 'A definir', disertante: 'Alberto Torres Zayas', cupo: 20 },
  { nombre: 'Recursos con sentido (2º Parte)', descripcion: 'Segunda parte de recursos escénicos.', fecha: '2026-10-11', hora: '10:00', lugar: 'A definir', disertante: 'Juliana Rososzka', cupo: 25 },
  { nombre: 'La sensorialidad y el Teatro (2º Parte)', descripcion: 'Segunda parte de exploración sensorial.', fecha: '2026-10-11', hora: '10:00', lugar: 'A definir', disertante: 'Fabiola Pavetto', cupo: 25 },
  { nombre: 'Escuelas porosas: ESI (2º Parte)', descripcion: 'Segunda parte de ESI a través del teatro.', fecha: '2026-10-11', hora: '10:00', lugar: 'A definir', disertante: 'Mariela Piedrabuena', cupo: 25 },

  { nombre: 'Dramaturgia de la inmersión', descripcion: 'Dramaturgia inmersiva.', fecha: '2026-10-11', hora: '15:30', lugar: 'A definir', disertante: 'Jorgelina Teyseyre', cupo: 25 },
  { nombre: 'El Teatro como Dispositivo de Salud', descripcion: 'Teatro aplicado a la salud.', fecha: '2026-10-11', hora: '15:30', lugar: 'A definir', disertante: 'Claudio Pansera', cupo: 25 },
  { nombre: 'Teatro con Inteligencia Artificial', descripcion: 'Uso de IA en la creación teatral.', fecha: '2026-10-11', hora: '15:30', lugar: 'A definir', disertante: 'José María Verón', cupo: 25 },
  { nombre: 'La miseria corporal', descripcion: 'Exploración de la corporalidad en el teatro.', fecha: '2026-10-11', hora: '15:30', lugar: 'A definir', disertante: 'Juan Pablo Cabezas', cupo: 25 },
  { nombre: 'Cuerpo ámbito de expresión y comunicación', descripcion: 'El cuerpo como medio de expresión y comunicación.', fecha: '2026-10-11', hora: '15:30', lugar: 'A definir', disertante: 'Macarena Salomé Robles', cupo: 25 },
];

const BLOQUES_SEMILLA = [
  // DÍA 1 — 2026-10-09
  { dia: '2026-10-09', hora_inicio: '08:00', hora_fin: '10:00', tipo: 'break', titulo: 'Desayuno y Acreditaciones', descripcion: 'Recepción de participantes, entrega de credenciales y material de bienvenida en el hall central.', icono: '☕', orden: 1 },
  { dia: '2026-10-09', hora_inicio: '10:00', hora_fin: '12:00', tipo: 'inauguracion', titulo: 'Inauguración y Espectáculo de Apertura', descripcion: 'Apertura oficial del evento con autoridades e invitados especiales, seguido del espectáculo escénico inaugural.', icono: '🎭', orden: 2 },
  { dia: '2026-10-09', hora_inicio: '12:00', hora_fin: '14:30', tipo: 'break', titulo: 'Almuerzo libre', descripcion: 'Espacio libre para almuerzo y vinculación entre participantes.', icono: '🍽️', orden: 3 },
  { dia: '2026-10-09', hora_inicio: '14:30', hora_fin: '15:00', tipo: 'ponencia', titulo: 'Bloque de Ponencias Tarde Día 1', descripcion: '', icono: '🎤', orden: 4, datos: JSON.stringify([
    { titulo: 'TEATRO Y Trastornos del Espectro Autista: Escenarios de empatía', ponente: 'Elisa Graciela Ochoa', hora: '14:30 a 14:45' },
    { titulo: 'Barreras simbólicas: una experiencia para ampliar horizontes culturales', ponente: 'Noelia Canavesi', hora: '14:45 a 15:00' }
  ]) },
  { dia: '2026-10-09', hora_inicio: '15:00', hora_fin: '18:00', tipo: 'talleres', titulo: 'Bloque de Talleres en Paralelo', descripcion: '5 talleres a elección para docentes y teatristas', icono: '🛠️', orden: 5 },
  { dia: '2026-10-09', hora_inicio: '18:00', hora_fin: '18:30', tipo: 'break', titulo: 'Merienda', descripcion: 'Corte para compartir una merienda entre participantes.', icono: '☕', orden: 6 },
  { dia: '2026-10-09', hora_inicio: '18:30', hora_fin: '19:30', tipo: 'obra', titulo: 'Obra de Teatro - Función Día 1', descripcion: 'Presentación de obra teatral programada para el cierre de la jornada.', icono: '🎬', orden: 7 },

  // DÍA 2 — 2026-10-10
  { dia: '2026-10-10', hora_inicio: '08:00', hora_fin: '09:00', tipo: 'break', titulo: 'Desayuno', descripcion: 'Recepción con desayuno.', icono: '☕', orden: 1 },
  { dia: '2026-10-10', hora_inicio: '09:00', hora_fin: '09:30', tipo: 'ponencia', titulo: 'Bloque de Ponencias Mañana', descripcion: '', icono: '🎤', orden: 2, datos: JSON.stringify([
    { titulo: 'Mirar también es hacer: La devolución como dispositivo de pensamiento colectivo', ponente: 'Leandro Bres', hora: '09:00 a 09:15' },
    { titulo: 'Teatro en la Escuela Técnica: la metáfora como estrategia de enseñanza', ponente: 'Daniela Guerci', hora: '09:15 a 09:30' }
  ]) },
  { dia: '2026-10-10', hora_inicio: '09:30', hora_fin: '12:30', tipo: 'talleres', titulo: 'Bloque de Talleres en Paralelo', descripcion: '', icono: '🛠️', orden: 3 },
  { dia: '2026-10-10', hora_inicio: '12:30', hora_fin: '14:30', tipo: 'break', titulo: 'Almuerzo libre', descripcion: 'Tiempo de almuerzo.', icono: '🍽️', orden: 4 },
  { dia: '2026-10-10', hora_inicio: '14:30', hora_fin: '15:30', tipo: 'conversatorio', titulo: 'Conversatorio con Jorge Dubatti', descripcion: 'Encuentro magistral e intercambio abierto de reflexiones pedagógicas y teatrales a cargo del renombrado crítico e investigador Jorge Dubatti.', icono: '💬', orden: 5 },
  { dia: '2026-10-10', hora_inicio: '15:30', hora_fin: '18:30', tipo: 'talleres', titulo: 'Bloque de Talleres en Paralelo', descripcion: '', icono: '🛠️', orden: 6 },
  { dia: '2026-10-10', hora_inicio: '18:30', hora_fin: '19:00', tipo: 'break', titulo: 'Merienda', descripcion: 'Corte para merienda.', icono: '☕', orden: 7 },
  { dia: '2026-10-10', hora_inicio: '19:00', hora_fin: '20:00', tipo: 'obra', titulo: 'Obra de Teatro - Función Día 2', descripcion: 'Presentación escénica del Día 2.', icono: '🎬', orden: 8 },

  // DÍA 3 — 2026-10-11
  { dia: '2026-10-11', hora_inicio: '08:00', hora_fin: '09:00', tipo: 'break', titulo: 'Desayuno', descripcion: 'Apertura de la jornada final con desayuno.', icono: '☕', orden: 1 },
  { dia: '2026-10-11', hora_inicio: '09:00', hora_fin: '10:00', tipo: 'conversatorio', titulo: 'Conversatorio con Jorge Dubatti (Continuación)', descripcion: 'Segunda parte del espacio de intercambio con Jorge Dubatti.', icono: '💬', orden: 2 },
  { dia: '2026-10-11', hora_inicio: '10:00', hora_fin: '13:00', tipo: 'talleres', titulo: 'Bloque de Talleres en Paralelo', descripcion: '', icono: '🛠️', orden: 3 },
  { dia: '2026-10-11', hora_inicio: '13:00', hora_fin: '15:00', tipo: 'break', titulo: 'Almuerzo libre', descripcion: 'Intervalo para almuerzo.', icono: '🍽️', orden: 4 },
  { dia: '2026-10-11', hora_inicio: '15:00', hora_fin: '15:30', tipo: 'ponencia', titulo: 'Bloque de Ponencias Tarde', descripcion: '', icono: '🎤', orden: 5, datos: JSON.stringify([
    { titulo: 'Proyecto Rutas Pedagógicas "De la Ruta al Escenario"', ponente: 'Silvana Elizabeth Castro', hora: '15:00 a 15:15' },
    { titulo: 'Un día en la vida de 1810, una articulación de saberes', ponente: 'Noelia Mellea', hora: '15:15 a 15:30' }
  ]) },
  { dia: '2026-10-11', hora_inicio: '15:30', hora_fin: '18:30', tipo: 'talleres', titulo: 'Bloque de Talleres en Paralelo', descripcion: '', icono: '🛠️', orden: 6 },
  { dia: '2026-10-11', hora_inicio: '18:30', hora_fin: '19:00', tipo: 'break', titulo: 'Merienda', descripcion: 'Pausa para merienda previa al cierre.', icono: '☕', orden: 7 },
  { dia: '2026-10-11', hora_inicio: '19:00', hora_fin: '20:00', tipo: 'obra', titulo: 'Obra de Teatro y Acto de Cierre', descripcion: 'Función teatral de clausura y palabras finales de despedida del congreso/encuentro.', icono: '🎬', orden: 8 },
];

const CONFIG_SEMILLA = [
  { clave: 'capacidad_locacion', valor: '500' },
  { clave: 'fecha_inicio', valor: '2026-10-09' },
  { clave: 'fecha_fin', valor: '2026-10-11' },
  { clave: 'perm_inscripciones', valor: 'true' },
  { clave: 'perm_talleres', valor: 'true' },
  { clave: 'perm_programa', valor: 'true' },
  { clave: 'perm_encuentro', valor: 'true' },
  { clave: 'perm_acreditacion', valor: 'true' },
];

async function seed() {
  const filasRes = await query('SELECT COUNT(*) AS n FROM talleres');
  if (Number(filasRes[0].n) === 0) {
    for (const t of TALLERES_SEMILLA) {
      await query(
        'INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [t.nombre, t.descripcion, t.cupo || 20, 3, t.fecha, t.hora, t.lugar || '', t.disertante || '']
      );
    }
    console.log(`Seed: ${TALLERES_SEMILLA.length} talleres insertados.`);
  }
}

async function seedPrograma() {
  const bloquesRes = await query('SELECT COUNT(*) AS n FROM programa_bloques');
  if (Number(bloquesRes[0].n) === 0) {
    for (const b of BLOQUES_SEMILLA) {
      await query(
        'INSERT INTO programa_bloques (dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [b.dia, b.hora_inicio, b.hora_fin, b.tipo, b.titulo, b.descripcion || '', b.icono || '', b.orden || 0, b.datos || null]
      );
    }
    console.log(`Seed: ${BLOQUES_SEMILLA.length} bloques del programa insertados.`);
  }
}

async function seedConfig() {
  const configRes = await query('SELECT COUNT(*) AS n FROM configuracion_evento');
  if (Number(configRes[0].n) === 0) {
    for (const c of CONFIG_SEMILLA) {
      await query('INSERT INTO configuracion_evento (clave, valor) VALUES (?, ?)', [c.clave, c.valor]);
    }
    console.log(`Seed: ${CONFIG_SEMILLA.length} configuraciones insertadas.`);
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

async function safeAlter(sql) {
  try {
    await query(sql);
  } catch (_) { /* noop - column may not exist */ }
}

async function init() {
  await initPool();
  const id = isPg ? 'SERIAL' : 'INT AUTO_INCREMENT';

  await query(`CREATE TABLE IF NOT EXISTS talleres (
    id ${id} PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT,
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
    en_encuentro ${isPg ? 'BOOLEAN NOT NULL DEFAULT FALSE' : 'TINYINT(1) NOT NULL DEFAULT 0'},
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dni_taller UNIQUE (dni, taller_id),
    CONSTRAINT fk_taller FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE CASCADE
  )`);

  await safeAlter(`ALTER TABLE talleres DROP COLUMN IF EXISTS turno`);
  await safeAlter(`ALTER TABLE inscripciones DROP COLUMN IF EXISTS turno`);

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

  await query(`CREATE TABLE IF NOT EXISTS programa_bloques (
    id ${id} PRIMARY KEY,
    dia VARCHAR(10) NOT NULL,
    hora_inicio VARCHAR(10) NOT NULL,
    hora_fin VARCHAR(10) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT,
    icono VARCHAR(10) NOT NULL DEFAULT '',
    orden INT NOT NULL DEFAULT 0,
    datos TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await query(`CREATE TABLE IF NOT EXISTS configuracion_evento (
    clave VARCHAR(50) NOT NULL PRIMARY KEY,
    valor TEXT NOT NULL DEFAULT ''
  )`);

  await query(`CREATE TABLE IF NOT EXISTS acreditaciones (
    id ${id} PRIMARY KEY,
    dni VARCHAR(20) NOT NULL,
    nombre VARCHAR(120) NOT NULL DEFAULT '',
    apellido VARCHAR(120) NOT NULL DEFAULT '',
    qr_code VARCHAR(50) NOT NULL DEFAULT '',
    usuario VARCHAR(255) NOT NULL DEFAULT '',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await query(`CREATE TABLE IF NOT EXISTS comidas_asistencias (
    id ${id} PRIMARY KEY,
    dni VARCHAR(20) NOT NULL,
    bloque_id INT NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dni_bloque UNIQUE (dni, bloque_id),
    CONSTRAINT fk_bloque_comida FOREIGN KEY (bloque_id) REFERENCES programa_bloques (id) ON DELETE CASCADE
  )`);

  await query(`CREATE TABLE IF NOT EXISTS usuarios (
    id ${id} PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(120) NOT NULL DEFAULT '',
    rol VARCHAR(20) NOT NULL DEFAULT 'operador',
    activo ${isPg ? 'BOOLEAN NOT NULL DEFAULT TRUE' : 'TINYINT(1) NOT NULL DEFAULT 1'},
    perm_inscripciones ${isPg ? 'BOOLEAN NOT NULL DEFAULT TRUE' : 'TINYINT(1) NOT NULL DEFAULT 1'},
    perm_talleres ${isPg ? 'BOOLEAN NOT NULL DEFAULT TRUE' : 'TINYINT(1) NOT NULL DEFAULT 1'},
    perm_programa ${isPg ? 'BOOLEAN NOT NULL DEFAULT TRUE' : 'TINYINT(1) NOT NULL DEFAULT 1'},
    perm_encuentro ${isPg ? 'BOOLEAN NOT NULL DEFAULT TRUE' : 'TINYINT(1) NOT NULL DEFAULT 1'},
    perm_acreditacion ${isPg ? 'BOOLEAN NOT NULL DEFAULT TRUE' : 'TINYINT(1) NOT NULL DEFAULT 1'},
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

  if (!(await tieneColumna('talleres', 'disertante'))) {
    await query(`ALTER TABLE talleres ADD COLUMN disertante VARCHAR(200) NOT NULL DEFAULT ''`);
  }

  if (!(await tieneColumna('talleres', 'pareja_id'))) {
    await query(`ALTER TABLE talleres ADD COLUMN pareja_id ${isPg ? 'INT REFERENCES talleres(id) ON DELETE SET NULL' : 'INT'}`);
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

  for (const perm of ['perm_inscripciones', 'perm_talleres', 'perm_programa', 'perm_encuentro', 'perm_acreditacion']) {
    if (!(await tieneColumna('usuarios', perm))) {
      await query(`ALTER TABLE usuarios ADD COLUMN ${perm} ${isPg ? 'BOOLEAN NOT NULL DEFAULT TRUE' : 'TINYINT(1) NOT NULL DEFAULT 1'}`);
    }
  }

  await query(
    `UPDATE inscripciones SET en_encuentro = TRUE WHERE en_encuentro = FALSE AND dni IN (SELECT dni FROM encuentro_inscripciones)`
  );

  if (String(process.env.SEED_ON_START || '').trim().toLowerCase() === 'true') {
    await seed();
  }

  await seedPrograma();
  await seedConfig();
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
        const duplicado = isPg ? e.code === '23505' : e.code === 'ER_DUP_ENTRY';
        if (duplicado) {
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
        `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, pareja_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)${isPg ? ' RETURNING id' : ''}`,
        [nombreParte, descripcion, n, duracionHs, fecha, hora, lugar, disertante, parejaId]
      );
      ids.push(isPg ? Number(filasRes[0].id) : filasRes.insertId);
    }
  };

  if (parts.length > 1) {
    await transaction(fn);
  } else {
    await fn(async (sql, params) => {
      const p = await initPool();
      const res = await p.query(isPg ? toPgSql(sql) : sql, params);
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
          `INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante, pareja_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)${isPg ? ' RETURNING id' : ''}`,
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
  return queryOne('SELECT id, username, password_hash, nombre, rol, activo, perm_inscripciones, perm_talleres, perm_programa, perm_encuentro, perm_acreditacion FROM usuarios WHERE username = ?', [username]);
}

async function listarUsuarios() {
  const filasRes = await query('SELECT id, username, nombre, rol, activo, perm_inscripciones, perm_talleres, perm_programa, perm_encuentro, perm_acreditacion, creado_en FROM usuarios ORDER BY id');
  return filasRes.map((u) => ({ ...u, id: Number(u.id), activo: Boolean(u.activo) }));
}

async function actualizarUsuario(id, { nombre, rol, activo, passwordHash = null, permInscripciones = true, permTalleres = true, permPrograma = true, permEncuentro = true, permAcreditacion = true }) {
  if (passwordHash) {
    await mutation('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, password_hash = ?, perm_inscripciones = ?, perm_talleres = ?, perm_programa = ?, perm_encuentro = ?, perm_acreditacion = ? WHERE id = ?', [
      nombre,
      rol,
      activo,
      passwordHash,
      permInscripciones,
      permTalleres,
      permPrograma,
      permEncuentro,
      permAcreditacion,
      id,
    ]);
  } else {
    await mutation('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, perm_inscripciones = ?, perm_talleres = ?, perm_programa = ?, perm_encuentro = ?, perm_acreditacion = ? WHERE id = ?', [
      nombre,
      rol,
      activo,
      permInscripciones,
      permTalleres,
      permPrograma,
      permEncuentro,
      permAcreditacion,
      id,
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
  const inscripcion = await queryOne('SELECT id, dni, nombre, apellido, taller_id FROM inscripciones WHERE id = ?', [
    id,
  ]);
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
  if (isPg) {
    const filasRes = await query(
      'INSERT INTO programa_bloques (dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos]
    );
    return Number(filasRes[0].id);
  }
  const res = await mutation(
    'INSERT INTO programa_bloques (dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos]
  );
  return res.insertId;
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
  if (isPg) {
    await query(
      `INSERT INTO configuracion_evento (clave, valor) VALUES (?, ?)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
      [clave, valor]
    );
  } else {
    await query(
      `INSERT INTO configuracion_evento (clave, valor) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      [clave, valor]
    );
  }
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
  const sql = isPg
    ? 'INSERT INTO comidas_asistencias (dni, bloque_id) VALUES ($1, $2) ON CONFLICT (dni, bloque_id) DO NOTHING'
    : 'INSERT IGNORE INTO comidas_asistencias (dni, bloque_id) VALUES (?, ?)';
  try {
    await query(sql, [dni, bloqueId]);
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
  eliminarInscripcionesPorDni,
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
  listarPrograma,
  listarDiasPrograma,
  obtenerBloque,
  crearBloque,
  actualizarBloque,
  eliminarBloque,
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
};
