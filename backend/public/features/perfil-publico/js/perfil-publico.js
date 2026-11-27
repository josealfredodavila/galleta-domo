/* ================================================================
   PERFIL-PUBLICO.JS — Csariel's
   v5.3 · Conteo de comentarios en cada ítem del visor.
   CAMBIOS v5.3:
   · Cada ítem que se pasa al visor (publicaciones, galería y feed)
     lleva comentarios: número. El visor usa ese conteo y no hace una
     consulta extra por cambio de video.
   · Al abrir el visor desde el lote del feed, los comentarios vienen
     de f.comentarios (si el servidor lo envía) o de la respuesta de
     respaldo.
   CAMBIOS v5.2 (se conservan):
   · Publicaciones con foto o video: la tarjeta muestra solo un resumen
     de lectura (emoji dominante con total y número de comentarios). La
     reacción y el comentario se hacen únicamente dentro del visor.
   · Publicaciones sin media (solo texto o audio): conservan la barra de
     reacciones y los comentarios en la tarjeta.
   · Comentarios con avatar (o inicial) y nombre, leídos de
     publicaciones_comentarios_publicos.usuario_avatar_url.
   · Índice inicial del visor por postId; orden: perfil, galería, feed.
   · Catálogo de reacciones esperado antes de pintar las publicaciones.
   · Sin sessionStorage.
   RPC y tablas verificadas en Supabase:
   perfil_publico_verificado, perfil_publico_por_handle,
   perfil_publico_por_id, perfil_visibilidad_estado,
   perfil_publicaciones_contactos, perfil_galeria,
   puede_publicar_en_muro, publicaciones, publicacion_reportes,
   publicaciones_reacciones, publicaciones_comentarios,
   publicaciones_comentarios_publicos (incluye usuario_avatar_url),
   wallet_publica, publicaciones_ocultas, usuarios_preferencias,
   usuarios_idiomas_contenido, idiomas_sistema, perfiles_publicos.
   ================================================================ */
