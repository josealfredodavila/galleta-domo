// ================================================================
// MENSAJES · CORE v2.3 · MÓDULO 1 DE 8
// Ruta: backend/public/features/mensajes/js/mensajes-core.js
// Contenido: constantes, estado compartido, helpers de texto y de
//            tiempo, estados monotónicos, toast, modal propio
//            (NeonModal), sesión, subida de archivos, presencia y
//            perfiles, envío idempotente de mensajes.
// Cambios v2.3 (C-PME incremental):
//  - Estados monotónicos: pendiente -> enviado -> entregado -> leido.
//    Nunca retroceden (avanzarEstado / fusionarMensaje).
//  - Horas visibles: formatearHora / formatearFechaHora en la hora
//    local del usuario; resumenTiempos para envío, entrega y visto.
//  - Idempotencia en sesión: clientMessageId único por envío. Un
//    reintento con el mismo id no vuelve a llamar a la RPC durante
//    60 s. La RPC aún no recibe el id (ver nota en enviarMensajeChat).
//  - Presencia separada del perfil: presenciaDePerfil(id) usa su
//    propia caché con TTL corto (20 s). profile(id) y
//    cargarPerfilRemoto(id) conservan su contrato.
// Cambios v2.2: deduplicación de perfiles en vuelo; NeonModal limpia
//               su listener de teclado en cada cierre.
// Cambios v2.1: profile() con perfiles_por_ids; TTL corto sin datos.
// Cambios v2.0: sin emojis en textos; toast accesible; NeonModal sin
//               icono por defecto.
// ================================================================

'use strict';

const BOT_ID = 'bot-marquinhos';
const BOT_UUID = '0a000000-0000-4000-8000-000000000001';
const ESTADOS_BUCKET = 'sariels-estados';
const BOT_MAX_HISTORY = 6;
const PERFIL_CACHE_LIMITE = 500;
const ESTADOS_TTL_MS = 24 * 60 * 60 * 1000;

let db = null;
let user = null;
let current = null;
let msgChannel = null;
let callChannel = null;

let isUserAtBottom = true;
let unreadCount = 0;
const SCROLL_THRESHOLD = 100;
let scrollRetryTimer = null;

let currentUserProfile = null;

const perfilCache = new Map();
const perfilEnVuelo = new Map();
const TTL_PERFIL_MS = 5 * 60 * 1000;
const TTL_PERFIL_FALLBACK_MS = 30 * 1000;
const signedCache = new Map();
const TTL_SIGNED_MS = 50 * 60 * 1000;

// Presencia: caché propia, con TTL corto e independiente de los datos estáticos.
const presenciaCache = new Map();
const TTL_PRESENCIA_MS = 20 * 1000;

// Idempotencia en sesión: clientMessageId -> { ts, promesa }
const envioEnCurso = new Map();
const TTL_ENVIO_ID_MS = 60 * 1000;

// Control de markRead en lote (1 vez cada 2 s por conversación)
const markReadTimestamps = new Map();
const MARK_READ_DEBOUNCE_MS = 2000;

// Caché del resumen de Marquinhos (último mensaje y badge)
let botResumenCache = { ts: 0, ultimo: null, noLeidos: 0 };
const BOT_RESUMEN_TTL_MS = 30000;

window.__livekitReady = !!window.LivekitClient;

const $ = id => document.getElementById(id);

function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

/* ---------------- Estados monotónicos ---------------- */

/* Orden de avance de un mensaje. Un estado nunca retrocede. */
const ESTADO_MENSAJE = {
    PENDIENTE: 'pendiente',
    ENVIADO: 'enviado',
    ENTREGADO: 'entregado',
    LEIDO: 'leido'
};

const RANGO_ESTADO = {
    pendiente: 0,
    enviado: 1,
    entregado: 2,
    leido: 3
};

function rangoEstado(estado) {
    return Object.prototype.hasOwnProperty.call(RANGO_ESTADO, estado) ? RANGO_ESTADO[estado] : -1;
}

/* Devuelve el estado más avanzado entre el actual y el nuevo. */
function avanzarEstado(actual, nuevo) {
    const base = actual || ESTADO_MENSAJE.PENDIENTE;
    return rangoEstado(nuevo) > rangoEstado(base) ? nuevo : base;
}

