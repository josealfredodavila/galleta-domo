// ============================================================
// CSARIEL'S · LLAMADAS-UI · v1.3
// Cambios v1.3:
// - renderFilaHistorial rediseñada: avatar circular con badge
//   de dirección superpuesto, badges neón delicadas, acciones
//   circulares con SVG (llamar / bloquear / borrar).
// - NO se tocó: llamadaFetch, auth, historial logic, bloques,
//   config, enhancer del overlay (v1.2).
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
        if (code === 'no_autenticado') return 'Inicia sesión para ver tu historial';
        if (code === 'timeout') return 'El servidor tardó más de 15 s. Intenta de nuevo.';
        if (code === 'red') return 'Sin conexión con el servidor';
        if (code === 'respuesta_no_json') return 'Respuesta inválida del servidor (HTTP ' + status + ')';
        if (status === 404) return 'Ruta no encontrada (404). El backend de llamadas no responde en esa dirección.';
        if (status === 401 || status === 403) return 'Sesión no válida (' + status + '). Vuelve a iniciar sesión.';
        if (status === 500) return 'Error interno del servidor (500).';
        return 'Error: ' + (code || (e && e.message) || 'desconocido') + (status ? ' (HTTP ' + status + ')' : '');
    }

    // ============================================================
    // HISTORIAL
    // ============================================================
    async function cargarHistorialLlamadas() {
        var cont = $('historialLlamadasLista');
        if (!cont) return;

        cont.innerHTML = mensajeEstado('☎', 'Cargando historial…');

        var tipo = ($('filtroTipoLlamada') ? $('filtroTipoLlamada').value : 'all') || 'all';
        var direccion = ($('filtroDireccionLlamada') ? $('filtroDireccionLlamada').value : 'all') || 'all';

        var qs = new URLSearchParams();
        qs.set('limite', '100');
        if (tipo !== 'all') qs.set('tipo', tipo);
        if (direccion !== 'all') qs.set('direccion', direccion);

        try {
            var data = await llamadaFetch('/api/llamadas/historial?' + qs.toString());
            console.log('[Llamadas UI] Historial recibido:', data);

            if (!Array.isArray(data)) {
                console.error('[Llamadas UI] Historial: respuesta no es un arreglo', data);
                cont.innerHTML = mensajeEstado('!', 'Respuesta inválida del servidor');
                return;
            }

            historialCache = data;

            if (!historialCache.length) {
                cont.innerHTML = mensajeEstado('☎', 'No hay llamadas en tu historial',
                    'Cuando hagas o recibas llamadas aparecerán aquí');
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
                    if (typeof window.openConversation === 'function') {
                        window.openConversation(btn.dataset.userid);
                    } else {
                        toast('ℹ️ Abre el chat con ese contacto para llamarle', 'warning');
                    }
                };
            });
        } catch (e) {
            console.error('[Llamadas UI] Historial error:', e);
            cont.innerHTML = mensajeEstado('!', textoError(e));
        }
    }

    function mensajeEstado(icono, texto, sub) {
        return '<div class="empty-state-small">' +
            '<div class="empty-icon">' + esc(icono) + '</div>' +
            '<div class="empty-text">' + esc(texto) + '</div>' +
            (sub ? '<div style="font-size:.65rem;color:var(--muted);margin-top:4px;">' + esc(sub) + '</div>' : '') +
        '</div>';
    }

    function svgIcon(name) {
        switch (name) {
            case 'phone':
                return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
            case 'block':
                return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
            case 'trash':
                return '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
            case 'arrow-in':
                return '↙';
            case 'arrow-out':
                return '↗';
            case 'close':
                return '✕';
            case 'alert':
                return '!';
            default:
                return '';
        }
    }

    function renderFilaHistorial(h) {
        // Dirección y estado
        var esEntrante = h.direccion !== 'saliente';
        var dirClass = esEntrante ? 'entrante' : 'saliente';
        var dirIcon = esEntrante ? '↙' : '↗';

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

        var tipoLabel = h.tipo === 'video' ? '📹 Video' : '☎ Audio';

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

        // Avatar
        var inicial = (h.contraparte_nombre || '?').charAt(0).toUpperCase();
        var avatarHTML = h.contraparte_avatar
            ? '<img src="' + esc(h.contraparte_avatar) + '" alt="">'
            : esc(inicial);

        return '<div class="llamada-item">' +
            '<div class="llamada-avatar">' + avatarHTML +
                '<span class="dir-badge ' + dirClass + '">' + dirIcon + '</span>' +
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
                '<button type="button" class="call-back" data-action="call-back" data-userid="' + esc(h.contraparte_id) + '" title="Llamar de nuevo" aria-label="Llamar de nuevo">' + svgIcon('phone') + '</button>' +
                '<button type="button" class="block" data-action="block" data-userid="' + esc(h.contraparte_id) + '" data-nombre="' + esc(h.contraparte_nombre) + '" title="Bloquear" aria-label="Bloquear">' + svgIcon('block') + '</button>' +
                '<button type="button" class="danger" data-action="delete" data-id="' + esc(h.id) + '" title="Eliminar del historial" aria-label="Eliminar del historial">' + svgIcon('trash') + '</button>' +
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
            toast('❌ ' + textoError(e), 'error');
        }
    }

    async function borrarTodoHistorial() {
        if (!confirm('¿Borrar TODO el historial de llamadas? Esta acción no se puede deshacer.')) return;
        try {
            var d = await llamadaFetch('/api/llamadas/historial', { method: 'DELETE' });
            toast('✅ Historial borrado (' + ((d && d.eliminadas) || 0) + ' llamadas)', 'success');
            await cargarHistorialLlamadas();
        } catch (e) {
            console.error('[Llamadas UI] Borrar todo:', e);
            toast('❌ ' + textoError(e), 'error');
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
                toast('❌ ' + textoError(e), 'error');
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
            toast('❌ ' + textoError(e), 'error');
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
            cont.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);font-size:.8rem;">' +
                esc(textoError(e)) + '</div>';
        }
    }

    // ============================================================
    // CONFIG
    // ============================================================
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
            toast('✅ Configuración guardada', 'success');
        } catch (e) {
            console.error('[Llamadas UI] Config put:', e);
            toast('❌ ' + textoError(e), 'error');
        }
    }

    // ============================================================
    // MODALES
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
    // HOOK cambiarPestana
    // ============================================================
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

    // ============================================================
    // INIT
    // ============================================================
    document.addEventListener('DOMContentLoaded', function () {
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

    // ============================================================
    // CALLS UI ENHANCER — v1.2 (sin cambios)
    // ============================================================
    var enhancerTimer = null;
    var enhancerStartAt = 0;
    var enhancerInjected = false;

    function iniciarEnhancerOverlayLlamada() {
        if (enhancerInjected) return;
        var callOverlay = $('callOverlay');
        if (!callOverlay) return;

        if (!callOverlay.dataset.upgraded) {
            const videos = callOverlay.querySelector('.videos');
            const callinfo = callOverlay.querySelector('#callInfo');
            const controls = callOverlay.querySelector('.controls');

            const headerE2E = document.createElement('div');
            headerE2E.className = 'call-e2e-header';
            headerE2E.innerHTML = '<span class="lock">🔒</span><span>Llamada privada y cifrada · E2E</span>';

            const avatarBlock = document.createElement('div');
            avatarBlock.className = 'call-avatar-block';
            avatarBlock.id = 'callAvatarBlock';
            avatarBlock.innerHTML = `
                <div class="call-avatar-halo" id="callAvatarHalo">◈</div>
                <div class="call-name" id="callNameDisplay">Llamada</div>
                <div class="call-subname" id="callSubnameDisplay">Conectando…</div>
            `;

            const timerEl = document.createElement('div');
            timerEl.className = 'call-timer';
            timerEl.id = 'callTimer';
            timerEl.textContent = '00:00';

            const statusEl = document.createElement('div');
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
            const avatar = incomingOverlay.querySelector('#incomingAvatar');
            const nameEl = incomingOverlay.querySelector('#incomingName');
            const callinfo = incomingOverlay.querySelector('.callinfo');
            const controls = incomingOverlay.querySelector('.controls');

            const halo = document.createElement('div');
            halo.className = 'incoming-halo';
            halo.id = 'incomingHalo';
            if (avatar) {
                halo.innerHTML = avatar.innerHTML || '◈';
                avatar.style.display = 'none';
                avatar.setAttribute('aria-hidden', 'true');
            } else {
                halo.innerHTML = '◈';
            }

            const headerE2E = document.createElement('div');
            headerE2E.className = 'call-e2e-header';
            headerE2E.style.marginBottom = '18px';
            headerE2E.innerHTML = '<span class="lock">🔒</span><span>Llamada privada y cifrada · E2E</span>';

            incomingOverlay.innerHTML = '';
            incomingOverlay.appendChild(headerE2E);
            incomingOverlay.appendChild(halo);
            if (nameEl) incomingOverlay.appendChild(nameEl);
            if (callinfo) incomingOverlay.appendChild(callinfo);
            if (controls) incomingOverlay.appendChild(controls);

            if (avatar) {
                avatar.style.display = 'none';
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
                halo.textContent = (nombre.charAt(0) || '◈').toUpperCase();
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
            if (elapsed < 2 && statusText) statusText.textContent = 'Conectando…';
            else if (elapsed >= 2 && statusText) statusText.textContent = 'En llamada';
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

    // ============================================================
    // EXPOSICIÓN GLOBAL
    // ============================================================
    window.cargarHistorialLlamadas = cargarHistorialLlamadas;
    window.cargarBloqueados = cargarBloqueados;
    window.bloquearUsuario = bloquearUsuario;
    window.desbloquearUsuario = desbloquearUsuario;
    window.abrirModalConfig = abrirModalConfig;
    window.abrirModalBloqueados = abrirModalBloqueados;
    window.LlamadasUI = {
        version: '1.3.0',
        iniciarEnhancerOverlayLlamada: iniciarEnhancerOverlayLlamada
    };
})();