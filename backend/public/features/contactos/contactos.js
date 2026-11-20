/* ============================================================
   CSARIEL'S · CONTACTOS · v27.0
   Filtros: Todos, Amigos, En línea, Cercanos, Grupos,
            Bloqueados, Solicitud pendiente, Enviadas, Silenciados.
   Tablas y RPC usadas:
     contactos, bloqueos, preferencias_usuario (prefs jsonb),
     usuarios (ocultar_estado),
     perfiles_por_ids, buscar_usuarios, sugerencias_usuarios,
     bloquear_contacto, eliminar_amistad, responder_solicitud_amistad,
     obtener_o_crear_invitacion, canjear_invitacion (NUEVA: crear en SQL)
   ============================================================ */

(function () {
    'use strict';

    var CONFIG = {
        CONTACTOS_TABLE: 'contactos',
        BLOQUEOS_TABLE: 'bloqueos',
        PREFS_TABLE: 'preferencias_usuario',
        USUARIOS_TABLE: 'usuarios',
        PERFILES_RPC: 'perfiles_por_ids',
        RPC_BUSCAR_USUARIOS: 'buscar_usuarios',
        RPC_SUGERENCIAS: 'sugerencias_usuarios',
        RPC_BLOQUEAR: 'bloquear_contacto',
        RPC_INVITACION: 'obtener_o_crear_invitacion',
        RPC_RESPONDER_SOLICITUD: 'responder_solicitud_amistad',
        RPC_ELIMINAR_AMISTAD: 'eliminar_amistad',
        RPC_CANJEAR_INVITACION: 'canjear_invitacion',
        PERFIL_PUBLICO_URL: '/features/perfil/perfil-publico.html',
        MENSAJES_URL: '/features/mensajes/mensajes.html',
        LOTE_PERFILES_MAX: 200,
        MAX_SUGERENCIAS: 10,
        MAX_RESULTADOS: 20,
        MIN_CHARS: 2,
        MAX_CHARS: 80,
        SESSION_TIMEOUT_MS: 7000,
        RETRY_MAX: 3,
        RETRY_BASE_MS: 500,
        DEBOUNCE_MS: 350,
        QR_PREFIX: 'SARIELS:'
    };

    var SVG = {
        mensaje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>',
        llamar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92Z"/></svg>',
        favorito: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="width:16px;height:16px;"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',
        favoritoOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"/></svg>',
        bloquear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><circle cx="12" cy="12" r="9"/><path d="m5.64 5.64 12.72 12.72"/></svg>',
        eliminar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
        agregarAmigo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M19 8v6"/><path d="M16 11h6"/></svg>'
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
        recibidas: [],
        enviadas: [],
        bloqueados: [],
        silenciados: [],
        prefs: {},
        ocultarEstado: false,
        sugerencias: [],
        errores: { contactos: null, recibidas: null, enviadas: null, bloqueados: null },
        errorPerfiles: null,
        idsContactos: new Set(),
        perfiles: new Map(),
        operaciones: new Set(),
        scanStream: null,
        scanRaf: null,
        scanBusy: false
    };

    /* ---------------- Utilidades ---------------- */

    function sb() {
        return window.supabaseClient && typeof window.supabaseClient.from === 'function' ? window.supabaseClient : null;
    }

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function inicial(nombre) {
        var t = String(nombre || 'U').trim();
        return t ? t.charAt(0).toUpperCase() : 'U';
    }

    function handleTxt(h) {
        return h ? '@' + String(h).replace(/^@/, '') : '';
    }

    function detalleError(e) {
        if (!e) return 'error desconocido';
        var c = e.code ? e.code + ': ' : '';
        return c + (e.message || String(e));
    }

    function normalizarTexto(v) {
        return String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, CONFIG.MAX_CHARS);
    }

    function avatarSeguro(url) {
        if (!url) return '';
        var valor = String(url).trim();
        if (!valor) return '';
        try {
            if (valor.charAt(0) === '/' && valor.indexOf('//') !== 0) return valor;
            var p = new URL(valor, window.location.origin);
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
        if (id === 'modalEscanear') pararEscaner();
        m.classList.remove('active');
        m.setAttribute('aria-hidden', 'true');
    }

    function debounce(fn, ms) {
        var timer = null;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
        };
    }

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
            confirmBtn.classList.toggle('confirm-danger', opciones.danger !== false);
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');

            function limpiar() {
                cancelBtn.removeEventListener('click', cancelar);
                confirmBtn.removeEventListener('click', confirmar);
                overlay.removeEventListener('click', clickFondo);
                document.removeEventListener('keydown', teclaEsc);
            }
            function finalizar(v) {
                limpiar();
                overlay.classList.remove('active');
                overlay.setAttribute('aria-hidden', 'true');
                resolve(v);
            }
            function cancelar() { finalizar(false); }
            function confirmar() { finalizar(true); }
            function clickFondo(e) { if (e.target === overlay) finalizar(false); }
            function teclaEsc(e) { if (e.key === 'Escape') finalizar(false); }

            cancelBtn.addEventListener('click', cancelar);
            confirmBtn.addEventListener('click', confirmar);
            overlay.addEventListener('click', clickFondo);
            document.addEventListener('keydown', teclaEsc);
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
        var ultimoError = null;
        for (var i = 0; i < CONFIG.RETRY_MAX; i++) {
            try {
                var r = await fn();
                if (r && r.error) {
                    var err = r.error;
                    if (err.code === '23505' || err.code === '42501' || err.code === 'PGRST116') return r;
                    throw err;
                }
                return r;
            } catch (e) {
                ultimoError = e;
                console.warn('[Contactos] Reintento ' + (i + 1) + ' (' + contexto + '):', detalleError(e));
                if (i === CONFIG.RETRY_MAX - 1) break;
                await new Promise(function (r2) { setTimeout(r2, CONFIG.RETRY_BASE_MS * Math.pow(2, i)); });
            }
        }
        throw ultimoError;
    }

    // Igual que withRetry, pero nunca lanza: devuelve { data, error }
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
        var errores = [];
        var client = sb();
        var unicos = Array.from(new Set((ids || []).filter(Boolean)));
        var faltantes = unicos.filter(function (id) { return !state.perfiles.has(id); });
        if (client && faltantes.length) {
            for (var i = 0; i < faltantes.length; i += CONFIG.LOTE_PERFILES_MAX) {
                var lote = faltantes.slice(i, i + CONFIG.LOTE_PERFILES_MAX);
                try {
                    var r = await withRetry(function () { return client.rpc(CONFIG.PERFILES_RPC, { p_ids: lote }); }, 'perfiles');
                    if (r.error) throw r.error;
                    var encontrados = new Set();
                    (r.data || []).forEach(function (p) { state.perfiles.set(p.id, normalizarPerfil(p)); encontrados.add(p.id); });
                    lote.forEach(function (id) { if (!encontrados.has(id)) state.perfiles.set(id, null); });
                } catch (e) {
                    errores.push(detalleError(e));
                    console.error('[Contactos] Perfiles:', detalleError(e));
                }
            }
        }
        return { errores: errores };
    }

    function datosPerfil(id) {
        var p = state.perfiles.get(id);
        if (p === undefined) return { nombre: 'No se pudo cargar', handle: '', avatar: '', estado: 'error', verificado: false, online: false };
        if (p === null) return { nombre: 'Perfil no disponible', handle: '', avatar: '', estado: 'no_encontrado', verificado: false, online: false };
        return {
            nombre: p.nombre || p.handle || 'Usuario',
            handle: handleTxt(p.handle),
            avatar: p.avatar_url,
            estado: 'ok',
            verificado: p.verificado === true,
            online: p.online === true
        };
    }

    function avatarHtml(d) {
        if (d.avatar) return '<img src="' + esc(d.avatar) + '" alt="" loading="lazy">';
        return esc(inicial(d.nombre));
    }

    /* ---------------- Preferencias (prefs jsonb) ---------------- */

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

    /* ---------------- Carga principal ---------------- */

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
                    return client.from(CONFIG.CONTACTOS_TABLE)
                        .select('id, usuario_id, contacto_id, es_favorito, estado, fecha, created_at')
                        .eq('usuario_id', uid).eq('estado', 'activo')
                        .order('fecha', { ascending: false, nullsFirst: false }).limit(500);
                }, 'contactos'),
                seguro(function () {
                    return client.from(CONFIG.CONTACTOS_TABLE)
                        .select('id, usuario_id, contacto_id, created_at')
                        .eq('contacto_id', uid).eq('estado', 'pendiente');
                }, 'recibidas'),
                seguro(function () {
                    return client.from(CONFIG.CONTACTOS_TABLE)
                        .select('id, usuario_id, contacto_id, created_at')
                        .eq('usuario_id', uid).eq('estado', 'pendiente');
                }, 'enviadas'),
                seguro(function () {
                    return client.from(CONFIG.BLOQUEOS_TABLE)
                        .select('id, bloqueado_id, created_at')
                        .eq('usuario_id', uid).order('created_at', { ascending: false });
                }, 'bloqueados'),
                seguro(function () {
                    return client.from(CONFIG.PREFS_TABLE).select('prefs').eq('usuario_id', uid).maybeSingle();
                }, 'preferencias'),
                seguro(function () {
                    return client.from(CONFIG.USUARIOS_TABLE).select('ocultar_estado').eq('id', uid).maybeSingle();
                }, 'usuario')
            ]);

            var rC = res[0], rR = res[1], rE = res[2], rB = res[3], rP = res[4], rU = res[5];

            state.errores = {
                contactos: rC.error ? detalleError(rC.error) : null,
                recibidas: rR.error ? detalleError(rR.error) : null,
                enviadas: rE.error ? detalleError(rE.error) : null,
                bloqueados: rB.error ? detalleError(rB.error) : null
            };
            if (rP.error) console.warn('[Contactos] Preferencias:', detalleError(rP.error));
            if (rU.error) console.warn('[Contactos] Usuario:', detalleError(rU.error));

            state.contactos = rC.error ? [] : (rC.data || []).map(function (c) {
                return { id: c.id, contacto_id: c.contacto_id, es_favorito: c.es_favorito === true, fecha: c.fecha || c.created_at || null };
            });
            state.recibidas = rR.error ? [] : (rR.data || []).map(function (x) {
                return { id: x.id, usuario_id: x.usuario_id, fecha: x.created_at || null };
            });
            state.enviadas = rE.error ? [] : (rE.data || []).map(function (x) {
                return { id: x.id, contacto_id: x.contacto_id, fecha: x.created_at || null };
            });
            state.bloqueados = rB.error ? [] : (rB.data || []).map(function (b) {
                return { id: b.id, bloqueado_id: b.bloqueado_id };
            });

            state.prefs = (!rP.error && rP.data && rP.data.prefs) ? rP.data.prefs : {};
            state.silenciados = Array.isArray(state.prefs.silenciados) ? state.prefs.silenciados.slice() : [];
            state.ocultarEstado = !rU.error && rU.data ? rU.data.ocultar_estado === true : false;

            state.idsContactos = new Set(state.contactos.map(function (c) { return c.contacto_id; }));

            var ids = [];
            state.contactos.forEach(function (c) { ids.push(c.contacto_id); });
            state.recibidas.forEach(function (x) { ids.push(x.usuario_id); });
            state.enviadas.forEach(function (x) { ids.push(x.contacto_id); });
            state.bloqueados.forEach(function (b) { ids.push(b.bloqueado_id); });
            var lote = await cargarPerfiles(ids);
            state.errorPerfiles = lote.errores.length ? lote.errores[0] : null;

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

    async function cargarSugerencias() {
        var client = sb();
        var s = await getSession();
        if (!client || !s) return;
        try {
            var r = await withRetry(function () {
                return client.rpc(CONFIG.RPC_SUGERENCIAS, { p_limit: CONFIG.MAX_SUGERENCIAS });
            }, 'sugerencias');
            if (r.error) throw r.error;
            var bloqueadosIds = new Set(state.bloqueados.map(function (b) { return b.bloqueado_id; }));
            state.sugerencias = (Array.isArray(r.data) ? r.data : [])
                .filter(function (u) {
                    return u && u.id && u.id !== s.user.id && !state.idsContactos.has(u.id) && !bloqueadosIds.has(u.id);
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

    /* ---------------- Estadísticas y contadores ---------------- */

    function actualizarStats() {
        var total = state.contactos.length;
        var online = state.contactos.filter(function (c) {
            var p = state.perfiles.get(c.contacto_id);
            return p && p.online === true;
        }).length;
        var tEl = document.getElementById('totalContactos');
        var oEl = document.getElementById('onlineContactos');
        if (tEl) tEl.textContent = String(total);
        if (oEl) oEl.textContent = String(online);
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

    function htmlVacio(icono, texto) {
        return '<div class="empty-state"><div class="icon" aria-hidden="true">' + esc(icono) + '</div><h3>' + esc(texto) + '</h3></div>';
    }

    function htmlAviso(texto) {
        return '<div class="aviso-contactos" role="alert"><span>' + esc(texto) + '</span><button type="button" data-act="reintentar">Reintentar</button></div>';
    }

    function mostrarCargando() {
        var lista = document.getElementById('contactosList');
        if (!lista) return;
        lista.setAttribute('aria-busy', 'true');
        lista.innerHTML = [1, 2, 3, 4].map(function () {
            return '<div class="contacto-card skeleton"><div class="contacto-avatar skeleton-avatar"></div><div class="contacto-info skeleton-info"><div class="skeleton-line skeleton-line-name"></div><div class="skeleton-line skeleton-line-meta"></div></div></div>';
        }).join('');
    }

    function pintarVacio(texto) {
        var lista = document.getElementById('contactosList');
        if (!lista) return;
        lista.setAttribute('aria-busy', 'false');
        lista.innerHTML = htmlVacio('🪐', texto);
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

    function tarjetaContacto(c) {
        var fav = c.es_favorito;
        var mute = c.silenciado;
        var avatar = c.avatar
            ? '<img class="contacto-avatar-img" src="' + esc(c.avatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add(\'avatar-image-error\')"><span class="avatar-fallback avatar-fallback-hidden">' + esc(inicial(c.nombre)) + '</span>'
            : '<span class="avatar-fallback">' + esc(inicial(c.nombre)) + '</span>';
        return '<article class="contacto-card" data-id="' + esc(c.contacto_id) + '" data-fila="' + esc(c.id) + '">' +
            '<div class="contacto-avatar ' + (c.online ? 'online' : 'offline') + '" data-act="perfil" role="button" tabindex="0" aria-label="Ver perfil">' +
                avatar +
                '<span class="online-dot ' + (c.online ? 'visible' : 'hidden') + '"></span>' +
                (fav ? '<span class="favorito-badge" aria-hidden="true">★</span>' : '') +
            '</div>' +
            '<div class="contacto-info">' +
                '<div class="nombre">' + esc(c.nombre) + (c.verificado ? ' <span class="verified">✓</span>' : '') + (mute ? ' <span title="Silenciado">🔕</span>' : '') + '</div>' +
                '<div class="estado ' + (c.online ? 'online' : 'offline') + '"><span class="estado-indicador"></span> ' + (c.online ? 'En línea ahora' : 'Desconectado') + '</div>' +
                (c.handle ? '<div class="contacto-meta">' + esc(c.handle) + '</div>' : '') +
            '</div>' +
            '<div class="contacto-actions">' +
                '<button type="button" class="mensaje" data-act="msg" aria-label="Enviar mensaje">' + SVG.mensaje + '<span>Mensaje</span></button>' +
                '<button type="button" class="llamar" data-act="call" aria-label="Llamar">' + SVG.llamar + '</button>' +
                '<button type="button" class="favorito ' + (fav ? 'active' : '') + '" data-act="fav" aria-label="Favorito">' + (fav ? SVG.favorito : SVG.favoritoOutline) + '</button>' +
                '<button type="button" class="silenciar" data-act="' + (mute ? 'unmute' : 'mute') + '" aria-label="' + (mute ? 'Quitar silencio' : 'Silenciar') + '">' + (mute ? '🔔' : '🔕') + '</button>' +
                '<button type="button" class="bloquear" data-act="block" aria-label="Bloquear">' + SVG.bloquear + '</button>' +
                '<button type="button" class="eliminar" data-act="del" aria-label="Eliminar">' + SVG.eliminar + '</button>' +
            '</div>' +
        '</article>';
    }

    function htmlContactos(items, vacio) {
        if (state.errores.contactos) return htmlAviso('No se pudieron cargar tus contactos: ' + state.errores.contactos);
        if (!items.length) return htmlVacio('🪐', vacio || 'Tu red está vacía. Busca personas para conectar.');
        return items.map(tarjetaContacto).join('');
    }

    function htmlRecibidas() {
        if (state.errores.recibidas) return htmlAviso('No se pudieron cargar las solicitudes: ' + state.errores.recibidas);
        return state.recibidas.map(function (s) {
            var d = datosPerfil(s.usuario_id);
            return '<div class="solicitud-card" data-fila="' + esc(s.id) + '" data-id="' + esc(s.usuario_id) + '">' +
                '<div class="avatar">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + esc(d.nombre) + '</div><div class="handle">' + esc(d.handle) + '</div></div>' +
                '<div class="acciones">' +
                    '<button type="button" class="btn-aceptar" data-act="accept">Aceptar</button>' +
                    '<button type="button" class="btn-rechazar" data-act="reject">Rechazar</button>' +
                '</div></div>';
        }).join('');
    }

    function htmlEnviadas() {
        if (state.errores.enviadas) return htmlAviso('No se pudieron cargar las solicitudes enviadas: ' + state.errores.enviadas);
        return state.enviadas.map(function (s) {
            var d = datosPerfil(s.contacto_id);
            return '<div class="solicitud-enviada-card" data-fila="' + esc(s.id) + '" data-id="' + esc(s.contacto_id) + '">' +
                '<div class="avatar">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + esc(d.nombre) + '</div><div class="handle">' + esc(d.handle) + '</div></div>' +
                '<div class="acciones"><button type="button" class="btn-cancelar-envio" data-act="cancel">Cancelar envío</button></div>' +
            '</div>';
        }).join('');
    }

    function htmlBloqueados() {
        if (state.errores.bloqueados) return htmlAviso('No se pudieron cargar los bloqueados: ' + state.errores.bloqueados);
        if (!state.bloqueados.length) return htmlVacio('⛔', 'No tienes usuarios bloqueados.');
        return state.bloqueados.map(function (b) {
            var d = datosPerfil(b.bloqueado_id);
            return '<div class="bloqueado-card" data-id="' + esc(b.bloqueado_id) + '">' +
                '<div class="avatar">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + esc(d.nombre) + '</div><div class="handle">' + esc(d.handle) + '</div></div>' +
                '<div class="acciones"><button type="button" class="btn-desbloquear" data-act="unblock">Desbloquear</button></div>' +
            '</div>';
        }).join('');
    }

    function htmlSugerencias() {
        if (!state.sugerencias.length) return '';
        var cards = state.sugerencias.map(function (u) {
            var d = datosPerfil(u.id);
            return '<div class="sugerencia-card" data-id="' + esc(u.id) + '">' +
                '<div class="avatar ' + (d.online ? 'online' : '') + '">' + avatarHtml(d) + '</div>' +
                '<div class="info"><div class="nombre">' + esc(d.nombre) + (d.verificado ? ' <span class="verified">✓</span>' : '') + '</div>' +
                '<div class="handle">' + esc(d.handle) + '</div></div>' +
                '<div class="acciones"><button type="button" class="btn-agregar-sugerencia" data-act="add">Conectar</button></div>' +
            '</div>';
        }).join('');
        return '<div class="hud-section-title">Personas que puedes conocer</div>' + cards;
    }

    function tituloSeccion(t) {
        return '<div class="hud-section-title">' + esc(t) + '</div>';
    }

    function renderLista() {
        var lista = document.getElementById('contactosList');
        if (!lista) return;

        var cercanos = document.getElementById('cercanosSection');
        var grupos = document.getElementById('gruposSection');
        if (cercanos) cercanos.hidden = state.filtro !== 'cercanos';
        if (grupos) grupos.hidden = state.filtro !== 'recientes';

        var f = state.filtro;
        var ocultarLista = (f === 'cercanos' || f === 'recientes');
        lista.hidden = ocultarLista;
        if (ocultarLista) return;

        lista.setAttribute('aria-busy', 'false');

        // Búsqueda global por voz/texto (solo en Todos)
        if (f === 'todos' && state.texto.length >= CONFIG.MIN_CHARS) {
            buscarGlobal(state.texto, ++state.busquedaVersion);
            return;
        }

        var html = '';
        if (f === 'todos') {
            if (state.recibidas.length || state.errores.recibidas) html += tituloSeccion('Solicitudes de amistad') + htmlRecibidas();
            if (state.enviadas.length || state.errores.enviadas) html += tituloSeccion('Solicitudes enviadas') + htmlEnviadas();
            html += htmlContactos(filtrarTexto(itemsContactos()));
            html += htmlSugerencias();
        } else if (f === 'favoritos') {
            html = htmlContactos(filtrarTexto(itemsContactos().filter(function (i) { return i.es_favorito; })), 'Todavía no tienes amigos favoritos.');
        } else if (f === 'online') {
            html = htmlContactos(filtrarTexto(itemsContactos().filter(function (i) { return i.online; })), 'No hay amigos conectados ahora.');
        } else if (f === 'pendientes') {
            html = state.recibidas.length || state.errores.recibidas ? htmlRecibidas() : htmlVacio('📥', 'No tienes solicitudes pendientes.');
        } else if (f === 'enviadas') {
            html = state.enviadas.length || state.errores.enviadas ? htmlEnviadas() : htmlVacio('📤', 'No tienes solicitudes enviadas.');
        } else if (f === 'bloqueados') {
            html = htmlBloqueados();
        } else if (f === 'silenciados') {
            html = htmlContactos(filtrarTexto(itemsContactos().filter(function (i) { return i.silenciado; })), 'No tienes contactos silenciados. Toca 🔕 en un contacto para silenciarlo.');
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

    /* ---------------- Búsqueda (voz y texto) ---------------- */

    async function buscarGlobal(texto, version) {
        var client = sb();
        var s = await getSession();
        var lista = document.getElementById('contactosList');
        if (!client || !s || !lista) return;
        lista.innerHTML = '<div class="contactos-loading-more">🔍 Buscando en Csariel\'s…</div>';
        var termino = texto.replace(/^@+/, '').trim();
        try {
            var r = await withRetry(function () {
                return client.rpc(CONFIG.RPC_BUSCAR_USUARIOS, { p_query: termino });
            }, 'buscar usuarios');
            if (version !== state.busquedaVersion) return;
            if (r.error) throw r.error;
            var usuarios = (Array.isArray(r.data) ? r.data : [])
                .filter(function (u) { return u && u.id && u.id !== s.user.id; })
                .slice(0, CONFIG.MAX_RESULTADOS);
            usuarios.forEach(function (u) { state.perfiles.set(u.id, normalizarPerfil(u)); });
            if (!usuarios.length) { lista.innerHTML = htmlVacio('🛸', 'No se encontraron usuarios.'); return; }
            lista.innerHTML = usuarios.map(function (u) {
                var d = datosPerfil(u.id);
                var esContacto = state.idsContactos.has(u.id);
                var enviada = state.enviadas.some(function (x) { return x.contacto_id === u.id; });
                var boton;
                if (esContacto) boton = '<button type="button" class="btn-agregar" disabled>✓ Contacto</button>';
                else if (enviada) boton = '<button type="button" class="btn-agregar" disabled>Enviada</button>';
                else boton = '<button type="button" class="btn-agregar" data-act="add">' + SVG.agregarAmigo + ' Conectar</button>';
                return '<article class="contacto-card" data-id="' + esc(u.id) + '">' +
                    '<div class="contacto-avatar">' + avatarHtml(d) + '</div>' +
                    '<div class="contacto-info"><div class="nombre">' + esc(d.nombre) + (d.verificado ? ' <span class="verified">✓</span>' : '') + '</div>' +
                    '<div class="contacto-meta">' + esc(d.handle) + '</div></div>' +
                    '<div class="contacto-actions">' + boton + '</div></article>';
            }).join('');
        } catch (e) {
            console.error('[Contactos] Búsqueda:', detalleError(e));
            lista.innerHTML = htmlVacio('⚠️', 'Error al buscar: ' + detalleError(e));
        }
    }

    function aplicarBusqueda(valor) {
        var t = normalizarTexto(valor);
        state.texto = t.toLowerCase();
        var input = document.getElementById('searchInput');
        if (input) input.value = t;
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
        var rec = new SR();
        rec.lang = 'es-MX';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onresult = function (e) {
            var t = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
            aplicarBusqueda(t);
        };
        rec.onerror = function () { showToast('No se entendió. Intenta de nuevo.', 'warning'); };
        rec.onend = function () { if (btn) btn.classList.remove('escuchando'); };
        if (btn) btn.classList.add('escuchando');
        try { rec.start(); } catch (e) { if (btn) btn.classList.remove('escuchando'); }
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
            showToast('No se pudo enviar: ' + detalleError(e), 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function responderSolicitud(filaId, aceptar) {
        var fila = Number(filaId);
        if (!Number.isInteger(fila) || fila <= 0) { showToast('ID inválido.', 'error'); return; }
        var clave = (aceptar ? 'aceptar:' : 'rechazar:') + fila;
        if (state.operaciones.has(clave)) return;
        state.operaciones.add(clave);
        try {
            var client = sb();
            var r = await client.rpc(CONFIG.RPC_RESPONDER_SOLICITUD, { p_fila_id: fila, p_aceptar: aceptar });
            if (r.error) throw r.error;
            showToast(aceptar ? 'Amistad aceptada.' : 'Solicitud rechazada.', 'success');
            await cargarDatos();
        } catch (e) {
            console.error('[Contactos] Responder:', detalleError(e));
            showToast('Error: ' + detalleError(e), 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function cancelarEnviada(filaId) {
        var client = sb();
        var s = await getSession();
        if (!client || !s) return;
        var ok = await showConfirm({ title: 'Cancelar solicitud', message: '¿Retirar solicitud de amistad?', icon: '↩️', confirmText: 'Retirar', cancelText: 'Volver', danger: true });
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
            showToast('Error al cancelar: ' + detalleError(e), 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function toggleFavorito(filaId, contactoId) {
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
            showToast('Error al guardar favorito: ' + detalleError(e), 'error');
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
            showToast('No se pudo guardar: ' + detalleError(e), 'error');
        }
    }

    async function eliminarContacto(contactoId) {
        var s = await getSession();
        if (!s) return;
        var ok = await showConfirm({ title: 'Eliminar contacto', message: '¿Eliminar a este contacto de tu red?', icon: '🗑️', confirmText: 'Eliminar', cancelText: 'Cancelar', danger: true });
        if (!ok) return;
        var clave = 'eliminar:' + contactoId;
        if (state.operaciones.has(clave)) return;
        state.operaciones.add(clave);
        try {
            var r = await sb().rpc(CONFIG.RPC_ELIMINAR_AMISTAD, { p_contacto_id: contactoId });
            if (r.error) throw r.error;
            showToast('Contacto eliminado.', 'success');
            await cargarDatos();
        } catch (e) {
            console.error('[Contactos] Eliminar:', detalleError(e));
            showToast('Error al eliminar: ' + detalleError(e), 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function bloquearContacto(contactoId) {
        var s = await getSession();
        if (!s) return;
        if (contactoId === s.user.id) { showToast('No puedes bloquearte.', 'warning'); return; }
        var ok = await showConfirm({ title: 'Bloquear usuario', message: '¿Bloquear a este usuario? No podrá llamarte ni escribirte.', icon: '⛔', confirmText: 'Bloquear', cancelText: 'Cancelar', danger: true });
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
            showToast('Error al bloquear: ' + detalleError(e), 'error');
        } finally { state.operaciones.delete(clave); }
    }

    async function desbloquear(bloqueadoId) {
        var client = sb();
        var s = await getSession();
        if (!client || !s) return;
        var ok = await showConfirm({ title: 'Desbloquear usuario', message: '¿Permitir que este usuario te contacte de nuevo?', icon: '🔓', confirmText: 'Desbloquear', cancelText: 'Cancelar', danger: false });
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
            showToast('Error al desbloquear: ' + detalleError(e), 'error');
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
        if (!p || !p.handle) { showToast('Perfil no disponible.', 'warning'); return; }
        window.location.href = CONFIG.PERFIL_PUBLICO_URL + '?u=' + encodeURIComponent(p.handle);
    }

    /* ---------------- Configuración (modal ☰) ---------------- */

    function filaToggle(id, titulo, desc, checked) {
        return '<label class="cfg-row"><span>' + esc(titulo) + '<small>' + esc(desc) + '</small></span>' +
            '<input type="checkbox" data-cfg="' + id + '"' + (checked ? ' checked' : '') + '></label>';
    }

    function renderConfig() {
        var p = state.prefs;
        var quien = p.chats_quien_puede_mensajes || 'todos';
        var opts = [['todos', 'Todos'], ['contactos', 'Solo mis contactos'], ['nadie', 'Nadie']]
            .map(function (o) { return '<option value="' + o[0] + '"' + (quien === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');

        document.getElementById('cfgBody').innerHTML =
            '<div class="cfg-titulo">Visibilidad</div>' +
            filaToggle('visEmail', 'Encontrarme por correo', 'Otros pueden encontrarte buscando tu correo.', p.visibilidad_encontrarme_email === true) +
            filaToggle('visTel', 'Encontrarme por teléfono', 'Otros pueden encontrarte buscando tu teléfono.', p.visibilidad_encontrarme_telefono === true) +
            filaToggle('visEstado', 'Ocultar mi estado en línea', 'Los demás no verán cuando estás conectado.', state.ocultarEstado === true) +
            '<div class="cfg-titulo">Chats</div>' +
            '<label class="cfg-row"><span>Quién puede enviarme mensajes</span><select data-cfg="chQuien">' + opts + '</select></label>' +
            filaToggle('chFiltro', 'Filtrar solicitudes de desconocidos', 'Sus mensajes llegan a solicitudes.', p.chats_filtro_solicitudes !== false) +
            filaToggle('chLeido', 'Confirmación de leído', 'La otra persona verá cuando leíste.', p.chats_mostrar_leido !== false) +
            filaToggle('chEscribiendo', 'Mostrar cuando escribo', 'La otra persona verá "escribiendo…".', p.chats_mostrar_escribiendo !== false) +
            '<div class="cfg-titulo">Mis listas</div>' +
            '<button type="button" class="cfg-link" data-goto="silenciados"><span>🔕 Silenciados</span><span>' + state.silenciados.length + '</span></button>' +
            '<button type="button" class="cfg-link" data-goto="bloqueados"><span>⛔ Bloqueados</span><span>' + state.bloqueados.length + '</span></button>' +
            '<button type="button" class="cfg-link" data-goto="pendientes"><span>📥 Solicitud pendiente</span><span>' + state.recibidas.length + '</span></button>' +
            '<button type="button" class="cfg-link" data-goto="enviadas"><span>📤 Solicitudes enviadas</span><span>' + state.enviadas.length + '</span></button>';
    }

    async function onCfgChange(el) {
        var k = el.getAttribute('data-cfg');
        var v = el.type === 'checkbox' ? el.checked : el.value;
        el.disabled = true;
        try {
            if (k === 'visEstado') {
                var client = sb();
                var s = await getSession();
                if (!client || !s) throw new Error('Inicia sesión.');
                var r = await client.from(CONFIG.USUARIOS_TABLE).update({ ocultar_estado: v }).eq('id', s.user.id);
                if (r.error) throw r.error;
                state.ocultarEstado = v;
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
            }
            showToast('Preferencia guardada.', 'success');
        } catch (e) {
            console.error('[Contactos] Config:', detalleError(e));
            showToast('No se pudo guardar: ' + detalleError(e), 'error');
            if (el.type === 'checkbox') el.checked = !v;
        } finally {
            el.disabled = false;
        }
    }

    function abrirConfig() {
        renderConfig();
        abrirModal('modalConfig');
    }

    /* ---------------- QR personal y escáner ---------------- */

    async function abrirQrPersonal() {
        var client = sb();
        var s = await getSession();
        if (!client || !s) { showToast('Inicia sesión para mostrar tu QR.', 'warning'); return; }
        if (!window.QRCode) { showToast('El generador QR no se cargó. Recarga la página.', 'error'); return; }
        try {
            var r = await withRetry(function () { return client.rpc(CONFIG.RPC_INVITACION); }, 'qr');
            if (r.error) throw r.error;
            var inv = Array.isArray(r.data) ? r.data[0] : r.data;
            if (!inv || !inv.codigo) throw new Error('No se obtuvo el código');
            var cv = document.createElement('canvas');
            await window.QRCode.toCanvas(cv, CONFIG.QR_PREFIX + inv.codigo, {
                width: 240,
                margin: 2,
                color: { dark: '#05080f', light: '#ffffff' }
            });
            var lienzo = document.getElementById('qrLienzo');
            if (lienzo) { lienzo.innerHTML = ''; lienzo.appendChild(cv); }
            abrirModal('modalQR');
        } catch (e) {
            console.error('[Contactos] QR:', detalleError(e));
            showToast('No se pudo generar tu QR: ' + detalleError(e), 'error');
        }
    }

    function setEstadoEscaner(t) {
        var el = document.getElementById('scanEstado');
        if (el) el.textContent = t;
    }

    async function abrirEscaner() {
        var s = await getSession();
        if (!s) { showToast('Inicia sesión para escanear.', 'warning'); return; }
        if (!window.jsQR) { showToast('El lector QR no se cargó. Recarga la página.', 'error'); return; }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Tu navegador no permite usar la cámara.', 'error');
            return;
        }
        abrirModal('modalEscanear');
        setEstadoEscaner('Preparando cámara…');
        try {
            state.scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            var v = document.getElementById('scanVideo');
            v.srcObject = state.scanStream;
            await v.play();
            setEstadoEscaner('Apunta la cámara al código QR de Csariel\'s');
            loopEscaner();
        } catch (e) {
            console.error('[Contactos] Cámara:', detalleError(e));
            setEstadoEscaner('No se pudo acceder a la cámara. Revisa los permisos.');
        }
    }

    function loopEscaner() {
        var v = document.getElementById('scanVideo');
        var c = document.getElementById('scanCanvas');
        if (!v || !c) return;
        var ctx = c.getContext('2d', { willReadFrequently: true });

        function tick() {
            if (!state.scanStream) return;
            if (!state.scanBusy && v.readyState === v.HAVE_ENOUGH_DATA) {
                c.width = v.videoWidth;
                c.height = v.videoHeight;
                ctx.drawImage(v, 0, 0, c.width, c.height);
                var img = ctx.getImageData(0, 0, c.width, c.height);
                var code = window.jsQR(img.data, c.width, c.height, { inversionAttempts: 'dontInvert' });
                if (code && code.data) {
                    procesarQR(code.data);
                    return;
                }
            }
            state.scanRaf = requestAnimationFrame(tick);
        }
        tick();
    }

    function pararEscaner() {
        if (state.scanRaf) cancelAnimationFrame(state.scanRaf);
        state.scanRaf = null;
        if (state.scanStream) {
            state.scanStream.getTracks().forEach(function (t) { t.stop(); });
        }
        state.scanStream = null;
        var v = document.getElementById('scanVideo');
        if (v) v.srcObject = null;
        state.scanBusy = false;
    }

    async function procesarQR(texto) {
        if (state.scanBusy) return;
        if (String(texto).indexOf(CONFIG.QR_PREFIX) !== 0) {
            setEstadoEscaner('Ese código no es de Csariel\'s. Intenta con otro.');
            state.scanRaf = requestAnimationFrame(function () { loopEscaner(); });
            return;
        }
        state.scanBusy = true;
        var codigo = String(texto).slice(CONFIG.QR_PREFIX.length).trim();
        setEstadoEscaner('Procesando…');
        try {
            var client = sb();
            var r = await client.rpc(CONFIG.RPC_CANJEAR_INVITACION, { p_codigo: codigo });
            if (r.error) throw r.error;
            cerrarModal('modalEscanear');
            showToast('Listo. Revisa tus solicitudes.', 'success');
            await cargarDatos();
        } catch (e) {
            console.error('[Contactos] Canje QR:', detalleError(e));
            state.scanBusy = false;
            setEstadoEscaner('No se pudo agregar: ' + detalleError(e));
            state.scanRaf = requestAnimationFrame(function () { loopEscaner(); });
        }
    }

    /* ---------------- Invitación (código copiable) ---------------- */

    async function invitarContacto() {
        var client = sb();
        var s = await getSession();
        if (!client || !s) { showToast('Inicia sesión.', 'error'); return; }
        var codigoEl = document.getElementById('codigoInvitacion');
        abrirModal('modalInvitacion');
        if (codigoEl) codigoEl.textContent = 'Generando…';
        try {
            var r = await withRetry(function () { return client.rpc(CONFIG.RPC_INVITACION); }, 'invitar');
            if (r.error) throw r.error;
            var inv = Array.isArray(r.data) ? r.data[0] : r.data;
            if (!inv || !inv.codigo) throw new Error('El servidor no devolvió un código');
            if (codigoEl) codigoEl.textContent = String(inv.codigo);
        } catch (e) {
            console.error('[Contactos] Invitación:', detalleError(e));
            if (codigoEl) codigoEl.textContent = 'ERROR';
            showToast('Error al generar invitación: ' + detalleError(e), 'error');
        }
    }

    async function copiarCodigo() {
        var el = document.getElementById('codigoInvitacion');
        if (!el) return;
        var cod = el.textContent.trim();
        if (!cod || cod === 'Generando…' || cod === 'ERROR') return;
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
                if (!ok) throw new Error('execCommand devolvió false');
            }
            showToast('Código copiado.', 'success');
        } catch (e) {
            showToast('No se pudo copiar: ' + detalleError(e), 'error');
        }
    }

    /* ---------------- Eventos ---------------- */

    function configurarEventos() {
        // Filtros
        document.querySelectorAll('.filtro[data-filtro]').forEach(function (b) {
            b.addEventListener('click', function () { setFiltro(b.getAttribute('data-filtro') || 'todos'); });
        });

        // Búsqueda por voz
        var input = document.getElementById('searchInput');
        var btnVoz = document.getElementById('btnVozBuscar');
        if (input) input.addEventListener('click', iniciarVoz);
        if (btnVoz) btnVoz.addEventListener('click', iniciarVoz);
        var btnLimpiar = document.getElementById('btnLimpiarBusqueda');
        if (btnLimpiar) btnLimpiar.addEventListener('click', function () { aplicarBusqueda(''); });

        // Lista principal (acciones de tarjetas, solicitudes, bloqueados, sugerencias)
        var lista = document.getElementById('contactosList');
        if (lista) {
            lista.addEventListener('click', function (ev) {
                var btn = ev.target.closest('[data-act]');
                if (!btn) return;
                var card = btn.closest('.contacto-card, .solicitud-card, .solicitud-enviada-card, .bloqueado-card, .sugerencia-card');
                var act = btn.getAttribute('data-act');
                var id = btn.getAttribute('data-id') || (card && card.getAttribute('data-id'));
                var fila = btn.getAttribute('data-fila') || (card && card.getAttribute('data-fila'));

                switch (act) {
                    case 'msg': abrirMensaje(id); break;
                    case 'call': llamarContacto(id); break;
                    case 'perfil': abrirPerfil(id); break;
                    case 'fav': toggleFavorito(fila, id); break;
                    case 'mute': silenciar(id, true); break;
                    case 'unmute': silenciar(id, false); break;
                    case 'block': bloquearContacto(id); break;
                    case 'del': eliminarContacto(id); break;
                    case 'add': agregarContacto(id); break;
                    case 'accept': responderSolicitud(fila, true); break;
                    case 'reject': responderSolicitud(fila, false); break;
                    case 'cancel': cancelarEnviada(fila); break;
                    case 'unblock': desbloquear(id); break;
                    case 'reintentar': cargarDatos(); break;
                }
            });
        }

        // Modal de configuración: cambios y accesos directos a listas
        var cfg = document.getElementById('cfgBody');
        if (cfg) {
            cfg.addEventListener('change', function (ev) {
                var el = ev.target.closest('[data-cfg]');
                if (el) onCfgChange(el);
            });
            cfg.addEventListener('click', function (ev) {
                var b = ev.target.closest('[data-goto]');
                if (!b) return;
                cerrarModal('modalConfig');
                setFiltro(b.getAttribute('data-goto'));
            });
        }

        // Botones que abren modales
        document.addEventListener('click', function (ev) {
            var open = ev.target.closest('[data-open]');
            if (open) {
                var what = open.getAttribute('data-open');
                if (what === 'invitar') invitarContacto();
                if (what === 'qr') abrirQrPersonal();
                if (what === 'escanear') abrirEscaner();
                return;
            }
            var close = ev.target.closest('[data-close]');
            if (close) { cerrarModal(close.getAttribute('data-close')); return; }
            if (ev.target.classList && ev.target.classList.contains('modal-overlay')) {
                cerrarModal(ev.target.id);
            }
        });

        var btnConfig = document.getElementById('btnAbrirConfigContactos');
        if (btnConfig) btnConfig.addEventListener('click', abrirConfig);

        var btnCopiar = document.getElementById('btnCopiarCodigo');
        if (btnCopiar) btnCopiar.addEventListener('click', copiarCodigo);

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape') {
                ['modalQR', 'modalEscanear', 'modalConfig', 'modalInvitacion'].forEach(cerrarModal);
            }
        });

        window.addEventListener('beforeunload', pararEscaner);

        var client = sb();
        if (client && client.auth && client.auth.onAuthStateChange) {
            client.auth.onAuthStateChange(function (evento, session) {
                state.session = session || null;
                state.sessionExpira = Date.now() + 60000;
                if (evento === 'SIGNED_OUT') {
                    state.contactos = []; state.recibidas = []; state.enviadas = [];
                    state.bloqueados = []; state.silenciados = []; state.idsContactos.clear();
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