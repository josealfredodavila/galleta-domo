// ================================================================
// MENSAJES · ESTADOS (HISTORIAS) v4.0 · MÓDULO 5 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-estados.js
// Depende de: mensajes-core.js (db, user, $, toast, esc, perfilCache,
//             currentUserProfile, NeonModal, auth, subirViaBackend,
//             ESTADOS_BUCKET, ESTADOS_TTL_MS, TTL_PERFIL_MS, PERFIL_CACHE_LIMITE)
// Cambios v4.0:
//  - Controles de video propios (sin controles nativos del navegador)
//  - Visor a pantalla completa: imagen y video con object-fit: contain
//  - Navegación por toque y deslizar con pointer events
//  - Ya no se enlaza nada a los botones que enlaza mensajes-init.js
//    (evita publicar dos veces y botones muertos en móvil)
//  - Comentarios con p_texto (nombre real del parámetro en Supabase)
//  - Videos de hasta 60 s (CHECK de estados actualizado en Supabase)
//  - Sin emojis ni símbolos decorativos
// ================================================================

'use strict';

const ESTADOS_LIMITE = { videos: 5, imagenes: 10, videoMB: 25, imagenMB: 10, videoSeg: 60, imagenSeg: 5 };
const ESTADOS_MIME_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ESTADOS_MIME_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime'];
const ESTADOS_ACCEPT = ESTADOS_MIME_IMAGEN.concat(ESTADOS_MIME_VIDEO).join(',');
const ESTADOS_VIGENCIA_MS = (typeof ESTADOS_TTL_MS === 'number' && ESTADOS_TTL_MS > 0) ? ESTADOS_TTL_MS : 86400000;

const ICO_OJO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICO_COMENTAR = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
const ICO_PLAY = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>';
const ICO_PAUSA = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
const ICO_VOLUMEN = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
const ICO_SILENCIO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/></svg>';
const ICO_BASURA = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

let estadosCache = [];
let estadoActualUserId = null;
let estadoActualIndex = 0;
let estadoTimer = null;
let estadoProgresoActual = 0;
let estadoPausado = false;
let estadoVisorGen = 0;
let estadoVideoActivo = false;
let estadoVideoPausadoPorUsuario = false;
let estadoArchivos = [];
let estadoPublicando = false;
let estadoGestosListos = false;
let estadoVisorListo = false;

/* ---------------- Utilidades ---------------- */

function ocultar(id) { const el = $(id); if (el) el.classList.add('hidden'); }
function mostrar(id) { const el = $(id); if (el) el.classList.remove('hidden'); }
function aviso(mensaje, tipo) { toast(mensaje, tipo || ''); }

function estadoURL(e) { return e ? (e.media_url || e.imagen_url || '') : ''; }

function estadoEsVideo(e) {
    if (!e) return false;
    if (e.media_tipo === 'video') return true;
    return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(estadoURL(e));
}

function estadoEsNuevo(e) {
    return !(window.__estadosVistosIds && window.__estadosVistosIds.has(e.id));
}

function estadosDe(uid) {
    return estadosCache.filter(e => e.usuario_id === uid);
}

function estadoPath(url) {
    if (!url) return null;
    const m = String(url).match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/([^?]+)/);
    if (m) {
        try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
    }
    if (!/^https?:/i.test(url) && String(url).indexOf('/') !== -1) return String(url).split('?')[0];
    return null;
}

async function borrarArchivoStorage(url) {
    const path = estadoPath(url);
    if (!path) return;
    try {
        const r = await db.storage.from(ESTADOS_BUCKET).remove([path]);
        if (r.error) console.warn('[Estados] No se pudo borrar el archivo:', r.error);
    } catch (e) { console.warn('[Estados] Error limpiando Storage:', e); }
}

function estadoFechaExpiracion() {
    return new Date(Date.now() + ESTADOS_VIGENCIA_MS).toISOString();
}

