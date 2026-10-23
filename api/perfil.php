<?php
/**
 * api/perfil.php — GET / POST
 *   GET  → devuelve el perfil de quien está conectado.
 *   POST → actualiza nombre, @usuario, biografía, color de acento y privacidad.
 *
 * El @usuario es único: si otra persona ya lo usa se responde 400 y el
 * frontend conserva lo que la persona escribió para que lo corrija.
 */
require_once __DIR__ . '/../config.php';

$metodo = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

if ($metodo === 'GET') {
    $usuario = exigir_sesion($pdo);
    responder(['ok' => true, 'usuario' => usuario_json($usuario)]);
}

exigir_metodo('POST');
mismo_origen();
$yo = exigir_sesion($pdo);

$datos = recibir_json();
if (!$datos) $datos = $_POST;

$nombre   = isset($datos['nombre'])   ? trim($datos['nombre'])   : (isset($datos['name']) ? trim($datos['name']) : $yo['nombre']);
$handle   = isset($datos['usuario'])  ? trim($datos['usuario'])  : (isset($datos['handle']) ? trim($datos['handle']) : $yo['usuario']);
$bio      = isset($datos['bio'])      ? trim($datos['bio'])      : $yo['bio'];
$acento   = isset($datos['color_acento']) ? $datos['color_acento'] : (isset($datos['accent']) ? $datos['accent'] : $yo['color_acento']);
$privado  = isset($datos['es_privado']) ? $datos['es_privado'] : (isset($datos['isPrivate']) ? ($datos['isPrivate'] ? 1 : 0) : (int)$yo['es_privado']);
$avatar   = isset($datos['foto_perfil']) ? trim((string)$datos['foto_perfil']) : (string)($yo['foto_perfil'] ?? '');

// ---- Validaciones ----
if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 60) {
    responder(['ok' => false, 'error' => 'El nombre debe tener entre 3 y 60 caracteres.'], 400);
}
$handle = $handle === '' ? '@' : (strpos($handle, '@') === 0 ? $handle : '@' . $handle);
if (!preg_match('/^@[a-z0-9_.-]{2,39}$/i', $handle)) {
    responder(['ok' => false, 'error' => 'El usuario solo puede tener letras, números, punto, guion y guion bajo (ej: @ana_reyes).'], 400);
}
if (mb_strlen($bio) > 500) {
    responder(['ok' => false, 'error' => 'La biografía no puede pasar de 500 caracteres.'], 400);
}
if (mb_strlen($avatar) > 300 || ($avatar !== '' && !preg_match('~^uploads/[a-f0-9]{20}\\.(jpg|png|webp|gif)$~i', $avatar))) {
    responder(['ok' => false, 'error' => 'La foto de perfil no es válida.'], 400);
}

// ¿Otra persona ya usa ese @usuario?
$stmt = $pdo->prepare('SELECT 1 FROM usuarios WHERE usuario = ? AND id <> ? LIMIT 1');
$stmt->execute([$handle, $yo['id']]);
if ($stmt->fetch()) {
    responder(['ok' => false, 'error' => 'Ese usuario ya está tomado. Prueba con otro.'], 400);
}

$acento = acento_valido($acento);
$privado = $privado ? 1 : 0;

$stmt = $pdo->prepare(
    'UPDATE usuarios SET nombre = ?, usuario = ?, bio = ?, color_acento = ?, es_privado = ?, foto_perfil = ? WHERE id = ?'
);
$stmt->execute([$nombre, $handle, $bio === '' ? null : $bio, $acento, $privado, $avatar === '' ? null : $avatar, $yo['id']]);

$stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
$stmt->execute([$yo['id']]);
$actualizado = $stmt->fetch();

responder([
    'ok'      => true,
    'usuario' => usuario_json($actualizado),
    'mensaje' => 'Perfil actualizado',
]);

