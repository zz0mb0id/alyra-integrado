<?php
require_once __DIR__ . '/../config.php';

exigir_metodo('POST');
mismo_origen();
$datos = recibir_json();
$token = isset($datos['token']) ? trim((string)$datos['token']) : '';
$nueva = isset($datos['contrasena']) ? (string)$datos['contrasena'] : '';
if (!preg_match('/^[a-f0-9]{64}$/', $token)) responder(['ok' => false, 'error' => 'El enlace no es válido o ya venció.'], 400);
if (mb_strlen($nueva) < 6 || mb_strlen($nueva) > 200) responder(['ok' => false, 'error' => 'La contraseña debe tener entre 6 y 200 caracteres.'], 400);

try {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT usuario_id FROM recuperaciones_password WHERE token_hash = ? AND expira_en > NOW() FOR UPDATE');
    $stmt->execute([hash('sha256', $token)]);
    $recuperacion = $stmt->fetch();
    if (!$recuperacion) {
        $pdo->rollBack();
        responder(['ok' => false, 'error' => 'El enlace no es válido o ya venció.'], 400);
    }
    $usuarioId = (int)$recuperacion['usuario_id'];
    $hash = password_hash($nueva, PASSWORD_DEFAULT);
    $pdo->prepare('UPDATE usuarios SET contrasena_hash = ? WHERE id = ?')->execute([$hash, $usuarioId]);
    $pdo->prepare('DELETE FROM recuperaciones_password WHERE usuario_id = ?')->execute([$usuarioId]);
    $pdo->prepare('DELETE FROM sesiones WHERE usuario_id = ?')->execute([$usuarioId]);
    $pdo->commit();
    responder(['ok' => true, 'mensaje' => 'Contraseña actualizada. Ya puedes iniciar sesión.']);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    responder(['ok' => false, 'error' => 'No se pudo actualizar la contraseña. Intenta de nuevo.'], 500);
}

