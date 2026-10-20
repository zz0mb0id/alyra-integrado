-- =============================================================================
-- ALYRA · BASE DE DATOS ÚNICA
-- =============================================================================
-- ¿Para qué sirve? Guarda TODO el proyecto en una sola base de datos:
--   · la cuenta de Alyra (blog + juego) y su sesión;
--   · las publicaciones del diario, sus etiquetas, impactos y reblogs;
--   · el catálogo de especies y el progreso del juego Guardianes de Colombia.
-- Así, una sola cuenta sirve para publicar en el blog Y para guardar el
-- avance del juego: no hay dos sistemas de usuarios separados.
--
-- ¿Cómo la importo?
--   · HOSTING COMPARTIDO (InfinityFree, Hostinger, cPanel...):
--       1. Crea la base de datos desde el panel de tu hosting (te dará un
--          nombre, por ejemplo if0_123456_alyra).
--       2. Abre phpMyAdmin → selecciona ESA base de datos → pestaña Importar
--          → elige este archivo → Continuar.
--       3. Pon ese nombre, y los datos de usuario/contraseña, en config.php.
--       NO hace falta crear la base desde SQL: el panel ya la creó.
--   · LOCAL (XAMPP):
--       mysql -u root guardianes_colombia < database.sql
--     (creando antes la base con la línea CREATE DATABASE que está
--      comentada al inicio de este archivo, o con phpMyAdmin).
--
-- ¿Con qué archivos habla? config.php abre la conexión y la sesión; los
-- archivos de api/ escriben usuarios, publicaciones, impactos y reblogs;
-- juego/register.php, save_progress.php y get_progress.php usan usuarios y
-- progreso_especie. Todas las tablas usan InnoDB para poder usar llaves
-- foráneas y utf8mb4 para que tildes, ñ y emojis se guarden bien.
-- =============================================================================

-- ▼▼ SOLO local/XAMPP: descomenta estas dos líneas si la base todavía no ▼▼
-- ▼▼ existe (en hosting la crea el panel y aquí no hace falta).          ▼▼
-- CREATE DATABASE IF NOT EXISTS guardianes_colombia
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE guardianes_colombia;


-- -----------------------------------------------------------------------------
-- Tabla: usuarios
-- Qué guarda: LA cuenta única del proyecto. Nace en el blog (api/registro.php)
-- o en el juego (juego/register.php) y sirve para las dos cosas. Guarda la
-- contraseña SIEMPRE con password_hash() — nunca en texto plano.
-- Campos:
--   nombre        cómo se muestra (Ana Reyes / Guardian_Andino)
--   usuario       el @handle único del perfil (@ana)
--   correo        también único; con él se inicia sesión
--   color_acento  ramo de color del perfil: musgo|terracota|mostaza|agua|rosa|cielo
--   es_privado    1 = sus publicaciones no aparecen en el feed público
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(60)  NOT NULL,
  usuario        VARCHAR(40)  NOT NULL UNIQUE,
  correo         VARCHAR(160) NOT NULL UNIQUE,
  contrasena_hash VARCHAR(255) NOT NULL,
  bio            TEXT NULL,
  color_acento   VARCHAR(10)  NOT NULL DEFAULT 'musgo',
  es_privado     TINYINT(1)   NOT NULL DEFAULT 0,
  creado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tabla: sesiones
