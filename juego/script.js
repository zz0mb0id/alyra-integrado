/* =============================================================================
   script.js — Guardianes de Colombia
   =============================================================================
   Qué hace este archivo (en orden):
     1. Datos de las regiones (ZONAS) y las especies (SPECIES) del juego.
     2. Estado del juego en el navegador (salud de cada especie, si está
        extinta, posición en el mapa) — arranca en 0 y se completa con lo que
        PHP trajo de la base de datos en PROGRESO_INICIAL (ver index.php).
     3. Construcción del mapa y el movimiento de cada animal/planta.
     4. La ventana "diario" de una especie (dato curioso / cómo cuidarlo / si
        desaparece) y, dentro de "cómo cuidarlo", el botón que abre su minijuego.
     5. El motor de minijuegos: 8 mecánicas distintas (atrapa, memoria,
        secuencia, reflejo, ritmo, equilibrio, clasifica y camino) que se
        reutilizan para cada especie usando su propia lista de alimentos
        buenos/malos, más la capa de "sensación de juego" (cuenta regresiva,
        racha/combo, partículas, leyenda previa y récord personal).
     6. Comunicación con el servidor PHP: registro de jugador (register.php)
        y guardado del progreso (save_progress.php) cada vez que termina un
        minijuego.
   Variables JUGADOR_LOGUEADO, NOMBRE_JUGADOR y PROGRESO_INICIAL vienen del
   HTML (index.php) — las llenó PHP leyendo la sesión y la base de datos MySQL.
   ========================================================================= */

/* ==== 1. REGIONES DE COLOMBIA ====
   Las seis regiones naturales que se enseñan en el colegio colombiano. El
   "id" de cada región es el que usan las especies en su campo "zona", el que
   viaja a la columna `zona` de la tabla `especies` en MySQL, y el que
   buildMap() escribe en data-bioma para que el CSS pueda tintar cada región
   con su propia paleta. */
const ZONAS = [
  { id:'andina',    nombre:'Región Andina',     icon:'🏔️', clase:'zona-andina' },
  { id:'caribe',    nombre:'Región Caribe',     icon:'🌊', clase:'zona-caribe' },
  { id:'pacifico',  nombre:'Región Pacífica',   icon:'🌧️', clase:'zona-pacifico' },
  { id:'amazonia',  nombre:'Región Amazonía',   icon:'🌳', clase:'zona-amazonia' },
  { id:'orinoquia', nombre:'Región Orinoquía',  icon:'🌾', clase:'zona-orinoquia' },
  { id:'insular',   nombre:'Región Insular',    icon:'🏝️', clase:'zona-insular' },
];

/* ==== 1.B ESPECIES DE COLOMBIA ====
   Cada especie trae "alimentos": la mezcla de cosas buenas (bueno:true) y
   dañinas (bueno:false) que los minijuegos usan como "piezas". Ese mismo
   arreglo alimenta la leyenda que se muestra antes de empezar a jugar, así
   que cada "efecto" debe explicar de verdad POR QUÉ ayuda o hace daño: es el
   contenido educativo del juego, no decoración.
   OJO: el "id" de cada especie es la llave primaria en la base de datos
   (tabla `especies` y `progreso_especie`). Nunca se cambia, aunque cambie su
   región: si cambia, el jugador pierde el progreso que ya tenía guardado. */
