<?php
/**
 * api/reblog.php — POST
 * Alterna el reblog de la persona conectada, con el mismo patrón que
 * api/impacto.php: la tabla `reblogs` con clave compuesta evita duplicados y
 * el contador de la publicación se ajusta en la misma transacción.
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('POST');
mismo_origen();
$yo = exigir_sesion($pdo);

$datos = recibir_json();
if (!$datos) $datos = $_POST;

$id = isset($datos['publicacion_id']) ? (int)$datos['publicacion_id'] : (isset($datos['id']) ? (int)$datos['id'] : 0);
if ($id <= 0) {
    responder(['ok' => false, 'error' => 'Falta la publicación.'], 400);
}

$stmt = $pdo->prepare('SELECT id FROM publicaciones WHERE id = ?');
$stmt->execute([$id]);
if (!$stmt->fetch()) {
    responder(['ok' => false, 'error' => 'Esa publicación ya no existe.'], 404);
}

try {
    $pdo->beginTransaction();

    $chequeo = $pdo->prepare('SELECT 1 FROM reblogs WHERE usuario_id = ? AND publicacion_id = ?');
    $chequeo->execute([(int)$yo['id'], $id]);
    $yaEstaba = (bool)$chequeo->fetch();

    if ($yaEstaba) {
        $pdo->prepare('DELETE FROM reblogs WHERE usuario_id = ? AND publicacion_id = ?')
            ->execute([(int)$yo['id'], $id]);
        $pdo->prepare('UPDATE publicaciones SET reblogs = GREATEST(reblogs - 1, 0) WHERE id = ?')
            ->execute([$id]);
    } else {
        $pdo->prepare('INSERT INTO reblogs (usuario_id, publicacion_id) VALUES (?, ?)')
            ->execute([(int)$yo['id'], $id]);
        $pdo->prepare('UPDATE publicaciones SET reblogs = reblogs + 1 WHERE id = ?')
            ->execute([$id]);
    }

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    responder(['ok' => false, 'error' => 'No se pudo rebloguear.'], 500);
}

$conteo = $pdo->prepare('SELECT reblogs FROM publicaciones WHERE id = ?');
$conteo->execute([$id]);
$total = (int)$conteo->fetchColumn();

responder([
    'ok'         => true,
    'reblogs'    => $total,
    'reblogged'  => !$yaEstaba,
]);

