// ================================================================
// GRUPOS · VISTA INTERNA DEL GRUPO
// ================================================================
// Abrir grupo, membresía, feed de publicaciones, interacciones,
// reportes, etiquetas, comentarios, reacciones y acciones del canal.
// Depende de: grupos-config.js, grupos-utils.js, grupos-anuncios.js
// ================================================================

// ================================================================
// ABRIR GRUPO
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
        document.getElementById('grupoCiudad').innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + (ubicacion.length > 0 ? ubicacion.join(', ') : 'Sin ubicación');

        document.getElementById('grupoMiembros').innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' + (grupoActual.miembros?.[0]?.count || 0) + ' seguidores';

        var vis = grupoActual.visibilidad || 'publico';
        document.getElementById('grupoEstadoBadge').innerHTML = vis === 'publico'
            ? '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Público'
            : '<svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Privado';

        var mkBadgeEl = document.getElementById('grupoMkBadge');
        if (mkBadgeEl) mkBadgeEl.style.display = grupoActual.marketplace_activo ? 'inline-flex' : 'none';

        var btnMk = document.getElementById('btnMarketplace');
        if (btnMk) {
            if (!grupoActual.marketplace_activo) btnMk.style.display = 'none';
            else if (esMiembro()) btnMk.style.display = 'inline-flex';
            else btnMk.style.display = 'none';
        }

        var mkAviso = document.getElementById('marketplaceAviso');
        if (mkAviso) mkAviso.style.display = !grupoActual.marketplace_activo ? 'block' : 'none';

        var btnDonar = document.getElementById('btnDonar');
        if (btnDonar) {
            if (grupoActual.precio_usdt > 0) {
                btnDonar.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 11h6"/></svg> Donar $' + grupoActual.precio_usdt + ' USDT';
            } else {
                btnDonar.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 11h6"/></svg> Donar USDT';
            }
        }

        var avatarEl = document.getElementById('grupoAvatar');
        var avatarImg = grpSafeUrl(grupoActual.avatar_url);
        if (avatarImg) avatarEl.innerHTML = '<img src="' + grpEscapeHTML(avatarImg) + '">';
        else avatarEl.textContent = '◈';

        var portadaEl = document.getElementById('grupoPortada');
        var portadaImg = grpSafeUrl(grupoActual.portada_url);
        if (portadaImg) {
            portadaEl.innerHTML = `<video src="${grpEscapeHTML(portadaImg)}" autoplay loop muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>`;
        } else {
            portadaEl.textContent = '◈';
        }

        var esAdminOGerente = esAdmin || esCreador;
        document.getElementById('btnAjustesCanal').style.display = esAdminOGerente ? 'flex' : 'none';

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
        if (sessionUser && liveActivoEnGrupo.streamer_id === sessionUser.id) {
            if (btnFinalizarLive) btnFinalizarLive.style.display = 'inline-flex';
            if (btnLive) btnLive.style.display = 'none';
        } else {
            if (btnFinalizarLive) btnFinalizarLive.style.display = 'none';
            if (btnLive) btnLive.style.display = 'none';
        }
    } else {
        if (btnVerLive) btnVerLive.style.display = 'none';
        document.getElementById('grupoLiveBadge').style.display = 'none';
        if (btnFinalizarLive) btnFinalizarLive.style.display = 'none';
        if (btnLive) btnLive.style.display = esMiembro() ? 'inline-flex' : 'none';
    }

    if (sessionUser && !esMiembro()) {
        var modo = grupoActual?.modo_ingreso || 'abierto';
        var btnUnirse = document.createElement('button');
        btnUnirse.id = 'btnUnirseGrupo';
        btnUnirse.className = 'btn-gold btn-sm';
        btnUnirse.style.cssText = 'display:inline-flex;';

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
            btnUnirse.onclick = null;
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
        var r = await window.supabaseClient.from('grupos_video_miembros').insert({
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id,
            rol: 'miembro',
            estado: 'activo'
        });
        grpOk(r);
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
        var r = await window.supabaseClient.from('grupos_video_solicitudes').insert({
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id
        });
        grpOk(r);
        grpShowToast('Solicitud enviada', 'success');
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

// ================================================================
// VERIFICAR MEMBRESÍA / LIVE ACTIVO
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
// CARGAR INTERACCIONES / NOTIFICACIONES
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
            result.data.forEach(function(i) {
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
            result.data.forEach(function(n) { misNotificaciones[n.publicacion_id] = true; });
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
    document.querySelectorAll('.feed-filtro-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.filtro === filtro);
    });
    renderizarPublicacionesCache();
}

function renderizarPublicacionesCache() {
    var container = document.getElementById('publicacionesContainer');
    if (!container) return;

    var filtradas = publicacionesCache.filter(function(p) {
        return !(misInteracciones[p.id]?.no_quiero_ver);
    });

    if (filtroFeedActual === 'marketplace') {
        filtradas = filtradas.filter(function(p) { return !!p.tipo_marketplace; });
    } else if (filtroFeedActual === 'publicaciones') {
        filtradas = filtradas.filter(function(p) { return !p.tipo_marketplace; });
    } else if (filtroFeedActual === 'interesados') {
        filtradas = filtradas.filter(function(p) {
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
        container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg><h3>' + mensajes[filtroFeedActual] + '</h3></div>';
        return;
    }

    container.innerHTML = filtradas.map(function(p) { return renderizarPublicacionHTML(p); }).join('');
}

// ================================================================
// RENDERIZAR PUBLICACIÓN (HTML)
// ================================================================
function renderizarPublicacionHTML(p) {
    var avatarUrl = p.usuario_avatar_url && grpSafeUrl(p.usuario_avatar_url)
        ? '<img src="' + grpEscapeHTML(grpSafeUrl(p.usuario_avatar_url)) + '">'
        : '◈';
    var nombre = grpEscapeHTML(p.usuario_nombre || 'Usuario');
    var handle = p.usuario_handle ? ' <span style="color:var(--text-muted);font-weight:400;font-size:0.65rem;">@' + grpEscapeHTML(p.usuario_handle) + '</span>' : '';
    var contenido = grpEscapeHTML(p.contenido || '');
    var imgUrl = grpSafeUrl(p.imagen_url);
    var vidUrl = grpSafeUrl(p.video_url);
    if (imgUrl) contenido += '<br><img src="' + grpEscapeHTML(imgUrl) + '" loading="lazy" />';
    if (vidUrl) contenido += '<br><video src="' + grpEscapeHTML(vidUrl) + '" controls preload="metadata"></video>';
    var likesCount = p.likes_count || 0;
    var comentariosCount = p.comentarios_count || 0;

    var mias = misInteracciones[p.id] || {};
    var tengoMeInteresa = mias.me_interesa ? ' interesado' : '';

    var mkHTML = '';
    if (p.tipo_marketplace) {
        var tipoLabels = { vendo: 'VENDO', rento: 'RENTO', busco: 'BUSCO', regalo: 'REGALO', servicio: 'SERVICIO' };
        var tipoLabel = tipoLabels[p.tipo_marketplace] || p.tipo_marketplace.toUpperCase();
        var precioHTML = '';
        if (p.precio_mxn) precioHTML += '<span class="precio">$' + parseFloat(p.precio_mxn).toFixed(2) + ' MXN</span>';
        if (p.precio_usdt) precioHTML += '<span class="precio-usdt">≈ $' + parseFloat(p.precio_usdt).toFixed(2) + ' USDT</span>';
        var ubicacionHTML = '';
        var ubiParts = [];
        if (p.municipio) ubiParts.push(p.municipio);
        if (p.estado_region) ubiParts.push(p.estado_region);
        if (ubiParts.length > 0) ubicacionHTML = '<div class="ubicacion"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + grpEscapeHTML(ubiParts.join(', ')) + '</div>';

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

        mkHTML = '<div class="marketplace-info">' +
            '<div class="titulo-mk"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' + tipoLabel + '</div>' +
            '<div>' + precioHTML + '</div>' + ubicacionHTML + contactoDiv + '</div>';
    }

    var claseMK = p.tipo_marketplace ? ' marketplace ' + p.tipo_marketplace : '';

    return '<div class="publicacion-card' + claseMK + '" data-pub-id="' + p.id + '">' +
        '<div class="header">' +
        '<div class="avatar">' + avatarUrl + '</div>' +
        '<div style="flex:1;min-width:0;">' +
        '<div class="nombre">' + nombre + handle + '</div>' +
        '<div class="fecha">' + new Date(p.created_at).toLocaleString() + '</div>' +
        '</div>' +
        '<div class="post-menu-wrapper">' +
        '<button class="post-menu-btn" onclick="togglePostMenu(event, ' + p.id + ')" title="Opciones">⋯</button>' +
        '<div class="post-menu-dropdown" id="postMenu-' + p.id + '">' +
        '<button class="post-menu-item" onclick="toggleMeInteresa(' + p.id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1 3-6z"/></svg> Me interesa</button>' +
        '<button class="post-menu-item" onclick="toggleNoMeInteresa(' + p.id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> No me interesa</button>' +
        '<button class="post-menu-item" onclick="abrirModalEtiquetar(' + p.id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> Etiquetar foto</button>' +
        '<button class="post-menu-item" onclick="toggleNotificacion(' + p.id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> ' + (misNotificaciones[p.id] ? 'Desactivar notificaciones' : 'Activar notificaciones') + '</button>' +
        '<button class="post-menu-item" onclick="ocultarPublicacionUsuario(' + p.id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> No quiero ver esto</button>' +
        '<button class="post-menu-item" onclick="copiarEnlacePost(' + p.id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Copiar enlace</button>' +
        '<button class="post-menu-item" onclick="compartirPublicacion(' + p.id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/></svg> Compartir</button>' +
        '<div class="post-menu-separator"></div>' +
        '<button class="post-menu-item danger" onclick="abrirModalReportar(' + p.id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> Reportar publicación</button>' +
        '<button class="post-menu-item danger" onclick="abrirModalReportarAdmin(' + p.id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Reportar al administrador</button>' +
        '</div></div></div>' +
        '<div class="contenido">' + contenido + '</div>' + mkHTML +
        '<div class="stats">' +
        '<span onclick="reaccionarPublicacion(' + p.id + ')" id="like-btn-' + p.id + '"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> <span id="likes-' + p.id + '">' + likesCount + '</span></span>' +
        '<span onclick="toggleComentariosPublicacion(' + p.id + ')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> <span id="comentarios-' + p.id + '">' + comentariosCount + '</span></span>' +
        '<span class="' + tengoMeInteresa.trim() + '" onclick="toggleMeInteresa(' + p.id + ')" id="interesa-' + p.id + '"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1 3-6z"/></svg> ' + (mias.me_interesa ? 'Interesado' : 'Me interesa') + '</span>' +
        (misNotificaciones[p.id] ? '<span style="color:var(--gold);"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg> Notificado</span>' : '') +
        '</div>' +
        '<div class="comentarios-container" id="comentariosContainer-' + p.id + '" style="display:none;margin-top:8px;">' +
        '<div id="comentariosLista-' + p.id + '"></div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;">' +
        '<input type="text" id="inputComentario-' + p.id + '" placeholder="Comentar..." style="flex:1;padding:4px 10px;background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);border-radius:20px;color:var(--text-primary);font-size:0.65rem;outline:none;">' +
        '<button onclick="enviarComentarioPublicacion(' + p.id + ')" style="background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:var(--space);border:none;padding:4px 14px;border-radius:20px;font-weight:700;font-size:0.65rem;cursor:pointer;">Enviar</button>' +
        '</div></div></div>';
}

// ================================================================
// MENÚ DE POST (⋯)
// ================================================================
function togglePostMenu(event, publicacionId) {
    event.stopPropagation();
    var menuActual = document.getElementById('postMenu-' + publicacionId);
    var menuAbierto = menuActual && menuActual.classList.contains('show');
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
    if (!menuAbierto && menuActual) menuActual.classList.add('show');
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.post-menu-wrapper')) {
        document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
    }
});

// ================================================================
// INTERACCIONES (me interesa, no me interesa, ocultar)
// ================================================================
async function toggleInteraccion(publicacionId, tipo) {
    if (!sessionUser) { grpShowToast('Inicia sesión para interactuar', 'error'); return false; }
    try {
        var tieneActual = misInteracciones[publicacionId] && misInteracciones[publicacionId][tipo];
        if (tieneActual) {
            grpOk(await window.supabaseClient.from('grupos_video_interacciones').delete()
                .eq('publicacion_id', publicacionId).eq('usuario_id', sessionUser.id).eq('tipo', tipo));
            if (!misInteracciones[publicacionId]) misInteracciones[publicacionId] = {};
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
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
    var exitoso = await toggleInteraccion(publicacionId, 'me_interesa');
    if (exitoso) {
        var esta = misInteracciones[publicacionId] && misInteracciones[publicacionId].me_interesa;
        grpShowToast(esta ? 'Marcado como interesado' : 'Interacción quitada', esta ? 'success' : '');
        renderizarPublicacionesCache();
    }
}

async function toggleNoMeInteresa(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
    var exitoso = await toggleInteraccion(publicacionId, 'no_me_interesa');
    if (exitoso) {
        var esta = misInteracciones[publicacionId] && misInteracciones[publicacionId].no_me_interesa;
        grpShowToast(esta ? 'Marcado como "no me interesa"' : 'Interacción quitada', esta ? 'warning' : '');
        renderizarPublicacionesCache();
    }
}

async function ocultarPublicacionUsuario(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
    var exitoso = await toggleInteraccion(publicacionId, 'no_quiero_ver');
    if (exitoso) {
        grpShowToast('Publicación oculta', 'success');
        renderizarPublicacionesCache();
    }
}

async function toggleNotificacion(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    try {
        var tiene = misNotificaciones[publicacionId];
        if (tiene) {
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
function copiarEnlacePost(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
    var url = window.location.origin + '/features/grupos/grupos.html?grupo=' + grupoActualId + '&publicacion=' + publicacionId;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url)
            .then(function() { grpShowToast('Enlace copiado', 'success'); })
            .catch(function() { prompt('Copia el enlace:', url); });
    } else {
        prompt('Copia el enlace:', url);
    }
}

function compartirPublicacion(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
    var url = window.location.origin + '/features/grupos/grupos.html?grupo=' + grupoActualId + '&publicacion=' + publicacionId;
    if (navigator.share) {
        navigator.share({ title: 'Sariel\'s', text: 'Mira esto', url: url }).catch(function() {});
    } else {
        navigator.clipboard.writeText(url).then(function() { grpShowToast('Enlace copiado', 'success'); });
    }
}

// ================================================================
// REPORTES
// ================================================================
function abrirModalReportar(publicacionId) {
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
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
        var result = await window.supabaseClient.from('grupos_video_reportes').insert({
            publicacion_id: publicacionReportando,
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id,
            tipo: 'publicacion',
            motivo: motivo,
            descripcion: descripcion || null,
            estado: 'pendiente'
        });
        if (result.error) throw result.error;
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
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
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
        var result = await window.supabaseClient.from('grupos_video_reportes').insert({
            publicacion_id: publicacionReportando || null,
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id,
            tipo: tipo,
            motivo: motivo,
            descripcion: descripcion,
            estado: 'pendiente'
        });
        if (result.error) throw result.error;
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
    document.querySelectorAll('.post-menu-dropdown.show').forEach(function(m) { m.classList.remove('show'); });
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    var pub = publicacionesCache.find(function(p) { return p.id === publicacionId; });
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
            .or(`nombre.ilike.%${q}%,handle.ilike.%${q}%`)
            .neq('id', sessionUser.id)
            .limit(10);
        if (result.error || !result.data) {
            container.innerHTML = '<div style="color:var(--text-muted);font-size:0.7rem;padding:8px;">Sin resultados</div>';
            return;
        }
        container.innerHTML = result.data.map(function(u) {
            var yaSel = etiquetadosSeleccionados.find(function(e) { return e.id === u.id; });
            var avatar = u.avatar_url && grpSafeUrl(u.avatar_url)
                ? '<img src="' + grpEscapeHTML(grpSafeUrl(u.avatar_url)) + '" style="width:100%;height:100%;object-fit:cover;">'
                : '◈';
            return '<div class="usuario-etiqueta-item" data-id="' + grpEscapeHTML(u.id) + '" data-nombre="' + grpEscapeHTML(u.nombre || '') + '" data-handle="' + grpEscapeHTML(u.handle || '') + '" data-avatar="' + grpEscapeHTML(grpSafeUrl(u.avatar_url) || '') + '" style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid rgba(212,175,55,0.05);cursor:pointer;' + (yaSel ? 'opacity:0.4;pointer-events:none;' : '') + '">' +
                '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--green-deep),var(--gold));display:flex;align-items:center;justify-content:center;overflow:hidden;font-weight:700;">' + avatar + '</div>' +
                '<div><div style="font-size:0.75rem;font-weight:600;">' + grpEscapeHTML(u.nombre || 'Usuario') + '</div>' +
                '<div style="font-size:0.6rem;color:var(--text-muted);">@' + grpEscapeHTML(u.handle || 'usuario') + '</div></div></div>';
        }).join('');

        container.querySelectorAll('.usuario-etiqueta-item').forEach(function(el) {
            el.addEventListener('click', function() {
                agregarEtiqueta(el.dataset.id, el.dataset.nombre, el.dataset.handle, el.dataset.avatar);
            });
        });
    } catch (e) {
        console.warn('Error buscando:', e);
    }
}

function agregarEtiqueta(id, nombre, handle, avatarUrl) {
    if (etiquetadosSeleccionados.find(function(e) { return e.id === id; })) return;
    etiquetadosSeleccionados.push({ id: id, nombre: nombre, handle: handle, avatar_url: avatarUrl });
    renderEtiquetadosSeleccionados();
    document.getElementById('inputBuscarUsuarioEtiqueta').value = '';
    document.getElementById('resultadosUsuariosEtiqueta').innerHTML = '';
}

function renderEtiquetadosSeleccionados() {
    var container = document.getElementById('etiquetadosSeleccionados');
    if (etiquetadosSeleccionados.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = etiquetadosSeleccionados.map(function(e) {
        return '<span style="background:rgba(212,175,55,0.15);color:var(--gold);padding:4px 10px;border-radius:20px;font-size:0.65rem;display:inline-flex;align-items:center;gap:6px;">@' + grpEscapeHTML(e.handle) + ' <button class="quitar-etiqueta-btn" data-id="' + grpEscapeHTML(e.id) + '" style="background:none;border:none;color:var(--gold);cursor:pointer;font-size:0.8rem;padding:0;">×</button></span>';
    }).join('');

    container.querySelectorAll('.quitar-etiqueta-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { quitarEtiqueta(btn.dataset.id); });
    });
}

function quitarEtiqueta(id) {
    etiquetadosSeleccionados = etiquetadosSeleccionados.filter(function(e) { return e.id !== id; });
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
        var inserts = etiquetadosSeleccionados.map(function(e) {
            return {
                publicacion_id: publicacionReportando,
                etiquetado_id: e.id,
                etiquetado_por: sessionUser.id
            };
        });
        var result = await window.supabaseClient
            .from('grupos_video_etiquetas')
            .upsert(inserts, { onConflict: 'publicacion_id,etiquetado_id', ignoreDuplicates: true });
        if (result.error) throw result.error;
        grpShowToast('Personas etiquetadas', 'success');
        cerrarModalEtiquetar();
    } catch (e) {
        grpShowToast('Error: ' + e.message, 'error');
    }
}

// ================================================================
// CARGAR PUBLICACIONES DEL GRUPO
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
        filtrarFeed(filtroFeedActual);
    } catch (e) {
        console.warn('Error publicaciones:', e);
    }
}

