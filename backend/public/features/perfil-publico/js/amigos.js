/* ================================================================
   AMIGOS.JS — Csariel's (Perfil Público)
   Carga y muestra los amigos/contactos del perfil visitado.
   ================================================================ */
(function () {
    'use strict';

    var LIMITE_AMIGOS = 60;

    function $(id) { return document.getElementById(id); }

    function safeHttps(u) {
        if (!u) return null;
        try {
            var x = new URL(String(u), window.location.href);
            return x.protocol === 'https:' ? x.href : null;
        } catch (e) { return null; }
    }

    function urlPerfil(handle, usuarioId) {
        if (usuarioId && window.usuarioActualId && String(usuarioId) === String(window.usuarioActualId)) {
            return '/features/perfil/perfil.html';
        }
        var h = String(handle || '').trim();
        if (/^[A-Za-z0-9_]{1,40}$/.test(h)) {
            return '/features/perfil-publico/perfil-publico.html?u=' + encodeURIComponent(h);
        }
        return usuarioId ? '/features/perfil-publico/perfil-publico.html?id=' + encodeURIComponent(usuarioId) : null;
    }

    function crearTarjetaAmigo(u) {
        var card = document.createElement('a');
        card.className = 'pv-amigo-card';
        var href = urlPerfil(u.handle, u.id);
        if (href) card.href = href;

        var av = document.createElement('div');
        av.className = 'pv-amigo-av';
        var imgUrl = safeHttps(u.avatar_url);
        if (imgUrl) {
            var img = document.createElement('img');
            img.src = imgUrl;
            img.alt = '';
            img.loading = 'lazy';
            av.appendChild(img);
        } else {
            av.textContent = (u.nombre || u.handle || 'U').charAt(0).toUpperCase();
        }

        var info = document.createElement('div');
        info.className = 'pv-amigo-info';

        var nombre = document.createElement('div');
        nombre.className = 'pv-amigo-nombre';
        nombre.textContent = u.nombre || u.handle || 'Usuario';

        var sub = document.createElement('div');
        sub.className = 'pv-amigo-sub';
        sub.textContent = u.handle ? '@' + u.handle : '';

        info.appendChild(nombre);
        if (u.handle) info.appendChild(sub);

        card.appendChild(av);
        card.appendChild(info);
        return card;
    }

    async function cargarAmigosPerfil(client, perfilUsuarioId) {
        var listaEl = $('pvAmigosLista');
        var countEl = $('pvAmigosCount');
        if (!listaEl || !client || !perfilUsuarioId) return;

        listaEl.innerHTML = '<div class="pv-pub-msg">Cargando amigos...</div>';
        if (countEl) countEl.textContent = '0';

        try {
            var relRes = await client
                .from('contactos')
                .select('contacto_id')
                .eq('usuario_id', perfilUsuarioId)
                .limit(LIMITE_AMIGOS);

            if (relRes.error) throw relRes.error;

            var ids = (relRes.data || [])
                .map(function (r) { return r.contacto_id; })
                .filter(Boolean);

            if (!ids.length) {
                listaEl.innerHTML = '<div class="pv-pub-msg">Aún no tiene amigos agregados visibles.</div>';
                if (countEl) countEl.textContent = '0';
                return;
            }

            var usersRes = await client
                .from('usuarios')
                .select('id, nombre, handle, avatar_url, online')
                .in('id', ids);

            if (usersRes.error) throw usersRes.error;

            var usuarios = Array.isArray(usersRes.data) ? usersRes.data : [];
            if (countEl) countEl.textContent = String(usuarios.length);

            if (!usuarios.length) {
                listaEl.innerHTML = '<div class="pv-pub-msg">Aún no tiene amigos agregados visibles.</div>';
                return;
            }

            listaEl.innerHTML = '';
            usuarios.forEach(function (u) {
                listaEl.appendChild(crearTarjetaAmigo(u));
            });
        } catch (err) {
            console.warn('[PerfilPublico] Amigos:', err);
            listaEl.innerHTML = '<div class="pv-pub-msg">No se pudieron cargar los amigos en este momento.</div>';
        }
    }

    window.PerfilPublicoAmigos = {
        cargar: cargarAmigosPerfil
    };
})();
