/* ================================================================
   PERFIL-PUBLICO.JS — Csariel's
   v4.2 · Reacciones desde el módulo global (reacciones-global.js).
   Tablas y RPC verificadas en Supabase.
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
    var TIMEOUT_CATALOGO_MS = 4000;

    var perfil = null;
    var direccionWallet = null;
    var pub = { cargando: false, antes: null, total: 0, idsVistos: new Set() };
    var medioActivo = null;

    var vf = {
        abierto: false,
        items: [],
        indice: 0,
        post: null,
        modoFit: 'contain',
        velocidades: [1, 1.5, 2],
        velIndex: 0,
        ocultarTimer: null,
        arrastrando: false,
        startX: 0,
        startY: 0,
        movido: false,
        motivoReporte: ''
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

    function formatearDuracion(seg) {
        if (!isFinite(seg) || seg < 0) seg = 0;
        var s = Math.floor(seg);
        var m = Math.floor(s / 60);
        var r = s % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    function urlPerfil() {
        return window.location.origin + window.location.pathname + '?u=' + encodeURIComponent(perfil.handle);
    }

    function registrarReproductorUnico(elMedia) {
        elMedia.addEventListener('play', function () {
            if (medioActivo && medioActivo !== elMedia) {
                try { medioActivo.pause(); } catch (e) {}
            }
            medioActivo = elMedia;
        });
    }

    /* ================= VISOR INMERSIVO ================= */

    function vfNodo() {
        return {
            root: $('pubVisorFull'),
            media: document.querySelector('#pubVisorFull .pub-vf-media'),
            btnClose: $('btnPubVfClose'),
            btnMenu: $('btnPubVfMenu'),
            centerControls: $('pubVfCenterControls'),
            btnPlayCenter: $('pubVfBtnPlayCenter'),
            controls: document.querySelector('#pubVisorFull .pub-vf-controls'),
            progressBar: $('pubVfProgressBar'),
            progressFill: $('pubVfProgressFill'),
            timeLabel: $('pubVfTimeLabel'),
            btnSpeed: $('btnPubVfSpeed'),
            btnPip: $('btnPubVfPip'),
            btnExpand: $('btnPubVfExpand'),
            sheetBackdrop: $('pubVfSheetBackdrop'),
            sheet: $('pubVfSheet'),
            sheetTrack: document.querySelector('#pubVfSheet .pub-vf-sheet-track'),
            sheetViews: document.querySelectorAll('#pubVfSheet .pub-vf-sheet-view')
        };
    }

    function vfVideo() {
        var n = vfNodo();
        return n.media ? n.media.querySelector('video') : null;
    }

    function vfAplicarEscala() {
        var n = vfNodo();
        if (!n.media) return;
        var e = n.media.querySelector('video, img');
        if (!e) return;
        e.style.objectFit = vf.modoFit;
        e.style.objectPosition = 'center';
    }

    function vfAlternarEscala() {
        vf.modoFit = vf.modoFit === 'cover' ? 'contain' : 'cover';
        vfAplicarEscala();
    }

    function vfMostrarControles(autoOcultar) {
        var n = vfNodo();
        if (!n.root) return;
        n.root.classList.remove('controls-hidden');
        if (vf.ocultarTimer) { clearTimeout(vf.ocultarTimer); vf.ocultarTimer = null; }
        var vid = vfVideo();
        if (autoOcultar && vid && !vid.paused) {
            vf.ocultarTimer = setTimeout(function () {
                if (vf.abierto && vid && !vid.paused && !vf.arrastrando) {
                    n.root.classList.add('controls-hidden');
                }
            }, 2500);
        }
    }

    function vfActualizarPlay() {
        var n = vfNodo();
        var vid = vfVideo();
        if (!vid) {
            if (n.centerControls) n.centerControls.hidden = true;
            if (n.controls) n.controls.hidden = true;
            vfMostrarControles(false);
            return;
        }
        if (n.controls) n.controls.hidden = false;
        if (n.centerControls) n.centerControls.hidden = !vid.paused;
        vfMostrarControles(!vid.paused);
    }

    function vfActualizarProgreso() {
        var n = vfNodo();
        var vid = vfVideo();
        if (!vid) return;
        var dur = vid.duration || 0;
        var cur = vid.currentTime || 0;
        var pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
        if (n.progressFill) n.progressFill.style.width = pct + '%';
        if (n.timeLabel) n.timeLabel.textContent = formatearDuracion(cur) + ' / ' + formatearDuracion(dur);
    }

    function vfBuscar(ev) {
        var n = vfNodo();
        var vid = vfVideo();
        if (!vid || !n.progressBar || !isFinite(vid.duration) || vid.duration <= 0) return;
        var rect = n.progressBar.getBoundingClientRect();
        if (!rect.width) return;
        var ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
        vid.currentTime = ratio * vid.duration;
        vfActualizarProgreso();
    }

    function vfRender(idx) {
        var n = vfNodo();
        if (!n.media || !vf.items.length) return;

        var len = vf.items.length;
        var i = ((idx % len) + len) % len;
        vf.indice = i;

        var item = vf.items[i];
        var segura = safeHttps(item.url);
        if (!segura) return;

        var prev = vfVideo();
        if (prev) { try { prev.pause(); } catch (e) {} }

        n.media.innerHTML = '';
        vf.velIndex = 0;
        if (n.btnSpeed) n.btnSpeed.textContent = '1x';

        if (item.tipo === 'video') {
            var vid = document.createElement('video');
            vid.src = segura;
            vid.controls = false;
            vid.playsInline = true;
            vid.setAttribute('playsinline', '');
            vid.setAttribute('webkit-playsinline', '');
            if (vf.post && vf.post.permitir_descarga === false) {
                vid.setAttribute('controlsList', 'nodownload');
            }
            vid.addEventListener('loadedmetadata', function () {
                vf.modoFit = (vid.videoHeight > vid.videoWidth) ? 'cover' : 'contain';
                vfAplicarEscala();
                vfActualizarProgreso();
            });
            vid.addEventListener('timeupdate', vfActualizarProgreso);
            vid.addEventListener('play', vfActualizarPlay);
            vid.addEventListener('pause', vfActualizarPlay);
            vid.addEventListener('ended', vfActualizarPlay);
            registrarReproductorUnico(vid);
            n.media.appendChild(vid);
            vfAplicarEscala();
            vid.play().then(vfActualizarPlay).catch(vfActualizarPlay);
        } else {
            var img = document.createElement('img');
            img.src = segura;
            img.alt = '';
            img.addEventListener('load', function () {
                vf.modoFit = (img.naturalHeight > img.naturalWidth) ? 'cover' : 'contain';
                vfAplicarEscala();
            });
            n.media.appendChild(img);
            vfAplicarEscala();
            vfActualizarPlay();
        }
    }

    function vfAbrir(items, idxInicial, postObj) {
        var n = vfNodo();
        if (!n.root || !Array.isArray(items) || !items.length) return;
        if (medioActivo) { try { medioActivo.pause(); } catch (e) {} }
        vf.abierto = true;
        vf.items = items;
        vf.post = postObj || null;
        vf.modoFit = 'contain';
        n.root.hidden = false;
        vfRender(idxInicial || 0);
    }

    function vfCerrar(mantenerPip) {
        var n = vfNodo();
        vfCerrarSheet();
        if (vf.ocultarTimer) { clearTimeout(vf.ocultarTimer); vf.ocultarTimer = null; }
        vf.abierto = false;

        var vid = vfVideo();
        if (vid && !mantenerPip) {
            try { vid.pause(); } catch (e) {}
            if (medioActivo === vid) medioActivo = null;
        }
        if (n.media && !mantenerPip) n.media.innerHTML = '';
        if (n.root) {
            n.root.hidden = true;
            n.root.classList.remove('controls-hidden');
        }
    }

    function vfIrPaso(paso) {
        var n = vfNodo();
        if (n.sheetTrack) n.sheetTrack.style.transform = 'translateX(-' + (paso * 33.3333) + '%)';
    }

    function vfCerrarSheet() {
        var n = vfNodo();
        if (n.sheetBackdrop) n.sheetBackdrop.hidden = true;
        if (n.sheet) n.sheet.hidden = true;
        vfIrPaso(0);
    }

    async function vfGuardar() {
        var item = vf.items[vf.indice];
        if (!item || !item.url) return;

        if (vf.post && vf.post.permitir_descarga === false) {
            toast('La descarga está deshabilitada para este archivo', 'error');
            return;
        }

        try {
            toast('Descargando...', 'success');
            var res = await fetch(item.url);
            if (!res.ok) throw new Error('Error de red');
            var blob = await res.blob();
            var ext = item.tipo === 'video' ? 'mp4' : (item.tipo === 'audio' ? 'mp3' : 'jpg');
            var u = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = u;
            a.download = 'archivo-' + Date.now() + '.' + ext;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
        } catch (e) {
            toast('No se pudo guardar el archivo', 'error');
        }
    }

    function vfAbrirSheet() {
        var n = vfNodo();
        if (!n.sheet || !n.sheetViews || n.sheetViews.length < 3) return;

        var vPrin = n.sheetViews[0];
        var vMot = n.sheetViews[1];
        var vConf = n.sheetViews[2];
        var post = vf.post || {};

        var esDueno = Boolean(window.usuarioActualId && post.usuario_id &&
            String(post.usuario_id) === String(window.usuarioActualId));

        function boton(texto, onClick) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'pub-vf-pill-btn';
            b.style.width = '100%';
            b.style.justifyContent = 'flex-start';
            b.style.height = '44px';
            b.textContent = texto;
            b.addEventListener('click', onClick);
            return b;
        }

        vPrin.innerHTML = '';
        vPrin.appendChild(boton('Guardar', function () {
            vfCerrarSheet();
            vfGuardar();
        }));

        if (!esDueno) {
            vPrin.appendChild(boton('No quiero ver esto', function () {
                if (post.id && el.pubLista) {
                    var card = el.pubLista.querySelector('.pv-post[data-pub-id="' + post.id + '"]');
                    if (card) card.remove();
                }
                vfCerrarSheet();
                vfCerrar(false);
                toast('Publicación ocultada', 'success');
            }));
            vPrin.appendChild(boton('Reportar →', function () { vfIrPaso(1); }));
        } else {
            vPrin.appendChild(boton('Eliminar', async function () {
                if (!post.id) return;
                try {
                    var client = await obtenerCliente();
                    if (!client) throw new Error('Sin conexión');
                    var del = await client.from('publicaciones').delete().eq('id', post.id);
                    if (del.error) throw del.error;
                    if (el.pubLista) {
                        var card = el.pubLista.querySelector('.pv-post[data-pub-id="' + post.id + '"]');
                        if (card) card.remove();
                    }
                    vfCerrarSheet();
                    vfCerrar(false);
                    toast('Publicación eliminada', 'success');
                } catch (e) {
                    toast('No se pudo eliminar: ' + msgError(e), 'error');
                }
            }));
        }

        vMot.innerHTML = '';
        vMot.appendChild(boton('← Volver', function () { vfIrPaso(0); }));

        ['Spam', 'Contenido inapropiado', 'Acoso o fraude', 'Otro motivo'].forEach(function (mot) {
            vMot.appendChild(boton(mot, function () {
                vf.motivoReporte = mot;
                vConf.innerHTML = '';

                vConf.appendChild(boton('← Motivos', function () { vfIrPaso(1); }));

                var p = document.createElement('p');
                p.style.margin = '8px 0';
                p.textContent = 'Confirmar reporte por: ' + mot;
                vConf.appendChild(p);

                vConf.appendChild(boton('Confirmar reporte', async function () {
                    try {
                        var client = await obtenerCliente();
                        if (!client || !post.id || !window.usuarioActualId) {
                            throw new Error('Inicia sesión para reportar');
                        }
                        /* Columnas reales de publicacion_reportes: publicacion_id, usuario_id, motivo.
                           id, estado ('pendiente') y created_at se llenan solos. */
                        var ins = await client.from('publicacion_reportes').insert({
                            publicacion_id: post.id,
                            usuario_id: window.usuarioActualId,
                            motivo: vf.motivoReporte
                        });
                        if (ins.error) throw ins.error;
                        vfCerrarSheet();
                        toast('Reporte enviado', 'success');
                    } catch (e) {
                        toast('No se pudo enviar el reporte: ' + msgError(e), 'error');
                    }
                }));

                vfIrPaso(2);
            }));
        });

        vfIrPaso(0);
        if (n.sheetBackdrop) n.sheetBackdrop.hidden = false;
        n.sheet.hidden = false;
    }

    function enlazarVisor() {
        var n = vfNodo();
        if (!n.root) return;

        if (n.btnClose) n.btnClose.addEventListener('click', function (ev) { ev.stopPropagation(); vfCerrar(false); });
        if (n.btnMenu) n.btnMenu.addEventListener('click', function (ev) { ev.stopPropagation(); vfAbrirSheet(); });

        if (n.btnPlayCenter) {
            n.btnPlayCenter.addEventListener('click', function (ev) {
                ev.stopPropagation();
                var vid = vfVideo();
                if (vid && vid.paused) vid.play().catch(function () {});
            });
        }

        if (n.btnSpeed) {
            n.btnSpeed.addEventListener('click', function (ev) {
                ev.stopPropagation();
                vf.velIndex = (vf.velIndex + 1) % vf.velocidades.length;
                var v = vf.velocidades[vf.velIndex];
                var vid = vfVideo();
                if (vid) vid.playbackRate = v;
                n.btnSpeed.textContent = v + 'x';
                vfMostrarControles(true);
            });
        }

        if (n.btnPip) {
            n.btnPip.addEventListener('click', async function (ev) {
                ev.stopPropagation();
                var vid = vfVideo();
                if (!vid || typeof vid.requestPictureInPicture !== 'function') {
                    toast('PiP no disponible', 'error');
                    return;
                }
                try {
                    if (document.pictureInPictureElement) {
                        await document.exitPictureInPicture();
                    } else {
                        await vid.requestPictureInPicture();
                        vfCerrar(true);
                    }
                } catch (e) {
                    toast('No se pudo activar PiP', 'error');
                }
            });
        }

        if (n.btnExpand) {
            n.btnExpand.addEventListener('click', function (ev) {
                ev.stopPropagation();
                vfAlternarEscala();
            });
        }

        if (n.progressBar) {
            n.progressBar.addEventListener('pointerdown', function (ev) {
                ev.stopPropagation();
                vf.arrastrando = true;
                try { n.progressBar.setPointerCapture(ev.pointerId); } catch (e) {}
                vfBuscar(ev);
            });
            n.progressBar.addEventListener('pointermove', function (ev) {
                if (!vf.arrastrando) return;
                ev.stopPropagation();
                vfBuscar(ev);
            });
            var finArrastre = function (ev) {
                if (!vf.arrastrando) return;
                ev.stopPropagation();
                vf.arrastrando = false;
                try { n.progressBar.releasePointerCapture(ev.pointerId); } catch (e) {}
                vfMostrarControles(true);
            };
            n.progressBar.addEventListener('pointerup', finArrastre);
            n.progressBar.addEventListener('pointercancel', finArrastre);
        }

        if (n.media) {
            n.media.addEventListener('touchstart', function (ev) {
                if (!ev.touches || !ev.touches.length) return;
                vf.startX = ev.touches[0].clientX;
                vf.startY = ev.touches[0].clientY;
                vf.movido = false;
            }, { passive: true });

            n.media.addEventListener('touchmove', function (ev) {
                if (!ev.touches || !ev.touches.length) return;
                var dx = Math.abs(ev.touches[0].clientX - vf.startX);
                var dy = Math.abs(ev.touches[0].clientY - vf.startY);
                if (dx > 10 || dy > 10) vf.movido = true;
            }, { passive: true });

            n.media.addEventListener('touchend', function (ev) {
                if (!ev.changedTouches || !ev.changedTouches.length) return;
                var dX = ev.changedTouches[0].clientX - vf.startX;
                var dY = ev.changedTouches[0].clientY - vf.startY;

                if (dY > 120 && Math.abs(dY) > Math.abs(dX)) {
                    vfCerrar(false);
                    return;
                }
                if (Math.abs(dX) > 55 && Math.abs(dX) > Math.abs(dY)) {
                    vfRender(dX < 0 ? vf.indice + 1 : vf.indice - 1);
                    return;
                }
                if (!vf.movido) {
                    var vid = vfVideo();
                    if (vid) {
                        if (vid.paused) vid.play().catch(function () {});
                        else vid.pause();
                    } else {
                        vfMostrarControles(false);
                    }
                }
            }, { passive: true });
        }

        if (n.sheetBackdrop) n.sheetBackdrop.addEventListener('click', vfCerrarSheet);

        window.addEventListener('resize', function () {
            if (vf.abierto) vfAlternarEscala();
        });
    }

    /* ================= LIGHTBOX (respaldo si no hay visor) ================= */

    function cerrarLightbox() {
        var lb = el.lightbox;
        var body = el.lightboxBody;
        if (medioActivo && body && body.contains(medioActivo)) {
            try { medioActivo.pause(); } catch (e) {}
            medioActivo = null;
        }
        if (lb) lb.hidden = true;
        if (body) body.innerHTML = '';
    }

    function abrirMedioAmpliado(tipo, url, items, idx, post) {
        var segura = safeHttps(url);
        if (!segura) return;

        if ($('pubVisorFull')) {
            vfAbrir(items || [{ tipo: tipo, url: segura }], idx || 0, post || null);
            return;
        }

        if (!el.lightboxBody) return;
        el.lightboxBody.innerHTML = '';

        var nodo;
        if (tipo === 'video') {
            nodo = document.createElement('video');
            nodo.src = segura;
            nodo.controls = true;
            nodo.autoplay = true;
            nodo.playsInline = true;
            nodo.setAttribute('playsinline', '');
            registrarReproductorUnico(nodo);
        } else {
            nodo = document.createElement('img');
            nodo.src = segura;
            nodo.alt = '';
        }
        el.lightboxBody.appendChild(nodo);
        if (el.lightbox) el.lightbox.hidden = false;
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

    /* ================= RENDER PERFIL ================= */

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

    /* ================= AMIGOS ================= */

    function cargarAmigos(client, id) {
        if (!el.amigosSection) return;
        el.amigosSection.hidden = false;
        if (window.PerfilPublicoAmigos && typeof window.PerfilPublicoAmigos.cargar === 'function') {
            window.PerfilPublicoAmigos.cargar(client, id);
        }
    }

    /* ================= MEDIOS ================= */

    function listaMedia(p) {
        var u = safeHttps(p.media_url);
        if (!u) return [];

        var t = String(p.media_type || '').toLowerCase();
        if (!t) {
            if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) t = 'video';
            else if (/\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(u)) t = 'audio';
            else t = 'imagen';
        }
        return [{ url: u, tipo: t }];
    }

    function renderMedia(meta, p) {
        var media = listaMedia(p)[0];
        if (!media) return;

        var sinDescarga = p.permitir_descarga === false;

        if (media.tipo === 'audio') {
            var aud = document.createElement('audio');
            aud.className = 'pv-post-audio';
            aud.src = media.url;
            aud.controls = true;
            aud.preload = 'none';
            if (sinDescarga) aud.setAttribute('controlsList', 'nodownload');
            registrarReproductorUnico(aud);
            meta.appendChild(aud);
            return;
        }

        var marco = document.createElement('div');
        marco.className = 'pv-media-marco';

        var nodo;
        if (media.tipo === 'video') {
            nodo = document.createElement('video');
            nodo.className = 'pv-media';
            nodo.src = media.url;
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
            nodo.src = media.url;
        }

        marco.appendChild(nodo);

        marco.addEventListener('click', function () {
            if (typeof nodo.pause === 'function') { try { nodo.pause(); } catch (e) {} }
            abrirMedioAmpliado(media.tipo, media.url, [{ tipo: media.tipo, url: media.url }], 0, p);
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

    /* ================= PUBLICACIÓN ================= */

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

        /* Contenedor de la barra de reacciones: lo llena el módulo global
           en cargarPublicaciones. */
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

    window.PerfilPublicoPosts = {
        crearPost: crearPost,
        abrirVisor: vfAbrir,
        cerrarVisor: vfCerrar,
        toast: toast,
        msgError: msgError,
        safeHttps: safeHttps
    };

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
        console.info('[PerfilPublico] iniciando v4.2');

        mostrar(el.cargando);
        configurarVolver();
        enlazarVisor();

        var ident = leerIdentificador();

        if (!ident) { mostrar(el.noEncontrado); return; }
        if (ident.tipo === 'invalido') { mostrarErrorIdentidad(); return; }

        var client = await obtenerCliente();

        if (!client) {
            mostrarErrorGeneral('No se pudo conectar con la base de datos. Recarga la página.');
            return;
        }

        await resolverSesion(client);

        /* Precarga del catálogo de reacciones (con límite de tiempo). */
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
    }

    /* ================= LISTENERS ================= */

    el.wallet.addEventListener('click', copiarWallet);
    el.compartir.addEventListener('click', compartirPerfil);
    el.reintentar.addEventListener('click', function () { window.location.reload(); });

    el.pubMas.addEventListener('click', async function () {
        var client = await obtenerCliente();
        if (client && perfil && perfil.handle) cargarPublicaciones(client, perfil.handle, false);
    });

    el.lightboxCerrar.addEventListener('click', cerrarLightbox);
    el.lightbox.addEventListener('click', function (e) {
        if (e.target === el.lightbox) cerrarLightbox();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;

        var n = vfNodo();

        if (n.sheet && !n.sheet.hidden) { vfCerrarSheet(); return; }
        if (n.root && !n.root.hidden) { vfCerrar(false); return; }
        if (!el.lightbox.hidden) cerrarLightbox();
    });

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