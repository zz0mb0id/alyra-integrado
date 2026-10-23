<?php
/**
 * Enrutador de funciones para Vercel.
 * Vercel Hobby limita las funciones desplegadas; un único runtime PHP puede
 * atender la API del blog y las rutas PHP del juego. Solo se incluyen archivos
 * explícitamente permitidos para impedir traversal o inclusiones arbitrarias.
 */
$handler = isset($_GET['handler']) ? (string)$_GET['handler'] : '';
unset($_GET['handler']);

$rutas = [
    'api/comentarios.php' => __DIR__ . '/comentarios.php',
    'api/comunidad.php' => __DIR__ . '/comunidad.php',
    'api/eliminar_cuenta.php' => __DIR__ . '/eliminar_cuenta.php',
    'api/follows.php' => __DIR__ . '/follows.php',
    'api/impacto.php' => __DIR__ . '/impacto.php',
    'api/login.php' => __DIR__ . '/login.php',
    'api/logout.php' => __DIR__ . '/logout.php',
    'api/password.php' => __DIR__ . '/password.php',
    'api/perfil.php' => __DIR__ . '/perfil.php',
    'api/perfil_publico.php' => __DIR__ . '/perfil_publico.php',
    'api/avatar.php' => __DIR__ . '/avatar.php',
    'api/publicaciones.php' => __DIR__ . '/publicaciones.php',
    'api/reblog.php' => __DIR__ . '/reblog.php',
    'api/registro.php' => __DIR__ . '/registro.php',
    'api/solicitar_recuperacion.php' => __DIR__ . '/solicitar_recuperacion.php',
    'api/restablecer_password.php' => __DIR__ . '/restablecer_password.php',
    'api/sesion.php' => __DIR__ . '/sesion.php',
    'api/subir_media.php' => __DIR__ . '/subir_media.php',
    'juego/index.php' => dirname(__DIR__) . '/juego/index.php',
    'juego/register.php' => dirname(__DIR__) . '/juego/register.php',
    'juego/save_progress.php' => dirname(__DIR__) . '/juego/save_progress.php',
    'juego/get_progress.php' => dirname(__DIR__) . '/juego/get_progress.php',
    'juego/import_progress.php' => dirname(__DIR__) . '/juego/import_progress.php',
    'juego/logout.php' => dirname(__DIR__) . '/juego/logout.php',
];

if (!isset($rutas[$handler])) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => 'Ruta no encontrada.']);
    exit;
}

require $rutas[$handler];

