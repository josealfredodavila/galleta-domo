// ================================================================
// CSARIEL'S · VIDEOS · COMENTARIOS (v3)
// ================================================================
// Hoja de comentarios de un video.
// - Abrir: muestra la hoja y carga los comentarios del video.
// - Enviar: botón #btnEnviarComentarioSheet o tecla Enter en #inputComentarioSheet.
//   Se conecta desde este mismo archivo (no depende de videos-init.js).
// - Eliminar: lo puede borrar el autor del comentario o el dueño del video.
//   Permisos en Supabase (verificados):
//     · "Videos comentarios DELETE propietario"     → autor del comentario
//     · "Videos comentarios DELETE dueño del video" → dueño del video
//     · "Videos comentarios INSERT autenticado"     → usuario_id = auth.uid()
// - Actualiza el contador de la tarjeta sin recargar el feed.
// - Los errores se muestran dentro de la hoja, no solo en la consola.
// Expuesto en window.VideosApp.comentarios y window.abrirComentarios.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA) {
        console.error('[Videos] videos-comentarios.js requiere window.VideosApp.');
        return;
    }
    if (VA.comentarios) return;

    var CONFIG = VA.CONFIG || {};
    var U = VA.utils || {};
    var S = VA.state || (VA.state = {});

    var C = {
        TABLA_VIDEOS: CONFIG.TABLA_VIDEOS || 'videos',
        TABLA_VIDEOS_COMENTARIOS: CONFIG.TABLA_VIDEOS_COMENTARIOS || 'videos_comentarios',
        MAX_CARACTERES: CONFIG.MAX_CARACTERES_DESCRIPCION || 2000
    };

    var enviandoComentario = false;
    var tokenCarga = 0;

    /* ----------------------------------------------------------------
       Helpers propios (no dependen de videos-utils.js)
       ---------------------------------------------------------------- */

    function escapar(v) {
        if (typeof U.escapeHTML === 'function') return U.escapeHTML(v);
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function atributoSeguro(v) {
        if (typeof U.safeAttr === 'function') return U.safeAttr(v);
        return escapar(v);
    }

    function toast(msg, tipo) {
        if (typeof U.showToast === 'function') U.showToast(msg, tipo);
        else if (typeof window.csToast === 'function') window.csToast(msg, tipo);
        else console.log('[Videos]', msg);
    }

    function sbCliente() {
        try {
            if (typeof VA.cliente === 'function') {
                var c = VA.cliente();
                if (c) return c;
            }
        } catch (e) {}
        return window.supabaseClient || null;
    }

    /* Usuario actual: usa S.sessionUser o lo pide a Supabase si aún no está. */
    async function usuarioActual() {
        if (S.sessionUser && S.sessionUser.id) return S.sessionUser;
        var sb = sbCliente();
        if (!sb) return null;
        try {
            var r = await sb.auth.getSession();
            var u = r && r.data && r.data.session ? r.data.session.user : null;
            if (u) S.sessionUser = u;
            return u;
        } catch (e) {
            return null;
        }
    }

    function leerContador(texto) {
        if (typeof U.leerContadorMostrado === 'function') return U.leerContadorMostrado(texto);
        var n = parseInt(String(texto || '').replace(/[^0-9]/g, ''), 10);
        return isNaN(n) ? 0 : n;
    }

    function formatearContador(n) {
        if (typeof U.formatContador === 'function') return U.formatContador(n);
        return String(n);
    }

    function formatearFecha(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleString('es-MX', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });
    }

    /* Línea de estado dentro de la hoja (encima de la caja de escribir). */
    function mostrarEstado(msg, tipo) {
        var caja = document.querySelector('#hojaComentarios .sheet-input');
        if (!caja || !caja.parentNode) return;
        var el = document.getElementById('comentariosEstado');
        if (!el) {
            el = document.createElement('div');
            el.id = 'comentariosEstado';
            el.style.cssText = 'font-size:.72rem;padding:6px 12px;color:#7fdcff;';
            caja.parentNode.insertBefore(el, caja);
        }
        el.style.color = tipo === 'error' ? '#ff3366' : '#7fdcff';
        el.textContent = msg || '';
        el.hidden = !msg;
    }

    function ajustarContadorTarjeta(videoId, delta) {
        if (!videoId) return;
        var contEl = document.getElementById('comentCount-' + videoId);
        if (!contEl) return;
        var actual = leerContador(contEl.textContent);
        contEl.textContent = formatearContador(Math.max(0, actual + delta));
    }

    /* ----------------------------------------------------------------
       Abrir y cargar
       ---------------------------------------------------------------- */

    function abrirComentarios(videoId) {
        if (!videoId) return;
        S.videoIdComentariosActual = videoId;

        var lista = document.getElementById('comentariosLista');
        if (lista) lista.innerHTML = '<div class="vacio">Cargando…</div>';

        var contador = document.getElementById('sheetContador');
        if (contador) contador.textContent = '0';

        mostrarEstado('', '');

        if (VA.hojas && typeof VA.hojas.abrirHoja === 'function') {
            VA.hojas.abrirHoja('hojaComentarios');
        } else {
            var hoja = document.getElementById('hojaComentarios');
            if (hoja) hoja.classList.add('show');
        }

        cargarComentarios(videoId);
    }

    async function cargarComentarios(videoId) {
        if (!videoId) return;
        var lista = document.getElementById('comentariosLista');
        if (!lista) return;

        var miToken = ++tokenCarga;
        var sb = sbCliente();
        if (!sb) {
            lista.innerHTML = '<div class="vacio">Sin conexión con la base de datos.</div>';
            return;
        }

        try {
            var result = await sb.from(C.TABLA_VIDEOS_COMENTARIOS)
                .select('*, usuarios:usuario_id (id, nombre, handle, avatar_url)')
                .eq('video_id', videoId)
                .order('created_at', { ascending: true });
            if (result.error) throw result.error;

            if (miToken !== tokenCarga) return;
            if (S.videoIdComentariosActual && S.videoIdComentariosActual !== videoId) return;

            lista = document.getElementById('comentariosLista');
            if (!lista) return;

            var data = result.data || [];

            var contador = document.getElementById('sheetContador');
            if (contador) contador.textContent = data.length;

            if (data.length === 0) {
                lista.innerHTML = '<div class="vacio">Sin comentarios todavía.</div>';
                return;
            }

            var user = S.sessionUser || null;
            var videos = Array.isArray(S.videosPublicados) ? S.videosPublicados : [];
            var videoData = videos.find(function (x) { return x.id === videoId; });
            var soyDuenoDelVideo = !!(user && videoData && videoData.usuario_id === user.id);

            var html = '';
            data.forEach(function (c) {
                var u = c.usuarios || {};
                var avatar = u.avatar_url
                    ? '<img src="' + atributoSeguro(u.avatar_url) + '" alt="">'
                    : escapar((u.nombre || 'U').charAt(0).toUpperCase());

                var puedoEliminar = !!(user && (c.usuario_id === user.id || soyDuenoDelVideo));

                html += '<div class="comentario"><div class="avatar">' + avatar + '</div><div class="cuerpo">';
                html += '<div class="nombre">' + escapar(u.nombre || 'Usuario') +
                    (u.handle ? '<span class="handle">@' + escapar(u.handle) + '</span>' : '') + '</div>';
                html += '<div class="texto">' + escapar(c.contenido || '') + '</div>';
                html += '<div class="fecha">' + escapar(formatearFecha(c.created_at)) + '</div></div>';
                if (puedoEliminar) {
                    html += '<button type="button" class="borrar" data-borrar-comentario="' +
                        escapar(c.id) + '">Eliminar</button>';
                }
                html += '</div>';
            });

            lista.innerHTML = html;

            setTimeout(function () {
                if (miToken !== tokenCarga) return;
                var listaActual = document.getElementById('comentariosLista');
                if (!listaActual || !listaActual.isConnected) return;
                if (S.videoIdComentariosActual && S.videoIdComentariosActual !== videoId) return;
                listaActual.scrollTop = listaActual.scrollHeight;
            }, 80);
        } catch (e) {
            if (miToken !== tokenCarga) return;
            console.warn('[Videos] Error cargando comentarios:', e && e.message ? e.message : e);
            var listaErr = document.getElementById('comentariosLista');
            if (listaErr) listaErr.innerHTML = '<div class="vacio">No se pudieron cargar los comentarios.</div>';
            mostrarEstado('Error al cargar: ' + ((e && e.message) || e), 'error');
        }
    }

    /* ----------------------------------------------------------------
       Enviar
       ---------------------------------------------------------------- */

    async function enviarComentario() {
        var videoId = S.videoIdComentariosActual;
        if (!videoId) {
            mostrarEstado('Abre un video para comentar.', 'error');
            return;
        }

        var input = document.getElementById('inputComentarioSheet');
        var btn = document.getElementById('btnEnviarComentarioSheet');
        if (!input) return;

        var texto = String(input.value || '').trim();
        if (!texto) {
            mostrarEstado('Escribe un comentario antes de enviar.', 'error');
            return;
        }
        if (texto.length > C.MAX_CARACTERES) {
            mostrarEstado('El comentario es demasiado largo.', 'error');
            return;
        }

        if (enviandoComentario) return;
        enviandoComentario = true;
        if (btn) btn.disabled = true;
        mostrarEstado('Enviando…', '');

        try {
            var user = await usuarioActual();
            if (!user) {
                mostrarEstado('Inicia sesión para comentar.', 'error');
                return;
            }

            var sb = sbCliente();
            if (!sb) {
                mostrarEstado('Sin conexión con la base de datos.', 'error');
                return;
            }

            var ins = await sb.from(C.TABLA_VIDEOS_COMENTARIOS).insert({
                video_id: videoId,
                usuario_id: user.id,
                contenido: texto
            });
            if (ins.error) throw ins.error;

            input.value = '';
            mostrarEstado('', '');
            ajustarContadorTarjeta(videoId, 1);

            if (S.videoIdComentariosActual === videoId) {
                await cargarComentarios(videoId);
            }
        } catch (e) {
            var msg = (e && (e.message || e.details)) || String(e);
            console.warn('[Videos] Error enviando comentario:', msg);
            mostrarEstado('No se pudo enviar: ' + msg, 'error');
            toast('No se pudo enviar el comentario', 'error');
        } finally {
            enviandoComentario = false;
            if (btn) btn.disabled = false;
        }
    }

    /* ----------------------------------------------------------------
       Eliminar
       ---------------------------------------------------------------- */

    async function eliminarComentario(comentarioId, videoId) {
        if (!comentarioId || !videoId) return;
        if (!window.confirm('¿Eliminar este comentario?')) return;

        try {
            var sb = sbCliente();
            if (!sb) return;

            var del = await sb.from(C.TABLA_VIDEOS_COMENTARIOS)
                .delete()
                .eq('id', comentarioId);
            if (del.error) throw del.error;

            var verifica = await sb.from(C.TABLA_VIDEOS_COMENTARIOS)
                .select('id')
                .eq('id', comentarioId)
                .maybeSingle();
            if (verifica.data) {
                mostrarEstado('No tienes permiso para eliminar este comentario.', 'error');
                return;
            }

            ajustarContadorTarjeta(videoId, -1);

            if (S.videoIdComentariosActual === videoId) {
                await cargarComentarios(videoId);
            }
        } catch (e) {
            var msg = (e && (e.message || e.details)) || String(e);
            console.warn('[Videos] Error eliminando comentario:', msg);
            mostrarEstado('No se pudo eliminar: ' + msg, 'error');
        }
    }

    /* ----------------------------------------------------------------
       Conexión de botones (se hace aquí, una sola vez)
       ---------------------------------------------------------------- */

    function vincularEventos() {
        var btn = document.getElementById('btnEnviarComentarioSheet');
        var input = document.getElementById('inputComentarioSheet');
        var lista = document.getElementById('comentariosLista');

        if (btn && !btn.dataset.comentariosConectado) {
            btn.dataset.comentariosConectado = '1';
            btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                enviarComentario();
            });
        }

        if (input && !input.dataset.comentariosConectado) {
            input.dataset.comentariosConectado = '1';
            input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' && !ev.isComposing) {
                    ev.preventDefault();
                    enviarComentario();
                }
            });
        }

        if (lista && !lista.dataset.comentariosConectado) {
            lista.dataset.comentariosConectado = '1';
            lista.addEventListener('click', function (ev) {
                var b = ev.target.closest && ev.target.closest('[data-borrar-comentario]');
                if (!b) return;
                eliminarComentario(b.getAttribute('data-borrar-comentario'), S.videoIdComentariosActual);
            });
        }
    }

    vincularEventos();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', vincularEventos);
    }

    /* ----------------------------------------------------------------
       Exposición
       ---------------------------------------------------------------- */

    VA.comentarios = {
        abrirComentarios: abrirComentarios,
        cargarComentarios: cargarComentarios,
        enviarComentario: enviarComentario,
        eliminarComentario: eliminarComentario
    };

    window.abrirComentarios = abrirComentarios;
    window.enviarComentario = enviarComentario;
})();