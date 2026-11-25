// ================================================================
// CSARIEL'S · VIDEOS · SESIÓN (v1)
// ================================================================
// Usuario actual y datos que dependen de la sesión.
// - Carga el perfil privado (RPC mi_perfil_privado): tokens y avatar.
// - Actualiza el contador de Es.stoks y el avatar del encabezado.
// - Carga los contactos activos para la pestaña "Siguiendo".
// Expuesto en window.VideosApp.sesion.
// Requiere: videos-config.js, videos-utils.js
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils) {
        console.error('[Videos] videos-sesion.js requiere videos-config.js y videos-utils.js.');
        return;
    }
    if (VA.sesion) return;

    var CONFIG = VA.CONFIG;
    var U = VA.utils;
    var S = VA.state;

    /* Actualiza el contador de tokens y el avatar del encabezado. */
    function pintarPerfilEnHeader(datos) {
        var badgeCant = document.getElementById('tokenBadgeCantidad');
        if (badgeCant) badgeCant.textContent = datos.tokens || 0;

        var headerAvatar = document.getElementById('headerAvatar');
        if (!headerAvatar) return;

        if (datos.avatar_url) {
            headerAvatar.innerHTML = '<img src="' + U.safeAttr(datos.avatar_url) + '" alt="Avatar">';
        } else {
            headerAvatar.textContent = datos.nombre ? datos.nombre.charAt(0).toUpperCase() : '◈';
        }
    }

    /* Carga la sesión y el perfil privado. Devuelve el perfil o null.
       Si no hay sesión, deja sessionUser en null (modo visitante). */
    async function cargarUsuarioActual() {
        try {
            var session = await U.getSession();
            if (!session) {
                S.sessionUser = null;
                return null;
            }
            S.sessionUser = session.user;

            var sb = VA.cliente();
            if (!sb) return null;

            var result = await sb.rpc(CONFIG.RPC_MI_PERFIL_PRIVADO);
            if (result.error) throw result.error;

            var datos = result.data && result.data[0];
            if (datos) pintarPerfilEnHeader(datos);
            return datos || null;
        } catch (e) {
            console.warn('[Videos] No se pudo cargar el perfil:', e && e.message ? e.message : e);
            return null;
        }
    }

    /* Carga los contactos activos del usuario para la pestaña "Siguiendo".
       La tabla contactos tiene RLS: solo devuelve filas propias. */
    async function cargarSiguiendo() {
        S.siguiendoIds = new Set();
        if (!S.sessionUser) return;

        var sb = VA.cliente();
        if (!sb) return;

        try {
            var r = await sb.from(CONFIG.TABLA_CONTACTOS)
                .select('contacto_id')
                .eq('usuario_id', S.sessionUser.id)
                .eq('estado', 'activo');

            if (r.error) {
                console.warn('[Videos] Error cargando contactos:', r.error.message || r.error);
                return;
            }
            (r.data || []).forEach(function (x) {
                if (x.contacto_id) S.siguiendoIds.add(String(x.contacto_id));
            });
        } catch (e) {
            console.warn('[Videos] Excepción cargando contactos:', e);
        }
    }

    /* ¿El autor de este video está entre mis contactos activos? */
    function sigoAlAutor(usuarioId) {
        return S.siguiendoIds.has(String(usuarioId));
    }

    /* Pide el usuario y los contactos en orden. Lo llama videos-init.js. */
    async function cargarSesionCompleta() {
        await cargarUsuarioActual();
        await cargarSiguiendo();
        return S.sessionUser;
    }

    VA.sesion = {
        cargarUsuarioActual: cargarUsuarioActual,
        cargarSiguiendo: cargarSiguiendo,
        cargarSesionCompleta: cargarSesionCompleta,
        sigoAlAutor: sigoAlAutor
    };
})();