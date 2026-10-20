<?php
/**
 * juego/logout.php
 * =============================================================================
 * Borra el token de sesión de la tabla `sesiones` y limpia la cookie
 * HttpOnly, con lo que la persona queda desconectada DEL BLOG Y DEL JUEGO a
 * la vez (comparten la misma cookie). Después regresa al juego, donde al no
 * haber sesión volverá a mostrarse la ventana de registro.
 * ---------------------------------------------------------------------------
 */
require_once __DIR__ . '/config.php';

sesion_cerrar($pdo);

header('Location: index.php' . (isset($_GET['embed']) ? '?embed=1' : ''));
exit;