// ================================================================
// PUBLICAR (texto, foto, video)
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
        if (result.error) throw result.error;
        input.value = '';
        grpShowToast('Publicación creada', 'success');
        await cargarPublicacionesGrupo(grupoActualId);
    } catch (e) {
        grpShowToast('Error: ' + e.message, 'error');
    } finally {
        publicando = false;
    }
}

async function subirFotoGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) { grpShowToast('No hay canal', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro', 'error'); return; }

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { grpShowToast('Imagen > 10MB', 'error'); return; }
        grpShowToast('Subiendo imagen...', '');
        try {
            var fileExt = file.name.split('.').pop();
            var filePath = grupoActualId + '/' + sessionUser.id + '/' + Date.now() + '.' + fileExt;
            var uploadResult = await window.supabaseClient.storage
                .from('grupos-publicaciones')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });
            if (uploadResult.error) throw uploadResult.error;
            var urlData = window.supabaseClient.storage
                .from('grupos-publicaciones')
                .getPublicUrl(filePath);
            var result = await window.supabaseClient.from('grupos_video_publicaciones').insert({
                grupo_id: grupoActualId,
                usuario_id: sessionUser.id,
                imagen_url: urlData.data.publicUrl,
                tipo: 'imagen',
                estado: 'publicado'
            }).select().single();
            if (result.error) throw result.error;
            grpShowToast('Foto publicada', 'success');
            await cargarPublicacionesGrupo(grupoActualId);
        } catch (error) {
            grpShowToast('Error: ' + error.message, 'error');
        }
    };
    input.click();
}

