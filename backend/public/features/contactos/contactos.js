/* ============================================================
   CSARIEL'S · CONTACTOS · v26.2
   ============================================================
   v26.2 (Correcciones de coherencia):
   - SEPARACIÓN ESTRICTA: Las "Sugerencias" ya no muestran a personas
     que ya son tus amigos. Solo muestran gente nueva para conectar.
   - FILTRO "EN LÍNEA": Ahora solo muestra a los amigos que están
     realmente conectados. Si no hay, muestra el estado vacío.
   - FILTRO "AMIGOS": Muestra a todos tus amigos aceptados.
   - ESTADO VACÍO: El botón "Buscar personas" ahora funciona
     correctamente cuando no hay resultados.
   ============================================================ */

(function () {
    'use strict';

    var CONFIG = {
        CONTACTOS_TABLE: 'contactos',
        BLOQUEOS_TABLE: 'bloqueos',
        PERFILES_RPC: 'perfiles_por_ids',
        RPC_BUSCAR_USUARIOS: 'buscar_usuarios',
        RPC_SUGERENCIAS: 'sugerencias_usuarios',
        RPC_BLOQUEAR: 'bloquear_contacto',
        RPC_INVITACION: 'obtener_o_crear_invitacion',
        RPC_RESPONDER_SOLICITUD: 'responder_solicitud_amistad',
        RPC_ELIMINAR_AMISTAD: 'eliminar_amistad',

        TITULO_SUGERENCIAS: 'Personas que puedes conocer',

        PERFIL_PUBLICO_URL: '/features/perfil/perfil-publico.html',
        MENSAJES_URL: '/features/mensajes/mensajes.html',

        PAGE_SIZE: 30,
        LOTE_PERFILES_MAX: 200,
        MAX_RESULTADOS_BUSQUEDA: 20,
        MAX_SUGERENCIAS: 10,
        MIN_CHARS_BUSQUEDA: 2,
        MAX_CHARS_BUSQUEDA: 80,

        SESSION_TIMEOUT_MS: 7000,
        RETRY_MAX: 3,
        RETRY_BASE_MS: 500,
        DEBOUNCE_BUSQUEDA_MS: 350
    };

    var state = {
        initialized: false,
        cargando: false,
        session: null,
        sessionExpira: 0,

        contactos: [],           // filas activas: { id, contacto_id, es_favorito, fecha }
        totalContactos: 0,
        paginaActual: 0,
        hayMas: true,

        pendientesRecibidas: [], // { id, usuario_id }
        pendientesEnviadas: [],  // { id, contacto_id }
        bloqueados: [],          // { bloqueado_id }

        filtroActual: 'todos',
        textoBusqueda: '',
        busquedaVersion: 0,
        observerScroll: null,

        perfiles: new Map(),
        idsContactosSet: new Set(), // Solo IDs de amigos ACEPTADOS
        operacionEnCurso: new Set()
    };

    var SVG = {
        mensaje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>',
        llamar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92Z"/></svg>',
        favorito: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="width:16px;height:16px;"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',
        favoritoOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',
        bloquear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><circle cx="12" cy="12" r="9"/><path d="m5.64 5.64 12.72 12.72"/></svg>',
        eliminar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
        agregarAmigo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M19 8v6"/><path d="M16 11h6"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    };

    /* ============================================================
       UTILIDADES
       ============================================================ */

    function sb() {
        return window.supabaseClient && typeof window.supabaseClient.from === 'function' ? window.supabaseClient : null;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function normalizarTextoBusqueda(value) {
        return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, CONFIG.MAX_CHARS_BUSQUEDA);
    }

    function obtenerAvatarSeguro(url) {
        if (!url) return '';
        var valor = String(url).trim();
        if (!valor) return '';
        try {
            if (valor.charAt(0) === '/' && valor.indexOf('//') !== 0) return valor;
            var parsed = new URL(valor, window.location.origin);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
            return parsed.href;
        } catch (error) { return ''; }
    }

    function obtenerInicial(nombre) {
        var texto = String(nombre || 'U').trim();
        return texto ? texto.charAt(0).toUpperCase() : 'U';
    }

    function handleLimpio(handle) {
        return handle ? '@' + String(handle).replace(/^@/, '') : '';
    }

    function detalleError(error) {
        if (!error) return 'error desconocido';
        var codigo = error.code ? error.code + ': ' : '';
        return codigo + (error.message || String(error));
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
        if (!toast) return;
        toast.textContent = String(mensaje || '');
        toast.className = 'toast';
        if (tipo) toast.classList.add(tipo);
        requestAnimationFrame(function () { toast.classList.add('show'); });
        clearTimeout(window.__contactosToastTimer);
        window.__contactosToastTimer = setTimeout(function () { toast.classList.remove('show'); }, 3500);
    }
    window.showToast = showToast;

    async function showConfirm(opciones) {
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

            if (opciones.danger === false) {
                confirmBtn.classList.remove('confirm-danger');
                confirmBtn.style.background = 'linear-gradient(135deg, #0F2D1A, #087F5B)';
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
            function cancelar() { finalizar(false); }
            function confirmar() { finalizar(true); }
            function clickFondo(e) { if (e.target === overlay) finalizar(false); }
            function teclaEscape(e) { if (e.key === 'Escape') finalizar(false); }

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
        if (state.session && ahora < state.sessionExpira) return state.session;
        var client = sb();
        if (!client || !client.auth) return null;
        try {
            var resultado = await Promise.race([
                client.auth.getSession(),
                new Promise(function (resolve) {
                    setTimeout(function () { resolve({ data: null, error: new Error('Timeout de sesión') }); }, CONFIG.SESSION_TIMEOUT_MS);
                })
            ]);
            if (resultado.error) {
                console.error('[Contactos] Sesión:', detalleError(resultado.error));
                return null;
            }
            state.session = resultado.data && resultado.data.session ? resultado.data.session : null;
            state.sessionExpira = ahora + 60000;
            return state.session;
        } catch (error) {
            console.error('[Contactos] Sesión:', detalleError(error));
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
                    if (err.code === '23505' || err.code === '42501' || err.code === 'PGRST116') return resultado;
                    throw err;
                }
                return resultado;
            } catch (error) {
                ultimoError = error;
                console.warn('[Contactos] Reintento ' + (intento + 1) + ' (' + contexto + '):', detalleError(error));
                if (intento === CONFIG.RETRY_MAX - 1) break;
                await new Promise(function (r) { setTimeout(r, CONFIG.RETRY_BASE_MS * Math.pow(2, intento)); });
            }
        }
        throw ultimoError;
    }

    /* ============================================================
       PERFILES: CACHÉ + LOTE
       ============================================================ */

    function normalizarPerfil(p) {
        return {
            id: p.id,
            nombre: p.nombre || null,
            handle: p.handle || null,
            avatar_url: obtenerAvatarSeguro(p.avatar_url),
            online: p.online === true,
            verificado: p.verificado === true,
            ultima_conexion: p.ultima_conexion || null
        };
    }

    async function cargarPerfiles(ids) {
        var resultado = { errores: [] };
        var client = sb();
        var unicos = Array.from(new Set((ids || []).filter(Boolean)));
        var faltantes = unicos.filter(function (id) { return !state.perfiles.has(id); });

        if (client && faltantes.length) {
            for (var i = 0; i < faltantes.length; i += CONFIG.LOTE_PERFILES_MAX) {
                var lote = faltantes.slice(i, i + CONFIG.LOTE_PERFILES_MAX);
                try {
                    var r = await withRetry(function () {
                        return client.rpc(CONFIG.PERFILES_RPC, { p_ids: lote });
                    }, 'perfiles por lote');
                    if (r.error) throw r.error;

                    var encontrados = new Set();
                    (r.data || []).forEach(function (p) {
                        state.perfiles.set(p.id, normalizarPerfil(p));
                        encontrados.add(p.id);
                    });
                    lote.forEach(function (id) {
                        if (!encontrados.has(id)) state.perfiles.set(id, null);
                    });
                } catch (error) {
                    resultado.errores.push(detalleError(error));
                    console.error('[Contactos] Perfiles por lote:', detalleError(error));
                }
            }
        }
        return resultado;
    }

    function datosPerfil(id) {
        var p = state.perfiles.get(id);
        if (p === undefined) return { nombre: 'No se pudo cargar', handle: '', avatar: '', estado: 'error', verificado: false, online: false };
        if (p === null) return { nombre: 'Perfil no disponible', handle: '', avatar: '', estado: 'no_encontrado', verificado: false, online: false };
        return {
            nombre: p.nombre || p.handle || 'Usuario',
            handle: handleLimpio(p.handle),
            avatar: p.avatar_url,
            estado: 'ok',
            verificado: p.verificado === true,
            online: p.online === true
        };
    }

    function avatarHtml(datos) {
        if (datos.avatar) {
            return '<img src="' + escapeHtml(datos.avatar) + '" alt="" loading="lazy">';
        }
        return escapeHtml(obtenerInicial(datos.nombre));
    }

    function avisoSeccion(seccion, mensaje, onRetry) {
        if (!seccion) return;
        var previo = seccion.querySelector('[data-aviso-contactos]');
        if (previo) previo.remove();

        var aviso = document.createElement('div');
        aviso.setAttribute('data-aviso-contactos', '1');
        aviso.setAttribute('role', 'alert');
        aviso.style.cssText = 'margin:8px 0;padding:10px 12px;border:1px solid rgba(255,51,102,.45);border-radius:10px;color:#ff8197;font-size:.72rem;line-height:1.5;overflow-wrap:anywhere;';

        var texto = document.createElement('span');
        texto.textContent = mensaje;
        aviso.appendChild(texto);

        if (typeof onRetry === 'function') {
            var boton = document.createElement('button');
            boton.type = 'button';
            boton.textContent = 'Reintentar';
            boton.style.cssText = 'margin-left:10px;padding:4px 10px;border:1px solid #ff8197;border-radius:8px;background:transparent;color:#ff8197;cursor:pointer;font-size:.7rem;';
            boton.addEventListener('click', onRetry);
            aviso.appendChild(boton);
        }
        seccion.insertBefore(aviso, seccion.children[1] || null);
    }

    function quitarAviso(seccion) {
        if (!seccion) return;
        var previo = seccion.querySelector('[data-aviso-contactos]');
        if (previo) previo.remove();
    }

    /* ============================================================
       REFRESCO ÚNICO
       ============================================================ */

    async function refrescarTodo(opciones) {
        opciones = opciones || {};
        var reset = opciones.reset !== false;
        var client = sb();
        var session = await getSession();
        if (!client || !session) {
            mostrarEstadoVacio('◈', 'Inicia sesión para ver tus contactos.');
            actualizarEstadisticas(0, 0);
            emitirListo();
            return;
        }
        if (state.cargando) return;
        state.cargando = true;

        var miId = session.user.id;
        var errores = { contactos: null, recibidas: null, enviadas: null, bloqueados: null };

        if (reset) {
            state.paginaActual = 0;
            state.contactos = [];
            state.hayMas = true;
            mostrarCargando();
        }

        try {
            var desde = state.paginaActual * CONFIG.PAGE_SIZE;
            var hasta = desde + CONFIG.PAGE_SIZE - 1;

            var consultas = await Promise.all([
                reset
                    ? withRetry(function () {
                        return client.from(CONFIG.CONTACTOS_TABLE).select('id', { count: 'exact', head: true })
                            .eq('usuario_id', miId).eq('estado', 'activo');
                    }, 'contar contactos').catch(function () { return { count: null }; })
                    : Promise.resolve(null),
                withRetry(function () {
                    return client.from(CONFIG.CONTACTOS_TABLE)
                        .select('id, usuario_id, contacto_id, es_favorito, estado, fecha, created_at')
                        .eq('usuario_id', miId).eq('estado', 'activo')
                        .order('fecha', { ascending: false, nullsFirst: false })
                        .range(desde, hasta);
                }, 'contactos'),
                withRetry(function () {
                    return client.from(CONFIG.CONTACTOS_TABLE)
                        .select('id, usuario_id, contacto_id')
                        .eq('contacto_id', miId).eq('estado', 'pendiente');
                }, 'solicitudes recibidas'),
                withRetry(function () {
                    return client.from(CONFIG.CONTACTOS_TABLE)
                        .select('id, usuario_id, contacto_id')
                        .eq('usuario_id', miId).eq('estado', 'pendiente');
                }, 'solicitudes enviadas'),
                withRetry(function () {
                    return client.from(CONFIG.BLOQUEOS_TABLE)
                        .select('id, bloqueado_id, created_at')
                        .eq('usuario_id', miId)
                        .order('created_at', { ascending: false });
                }, 'bloqueados')
            ]);

            var rConteo = consultas[0], rContactos = consultas[1], rRec = consultas[2], rEnv = consultas[3], rBloq = consultas[4];

            if (rConteo && !rConteo.error && rConteo.count != null) state.totalContactos = rConteo.count;

            errores.contactos = rContactos.error ? detalleError(rContactos.error) : null;
            errores.recibidas = rRec.error ? detalleError(rRec.error) : null;
            errores.enviadas = rEnv.error ? detalleError(rEnv.error) : null;
            errores.bloqueados = rBloq.error ? detalleError(rBloq.error) : null;

            var pagina = rContactos.error ? [] : (rContactos.data || []);
            if (!rRec.error) state.pendientesRecibidas = (rRec.data || []).map(function (s) { return { id: s.id, usuario_id: s.usuario_id }; });
            if (!rEnv.error) state.pendientesEnviadas = (rEnv.data || []).map(function (s) { return { id: s.id, contacto_id: s.contacto_id }; });
            if (!rBloq.error) state.bloqueados = (rBloq.data || []).map(function (b) { return { bloqueado_id: b.bloqueado_id }; });

            // IMPORTANTE: Solo los contactos ACEPTADOS (estado: 'activo') entran a este Set
            state.idsContactosSet = new Set(pagina.map(function (c) { return c.contacto_id; }).filter(Boolean));
            state.paginaActual = reset ? 1 : state.paginaActual + 1;
            state.hayMas = pagina.length === CONFIG.PAGE_SIZE;

            var nuevos = pagina.map(function (c) {
                return { id: c.id, contacto_id: c.contacto_id, es_favorito: c.es_favorito === true, fecha: c.fecha || c.created_at || null };
            });
            state.contactos = reset ? nuevos : state.contactos.concat(nuevos.filter(function (n) {
                return !state.contactos.some(function (e) { return String(e.id) === String(n.id); });
            }));

            var ids = [];
            state.contactos.forEach(function (c) { ids.push(c.contacto_id); });
            state.pendientesRecibidas.forEach(function (s) { ids.push(s.usuario_id); });
            state.pendientesEnviadas.forEach(function (s) { ids.push(s.contacto_id); });
            state.bloqueados.forEach(function (b) { ids.push(b.bloqueado_id); });
            var lote = await cargarPerfiles(ids);
            var errorPerfiles = lote.errores.length ? lote.errores[0] : null;

            recalcularEstadisticas();
            renderizarContactos(errores.contactos);
            renderizarPendientesRecibidas(errores.recibidas, errorPerfiles);
            renderizarPendientesEnviadas(errores.enviadas, errorPerfiles);
            renderizarBloqueados(errores.bloqueados, errorPerfiles);

            if (reset) cargarSugerencias();
            emitirListo();
        } catch (error) {
            console.error('[Contactos] Refresco:', detalleError(error));
            mostrarEstadoVacio('⚠️', 'Error cargando contactos: ' + detalleError(error));
            emitirListo();
        } finally {
            state.cargando = false;
            state.initialized = true;
        }
    }

    /* ============================================================
       RENDER: CONTACTOS (Filtros estrictos)
       ============================================================ */

    function renderizarContactos(errorConsulta) {
        var lista = document.getElementById('contactosList');
        if (!lista) return;

        if (errorConsulta) {
            lista.setAttribute('aria-busy', 'false');
            lista.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>Error cargando contactos: ' + escapeHtml(errorConsulta) + '</h3><button type="button" class="btn-accion" data-reintentar-contactos="1">Reintentar</button></div>';
            return;
        }

        var items = state.contactos.map(function (c) {
            var d = datosPerfil(c.contacto_id);
            return {
                id: c.id,
                contacto_id: c.contacto_id,
                es_favorito: c.es_favorito,
                fecha: c.fecha,
                nombre: d.nombre,
                handle: d.handle,
                avatar: d.avatar,
                online: d.online,
                verificado: d.verificado
            };
        });

        // APLICACIÓN ESTRICTA DE FILTROS
        if (state.filtroActual === 'online') {
            // Solo amigos que estén en línea
            items = items.filter(function (c) { return c.online === true; });
        }
        if (state.filtroActual === 'favoritos') {
            // Solo amigos marcados como favoritos
            items = items.filter(function (c) { return c.es_favorito === true; });
        }
        if (state.filtroActual === 'recientes') {
            // Ordenados por fecha, solo los últimos 10
            items = items.filter(function (c) { return Boolean(c.fecha); })
                .sort(function (a, b) { return new Date(b.fecha).getTime() - new Date(a.fecha).getTime(); })
                .slice(0, 10);
        }
        if (state.textoBusqueda) {
            var q = state.textoBusqueda;
            items = items.filter(function (c) {
                return c.nombre.toLowerCase().indexOf(q) !== -1 || c.handle.toLowerCase().indexOf(q) !== -1;
            });
        }

        // Estado vacío dinámico
        if (!items.length) {
            var msg = state.textoBusqueda ? 'No se encontraron contactos.'
                : state.filtroActual === 'online' ? 'No hay amigos conectados ahora.'
                : state.filtroActual === 'favoritos' ? 'Todavía no tienes amigos favoritos.'
                : 'Tu red está vacía. Busca personas para conectar.';
            mostrarEstadoVacio('🪐', msg);
            return;
        }

        lista.setAttribute('aria-busy', 'false');
        lista.innerHTML = items.map(tarjetaContacto).join('') +
            (state.hayMas && !state.textoBusqueda ? '<div id="cargandoMasSentinel" class="contactos-sentinel"></div>' : '');
        configurarScrollInfinito();
    }

    function tarjetaContacto(c) {
        var enLinea = c.online;
        var estadoTexto = enLinea ? 'En línea ahora' : 'Desconectado';
        var favClase = c.es_favorito ? 'active' : '';
        var favIcono = c.es_favorito ? SVG.favorito : SVG.favoritoOutline;
        var verificado = c.verificado ? '<span class="verified" title="Perfil verificado">✓</span>' : '';
        var avatar = c.avatar
            ? '<img class="contacto-avatar-img" src="' + escapeHtml(c.avatar) + '" alt="' + escapeHtml(c.nombre) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add(\'avatar-image-error\')"><span class="avatar-fallback avatar-fallback-hidden">' + escapeHtml(obtenerInicial(c.nombre)) + '</span>'
            : '<span class="avatar-fallback">' + escapeHtml(obtenerInicial(c.nombre)) + '</span>';

        return '<article class="contacto-card" data-contacto-id="' + escapeHtml(c.contacto_id) + '" data-fila-id="' + escapeHtml(c.id) + '" tabindex="0" role="button" aria-label="Abrir conversación con ' + escapeHtml(c.nombre) + '">' +
            '<div class="contacto-avatar ' + (enLinea ? 'online' : 'offline') + '" role="button" tabindex="0" aria-label="Ver perfil de ' + escapeHtml(c.nombre) + '">' +
                avatar +
                '<span class="online-dot ' + (enLinea ? 'visible' : 'hidden') + '"></span>' +
                (c.es_favorito ? '<span class="favorito-badge" aria-hidden="true">★</span>' : '') +
            '</div>' +
            '<div class="contacto-info">' +
                '<div class="nombre">' + escapeHtml(c.nombre) + ' ' + verificado + '</div>' +
                '<div class="estado ' + (enLinea ? 'online' : 'offline') + '"><span class="estado-indicador"></span> ' + escapeHtml(estadoTexto) + '</div>' +
                (c.handle ? '<div class="contacto-meta">' + escapeHtml(c.handle) + '</div>' : '') +
            '</div>' +
            '<div class="contacto-actions">' +
                '<button type="button" class="mensaje" data-accion="mensaje" aria-label="Enviar mensaje">' + SVG.mensaje + '<span>Mensaje</span></button>' +
                '<button type="button" class="llamar" data-accion="llamar" aria-label="Llamar">' + SVG.llamar + '</button>' +
                '<button type="button" class="favorito ' + favClase + '" data-accion="favorito" aria-label="Cambiar favorito">' + favIcono + '</button>' +
                '<button type="button" class="bloquear" data-accion="bloquear" aria-label="Bloquear">' + SVG.bloquear + '</button>' +
                '<button type="button" class="eliminar" data-accion="eliminar" aria-label="Eliminar">' + SVG.eliminar + '</button>' +
            '</div>' +
        '</article>';
    }

    /* ============================================================
       RENDER: SOLICITUDES Y BLOQUEADOS
       ============================================================ */

    function renderizarPendientesRecibidas(errorConsulta, errorPerfiles) {
        var seccion = document.getElementById('solicitudesPendientesSection');
        var contenedor = document.getElementById('solicitudesPendientesLista');
        var contador = document.getElementById('solicitudesContador');
        if (!seccion || !contenedor || !contador) return;

        quitarAviso(seccion);
        if (errorConsulta) {
            seccion.style.display = 'block';
            contenedor.innerHTML = '';
            avisoSeccion(seccion, 'No se pudieron cargar las solicitudes recibidas: ' + errorConsulta, refrescarTodoReset);
            return;
        }

        var lista = state.pendientesRecibidas;
        if (!lista.length) { seccion.style.display = 'none'; contenedor.innerHTML = ''; return; }

        seccion.style.display = 'block';
        contador.textContent = String(lista.length);

        contenedor.innerHTML = lista.map(function (s) {
            var d = datosPerfil(s.usuario_id);
            return '<div class="solicitud-card">' +
                '<div class="avatar">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + escapeHtml(d.nombre) + '</div><div class="handle">' + escapeHtml(d.handle) + '</div></div>' +
                '<div class="acciones">' +
                    '<button type="button" class="btn-aceptar" data-solicitud-aceptar="' + escapeHtml(s.id) + '" data-usuario-id="' + escapeHtml(s.usuario_id) + '">Aceptar</button>' +
                    '<button type="button" class="btn-rechazar" data-solicitud-rechazar="' + escapeHtml(s.id) + '">Rechazar</button>' +
                '</div>' +
            '</div>';
        }).join('');

        if (errorPerfiles) avisoSeccion(seccion, 'Algunos nombres no se pudieron cargar: ' + errorPerfiles, refrescarTodoReset);
    }

    function renderizarPendientesEnviadas(errorConsulta, errorPerfiles) {
        var seccion = document.getElementById('solicitudesEnviadasSection');
        var contenedor = document.getElementById('solicitudesEnviadasLista');
        var contador = document.getElementById('solicitudesEnviadasContador');
        if (!seccion || !contenedor || !contador) return;

        quitarAviso(seccion);
        if (errorConsulta) {
            seccion.style.display = 'block';
            contenedor.innerHTML = '';
            avisoSeccion(seccion, 'No se pudieron cargar las solicitudes enviadas: ' + errorConsulta, refrescarTodoReset);
            return;
        }

        var lista = state.pendientesEnviadas;
        if (!lista.length) { seccion.style.display = 'none'; contenedor.innerHTML = ''; return; }

        seccion.style.display = 'block';
        contador.textContent = String(lista.length);

        contenedor.innerHTML = lista.map(function (s) {
            var d = datosPerfil(s.contacto_id);
            var reintentar = d.estado === 'error'
                ? '<button type="button" class="btn-reintentar-perfil" data-reintentar-perfil="' + escapeHtml(s.contacto_id) + '">Reintentar</button>'
                : '';
            return '<div class="solicitud-enviada-card">' +
                '<div class="avatar">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + escapeHtml(d.nombre) + '</div><div class="handle">' + escapeHtml(d.handle) + '</div></div>' +
                '<div class="acciones">' + reintentar +
                    '<button type="button" class="btn-cancelar-envio" data-solicitud-cancelar="' + escapeHtml(s.id) + '">Cancelar envío</button>' +
                '</div>' +
            '</div>';
        }).join('');

        if (errorPerfiles) avisoSeccion(seccion, 'Algunos nombres no se pudieron cargar: ' + errorPerfiles, refrescarTodoReset);
    }

    function renderizarBloqueados(errorConsulta, errorPerfiles) {
        var seccion = document.getElementById('bloqueadosSection');
        var contenedor = document.getElementById('bloqueadosLista');
        var contador = document.getElementById('bloqueadosContador');
        if (!seccion || !contenedor || !contador) return;

        quitarAviso(seccion);
        if (errorConsulta) {
            seccion.style.display = 'block';
            contenedor.innerHTML = '';
            avisoSeccion(seccion, 'No se pudieron cargar los bloqueados: ' + errorConsulta, refrescarTodoReset);
            return;
        }

        var lista = state.bloqueados;
        if (!lista.length) { seccion.style.display = 'none'; contenedor.innerHTML = ''; return; }

        seccion.style.display = 'block';
        contador.textContent = String(lista.length);

        contenedor.innerHTML = lista.map(function (b) {
            var d = datosPerfil(b.bloqueado_id);
            return '<div class="bloqueado-card">' +
                '<div class="avatar">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + escapeHtml(d.nombre) + '</div><div class="handle">' + escapeHtml(d.handle) + '</div></div>' +
                '<div class="acciones"><button type="button" class="btn-desbloquear" data-bloqueado-desbloquear="' + escapeHtml(b.bloqueado_id) + '">Desbloquear</button></div>' +
            '</div>';
        }).join('');

        if (errorPerfiles) avisoSeccion(seccion, 'Algunos nombres no se pudieron cargar: ' + errorPerfiles, refrescarTodoReset);
    }

    function refrescarTodoReset() {
        refrescarTodo({ reset: true });
    }

    /* ============================================================
       PERSONAS ACTIVAS (Sugerencias)
       ============================================================ */

    async function cargarSugerencias() {
        var client = sb();
        var session = await getSession();
        var seccion = document.getElementById('sugerenciasSection');
        var contenedor = document.getElementById('sugerenciasLista');
        if (!client || !session || !seccion || !contenedor) return;

        var titulo = seccion.querySelector('.hud-section-title');
        if (titulo) titulo.textContent = CONFIG.TITULO_SUGERENCIAS;

        quitarAviso(seccion);
        try {
            var r = await withRetry(function () {
                return client.rpc(CONFIG.RPC_SUGERENCIAS, { p_limit: CONFIG.MAX_SUGERENCIAS });
            }, 'personas activas');
            if (r.error) throw r.error;

            var crudo = Array.isArray(r.data) ? r.data : [];
            
            // FILTRO CRÍTICO: Eliminar a los que ya son amigos (están en idsContactosSet)
            var sugeridos = crudo.filter(function (u) { 
                return u && u.id && !state.idsContactosSet.has(u.id); 
            }).slice(0, CONFIG.MAX_SUGERENCIAS);

            sugeridos.forEach(function (u) {
                if (!state.perfiles.has(u.id)) state.perfiles.set(u.id, normalizarPerfil(u));
            });

            if (!sugeridos.length) { seccion.style.display = 'none'; contenedor.innerHTML = ''; return; }
            seccion.style.display = 'block';

            contenedor.innerHTML = sugeridos.map(function (u) {
                var d = datosPerfil(u.id);
                var estado = d.online ? '<span class="estado online">● En línea</span>' : '<span class="estado">Desconectado</span>';
                var enComun = Number(u.contactos_en_comun) || 0;
                var nota = enComun > 0
                    ? '<div class="handle">' + enComun + (enComun === 1 ? ' contacto en común' : ' contactos en común') + '</div>'
                    : '';
                return '<div class="sugerencia-card">' +
                    '<div class="avatar ' + (d.online ? 'online' : '') + '">' + avatarHtml(d) + '</div>' +
                    '<div class="info">' +
                        '<div class="nombre">' + escapeHtml(d.nombre) + (d.verificado ? ' <span class="verified">✓</span>' : '') + '</div>' +
                        '<div class="handle">' + escapeHtml(d.handle) + '</div>' +
                        nota + estado +
                    '</div>' +
                    '<div class="acciones"><button type="button" class="btn-agregar-sugerencia" data-sugerencia-agregar="' + escapeHtml(u.id) + '">Conectar</button></div>' +
                '</div>';
            }).join('');
        } catch (error) {
            console.error('[Contactos] Personas activas:', detalleError(error));
            seccion.style.display = 'block';
            contenedor.innerHTML = '';
            avisoSeccion(seccion, 'No se pudieron cargar las personas activas: ' + detalleError(error), cargarSugerencias);
        }
    }

    /* ============================================================
       ESTADÍSTICAS Y ESTADOS
       ============================================================ */

    function recalcularEstadisticas() {
        var total = Math.max(state.totalContactos, state.contactos.length);
        var online = state.contactos.filter(function (c) {
            var p = state.perfiles.get(c.contacto_id);
            return p && p.online === true;
        }).length;
        actualizarEstadisticas(total, online);
    }

    function actualizarEstadisticas(total, online) {
        var tEl = document.getElementById('totalContactos'); if (tEl) tEl.textContent = String(total || 0);
        var oEl = document.getElementById('onlineContactos'); if (oEl) oEl.textContent = String(online || 0);
    }

    function mostrarCargando() {
        var lista = document.getElementById('contactosList');
        if (!lista) return;
        lista.setAttribute('aria-busy', 'true');
        lista.innerHTML = Array(4).fill('').map(function () {
            return '<div class="contacto-card skeleton"><div class="contacto-avatar skeleton-avatar"></div><div class="contacto-info skeleton-info"><div class="skeleton-line skeleton-line-name"></div><div class="skeleton-line skeleton-line-meta"></div></div></div>';
        }).join('');
    }

    function mostrarEstadoVacio(icono, mensaje) {
        var lista = document.getElementById('contactosList');
        if (!lista) return;
        lista.setAttribute('aria-busy', 'false');
        
        // Usamos el empty-state que ya está en el HTML
        var emptyState = document.getElementById('contactosEmptyState');
        if (!emptyState) {
            lista.innerHTML = '<div class="empty-state" id="contactosEmptyState"><div class="icon" aria-hidden="true">' + escapeHtml(icono) + '</div><h3>' + escapeHtml(mensaje) + '</h3><button type="button" class="btn-accion" data-contactos-action="agregar">' + SVG.agregarAmigo + ' Buscar personas</button></div>';
            return;
        }

        var title = emptyState.querySelector('h3');
        var iconEl = emptyState.querySelector('.icon') || emptyState.querySelector('.planeta-busqueda');
        var btn = emptyState.querySelector('.btn-buscar-empty');

        if (title) title.textContent = mensaje;
        if (iconEl) iconEl.textContent = icono;
        
        // Mostrar botón solo si no hay contactos y no estamos buscando
        if (btn) {
            btn.style.display = (state.contactos.length === 0 && !state.textoBusqueda) ? 'inline-flex' : 'none';
        }

        emptyState.style.display = 'block';
    }

    function configurarScrollInfinito() {
        if (state.observerScroll) { state.observerScroll.disconnect(); state.observerScroll = null; }
        var sentinel = document.getElementById('cargandoMasSentinel');
        if (!sentinel || !('IntersectionObserver' in window)) return;
        state.observerScroll = new IntersectionObserver(function (entries) {
            if (entries[0] && entries[0].isIntersecting && state.hayMas && !state.cargando && !state.textoBusqueda) {
                refrescarTodo({ reset: false });
            }
        }, { rootMargin: '300px', threshold: 0 });
        state.observerScroll.observe(sentinel);
    }

    /* ============================================================
       BÚSQUEDA GLOBAL
       ============================================================ */

    async function buscarUsuariosGlobal(texto, version) {
        var client = sb();
        var session = await getSession();
        var lista = document.getElementById('contactosList');
        if (!client || !session || !lista) return;

        lista.innerHTML = '<div class="contactos-loading-more">🔍 Buscando en Csariel\'s…</div>';
        try {
            var r = await withRetry(function () {
                return client.rpc(CONFIG.RPC_BUSCAR_USUARIOS, { p_query: texto });
            }, 'buscar usuarios');
            if (version !== state.busquedaVersion) return;
            if (r.error) throw r.error;

            var crudo = Array.isArray(r.data) ? r.data : [];
            var usuarios = crudo.filter(function (u) { return u && u.id && u.id !== session.user.id; });
            usuarios.forEach(function (u) { state.perfiles.set(u.id, normalizarPerfil(u)); });

            if (!usuarios.length) {
                lista.innerHTML = '<div class="empty-state"><div class="icon">🛸</div><h3>No se encontraron usuarios.</h3></div>';
                return;
            }

            lista.innerHTML = usuarios.map(function (u) {
                var d = datosPerfil(u.id);
                var yaEsContacto = state.idsContactosSet.has(u.id);
                var boton = yaEsContacto
                    ? '<button type="button" class="btn-agregar" disabled style="background:rgba(0,214,143,.1);border:1px solid var(--success);color:var(--success);cursor:default;">' + SVG.check + ' Agregado</button>'
                    : '<button type="button" class="btn-agregar" data-agregar-id="' + escapeHtml(u.id) + '" style="background:linear-gradient(135deg, var(--cyan), #0055ff);border:0;color:#fff;">' + SVG.agregarAmigo + ' Agregar</button>';
                return '<article class="contacto-card" tabindex="0">' +
                    '<div class="contacto-avatar">' + (d.avatar ? '<img class="contacto-avatar-img" src="' + escapeHtml(d.avatar) + '" alt="">' : '<span class="avatar-fallback">' + escapeHtml(obtenerInicial(d.nombre)) + '</span>') + '</div>' +
                    '<div class="contacto-info"><div class="nombre">' + escapeHtml(d.nombre) + (d.verificado ? ' <span class="verified">✓</span>' : '') + '</div>' +
                    '<div class="contacto-meta">' + escapeHtml(d.handle) + '</div></div>' +
                    '<div class="contacto-actions">' + boton + '</div>' +
                '</article>';
            }).join('');
        } catch (error) {
            console.error('[Contactos] Búsqueda global:', detalleError(error));
            lista.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>Error al buscar: ' + escapeHtml(detalleError(error)) + '</h3></div>';
        }
    }

    /* ============================================================
       ACCIONES
       ============================================================ */

    async function agregarContacto(contactoId) {
        var client = sb();
        var session = await getSession();
        if (!client || !session) { showToast('Inicia sesión.', 'error'); return; }
        if (!contactoId) return;
        if (contactoId === session.user.id) { showToast('No puedes agregarte.', 'warning'); return; }
        if (state.idsContactosSet.has(contactoId)) { showToast('Ya está en tus contactos.', 'warning'); return; }

        var clave = 'agregar:' + contactoId;
        if (state.operacionEnCurso.has(clave)) return;
        state.operacionEnCurso.add(clave);

        try {
            var r = await withRetry(function () {
                return client.from(CONFIG.CONTACTOS_TABLE).insert({ usuario_id: session.user.id, contacto_id: contactoId, estado: 'pendiente', es_favorito: false });
            }, 'enviar solicitud');
            if (r.error) {
                if (r.error.code === '23505') { showToast('Ya enviaste solicitud.', 'warning'); return; }
                throw r.error;
            }
            showToast('Solicitud enviada.', 'success');
            limpiarBusquedaModal();
            var inputGlobal = document.getElementById('searchInput'); if (inputGlobal) inputGlobal.value = '';
            state.textoBusqueda = '';
            await refrescarTodo({ reset: true });
        } catch (error) {
            console.error('[Contactos] Agregando:', detalleError(error));
            showToast('No se pudo enviar: ' + detalleError(error), 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    async function aceptarSolicitud(filaId) {
        var fila = Number(filaId);
        if (!Number.isInteger(fila) || fila <= 0) { showToast('ID inválido.', 'error'); return; }
        var clave = 'aceptar:' + fila;
        if (state.operacionEnCurso.has(clave)) return;
        state.operacionEnCurso.add(clave);
        try {
            var r = await sb().rpc(CONFIG.RPC_RESPONDER_SOLICITUD, { p_fila_id: fila, p_aceptar: true });
            if (r.error) throw r.error;
            showToast('Amistad aceptada.', 'success');
            await refrescarTodo({ reset: true });
        } catch (error) {
            console.error('[Contactos] Aceptando:', detalleError(error));
            showToast('Error al aceptar: ' + detalleError(error), 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    async function rechazarSolicitud(filaId) {
        var fila = Number(filaId);
        if (!Number.isInteger(fila) || fila <= 0) { showToast('ID inválido.', 'error'); return; }
        var clave = 'rechazar:' + fila;
        if (state.operacionEnCurso.has(clave)) return;
        state.operacionEnCurso.add(clave);
        try {
            var r = await sb().rpc(CONFIG.RPC_RESPONDER_SOLICITUD, { p_fila_id: fila, p_aceptar: false });
            if (r.error) throw r.error;
            showToast('Solicitud rechazada.', 'success');
            await refrescarTodo({ reset: true });
        } catch (error) {
            console.error('[Contactos] Rechazando:', detalleError(error));
            showToast('Error al rechazar: ' + detalleError(error), 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    async function cancelarSolicitudEnviada(filaId) {
        var client = sb();
        var session = await getSession();
        if (!client || !session) { showToast('Inicia sesión.', 'error'); return; }
        var confirmado = await showConfirm({ title: 'Cancelar solicitud', message: '¿Retirar solicitud de amistad?', icon: '↩️', confirmText: 'Retirar', cancelText: 'Volver', danger: true });
        if (!confirmado) return;
        var clave = 'cancelar:' + filaId;
        if (state.operacionEnCurso.has(clave)) return;
        state.operacionEnCurso.add(clave);
        try {
            var r = await client.from(CONFIG.CONTACTOS_TABLE).delete().eq('id', filaId).eq('usuario_id', session.user.id).eq('estado', 'pendiente');
            if (r.error) throw r.error;
            showToast('Solicitud retirada.', 'success');
            await refrescarTodo({ reset: true });
        } catch (error) {
            console.error('[Contactos] Cancelando:', detalleError(error));
            showToast('Error al cancelar: ' + detalleError(error), 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    async function toggleFavorito(filaId, nuevoValor) {
        var client = sb();
        var session = await getSession();
        if (!client || !session) return;
        var item = state.contactos.find(function (c) { return String(c.id) === String(filaId); });
        if (!item) return;
        var anterior = item.es_favorito;
        var clave = 'favorito:' + String(filaId);
        if (state.operacionEnCurso.has(clave)) return;
        state.operacionEnCurso.add(clave);
        item.es_favorito = nuevoValor === true;
        renderizarContactos(null);
        try {
            var r = await withRetry(function () {
                return client.from(CONFIG.CONTACTOS_TABLE).update({ es_favorito: item.es_favorito }).eq('id', filaId).eq('usuario_id', session.user.id);
            }, 'favorito');
            if (r.error) throw r.error;
            showToast(item.es_favorito ? 'Favorito guardado.' : 'Favorito quitado.', 'success');
        } catch (error) {
            console.error('[Contactos] Favorito:', detalleError(error));
            item.es_favorito = anterior;
            renderizarContactos(null);
            showToast('Error al guardar favorito: ' + detalleError(error), 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    async function eliminarContacto(contactoId) {
        var session = await getSession();
        if (!session) { showToast('Inicia sesión.', 'error'); return; }
        var confirmado = await showConfirm({ title: 'Eliminar contacto', message: '¿Eliminar a este contacto de tu red?', icon: '🗑️', confirmText: 'Eliminar', cancelText: 'Cancelar', danger: true });
        if (!confirmado) return;
        var clave = 'eliminar:' + contactoId;
        if (state.operacionEnCurso.has(clave)) return;
        state.operacionEnCurso.add(clave);
        try {
            var r = await sb().rpc(CONFIG.RPC_ELIMINAR_AMISTAD, { p_contacto_id: contactoId });
            if (r.error) throw r.error;
            showToast('Contacto eliminado.', 'success');
            await refrescarTodo({ reset: true });
        } catch (error) {
            console.error('[Contactos] Eliminando:', detalleError(error));
            showToast('Error al eliminar: ' + detalleError(error), 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    async function bloquearContacto(contactoId) {
        var session = await getSession();
        if (!session) { showToast('Inicia sesión.', 'error'); return; }
        if (contactoId === session.user.id) { showToast('No puedes bloquearte.', 'warning'); return; }
        var confirmado = await showConfirm({ title: 'Bloquear usuario', message: '¿Bloquear a este usuario? No podrá llamarte ni escribirte.', icon: '⛔', confirmText: 'Bloquear', cancelText: 'Cancelar', danger: true });
        if (!confirmado) return;
        var clave = 'bloquear:' + contactoId;
        if (state.operacionEnCurso.has(clave)) return;
        state.operacionEnCurso.add(clave);
        try {
            var r = await withRetry(function () { return sb().rpc(CONFIG.RPC_BLOQUEAR, { p_contacto_id: contactoId }); }, 'bloquear');
            if (r.error) throw r.error;
            showToast('Usuario bloqueado.', 'success');
            await refrescarTodo({ reset: true });
        } catch (error) {
            console.error('[Contactos] Bloqueando:', detalleError(error));
            showToast('Error al bloquear: ' + detalleError(error), 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    async function desbloquearContacto(bloqueadoId) {
        var client = sb();
        var session = await getSession();
        if (!client || !session) return;
        var confirmado = await showConfirm({ title: 'Desbloquear usuario', message: '¿Permitir que este usuario te contacte de nuevo?', icon: '🔓', confirmText: 'Desbloquear', cancelText: 'Cancelar', danger: false });
        if (!confirmado) return;
        var clave = 'desbloquear:' + bloqueadoId;
        if (state.operacionEnCurso.has(clave)) return;
        state.operacionEnCurso.add(clave);
        try {
            var r = await withRetry(function () {
                return client.from(CONFIG.BLOQUEOS_TABLE).delete().eq('usuario_id', session.user.id).eq('bloqueado_id', bloqueadoId);
            }, 'desbloquear');
            if (r.error) throw r.error;
            showToast('Usuario desbloqueado.', 'success');
            await refrescarTodo({ reset: true });
        } catch (error) {
            console.error('[Contactos] Desbloqueando:', detalleError(error));
            showToast('Error al desbloquear: ' + detalleError(error), 'error');
        } finally {
            state.operacionEnCurso.delete(clave);
        }
    }

    function reintentarPerfil(id) {
        state.perfiles.delete(id);
        refrescarTodo({ reset: true });
    }

    function abrirMensaje(contactoId) {
        if (!contactoId) return;
        window.location.href = CONFIG.MENSAJES_URL + '?usuario=' + encodeURIComponent(contactoId);
    }

    function llamarContacto(contactoId) {
        if (!contactoId) return;
        window.location.href = CONFIG.MENSAJES_URL + '?usuario=' + encodeURIComponent(contactoId) + '&accion=llamada';
    }

    function abrirPerfil(contactoId) {
        var p = state.perfiles.get(contactoId);
        if (!p || !p.handle) { showToast('Perfil no disponible.', 'warning'); return; }
        window.location.href = CONFIG.PERFIL_PUBLICO_URL + '?u=' + encodeURIComponent(p.handle);
    }

    /* ============================================================
       MODALES Y BÚSQUEDA
       ============================================================ */

    function abrirAgregarContacto() {
        var modal = document.getElementById('modalBuscarContacto');
        if (!modal) return;
        modal.classList.add('show', 'active');
        modal.setAttribute('aria-hidden', 'false');
        var input = document.getElementById('searchInputModal');
        if (input) { input.value = ''; setTimeout(function () { input.focus(); }, 100); }
        var res = document.getElementById('resultadosBusqueda');
        if (res) res.innerHTML = '<div class="busqueda-mensaje">Escribe un nombre, @handle, correo o teléfono.</div>';
    }

    function cerrarModalBuscar() {
        var modal = document.getElementById('modalBuscarContacto');
        if (!modal) return;
        modal.classList.remove('show', 'active');
        modal.setAttribute('aria-hidden', 'true');
    }

    function cerrarModalInvitacion() {
        var modal = document.getElementById('modalInvitacion');
        if (!modal) return;
        modal.classList.remove('show', 'active');
        modal.setAttribute('aria-hidden', 'true');
    }

    function limpiarBusquedaModal() {
        var input = document.getElementById('searchInputModal'); if (input) input.value = '';
        var res = document.getElementById('resultadosBusqueda'); if (res) res.innerHTML = '';
        cerrarModalBuscar();
    }

    async function buscarEnModal(texto, version) {
        var client = sb();
        var session = await getSession();
        var res = document.getElementById('resultadosBusqueda');
        if (!res) return;
        if (!client || !session) { res.innerHTML = '<div class="busqueda-mensaje">Inicia sesión para buscar.</div>'; return; }

        var termino = normalizarTextoBusqueda(texto).replace(/^@+/, '').trim();
        if (termino.length < CONFIG.MIN_CHARS_BUSQUEDA) { res.innerHTML = '<div class="busqueda-mensaje">Escribe al menos 2 caracteres.</div>'; return; }

        try {
            var r = await withRetry(function () { return client.rpc(CONFIG.RPC_BUSCAR_USUARIOS, { p_query: termino }); }, 'buscar en modal');
            if (version !== state.busquedaVersion) return;
            if (r.error) throw r.error;

            var usuarios = (Array.isArray(r.data) ? r.data : []).filter(function (u) {
                return u && u.id && u.id !== session.user.id && !state.idsContactosSet.has(u.id);
            }).slice(0, CONFIG.MAX_RESULTADOS_BUSQUEDA);

            usuarios.forEach(function (u) { state.perfiles.set(u.id, normalizarPerfil(u)); });

            if (!usuarios.length) { res.innerHTML = '<div class="busqueda-mensaje">No se encontraron usuarios disponibles.</div>'; return; }

            res.innerHTML = usuarios.map(function (u) {
                var d = datosPerfil(u.id);
                return '<div class="resultado-usuario">' +
                    '<div class="avatar">' + avatarHtml(d) + '</div>' +
                    '<div class="resultado-info"><div class="resultado-nombre">' + escapeHtml(d.nombre) + (d.verificado ? ' <span class="verified">✓</span>' : '') + '</div>' +
                    '<div class="resultado-handle">' + escapeHtml(d.handle) + '</div></div>' +
                    '<button type="button" class="btn-agregar" data-agregar-id="' + escapeHtml(u.id) + '">' + SVG.agregarAmigo + ' Conectar</button>' +
                '</div>';
            }).join('');
        } catch (error) {
            console.error('[Contactos] Buscando en modal:', detalleError(error));
            res.innerHTML = '<div class="busqueda-mensaje">Error al buscar: ' + escapeHtml(detalleError(error)) + '</div>';
        }
    }

    async function invitarContacto() {
        var client = sb();
        var session = await getSession();
        if (!client || !session) { showToast('Inicia sesión.', 'error'); return; }
        var modal = document.getElementById('modalInvitacion');
        var codigoEl = document.getElementById('codigoInvitacion');
        if (modal) { modal.classList.add('show', 'active'); modal.setAttribute('aria-hidden', 'false'); }
        if (codigoEl) codigoEl.textContent = 'Generando…';
        try {
            var r = await withRetry(function () { return client.rpc(CONFIG.RPC_INVITACION); }, 'invitar');
            if (r.error) throw r.error;
            var inv = Array.isArray(r.data) ? r.data[0] : r.data;
            if (!inv || !inv.codigo) throw new Error('El servidor no devolvió un código');
            if (codigoEl) codigoEl.textContent = String(inv.codigo);
        } catch (error) {
            console.error('[Contactos] Invitación:', detalleError(error));
            if (codigoEl) codigoEl.textContent = 'ERROR';
            showToast('Error al generar invitación: ' + detalleError(error), 'error');
        }
    }

    async function copiarCodigoInvitacion() {
        var el = document.getElementById('codigoInvitacion');
        if (!el) return;
        var cod = el.textContent.trim();
        if (!cod || cod === 'Generando…' || cod === 'ERROR') return;
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(cod);
            } else {
                var tmp = document.createElement('textarea');
                tmp.value = cod; tmp.setAttribute('readonly', ''); tmp.style.position = 'fixed'; tmp.style.opacity = '0';
                document.body.appendChild(tmp); tmp.select();
                var ok = document.execCommand('copy'); tmp.remove();
                if (!ok) throw new Error('execCommand copy devolvió false');
            }
            showToast('Código copiado.', 'success');
        } catch (error) {
            console.error('[Contactos] Copiar:', detalleError(error));
            showToast('No se pudo copiar: ' + detalleError(error), 'error');
        }
    }

    /* ============================================================
       EVENTOS
       ============================================================ */

    function configurarEventos() {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(function (event) {
                var texto = normalizarTextoBusqueda(event.target.value);
                state.textoBusqueda = texto.toLowerCase();
                if (texto.length >= CONFIG.MIN_CHARS_BUSQUEDA) {
                    var v = ++state.busquedaVersion;
                    buscarUsuariosGlobal(texto, v);
                } else {
                    renderizarContactos(null);
                }
            }, CONFIG.DEBOUNCE_BUSQUEDA_MS));
        }

        var modalInput = document.getElementById('searchInputModal');
        if (modalInput) {
            modalInput.addEventListener('input', debounce(function (event) {
                var v = ++state.busquedaVersion;
                buscarEnModal(event.target.value, v);
            }, CONFIG.DEBOUNCE_BUSQUEDA_MS));
        }

        document.querySelectorAll('.filtros .filtro').forEach(function (boton) {
            boton.addEventListener('click', function () {
                document.querySelectorAll('.filtros .filtro').forEach(function (item) {
                    item.classList.remove('active');
                    item.setAttribute('aria-pressed', 'false');
                });
                boton.classList.add('active');
                boton.setAttribute('aria-pressed', 'true');
                state.filtroActual = boton.dataset.filtro || 'todos';
                renderizarContactos(null);
            });
        });

        var lista = document.getElementById('contactosList');
        if (lista) {
            lista.addEventListener('click', function (event) {
                var reintentarLista = event.target.closest('[data-reintentar-contactos]');
                if (reintentarLista) { refrescarTodo({ reset: true }); return; }

                var vacio = event.target.closest('[data-contactos-action="agregar"]');
                if (vacio) { abrirAgregarContacto(); return; }

                var agregar = event.target.closest('[data-agregar-id]');
                if (agregar) { agregarContacto(agregar.getAttribute('data-agregar-id')); return; }

                var tarjeta = event.target.closest('.contacto-card[data-contacto-id]');
                if (!tarjeta) return;
                var contactoId = tarjeta.getAttribute('data-contacto-id');
                var filaId = tarjeta.getAttribute('data-fila-id');

                var boton = event.target.closest('[data-accion]');
                if (boton) {
                    event.preventDefault(); event.stopPropagation();
                    var accion = boton.getAttribute('data-accion');
                    if (accion === 'mensaje') abrirMensaje(contactoId);
                    if (accion === 'llamar') llamarContacto(contactoId);
                    if (accion === 'favorito') {
                        var item = state.contactos.find(function (c) { return String(c.id) === String(filaId); });
                        if (item) toggleFavorito(filaId, item.es_favorito !== true);
                    }
                    if (accion === 'bloquear') bloquearContacto(contactoId);
                    if (accion === 'eliminar') eliminarContacto(contactoId);
                    return;
                }

                if (event.target.closest('.contacto-avatar')) { abrirPerfil(contactoId); return; }
                abrirMensaje(contactoId);
            });
        }

        document.addEventListener('click', function (event) {
            var t = event.target;

            var aceptar = t.closest('[data-solicitud-aceptar]');
            if (aceptar) { aceptarSolicitud(aceptar.getAttribute('data-solicitud-aceptar')); return; }

            var rechazar = t.closest('[data-solicitud-rechazar]');
            if (rechazar) { rechazarSolicitud(rechazar.getAttribute('data-solicitud-rechazar')); return; }

            var cancelar = t.closest('[data-solicitud-cancelar]');
            if (cancelar) { cancelarSolicitudEnviada(cancelar.getAttribute('data-solicitud-cancelar')); return; }

            var reint = t.closest('[data-reintentar-perfil]');
            if (reint) { reintentarPerfil(reint.getAttribute('data-reintentar-perfil')); return; }

            var desbloquear = t.closest('[data-bloqueado-desbloquear]');
            if (desbloquear) { desbloquearContacto(desbloquear.getAttribute('data-bloqueado-desbloquear')); return; }

            var sugerencia = t.closest('[data-sugerencia-agregar]');
            if (sugerencia) { agregarContacto(sugerencia.getAttribute('data-sugerencia-agregar')); return; }

            var agregarModal = t.closest('#resultadosBusqueda [data-agregar-id]');
            if (agregarModal) { agregarContacto(agregarModal.getAttribute('data-agregar-id')); return; }

            if (document.getElementById('modalBuscarContacto') === t) cerrarModalBuscar();
            if (document.getElementById('modalInvitacion') === t) cerrarModalInvitacion();
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') { cerrarModalBuscar(); cerrarModalInvitacion(); }
        });

        window.addEventListener('beforeunload', function () {
            if (state.observerScroll) { state.observerScroll.disconnect(); state.observerScroll = null; }
        });

        var client = sb();
        if (client && client.auth && client.auth.onAuthStateChange) {
            client.auth.onAuthStateChange(function (evento, session) {
                state.session = session || null;
                state.sessionExpira = Date.now() + 60000;
                if (evento === 'SIGNED_OUT') {
                    state.contactos = [];
                    state.totalContactos = 0;
                    state.idsContactosSet.clear();
                    state.pendientesRecibidas = [];
                    state.pendientesEnviadas = [];
                    state.bloqueados = [];
                    actualizarEstadisticas(0, 0);
                    mostrarEstadoVacio('◈', 'Inicia sesión.');
                } else if (evento === 'SIGNED_IN' && !state.initialized) {
                    refrescarTodo({ reset: true });
                }
            });
        }

        window.invitarContacto = invitarContacto;
        window.cerrarModalBuscar = cerrarModalBuscar;
        window.cerrarModalInvitacion = cerrarModalInvitacion;
        window.copiarCodigoInvitacion = copiarCodigoInvitacion;
        window.abrirAgregarContacto = abrirAgregarContacto;
        window.cargarContactos = function () { return refrescarTodo({ reset: true }); };
    }

    /* ============================================================
       ARRANQUE
       ============================================================ */

    function esperarSupabase() {
        var intentos = 0;
        var timer = setInterval(function () {
            intentos++;
            if (sb()) {
                clearInterval(timer);
                configurarEventos();
                refrescarTodo({ reset: true });
                return;
            }
            if (intentos >= 100) {
                clearInterval(timer);
                console.error('[Contactos] window.supabaseClient no estuvo listo después de 10 s');
                mostrarEstadoVacio('⚠️', 'Error de conexión: no se cargó el cliente de Supabase. Recarga la página.');
                emitirListo();
            }
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', esperarSupabase, { once: true });
    } else {
        esperarSupabase();
    }

})();