// ================================================================
// LIVE · JS v3.4 — Csariel's
// Cliente de transmisión en vivo. El SERVIDOR decide roles, publicación,
// Live Pass, dueño del live y autor de los mensajes.
// Las validaciones del navegador son solo experiencia de usuario.
// ================================================================
'use strict';

// ---------- CONFIGURACIÓN ----------
const LIVEKIT_URL = 'wss://csariels-domo-57ujk04t.livekit.cloud';
// Verificar que esta versión exista en jsDelivr antes de desplegar.
const LIVEKIT_MODULE_URL = 'https://cdn.jsdelivr.net/npm/livekit-client@2.9.4/dist/livekit-client.esm.mjs';

const ENDPOINTS = {
    token: '/api/livekit/token',
    registrarMinuto: '/api/live/registrar-minuto',
    donacionCrear: '/api/live/donacion/crear',
    donacionEstado: (id) => `/api/live/donacion/${encodeURIComponent(id)}/estado`,
    anuncioGet: '/api/marketing/get-ad',
    anuncioEvento: '/api/marketing/register-event',
    broadcast: '/api/push/broadcast-live'
};

// Funciones reales de la base de datos (firmas verificadas)
const RPC = {
    crear: 'crear_transmision',          // (p_titulo, p_categoria, p_room_name, p_grupo_id) → bigint
    finalizar: 'finalizar_transmision',  // (p_transmision_id integer) → jsonb
    puedeTransmitir: 'puede_transmitir_live' // (p_usuario_id uuid) → jsonb
};

const DONACIONES = {
    2:   { nombre: 'Cubo Plata',       emoji: '◈', color: '#C0C0C0', duracion: 3000 },
    5:   { nombre: 'Cubo Bronce',      emoji: '◈', color: '#CD7F32', duracion: 4000 },
    10:  { nombre: 'Cubo Oro',         emoji: '◈', color: '#D4AF37', duracion: 5000 },
    20:  { nombre: 'Cohete Bronce',    emoji: '▲', color: '#CD7F32', duracion: 6000 },
    50:  { nombre: 'Cohete Esmeralda', emoji: '▲', color: '#50C878', duracion: 8000 },
    100: { nombre: 'Cohete Diamante',  emoji: '◇', color: '#B9F2FF', duracion: 10000 }
};

const REDES_DONACION = [
    { id: 'usdttrc20',   label: 'USDT · TRC20' },
    { id: 'usdtpolygon', label: 'USDT · Polygon' },
    { id: 'usdtsol',     label: 'USDT · Solana' },
    { id: 'usdtbsc',     label: 'USDT · BSC' },
    { id: 'usdcpolygon', label: 'USDC · Polygon' },
    { id: 'usdcsol',     label: 'USDC · Solana' },
    { id: 'usdcbsc',     label: 'USDC · BSC' }
];

const CATEGORIAS = [
    ['general', 'General'], ['gaming', 'Gaming'], ['musica', 'Música'],
    ['educacion', 'Educación'], ['comunidad', 'Comunidad'], ['tecnologia', 'Tecnología']
];

const COLUMNAS_LISTADO = 'id,titulo,categoria,viewers_count,fecha_inicio,estado,is_live';
const COLUMNAS_FILA = 'id,titulo,categoria,estado,is_live,fecha_inicio';

const PALABRAS_PROHIBIDAS = [
    'puta','verga','mierda','pendejo','chingar','chingada','cabron','cabrón','pinche',
    'wey','güey','culero','puto','maricon','maricón','joto','matar','mata','asesinar',
    'suicidio','violar','droga','cocaína','marihuana','perico','cristal','cerveza',
    'tequila','whisky','ron','vodka','fuck','shit','bitch','asshole','motherfucker'
];

const PALABRAS_SPAM_IGNORADAS = [
    'ja','je','ji','jo','ju','no','si','sí','ok','oki','ya','eh','ah','oh','uh',
    'xd','xdd','xddd','jaja','jajaja','lol','el','la','los','las','un','una','de',
    'que','y','o','a','en','con','por','para','es','mi','tu','su','al','del'
];

const MAX_MENSAJES_DOM = 100;
const MAX_FALLOS_MINUTO = 5;
const INTERVALO_MINUTO_MS = 60000;
const INTERVALO_RESYNC_MINUTOS = 5;
const COOLDOWN_CHAT_MS = 1500;
const INTERVALO_SONDEO_MS = 5000;
const TIMEOUT_DONACION_MS = 10 * 60 * 1000;
const COLOR_HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const LABEL_STYLE = 'display:block;color:var(--text-secondary);font-size:.75rem;margin-bottom:6px;text-align:left;';
const INPUT_STYLE = 'width:100%;padding:12px 14px;margin-bottom:14px;border-radius:12px;border:1px solid var(--glass-border);background:rgba(0,0,0,.35);color:var(--text-primary);font-size:.9rem;outline:none;font-family:inherit;';

// ---------- ESTADO ----------
let supabaseClient = null;
let LK = null;
let liveKitRoom = null;
let _rol = 'idle';                     // 'idle' | 'streamer' | 'viewer'
let _modoActual = null;                // 'camara' | 'juego'
let currentUser = null;
let currentStreamId = null;            // entero (bigint de la base)
let gameScreenStream = null;
let _pendienteFinalizar = null;        // id que no se pudo cerrar en servidor
let _iniciando = false;
let _finalizando = false;
let _pubPantalla = null;
let _ultimoEnvioChat = 0;
let _chatChannel = null;
let _streamsPoller = null;

const _elementosRemotos = new Map();   // track.sid -> { track, el }
const _donacionesPendientes = new Map();

let _passSnapshot = null;
let _minutosRegistrados = 0;
let _fallosMinuto = 0;
let _timerMinuto = null;
let _timerBarra = null;

let anuncioActual = null;
let adSessionId = null;
let adCerrado = false;
let adRefresh = null;
let adVistaTimer = null;

let montoDonacionSeleccionado = null;
let redDonacionSeleccionada = null;
let _donacionEnCurso = false;

// ---------- UTILIDADES DOM ----------
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Crea nodos sin innerHTML: los textos entran siempre por textContent
function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs ?? {})) {
        if (v === false || v == null) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const h of hijos) if (h != null) n.append(h);
    return n;
}

function crearModal({ id, clase = 'livepass-modal', estilo, icono, titulo, texto, contenido = [] }) {
    const backdrop = el('div', { class: 'livepass-modal-backdrop', id });
    backdrop.append(el('div', { class: clase, role: 'dialog', 'aria-modal': 'true', style: estilo },
        icono ? el('span', { class: 'livepass-modal-icon', 'aria-hidden': 'true', text: icono }) : null,
        titulo ? el('div', { class: 'livepass-modal-title', text: titulo }) : null,
        texto ? el('div', { class: 'livepass-modal-text', text: texto }) : null,
        ...contenido
    ));
    document.body.append(backdrop);
    return backdrop;
}

function showToast(msg, type = '', duration = 3500) {
    let t = $('toast');
    if (!t) {
        t = el('div', { id: 'toast', class: 'toast' });
        document.body.append(t);
    }
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('show'), duration);
}

function safeUrl(u) {
    if (!u) return '';
    try {
        const url = new URL(String(u), location.origin);
        return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
    } catch { return ''; }
}

const esIdValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

function esIOS() { return /iPad|iPhone|iPod/i.test(navigator.userAgent); }
function soportaCompartirPantalla() {
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
}

function mensajeErrorCamara(e) {
    const name = e?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Permiso de cámara/micrófono denegado.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No se encontró cámara o micrófono.';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'La cámara o el micrófono están en uso por otra app.';
    return e?.message || 'Error al conectar con el servidor de video';
}

function mensajeErrorPantalla(e) {
    const name = e?.name || '';
    if (name === 'NotAllowedError' || name === 'AbortError') return 'Compartir pantalla cancelado.';
    if (name === 'NotSupportedError') return 'Compartir pantalla no es compatible con este dispositivo.';
    return mensajeErrorCamara(e);
}

