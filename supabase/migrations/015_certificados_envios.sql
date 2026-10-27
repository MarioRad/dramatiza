-- 015: control de envíos de certificados por email
-- envios_email: cantidad de envíos registrados (incluye simulados)
-- ultimo_envio_en: fecha/hora del último envío
ALTER TABLE certificados ADD COLUMN IF NOT EXISTS envios_email INTEGER NOT NULL DEFAULT 0;
ALTER TABLE certificados ADD COLUMN IF NOT EXISTS ultimo_envio_en TIMESTAMPTZ;
