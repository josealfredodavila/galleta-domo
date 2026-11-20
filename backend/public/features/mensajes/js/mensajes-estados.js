// ================================================================
// MENSAJES · ESTADOS (HISTORIAS) v1.0 · MÓDULO 5 DE 8
// Ruta: backend/public/features/mensajes/js/mensajes-estados.js
// Depende de: mensajes-core.js (db, user, $, toast, esc, perfilCache,
//             currentUserProfile, NeonModal, session, auth,
//             subirViaBackend, TTL_PERFIL_MS, PERFIL_CACHE_LIMITE,
//             ESTADOS_BUCKET, ESTADOS_TTL_MS)
//             mensajes-scroll-media.js (cerrarPhotoViewer, cerrarProfileModal)
// Contenido: carga de historias (RPC estados_mensajes_activos con
//            fallback), visor con progreso, navegación, saltar grupo,
//            pausa, vistas, comentarios, eliminar (dueño), comentar
//            (espectador), publicar con preview de imagen o video.
// NO cargar todavía en mensajes.html.
// ================================================================

'use strict';

// Estado del visor de historias (antes en mensajes.js)
let estadosCache = [];
let estadoActualIndex = 0;
let estadoActualUserId = null;
let estadoTimer = null;
let estadoProgresoActual = 0;
let estadoPausado = false;

// ================================================================
// HISTORIAS · helpers
// ================================================================
function estadoEsNuevo(estado) {
    if (!window.__estadosVistosIds) return true;
    return !window.__estadosVistosIds.has(estado.id);
}

async function registrarVistaEstado(estadoId) {
    if (!user) return;
    try {
        await db.from('estados_vistas').upsert({ estado_id: estadoId, usuario_id: user.id }, { onConflict: 'estado_id,usuario_id', ignoreDuplicates: true });
        if (window.__estadosVistosIds) window.__estadosVistosIds.add(estadoId);
    } catch (e) { /* silencioso */ }
}

async function obtenerVistasEstado(estadoId) {
    try {
        const { count, error } = await db.from('estados_vistas').select('id', { count: 'exact', head: true }).eq('estado_id', estadoId);
        if (error) return 0;
        return count || 0;
    } catch (e) { return 0; }
}

function haceTiempo(fecha) {
    if (!fecha) return 'hace tiempo';
    const diffMin = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffMin < 1440) return `hace ${Math.floor(diffMin / 60)} h`;
    return `hace ${Math.floor(diffMin / 1440)} d`;
}