function mensajeErrorServidor(code, status) {
    const mapa = {
        live_pass_invalido: 'Tu Live Pass no es válido para transmitir.',
        transmision_no_activa: 'Esta transmisión ya finalizó.',
        no_autenticado: 'Inicia sesión para continuar.',
        sesion_invalida: 'Tu sesión expiró. Vuelve a iniciar sesión.',
        streamId_invalido: 'Transmisión no válida.'
    };
    return mapa[code] || `Error de servidor${status ? ` (${status})` : ''}`;
}

// ---------- SUPABASE ----------
async function initSupabase(maxMs = 15000) {
    if (supabaseClient) return supabaseClient;
    const limite = Date.now() + maxMs;
    let espera = 200;
    while (Date.now() < limite) {
        const cliente = window.supabaseClient
            || (window.supabaseReady ? await withTimeout(window.supabaseReady, 3000).catch(() => null) : null);
        if (cliente) { supabaseClient = cliente; return cliente; }
        await sleep(espera);
        espera = Math.min(espera * 1.8, 2000);
    }
    return null;
}

async function sbOrThrow() {
    const sb = supabaseClient || await initSupabase();
    if (!sb) throw new Error('Sin conexión con el servidor');
    return sb;
}

async function getSession() {
    try {
        const sb = supabaseClient || await initSupabase();
        if (!sb) return null;
        const { data } = await sb.auth.getSession();
        return data?.session ?? null;
    } catch { return null; }
}

async function requerirSesion() {
    const s = await getSession();
    if (!s) { showToast('⚠️ Inicia sesión para continuar', 'error'); return null; }
    currentUser = s.user;
    return s;
}

async function cargarLiveKit() {
    if (!LK) LK = await import(LIVEKIT_MODULE_URL);
    return LK;
}

// ---------- TOKEN (el servidor decide sala y permisos) ----------
async function pedirTokenSala(streamId, rol) {
    const session = await getSession();
    if (!session) throw new Error('Inicia sesión para continuar');
    const r = await fetch(ENDPOINTS.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ streamId: Number(streamId), rol })
    });
    if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(mensajeErrorServidor(d.error, r.status));
    }
    const d = await r.json();
    if (!d?.token) throw new Error('Respuesta inválida del servidor');
    return { token: d.token, url: d.url || LIVEKIT_URL, canPublish: d.canPublish === true };
}

// ---------- LIVE PASS ----------
// Estados: 'ok' | 'sin_pass' | 'expirado' | 'sin_horas' | 'error' (red; NO es falta de horas)
async function consultarLivePass() {
    try {
        const sb = await sbOrThrow();
        const session = await getSession();
        if (!session) return { estado: 'error' };

        const { data, error } = await sb.rpc(RPC.puedeTransmitir, { p_usuario_id: session.user.id });
        if (error) return { estado: 'error' };

        const info = Array.isArray(data) ? data[0] : data;
        if (!info || typeof info !== 'object') return { estado: 'error' };
        if (info.puede === true) return { estado: 'ok', info };

        const razon = ['sin_live_pass', 'expirado', 'sin_horas'].includes(info.razon) ? info.razon : 'sin_live_pass';
        return { estado: razon === 'sin_live_pass' ? 'sin_pass' : razon, mensaje: info.mensaje };
    } catch { return { estado: 'error' }; }
}

function mensajePorEstadoPass(pass) {
    switch (pass.estado) {
        case 'sin_pass': return 'Necesitas un Live Pass activo para transmitir';
        case 'expirado': return 'Tu Live Pass ha expirado';
        case 'sin_horas': return 'Ya usaste todas tus horas de hoy';
        default: return pass.mensaje || 'No puedes transmitir ahora';
    }
}

function mostrarEstadoPass(pass) {
    if (pass.estado === 'error') {
        showToast('⚠️ No pudimos verificar tu Live Pass. Revisa tu conexión.', 'warning', 5000);
        return;
    }
    mostrarModalLivePass(mensajePorEstadoPass(pass));
}

function mostrarModalLivePass(mensaje) {
    $('livePassModalBackdrop')?.remove();
    const b = crearModal({
        id: 'livePassModalBackdrop',
        icono: '◉',
        titulo: "Csariel's Live Pass",
        texto: mensaje || 'Necesitas un Live Pass activo para transmitir',
        contenido: [
            el('div', { class: 'livepass-modal-benefits' },
                ...['Transmite desde 2 horas al día', 'Planes desde $300 MXN / mes',
                    'Puedes partir tus horas en el día', 'Se renuevan cada día']
                    .map((t) => el('div', { class: 'livepass-modal-benefit', text: t }))),
            el('div', { class: 'livepass-modal-actions' },
                el('button', { type: 'button', class: 'livepass-modal-btn-primary', onclick: abrirMembresiaLive, text: '◈ Ver planes Live Pass' }),
                el('button', { type: 'button', class: 'livepass-modal-btn-secondary', onclick: cerrarModalLivePass, text: 'Ahora no' }))
        ]
    });
    b.addEventListener('click', (e) => { if (e.target === b) cerrarModalLivePass(); });
}

function cerrarModalLivePass() { $('livePassModalBackdrop')?.remove(); }
function abrirMembresiaLive() { cerrarModalLivePass(); window.location.href = '/features/live/membresia-live.html'; }

function sincronizarPass(info) {
    _passSnapshot = {
        minutosRestantes: Number(info.minutos_restantes) || 0,
        minutosLimite: Number(info.minutos_limite) || 0,
        tiempo: Date.now()
    };
}

function horasTexto(info) {
    const h = Math.floor((Number(info?.minutos_restantes) || 0) / 60);
    return h > 0 ? `Tienes ${h}h disponibles hoy` : 'Tiempo disponible hoy';
}

function iniciarTimersLivePass() {
    detenerTimers();
    _minutosRegistrados = 0;
    _fallosMinuto = 0;
    _timerBarra = setInterval(actualizarBarraTiempo, 1000);
    _timerMinuto = setInterval(tickMinuto, INTERVALO_MINUTO_MS);
}

function detenerTimers() {
    clearInterval(_timerBarra);
    clearInterval(_timerMinuto);
    _timerBarra = null;
    _timerMinuto = null;
    _passSnapshot = null;
    $('livepassTimeBar')?.classList.remove('visible');
}

function actualizarBarraTiempo() {
    if (!_passSnapshot || _rol !== 'streamer') return;
    const transcurridos = Math.floor((Date.now() - _passSnapshot.tiempo) / 60000);
    const restantes = _passSnapshot.minutosRestantes - transcurridos;
    if (restantes <= 0) { finalizarPorMotivo('⏰ Se agotó tu tiempo de Live Pass por hoy'); return; }
    $('livepassTimeBar')?.classList.add('visible');
    const h = Math.floor(restantes / 60);
    const m = restantes % 60;
    const txt = $('tiempoRestante');
    if (txt) txt.textContent = h > 0 ? `${h}h ${m}m` : `${m} min`;
    const barra = $('tiempoProgress');
    if (barra && _passSnapshot.minutosLimite > 0) {
        barra.style.width = Math.max(0, Math.min(100, (restantes / _passSnapshot.minutosLimite) * 100)) + '%';
    }
}

// Un fallo de red NO corta el live; solo se corta tras MAX_FALLOS_MINUTO seguidos
async function tickMinuto() {
    if (_rol !== 'streamer' || !liveKitRoom) return;
    try {
        const session = await getSession();
        if (!session) throw new Error('sin_sesion');
        const r = await fetch(ENDPOINTS.registrarMinuto, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (r.status === 403) { finalizarPorMotivo('⏰ Tu Live Pass se agotó'); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        _fallosMinuto = 0;
        _minutosRegistrados++;
        if (_minutosRegistrados % INTERVALO_RESYNC_MINUTOS === 0) await resincronizarPass();
    } catch (e) {
        _fallosMinuto++;
        console.warn('[Live] Fallo al registrar minuto', _fallosMinuto, e?.message);
        if (_fallosMinuto === 2) showToast('⚠️ Conexión inestable con el servidor…', 'warning', 4000);
        if (_fallosMinuto >= MAX_FALLOS_MINUTO) {
            finalizarPorMotivo('⚠️ Sin conexión con el servidor. Finalizando para proteger tus horas.');
        }
    }
}

async function resincronizarPass() {
    const pass = await consultarLivePass();
    if (pass.estado === 'ok') sincronizarPass(pass.info);
    else if (pass.estado !== 'error') finalizarPorMotivo(mensajePorEstadoPass(pass));
}

function finalizarPorMotivo(mensaje) {
    if (_finalizando || _rol !== 'streamer') return;
    detenerTimers();
    showToast(mensaje, 'warning', 8000);
    finalizarTransmision({ skipConfirm: true });
}

// ---------- MODALES GENÉRICOS ----------
function confirmarAccion(mensaje, titulo = 'Confirmar') {
    return new Promise((resolve) => {
        let resuelto = false;
        const fin = (valor) => {
            if (resuelto) return;
            resuelto = true;
            backdrop.remove();
            resolve(valor);
        };
        const backdrop = crearModal({
            icono: '◈', titulo, texto: mensaje,
            contenido: [
                el('div', { class: 'livepass-modal-actions' },
                    el('button', { type: 'button', class: 'livepass-modal-btn-primary', onclick: () => fin(true), text: 'Sí, continuar' }),
                    el('button', { type: 'button', class: 'livepass-modal-btn-secondary', onclick: () => fin(false), text: 'Cancelar' }))
            ]
        });
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) fin(false); });
    });
}

