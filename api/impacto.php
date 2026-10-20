<?php
/**
 * api/impacto.php — POST
 * Alterna el impacto (♻️) de la persona conectada sobre una publicación.
 *
 * Quién reaccionó vive en la tabla `impactos` con clave primaria compuesta
 * (usuario_id, publicacion_id): eso hace IMPOSIBLE que alguien le dé dos
 * veces. La consulta decide si borra la fila (quitar) o insertarla (dar), y
 * en la misma transacción ajusta el contador de la publicación.
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

    $chequeo = $pdo->prepare('SELECT 1 FROM impactos WHERE usuario_id = ? AND publicacion_id = ?');
    $chequeo->execute([(int)$yo['id'], $id]);
    $yaEstaba = (bool)$chequeo->fetch();

    if ($yaEstaba) {
        $pdo->prepare('DELETE FROM impactos WHERE usuario_id = ? AND publicacion_id = ?')
            ->execute([(int)$yo['id'], $id]);
        $pdo->prepare('UPDATE publicaciones SET impacto = GREATEST(impacto - 1, 0) WHERE id = ?')
            ->execute([$id]);
    } else {
        $pdo->prepare('INSERT INTO impactos (usuario_id, publicacion_id) VALUES (?, ?)')
            ->execute([(int)$yo['id'], $id]);
        $pdo->prepare('UPDATE publicaciones SET impacto = impacto + 1 WHERE id = ?')
            ->execute([$id]);
    }

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    responder(['ok' => false, 'error' => 'No se pudo registrar el impacto.'], 500);
}

$conteo = $pdo->prepare('SELECT impacto FROM publicaciones WHERE id = ?');
$conteo->execute([$id]);
$total = (int)$conteo->fetchColumn();

responder([
    'ok'      => true,
    'impact'  => $total,
    'reacted' => !$yaEstaba,
]);

