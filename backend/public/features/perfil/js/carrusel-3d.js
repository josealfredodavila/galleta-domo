// ============================================
// CSARIEL'S · CARRUSEL 3D HORIZONTAL
// Ruta: /features/perfil/js/carrusel-3d.js
// v9 · MODAL FULLSCREEN DE DETALLE
//
// NUEVO EN ESTA VERSIÓN:
// ✅ Al tocar una tarjeta de ANUNCIO se abre un modal fullscreen
//    con la info del anuncio + datos del anunciante.
// ✅ Al tocar una INVITACIÓN también se abre un modal con la info.
// ✅ Se traen datos del perfil del anunciante (nombre, handle,
//    avatar, ubicación, contacto) mediante JOIN con perfiles_publicos.
// ✅ Fallback: si el JOIN falla o la columna no existe, se consulta
//    el perfil por separado.
// ✅ NO redirige a ninguna URL. NO abre el formulario de crear.
// ✅ Botón "Visitar" usa destino_url del anuncio.
// ✅ Botón "Ver perfil" usa el handle del anunciante.
//
// CONSERVADO DE v8:
// ✅ Guard global, deduplicación, urlSegura, recarga pendiente,
//    pausa de animaciones al ocultar, detección de conexión lenta,
//    lazy video, IntersectionObserver, cache en sessionStorage.
// ============================================