const SPECIES = [
  {
    id:'condor', nombre:'Cóndor andino', emoji:'🦅', tipo:'animal', zona:'andina',
    estado:'En peligro (Colombia)',
    datos:[
      'Es el ave nacional de Colombia y una de las aves voladoras más grandes del mundo, con hasta 3,2 m de envergadura.',
      'Puede vivir más de 50 años.',
      'Planea aprovechando corrientes de aire caliente, casi sin batir las alas.'
    ],
    alimentos:[
      { emoji:'🦴', nombre:'Carroña silvestre', bueno:true, efecto:'Es su alimento natural: le da toda la energía que necesita.' },
      { emoji:'🐄', nombre:'Res muerta sin contaminar', bueno:true, efecto:'También la come sin problema si no tiene químicos.' },
      { emoji:'☠️', nombre:'Cebo con veneno para zorros', bueno:false, efecto:'Contiene carbofurano o estricnina: letal en minutos.' },
      { emoji:'🔫', nombre:'Presa cazada con plomo', bueno:false, efecto:'El plomo de los perdigones se acumula en su sangre.' },
      { emoji:'💊', nombre:'Ganado con diclofenaco', bueno:false, efecto:'Este medicamento veterinario es letal para aves carroñeras.' }
    ],
    minijuego:{
      tipo:'atrapa', nombreJuego:'Vigía del cielo',
      carriles:3, meta:50, tiempo:30, maxErrores:3,
      // Dificultad progresiva: la comida aparece cada vez más seguido y cae
      // más rápido conforme avanzan los segundos (ver iniciarAtrapa).
      intervaloAparicion:900, intervaloMinimo:420, aceleracion:18,
      velocidadCaida:2400, velocidadCaidaMinima:1400, aceleracionCaida:35,
      comoJugar:'El cóndor plana sobre 3 corrientes de aire (carriles). Toca la comida que cae en cualquiera de los carriles antes de que llegue al suelo. ¡Ojo! Mientras pasa el tiempo todo cae más rápido.',
      comoGanar:'Atrapa comida buena hasta juntar 50 puntos, sin tocar más de 3 alimentos dañinos, antes de que se acabe el tiempo.'
    },
    consecuencia:'El cóndor limpia el páramo comiendo carroña y evita la propagación de enfermedades entre la fauna y el ganado. Sin cóndores, los cadáveres se acumulan y aumenta el riesgo de brotes sanitarios en los ecosistemas de montaña — además de perder al símbolo nacional de Colombia.'
  },
  {
    id:'frailejon', nombre:'Frailejón', emoji:'🌿', tipo:'planta', zona:'andina',
    estado:'Vulnerable',
    datos:[
      'Es una planta típica de los páramos de los Andes del norte de Suramérica.',
      'Crece muy lento: algunas especies apenas 1 centímetro por año.',
      'Sus hojas peludas atrapan la neblina y "fabrican" agua para los ríos.'
    ],
    alimentos:[
      { emoji:'💧', nombre:'Neblina del páramo', bueno:true, efecto:'La absorbe con sus hojas peludas: es su fuente principal de agua.' },
      { emoji:'🪨', nombre:'Suelo de páramo sano', bueno:true, efecto:'De ahí obtiene los nutrientes que necesita para crecer.' },
      { emoji:'🧪', nombre:'Agroquímicos filtrados', bueno:false, efecto:'Envenenan poco a poco sus raíces al filtrarse en el suelo.' },
      { emoji:'🔥', nombre:'Quema del páramo', bueno:false, efecto:'El fuego destruye en minutos una planta que tardó décadas en crecer.' },
      { emoji:'🐄', nombre:'Pisoteo de ganado', bueno:false, efecto:'Compacta el suelo e impide que sus raíces absorban agua.' }
    ],
    minijuego:{
      tipo:'equilibrio', nombreJuego:'Atrapaniebla',
      // "tiempo" (no "duracion") porque el cronómetro general del motor es el
      // que decide cuándo termina la partida: así el reloj del HUD sí corre.
      tiempo:30, descensoPorSegundo:5, incrementoPorClic:12, rangoSano:[30,100], nivelInicial:55,
      comoJugar:'El nivel de agua del frailejón baja solo todo el tiempo, como en un páramo reseco. Toca "💧 Atrapar niebla" seguido para mantenerlo lleno.',
      comoGanar:'Llega al final de los 30 segundos con el nivel de agua en 30% o más. Si el nivel llega a 0%, pierdes de inmediato.'
    },
    consecuencia:'Los páramos son "fábricas de agua": capturan la neblina y alimentan los ríos que abastecen a millones de personas. Sin frailejones sanos, muchas cuencas de los Andes colombianos perderían a su principal regulador natural de agua.'
  },
  {
    id:'danta', nombre:'Danta de páramo', emoji:'🦣', tipo:'animal', zona:'andina',
    estado:'En peligro',
    datos:[
      'Es el mamífero terrestre más grande de Suramérica.',
      'Se le llama "jardinera del bosque" porque dispersa semillas por todo el páramo.',
      'Tiene una pequeña trompa que usa para tomar hojas y frutos.'
    ],
    alimentos:[
      { emoji:'🍃', nombre:'Hojas y frutos silvestres', bueno:true, efecto:'Es la base de su dieta y así dispersa semillas al caminar.' },
      { emoji:'🌾', nombre:'Pastos de páramo', bueno:true, efecto:'Complementa su alimentación sin ningún riesgo.' },
      { emoji:'🪤', nombre:'Trampas de cacería', bueno:false, efecto:'La hieren gravemente al quedar atrapada por sus patas.' },
      { emoji:'🧪', nombre:'Agua de riego con pesticidas', bueno:false, efecto:'Bebe agua contaminada y se intoxica poco a poco.' },
      { emoji:'🚧', nombre:'Basura y plástico de senderos', bueno:false, efecto:'La confunde con comida y le obstruye el estómago.' }
    ],
    minijuego:{
      tipo:'secuencia', nombreJuego:'Sendero seguro',
      direcciones:['⬆️','⬇️','⬅️','➡️'], rondaInicial:3, rondaObjetivo:6, tiempoPorPaso:850, maxErrores:2,
      comoJugar:'Memoriza el camino de flechas que se ilumina paso a paso y luego repítelo tocando las mismas flechas en el mismo orden, para guiar a la danta lejos de las trampas.',
      comoGanar:'Completa correctamente un camino de 6 pasos, sin equivocarte más de 2 veces.'
    },
    consecuencia:'La danta dispersa semillas de muchísimas plantas del páramo al recorrer largas distancias cada día. Sin ella, la vegetación se regenera mucho más lento y el páramo pierde capacidad para seguir almacenando agua.'
  },
  {
    id:'oso', nombre:'Oso de anteojos', emoji:'🐻', tipo:'animal', zona:'andina',
    estado:'Vulnerable',
    datos:[
      'Es la única especie de oso nativa de Suramérica.',
      'Las manchas claras alrededor de sus ojos son únicas en cada individuo.',
      'Es principalmente vegetariano: come frutas, bromelias y a veces maíz.'
    ],
    alimentos:[
      { emoji:'🍈', nombre:'Bromelias y frutas silvestres', bueno:true, efecto:'Es la base real de su dieta en el bosque andino.' },
      { emoji:'🌽', nombre:'Maíz silvestre sin químicos', bueno:true, efecto:'Lo come ocasionalmente sin ningún problema.' },
      { emoji:'🍟', nombre:'Comida humana con sal y grasa', bueno:false, efecto:'Le daña la digestión y lo acostumbra a acercarse a zonas pobladas.' },
      { emoji:'🧪', nombre:'Maíz fumigado con pesticidas', bueno:false, efecto:'Se intoxica igual que un animal doméstico expuesto a químicos.' },
      { emoji:'☠️', nombre:'Cebo envenenado para otros animales', bueno:false, efecto:'Si lo encuentra, lo come y se envenena sin ser el objetivo.' }
    ],
    minijuego:{
      tipo:'ritmo', nombreJuego:'Trepa el árbol',
      zonaBuena:[42,58], velocidad:1200, intentosNecesarios:5, intentosMax:8,
      comoJugar:'La marca se mueve de un lado a otro de la rama. Toca "¡Ahora!" justo cuando la marca esté sobre la zona verde (segura) para que el oso alcance la fruta sin resbalar.',
      comoGanar:'Acierta el momento justo 5 veces antes de agotar los 8 intentos.'
    },
    consecuencia:'El oso de anteojos dispersa semillas de muchas plantas del bosque andino al comer frutas y moverse largas distancias. Sin él, la regeneración del bosque se vuelve más lenta y varias especies de árboles pierden a su principal "sembrador".'
  },
  {
    id:'gallito', nombre:'Gallito de roca andino', emoji:'🦚', tipo:'animal', zona:'andina',
    estado:'Preocupación menor',
    datos:[
      'El macho es de un naranja intensísimo y hace bailes para conquistar pareja.',
      'Vive cerca de quebradas y paredes rocosas del bosque de niebla.',
      'Sus polluelos nacen en nidos de barro pegados a las rocas.'
    ],
    alimentos:[
      { emoji:'🍇', nombre:'Frutos del bosque de niebla', bueno:true, efecto:'Es su alimento principal y así dispersa semillas de árboles.' },
      { emoji:'🦎', nombre:'Pequeños insectos y lagartijas', bueno:true, efecto:'Complementa su dieta sin ningún riesgo.' },
      { emoji:'🪓', nombre:'Tala de árboles con frutos', bueno:false, efecto:'Sin esos árboles, pierde su fuente principal de alimento.' },
      { emoji:'📸', nombre:'Turistas invadiendo el nido', bueno:false, efecto:'El estrés hace que abandone el nido y los huevos.' },
      { emoji:'🐈', nombre:'Gatos domésticos cerca del bosque', bueno:false, efecto:'Cazan a los polluelos que aún no pueden volar bien.' }
    ],
    minijuego:{
      tipo:'reflejo', nombreJuego:'Vigila el nido',
      meta:8, tiempo:15, maxErrores:3,
      // Dificultad progresiva: cada aparición dura menos a medida que avanza
      // el cronómetro, así que hay que reaccionar cada vez más rápido.
      duracionAparicion:750, duracionMinima:430, aceleracion:22, factorIntervalo:0.65,
      comoJugar:'Los frutos y las amenazas aparecen un instante en distintas partes del bosque de niebla. Toca rápido lo que le hace bien antes de que desaparezca; evita tocar lo que le hace daño. Cada vez duran menos en pantalla.',
      comoGanar:'Consigue 8 aciertos en 15 segundos, sin fallar más de 3 veces.'
    },
    consecuencia:'El gallito de roca dispersa semillas de árboles del bosque de niebla y es una especie muy atractiva para el turismo de observación de aves. Sin él, el bosque pierde diversidad de árboles y las comunidades pierden una fuente de ecoturismo.'
  },
  {
    id:'jaguar', nombre:'Jaguar', emoji:'🐆', tipo:'animal', zona:'amazonia',
    estado:'Casi amenazado',
    datos:[
      'Es el felino más grande de América.',
      'Su mordida puede perforar el caparazón de una tortuga.',
      'A diferencia de otros grandes felinos, nada muy bien y disfruta el agua.'
    ],
    alimentos:[
      { emoji:'🦫', nombre:'Chigüiro o danta', bueno:true, efecto:'Son presas naturales que caza con facilidad en la selva.' },
      { emoji:'🐟', nombre:'Peces de río', bueno:true, efecto:'También pesca, gracias a que nada muy bien.' },
      { emoji:'🥩', nombre:'Res envenenada como cebo', bueno:false, efecto:'Ganaderos la usan por venganza tras un ataque; el jaguar muere al comerla.' },
      { emoji:'☣️', nombre:'Presa con mercurio', bueno:false, efecto:'El mercurio de la minería ilegal se acumula en su cuerpo con cada presa.' },
      { emoji:'🔫', nombre:'Presa con fragmentos de plomo', bueno:false, efecto:'Absorbe el metal y sufre intoxicación crónica.' }
    ],
    minijuego:{
      tipo:'ritmo', nombreJuego:'Cacería sigilosa',
      zonaBuena:[38,62], velocidad:1000, intentosNecesarios:5, intentosMax:7,
      comoJugar:'El jaguar acecha esperando el momento justo para saltar. Toca "¡Ahora!" cuando la marca esté sobre la zona verde (segura) para cazar una presa sana.',
      comoGanar:'Caza bien 5 veces antes de agotar los 7 intentos.'
    },
    consecuencia:'Como depredador tope de la Amazonía, el jaguar controla las poblaciones de herbívoros. Sin jaguares, especies como el chigüiro o el venado se multiplican sin control, afectando la vegetación y el equilibrio de toda la selva.'
  },
  {
    id:'delfin', nombre:'Delfín rosado', emoji:'🐬', tipo:'animal', zona:'amazonia',
    estado:'En peligro',
    datos:[
      'Habita los ríos de la Amazonía y la Orinoquía colombianas.',
      'Su piel se vuelve más rosada con la edad y la actividad.',
      'Tiene el cuello más flexible que otros delfines.'
    ],
    alimentos:[
      { emoji:'🐟', nombre:'Peces de río', bueno:true, efecto:'Es su alimento principal, que busca entre raíces sumergidas.' },
      { emoji:'🦐', nombre:'Pequeños crustáceos', bueno:true, efecto:'Complementa su dieta sin problema.' },
      { emoji:'☣️', nombre:'Peces con mercurio', bueno:false, efecto:'El mercurio de la minería de oro se acumula en su cerebro y grasa.' },
      { emoji:'🛍️', nombre:'Microplásticos', bueno:false, efecto:'Puede confundirlos con alimento y quedar con fragmentos en el estómago.' },
      { emoji:'🛢️', nombre:'Agua con combustible', bueno:false, efecto:'Contamina el agua que respira y los peces que come.' }
    ],
    minijuego:{
      tipo:'atrapa', nombreJuego:'Nada entre las raíces',
      carriles:3, meta:50, tiempo:17, maxErrores:3,
      intervaloAparicion:850, intervaloMinimo:450, aceleracion:24,
      velocidadCaida:2000, velocidadCaidaMinima:1200, aceleracionCaida:48,
      comoJugar:'El delfín nada entre 3 corrientes del río (carriles). Toca lo que cae en cada corriente para atraparlo antes de que pase de largo.',
      comoGanar:'Junta 50 puntos antes de que se acabe el tiempo, sin más de 3 errores.'
    },
    consecuencia:'El delfín rosado es un indicador de la salud de los ríos amazónicos. Su desaparición señalaría ríos gravemente contaminados, lo que también afectaría la pesca de la que dependen muchas comunidades ribereñas.'
  },
  {
    id:'guacamayo', nombre:'Guacamayo', emoji:'🦜', tipo:'animal', zona:'amazonia',
    estado:'Vulnerable',
    datos:[
      'Puede vivir más de 50 años en estado silvestre.',
      'Forma parejas de por vida.',
      'Usa su pico curvo tanto para trepar como para abrir semillas muy duras.'
    ],
    alimentos:[
      { emoji:'🥜', nombre:'Semillas y frutas de la selva', bueno:true, efecto:'Es su dieta natural, rica en energía.' },
      { emoji:'🧱', nombre:'Arcilla de collpa', bueno:true, efecto:'Neutraliza toxinas naturales de algunas semillas que come.' },
      { emoji:'🥑', nombre:'Aguacate', bueno:false, efecto:'Contiene persina, tóxica para la mayoría de las aves.' },
      { emoji:'🍫', nombre:'Chocolate y cafeína', bueno:false, efecto:'Dañan su corazón y sistema nervioso.' },
      { emoji:'🍟', nombre:'Comida salada o procesada', bueno:false, efecto:'Su cuerpo no procesa bien tanto sodio; le daña los riñones.' }
    ],
    minijuego:{
      tipo:'atrapa', nombreJuego:'Vuelo certero',
      carriles:3, meta:50, tiempo:30, maxErrores:3,
      intervaloAparicion:800, intervaloMinimo:400, aceleracion:15,
      velocidadCaida:1900, velocidadCaidaMinima:1150, aceleracionCaida:28,
      comoJugar:'El guacamayo vuela entre 3 rutas de la selva (carriles). Toca las semillas y frutas que caen en su camino; evita lo que le hace daño.',
      comoGanar:'Junta 50 puntos antes de que se acabe el tiempo, sin más de 3 errores.'
    },
    consecuencia:'Los guacamayos dispersan semillas de árboles y palmas al volar grandes distancias. Sin ellos, muchas especies vegetales de la selva pierden a uno de sus principales dispersores, reduciendo la diversidad del bosque.'
  },
  {
    id:'nutria', nombre:'Nutria gigante', emoji:'🦦', tipo:'animal', zona:'amazonia',
    estado:'En peligro',
    datos:[
      'Es la nutria más grande del mundo: puede medir casi 2 metros.',
      'Vive en grupos familiares muy ruidosos y comunicativos.',
      'Puede comer hasta 4 kilos de pescado al día.'
    ],
    alimentos:[
      { emoji:'🐟', nombre:'Peces de río abundantes', bueno:true, efecto:'Es su alimento principal, y necesita ríos con buena pesca.' },
      { emoji:'🦀', nombre:'Cangrejos de río', bueno:true, efecto:'Los caza sin dificultad cuando el río está sano.' },
      { emoji:'☣️', nombre:'Peces con mercurio', bueno:false, efecto:'El mercurio de la minería se acumula en su cuerpo poco a poco.' },
      { emoji:'🕸️', nombre:'Redes de pesca abandonadas', bueno:false, efecto:'Queda atrapada y no puede subir a respirar.' },
      { emoji:'🛢️', nombre:'Agua con combustible de motores', bueno:false, efecto:'Le irrita la piel y contamina su alimento.' }
    ],
    minijuego:{
      tipo:'memoria', nombreJuego:'Pesca en familia',
      pares:[{emoji:'🐟',nombre:'Pez de río sano'},{emoji:'🦀',nombre:'Cangrejo de río'},{emoji:'💧',nombre:'Agua limpia'}],
      trampas:[{emoji:'☣️',nombre:'Mercurio'},{emoji:'🕸️',nombre:'Red abandonada'},{emoji:'🛢️',nombre:'Combustible'}],
      tiempo:20, maxErrores:2,
      comoJugar:'Voltea las cartas de a dos para encontrar las parejas de comida sana del río. ¡Cuidado! Algunas cartas son trampas de contaminación: si volteas una, cuenta como error.',
      comoGanar:'Encuentra las 3 parejas antes de que se acabe el tiempo, sin voltear más de 2 cartas trampa.'
    },
    consecuencia:'La nutria gigante necesita ríos muy sanos para sobrevivir, así que es un termómetro de la salud de los ríos amazónicos. Su desaparición indicaría ríos con pesca colapsada, afectando también a las comunidades que dependen del pescado.'
  },
  {
    id:'tortuga', nombre:'Tortuga marina', emoji:'🐢', tipo:'animal', zona:'caribe',
    estado:'En peligro',
    datos:[
      'Puede vivir más de 80 años y regresa a poner huevos a la misma playa donde nació.',
      'Usa el campo magnético de la Tierra como un GPS natural.',
      'Puede contener la respiración bajo el agua durante horas mientras descansa.'
    ],
    alimentos:[
      { emoji:'🌿', nombre:'Pasto y algas marinas', bueno:true, efecto:'Es su alimento principal según la especie.' },
      { emoji:'🪼', nombre:'Medusas', bueno:true, efecto:'Algunas especies las cazan sin problema.' },
      { emoji:'🛍️', nombre:'Bolsas plásticas', bueno:false, efecto:'Las confunde con medusas; le obstruyen el intestino.' },
      { emoji:'🚬', nombre:'Colillas y microplásticos de playa', bueno:false, efecto:'Los traga junto con la arena al confundirlos con comida.' },
      { emoji:'🛢️', nombre:'Petróleo derramado', bueno:false, efecto:'Le daña la piel y los pulmones, y contamina su alimento.' }
    ],
    minijuego:{
      tipo:'secuencia', nombreJuego:'Rumbo a la playa',
      direcciones:['⬆️','⬇️','⬅️','➡️'], rondaInicial:3, rondaObjetivo:6, tiempoPorPaso:800, maxErrores:2,
      comoJugar:'Sigue el camino de corrientes marinas que se ilumina paso a paso y repítelo en el mismo orden para esquivar el plástico del mar y llegar a la playa.',
      comoGanar:'Completa correctamente un camino de 6 pasos, sin equivocarte más de 2 veces.'
    },
    consecuencia:'Las tortugas mantienen recortados los pastos marinos y dispersan nutrientes hacia los arrecifes de coral del Caribe. Sin ellas, los pastos crecen en exceso, baja el oxígeno del agua y se pierden criaderos de peces.'
  },
  {
    id:'coral', nombre:'Coral', emoji:'🪸', tipo:'planta', zona:'caribe',
    estado:'En peligro crítico',
    datos:[
      'Aunque parece roca o planta, es una colonia de miles de animales diminutos.',
      'Los arrecifes del Caribe albergan cerca de una cuarta parte de toda la vida marina.',
      'Puede "blanquearse" y morir cuando el mar se calienta demasiado.'
    ],
    alimentos:[
      { emoji:'🦠', nombre:'Algas internas (zooxantelas)', bueno:true, efecto:'Viven dentro de él y le dan energía mediante fotosíntesis.' },
      { emoji:'🌊', nombre:'Plancton nocturno', bueno:true, efecto:'Lo atrapa de noche con sus tentáculos.' },
      { emoji:'🧴', nombre:'Protector solar con oxibenzona', bueno:false, efecto:'Daña las algas que vive dentro de él y acelera su blanqueamiento.' },
      { emoji:'🌾', nombre:'Fertilizantes agrícolas', bueno:false, efecto:'El exceso de nutrientes hace que otras algas lo cubran y lo asfixien.' },
      { emoji:'🚽', nombre:'Aguas residuales sin tratar', bueno:false, efecto:'Le provocan enfermedades y manchas necróticas.' }
    ],
    minijuego:{
      tipo:'memoria', nombreJuego:'Cuida el arrecife',
      pares:[{emoji:'🦠',nombre:'Algas internas'},{emoji:'🌊',nombre:'Plancton nocturno'},{emoji:'🐠',nombre:'Pez limpiador'}],
      trampas:[{emoji:'🧴',nombre:'Protector solar'},{emoji:'🌾',nombre:'Fertilizante'},{emoji:'🚽',nombre:'Aguas residuales'}],
      tiempo:20, maxErrores:2,
      comoJugar:'Voltea las cartas de a dos y encuentra las parejas que mantienen sano al coral. Evita voltear las cartas de contaminación: cuentan como error.',
      comoGanar:'Encuentra las 3 parejas antes de que se acabe el tiempo, sin voltear más de 2 cartas trampa.'
    },
    consecuencia:'Si el coral desaparece, colapsa el hogar de miles de especies marinas del Caribe: peces, moluscos y crustáceos pierden refugio y alimento. Las costas también quedan más expuestas a tormentas.'
  },
  {
    id:'manati', nombre:'Manatí del Caribe', emoji:'🦭', tipo:'animal', zona:'caribe',
    estado:'En peligro',
    datos:[
      'Se le conoce como "vaca marina" porque pasta pastos acuáticos todo el día.',
      'Puede comer hasta el 10% de su peso en plantas cada día.',
      'Es pariente lejano de los elefantes, no de las focas.'
    ],
    alimentos:[
      { emoji:'🌿', nombre:'Pastos acuáticos', bueno:true, efecto:'Es su alimento principal, y necesita aguas limpias y tranquilas.' },
      { emoji:'🍃', nombre:'Manglar sumergido', bueno:true, efecto:'También se alimenta de hojas cerca de la orilla.' },
      { emoji:'🚤', nombre:'Golpes de hélices de lancha', bueno:false, efecto:'Nada muy lento y sufre heridas graves por embarcaciones rápidas.' },
      { emoji:'🕸️', nombre:'Redes y cuerdas abandonadas', bueno:false, efecto:'Se enreda y no puede subir a respirar con normalidad.' },
      { emoji:'🏗️', nombre:'Construcción sobre manglares', bueno:false, efecto:'Destruye las zonas donde se alimenta y cría a sus crías.' }
    ],
    minijuego:{
      tipo:'atrapa', nombreJuego:'Nada tranquilo',
      carriles:3, meta:50, tiempo:18, maxErrores:3,
      intervaloAparicion:950, intervaloMinimo:520, aceleracion:25,
      velocidadCaida:2300, velocidadCaidaMinima:1400, aceleracionCaida:50,
      comoJugar:'El manatí nada despacio entre 3 zonas del mar (carriles). Toca los pastos marinos que caen y evita lo que le hace daño.',
      comoGanar:'Junta 50 puntos antes de que se acabe el tiempo, sin más de 3 errores.'
    },
    consecuencia:'El manatí mantiene sanos los pastos marinos al alimentarse de ellos, lo que ayuda a otras especies del Caribe. Sin manatíes, los pastizales acuáticos crecen desordenadamente y pierden su función como criadero de peces.'
  },
  {
    id:'rana', nombre:'Rana dorada venenosa', emoji:'🐸', tipo:'animal', zona:'pacifico',
    estado:'En peligro crítico',
    datos:[
      'Es endémica del Chocó: no existe en ningún otro lugar del planeta.',
      'Es una de las especies más venenosas del planeta, pero solo en su hábitat natural.',
      'Comunidades emberá usaban tradicionalmente su veneno para dardos de caza.'
    ],
    alimentos:[
      { emoji:'🐜', nombre:'Hormigas y termitas', bueno:true, efecto:'De ahí obtiene los alcaloides que forman su veneno natural.' },
      { emoji:'🪲', nombre:'Pequeños escarabajos', bueno:true, efecto:'Completa su dieta insectívora sin problema.' },
      { emoji:'🧪', nombre:'Insectos con pesticidas', bueno:false, efecto:'El químico se acumula en su cuerpo y la enferma.' },
      { emoji:'🧴', nombre:'Protector solar en manos de turistas', bueno:false, efecto:'Su piel es muy permeable y absorbe químicos con facilidad.' },
      { emoji:'🏠', nombre:'Dieta inadecuada en cautiverio', bueno:false, efecto:'Sin sus insectos silvestres se desnutre y deja de producir veneno.' }
    ],
    minijuego:{
      tipo:'reflejo', nombreJuego:'Caza de hormigas',
      meta:9, tiempo:30, maxErrores:3,
      duracionAparicion:650, duracionMinima:380, aceleracion:10, factorIntervalo:0.62,
      comoJugar:'Los insectos aparecen un instante entre las hojas. Toca rápido las hormigas y escarabajos sanos antes de que se escondan; evita los que tienen pesticida.',
      comoGanar:'Consigue 9 aciertos en 30 segundos, sin fallar más de 3 veces.'
    },
    consecuencia:'Al ser endémica del Chocó, si desaparece se pierde para siempre una especie única en el mundo. Su ausencia también reduciría el control natural de insectos en la selva húmeda del Pacífico colombiano.'
  },
  {
    id:'ballena', nombre:'Ballena jorobada', emoji:'🐋', tipo:'animal', zona:'pacifico',
    estado:'Preocupación menor (en recuperación)',
    datos:[
      'Cada año viaja miles de kilómetros desde la Antártida hasta el Pacífico colombiano para tener sus crías.',
      'Es famosa por sus saltos y sus cantos, que pueden durar horas.',
      'Las crías nacen sin capa de grasa y crecen rápido gracias a la leche materna.'
    ],
    alimentos:[
      { emoji:'🦐', nombre:'Kril y pequeños peces (en su ruta migratoria)', bueno:true, efecto:'Es lo que come antes de migrar; en Colombia vive de sus reservas de grasa.' },
      { emoji:'🌊', nombre:'Aguas tranquilas para criar', bueno:true, efecto:'Necesita mares calmados en el Pacífico para cuidar a su cría.' },
      { emoji:'🚢', nombre:'Tráfico de barcos grandes', bueno:false, efecto:'El ruido y los choques con barcos la estresan y pueden herirla.' },
      { emoji:'🕸️', nombre:'Redes de pesca a la deriva', bueno:false, efecto:'Se enreda y le cuesta subir a respirar.' },
      { emoji:'🛢️', nombre:'Derrames de combustible', bueno:false, efecto:'Contamina el agua que necesita para descansar y amamantar a su cría.' }
    ],
    minijuego:{
      tipo:'ritmo', nombreJuego:'Ruta migratoria',
      zonaBuena:[40,60], velocidad:1500, intentosNecesarios:5, intentosMax:8,
      comoJugar:'La ballena viaja miles de kilómetros. Toca "¡Ahora!" cuando la marca esté sobre la zona verde (segura) para avanzar esquivando los barcos.',
      comoGanar:'Avanza bien 5 veces antes de agotar los 8 intentos.'
    },
    consecuencia:'El Pacífico chocoano es una de las mejores zonas del mundo para ver ballenas jorobadas con sus crías, lo cual sostiene el turismo responsable de varios pueblos costeros. Sin ballenas, esas comunidades pierden una fuente de ingresos y el océano pierde a un gran distribuidor de nutrientes marinos.'
  },

  /* ---- Región Orinoquía (los Llanos): sabana inundable, esteros y morichales ---- */
  {
    id:'chiguiro', nombre:'Chigüiro', emoji:'🦫', tipo:'animal', zona:'orinoquia',
    estado:'Preocupación menor (presión por caza)',
    datos:[
      'Es el roedor más grande del mundo: un adulto de los Llanos puede pasar de 60 kilos.',
      'Tiene los ojos, las orejas y la nariz en la parte alta de la cabeza, así que puede quedarse casi todo sumergido y seguir respirando y vigilando.',
      'Sus patas son semipalmeadas: nada muy bien y puede permanecer varios minutos bajo el agua para escaparse de un depredador.',
      'En las mañanas come sus propios excrementos blandos: así vuelve a pasar el pasto por el estómago y aprovecha la fibra que la primera vez no pudo digerir.'
    ],
    alimentos:[
      { emoji:'🌾', nombre:'Pastos nativos del estero', bueno:true, efecto:'Casi toda su dieta es hierba fresca: come varios kilos al día y mantiene el pastizal podado.' },
      { emoji:'🌿', nombre:'Plantas acuáticas del rebalse', bueno:true, efecto:'En época de lluvias come plantas de agua, que le dan humedad y minerales.' },
      { emoji:'💧', nombre:'Caño con agua limpia', bueno:true, efecto:'Pasa el día metido en el agua: ahí se refresca del calor llanero y se esconde del jaguar.' },
      { emoji:'🧪', nombre:'Pasto fumigado con herbicida', bueno:false, efecto:'El herbicida de los cultivos de arroz llega al estero y le daña el hígado y los riñones.' },
      { emoji:'🍞', nombre:'Pan y papas de los turistas', bueno:false, efecto:'Su estómago está hecho para fibra: el almidón le fermenta mal y le causa infecciones digestivas graves.' },
      { emoji:'🔥', nombre:'Quema de sabana en verano', bueno:false, efecto:'Las quemas para "renovar" el pasto arrasan los matorrales donde esconde a sus crías recién nacidas.' },
      { emoji:'🐕', nombre:'Jauría de perros sueltos', bueno:false, efecto:'Los perros de finca cazan en grupo y alcanzan a las crías antes de que lleguen al agua.' }
    ],
    minijuego:{
      tipo:'clasifica', nombreJuego:'Estero limpio',
      tiempo:30, meta:8, maxErrores:3,
      comoJugar:'Va apareciendo una cosa a la vez al borde del estero. Decide rápido: mándala a la cesta "Lo cuida" si le hace bien al chigüiro, o a "Lo amenaza" si le hace daño.',
      comoGanar:'Clasifica bien 8 cosas antes de que se acabe el tiempo, sin equivocarte más de 3 veces.'
    },
    consecuencia:'El chigüiro es la presa más abundante del jaguar, el puma y la anaconda en los Llanos, y al pastar mantiene abiertos los esteros donde anidan garzas y patos. Si desaparece, los grandes depredadores se quedan sin su alimento principal y empiezan a buscar terneros, lo que dispara el conflicto con los ganaderos y termina en más cacería de jaguares.'
  },
  {
    id:'palmero', nombre:'Oso palmero', emoji:'🐜', tipo:'animal', zona:'orinoquia',
    estado:'Vulnerable',
    datos:[
      'No tiene ni un solo diente: atrapa a sus presas con una lengua pegajosa de hasta 60 centímetros que mueve más de 150 veces por minuto.',
      'Puede comer decenas de miles de hormigas y termitas en un día, pero se queda menos de un minuto en cada nido: así ningún hormiguero se acaba y mañana vuelve a tener comida.',
      'Su cola es más larga y tupida que su propio cuerpo, y la usa como cobija para dormir tapado en la sabana.',
      'Camina muy lento y ve muy poco, por eso es uno de los animales más atropellados en las carreteras de Casanare, Meta y Arauca.'
    ],
    alimentos:[
      { emoji:'🐜', nombre:'Hormigas de sabana', bueno:true, efecto:'Abre el hormiguero con sus garras, lame un poco y sigue: el nido se recupera y él vuelve otro día.' },
      { emoji:'🪳', nombre:'Termitas del termitero', bueno:true, efecto:'Las termitas son casi la mitad de su dieta y le dan el agua que casi nunca bebe aparte.' },
      { emoji:'🌳', nombre:'Mata de monte para refugiarse', bueno:true, efecto:'Los parches de bosque en medio de la sabana le dan sombra y lo salvan del fuego y del sol del mediodía.' },
      { emoji:'🔥', nombre:'Quema de la sabana', bueno:false, efecto:'Camina lentísimo y no alcanza a huir del fuego: las quemas son su principal causa de muerte en los Llanos.' },
      { emoji:'🧪', nombre:'Hormigas con insecticida', bueno:false, efecto:'El veneno de los cultivos se concentra en los insectos que lame, y él come miles cada día.' },
      { emoji:'🛣️', nombre:'Carretera sin paso de fauna', bueno:false, efecto:'Cruza despacio y de noche; sin pasos de fauna ni reductores, los atropellamientos matan cientos cada año.' },
      { emoji:'🐕', nombre:'Perros de finca', bueno:false, efecto:'No puede correr ni trepar: solo se defiende parado con las garras, y una jauría termina matándolo.' }
    ],
    minijuego:{
      tipo:'camino', nombreJuego:'Cruce de sabana',
      tiempo:35, filas:5, columnas:3, maxErrores:3, pistaMs:850,
      metaTexto:'Llega a la mata de monte: 5 filas de sabana segura',
      comoJugar:'El oso palmero debe cruzar la sabana fila por fila, empezando por la de más abajo. Al abrirse cada fila, la piedra firme se asoma un segundo: memorízala, porque enseguida se tapa. Las otras esconden una amenaza de los Llanos.',
      comoGanar:'Cruza las 5 filas antes de que se acabe el tiempo, sin pisar más de 3 amenazas.'
    },
    consecuencia:'Un solo oso palmero controla millones de hormigas y termitas al año sin acabar con ningún nido, porque come un poquito en cada uno y sigue de largo. Sin él, los termiteros se multiplican y endurecen el suelo de los pastizales llaneros; además la Orinoquía pierde a su especie bandera, la que hoy motiva los pasos de fauna y las jornadas contra las quemas.'
  },
  {
    id:'moriche', nombre:'Palma de moriche', emoji:'🌴', tipo:'planta', zona:'orinoquia',
    estado:'Amenazada localmente (tala y sobrecosecha)',
    datos:[
      'Forma los morichales: franjas de palmas a lo largo de los caños que funcionan como oasis y nacederos de agua en medio de la sabana seca.',
      'Su fruto, la canangucha o moriche, tiene muchísima más provitamina A que la zanahoria, y con él se preparan jugos y dulces en los Llanos y la Amazonía.',
      'Es dioica: hay palmas macho y palmas hembra, y solo las hembras dan fruto. Por eso tumbar una hembra para cosechar acaba con la producción de ese sitio por décadas.',
      'En sus troncos muertos en pie anidan guacamayas y pericos, y de sus frutos caídos comen dantas, chigüiros, peces y cerdos de monte.'
    ],
    alimentos:[
      { emoji:'💧', nombre:'Suelo encharcado del morichal', bueno:true, efecto:'Sus raíces viven en agua permanente: por eso crece donde ningún otro árbol grande aguanta.' },
      { emoji:'☀️', nombre:'Sol pleno de la sabana', bueno:true, efecto:'Es una palma de plena luz: con sol directo levanta su tronco por encima de todo el humedal.' },
      { emoji:'🦜', nombre:'Animales que dispersan su semilla', bueno:true, efecto:'Dantas, chigüiros y peces se comen el fruto y dejan la semilla lejos de la palma madre, donde sí tiene espacio para crecer.' },
      { emoji:'🪓', nombre:'Tumbar la palma para bajar el racimo', bueno:false, efecto:'Es la amenaza número uno: matan una palma hembra de 40 años para cosechar un racimo de un día.' },
      { emoji:'🚜', nombre:'Drenaje del morichal para potrero', bueno:false, efecto:'Si se seca el humedal, la palma muere de raíz y el nacedero de agua del hato desaparece con ella.' },
      { emoji:'🔥', nombre:'Quema que entra al morichal', bueno:false, efecto:'El fuego de la sabana alcanza las palmas jóvenes y corta la regeneración de todo el morichal.' },
      { emoji:'🛢️', nombre:'Derrame de crudo en el caño', bueno:false, efecto:'El petróleo cubre el suelo encharcado y asfixia las raíces, que necesitan agua limpia para respirar.' }
    ],
    minijuego:{
      tipo:'equilibrio', nombreJuego:'Morichal vivo',
      tiempo:30, descensoPorSegundo:6, incrementoPorClic:11, rangoSano:[35,100], nivelInicial:55,
      etiquetaBoton:'💧 Guardar agua del caño',
      comoJugar:'En el verano llanero el agua del morichal baja sin parar. Toca "💧 Guardar agua del caño" seguido para que el suelo del morichal no se seque.',
      comoGanar:'Llega al final de los 30 segundos con el nivel de agua en 35% o más. Si el nivel llega a 0%, el morichal se seca y pierdes de inmediato.'
    },
    consecuencia:'El morichal es la fábrica de agua de la Orinoquía: guarda el agua de las lluvias y la suelta poco a poco en verano, cuando toda la sabana está seca. Si las palmas desaparecen, el caño se seca antes de tiempo, el ganado y la fauna se quedan sin dónde beber, y más de 200 especies que dependen del moriche —guacamayas, dantas, peces— pierden a la vez su comida y su sitio de anidación.'
  },

  /* ---- Región Insular: San Andrés, Providencia, Santa Catalina y Malpelo ---- */
  {
    id:'cangrejo', nombre:'Cangrejo negro de Providencia', emoji:'🦀', tipo:'animal', zona:'insular',
    estado:'Amenazado (con veda en el archipiélago)',
    datos:[
      'Vive en el monte de Providencia y Santa Catalina, tierra adentro, pero cada año baja en masa hasta el mar para soltar sus huevos.',
      'Es un cangrejo de tierra: respira con branquias que deben estar húmedas, así que necesita sombra y hojarasca… y se ahoga si lo dejan mucho rato bajo el agua.',
      'Durante la migración (más o menos de abril a julio) la isla declara veda y cierra tramos de carretera para dejarlos cruzar.',
      'El "crab back" hecho con su carne es un plato tradicional del pueblo raizal: cuidarlo también es cuidar una cultura.'
    ],
    alimentos:[
      { emoji:'🍂', nombre:'Hojarasca del bosque seco', bueno:true, efecto:'Come hojas caídas y las convierte en abono: es el reciclador del suelo de la isla.' },
      { emoji:'🥭', nombre:'Frutos caídos del monte', bueno:true, efecto:'Los frutos maduros le dan azúcares para aguantar la caminata hasta el mar.' },
      { emoji:'💧', nombre:'Sombra y humedad del monte', bueno:true, efecto:'Sus branquias solo funcionan mojadas: sin bosque húmedo no puede respirar bien.' },
      { emoji:'🚗', nombre:'Carros en plena migración', bueno:false, efecto:'Miles mueren atropellados en los días en que bajan al mar; por eso la isla cierra vías en esa temporada.' },
      { emoji:'🪤', nombre:'Captura durante la veda', bueno:false, efecto:'Sacarlos justo cuando van a desovar corta de un golpe la reproducción de todo el año.' },
      { emoji:'🔥', nombre:'Tala y quema del monte', bueno:false, efecto:'Sin árboles no hay sombra ni hojarasca, y las madrigueras quedan expuestas al sol.' },
      { emoji:'🚽', nombre:'Aguas negras y basura en la costa', bueno:false, efecto:'Contaminan justo la franja de orilla donde las hembras sueltan sus larvas.' }
    ],
    minijuego:{
      tipo:'camino', nombreJuego:'Bajada al mar',
      tiempo:32, filas:5, columnas:3, maxErrores:3, pistaMs:800,
      metaTexto:'Llega a la orilla: 5 tramos del camino al mar',
      comoJugar:'El cangrejo baja del monte al mar cruzando tramo por tramo, desde el de más abajo. Al abrirse cada tramo, la piedra firme se asoma un segundo: memorízala antes de que se tape. Las otras esconden una amenaza de la isla.',
      comoGanar:'Cruza los 5 tramos antes de que se acabe el tiempo, sin pisar más de 3 amenazas.'
    },
    consecuencia:'El cangrejo negro es el jardinero del bosque seco insular: come hojarasca, cava madrigueras que airean el suelo y lleva nutrientes del monte al mar cuando desova. Si desaparece, el bosque de Providencia pierde a su principal reciclador, el suelo se compacta, y la comunidad raizal pierde a la vez un alimento, un ingreso y una tradición que ya ha sobrevivido huracanes.'
  },
  {
    id:'piquero', nombre:'Piquero de Malpelo', emoji:'🐦', tipo:'animal', zona:'insular',
    estado:'Preocupación menor (colonia única en Colombia)',
    datos:[
      'El Santuario de Fauna y Flora Malpelo alberga la colonia más grande del mundo de piquero de Nazca: se estiman alrededor de 25.000 parejas en una sola roca.',
      'Pesca lanzándose en picada desde más de 20 metros de altura y entra al agua como una flecha, con las alas pegadas al cuerpo.',
      'Casi siempre pone dos huevos, pero solo saca adelante un polluelo: el segundo huevo es un "seguro" por si el primero no nace.',
      'Malpelo es apenas una roca de unas 35 hectáreas a casi 500 km de Buenaventura: no tiene árboles ni agua dulce, así que las aves anidan directamente en el suelo pelado.'
    ],
    alimentos:[
      { emoji:'🐟', nombre:'Cardúmenes de sardinas', bueno:true, efecto:'Son la base de su dieta: los detecta desde el aire y se lanza en picada sobre el banco de peces.' },
      { emoji:'🦑', nombre:'Calamares de superficie', bueno:true, efecto:'De noche y al amanecer suben a la superficie y completan su alimentación.' },
      { emoji:'🪨', nombre:'Roca limpia para anidar', bueno:true, efecto:'No construye nido: pone el huevo en el suelo desnudo, así que necesita la roca libre de obstáculos.' },
      { emoji:'🪝', nombre:'Palangres y anzuelos ilegales', bueno:false, efecto:'Se lanza sobre el cebo del anzuelo, queda enganchada y se ahoga arrastrada por la línea.' },
      { emoji:'🛍️', nombre:'Plásticos flotando en el mar', bueno:false, efecto:'Los confunde con peces brillantes y termina llevándoselos al polluelo en el buche.' },
      { emoji:'🐀', nombre:'Ratas y cabras introducidas', bueno:false, efecto:'En islas oceánicas, los animales que llegan en los barcos se comen huevos y polluelos que están en el suelo, sin defensa.' },
      { emoji:'🚢', nombre:'Pesca industrial que vacía el mar', bueno:false, efecto:'Si las flotas se llevan los cardúmenes cercanos, los padres no alcanzan a traer comida y el polluelo muere de hambre.' }
    ],
    minijuego:{
      tipo:'reflejo', nombreJuego:'Picada certera',
      meta:10, tiempo:25, maxErrores:3,
      duracionAparicion:700, duracionMinima:400, aceleracion:12, factorIntervalo:0.6,
      comoJugar:'Desde el aire ves pasar cosas un instante sobre el mar de Malpelo. Lánzate solo sobre lo que de verdad alimenta al piquero; no piques lo que flota y hace daño. Cada vez pasan más rápido.',
      comoGanar:'Consigue 10 picadas buenas en 25 segundos, sin fallar más de 3 veces.'
    },
    consecuencia:'Las aves marinas conectan el mar con la tierra: el guano de la colonia fertiliza la roca de Malpelo y nutre la vida del arrecife que la rodea, y las bandadas de piqueros cazando en superficie son la señal que usan los pescadores para encontrar los cardúmenes. Si la colonia se pierde, Colombia pierde una de las mayores concentraciones de aves marinas del Pacífico oriental y el santuario deja de cumplir su papel como refugio de reproducción.'
  }
];