// ================================================================
// HISTORIAS · cargar (usa RPC que filtra bloqueados)
// ================================================================
async function cargarEstados() {
    const scroll = $('estadosScroll');
    if (!scroll) return;
    scroll.innerHTML = '';
    if (!user) return;

    try {
        // RPC estados_mensajes_activos filtra bloqueados y solo origen='mensajes'
        let filas = [];
        const rpc = await db.rpc('estados_mensajes_activos');

        if (!rpc.error && Array.isArray(rpc.data)) {
            if (rpc.data.length > 0 && Array.isArray(rpc.data[0].estados)) {
                // Formato agrupado por usuario
                rpc.data.forEach(u => {
                    (u.estados || []).forEach(e => {
                        filas.push({
                            id: e.id,
                            usuario_id: u.usuario_id,
                            imagen_url: e.imagen_url,
                            media_url: e.media_url,
                            media_tipo: e.media_tipo,
                            duracion_segundos: e.duracion_segundos,
                            caption: e.caption,
                            created_at: e.created_at,
                            expires_at: e.expires_at,
                            origen: 'mensajes'
                        });
                    });
                });
            } else {
                // Formato plano (la RPC ya devuelve filas de estados)
                filas = rpc.data.map(e => ({ ...e, origen: e.origen || 'mensajes' }));
            }
        } else {
            // Fallback: consulta directa (mientras la RPC se crea/verifica)
            if (rpc.error) console.warn('[Estados] RPC falló, usando fallback:', rpc.error.message);
            const { data, error } = await db.from('estados')
                .select('id, usuario_id, imagen_url, media_url, media_tipo, duracion_segundos, caption, created_at, expires_at, origen')
                .eq('origen', 'mensajes')
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: true });
            if (error) {
                if (error.code === '42P01') { console.warn('Tabla estados no existe aún'); return; }
                throw error;
            }
            filas = data || [];
        }

        estadosCache = filas;
        if (estadosCache.length === 0) {
            scroll.innerHTML = '<div style="color:var(--muted);font-size:.7rem;padding:8px 4px;text-align:center;width:100%;">Sin estados</div>';
            return;
        }

        // Cargar vistas propias en lote
        window.__estadosVistosIds = new Set();
        const idsEstados = estadosCache.map(e => e.id);
        if (idsEstados.length > 0) {
            try {
                const { data: vistasData } = await db.from('estados_vistas')
                    .select('estado_id')
                    .eq('usuario_id', user.id)
                    .in('estado_id', idsEstados);
                (vistasData || []).forEach(v => window.__estadosVistosIds.add(v.estado_id));
            } catch (e) { console.warn('Error cargando vistas en lote:', e); }
        }

        const porUsuario = {};
        estadosCache.forEach(e => { if (!porUsuario[e.usuario_id]) porUsuario[e.usuario_id] = []; porUsuario[e.usuario_id].push(e); });

        // Precargar perfiles en lote (excepto el mío)
        const idsUnicos = Object.keys(porUsuario).filter(uid => uid !== user.id);
        if (idsUnicos.length > 0) {
            try {
                const { data: perfilesEst } = await db.from('perfiles_publicos')
                    .select('id,nombre,handle,avatar_url')
                    .in('id', idsUnicos);
                (perfilesEst || []).forEach(p => {
                    if (perfilCache.size >= PERFIL_CACHE_LIMITE) {
                        const primera = perfilCache.keys().next().value;
                        if (primera !== undefined) perfilCache.delete(primera);
                    }
                    perfilCache.set(p.id, { ts: Date.now(), data: p });
                });
            } catch (e) { console.warn('Error cargando perfiles de estados en lote:', e); }
        }

        // Mi estado
        const miEstado = porUsuario[user.id];
        if (miEstado && miEstado.length > 0) {
            const tieneNuevos = miEstado.some(e => estadoEsNuevo(e));
            const ultimoEstadoId = miEstado[miEstado.length - 1].id;
            const ultimoEstadoImg = miEstado[miEstado.length - 1].media_url || miEstado[miEstado.length - 1].imagen_url;
            const totalVistas = await obtenerVistasEstado(ultimoEstadoId);
            const html = `
                <div class="estado-item" data-userid="${user.id}" style="position:relative;">
                    <div class="estado-circle ${tieneNuevos ? '' : 'visto'}">
                        <div class="estado-inner"><img src="${esc(ultimoEstadoImg)}" alt=""></div>
                    </div>
                    ${totalVistas > 0 ? `<span class="estado-vistas-badge">${totalVistas}</span>` : ''}
                    <div class="estado-name">Tú</div>
                </div>`;
            scroll.insertAdjacentHTML('beforeend', html);
            scroll.querySelector(`[data-userid="${user.id}"]`).onclick = () => abrirEstadoUsuario(user.id);
        }

        // Otros estados
        for (const uid of Object.keys(porUsuario)) {
            if (uid === user.id) continue;
            const entrada = perfilCache.get(uid);
            const p = (entrada && Date.now() - entrada.ts < TTL_PERFIL_MS && entrada.data) || { id: uid, nombre: 'Usuario', handle: 'usuario', avatar_url: null };
            const estadosUsuario = porUsuario[uid];
            const tieneNuevos = estadosUsuario.some(e => estadoEsNuevo(e));
            const html = `
                <div class="estado-item" data-userid="${uid}">
                    <div class="estado-circle ${tieneNuevos ? '' : 'visto'}">
                        <div class="estado-inner">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.nombre || '◈').charAt(0).toUpperCase())}</div>
                    </div>
                    <div class="estado-name">${esc(p.nombre || 'Usuario')}</div>
                </div>`;
            scroll.insertAdjacentHTML('beforeend', html);
            scroll.querySelector(`[data-userid="${uid}"]`).onclick = () => abrirEstadoUsuario(uid);
        }
    } catch (e) { console.warn('Error cargando estados:', e); }
}