(function () {
    'use strict';

    // --------------------------------------------
    // GUARD GLOBAL
    // --------------------------------------------
    if (window.__csarielsCarrusel3DIniciado) return;

    // --------------------------------------------
    // CONFIGURACIÓN
    // --------------------------------------------
    var TABLA_ANUNCIOS = 'anuncios';
    var TABLA_PERFILES = 'perfiles_publicos';
    var TOTAL_SLOTS = 7;
    var REALTIME_DEBOUNCE_MS = 600;
    var CACHE_KEY = 'csariels_anuncios_cache_v2';
    var CACHE_TTL_MS = 60 * 1000;

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

    // 7 invitaciones (placeholders)
    var PLACEHOLDERS = [
        {
            chip: 'ANÚNCIATE GRATIS',
            title: 'IMPULSA TU NEGOCIO',
            desc: 'Presenta tu negocio a la comunidad Csariel’s y permite que más clientes te descubran.',
            descLarga: 'Publica tu anuncio en el carrusel del perfil y llega a miles de usuarios de la comunidad. Es completamente gratis y tu anuncio aparece durante 7 días.',
            cta: 'Quiero anunciarme'
        },
        {
            chip: 'PUBLICA SIN COSTO',
            title: 'DA A CONOCER TU MARCA',
            desc: 'Dale visibilidad a tus productos o servicios con un espacio para tu negocio.',
            descLarga: 'Presenta tus productos o servicios directamente en el carrusel del perfil. Miles de usuarios pasan por aquí cada día.',
            cta: 'Publicar mi anuncio'
        },
        {
            chip: 'DESTACA TU MARCA',
            title: 'TU NEGOCIO MERECE BRILLAR',
            desc: 'Presenta tu propuesta y destaca entre las opciones de la comunidad.',
            descLarga: 'Diferénciate del resto mostrando tu negocio con una imagen llamativa y una descripción que atraiga a tus clientes.',
            cta: 'Destacar ahora'
        },
        {
            chip: 'CRECE EN COMUNIDAD',
            title: 'CONECTA CON CLIENTES',
            desc: 'Haz que tu negocio sea más fácil de descubrir dentro del ecosistema.',
            descLarga: 'Aparece en el carrusel principal y permite que los usuarios te encuentren fácilmente.',
            cta: 'Quiero aparecer'
        },
        {
            chip: 'ES TU MOMENTO',
            title: 'HAZTE VISIBLE',
            desc: 'Muestra lo que ofreces y acerca tu negocio a nuevos clientes.',
            descLarga: 'Tu negocio merece ser visto. Publica tu anuncio gratis y empieza a recibir clientes de la comunidad.',
            cta: 'Empezar ahora'
        },
        {
            chip: 'ESPACIO PARA TU MARCA',
            title: 'PROMOCIONA TU NEGOCIO',
            desc: 'Comparte tu propuesta con una presentación llamativa y profesional.',
            descLarga: 'Sube una imagen atractiva y describe tu propuesta. Los usuarios podrán ver tu anuncio en pantalla completa.',
            cta: 'Promocionar mi marca'
        },
        {
            chip: 'BIENVENIDO A CSARIEL’S',
            title: 'TU PRÓXIMO CLIENTE PUEDE ESTAR AQUÍ',
            desc: 'Empieza a presentar tu negocio a la comunidad. Consulta las condiciones al crear tu anuncio.',
            descLarga: 'Publica tu anuncio gratis y llega a más personas. Solo necesitas una imagen y una breve descripción.',
            cta: 'Comenzar ahora'
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
    var reducirMovimiento = false;
    var conexionLenta = false;
    var modalActivo = null;

    // --------------------------------------------
    // DETECCIÓN DE CAPACIDADES
    // --------------------------------------------
    function detectarPreferencias() {
        try {
            reducirMovimiento = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (e) { reducirMovimiento = false; }

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

    function esc(valor) {
        var div = document.createElement('div');
        div.textContent = valor == null ? '' : String(valor);
        return div.innerHTML;
    }

    function urlSegura(valor) {
        var url = String(valor || '').trim();
        if (!url || url === '#') return '#';

        if (/^(https?:\/\/|\/|\.\/|\.\.\/|#)/i.test(url)) {
            if (/^https?:\/\//i.test(url)) {
                try {
                    var parsed = new URL(url);
                    if (parsed.protocol !== 'https:' &&
                        parsed.protocol !== 'http:') return '#';
                } catch (e) { return '#'; }
            }
            return url;
        }
        return '#';
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
    // CARGA DE ANUNCIOS + PERFILES
    //
    // 1) Consulta anuncios activos y vigentes.
    // 2) Trae los perfiles de los anunciantes en bloque.
    // 3) Combina y devuelve.
    // --------------------------------------------
    async function cargarAnunciosDesdeSupabase() {
        var db = await obtenerCliente();
        if (!db) return null;

        try {
            var ahora = new Date().toISOString();

            // 1) Anuncios
            var resultado = await db
                .from(TABLA_ANUNCIOS)
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

            // Deduplicación
            var vistos = Object.create(null);
            var unicos = [];
            filas.forEach(function (a) {
                if (!a || a.id == null) return;
                var clave = String(a.id);
                if (vistos[clave]) return;
                vistos[clave] = true;
                unicos.push(a);
            });

            var anuncios = unicos.slice(0, TOTAL_SLOTS);

            // 2) Traer perfiles de anunciantes en bloque
            if (anuncios.length) {
                var idsUnicos = [];
                var idsVistos = Object.create(null);
                anuncios.forEach(function (a) {
                    if (!a.usuario_id) return;
                    var k = String(a.usuario_id);
                    if (idsVistos[k]) return;
                    idsVistos[k] = true;
                    idsUnicos.push(a.usuario_id);
                });

                if (idsUnicos.length) {
                    var perfiles = await cargarPerfiles(db, idsUnicos);
                    var mapaPerfiles = Object.create(null);
                    perfiles.forEach(function (p) {
                        if (p && p.id) mapaPerfiles[String(p.id)] = p;
                    });
                    anuncios.forEach(function (a) {
                        if (a.usuario_id && mapaPerfiles[String(a.usuario_id)]) {
                            a._perfil = mapaPerfiles[String(a.usuario_id)];
                        }
                    });
                }
            }

            escribirCache(anuncios);
            return anuncios;
        } catch (error) {
            console.warn('[Carrusel] Error consultando anuncios:', error);
            return null;
        }
    }

    // --------------------------------------------
    // CARGA DE PERFILES
    //
    // Intenta traer el máximo de columnas. Si Supabase
    // rechaza alguna (porque no existe), reintenta con las
    // columnas mínimas garantizadas.
    // --------------------------------------------
    async function cargarPerfiles(db, ids) {
        if (!ids || !ids.length) return [];

        // Intento 1: columnas extendidas
        try {
            var r1 = await db
                .from(TABLA_PERFILES)
                .select(
                    'id, nombre, handle, avatar_url, bio, ' +
                    'ciudad, estado_region, ubicacion, ' +
                    'whatsapp, telefono, sitio_web, email'
                )
                .in('id', ids);

            if (!r1.error && r1.data) return r1.data;
        } catch (e) {}

        // Intento 2: columnas seguras
        try {
            var r2 = await db
                .from(TABLA_PERFILES)
                .select('id, nombre, handle, avatar_url, bio')
                .in('id', ids);

            if (!r2.error && r2.data) return r2.data;
        } catch (e) {}

        // Intento 3: mínimas
        try {
            var r3 = await db
                .from(TABLA_PERFILES)
                .select('id, nombre, handle, avatar_url')
                .in('id', ids);

            if (!r3.error && r3.data) return r3.data;
        } catch (e) {}

        return [];
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
    // --------------------------------------------
    function htmlAnuncioReal(anuncio, indice, total) {
        var destino = urlSegura(anuncio.destino_url);
        var titulo = esc(anuncio.titulo || 'Anuncio');
        var texto = esc(anuncio.texto || '');
        var tipo = String(anuncio.tipo || 'imagen').toLowerCase();
        var mediaUrl = String(anuncio.media_url || '').trim();
        var par = obtenerColores(indice);
        var media = '';

        if (mediaUrl && /^https?:\/\//i.test(mediaUrl)) {
            var mediaSegura = esc(mediaUrl);
            if (tipo === 'video') {
                media =
                    '<video class="anuncio-video" src="' +
                    mediaSegura +
                    '" muted loop playsinline ' +
                    'preload="none" aria-hidden="true" ' +
                    'data-lazy-video="1"></video>';
            } else {
                media =
                    '<img class="anuncio-img" src="' +
                    mediaSegura +
                    '" alt="" loading="lazy" decoding="async">';
            }
        }

        return (
            '<a class="carrusel-3d-card anuncio-card" ' +
                'href="' + esc(destino) + '" ' +
                'data-anuncio-id="' + esc(anuncio.id) + '" ' +
                'data-tipo="' + esc(tipo) + '" ' +
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
                'href="#" ' +
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

        track.innerHTML = html;
        activoActual = 0;
        cards = coleccionar();

        // Delegación de clic: abre modal en lugar de navegar
        cards.forEach(function (card) {
            card.addEventListener('click', manejarClickTarjeta);
        });

        configurarVideosLazy();
        construirPuntos();
        asignarColores();
        pedirActualizacion();
    }

    // --------------------------------------------
    // CLIC EN TARJETA
    // --------------------------------------------
    function manejarClickTarjeta(evento) {
        var card = evento.currentTarget;

        // Invitación
        if (card.classList.contains('anuncio-placeholder')) {
            evento.preventDefault();
            var slot = parseInt(card.getAttribute('data-slot') || '0', 10);
            var placeholder = PLACEHOLDERS[slot % PLACEHOLDERS.length];
            abrirModalInvitacion(placeholder);
            return;
        }

        // Anuncio real
        if (card.classList.contains('anuncio-card')) {
            evento.preventDefault();
            var idAnuncio = card.getAttribute('data-anuncio-id');
            var anuncio = anunciosCache.filter(function (a) {
                return String(a.id) === String(idAnuncio);
            })[0];
            if (anuncio) abrirModalAnuncio(anuncio);
            return;
        }
    }

    // --------------------------------------------
    // HELPERS DE UI: partículas en el modal
    // --------------------------------------------
    function htmlParticulasModal() {
        return '<div class="ad-modal-particles" aria-hidden="true">' +
            '<span></span><span></span><span></span>' +
            '</div>';
    }

    // --------------------------------------------
    // MODAL DE ANUNCIO REAL (fullscreen)
    // --------------------------------------------
    function abrirModalAnuncio(anuncio) {
        cerrarModalActual();

        var tipo = String(anuncio.tipo || 'imagen').toLowerCase();
        var mediaUrl = String(anuncio.media_url || '').trim();
        var titulo = esc(anuncio.titulo || 'Anuncio');
        var texto = esc(anuncio.texto || '');
        var destino = urlSegura(anuncio.destino_url);
        var perfil = anuncio._perfil || null;

        // Media
        var mediaHTML = '';
        if (mediaUrl && /^https?:\/\//i.test(mediaUrl)) {
            if (tipo === 'video') {
                mediaHTML =
                    '<video class="ad-modal-media" src="' +
                    esc(mediaUrl) +
                    '" autoplay muted loop playsinline ' +
                    'controls preload="metadata"></video>';
            } else {
                mediaHTML =
                    '<img class="ad-modal-media" src="' +
                    esc(mediaUrl) +
                    '" alt="" loading="eager" decoding="async">';
            }
        }

        // Perfil
        var perfilHTML = '';
        if (perfil) {
            var nombreNeg = esc(perfil.nombre || 'Negocio');
            var handle = perfil.handle ? '@' + esc(perfil.handle) : '';
            var avatar = perfil.avatar_url
                ? '<img src="' + esc(perfil.avatar_url) + '" alt="">'
                : '<span class="ad-modal-avatar-letter">' +
                    esc((perfil.nombre || '?').charAt(0).toUpperCase()) +
                  '</span>';

            var ubicacion = perfil.ubicacion || perfil.ciudad ||
                perfil.estado_region || '';

            var contactoItems = [];
            if (perfil.whatsapp) {
                contactoItems.push(
                    '<a class="ad-modal-contact-item" ' +
                       'href="https://wa.me/' + esc(String(perfil.whatsapp).replace(/\D/g, '')) +
                       '" target="_blank" rel="noopener">' +
                       '<span class="ad-modal-contact-icon">☎</span>' +
                       '<span>' + esc(perfil.whatsapp) + '</span>' +
                    '</a>'
                );
            }
            if (perfil.telefono) {
                contactoItems.push(
                    '<a class="ad-modal-contact-item" ' +
                       'href="tel:' + esc(String(perfil.telefono).replace(/[^\d+]/g, '')) + '">' +
                       '<span class="ad-modal-contact-icon">☎</span>' +
                       '<span>' + esc(perfil.telefono) + '</span>' +
                    '</a>'
                );
            }
            if (perfil.email) {
                contactoItems.push(
                    '<a class="ad-modal-contact-item" ' +
                       'href="mailto:' + esc(perfil.email) + '">' +
                       '<span class="ad-modal-contact-icon">✉</span>' +
                       '<span>' + esc(perfil.email) + '</span>' +
                    '</a>'
                );
            }
            if (perfil.sitio_web) {
                contactoItems.push(
                    '<a class="ad-modal-contact-item" ' +
                       'href="' + esc(urlSegura(perfil.sitio_web)) + '" ' +
                       'target="_blank" rel="noopener">' +
                       '<span class="ad-modal-contact-icon">🌐</span>' +
                       '<span>Sitio web</span>' +
                    '</a>'
                );
            }

            var contactoHTML = contactoItems.length
                ? '<div class="ad-modal-contact">' + contactoItems.join('') + '</div>'
                : '';

            perfilHTML =
                '<div class="ad-modal-perfil">' +
                    '<div class="ad-modal-avatar">' + avatar + '</div>' +
                    '<div class="ad-modal-perfil-info">' +
                        '<div class="ad-modal-perfil-name">' + nombreNeg + '</div>' +
                        (handle ? '<div class="ad-modal-perfil-handle">' + handle + '</div>' : '') +
                        (ubicacion
                            ? '<div class="ad-modal-perfil-loc">' +
                                '<span>📍</span> ' + esc(ubicacion) +
                              '</div>'
                            : '') +
                    '</div>' +
                '</div>' +
                (contactoHTML ? contactoHTML : '');
        }

        // Botón visitar
        var botonVisitar = (destino && destino !== '#')
            ? '<a class="ad-modal-btn ad-modal-btn-primary" ' +
                  'href="' + esc(destino) + '" ' +
                  'target="_blank" rel="noopener">' +
                  'Visitar <span aria-hidden="true">→</span>' +
              '</a>'
            : '';

        // Botón ver perfil
        var botonPerfil = (perfil && perfil.handle)
            ? '<a class="ad-modal-btn ad-modal-btn-secondary" ' +
                  'href="/perfil/' + esc(perfil.handle) + '">' +
                  'Ver perfil' +
              '</a>'
            : '';

        var html =
            '<div class="ad-modal-backdrop" data-ad-modal-close="1"></div>' +
            '<div class="ad-modal-card" role="dialog" aria-modal="true">' +
                '<button type="button" class="ad-modal-close" ' +
                    'aria-label="Cerrar" data-ad-modal-close="1">✕</button>' +
                htmlParticulasModal() +
                (mediaHTML
                    ? '<div class="ad-modal-media-wrap">' + mediaHTML + '</div>'
                    : '') +
                '<div class="ad-modal-content">' +
                    '<div class="ad-modal-tag">PATROCINADO</div>' +
                    '<h2 class="ad-modal-title">' + titulo + '</h2>' +
                    (texto
                        ? '<p class="ad-modal-text">' + texto + '</p>'
                        : '') +
                    perfilHTML +
                    '<div class="ad-modal-actions">' +
                        botonVisitar +
                        botonPerfil +
                    '</div>' +
                '</div>' +
            '</div>';

        crearModal(html, 'ad-modal-announcement');
    }

    // --------------------------------------------
    // MODAL DE INVITACIÓN (fullscreen)
    // --------------------------------------------
    function abrirModalInvitacion(placeholder) {
        cerrarModalActual();

        var chip = esc(placeholder.chip || 'INVITACIÓN');
        var titulo = esc(placeholder.title || '');
        var desc = esc(placeholder.descLarga || placeholder.desc || '');
        var cta = esc(placeholder.cta || 'Quiero anunciarme');

        var beneficios = [
            '100% gratis · sin costo',
            'Vigencia de 7 días',
            'Aparece en el carrusel del perfil',
            'Miles de usuarios lo ven cada día',
            'Imagen o video en alta resolución'
        ];

        var beneficiosHTML = beneficios.map(function (b) {
            return '<li class="ad-modal-benefit">' +
                '<span class="ad-modal-check">✓</span>' +
                '<span>' + esc(b) + '</span>' +
            '</li>';
        }).join('');

        var html =
            '<div class="ad-modal-backdrop" data-ad-modal-close="1"></div>' +
            '<div class="ad-modal-card ad-modal-card-invite" role="dialog" aria-modal="true">' +
                '<button type="button" class="ad-modal-close" ' +
                    'aria-label="Cerrar" data-ad-modal-close="1">✕</button>' +
                htmlParticulasModal() +
                '<div class="ad-modal-content">' +
                    '<div class="ad-modal-tag ad-modal-tag-invite">' +
                        '<span class="ad-modal-tag-dot"></span> INVITACIÓN CSARIEL’S' +
                    '</div>' +
                    '<div class="ad-modal-chip">' + chip + '</div>' +
                    '<h2 class="ad-modal-title ad-modal-title-invite">' + titulo + '</h2>' +
                    '<p class="ad-modal-text">' + desc + '</p>' +
                    '<ul class="ad-modal-benefits">' + beneficiosHTML + '</ul>' +
                    '<div class="ad-modal-actions">' +
                        '<a class="ad-modal-btn ad-modal-btn-primary" ' +
                            'href="/features/anuncios/anuncios-crear.html">' +
                            cta + ' <span aria-hidden="true">→</span>' +
                        '</a>' +
                    '</div>' +
                '</div>' +
            '</div>';

        crearModal(html, 'ad-modal-invitation');
    }

    // --------------------------------------------
    // CREAR / CERRAR MODAL
    // --------------------------------------------
    function crearModal(html, claseExtra) {
        var cont = document.createElement('div');
        cont.className = 'ad-modal ' + (claseExtra || '');
        cont.setAttribute('role', 'presentation');
        cont.innerHTML = html;

        document.body.appendChild(cont);
        document.documentElement.style.overflow = 'hidden';

        modalActivo = cont;

        // Cierre por botón X o backdrop
        cont.querySelectorAll('[data-ad-modal-close]').forEach(function (el) {
            el.addEventListener('click', function () {
                cerrarModalActual();
            });
        });

        // Cierre por tecla ESC
        document.addEventListener('keydown', manejarTecladoModal);

        // Animación de entrada
        window.requestAnimationFrame(function () {
            cont.classList.add('is-open');
        });

        // Focus accesible
        var btnCerrar = cont.querySelector('.ad-modal-close');
        if (btnCerrar) {
            setTimeout(function () { btnCerrar.focus(); }, 80);
        }
    }

    function manejarTecladoModal(evento) {
        if (evento.key === 'Escape' && modalActivo) {
            cerrarModalActual();
        }
    }

    function cerrarModalActual() {
        if (!modalActivo) return;

        var cont = modalActivo;
        modalActivo = null;

        cont.classList.remove('is-open');

        // Pausar videos del modal
        cont.querySelectorAll('video').forEach(function (v) {
            try { v.pause(); } catch (e) {}
        });

        document.removeEventListener('keydown', manejarTecladoModal);

        setTimeout(function () {
            if (cont && cont.parentNode) {
                cont.parentNode.removeChild(cont);
            }
            document.documentElement.style.overflow = '';
        }, 220);
    }

    // --------------------------------------------
    // VIDEOS LAZY EN CARRUSEL
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
    // NAVEGACIÓN
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
            punto.addEventListener('click', function () {
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
                    { event: '*', schema: 'public', table: TABLA_ANUNCIOS },
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

        inicializado = true;
        window.__csarielsCarrusel3DIniciado = true;

        detectarPreferencias();

        if (reducesMovimientoActivo()) wrapper.classList.add('is-reduced-motion');
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
                cards.forEach(function (card) {
                    card.addEventListener('click', manejarClickTarjeta);
                });
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

    function reducesMovimientoActivo() {
        try {
            return window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (e) { return false; }
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