function formatoTiempo(seg) {
    const t = Math.max(0, Math.floor(seg || 0));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

function haceTiempo(fecha) {
    if (!fecha) return '';
    const t = new Date(fecha).getTime();
    if (!isFinite(t)) return '';
    const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (min < 1) return 'ahora';
    if (min < 60) return 'hace ' + min + ' min';
    const h = Math.floor(min / 60);
    if (h < 24) return 'hace ' + h + ' h';
    return 'hace ' + Math.floor(h / 24) + ' d';
}

function avatarHTML(nombre, url) {
    if (url) return '<img src="' + esc(url) + '" alt="">';
    return esc(String(nombre || 'U').charAt(0).toUpperCase());
}

function urlPerfil(handle, uid) {
    if (handle) return '/features/perfil/perfil-publico.html?u=' + encodeURIComponent(handle);
    if (uid) return '/features/perfil/perfil-publico.html?id=' + encodeURIComponent(uid);
    return null;
}

async function perfilDe(uid) {
    const en = perfilCache.get(uid);
    const ttl = (typeof TTL_PERFIL_MS === 'number') ? TTL_PERFIL_MS : 300000;
    if (en && Date.now() - en.ts < ttl) return en.data;
    try {
        const r = await db.from('perfiles_publicos').select('id,nombre,handle,avatar_url').eq('id', uid).maybeSingle();
        const data = r.data || { id: uid, nombre: 'Usuario', handle: '', avatar_url: null };
        if (typeof PERFIL_CACHE_LIMITE === 'number' && perfilCache.size >= PERFIL_CACHE_LIMITE) {
            const primera = perfilCache.keys().next().value;
            if (primera !== undefined) perfilCache.delete(primera);
        }
        perfilCache.set(uid, { ts: Date.now(), data });
        return data;
    } catch (e) {
        return { id: uid, nombre: 'Usuario', handle: '', avatar_url: null };
    }
}

/* ---------------- Vistas ---------------- */

async function registrarVistaEstado(id) {
    if (!user || !id) return;
    if (window.__estadosVistosIds && window.__estadosVistosIds.has(id)) return;
    try {
        const r = await db.from('estados_vistas').upsert(
            { estado_id: id, usuario_id: user.id },
            { onConflict: 'estado_id,usuario_id', ignoreDuplicates: true }
        );
        if (!r.error) {
            window.__estadosVistosIds = window.__estadosVistosIds || new Set();
            window.__estadosVistosIds.add(id);
        }
    } catch (e) { /* silencioso: no bloquea el visor */ }
}

async function obtenerVistasEstado(id) {
    try {
        const r = await db.from('estados_vistas').select('id', { count: 'exact', head: true }).eq('estado_id', id);
        return r.error ? 0 : (r.count || 0);
    } catch (e) { return 0; }
}

/* ---------------- Cargar historias ---------------- */

async function obtenerEstadosActivos() {
    let filas = [];
    const rpc = await db.rpc('estados_mensajes_activos');

    if (!rpc.error && Array.isArray(rpc.data)) {
        if (rpc.data.length && Array.isArray(rpc.data[0].estados)) {
            rpc.data.forEach(g => (g.estados || []).forEach(e => {
                filas.push(Object.assign({}, e, { usuario_id: g.usuario_id, origen: 'mensajes' }));
            }));
        } else {
            filas = rpc.data.slice();
        }
    } else {
        const q = await db.from('estados')
            .select('id, usuario_id, imagen_url, media_url, media_tipo, duracion_segundos, caption, created_at, expires_at')
            .eq('origen', 'mensajes')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: true });
        if (q.error) throw q.error;
        filas = q.data || [];
    }

    const ahora = Date.now();
    return filas
        .filter(e => e && e.id && e.usuario_id && estadoURL(e) &&
            (!e.expires_at || new Date(e.expires_at).getTime() > ahora))
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
}

async function obtenerVistasPropias(ids) {
    const set = new Set();
    if (!ids.length) return set;
    try {
        const r = await db.from('estados_vistas').select('estado_id').eq('usuario_id', user.id).in('estado_id', ids);
        (r.data || []).forEach(v => set.add(v.estado_id));
    } catch (e) { console.warn('[Estados] No se cargaron vistas previas:', e); }
    return set;
}

async function cargarEstados() {
    const rueda = $('estadosScroll');
    if (!rueda || !user) return;

    try {
        estadosCache = await obtenerEstadosActivos();
        window.__estadosVistosIds = await obtenerVistasPropias(estadosCache.map(e => e.id));

        const porUsuario = {};
        estadosCache.forEach(e => { (porUsuario[e.usuario_id] = porUsuario[e.usuario_id] || []).push(e); });

        const otros = Object.keys(porUsuario).filter(uid => uid !== user.id);
        await Promise.all(otros.map(perfilDe));

        renderizarRueda(rueda, porUsuario, otros);
    } catch (e) {
        console.error('[Estados] Error cargando historias:', e);
        rueda.innerHTML = '<div class="estados-vacio">No se pudieron cargar las historias.</div>';
    }
}

async function renderizarRueda(rueda, porUsuario, otros) {
    rueda.innerHTML = '';

    const mios = porUsuario[user.id] || [];

    if (mios.length) {
        const ultimo = mios[mios.length - 1];
        const total = await obtenerVistasEstado(ultimo.id);
        rueda.appendChild(crearItemRueda({
            uid: user.id,
            titulo: 'Tu historia',
            esVideo: estadoEsVideo(ultimo),
            thumb: estadoURL(ultimo),
            nuevo: mios.some(estadoEsNuevo),
            badge: total,
            onClick: () => abrirEstadoUsuario(user.id)
        }));
    } else {
        rueda.appendChild(crearItemRueda({
            titulo: 'Tu historia',
            crear: true,
            onClick: abrirModalEstado
        }));
    }

    otros.forEach(uid => {
        const p = perfilCache.get(uid);
        const perfil = (p && p.data) || { nombre: 'Usuario', avatar_url: null };
        rueda.appendChild(crearItemRueda({
            uid,
            titulo: perfil.nombre || 'Usuario',
            avatarUrl: perfil.avatar_url,
            avatarNombre: perfil.nombre,
            nuevo: porUsuario[uid].some(estadoEsNuevo),
            onClick: () => abrirEstadoUsuario(uid)
        }));
    });

    if (!rueda.children.length) {
        rueda.innerHTML = '<div class="estados-vacio">Todavía no hay historias.</div>';
    }
}

