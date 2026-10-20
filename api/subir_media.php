<?php
/**
 * api/subir_media.php — POST (multipart/form-data)
 * Recibe una foto o un video del navegador, lo guarda en la carpeta
 * uploads/ con un nombre aleatorio y devuelve la URL que después hay que
 * mandar a api/publicaciones.php. NUNCA se guarda el archivo dentro de la
 * base de datos: solo la ruta, tal como indica el comentario original del
 * frontend.
 *
 * Reglas de seguridad:
 *   · solo imágenes o videos reales (se revisa el MIME con finfo, y para
 *     imágenes además con getimagesize, para descartar un .php disfrazado);
 *   · máximo 25 MB;
 *   · nombre aleatorio de 20 hexadecimales: no se usa nada que venga del
 *     navegador, así que no hay forma de sobreescribir otro archivo ni de
 *     meterte en una subcarpeta con "../";
 *   · la carpeta uploads/ lleva un .htaccess que impide ejecutar PHP allí.
 */
require_once __DIR__ . '/../config.php';

exigir_metodo('POST');
mismo_origen();
$yo = exigir_sesion($pdo);

if (!isset($_FILES['archivo'])) {
    responder(['ok' => false, 'error' => 'No llegó ningún archivo.'], 400);
}
$archivo = $_FILES['archivo'];
if ((int)$archivo['error'] !== UPLOAD_ERR_OK) {
    $codigo = (int)$archivo['error'];
    $motivo = $codigo === UPLOAD_ERR_INI_SIZE || $codigo === UPLOAD_ERR_FORM_SIZE
        ? 'El archivo pesa más de lo que el servidor permite (25 MB).'
        : 'No se pudo recibir el archivo (error ' . $codigo . ').';
    responder(['ok' => false, 'error' => $motivo], 400);
}
if ((int)$archivo['size'] > 25 * 1024 * 1024) {
    responder(['ok' => false, 'error' => 'El archivo pesa más de 25 MB. Comprime la imagen o recorta el video.'], 400);
}

// ---- ¿Qué es, de verdad? ---- */
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($archivo['tmp_name']);

$mapa = [
    'image/jpeg'     => ['jpg',  'imagen'],
    'image/png'      => ['png',  'imagen'],
    'image/webp'     => ['webp', 'imagen'],
    'image/gif'      => ['gif',  'imagen'],
    'video/mp4'      => ['mp4',  'video'],
    'video/webm'     => ['webm', 'video'],
    'video/quicktime' => ['mov',  'video'],
];
if (!isset($mapa[$mime])) {
    responder(['ok' => false, 'error' => 'Solo se aceptan fotos (JPG, PNG, WEBP, GIF) y videos (MP4, WEBM, MOV).'], 400);
}
$ext = $mapa[$mime][0];
$tipo = $mapa[$mime][1];

// Para imágenes, además: que el contenido sea realmente una imagen válida.
if ($tipo === 'imagen') {
    if (@getimagesize($archivo['tmp_name']) === false) {
        responder(['ok' => false, 'error' => 'Ese archivo no es una imagen válida.'], 400);
    }
}

// ---- Carpeta de destino ----
$destinoDir = __DIR__ . '/../uploads';
if (!is_dir($destinoDir)) {
    @mkdir($destinoDir, 0755, true);
}
if (!is_dir($destinoDir) || !is_writable($destinoDir)) {
    responder([
        'ok'    => false,
        'error' => 'Este hosting no permite guardar archivos en la carpeta uploads/. Crea la carpeta con permisos de escritura (755) o publica sin foto.',
    ], 500);
}

$nombreNuevo = bin2hex(random_bytes(10)) . '.' . $ext;
$rutaDestino = $destinoDir . DIRECTORY_SEPARATOR . $nombreNuevo;

if (!move_uploaded_file($archivo['tmp_name'], $rutaDestino)) {
    responder([
        'ok'    => false,
        'error' => 'No se pudo guardar el archivo en el servidor. Revisa los permisos de la carpeta uploads/.',
    ], 500);
}
// En Windows/Linux queda más claro con barras normales en la URL.
@chmod($rutaDestino, 0644);

responder([
    'ok'   => true,
    'url'  => 'uploads/' . $nombreNuevo,
    'tipo' => $tipo,
]);

