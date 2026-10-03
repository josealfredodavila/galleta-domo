// ================================================================
// GRUPOS · CONFIGURACIÓN GLOBAL
// ================================================================
// Este archivo define variables, constantes y el cliente de Supabase.
// Debe cargarse ANTES que cualquier otro script de grupos.
// ================================================================

// ================================================================
// ✅ FORZAR APARIENCIA (tema claro/oscuro, color, fuente)
// ================================================================
(function forzarApariencia() {
    try {
        const tema = localStorage.getItem('mostrar_tema') || 'sistema';
        const html = document.documentElement;
        html.classList.remove('tema-dia', 'tema-noche');
        html.removeAttribute('data-tema');
        
        if (tema === 'dia') {
            html.classList.add('tema-dia');
            html.setAttribute('data-tema', 'dia');
        } else if (tema === 'noche') {
            html.classList.add('tema-noche');
            html.setAttribute('data-tema', 'noche');
        } else {
            const prefiereOscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            html.setAttribute('data-tema', prefiereOscuro ? 'noche' : 'dia');
            html.classList.add(prefiereOscuro ? 'tema-noche' : 'tema-dia');
        }
        
        const color = localStorage.getItem('mostrar_color_acento') || '#D4AF37';
        html.style.setProperty('--gold', color);
        
        const fuente = parseInt(localStorage.getItem('mostrar_tamano_fuente') || 100);
        html.style.fontSize = (16 * fuente / 100) + 'px';
    } catch (e) {
        console.warn('[Grupos] No se pudo forzar apariencia:', e);
    }
})();

// ================================================================
// ✅ INICIALIZAR SUPABASE
// ================================================================
(function inicializarSupabase() {
    try {
        if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
            console.log('[Grupos] ✅ supabaseClient ya existía');
            return;
        }
        
        var SDK = window.__SB_SDK || window.supabase;
        if (!SDK || typeof SDK.createClient !== 'function') {
            console.error('[Grupos] ❌ Supabase SDK no disponible');
            if (window.__dbgShow) window.__dbgShow('Supabase: SDK no disponible');
            return;
        }
        
        window.supabaseClient = SDK.createClient(
            'https://zultnlogdoajehbswlih.supabase.co',
            'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu',
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            }
        );
        console.log('[Grupos] ✅ Supabase Client inicializado');
    } catch (e) {
        console.error('[Grupos] ❌ Error inicializando Supabase:', e);
        if (window.__dbgShow) window.__dbgShow('Supabase: ' + (e && e.message ? e.message : String(e)));
    }
})();

window.supabaseReady = Promise.resolve(window.supabaseClient);

// ================================================================
// ✅ CONSTANTES GLOBALES
// ================================================================
const LIVEKIT_CONFIG = { url: 'wss://csariels-domo-57ujk04t.livekit.cloud' };

// ================================================================
// ✅ ESTADO COMPARTIDO ENTRE MÓDULOS
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
var localStreamGrupo = null;
var isLiveGrupoActivo = false;
var streamIntervalGrupo = null;
var channelChatGrupo = null;
var espectadoresGrupo = 0;
var currentStreamGrupoId = null;
var esStreamerDelLiveGrupo = false;