function crearItemRueda(o) {
    const item = document.createElement('div');
    item.className = 'estado-item';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');

    const circulo = document.createElement('div');
    circulo.className = 'estado-circle' + (o.nuevo === false ? ' visto' : '');

    const inner = document.createElement('div');
    inner.className = 'estado-inner';

    if (o.crear) {
        inner.textContent = '+';
    } else if (o.thumb && o.esVideo) {
        inner.innerHTML = ICO_PLAY;
    } else if (o.thumb) {
        const img = document.createElement('img');
        img.src = o.thumb;
        img.alt = '';
        img.loading = 'lazy';
        inner.appendChild(img);
    } else {
        inner.innerHTML = avatarHTML(o.avatarNombre, o.avatarUrl);
    }

    circulo.appendChild(inner);
    item.appendChild(circulo);

    if (o.badge > 0) {
        const b = document.createElement('span');
        b.className = 'estado-vistas-badge';
        b.textContent = String(o.badge);
        item.appendChild(b);
    }

    const nombre = document.createElement('div');
    nombre.className = 'estado-name';
    nombre.textContent = o.titulo;
    item.appendChild(nombre);

    item.addEventListener('click', o.onClick);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick(); } });
    return item;
}

/* ---------------- Visor ---------------- */

function actualizarBarra(p) {
    const val = Math.max(0, Math.min(100, p)) + '%';
    const barra = $('estadoProgress');
    if (barra) barra.style.width = val;
    const seek = $('evSeekFill');
    if (seek) seek.style.width = val;
}

function detenerTemporizador() {
    if (estadoTimer) { clearInterval(estadoTimer); estadoTimer = null; }
}

function detenerVideo() {
    const v = $('evVideo');
    estadoVideoActivo = false;
    if (!v) return;
    v.pause();
    v.removeAttribute('src');
    v.load();
}

function reproducirVideo() {
    const v = $('evVideo');
    if (!v) return;
    const p = v.play();
    if (p && p.catch) {
        p.catch(() => {
            // Los navegadores bloquean el sonido sin interacción: se reproduce silenciado.
            v.muted = true;
            const p2 = v.play();
            if (p2 && p2.catch) p2.catch(() => {});
        });
    }
}

function alternarVideo() {
    const v = $('evVideo');
    if (!estadoVideoActivo || !v) return;
    if (v.paused) { estadoVideoPausadoPorUsuario = false; reproducirVideo(); }
    else { estadoVideoPausadoPorUsuario = true; v.pause(); }
}

function abrirEstadoUsuario(uid) {
    const lista = estadosDe(uid);
    if (!lista.length) { aviso('Este usuario no tiene historias activas.', 'warning'); return; }
    estadoActualUserId = uid;
    estadoActualIndex = 0;
    estadoPausado = false;
    const visor = $('estadoViewer');
    if (visor) visor.classList.add('show');
    mostrarEstadoActual();
}

async function pintarCabecera(estado, mio, gen) {
    const av = $('evAvatar');
    const nom = $('evName');
    const tm = $('evTime');
    if (tm) tm.textContent = haceTiempo(estado.created_at);

    if (mio) {
        if (av) av.innerHTML = avatarHTML(currentUserProfile && currentUserProfile.nombre, currentUserProfile && currentUserProfile.avatar_url);
        if (nom) nom.textContent = 'Tu historia';
        return;
    }
    const p = await perfilDe(estado.usuario_id);
    if (gen !== estadoVisorGen) return;
    if (av) av.innerHTML = avatarHTML(p.nombre, p.avatar_url);
    if (nom) nom.textContent = p.nombre || 'Usuario';
}

