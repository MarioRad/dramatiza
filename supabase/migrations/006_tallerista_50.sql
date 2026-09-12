-- 006_tallerista_50.sql
-- Soporte para plan de talleristas: paga el 50% del plan.
-- Se agrega flag es_tallerista a asistente_planes; cuando es TRUE el monto_total y cuotas se guardan al 50%.

ALTER TABLE asistente_planes
  ADD COLUMN IF NOT EXISTS es_tallerista BOOLEAN NOT NULL DEFAULT FALSE;

-- Opcional: marcar planes base como "plan de tallerista" (informativo)
ALTER TABLE planes_pago
  ADD COLUMN IF NOT EXISTS es_tallerista BOOLEAN NOT NULL DEFAULT FALSE;