function pedirDatosTransmision() {
    return new Promise((resolve) => {
        $('modalDatosTransmision')?.remove();
        let cerrado = false;
        const input = el('input', {
            id: 'inputTituloLive', type: 'text', maxlength: '80',
            value: "Mi live en Csariel's", style: INPUT_STYLE, 'aria-label': 'Título del live'
        });
        const select = el('select', { id: 'inputCategoriaLive', style: INPUT_STYLE.replace('margin-bottom:14px', 'margin-bottom:20px') },
            ...CATEGORIAS.map(([v, t]) => el('option', { value: v, text: t })));
        const errorEl = el('div', { style: 'display:none;color:var(--danger);font-size:.7rem;margin-bottom:10px;' });

        const cerrar = (datos) => {
            if (cerrado) return;
            cerrado = true;
            backdrop.remove();
            resolve(datos);
        };
        const confirmar = () => {
            const titulo = input.value.trim().slice(0, 80) || "Live en Csariel's";
            const mod = verificarContenido(titulo);
            if (mod.prohibido) {
                errorEl.textContent = `⚠️ ${mod.razon}`;
                errorEl.style.display = 'block';
                return;
            }
            const categoria = CATEGORIAS.some(([v]) => v === select.value) ? select.value : 'general';
            cerrar({ titulo, categoria });
        };

        const backdrop = crearModal({
            id: 'modalDatosTransmision', icono: '◉', titulo: 'Iniciar transmisión',
            texto: 'Personaliza tu live', estilo: 'max-width:440px;text-align:left;',
            contenido: [
                el('label', { style: LABEL_STYLE, text: 'Título' }), input, errorEl,
                el('label', { style: LABEL_STYLE, text: 'Categoría' }), select,
                el('div', { class: 'livepass-modal-actions' },
                    el('button', { type: 'button', class: 'livepass-modal-btn-primary', onclick: confirmar, text: '◉ Comenzar live' }),
                    el('button', { type: 'button', class: 'livepass-modal-btn-secondary', onclick: () => cerrar(null), text: 'Cancelar' }))
            ]
        });
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cerrar(null); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } });
        setTimeout(() => { input.focus(); input.select(); }, 100);
    });
}

// ---------- FILTRO DE CONTENIDO (UX; la moderación real va en backend) ----------
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

function normalizarTexto(t) {
    return String(t ?? '')
        .normalize('NFKC')
        .replace(/[\u200B-\u200F\u2060\uFEFF\u00AD]/g, '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[013457@$]/g, (c) => LEET[c]);
}

const PROHIBIDAS_NORM = new Set(PALABRAS_PROHIBIDAS.map(normalizarTexto));
const SPAM_IGNORADAS_NORM = new Set(PALABRAS_SPAM_IGNORADAS.map(normalizarTexto));

function verificarContenido(texto) {
    const norm = normalizarTexto(texto);
    if (!norm) return { prohibido: false };
    if (/(.)\1{11,}/.test(norm)) return { prohibido: true, razon: 'Posible spam' };

    const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);

    // Une fragmentos de una letra: "p u t a" o "p.u.t.a" cuentan como "puta"
    const fusionados = [];
    let acumulado = '';
    for (const t of tokens) {
        if (t.length === 1) { acumulado += t; continue; }
        if (acumulado) { fusionados.push(acumulado); acumulado = ''; }
        fusionados.push(t);
    }
    if (acumulado) fusionados.push(acumulado);

    if ([...tokens, ...fusionados].some((t) => PROHIBIDAS_NORM.has(t))) {
        return { prohibido: true, razon: 'Contenido inapropiado' };
    }

    const freq = new Map();
    for (const t of tokens) {
        if (t.length < 3 || SPAM_IGNORADAS_NORM.has(t)) continue;
        const n = (freq.get(t) || 0) + 1;
        freq.set(t, n);
        if (n > 5) return { prohibido: true, razon: 'Posible spam' };
    }
    return { prohibido: false };
}

// ---------- SALA LIVEKIT ----------
function registrarEventosSala(room, LKmod) {
    const { RoomEvent } = LKmod;
    room.on(RoomEvent.Disconnected, () => onSalaDesconectada(room));
    room.on(RoomEvent.TrackSubscribed, (track) => adjuntarTrackRemoto(track));
    room.on(RoomEvent.TrackUnsubscribed, (track) => quitarTrackRemoto(track));
    room.on(RoomEvent.ParticipantConnected, actualizarContadorEspectadores);
    room.on(RoomEvent.ParticipantDisconnected, actualizarContadorEspectadores);
}

function onSalaDesconectada(room) {
    // Si la sala ya no es la activa, fue salida voluntaria o reemplazo: no es un error
    if (room !== liveKitRoom) return;
    liveKitRoom = null;
    if (_rol === 'streamer') {
        showToast('⚠️ Conexión perdida. Finalizando la transmisión…', 'error', 6000);
        finalizarTransmision({ skipConfirm: true });
    } else {
        showToast('⚠️ Se perdió la conexión con el live', 'warning', 5000);
        resetearEstadoLocal();
    }
}

function actualizarContadorEspectadores() {
    if (!liveKitRoom) return;
    setContadorEspectadores(liveKitRoom.remoteParticipants.size);
}

function setContadorEspectadores(n) {
    const c = $('viewersCount');
    if (c) c.textContent = `● ${n}`;
}

function setTitulo(t) {
    const n = $('liveTitle');
    if (n) n.textContent = t;
}

// Video remoto -> #liveVideo (siempre muted); audio -> <audio> propio por track
function adjuntarTrackRemoto(track) {
    if (!track || _elementosRemotos.has(track.sid)) return;
    if (track.kind === 'video') {
        const v = $('liveVideo');
        if (!v) return;
        v.muted = true;
        track.attach(v);
        _elementosRemotos.set(track.sid, { track, el: v });
        v.play().catch(() => mostrarTocarParaReproducir());
    } else if (track.kind === 'audio') {
        const a = el('audio', { autoplay: true, playsinline: true });
        a.style.display = 'none';
        document.body.append(a);
        track.attach(a);
        _elementosRemotos.set(track.sid, { track, el: a });
        a.play().catch(() => mostrarTocarParaReproducir());
    }
}

function quitarTrackRemoto(track) {
    const entrada = _elementosRemotos.get(track.sid);
    if (!entrada) return;
    _elementosRemotos.delete(track.sid);
    try { track.detach(); } catch {}
    if (track.kind === 'audio') {
        entrada.el.remove();
    } else {
        entrada.el.srcObject = null;
        refrescarVideoRemoto();
    }
}

function refrescarVideoRemoto() {
    for (const { track, el: v } of _elementosRemotos.values()) {
        if (track.kind === 'video') { track.attach(v); return; }
    }
}

function elementosMedia() {
    return [$('liveVideo'), ...[..._elementosRemotos.values()].map((x) => x.el)].filter(Boolean);
}

function mostrarTocarParaReproducir() {
    if ($('tocarOverlay')) return;
    const cont = $('liveVideoContainer');
    if (!cont) return;
    cont.append(el('button', {
        id: 'tocarOverlay', type: 'button', 'data-action': 'reanudar-remoto',
        'aria-label': 'Reproducir transmisión con sonido',
        style: 'position:absolute;inset:0;z-index:20;background:rgba(0,0,0,.6);color:#D4AF37;border:0;cursor:pointer;font:700 1rem Orbitron,monospace;',
        text: '▶ Toca para ver y escuchar'
    }));
}

