<?php
/**
 * index.php
 * ==============================================================================
 * ¿Qué hace este archivo?
 * Es la página principal del juego "Guardianes de Colombia". Aquí SOLO hay
 * HTML + PHP: el diseño vive en style.css y todo el comportamiento (mover a
 * los animales, abrir el diario, jugar los minijuegos) vive en script.js.
 *
 * Parte PHP (lo que este archivo decide ANTES de mandar el HTML al navegador):
 *  1. Abre la sesión y la conexión a la base de datos (config.php).
 *  2. Revisa si hay alguien conectado con LA MISMA SESIÓN del blog
 *     (cookie alyra_sesion -> tabla sesiones; la crea config.php).
 *     - Si NO hay sesión -> se mostrará el formulario de registro obligatorio.
 *     - Si SÍ hay sesión -> se consulta en MySQL el progreso guardado de esa
 *       cuenta (tabla progreso_especie) y se manda a JavaScript ya listo,
 *       para que el juego arranque justo donde el jugador lo dejó.
 *     Por eso, quien inició sesión en el blog ya entra al juego sin
 *     registrarse otra vez, y su avance le sigue acompañando.
 * ==============================================================================
 */

require_once __DIR__ . '/config.php';

// ¿Hay alguien con sesión activa? La sesión la creó api/registro.php o
// api/login.php al entrar (misma cookie para el blog y el juego).
$usuario          = usuario_actual($pdo);
$jugadorLogueado  = $usuario !== null;
$nombreJugador    = $usuario ? $usuario['nombre'] : '';

// ?embed=1 -> el juego se muestra dentro de la página de Alyra (oculta su propio título).
$embed = isset($_GET['embed']);