/* Estado derivado de las marcas que trae el mensaje (si existen en la BD). */
function estadoDeMensaje(m) {
    if (!m) return ESTADO_MENSAJE.PENDIENTE;
    if (m.leido_at) return ESTADO_MENSAJE.LEIDO;
    if (m.entregado_at) return ESTADO_MENSAJE.ENTREGADO;
    if (m.id) return ESTADO_MENSAJE.ENVIADO;
    return ESTADO_MENSAJE.PENDIENTE;
}

/* Combina un mensaje ya conocido con una actualización (realtime o consulta).
   No pierde marcas de tiempo conocidas y nunca retrocede el estado. */
function fusionarMensaje(existente, nuevo) {
    if (!existente) {
        return Object.assign({}, nuevo, { estado: estadoDeMensaje(nuevo) });
    }

    const fusion = Object.assign({}, existente, nuevo);
    fusion.created_at = nuevo.created_at || existente.created_at || null;
    fusion.entregado_at = nuevo.entregado_at || existente.entregado_at || null;
    fusion.leido_at = nuevo.leido_at || existente.leido_at || null;
    fusion.estado = avanzarEstado(
        existente.estado || estadoDeMensaje(existente),
        estadoDeMensaje(fusion)
    );
    return fusion;
}

/* ---------------- Tiempo: lectura y formato local ---------------- */

/* Convierte un valor de la BD (ISO con o sin zona) en Date. Null si no es válido. */
function fechaIso(valor) {
    if (!valor) return null;
    let t = String(valor).trim();
    if (!t) return null;
    t = t.replace(' ', 'T');
    if (/[+-]\d{2}$/.test(t)) t += ':00';
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(t)) t += 'Z';
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
}

/* Hora local del usuario, por ejemplo "10:32". */
function formatearHora(valor) {
    const d = fechaIso(valor);
    if (!d) return '';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* Fecha y hora local, por ejemplo "27 nov, 10:32". */
function formatearFechaHora(valor) {
    const d = fechaIso(valor);
    if (!d) return '';
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* Tiempo entre dos marcas en texto corto, por ejemplo "5 min". */
function duracionLegible(desde, hasta) {
    const a = fechaIso(desde);
    const b = fechaIso(hasta);
    if (!a || !b) return '';
    const ms = b.getTime() - a.getTime();
    if (ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'menos de 1 min';
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60);
    const resto = min % 60;
    return resto ? h + ' h ' + resto + ' min' : h + ' h';
}

/* Las tres marcas de un mensaje, tal como vienen de la BD (o null si no existen). */
function horasDeMensaje(m) {
    return {
        envio: m && m.created_at ? m.created_at : null,
        entrega: m && m.entregado_at ? m.entregado_at : null,
        visto: m && m.leido_at ? m.leido_at : null
    };
}

/* Texto de tiempos para mostrar bajo un mensaje.
   Para quien envía: "Enviado 10:32 · Entregado 10:32 · Visto 10:40 (8 min después)".
   Para quien recibe: "Recibido 10:32 · Visto 10:40 (8 min después)". */
function resumenTiempos(m, esMio) {
    const h = horasDeMensaje(m);
    const partes = [];

    const envio = formatearHora(h.envio);
    if (envio) partes.push((esMio ? 'Enviado ' : 'Recibido ') + envio);

    const entrega = formatearHora(h.entrega);
    if (esMio && entrega) partes.push('Entregado ' + entrega);

    const visto = formatearHora(h.visto);
    if (visto) {
        const tras = duracionLegible(h.envio, h.visto);
        partes.push('Visto ' + visto + (tras ? ' (' + tras + ' después)' : ''));
    }

    return partes.join(' · ');
}

/* ---------------- Idempotencia ---------------- */

/* Identificador único del envío, generado en el cliente. */
function generarClientMessageId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return 'cm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function limpiarEnviosViejos() {
    const ahora = Date.now();
    envioEnCurso.forEach(function (v, k) {
        if (ahora - v.ts > TTL_ENVIO_ID_MS) envioEnCurso.delete(k);
    });
}

/* ---------------- Toast accesible ---------------- */

function toast(text, type = '') {
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'toast show ' + type;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    clearTimeout(el.t);
    el.t = setTimeout(() => el.classList.remove('show'), 3500);
}

function esc(v) {
    const d = document.createElement('div');
    d.textContent = v ?? '';
    return d.innerHTML;
}

function esErrorContenidoNoPermitido(err) {
    return !!(err && err.message && err.message.indexOf('contenido_no_permitido') !== -1);
}

const MENSAJES_ENVIO = {
    nadie: 'Esta persona no acepta mensajes en este momento.',
    solo_contactos: 'Solo sus contactos pueden enviarle mensajes.',
    solicitud_rechazada: 'Esta persona ya no acepta mensajes tuyos.',
    bloqueado: 'No puedes enviar mensajes a esta persona.',
    solicitud_solo_texto: 'Para tu primer contacto envía solo texto.'
};

/* Envío de un mensaje con la RPC enviar_mensaje_chat (firma sin cambios).
   opts.clientMessageId: identificador del envío. Si se reutiliza dentro de
   60 s, devuelve el mismo resultado sin volver a llamar a la RPC.
   Nota: la RPC aún no recibe este id; la protección entre dispositivos
   requiere ese parámetro en la base (pendiente de aprobación). */
async function enviarMensajeChat(destinatarioId, contenido, tipo = 'texto', imagenUrl = null, nombreArchivo = null, opts = {}) {
    const clientId = (opts && opts.clientMessageId) || generarClientMessageId();

    limpiarEnviosViejos();

    const previo = envioEnCurso.get(clientId);
    if (previo) return previo.promesa;

    const promesa = (async function () {
        const { data, error } = await db.rpc('enviar_mensaje_chat', {
            p_destinatario: destinatarioId,
            p_contenido: contenido,
            p_tipo: tipo,
            p_imagen_url: imagenUrl,
            p_nombre_archivo: nombreArchivo
        });
        if (error) {
            const msg = error.message || '';
            if (msg.indexOf('contenido_no_permitido') !== -1) throw error;
            const m = msg.match(/(?:ENVIO_NO_PERMITIDO|envio_no_permitido):(\w+)/i);
            if (m) {
                const llave = m[1].toLowerCase();
                const e = new Error(MENSAJES_ENVIO[llave] || 'No puedes enviar este mensaje.');
                e.codigoEnvio = llave;
                throw e;
            }
            throw error;
        }
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            return Object.assign({}, data, { client_message_id: clientId });
        }
        return data || {};
    })();

    envioEnCurso.set(clientId, { ts: Date.now(), promesa: promesa });

    /* Un error no se guarda: así un reintento sí vuelve a intentar. */
    promesa.catch(function () { envioEnCurso.delete(clientId); });

    return promesa;
}