// Se llama desde un clic del usuario: los play() van sin await previo
async function reanudarMediaRemota() {
    const promesas = elementosMedia().map((m) => m.play().catch(() => {}));
    await Promise.allSettled(promesas);
    if (!elementosMedia().some((m) => m.paused)) $('tocarOverlay')?.remove();
}

function limpiarMediaRemota() {
    for (const { track, el: m } of _elementosRemotos.values()) {
        try { track.detach(); } catch {}
        if (m.tagName === 'AUDIO') m.remove();
    }
    _elementosRemotos.clear();
    const v = $('liveVideo');
    if (v) { v.srcObject = null; v.muted = true; }
    $('tocarOverlay')?.remove();
}

async function desconectarSala() {
    const room = liveKitRoom;
    liveKitRoom = null;  // al quedar null, onSalaDesconectada ignora este cierre
    if (room) {
        try {
            if (_rol === 'streamer') {
                await room.localParticipant.setCameraEnabled(false);
                await room.localParticipant.setMicrophoneEnabled(false);
            }
        } catch {}
        try { await room.disconnect(); } catch {}
    }
    limpiarMediaRemota();
    detenerGameStream();
}

function detenerGameStream() {
    if (gameScreenStream) {
        gameScreenStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        gameScreenStream = null;
    }
    _pubPantalla = null;
}

function resetearEstadoLocal() {
    detenerTimers();
    detenerRefrescoAnuncios();
    resetEstadoAnuncios();
    detenerTodosSondeos();
    cortarChat();
    limpiarChatDOM();
    _rol = 'idle';
    _modoActual = null;
    currentStreamId = null;
    setTitulo('Transmisión en vivo');
    setContadorEspectadores(0);
    aplicarRolUI('idle');
    setIconosPlay(true);
}

async function limpiarFallido(streamId) {
    await desconectarSala();
    if (streamId) {
        try {
            const sb = await sbOrThrow();
            await sb.rpc(RPC.finalizar, { p_transmision_id: streamId });
        } catch {}
    }
    resetearEstadoLocal();
}

// ---------- CREAR TRANSMISIÓN (servidor) ----------
// crear_transmision ignora p_room_name: la sala la genera el servidor
async function crearTransmisionServidor(titulo, categoria) {
    const sb = await sbOrThrow();
    const { data, error } = await sb.rpc(RPC.crear, {
        p_titulo: titulo,
        p_categoria: categoria,
        p_room_name: null,
        p_grupo_id: null
    });
    if (error) throw new Error(error.message || 'No se pudo crear la transmisión');
    const id = Number(data);
    if (!esIdValido(id)) throw new Error('No se pudo crear la transmisión');
    return id;
}

async function conectarStreamer({ streamId, modo, gameStream }) {
    const LKmod = await cargarLiveKit();
    const { Track, LocalVideoTrack, LocalAudioTrack, Room } = LKmod;

    const token = await pedirTokenSala(streamId, 'streamer');
    if (!token.canPublish) throw new Error('El servidor no autorizó transmitir');

    const room = new Room({ adaptiveStream: true, dynacast: true });
    registrarEventosSala(room, LKmod);
    await room.connect(token.url, token.token);
    liveKitRoom = room;

    if (modo === 'camara') {
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
        const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (pub?.track) pub.track.attach($('liveVideo'));
    } else {
        const vt = gameStream.getVideoTracks()[0];
        await room.localParticipant.publishTrack(new LocalVideoTrack(vt), {
            name: 'game-screen', source: Track.Source.ScreenShare
        });
        const at = gameStream.getAudioTracks()[0];
        if (at) {
            await room.localParticipant.publishTrack(new LocalAudioTrack(at), {
                name: 'game-audio', source: Track.Source.ScreenShareAudio
            });
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        const v = $('liveVideo');
        if (v) { v.srcObject = gameStream; v.muted = true; v.play().catch(() => {}); }
    }
    actualizarBotonMic(true);
}

async function activarStreamer({ streamId, titulo, modo, pass, gameStream = null }) {
    _rol = 'streamer';
    _modoActual = modo;
    currentStreamId = streamId;
    await conectarStreamer({ streamId, modo, gameStream });
    sincronizarPass(pass);
    iniciarTimersLivePass();
    setTitulo(titulo);
    aplicarRolUI('streamer');
    suscribirseAlChat(streamId);
    notificarSeguidores(streamId, titulo);  // sin await: no bloquea el inicio
    showToast(`🎥 ¡En vivo! ${horasTexto(pass)}`, 'success', 5000);
}

async function iniciarCamara() {
    if (_iniciando) return;
    if (_pendienteFinalizar) { showToast('⚠️ Cierra primero tu transmisión anterior', 'warning'); return; }
    if (_rol !== 'idle') { showToast('⚠️ Ya tienes una sesión de live activa', 'warning'); return; }
    if (!(await requerirSesion())) return;

    _iniciando = true;
    let streamId = null;
    try {
        const pass = await consultarLivePass();
        if (pass.estado !== 'ok') { mostrarEstadoPass(pass); return; }

        const datos = await pedirDatosTransmision();
        if (!datos) return;

        showToast('⏳ Iniciando transmisión…', '', 3000);
        streamId = await crearTransmisionServidor(datos.titulo, datos.categoria);
        await activarStreamer({ streamId, titulo: datos.titulo, modo: 'camara', pass: pass.info });
    } catch (e) {
        console.error('[Live] iniciarCamara', e);
        await limpiarFallido(streamId);
        showToast('❌ ' + (e.message || 'No se pudo iniciar el live'), 'error', 6000);
    } finally {
        _iniciando = false;
    }
}

// ---------- COMPARTIR PANTALLA (cámara activa) ----------
async function capturarPantalla() {
    if (_rol !== 'streamer' || !liveKitRoom) { showToast('⚠️ No estás transmitiendo', 'warning'); return; }
    if (!soportaCompartirPantalla() || esIOS()) { showToast('⚠️ Compartir pantalla no disponible aquí', 'warning'); return; }
    if (_pubPantalla) { showToast('⚠️ Ya estás compartiendo pantalla', 'warning'); return; }

    // getDisplayMedia debe ser la primera operación asíncrona (gesto del usuario)
    let ss;
    try {
        ss = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (e) {
        showToast('⚠️ ' + mensajeErrorPantalla(e), 'warning');
        return;
    }

    try {
        const LKmod = await cargarLiveKit();
        const vt = ss.getVideoTracks()[0];
        if (!vt) throw new Error('No se obtuvo la pantalla');
        _pubPantalla = await liveKitRoom.localParticipant.publishTrack(new LKmod.LocalVideoTrack(vt), {
            name: 'screen', source: LKmod.Track.Source.ScreenShare
        });
        $('screenBtn')?.classList.add('active');
        showToast('🖥️ Compartiendo pantalla', 'success');
        vt.addEventListener('ended', async () => {
            try {
                if (_pubPantalla?.track && liveKitRoom) await liveKitRoom.localParticipant.unpublishTrack(_pubPantalla.track);
            } catch {}
            _pubPantalla = null;
            $('screenBtn')?.classList.remove('active');
        });
    } catch (e) {
        ss.getTracks().forEach((t) => t.stop());
        showToast('⚠️ ' + mensajeErrorCamara(e), 'error');
    }
}

// ---------- TRANSMITIR JUEGO (pantalla completa) ----------
async function abrirSelectorJuego() {
    if (!soportaCompartirPantalla() || esIOS()) {
        showToast('⚠️ Compartir pantalla no disponible en este dispositivo', 'warning', 6000);
        return;
    }
    if (_iniciando || _pendienteFinalizar || _rol !== 'idle') {
        showToast('⚠️ Ya tienes una transmisión activa', 'warning');
        return;
    }
    if (!(await requerirSesion())) return;

    const pass = await consultarLivePass();
    if (pass.estado !== 'ok') { mostrarEstadoPass(pass); return; }

    let juegos = [];
    try {
        const sb = await sbOrThrow();
        const { data, error } = await sb.from('juegos').select('id,nombre').eq('activo', true).order('nombre');
        if (error) throw error;
        juegos = data || [];
    } catch {
        showToast('❌ No se pudieron cargar los juegos', 'error');
        return;
    }

    cerrarSelectorJuego();
    const grid = el('div', { class: 'game-grid' },
        ...(juegos.length
            ? juegos.map((j) => {
                const bt = el('button', { type: 'button', class: 'game-option', text: `◈ ${j.nombre}` });
                // Clic → iniciarJuego síncronamente: getDisplayMedia conserva el gesto
                bt.addEventListener('click', () => { cerrarSelectorJuego(); iniciarJuego(j); });
                return bt;
            })
            : [el('div', { style: 'grid-column:1/-1;padding:20px;text-align:center;', text: 'No hay juegos disponibles' })]));

    const cerrarBtn = el('button', { type: 'button', class: 'game-modal-close', 'aria-label': 'Cerrar', text: '×' });
    cerrarBtn.addEventListener('click', cerrarSelectorJuego);

    const backdrop = el('div', { class: 'game-modal-backdrop', id: 'gameSelectorModal' },
        el('div', { class: 'game-modal', role: 'dialog' },
            el('div', { class: 'game-modal-header' },
                el('div', null, el('h2', { text: '◈ ¿Qué juego vas a transmitir?' })),
                cerrarBtn),
            grid));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cerrarSelectorJuego(); });
    document.body.append(backdrop);
}

