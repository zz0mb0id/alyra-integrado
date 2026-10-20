<?php
/**
 * api/eliminar_cuenta.php — POST
 * Borra la cuenta de quien está conectado. Todas las tablas apuntan a
 * `usuarios` con ON DELETE CASCADE, así que con una sola orden se van las
 * sesiones, las publicaciones, los impactos, los reblogs y el progreso del
 * juego. Además se intenta borrar de disco los archivos que subió.
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('POST');
mismo_origen();
$yo = exigir_sesion($pdo);

// ---- Archivos subidos por esta persona ----
try {
    $stmt = $pdo->prepare(
        "SELECT valor_media FROM publicaciones
          WHERE usuario_id = ? AND tipo_media IN ('imagen','video')"
    );
    $stmt->execute([$yo['id']]);
    foreach ($stmt->fetchAll() as $fila) {
        $ruta = __DIR__ . '/../' . $fila['valor_media'];
        // Solo se borra algo que viva dentro de la carpeta uploads/.
        $real = realpath($ruta);
        $base = realpath(__DIR__ . '/../uploads');
        if ($real && $base && strpos($real, $base) === 0 && is_file($real)) {
            @unlink($real);
        }
    }
} catch (PDOException $e) {
    // Si falla el listado, la cuenta se borra igual: lo importante es la BD.
}

$pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$yo['id']]);

/* Los contadores están desnormalizados en `publicaciones`; recalcularlos desde
   sus tablas de detalle evita que queden valores obsoletos tras las cascadas. */
try {
    $pdo->exec(
        'UPDATE publicaciones p SET
            impacto = (SELECT COUNT(*) FROM impactos i WHERE i.publicacion_id = p.id),
            reblogs = (SELECT COUNT(*) FROM reblogs r WHERE r.publicacion_id = p.id),
            comentarios = (SELECT COUNT(*) FROM comentarios c WHERE c.publicacion_id = p.id)'
    );
} catch (PDOException $e) {
    // El borrado de la cuenta ya se completó; si el recálculo falla, los
    // contadores pueden quedar desactualizados.
}

sesion_cerrar($pdo);

responder(['ok' => true, 'mensaje' => 'Cuenta eliminada']);

