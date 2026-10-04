-- 012_ponentes_dni — DNI opcional en ponentes (solo para certificados, no se publica en programa)
ALTER TABLE ponentes ADD COLUMN IF NOT EXISTS dni VARCHAR(20) NOT NULL DEFAULT '';