/* ==== 2. ESTADO DEL JUEGO EN EL NAVEGADOR ====
   state[id] = { salud, extinto, jugado, x, y }
   - salud: 0 a 100. EMPIEZA EN 0 (punto 2 del encargo): solo sube si el
     jugador gana los minijuegos.
   - jugado: true después del primer minijuego jugado; sirve para no marcar
     "extinto" a una especie que simplemente todavía no ha sido jugada.
   - x/y: posición dentro de su hábitat, para la animación de caminar. */
let state = {}, facing = {}, hovered = {}, movementTimers = {};

function initState(){
  state = {}; facing = {}; hovered = {};
  SPECIES.forEach(sp=>{
    // Si PHP trajo progreso guardado en la base de datos para esta especie,
    // lo usamos como punto de partida; si no, arranca todo en 0.
    const guardado = (typeof PROGRESO_INICIAL !== 'undefined') ? PROGRESO_INICIAL[sp.id] : null;
    state[sp.id] = {
      salud: guardado ? guardado.salud : 0,
      extinto: guardado ? guardado.extinto : false,
      jugado: !!guardado,
      x: 15 + Math.random()*70,
      y: 25 + Math.random()*55
    };
    facing[sp.id] = 'right';
    hovered[sp.id] = false;
  });
}
initState();