function cerrarSelectorJuego() { $('gameSelectorModal')?.remove(); }

// Sin awaits antes de getDisplayMedia para no perder el gesto del usuario
function iniciarJuego(juego) {
    if (_iniciando) return;
    if (_pendienteFinalizar || _rol !== 'idle') { showToast('⚠️ Ya tienes una transmisión activa', 'warning'); return; }
    _iniciando = true;

    (async () => {
        let capturada = null;
        try {
            capturada = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 30, max: 60 } },
                audio: true
            });
        } catch (e) {
            _iniciando = false;
            showToast('⚠️ ' + mensajeErrorPantalla(e), 'warning');
            return;
        }

        let streamId = null;
        try {
            if (!capturada.getVideoTracks()[0]) throw new Error('No se obtuvo la pantalla');
            gameScreenStream = capturada;
            capturada.getVideoTracks()[0].addEventListener('ended', onPantallaJuegoTerminada);

            const pass = await consultarLivePass();
            if (pass.estado !== 'ok') throw new Error(mensajePorEstadoPass(pass));

            const nombre = String(juego?.nombre || 'Juego');
            const titulo = `◈ Jugando ${nombre}`.slice(0, 80);
            if (verificarContenido(titulo).prohibido) throw new Error('Título bloqueado por filtro de contenido');

            showToast('⏳ Iniciando transmisión…', '', 3000);
            streamId = await crearTransmisionServidor(titulo, 'gaming');
            await activarStreamer({ streamId, titulo, modo: 'juego', pass: pass.info, gameStream: capturada });
        } catch (e) {
            console.error('[Live] iniciarJuego', e);
            await limpiarFallido(streamId);
            detenerGameStream();
            showToast('✕ ' + (e.message || 'No se pudo iniciar el juego'), 'error', 6000);
        } finally {
            _iniciando = false;
        }
    })();
}

// Si el usuario deja de compartir la pantalla del juego, el live se cierra
function onPantallaJuegoTerminada() {
    if (_rol !== 'streamer' || _modoActual !== 'juego' || !liveKitRoom) return;
    showToast('⚠️ Se detuvo la pantalla compartida. Finalizando el live…', 'warning', 6000);
    finalizarTransmision({ skipConfirm: true });
}

// ---------- FINALIZAR / SALIR ----------
async function finalizarTransmision({ skipConfirm = false } = {}) {
    if (_finalizando) return;
    const id = _pendienteFinalizar || (_rol === 'streamer' ? currentStreamId : null);
    if (!id) { showToast('⚠️ No hay transmisión activa', 'warning'); return; }

    if (!skipConfirm) {
        const ok = await confirmarAccion('¿Finalizar la transmisión para todos los espectadores?', 'Finalizar live');
        if (!ok) return;
    }

    _finalizando = true;
    try {
        _pendienteFinalizar = id;
        detenerTimers();
        await desconectarSala();
        const sb = await sbOrThrow();
        const { error } = await sb.rpc(RPC.finalizar, { p_transmision_id: id });
        // Si ya estaba finalizada en servidor, el objetivo se cumple igual
        if (error && !/finaliz/i.test(error.message || '')) throw error;
        _pendienteFinalizar = null;
        resetearEstadoLocal();
        showToast('✅ Transmisión finalizada', 'success');
    } catch (e) {
        console.error('[Live] finalizar', e);
        showToast('❌ No se pudo cerrar en el servidor. Pulsa Finalizar otra vez.', 'error', 7000);
    } finally {
        _finalizando = false;
    }
}

async function salirDeTransmision({ skipConfirm = false } = {}) {
    if (!skipConfirm) {
        const ok = await confirmarAccion('¿Salir de la transmisión?', 'Salir del live');
        if (!ok) return;
    }
    await desconectarSala();
    resetearEstadoLocal();
    showToast('📺 Saliste de la transmisión', 'success', 3000);
}

function accionBotonFinal() {
    if (_rol === 'streamer' || _pendienteFinalizar) return finalizarTransmision();
    if (_rol === 'viewer') return salirDeTransmision();
    showToast('⚠️ No hay transmisión activa', 'warning');
}

// ---------- UNIRSE COMO ESPECTADOR ----------
async function cargarFila(id) {
    const sb = await sbOrThrow();
    const { data, error } = await sb.from('transmisiones').select(COLUMNAS_FILA).eq('id', id).maybeSingle();
    if (error) throw new Error('No se pudo cargar la transmisión');
    return data;
}

async function unirseATransmision(streamId) {
    const id = Number(streamId);
    if (_iniciando || _finalizando) return;
    if (!esIdValido(id)) return;
    if (!(await requerirSesion())) return;
    if (_rol === 'streamer' || _pendienteFinalizar) {
        showToast('⚠️ Tienes tu propio live activo. Finalízalo antes de unirte a otro.', 'warning', 6000);
        return;
    }
    if (_rol === 'viewer' && currentStreamId === id) return;

    _iniciando = true;
    try {
        if (_rol === 'viewer') resetearEstadoLocal();
        showToast('⏳ Uniéndose…', '', 2000);

        const fila = await cargarFila(id);
        if (!fila) throw new Error('Transmisión no encontrada');
        if (fila.estado !== 'en_vivo') throw new Error('Esta transmisión ya finalizó');

        const token = await pedirTokenSala(id, 'viewer');
        const LKmod = await cargarLiveKit();
        const room = new LKmod.Room({ adaptiveStream: true, dynacast: true });
        registrarEventosSala(room, LKmod);
        await room.connect(token.url, token.token);
        liveKitRoom = room;

        _rol = 'viewer';
        currentStreamId = id;
        setTitulo(fila.titulo || 'EN VIVO');

        room.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
                if (pub.track && pub.isSubscribed) adjuntarTrackRemoto(pub.track);
            });
        });
        actualizarContadorEspectadores();

        aplicarRolUI('viewer');
        suscribirseAlChat(id);
        resetEstadoAnuncios();
        iniciarRefrescoAnuncios();
        showToast('📺 Conectado', 'success', 2000);
    } catch (e) {
        console.error('[Live] unirse', e);
        await desconectarSala();
        resetearEstadoLocal();
        showToast('❌ ' + (e.message || 'No se pudo unir al live'), 'error', 5000);
    } finally {
        _iniciando = false;
    }
}

// ---------- CONTROLES ----------
function setIconosPlay(reproduciendo) {
    const p = $('playIcon'), a = $('pauseIcon'), b = $('pauseIcon2');
    if (p) p.style.display = reproduciendo ? 'none' : '';
    if (a) a.style.display = reproduciendo ? '' : 'none';
    if (b) b.style.display = reproduciendo ? '' : 'none';
}

function togglePlay() {
    const medios = elementosMedia();
    if (!medios.length) return;
    const todosPausados = medios.every((m) => m.paused);
    if (todosPausados) reanudarMediaRemota();
    else medios.forEach((m) => m.pause());
    setIconosPlay(todosPausados);
}

