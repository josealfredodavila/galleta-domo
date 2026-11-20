// ================================================================
// BUSCADOR GLOBAL DEL ECOSISTEMA · v1.3 (Blindado)
// ================================================================
(function () {
    'use strict';

    if (window.__buscadorGlobalIniciado) return;

    var input = document.getElementById('globalSearchInput');
    var caja = document.getElementById('globalSearchResults');
    if (!input || !caja) return;
    window.__buscadorGlobalIniciado = true;

    var DEBOUNCE_MS = 350;
    var MIN_CHARS = 2;
    var MAX_CACHE = 50;
    var CACHE_TTL_MS = 60 * 1000;
    var ESPERA_CLIENTE_MS = 5000;

    var timer = null;
    var ultimaBusqueda = 0;
    var miIdCache = undefined;
    var cache = new Map();

    function esperarCliente() {
        return new Promise(function (resolve) {
            var inicio = Date.now();
            (function revisar() {
                if (window.supabaseClient) return resolve(window.supabaseClient);
                if (Date.now() - inicio > ESPERA_CLIENTE_MS) return resolve(null);
                setTimeout(revisar, 100);
            })();
        });
    }

    async function obtenerMiId(client) {
        if (miIdCache !== undefined) return miIdCache;
        try {
            var sesion = await client.auth.getSession();
            miIdCache = (sesion.data && sesion.data.session && sesion.data.session.user.id) || null;
        } catch (e) {
            miIdCache = null;
        }
        return miIdCache;
    }

    function engancharCambioSesion(client) {
        if (!client.auth || !client.auth.onAuthStateChange) return;
        client.auth.onAuthStateChange(function () {
            miIdCache = undefined;
            cache.clear();
        });
    }

    function mostrarMensaje(texto, color) {
        var d = document.createElement('div');
        d.className = 'gs-msg';
        d.style.padding = '12px';
        d.style.textAlign = 'center';
        d.style.fontSize = '0.8rem';
        d.style.color = color || '#8c949c';
        d.textContent = texto;
        caja.replaceChildren(d);
        caja.classList.add('active');
    }

    function cerrar() {
        caja.classList.remove('active');
        caja.replaceChildren();
    }

    function urlAvatarSegura(url) {
        if (!url || typeof url !== 'string') return null;
        try {
            var u = new URL(url, window.location.origin);
            return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null;
        } catch (e) { return null; }
    }

    function verPerfil(id, handle) {
        var param = handle ? '?u=' + encodeURIComponent(handle) : '?id=' + encodeURIComponent(id);
        window.location.href = '/features/perfil/perfil-publico.html' + param;
    }

    function traducirError(err) {
        var msg = (err && (err.message || err.code)) || '';
        if (/no_autenticado|42501|JWT|auth/i.test(msg)) return 'Inicia sesión para buscar.';
        if (/rate|429|too many/i.test(msg)) return 'Demasiadas búsquedas. Espera un momento.';
        if (/network|Failed to fetch/i.test(msg)) return 'Sin conexión. Revisa tu internet.';
        return 'Error al buscar usuarios.';
    }

    // ------------------------------------------------------------
    // ACCIÓN CORREGIDA: Agregar contacto (valida estado previo)
    // ------------------------------------------------------------
    async function agregarContacto(client, contactoId, boton, miId) {
        if (!contactoId || !miId) return;

        try {
            boton.textContent = 'Enviando...';
            boton.disabled = true;

            // 1. Verificar si ya existe relación (enviada o recibida)
            var check = await client.from('contactos')
                .select('id, estado, usuario_id, contacto_id')
                .or('and(usuario_id.eq.' + miId + ',contacto_id.eq.' + contactoId + '),and(usuario_id.eq.' + contactoId + ',contacto_id.eq.' + miId + ')')
                .maybeSingle();

            if (check.data) {
                if (check.data.estado === 'activo') {
                    if (window.showToast) showToast('Ya son contactos.', 'info');
                    boton.textContent = 'Contacto';
                    return;
                }
                if (check.data.estado === 'pendiente') {
                    if (check.data.usuario_id === miId) {
                        if (window.showToast) showToast('Ya enviaste una solicitud.', 'warning');
                        boton.textContent = 'Enviada';
                    } else {
                        if (window.showToast) showToast('Esta persona ya te envió una solicitud. Revisa "Solicitud pendiente".', 'info');
                        boton.textContent = 'Pendiente';
                    }
                    return;
                }
            }

            // 2. Si no existe, insertar
            var res = await client.from('contactos').insert({
                usuario_id: miId,
                contacto_id: contactoId,
                estado: 'pendiente',
                es_favorito: false
            });

            if (res.error) {
                if (res.error.code === '23505') {
                    if (window.showToast) showToast('Ya existe una solicitud.', 'warning');
                    boton.textContent = 'Enviada';
                } else {
                    throw res.error;
                }
            } else {
                if (window.showToast) showToast('Solicitud de amistad enviada.', 'success');
                boton.textContent = 'Enviada';
            }

        } catch (e) {
            console.error('[Buscador] Error al agregar:', e && e.code, e && e.message);
            if (window.showToast) showToast('No se pudo enviar la solicitud.', 'error');
            boton.textContent = 'Agregar';
            boton.disabled = false;
        }
    }

    function filaUsuario(client, u, miId) {
        var handleRaw = u.handle || u.usuario_handle || '';
        var nombre = u.nombre || handleRaw || 'Usuario';
        var avatarUrl = urlAvatarSegura(u.avatar_url || u.avatar || null);

        var fila = document.createElement('div');
        fila.className = 'search-user-item';
        fila.addEventListener('click', function () { verPerfil(u.id, handleRaw); });

        var avatar = document.createElement('div');
        avatar.className = 'search-user-avatar';
        if (avatarUrl) {
            var img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            img.src = avatarUrl;
            avatar.appendChild(img);
        } else {
            avatar.textContent = nombre.charAt(0).toUpperCase();
        }

        var info = document.createElement('div');
        info.className = 'search-user-info';

        var nom = document.createElement('div');
        nom.className = 'search-user-name';
        nom.textContent = nombre;

        var handle = document.createElement('div');
        handle.className = 'search-user-handle';
        handle.textContent = handleRaw ? '@' + String(handleRaw).replace(/^@/, '') : '';

        info.appendChild(nom);
        info.appendChild(handle);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-user-action';
        btn.textContent = 'Agregar';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!btn.disabled) {
                agregarContacto(client, u.id, btn, miId);
            }
        });

        fila.appendChild(avatar);
        fila.appendChild(info);
        fila.appendChild(btn);
        return fila;
    }

    function leerCache(q) {
        var hit = cache.get(q);
        if (!hit) return null;
        if (Date.now() - hit.t > CACHE_TTL_MS) { cache.delete(q); return null; }
        return hit.lista;
    }

    function guardarCache(q, lista) {
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(q, { t: Date.now(), lista: lista });
    }

    async function buscar(client, query) {
        var reqId = ++ultimaBusqueda;
        var q = query.toLowerCase();

        var enCache = leerCache(q);
        if (enCache) {
            pintar(client, enCache, reqId);
            return;
        }

        mostrarMensaje('🔍 Buscando en Csariel\'s…');

        try {
            var res = await client.rpc('buscar_usuarios', { p_query: query });
            if (reqId !== ultimaBusqueda) return;
            if (res.error) throw res.error;

            var raw = res.data;
            var lista = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data)) ? raw.data : [];

            var miId = await obtenerMiId(client);
            lista = lista.filter(function (u) { return u.id !== miId; });

            guardarCache(q, lista);
            pintar(client, lista, reqId);
        } catch (e) {
            if (reqId !== ultimaBusqueda) return;
            console.error('[Buscador] RPC:', e && e.code, e && e.message);
            mostrarMensaje(traducirError(e), '#ff3366');
        }
    }

    function pintar(client, lista, reqId) {
        if (reqId !== ultimaBusqueda) return;
        if (!lista.length) {
            mostrarMensaje('No se encontraron usuarios.');
            return;
        }
        caja.replaceChildren();
        
        // Obtenemos miId de forma asíncrona antes de pintar
        obtenerMiId(client).then(function(miId) {
            if (reqId !== ultimaBusqueda) return;
            lista.forEach(function (u) { caja.appendChild(filaUsuario(client, u, miId)); });
            caja.classList.add('active');
        });
    }

    input.addEventListener('input', function (e) {
        var query = e.target.value.trim();
        clearTimeout(timer);
        if (query.length < MIN_CHARS) {
            ultimaBusqueda++;
            cerrar();
            return;
        }
        timer = setTimeout(async function () {
            var client = await esperarCliente();
            if (!client) {
                mostrarMensaje('No se pudo conectar. Recarga la página.', '#ff3366');
                return;
            }
            engancharCambioSesion(client);
            buscar(client, query);
        }, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { input.value = ''; ultimaBusqueda++; cerrar(); }
    });

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.global-search-container')) cerrar();
    });
})();