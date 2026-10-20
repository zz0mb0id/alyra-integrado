<?php
/**
 * save_progress.php
 * ------------------------------------------------------------------
 * ¿Para qué sirve? Cada vez que el jugador TERMINA un minijuego (gane o
 * pierda), script.js manda aquí por fetch: el id de la especie, la nueva
 * salud calculada y si ganó o no. Este archivo guarda ese progreso en la
 * tabla "progreso_especie" para que no se pierda al recargar la página.
 * Es el "condiciones" que pide el punto 3: valida sesión, valida que la
 * especie exista, y decide con SQL si debe crear la fila o actualizarla.
 * ------------------------------------------------------------------
 */

require_once __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');

// Si no hay una sesión activa (la misma cookie que usa el blog), no
// dejamos guardar nada. exigir_sesion responde 401 y corta si no hay nadie.
$yo = exigir_sesion($pdo);

// Leemos el cuerpo JSON que manda fetch() desde script.js.
$datos = json_decode(file_get_contents('php://input'), true);

$usuarioId = (int)$yo['id'];
$especieId = $datos['especie_id'] ?? '';
$salud     = isset($datos['salud']) ? max(0, min(100, (int)$datos['salud'])) : 0;
$gano      = !empty($datos['gano']);
$extinto   = !empty($datos['extinto']) ? 1 : 0;

if ($especieId === '') {
    echo json_encode(['ok' => false, 'mensaje' => 'Falta el id de la especie.']);
    exit;
}

try {
    // Confirmamos que la especie exista en el catálogo (evita datos basura).
    $chequeo = $pdo->prepare('SELECT id FROM especies WHERE id = ?');
    $chequeo->execute([$especieId]);
    if (!$chequeo->fetch()) {
        echo json_encode(['ok' => false, 'mensaje' => 'Especie no reconocida.']);
        exit;
    }

    // INSERT ... ON DUPLICATE KEY UPDATE: si ya había progreso para esta
    // cuenta+especie lo actualiza; si no existía, lo crea. Así una sola
    // consulta cubre "crear" y "editar" según corresponda.
    $sql = 'INSERT INTO progreso_especie
                (usuario_id, especie_id, salud, veces_ganadas, veces_perdidas, extinto)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                salud = VALUES(salud),
                veces_ganadas = veces_ganadas + VALUES(veces_ganadas),
                veces_perdidas = veces_perdidas + VALUES(veces_perdidas),
                extinto = VALUES(extinto)';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $usuarioId,
        $especieId,
        $salud,
        $gano ? 1 : 0,   // suma 1 a veces_ganadas si ganó
        $gano ? 0 : 1,   // suma 1 a veces_perdidas si perdió
        $extinto
    ]);

    echo json_encode(['ok' => true, 'mensaje' => 'Progreso guardado.']);
} catch (PDOException $e) {
    echo json_encode(['ok' => false, 'mensaje' => 'Error al guardar el progreso.']);
}