// ================================================================
// ✅ MODERACIÓN · CATEGORÍAS BLOQUEADAS
// ================================================================
const CATEGORIAS_BLOQUEADAS = {
    activos_digitales: ['token','tokens','cripto','criptos','crypto','cryptos','criptomoneda','criptomonedas','bitcoin','btc','ethereum','eth','usdt','usdc','tether','dai','busd','nft','nfts','blockchain','cadena de bloques','coin','coins','altcoin','altcoins','defi','web3','wallet','wallets','metamask','binance','coinbase','kraken','kucoin','dogecoin','doge','shiba','shib','solana','bnb','binance coin','polygon','matic','cardano','ripple','xrp','litecoin','ltc','tron','trx','es.stok','es.stoks','estok','estoks','es stok','es stoks','staking','mining','mineria','minar','p2p cripto','exchange cripto','monedero digital','monedero cripto','activo digital','activos digitales','polkadot','chainlink','uniswap','aave','memecoin','shitcoin','airdrop','whitelist cripto','presale cripto','ieo','mineria bitcoin','rig de mineria','hardware wallet','ledger nano','trezor'],
    articulos_regulados: ['arma','armas','pistola','pistolas','rifle','rifles','escopeta','escopetas','municion','municiones','balas','cartuchos','explosivo','explosivos','granada','granadas','dinamita','tnt','c4','polvora','mecha','silenciador','supresor','cargador extendido','arma larga','arma corta','arma de fuego','arma blanca','cuchillo tactico','navaja automatica','taser','paralizante','gas pimienta restringido','chaleco antibalas','placa balistica','dron armado','mira telescopica','scope militar'],
    sustancias_controladas: ['droga','drogas','cocaina','heroina','metanfetamina','cristal','meth','marihuana','mariguana','cannabis','weed','motita','porro','lsd','acido lisergico','extasis','mdma','fentanilo','opio','opiaceos','morfina','tramadol','oxycodone','xanax','valium','clonazepam','medicamento controlado','medicamento sin receta','medicamento fraude','antibiotico sin receta','viagra generico','esteroides','anabolicos','tramadol sin receta','psicotropico','estupefaciente'],
    contenido_adulto: ['pornografia','porno','xxx','contenido para adultos','contenido sexual','sexo explicito','nudismo','desnudo','desnudos','onlyfans','pack de fotos','pack de videos','pack intimo','fotos intimas','videos intimas','contenido nsfw','nsfw','hentai','ecchi','juguete sexual','juguetes sexuales','consolador','vibrador','lenceria erotica','traje de latex','servicio sexual','masaje erotico','masaje tantrico','masaje sensual','acompañante','escort','prepago','servicios de acompañamiento','chica prepago','chico prepago'],
    documentos_oficiales: ['ine falsa','ine falso','credencial falsa','credencial falsificada','pasaporte falso','pasaporte falsificado','licencia de conducir falsa','licencia falsificada','acta de nacimiento falsa','acta falsificada','titulo profesional falso','titulo falsificado','cedula falsa','cedula falsificada','diploma falso','certificado falso','documento oficial falso','documento falsificado','tarjeta de circulacion falsa','placas falsas','comprobante de domicilio falso','recibo falso','factura falsa','factura falsificada','cfdi falso','constancia falsa','curp falsa','rfc falso','numero de seguro social falso','nss falso'],
    productos_falsificados: ['replica','replicas','imitacion','imitaciones','clon','clones','falsificacion','falsificaciones','pirata','piratas','pirateria','producto pirata','producto replicado','producto clon','primera copia','triple a','aaa replica','espejo original','outlet replica','marca replica','bolso replica','tenis replica','reloj replica','perfume replica','ropa replica','software pirata','windows pirata','office pirata','adobe pirata','photoshop pirata','juego pirata','pelicula pirata','serie pirata'],
    practicas_fraudulentas: ['estafa','estafas','fraude','fraudes','timo','timos','engano','enganos','piramide','esquema piramidal','esquema ponzi','ponzi','multinivel falso','inversion garantizada','inversion segura sin riesgo','rendimiento garantizado','dinero facil','gana dinero rapido','ganancias garantizadas','prestamo sin aval','prestamo express','prestamo gota a gota','montadeudas','cobro por adelantado','anticipo por adelantado','deposito por adelantado','transferencia por adelantado','phishing','malware','virus informatico','spyware','ransomware','tarjeta clonada','tarjeta de credito clonada','clonar tarjeta','clonar whatsapp','hackear whatsapp','hackear facebook','hackear instagram','recuperar cuenta hackeada','espiar whatsapp','espiar celular','rastreador de pareja','app espia','software espia'],
    datos_personales: ['venta de datos','vendo datos personales','base de datos privada','padron electoral','padron de clientes','lista de correos','lista de telefonos','lista de whatsapp','contactos de famosos','datos de usuarios','informacion confidencial','informacion privada','datos filtrados','datos de clientes','datos bancarios de terceros','numero de tarjeta de credito ajeno','cvv ajeno','nip ajeno','curp ajena','rfc ajeno','ine ajena','direccion de terceros','ubicacion de terceros','geolocalizacion ajena','espiar ubicacion'],
    seres_vivos: ['vendo perro','vendo gato','vendo cachorro','vendo gatito','venta de perros','venta de gatos','venta de aves','venta de reptiles','venta de peces','venta de conejos','venta de hamsters','cachorros en venta','gatitos en venta','aves exoticas','animal exotico','animal protegido','especie protegida','venta de tortugas','venta de iguanas','venta de serpientes','venta de loros','venta de guacamayas','venta de tucanes','trafico de animales','trafico de especies','fauna silvestre','planta protegida','cactacea protegida','orquidea silvestre','madera preciosa','palo de rosa','caoba','cedro rojo'],
    alcohol_tabaco: ['vendo alcohol','vendo cerveza','vendo tequila','vendo whisky','venta de alcohol','venta de cerveza','venta de tequila','cerveza artesanal','vino artesanal','mezcal artesanal','licor casero','destilado casero','alcohol casero','vape','vapes','vapeador','vapeadores','cigarro electronico','cigarrillos electronicos','desechable vape','cigarros','cigarrillos','tabaco','puros','habanos','picadura de tabaco','snus','nicotina liquida','sales de nicotina'],
    discurso_odio: ['muerte a los','maten a los','odio a los','los malditos','raza inferior','raza superior','cancer de la sociedad','basura humana','escoria humana','exterminar a','eliminar a todos los','deberian morir','deberian desaparecer','infieles','putos','maricones','sudacas','indios de mierda','prietos','narizones','nacos','pinches indios','malinchistas','gachupines','sionistas','nazis','hitler','supremacia blanca','supremacia aria','razas inferiores','limpieza etnica'],
    contenido_menores: ['menor de edad','menores de edad','contenido con menores','fotos de menores','videos de menores','nino desnudo','nina desnuda','child porn','pedofilia','pedofilo','pederasta','chico joven sexual','chica joven sexual','adolescente desnuda','adolescente desnudo','preteen','lolita','lolicon','shotacon'],
    amenazas_extorsion: ['te voy a matar','te voy a encontrar','se donde vives','tengo tu direccion','tengo tu familia','secuestro','secuestrar','levanton','levantar a alguien','extorsion','extorsionar','cobro de piso','derecho de piso','cobro forzoso','amenaza de muerte','amenazas graves','te voy a golpear','te voy a hacer dano','sicario','sicarios','maton','matones','por encargo','ajuste de cuentas','cobrar por la fuerza'],
    contenido_intimo_sin_consentimiento: ['pack filtrado','pack filtrados','pack sin permiso','pack de ex','pack de la ex','pack de mi ex','pack de novia','fotos filtradas','videos filtrados','intimo filtrado','intimo sin permiso','sin consentimiento','pack de la companera','pack de la vecina','pack de la maestra','pack de la alumna','venganza intima','revenge porn','porno venganza','fotos privadas filtradas','venganza con fotos','exponer intimidades','venganza con videos']
};

