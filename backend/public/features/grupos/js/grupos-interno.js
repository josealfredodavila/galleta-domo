// ================================================================
// GRUPOS · VISTA INTERNA DEL CANAL (v4)
// ================================================================
// Abrir canal, membresía, feed de publicaciones, reacciones,
// interacciones, reportes, etiquetas, comentarios y acciones del canal.
// v4:
//  - Emojis decorativos reemplazados por SVG (rayo, alerta, menú, sonrisa).
//  - Las 5 reacciones compartidas se mantienen: ❤️ 😂 🥺 💎 🤩.
//  - Videos en contenedor 9:16 con marca de agua "C".
//  - Fotos con clase .post-imagen (ancho completo, max-height 560 px).
//  - Estilos inline eliminados: se usan las clases de grupos.css.
//  - volverALista() desconecta la sala con desconectarSalaLive().
// Depende de: grupos-config.js, grupos-utils.js, grupos-anuncios.js,
//             grupos-marketplace.js (mkTarjetaCompraHTML),
//             grupos-live.js (desconectarSalaLive), reacciones-global.js
// ================================================================

// ================================================================
// ICONOS SVG (sustituyen los emojis decorativos)
// ================================================================
var GRP_ICONO = {
    rayo: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    alerta: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    sonrisa: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
};

// Marca de agua "C" (misma que el feed de videos y el live)
var GRP_MARCA_AGUA =
    '<span class="marca-agua" aria-hidden="true">' +
        '<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="2" y="2" width="56" height="76" rx="8" fill="none" stroke="#D4AF37" stroke-width="3"/>' +
            '<text x="30" y="58" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="50" fill="#D4AF37">C</text>' +
        '</svg>' +
    '</span>';

// ================================================================
// EMOJIS · REACCIONES COMPARTIDAS CON PERFIL
// ================================================================
var GRP_CSS_EMOJIS = '/features/perfil/css/emojis-animations.css';

var GRP_CLASES_EMOJI = {
    '❤️': 'emo-corazon',
    '😂': 'emo-risa',
    '🥺': 'emo-brillo',
    '💎': 'emo-diamante',
    '🤩': 'emo-estrellas'
};

var GRP_CLASES_EMOJI_TODAS = ['emo-corazon', 'emo-risa', 'emo-brillo', 'emo-diamante', 'emo-estrellas', 'emo-fluido'];

// Picker de emojis para el texto de la publicación (contenido del usuario, no decorativo)
var GRP_EMOJIS_PICKER_DEFAULT = [
'😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😋','😛','😜',
'🤪','😎','🥳','😏','😒','😞','😔','😟','😕','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤯',
'😳','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🙄','😴','🤒','👍','👎','👏','🙌','🙏','🤝','💪','✌️',
'🤞','👌','❤️','🧡','💛','💚','💙','💜','🖤','💔','💯','🤩','⭐','✨','🎉','🎊','🎈','🎁','🏆','🥇',
'☕','🍕','🍔','🌮','🍩','🎵','🎶','🐶','🐱','🌹','🌈','☀️','🌙','⚡','💰','🚀','📸'
];

function grpCargarCssEmojis() {
    if (document.querySelector('link[href="' + GRP_CSS_EMOJIS + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = GRP_CSS_EMOJIS;
    document.head.appendChild(link);
}
grpCargarCssEmojis();

function grpClaseEmoji(emoji) {
    return GRP_CLASES_EMOJI[emoji] || 'emo-fluido';
}

function grpAplicarMotorEmojiLocal(el, emoji) {
    if (!el) return;
    GRP_CLASES_EMOJI_TODAS.forEach(function (clase) { el.classList.remove(clase); });
    el.classList.add(grpClaseEmoji(emoji));
    var duracion = 1.6 + Math.random() * 1.2;
    var retraso = -Math.random() * duracion;
    el.style.setProperty('--dur', duracion.toFixed(2) + 's');
    el.style.setProperty('--delay', retraso.toFixed(2) + 's');
}

// ================================================================
// REACCIONES Y AVATARES
// ================================================================
var RG_GRUPOS = window.ReaccionesGlobal;
// Las 5 reacciones compartidas. ReaccionesGlobal es la fuente de verdad.
var REACCIONES_DISPONIBLES = RG_GRUPOS
    ? RG_GRUPOS.EMOJIS.slice()
    : ['❤️', '😂', '🥺', '💎', '🤩'];
var misReacciones = {};

function normalizarReaccion(tipo) {
    if (RG_GRUPOS) return RG_GRUPOS.normalizar(tipo);
    return REACCIONES_DISPONIBLES.indexOf(tipo) !== -1 ? tipo : '❤️';
}

function animarEmojiGrupo(el, emoji) {
    if (!el) return;
    if (RG_GRUPOS && typeof RG_GRUPOS.aplicarMotor === 'function') {
        RG_GRUPOS.aplicarMotor(el, emoji);
    } else {
        grpAplicarMotorEmojiLocal(el, emoji);
    }
}

// Avatar: foto si existe; si no, la inicial del nombre
function avatarHTML(url, nombre) {
    var safe = grpSafeUrl(url);
    if (safe) {
        return '<img src="' + grpEscapeHTML(safe) + '" alt="">';
    }
    var inicial = (String(nombre || '?').trim().charAt(0) || '?').toUpperCase();
    return '<span class="grp-inicial">' + grpEscapeHTML(inicial) + '</span>';
}

async function cargarMisReacciones() {
    misReacciones = {};
    if (!sessionUser) return;
    try {
        var result = await window.supabaseClient
            .from('grupos_video_reacciones')
            .select('publicacion_id, tipo')
            .eq('usuario_id', sessionUser.id);
        if (!result.error && result.data) {
            result.data.forEach(function (r) {
                misReacciones[r.publicacion_id] = normalizarReaccion(r.tipo);
            });
        }
    } catch (e) {
        console.warn('Error reacciones:', e);
    }
}

// ================================================================
// VISOR DE IMÁGENES (PANTALLA COMPLETA)
// ================================================================
function abrirVisorGrupo(urlImagen) {
    var visor = document.getElementById('visorGrupoFull');
    if (visor) visor.remove();

    visor = document.createElement('div');
    visor.id = 'visorGrupoFull';
    visor.style.cssText =
        'position:fixed;inset:0;z-index:100000;background:#000;display:flex;align-items:center;' +
        'justify-content:center;opacity:0;transition:opacity .3s ease;touch-action:manipulation;';

    var img = document.createElement('img');
    img.src = urlImagen;
    img.alt = '';
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;transform:scale(.95);transition:transform .3s ease;';

    var btnCerrar = document.createElement('button');
    btnCerrar.type = 'button';
    btnCerrar.setAttribute('aria-label', 'Cerrar');
    btnCerrar.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px;">' +
            '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>' +
        '</svg>';
    btnCerrar.style.cssText =
        'position:absolute;top:calc(16px + env(safe-area-inset-top, 0px));right:16px;width:44px;height:44px;' +
        'border-radius:50%;border:0;background:rgba(255,255,255,0.1);cursor:pointer;display:flex;align-items:center;justify-content:center;';

    var cerrar = function () {
        visor.style.opacity = '0';
        img.style.transform = 'scale(.95)';
        setTimeout(function () { visor.remove(); }, 300);
        document.body.style.overflow = '';
    };

    btnCerrar.onclick = cerrar;
    visor.onclick = function (e) { if (e.target === visor) cerrar(); };

    var tocoY = 0;
    visor.addEventListener('touchstart', function (e) { tocoY = e.changedTouches[0].clientY; }, { passive: true });
    visor.addEventListener('touchend', function (e) {
        if (e.changedTouches[0].clientY - tocoY > 100) cerrar();
    }, { passive: true });

    visor.appendChild(img);
    visor.appendChild(btnCerrar);
    document.body.appendChild(visor);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function () {
        visor.style.opacity = '1';
        img.style.transform = 'scale(1)';
    });
}

// ================================================================
// MODERACIÓN
// ================================================================
function esErrorModeracionGrupo(error) {
    var msg = (error && error.message) ? String(error.message) : '';
    return msg.indexOf('contenido_no_permitido') !== -1;
}

function htmlAvisoModeracionGrupo() {
    return '<div class="grp-aviso-moderacion">' +
        GRP_ICONO.alerta +
        '<span>Este mensaje contiene lenguaje inapropiado. Considera expresarte con respeto.</span>' +
    '</div>';
}

// ================================================================
// SUBIDA SEGURA CON MODERACIÓN
// ================================================================
async function subirArchivoConModeracionGrupo(archivo, destino, tipo, token) {
    var fd = new FormData();
    fd.append('file', archivo);
    fd.append('destino', destino);
    fd.append('tipo', tipo);

    var respuesta = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: fd
    });

    var data = null;
    try { data = await respuesta.json(); } catch (e) { data = {}; }

    if (!respuesta.ok || !data.ok) {
        var error = new Error(data && data.error ? data.error : 'No se pudo subir el archivo');
        error.status = respuesta.status;
        throw error;
    }
    return data;
}