async function subirVideoGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) { grpShowToast('No hay canal', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro', 'error'); return; }

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 100 * 1024 * 1024) { grpShowToast('Video > 100MB', 'error'); return; }
        grpShowToast('Subiendo video...', '');
        try {
            var fileExt = file.name.split('.').pop();
            var filePath = grupoActualId + '/' + sessionUser.id + '/' + Date.now() + '.' + fileExt;
            var uploadResult = await window.supabaseClient.storage
                .from('grupos-publicaciones')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });
            if (uploadResult.error) throw uploadResult.error;
            var urlData = window.supabaseClient.storage
                .from('grupos-publicaciones')
                .getPublicUrl(filePath);
            var result = await window.supabaseClient.from('grupos_video_publicaciones').insert({
                grupo_id: grupoActualId,
                usuario_id: sessionUser.id,
                video_url: urlData.data.publicUrl,
                tipo: 'video',
                estado: 'publicado'
            }).select().single();
            if (result.error) throw result.error;
            grpShowToast('Video publicado', 'success');
            await cargarPublicacionesGrupo(grupoActualId);
        } catch (error) {
            grpShowToast('Error: ' + error.message, 'error');
        }
    };
    input.click();
}

// ================================================================
// REACCIONES Y COMENTARIOS
// ================================================================
async function reaccionarPublicacion(publicacionId) {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    try {
        var existing = await window.supabaseClient
            .from('grupos_video_reacciones')
            .select('id')
            .eq('publicacion_id', publicacionId)
            .eq('usuario_id', sessionUser.id)
            .maybeSingle();
        var likesSpan = document.getElementById('likes-' + publicacionId);
        var currentLikes = parseInt(likesSpan?.textContent || 0);
        if (existing.data) {
            grpOk(await window.supabaseClient.from('grupos_video_reacciones').delete().eq('id', existing.data.id));
            if (likesSpan) likesSpan.textContent = Math.max(0, currentLikes - 1);
        } else {
            grpOk(await window.supabaseClient.from('grupos_video_reacciones').insert({
                publicacion_id: publicacionId,
                usuario_id: sessionUser.id,
                tipo: 'like'
            }));
            if (likesSpan) likesSpan.textContent = currentLikes + 1;
        }
    } catch (e) {
        console.warn('Error reaccionando:', e);
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

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
            lista.innerHTML = '<div style="color:var(--text-muted);font-size:0.65rem;padding:4px 0;">Sin comentarios</div>';
            return;
        }
        lista.innerHTML = data.map(function(c) {
            var avatar = c.usuario_avatar_url && grpSafeUrl(c.usuario_avatar_url)
                ? '<img src="' + grpEscapeHTML(grpSafeUrl(c.usuario_avatar_url)) + '">'
                : '◈';
            return '<div style="display:flex;gap:6px;padding:4px 0;border-bottom:1px solid rgba(212,175,55,0.04);">' +
                '<div style="width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,var(--green-deep),var(--gold));display:flex;align-items:center;justify-content:center;font-size:0.5rem;color:#fff;overflow:hidden;flex-shrink:0;">' + avatar + '</div>' +
                '<div style="flex:1;font-size:0.65rem;"><strong style="color:var(--gold);">' + grpEscapeHTML(c.usuario_nombre || 'Usuario') + '</strong> ' + grpEscapeHTML(c.contenido || '') +
                '<div style="font-size:0.5rem;color:var(--text-muted);">' + new Date(c.created_at).toLocaleString() + '</div></div></div>';
        }).join('');
    } catch (e) {
        lista.innerHTML = '<div style="color:var(--danger);font-size:0.65rem;">Error</div>';
    }
}

