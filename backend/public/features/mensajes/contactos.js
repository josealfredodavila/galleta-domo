/* ============================================================
   CSARIEL'S · CONTACTOS · MESSENGER EXPERIENCE v12
   ============================================================ */
(function () {
    'use strict';

    // Si no estamos en contactos.html, abortar silenciosamente (Evita errores en mensajes.html)
    if (!document.getElementById('contactosVistaAmigos')) {
        console.log('[Contactos] DOM no encontrado. Saltando inicialización en esta página.');
        return;
    }

    var CONFIG = {
        CONTACTOS_TABLE: 'contactos',
        PERFILES_VISTA: 'perfiles_publicos',
        BLOQUEOS_TABLE: 'bloqueos',
        RPC_INVITACION: 'obtener_o_crear_invitacion',
        PAGE_SIZE: 30, MAX_RESULTADOS_BUSQUEDA: 20, MAX_SUGERENCIAS: 10,
        MIN_CHARS_BUSQUEDA: 2, MAX_CHARS_BUSQUEDA: 80,
        SESSION_TIMEOUT_MS: 7000, PROFILE_CACHE_TTL_MS: 300000, CACHE_MAX_SIZE: 500,
        DEBOUNCE_BUSQUEDA_MS: 350, DEBOUNCE_FILTRO_MS: 200, RETRY_MAX: 3, RETRY_BASE_MS: 500,
        CAMPOS_PUBLICOS: 'id, nombre, handle, avatar_url, online, ultima_conexion, verificado'
    };

    var state = {
        initialized: false, inicializando: false, cargando: false,
        session: null, sessionExpira: 0,
        contactos: [], totalContactos: 0, paginaActual: 0, hayMas: true,
        filtroActual: 'amigos', textoBusqueda: '',
        busquedaTimer: null, filtroTimer: null, observerScroll: null,
        perfilCache: new Map(), idsContactosSet: new Set(),
        busquedaVersion: 0, operacionEnCurso: new Set()
    };

    var SVG_ICONS = {
        mensaje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>',
        llamar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92Z"/></svg>',
        favorito: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',
        favoritoOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',
        bloquear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m5.64 5.64 12.72 12.72"/></svg>',
        eliminar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
        cancelar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>',
        agregarAmigo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M19 8v6"/><path d="M16 11h6"/></svg>'
    };

    function sb() { return window.supabaseClient || null; }

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

    function debounce(fn, ms) {
        var timer = null;
        return function () {
            var contexto = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(contexto, args); }, ms);
        };
    }

    function emitirListo() { try { window.dispatchEvent(new Event('contactos:listo')); } catch (e) {} }

    function showToast(mensaje, tipo) {
        if (typeof window.showToast === 'function') return window.showToast(mensaje, tipo);
        var toast = document.getElementById('toast');
        if (!toast) { console.log('[Csariel’s Contactos]', mensaje); return; }
        toast.textContent = String(mensaje || '');
        toast.className = 'toast' + (tipo ? ' ' + tipo : '');
        requestAnimationFrame(function () { toast.classList.add('show'); });
        clearTimeout(window.__contactosToastTimer);
        window.__contactosToastTimer = setTimeout(function () { toast.classList.remove('show'); }, 3500);
    }

    async function getSession() {
        var ahora = Date.now();
        if (state.session && ahora < state.sessionExpira) return state.session;
        var client = sb();
        if (!client || !client.auth) return null;
        try {
            var resultado = await Promise.race([
                client.auth.getSession(),
                new Promise(function (resolve) { setTimeout(function () { resolve({ data: null, error: new Error('Timeout') }); }, CONFIG.SESSION_TIMEOUT_MS); })
            ]);
            if (resultado.error) return null;
            state.session = resultado.data && resultado.data.session ? resultado.data.session : null;
            state.sessionExpira = ahora + 60000;
            return state.session;
        } catch (error) { return null; }
    }

    function getPerfilCacheado(id) {
        var entry = state.perfilCache.get(id);
        if (!entry) return null;
        if (Date.now() > entry.expira) { state.perfilCache.delete(id); return null; }
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
        var faltantes = Array.from(new Set(ids.filter(Boolean))).filter(function (id) { return !getPerfilCacheado(id); });
        if (!faltantes.length) return;
        for (var i = 0; i < faltantes.length; i += 100) {
            var chunk = faltantes.slice(i, i + 100);
            try {
                var resultado = await client.from(CONFIG.PERFILES_VISTA).select(CONFIG.CAMPOS_PUBLICOS).in('id', chunk);
                (resultado.data || []).forEach(function (p) { setPerfilCache(p.id, p); });
            } catch (e) {}
        }
    }

    /* ============================================================
       CONTROL DE PESTAÑAS
       ============================================================ */
    function cambiarPestana(pestana) {
        state.filtroActual = pestana;
        var vAmigos = document.getElementById('contactosVistaAmigos');
        var vSol = document.getElementById('contactosVistaSolicitudes');
        var vBloq = document.getElementById('contactosVistaBloqueados');
        var barra = document.getElementById('barraBusquedaPrincipal');

        if (vAmigos) vAmigos.classList.remove('active');
        if (vSol) vSol.classList.remove('active');
        if (vBloq) vBloq.classList.remove('active');

        if (pestana === 'solicitudes') {
            if (vSol) vSol.classList.add('active');
            if (barra) barra.style.display = 'none';
            cargarSolicitudesUI();
        } else if (pestana === 'bloqueados') {
            if (vBloq) vBloq.classList.add('active');
            if (barra) barra.style.display = 'none';
            cargarBloqueadosUI();
        } else {
            if (vAmigos) vAmigos.classList.add('active');
            if (barra) barra.style.display = 'flex';
            renderizarContactos();
        }
    }

    /* ============================================================
       CARGA DE CONTACTOS (Amigos)
       ============================================================ */
    async function cargarContactos(opciones) {
        opciones = opciones || {};
        var reset = opciones.reset === true;
        if (state.cargando) return;
        var client = sb();
        var session = await getSession();
        if (!client || !session) return;

        state.cargando = true;
        var lista = document.getElementById('contactosList');

        if (reset) {
            state.paginaActual = 0; state.contactos = []; state.idsContactosSet.clear();
            state.hayMas = true; state.totalContactos = 0;
            if (lista) lista.innerHTML = '<div class="empty-state"><h3>Cargando...</h3></div>';
        }

        try {
            var desde = state.paginaActual * CONFIG.PAGE_SIZE;
            var hasta = desde + CONFIG.PAGE_SIZE - 1;

            var resultado = await client.from(CONFIG.CONTACTOS_TABLE)
                .select('id, usuario_id, contacto_id, es_favorito, estado, fecha, created_at')
                .eq('usuario_id', session.user.id)
                .eq('estado', 'activo')
                .order('fecha', { ascending: false, nullsFirst: false })
                .range(desde, hasta);

            if (resultado.error) throw resultado.error;
            var pagina = resultado.data || [];

            if (!pagina.length) {
                state.hayMas = false;
                if (reset) { state.totalContactos = state.contactos.length; renderizarContactos(); }
                return;
            }

            await cargarPerfilesEnLote(pagina.map(function (c) { return c.contacto_id; }));

            var enriquecidos = pagina.map(function (c) {
                var perfil = getPerfilCacheado(c.contacto_id) || { id: c.contacto_id, nombre: 'Usuario', handle: null };
                state.idsContactosSet.add(c.contacto_id);
                return Object.assign({}, c, { contacto: perfil });
            });

            if (reset) state.contactos = enriquecidos;
            else state.contactos = state.contactos.concat(enriquecidos);

            state.paginaActual++;
            state.hayMas = pagina.length === CONFIG.PAGE_SIZE;
            state.totalContactos = state.contactos.length;
            renderizarContactos();
        } catch (error) {
            console.error('[Contactos] Error:', error);
            if (reset && lista) lista.innerHTML = '<div class="empty-state"><h3>Error al cargar contactos.</h3></div>';
        } finally { state.cargando = false; }
    }

    function renderizarContactos() {
        var lista = document.getElementById('contactosList');
        if (!lista) return;

        var filtrados = state.contactos;
        if (state.filtroActual === 'favoritos') filtrados = filtrados.filter(function (c) { return c.es_favorito; });
        if (state.textoBusqueda) {
            var q = state.textoBusqueda;
            filtrados = filtrados.filter(function (c) {
                var n = (c.contacto.nombre || '').toLowerCase();
                var h = (c.contacto.handle || '').toLowerCase();
                return n.includes(q) || h.includes(q);
            });
        }

        if (!filtrados.length) {
            lista.innerHTML = '<div class="empty-state"><span class="icon">◈</span><h3>' + (state.filtroActual === 'favoritos' ? 'No tienes favoritos.' : 'No se encontraron contactos.') + '</h3></div>';
            return;
        }

        lista.innerHTML = filtrados.map(renderizarTarjeta).join('');
        if (state.hayMas && !state.textoBusqueda && state.filtroActual === 'amigos') {
            lista.innerHTML += '<div id="cargandoMasSentinel" class="contactos-sentinel"></div>';
            configurarScrollInfinito();
        }
    }

    function renderizarTarjeta(c) {
        var p = c.contacto;
        var nombre = escapeHtml(p.nombre || p.handle || 'Usuario');
        var handle = p.handle ? '@' + escapeHtml(p.handle.replace(/^@/, '')) : '';
        var avatarUrl = obtenerAvatarSeguro(p.avatar_url);
        var avatar = avatarUrl ? '<img src="' + escapeHtml(avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : escapeHtml(obtenerInicial(p.nombre));
        var esFav = c.es_favorito;
        var btnFav = esFav ? SVG_ICONS.favorito : SVG_ICONS.favoritoOutline;

        return `
            <article class="contacto-card" data-contacto-id="${escapeHtml(c.contacto_id)}" data-fila-id="${escapeHtml(c.id)}">
                <div class="contacto-avatar" style="position:relative;">
                    ${avatar}
                    ${p.online ? '<span class="online-dot visible"></span>' : ''}
                    ${esFav ? '<span class="favorito-badge">★</span>' : ''}
                </div>
                <div class="contacto-info">
                    <div class="nombre">${nombre} ${p.verificado ? '<span class="verified">✓</span>' : ''}</div>
                    <div class="estado ${p.online ? 'online' : 'offline'}"><span class="estado-indicador"></span> ${p.online ? 'En línea' : 'Desconectado'}</div>
                    ${handle ? '<div class="contacto-meta">' + handle + '</div>' : ''}
                </div>
                <div class="contacto-actions">
                    <button type="button" class="mensaje" data-accion="mensaje">${SVG_ICONS.mensaje}</button>
                    <button type="button" class="favorito ${esFav ? 'active' : ''}" data-accion="favorito">${btnFav}</button>
                    <button type="button" class="bloquear" data-accion="bloquear">${SVG_ICONS.bloquear}</button>
                    <button type="button" class="eliminar" data-accion="eliminar">${SVG_ICONS.eliminar}</button>
                </div>
            </article>
        `;
    }

    function configurarScrollInfinito() {
        if (state.observerScroll) state.observerScroll.disconnect();
        var sentinel = document.getElementById('cargandoMasSentinel');
        if (!sentinel) return;
        state.observerScroll = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting && state.hayMas && !state.cargando) cargarContactos({ reset: false });
        }, { rootMargin: '300px' });
        state.observerScroll.observe(sentinel);
    }

    /* ============================================================
       SOLICITUDES Y BLOQUEADOS
       ============================================================ */
    async function cargarSolicitudesUI() {
        var db = sb(); var session = await getSession();
        var cont = document.getElementById('solicitudesPendientesLista');
        if (!db || !session || !cont) return;

        cont.innerHTML = '<div class="empty-state"><h3>Cargando...</h3></div>';
        try {
            var r = await db.from(CONFIG.CONTACTOS_TABLE).select('id, usuario_id').eq('contacto_id', session.user.id).eq('estado', 'pendiente');
            if (r.error) throw r.error;
            var sol = r.data || [];
            if (!sol.length) { cont.innerHTML = '<div class="empty-state"><h3>Sin solicitudes pendientes.</h3></div>'; return; }

            await cargarPerfilesEnLote(sol.map(function (s) { return s.usuario_id; }));

            cont.innerHTML = sol.map(function (s) {
                var p = getPerfilCacheado(s.usuario_id) || {};
                var n = p.nombre || 'Usuario';
                var h = p.handle ? '@' + p.handle : '';
                var img = p.avatar_url ? '<img src="' + escapeHtml(obtenerAvatarSeguro(p.avatar_url)) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : escapeHtml(obtenerInicial(n));
                return `<div style="display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid var(--line);">
                    <div style="width:42px; height:42px; border-radius:50%; overflow:hidden; background:linear-gradient(135deg, var(--green-mid), var(--violet)); display:flex; align-items:center; justify-content:center; font-weight:800; color:#fff;">${img}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:700; color:var(--text-primary); font-size:.84rem;">${escapeHtml(n)}</div>
                        <div style="color:var(--text-muted); font-size:.68rem;">${escapeHtml(h)}</div>
                    </div>
                    <button type="button" class="btn-aceptar" data-aceptar="${s.id}" style="padding:7px 12px; border-radius:16px; border:1px solid var(--success); color:var(--success); background:transparent; font-size:.68rem; font-weight:700; cursor:pointer;">Aceptar</button>
                    <button type="button" class="btn-rechazar" data-rechazar="${s.id}" style="padding:7px 12px; border-radius:16px; border:1px solid rgba(255,51,102,.45); color:#ff8198; background:transparent; font-size:.68rem; font-weight:700; cursor:pointer;">Rechazar</button>
                </div>`;
            }).join('');

            cont.querySelectorAll('[data-aceptar]').forEach(function (b) {
                b.onclick = async function () {
                    await window.SocialAcciones.responderSolicitud(b.getAttribute('data-aceptar'), true);
                    cargarSolicitudesUI();
                    cargarContactos({ reset: true });
                };
            });
            cont.querySelectorAll('[data-rechazar]').forEach(function (b) {
                b.onclick = async function () {
                    await window.SocialAcciones.responderSolicitud(b.getAttribute('data-rechazar'), false);
                    cargarSolicitudesUI();
                };
            });
        } catch (e) { cont.innerHTML = '<div class="empty-state"><h3>Error al cargar solicitudes.</h3></div>'; }
    }

    async function cargarBloqueadosUI() {
        var cont = document.getElementById('listaBloqueadosContactos');
        if (!cont) return;
        cont.innerHTML = '<div class="empty-state"><h3>Cargando...</h3></div>';
        try {
            var bloqueados = await window.SocialAcciones.listarBloqueados();
            if (!bloqueados.length) { cont.innerHTML = '<div class="empty-state"><h3>No tienes usuarios bloqueados.</h3></div>'; return; }

            cont.innerHTML = bloqueados.map(function (b) {
                var n = b.nombre || 'Usuario';
                var h = b.handle ? '@' + b.handle : '';
                var img = b.avatar_url ? '<img src="' + escapeHtml(obtenerAvatarSeguro(b.avatar_url)) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : escapeHtml(obtenerInicial(n));
                return `<div style="display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid var(--line);">
                    <div style="width:42px; height:42px; border-radius:50%; overflow:hidden; background:linear-gradient(135deg, var(--green-mid), var(--violet)); display:flex; align-items:center; justify-content:center; font-weight:800; color:#fff;">${img}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:700; color:var(--text-primary); font-size:.84rem;">${escapeHtml(n)}</div>
                        <div style="color:var(--text-muted); font-size:.68rem;">${escapeHtml(h)}</div>
                    </div>
                    <button type="button" data-desbloquear="${b.id}" style="padding:7px 12px; border-radius:16px; border:1px solid var(--gold); color:var(--gold); background:transparent; font-size:.68rem; font-weight:700; cursor:pointer;">Desbloquear</button>
                </div>`;
            }).join('');

            cont.querySelectorAll('[data-desbloquear]').forEach(function (b) {
                b.onclick = async function () {
                    await window.SocialAcciones.desbloquear(b.getAttribute('data-desbloquear'));
                    cargarBloqueadosUI();
                };
            });
        } catch (e) { cont.innerHTML = '<div class="empty-state"><h3>Error al cargar bloqueados.</h3></div>'; }
    }

    /* ============================================================
       ACCIONES DE TARJETAS
       ============================================================ */
    document.getElementById('contactosList')?.addEventListener('click', async function (e) {
        var btn = e.target.closest('[data-accion]');
        var card = e.target.closest('.contacto-card');
        if (!card) return;
        var contactoId = card.getAttribute('data-contacto-id');
        var filaId = card.getAttribute('data-fila-id');

        if (!btn) { window.location.href = '/features/mensajes/mensajes.html?usuario=' + encodeURIComponent(contactoId); return; }
        e.preventDefault(); e.stopPropagation();
        var accion = btn.getAttribute('data-accion');

        if (accion === 'mensaje') window.location.href = '/features/mensajes/mensajes.html?usuario=' + encodeURIComponent(contactoId);
        if (accion === 'favorito') {
            var item = state.contactos.find(function (c) { return String(c.id) === String(filaId); });
            if (item) { await window.SocialAcciones.toggleFavorito(filaId, !item.es_favorito); cargarContactos({ reset: true }); }
        }
        if (accion === 'bloquear') {
            if (await window.SocialAcciones.confirmar('Bloquear', '¿Bloquear a este usuario?')) {
                await window.SocialAcciones.bloquear(contactoId);
                cargarContactos({ reset: true });
            }
        }
        if (accion === 'eliminar') {
            if (await window.SocialAcciones.confirmar('Eliminar', '¿Eliminar amistad?')) {
                await window.SocialAcciones.eliminarAmistad(contactoId);
                cargarContactos({ reset: true });
            }
        }
    });

    /* ============================================================
       INICIALIZACIÓN
       ============================================================ */
    document.querySelectorAll('.filtros .filtro').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.filtros .filtro').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
            btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
            cambiarPestana(btn.dataset.filtro);
        });
    });

    var searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function (e) {
            state.textoBusqueda = normalizarTextoBusqueda(e.target.value).toLowerCase();
            renderizarContactos();
        }, CONFIG.DEBOUNCE_FILTRO_MS));
    }

    // Arranque
    (async function init() {
        var session = await getSession();
        if (!session) return;
        await cargarContactos({ reset: true });
    })();

})();