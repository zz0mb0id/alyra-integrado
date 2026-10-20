<?php
/**
 * juego/register.php — POST
 * =============================================================================
 * El formulario de registro del juego (overlay #registroOverlay) sigue
 * mandando su FormData a esta URL, pero la creación de cuentas ahora es
 * ÚNICA para todo el proyecto: este archivo es simplemente un puente hacia
 * api/registro.php, que crea la fila en `usuarios` con password_hash() y
 * abre la sesión compartida.
 *
 * Eso significa que una cuenta creada aquí sirve también para el blog de
 * Alyra, y una creada en el blog sirve para guardar el avance del juego.
 *
 * Se mantiene esta ruta (en vez de apuntar el form directo a /api/) para no
 * romper el action del formulario ni el fetch de script.js.
 *
 * Responde SIEMPRE en JSON: { ok, mensaje, jugador:{id,nombre}, usuario }
 * ------------------------------------------------------------------
 */
require_once __DIR__ . '/../api/registro.php';

