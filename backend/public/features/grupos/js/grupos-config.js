// ================================================================
// GRUPOS · CONFIGURACIÓN GLOBAL (v2)
// ================================================================
// Define variables, constantes y la referencia al cliente Supabase
// compartido. Debe cargarse DESPUÉS de app.js y ANTES que el resto
// de scripts de grupos.
// v2: moderación ajustada (sin vocabulario del ecosistema ni falsos
//     positivos cotidianos). Variables de estado conservadas.
// ================================================================

// ================================================================
// APARIENCIA (tema claro/oscuro, color y tamaño de fuente)
// ================================================================
(function forzarApariencia() {
    try {
        var tema = localStorage.getItem('mostrar_tema') || 'sistema';
        var html = document.documentElement;
        html.classList.remove('tema-dia', 'tema-noche');
        html.removeAttribute('data-tema');

        if (tema === 'dia') {
            html.classList.add('tema-dia');
            html.setAttribute('data-tema', 'dia');
        } else if (tema === 'noche') {
            html.classList.add('tema-noche');
            html.setAttribute('data-tema', 'noche');
        } else {
            var prefiereOscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            html.setAttribute('data-tema', prefiereOscuro ? 'noche' : 'dia');
            html.classList.add(prefiereOscuro ? 'tema-noche' : 'tema-dia');
        }

        var color = localStorage.getItem('mostrar_color_acento') || '#D4AF37';
        html.style.setProperty('--gold', color);

        var fuente = parseInt(localStorage.getItem('mostrar_tamano_fuente') || 100, 10);
        html.style.fontSize = (16 * fuente / 100) + 'px';
    } catch (e) {
        console.warn('[Grupos] No se pudo aplicar la apariencia:', e);
    }
})();

// ================================================================
// CLIENTE SUPABASE: reutiliza el singleton de app.js
// ================================================================
// app.js debe exponer window.getSupabase(). Si no lo expone, el
// cliente se toma de window.supabaseClient (si ya existe).
window.supabaseReady = (typeof window.getSupabase === 'function'
    ? window.getSupabase()
    : Promise.resolve(window.supabaseClient || null)
).then(function (client) {
    if (client) window.supabaseClient = client;
    return window.supabaseClient || null;
}).catch(function (e) {
    console.error('[Grupos] No se pudo obtener Supabase:', e);
    return null;
});

// ================================================================
// CONSTANTES
// ================================================================
var LIVEKIT_CONFIG = { url: 'wss://csariels-domo-57ujk04t.livekit.cloud' };

// ================================================================
// ESTADO COMPARTIDO ENTRE MÓDULOS
// (algunas variables no se usan en estos archivos; se conservan
//  por si otro script las referencia)
// ================================================================
var sessionUser = null;
var grupoActual = null;
var grupoActualId = null;
var rolEnGrupo = null;
var esAdmin = false;
var esModerador = false;
var esCreador = false;
var liveActivoEnGrupo = null;
var soloMisGrupos = false;
var categoriasCache = [];
var publicando = false;
var eliminandoGrupo = false;
var misCanalesCache = [];

var misInteracciones = {};
var misNotificaciones = {};
var filtroFeedActual = 'todo';
var publicacionesCache = [];
var publicacionReportando = null;
var etiquetadosSeleccionados = [];

// Anuncios
var anuncioActual = null;
var adRefreshInterval = null;
var adSessionId = null;
var adVistaTimer = null;
var adCerrado = false;

// Paginación
var grpPagina = 0;
var grpPaginaSize = 24;
var grpHayMas = false;
var grpBuscarTimer = null;

// LiveKit
var liveKitRoomGrupo = null;
var localStreamGrupo = null;          // sin uso activo
var isLiveGrupoActivo = false;
var streamIntervalGrupo = null;       // sin uso activo
var channelChatGrupo = null;
var espectadoresGrupo = 0;            // sin uso activo
var currentStreamGrupoId = null;
var esStreamerDelLiveGrupo = false;

