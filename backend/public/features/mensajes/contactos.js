/* ============================================================
   CSARIEL'S · CONTACTOS · MESSENGER EXPERIENCE v25.4
   ============================================================
   - Búsqueda Global: Escribe en la barra superior para buscar en 
     toda la plataforma (Modo Facebook).
   - Bug fix: Las solicitudes pendientes se muestran en la lista 
     general, pero sin la "X" roja, solo con su estado.
   - UI Mega Pro: Botones estilizados con gradientes Web3.
   - Accesibilidad: Soporte para teclado (Enter/Espacio) en perfiles.
   ============================================================ */

(function () {
    'use strict';

    var CONFIG = {
        CONTACTOS_TABLE: 'contactos',
        PERFILES_VISTA: 'perfiles_publicos',
        BLOQUEOS_TABLE: 'bloqueos',
        RPC_BUSCAR_USUARIOS: 'buscar_usuarios',
        RPC_BLOQUEAR: 'bloquear_contacto',
        RPC_INVITACION: 'obtener_o_crear_invitacion',
        RPC_RESPONDER_SOLICITUD: 'responder_solicitud_amistad',
        RPC_ELIMINAR_AMISTAD: 'eliminar_amistad',

        PERFIL_PUBLICO_URL: '/features/perfil/perfil-publico.html',
        MENSAJES_URL: '/features/mensajes/mensajes.html',

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
        mensaje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>',
        llamar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92Z"/></svg>',
        favorito: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="width:16px;height:16px;"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',
        favoritoOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',
        bloquear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><circle cx="12" cy="12" r="9"/><path d="m5.64 5.64 12.72 12.72"/></svg>',
        eliminar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
        cancelar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>',
        desbloquear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M7 11V7a5 5 0 0 1 9.9-1"/><rect x="3" y="11" width="18" height="11" rx="2"/></svg>',
        agregarAmigo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M19 8v6"/><path d="M16 11h6"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    };

    function sb() { return window.supabaseClient && typeof window.supabaseClient.from === 'function' ? window.supabaseClient : null; }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function normalizarTextoBusqueda(value) { return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, CONFIG.MAX_CHARS_BUSQUEDA); }
    
    function obtenerAvatarSeguro(url) {
        if (!url) return ''; var valor = String(url).trim(); if (!valor) return '';
        try {
            if (valor.charAt(0) === '/' && valor.indexOf('//') !== 0) return valor;
            var parsed = new URL(valor, window.location.origin);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
            return parsed.href;
        } catch (error) { return ''; }
    }
    
    function obtenerInicial(nombre) { var texto = String(nombre || 'U').trim(); return texto ? texto.charAt(0).toUpperCase() : 'U'; }
    function debounce(fn, ms) { var timer = null; return function () { var contexto = this; var args = arguments; clearTimeout(timer); timer = setTimeout(function () { fn.apply(contexto, args); }, ms); }; }
    function emitirListo() { try { window.dispatchEvent(new Event('contactos:listo')); } catch (error) {} }

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
            overlay.classList.add('active'); overlay.setAttribute('aria-hidden', 'false');

            function limpiar() {
                cancelBtn.removeEventListener('click', cancelar);
                confirmBtn.removeEventListener('click', confirmar);
                overlay.removeEventListener('click', clickFondo);
                document.removeEventListener('keydown', teclaEscape);
            }
            function finalizar(valor) { limpiar(); overlay.classList.remove('active'); overlay.setAttribute('aria-hidden', 'true'); resolve(valor); }
            function cancelar() { finalizar(false); }
            function confirmar() { finalizar(true); }
            function clickFondo(event) { if (event.target === overlay) finalizar(false); }
            function teclaEscape(event) { if (event.key === 'Escape') finalizar(false); }

            cancelBtn.addEventListener('click', cancelar); confirmBtn.addEventListener('click', confirmar);
            overlay.addEventListener('click', clickFondo); document.addEventListener('keydown', teclaEscape);
        });
    }

    async function getSession() {
        var ahora = Date.now(); if (state.session && ahora < state.sessionExpira) return state.session;
        var client = sb(); if (!client || !client.auth) return null;
        try {
            var resultado = await Promise.race([ client.auth.getSession(), new Promise(function (resolve) { setTimeout(function () { resolve({ data: null, error: new Error('Timeout') }); }, CONFIG.SESSION_TIMEOUT_MS); }) ]);
            if (resultado.error) return null;
            state.session = resultado.data && resultado.data.session ? resultado.data.session : null;
            state.sessionExpira = ahora + 60000; return state.session;
        } catch (error) { return null; }
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
                ultimoError = error; if (intento === CONFIG.RETRY_MAX - 1) break;
                await new Promise(function (resolve) { setTimeout(resolve, CONFIG.RETRY_BASE_MS * Math.pow(2, intento)); });
            }
        }
        throw ultimoError;
    }

    function getPerfilCacheado(id) {
        var entry = state.perfilCache.get(id); if (!entry) return null;
        if (Date.now() > entry.expira) { state.perfilCache.delete(id); return null; }
        state.perfilCache.delete(id); state.perfilCache.set(id, entry); return entry.perfil;
    }

    function setPerfilCache(id, perfil) {
        if (!id || !perfil) return;
        if (!state.perfilCache.has(id) && state.perfilCache.size >= CONFIG.CACHE_MAX_SIZE) { state.perfilCache.delete(state.perfilCache.keys().next().value); }
        state.perfilCache.set(id, { perfil: perfil, expira: Date.now() + CONFIG.PROFILE_CACHE_TTL_MS });
    }

    async function cargarPerfilesEnLote(ids) {
        var client = sb(); if (!client || !Array.isArray(ids)) return;
        var unicos = Array.from(new Set(ids.filter(Boolean)));
        var faltantes = unicos.filter(function (id) { return !getPerfilCacheado(id); });
        if (!faltantes.length) return;
        var CHUNK_SIZE = 100;
        for (var i = 0; i < faltantes.length; i += CHUNK_SIZE) {
            var chunk = faltantes.slice(i, i + CHUNK_SIZE);
            try {
                var resultado = await withRetry(function () { return client.from(CONFIG.PERFILES_VISTA).select(CONFIG.CAMPOS_PUBLICOS).in('id', chunk); }, 'cargar perfiles');
                if (!resultado.error) { (resultado.data || []).forEach(function (p) { setPerfilCache(p.id, p); }); }
            } catch (error) { console.error('[Contactos] Error cargando perfiles:', error); }
        }
    }

    async function inicializarContactos() {
        if (state.initialized || state.inicializando) return;
        state.inicializando = true; configurarEventos();
        try {
            var session = await getSession();
            if (!session) { mostrarEstadoVacio('◈', 'Inicia sesión para ver tus contactos.'); actualizarEstadisticas(0, 0); emitirListo(); return; }
            state.initialized = true;
            await cargarContactos({ reset: true });
            await cargarSolicitudesPendientesUI();
            await cargarSolicitudesEnviadasUI();
            await cargarSugerenciasUI();
            await cargarBloqueadosUI();
        } finally { state.inicializando = false; }
    }

    function configurarEventos() {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(function (event) {
                var texto = normalizarTextoBusqueda(event.target.value);
                state.textoBusqueda = texto.toLowerCase();
                if (texto.length >= CONFIG.MIN_CHARS_BUSQUEDA) {
                    var versionActual = ++state.busquedaVersion;
                    buscarUsuariosGlobal(texto, versionActual);
                } else {
                    renderizarContactos();
                }
            }, CONFIG.DEBOUNCE_FILTRO_MS));
        }

        document.querySelectorAll('.filtros .filtro').forEach(function (boton) {
            boton.addEventListener('click', function () {
                document.querySelectorAll('.filtros .filtro').forEach(function (item) { item.classList.remove('active'); item.setAttribute('aria-pressed', 'false'); });
                boton.classList.add('active'); boton.setAttribute('aria-pressed', 'true');
                state.filtroActual = boton.dataset.filtro || 'todos';
                renderizarContactos();
            });
        });

        document.addEventListener('keydown', function (event) { if (event.key === 'Escape') { cerrarModalBuscar(); cerrarModalInvitacion(); } });
        document.addEventListener('click', function (event) {
            if (document.getElementById('modalBuscarContacto') === event.target) cerrarModalBuscar();
            if (document.getElementById('modalInvitacion') === event.target) cerrarModalInvitacion();
        });
        window.addEventListener('beforeunload', cleanup);

        var client = sb();
        if (client && client.auth && client.auth.onAuthStateChange) {
            client.auth.onAuthStateChange(function (evento, session) {
                state.session = session || null; state.sessionExpira = Date.now() + 60000;
                if (evento === 'SIGNED_OUT') { state.contactos = []; state.totalContactos = 0; state.idsContactosSet.clear(); actualizarEstadisticas(0, 0); mostrarEstadoVacio('◈', 'Inicia sesión.'); } 
                else if (evento === 'SIGNED_IN' && !state.initialized) { inicializarContactos(); }
            });
        }
    }

    function cleanup() { if (state.observerScroll) { state.observerScroll.disconnect(); state.observerScroll = null; } clearTimeout(state.busquedaTimer); clearTimeout(state.filtroTimer); }

    async function buscarUsuariosGlobal(texto, version) {
        var client = sb(); var session = await getSession();
        if (!client || !session) return;
        var lista = document.getElementById('contactosList'); if (!lista) return;
        lista.innerHTML = '<div class="contactos-loading-more">🔍 Buscando en Csariel\'s…</div>';

        try {
            var resultado = await invocarBuscarUsuarios(client, texto.trim(), CONFIG.MAX_RESULTADOS_BUSQUEDA);
            if (version !== state.busquedaVersion) return;
            if (resultado.error) throw resultado.error;

            var crudo = resultado.data;
            var usuarios = Array.isArray(crudo) ? crudo : (crudo && Array.isArray(crudo.data) ? crudo.data : []);
            usuarios = usuarios.filter(function(u) { return u.id !== session.user.id; });

            if (!usuarios.length) {
                lista.innerHTML = '<div class="empty-state"><div class="icon">🛸</div><h3>No se encontraron usuarios.</h3></div>';
                return;
            }

            usuarios.forEach(function(u) {
                if (u.nombre || u.handle) setPerfilCache(u.id, u);
            });

            lista.innerHTML = usuarios.map(function (usuario) {
                var nombre = usuario.nombre || usuario.handle || 'Usuario';
                var handle = usuario.handle ? '@' + String(usuario.handle).replace(/^@/, '') : '';
                var avatarUrl = obtenerAvatarSeguro(usuario.avatar_url);
                var avatar = avatarUrl ? '<img class="contacto-avatar-img" src="' + escapeHtml(avatarUrl) + '" alt="">' : '<span class="avatar-fallback">' + escapeHtml(obtenerInicial(nombre)) + '</span>';
                var yaEsContacto = state.idsContactosSet.has(usuario.id);
                
                var btnHTML = yaEsContacto 
                    ? '<button type="button" class="btn-agregar" style="background:rgba(0,214,143,.1);border:1px solid var(--success);color:var(--success);cursor:default;" disabled>' + SVG_ICONS.check + ' Agregado</button>'
                    : '<button type="button" class="btn-agregar" style="background:linear-gradient(135deg, var(--cyan), #0055ff);border:0;color:#fff;" onclick="agregarContacto(\'' + usuario.id + '\')">' + SVG_ICONS.agregarAmigo + ' Agregar</button>';

                return `
                    <article class="contacto-card" tabindex="0">
                        <div class="contacto-avatar">${avatar}</div>
                        <div class="contacto-info">
                            <div class="nombre">${escapeHtml(nombre)} ${usuario.verificado ? '<span class="verified">✓</span>' : ''}</div>
                            <div class="contacto-meta">${escapeHtml(handle)}</div>
                        </div>
                        <div class="contacto-actions">${btnHTML}</div>
                    </article>
                `;
            }).join('');
        } catch (error) { console.error('[Contactos] Error búsqueda global:', error); lista.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>Error al buscar.</h3></div>'; }
    }

    async function cargarContactos(opciones) {
        opciones = opciones || {}; var reset = opciones.reset === true;
        if (state.cargando) return;
        var client = sb(); var session = await getSession();
        if (!client || !session) { mostrarEstadoVacio('◈', 'Inicia sesión.'); actualizarEstadisticas(0, 0); emitirListo(); return; }

        state.cargando = true;
        if (reset) {
            state.paginaActual = 0; state.contactos = []; state.idsContactosSet.clear(); state.hayMas = true; state.totalContactos = 0; mostrarCargando();
        } else { mostrarCargandoMas(); }

        try {
            var desde = state.paginaActual * CONFIG.PAGE_SIZE;
            var hasta = desde + CONFIG.PAGE_SIZE - 1;

            if (reset) {
                var conteo = await withRetry(function () { return client.from(CONFIG.CONTACTOS_TABLE).select('id', { count: 'exact', head: true }).eq('usuario_id', session.user.id).eq('estado', 'activo'); }, 'contar contactos');
                if (!conteo.error) state.totalContactos = conteo.count || 0;
            }

            // Volvemos a traer todo, sin filtrar por 'activo', para que salgan los pendientes
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
                state.hayMas = false; quitarCargandoMas();
                if (reset) { actualizarEstadisticas(0, 0); mostrarEstadoVacio('🪐', 'Aún no tienes contactos agregados.'); emitirListo(); }
                return;
            }

            var idsPagina = pagina.map(function (c) { return c.contacto_id; }).filter(Boolean);
            await cargarPerfilesEnLote(idsPagina);

            var enriquecidos = pagina.map(function (c) {
                var perfil = getPerfilCacheado(c.contacto_id) || { id: c.contacto_id, nombre: 'Usuario', handle: null, avatar_url: null, online: false, ultima_conexion: null, verificado: false };
                state.idsContactosSet.add(c.contacto_id);
                return Object.assign({}, c, { contacto: perfil });
            });

            if (reset) { state.contactos = enriquecidos; } 
            else {
                var idsExistentes = new Set(state.contactos.map(function (item) { return String(item.id); }));
                enriquecidos.forEach(function (item) { if (!idsExistentes.has(String(item.id))) state.contactos.push(item); });
            }

            state.paginaActual++; state.hayMas = pagina.length === CONFIG.PAGE_SIZE;
            recalcularEstadisticas(); renderizarContactos(); quitarCargandoMas();
            if (reset) emitirListo();
        } catch (error) {
            console.error('[Contactos] Error cargando contactos:', error); quitarCargandoMas();
            if (reset) { state.contactos = []; actualizarEstadisticas(0, 0); mostrarEstadoVacio('⚠️', 'Error cargando contactos.'); emitirListo(); } 
            else { showToast('Error cargando más contactos.', 'error'); }
        } finally { state.cargando = false; }
    }

    window.cargarContactos = function () { return cargarContactos({ reset: true }); };

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

    async function cargarSolicitudesPendientesUI() {
        var client = sb(); var session = await getSession(); if (!client || !session) return;
        var contenedor = document.getElementById('solicitudesPendientesLista');
        var seccion = document.getElementById('solicitudesPendientesSection');
        var contador = document.getElementById('solicitudesContador');
        if (!contenedor || !seccion || !contador) return;

        try {
            var res = await client.from(CONFIG.CONTACTOS_TABLE).select('id, usuario_id, contacto_id, estado').eq('contacto_id', session.user.id).eq('estado', 'pendiente');
            var solicitudes = res.data || [];
            if (!solicitudes.length) { seccion.style.display = 'none'; return; }

            await cargarPerfilesEnLote(solicitudes.map(function (s) { return s.usuario_id; }));
            
            seccion.style.display = 'block'; contador.textContent = String(solicitudes.length);

            contenedor.innerHTML = solicitudes.map(function (solicitud) {
                var perfil = getPerfilCacheado(solicitud.usuario_id) || {};
                var nombre = perfil.nombre || perfil.handle || 'Usuario';
                var handle = perfil.handle ? '@' + String(perfil.handle).replace(/^@/, '') : '';
                var avatarUrl = obtenerAvatarSeguro(perfil.avatar_url);
                var avatar = avatarUrl ? '<img src="' + escapeHtml(avatarUrl) + '" alt="" loading="lazy">' : escapeHtml(obtenerInicial(nombre));

                return `
                    <div class="solicitud-card">
                        <div class="avatar">${avatar}</div>
                        <div class="info"><div class="nombre">${escapeHtml(nombre)}</div><div class="handle">${escapeHtml(handle)}</div></div>
                        <div class="acciones">
                            <button type="button" class="btn-aceptar" data-solicitud-aceptar="${solicitud.id}" data-usuario-id="${solicitud.usuario_id}">Aceptar</button>
                            <button type="button" class="btn-rechazar" data-solicitud-rechazar="${solicitud.id}" data-usuario-id="${solicitud.usuario_id}">Rechazar</button>
                        </div>
                    </div>`;
            }).join('');

            contenedor.querySelectorAll('[data-solicitud-aceptar]').forEach(function (b) { b.addEventListener('click', function () { aceptarSolicitud(b.getAttribute('data-solicitud-aceptar'), b.getAttribute('data-usuario-id')); }); });
            contenedor.querySelectorAll('[data-solicitud-rechazar]').forEach(function (b) { b.addEventListener('click', function () { rechazarSolicitud(b.getAttribute('data-solicitud-rechazar')); }); });
        } catch (error) { seccion.style.display = 'none'; }
    }
    window.cargarSolicitudesPendientesUI = cargarSolicitudesPendientesUI;

    async function cargarSolicitudesEnviadasUI() {
        var client = sb(); var session = await getSession(); if (!client || !session) return;
        var contenedor = document.getElementById('solicitudesEnviadasLista');
        var seccion = document.getElementById('solicitudesEnviadasSection');
        var contador = document.getElementById('solicitudesEnviadasContador');
        if (!contenedor || !seccion || !contador) return;

        try {
            var res = await client.from(CONFIG.CONTACTOS_TABLE).select('id, usuario_id, contacto_id, estado').eq('usuario_id', session.user.id).eq('estado', 'pendiente');
            var solicitudes = res.data || [];
            if (!solicitudes.length) { seccion.style.display = 'none'; return; }

            await cargarPerfilesEnLote(solicitudes.map(function (s) { return s.contacto_id; }));
            
            seccion.style.display = 'block'; contador.textContent = String(solicitudes.length);

            contenedor.innerHTML = solicitudes.map(function (solicitud) {
                var perfil = getPerfilCacheado(solicitud.contacto_id) || {};
                var nombre = perfil.nombre || perfil.handle || 'Usuario';
                var handle = perfil.handle ? '@' + String(perfil.handle).replace(/^@/, '') : '';
                var avatarUrl = obtenerAvatarSeguro(perfil.avatar_url);
                var avatar = avatarUrl ? '<img src="' + escapeHtml(avatarUrl) + '" alt="" loading="lazy">' : escapeHtml(obtenerInicial(nombre));

                return `
                    <div class="solicitud-enviada-card">
                        <div class="avatar">${avatar}</div>
                        <div class="info">
                            <div class="nombre">${escapeHtml(nombre)}</div>
                            <div class="handle">${escapeHtml(handle)}</div>
                        </div>
                        <div class="acciones">
                            <button type="button" class="btn-cancelar-envio" data-solicitud-cancelar="${solicitud.id}">Cancelar envío</button>
                        </div>
                    </div>`;
            }).join('');

            contenedor.querySelectorAll('[data-solicitud-cancelar]').forEach(function (b) { b.addEventListener('click', function () { cancelarSolicitudEnviada(b.getAttribute('data-solicitud-cancelar')); }); });
        } catch (error) { seccion.style.display = 'none'; }
    }
    window.cargarSolicitudesEnviadasUI = cargarSolicitudesEnviadasUI;

    async function cargarSugerenciasUI() {
        var client = sb(); var session = await getSession(); if (!client || !session) return;
        var seccion = document.getElementById('sugerenciasSection');
        var contenedor = document.getElementById('sugerenciasLista');
        if (!seccion || !contenedor) return;

        try {
            var existentes = await client.from(CONFIG.CONTACTOS_TABLE).select('contacto_id, usuario_id').or('usuario_id.eq.' + session.user.id + ',contacto_id.eq.' + session.user.id);
            var idsExcluir = new Set([session.user.id]);
            (existentes.data || []).forEach(function (item) { if (item.usuario_id) idsExcluir.add(item.usuario_id); if (item.contacto_id) idsExcluir.add(item.contacto_id); });

            try {
                var bloqueos = await client.from(CONFIG.BLOQUEOS_TABLE).select('bloqueado_id').eq('usuario_id', session.user.id);
                (bloqueos.data || []).forEach(function (b) { if (b.bloqueado_id) idsExcluir.add(b.bloqueado_id); });
            } catch (e) {}

            var idsArray = Array.from(idsExcluir);
            if (!idsArray.length) { seccion.style.display = 'none'; return; }

            var perfiles = await client.from(CONFIG.PERFILES_VISTA).select(CONFIG.CAMPOS_PUBLICOS).not('id', 'in', '(' + idsArray.join(',') + ')').order('online', { ascending: false }).limit(CONFIG.MAX_SUGERENCIAS);
            var data = perfiles.data || [];
            if (!data.length) { seccion.style.display = 'none'; return; }

            data.forEach(function (p) { setPerfilCache(p.id, p); });
            seccion.style.display = 'block';

            contenedor.innerHTML = data.map(function (usuario) {
                var nombre = usuario.nombre || usuario.handle || 'Usuario';
                var handle = usuario.handle ? '@' + String(usuario.handle).replace(/^@/, '') : '';
                var avatarUrl = obtenerAvatarSeguro(usuario.avatar_url);
                var avatar = avatarUrl ? '<img src="' + escapeHtml(avatarUrl) + '" alt="" loading="lazy">' : escapeHtml(obtenerInicial(nombre));
                var estado = usuario.online === true ? '<span class="estado online">● En línea</span>' : '<span class="estado">Desconectado</span>';

                return `
                    <div class="sugerencia-card">
                        <div class="avatar ${usuario.online ? 'online' : ''}">${avatar}</div>
                        <div class="info">
                            <div class="nombre">${escapeHtml(nombre)} ${usuario.verificado ? '<span class="verified">✓</span>' : ''}</div>
                            <div class="handle">${escapeHtml(handle)}</div>
                            ${estado}
                        </div>
                        <div class="acciones">
                            <button type="button" class="btn-agregar-sugerencia" data-sugerencia-agregar="${usuario.id}">Conectar</button>
                        </div>
                    </div>`;
            }).join('');

            contenedor.querySelectorAll('[data-sugerencia-agregar]').forEach(function (b) { b.addEventListener('click', function () { agregarContacto(b.getAttribute('data-sugerencia-agregar')); }); });
        } catch (error) { seccion.style.display = 'none'; }
    }
    window.cargarSugerenciasUI = cargarSugerenciasUI;

    async function cargarBloqueadosUI() {
        var client = sb(); var session = await getSession(); if (!client || !session) return;
        var seccion = document.getElementById('bloqueadosSection');
        var contenedor = document.getElementById('bloqueadosLista');
        var contador = document.getElementById('bloqueadosContador');
        if (!seccion || !contenedor || !contador) return;

        try {
            var res = await client.from(CONFIG.BLOQUEOS_TABLE).select('id, bloqueado_id, motivo, created_at').eq('usuario_id', session.user.id).order('created_at', { ascending: false });
            var bloqueos = res.data || [];
            if (!bloqueos.length) { seccion.style.display = 'none'; return; }

            await cargarPerfilesEnLote(bloqueos.map(function (b) { return b.bloqueado_id; }));
            seccion.style.display = 'block'; contador.textContent = String(bloqueos.length);

            contenedor.innerHTML = bloqueos.map(function (bloqueo) {
                var perfil = getPerfilCacheado(bloqueo.bloqueado_id) || {};
                var nombre = perfil.nombre || perfil.handle || 'Usuario';
                var handle = perfil.handle ? '@' + String(perfil.handle).replace(/^@/, '') : '';
                var avatarUrl = obtenerAvatarSeguro(perfil.avatar_url);
                var avatar = avatarUrl ? '<img src="' + escapeHtml(avatarUrl) + '" alt="" loading="lazy">' : escapeHtml(obtenerInicial(nombre));

                return `
                    <div class="bloqueado-card">
                        <div class="avatar">${avatar}</div>
                        <div class="info"><div class="nombre">${escapeHtml(nombre)}</div><div class="handle">${escapeHtml(handle)}</div></div>
                        <div class="acciones">
                            <button type="button" class="btn-desbloquear" data-bloqueado-desbloquear="${bloqueo.bloqueado_id}">Desbloquear</button>
                        </div>
                    </div>`;
            }).join('');

            contenedor.querySelectorAll('[data-bloqueado-desbloquear]').forEach(function (b) { b.addEventListener('click', function () { desbloquearContacto(b.getAttribute('data-bloqueado-desbloquear')); }); });
        } catch (error) { seccion.style.display = 'none'; }
    }
    window.cargarBloqueadosUI = cargarBloqueadosUI;

    function renderizarContactos() {
        var lista = document.getElementById('contactosList');
        if (!lista) return;

        var listaContactos = state.contactos.map(normalizarContacto);

        if (state.filtroActual === 'online') listaContactos = listaContactos.filter(function (c) { return c.online; });
        if (state.filtroActual === 'favoritos') listaContactos = listaContactos.filter(function (c) { return c.es_favorito; });
        if (state.filtroActual === 'recientes') {
            listaContactos = listaContactos.filter(function (c) { return Boolean(c.fecha); }).sort(function (a, b) { return new Date(b.fecha).getTime() - new Date(a.fecha).getTime(); }).slice(0, 10);
        }
        if (state.textoBusqueda) {
            var q = state.textoBusqueda;
            listaContactos = listaContactos.filter(function (c) { return c.nombre.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q); });
        }

        if (!listaContactos.length) {
            var msg = state.textoBusqueda ? 'No se encontraron contactos.' : state.filtroActual === 'online' ? 'No hay contactos conectados ahora.' : state.filtroActual === 'favoritos' ? 'Todavía no tienes favoritos.' : 'Tu red está vacía. Busca personas para conectar.';
            mostrarEstadoVacio('🪐', msg); return;
        }

        lista.setAttribute('aria-busy', 'false');
        lista.innerHTML = listaContactos.map(renderizarTarjeta).join('') + (state.hayMas && !state.textoBusqueda ? '<div id="cargandoMasSentinel" class="contactos-sentinel"></div>' : '');
        configurarScrollInfinito();
    }

    function renderizarTarjeta(contacto) {
        var inicial = escapeHtml(obtenerInicial(contacto.nombre));
        var avatarUrl = obtenerAvatarSeguro(contacto.avatar_url);
        var avatar = avatarUrl ? '<img class="contacto-avatar-img" src="' + escapeHtml(avatarUrl) + '" alt="' + escapeHtml(contacto.nombre) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add(\'avatar-image-error\')"><span class="avatar-fallback avatar-fallback-hidden">' + inicial + '</span>' : '<span class="avatar-fallback">' + inicial + '</span>';
        
        var pendiente = contacto.estado === 'pendiente';
        var enLinea = contacto.online === true;
        var handle = contacto.handle ? '@' + String(contacto.handle).replace(/^@/, '') : '';
        var estadoTexto = pendiente ? 'Solicitud pendiente' : enLinea ? 'En línea ahora' : 'Desconectado';
        var estadoClase = enLinea ? 'online' : 'offline';
        var filaId = escapeHtml(contacto.id);
        var contactoId = escapeHtml(contacto.contacto_id);
        var favClase = contacto.es_favorito ? 'active' : '';
        var favIcono = contacto.es_favorito ? SVG_ICONS.favorito : SVG_ICONS.favoritoOutline;
        var verificado = contacto.verificado ? '<span class="verified" title="Perfil verificado">✓</span>' : '';

        // Lógica de botones:
        // Si está pendiente, no mostramos ningún botón en esta vista de la lista general.
        // Todo se maneja en la sección superior.
        var accionesHTML = '';
        
        if (!pendiente) {
            var btnMsj = '<button type="button" class="mensaje" data-accion="mensaje" title="Enviar mensaje" aria-label="Enviar mensaje">' + SVG_ICONS.mensaje + '<span>Mensaje</span></button>';
            var btnLlamar = '<button type="button" class="llamar" data-accion="llamar" title="Llamar" aria-label="Llamar">' + SVG_ICONS.llamar + '</button>';
            var btnFav = '<button type="button" class="favorito ' + favClase + '" data-accion="favorito" title="' + (contacto.es_favorito ? 'Quitar favorito' : 'Agregar favorito') + '" aria-label="Cambiar favorito">' + favIcono + '</button>';
            var extras = '<button type="button" class="bloquear" data-accion="bloquear" title="Bloquear usuario" aria-label="Bloquear">' + SVG_ICONS.bloquear + '</button><button type="button" class="eliminar" data-accion="eliminar" title="Eliminar contacto" aria-label="Eliminar">' + SVG_ICONS.eliminar + '</button>';
            
            accionesHTML = btnMsj + btnLlamar + btnFav + extras;
        }

        return `
            <article class="contacto-card ${pendiente ? 'pendiente' : ''}" data-contacto-id="${contactoId}" data-fila-id="${filaId}" tabindex="0" role="button" aria-label="Abrir conversación con ${escapeHtml(contacto.nombre)}">
                <div class="contacto-avatar ${enLinea ? 'online' : 'offline'}" role="button" tabindex="0" aria-label="Ver perfil de ${escapeHtml(contacto.nombre)}">
                    ${avatar}
                    <span class="online-dot ${enLinea ? 'visible' : 'hidden'}"></span>
                    ${contacto.es_favorito ? '<span class="favorito-badge" aria-hidden="true">★</span>' : ''}
                </div>
                <div class="contacto-info">
                    <div class="nombre">${escapeHtml(contacto.nombre)} ${verificado}</div>
                    <div class="estado ${estadoClase}"><span class="estado-indicador"></span> ${escapeHtml(estadoTexto)}</div>
                    ${handle ? '<div class="contacto-meta">' + escapeHtml(handle) + '</div>' : ''}
                </div>
                <div class="contacto-actions">
                    ${accionesHTML}
                </div>
            </article>
        `;
    }

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

        lista.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            var tarjeta = event.target.closest('.contacto-card');
            if (!tarjeta) return;
            var contactoId = tarjeta.getAttribute('data-contacto-id');

            if (event.target.classList.contains('contacto-avatar')) { event.preventDefault(); abrirPerfil(contactoId); return; }
            if (event.target === tarjeta || event.target.classList.contains('contacto-card')) { event.preventDefault(); abrirMensaje(contactoId); }
        });
    }

    function configurarScrollInfinito() {
        if (state.observerScroll) { state.observerScroll.disconnect(); state.observerScroll = null; }
        var sentinel = document.getElementById('cargandoMasSentinel');
        if (!sentinel || !('IntersectionObserver' in window)) return;
        state.observerScroll = new IntersectionObserver(function (entries) {
            if (entries[0] && entries[0].isIntersecting && state.hayMas && !state.cargando && !state.textoBusqueda) cargarContactos({ reset: false });
        }, { rootMargin: '300px', threshold: 0 });
        state.observerScroll.observe(sentinel);
    }

    function mostrarCargando() {
        var lista = document.getElementById('contactosList');
        if (!lista) return;
        lista.setAttribute('aria-busy', 'true');
        lista.innerHTML = Array(4).fill('').map(function () { return `<div class="contacto-card skeleton"><div class="contacto-avatar skeleton-avatar"></div><div class="contacto-info skeleton-info"><div class="skeleton-line skeleton-line-name"></div><div class="skeleton-line skeleton-line-meta"></div></div></div>`; }).join('');
    }

    function mostrarCargandoMas() {
        var lista = document.getElementById('contactosList');
        if (!lista || document.getElementById('cargandoMasIndicador')) return;
        var div = document.createElement('div');
        div.id = 'cargandoMasIndicador'; div.className = 'contactos-loading-more'; div.textContent = 'Cargando más contactos…';
        lista.appendChild(div);
    }

    function quitarCargandoMas() {
        var el = document.getElementById('cargandoMasIndicador'); if (el) el.remove();
        var lista = document.getElementById('contactosList'); if (lista) lista.setAttribute('aria-busy', 'false');
    }

    function mostrarEstadoVacio(icono, mensaje) {
        var lista = document.getElementById('contactosList');
        if (!lista) return;
        lista.setAttribute('aria-busy', 'false');
        lista.innerHTML = `<div class="empty-state"><div class="icon" aria-hidden="true">${escapeHtml(icono)}</div><h3>${escapeHtml(mensaje)}</h3>${state.contactos.length === 0 ? '<button type="button" class="btn-accion" data-contactos-action="agregar">' + SVG_ICONS.agregarAmigo + ' Buscar personas</button>' : ''}</div>`;
        var boton = lista.querySelector('[data-contactos-action="agregar"]');
        if (boton) boton.addEventListener('click', abrirAgregarContacto, { once: true });
    }

    function recalcularEstadisticas() {
        var activos = state.contactos.filter(function (c) { return (c.estado || 'activo') === 'activo'; }).length;
        var total = state.totalContactos; if (total < activos) total = activos;
        var online = state.contactos.filter(function (c) { return c.contacto && c.contacto.online === true && (c.estado || 'activo') === 'activo'; }).length;
        actualizarEstadisticas(total, online);
    }

    function actualizarEstadisticas(total, online) {
        var tEl = document.getElementById('totalContactos'); if (tEl) tEl.textContent = String(total || 0);
        var oEl = document.getElementById('onlineContactos'); if (oEl) oEl.textContent = String(online || 0);
    }

    function abrirAgregarContacto() {
        var modal = document.getElementById('modalBuscarContacto');
        if (!modal) return;
        modal.classList.add('show', 'active'); modal.setAttribute('aria-hidden', 'false');
        var input = document.getElementById('searchInputModal');
        var res = document.getElementById('resultadosBusqueda');
        if (input) { input.value = ''; clearTimeout(state.busquedaTimer); setTimeout(function () { input.focus(); }, 100); }
        if (res) { res.innerHTML = '<div class="busqueda-mensaje">Escribe un nombre, @handle, correo o teléfono.</div>'; }
    }
    window.abrirAgregarContacto = abrirAgregarContacto;

    function cerrarModalBuscar() {
        var modal = document.getElementById('modalBuscarContacto');
        if (!modal) return;
        modal.classList.remove('show', 'active'); modal.setAttribute('aria-hidden', 'true'); clearTimeout(state.busquedaTimer);
    }
    window.cerrarModalBuscar = cerrarModalBuscar;

    function cerrarModalInvitacion() {
        var modal = document.getElementById('modalInvitacion');
        if (!modal) return;
        modal.classList.remove('show', 'active'); modal.setAttribute('aria-hidden', 'true');
    }
    window.cerrarModalInvitacion = cerrarModalInvitacion;

    async function invocarBuscarUsuarios(client, termino, limite) {
        const { data, error } = await client.rpc(CONFIG.RPC_BUSCAR_USUARIOS, { p_query: termino });
        if (error) {
            console.error('[Contactos] Error en RPC buscar_usuarios:', error);
            if (error.code === '42501') return { data: null, error: new Error('Sesión expirada.') };
            return { data: null, error };
        }
        return { data: data, error: null };
    }

    async function buscarUsuarios(texto, version) {
        var client = sb(); var session = await getSession();
        if (!client || !session) { mostrarMensajeBusqueda('Inicia sesión para buscar.'); return; }
        var termino = normalizarTextoBusqueda(texto).replace(/^@+/, '').trim();
        if (termino.length < CONFIG.MIN_CHARS_BUSQUEDA) { mostrarMensajeBusqueda('Escribe al menos 2 caracteres.'); return; }

        try {
            var resultado = await withRetry(function () { return invocarBuscarUsuarios(client, termino, CONFIG.MAX_RESULTADOS_BUSQUEDA); }, 'buscar usuarios');
            if (version !== state.busquedaVersion) return;
            if (resultado.error) throw resultado.error;

            var crudo = resultado.data;
            var lista = Array.isArray(crudo) ? crudo : (crudo && Array.isArray(crudo.data) ? crudo.data : []);
            var mapa = new Map();
            lista.forEach(function (u) {
                if (!u || !u.id || u.id === session.user.id) return;
                if (!mapa.has(u.id)) {
                    mapa.set(u.id, u);
                    if (u.nombre !== undefined || u.handle !== undefined) setPerfilCache(u.id, u);
                }
            });

            var usuarios = Array.from(mapa.values()).slice(0, CONFIG.MAX_RESULTADOS_BUSQUEDA);
            if (!usuarios.length) { mostrarMensajeBusqueda('No se encontraron usuarios.'); return; }

            var disponibles = usuarios.filter(function (u) { return !state.idsContactosSet.has(u.id); });
            if (!disponibles.length) { mostrarMensajeBusqueda('Los usuarios ya están en tus contactos o bloqueados.'); return; }

            renderizarResultadosBusqueda(disponibles);
        } catch (error) { console.error('[Contactos] Error buscando:', error); mostrarMensajeBusqueda('Error al buscar.'); }
    }

    function renderizarResultadosBusqueda(usuarios) {
        var contenedor = document.getElementById('resultadosBusqueda');
        if (!contenedor) return;

        contenedor.innerHTML = usuarios.map(function (usuario) {
            var nombre = usuario.nombre || usuario.handle || 'Usuario';
            var handle = usuario.handle ? '@' + String(usuario.handle).replace(/^@/, '') : '';
            var avatarUrl = obtenerAvatarSeguro(usuario.avatar_url);
            var avatar = avatarUrl ? '<img class="resultado-avatar-img" src="' + escapeHtml(avatarUrl) + '" alt="" loading="lazy">' : '<div class="resultado-avatar-fallback">' + escapeHtml(obtenerInicial(nombre)) + '</div>';

            return `
                <div class="resultado-usuario">
                    ${avatar}
                    <div class="resultado-info">
                        <div class="resultado-nombre">${escapeHtml(nombre)} ${usuario.verificado ? '<span class="verified">✓</span>' : ''}</div>
                        <div class="resultado-handle">${escapeHtml(handle)}</div>
                    </div>
                    <button type="button" class="btn-agregar" data-action="agregar" data-usuario-id="${escapeHtml(usuario.id)}">${SVG_ICONS.agregarAmigo} Conectar</button>
                </div>
            `;
        }).join('');
    }

    function mostrarMensajeBusqueda(mensaje) {
        var contenedor = document.getElementById('resultadosBusqueda');
        if (!contenedor) return;
        contenedor.innerHTML = '<div class="busqueda-mensaje">' + escapeHtml(mensaje) + '</div>';
    }

    async function agregarContacto(contactoId) {
        var client = sb(); var session = await getSession();
        if (!client || !session) { showToast('Inicia sesión.', 'error'); return; }
        if (!contactoId) return;
        if (contactoId === session.user.id) { showToast('No puedes agregarte.', 'warning'); return; }
        if (state.idsContactosSet.has(contactoId)) { showToast('Ya está en tus contactos.', 'warning'); return; }

        var clave = 'agregar:' + contactoId;
        if (state.operacionEnCurso.has(clave)) return;
        state.operacionEnCurso.add(clave);

        try {
            var resultado = await withRetry(function () {
                return client.from(CONFIG.CONTACTOS_TABLE).insert({ usuario_id: session.user.id, contacto_id: contactoId, estado: 'pendiente', es_favorito: false });
            }, 'enviar solicitud');

            if (resultado.error) {
                if (resultado.error.code === '23505') { showToast('Ya enviaste solicitud.', 'warning'); return; }
                throw resultado.error;
            }

            showToast('Solicitud enviada.', 'success');
            
            await cargarPerfilesEnLote([contactoId]);
            
            var input = document.getElementById('searchInputModal'); if (input) input.value = '';
            var res = document.getElementById('resultadosBusqueda'); if (res) res.innerHTML = '';
            cerrarModalBuscar();
            
            var inputGlobal = document.getElementById('searchInput'); if (inputGlobal) inputGlobal.value = '';
            state.textoBusqueda = '';
            
            await cargarContactos({ reset: true });
            await cargarSolicitudesPendientesUI();
            await cargarSolicitudesEnviadasUI();
            await cargarSugerenciasUI();
        } catch (error) { 
            console.error('[Contactos] Error agregando:', error); 
            showToast('No se pudo enviar.', 'error'); 
        } finally { 
            state.operacionEnCurso.delete(clave); 
        }
    }
    window.agregarContacto = agregarContacto;

    async function aceptarSolicitud(contactoRowId, otroUsuarioId) {
        var client = sb(); var session = await getSession(); if (!client || !session) return;
        var fila = Number(contactoRowId); if (!Number.isFinite(fila) || fila <= 0) { showToast('ID inválido.', 'error'); return; }
        var clave = 'aceptar:' + contactoRowId; if (state.operacionEnCurso.has(clave)) return; state.operacionEnCurso.add(clave);

        try {
            var resultado = await client.rpc(CONFIG.RPC_RESPONDER_SOLICITUD, { p_fila_id: fila, p_aceptar: true });
            if (resultado.error) throw resultado.error;
            if (otroUsuarioId) state.idsContactosSet.add(otroUsuarioId);
            showToast('Amistad aceptada.', 'success');
            await cargarContactos({ reset: true });
            await cargarSolicitudesPendientesUI();
            await cargarSolicitudesEnviadasUI();
            await cargarSugerenciasUI();
            await cargarBloqueadosUI();
        } catch (error) { console.error('[Contactos] Error aceptando:', error); showToast('Error al aceptar.', 'error'); } 
        finally { state.operacionEnCurso.delete(clave); }
    }
    window.aceptarSolicitud = aceptarSolicitud;

    async function rechazarSolicitud(contactoRowId) {
        var client = sb(); var session = await getSession(); if (!client || !session) return;
        var fila = Number(contactoRowId); if (!Number.isFinite(fila) || fila <= 0) { showToast('ID inválido.', 'error'); return; }
        var clave = 'rechazar:' + contactoRowId; if (state.operacionEnCurso.has(clave)) return; state.operacionEnCurso.add(clave);

        try {
            var resultado = await client.rpc(CONFIG.RPC_RESPONDER_SOLICITUD, { p_fila_id: fila, p_aceptar: false });
            if (resultado.error) throw resultado.error;
            showToast('Solicitud rechazada.', 'success');
            await cargarSolicitudesPendientesUI();
            await cargarContactos({ reset: true });
            await cargarSolicitudesEnviadasUI();
            await cargarSugerenciasUI();
        } catch (error) { showToast('Error al rechazar.', 'error'); } 
        finally { state.operacionEnCurso.delete(clave); }
    }
    window.rechazarSolicitud = rechazarSolicitud;

    async function cancelarSolicitudEnviada(filaId) {
        var client = sb(); var session = await getSession(); if (!client || !session) { showToast('Inicia sesión.', 'error'); return; }
        if (!filaId) return;
        var confirmado = await showConfirm({ title: 'Cancelar solicitud', message: '¿Retirar solicitud de amistad?', icon: '↩️', confirmText: 'Retirar', cancelText: 'Volver', danger: true });
        if (!confirmado) return;
        var clave = 'cancelar:' + filaId; if (state.operacionEnCurso.has(clave)) return; state.operacionEnCurso.add(clave);

        try {
            var resultado = await client.from(CONFIG.CONTACTOS_TABLE).delete().eq('id', filaId).eq('usuario_id', session.user.id).eq('estado', 'pendiente');
            if (resultado.error) throw resultado.error;
            showToast('Solicitud retirada.', 'success');
            await cargarContactos({ reset: true });
            await cargarSolicitudesPendientesUI();
            await cargarSolicitudesEnviadasUI();
            await cargarSugerenciasUI();
        } catch (error) { showToast('Error al cancelar.', 'error'); } 
        finally { state.operacionEnCurso.delete(clave); }
    }
    window.cancelarSolicitudEnviada = cancelarSolicitudEnviada;

    async function toggleFavorito(contactoRowId, nuevoValor) {
        var client = sb(); var session = await getSession(); if (!client || !session) return;
        if (contactoRowId == null || contactoRowId === '') return;
        var clave = 'favorito:' + String(contactoRowId); if (state.operacionEnCurso.has(clave)) return;
        var item = state.contactos.find(function (c) { return String(c.id) === String(contactoRowId); }); if (!item) return;
        var valorAnterior = item.es_favorito; var valorNuevo = nuevoValor === true; state.operacionEnCurso.add(clave);
        item.es_favorito = valorNuevo; renderizarContactos();

        try {
            var resultado = await withRetry(function () { return client.from(CONFIG.CONTACTOS_TABLE).update({ es_favorito: valorNuevo }).eq('id', contactoRowId).eq('usuario_id', session.user.id); }, 'favorito');
            if (resultado.error) throw resultado.error;
            showToast(valorNuevo ? 'Favorito guardado.' : 'Favorito quitado.', 'success');
            renderizarContactos();
        } catch (error) {
            item.es_favorito = valorAnterior; renderizarContactos(); showToast('Error al guardar favorito.', 'error');
        } finally { state.operacionEnCurso.delete(clave); }
    }
    window.toggleFavorito = toggleFavorito;

    async function eliminarContacto(contactoIdDelContacto) {
        var client = sb(); var session = await getSession(); if (!client || !session) { showToast('Inicia sesión.', 'error'); return; }
        if (!contactoIdDelContacto) return;
        var confirmado = await showConfirm({ title: 'Eliminar contacto', message: '¿Eliminar a este contacto de tu red?', icon: '🗑️', confirmText: 'Eliminar', cancelText: 'Cancelar', danger: true });
        if (!confirmado) return;
        var clave = 'eliminar:' + contactoIdDelContacto; if (state.operacionEnCurso.has(clave)) return; state.operacionEnCurso.add(clave);
        var backup = state.contactos.slice(); var backupSet = new Set(state.idsContactosSet); var backupTotal = state.totalContactos;

        state.contactos = state.contactos.filter(function (c) { return String(c.contacto_id) !== String(contactoIdDelContacto); });
        state.idsContactosSet.delete(contactoIdDelContacto); state.totalContactos = Math.max(0, state.totalContactos - 1);
        renderizarContactos(); recalcularEstadisticas();

        try {
            var resultado = await client.rpc(CONFIG.RPC_ELIMINAR_AMISTAD, { p_contacto_id: contactoIdDelContacto });
            if (resultado.error) throw resultado.error;
            showToast('Contacto eliminado.', 'success');
            await cargarContactos({ reset: true });
            await cargarSolicitudesPendientesUI();
            await cargarSolicitudesEnviadasUI();
            await cargarSugerenciasUI();
        } catch (error) {
            state.contactos = backup; state.idsContactosSet = backupSet; state.totalContactos = backupTotal;
            renderizarContactos(); recalcularEstadisticas(); showToast('Error al eliminar.', 'error');
        } finally { state.operacionEnCurso.delete(clave); }
    }
    window.eliminarContacto = eliminarContacto;

    async function bloquearContacto(contactoId) {
        var client = sb(); var session = await getSession(); if (!client || !session) { showToast('Inicia sesión.', 'error'); return; }
        if (!contactoId) return; if (contactoId === session.user.id) { showToast('No puedes bloquearte.', 'warning'); return; }
        var confirmado = await showConfirm({ title: 'Bloquear usuario', message: '¿Bloquear a este usuario? No podrá llamarte ni escribirte.', icon: '⛔', confirmText: 'Bloquear', cancelText: 'Cancelar', danger: true });
        if (!confirmado) return;
        var clave = 'bloquear:' + contactoId; if (state.operacionEnCurso.has(clave)) return; state.operacionEnCurso.add(clave);
        var backup = state.contactos.slice(); var backupSet = new Set(state.idsContactosSet); var backupTotal = state.totalContactos;

        state.contactos = state.contactos.filter(function (c) { return String(c.contacto_id) !== String(contactoId); });
        state.idsContactosSet.delete(contactoId); state.totalContactos = Math.max(0, state.totalContactos - 1);
        renderizarContactos(); recalcularEstadisticas();

        try {
            var resultado = await withRetry(function () { return client.rpc(CONFIG.RPC_BLOQUEAR, { p_contacto_id: contactoId }); }, 'bloquear');
            if (resultado.error) throw resultado.error;
            showToast('Usuario bloqueado.', 'success');
            await cargarContactos({ reset: true });
            await cargarSolicitudesPendientesUI();
            await cargarSolicitudesEnviadasUI();
            await cargarSugerenciasUI();
            await cargarBloqueadosUI();
        } catch (error) {
            state.contactos = backup; state.idsContactosSet = backupSet; state.totalContactos = backupTotal;
            renderizarContactos(); recalcularEstadisticas(); showToast('Error al bloquear.', 'error');
        } finally { state.operacionEnCurso.delete(clave); }
    }
    window.bloquearContacto = bloquearContacto;

    async function desbloquearContacto(bloqueadoId) {
        var client = sb(); var session = await getSession(); if (!client || !session) return;
        if (!bloqueadoId) return;
        var confirmado = await showConfirm({ title: 'Desbloquear usuario', message: '¿Permitir que este usuario te contacte de nuevo?', icon: '🔓', confirmText: 'Desbloquear', cancelText: 'Cancelar', danger: false });
        if (!confirmado) return;
        var clave = 'desbloquear:' + bloqueadoId; if (state.operacionEnCurso.has(clave)) return; state.operacionEnCurso.add(clave);

        try {
            var resultado = await withRetry(function () { return client.from(CONFIG.BLOQUEOS_TABLE).delete().eq('usuario_id', session.user.id).eq('bloqueado_id', bloqueadoId); }, 'desbloquear');
            if (resultado.error) throw resultado.error;
            showToast('Usuario desbloqueado.', 'success');
            await cargarBloqueadosUI();
            await cargarSugerenciasUI();
            await cargarSolicitudesPendientesUI();
            await cargarSolicitudesEnviadasUI();
        } catch (error) { showToast('Error al desbloquear.', 'error'); } 
        finally { state.operacionEnCurso.delete(clave); }
    }
    window.desbloquearContacto = desbloquearContacto;

    function llamarContacto(contactoId) { if (!contactoId) return; window.location.href = CONFIG.MENSAJES_URL + '?usuario=' + encodeURIComponent(contactoId) + '&accion=llamada'; }
    window.llamarContacto = llamarContacto;
    function abrirMensaje(contactoId) { if (!contactoId) return; window.location.href = CONFIG.MENSAJES_URL + '?usuario=' + encodeURIComponent(contactoId); }
    window.abrirMensaje = abrirMensaje;

    function abrirPerfil(contactoId) {
        if (!contactoId) return;
        var item = state.contactos.find(function (c) { return String(c.contacto_id) === String(contactoId); });
        var handle = item && item.contacto ? item.contacto.handle : '';
        if (!handle) { showToast('Perfil no disponible.', 'warning'); return; }
        window.location.href = CONFIG.PERFIL_PUBLICO_URL + '?u=' + encodeURIComponent(handle);
    }
    window.abrirPerfil = abrirPerfil;

    async function invitarContacto() {
        var client = sb(); var session = await getSession(); if (!client || !session) { showToast('Inicia sesión.', 'error'); return; }
        var modal = document.getElementById('modalInvitacion');
        var codigoEl = document.getElementById('codigoInvitacion');
        if (modal) { modal.classList.add('show', 'active'); modal.setAttribute('aria-hidden', 'false'); }
        if (codigoEl) { codigoEl.textContent = 'Generando…'; }

        try {
            var res = await withRetry(function () { return client.rpc(CONFIG.RPC_INVITACION); }, 'invitar');
            if (res.error) throw res.error;
            var inv = Array.isArray(res.data) ? res.data[0] : res.data;
            if (!inv || !inv.codigo) throw new Error('Sin código');
            if (codigoEl) codigoEl.textContent = String(inv.codigo);
        } catch (error) { if (codigoEl) codigoEl.textContent = 'ERROR'; showToast('Error al generar invitación.', 'error'); }
    }
    window.invitarContacto = invitarContacto;

    async function copiarCodigoInvitacion() {
        var el = document.getElementById('codigoInvitacion'); if (!el) return;
        var cod = el.textContent.trim(); if (!cod || cod === 'Generando…' || cod === 'ERROR') return;
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') { await navigator.clipboard.writeText(cod); } 
            else {
                var tmp = document.createElement('textarea'); tmp.value = cod; tmp.setAttribute('readonly', ''); tmp.style.position = 'fixed'; tmp.style.opacity = '0';
                document.body.appendChild(tmp); tmp.select(); var ok = document.execCommand('copy'); tmp.remove();
                if (!ok) throw new Error('Error');
            }
            showToast('Código copiado.', 'success');
        } catch (error) { showToast('No se pudo copiar.', 'error'); }
    }
    window.copiarCodigoInvitacion = copiarCodigoInvitacion;

    function esperarSupabase() {
        var intentos = 0;
        var timer = setInterval(async function () {
            intentos++;
            if (sb()) {
                clearInterval(timer); configurarEventosTarjetas(); await inicializarContactos(); return;
            }
            if (intentos >= 100) { clearInterval(timer); mostrarEstadoVacio('⚠️', 'Error de conexión.'); emitirListo(); }
        }, 100);
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', esperarSupabase, { once: true }); } 
    else { esperarSupabase(); }

})();