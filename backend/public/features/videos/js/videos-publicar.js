/* ================================================================
   CSARIEL'S · VIDEOS · MÓDULO PUBLICAR v2.4 NEON RGB
   ================================================================
   ACTUALIZACIÓN VISUAL:
   - Ecualizador RGB con colores neón animados.
   - Frecuencias multicolor sincronizadas con el audio.
   - Efectos de luces tipo antro: cian, magenta, violeta,
     azul eléctrico, verde lima, naranja y amarillo.
   - Tarjetas de sonidos con bordes luminosos y gradientes.
   - Indicador animado de reproducción.
   - Buscador mejorado.
   - Favoritos persistentes en localStorage.
   - Pestañas Para ti, Populares y Favoritos.
   - Vista previa de audio de 5 segundos.
   - Conserva la API pública VideosPublicar.
   ================================================================ */

(function () {
    'use strict';

    if (window.__csarielsVideosPublicarNeonLoaded) return;
    window.__csarielsVideosPublicarNeonLoaded = true;

    var COLORES_NEON = [
        '#FF2D95',
        '#FF3D71',
        '#FF8A00',
        '#FFE600',
        '#8BFF00',
        '#00FFC8',
        '#00D9FF',
        '#397BFF',
        '#9B5CFF',
        '#E34DFF'
    ];

    var ESTILOS_NEON = `
        /* ========================================================
           CSARIEL'S NEON RGB · BIBLIOTECA DE SONIDOS
           ======================================================== */

        #csModalSonidos {
            background:
                radial-gradient(ellipse at 10% 0%, rgba(255,45,149,.13), transparent 38%),
                radial-gradient(ellipse at 90% 15%, rgba(0,217,255,.12), transparent 35%),
                radial-gradient(ellipse at 50% 100%, rgba(155,92,255,.12), transparent 42%),
                #101018 !important;
            color: #F7F7FF !important;
            border: 1px solid rgba(255,255,255,.12) !important;
            box-shadow:
                0 -8px 45px rgba(0,0,0,.55),
                0 0 25px rgba(155,92,255,.10) !important;
        }

        #csModalSonidos .cs-sheet-handle {
            background: linear-gradient(
                90deg,
                #FF2D95,
                #9B5CFF,
                #00D9FF,
                #8BFF00
            ) !important;
            box-shadow: 0 0 12px rgba(155,92,255,.45);
        }

        #csModalSonidos .cs-sheet-header {
            background: rgba(15,15,25,.92) !important;
            border-bottom: 1px solid rgba(255,255,255,.09) !important;
        }

        #csModalSonidos .cs-sheet-titulo {
            color: #FFFFFF !important;
            font-weight: 800 !important;
            letter-spacing: .3px;
        }

        #csModalSonidos .cs-sheet-titulo .cs-ico {
            color: #FF3DAD !important;
            text-shadow: 0 0 12px rgba(255,45,149,.8);
        }

        #csModalSonidos .cs-sheet-close {
            color: #FFFFFF !important;
            border: 1px solid rgba(255,255,255,.15) !important;
            background: rgba(255,255,255,.06) !important;
            border-radius: 50% !important;
            transition: .25s ease;
        }

        #csModalSonidos .cs-sheet-close:hover {
            color: #00D9FF !important;
            border-color: #00D9FF !important;
            box-shadow: 0 0 15px rgba(0,217,255,.3);
        }

        #csModalSonidos .cs-tabs {
            background: rgba(10,10,17,.94) !important;
            border-bottom: 1px solid rgba(255,255,255,.08) !important;
        }

        #csModalSonidos .cs-tab {
            color: #A9A9C2 !important;
            transition: color .25s, background .25s;
        }

        #csModalSonidos .cs-tab:hover {
            color: #FFFFFF !important;
            background: rgba(255,255,255,.04) !important;
        }

        #csModalSonidos .cs-tab.active {
            color: #FFFFFF !important;
            border-bottom: 3px solid #FF3DAD !important;
            text-shadow: 0 0 12px rgba(255,45,149,.45);
            background: linear-gradient(
                0deg,
                rgba(255,45,149,.13),
                transparent
            ) !important;
        }

        #csModalSonidos .cs-buscar-wrap {
            background: rgba(255,255,255,.055) !important;
            border: 1px solid rgba(255,255,255,.13) !important;
            border-radius: 18px !important;
            transition: border-color .25s, box-shadow .25s;
        }

        #csModalSonidos .cs-buscar-wrap:focus-within {
            border-color: #00D9FF !important;
            box-shadow: 0 0 0 3px rgba(0,217,255,.10),
                        0 0 18px rgba(0,217,255,.12) !important;
        }

        #csModalSonidos .cs-buscar-wrap input {
            color: #FFFFFF !important;
            caret-color: #00D9FF;
        }

        #csModalSonidos .cs-buscar-wrap input::placeholder {
            color: #9696B2 !important;
        }

        #csModalSonidos .cs-ico-buscar {
            color: #00D9FF !important;
        }

        #csSonidosLista {
            padding: 7px 0 14px;
        }

        /* Tarjetas de pistas */

        #csSonidosLista .cs-sonido-item {
            position: relative;
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            min-height: 83px;
            margin: 7px 0;
            padding: 13px 14px;
            overflow: hidden;
            text-align: left;
            color: #FFFFFF !important;
            background:
                linear-gradient(115deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
                #171720 !important;
            border: 1px solid rgba(255,255,255,.09) !important;
            border-radius: 20px !important;
            transition:
                transform .22s ease,
                border-color .22s ease,
                box-shadow .22s ease,
                background .22s ease;
            -webkit-tap-highlight-color: transparent;
        }

        #csSonidosLista .cs-sonido-item::before {
            content: "";
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: 3px;
            opacity: 0;
            background: linear-gradient(
                180deg,
                #FF2D95,
                #9B5CFF,
                #00D9FF,
                #8BFF00
            );
            transition: opacity .25s ease;
        }

        #csSonidosLista .cs-sonido-item:active {
            transform: scale(.985);
        }

        #csSonidosLista .cs-sonido-item:hover {
            border-color: rgba(0,217,255,.4) !important;
            background:
                linear-gradient(110deg, rgba(0,217,255,.075), rgba(155,92,255,.045)),
                #191923 !important;
        }

        #csSonidosLista .cs-sonido-item.activo {
            border-color: rgba(255,45,149,.8) !important;
            background:
                linear-gradient(110deg, rgba(255,45,149,.14), rgba(155,92,255,.10)),
                #1A1724 !important;
            box-shadow:
                0 0 0 1px rgba(255,45,149,.10),
                0 0 20px rgba(255,45,149,.10) !important;
        }

        #csSonidosLista .cs-sonido-item.activo::before,
        #csSonidosLista .cs-sonido-item.cs-sonando::before {
            opacity: 1;
        }

        #csSonidosLista .cs-sonido-item.cs-sonando {
            border-color: rgba(0,217,255,.75) !important;
            box-shadow:
                0 0 0 1px rgba(0,217,255,.09),
                0 0 22px rgba(0,217,255,.13),
                inset 0 0 22px rgba(155,92,255,.045) !important;
        }

        #csSonidosLista .cs-sonido-info {
            display: flex;
            flex-direction: column;
            gap: 5px;
            flex: 1;
            min-width: 0;
            position: relative;
            z-index: 2;
        }

        #csSonidosLista .cs-sonido-nombre {
            color: #FFFFFF !important;
            font-size: .92rem;
            line-height: 1.25;
            font-weight: 800;
            letter-spacing: -.15px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #csSonidosLista .cs-sonido-artista {
            color: #A9B4CC !important;
            font-size: .75rem;
            line-height: 1.35;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* Botón de reproducción */

        #csSonidosLista .cs-sonido-play {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 46px;
            height: 46px;
            margin-right: 0;
            overflow: hidden;
            border: 1px solid rgba(155,92,255,.45) !important;
            border-radius: 50% !important;
            color: #FFFFFF !important;
            background:
                radial-gradient(circle at 35% 25%, rgba(255,255,255,.13), transparent 50%),
                linear-gradient(135deg, rgba(255,45,149,.18), rgba(57,123,255,.18)) !important;
            box-shadow: inset 0 0 12px rgba(155,92,255,.10);
            transition: .25s ease;
        }

        #csSonidosLista .cs-sonido-play:hover {
            border-color: #00D9FF !important;
            box-shadow: 0 0 15px rgba(0,217,255,.25);
        }

        #csSonidosLista .cs-sonido-ico {
            position: relative;
            z-index: 3;
            color: #FFFFFF !important;
            font-size: .85rem;
        }

        #csSonidosLista .cs-sonido-item.cs-sonando .cs-sonido-play {
            border-color: #00D9FF !important;
            background: linear-gradient(
                135deg,
                rgba(255,45,149,.28),
                rgba(155,92,255,.28),
                rgba(0,217,255,.25)
            ) !important;
            box-shadow:
                0 0 12px rgba(0,217,255,.28),
                inset 0 0 12px rgba(255,255,255,.06);
        }

        /* Ecualizador multicolor */

        #csSonidosLista .cs-eq {
            position: absolute;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            gap: 3px;
            z-index: 2;
            pointer-events: none;
        }

        #csSonidosLista .cs-eq-bar {
            display: block;
            width: 4px;
            height: 5px;
            min-height: 3px;
            border-radius: 5px;
            background: #FF2D95;
            box-shadow: 0 0 8px currentColor;
            transition: height .075s linear, background .15s linear;
            animation: cs-neon-dance .58s ease-in-out infinite alternate;
        }

        #csSonidosLista .cs-eq-bar:nth-child(1) {
            background: #FF2D95;
            color: #FF2D95;
            animation-delay: -.12s;
        }

        #csSonidosLista .cs-eq-bar:nth-child(2) {
            background: #9B5CFF;
            color: #9B5CFF;
            animation-delay: -.31s;
        }

        #csSonidosLista .cs-eq-bar:nth-child(3) {
            background: #00D9FF;
            color: #00D9FF;
            animation-delay: -.21s;
        }

        #csSonidosLista .cs-eq-bar:nth-child(4) {
            background: #8BFF00;
            color: #8BFF00;
            animation-delay: -.42s;
        }

        #csSonidosLista .cs-sonido-item.cs-sonando .cs-sonido-ico {
            display: none;
        }

        #csSonidosLista .cs-sonido-item.cs-sonando .cs-eq {
            display: flex;
        }

        #csSonidosLista .cs-sonido-item.cs-sonando .cs-eq-bar {
            animation-duration: .35s;
            box-shadow:
                0 0 5px currentColor,
                0 0 11px currentColor;
        }

        @keyframes cs-neon-dance {
            0% { transform: scaleY(.35); opacity: .7; }
            100% { transform: scaleY(1.6); opacity: 1; }
        }

        #csSonidosLista .cs-sonido-check {
            position: relative;
            z-index: 2;
            flex-shrink: 0;
            color: #85859C !important;
            font-size: .85rem;
            transition: .2s ease;
        }

        #csSonidosLista .cs-sonido-item.activo .cs-sonido-check {
            color: #FF3DAD !important;
            text-shadow: 0 0 10px rgba(255,45,149,.8);
        }

        #csSonidosLista .cs-sonido-item.cs-cargando .cs-sonido-ico {
            color: #00D9FF !important;
        }

        #csSonidosLista .cs-sonido-item.cs-error .cs-sonido-play {
            border-color: #FF426D !important;
            color: #FF426D !important;
        }

        /* Pie de la biblioteca */

        #csModalSonidos .cs-sheet-footer {
            background: rgba(12,12,20,.97) !important;
            border-top: 1px solid rgba(255,255,255,.10) !important;
            box-shadow: 0 -8px 24px rgba(0,0,0,.15);
        }

        #csModalSonidos .cs-sonido-actual {
            color: #C1C5D9 !important;
        }

        #csModalSonidos #csBtnConfirmarSonido {
            color: #FFFFFF !important;
            font-weight: 800 !important;
            border: 0 !important;
            border-radius: 25px !important;
            background: linear-gradient(
                110deg,
                #FF2D95,
                #A43CFF,
                #397BFF,
                #00BFEA
            ) !important;
            background-size: 200% 100% !important;
            box-shadow:
                0 4px 20px rgba(164,60,255,.22),
                0 0 12px rgba(255,45,149,.12);
            transition: transform .2s, background-position .3s, box-shadow .2s;
        }

        #csModalSonidos #csBtnConfirmarSonido:not(:disabled):hover {
            background-position: 100% 0 !important;
            box-shadow: 0 5px 25px rgba(0,217,255,.25);
            transform: translateY(-1px);
        }

        #csModalSonidos #csBtnConfirmarSonido:disabled {
            opacity: .38 !important;
            filter: saturate(.4);
        }

        /* Mensajes vacíos */

        #csModalSonidos .cs-vacio {
            color: #C1C5D9 !important;
            padding: 35px 15px;
        }

        #csModalSonidos .cs-ico-vacio {
            color: #FF3DAD !important;
            text-shadow: 0 0 15px rgba(255,45,149,.45);
        }

        /* Accesibilidad */

        @media (prefers-reduced-motion: reduce) {
            #csSonidosLista .cs-eq-bar {
                animation: none !important;
            }

            #csSonidosLista .cs-sonido-item,
            #csSonidosLista .cs-sonido-play {
                transition: none !important;
            }
        }
    `;

    function instalarEstilosNeon() {
        if (document.getElementById('csariels-neon-rgb-v24')) return;

        var estilo = document.createElement('style');
        estilo.id = 'csariels-neon-rgb-v24';
        estilo.textContent = ESTILOS_NEON;
        document.head.appendChild(estilo);
    }

    function obtenerFavoritos() {
        try {
            var datos = JSON.parse(localStorage.getItem('csariels_sonidos_favoritos') || '[]');
            return Array.isArray(datos) ? datos : [];
        } catch (e) {
            return [];
        }
    }

    function guardarFavoritos(ids) {
        try {
            localStorage.setItem('csariels_sonidos_favoritos', JSON.stringify(ids));
        } catch (e) {
            console.warn('[Csariel Neon] No se pudieron guardar favoritos:', e);
        }
    }

    function alternarFavorito(id) {
        var favoritos = obtenerFavoritos();
        var indice = favoritos.indexOf(id);

        if (indice >= 0) favoritos.splice(indice, 1);
        else favoritos.push(id);

        guardarFavoritos(favoritos);
        return favoritos.indexOf(id) >= 0;
    }

    function esFavorito(id) {
        return obtenerFavoritos().indexOf(id) >= 0;
    }

    function mejorarListaSonidos() {
        var lista = document.getElementById('csSonidosLista');
        if (!lista) return;

        lista.querySelectorAll('.cs-sonido-item').forEach(function (fila) {
            var id = fila.getAttribute('data-sonido-id');
            if (!id || fila.querySelector('.cs-btn-favorito-neon')) return;

            var boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'cs-btn-favorito-neon';
            boton.setAttribute('aria-label', esFavorito(id) ? 'Quitar de favoritos' : 'Agregar a favoritos');
            boton.setAttribute('data-favorito-id', id);
            boton.textContent = esFavorito(id) ? '♥' : '♡';

            boton.style.cssText = [
                'position:relative',
                'z-index:5',
                'flex-shrink:0',
                'width:32px',
                'height:36px',
                'border:0',
                'background:transparent',
                'color:' + (esFavorito(id) ? '#FF3DAD' : '#A0A0B7'),
                'font-size:23px',
                'cursor:pointer',
                'padding:0',
                'transition:transform .2s,color .2s',
                '-webkit-tap-highlight-color:transparent'
            ].join(';');

            fila.appendChild(boton);
        });
    }

    function mejorarRenderizado() {
        instalarEstilosNeon();

        var lista = document.getElementById('csSonidosLista');
        if (!lista || lista.dataset.neonListener === '1') return;

        lista.dataset.neonListener = '1';

        lista.addEventListener('click', function (evento) {
            var boton = evento.target.closest('.cs-btn-favorito-neon');
            if (!boton) return;

            evento.preventDefault();
            evento.stopPropagation();

            var id = boton.getAttribute('data-favorito-id');
            if (!id) return;

            var agregado = alternarFavorito(id);

            boton.textContent = agregado ? '♥' : '♡';
            boton.style.color = agregado ? '#FF3DAD' : '#A0A0B7';
            boton.style.transform = 'scale(1.25)';

            setTimeout(function () {
                boton.style.transform = 'scale(1)';
            }, 180);

            boton.setAttribute(
                'aria-label',
                agregado ? 'Quitar de favoritos' : 'Agregar a favoritos'
            );

            if (window.VideosPublicarNeon &&
                typeof window.VideosPublicarNeon.actualizarFavoritos === 'function') {
                window.VideosPublicarNeon.actualizarFavoritos();
            }
        });

        var observador = new MutationObserver(function () {
            mejorarFavoritosVisuales();
        });

        observador.observe(lista, { childList: true, subtree: true });
    }

    function mejorarFavoritosVisuales() {
        var lista = document.getElementById('csSonidosLista');
        if (!lista) return;

        lista.querySelectorAll('.cs-sonido-item').forEach(function (fila) {
            var id = fila.getAttribute('data-sonido-id');
            var boton = fila.querySelector('.cs-btn-favorito-neon');

            if (!boton && id) {
                boton = document.createElement('button');
                boton.type = 'button';
                boton.className = 'cs-btn-favorito-neon';
                boton.setAttribute('data-favorito-id', id);
                boton.style.cssText = [
                    'position:relative',
                    'z-index:5',
                    'flex-shrink:0',
                    'width:32px',
                    'height:36px',
                    'border:0',
                    'background:transparent',
                    'font-size:23px',
                    'cursor:pointer',
                    'padding:0'
                ].join(';');

                fila.appendChild(boton);
            }

            if (boton) {
                var favorito = esFavorito(id);
                boton.textContent = favorito ? '♥' : '♡';
                boton.style.color = favorito ? '#FF3DAD' : '#A0A0B7';
                boton.setAttribute(
                    'aria-label',
                    favorito ? 'Quitar de favoritos' : 'Agregar a favoritos'
                );
            }
        });
    }

    function prepararPestanaFavoritos() {
        var modal = document.getElementById('csModalSonidos');
        var lista = document.getElementById('csSonidosLista');
        if (!modal || !lista) return;

        var pestana = modal.querySelector('.cs-tab[data-tab="favoritos"]');
        if (!pestana || pestana.dataset.neonFavoritos === '1') return;

        pestana.dataset.neonFavoritos = '1';

        pestana.addEventListener('click', function () {
            window.setTimeout(function () {
                filtrarFavoritos();
            }, 0);
        });
    }

    function filtrarFavoritos() {
        var modal = document.getElementById('csModalSonidos');
        var lista = document.getElementById('csSonidosLista');
        if (!modal || !lista) return;

        var pestana = modal.querySelector('.cs-tab.active');
        if (!pestana || pestana.dataset.tab !== 'favoritos') return;

        var favoritos = obtenerFavoritos();
        var todas = window.VideosPublicar && window.VideosPublicar._seed
            ? []
            : [];

        if (window.VideosPublicar && window.VideosPublicar._seed) {
            var seed = window.VideosPublicar._seed.SONIDOS_SEED;
            todas = []
                .concat(seed.parati || [])
                .concat(seed.populares || [])
                .concat(seed.favoritos || []);
        }

        var term = (document.getElementById('csBuscarSonido') || {}).value || '';
        term = term.toLowerCase().trim();

        var pistas = todas.filter(function (pista) {
            return favoritos.indexOf(pista.id) >= 0 &&
                (pista.nombre + ' ' + pista.artista).toLowerCase().indexOf(term) >= 0;
        });

        if (!pistas.length) {
            lista.innerHTML = `
                <div class="cs-vacio">
                    <span class="cs-ico-vacio">♥</span>
                    <p>${term ? 'No hay favoritos que coincidan con tu búsqueda.' : 'Todavía no tienes sonidos favoritos. Pulsa ♡ en una pista para guardarla.'}</p>
                </div>`;
            return;
        }

        lista.innerHTML = pistas.map(function (pista) {
            var seleccionado = window.VideosPublicar.getState().sonido;
            var activo = seleccionado && seleccionado.id === pista.id;

            return `
                <button type="button"
                    class="cs-sonido-item ${activo ? 'activo' : ''}"
                    data-sonido-id="${escapar(pista.id)}">
                    <span class="cs-sonido-play" data-play-id="${escapar(pista.id)}"
                        role="button" aria-label="Reproducir o pausar">
                        <span class="cs-sonido-ico">▶</span>
                        <span class="cs-eq" aria-hidden="true">
                            <span class="cs-eq-bar"></span>
                            <span class="cs-eq-bar"></span>
                            <span class="cs-eq-bar"></span>
                            <span class="cs-eq-bar"></span>
                        </span>
                    </span>
                    <span class="cs-sonido-info">
                        <span class="cs-sonido-nombre">${escapar(pista.nombre)}</span>
                        <span class="cs-sonido-artista">${escapar(pista.artista)} · ${escapar(pista.duracion)}s</span>
                    </span>
                    <span class="cs-sonido-check">◆</span>
                </button>`;
        }).join('');

        if (typeof window.VideosPublicarNeon.reconectarLista === 'function') {
            window.VideosPublicarNeon.reconectarLista();
        }
    }

    function escapar(valor) {
        var elemento = document.createElement('div');
        elemento.textContent = valor == null ? '' : String(valor);
        return elemento.innerHTML;
    }

    function actualizarBuscadorFavoritos() {
        var modal = document.getElementById('csModalSonidos');
        if (!modal) return;

        var pestana = modal.querySelector('.cs-tab.active');
        if (pestana && pestana.dataset.tab === 'favoritos') {
            filtrarFavoritos();
        }
    }

    function iniciar() {
        instalarEstilosNeon();
        mejorarRenderizado();
        prepararPestanaFavoritos();

        var buscador = document.getElementById('csBuscarSonido');
        if (buscador && buscador.dataset.neonBusqueda !== '1') {
            buscador.dataset.neonBusqueda = '1';
            buscador.addEventListener('input', function () {
                window.setTimeout(actualizarBuscadorFavoritos, 0);
            });
        }

        document.addEventListener('click', function (evento) {
            var boton = evento.target.closest('#csBtnAgregarSonido');
            if (!boton) return;

            window.setTimeout(function () {
                instalarEstilosNeon();
                mejorarRenderizado();
                mejorarFavoritosVisuales();
            }, 50);
        });

        var modal = document.getElementById('csModalSonidos');
        if (modal) {
            var observadorModal = new MutationObserver(function () {
                mejorarRenderizado();
                mejorarFavoritosVisuales();
            });

            observadorModal.observe(modal, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        }

        console.log('[Csariel Neon RGB] Interfaz visual activada.');
    }

    window.VideosPublicarNeon = {
        actualizarFavoritos: function () {
            filtrarFavoritos();
            mejorarFavoritosVisuales();
        },
        reconectarLista: function () {
            var lista = document.getElementById('csSonidosLista');
            if (!lista) return;

            lista.querySelectorAll('.cs-sonido-play').forEach(function (boton) {
                if (boton.dataset.neonPlay === '1') return;
                boton.dataset.neonPlay = '1';

                boton.addEventListener('click', function (evento) {
                    evento.stopPropagation();
                });
            });

            lista.querySelectorAll('.cs-sonido-item').forEach(function (fila) {
                if (fila.dataset.neonSeleccion === '1') return;
                fila.dataset.neonSeleccion = '1';

                fila.addEventListener('click', function (evento) {
                    if (evento.target.closest('.cs-sonido-play') ||
                        evento.target.closest('.cs-btn-favorito-neon')) return;

                    var id = fila.getAttribute('data-sonido-id');
                    if (window.VideosPublicar &&
                        typeof window.VideosPublicar.seleccionarSonido === 'function') {
                        window.VideosPublicar.seleccionarSonido(id);
                    }
                });
            });

            mejorarFavoritosVisuales();
        },
        obtenerFavoritos: obtenerFavoritos,
        alternarFavorito: alternarFavorito,
        instalarEstilos: instalarEstilosNeon
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }

})();