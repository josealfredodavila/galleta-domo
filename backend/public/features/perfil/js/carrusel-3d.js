/* ============================================
   CARRUSEL 3D HORIZONTAL - Csariel's
   Ruta: /features/perfil/js/carrusel-3d.js

   v3 · MARKETING AUTOMÁTICO
   - Carga anuncios reales desde Supabase (tabla `anuncios`).
   - Si no hay anuncios activos → muestra placeholders de marketing.
   - Realtime: se actualiza cuando alguien publica un anuncio.
   - Registra toques al hacer click en un anuncio.
   - Respeta `destino_url` para redirigir.
   ============================================ */

(function () {
    'use strict';

    // -----------------------------------------------------------
    // CONFIGURACIÓN
    // -----------------------------------------------------------
    var TABLA = 'anuncios';
    var MAX_ANUNCIOS = 8;

    // Paleta llamativa estilo Index (par [inicio, fin] de degradado)
    var PALETA = [
        ['#ff3d00', '#ffc400'], // Naranja → Dorado
        ['#00c853', '#00e5ff'], // Verde → Cian
        ['#7c4dff', '#ff3cb4'], // Morado → Rosa
        ['#2962ff', '#00e5ff'], // Azul → Turquesa
        ['#d50000', '#ff6d00'], // Rojo → Naranja
        ['#ffd600', '#00e676'], // Amarillo → Verde
        ['#ff4081', '#7c4dff'], // Rosa → Violeta
        ['#00bcd4', '#3f51b5']  // Cian → Índigo
    ];

    // Placeholders cuando no hay anuncios reales
    var PLACEHOLDERS = [
        {
            chip: 'MARKETING GRATIS', icon: '📣',
            title: 'ANÚNCIATE GRATIS',
            desc: 'Miles de personas te están buscando. Da a conocer tu negocio sin costo.',
            cta: 'Quiero anunciarme'
        },
        {
            chip: 'SIN COSTO', icon: '🚀',
            title: 'IMPULSA TU MARCA',
            desc: 'Llega a más clientes en el ecosistema Web3. Sin inversión inicial.',
            cta: 'Empezar gratis'
        },
        {
            chip: 'ESPACIO PREMIUM', icon: '💎',
            title: 'SÉ VISIBLE',
            desc: 'Tu marca merece brillar. Ocupa este espacio destacado gratis.',
            cta: 'Destacar ahora'
        },
        {
            chip: 'RED DE ANUNCIANTES', icon: '🌐',
            title: 'CRECE CON NOSOTROS',
            desc: 'Únete a la red de anunciantes de Sariel\'s. Publicar es gratis.',
            cta: 'Unirme'
        },
        {
            chip: 'TE ESTÁN BUSCANDO', icon: '🎯',
            title: 'HAZTE VER',
            desc: 'Clientes potenciales quieren encontrarte. Aparece sin pagar nada.',
            cta: 'Aparecer aquí'
        },
        {
            chip: '100% GRATUITO', icon: '📢',
            title: 'PROMOCIONA TU NEGOCIO',
            desc: 'Espacio premium para tu marca en la comunidad. Sin costo.',
            cta: 'Promocionar'
        },
        {
            chip: 'ANÚNCIATE GRATIS', icon: '✨',
            title: 'DESTACA AQUÍ',
            desc: 'Contenido exclusivo para anunciantes de Sariel\'s. Anúnciate gratis.',
            cta: 'Destacar gratis'
        }
    ];

    var MAX_ROTACION = 28;
    var PERDIDA_ESCALA = 0.1;
    var OPACIDAD_MIN = 0.55;

    // -----------------------------------------------------------
    // ESTADO
    // -----------------------------------------------------------
    var wrapper = null;
    var track = null;
    var dots = null;
    var cards = [];
    var puntos = [];
    var pendiente = false;
    var inicializado = false;
    var activoActual = -1;
    var anunciosCache = [];
    var realtimeChannel = null;
    var cargaEnCurso = false;

    // -----------------------------------------------------------
    // HELPERS DE DOM
    // -----------------------------------------------------------
    function obtenerWrapper() {
        return document.getElementById('carruselPerfilWrapper') ||
               document.querySelector('.carrusel-3d-wrapper:not(.carrusel-fullscreen-overlay *)');
    }

    function obtenerTrack() {
        return document.getElementById('carruselPerfilTrack') ||
               document.querySelector('.carrusel-3d-track:not(.carrusel-fullscreen-track)');
    }

    function coleccionar() {
        if (!track) return [];
        return Array.prototype.slice.call(track.querySelectorAll('.carrusel-3d-card'));
    }

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    // -----------------------------------------------------------
    // CARGA DE ANUNCIOS DESDE SUPABASE
    // -----------------------------------------------------------
    async function obtenerCliente() {
        // Reutiliza el cliente global si ya existe
        if (window.supabaseClient) return window.supabaseClient;

        // Espera al cliente que use el resto de la app
        if (window.supabaseReady) {
            try {
                var c = await window.supabaseReady;
                if (c) return c;
            } catch (e) { /* silencioso */ }
        }

        // Fallback: crear uno nuevo
        if (!window.supabase || !window.supabase.createClient) return null;
        try {
            var r = await fetch('/api/config/public', { cache: 'no-store', credentials: 'same-origin' });
            var config = await r.json();
            window.supabaseClient = window.supabase.createClient(
                config.supabaseUrl,
                config.supabaseAnonKey,
                { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
            );
            return window.supabaseClient;
        } catch (e) {
            console.warn('[Carrusel] No se pudo crear cliente Supabase:', e);
            return null;
        }
    }

    /**
     * Consulta la tabla `anuncios` y devuelve los activos y vigentes.
     */
    async function cargarAnunciosDesdeSupabase() {
        var db = await obtenerCliente();
        if (!db) return [];

        try {
            var ahora = new Date().toISOString();
            var r = await db
                .from(TABLA)
                .select('id, titulo, texto, media_url, destino_url, vistas, toques, created_at, vigencia_fin')
                .eq('activo', true)
                .eq('pausado_automatico', false)
                .gt('vigencia_fin', ahora)
                .order('created_at', { ascending: false })
                .limit(MAX_ANUNCIOS);

            if (r.error) {
                if (r.error.code === '42P01') {
                    console.info('[Carrusel] Tabla `anuncios` no existe todavía.');
                    return [];
                }
                console.warn('[Carrusel] Error consultando anuncios:', r.error.message);
                return [];
            }
            return r.data || [];
        } catch (e) {
            console.warn('[Carrusel] Excepción cargando anuncios:', e);
            return [];
        }
    }

    /**
     * Registra un "toque" (click) en el anuncio.
     * No bloquea la navegación.
     */
    function registrarToque(anuncio) {
        if (!anuncio || !anuncio.id) return;
        obtenerCliente().then(function (db) {
            if (!db) return;
            db.from(TABLA)
              .update({ toques: (anuncio.toques || 0) + 1 })
              .eq('id', anuncio.id)
              .then(function () { /* silencioso */ })
              .catch(function () { /* silencioso */ });
        });
    }

    /**
     * Registra una "vista" cuando el anuncio se vuelve activo en el carrusel.
     * Se llama una sola vez por anuncio por sesión de página.
     */
    var vistasRegistradas = {};
    function registrarVista(anuncio) {
        if (!anuncio || !anuncio.id) return;
        if (vistasRegistradas[anuncio.id]) return;
        vistasRegistradas[anuncio.id] = true;

        obtenerCliente().then(function (db) {
            if (!db) return;
            db.from(TABLA)
              .update({ vistas: (anuncio.vistas || 0) + 1 })
              .eq('id', anuncio.id)
              .then(function () { /* silencioso */ })
              .catch(function () { /* silencioso */ });
        });
    }

    // -----------------------------------------------------------
    // RENDERIZADO
    // -----------------------------------------------------------
    function asignarColores() {
        cards.forEach(function (card, i) {
            var par = PALETA[i % PALETA.length];
            if (!card.style.getPropertyValue('--c1')) {
                card.style.setProperty('--c1', par[0]);
                card.style.setProperty('--c2', par[1]);
            }
            if (!card.style.getPropertyValue('--c')) {
                card.style.setProperty('--c', par[0]);
            }
        });
    }

    /**
     * HTML de un anuncio real.
     */
    function htmlAnuncioReal(a, i, total) {
        var par = PALETA[i % PALETA.length];
        var destino = a.destino_url || '#';
        var titulo = esc(a.titulo || 'Anuncio');
        var texto = esc(a.texto || '');
        var media = a.media_url
            ? '<img class="anuncio-img" src="' + esc(a.media_url) + '" alt="" loading="lazy">'
            : '';

        return '' +
            '<a class="carrusel-3d-card anuncio-card" href="' + esc(destino) + '" ' +
                'data-anuncio-id="' + esc(a.id) + '" ' +
                'style="--c:' + par[0] + ';--c1:' + par[0] + ';--c2:' + par[1] + ';">' +
                '<div class="ads-tag"><span class="dot"></span> PATROCINADO</div>' +
                '<div class="ads-counter">' + (i + 1) + '/' + total + '</div>' +
                '<span class="anuncio-etiqueta">ANUNCIO</span>' +
                media +
                '<div class="card-title anuncio-titulo">' + titulo + '</div>' +
                (texto ? '<div class="card-desc anuncio-texto">' + texto + '</div>' : '') +
            '</a>';
    }

    /**
     * HTML de un placeholder de marketing.
     */
    function htmlPlaceholder(p, i, total) {
        var par = PALETA[i % PALETA.length];
        return '' +
            '<a class="carrusel-3d-card anuncio-placeholder" href="#" ' +
                'data-placeholder="1" ' +
                'style="--c:' + par[0] + ';--c1:' + par[0] + ';--c2:' + par[1] + ';">' +
                '<div class="ads-tag"><span class="dot"></span> ÚNETE A SARIEL\'S</div>' +
                '<div class="ads-counter">' + (i + 1) + '/' + total + '</div>' +
                '<span class="ads-chip">' + esc(p.chip) + '</span>' +
                '<div class="card-icon">' + p.icon + '</div>' +
                '<div class="card-title">' + esc(p.title) + '</div>' +
                '<div class="card-desc">' + esc(p.desc) + '</div>' +
                '<button class="ads-cta" type="button">' + esc(p.cta) + '</button>' +
            '</a>';
    }

    /**
     * Renderiza el track completo con anuncios reales o placeholders.
     */
    function renderizar(anuncios) {
        if (!track) return;
        anunciosCache = anuncios || [];

        if (anuncios && anuncios.length > 0) {
            // Anuncios reales
            track.innerHTML = anuncios.map(function (a, i) {
                return htmlAnuncioReal(a, i, anuncios.length);
            }).join('');

            // Click → registrar toque + navegar
            track.querySelectorAll('.anuncio-card').forEach(function (card) {
                card.addEventListener('click', function (e) {
                    var id = card.getAttribute('data-anuncio-id');
                    var anuncio = anunciosCache.filter(function (a) { return a.id === id; })[0];
                    if (anuncio) registrarToque(anuncio);
                    // La navegación la hace el href del <a>
                });
            });
        } else {
            // Placeholders de marketing
            track.innerHTML = PLACEHOLDERS.map(function (p, i) {
                return htmlPlaceholder(p, i, PLACEHOLDERS.length);
            }).join('');

            // Click → abrir modal de crear anuncio
            track.querySelectorAll('.anuncio-placeholder').forEach(function (card) {
                card.addEventListener('click', function (e) {
                    e.preventDefault();
                    irACrearAnuncio();
                });
            });
        }
    }

    function irACrearAnuncio() {
        // Si existe un modal de crear anuncio en la página, úsalo
        if (typeof window.abrirModalCrearAnuncio === 'function') {
            window.abrirModalCrearAnuncio();
            return;
        }
        // Si no, redirige a la página del formulario
        window.location.href = '/features/perfil/crear-anuncio.html';
    }

    // -----------------------------------------------------------
    // NAVEGACIÓN DEL CARRUSEL (sin cambios)
    // -----------------------------------------------------------
    function irACard(i, suave) {
        var card = cards[i];
        if (!card || !track) return;
        var trackRect = track.getBoundingClientRect();
        var cardRect = card.getBoundingClientRect();
        if (cardRect.width === 0) return;
        var diferencia = (cardRect.left + cardRect.width / 2) - (trackRect.left + trackRect.width / 2);
        track.scrollTo({
            left: track.scrollLeft + diferencia,
            behavior: suave ? 'smooth' : 'auto'
        });
    }

    function construirPuntos() {
        if (!dots) {
            dots = document.createElement('div');
            dots.className = 'carrusel-3d-dots';
            wrapper.appendChild(dots);
        }
        var activo = activoActual >= 0 ? activoActual : 0;
        dots.innerHTML = '';
        cards.forEach(function (card, i) {
            var punto = document.createElement('button');
            punto.type = 'button';
            punto.setAttribute('aria-label', 'Ir al anuncio ' + (i + 1));
            punto.addEventListener('click', function () { irACard(i, true); });
            if (i === activo) punto.classList.add('active');
            dots.appendChild(punto);
        });
        puntos = Array.prototype.slice.call(dots.querySelectorAll('button'));
    }

    function actualizar() {
        pendiente = false;
        if (!cards.length || !track) return;

        var trackRect = track.getBoundingClientRect();
        var centro = trackRect.left + trackRect.width / 2;
        var mejor = 0;
        var mejorDistancia = Infinity;

        cards.forEach(function (card, i) {
            var r = card.getBoundingClientRect();
            var distancia = (r.left + r.width / 2) - centro;
            var t = Math.max(-1, Math.min(1, distancia / (r.width + 14)));
            var lejania = Math.abs(t);

            card.style.transform =
                'perspective(900px) rotateY(' + (-t * MAX_ROTACION).toFixed(2) + 'deg) ' +
                'scale(' + (1 - lejania * PERDIDA_ESCALA).toFixed(3) + ')';
            card.style.opacity = (1 - lejania * (1 - OPACIDAD_MIN)).toFixed(3);

            if (Math.abs(distancia) < mejorDistancia) {
                mejorDistancia = Math.abs(distancia);
                mejor = i;
            }
        });

        activoActual = mejor;

        cards.forEach(function (card, i) {
            card.classList.toggle('active', i === mejor);
        });
        puntos.forEach(function (punto, i) {
            punto.classList.toggle('active', i === mejor);
        });

        // Registrar vista del anuncio activo (solo anuncios reales)
        if (anunciosCache.length > 0 && cards[mejor]) {
            var id = cards[mejor].getAttribute('data-anuncio-id');
            if (id) {
                var anuncio = anunciosCache.filter(function (a) { return a.id === id; })[0];
                if (anuncio) registrarVista(anuncio);
            }
        }
    }

    function pedirActualizacion() {
        if (!pendiente) {
            pendiente = true;
            window.requestAnimationFrame(actualizar);
        }
    }

    // -----------------------------------------------------------
    // REFRESCAR (público)
    // -----------------------------------------------------------
    function refrescar() {
        if (!track) {
            track = obtenerTrack();
            if (!track) return;
        }
        cards = coleccionar();
        if (cards.length === 0) return;
        asignarColores();
        construirPuntos();
        pedirActualizacion();
        window.dispatchEvent(new Event('carrusel3d:refrescar'));
    }

    function irACardInicial(i, intentos) {
        intentos = intentos || 0;
        var card = cards[i];
        if (!card) return;
        var r = card.getBoundingClientRect();
        if (r.width > 0 || intentos > 30) {
            irACard(i, false);
            actualizar();
            return;
        }
        window.requestAnimationFrame(function () {
            irACardInicial(i, intentos + 1);
        });
    }

    // -----------------------------------------------------------
    // REALTIME · Escucha cambios en la tabla anuncios
    // -----------------------------------------------------------
    async function suscribirRealtime() {
        var db = await obtenerCliente();
        if (!db || realtimeChannel) return;

        try {
            realtimeChannel = db
                .channel('anuncios-carrusel-realtime')
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: TABLA },
                    function () {
                        // Cualquier cambio (INSERT/UPDATE/DELETE) → recargar
                        if (!cargaEnCurso) cargarYRenderizar();
                    }
                )
                .subscribe();
        } catch (e) {
            console.warn('[Carrusel] No se pudo suscribir a Realtime:', e);
        }
    }

    // -----------------------------------------------------------
    // CARGA PRINCIPAL
    // -----------------------------------------------------------
    async function cargarYRenderizar() {
        if (!track) return;
        cargaEnCurso = true;
        try {
            var anuncios = await cargarAnunciosDesdeSupabase();
            renderizar(anuncios);
            refrescar();
        } catch (e) {
            console.warn('[Carrusel] Error cargando y renderizando:', e);
            // Fallback: placeholders
            renderizar([]);
            refrescar();
        } finally {
            cargaEnCurso = false;
        }
    }

    // -----------------------------------------------------------
    // INIT
    // -----------------------------------------------------------
    function init() {
        wrapper = obtenerWrapper();
        track = obtenerTrack();
        if (!wrapper || !track) {
            window.requestAnimationFrame(init);
            return;
        }
        if (inicializado) return;
        inicializado = true;

        // 1) Placeholders inmediatos (para que no se vea vacío)
        renderizar([]);
        cards = coleccionar();
        asignarColores();
        construirPuntos();

        track.addEventListener('scroll', pedirActualizacion, { passive: true });
        window.addEventListener('resize', pedirActualizacion);

        var inicial = 0;
        cards.forEach(function (card, i) {
            if (card.classList.contains('active')) inicial = i;
        });
        activoActual = inicial;

        window.requestAnimationFrame(function () {
            irACardInicial(inicial, 0);
        });

        // 2) Carga real desde Supabase
        cargarYRenderizar();

        // 3) Realtime
        suscribirRealtime();

        // API global
        window.carrusel3D = { refrescar: refrescar, recargar: cargarYRenderizar };
        window.dispatchEvent(new Event('carrusel3d:listo'));
    }

    window.carrusel3D = window.carrusel3D || { refrescar: function () {}, recargar: function () {} };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();