(function () {
    'use strict';

    var RUTA_PERFIL_PROPIO = '/features/perfil/perfil.html';
    var HANDLE_RE = /^[A-Za-z0-9_]{1,40}$/;
    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var EXT_IMAGEN_RE = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?|#|$)/i;
    var EXT_VIDEO_RE = /\.(mp4|webm|mov|m4v|3gp)(\?|#|$)/i;
    var POSTS_PAGE = 20;
    var GALERIA_PAGE = 24;
    var COMENTARIOS_LIMITE = 50;
    var MAX_IMAGEN = 5 * 1024 * 1024;
    var MAX_VIDEO = 100 * 1024 * 1024;
    var TIMEOUT_CLIENTE_MS = 5000;
    var TIMEOUT_SESION_MS = 4000;
    var TIMEOUT_PERFIL_MS = 12000;
    var TIMEOUT_CATALOGO_MS = 4000;
    var TIMEOUT_REACCIONES_MS = 15000;
    var TIMEOUT_FEED_MS = 8000;
    var FEED_LIMITE = 20;
    var RESPALDO_LIMITE = 14;

    var BIO_POR_DEFECTO = "Explorando el ecosistema Csariel's · WEB3 · Comunidad";

    var perfil = null;
    var direccionWallet = null;
    var pub = { cargando: false, antes: null, total: 0, idsVistos: new Set() };
    var galeria = { cargando: false, antes: null, items: [], idsVistos: new Set() };
    var mediaPublicaciones = [];
    var medioActivo = null;
    var muroArchivo = null;
    var scrollAntesVisor = 0;

    /* Estado de sesión de esta página (solo memoria, sin sessionStorage). */
    var videoSesion = {
        idsVistos: new Set(),
        idiomaCodigoPorId: new Map(),
        autoReproducir: true,
        ahorradorDatos: false,
        videosAltaCalidad: true,
        prefsCargadas: false
    };

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
        bio: $('pvBio'),
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

    function esVideoItem(item) {
        if (!item || item.tipo !== 'video') return false;
        var url = safeHttps(item.url);
        if (!url) return false;
        if (EXT_IMAGEN_RE.test(url)) return false;
        return true;
    }

    function esImagenItem(item) {
        if (!item || item.tipo !== 'imagen') return false;
        var url = safeHttps(item.url);
        if (!url) return false;
        if (EXT_VIDEO_RE.test(url)) return false;
        return true;
    }

    /* Clave estable de un medio: su publicación, o su URL si no tiene. */
    function claveItem(it) {
        if (!it) return '';
        return it.postId ? String(it.postId) : String(it.url || '');
    }

    /* Posición de un medio dentro de una lista, comparando por clave. */
    function indiceDeItem(lista, it) {
        var clave = claveItem(it);
        for (var i = 0; i < lista.length; i++) {
            if (claveItem(lista[i]) === clave) return i;
        }
        return -1;
    }

    /* Número seguro de comentarios: entero no negativo, o null si no se conoce. */
    function numeroComentarios(v) {
        var n = Number(v);
        if (v === null || v === undefined || v === '' || !isFinite(n)) return null;
        return n < 0 ? 0 : Math.floor(n);
    }

    function inicialDe(nombre) {
        var t = String(nombre || '').trim();
        return t ? t.charAt(0).toUpperCase() : '•';
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
        var u = String(url || '');
        if (EXT_IMAGEN_RE.test(u)) return 'imagen';
        if (EXT_VIDEO_RE.test(u)) return 'video';
        var t = String(tipo || '').toLowerCase();
        if (t === 'image' || t === 'photo' || t === 'foto') return 'imagen';
        if (t) return t;
        if (/\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(u)) return 'audio';
        return 'imagen';
    }

    /* Código de idioma (ej. "es") a partir de idioma_id. */
    function idiomaDe(p) {
        if (p && p.idioma_id && videoSesion.idiomaCodigoPorId.has(String(p.idioma_id))) {
            return videoSesion.idiomaCodigoPorId.get(String(p.idioma_id));
        }
        return null;
    }

    function registrarReproductorUnico(elMedia) {
        elMedia.addEventListener('play', function () {
            if (medioActivo && medioActivo !== elMedia) {
                try { medioActivo.pause(); } catch (e) {}
            }
            medioActivo = elMedia;
        });
    }

    /* ¿La publicación tiene foto o video? Entonces su interacción vive en el visor. */
    function tieneVisor(p) {
        var url = safeHttps(p.media_url);
        if (!url) return false;
        var tipo = mediaTipo(p.media_type, url);
        return tipo === 'video' || tipo === 'imagen';
    }

    /* ================= ESTILOS (inyectados una vez) ================= */

    function asegurarEstilosComentarios() {
        if (document.getElementById('pv-comentarios-estilos')) return;

        var est = document.createElement('style');
        est.id = 'pv-comentarios-estilos';
        est.textContent =
            '.pv-comentario-fila{display:flex;gap:9px;align-items:flex-start;}' +
            '.pv-comentario-av{width:30px;height:30px;flex:0 0 30px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f2d1a,#d4af37);color:#fff;font-weight:700;font-size:12px;border:1.5px solid rgba(0,229,255,.4);}' +
            '.pv-comentario-av img{width:100%;height:100%;object-fit:cover;}' +
            '.pv-comentario-cuerpo{min-width:0;flex:1;font-size:.85rem;line-height:1.45;color:#d5e4ef;}' +
            '.pv-comentario-cuerpo .pv-comentario-autor{display:block;margin-right:0;line-height:1.3;}' +
            '.pv-comentario-texto{word-break:break-word;white-space:pre-wrap;}' +
            '.pv-resumen{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}' +
            '.pv-resumen-item{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:6px 12px;border-radius:20px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#b7d0e2;font-size:.82rem;}' +
            '.pv-resumen-rx{color:#ffffff;}' +
            '.pv-post-pista{margin-top:8px;font-size:.72rem;color:#6f8ba0;}';
        document.head.appendChild(est);
    }

    /* ================= VISOR COMPARTIDO ================= */

    function restaurarScrollPerfil() {
        var y = scrollAntesVisor;
        requestAnimationFrame(function () {
            try { window.scrollTo(0, y); } catch (e) {}
        });
    }

    function abrirVisor(items, indice, opciones) {
        if (!window.VisorMediaGlobal) {
            toast('El visor no está disponible. Recarga la página.', 'error');
            return;
        }

        opciones = opciones || {};
        scrollAntesVisor = window.scrollY || window.pageYOffset || 0;

        window.VisorMediaGlobal.abrir({
            items: items,
            indice: indice,
            carruselVertical: opciones.carruselVertical === true,
            requestId: opciones.requestId || null,
            rankingVersion: opciones.rankingVersion || null,
            entrada: opciones.entrada || 'perfil_publico',
            onEliminar: function (item) { eliminarPropia(item.postId); },
            onOcultar: function (item) { quitarTarjeta(item.postId); },
            autoReproducir: opciones.autoReproducir !== false && videoSesion.autoReproducir !== false,
            ahorradorDatos: opciones.ahorradorDatos === true || videoSesion.ahorradorDatos === true,
            videosAltaCalidad: opciones.videosAltaCalidad !== false && videoSesion.videosAltaCalidad !== false
        });

        setTimeout(restaurarScrollPerfil, 80);
    }

    function quitarTarjeta(postId) {
        if (!postId) return;

        var card = el.pubLista.querySelector('.pv-post[data-pub-id="' + postId + '"]');
        if (card) card.remove();

        var mini = el.galeriaGrid.querySelector('[data-id="' + postId + '"]');
        if (mini) mini.remove();

        videoSesion.idsVistos.add(String(postId));
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

    /* ================= ITEMS PARA EL VISOR ================= */

    /* Ítem del visor. El conteo de comentarios (comentarios) viaja aquí
       para que el visor no haga una consulta extra por cada video. */
    function itemVisorDesdeMedia(item, autorInfo) {
        var out = {
            url: item.url,
            tipo: item.tipo,
            permiteDescarga: item.permiteDescarga !== false,
            postId: item.postId,
            esDueno: item.esDueno === true
        };

        var com = numeroComentarios(item.comentarios);
        if (com !== null) out.comentarios = com;

        if (autorInfo) {
            if (autorInfo.autorNombre) out.autorNombre = autorInfo.autorNombre;
            if (autorInfo.autorHandle) out.autorHandle = autorInfo.autorHandle;
            var av = safeHttps(autorInfo.autorAvatar);
            if (av) out.autorAvatar = av;
            if (autorInfo.texto) out.texto = String(autorInfo.texto);
        }
        return out;
    }

    function autorDePost(p) {
        if (!p) return null;
        return {
            autorNombre: p.usuario_nombre || p.usuario_handle || null,
            autorHandle: p.usuario_handle ? String(p.usuario_handle) : null,
            autorAvatar: safeHttps(p.usuario_avatar_url) || null,
            texto: p.contenido ? String(p.contenido) : null
        };
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

    function textoBio(p) {
        var propia = p && typeof p.bio === 'string' ? p.bio.trim() : '';
        if (propia) return propia;

        if (typeof window.tConFallback === 'function') {
            return window.tConFallback('perfil_biografia_default', BIO_POR_DEFECTO);
        }
        return BIO_POR_DEFECTO;
    }

    function pintarBio(p) {
        if (!el.bio) return;
        el.bio.textContent = textoBio(p);
        el.bio.hidden = false;
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
        pintarBio(p);
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

    /* ================= PREFERENCIAS E IDIOMAS ================= */

    async function cargarCatalogoIdiomas(client) {
        if (!client || videoSesion.idiomaCodigoPorId.size) return;
        try {
            var r = await conTimeout(
                client.from('idiomas_sistema').select('id, codigo').eq('activo', true),
                TIMEOUT_CATALOGO_MS,
                'idiomas_sistema timeout'
            );
            if (!r.error && Array.isArray(r.data)) {
                r.data.forEach(function (x) {
                    if (x && x.id && x.codigo) {
                        videoSesion.idiomaCodigoPorId.set(String(x.id), String(x.codigo).toLowerCase());
                    }
                });
            }
        } catch (e) { /* no fatal */ }
    }

    /* Solo preferencias de reproducción. Lo sensible y los intereses los aplica el servidor. */
    async function cargarPreferenciasVideo(client) {
        videoSesion.prefsCargadas = true;

        await cargarCatalogoIdiomas(client);

        if (!window.usuarioActualId || !client) return;

        try {
            var rp = await conTimeout(
                client.from('usuarios_preferencias').select('*').eq('usuario_id', window.usuarioActualId).maybeSingle(),
                TIMEOUT_CATALOGO_MS,
                'preferencias timeout'
            );
            if (!rp.error && rp.data) {
                var d = rp.data;
                if (typeof d.contenido_ahorrador_datos === 'boolean') videoSesion.ahorradorDatos = d.contenido_ahorrador_datos;
                if (typeof d.contenido_videos_alta_calidad === 'boolean') videoSesion.videosAltaCalidad = d.contenido_videos_alta_calidad;
                if (typeof d.contenido_auto_reproducir === 'boolean') videoSesion.autoReproducir = d.contenido_auto_reproducir;
            }
        } catch (e) {
            console.warn('[PerfilPublico] Preferencias:', e);
        }
    }

    /* ================= MEDIOS EN LAS PUBLICACIONES ================= */

    function crearNodoMedia(tipo, url, sinDescarga) {
        var nodo;

        if (tipo === 'video') {
            nodo = document.createElement('video');
            nodo.className = 'pv-media';
            nodo.src = url;
            nodo.preload = videoSesion.ahorradorDatos ? 'none' : 'metadata';
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

        var autor = autorDePost(p);
        var item = itemVisorDesdeMedia({
            url: url,
            tipo: tipo,
            permiteDescarga: p.permitir_descarga !== false,
            postId: p.id,
            esDueno: esSoyDueno(p.usuario_id),
            comentarios: p.comentarios
        }, autor);
        item.temaId = p.tema_id ? String(p.tema_id) : null;
        item.idioma = idiomaDe(p);
        item.sensible = p.es_sensible === true;
        item.autorUsuarioId = p.usuario_id ? String(p.usuario_id) : null;

        mediaPublicaciones.push(item);

        var marco = document.createElement('div');
        marco.className = 'pv-media-marco';
        marco.appendChild(crearNodoMedia(tipo, url, p.permitir_descarga === false));

        marco.addEventListener('click', function () {
            if (tipo === 'video') {
                abrirVisorConRelleno(item);
            } else {
                abrirVisorFotosDesde(item);
            }
        });

        meta.appendChild(marco);
    }

    /* ================= COMENTARIOS (avatar y nombre del autor) ================= */

    /* Fila de comentario: avatar (o inicial) y nombre, con el texto debajo. */
    function filaComentarioPerfil(c) {
        var nombre = c.usuario_nombre || c.usuario_handle || 'Miembro';

        var fila = document.createElement('div');
        fila.className = 'pv-comentario-item pv-comentario-fila';

        var av = document.createElement('div');
        av.className = 'pv-comentario-av';

        var url = safeHttps(c.usuario_avatar_url);
        if (url) {
            var img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            img.src = url;
            img.onerror = function () {
                av.textContent = inicialDe(nombre);
                img.remove();
            };
            av.appendChild(img);
        } else {
            av.textContent = inicialDe(nombre);
        }

        var cuerpo = document.createElement('div');
        cuerpo.className = 'pv-comentario-cuerpo';

        var autor = document.createElement('span');
        autor.className = 'pv-comentario-autor';
        autor.textContent = nombre;

        var txt = document.createElement('span');
        txt.className = 'pv-comentario-texto';
        txt.textContent = c.contenido || '';

        cuerpo.appendChild(autor);
        cuerpo.appendChild(txt);

        fila.appendChild(av);
        fila.appendChild(cuerpo);

        return fila;
    }

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
            listaEl.appendChild(filaComentarioPerfil(c));
        });
    }

    async function cargarComentarios(client, pubId, listaEl, countEl) {
        listaEl.innerHTML = '<div class="pv-comentario-item">Cargando comentarios...</div>';

        try {
            var r = await client
                .from('publicaciones_comentarios_publicos')
                .select('id, usuario_id, contenido, created_at, usuario_nombre, usuario_handle, usuario_avatar_url')
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

    /* ================= RESUMEN DE SOLO LECTURA (publicaciones con visor) ================= */

    /* Emoji con más reacciones según el resumen de ReaccionesGlobal. */
    function emojiDominante(resumen) {
        var totales = (resumen && resumen.totales) || {};
        var mejor = null;
        var max = 0;
        Object.keys(totales).forEach(function (k) {
            if (totales[k] > max) {
                max = totales[k];
                mejor = k;
            }
        });
        return mejor;
    }

    function crearResumen(resumen, comentarios) {
        var box = document.createElement('div');
        box.className = 'pv-resumen';

        var total = resumen && resumen.total ? resumen.total : 0;

        if (total > 0) {
            var rx = document.createElement('span');
            rx.className = 'pv-resumen-item pv-resumen-rx';
            rx.textContent = (emojiDominante(resumen) || '❤️') + ' ' + total;
            box.appendChild(rx);
        }

        var com = document.createElement('span');
        com.className = 'pv-resumen-item';
        com.textContent = 'Comentarios ' + (numeroComentarios(comentarios) || 0);
        box.appendChild(com);

        return box;
    }

    /* ================= TARJETA DE PUBLICACIÓN ================= */

    function crearPost(client, p, resumen) {
        var pubId = p.id;
        var conVisor = tieneVisor(p);

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

        if (conVisor) {
            /* Interacción única: vive dentro del visor. Aquí solo se lee el resumen. */
            barra.appendChild(crearResumen(resumen, p.comentarios));
            meta.appendChild(barra);

            var pista = document.createElement('div');
            pista.className = 'pv-post-pista';
            pista.textContent = mediaTipo(p.media_type, p.media_url) === 'video'
                ? 'Toca el video para reaccionar y comentar'
                : 'Toca la foto para reaccionar y comentar';
            meta.appendChild(pista);
        } else {
            /* Sin foto ni video: la interacción sí vive en la tarjeta. */
            var reacciones = document.createElement('div');
            reacciones.className = 'pv-reacciones';
            reacciones.dataset.pubId = pubId;

            var btnCom = document.createElement('button');
            btnCom.type = 'button';
            btnCom.className = 'pv-btn-comentar';

            var totalCom = numeroComentarios(p.comentarios) || 0;

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
        }

        art.appendChild(av);
        art.appendChild(meta);

        return art;
    }

    /* ================= REACCIONES (ReaccionesGlobal) ================= */

    /* Monta la barra de emojis en el contenedor de la publicación (solo
       publicaciones sin visor). Si el módulo falla, la publicación sigue
       visible y muestra un aviso discreto. */
    function montarReacciones(contenedor, client, pubId, uid, resumen) {
        if (!contenedor) return;

        if (!window.ReaccionesGlobal || typeof window.ReaccionesGlobal.crearBarra !== 'function') {
            aviso(contenedor, 'Reacciones no disponibles');
            return;
        }

        try {
            var barraRx = window.ReaccionesGlobal.crearBarra({
                client: client,
                publicacionId: pubId,
                usuarioId: uid,
                resumen: resumen || { totales: {}, total: 0, miTipo: null }
            });

            if (barraRx && barraRx.el) {
                contenedor.appendChild(barraRx.el);
            } else {
                aviso(contenedor, 'Reacciones no disponibles');
            }
        } catch (e) {
            console.warn('[PerfilPublico] Reacciones (publicación ' + pubId + '):', e);
            aviso(contenedor, 'Reacciones no disponibles');
        }
    }

    function aviso(contenedor, texto) {
        var s = document.createElement('span');
        s.className = 'pv-reacciones-aviso';
        s.style.cssText = 'font-size:0.72rem;color:#6f8ba0;';
        s.textContent = texto;
        contenedor.appendChild(s);
    }

    /* Espera a que el catálogo de emojis esté cargado antes de pintar
       las publicaciones. Sin límite corto: el catálogo es necesario. */
    async function prepararReacciones(client) {
        if (!window.ReaccionesGlobal || typeof window.ReaccionesGlobal.preparar !== 'function') {
            return false;
        }
        try {
            await conTimeout(
                window.ReaccionesGlobal.preparar(client),
                TIMEOUT_REACCIONES_MS,
                'Catálogo de reacciones lento.'
            );
            return true;
        } catch (e) {
            console.warn('[PerfilPublico] Catálogo de reacciones:', e);
            return false;
        }
    }

    /* ================= PUBLICACIONES DEL PERFIL ================= */

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

            if (ids.length && window.ReaccionesGlobal && typeof window.ReaccionesGlobal.cargarResumenLote === 'function') {
                try {
                    resumenes = await window.ReaccionesGlobal.cargarResumenLote(client, ids, uid);
                } catch (e) {
                    console.warn('[PerfilPublico] Resumen de reacciones:', e);
                }
            }

            nuevos.forEach(function (p) {
                var resumen = resumenes && resumenes.get ? resumenes.get(String(p.id)) : null;
                var card = crearPost(client, p, resumen);
                el.pubLista.appendChild(card);

                if (!tieneVisor(p)) {
                    var contenedorRx = card.querySelector('.pv-reacciones');
                    montarReacciones(contenedorRx, client, p.id, uid, resumen);
                }

                if (p.id) videoSesion.idsVistos.add(String(p.id));
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

    function crearMiniatura(item) {
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
            if (item.tipo === 'video') {
                abrirVisorConRelleno(item);
            } else {
                abrirVisorFotosDesde(item);
            }
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

                var item = itemVisorDesdeMedia({
                    url: url,
                    tipo: mediaTipo(f.media_type, url),
                    permiteDescarga: f.permitir_descarga !== false,
                    postId: f.id,
                    esDueno: esSoyDueno(perfil.id),
                    comentarios: f.comentarios
                }, {
                    autorNombre: perfil.nombre || perfil.handle || null,
                    autorHandle: perfil.handle || null,
                    autorAvatar: safeHttps(perfil.avatar_url) || null,
                    texto: f.contenido ? String(f.contenido) : null
                });
                item.temaId = f.tema_id ? String(f.tema_id) : null;
                item.idioma = idiomaDe(f);
                item.sensible = f.es_sensible === true;
                item.autorUsuarioId = perfil.id ? String(perfil.id) : null;

                galeria.items.push(item);
                el.galeriaGrid.appendChild(crearMiniatura(item));

                videoSesion.idsVistos.add(String(f.id));
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

    /* ================= RELLENO DE VIDEOS (feed de recomendación) ================= */

    /* Pide el lote al servidor. Devuelve { requestId, rankingVersion, items }. */
    async function obtenerFeedVideos(client) {
        var sesion = await conTimeout(client.auth.getSession(), TIMEOUT_SESION_MS, 'sesión timeout');
        var token = sesion.data && sesion.data.session ? sesion.data.session.access_token : null;
        if (!token) throw new Error('sin sesión');

        var r = await conTimeout(
            fetch('/api/recomendacion/feed?limite=' + FEED_LIMITE, {
                headers: { 'Authorization': 'Bearer ' + token }
            }),
            TIMEOUT_FEED_MS,
            'feed timeout'
        );

        if (!r.ok) throw new Error('HTTP ' + r.status);

        var d = await r.json().catch(function () { return {}; });

        return {
            requestId: d.request_id || null,
            rankingVersion: d.ranking_version || null,
            items: Array.isArray(d.items) ? d.items : []
        };
    }

    /* Respaldo si el feed no responde: publicaciones de video recientes,
       sin ordenar por intereses, excluyendo lo ya visto y lo oculto. */
    async function obtenerRespaldoVideos(client, yaPresentes) {
        var excluir = new Set();
        (yaPresentes || []).forEach(function (id) { if (id) excluir.add(String(id)); });
        videoSesion.idsVistos.forEach(function (id) { excluir.add(String(id)); });

        if (window.usuarioActualId) {
            try {
                var ocultas = await conTimeout(
                    client.from('publicaciones_ocultas')
                        .select('publicacion_id')
                        .eq('usuario_id', window.usuarioActualId)
                        .limit(200),
                    TIMEOUT_CATALOGO_MS,
                    'ocultas timeout'
                );
                if (!ocultas.error && Array.isArray(ocultas.data)) {
                    ocultas.data.forEach(function (x) {
                        if (x && x.publicacion_id) excluir.add(String(x.publicacion_id));
                    });
                }
            } catch (e) { /* ignorar */ }
        }

        var r = await conTimeout(
            client.from('publicaciones')
                .select('id, usuario_id, contenido, media_url, media_type, created_at, permitir_descarga, tema_id')
                .eq('estado', 'publicado')
                .eq('media_type', 'video')
                .is('perfil_destino_id', null)
                .order('created_at', { ascending: false })
                .limit(RESPALDO_LIMITE * 3),
            TIMEOUT_FEED_MS,
            'respaldo timeout'
        );

        if (r.error || !Array.isArray(r.data)) return [];

        return r.data
            .filter(function (p) {
                if (!p || !p.id || excluir.has(String(p.id))) return false;
                if (window.usuarioActualId && String(p.usuario_id) === String(window.usuarioActualId)) return false;
                var u = safeHttps(p.media_url);
                return !!u && !EXT_IMAGEN_RE.test(u);
            })
            .slice(0, RESPALDO_LIMITE)
            .map(function (p) {
                return {
                    id: p.id,
                    usuario_id: p.usuario_id,
                    contenido: p.contenido,
                    media_url: p.media_url,
                    media_type: p.media_type,
                    permitir_descarga: p.permitir_descarga,
                    tema_id: p.tema_id,
                    usuario_nombre: null,
                    usuario_handle: null,
                    usuario_avatar_url: null,
                    comentarios: null,
                    fuente: 'reciente'
                };
            });
    }

    /* Convierte un ítem del feed en ítem del visor (solo videos reales). */
    function itemDesdeFeed(f) {
        var url = safeHttps(f.media_url);
        if (!url || EXT_IMAGEN_RE.test(url)) return null;

        var item = itemVisorDesdeMedia({
            url: url,
            tipo: 'video',
            permiteDescarga: f.permitir_descarga !== false,
            postId: f.id,
            esDueno: false,
            comentarios: f.comentarios
        }, {
            autorNombre: f.usuario_nombre || f.usuario_handle || null,
            autorHandle: f.usuario_handle || null,
            autorAvatar: f.usuario_avatar_url || null,
            texto: f.contenido || null
        });
        item.temaId = f.tema_id ? String(f.tema_id) : null;
        item.autorUsuarioId = f.usuario_id ? String(f.usuario_id) : null;
        item.fuente = f.fuente || null;
        item.esRecomendado = true;
        item.__esRelleno = true;
        return item;
    }

    /* ========================================================
       ABRIR VISOR DE VIDEOS (solo videos reales, vertical)
       Orden: medios del perfil y de la galería en su orden de
       página; luego el lote del feed. El índice inicial es el del
       medio tocado, localizado por publicación.
       ======================================================== */
    async function abrirVisorConRelleno(itemTocado) {
        if (!esVideoItem(itemTocado)) return;

        var lista = [];
        var vistos = new Set();

        function agregar(it) {
            if (!esVideoItem(it)) return false;
            var clave = claveItem(it);
            if (vistos.has(clave)) return false;
            vistos.add(clave);
            lista.push(it);
            return true;
        }

        mediaPublicaciones.forEach(agregar);
        galeria.items.forEach(agregar);

        var claveTocado = claveItem(itemTocado);
        if (!vistos.has(claveTocado)) agregar(itemTocado);

        var client = await obtenerCliente();
        var lote = { requestId: null, rankingVersion: null, items: [] };

        if (client && window.usuarioActualId) {
            if (!videoSesion.prefsCargadas) {
                await cargarPreferenciasVideo(client);
            }

            var yaPresentes = lista.map(function (x) { return x.postId; });

            try {
                lote = await obtenerFeedVideos(client);
                lote.items = lote.items.filter(function (f) {
                    return f && f.id && yaPresentes.indexOf(f.id) === -1;
                });
            } catch (e) {
                console.warn('[PerfilPublico] Feed (respaldo):', e);
                try {
                    lote = { requestId: null, rankingVersion: 'respaldo', items: await obtenerRespaldoVideos(client, yaPresentes) };
                } catch (e2) {
                    console.warn('[PerfilPublico] Respaldo:', e2);
                    lote = { requestId: null, rankingVersion: null, items: [] };
                }
            }
        }

        lote.items.forEach(function (f) { agregar(itemDesdeFeed(f)); });

        if (!lista.length) return;

        var indiceInicial = indiceDeItem(lista, itemTocado);
        if (indiceInicial < 0) indiceInicial = 0;

        abrirVisor(lista, indiceInicial, {
            carruselVertical: true,
            requestId: lote.requestId,
            rankingVersion: lote.rankingVersion,
            entrada: 'perfil_publico',
            autoReproducir: videoSesion.autoReproducir,
            ahorradorDatos: videoSesion.ahorradorDatos,
            videosAltaCalidad: videoSesion.videosAltaCalidad
        });
    }

    /* ========================================================
       ABRIR VISOR DE FOTOS (solo fotos reales, horizontal)
       El índice inicial es el de la foto tocada, por publicación.
       ======================================================== */
    function abrirVisorFotosDesde(itemTocado) {
        if (!esImagenItem(itemTocado)) return;

        var lista = [];
        var vistos = new Set();

        function agregar(it) {
            if (!esImagenItem(it)) return;
            var clave = claveItem(it);
            if (vistos.has(clave)) return;
            vistos.add(clave);
            lista.push(it);
        }

        mediaPublicaciones.forEach(agregar);
        galeria.items.forEach(agregar);

        if (!vistos.has(claveItem(itemTocado))) agregar(itemTocado);

        var indice = indiceDeItem(lista, itemTocado);
        if (indice < 0) indice = 0;

        abrirVisor(lista, indice, {
            carruselVertical: false,
            autoReproducir: false,
            entrada: 'perfil_publico'
        });
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
        console.info('[PerfilPublico] iniciando v5.3');

        asegurarEstilosComentarios();
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

        /* El catálogo de emojis se espera aquí, antes de pintar publicaciones. */
        await prepararReacciones(client);

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

        cargarPreferenciasVideo(client).catch(function (e) {
            console.warn('[PerfilPublico] Preferencias:', e);
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