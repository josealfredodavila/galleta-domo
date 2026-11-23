/* ================================================================
   AMIGOS.JS — Csariel's (Perfil Público)
   Muestra los amigos del perfil visitado usando la función
   perfil_amigos_visibles, que aplica privacidad y bloqueos en la base.
   Sin lecturas directas a contactos ni a usuarios.
   ================================================================ */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function safeHttps(u) {
        if (!u) return null;
        try {
            var x = new URL(String(u), window.location.href);
            return x.protocol === 'https:' ? x.href : null;
        } catch (e) { return null; }
    }

    function urlPerfil(a) {
        if (a.es_yo === true) return '/features/perfil/perfil.html';
        var h = String(a.handle || '').trim();
        if (/^[A-Za-z0-9_]{1,40}$/.test(h)) {
            return '/features/perfil-publico/perfil-publico.html?u=' + encodeURIComponent(h);
        }
        return null;
    }

    function crearTarjetaAmigo(a) {
        var card = document.createElement('a');
        card.className = 'pv-amigo-card';
        var href = urlPerfil(a);
        if (href) card.href = href;

        var av = document.createElement('div');
        av.className = 'pv-amigo-av';
        var imgUrl = safeHttps(a.avatar_url);
        if (imgUrl) {
            var img = document.createElement('img');
            img.src = imgUrl;
            img.alt = '';
            img.loading = 'lazy';
            av.appendChild(img);
        } else {
            av.textContent = (a.nombre || a.handle || 'U').charAt(0).toUpperCase();
        }

        var info = document.createElement('div');
        info.className = 'pv-amigo-info';

        var nombre = document.createElement('div');
        nombre.className = 'pv-amigo-nombre';
        nombre.textContent = a.nombre || a.handle || 'Usuario';

        info.appendChild(nombre);

        if (a.handle) {
            var sub = document.createElement('div');
            sub.className = 'pv-amigo-sub';
            sub.textContent = '@' + a.handle;
            info.appendChild(sub);
        }

        card.appendChild(av);
        card.appendChild(info);
        return card;
    }

    function mensaje(listaEl, texto) {
        listaEl.innerHTML = '';
        var p = document.createElement('div');
        p.className = 'pv-pub-msg';
        p.textContent = texto;
        listaEl.appendChild(p);
    }

    async function cargarAmigosPerfil(client, perfilUsuarioId) {
        var listaEl = $('pvAmigosLista');
        var countEl = $('pvAmigosCount');
        if (!listaEl || !client || !perfilUsuarioId) return;

        mensaje(listaEl, 'Cargando amigos...');
        if (countEl) countEl.textContent = '0';

        try {
            var r = await client.rpc('perfil_amigos_visibles', {
                p_id: perfilUsuarioId,
                p_limite: 60
            });

            if (r.error) throw r.error;

            var d = r.data || {};

            if (d.estado === 'restringido') {
                mensaje(listaEl, 'La lista de amigos no está disponible para ti.');
                return;
            }

            var amigos = Array.isArray(d.amigos) ? d.amigos : [];

            if (countEl) countEl.textContent = String(amigos.length);

            if (!amigos.length) {
                mensaje(listaEl, 'Aún no tiene amigos agregados.');
                return;
            }

            listaEl.innerHTML = '';
            amigos.forEach(function (a) {
                listaEl.appendChild(crearTarjetaAmigo(a));
            });
        } catch (err) {
            console.warn('[PerfilPublico] Amigos:', err);
            mensaje(listaEl, 'No se pudieron cargar los amigos en este momento.');
        }
    }

    window.PerfilPublicoAmigos = {
        cargar: cargarAmigosPerfil
    };
})();