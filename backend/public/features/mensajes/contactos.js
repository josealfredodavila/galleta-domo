/* ============================================================
   CSARIEL'S · CONTACTOS · MESSENGER EXPERIENCE v19
   ============================================================
   - Interfaz de contactos más moderna, inspirada en Messenger.
   - Conserva Supabase, solicitudes, favoritos y bloqueos.
   - Avatares seguros, estados y búsqueda optimizada.
   - Corrección para IDs UUID al actualizar favoritos.
   - Protección frente a resultados antiguos de búsqueda.
   - Paginación, caché de perfiles y reintentos controlados.
   - No crea tablas ni modifica la base de datos.
   ============================================================ */

(function () {
    'use strict';

    var CONFIG = {
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

        CAMPOS_PUBLICOS:
            'id, nombre, handle, avatar_url, online, ultima_conexion, verificado'
    };

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
        operacionEnCurso: new Set()
    };

    var SVG_ICONS = {
        mensaje:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>',

        llamar:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92Z"/></svg>',

        favorito:
            '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',

        favoritoOutline:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',

        bloquear:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m5.64 5.64 12.72 12.72"/></svg>',

        eliminar:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',

        cancelar:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>',

        agregarAmigo:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M19 8v6"/><path d="M16 11h6"/></svg>'
    };

    /* ============================================================
       UTILIDADES
       ============================================================ */

    function sb() {
        if (
            window.supabaseClient &&
            typeof window.supabaseClient.from === 'function'
        ) {
            return window.supabaseClient;
        }

        return null;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizarTextoBusqueda(value) {
        return String(value == null ? '' : value)
            .replace(/\u0000/g, '')
            .trim()
            .slice(0, CONFIG.MAX_CHARS_BUSQUEDA);
    }

    function obtenerAvatarSeguro(url) {
        if (!url) return '';

        var valor = String(url).trim();

        if (!valor) return '';

        try {
            if (valor.charAt(0) === '/' && valor.indexOf('//') !== 0) {
                return valor;
            }

            var parsed = new URL(valor, window.location.origin);

            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return '';
            }

            return parsed.href;
        } catch (error) {
            return '';
        }
    }

    function obtenerInicial(nombre) {
        var texto = String(nombre || 'U').trim();

        return texto ? texto.charAt(0).toUpperCase() : 'U';
    }

    function debounce(fn, ms) {
        var timer = null;

        return function () {
            var contexto = this;
            var args = arguments;

            clearTimeout(timer);

            timer = setTimeout(function () {
                fn.apply(contexto, args);
            }, ms);
        };
    }

    function emitirListo() {
        try {
            window.dispatchEvent(new Event('contactos:listo'));
        } catch (error) {
            // El evento es auxiliar.
        }
    }

    function showToast(mensaje, tipo) {
        var toast = document.getElementById('toast');

        if (!toast) {
            console.log('[Csariel’s Contactos]', mensaje);
            return;
        }

        toast.textContent = String(mensaje || '');
        toast.className = 'toast';

        if (tipo) {
            toast.classList.add(tipo);
        }

        requestAnimationFrame(function () {
            toast.classList.add('show');
        });

        clearTimeout(window.__contactosToastTimer);

        window.__contactosToastTimer = setTimeout(function () {
            toast.classList.remove('show');
        }, 3500);
    }

    window.showToast = showToast;

    function ejecutarUnaVez(clave, callback) {
        if (state.operacionEnCurso.has(clave)) {
            return false;
        }

        state.operacionEnCurso.add(clave);

        Promise.resolve()
            .then(callback)
            .finally(function () {
                state.operacionEnCurso.delete(clave);
            });

        return true;
    }

    /* ============================================================
       CONFIRMACIONES
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

            if (!overlay || !cancelBtn || !confirmBtn) {
                resolve(false);
                return;
            }

            if (iconEl) iconEl.textContent = opciones.icon || '⚠️';
            if (titleEl) titleEl.textContent = opciones.title || 'Confirmar';
            if (msgEl) msgEl.textContent = opciones.message || '';

            cancelBtn.textContent = opciones.cancelText || 'Cancelar';
            confirmBtn.textContent = opciones.confirmText || 'Aceptar';

            if (opciones.danger === false) {
                confirmBtn.classList.remove('confirm-danger');
                confirmBtn.style.background =
                    'linear-gradient(135deg, #0F2D1A, #087F5B)';
                confirmBtn.style.borderColor = '#D4AF37';
            } else {
                confirmBtn.classList.add('confirm-danger');
                confirmBtn.style.background = '';
                confirmBtn.style.borderColor = '';
            }

            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');

            function limpiar() {
                cancelBtn.removeEventListener('click', cancelar);
                confirmBtn.removeEventListener('click', confirmar);
                overlay.removeEventListener('click', clickFondo);
                document.removeEventListener('keydown', teclaEscape);
            }

            function finalizar(valor) {
                limpiar();
                overlay.classList.remove('active');
                overlay.setAttribute('aria-hidden', 'true');
                resolve(valor);
            }

            function cancelar() {
                finalizar(false);
            }

            function confirmar() {
                finalizar(true);
            }

            function clickFondo(event) {
                if (event.target === overlay) {
                    finalizar(false);
                }
            }

            function teclaEscape(event) {
                if (event.key === 'Escape') {
                    finalizar(false);
                }
            }

            cancelBtn.addEventListener('click', cancelar);
            confirmBtn.addEventListener('click', confirmar);
            overlay.addEventListener('click', clickFondo);
            document.addEventListener('keydown', teclaEscape);
        });
    }

    /* ============================================================
       SESIÓN Y REINTENTOS
       ============================================================ */

    async function getSession() {
        var ahora = Date.now();

        if (state.session && ahora < state.sessionExpira) {
            return state.session;
        }

        var client = sb();

        if (!client || !client.auth) {
            return null;
        }

        try {
            var resultado = await Promise.race([
                client.auth.getSession(),
                new Promise(function (resolve) {
                    setTimeout(function () {
                        resolve({
                            data: null,
                            error: new Error('Tiempo de espera agotado')
                        });
                    }, CONFIG.SESSION_TIMEOUT_MS);
                })
            ]);

            var data = resultado && resultado.data;
            var error = resultado && resultado.error;

            if (error) {
                console.error('[Contactos] Error de sesión:', error);
                return null;
            }

            state.session = data && data.session ? data.session : null;
            state.sessionExpira = ahora + 60000;

            return state.session;
        } catch (error) {
            console.error('[Contactos] Excepción de sesión:', error);
            return null;
        }
    }

    async function withRetry(fn, contexto) {
        var ultimoError = null;

        for (var intento = 0; intento < CONFIG.RETRY_MAX; intento++) {
            try {
                var resultado = await fn();

                if (resultado && resultado.error) {
                    var err = resultado.error;

                    if (
                        err.code === '23505' ||
                        err.code === '42501' ||
                        err.code === 'PGRST116'
                    ) {
                        return resultado;
                    }

                    throw err;
                }

                return resultado;
            } catch (error) {
                ultimoError = error;

                if (intento === CONFIG.RETRY_MAX - 1) {
                    break;
                }

                var delay = CONFIG.RETRY_BASE_MS * Math.pow(2, intento);

                console.warn(
                    '[Contactos] Reintentando ' + (contexto || 'operación'),
                    error
                );

                await new Promise(function (resolve) {
                    setTimeout(resolve, delay);
                });
            }
        }

        throw ultimoError;
    }

    /* ============================================================
       CACHÉ DE PERFILES
       ============================================================ */

    function getPerfilCacheado(id) {
        var entry = state.perfilCache.get(id);

        if (!entry) return null;

        if (Date.now() > entry.expira) {
            state.perfilCache.delete(id);
            return null;
        }

        // Actualiza el orden para conservar los perfiles usados recientemente.
        state.perfilCache.delete(id);
        state.perfilCache.set(id, entry);

        return entry.perfil;
    }

    function setPerfilCache(id, perfil) {
        if (!id || !perfil) return;

        if (
            !state.perfilCache.has(id) &&
            state.perfilCache.size >= CONFIG.CACHE_MAX_SIZE
        ) {
            var primeraClave = state.perfilCache.keys().next().value;
            state.perfilCache.delete(primeraClave);
        }

        state.perfilCache.set(id, {
            perfil: perfil,
            expira: Date.now() + CONFIG.PROFILE_CACHE_TTL_MS
        });
    }

    async function cargarPerfilesEnLote(ids) {
        var client = sb();

        if (!client || !Array.isArray(ids)) return;

        var unicos = Array.from(new Set(ids.filter(Boolean)));
        var faltantes = unicos.filter(function (id) {
            return !getPerfilCacheado(id);
        });

        if (!faltantes.length) return;

        var CHUNK_SIZE = 100;

        for (var i = 0; i < faltantes.length; i += CHUNK_SIZE) {
            var chunk = faltantes.slice(i, i + CHUNK_SIZE);

            try {
                var resultado = await withRetry(function () {
                    return client
                        .from(CONFIG.PERFILES_VISTA)
                        .select(CONFIG.CAMPOS_PUBLICOS)
                        .in('id', chunk);
                }, 'cargar perfiles');

                if (resultado.error) {
                    console.warn(
                        '[Contactos] No se pudieron cargar perfiles:',
                        resultado.error
                    );
                    continue;
                }

                (resultado.data || []).forEach(function (perfil) {
                    setPerfilCache(perfil.id, perfil);
                });
            } catch (error) {
                console.warn('[Contactos] Error en lote de perfiles:', error);
            }
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
            await cargarSolicitudesPendientesUI();
            await cargarSugerenciasUI();
        } finally {
            state.inicializando = false;
        }
    }

    function configurarEventos() {
        var searchInput = document.getElementById('searchInput');

        if (searchInput) {
            searchInput.addEventListener('input', debounce(function (event) {
                state.textoBusqueda = normalizarTextoBusqueda(
                    event.target.value
                ).toLowerCase();

                renderizarContactos();
            }, CONFIG.DEBOUNCE_FILTRO_MS));
        }

        document.querySelectorAll('.filtros .filtro').forEach(function (boton) {
            boton.addEventListener('click', function () {
                document.querySelectorAll('.filtros .filtro').forEach(
                    function (item) {
                        item.classList.remove('active');
                    }
                );

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
                var versionActual = ++state.busquedaVersion;

                if (texto.length < CONFIG.MIN_CHARS_BUSQUEDA) {
                    mostrarMensajeBusqueda(
                        'Escribe al menos 2 caracteres para buscar'
                    );
                    return;
                }

                state.busquedaTimer = setTimeout(function () {
                    buscarUsuarios(texto, versionActual);
                }, CONFIG.DEBOUNCE_BUSQUEDA_MS);
            });
        }

        var resultados = document.getElementById('resultadosBusqueda');

        if (resultados) {
            resultados.addEventListener(
                'click',
                manejarClickResultadosBusqueda
            );
        }

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                cerrarModalBuscar();
                cerrarModalInvitacion();
            }
        });

        document.addEventListener('click', function (event) {
            var buscar = document.getElementById('modalBuscarContacto');
            var invitacion = document.getElementById('modalInvitacion');

            if (buscar && event.target === buscar) cerrarModalBuscar();
            if (invitacion && event.target === invitacion) {
                cerrarModalInvitacion();
            }
        });

        window.addEventListener('beforeunload', cleanup);

        // Actualiza la sesión cuando Supabase informa un cambio de autenticación.
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
                    mostrarEstadoVacio(
                        '◈',
                        'Inicia sesión para ver tus contactos.'
                    );
                } else if (evento === 'SIGNED_IN' && !state.initialized) {
                    inicializarContactos();
                }
            });
        }
    }

    function cleanup() {
        if (state.observerScroll) {
            state.observerScroll.disconnect();
            state.observerScroll = null;
        }

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
                    return client
                        .from(CONFIG.CONTACTOS_TABLE)
                        .select('id', { count: 'exact', head: true })
                        .eq('usuario_id', session.user.id)
                        .eq('estado', 'activo');
                }, 'contar contactos');

                if (conteo.error) throw conteo.error;

                state.totalContactos = conteo.count || 0;
            }

            var resultado = await withRetry(function () {
                return client
                    .from(CONFIG.CONTACTOS_TABLE)
                    .select(
                        'id, usuario_id, contacto_id, es_favorito, estado, fecha, created_at'
                    )
                    .eq('usuario_id', session.user.id)
                    .order('fecha', {
                        ascending: false,
                        nullsFirst: false
                    })
                    .range(desde, hasta);
            }, 'cargar contactos');

            if (resultado.error) throw resultado.error;

            var pagina = resultado.data || [];

            if (!pagina.length) {
                state.hayMas = false;
                quitarCargandoMas();

                if (reset) {
                    actualizarEstadisticas(0, 0);
                    mostrarEstadoVacio(
                        '◈',
                        'Aún no tienes contactos agregados.'
                    );
                    emitirListo();
                }

                return;
            }

            var idsPagina = pagina.map(function (contacto) {
                return contacto.contacto_id;
            }).filter(Boolean);

            await cargarPerfilesEnLote(idsPagina);

            var enriquecidos = pagina.map(function (contacto) {
                var perfil = getPerfilCacheado(contacto.contacto_id) || {
                    id: contacto.contacto_id,
                    nombre: 'Usuario',
                    handle: null,
                    avatar_url: null,
                    online: false,
                    ultima_conexion: null,
                    verificado: false
                };

                state.idsContactosSet.add(contacto.contacto_id);

                return Object.assign({}, contacto, {
                    contacto: perfil
                });
            });

            if (reset) {
                state.contactos = enriquecidos;
            } else {
                var idsExistentes = new Set(
                    state.contactos.map(function (item) {
                        return String(item.id);
                    })
                );

                enriquecidos.forEach(function (item) {
                    if (!idsExistentes.has(String(item.id))) {
                        state.contactos.push(item);
                    }
                });
            }

            state.paginaActual++;
            state.hayMas = pagina.length === CONFIG.PAGE_SIZE;

            recalcularEstadisticas();
            renderizarContactos();
            quitarCargandoMas();

            if (reset) emitirListo();
        } catch (error) {
            console.error('[Contactos] Error cargando contactos:', error);
            quitarCargandoMas();

            if (reset) {
                state.contactos = [];
                actualizarEstadisticas(0, 0);
                mostrarEstadoVacio(
                    '⚠️',
                    'No se pudieron cargar los contactos.'
                );
                showToast('No se pudieron cargar los contactos.', 'error');
                emitirListo();
            } else {
                showToast('No se pudieron cargar más contactos.', 'error');
            }
        } finally {
            state.cargando = false;
        }
    }

    window.cargarContactos = function () {
        return cargarContactos({ reset: true });
    };

    function normalizarContacto(item) {
        var usuario = item && item.contacto ? item.contacto : {};
        var nombre = usuario.nombre || usuario.handle || 'Usuario';

        return {
            id: item && item.id != null ? item.id : null,
            contacto_id: item ? item.contacto_id : null,
            nombre: String(nombre),
            handle: String(usuario.handle || ''),
            avatar_url: obtenerAvatarSeguro(usuario.avatar_url),
            online: usuario.online === true,
            verificado: usuario.verificado === true,
            es_favorito: item && item.es_favorito === true,
            estado: item && item.estado ? item.estado : 'activo',
            fecha: item ? item.fecha || item.created_at || null : null,
            ultima_conexion: usuario.ultima_conexion || null
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
            var resultado = await client
                .from(CONFIG.CONTACTOS_TABLE)
                .select('id, usuario_id, contacto_id, estado')
                .eq('contacto_id', session.user.id)
                .eq('estado', 'pendiente');

            if (resultado.error) throw resultado.error;

            var solicitudes = resultado.data || [];

            if (!solicitudes.length) {
                seccion.style.display = 'none';
                return;
            }

            var idsRemitentes = solicitudes.map(function (solicitud) {
                return solicitud.usuario_id;
            });

            await cargarPerfilesEnLote(idsRemitentes);

            seccion.style.display = 'block';
            contador.textContent = String(solicitudes.length);

            contenedor.innerHTML = solicitudes.map(function (solicitud) {
                var perfil = getPerfilCacheado(solicitud.usuario_id) || {};
                var nombre = perfil.nombre || perfil.handle || 'Usuario';
                var handle = perfil.handle
                    ? '@' + String(perfil.handle).replace(/^@/, '')
                    : '';

                var avatarUrl = obtenerAvatarSeguro(perfil.avatar_url);
                var avatar = avatarUrl
                    ? '<img src="' + escapeHtml(avatarUrl) +
                      '" alt="" loading="lazy" onerror="this.remove()">'
                    : escapeHtml(obtenerInicial(nombre));

                return `
                    <div class="solicitud-card">
                        <div class="avatar">${avatar}</div>
                        <div class="info">
                            <div class="nombre">${escapeHtml(nombre)}</div>
                            <div class="handle">${escapeHtml(handle)}</div>
                        </div>
                        <div class="acciones">
                            <button type="button" class="btn-aceptar"
                                data-solicitud-aceptar="${escapeHtml(solicitud.id)}"
                                data-usuario-id="${escapeHtml(solicitud.usuario_id)}">
                                ${SVG_ICONS.agregarAmigo} Aceptar
                            </button>
                            <button type="button" class="btn-rechazar"
                                data-solicitud-rechazar="${escapeHtml(solicitud.id)}"
                                data-usuario-id="${escapeHtml(solicitud.usuario_id)}">
                                ${SVG_ICONS.cancelar} Rechazar
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            contenedor.querySelectorAll('[data-solicitud-aceptar]').forEach(
                function (boton) {
                    boton.addEventListener('click', function () {
                        aceptarSolicitud(
                            boton.getAttribute('data-solicitud-aceptar'),
                            boton.getAttribute('data-usuario-id')
                        );
                    });
                }
            );

            contenedor.querySelectorAll('[data-solicitud-rechazar]').forEach(
                function (boton) {
                    boton.addEventListener('click', function () {
                        rechazarSolicitud(
                            boton.getAttribute('data-solicitud-rechazar')
                        );
                    });
                }
            );
        } catch (error) {
            console.error(
                '[Contactos] Error cargando solicitudes:',
                error
            );
            seccion.style.display = 'none';
        }
    }

    window.cargarSolicitudesPendientesUI = cargarSolicitudesPendientesUI;

    /* ============================================================
       SUGERENCIAS DE AMISTAD
       ============================================================ */

    async function cargarSugerenciasUI() {
        var client = sb();
        var session = await getSession();

        if (!client || !session) return;

        var seccion = document.getElementById('sugerenciasSection');
        var contenedor = document.getElementById('sugerenciasLista');

        if (!seccion || !contenedor) return;

        try {
            var existentesResultado = await client
                .from(CONFIG.CONTACTOS_TABLE)
                .select('contacto_id, usuario_id')
                .or(
                    'usuario_id.eq.' + session.user.id +
                    ',contacto_id.eq.' + session.user.id
                );

            if (existentesResultado.error) {
                throw existentesResultado.error;
            }

            var idsExcluir = new Set([session.user.id]);

            (existentesResultado.data || []).forEach(function (item) {
                if (item.usuario_id) idsExcluir.add(item.usuario_id);
                if (item.contacto_id) idsExcluir.add(item.contacto_id);
            });

            try {
                var bloqueosResultado = await client
                    .from(CONFIG.BLOQUEOS_TABLE)
                    .select('bloqueado_id')
                    .eq('usuario_id', session.user.id);

                (bloqueosResultado.data || []).forEach(function (bloqueo) {
                    if (bloqueo.bloqueado_id) {
                        idsExcluir.add(bloqueo.bloqueado_id);
                    }
                });
            } catch (errorBloqueos) {
                console.warn(
                    '[Contactos] No se pudieron consultar los bloqueos:',
                    errorBloqueos
                );
            }

            /*
             * Se conservan los identificadores obtenidos de Supabase.
             * No se crea ninguna tabla ni se cambia el esquema.
             */
            var idsExcluirArray = Array.from(idsExcluir);

            if (!idsExcluirArray.length) {
                seccion.style.display = 'none';
                return;
            }

            var perfilesResultado = await client
                .from(CONFIG.PERFILES_VISTA)
                .select(CONFIG.CAMPOS_PUBLICOS)
                .not('id', 'in', '(' + idsExcluirArray.join(',') + ')')
                .order('online', { ascending: false })
                .limit(CONFIG.MAX_SUGERENCIAS);

            if (perfilesResultado.error) throw perfilesResultado.error;

            var perfiles = perfilesResultado.data || [];

            if (!perfiles.length) {
                seccion.style.display = 'none';
                return;
            }

            perfiles.forEach(function (perfil) {
                setPerfilCache(perfil.id, perfil);
            });

            seccion.style.display = 'block';

            contenedor.innerHTML = perfiles.map(function (usuario) {
                var nombre = usuario.nombre || usuario.handle || 'Usuario';
                var handle = usuario.handle
                    ? '@' + String(usuario.handle).replace(/^@/, '')
                    : '';

                var avatarUrl = obtenerAvatarSeguro(usuario.avatar_url);
                var avatar = avatarUrl
                    ? '<img src="' + escapeHtml(avatarUrl) +
                      '" alt="" loading="lazy" onerror="this.remove()">'
                    : escapeHtml(obtenerInicial(nombre));

                var estado = usuario.online === true
                    ? '<span class="estado online">● En línea</span>'
                    : '<span class="estado">Desconectado</span>';

                return `
                    <div class="sugerencia-card">
                        <div class="avatar ${usuario.online ? 'online' : ''}">
                            ${avatar}
                        </div>
                        <div class="info">
                            <div class="nombre">
                                ${escapeHtml(nombre)}
                                ${usuario.verificado
                                    ? '<span class="verified">✓</span>'
                                    : ''}
                            </div>
                            <div class="handle">${escapeHtml(handle)}</div>
                            ${estado}
                        </div>
                        <div class="acciones">
                            <button type="button"
                                class="btn-agregar-sugerencia"
                                data-sugerencia-agregar="${escapeHtml(usuario.id)}">
                                ${SVG_ICONS.agregarAmigo} Agregar
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            contenedor.querySelectorAll('[data-sugerencia-agregar]').forEach(
                function (boton) {
                    boton.addEventListener('click', function () {
                        agregarContacto(
                            boton.getAttribute('data-sugerencia-agregar')
                        );
                    });
                }
            );
        } catch (error) {
            console.error('[Contactos] Error cargando sugerencias:', error);
            seccion.style.display = 'none';
        }
    }

    window.cargarSugerenciasUI = cargarSugerenciasUI;

    /* ============================================================
       LISTA PRINCIPAL · EXPERIENCIA TIPO MESSENGER
       ============================================================ */

    function renderizarContactos() {
        var lista = document.getElementById('contactosList');

        if (!lista) return;

        var listaContactos = state.contactos.map(normalizarContacto);

        if (state.filtroActual === 'online') {
            listaContactos = listaContactos.filter(function (contacto) {
                return contacto.online;
            });
        }

        if (state.filtroActual === 'favoritos') {
            listaContactos = listaContactos.filter(function (contacto) {
                return contacto.es_favorito;
            });
        }

        if (state.filtroActual === 'recientes') {
            listaContactos = listaContactos
                .filter(function (contacto) {
                    return Boolean(contacto.fecha);
                })
                .sort(function (a, b) {
                    return new Date(b.fecha).getTime() -
                        new Date(a.fecha).getTime();
                })
                .slice(0, 10);
        }

        if (state.textoBusqueda) {
            var q = state.textoBusqueda;

            listaContactos = listaContactos.filter(function (contacto) {
                return contacto.nombre.toLowerCase().includes(q) ||
                    contacto.handle.toLowerCase().includes(q);
            });
        }

        if (!listaContactos.length) {
            var mensaje = state.textoBusqueda
                ? 'No se encontraron contactos.'
                : state.filtroActual === 'online'
                    ? 'No hay contactos conectados en este momento.'
                    : state.filtroActual === 'favoritos'
                        ? 'Todavía no tienes favoritos.'
                        : 'Aún no tienes contactos agregados.';

            mostrarEstadoVacio('◈', mensaje);
            return;
        }

        lista.setAttribute('aria-busy', 'false');

        lista.innerHTML = listaContactos.map(renderizarTarjeta).join('') +
            (state.hayMas && !state.textoBusqueda
                ? '<div id="cargandoMasSentinel" style="height:1px;"></div>'
                : '');

        configurarScrollInfinito();
    }

    function renderizarTarjeta(contacto) {
        var inicial = escapeHtml(obtenerInicial(contacto.nombre));
        var avatarUrl = obtenerAvatarSeguro(contacto.avatar_url);

        var avatar = avatarUrl
            ? '<img src="' + escapeHtml(avatarUrl) +
              '" alt="' + escapeHtml(contacto.nombre) +
              '" loading="lazy" referrerpolicy="no-referrer" ' +
              'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
              '<span class="avatar-fallback" style="display:none">' +
              inicial + '</span>'
            : '<span class="avatar-fallback">' + inicial + '</span>';

        var pendiente = contacto.estado === 'pendiente';
        var enLinea = contacto.online === true;
        var handle = contacto.handle
            ? '@' + String(contacto.handle).replace(/^@/, '')
            : '';

        var estadoTexto = pendiente
            ? 'Solicitud enviada'
            : enLinea
                ? 'En línea ahora'
                : 'Desconectado';

        var estadoClase = enLinea ? 'online' : 'offline';
        var filaId = escapeHtml(contacto.id);
        var contactoId = escapeHtml(contacto.contacto_id);

        var favoritoClase = contacto.es_favorito ? 'active' : '';
        var favoritoIcono = contacto.es_favorito
            ? SVG_ICONS.favorito
            : SVG_ICONS.favoritoOutline;

        var verificado = contacto.verificado
            ? '<span class="verified" title="Perfil verificado" aria-label="Verificado">✓</span>'
            : '';

        /*
         * La tarjeta usa estilos inline complementarios para mejorar
         * su apariencia incluso si el CSS anterior tiene otros colores.
         */
        var estilosTarjeta =
            'position:relative;display:flex;align-items:center;gap:13px;' +
            'padding:14px 15px;margin:7px 0;border-radius:17px;' +
            'border:1px solid rgba(212,175,55,.15);' +
            'background:linear-gradient(120deg,rgba(15,45,26,.96),rgba(12,22,18,.98));' +
            'box-shadow:0 4px 16px rgba(0,0,0,.12);' +
            'transition:transform .18s ease,border-color .18s ease;' +
            'cursor:pointer;min-width:0;';

        var estilosAvatar =
            'position:relative;flex:0 0 55px;width:55px;height:55px;' +
            'border-radius:50%;overflow:hidden;display:flex;' +
            'align-items:center;justify-content:center;' +
            'background:linear-gradient(135deg,#0F2D1A,#137B50,#D4AF37);' +
            'border:2px solid ' + (enLinea ? '#36D66A' : 'rgba(212,175,55,.55)') + ';' +
            'color:#fff;font-size:20px;font-weight:800;';

        var estilosImagen =
            'width:100%;height:100%;object-fit:cover;border-radius:50%;';

        var estilosInfo =
            'flex:1;min-width:0;overflow:hidden;';

        var estilosNombre =
            'display:flex;align-items:center;gap:5px;flex-wrap:wrap;' +
            'color:#fff;font-size:15px;font-weight:700;line-height:1.3;' +
            'overflow-wrap:anywhere;';

        var estilosEstado =
            'display:flex;align-items:center;gap:5px;margin-top:5px;' +
            'font-size:12px;color:' + (enLinea ? '#56E68A' : '#A0ADA4') + ';';

        var estilosHandle =
            'display:block;margin-top:4px;font-size:11px;' +
            'color:#A8B7AD;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

        var estilosAcciones =
            'display:flex;align-items:center;justify-content:flex-end;' +
            'gap:6px;flex-wrap:wrap;max-width:100%;';

        var botonMensaje = pendiente ? '' :
            '<button type="button" class="mensaje" ' +
            'data-accion="mensaje" title="Enviar mensaje" aria-label="Enviar mensaje" ' +
            'style="display:inline-flex;align-items:center;justify-content:center;gap:6px;' +
            'padding:9px 11px;border-radius:12px;border:1px solid rgba(72,160,255,.38);' +
            'background:rgba(32,126,230,.14);color:#75B8FF;font-size:12px;font-weight:700;">' +
            SVG_ICONS.mensaje + '<span>Mensaje</span></button>';

        var botonLlamar = pendiente ? '' :
            '<button type="button" class="llamar" ' +
            'data-accion="llamar" title="Llamar" aria-label="Llamar" ' +
            'style="display:inline-flex;align-items:center;justify-content:center;' +
            'padding:9px;border-radius:12px;border:1px solid rgba(212,175,55,.25);' +
            'background:rgba(212,175,55,.08);color:#D4AF37;">' +
            SVG_ICONS.llamar + '</button>';

        var botonFavorito = pendiente ? '' :
            '<button type="button" class="favorito ' + favoritoClase + '" ' +
            'data-accion="favorito" title="' +
            (contacto.es_favorito ? 'Quitar de favoritos' : 'Agregar a favoritos') +
            '" aria-label="Cambiar favorito" ' +
            'style="display:inline-flex;align-items:center;justify-content:center;' +
            'padding:9px;border-radius:12px;border:1px solid rgba(212,175,55,.2);' +
            'background:' + (contacto.es_favorito
                ? 'rgba(212,175,55,.2)'
                : 'rgba(255,255,255,.04)') +
            ';color:#D4AF37;">' + favoritoIcono + '</button>';

        var botonesExtra = pendiente
            ? '<button type="button" class="rechazar" data-accion="cancelar" ' +
              'title="Cancelar solicitud" aria-label="Cancelar solicitud" ' +
              'style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,100,100,.25);' +
              'background:rgba(255,80,80,.08);color:#FF9292;font-size:11px;">' +
              SVG_ICONS.cancelar + '</button>'
            : '<button type="button" class="bloquear" data-accion="bloquear" ' +
              'title="Bloquear usuario" aria-label="Bloquear usuario" ' +
              'style="padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.08);' +
              'background:rgba(255,255,255,.03);color:#AAB6AE;">' +
              SVG_ICONS.bloquear + '</button>' +
              '<button type="button" class="eliminar" data-accion="eliminar" ' +
              'title="Eliminar contacto" aria-label="Eliminar contacto" ' +
              'style="padding:8px;border-radius:10px;border:1px solid rgba(255,100,100,.15);' +
              'background:rgba(255,80,80,.04);color:#E88C8C;">' +
              SVG_ICONS.eliminar + '</button>';

        return `
            <article class="contacto-card ${pendiente ? 'pendiente' : ''}"
                data-contacto-id="${contactoId}"
                data-fila-id="${filaId}"
                tabindex="0"
                role="button"
                aria-label="Abrir conversación con ${escapeHtml(contacto.nombre)}"
                style="${estilosTarjeta}">

                <div class="contacto-avatar ${enLinea ? 'online' : ''}"
                    style="${estilosAvatar}">
                    ${avatar}
                    <span class="online-dot"
                        style="position:absolute;right:0;bottom:1px;width:13px;height:13px;
                        border-radius:50%;background:${enLinea ? '#36D66A' : '#7D8981'};
                        border:2px solid #0F2D1A;${enLinea ? '' : 'display:none;'}"></span>
                    ${contacto.es_favorito
                        ? '<span class="favorito-badge" style="position:absolute;top:-2px;left:-2px;color:#D4AF37;font-size:13px;">★</span>'
                        : ''}
                </div>

                <div class="contacto-info" style="${estilosInfo}">
                    <div class="nombre" style="${estilosNombre}">
                        ${escapeHtml(contacto.nombre)}
                        ${verificado}
                    </div>

                    <div class="estado ${estadoClase}" style="${estilosEstado}">
                        <span style="width:7px;height:7px;flex:0 0 7px;border-radius:50%;
                            background:${enLinea ? '#36D66A' : '#849088'};"></span>
                        ${escapeHtml(estadoTexto)}
                    </div>

                    ${handle
                        ? '<div class="contacto-meta" style="' + estilosHandle + '">' +
                          escapeHtml(handle) + '</div>'
                        : ''}
                </div>

                <div class="contacto-actions" style="${estilosAcciones}">
                    ${botonMensaje}
                    ${botonLlamar}
                    ${botonFavorito}
                    ${botonesExtra}
                </div>
            </article>
        `;
    }

    /*
     * Delegación de eventos: evita generar funciones onclick dentro
     * de cada tarjeta y conserva los IDs UUID como texto.
     */
    function configurarEventosTarjetas() {
        var lista = document.getElementById('contactosList');

        if (!lista || lista.dataset.eventosCsariel === '1') return;

        lista.dataset.eventosCsariel = '1';

        lista.addEventListener('click', function (event) {
            var boton = event.target.closest('[data-accion]');
            var tarjeta = event.target.closest('.contacto-card');

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
                    var item = state.contactos.find(function (contacto) {
                        return String(contacto.id) === String(filaId);
                    });

                    if (item) {
                        toggleFavorito(filaId, item.es_favorito !== true);
                    }
                }

                if (accion === 'bloquear') bloquearContacto(contactoId);
                if (accion === 'eliminar') eliminarContacto(contactoId);

                if (accion === 'cancelar') {
                    cancelarSolicitudEnviada(filaId);
                }

                return;
            }

            abrirMensaje(contactoId);
        });

        lista.addEventListener('keydown', function (event) {
            if (
                (event.key === 'Enter' || event.key === ' ') &&
                event.target.classList.contains('contacto-card')
            ) {
                event.preventDefault();

                abrirMensaje(
                    event.target.getAttribute('data-contacto-id')
                );
            }
        });
    }

    function configurarScrollInfinito() {
        if (state.observerScroll) {
            state.observerScroll.disconnect();
            state.observerScroll = null;
        }

        var sentinel = document.getElementById('cargandoMasSentinel');

        if (!sentinel || !('IntersectionObserver' in window)) return;

        state.observerScroll = new IntersectionObserver(
            function (entries) {
                if (
                    entries[0] &&
                    entries[0].isIntersecting &&
                    state.hayMas &&
                    !state.cargando &&
                    !state.textoBusqueda
                ) {
                    cargarContactos({ reset: false });
                }
            },
            { rootMargin: '300px', threshold: 0 }
        );

        state.observerScroll.observe(sentinel);
    }

    function mostrarCargando() {
        var lista = document.getElementById('contactosList');

        if (!lista) return;

        lista.setAttribute('aria-busy', 'true');

        lista.innerHTML = Array(4).fill('').map(function () {
            return `
                <div class="contacto-card skeleton"
                    style="display:flex;align-items:center;gap:13px;padding:14px;
                    margin:7px 0;border-radius:17px;background:rgba(255,255,255,.025);
                    border:1px solid rgba(212,175,55,.1);">
                    <div class="contacto-avatar"
                        style="width:55px;height:55px;flex:0 0 55px;border-radius:50%;
                        background:linear-gradient(90deg,#16241B,#26362B,#16241B);
                        background-size:200% 100%;"></div>
                    <div class="contacto-info" style="flex:1;">
                        <div class="skeleton-line"
                            style="height:12px;width:55%;border-radius:8px;
                            background:rgba(255,255,255,.08);margin-bottom:10px;"></div>
                        <div class="skeleton-line"
                            style="height:9px;width:35%;border-radius:8px;
                            background:rgba(255,255,255,.05);"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function mostrarCargandoMas() {
        var lista = document.getElementById('contactosList');

        if (!lista || document.getElementById('cargandoMasIndicador')) return;

        var div = document.createElement('div');

        div.id = 'cargandoMasIndicador';
        div.style.cssText =
            'text-align:center;padding:16px;color:var(--text-muted);font-size:.8rem;';
        div.textContent = 'Cargando más contactos…';

        lista.appendChild(div);
    }

    function quitarCargandoMas() {
        var elemento = document.getElementById('cargandoMasIndicador');

        if (elemento) elemento.remove();

        var lista = document.getElementById('contactosList');

        if (lista) lista.setAttribute('aria-busy', 'false');
    }

    function mostrarEstadoVacio(icono, mensaje) {
        var lista = document.getElementById('contactosList');

        if (!lista) return;

        lista.setAttribute('aria-busy', 'false');

        lista.innerHTML = `
            <div class="empty-state" style="padding:35px 18px;text-align:center;
                border-radius:20px;border:1px dashed rgba(212,175,55,.25);
                background:linear-gradient(145deg,rgba(15,45,26,.4),rgba(255,255,255,.015));">
                <div class="icon" style="font-size:36px;color:#D4AF37;margin-bottom:12px;">
                    ${escapeHtml(icono)}
                </div>
                <h3 style="font-size:14px;line-height:1.6;color:var(--text-primary,#fff);
                    margin:0 0 16px;">${escapeHtml(mensaje)}</h3>
                ${state.contactos.length === 0
                    ? '<button type="button" class="btn-accion" data-contactos-action="agregar" ' +
                      'style="padding:11px 18px;border-radius:12px;background:#0F2D1A;' +
                      'border:1px solid #D4AF37;color:#fff;font-weight:700;">' +
                      SVG_ICONS.agregarAmigo + ' Agregar contacto</button>'
                    : ''}
            </div>
        `;

        var boton = lista.querySelector('[data-contactos-action="agregar"]');

        if (boton) {
            boton.addEventListener('click', abrirAgregarContacto, { once: true });
        }
    }

    function recalcularEstadisticas() {
        var activos = state.contactos.filter(function (contacto) {
            return (contacto.estado || 'activo') === 'activo';
        }).length;

        var total = state.totalContactos;

        if (total < activos) total = activos;

        var online = state.contactos.filter(function (contacto) {
            return contacto.contacto && contacto.contacto.online === true &&
                (contacto.estado || 'activo') === 'activo';
        }).length;

        actualizarEstadisticas(total, online);
    }

    function actualizarEstadisticas(total, online) {
        var totalEl = document.getElementById('totalContactos');
        var onlineEl = document.getElementById('onlineContactos');

        if (totalEl) totalEl.textContent = String(total || 0);
        if (onlineEl) onlineEl.textContent = String(online || 0);
    }

    /* ============================================================
       BUSCAR Y AGREGAR CONTACTOS
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

            setTimeout(function () {
                input.focus();
            }, 100);
        }

        if (resultados) {
            resultados.innerHTML =
                '<div style="padding:24px;text-align:center;color:var(--text-muted);">' +
                'Busca por nombre o nombre de usuario.</div>';
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

    async function buscarUsuarios(texto, version) {
        var client = sb();
        var session = await getSession();

        if (!client || !session) {
            mostrarMensajeBusqueda('Inicia sesión para buscar contactos.');
            return;
        }

        var termino = normalizarTextoBusqueda(texto)
            .replace(/^@+/, '')
            .trim();

        if (termino.length < CONFIG.MIN_CHARS_BUSQUEDA) {
            mostrarMensajeBusqueda('Escribe al menos 2 caracteres para buscar.');
            return;
        }

        try {
            var patron = '%' + termino + '%';

            var resultados = await Promise.all([
                withRetry(function () {
                    return client
                        .from(CONFIG.PERFILES_VISTA)
                        .select(CONFIG.CAMPOS_PUBLICOS)
                        .neq('id', session.user.id)
                        .ilike('nombre', patron)
                        .limit(CONFIG.MAX_RESULTADOS_BUSQUEDA);
                }, 'buscar por nombre'),

                withRetry(function () {
                    return client
                        .from(CONFIG.PERFILES_VISTA)
                        .select(CONFIG.CAMPOS_PUBLICOS)
                        .neq('id', session.user.id)
                        .ilike('handle', patron)
                        .limit(CONFIG.MAX_RESULTADOS_BUSQUEDA);
                }, 'buscar por usuario')
            ]);

            // Descarta resultados antiguos si el usuario siguió escribiendo.
            if (version !== state.busquedaVersion) return;

            var error = resultados.find(function (resultado) {
                return resultado && resultado.error;
            });

            if (error) throw error.error;

            var mapa = new Map();

            resultados.forEach(function (resultado) {
                (resultado.data || []).forEach(function (usuario) {
                    if (usuario && usuario.id && !mapa.has(usuario.id)) {
                        mapa.set(usuario.id, usuario);
                        setPerfilCache(usuario.id, usuario);
                    }
                });
            });

            var usuarios = Array.from(mapa.values())
                .slice(0, CONFIG.MAX_RESULTADOS_BUSQUEDA);

            if (!usuarios.length) {
                mostrarMensajeBusqueda('No se encontraron usuarios.');
                return;
            }

            var idsBloqueados = new Set();

            try {
                var bloqueosResultado = await client
                    .from(CONFIG.BLOQUEOS_TABLE)
                    .select('bloqueado_id')
                    .eq('usuario_id', session.user.id);

                (bloqueosResultado.data || []).forEach(function (bloqueo) {
                    if (bloqueo.bloqueado_id) {
                        idsBloqueados.add(bloqueo.bloqueado_id);
                    }
                });
            } catch (errorBloqueos) {
                console.warn('[Contactos] No se pudieron consultar bloqueos.');
            }

            if (version !== state.busquedaVersion) return;

            var disponibles = usuarios.filter(function (usuario) {
                return !state.idsContactosSet.has(usuario.id) &&
                    !idsBloqueados.has(usuario.id);
            });

            if (!disponibles.length) {
                mostrarMensajeBusqueda(
                    'Los usuarios encontrados ya están en tus contactos o están bloqueados.'
                );
                return;
            }

            renderizarResultadosBusqueda(disponibles);
        } catch (error) {
            console.error('[Contactos] Error buscando usuarios:', error);
            mostrarMensajeBusqueda('No fue posible realizar la búsqueda.');
        }
    }

    function renderizarResultadosBusqueda(usuarios) {
        var contenedor = document.getElementById('resultadosBusqueda');

        if (!contenedor) return;

        contenedor.innerHTML = usuarios.map(function (usuario) {
            var nombre = usuario.nombre || usuario.handle || 'Usuario';
            var handle = usuario.handle
                ? '@' + String(usuario.handle).replace(/^@/, '')
                : '';

            var avatarUrl = obtenerAvatarSeguro(usuario.avatar_url);

            var avatar = avatarUrl
                ? '<img src="' + escapeHtml(avatarUrl) +
                  '" alt="" loading="lazy" ' +
                  'style="width:48px;height:48px;border-radius:50%;object-fit:cover;" ' +
                  'onerror="this.style.display=\'none\'">'
                : '<div style="width:48px;height:48px;flex:0 0 48px;border-radius:50%;' +
                  'display:flex;align-items:center;justify-content:center;' +
                  'background:linear-gradient(135deg,#0F2D1A,#147A4B,#D4AF37);' +
                  'color:white;font-weight:800;font-size:18px;">' +
                  escapeHtml(obtenerInicial(nombre)) + '</div>';

            return `
                <div style="display:flex;align-items:center;gap:12px;padding:13px;
                    border-bottom:1px solid rgba(212,175,55,.12);">
                    ${avatar}
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;color:var(--text-primary,#fff);
                            font-size:14px;overflow-wrap:anywhere;">
                            ${escapeHtml(nombre)}
                            ${usuario.verificado
                                ? '<span style="color:#D4AF37;">✓</span>'
                                : ''}
                        </div>
                        <div style="color:var(--text-muted,#9BA89F);font-size:12px;margin-top:4px;">
                            ${escapeHtml(handle)}
                        </div>
                        <div style="color:${usuario.online ? '#56E68A' : '#9BA89F'};
                            font-size:11px;margin-top:4px;">
                            ${usuario.online ? '● En línea' : 'Desconectado'}
                        </div>
                    </div>
                    <button type="button" class="btn-agregar"
                        data-action="agregar"
                        data-usuario-id="${escapeHtml(usuario.id)}"
                        style="display:inline-flex;align-items:center;gap:5px;
                        padding:9px 12px;border-radius:11px;border:1px solid #D4AF37;
                        background:#0F2D1A;color:#fff;font-weight:700;font-size:12px;">
                        ${SVG_ICONS.agregarAmigo} Agregar
                    </button>
                </div>
            `;
        }).join('');
    }

    function mostrarMensajeBusqueda(mensaje) {
        var contenedor = document.getElementById('resultadosBusqueda');

        if (!contenedor) return;

        contenedor.innerHTML =
            '<div style="padding:24px;text-align:center;color:var(--text-muted,#A0ADA4);' +
            'font-size:13px;line-height:1.6;">' +
            escapeHtml(mensaje) +
            '</div>';
    }

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
            }, 'enviar solicitud de amistad');

            if (resultado.error) {
                if (resultado.error.code === '23505') {
                    showToast(
                        'Ya enviaste una solicitud a este usuario.',
                        'warning'
                    );
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
            await cargarSolicitudesPendientesUI();
            await cargarSugerenciasUI();
        } catch (error) {
            console.error('[Contactos] Error agregando contacto:', error);
            showToast('No se pudo enviar la solicitud.', 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    window.agregarContacto = agregarContacto;

    /* ============================================================
       ACEPTAR Y RECHAZAR SOLICITUDES
       ============================================================ */

    async function aceptarSolicitud(contactoRowId, otroUsuarioId) {
        var client = sb();
        var session = await getSession();

        if (!client || !session) return;

        var fila = Number(contactoRowId);

        if (!Number.isFinite(fila) || fila <= 0) {
            showToast('El identificador de la solicitud no es válido.', 'error');
            return;
        }

        var clave = 'aceptar:' + contactoRowId;

        if (state.operacionEnCurso.has(clave)) return;

        state.operacionEnCurso.add(clave);

        try {
            var resultado = await client.rpc(
                CONFIG.RPC_RESPONDER_SOLICITUD,
                {
                    p_fila_id: fila,
                    p_aceptar: true
                }
            );

            if (resultado.error) throw resultado.error;

            if (otroUsuarioId) {
                state.idsContactosSet.add(otroUsuarioId);
            }

            showToast('Amistad aceptada.', 'success');

            await cargarContactos({ reset: true });
            await cargarSolicitudesPendientesUI();
            await cargarSugerenciasUI();
        } catch (error) {
            console.error('[Contactos] Error aceptando solicitud:', error);
            showToast('No se pudo aceptar la solicitud.', 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    window.aceptarSolicitud = aceptarSolicitud;

    async function rechazarSolicitud(contactoRowId) {
        var client = sb();
        var session = await getSession();

        if (!client || !session) return;

        var fila = Number(contactoRowId);

        if (!Number.isFinite(fila) || fila <= 0) {
            showToast('El identificador de la solicitud no es válido.', 'error');
            return;
        }

        var clave = 'rechazar:' + contactoRowId;

        if (state.operacionEnCurso.has(clave)) return;

        state.operacionEnCurso.add(clave);

        try {
            var resultado = await client.rpc(
                CONFIG.RPC_RESPONDER_SOLICITUD,
                {
                    p_fila_id: fila,
                    p_aceptar: false
                }
            );

            if (resultado.error) throw resultado.error;

            showToast('Solicitud rechazada.', 'success');

            await cargarSolicitudesPendientesUI();
            await cargarContactos({ reset: true });
            await cargarSugerenciasUI();
        } catch (error) {
            console.error('[Contactos] Error rechazando solicitud:', error);
            showToast('No se pudo rechazar la solicitud.', 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    window.rechazarSolicitud = rechazarSolicitud;

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
            var resultado = await client
                .from(CONFIG.CONTACTOS_TABLE)
                .delete()
                .eq('id', filaId)
                .eq('usuario_id', session.user.id)
                .eq('estado', 'pendiente');

            if (resultado.error) throw resultado.error;

            showToast('Solicitud cancelada.', 'success');

            await cargarContactos({ reset: true });
            await cargarSolicitudesPendientesUI();
            await cargarSugerenciasUI();
        } catch (error) {
            console.error(
                '[Contactos] Error cancelando solicitud:',
                error
            );
            showToast('No se pudo cancelar la solicitud.', 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    window.cancelarSolicitudEnviada = cancelarSolicitudEnviada;

    /* ============================================================
       FAVORITOS
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

        var item = state.contactos.find(function (contacto) {
            return String(contacto.id) === String(contactoRowId);
        });

        if (!item) return;

        var valorAnterior = item.es_favorito;
        var valorNuevo = nuevoValor === true;

        state.operacionEnCurso.add(clave);

        // Actualización optimista para que la interfaz responda de inmediato.
        item.es_favorito = valorNuevo;
        renderizarContactos();

        try {
            var resultado = await withRetry(function () {
                return client
                    .from(CONFIG.CONTACTOS_TABLE)
                    .update({ es_favorito: valorNuevo })
                    .eq('id', contactoRowId)
                    .eq('usuario_id', session.user.id);
            }, 'actualizar favorito');

            if (resultado.error) throw resultado.error;

            showToast(
                valorNuevo ? 'Agregado a favoritos.' : 'Quitado de favoritos.',
                'success'
            );

            renderizarContactos();
        } catch (error) {
            console.error('[Contactos] Error actualizando favorito:', error);

            item.es_favorito = valorAnterior;

            renderizarContactos();

            showToast('No se pudo actualizar el favorito.', 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    window.toggleFavorito = toggleFavorito;

    /* ============================================================
       ELIMINAR CONTACTO
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
            message:
                '¿Quieres eliminar este contacto de tu lista? Esta acción no se puede deshacer.',
            icon: '🗑️',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            danger: true
        });

        if (!confirmado) return;

        var clave = 'eliminar:' + contactoIdDelContacto;

        if (state.operacionEnCurso.has(clave)) return;

        state.operacionEnCurso.add(clave);

        var backup = state.contactos.slice();
        var backupSet = new Set(state.idsContactosSet);
        var backupTotal = state.totalContactos;

        state.contactos = state.contactos.filter(function (contacto) {
            return String(contacto.contacto_id) !==
                String(contactoIdDelContacto);
        });

        state.idsContactosSet.delete(contactoIdDelContacto);
        state.totalContactos = Math.max(0, state.totalContactos - 1);

        renderizarContactos();
        recalcularEstadisticas();

        try {
            var resultado = await client.rpc(
                CONFIG.RPC_ELIMINAR_AMISTAD,
                {
                    p_contacto_id: contactoIdDelContacto
                }
            );

            if (resultado.error) throw resultado.error;

            showToast('Contacto eliminado.', 'success');

            await cargarContactos({ reset: true });
            await cargarSolicitudesPendientesUI();
            await cargarSugerenciasUI();
        } catch (error) {
            console.error('[Contactos] Error eliminando contacto:', error);

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
       BLOQUEAR CONTACTO
       El servidor conserva la responsabilidad de limpiar la relación.
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
            message:
                '¿Quieres bloquear a este usuario? La acción se enviará al servidor.',
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

        state.contactos = state.contactos.filter(function (contacto) {
            return String(contacto.contacto_id) !== String(contactoId);
        });

        state.idsContactosSet.delete(contactoId);
        state.totalContactos = Math.max(0, state.totalContactos - 1);

        renderizarContactos();
        recalcularEstadisticas();

        try {
            var resultado = await withRetry(function () {
                return client.rpc(CONFIG.RPC_BLOQUEAR, {
                    p_contacto_id: contactoId
                });
            }, 'bloquear contacto');

            if (resultado.error) throw resultado.error;

            showToast('Usuario bloqueado.', 'success');

            await cargarContactos({ reset: true });
            await cargarSolicitudesPendientesUI();
            await cargarSugerenciasUI();
        } catch (error) {
            console.error('[Contactos] Error bloqueando contacto:', error);

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

    /* ============================================================
       MENSAJES Y LLAMADAS
       ============================================================ */

    function llamarContacto(contactoId) {
        if (!contactoId) return;

        window.location.href =
            '/features/mensajes/mensajes.html?usuario=' +
            encodeURIComponent(contactoId) +
            '&accion=llamada';
    }

    window.llamarContacto = llamarContacto;

    function abrirMensaje(contactoId) {
        if (!contactoId) return;

        window.location.href =
            '/features/mensajes/mensajes.html?usuario=' +
            encodeURIComponent(contactoId);
    }

    window.abrirMensaje = abrirMensaje;

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
        var codigoElemento = document.getElementById('codigoInvitacion');

        if (modal) {
            modal.classList.add('show', 'active');
            modal.setAttribute('aria-hidden', 'false');
        }

        if (codigoElemento) {
            codigoElemento.textContent = 'Generando código…';
        }

        try {
            var resultado = await withRetry(function () {
                return client.rpc(CONFIG.RPC_INVITACION);
            }, 'generar invitación');

            if (resultado.error) throw resultado.error;

            var invitacion = Array.isArray(resultado.data)
                ? resultado.data[0]
                : resultado.data;

            if (!invitacion || !invitacion.codigo) {
                throw new Error(
                    'Supabase no devolvió un código de invitación.'
                );
            }

            if (codigoElemento) {
                codigoElemento.textContent = String(invitacion.codigo);
            }
        } catch (error) {
            console.error('[Contactos] Error generando invitación:', error);

            if (codigoElemento) {
                codigoElemento.textContent = 'ERROR';
            }

            showToast('No se pudo generar la invitación.', 'error');
        }
    }

    window.invitarContacto = invitarContacto;

    async function copiarCodigoInvitacion() {
        var elemento = document.getElementById('codigoInvitacion');

        if (!elemento) return;

        var codigo = elemento.textContent.trim();

        if (
            !codigo ||
            codigo === 'Generando código…' ||
            codigo === 'ERROR'
        ) {
            return;
        }

        try {
            if (
                navigator.clipboard &&
                typeof navigator.clipboard.writeText === 'function'
            ) {
                await navigator.clipboard.writeText(codigo);
            } else {
                var temporal = document.createElement('textarea');

                temporal.value = codigo;
                temporal.setAttribute('readonly', '');
                temporal.style.position = 'fixed';
                temporal.style.opacity = '0';

                document.body.appendChild(temporal);
                temporal.select();

                var correcto = document.execCommand('copy');

                temporal.remove();

                if (!correcto) {
                    throw new Error('No se pudo copiar el código.');
                }
            }

            showToast('Código copiado.', 'success');
        } catch (error) {
            console.error('[Contactos] Error copiando código:', error);
            showToast('No se pudo copiar el código.', 'error');
        }
    }

    window.copiarCodigoInvitacion = copiarCodigoInvitacion;

    /* ============================================================
       ARRANQUE
       ============================================================ */

    function esperarSupabase() {
        var intentos = 0;
        var timer = setInterval(async function () {
            intentos++;

            if (sb()) {
                clearInterval(timer);

                configurarEventosTarjetas();
                await inicializarContactos();

                return;
            }

            if (intentos >= 100) {
                clearInterval(timer);

                console.error(
                    '[Contactos] Supabase no estuvo disponible a tiempo.'
                );

                mostrarEstadoVacio(
                    '⚠️',
                    'No se pudo inicializar la conexión. Recarga la página.'
                );

                emitirListo();
            }
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            esperarSupabase,
            { once: true }
        );
    } else {
        esperarSupabase();
    }
})();