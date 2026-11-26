/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · HOJAS (v1)
   ================================================================
   Cuarto módulo de la división de videos-publicar.js.
   - Hoja de sonidos: pestañas, búsqueda, filas con ecualizador,
     favoritos (localStorage) y botón "Usar este sonido".
   - Hoja de ubicaciones: lista, búsqueda y confirmación.
   - Contenedor de la hoja de borradores (el contenido lo pinta
     publicar-borradores.js).
   - Cierre por fondo, botón ✕ y tecla Escape.
   Las funciones de otros módulos se llaman solo al hacer clic:
     NS.preview.actualizarResumenPreview / cerrarPreview
     NS.borradores.renderBorradores / persistirMetaDebounced
   Expuesto en NS.sheets. Registra los listeners de audio al cargar.
   Requiere: publicar-base.js, publicar-ui.js, publicar-audio.js.
   ================================================================ */

(function () {
    'use strict';

    var NS = window.VideosPublicarNS;
    if (!NS || !NS.C || !NS.u || !NS.state || !NS.audio || !NS.ui) {
        console.error('[VideosPublicar] publicar-sheets.js requiere base, ui y audio.');
        return;
    }
    if (NS.sheets) return;

    var C = NS.C;
    var U = NS.u;
    var S = NS.state;
    var DATA = NS.DATA;
    var Z = C.Z;
    var $ = U.$;
    var esc = U.esc;
    var SONIDOS_SEED = DATA.SONIDOS_SEED;
    var UBICACIONES_SEED = DATA.UBICACIONES_SEED;
    var EQ_COLORES = C.EQ_COLORES;

    /* Llama una función de otro módulo solo si ya existe. Así este archivo
       no depende del orden de carga de los módulos posteriores. */
    function llamar(modulo, fn) {
        var args = Array.prototype.slice.call(arguments, 2);
        var m = NS[modulo];
        if (m && typeof m[fn] === 'function') return m[fn].apply(m, args);
        return undefined;
    }

    /* ----------------------------------------------------------------
       FAVORITOS (por dispositivo, en localStorage)
       ---------------------------------------------------------------- */

    function cargarFavoritos() {
        try {
            var arr = JSON.parse(localStorage.getItem(C.FAV_KEY) || '[]');
            return Array.isArray(arr)
                ? arr.filter(function (id) { return typeof id === 'string'; })
                : [];
        } catch (e) {
            return [];
        }
    }

    var favoritos = cargarFavoritos();

    function guardarFavoritos() {
        try { localStorage.setItem(C.FAV_KEY, JSON.stringify(favoritos)); } catch (e) {}
    }

    function esFavorito(id) {
        return favoritos.indexOf(id) !== -1;
    }

    function listaFavoritos() {
        return favoritos.map(U.buscarSonidoPorId).filter(Boolean);
    }

    function actualizarContadorFavoritos() {
        var n = listaFavoritos().length;
        document.querySelectorAll('.cs-tab-count[data-count="favoritos"]').forEach(function (el) {
            el.textContent = n > 0 ? String(n) : '';
            el.style.display = n > 0 ? 'inline-flex' : 'none';
        });
    }

    function alternarFavorito(id) {
        var i = favoritos.indexOf(id);
        if (i === -1) favoritos.push(id);
        else favoritos.splice(i, 1);
        guardarFavoritos();
        actualizarContadorFavoritos();
    }

    /* ----------------------------------------------------------------
       MOSTRAR Y OCULTAR HOJAS
       ---------------------------------------------------------------- */

    function mostrarSheet(sheetId, backdropId) {
        var sheet = $(sheetId);
        var backdrop = $(backdropId);
        if (!sheet || !backdrop) return;

        backdrop.style.setProperty('z-index', String(Z.SHEET_BACKDROP), 'important');
        sheet.style.setProperty('z-index', String(Z.SHEET), 'important');
        backdrop.classList.add('show');
        sheet.classList.add('show');
        document.body.style.overflow = 'hidden';

        if (typeof window.aplicarTraducciones === 'function') {
            try { window.aplicarTraducciones(sheet); } catch (e) {}
        }
    }

    function cerrarSheet(sheetId, backdropId) {
        var sheet = $(sheetId);
        var backdrop = $(backdropId);
        if (sheet) sheet.classList.remove('show');
        if (backdrop) backdrop.classList.remove('show');
        document.body.style.overflow = '';
    }

    /* Cierra las tres hojas. Detiene la vista previa solo si está sonando o cargando. */
    function cerrarTodosLosSheets() {
        var est = NS.audio.getEstado();
        if (est.estado === 'playing' || est.estado === 'loading') NS.audio.detener();

        cerrarSheet('csModalSonidos', 'csSheetSonidosBackdrop');
        cerrarSheet('csModalUbicacion', 'csSheetUbicacionBackdrop');
        cerrarSheet('csModalBorradores', 'csSheetBorradoresBackdrop');
    }

    function abrirModalSonidos() {
        renderSonidos(S.tabSonidosActiva, '');
        actualizarContadorFavoritos();
        var tiempo = S.sonidoSeleccionado ? (NS.audio.getTiempo() || null) : null;
        pintarFooterSonido(S.sonidoSeleccionado, tiempo);
        mostrarSheet('csModalSonidos', 'csSheetSonidosBackdrop');
    }

    function abrirModalUbicacion() {
        renderUbicaciones('');
        mostrarSheet('csModalUbicacion', 'csSheetUbicacionBackdrop');
    }

    /* El contenido de borradores lo pinta publicar-borradores.js. */
    function abrirModalBorradores() {
        llamar('borradores', 'renderBorradores');
        mostrarSheet('csModalBorradores', 'csSheetBorradoresBackdrop');
    }

    /* ----------------------------------------------------------------
       ESTADO DE REPRODUCCIÓN EN LAS FILAS
       ---------------------------------------------------------------- */

    /* Clase CSS de una fila según el estado de la vista previa. */
    function claseEstadoFila(id) {
        var actual = NS.audio.getEstado();
        if (!actual.pista || actual.pista.id !== id) return '';
        if (actual.estado === 'loading') return 'cs-cargando';
        if (actual.estado === 'playing') return 'cs-sonando';
        if (actual.estado === 'paused') return 'cs-pausado';
        if (actual.estado === 'error') return 'cs-error';
        return '';
    }

    /* Actualiza solo las clases de las filas visibles, sin volver a pintar la lista. */
    function actualizarIndicadorSonido(estado, pista, error) {
        document.querySelectorAll('#csSonidosLista .cs-sonido-item').forEach(function (el) {
            var esActivo = pista && el.dataset.sonidoId === pista.id;
            el.classList.remove('cs-sonando', 'cs-cargando', 'cs-pausado', 'cs-error');
            if (!esActivo) return;
            if (estado === 'loading') el.classList.add('cs-cargando');
            else if (estado === 'playing') el.classList.add('cs-sonando');
            else if (estado === 'paused') el.classList.add('cs-pausado');
            else if (estado === 'error') el.classList.add('cs-error');
        });

        if (estado === 'error') {
            var mensaje = error && error.indexOf('timeout') !== -1
                ? 'La pista tardó demasiado en cargar.'
                : 'No se pudo reproducir esta pista.';
            NS.ui.csToast(mensaje, 'error', 3500);
        }

        if (estado === 'loading' || estado === 'playing' || estado === 'paused') {
            actualizarTiempoFooter();
        }
    }

    /* ----------------------------------------------------------------
       BARRA INFERIOR DEL SHEET DE SONIDOS
       ---------------------------------------------------------------- */

    /* Tiempo transcurrido / total y progreso de la pista. */
    function pintarFooterSonido(pista, tiempo) {
        var txt = $('csSonidoTiempo');
        var prog = $('csSonidoProg');
        if (!txt || !prog) return;

        if (!pista) {
            txt.textContent = '0:00 / 0:00';
            prog.style.width = '0%';
            return;
        }

        var coincide = tiempo && tiempo.pista && tiempo.pista.id === pista.id;
        var actual = coincide ? tiempo.actual : 0;
        var total = coincide ? tiempo.total : (pista.duracion || 0);

        txt.textContent = U.fmtDuracion(actual) + ' / ' + U.fmtDuracion(total);
        var pct = total > 0 ? Math.min(100, (actual / total) * 100) : 0;
        prog.style.width = pct + '%';
    }

    function actualizarTiempoFooter() {
        var t = NS.audio.getTiempo();
        if (!t) return;
        pintarFooterSonido(t.pista, t);
    }

    /* ----------------------------------------------------------------
       FILAS DE LA LISTA DE SONIDOS
       ---------------------------------------------------------------- */

    function filaEqualizador() {
        var barras = EQ_COLORES.map(function (color) {
            return '<span class="cs-eq-bar" style="--eq-c:' + color + '"></span>';
        }).join('');
        return '<span class="cs-eq" aria-hidden="true">' + barras + '</span>';
    }

    function filaSonidoHTML(s, indice) {
        var activo = S.sonidoSeleccionado && S.sonidoSeleccionado.id === s.id;
        var g = U.generoDe(s);
        var fav = esFavorito(s.id);

        var clases = ['cs-sonido-item'];
        if (activo) clases.push('activo');
        var estadoClase = claseEstadoFila(s.id);
        if (estadoClase) clases.push(estadoClase);

        return '' +
            '<div class="' + clases.join(' ') + '" tabindex="0" data-sonido-id="' + esc(s.id) +
                '" style="--i:' + Math.min(indice, 12) + '">' +
                '<span class="cs-sonido-art" data-art-id="' + esc(s.id) + '" style="background:' + g.bg +
                    '" role="button" aria-label="Reproducir o pausar">' +
                    '<span class="cs-sonido-glyph" aria-hidden="true">' + g.glyph + '</span>' +
                    '<span class="cs-sonido-play-ico" aria-hidden="true">▶</span>' +
                    filaEqualizador() +
                '</span>' +
                '<span class="cs-sonido-info">' +
                    '<span class="cs-sonido-nombre">' + esc(s.nombre) + '</span>' +
                    '<span class="cs-sonido-artista">' + esc(s.artista) + ' · ' +
                        '<span class="cs-sonido-genero">' + esc(g.label) + '</span> · ' +
                        esc(U.fmtDuracion(s.duracion)) +
                    '</span>' +
                '</span>' +
                '<button type="button" class="cs-fav-btn ' + (fav ? 'on' : '') + '" data-fav-id="' + esc(s.id) +
                    '" aria-pressed="' + (fav ? 'true' : 'false') + '" aria-label="' +
                    (fav ? 'Quitar de favoritos' : 'Guardar en favoritos') + '">' + (fav ? '♥' : '♡') + '</button>' +
                '<span class="cs-sonido-check" aria-hidden="true">◆</span>' +
            '</div>';
    }

    function mensajeVacioSonidos(term) {
        if (term) {
            return '<div class="cs-vacio"><span class="cs-ico-vacio">♪</span><p>' +
                esc(U.vt('videos_sin_resultados', 'Sin resultados.')) + '</p></div>';
        }
        if (S.tabSonidosActiva === 'favoritos') {
            return '<div class="cs-vacio-favs"><span class="cs-vacio-ico">♡</span><p>' +
                esc(U.vt('videos_fav_vacio', 'Aún no tienes favoritos. Toca ♡ en cualquier sonido para guardarlo aquí.')) +
                '</p></div>';
        }
        return '<div class="cs-vacio"><span class="cs-ico-vacio">♪</span><p>' +
            esc(U.vt('videos_sin_pistas', 'Sin pistas en esta sección.')) + '</p></div>';
    }

    /* Pinta la lista de la pestaña indicada, filtrada por el texto de búsqueda. */
    function renderSonidos(tab, filtro) {
        S.tabSonidosActiva = tab || 'parati';
        var lista = $('csSonidosLista');
        if (!lista) return;

        document.querySelectorAll('#csModalSonidos .cs-tab').forEach(function (t) {
            t.classList.toggle('active', t.dataset.tab === S.tabSonidosActiva);
        });

        var term = (filtro || '').toLowerCase().trim();
        var arr = S.tabSonidosActiva === 'favoritos'
            ? listaFavoritos()
            : (SONIDOS_SEED[S.tabSonidosActiva] || []);

        if (term) {
            arr = arr.filter(function (s) {
                var etiqueta = (s.nombre + ' ' + s.artista + ' ' + U.generoDe(s).label).toLowerCase();
                return etiqueta.indexOf(term) !== -1;
            });
        }

        if (!arr.length) {
            lista.innerHTML = mensajeVacioSonidos(term);
            return;
        }

        lista.innerHTML = arr.map(function (s, i) { return filaSonidoHTML(s, i); }).join('');
        lista.scrollTop = 0;
    }

    /* Actualiza el ♥/♡ de un botón sin volver a pintar la lista. */
    function pintarBotonFav(btn, activo) {
        btn.classList.toggle('on', activo);
        btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
        btn.setAttribute('aria-label', activo ? 'Quitar de favoritos' : 'Guardar en favoritos');
        btn.textContent = activo ? '♥' : '♡';
    }

    /* Toca el icono: reproduce, pausa o reanuda según el estado. */
    function togglePreview(id) {
        var actual = NS.audio.getEstado();
        if (actual.pista && actual.pista.id === id) {
            if (actual.estado === 'playing') NS.audio.pausar();
            else if (actual.estado === 'paused') NS.audio.reanudar();
            return;
        }
        previsualizarSonido(id);
    }

    function previsualizarSonido(id) {
        var s = U.buscarSonidoPorId(id);
        if (!s) return;
        NS.audio.reproducir(s);
    }

    /* Selecciona una pista desde la fila: la reproduce 5 s y la marca como elegida. */
    function seleccionarSonido(id) {
        var s = U.buscarSonidoPorId(id);
        if (!s) return;

        S.sonidoSeleccionado = s;
        NS.audio.reproducir(s);

        document.querySelectorAll('#csSonidosLista .cs-sonido-item').forEach(function (el) {
            el.classList.toggle('activo', el.dataset.sonidoId === id);
        });

        var info = $('csSonidoActualInfo');
        if (info) {
            info.removeAttribute('data-clave');
            info.textContent = s.nombre + ' — ' + s.artista;
        }

        var btn = $('csBtnConfirmarSonido');
        if (btn) btn.disabled = false;

        pintarFooterSonido(s, NS.audio.getTiempo());
    }

    /* Fija una pista elegida sin reproducirla (al restaurar o abrir un borrador). */
    function seleccionarSonidoSinSonar(s) {
        S.sonidoSeleccionado = s;
        var info = $('csSonidoActualInfo');
        if (info) {
            info.removeAttribute('data-clave');
            info.textContent = s.nombre + ' — ' + s.artista;
        }
        var btn = $('csBtnConfirmarSonido');
        if (btn) btn.disabled = false;
    }

    /* Botón "Usar este sonido". */
    function confirmarSonido() {
        llamar('preview', 'actualizarResumenPreview');
        NS.ui.actualizarBotonesSonidoUbicacion();
        llamar('borradores', 'persistirMetaDebounced');

        var s = S.sonidoSeleccionado;
        var valido = s && U.urlSonidoValida(s.url) ? s : null;

        window.dispatchEvent(new CustomEvent('csariels:sonido:seleccionado', {
            detail: valido
                ? { id: valido.id, nombre: valido.nombre, artista: valido.artista, url: valido.url, duracion: valido.duracion }
                : null
        }));

        cerrarTodosLosSheets();
    }

    /* ----------------------------------------------------------------
       HOJA DE UBICACIONES
       ---------------------------------------------------------------- */

    function renderUbicaciones(filtro) {
        var lista = $('csUbicacionesLista');
        if (!lista) return;

        var term = (filtro || '').toLowerCase().trim();
        var arr = term
            ? UBICACIONES_SEED.filter(function (u) { return u.nombre.toLowerCase().indexOf(term) !== -1; })
            : UBICACIONES_SEED;

        if (arr.length === 0) {
            lista.innerHTML = '<div class="cs-vacio"><span class="cs-ico-vacio">◆</span><p data-clave="videos_sin_resultados">Sin resultados.</p></div>';
            return;
        }

        lista.innerHTML = arr.map(function (u) {
            var activo = S.ubicacionSeleccionada && S.ubicacionSeleccionada.id === u.id;
            return '' +
                '<button type="button" class="cs-ubicacion-item ' + (activo ? 'activo' : '') +
                    '" data-ubicacion-id="' + esc(u.id) + '">' +
                    '<span class="cs-ubicacion-ico">◆</span>' +
                    '<span class="cs-ubicacion-info">' +
                        '<span class="cs-ubicacion-nombre">' + esc(u.nombre) + '</span>' +
                        '<span class="cs-ubicacion-pais">' + esc(u.pais) + '</span>' +
                    '</span>' +
                    '<span class="cs-ubicacion-check">◆</span>' +
                '</button>';
        }).join('');
    }

    function seleccionarUbicacion(id) {
        var u = UBICACIONES_SEED.find ? UBICACIONES_SEED.find(function (x) { return x.id === id; }) : null;
        if (!u) {
            for (var i = 0; i < UBICACIONES_SEED.length; i++) {
                if (UBICACIONES_SEED[i].id === id) { u = UBICACIONES_SEED[i]; break; }
            }
        }
        if (!u) return;

        S.ubicacionSeleccionada = u;

        document.querySelectorAll('.cs-ubicacion-item').forEach(function (el) {
            el.classList.toggle('activo', el.dataset.ubicacionId === id);
        });

        var info = $('csUbicacionActualInfo');
        if (info) {
            info.removeAttribute('data-clave');
            info.textContent = U.textoUbicacion(u);
        }

        var btn = $('csBtnConfirmarUbicacion');
        if (btn) btn.disabled = false;
    }

    /* Botón "Usar esta ubicación". */
    function confirmarUbicacion() {
        llamar('preview', 'actualizarResumenPreview');
        NS.ui.actualizarBotonesSonidoUbicacion();
        llamar('borradores', 'persistirMetaDebounced');
        cerrarTodosLosSheets();
    }

    /* ----------------------------------------------------------------
       ESTRUCTURA DE LAS HOJAS (se inyecta una vez)
       ---------------------------------------------------------------- */

    function inyectarModales() {
        if ($('csModalSonidos')) return;

        var contenedor = document.createElement('div');
        contenedor.innerHTML = '' +
            '<div class="cs-sheet-backdrop" id="csSheetSonidosBackdrop"></div>' +
            '<div class="cs-sheet" id="csModalSonidos" role="dialog" aria-modal="true" aria-label="Biblioteca de sonidos">' +
                '<div class="cs-sheet-handle"></div>' +
                '<div class="cs-sheet-header">' +
                    '<div class="cs-sheet-titulo"><span class="cs-ico">♪</span><span data-clave="videos_agregar_sonido">Agregar sonido</span></div>' +
                    '<button type="button" class="cs-sheet-close" aria-label="Cerrar" data-cs-close="sonidos">✕</button>' +
                '</div>' +
                '<div class="cs-tabs" role="tablist">' +
                    '<button type="button" role="tab" class="cs-tab active" data-tab="parati"><span data-clave="videos_sonidos_parati">Para ti</span></button>' +
                    '<button type="button" role="tab" class="cs-tab" data-tab="populares"><span data-clave="videos_sonidos_populares">Populares</span></button>' +
                    '<button type="button" role="tab" class="cs-tab" data-tab="favoritos"><span data-clave="videos_sonidos_favoritos">Favoritos</span><span class="cs-tab-count" data-count="favoritos"></span></button>' +
                '</div>' +
                '<div class="cs-sheet-body">' +
                    '<div class="cs-sheet-fijo">' +
                        '<div class="cs-buscar-wrap">' +
                            '<span class="cs-ico-buscar">◇</span>' +
                            '<input type="text" id="csBuscarSonido" data-placeholder="videos_buscar_sonido" placeholder="Buscar pista o artista..." autocomplete="off" />' +
                        '</div>' +
                    '</div>' +
                    '<div class="cs-sonidos-lista" id="csSonidosLista"></div>' +
                '</div>' +
                '<div class="cs-sheet-footer cs-footer-sonido">' +
                    '<div class="cs-footer-info">' +
                        '<div class="cs-sonido-actual" id="csSonidoActualInfo" data-clave="videos_sonido_sin_sel">Sin sonido seleccionado</div>' +
                        '<div class="cs-sonido-meta">' +
                            '<span class="cs-sonido-tiempo" id="csSonidoTiempo">0:00 / 0:00</span>' +
                            '<div class="cs-sonido-prog"><span id="csSonidoProg"></span></div>' +
                        '</div>' +
                    '</div>' +
                    '<button type="button" class="cs-btn-primary" id="csBtnConfirmarSonido" disabled data-clave="videos_btn_usar_sonido">Usar este sonido</button>' +
                '</div>' +
            '</div>' +

            '<div class="cs-sheet-backdrop" id="csSheetUbicacionBackdrop"></div>' +
            '<div class="cs-sheet" id="csModalUbicacion" role="dialog" aria-modal="true" aria-label="Seleccionar ubicación">' +
                '<div class="cs-sheet-handle"></div>' +
                '<div class="cs-sheet-header">' +
                    '<div class="cs-sheet-titulo"><span class="cs-ico">◆</span><span data-clave="videos_ubicacion_btn">Ubicación</span></div>' +
                    '<button type="button" class="cs-sheet-close" aria-label="Cerrar" data-cs-close="ubicacion">✕</button>' +
                '</div>' +
                '<div class="cs-sheet-body">' +
                    '<div class="cs-sheet-fijo">' +
                        '<div class="cs-buscar-wrap">' +
                            '<span class="cs-ico-buscar">◇</span>' +
                            '<input type="text" id="csBuscarUbicacion" data-placeholder="videos_buscar_ubicacion" placeholder="Buscar ciudad o municipio..." autocomplete="off" />' +
                        '</div>' +
                    '</div>' +
                    '<div class="cs-ubicaciones-lista" id="csUbicacionesLista"></div>' +
                '</div>' +
                '<div class="cs-sheet-footer">' +
                    '<div class="cs-ubicacion-actual" id="csUbicacionActualInfo" data-clave="videos_ubicacion_sin_sel">Sin ubicación seleccionada</div>' +
                    '<button type="button" class="cs-btn-primary" id="csBtnConfirmarUbicacion" disabled data-clave="videos_btn_usar_ubicacion">Usar esta ubicación</button>' +
                '</div>' +
            '</div>' +

            '<div class="cs-sheet-backdrop" id="csSheetBorradoresBackdrop"></div>' +
            '<div class="cs-sheet" id="csModalBorradores" role="dialog" aria-modal="true" aria-label="Borradores">' +
                '<div class="cs-sheet-handle"></div>' +
                '<div class="cs-sheet-header">' +
                    '<div class="cs-sheet-titulo"><span class="cs-ico">◈</span><span data-clave="videos_borradores_titulo">Mis borradores</span></div>' +
                    '<button type="button" class="cs-sheet-close" aria-label="Cerrar" data-cs-close="borradores">✕</button>' +
                '</div>' +
                '<div class="cs-sheet-body">' +
                    '<div id="csBorradoresLista" class="cs-borradores-lista">' +
                        '<div class="cs-vacio">' +
                            '<span class="cs-ico-vacio">◈</span>' +
                            '<p data-clave="videos_borradores_vacio">Aún no tienes borradores.</p>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        while (contenedor.firstChild) document.body.appendChild(contenedor.firstChild);

        engancharListaSonidos();
        engancharListaUbicaciones();
    }

    /* Un solo listener delegado para toda la lista de sonidos. */
    function engancharListaSonidos() {
        var lista = $('csSonidosLista');
        if (!lista || lista.dataset.enganchada === '1') return;
        lista.dataset.enganchada = '1';

        lista.addEventListener('click', function (e) {
            var fav = e.target.closest('[data-fav-id]');
            if (fav) {
                e.stopPropagation();
                var id = fav.dataset.favId;
                alternarFavorito(id);
                pintarBotonFav(fav, esFavorito(id));
                if (S.tabSonidosActiva === 'favoritos') {
                    renderSonidos('favoritos', ($('csBuscarSonido') || {}).value || '');
                }
                return;
            }

            var art = e.target.closest('[data-art-id]');
            if (art) {
                e.stopPropagation();
                togglePreview(art.dataset.artId);
                return;
            }

            var fila = e.target.closest('[data-sonido-id]');
            if (fila) seleccionarSonido(fila.dataset.sonidoId);
        });

        lista.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var fila = e.target.closest && e.target.closest('.cs-sonido-item');
            if (!fila) return;
            e.preventDefault();
            seleccionarSonido(fila.dataset.sonidoId);
        });
    }

    function engancharListaUbicaciones() {
        var lista = $('csUbicacionesLista');
        if (!lista || lista.dataset.enganchada === '1') return;
        lista.dataset.enganchada = '1';

        lista.addEventListener('click', function (e) {
            var item = e.target.closest('[data-ubicacion-id]');
            if (item) seleccionarUbicacion(item.dataset.ubicacionId);
        });
    }

    /* ----------------------------------------------------------------
       LISTENERS GLOBALES DE LAS HOJAS (una sola vez)
       ---------------------------------------------------------------- */

    function engancharGlobales() {
        if (window.__csSheetsListeners) return;
        window.__csSheetsListeners = true;

        /* Cerrar por fondo o por botón ✕. */
        document.body.addEventListener('click', function (e) {
            var t = e.target;
            if (t.classList && t.classList.contains('cs-sheet-backdrop')) cerrarTodosLosSheets();
            if (t.closest && t.closest('[data-cs-close]')) cerrarTodosLosSheets();
        });

        /* Escape cierra las hojas y la vista previa. */
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                cerrarTodosLosSheets();
                llamar('preview', 'cerrarPreview');
            }
        });

        /* Cambio de pestaña: solo vuelve a pintar si la pestaña es distinta. */
        document.addEventListener('click', function (e) {
            var tab = e.target.closest && e.target.closest('#csModalSonidos .cs-tab[data-tab]');
            if (!tab) return;
            if (tab.dataset.tab === S.tabSonidosActiva) return;
            renderSonidos(tab.dataset.tab, ($('csBuscarSonido') || {}).value || '');
        });

        var buscarSonidoDeb = U.debouncer(function (valor) {
            renderSonidos(S.tabSonidosActiva, valor);
        }, 120);

        var buscarUbicacionDeb = U.debouncer(function (valor) {
            renderUbicaciones(valor);
        }, 120);

        document.addEventListener('input', function (e) {
            if (!e.target) return;
            if (e.target.id === 'csBuscarSonido') buscarSonidoDeb(e.target.value);
            if (e.target.id === 'csBuscarUbicacion') buscarUbicacionDeb(e.target.value);
        });

        document.addEventListener('click', function (e) {
            if (e.target && e.target.id === 'csBtnConfirmarSonido') confirmarSonido();
            if (e.target && e.target.id === 'csBtnConfirmarUbicacion') confirmarUbicacion();
        });
    }

    /* ----------------------------------------------------------------
       ARRANQUE
       ---------------------------------------------------------------- */

    /* Llamado por publicar-videos entrada, después de cargar todos los módulos. */
    function inicializar() {
        inyectarModales();
        engancharGlobales();
        actualizarContadorFavoritos();
    }

    /* Registra los avisos de audio: el estado cambia las filas y el tick actualiza la barra. */
    NS.audio.setListeners({
        estado: actualizarIndicadorSonido,
        tick: actualizarTiempoFooter
    });

    /* ----------------------------------------------------------------
       EXPOSICIÓN
       ---------------------------------------------------------------- */

    NS.sheets = {
        inicializar: inicializar,
        abrirModalSonidos: abrirModalSonidos,
        abrirModalUbicacion: abrirModalUbicacion,
        abrirModalBorradores: abrirModalBorradores,
        mostrarSheet: mostrarSheet,
        cerrarSheet: cerrarSheet,
        cerrarTodosLosSheets: cerrarTodosLosSheets,
        renderSonidos: renderSonidos,
        renderUbicaciones: renderUbicaciones,
        seleccionarSonido: seleccionarSonido,
        seleccionarSonidoSinSonar: seleccionarSonidoSinSonar,
        seleccionarUbicacion: seleccionarUbicacion,
        confirmarSonido: confirmarSonido,
        confirmarUbicacion: confirmarUbicacion,
        actualizarTiempoFooter: actualizarTiempoFooter,
        actualizarContadorFavoritos: actualizarContadorFavoritos,
        esFavorito: esFavorito,
        listaFavoritos: listaFavoritos
    };
})();