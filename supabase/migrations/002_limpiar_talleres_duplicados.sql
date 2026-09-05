-- 002_limpiar_talleres_duplicados.sql
--
-- Quedaron talleres de la generación previa (sin ponente_id) junto a los
-- generados por la sincronización desde la tabla de ponentes. Se reasignan
-- las inscripciones a la versión canónica (vinculada a ponentes) y se
-- eliminan los duplicados viejos.
--
-- Pares mapeados (viejo -> canónico):
--   46 "El Cuerpo y La Palabra" (Lezcano)        -> 67  (Johanna Lezcano)
--   48 "BUNRAKU (1° parte)" (Alberto Torres)      -> 71  (torres sayas)
--   49 "Teatro con Inteligencia Artificial"       -> 79  (José María Verón)

-- Quita inscripciones duplicadas del mismo DNI ya existente en el canónico
-- (por la constraint UNIQUE (dni, taller_id)) antes de reasignar.
DELETE FROM inscripciones i
WHERE  i.taller_id IN (46, 48, 49)
  AND  EXISTS (
    SELECT 1 FROM inscripciones d
    WHERE d.dni = i.dni AND d.taller_id IN (67, 71, 79)
  );

-- Reasigna las inscripciones al taller canónico.
UPDATE inscripciones SET taller_id = 67 WHERE taller_id = 46;
UPDATE inscripciones SET taller_id = 71 WHERE taller_id = 48;
UPDATE inscripciones SET taller_id = 79 WHERE taller_id = 49;

-- Elimina los duplicados viejos (las inscripciones ya apuntan a los nuevos).
DELETE FROM talleres WHERE id IN (46, 48, 49);