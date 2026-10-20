<?php
/**
 * juego/config.php
 * =============================================================================
 * Antes este archivo abría su propia conexión y arrancaba $_SESSION. Ahora el
 * proyecto tiene UNA sola base de datos y UNA sola sesión (blog + juego), así
 * que este archivo es una puerta delgada que solo carga el config de la raíz:
 *
 *     require_once __DIR__ . '/../config.php';
 *
 * De ahí salen $pdo y las funciones de sesión (usuario_actual, sesion_crear,
 * sesion_cerrar, exigir_sesion...). Los archivos de juego/ siguen haciendo
 * `require_once __DIR__ . '/config.php'` y no cambian de forma.
 *
 * ¿Qué hay que editar? Nada aquí: los datos de conexión viven en el
 * config.php de la raíz del proyecto.
 * =============================================================================
 */
require_once __DIR__ . '/../config.php';

