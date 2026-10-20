<?php
require_once __DIR__ . '/../config.php';

exigir_metodo('POST');
mismo_origen();
$datos = recibir_json();
$correo = isset($datos['correo']) ? strtolower(trim((string)$datos['correo'])) : '';
$respuesta = ['ok' => true, 'mensaje' => 'Si el correo corresponde a una cuenta, enviaremos un enlace para restablecer la contraseña.'];
if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) responder($respuesta);

$stmt = $pdo->prepare('SELECT id, nombre, correo FROM usuarios WHERE correo = ? LIMIT 1');
$stmt->execute([$correo]);
$usuario = $stmt->fetch();
if ($usuario) {
    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM recuperaciones_password WHERE usuario_id = ?')->execute([(int)$usuario['id']]);
        $pdo->prepare('INSERT INTO recuperaciones_password (token_hash, usuario_id, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))')->execute([$tokenHash, (int)$usuario['id']]);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('Alyra: no se pudo crear token de recuperación.');
        responder($respuesta);
    }
    $url = url_publica_alyra() . '/?restablecer=' . rawurlencode($token);
    $nombre = escapar($usuario['nombre']);
    $urlSeguro = htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $enviado = enviar_correo_alyra($usuario['correo'], 'Restablece tu contraseña de Alyra',
        '<div style="font-family:Arial,sans-serif;color:#26352b;line-height:1.6"><h1>Restablecer contraseña</h1><p>Hola ' . $nombre . '. Recibimos una solicitud para cambiar tu contraseña de Alyra.</p><p><a href="' . $urlSeguro . '" style="display:inline-block;padding:12px 18px;background:#4f8b4c;color:white;text-decoration:none;border-radius:8px">Crear contraseña nueva</a></p><p>El enlace vence en 30 minutos y solo se puede usar una vez. Si no lo solicitaste, ignora este mensaje.</p></div>'
    );
    if (!$enviado) {
        $pdo->prepare('DELETE FROM recuperaciones_password WHERE token_hash = ?')->execute([$tokenHash]);
    }
}
responder($respuesta);

