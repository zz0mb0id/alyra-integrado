<?php
/**
 * config.php
 * =============================================================================
 * El corazón del backend de Alyra: la conexión a MySQL y la SESIÓN compartida
 * entre el blog y el juego. Lo incluyen los archivos de api/ y los de juego/,
 * así que una sola cuenta (y una sola cookie) sirve para las dos cosas.
 *
 * ¿Qué expone?
 *   $pdo                      conexión PDO lista para usar (o muere con JSON 500)
 *   usuario_actual($pdo)      quién es la persona conectada, o null
 *   sesion_crear($pdo, id)    crea el token de sesión y pone la cookie
 *   sesion_cerrar($pdo)       borra el token y limpia la cookie
 *   exigir_metodo($m)         responde 405 si la petición no es de ese método
 *   exigir_sesion($pdo)       responde 401 si no hay nadie conectado
 *   recibir_json()            lee el cuerpo JSON de la petición
 *   responder($datos, $cod)   responde JSON y termina
 *   mismo_origen()            defensa anti-CSRF: rechaza POST de otro origen
 *
 * ¿Qué hay que configurar? Host, puerto, nombre de base, usuario y contraseña
 * según tu proveedor. En Vercel se definen como variables de entorno
 * (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS), nunca se guardan en Git.
 * =============================================================================
 */

// ---- Datos de conexión a MySQL (ajústalos a tu propio servidor) ----
$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbName = getenv('DB_NAME') ?: 'guardianes_colombia';
$dbUser = getenv('DB_USER') ?: 'root';
$dbPass = getenv('DB_PASS') !== false ? getenv('DB_PASS') : '';
$dbPort = getenv('DB_PORT') ?: '3306';

// Vercel no incluye una base local: exige que la conexión MySQL se configure
// explícitamente en el panel antes de servir las funciones del backend.
if (getenv('VERCEL') && (!getenv('DB_HOST') || !getenv('DB_NAME') || !getenv('DB_USER') || getenv('DB_PASS') === false || !getenv('DB_PORT'))) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Falta configurar la conexión MySQL del proyecto.']);
    exit;
}

// Constantes de la sesión compartida.
define('ALYRA_COOKIE',    'alyra_sesion');            // nombre de la cookie
define('ALYRA_DURACION',  60 * 24 * 60 * 60);         // 60 días en segundos
define('ALYRA_RAMPS',     'musgo,terracota,mostaza,agua,rosa,cielo');

/* Zona horaria compartida por PHP y MySQL.
   Si cada uno usa la suya, las fechas no cuadran: el "tiempo relativo" del
   diario ("hace 5 min") saldría corrido y las publicaciones parecerían del
   futuro o del pasado. Fijamos la de Colombia (sin horario de verano) tanto
   en PHP como en la sesión de MySQL, así da igual qué zona use el servidor
   del hosting. */
date_default_timezone_set('America/Bogota');

try {
    // PDO = capa de PHP para hablar con MySQL de forma segura. "utf8mb4" para
    // que tildes, ñ y emojis se guarden bien.
    $opcionesPdo = [
            // Si algo sale mal, PDO lanza una excepción en vez de fallar en silencio.
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            // Los resultados llegan como arreglos asociativos: $fila['nombre'].
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Preparadas reales de MySQL: los ? se sustituyen en la base de datos,
            // no en PHP, que es lo que hace imposible una inyección SQL.
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
    if (getenv('VERCEL')) {
        // TiDB Cloud Starter exige TLS. PHP en Vercel usa el bundle CA de Debian;
        // DB_SSL_CA permite indicar otra ruta si el runtime/proveedor lo requiere.
        // PHP 8.5 movió estos atributos a Pdo\\Mysql; el fallback mantiene
        // compatibilidad con runtimes anteriores sin emitir deprecaciones.
        $sslCaAttr = class_exists('Pdo\\Mysql')
            ? constant('Pdo\\Mysql::ATTR_SSL_CA')
            : PDO::MYSQL_ATTR_SSL_CA;
        $sslVerifyAttr = class_exists('Pdo\\Mysql')
            ? constant('Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT')
            : PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT;
        $opcionesPdo[$sslCaAttr] = getenv('DB_SSL_CA') ?: '/etc/ssl/certs/ca-certificates.crt';
        $opcionesPdo[$sslVerifyAttr] = true;
    }
    $pdo = new PDO(
        "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4",
        $dbUser,
        $dbPass,
        $opcionesPdo
    );
    // Que NOW() de MySQL use la misma zona que PHP (America/Bogota = UTC-5).
    $pdo->exec("SET time_zone = '-05:00'");
} catch (PDOException $e) {
    // Si la base de datos no está disponible, respondemos en JSON para que el
    // JavaScript que llamó a este archivo pueda mostrar un mensaje claro (y
    // para que alyra_1.html detecte el fallo y caiga a la versión estática).
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'No se pudo conectar a la base de datos.']);
    exit;
}


