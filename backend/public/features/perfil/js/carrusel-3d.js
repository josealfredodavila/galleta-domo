// ============================================
// CSARIEL'S · CARRUSEL 3D HORIZONTAL
// Ruta: /features/perfil/js/carrusel-3d.js
// v11 · ESCAPE SEGURO DE ATRIBUTOS Y VALIDACIÓN DE MEDIA
// ============================================

(function () {
    'use strict';

    if (window.__csarielsCarrusel3DIniciado) return;

    // --------------------------------------------
    // CONFIGURACIÓN
    // --------------------------------------------
    var TABLA = 'anuncios';
    var TOTAL_SLOTS = 7;
    var REALTIME_DEBOUNCE_MS = 600;
    var CACHE_KEY = 'csariels_anuncios_cache_v3';
    var CACHE_TTL_MS = 60 * 1000;

    // Rutas
    var URL_ANUNCIO_DETALLE = '/features/anuncios/ver.html';
    var URL_CREAR_ANUNCIO  = '/features/anuncios/anuncios-crear.html';

    // Tipos de media permitidos (lista blanca)
    var TIPOS_MEDIA = { imagen: true, video: true };

    // Paleta de degradados por slot
    var PALETA = [
        ['#ff7900', '#ffb300'],
        ['#00c853', '#00bfa5'],
        ['#008f68', '#ffd54f'],
        ['#2962ff', '#00e5ff'],
        ['#e65100', '#ff8f00'],
        ['#00a878', '#ffd54f'],
        ['#ff4081', '#7c4dff']
    ];

    // 7 invitaciones (reemplazan a las tarjetas viejas de Muro/Perfil)
    var PLACEHOLDERS = [
        {
            chip: 'ANÚNCIATE GRATIS',
            title: 'IMPULSA TU NEGOCIO',
            desc: 'Presenta tu negocio a la comunidad Csariel’s y permite que más clientes te descubran.',
            cta: 'Crear mi anuncio'
        },
        {
            chip: 'PUBLICA SIN COSTO',
            title: 'DA A CONOCER TU MARCA',
            desc: 'Dale visibilidad a tus productos o servicios con un espacio para tu negocio.',
            cta: 'Quiero anunciarme'
        },
        {
            chip: 'DESTACA TU MARCA',
            title: 'TU NEGOCIO MERECE BRILLAR',
            desc: 'Presenta tu propuesta y destaca entre las opciones de la comunidad.',
            cta: 'Dar el siguiente paso'
        },
        {
            chip: 'CRECE EN COMUNIDAD',
            title: 'CONECTA CON CLIENTES',
            desc: 'Haz que tu negocio sea más fácil de descubrir dentro del ecosistema.',
            cta: 'Publicar mi anuncio'
        },
        {
            chip: 'ES TU MOMENTO',
            title: 'HAZTE VISIBLE',
            desc: 'Muestra lo que ofreces y acerca tu negocio a nuevos clientes.',
            cta: 'Quiero aparecer'
        },
        {
            chip: 'ESPACIO PARA TU MARCA',
            title: 'PROMOCIONA TU NEGOCIO',
            desc: 'Comparte tu propuesta con una presentación llamativa y profesional.',
            cta: 'Promocionar mi marca'
        },
        {
            chip: 'BIENVENIDO A CSARIEL’S',
            title: 'TU PRÓXIMO CLIENTE PUEDE ESTAR AQUÍ',
            desc: 'Empieza a presentar tu negocio a la comunidad. Consulta las condiciones al crear tu anuncio.',
            cta: 'Empezar ahora'
        }
    ];

    var MAX_ROTACION = 28;
    var PERDIDA_ESCALA = 0.10;
    var OPACIDAD_MIN = 0.60;

    // --------------------------------------------
    // ESTADO
    // --------------------------------------------
    var wrapper = null;
    var track = null;
    var dots = null;
    var cards = [];
    var puntos = [];

    var inicializado = false;
    var pendiente = false;
    var cargaEnCurso = false;
    var recargaPendiente = false;
    var activoActual = 0;
    var realtimeChannel = null;
    var realtimeTimer = null;
    var rafId = null;
    var anunciosCache = [];
    var observerVideos = null;
    var conexionLenta = false;

    // --------------------------------------------
    // DETECCIÓN DE CAPACIDADES
    // --------------------------------------------
    function detectarPreferencias() {
        try {
            var conn = navigator.connection ||
                navigator.mozConnection ||
                navigator.webkitConnection;
            if (conn && (conn.effectiveType === 'slow-2g' ||
                         conn.effectiveType === '2g' ||
                         conn.saveData === true)) {
                conexionLenta = true;
            }
        } catch (e) { conexionLenta = false; }
    }

    // --------------------------------------------
    // UTILIDADES
    // --------------------------------------------
    function obtenerWrapper() {
        return document.getElementById('carruselPerfilWrapper') ||
            document.querySelector('.carrusel-3d-wrapper');
    }

    function obtenerTrack() {
        return document.getElementById('carruselPerfilTrack') ||
            document.querySelector('.carrusel-3d-track:not(.carrusel-fullscreen-track)');
    }

    function coleccionar() {
        if (!track) return [];
        return Array.prototype.slice.call(track.querySelectorAll('.carrusel-3d-card'));
    }

    // Escape para TEXTO dentro de elementos
    function esc(valor) {
        var div = document.createElement('div');
        div.textContent = valor == null ? '' : String(valor);
        return div.innerHTML;
    }

    // Escape para VALORES DE ATRIBUTO (comillas incluidas)
    function escAttr(valor) {
        return String(valor == null ? '' : valor)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Solo acepta URLs http(s) bien formadas; devuelve '' si no son válidas
    function urlSegura(valor) {
        try {
            var u = new URL(String(valor || '').trim());
            return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
        } catch (e) {
            return '';
        }
    }

    function tipoMediaSeguro(valor) {
        var t = String(valor || 'imagen').toLowerCase();
        return TIPOS_MEDIA[t] ? t : 'imagen';
    }

    function obtenerColores(indice) {
        return PALETA[indice % PALETA.length];
    }

    // --------------------------------------------
    // CACHE
    // --------------------------------------------
    function leerCache() {
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (!obj || !obj.ts || !Array.isArray(obj.data)) return null;
            if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
            return obj.data;
        } catch (e) { return null; }
    }

    function escribirCache(anuncios) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                ts: Date.now(),
                data: anuncios || []
            }));
        } catch (e) {}
    }

    // --------------------------------------------
    // CLIENTE SUPABASE
    // --------------------------------------------
    async function obtenerCliente() {
        if (window.supabaseClient) return window.supabaseClient;

        if (window.supabaseReady) {
            try {
                var cliente = await window.supabaseReady;
                if (cliente) {
                    window.supabaseClient = cliente;
                    return cliente;
                }
            } catch (error) {}
        }

        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            return null;
        }

        try {
            var respuesta = await fetch('/api/config/public', {
                cache: 'no-store',
                credentials: 'same-origin'
            });
            if (!respuesta.ok) throw new Error('No se pudo obtener config.');

            var config = await respuesta.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error('Falta config pública de Supabase.');
            }

            window.supabaseClient = window.supabase.createClient(
                config.supabaseUrl,
                config.supabaseAnonKey,
                {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true
                    }
                }
            );
            return window.supabaseClient;
        } catch (error) {
            console.warn('[Carrusel] No se pudo crear cliente Supabase:', error);
            return null;
        }
    }

    // --------------------------------------------
    // CARGA DE ANUNCIOS
    // --------------------------------------------
    async function cargarAnunciosDesdeSupabase() {
        var db = await obtenerCliente();
        if (!db) return null;

        try {
            var ahora = new Date().toISOString();

            var resultado = await db
                .from(TABLA)
                .select(
                    'id, usuario_id, titulo, texto, tipo, media_url, ' +
                    'destino_url, duracion_video_seg, created_at, vigencia_fin'
                )
                .eq('activo', true)
                .eq('estado_moderacion', 'aprobado')
                .neq('pausado_automatico', true)
                .gt('vigencia_fin', ahora)
                .order('prioridad', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(50);

            if (resultado.error) {
                console.warn('[Carrusel] Error consultando anuncios:', resultado.error.message);
                return null;
            }

            var filas = Array.isArray(resultado.data) ? resultado.data : [];

            var vistos = Object.create(null);
            var unicos = [];
            filas.forEach(function (a) {
                if (!a || a.id == null) return;
                var clave = String(a.id);
                if (vistos[clave]) return;
                vistos[clave] = true;
                unicos.push(a);
            });

            var finales = unicos.slice(0, TOTAL_SLOTS);
            escribirCache(finales);
            return finales;
        } catch (error) {
            console.warn('[Carrusel] Error consultando anuncios:', error);
            return null;
        }
    }

    // --------------------------------------------
    // HTML DECORATIVO
    // --------------------------------------------
    function htmlParticulas() {
        return '<div class="times-particles" aria-hidden="true">' +
            '<span></span><span></span></div>';
    }

    // --------------------------------------------
    // HTML: ANUNCIO REAL
    // Todos los valores que vienen de la base se escapan como atributo
    // o como texto. La media solo se usa si la URL es http(s) válida.
    // --------------------------------------------
    function htmlAnuncioReal(anuncio, indice, total) {
        var titulo = esc(anuncio.titulo || 'Anuncio');
        var texto = esc(anuncio.texto || '');
        var tipo = tipoMediaSeguro(anuncio.tipo);
        var mediaUrl = urlSegura(anuncio.media_url);
        var par = obtenerColores(indice);
        var media = '';

        if (mediaUrl) {
            if (tipo === 'video') {
                media =
                    '<video class="anuncio-video" src="' +
                    escAttr(mediaUrl) +
                    '" muted loop playsinline ' +
                    'preload="none" aria-hidden="true" ' +
                    'data-lazy-video="1"></video>';
            } else {
                media =
                    '<img class="anuncio-img" src="' +
                    escAttr(mediaUrl) +
                    '" alt="" loading="lazy" decoding="async">';
            }
        }

        return (
            '<a class="carrusel-3d-card anuncio-card" ' +
                'href="' + escAttr(URL_ANUNCIO_DETALLE) + '?id=' +
                encodeURIComponent(String(anuncio.id)) + '" ' +
                'data-anuncio-id="' + escAttr(anuncio.id) + '" ' +
                'data-tipo="' + escAttr(tipo) + '" ' +
                'style="--c1:' + par[0] + ';--c2:' + par[1] + ';">' +
                htmlParticulas() +
                '<div class="ads-tag">' +
                    '<span class="dot"></span> PATROCINADO' +
                '</div>' +
                '<div class="ads-counter">' +
                    (indice + 1) + '/' + total +
                '</div>' +
                media +
                '<div class="card-title anuncio-titulo">' +
                    titulo +
                '</div>' +
                (texto
                    ? '<div class="card-desc anuncio-texto">' +
                        texto +
                      '</div>'
                    : '') +
            '</a>'
        );
    }

    // --------------------------------------------
    // HTML: INVITACIÓN
    // --------------------------------------------
    function htmlPlaceholder(placeholder, indice, total) {
        var par = obtenerColores(indice);
        return (
            '<a class="carrusel-3d-card anuncio-placeholder" ' +
                'href="' + escAttr(URL_CREAR_ANUNCIO) + '" ' +
                'data-placeholder="1" ' +
                'data-slot="' + indice + '" ' +
                'style="--c1:' + par[0] + ';--c2:' + par[1] + ';">' +
                htmlParticulas() +
                '<div class="ads-tag">' +
                    '<span class="dot"></span> INVITACIÓN CSARIEL’S' +
                '</div>' +
                '<div class="ads-counter">' +
                    (indice + 1) + '/' + total +
                '</div>' +
                '<span class="ads-chip">' +
                    esc(placeholder.chip) +
                '</span>' +
                '<span class="card-icon" aria-hidden="true"></span>' +
                '<div class="card-title">' +
                    esc(placeholder.title) +
                '</div>' +
                '<div class="card-desc">' +
                    esc(placeholder.desc) +
                '</div>' +
                '<span class="ads-cta">' +
                    esc(placeholder.cta) +
                    ' <span aria-hidden="true">→</span>' +
                '</span>' +
            '</a>'
        );
    }

    // --------------------------------------------
    // SLOTS
    // --------------------------------------------
    function construirSlots(anuncios) {
        var slots = [];
        var usados = 0;
        for (var i = 0; i < anuncios.length && usados < TOTAL_SLOTS; i++) {
            slots.push({ tipo: 'real', data: anuncios[i] });
            usados++;
        }
        for (var j = 0; usados < TOTAL_SLOTS; j++, usados++) {
            slots.push({
                tipo: 'placeholder',
                data: PLACEHOLDERS[j % PLACEHOLDERS.length]
            });
        }
        return slots;
    }

    // --------------------------------------------
    // RENDER
    // --------------------------------------------
    function renderizar(anuncios) {
        if (!track) return;

        anunciosCache = Array.isArray(anuncios) ? anuncios : [];
        var slots = construirSlots(anunciosCache);
        var total = slots.length;

        var html = slots.map(function (slot, indice) {
            if (slot.tipo === 'real') return htmlAnuncioReal(slot.data, indice, total);
            return htmlPlaceholder(slot.data, indice, total);
        }).join('');

        // Limpieza total del contenedor para evitar tarjetas residuales
        track.innerHTML = html;

        activoActual = 0;
        cards = coleccionar();

        configurarVideosLazy();
        construirPuntos();
        asignarColores();
        pedirActualizacion();
    }

    // --------------------------------------------
    // VIDEOS LAZY
    // --------------------------------------------
    function configurarVideosLazy() {
        if (!track) return;

        if (observerVideos) {
            observerVideos.disconnect();
            observerVideos = null;
        }

        var videos = track.querySelectorAll('video[data-lazy-video]');
        if (!videos.length) return;

        if (!('IntersectionObserver' in window)) {
            videos.forEach(function (v) {
                v.muted = true;
                v.playsInline = true;
                v.setAttribute('playsinline', '');
                var p = v.play();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            });
            return;
        }

        observerVideos = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                var video = entry.target;
                if (entry.isIntersecting) {
                    if (video.preload === 'none') {
                        video.preload = 'metadata';
                        video.load();
                    }
                    video.muted = true;
                    video.playsInline = true;
                    video.setAttribute('playsinline', '');
                    var p = video.play();
                    if (p && typeof p.catch === 'function') p.catch(function () {});
                } else {
                    try { video.pause(); } catch (e) {}
                }
            });
        }, {
            root: track,
            rootMargin: '80px 0px 80px 0px',
            threshold: 0.15
        });

        videos.forEach(function (v) { observerVideos.observe(v); });
    }

    // --------------------------------------------
    // COLORES
    // --------------------------------------------
    function asignarColores() {
        cards.forEach(function (card, indice) {
            var par = obtenerColores(indice);
            card.style.setProperty('--c1', par[0]);
            card.style.setProperty('--c2', par[1]);
        });
    }

    // --------------------------------------------
    // NAVEGACIÓN DEL CARRUSEL
    // --------------------------------------------
    function irACard(indice, suave) {
        var card = cards[indice];
        if (!card || !track) return;

        var pista = track.getBoundingClientRect();
        var tarjeta = card.getBoundingClientRect();
        if (!tarjeta.width) return;

        var diferencia =
            (tarjeta.left + tarjeta.width / 2) -
            (pista.left + pista.width / 2);

        track.scrollTo({
            left: track.scrollLeft + diferencia,
            behavior: suave ? 'smooth' : 'auto'
        });
    }

    function construirPuntos() {
        if (!wrapper) return;

        if (!dots || !dots.isConnected) {
            dots = wrapper.querySelector('.carrusel-3d-dots');
            if (!dots) {
                dots = document.createElement('div');
                dots.className = 'carrusel-3d-dots';
                dots.setAttribute('aria-label', 'Navegación del carrusel');
                wrapper.appendChild(dots);
            }
        }

        dots.innerHTML = '';
        cards.forEach(function (card, indice) {
            var punto = document.createElement('button');
            punto.type = 'button';
            punto.setAttribute('aria-label', 'Ir a la tarjeta ' + (indice + 1));
            punto.addEventListener('click', function (ev) {
                ev.preventDefault();
                irACard(indice, true);
            });
            if (indice === activoActual) punto.classList.add('active');
            dots.appendChild(punto);
        });
        puntos = Array.prototype.slice.call(dots.querySelectorAll('button'));
    }

    function actualizar() {
        pendiente = false;
        rafId = null;
        if (!cards.length || !track) return;

        var rectPista = track.getBoundingClientRect();
        var centro = rectPista.left + rectPista.width / 2;
        var mejor = 0;
        var mejorDistancia = Infinity;

        cards.forEach(function (card, indice) {
            var rect = card.getBoundingClientRect();
            var distancia = rect.left + rect.width / 2 - centro;
            var proporcion = Math.max(-1, Math.min(1, distancia / (rect.width + 14)));
            var lejania = Math.abs(proporcion);

            card.style.transform =
                'perspective(900px) rotateY(' +
                (-proporcion * MAX_ROTACION).toFixed(2) +
                'deg) scale(' +
                (1 - lejania * PERDIDA_ESCALA).toFixed(3) +
                ')';

            card.style.opacity = (
                1 - lejania * (1 - OPACIDAD_MIN)
            ).toFixed(3);

            if (Math.abs(distancia) < mejorDistancia) {
                mejorDistancia = Math.abs(distancia);
                mejor = indice;
            }
        });

        activoActual = mejor;
        cards.forEach(function (card, i) {
            card.classList.toggle('active', i === mejor);
        });
        puntos.forEach(function (punto, i) {
            punto.classList.toggle('active', i === mejor);
        });
    }

    function pedirActualizacion() {
        if (pendiente || document.hidden) return;
        pendiente = true;
        rafId = window.requestAnimationFrame(actualizar);
    }

    function refrescar() {
        wrapper = obtenerWrapper();
        track = obtenerTrack();
        if (!wrapper || !track) return;

        cards = coleccionar();
        if (!cards.length) return;

        construirPuntos();
        asignarColores();
        pedirActualizacion();
        window.dispatchEvent(new Event('carrusel3d:refrescar'));
    }

    // --------------------------------------------
    // CARGA
    // --------------------------------------------
    async function cargarYRenderizar() {
        if (cargaEnCurso) {
            recargaPendiente = true;
            return;
        }
        if (!track) return;

        cargaEnCurso = true;
        try {
            var anuncios = await cargarAnunciosDesdeSupabase();
            if (anuncios === null) return;
            renderizar(anuncios);
        } catch (error) {
            console.warn('[Carrusel] Error de actualización:', error);
        } finally {
            cargaEnCurso = false;
            if (recargaPendiente) {
                recargaPendiente = false;
                window.setTimeout(function () {
                    cargarYRenderizar();
                }, REALTIME_DEBOUNCE_MS);
            }
        }
    }

    // --------------------------------------------
    // REALTIME
    // --------------------------------------------
    async function suscribirRealtime() {
        var db = await obtenerCliente();
        if (!db || realtimeChannel) return;

        try {
            realtimeChannel = db
                .channel('csariels-anuncios-carrusel')
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: TABLA },
                    function () {
                        if (realtimeTimer) clearTimeout(realtimeTimer);
                        realtimeTimer = setTimeout(function () {
                            cargarYRenderizar();
                        }, REALTIME_DEBOUNCE_MS);
                    }
                )
                .subscribe();
        } catch (error) {
            console.warn('[Carrusel] Realtime error:', error);
        }
    }

    // --------------------------------------------
    // VISIBILIDAD
    // --------------------------------------------
    function gestionarVisibilidad() {
        if (!wrapper) return;
        wrapper.classList.toggle('is-paused', document.hidden);

        if (document.hidden) {
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
                rafId = null;
                pendiente = false;
            }
            if (track) {
                track.querySelectorAll('video.anuncio-video').forEach(function (v) {
                    try { v.pause(); } catch (e) {}
                });
            }
            return;
        }

        if (track) {
            track.querySelectorAll('video.anuncio-video').forEach(function (v) {
                var p = v.play();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            });
        }
        pedirActualizacion();
    }

    // --------------------------------------------
    // INIT
    // --------------------------------------------
    function init() {
        if (inicializado) return;

        wrapper = obtenerWrapper();
        track = obtenerTrack();
        if (!wrapper || !track) {
            window.requestAnimationFrame(init);
            return;
        }

        // Limpieza inicial: elimina HTML viejo antes de pintar las tarjetas correctas
        if (track) track.innerHTML = '';

        inicializado = true;
        window.__csarielsCarrusel3DIniciado = true;

        detectarPreferencias();
        if (conexionLenta) wrapper.classList.add('is-slow-connection');

        var cache = leerCache();
        if (cache && cache.length) {
            renderizar(cache);
        } else {
            cards = coleccionar();
            if (!cards.length) {
                renderizar([]);
            } else {
                activoActual = 0;
                construirPuntos();
                asignarColores();
                pedirActualizacion();
            }
        }

        track.addEventListener('scroll', pedirActualizacion, { passive: true });
        window.addEventListener('resize', pedirActualizacion, { passive: true });
        document.addEventListener('visibilitychange', gestionarVisibilidad);

        gestionarVisibilidad();

        window.carrusel3D = {
            refrescar: refrescar,
            recargar: cargarYRenderizar
        };

        cargarYRenderizar();
        suscribirRealtime();

        window.dispatchEvent(new Event('carrusel3d:listo'));
    }

    window.carrusel3D = window.carrusel3D || {
        refrescar: function () {},
        recargar: function () {}
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