// ================================================================
// HISTORIAS · abrir / navegar
// ================================================================
function abrirEstadoUsuario(uid) {
    const estados = estadosCache.filter(e => e.usuario_id === uid);
    if (estados.length === 0) { toast('ℹ️ Este usuario no tiene estados', 'warning'); return; }
    estadoActualUserId = uid; estadoActualIndex = 0; estadoProgresoActual = 0; estadoPausado = false;
    mostrarEstadoActual();
    $('estadoViewer').classList.add('show');
}

function _ocultarEl(id) { const el = $(id); if (el) el.classList.add('hidden'); }
function _mostrarEl(id) { const el = $(id); if (el) el.classList.remove('hidden'); }

async function mostrarEstadoActual() {
    const estados = estadosCache.filter(e => e.usuario_id === estadoActualUserId);
    if (estadoActualIndex >= estados.length) { cerrarEstadoViewer(); return; }
    const estado = estados[estadoActualIndex];
    const esMiEstado = (estadoActualUserId === user.id);

    if (esMiEstado) {
        $('evAvatar').innerHTML = currentUserProfile?.avatar_url ? `<img src="${esc(currentUserProfile.avatar_url)}" alt="">` : esc((currentUserProfile?.nombre || '◈').charAt(0).toUpperCase());
        $('evName').textContent = 'Tú';
    } else {
        db.from('perfiles_publicos').select('nombre, handle, avatar_url').eq('id', estadoActualUserId).maybeSingle().then(r => {
            if (r.data) {
                $('evAvatar').innerHTML = r.data.avatar_url ? `<img src="${esc(r.data.avatar_url)}" alt="">` : esc((r.data.nombre || '◈').charAt(0).toUpperCase());
                $('evName').textContent = r.data.nombre || 'Usuario';
            }
        });
    }

    const urlMedia = estado.media_url || estado.imagen_url;
    const evImageEl = $('evImage');
    const evVideoEl = $('evVideo');
    const tipo = estado.media_tipo || 'imagen';

    if (tipo === 'video') {
        if (evImageEl) evImageEl.style.display = 'none';
        let videoEl = document.getElementById('evVideo');
        if (!videoEl) {
            videoEl = document.createElement('video');
            videoEl.id = 'evVideo';
            videoEl.controls = true;
            videoEl.playsInline = true;
            videoEl.style.cssText = 'width:100%;max-height:80vh;border-radius:12px;display:block;';
            if (evImageEl && evImageEl.parentNode) evImageEl.parentNode.appendChild(videoEl);
        }
        videoEl.style.display = 'block';
        videoEl.src = urlMedia;
        videoEl.play().catch(e => console.log('Auto-play bloqueado:', e));
    } else {
        if (evVideoEl) evVideoEl.style.display = 'none';
        if (evImageEl) {
            evImageEl.style.display = 'block';
            evImageEl.src = urlMedia;
        }
    }

    $('evTime').textContent = haceTiempo(estado.created_at);
    if (estado.caption) { $('evCaption').textContent = estado.caption; $('evCaption').classList.remove('hidden'); }
    else $('evCaption').classList.add('hidden');

    registrarVistaEstado(estado.id);

    $('evPrev').classList.toggle('hidden', estadoActualIndex === 0);
    $('evNext').classList.toggle('hidden', estadoActualIndex >= estados.length - 1);

    // Panel dueño: Vistas + Eliminar · Espectador: Comentar
    const evVistasEl = $('evVistas');
    const evEliminarEl = $('evEliminar');
    const evComentarEl = $('evComentar');

    if (esMiEstado) {
        const total = await obtenerVistasEstado(estado.id);
        if ($('evVistasCount')) $('evVistasCount').textContent = total;
        if (evVistasEl) {
            evVistasEl.classList.remove('hidden');
            evVistasEl.dataset.estadoId = estado.id;
            evVistasEl.onclick = (e) => { e.stopPropagation(); abrirPanelEstado(estado.id, 'vistas'); };
        }
        if (evEliminarEl) {
            evEliminarEl.classList.remove('hidden');
            evEliminarEl.dataset.estadoId = estado.id;
            evEliminarEl.onclick = (e) => { e.stopPropagation(); eliminarHistoriaMensajes(estado.id); };
        }
        _ocultarEl('evComentar');
    } else {
        _ocultarEl('evVistas');
        _ocultarEl('evEliminar');
        if (evComentarEl) {
            evComentarEl.classList.remove('hidden');
            evComentarEl.dataset.estadoId = estado.id;
            evComentarEl.onclick = (e) => { e.stopPropagation(); comentarHistoriaMensajes(estado.id); };
        }
    }

    // Botón Saltar (siempre visible si hay más usuarios)
    const evSkipEl = $('evSkip');
    if (evSkipEl) {
        evSkipEl.classList.remove('hidden');
        evSkipEl.onclick = (e) => { e.stopPropagation(); saltarGrupoMensajes(); };
    }

    iniciarProgresoEstado(estado);
}

