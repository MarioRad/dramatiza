-- 010_auspiciantes.sql — módulo de auspiciantes ("Nos Acompañan")
-- Imágenes que se muestran en la página pública de inscripción a talleres.

CREATE TABLE IF NOT EXISTS auspiciantes (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL DEFAULT '',
  imagen TEXT NOT NULL DEFAULT '',
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auspiciantes_orden ON auspiciantes(orden, id);
