/* ============================================================
   contactos.js
   Sariel's Ecosystem · Contactos
   v10 — Sistema de Solicitudes de Amistad (Pendiente -> Aceptar/Rechazar)
   ============================================================ */

(() => {
    'use strict';

    const CONFIG = {
        CONTACTOS_TABLE: 'contactos',
        PERFILES_VISTA: 'perfiles_publicos',
        BLOQUEOS_TABLE: 'bloqueos',
        RPC_BLOQUEAR: 'bloquear_contacto',
        RPC_INVITACION: 'obtener_o_crear_invitacion',
        PAGE_SIZE: 30,
        MAX_RESULTADOS_BUSQUEDA: 20,
        MIN_CHARS_BUSQUEDA: 2,
        MAX_CHARS_BUSQUEDA: 80,
        SESSION_TIMEOUT_MS: 5000,
        PROFILE_CACHE_TTL_MS: 5 * 60 * 1000,
        CACHE_MAX_SIZE: 500,
        DEBOUNCE_BUSQUEDA_MS: 300,
        DEBOUNCE_FILTRO_MS: 200,
        RETRY_MAX: 3,
        RETRY_BASE_MS: 500,
        CAMPOS_PUBLICOS: 'id, nombre, handle, avatar_url, online, ultima_conexion, verificado'
    };

    const state = {
        initialized: false, cargando: false, session: null, sessionExpira: 0,
        contactos: [], totalContactos: 0, paginaActual: 0, hayMas: true,
        filtroActual: 'todos', textoBusqueda: '',
        busquedaTimer: null, filtroTimer: null, observerScroll: null,
        perfilCache: new Map(), idsContactosSet: new Set()
    };

    /* ============================================================
       HELPERS
       ============================================================ */
    function sb() {
        if (window.supabaseClient && typeof window.supabaseClient.from === 'function') return window.supabaseClient;
        return null;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function normalizarTextoBusqueda(value) {
        return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, CONFIG.MAX_CHARS_BUSQUEDA);
    }

    function obtenerAvatarSeguro(url) {
        if (!url) return '';
        const valor = String(url).trim();
        if (!valor) return '';
        try {
            if (valor.startsWith('/') && !valor.startsWith('//')) return valor;
            const parsed = new URL(valor, window.location.origin);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
            return parsed.href;
        } catch { return ''; }
    }

    function emitirListo() {
        try { window.dispatchEvent(new Event('contactos:listo')); } catch (_) {}
    }

    function debounce(fn, ms) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    function showToast(mensaje, tipo = '') {
        const toast = document.getElementById('toast');
        if (!toast) { console.log(mensaje); return; }
        toast.textContent = String(mensaje ?? '');
        toast.className = 'toast';
        if (tipo) toast.classList.add(tipo);
        requestAnimationFrame(() => toast.classList.add('show'));
        clearTimeout(window.__contactosToastTimer);
        window.__contactosToastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
    }
    window.showToast = showToast;

    /* ============================================================
       MODAL CUSTOM DE CONFIRMACIÓN
       ============================================================ */
    function showConfirm({ title, message, icon = '⚠️', confirmText = 'Aceptar', cancelText = 'Cancelar', danger = true }) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('confirmModalOverlay');
            const iconEl = document.getElementById('confirmModalIcon');
            const titleEl = document.getElementById('confirmModalTitle');
            const msgEl = document.getElementById('confirmModalMessage');
            const cancelBtn = document.getElementById('confirmModalCancel');
            const confirmBtn = document.getElementById('confirmModalConfirm');

            if (!overlay) { resolve(false); return; }

            iconEl.textContent = icon;
            titleEl.textContent = title;
            msgEl.textContent = message;
            cancelBtn.textContent = cancelText;
            confirmBtn.textContent = confirmText;

            if (!danger) {
                confirmBtn.classList.remove('confirm-danger');
                confirmBtn.style.background = 'linear-gradient(135deg, var(--cyan), #00b8d4)';
                confirmBtn.style.borderColor = 'var(--cyan)';
            } else {
                confirmBtn.classList.add('confirm-danger');
                confirmBtn.style.background = '';
                confirmBtn.style.borderColor = '';
            }

            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');

            const finish = (value) => {
                overlay.classList.remove('active');
                overlay.setAttribute('aria-hidden', 'true');
                resolve(value);
            };

            const onCancel = () => finish(false);
            const onConfirm = () => finish(true);
            const onOverlayClick = (e) => { if (e.target === overlay) finish(false); };
            const onEsc = (e) => { if (e.key === 'Escape') finish(false); };

            cancelBtn.addEventListener('click', onCancel, { once: true });
            confirmBtn.addEventListener('click', onConfirm, { once: true });
            overlay.addEventListener('click', onOverlayClick, { once: true });
            document.addEventListener('keydown', onEsc, { once: true });
        });
    }

    /* ============================================================
       SESIÓN CACHEADa
       ============================================================ */
    async function getSession() {
        const ahora = Date.now();
        if (state.session && ahora < state.sessionExpira) return state.session;
        const client = sb();
        if (!client || !client.auth) return null;
        try {
            const resultado = await Promise.race([
                client.auth.getSession(),
                new Promise((resolve) => setTimeout(() => resolve({ data: null, error: new Error('Timeout') }), CONFIG.SESSION_TIMEOUT_MS))
            ]);
            const { data, error } = resultado || {};
            if (error) { console.error('Error obteniendo sesión:', error); return null; }
            const session = data?.session || null;
            state.session = session;
            state.sessionExpira = ahora + 60_000;
            return session;
        } catch (error) { console.error('Excepción obteniendo sesión:', error); return null; }
    }

    /* ============================================================
       RETRY
       ============================================================ */
    async function withRetry(fn, contexto = 'operación') {
        let ultimoError = null;
        for (let intento = 0; intento < CONFIG.RETRY_MAX; intento++) {
            try {
                const resultado = await fn();
                if (resultado && resultado.error) {
                    const err = resultado.error;
                    if (err.code === '23505' || err.code === '42501' || err.code === 'PGRST116') return resultado;
                    throw err;
                }
                return resultado;
            } catch (error) {
                ultimoError = error;
                const esUltimoIntento = intento === CONFIG.RETRY_MAX - 1;
                if (esUltimoIntento) break;
                const delay = CONFIG.RETRY_BASE_MS * Math.pow(2, intento);
                console.warn(`[Contactos] Reintentando ${contexto} en ${delay}ms`, error);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
        throw ultimoError;
    }

    /* ============================================================
       CACHÉ DE PERFILES
       ============================================================ */
    function getPerfilCacheado(id) {
        const entry = state.perfilCache.get(id);
        if (!entry) return null;
        if (Date.now() > entry.expira) { state.perfilCache.delete(id); return null; }
        state.perfilCache.delete(id);
        state.perfilCache.set(id, entry);
        return entry.perfil;
    }

    function setPerfilCache(id, perfil) {
        if (state.perfilCache.size >= CONFIG.CACHE_MAX_SIZE) {
            const primeraClave = state.perfilCache.keys().next().value;
            state.perfilCache.delete(primeraClave);
        }
        state.perfilCache.set(id, { perfil, expira: Date.now() + CONFIG.PROFILE_CACHE_TTL_MS });
    }

    /* ============================================================
       INICIALIZACIÓN
       ============================================================ */
    async function inicializarContactos() {
        if (state.initialized) return;
        state.initialized = true;
        configurarEventos();
        const session = await getSession();
        if (!session) {
            mostrarEstadoVacio('◈', 'Inicia sesión para ver tus contactos.');
            actualizarEstadisticas(0, 0);
            emitirListo();
            return;
        }
        await cargarContactos({ reset: true });
    }

    /* ============================================================
       EVENTOS
       ============================================================ */
    function configurarEventos() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            const onSearch = debounce((valor) => {
                state.textoBusqueda = valor.trim().toLowerCase();
                renderizarContactos();
            }, CONFIG.DEBOUNCE_FILTRO_MS);
            searchInput.addEventListener('input', (e) => onSearch(e.target.value));
        }

        document.querySelectorAll('.filtros .filtro').forEach((boton) => {
            boton.addEventListener('click', () => {
                document.querySelectorAll('.filtros .filtro').forEach((item) => item.classList.remove('active'));
                boton.classList.add('active');
                state.filtroActual = boton.dataset.filtro || 'todos';
                renderizarContactos();
            });
        });

        const modalInput = document.getElementById('searchInputModal');
        if (modalInput) {
            modalInput.addEventListener('input', () => {
                clearTimeout(state.busquedaTimer);
                const texto = normalizarTextoBusqueda(modalInput.value);
                if (texto.length < CONFIG.MIN_CHARS_BUSQUEDA) {
                    mostrarMensajeBusqueda('Escribe al menos 2 caracteres para buscar');
                    return;
                }
                state.busquedaTimer = setTimeout(() => buscarUsuarios(texto), CONFIG.DEBOUNCE_BUSQUEDA_MS);
            });
        }

        const resultados = document.getElementById('resultadosBusqueda');
        if (resultados) {
            resultados.addEventListener('click', manejarClickResultadosBusqueda);
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                cerrarModalBuscar();
                cerrarModalInvitacion();
            }
        });

        document.addEventListener('click', (event) => {
            const buscar = document.getElementById('modalBuscarContacto');
            const invitacion = document.getElementById('modalInvitacion');
            if (buscar && event.target === buscar) cerrarModalBuscar();
            if (invitacion && event.target === invitacion) cerrarModalInvitacion();
        });

        window.addEventListener('beforeunload', cleanup);
    }

    function cleanup() {
        if (state.observerScroll) { state.observerScroll.disconnect(); state.observerScroll = null; }
    }

    function manejarClickResultadosBusqueda(event) {
        const boton = event.target.closest('button[data-action="agregar"]');
        if (!boton) return;
        agregarContacto(boton.dataset.usuarioId || '');
    }

    /* ============================================================
       CARGAR CONTACTOS
       ============================================================ */
    async function cargarContactos({ reset = false } = {}) {
        if (state.cargando) return;
        const client = sb();
        const session = await getSession();
        const lista = document.getElementById('contactosList');
        if (!client || !session) {
            mostrarEstadoVacio('◈', 'Inicia sesión para ver tus contactos.');
            actualizarEstadisticas(0, 0);
            emitirListo();
            return;
        }
        state.cargando = true;
        if (reset) {
            state.paginaActual = 0; state.contactos = []; state.idsContactosSet.clear();
            state.hayMas = true; state.totalContactos = 0;
            mostrarCargando();
        } else { mostrarCargandoMas(); }

        try {
            const desde = state.paginaActual * CONFIG.PAGE_SIZE;
            const hasta = desde + CONFIG.PAGE_SIZE - 1;

            if (reset) {
                const { count } = await withRetry(() =>
                    client.from(CONFIG.CONTACTOS_TABLE)
                        .select('id', { count: 'exact', head: true })
                        .eq('usuario_id', session.user.id), 'contar contactos');
                state.totalContactos = count || 0;
            }

            const { data: contactosRaw, error: errContactos } = await withRetry(() =>
                client.from(CONFIG.CONTACTOS_TABLE)
                    .select('id, usuario_id, contacto_id, es_favorito, estado, fecha, created_at')
                    .eq('usuario_id', session.user.id)
                    .order('fecha', { ascending: false, nullsFirst: false })
                    .range(desde, hasta), 'cargar contactos');

            if (errContactos) throw errContactos;
            const pagina = contactosRaw || [];
            if (pagina.length === 0) {
                state.hayMas = false;
                quitarCargandoMas();
                if (reset) {
                    actualizarEstadisticas(0, 0);
                    mostrarEstadoVacio('◈', 'Aún no tienes contactos agregados.');
                    emitirListo();
                }
                return;
            }

            const idsPagina = pagina.map((c) => c?.contacto_id).filter(Boolean);
            await cargarPerfilesEnLote(idsPagina);

            const enriquecidos = pagina.map((c) => {
                const perfil = getPerfilCacheado(c.contacto_id) || {
                    id: c.contacto_id, nombre: 'Usuario', handle: null, avatar_url: null,
                    online: false, ultima_conexion: null, verificado: false
                };
                state.idsContactosSet.add(c.contacto_id);
                return { ...c, contacto: perfil };
            });

            if (reset) state.contactos = enriquecidos;
            else state.contactos.push(...enriquecidos);

            state.paginaActual++;
            state.hayMas = pagina.length === CONFIG.PAGE_SIZE;
            recalcularEstadisticas();
            renderizarContactos();
            quitarCargandoMas();
            if (reset) emitirListo();
        } catch (error) {
            console.error('Error cargando contactos:', error);
            quitarCargandoMas();
            if (reset) {
                state.contactos = []; actualizarEstadisticas(0, 0);
                mostrarEstadoVacio('⚠️', 'No se pudieron cargar los contactos.');
                showToast('❌ Error al cargar contactos', 'error');
                emitirListo();
            } else { showToast('❌ Error al cargar más contactos', 'error'); }
        } finally { state.cargando = false; }
    }

    async function cargarPerfilesEnLote(ids) {
        const client = sb();
        if (!client) return;
        const faltantes = ids.filter((id) => !getPerfilCacheado(id));
        if (faltantes.length === 0) return;
        const CHUNK_SIZE = 100;
        for (let i = 0; i < faltantes.length; i += CHUNK_SIZE) {
            const chunk = faltantes.slice(i, i + CHUNK_SIZE);
            try {
                const { data, error } = await withRetry(() =>
                    client.from(CONFIG.PERFILES_VISTA)
                        .select(CONFIG.CAMPOS_PUBLICOS).in('id', chunk), 'cargar perfiles');
                if (error) { console.warn('Error cargando chunk de perfiles:', error); continue; }
                (data || []).forEach((perfil) => setPerfilCache(perfil.id, perfil));
            } catch (error) { console.warn('Error en chunk:', error); }
        }
    }

    window.cargarContactos = () => cargarContactos({ reset: true });

    function normalizarContacto(item) {
        const usuario = item?.contacto || {};
        const nombre = usuario.nombre || usuario.handle || 'Usuario';
        const handle = usuario.handle || '';
        return {
            id: item?.id || null,
            contacto_id: item?.contacto_id || null,
            nombre: String(nombre),
            handle: String(handle),
            avatar_url: obtenerAvatarSeguro(usuario.avatar_url),
            online: usuario.online === true,
            verificado: usuario.verificado === true,
            es_favorito: item?.es_favorito === true,
            estado: item?.estado || 'activo',
            fecha: item?.fecha || item?.created_at || null,
            ultima_conexion: usuario.ultima_conexion || null
        };
    }

    /* ============================================================
       RENDER
       ============================================================ */
    function renderizarContactos() {
        const lista = document.getElementById('contactosList');
        if (!lista) return;
        let listaContactos = state.contactos.map(normalizarContacto);

        if (state.filtroActual === 'online') listaContactos = listaContactos.filter((c) => c.online);
        if (state.filtroActual === 'favoritos') listaContactos = listaContactos.filter((c) => c.es_favorito);
        if (state.filtroActual === 'recientes') {
            listaContactos = listaContactos.filter((c) => c.fecha)
                .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                .slice(0, 10);
        }
        if (state.textoBusqueda) {
            const q = state.textoBusqueda;
            listaContactos = listaContactos.filter((c) =>
                c.nombre.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q));
        }

        if (!listaContactos.length) {
            mostrarEstadoVacio('◈', state.textoBusqueda ? 'No se encontraron contactos.' : 'No hay contactos para este filtro.');
            return;
        }

        lista.innerHTML = listaContactos.map(renderizarTarjeta).join('') +
            (state.hayMas ? '<div id="cargandoMasSentinel" style="height:1px;"></div>' : '');

        configurarScrollInfinito();
    }

    /* ============================================================
       TARJETA CON BOTONES CLAROS Y LÓGICA DE SOLICITUDES
       ============================================================ */
    function renderizarTarjeta(contacto) {
        const inicial = escapeHtml((contacto.nombre || 'U').charAt(0).toUpperCase());
        const avatar = contacto.avatar_url
            ? `<img src="${escapeHtml(contacto.avatar_url)}" alt="${escapeHtml(contacto.nombre)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove();">`
            : inicial;

        let estadoTexto = 'Desconectado';
        if (contacto.estado === 'pendiente') estadoTexto = 'Solicitud pendiente';
        else if (contacto.online) estadoTexto = 'En línea';

        const handleTexto = contacto.handle ? `@${String(contacto.handle).replace(/^@/, '')}` : '';
        const favorito = contacto.es_favorito ? 'active' : '';
        const verificado = contacto.verificado ? `<span class="verified">✓ Verificado</span>` : '';
        const favoritoNuevo = contacto.es_favorito ? 'false' : 'true';
        const contactoIdSeguro = escapeHtml(contacto.contacto_id);
        const filaIdSeguro = escapeHtml(contacto.id);

        // Lógica: Si está pendiente, muestra Aceptar/Rechazar. Si no, muestra Mensaje/Llamar.
        const esPendiente = contacto.estado === 'pendiente';
        const botonesAccion = esPendiente 
            ? `
                <button type="button" class="aceptar" title="Aceptar solicitud" onclick="window.aceptarSolicitud('${filaIdSeguro}', '${contactoIdSeguro}')">
                    ✓ Aceptar
                </button>
                <button type="button" class="rechazar" title="Rechazar solicitud" onclick="window.rechazarSolicitud('${filaIdSeguro}', '${contactoIdSeguro}')">
                    ✕ Rechazar
                </button>
            `
            : `
                <button type="button" class="mensaje" title="Enviar mensaje" onclick="window.abrirMensaje('${contactoIdSeguro}')">
                    ◈ Mensaje
                </button>
                <button type="button" class="llamar" title="Llamar" onclick="window.llamarContacto('${contactoIdSeguro}')">
                    ☎ Llamar
                </button>
            `;

        return `
            <article class="contacto-card ${esPendiente ? 'pendiente' : ''}" data-contacto-id="${contactoIdSeguro}" onclick="${esPendiente ? '' : `window.abrirMensaje('${contactoIdSeguro}')`}">
                <div class="contacto-avatar ${contacto.online ? 'online' : ''}">
                    ${avatar}
                    ${contacto.online ? '<span class="online-dot"></span>' : ''}
                    ${contacto.es_favorito ? '<span class="favorito-badge">◆</span>' : ''}
                </div>
                <div class="contacto-info">
                    <div class="nombre">${escapeHtml(contacto.nombre)} ${verificado}</div>
                    <div class="estado ${contacto.online ? 'online' : ''}">${escapeHtml(estadoTexto)}</div>
                    ${handleTexto ? `<div class="contacto-meta">${escapeHtml(handleTexto)}</div>` : ''}
                </div>
                <div class="contacto-actions" onclick="event.stopPropagation();">
                    ${botonesAccion}
                    ${!esPendiente ? `
                        <button type="button" class="favorito ${favorito}" title="Favorito" onclick="window.toggleFavorito('${filaIdSeguro}', ${favoritoNuevo})">
                            ◆ Favorito
                        </button>
                        <button type="button" class="bloquear" title="Bloquear" onclick="window.bloquearContacto('${contactoIdSeguro}')">
                            ⛔ Bloquear
                        </button>
                        <button type="button" class="eliminar" title="Eliminar" onclick="window.eliminarContacto('${filaIdSeguro}')">
                            ✕ Eliminar
                        </button>
                    ` : ''}
                </div>
            </article>
        `;
    }

    /* ============================================================
       SCROLL INFINITO
       ============================================================ */
    function configurarScrollInfinito() {
        if (state.observerScroll) state.observerScroll.disconnect();
        const sentinel = document.getElementById('cargandoMasSentinel');
        if (!sentinel) return;
        state.observerScroll = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && state.hayMas && !state.cargando) {
                cargarContactos({ reset: false });
            }
        }, { rootMargin: '300px', threshold: 0 });
        state.observerScroll.observe(sentinel);
    }

    /* ============================================================
       ESTADOS VISUALES
       ============================================================ */
    function mostrarCargando() {
        const lista = document.getElementById('contactosList');
        if (!lista) return;
        lista.setAttribute('aria-busy', 'true');
        lista.innerHTML = Array(5).fill(`
            <div class="contacto-card skeleton">
                <div class="contacto-avatar"></div>
                <div class="contacto-info">
                    <div class="skeleton-line" style="width:60%;"></div>
                    <div class="skeleton-line" style="width:40%;"></div>
                </div>
            </div>
        `).join('');
    }

    function mostrarCargandoMas() {
        const lista = document.getElementById('contactosList');
        if (!lista) return;
        if (document.getElementById('cargandoMasIndicador')) return;
        const div = document.createElement('div');
        div.id = 'cargandoMasIndicador';
        div.style.cssText = 'text-align:center;padding:16px;color:var(--text-muted);font-size:0.75rem;';
        div.textContent = '◈ Cargando más...';
        lista.appendChild(div);
    }

    function quitarCargandoMas() {
        const el = document.getElementById('cargandoMasIndicador');
        if (el) el.remove();
    }

    function mostrarEstadoVacio(icono, mensaje) {
        const lista = document.getElementById('contactosList');
        if (!lista) return;
        lista.setAttribute('aria-busy', 'false');
        lista.innerHTML = `
            <div class="empty-state">
                <span class="icon">${escapeHtml(icono)}</span>
                <h3>${escapeHtml(mensaje)}</h3>
                ${state.contactos.length === 0 ? `
                    <button type="button" class="btn-accion" data-contactos-action="agregar">◆ Agregar contacto</button>
                ` : ''}
            </div>
        `;
        const boton = lista.querySelector('[data-contactos-action="agregar"]');
        if (boton) boton.addEventListener('click', abrirAgregarContacto, { once: true });
    }

    function recalcularEstadisticas() {
        const total = state.totalContactos;
        const online = state.contactos.filter((c) => c?.contacto?.online === true).length;
        actualizarEstadisticas(total, online);
    }

    function actualizarEstadisticas(total, online) {
        const totalEl = document.getElementById('totalContactos');
        const onlineEl = document.getElementById('onlineContactos');
        if (totalEl) totalEl.textContent = String(total);
        if (onlineEl) onlineEl.textContent = String(online);
    }

    /* ============================================================
       MODALES
       ============================================================ */
    function abrirAgregarContacto() {
        const modal = document.getElementById('modalBuscarContacto');
        if (!modal) return;
        modal.classList.add('show', 'active');
        modal.setAttribute('aria-hidden', 'false');
        const input = document.getElementById('searchInputModal');
        const resultados = document.getElementById('resultadosBusqueda');
        if (input) { input.value = ''; clearTimeout(state.busquedaTimer); setTimeout(() => input.focus(), 100); }
        if (resultados) {
            resultados.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.75rem;">Escribe al menos 2 caracteres para buscar</div>`;
        }
    }
    window.abrirAgregarContacto = abrirAgregarContacto;

    function cerrarModalBuscar() {
        const modal = document.getElementById('modalBuscarContacto');
        if (!modal) return;
        modal.classList.remove('show', 'active');
        modal.setAttribute('aria-hidden', 'true');
    }
    window.cerrarModalBuscar = cerrarModalBuscar;

    function cerrarModalInvitacion() {
        const modal = document.getElementById('modalInvitacion');
        if (!modal) return;
        modal.classList.remove('show', 'active');
        modal.setAttribute('aria-hidden', 'true');
    }
    window.cerrarModalInvitacion = cerrarModalInvitacion;

    /* ============================================================
       BUSCAR USUARIOS
       ============================================================ */
    async function buscarUsuarios(texto) {
        const client = sb();
        const session = await getSession();
        if (!client || !session) { mostrarMensajeBusqueda('Inicia sesión para buscar contactos.'); return; }
        const termino = normalizarTextoBusqueda(texto).replace(/^@+/, '').trim();
        if (termino.length < CONFIG.MIN_CHARS_BUSQUEDA) { mostrarMensajeBusqueda('Escribe al menos 2 caracteres para buscar'); return; }
        try {
            const patron = `%${termino}%`;
            const [resultadoNombre, resultadoHandle] = await Promise.all([
                withRetry(() => client.from(CONFIG.PERFILES_VISTA).select(CONFIG.CAMPOS_PUBLICOS).neq('id', session.user.id).ilike('nombre', patron).limit(CONFIG.MAX_RESULTADOS_BUSQUEDA), 'buscar por nombre'),
                withRetry(() => client.from(CONFIG.PERFILES_VISTA).select(CONFIG.CAMPOS_PUBLICOS).neq('id', session.user.id).ilike('handle', patron).limit(CONFIG.MAX_RESULTADOS_BUSQUEDA), 'buscar por handle')
            ]);
            const errores = [resultadoNombre.error, resultadoHandle.error].filter(Boolean);
            if (errores.length) throw errores[0];
            const mapa = new Map();
            [...(resultadoNombre.data || []), ...(resultadoHandle.data || [])].forEach((usuario) => {
                if (usuario?.id && !mapa.has(usuario.id)) { mapa.set(usuario.id, usuario); setPerfilCache(usuario.id, usuario); }
            });
            const usuarios = Array.from(mapa.values()).slice(0, CONFIG.MAX_RESULTADOS_BUSQUEDA);
            if (!usuarios.length) { mostrarMensajeBusqueda('No se encontraron usuarios.'); return; }
            const idsContactos = state.idsContactosSet;
            let idsBloqueados = new Set();
            try {
                const { data: bloqueados } = await client.from(CONFIG.BLOQUEOS_TABLE).select('bloqueado_id').eq('usuario_id', session.user.id);
                if (Array.isArray(bloqueados)) idsBloqueados = new Set(bloqueados.map((b) => b?.bloqueado_id).filter(Boolean));
            } catch (e) { console.warn('No se pudo consultar bloqueos:', e); }
            const disponibles = usuarios.filter((u) => !idsContactos.has(u.id) && !idsBloqueados.has(u.id));
            if (!disponibles.length) { mostrarMensajeBusqueda('Los usuarios encontrados ya están en tus contactos o están bloqueados.'); return; }
            renderizarResultadosBusqueda(disponibles);
        } catch (error) { console.error('Error buscando usuarios:', error); mostrarMensajeBusqueda('No fue posible realizar la búsqueda.'); }
    }

    function renderizarResultadosBusqueda(usuarios) {
        const contenedor = document.getElementById('resultadosBusqueda');
        if (!contenedor) return;
        contenedor.innerHTML = usuarios.map((usuario) => {
            const inicial = (usuario.nombre || usuario.handle || 'U').charAt(0).toUpperCase();
            const avatarUrl = obtenerAvatarSeguro(usuario.avatar_url);
            const avatar = avatarUrl
                ? `<img src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">`
                : `<div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--green-deep),var(--cyan));color:white;">${escapeHtml(inicial)}</div>`;
            const nombre = usuario.nombre || usuario.handle || 'Usuario';
            const handle = usuario.handle || '';
            return `
                <div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid rgba(0,229,255,0.1);">
                    ${avatar}
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;color:var(--text-primary);">${escapeHtml(nombre)} ${usuario.verificado ? '<span style="color:var(--gold);font-size:0.6rem;">✓</span>' : ''}</div>
                        ${handle ? `<div style="color:var(--text-muted);font-size:0.65rem;">@${escapeHtml(String(handle).replace(/^@/, ''))}</div>` : ''}
                    </div>
                    <button type="button" class="btn-agregar" data-action="agregar" data-usuario-id="${escapeHtml(usuario.id)}" style="padding:7px 12px;font-size:0.65rem;">◆ Agregar</button>
                </div>
            `;
        }).join('');
    }

    function mostrarMensajeBusqueda(mensaje) {
        const contenedor = document.getElementById('resultadosBusqueda');
        if (!contenedor) return;
        contenedor.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.75rem;">${escapeHtml(mensaje)}</div>`;
    }

    /* ============================================================
       AGREGAR CONTACTO (Envía solicitud pendiente)
       ============================================================ */
    async function agregarContacto(contactoId) {
        const client = sb();
        const session = await getSession();
        if (!client || !session) { showToast('⚠️ Inicia sesión', 'error'); return; }
        if (!contactoId) return;
        if (contactoId === session.user.id) { showToast('⚠️ No puedes agregarte a ti mismo', 'warning'); return; }
        if (state.idsContactosSet.has(contactoId)) { showToast('⚠️ Ya es tu contacto', 'warning'); return; }
        
        try {
            // Ahora insertamos con estado 'pendiente'
            const { error } = await withRetry(() =>
                client.from(CONFIG.CONTACTOS_TABLE).insert({
                    usuario_id: session.user.id, 
                    contacto_id: contactoId, 
                    estado: 'pendiente', 
                    es_favorito: false
                }), 'enviar solicitud de amistad');
            if (error) {
                if (error.code === '23505') { showToast('⚠️ Ya enviaste una solicitud a este usuario', 'warning'); return; }
                throw error;
            }
            showToast('✅ Solicitud de amistad enviada', 'success');
            const input = document.getElementById('searchInputModal');
            if (input) input.value = '';
            const resultados = document.getElementById('resultadosBusqueda');
            if (resultados) resultados.innerHTML = '';
            cerrarModalBuscar();
            await cargarContactos({ reset: true });
        } catch (error) { console.error('Error agregando contacto:', error); showToast('❌ No se pudo enviar la solicitud', 'error'); }
    }
    window.agregarContacto = agregarContacto;

    /* ============================================================
       ACEPTAR / RECHAZAR SOLICITUD
       ============================================================ */
    async function aceptarSolicitud(contactoRowId, otroUsuarioId) {
        const client = sb();
        const session = await getSession();
        if (!client || !session) return;
        try {
            // 1. Mi fila pasa a 'activo'
            await withRetry(() => client.from(CONFIG.CONTACTOS_TABLE)
                .update({ estado: 'activo' }).eq('id', contactoRowId), 'aceptar solicitud propia');
            
            // 2. La fila del otro usuario también pasa a 'activo'
            await withRetry(() => client.from(CONFIG.CONTACTOS_TABLE)
                .update({ estado: 'activo' })
                .eq('usuario_id', otroUsuarioId)
                .eq('contacto_id', session.user.id), 'aceptar solicitud del otro');

            showToast('✅ Amistad aceptada', 'success');
            await cargarContactos({ reset: true });
        } catch (e) { console.error('Error aceptando:', e); showToast('❌ Error al aceptar la solicitud', 'error'); }
    }
    window.aceptarSolicitud = aceptarSolicitud;

    async function rechazarSolicitud(contactoRowId, otroUsuarioId) {
        const client = sb();
        const session = await getSession();
        if (!client || !session) return;
        try {
            // 1. Borramos la fila que me envió
            await withRetry(() => client.from(CONFIG.CONTACTOS_TABLE)
                .delete().eq('id', contactoRowId), 'rechazar solicitud');
            
            // 2. Borramos la fila que yo le envié (si existe)
            await withRetry(() => client.from(CONFIG.CONTACTOS_TABLE)
                .delete()
                .eq('usuario_id', session.user.id)
                .eq('contacto_id', otroUsuarioId), 'limpiar solicitud enviada');

            showToast('❌ Solicitud rechazada', 'info');
            await cargarContactos({ reset: true });
        } catch (e) { console.error('Error rechazando:', e); showToast('❌ Error al rechazar la solicitud', 'error'); }
    }
    window.rechazarSolicitud = rechazarSolicitud;

    /* ============================================================
       FAVORITO
       ============================================================ */
    async function toggleFavorito(contactoRowId, nuevoValor) {
        const client = sb();
        const session = await getSession();
        if (!client || !session) { showToast('⚠️ Inicia sesión', 'error'); return; }
        if (!contactoRowId) return;
        const item = state.contactos.find((c) => c.id === contactoRowId);
        const valorAnterior = item?.es_favorito;
        if (item) { item.es_favorito = nuevoValor === true; renderizarContactos(); }
        try {
            const { error } = await withRetry(() =>
                client.from(CONFIG.CONTACTOS_TABLE).update({ es_favorito: nuevoValor === true }).eq('id', contactoRowId).eq('usuario_id', session.user.id), 'actualizar favorito');
            if (error) throw error;
            showToast(nuevoValor ? '◆ Agregado a favoritos' : '◇ Eliminado de favoritos', 'success');
        } catch (error) {
            console.error('Error actualizando favorito:', error);
            if (item) { item.es_favorito = valorAnterior; renderizarContactos(); }
            showToast('❌ No se pudo actualizar favorito', 'error');
        }
    }
    window.toggleFavorito = toggleFavorito;

    /* ============================================================
       ELIMINAR CONTACTO (modal custom)
       ============================================================ */
    async function eliminarContacto(contactoRowId) {
        const client = sb();
        const session = await getSession();
        if (!client || !session) { showToast('⚠️ Inicia sesión', 'error'); return; }
        if (!contactoRowId) return;

        const confirmado = await showConfirm({
            title: 'Eliminar contacto',
            message: '¿Quieres eliminar este contacto de tu lista? Esta acción no se puede deshacer.',
            icon: '🗑️',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            danger: true
        });
        if (!confirmado) return;

        const backup = [...state.contactos];
        const backupSet = new Set(state.idsContactosSet);
        const backupTotal = state.totalContactos;

        state.contactos = state.contactos.filter((c) => c.id !== contactoRowId);
        const eliminado = backup.find((c) => c.id === contactoRowId);
        if (eliminado?.contacto_id) state.idsContactosSet.delete(eliminado.contacto_id);
        state.totalContactos = Math.max(0, state.totalContactos - 1);
        renderizarContactos();
        recalcularEstadisticas();

        try {
            const { error } = await withRetry(() =>
                client.from(CONFIG.CONTACTOS_TABLE).delete().eq('id', contactoRowId).eq('usuario_id', session.user.id), 'eliminar contacto');
            if (error) throw error;
            showToast('✅ Contacto eliminado', 'success');
        } catch (error) {
            console.error('Error eliminando contacto:', error);
            state.contactos = backup;
            state.idsContactosSet = backupSet;
            state.totalContactos = backupTotal;
            renderizarContactos();
            recalcularEstadisticas();
            showToast('❌ No se pudo eliminar el contacto', 'error');
        }
    }
    window.eliminarContacto = eliminarContacto;

    /* ============================================================
       BLOQUEAR CONTACTO (modal custom)
       ============================================================ */
    async function bloquearContacto(contactoId) {
        const client = sb();
        const session = await getSession();
        if (!client || !session) { showToast('⚠️ Inicia sesión', 'error'); return; }
        if (!contactoId) return;
        if (contactoId === session.user.id) { showToast('⚠️ No puedes bloquearte a ti mismo', 'warning'); return; }

        const confirmado = await showConfirm({
            title: 'Bloquear usuario',
            message: '¿Quieres bloquear a este usuario? No podrá llamarte ni tú a él.',
            icon: '⛔',
            confirmText: 'Bloquear',
            cancelText: 'Cancelar',
            danger: true
        });
        if (!confirmado) return;

        try {
            const { error } = await withRetry(() =>
                client.rpc(CONFIG.RPC_BLOQUEAR, { p_contacto_id: contactoId }), 'bloquear contacto');
            if (error) throw error;
            showToast('⛔ Usuario bloqueado', 'success');
            await cargarContactos({ reset: true });
        } catch (error) { console.error('Error bloqueando contacto:', error); showToast('❌ No se pudo bloquear al usuario', 'error'); }
    }
    window.bloquearContacto = bloquearContacto;

    /* ============================================================
       LLAMAR CONTACTO (con acción)
       ============================================================ */
    function llamarContacto(contactoId) {
        if (!contactoId) return;
        window.location.href = `/features/mensajes/mensajes.html?usuario=${encodeURIComponent(contactoId)}&accion=llamada`;
    }
    window.llamarContacto = llamarContacto;

    /* ============================================================
       MENSAJE (chat directo)
       ============================================================ */
    function abrirMensaje(contactoId) {
        if (!contactoId) return;
        window.location.href = `/features/mensajes/mensajes.html?usuario=${encodeURIComponent(contactoId)}`;
    }
    window.abrirMensaje = abrirMensaje;

    /* ============================================================
       INVITACIONES
       ============================================================ */
    async function invitarContacto() {
        const client = sb();
        const session = await getSession();
        if (!client || !session) { showToast('⚠️ Inicia sesión para invitar', 'error'); return; }
        const modal = document.getElementById('modalInvitacion');
        const codigoElemento = document.getElementById('codigoInvitacion');
        if (modal) { modal.classList.add('show', 'active'); modal.setAttribute('aria-hidden', 'false'); }
        if (codigoElemento) codigoElemento.textContent = '⏳ Generando...';
        try {
            const { data, error } = await withRetry(() => client.rpc(CONFIG.RPC_INVITACION), 'generar invitación');
            if (error) throw error;
            const invitacion = Array.isArray(data) ? data[0] : data;
            if (!invitacion?.codigo) throw new Error('Supabase no devolvió un código de invitación.');
            if (codigoElemento) codigoElemento.textContent = String(invitacion.codigo);
        } catch (error) {
            console.error('Error generando invitación:', error);
            if (codigoElemento) codigoElemento.textContent = 'ERROR';
            showToast('❌ No se pudo generar la invitación', 'error');
        }
    }
    window.invitarContacto = invitarContacto;

    /* ============================================================
       COPIAR INVITACIÓN
       ============================================================ */
    async function copiarCodigoInvitacion() {
        const elemento = document.getElementById('codigoInvitacion');
        if (!elemento) return;
        const codigo = elemento.textContent.trim();
        if (!codigo || codigo === '⏳ Generando...' || codigo === 'ERROR') return;
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(codigo);
            } else {
                const temporal = document.createElement('textarea');
                temporal.value = codigo;
                temporal.setAttribute('readonly', '');
                temporal.style.position = 'fixed';
                temporal.style.opacity = '0';
                document.body.appendChild(temporal);
                temporal.select();
                const ok = document.execCommand('copy');
                temporal.remove();
                if (!ok) throw new Error('No se pudo copiar');
            }
            showToast('📋 Código copiado', 'success');
        } catch (error) { console.error('Error copiando código:', error); showToast('❌ No se pudo copiar el código', 'error'); }
    }
    window.copiarCodigoInvitacion = copiarCodigoInvitacion;

    /* ============================================================
       ARRANQUE
       ============================================================ */
    function esperarSupabase() {
        let intentos = 0;
        const timer = setInterval(async () => {
            intentos++;
            if (sb()) { clearInterval(timer); await inicializarContactos(); return; }
            if (intentos >= 100) {
                clearInterval(timer);
                console.error('❌ Supabase no estuvo disponible.');
                mostrarEstadoVacio('⚠️', 'No se pudo inicializar la conexión.');
                emitirListo();
            }
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', esperarSupabase, { once: true });
    } else { esperarSupabase(); }
})();