async function mostrarEstadoActual() {
    const gen = ++estadoVisorGen;
    detenerTemporizador();
    detenerVideo();

    const lista = estadosDe(estadoActualUserId);
    if (!lista.length || estadoActualIndex < 0 || estadoActualIndex >= lista.length) {
        cerrarEstadoViewer();
        return;
    }

    const estado = lista[estadoActualIndex];
    const mio = estado.usuario_id === user.id;
    const esVideo = estadoEsVideo(estado);
    const img = $('evImage');
    const vid = $('evVideo');

    pintarCabecera(estado, mio, gen);

    if (esVideo) {
        img.classList.add('hidden');
        img.removeAttribute('src');
        vid.classList.remove('hidden');
        mostrar('evVideoBar');
        estadoVideoActivo = true;
        estadoVideoPausadoPorUsuario = false;
        vid.muted = false;
        vid.src = estadoURL(estado);
        vid.load();
        reproducirVideo();
    } else {
        vid.classList.add('hidden');
        ocultar('evVideoBar');
        img.classList.remove('hidden');
        img.src = estadoURL(estado);
    }

    estadoProgresoActual = 0;
    actualizarBarra(0);

    const cap = $('evCaption');
    if (cap) {
        if (estado.caption) { cap.textContent = estado.caption; cap.classList.remove('hidden'); }
        else { cap.textContent = ''; cap.classList.add('hidden'); }
    }

    const prev = $('evPrev');
    const next = $('evNext');
    if (prev) prev.classList.toggle('hidden', estadoActualIndex === 0);
    if (next) next.classList.toggle('hidden', lista.length === 1 && estadosCache.length <= lista.length);

    const otroUsuario = estadosCache.some(e => e.usuario_id !== estadoActualUserId);
    const skip = $('evSkip');
    if (skip) skip.classList.toggle('hidden', !otroUsuario);

    const vistas = $('evVistas');
    const eliminar = $('evEliminar');
    const comentar = $('evComentar');

    if (mio) {
        if (vistas) { vistas.classList.remove('hidden'); vistas.dataset.estadoId = estado.id; }
        if (eliminar) { eliminar.classList.remove('hidden'); eliminar.dataset.estadoId = estado.id; }
        ocultar('evComentar');
        obtenerVistasEstado(estado.id).then(total => {
            if (gen === estadoVisorGen) { const c = $('evVistasCount'); if (c) c.textContent = String(total); }
        });
    } else {
        ocultar('evVistas');
        ocultar('evEliminar');
        if (comentar) { comentar.classList.remove('hidden'); comentar.dataset.estadoId = estado.id; }
        registrarVistaEstado(estado.id);
    }

    if (!esVideo) iniciarTemporizadorImagen();
}

function iniciarTemporizadorImagen() {
    const total = ESTADOS_LIMITE.imagenSeg * 1000;
    const paso = 50;
    const incremento = paso / total * 100;
    estadoTimer = setInterval(() => {
        if (estadoPausado) return;
        estadoProgresoActual = Math.min(100, estadoProgresoActual + incremento);
        actualizarBarra(estadoProgresoActual);
        if (estadoProgresoActual >= 100) {
            detenerTemporizador();
            siguienteEstado();
        }
    }, paso);
}

function siguienteEstado() {
    const lista = estadosDe(estadoActualUserId);
    if (estadoActualIndex < lista.length - 1) {
        estadoActualIndex++;
        estadoPausado = false;
        mostrarEstadoActual();
    } else {
        saltarGrupoMensajes();
    }
}

function anteriorEstado() {
    if (estadoActualIndex <= 0) return;
    estadoActualIndex--;
    estadoPausado = false;
    mostrarEstadoActual();
}

function saltarGrupoMensajes() {
    if (!estadoActualUserId) return;
    const orden = [];
    estadosCache.forEach(e => { if (!orden.includes(e.usuario_id)) orden.push(e.usuario_id); });
    for (let i = orden.indexOf(estadoActualUserId) + 1; i < orden.length; i++) {
        if (estadosDe(orden[i]).length) {
            estadoActualUserId = orden[i];
            estadoActualIndex = 0;
            estadoPausado = false;
            mostrarEstadoActual();
            return;
        }
    }
    cerrarEstadoViewer();
}

function cerrarEstadoViewer() {
    estadoVisorGen++;
    detenerTemporizador();
    detenerVideo();
    const visor = $('estadoViewer');
    if (visor) visor.classList.remove('show');
    estadoPausado = false;
    estadoActualUserId = null;
    estadoActualIndex = 0;
    actualizarBarra(0);
    cargarEstados();
}

function activarPausaEstado() {
    const visor = $('estadoViewer');
    if (!visor || !visor.classList.contains('show')) return;
    estadoPausado = true;
    const v = $('evVideo');
    if (estadoVideoActivo && v && !v.paused) v.pause();
}

function desactivarPausaEstado() {
    const visor = $('estadoViewer');
    if (!visor || !visor.classList.contains('show')) return;
    estadoPausado = false;
    if (estadoVideoActivo && !estadoVideoPausadoPorUsuario) reproducirVideo();
}

/* ---------------- Gestos: tocar y deslizar ---------------- */

function ignorarGesto(target) {
    return !!(target && target.closest && target.closest(
        'button, #evSeek, .estado-viewer-header, .estado-viewer-foot, .estado-viewer-videobar, .estado-viewer-nav'
    ));
}

function instalarGestos() {
    const visor = $('estadoViewer');
    if (!visor || estadoGestosListos) return;
    estadoGestosListos = true;

    let x0 = 0, y0 = 0, t0 = 0, activo = false;

    visor.addEventListener('pointerdown', e => {
        activo = !ignorarGesto(e.target);
        x0 = e.clientX; y0 = e.clientY; t0 = Date.now();
    });

    visor.addEventListener('pointercancel', () => { activo = false; });

    visor.addEventListener('pointerup', e => {
        if (!activo) return;
        activo = false;
        const dx = e.clientX - x0;
        const dy = e.clientY - y0;
        const dt = Date.now() - t0;

        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            if (dx < 0) siguienteEstado(); else anteriorEstado();
            return;
        }

        if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 450) {
            const ancho = visor.clientWidth || window.innerWidth;
            const rel = (e.clientX - visor.getBoundingClientRect().left) / ancho;
            if (rel < 0.32) anteriorEstado();
            else if (rel > 0.68) siguienteEstado();
            else alternarVideo();
        }
    });
}

