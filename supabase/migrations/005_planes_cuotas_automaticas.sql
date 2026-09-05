-- 005_planes_cuotas_automaticas.sql
--
-- Agrega soporte para planes con montos de cuota específicos (las cuotas no
-- tienen por qué ser iguales ni dividir exacto al total) y define los tres
-- planes que se asignan automáticamente según la fecha de inscripción
-- (marca temporal) de cada asistente del encuentro:
--   · Mayo – Junio       → $90.000   · 3 cuotas de $30.000
--   · Julio – Agosto     → $110.000  · 2 cuotas de $35.000 y 1 de $40.000
--   · Septiembre – Octubre → $130.000 · 2 cuotas de $65.000 (2ª cuota vence el 05/10)

ALTER TABLE planes_pago
  ADD COLUMN IF NOT EXISTS cuotas JSONB;

ALTER TABLE asistente_planes
  ADD COLUMN IF NOT EXISTS cuotas JSONB;

-- Normaliza nombres duplicados antes de asegurar la unicidad por nombre.
DELETE FROM planes_pago a
  USING planes_pago b
  WHERE a.nombre = b.nombre AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_planes_pago_nombre ON planes_pago (nombre);

INSERT INTO planes_pago (nombre, descripcion, monto_total, cantidad_cuotas, cuotas, activo) VALUES
('Inscripción Mayo – Junio',
 '3 cuotas de $30.000. Total $90.000.',
 90000, 3,
 '[{"numero":1,"monto":30000},{"numero":2,"monto":30000},{"numero":3,"monto":30000}]'::jsonb,
 TRUE),
('Inscripción Julio – Agosto',
 '3 cuotas: 2 de $35.000 y 1 de $40.000. Total $110.000.',
 110000, 3,
 '[{"numero":1,"monto":35000},{"numero":2,"monto":35000},{"numero":3,"monto":40000}]'::jsonb,
 TRUE),
('Inscripción Septiembre – Octubre',
 '2 cuotas de $65.000. Total $130.000. Fecha tope de la 2ª cuota: 05/10.',
 130000, 2,
 '[{"numero":1,"monto":65000},{"numero":2,"monto":65000,"fecha_tope":"2026-10-05"}]'::jsonb,
 TRUE)
ON CONFLICT (nombre) DO NOTHING;