/* =============================================================================
   SESIÓN POR TOKEN (la misma para el blog y para el juego)
   -----------------------------------------------------------------------------
   En vez de confiar solo en $_SESSION de PHP —que vive en archivos temporales
   del servidor y se pierde si el hosting los limpia— guardamos un token
   aleatorio por sesión en la tabla `sesiones`. El navegador lo lleva en una
   cookie HttpOnly: la lee solo el servidor, nunca el JavaScript, así que un
   XSS no roba la sesión con document.cookie.
   ========================================================================== */

/** Genera un token de 64 caracteres hexadecimales (32 bytes de azar). */
function sesion_token()
{
    return bin2hex(random_bytes(32));
}

/** ¿La petición viene por HTTPS (directo o a través del proxy del hosting)? */
function es_https()
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    return (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
}

/**
 * Crea la sesión de una persona: escribe el token en la base de datos y le
 * pone la cookie al navegador. Devuelve el token.
 */
function sesion_crear(PDO $pdo, $usuarioId)
{
    $token = sesion_token();
    $expira = date('Y-m-d H:i:s', time() + ALYRA_DURACION);

    $stmt = $pdo->prepare('INSERT INTO sesiones (token, usuario_id, expira_en) VALUES (?, ?, ?)');
    $stmt->execute([$token, (int)$usuarioId, $expira]);

    setcookie(ALYRA_COOKIE, $token, [
        'expires'  => time() + ALYRA_DURACION,
        'path'     => '/',
        'secure'   => es_https(),   // en http (localhost) no se puede marcar secure
        'httponly' => true,         // el JavaScript del navegador NO la puede leer
        'samesite' => 'Lax',        // otros sitios no la mandan en sus formularios
    ]);
    $_COOKIE[ALYRA_COOKIE] = $token; // visible de inmediato para el resto de este request
    return $token;
}

