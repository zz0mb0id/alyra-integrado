<?php
/**
 * get_progress.php
 * ------------------------------------------------------------------
 * ¿Para qué sirve? Al abrir la página, index.php (o script.js) llama
 * este archivo para traer, desde la base de datos, la salud que el
 * jugador ya había logrado en cada especie en visitas anteriores.
 * Así el juego "recuerda" el avance en vez de reiniciar siempre en 0.
 * Devuelve un JSON: { ok:true, progreso: { condor: {salud:40,...}, ... } }
 * ------------------------------------------------------------------
 */

require_once __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');

// Sin sesión compartida (la misma cookie del blog) no hay progreso que traer.
$yo = usuario_actual($pdo);
if (!$yo) {
    echo json_encode(['ok' => false, 'progreso' => []]);
    exit;
}

try {
    $stmt = $pdo->prepare(
        'SELECT especie_id, salud, extinto, veces_ganadas, veces_perdidas
         FROM progreso_especie WHERE usuario_id = ?'
    );
    $stmt->execute([(int)$yo['id']]);
    $filas = $stmt->fetchAll();

    // Convertimos la lista de filas en un objeto indexado por especie_id,
    // que es como script.js espera consumirlo (progreso['condor'].salud).
    $progreso = [];
    foreach ($filas as $fila) {
        $progreso[$fila['especie_id']] = [
            'salud'   => (int)$fila['salud'],
            'extinto' => (bool)$fila['extinto'],
            'ganadas' => (int)$fila['veces_ganadas'],
            'perdidas'=> (int)$fila['veces_perdidas'],
        ];
    }

    // (object): así un progreso vacío sale como {} y no como [], y el
    // JavaScript siempre recibe lo mismo: un objeto indexado por especie.
    echo json_encode(['ok' => true, 'progreso' => (object)$progreso]);
} catch (PDOException $e) {
    echo json_encode(['ok' => false, 'progreso' => []]);
}