let activeId = null;      // id de la especie que está abierta en el diario
let activeTab = 'datos';  // pestaña activa del diario
const mapaEl = document.getElementById('mapa');
const overlay = document.getElementById('overlay');

function healthColor(h){ if(h<=20) return 'var(--brick)'; if(h<=50) return 'var(--clay)'; return 'var(--forest)'; }

/* ==== 3. CONSTRUCCIÓN DEL MAPA ====
   Recorre ZONAS y, dentro de cada una, las especies que le pertenecen
   (SPECIES.filter). Crea el HTML de cada criatura con JavaScript y le
   conecta el evento de clic que abre su diario (openJournal).
   El medallón lleva data-bioma con el id de la región para que el CSS pueda
   tintar cada criatura con los colores de su región, y el emoji va envuelto
   en .medallion-emoji para poder animarlo aparte del fondo del medallón. */
function buildMap(){
  mapaEl.innerHTML = '';
  // .escalona es una utilidad de herbario.css: hace que los hijos directos
  // (aquí, las seis regiones) entren en cascada, una detrás de otra.
  mapaEl.classList.add('escalona');
  ZONAS.forEach(z=>{
    const especiesZona = SPECIES.filter(s=>s.zona===z.id);
    const zonaDiv = document.createElement('section');
    zonaDiv.className = 'zona ' + z.clase;
    zonaDiv.id = 'zona-'+z.id;
    zonaDiv.innerHTML = `
      <div class="zona-head"><span class="icon">${z.icon}</span><span class="nombre">${z.nombre}</span></div>
      <p class="zona-msg" id="zonaMsg-${z.id}"></p>
      <div class="habitat" id="habitat-${z.id}"></div>
    `;
    mapaEl.appendChild(zonaDiv);
    const habitat = zonaDiv.querySelector('.habitat');
    especiesZona.forEach(sp=>{
      const wrap = document.createElement('div');
      wrap.className = 'criatura';
      wrap.id = 'crit-'+sp.id;
      wrap.style.left = state[sp.id].x + '%';
      wrap.style.top = state[sp.id].y + '%';
      // Un giro y un retardo distintos por criatura: así el CSS las hace
      // flotar/balancearse en desorden y el mapa parece vivo, no un coro
      // de figuras moviéndose exactamente al mismo tiempo.
      wrap.style.setProperty('--giro', (Math.random()*8 - 4).toFixed(1) + 'deg');
      wrap.style.setProperty('--retardo', (Math.random()*3).toFixed(2) + 's');
      wrap.innerHTML = `
        <button class="criatura-btn" aria-label="${sp.nombre}">
          <span class="criatura-bob">
            <span class="medallion ${sp.tipo==='planta'?'planta':''} ${state[sp.id].extinto?'extinto':''}" id="med-${sp.id}" data-bioma="${sp.zona}"><span class="medallion-emoji">${sp.emoji}</span></span>
          </span>
          <span class="mini-tag ${state[sp.id].extinto?'extinto-tag':''}" id="tag-${sp.id}">${state[sp.id].extinto ? '🪦 Extinto' : '❤ '+state[sp.id].salud+'%'}</span>
        </button>
      `;
      const btn = wrap.querySelector('.criatura-btn');
      // Clic sobre el animal/planta -> abre su diario (ventana emergente).
      btn.addEventListener('click', ()=> openJournal(sp.id));
      // hovered evita que el animal "camine" mientras el mouse está encima.
      wrap.addEventListener('mouseenter', ()=> hovered[sp.id]=true);
      wrap.addEventListener('mouseleave', ()=> hovered[sp.id]=false);
      wrap.addEventListener('touchstart', ()=> hovered[sp.id]=true, {passive:true});
      habitat.appendChild(wrap);
      startWandering(sp.id, habitat);
    });
  });
  updateVine();
}

/* startWandering: cada pocos segundos cambia left/top en % para que la
   criatura "camine" sola por su hábitat. Se detiene si la especie está
   extinta (clearTimeout en feedSpecies/terminarMinijuego). */
function startWandering(id, habitat){
  clearTimeout(movementTimers[id]);
  const step = ()=>{
    if(state[id].extinto) return;
    if(!hovered[id]){
      const newX = 8 + Math.random()*80;
      const newY = 12 + Math.random()*68;
      facing[id] = newX < state[id].x ? 'left' : 'right';
      state[id].x = newX; state[id].y = newY;
      const el = document.getElementById('crit-'+id);
      if(el){
        el.style.left = newX + '%'; el.style.top = newY + '%';
        el.classList.toggle('facing-left', facing[id]==='left');
      }
    }
    movementTimers[id] = setTimeout(step, 2600 + Math.random()*2200);
  };
  movementTimers[id] = setTimeout(step, 800 + Math.random()*1800);
}

/* updateVine: calcula el promedio de salud de TODAS las especies y lo
   refleja en la barra superior (#vineFill) y en el "blanco y negro" de
   cada zona según su propio promedio. Se llama cada vez que cambia una salud. */
function updateVine(){
  const ids = SPECIES.map(s=>s.id);
  const total = ids.reduce((sum,id)=> sum + state[id].salud, 0);
  const avg = Math.round(total / ids.length);
  document.getElementById('vineFill').style.width = avg + '%';
  document.getElementById('vinePercent').textContent = avg + '%';
  const msgEl = document.getElementById('vineMsg');
  const extintos = ids.filter(id=>state[id].extinto).length;
  if(extintos > 0){ msgEl.textContent = `${extintos} especie(s) se han extinguido. El equilibrio del ecosistema está roto.`; }
  else if(avg === 0){ msgEl.textContent = 'Aún no has cuidado ninguna especie. ¡Juega los minijuegos para subir la salud!'; }
  else if(avg <= 30){ msgEl.textContent = 'El ecosistema apenas comienza a recuperarse gracias a ti.'; }
  else if(avg <= 60){ msgEl.textContent = 'Vas por buen camino. Sigue jugando los minijuegos.'; }
  else if(avg <= 85){ msgEl.textContent = 'El ecosistema está mucho mejor gracias a tu cuidado.'; }
  else { msgEl.textContent = '¡Excelente! Las seis regiones de Colombia están sanas y en equilibrio.'; }

  ZONAS.forEach(z=>{
    const especiesZona = SPECIES.filter(s=>s.zona===z.id);
    if(especiesZona.length===0) return;
    const zTotal = especiesZona.reduce((sum,sp)=> sum + state[sp.id].salud, 0);
    const zAvg = Math.round(zTotal / especiesZona.length);
    const zonaDiv = document.getElementById('zona-'+z.id);
    if(!zonaDiv) return;
    const gray = Math.max(0, 70 - zAvg*0.7);
    zonaDiv.style.filter = `grayscale(${gray}%) brightness(${0.75 + zAvg/300})`;
    const zMsg = document.getElementById('zonaMsg-'+z.id);
    if(zAvg <= 20){ zMsg.textContent = 'Esta región está en crisis ecológica: ¡juega sus minijuegos!'; }
    else if(zAvg <= 55){ zMsg.textContent = 'Esta región necesita más cuidado.'; }
    else { zMsg.textContent = ''; }
  });
}

/* ==== 4. DIARIO DE UNA ESPECIE ==== */
function openJournal(id){
  activeId = id; activeTab = 'datos';
  renderJournal();
  overlay.classList.add('open');
}

function renderJournal(){
  const sp = SPECIES.find(s=>s.id===activeId);
  const s = state[activeId];
  const zona = ZONAS.find(z=>z.id===sp.zona);

  document.getElementById('jEmoji').textContent = sp.emoji;
  document.getElementById('jName').textContent = sp.nombre;
  document.getElementById('jRegion').textContent = zona.icon + ' ' + zona.nombre;
  document.getElementById('jStatus').textContent = (s.extinto ? '🪦 Extinto — ' : '') + sp.estado;

  const fill = document.getElementById('jHealthFill');
  fill.style.width = s.salud + '%';
  fill.style.background = healthColor(s.salud);
  document.getElementById('jHealthNum').textContent = `Salud: ${s.salud}/100`;

  document.getElementById('panelDatos').innerHTML = '<ul>' + sp.datos.map(d=>`<li>${d}</li>`).join('') + '</ul>';

  // Pestaña "Cómo cuidarlo": ya NO hay botones de "cuidar bien/mal".
  // En su lugar hay un botón que abre el minijuego de esta especie.
  const record = leerRecord(activeId);
  document.getElementById('panelCuidado').innerHTML = `
    <p class="feed-hint">${ s.extinto
        ? `💔 ${sp.nombre} está extinto en tu diario. Puedes intentar revivirlo jugando su minijuego las veces que quieras.`
        : `🎮 Para cuidar a ${sp.nombre} juega su minijuego «${sp.minijuego.nombreJuego}»: ${sp.minijuego.comoJugar}` }</p>
    <button class="btn-jugar-minijuego" id="btnJugarMinijuego">
      ${ s.extinto ? `🌱 Intentar revivir a ${sp.nombre}` : `▶ Jugar: ${sp.minijuego.nombreJuego}` }
    </button>
    <p class="minijuego-resumen">${ s.extinto ? 'Si ganas el minijuego, vuelve a la vida. Puedes intentarlo todas las veces que necesites.' : 'Ganar sube su salud; perder la baja.' }</p>
    ${ record ? `<p class="game-record">🏅 Tu mejor marca aquí: ${record.puntaje} puntos · mejor racha x${record.racha}</p>` : '' }
  `;

  document.getElementById('panelRiesgo').innerHTML = `<p>${sp.consecuencia}</p>`;

  const banner = document.getElementById('extinctBanner');
  banner.innerHTML = s.extinto
    ? `<div class="extinct-banner">Esta especie ya se extinguió en tu diario. Efecto en el mundo: ${sp.consecuencia}</div>`
    : '';

  document.querySelectorAll('.tab-panel').forEach(p=> p.classList.toggle('active', p.dataset.panel===activeTab));
  document.querySelectorAll('.tab-btn').forEach(b=> b.classList.toggle('active', b.dataset.tab===activeTab));

  const btnJugar = document.getElementById('btnJugarMinijuego');
  if(btnJugar){ btnJugar.addEventListener('click', ()=> abrirMinijuego(activeId)); }
}

document.querySelectorAll('.tab-btn').forEach(btn=>{ btn.addEventListener('click', ()=>{ activeTab = btn.dataset.tab; renderJournal(); }); });
document.getElementById('closeBtn').addEventListener('click', ()=> overlay.classList.remove('open'));
overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.classList.remove('open'); });

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=> t.classList.remove('show'), 2600);
}

function floatPop(id, text, color){
  const wrap = document.getElementById('crit-'+id);
  if(!wrap) return;
  const pop = document.createElement('span');
  pop.className = 'float-pop'; pop.textContent = text; pop.style.color = color;
  wrap.querySelector('.criatura-btn').appendChild(pop);
  setTimeout(()=> pop.remove(), 1150);
}

/* =============================================================================
   5. MOTOR DE MINIJUEGOS
   =============================================================================
   Hay OCHO mecánicas distintas y todas comparten el mismo esqueleto, para
   que agregar una novena sea siempre el mismo trabajo:

     abrirMinijuego(id)  -> switch: preparar<Tipo>()   (arma el tablero)
     empezarMinijuego()  -> cuenta regresiva 3·2·1
     arrancarMinijuego() -> switch: iniciar<Tipo>()    (arranca la mecánica)
     terminarMinijuego(gano) -> salud + guardarProgreso() hacia PHP/MySQL

   Para que una mecánica nueva quede COMPLETA hay que tocar cuatro sitios:
     1. ETIQUETAS_HUD          (qué dice el marcador y cuál es la meta)
     2. switch de abrirMinijuego   (preparar…)
     3. switch de arrancarMinijuego (iniciar…)
     4. switch de manejarTiempoAgotado (quién gana si se acaba el reloj)
   …y, si su marcador no cuenta "puntos", también actualizarHud().

   Reglas generales del reto:
   - Si se cumple la meta antes de que se acabe el tiempo -> GANA.
   - Si se acaba el tiempo sin llegar a la meta, o si se cometen maxErrores
     errores, -> PIERDE.
   - Al terminar, se actualiza la salud de la especie (arriba si ganó, abajo
     si perdió) y se manda el resultado a save_progress.php para guardarlo
     en la base de datos MySQL del jugador.
   ========================================================================= */
const SALUD_GANA     = 25; // cuánto sube la salud al ganar un minijuego normal
const SALUD_PIERDE   = 15; // cuánto baja la salud al perder un minijuego normal
const SALUD_REVIVIR  = 20; // con cuánta salud "renace" una especie extinta al ganar

let juego = null; // guarda todo el estado del intento de minijuego en curso

const gameOverlay        = document.getElementById('gameOverlay');
const gameTablero        = document.getElementById('gameTablero');
const gameTiempoEl       = document.getElementById('gameTiempo');
const gamePuntosEl       = document.getElementById('gamePuntos');
const gameMetaEl         = document.getElementById('gameMeta');
const gameMetricLabelEl  = document.getElementById('gameMetricLabel');
const gameResultadoEl    = document.getElementById('gameResultado');
const gameEmpezarBtn     = document.getElementById('gameEmpezarBtn');

/* Texto y meta que se muestran en el marcador (HUD) según el tipo de
   minijuego, para que cada uno se explique con sus propias palabras. */
const ETIQUETAS_HUD = {
  atrapa:     (cfg)=> ['⭐ Puntos', cfg.meta],
  memoria:    (cfg)=> ['🃏 Parejas', cfg.pares.length],
  secuencia:  (cfg)=> ['🧭 Ronda meta', cfg.rondaObjetivo],
  reflejo:    (cfg)=> ['⚡ Aciertos', cfg.meta],
  ritmo:      (cfg)=> ['🎯 Aciertos', cfg.intentosNecesarios],
  equilibrio: (cfg)=> ['💧 Nivel mínimo', cfg.rangoSano[0] + '%'],
  clasifica:  (cfg)=> ['🧺 Aciertos', cfg.meta],
  camino:     (cfg)=> ['🐾 Filas cruzadas', cfg.filas],
};