/* ---------------- Limpieza de texto de Marquinhos ---------------- */

function limpiarMarkdown(texto) {
    if (typeof texto !== 'string') return '';
    let t = texto;
    t = t.replace(/```[\s\S]*?```/g, '');
    t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');
    t = t.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
    t = t.replace(/\*\*(.*?)\*\*/g, '$1');
    t = t.replace(/\*(.*?)\*/g, '$1');
    t = t.replace(/___(.*?)___/g, '$1');
    t = t.replace(/__(.*?)__/g, '$1');
    t = t.replace(/_(.*?)_/g, '$1');
    t = t.replace(/`([^`]+)`/g, '$1');
    t = t.replace(/^\s{0,3}[-*+]\s+/gm, '');
    t = t.replace(/^\s{0,3}\d{1,3}[.)]\s+/gm, '');
    t = t.replace(/^\s{0,3}>\s?/gm, '');
    t = t.replace(/^\s{0,3}([-*_])\s*\1\s*\1[\s\1]*$/gm, '');
    t = t.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');
    t = t.replace(/^\s*\|.*\|\s*$/gm, '');
    t = t.replace(/\|/g, ' ');
    t = t.replace(/^\s*[*#_~•]+\s*/gm, '');
    t = t.replace(/\s+[*#_~]{2,}\s+/g, ' ');
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
}

/* ---------------- Modal propio (sin emojis, sin icono por defecto) ---------------- */

const NeonModal = (function () {
    let activeBackdrop = null, activeResolve = null, activeEscHandler = null;

    /* Quita el modal activo y su listener de teclado. Es idempotente. */
    function _cleanup() {
        if (activeEscHandler) {
            document.removeEventListener('keydown', activeEscHandler);
            activeEscHandler = null;
        }
        if (activeBackdrop && activeBackdrop.parentNode) {
            activeBackdrop.parentNode.removeChild(activeBackdrop);
        }
        activeBackdrop = null;
        activeResolve = null;
    }

    function _open(opts, resolveFn) {
        /* Si había un modal abierto, se cierra primero (resuelve null). */
        const anterior = activeResolve;
        _cleanup();
        if (typeof anterior === 'function') anterior(null);

        activeResolve = resolveFn;
        const backdrop = document.createElement('div');
        backdrop.className = 'neon-modal-backdrop show';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        const danger = !!opts.danger;
        const card = document.createElement('div');
        card.className = 'neon-modal-card' + (danger ? ' danger' : '');
        const iconHtml = opts.icon ? `<div class="neon-modal-icon">${esc(opts.icon)}</div>` : '';
        const titleHtml = opts.title ? `<h3 class="neon-modal-title">${esc(opts.title)}</h3>` : '';
        const messageHtml = opts.message ? `<p class="neon-modal-message">${esc(opts.message)}</p>` : '';
        const inputHtml = opts.type === 'prompt'
            ? `<input class="neon-modal-input" type="text" placeholder="${esc(opts.placeholder || '')}" value="${esc(opts.defaultValue || '')}" maxlength="${opts.maxlength || 200}">`
            : '';
        const confirmText = opts.confirmText || 'Aceptar';
        const cancelText = opts.cancelText || 'Cancelar';
        const confirmClass = danger ? 'danger' : 'confirm';

        card.innerHTML = `
            ${iconHtml}
            ${titleHtml}
            ${messageHtml}
            ${inputHtml}
            <div class="neon-modal-actions">
                <button type="button" class="neon-modal-btn cancel" data-role="cancel">${esc(cancelText)}</button>
                <button type="button" class="neon-modal-btn ${confirmClass}" data-role="confirm">${esc(confirmText)}</button>
            </div>
        `;

        backdrop.appendChild(card);
        document.body.appendChild(backdrop);
        activeBackdrop = backdrop;

        const inputEl = card.querySelector('.neon-modal-input');
        const btnCancel = card.querySelector('[data-role="cancel"]');
        const btnConfirm = card.querySelector('[data-role="confirm"]');

        if (inputEl) setTimeout(() => { inputEl.focus(); inputEl.select(); }, 40);
        else setTimeout(() => btnConfirm && btnConfirm.focus(), 40);

        function finish(value) {
            const r = activeResolve;
            _cleanup();
            if (typeof r === 'function') r(value);
        }

        btnCancel.addEventListener('click', () => finish(null));
        btnConfirm.addEventListener('click', () => {
            if (opts.type === 'prompt') {
                const v = inputEl ? inputEl.value.trim() : '';
                finish(v || null);
            } else finish(true);
        });
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
        if (inputEl) inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); const v = inputEl.value.trim(); finish(v || null); }
        });

        activeEscHandler = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } };
        document.addEventListener('keydown', activeEscHandler);
    }

    function confirm(opts) {
        return new Promise((resolve) => {
            _open({
                type: 'confirm',
                title: opts.title || 'Confirmar',
                message: opts.message || '',
                icon: opts.icon || '',
                confirmText: opts.confirmText || 'Aceptar',
                cancelText: opts.cancelText || 'Cancelar',
                danger: !!opts.danger
            }, resolve);
        });
    }

    function prompt(opts) {
        return new Promise((resolve) => {
            _open({
                type: 'prompt',
                title: opts.title || 'Ingresa un valor',
                message: opts.message || '',
                icon: opts.icon || '',
                placeholder: opts.placeholder || '',
                defaultValue: opts.defaultValue || '',
                maxlength: opts.maxlength || 200,
                confirmText: opts.confirmText || 'Aceptar',
                cancelText: opts.cancelText || 'Cancelar',
                danger: !!opts.danger
            }, resolve);
        });
    }

    return { confirm, prompt };
})();

/* ---------------- Sesión y archivos ---------------- */

async function session() {
    if (!db) return null;
    const r = await db.auth.getSession();
    if (r.error) throw r.error;
    return r.data.session;
}

async function auth() {
    const s = await session();
    if (!s) { toast('Inicia sesión para usar Mensajes.', 'error'); return false; }
    user = s.user;
    return true;
}

async function subirViaBackend(file, destino, tipo) {
    const s = await session();
    if (!s) throw new Error('Inicia sesión primero.');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('destino', destino);
    fd.append('tipo', tipo);
    const r = await fetch('/api/media/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + s.access_token }, body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo subir el archivo.');
    return d;
}

/* ---------------- Avatares ---------------- */

function avatar(name, url, cls = 'avatar') {
    if (url) return `<div class="${cls}"><img src="${esc(url)}" alt=""></div>`;
    return `<div class="${cls}">${esc((name || 'U').charAt(0).toUpperCase())}</div>`;
}

/* ---------------- Perfiles y presencia ---------------- */

/* Registro completo de una persona (datos estáticos + presencia), con una sola
   llamada a perfiles_por_ids. Se comparte entre peticiones simultáneas. */
function obtenerRegistroPerfil(id) {
    if (perfilEnVuelo.has(id)) return perfilEnVuelo.get(id);

    const promesa = (async function () {
        try {
            // perfiles_por_ids es SECURITY DEFINER: devuelve el perfil de cualquier
            // usuario, enmascara "en línea" si ocultó su estado y omite cuentas inválidas.
            const { data: filas, error } = await db.rpc('perfiles_por_ids', { p_ids: [id] });
            if (error) throw error;
            const p = Array.isArray(filas) ? filas[0] : null;
            if (!p) return null;
            return {
                id: p.id,
                nombre: p.nombre || 'Usuario',
                handle: p.handle || null,
                avatar_url: p.avatar_url || null,
                online: p.online === true,
                ultima_conexion: p.ultima_conexion || null,
                bloqueado: false
            };
        } catch (e) {
            console.warn('No se pudo cargar el perfil:', e);
            return null;
        }
    })().finally(function () {
        perfilEnVuelo.delete(id);
    });

    perfilEnVuelo.set(id, promesa);
    return promesa;
}

/* Guarda la presencia por separado, con su propio TTL corto. */
function guardarPresencia(id, registro) {
    const data = registro
        ? { online: registro.online === true, ultima_conexion: registro.ultima_conexion || null, disponible: registro.bloqueado !== true }
        : { online: false, ultima_conexion: null, disponible: true };
    presenciaCache.set(id, { ts: Date.now(), data: data });
    return data;
}

/* Carga el perfil una sola vez aunque se pida varias veces al mismo tiempo.
   Mantiene su contrato: devuelve el perfil con nombre, handle, avatar y presencia. */
async function cargarPerfilRemoto(id) {
    const registro = await obtenerRegistroPerfil(id);

    const ttl = registro ? TTL_PERFIL_MS : TTL_PERFIL_FALLBACK_MS;
    const data = registro || { id, nombre: 'Usuario', handle: null, avatar_url: null, online: false, ultima_conexion: null, bloqueado: false };

    if (perfilCache.size >= PERFIL_CACHE_LIMITE) {
        const primera = perfilCache.keys().next().value;
        if (primera !== undefined) perfilCache.delete(primera);
    }
    perfilCache.set(id, { ts: Date.now(), ttl: ttl, data: data });

    guardarPresencia(id, registro);
    return data;
}

/* Presencia de una persona (en línea, última conexión, disponible).
   Usa su propia caché de 20 s: no vuelve a leer el perfil estático. */
async function presenciaDePerfil(id) {
    if (id === BOT_ID) {
        return { online: true, ultima_conexion: null, disponible: true };
    }

    const enCache = presenciaCache.get(id);
    if (enCache && Date.now() - enCache.ts < TTL_PRESENCIA_MS) return enCache.data;

    const registro = await obtenerRegistroPerfil(id);
    return guardarPresencia(id, registro);
}

/* Perfil completo: datos estáticos (TTL 5 min) con presencia fresca (TTL 20 s). */
async function profile(id) {
    if (id === BOT_ID) {
        return { id: BOT_ID, nombre: 'Marquinhos', handle: 'marquinhos', avatar_url: null, online: true, ultima_conexion: null, bot: true, bloqueado: false };
    }

    const enCache = perfilCache.get(id);
    const base = (enCache && Date.now() - enCache.ts < enCache.ttl)
        ? enCache.data
        : await cargarPerfilRemoto(id);

    const pres = await presenciaDePerfil(id);

    return Object.assign({}, base, {
        online: pres.online,
        ultima_conexion: pres.ultima_conexion,
        bloqueado: !pres.disponible
    });
}