
/* ================================================================
   SARIEL'S ECOSYSTEM · APARIENCIA GLOBAL v3.1
   Archivo: backend/public/features/js/apariencia-global.js

   Conserva:
   - Preferencias locales y Supabase.
   - Tema, color de acento y tamaño de fuente.
   - window.SarielApariencia y sus métodos públicos.
   - Inyección de Marquinhos, Capitán Maíz e Itlasuhua.
   - Rutas, identificadores y eventos existentes.

   Mejoras:
   - Entrada suave de página.
   - Microinteracciones táctiles y glow.
   - Transiciones de secciones y pestañas visibles.
   - Animaciones ligeras mediante transform y opacity.
   - Respeto a prefers-reduced-motion.
   ================================================================ */

(function () {
    'use strict';

    if (window.__sarielsAparienciaV31) return;
    window.__sarielsAparienciaV31 = true;

    const KEYS = {
        tema: 'mostrar_tema',
        tamano_fuente: 'mostrar_tamano_fuente',
        color_acento: 'mostrar_color_acento'
    };

    const DEFAULTS = {
        tema: 'sistema',
        tamano_fuente: 100,
        color_acento: '#D4AF37'
    };

    let prefsActuales = { ...DEFAULTS };
    let syncConSupabaseListo = false;

    /* ================================================================
       SUPABASE
       Reutiliza el cliente compartido. No crea otro cliente.
       ================================================================ */

    function getSupabase() {
        return window.supabaseClient || null;
    }

    function leerPref(clave, defecto) {
        try {
            const valor = localStorage.getItem(clave);
            return valor !== null ? valor : defecto;
        } catch (_) {
            return defecto;
        }
    }

    function normalizarTema(valor) {
        return ['sistema', 'dia', 'noche'].includes(valor)
            ? valor
            : DEFAULTS.tema;
    }

    function normalizarFuente(valor) {
        const numero = Number.parseInt(valor, 10);
        return Number.isFinite(numero)
            ? Math.max(80, Math.min(140, numero))
            : DEFAULTS.tamano_fuente;
    }

    function normalizarColor(valor) {
        return typeof valor === 'string' &&
            /^#[0-9a-fA-F]{6}$/.test(valor)
            ? valor
            : DEFAULTS.color_acento;
    }

    function leerDeLocalStorage() {
        return {
            tema: normalizarTema(
                leerPref(KEYS.tema, DEFAULTS.tema)
            ),
            tamano_fuente: normalizarFuente(
                leerPref(
                    KEYS.tamano_fuente,
                    DEFAULTS.tamano_fuente
                )
            ),
            color_acento: normalizarColor(
                leerPref(
                    KEYS.color_acento,
                    DEFAULTS.color_acento
                )
            )
        };
    }

    async function leerDeSupabase() {
        try {
            const client = getSupabase();
            if (!client) return null;

            const sessionResult = await client.auth.getSession();
            const session = sessionResult?.data?.session;

            if (sessionResult?.error || !session?.user) {
                return null;
            }

            try {
                const { data, error } = await client.rpc(
                    'obtener_mis_preferencias'
                );

                if (!error && data) {
                    const datos = data.prefs &&
                        typeof data.prefs === 'object'
                        ? data.prefs
                        : data;

                    return {
                        tema: normalizarTema(
                            datos.mostrar_tema || DEFAULTS.tema
                        ),
                        tamano_fuente: normalizarFuente(
                            datos.mostrar_tamano_fuente
                        ),
                        color_acento: normalizarColor(
                            datos.mostrar_color_acento
                        )
                    };
                }
            } catch (error) {
                console.warn(
                    '[Apariencia] RPC de preferencias no disponible:',
                    error
                );
            }

            const { data: pref, error } = await client
                .from('preferencias_usuario')
                .select('prefs')
                .eq('usuario_id', session.user.id)
                .maybeSingle();

            if (error || !pref?.prefs) return null;

            return {
                tema: normalizarTema(
                    pref.prefs.mostrar_tema || DEFAULTS.tema
                ),
                tamano_fuente: normalizarFuente(
                    pref.prefs.mostrar_tamano_fuente
                ),
                color_acento: normalizarColor(
                    pref.prefs.mostrar_color_acento
                )
            };
        } catch (error) {
            console.warn(
                '[Apariencia] Error leyendo Supabase:',
                error
            );
            return null;
        }
    }

    async function guardarPref(clave, valor) {
        try {
            localStorage.setItem(clave, String(valor));
        } catch (error) {
            console.warn(
                '[Apariencia] No se pudo guardar localmente:',
                error
            );
        }

        const client = getSupabase();
        if (!client) return;

        try {
            const sessionResult = await client.auth.getSession();
            const session = sessionResult?.data?.session;

            if (!session?.user) return;

            const keyPrefs =
                clave === KEYS.tema ? 'mostrar_tema' :
                clave === KEYS.tamano_fuente
                    ? 'mostrar_tamano_fuente' :
                clave === KEYS.color_acento
                    ? 'mostrar_color_acento' :
                clave;

            const rpc = await client.rpc(
                'actualizar_preferencia',
                {
                    p_key: keyPrefs,
                    p_value: valor
                }
            );

            if (!rpc.error) return;

            const { data: pref } = await client
                .from('preferencias_usuario')
                .select('prefs')
                .eq('usuario_id', session.user.id)
                .maybeSingle();

            const nuevoPrefs = {
                ...(pref?.prefs || {}),
                [keyPrefs]: valor
            };

            const resultado = await client
                .from('preferencias_usuario')
                .upsert(
                    {
                        usuario_id: session.user.id,
                        prefs: nuevoPrefs
                    },
                    { onConflict: 'usuario_id' }
                );

            if (resultado.error) {
                console.warn(
                    '[Apariencia] Error guardando preferencias:',
                    resultado.error
                );
            }
        } catch (error) {
            console.warn(
                '[Apariencia] No se pudo guardar en Supabase:',
                error
            );
        }
    }

    /* ================================================================
       COLOR Y APARIENCIA
       ================================================================ */

    function ajustarColor(hex, porcentaje) {
        try {
            if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
                return DEFAULTS.color_acento;
            }

            let r = parseInt(hex.substring(1, 3), 16);
            let g = parseInt(hex.substring(3, 5), 16);
            let b = parseInt(hex.substring(5, 7), 16);

            const factor = porcentaje / 100;

            if (factor > 0) {
                r = Math.round(r + (255 - r) * factor);
                g = Math.round(g + (255 - g) * factor);
                b = Math.round(b + (255 - b) * factor);
            } else {
                r = Math.round(r * (1 + factor));
                g = Math.round(g * (1 + factor));
                b = Math.round(b * (1 + factor));
            }

            return '#' + [r, g, b]
                .map(valor => Math.max(0, Math.min(255, valor))
                    .toString(16).padStart(2, '0'))
                .join('');
        } catch (_) {
            return DEFAULTS.color_acento;
        }
    }

    function aplicarTema(tema) {
        const html = document.documentElement;
        tema = normalizarTema(tema);

        html.classList.remove('tema-dia', 'tema-noche');
        html.removeAttribute('data-tema');

        if (tema === 'dia') {
            html.classList.add('tema-dia');
            html.setAttribute('data-tema', 'dia');
        } else if (tema === 'noche') {
            html.classList.add('tema-noche');
            html.setAttribute('data-tema', 'noche');
        } else {
            const oscuro = window.matchMedia &&
                window.matchMedia(
                    '(prefers-color-scheme: dark)'
                ).matches;

            html.setAttribute(
                'data-tema',
                oscuro ? 'noche' : 'dia'
            );
            html.classList.add(
                oscuro ? 'tema-noche' : 'tema-dia'
            );
        }
    }

    function aplicarColorAcento(color) {
        const html = document.documentElement;
        color = normalizarColor(color);

        html.style.setProperty('--gold', color);
        html.style.setProperty('--gold-dark', ajustarColor(color, -15));
        html.style.setProperty('--gold-light', ajustarColor(color, 15));
        html.style.setProperty('--gold-bright', ajustarColor(color, 25));
        html.style.setProperty('--cfg-gold', color);
        html.style.setProperty('--accent', color);
        html.style.setProperty('--accent-dark', ajustarColor(color, -15));
        html.style.setProperty('--accent-light', ajustarColor(color, 15));

        html.style.setProperty(
            '--sariel-glow',
            '0 0 14px ' + ajustarColor(color, 5) + '40'
        );
    }

    function aplicarTamanoFuente(porcentaje) {
        const html = document.documentElement;
        const valor = normalizarFuente(porcentaje);

        html.style.fontSize = (16 * valor / 100) + 'px';
        html.setAttribute('data-font-size', String(valor));
        html.style.setProperty(
            '--preview-size',
            (15 * valor / 100) + 'px'
        );
    }

    function aplicarTodo(prefs) {
        const p = prefs || prefsActuales;

        const seguras = {
            tema: normalizarTema(p.tema),
            tamano_fuente: normalizarFuente(p.tamano_fuente),
            color_acento: normalizarColor(p.color_acento)
        };

        aplicarTema(seguras.tema);
        aplicarColorAcento(seguras.color_acento);
        aplicarTamanoFuente(seguras.tamano_fuente);

        prefsActuales = { ...seguras };
    }

    /* ================================================================
       SISTEMA VISUAL GLOBAL
       No reemplaza CSS existente ni intercepta la navegación.
       ================================================================ */

    function instalarEstilosGlobales() {
        if (document.getElementById('sariels-motion-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'sariels-motion-styles';

        style.textContent = `
            :root {
                --sariel-motion-fast: 150ms;
                --sariel-motion-normal: 210ms;
                --sariel-motion-slow: 280ms;
                --sariel-ease: cubic-bezier(.22, 1, .36, 1);
                --sariel-glow:
                    0 0 14px rgba(212, 175, 55, .25);
            }

            @keyframes sarielPageEnter {
                from {
                    opacity: 0;
                    transform: translate3d(0, 5px, 0);
                }
                to {
                    opacity: 1;
                    transform: translate3d(0, 0, 0);
                }
            }

            @keyframes sarielSectionEnter {
                from {
                    opacity: 0;
                    transform: translate3d(0, 7px, 0);
                }
                to {
                    opacity: 1;
                    transform: translate3d(0, 0, 0);
                }
            }

            @keyframes sarielGlowPulse {
                0%, 100% {
                    box-shadow: 0 0 0 rgba(212, 175, 55, 0);
                }
                50% {
                    box-shadow: var(--sariel-glow);
                }
            }

            html.sariel-motion-ready body {
                animation: sarielPageEnter 220ms
                    var(--sariel-ease) both;
            }

            html.sariel-motion-ready
            :is(
                button,
                [role="button"],
                .cfg-btn,
                .cfg-item,
                .cfg-header-back,
                .cfg-header-action,
                .cfg-toggle-slider
            ) {
                -webkit-tap-highlight-color: transparent;
                transition:
                    transform var(--sariel-motion-fast)
                        var(--sariel-ease),
                    box-shadow var(--sariel-motion-normal) ease,
                    filter var(--sariel-motion-normal) ease,
                    border-color var(--sariel-motion-normal) ease;
            }

            html.sariel-motion-ready
            :is(
                button,
                [role="button"],
                .cfg-btn,
                .cfg-header-back,
                .cfg-header-action
            ):active {
                transform: scale(.965);
                filter: brightness(1.12);
            }

            html.sariel-motion-ready
            :is(
                button,
                [role="button"],
                .cfg-btn,
                .cfg-item,
                .cfg-header-back,
                .cfg-header-action
            ):focus-visible {
                outline: 2px solid var(--accent, #D4AF37);
                outline-offset: 3px;
                box-shadow: var(--sariel-glow);
            }

            html.sariel-motion-ready
            :is(
                .cfg-item,
                .card,
                .feed-card,
                .post-card,
                .product-card,
                .channel-card,
                .profile-card,
                .market-card
            ):active {
                transform: scale(.992);
            }

            html.sariel-motion-ready
            :is(
                .cfg-item,
                .card,
                .feed-card,
                .post-card,
                .product-card,
                .channel-card,
                .profile-card,
                .market-card
            ):hover {
                border-color: color-mix(
                    in srgb,
                    var(--accent, #D4AF37) 38%,
                    transparent
                );
            }

            html.sariel-motion-ready
            :is(
                input,
                textarea,
                select
            ):focus-visible {
                outline: 2px solid color-mix(
                    in srgb,
                    var(--accent, #D4AF37) 70%,
                    transparent
                );
                outline-offset: 2px;
            }

            html.sariel-motion-ready
            :is(
                .tab-content,
                [role="tabpanel"],
                .section-content,
                .page-section,
                .view-content
            ).sariel-section-enter {
                animation: sarielSectionEnter 190ms
                    var(--sariel-ease) both;
            }

            @media (hover: hover) and (pointer: fine) {
                html.sariel-motion-ready
                :is(
                    button,
                    .cfg-btn,
                    .cfg-header-back,
                    .cfg-header-action
                ):hover {
                    box-shadow: var(--sariel-glow);
                }
            }

            @media (prefers-reduced-motion: reduce) {
                html.sariel-motion-ready *,
                html.sariel-motion-ready *::before,
                html.sariel-motion-ready *::after {
                    animation-duration: .01ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: .01ms !important;
                    scroll-behavior: auto !important;
                }
            }
        `;

        (document.head || document.documentElement)
            .appendChild(style);

        const activar = function () {
            requestAnimationFrame(function () {
                document.documentElement.classList.add(
                    'sariel-motion-ready'
                );
            });
        };

        if (document.readyState === 'loading') {
            document.addEventListener(
                'DOMContentLoaded',
                activar,
                { once: true }
            );
        } else {
            activar();
        }
    }

    function instalarTransicionesDeSeccion() {
        if (window.__sarielsSectionMotionInstalled) return;
        window.__sarielsSectionMotionInstalled = true;

        const selectores = [
            '.tab-content',
            '[role="tabpanel"]',
            '.section-content',
            '.page-section',
            '.view-content'
        ].join(',');

        function visible(elemento) {
            if (!(elemento instanceof Element)) return false;
            if (elemento.hidden) return false;
            if (elemento.getAttribute('aria-hidden') === 'true') {
                return false;
            }

            const estilo = window.getComputedStyle(elemento);

            return estilo.display !== 'none' &&
                estilo.visibility !== 'hidden';
        }

        function animar(elemento) {
            if (!visible(elemento)) return;

            elemento.classList.remove('sariel-section-enter');

            // Reinicia solo la animación del panel que cambió.
            void elemento.offsetWidth;

            elemento.classList.add('sariel-section-enter');

            elemento.addEventListener(
                'animationend',
                function limpiarAnimacion() {
                    elemento.classList.remove(
                        'sariel-section-enter'
                    );
                },
                { once: true }
            );
        }

        document.addEventListener('click', function (evento) {
            const objetivo = evento.target instanceof Element
                ? evento.target.closest(
                    '[role="tab"], [data-tab], .tab-button, .nav-tab'
                )
                : null;

            if (!objetivo) return;

            // No cancela el evento ni modifica la lógica de navegación.
            requestAnimationFrame(function () {
                document.querySelectorAll(selectores)
                    .forEach(function (panel) {
                        if (visible(panel)) animar(panel);
                    });
            });
        }, true);

        if ('MutationObserver' in window) {
            const observer = new MutationObserver(function (mutaciones) {
                const pendientes = new Set();

                mutaciones.forEach(function (mutacion) {
                    const elemento = mutacion.target instanceof Element
                        ? mutacion.target
                        : mutacion.target.parentElement;

                    if (!elemento) return;

                    if (elemento.matches(selectores)) {
                        pendientes.add(elemento);
                    } else {
                        const panel = elemento.closest(selectores);
                        if (panel) pendientes.add(panel);
                    }
                });

                pendientes.forEach(function (panel) {
                    if (visible(panel)) animar(panel);
                });
            });

            function observar() {
                if (!document.body) return;

                observer.observe(document.body, {
                    subtree: true,
                    attributes: true,
                    attributeFilter: [
                        'class',
                        'style',
                        'hidden',
                        'aria-hidden'
                    ]
                });
            }

            if (document.readyState === 'loading') {
                document.addEventListener(
                    'DOMContentLoaded',
                    observar,
                    { once: true }
                );
            } else {
                observar();
            }
        }
    }

    instalarEstilosGlobales();
    instalarTransicionesDeSeccion();

    /* ================================================================
       INICIALIZACIÓN Y SINCRONIZACIÓN
       ================================================================ */

    async function inicializar() {
        const prefsLocal = leerDeLocalStorage();
        aplicarTodo(prefsLocal);

        let intentos = 0;

        while (!getSupabase() && intentos < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            intentos++;
        }

        const prefsSupabase = await leerDeSupabase();

        if (prefsSupabase) {
            const diferentes =
                prefsSupabase.tema !== prefsLocal.tema ||
                prefsSupabase.tamano_fuente !==
                    prefsLocal.tamano_fuente ||
                prefsSupabase.color_acento !==
                    prefsLocal.color_acento;

            if (diferentes) {
                aplicarTodo(prefsSupabase);

                try {
                    localStorage.setItem(
                        KEYS.tema,
                        prefsSupabase.tema
                    );
                    localStorage.setItem(
                        KEYS.tamano_fuente,
                        String(prefsSupabase.tamano_fuente)
                    );
                    localStorage.setItem(
                        KEYS.color_acento,
                        prefsSupabase.color_acento
                    );
                } catch (_) {}

                console.log(
                    '[Apariencia] Preferencias sincronizadas desde Supabase.'
                );
            }
        }

        syncConSupabaseListo = true;
    }

    window.addEventListener('storage', function (evento) {
        if (
            evento.key &&
            Object.values(KEYS).includes(evento.key)
        ) {
            aplicarTodo(leerDeLocalStorage());
        }
    });

    try {
        const mq = window.matchMedia(
            '(prefers-color-scheme: dark)'
        );

        const cambiarSistema = function () {
            if (prefsActuales.tema === 'sistema') {
                aplicarTema('sistema');
            }
        };

        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', cambiarSistema);
        } else if (typeof mq.addListener === 'function') {
            mq.addListener(cambiarSistema);
        }
    } catch (_) {}

    inicializar();

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            function () {
                aplicarTodo();
            },
            { once: true }
        );
    }

    window.SarielApariencia = {
        aplicar: aplicarTodo,
        aplicarTema: aplicarTema,
        aplicarColorAcento: aplicarColorAcento,
        aplicarTamanoFuente: aplicarTamanoFuente,
        leer: leerDeLocalStorage,
        leerSupabase: leerDeSupabase,
        guardarPref: guardarPref,

        setTema: function (tema) {
            tema = normalizarTema(tema);
            prefsActuales.tema = tema;
            aplicarTema(tema);
            return guardarPref(KEYS.tema, tema);
        },

        setColor: function (color) {
            color = normalizarColor(color);
            prefsActuales.color_acento = color;
            aplicarColorAcento(color);
            return guardarPref(KEYS.color_acento, color);
        },

        setFuente: function (fuente) {
            fuente = normalizarFuente(fuente);
            prefsActuales.tamano_fuente = fuente;
            aplicarTamanoFuente(fuente);
            return guardarPref(KEYS.tamano_fuente, fuente);
        },

        recargar: inicializar,
        KEYS: KEYS,
        DEFAULTS: DEFAULTS,

        // Disponible para diagnóstico sin cambiar la API anterior.
        get sincronizacionLista() {
            return syncConSupabaseListo;
        }
    };

    /* ================================================================
       MASCOTAS
       Conserva rutas, identificadores y orden de carga originales.
       ================================================================ */

    function getMascotaActiva() {
        try {
            return localStorage.getItem('mascota_activa') ||
                'marquinhos';
        } catch (_) {
            return 'marquinhos';
        }
    }

    function rutaExcluida(rutas) {
        const path = window.location.pathname.toLowerCase();

        return rutas.some(function (ruta) {
            return path.indexOf(ruta) !== -1;
        });
    }

    function insertarArchivo(etiqueta, id, src, defer, onload) {
        if (document.getElementById(id)) return;

        const elemento = document.createElement(etiqueta);
        elemento.id = id;
        elemento.src = src;

        if (defer && etiqueta === 'script') {
            elemento.defer = true;
        }

        if (typeof onload === 'function') {
            elemento.onload = onload;
        }

        document.head.appendChild(elemento);
    }

    function insertarCSS(id, href) {
        if (document.getElementById(id)) return;

        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.id = id;
        css.href = href;
        document.head.appendChild(css);
    }

    function cuandoDOMListo(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener(
                'DOMContentLoaded',
                callback,
                { once: true }
            );
        } else {
            callback();
        }
    }

    (function inyectarMarquinhosPet() {
        if (getMascotaActiva() !== 'marquinhos') return;

        if (rutaExcluida([
            '/login', '/registro',
            '/pagar', '/pay', '/checkout', '/success', '/cancel',
            '/terminos', '/privacidad', '/cookies', '/legal',
            '/info', '/live-terminos', '/eliminar-cuenta',
            '/actualizar-contrasena',
            '/features/marquinhos/tienda'
        ])) return;

        if (document.getElementById('marquinhos-pet-script')) return;

        cuandoDOMListo(function () {
            insertarCSS(
                'marquinhos-pet-css',
                '/features/marquinhos/marquinhos-pet.css'
            );

            [
                ['marquinhos-boca-script',
                    '/features/marquinhos/marquinhos-boca.js'],
                ['marquinhos-fit-script',
                    '/features/marquinhos/marquinhos-fit.js'],
                ['marquinhos-accesorios-svg-script',
                    '/features/marquinhos/marquinhos-accesorios-svg.js'],
                ['marquinhos-anim-script',
                    '/features/marquinhos/marquinhos-animaciones.js'],
                ['marquinhos-pet-script',
                    '/features/marquinhos/marquinhos-pet.js'],
                ['marquinhos-brain-script',
                    '/features/marquinhos/marquinhos-brain.js']
            ].forEach(function (archivo) {
                insertarArchivo(
                    'script',
                    archivo[0],
                    archivo[1],
                    true
                );
            });
        });
    })();

    (function inyectarCapitanMaizPet() {
        if (getMascotaActiva() !== 'capitan-maiz') return;

        if (rutaExcluida([
            '/login', '/registro',
            '/pagar', '/pay', '/checkout', '/success', '/cancel',
            '/terminos', '/privacidad', '/cookies', '/legal',
            '/info', '/live-terminos', '/eliminar-cuenta',
            '/actualizar-contrasena',
            '/features/capitan-maiz/tienda'
        ])) return;

        if (document.getElementById('capitan-maiz-pet-script')) return;

        cuandoDOMListo(function () {
            insertarCSS(
                'capitan-maiz-pet-css',
                '/features/capitan-maiz/capitan-maiz-pet.css'
            );

            [
                ['capitan-maiz-fit-script',
                    '/features/capitan-maiz/capitan-maiz-fit.js'],
                ['capitan-maiz-pet-script',
                    '/features/capitan-maiz/capitan-maiz-pet.js'],
                ['capitan-maiz-brain-script',
                    '/features/capitan-maiz/capitan-maiz-brain.js']
            ].forEach(function (archivo) {
                insertarArchivo(
                    'script',
                    archivo[0],
                    archivo[1],
                    true
                );
            });
        });
    })();

    (function inyectarItlasuhuaPet() {
        if (getMascotaActiva() !== 'itlasuhua') return;

        if (rutaExcluida([
            '/login', '/registro',
            '/pagar', '/pay', '/checkout', '/success', '/cancel',
            '/terminos', '/privacidad', '/cookies', '/legal',
            '/info', '/live-terminos', '/eliminar-cuenta',
            '/actualizar-contrasena',
            '/features/itlasuhua/tienda'
        ])) return;

        if (document.getElementById('itlasuhua-pet-script')) return;

        cuandoDOMListo(function () {
            insertarCSS(
                'itlasuhua-pet-css',
                '/features/itlasuhua/itlasuhua-pet.css'
            );

            insertarArchivo(
                'script',
                'itlasuhua-pet-script',
                '/features/itlasuhua/itlasuhua-pet.js',
                true,
                function () {
                    if (
                        window.ItlasuhuaPet &&
                        typeof window.ItlasuhuaPet.crearWidget ===
                            'function'
                    ) {
                        window.ItlasuhuaPet.crearWidget();
                    }
                }
            );

            insertarArchivo(
                'script',
                'itlasuhua-brain-script',
                '/features/itlasuhua/itlasuhua-brain.js',
                true
            );

            insertarArchivo(
                'script',
                'itlasuhua-voice-script',
                '/features/itlasuhua/itlasuhua-voice.js',
                true
            );
        });
    })();

    console.log(
        '[Apariencia] Módulo global v3.1 cargado. Mascota activa:',
        getMascotaActiva()
    );
})();
