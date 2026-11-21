// ============================================================
// CSARIEL'S · LLAMADAS-UI · v3.0
// Cambios v3.0:
// - Sin emojis: iconos SVG planos en toasts, modales, historial y overlay
// - Corregido el SVG del icono de llamar (path inválido)
// - Filas del historial con la estructura que espera mensajes.html
// - Estilos del historial y del overlay inyectados por el propio JS
// - Botón de llamar del historial inicia la llamada directamente
// - Todas las confirmaciones usan NeonModal (sin confirm() nativo)
// ============================================================

(function () {
    'use strict';

    var TIMEOUT_FETCH_MS = 15000;
    var TIMEOUT_CLIENTE_MS = 8000;
    var historialCache = [];
    var bloqueadosCache = [];
    var configLlamadasCache = { quien_puede_llamarme: 'contactos' };

    function $(id) { return document.getElementById(id); }

    function esc(v) {
        var d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }

    function toast(texto, tipo) {
        if (typeof window.toast === 'function') return window.toast(texto, tipo);
        var el = $('toast');
        if (!el) return;
        el.textContent = texto;
        el.className = 'toast show ' + (tipo || '');
        clearTimeout(el.t);
        el.t = setTimeout(function () { el.classList.remove('show'); }, 3500);
    }

    /* ---------------- Iconos SVG planos ---------------- */

    var ICONOS = {
        phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6.4 6.4l1.2-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z"/>',
        block: '<circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/>',
        trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
        lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/>',
        audio: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6.4 6.4l1.2-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z"/>',
        incoming: '<line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/>',
        outgoing: '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
        alert: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
        check: '<path d="M5 12l5 5 9-10"/>',
        empty: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6.4 6.4l1.2-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z"/>'
    };

    function svg(nombre, clase) {
        return '<svg class="' + (clase || 'ico') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONOS[nombre] || '') + '</svg>';
    }

    /* ---------------- Estilos del historial y del overlay ---------------- */

    function inyectarEstilos() {
        if (document.getElementById('llamadas-ui-estilos')) return;
        var css = `
        .llamada-item {
            display:flex; align-items:center; gap:10px; min-height:64px;
            padding:10px 12px; border:1px solid var(--line,rgba(255,255,255,.08));
            border-radius:12px; background:var(--panel-2,#101826); overflow:hidden;
        }
        .llamada-avatar {
            position:relative; flex:0 0 44px; width:44px; height:44px; border-radius:12px;
            display:grid; place-items:center; overflow:hidden; font-weight:700;
            background:var(--panel,#0b111b); border:1px solid var(--line-strong,rgba(255,255,255,.16));
            color:var(--text,#e8edf3);
        }
        .llamada-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
        .dir-badge {
            position:absolute; right:-4px; bottom:-4px; width:18px; height:18px; border-radius:50%;
            display:grid; place-items:center; border:2px solid var(--panel-2,#101826);
            background:var(--muted,#8593a6);
        }
        .dir-badge.entrante { background:var(--green,#00d68f); }
        .dir-badge.saliente { background:var(--orange,#ff7a1a); }
        .dir-badge.perdida { background:var(--red,#ff4d6d); }
        .dir-badge svg { width:10px; height:10px; stroke:#05080f; fill:none; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; }
        .llamada-info { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:4px; }
        .llamada-nombre { font-size:.92rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .llamada-meta { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
        .badge-tipo, .badge-estado, .meta-duration, .meta-time {
            font-size:.66rem; line-height:1; padding:4px 7px; border-radius:6px;
            border:1px solid var(--line-strong,rgba(255,255,255,.16)); color:var(--muted,#8593a6);
        }
        .badge-estado.contestada { color:var(--green,#00d68f); border-color:var(--green,#00d68f); }
        .badge-estado.perdida, .badge-estado.rechazada, .badge-estado.fallida { color:var(--red,#ff4d6d); border-color:var(--red,#ff4d6d); }
        .meta-time, .meta-duration { border-style:none; padding:0; }
        .llamada-acciones { flex:0 0 auto; display:flex; gap:6px; align-items:center; }
        .llamada-acciones button {
            width:34px; height:34px; display:grid; place-items:center; border-radius:10px;
            border:1px solid var(--line-strong,rgba(255,255,255,.16)); background:transparent;
            color:var(--muted,#8593a6); cursor:pointer;
        }
        .llamada-acciones button:hover { color:var(--orange,#ff7a1a); border-color:var(--orange,#ff7a1a); }
        .llamada-acciones button.call-back:hover { color:var(--green,#00d68f); border-color:var(--green,#00d68f); }
        .llamada-acciones button.danger:hover { color:var(--red,#ff4d6d); border-color:var(--red,#ff4d6d); }
        .llamada-acciones svg { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }

        .call-e2e-header {
            display:flex; align-items:center; justify-content:center; gap:8px;
            font-size:.72rem; color:var(--muted,#8593a6); margin-bottom:18px;
        }
        .call-e2e-header svg { width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
        .call-avatar-block { display:flex; flex-direction:column; align-items:center; gap:6px; margin-bottom:12px; }
        .call-avatar-halo {
            width:104px; height:104px; border-radius:24px; overflow:hidden; display:grid; place-items:center;
            background:var(--panel-2,#101826); border:1px solid var(--line-strong,rgba(255,255,255,.16));
            font-size:2.2rem; font-weight:700; color:var(--muted,#8593a6);
        }
        .call-avatar-halo img { width:100%; height:100%; object-fit:cover; }
        .call-name { font-size:1.3rem; font-weight:700; text-align:center; }
        .call-subname { font-size:.82rem; color:var(--muted,#8593a6); text-align:center; }
        .call-timer { font-variant-numeric:tabular-nums; font-size:1rem; text-align:center; margin:8px 0; }
        .call-status { display:flex; align-items:center; justify-content:center; gap:6px; font-size:.75rem; color:var(--muted,#8593a6); }
        .call-status .dot { width:7px; height:7px; border-radius:50%; background:var(--green,#00d68f); }
        .call-controls-bar { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:18px; }

        .incoming-halo {
            width:112px; height:112px; border-radius:26px; overflow:hidden; margin:0 auto 14px;
            display:grid; place-items:center; background:var(--panel-2,#101826);
            border:1px solid var(--line-strong,rgba(255,255,255,.16)); font-size:2.4rem; font-weight:700;
        }
        .incoming-halo img { width:100%; height:100%; object-fit:cover; }

        .bloqueado-item {
            display:flex; align-items:center; gap:10px; padding:10px 12px; margin-bottom:8px;
            border:1px solid var(--line,rgba(255,255,255,.08)); border-radius:12px; background:var(--panel-2,#101826);
        }
        .bloqueado-item .avatar { width:40px; height:40px; flex:0 0 40px; border-radius:10px; display:grid; place-items:center; overflow:hidden; font-weight:700; background:var(--panel,#0b111b); border:1px solid var(--line-strong,rgba(255,255,255,.16)); }
        .bloqueado-item .avatar img { width:100%; height:100%; object-fit:cover; }
        .bloqueado-info { flex:1; min-width:0; }
        .bloqueado-nombre { font-size:.9rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bloqueado-handle { font-size:.72rem; color:var(--muted,#8593a6); }
        .bloqueado-item button {
            padding:7px 12px; border-radius:9px; border:1px solid var(--green,#00d68f);
            background:transparent; color:var(--green,#00d68f); font-size:.75rem; font-weight:600;
        }`;
        var st = document.createElement('style');
        st.id = 'llamadas-ui-estilos';
        st.textContent = css;
        document.head.appendChild(st);
    }

    /* ---------------- NeonModal ---------------- */

    function obtenerNeonModal() {
        if (window.NeonModal && typeof window.NeonModal.confirm === 'function') {
            return window.NeonModal;
        }
        return {
            confirm: function (opts) {
                return new Promise(function (resolve) {
                    var backdrop = document.createElement('div');
                    backdrop.className = 'neon-modal-backdrop show';
                    backdrop.setAttribute('role', 'dialog');
                    backdrop.setAttribute('aria-modal', 'true');
                    var card = document.createElement('div');
                    card.className = 'neon-modal-card' + (opts.danger ? ' danger' : '');
                    card.innerHTML =
                        (opts.title ? '<h3 class="neon-modal-title">' + esc(opts.title) + '</h3>' : '') +
                        (opts.message ? '<p class="neon-modal-message">' + esc(opts.message) + '</p>' : '') +
                        '<div class="neon-modal-actions">' +
                            '<button type="button" class="neon-modal-btn cancel" data-r="c">' + esc(opts.cancelText || 'Cancelar') + '</button>' +
                            '<button type="button" class="neon-modal-btn ' + (opts.danger ? 'danger' : 'confirm') + '" data-r="k">' + esc(opts.confirmText || 'Aceptar') + '</button>' +
                        '</div>';
                    backdrop.appendChild(card);
                    document.body.appendChild(backdrop);
                    function close(v) {
                        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                        resolve(v);
                    }
                    card.querySelector('[data-r="c"]').addEventListener('click', function () { close(null); });
                    card.querySelector('[data-r="k"]').addEventListener('click', function () { close(true); });
                    backdrop.addEventListener('click', function (e) {
                        if (e.target === backdrop) close(null);
                    });
                });
            }
        };
    }

    /* ---------------- Red y sesión ---------------- */

    function conLimite(promesa, ms, codigo) {
        return new Promise(function (resolve, reject) {
            var t = setTimeout(function () {
                var e = new Error(codigo);
                e.code = codigo;
                reject(e);
            }, ms);
            Promise.resolve(promesa).then(function (v) {
                clearTimeout(t);
                resolve(v);
            }, function (err) {
                clearTimeout(t);
                reject(err);
            });
        });
    }

    async function obtenerCliente() {
        if (window.supabaseClient) return window.supabaseClient;
        if (window.supabaseReady) {
            try {
                return await conLimite(window.supabaseReady, TIMEOUT_CLIENTE_MS, 'cliente_timeout');
            } catch (e) {
                console.error('[Llamadas UI] Cliente Supabase no disponible:', e);
            }
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
        if (!s || !s.token) {
            var eSesion = new Error('no_autenticado');
            eSesion.code = 'no_autenticado';
            throw eSesion;
        }

        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_FETCH_MS);

        var r;
        try {
            r = await fetch(path, {
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + s.token
                },
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
                cache: 'no-store'
            });
        } catch (err) {
            clearTimeout(timer);
            var eRed = new Error(err && err.name === 'AbortError' ? 'timeout' : 'red');
            eRed.code = err && err.name === 'AbortError' ? 'timeout' : 'red';
            throw eRed;
        }
        clearTimeout(timer);

        var d;
        try {
            d = await r.json();
        } catch (_) {
            var eNoJson = new Error('respuesta_no_json');
            eNoJson.code = 'respuesta_no_json';
            eNoJson.status = r.status;
            throw eNoJson;
        }

        if (!r.ok || !d || d.success !== true) {
            var code = (d && d.error) || ('http_' + r.status);
            var err2 = new Error(code);
            err2.code = code;
            err2.status = r.status;
            throw err2;
        }
        return d.data;
    }

    function textoError(e) {
        var code = e && e.code;
        var status = e && e.status;
        if (code === 'no_autenticado') return 'Inicia sesión para ver tu historial.';
        if (code === 'timeout') return 'El servidor tardó más de 15 segundos. Intenta de nuevo.';
        if (code === 'red') return 'Sin conexión con el servidor.';
        if (code === 'respuesta_no_json') return 'Respuesta inválida del servidor (HTTP ' + status + ').';
        if (status === 404) return 'Ruta no encontrada (404). El servicio de llamadas no responde en esa dirección.';
        if (status === 401 || status === 403) return 'Sesión no válida (' + status + '). Vuelve a iniciar sesión.';
        if (status === 500) return 'Error interno del servidor (500).';
        return 'Error: ' + (code || (e && e.message) || 'desconocido') + (status ? ' (HTTP ' + status + ')' : '');
    }

    /* ---------------- Historial ---------------- */

    function mensajeEstado(icono, texto, sub) {
        return '<div class="empty-state-small">' +
            '<div class="empty-icon">' + svg(icono, 'ico') + '</div>' +
            '<div class="empty-text">' + esc(texto) + '</div>' +
            (sub ? '<div style="font-size:.7rem;color:var(--muted);margin-top:4px;">' + esc(sub) + '</div>' : '') +
        '</div>';
    }

    async function cargarHistorialLlamadas() {
        var cont = $('historialLlamadasLista');
        if (!cont) return;

        cont.innerHTML = mensajeEstado('empty', 'Cargando historial…');

        var tipo = ($('filtroTipoLlamada') ? $('filtroTipoLlamada').value : 'all') || 'all';
        var direccion = ($('filtroDireccionLlamada') ? $('filtroDireccionLlamada').value : 'all') || 'all';

        var qs = new URLSearchParams();
        qs.set('limite', '100');
        if (tipo !== 'all') qs.set('tipo', tipo);
        if (direccion !== 'all') qs.set('direccion', direccion);

        try {
            var data = await llamadaFetch('/api/llamadas/historial?' + qs.toString());

            if (!Array.isArray(data)) {
                console.error('[Llamadas UI] Historial: respuesta no es un arreglo', data);
                cont.innerHTML = mensajeEstado('alert', 'Respuesta inválida del servidor.');
                return;
            }

            historialCache = data;

            if (!historialCache.length) {
                cont.innerHTML = mensajeEstado('empty', 'No hay llamadas en tu historial.',
                    'Cuando hagas o recibas llamadas aparecerán aquí.');
                return;
            }

            cont.innerHTML = historialCache.map(renderFilaHistorial).join('');

            cont.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
                btn.onclick = function () { borrarLlamada(btn.dataset.id); };
            });
            cont.querySelectorAll('[data-action="block"]').forEach(function (btn) {
                btn.onclick = function () { bloquearUsuario(btn.dataset.userid, btn.dataset.nombre); };
            });
            cont.querySelectorAll('[data-action="call-back"]').forEach(function (btn) {
                btn.onclick = function () {
                    iniciarLlamadaDesdeHistorial(btn.dataset.userid, btn.dataset.nombre);
                };
            });
        } catch (e) {
            console.error('[Llamadas UI] Historial error:', e);
            cont.innerHTML = mensajeEstado('alert', textoError(e));
        }
    }

    function renderFilaHistorial(h) {
        var esEntrante = h.direccion !== 'saliente';
        var dirClass = esEntrante ? 'entrante' : 'saliente';
        var dirIcon = esEntrante ? 'incoming' : 'outgoing';

        var estadoClase = h.estado || 'cancelada';
        var estadoLabel = {
            'contestada': 'Contestada',
            'perdida': 'Perdida',
            'rechazada': 'Rechazada',
            'cancelada': 'Cancelada',
            'fallida': 'Fallida'
        }[h.estado] || (h.estado || '—');

        var esFallida = ['perdida', 'rechazada', 'fallida'].indexOf(h.estado) !== -1;
        if (esFallida) dirClass = 'perdida';

        var tipoIcon = h.tipo === 'video' ? 'video' : 'audio';
        var tipoLabel = h.tipo === 'video' ? 'Video' : 'Audio';

        var duracion = '';
        if (h.duracion_seg != null && h.duracion_seg > 0) {
            var min = Math.floor(h.duracion_seg / 60);
            var seg = h.duracion_seg % 60;
            duracion = min + ':' + String(seg).padStart(2, '0');
        }

        var fecha = '—';
        if (h.iniciada_at) {
            var d = new Date(h.iniciada_at);
            var esHoy = d.toDateString() === new Date().toDateString();
            fecha = esHoy
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' ' +
                  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        var inicial = (h.contraparte_nombre || 'U').charAt(0).toUpperCase();
        var avatarHTML = h.contraparte_avatar
            ? '<img src="' + esc(h.contraparte_avatar) + '" alt="">'
            : esc(inicial);

        return '<div class="llamada-item">' +
            '<div class="llamada-avatar">' + avatarHTML +
                '<span class="dir-badge ' + dirClass + '">' + svg(dirIcon, '') + '</span>' +
            '</div>' +
            '<div class="llamada-info">' +
                '<div class="llamada-nombre">' + esc(h.contraparte_nombre || 'Usuario') + '</div>' +
                '<div class="llamada-meta">' +
                    '<span class="badge-tipo">' + tipoLabel + '</span>' +
                    '<span class="badge-estado ' + esc(estadoClase) + '">' + estadoLabel + '</span>' +
                    (duracion ? '<span class="meta-duration">' + duracion + '</span>' : '') +
                    '<span class="meta-time">' + fecha + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="llamada-acciones">' +
                '<button type="button" class="call-back" data-action="call-back" data-userid="' + esc(h.contraparte_id) + '" data-nombre="' + esc(h.contraparte_nombre || '') + '" title="Llamar de nuevo" aria-label="Llamar de nuevo">' + svg(tipoIcon, '') + '</button>' +
                '<button type="button" class="block" data-action="block" data-userid="' + esc(h.contraparte_id) + '" data-nombre="' + esc(h.contraparte_nombre || '') + '" title="Bloquear" aria-label="Bloquear">' + svg('block', '') + '</button>' +
                '<button type="button" class="danger" data-action="delete" data-id="' + esc(h.id) + '" title="Eliminar del historial" aria-label="Eliminar del historial">' + svg('trash', '') + '</button>' +
            '</div>' +
        '</div>';
    }

    /* ---------------- Iniciar llamada desde el historial ---------------- */

    async function iniciarLlamadaDesdeHistorial(userId, nombre) {
        if (!userId) {
            toast('Usuario no disponible.', 'error');
            return;
        }
        if (!window.LivekitClient) {
            toast('Las llamadas no están disponibles en este dispositivo. Recarga la página.', 'error');
            return;
        }
        if (!window.current || window.current.id !== userId) {
            if (typeof window.openConversation === 'function') {
                try {
                    await window.openConversation(userId);
                } catch (e) {
                    console.warn('[Llamadas UI] No se pudo abrir la conversación previa:', e);
                }
            }
        }
        if (typeof window.startCall !== 'function') {
            toast('El módulo de llamadas no está listo. Recarga la página.', 'error');
            return;
        }
        try {
            await window.startCall('video');
        } catch (e) {
            console.error('[Llamadas UI] Error iniciando llamada desde historial:', e);
            toast('No se pudo iniciar la llamada: ' + (e.message || 'error'), 'error');
        }
    }

    /* ---------------- Borrar y bloquear ---------------- */

    async function borrarLlamada(id) {
        if (!id) return;
        var modal = obtenerNeonModal();
        var confirmado = await modal.confirm({
            title: 'Eliminar llamada',
            message: '¿Eliminar esta llamada del historial?\n\nEsta acción no se puede deshacer.',
            icon: '',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            danger: true
        });
        if (!confirmado) return;
        try {
            await llamadaFetch('/api/llamadas/historial/' + encodeURIComponent(id), { method: 'DELETE' });
            toast('Llamada eliminada del historial.', 'success');
            await cargarHistorialLlamadas();
        } catch (e) {
            console.error('[Llamadas UI] Borrar:', e);
            toast(textoError(e), 'error');
        }
    }

    async function borrarTodoHistorial() {
        var modal = obtenerNeonModal();
        var confirmado = await modal.confirm({
            title: 'Borrar todo el historial',
            message: '¿Borrar TODO el historial de llamadas?\n\nEsta acción no se puede deshacer.',
            icon: '',
            confirmText: 'Borrar todo',
            cancelText: 'Cancelar',
            danger: true
        });
        if (!confirmado) return;
        try {
            var d = await llamadaFetch('/api/llamadas/historial', { method: 'DELETE' });
            toast('Historial borrado (' + ((d && d.eliminadas) || 0) + ' llamadas).', 'success');
            await cargarHistorialLlamadas();
        } catch (e) {
            console.error('[Llamadas UI] Borrar todo:', e);
            toast(textoError(e), 'error');
        }
    }

    async function bloquearUsuario(userId, nombre) {
        if (!userId) return;
        var modal = obtenerNeonModal();
        var confirmado = await modal.confirm({
            title: 'Bloquear usuario',
            message: '¿Bloquear a ' + (nombre || 'este usuario') + '?\n\nNo podrá llamarte ni tú a él.',
            icon: '',
            confirmText: 'Bloquear',
            cancelText: 'Cancelar',
            danger: true
        });
        if (!confirmado) return;
        try {
            await llamadaFetch('/api/llamadas/bloqueos', {
                method: 'POST',
                body: { bloqueadoId: userId }
            });
            toast('Usuario bloqueado.', 'success');
            await cargarHistorialLlamadas();
            await cargarBloqueados();
        } catch (e) {
            if (e.code === 'ya_bloqueado') {
                toast('Este usuario ya estaba bloqueado.', 'warning');
            } else {
                console.error('[Llamadas UI] Bloquear:', e);
                toast(textoError(e), 'error');
            }
        }
    }

    async function desbloquearUsuario(userId) {
        if (!userId) return;
        var modal = obtenerNeonModal();
        var confirmado = await modal.confirm({
            title: 'Desbloquear usuario',
            message: '¿Desbloquear a este usuario?\n\nPodrá volver a llamarte.',
            icon: '',
            confirmText: 'Desbloquear',
            cancelText: 'Cancelar'
        });
        if (!confirmado) return;
        try {
            await llamadaFetch('/api/llamadas/bloqueos/' + encodeURIComponent(userId), { method: 'DELETE' });
            toast('Usuario desbloqueado.', 'success');
            await cargarBloqueados();
        } catch (e) {
            console.error('[Llamadas UI] Desbloquear:', e);
            toast(textoError(e), 'error');
        }
    }

    async function cargarBloqueados() {
        var cont = $('listaBloqueados');
        var contador = $('countBloqueados');
        if (!cont) return;

        cont.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Cargando…</div>';

        try {
            var data = await llamadaFetch('/api/llamadas/bloqueos');
            if (!Array.isArray(data)) throw Object.assign(new Error('respuesta_invalida'), { code: 'respuesta_invalida' });
            bloqueadosCache = data;

            if (contador) contador.textContent = bloqueadosCache.length;

            if (!bloqueadosCache.length) {
                cont.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">No tienes usuarios bloqueados.</div>';
                return;
            }

            cont.innerHTML = bloqueadosCache.map(function (b) {
                var inicial = (b.nombre || 'U').charAt(0).toUpperCase();
                var avatarHTML = b.avatar_url
                    ? '<img src="' + esc(b.avatar_url) + '" alt="">'
                    : esc(inicial);
                return '<div class="bloqueado-item">' +
                    '<div class="avatar">' + avatarHTML + '</div>' +
                    '<div class="bloqueado-info">' +
                        '<div class="bloqueado-nombre">' + esc(b.nombre || 'Usuario') + '</div>' +
                        '<div class="bloqueado-handle">@' + esc(b.handle || 'usuario') + '</div>' +
                    '</div>' +
                    '<button type="button" data-userid="' + esc(b.bloqueado_id) + '">Desbloquear</button>' +
                '</div>';
            }).join('');

            cont.querySelectorAll('button[data-userid]').forEach(function (btn) {
                btn.onclick = function () { desbloquearUsuario(btn.dataset.userid); };
            });
        } catch (e) {
            console.error('[Llamadas UI] Bloqueados:', e);
            cont.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red);font-size:.8rem;">' +
                esc(textoError(e)) + '</div>';
        }
    }

    /* ---------------- Configuración ---------------- */

    async function cargarConfiguracionLlamadas() {
        try {
            var data = await llamadaFetch('/api/llamadas/configuracion');
            configLlamadasCache.quien_puede_llamarme = (data && data.quien_puede_llamarme) || 'contactos';
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
            toast('Configuración guardada.', 'success');
        } catch (e) {
            console.error('[Llamadas UI] Config put:', e);
            toast(textoError(e), 'error');
        }
    }

    /* ---------------- Modales ---------------- */

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

    /* ---------------- Hook de cambiarPestana ---------------- */

    var _cambiarPestanaOriginal = window.cambiarPestana;
    window.cambiarPestana = function (pestana) {
        if (typeof _cambiarPestanaOriginal === 'function') {
            _cambiarPestanaOriginal(pestana);
        }
        var tabLlamadas = $('tabLlamadas');
        if (tabLlamadas) {
            tabLlamadas.classList.toggle('hidden', pestana !== 'llamadas');
        }
        if (pestana === 'llamadas') {
            cargarHistorialLlamadas();
        }
    };

    /* ---------------- Inicialización ---------------- */

    document.addEventListener('DOMContentLoaded', function () {
        inyectarEstilos();

        var btnConfig = $('btnConfigLlamadas');
        if (btnConfig) btnConfig.onclick = abrirModalConfig;

        var closeModalConfigEl = $('closeModalConfig');
        if (closeModalConfigEl) closeModalConfigEl.onclick = cerrarModalConfig;

        var btnGuardarConfig = $('btnGuardarConfig');
        if (btnGuardarConfig) btnGuardarConfig.onclick = guardarConfiguracionLlamadas;

        var btnVerBloqueados = $('btnVerBloqueados');
        if (btnVerBloqueados) {
            btnVerBloqueados.onclick = function () {
                cerrarModalConfig();
                abrirModalBloqueados();
            };
        }

        var closeModalBloqueadosEl = $('closeModalBloqueados');
        if (closeModalBloqueadosEl) closeModalBloqueadosEl.onclick = cerrarModalBloqueados;

        var btnBorrarTodo = $('btnBorrarTodoHistorial');
        if (btnBorrarTodo) btnBorrarTodo.onclick = borrarTodoHistorial;

        var btnBlock = $('blockUser');
        if (btnBlock) {
            btnBlock.onclick = function () {
                if (!window.current || !window.current.id) {
                    toast('Selecciona una conversación.', 'error');
                    return;
                }
                if (window.current.bot) {
                    toast('Marquinhos no se puede bloquear.', 'warning');
                    return;
                }
                bloquearUsuario(window.current.id, window.current.profile && window.current.profile.nombre);
            };
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                cerrarModalConfig();
                cerrarModalBloqueados();
            }
        });

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

        setTimeout(function () {
            cargarBloqueados().catch(function () {});
        }, 1500);

        iniciarEnhancerOverlayLlamada();
    });

    /* ---------------- Overlay de llamada (estructura y ticker) ---------------- */

    var enhancerTimer = null;
    var enhancerStartAt = 0;
    var enhancerInjected = false;

    function iniciarEnhancerOverlayLlamada() {
        if (enhancerInjected) return;
        var callOverlay = $('callOverlay');
        if (!callOverlay) return;

        if (!callOverlay.dataset.upgraded) {
            var videos = callOverlay.querySelector('.videos');
            var callinfo = callOverlay.querySelector('#callInfo');
            var controls = callOverlay.querySelector('.controls');

            var headerE2E = document.createElement('div');
            headerE2E.className = 'call-e2e-header';
            headerE2E.innerHTML = svg('lock', 'ico') + '<span>Llamada privada y cifrada</span>';

            var avatarBlock = document.createElement('div');
            avatarBlock.className = 'call-avatar-block';
            avatarBlock.id = 'callAvatarBlock';
            avatarBlock.innerHTML =
                '<div class="call-avatar-halo" id="callAvatarHalo"></div>' +
                '<div class="call-name" id="callNameDisplay">Llamada</div>' +
                '<div class="call-subname" id="callSubnameDisplay">Conectando…</div>';

            var timerEl = document.createElement('div');
            timerEl.className = 'call-timer';
            timerEl.id = 'callTimer';
            timerEl.textContent = '00:00';

            var statusEl = document.createElement('div');
            statusEl.className = 'call-status';
            statusEl.id = 'callStatus';
            statusEl.innerHTML = '<span class="dot"></span><span id="callStatusText">Conectando…</span>';

            callOverlay.innerHTML = '';
            callOverlay.appendChild(headerE2E);
            callOverlay.appendChild(avatarBlock);
            callOverlay.appendChild(timerEl);
            callOverlay.appendChild(statusEl);
            if (videos) callOverlay.appendChild(videos);
            if (callinfo) callOverlay.appendChild(callinfo);
            if (controls) {
                if (!controls.classList.contains('call-controls-bar')) {
                    controls.classList.add('call-controls-bar');
                }
                callOverlay.appendChild(controls);
            }

            callOverlay.dataset.upgraded = '1';
        }

        var incomingOverlay = $('incomingOverlay');
        if (incomingOverlay && !incomingOverlay.dataset.upgraded) {
            var avatar = incomingOverlay.querySelector('#incomingAvatar');
            var nameEl = incomingOverlay.querySelector('#incomingName');
            var callinfoIn = incomingOverlay.querySelector('.callinfo');
            var controlsIn = incomingOverlay.querySelector('.controls');

            var halo = document.createElement('div');
            halo.className = 'incoming-halo';
            halo.id = 'incomingHalo';

            var headerIn = document.createElement('div');
            headerIn.className = 'call-e2e-header';
            headerIn.style.marginBottom = '18px';
            headerIn.innerHTML = svg('lock', 'ico') + '<span>Llamada privada y cifrada</span>';

            incomingOverlay.innerHTML = '';
            incomingOverlay.appendChild(headerIn);
            incomingOverlay.appendChild(halo);
            if (nameEl) incomingOverlay.appendChild(nameEl);
            if (callinfoIn) incomingOverlay.appendChild(callinfoIn);
            if (controlsIn) incomingOverlay.appendChild(controlsIn);

            if (avatar) {
                avatar.style.display = 'none';
                avatar.setAttribute('aria-hidden', 'true');
                halo.appendChild(avatar);
            }

            incomingOverlay.dataset.upgraded = '1';
        }

        observarCambiosOverlay(callOverlay);
        enhancerInjected = true;
    }

    function observarCambiosOverlay(callOverlay) {
        var observer = new MutationObserver(function () {
            var isOpen = callOverlay.classList.contains('show');
            if (isOpen) {
                iniciarTickerLlamada();
                actualizarAvatarLlamada();
            } else {
                detenerTickerLlamada();
            }
        });
        observer.observe(callOverlay, { attributes: true, attributeFilter: ['class'] });

        if (callOverlay.classList.contains('show')) {
            iniciarTickerLlamada();
            actualizarAvatarLlamada();
        }
    }

    function actualizarAvatarLlamada() {
        var halo = $('callAvatarHalo');
        var nameDisplay = $('callNameDisplay');
        var subDisplay = $('callSubnameDisplay');
        if (!halo) return;

        var c = window.current;
        if (c && c.profile) {
            var nombre = c.profile.nombre || 'Usuario';
            if (nameDisplay) nameDisplay.textContent = nombre;
            if (subDisplay) subDisplay.textContent = (c.profile.handle ? '@' + c.profile.handle : 'Llamada');
            if (c.profile.avatar_url) {
                halo.innerHTML = '<img src="' + esc(c.profile.avatar_url) + '" alt="">';
            } else {
                halo.textContent = (nombre.charAt(0) || 'U').toUpperCase();
            }
        }
    }

    function iniciarTickerLlamada() {
        detenerTickerLlamada();
        enhancerStartAt = Date.now();
        var timer = $('callTimer');
        var statusText = $('callStatusText');
        if (!timer) return;

        function tick() {
            var elapsed = Math.floor((Date.now() - enhancerStartAt) / 1000);
            var mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
            var ss = String(elapsed % 60).padStart(2, '0');
            timer.textContent = mm + ':' + ss;
            if (statusText) statusText.textContent = elapsed < 2 ? 'Conectando…' : 'En llamada';
        }
        tick();
        enhancerTimer = setInterval(tick, 1000);
    }

    function detenerTickerLlamada() {
        if (enhancerTimer) {
            clearInterval(enhancerTimer);
            enhancerTimer = null;
        }
        var timer = $('callTimer');
        if (timer) timer.textContent = '00:00';
        var statusText = $('callStatusText');
        if (statusText) statusText.textContent = 'Conectando…';
    }

    /* ---------------- Exposición global ---------------- */

    window.cargarHistorialLlamadas = cargarHistorialLlamadas;
    window.cargarBloqueados = cargarBloqueados;
    window.bloquearUsuario = bloquearUsuario;
    window.desbloquearUsuario = desbloquearUsuario;
    window.abrirModalConfig = abrirModalConfig;
    window.abrirModalBloqueados = abrirModalBloqueados;
    window.LlamadasUI = {
        version: '3.0.0',
        iniciarEnhancerOverlayLlamada: iniciarEnhancerOverlayLlamada,
        iniciarLlamadaDesdeHistorial: iniciarLlamadaDesdeHistorial
    };
})();