// ================================================================
// MODERACIÓN · CATEGORÍAS BLOQUEADAS
// Solo bloqueos reales. Sin vocabulario del ecosistema (cripto,
// tokens, Web3, wallets, USDT, NFT) ni palabras cotidianas.
// ================================================================
var CATEGORIAS_BLOQUEADAS = {
    activos_digitales: [
        'presale cripto', 'whitelist cripto', 'inversion en cripto garantizada',
        'rendimiento garantizado cripto', 'esquema cripto piramidal'
    ],

    articulos_regulados: [
        'arma', 'armas', 'pistola', 'pistolas', 'rifle', 'rifles', 'escopeta', 'escopetas',
        'municion', 'municiones', 'explosivo', 'explosivos', 'dinamita', 'tnt', 'c4',
        'silenciador', 'supresor', 'cargador extendido', 'arma larga', 'arma corta',
        'arma de fuego', 'cuchillo tactico', 'taser', 'chaleco antibalas',
        'placa balistica', 'dron armado', 'mira telescopica'
    ],

    sustancias_controladas: [
        'cocaina', 'heroina', 'metanfetamina', 'meth', 'fentanilo', 'lsd', 'mdma',
        'opio', 'opiaceos', 'morfina', 'tramadol', 'oxycodone', 'xanax', 'valium',
        'clonazepam', 'estupefaciente', 'psicotropico', 'drogas', 'droga',
        'marihuana', 'mariguana', 'cannabis', 'motita'
    ],

    contenido_adulto: [
        'pornografia', 'porno', 'xxx', 'contenido para adultos', 'contenido sexual',
        'sexo explicito', 'contenido nsfw', 'nsfw', 'hentai', 'juguete sexual',
        'juguetes sexuales', 'vibrador', 'lenceria erotica', 'servicio sexual',
        'masaje erotico', 'masaje tantrico', 'masaje sensual', 'servicios de acompañamiento',
        'pack intimo', 'fotos intimas', 'videos intimos'
    ],

    documentos_oficiales: [
        'ine falsa', 'ine falso', 'credencial falsa', 'credencial falsificada',
        'pasaporte falso', 'pasaporte falsificado', 'licencia de conducir falsa',
        'licencia falsificada', 'acta de nacimiento falsa', 'acta falsificada',
        'titulo profesional falso', 'titulo falsificado', 'cedula falsa',
        'cedula falsificada', 'diploma falso', 'certificado falso',
        'documento oficial falso', 'documento falsificado', 'tarjeta de circulacion falsa',
        'placas falsas', 'comprobante de domicilio falso', 'recibo falso', 'factura falsa',
        'factura falsificada', 'cfdi falso', 'constancia falsa', 'curp falsa', 'rfc falso',
        'numero de seguro social falso', 'nss falso'
    ],

    productos_falsificados: [
        'falsificacion', 'falsificaciones', 'producto pirata', 'producto replicado',
        'producto clon', 'primera copia', 'aaa replica', 'espejo original',
        'bolso replica', 'tenis replica', 'reloj replica', 'perfume replica',
        'ropa replica', 'marca replica', 'outlet replica',
        'software pirata', 'windows pirata', 'office pirata', 'adobe pirata',
        'photoshop pirata', 'juego pirata', 'pelicula pirata', 'serie pirata'
    ],

    practicas_fraudulentas: [
        'estafa', 'estafas', 'fraude', 'fraudes', 'ponzi', 'esquema ponzi',
        'esquema piramidal', 'inversion garantizada', 'inversion segura sin riesgo',
        'rendimiento garantizado', 'dinero facil', 'gana dinero rapido',
        'ganancias garantizadas', 'prestamo gota a gota', 'montadeudas',
        'phishing', 'malware', 'spyware', 'ransomware', 'tarjeta clonada',
        'clonar tarjeta', 'clonar whatsapp', 'hackear whatsapp', 'hackear facebook',
        'hackear instagram', 'espiar whatsapp', 'espiar celular', 'rastreador de pareja',
        'app espia', 'software espia'
    ],

    datos_personales: [
        'venta de datos', 'vendo datos personales', 'datos filtrados', 'padron electoral',
        'datos bancarios de terceros', 'numero de tarjeta de credito ajeno', 'cvv ajeno',
        'nip ajeno', 'curp ajena', 'rfc ajeno', 'ine ajena', 'espiar ubicacion',
        'geolocalizacion ajena'
    ],

    seres_vivos: [
        'trafico de animales', 'trafico de especies', 'fauna silvestre',
        'animal protegido', 'especie protegida', 'venta de tortugas', 'venta de iguanas',
        'venta de serpientes', 'venta de loros', 'venta de guacamayas', 'venta de tucanes',
        'planta protegida', 'cactacea protegida', 'orquidea silvestre'
    ],

    alcohol_tabaco: [
        'vape', 'vapes', 'vapeador', 'vapeadores', 'cigarro electronico',
        'cigarrillos electronicos', 'desechable vape', 'nicotina liquida',
        'sales de nicotina', 'snus'
    ],

    discurso_odio: [
        'muerte a los', 'maten a los', 'raza inferior', 'raza superior', 'basura humana',
        'escoria humana', 'exterminar a', 'deberian morir', 'deberian desaparecer',
        'putos', 'maricones', 'sudacas', 'indios de mierda', 'pinches indios', 'nacos',
        'prietos', 'narizones', 'supremacia blanca', 'supremacia aria', 'razas inferiores',
        'limpieza etnica'
    ],

    contenido_menores: [
        'pedofilia', 'pedofilo', 'pederasta', 'child porn', 'lolicon', 'shotacon',
        'nino desnudo', 'nina desnuda', 'adolescente desnuda', 'adolescente desnudo',
        'preteen', 'chico joven sexual', 'chica joven sexual', 'contenido sexual con menores'
    ],

    amenazas_extorsion: [
        'te voy a matar', 'te voy a encontrar', 'se donde vives', 'tengo tu direccion',
        'tengo tu familia', 'extorsion', 'extorsionar', 'cobro de piso', 'derecho de piso',
        'cobro forzoso', 'amenaza de muerte', 'amenazas graves', 'te voy a golpear',
        'te voy a hacer dano', 'cobrar por la fuerza', 'secuestro express', 'secuestro exprés'
    ],

    contenido_intimo_sin_consentimiento: [
        'pack filtrado', 'pack filtrados', 'pack sin permiso', 'pack de mi ex',
        'pack de la ex', 'fotos privadas filtradas', 'intimo filtrado', 'intimo sin permiso',
        'venganza intima', 'revenge porn', 'porno venganza', 'venganza con fotos',
        'venganza con videos', 'exponer intimidades', 'pack de la companera',
        'pack de la vecina', 'pack de la maestra', 'pack de la alumna'
    ]
};

