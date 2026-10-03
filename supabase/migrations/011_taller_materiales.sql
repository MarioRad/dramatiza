-- 011_taller_materiales.sql — lista de materiales por taller (texto libre)
-- Los talleristas indican qué deben llevar los asistentes; se envía por mail a los inscriptos.

CREATE TABLE IF NOT EXISTS taller_materiales (
  taller_id INTEGER PRIMARY KEY REFERENCES talleres(id) ON DELETE CASCADE,
  materiales TEXT NOT NULL DEFAULT '',
  actualizado_por TEXT NOT NULL DEFAULT '',
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
