# Alyra

Blog comunitario sobre reciclaje y conservación, con **Guardianes de Colombia**: un juego educativo sobre los ecosistemas colombianos.

El proyecto requiere **MySQL y una sola cuenta compartida**: quien se registra en el blog puede publicar, y esa misma cuenta guarda el avance del juego. Las publicaciones del blog son públicas y cualquier visitante puede leer el feed sin iniciar sesión; para publicar, comentar o reaccionar sí hay que iniciar sesión.

## Qué incluye

- **Blog/comunidad**: publicaciones públicas con texto, etiquetas, emoji o foto/video, comentarios persistidos, impacto (♻️), reblogs, perfil editable y subida de archivos. El perfil privado lo excluye de las sugerencias de comunidad; no oculta sus publicaciones.
- **Juego**: 6 regiones de Colombia, 19 especies con datos reales, 8 minijuegos y salud por especie que empieza en 0.
- **Backend PHP + MySQL**: API en `api/`, sesión por token guardado en la base de datos con cookie HttpOnly, contraseñas con `password_hash()`.

## Estructura

```
alyra_1.html        Página principal (blog, comunidad, perfil, juego)
alyra.css           Estilos de la página principal
herbario.css        Sistema de diseño compartido (colores, tipografía, animaciones)
config.php          Conexión a MySQL + sesión compartida + helpers de la API
database.sql        Esquema UNIFICADO (usuarios, sesiones, publicaciones, especies…)
test_api.py         Prueba integral del backend (53 comprobaciones)
api/
  sesion.php        GET  ¿quién está conectado?
  registro.php      POST crea cuenta (blog y juego comparten este archivo)
  login.php         POST correo + contraseña -> sesión
  logout.php        POST cierra la sesión
  perfil.php        GET/POST perfil (nombre, @usuario, bio, color, privacidad)
  password.php      POST cambio de contraseña (pide la actual)
  eliminar_cuenta.php POST borra la cuenta en cascada
  comunidad.php     GET  contador de miembros y cuentas sugeridas
  publicaciones.php GET feed público / POST crea publicación
  comentarios.php  GET lista comentarios / POST guarda comentario y actualiza contador
  impacto.php       POST alterna el impacto de una publicación
  reblog.php        POST alterna el reblog
  subir_media.php   POST sube una foto o video a uploads/
uploads/            fotos y videos subidos (con .htaccess que impide ejecutar PHP)
juego/
  index.html        Juego, archivo estático del prototipo; no se usa como respaldo persistente
  index.php         Juego, versión con PHP + MySQL (versión principal)
  script.js         Toda la lógica del juego y los 8 minijuegos
  style.css         Estilos del juego
  config.php        Carga el config de la raíz (misma sesión y misma base)
  register.php      Registro de jugadores -> llama a api/registro.php
  save_progress.php Guarda el progreso en progreso_especie
  get_progress.php  Lee el progreso guardado
  import_progress.php Copia progreso local previa confirmación; no sobrescribe filas MySQL
  logout.php        Cierra la sesión compartida
```


## Integración realizada

Esta copia combina la interfaz y el backend PHP/MySQL con las funciones de comunidad que ya existían en la otra versión. Se conservó PHP/MySQL como backend único porque esa versión ya contiene el esquema compartido de usuarios, sesiones, publicaciones, comentarios y progreso del juego; la otra versión utiliza TanStack Start + Supabase y tiene un esquema diferente, por lo que conectar ambas bases directamente habría dejado dos fuentes de datos incompatibles.

- El feed público carga las publicaciones desde MySQL a través de `api/publicaciones.php`, también para visitantes sin sesión.
- El botón de comentarios de cada publicación abre una lista cargada desde `api/comentarios.php`.
- Las personas autenticadas pueden enviar comentarios; el servidor valida sesión, longitud y existencia de la publicación.
- El comentario y el contador de la publicación se guardan dentro de una transacción.
- El inicio de sesión se persiste en la tabla `sesiones` mediante un token aleatorio y una cookie `HttpOnly`; `api/sesion.php` restaura la cuenta al volver a abrir la página.
- La interfaz escapa el texto de autor, fecha y comentario antes de insertarlo en el HTML.

**Verificación de TiDB:** la base nueva `guardianes_colombia` tiene las 10 tablas del esquema y 19 especies. Al inicializarla había 0 usuarios y 0 filas de progreso; no se tocaron las bases internas ni la base `test`.

El juego mantiene el progreso antiguo en `localStorage`. Al usar el juego PHP e iniciar sesión desde el mismo navegador, si el nombre local coincide con el de la cuenta, se pregunta si se quiere copiar ese progreso a MySQL. La importación solo agrega especies que todavía no tienen progreso en esa cuenta. Si se rechaza, la copia local permanece intacta.

## Cómo ejecutarlo en local (XAMPP)

1. Crea la base de datos e impórtale el esquema:
   ```bash
   mysql -u root -e "CREATE DATABASE guardianes_colombia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
   mysql -u root guardianes_colombia < database.sql
   ```
   (En phpMyAdmin: crear la base y usar pestaña **Importar** con `database.sql`.)