async function obtenerTokenSesion() {
    var session = await window.supabaseClient.auth.getSession();
    var token = session && session.data && session.data.session && session.data.session.access_token;
    if (!token) throw new Error('Sesión no disponible');
    return token;
}

// ================================================================
// ABRIR CANAL
// ================================================================
async function abrirGrupo(grupoId) {
    try {
        var result = await window.supabaseClient
            .from('grupos_video')
            .select('*, miembros:grupos_video_miembros(count)')
            .eq('id', grupoId)
            .single();
        if (result.error) throw result.error;

        grupoActual = result.data;
        grupoActualId = grupoId;

        var url = new URL(window.location);
        url.searchParams.set('grupo', grupoId);
        window.history.replaceState({ grupoId: grupoId }, '', url);

        await verificarMembresia(grupoId);
        await verificarLiveActivoGrupo(grupoId);
        await cargarMisInteracciones();
        await cargarMisNotificaciones();

        document.getElementById('vistaLista').style.display = 'none';
        document.getElementById('vistaGrupo').classList.add('show');

        document.getElementById('grupoNombre').textContent = grupoActual.nombre || 'Sin nombre';
        document.getElementById('grupoDescripcion').textContent = grupoActual.descripcion || 'Sin descripción';

        var ubicacion = [];
        if (grupoActual.municipio) ubicacion.push(grupoActual.municipio);
        if (grupoActual.estado_region) ubicacion.push(grupoActual.estado_region);
        if (grupoActual.pais) ubicacion.push(grupoActual.pais);
        document.getElementById('grupoCiudad').innerHTML =
            '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
            grpEscapeHTML(ubicacion.length > 0 ? ubicacion.join(', ') : 'Sin ubicación');

        document.getElementById('grupoMiembros').innerHTML =
            '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' +
            grpEscapeHTML(grupoActual.miembros && grupoActual.miembros[0] ? grupoActual.miembros[0].count || 0 : 0) + ' seguidores';

        var vis = grupoActual.visibilidad || 'publico';
        document.getElementById('grupoEstadoBadge').innerHTML = vis === 'publico'
            ? '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Público'
            : '<svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Privado';

        var mkBadgeEl = document.getElementById('grupoMkBadge');
        if (mkBadgeEl) mkBadgeEl.style.display = grupoActual.marketplace_activo ? 'inline-flex' : 'none';

        var btnMk = document.getElementById('btnMarketplace');
        if (btnMk) btnMk.style.display = (grupoActual.marketplace_activo && esMiembro()) ? 'inline-flex' : 'none';

        var mkAviso = document.getElementById('marketplaceAviso');
        if (mkAviso) mkAviso.style.display = !grupoActual.marketplace_activo ? 'block' : 'none';

        var btnDonar = document.getElementById('btnDonar');
        if (btnDonar) {
            var etiquetaDonar = grupoActual.precio_usdt > 0 ? 'Donar $' + grupoActual.precio_usdt + ' USDT' : 'Donar USDT';
            btnDonar.innerHTML =
                '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 11h6"/></svg> ' +
                grpEscapeHTML(etiquetaDonar);
        }

        var avatarEl = document.getElementById('grupoAvatar');
        var avatarImg = grpSafeUrl(grupoActual.avatar_url);
        if (avatarImg) avatarEl.innerHTML = '<img src="' + grpEscapeHTML(avatarImg) + '" alt="">';
        else avatarEl.textContent = '◈';

        var portadaEl = document.getElementById('grupoPortada');
        var portadaImg = grpSafeUrl(grupoActual.portada_url);
        if (portadaImg) {
            portadaEl.innerHTML = '<video src="' + grpEscapeHTML(portadaImg) + '" autoplay loop muted playsinline></video>';
        } else {
            portadaEl.textContent = '◈';
        }

        document.getElementById('btnAjustesCanal').style.display = (esAdmin || esCreador) ? 'flex' : 'none';

        reconstruirBotonesAcciones();

        await cargarPublicacionesGrupo(grupoId);
        adCerrado = false;
        iniciarRefrescoAnuncios();
    } catch (e) {
        console.error('[Grupos] Error abriendo canal:', e);
        grpShowToast('Error al abrir canal', 'error');
    }
}

// ================================================================
// BOTONES DE ACCIONES (unirse / solicitar / live)
// ================================================================
function reconstruirBotonesAcciones() {
    var contenedor = document.getElementById('grupoAcciones');
    if (!contenedor) return;

    var btnLive = document.getElementById('btnIniciarLive');
    var btnVerLive = document.getElementById('btnVerLive');
    var btnFinalizarLive = document.getElementById('btnFinalizarLive');

    var btnUnirseExistente = document.getElementById('btnUnirseGrupo');
    if (btnUnirseExistente) btnUnirseExistente.remove();

    if (liveActivoEnGrupo) {
        if (btnVerLive) btnVerLive.style.display = 'inline-flex';
        document.getElementById('grupoLiveBadge').style.display = 'inline-flex';
        var soyStreamer = !!(sessionUser && liveActivoEnGrupo.streamer_id === sessionUser.id);
        if (btnFinalizarLive) btnFinalizarLive.style.display = soyStreamer ? 'inline-flex' : 'none';
        if (btnLive) btnLive.style.display = 'none';
    } else {
        if (btnVerLive) btnVerLive.style.display = 'none';
        document.getElementById('grupoLiveBadge').style.display = 'none';
        if (btnFinalizarLive) btnFinalizarLive.style.display = 'none';
        if (btnLive) btnLive.style.display = esMiembro() ? 'inline-flex' : 'none';
    }

    if (sessionUser && !esMiembro()) {
        var modo = grupoActual && grupoActual.modo_ingreso ? grupoActual.modo_ingreso : 'abierto';
        var btnUnirse = document.createElement('button');
        btnUnirse.id = 'btnUnirseGrupo';
        btnUnirse.className = 'btn-gold btn-sm';
        btnUnirse.style.display = 'inline-flex';

        if (modo === 'abierto') {
            btnUnirse.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> Unirse';
            btnUnirse.onclick = unirseAlGrupo;
        } else if (modo === 'solicitud') {
            btnUnirse.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Solicitar';
            btnUnirse.onclick = solicitarUnirseAlGrupo;
        } else if (modo === 'invitacion') {
            btnUnirse.disabled = true;
            btnUnirse.style.opacity = '0.5';
            btnUnirse.style.cursor = 'not-allowed';
            btnUnirse.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Solo por invitación';
        }
        contenedor.appendChild(btnUnirse);
    }
}

