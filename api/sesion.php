<?php
/**
 * api/sesion.php — GET
 * Devuelve quién está conectado (o null). alyra_1.html lo llama al abrir la
 * página para restaurar la sesión desde la cookie: si nadie tiene sesión
 * responde 200 con usuario:null, que es lo normal para una persona que solo
 * está leyendo el blog.
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('GET');
sesiones_purgar($pdo);

$usuario = usuario_actual($pdo);
responder(['ok' => true, 'usuario' => usuario_json($usuario)]);