-- Qué guarda: el token de sesión de cada persona conectada. En vez de confiar
-- solo en $_SESSION de PHP (que vive en archivos temporales del servidor),
-- guardamos UN token aleatorio por sesión aquí. El navegador lo lleva en una
-- cookie HttpOnly (no la lee JavaScript), y config.php lo valida en cada
-- petición. Ventajas: la sesión sobrevive reinicios del servidor, se puede
-- cerrar desde cualquier archivo (blog o juego) y permite cerrar todas las
-- sesiones de una cuenta si se comprome la contraseña.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesiones (
  token       CHAR(64)     PRIMARY KEY,       -- hex de 64 caracteres (32 bytes)
  usuario_id  INT          NOT NULL,
  creada_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en   DATETIME     NOT NULL,
  CONSTRAINT fk_sesiones_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_sesiones_expira (expira_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tabla: publicaciones
-- Qué guarda: cada nota del diario/comunidad. El contador `impacto` y
-- `reblogs` se mantienen aquí (denormalizado) para poder ordenar y mostrar
-- rápidamente, y las personas que dieron impacto viven en la tabla `impactos`,
-- que es la que evita reacciones dobles.
-- tipo_media: 'ninguno' | 'emoji' | 'imagen' | 'video'
-- valor_media: el emoji (🪴) o la ruta del archivo subido (uploads/abc123.jpg)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publicaciones (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NOT NULL,
  texto       TEXT NOT NULL,
  tipo_media  ENUM('ninguno','emoji','imagen','video') NOT NULL DEFAULT 'ninguno',
  valor_media VARCHAR(300) NULL,
  impacto     INT NOT NULL DEFAULT 0,
  comentarios INT NOT NULL DEFAULT 0,
  reblogs     INT NOT NULL DEFAULT 0,
  creado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_publicaciones_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_publicaciones_creado (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tabla: publicaciones_etiquetas
-- Qué guarda: los #hashtags de cada publicación, uno por fila, para poder
-- buscar por etiqueta sin hacer LIKE sobre el texto.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publicaciones_etiquetas (
  publicacion_id INT NOT NULL,
  etiqueta       VARCHAR(40) NOT NULL,
  CONSTRAINT fk_etiquetas_publicacion
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
  INDEX idx_etiqueta (etiqueta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tabla: impactos
-- Qué guarda: QUIÉN le dio ♻️ a QUÉ publicación. La clave única garantiza una
-- sola reacción por persona y publicación: api/impacto.php consulta esta tabla
-- y decide si borra (quita el impacto) o inserta (lo da), ajustando después
-- el contador de la publicación.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS impactos (
  usuario_id     INT NOT NULL,
  publicacion_id INT NOT NULL,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, publicacion_id),
  CONSTRAINT fk_impactos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_impactos_publicacion
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tabla: reblogs
-- Qué guarda: quién reblogueó qué. Mismo esquema que `impactos`.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reblogs (
  usuario_id     INT NOT NULL,
  publicacion_id INT NOT NULL,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, publicacion_id),
  CONSTRAINT fk_reblogs_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_reblogs_publicacion
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tabla: comentarios
-- Qué guarda: el texto y autor de cada comentario en una publicación.
-- Una publicación puede tener muchos comentarios. La tabla `publicaciones`
-- mantiene un contador denormalizado (`comentarios`) para mostrar el total
-- rápidamente, y esta tabla guarda el detalle.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comentarios (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT NOT NULL,
  publicacion_id INT NOT NULL,
  texto          TEXT NOT NULL,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comentarios_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_comentarios_publicacion
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tabla: follows
-- Qué guarda: quién sigue a otra persona. La clave única garantiza que
-- una persona no pueda seguir a la misma dos veces.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follows (
  usuario_id     INT NOT NULL,     -- la persona que sigue
  target_user_id INT NOT NULL,   -- a quién se sigue
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, target_user_id),
  CONSTRAINT fk_follows_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_follows_target
    FOREIGN KEY (target_user_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tabla: especies
-- Qué guarda: catálogo fijo de animales/plantas del juego (coincide 1 a 1 con
-- el arreglo SPECIES de juego/script.js). Sirve para que el backend valida que
-- el id recibido por AJAX es una especie real antes de guardar puntaje, y para
-- poder sacar reportes de qué especie es la más/menos cuidada por los jugadores.
-- -----------------------------------------------------------------------------
-- Qué guarda: catálogo fijo de animales/plantas del juego (coincide 1 a 1 con
-- el arreglo SPECIES de juego/script.js). Sirve para que el backend valide que
-- el id recibido por AJAX es una especie real antes de guardar puntaje, y para
-- poder sacar reportes de qué especie es la más/menos cuidada por los jugadores.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS especies (
  id      VARCHAR(30) PRIMARY KEY,   -- mismo id de texto usado en SPECIES (ej: 'condor')
  nombre  VARCHAR(80) NOT NULL,
  tipo    ENUM('animal','planta') NOT NULL,
  zona    VARCHAR(30) NOT NULL       -- id de la región (ej: 'andina', 'orinoquia')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo de especies: 19 filas repartidas en las SEIS regiones naturales de
-- Colombia (andina, caribe, pacifico, amazonia, orinoquia, insular). Debe
-- reflejar exactamente el arreglo SPECIES de script.js: mismo id, mismo tipo
-- y misma zona. Si agregas una especie nueva allá, agrega también su fila aquí.
--
-- OJO con los ids: son la llave primaria y a ellos apunta progreso_especie,
-- así que NUNCA se cambian aunque la especie cambie de región. Por eso las
-- cinco especies andinas conservan su id aunque antes estuvieran en las zonas
-- 'paramo' y 'bosque', que ahora se fusionaron en 'andina'.
--
-- El ON DUPLICATE KEY UPDATE actualiza también `tipo` y `zona`: así, una base
-- de datos que ya estaba importada con las zonas viejas se corrige sola con
-- solo volver a ejecutar este archivo, sin borrar el progreso de nadie.
INSERT INTO especies (id, nombre, tipo, zona) VALUES
  -- Región Andina (antes 'paramo' y 'bosque')
  ('condor',     'Cóndor andino',                'animal', 'andina'),
  ('frailejon',  'Frailejón',                    'planta', 'andina'),
  ('danta',      'Danta de páramo',              'animal', 'andina'),
  ('oso',        'Oso de anteojos',              'animal', 'andina'),
  ('gallito',    'Gallito de roca andino',       'animal', 'andina'),
  -- Región Caribe
  ('tortuga',    'Tortuga marina',               'animal', 'caribe'),
  ('coral',      'Coral',                        'planta', 'caribe'),
  ('manati',     'Manatí del Caribe',            'animal', 'caribe'),
  -- Región Pacífica
  ('rana',       'Rana dorada venenosa',         'animal', 'pacifico'),
  ('ballena',    'Ballena jorobada',             'animal', 'pacifico'),
  -- Región Amazonía
  ('jaguar',     'Jaguar',                       'animal', 'amazonia'),
  ('delfin',     'Delfín rosado',                'animal', 'amazonia'),
  ('guacamayo',  'Guacamayo',                    'animal', 'amazonia'),
  ('nutria',     'Nutria gigante',               'animal', 'amazonia'),
  -- Región Orinoquía
  ('chiguiro',   'Chigüiro',                     'animal', 'orinoquia'),
  ('palmero',    'Oso palmero',                  'animal', 'orinoquia'),
  ('moriche',    'Palma de moriche',             'planta', 'orinoquia'),
  -- Región Insular
  ('cangrejo',   'Cangrejo negro de Providencia','animal', 'insular'),
  ('piquero',    'Piquero de Malpelo',           'animal', 'insular')
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  tipo   = VALUES(tipo),
  zona   = VALUES(zona);

-- Red de seguridad para bases importadas con la versión anterior del juego:
-- si por alguna razón quedaron filas con las zonas viejas, esta sentencia las
-- reubica en la región andina sin tocar el progreso de los jugadores.
UPDATE especies SET zona = 'andina' WHERE zona IN ('paramo', 'bosque');

-- -----------------------------------------------------------------------------
-- Tabla: progreso_especie
-- Qué guarda: la salud actual (0-100) que un jugador ha logrado en cada
-- especie jugando los minijuegos, además de cuántas veces ganó/perdió.
-- Esto es lo que juego/save_progress.php actualiza cada vez que termina un
-- minijuego, y lo que juego/get_progress.php lee al abrir la página para que
-- el jugador siga donde lo dejó (en vez de reiniciar siempre en 0).
-- Relación: cada fila pertenece a un usuario de LA CUENTA ÚNICA (usuario_id)
-- y a una especie (especie_id) -> combinación única para no duplicar progreso.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS progreso_especie (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT NOT NULL,
  especie_id     VARCHAR(30) NOT NULL,
  salud          INT NOT NULL DEFAULT 0,      -- 0 a 100, empieza en 0
  veces_ganadas  INT NOT NULL DEFAULT 0,
  veces_perdidas INT NOT NULL DEFAULT 0,
  extinto        TINYINT(1) NOT NULL DEFAULT 0,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                     ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_progreso_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_progreso_especie
    FOREIGN KEY (especie_id) REFERENCES especies(id) ON DELETE CASCADE,
  UNIQUE KEY unico_usuario_especie (usuario_id, especie_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- MIGRACIÓN DESDE LA VERSIÓN ANTIGUA (solo si ya tenías datos)
-- =============================================================================
-- La versión anterior tenía dos tablas separadas: `jugadores` (solo el juego)
-- y ninguna para el blog. Si tu base de datos vieja ya tiene jugadores con
-- progreso, descomenta el bloque de abajo ANTES de borrar nada: copia cada
-- jugador a la tabla `usuarios` (el handle sale del nombre) y reapunta el
-- progreso al id nuevo. La tabla vieja queda intacta hasta que la borres.
--
-- INSERT INTO usuarios (nombre, usuario, correo, contrasena_hash)
-- SELECT nombre_usuario,
--        CONCAT('@', LOWER(REPLACE(nombre_usuario, ' ', '_'))),
--        correo,
--        contrasena_hash
-- FROM jugadores;
--
-- UPDATE progreso_especie p
--   JOIN jugadores j ON p.jugador_id = j.id
--   JOIN usuarios  u ON u.correo = j.correo
--   SET p.usuario_id = u.id;