function iniciarProgresoEstado(estado) {
    const progress = $('estadoProgress');
    if (estadoTimer) clearInterval(estadoTimer);
    if (progress) progress.style.width = estadoProgresoActual + '%';

    const esVideo = (estado.media_tipo === 'video');
    const duracionMs = (estado.duracion_segundos || 5) * 1000;

    if (esVideo) {
        const videoEl = document.getElementById('evVideo');
        if (videoEl) {
            estadoTimer = setInterval(() => {
                if (estadoPausado || videoEl.paused) return;
                if (videoEl.duration) estadoProgresoActual = (videoEl.currentTime / videoEl.duration) * 100;
                if (progress) progress.style.width = estadoProgresoActual + '%';
            }, 100);
            videoEl.onended = () => { clearInterval(estadoTimer); estadoProgresoActual = 0; siguienteEstado(); };
        }
    } else {
        estadoTimer = setInterval(() => {
            if (estadoPausado) return;
            estadoProgresoActual += 100 / (duracionMs / 50);
            if (progress) progress.style.width = estadoProgresoActual + '%';
            if (estadoProgresoActual >= 100) { clearInterval(estadoTimer); estadoProgresoActual = 0; siguienteEstado(); }
        }, 50);
    }
}

function siguienteEstado() {
    const estados = estadosCache.filter(e => e.usuario_id === estadoActualUserId);
    if (estadoActualIndex < estados.length - 1) {
        estadoActualIndex++; estadoProgresoActual = 0; estadoPausado = false;
        mostrarEstadoActual();
    } else {
        // Al terminar el usuario actual, saltar al siguiente que tenga historias
        saltarGrupoMensajes();
    }
}

function anteriorEstado() {
    if (estadoActualIndex > 0) { estadoActualIndex--; estadoProgresoActual = 0; estadoPausado = false; mostrarEstadoActual(); }
}

// Salta al siguiente usuario con historias activas
function saltarGrupoMensajes() {
    if (!estadoActualUserId) return;
    const ordenUsuarios = [];
    estadosCache.forEach(e => { if (!ordenUsuarios.includes(e.usuario_id)) ordenUsuarios.push(e.usuario_id); });
    const idxActual = ordenUsuarios.indexOf(estadoActualUserId);

    for (let i = idxActual + 1; i < ordenUsuarios.length; i++) {
        const uid = ordenUsuarios[i];
        const estados = estadosCache.filter(e => e.usuario_id === uid);
        if (estados.length > 0) {
            estadoActualUserId = uid;
            estadoActualIndex = 0;
            estadoProgresoActual = 0;
            estadoPausado = false;
            mostrarEstadoActual();
            return;
        }
    }
    cerrarEstadoViewer();
}

function cerrarEstadoViewer() {
    const v = $('estadoViewer'); if (v) v.classList.remove('show');
    if (estadoTimer) clearInterval(estadoTimer);
    estadoTimer = null; estadoPausado = false; estadoProgresoActual = 0; estadoActualUserId = null;
    const videoEl = document.getElementById('evVideo');
    if (videoEl) { videoEl.pause(); videoEl.src = ''; }
    cargarEstados();
}

