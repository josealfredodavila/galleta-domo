// ================================================================
// BUSCADOR GLOBAL DEL ECOSISTEMA · v1.3
// Requiere: #globalSearchInput y #globalSearchResults en la página.
// Cambios v1.3:
//  - El listener de cambio de sesión se registra una sola vez
//  - Antes de agregar revisa la relación (contactos, pendiente en
//    cualquiera de los dos sentidos) para no crear duplicados
//  - Mensajes correctos según la relación real
//  - Se quita el "@" inicial de la consulta (y de la caché)
//  - Sin emojis en la interfaz
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
    var miIdCache = undefined; // undefined = no leído, null = sin sesión
    var sesionEnganchada = false;
    var cache = new Map();     // query -> { t, lista }

    // ------------------------------------------------------------
    // UTILIDADES
    // ------------------------------------------------------------
    function notificar(msg, tipo) {
        if (typeof window.showToast === 'function') window.showToast(msg, tipo);
    }

    function normalizarQuery(valor) {
        return String(valor || '').trim().replace(/^@+/, '').trim();
    }

    function marcarBoton(boton, texto) {
        if (!boton) return;
        boton.textContent = texto;
        boton.disabled = true;
    }

    // ------------------------------------------------------------
    // CLIENTE Y SESIÓN
    // ------------------------------------------------------------
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

    // Se registra una sola vez por página
    function engancharCambioSesion(client) {
        if (sesionEnganchada || !client.auth || !client.auth.onAuthStateChange) return;
        sesionEnganchada = true;
        client.auth.onAuthStateChange(function () {
            miIdCache = undefined;
            cache.clear();
        });
    }

    // ------------------------------------------------------------
    // UI (sin innerHTML con datos de usuarios)
    // ------------------------------------------------------------
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
        } catch (e) {
            return null;
        }
    }

    function verPerfil(id, handle) {
        var param = handle
            ? '?u=' + encodeURIComponent(handle)
            : '?id=' + encodeURIComponent(id);
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
    // RELACIÓN ENTRE DOS USUARIOS
    // Devuelve: 'contactos' | 'pendiente_mia' | 'pendiente_recibida' | 'ninguna'
    // ------------------------------------------------------------
    async function estadoRelacion(client, miId, otroId) {
        var propia = await client
            .from('contactos')
            .select('estado')
            .eq('usuario_id', miId)
            .eq('contacto_id', otroId)
            .maybeSingle();
        if (propia.error) throw propia.error;
        if (propia.data) {
            return propia.data.estado === 'activo' ? 'contactos' : 'pendiente_mia';
        }

        var recibida = await client
            .from('contactos')
            .select('id')
            .eq('usuario_id', otroId)
            .eq('contacto_id', miId)
            .eq('estado', 'pendiente')
            .maybeSingle();
        if (recibida.error) throw recibida.error;
        if (recibida.data) return 'pendiente_recibida';

        return 'ninguna';
    }

    // ------------------------------------------------------------
    // ACCIONES
    // Devuelve true si el botón debe quedar marcado; false si debe
    // volver a estar disponible.
    // ------------------------------------------------------------
    async function agregarContacto(client, contactoId, boton) {
        var miId = await obtenerMiId(client);
        if (!miId) {
            notificar('Inicia sesión para agregar contactos.', 'error');
            return false;
        }
        if (contactoId === miId) {
            notificar('No puedes agregarte a ti mismo.', 'warning');
            return false;
        }

        try {
            var rel = await estadoRelacion(client, miId, contactoId);

            if (rel === 'contactos') {
                notificar('Ya están en tus contactos.', 'warning');
                marcarBoton(boton, 'Contacto');
                return true;
            }
            if (rel === 'pendiente_mia') {
                notificar('Ya enviaste una solicitud a esta persona.', 'warning');
                marcarBoton(boton, 'Enviada');
                return true;
            }
            if (rel === 'pendiente_recibida') {
                notificar('Esta persona ya te envió una solicitud. Revísala en Contactos.', 'warning');
                return false;
            }

            var res = await client.from('contactos').insert({
                usuario_id: miId,
                contacto_id: contactoId,
                estado: 'pendiente',
                es_favorito: false
            });

            if (res.error) {
                if (res.error.code === '23505') {
                    notificar('Ya enviaste una solicitud a esta persona.', 'warning');
                    marcarBoton(boton, 'Enviada');
                    return true;
                }
                throw res.error;
            }

            notificar('Solicitud de amistad enviada.', 'success');
            marcarBoton(boton, 'Enviada');
            return true;
        } catch (e) {
            console.error('[Buscador] Error al agregar:', e && e.code, e && e.message);
            notificar('No se pudo enviar la solicitud.', 'error');
            return false;
        }
    }

    // ------------------------------------------------------------
    // FILA DE RESULTADO
    // ------------------------------------------------------------
    function filaUsuario(client, u) {
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
            if (btn.disabled) return;
            btn.disabled = true;
            agregarContacto(client, u.id, btn).then(function (marcado) {
                if (!marcado) btn.disabled = false;
            });
        });

        fila.appendChild(avatar);
        fila.appendChild(info);
        fila.appendChild(btn);
        return fila;
    }

    // ------------------------------------------------------------
    // BÚSQUEDA Y CACHÉ
    // ------------------------------------------------------------
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

        mostrarMensaje('Buscando en Csariel\'s…');

        try {
            var res = await client.rpc('buscar_usuarios', { p_query: query });
            if (reqId !== ultimaBusqueda) return;
            if (res.error) throw res.error;

            var raw = res.data;
            var lista = Array.isArray(raw) ? raw
                      : (raw && Array.isArray(raw.data)) ? raw.data
                      : [];

            var miId = await obtenerMiId(client);
            lista = lista.filter(function (u) { return u && u.id !== miId; });

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
        lista.forEach(function (u) { caja.appendChild(filaUsuario(client, u)); });
        caja.classList.add('active');
    }

    // ------------------------------------------------------------
    // EVENTOS
    // ------------------------------------------------------------
    input.addEventListener('input', function (e) {
        var query = normalizarQuery(e.target.value);
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
        if (e.key === 'Escape') {
            clearTimeout(timer);
            input.value = '';
            ultimaBusqueda++;
            cerrar();
        }
    });

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.global-search-container')) cerrar();
    });
})();