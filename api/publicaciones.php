<?php
/**
 * api/publicaciones.php — GET / POST
 *   GET  → el feed público: las últimas 100 publicaciones con sus etiquetas,
 *          sus contadores y —si hay sesión— si yo ya le di impacto o lo
 *          reblogueé. Se puede leer SIN iniciar sesión, como pide el plan.
 *   POST → crea una publicación (solo con sesión).
 *
 * ¿Por qué existe la función cargar_publicaciones()? Para que la publicación
 * recién creada y las del feed se armen EXACTAMENTE igual: el frontend recibe
 * siempre el mismo formato de JSON.
 */
require_once __DIR__ . '/../config.php';

/**
 * arma la lista de publicaciones. Si $publicacionId viene dado, devuelve solo
 * esa (se usa tras insertar, para responder con la fila ya guardada).
 */
function cargar_publicaciones(PDO $pdo, $yoId, $limite = 100, $publicacionId = null, $autorId = null)
{
    $yoId = (int)$yoId;
    $sql = "SELECT p.id, p.usuario_id, p.texto, p.tipo_media, p.valor_media,
                   p.impacto, p.comentarios, p.reblogs, p.creado_en,
                   u.nombre AS autor, u.usuario AS handle, u.color_acento, (u.foto_perfil IS NOT NULL AND u.foto_perfil <> '') AS tiene_avatar,
                   EXISTS(SELECT 1 FROM impactos i
                           WHERE i.publicacion_id = p.id AND i.usuario_id = ?) AS le_dio,
                   EXISTS(SELECT 1 FROM reblogs rb
                           WHERE rb.publicacion_id = p.id AND rb.usuario_id = ?) AS reblogueo
              FROM publicaciones p
              INNER JOIN usuarios u ON u.id = p.usuario_id
             ";

    // Las publicaciones son públicas para cualquier visitante del feed.
    // es_privado controla la visibilidad del perfil, no la de sus publicaciones.
    $parametros = [$yoId, $yoId];
    $condiciones = [];
    if ($publicacionId !== null) {
        $condiciones[] = 'p.id = ?';
        $parametros[] = (int)$publicacionId;
    }
    if ($autorId !== null) {
        $condiciones[] = 'p.usuario_id = ?';
        $parametros[] = (int)$autorId;
    }
    if ($condiciones) $sql .= ' WHERE ' . implode(' AND ', $condiciones);
    $sql .= ' ORDER BY p.creado_en DESC, p.id DESC LIMIT ' . (int)$limite;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($parametros);
    $filas = $stmt->fetchAll();
    if (!$filas) return [];

    // ---- Etiquetas de todas las publicaciones de una sola vez ----
    $ids = array_map(function ($f) { return (int)$f['id']; }, $filas);
    $porId = [];
    $marcador = implode(',', array_fill(0, count($ids), '?'));
    $et = $pdo->prepare("SELECT publicacion_id, etiqueta FROM publicaciones_etiquetas WHERE publicacion_id IN ($marcador)");
    $et->execute($ids);
    foreach ($et->fetchAll() as $fila) {
        $porId[(int)$fila['publicacion_id']][] = $fila['etiqueta'];
    }

    $salida = [];
    foreach ($filas as $f) {
        $tipo = $f['tipo_media'];
        $salida[] = [
            'id'           => (int)$f['id'],
            'authorId'     => (int)$f['usuario_id'],
            'author'       => $f['autor'],
            'handle'       => $f['handle'],
            'accent'       => acento_valido($f['color_acento']),
            'authorAvatar' => !empty($f['tiene_avatar']) ? 'api/avatar.php?id=' . (int)$f['usuario_id'] : '',
            'hasMedia'     => $tipo !== 'ninguno',
            'mediaKind'    => $tipo === 'ninguno' ? null : ($tipo === 'imagen' ? 'image' : ($tipo === 'video' ? 'video' : 'emoji')),
            'emoji'        => $tipo === 'emoji' ? $f['valor_media'] : null,
            'mediaSrc'     => ($tipo === 'imagen' || $tipo === 'video') ? $f['valor_media'] : null,
            'text'         => $f['texto'],
            'tags'         => isset($porId[(int)$f['id']]) ? $porId[(int)$f['id']] : [],
            'impact'       => (int)$f['impacto'],
            'reacted'      => (bool)$f['le_dio'],
            'comments'     => (int)$f['comentarios'],
            'reblogs'      => (int)$f['reblogs'],
            'rebloggedByMe'=> (bool)$f['reblogueo'],
            'time'         => tiempo_relativo($f['creado_en']),
        ];
    }
    return $salida;
}

$metodo = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