function activarPausaEstado() {
    if (!$('estadoViewer')?.classList.contains('show')) return;
    estadoPausado = true;
    const videoEl = document.getElementById('evVideo');
    if (videoEl) videoEl.pause();
}

function desactivarPausaEstado() {
    if (!$('estadoViewer')?.classList.contains('show')) return;
    estadoPausado = false;
    const videoEl = document.getElementById('evVideo');
    if (videoEl) videoEl.play().catch(() => {});
}

// ================================================================
// HISTORIAS · panel vistas/comentarios
// ================================================================
async function abrirPanelEstado(estadoId, tab = 'vistas') {
    if (!estadoId) return;
    $('vistasModal').classList.add('show');
    const list = $('vistasList');
    const countEl = $('vistasModalCount');
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Cargando…</div>';
    if (countEl) countEl.textContent = '';

    // Pestañas
    let tabsBar = document.getElementById('vistasTabsBar');
    if (!tabsBar) {
        tabsBar = document.createElement('div');
        tabsBar.id = 'vistasTabsBar';
        tabsBar.style.cssText = 'display:flex;gap:6px;padding:0 4px 10px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:10px;';
        list.parentNode.insertBefore(tabsBar, list);
    }
    tabsBar.innerHTML = `
        <button type="button" data-tab="vistas" style="flex:1;padding:7px 12px;border-radius:99px;border:1px solid ${tab==='vistas'?'var(--gold)':'rgba(255,255,255,.1)'};background:${tab==='vistas'?'rgba(212,175,55,.15)':'transparent'};color:${tab==='vistas'?'var(--gold)':'var(--muted)'};font-size:.72rem;font-weight:700;cursor:pointer;">👁 Vistas</button>
        <button type="button" data-tab="comentarios" style="flex:1;padding:7px 12px;border-radius:99px;border:1px solid ${tab==='comentarios'?'var(--gold)':'rgba(255,255,255,.1)'};background:${tab==='comentarios'?'rgba(212,175,55,.15)':'transparent'};color:${tab==='comentarios'?'var(--gold)':'var(--muted)'};font-size:.72rem;font-weight:700;cursor:pointer;">💬 Comentarios</button>
    `;
    tabsBar.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => abrirPanelEstado(estadoId, btn.dataset.tab);
    });

    try {
        if (tab === 'vistas') {
            const { data: vistas, error } = await db.from('estados_vistas')
                .select('usuario_id, visto_at')
                .eq('estado_id', estadoId)
                .order('visto_at', { ascending: false });
            if (error) throw error;
            if (!vistas || vistas.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Nadie ha visto este estado aún</div>';
                return;
            }
            if (countEl) countEl.textContent = `(${vistas.length})`;
            const ids = vistas.map(v => v.usuario_id);
            const { data: perfiles } = await db.from('perfiles_publicos')
                .select('id, nombre, handle, avatar_url').in('id', ids);
            const perfilMap = {};
            (perfiles || []).forEach(p => { perfilMap[p.id] = p; });
            list.innerHTML = '';
            vistas.forEach(v => {
                const p = perfilMap[v.usuario_id] || { nombre: 'Usuario', handle: '', avatar_url: null };
                const inicial = (p.nombre || '◈').charAt(0).toUpperCase();
                const avatarHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(inicial);
                list.insertAdjacentHTML('beforeend', `
                    <div class="result" style="cursor:pointer;" data-handle="${esc(p.handle || '')}">
                        <div class="avatar">${avatarHTML}</div>
                        <div style="flex:1;min-width:0;"><b>${esc(p.nombre || 'Usuario')}</b><div style="font-size:.68rem;color:var(--muted);">@${esc(p.handle || 'usuario')} · ${haceTiempo(v.visto_at)}</div></div>
                    </div>`);
            });
            list.querySelectorAll('.result').forEach(el => {
                el.onclick = () => { const h = el.dataset.handle; if (h) window.location.href = `/perfil/${h}`; };
            });
        } else {
            // Comentarios vía RPC (misma que usa el Muro)
            const { data: comentarios, error } = await db.rpc('estado_comentarios_lista', { p_estado_id: estadoId });
            if (error) throw error;
            const arr = Array.isArray(comentarios) ? comentarios : (comentarios && comentarios.data) || [];
            if (countEl) countEl.textContent = `(${arr.length})`;
            if (!arr.length) {
                list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Aún no hay comentarios</div>';
                return;
            }
            list.innerHTML = '';
            arr.forEach(c => {
                const nombre = c.nombre || c.usuario_handle || 'Usuario';
                const inicial = nombre.charAt(0).toUpperCase();
                const avatarHTML = c.avatar_url ? `<img src="${esc(c.avatar_url)}" alt="">` : esc(inicial);
                const texto = c.comentario || c.texto || c.contenido || '';
                const cuando = c.created_at ? haceTiempo(c.created_at) : '';
                list.insertAdjacentHTML('beforeend', `
                    <div class="result" style="align-items:flex-start;">
                        <div class="avatar">${avatarHTML}</div>
                        <div style="flex:1;min-width:0;">
                            <b>${esc(nombre)}</b>
                            <div style="font-size:.78rem;color:var(--text-secondary);margin-top:3px;word-break:break-word;">${esc(texto)}</div>
                            ${cuando ? `<div style="font-size:.65rem;color:var(--muted);margin-top:2px;">${esc(cuando)}</div>` : ''}
                        </div>
                    </div>`);
            });
        }
    } catch (e) {
        console.error('[Estados] Error cargando panel:', e);
        list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);font-size:.8rem;">Error al cargar</div>';
    }
}