/** Cierra la sesión actual: borra el token de la base y limpia la cookie. */
function sesion_cerrar(PDO $pdo)
{
    $token = isset($_COOKIE[ALYRA_COOKIE]) ? $_COOKIE[ALYRA_COOKIE] : '';
    if ($token !== '') {
        try {
            $pdo->prepare('DELETE FROM sesiones WHERE token = ?')->execute([$token]);
        } catch (PDOException $e) {
            // Aunque falle el borrado, la cookie se limpia igual.
        }
        unset($_COOKIE[ALYRA_COOKIE]);
    }
    setcookie(ALYRA_COOKIE, '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

/**
 * ¿Quién está conectado? Valida la cookie contra la tabla `sesiones` y
 * devuelve la fila de `usuarios`, o null si no hay sesión vigente.
 */
function usuario_actual(PDO $pdo)
{
    $token = isset($_COOKIE[ALYRA_COOKIE]) ? $_COOKIE[ALYRA_COOKIE] : '';
    // El formato se valida antes de tocar la base: cualquier cosa que no sean
    // 64 hexadecimales no llega a una consulta.
    if ($token === '' || !preg_match('/^[a-f0-9]{64}$/', $token)) return null;

    $stmt = $pdo->prepare(
        'SELECT u.* FROM sesiones s
           INNER JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token = ? AND s.expira_en > NOW()
          LIMIT 1'
    );
    $stmt->execute([$token]);
    $fila = $stmt->fetch();
    return $fila ? $fila : null;
}

/** Borra de paso las sesiones vencidas (mantenimiento barato, 1 de cada 50). */
function sesiones_purgar(PDO $pdo)
{
    static $hecho = false;
    if ($hecho) return;
    $hecho = true;
    if (mt_rand(1, 50) !== 1) return;
    try {
        $pdo->exec('DELETE FROM sesiones WHERE expira_en < NOW()');
    } catch (PDOException $e) {
        // El mantenimiento nunca debe romper una petición.
    }
}


/* =============================================================================
   HELPERS DE API (los usan todos los archivos de api/ y los de juego/)
   ========================================================================== */

/** Lee el cuerpo JSON de la petición. Si no viene JSON, devuelve []. */
function recibir_json()
{
    $crudo = file_get_contents('php://input');
    $datos = json_decode($crudo, true);
    return is_array($datos) ? $datos : [];
}

/** Responde en JSON (sin cachear) y termina el script. */
function responder($datos, $codigo = 200)
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Si la petición no es del método pedido, responde 405 y corta. */
function exigir_metodo($metodo)
{
    $real = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
    if (strtoupper($real) !== strtoupper($metodo)) {
        responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
    }
}

/**
 * Exige haya sesión; si no, responde 401 y corta. Devuelve la fila de usuario.
 */
function exigir_sesion(PDO $pdo)
{
    $usuario = usuario_actual($pdo);
    if (!$usuario) {
        responder(['ok' => false, 'error' => 'Debes iniciar sesión para hacer esto.'], 401);
    }
    return $usuario;
}

/**
 * Defensa anti-CSRF para las peticiones que cambian datos: si el navegador
 * manda la cabecera Origin (lo hacen todos al enviar datos), su dominio debe
 * coincidir con el de este sitio. Una página ajena, por muy truquera que sea,
 * no puede fingir venir de alyra-tu-dominio.com.
 */
function mismo_origen()
{
    if (empty($_SERVER['HTTP_ORIGIN'])) return; // peticiones sin Origin (curl, apps)
    $origen = $_SERVER['HTTP_ORIGIN'];
    $hostPeticion = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    $hostOrigen = parse_url($origen, PHP_URL_HOST);
    $esquemaOrigen = strtolower((string)parse_url($origen, PHP_URL_SCHEME));
    if (!$hostOrigen || !in_array($esquemaOrigen, ['http', 'https'], true) || $hostPeticion === '') {
        responder(['ok' => false, 'error' => 'Origen no permitido.'], 403);
    }

    $hostOrigen = strtolower($hostOrigen);
    $hostDestino = strtolower((string)parse_url('http://' . $hostPeticion, PHP_URL_HOST));
    $puertoOrigen = parse_url($origen, PHP_URL_PORT);
    $puertoDestino = parse_url('http://' . $hostPeticion, PHP_URL_PORT);
    $puertoOrigen = $puertoOrigen !== null ? (int)$puertoOrigen : ($esquemaOrigen === 'https' ? 443 : 80);
    $puertoDestino = $puertoDestino !== null ? (int)$puertoDestino : (es_https() ? 443 : 80);

    // Host y puerto exactos: un sitio abierto en otro puerto local también
    // es otro origen y no debe poder enviar acciones usando la cookie de Alyra.
    if ($hostOrigen !== $hostDestino || $puertoOrigen !== $puertoDestino) {
        responder(['ok' => false, 'error' => 'Origen no permitido.'], 403);
    }
}

/** Escapa un texto para poder imprimirlo dentro de HTML sin que se ejecute. */
function escapar($texto)
{
    return htmlspecialchars((string)$texto, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Envío opcional de correo transaccional mediante Resend (sin dependencias). */
function enviar_correo_alyra($destino, $asunto, $html)
{
    $apiKey = getenv('RESEND_API_KEY');
    $remitente = getenv('ALYRA_FROM_EMAIL');
    if (!$apiKey || !$remitente || !function_exists('curl_init')) return false;
    $payload = json_encode([
        'from' => $remitente,
        'to' => [(string)$destino],
        'subject' => (string)$asunto,
        'html' => (string)$html,
    ], JSON_UNESCAPED_UNICODE);
    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $apiKey, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_TIMEOUT => 12,
    ]);
    $respuesta = curl_exec($ch);
    $estado = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($respuesta === false || $estado < 200 || $estado >= 300) {
        error_log('Alyra: no se pudo enviar correo transaccional (HTTP ' . $estado . '). ' . $error);
        return false;
    }
    return true;
}

function url_publica_alyra()
{
    $base = rtrim(getenv('ALYRA_PUBLIC_URL') ?: 'https://alyra-recicla.vercel.app', '/');
    return $base;
}

/** Valida que el color de acento sea uno de los seis ramos del herbario. */
function acento_valido($color)
{
    $permitidos = explode(',', ALYRA_RAMPS);
    return in_array((string)$color, $permitidos, true) ? (string)$color : 'musgo';
}

/**
 * Convierte una fecha de la base en texto humano: "ahora", "hace 12 min",
 * "hace 3 días", "12/04/25".
 */
function tiempo_relativo($fecha)
{
    $ts = strtotime($fecha);
    if (!$ts) return '';
    $s = time() - $ts;
    if ($s < 60) return 'ahora';
    if ($s < 3600) return 'hace ' . intdiv($s, 60) . ' min';
    if ($s < 86400) return 'hace ' . intdiv($s, 3600) . ' h';
    if ($s < 604800) return 'hace ' . intdiv($s, 86400) . ' días';
    return date('d/m/y', $ts);
}

/**
 * Devuelve el @handle único más parecido al nombre pedido: le quita tildes,
 * espacios y símbolos, y si ya lo usa otra persona le agrega un número.
 */
function usuario_unico(PDO $pdo, $nombre)
{
    $base = (string)$nombre;
    if (function_exists('iconv')) {
        $translit = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $base);
        if ($translit) $base = $translit;
    }
    $base = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '', $base)));
    if ($base === '') $base = 'guardian';

    $intento = $base;
    $n = 1;
    while (true) {
        $candidato = '@' . substr($intento . ($n > 1 ? $n : ''), 0, 38);
        $stmt = $pdo->prepare('SELECT 1 FROM usuarios WHERE usuario = ? LIMIT 1');
        $stmt->execute([$candidato]);
        if (!$stmt->fetch()) return $candidato;
        $n++;
        if ($n > 200) { // red de seguridad, no debería llegar aquí
            $candidato = '@' . substr($intento . mt_rand(1000, 9999), 0, 38);
            return $candidato;
        }
    }
}

