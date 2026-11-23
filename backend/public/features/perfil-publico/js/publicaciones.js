/* ================================================================
   PUBLICACIONES.JS — Csariel's (Perfil Público)
   Maneja renderizado de tarjetas, multimedia, reacciones y comentarios.
   ================================================================ */
(function () {
    'use strict';

    var COMENTARIOS_LIMITE = 50;
    var medioActivo = null;

    function $(id) { return document.getElementById(id); }

    function toast(msg, tipo) {
        if (typeof window.showToast === 'function') { window.showToast(msg, tipo || 'success'); return; }
        var t = $('toast');
        if (!t) return;
        t.textContent = String(msg || '');
        t.className = 'toast' + (tipo ? ' ' + tipo : '');
        requestAnimationFrame(function () { t.classList.add('show'); });
        clearTimeout(window.__pvToastTimer);
        window.__pvToastTimer = setTimeout(function () { t.classList.remove('show'); }, 3600);
    }

    function msgError(e) {
        if (!e) return 'error desconocido';
        return e.message || e.details || e.hint || e.code || 'error desconocido';
    }

    function safeHttps(u) {
        if (!u) return null;
        try {
            var x = new URL(String(u), window.location.href);
            return x.protocol === 'https:' ? x.href : null;
        } catch (e) { return null; }
    }

    function fechaPost(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function RG() {
        return window.ReaccionesGlobal || {
            EMOJIS: ['❤️', '😂', '🥺', '💎'],
            POR_DEFECTO: '❤️',
            normalizar: function (e) { return this.EMOJIS.indexOf(e) !== -1 ? e : '❤️'; },
            aplicarMotor: function () {},
            resumir: function (filas, uid) {
                var t = {}, total = 0, mi = null, self = this;
                (filas || []).forEach(function (f) {
                    var x = self.normalizar(f.tipo);
                    t[x] = (t[x] || 0) + 1; total++;
                    if (uid && f.usuario_id === uid) mi = x;
                });
                return { totales: t, total: total, miTipo: mi };
            }
        };
    }

    function registrarReproductorUnico(elMedia) {
        elMedia.addEventListener('play', function () {
            if (medioActivo && medioActivo !== elMedia) {
                try { medioActivo.pause(); } catch (e) {}
            }
            medioActivo = elMedia;
        });
    }

    /* ================= VISOR MULTIMEDIA ================= */
    function cerrarLightbox() {
        var lb = $('pvLightbox'); var body = $('pvLightboxBody');
        if (medioActivo && body && body.contains(medioActivo)) {
            try { medioActivo.pause(); } catch (e) {}
            medioActivo = null;
        }
        if (lb) lb.hidden = true;
        if (body) body.innerHTML = '';
    }

    function abrirLightbox(tipo, url) {
        var segura = safeHttps(url);
        if (!segura) return;
        var body = $('pvLightboxBody');
        if (!body) return;
        if (medioActivo) {
            try { medioActivo.pause(); } catch (e) {}
        }
        body.innerHTML = '';
        if (tipo === 'video') {
            var vid = document.createElement('video');
            vid.src = segura;
            vid.controls = true;
            vid.autoplay = true;
            vid.playsInline = true;
            vid.setAttribute('playsinline', '');
            vid.style.width = '100%';
            vid.style.maxWidth = '540px';
            vid.style.maxHeight = '85vh';
            vid.style.objectFit = 'contain';
            registrarReproductorUnico(vid);
            body.appendChild(vid);
        } else {
            var img = document.createElement('img');
            img.src = segura;
            img.alt = '';
            img.style.maxWidth = '95vw';
            img.style.maxHeight = '85vh';
            img.style.objectFit = 'contain';
            body.appendChild(img);
        }
        var lb = $('pvLightbox');
        if (lb) lb.hidden = false;
    }

    /* ================= RENDER MEDIA (PROPORCIÓN ESTABLE) ================= */
    function resolverMedia(p) {
        var url = safeHttps(p.media_url);
        if (!url) return null;
        var tipo = String(p.media_type || '').toLowerCase();
        if (!tipo) {
            if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) tipo = 'video';
            else if (/\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(url)) tipo = 'audio';
            else tipo = 'imagen';
        }
        return { url: url, tipo: tipo };
    }

    function renderMedia(meta, p) {
        var media = resolverMedia(p);
        if (!media) return;
        var sinDescarga = p.permitir_descarga === false;

        if (media.tipo === 'video') {
            var marcoVideo = document.createElement('div');
            marcoVideo.className = 'pv-media-marco';
            marcoVideo.style.width = '100%';
            marcoVideo.style.aspectRatio = '9 / 16';
            marcoVideo.style.maxHeight = '75vh';
            marcoVideo.style.marginTop = '12px';
            marcoVideo.style.borderRadius = '14px';
            marcoVideo.style.overflow = 'hidden';
            marcoVideo.style.background = '#000';
            marcoVideo.style.position = 'relative';

            var vid = document.createElement('video');
            vid.className = 'pv-post-video';
            vid.src = media.url;
            vid.controls = true;
            vid.preload = 'metadata';
            vid.playsInline = true;
            vid.setAttribute('playsinline', '');
            vid.setAttribute('webkit-playsinline', '');
            if (sinDescarga) vid.setAttribute('controlsList', 'nodownload');

            vid.style.width = '100%';
            vid.style.height = '100%';
            vid.style.marginTop = '0';
            vid.style.objectFit = 'cover';
            vid.style.objectPosition = 'center';

            vid.addEventListener('loadedmetadata', function () {
                if (vid.videoWidth && vid.videoHeight) {
                    var ratio = vid.videoWidth / vid.videoHeight;
                    if (ratio >= 1) {
                        marcoVideo.style.aspectRatio = vid.videoWidth + ' / ' + vid.videoHeight;
                        vid.style.objectFit = 'contain';
                    } else {
                        marcoVideo.style.aspectRatio = '9 / 16';
                        vid.style.objectFit = 'cover';
                    }
                }
            });

            registrarReproductorUnico(vid);
            marcoVideo.appendChild(vid);
            meta.appendChild(marcoVideo);
        } else if (media.tipo === 'audio') {
            var aud = document.createElement('audio');
            aud.className = 'pv-post-audio';
            aud.src = media.url;
            aud.controls = true;
            aud.preload = 'none';
            if (sinDescarga) aud.setAttribute('controlsList', 'nodownload');
            registrarReproductorUnico(aud);
            meta.appendChild(aud);
        } else {
            var img = document.createElement('img');
            img.className = 'pv-post-img';
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = media.url;
            img.addEventListener('click', function () { abrirLightbox('imagen', media.url); });
            meta.appendChild(img);
        }
    }

    /* ================= REACCIONES ================= */
    function pintarBarraReacciones(bar, resumen) {
        var rg = RG();
        bar.innerHTML = '';
        rg.EMOJIS.forEach(function (emoji) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pv-btn-reaccion' + (resumen.miTipo === emoji ? ' activo' : '');
            btn.setAttribute('data-tipo', emoji);
            btn.setAttribute('aria-label', 'Reaccionar con ' + emoji);

            var ico = document.createElement('span');
            ico.textContent = emoji;
            rg.aplicarMotor(ico, emoji);

            var cant = document.createElement('span');
            var n = resumen.totales[emoji] || 0;
            cant.textContent = n > 0 ? String(n) : '';

            btn.appendChild(ico); btn.appendChild(cant);
            bar.appendChild(btn);
        });
        bar._resumen = resumen;
    }

    async function refrescarReacciones(client, pubId, bar) {
        var r = await client.from('publicaciones_reacciones').select('tipo, usuario_id').eq('publicacion_id', pubId);
        if (r.error) throw r.error;
        pintarBarraReacciones(bar, RG().resumir(r.data || [], window.usuarioActualId));
    }

    async function alternarReaccion(client, pubId, tipo, bar) {
        if (!window.usuarioActualId) {
            toast('Inicia sesión para reaccionar', 'error');
            return;
        }
        var botones = bar.querySelectorAll('button');
        botones.forEach(function (b) { b.disabled = true; });
        try {
            var miTipo = bar._resumen ? bar._resumen.miTipo : null;
            var res;
            if (miTipo === tipo) {
                res = await client.from('publicaciones_reacciones').delete().eq('publicacion_id', pubId).eq('usuario_id', window.usuarioActualId);
            } else if (miTipo) {
                res = await client.from('publicaciones_reacciones').update({ tipo: tipo }).eq('publicacion_id', pubId).eq('usuario_id', window.usuarioActualId);
            } else {
                res = await client.from('publicaciones_reacciones').insert({ publicacion_id: pubId, usuario_id: window.usuarioActualId, tipo: tipo });
            }
            if (res.error) throw res.error;
            await refrescarReacciones(client, pubId, bar);
        } catch (e) {
            console.warn('[PerfilPublico] Reacción:', e);
            toast('No se pudo reaccionar: ' + msgError(e), 'error');
        } finally {
            botones.forEach(function (b) { b.disabled = false; });
        }
    }

    /* ================= COMENTARIOS ================= */
    function pintarComentarios(listaEl, filas) {
        listaEl.innerHTML = '';
        if (!filas.length) {
            var vacio = document.createElement('div');
            vacio.className = 'pv-comentario-item';
            vacio.textContent = 'Sin comentarios todavía.';
            listaEl.appendChild(vacio);
            return;
        }
        filas.forEach(function (c) {
            var item = document.createElement('div');
            item.className = 'pv-comentario-item';
            var autor = document.createElement('span');
            autor.className = 'pv-comentario-autor';
            autor.textContent = c.usuario_nombre || c.usuario_handle || 'Miembro';
            var txt = document.createElement('span');
            txt.textContent = c.contenido || '';
            item.appendChild(autor); item.appendChild(txt);
            listaEl.appendChild(item);
        });
    }

    async function cargarComentarios(client, pubId, listaEl, countEl) {
        listaEl.innerHTML = '<div class="pv-comentario-item">Cargando comentarios...</div>';
        try {
            var r = await client
                .from('publicaciones_comentarios_publicos')
                .select('id, usuario_id, contenido, created_at, usuario_nombre, usuario_handle')
                .eq('publicacion_id', pubId)
                .order('created_at', { ascending: true })
                .limit(COMENTARIOS_LIMITE);
            if (r.error) throw r.error;
            var filas = Array.isArray(r.data) ? r.data : [];
            pintarComentarios(listaEl, filas);
            if (countEl) countEl.textContent = String(filas.length);
        } catch (e) {
            console.warn('[PerfilPublico] Comentarios:', e);
            listaEl.innerHTML = '<div class="pv-comentario-item">No se pudieron cargar los comentarios: ' + msgError(e) + '</div>';
        }
    }

    async function enviarComentario(client, pubId, inputEl, listaEl, countEl) {
        if (!window.usuarioActualId) {
            toast('Inicia sesión para comentar', 'error');
            return;
        }
        var texto = String(inputEl.value || '').trim();
        if (!texto) return;
        inputEl.disabled = true;
        try {
            var ins = await client.from('publicaciones_comentarios').insert({ publicacion_id: pubId, usuario_id: window.usuarioActualId, contenido: texto });
            if (ins.error) throw ins.error;
            inputEl.value = '';
            await cargarComentarios(client, pubId, listaEl, countEl);
        } catch (e) {
            console.warn('[PerfilPublico] Comentar:', e);
            toast('No se pudo comentar: ' + msgError(e), 'error');
        } finally {
            inputEl.disabled = false; inputEl.focus();
        }
    }

    /* ================= TARJETA ================= */
    function crearPost(client, p) {
        var pubId = p.id;
        var art = document.createElement('article');
        art.className = 'pv-post';

        var av = document.createElement('div');
        av.className = 'pv-post-av';
        var avatarUrl = safeHttps(p.usuario_avatar_url);
        if (avatarUrl) {
            var im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.src = avatarUrl;
            av.appendChild(im);
        } else {
            av.textContent = (p.usuario_nombre || 'U').charAt(0).toUpperCase();
        }

        var meta = document.createElement('div');
        meta.className = 'pv-post-meta';

        var nombre = document.createElement('div');
        nombre.className = 'pv-post-nombre';
        nombre.textContent = p.usuario_nombre || p.usuario_handle || 'Usuario';

        var sub = document.createElement('div');
        sub.className = 'pv-post-sub';
        sub.textContent = (p.usuario_handle ? '@' + p.usuario_handle + ' · ' : '') + fechaPost(p.created_at);

        meta.appendChild(nombre); meta.appendChild(sub);

        if (p.contenido) {
            var texto = document.createElement('div');
            texto.className = 'pv-post-texto';
            texto.textContent = p.contenido;
            meta.appendChild(texto);
        }

        renderMedia(meta, p);

        if (p.aviso_moderacion === 'lenguaje_inapropiado') {
            var aviso = document.createElement('div');
            aviso.className = 'pv-post-aviso';
            aviso.textContent = 'Este mensaje contiene lenguaje inapropiado.';
            meta.appendChild(aviso);
        }

        var barra = document.createElement('div');
        barra.className = 'pv-post-barra';

        var reacciones = document.createElement('div');
        reacciones.className = 'pv-reacciones';
        reacciones.dataset.pubId = pubId;

        var btnCom = document.createElement('button');
        btnCom.type = 'button';
        btnCom.className = 'pv-btn-comentar';
        var iconoCom = document.createElement('span');
        iconoCom.textContent = '💬';
        var comCount = document.createElement('span');
        comCount.textContent = String(Number(p.comentarios) || 0);
        btnCom.appendChild(iconoCom); btnCom.appendChild(comCount);

        barra.appendChild(reacciones); barra.appendChild(btnCom);
        meta.appendChild(barra);

        var cajaCom = document.createElement('div');
        cajaCom.className = 'pv-comentarios';
        cajaCom.hidden = true;

        var listaCom = document.createElement('div');
        listaCom.className = 'pv-comentarios-lista';

        var formCom = document.createElement('form');
        formCom.className = 'pv-comentario-form';

        var inputCom = document.createElement('input');
        inputCom.type = 'text'; inputCom.className = 'pv-comentario-input';
        inputCom.maxLength = 500; inputCom.placeholder = 'Escribe un comentario...';
        inputCom.setAttribute('aria-label', 'Escribe un comentario');

        var btnEnviar = document.createElement('button');
        btnEnviar.type = 'submit';
        btnEnviar.className = 'btn btn-outline btn-sm';
        btnEnviar.textContent = 'Enviar';

        formCom.appendChild(inputCom); formCom.appendChild(btnEnviar);
        cajaCom.appendChild(listaCom); cajaCom.appendChild(formCom);
        meta.appendChild(cajaCom);

        btnCom.addEventListener('click', function () {
            var abrir = cajaCom.hidden;
            cajaCom.hidden = !abrir;
            if (abrir) cargarComentarios(client, pubId, listaCom, comCount);
        });

        formCom.addEventListener('submit', function (ev) {
            ev.preventDefault();
            enviarComentario(client, pubId, inputCom, listaCom, comCount);
        });

        reacciones.addEventListener('click', function (ev) {
            var btn = ev.target.closest('button[data-tipo]');
            if (!btn) return;
            alternarReaccion(client, pubId, btn.getAttribute('data-tipo'), reacciones);
        });

        art.appendChild(av); art.appendChild(meta);
        return art;
    }

    /* ================= API PÚBLICA ================= */
    window.PerfilPublicoPosts = {
        crearPost: crearPost,
        pintarBarraReacciones: pintarBarraReacciones,
        cerrarLightbox: cerrarLightbox,
        abrirLightbox: abrirLightbox,
        toast: toast,
        msgError: msgError,
        safeHttps: safeHttps
    };
})();
