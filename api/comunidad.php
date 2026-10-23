<?php
/**
 * api/comunidad.php — GET
 * Datos de la columna lateral y del contador del hero:
 *   miembros   → SELECT COUNT(*) FROM usuarios (el contador real, en vivo)
 *   sugeridos  → hasta 5 cuentas recientes con su biografía, para la tarjeta
 *                "Cuentas que inspiran" (antes era un arreglo vacío en JS).
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('GET');

$miembros = (int)$pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();

$sugeridos = [];
try {
    $yo = usuario_actual($pdo);
    $excluir = $yo ? (int)$yo['id'] : 0;

    $stmt = $pdo->prepare(
        "SELECT u.nombre, u.bio, u.color_acento, u.foto_perfil,
                (SELECT COUNT(*) FROM publicaciones p WHERE p.usuario_id = u.id) AS publicaciones
           FROM usuarios u
          WHERE u.id <> ? AND u.es_privado = 0
          ORDER BY u.creado_en DESC
          LIMIT 5"
    );
    $stmt->execute([$excluir]);
    foreach ($stmt->fetchAll() as $fila) {
        $sugeridos[] = [
            'name' => $fila['nombre'],
            'desc' => $fila['bio'] ? mb_substr($fila['bio'], 0, 70)
                   : ((int)$fila['publicaciones'] > 0
                        ? (int)$fila['publicaciones'] . ' publicaciones'
                        : 'Recién se unió a Alyra'),
            'accent' => acento_valido($fila['color_acento']),
            'avatar' => (string)($fila['foto_perfil'] ?? ''),
        ];
    }
} catch (PDOException $e) {
    // Sin sugeridos la tarjeta simplemente muestra su mensaje de siempre.
}

responder(['ok' => true, 'miembros' => $miembros, 'sugeridos' => $sugeridos]);

