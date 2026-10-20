<?php
/**
 * Importa el progreso antiguo de localStorage a la cuenta autenticada.
 * Los registros existentes se conservan: solo se insertan filas nuevas.
 */
require_once __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

exigir_metodo('POST');
mismo_origen();
$yo = exigir_sesion($pdo);
$datos = recibir_json();
$progreso = isset($datos['progreso']) && is_array($datos['progreso']) ? $datos['progreso'] : null;

if ($progreso === null || count($progreso) > 60) {
    responder(['ok' => false, 'error' => 'El formato del progreso no es válido.'], 400);
}

try {
    $pdo->beginTransaction();
    $buscar = $pdo->prepare('SELECT id FROM especies WHERE id = ?');
    $insertar = $pdo->prepare(
        'INSERT IGNORE INTO progreso_especie
            (usuario_id, especie_id, salud, veces_ganadas, veces_perdidas, extinto)
         VALUES (?, ?, ?, 0, 0, ?)'
    );
    $importados = 0;

    foreach ($progreso as $especieId => $avance) {
        if (!is_string($especieId) || !preg_match('/^[a-z0-9_-]{1,30}$/i', $especieId)
            || !is_array($avance) || !isset($avance['salud'])
            || !is_numeric($avance['salud']) || (int)$avance['salud'] < 0
            || (int)$avance['salud'] > 100) {
            throw new InvalidArgumentException('El formato del progreso no es válido.');
        }

        $buscar->execute([$especieId]);
        if (!$buscar->fetch()) continue;

        $insertar->execute([
            (int)$yo['id'],
            $especieId,
            (int)$avance['salud'],
            !empty($avance['extinto']) ? 1 : 0,
        ]);
        $importados += $insertar->rowCount();
    }

    $pdo->commit();
    responder(['ok' => true, 'importados' => $importados]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    responder(['ok' => false, 'error' => $e->getMessage()], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    responder(['ok' => false, 'error' => 'No se pudo importar el progreso.'], 500);
}