async function enviarComentarioPublicacion(publicacionId) {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    var input = document.getElementById('inputComentario-' + publicacionId);
    var texto = input.value.trim();
    if (!texto) return;
    if (!validarTextoPermitido(texto, 'Comentario')) return;
    try {
        grpOk(await window.supabaseClient.from('grupos_video_comentarios').insert({
            publicacion_id: publicacionId,
            usuario_id: sessionUser.id,
            contenido: texto
        }));
        input.value = '';
        var countSpan = document.getElementById('comentarios-' + publicacionId);
        if (countSpan) countSpan.textContent = (parseInt(countSpan.textContent) || 0) + 1;
        cargarComentariosPublicacion(publicacionId);
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

// ================================================================
// FORM DE PUBLICACIÓN (toggle + emojis + hashtags)
// ================================================================
function abrirFormPublicacion() {
    var form = document.getElementById('formPublicacion');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'block') document.getElementById('inputPublicacion').focus();
}

function toggleEmojiPickerGrupo() {
    var picker = document.getElementById('emojiPickerGrupo');
    if (!picker) return;
    if (picker.classList.contains('show')) { picker.classList.remove('show'); return; }
    var grid = document.getElementById('emojiGridGrupo');
    if (grid && grid.children.length === 0) {
        emojisDisponibles.forEach(function(emoji) {
            var btn = document.createElement('button');
            btn.textContent = emoji;
            btn.addEventListener('click', function(e) {
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
    var texto = input.value;
    input.value = texto.substring(0, start) + emoji + texto.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
}

function insertarHashtagGrupo() {
    var input = document.getElementById('inputPublicacion');
    if (!input) return;
    var start = input.selectionStart || 0;
    var end = input.selectionEnd || 0;
    var texto = input.value;
    input.value = texto.substring(0, start) + '#' + texto.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + 1;
}

// ================================================================
// VOLVER A LA LISTA
// ================================================================
function volverALista() {
    document.getElementById('vistaLista').style.display = 'block';
    document.getElementById('vistaGrupo').classList.remove('show');
    grupoActual = null;
    grupoActualId = null;
    liveActivoEnGrupo = null;
    isLiveGrupoActivo = false;
    currentStreamGrupoId = null;
    esStreamerDelLiveGrupo = false;
    publicacionesCache = [];

    if (liveKitRoomGrupo) {
        try { liveKitRoomGrupo.disconnect(); } catch(e) {}
        liveKitRoomGrupo = null;
    }
    if (channelChatGrupo) {
        try { window.supabaseClient.removeChannel(channelChatGrupo); } catch(e) {}
        channelChatGrupo = null;
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
// AJUSTES DEL CANAL (modal)
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
// CAMBIAR AVATAR / PORTADA DEL CANAL
// ================================================================
async function cambiarAvatarGrupo() {
    cerrarAjustesCanal();
    if (!sessionUser || !grupoActualId) { grpShowToast('Error de sesión', 'error'); return; }
    if (!esAdmin && !esCreador) { grpShowToast('Solo administradores', 'error'); return; }

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { grpShowToast('Imagen > 5MB', 'error'); return; }
        grpShowToast('Subiendo avatar...', '');
        try {
            var fileExt = file.name.split('.').pop();
            var filePath = `avatares/${grupoActualId}/${Date.now()}.${fileExt}`;
            var uploadResult = await window.supabaseClient.storage
                .from('grupos-publicaciones')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });
            if (uploadResult.error) throw uploadResult.error;
            var urlData = window.supabaseClient.storage
                .from('grupos-publicaciones')
                .getPublicUrl(filePath);
            var updateResult = await window.supabaseClient
                .from('grupos_video')
                .update({ avatar_url: urlData.data.publicUrl })
                .eq('id', grupoActualId);
            if (updateResult.error) throw updateResult.error;
            document.getElementById('grupoAvatar').innerHTML = '<img src="' + grpEscapeHTML(grpSafeUrl(urlData.data.publicUrl)) + '">';
            grpShowToast('Foto actualizada', 'success');
        } catch (error) {
            grpShowToast('Error: ' + error.message, 'error');
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
    input.onchange = async function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) { grpShowToast('Archivo > 20MB', 'error'); return; }
        grpShowToast('Subiendo portada...', '');
        try {
            var fileExt = file.name.split('.').pop();
            var filePath = `portadas/${grupoActualId}/${Date.now()}.${fileExt}`;
            var uploadResult = await window.supabaseClient.storage
                .from('grupos-publicaciones')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });
            if (uploadResult.error) throw uploadResult.error;
            var urlData = window.supabaseClient.storage
                .from('grupos-publicaciones')
                .getPublicUrl(filePath);
            var updateResult = await window.supabaseClient
                .from('grupos_video')
                .update({ portada_url: urlData.data.publicUrl })
                .eq('id', grupoActualId);
            if (updateResult.error) throw updateResult.error;
            var portadaEl = document.getElementById('grupoPortada');
            var safePortada = grpSafeUrl(urlData.data.publicUrl);
            if (file.type.startsWith('video/')) {
                portadaEl.innerHTML = `<video src="${grpEscapeHTML(safePortada)}" autoplay loop muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>`;
            } else {
                portadaEl.innerHTML = `<img src="${grpEscapeHTML(safePortada)}" style="width:100%; height:100%; object-fit:cover;">`;
            }
            grpShowToast('Portada actualizada', 'success');
        } catch (error) {
            grpShowToast('Error: ' + error.message, 'error');
        }
    };
    input.click();
}

// ================================================================
// ELIMINAR GRUPO (confirmación)
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
        const { data, error } = await window.supabaseClient.rpc('eliminar_grupo', { p_grupo_id: grupoActualId });
        if (error) throw error;
        if (data && data.error) throw new Error(data.error);
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