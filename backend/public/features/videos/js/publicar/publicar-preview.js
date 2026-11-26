/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · VISTA PREVIA (v1)
   ================================================================
   Quinto módulo de la división de videos-publicar.js.
   - Selector de archivo plano (oculta el input original).
   - Vista previa del video dentro de la publicación y su portada.
   - Vista previa a pantalla completa con el audio de la pista sincronizado.
   - Quitar el video seleccionado.
   - Reseteo del formulario después de publicar.
   - Refresco del feed al publicar.
   Dependencias en tiempo de uso (no al cargar):
     NS.borradores → persistirArchivo, persistirMetaDebounced,
                     limpiarPersistencia, resetEstadoBorrador,
                     guardarBorrador
     NS.sheets     → abrirModalBorradores
     NS.ui         → csToast, csConfirm, asegurarMarca,
                     actualizarBotonesSonidoUbicacion
     NS.audio      → reproducir, pausar, reanudar, detener
   Expuesto en NS.preview. Registra los listeners globales al inicializar.
   Requiere: publicar-base.js, publicar-ui.js, publicar-audio.js.
   ================================================================ */

(function () {
    'use strict';

    var NS = window.VideosPublicarNS;
    if (!NS || !NS.C || !NS.u || !NS.state || !NS.audio || !NS.ui) {
        console.error('[VideosPublicar] publicar-preview.js requiere base, ui y audio.');
        return;
    }
    if (NS.preview) return;

    var C = NS.C;
    var U = NS.u;
    var S = NS.state;
    var Z = C.Z;
    var $ = U.$;
    var vt = U.vt;
    var setTexto = U.setTexto;
    var setTextoLinea = U.setTextoLinea;

    /* Pista de audio que suena junto al video en la vista previa a pantalla completa. */
    var pistaPreviewAudio = null;

    /* Llama una función de otro módulo solo si ya existe. */
    function llamar(modulo, fn) {
        var args = Array.prototype.slice.call(arguments, 2);
        var m = NS[modulo];
        if (m && typeof m[fn] === 'function') return m[fn].apply(m, args);
        return undefined;
    }

    /* ----------------------------------------------------------------
       INPUT DE ARCHIVO Y BOTÓN PLANO
       ---------------------------------------------------------------- */

    /* Pone el archivo elegido en el input original, para que el formulario lo lea. */
    function ponerArchivoEnInput(file) {
        var input = $('inputArchivoVideo');
        if (!input) return;
        try {
            var dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
        } catch (e) {}
    }

    /* Cambia el texto del botón de archivo según haya o no un video. */
    function actualizarTextoBotonArchivo(file) {
        var txt = $('csFileBtnTxt');
        var hint = $('csFileBtnHint');
        var btnWrap = document.querySelector('.cs-file-btn-wrap');

        if (file) {
            if (txt) {
                txt.removeAttribute('data-clave');
                txt.textContent = 'Video seleccionado';
            }
            if (hint) {
                hint.removeAttribute('data-clave');
                hint.textContent = 'Listo para subir';
            }
            if (btnWrap) btnWrap.classList.add('cs-file-con-archivo');
            var pWrap = $('csPreviewWrap');
            if (pWrap) pWrap.style.display = 'block';
        } else {
            if (txt) {
                txt.setAttribute('data-clave', 'videos_elegir_galeria');
                txt.textContent = vt('videos_elegir_galeria', 'Elegir video de la galería');
            }
            if (hint) {
                hint.setAttribute('data-clave', 'videos_archivo_hint');
                hint.textContent = vt('videos_archivo_hint', 'MP4 · WebM · MOV · Máx 100 MB');
            }
            if (btnWrap) btnWrap.classList.remove('cs-file-con-archivo');
        }
    }

    /* Oculta el input original y pone en su lugar el botón plano.
       El estilo del botón está en videos-composer-pro.css. */
    function transformarInputArchivo(scope) {
        var input = (scope && scope.querySelector('#inputArchivoVideo')) || $('inputArchivoVideo');
        if (!input) {
            U.warn('inputArchivoVideo no encontrado');
            return;
        }
        if (input.dataset.csTransformado === '1') return;
        input.dataset.csTransformado = '1';

        input.style.setProperty('display', 'none', 'important');
        input.style.setProperty('visibility', 'hidden', 'important');
        input.style.setProperty('position', 'absolute', 'important');
        input.style.setProperty('width', '0', 'important');
        input.style.setProperty('height', '0', 'important');
        input.style.setProperty('opacity', '0', 'important');
        input.style.setProperty('pointer-events', 'none', 'important');
        input.setAttribute('tabindex', '-1');
        input.setAttribute('aria-hidden', 'true');

        var btnWrap = document.createElement('div');
        btnWrap.className = 'cs-file-btn-wrap';
        btnWrap.innerHTML =
            '<button type="button" class="cs-file-btn" id="csFileBtnVideo" aria-label="Elegir video de la galería">' +
                '<span class="cs-file-btn-ico" aria-hidden="true">▶</span>' +
                '<span class="cs-file-btn-txt" id="csFileBtnTxt" data-clave="videos_elegir_galeria">Elegir video de la galería</span>' +
                '<span class="cs-file-btn-hint" id="csFileBtnHint" data-clave="videos_archivo_hint">MP4 · WebM · MOV · Máx 100 MB</span>' +
            '</button>';
        if (input.parentNode) input.parentNode.insertBefore(btnWrap, input.nextSibling);

        btnWrap.querySelector('#csFileBtnVideo').addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            input.click();
        });

        U.log('Input file transformado en botón plano');
    }

    /* Cuando el usuario elige un archivo: lo muestra y lo guarda en borradores. */
    function engancharInputArchivo() {
        var input = $('inputArchivoVideo');
        if (!input) return;
        if (input.dataset.csPublicarEnganchado === '1') return;
        input.dataset.csPublicarEnganchado = '1';

        input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            if (!file) return;

            S.archivoVideo = file;
            S.archivoPathRemoto = null;
            S.portadaPathRemoto = null;
            S.archivoConAudioMezclado = window.__csArchivoConAudioMezclado === true;

            mostrarPreviewVideo(file);
            actualizarTextoBotonArchivo(file);
            llamar('borradores', 'persistirArchivo');
            llamar('borradores', 'persistirMetaDebounced');
            U.log('Preview listo para:', file.name);
        });
    }

    /* ----------------------------------------------------------------
       PORTADA Y PREVIEW DEL VIDEO
       ---------------------------------------------------------------- */

    /* Portada del video: un fotograma a 0.1 s, o la captura de la cámara si existe. */
    function obtenerPortada(file) {
        return new Promise(function (resolve) {
            var desdeCamara = window.__csMiniaturaCamara;
            if (desdeCamara && file.name.indexOf('video-camara-') === 0) {
                resolve(desdeCamara);
                return;
            }

            var url = U.crearObjectURL(file);
            var v = document.createElement('video');
            v.muted = true;
            v.playsInline = true;
            v.preload = 'auto';
            v.src = url;

            var terminado = false;

            function terminar(blob) {
                if (terminado) return;
                terminado = true;
                try { v.pause(); } catch (e) {}
                v.removeAttribute('src');
                try { v.load(); } catch (e) {}
                U.revocarObjectURL(url);
                resolve(blob || null);
            }

            var limite = setTimeout(function () { terminar(null); }, C.CONFIG.PORTADA_TIMEOUT_MS);

            v.addEventListener('loadeddata', function () {
                var destino = (isFinite(v.duration) && v.duration > 0.2) ? 0.1 : 0.001;
                try {
                    v.currentTime = destino;
                } catch (e) {
                    clearTimeout(limite);
                    terminar(null);
                }
            });

            v.addEventListener('seeked', function () {
                clearTimeout(limite);
                try {
                    var canvas = document.createElement('canvas');
                    var w = v.videoWidth || 540;
                    var h = v.videoHeight || 960;
                    var escala = Math.min(1, 480 / w);
                    canvas.width = Math.round(w * escala);
                    canvas.height = Math.round(h * escala);
                    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob(function (blob) { terminar(blob); }, 'image/jpeg', 0.85);
                } catch (e) {
                    terminar(null);
                }
            });

            v.addEventListener('error', function () {
                clearTimeout(limite);
                terminar(null);
            });
        });
    }

    /* Muestra una portada que viene de una URL (por ejemplo, un borrador). */
    function mostrarPortadaDesdeUrl(url) {
        var img = $('csPreviewPortada');
        if (!img) return;
        img.src = url;
        img.style.display = 'block';
    }

    /* Muestra o quita la portada de la vista previa y guarda su blob en el estado. */
    function mostrarPortadaEnPreview(blob) {
        var img = $('csPreviewPortada');
        if (!img) return;

        if (S.portadaURL) {
            U.revocarObjectURL(S.portadaURL);
            S.portadaURL = null;
        }

        S.portadaBlob = blob || null;

        if (blob) {
            S.portadaURL = U.crearObjectURL(blob);
            img.src = S.portadaURL;
            img.style.display = 'block';
        } else {
            img.removeAttribute('src');
            img.style.display = 'none';
        }
    }

    /* Carga el video en la vista previa de la publicación y calcula su portada. */
    function mostrarPreviewVideo(file) {
        var v = $('csPreviewVideo');
        var wrap = $('csPreviewWrap');
        if (!v) return;

        if (wrap) wrap.style.display = 'block';

        if (S.previewURL) {
            U.revocarObjectURL(S.previewURL);
            S.previewURL = null;
        }
        S.previewURL = U.crearObjectURL(file);

        v.src = S.previewURL;
        v.muted = false;
        v.playsInline = true;
        v.controls = true;
        v.preload = 'metadata';
        v.style.display = 'block';
        try { v.load(); } catch (e) {}

        actualizarBotonQuitar(true);
        obtenerPortada(file).then(mostrarPortadaEnPreview);
    }

    /* Muestra u oculta la X de quitar y el botón de quitar según haya video. */
    function actualizarBotonQuitar(tieneVideo) {
        var tiene = typeof tieneVideo === 'boolean' ? tieneVideo : !!S.archivoVideo;
        var overlay = $('csQuitarVideo');
        var accion = $('csBtnQuitarVideo');
        var bloqueVideo = document.querySelector('#csPreviewWrap .cs-preview-video');

        if (overlay) overlay.style.display = tiene ? 'flex' : 'none';
        if (accion) accion.style.display = tiene ? '' : 'none';
        if (bloqueVideo) bloqueVideo.style.display = tiene ? '' : 'none';
    }

    /* Línea de sonido y ubicación debajo del video, y el badge de sonido. */
    function actualizarBadgePreview() {
        var badge = $('csPreviewBadge');
        if (!badge) return;
        badge.style.display = S.sonidoSeleccionado ? 'inline-flex' : 'none';
    }

    function actualizarResumenPreview() {
        var s = S.sonidoSeleccionado;
        var u = S.ubicacionSeleccionada;
        setTextoLinea($('csPreviewSonido'), s
            ? s.nombre + ' — ' + s.artista
            : vt('videos_preview_sin_sonido', 'Sin sonido'));
        setTextoLinea($('csPreviewUbicacion'), u
            ? U.textoUbicacion(u)
            : vt('videos_preview_sin_ubicacion', 'Sin ubicación'));
        actualizarBadgePreview();
    }

    /* Quita el video seleccionado. Conserva título, descripción, sonido y ubicación. */
    async function quitarVideoSeleccionado() {
        if (!S.archivoVideo) return;

        var ok = await NS.ui.csConfirm({
            titulo: 'Quitar video',
            mensaje: 'Se quitará el video seleccionado. Tu título, descripción, sonido y ubicación se conservan.',
            textoOk: 'Quitar',
            peligroso: true
        });
        if (!ok) return;

        cerrarPreview();

        S.archivoVideo = null;
        S.archivoConAudioMezclado = false;
        S.archivoPathRemoto = null;
        S.portadaPathRemoto = null;
        window.__csMiniaturaCamara = null;
        window.__csArchivoConAudioMezclado = false;

        var videoEl = $('csPreviewVideo');
        if (videoEl) {
            try { videoEl.pause(); } catch (e) {}
            videoEl.removeAttribute('src');
            try { videoEl.load(); } catch (e) {}
        }

        if (S.previewURL) {
            U.revocarObjectURL(S.previewURL);
            S.previewURL = null;
        }

        mostrarPortadaEnPreview(null);

        var input = $('inputArchivoVideo');
        if (input) {
            try { input.value = ''; } catch (e) {}
        }

        var wrap = $('csPreviewWrap');
        if (wrap) wrap.style.display = 'block';

        actualizarTextoBotonArchivo(null);
        actualizarBotonQuitar(false);

        await llamar('borradores', 'persistirArchivo');
        llamar('borradores', 'persistirMetaDebounced');
        NS.ui.csToast('Video quitado', 'success');
    }

    /* ----------------------------------------------------------------
       ESTRUCTURA DE LA VISTA PREVIA DENTRO DE LA PUBLICACIÓN
       ---------------------------------------------------------------- */

    function inyectarSeccionPreviewEnUpload() {
        var uploadSection = $('uploadSection');
        if (!uploadSection) return;
        if ($('csPreviewWrap')) return;

        var form = uploadSection.querySelector('form');
        if (!form) return;

        transformarInputArchivo(uploadSection);

        var wrap = document.createElement('div');
        wrap.id = 'csPreviewWrap';
        wrap.className = 'cs-preview-wrap';
        wrap.innerHTML =
            '<div class="cs-preview-video">' +
                '<img id="csPreviewPortada" alt="Portada del video" />' +
                '<video id="csPreviewVideo" controls playsinline preload="metadata"></video>' +
                '<div class="cs-preview-badge" id="csPreviewBadge" style="display:none;" data-clave="videos_sonido_video_badge">◆ Sonido + video</div>' +
                '<button type="button" id="csQuitarVideo" aria-label="Quitar video" title="Quitar video">✕</button>' +
            '</div>' +
            '<div class="cs-preview-meta">' +
                '<div class="cs-preview-line" id="csPreviewSonido">' +
                    '<span class="cs-ico">♪</span>' +
                    '<span class="cs-preview-txt" data-clave="videos_preview_sin_sonido">Sin sonido</span>' +
                '</div>' +
                '<div class="cs-preview-line" id="csPreviewUbicacion">' +
                    '<span class="cs-ico">◆</span>' +
                    '<span class="cs-preview-txt" data-clave="videos_preview_sin_ubicacion">Sin ubicación</span>' +
                '</div>' +
                '<div class="cs-preview-actions">' +
                    '<button type="button" class="cs-btn-ghost" id="csBtnVistaPrevia">' +
                        '<span class="cs-ico">▶</span> <span>Vista previa</span>' +
                    '</button>' +
                    '<button type="button" class="cs-btn-ghost" id="csBtnVerBorradores">' +
                        '<span class="cs-ico">◈</span> <span data-clave="videos_borradores_btn">Borradores</span>' +
                    '</button>' +
                    '<button type="button" class="cs-btn-ghost" id="csBtnGuardarBorrador">' +
                        '<span class="cs-ico">◇</span> <span data-clave="videos_guardar_borrador_btn">Guardar borrador</span>' +
                    '</button>' +
                    '<button type="button" class="cs-btn-ghost cs-btn-quitar" id="csBtnQuitarVideo">' +
                        '<span class="cs-ico">✕</span> <span>Quitar video</span>' +
                    '</button>' +
                '</div>' +
            '</div>';

        var grupos = form.querySelectorAll('.form-group');
        if (grupos.length > 0) form.insertBefore(wrap, grupos[grupos.length - 1]);
        else form.appendChild(wrap);

        wrap.style.display = 'none';
        NS.ui.asegurarMarca(wrap.querySelector('.cs-preview-video'));

        $('csBtnVistaPrevia').addEventListener('click', abrirPreview);
        $('csBtnVerBorradores').addEventListener('click', function () {
            llamar('sheets', 'abrirModalBorradores');
        });
        $('csBtnGuardarBorrador').addEventListener('click', function () {
            llamar('borradores', 'guardarBorrador');
        });
        $('csQuitarVideo').addEventListener('click', quitarVideoSeleccionado);
        $('csBtnQuitarVideo').addEventListener('click', quitarVideoSeleccionado);

        actualizarBotonQuitar(false);
    }

    /* ----------------------------------------------------------------
       VISTA PREVIA A PANTALLA COMPLETA
       ---------------------------------------------------------------- */

    /* Crea el modal la primera vez y conecta sus botones y el audio. */
    function inyectarModalPreview() {
        if ($('csModalPreview')) return;

        var d = document.createElement('div');
        d.id = 'csModalPreview';
        d.className = 'cs-prev-modal';
        d.innerHTML =
            '<div class="cs-prev-top">' +
                '<button type="button" class="cs-prev-close" id="csPrevCerrar" aria-label="Cerrar vista previa">✕</button>' +
                '<span class="cs-prev-titulo">Así se verá tu video</span>' +
                '<span class="cs-prev-spacer"></span>' +
            '</div>' +
            '<div class="cs-prev-stage">' +
                '<video id="csPrevVideo" playsinline loop></video>' +
                '<div class="cs-prev-sonido" id="csPrevSonido"></div>' +
            '</div>' +
            '<div class="cs-prev-acciones">' +
                '<button type="button" class="cs-btn-ghost" id="csPrevSeguir">Seguir editando</button>' +
                '<button type="button" class="cs-btn-primary" id="csPrevPublicar">Publicar ahora</button>' +
            '</div>';
        document.body.appendChild(d);

        NS.ui.asegurarMarca(d.querySelector('.cs-prev-stage'));

        $('csPrevCerrar').addEventListener('click', cerrarPreview);
        $('csPrevSeguir').addEventListener('click', cerrarPreview);
        $('csPrevPublicar').addEventListener('click', publicarDesdePreview);

        var v = $('csPrevVideo');

        v.addEventListener('click', function () {
            if (v.paused) v.play().catch(function () {});
            else v.pause();
        });

        /* El audio de la pista sigue al video: play, pause, seek y ajuste fino. */
        v.addEventListener('play', function () {
            if (pistaPreviewAudio) {
                pistaPreviewAudio.currentTime = v.currentTime;
                pistaPreviewAudio.play().catch(function () {});
            }
        });

        v.addEventListener('pause', function () {
            if (pistaPreviewAudio) pistaPreviewAudio.pause();
        });

        v.addEventListener('seeked', function () {
            if (pistaPreviewAudio) pistaPreviewAudio.currentTime = v.currentTime;
        });

        v.addEventListener('timeupdate', function () {
            if (pistaPreviewAudio && Math.abs(pistaPreviewAudio.currentTime - v.currentTime) > 0.4) {
                pistaPreviewAudio.currentTime = v.currentTime;
            }
        });
    }

    function detenerPistaPreview() {
        if (pistaPreviewAudio) {
            try {
                pistaPreviewAudio.pause();
                pistaPreviewAudio.removeAttribute('src');
                pistaPreviewAudio.load();
            } catch (e) {}
            pistaPreviewAudio = null;
        }
    }

    /* Abre la vista previa a pantalla completa con la pista elegida (si hay). */
    function abrirPreview() {
        if (!S.archivoVideo) {
            NS.ui.csToast('Primero elige o graba un video', 'warning');
            return;
        }

        inyectarModalPreview();
        if (!S.previewURL) mostrarPreviewVideo(S.archivoVideo);

        var v = $('csPrevVideo');
        var modal = $('csModalPreview');
        var etiqueta = $('csPrevSonido');
        var sonido = S.sonidoSeleccionado;

        detenerPistaPreview();
        v.src = S.previewURL;
        v.muted = !!sonido;
        v.currentTime = 0;

        if (sonido && U.urlSonidoValida(sonido.url)) {
            pistaPreviewAudio = new Audio(sonido.url);
            pistaPreviewAudio.preload = 'auto';
            pistaPreviewAudio.crossOrigin = 'anonymous';
            pistaPreviewAudio.volume = 0.9;
            etiqueta.textContent = '♪ ' + sonido.nombre + ' — ' + sonido.artista;
            etiqueta.style.display = 'block';
        } else {
            etiqueta.style.display = 'none';
        }

        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        v.play().catch(function () {});
    }

    function cerrarPreview() {
        var modal = $('csModalPreview');
        var v = $('csPrevVideo');
        if (v) {
            try { v.pause(); } catch (e) {}
        }
        detenerPistaPreview();
        if (modal) modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    /* ----------------------------------------------------------------
       PUBLICAR Y RESETEO DEL FORMULARIO
       ---------------------------------------------------------------- */

    function obtenerBotonPublicar() {
        var form = $('formSubirVideo');
        return $('btnSubirVideo') || (form ? form.querySelector('button[type="submit"]') : null);
    }

    /* Dispara el submit del formulario desde la vista previa. */
    function publicarDesdePreview() {
        if (S.subiendo) {
            NS.ui.csToast('Ya hay una publicación en curso', 'warning');
            return;
        }

        var form = $('formSubirVideo');
        var boton = obtenerBotonPublicar();
        if (!form || !boton) {
            NS.ui.csToast('No se encontró el botón de publicar', 'error');
            return;
        }

        S.subiendo = true;
        boton.disabled = true;
        cerrarPreview();

        try {
            if (typeof form.requestSubmit === 'function') form.requestSubmit(boton);
            else boton.click();
        } catch (e) {
            S.subiendo = false;
            boton.disabled = false;
            NS.ui.csToast('Error al iniciar publicación', 'error');
        }
    }

    /* Limpia el formulario y el estado después de publicar. */
    function resetFormularioPublicacion() {
        S.subiendo = false;

        var btnPub = obtenerBotonPublicar();
        if (btnPub) btnPub.disabled = false;

        var inputTitulo = $('inputTituloVideo');
        var inputDesc = $('inputDescripcionVideo');
        if (inputTitulo) inputTitulo.value = '';
        if (inputDesc) inputDesc.value = '';

        var inputArchivo = $('inputArchivoVideo');
        if (inputArchivo) {
            try { inputArchivo.value = ''; } catch (e) {}
        }

        var preview = $('csPreviewVideo');
        if (preview) {
            try { preview.pause(); } catch (e) {}
            preview.removeAttribute('src');
            try { preview.load(); } catch (e) {}
        }

        var wrap = $('csPreviewWrap');
        if (wrap) wrap.style.display = 'none';

        mostrarPortadaEnPreview(null);

        if (S.previewURL) {
            U.revocarObjectURL(S.previewURL);
            S.previewURL = null;
        }

        S.archivoVideo = null;
        S.archivoConAudioMezclado = false;
        llamar('borradores', 'resetEstadoBorrador');
        window.__csMiniaturaCamara = null;
        window.__csArchivoConAudioMezclado = false;

        NS.audio.detener();
        cerrarPreview();

        S.sonidoSeleccionado = null;
        S.ubicacionSeleccionada = null;

        setTextoLinea($('csPreviewSonido'), vt('videos_preview_sin_sonido', 'Sin sonido'));
        setTextoLinea($('csPreviewUbicacion'), vt('videos_preview_sin_ubicacion', 'Sin ubicación'));

        var badge = $('csPreviewBadge');
        if (badge) badge.style.display = 'none';

        actualizarTextoBotonArchivo(null);
        actualizarBotonQuitar(false);

        var progressEl = $('uploadProgress');
        var progressFill = $('progressFill');
        var progressText = $('progressText');
        if (progressEl) progressEl.style.display = 'none';
        if (progressFill) progressFill.style.width = '0%';
        setTexto(progressText, '0%');

        var pFill = $('processingProgressFill');
        var pText = $('processingProgressText');
        if (pFill) pFill.style.width = '0%';
        setTexto(pText, '0%');

        llamar('borradores', 'limpiarPersistencia');
        NS.ui.actualizarBotonesSonidoUbicacion();
        U.log('Formulario reseteado');
    }

    /* ----------------------------------------------------------------
       REFRESCO DEL FEED
       ---------------------------------------------------------------- */

    function dispararEventoRefresh() {
        try {
            window.dispatchEvent(new CustomEvent('csariels:videos:refresh'));
            U.log('Evento csariels:videos:refresh disparado');
        } catch (e) {
            U.warn('No se pudo disparar el evento:', e);
        }
    }

    /* Vuelve a cargar el feed. Si no existe cargarVideos, dispara un evento como respaldo. */
    function refrescarFeedAutomatico() {
        try {
            if (typeof window.cargarVideos === 'function') {
                U.log('Refrescando feed con cargarVideos()...');
                Promise.resolve(window.cargarVideos()).catch(function (e) {
                    U.warn('cargarVideos() falló, disparando evento:', e);
                    dispararEventoRefresh();
                });
                return;
            }
        } catch (e) {
            U.warn('Error llamando cargarVideos:', e);
        }
        dispararEventoRefresh();
    }

    /* ----------------------------------------------------------------
       LISTENERS GLOBALES
       ---------------------------------------------------------------- */

    /* Al publicar con éxito (evento que dispara videos-cola.js): limpia y refresca. */
    function engancharEventoPublicacionExitosa() {
        if (window.__csPublicacionListener) return;
        window.__csPublicacionListener = true;

        window.addEventListener('csariels:videos:publicado', function () {
            U.log('Evento publicado recibido: reseteando formulario y refrescando feed');
            S.subiendo = false;
            resetFormularioPublicacion();
            setTimeout(refrescarFeedAutomatico, 300);
        });
    }

    /* Al salir de la página: libera la vista previa y las URLs temporales. */
    function engancharLimpiezaAlSalir() {
        if (window.__csPreviewLimpieza) return;
        window.__csPreviewLimpieza = true;

        window.addEventListener('beforeunload', function () {
            NS.audio.detener();
            detenerPistaPreview();
            U.limpiarTodasLasURLs();
        });
    }

    /* ----------------------------------------------------------------
       ARRANQUE
       ---------------------------------------------------------------- */

    /* Llamado por videos-publicar.js (entrada), después de cargar todos los módulos. */
    function inicializar() {
        inyectarSeccionPreviewEnUpload();
        inyectarModalPreview();
        engancharInputArchivo();
        engancharEventoPublicacionExitosa();
        engancharLimpiezaAlSalir();
    }

    /* ----------------------------------------------------------------
       EXPOSICIÓN Y CONTRATO GLOBAL
       ---------------------------------------------------------------- */

    NS.preview = {
        inicializar: inicializar,
        abrirPreview: abrirPreview,
        cerrarPreview: cerrarPreview,
        publicarDesdePreview: publicarDesdePreview,
        mostrarPreviewVideo: mostrarPreviewVideo,
        mostrarPortadaEnPreview: mostrarPortadaEnPreview,
        mostrarPortadaDesdeUrl: mostrarPortadaDesdeUrl,
        obtenerPortada: obtenerPortada,
        actualizarResumenPreview: actualizarResumenPreview,
        actualizarBadgePreview: actualizarBadgePreview,
        actualizarBotonQuitar: actualizarBotonQuitar,
        actualizarTextoBotonArchivo: actualizarTextoBotonArchivo,
        ponerArchivoEnInput: ponerArchivoEnInput,
        quitarVideoSeleccionado: quitarVideoSeleccionado,
        resetFormularioPublicacion: resetFormularioPublicacion,
        refrescarFeedAutomatico: refrescarFeedAutomatico
    };

    /* Contratos globales: los usan videos-cola.js, videos-camara.js y el HTML. */
    window.csResetFormularioPublicacion = resetFormularioPublicacion;
    window.csRefrescarFeedVideos = refrescarFeedAutomatico;
})();