// Progreso guardado en la base de datos: especie_id => ['salud'=>.., 'extinto'=>..]
// Se llena SOLO si el jugador ya inició sesión; si no, el juego arranca en 0.
$progresoInicial = [];
if ($jugadorLogueado) {
    try {
        $consulta = $pdo->prepare(
            'SELECT especie_id, salud, extinto FROM progreso_especie WHERE usuario_id = ?'
        );
        $consulta->execute([(int)$usuario['id']]);
        foreach ($consulta->fetchAll() as $fila) {
            $progresoInicial[$fila['especie_id']] = [
                'salud'   => (int)$fila['salud'],
                'extinto' => (bool)$fila['extinto'],
            ];
        }
    } catch (Exception $e) {
        // Si la consulta falla, seguimos con el progreso vacío (arranca en 0).
        $progresoInicial = [];
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Alyra — Diario de campo viviente</title>

<!-- Tipografías del diseño original -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&family=Caveat:wght@400;600;700&display=swap" rel="stylesheet">

<!-- Sistema de diseño compartido con la página principal de Alyra -->
<link rel="stylesheet" href="../herbario.css">
<!-- Todo el CSS vive en style.css (separado del HTML, como pide el punto 5) -->
<link rel="stylesheet" href="style.css">
</head>
<body class="grano <?php echo $embed ? 'embed' : ''; ?>">

  <!-- ============================================================
       ENCABEZADO
  ============================================================= -->
  <p class="eyebrow">Diario de campo interactivo</p>
  <h1>Alyra</h1>
  <p class="subtitle">Recorre las regiones de Colombia, observa a sus especies moverse en su hábitat y juega el minijuego de cada una para manetener sano el ecosistema. ¡La salud empieza en 0: tú decides si sube!</p>

  <!-- Barra de sesión: muestra el nombre del jugador (dato que llega de PHP/SQL)
       y un botón para cerrar sesión (logout.php). Si nadie ha iniciado sesión,
       queda oculta por CSS hasta que el registro sea exitoso. -->
  <div class="sesion-bar <?php echo $jugadorLogueado ? 'visible' : ''; ?>" id="sesionBar">
    <span>👤 Jugando como <b id="sesionNombre"><?php echo htmlspecialchars($nombreJugador); ?></b></span>
    <a href="logout.php<?php echo $embed ? '?embed=1' : ''; ?>" class="logout-link">Cerrar sesión</a>
  </div>

  <!-- Aviso para quien juega sin cuenta (opcional crear una) -->
  <div class="sesion-bar <?php echo $jugadorLogueado ? '' : 'visible'; ?>" id="invitadoBar">
    <span>Jugando sin cuenta: tu avance no se guarda</span>
    <a href="#" class="logout-link" id="abrirRegistro" style="color:var(--forest-deep);">Crear cuenta</a>
  </div>

  <!-- ============================================================
       BARRA DE SALUD GENERAL DEL ECOSISTEMA
       El ancho/porcentaje lo actualiza script.js con JavaScript
       cada vez que cambia la salud de cualquier especie.
  ============================================================= -->
  <div class="vine-wrap">
    <div class="vine-label"><span>🌱 Salud del ecosistema colombiano</span><span id="vinePercent">0%</span></div>
    <div class="vine-track"><div class="vine-fill" id="vineFill"></div></div>
    <p class="vine-msg" id="vineMsg">Aún no has cuidado ninguna especie. ¡Juega los minijuegos para subir la salud!</p>
  </div>

  <!-- Aquí script.js dibuja, con JavaScript, una sección por cada zona/región
       y dentro de cada una los animales/plantas que le pertenecen. -->
  <div class="mapa" id="mapa"></div>

  <button class="reset-btn" id="resetBtn">↺ Reiniciar diario (solo en este navegador)</button>
  <p class="footer-note">Base de juego educativo — para ampliar, agrega especies al arreglo <code>SPECIES</code> en script.js (y su fila en la tabla <code>especies</code> de la base de datos).</p>

  <!-- ============================================================
       VENTANA EMERGENTE: DIARIO DE UNA ESPECIE
       Se llena dinámicamente con JS (función renderJournal en script.js)
       cada vez que el jugador toca un animal/planta en el mapa.
  ============================================================= -->
  <div class="overlay" id="overlay">
    <div class="journal">
      <button class="journal-close" id="closeBtn" aria-label="Cerrar">✕</button>
      <div class="journal-head">
        <div class="journal-emoji" id="jEmoji">🦅</div>
        <div>
          <p class="journal-title" id="jName">Nombre</p>
          <p class="journal-region" id="jRegion">Región</p>
          <p class="journal-sub" id="jStatus">Estado</p>
        </div>
      </div>

      <div class="health-bar-wrap">
        <div class="health-bar-track"><div class="health-bar-fill" id="jHealthFill"></div></div>
        <p class="health-num" id="jHealthNum">Salud: 0/100</p>
      </div>

      <!-- Pestañas: "Cómo cuidarlo" ahora muestra el botón que abre el minijuego -->
      <div class="tabs">
        <button class="tab-btn active" data-tab="datos">Dato curioso</button>
        <button class="tab-btn" data-tab="cuidado">Cómo cuidarlo</button>
        <button class="tab-btn" data-tab="riesgo">Si desaparece</button>
      </div>
      <div class="tab-panel active" data-panel="datos" id="panelDatos"></div>
      <div class="tab-panel" data-panel="cuidado" id="panelCuidado"></div>
      <div class="tab-panel" data-panel="riesgo" id="panelRiesgo"></div>
      <div id="extinctBanner"></div>
    </div>
  </div>

  <!-- ============================================================
       VENTANA EMERGENTE: MINIJUEGO
       Overlay independiente que se abre al tocar "🎮 Jugar minijuego".
       Su contenido (huecos, comida, temporizador) lo arma script.js
       con los datos de "alimentos" de la especie activa.
  ============================================================= -->
  <div class="overlay" id="gameOverlay">
    <div class="journal game-journal">
      <button class="journal-close" id="gameCloseBtn" aria-label="Cerrar minijuego">✕</button>
      <p class="game-titulo" id="gameTitulo">Minijuego</p>
      <p class="game-instrucciones" id="gameInstrucciones"></p>

      <div class="game-hud">
        <span>⏱️ <b id="gameTiempo">15</b>s</span>
        <!-- gameMetricLabel cambia de texto según el tipo de minijuego
             (⭐ Puntos, 🃏 Parejas, 🧭 Ronda meta, ⚡ Aciertos, 🎯 Aciertos,
             💧 Nivel mínimo) — lo actualiza script.js en abrirMinijuego(). -->
        <span><span id="gameMetricLabel">⭐ Puntos:</span> <b id="gamePuntos">0</b> / <span id="gameMeta">40</span></span>
      </div>

      <div class="game-tablero" id="gameTablero"></div>

      <div class="game-resultado" id="gameResultado"></div>
      <button class="game-btn-empezar" id="gameEmpezarBtn">▶ Empezar</button>
    </div>
  </div>

  <!-- ============================================================
       VENTANA EMERGENTE OBLIGATORIA: REGISTRO DE JUGADOR
       Aparece ANTES de poder jugar (punto 3 del encargo). El formulario
       se envía por JavaScript (fetch) a register.php, que llama a
       api/registro.php: crea la cuenta en la tabla `usuarios` de la base
       unificada (misma cuenta que el blog) con password_hash().
       PHP decide si esta ventana empieza abierta o cerrada:
       - abierta si nadie ha iniciado sesión todavía.
       - cerrada si $jugadorLogueado ya es true (sesión compartida del blog).
  ============================================================= -->
  <div class="overlay registro-overlay" id="registroOverlay">
    <div class="journal registro-journal">
      <button type="button" class="journal-close" id="registroCerrar" aria-label="Cerrar">✕</button>
      <p class="registro-emoji">🌎</p>
      <p class="journal-title" style="text-align:center;">Crea tu cuenta de guardián</p>
      <p class="registro-sub">Es opcional: puedes jugar sin cuenta, pero solo con una cuenta tu progreso se guarda para volver otro día a seguir cuidando el ecosistema.</p>

      <!-- El "action"/"method" quedan solo como respaldo; script.js intercepta
           el submit y lo manda por fetch a register.php sin recargar la página. -->
      <form id="registroForm" action="register.php" method="POST" autocomplete="off">
        <label class="registro-label" for="campoUsuario">Nombre de guardián</label>
        <input class="registro-input" type="text" id="campoUsuario" name="nombre_usuario" minlength="3" maxlength="40" required placeholder="Ej: Guardian_Andino">

        <label class="registro-label" for="campoCorreo">Correo</label>
        <input class="registro-input" type="email" id="campoCorreo" name="correo" required placeholder="tucorreo@ejemplo.com">

        <label class="registro-label" for="campoContrasena">Contraseña</label>
        <input class="registro-input" type="password" id="campoContrasena" name="contrasena" minlength="6" required placeholder="Mínimo 6 caracteres">

        <p class="registro-error" id="registroError"></p>
        <button type="submit" class="registro-submit" id="registroSubmit">Registrarme y empezar a jugar</button>
      </form>
    </div>
  </div>

  <div id="toast"></div>

  <!-- ============================================================
       PUENTE PHP -> JAVASCRIPT
       PHP convierte sus variables (llenas con datos de MySQL) en JSON
       para que script.js las pueda leer como JavaScript normal.
       Esto es lo que permite que el juego "recuerde" el progreso.
  ============================================================= -->
  <script>
    // false = hay PHP y MySQL detrás, así que el progreso también viaja al
    // servidor. (La gemela estática index.html pone esta constante en true.)
    const MODO_ESTATICO     = false;
    const JUGADOR_LOGUEADO  = <?php echo json_encode($jugadorLogueado); ?>;
    const NOMBRE_JUGADOR    = <?php echo json_encode($nombreJugador, JSON_UNESCAPED_UNICODE); ?>;
    // (object) para que sin progreso llegue {} y no []: el juego indexa por id de especie.
    const PROGRESO_INICIAL  = <?php echo json_encode((object)$progresoInicial, JSON_UNESCAPED_UNICODE); ?>;
  </script>

  <!-- Todo el JavaScript vive en script.js (separado del HTML) -->
  <script src="script.js"></script>
</body>
</html>

