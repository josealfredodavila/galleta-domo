/* ================================================================
   PERFIL-PUBLICO.JS — Csariel's
   v4.0 · VISOR DE VIDEO GRANDE + REACCIONES VERTICALES
   ESTABILIDAD · REPRODUCTOR ÚNICO · RESPONSIVE

   ACTUALIZACIONES:
   - Videos grandes con proporción adaptable.
   - Botón para abrir el visor multimedia ampliado.
   - Visor de video a pantalla grande.
   - Reacciones emoji organizadas verticalmente.
   - Contadores individuales de reacciones.
   - Un solo reproductor activo a la vez.
   - Pausa automática al cerrar el visor.
   - Protección de listeners y elementos inexistentes.
   - Protección contra solicitudes duplicadas.
   - Conserva RPC, Supabase, comentarios, amigos y wallet.
   ================================================================ */

(function () {
    'use strict';

    var RUTA_PERFIL_PROPIO = '/features/perfil/perfil.html';
    var HANDLE_RE = /^[A-Za-z0-9_]{1,40}$/;
    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    var POSTS_PAGE = 20;
    var COMENTARIOS_LIMITE = 50;

    var TIMEOUT_CLIENTE_MS = 5000;
    var TIMEOUT_SESION_MS = 4000;
    var TIMEOUT_PERFIL_MS = 12000;

    var perfil = null;
    var direccionWallet = null;

    var pub = {
        cargando: false,
        antes: null,
        total: 0,
        idsVistos: new Set()
    };

    var medioActivo = null;
    var visorActivo = false;

    window.usuarioActualId = null;

    function $(id) {
        return document.getElementById(id);
    }

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
        pubSection: $('pvPubSection'),
        pubLista: $('pvPubLista'),
        pubMsg: $('pvPubMsg'),
        pubMas: $('pvPubMas'),
        pubContador: $('pvPubContador'),
        volver: $('pvVolver'),
        lightbox: $('pvLightbox'),
        lightboxBody: $('pvLightboxBody'),
        lightboxCerrar: $('pvLightboxCerrar')
    };

    /* ================= ESTILOS DEL PERFIL ================= */

    function instalarEstilosPerfil() {
        if ($('pvEstilosV4')) return;

        var css = document.createElement('style');
        css.id = 'pvEstilosV4';

        css.textContent = `
            /* PUBLICACIONES */

            .pv-post {
                width: 100%;
                min-width: 0;
                box-sizing: border-box;
                overflow: hidden;
            }

            .pv-post-meta {
                min-width: 0;
                width: 100%;
                box-sizing: border-box;
            }

            /* VIDEOS GRANDES */

            .pv-media-marco {
                position: relative;
                width: 100%;
                max-width: 100%;
                height: auto;
                min-height: 220px;
                max-height: 82vh;
                margin: 14px 0;
                padding: 0;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #000;
                border-radius: 14px;
                box-sizing: border-box;
                isolation: isolate;
            }

            .pv-post-video {
                display: block;
                width: 100%;
                max-width: 100%;
                height: auto;
                max-height: 82vh;
                min-height: 220px;
                object-fit: contain;
                background: #000;
                margin: 0;
                cursor: pointer;
            }

            .pv-video-ampliar {
                position: absolute;
                z-index: 5;
                top: 12px;
                right: 12px;
                width: 42px;
                height: 42px;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(255,255,255,.35);
                border-radius: 50%;
                background: rgba(0,0,0,.72);
                color: #fff;
                font-size: 23px;
                cursor: pointer;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }

            .pv-video-ampliar:active {
                transform: scale(.94);
            }

            /* VISOR MULTIMEDIA GRANDE */

            #pvLightbox {
                position: fixed;
                inset: 0;
                z-index: 999999;
                width: 100%;
                height: 100%;
                padding: 12px;
                background: rgba(0,0,0,.96);
                display: flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
            }

            #pvLightbox[hidden] {
                display: none !important;
            }

            #pvLightboxBody {
                width: 100%;
                height: 100%;
                max-width: 1200px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }

            #pvLightboxBody video {
                display: block;
                width: 100%;
                height: 100%;
                max-width: 1200px;
                max-height: 92vh;
                object-fit: contain;
                background: #000;
            }

            #pvLightboxBody img {
                display: block;
                max-width: 95vw;
                max-height: 90vh;
                width: auto;
                height: auto;
                object-fit: contain;
            }

            #pvLightboxCerrar {
                position: absolute;
                z-index: 1000001;
                top: max(12px, env(safe-area-inset-top));
                right: 14px;
                width: 44px;
                height: 44px;
                border: 1px solid rgba(255,255,255,.3);
                border-radius: 50%;
                background: rgba(0,0,0,.8);
                color: #fff;
                font-size: 25px;
                cursor: pointer;
            }

            /* REACCIONES VERTICALES */

            .pv-post-barra {
                display: flex;
                align-items: flex-start;
                justify-content: flex-start;
                gap: 12px;
                width: 100%;
                min-width: 0;
                margin-top: 12px;
                box-sizing: border-box;
            }

            .pv-reacciones {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                gap: 9px;
                flex-shrink: 0;
                min-width: 44px;
            }

            .pv-btn-reaccion {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                width: 42px;
                min-height: 43px;
                padding: 4px 2px;
                border: 1px solid transparent;
                border-radius: 12px;
                background: transparent;
                color: inherit;
                font-size: 22px;
                line-height: 1.2;
                cursor: pointer;
                transition: background .18s ease, transform .18s ease;
            }

            .pv-btn-reaccion span:first-child {
                font-size: 23px;
                line-height: 1.2;
            }

            .pv-btn-reaccion span:last-child {
                font-size: 11px;
                opacity: .85;
            }

            .pv-btn-reaccion.activo {
                background: rgba(212,175,55,.13);
                border-color: rgba(212,175,55,.45);
            }

            .pv-btn-reaccion:active {
                transform: scale(.92);
            }

            .pv-btn-reaccion:disabled {
                opacity: .5;
                cursor: wait;
            }

            .pv-btn-comentar {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                min-height: 40px;
                padding: 8px 12px;
                border: 1px solid rgba(128,128,128,.25);
                border-radius: 20px;
                background: transparent;
                color: inherit;
                cursor: pointer;
            }

            .pv-post-img {
                display: block;
                width: 100%;
                max-width: 100%;
                height: auto;
                max-height: 75vh;
                object-fit: contain;
                margin-top: 12px;
                border-radius: 14px;
                cursor: zoom-in;
            }

            .pv-post-audio {
                display: block;
                width: 100%;
                max-width: 100%;
                margin-top: 12px;
            }

            /* PANTALLAS PEQUEÑAS */

            @media (max-width: 600px) {
                .pv-media-marco {
                    width: 100%;
                    min-height: 210px;
                    max-height: 78vh;
                    border-radius: 10px;
                }

                .pv-post-video {
                    min-height: 210px;
                    max-height: 78vh;
                }

                .pv-post-barra {
                    gap: 8px;
                }

                .pv-reacciones {
                    gap: 7px;
                }

                .pv-btn-reaccion {
                    width: 39px;
                    min-height: 40px;
                }

                #pvLightbox {
                    padding: 5px;
                }

                #pvLightboxBody video {
                    max-height: 94vh;
                }
            }

            @media (orientation: landscape) and (max-height: 500px) {
                .pv-media-marco,
                .pv-post-video {
                    max-height: 90vh;
                }

                #pvLightboxBody video {
                    max-height: 94vh;
                }
            }
        `;

        document.head.appendChild(css);
    }

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

        requestAnimationFrame(function () {
            t.classList.add('show');
        });

        clearTimeout(window.__pvToastTimer);

        window.__pvToastTimer = setTimeout(function () {
            t.classList.remove('show');
        }, 3600);
    }

    function msgError(e) {
        if (!e) return 'error desconocido';
        return e.message || e.details || e.hint || e.code || 'error desconocido';
    }

    function conTimeout(promesa, ms, mensaje) {
        var id;

        var limite = new Promise(function (_, reject) {
            id = setTimeout(function () {
                reject(new Error(mensaje));
            }, ms);
        });

        return Promise.race([
            Promise.resolve(promesa),
            limite
        ]).finally(function () {
            clearTimeout(id);
        });
    }

    function safeHttps(u) {
        if (!u) return null;

        try {
            var x = new URL(String(u), window.location.href);

            return x.protocol === 'https:' ? x.href : null;
        } catch (e) {
            return null;
        }
    }

    function mostrar(panel) {
        [
            el.cargando,
            el.noEncontrado,
            el.error,
            el.perfil
        ].forEach(function (n) {
            if (n) n.hidden = (n !== panel);
        });
    }

    function acortar(d) {
        return d.slice(0, 6) + '…' + d.slice(-4);
    }

    function fechaUTC(iso) {
        if (!iso) return null;

        return /(Z|[+-]\d{2}:?\d{2})$/i.test(iso)
            ? iso
            : iso + 'Z';
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

        return d.toLocaleString('es-MX', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function urlPerfil() {
        if (!perfil || !perfil.handle) return window.location.href;

        return window.location.origin +
            window.location.pathname +
            '?u=' + encodeURIComponent(perfil.handle);
    }

    function RG() {
        return window.ReaccionesGlobal || {
            EMOJIS: ['❤️', '😂', '🥺', '💎'],
            POR_DEFECTO: '❤️',

            normalizar: function (e) {
                return this.EMOJIS.indexOf(e) !== -1 ? e : '❤️';
            },

            aplicarMotor: function () {},

            resumir: function (filas, uid) {
                var t = {};
                var total = 0;
                var mi = null;
                var self = this;

                (filas || []).forEach(function (f) {
                    var x = self.normalizar(f.tipo);

                    t[x] = (t[x] || 0) + 1;
                    total++;

                    if (uid && f.usuario_id === uid) {
                        mi = x;
                    }
                });

                return {
                    totales: t,
                    total: total,
                    miTipo: mi
                };
            }
        };
    }

    /* ================= REPRODUCTOR ÚNICO ================= */

    function detenerMedioActivo(nuevoMedio) {
        if (medioActivo && medioActivo !== nuevoMedio) {
            try {
                medioActivo.pause();
            } catch (e) {}

            medioActivo = null;
        }
    }

    function registrarReproductorUnico(elMedia) {
        if (!elMedia || elMedia.__pvRegistrado) return;

        elMedia.__pvRegistrado = true;

        elMedia.addEventListener('play', function () {
            detenerMedioActivo(elMedia);
            medioActivo = elMedia;
        });

        elMedia.addEventListener('pause', function () {
            if (medioActivo === elMedia) {
                medioActivo = null;
            }
        });

        elMedia.addEventListener('ended', function () {
            if (medioActivo === elMedia) {
                medioActivo = null;
            }
        });

        elMedia.addEventListener('error', function () {
            if (medioActivo === elMedia) {
                medioActivo = null;
            }
        });
    }

    /* ================= VISOR MULTIMEDIA ================= */

    function cerrarLightbox() {
        var lb = el.lightbox;
        var body = el.lightboxBody;

        if (body) {
            var videos = body.querySelectorAll('video, audio');

            videos.forEach(function (media) {
                try {
                    media.pause();
                    media.removeAttribute('src');
                    media.load();
                } catch (e) {}
            });

            body.innerHTML = '';
        }

        if (medioActivo && body && body.contains(medioActivo)) {
            medioActivo = null;
        }

        visorActivo = false;

        if (lb) lb.hidden = true;

        document.body.style.overflow = '';
    }

    function abrirLightbox(tipo, url) {
        var segura = safeHttps(url);

        if (!segura || !el.lightboxBody || !el.lightbox) {
            return;
        }

        detenerMedioActivo(null);

        el.lightboxBody.innerHTML = '';

        if (tipo === 'video') {
            var vid = document.createElement('video');

            vid.className = 'pv-video-visor';
            vid.src = segura;
            vid.controls = true;
            vid.autoplay = true;
            vid.playsInline = true;
            vid.preload = 'auto';

            vid.setAttribute('playsinline', '');
            vid.setAttribute('webkit-playsinline', '');
            vid.setAttribute('controlsList', 'nodownload');

            registrarReproductorUnico(vid);

            el.lightboxBody.appendChild(vid);

            visorActivo = true;

            el.lightbox.hidden = false;
            document.body.style.overflow = 'hidden';

            var reproduccion = vid.play();

            if (reproduccion && typeof reproduccion.catch === 'function') {
                reproduccion.catch(function () {
                    vid.controls = true;
                });
            }

        } else {
            var img = document.createElement('img');

            img.src = segura;
            img.alt = '';
            img.decoding = 'async';

            el.lightboxBody.appendChild(img);

            visorActivo = true;

            el.lightbox.hidden = false;
            document.body.style.overflow = 'hidden';
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
            return (uOk && idOk)
                ? { tipo: 'verificado', handle: u, id: id }
                : { tipo: 'invalido' };
        }

        if (tieneU && uOk) {
            return { tipo: 'handle', valor: u };
        }

        if (tieneId && idOk) {
            return { tipo: 'id', valor: id };
        }

        if (tieneU || tieneId) {
            return { tipo: 'invalido' };
        }

        return null;
    }

    async function cargarPerfil(client, ident) {
        var llamada;

        if (ident.tipo === 'verificado') {
            llamada = client.rpc('perfil_publico_verificado', {
                p_handle: ident.handle,
                p_id: ident.id
            });
        } else if (ident.tipo === 'handle') {
            llamada = client.rpc('perfil_publico_por_handle', {
                p_handle: ident.valor
            });
        } else {
            llamada = client.rpc('perfil_publico_por_id', {
                p_id: ident.valor
            });
        }

        var r = await conTimeout(
            llamada,
            TIMEOUT_PERFIL_MS,
            'El servidor tardó demasiado en responder el perfil.'
        );

        if (r.error) throw r.error;

        var fila = Array.isArray(r.data) ? r.data[0] : r.data;

        return fila || null;
    }

    async function resolverSinPerfil(client, ident) {
        var id = ident.tipo === 'verificado'
            ? ident.id
            : (ident.tipo === 'id' ? ident.valor : null);

        if (!id) return 'no_encontrado';

        var params = { p_id: id };

        if (ident.tipo === 'verificado') {
            params.p_handle = ident.handle;
        }

        try {
            var r = await conTimeout(
                client.rpc('perfil_visibilidad_estado', params),
                TIMEOUT_PERFIL_MS,
                'Sin respuesta'
            );

            if (!r.error && r.data) return r.data;

        } catch (e) {}

        return 'no_encontrado';
    }

    function mensajeNoEncontrado(titulo, texto) {
        if (el.noEncontradoTitulo) {
            el.noEncontradoTitulo.removeAttribute('data-clave');
            el.noEncontradoTitulo.textContent = titulo;
        }

        if (el.noEncontradoTexto) {
            el.noEncontradoTexto.removeAttribute('data-clave');
            el.noEncontradoTexto.textContent = texto;
        }

        mostrar(el.noEncontrado);
    }

    function mostrarErrorIdentidad() {
        if (el.errorTexto) {
            el.errorTexto.removeAttribute('data-clave');

            el.errorTexto.textContent =
                'No pudimos verificar la identidad de este perfil. Por seguridad no se muestran sus datos.';
        }

        mostrar(el.error);
    }

    function mostrarErrorGeneral(detalle) {
        if (el.errorTexto) {
            el.errorTexto.removeAttribute('data-clave');

            el.errorTexto.textContent =
                'No pudimos cargar este perfil. ' +
                (detalle || 'Intenta de nuevo.');
        }

        mostrar(el.error);
    }

    /* ================= RENDER PERFIL ================= */

    function pintarAvatar(url) {
        if (!el.avatar) return;

        el.avatar.textContent = '';

        var seguro = safeHttps(url);

        if (!seguro) {
            el.avatar.textContent = '◈';
            return;
        }

        var img = document.createElement('img');

        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';

        img.onerror = function () {
            el.avatar.textContent = '◈';
        };

        img.src = seguro;

        el.avatar.appendChild(img);
    }

    function pintarEstado(p) {
        if (!el.estado) return;

        if (!p.ultima_conexion && p.online !== true) {
            el.estado.hidden = true;
            return;
        }

        el.estado.hidden = false;

        if (p.online === true) {
            if (el.estadoDot) el.estadoDot.className = 'pv-dot activo';

            if (el.estadoTexto) {
                el.estadoTexto.textContent = 'Activo ahora';
            }

        } else {
            if (el.estadoDot) el.estadoDot.className = 'pv-dot inactivo';

            if (el.estadoTexto) {
                el.estadoTexto.textContent =
                    'Inactivo · ' +
                    tiempoRelativo(fechaUTC(p.ultima_conexion));
            }
        }
    }

    function pintarPasaporte(p) {
        if (!el.pasaporte) return;

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

    function renderPerfil(p) {
        if (el.nombre) {
            el.nombre.textContent = p.nombre || p.handle;
        }

        if (el.handle) {
            el.handle.textContent = '@' + p.handle;
        }

        if (el.verificado) {
            el.verificado.hidden = !p.verificado;
        }

        if (el.seguidores) {
            el.seguidores.textContent = String(p.seguidores_count || 0);
        }

        if (el.siguiendo) {
            el.siguiendo.textContent = String(p.siguiendo_count || 0);
        }

        pintarAvatar(p.avatar_url);
        pintarEstado(p);
        pintarPasaporte(p);
        actualizarMeta(p);
    }

    function actualizarMeta(p) {
        var url = urlPerfil();

        var titulo =
            (p.nombre || p.handle) +
            ' (@' + p.handle + ") · Csariel's";

        var desc =
            "Perfil público de " +
            (p.nombre || p.handle) +
            " en Csariel's · WEB3";

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

    async function cargarWallet(client, id) {
        if (!el.wallet || !el.walletDir) return;

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
            .then(function () {
                toast('Dirección copiada', 'success');
            })
            .catch(function () {
                toast('No se pudo copiar', 'error');
            });
    }

    async function compartirPerfil() {
        if (!perfil) return;

        var url = urlPerfil();

        var texto =
            (perfil.nombre || perfil.handle) +
            ' en Csariel\'s';

        if (navigator.share) {
            try {
                await navigator.share({
                    title: texto,
                    text: texto,
                    url: url
                });

                return;

            } catch (e) {
                if (e && e.name === 'AbortError') return;
            }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(function () {
                    toast('Enlace copiado', 'success');
                })
                .catch(function () {
                    window.prompt('Copia este enlace:', url);
                });

        } else {
            window.prompt('Copia este enlace:', url);
        }
    }

    /* ================= AMIGOS ================= */

    function cargarAmigos(client, id) {
        if (!el.amigosSection) return;

        el.amigosSection.hidden = false;

        if (
            window.PerfilPublicoAmigos &&
            typeof window.PerfilPublicoAmigos.cargar === 'function'
        ) {
            window.PerfilPublicoAmigos.cargar(client, id);
        }
    }

    /* ================= MEDIA Y PUBLICACIONES ================= */

    function resolverMedia(p) {
        var url = safeHttps(p.media_url);

        if (!url) return null;

        var tipo = String(p.media_type || '').toLowerCase();

        if (!tipo) {
            if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
                tipo = 'video';
            } else if (/\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(url)) {
                tipo = 'audio';
            } else {
                tipo = 'imagen';
            }
        }

        return {
            url: url,
            tipo: tipo
        };
    }

    function renderMedia(meta, p) {
        var media = resolverMedia(p);

        if (!media) return;

        var sinDescarga = p.permitir_descarga === false;

        /* VIDEO GRANDE + VISOR */

        if (media.tipo === 'video') {
            var marcoVideo = document.createElement('div');

            marcoVideo.className = 'pv-media-marco';

            var vid = document.createElement('video');

            vid.className = 'pv-post-video';
            vid.src = media.url;
            vid.controls = true;
            vid.preload = 'metadata';
            vid.playsInline = true;

            vid.setAttribute('playsinline', '');
            vid.setAttribute('webkit-playsinline', '');

            if (sinDescarga) {
                vid.setAttribute('controlsList', 'nodownload');
            }

            registrarReproductorUnico(vid);

            /* Botón independiente para abrir el visor. */

            var ampliar = document.createElement('button');

            ampliar.type = 'button';
            ampliar.className = 'pv-video-ampliar';
            ampliar.textContent = '⛶';
            ampliar.title = 'Ampliar video';
            ampliar.setAttribute('aria-label', 'Abrir video en pantalla grande');

            ampliar.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();

                try {
                    vid.pause();
                } catch (e) {}

                abrirLightbox('video', media.url);
            });

            marcoVideo.appendChild(vid);
            marcoVideo.appendChild(ampliar);

            meta.appendChild(marcoVideo);

        } else if (media.tipo === 'audio') {

            var aud = document.createElement('audio');

            aud.className = 'pv-post-audio';
            aud.src = media.url;
            aud.controls = true;
            aud.preload = 'none';

            if (sinDescarga) {
                aud.setAttribute('controlsList', 'nodownload');
            }

            registrarReproductorUnico(aud);

            meta.appendChild(aud);

        } else {

            var img = document.createElement('img');

            img.className = 'pv-post-img';
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = media.url;

            img.addEventListener('click', function () {
                abrirLightbox('imagen', media.url);
            });

            meta.appendChild(img);
        }
    }

    /* ================= REACCIONES VERTICALES ================= */

    function pintarBarraReacciones(bar, resumen) {
        if (!bar) return;

        var rg = RG();

        bar.innerHTML = '';

        var emojis = Array.isArray(rg.EMOJIS)
            ? rg.EMOJIS
            : ['❤️', '😂', '🥺', '💎'];

        emojis.forEach(function (emoji) {
            var btn = document.createElement('button');

            btn.type = 'button';

            btn.className =
                'pv-btn-reaccion' +
                (resumen.miTipo === emoji ? ' activo' : '');

            btn.setAttribute('data-tipo', emoji);

            btn.setAttribute(
                'aria-label',
                'Reaccionar con ' + emoji
            );

            var ico = document.createElement('span');

            ico.textContent = emoji;

            try {
                rg.aplicarMotor(ico, emoji);
            } catch (e) {}

            var cant = document.createElement('span');

            var n = resumen.totales[emoji] || 0;

            cant.textContent = n > 0 ? String(n) : '';

            btn.appendChild(ico);
            btn.appendChild(cant);

            bar.appendChild(btn);
        });

        bar._resumen = resumen;
    }

    async function refrescarReacciones(client, pubId, bar) {
        var r = await client
            .from('publicaciones_reacciones')
            .select('tipo, usuario_id')
            .eq('publicacion_id', pubId);

        if (r.error) throw r.error;

        pintarBarraReacciones(
            bar,
            RG().resumir(r.data || [], window.usuarioActualId)
        );
    }

    async function alternarReaccion(client, pubId, tipo, bar) {
        if (!window.usuarioActualId) {
            toast('Inicia sesión para reaccionar', 'error');
            return;
        }

        if (!bar || bar.__pvProcesando) return;

        bar.__pvProcesando = true;

        var botones = bar.querySelectorAll('button');

        botones.forEach(function (b) {
            b.disabled = true;
        });

        try {
            var miTipo = bar._resumen
                ? bar._resumen.miTipo
                : null;

            var res;

            if (miTipo === tipo) {

                res = await client
                    .from('publicaciones_reacciones')
                    .delete()
                    .eq('publicacion_id', pubId)
                    .eq('usuario_id', window.usuarioActualId);

            } else if (miTipo) {

                res = await client
                    .from('publicaciones_reacciones')
                    .update({ tipo: tipo })
                    .eq('publicacion_id', pubId)
                    .eq('usuario_id', window.usuarioActualId);

            } else {

                res = await client
                    .from('publicaciones_reacciones')
                    .insert({
                        publicacion_id: pubId,
                        usuario_id: window.usuarioActualId,
                        tipo: tipo
                    });
            }

            if (res.error) throw res.error;

            await refrescarReacciones(client, pubId, bar);

        } catch (e) {
            console.warn('[PerfilPublico] Reacción:', e);

            toast(
                'No se pudo reaccionar: ' + msgError(e),
                'error'
            );

        } finally {
            bar.__pvProcesando = false;

            if (bar.isConnected) {
                bar.querySelectorAll('button').forEach(function (b) {
                    b.disabled = false;
                });
            }
        }
    }

    /* ================= COMENTARIOS ================= */

    function pintarComentarios(listaEl, filas) {
        if (!listaEl) return;

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

            autor.textContent =
                c.usuario_nombre ||
                c.usuario_handle ||
                'Miembro';

            var txt = document.createElement('span');

            txt.textContent = c.contenido || '';

            item.appendChild(autor);
            item.appendChild(txt);

            listaEl.appendChild(item);
        });
    }

    async function cargarComentarios(client, pubId, listaEl, countEl) {
        if (!listaEl) return;

        listaEl.innerHTML =
            '<div class="pv-comentario-item">Cargando comentarios...</div>';

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

            if (countEl) {
                countEl.textContent = String(filas.length);
            }

        } catch (e) {
            console.warn('[PerfilPublico] Comentarios:', e);

            listaEl.textContent =
                'No se pudieron cargar los comentarios: ' +
                msgError(e);
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
            var ins = await client
                .from('publicaciones_comentarios')
                .insert({
                    publicacion_id: pubId,
                    usuario_id: window.usuarioActualId,
                    contenido: texto
                });

            if (ins.error) throw ins.error;

            inputEl.value = '';

            await cargarComentarios(
                client,
                pubId,
                listaEl,
                countEl
            );

        } catch (e) {
            console.warn('[PerfilPublico] Comentar:', e);

            toast(
                'No se pudo comentar: ' + msgError(e),
                'error'
            );

        } finally {
            inputEl.disabled = false;
            inputEl.focus();
        }
    }

    /* ================= CREAR PUBLICACIÓN ================= */

    function crearPost(client, p) {
        var pubId = p.id;

        var art = document.createElement('article');

        art.className = 'pv-post';

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
            av.textContent =
                (p.usuario_nombre || 'U').charAt(0).toUpperCase();
        }

        var meta = document.createElement('div');

        meta.className = 'pv-post-meta';

        var nombre = document.createElement('div');

        nombre.className = 'pv-post-nombre';

        nombre.textContent =
            p.usuario_nombre ||
            p.usuario_handle ||
            'Usuario';

        var sub = document.createElement('div');

        sub.className = 'pv-post-sub';

        sub.textContent =
            (p.usuario_handle ? '@' + p.usuario_handle + ' · ' : '') +
            fechaPost(p.created_at);

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
            aviso.textContent =
                'Este mensaje contiene lenguaje inapropiado.';

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

        btnCom.appendChild(iconoCom);
        btnCom.appendChild(comCount);

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

        inputCom.setAttribute(
            'aria-label',
            'Escribe un comentario'
        );

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

            if (abrir) {
                cargarComentarios(
                    client,
                    pubId,
                    listaCom,
                    comCount
                );
            }
        });

        formCom.addEventListener('submit', function (ev) {
            ev.preventDefault();

            enviarComentario(
                client,
                pubId,
                inputCom,
                listaCom,
                comCount
            );
        });

        reacciones.addEventListener('click', function (ev) {
            var objetivo = ev.target;

            if (!objetivo || !objetivo.closest) return;

            var btn = objetivo.closest('button[data-tipo]');

            if (!btn || !reacciones.contains(btn)) return;

            alternarReaccion(
                client,
                pubId,
                btn.getAttribute('data-tipo'),
                reacciones
            );
        });

        art.appendChild(av);
        art.appendChild(meta);

        return art;
    }

    /* ================= CARGA DE PUBLICACIONES ================= */

    function mostrarMensajePub(texto) {
        if (!el.pubMsg) return;

        el.pubMsg.textContent = texto || '';
        el.pubMsg.hidden = !texto;
    }

    async function cargarPublicaciones(client, handle, reiniciar) {
        if (pub.cargando || !handle || !el.pubLista) return;

        pub.cargando = true;

        if (reiniciar) {
            pub.antes = null;
            pub.total = 0;
            pub.idsVistos.clear();

            el.pubLista.innerHTML = '';
        }

        if (el.pubMas) {
            el.pubMas.disabled = true;
        }

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
                if (el.pubSection) el.pubSection.hidden = false;
                if (el.pubMas) el.pubMas.hidden = true;

                mostrarMensajePub(
                    r.error.code === '42501'
                        ? 'Inicia sesión para ver las publicaciones de tus contactos.'
                        : 'No se pudieron cargar las publicaciones.'
                );

                return;
            }

            var d = r.data || {};

            if (
                d.estado === 'bloqueado' ||
                d.estado === 'no_encontrado'
            ) {
                if (el.pubSection) el.pubSection.hidden = true;
                return;
            }

            if (el.pubSection) {
                el.pubSection.hidden = false;
            }

            if (d.estado === 'no_autenticado') {
                el.pubLista.innerHTML = '';

                if (el.pubMas) el.pubMas.hidden = true;

                if (el.pubContador) {
                    el.pubContador.textContent = '';
                }

                mostrarMensajePub(
                    'Inicia sesión para ver las publicaciones de tus contactos.'
                );

                return;
            }

            if (d.estado === 'no_contacto') {
                el.pubLista.innerHTML = '';

                if (el.pubMas) el.pubMas.hidden = true;

                if (el.pubContador) {
                    el.pubContador.textContent = '';
                }

                mostrarMensajePub(
                    'Solo tus contactos pueden ver las publicaciones de esta persona.'
                );

                return;
            }

            var posts = Array.isArray(d.posts)
                ? d.posts
                : [];

            var nuevos = posts.filter(function (p) {
                if (!p.id || pub.idsVistos.has(p.id)) {
                    return false;
                }

                pub.idsVistos.add(p.id);

                return true;
            });

            var ids = nuevos.map(function (p) {
                return p.id;
            });

            var resumenes = new Map();

            if (ids.length) {
                try {
                    var rReac = await client
                        .from('publicaciones_reacciones')
                        .select('publicacion_id, tipo, usuario_id')
                        .in('publicacion_id', ids);

                    if (rReac.error) throw rReac.error;

                    var porPub = {};

                    (rReac.data || []).forEach(function (row) {
                        var k = String(row.publicacion_id);

                        if (!porPub[k]) {
                            porPub[k] = [];
                        }

                        porPub[k].push(row);
                    });

                    ids.forEach(function (id) {
                        resumenes.set(
                            String(id),
                            RG().resumir(
                                porPub[String(id)] || [],
                                window.usuarioActualId
                            )
                        );
                    });

                } catch (e) {
                    console.warn(
                        '[PerfilPublico] Reacciones batch:',
                        e
                    );
                }
            }

            nuevos.forEach(function (p) {
                var card = crearPost(client, p);

                el.pubLista.appendChild(card);

                var bar = card.querySelector('.pv-reacciones');

                if (bar) {
                    pintarBarraReacciones(
                        bar,
                        resumenes.get(String(p.id)) || {
                            totales: {},
                            total: 0,
                            miTipo: null
                        }
                    );
                }
            });

            pub.total += nuevos.length;

            if (posts.length) {
                pub.antes = posts[posts.length - 1].created_at;
            }

            if (el.pubContador) {
                el.pubContador.textContent =
                    pub.total ? String(pub.total) : '';
            }

            mostrarMensajePub(
                pub.total ? '' : 'Sin publicaciones'
            );

            if (el.pubMas) {
                el.pubMas.hidden = posts.length < POSTS_PAGE;
            }

        } catch (e) {
            console.warn('[PerfilPublico] Publicaciones:', e);

            if (el.pubSection) {
                el.pubSection.hidden = false;
            }

            mostrarMensajePub(
                'No se pudieron cargar las publicaciones: ' +
                msgError(e)
            );

        } finally {
            pub.cargando = false;

            if (el.pubMas) {
                el.pubMas.disabled = false;
            }
        }
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

    /* ================= EVENTOS ================= */

    function mismoOrigenReferrer() {
        try {
            return !!document.referrer &&
                new URL(document.referrer).origin === window.location.origin;

        } catch (e) {
            return false;
        }
    }

    function configurarVolver() {
        if (el.volver) {
            el.volver.addEventListener('click', function (e) {
                if (
                    window.history.length > 1 &&
                    mismoOrigenReferrer()
                ) {
                    e.preventDefault();
                    window.history.back();
                }
            });

            if (!mismoOrigenReferrer()) {
                el.volver.setAttribute('href', '/');
                el.volver.textContent = '← Ir al inicio';
            }
        }

        var volverNoEnc = $('pvVolverNoEncontrado');

        if (volverNoEnc && !mismoOrigenReferrer()) {
            volverNoEnc.setAttribute('href', '/');
            volverNoEnc.textContent = '← Ir al inicio';
        }
    }

    /* ================= CLIENTE Y SESIÓN ================= */

    async function obtenerCliente() {
        if (window.supabaseClient) {
            return window.supabaseClient;
        }

        if (window.__sarielsSupabaseSingleton) {
            return window.__sarielsSupabaseSingleton;
        }

        if (
            window.supabaseReady &&
            typeof window.supabaseReady.then === 'function'
        ) {
            try {
                var c = await conTimeout(
                    window.supabaseReady,
                    TIMEOUT_CLIENTE_MS,
                    'El cliente de Supabase no respondió.'
                );

                if (c) return c;

            } catch (e) {
                console.warn(
                    '[PerfilPublico] supabaseReady:',
                    e
                );
            }
        }

        var intentos = 0;

        while (intentos < 20) {
            if (window.supabaseClient) {
                return window.supabaseClient;
            }

            if (window.__sarielsSupabaseSingleton) {
                return window.__sarielsSupabaseSingleton;
            }

            await new Promise(function (r) {
                setTimeout(r, 100);
            });

            intentos++;
        }

        return window.supabaseClient ||
            window.__sarielsSupabaseSingleton ||
            null;
    }

    async function resolverSesion(client) {
        try {
            var r = await conTimeout(
                client.auth.getSession(),
                TIMEOUT_SESION_MS,
                'La sesión tardó demasiado.'
            );

            var user =
                r &&
                r.data &&
                r.data.session
                    ? r.data.session.user
                    : null;

            window.usuarioActualId = user ? user.id : null;

        } catch (e) {
            console.warn('[PerfilPublico] Sesión:', e);

            window.usuarioActualId = null;
        }

        return window.usuarioActualId;
    }

    /* ================= INIT ================= */

    async function init() {
        console.info('[PerfilPublico] iniciando v4.0');

        instalarEstilosPerfil();

        mostrar(el.cargando);

        configurarVolver();

        var ident = leerIdentificador();

        if (!ident) {
            mostrar(el.noEncontrado);
            return;
        }

        if (ident.tipo === 'invalido') {
            mostrarErrorIdentidad();
            return;
        }

        var client = await obtenerCliente();

        if (!client) {
            mostrarErrorGeneral(
                'No se pudo conectar con la base de datos. Recarga la página.'
            );

            return;
        }

        await resolverSesion(client);

        try {
            client.auth.onAuthStateChange(function (_e, sesion) {
                window.usuarioActualId =
                    (sesion && sesion.user)
                        ? sesion.user.id
                        : null;
            });

        } catch (e) {}

        var p = await cargarPerfil(client, ident);

        if (!p) {
            var vis = await resolverSinPerfil(client, ident);

            if (vis === 'restringido') {
                mensajeNoEncontrado(
                    'Perfil restringido',
                    'Este perfil está restringido. Solo sus contactos pueden verlo.'
                );

            } else if (
                vis === 'bloqueado' ||
                vis === 'no_disponible'
            ) {
                mensajeNoEncontrado(
                    'Perfil no disponible',
                    'Este perfil no está disponible en este momento.'
                );

            } else if (ident.tipo === 'verificado') {
                mostrarErrorIdentidad();

            } else {
                mostrar(el.noEncontrado);
            }

            return;
        }

        if (!p.handle && !p.nombre) {
            mostrar(el.noEncontrado);
            return;
        }

        if (
            ident.tipo === 'verificado' &&
            String(p.handle || '').toLowerCase() !==
            ident.handle.toLowerCase()
        ) {
            mostrarErrorIdentidad();
            return;
        }

        if (
            window.usuarioActualId &&
            p.id === window.usuarioActualId
        ) {
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

        cargarPublicaciones(
            client,
            p.handle,
            true
        );
    }

    /* ================= LISTENERS PROTEGIDOS ================= */

    if (el.wallet) {
        el.wallet.addEventListener('click', copiarWallet);
    }

    if (el.compartir) {
        el.compartir.addEventListener(
            'click',
            compartirPerfil
        );
    }

    if (el.reintentar) {
        el.reintentar.addEventListener('click', function () {
            window.location.reload();
        });
    }

    if (el.pubMas) {
        el.pubMas.addEventListener('click', async function () {
            var client = await obtenerCliente();

            if (client && perfil && perfil.handle) {
                cargarPublicaciones(
                    client,
                    perfil.handle,
                    false
                );
            }
        });
    }

    if (el.lightboxCerrar) {
        el.lightboxCerrar.addEventListener(
            'click',
            cerrarLightbox
        );
    }

    if (el.lightbox) {
        el.lightbox.addEventListener('click', function (e) {
            if (e.target === el.lightbox) {
                cerrarLightbox();
            }
        });
    }

    document.addEventListener('keydown', function (e) {
        if (
            e.key === 'Escape' &&
            el.lightbox &&
            !el.lightbox.hidden
        ) {
            cerrarLightbox();
        }
    });

    /* ================= LIMPIEZA ================= */

    window.addEventListener('pagehide', function () {
        if (medioActivo) {
            try {
                medioActivo.pause();
            } catch (e) {}

            medioActivo = null;
        }
    });

    /* ================= ARRANQUE ================= */

    var iniciado = false;

    function arrancar() {
        if (iniciado) return;

        iniciado = true;

        init().catch(function (err) {
            console.error('[PerfilPublico]', err);

            mostrarErrorGeneral(msgError(err));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            arrancar,
            { once: true }
        );
    } else {
        arrancar();
    }

})();