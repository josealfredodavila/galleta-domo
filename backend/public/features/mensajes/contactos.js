/* ============================================================
   CSARIEL'S · CONTACTOS · MESSENGER EXPERIENCE v20 · PRO MAX
   PARTE 1/4 — Núcleo: Config, Utilidades, Sesión y Carga
   ============================================================ */

(function () {
    'use strict';

    /* ============================================================
       CONFIGURACIÓN
       ============================================================ */
    var CONFIG = Object.freeze({
        CONTACTOS_TABLE: 'contactos',
        PERFILES_VISTA: 'perfiles_publicos',
        BLOQUEOS_TABLE: 'bloqueos',
        RPC_BLOQUEAR: 'bloquear_contacto',
        RPC_INVITACION: 'obtener_o_crear_invitacion',
        RPC_RESPONDER_SOLICITUD: 'responder_solicitud_amistad',
        RPC_ELIMINAR_AMISTAD: 'eliminar_amistad',

        PAGE_SIZE: 30,
        MAX_RESULTADOS_BUSQUEDA: 20,
        MAX_SUGERENCIAS: 10,
        MIN_CHARS_BUSQUEDA: 2,
        MAX_CHARS_BUSQUEDA: 80,

        SESSION_TIMEOUT_MS: 7000,
        PROFILE_CACHE_TTL_MS: 300000,
        CACHE_MAX_SIZE: 500,
        DEBOUNCE_BUSQUEDA_MS: 350,
        DEBOUNCE_FILTRO_MS: 200,

        RETRY_MAX: 3,
        RETRY_BASE_MS: 500,
        PARALLEL_CHUNKS: 3,

        CAMPOS_PUBLICOS: 'id, nombre, handle, avatar_url, online, ultima_conexion, verificado'
    });

    /* ============================================================
       ESTADO GLOBAL
       ============================================================ */
    var state = {
        initialized: false,
        inicializando: false,
        cargando: false,
        session: null,
        sessionExpira: 0,

        contactos: [],
        totalContactos: 0,
        paginaActual: 0,
        hayMas: true,

        filtroActual: 'todos',
        textoBusqueda: '',

        busquedaTimer: null,
        filtroTimer: null,
        observerScroll: null,

        perfilCache: new Map(),
        idsContactosSet: new Set(),

        busquedaVersion: 0,
        operacionEnCurso: new Set(),
        renderToken: 0
    };

    /* ============================================================
       ICONOS SVG
       ============================================================ */
    var SVG_ICONS = Object.freeze({
        mensaje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>',
        llamar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92Z"/></svg>',
        favorito: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',
        favoritoOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',
        bloquear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m5.64 5.64 12.72 12.72"/></svg>',
        eliminar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
        cancelar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>',
        agregarAmigo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M19 8v6"/><path d="M16 11h6"/></svg>'
    });

    /* ============================================================
       UTILIDADES
       ============================================================ */
    function sb() {
        var c = window.supabaseClient;
        return (c && typeof c.from === 'function') ? c : null;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizarTextoBusqueda(v) {
        return String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, CONFIG.MAX_CHARS_BUSQUEDA);
    }

    function obtenerAvatarSeguro(url) {
        if (!url) return '';
        var v = String(url).trim();
        if (!v) return '';
        try {
            if (v.charAt(0) === '/' && v.indexOf('//') !== 0) return v;
            var u = new URL(v, window.location.origin);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
            return u.href;
        } catch (e) { return ''; }
    }

    function obtenerInicial(nombre) {
        var t = String(nombre || 'U').trim();
        return t ? t.charAt(0).toUpperCase() : 'U';
    }

    function debounce(fn, ms) {
        var timer = null;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
        };
    }

    function emitirListo() {
        try { window.dispatchEvent(new Event('contactos:listo')); } catch (e) {}
    }

    function showToast(mensaje, tipo) {
        var toast = document.getElementById('toast');
        if (!toast) { console.log('[Csariel’s]', mensaje); return; }
        toast.textContent = String(mensaje || '');
        toast.className = 'toast' + (tipo ? ' ' + tipo : '');
        requestAnimationFrame(function () { toast.classList.add('show'); });
        clearTimeout(window.__contactosToastTimer);
        window.__contactosToastTimer = setTimeout(function () {
            toast.classList.remove('show');
        }, 3500);
    }
    window.showToast = showToast;

    function ejecutarUnaVez(clave, callback) {
        if (state.operacionEnCurso.has(clave)) return false;
        state.operacionEnCurso.add(clave);
        Promise.resolve().then(callback).finally(function () {
            state.operacionEnCurso.delete(clave);
        });
        return true;
    }

    /* ============================================================
       CONFIRMACIÓN CON FOCUS TRAP
       ============================================================ */
    function showConfirm(opciones) {
        opciones = opciones || {};
        return new Promise(function (resolve) {
            var overlay = document.getElementById('confirmModalOverlay');
            var iconEl = document.getElementById('confirmModalIcon');
            var titleEl = document.getElementById('confirmModalTitle');
            var msgEl = document.getElementById('confirmModalMessage');
            var cancelBtn = document.getElementById('confirmModalCancel');
            var confirmBtn = document.getElementById('confirmModalConfirm');

            if (!overlay || !cancelBtn || !confirmBtn) { resolve(false); return; }

            if (iconEl) iconEl.textContent = opciones.icon || '⚠️';
            if (titleEl) titleEl.textContent = opciones.title || 'Confirmar';
            if (msgEl) msgEl.textContent = opciones.message || '';

            cancelBtn.textContent = opciones.cancelText || 'Cancelar';
            confirmBtn.textContent = opciones.confirmText || 'Aceptar';

            var esDanger = opciones.danger !== false;
            confirmBtn.classList.toggle('confirm-danger', esDanger);
            confirmBtn.style.background = esDanger ? '' : 'linear-gradient(135deg, #0F2D1A, #087F5B)';
            confirmBtn.style.borderColor = esDanger ? '' : '#D4AF37';

            var prevFocus = document.activeElement;
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
            setTimeout(function () { cancelBtn.focus(); }, 50);

            function limpiar() {
                cancelBtn.removeEventListener('click', onCancel);
                confirmBtn.removeEventListener('click', onConfirm);
                overlay.removeEventListener('click', onBg);
                document.removeEventListener('keydown', onKey);
            }
            function finalizar(v) {
                limpiar();
                overlay.classList.remove('active');
                overlay.setAttribute('aria-hidden', 'true');
                if (prevFocus && prevFocus.focus) prevFocus.focus();
                resolve(v);
            }
            function onCancel() { finalizar(false); }
            function onConfirm() { finalizar(true); }
            function onBg(e) { if (e.target === overlay) finalizar(false); }
            function onKey(e) {
                if (e.key === 'Escape') finalizar(false);
                if (e.key === 'Tab') {
                    if (document.activeElement === cancelBtn && e.shiftKey) {
                        e.preventDefault(); confirmBtn.focus();
                    } else if (document.activeElement === confirmBtn && !e.shiftKey) {
                        e.preventDefault(); cancelBtn.focus();
                    }
                }
            }

            cancelBtn.addEventListener('click', onCancel);
            confirmBtn.addEventListener('click', onConfirm);
            overlay.addEventListener('click', onBg);
            document.addEventListener('keydown', onKey);
        });
    }

    /* ============================================================
       SESIÓN Y REINTENTOS
       ============================================================ */
    async function getSession() {
        var ahora = Date.now();
        if (state.session && ahora < state.sessionExpira) return state.session;

        var client = sb();
        if (!client || !client.auth) return null;

        try {
            var resultado = await Promise.race([
                client.auth.getSession(),
                new Promise(function (resolve) {
                    setTimeout(function () {
                        resolve({ data: null, error: new Error('Timeout') });
                    }, CONFIG.SESSION_TIMEOUT_MS);
                })
            ]);

            if (resultado.error) { console.error('[Contactos] Sesión:', resultado.error); return null; }

            state.session = resultado.data && resultado.data.session ? resultado.data.session : null;
            state.sessionExpira = ahora + 60000;
            return state.session;
        } catch (e) {
            console.error('[Contactos] Excepción sesión:', e);
            return null;
        }
    }

    function esErrorNoRetry(err) {
        if (!err) return false;
        var c = err.code;
        return c === '23505' || c === '42501' || c === 'PGRST116' || c === '23503' || c === '22P02';
    }

    async function withRetry(fn, contexto) {
        var ultimo = null;
        for (var intento = 0; intento < CONFIG.RETRY_MAX; intento++) {
            try {
                var r = await fn();
                if (r && r.error) {
                    if (esErrorNoRetry(r.error)) return r;
                    throw r.error;
                }
                return r;
            } catch (err) {
                ultimo = err;
                if (esErrorNoRetry(err) || intento === CONFIG.RETRY_MAX - 1) break;
                var delay = CONFIG.RETRY_BASE_MS * Math.pow(2, intento);
                console.warn('[Contactos] Retry ' + (contexto || '') + ' #' + (intento + 1), err);
                await new Promise(function (r) { setTimeout(r, delay); });
            }
        }
        throw ultimo;
    }

    /* ============================================================
       CACHÉ LRU DE PERFILES
       ============================================================ */
    function getPerfilCacheado(id) {
        var entry = state.perfilCache.get(id);
        if (!entry) return null;
        if (Date.now() > entry.expira) { state.perfilCache.delete(id); return null; }
        state.perfilCache.delete(id);
        state.perfilCache.set(id, entry);
        return entry.perfil;
    }

    function setPerfilCache(id, perfil) {
        if (!id || !perfil) return;
        if (!state.perfilCache.has(id) && state.perfilCache.size >= CONFIG.CACHE_MAX_SIZE) {
            state.perfilCache.delete(state.perfilCache.keys().next().value);
        }
        state.perfilCache.set(id, { perfil: perfil, expira: Date.now() + CONFIG.PROFILE_CACHE_TTL_MS });
    }

    async function cargarPerfilesEnLote(ids) {
        var client = sb();
        if (!client || !Array.isArray(ids)) return;

        var faltantes = Array.from(new Set(ids.filter(Boolean)))
            .filter(function (id) { return !getPerfilCacheado(id); });

        if (!faltantes.length) return;

        var CHUNK = 100;
        var chunks = [];
        for (var i = 0; i < faltantes.length; i += CHUNK) {
            chunks.push(faltantes.slice(i, i + CHUNK));
        }

        for (var g = 0; g < chunks.length; g += CONFIG.PARALLEL_CHUNKS) {
            var grupo = chunks.slice(g, g + CONFIG.PARALLEL_CHUNKS);
            await Promise.all(grupo.map(async function (chunk) {
                try {
                    var r = await withRetry(function () {
                        return client.from(CONFIG.PERFILES_VISTA).select(CONFIG.CAMPOS_PUBLICOS).in('id', chunk);
                    }, 'cargar perfiles');
                    if (r.error) { console.warn('[Contactos] Perfiles:', r.error); return; }
                    (r.data || []).forEach(function (p) { setPerfilCache(p.id, p); });
                } catch (e) { console.warn('[Contactos] Chunk perfiles:', e); }
            }));
        }
    }

    /* ============================================================
       INICIALIZACIÓN
       ============================================================ */
    async function inicializarContactos() {
        if (state.initialized || state.inicializando) return;
        state.inicializando = true;
        configurarEventos();

        try {
            var session = await getSession();
            if (!session) {
                mostrarEstadoVacio('◈', 'Inicia sesión para ver tus contactos.');
                actualizarEstadisticas(0, 0);
                emitirListo();
                return;
            }
            state.initialized = true;
            await cargarContactos({ reset: true });
            await Promise.allSettled([
                cargarSolicitudesPendientesUI(),
                cargarSugerenciasUI()
            ]);
        } finally {
            state.inicializando = false;
        }
    }

    function configurarEventos() {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(function (e) {
                state.textoBusqueda = normalizarTextoBusqueda(e.target.value).toLowerCase();
                renderizarContactos();
            }, CONFIG.DEBOUNCE_FILTRO_MS));
        }

        document.querySelectorAll('.filtros .filtro').forEach(function (boton) {
            boton.addEventListener('click', function () {
                document.querySelectorAll('.filtros .filtro').forEach(function (i) { i.classList.remove('active'); });
                boton.classList.add('active');
                state.filtroActual = boton.dataset.filtro || 'todos';
                renderizarContactos();
            });
        });

        var modalInput = document.getElementById('searchInputModal');
        if (modalInput) {
            modalInput.addEventListener('input', function () {
                clearTimeout(state.busquedaTimer);
                var texto = normalizarTextoBusqueda(modalInput.value);
                var version = ++state.busquedaVersion;
                if (texto.length < CONFIG.MIN_CHARS_BUSQUEDA) {
                    mostrarMensajeBusqueda('Escribe al menos 2 caracteres para buscar');
                    return;
                }
                state.busquedaTimer = setTimeout(function () {
                    buscarUsuarios(texto, version);
                }, CONFIG.DEBOUNCE_BUSQUEDA_MS);
            });
        }

        var resultados = document.getElementById('resultadosBusqueda');
        if (resultados) resultados.addEventListener('click', manejarClickResultadosBusqueda);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { cerrarModalBuscar(); cerrarModalInvitacion(); }
        });

        document.addEventListener('click', function (e) {
            var buscar = document.getElementById('modalBuscarContacto');
            var invitacion = document.getElementById('modalInvitacion');
            if (buscar && e.target === buscar) cerrarModalBuscar();
            if (invitacion && e.target === invitacion) cerrarModalInvitacion();
        });

        window.addEventListener('beforeunload', cleanup);

        var client = sb();
        if (client && client.auth && client.auth.onAuthStateChange) {
            client.auth.onAuthStateChange(function (evento, session) {
                state.session = session || null;
                state.sessionExpira = Date.now() + 60000;
                if (evento === 'SIGNED_OUT') {
                    state.contactos = [];
                    state.totalContactos = 0;
                    state.idsContactosSet.clear();
                    actualizarEstadisticas(0, 0);
                    mostrarEstadoVacio('◈', 'Inicia sesión para ver tus contactos.');
                } else if (evento === 'SIGNED_IN' && !state.initialized) {
                    inicializarContactos();
                }
            });
        }
    }

    function cleanup() {
        if (state.observerScroll) { state.observerScroll.disconnect(); state.observerScroll = null; }
        clearTimeout(state.busquedaTimer);
        clearTimeout(state.filtroTimer);
    }

    function manejarClickResultadosBusqueda(event) {
        var boton = event.target.closest('button[data-action="agregar"]');
        if (!boton) return;
        agregarContacto(boton.dataset.usuarioId || '');
    }

    /* ============================================================
       CARGA DE CONTACTOS
       ============================================================ */
    async function cargarContactos(opciones) {
        opciones = opciones || {};
        var reset = opciones.reset === true;
        if (state.cargando) return;

        var client = sb();
        var session = await getSession();
        if (!client || !session) {
            mostrarEstadoVacio('◈', 'Inicia sesión para ver tus contactos.');
            actualizarEstadisticas(0, 0);
            emitirListo();
            return;
        }

        state.cargando = true;
        if (reset) {
            state.paginaActual = 0;
            state.contactos = [];
            state.idsContactosSet.clear();
            state.hayMas = true;
            state.totalContactos = 0;
            mostrarCargando();
        } else {
            mostrarCargandoMas();
        }

        try {
            var desde = state.paginaActual * CONFIG.PAGE_SIZE;
            var hasta = desde + CONFIG.PAGE_SIZE - 1;

            if (reset) {
                var conteo = await withRetry(function () {
                    return client.from(CONFIG.CONTACTOS_TABLE)
                        .select('id', { count: 'exact', head: true })
                        .eq('usuario_id', session.user.id)
                        .eq('estado', 'activo');
                }, 'contar contactos');
                if (conteo.error) throw conteo.error;
                state.totalContactos = conteo.count || 0;
            }

            var resultado = await withRetry(function () {
                return client.from(CONFIG.CONTACTOS_TABLE)
                    .select('id, usuario_id, contacto_id, es_favorito, estado, fecha, created_at')
                    .eq('usuario_id', session.user.id)
                    .order('fecha', { ascending: false, nullsFirst: false })
                    .range(desde, hasta);
            }, 'cargar contactos');

            if (resultado.error) throw resultado.error;
            var pagina = resultado.data || [];

            if (!pagina.length) {
                state.hayMas = false;
                quitarCargandoMas();
                if (reset) {
                    actualizarEstadisticas(0, 0);
                    mostrarEstadoVacio('◈', 'Aún no tienes contactos agregados.');
                    emitirListo();
                }
                return;
            }

            var idsPagina = pagina.map(function (c) { return c.contacto_id; }).filter(Boolean);
            await cargarPerfilesEnLote(idsPagina);

            var enriquecidos = pagina.map(function (c) {
                var perfil = getPerfilCacheado(c.contacto_id) || {
                    id: c.contacto_id, nombre: 'Usuario', handle: null, avatar_url: null,
                    online: false, ultima_conexion: null, verificado: false
                };
                state.idsContactosSet.add(c.contacto_id);
                return Object.assign({}, c, { contacto: perfil });
            });

            if (reset) {
                state.contactos = enriquecidos;
            } else {
                var existentes = new Set(state.contactos.map(function (i) { return String(i.id); }));
                enriquecidos.forEach(function (item) {
                    if (!existentes.has(String(item.id))) state.contactos.push(item);
                });
            }

            state.paginaActual++;
            state.hayMas = pagina.length === CONFIG.PAGE_SIZE;

            recalcularEstadisticas();
            renderizarContactos();
            quitarCargandoMas();
            if (reset) emitirListo();
        } catch (e) {
            console.error('[Contactos] Error cargando:', e);
            quitarCargandoMas();
            if (reset) {
                state.contactos = [];
                actualizarEstadisticas(0, 0);
                mostrarEstadoVacio('⚠️', 'No se pudieron cargar los contactos.');
                showToast('No se pudieron cargar los contactos.', 'error');
                emitirListo();
            } else {
                showToast('No se pudieron cargar más contactos.', 'error');
            }
        } finally {
            state.cargando = false;
        }
    }

    window.cargarContactos = function () { return cargarContactos({ reset: true }); };

    function normalizarContacto(item) {
        var u = (item && item.contacto) ? item.contacto : {};
        var nombre = u.nombre || u.handle || 'Usuario';
        return {
            id: item && item.id != null ? item.id : null,
            contacto_id: item ? item.contacto_id : null,
            nombre: String(nombre),
            handle: String(u.handle || ''),
            avatar_url: obtenerAvatarSeguro(u.avatar_url),
            online: u.online === true,
            verificado: u.verificado === true,
            es_favorito: item && item.es_favorito === true,
            estado: (item && item.estado) || 'activo',
            fecha: item ? (item.fecha || item.created_at || null) : null,
            ultima_conexion: u.ultima_conexion || null
        };
    }

    /* ============================================================
       SOLICITUDES PENDIENTES
       ============================================================ */
    async function cargarSolicitudesPendientesUI() {
        var client = sb();
        var session = await getSession();
        if (!client || !session) return;

        var contenedor = document.getElementById('solicitudesPendientesLista');
        var seccion = document.getElementById('solicitudesPendientesSection');
        var contador = document.getElementById('solicitudesContador');
        if (!contenedor || !seccion || !contador) return;

        try {
            var r = await client.from(CONFIG.CONTACTOS_TABLE)
                .select('id, usuario_id, contacto_id, estado')
                .eq('contacto_id', session.user.id)
                .eq('estado', 'pendiente');

            if (r.error) throw r.error;
            var solicitudes = r.data || [];
            if (!solicitudes.length) { seccion.style.display = 'none'; return; }

            var ids = solicitudes.map(function (s) { return s.usuario_id; });
            await cargarPerfilesEnLote(ids);

            seccion.style.display = 'block';
            contador.textContent = String(solicitudes.length);

            contenedor.innerHTML = solicitudes.map(function (s) {
                var p = getPerfilCacheado(s.usuario_id) || {};
                var nombre = p.nombre || p.handle || 'Usuario';
                var handle = p.handle ? '@' + String(p.handle).replace(/^@/, '') : '';
                var url = obtenerAvatarSeguro(p.avatar_url);
                var avatar = url
                    ? '<img src="' + escapeHtml(url) + '" alt="" loading="lazy" onerror="this.remove()">'
                    : escapeHtml(obtenerInicial(nombre));

                return '<div class="solicitud-card">' +
                        '<div class="avatar">' + avatar + '</div>' +
                        '<div class="info">' +
                            '<div class="nombre">' + escapeHtml(nombre) + '</div>' +
                            '<div class="handle">' + escapeHtml(handle) + '</div>' +
                        '</div>' +
                        '<div class="acciones">' +
                            '<button type="button" class="btn-aceptar" data-solicitud-aceptar="' + escapeHtml(s.id) + '" data-usuario-id="' + escapeHtml(s.usuario_id) + '">' +
                                SVG_ICONS.agregarAmigo + ' Aceptar' +
                            '</button>' +
                            '<button type="button" class="btn-rechazar" data-solicitud-rechazar="' + escapeHtml(s.id) + '">' +
                                SVG_ICONS.cancelar + ' Rechazar' +
                            '</button>' +
                        '</div>' +
                    '</div>';
            }).join('');

            contenedor.querySelectorAll('[data-solicitud-aceptar]').forEach(function (b) {
                b.addEventListener('click', function () {
                    aceptarSolicitud(b.getAttribute('data-solicitud-aceptar'), b.getAttribute('data-usuario-id'));
                });
            });
            contenedor.querySelectorAll('[data-solicitud-rechazar]').forEach(function (b) {
                b.addEventListener('click', function () {
                    rechazarSolicitud(b.getAttribute('data-solicitud-rechazar'));
                });
            });
        } catch (e) {
            console.error('[Contactos] Solicitudes:', e);
            seccion.style.display = 'none';
        }
    }
    window.cargarSolicitudesPendientesUI = cargarSolicitudesPendientesUI;

    /* ============================================================
       SUGERENCIAS
       ============================================================ */
    async function cargarSugerenciasUI() {
        var client = sb();
        var session = await getSession();
        if (!client || !session) return;

        var seccion = document.getElementById('sugerenciasSection');
        var contenedor = document.getElementById('sugerenciasLista');
        if (!seccion || !contenedor) return;

        try {
            var existentes = await client.from(CONFIG.CONTACTOS_TABLE)
                .select('contacto_id, usuario_id')
                .or('usuario_id.eq.' + session.user.id + ',contacto_id.eq.' + session.user.id);
            if (existentes.error) throw existentes.error;

            var idsExcluir = new Set([session.user.id]);
            (existentes.data || []).forEach(function (i) {
                if (i.usuario_id) idsExcluir.add(i.usuario_id);
                if (i.contacto_id) idsExcluir.add(i.contacto_id);
            });

            try {
                var bl = await client.from(CONFIG.BLOQUEOS_TABLE).select('bloqueado_id').eq('usuario_id', session.user.id);
                (bl.data || []).forEach(function (b) { if (b.bloqueado_id) idsExcluir.add(b.bloqueado_id); });
            } catch (e) { console.warn('[Contactos] Bloqueos sugerencias:', e); }

            var listaIds = Array.from(idsExcluir);
            if (!listaIds.length) { seccion.style.display = 'none'; return; }

            var pr = await client.from(CONFIG.PERFILES_VISTA)
                .select(CONFIG.CAMPOS_PUBLICOS)
                .not('id', 'in', '(' + listaIds.join(',') + ')')
                .order('online', { ascending: false })
                .limit(CONFIG.MAX_SUGERENCIAS);

            if (pr.error) throw pr.error;
            var perfiles = pr.data || [];
            if (!perfiles.length) { seccion.style.display = 'none'; return; }

            perfiles.forEach(function (p) { setPerfilCache(p.id, p); });
            seccion.style.display = 'block';

            contenedor.innerHTML = perfiles.map(function (u) {
                var nombre = u.nombre || u.handle || 'Usuario';
                var handle = u.handle ? '@' + String(u.handle).replace(/^@/, '') : '';
                var url = obtenerAvatarSeguro(u.avatar_url);
                var avatar = url
                    ? '<img src="' + escapeHtml(url) + '" alt="" loading="lazy" onerror="this.remove()">'
                    : escapeHtml(obtenerInicial(nombre));
                var estado = u.online === true
                    ? '<span class="estado online">● En línea</span>'
                    : '<span class="estado">Desconectado</span>';

                return '<div class="sugerencia-card">' +
                        '<div class="avatar ' + (u.online ? 'online' : '') + '">' + avatar + '</div>' +
                        '<div class="info">' +
                            '<div class="nombre">' + escapeHtml(nombre) +
                                (u.verificado ? '<span class="verified">✓</span>' : '') +
                            '</div>' +
                            '<div class="handle">' + escapeHtml(handle) + '</div>' +
                            estado +
                        '</div>' +
                        '<div class="acciones">' +
                            '<button type="button" class="btn-agregar-sugerencia" data-sugerencia-agregar="' + escapeHtml(u.id) + '">' +
                                SVG_ICONS.agregarAmigo + ' Agregar' +
                            '</button>' +
                        '</div>' +
                    '</div>';
            }).join('');

            contenedor.querySelectorAll('[data-sugerencia-agregar]').forEach(function (b) {
                b.addEventListener('click', function () {
                    agregarContacto(b.getAttribute('data-sugerencia-agregar'));
                });
            });
        } catch (e) {
            console.error('[Contactos] Sugerencias:', e);
            seccion.style.display = 'none';
        }
    }
    window.cargarSugerenciasUI = cargarSugerenciasUI;

    ///* ============================================================
   PARTE 2/4 — RENDERIZADO PRO MAX
   ============================================================ */

