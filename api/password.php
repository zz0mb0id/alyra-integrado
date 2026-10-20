<?php
/**
 * api/password.php — POST
 * Cambia la contraseña de la persona conectada. Pide la contraseña ACTUAL
 * (para que un link truquero en otra página no pueda cambiarla sin conocerla)
 * y la NUEVA, con mínimo 6 caracteres. Se guarda con password_hash().
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('POST');
mismo_origen();
$yo = exigir_sesion($pdo);

$datos = recibir_json();
if (!$datos) $datos = $_POST;

$actual = isset($datos['actual']) ? (string)$datos['actual'] : (isset($datos['contrasena_actual']) ? (string)$datos['contrasena_actual'] : '');
$nueva  = isset($datos['nueva'])  ? (string)$datos['nueva']  : (isset($datos['contrasena_nueva']) ? (string)$datos['contrasena_nueva'] : '');

if ($actual === '' || $nueva === '') {
    responder(['ok' => false, 'error' => 'Escribe tu contraseña actual y la nueva.'], 400);
}
if (!password_verify($actual, $yo['contrasena_hash'])) {
    responder(['ok' => false, 'error' => 'La contraseña actual no es correcta.'], 401);
}
if (mb_strlen($nueva) < 6) {
    responder(['ok' => false, 'error' => 'La contraseña nueva debe tener al menos 6 caracteres.'], 400);
}
if ($nueva === $actual) {
    responder(['ok' => false, 'error' => 'La contraseña nueva es igual a la actual.'], 400);
}

$hash = password_hash($nueva, PASSWORD_DEFAULT);
$tokenActual = isset($_COOKIE[ALYRA_COOKIE]) ? $_COOKIE[ALYRA_COOKIE] : '';
try {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('UPDATE usuarios SET contrasena_hash = ? WHERE id = ?');
    $stmt->execute([$hash, $yo['id']]);

    // Revoca las demás sesiones y conserva la sesión que acaba de cambiar
    // la contraseña para que la persona no tenga que iniciar sesión de nuevo.
    $stmt = $pdo->prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token <> ?');
    $stmt->execute([$yo['id'], $tokenActual]);
    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    responder(['ok' => false, 'error' => 'No se pudo actualizar la contraseña.'], 500);
}

responder(['ok' => true, 'mensaje' => 'Contraseña actualizada']);

