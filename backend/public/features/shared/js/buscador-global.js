// ================================================================
// BUSCADOR GLOBAL DEL ECOSISTEMA · v1.1
// Requiere: #globalSearchInput y #globalSearchResults en la página
// y window.supabaseClient ya inicializado.
// Cambios v1.1:
//  - Tolera respuesta de buscar_usuarios envuelta ({data: [...]})
//  - Normaliza fields (handle / usuario_handle, avatar / avatar_url)
//  - Log de error más explícito (código + mensaje)
// ================================================================
(function () {
    'use strict';

    var input = document.getElementById('globalSearchInput');
    var caja = document.getElementById('globalSearchResults');
    if (!input || !caja) return;

    var timer = null;
    var ultimaBusqueda = 0;

    function cliente() { return window.supabaseClient || null; }

    function mostrarMensaje(texto, color) {
        var d = document.createElement('div');
        d.className = 'gs-msg';
        d.textContent = texto;
        if (color) d.style.color = color;
        caja.replaceChildren(d);
        caja.classList.add('active');
    }

    function cerrar() {
        caja.classList.remove('active');
        caja.replaceChildren();
    }

    function verPerfil(id, handle) {
        var param = handle
            ? '?u=' + encodeURIComponent(handle)
            : '?id=' + encodeURIComponent(id);
        window.location.href = '/features/perfil/perfil-publico.html' + param;
    }

    async function agregarContacto(contactoId, boton) {
        var client = cliente();
        if (!client) return;
        try {
            var sesion = await client.auth.getSession();
            var miId = sesion.data && sesion.data.session && sesion.data.session.user.id;
            if (!miId) {
                if (window.showToast) showToast('Inicia sesión para agregar contactos', 'error');
                return;
            }
            var res = await client.from('contactos').insert({
                usuario_id: miId,
                contacto_id: contactoId,
                estado: 'pendiente',
                es_favorito: false
            });
            if (res.error && res.error.code === '23505') {
                if (window.showToast) showToast('Ya enviaste una solicitud a esta persona.', 'warning');
            } else if (res.error) {
                throw res.error;
            } else {
                if (window.showToast) showToast('Solicitud de amistad enviada.', 'success');
                boton.textContent = 'Enviada';
                boton.disabled = true;
            }
        } catch (e) {
            console.error('Error al agregar:', e);
            if (window.showToast) showToast('No se pudo enviar la solicitud.', 'error');
        }
    }

    function filaUsuario(u) {
        // v1.1: tolerar nombre alternativo en la respuesta de la RPC
        var nombre = u.nombre || u.handle || u.usuario_handle || 'Usuario';
        var handleRaw = u.handle || u.usuario_handle || '';
        var avatarUrl = u.avatar_url || u.avatar || null;

        var fila = document.createElement('div');
        fila.className = 'search-user-item';
        fila.addEventListener('click', function () { verPerfil(u.id, handleRaw); });

        var avatar = document.createElement('div');
        avatar.className = 'search-user-avatar';
        if (avatarUrl) {
            var img = document.createElement('img');
            img.alt = '';
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
        if (u.verificado) {
            var check = document.createElement('span');
            check.className = 'gs-check';
            check.textContent = ' ✓';
            nom.appendChild(check);
        }

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
            agregarContacto(u.id, btn);
        });

        fila.appendChild(avatar);
        fila.appendChild(info);
        fila.appendChild(btn);
        return fila;
    }

    async function buscar(query) {
        var client = cliente();
        if (!client) return;

        var reqId = ++ultimaBusqueda;
        mostrarMensaje('🔍 Buscando en Csariel\'s…');

        try {
            var res = await client.rpc('buscar_usuarios', { p_query: query });
            if (reqId !== ultimaBusqueda) return;
            if (res.error) {
                console.error('[Buscador] RPC error:', res.error.code, res.error.message);
                throw res.error;
            }

            // v1.1: normalizar respuesta — array plano o envuelto en {data:[...]}
            var raw = res.data;
            var lista = Array.isArray(raw) ? raw
                      : (raw && Array.isArray(raw.data)) ? raw.data
                      : (raw && Array.isArray(raw.resultados)) ? raw.resultados
                      : [];

            // Excluirme a mí mismo
            var sesion = await client.auth.getSession();
            var miId = sesion.data && sesion.data.session ? sesion.data.session.user.id : null;
            lista = lista.filter(function (u) { return u.id !== miId; });

            if (!lista.length) {
                mostrarMensaje('No se encontraron usuarios.');
                return;
            }

            caja.replaceChildren.apply(caja, lista.map(filaUsuario));
            caja.classList.add('active');
        } catch (e) {
            if (reqId !== ultimaBusqueda) return;
            console.error('[Buscador] Error buscando usuarios:', e);
            mostrarMensaje('Error al buscar usuarios.', '#ff3366');
        }
    }

    input.addEventListener('input', function (e) {
        var query = e.target.value.trim();
        clearTimeout(timer);
        if (query.length < 2) {
            ultimaBusqueda++;
            cerrar();
            return;
        }
        timer = setTimeout(function () { buscar(query); }, 350);
    });

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.global-search-container')) cerrar();
    });
})();