/* ---------------- Controles del video ---------------- */

function instalarControlesVideo() {
    const v = $('evVideo');
    if (!v || estadoVisorListo) return;
    estadoVisorListo = true;

    v.controls = false;
    v.playsInline = true;
    v.preload = 'auto';

    v.addEventListener('timeupdate', () => {
        if (!estadoVideoActivo || !isFinite(v.duration) || v.duration <= 0) return;
        estadoProgresoActual = v.currentTime / v.duration * 100;
        actualizarBarra(estadoProgresoActual);
        pintarTiempoVideo();
    });

    v.addEventListener('loadedmetadata', pintarTiempoVideo);

    v.addEventListener('ended', () => {
        if (!estadoVideoActivo) return;
        actualizarBarra(100);
        siguienteEstado();
    });

    v.addEventListener('play', pintarIconoPlay);
    v.addEventListener('pause', pintarIconoPlay);
    v.addEventListener('volumechange', pintarIconoVolumen);

    const play = $('evPlay');
    if (play) play.addEventListener('click', e => { e.stopPropagation(); alternarVideo(); });

    const mute = $('evMute');
    if (mute) mute.addEventListener('click', e => { e.stopPropagation(); v.muted = !v.muted; });

    const seek = $('evSeek');
    if (seek) {
        let arrastrando = false;
        const buscar = (e) => {
            if (!isFinite(v.duration) || v.duration <= 0) return;
            const r = seek.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            v.currentTime = ratio * v.duration;
            estadoProgresoActual = ratio * 100;
            actualizarBarra(estadoProgresoActual);
        };
        seek.addEventListener('pointerdown', e => {
            e.stopPropagation();
            arrastrando = true;
            seek.setPointerCapture(e.pointerId);
            buscar(e);
        });
        seek.addEventListener('pointermove', e => { if (arrastrando) buscar(e); });
        seek.addEventListener('pointerup', () => { arrastrando = false; });
        seek.addEventListener('pointercancel', () => { arrastrando = false; });
    }
}

function pintarIconoPlay() {
    const v = $('evVideo');
    const b = $('evPlay');
    if (v && b) b.innerHTML = v.paused ? ICO_PLAY : ICO_PAUSA;
}

function pintarIconoVolumen() {
    const v = $('evVideo');
    const b = $('evMute');
    if (v && b) b.innerHTML = v.muted ? ICO_SILENCIO : ICO_VOLUMEN;
}

function pintarTiempoVideo() {
    const v = $('evVideo');
    const t = $('evTiempoVideo');
    if (!v || !t) return;
    const total = isFinite(v.duration) ? formatoTiempo(v.duration) : '0:00';
    t.textContent = formatoTiempo(v.currentTime) + ' / ' + total;
}

/* ---------------- Paneles: vistas y comentarios ---------------- */

function pintarMensajePanel(lista, texto) {
    lista.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'estado-panel-msg';
    d.textContent = texto;
    lista.appendChild(d);
}

async function abrirPanelEstado(estadoId, tab) {
    tab = tab || 'vistas';
    if (!estadoId) return;

    const modal = $('vistasModal');
    const lista = $('vistasList');
    const cont = $('vistasModalCount');
    if (!modal || !lista) return;

    // Pausa el visor para que el panel no compita con el video
    estadoPausado = true;
    const v = $('evVideo');
    if (estadoVideoActivo && v && !v.paused) v.pause();

    modal.classList.add('show');
    pintarTabsPanel(estadoId, tab);
    if (cont) cont.textContent = '';
    pintarMensajePanel(lista, 'Cargando…');

    try {
        if (tab === 'vistas') await pintarVistas(estadoId, lista, cont);
        else await pintarComentarios(estadoId, lista, cont);
    } catch (e) {
        console.error('[Estados] Error en el panel:', e);
        pintarMensajePanel(lista, 'No se pudo cargar la información.');
    }
}

function pintarTabsPanel(estadoId, activa) {
    const cont = $('vistasTabs');
    if (!cont) return;
    cont.innerHTML = '';
    [
        { id: 'vistas', icono: ICO_OJO, texto: 'Vistas' },
        { id: 'comentarios', icono: ICO_COMENTAR, texto: 'Comentarios' }
    ].forEach(t => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'estado-tab' + (t.id === activa ? ' active' : '');
        b.innerHTML = t.icono + '<span>' + t.texto + '</span>';
        b.addEventListener('click', () => abrirPanelEstado(estadoId, t.id));
        cont.appendChild(b);
    });
}

