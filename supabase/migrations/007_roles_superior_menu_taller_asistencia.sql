-- 007_roles_superior_menu_taller_asistencia (2026-09-12) Plan App Dramatiza Movil Fase 0
-- Extender ROLES_VALIDOS a ['admin','superior','menu','operador'] - DB 192.168.100.129
-- No usar Supabase: usar postgres local 192.168.100.129:5432/inscripciones

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_rol_check') THEN
    ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin','superior','menu','operador'));

-- operador_taller_asignaciones
CREATE TABLE IF NOT EXISTS operador_taller_asignaciones (
  id SERIAL PRIMARY KEY,
  operador_username TEXT NOT NULL REFERENCES usuarios(username) ON DELETE CASCADE,
  taller_id INTEGER NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  dia DATE NOT NULL,
  bloque_id INTEGER REFERENCES programa_bloques(id) ON DELETE SET NULL,
  creado_por TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_op_taller_asig_operador ON operador_taller_asignaciones(operador_username);
CREATE INDEX IF NOT EXISTS idx_op_taller_asig_dia ON operador_taller_asignaciones(dia);

-- taller_asistencias ingreso/egreso
CREATE TABLE IF NOT EXISTS taller_asistencias (
  id SERIAL PRIMARY KEY,
  dni TEXT NOT NULL,
  taller_id INTEGER NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  bloque_id INTEGER REFERENCES programa_bloques(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  usuario TEXT,
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_taller_asist ON taller_asistencias (dni, taller_id, COALESCE(bloque_id, -1), tipo);
CREATE INDEX IF NOT EXISTS idx_taller_asist_dni ON taller_asistencias(dni);
CREATE INDEX IF NOT EXISTS idx_taller_asist_taller ON taller_asistencias(taller_id);