// Alias de compatibilidad con el nombre anterior
async function abrirVistasModal(estadoId) { return abrirPanelEstado(estadoId, 'vistas'); }

function cerrarVistasModal() { $('vistasModal').classList.remove('show'); }

// ================================================================
// HISTORIAS · eliminar (dueño) · comentar (espectador)
// ================================================================
function extraerPathBucketEstados(url) {
    if (!url) return null;
    const m = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    if (m) return decodeURIComponent(m[1].split('?')[0]);
    if (!url.startsWith('http') && url.includes('/')) return url;
    return null;
}

async function eliminarHistoriaMensajes(estadoId) {
    if (!estadoId || !user) return;
    const confirmado = await NeonModal.confirm({
        title: 'Eliminar historia',
        message: '¿Eliminar esta historia? Se borrará para todos. No se puede deshacer.',
        icon: '🗑',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        danger: true
    });
    if (!confirmado) return;

    try {
        const { data: fila, error: e1 } = await db.from('estados')
            .select('id, media_url, imagen_url, usuario_id')
            .eq('id', estadoId)
            .maybeSingle();
        if (e1) throw e1;
        if (!fila || fila.usuario_id !== user.id) throw new Error('No puedes eliminar esta historia');
        const urlMedia = fila.media_url || fila.imagen_url;

        const { error: e2 } = await db.from('estados')
            .delete()
            .eq('id', estadoId)
            .eq('usuario_id', user.id);
        if (e2) throw e2;

        if (urlMedia) {
            try {
                const path = extraerPathBucketEstados(urlMedia);
                if (path) await db.storage.from(ESTADOS_BUCKET).remove([path]);
            } catch (e) { console.warn('[Estados] No se pudo borrar archivo del bucket:', e); }
        }

        toast('✅ Historia eliminada', 'success');
        if (estadoActualUserId === user.id) cerrarEstadoViewer();
        else await cargarEstados();
    } catch (e) {
        console.error('[Estados] Error eliminando:', e);
        toast('❌ ' + (e.message || 'No se pudo eliminar la historia'), 'error');
    }
}

async function comentarHistoriaMensajes(estadoId) {
    if (!estadoId || !user) return;
    const texto = await NeonModal.prompt({
        title: 'Comentar historia',
        message: 'Escribe tu comentario (máx. 200 caracteres):',
        icon: '💬',
        placeholder: 'Tu comentario…',
        confirmText: 'Enviar',
        cancelText: 'Cancelar',
        maxlength: 200
    });
    if (!texto || !texto.trim()) return;
    try {
        const { error } = await db.rpc('estado_enviar_comentario', {
            p_estado_id: estadoId,
            p_comentario: texto.trim()
        });
        if (error) throw error;
        toast('✅ Comentario enviado', 'success');
    } catch (e) {
        console.error('[Estados] Error comentando:', e);
        toast('❌ ' + (e.message || 'No se pudo enviar el comentario'), 'error');
    }
}