async function pintarVistas(estadoId, lista, cont) {
    const r = await db.from('estados_vistas')
        .select('usuario_id, visto_at')
        .eq('estado_id', estadoId)
        .order('visto_at', { ascending: false });
    if (r.error) throw r.error;

    const vistas = r.data || [];
    if (cont) cont.textContent = '(' + vistas.length + ')';
    if (!vistas.length) { pintarMensajePanel(lista, 'Todavía no hay vistas.'); return; }

    const ids = vistas.map(v => v.usuario_id);
    const perf = await db.from('perfiles_publicos').select('id,nombre,handle,avatar_url').in('id', ids);
    const mapa = {};
    (perf.data || []).forEach(p => { mapa[p.id] = p; });

    lista.innerHTML = '';
    vistas.forEach(v => {
        const p = mapa[v.usuario_id] || { nombre: 'Usuario', handle: '', avatar_url: null };
        const url = urlPerfil(p.handle, v.usuario_id);
        const fila = document.createElement('div');
        fila.className = 'estado-result';
        fila.innerHTML =
            '<div class="avatar">' + avatarHTML(p.nombre, p.avatar_url) + '</div>' +
            '<div class="estado-result-info"><b>' + esc(p.nombre || 'Usuario') + '</b>' +
            '<div class="estado-result-meta">@' + esc(p.handle || 'usuario') + ' · ' + esc(haceTiempo(v.visto_at)) + '</div></div>';
        if (url) fila.addEventListener('click', () => { window.location.href = url; });
        lista.appendChild(fila);
    });
}

async function pintarComentarios(estadoId, lista, cont) {
    const r = await db.rpc('estado_comentarios_lista', { p_estado_id: estadoId });
    if (r.error) throw r.error;

    const arr = Array.isArray(r.data) ? r.data : ((r.data && Array.isArray(r.data.data)) ? r.data.data : []);
    if (cont) cont.textContent = '(' + arr.length + ')';
    if (!arr.length) { pintarMensajePanel(lista, 'Todavía no hay comentarios.'); return; }

    lista.innerHTML = '';
    arr.forEach(c => {
        const nombre = c.nombre || c.usuario_handle || 'Usuario';
        const texto = c.comentario || c.texto || c.contenido || '';
        const fila = document.createElement('div');
        fila.className = 'estado-result estado-result-top';
        fila.innerHTML =
            '<div class="avatar">' + avatarHTML(nombre, c.avatar_url) + '</div>' +
            '<div class="estado-result-info"><b>' + esc(nombre) + '</b>' +
            '<div class="estado-comentario">' + esc(texto) + '</div>' +
            (c.created_at ? '<div class="estado-result-meta">' + esc(haceTiempo(c.created_at)) + '</div>' : '') +
            '</div>';
        lista.appendChild(fila);
    });
}

function abrirVistasModal(estadoId) { return abrirPanelEstado(estadoId, 'vistas'); }

function cerrarVistasModal() {
    const m = $('vistasModal');
    if (m) m.classList.remove('show');
}

/* ---------------- Eliminar y comentar ---------------- */

async function eliminarHistoriaMensajes(estadoId) {
    if (!estadoId || !user) return;

    const estado = estadosCache.find(e => e.id === estadoId);
    if (!estado || estado.usuario_id !== user.id) {
        aviso('Solo puedes eliminar tus propias historias.', 'error');
        return;
    }

    const ok = await NeonModal.confirm({
        title: 'Eliminar historia',
        message: 'Esta historia dejará de estar disponible para todos.',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        danger: true
    });
    if (!ok) return;

    try {
        // select() confirma que la fila realmente se borró (RLS puede bloquearla sin error)
        const r = await db.from('estados')
            .delete()
            .eq('id', estadoId)
            .eq('usuario_id', user.id)
            .select('id');
        if (r.error) throw r.error;
        if (!r.data || !r.data.length) throw new Error('No se pudo eliminar la historia.');

        await borrarArchivoStorage(estadoURL(estado));

        estadosCache = estadosCache.filter(e => e.id !== estadoId);
        aviso('Historia eliminada.', 'success');

        if (estadoActualUserId === user.id) {
            const restantes = estadosDe(user.id);
            if (!restantes.length) {
                cerrarEstadoViewer();
            } else {
                estadoActualIndex = Math.min(estadoActualIndex, restantes.length - 1);
                mostrarEstadoActual();
            }
        } else {
            await cargarEstados();
        }
    } catch (e) {
        console.error('[Estados] Error eliminando:', e);
        aviso(e.message || 'No se pudo eliminar la historia.', 'error');
    }
}

async function comentarHistoriaMensajes(estadoId) {
    if (!estadoId || !user) return;

    const texto = await NeonModal.prompt({
        title: 'Comentar historia',
        message: 'Escribe un comentario de hasta 200 caracteres.',
        placeholder: 'Escribe tu comentario',
        confirmText: 'Enviar',
        cancelText: 'Cancelar',
        maxlength: 200
    });
    if (!texto) return;

    try {
        const r = await db.rpc('estado_enviar_comentario', {
            p_estado_id: estadoId,
            p_texto: texto.trim().slice(0, 200)
        });
        if (r.error) throw r.error;
        aviso('Comentario enviado.', 'success');
    } catch (e) {
        console.error('[Estados] Error comentando:', e);
        aviso(e.message || 'No se pudo enviar el comentario.', 'error');
    }
}

/* ---------------- Publicar: selección ---------------- */

