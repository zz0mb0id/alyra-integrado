<?php
/** 
 * api/comentarios.php — GET / POST
 *   GET  → devuelve los comentarios de una publicación (puede leerse sin sesión)
 *   POST → crea un comentario en una publicación (requiere sesión)
 */

require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // GET ?publicacion=id devuelve los comentarios de esa publicación
    $id = isset($_GET['publicacion']) && is_numeric($_GET['publicacion'])
        ? (int)$_GET['publicacion'] : 0;

    $stmt = $pdo->prepare(
        'SELECT c.id, c.usuario_id, u.nombre AS autor, u.usuario AS handle,
                c.texto, c.creado_en
         FROM comentarios c
         INNER JOIN usuarios u ON u.id = c.usuario_id
         WHERE c.publicacion_id = ?
         ORDER BY c.creado_en ASC'
    );
    $stmt->execute([$id]);
    $filas = $stmt->fetchAll();

    $salida = [];
    foreach ($filas as $f) {
        $salida[] = [
            'id'       => (int)$f['id'],
            'authorId' => (int)$f['usuario_id'],
            'author'   => $f['autor'],
            'handle'   => $f['handle'],
            'text'     => $f['texto'],
            'time'     => tiempo_relativo($f['creado_en']),
        ];
    }

    responder(['ok' => true, 'comentarios' => $salida]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    mismo_origen();
    $yo = exigir_sesion($pdo);
    $datos = recibir_json();
    $id = isset($datos['id']) && ctype_digit((string)$datos['id']) ? (int)$datos['id'] : 0;
    if ($id < 1) responder(['ok' => false, 'error' => 'Comentario no válido.'], 400);
    $stmt = $pdo->prepare('SELECT c.usuario_id, c.publicacion_id, p.usuario_id AS autor_publicacion FROM comentarios c INNER JOIN publicaciones p ON p.id = c.publicacion_id WHERE c.id = ? LIMIT 1');
    $stmt->execute([$id]);
    $comentario = $stmt->fetch();
    if (!$comentario) responder(['ok' => false, 'error' => 'Comentario no encontrado.'], 404);
    if ((int)$comentario['usuario_id'] !== (int)$yo['id'] && (int)$comentario['autor_publicacion'] !== (int)$yo['id']) {
        responder(['ok' => false, 'error' => 'Solo quien comentó o quien publicó puede borrar este comentario.'], 403);
    }
    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM comentarios WHERE id = ?')->execute([$id]);
        $pdo->prepare('UPDATE publicaciones SET comentarios = GREATEST(comentarios - 1, 0) WHERE id = ?')->execute([(int)$comentario['publicacion_id']]);
        $pdo->commit();
        responder(['ok' => true, 'id' => $id, 'publicacion_id' => (int)$comentario['publicacion_id']]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        responder(['ok' => false, 'error' => 'No se pudo borrar el comentario.'], 500);
    }
}

/* ---------------------------------------------------------------- POST creación */
exigir_metodo('POST');
mismo_origen();
$yo = exigir_sesion($pdo);

$datos = recibir_json();
if (!$datos) $datos = $_POST;

$texto = isset($datos['texto']) ? trim($datos['texto']) : '';
if ($texto === '') {
    responder(['ok' => false, 'error' => 'El comentario no puede estar vacío.'], 400);
}
if (mb_strlen($texto) > 1000) {
    responder(['ok' => false, 'error' => 'El comentario no puede pasar de 1000 caracteres.'], 400);
}

// Obtener el id de la publicación
$pubId = isset($datos['publicacion_id']) && is_numeric($datos['publicacion_id'])
    ? (int)$datos['publicacion_id'] : 0;
if ($pubId === 0) {
    responder(['ok' => false, 'error' => 'Falta el id de la publicación.'], 400);
}

// Verificar que la publicación existe
$stmtPub = $pdo->prepare('SELECT id FROM publicaciones WHERE id = ? LIMIT 1');
$stmtPub->execute([$pubId]);
if (!$stmtPub->fetch()) {
    responder(['ok' => false, 'error' => 'Publicación no encontrada.'], 404);
}

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        'INSERT INTO comentarios (usuario_id, publicacion_id, texto)
         VALUES (?, ?, ?)'
    );
    $stmt->execute([(int)$yo['id'], $pubId, $texto]);

    // Incrementar el contador de comentarios en la publicación
    $stmt2 = $pdo->prepare(
        'UPDATE publicaciones SET comentarios = comentarios + 1 WHERE id = ?'
    );
    $stmt2->execute([$pubId]);

    $pdo->commit();

    // Devolver el comentario creado
    $created = [
        'id'       => (int)$pdo->lastInsertId(),
        'authorId' => (int)$yo['id'],
        'author'   => $yo['nombre'],
        'handle'   => $yo['usuario'],
        'text'     => $texto,
        'time'     => tiempo_relativo(date('Y-m-d H:i:s')),
    ];

    responder([
        'ok'       => true,
        'comentario' => $created,
        'publicacion_id' => $pubId,
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    responder(['ok' => false, 'error' => 'No se pudo guardar el comentario.'], 500);
}

