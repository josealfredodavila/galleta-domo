// ============================================================
// CSARIEL'S · LLAMADAS-UI · v1.0
// Módulo que maneja la pestaña "Llamadas", el historial,
// bloqueos y la configuración de llamadas.
// Depende de: window.supabaseClient, window.__csarielsMensajesAuth (o similar)
// ============================================================

(function () {
    'use strict';

    var TABLA_HISTORIAL = 'historial_llamadas';
    var historialCache = [];
    var bloqueadosCache = [];
    var configLlamadasCache = { quien_puede_llamarme: 'contactos' };

    function $(id) { return document.getElementById(id); }

    function esc(v) {
        var d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }

    async function obtenerCliente() {
        if (window.supabaseClient) return window.supabaseClient;
        if (window.supabaseReady) {
            try { return await window.supabaseReady; } catch (e) {}
        }
        return null;
    }

    async function tokenSesion() {
        var db = await obtenerCliente();
        if (!db) return null;
        var r = await db.auth.getSession();
        if (!r.data || !r.data.session) return null;
        return { token: r.data.session.access_token, user: r.data.session.user };
    }

    async function llamadaFetch(path, options) {
        options = options || {};
        var s = await tokenSesion();
        if (!s) {
            var e = new Error('no_autenticado');
            e.code = 'no_autenticado';
            throw e;
        }
        var r = await fetch(path, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + s.token
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        var d = await r.json().catch(function () { return {}; });
        if (!r.ok || d.success !== true) {
            var code = d.error || ('http_' + r.status);
            var err = new Error(code);
            err.code = code;
            throw err;
        }
        return d.data || {};
    }

    // ============================================================
    // CARGAR HISTORIAL
    // ============================================================
    async function cargarHistorialLlamadas() {
        var cont = $('historialLlamadasLista');
        if (!cont) return;

        cont.innerHTML = '<div class="empty-state-small"><div class="empty-icon">☎</div><div class="empty-text">Cargando historial…</div></div>';

        var tipo = ($('filtroTipoLlamada')?.value || 'all');
        var direccion = ($('filtroDireccionLlamada')?.value || 'all');

        var qs = new URLSearchParams();
        qs.set('limite', '100');
        if (tipo !== 'all') qs.set('tipo', tipo);
        if (direccion !== 'all') qs.set('direccion', direccion);

        try {
            var data = await llamadaFetch('/api/llamadas/historial?' + qs.toString());
            historialCache = Array.isArray(data) ? data : [];

            if (!historialCache.length) {
                cont.innerHTML = '<div class="empty-state-small">' +
                    '<div class="empty-icon">☎</div>' +
                    '<div class="empty-text">No hay llamadas en tu historial</div>' +
                    '<div style="font-size:.65rem;color:var(--muted);margin-top:4px;">Cuando hagas o recibas llamadas aparecerán aquí</div>' +
                '</div>';
                return;
            }

            cont.innerHTML = historialCache.map(renderFilaHistorial).join('');

            // Handlers
            cont.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
                btn.onclick = function () {
                    borrarLlamada(btn.dataset.id);
                };
            });
            cont.querySelectorAll('[data-action="block"]').forEach(function (btn) {
                btn.onclick = function () {
                    bloquearUsuario(btn.dataset.userid, btn.dataset.nombre);
                };
            });
            cont.querySelectorAll('[data-action="call-back"]').forEach(function (btn) {
                btn.onclick = function () {
                    if (typeof window.openConversation === 'function') {
                        window.openConversation(btn.dataset.userid);
                    }
                };
            });
        } catch (e) {
            console.error('[Llamadas UI] Historial:', e);
            cont.innerHTML = '<div class="empty-state-small">' +
                '<div class="empty-icon">!</div>' +
                '<div class="empty-text">No se pudo cargar el historial</div>' +
            '</div>';
        }
    }

    function renderFilaHistorial(h) {
        var claseIcono = 'entrante';
        var icono = '↙';
        if (h.direccion === 'saliente') { claseIcono = 'saliente'; icono = '↗'; }

        if (h.estado === 'perdida') { claseIcono = 'perdida'; icono = '✕'; }
        else if (h.estado === 'rechazada') { claseIcono = 'rechazada'; icono = '✕'; }
        else if (h.estado === 'fallida') { claseIcono = 'fallida'; icono = '!'; }

        var tipoLabel = h.tipo === 'video' ? '📹 Video' : '☎ Audio';
        var estadoLabel = {
            'contestada': 'Contestada',
            'perdida': 'Perdida',
            'rechazada': 'Rechazada',
            'cancelada': 'Cancelada',
            'fallida': 'Fallida'
        }[h.estado] || h.estado;

        var duracion = '';
        if (h.duracion_seg != null && h.duracion_seg > 0) {
            var min = Math.floor(h.duracion_seg / 60);
            var seg = h.duracion_seg % 60;
            duracion = min + ':' + String(seg).padStart(2, '0');
        }

        var fecha = '—';
        if (h.iniciada_at) {
            var d = new Date(h.iniciada_at);
            var hoy = new Date();
            var esHoy = d.toDateString() === hoy.toDateString();
            fecha = esHoy
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' ' +
                  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        return '<div class="llamada-item">' +
            '<div class="llamada-icono ' + claseIcono + '">' + icono + '</div>' +
            '<div class="llamada-info">' +
                '<div class="llamada-nombre">' + esc(h.contraparte_nombre || 'Usuario') + '</div>' +
                '<div class="llamada-meta">' +
                    '<span class="badge-tipo">' + tipoLabel + '</span>' +
                    '<span class="badge-estado ' + h.estado + '">' + estadoLabel + '</span>' +
                    (duracion ? '<span>' + duracion + '</span>' : '') +
                    '<span>' + fecha + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="llamada-acciones">' +
                '<button data-action="call-back" data-userid="' + esc(h.contraparte_id) + '" title="Llamar de nuevo">☎</button>' +
                '<button class="block" data-action="block" data-userid="' + esc(h.contraparte_id) + '" data-nombre="' + esc(h.contraparte_nombre) + '" title="Bloquear">⛔</button>' +
                '<button class="danger" data-action="delete" data-id="' + esc(h.id) + '" title="Eliminar del historial">🗑</button>' +
            '</div>' +
        '</div>';
    }

    async function borrarLlamada(id) {
        if (!confirm('¿Eliminar esta llamada del historial?')) return;
        try {
            await llamadaFetch('/api/llamadas/historial/' + encodeURIComponent(id), { method: 'DELETE' });
            toast('✅ Llamada eliminada del historial', 'success');
            await cargarHistorialLlamadas();
        } catch (e) {
            console.error('[Llamadas UI] Borrar:', e);
            toast('❌ No se pudo eliminar', 'error');
        }
    }

    async function borrarTodoHistorial() {
        if (!confirm('¿Borrar TODO el historial de llamadas? Esta acción no se puede deshacer.')) return;
        try {
            var d = await llamadaFetch('/api/llamadas/historial', { method: 'DELETE' });
            toast('✅ Historial borrado (' + (d.eliminadas || 0) + ' llamadas)', 'success');
            await cargarHistorialLlamadas();
        } catch (e) {
            console.error('[Llamadas UI] Borrar todo:', e);
            toast('❌ No se pudo borrar el historial', 'error');
        }
    }

    // ============================================================
    // BLOQUEOS
    // ============================================================
    async function bloquearUsuario(userId, nombre) {
        if (!userId) return;
        if (!confirm('¿Bloquear a ' + (nombre || 'este usuario') + '? No podrá llamarte ni tú a él.')) return;
        try {
            await llamadaFetch('/api/llamadas/bloqueos', {
                method: 'POST',
                body: { bloqueadoId: userId }
            });
            toast('⛔ Usuario bloqueado', 'success');
            await cargarHistorialLlamadas();
            await cargarBloqueados();
        } catch (e) {
            if (e.code === 'ya_bloqueado') {
                toast('⚠️ Este usuario ya estaba bloqueado', 'warning');
            } else {
                console.error('[Llamadas UI] Bloquear:', e);
                toast('❌ No se pudo bloquear', 'error');
            }
        }
    }

    async function desbloquearUsuario(userId) {
        if (!userId) return;
        if (!confirm('¿Desbloquear a este usuario? Podrá volver a llamarte.')) return;
        try {
            await llamadaFetch('/api/llamadas/bloqueos/' + encodeURIComponent(userId), { method: 'DELETE' });
            toast('✅ Usuario desbloqueado', 'success');
            await cargarBloqueados();
        } catch (e) {
            console.error('[Llamadas UI] Desbloquear:', e);
            toast('❌ No se pudo desbloquear', 'error');
        }
    }

    async function cargarBloqueados() {
        var cont = $('listaBloqueados');
        var contador = $('countBloqueados');
        if (!cont) return;

        cont.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Cargando…</div>';

        try {
            var data = await llamadaFetch('/api/llamadas/bloqueos');
            bloqueadosCache = Array.isArray(data) ? data : [];

            if (contador) contador.textContent = bloqueadosCache.length;

            if (!bloqueadosCache.length) {
                cont.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">No tienes usuarios bloqueados</div>';
                return;
            }

            cont.innerHTML = bloqueadosCache.map(function (b) {
                var inicial = (b.nombre || '?').charAt(0).toUpperCase();
                var avatarHTML = b.avatar_url
                    ? '<img src="' + esc(b.avatar_url) + '" alt="">'
                    : esc(inicial);
                return '<div class="bloqueado-item">' +
                    '<div class="avatar">' + avatarHTML + '</div>' +
                    '<div class="bloqueado-info">' +
                        '<div class="bloqueado-nombre">' + esc(b.nombre || 'Usuario') + '</div>' +
                        '<div class="bloqueado-handle">@' + esc(b.handle || 'usuario') + '</div>' +
                    '</div>' +
                    '<button data-userid="' + esc(b.bloqueado_id) + '">Desbloquear</button>' +
                '</div>';
            }).join('');

            cont.querySelectorAll('button[data-userid]').forEach(function (btn) {
                btn.onclick = function () { desbloquearUsuario(btn.dataset.userid); };
            });
        } catch (e) {
            console.error('[Llamadas UI] Bloqueados:', e);
            cont.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);font-size:.8rem;">No se pudo cargar la lista</div>';
        }
    }

    // ============================================================
    // CONFIGURACIÓN
    // ============================================================
    async function cargarConfiguracionLlamadas() {
        try {
            var data = await llamadaFetch('/api/llamadas/configuracion');
            configLlamadasCache.quien_puede_llamarme = data.quien_puede_llamarme || 'contactos';
            var sel = $('selectQuienPuedeLlamarme');
            if (sel) sel.value = configLlamadasCache.quien_puede_llamarme;
        } catch (e) {
            console.error('[Llamadas UI] Config get:', e);
        }
    }

    async function guardarConfiguracionLlamadas() {
        var sel = $('selectQuienPuedeLlamarme');
        if (!sel) return;
        var valor = sel.value;
        try {
            await llamadaFetch('/api/llamadas/configuracion', {
                method: 'PUT',
                body: { quien_puede_llamarme: valor }
            });
            configLlamadasCache.quien_puede_llamarme = valor;
            toast('✅ Configuración guardada', 'success');
        } catch (e) {
            console.error('[Llamadas UI] Config put:', e);
            toast('❌ No se pudo guardar', 'error');
        }
    }

    // ============================================================
    // ABRIR MODALES
    // ============================================================
    function abrirModalConfig() {
        cargarConfiguracionLlamadas();
        var m = $('modalConfigLlamadas');
        if (m) m.classList.add('show');
    }

    function cerrarModalConfig() {
        var m = $('modalConfigLlamadas');
        if (m) m.classList.remove('show');
    }

    function abrirModalBloqueados() {
        cargarBloqueados();
        var m = $('modalBloqueados');
        if (m) m.classList.add('show');
    }

    function cerrarModalBloqueados() {
        var m = $('modalBloqueados');
        if (m) m.classList.remove('show');
    }

    // ============================================================
    // HOOK: cambiar pestaña (extiende la existente)
    // ============================================================
    var _cambiarPestanaOriginal = window.cambiarPestana;
    window.cambiarPestana = function (pestana) {
        if (typeof _cambiarPestanaOriginal === 'function') {
            _cambiarPestanaOriginal(pestana);
        }
        var tabLlamadas = document.getElementById('tabLlamadas');
        if (tabLlamadas) {
            tabLlamadas.classList.toggle('hidden', pestana !== 'llamadas');
        }
        if (pestana === 'llamadas') {
            cargarHistorialLlamadas();
        }
    };

    // ============================================================
    // INIT
    // ============================================================
    document.addEventListener('DOMContentLoaded', function () {
        // Botón configuración del header
        var btnConfig = $('btnConfigLlamadas');
        if (btnConfig) btnConfig.onclick = abrirModalConfig;

        var closeModalConfig = $('closeModalConfig');
        if (closeModalConfig) closeModalConfig.onclick = cerrarModalConfig;

        var btnGuardarConfig = $('btnGuardarConfig');
        if (btnGuardarConfig) btnGuardarConfig.onclick = guardarConfiguracionLlamadas;

        var btnVerBloqueados = $('btnVerBloqueados');
        if (btnVerBloqueados) {
            btnVerBloqueados.onclick = function () {
                cerrarModalConfig();
                abrirModalBloqueados();
            };
        }

        var closeModalBloqueados = $('closeModalBloqueados');
        if (closeModalBloqueados) closeModalBloqueados.onclick = cerrarModalBloqueados;

        var btnBorrarTodo = $('btnBorrarTodoHistorial');
        if (btnBorrarTodo) btnBorrarTodo.onclick = borrarTodoHistorial;

        // Bloquear contacto desde el chat activo
        var btnBlock = $('blockUser');
        if (btnBlock) {
            btnBlock.onclick = function () {
                if (!window.current || !window.current.id) {
                    toast('⚠️ Selecciona una conversación', 'error');
                    return;
                }
                if (window.current.bot) {
                    toast('ℹ️ Marquinhos es un bot', 'warning');
                    return;
                }
                bloquearUsuario(window.current.id, window.current.profile?.nombre);
            };
        }

        // Escape cierra modales
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                cerrarModalConfig();
                cerrarModalBloqueados();
            }
        });

        // Click fuera cierra
        var modalConfig = $('modalConfigLlamadas');
        if (modalConfig) {
            modalConfig.addEventListener('click', function (e) {
                if (e.target.id === 'modalConfigLlamadas') cerrarModalConfig();
            });
        }
        var modalBloq = $('modalBloqueados');
        if (modalBloq) {
            modalBloq.addEventListener('click', function (e) {
                if (e.target.id === 'modalBloqueados') cerrarModalBloqueados();
            });
        }

        // Cargar contador de bloqueados al inicio
        setTimeout(function () {
            cargarBloqueados().catch(function () {});
        }, 1500);
    });

    // Exponer para uso global
    window.cargarHistorialLlamadas = cargarHistorialLlamadas;
    window.cargarBloqueados = cargarBloqueados;
    window.bloquearUsuario = bloquearUsuario;
    window.desbloquearUsuario = desbloquearUsuario;
    window.abrirModalConfig = abrirModalConfig;
    window.abrirModalBloqueados = abrirModalBloqueados;
})();