2. Revisa los datos de conexión en `config.php` (`localhost`, `guardianes_colombia`, `root`, sin contraseña — esos son los de XAMPP).
3. Levanta un servidor PHP:
   ```bash
   php -S localhost:8765
   ```
4. Abre `http://localhost:8765/alyra_1.html`.

### Probar el backend sin tocar el navegador

Con el servidor corriendo:

```bash
python test_api.py                    # contra http://127.0.0.1:8790
ALYRA_URL=http://127.0.0.1:8765 python test_api.py   # otro puerto
```

Recorre registro, sesión, publicación, subida de foto, impactos, reblogs, perfil, contraseña, privacidad, sesión compartida con el juego y borrado en cascada.

## Publicar en Vercel con PHP + MySQL

`vercel.json` configura el runtime comunitario `vercel-php` y un único
`api/index.php` enruta los endpoints del blog y del juego. Así se conserva el
límite de funciones del plan Hobby. Las rutas estáticas del juego continúan
sirviéndose desde `juego/`.

En Vercel ya están creadas `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASS`
para Production. Después de cambiar la contraseña, actualiza `DB_PASS` y vuelve
a desplegar. Para TiDB Cloud
Starter, `DB_PORT` es `4000` y el nombre de usuario incluye el prefijo de la
instancia. La conexión usa TLS y el certificado raíz del runtime. No se guardan
credenciales en Git. Mientras no estén configuradas, las funciones responden
con un error 503 legible; el feed público necesita una conexión MySQL activa.

TiDB Cloud Starter es una opción MySQL-compatible con una cuota gratuita. Al
crear la instancia, deja el límite de gasto mensual en `0`: al agotarse la
cuota, TiDB limita o pausa el servicio en vez de cobrar excedentes. Revisa las
condiciones y la cuota vigente en el panel antes de crearla.

El esquema `database.sql` usa `CREATE TABLE IF NOT EXISTS` y actualiza el
catálogo de especies sin borrar las filas de `progreso_especie`. Se importó en
la base nueva de TiDB después de confirmar que estaba vacía. No importes este
esquema en otra base con datos sin respaldarla y revisar su estructura.

Las fotos y los videos todavía requieren conectar Vercel Blob. Vercel no ofrece
disco persistente a las Functions; en esta configuración el endpoint los
rechaza con un mensaje claro, mientras que las publicaciones de texto siguen
el flujo normal. No se ha creado un Blob Store ni se han añadido credenciales.

### Alternativa: hosting con PHP + MySQL

Sirve con **InfinityFree, Hostinger, cPanel** o cualquier hosting que ejecute PHP 7.4+ con `pdo_mysql` y MySQL.

1. **Crea la base de datos** desde el panel del hosting (te dará un nombre como `if0_123456_alyra`) y un usuario/contraseña.
2. **Importa `database.sql`** con phpMyAdmin dentro de esa base de datos. En hosting ya existe, así que las líneas `CREATE DATABASE` del archivo vienen comentadas a propósito.
3. **Sube todo el contenido de esta carpeta** a `htdocs/` (FTP del panel o el gestor de archivos). Debe quedar así: `alyra_1.html` en la raíz, junto a `config.php`, con `api/`, `juego/` y `uploads/` al lado.
4. **Edita `config.php`** con los datos del paso 1 (o define `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` desde el panel, que tienen prioridad).
5. **Da permisos de escritura a `uploads/`** (755 suele bastar). Si el hosting no deja escribir ahí, el servidor responde un mensaje claro al intentar subir una foto.
6. Abre tu dominio: el blog carga las publicaciones desde la base y el juego pide cuenta (o usa la que ya tengas del blog).

## Requisito de hosting

El blog y el juego requieren PHP con `pdo_mysql` y una base MySQL accesible. En
GitHub Pages o al abrir el HTML con doble clic no se pueden guardar datos. En
Vercel, las rutas PHP usan el runtime configurado en `vercel.json`.

## Seguridad incluida

- Contraseñas con `password_hash()` / `password_verify()`, nunca texto plano.
- Sesión por token aleatorio de 32 bytes en la tabla `sesiones`, viajando en una cookie **HttpOnly** (JavaScript no la puede leer) con `SameSite=Lax`.
- Consultas siempre con parámetros preparados: sin inyección SQL.
- Todas las peticiones que modifican datos rechazan un `Origin` de otro sitio (defensa anti-CSRF), además de lo anterior.
- El texto de las publicaciones se guarda tal cual y **se escapa al pintarlo** en el navegador, así que un `<script>` se muestra como texto.
- Las fotos/videos se validan por tipo real (`finfo` + `getimagesize`), reciben nombre aleatorio y viven en `uploads/`, carpeta con `.htaccess` que prohíbe ejecutar scripts.

## Diseño

Dirección de arte de **herbario botánico**: papel crema, tinta cálida, aguadas de acuarela por región y animaciones suaves. Tipografías: Fraunces, Hanken Grotesk y Caveat. El sistema de diseño (colores, radios, sombras y animaciones) vive en `herbario.css` y lo usan tanto la página principal como el juego.