function limpiarArchivosSeleccion() {
    estadoArchivos.forEach(a => { try { URL.revokeObjectURL(a.url); } catch (e) {} });
    estadoArchivos = [];
}

function abrirModalEstado() {
    if (estadoPublicando) return;
    limpiarArchivosSeleccion();

    const input = $('estadoFileInput');
    if (input) { input.value = ''; input.multiple = true; input.accept = ESTADOS_ACCEPT; }

    const cap = $('estadoCaption');
    if (cap) cap.value = '';

    pintarPreview();
    const m = $('estadoUploadModal');
    if (m) m.classList.add('show');
}

function cerrarModalEstado() {
    if (estadoPublicando) return;
    const m = $('estadoUploadModal');
    if (m) m.classList.remove('show');
    limpiarArchivosSeleccion();
    pintarPreview();
}

function seleccionarArchivoEstado() {
    if (estadoPublicando) return;
    const input = $('estadoFileInput');
    if (input) input.click();
}

function duracionVideo(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.onloadedmetadata = () => {
            const d = v.duration;
            URL.revokeObjectURL(url);
            if (!isFinite(d) || d <= 0) reject(new Error('No se pudo leer la duración del video.'));
            else resolve(d);
        };
        v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer el video.')); };
        v.src = url;
    });
}

function contarArchivos(tipo) {
    return estadoArchivos.filter(a => a.tipo === tipo).length;
}

async function previewEstado(event) {
    const input = (event && event.target) || $('estadoFileInput');
    if (!input || estadoPublicando) return;

    const nuevos = Array.from(input.files || []);
    input.value = '';
    if (!nuevos.length) return;

    let videos = contarArchivos('video');
    let imagenes = contarArchivos('imagen');

    for (const file of nuevos) {
        const tipo = ESTADOS_MIME_VIDEO.includes(file.type) ? 'video'
            : (ESTADOS_MIME_IMAGEN.includes(file.type) ? 'imagen' : null);

        if (!tipo) { aviso('Formato no compatible: ' + file.name, 'error'); continue; }

        if (tipo === 'video' && file.size > ESTADOS_LIMITE.videoMB * 1048576) {
            aviso('Cada video puede pesar máximo ' + ESTADOS_LIMITE.videoMB + ' MB.', 'error'); continue;
        }
        if (tipo === 'imagen' && file.size > ESTADOS_LIMITE.imagenMB * 1048576) {
            aviso('Cada imagen puede pesar máximo ' + ESTADOS_LIMITE.imagenMB + ' MB.', 'error'); continue;
        }
        if (tipo === 'video' && videos >= ESTADOS_LIMITE.videos) {
            aviso('Puedes tener máximo ' + ESTADOS_LIMITE.videos + ' videos activos.', 'error'); continue;
        }
        if (tipo === 'imagen' && imagenes >= ESTADOS_LIMITE.imagenes) {
            aviso('Puedes tener máximo ' + ESTADOS_LIMITE.imagenes + ' imágenes activas.', 'error'); continue;
        }

        let duracion = 0;
        if (tipo === 'video') {
            try {
                duracion = await duracionVideo(file);
            } catch (e) {
                aviso(e.message, 'error');
                continue;
            }
            if (duracion > ESTADOS_LIMITE.videoSeg) {
                aviso('Cada video puede durar máximo ' + ESTADOS_LIMITE.videoSeg + ' segundos.', 'error');
                continue;
            }
            videos++;
        } else {
            imagenes++;
        }

        estadoArchivos.push({ file, tipo, duracion, url: URL.createObjectURL(file), publicado: false });
    }

    pintarPreview();
}

function quitarArchivoSeleccion(indice) {
    if (estadoPublicando) return;
    const a = estadoArchivos[indice];
    if (a) { try { URL.revokeObjectURL(a.url); } catch (e) {} }
    estadoArchivos.splice(indice, 1);
    pintarPreview();
}

function pintarPreview() {
    const wrap = $('estadoPreviewWrap');
    const lista = $('estadoPreviewLista');
    const cont = $('estadoPreviewContador');

    if (wrap) wrap.classList.toggle('hidden', estadoArchivos.length === 0);
    if (lista) {
        lista.innerHTML = '';
        estadoArchivos.forEach((a, i) => {
            const card = document.createElement('div');
            card.className = 'estado-preview-item';

            const media = a.tipo === 'video' ? document.createElement('video') : document.createElement('img');
            media.src = a.url;
            if (a.tipo === 'video') { media.muted = true; media.playsInline = true; media.preload = 'metadata'; }
            else { media.alt = ''; }
            card.appendChild(media);

            const num = document.createElement('span');
            num.className = 'estado-preview-numero';
            num.textContent = (i + 1) + ' / ' + estadoArchivos.length;
            card.appendChild(num);

            const quitar = document.createElement('button');
            quitar.type = 'button';
            quitar.className = 'estado-preview-quitar';
            quitar.setAttribute('aria-label', 'Quitar archivo');
            quitar.textContent = '×';
            quitar.addEventListener('click', () => quitarArchivoSeleccion(i));
            card.appendChild(quitar);

            const info = document.createElement('span');
            info.className = 'estado-preview-info';
            info.textContent = a.tipo === 'video' ? 'Video · ' + formatoTiempo(a.duracion) : 'Foto';
            card.appendChild(info);

            lista.appendChild(card);
        });
    }

    if (cont) {
        cont.textContent = contarArchivos('video') + '/' + ESTADOS_LIMITE.videos + ' videos · ' +
            contarArchivos('imagen') + '/' + ESTADOS_LIMITE.imagenes + ' fotos';
    }

    pintarBotonPublicar(false);
}