async function toggleMute() {
    if (_rol !== 'streamer' || !liveKitRoom) { showToast('⚠️ No estás transmitiendo', 'warning'); return; }
    try {
        const encendido = liveKitRoom.localParticipant.isMicrophoneEnabled;
        await liveKitRoom.localParticipant.setMicrophoneEnabled(!encendido);
        actualizarBotonMic(!encendido);
        showToast(!encendido ? '🎤 Micrófono activado' : '🎤 Micrófono silenciado', 'success', 2000);
    } catch (e) {
        showToast('❌ ' + mensajeErrorCamara(e), 'error');
    }
}

function actualizarBotonMic(encendido) {
    const b = $('muteBtn');
    if (b) {
        b.classList.toggle('muted', !encendido);
        b.setAttribute('aria-label', encendido ? 'Silenciar micrófono' : 'Activar micrófono');
    }
    const linea = $('muteLine');
    if (linea) linea.style.display = encendido ? 'none' : '';
}

// Muestra solo los controles del rol. El servidor igual rechaza lo que no toca.
function aplicarRolUI(rol) {
    const mostrar = (id, visible) => { const n = $(id); if (n) n.style.display = visible ? '' : 'none'; };
    const esStreamer = rol === 'streamer';
    const esViewer = rol === 'viewer';
    const puedeCompartir = soportaCompartirPantalla() && !esIOS();

    mostrar('btnIniciarLive', rol === 'idle');
    mostrar('muteBtn', esStreamer);
    mostrar('screenBtn', esStreamer && puedeCompartir);
    mostrar('gameBtn', esStreamer && puedeCompartir && _modoActual !== 'juego');
    mostrar('endBtn', esStreamer || esViewer);

    const fin = $('endBtn');
    if (fin) {
        const etiqueta = esStreamer ? 'Finalizar transmisión' : 'Salir del live';
        fin.title = etiqueta;
        fin.setAttribute('aria-label', etiqueta);
    }
    document.querySelector('.donaciones-rapidas')?.style.setProperty('display', esViewer ? 'flex' : 'none');

    const chatInput = $('chatInput');
    if (chatInput) chatInput.disabled = rol === 'idle';
    const chatBtn = document.querySelector('[data-action="enviar-mensaje"]');
    if (chatBtn) chatBtn.disabled = rol === 'idle';

    if (!esViewer) $('marketingAdContainer')?.classList.remove('visible');
}

// ---------- LISTADO ----------
async function cargarTransmisionesActivas() {
    try {
        const sb = await sbOrThrow();
        const { data, error } = await sb.from('transmisiones')
            .select(COLUMNAS_LISTADO)
            .eq('estado', 'en_vivo')
            .eq('is_live', true)
            .is('grupo_id', null)
            .order('fecha_inicio', { ascending: false })
            .limit(50);
        if (error) throw error;
        renderizarTransmisiones(data);
    } catch (e) {
        console.error('[Live] listado', e);
    }
}

function renderizarTransmisiones(lista) {
    const cont = $('streamsList');
    if (!cont) return;
    cont.replaceChildren();
    if (!lista?.length) {
        cont.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1;padding:20px;' },
            el('span', { class: 'icon', 'aria-hidden': 'true', text: '◉' }),
            el('h3', { text: 'Sin transmisiones activas' }),
            el('p', { text: 'Sé el primero en iniciar una' })));
        return;
    }
    for (const s of lista) {
        const mins = s.fecha_inicio ? Math.max(0, Math.floor((Date.now() - new Date(s.fecha_inicio)) / 60000)) : 0;
        const dur = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
        const card = el('div', { class: 'stream-card', role: 'button', tabindex: '0', 'data-stream-id': s.id },
            el('div', { class: 'stream-thumb' },
                el('span', { style: 'font-size:2rem;', text: '◉' }),
                el('span', { class: 'live-badge', text: '● EN VIVO' })),
            el('div', { class: 'stream-name', text: s.titulo || 'Live' }),
            el('div', { class: 'stream-host', text: `${s.categoria || 'General'} · ${Number(s.viewers_count) || 0} espectadores · ${dur}` }));
        card.addEventListener('click', () => unirseATransmision(s.id));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') unirseATransmision(s.id); });
        cont.append(card);
    }
}

// ---------- CHAT ----------
function suscribirseAlChat(streamId) {
    cortarChat();
    if (!supabaseClient) return;
    _chatChannel = supabaseClient
        .channel(`live-chat-${streamId}`)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'mensajes_live',
            filter: `transmision_id=eq.${streamId}`
        }, (payload) => agregarMensajeAlChat(payload.new))
        .subscribe();
}

function cortarChat() {
    if (_chatChannel && supabaseClient) {
        try { supabaseClient.removeChannel(_chatChannel); } catch {}
    }
    _chatChannel = null;
}

function limpiarChatDOM() {
    const cont = $('chatMessages');
    if (!cont) return;
    cont.replaceChildren();
    const c = $('chatCount');
    if (c) c.textContent = '0 mensajes';
}

function agregarMensajeAlChat(m) {
    const cont = $('chatMessages');
    if (!cont) return;
    const cerca = cont.scrollHeight - cont.scrollTop - cont.clientHeight < 80;
    const nombre = String(m.nombre_usuario || 'Explorador').slice(0, 40);
    const hora = (m.creado_en ? new Date(m.creado_en) : new Date()).toLocaleTimeString();

    cont.append(el('div', { class: 'chat-msg' },
        el('div', { class: 'avatar', text: nombre.charAt(0).toUpperCase() }),
        el('div', { class: 'msg' },
            el('span', { class: 'name', text: nombre }),
            el('span', { class: 'time', text: hora }),
            el('div', { class: 'text', text: String(m.mensaje ?? '') }))));

    const nodos = cont.querySelectorAll('.chat-msg');
    for (let i = 0; i < nodos.length - MAX_MENSAJES_DOM; i++) nodos[i].remove();

    if (cerca) cont.scrollTop = cont.scrollHeight;
    const c = $('chatCount');
    if (c) c.textContent = `${cont.querySelectorAll('.chat-msg').length} mensajes`;
}

async function enviarMensaje() {
    const input = $('chatInput');
    if (!input) return;
    const texto = input.value.trim().slice(0, 500);
    if (!texto) return;
    if (_rol === 'idle' || !currentStreamId) { showToast('⚠️ Entra a un live para escribir', 'warning'); return; }
    if (Date.now() - _ultimoEnvioChat < COOLDOWN_CHAT_MS) {
        showToast('⏳ Espera un momento antes de enviar otro mensaje', 'warning', 2000);
        return;
    }
    const mod = verificarContenido(texto);
    if (mod.prohibido) { showToast(`⚠️ ${mod.razon}`, 'warning'); return; }

    try {
        const sb = await sbOrThrow();
        _ultimoEnvioChat = Date.now();
        // autor, nombre y fecha los fija el trigger del servidor
        const { error } = await sb.from('mensajes_live').insert({ transmision_id: currentStreamId, mensaje: texto });
        if (error) throw error;
        input.value = '';
    } catch (e) {
        console.error('[Live] enviar mensaje', e);
        showToast('❌ No se pudo enviar. Tu mensaje sigue escrito.', 'error');
    }
}

// ---------- NOTIFICACIONES (el servidor deduce al streamer desde el token) ----------
async function notificarSeguidores(streamId, titulo) {
    try {
        const session = await getSession();
        if (!session) return;
        await fetch(ENDPOINTS.broadcast, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ stream_id: streamId, titulo })
        });
    } catch {}
}