if ($metodo === 'GET') {
    $yo = usuario_actual($pdo);
    $autorId = null;
    if (isset($_GET['usuario_id'])) {
        $autorRaw = (string)$_GET['usuario_id'];
        if (!ctype_digit($autorRaw) || (int)$autorRaw < 1) {
            responder(['ok' => false, 'error' => 'Perfil no válido.'], 400);
        }
        $autorId = (int)$autorRaw;
    }
    $lista = cargar_publicaciones($pdo, $yo ? $yo['id'] : 0, 100, null, $autorId);
    responder(['ok' => true, 'publicaciones' => $lista]);
}

if ($metodo === 'DELETE') {
    mismo_origen();
    $yo = exigir_sesion($pdo);
    $datos = recibir_json();
    $id = isset($datos['id']) && ctype_digit((string)$datos['id']) ? (int)$datos['id'] : 0;
    if ($id < 1) responder(['ok' => false, 'error' => 'Publicación no válida.'], 400);
    $stmt = $pdo->prepare('SELECT usuario_id FROM publicaciones WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $publicacion = $stmt->fetch();
    if (!$publicacion) responder(['ok' => false, 'error' => 'Publicación no encontrada.'], 404);
    if ((int)$publicacion['usuario_id'] !== (int)$yo['id']) {
        responder(['ok' => false, 'error' => 'Solo quien publicó puede borrar esta publicación.'], 403);
    }
    $pdo->prepare('DELETE FROM publicaciones WHERE id = ?')->execute([$id]);
    responder(['ok' => true, 'id' => $id]);
}

/* ---------------------------------------------------------------- creación */
exigir_metodo('POST');
mismo_origen();
$yo = exigir_sesion($pdo);

$datos = recibir_json();
if (!$datos) $datos = $_POST;

$texto = isset($datos['texto']) ? trim($datos['texto']) : '';
if ($texto === '') {
    responder(['ok' => false, 'error' => 'Cuenta un poco qué reciclaste primero.'], 400);
}
if (mb_strlen($texto) > 2000) {
    responder(['ok' => false, 'error' => 'La publicación no puede pasar de 2000 caracteres.'], 400);
}

// ---- Etiquetas: del texto que manda el frontend o de un arreglo ----
$etiquetasBrutas = isset($datos['etiquetas']) ? $datos['etiquetas'] : [];
if (is_string($etiquetasBrutas)) {
    $etiquetasBrutas = explode(',', $etiquetasBrutas);
}
$etiquetas = [];
foreach ((array)$etiquetasBrutas as $t) {
    $t = mb_strtolower(trim($t), 'UTF-8');
    $t = preg_replace('/[^a-z0-9áéíóúñü_-]/u', '', $t);
    $t = trim($t, '-_');
    if ($t === '') continue;
    $etiquetas[] = mb_substr($t, 0, 30);
    if (count($etiquetas) >= 8) break;
}
if (!$etiquetas) $etiquetas = ['reciclaje'];

// ---- Media ----
$tipo = isset($datos['tipo_media']) ? $datos['tipo_media'] : 'ninguno';
$valor = isset($datos['valor_media']) ? (string)$datos['valor_media'] : '';
$permitidos = ['ninguno', 'emoji', 'imagen', 'video'];
if (!in_array($tipo, $permitidos, true)) {
    responder(['ok' => false, 'error' => 'Tipo de archivo no reconocido.'], 400);
}
if ($tipo === 'emoji') {
    if ($valor === '' || mb_strlen($valor) > 8) {
        responder(['ok' => false, 'error' => 'Elige un emoji válido.'], 400);
    }
} elseif ($tipo === 'imagen' || $tipo === 'video') {
    // Solo se acepta una ruta generada POR ESTE SERVIDOR dentro de uploads/.
    if (!preg_match('#^uploads/[a-f0-9]{20}\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$#', $valor)) {
        responder(['ok' => false, 'error' => 'Sube el archivo primero con el botón de foto o video.'], 400);
    }
    if (!is_file(__DIR__ . '/../' . $valor)) {
        responder(['ok' => false, 'error' => 'El archivo subido no se encontró en el servidor. Vuelve a subirlo.'], 400);
    }
} else {
    $valor = null;
}

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        'INSERT INTO publicaciones (usuario_id, texto, tipo_media, valor_media)
         VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([(int)$yo['id'], $texto, $tipo, $valor]);
    $nuevoId = (int)$pdo->lastInsertId();

    $ins = $pdo->prepare('INSERT INTO publicaciones_etiquetas (publicacion_id, etiqueta) VALUES (?, ?)');
    foreach ($etiquetas as $t) {
        $ins->execute([$nuevoId, $t]);
    }

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    responder(['ok' => false, 'error' => 'No se pudo guardar la publicación.'], 500);
}

$lista = cargar_publicaciones($pdo, $yo['id'], 1, $nuevoId);
responder([
    'ok'            => true,
    'publicacion'   => $lista ? $lista[0] : null,
    'mensaje'       => 'Publicado en tu diario Alyra 🌍',
]);

