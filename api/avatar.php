<?php
/**
 * api/avatar.php — GET
 * Devuelve una foto de perfil guardada como JPEG base64 en MySQL.
 * La URL solo contiene el id público de la cuenta; la foto no se duplica en el feed.
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('GET');
$id = isset($_GET['id']) && ctype_digit((string)$_GET['id']) ? (int)$_GET['id'] : 0;
if ($id < 1) {
    http_response_code(404);
    exit;
}
$stmt = $pdo->prepare('SELECT foto_perfil FROM usuarios WHERE id = ? LIMIT 1');
$stmt->execute([$id]);
$data = $stmt->fetchColumn();
if (!is_string($data) || !preg_match('~^data:image/jpeg;base64,([A-Za-z0-9+/]+={0,2})$~', $data, $m)) {
    http_response_code(404);
    exit;
}
$bytes = base64_decode($m[1], true);
if ($bytes === false || strlen($bytes) > 260000 || @getimagesizefromstring($bytes) === false) {
    http_response_code(404);
    exit;
}
header('Content-Type: image/jpeg');
header('Content-Length: ' . strlen($bytes));
header('Cache-Control: public, max-age=300, stale-while-revalidate=86400');
header('X-Content-Type-Options: nosniff');
echo $bytes;