// ---------- DONACIONES ----------
function abrirModalDonacion() {
    if (_rol !== 'viewer' || !currentStreamId) { showToast('⚠️ Entra a un live para donar', 'warning'); return; }
    montoDonacionSeleccionado = null;
    redDonacionSeleccionada = null;
    $('donacionModalBackdrop')?.remove();

    const botonesMonto = Object.keys(DONACIONES).map((m) =>
        el('button', { type: 'button', class: 'btn-donacion', 'data-action': 'monto-donacion', 'data-monto': m,
            'aria-pressed': 'false', style: 'min-width:60px;padding:10px 12px;' },
            el('span', { class: 'monto', text: `$${m}` })));

    const botonesRed = REDES_DONACION.map((r) =>
        el('button', { type: 'button', class: 'btn-donacion', 'data-action': 'red-donacion', 'data-red': r.id,
            'aria-pressed': 'false', style: 'text-align:left;padding:10px 14px;' },
            el('span', { style: 'font-size:.75rem;', text: r.label })));

    const b = crearModal({
        id: 'donacionModalBackdrop', icono: '◆', titulo: 'Donar al streamer',
        texto: 'Elige el monto y la red', estilo: 'max-width:520px;',
        contenido: [
            el('div', { style: 'margin-bottom:16px;' },
                el('label', { style: LABEL_STYLE, text: 'Monto (USD)' }),
                el('div', { id: 'donacionMontos', style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;' }, ...botonesMonto)),
            el('div', { style: 'margin-bottom:16px;' },
                el('label', { style: LABEL_STYLE, text: 'Red' }),
                el('div', { id: 'donacionRedes', style: 'display:flex;flex-direction:column;gap:6px;' }, ...botonesRed)),
            el('div', { class: 'livepass-modal-actions' },
                el('button', { type: 'button', id: 'btnConfirmarDonacion', class: 'livepass-modal-btn-primary',
                    'data-action': 'confirmar-donacion', disabled: true, text: '◆ Donar' }),
                el('button', { type: 'button', class: 'livepass-modal-btn-secondary',
                    'data-action': 'cerrar-donacion', text: 'Cancelar' }))
        ]
    });
    b.addEventListener('click', (e) => { if (e.target === b) cerrarModalDonacion(); });
}

function cerrarModalDonacion() { $('donacionModalBackdrop')?.remove(); }

function seleccionarMontoDonacion(monto) {
    if (!Object.prototype.hasOwnProperty.call(DONACIONES, String(monto))) {
        showToast('⚠️ Monto no válido', 'error');
        return;
    }
    montoDonacionSeleccionado = Number(monto);
    document.querySelectorAll('#donacionMontos .btn-donacion').forEach((b) => {
        const sel = Number(b.dataset.monto) === montoDonacionSeleccionado;
        b.style.borderColor = sel ? 'var(--gold)' : 'rgba(255,255,255,0.06)';
        b.style.background = sel ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.02)';
        b.setAttribute('aria-pressed', String(sel));
    });
    actualizarBotonDonacion();
}

function seleccionarRedDonacion(redId) {
    if (!REDES_DONACION.some((r) => r.id === redId)) { showToast('⚠️ Red no válida', 'error'); return; }
    redDonacionSeleccionada = redId;
    document.querySelectorAll('#donacionRedes .btn-donacion').forEach((b) => {
        const sel = b.dataset.red === redId;
        b.style.borderColor = sel ? 'var(--gold)' : 'rgba(255,255,255,0.06)';
        b.style.background = sel ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.02)';
        b.setAttribute('aria-pressed', String(sel));
    });
    actualizarBotonDonacion();
}

function actualizarBotonDonacion() {
    const btn = $('btnConfirmarDonacion');
    if (btn) btn.disabled = !(montoDonacionSeleccionado && redDonacionSeleccionada) || _donacionEnCurso;
}

// El enlace de pago es un <a> que toca el usuario: ningún navegador lo bloquea
function mostrarEnlacePago(url) {
    $('pagoModalBackdrop')?.remove();
    const b = crearModal({
        id: 'pagoModalBackdrop', icono: '◆', titulo: 'Pago listo',
        texto: 'Toca el botón para completar tu donación. Se confirmará automáticamente.',
        contenido: [
            el('div', { class: 'livepass-modal-actions' },
                el('a', { class: 'livepass-modal-btn-primary',
                    style: 'display:block;text-decoration:none;text-align:center;',
                    href: url, target: '_blank', rel: 'noopener noreferrer', text: 'Abrir pago' }),
                el('button', { type: 'button', class: 'livepass-modal-btn-secondary',
                    onclick: () => $('pagoModalBackdrop')?.remove(), text: 'Cerrar' }))
        ]
    });
    b.addEventListener('click', (e) => { if (e.target === b) b.remove(); });
}

async function confirmarDonacion() {
    if (_donacionEnCurso) return;
    if (_rol !== 'viewer' || !currentStreamId) { showToast('⚠️ Entra a un live para donar', 'warning'); return; }
    if (!Object.prototype.hasOwnProperty.call(DONACIONES, String(montoDonacionSeleccionado))) { showToast('⚠️ Monto no válido', 'error'); return; }
    if (!REDES_DONACION.some((r) => r.id === redDonacionSeleccionada)) { showToast('⚠️ Red no válida', 'error'); return; }

    const btn = $('btnConfirmarDonacion');
    _donacionEnCurso = true;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Procesando…'; }

    try {
        const session = await getSession();
        if (!session) throw new Error('Inicia sesión para donar');
        const r = await fetch(ENDPOINTS.donacionCrear, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
                transmision_id: currentStreamId,
                monto_usd: montoDonacionSeleccionado,
                pay_currency: redDonacionSeleccionada
            })
        });
        if (r.status !== 201) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || 'No se pudo crear la donación');
        }
        const d = await r.json();
        const urlPago = safeUrl(d.payment_url);
        if (!urlPago || !d.donacion_id) throw new Error('Respuesta inválida del servidor');

        cerrarModalDonacion();
        mostrarEnlacePago(urlPago);
        showToast('⏳ Esperando confirmación del pago…', 'warning', 6000);
        iniciarSondeoDonacion(d.donacion_id, montoDonacionSeleccionado);
    } catch (e) {
        console.error('[Live] donación', e);
        showToast('❌ ' + (e.message || 'Error al crear la donación'), 'error', 6000);
    } finally {
        _donacionEnCurso = false;
        const b2 = $('btnConfirmarDonacion');
        if (b2) { b2.textContent = '◆ Donar'; actualizarBotonDonacion(); }
    }
}