function pintarBotonPublicar(enProceso) {
    const btn = $('btnPublicarEstado');
    if (!btn) return;
    btn.disabled = enProceso || estadoArchivos.length === 0;
    btn.classList.toggle('is-loading', enProceso);
    btn.textContent = enProceso ? 'Publicando…' : 'Publicar historia';
}

function pintarProgresoPublicacion(p) {
    const barra = $('estadoProgresoPublicacion');
    if (barra) barra.firstElementChild.style.width = Math.max(0, Math.min(100, p)) + '%';
}

/* ---------------- Publicar: envío ---------------- */

async function consultarCuotas() {
    const r = await db.from('estados')
        .select('id, media_tipo, media_url, imagen_url')
        .eq('usuario_id', user.id)
        .eq('origen', 'mensajes')
        .gt('expires_at', new Date().toISOString());
    if (r.error) throw r.error;

    const activos = r.data || [];
    const videos = activos.filter(estadoEsVideo).length;
    return { videos, imagenes: activos.length - videos };
}

async function publicarUno(a, caption) {
    const sub = await subirViaBackend(a.file, ESTADOS_BUCKET, a.tipo);
    if (!sub || !sub.url) throw new Error('El almacenamiento no devolvió la URL del archivo.');

    const duracion = a.tipo === 'video'
        ? Math.max(1, Math.min(ESTADOS_LIMITE.videoSeg, Math.ceil(a.duracion)))
        : ESTADOS_LIMITE.imagenSeg;

    const ins = await db.from('estados').insert({
        usuario_id: user.id,
        imagen_url: sub.url,
        media_url: sub.url,
        media_tipo: a.tipo,
        duracion_segundos: duracion,
        caption: caption,
        origen: 'mensajes',
        expires_at: estadoFechaExpiracion()
    });

    if (ins.error) {
        await borrarArchivoStorage(sub.url);
        throw ins.error;
    }
    a.publicado = true;
}

async function publicarEstado() {
    if (estadoPublicando) return;
    if (!estadoArchivos.length) { aviso('Selecciona al menos una foto o video.', 'warning'); return; }
    if (!await auth()) return;

    estadoPublicando = true;
    pintarBotonPublicar(true);
    pintarProgresoPublicacion(0);

    const capInput = $('estadoCaption');
    const caption = capInput ? (capInput.value || '').trim().slice(0, 200) || null : null;
    const lote = estadoArchivos.slice();
    const fallidos = [];
    let ok = 0;

    try {
        const cuota = await consultarCuotas();
        const nuevosVideos = lote.filter(a => a.tipo === 'video').length;
        const nuevasFotos = lote.length - nuevosVideos;

        if (cuota.videos + nuevosVideos > ESTADOS_LIMITE.videos) {
            throw new Error('Ya tienes ' + cuota.videos + ' videos activos. El máximo es ' + ESTADOS_LIMITE.videos + '.');
        }
        if (cuota.imagenes + nuevasFotos > ESTADOS_LIMITE.imagenes) {
            throw new Error('Ya tienes ' + cuota.imagenes + ' fotos activas. El máximo es ' + ESTADOS_LIMITE.imagenes + '.');
        }

        for (let i = 0; i < lote.length; i++) {
            try {
                await publicarUno(lote[i], caption);
                ok++;
            } catch (e) {
                console.error('[Estados] Error publicando archivo ' + (i + 1) + ':', e);
                fallidos.push(lote[i].file.name);
            }
            pintarProgresoPublicacion((i + 1) / lote.length * 100);
        }

        if (ok === lote.length) aviso('Historias publicadas.', 'success');
        else if (ok > 0) aviso(ok + ' de ' + lote.length + ' historias publicadas.', 'warning');
        if (fallidos.length) aviso('No se pudieron publicar ' + fallidos.length + ' archivo(s).', 'error');
    } catch (e) {
        console.error('[Estados] Error general de publicación:', e);
        aviso(e.message || 'No se pudieron publicar las historias.', 'error');
    } finally {
        estadoArchivos = estadoArchivos.filter(a => {
            if (a.publicado) { try { URL.revokeObjectURL(a.url); } catch (e) {} return false; }
            return true;
        });
        estadoPublicando = false;
        pintarBotonPublicar(false);
        pintarPreview();
        if (ok > 0) {
            if (!estadoArchivos.length) cerrarModalEstado();
            await cargarEstados();
        }
    }
}

/* ---------------- Inicialización ---------------- */

function inicializarEstados() {
    instalarGestos();
    instalarControlesVideo();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarEstados, { once: true });
} else {
    inicializarEstados();
}