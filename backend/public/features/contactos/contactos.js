/* ============================================================
   CSARIEL'S · CONTACTOS · v28.2
   Cambios v28.2:
   - El micrófono ya NO se activa al tocar el campo de texto.
     Solo se activa con el botón 🎤.
   - Escribir en el campo busca al dejar de teclear (350 ms) y con Enter.
   - El botón ✕ aparece al escribir, sin esperar la búsqueda.
   - Al buscar no se mueve el cursor si se escribe en medio del texto.
   - El micrófono no se puede iniciar dos veces seguidas.
   Sin QR ni cámara (eso vive en Perfil).
   RPC: perfiles_por_ids, buscar_usuarios, sugerencias_usuarios,
        bloquear_contacto, obtener_o_crear_invitacion,
        canjear_codigo_amistad, responder_solicitud_amistad,
        eliminar_amistad.
   Tablas: contactos, bloqueos, preferencias_usuario (prefs jsonb),
           usuarios (ocultar_estado).
   ============================================================ */

(function () {
    'use strict';

    var CONFIG = {
        CONTACTOS_TABLE: 'contactos',
        BLOQUEOS_TABLE: 'bloqueos',
        PREFS_TABLE: 'preferencias_usuario',
        USUARIOS_TABLE: 'usuarios',
        RPC_PERFILES: 'perfiles_por_ids',
        RPC_BUSCAR: 'buscar_usuarios',
        RPC_SUGERENCIAS: 'sugerencias_usuarios',
        RPC_BLOQUEAR: 'bloquear_contacto',
        RPC_MI_CODIGO: 'obtener_o_crear_invitacion',
        RPC_CANJEAR: 'canjear_codigo_amistad',
        RPC_RESPONDER: 'responder_solicitud_amistad',
        RPC_ELIMINAR: 'eliminar_amistad',
        // RUTA CORREGIDA: Apunta al archivo correcto en tu servidor
        PERFIL_URL: '/features/perfil-publico/perfil-publico.html', 
        MENSAJES_URL: '/features/mensajes/mensajes.html',
        PAGE: 50,
        LIMITE_RELACIONES: 100,
        LOTE_MAX: 200,
        MAX_SUGERENCIAS: 10,
        MAX_RESULTADOS: 20,
        MIN_CHARS: 2,
        MAX_CHARS: 80,
        DEBOUNCE_BUSQUEDA_MS: 350,
        SESSION_TIMEOUT_MS: 7000,
        RETRY_MAX: 3,
        RETRY_BASE_MS: 500,
        A11Y_KEY: 'contactos_a11y',
        COOLDOWN_CANJE_MS: 3000,
        BLOQUEO_CANJE_MS: 60000
    };

    var ICO = {
        msg: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
        call: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6.4 6.4l1.2-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z"/>',
        star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.3L12 17.3 6.5 20.3l1-6.3L3 9.6l6.2-.9z"/>',
        bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
        bellOff: '<path d="M8.7 3.2A6 6 0 0 1 18 8c0 7 3 9 3 9H6"/><path d="M18 8c0 2.4.4 4.3 1 5.8M3 3l18 18"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
        block: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
        trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
        check: '<path d="m5 12 5 5 9-10"/>'
    };

    var state = {
        session: null,
        sessionExpira: 0,
        cargando: false,
        initialized: false,
        filtro: 'todos',
        texto: '',
        busquedaVersion: 0,
        contactos: [],
        total: 0,
        pagina: 0,
        hayMas: false,
        recibidas: [],
        enviadas: [],
        bloqueados: [],
        silenciados: [],
        prefs: {},
        a11y: { texto: '100', contraste: false },
        ocultarEstado: false,
        sugerencias: [],
        errores: { contactos: null, recibidas: null, enviadas: null, bloqueados: null },
        idsContactos: new Set(),
        perfiles: new Map(),
        operaciones: new Set(),
        canjeBloqueadoHasta: 0,
        canjeEnCurso: false,
        vozActiva: false
    };

    /* ---------------- Utilidades ---------------- */

    function sb() {
        return window.supabaseClient && typeof window.supabaseClient.from === 'function' ? window.supabaseClient : null;
    }

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function ico(nombre) {
        return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + (ICO[nombre] || '') + '</svg>';
    }

    function inicial(n) {
        var t = String(n || 'U').trim();
        return t ? t.charAt(0).toUpperCase() : 'U';
    }

    function handleTxt(h) {
        return h ? '@' + String(h).replace(/^@/, '') : '';
    }

    function detalleError(e) {
        if (!e) return 'error desconocido';
        return (e.code ? e.code + ': ' : '') + (e.message || String(e));
    }

    function normalizarTexto(v) {
        return String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, CONFIG.MAX_CHARS);
    }

    function normalizarCodigo(v) {
        return String(v == null ? '' : v).toUpperCase().replace(/\s+/g, '');
    }

    function avatarSeguro(url) {
        if (!url) return '';
        var v = String(url).trim();
        if (!v) return '';
        try {
            if (v.charAt(0) === '/' && v.indexOf('//') !== 0) return v;
            var p = new URL(v, window.location.origin);
            return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : '';
        } catch (e) { return ''; }
    }

    function showToast(msg, tipo) {
        var t = document.getElementById('toast');
        if (!t) return;
        t.textContent = String(msg || '');
        t.className = 'toast' + (tipo ? ' ' + tipo : '');
        requestAnimationFrame(function () { t.classList.add('show'); });
        clearTimeout(window.__contactosToastTimer);
        window.__contactosToastTimer = setTimeout(function () { t.classList.remove('show'); }, 3500);
    }

    function emitirListo() {
        try { window.dispatchEvent(new Event('contactos:listo')); } catch (e) {}
    }

    function abrirModal(id) {
        var m = document.getElementById(id);
        if (!m) return;
        m.classList.add('active');
        m.setAttribute('aria-hidden', 'false');
    }

    function cerrarModal(id) {
        var m = document.getElementById(id);
        if (!m) return;
        m.classList.remove('active');
        m.setAttribute('aria-hidden', 'true');
    }

    function showConfirm(opc) {
        opc = opc || {};
        return new Promise(function (resolve) {
            var overlay = document.getElementById('confirmModalOverlay');
            var titulo = document.getElementById('confirmModalTitle');
            var msg = document.getElementById('confirmModalMessage');
            var cancel = document.getElementById('confirmModalCancel');
            var confirm = document.getElementById('confirmModalConfirm');
            if (!overlay || !cancel || !confirm) { resolve(false); return; }
            if (titulo) titulo.textContent = opc.title || 'Confirmar';
            if (msg) msg.textContent = opc.message || '';
            cancel.textContent = opc.cancelText || 'Cancelar';
            confirm.textContent = opc.confirmText || 'Aceptar';
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');

            function finalizar(v) {
                cancel.removeEventListener('click', onCancel);
                confirm.removeEventListener('click', onOk);
                overlay.removeEventListener('click', onFondo);
                document.removeEventListener('keydown', onEsc);
                overlay.classList.remove('active');
                overlay.setAttribute('aria-hidden', 'true');
                resolve(v);
            }
            function onCancel() { finalizar(false); }
            function onOk() { finalizar(true); }
            function onFondo(e) { if (e.target === overlay) finalizar(false); }
            function onEsc(e) { if (e.key === 'Escape') finalizar(false); }

            cancel.addEventListener('click', onCancel);
            confirm.addEventListener('click', onOk);
            overlay.addEventListener('click', onFondo);
            document.addEventListener('keydown', onEsc);
        });
    }

    /* ---------------- Sesión y reintentos ---------------- */

    async function getSession() {
        var ahora = Date.now();
        if (state.session && ahora < state.sessionExpira) return state.session;
        var client = sb();
        if (!client || !client.auth) return null;
        try {
            var r = await Promise.race([
                client.auth.getSession(),
                new Promise(function (resolve) {
                    setTimeout(function () { resolve({ data: null, error: new Error('Timeout de sesión') }); }, CONFIG.SESSION_TIMEOUT_MS);
                })
            ]);
            if (r.error) { console.error('[Contactos] Sesión:', detalleError(r.error)); return null; }
            state.session = r.data && r.data.session ? r.data.session : null;
            state.sessionExpira = ahora + 60000;
            return state.session;
        } catch (e) { console.error('[Contactos] Sesión:', detalleError(e)); return null; }
    }

    async function withRetry(fn, contexto) {
        var ultimo = null;
        for (var i = 0; i < CONFIG.RETRY_MAX; i++) {
            try {
                var r = await fn();
                if (r && r.error) {
                    var err = r.error;
                    if (err.code === '23505' || err.code === '42501' || err.code === 'PGRST116' || err.code === '54000') return r;
                    throw err;
                }
                return r;
            } catch (e) {
                ultimo = e;
                console.warn('[Contactos] Reintento ' + (i + 1) + ' (' + contexto + '):', detalleError(e));
                if (i === CONFIG.RETRY_MAX - 1) break;
                await new Promise(function (r2) { setTimeout(r2, CONFIG.RETRY_BASE_MS * Math.pow(2, i)); });
            }
        }
        throw ultimo;
    }

    function seguro(fn, contexto) {
        return withRetry(fn, contexto).catch(function (e) { return { data: null, error: e }; });
    }

    /* ---------------- Perfiles ---------------- */

    function normalizarPerfil(p) {
        return {
            id: p.id,
            nombre: p.nombre || null,
            handle: p.handle || null,
            avatar_url: avatarSeguro(p.avatar_url),
            online: p.online === true,
            verificado: p.verificado === true
        };
    }

    async function cargarPerfiles(ids) {
        var client = sb();
        var unicos = Array.from(new Set((ids || []).filter(Boolean)));
        var faltantes = unicos.filter(function (id) { return !state.perfiles.has(id); });
        if (!client || !faltantes.length) return;
        for (var i = 0; i < faltantes.length; i += CONFIG.LOTE_MAX) {
            var lote = faltantes.slice(i, i + CONFIG.LOTE_MAX);
            var r = await seguro(function () { return client.rpc(CONFIG.RPC_PERFILES, { p_ids: lote }); }, 'perfiles');
            if (r.error) { console.error('[Contactos] Perfiles:', detalleError(r.error)); continue; }
            var encontrados = new Set();
            (r.data || []).forEach(function (p) { state.perfiles.set(p.id, normalizarPerfil(p)); encontrados.add(p.id); });
            lote.forEach(function (id) { if (!encontrados.has(id)) state.perfiles.set(id, null); });
        }
    }

    function datosPerfil(id) {
        var p = state.perfiles.get(id);
        if (p === undefined) return { nombre: 'Cargando…', handle: '', avatar: '', verificado: false, online: false };
        if (p === null) return { nombre: 'Perfil no disponible', handle: '', avatar: '', verificado: false, online: false };
        return {
            nombre: p.nombre || p.handle || 'Usuario',
            handle: handleTxt(p.handle),
            avatar: p.avatar_url,
            verificado: p.verificado === true,
            online: p.online === true
        };
    }

    function avatarHtml(d) {
        if (d.avatar) return '<img src="' + esc(d.avatar) + '" alt="" loading="lazy" onerror="this.remove()">';
        return esc(inicial(d.nombre));
    }

    /* ---------------- Preferencias y accesibilidad ---------------- */

    async function guardarPrefs(patch) {
        var client = sb();
        var s = await getSession();
        if (!client || !s) throw new Error('Inicia sesión.');
        var nuevo = Object.assign({}, state.prefs, patch);
        var r = await withRetry(function () {
            return client.from(CONFIG.PREFS_TABLE).upsert({ usuario_id: s.user.id, prefs: nuevo }, { onConflict: 'usuario_id' });
        }, 'guardar preferencias');
        if (r.error) throw r.error;
        state.prefs = nuevo;
        state.silenciados = Array.isArray(nuevo.silenciados) ? nuevo.silenciados.slice() : [];
    }

    function leerA11yLocal() {
        try {
            var raw = localStorage.getItem(CONFIG.A11Y_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function normalizarA11y(a) {
        a = a || {};
        var texto = ['80', '100', '120', '140'].indexOf(String(a.texto)) !== -1 ? String(a.texto) : '100';
        return { texto: texto, contraste: a.contraste === true };
    }

    function aplicarA11y() {
        var h = document.documentElement;
        h.classList.remove('a11y-texto-80', 'a11y-texto-120', 'a11y-texto-140');
        if (state.a11y.texto !== '100') h.classList.add('a11y-texto-' + state.a11y.texto);
        h.classList.toggle('a11y-contraste', state.a11y.contraste === true);
    }

    async function guardarA11y(patch) {
        state.a11y = normalizarA11y(Object.assign({}, state.a11y, patch));
        aplicarA11y();
        try { localStorage.setItem(CONFIG.A11Y_KEY, JSON.stringify(state.a11y)); } catch (e) {}
        try {
            await guardarPrefs({ accesibilidad: state.a11y });
            showToast('Accesibilidad guardada.', 'success');
        } catch (e) {
            console.error('[Contactos] Accesibilidad:', detalleError(e));
            showToast('Guardado solo en este dispositivo.', 'warning');
        }
        renderConfig();
    }

    /* ---------------- Carga de datos (paginada) ---------------- */

    function mapContacto(c) {
        return { id: c.id, contacto_id: c.contacto_id, es_favorito: c.es_favorito === true, fecha: c.fecha || null };
    }

    function pedirPagina(client, uid, n) {
        var desde = n * CONFIG.PAGE;
        var hasta = desde + CONFIG.PAGE - 1;
        return seguro(function () {
            return client.from(CONFIG.CONTACTOS_TABLE)
                .select('id, contacto_id, es_favorito, fecha')
                .eq('usuario_id', uid)
                .eq('estado', 'activo')
                .order('fecha', { ascending: false, nullsFirst: false })
                .order('id', { ascending: false })
                .range(desde, hasta);
        }, 'contactos');
    }

    async function cargarDatos() {
        var client = sb();
        var s = await getSession();
        if (!client || !s) {
            pintarVacio('Inicia sesión para ver tus contactos.');
            actualizarStats();
            emitirListo();
            return;
        }
        if (state.cargando) return;
        state.cargando = true;
        var uid = s.user.id;
        mostrarCargando();

        try {
            var res = await Promise.all([
                seguro(function () {
                    return client.from(CONFIG.CONTACTOS_TABLE).select('id', { count: 'exact', head: true }).eq('usuario_id', uid).eq('estado', 'activo');
                }, 'conteo'),
                pedirPagina(client, uid, 0),
                seguro(function () {
                    return client.from(CONFIG.CONTACTOS_TABLE)
                        .select('id, usuario_id, created_at')
                        .eq('contacto_id', uid).eq('estado', 'pendiente')
                        .order('created_at', { ascending: false })
                        .limit(CONFIG.LIMITE_RELACIONES);
                }, 'recibidas'),
                seguro(function () {
                    return client.from(CONFIG.CONTACTOS_TABLE)
                        .select('id, contacto_id, created_at')
                        .eq('usuario_id', uid).eq('estado', 'pendiente')
                        .order('created_at', { ascending: false })
                        .limit(CONFIG.LIMITE_RELACIONES);
                }, 'enviadas'),
                seguro(function () {
                    return client.from(CONFIG.BLOQUEOS_TABLE)
                        .select('id, bloqueado_id, created_at')
                        .eq('usuario_id', uid)
                        .order('created_at', { ascending: false })
                        .limit(CONFIG.LIMITE_RELACIONES);
                }, 'bloqueados'),
                seguro(function () {
                    return client.from(CONFIG.PREFS_TABLE).select('prefs').eq('usuario_id', uid).maybeSingle();
                }, 'preferencias'),
                seguro(function () {
                    return client.from(CONFIG.USUARIOS_TABLE).select('ocultar_estado').eq('id', uid).maybeSingle();
                }, 'usuario')
            ]);

            var rT = res[0], rC = res[1], rR = res[2], rE = res[3], rB = res[4], rP = res[5], rU = res[6];

            state.total = rT.error ? 0 : (rT.count || 0);

            state.errores = {
                contactos: rC.error ? detalleError(rC.error) : null,
                recibidas: rR.error ? detalleError(rR.error) : null,
                enviadas: rE.error ? detalleError(rE.error) : null,
                bloqueados: rB.error ? detalleError(rB.error) : null
            };

            var filas = rC.error ? [] : (rC.data || []);
            state.contactos = filas.map(mapContacto);
            state.pagina = 1;
            state.hayMas = filas.length === CONFIG.PAGE;

            state.recibidas = rR.error ? [] : (rR.data || []).map(function (x) { return { id: x.id, usuario_id: x.usuario_id }; });
            state.enviadas = rE.error ? [] : (rE.data || []).map(function (x) { return { id: x.id, contacto_id: x.contacto_id }; });
            state.bloqueados = rB.error ? [] : (rB.data || []).map(function (b) { return { bloqueado_id: b.bloqueado_id }; });

            state.prefs = (!rP.error && rP.data && rP.data.prefs) ? rP.data.prefs : {};
            state.silenciados = Array.isArray(state.prefs.silenciados) ? state.prefs.silenciados.slice() : [];
            state.a11y = normalizarA11y(state.prefs.accesibilidad || leerA11yLocal());
            aplicarA11y();
            state.ocultarEstado = !rU.error && rU.data ? rU.data.ocultar_estado === true : false;

            state.idsContactos = new Set(state.contactos.map(function (c) { return c.contacto_id; }));

            var ids = [];
            state.contactos.forEach(function (c) { ids.push(c.contacto_id); });
            state.recibidas.forEach(function (x) { ids.push(x.usuario_id); });
            state.enviadas.forEach(function (x) { ids.push(x.contacto_id); });
            state.bloqueados.forEach(function (b) { ids.push(b.bloqueado_id); });
            await cargarPerfiles(ids);

            actualizarStats();
            actualizarContadores();
            renderLista();
            cargarSugerencias();
        } catch (e) {
            console.error('[Contactos] Carga:', detalleError(e));
            pintarVacio('Error cargando contactos: ' + detalleError(e));
        } finally {
            state.cargando = false;
            state.initialized = true;
            emitirListo();
        }
    }

    async function cargarMas() {
        if (state.cargando || !state.hayMas) return;
        var client = sb();
        var s = await getSession();
        if (!client || !s) return;
        state.cargando = true;
        renderLista();
        var r = await pedirPagina(client, s.user.id, state.pagina);
        state.cargando = false;
        if (r.error) {
            showToast('No se pudieron cargar más contactos.', 'error');
            renderLista();
            return;
        }
        var filas = r.data || [];
        filas.forEach(function (c) {
            if (!state.contactos.some(function (x) { return String(x.id) === String(c.id); })) {
                state.contactos.push(mapContacto(c));
            }
        });
        state.idsContactos = new Set(state.contactos.map(function (c) { return c.contacto_id; }));
        await cargarPerfiles(filas.map(function (c) { return c.contacto_id; }));
        state.pagina += 1;
        state.hayMas = filas.length === CONFIG.PAGE;
        actualizarStats();
        renderLista();
    }

    async function cargarSugerencias() {
        var client = sb();
        var s = await getSession();
        if (!client || !s) return;
        try {
            var r = await withRetry(function () {
                return client.rpc(CONFIG.RPC_SUGERENCIAS, { p_limit: CONFIG.MAX_SUGERENCIAS });
            }, 'sugerencias');
            if (r.error) throw r.error;
            var bloq = new Set(state.bloqueados.map(function (b) { return b.bloqueado_id; }));
            state.sugerencias = (Array.isArray(r.data) ? r.data : [])
                .filter(function (u) {
                    return u && u.id && u.id !== s.user.id && !state.idsContactos.has(u.id) && !bloq.has(u.id);
                })
                .slice(0, CONFIG.MAX_SUGERENCIAS);
            state.sugerencias.forEach(function (u) {
                if (!state.perfiles.has(u.id)) state.perfiles.set(u.id, normalizarPerfil(u));
            });
        } catch (e) {
            console.warn('[Contactos] Sugerencias:', detalleError(e));
            state.sugerencias = [];
        }
        if (state.filtro === 'todos' && !state.texto) renderLista();
    }

    /* ---------------- Estadísticas ---------------- */

    function actualizarStats() {
        var online = state.contactos.filter(function (c) {
            var p = state.perfiles.get(c.contacto_id);
            return p && p.online === true;
        }).length;
        var t = document.getElementById('totalContactos');
        var o = document.getElementById('onlineContactos');
        if (t) t.textContent = String(state.total);
        if (o) o.textContent = String(online);
    }

    function poner(id, n) {
        var el = document.getElementById(id);
        if (el) el.textContent = n > 0 ? String(n) : '';
    }

    function actualizarContadores() {
        poner('cntPendientes', state.recibidas.length);
        poner('cntEnviadas', state.enviadas.length);
        poner('cntBloqueados', state.bloqueados.length);
        poner('cntSilenciados', state.silenciados.length);
    }

    /* ---------------- Render ---------------- */

    function htmlVacio(texto) {
        return '<div class="vacio">' + esc(texto) + '</div>';
    }

    function htmlAviso(texto) {
        return '<div class="aviso" role="alert"><span>' + esc(texto) + '</span><button type="button" data-act="reintentar">Reintentar</button></div>';
    }

    function titulo(t) {
        return '<div class="seccion-titulo">' + esc(t) + '</div>';
    }

    function mostrarCargando() {
        var lista = document.getElementById('contactosList');
        if (!lista) return;
        lista.setAttribute('aria-busy', 'true');
        lista.innerHTML = '<div class="cargando">Cargando…</div>';
    }

    function pintarVacio(texto) {
        var lista = document.getElementById('contactosList');
        if (!lista) return;
        lista.setAttribute('aria-busy', 'false');
        lista.innerHTML = htmlVacio(texto);
    }

    function itemsContactos() {
        return state.contactos.map(function (c) {
            var d = datosPerfil(c.contacto_id);
            return {
                id: c.id,
                contacto_id: c.contacto_id,
                es_favorito: c.es_favorito,
                nombre: d.nombre,
                handle: d.handle,
                avatar: d.avatar,
                online: d.online,
                verificado: d.verificado,
                silenciado: state.silenciados.indexOf(c.contacto_id) !== -1
            };
        });
    }

    function filtrarTexto(items) {
        if (!state.texto) return items;
        var q = state.texto.toLowerCase();
        return items.filter(function (i) {
            return i.nombre.toLowerCase().indexOf(q) !== -1 || i.handle.toLowerCase().indexOf(q) !== -1;
        });
    }

    function filaContacto(c) {
        return '<div class="fila" data-id="' + esc(c.contacto_id) + '" data-fila="' + esc(c.id) + '">' +
            '<div class="avatar" data-act="perfil" role="button" tabindex="0" aria-label="Ver perfil">' +
                avatarHtml(c) +
                '<span class="estado-punto" ' + (c.online ? '' : 'hidden') + '></span>' +
            '</div>' +
            '<div class="info">' +
                '<div class="nombre">' + esc(c.nombre) + (c.verificado ? ' <span class="verif">✓</span>' : '') + '</div>' +
                '<div class="estado-txt ' + (c.online ? 'on' : '') + '">' + (c.online ? 'En línea' : 'Desconectado') + '</div>' +
                (c.handle ? '<div class="meta">' + esc(c.handle) + '</div>' : '') +
            '</div>' +
            '<div class="acciones">' +
                '<button type="button" class="accion primaria" data-act="msg" aria-label="Enviar mensaje">' + ico('msg') + 'Mensaje</button>' +
                '<button type="button" class="accion" data-act="call" aria-label="Llamar">' + ico('call') + '</button>' +
                '<button type="button" class="accion ' + (c.es_favorito ? 'activo' : '') + '" data-act="fav" aria-label="Favorito">' + ico('star') + '</button>' +
                '<button type="button" class="accion ' + (c.silenciado ? 'activo' : '') + '" data-act="' + (c.silenciado ? 'unmute' : 'mute') + '" aria-label="' + (c.silenciado ? 'Quitar silencio' : 'Silenciar') + '">' + ico(c.silenciado ? 'bell' : 'bellOff') + '</button>' +
                '<button type="button" class="accion no" data-act="block" aria-label="Bloquear">' + ico('block') + '</button>' +
                '<button type="button" class="accion no" data-act="del" aria-label="Eliminar">' + ico('trash') + '</button>' +
            '</div>' +
        '</div>';
    }

    function htmlContactos(items, vacio) {
        if (state.errores.contactos) return htmlAviso('No se pudieron cargar tus contactos: ' + state.errores.contactos);
        if (!items.length) return htmlVacio(vacio || 'Tu red está vacía. Busca personas para conectar.');
        return items.map(filaContacto).join('');
    }

    function htmlRecibidas() {
        if (state.errores.recibidas) return htmlAviso('No se pudieron cargar las solicitudes: ' + state.errores.recibidas);
        if (!state.recibidas.length) return htmlVacio('No tienes solicitudes pendientes.');
        return state.recibidas.map(function (s) {
            var d = datosPerfil(s.usuario_id);
            return '<div class="fila" data-id="' + esc(s.usuario_id) + '" data-fila="' + esc(s.id) + '">' +
                '<div class="avatar">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + esc(d.nombre) + '</div><div class="meta">' + esc(d.handle) + '</div></div>' +
                '<div class="acciones">' +
                    '<button type="button" class="accion ok" data-act="accept">Aceptar</button>' +
                    '<button type="button" class="accion no" data-act="reject">Rechazar</button>' +
                '</div></div>';
        }).join('');
    }

    function htmlEnviadas() {
        if (state.errores.enviadas) return htmlAviso('No se pudieron cargar las solicitudes enviadas: ' + state.errores.enviadas);
        if (!state.enviadas.length) return htmlVacio('No tienes solicitudes enviadas.');
        return state.enviadas.map(function (s) {
            var d = datosPerfil(s.contacto_id);
            return '<div class="fila" data-id="' + esc(s.contacto_id) + '" data-fila="' + esc(s.id) + '">' +
                '<div class="avatar">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + esc(d.nombre) + '</div><div class="meta">' + esc(d.handle) + '</div></div>' +
                '<div class="acciones"><button type="button" class="accion" data-act="cancel">Cancelar envío</button></div>' +
            '</div>';
        }).join('');
    }

    function htmlBloqueados() {
        if (state.errores.bloqueados) return htmlAviso('No se pudieron cargar los bloqueados: ' + state.errores.bloqueados);
        if (!state.bloqueados.length) return htmlVacio('No tienes usuarios bloqueados.');
        return state.bloqueados.map(function (b) {
            var d = datosPerfil(b.bloqueado_id);
            return '<div class="fila" data-id="' + esc(b.bloqueado_id) + '">' +
                '<div class="avatar">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + esc(d.nombre) + '</div><div class="meta">' + esc(d.handle) + '</div></div>' +
                '<div class="acciones"><button type="button" class="accion" data-act="unblock">Desbloquear</button></div>' +
            '</div>';
        }).join('');
    }

    function htmlSugerencias() {
        if (!state.sugerencias.length) return '';
        return titulo('Personas que puedes conocer') + state.sugerencias.map(function (u) {
            var d = datosPerfil(u.id);
            return '<div class="fila" data-id="' + esc(u.id) + '">' +
                '<div class="avatar">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + esc(d.nombre) + (d.verificado ? ' <span class="verif">✓</span>' : '') + '</div>' +
                '<div class="meta">' + esc(d.handle) + '</div></div>' +
                '<div class="acciones"><button type="button" class="accion primaria" data-act="add">Conectar</button></div>' +
            '</div>';
        }).join('');
    }

    function puedeCargarMas() {
        return state.hayMas && !state.texto && ['todos', 'favoritos', 'online', 'silenciados'].indexOf(state.filtro) !== -1;
    }

    function renderLista() {
        var lista = document.getElementById('contactosList');
        if (!lista) return;

        var f = state.filtro;
        var cercanos = document.getElementById('cercanosSection');
        var grupos = document.getElementById('gruposSection');
        if (cercanos) cercanos.hidden = f !== 'cercanos';
        if (grupos) grupos.hidden = f !== 'recientes';

        var ocultarLista = (f === 'cercanos' || f === 'recientes');
        lista.hidden = ocultarLista;
        if (ocultarLista) return;

        lista.setAttribute('aria-busy', 'false');

        if (f === 'todos' && state.texto.length >= CONFIG.MIN_CHARS) {
            buscarGlobal(state.texto, ++state.busquedaVersion);
            return;
        }

        var html = '';
        if (f === 'todos') {
            if (state.recibidas.length || state.errores.recibidas) html += titulo('Solicitudes de amistad') + htmlRecibidas();
            if (state.enviadas.length || state.errores.enviadas) html += titulo('Solicitudes enviadas') + htmlEnviadas();
            html += htmlContactos(filtrarTexto(itemsContactos()));
            html += htmlSugerencias();
        } else if (f === 'favoritos') {
            html = htmlContactos(filtrarTexto(itemsContactos().filter(function (i) { return i.es_favorito; })), 'Todavía no tienes amigos favoritos.');
        } else if (f === 'online') {
            html = htmlContactos(filtrarTexto(itemsContactos().filter(function (i) { return i.online; })), 'No hay amigos conectados entre los cargados.');
        } else if (f === 'pendientes') {
            html = htmlRecibidas();
        } else if (f === 'enviadas') {
            html = htmlEnviadas();
        } else if (f === 'bloqueados') {
            html = htmlBloqueados();
        } else if (f === 'silenciados') {
            html = htmlContactos(filtrarTexto(itemsContactos().filter(function (i) { return i.silenciado; })), 'No tienes contactos silenciados.');
        }

        if (puedeCargarMas()) {
            html += '<button type="button" class="cargar-mas" data-act="mas"' + (state.cargando ? ' disabled' : '') + '>' +
                (state.cargando ? 'Cargando…' : 'Cargar más') + '</button>';
        }

        lista.innerHTML = html;
    }

    function setFiltro(f) {
        state.filtro = f;
        document.querySelectorAll('.filtro[data-filtro]').forEach(function (b) {
            var on = b.getAttribute('data-filtro') === f;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        renderLista();
    }

    /* ---------------- Búsqueda (texto y voz) ---------------- */

    async function buscarGlobal(texto, version) {
        var client = sb();
        var s = await getSession();
        var lista = document.getElementById('contactosList');
        if (!client || !s || !lista) return;
        lista.innerHTML = '<div class="cargando">Buscando en Csariel\'s…</div>';
        var termino = texto.replace(/^@+/, '').trim();
        try {
            var r = await withRetry(function () {
                return client.rpc(CONFIG.RPC_BUSCAR, { p_query: termino });
            }, 'buscar usuarios');
            if (version !== state.busquedaVersion) return;
            if (r.error) throw r.error;
            var usuarios = (Array.isArray(r.data) ? r.data : [])
                .filter(function (u) { return u && u.id && u.id !== s.user.id; })
                .slice(0, CONFIG.MAX_RESULTADOS);
            usuarios.forEach(function (u) { state.perfiles.set(u.id, normalizarPerfil(u)); });
            if (!usuarios.length) { lista.innerHTML = htmlVacio('No se encontraron usuarios.'); return; }
            lista.innerHTML = usuarios.map(function (u) {
                var d = datosPerfil(u.id);
                var esContacto = state.idsContactos.has(u.id);
                var enviada = state.enviadas.some(function (x) { return x.contacto_id === u.id; });
                var boton;
                if (esContacto) boton = '<button type="button" class="accion ok" disabled>' + ico('check') + 'Contacto</button>';
                else if (enviada) boton = '<button type="button" class="accion" disabled>Enviada</button>';
                else boton = '<button type="button" class="accion primaria" data-act="add">Conectar</button>';
                return '<div class="fila" data-id="' + esc(u.id) + '">' +
                    '<div class="avatar">' + avatarHtml(d) + '</div>' +
                    '<div class="info"><div class="nombre">' + esc(d.nombre) + (d.verificado ? ' <span class="verif">✓</span>' : '') + '</div>' +
                    '<div class="meta">' + esc(d.handle) + '</div></div>' +
                    '<div class="acciones">' + boton + '</div></div>';
            }).join('');
        } catch (e) {
            console.error('[Contactos] Búsqueda:', detalleError(e));
            var msg = (e && (e.code === '54000' || /rate_limited/.test(e.message || ''))) ? 'Demasiadas búsquedas. Espera un momento.' : 'Error al buscar. Intenta de nuevo.';
            lista.innerHTML = htmlVacio(msg);
        }
    }

    function aplicarBusqueda(valor) {
        var t = normalizarTexto(valor);
        state.texto = t.toLowerCase();
        var input = document.getElementById('searchInput');
        if (input && input.value !== t) input.value = t;
        var limpiar = document.getElementById('btnLimpiarBusqueda');
        if (limpiar) limpiar.hidden = !t;
        if (state.texto.length >= CONFIG.MIN_CHARS && state.filtro === 'todos') {
            buscarGlobal(t, ++state.busquedaVersion);
        } else {
            renderLista();
        }
    }

    function iniciarVoz() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        var btn = document.getElementById('btnVozBuscar');
        if (!SR) { showToast('Tu navegador no soporta búsqueda por voz.', 'warning'); return; }
        if (state.vozActiva) return;
        var rec = new SR();
        rec.lang = 'es-MX';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onresult = function (e) {
            var t = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
            aplicarBusqueda(t);
        };
        rec.onerror = function () { showToast('No se entendió. Intenta de nuevo.', 'warning'); };
        rec.onend = function () {
            state.vozActiva = false;
            if (btn) btn.classList.remove('escuchando');
        };
        state.vozActiva = true;
        if (btn) btn.classList.add('escuchando');
        try { rec.start(); } catch (e) {
            state.vozActiva = false;
            if (btn) btn.classList.remove('escuchando');
        }
    }

    /* ---------------- Acciones de contacto ---------------- */

    async function agregarContacto(contactoId) {
        var client = sb();
        var s = await getSession();
        if (!client || !s) { showToast('Inicia sesión.', 'error'); return; }
        if (!contactoId) return;
        if (contactoId === s.user.id) { showToast('No puedes agregarte.', 'warning'); return; }
        if (state.idsContactos.has(contactoId)) { showToast('Ya está en tus contactos.', 'warning'); return; }
        var clave = 'agregar:' + contactoId;
        if (state.operaciones.has(clave)) return;
        state.operaciones.add(clave);
        try {
            var r = await withRetry(function () {
                return client.from(CONFIG.CONTACTOS_TABLE).insert({ usuario_id: s.user.id, contacto_id: contactoId, estado: 'pendiente', es_favorito: false });
            }, 'enviar solicitud');
            if (r.error) {
                if (r.error.code === '23505') { showToast('Ya enviaste una solicitud.', 'warning'); return; }
                throw r.error;
            }
            showToast('Solicitud enviada.', 'success');
            aplicarBusqueda('');
            await cargarDatos();
        } catch (e) {
            console.error('[Contactos] Agregar:', detalleError(e));
            showToast('No se pudo enviar la solicitud.', 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function responderSolicitud(filaId, aceptar) {
        var fila = Number(filaId);
        if (!Number.isInteger(fila) || fila <= 0) { showToast('Solicitud no válida.', 'error'); return; }
        var clave = (aceptar ? 'aceptar:' : 'rechazar:') + fila;
        if (state.operaciones.has(clave)) return;
        state.operaciones.add(clave);
        try {
            var r = await sb().rpc(CONFIG.RPC_RESPONDER, { p_fila_id: fila, p_aceptar: aceptar });
            if (r.error) throw r.error;
            showToast(aceptar ? 'Amistad aceptada.' : 'Solicitud rechazada.', 'success');
            await cargarDatos();
        } catch (e) {
            console.error('[Contactos] Responder:', detalleError(e));
            showToast('No se pudo completar la acción.', 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function cancelarEnviada(filaId) {
        var client = sb();
        var s = await getSession();
        if (!client || !s) return;
        var ok = await showConfirm({ title: 'Cancelar solicitud', message: '¿Retirar solicitud de amistad?', confirmText: 'Retirar', cancelText: 'Volver' });
        if (!ok) return;
        var clave = 'cancelar:' + filaId;
        if (state.operaciones.has(clave)) return;
        state.operaciones.add(clave);
        try {
            var r = await client.from(CONFIG.CONTACTOS_TABLE).delete().eq('id', filaId).eq('usuario_id', s.user.id).eq('estado', 'pendiente');
            if (r.error) throw r.error;
            showToast('Solicitud retirada.', 'success');
            await cargarDatos();
        } catch (e) {
            console.error('[Contactos] Cancelar:', detalleError(e));
            showToast('No se pudo cancelar.', 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function toggleFavorito(filaId) {
        var client = sb();
        var s = await getSession();
        if (!client || !s) return;
        var item = state.contactos.find(function (c) { return String(c.id) === String(filaId); });
        if (!item) return;
        var nuevo = !item.es_favorito;
        var clave = 'fav:' + filaId;
        if (state.operaciones.has(clave)) return;
        state.operaciones.add(clave);
        try {
            var r = await withRetry(function () {
                return client.from(CONFIG.CONTACTOS_TABLE).update({ es_favorito: nuevo }).eq('id', filaId).eq('usuario_id', s.user.id);
            }, 'favorito');
            if (r.error) throw r.error;
            item.es_favorito = nuevo;
            showToast(nuevo ? 'Favorito guardado.' : 'Favorito quitado.', 'success');
            renderLista();
        } catch (e) {
            console.error('[Contactos] Favorito:', detalleError(e));
            showToast('No se pudo guardar el favorito.', 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function silenciar(contactoId, activar) {
        var set = state.silenciados.slice();
        var idx = set.indexOf(contactoId);
        if (activar && idx === -1) set.push(contactoId);
        if (!activar && idx !== -1) set.splice(idx, 1);
        try {
            await guardarPrefs({ silenciados: set });
            showToast(activar ? 'Contacto silenciado.' : 'Silencio quitado.', 'success');
            actualizarContadores();
            renderLista();
        } catch (e) {
            console.error('[Contactos] Silenciar:', detalleError(e));
            showToast('No se pudo guardar.', 'error');
        }
    }

    async function eliminarContacto(contactoId) {
        var s = await getSession();
        if (!s) return;
        var ok = await showConfirm({ title: 'Eliminar contacto', message: '¿Eliminar a este contacto de tu red?', confirmText: 'Eliminar', cancelText: 'Cancelar' });
        if (!ok) return;
        var clave = 'eliminar:' + contactoId;
        if (state.operaciones.has(clave)) return;
        state.operaciones.add(clave);
        try {
            var r = await sb().rpc(CONFIG.RPC_ELIMINAR, { p_contacto_id: contactoId });
            if (r.error) throw r.error;
            showToast('Contacto eliminado.', 'success');
            await cargarDatos();
        } catch (e) {
            console.error('[Contactos] Eliminar:', detalleError(e));
            showToast('No se pudo eliminar.', 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function bloquearContacto(contactoId) {
        var s = await getSession();
        if (!s) return;
        if (contactoId === s.user.id) { showToast('No puedes bloquearte.', 'warning'); return; }
        var ok = await showConfirm({ title: 'Bloquear usuario', message: '¿Bloquear a este usuario? No podrá llamarte ni escribirte.', confirmText: 'Bloquear', cancelText: 'Cancelar' });
        if (!ok) return;
        var clave = 'bloquear:' + contactoId;
        if (state.operaciones.has(clave)) return;
        state.operaciones.add(clave);
        try {
            var client = sb();
            var r = await withRetry(function () { return client.rpc(CONFIG.RPC_BLOQUEAR, { p_contacto_id: contactoId }); }, 'bloquear');
            if (r.error) throw r.error;
            showToast('Usuario bloqueado.', 'success');
            await cargarDatos();
        } catch (e) {
            console.error('[Contactos] Bloquear:', detalleError(e));
            showToast('No se pudo bloquear.', 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function desbloquear(bloqueadoId) {
        var client = sb();
        var s = await getSession();
        if (!client || !s) return;
        var ok = await showConfirm({ title: 'Desbloquear usuario', message: '¿Permitir que este usuario te contacte de nuevo?', confirmText: 'Desbloquear', cancelText: 'Cancelar' });
        if (!ok) return;
        var clave = 'desbloquear:' + bloqueadoId;
        if (state.operaciones.has(clave)) return;
        state.operaciones.add(clave);
        try {
            var r = await withRetry(function () {
                return client.from(CONFIG.BLOQUEOS_TABLE).delete().eq('usuario_id', s.user.id).eq('bloqueado_id', bloqueadoId);
            }, 'desbloquear');
            if (r.error) throw r.error;
            showToast('Usuario desbloqueado.', 'success');
            await cargarDatos();
        } catch (e) {
            console.error('[Contactos] Desbloquear:', detalleError(e));
            showToast('No se pudo desbloquear.', 'error');
        } finally { state.operaciones.delete(clave); }
    }

    function abrirMensaje(id) {
        if (!id) return;
        window.location.href = CONFIG.MENSAJES_URL + '?usuario=' + encodeURIComponent(id);
    }

    function llamarContacto(id) {
        if (!id) return;
        window.location.href = CONFIG.MENSAJES_URL + '?usuario=' + encodeURIComponent(id) + '&accion=llamada';
    }

    function abrirPerfil(id) {
        var p = state.perfiles.get(id);
        // CORRECCIÓN QUIRÚRGICA: Si no hay handle, usamos el ID como respaldo para que siempre funcione
        if (!id) {
            showToast('Perfil no disponible.', 'warning');
            return;
        }
        var params = new URLSearchParams();
        if (p && p.handle) params.set('u', p.handle);
        params.set('id', id);
        window.location.href = CONFIG.PERFIL_URL + '?' + params.toString();
    }

    /* ---------------- Agregar por código ---------------- */

    function mensajeCanje(texto, tipo) {
        var el = document.getElementById('canjeMsg');
        if (!el) return;
        el.textContent = texto;
        el.className = 'canje-msg' + (tipo ? ' ' + tipo : '');
    }

    async function cargarMiCodigo() {
        var client = sb();
        var s = await getSession();
        var el = document.getElementById('codigoPropio');
        if (!el) return;
        if (!client || !s) { el.textContent = 'Inicia sesión'; return; }
        el.textContent = 'Generando…';
        try {
            var r = await withRetry(function () { return client.rpc(CONFIG.RPC_MI_CODIGO); }, 'mi código');
            if (r.error) throw r.error;
            var inv = Array.isArray(r.data) ? r.data[0] : r.data;
            if (!inv || !inv.codigo) throw new Error('sin código');
            el.textContent = String(inv.codigo);
        } catch (e) {
            console.error('[Contactos] Mi código:', detalleError(e));
            el.textContent = 'No disponible';
        }
    }

    function abrirAgregar() {
        abrirModal('modalAgregar');
        mensajeCanje('', '');
        var input = document.getElementById('inputCodigo');
        if (input) { input.value = ''; setTimeout(function () { input.focus(); }, 150); }
        cargarMiCodigo();
    }

    async function canjearCodigo(ev) {
        if (ev) ev.preventDefault();
        var input = document.getElementById('inputCodigo');
        var btn = document.getElementById('btnCanjear');
        if (!input || !btn || state.canjeEnCurso) return;

        var codigo = normalizarCodigo(input.value);
        if (!/^[A-Z0-9-]{6,12}$/.test(codigo)) {
            mensajeCanje('Escribe un código válido.', 'error');
            return;
        }
        if (Date.now() < state.canjeBloqueadoHasta) {
            mensajeCanje('Espera un momento antes de intentar de nuevo.', 'warning');
            return;
        }

        var client = sb();
        var s = await getSession();
        if (!client || !s) { mensajeCanje('Inicia sesión para agregar contactos.', 'error'); return; }

        state.canjeEnCurso = true;
        btn.disabled = true;
        mensajeCanje('Enviando…', '');

        var r = await seguro(function () {
            return client.rpc(CONFIG.RPC_CANJEAR, { p_codigo: codigo });
        }, 'canjear código');

        state.canjeEnCurso = false;
        setTimeout(function () { btn.disabled = false; }, CONFIG.COOLDOWN_CANJE_MS);

        if (r.error) {
            var m = r.error.message || '';
            if (r.error.code === '42501' || m.indexOf('no_autenticado') !== -1) {
                mensajeCanje('Tu sesión expiró. Vuelve a iniciar sesión.', 'error');
            } else {
                mensajeCanje('No se pudo enviar. Intenta más tarde.', 'error');
            }
            return;
        }

        var estado = r.data && r.data.estado;

        if (estado === 'rate_limited') {
            state.canjeBloqueadoHasta = Date.now() + CONFIG.BLOQUEO_CANJE_MS;
            mensajeCanje('Demasiados intentos. Espera unos minutos.', 'error');
            return;
        }

        var textos = {
            solicitud_enviada: ['Solicitud enviada. Aparecerá cuando la acepte.', 'ok'],
            ya_son_contactos: ['Ya son contactos.', 'ok'],
            ya_pendiente: ['Ya enviaste una solicitud a esta persona.', 'warning'],
            te_envio_solicitud: ['Esta persona ya te envió una solicitud. Revísala en Solicitudes.', 'warning'],
            propio: ['Ese es tu propio código.', 'error'],
            codigo_expirado: ['Ese código ya expiró.', 'error'],
            codigo_invalido: ['Código no válido.', 'error'],
            no_disponible: ['No se pudo agregar con este código.', 'error']
        };
        var t = textos[estado] || ['No se pudo completar la acción.', 'error'];
        mensajeCanje(t[0], t[1]);

        if (estado === 'solicitud_enviada') {
            input.value = '';
            cargarDatos();
        }
    }

    async function copiarCodigo() {
        var el = document.getElementById('codigoPropio');
        if (!el) return;
        var cod = el.textContent.trim();
        if (!cod || cod === 'Generando…' || cod === 'No disponible' || cod === 'Inicia sesión') return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(cod);
            } else {
                var tmp = document.createElement('textarea');
                tmp.value = cod;
                tmp.setAttribute('readonly', '');
                tmp.style.position = 'fixed';
                tmp.style.opacity = '0';
                document.body.appendChild(tmp);
                tmp.select();
                var ok = document.execCommand('copy');
                tmp.remove();
                if (!ok) throw new Error('copia no disponible');
            }
            showToast('Código copiado.', 'success');
        } catch (e) {
            showToast('No se pudo copiar el código.', 'error');
        }
    }

    /* ---------------- Configuración ---------------- */

    function fila(titulo, desc, control) {
        return '<div class="cfg-fila"><div class="cfg-fila-txt">' + esc(titulo) +
            (desc ? '<small>' + esc(desc) + '</small>' : '') + '</div>' + control + '</div>';
    }

    function interruptor(id, marcado) {
        return '<label class="switch"><input type="checkbox" data-cfg="' + id + '"' + (marcado ? ' checked' : '') + ' aria-label="' + esc(id) + '"></label>';
    }

    function seccion(t) {
        return '<div class="cfg-sec">' + esc(t) + '</div>';
    }

    function renderConfig() {
        var p = state.prefs;
        var a = state.a11y;
        var quien = p.chats_quien_puede_mensajes || 'todos';
        var opciones = [['todos', 'Todos'], ['contactos', 'Mis contactos'], ['nadie', 'Nadie']]
            .map(function (o) { return '<option value="' + o[0] + '"' + (quien === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
        var tamanos = ['80', '100', '120', '140'].map(function (t) {
            return '<button type="button" data-a11y-texto="' + t + '" class="' + (a.texto === t ? 'active' : '') + '">' + t + '%</button>';
        }).join('');

        document.getElementById('cfgBody').innerHTML =
            seccion('Visibilidad') +
            fila('Encontrarme por correo', 'Otros pueden encontrarte buscando tu correo.', interruptor('visEmail', p.visibilidad_encontrarme_email === true)) +
            fila('Encontrarme por teléfono', 'Otros pueden encontrarte buscando tu teléfono.', interruptor('visTel', p.visibilidad_encontrarme_telefono === true)) +
            fila('Ocultar mi estado en línea', 'Los demás no verán cuando estás conectado.', interruptor('visEstado', state.ocultarEstado === true)) +
            seccion('Chats') +
            fila('Quién puede enviarme mensajes', '', '<select class="sel" data-cfg="chQuien">' + opciones + '</select>') +
            fila('Filtrar solicitudes de desconocidos', 'Sus mensajes llegan a solicitudes.', interruptor('chFiltro', p.chats_filtro_solicitudes !== false)) +
            fila('Confirmación de leído', 'La otra persona verá cuando leíste.', interruptor('chLeido', p.chats_mostrar_leido !== false)) +
            fila('Mostrar cuando escribo', 'La otra persona verá "escribiendo".', interruptor('chEscribiendo', p.chats_mostrar_escribiendo !== false)) +
            seccion('Accesibilidad') +
            fila('Tamaño de texto', 'Aplica a esta página.', '<div class="seg" role="group" aria-label="Tamaño de texto">' + tamanos + '</div>') +
            fila('Alto contraste', 'Texto blanco y bordes más visibles.', interruptor('a11yContraste', a.contraste === true)) +
            seccion('Mis listas') +
            '<button type="button" class="cfg-link" data-goto="silenciados"><span class="cfg-fila-txt">Silenciados</span><span class="cfg-cuenta">' + state.silenciados.length + '</span></button>' +
            '<button type="button" class="cfg-link" data-goto="bloqueados"><span class="cfg-fila-txt">Bloqueados</span><span class="cfg-cuenta">' + state.bloqueados.length + '</span></button>' +
            '<button type="button" class="cfg-link" data-goto="pendientes"><span class="cfg-fila-txt">Solicitud pendiente</span><span class="cfg-cuenta">' + state.recibidas.length + '</span></button>' +
            '<button type="button" class="cfg-link" data-goto="enviadas"><span class="cfg-fila-txt">Solicitudes enviadas</span><span class="cfg-cuenta">' + state.enviadas.length + '</span></button>';
    }

    async function onCfgChange(el) {
        var k = el.getAttribute('data-cfg');
        var v = el.type === 'checkbox' ? el.checked : el.value;
        el.disabled = true;
        try {
            if (k === 'a11yContraste') {
                await guardarA11y({ contraste: v });
            } else if (k === 'visEstado') {
                var client = sb();
                var s = await getSession();
                if (!client || !s) throw new Error('Inicia sesión.');
                var r = await client.from(CONFIG.USUARIOS_TABLE).update({ ocultar_estado: v }).eq('id', s.user.id);
                if (r.error) throw r.error;
                state.ocultarEstado = v;
                showToast('Preferencia guardada.', 'success');
            } else {
                var mapa = {
                    visEmail: 'visibilidad_encontrarme_email',
                    visTel: 'visibilidad_encontrarme_telefono',
                    chQuien: 'chats_quien_puede_mensajes',
                    chFiltro: 'chats_filtro_solicitudes',
                    chLeido: 'chats_mostrar_leido',
                    chEscribiendo: 'chats_mostrar_escribiendo'
                };
                var patch = {};
                patch[mapa[k]] = v;
                await guardarPrefs(patch);
                showToast('Preferencia guardada.', 'success');
            }
        } catch (e) {
            console.error('[Contactos] Config:', detalleError(e));
            showToast('No se pudo guardar.', 'error');
            if (el.type === 'checkbox') el.checked = !v;
        } finally {
            el.disabled = false;
        }
    }

    function abrirConfig() {
        renderConfig();
        abrirModal('modalConfig');
    }

    /* ---------------- Eventos ---------------- */

    function configurarEventos() {
        document.querySelectorAll('.filtro[data-filtro]').forEach(function (b) {
            b.addEventListener('click', function () { setFiltro(b.getAttribute('data-filtro') || 'todos'); });
        });

        var input = document.getElementById('searchInput');
        var btnVoz = document.getElementById('btnVozBuscar');
        var btnLimpiar = document.getElementById('btnLimpiarBusqueda');

        if (btnVoz) btnVoz.addEventListener('click', iniciarVoz);

        if (btnLimpiar) btnLimpiar.addEventListener('click', function () {
            aplicarBusqueda('');
            if (input) input.focus();
        });

        if (input) {
            var timerBusqueda = null;
            input.addEventListener('input', function () {
                var valor = input.value;
                var limpiar = document.getElementById('btnLimpiarBusqueda');
                if (limpiar) limpiar.hidden = !normalizarTexto(valor);
                clearTimeout(timerBusqueda);
                timerBusqueda = setTimeout(function () { aplicarBusqueda(valor); }, CONFIG.DEBOUNCE_BUSQUEDA_MS);
            });
            input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    clearTimeout(timerBusqueda);
                    aplicarBusqueda(input.value);
                }
            });
        }

        var lista = document.getElementById('contactosList');
        if (lista) {
            lista.addEventListener('click', function (ev) {
                var btn = ev.target.closest('[data-act]');
                if (!btn) return;
                var act = btn.getAttribute('data-act');
                if (act === 'mas') { cargarMas(); return; }
                if (act === 'reintentar') { cargarDatos(); return; }
                var fila = btn.closest('.fila');
                var id = fila ? fila.getAttribute('data-id') : null;
                var filaId = fila ? fila.getAttribute('data-fila') : null;

                switch (act) {
                    case 'msg': abrirMensaje(id); break;
                    case 'call': llamarContacto(id); break;
                    case 'perfil': abrirPerfil(id); break;
                    case 'fav': toggleFavorito(filaId); break;
                    case 'mute': silenciar(id, true); break;
                    case 'unmute': silenciar(id, false); break;
                    case 'block': bloquearContacto(id); break;
                    case 'del': eliminarContacto(id); break;
                    case 'add': agregarContacto(id); break;
                    case 'accept': responderSolicitud(filaId, true); break;
                    case 'reject': responderSolicitud(filaId, false); break;
                    case 'cancel': cancelarEnviada(filaId); break;
                    case 'unblock': desbloquear(id); break;
                }
            });
        }

        var cfg = document.getElementById('cfgBody');
        if (cfg) {
            cfg.addEventListener('change', function (ev) {
                var el = ev.target.closest('[data-cfg]');
                if (el) onCfgChange(el);
            });
            cfg.addEventListener('click', function (ev) {
                var texto = ev.target.closest('[data-a11y-texto]');
                if (texto) { guardarA11y({ texto: texto.getAttribute('data-a11y-texto') }); return; }
                var goto = ev.target.closest('[data-goto]');
                if (goto) {
                    cerrarModal('modalConfig');
                    setFiltro(goto.getAttribute('data-goto'));
                }
            });
        }

        document.addEventListener('click', function (ev) {
            var open = ev.target.closest('[data-open]');
            if (open && open.getAttribute('data-open') === 'agregar') { abrirAgregar(); return; }
            var close = ev.target.closest('[data-close]');
            if (close) { cerrarModal(close.getAttribute('data-close')); return; }
            if (ev.target.classList && ev.target.classList.contains('overlay')) {
                cerrarModal(ev.target.id);
            }
        });

        var btnConfig = document.getElementById('btnAbrirConfigContactos');
        if (btnConfig) btnConfig.addEventListener('click', abrirConfig);

        var formCanje = document.getElementById('formCanje');
        if (formCanje) formCanje.addEventListener('submit', canjearCodigo);

        var btnCopiar = document.getElementById('btnCopiarCodigo');
        if (btnCopiar) btnCopiar.addEventListener('click', copiarCodigo);

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape') {
                ['modalAgregar', 'modalConfig'].forEach(cerrarModal);
            }
        });

        var client = sb();
        if (client && client.auth && client.auth.onAuthStateChange) {
            client.auth.onAuthStateChange(function (evento, session) {
                state.session = session || null;
                state.sessionExpira = Date.now() + 60000;
                if (evento === 'SIGNED_OUT') {
                    state.contactos = []; state.total = 0; state.pagina = 0; state.hayMas = false;
                    state.recibidas = []; state.enviadas = []; state.bloqueados = [];
                    state.silenciados = []; state.idsContactos.clear();
                    actualizarStats();
                    pintarVacio('Inicia sesión.');
                } else if (evento === 'SIGNED_IN' && !state.initialized) {
                    cargarDatos();
                }
            });
        }

        window.cargarContactos = cargarDatos;
    }

    function esperarSupabase() {
        var intentos = 0;
        var timer = setInterval(function () {
            intentos++;
            if (sb()) {
                clearInterval(timer);
                state.a11y = normalizarA11y(leerA11yLocal());
                aplicarA11y();
                configurarEventos();
                cargarDatos();
                return;
            }
            if (intentos >= 100) {
                clearInterval(timer);
                console.error('[Contactos] window.supabaseClient no estuvo listo después de 10 s');
                pintarVacio('Error de conexión. Recarga la página.');
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