/* =============================================================================
   5.0 — SENSACIÓN DE JUEGO (game feel)
   =============================================================================
   Todo lo de esta sección es transversal: lo usan las ocho mecánicas por
   igual. Son las cosas que hacen que el juego se SIENTA bien aunque las
   reglas sean sencillas: una cuenta regresiva que da aire antes de empezar,
   una racha que premia la concentración, partículas que celebran el acierto,
   ondas que avisan el error sin regañar, una leyenda que enseña antes de
   jugar y un récord personal que invita a volver.
   ========================================================================= */

const DURACION_PARTICULA = 900; // ms; igual que la keyframe hojaCae de herbario.css
const DURACION_ONDA      = 620; // ms; igual que la keyframe ondaAgua de herbario.css
const RACHA_MINIMA_COMBO = 3;   // a partir de aquí se ve el indicador de combo
const PREFIJO_RECORD     = 'alyra_record_'; // clave de localStorage por especie

/* El tablero necesita ser un contenedor posicionado para colgarle encima las
   partículas, la cuenta regresiva y el combo. Si el CSS todavía no le puso
   position, se la ponemos aquí sin pelear con la hoja de estilos. */
function asegurarTableroPosicionado(){
  if(!gameTablero) return;
  if(getComputedStyle(gameTablero).position === 'static'){
    gameTablero.style.position = 'relative';
  }
}

/* crearParticula: una sola hojita que sale volando desde (x,y) — medido en
   píxeles dentro del tablero. Las variables --dx/--dy/--rot son las que
   espera la keyframe hojaCae de herbario.css; se eligen al azar para que
   nunca haya dos aciertos idénticos. */
function crearParticula(x, y, emoji, retraso){
  if(!gameTablero) return;
  const p = document.createElement('span');
  p.className = 'particula';
  p.textContent = emoji;
  p.style.position = 'absolute';
  p.style.left = x + 'px';
  p.style.top  = y + 'px';
  p.style.pointerEvents = 'none';
  p.style.setProperty('--dx',  Math.round(Math.random()*140 - 70) + 'px');
  p.style.setProperty('--dy',  Math.round(-45 - Math.random()*80) + 'px');
  p.style.setProperty('--rot', Math.round(Math.random()*560 - 280) + 'deg');
  p.style.animation = `hojaCae ${DURACION_PARTICULA}ms ease-out ${retraso}ms forwards`;
  gameTablero.appendChild(p);
  const t = setTimeout(()=>{ if(p.isConnected) p.remove(); }, DURACION_PARTICULA + retraso + 80);
  if(juego && juego.timers) juego.timers.push(t);
}

/* soltarParticulas: la celebración de un acierto. Nace justo encima del
   elemento que el jugador tocó, para que el premio se sienta "suyo". */
function soltarParticulas(elemento, cantidad, emoji){
  if(!elemento || !gameTablero) return;
  asegurarTableroPosicionado();
  const base = gameTablero.getBoundingClientRect();
  const caja = elemento.getBoundingClientRect();
  const cx = caja.left - base.left + caja.width/2;
  const cy = caja.top  - base.top  + caja.height/2;
  for(let i=0;i<cantidad;i++){ crearParticula(cx, cy, emoji, i*35); }
}

/* soltarOnda: la respuesta a un error. Una onda de agua que se expande, sin
   rojo agresivo ni sonido de castigo: el error aquí enseña, no regaña. */
function soltarOnda(elemento){
  if(!elemento || !gameTablero) return;
  asegurarTableroPosicionado();
  const base = gameTablero.getBoundingClientRect();
  const caja = elemento.getBoundingClientRect();
  const o = document.createElement('span');
  o.className = 'onda';
  o.style.position = 'absolute';
  o.style.left = (caja.left - base.left + caja.width/2) + 'px';
  o.style.top  = (caja.top  - base.top  + caja.height/2) + 'px';
  o.style.pointerEvents = 'none';
  o.style.animation = `ondaAgua ${DURACION_ONDA}ms ease-out forwards`;
  gameTablero.appendChild(o);
  const t = setTimeout(()=>{ if(o.isConnected) o.remove(); }, DURACION_ONDA + 80);
  if(juego && juego.timers) juego.timers.push(t);
}

/* lluviaDeParticulas: el cierre de una victoria. En vez de nacer en un punto,
   caen por TODO el tablero, escalonadas, como celebración. */
function lluviaDeParticulas(cantidad, emoji){
  if(!gameTablero) return;
  asegurarTableroPosicionado();
  const base = gameTablero.getBoundingClientRect();
  for(let i=0;i<cantidad;i++){
    crearParticula(Math.random()*base.width, Math.random()*base.height*0.7, emoji, i*55);
  }
}

/* limpiarEfectos: borra partículas y ondas que hayan quedado a medio camino
   (por ejemplo si el jugador cierra la ventana en mitad de la partida). */
function limpiarEfectos(){
  if(!gameTablero) return;
  gameTablero.querySelectorAll('.particula, .onda, .cuenta-regresiva').forEach(e=> e.remove());
}

/* ---- Racha / combo ----
   FÓRMULA DEL MULTIPLICADOR (documentada aquí a propósito, es material
   didáctico): el puntaje de un acierto es valorBase × multiplicador, donde
       racha 0, 1, 2  -> ×1    (sin bonificación)
       racha 3, 4     -> ×1.5  (+50%)
       racha 5 o más  -> ×2    (+100%)
   La racha sube con cada acierto consecutivo y vuelve a 0 con cada error.
   Así, concentrarse y no equivocarse vale más que ir rápido a lo loco. */
function multiplicadorRacha(){
  if(!juego) return 1;
  if(juego.racha >= 5) return 2;
  if(juego.racha >= RACHA_MINIMA_COMBO) return 1.5;
  return 1;
}

