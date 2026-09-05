-- Migración inicial: Esquema completo de la base de datos
-- Ejecutar en el SQL Editor de Supabase o vía: psql -f 001_initial_schema.sql

-- ── Talleres ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talleres (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  cupo INT NOT NULL DEFAULT 20,
  duracion_hs INT NOT NULL DEFAULT 3,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ponente_id INTEGER,
  fecha VARCHAR(30) NOT NULL DEFAULT '',
  hora VARCHAR(40) NOT NULL DEFAULT '',
  lugar VARCHAR(255) NOT NULL DEFAULT '',
  disertante VARCHAR(200) NOT NULL DEFAULT '',
  pareja_id INT REFERENCES talleres(id) ON DELETE SET NULL
);

-- ── Inscripciones ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inscripciones (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  apellido VARCHAR(120) NOT NULL,
  dni VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telefono VARCHAR(30) NOT NULL DEFAULT '',
  alimentacion VARCHAR(50) NOT NULL DEFAULT 'sin_restriccion',
  taller_id INT NOT NULL,
  en_encuentro BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  qr_code VARCHAR(50) NOT NULL DEFAULT '',
  qr_data TEXT,
  estado_pago VARCHAR(20) NOT NULL DEFAULT 'no_pagado',
  CONSTRAINT uq_dni_taller UNIQUE (dni, taller_id),
  CONSTRAINT fk_taller FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE CASCADE
);