var NOMBRES_CATEGORIAS = {
    activos_digitales: 'Estafas con activos digitales',
    articulos_regulados: 'Artículos regulados por la ley',
    sustancias_controladas: 'Sustancias controladas',
    contenido_adulto: 'Contenido para adultos',
    documentos_oficiales: 'Documentos oficiales',
    productos_falsificados: 'Productos falsificados',
    practicas_fraudulentas: 'Prácticas fraudulentas',
    datos_personales: 'Datos personales de terceros',
    seres_vivos: 'Seres vivos protegidos',
    alcohol_tabaco: 'Vapes y nicotina',
    discurso_odio: 'Discursos de odio',
    contenido_menores: 'Contenido con menores de edad',
    amenazas_extorsion: 'Amenazas o extorsión',
    contenido_intimo_sin_consentimiento: 'Contenido íntimo sin consentimiento (Ley Olimpia)'
};

// ================================================================
// EMOJIS DISPONIBLES (picker de contenido de publicaciones)
// Es contenido del usuario, no decoración de la interfaz.
// ================================================================
var emojisDisponibles = ['◈','😀','😁','😂','🤣','😃','😄','😅','😊','😇','🙂','😉','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👺','👻','👽','👾','🤖','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','🔥','✨','🌟','💫','⭐','⚡','💥','💢','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌫️','🌊','💧','💦','☔','☂️','🌂','🎉','🎊','🎈','🎁','🎂','🍰','🧁','🍕','🍔','🍟','🌮','🌯','🍿','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🍾','☕','🍵','🧃','🥤','🧋','🍼','🥛','💊','🌿','🍃','🍀','🍁','🍂','🌸','🌺','🌻','🌹','🌷','🌼','💐','🌱','🌲','🌳','🌴','🌵','🌾','🍄','🐚','🪨','🌍','🌎','🌏','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌚','🌝','🌞','🪐','☄️','🌠','🌌'];