function refrescarCombo(){
  const badge = document.getElementById('comboBadge');
  if(!badge || !juego) return;
  if(juego.racha >= RACHA_MINIMA_COMBO){
    badge.textContent = `x${juego.racha} seguidas`;
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
}

/* sumarAcierto: punto único por donde pasan TODOS los aciertos de las ocho
   mecánicas. Sube la racha, aplica el multiplicador y devuelve los puntos
   ganados (los minijuegos que marcan "puntos" en el HUD usan ese valor). */
function sumarAcierto(valorBase){
  if(!juego) return 0;
  juego.racha += 1;
  if(juego.racha > juego.mejorRacha){ juego.mejorRacha = juego.racha; }
  const ganados = Math.round(valorBase * multiplicadorRacha());
  juego.puntaje += ganados;
  refrescarCombo();
  return ganados;
}

/* registrarError: punto único por donde pasan todos los errores. */
function registrarError(){
  if(!juego) return;
  juego.errores += 1;
  romperRacha();
}

/* romperRacha: corta la racha sin contar un error (lo usa "equilibrio",
   donde descuidarse no es un error sino dejar bajar el agua). */
function romperRacha(){
  if(!juego) return;
  juego.racha = 0;
  refrescarCombo();
}

/* ---- Mejor récord por especie (localStorage del navegador) ----
   Es un récord personal, local: no reemplaza a la base de datos (eso sigue
   siendo la salud en MySQL), sino que le da al jugador una marca propia que
   superar en cada minijuego. */
function leerRecord(id){
  try{
    const crudo = localStorage.getItem(PREFIJO_RECORD + id);
    if(!crudo) return null;
    const r = JSON.parse(crudo);
    return { puntaje: Number(r.puntaje) || 0, racha: Number(r.racha) || 0 };
  }catch(err){
    return null; // localStorage puede estar bloqueado; el juego sigue igual
  }
}
function guardarRecordSiMejora(id, puntaje, racha){
  const previo = leerRecord(id) || { puntaje:0, racha:0 };
  const mejoro = puntaje > previo.puntaje || racha > previo.racha;
  if(mejoro){
    try{
      localStorage.setItem(PREFIJO_RECORD + id, JSON.stringify({
        puntaje: Math.max(previo.puntaje, puntaje),
        racha:   Math.max(previo.racha, racha)
      }));
    }catch(err){ /* sin localStorage simplemente no se guarda la marca */ }
  }
  return mejoro;
}

/* ---- Leyenda previa ----
   Antes de tocar "Empezar", el jugador ve qué le hace bien y qué le hace mal
   a esta especie. Es la parte que de verdad enseña: el minijuego después
   solo evalúa si lo recordó. Desaparece al arrancar. */
function montarLeyenda(sp){
  const fila = (a, clase)=>
    `<div class="leyenda-item ${clase}"><span class="leyenda-emoji">${a.emoji}</span><span class="leyenda-texto">${a.nombre}</span></div>`;
  const cont = document.createElement('div');
  // "escalona" (utilidad de herbario.css) hace entrar los ítems uno a uno.
  cont.className = 'leyenda-items escalona';
  cont.id = 'leyendaItems';
  cont.innerHTML =
    sp.alimentos.filter(a=>a.bueno).map(a=> fila(a,'bueno')).join('') +
    sp.alimentos.filter(a=>!a.bueno).map(a=> fila(a,'malo')).join('');
  // Va ENCIMA del tablero que ya armó preparar<Tipo>().
  gameTablero.insertBefore(cont, gameTablero.firstChild);
}
function quitarLeyenda(){
  const l = document.getElementById('leyendaItems');
  if(l) l.remove();
}

/* ---- Cuenta regresiva 3 · 2 · 1 ----
   Da un respiro entre "le di a Empezar" y "ya estoy perdiendo": sin ella,
   los minijuegos rápidos castigan al jugador antes de que mire el tablero.
   Todos sus temporizadores van a juego.timers para que detenerMinijuego()
   los apague si se cierra la ventana en plena cuenta. */
function cuentaRegresiva(alTerminar){
  asegurarTableroPosicionado();
  const cuenta = document.createElement('div');
  cuenta.className = 'cuenta-regresiva';
  cuenta.innerHTML = '<span>3</span>';
  gameTablero.appendChild(cuenta);
  const numero = cuenta.querySelector('span');
  const pasos = ['3','2','1','¡Ya!'];
  let i = 0;

  const paso = ()=>{
    if(!juego || !juego.contando){ if(cuenta.isConnected) cuenta.remove(); return; }
    if(i >= pasos.length){
      cuenta.remove();
      alTerminar();
      return;
    }
    numero.textContent = pasos[i];
    // Reinicia la animación del CSS en cada número (si no, solo late el "3").
    numero.style.animation = 'none';
    void numero.offsetWidth; // forzar reflow
    numero.style.animation = '';
    i++;
    const t = setTimeout(paso, i >= pasos.length ? 420 : 700);
    juego.timers.push(t);
  };
  paso();
}

/* =============================================================================
   5.1 — Apertura, arranque y cierre de una partida
   ========================================================================= */

/* abrirMinijuego: prepara la ventana del minijuego para la especie "id".
   Funciona igual si la especie está viva (sube/baja salud) o si está
   extinta (modo "revivir"): en ambos casos se puede jugar todas las veces
   que el jugador quiera, sin límite de intentos. */
function abrirMinijuego(id){
  detenerMinijuego(); // por si quedaba una partida anterior corriendo
  const sp = SPECIES.find(s=>s.id===id);
  const cfg = sp.minijuego;
  const s = state[id];
  const reviviendo = s.extinto;
  const record = leerRecord(id);

  document.getElementById('overlay').classList.remove('open'); // cierra el diario
  document.getElementById('gameTitulo').textContent = `${sp.emoji} ${cfg.nombreJuego}`;
  document.getElementById('gameInstrucciones').innerHTML =
    `<b>Cómo se juega:</b> ${cfg.comoJugar}<br><b>Cómo se gana:</b> ${cfg.comoGanar}` +
    (record ? `<br><span class="game-record">🏅 Tu mejor marca aquí: ${record.puntaje} puntos · mejor racha x${record.racha}</span>` : '') +
    (reviviendo ? `<br><b>🌱 Modo revivir:</b> ${sp.nombre} está extinto en tu diario. Si ganas este intento, vuelve a la vida con ${SALUD_REVIVIR}% de salud. Puedes intentarlo las veces que quieras.` : '');

  const [etiqueta, meta] = ETIQUETAS_HUD[cfg.tipo](cfg);
  gameMetricLabelEl.textContent = etiqueta + ':';
  gameMetaEl.textContent = meta;
  gamePuntosEl.textContent = '0';
  gameTiempoEl.textContent = cfg.tiempo || '—';
  gameResultadoEl.innerHTML = '';
  gameResultadoEl.className = 'game-resultado';
  gameEmpezarBtn.classList.remove('oculto');
  gameEmpezarBtn.textContent = '▶ Empezar';

  // Estado limpio para este intento (se reinicia cada vez que se abre).
  juego = {
    especieId:id, tipo:cfg.tipo, puntos:0, errores:0, tiempo:cfg.tiempo || 0,
    activo:false, contando:false, inicio:0,
    timers:[], rafId:null,
    racha:0, mejorRacha:0, puntaje:0,            // racha/combo y puntaje del récord
    primeraCarta:null, pares:0,                   // usados por el minijuego de memoria
    ronda:cfg.rondaInicial || 0, secuenciaActual:[], posicion:0, // usados por "secuencia"
    intentos:0, aciertosRitmo:0,                  // usados por "ritmo"
    nivel:cfg.nivelInicial || 0,                  // usado por "equilibrio"
    piezaActual:null, ultimaPieza:'',              // usados por "clasifica"
    filaActual:0, seguras:[], caminoMeta:'', pistaActiva:false // usados por "camino"
  };

  switch(cfg.tipo){
    case 'atrapa':     prepararAtrapa(sp,cfg); break;
    case 'memoria':    prepararMemoria(sp,cfg); break;
    case 'secuencia':  prepararSecuencia(cfg); break;
    case 'reflejo':    prepararReflejo(); break;
    case 'ritmo':      prepararRitmo(cfg); break;
    case 'equilibrio': prepararEquilibrio(cfg); break;
    case 'clasifica':  prepararClasifica(sp,cfg); break;
    case 'camino':     prepararCamino(sp,cfg); break;
  }

  // El tablero ya está armado: ahora se le cuelgan encima la leyenda (que
  // enseña antes de jugar) y el indicador de combo (que se verá al jugar).
  asegurarTableroPosicionado();
  montarLeyenda(sp);
  montarComboBadge();

  gameOverlay.classList.add('open');
}

/* montarComboBadge: el indicador de racha vive dentro del tablero, así se
   reconstruye solo cada vez que se arma un minijuego nuevo. */
function montarComboBadge(){
  const badge = document.createElement('div');
  badge.className = 'combo-badge';
  badge.id = 'comboBadge';
  badge.textContent = '';
  gameTablero.appendChild(badge);
}

document.getElementById('gameCloseBtn').addEventListener('click', ()=>{
  detenerMinijuego();
  gameOverlay.classList.remove('open');
});

/* El mismo botón sirve para "▶ Empezar" (primer intento) y para
   "↺ Jugar de nuevo" / "↺ Intentar revivir de nuevo" (reintentos). Si ya
   hay un resultado en pantalla, reconstruye el minijuego desde cero en vez
   de seguir usando un tablero que quedó a medio terminar. */
gameEmpezarBtn.addEventListener('click', ()=>{
  if(juego && gameResultadoEl.textContent){
    abrirMinijuego(juego.especieId);
  } else {
    empezarMinijuego();
  }
});

/* empezarMinijuego: quita la leyenda, corre la cuenta regresiva y recién
   entonces arranca de verdad. Durante la cuenta, juego.activo sigue en
   false, así que ningún clic cuenta todavía. */
function empezarMinijuego(){
  if(!juego || juego.activo || juego.contando) return;
  juego.contando = true;
  gameEmpezarBtn.classList.add('oculto');
  quitarLeyenda();
  cuentaRegresiva(arrancarMinijuego);
}

/* arrancarMinijuego: arranca el cronómetro general (si el minijuego lo usa)
   y llama a la función "iniciar…" específica del tipo de juego. */
function arrancarMinijuego(){
  if(!juego || juego.activo) return;
  juego.contando = false;
  juego.activo = true;
  juego.inicio = performance.now(); // referencia para la dificultad progresiva

  const sp = SPECIES.find(s=>s.id===juego.especieId);
  const cfg = sp.minijuego;

  if(cfg.tiempo){
    const tickId = setInterval(()=>{
      juego.tiempo -= 1;
      gameTiempoEl.textContent = juego.tiempo;
      animarCifra(gameTiempoEl);
      if(juego.tiempo <= 0){ manejarTiempoAgotado(cfg); }
    }, 1000);
    juego.timers.push(tickId);
  }

  switch(cfg.tipo){
    case 'atrapa':     iniciarAtrapa(sp,cfg); break;
    case 'memoria':    /* el tablero ya quedó armado en prepararMemoria */ break;
    case 'secuencia':  nuevaRondaSecuencia(cfg); break;
    case 'reflejo':    iniciarReflejo(sp,cfg); break;
    case 'ritmo':      iniciarRitmo(cfg); break;
    case 'equilibrio': iniciarEquilibrio(cfg); break;
    case 'clasifica':  iniciarClasifica(sp,cfg); break;
    case 'camino':     iniciarCamino(cfg); break;
  }
}

/* Qué pasa cuando el cronómetro llega a 0, según el tipo de juego: cada
   uno decide "gano" comparando su propio progreso contra su propia meta. */
function manejarTiempoAgotado(cfg){
  switch(cfg.tipo){
    case 'atrapa':     terminarMinijuego(juego.puntos >= cfg.meta); break;
    case 'memoria':    terminarMinijuego(juego.pares >= cfg.pares.length); break;
    case 'reflejo':    terminarMinijuego(juego.puntos >= cfg.meta); break;
    case 'ritmo':      terminarMinijuego(juego.aciertosRitmo >= cfg.intentosNecesarios); break;
    case 'equilibrio': terminarMinijuego(juego.nivel >= cfg.rangoSano[0]); break;
    case 'clasifica':  terminarMinijuego(juego.puntos >= cfg.meta); break;
    case 'camino':     terminarMinijuego(juego.filaActual >= cfg.filas); break;
    default:           terminarMinijuego(false);
  }
}

/* detenerMinijuego: apaga TODOS los temporizadores/animaciones que pueda
   haber dejado corriendo cualquiera de los 8 tipos de minijuego, más los de
   la capa de game feel (cuenta regresiva, partículas, ondas). Si algo que
   agregues crea un setTimeout/setInterval/rAF, mételo en juego.timers o en
   juego.rafId: si no, el juego se buguea al cerrar y volver a abrir. */
function detenerMinijuego(){
  if(!juego) return;
  juego.activo = false;
  juego.contando = false;
  juego.pistaActiva = false;
  (juego.timers || []).forEach(t=>{ clearInterval(t); clearTimeout(t); });
  juego.timers = [];
  if(juego.rafId){ cancelAnimationFrame(juego.rafId); juego.rafId = null; }
  limpiarEfectos();
}

/* animarCifra: reinicia la clase "cambia" sobre un número del marcador para
   que el CSS pueda hacerlo saltar cada vez que cambia (el void offsetWidth
   fuerza un reflow; sin él, el navegador no vuelve a disparar la animación). */
function animarCifra(el){
  if(!el) return;
  el.classList.remove('cambia');
  void el.offsetWidth;
  el.classList.add('cambia');
}

/* actualizarHud: refresca el número grande del marcador según el tipo de
   minijuego activo (puntos, parejas, ronda, aciertos o filas cruzadas). */
function actualizarHud(){
  let valor;
  switch(juego.tipo){
    case 'memoria':   valor = juego.pares; break;
    case 'ritmo':     valor = juego.aciertosRitmo; break;
    case 'secuencia': valor = juego.ronda; break;
    case 'camino':    valor = juego.filaActual; break;
    default:          valor = juego.puntos; // atrapa, reflejo, clasifica, equilibrio
  }
  if(gamePuntosEl.textContent !== String(valor)){ animarCifra(gamePuntosEl); }
  gamePuntosEl.textContent = valor;
}

/* emojiPremio: con qué se celebra el acierto de esta especie. Las plantas
   sueltan hojas; los animales, destellos. Detalle pequeño, pero hace que
   cada región se sienta distinta. */
function emojiPremio(sp){ return sp.tipo === 'planta' ? '🌿' : '✨'; }

/* elegirAmenaza: saca al azar una de las cosas que REALMENTE amenazan a esta
   especie, para poder explicar un error con un dato verdadero y no con un
   "fallaste" vacío. */
function elegirAmenaza(sp){
  const malos = sp.alimentos.filter(a=> !a.bueno);
  return malos[Math.floor(Math.random()*malos.length)];
}

/* =============================================================================
   5.A — Minijuego "atrapa": Cóndor, Delfín, Guacamayo, Manatí
   El animal "vive" en 3 carriles; la comida cae dentro de un carril y hay
   que tocarla mientras cae. Tocar algo bueno suma puntos; tocar algo malo
   resta puntos y cuenta como error.
   Dificultad progresiva: el intervalo de aparición y la velocidad de caída
   se van reduciendo con los segundos, hasta sus mínimos de configuración.
   ========================================================================= */
function prepararAtrapa(sp, cfg){
  gameTablero.innerHTML = `<div class="carril-pista" id="carrilPista"></div>`;
  const pista = document.getElementById('carrilPista');
  for(let i=0;i<cfg.carriles;i++){
    const carril = document.createElement('div');
    carril.className = 'carril';
    pista.appendChild(carril);
  }
}
function iniciarAtrapa(sp, cfg){
  // Segundos transcurridos desde el arranque real (después de la cuenta).
  const transcurrido = ()=> (performance.now() - juego.inicio)/1000;

  const spawn = ()=>{
    if(!juego || !juego.activo) return;
    const carriles = document.querySelectorAll('#carrilPista .carril');
    if(!carriles.length) return;
    const carril = carriles[Math.floor(Math.random()*carriles.length)];
    const alimento = sp.alimentos[Math.floor(Math.random()*sp.alimentos.length)];
    const caida = Math.max(cfg.velocidadCaidaMinima,
                           Math.round(cfg.velocidadCaida - transcurrido()*cfg.aceleracionCaida));

    const item = document.createElement('button');
    item.className = 'game-item carril-item';
    item.textContent = alimento.emoji;
    item.title = alimento.nombre;
    item.style.top = '-10%';
    carril.appendChild(item);
    // Pequeño respiro para que el navegador registre la posición inicial
    // antes de animar hacia abajo (si no, la transición no se ve).
    requestAnimationFrame(()=>{
      item.style.transition = `top ${caida}ms linear`;
      item.style.top = '100%';
    });
    item.addEventListener('click', ()=> resolverAtrapa(item, alimento, cfg, sp));

    const quitar = setTimeout(()=>{ if(item.isConnected) item.remove(); }, caida + 80);
    juego.timers.push(quitar);
  };

  // En vez de un setInterval fijo, un setTimeout que se vuelve a programar
  // con un intervalo cada vez más corto: así sube la tensión poco a poco.
  const programar = ()=>{
    if(!juego || !juego.activo) return;
    const intervalo = Math.max(cfg.intervaloMinimo,
                               Math.round(cfg.intervaloAparicion - transcurrido()*cfg.aceleracion));
    const t = setTimeout(()=>{ spawn(); programar(); }, intervalo);
    juego.timers.push(t);
  };

  spawn();
  programar();
}
function resolverAtrapa(item, alimento, cfg, sp){
  if(!juego || !juego.activo) return;
  item.disabled = true;
  item.style.transition = '';
  if(alimento.bueno){
    // Los puntos del acierto pasan por la racha: 10 base × multiplicador.
    juego.puntos += sumarAcierto(10);
    item.classList.add('acierto');
    soltarParticulas(item, 6, emojiPremio(sp));
  } else {
    juego.puntos = Math.max(0, juego.puntos - 8);
    registrarError();
    item.classList.add('error');
    soltarOnda(item);
    showToast(`⚠️ ${alimento.nombre}: ${alimento.efecto}`);
  }
  actualizarHud();
  const quitar = setTimeout(()=>{ if(item.isConnected) item.remove(); }, 150);
  juego.timers.push(quitar);
  if(juego.puntos >= cfg.meta){ terminarMinijuego(true); }
  else if(juego.errores >= cfg.maxErrores){ terminarMinijuego(false); }
}

/* =============================================================================
   5.B — Minijuego "memoria": Nutria gigante, Coral
   Cartas boca abajo: unas forman parejas de alimento sano, otras son
   "trampas" sueltas (contaminación) que nunca hacen pareja: si se voltean,
   cuentan como error.
   ========================================================================= */
function prepararMemoria(sp, cfg){
  const cartas = [];
  cfg.pares.forEach(p=>{ cartas.push({...p, tipo:'par'}); cartas.push({...p, tipo:'par'}); });
  cfg.trampas.forEach(t=>{ cartas.push({...t, tipo:'trampa'}); });
  // Baraja las cartas (algoritmo de Fisher-Yates).
  for(let i=cartas.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [cartas[i], cartas[j]] = [cartas[j], cartas[i]];
  }

  gameTablero.innerHTML = `<div class="memoria-grid escalona" id="memoriaGrid"></div>`;
  const grid = document.getElementById('memoriaGrid');
  cartas.forEach(datos=>{
    const carta = document.createElement('button');
    carta.className = 'memoria-carta';
    carta.dataset.nombre = datos.nombre;
    carta.textContent = '❓';
    carta.addEventListener('click', ()=> voltearCarta(carta, datos, cfg, sp));
    grid.appendChild(carta);
  });
}
function voltearCarta(carta, datos, cfg, sp){
  if(!juego || !juego.activo || carta.disabled || carta.classList.contains('volteada')) return;

  carta.textContent = datos.emoji;
  carta.classList.add('volteada');

  if(datos.tipo === 'trampa'){
    carta.classList.add('error');
    carta.disabled = true;
    registrarError();
    soltarOnda(carta);
    actualizarHud();
    if(juego.errores >= cfg.maxErrores){ terminarMinijuego(false); return; }
    const t = setTimeout(()=>{ carta.textContent='❓'; carta.classList.remove('volteada','error'); carta.disabled=false; }, 700);
    juego.timers.push(t);
    return;
  }

  if(!juego.primeraCarta){ juego.primeraCarta = carta; return; }

  const primera = juego.primeraCarta;
  juego.primeraCarta = null;
  if(primera !== carta && primera.dataset.nombre === carta.dataset.nombre){
    primera.classList.add('acierto'); carta.classList.add('acierto');
    primera.disabled = true; carta.disabled = true;
    juego.pares += 1;
    sumarAcierto(20); // la pareja encontrada alimenta la racha y el récord
    soltarParticulas(carta, 7, emojiPremio(sp));
    actualizarHud();
    if(juego.pares >= cfg.pares.length){ terminarMinijuego(true); }
  } else {
    romperRacha(); // fallar la pareja no es "error", pero sí corta la racha
    const t = setTimeout(()=>{
      [primera, carta].forEach(c=>{ c.textContent='❓'; c.classList.remove('volteada'); });
    }, 700);
    juego.timers.push(t);
  }
}

/* =============================================================================
   5.C — Minijuego "secuencia" (tipo "Simon dice"): Danta, Tortuga marina
   Se muestra un camino de flechas que crece cada ronda; el jugador debe
   repetirlo tocando el mismo orden para "guiar" al animal por un camino
   seguro.
   ========================================================================= */
function prepararSecuencia(cfg){
  gameTablero.innerHTML = `
    <p class="secuencia-mostrar" id="secuenciaMostrar">Prepárate…</p>
    <div class="secuencia-pad" id="secuenciaPad">
      ${cfg.direcciones.map(d=>`<button class="secuencia-flecha" data-dir="${d}" disabled>${d}</button>`).join('')}
    </div>
  `;
  document.querySelectorAll('.secuencia-flecha').forEach(btn=>{
    btn.addEventListener('click', ()=> clicSecuencia(btn.dataset.dir, cfg));
  });
}
function nuevaRondaSecuencia(cfg){
  if(!juego || !juego.activo) return;
  juego.secuenciaActual = Array.from({length: juego.ronda}, ()=> cfg.direcciones[Math.floor(Math.random()*cfg.direcciones.length)]);
  juego.posicion = 0;
  actualizarHud();
  mostrarSecuencia(cfg);
}
function mostrarSecuencia(cfg){
  const mostrarEl = document.getElementById('secuenciaMostrar');
  document.querySelectorAll('.secuencia-flecha').forEach(b=> b.disabled = true);
  mostrarEl.textContent = 'Memoriza el camino…';
  let i = 0;
  const mostrarPaso = ()=>{
    if(!juego || !juego.activo) return;
    if(i >= juego.secuenciaActual.length){
      mostrarEl.textContent = '¡Ahora repite tú el camino!';
      document.querySelectorAll('.secuencia-flecha').forEach(b=> b.disabled = false);
      return;
    }
    mostrarEl.textContent = juego.secuenciaActual[i];
    const t1 = setTimeout(()=>{
      mostrarEl.textContent = '·';
      const t2 = setTimeout(()=>{ i++; mostrarPaso(); }, 220);
      juego.timers.push(t2);
    }, cfg.tiempoPorPaso - 220);
    juego.timers.push(t1);
  };
  mostrarPaso();
}
function clicSecuencia(dir, cfg){
  if(!juego || !juego.activo) return;
  const esperado = juego.secuenciaActual[juego.posicion];
  const pad = document.getElementById('secuenciaPad');
  if(dir === esperado){
    juego.posicion += 1;
    if(juego.posicion >= juego.secuenciaActual.length){
      sumarAcierto(15); // ronda completa: suma racha y puntaje del récord
      if(pad) soltarParticulas(pad, 8, '🌱');
      if(juego.ronda >= cfg.rondaObjetivo){ terminarMinijuego(true); return; }
      juego.ronda += 1;
      actualizarHud();
      const t = setTimeout(()=> nuevaRondaSecuencia(cfg), 500);
      juego.timers.push(t);
    }
  } else {
    registrarError();
    if(pad) soltarOnda(pad);
    if(juego.errores >= cfg.maxErrores){ terminarMinijuego(false); return; }
    document.getElementById('secuenciaMostrar').textContent = '¡Ups! Intenta de nuevo desde el inicio de la ronda.';
    const t = setTimeout(()=> nuevaRondaSecuencia(cfg), 700);
    juego.timers.push(t);
  }
}

/* =============================================================================
   5.D — Minijuego "reflejo": Gallito de roca, Rana dorada, Piquero de Malpelo
   Los alimentos aparecen un instante en una posición al azar dentro de una
   caja; hay que tocarlos rápido antes de que desaparezcan solos.
   Dificultad progresiva: cada aparición dura un poco menos que la anterior,
   hasta el mínimo configurado en la especie.
   ========================================================================= */
function prepararReflejo(){
  gameTablero.innerHTML = `<div class="reflejo-caja" id="reflejoCaja"></div>`;
}
function iniciarReflejo(sp, cfg){
  // Cuánto dura en pantalla una aparición AHORA mismo (baja con el tiempo).
  const duracionActual = ()=>{
    const transcurrido = (performance.now() - juego.inicio)/1000;
    return Math.max(cfg.duracionMinima, Math.round(cfg.duracionAparicion - transcurrido*cfg.aceleracion));
  };

  const spawn = ()=>{
    if(!juego || !juego.activo) return;
    const caja = document.getElementById('reflejoCaja');
    if(!caja) return;
    const alimento = sp.alimentos[Math.floor(Math.random()*sp.alimentos.length)];
    const item = document.createElement('button');
    item.className = 'game-item reflejo-item';
    item.textContent = alimento.emoji;
    item.title = alimento.nombre;
    item.style.left = (8 + Math.random()*76) + '%';
    item.style.top  = (8 + Math.random()*72) + '%';
    caja.appendChild(item);
    item.addEventListener('click', ()=> resolverReflejo(item, alimento, cfg, sp));
    const t = setTimeout(()=>{ if(item.isConnected) item.remove(); }, duracionActual());
    juego.timers.push(t);
  };

  const programar = ()=>{
    if(!juego || !juego.activo) return;
    const t = setTimeout(()=>{ spawn(); programar(); }, Math.round(duracionActual()*cfg.factorIntervalo));
    juego.timers.push(t);
  };

  spawn();
  programar();
}
function resolverReflejo(item, alimento, cfg, sp){
  if(!juego || !juego.activo) return;
  item.disabled = true;
  if(alimento.bueno){
    juego.puntos += 1;       // el marcador cuenta aciertos, no puntos
    sumarAcierto(8);         // el récord sí usa el puntaje con multiplicador
    item.classList.add('acierto');
    soltarParticulas(item, 5, emojiPremio(sp));
  } else {
    registrarError();
    item.classList.add('error');
    soltarOnda(item);
    showToast(`⚠️ ${alimento.nombre}: ${alimento.efecto}`);
  }
  actualizarHud();
  const quitar = setTimeout(()=>{ if(item.isConnected) item.remove(); }, 120);
  juego.timers.push(quitar);
  if(juego.puntos >= cfg.meta){ terminarMinijuego(true); }
  else if(juego.errores >= cfg.maxErrores){ terminarMinijuego(false); }
}

/* =============================================================================
   5.E — Minijuego "ritmo" (precisión de tiempo): Oso, Jaguar, Ballena
   Una marca se mueve de lado a lado sobre una barra; hay una "zona segura"
   pintada. Tocar el botón justo cuando la marca está dentro de la zona
   cuenta como acierto.
   ========================================================================= */
function prepararRitmo(cfg){
  gameTablero.innerHTML = `
    <div class="ritmo-barra" id="ritmoBarra">
      <div class="ritmo-zona" style="left:${cfg.zonaBuena[0]}%; width:${cfg.zonaBuena[1]-cfg.zonaBuena[0]}%;"></div>
      <div class="ritmo-marcador" id="ritmoMarcador"></div>
    </div>
    <button class="game-btn-empezar" id="ritmoBtn">¡Ahora!</button>
  `;
}
function iniciarRitmo(cfg){
  const marcador = document.getElementById('ritmoMarcador');
  const inicio = performance.now();
  const frame = (ahora)=>{
    if(!juego || !juego.activo) return;
    const t = (ahora - inicio) % cfg.velocidad;
    const progreso = t / cfg.velocidad; // 0..1
    const pos = progreso < 0.5 ? progreso*2*100 : (1-progreso)*2*100; // vaivén 0->100->0
    marcador.style.left = pos + '%';
    juego.rafId = requestAnimationFrame(frame);
  };
  juego.rafId = requestAnimationFrame(frame);
  document.getElementById('ritmoBtn').addEventListener('click', ()=> intentarRitmo(cfg));
}
function intentarRitmo(cfg){
  if(!juego || !juego.activo) return;
  const marcador = document.getElementById('ritmoMarcador');
  const pos = parseFloat(marcador.style.left) || 0;
  juego.intentos += 1;
  if(pos >= cfg.zonaBuena[0] && pos <= cfg.zonaBuena[1]){
    juego.aciertosRitmo += 1;
    sumarAcierto(12);
    marcador.classList.add('acierto');
    soltarParticulas(marcador, 6, '✨');
    juego.timers.push(setTimeout(()=> marcador.classList.remove('acierto'), 200));
  } else {
    registrarError();
    marcador.classList.add('error');
    soltarOnda(marcador);
    juego.timers.push(setTimeout(()=> marcador.classList.remove('error'), 200));
  }
  actualizarHud();
  if(juego.aciertosRitmo >= cfg.intentosNecesarios){ terminarMinijuego(true); }
  else if(juego.intentos >= cfg.intentosMax){ terminarMinijuego(false); }
}

/* =============================================================================
   5.F — Minijuego "equilibrio": Frailejón, Palma de moriche
   Un nivel de agua baja solo con el paso del tiempo; hay que tocar el
   botón seguido para mantenerlo arriba del mínimo saludable.
   ========================================================================= */
function prepararEquilibrio(cfg){
  gameTablero.innerHTML = `
    <div class="equilibrio-gauge"><div class="equilibrio-nivel" id="equilibrioNivel" style="height:${cfg.nivelInicial}%;"></div></div>
    <button class="equilibrio-btn" id="equilibrioBtn">${cfg.etiquetaBoton || '💧 Atrapar niebla'}</button>
    <p class="minijuego-resumen">Nivel de agua: <b id="equilibrioTexto">${cfg.nivelInicial}%</b> (mínimo para ganar: ${cfg.rangoSano[0]}%)</p>
  `;
}
function iniciarEquilibrio(cfg){
  const boton = document.getElementById('equilibrioBtn');
  boton.addEventListener('click', ()=>{
    if(!juego || !juego.activo) return;
    juego.nivel = Math.min(100, juego.nivel + cfg.incrementoPorClic);
    sumarAcierto(2); // cada gota mantiene viva la racha
    soltarParticulas(boton, 3, '💧');
    actualizarGaugeEquilibrio(cfg);
  });
  const descensoId = setInterval(()=>{
    if(!juego || !juego.activo) return;
    juego.nivel = Math.max(0, juego.nivel - cfg.descensoPorSegundo);
    // Dejar que el agua baje del mínimo sano no es un "error" contable,
    // pero sí corta la racha: descuidarse tiene su costo.
    if(juego.nivel < cfg.rangoSano[0]){ romperRacha(); }
    actualizarGaugeEquilibrio(cfg);
    if(juego.nivel <= 0){ terminarMinijuego(false); }
  }, 1000);
  juego.timers.push(descensoId);
}
function actualizarGaugeEquilibrio(cfg){
  const nivelEl = document.getElementById('equilibrioNivel');
  const textoEl = document.getElementById('equilibrioTexto');
  if(nivelEl){
    nivelEl.style.height = juego.nivel + '%';
    nivelEl.classList.toggle('en-riesgo', juego.nivel < cfg.rangoSano[0]);
  }
  if(textoEl) textoEl.textContent = juego.nivel + '%';
  juego.puntos = juego.nivel;
  if(gamePuntosEl.textContent !== String(juego.nivel)){ animarCifra(gamePuntosEl); }
  gamePuntosEl.textContent = juego.nivel;
}

/* =============================================================================
   5.G — Minijuego "clasifica" (MECÁNICA NUEVA): Chigüiro
   Aparece UNA cosa a la vez y el jugador decide a qué cesta pertenece:
   "Lo cuida" (bueno:true) o "Lo amenaza" (bueno:false). Al acertar se
   muestra el "efecto" real del alimento: esa explicación ES el premio, el
   valor educativo del minijuego.
   Config: { tipo:'clasifica', nombreJuego, comoJugar, comoGanar,
             tiempo, meta, maxErrores }
   ========================================================================= */
function prepararClasifica(sp, cfg){
  gameTablero.innerHTML = `
    <div class="clasifica-wrap">
      <p class="clasifica-pregunta">¿Esto lo cuida o lo amenaza?</p>
      <div class="clasifica-pieza-zona">
        <button class="clasifica-pieza" id="clasificaPieza">
          <span class="clasifica-emoji">❔</span>
          <span class="clasifica-nombre">Prepárate…</span>
        </button>
      </div>
      <div class="clasifica-cestas escalona">
        <button class="clasifica-cesta cesta-buena" data-cesta="bueno"><span class="cesta-icono">🌿</span><span class="cesta-texto">Lo cuida</span></button>
        <button class="clasifica-cesta cesta-mala" data-cesta="malo"><span class="cesta-icono">⚠️</span><span class="cesta-texto">Lo amenaza</span></button>
      </div>
      <p class="clasifica-feedback" id="clasificaFeedback"></p>
    </div>
  `;
  gameTablero.querySelectorAll('.clasifica-cesta').forEach(cesta=>{
    cesta.addEventListener('click', ()=> resolverClasifica(cesta, sp, cfg));
  });
  const pieza = document.getElementById('clasificaPieza');
  pieza.addEventListener('click', ()=>{
    if(!juego || !juego.activo) return;
    const fb = document.getElementById('clasificaFeedback');
    if(fb) fb.textContent = 'Mándalo a una de las dos cestas de abajo.';
  });
}
function iniciarClasifica(sp, cfg){
  siguientePiezaClasifica(sp);
}
/* siguientePiezaClasifica: saca otra cosa de la lista de alimentos, evitando
   repetir la misma dos veces seguidas para que no se vuelva mecánico. */
function siguientePiezaClasifica(sp){
  if(!juego || !juego.activo) return;
  const pieza = document.getElementById('clasificaPieza');
  if(!pieza) return;

  let alimento = sp.alimentos[Math.floor(Math.random()*sp.alimentos.length)];
  if(sp.alimentos.length > 1 && juego.ultimaPieza){
    let intentos = 0;
    while(alimento.nombre === juego.ultimaPieza && intentos < 8){
      alimento = sp.alimentos[Math.floor(Math.random()*sp.alimentos.length)];
      intentos++;
    }
  }
  juego.piezaActual = alimento;
  juego.ultimaPieza = alimento.nombre;

  pieza.classList.remove('sale-bueno','sale-malo','entra');
  pieza.querySelector('.clasifica-emoji').textContent = alimento.emoji;
  pieza.querySelector('.clasifica-nombre').textContent = alimento.nombre;
  void pieza.offsetWidth; // reinicia la animación de entrada del CSS
  pieza.classList.add('entra');
  const t = setTimeout(()=> pieza.classList.remove('entra'), 420);
  juego.timers.push(t);
}
function resolverClasifica(cesta, sp, cfg){
  if(!juego || !juego.activo || !juego.piezaActual) return;
  const pieza    = document.getElementById('clasificaPieza');
  const feedback = document.getElementById('clasificaFeedback');
  const alimento = juego.piezaActual;
  juego.piezaActual = null; // evita que un doble clic resuelva dos veces

  const dijoQueCuida = cesta.dataset.cesta === 'bueno';
  const acerto       = dijoQueCuida === alimento.bueno;

  // La pieza "vuela" hacia el lado que de verdad le corresponde.
  pieza.classList.add(alimento.bueno ? 'sale-bueno' : 'sale-malo');

  if(acerto){
    cesta.classList.add('acierto');
    juego.puntos += 1;    // el marcador cuenta aciertos
    sumarAcierto(10);     // el récord usa puntaje con multiplicador de racha
    soltarParticulas(cesta, 7, emojiPremio(sp));
    // El premio de verdad: entender POR QUÉ esa cosa cuida o amenaza.
    feedback.textContent = `✅ ${alimento.nombre}: ${alimento.efecto}`;
    feedback.classList.remove('error');
    feedback.classList.add('acierto');
  } else {
    cesta.classList.add('error');
    registrarError();
    soltarOnda(cesta);
    feedback.textContent = alimento.bueno
      ? `Casi: ${alimento.nombre} sí lo cuida. ${alimento.efecto}`
      : `Ojo: ${alimento.nombre} lo amenaza. ${alimento.efecto}`;
    feedback.classList.remove('acierto');
    feedback.classList.add('error');
  }
  actualizarHud();

  const limpiar = setTimeout(()=> cesta.classList.remove('acierto','error'), 520);
  juego.timers.push(limpiar);

  if(juego.puntos >= cfg.meta){ terminarMinijuego(true); return; }
  if(juego.errores >= cfg.maxErrores){ terminarMinijuego(false); return; }

  const siguiente = setTimeout(()=> siguientePiezaClasifica(sp), 620);
  juego.timers.push(siguiente);
}

/* =============================================================================
   5.H — Minijuego "camino" (MECÁNICA NUEVA): Oso palmero, Cangrejo negro
   Filas de piedras: en cada fila UNA sola es segura y las demás esconden una
   amenaza real de la especie. El jugador cruza fila por fila, desde la de
   más abajo (la primera) hasta la de más arriba (la última).
   Las filas se dibujan al revés (de la última a la primera) para que, al
   mirar la pantalla, el recorrido se lea de abajo hacia arriba como un
   camino que se sube.
   Config: { tipo:'camino', nombreJuego, comoJugar, comoGanar,
             tiempo, filas, columnas, maxErrores, metaTexto }
   ========================================================================= */
function prepararCamino(sp, cfg){
  // Una piedra segura al azar por fila; las demás son trampa.
  juego.seguras = Array.from({length: cfg.filas}, ()=> Math.floor(Math.random()*cfg.columnas));
  juego.filaActual = 0;
  juego.caminoMeta = cfg.metaTexto;

  let filasHtml = '';
  for(let f = cfg.filas - 1; f >= 0; f--){ // de la última (arriba) a la primera (abajo)
    let piedras = '';
    for(let c = 0; c < cfg.columnas; c++){
      piedras += `<button class="camino-piedra" data-fila="${f}" data-col="${c}">🪨</button>`;
    }
    filasHtml += `<div class="camino-fila" data-fila="${f}">${piedras}</div>`;
  }

  gameTablero.innerHTML = `
    <div class="camino-wrap">
      <div class="camino-meta-sup">🏁 <span id="caminoMetaTexto">${cfg.metaTexto}</span></div>
      <div class="camino-filas" id="caminoFilas">${filasHtml}</div>
      <div class="camino-inicio">🐾 <span>Aquí empiezas</span></div>
    </div>
  `;
  gameTablero.querySelectorAll('.camino-piedra').forEach(piedra=>{
    piedra.addEventListener('click', ()=> resolverCamino(piedra, sp, cfg));
  });
  marcarFilaActivaCamino();
}
function iniciarCamino(cfg){
  // El tablero ya quedó listo en prepararCamino: aquí solo se destapa la
  // pista de la primera fila para que el jugador empiece a memorizar.
  marcarFilaActivaCamino();
  mostrarPistaCamino(cfg);
}
/* mostrarPistaCamino: al activarse una fila, la piedra firme se asoma un
   instante y vuelve a taparse. Esto es a propósito: si no, adivinar entre
   tres piedras sería pura suerte y el jugador perdería sin aprender nada.
   Así el reto es de MEMORIA bajo presión de tiempo, que sí se puede mejorar
   practicando. Mientras dura la pista no se aceptan clics (juego.pistaActiva),
   para que no baste con tocar la piedra que está brillando. */
function mostrarPistaCamino(cfg){
  if(!juego || !juego.activo) return;
  const fila = gameTablero.querySelector(`.camino-fila[data-fila="${juego.filaActual}"]`);
  if(!fila) return;
  const segura = fila.querySelector(`.camino-piedra[data-col="${juego.seguras[juego.filaActual]}"]`);
  if(!segura) return;

  juego.pistaActiva = true;
  segura.classList.add('segura-revelada');
  mensajeCamino('👀 ¡Memoriza cuál es la piedra firme!');

  const t = setTimeout(()=>{
    if(!juego) return;
    segura.classList.remove('segura-revelada');
    juego.pistaActiva = false;
    mensajeCamino(`Ahora sí: ¿cuál era? (fila ${juego.filaActual + 1} de ${cfg.filas})`);
  }, cfg.pistaMs);
  juego.timers.push(t);
}
/* marcarFilaActivaCamino: la fila "activa" es la de más abajo sin cruzar;
   las que ya quedaron atrás se marcan como "pasada". */
function marcarFilaActivaCamino(){
  gameTablero.querySelectorAll('.camino-fila').forEach(fila=>{
    const n = parseInt(fila.dataset.fila, 10);
    fila.classList.toggle('activa', n === juego.filaActual);
    fila.classList.toggle('pasada', n < juego.filaActual);
  });
}
/* mensajeCamino: usa la franja de meta de arriba para explicar qué acaba de
   pasar, y después vuelve sola al texto de la meta. */
function mensajeCamino(texto){
  const el = document.getElementById('caminoMetaTexto');
  if(!el || !juego) return;
  el.textContent = texto;
  const t = setTimeout(()=>{
    const actual = document.getElementById('caminoMetaTexto');
    if(actual) actual.textContent = juego.caminoMeta;
  }, 2300);
  juego.timers.push(t);
}
function resolverCamino(piedra, sp, cfg){
  if(!juego || !juego.activo) return;
  if(juego.pistaActiva) return; // todavía se está mostrando la pista
  const fila = parseInt(piedra.dataset.fila, 10);
  const col  = parseInt(piedra.dataset.col, 10);

  if(fila !== juego.filaActual){
    mensajeCamino('Paso a paso: primero cruza la fila que está más abajo.');
    return;
  }
  if(piedra.classList.contains('trampa-revelada') || piedra.classList.contains('pisada')) return;

  if(col === juego.seguras[fila]){
    piedra.classList.add('segura-revelada','pisada');
    piedra.textContent = '🐾';
    sumarAcierto(12);
    soltarParticulas(piedra, 7, emojiPremio(sp));
    juego.filaActual += 1;
    actualizarHud();
    marcarFilaActivaCamino();
    if(juego.filaActual >= cfg.filas){ terminarMinijuego(true); return; }
    mensajeCamino(`¡Pisada firme! Vas ${juego.filaActual} de ${cfg.filas}.`);
    // Pequeña pausa y se destapa la pista de la fila siguiente.
    const t = setTimeout(()=> mostrarPistaCamino(cfg), 520);
    juego.timers.push(t);
  } else {
    // La trampa se revela con una amenaza REAL de esta especie, y se explica
    // en una línea por qué era peligrosa: el error también enseña.
    const amenaza = elegirAmenaza(sp);
    piedra.classList.add('trampa-revelada');
    piedra.textContent = amenaza.emoji;
    piedra.title = amenaza.nombre;
    piedra.disabled = true;
    registrarError();
    soltarOnda(piedra);
    mensajeCamino(`⚠️ ${amenaza.nombre}: ${amenaza.efecto}`);
    if(juego.errores >= cfg.maxErrores){ terminarMinijuego(false); }
  }
}

/* =============================================================================
   5.Z — terminarMinijuego: punto de llegada ÚNICO para los 8 tipos
   =============================================================================
   Decide qué pasa con la salud de la especie:
   - Si la especie estaba VIVA: gana +25 de salud o pierde -15. Si llega a
     0, queda "extinta" en el diario (pero se puede volver a intentar).
   - Si la especie estaba EXTINTA (modo revivir): si gana, vuelve a la vida
     con 20% de salud; si pierde, sigue extinta pero el botón para
     intentarlo de nuevo NUNCA se bloquea, así que puede reintentar las
     veces que quiera hasta lograrlo.
   Y cierra la partida de forma satisfactoria: al ganar, lluvia de partículas
   sobre todo el tablero más un dato de campo de la especie; al perder, un
   mensaje que EXPLICA qué falló y por qué importa — nunca un castigo.
   ========================================================================= */
function terminarMinijuego(gano){
  if(!juego) return;
  const id = juego.especieId;
  const sp = SPECIES.find(s=>s.id===id);
  const cfg = sp.minijuego;
  const s = state[id];
  const eraExtinto = s.extinto;

  // El motivo de la derrota se calcula ANTES de apagar los timers, porque
  // usa los contadores de la partida que acaba de terminar.
  const explicacionDerrota = gano ? '' : mensajeDerrota(sp, cfg);
  const puntajeFinal = juego.puntaje;
  const mejorRachaFinal = juego.mejorRacha;

  detenerMinijuego();
  quitarLeyenda();

  const mejoroRecord = guardarRecordSiMejora(id, puntajeFinal, mejorRachaFinal);

  let titulo, detalle;

  if(eraExtinto){
    if(gano){
      s.extinto = false;
      s.salud = SALUD_REVIVIR;
      s.jugado = true;
      const habitat = document.querySelector(`#zona-${sp.zona} .habitat`);
      if(habitat) startWandering(id, habitat); // vuelve a caminar por el mapa
      const med = document.getElementById('med-'+id);
      if(med) med.classList.remove('extinto');
      titulo = `🌱 ¡${sp.nombre} revivió en tu diario con ${SALUD_REVIVIR}% de salud!`;
      gameResultadoEl.classList.add('gano');
      showToast(`🌱 ${sp.nombre} volvió a tu diario.`);
    } else {
      titulo = `${sp.nombre} sigue extinto. ¡Inténtalo de nuevo, las veces que quieras!`;
      gameResultadoEl.classList.add('perdio');
      showToast(`Sigue intentando revivir a ${sp.nombre}.`);
    }
  } else {
    const delta = gano ? SALUD_GANA : -SALUD_PIERDE;
    s.salud = Math.max(0, Math.min(100, s.salud + delta));
    s.jugado = true;
    titulo = gano
      ? `¡Ganaste! La salud de ${sp.nombre} sube +${SALUD_GANA}.`
      : `No alcanzó esta vez. La salud de ${sp.nombre} baja -${SALUD_PIERDE}.`;
    gameResultadoEl.classList.add(gano ? 'gano' : 'perdio');

    if(s.salud === 0 && s.jugado){
      s.extinto = true;
      clearTimeout(movementTimers[id]);
      showToast(`💔 ${sp.nombre} se ha extinguido en tu diario. ¡Puedes intentar revivirlo jugando de nuevo, las veces que sea necesario!`);
    } else {
      floatPop(id, (delta>0?'+':'') + delta, delta>0 ? '#22432B' : '#8A3B32');
      showToast(gano ? `🌿 ¡Ganaste! ${sp.nombre} está más sana.` : `⚠️ ${sp.nombre} perdió salud. Vuelve a intentarlo.`);
    }
  }

  if(gano){
    // Cierre celebratorio: lluvia sobre todo el tablero + un dato de campo
    // real de la especie, para que ganar también deje algo aprendido.
    // "con-fanfarria" es el gancho que usa el CSS para el cierre vistoso.
    gameResultadoEl.classList.add('con-fanfarria');
    lluviaDeParticulas(18, emojiPremio(sp));
    const dato = sp.datos[Math.floor(Math.random()*sp.datos.length)];
    detalle = `🌿 Dato de campo: ${dato}`;
  } else {
    detalle = `${explicacionDerrota} ${sp.consecuencia}`;
  }

  gameResultadoEl.innerHTML =
    `<span class="resultado-titulo">${titulo}</span>` +
    `<span class="resultado-dato">${detalle}</span>` +
    `<span class="resultado-marca">${mejoroRecord ? '🏅 ¡Nueva marca personal!' : '🏅 Marca de este intento:'} ${puntajeFinal} puntos · mejor racha x${mejorRachaFinal}</span>`;

  const tag = document.getElementById('tag-'+id);
  const med = document.getElementById('med-'+id);
  if(tag){ tag.textContent = s.extinto ? '🪦 Extinto' : '❤ ' + s.salud + '%'; tag.classList.toggle('extinto-tag', s.extinto); }
  if(med){ med.classList.toggle('extinto', s.extinto); }

  updateVine();
  guardarProgreso(id, s.salud, gano, s.extinto);

  // El botón nunca queda deshabilitado: siempre se puede reintentar,
  // tanto para seguir mejorando la salud como para revivir a la especie.
  gameEmpezarBtn.classList.remove('oculto');
  gameEmpezarBtn.textContent = s.extinto ? '↺ Intentar revivir de nuevo' : '↺ Jugar de nuevo';
}

/* mensajeDerrota: explica EN CONCRETO qué pasó, para que perder sea una
   lección y no un regaño. Siempre en segunda persona y con salida. */
function mensajeDerrota(sp, cfg){
  if(juego.tipo === 'equilibrio' && juego.nivel <= 0){
    return `El nivel de agua llegó a 0: ${sp.nombre} se quedó seco. Toca más seguido y no esperes a que baje tanto.`;
  }
  if(cfg.maxErrores && juego.errores >= cfg.maxErrores){
    return `Se juntaron ${juego.errores} errores, y cada uno es una amenaza real que alcanzó a ${sp.nombre}. Revisa la leyenda antes de empezar: ahí está la lista de lo que le hace bien y lo que le hace daño.`;
  }
  if(cfg.intentosMax && juego.intentos >= cfg.intentosMax){
    return `Se acabaron los intentos. Esperar el momento exacto también es parte de cuidar: respira y suelta justo cuando la marca entre a la zona segura.`;
  }
  if(juego.tipo === 'equilibrio'){
    return `Se acabó el tiempo con el nivel por debajo del mínimo sano. Mantenerlo alto desde el principio cuesta menos que recuperarlo al final.`;
  }
  return `Se acabó el tiempo antes de llegar a la meta. Con práctica vas a reconocer más rápido lo que le hace bien a ${sp.nombre}: la racha es la clave, porque tres aciertos seguidos valen más.`;
}

/* ==== 6. GUARDADO DEL PROGRESO ====
   El juego funciona en DOS modos, y el mismo código sirve para los dos:

   a) Modo servidor (index.php + Apache + MySQL): el progreso viaja por
      fetch a save_progress.php y queda en la tabla progreso_especie.
   b) Modo estático (index.html, sin PHP: GitHub Pages, Vercel, o abrir
      el archivo directamente): el progreso se guarda en el navegador con
      localStorage.

   Quién manda: la constante MODO_ESTATICO, que define el puente de cada
   página (index.php la pone en false, index.html en true). En modo
   servidor igual se guarda una copia local, así que nunca se pierde el
   avance aunque la base de datos esté caída. */

const CLAVE_PROGRESO = 'alyra_progreso'; // progreso completo en localStorage
const CLAVE_CUENTA   = 'alyra_guardian'; // cuenta local del jugador

/* ¿Estamos sin PHP? Si el puente no definió la constante, asumimos que sí
   (es el caso de abrir el .html suelto). */
const SIN_SERVIDOR = (typeof MODO_ESTATICO !== 'undefined') ? MODO_ESTATICO : true;

/* guardarProgresoLocal: vuelca TODO el estado actual a localStorage, con
   el mismo formato que usa PROGRESO_INICIAL, para que al recargar la
   página el juego arranque justo donde se quedó. */
function guardarProgresoLocal(){
  try{
    const resumen = {};
    SPECIES.forEach(sp=>{
      const s = state[sp.id];
      // Solo guardamos lo que ya se jugó: así una especie intacta sigue en 0.
      if(s && (s.jugado || s.salud > 0 || s.extinto)){
        resumen[sp.id] = { salud: s.salud, extinto: s.extinto };
      }
    });
    localStorage.setItem(CLAVE_PROGRESO, JSON.stringify(resumen));
  }catch(err){
    // localStorage puede estar bloqueado (modo privado): el juego sigue
    // funcionando en memoria, solo que no recordará al recargar.
  }
}

/* guardarProgreso: punto único al que llama terminarMinijuego(). */
async function guardarProgreso(especieId, salud, gano, extinto){
  // 1. Copia local SIEMPRE: es instantánea y no depende de la red.
  guardarProgresoLocal();

  // 2. Si no hay PHP detrás, aquí termina el trabajo.
  if(SIN_SERVIDOR) return;

  // 3. Con servidor, además se manda a MySQL.
  try{
    const r = await fetch('save_progress.php', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ especie_id: especieId, salud, gano, extinto })
    });
    if(r.status === 401) showToast('Crea una cuenta para guardar tu avance.');
  }catch(err){
    // Si falla la conexión, el progreso ya quedó guardado en el navegador.
    console.warn('No se pudo guardar el progreso en el servidor:', err);
  }
}