function iniciarSondeoDonacion(donacionId, monto) {
    detenerSondeoDonacion(donacionId);
    const inicio = Date.now();
    const timer = setInterval(async () => {
        if (Date.now() - inicio > TIMEOUT_DONACION_MS) {
            detenerSondeoDonacion(donacionId);
            showToast('⏰ Tiempo de espera agotado. Si ya pagaste, se confirmará en breve.', 'warning', 8000);
            return;
        }
        try {
            const session = await getSession();
            if (!session) return;
            const r = await fetch(ENDPOINTS.donacionEstado(donacionId), {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            if (!r.ok) return;
            const d = await r.json();
            if (d.estado === 'pagada') {
                detenerSondeoDonacion(donacionId);
                mostrarEfectoDonacion(monto, d.donador_nombre);
                showToast(`🎉 ¡Donación de $${monto} confirmada!`, 'success', 6000);
            } else if (d.estado === 'fallida') {
                detenerSondeoDonacion(donacionId);
                showToast('❌ La donación falló', 'error', 6000);
            }
        } catch {}
    }, INTERVALO_SONDEO_MS);
    _donacionesPendientes.set(donacionId, { timer });
}

function detenerSondeoDonacion(id) {
    const e = _donacionesPendientes.get(id);
    if (e) { clearInterval(e.timer); _donacionesPendientes.delete(id); }
}

function detenerTodosSondeos() {
    for (const id of [..._donacionesPendientes.keys()]) detenerSondeoDonacion(id);
}

function mostrarEfectoDonacion(monto, nombreDonador) {
    const d = DONACIONES[monto];
    const cont = $('liveVideoContainer');
    if (!d || !cont) return;
    const color = COLOR_HEX_RE.test(d.color) ? d.color : '#D4AF37';
    const textoColor = el('div', { style: 'font-size:1.5rem;', text: `${String(nombreDonador || 'Alguien').slice(0, 40)} donó $${monto}` });
    textoColor.style.color = color;
    const overlay = el('div', {
        style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:10;pointer-events:none;'
    }, el('div', { style: 'text-align:center;' },
        el('div', { style: 'font-size:8rem;', text: d.emoji }),
        textoColor));
    cont.append(overlay);
    setTimeout(() => overlay.remove(), d.duracion + 500);
}

// ---------- ANUNCIOS (solo espectadores) ----------
function resetEstadoAnuncios() {
    adCerrado = false;
    anuncioActual = null;
    adSessionId = null;
    clearTimeout(adVistaTimer);
    adVistaTimer = null;
    $('marketingAdContainer')?.classList.remove('visible');
}

function getOrCreateAdSessionId() {
    if (!adSessionId) adSessionId = `ads_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return adSessionId;
}

function cerrarAnuncio() {
    adCerrado = true;
    anuncioActual = null;
    $('marketingAdContainer')?.classList.remove('visible');
}

async function cargarAnuncioLive() {
    if (_rol !== 'viewer' || !currentStreamId || adCerrado) return;
    const session = await getSession();
    if (!session) return;
    try {
        const r = await fetch(ENDPOINTS.anuncioGet, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ target_tipo: 'live', target_id: currentStreamId, session_id: getOrCreateAdSessionId() })
        });
        if (!r.ok) return;
        const d = await r.json();
        if (!d?.success || !d.ad) return;
        anuncioActual = d.ad;
        renderAnuncio(d.ad);
        clearTimeout(adVistaTimer);
        adVistaTimer = setTimeout(() => registrarEventoAnuncio('vista'), 3000);
    } catch (e) {
        console.error('[Live] anuncio', e);
    }
}

function renderAnuncio(ad) {
    const media = $('marketingAdMedia');
    if (!media) return;
    media.replaceChildren();
    const img = safeUrl(ad.imagen_url);
    const vid = safeUrl(ad.video_url);
    if (img) media.append(el('img', { src: img, alt: String(ad.titulo || 'Anuncio').slice(0, 80), loading: 'lazy' }));
    else if (vid) media.append(el('video', { src: vid, muted: true, autoplay: true, loop: true, playsinline: true }));
    else media.append(el('span', { text: '◈' }));

    $('marketingAdTitle').textContent = ad.titulo || 'Patrocinado';
    const desc = $('marketingAdDesc');
    desc.textContent = ad.descripcion || '';
    desc.style.display = ad.descripcion ? 'block' : 'none';
    $('marketingAdCta').textContent = ad.cta_texto || 'Ver más';
    $('marketingAdContainer').classList.add('visible');
}

async function registrarEventoAnuncio(evento) {
    const ad = anuncioActual;
    if (!ad) return;
    try {
        const session = await getSession();
        if (!session) return;
        await fetch(ENDPOINTS.anuncioEvento, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
                ad_id: ad.id, campaign_id: ad.campaign_id,
                target_tipo: 'live', target_id: currentStreamId,
                evento, session_id: getOrCreateAdSessionId()
            })
        });
    } catch {}
}

// Sin awaits antes de window.open: el gesto del usuario sigue activo
function registrarClicAnuncio() {
    const ad = anuncioActual;
    if (!ad) return;
    const destino = safeUrl(ad.cta_url || ad.link_destino);
    if (destino) window.open(destino, '_blank', 'noopener,noreferrer');
    registrarEventoAnuncio('clic');
}

function iniciarRefrescoAnuncios() {
    clearInterval(adRefresh);
    cargarAnuncioLive();
    adRefresh = setInterval(() => {
        if (_rol === 'viewer' && currentStreamId && !adCerrado) cargarAnuncioLive();
    }, 30000);
}

function detenerRefrescoAnuncios() {
    clearInterval(adRefresh);
    adRefresh = null;
    clearTimeout(adVistaTimer);
    adVistaTimer = null;
}

// ---------- ESTADÍSTICAS (solo las propias) ----------
async function cargarEstadisticas() {
    const session = await getSession();
    if (!session) { showToast('⚠️ Inicia sesión', 'error'); return; }
    try {
        const sb = await sbOrThrow();
        const { data, error } = await sb.from('transmisiones')
            .select('fecha_inicio,fecha_fin,viewers_count')
            .eq('streamer_id', session.user.id)
            .is('grupo_id', null)
            .order('fecha_inicio', { ascending: false })
            .limit(500);
        if (error || !data?.length) { showToast('◈ Sin estadísticas aún', 'warning'); return; }
        const segundos = data.reduce((a, s) => {
            if (!s.fecha_inicio || !s.fecha_fin) return a;
            const d = (new Date(s.fecha_fin) - new Date(s.fecha_inicio)) / 1000;
            return a + (d > 0 ? d : 0);
        }, 0);
        const espectadores = data.reduce((a, s) => a + (Number(s.viewers_count) || 0), 0);
        showToast(`◈ Transmisiones: ${data.length} · Horas: ${(segundos / 3600).toFixed(1)}h · Espectadores: ${espectadores}`, 'success', 6000);
    } catch {
        showToast('❌ No se pudieron cargar las estadísticas', 'error');
    }
}

// ---------- DELEGACIÓN DE EVENTOS (sin onclick inline) ----------
const ACCIONES = new Map([
    ['iniciar-live', () => iniciarCamara()],
    ['ver-todas', () => cargarTransmisionesActivas()],
    ['estadisticas', () => cargarEstadisticas()],
    ['mi-livepass', () => abrirMembresiaLive()],
    ['abrir-membresia', () => abrirMembresiaLive()],
    ['cerrar-livepass-modal', () => cerrarModalLivePass()],
    ['toggle-play', () => togglePlay()],
    ['toggle-mute', () => toggleMute()],
    ['capturar-pantalla', () => capturarPantalla()],
    ['selector-juego', () => abrirSelectorJuego()],
    ['cerrar-selector-juego', () => cerrarSelectorJuego()],
    ['finalizar-live', () => accionBotonFinal()],
    ['reanudar-remoto', () => reanudarMediaRemota()],
    ['cerrar-anuncio', () => cerrarAnuncio()],
    ['clic-anuncio', () => registrarClicAnuncio()],
    ['abrir-donacion', () => abrirModalDonacion()],
    ['monto-donacion', (btn) => seleccionarMontoDonacion(Number(btn.dataset.monto))],
    ['red-donacion', (btn) => seleccionarRedDonacion(btn.dataset.red)],
    ['confirmar-donacion', () => confirmarDonacion()],
    ['cerrar-donacion', () => cerrarModalDonacion()],
    ['enviar-mensaje', () => enviarMensaje()]
]);

document.addEventListener('click', (e) => {
    const target = e.target.closest?.('[data-action]');
    if (!target) return;
    const fn = ACCIONES.get(target.dataset.action);
    if (!fn) return;
    e.preventDefault();
    try {
        const r = fn(target);
        if (r && typeof r.catch === 'function') {
            r.catch((err) => {
                console.error('[Live] acción', target.dataset.action, err);
                showToast('❌ Algo salió mal. Intenta de nuevo.', 'error');
            });
        }
    } catch (err) {
        console.error('[Live] acción', target.dataset.action, err);
    }
});

// ---------- INICIALIZACIÓN ----------
document.addEventListener('DOMContentLoaded', async () => {
    const sb = await initSupabase(15000);
    if (!sb) {
        showToast('❌ Error de conexión con el servidor', 'error', 6000);
        return;
    }

    const session = await getSession();
    currentUser = session?.user ?? null;
    if (!session) showToast('⚠️ Inicia sesión para transmitir o ver lives', 'warning');

    aplicarRolUI('idle');
    setIconosPlay(!($('liveVideo')?.paused ?? true));
    cargarTransmisionesActivas();
    _streamsPoller = setInterval(cargarTransmisionesActivas, 30000);

    $('chatInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); enviarMensaje(); }
    });

    // Si cierran sesión, la sala se cierra y no se conserva acceso
    sb.auth.onAuthStateChange((evento, s) => {
        currentUser = s?.user ?? null;
        if (!s && _rol !== 'idle') {
            desconectarSala().then(resetearEstadoLocal);
        }
    });

    setTimeout(async () => {
        try { if (typeof window.inicializarIdiomas === 'function') await window.inicializarIdiomas(); } catch {}
    }, 500);
});

// Salir de la página: cierre best-effort de la sala
window.addEventListener('pagehide', () => { desconectarSala(); });

// ---------- API PÚBLICA MÍNIMA ----------
window.LiveApp = {
    iniciarTransmisionGeneral: iniciarCamara,
    unirseATransmision,
    cargarTransmisionesActivas,
    showToast,
    mostrarModalLivePass,
    cerrarModalLivePass,
    abrirMembresiaLive
};