/* ============================================================
   ESTILOS INYECTADOS UNA SOLA VEZ (evita inline masivo)
   ============================================================ */
function inyectarEstilos() {
    if (document.getElementById('csariel-contactos-styles')) return;
    var style = document.createElement('style');
    style.id = 'csariel-contactos-styles';
    style.textContent = [
        '.cs-contacto-card{position:relative;display:flex;align-items:center;gap:13px;',
        'padding:14px 15px;margin:7px 0;border-radius:17px;',
        'border:1px solid rgba(212,175,55,.15);',
        'background:linear-gradient(120deg,rgba(15,45,26,.96),rgba(12,22,18,.98));',
        'box-shadow:0 4px 16px rgba(0,0,0,.12);',
        'transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;',
        'cursor:pointer;min-width:0;outline:none;}',
        '.cs-contacto-card:hover{transform:translateY(-1px);border-color:rgba(212,175,55,.4);',
        'box-shadow:0 8px 24px rgba(212,175,55,.08);}',
        '.cs-contacto-card:focus-visible{border-color:#D4AF37;box-shadow:0 0 0 3px rgba(212,175,55,.25);}',
        '.cs-contacto-card.pendiente{opacity:.85;}',
        '.cs-avatar{position:relative;flex:0 0 55px;width:55px;height:55px;',
        'border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;',
        'background:linear-gradient(135deg,#0F2D1A,#137B50,#D4AF37);',
        'border:2px solid rgba(212,175,55,.55);color:#fff;font-size:20px;font-weight:800;}',
        '.cs-avatar.online{border-color:#36D66A;}',
        '.cs-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%;}',
        '.cs-avatar .cs-online-dot{position:absolute;right:0;bottom:1px;width:13px;height:13px;',
        'border-radius:50%;background:#36D66A;border:2px solid #0F2D1A;}',
        '.cs-avatar .cs-fav-badge{position:absolute;top:-2px;left:-2px;color:#D4AF37;font-size:13px;}',
        '.cs-info{flex:1;min-width:0;overflow:hidden;}',
        '.cs-nombre{display:flex;align-items:center;gap:5px;flex-wrap:wrap;',
        'color:#fff;font-size:15px;font-weight:700;line-height:1.3;overflow-wrap:anywhere;}',
        '.cs-nombre .cs-verified{color:#D4AF37;font-size:12px;}',
        '.cs-estado{display:flex;align-items:center;gap:5px;margin-top:5px;',
        'font-size:12px;color:#A0ADA4;}',
        '.cs-estado.online{color:#56E68A;}',
        '.cs-estado .cs-dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#849088;}',
        '.cs-estado.online .cs-dot{background:#36D66A;}',
        '.cs-handle{display:block;margin-top:4px;font-size:11px;color:#A8B7AD;',
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.cs-actions{display:flex;align-items:center;justify-content:flex-end;',
        'gap:6px;flex-wrap:wrap;max-width:100%;}',
        '.cs-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;',
        'padding:9px 11px;border-radius:12px;font-size:12px;font-weight:700;',
        'cursor:pointer;transition:transform .15s ease,background .15s ease;border:1px solid;}',
        '.cs-btn:active{transform:scale(.96);}',
        '.cs-btn-mensaje{background:rgba(32,126,230,.14);border-color:rgba(72,160,255,.38);color:#75B8FF;}',
        '.cs-btn-mensaje:hover{background:rgba(32,126,230,.24);}',
        '.cs-btn-icon{background:rgba(255,255,255,.04);border-color:rgba(212,175,55,.2);',
        'color:#D4AF37;padding:9px;}',
        '.cs-btn-icon:hover{background:rgba(212,175,55,.12);}',
        '.cs-btn-icon.activo{background:rgba(212,175,55,.2);}',
        '.cs-btn-bloquear{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.08);',
        'color:#AAB6AE;padding:8px;}',
        '.cs-btn-bloquear:hover{background:rgba(255,80,80,.08);color:#E88C8C;}',
        '.cs-btn-eliminar{background:rgba(255,80,80,.04);border-color:rgba(255,100,100,.15);',
        'color:#E88C8C;padding:8px;}',
        '.cs-btn-eliminar:hover{background:rgba(255,80,80,.12);}',
        '.cs-btn-cancelar{background:rgba(255,80,80,.08);border-color:rgba(255,100,100,.25);',
        'color:#FF9292;padding:8px 10px;font-size:11px;}',
        '.cs-empty{padding:35px 18px;text-align:center;border-radius:20px;',
        'border:1px dashed rgba(212,175,55,.25);',
        'background:linear-gradient(145deg,rgba(15,45,26,.4),rgba(255,255,255,.015));}',
        '.cs-empty .cs-icon{font-size:36px;color:#D4AF37;margin-bottom:12px;}',
        '.cs-empty h3{font-size:14px;line-height:1.6;color:var(--text-primary,#fff);margin:0 0 16px;}',
        '.cs-empty .cs-btn-agregar{padding:11px 18px;border-radius:12px;',
        'background:#0F2D1A;border:1px solid #D4AF37;color:#fff;font-weight:700;',
        'cursor:pointer;display:inline-flex;align-items:center;gap:6px;}',
        '.cs-skeleton{display:flex;align-items:center;gap:13px;padding:14px;margin:7px 0;',
        'border-radius:17px;background:rgba(255,255,255,.025);border:1px solid rgba(212,175,55,.1);}',
        '.cs-skeleton .cs-av{width:55px;height:55px;flex:0 0 55px;border-radius:50%;',
        'background:linear-gradient(90deg,#16241B,#26362B,#16241B);',
        'background-size:200% 100%;animation:cs-shimmer 1.4s infinite;}',
        '.cs-skeleton .cs-line{height:12px;width:55%;border-radius:8px;',
        'background:rgba(255,255,255,.08);margin-bottom:10px;}',
        '.cs-skeleton .cs-line.small{height:9px;width:35%;',
        'background:rgba(255,255,255,.05);margin-bottom:0;}',
        '@keyframes cs-shimmer{0%{background-position:200% 0;}100%{background-position:-200% 0;}}',
        '.cs-cargando-mas{text-align:center;padding:16px;color:var(--text-muted,#A0ADA4);font-size:.8rem;}',
        '.cs-resultado-item{display:flex;align-items:center;gap:12px;padding:13px;',
        'border-bottom:1px solid rgba(212,175,55,.12);}',
        '.cs-resultado-item .cs-res-avatar{width:48px;height:48px;flex:0 0 48px;',
        'border-radius:50%;object-fit:cover;}',
        '.cs-resultado-item .cs-res-avatar-fb{width:48px;height:48px;flex:0 0 48px;',
        'border-radius:50%;display:flex;align-items:center;justify-content:center;',
        'background:linear-gradient(135deg,#0F2D1A,#147A4B,#D4AF37);',
        'color:#fff;font-weight:800;font-size:18px;}',
        '.cs-resultado-item .cs-res-info{flex:1;min-width:0;}',
        '.cs-resultado-item .cs-res-nombre{font-weight:700;color:var(--text-primary,#fff);',
        'font-size:14px;overflow-wrap:anywhere;}',
        '.cs-resultado-item .cs-res-handle{color:var(--text-muted,#9BA89F);font-size:12px;margin-top:4px;}',
        '.cs-resultado-item .cs-res-estado{font-size:11px;margin-top:4px;}',
        '.cs-btn-agregar-resultado{display:inline-flex;align-items:center;gap:5px;',
        'padding:9px 12px;border-radius:11px;border:1px solid #D4AF37;',
        'background:#0F2D1A;color:#fff;font-weight:700;font-size:12px;cursor:pointer;}',
        '.cs-msg-busqueda{padding:24px;text-align:center;color:var(--text-muted,#A0ADA4);',
        'font-size:13px;line-height:1.6;}'
    ].join('');
    document.head.appendChild(style);
}

/* ============================================================
   RENDERIZADO PRINCIPAL
   ============================================================ */
function renderizarContactos() {
    var lista = document.getElementById('contactosList');
    if (!lista) return;

    inyectarEstilos();

    var contactosFiltrados = state.contactos.map(normalizarContacto);

    if (state.filtroActual === 'online') {
        contactosFiltrados = contactosFiltrados.filter(function (c) { return c.online; });
    }
    if (state.filtroActual === 'favoritos') {
        contactosFiltrados = contactosFiltrados.filter(function (c) { return c.es_favorito; });
    }
    if (state.filtroActual === 'recientes') {
        contactosFiltrados = contactosFiltrados
            .filter(function (c) { return Boolean(c.fecha); })
            .sort(function (a, b) { return new Date(b.fecha).getTime() - new Date(a.fecha).getTime(); })
            .slice(0, 10);
    }
    if (state.textoBusqueda) {
        var q = state.textoBusqueda;
        contactosFiltrados = contactosFiltrados.filter(function (c) {
            return c.nombre.toLowerCase().indexOf(q) !== -1 ||
                   c.handle.toLowerCase().indexOf(q) !== -1;
        });
    }

    if (!contactosFiltrados.length) {
        var msg = state.textoBusqueda
            ? 'No se encontraron contactos.'
            : state.filtroActual === 'online'
                ? 'No hay contactos conectados en este momento.'
                : state.filtroActual === 'favoritos'
                    ? 'Todavía no tienes favoritos.'
                    : 'Aún no tienes contactos agregados.';
        mostrarEstadoVacio('◈', msg);
        return;
    }

    lista.setAttribute('aria-busy', 'false');

    var html = contactosFiltrados.map(renderizarTarjeta).join('');
    if (state.hayMas && !state.textoBusqueda) {
        html += '<div id="cargandoMasSentinel" style="height:1px;"></div>';
    }
    lista.innerHTML = html;

    configurarScrollInfinito();
}

function renderizarTarjeta(c) {
    var inicial = escapeHtml(obtenerInicial(c.nombre));
    var url = obtenerAvatarSeguro(c.avatar_url);

    var avatar = url
        ? '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(c.nombre) +
          '" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">'
        : '<span>' + inicial + '</span>';

    var pendiente = c.estado === 'pendiente';
    var enLinea = c.online === true;
    var handle = c.handle ? '@' + String(c.handle).replace(/^@/, '') : '';

    var estadoTexto = pendiente
        ? 'Solicitud enviada'
        : enLinea ? 'En línea ahora' : 'Desconectado';

    var filaId = escapeHtml(c.id);
    var contactoId = escapeHtml(c.contacto_id);

    var favClase = c.es_favorito ? 'active' : '';
    var favIcono = c.es_favorito ? SVG_ICONS.favorito : SVG_ICONS.favoritoOutline;
    var verificado = c.verificado
        ? '<span class="cs-verified" title="Verificado">✓</span>'
        : '';

    var botonMensaje = pendiente ? '' :
        '<button type="button" class="cs-btn cs-btn-mensaje" data-accion="mensaje" ' +
        'title="Enviar mensaje" aria-label="Enviar mensaje">' +
        SVG_ICONS.mensaje + '<span>Mensaje</span></button>';

    var botonLlamar = pendiente ? '' :
        '<button type="button" class="cs-btn cs-btn-icon" data-accion="llamar" ' +
        'title="Llamar" aria-label="Llamar">' + SVG_ICONS.llamar + '</button>';

    var botonFavorito = pendiente ? '' :
        '<button type="button" class="cs-btn cs-btn-icon ' + favClase + '" data-accion="favorito" ' +
        'title="' + (c.es_favorito ? 'Quitar de favoritos' : 'Agregar a favoritos') + '">' +
        favIcono + '</button>';

    var botonesExtra = pendiente
        ? '<button type="button" class="cs-btn cs-btn-cancelar" data-accion="cancelar" ' +
          'title="Cancelar solicitud">' + SVG_ICONS.cancelar + '</button>'
        : '<button type="button" class="cs-btn cs-btn-bloquear" data-accion="bloquear" ' +
          'title="Bloquear usuario">' + SVG_ICONS.bloquear + '</button>' +
          '<button type="button" class="cs-btn cs-btn-eliminar" data-accion="eliminar" ' +
          'title="Eliminar contacto">' + SVG_ICONS.eliminar + '</button>';

    return '<article class="cs-contacto-card' + (pendiente ? ' pendiente' : '') + '" ' +
        'data-contacto-id="' + contactoId + '" data-fila-id="' + filaId + '" ' +
        'tabindex="0" role="button" ' +
        'aria-label="Abrir conversación con ' + escapeHtml(c.nombre) + '">' +

        '<div class="cs-avatar' + (enLinea ? ' online' : '') + '">' +
            avatar +
            (enLinea ? '<span class="cs-online-dot"></span>' : '') +
            (c.es_favorito ? '<span class="cs-fav-badge">★</span>' : '') +
        '</div>' +

        '<div class="cs-info">' +
            '<div class="cs-nombre">' + escapeHtml(c.nombre) + verificado + '</div>' +
            '<div class="cs-estado' + (enLinea ? ' online' : '') + '">' +
                '<span class="cs-dot"></span>' + escapeHtml(estadoTexto) +
            '</div>' +
            (handle ? '<div class="cs-handle">' + escapeHtml(handle) + '</div>' : '') +
        '</div>' +

        '<div class="cs-actions">' +
            botonMensaje + botonLlamar + botonFavorito + botonesExtra +
        '</div>' +
    '</article>';
}

/* ============================================================
   DELEGACIÓN DE EVENTOS (una sola vez)
   ============================================================ */
function configurarEventosTarjetas() {
    var lista = document.getElementById('contactosList');
    if (!lista || lista.dataset.eventosCsariel === '1') return;
    lista.dataset.eventosCsariel = '1';

    lista.addEventListener('click', function (event) {
        var boton = event.target.closest('[data-accion]');
        var tarjeta = event.target.closest('.cs-contacto-card');
        if (!tarjeta) return;

        var contactoId = tarjeta.getAttribute('data-contacto-id');
        var filaId = tarjeta.getAttribute('data-fila-id');

        if (boton) {
            event.preventDefault();
            event.stopPropagation();
            var accion = boton.getAttribute('data-accion');

            if (accion === 'mensaje') abrirMensaje(contactoId);
            if (accion === 'llamar') llamarContacto(contactoId);
            if (accion === 'favorito') {
                var item = state.contactos.find(function (x) {
                    return String(x.id) === String(filaId);
                });
                if (item) toggleFavorito(filaId, item.es_favorito !== true);
            }
            if (accion === 'bloquear') bloquearContacto(contactoId);
            if (accion === 'eliminar') eliminarContacto(contactoId);
            if (accion === 'cancelar') cancelarSolicitudEnviada(filaId);
            return;
        }
        abrirMensaje(contactoId);
    });

    lista.addEventListener('keydown', function (event) {
        if ((event.key === 'Enter' || event.key === ' ') &&
            event.target.classList.contains('cs-contacto-card')) {
            event.preventDefault();
            abrirMensaje(event.target.getAttribute('data-contacto-id'));
        }
    });
}

/* ============================================================
   SCROLL INFINITO
   ============================================================ */
function configurarScrollInfinito() {
    if (state.observerScroll) {
        state.observerScroll.disconnect();
        state.observerScroll = null;
    }
    var sentinel = document.getElementById('cargandoMasSentinel');
    if (!sentinel || !('IntersectionObserver' in window)) return;

    state.observerScroll = new IntersectionObserver(function (entries) {
        if (entries[0] && entries[0].isIntersecting &&
            state.hayMas && !state.cargando && !state.textoBusqueda) {
            cargarContactos({ reset: false });
        }
    }, { rootMargin: '300px', threshold: 0 });

    state.observerScroll.observe(sentinel);
}

/* ============================================================
   ESTADOS: CARGANDO / VACÍO
   ============================================================ */
function mostrarCargando() {
    var lista = document.getElementById('contactosList');
    if (!lista) return;
    inyectarEstilos();
    lista.setAttribute('aria-busy', 'true');

    var html = '';
    for (var i = 0; i < 4; i++) {
        html += '<div class="cs-skeleton">' +
                    '<div class="cs-av"></div>' +
                    '<div class="cs-info">' +
                        '<div class="cs-line"></div>' +
                        '<div class="cs-line small"></div>' +
                    '</div>' +
                '</div>';
    }
    lista.innerHTML = html;
}

function mostrarCargandoMas() {
    var lista = document.getElementById('contactosList');
    if (!lista || document.getElementById('cargandoMasIndicador')) return;
    inyectarEstilos();
    var div = document.createElement('div');
    div.id = 'cargandoMasIndicador';
    div.className = 'cs-cargando-mas';
    div.textContent = 'Cargando más contactos…';
    lista.appendChild(div);
}

function quitarCargandoMas() {
    var el = document.getElementById('cargandoMasIndicador');
    if (el) el.remove();
    var lista = document.getElementById('contactosList');
    if (lista) lista.setAttribute('aria-busy', 'false');
}

function mostrarEstadoVacio(icono, mensaje) {
    var lista = document.getElementById('contactosList');
    if (!lista) return;
    inyectarEstilos();
    lista.setAttribute('aria-busy', 'false');

    lista.innerHTML = '<div class="cs-empty">' +
        '<div class="cs-icon">' + escapeHtml(icono) + '</div>' +
        '<h3>' + escapeHtml(mensaje) + '</h3>' +
        (state.contactos.length === 0
            ? '<button type="button" class="cs-btn-agregar" data-contactos-action="agregar">' +
              SVG_ICONS.agregarAmigo + ' Agregar contacto</button>'
            : '') +
        '</div>';

    var boton = lista.querySelector('[data-contactos-action="agregar"]');
    if (boton) boton.addEventListener('click', abrirAgregarContacto, { once: true });
}

function recalcularEstadisticas() {
    var activos = state.contactos.filter(function (c) {
        return (c.estado || 'activo') === 'activo';
    }).length;
    var total = Math.max(state.totalContactos, activos);
    var online = state.contactos.filter(function (c) {
        return c.contacto && c.contacto.online === true &&
               (c.estado || 'activo') === 'activo';
    }).length;
    actualizarEstadisticas(total, online);
}

function actualizarEstadisticas(total, online) {
    var t = document.getElementById('totalContactos');
    var o = document.getElementById('onlineContactos');
    if (t) t.textContent = String(total || 0);
    if (o) o.textContent = String(online || 0);
}

/* ============================================================
   MODAL: BUSCAR / AGREGAR CONTACTOS
   ============================================================ */
function abrirAgregarContacto() {
    var modal = document.getElementById('modalBuscarContacto');
    if (!modal) return;

    modal.classList.add('show', 'active');
    modal.setAttribute('aria-hidden', 'false');

    var input = document.getElementById('searchInputModal');
    var resultados = document.getElementById('resultadosBusqueda');

    if (input) {
        input.value = '';
        clearTimeout(state.busquedaTimer);
        setTimeout(function () { input.focus(); }, 100);
    }
    if (resultados) {
        inyectarEstilos();
        resultados.innerHTML = '<div class="cs-msg-busqueda">Busca por nombre o usuario.</div>';
    }
}
window.abrirAgregarContacto = abrirAgregarContacto;

function cerrarModalBuscar() {
    var modal = document.getElementById('modalBuscarContacto');
    if (!modal) return;
    modal.classList.remove('show', 'active');
    modal.setAttribute('aria-hidden', 'true');
    clearTimeout(state.busquedaTimer);
}
window.cerrarModalBuscar = cerrarModalBuscar;

function cerrarModalInvitacion() {
    var modal = document.getElementById('modalInvitacion');
    if (!modal) return;
    modal.classList.remove('show', 'active');
    modal.setAttribute('aria-hidden', 'true');
}
window.cerrarModalInvitacion = cerrarModalInvitacion;

/* ============================================================
   BÚSQUEDA DE USUARIOS
   ============================================================ */
async function buscarUsuarios(texto, version) {
    var client = sb();
    var session = await getSession();
    if (!client || !session) {
        mostrarMensajeBusqueda('Inicia sesión para buscar contactos.');
        return;
    }

    var termino = normalizarTextoBusqueda(texto).replace(/^@+/, '').trim();
    if (termino.length < CONFIG.MIN_CHARS_BUSQUEDA) {
        mostrarMensajeBusqueda('Escribe al menos 2 caracteres.');
        return;
    }

    try {
        var patron = '%' + termino + '%';

        var resultados = await Promise.all([
            withRetry(function () {
                return client.from(CONFIG.PERFILES_VISTA)
                    .select(CONFIG.CAMPOS_PUBLICOS)
                    .neq('id', session.user.id)
                    .ilike('nombre', patron)
                    .limit(CONFIG.MAX_RESULTADOS_BUSQUEDA);
            }, 'buscar nombre'),
            withRetry(function () {
                return client.from(CONFIG.PERFILES_VISTA)
                    .select(CONFIG.CAMPOS_PUBLICOS)
                    .neq('id', session.user.id)
                    .ilike('handle', patron)
                    .limit(CONFIG.MAX_RESULTADOS_BUSQUEDA);
            }, 'buscar handle')
        ]);

        if (version !== state.busquedaVersion) return;

        var error = resultados.find(function (r) { return r && r.error; });
        if (error) throw error.error;

        var mapa = new Map();
        resultados.forEach(function (r) {
            (r.data || []).forEach(function (u) {
                if (u && u.id && !mapa.has(u.id)) {
                    mapa.set(u.id, u);
                    setPerfilCache(u.id, u);
                }
            });
        });

        var usuarios = Array.from(mapa.values()).slice(0, CONFIG.MAX_RESULTADOS_BUSQUEDA);
        if (!usuarios.length) {
            mostrarMensajeBusqueda('No se encontraron usuarios.');
            return;
        }

        var idsBloqueados = new Set();
        try {
            var bl = await client.from(CONFIG.BLOQUEOS_TABLE)
                .select('bloqueado_id').eq('usuario_id', session.user.id);
            (bl.data || []).forEach(function (b) {
                if (b.bloqueado_id) idsBloqueados.add(b.bloqueado_id);
            });
        } catch (e) {}

        if (version !== state.busquedaVersion) return;

        var disponibles = usuarios.filter(function (u) {
            return !state.idsContactosSet.has(u.id) && !idsBloqueados.has(u.id);
        });

        if (!disponibles.length) {
            mostrarMensajeBusqueda('Los usuarios ya están en tus contactos o bloqueados.');
            return;
        }
        renderizarResultadosBusqueda(disponibles);
    } catch (e) {
        console.error('[Contactos] Búsqueda:', e);
        mostrarMensajeBusqueda('No fue posible realizar la búsqueda.');
    }
}

function renderizarResultadosBusqueda(usuarios) {
    var contenedor = document.getElementById('resultadosBusqueda');
    if (!contenedor) return;
    inyectarEstilos();

    contenedor.innerHTML = usuarios.map(function (u) {
        var nombre = u.nombre || u.handle || 'Usuario';
        var handle = u.handle ? '@' + String(u.handle).replace(/^@/, '') : '';
        var url = obtenerAvatarSeguro(u.avatar_url);
        var avatar = url
            ? '<img src="' + escapeHtml(url) + '" alt="" loading="lazy" class="cs-res-avatar" onerror="this.remove()">'
            : '<div class="cs-res-avatar-fb">' + escapeHtml(obtenerInicial(nombre)) + '</div>';

        return '<div class="cs-resultado-item">' +
            avatar +
            '<div class="cs-res-info">' +
                '<div class="cs-res-nombre">' + escapeHtml(nombre) +
                    (u.verificado ? ' <span class="cs-verified">✓</span>' : '') +
                '</div>' +
                '<div class="cs-res-handle">' + escapeHtml(handle) + '</div>' +
                '<div class="cs-res-estado" style="color:' +
                    (u.online ? '#56E68A' : '#9BA89F') + ';">' +
                    (u.online ? '● En línea' : 'Desconectado') +
                '</div>' +
            '</div>' +
            '<button type="button" class="cs-btn-agregar-resultado" ' +
                'data-action="agregar" data-usuario-id="' + escapeHtml(u.id) + '">' +
                SVG_ICONS.agregarAmigo + ' Agregar</button>' +
        '</div>';
    }).join('');
}

function mostrarMensajeBusqueda(mensaje) {
    var contenedor = document.getElementById('resultadosBusqueda');
    if (!contenedor) return;
    inyectarEstilos();
    contenedor.innerHTML = '<div class="cs-msg-busqueda">' + escapeHtml(mensaje) + '</div>';
}

///* ============================================================
   PARTE 3/4 — ACCIONES
   ============================================================ */

/* ============================================================
   AGREGAR CONTACTO
   ============================================================ */
async function agregarContacto(contactoId) {
    var client = sb();
    var session = await getSession();

    if (!client || !session) {
        showToast('Inicia sesión para agregar contactos.', 'error');
        return;
    }
    if (!contactoId) return;

    if (contactoId === session.user.id) {
        showToast('No puedes agregarte a ti mismo.', 'warning');
        return;
    }
    if (state.idsContactosSet.has(contactoId)) {
        showToast('Este usuario ya está en tus contactos.', 'warning');
        return;
    }

    var clave = 'agregar:' + contactoId;
    if (state.operacionEnCurso.has(clave)) return;
    state.operacionEnCurso.add(clave);

    try {
        var resultado = await withRetry(function () {
            return client.from(CONFIG.CONTACTOS_TABLE).insert({
                usuario_id: session.user.id,
                contacto_id: contactoId,
                estado: 'pendiente',
                es_favorito: false
            });
        }, 'enviar solicitud');

        if (resultado.error) {
            if (resultado.error.code === '23505') {
                showToast('Ya enviaste una solicitud a este usuario.', 'warning');
                return;
            }
            throw resultado.error;
        }

        showToast('Solicitud de amistad enviada.', 'success');

        var input = document.getElementById('searchInputModal');
        if (input) input.value = '';
        var resultados = document.getElementById('resultadosBusqueda');
        if (resultados) resultados.innerHTML = '';

        cerrarModalBuscar();

        await cargarContactos({ reset: true });
        await Promise.allSettled([
            cargarSolicitudesPendientesUI(),
            cargarSugerenciasUI()
        ]);
    } catch (e) {
        console.error('[Contactos] Agregar:', e);
        showToast('No se pudo enviar la solicitud.', 'error');
    } finally {
        state.operacionEnCurso.delete(clave);
    }
}
window.agregarContacto = agregarContacto;

/* ============================================================
   ACEPTAR / RECHAZAR SOLICITUD
   ============================================================ */
async function responderSolicitud(contactoRowId, aceptar, otroUsuarioId) {
    var client = sb();
    var session = await getSession();
    if (!client || !session) {
        showToast('Inicia sesión para continuar.', 'error');
        return;
    }

    var fila = Number(contactoRowId);
    if (!Number.isFinite(fila) || fila <= 0) {
        showToast('El identificador de la solicitud no es válido.', 'error');
        return;
    }

    var clave = (aceptar ? 'aceptar:' : 'rechazar:') + contactoRowId;
    if (state.operacionEnCurso.has(clave)) return;
    state.operacionEnCurso.add(clave);

    try {
        var resultado = await client.rpc(CONFIG.RPC_RESPONDER_SOLICITUD, {
            p_fila_id: fila,
            p_aceptar: aceptar === true
        });

        if (resultado.error) throw resultado.error;

        if (aceptar && otroUsuarioId) {
            state.idsContactosSet.add(otroUsuarioId);
        }

        showToast(aceptar ? 'Amistad aceptada.' : 'Solicitud rechazada.', 'success');

        await cargarContactos({ reset: true });
        await Promise.allSettled([
            cargarSolicitudesPendientesUI(),
            cargarSugerenciasUI()
        ]);
    } catch (e) {
        console.error('[Contactos] Responder solicitud:', e);
        showToast(
            aceptar ? 'No se pudo aceptar la solicitud.' : 'No se pudo rechazar la solicitud.',
            'error'
        );
    } finally {
        state.operacionEnCurso.delete(clave);
    }
}

function aceptarSolicitud(contactoRowId, otroUsuarioId) {
    return responderSolicitud(contactoRowId, true, otroUsuarioId);
}
window.aceptarSolicitud = aceptarSolicitud;

function rechazarSolicitud(contactoRowId) {
    return responderSolicitud(contactoRowId, false, null);
}
window.rechazarSolicitud = rechazarSolicitud;

/* ============================================================
   CANCELAR SOLICITUD ENVIADA
   ============================================================ */
async function cancelarSolicitudEnviada(filaId) {
    var client = sb();
    var session = await getSession();
    if (!client || !session) {
        showToast('Inicia sesión para continuar.', 'error');
        return;
    }
    if (!filaId) return;

    var confirmado = await showConfirm({
        title: 'Cancelar solicitud',
        message: '¿Quieres cancelar esta solicitud de amistad?',
        icon: '↩️',
        confirmText: 'Cancelar solicitud',
        cancelText: 'Volver',
        danger: true
    });
    if (!confirmado) return;

    var clave = 'cancelar:' + filaId;
    if (state.operacionEnCurso.has(clave)) return;
    state.operacionEnCurso.add(clave);

    try {
        var resultado = await client.from(CONFIG.CONTACTOS_TABLE)
            .delete()
            .eq('id', filaId)
            .eq('usuario_id', session.user.id)
            .eq('estado', 'pendiente');

        if (resultado.error) throw resultado.error;

        showToast('Solicitud cancelada.', 'success');

        await cargarContactos({ reset: true });
        await Promise.allSettled([
            cargarSolicitudesPendientesUI(),
            cargarSugerenciasUI()
        ]);
    } catch (e) {
        console.error('[Contactos] Cancelar:', e);
        showToast('No se pudo cancelar la solicitud.', 'error');
    } finally {
        state.operacionEnCurso.delete(clave);
    }
}
window.cancelarSolicitudEnviada = cancelarSolicitudEnviada;

/* ============================================================
   FAVORITOS (optimista)
   ============================================================ */
async function toggleFavorito(contactoRowId, nuevoValor) {
    var client = sb();
    var session = await getSession();
    if (!client || !session) {
        showToast('Inicia sesión para continuar.', 'error');
        return;
    }
    if (contactoRowId == null || contactoRowId === '') return;

    var clave = 'favorito:' + String(contactoRowId);
    if (state.operacionEnCurso.has(clave)) return;

    var item = state.contactos.find(function (c) {
        return String(c.id) === String(contactoRowId);
    });
    if (!item) return;

    var anterior = item.es_favorito;
    var nuevo = nuevoValor === true;

    state.operacionEnCurso.add(clave);

    // Optimista
    item.es_favorito = nuevo;
    renderizarContactos();

    try {
        var resultado = await withRetry(function () {
            return client.from(CONFIG.CONTACTOS_TABLE)
                .update({ es_favorito: nuevo })
                .eq('id', contactoRowId)
                .eq('usuario_id', session.user.id);
        }, 'actualizar favorito');

        if (resultado.error) throw resultado.error;

        showToast(nuevo ? 'Agregado a favoritos.' : 'Quitado de favoritos.', 'success');
    } catch (e) {
        console.error('[Contactos] Favorito:', e);
        item.es_favorito = anterior;
        renderizarContactos();
        showToast('No se pudo actualizar el favorito.', 'error');
    } finally {
        state.operacionEnCurso.delete(clave);
    }
}
window.toggleFavorito = toggleFavorito;

/* ============================================================
   ELIMINAR CONTACTO (optimista + rollback)
   ============================================================ */
async function eliminarContacto(contactoIdDelContacto) {
    var client = sb();
    var session = await getSession();
    if (!client || !session) {
        showToast('Inicia sesión para continuar.', 'error');
        return;
    }
    if (!contactoIdDelContacto) return;

    var confirmado = await showConfirm({
        title: 'Eliminar contacto',
        message: '¿Quieres eliminar este contacto? Esta acción no se puede deshacer.',
        icon: '🗑️',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        danger: true
    });
    if (!confirmado) return;

    var clave = 'eliminar:' + contactoIdDelContacto;
    if (state.operacionEnCurso.has(clave)) return;
    state.operacionEnCurso.add(clave);

    // Backup para rollback
    var backup = state.contactos.slice();
    var backupSet = new Set(state.idsContactosSet);
    var backupTotal = state.totalContactos;

    state.contactos = state.contactos.filter(function (c) {
        return String(c.contacto_id) !== String(contactoIdDelContacto);
    });
    state.idsContactosSet.delete(contactoIdDelContacto);
    state.totalContactos = Math.max(0, state.totalContactos - 1);
    renderizarContactos();
    recalcularEstadisticas();

    try {
        var resultado = await client.rpc(CONFIG.RPC_ELIMINAR_AMISTAD, {
            p_contacto_id: contactoIdDelContacto
        });
        if (resultado.error) throw resultado.error;

        showToast('Contacto eliminado.', 'success');

        await cargarContactos({ reset: true });
        await Promise.allSettled([
            cargarSolicitudesPendientesUI(),
            cargarSugerenciasUI()
        ]);
    } catch (e) {
        console.error('[Contactos] Eliminar:', e);
        state.contactos = backup;
        state.idsContactosSet = backupSet;
        state.totalContactos = backupTotal;
        renderizarContactos();
        recalcularEstadisticas();
        showToast('No se pudo eliminar el contacto.', 'error');
    } finally {
        state.operacionEnCurso.delete(clave);
    }
}
window.eliminarContacto = eliminarContacto;

/* ============================================================
   BLOQUEAR CONTACTO (optimista + rollback)
   ============================================================ */
async function bloquearContacto(contactoId) {
    var client = sb();
    var session = await getSession();
    if (!client || !session) {
        showToast('Inicia sesión para continuar.', 'error');
        return;
    }
    if (!contactoId) return;
    if (contactoId === session.user.id) {
        showToast('No puedes bloquearte a ti mismo.', 'warning');
        return;
    }

    var confirmado = await showConfirm({
        title: 'Bloquear usuario',
        message: '¿Quieres bloquear a este usuario? Se eliminará de tus contactos.',
        icon: '⛔',
        confirmText: 'Bloquear',
        cancelText: 'Cancelar',
        danger: true
    });
    if (!confirmado) return;

    var clave = 'bloquear:' + contactoId;
    if (state.operacionEnCurso.has(clave)) return;
    state.operacionEnCurso.add(clave);

    var backup = state.contactos.slice();
    var backupSet = new Set(state.idsContactosSet);
    var backupTotal = state.totalContactos;

    state.contactos = state.contactos.filter(function (c) {
        return String(c.contacto_id) !== String(contactoId);
    });
    state.idsContactosSet.delete(contactoId);
    state.totalContactos = Math.max(0, state.totalContactos - 1);
    renderizarContactos();
    recalcularEstadisticas();

    try {
        var resultado = await withRetry(function () {
            return client.rpc(CONFIG.RPC_BLOQUEAR, { p_contacto_id: contactoId });
        }, 'bloquear contacto');
        if (resultado.error) throw resultado.error;

        showToast('Usuario bloqueado.', 'success');

        await cargarContactos({ reset: true });
        await Promise.allSettled([
            cargarSolicitudesPendientesUI(),
            cargarSugerenciasUI()
        ]);
    } catch (e) {
        console.error('[Contactos] Bloquear:', e);
        state.contactos = backup;
        state.idsContactosSet = backupSet;
        state.totalContactos = backupTotal;
        renderizarContactos();
        recalcularEstadisticas();
        showToast('No se pudo bloquear al usuario.', 'error');
    } finally {
        state.operacionEnCurso.delete(clave);
    }
}
window.bloquearContacto = bloquearContacto;

//    /* ============================================================
       PARTE 4/4 — MENSAJES, LLAMADAS, INVITACIONES Y ARRANQUE
       ============================================================ */

    /* ============================================================
       MENSAJES Y LLAMADAS
       ============================================================ */
    function construirUrlMensajes(contactoId, accion) {
        var base = '/features/mensajes/mensajes.html?usuario=' + encodeURIComponent(contactoId);
        return accion ? base + '&accion=' + encodeURIComponent(accion) : base;
    }

    function abrirMensaje(contactoId) {
        if (!contactoId) return;
        window.location.href = construirUrlMensajes(contactoId, null);
    }
    window.abrirMensaje = abrirMensaje;

    function llamarContacto(contactoId) {
        if (!contactoId) return;
        window.location.href = construirUrlMensajes(contactoId, 'llamada');
    }
    window.llamarContacto = llamarContacto;

    /* ============================================================
       INVITACIONES
       ============================================================ */
    async function invitarContacto() {
        var client = sb();
        var session = await getSession();
        if (!client || !session) {
            showToast('Inicia sesión para invitar contactos.', 'error');
            return;
        }

        var modal = document.getElementById('modalInvitacion');
        var codigoEl = document.getElementById('codigoInvitacion');

        if (modal) {
            modal.classList.add('show', 'active');
            modal.setAttribute('aria-hidden', 'false');
        }
        if (codigoEl) codigoEl.textContent = 'Generando código…';

        try {
            var resultado = await withRetry(function () {
                return client.rpc(CONFIG.RPC_INVITACION);
            }, 'generar invitación');

            if (resultado.error) throw resultado.error;

            var invitacion = Array.isArray(resultado.data)
                ? resultado.data[0]
                : resultado.data;

            if (!invitacion || !invitacion.codigo) {
                throw new Error('Supabase no devolvió un código de invitación.');
            }

            if (codigoEl) codigoEl.textContent = String(invitacion.codigo);
        } catch (e) {
            console.error('[Contactos] Invitación:', e);
            if (codigoEl) codigoEl.textContent = 'ERROR';
            showToast('No se pudo generar la invitación.', 'error');
        }
    }
    window.invitarContacto = invitarContacto;

    async function copiarCodigoInvitacion() {
        var el = document.getElementById('codigoInvitacion');
        if (!el) return;

        var codigo = el.textContent.trim();
        if (!codigo || codigo === 'Generando código…' || codigo === 'ERROR') return;

        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(codigo);
            } else {
                var tmp = document.createElement('textarea');
                tmp.value = codigo;
                tmp.setAttribute('readonly', '');
                tmp.style.position = 'fixed';
                tmp.style.opacity = '0';
                document.body.appendChild(tmp);
                tmp.select();
                var ok = document.execCommand('copy');
                tmp.remove();
                if (!ok) throw new Error('No se pudo copiar.');
            }
            showToast('Código copiado.', 'success');
        } catch (e) {
            console.error('[Contactos] Copiar código:', e);
            showToast('No se pudo copiar el código.', 'error');
        }
    }
    window.copiarCodigoInvitacion = copiarCodigoInvitacion;

    /* ============================================================
       HEALTH CHECK: reintenta hasta que Supabase esté listo
       ============================================================ */
    function esperarSupabase() {
        var intentos = 0;
        var MAX_INTENTOS = 100; // ~10s

        var timer = setInterval(async function () {
            intentos++;
            if (sb()) {
                clearInterval(timer);
                try {
                    inyectarEstilos();
                    configurarEventosTarjetas();
                    await inicializarContactos();
                } catch (e) {
                    console.error('[Contactos] Error al inicializar:', e);
                    mostrarEstadoVacio('⚠️', 'No se pudo iniciar el módulo.');
                    emitirListo();
                }
                return;
            }
            if (intentos >= MAX_INTENTOS) {
                clearInterval(timer);
                console.error('[Contactos] Supabase no estuvo disponible a tiempo.');
                mostrarEstadoVacio('⚠️', 'No se pudo inicializar la conexión. Recarga la página.');
                emitirListo();
            }
        }, 100);
    }

    /* ============================================================
       EXPOSICIÓN ÚNICA DE API PÚBLICA
       ============================================================ */
    window.CsarielContactos = Object.freeze({
        version: 'v20-pro-max',
        cargar: function () { return cargarContactos({ reset: true }); },
        abrirAgregar: abrirAgregarContacto,
        abrirMensaje: abrirMensaje,
        llamar: llamarContacto,
        invitar: invitarContacto,
        copiarCodigo: copiarCodigoInvitacion,
        favorito: toggleFavorito,
        eliminar: eliminarContacto,
        bloquear: bloquearContacto,
        aceptar: aceptarSolicitud,
        rechazar: rechazarSolicitud,
        agregar: agregarContacto,
        getEstado: function () {
            return {
                contactos: state.contactos.length,
                total: state.totalContactos,
                filtro: state.filtroActual,
                cargando: state.cargando,
                initialized: state.initialized
            };
        }
    });

    /* ============================================================
       ARRANQUE
       ============================================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', esperarSupabase, { once: true });
    } else {
        esperarSupabase();
    }

    /* ============================================================
       FIN DEL MÓDULO
       ============================================================ */
})();