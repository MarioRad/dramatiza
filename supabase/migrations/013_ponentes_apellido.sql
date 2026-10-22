-- 013_ponentes_apellido.sql
-- El certificado imprime "Apellido, Nombre": hasta ahora el apellido se adivinaba
-- con la última palabra del nombre. Se agrega el campo para cargarlo aparte.

ALTER TABLE ponentes ADD COLUMN IF NOT EXISTS apellido TEXT NOT NULL DEFAULT '';

-- Backfill de los existentes: última palabra como apellido (formato "Nombre Apellido")
UPDATE ponentes
   SET apellido = trim(substring(nombre from '\S+$'))
 WHERE apellido = '' AND nombre ~ '\s';

-- Ajuste puntual: apellido compuesto que la regla anterior partía mal
UPDATE ponentes SET apellido = 'Torres Zayas' WHERE nombre = 'Rogelio Alberto Torres Zayas';
