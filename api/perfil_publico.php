<?php
/**
 * api/perfil_publico.php — GET
 * Devuelve los campos públicos de un perfil sin exponer correo ni credenciales.
 * Las cuentas privadas solo muestran su identidad básica y su avatar.
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('GET');

$idRaw = isset($_GET['id']) ? (string)$_GET['id'] : '';
if (!ctype_digit($idRaw) || (int)$idRaw < 1) {
    responder(['ok' => false, 'error' => 'Perfil no válido.'], 400);
}
$id = (int)$idRaw;

$stmt = $pdo->prepare(
    "SELECT u.id, u.nombre, u.usuario, u.bio, u.color_acento, u.es_privado,
            (u.foto_perfil IS NOT NULL AND u.foto_perfil <> '') AS tiene_avatar,
            (SELECT COUNT(*) FROM publicaciones p WHERE p.usuario_id = u.id) AS publicaciones,
            (SELECT COALESCE(SUM(p.impacto), 0) FROM publicaciones p WHERE p.usuario_id = u.id) AS impacto
       FROM usuarios u
      WHERE u.id = ?
      LIMIT 1"
);
$stmt->execute([$id]);
$fila = $stmt->fetch();
if (!$fila) responder(['ok' => false, 'error' => 'No encontramos ese perfil.'], 404);

$yo = usuario_actual($pdo);
$esPrivado = !empty($fila['es_privado'])
    && (!$yo || (int)$yo['id'] !== (int)$fila['id']);

responder([
    'ok' => true,
    'privado' => $esPrivado,
    'perfil' => [
        'id' => (int)$fila['id'],
        'name' => $fila['nombre'],
        'handle' => $fila['usuario'],
        'bio' => $esPrivado ? '' : (string)($fila['bio'] ?? ''),
        'accent' => acento_valido($fila['color_acento']),
        'avatar' => !empty($fila['tiene_avatar']) ? 'api/avatar.php?id=' . (int)$fila['id'] : '',
        'isPrivate' => !empty($fila['es_privado']),
        'stats' => $esPrivado ? null : [
            'publicaciones' => (int)$fila['publicaciones'],
            'impacto' => (int)$fila['impacto'],
        ],
    ],
]);