/* ---- FORMULARIO DE REGISTRO (overlay obligatorio antes de jugar) ----
   Intercepta el envío del formulario para mandarlo por fetch a
   register.php SIN recargar la página. Si la respuesta es exitosa,
   cierra la ventana de registro, muestra la barra de sesión y recién
   ahí construye el mapa del juego (buildMap). */
const registroForm    = document.getElementById('registroForm');
const registroOverlay = document.getElementById('registroOverlay');
const registroError   = document.getElementById('registroError');
const registroSubmit  = document.getElementById('registroSubmit');

/* sesionIniciada: deja la interfaz como "jugando con cuenta". Lo usan por
   igual el registro contra PHP y el registro local sin servidor. */
function sesionIniciada(nombre, mensaje){
  registroOverlay.classList.remove('open');
  document.getElementById('sesionBar').classList.add('visible');
  document.getElementById('sesionNombre').textContent = nombre;
  document.getElementById('invitadoBar').classList.remove('visible');
  showToast(mensaje);
  Object.values(movementTimers).forEach(t=> clearTimeout(t));
  buildMap();
}

if(registroForm){
  registroForm.addEventListener('submit', async (evento)=>{
    evento.preventDefault(); // evita que el formulario recargue la página
    registroError.textContent = '';
    registroSubmit.disabled = true;
    registroSubmit.textContent = 'Creando cuenta...';

    try{
      const datosFormulario = new FormData(registroForm);

      /* ---- Modo estático: la cuenta se crea en el propio navegador ----
         No hay servidor donde validar, así que guardamos el nombre en
         localStorage. La contraseña NO se guarda: sin backend no habría
         forma de protegerla, y aquí solo sirve para personalizar la
         experiencia y conservar el progreso en este dispositivo. */
      if(SIN_SERVIDOR){
        const nombre = (datosFormulario.get('nombre_usuario') || '').toString().trim();
        if(nombre.length < 3){
          registroError.textContent = 'El nombre de guardián necesita al menos 3 letras.';
          return;
        }
        try{
          localStorage.setItem(CLAVE_CUENTA, JSON.stringify({ nombre }));
        }catch(err){
          registroError.textContent = 'Tu navegador no permite guardar datos. Puedes jugar igual, sin cuenta.';
          return;
        }
        sesionIniciada(nombre, `¡Bienvenido, ${nombre}! Tu avance se guardará en este navegador.`);
        return;
      }

      const respuesta = await fetch('register.php', { method:'POST', body: datosFormulario });
      const resultado = await respuesta.json();

      if(resultado.ok){
        sesionIniciada(resultado.jugador.nombre, resultado.mensaje);
      } else {
        registroError.textContent = resultado.mensaje || 'No se pudo completar el registro.';
      }
    }catch(err){
      registroError.textContent = 'No se pudo conectar con el servidor. Intenta de nuevo.';
    }finally{
      registroSubmit.disabled = false;
      registroSubmit.textContent = 'Registrarme y empezar a jugar';
    }
  });
}

