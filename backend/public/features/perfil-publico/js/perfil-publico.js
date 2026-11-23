/* ================================================================
   PERFIL-PUBLICO.JS — Csariel's
   v4.3 · Visor compartido (visor-media-global.js), galería de fotos
   y videos, y publicación en el muro de un contacto activo.
   RPC y tablas verificadas en Supabase:
   perfil_publico_verificado, perfil_publico_por_handle,
   perfil_publico_por_id, perfil_visibilidad_estado,
   perfil_publicaciones_contactos, perfil_galeria,
   puede_publicar_en_muro, publicaciones, publicacion_reportes,
   publicaciones_reacciones, publicaciones_comentarios,
   publicaciones_comentarios_publicos, wallet_publica.
   ================================================================ */
(function () {
    'use strict';

    var RUTA_PERFIL_PROPIO = '/features/perfil/perfil.html';
    var HANDLE_RE = /^[A-Za-z0-9_]{1,40}$/;
    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var POSTS_PAGE = 20;
    var GALERIA_PAGE = 24;
    var COMENTARIOS_LIMITE = 50;
    var MURO_TEXTO_MAX = 2000;
    var MAX_IMAGEN = 5 * 1024 * 1024;
    var MAX_VIDEO = 100 * 1024 * 1024;
    var TIMEOUT_CLIENTE_MS = 5000;
    var TIMEOUT_SESION_MS = 4000;
    var TIMEOUT_PERFIL_MS = 12000;
    var TIMEOUT_CATALOGO_MS = 4000;

    var perfil = null;
    var direccionWallet = null;
    var pub = { cargando: false, antes: null, total: 0, idsVistos: new Set() };
    var galeria = { cargando: false, antes: null, items: [], idsVistos: new Set() };
    var mediaPublicaciones = [];
    var medioActivo = null;
    var muroArchivo = null;

    window.usuarioActualId = null;

    function $(id) { return document.getElementById(id); }

    var el = {
        cargando: $('pvCargando'),
        noEncontrado: $('pvNoEncontrado'),
        noEncontradoTitulo: $('pvNoEncontradoTitulo'),
        noEncontradoTexto: $('pvNoEncontradoTexto'),
        error: $('pvError'),
        errorTexto: $('pvErrorTexto'),
        reintentar: $('pvReintentar'),
        perfil: $('pvPerfil'),
        avatar: $('pvAvatar'),
        nombre: $('pvNombre'),
        verificado: $('pvVerificado'),
        handle: $('pvHandle'),
        estado: $('pvEstado'),
        estadoDot: $('pvEstadoDot'),
        estadoTexto: $('pvEstadoTexto'),
        wallet: $('pvWallet'),
        walletDir: $('pvWalletDir'),
        seguidores: $('pvSeguidores'),
        siguiendo: $('pvSiguiendo'),
        compartir: $('pvCompartir'),
        pasaporte: $('pvPasaporte'),
        amigosSection: $('pvAmigosSection'),
        galeriaSection: $('pvGaleriaSection'),
        galeriaCount: $('pvGaleriaCount'),
        galeriaGrid: $('pvGaleriaGrid'),
        galeriaMsg: $('pvGaleriaMsg'),
        galeriaMas: $('pvGaleriaMas'),
        muroSection: $('pvMuroSection'),
        muroTexto: $('pvMuroTexto'),
        muroAdjuntar: $('pvMuroAdjuntar'),
        muroArchivoInput: $('pvMuroArchivo'),
        muroNombre: $('pvMuroNombre'),
        muroPublicar: $('pvMuroPublicar'),
        muroMsg: $('pvMuroMsg'),
        pubSection: $('pvPubSection'),
        pubLista: $('pvPubLista'),
        pubMsg: $('pvPubMsg'),
        pubMas: $('pvPubMas'),
        pubContador: $('pvPubContador'),
        volver: $('pvVolver')
    };

    /* ================= UTILIDADES ================= */

    function toast(msg, tipo) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, tipo || 'success');
            return;
        }
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

    function conTimeout(promesa, ms, mensaje) {
        var id;
        var limite = new Promise(function (_, reject) {
            id = setTimeout(function () { reject(new Error(mensaje)); }, ms);
        });
        return Promise.race([Promise.resolve(promesa), limite]).finally(function () {
            clearTimeout(id);
        });
    }

    function safeHttps(u) {
        if (!u) return null;
        try {
            var x = new URL(String(u), window.location.href);
            return x.protocol === 'https:' ? x.href : null;
        } catch (e) { return null; }
    }

    function mostrar(panel) {
        [el.cargando, el.noEncontrado, el.error, el.perfil].forEach(function (n) {
            if (n) n.hidden = (n !== panel);
        });
    }

    function acortar(d) { return d.slice(0, 6) + '…' + d.slice(-4); }

    function fechaUTC(iso) {
        if (!iso) return null;
        return /(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : iso + 'Z';
    }

    function tiempoRelativo(iso) {
        var ms = Date.now() - new Date(iso).getTime();
        if (!isFinite(ms) || ms < 0) ms = 0;
        var min = Math.floor(ms / 60000);
        if (min < 1) return 'hace un momento';
        if (min < 60) return 'hace ' + min + ' min';
        var h = Math.floor(min / 60);
        if (h < 24) return 'hace ' + h + ' h';
        var d = Math.floor(h / 24);
        if (d < 30) return 'hace ' + d + ' d';
        return 'hace más de un mes';
    }

    function fechaPost(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function urlPerfil() {
        return window.location.origin + window.location.pathname + '?u=' + encodeURIComponent(perfil.handle);
    }

    function esSoyDueno(usuarioId) {
        return Boolean(window.usuarioActualId && usuarioId && String(usuarioId) === String(window.usuarioActualId));
    }

    function mediaTipo(tipo, url) {
        var t = String(tipo || '').toLowerCase();
        if (t) return t;
        if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
        if (/\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(url)) return 'audio';
        return 'imagen';
    }

    function registrarReproductorUnico(elMedia) {
        elMedia.addEventListener('play', function () {
            if (medioActivo && medioActivo !== elMedia) {
                try { medioActivo.pause(); } catch (e) {}
            }
            medioActivo = elMedia;
        });
    }

    /* ================= VISOR COMPARTIDO ================= */

    function abrirVisor(items, indice) {
        if (!window.VisorMediaGlobal) {
            toast('El visor no está disponible. Recarga la página.', 'error');
            return;
        }

        window.VisorMediaGlobal.abrir({
            items: items,
            indice: indice,
            onEliminar: function (item) { eliminarPropia(item.postId); },
            onOcultar: function (item) { quitarTarjeta(item.postId); }
        });
    }

    function quitarTarjeta(postId) {
        if (!postId) return;

        var card = el.pubLista.querySelector('.pv-post[data-pub-id="' + postId + '"]');
        if (card) card.remove();

        var mini = el.galeriaGrid.querySelector('[data-id="' + postId + '"]');
        if (mini) mini.remove();
    }

    async function eliminarPropia(postId) {
        if (!postId) return;

        var client = await obtenerCliente();
        if (!client) {
            toast('Sin conexión.', 'error');
            return;
        }

        var r = await client.from('publicaciones').delete().eq('id', postId);

        if (r.error) {
            toast('No se pudo eliminar: ' + msgError(r.error), 'error');
            return;
        }

        quitarTarjeta(postId);
        toast('Publicación eliminada', 'success');
    }

    /* ================= RENDER DEL PERFIL ================= */

    function pintarAvatar(url) {
        el.avatar.textContent = '';
        var seguro = safeHttps(url);
        if (!seguro) { el.avatar.textContent = '◈'; return; }

        var img = document.createElement('img');
        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.onerror = function () { el.avatar.textContent = '◈'; };
        img.src = seguro;
        el.avatar.appendChild(img);
    }

    function pintarEstado(p) {
        if (!p.ultima_conexion && p.online !== true) {
            el.estado.hidden = true;
            return;
        }
        el.estado.hidden = false;
        if (p.online === true) {
            el.estadoDot.className = 'pv-dot activo';
            el.estadoTexto.textContent = 'Activo ahora';
        } else {
            el.estadoDot.className = 'pv-dot inactivo';
            el.estadoTexto.textContent = 'Inactivo · ' + tiempoRelativo(fechaUTC(p.ultima_conexion));
        }
    }

    function pintarPasaporte(p) {
        el.pasaporte.innerHTML = '';

        var card = document.createElement('div');
        card.className = 'pv-pasaporte';

        var sello = document.createElement('div');
        sello.className = 'pv-pasaporte-sello';
        sello.textContent = '◈ Csariel\'s · Digital Identity';

        var titulo = document.createElement('div');
        titulo.className = 'pv-pasaporte-titulo';
        titulo.textContent = 'Pasaporte Digital';

        var sub = document.createElement('div');
        sub.className = 'pv-pasaporte-sub';
        sub.textContent = 'Identidad en Csariel\'s.';

        card.appendChild(sello);
        card.appendChild(titulo);
        card.appendChild(sub);

        if (p.verificado) {
            var verif = document.createElement('div');
            verif.className = 'pv-pasaporte-verif';
            verif.textContent = '✓ Miembro verificado';
            card.appendChild(verif);
        }

        el.pasaporte.appendChild(card);
    }

    function actualizarMeta(p) {
        var url = urlPerfil();
        var titulo = (p.nombre || p.handle) + ' (@' + p.handle + ") · Csariel's";
        var desc = 'Perfil público de ' + (p.nombre || p.handle) + " en Csariel's · WEB3";
        var img = safeHttps(p.avatar_url) || '';

        document.title = titulo;

        var set = function (id, attr, val) {
            var n = document.getElementById(id);
            if (n) n.setAttribute(attr, val);
        };
        set('ogTitle', 'content', titulo);
        set('ogDesc', 'content', desc);
        set('ogImage', 'content', img);
        set('canonicalLink', 'href', url);
    }

    function renderPerfil(p) {
        el.nombre.textContent = p.nombre || p.handle;
        el.handle.textContent = '@' + p.handle;
        el.verificado.hidden = !p.verificado;
        el.seguidores.textContent = String(p.seguidores_count || 0);
        el.siguiendo.textContent = String(p.siguiendo_count || 0);
        pintarAvatar(p.avatar_url);
        pintarEstado(p);
        pintarPasaporte(p);
        actualizarMeta(p);
    }

    async function cargarWallet(client, id) {
        var r = await client
            .from('wallet_publica')
            .select('wallet_address')
            .eq('id', id)
            .maybeSingle();

        if (r.error || !r.data || !r.data.wallet_address) return;

        direccionWallet = r.data.wallet_address;
        el.walletDir.textContent = acortar(direccionWallet);
        el.wallet.hidden = false;
    }

    function copiarWallet() {
        if (!direccionWallet || !navigator.clipboard) return;
        navigator.clipboard.writeText(direccionWallet)
            .then(function () { toast('Dirección copiada', 'success'); })
            .catch(function () { toast('No se pudo copiar', 'error'); });
    }

    async function compartirPerfil() {
        var url = urlPerfil();
        var texto = (perfil.nombre || perfil.handle) + " en Csariel's";

        if (navigator.share) {
            try {
                await navigator.share({ title: texto, text: texto, url: url });
                return;
            } catch (e) {
                if (e && e.name === 'AbortError') return;
            }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(function () { toast('Enlace copiado', 'success'); })
                .catch(function () { window.prompt('Copia este enlace:', url); });
        } else {
            window.prompt('Copia este enlace:', url);
        }
    }

    function cargarAmigos(client, id) {
        if (!el.amigosSection) return;
        el.amigosSection.hidden = false;
        if (window.PerfilPublicoAmigos && typeof window.PerfilPublicoAmigos.cargar === 'function') {
            window.PerfilPublicoAmigos.cargar(client, id);
        }
    }

    /* ================= MEDIOS EN LAS PUBLICACIONES ================= */

    function crearNodoMedia(tipo, url, sinDescarga) {
        var nodo;

        if (tipo === 'video') {
            nodo = document.createElement('video');
            nodo.className = 'pv-media';
            nodo.src = url;
            nodo.preload = 'metadata';
            nodo.playsInline = true;
            nodo.setAttribute('playsinline', '');
            nodo.setAttribute('webkit-playsinline', '');
            if (sinDescarga) nodo.setAttribute('controlsList', 'nodownload');
            registrarReproductorUnico(nodo);
        } else {
            nodo = document.createElement('img');
            nodo.className = 'pv-media';
            nodo.alt = '';
            nodo.loading = 'lazy';
            nodo.decoding = 'async';
            nodo.src = url;
        }

        return nodo;
    }

    function renderMedia(meta, p) {
        var url = safeHttps(p.media_url);
        if (!url) return;

        var tipo = mediaTipo(p.media_type, url);

        if (tipo === 'audio') {
            var aud = document.createElement('audio');
            aud.className = 'pv-post-audio';
            aud.src = url;
            aud.controls = true;
            aud.preload = 'none';
            if (p.permitir_descarga === false) aud.setAttribute('controlsList', 'nodownload');
            registrarReproductorUnico(aud);
            meta.appendChild(aud);
            return;
        }

        var item = {
            url: url,
            tipo: tipo,
            permiteDescarga: p.permitir_descarga !== false,
            postId: p.id,
            esDueno: esSoyDueno(p.usuario_id)
        };

        mediaPublicaciones.push(item);
        var indice = mediaPublicaciones.length - 1;

        var marco = document.createElement('div');
        marco.className = 'pv-media-marco';
        marco.appendChild(crearNodoMedia(tipo, url, p.permitir_descarga === false));

        marco.addEventListener('click', function () {
            abrirVisor(mediaPublicaciones, indice);
        });

        meta.appendChild(marco);
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

            item.appendChild(autor);
            item.appendChild(txt);
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

            if (countEl) countEl.textContent = filas.length > 0 ? String(filas.length) : '';
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
            var ins = await client.from('publicaciones_comentarios').insert({
                publicacion_id: pubId,
                usuario_id: window.usuarioActualId,
                contenido: texto
            });

            if (ins.error) throw ins.error;

            inputEl.value = '';
            await cargarComentarios(client, pubId, listaEl, countEl);
        } catch (e) {
            console.warn('[PerfilPublico] Comentar:', e);
            toast('No se pudo comentar: ' + msgError(e), 'error');
        } finally {
            inputEl.disabled = false;
            inputEl.focus();
        }
    }

    /* ================= TARJETA DE PUBLICACIÓN ================= */

    function crearPost(client, p) {
        var pubId = p.id;

        var art = document.createElement('article');
        art.className = 'pv-post';
        art.setAttribute('data-pub-id', pubId);

        var av = document.createElement('div');
        av.className = 'pv-post-av';

        var avatarUrl = safeHttps(p.usuario_avatar_url);
        if (avatarUrl) {
            var im = document.createElement('img');
            im.alt = '';
            im.loading = 'lazy';
            im.src = avatarUrl;
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

        meta.appendChild(nombre);
        meta.appendChild(sub);

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

        /* Contenedor de la barra de reacciones: lo llena el módulo global en cargarPublicaciones. */
        var reacciones = document.createElement('div');
        reacciones.className = 'pv-reacciones';
        reacciones.dataset.pubId = pubId;

        var btnCom = document.createElement('button');
        btnCom.type = 'button';
        btnCom.className = 'pv-btn-comentar';

        var totalCom = Number(p.comentarios) || 0;

        var iconoCom = document.createElement('span');
        iconoCom.textContent = 'Comentarios';

        var comCount = document.createElement('span');
        comCount.textContent = totalCom > 0 ? String(totalCom) : '';

        btnCom.appendChild(iconoCom);
        if (comCount.textContent) btnCom.appendChild(comCount);

        barra.appendChild(reacciones);
        barra.appendChild(btnCom);
        meta.appendChild(barra);

        var cajaCom = document.createElement('div');
        cajaCom.className = 'pv-comentarios';
        cajaCom.hidden = true;

        var listaCom = document.createElement('div');
        listaCom.className = 'pv-comentarios-lista';

        var formCom = document.createElement('form');
        formCom.className = 'pv-comentario-form';

        var inputCom = document.createElement('input');
        inputCom.type = 'text';
        inputCom.className = 'pv-comentario-input';
        inputCom.maxLength = 500;
        inputCom.placeholder = 'Escribe un comentario...';
        inputCom.setAttribute('aria-label', 'Escribe un comentario');

        var btnEnviar = document.createElement('button');
        btnEnviar.type = 'submit';
        btnEnviar.className = 'btn btn-outline btn-sm';
        btnEnviar.textContent = 'Enviar';

        formCom.appendChild(inputCom);
        formCom.appendChild(btnEnviar);

        cajaCom.appendChild(listaCom);
        cajaCom.appendChild(formCom);
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

        art.appendChild(av);
        art.appendChild(meta);

        return art;
    }

    function mostrarMensajePub(texto) {
        el.pubMsg.textContent = texto || '';
        el.pubMsg.hidden = !texto;
    }

    async function cargarPublicaciones(client, handle, reiniciar) {
        if (pub.cargando || !handle) return;
        pub.cargando = true;

        if (reiniciar) {
            pub.antes = null;
            pub.total = 0;
            pub.idsVistos.clear();
            mediaPublicaciones = [];
            el.pubLista.innerHTML = '';
        }

        el.pubMas.disabled = true;

        try {
            var r = await conTimeout(
                client.rpc('perfil_publicaciones_contactos', {
                    p_handle: handle,
                    p_antes: reiniciar ? null : pub.antes,
                    p_limite: POSTS_PAGE
                }),
                TIMEOUT_PERFIL_MS,
                'Las publicaciones tardaron demasiado en cargar.'
            );

            if (r.error) {
                el.pubSection.hidden = false;
                el.pubMas.hidden = true;
                mostrarMensajePub(r.error.code === '42501'
                    ? 'Inicia sesión para ver las publicaciones.'
                    : 'No se pudieron cargar las publicaciones.');
                return;
            }

            var d = r.data || {};

            if (d.estado === 'bloqueado' || d.estado === 'no_encontrado') {
                el.pubSection.hidden = true;
                return;
            }

            el.pubSection.hidden = false;

            if (d.estado === 'no_autenticado') {
                el.pubLista.innerHTML = '';
                el.pubMas.hidden = true;
                el.pubContador.textContent = '';
                mostrarMensajePub('Inicia sesión para ver las publicaciones.');
                return;
            }

            if (d.estado === 'no_contacto') {
                el.pubLista.innerHTML = '';
                el.pubMas.hidden = true;
                el.pubContador.textContent = '';
                mostrarMensajePub('Las publicaciones de esta persona solo son visibles para sus contactos.');
                return;
            }

            var posts = Array.isArray(d.posts) ? d.posts : [];

            var nuevos = posts.filter(function (p) {
                if (!p.id || pub.idsVistos.has(p.id)) return false;
                pub.idsVistos.add(p.id);
                return true;
            });

            var uid = window.usuarioActualId;
            var ids = nuevos.map(function (p) { return p.id; });
            var resumenes = new Map();

            if (ids.length && window.ReaccionesGlobal) {
                try {
                    resumenes = await window.ReaccionesGlobal.cargarResumenLote(client, ids, uid);
                } catch (e) {
                    console.warn('[PerfilPublico] Reacciones lote:', e);
                }
            }

            nuevos.forEach(function (p) {
                var card = crearPost(client, p);
                el.pubLista.appendChild(card);

                var contenedorRx = card.querySelector('.pv-reacciones');

                if (contenedorRx && window.ReaccionesGlobal) {
                    var resumen = resumenes.get(String(p.id)) || { totales: {}, total: 0, miTipo: null };

                    var barraRx = window.ReaccionesGlobal.crearBarra({
                        client: client,
                        publicacionId: p.id,
                        usuarioId: uid,
                        resumen: resumen
                    });

                    contenedorRx.appendChild(barraRx.el);
                }
            });

            pub.total += nuevos.length;

            if (posts.length) pub.antes = posts[posts.length - 1].created_at;

            el.pubContador.textContent = pub.total ? String(pub.total) : '';
            mostrarMensajePub(pub.total ? '' : 'Sin publicaciones');
            el.pubMas.hidden = posts.length < POSTS_PAGE;

        } catch (e) {
            console.warn('[PerfilPublico] Publicaciones:', e);
            el.pubSection.hidden = false;
            mostrarMensajePub('No se pudieron cargar las publicaciones: ' + msgError(e));
        } finally {
            pub.cargando = false;
            el.pubMas.disabled = false;
        }
    }

    /* ================= GALERÍA ================= */

    function mostrarMsgGaleria(texto) {
        el.galeriaMsg.textContent = texto || '';
        el.galeriaMsg.hidden = !texto;
    }

    function crearMiniatura(item, idx) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pv-galeria-item';
        b.setAttribute('data-id', item.postId);
        b.setAttribute('aria-label', item.tipo === 'video' ? 'Abrir video' : 'Abrir foto');

        if (item.tipo === 'video') {
            var v = document.createElement('video');
            v.src = item.url;
            v.muted = true;
            v.playsInline = true;
            v.preload = 'metadata';
            b.appendChild(v);

            var play = document.createElement('span');
            play.className = 'pv-galeria-play';
            play.textContent = '▶';
            b.appendChild(play);
        } else {
            var img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = item.url;
            b.appendChild(img);
        }

        b.addEventListener('click', function () {
            abrirVisor(galeria.items, idx);
        });

        return b;
    }

    async function cargarGaleria(client, reiniciar) {
        if (galeria.cargando || !perfil) return;
        galeria.cargando = true;

        if (reiniciar) {
            galeria.antes = null;
            galeria.items = [];
            galeria.idsVistos.clear();
            el.galeriaGrid.innerHTML = '';
        }

        el.galeriaMas.disabled = true;

        try {
            var r = await conTimeout(
                client.rpc('perfil_galeria', {
                    p_handle: perfil.handle,
                    p_antes: reiniciar ? null : galeria.antes,
                    p_limite: GALERIA_PAGE
                }),
                TIMEOUT_PERFIL_MS,
                'La galería tardó demasiado.'
            );

            if (r.error) throw r.error;

            var d = r.data || {};

            if (d.estado === 'bloqueado' || d.estado === 'no_encontrado') {
                el.galeriaSection.hidden = true;
                return;
            }

            el.galeriaSection.hidden = false;

            if (d.estado === 'no_contacto') {
                mostrarMsgGaleria('La galería de esta persona solo es visible para sus contactos.');
                el.galeriaMas.hidden = true;
                return;
            }

            if (d.estado === 'no_autenticado') {
                mostrarMsgGaleria('Inicia sesión para ver la galería.');
                el.galeriaMas.hidden = true;
                return;
            }

            var filas = Array.isArray(d.items) ? d.items : [];

            filas.forEach(function (f) {
                if (!f.id || galeria.idsVistos.has(f.id)) return;

                var url = safeHttps(f.media_url);
                if (!url) return;

                galeria.idsVistos.add(f.id);

                var item = {
                    url: url,
                    tipo: mediaTipo(f.media_type, url),
                    permiteDescarga: f.permitir_descarga !== false,
                    postId: f.id,
                    esDueno: esSoyDueno(perfil.id)
                };

                galeria.items.push(item);
                el.galeriaGrid.appendChild(crearMiniatura(item, galeria.items.length - 1));
            });

            if (filas.length) galeria.antes = filas[filas.length - 1].created_at;

            el.galeriaCount.textContent = galeria.items.length ? String(galeria.items.length) : '';
            mostrarMsgGaleria(galeria.items.length ? '' : 'Sin fotos ni videos todavía.');
            el.galeriaMas.hidden = filas.length < GALERIA_PAGE;

        } catch (e) {
            console.warn('[PerfilPublico] Galería:', e);
            mostrarMsgGaleria('No se pudo cargar la galería.');
        } finally {
            galeria.cargando = false;
            el.galeriaMas.disabled = false;
        }
    }

    /* ================= MURO DE CONTACTO ================= */

    async function verificarMuro(client) {
        if (!window.usuarioActualId || !perfil || String(perfil.id) === String(window.usuarioActualId)) {
            el.muroSection.hidden = true;
            return;
        }

        try {
            var r = await client.rpc('puede_publicar_en_muro', { p_destino: perfil.id });
            el.muroSection.hidden = !(r && r.data === true);
        } catch (e) {
            el.muroSection.hidden = true;
        }
    }

    function mostrarMsgMuro(texto) {
        el.muroMsg.textContent = texto || '';
        el.muroMsg.hidden = !texto;
    }

    function elegirArchivoMuro(ev) {
        var input = ev.target;
        var f = input.files && input.files[0];

        if (!f) return;

        var tipo = f.type.indexOf('image/') === 0
            ? 'imagen'
            : (f.type.indexOf('video/') === 0 ? 'video' : null);

        if (!tipo) {
            toast('Solo se permiten fotos o videos.', 'error');
            input.value = '';
            return;
        }

        if (tipo === 'imagen' && f.size > MAX_IMAGEN) {
            toast('La imagen supera 5 MB.', 'error');
            input.value = '';
            return;
        }

        if (tipo === 'video' && f.size > MAX_VIDEO) {
            toast('El video supera 100 MB.', 'error');
            input.value = '';
            return;
        }

        muroArchivo = { file: f, tipo: tipo };
        el.muroNombre.textContent = f.name;
    }

    function limpiarArchivoMuro() {
        muroArchivo = null;
        el.muroNombre.textContent = '';
        el.muroArchivoInput.value = '';
    }

    async function subirMedia(file, tipo, token) {
        var fd = new FormData();
        fd.append('file', file);
        fd.append('destino', 'muro-videos');
        fd.append('tipo', tipo);

        var resp = await fetch('/api/media/upload', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
        });

        var data = {};
        try { data = await resp.json(); } catch (e) {}

        if (!resp.ok || !data.ok) {
            throw new Error(data.error || 'No se pudo subir el archivo');
        }

        if (!safeHttps(data.url)) {
            throw new Error('El servidor no devolvió una URL válida.');
        }

        return data;
    }

    async function publicarEnMuro() {
        var texto = String(el.muroTexto.value || '').trim();

        if (!texto && !muroArchivo) {
            mostrarMsgMuro('Escribe algo o adjunta una foto o video.');
            return;
        }

        var client = await obtenerCliente();

        if (!client) {
            toast('No se pudo conectar. Recarga la página.', 'error');
            return;
        }

        var sesion = await client.auth.getSession();
        var session = sesion.data && sesion.data.session ? sesion.data.session : null;

        if (!session) {
            toast('Inicia sesión para publicar.', 'error');
            return;
        }

        var original = el.muroPublicar.textContent;
        el.muroPublicar.disabled = true;
        el.muroPublicar.textContent = 'Publicando...';
        mostrarMsgMuro('');

        try {
            var mediaUrl = null;
            var mediaType = null;

            if (muroArchivo) {
                var sub = await subirMedia(muroArchivo.file, muroArchivo.tipo, session.access_token);
                mediaUrl = sub.url;
                mediaType = muroArchivo.tipo;
            }

            var ins = await client.from('publicaciones').insert({
                usuario_id: session.user.id,
                perfil_destino_id: perfil.id,
                contenido: texto,
                media_url: mediaUrl,
                media_type: mediaType,
                estado: 'publicado',
                permitir_descarga: true
            });

            if (ins.error) throw ins.error;

            el.muroTexto.value = '';
            limpiarArchivoMuro();
            toast('Publicado en el muro.', 'success');

            await cargarPublicaciones(client, perfil.handle, true);

        } catch (e) {
            var msg = String((e && e.message) || '');
            toast(
                msg.indexOf('contenido_no_permitido') !== -1
                    ? 'Contenido no permitido'
                    : 'No se pudo publicar: ' + msgError(e),
                'error'
            );
        } finally {
            el.muroPublicar.disabled = false;
            el.muroPublicar.textContent = original;
        }
    }

    /* ================= VOLVER ================= */

    function mismoOrigenReferrer() {
        try {
            return !!document.referrer && new URL(document.referrer).origin === window.location.origin;
        } catch (e) { return false; }
    }

    function configurarVolver() {
        if (el.volver) {
            el.volver.addEventListener('click', function (e) {
                if (window.history.length > 1 && mismoOrigenReferrer()) {
                    e.preventDefault();
                    window.history.back();
                }
            });
            if (!mismoOrigenReferrer()) {
                el.volver.setAttribute('href', '/');
                el.volver.textContent = '← Ir al inicio';
            }
        }

        var volverNoEnc = document.getElementById('pvVolverNoEncontrado');
        if (volverNoEnc && !mismoOrigenReferrer()) {
            volverNoEnc.setAttribute('href', '/');
            volverNoEnc.textContent = '← Ir al inicio';
        }
    }

    /* ================= IDENTIDAD ================= */

    function leerIdentificador() {
        var sp = new URLSearchParams(window.location.search);
        var tieneU = sp.has('u');
        var tieneId = sp.has('id');
        var u = (sp.get('u') || '').trim().replace(/^@+/, '');
        var id = (sp.get('id') || '').trim();
        var uOk = HANDLE_RE.test(u);
        var idOk = UUID_RE.test(id);

        if (tieneU && tieneId) {
            return (uOk && idOk) ? { tipo: 'verificado', handle: u, id: id } : { tipo: 'invalido' };
        }
        if (tieneU && uOk) return { tipo: 'handle', valor: u };
        if (tieneId && idOk) return { tipo: 'id', valor: id };
        if (tieneU || tieneId) return { tipo: 'invalido' };
        return null;
    }

    async function cargarPerfil(client, ident) {
        var llamada;

        if (ident.tipo === 'verificado') {
            llamada = client.rpc('perfil_publico_verificado', { p_handle: ident.handle, p_id: ident.id });
        } else if (ident.tipo === 'handle') {
            llamada = client.rpc('perfil_publico_por_handle', { p_handle: ident.valor });
        } else {
            llamada = client.rpc('perfil_publico_por_id', { p_id: ident.valor });
        }

        var r = await conTimeout(llamada, TIMEOUT_PERFIL_MS, 'El servidor tardó demasiado en responder el perfil.');
        if (r.error) throw r.error;

        var fila = Array.isArray(r.data) ? r.data[0] : r.data;
        return fila || null;
    }

    async function resolverSinPerfil(client, ident) {
        var id = ident.tipo === 'verificado' ? ident.id : (ident.tipo === 'id' ? ident.valor : null);
        if (!id) return 'no_encontrado';

        var params = { p_id: id };
        if (ident.tipo === 'verificado') params.p_handle = ident.handle;

        try {
            var r = await conTimeout(client.rpc('perfil_visibilidad_estado', params), TIMEOUT_PERFIL_MS, 'Sin respuesta');
            if (!r.error && r.data) return r.data;
        } catch (e) {}

        return 'no_encontrado';
    }

    function mensajeNoEncontrado(titulo, texto) {
        el.noEncontradoTitulo.removeAttribute('data-clave');
        el.noEncontradoTexto.removeAttribute('data-clave');
        el.noEncontradoTitulo.textContent = titulo;
        el.noEncontradoTexto.textContent = texto;
        mostrar(el.noEncontrado);
    }

    function mostrarErrorIdentidad() {
        el.errorTexto.removeAttribute('data-clave');
        el.errorTexto.textContent = 'No pudimos verificar la identidad de este perfil. Por seguridad no se muestran sus datos.';
        mostrar(el.error);
    }

    function mostrarErrorGeneral(detalle) {
        el.errorTexto.removeAttribute('data-clave');
        el.errorTexto.textContent = 'No pudimos cargar este perfil. ' + (detalle || 'Intenta de nuevo.');
        mostrar(el.error);
    }

    /* ================= CLIENTE Y SESIÓN ================= */

    async function obtenerCliente() {
        if (window.supabaseClient) return window.supabaseClient;
        if (window.__sarielsSupabaseSingleton) return window.__sarielsSupabaseSingleton;

        if (window.supabaseReady && typeof window.supabaseReady.then === 'function') {
            try {
                var c = await conTimeout(window.supabaseReady, TIMEOUT_CLIENTE_MS, 'El cliente de Supabase no respondió.');
                if (c) return c;
            } catch (e) {
                console.warn('[PerfilPublico] supabaseReady:', e);
            }
        }

        var intentos = 0;
        while (intentos < 20) {
            if (window.supabaseClient) return window.supabaseClient;
            await new Promise(function (r) { setTimeout(r, 100); });
            intentos++;
        }

        return window.supabaseClient || null;
    }

    async function resolverSesion(client) {
        try {
            var r = await conTimeout(client.auth.getSession(), TIMEOUT_SESION_MS, 'La sesión tardó demasiado.');
            var user = r && r.data && r.data.session ? r.data.session.user : null;
            window.usuarioActualId = user ? user.id : null;
        } catch (e) {
            console.warn('[PerfilPublico] Sesión:', e);
            window.usuarioActualId = null;
        }
        return window.usuarioActualId;
    }

    /* ================= INIT ================= */

    async function init() {
        console.info('[PerfilPublico] iniciando v4.3');

        mostrar(el.cargando);
        configurarVolver();

        var ident = leerIdentificador();

        if (!ident) { mostrar(el.noEncontrado); return; }
        if (ident.tipo === 'invalido') { mostrarErrorIdentidad(); return; }

        var client = await obtenerCliente();

        if (!client) {
            mostrarErrorGeneral('No se pudo conectar con la base de datos. Recarga la página.');
            return;
        }

        await resolverSesion(client);

        if (window.ReaccionesGlobal) {
            await conTimeout(
                window.ReaccionesGlobal.preparar(client),
                TIMEOUT_CATALOGO_MS,
                'Catálogo de reacciones lento.'
            ).catch(function (e) {
                console.warn('[PerfilPublico] Catálogo:', e);
            });
        }

        try {
            client.auth.onAuthStateChange(function (_e, sesion) {
                window.usuarioActualId = (sesion && sesion.user) ? sesion.user.id : null;
            });
        } catch (e) {}

        var p = await cargarPerfil(client, ident);

        if (!p) {
            var vis = await resolverSinPerfil(client, ident);

            if (vis === 'restringido') {
                mensajeNoEncontrado('Perfil restringido', 'Este perfil está restringido. Solo sus contactos pueden verlo.');
            } else if (vis === 'bloqueado' || vis === 'no_disponible') {
                mensajeNoEncontrado('Perfil no disponible', 'Este perfil no está disponible en este momento.');
            } else if (ident.tipo === 'verificado') {
                mostrarErrorIdentidad();
            } else {
                mostrar(el.noEncontrado);
            }
            return;
        }

        if (!p.handle && !p.nombre) { mostrar(el.noEncontrado); return; }

        if (ident.tipo === 'verificado' &&
            String(p.handle || '').toLowerCase() !== ident.handle.toLowerCase()) {
            mostrarErrorIdentidad();
            return;
        }

        if (window.usuarioActualId && p.id === window.usuarioActualId) {
            window.location.replace(RUTA_PERFIL_PROPIO);
            return;
        }

        perfil = p;
        renderPerfil(p);
        mostrar(el.perfil);

        cargarWallet(client, p.id).catch(function (e) {
            console.warn('[PerfilPublico] Wallet:', e);
        });

        cargarAmigos(client, p.id);
        cargarPublicaciones(client, p.handle, true);
        cargarGaleria(client, true);
        verificarMuro(client);
    }

    /* ================= LISTENERS ================= */

    el.wallet.addEventListener('click', copiarWallet);
    el.compartir.addEventListener('click', compartirPerfil);
    el.reintentar.addEventListener('click', function () { window.location.reload(); });

    el.pubMas.addEventListener('click', async function () {
        var client = await obtenerCliente();
        if (client && perfil && perfil.handle) cargarPublicaciones(client, perfil.handle, false);
    });

    el.galeriaMas.addEventListener('click', async function () {
        var client = await obtenerCliente();
        if (client && perfil) cargarGaleria(client, false);
    });

    el.muroAdjuntar.addEventListener('click', function () {
        el.muroArchivoInput.click();
    });

    el.muroArchivoInput.addEventListener('change', elegirArchivoMuro);

    el.muroPublicar.addEventListener('click', publicarEnMuro);

    /* ================= ARRANQUE ================= */

    function arrancar() {
        init().catch(function (err) {
            console.error('[PerfilPublico]', err);
            mostrarErrorGeneral(msgError(err));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', arrancar);
    } else {
        arrancar();
    }

})();