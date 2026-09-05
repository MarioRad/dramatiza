-- 003_adoptar_parte_taller_dos_dias.sql
--
-- El taller 47 ("Las llaves del aprendizaje … (2° parte)", día 2 15:30,
-- Guerrero Cartofiel) quedo de la generación anterior como fila huérfana
-- sin ponente_id. Corresponde a la segunda jornada del taller de
-- Sol Guerrero – Noelia Cartofiel (ponente 33), cuyo taller principal es el 68.
-- Se lo adopta como parte enlazada por pareja_id para que el Programa del
-- Encuentro coincida con la programación de dos días del admin.

UPDATE talleres
SET    ponente_id = 33,
       pareja_id  = 68,
       nombre     = 'Las llaves del aprendizaje: herramientas de la Dramaterapia y la Educación (2° parte)'
WHERE  id = 47;