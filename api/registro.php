<?php
/**
 * api/registro.php — POST
 * Crea una cuenta nueva y abre su sesión. La usan el formulario del blog
 * (alyra_1.html -> handleSignup) y, vía juego/register.php, el formulario del
 * juego: las dos puertas llaman a crear_cuenta() para que una cuenta creada
 * en el blog sirva también para guardar el avance del juego.
 *
 * Acepta JSON ({nombre, correo, contrasena}) o form-urlencoded
 * (nombre_usuario, correo, contrasena), que es lo que manda el juego.
 * Responde: {ok, usuario, mensaje} y también {jugador:{id,nombre}}, que es lo
 * que espera el JavaScript del juego.
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('POST');
mismo_origen();

$datos = recibir_json();
if (!$datos) $datos = $_POST;

$nombre = isset($datos['nombre']) ? $datos['nombre'] : (isset($datos['nombre_usuario']) ? $datos['nombre_usuario'] : '');
$correo = isset($datos['correo']) ? $datos['correo'] : (isset($datos['email']) ? $datos['email'] : '');
$clave  = isset($datos['contrasena']) ? $datos['contrasena'] : (isset($datos['password']) ? $datos['password'] : '');
$handle = isset($datos['usuario']) ? $datos['usuario'] : '';

$resultado = crear_cuenta($pdo, $nombre, $correo, $clave, $handle);

if (empty($resultado['ok'])) {
    responder(['ok' => false, 'error' => $resultado['error'], 'mensaje' => $resultado['error']], 400);
}

$u = $resultado['usuario'];
$correoBienvenidaEnviado = false;
if (isset($resultado['mensaje']) && strpos($resultado['mensaje'], '¡Cuenta creada!') === 0) {
    $nombreSeguro = escapar($u['nombre']);
    $correoBienvenidaEnviado = enviar_correo_alyra(
        $u['correo'],
        '¡Bienvenida a Alyra!',
        '<div style="font-family:Arial,sans-serif;color:#26352b;line-height:1.6"><h1>¡Bienvenida a Alyra, ' . $nombreSeguro . '!</h1><p>Tu cuenta ya está creada. Puedes iniciar sesión y compartir tus ideas para cuidar el planeta.</p><p>Gracias por sumarte a esta comunidad 🌱</p></div>'
    );
}
responder([
    'ok'       => true,
    'usuario'  => usuario_json($u),
    'mensaje'  => $resultado['mensaje'],
    'correoBienvenidaEnviado' => $correoBienvenidaEnviado,
    'jugador'  => ['id' => (int)$u['id'], 'nombre' => $u['nombre']],
]);

