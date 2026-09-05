-- 004_encuentro_inscripciones_campos.sql
--
-- Extiende la tabla encuentro_inscripciones para conservar las columnas del
-- formulario de Google Forms que se importa (Marca temporal, fecha de
-- nacimiento, provincia, ciudad/localidad, ocupación y opción en pago de
-- cuotas) y agrega la flag "oculto" para ocultar filas sin borrarlas.

ALTER TABLE encuentro_inscripciones
  ADD COLUMN IF NOT EXISTS marca_temporal TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fecha_nacimiento TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provincia TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ciudad TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ocupacion TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS opcion_pago TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS oculto BOOLEAN NOT NULL DEFAULT FALSE;