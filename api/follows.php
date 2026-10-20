<?php
/**
 * api/follows.php — GET / POST / DELETE
 *   GET     → ¿ya sigo a este usuario? responde {ok, sigo: true/false}
 *             (sin sesión responde sigo:false, para lectores del blog)
 *   POST    → empezar a seguir a un usuario (requiere sesión)
 *   DELETE  → dejar de seguir a un usuario (requiere sesión)
 * El usuario objetivo va siempre en la query string: ?usuario_id=N
 */

require_once __DIR__ . '/../config.php';

$metodo = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

// El id puede venir en la query string o en el cuerpo JSON (por comodidad).
$targetId = isset($_GET['usuario_id']) && is_numeric($_GET['usuario_id'])
    ? (int)$_GET['usuario_id'] : 0;
if ($targetId === 0) {
    $datos = recibir_json();
    if (isset($datos['usuario_id']) && is_numeric($datos['usuario_id'])) {
        $targetId = (int)$datos['usuario_id'];
    }
}
if ($targetId === 0) {
    responder(['ok' => false, 'error' => 'Falta el id de usuario.'], 400);
}

// Verificar que el usuario objetivo existe.
$stmt = $pdo->prepare('SELECT id, nombre, usuario FROM usuarios WHERE id = ? LIMIT 1');
$stmt->execute([$targetId]);
$targetUser = $stmt->fetch();
if (!$targetUser) {
    responder(['ok' => false, 'error' => 'Usuario no encontrado.'], 404);
}

$yo = usuario_actual($pdo);
$sigo = false;
if ($yo) {
    $stmtCheck = $pdo->prepare(
        'SELECT 1 FROM follows WHERE usuario_id = ? AND target_user_id = ? LIMIT 1'
    );
    $stmtCheck->execute([$yo['id'], $targetId]);
    $sigo = $stmtCheck->fetch() !== false;
}

/* ------------------------------------------------------------------ GET estado */
if ($metodo === 'GET') {
    $seguidores = 0;
    $siguiendo = 0;
    $s1 = $pdo->prepare('SELECT COUNT(*) FROM follows WHERE target_user_id = ?');
    $s1->execute([$targetId]);
    $seguidores = (int)$s1->fetchColumn();
    $s2 = $pdo->prepare('SELECT COUNT(*) FROM follows WHERE usuario_id = ?');
    $s2->execute([$targetId]);
    $siguiendo = (int)$s2->fetchColumn();

    responder([
        'ok'         => true,
        'sigo'       => $sigo,
        'seguidores' => $seguidores,
        'siguiendo'  => $siguiendo,
        'targetUser' => usuario_json($targetUser),
    ]);
}

/* ------------------------------------------------------------- POST / DELETE */
if ($metodo !== 'POST' && $metodo !== 'DELETE') {
    responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
}
mismo_origen();
$yo = exigir_sesion($pdo);

if ($metodo === 'DELETE') {
    if (!$sigo) {
        responder(['ok' => true, 'sigo' => false, 'mensaje' => 'No sigues a esta persona.']);
    }
    try {
        $stmt = $pdo->prepare(
            'DELETE FROM follows WHERE usuario_id = ? AND target_user_id = ?'
        );
        $stmt->execute([$yo['id'], $targetId]);
        responder(['ok' => true, 'sigo' => false, 'mensaje' => 'Dejaste de seguir a ' . $targetUser['nombre']]);
    } catch (PDOException $e) {
        responder(['ok' => false, 'error' => 'No pudiste dejar de seguir a esta persona.'], 500);
    }
}

// ---- POST: empezar a seguir ----
if ($yo['id'] === $targetId) {
    responder(['ok' => false, 'error' => 'No puedes seguirte a ti mismo.'], 400);
}
if ($sigo) {
    responder(['ok' => true, 'sigo' => true, 'mensaje' => 'Ya sigues a esta persona.']);
}
try {
    $stmt = $pdo->prepare(
        'INSERT INTO follows (usuario_id, target_user_id) VALUES (?, ?)'
    );
    $stmt->execute([$yo['id'], $targetId]);
    responder(['ok' => true, 'sigo' => true, 'mensaje' => 'Ahora sigues a ' . $targetUser['nombre']]);
} catch (PDOException $e) {
    responder(['ok' => false, 'error' => 'No pudiste seguir a esta persona.'], 500);
}

