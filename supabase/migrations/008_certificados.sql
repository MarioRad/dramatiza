-- 008_certificados (2026-09-13) Certificados de asistencia / ponentes / talleristas
-- QR verificación + 2 firmas (gráfica y electrónica)

-- Permiso certificados en usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perm_certificados BOOLEAN NOT NULL DEFAULT TRUE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_rol_check') THEN
    ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin','superior','menu','operador'));

-- Tabla principal certificados
CREATE TABLE IF NOT EXISTS certificados (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('asistente','ponente','tallerista')),
  dni VARCHAR(20),
  ponente_id INTEGER REFERENCES ponentes(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  detalle JSONB,
  talleres_ids TEXT NOT NULL DEFAULT '',
  qr_data TEXT,
  hash_firma TEXT NOT NULL DEFAULT '',
  emitido_por TEXT NOT NULL DEFAULT '',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificados_codigo ON certificados(codigo);
CREATE INDEX IF NOT EXISTS idx_certificados_dni ON certificados(dni);
CREATE INDEX IF NOT EXISTS idx_certificados_tipo ON certificados(tipo);
CREATE INDEX IF NOT EXISTS idx_certificados_ponente ON certificados(ponente_id);

-- Asegurar que taller_asistencias exista (ya creada en 007). Si no, crear.
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

-- Configuración por defecto para certificados
INSERT INTO configuracion_evento (clave, valor) VALUES
  ('certificado_titulo', 'Encuentro Dramatiza – Salta 2026'),
  ('certificado_firma1_nombre', 'Dirección General'),
  ('certificado_firma1_cargo', 'Encuentro Dramatiza'),
  ('certificado_firma1_imagen', ''),
  ('certificado_firma2_nombre', 'Coordinación Académica'),
  ('certificado_firma2_cargo', 'Encuentro Dramatiza'),
  ('certificado_firma2_imagen', ''),
  ('certificado_horas_por_taller', '3'),
  ('certificado_lugar', 'Salta, Argentina')
ON CONFLICT (clave) DO NOTHING;