const NOMBRES_CATEGORIAS = {
    activos_digitales: 'Activos digitales (cripto/tokens/NFT)',
    articulos_regulados: 'Artículos regulados por la ley',
    sustancias_controladas: 'Sustancias controladas',
    contenido_adulto: 'Contenido para adultos',
    documentos_oficiales: 'Documentos oficiales',
    productos_falsificados: 'Productos falsificados',
    practicas_fraudulentas: 'Prácticas fraudulentas',
    datos_personales: 'Datos personales de terceros',
    seres_vivos: 'Seres vivos',
    alcohol_tabaco: 'Alcohol y tabaco',
    discurso_odio: 'Discursos de odio',
    contenido_menores: 'Contenido con menores de edad',
    amenazas_extorsion: 'Amenazas o extorsión',
    contenido_intimo_sin_consentimiento: 'Contenido íntimo sin consentimiento (Ley Olimpia)'
};

// ================================================================
// ✅ EMOJIS DISPONIBLES (para el picker de publicaciones)
// ================================================================
var emojisDisponibles = ['◈','😀','😁','😂','🤣','😃','😄','😅','😊','😇','🙂','😉','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👺','👻','👽','👾','🤖','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','🔥','✨','🌟','💫','⭐','⚡','💥','💢','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌫️','🌊','💧','💦','☔','☂️','🌂','🎉','🎊','🎈','🎁','🎂','🍰','🧁','🍕','🍔','🍟','🌮','🌯','🍿','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🍾','☕','🍵','🧃','🥤','🧋','🍼','🥛','💊','🌿','🍃','🍀','🍁','🍂','🌸','🌺','🌻','🌹','🌷','🌼','💐','🌱','🌲','🌳','🌴','🌵','🌾','🍄','🐚','🪨','🌍','🌎','🌏','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌚','🌝','🌞','🪐','☄️','🌠','🌌'];