// ================================================================
// UNIRSE / SOLICITAR
// ================================================================
async function unirseAlGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) return;
    try {
        grpOk(await window.supabaseClient.from('grupos_video_miembros').insert({
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id,
            rol: 'miembro',
            estado: 'activo'
        }));
        grpShowToast('Te has unido al canal', 'success');
        await abrirGrupo(grupoActualId);
    } catch (e) {
        grpShowToast('Error al unirse: ' + (e.message || e), 'error');
    }
}

async function solicitarUnirseAlGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) return;
    try {
        var existente = await window.supabaseClient
            .from('grupos_video_solicitudes')
            .select('id')
            .eq('grupo_id', grupoActualId)
            .eq('usuario_id', sessionUser.id)
            .eq('estado', 'pendiente')
            .maybeSingle();
        if (existente.data) {
            grpShowToast('Solicitud enviada', 'info');
            return;
        }
        grpOk(await window.supabaseClient.from('grupos_video_solicitudes').insert({
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id
        }));
        grpShowToast('Solicitud enviada', 'success');
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

// ================================================================
// MEMBRESÍA / LIVE ACTIVO
// ================================================================
async function verificarMembresia(grupoId) {
    try {
        if (!sessionUser) {
            esAdmin = false; esModerador = false; esCreador = false; rolEnGrupo = null;
            return;
        }
        esCreador = !!(grupoActual && grupoActual.creador_id === sessionUser.id);
        var result = await window.supabaseClient
            .from('grupos_video_miembros')
            .select('rol, estado')
            .eq('grupo_id', grupoId)
            .eq('usuario_id', sessionUser.id)
            .maybeSingle();
        if (!result.data) {
            esAdmin = false; esModerador = false; rolEnGrupo = null;
            return;
        }
        rolEnGrupo = result.data.rol || 'miembro';
        esAdmin = rolEnGrupo === 'administrador';
        esModerador = rolEnGrupo === 'moderador' || esAdmin;
        if (esCreador) esAdmin = true;
    } catch (e) {
        esAdmin = false; esModerador = false; esCreador = false; rolEnGrupo = null;
    }
}

function esMiembro() {
    return rolEnGrupo !== null || esCreador;
}

async function verificarLiveActivoGrupo(grupoId) {
    try {
        var result = await window.supabaseClient
            .from('transmisiones')
            .select('*')
            .eq('grupo_id', grupoId)
            .eq('estado', 'en_vivo')
            .eq('is_live', true)
            .maybeSingle();
        liveActivoEnGrupo = result.data || null;
        if (liveActivoEnGrupo) currentStreamGrupoId = liveActivoEnGrupo.id;
        return liveActivoEnGrupo;
    } catch (e) {
        liveActivoEnGrupo = null;
        return null;
    }
}

// ================================================================
// INTERACCIONES / NOTIFICACIONES
// ================================================================
async function cargarMisInteracciones() {
    misInteracciones = {};
    if (!sessionUser) return;
    try {
        var result = await window.supabaseClient
            .from('grupos_video_interacciones')
            .select('publicacion_id, tipo')
            .eq('usuario_id', sessionUser.id);
        if (!result.error && result.data) {
            result.data.forEach(function (i) {
                if (!misInteracciones[i.publicacion_id]) misInteracciones[i.publicacion_id] = {};
                misInteracciones[i.publicacion_id][i.tipo] = true;
            });
        }
    } catch (e) {
        console.warn('Error interacciones:', e);
    }
}

async function cargarMisNotificaciones() {
    misNotificaciones = {};
    if (!sessionUser) return;
    try {
        var result = await window.supabaseClient
            .from('grupos_video_notificaciones')
            .select('publicacion_id')
            .eq('usuario_id', sessionUser.id);
        if (!result.error && result.data) {
            result.data.forEach(function (n) { misNotificaciones[n.publicacion_id] = true; });
        }
    } catch (e) {
        console.warn('Error notificaciones:', e);
    }
}

// ================================================================
// FEED · FILTROS
// ================================================================
function filtrarFeed(filtro) {
    filtroFeedActual = filtro;
    document.querySelectorAll('.feed-filtro-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.filtro === filtro);
    });
    renderizarPublicacionesCache();
}

function renderizarPublicacionesCache() {
    var container = document.getElementById('publicacionesContainer');
    if (!container) return;

    var filtradas = publicacionesCache.filter(function (p) {
        return !(misInteracciones[p.id] && misInteracciones[p.id].no_quiero_ver);
    });

    if (filtroFeedActual === 'marketplace') {
        filtradas = filtradas.filter(function (p) { return !!p.tipo_marketplace; });
    } else if (filtroFeedActual === 'publicaciones') {
        filtradas = filtradas.filter(function (p) { return !p.tipo_marketplace; });
    } else if (filtroFeedActual === 'interesados') {
        filtradas = filtradas.filter(function (p) {
            return misInteracciones[p.id] && misInteracciones[p.id].me_interesa;
        });
    }

    if (filtradas.length === 0) {
        var mensajes = {
            'todo': 'Sin publicaciones aún',
            'marketplace': 'No hay publicaciones de marketplace',
            'publicaciones': 'No hay publicaciones normales',
            'interesados': 'Aún no has marcado ninguna publicación como "Me interesa"'
        };
        container.innerHTML =
            '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg>' +
            '<h3>' + grpEscapeHTML(mensajes[filtroFeedActual] || 'Sin publicaciones') + '</h3></div>';
        return;
    }

    container.innerHTML = filtradas.map(renderizarPublicacionHTML).join('');

    container.querySelectorAll('.grp-react-picker button[data-emoji]').forEach(function (b) {
        animarEmojiGrupo(b, b.getAttribute('data-emoji'));
    });
    container.querySelectorAll('.grp-react-trigger-emoji[data-emoji]').forEach(function (el) {
        var valor = el.getAttribute('data-emoji');
        if (valor && valor !== 'ninguna') animarEmojiGrupo(el, valor);
    });
}

// ================================================================
// REACCIONES · barra y conteo
// ================================================================
function htmlBarraReacciones(p) {
    var mia = misReacciones[p.id] || null;
    var total = p.likes_count || 0;

    var resumen = {};
    var crudo = p.reacciones_resumen || {};
    Object.keys(crudo).forEach(function (k) {
        var e = normalizarReaccion(k);
        resumen[e] = (resumen[e] || 0) + (Number(crudo[k]) || 0);
    });
    var resumenTxt = Object.keys(resumen)
        .filter(function (e) { return resumen[e] > 0; })
        .map(function (e) { return e + ' ' + resumen[e]; })
        .join('  ');

    var opciones = REACCIONES_DISPONIBLES.map(function (e) {
        var activa = mia === e ? ' activa' : '';
        return '<button type="button" data-emoji="' + grpEscapeHTML(e) + '" class="' + activa.trim() + '" ' +
            'onclick="reaccionarPublicacion(' + Number(p.id) + ', \'' + e + '\')">' + e + '</button>';
    }).join('');

    var disparador = mia
        ? '<span class="grp-react-trigger-emoji" data-emoji="' + grpEscapeHTML(mia) + '">' + mia + '</span>'
        : '<span class="grp-react-trigger-emoji" data-emoji="ninguna">' + GRP_ICONO.sonrisa + '</span>';

    return '<div class="grp-react-wrap">' +
        '<button type="button" class="grp-react-trigger" onclick="toggleReaccionPicker(' + Number(p.id) + ')">' +
            disparador +
            '<span>' + grpEscapeHTML(total) + '</span>' +
        '</button>' +
        (resumenTxt ? '<span class="grp-react-resumen">' + grpEscapeHTML(resumenTxt) + '</span>' : '') +
        '<div id="reactPicker-' + Number(p.id) + '" class="grp-react-picker">' + opciones + '</div>' +
    '</div>';
}