/**
 * Crea una cuenta y abre su sesión. La usan api/registro.php (blog) y
 * juego/register.php (juego), para que las dos puertas de entrada hagan
 * exactamente lo mismo.
 * Devuelve ['ok'=>true, 'usuario'=>fila] o ['ok'=>false, 'error'=>mensaje].
 */
function crear_cuenta(PDO $pdo, $nombre, $correo, $contrasena, $handleSugerido = '')
{
    $nombre = trim((string)$nombre);
    $correo = strtolower(trim((string)$correo));

    if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 60) {
        return ['ok' => false, 'error' => 'El nombre debe tener entre 3 y 60 caracteres.'];
    }
    if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'error' => 'El correo no es válido.'];
    }
    if (mb_strlen($contrasena) < 6) {
        return ['ok' => false, 'error' => 'La contraseña debe tener al menos 6 caracteres.'];
    }

    // ¿Ese correo ya está registrado?
    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE correo = ? LIMIT 1');
    $stmt->execute([$correo]);
    $existente = $stmt->fetch();

    if ($existente) {
        // Es quien ya tenía cuenta: para entrar solo debe dar la contraseña
        // correcta (password_verify compara contra el hash guardado).
        if (password_verify($contrasena, $existente['contrasena_hash'])) {
            sesion_crear($pdo, $existente['id']);
            return ['ok' => true, 'usuario' => $existente, 'mensaje' => '¡Bienvenido de nuevo, ' . $existente['nombre'] . '!'];
        }
        return ['ok' => false, 'error' => 'Ya existe una cuenta con ese correo y otra contraseña.'];
    }

    $handle = $handleSugerido !== '' ? $handleSugerido : usuario_unico($pdo, $nombre);
    $handle = strpos($handle, '@') === 0 ? $handle : '@' . $handle;
    // Por si el handle sugerido ya estaba ocupado, lo hace único igual.
    $chequeo = $pdo->prepare('SELECT 1 FROM usuarios WHERE usuario = ? LIMIT 1');
    $chequeo->execute([$handle]);
    if ($chequeo->fetch()) $handle = usuario_unico($pdo, $nombre);

    $hash = password_hash($contrasena, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare(
        'INSERT INTO usuarios (nombre, usuario, correo, contrasena_hash)
         VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$nombre, $handle, $correo, $hash]);
    $id = (int)$pdo->lastInsertId();

    sesion_crear($pdo, $id);

    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    return ['ok' => true, 'usuario' => $stmt->fetch(), 'mensaje' => '¡Cuenta creada! Bienvenida, ' . $nombre . '.'];
}

/**
 * La fila de usuario tal como la consume el frontend de alyra_1.html:
 * los mismos nombres que tenía el arreglo local `users` de antes, para que el
 * JavaScript no tenga que cambiar de forma.
 */
function usuario_json($u)
{
    if (!$u) return null;
    return [
        'id'      => (int)$u['id'],
        'name'    => $u['nombre'],
        'handle'  => $u['usuario'],
        'email'   => $u['correo'],
        'bio'     => (string)($u['bio'] ?? ''),
        'avatar'  => !empty($u['foto_perfil']) ? 'api/avatar.php?id=' . (int)$u['id'] : '',
        'accent'  => acento_valido($u['color_acento']),
        'isPrivate' => !empty($u['es_privado']),
        'creado'  => $u['creado_en'] ?? '',
    ];
}

