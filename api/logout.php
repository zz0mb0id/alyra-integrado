<?php
/**
 * api/logout.php — POST
 * Cierra la sesión: borra el token de la tabla `sesiones` y limpia la cookie.
 * Como el juego comparte la misma cookie, cerrar sesión aquí también te
 * desconecta del juego.
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('POST');
mismo_origen();

sesion_cerrar($pdo);
responder(['ok' => true, 'mensaje' => 'Sesión cerrada.']);

