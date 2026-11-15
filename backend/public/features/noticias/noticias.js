(function () {
    'use strict';

    const SAVED_KEY = 'sariels_noticias_guardadas';
    const REGION = 'MX';

    const SALUDOS = /^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|hey|hi|hello|qu[eé] onda|qu[eé] tal)[\s!¡?.,]*$/i;
    const RESPUESTA_SALUDO = '¡Hola! Pregúntame algo de la actualidad, por ejemplo: "¿Qué pasa hoy en México?"';

    const state = {
        category: 'general',
        token: null,
        items: [],
        saved: loadSaved(),
        busy: false,
    };

    const $ = (id) => document.getElementById(id);

    const el = {
        session: $('session'),
        feed: $('feed'),
        chips: $('chips'),
        fab: $('fab'),
        sheet: $('sheet'),
        backdrop: $('backdrop'),
        close: $('close'),
        input: $('pregunta-input'),
        ask: $('consultar-btn'),
        suggest: $('suggest'),
        answer: $('respuesta'),
        answerSrc: $('respuesta-fuentes'),
        toast: $('toast'),
    };

    // ========================================================
    // ESTILOS MULTIMEDIA
    // ========================================================

    function instalarEstilos() {
        if (document.getElementById('sariels-noticias-media-css')) return;

        const style = document.createElement('style');
        style.id = 'sariels-noticias-media-css';

        style.textContent = `
            .sn-media {
                position: relative;
                width: 100%;
                overflow: hidden;
                background: #101010;
                isolation: isolate;
            }

            .sn-media img,
            .sn-media video,
            .sn-media iframe {
                display: block;
                width: 100%;
                height: 100%;
                border: 0;
                object-fit: cover;
                background: #101010;
            }

            .sn-media img { min-height: 100%; }
            .sn-media video { object-fit: contain; }

            .sn-media iframe {
                position: absolute;
                inset: 0;
            }

            .sn-media-video {
                aspect-ratio: 16 / 9;
                background: #000;
            }

            .sn-media-image { aspect-ratio: 16 / 9; }

            .hero .cover {
                position: relative;
                overflow: hidden;
            }

            .hero .cover .sn-media {
                width: 100%;
                height: 100%;
                min-height: 240px;
            }

            .hero .cover .sn-media img,
            .hero .cover .sn-media video,
            .hero .cover .sn-media iframe {
                min-height: 240px;
            }

            .sn-card {
                position: relative;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                margin-bottom: 20px;
                min-height: 0;
                border-radius: 16px;
                background: #111;
                border: 1px solid rgba(255,255,255,.08);
            }

            .sn-card .sn-media { flex: none; }

            .sn-card-content {
                position: relative;
                z-index: 2;
                padding: 18px;
            }

            .sn-card-content h2 {
                margin: 8px 0 10px;
                font-size: 1.3rem;
                line-height: 1.25;
                color: #fff;
            }

            .sn-card-content .summary {
                color: #ccc;
                margin: 0;
                font-size: .95rem;
                line-height: 1.55;
            }

            .sn-card-content .more { margin-top: 8px; }

            .sn-media-fallback {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                min-height: 150px;
                background: linear-gradient(135deg,#101010,#202020);
                color: #d4af37;
                font-size: 2rem;
            }

            .sn-media iframe { aspect-ratio: 16 / 9; }

            .sn-media video::-webkit-media-controls { opacity: 1; }

            .sn-media video:focus-visible,
            .sn-media iframe:focus-visible {
                outline: 2px solid #d4af37;
                outline-offset: -2px;
            }

            @media (max-width: 600px) {
                .sn-card-content { padding: 15px; }
                .sn-card-content h2 { font-size: 1.15rem; }
            }
        `;

        document.head.appendChild(style);
    }

    // ========================================================
    // UTILIDADES
    // ========================================================

    function escapeHtml(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        })[c]);
    }

    function urlSegura(valor) {
        try {
            const url = new URL(String(valor || ''), window.location.origin);
            return url.protocol === 'http:' || url.protocol === 'https:'
                ? url.href
                : '#';
        } catch (_) {
            return '#';
        }
    }

    function hostOf(valor) {
        try {
            return new URL(valor).hostname.replace(/^www\./, '');
        } catch (_) {
            return 'Fuente';
        }
    }

    function tiempoRelativo(valor) {
        if (!valor) return 'Hoy';

        const fecha = new Date(valor);
        if (Number.isNaN(fecha.getTime())) return 'Hoy';

        const seg = Math.round((fecha.getTime() - Date.now()) / 1000);
        const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

        const umbrales = [
            ['year', 31536000],
            ['month', 2592000],
            ['day', 86400],
            ['hour', 3600],
            ['minute', 60]
        ];

        for (const [unidad, segundos] of umbrales) {
            if (Math.abs(seg) >= segundos) {
                return rtf.format(Math.round(seg / segundos), unidad);
            }
        }

        return 'hace un momento';
    }

    const ETIQUETAS = {
        general: 'Para ti',
        mexico: 'México',
        tecnologia: 'Tecnología',
        conectividad: 'Conectividad',
        cripto: 'Cripto',
        negocios: 'Negocios',
    };

    function letraDe(texto) {
        const limpio = String(texto || '').trim();
        return escapeHtml(limpio ? limpio.charAt(0).toUpperCase() : '•');
    }

    function loadSaved() {
        try {
            return new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'));
        } catch (_) {
            return new Set();
        }
    }

    function persistSaved() {
        try {
            localStorage.setItem(SAVED_KEY, JSON.stringify([...state.saved]));
        } catch (_) {}
    }

    function toast(mensaje) {
        if (!el.toast) return;

        el.toast.textContent = mensaje;
        el.toast.classList.add('on');

        clearTimeout(toast._t);

        toast._t = setTimeout(() => {
            el.toast.classList.remove('on');
        }, 2200);
    }

    // ========================================================
    // SUPABASE Y SESIÓN
    // ========================================================

    async function waitForSupabase() {
        for (let i = 0; i < 80; i++) {
            if (window.supabaseClient) return window.supabaseClient;
            await new Promise((r) => setTimeout(r, 100));
        }
        return null;
    }

    function setSession(texto, esError) {
        if (!el.session) return;
        el.session.textContent = texto;
        el.session.classList.toggle('error', Boolean(esError));
    }

    async function fetchSession() {
        const client = await waitForSupabase();

        if (!client) {
            setSession('Supabase no disponible', true);
            return false;
        }

        try {
            const { data, error } = await client.auth.getSession();
            if (error) throw error;

            if (!data?.session) {
                setSession('Sesión requerida', true);
                return false;
            }

            state.token = data.session.access_token;
            setSession(data.session.user?.email || 'Sesión activa');
            return true;

        } catch (error) {
            console.error('Error cargando sesión:', error);
            setSession('No se pudo validar la sesión', true);
            return false;
        }
    }

    function headers() {
        const h = { 'Content-Type': 'application/json' };
        if (state.token) h.Authorization = `Bearer ${state.token}`;
        return h;
    }

    // ========================================================
    // IDENTIFICACIÓN DE CONTENIDO MULTIMEDIA
    // ========================================================

    function obtenerImagen(item) {
        if (!item) return '#';

        const posibles = [
            item.imagen,
            item.image,
            item.image_url,
            item.imageUrl,
            item.portada,
            item.thumbnail,
            item.miniatura,
            item.multimedia?.imagen,
            item.multimedia?.image
        ];

        for (const valor of posibles) {
            const url = urlSegura(valor);
            if (url !== '#') return url;
        }

        return '#';
    }

    /**
     * Valida si una URL corresponde a un video DIRECTO reproducible
     * (extensión conocida o MIME típico de archivo servido).
     */
    function esVideoDirecto(url) {
        if (!url || url === '#') return false;

        try {
            const u = new URL(url);
            const ruta = u.pathname.toLowerCase();

            const extensiones = [
                '.mp4', '.webm', '.ogg', '.ogv',
                '.mov', '.m4v', '.m3u8', '.mpd'
            ];

            return extensiones.some((ext) => ruta.endsWith(ext));
        } catch (_) {
            return false;
        }
    }

    /**
     * Devuelve la URL del video SOLO si es un embed conocido
     * (YouTube / Vimeo) o un archivo directo con extensión válida.
     * Cualquier otra cosa (URL rota, JSON.stringify, blob sin extensión, etc.)
     * se descarta para evitar el icono roto en 0:00.
     */
    function obtenerVideo(item) {
        if (!item) return '#';

        const posibles = [
            item.video,
            item.video_url,
            item.videoUrl,
            item.url_video,
            item.multimedia?.video,
            item.media?.video,
            item.media?.url
        ];

        for (const valor of posibles) {
            const candidato = typeof valor === 'object'
                ? valor?.url || valor?.src
                : valor;

            const url = urlSegura(candidato);
            if (url === '#') continue;

            // Es embed de YouTube/Vimeo → válido.
            if (obtenerVideoExterno(url)) return url;

            // Es archivo directo con extensión de video → válido.
            if (esVideoDirecto(url)) return url;

            // Cualquier otro caso se descarta (no es un video reproducible).
        }

        return '#';
    }

    function obtenerTipoVideo(url) {
        try {
            const ruta = new URL(url).pathname.toLowerCase();

            if (ruta.endsWith('.webm')) return 'video/webm';
            if (ruta.endsWith('.ogg') || ruta.endsWith('.ogv')) return 'video/ogg';
            if (ruta.endsWith('.mov')) return 'video/quicktime';
            if (ruta.endsWith('.m4v')) return 'video/x-m4v';
            if (ruta.endsWith('.m3u8')) return 'application/x-mpegURL';

            return 'video/mp4';

        } catch (_) {
            return 'video/mp4';
        }
    }

    function obtenerVideoExterno(url) {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.replace(/^www\./, '');
            let id = '';

            if (host === 'youtu.be') {
                id = parsed.pathname.split('/').filter(Boolean)[0] || '';
            }

            if (
                host === 'youtube.com' ||
                host === 'm.youtube.com' ||
                host === 'youtube-nocookie.com'
            ) {
                if (parsed.pathname === '/watch') {
                    id = parsed.searchParams.get('v') || '';
                } else {
                    const partes = parsed.pathname.split('/').filter(Boolean);
                    if (partes[0] === 'embed' || partes[0] === 'shorts') {
                        id = partes[1] || '';
                    }
                }
            }

            if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                return 'https://www.youtube-nocookie.com/embed/' + id;
            }

            if (host === 'vimeo.com' || host === 'player.vimeo.com') {
                const partes = parsed.pathname.split('/').filter(Boolean);
                const videoId = partes.find((p) => /^\d+$/.test(p));
                if (videoId) {
                    return 'https://player.vimeo.com/video/' + videoId;
                }
            }

            return null;

        } catch (_) {
            return null;
        }
    }

    // ========================================================
    // COMPONENTE MULTIMEDIA
    // ========================================================

    function mediaHtml(item, categoria, opciones) {
        opciones = opciones || {};

        const imagen = obtenerImagen(item);
        const video = obtenerVideo(item);

        const fuente = item.fuentes?.[0]?.titulo ||
            hostOf(item.fuentes?.[0]?.url || '');

        const poster = imagen !== '#' ? imagen : '';

        // 1) Video externo embebido (YouTube / Vimeo)
        if (video !== '#') {
            const externo = obtenerVideoExterno(video);

            if (externo) {
                return `
                    <div class="sn-media sn-media-video">
                        <iframe
                            src="${escapeHtml(externo)}"
                            title="${escapeHtml(item.titulo || 'Video de noticia')}"
                            loading="lazy"
                            referrerpolicy="strict-origin-when-cross-origin"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowfullscreen>
                        </iframe>
                    </div>`;
            }

            // 2) Video directo con archivo reproducible
            if (esVideoDirecto(video)) {
                return `
                    <div class="sn-media sn-media-video">
                        <video
                            controls
                            playsinline
                            preload="metadata"
                            ${poster ? `poster="${escapeHtml(poster)}"` : ''}
                            controlslist="nodownload"
                            aria-label="${escapeHtml(item.titulo || 'Video de noticia')}"
                            data-video-src="${escapeHtml(video)}"
                            data-poster="${escapeHtml(poster)}">
                            <source
                                src="${escapeHtml(video)}"
                                type="${escapeHtml(obtenerTipoVideo(video))}">
                            Tu navegador no puede reproducir este video.
                        </video>
                    </div>`;
            }
        }

        // 3) Imagen si no hay video válido
        if (imagen !== '#') {
            return `
                <div class="sn-media sn-media-image">
                    <img
                        class="photo"
                        src="${escapeHtml(imagen)}"
                        alt="${escapeHtml(item.titulo || 'Imagen de noticia')}"
                        loading="lazy"
                        decoding="async"
                        referrerpolicy="no-referrer">
                </div>`;
        }

        // 4) Fallback limpio
        return `
            <div class="sn-media-fallback cat-${escapeHtml(categoria)}">
                <span class="letra">${letraDe(fuente)}</span>
            </div>`;
    }

    // ========================================================
    // FALLBACKS DE MEDIA (imágenes + video)
    // ========================================================

    function fallbackMedia(contenedor, opciones) {
        opciones = opciones || {};

        if (opciones.poster) {
            const img = document.createElement('img');
            img.className = 'photo';
            img.src = opciones.poster;
            img.alt = opciones.alt || 'Imagen de noticia';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';

            img.addEventListener('error', () => {
                contenedor.innerHTML = `
                    <div class="sn-media-fallback">
                        <span>◈</span>
                    </div>`;
            }, { once: true });

            contenedor.innerHTML = '';
            contenedor.appendChild(img);

        } else {
            contenedor.innerHTML = `
                <div class="sn-media-fallback">
                    <span>◈</span>
                </div>`;
        }
    }

    function enlazarFotos() {
        // Imágenes: fallback a placeholder si fallan.
        el.feed.querySelectorAll('img.photo').forEach((img) => {
            if (img.dataset.bound) return;
            img.dataset.bound = '1';

            img.addEventListener('error', () => {
                const contenedor = img.closest('.sn-media');
                if (!contenedor) return;
                fallbackMedia(contenedor, {});
            }, { once: true });
        });

        // Videos: capturar error del <video>, del <source>, y del timeout de metadatos.
        el.feed.querySelectorAll('video').forEach((video) => {
            if (video.dataset.bound) return;
            video.dataset.bound = '1';

            const contenedor = video.closest('.sn-media');
            if (!contenedor) return;

            const poster = video.dataset.poster || '';
            const alt = video.getAttribute('aria-label') || 'Noticia';

            // Marca de "video realmente cargó metadatos".
            let listo = false;

            const aplicarFallback = () => {
                if (listo) return;

                const media = video.closest('.sn-media') || contenedor;
                fallbackMedia(media, { poster, alt });
            };

            // Evento válido → desactiva fallbacks.
            video.addEventListener('loadedmetadata', () => { listo = true; }, { once: true });
            video.addEventListener('canplay', () => { listo = true; }, { once: true });

            // Errores conocidos.
            video.addEventListener('error', aplicarFallback, { once: true });

            const source = video.querySelector('source');
            if (source) {
                source.addEventListener('error', aplicarFallback, { once: true });
            }

            // Timeout de seguridad: si en 8s no cargó metadatos ni sonó error,
            // asumimos que el video está roto (icono 0:00).
            setTimeout(() => {
                if (listo) return;
                // 0 = HAVE_NOTHING, 1 = HAVE_METADATA
                if (video.readyState === 0) {
                    aplicarFallback();
                }
            }, 8000);
        });
    }

    // ========================================================
    // RENDER
    // ========================================================

    function renderSkeleton() {
        el.feed.innerHTML = `
            <div class="skeleton sk-hero"></div>
            <div class="skeleton sk-card"></div>
            <div class="skeleton sk-card"></div>`;
    }

    function renderEmpty(titulo, texto, conReintento) {
        el.feed.innerHTML = `
            <div class="empty">
                <h3>${escapeHtml(titulo)}</h3>
                <p>${escapeHtml(texto)}</p>
                ${conReintento
                    ? '<button class="retry" type="button" data-action="retry">Reintentar</button>'
                    : ''}
            </div>`;
    }

    function encabezadoHtml(item, cat) {
        return `
            <div class="eyebrow">
                <span class="cat">${escapeHtml(ETIQUETAS[cat] || 'Noticias')}</span>
                <span>· ${escapeHtml(tiempoRelativo(item.publicadoEn || item.publicado_en || item.fecha))}</span>
            </div>`;
    }

    function actionsHtml(index, fuenteUrl) {
        const item = state.items[index];

        const id = String(
            item?.id ?? item?.fuentes?.[0]?.url ?? item?.titulo ?? index
        );

        const guardada = state.saved.has(id);
        const url = urlSegura(fuenteUrl);

        return `
            <footer class="actions">
                <span class="src">${escapeHtml(hostOf(url))}</span>

                <button class="act" type="button" data-action="save"
                    aria-pressed="${guardada}" aria-label="Guardar noticia">
                    <svg viewBox="0 0 24 24">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                    </svg>
                </button>

                <button class="act" type="button" data-action="share"
                    aria-label="Compartir noticia">
                    <svg viewBox="0 0 24 24">
                        <circle cx="18" cy="5" r="3"/>
                        <circle cx="6" cy="12" r="3"/>
                        <circle cx="18" cy="19" r="3"/>
                        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>
                    </svg>
                </button>

                ${url !== '#'
                    ? `<a class="read" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Leer</a>`
                    : ''}
            </footer>`;
    }

    function heroHtml(item, index) {
        const cat = state.category;

        return `
            <article class="hero" data-index="${index}">
                <div class="cover cat-${escapeHtml(cat)}">
                    ${mediaHtml(item, cat)}
                </div>
                <div class="scrim"></div>
                <div class="content">
                    ${encabezadoHtml(item, cat)}
                    <h2>${escapeHtml(item.titulo || 'Noticia')}</h2>
                    <p>${escapeHtml(item.resumen || '')}</p>
                    ${actionsHtml(index, item.fuentes?.[0]?.url)}
                </div>
            </article>`;
    }

    function cardHtml(item, index) {
        const cat = state.category;

        return `
            <article class="card sn-card" data-index="${index}">
                ${mediaHtml(item, cat)}
                <div class="sn-card-content">
                    ${encabezadoHtml(item, cat)}
                    <h2>${escapeHtml(item.titulo || 'Noticia')}</h2>
                    <div class="summary-wrap">
                        <p class="summary" data-role="resumen">${escapeHtml(item.resumen || '')}</p>
                        <button class="more" type="button" data-action="more">Ver más</button>
                    </div>
                    ${actionsHtml(index, item.fuentes?.[0]?.url)}
                </div>
            </article>`;
    }

    function renderFeed() {
        if (!state.items.length) {
            renderEmpty(
                'Sin noticias por ahora',
                'No hay contenido disponible en esta categoría.',
                true
            );
            return;
        }

        const [primera, ...resto] = state.items;

        el.feed.innerHTML =
            heroHtml(primera, 0) +
            resto.map((item, i) => cardHtml(item, i + 1)).join('');

        enlazarFotos();
    }

    // ========================================================
    // CARGA DE NOTICIAS
    // ========================================================

    async function loadFeed() {
        if (!state.token) {
            renderEmpty(
                'Inicia sesión',
                'Debes iniciar sesión con Supabase para ver las noticias.',
                false
            );
            return;
        }

        if (state.busy) return;
        state.busy = true;

        renderSkeleton();

        try {
            const params = new URLSearchParams({
                categoria: state.category,
                region: REGION
            });

            const response = await fetch(
                `/api/noticias?${params.toString()}`,
                { method: 'GET', headers: headers() }
            );

            if (response.status === 401) {
                renderEmpty('Sesión expirada', 'Vuelve a iniciar sesión para continuar.', false);
                return;
            }

            if (response.status === 404) {
                renderEmpty('Servicio no disponible', 'La API de noticias aún no está activa en el servidor. Intenta más tarde.', true);
                return;
            }

            if (response.status === 429) {
                renderEmpty('Demasiadas consultas', 'Espera unos minutos antes de volver a intentar.', true);
                return;
            }

            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(body.error || 'No se pudieron cargar las noticias');
            }

            state.items = Array.isArray(body.items) ? body.items : [];

            renderFeed();

        } catch (error) {
            console.error('Error cargando noticias:', error);
            renderEmpty(
                'Ocurrió un problema',
                error.message || 'No se pudieron cargar las noticias.',
                true
            );

        } finally {
            state.busy = false;
        }
    }

    // ========================================================
    // COMPARTIR
    // ========================================================

    async function compartir(item) {
        if (!item) return;

        const url = urlSegura(item.fuentes?.[0]?.url);

        try {
            if (navigator.share) {
                await navigator.share({
                    title: item.titulo,
                    text: item.resumen,
                    url: url !== '#' ? url : undefined
                });
                return;
            }

            const texto = url !== '#' ? `${item.titulo}\n${url}` : item.titulo;

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(texto);
                toast('Enlace copiado');
            } else {
                toast('No se pudo copiar el enlace');
            }

        } catch (error) {
            if (error?.name !== 'AbortError') {
                toast('No se pudo compartir');
            }
        }
    }

    // ========================================================
    // GUARDADAS
    // ========================================================

    function toggleSaved(index, boton) {
        const item = state.items[index];
        if (!item) return;

        const id = String(
            item.id ?? item.fuentes?.[0]?.url ?? item.titulo ?? index
        );

        if (state.saved.has(id)) {
            state.saved.delete(id);
            boton.setAttribute('aria-pressed', 'false');
            toast('Quitada de guardadas');
        } else {
            state.saved.add(id);
            boton.setAttribute('aria-pressed', 'true');
            toast('Guardada');
        }

        persistSaved();
    }

    // ========================================================
    // EVENTOS FEED
    // ========================================================

    el.feed.addEventListener('click', (event) => {
        const boton = event.target.closest('[data-action]');
        if (!boton) return;

        const accion = boton.dataset.action;

        if (accion === 'retry') {
            loadFeed();
            return;
        }

        const tarjeta = boton.closest('[data-index]');
        const index = Number(tarjeta?.dataset.index);
        if (Number.isNaN(index)) return;

        if (accion === 'more') {
            const resumen = tarjeta.querySelector('[data-role="resumen"]');
            if (!resumen) return;

            const abierto = resumen.classList.toggle('open');
            boton.textContent = abierto ? 'Ver menos' : 'Ver más';

        } else if (accion === 'save') {
            toggleSaved(index, boton);

        } else if (accion === 'share') {
            compartir(state.items[index]);
        }
    });

    // ========================================================
    // CATEGORÍAS
    // ========================================================

    el.chips.addEventListener('click', (event) => {
        const chip = event.target.closest('.chip');
        if (!chip) return;

        el.chips.querySelectorAll('.chip').forEach((c) => {
            c.setAttribute('aria-selected', 'false');
        });

        chip.setAttribute('aria-selected', 'true');
        state.category = chip.dataset.category;
        loadFeed();
    });

    // ========================================================
    // PANEL DE PREGUNTAS
    // ========================================================

    function abrirHoja() {
        el.sheet.classList.add('on');
        el.backdrop.classList.add('on');
        setTimeout(() => el.input.focus(), 300);
    }

    function cerrarHoja() {
        el.sheet.classList.remove('on');
        el.backdrop.classList.remove('on');
    }

    function renderFuentes(fuentes) {
        const seguras = (fuentes || []).filter((f) => urlSegura(f.url) !== '#');

        el.answerSrc.innerHTML = seguras.map((f) => `
            <a href="${escapeHtml(urlSegura(f.url))}"
               target="_blank" rel="noopener noreferrer">
                ${escapeHtml(f.titulo || hostOf(f.url))}
            </a>
        `).join('');
    }

    function mostrarRespuesta(texto, esError) {
        el.answer.hidden = false;
        el.answer.className = esError ? 'answer err' : 'answer';
        el.answer.textContent = texto;
    }

    async function preguntar(texto) {
        const pregunta = String(texto || '').trim();

        if (!pregunta) {
            mostrarRespuesta('Escribe una pregunta antes de consultar.', true);
            return;
        }

        if (SALUDOS.test(pregunta) || pregunta.length < 6) {
            mostrarRespuesta(RESPUESTA_SALUDO, false);
            el.answerSrc.innerHTML = '';
            el.input.value = '';
            return;
        }

        if (!state.token) {
            mostrarRespuesta('Sesión no disponible. Vuelve a iniciar sesión.', true);
            return;
        }

        el.answer.hidden = false;
        el.answer.className = 'answer';
        el.answer.innerHTML = `
            <span class="thinking">
                <i></i><i></i><i></i>
                &nbsp;Buscando información actualizada
            </span>`;

        el.answerSrc.innerHTML = '';
        el.ask.disabled = true;

        try {
            const response = await fetch('/api/noticias/preguntar', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ pregunta })
            });

            if (response.status === 404) {
                throw new Error('El servicio de preguntas aún no está activo en el servidor.');
            }

            if (response.status === 429) {
                throw new Error('Llegaste al límite de consultas. Intenta en unos minutos.');
            }

            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(body.error || 'No se pudo consultar');
            }

            el.answer.textContent = body.respuesta || 'No hubo respuesta disponible.';
            renderFuentes(body.fuentes);
            el.input.value = '';

        } catch (error) {
            mostrarRespuesta(error.message || 'Error al consultar', true);
        } finally {
            el.ask.disabled = false;
        }
    }

    // ========================================================
    // EVENTOS GENERALES
    // ========================================================

    el.fab.addEventListener('click', abrirHoja);
    el.close.addEventListener('click', cerrarHoja);
    el.backdrop.addEventListener('click', cerrarHoja);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') cerrarHoja();
    });

    el.ask.addEventListener('click', () => preguntar(el.input.value));

    el.input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') preguntar(el.input.value);
    });

    el.suggest.addEventListener('click', (event) => {
        const boton = event.target.closest('[data-q]');
        if (!boton) return;

        el.input.value = boton.dataset.q;
        preguntar(boton.dataset.q);
    });

    // ========================================================
    // INICIALIZACIÓN
    // ========================================================

    async function iniciarNoticias() {
        instalarEstilos();

        const ok = await fetchSession();

        if (ok) {
            await loadFeed();
        } else {
            renderEmpty(
                'Inicia sesión',
                'Debes iniciar sesión con Supabase para usar esta sección.',
                false
            );
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciarNoticias, { once: true });
    } else {
        iniciarNoticias();
    }

})();