/* ---- BOTÓN DE REINICIO (solo visual, en este navegador) ---- */
document.getElementById('resetBtn').addEventListener('click', ()=>{
  Object.values(movementTimers).forEach(t=> clearTimeout(t));
  // Reinicia el estado local a 0, pero NO borra lo que ya está guardado en
  // la base de datos: la próxima vez que se recargue la página con sesión
  // activa, PHP volverá a traer el progreso real desde MySQL.
  SPECIES.forEach(sp=>{ state[sp.id] = { salud:0, extinto:false, jugado:false, x:15+Math.random()*70, y:25+Math.random()*55 }; });
  // También se borra la copia local, si no el diario "reviviría" al recargar.
  try{ localStorage.removeItem(CLAVE_PROGRESO); }catch(err){ /* sin localStorage no hay nada que borrar */ }
  buildMap();
  overlay.classList.remove('open');
  showToast('↺ Diario reiniciado en este navegador.');
});

/* ---- CERRAR SESIÓN EN MODO ESTÁTICO ----
   Con PHP, el enlace lleva a logout.php y el servidor destruye la sesión.
   Sin PHP no hay a dónde ir: borramos la cuenta local y devolvemos la
   interfaz al estado de invitado, sin recargar. */
if(SIN_SERVIDOR){
  document.querySelectorAll('#sesionBar .logout-link').forEach(enlace=>{
    enlace.addEventListener('click', (e)=>{
      e.preventDefault();
      try{ localStorage.removeItem(CLAVE_CUENTA); }catch(err){ /* nada que borrar */ }
      document.getElementById('sesionBar').classList.remove('visible');
      document.getElementById('invitadoBar').classList.add('visible');
      showToast('Sesión cerrada. Tu avance sigue guardado en este navegador.');
    });
  });
}

/* ---- PUNTO DE ENTRADA ----
   El mapa se construye siempre: crear cuenta es opcional (solo sirve para
   ponerle nombre al diario y conservar el progreso). */
buildMap();
document.getElementById('registroCerrar').addEventListener('click', ()=> registroOverlay.classList.remove('open'));
document.getElementById('abrirRegistro').addEventListener('click', (e)=>{ e.preventDefault(); registroOverlay.classList.add('open'); });