-- ── Encuentro (asistentes importados) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS encuentro_inscripciones (
  id SERIAL PRIMARY KEY,
  dni VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL DEFAULT '',
  apellido VARCHAR(120) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL DEFAULT '',
  telefono VARCHAR(30) NOT NULL DEFAULT '',
  pago VARCHAR(50) NOT NULL DEFAULT '',
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Eventos (log) ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eventos (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(50) NOT NULL,
  detalle TEXT,
  usuario VARCHAR(255) NOT NULL DEFAULT '',
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Programa ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS programa_bloques (
  id SERIAL PRIMARY KEY,
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
);

-- ── Ponentes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ponentes (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'ponencia',
  dia INTEGER NOT NULL DEFAULT 1,
  horario TEXT NOT NULL DEFAULT '',
  dia2 INTEGER,
  horario2 TEXT NOT NULL DEFAULT '',
  titulo TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL DEFAULT '',
  foto TEXT,
  foto_pos TEXT NOT NULL DEFAULT '',
  cupo INTEGER NOT NULL DEFAULT 20,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Días de ponentes ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dias_ponentes (
  dia INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL DEFAULT ''
);

-- ── Configuración del evento ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS configuracion_evento (
  clave VARCHAR(50) NOT NULL PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);

-- ── Acreditaciones ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acreditaciones (
  id SERIAL PRIMARY KEY,
  dni VARCHAR(20) NOT NULL,
  nombre VARCHAR(120) NOT NULL DEFAULT '',
  apellido VARCHAR(120) NOT NULL DEFAULT '',
  qr_code VARCHAR(50) NOT NULL DEFAULT '',
  usuario VARCHAR(255) NOT NULL DEFAULT '',
  registrado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Comidas / asistencias ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comidas_asistencias (
  id SERIAL PRIMARY KEY,
  dni VARCHAR(20) NOT NULL,
  bloque_id INT NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_dni_bloque UNIQUE (dni, bloque_id),
  CONSTRAINT fk_bloque_comida FOREIGN KEY (bloque_id) REFERENCES programa_bloques (id) ON DELETE CASCADE
);

-- ── Usuarios ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nombre VARCHAR(120) NOT NULL DEFAULT '',
  rol VARCHAR(20) NOT NULL DEFAULT 'operador',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  perm_inscripciones BOOLEAN NOT NULL DEFAULT TRUE,
  perm_talleres BOOLEAN NOT NULL DEFAULT TRUE,
  perm_encuentro BOOLEAN NOT NULL DEFAULT TRUE,
  perm_acreditacion BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Planes de pago ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planes_pago (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  monto_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  cantidad_cuotas INT NOT NULL DEFAULT 1,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Asistente ↔ plan ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistente_planes (
  id SERIAL PRIMARY KEY,
  dni VARCHAR(20) NOT NULL,
  plan_id INT NOT NULL,
  monto_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  cantidad_cuotas INT NOT NULL DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_dni_plan UNIQUE (dni, plan_id),
  CONSTRAINT fk_plan_pago FOREIGN KEY (plan_id) REFERENCES planes_pago (id) ON DELETE CASCADE
);

-- ── Pagos / cuotas ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pagos_cuotas (
  id SERIAL PRIMARY KEY,
  asistente_plan_id INT NOT NULL,
  numero_cuota INT NOT NULL,
  monto NUMERIC(10,2) NOT NULL DEFAULT 0,
  fecha_pago DATE,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_pago_cuota UNIQUE (asistente_plan_id, numero_cuota),
  CONSTRAINT fk_asistente_plan FOREIGN KEY (asistente_plan_id) REFERENCES asistente_planes (id) ON DELETE CASCADE
);

-- ── Notificaciones ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notificaciones (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  mensaje TEXT NOT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'info',
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por VARCHAR(255) NOT NULL DEFAULT '',
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Notificaciones leídas ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notificaciones_leidas (
  id SERIAL PRIMARY KEY,
  usuario VARCHAR(50) NOT NULL,
  notificacion_id INT NOT NULL,
  CONSTRAINT uq_notificaciones_leidas UNIQUE (usuario, notificacion_id)
);

-- ── Seed: Configuración del evento ────────────────────────────────────

INSERT INTO configuracion_evento (clave, valor) VALUES
  ('capacidad_locacion', '500'),
  ('fecha_inicio', '2026-10-09'),
  ('fecha_fin', '2026-10-11'),
  ('perm_inscripciones', 'true'),
  ('perm_talleres', 'true'),
  ('perm_programa', 'true'),
  ('perm_encuentro', 'true'),
  ('perm_acreditacion', 'true')
ON CONFLICT (clave) DO NOTHING;

-- ── Seed: Programa (bloques del evento) ───────────────────────────────

INSERT INTO programa_bloques (dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos) VALUES
  ('2026-10-09', '08:00', '10:00', 'break', 'Desayuno y Acreditaciones', 'Recepción de participantes, entrega de credenciales y material de bienvenida en el hall central.', '☕', 1, NULL),
  ('2026-10-09', '10:00', '12:00', 'inauguracion', 'Inauguración y Espectáculo de Apertura', 'Apertura oficial del evento con autoridades e invitados especiales, seguido del espectáculo escénico inaugural.', '🎭', 2, NULL),
  ('2026-10-09', '12:00', '14:30', 'break', 'Almuerzo libre', 'Espacio libre para almuerzo y vinculación entre participantes.', '🍽️', 3, NULL),
  ('2026-10-09', '14:30', '15:00', 'ponencia', 'Bloque de Ponencias Tarde Día 1', '', '🎤', 4, '[{"titulo":"TEATRO Y Trastornos del Espectro Autista: Escenarios de empatía","ponente":"Elisa Graciela Ochoa","hora":"14:30 a 14:45"},{"titulo":"Barreras simbólicas: una experiencia para ampliar horizontes culturales","ponente":"Noelia Canavesi","hora":"14:45 a 15:00"}]'),
  ('2026-10-09', '15:00', '18:00', 'talleres', 'Bloque de Talleres en Paralelo', '5 talleres a elección para docentes y teatristas', '🛠️', 5, NULL),
  ('2026-10-09', '18:00', '18:30', 'break', 'Merienda', 'Corte para compartir una merienda entre participantes.', '☕', 6, NULL),
  ('2026-10-09', '18:30', '19:30', 'obra', 'Obra de Teatro - Función Día 1', 'Presentación de obra teatral programada para el cierre de la jornada.', '🎬', 7, NULL),
  ('2026-10-10', '08:00', '09:00', 'break', 'Desayuno', 'Recepción con desayuno.', '☕', 1, NULL),
  ('2026-10-10', '09:00', '09:30', 'ponencia', 'Bloque de Ponencias Mañana', '', '🎤', 2, '[{"titulo":"Mirar también es hacer: La devolución como dispositivo de pensamiento colectivo","ponente":"Leandro Bres","hora":"09:00 a 09:15"},{"titulo":"Teatro en la Escuela Técnica: la metáfora como estrategia de enseñanza","ponente":"Daniela Guerci","hora":"09:15 a 09:30"}]'),
  ('2026-10-10', '09:30', '12:30', 'talleres', 'Bloque de Talleres en Paralelo', '', '🛠️', 3, NULL),
  ('2026-10-10', '12:30', '14:30', 'break', 'Almuerzo libre', 'Tiempo de almuerzo.', '🍽️', 4, NULL),
  ('2026-10-10', '14:30', '15:30', 'conversatorio', 'Conversatorio con Jorge Dubatti', 'Encuentro magistral e intercambio abierto de reflexiones pedagógicas y teatrales a cargo del renombrado crítico e investigador Jorge Dubatti.', '💬', 5, NULL),
  ('2026-10-10', '15:30', '18:30', 'talleres', 'Bloque de Talleres en Paralelo', '', '🛠️', 6, NULL),
  ('2026-10-10', '18:30', '19:00', 'break', 'Merienda', 'Corte para merienda.', '☕', 7, NULL),
  ('2026-10-10', '19:00', '20:00', 'obra', 'Obra de Teatro - Función Día 2', 'Presentación escénica del Día 2.', '🎬', 8, NULL),
  ('2026-10-11', '08:00', '09:00', 'break', 'Desayuno', 'Apertura de la jornada final con desayuno.', '☕', 1, NULL),
  ('2026-10-11', '09:00', '10:00', 'conversatorio', 'Conversatorio con Jorge Dubatti (Continuación)', 'Segunda parte del espacio de intercambio con Jorge Dubatti.', '💬', 2, NULL),
  ('2026-10-11', '10:00', '13:00', 'talleres', 'Bloque de Talleres en Paralelo', '', '🛠️', 3, NULL),
  ('2026-10-11', '13:00', '15:00', 'break', 'Almuerzo libre', 'Intervalo para almuerzo.', '🍽️', 4, NULL),
  ('2026-10-11', '15:00', '15:30', 'ponencia', 'Bloque de Ponencias Tarde', '', '🎤', 5, '[{"titulo":"Proyecto Rutas Pedagógicas \\"De la Ruta al Escenario\\"","ponente":"Silvana Elizabeth Castro","hora":"15:00 a 15:15"},{"titulo":"Un día en la vida de 1810, una articulación de saberes","ponente":"Noelia Mellea","hora":"15:15 a 15:30"}]'),
  ('2026-10-11', '15:30', '18:30', 'talleres', 'Bloque de Talleres en Paralelo', '', '🛠️', 6, NULL),
  ('2026-10-11', '18:30', '19:00', 'break', 'Merienda', 'Pausa para merienda previa al cierre.', '☕', 7, NULL),
  ('2026-10-11', '19:00', '20:00', 'obra', 'Obra de Teatro y Acto de Cierre', 'Función teatral de clausura y palabras finales de despedida del congreso/encuentro.', '🎬', 8, NULL)
ON CONFLICT DO NOTHING;

-- ── Seed: Talleres ────────────────────────────────────────────────────

INSERT INTO talleres (nombre, descripcion, cupo, duracion_hs, fecha, hora, lugar, disertante) VALUES
  ('Aprender a Producir (1° Parte)', 'Taller de producción teatral.', 25, 3, '2026-10-09', '15:00', 'A definir', 'Ester Trozzo'),
  ('El Cuerpo y La Palabra', 'Exploración de la relación entre cuerpo y palabra en escena.', 25, 3, '2026-10-09', '15:00', 'A definir', 'Lezcano'),
  ('Las llaves del aprendizaje: Dramaterapia (1° parte)', 'Introducción a la dramaterapia como herramienta pedagógica.', 25, 3, '2026-10-09', '15:00', 'A definir', 'Guerrero - Cartofiel'),
  ('Gaga Teatral', 'Taller de expresión teatral gaga.', 25, 3, '2026-10-09', '15:00', 'A definir', 'Saavedra'),
  ('El Juego de Improvisación Teatral (1º Parte)', 'Juegos y técnicas de improvisación teatral.', 25, 3, '2026-10-09', '15:00', 'A definir', 'Victor Galestok'),
  ('Teatro Antropológico (1º Parte)', 'Exploración del teatro antropológico.', 25, 3, '2026-10-10', '09:30', 'A definir', 'Jorge Holovatuck'),
  ('BUNRAKU: Marionetas (1º Parte)', 'Técnicas de marionetas estilo bunraku.', 20, 3, '2026-10-10', '09:30', 'A definir', 'Alberto Torres Sayas'),
  ('Recursos con sentido (1º Parte)', 'Recursos escénicos con sentido pedagógico.', 25, 3, '2026-10-10', '09:30', 'A definir', 'Juliana Rososzka'),
  ('Códigos del mimo y la pantomima', 'Técnicas de mimo y pantomima.', 25, 3, '2026-10-10', '09:30', 'A definir', 'Adrian Miguel Martinez'),
  ('Escuelas porosas: ESI (1º Parte)', 'Educación Sexual Integral a través del teatro.', 25, 3, '2026-10-10', '09:30', 'A definir', 'Mariela Piedrabuena'),
  ('Aprender a producir y apreciar (2º Parte)', 'Segunda parte del taller de producción teatral.', 25, 3, '2026-10-10', '15:30', 'A definir', 'Ester Trozzo'),
  ('Musicoterapia comunicativa', 'Musicoterapia aplicada a la comunicación.', 25, 3, '2026-10-10', '15:30', 'A definir', 'Andrea Marcela Peralta'),
  ('Dramaterapia (2º parte)', 'Segunda parte del taller de dramaterapia.', 25, 3, '2026-10-10', '15:30', 'A definir', 'Guerrero'),
  ('La sensorialidad y el Teatro (1º Parte)', 'Exploración sensorial en la práctica teatral.', 25, 3, '2026-10-10', '15:30', 'A definir', 'Fabiola Pavetto'),
  ('Improvisación teatral (2º Parte)', 'Segunda parte del taller de improvisación.', 25, 3, '2026-10-10', '15:30', 'A definir', 'Victor Galestok'),
  ('Teatro Antropológico (2º Parte)', 'Segunda parte del teatro antropológico.', 25, 3, '2026-10-11', '10:00', 'A definir', 'Jorge Holovatuck'),
  ('BUNRAKU: Marionetas (2º Parte)', 'Segunda parte de marionetas bunraku.', 20, 3, '2026-10-11', '10:00', 'A definir', 'Alberto Torres Zayas'),
  ('Recursos con sentido (2º Parte)', 'Segunda parte de recursos escénicos.', 25, 3, '2026-10-11', '10:00', 'A definir', 'Juliana Rososzka'),
  ('La sensorialidad y el Teatro (2º Parte)', 'Segunda parte de exploración sensorial.', 25, 3, '2026-10-11', '10:00', 'A definir', 'Fabiola Pavetto'),
  ('Escuelas porosas: ESI (2º Parte)', 'Segunda parte de ESI a través del teatro.', 25, 3, '2026-10-11', '10:00', 'A definir', 'Mariela Piedrabuena'),
  ('Dramaturgia de la inmersión', 'Dramaturgia inmersiva.', 25, 3, '2026-10-11', '15:30', 'A definir', 'Jorgelina Teyseyre'),
  ('El Teatro como Dispositivo de Salud', 'Teatro aplicado a la salud.', 25, 3, '2026-10-11', '15:30', 'A definir', 'Claudio Pansera'),
  ('Teatro con Inteligencia Artificial', 'Uso de IA en la creación teatral.', 25, 3, '2026-10-11', '15:30', 'A definir', 'José María Verón'),
  ('La miseria corporal', 'Exploración de la corporalidad en el teatro.', 25, 3, '2026-10-11', '15:30', 'A definir', 'Juan Pablo Cabezas'),
  ('Cuerpo ámbito de expresión y comunicación', 'El cuerpo como medio de expresión y comunicación.', 25, 3, '2026-10-11', '15:30', 'A definir', 'Macarena Salomé Robles')
ON CONFLICT DO NOTHING;

-- ── RLS (Row Level Security) ─────────────────────────────────────────
-- Habilitar RLS en tablas sensibles si se usa el anon key desde el frontend.
-- Por ahora lo dejamos deshabilitado para que el service_role funcione sin
-- restricciones. Activar RLS cuando se agregue auth de Supabase.

-- ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE inscripciones ENABLE ROW LEVEL SECURITY;
