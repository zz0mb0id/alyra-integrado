-- Ejecutar una vez sobre la base guardianes_colombia ya existente.
-- Idempotente: CREATE IF NOT EXISTS permite reintentarlo sin borrar datos.
CREATE TABLE IF NOT EXISTS recuperaciones_password (
  token_hash CHAR(64) PRIMARY KEY,
  usuario_id INT NOT NULL,
  expira_en DATETIME NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recuperacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_recuperacion_expira (expira_en),
  INDEX idx_recuperacion_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