// ================================================================
// HISTORIAS · modal subir / preview / publicar
// ================================================================
function abrirModalEstado() {
    $('estadoUploadModal').classList.add('show');
    $('estadoPreviewWrap').style.display = 'none';
    $('estadoPreviewImg').src = '';
    $('estadoCaption').value = '';
    $('btnPublicarEstado').disabled = true;
    $('estadoFileInput').value = '';
}

function cerrarModalEstado() { $('estadoUploadModal').classList.remove('show'); }
function seleccionarArchivoEstado() { $('estadoFileInput').click(); }

async function previewEstado(event) {
    const file = event.target.files[0];
    if (!file) return;

    const esVideo = file.type.startsWith('video/');
    const maxBytes = esVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) { toast(esVideo ? '❌ Video máximo 25 MB' : '❌ Imagen máxima 10 MB', 'error'); event.target.value = ''; return; }
    if (!file.type.startsWith('image/') && !esVideo) { toast('❌ Solo imágenes o videos', 'error'); event.target.value = ''; return; }

    const reader = new FileReader();
    reader.onload = e => {
        const previewWrap = $('estadoPreviewWrap');
        const previewImg = $('estadoPreviewImg');

        if (esVideo) {
            let previewVideo = document.getElementById('estadoPreviewVideo');
            if (!previewVideo) {
                previewVideo = document.createElement('video');
                previewVideo.id = 'estadoPreviewVideo';
                previewVideo.controls = true;
                previewVideo.muted = true;
                previewVideo.playsInline = true;
                previewVideo.style.cssText = 'width:100%;max-height:50vh;border-radius:12px;display:block;';
                previewImg.parentNode.insertBefore(previewVideo, previewImg.nextSibling);
            }
            previewVideo.src = e.target.result;
            previewVideo.style.display = 'block';
            previewImg.style.display = 'none';
        } else {
            const previewVideo = document.getElementById('estadoPreviewVideo');
            if (previewVideo) previewVideo.style.display = 'none';
            previewImg.style.display = 'block';
            previewImg.src = e.target.result;
        }

        previewWrap.style.display = 'block';
        $('btnPublicarEstado').disabled = false;
    };
    reader.readAsDataURL(file);
}

async function publicarEstado() {
    const fileInput = $('estadoFileInput');
    const file = fileInput.files[0];
    if (!file) { toast('⚠️ Selecciona un archivo', 'error'); return; }
    if (!await auth()) return;

    const esVideo = file.type.startsWith('video/');
    const tipo = esVideo ? 'video' : 'imagen';
    const caption = $('estadoCaption').value.trim();
    const btn = $('btnPublicarEstado');
    btn.disabled = true;
    btn.textContent = '⏳ Publicando...';

    try {
        const d = await subirViaBackend(file, ESTADOS_BUCKET, tipo);

        // expires_at explícito (24 h) — no dependemos del default
        const expiresAt = new Date(Date.now() + ESTADOS_TTL_MS).toISOString();

        const { error: insertError } = await db.from('estados').insert({
            usuario_id: user.id,
            imagen_url: d.url,
            media_url: d.url,
            media_tipo: tipo,
            duracion_segundos: esVideo ? 15 : 5,
            caption: caption || null,
            origen: 'mensajes',
            expires_at: expiresAt
        });

        if (insertError) throw insertError;
        toast('✅ Estado publicado (24h)', 'success');
        cerrarModalEstado();
        await cargarEstados();
    } catch (e) {
        console.error('Error publicando estado:', e);
        if (e.code === '42P01') toast('❌ Tabla "estados" no existe. Ejecuta el SQL.', 'error');
        else toast('❌ ' + (e.message || 'No se pudo publicar el estado'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Publicar estado';
    }
}