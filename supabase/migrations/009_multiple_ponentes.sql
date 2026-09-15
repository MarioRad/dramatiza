-- 009_multiple_ponentes.sql — permitir que talleres, ponencias y conversatorios tengan múltiples ponentes
-- Ejecutar después de 008_certificados.sql

-- ── Taller ↔ Ponentes (many-to-many) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_ponentes (
  id SERIAL PRIMARY KEY,
  taller_id INTEGER NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  ponente_id INTEGER NOT NULL REFERENCES ponentes(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (taller_id, ponente_id)
);
CREATE INDEX IF NOT EXISTS idx_taller_ponentes_taller ON taller_ponentes(taller_id);
CREATE INDEX IF NOT EXISTS idx_taller_ponentes_ponente ON taller_ponentes(ponente_id);

-- ── Programa Bloque ↔ Ponentes (para ponencias y conversatorios) ─────
CREATE TABLE IF NOT EXISTS bloque_ponentes (
  id SERIAL PRIMARY KEY,
  bloque_id INTEGER NOT NULL REFERENCES programa_bloques(id) ON DELETE CASCADE,
  ponente_id INTEGER NOT NULL REFERENCES ponentes(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bloque_id, ponente_id)
);
CREATE INDEX IF NOT EXISTS idx_bloque_ponentes_bloque ON bloque_ponentes(bloque_id);
CREATE INDEX IF NOT EXISTS idx_bloque_ponentes_ponente ON bloque_ponentes(ponente_id);

-- ── Migración de datos existentes: talleres.ponente_id → taller_ponentes
INSERT INTO taller_ponentes (taller_id, ponente_id, orden)
SELECT id, ponente_id, 0 FROM talleres WHERE ponente_id IS NOT NULL
ON CONFLICT (taller_id, ponente_id) DO NOTHING;

-- ── Migración de datos existentes: ponentes tipo ponencia/conversatorio → bloque_ponentes
-- Vincula ponentes a bloques del mismo día (según dias_ponentes.fecha → programa_bloques.dia)
-- Solo si el bloque es de tipo ponencia o conversatorio y coincide el día.
DO $$
DECLARE
  r RECORD;
  bloque RECORD;
BEGIN
  FOR r IN SELECT p.id as ponente_id, p.tipo, p.dia, p.nombre, d.fecha FROM ponentes p LEFT JOIN dias_ponentes d ON d.dia = p.dia WHERE p.tipo IN ('ponencia','conversatorio') LOOP
    IF r.fecha IS NULL OR r.fecha = '' THEN CONTINUE; END IF;
    -- Convertir DD-MM-AAAA a AAAA-MM-DD para comparar con programa_bloques.dia
    DECLARE
      fecha_iso TEXT;
    BEGIN
      SELECT CASE WHEN r.fecha ~ '^\d{2}-\d{2}-\d{4}$' THEN substring(r.fecha from 7 for 4) || '-' || substring(r.fecha from 4 for 2) || '-' || substring(r.fecha from 1 for 2) ELSE r.fecha END INTO fecha_iso;
      FOR bloque IN SELECT id FROM programa_bloques WHERE dia = fecha_iso AND tipo = r.tipo LOOP
        BEGIN
          INSERT INTO bloque_ponentes (bloque_id, ponente_id, orden) VALUES (bloque.id, r.ponente_id, 0) ON CONFLICT (bloque_id, ponente_id) DO NOTHING;
        EXCEPTION WHEN others THEN NULL;
        END;
      END LOOP;
    END;
  END LOOP;
END $$;

-- Nota: talleres.ponente_id se mantiene por compatibilidad pero ya no es la fuente de verdad.
-- El campo disertante (VARCHAR) en talleres se mantiene como texto libre para mostrar nombres sin crear ponente.