function toggleReaccionPicker(publicacionId) {
    var picker = document.getElementById('reactPicker-' + publicacionId);
    if (!picker) return;
    var abierto = picker.style.display === 'flex';
    document.querySelectorAll('.grp-react-picker').forEach(function (p) { p.style.display = 'none'; });
    picker.style.display = abierto ? 'none' : 'flex';
}

// Una reacción por persona: la misma la quita; otra la cambia; ninguna la agrega
async function reaccionarPublicacion(publicacionId, emoji) {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (REACCIONES_DISPONIBLES.indexOf(emoji) === -1) return;
    document.querySelectorAll('.grp-react-picker').forEach(function (p) { p.style.display = 'none'; });

    var actual = misReacciones[publicacionId] || null;
    try {
        if (actual === emoji) {
            grpOk(await window.supabaseClient.from('grupos_video_reacciones').delete()
                .eq('publicacion_id', publicacionId).eq('usuario_id', sessionUser.id));
            delete misReacciones[publicacionId];
        } else if (actual) {
            grpOk(await window.supabaseClient.from('grupos_video_reacciones').update({ tipo: emoji })
                .eq('publicacion_id', publicacionId).eq('usuario_id', sessionUser.id));
            misReacciones[publicacionId] = emoji;
        } else {
            grpOk(await window.supabaseClient.from('grupos_video_reacciones').insert({
                publicacion_id: publicacionId,
                usuario_id: sessionUser.id,
                tipo: emoji
            }));
            misReacciones[publicacionId] = emoji;
        }
        await cargarPublicacionesGrupo(grupoActualId);
    } catch (e) {
        console.warn('Error reaccionando:', e);
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

// ================================================================
// MEDIOS DE LA PUBLICACIÓN
// Foto: .post-imagen (ancho completo, max 560 px).
// Video: contenedor 9:16 con marca de agua.
// ================================================================
function htmlMediaPublicacion(p) {
    var html = '';
    var imgUrl = grpSafeUrl(p.imagen_url);
    var vidUrl = grpSafeUrl(p.video_url);

    if (imgUrl) {
        html += '<img class="post-imagen" src="' + grpEscapeHTML(imgUrl) + '" alt="" loading="lazy" ' +
            'onclick="abrirVisorGrupo(this.src)">';
    }
    if (vidUrl) {
        html += '<div class="video-9x16">' +
            '<video src="' + grpEscapeHTML(vidUrl) + '" controls playsinline preload="metadata"></video>' +
            GRP_MARCA_AGUA +
        '</div>';
    }
    return html;
}

// ================================================================
// RENDERIZAR PUBLICACIÓN
// ================================================================
function htmlHandle(handle) {
    if (!handle) return '';
    return '<span class="grp-post-handle"><span class="grp-bolt">' + GRP_ICONO.rayo + '</span>@' +
        grpEscapeHTML(handle) + '</span>';
}

function htmlMarketplace(p) {
    if (!p.tipo_marketplace) return '';

    var tipoLabels = { vendo: 'VENDO', rento: 'RENTO', busco: 'BUSCO', regalo: 'REGALO', servicio: 'SERVICIO' };
    var tipoLabel = tipoLabels[p.tipo_marketplace] || String(p.tipo_marketplace).toUpperCase();

    var precioHTML = '';
    if (p.precio_mxn) precioHTML += '<span class="precio">$' + parseFloat(p.precio_mxn).toFixed(2) + ' MXN</span>';
    if (p.precio_usdt) precioHTML += '<span class="precio-usdt">≈ $' + parseFloat(p.precio_usdt).toFixed(2) + ' USDT</span>';

    var ubiParts = [];
    if (p.municipio) ubiParts.push(p.municipio);
    if (p.estado_region) ubiParts.push(p.estado_region);
    var ubicacionHTML = ubiParts.length > 0
        ? '<div class="ubicacion"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + grpEscapeHTML(ubiParts.join(', ')) + '</div>'
        : '';

    var contactoHTML = '';
    if (p.whatsapp) {
        var wapp = String(p.whatsapp).replace(/\D/g, '');
        if (wapp.length >= 10) contactoHTML += '<a href="https://wa.me/52' + wapp + '" target="_blank" rel="noopener" class="btn-whatsapp">WhatsApp</a>';
    }
    if (p.telefono_contacto) {
        var tel = String(p.telefono_contacto).replace(/\D/g, '');
        if (tel.length >= 10) contactoHTML += '<a href="tel:+52' + tel + '" class="btn-llamar">Llamar</a>';
    }
    var contactoDiv = contactoHTML ? '<div class="contacto">' + contactoHTML + '</div>' : '';

    var descripcionHTML = p.descripcion
        ? '<div class="mk-descripcion">' + grpEscapeHTML(p.descripcion) + '</div>'
        : '';

    return '<div class="marketplace-info">' +
        '<div class="titulo-mk"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' + grpEscapeHTML(tipoLabel) + '</div>' +
        descripcionHTML +
        '<div>' + precioHTML + '</div>' + ubicacionHTML + contactoDiv +
    '</div>' + mkTarjetaCompraHTML(p);
}

function htmlMenuPublicacion(p, esMia) {
    var id = Number(p.id);
    var eliminarItem = esMia
        ? '<button class="post-menu-item danger" onclick="eliminarMiPublicacion(' + id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> Eliminar mi publicación</button><div class="post-menu-separator"></div>'
        : '';

    return eliminarItem +
        '<button class="post-menu-item" onclick="toggleMeInteresa(' + id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1 3-6z"/></svg> Me interesa</button>' +
        '<button class="post-menu-item" onclick="toggleNoMeInteresa(' + id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> No me interesa</button>' +
        '<button class="post-menu-item" onclick="abrirModalEtiquetar(' + id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> Etiquetar foto</button>' +
        '<button class="post-menu-item" onclick="toggleNotificacion(' + id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> ' + (misNotificaciones[id] ? 'Desactivar notificaciones' : 'Activar notificaciones') + '</button>' +
        '<button class="post-menu-item" onclick="ocultarPublicacionUsuario(' + id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> No quiero ver esto</button>' +
        '<button class="post-menu-item" onclick="copiarEnlacePost(' + id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Copiar enlace</button>' +
        '<button class="post-menu-item" onclick="compartirPublicacion(' + id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/></svg> Compartir</button>' +
        '<div class="post-menu-separator"></div>' +
        '<button class="post-menu-item danger" onclick="abrirModalReportar(' + id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> Reportar publicación</button>' +
        '<button class="post-menu-item danger" onclick="abrirModalReportarAdmin(' + id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Reportar al administrador</button>';
}

function renderizarPublicacionHTML(p) {
    var id = Number(p.id);
    var esMia = !!(sessionUser && p.usuario_id === sessionUser.id);
    var mias = misInteracciones[id] || {};
    var claseMK = p.tipo_marketplace ? ' marketplace ' + grpEscapeHTML(p.tipo_marketplace) : '';
    var avisoHTML = p.aviso_moderacion === 'lenguaje_inapropiado' ? htmlAvisoModeracionGrupo() : '';
    var textoHTML = p.contenido ? '<p class="grp-texto">' + grpEscapeHTML(p.contenido) + '</p>' : '';

    return '<div class="publicacion-card' + claseMK + '" data-pub-id="' + id + '">' +
        '<div class="header">' +
            '<div class="avatar">' + avatarHTML(p.usuario_avatar_url, p.usuario_nombre) + '</div>' +
            '<div style="flex:1;min-width:0;">' +
                '<div class="nombre">' + grpEscapeHTML(p.usuario_nombre || 'Usuario') + htmlHandle(p.usuario_handle) + '</div>' +
                '<div class="fecha">' + grpEscapeHTML(new Date(p.created_at).toLocaleString()) + '</div>' +
            '</div>' +
            '<div class="post-menu-wrapper">' +
                '<button type="button" class="post-menu-btn" onclick="togglePostMenu(event, ' + id + ')" aria-label="Opciones">' + GRP_ICONO.menu + '</button>' +
                '<div class="post-menu-dropdown" id="postMenu-' + id + '">' + htmlMenuPublicacion(p, esMia) + '</div>' +
            '</div>' +
        '</div>' +
        avisoHTML +
        '<div class="contenido">' + textoHTML + htmlMediaPublicacion(p) + '</div>' +
        htmlMarketplace(p) +
        '<div class="stats">' +
            htmlBarraReacciones(p) +
            '<span onclick="toggleComentariosPublicacion(' + id + ')">' +
                '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> ' +
                '<span id="comentarios-' + id + '">' + grpEscapeHTML(p.comentarios_count || 0) + '</span>' +
            '</span>' +
            '<span class="' + (mias.me_interesa ? 'interesado' : '') + '" onclick="toggleMeInteresa(' + id + ')" id="interesa-' + id + '">' +
                '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1 3-6z"/></svg> ' +
                (mias.me_interesa ? 'Interesado' : 'Me interesa') +
            '</span>' +
            (misNotificaciones[id] ? '<span class="grp-notificado"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Notificado</span>' : '') +
        '</div>' +
        '<div class="comentarios-container" id="comentariosContainer-' + id + '" style="display:none;">' +
            '<div id="comentariosLista-' + id + '"></div>' +
            '<div class="grp-comentar-row">' +
                '<input type="text" id="inputComentario-' + id + '" placeholder="Escribe un comentario…" maxlength="500">' +
                '<button type="button" onclick="enviarComentarioPublicacion(' + id + ')">Enviar</button>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// ================================================================
// ELIMINAR MI PUBLICACIÓN (solo el autor)
// ================================================================
async function eliminarMiPublicacion(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!confirm('¿Eliminar esta publicación? Ya no se verá en el canal.')) return;
    try {
        var r = await window.supabaseClient.rpc('eliminar_mi_publicacion', { p_publicacion_id: String(publicacionId) });
        if (r.error) throw r.error;
        if (!r.data || r.data.ok !== true) {
            var motivo = r.data && r.data.error === 'no_es_dueno'
                ? 'Solo el autor puede eliminar esta publicación'
                : 'No se pudo eliminar la publicación';
            throw new Error(motivo);
        }
        grpShowToast('Publicación eliminada', 'success');
        await cargarPublicacionesGrupo(grupoActualId);
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

// ================================================================
// MENÚ DE PUBLICACIÓN
// ================================================================
function togglePostMenu(event, publicacionId) {
    event.stopPropagation();
    var menuActual = document.getElementById('postMenu-' + publicacionId);
    var menuAbierto = menuActual && menuActual.classList.contains('show');
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    if (!menuAbierto && menuActual) menuActual.classList.add('show');
}

document.addEventListener('click', function (e) {
    if (!e.target.closest('.post-menu-wrapper')) {
        document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    }
    if (!e.target.closest('.grp-react-wrap')) {
        document.querySelectorAll('.grp-react-picker').forEach(function (p) { p.style.display = 'none'; });
    }
});

// ================================================================
// INTERACCIONES
// ================================================================
async function toggleInteraccion(publicacionId, tipo) {
    if (!sessionUser) { grpShowToast('Inicia sesión para interactuar', 'error'); return false; }
    try {
        var tieneActual = misInteracciones[publicacionId] && misInteracciones[publicacionId][tipo];
        if (tieneActual) {
            grpOk(await window.supabaseClient.from('grupos_video_interacciones').delete()
                .eq('publicacion_id', publicacionId).eq('usuario_id', sessionUser.id).eq('tipo', tipo));
            delete misInteracciones[publicacionId][tipo];
        } else {
            if (tipo === 'me_interesa' || tipo === 'no_me_interesa') {
                var opuesto = tipo === 'me_interesa' ? 'no_me_interesa' : 'me_interesa';
                if (misInteracciones[publicacionId] && misInteracciones[publicacionId][opuesto]) {
                    grpOk(await window.supabaseClient.from('grupos_video_interacciones').delete()
                        .eq('publicacion_id', publicacionId).eq('usuario_id', sessionUser.id).eq('tipo', opuesto));
                    delete misInteracciones[publicacionId][opuesto];
                }
            }
            grpOk(await window.supabaseClient.from('grupos_video_interacciones').insert({
                publicacion_id: publicacionId,
                usuario_id: sessionUser.id,
                tipo: tipo
            }));
            if (!misInteracciones[publicacionId]) misInteracciones[publicacionId] = {};
            misInteracciones[publicacionId][tipo] = true;
        }
        return true;
    } catch (e) {
        console.error('Error interacción:', e);
        grpShowToast('Error: ' + (e.message || e), 'error');
        return false;
    }
}

async function toggleMeInteresa(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    if (await toggleInteraccion(publicacionId, 'me_interesa')) {
        var esta = misInteracciones[publicacionId] && misInteracciones[publicacionId].me_interesa;
        grpShowToast(esta ? 'Marcado como interesado' : 'Interacción quitada', esta ? 'success' : '');
        renderizarPublicacionesCache();
    }
}

async function toggleNoMeInteresa(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    if (await toggleInteraccion(publicacionId, 'no_me_interesa')) {
        var esta = misInteracciones[publicacionId] && misInteracciones[publicacionId].no_me_interesa;
        grpShowToast(esta ? 'Marcado como "no me interesa"' : 'Interacción quitada', esta ? 'warning' : '');
        renderizarPublicacionesCache();
    }
}

async function ocultarPublicacionUsuario(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    if (await toggleInteraccion(publicacionId, 'no_quiero_ver')) {
        grpShowToast('Publicación oculta', 'success');
        renderizarPublicacionesCache();
    }
}

async function toggleNotificacion(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    try {
        if (misNotificaciones[publicacionId]) {
            grpOk(await window.supabaseClient.from('grupos_video_notificaciones').delete()
                .eq('publicacion_id', publicacionId).eq('usuario_id', sessionUser.id));
            delete misNotificaciones[publicacionId];
            grpShowToast('Notificaciones desactivadas', '');
        } else {
            grpOk(await window.supabaseClient.from('grupos_video_notificaciones').insert({
                publicacion_id: publicacionId,
                usuario_id: sessionUser.id
            }));
            misNotificaciones[publicacionId] = true;
            grpShowToast('Notificaciones activadas', 'success');
        }
        renderizarPublicacionesCache();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

// ================================================================
// COMPARTIR / COPIAR ENLACE
// ================================================================
function urlPublicacion(publicacionId) {
    return window.location.origin + '/features/grupos/grupos.html?grupo=' +
        encodeURIComponent(grupoActualId) + '&publicacion=' + encodeURIComponent(publicacionId);
}

function copiarEnlacePost(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    var url = urlPublicacion(publicacionId);
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url)
            .then(function () { grpShowToast('Enlace copiado', 'success'); })
            .catch(function () { prompt('Copia el enlace:', url); });
    } else {
        prompt('Copia el enlace:', url);
    }
}

function compartirPublicacion(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    var url = urlPublicacion(publicacionId);
    if (navigator.share) {
        navigator.share({ title: "Csariel's", text: 'Mira esto', url: url }).catch(function () {});
    } else {
        navigator.clipboard.writeText(url).then(function () { grpShowToast('Enlace copiado', 'success'); });
    }
}

// ================================================================
// REPORTES
// ================================================================
function abrirModalReportar(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    publicacionReportando = publicacionId;
    document.getElementById('inputMotivoReporte').value = '';
    document.getElementById('inputDescripcionReporte').value = '';
    document.getElementById('reporteStatus').textContent = '';
    document.getElementById('modalReportarPublicacion').classList.add('show');
}

function cerrarModalReportar() {
    document.getElementById('modalReportarPublicacion').classList.remove('show');
    publicacionReportando = null;
}

async function enviarReportePublicacion() {
    if (!publicacionReportando) return;
    var motivo = document.getElementById('inputMotivoReporte').value;
    var descripcion = document.getElementById('inputDescripcionReporte').value.trim();
    var statusEl = document.getElementById('reporteStatus');
    if (!motivo) { statusEl.textContent = 'Selecciona un motivo'; statusEl.style.color = 'var(--warning)'; return; }
    statusEl.textContent = 'Enviando reporte...';
    statusEl.style.color = 'var(--text-muted)';
    try {
        grpOk(await window.supabaseClient.from('grupos_video_reportes').insert({
            publicacion_id: publicacionReportando,
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id,
            tipo: 'publicacion',
            motivo: motivo,
            descripcion: descripcion || null,
            estado: 'pendiente'
        }));
        statusEl.textContent = 'Reporte enviado. Gracias.';
        statusEl.style.color = 'var(--success)';
        grpShowToast('Reporte enviado', 'success');
        setTimeout(cerrarModalReportar, 1500);
    } catch (e) {
        statusEl.textContent = 'Error: ' + e.message;
        statusEl.style.color = 'var(--danger)';
    }
}

function abrirModalReportarAdmin(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    publicacionReportando = publicacionId;
    document.getElementById('inputTipoReporteAdmin').value = '';
    document.getElementById('inputMotivoReporteAdmin').value = '';
    document.getElementById('inputDescripcionReporteAdmin').value = '';
    document.getElementById('reporteAdminStatus').textContent = '';
    document.getElementById('modalReportarAdmin').classList.add('show');
}

function cerrarModalReportarAdmin() {
    document.getElementById('modalReportarAdmin').classList.remove('show');
}

async function enviarReporteAdmin() {
    var tipo = document.getElementById('inputTipoReporteAdmin').value;
    var motivo = document.getElementById('inputMotivoReporteAdmin').value;
    var descripcion = document.getElementById('inputDescripcionReporteAdmin').value.trim();
    var statusEl = document.getElementById('reporteAdminStatus');
    if (!tipo) { statusEl.textContent = 'Selecciona el tipo'; statusEl.style.color = 'var(--warning)'; return; }
    if (!motivo) { statusEl.textContent = 'Selecciona un motivo'; statusEl.style.color = 'var(--warning)'; return; }
    if (!descripcion) { statusEl.textContent = 'Describe el problema'; statusEl.style.color = 'var(--warning)'; return; }
    statusEl.textContent = 'Enviando reporte al admin...';
    statusEl.style.color = 'var(--text-muted)';
    try {
        grpOk(await window.supabaseClient.from('grupos_video_reportes').insert({
            publicacion_id: publicacionReportando || null,
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id,
            tipo: tipo,
            motivo: motivo,
            descripcion: descripcion,
            estado: 'pendiente'
        }));
        statusEl.textContent = 'Reporte enviado al administrador.';
        statusEl.style.color = 'var(--success)';
        grpShowToast('Reporte al admin enviado', 'success');
        setTimeout(cerrarModalReportarAdmin, 1500);
    } catch (e) {
        statusEl.textContent = 'Error: ' + e.message;
        statusEl.style.color = 'var(--danger)';
    }
}

// ================================================================
// ETIQUETAR FOTO
// ================================================================
function abrirModalEtiquetar(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function (m) { m.classList.remove('show'); });
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    var pub = publicacionesCache.find(function (p) { return p.id === publicacionId; });
    if (!pub || !pub.imagen_url) {
        grpShowToast('Esta publicación no tiene foto para etiquetar', 'warning');
        return;
    }
    publicacionReportando = publicacionId;
    etiquetadosSeleccionados = [];
    document.getElementById('imagenEtiquetar').src = grpSafeUrl(pub.imagen_url);
    document.getElementById('inputBuscarUsuarioEtiqueta').value = '';
    document.getElementById('resultadosUsuariosEtiqueta').innerHTML = '';
    document.getElementById('etiquetadosSeleccionados').innerHTML = '';
    document.getElementById('modalEtiquetarFoto').classList.add('show');
}

function cerrarModalEtiquetar() {
    document.getElementById('modalEtiquetarFoto').classList.remove('show');
}

async function buscarUsuariosEtiqueta() {
    var q = document.getElementById('inputBuscarUsuarioEtiqueta').value.trim();
    var container = document.getElementById('resultadosUsuariosEtiqueta');
    if (!q || q.length < 2) { container.innerHTML = ''; return; }
    q = q.replace(/[(),%*\\]/g, ' ').trim();
    if (!q) { container.innerHTML = ''; return; }
    try {
        var result = await window.supabaseClient
            .from('perfiles_publicos')
            .select('id, nombre, handle, avatar_url')
            .or('nombre.ilike.%' + q + '%,handle.ilike.%' + q + '%')
            .neq('id', sessionUser.id)
            .limit(10);
        if (result.error || !result.data) {
            container.innerHTML = '<div class="grp-vacio-mini">Sin resultados</div>';
            return;
        }
        container.innerHTML = result.data.map(function (u) {
            var yaSel = etiquetadosSeleccionados.find(function (e) { return e.id === u.id; });
            return '<div class="usuario-etiqueta-item' + (yaSel ? ' seleccionado' : '') + '" data-id="' + grpEscapeHTML(u.id) + '" ' +
                'data-nombre="' + grpEscapeHTML(u.nombre || '') + '" data-handle="' + grpEscapeHTML(u.handle || '') + '" ' +
                'data-avatar="' + grpEscapeHTML(grpSafeUrl(u.avatar_url) || '') + '">' +
                '<div class="grp-etiqueta-avatar">' + avatarHTML(u.avatar_url, u.nombre) + '</div>' +
                '<div><div class="grp-etiqueta-nombre">' + grpEscapeHTML(u.nombre || 'Usuario') + '</div>' +
                '<div class="grp-etiqueta-handle">@' + grpEscapeHTML(u.handle || 'usuario') + '</div></div>' +
            '</div>';
        }).join('');

        container.querySelectorAll('.usuario-etiqueta-item:not(.seleccionado)').forEach(function (el) {
            el.addEventListener('click', function () {
                agregarEtiqueta(el.dataset.id, el.dataset.nombre, el.dataset.handle, el.dataset.avatar);
            });
        });
    } catch (e) {
        console.warn('Error buscando:', e);
    }
}

function agregarEtiqueta(id, nombre, handle, avatarUrl) {
    if (etiquetadosSeleccionados.find(function (e) { return e.id === id; })) return;
    etiquetadosSeleccionados.push({ id: id, nombre: nombre, handle: handle, avatar_url: avatarUrl });
    renderEtiquetadosSeleccionados();
    document.getElementById('inputBuscarUsuarioEtiqueta').value = '';
    document.getElementById('resultadosUsuariosEtiqueta').innerHTML = '';
}

function renderEtiquetadosSeleccionados() {
    var container = document.getElementById('etiquetadosSeleccionados');
    if (etiquetadosSeleccionados.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = etiquetadosSeleccionados.map(function (e) {
        return '<span class="grp-chip">@' + grpEscapeHTML(e.handle) +
            ' <button type="button" class="quitar-etiqueta-btn" data-id="' + grpEscapeHTML(e.id) + '" aria-label="Quitar">×</button></span>';
    }).join('');

    container.querySelectorAll('.quitar-etiqueta-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { quitarEtiqueta(btn.dataset.id); });
    });
}

function quitarEtiqueta(id) {
    etiquetadosSeleccionados = etiquetadosSeleccionados.filter(function (e) { return e.id !== id; });
    renderEtiquetadosSeleccionados();
}

async function guardarEtiquetas() {
    if (etiquetadosSeleccionados.length === 0) {
        grpShowToast('Selecciona al menos una persona', 'warning');
        return;
    }
    if (!publicacionReportando) return;
    grpShowToast('Guardando etiquetas...', '');
    try {
        var inserts = etiquetadosSeleccionados.map(function (e) {
            return { publicacion_id: publicacionReportando, etiquetado_id: e.id, etiquetado_por: sessionUser.id };
        });
        grpOk(await window.supabaseClient
            .from('grupos_video_etiquetas')
            .upsert(inserts, { onConflict: 'publicacion_id,etiquetado_id', ignoreDuplicates: true }));
        grpShowToast('Personas etiquetadas', 'success');
        cerrarModalEtiquetar();
    } catch (e) {
        grpShowToast('Error: ' + e.message, 'error');
    }
}

// ================================================================
// CARGAR PUBLICACIONES DEL CANAL
// ================================================================
async function cargarPublicacionesGrupo(grupoId) {
    try {
        var result = await window.supabaseClient
            .from('grupos_video_publicaciones_publicas')
            .select('*')
            .eq('grupo_id', grupoId)
            .eq('estado', 'publicado')
            .order('created_at', { ascending: false })
            .limit(30);
        if (result.error) throw result.error;
        publicacionesCache = result.data || [];
        await cargarMisInteracciones();
        await cargarMisNotificaciones();
        await cargarMisReacciones();
        filtrarFeed(filtroFeedActual);
    } catch (e) {
        console.warn('Error publicaciones:', e);
    }
}

// ================================================================
// PUBLICAR TEXTO · con moderación
// ================================================================
async function publicarEnGrupo() {
    if (publicando) { grpShowToast('Ya estás publicando...', 'warning'); return; }
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) { grpShowToast('No hay canal', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro', 'error'); return; }

    var input = document.getElementById('inputPublicacion');
    var contenido = input.value.trim();
    if (!contenido) { grpShowToast('Escribe algo', 'warning'); return; }
    if (!validarTextoPermitido(contenido, 'Publicación')) return;

    publicando = true;
    try {
        var result = await window.supabaseClient.from('grupos_video_publicaciones').insert({
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id,
            contenido: contenido,
            tipo: 'texto',
            estado: 'publicado'
        }).select().single();

        if (result.error) {
            if (esErrorModeracionGrupo(result.error)) {
                grpShowToast('Contenido no permitido por las normas de la comunidad', 'error', 6000);
                return;
            }
            throw result.error;
        }

        input.value = '';
        grpShowToast('Publicación creada', 'success');
        await cargarPublicacionesGrupo(grupoActualId);
    } catch (e) {
        grpShowToast('Error: ' + e.message, 'error');
    } finally {
        publicando = false;
    }
}

// ================================================================
// SUBIR FOTO / VIDEO DEL CANAL · con moderación
// ================================================================
function seleccionarArchivo(accept, maxBytes, tipo, etiqueta) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async function (e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > maxBytes) { grpShowToast(etiqueta + ' demasiado grande', 'error'); return; }
        grpShowToast('Subiendo ' + etiqueta.toLowerCase() + '...', '');
        try {
            var token = await obtenerTokenSesion();
            var subida = await subirArchivoConModeracionGrupo(file, 'grupos-publicaciones', tipo, token);

            var campo = tipo === 'video' ? 'video_url' : 'imagen_url';
            var datos = { grupo_id: grupoActualId, usuario_id: sessionUser.id, tipo: tipo, estado: 'publicado' };
            datos[campo] = subida.url;

            grpOk(await window.supabaseClient.from('grupos_video_publicaciones').insert(datos).select().single());
            grpShowToast(etiqueta + ' publicado', 'success');
            await cargarPublicacionesGrupo(grupoActualId);
        } catch (error) {
            grpShowToast('Error: ' + (error && error.message ? error.message : 'Error'), 'error');
        }
    };
    input.click();
}

function subirFotoGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) { grpShowToast('No hay canal', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro', 'error'); return; }
    seleccionarArchivo('image/*', 5 * 1024 * 1024, 'imagen', 'Foto');
}

function subirVideoGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) { grpShowToast('No hay canal', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro', 'error'); return; }
    seleccionarArchivo('video/*', 100 * 1024 * 1024, 'video', 'Video');
}

// ================================================================
// COMENTARIOS
// ================================================================
function toggleComentariosPublicacion(publicacionId) {
    var container = document.getElementById('comentariosContainer-' + publicacionId);
    if (!container) return;
    var isVisible = container.style.display !== 'none';
    container.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) cargarComentariosPublicacion(publicacionId);
}

async function cargarComentariosPublicacion(publicacionId) {
    var lista = document.getElementById('comentariosLista-' + publicacionId);
    if (!lista) return;
    try {
        var result = await window.supabaseClient
            .from('grupos_video_comentarios_publicos')
            .select('*')
            .eq('publicacion_id', publicacionId)
            .order('created_at', { ascending: true });
        if (result.error) throw result.error;
        var data = result.data || [];
        if (data.length === 0) {
            lista.innerHTML = '<div class="grp-vacio-mini">Sin comentarios aún. Sé el primero.</div>';
            return;
        }
        lista.innerHTML = data.map(function (c) {
            return '<div class="grp-comentario">' +
                '<div class="grp-comentario-avatar">' + avatarHTML(c.usuario_avatar_url, c.usuario_nombre) + '</div>' +
                '<div class="grp-comentario-texto"><strong>' + grpEscapeHTML(c.usuario_nombre || 'Usuario') + '</strong> ' +
                    grpEscapeHTML(c.contenido || '') +
                    '<div class="grp-comentario-fecha">' + grpEscapeHTML(new Date(c.created_at).toLocaleString()) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    } catch (e) {
        lista.innerHTML = '<div class="grp-vacio-mini grp-error">No se pudieron cargar los comentarios</div>';
    }
}

async function enviarComentarioPublicacion(publicacionId) {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    var input = document.getElementById('inputComentario-' + publicacionId);
    var texto = input.value.trim();
    if (!texto) return;
    if (!validarTextoPermitido(texto, 'Comentario')) return;
    try {
        var result = await window.supabaseClient.from('grupos_video_comentarios').insert({
            publicacion_id: publicacionId,
            usuario_id: sessionUser.id,
            contenido: texto
        });
        if (result.error) {
            if (esErrorModeracionGrupo(result.error)) {
                grpShowToast('Contenido no permitido por las normas de la comunidad', 'error', 6000);
                return;
            }
            throw result.error;
        }
        input.value = '';
        var countSpan = document.getElementById('comentarios-' + publicacionId);
        if (countSpan) countSpan.textContent = (parseInt(countSpan.textContent, 10) || 0) + 1;
        cargarComentariosPublicacion(publicacionId);
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

// ================================================================
// COMPOSITOR (toggle, emojis de texto, hashtags)
// ================================================================
function abrirFormPublicacion() {
    var form = document.getElementById('formPublicacion');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'block') document.getElementById('inputPublicacion').focus();
}

function grpEmojisPicker() {
    return (Array.isArray(window.emojisDisponibles) && window.emojisDisponibles.length)
        ? window.emojisDisponibles
        : GRP_EMOJIS_PICKER_DEFAULT;
}

function toggleEmojiPickerGrupo() {
    var picker = document.getElementById('emojiPickerGrupo');
    if (!picker) return;
    if (picker.classList.contains('show')) { picker.classList.remove('show'); return; }

    var grid = document.getElementById('emojiGridGrupo');
    if (grid && grid.children.length === 0) {
        grpEmojisPicker().forEach(function (emoji) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = emoji;
            animarEmojiGrupo(btn, emoji);
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                insertarEmojiSeleccionadoGrupo(emoji);
                picker.classList.remove('show');
            });
            grid.appendChild(btn);
        });
    }
    picker.classList.add('show');
}

function insertarEmojiSeleccionadoGrupo(emoji) {
    var input = document.getElementById('inputPublicacion');
    if (!input) return;
    var start = input.selectionStart || 0;
    var end = input.selectionEnd || 0;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
}

function insertarHashtagGrupo() {
    var input = document.getElementById('inputPublicacion');
    if (!input) return;
    var start = input.selectionStart || 0;
    var end = input.selectionEnd || 0;
    input.value = input.value.substring(0, start) + '#' + input.value.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + 1;
}

// ================================================================
// VOLVER A LA LISTA
// ================================================================
async function volverALista() {
    document.getElementById('vistaLista').style.display = 'block';
    document.getElementById('vistaGrupo').classList.remove('show');

    grupoActual = null;
    grupoActualId = null;
    liveActivoEnGrupo = null;
    isLiveGrupoActivo = false;
    currentStreamGrupoId = null;
    esStreamerDelLiveGrupo = false;
    publicacionesCache = [];

    // Cierra la sala de LiveKit y el chat (definidos en grupos-live.js)
    if (typeof desconectarSalaLive === 'function') {
        await desconectarSalaLive();
    }

    cerrarLiveGrupoInline();
    detenerRefrescoAnuncios();
    cerrarAnuncio();

    var url = new URL(window.location);
    url.searchParams.delete('grupo');
    window.history.replaceState({}, '', url);
    cargarGrupos();
}

// ================================================================
// AJUSTES DEL CANAL
// ================================================================
function abrirAjustesCanal() {
    var mkAviso = document.getElementById('marketplaceAviso');
    if (mkAviso && grupoActual) mkAviso.style.display = !grupoActual.marketplace_activo ? 'block' : 'none';
    document.getElementById('modalAjustesCanal').classList.add('show');
}

function cerrarAjustesCanal() {
    document.getElementById('modalAjustesCanal').classList.remove('show');
}

// ================================================================
// CAMBIAR AVATAR / PORTADA DEL CANAL · con moderación
// ================================================================
async function cambiarAvatarGrupo() {
    cerrarAjustesCanal();
    if (!sessionUser || !grupoActualId) { grpShowToast('Error de sesión', 'error'); return; }
    if (!esAdmin && !esCreador) { grpShowToast('Solo administradores', 'error'); return; }

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async function (e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { grpShowToast('Imagen > 5 MB', 'error'); return; }
        grpShowToast('Subiendo avatar...', '');
        try {
            var token = await obtenerTokenSesion();
            var subida = await subirArchivoConModeracionGrupo(file, 'grupos-publicaciones', 'imagen', token);
            grpOk(await window.supabaseClient.from('grupos_video').update({ avatar_url: subida.url }).eq('id', grupoActualId));
            document.getElementById('grupoAvatar').innerHTML = '<img src="' + grpEscapeHTML(grpSafeUrl(subida.url)) + '" alt="">';
            grpShowToast('Foto actualizada', 'success');
        } catch (error) {
            grpShowToast('Error: ' + (error && error.message ? error.message : 'Error'), 'error');
        }
    };
    input.click();
}

async function cambiarPortadaGrupo() {
    cerrarAjustesCanal();
    if (!sessionUser || !grupoActualId) { grpShowToast('Error de sesión', 'error'); return; }
    if (!esAdmin && !esCreador) { grpShowToast('Solo administradores', 'error'); return; }

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm,image/*';
    input.onchange = async function (e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) { grpShowToast('Archivo > 20 MB', 'error'); return; }
        grpShowToast('Subiendo portada...', '');
        try {
            var token = await obtenerTokenSesion();
            var tipo = file.type.indexOf('video/') === 0 ? 'video' : 'imagen';
            var subida = await subirArchivoConModeracionGrupo(file, 'grupos-publicaciones', tipo, token);
            grpOk(await window.supabaseClient.from('grupos_video').update({ portada_url: subida.url }).eq('id', grupoActualId));

            var portadaEl = document.getElementById('grupoPortada');
            var safePortada = grpEscapeHTML(grpSafeUrl(subida.url));
            portadaEl.innerHTML = tipo === 'video'
                ? '<video src="' + safePortada + '" autoplay loop muted playsinline></video>'
                : '<img src="' + safePortada + '" alt="">';
            grpShowToast('Portada actualizada', 'success');
        } catch (error) {
            grpShowToast('Error: ' + (error && error.message ? error.message : 'Error'), 'error');
        }
    };
    input.click();
}

// ================================================================
// ELIMINAR CANAL (confirmación)
// ================================================================
function mostrarConfirmacionEliminarGrupo() {
    cerrarAjustesCanal();
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) return;
    if (!esAdmin && !esCreador) { grpShowToast('Sin permisos', 'error'); return; }
    document.getElementById('modalConfirmarEliminarGrupo').classList.add('show');
    document.getElementById('eliminarGrupoStatus').textContent = '';
}

function cerrarConfirmacionEliminarGrupo() {
    document.getElementById('modalConfirmarEliminarGrupo').classList.remove('show');
}

async function ejecutarEliminarGrupo() {
    if (eliminandoGrupo) return;
    if (!sessionUser || !grupoActualId) return;
    var statusEl = document.getElementById('eliminarGrupoStatus');
    eliminandoGrupo = true;
    statusEl.textContent = 'Eliminando...';
    statusEl.style.color = 'var(--text-secondary)';
    try {
        var rpc = await window.supabaseClient.rpc('eliminar_grupo', { p_grupo_id: grupoActualId });
        if (rpc.error) throw rpc.error;
        if (rpc.data && rpc.data.error) throw new Error(rpc.data.error);

        grpShowToast('Canal eliminado', 'success');
        cerrarConfirmacionEliminarGrupo();
        cerrarModalAdmin();
        document.getElementById('vistaGrupo').classList.remove('show');
        document.getElementById('vistaLista').style.display = 'block';

        grupoActual = null;
        grupoActualId = null;
        liveActivoEnGrupo = null;
        isLiveGrupoActivo = false;
        currentStreamGrupoId = null;
        esAdmin = false;
        esModerador = false;
        esCreador = false;
        rolEnGrupo = null;

        var url = new URL(window.location);
        url.searchParams.delete('grupo');
        window.history.replaceState({}, '', url);

        await cargarGrupos();
        await cargarDashboard();
    } catch (e) {
        statusEl.textContent = 'Error: ' + e.message;
        statusEl.style.color = 'var(--danger)';
    } finally {
        eliminandoGrupo = false;
    }
}

// ================================================================
// VER TOKENS (navegación al perfil)
// ================================================================
function verTokens() {
    window.location.href = '/features/perfil/perfil.html';
}
