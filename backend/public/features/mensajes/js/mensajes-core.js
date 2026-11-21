// ================================================================
// MENSAJES · CORE v2.0 · MÓDULO 1 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-core.js
// Contenido: constantes, estado compartido, helpers de texto,
//            toast, modal propio (NeonModal), sesión, subida de
//            archivos, perfiles y envío de mensajes.
// Cambios v2.0:
//  - Sin emojis en toasts, mensajes de error ni textos del sistema
//  - Toast con role/aria-live para lectores de pantalla
//  - NeonModal sin icono por defecto (ya no muestra "?")
//  - profile() incluye bloqueado/online para el estado de bloqueo
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
const TTL_PERFIL_MS = 5 * 60 * 1000;
const signedCache = new Map();
const TTL_SIGNED_MS = 50 * 60 * 1000;

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

async function enviarMensajeChat(destinatarioId, contenido, tipo = 'texto', imagenUrl = null, nombreArchivo = null) {
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
    return data || {};
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

    function _cleanup() {
        if (activeBackdrop && activeBackdrop.parentNode) activeBackdrop.parentNode.removeChild(activeBackdrop);
        if (activeEscHandler) document.removeEventListener('keydown', activeEscHandler);
        activeBackdrop = null; activeResolve = null; activeEscHandler = null;
    }

    function _open(opts, resolveFn) {
        _cleanup();
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

/* ---------------- Avatares y perfiles ---------------- */

function avatar(name, url, cls = 'avatar') {
    if (url) return `<div class="${cls}"><img src="${esc(url)}" alt=""></div>`;
    return `<div class="${cls}">${esc((name || 'U').charAt(0).toUpperCase())}</div>`;
}

async function profile(id) {
    if (id === BOT_ID) {
        return { id: BOT_ID, nombre: 'Marquinhos', handle: 'marquinhos', avatar_url: null, online: true, bot: true, bloqueado: false };
    }
    const enCache = perfilCache.get(id);
    if (enCache && Date.now() - enCache.ts < TTL_PERFIL_MS) return enCache.data;

    const r = await db.from('perfiles_publicos')
        .select('id,nombre,handle,avatar_url,online,ultima_conexion')
        .eq('id', id)
        .maybeSingle();
    const data = r.data
        ? { ...r.data, bloqueado: false }
        : { id, nombre: 'Usuario', handle: null, avatar_url: null, online: false, bloqueado: false };

    if (perfilCache.size >= PERFIL_CACHE_LIMITE) {
        const primera = perfilCache.keys().next().value;
        if (primera !== undefined) perfilCache.delete(primera);
    }
    perfilCache.set(id, { ts: Date.now(), data });
    return data;
}