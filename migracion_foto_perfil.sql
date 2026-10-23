-- Ejecutar una sola vez en la base MySQL/TiDB que ya usa Alyra.
-- Requiere que foto_perfil ya exista en usuarios (VARCHAR(300)); amplía
-- la columna para guardar una foto JPEG pequeña codificada en base64.
ALTER TABLE usuarios MODIFY COLUMN foto_perfil MEDIUMTEXT NULL;
