// ================================================================
// GRUPOS · ADMINISTRACIÓN
// ================================================================
// Panel de administración del canal: miembros, publicaciones,
// solicitudes, reportes y editar datos del canal.
// Depende de: grupos-config.js, grupos-utils.js
// ================================================================

// ================================================================
// ABRIR / CERRAR MODAL ADMIN
// ================================================================
async function abrirAdminGrupo() {
    cerrarAjustesCanal();
    if (!esAdmin && !esModerador) { grpShowToast('Sin permisos', 'error'); return; }
    if (!grupoActualId) return;
    document.getElementById('modalAdminGrupo').classList.add('show');
    await cargarAdminMiembros();
}

function cerrarModalAdmin() {
    document.getElementById('modalAdminGrupo').classList.remove('show');
}

// ================================================================
// CARGAR MIEMBROS
// ================================================================
async function cargarAdminMiembros() {
    var container = document.getElementById('adminContenido');
    container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><h3>Cargando...</h3></div>';
    try {
        var result = await window.supabaseClient
            .from('grupos_video_miembros_publicos')
            .select('*')
            .eq('grupo_id', grupoActualId)
            .order('created_at', { ascending: true });
        if (result.error) throw result.error;
        var miembros = result.data || [];
        if (miembros.length === 0) {
            container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><h3>Sin miembros</h3></div>';
            return;
        }
        var html = '<h4 style="color:var(--gold);font-size:0.8rem;margin-bottom:12px;">Miembros (' + miembros.length + ')</h4>';
        miembros.forEach(function(m) {
            var esCreadorDelGrupo = m.rol === 'administrador';
            var esYo = m.usuario_id === sessionUser?.id;
            var estado = m.estado || 'activo';
            var estadoColor = estado === 'activo' ? 'var(--success)' : estado === 'bloqueado' ? 'var(--danger)' : 'var(--warning)';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--glass-border);">' +
                '<div><span style="font-weight:600;">' + grpEscapeHTML(m.usuario_nombre || 'Usuario') + '</span>' +
                (esCreadorDelGrupo ? ' <span style="color:var(--gold);font-size:0.6rem;">Admin</span>' : '') +
                (m.rol === 'moderador' ? ' <span style="color:var(--cyan);font-size:0.6rem;">Mod</span>' : '') +
                (esYo ? ' <span style="color:var(--text-muted);font-size:0.6rem;">(tú)</span>' : '') +
                ' <span style="color:' + estadoColor + ';font-size:0.5rem;">● ' + estado + '</span></div>' +
                (esAdmin && !esCreadorDelGrupo && !esYo ? '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
                    (m.rol !== 'moderador' ? '<button class="btn-outline btn-sm" onclick="asignarModerador(\'' + m.usuario_id + '\')">Mod</button> ' : '') +
                    (m.rol === 'moderador' ? '<button class="btn-outline btn-sm" onclick="quitarModerador(\'' + m.usuario_id + '\')">Quitar Mod</button> ' : '') +
                    (estado === 'activo' ? '<button class="btn-danger btn-sm" onclick="expulsarMiembro(\'' + m.usuario_id + '\')">Expulsar</button> ' : '') +
                    (estado === 'activo' ? '<button class="btn-danger btn-sm" onclick="bloquearMiembro(\'' + m.usuario_id + '\')">Bloquear</button>' : '') +
                    '</div>' : '') + '</div>';
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Error</div>';
    }
}

// ================================================================
// CARGAR PUBLICACIONES (admin)
// ================================================================
async function cargarAdminPublicaciones() {
    var container = document.getElementById('adminContenido');
    container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><h3>Cargando...</h3></div>';
    try {
        var result = await window.supabaseClient
            .from('grupos_video_publicaciones_publicas')
            .select('*')
            .eq('grupo_id', grupoActualId)
            .order('created_at', { ascending: false });
        if (result.error) throw result.error;
        var publicaciones = result.data || [];
        if (publicaciones.length === 0) {
            container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg><h3>Sin publicaciones</h3></div>';
            return;
        }
        var html = '<h4 style="color:var(--gold);font-size:0.8rem;margin-bottom:12px;">Publicaciones (' + publicaciones.length + ')</h4>';
        publicaciones.forEach(function(p) {
            var estado = p.estado || 'publicado';
            var estadoColor = estado === 'publicado' ? 'var(--success)' : estado === 'oculto' ? 'var(--warning)' : 'var(--danger)';
            var contenido = grpEscapeHTML((p.contenido || '').substring(0, 60));
            var tipoBadge = p.tipo_marketplace ? '<span style="color:var(--success);font-size:0.55rem;">MK ' + p.tipo_marketplace + '</span>' : '';
            html += '<div style="padding:8px 0;border-bottom:1px solid var(--glass-border);">' +
                '<div style="font-weight:600;font-size:0.75rem;">' + grpEscapeHTML(p.usuario_nombre || 'Usuario') + ' ' + tipoBadge + ' <span style="color:' + estadoColor + ';font-size:0.5rem;">● ' + estado + '</span></div>' +
                '<div style="font-size:0.7rem;color:var(--text-secondary);">' + contenido + '</div>' +
                '<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">' +
                (estado === 'publicado' && (esAdmin || esModerador) ? '<button class="btn-outline btn-sm" onclick="ocultarPublicacion(\'' + p.id + '\')">Ocultar</button>' : '') +
                (estado === 'oculto' && (esAdmin || esModerador) ? '<button class="btn-outline btn-sm" onclick="mostrarPublicacion(\'' + p.id + '\')">Mostrar</button>' : '') +
                ((esAdmin || esModerador) ? '<button class="btn-danger btn-sm" onclick="eliminarPublicacion(\'' + p.id + '\')">Eliminar</button>' : '') +
                '</div></div>';
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Error</div>';
    }
}

// ================================================================
// CARGAR SOLICITUDES
// ================================================================
async function cargarAdminSolicitudes() {
    var container = document.getElementById('adminContenido');
    container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><h3>Cargando...</h3></div>';
    try {
        var result = await window.supabaseClient
            .from('grupos_video_solicitudes_publicas')
            .select('*')
            .eq('grupo_id', grupoActualId)
            .eq('estado', 'pendiente')
            .order('created_at', { ascending: true });
        if (result.error) throw result.error;
        var solicitudes = result.data || [];
        if (solicitudes.length === 0) {
            container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><h3>Sin solicitudes</h3></div>';
            return;
        }
        var html = '<h4 style="color:var(--gold);font-size:0.8rem;margin-bottom:12px;">Solicitudes (' + solicitudes.length + ')</h4>';
        solicitudes.forEach(function(s) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--glass-border);">' +
                '<div><span style="font-weight:600;">' + grpEscapeHTML(s.usuario_nombre || 'Usuario') + '</span></div>' +
                '<div style="display:flex;gap:4px;">' +
                '<button class="btn-gold btn-sm" onclick="aceptarSolicitud(\'' + s.id + '\')">Aceptar</button>' +
                '<button class="btn-danger btn-sm" onclick="rechazarSolicitud(\'' + s.id + '\')">Rechazar</button>' +
                '</div></div>';
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Error</div>';
    }
}

// ================================================================
// CARGAR REPORTES
// ================================================================
async function cargarAdminReportes() {
    var container = document.getElementById('adminContenido');
    container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><h3>Cargando...</h3></div>';
    try {
        var result = await window.supabaseClient
            .from('grupos_video_reportes_publicos')
            .select('*')
            .eq('grupo_id', grupoActualId)
            .eq('estado', 'pendiente')
            .order('created_at', { ascending: false });
        if (result.error) throw result.error;
        var reportes = result.data || [];
        if (reportes.length === 0) {
            container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><h3>Sin reportes pendientes</h3></div>';
            return;
        }
        var html = '<h4 style="color:var(--gold);font-size:0.8rem;margin-bottom:12px;">Reportes (' + reportes.length + ')</h4>';
        reportes.forEach(function(r) {
            html += '<div style="padding:10px 0;border-bottom:1px solid var(--glass-border);">' +
                '<div style="font-size:0.7rem;"><strong style="color:var(--gold);">Tipo:</strong> ' + grpEscapeHTML(r.tipo) + ' · <strong style="color:var(--gold);">Motivo:</strong> ' + grpEscapeHTML(r.motivo) + '</div>' +
                '<div style="font-size:0.65rem;color:var(--text-secondary);margin-top:4px;">Por: ' + grpEscapeHTML(r.usuario_nombre || 'Usuario') + '</div>' +
                (r.descripcion ? '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;font-style:italic;">"' + grpEscapeHTML(r.descripcion) + '"</div>' : '') +
                '<div style="display:flex;gap:4px;margin-top:6px;">' +
                '<button class="btn-outline btn-sm" onclick="marcarReporte(\'' + r.id + '\', \'resuelto\')">Resuelto</button>' +
                '<button class="btn-outline btn-sm" onclick="marcarReporte(\'' + r.id + '\', \'descartado\')">Descartar</button>' +
                '</div></div>';
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Error</div>';
    }
}

async function marcarReporte(reporteId, estado) {
    try {
        grpOk(await window.supabaseClient.from('grupos_video_reportes').update({
            estado: estado,
            revisado_por: sessionUser.id,
            revisado_at: new Date().toISOString()
        }).eq('id', reporteId));
        grpShowToast('Reporte ' + estado, 'success');
        cargarAdminReportes();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

// ================================================================
// EDITAR DATOS DEL CANAL
// ================================================================
async function cargarAdminEditar() {
    var container = document.getElementById('adminContenido');
    container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><h3>Cargando...</h3></div>';
    try {
        var result = await window.supabaseClient
            .from('grupos_video')
            .select('*')
            .eq('id', grupoActualId)
            .single();
        if (result.error) throw result.error;
        var g = result.data;
        var html = '<h4 style="color:var(--gold);font-size:0.8rem;margin-bottom:12px;">Editar canal</h4>' +
            '<div class="form-group"><label>Nombre</label><input type="text" id="editGrupoNombre" value="' + grpEscapeHTML(g.nombre || '') + '" /></div>' +
            '<div class="form-group"><label>Descripción</label><textarea id="editGrupoDescripcion" rows="2">' + grpEscapeHTML(g.descripcion || '') + '</textarea></div>' +
            '<div class="form-group"><label>Estado</label><input type="text" id="editGrupoEstado" value="' + grpEscapeHTML(g.estado_region || '') + '" /></div>' +
            '<div class="form-group"><label>Municipio</label><input type="text" id="editGrupoMunicipio" value="' + grpEscapeHTML(g.municipio || '') + '" /></div>' +
            '<div class="form-group"><label>Ciudad</label><input type="text" id="editGrupoCiudad" value="' + grpEscapeHTML(g.ciudad || '') + '" /></div>' +
            '<div class="form-group"><label>Precio Búho (USDT)</label><input type="number" id="editGrupoPrecio" value="' + (g.precio_usdt || 0) + '" min="0" step="1" /></div>' +
            '<div class="form-group"><label>Visibilidad</label><select id="editGrupoVisibilidad"><option value="publico"' + (g.visibilidad === 'publico' ? ' selected' : '') + '>Público</option><option value="privado"' + (g.visibilidad === 'privado' ? ' selected' : '') + '>Privado</option></select></div>' +
            '<div class="form-group"><label>Modo ingreso</label><select id="editGrupoModoIngreso"><option value="abierto"' + (g.modo_ingreso === 'abierto' ? ' selected' : '') + '>Abierto</option><option value="solicitud"' + (g.modo_ingreso === 'solicitud' ? ' selected' : '') + '>Solicitud</option><option value="invitacion"' + (g.modo_ingreso === 'invitacion' ? ' selected' : '') + '>Invitación</option></select></div>' +
            '<button class="btn-gold" style="width:100%;justify-content:center;padding:10px;" onclick="guardarEdicionGrupo()">Guardar cambios</button>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Error</div>';
    }
}

async function guardarEdicionGrupo() {
    var nombre = document.getElementById('editGrupoNombre')?.value?.trim();
    var descripcion = document.getElementById('editGrupoDescripcion')?.value?.trim();
    var estado = document.getElementById('editGrupoEstado')?.value?.trim();
    var municipio = document.getElementById('editGrupoMunicipio')?.value?.trim();
    var ciudad = document.getElementById('editGrupoCiudad')?.value?.trim();
    var precio = document.getElementById('editGrupoPrecio')?.value;
    var visibilidad = document.getElementById('editGrupoVisibilidad')?.value;
    var modoIngreso = document.getElementById('editGrupoModoIngreso')?.value;

    if (!nombre) { grpShowToast('El nombre es requerido', 'warning'); return; }
    if (!validarTextoPermitido(nombre, 'Nombre del canal')) return;
    if (!validarTextoPermitido(descripcion, 'Descripción del canal')) return;

    try {
        var result = await window.supabaseClient.from('grupos_video').update({
            nombre: nombre,
            descripcion: descripcion || null,
            estado_region: estado || null,
            municipio: municipio || null,
            ciudad: ciudad || null,
            precio_usdt: parseFloat(precio) || 0,
            visibilidad: visibilidad,
            modo_ingreso: modoIngreso
        }).eq('id', grupoActualId).select().single();

        if (result.error) throw result.error;
        grpShowToast('Canal actualizado', 'success');
        cerrarModalAdmin();
        await abrirGrupo(grupoActualId);
        await cargarGrupos();
    } catch (e) {
        grpShowToast('Error: ' + e.message, 'error');
    }
}

// ================================================================
// ACCIONES DE MODERACIÓN
// ================================================================
async function aceptarSolicitud(solicitudId) {
    try {
        grpOk(await window.supabaseClient.rpc('aceptar_solicitud_grupo', { p_solicitud_id: solicitudId }));
        grpShowToast('Solicitud aceptada', 'success');
        await cargarAdminSolicitudes();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

async function rechazarSolicitud(solicitudId) {
    try {
        var motivo = prompt('Motivo:', '');
        grpOk(await window.supabaseClient.rpc('rechazar_solicitud_grupo', {
            p_solicitud_id: solicitudId,
            p_motivo: motivo || 'Rechazado'
        }));
        grpShowToast('Rechazada', 'success');
        await cargarAdminSolicitudes();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

async function asignarModerador(usuarioId) {
    if (!confirm('¿Asignar moderador?')) return;
    try {
        grpOk(await window.supabaseClient.rpc('asignar_moderador_grupo', {
            p_grupo_id: grupoActualId,
            p_usuario_id: usuarioId
        }));
        grpShowToast('Moderador asignado', 'success');
        await cargarAdminMiembros();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

async function quitarModerador(usuarioId) {
    if (!confirm('¿Quitar moderador?')) return;
    try {
        grpOk(await window.supabaseClient.rpc('quitar_moderador_grupo', {
            p_grupo_id: grupoActualId,
            p_usuario_id: usuarioId
        }));
        grpShowToast('Quitado', 'success');
        await cargarAdminMiembros();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

async function expulsarMiembro(usuarioId) {
    if (!confirm('¿Expulsar?')) return;
    var motivo = prompt('Motivo:', '');
    if (motivo === null) return;
    try {
        grpOk(await window.supabaseClient.rpc('expulsar_miembro_grupo', {
            p_grupo_id: grupoActualId,
            p_usuario_id: usuarioId,
            p_motivo: motivo || 'Expulsado'
        }));
        grpShowToast('Expulsado', 'success');
        await cargarAdminMiembros();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

async function bloquearMiembro(usuarioId) {
    if (!confirm('¿Bloquear?')) return;
    var motivo = prompt('Motivo:', '');
    if (motivo === null) return;
    try {
        grpOk(await window.supabaseClient.rpc('bloquear_miembro_grupo', {
            p_grupo_id: grupoActualId,
            p_usuario_id: usuarioId,
            p_motivo: motivo || 'Bloqueado'
        }));
        grpShowToast('Bloqueado', 'success');
        await cargarAdminMiembros();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

async function ocultarPublicacion(publicacionId) {
    var motivo = prompt('Motivo:', 'Inapropiado');
    if (motivo === null) return;
    try {
        grpOk(await window.supabaseClient.rpc('ocultar_publicacion_grupo', {
            p_publicacion_id: publicacionId,
            p_motivo: motivo
        }));
        grpShowToast('Ocultada', 'success');
        await cargarAdminPublicaciones();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

async function mostrarPublicacion(publicacionId) {
    try {
        grpOk(await window.supabaseClient.rpc('mostrar_publicacion_grupo', {
            p_publicacion_id: publicacionId
        }));
        grpShowToast('Visible', 'success');
        await cargarAdminPublicaciones();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}

async function eliminarPublicacion(publicacionId) {
    if (!confirm('¿Eliminar?')) return;
    var motivo = prompt('Motivo:', 'Inapropiado');
    if (motivo === null) return;
    try {
        grpOk(await window.supabaseClient.rpc('eliminar_publicacion_grupo', {
            p_publicacion_id: publicacionId,
            p_motivo: motivo
        }));
        grpShowToast('Eliminada', 'success');
        await cargarAdminPublicaciones();
    } catch (e) {
        grpShowToast('Error: ' + (e.message || e), 'error');
    }
}