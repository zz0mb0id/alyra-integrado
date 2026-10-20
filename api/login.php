<?php
/**
 * api/login.php — POST
 * Inicia sesión con correo + contraseña. La contraseña se compara SIEMPRE con
 * password_verify() contra el hash guardado (nunca se guarda ni se compara en
 * texto plano). Al entrar, crea el token de sesión en la tabla `sesiones` y
 * pone la cookie HttpOnly.
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('POST');
mismo_origen();

$datos = recibir_json();
if (!$datos) $datos = $_POST;

$correo = isset($datos['correo']) ? strtolower(trim($datos['correo'])) : (isset($datos['email']) ? strtolower(trim($datos['email'])) : '');
$clave  = isset($datos['contrasena']) ? (string)$datos['contrasena'] : (isset($datos['password']) ? (string)$datos['password'] : '');

if ($correo === '' || $clave === '') {
    responder(['ok' => false, 'error' => 'Ingresa tu correo y contraseña.'], 400);
}

$stmt = $pdo->prepare('SELECT * FROM usuarios WHERE correo = ? LIMIT 1');
$stmt->execute([$correo]);
$usuario = $stmt->fetch();

if (!$usuario || !password_verify($clave, $usuario['contrasena_hash'])) {
    // Mismo mensaje para "no existe" y "contraseña mala": no se revela
    // qué correos están registrados.
    responder(['ok' => false, 'error' => 'Correo o contraseña incorrectos.'], 401);
}

sesion_crear($pdo, $usuario['id']);

responder([
    'ok'      => true,
    'usuario' => usuario_json($usuario),
    'mensaje' => '¡Bienvenida de nuevo, ' . $usuario['nombre'] . '!',
]);

