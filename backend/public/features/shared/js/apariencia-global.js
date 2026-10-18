/* ================================================================
   SARIEL'S ECOSYSTEM · APARIENCIA GLOBAL v3.3
   Archivo: backend/public/features/js/apariencia-global.js

   Conserva sin cambios:
   - Preferencias locales y sincronización con Supabase.
   - Tema, color de acento y tamaño de fuente (80–140 %).
   - window.SarielApariencia y todas sus funciones públicas.
   - Carga exclusiva de la mascota activa.

   v3.3:
   - Nuevo cuarto tema "bn" (Blanco y negro, estilo X en negro).
   - Temas válidos: sistema, dia, noche, bn.
   - CSS del tema "bn" inyectado una sola vez.

   v3.2:
   - Microinteracciones táctiles con transform y brillo (sin tocar layout).
   - Entrada suave de tarjetas y encabezados (sin ocultar contenido).
   - CSS inyectado consolidado en una sola lista de selectores.
   - prefers-reduced-motion respetado en todas las animaciones.

   No modifica anchos, alturas, márgenes ni escalas de contenedores.
   ================================================================ */

(function () {
    'use strict';

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

    // Temas válidos. Si se agrega otro, añadirlo aquí y en aplicarTema().
    const TEMAS_VALIDOS = ['sistema', 'dia', 'noche', 'bn'];

    let prefsActuales = { ...DEFAULTS };
    let syncConSupabaseListo = false;
    let inicializacionEnCurso = null;

    /* ================================================================
       SUPABASE COMPARTIDO
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
        return TEMAS_VALIDOS.includes(valor)
            ? valor
            : DEFAULTS.tema;
    }

    function normalizarColor(valor) {
        return typeof valor === 'string' &&
            /^#[0-9a-fA-F]{6}$/.test(valor)
            ? valor
            : DEFAULTS.color_acento;
    }

    function normalizarFuente(valor) {
        const numero = Number.parseInt(valor, 10);

        return Number.isFinite(numero)
            ? Math.max(80, Math.min(140, numero))
            : DEFAULTS.tamano_fuente;
    }

    function normalizarPreferencias(datos) {
        datos = datos || {};

        return {
            tema: normalizarTema(datos.tema),
            tamano_fuente: normalizarFuente(datos.tamano_fuente),
            color_acento: normalizarColor(datos.color_acento)
        };
    }

    function leerDeLocalStorage() {
        return normalizarPreferencias({
            tema: leerPref(KEYS.tema, DEFAULTS.tema),
            tamano_fuente: leerPref(
                KEYS.tamano_fuente,
                DEFAULTS.tamano_fuente
            ),
            color_acento: leerPref(
                KEYS.color_acento,
                DEFAULTS.color_acento
            )
        });
    }

    async function leerDeSupabase() {
        try {
            const client = getSupabase();
            if (!client) return null;

            const resultadoSesion = await client.auth.getSession();

            if (
                resultadoSesion.error ||
                !resultadoSesion.data?.session?.user
            ) {
                return null;
            }

            try {
                const resultado = await client.rpc(
                    'obtener_mis_preferencias'
                );

                if (!resultado.error && resultado.data) {
                    let datos = resultado.data;

                    if (
                        datos.prefs &&
                        typeof datos.prefs === 'object'
                    ) {
                        datos = datos.prefs;
                    }

                    return normalizarPreferencias({
                        tema: datos.mostrar_tema,
                        tamano_fuente: datos.mostrar_tamano_fuente,
                        color_acento: datos.mostrar_color_acento
                    });
                }
            } catch (error) {
                console.warn(
                    '[Apariencia] RPC de lectura no disponible:',
                    error
                );
            }

            const resultadoTabla = await client
                .from('preferencias_usuario')
                .select('prefs')
                .eq(
                    'usuario_id',
                    resultadoSesion.data.session.user.id
                )
                .maybeSingle();

            if (
                resultadoTabla.error ||
                !resultadoTabla.data?.prefs
            ) {
                return null;
            }

            const prefs = resultadoTabla.data.prefs;

            return normalizarPreferencias({
                tema: prefs.mostrar_tema,
                tamano_fuente: prefs.mostrar_tamano_fuente,
                color_acento: prefs.mostrar_color_acento
            });
        } catch (error) {
            console.warn(
                '[Apariencia] Error leyendo preferencias:',
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
            const resultadoSesion = await client.auth.getSession();
            const usuario = resultadoSesion.data?.session?.user;

            if (!usuario) return;

            const keyPrefs =
                clave === KEYS.tema
                    ? 'mostrar_tema'
                    : clave === KEYS.tamano_fuente
                        ? 'mostrar_tamano_fuente'
                        : clave === KEYS.color_acento
                            ? 'mostrar_color_acento'
                            : clave;

            let rpcCorrecto = false;

            try {
                const resultado = await client.rpc(
                    'actualizar_preferencia',
                    {
                        p_key: keyPrefs,
                        p_value: valor
                    }
                );

                rpcCorrecto = !resultado.error;
            } catch (error) {
                console.warn(
                    '[Apariencia] No se pudo actualizar mediante RPC:',
                    error
                );
            }

            if (rpcCorrecto) return;

            const resultadoActual = await client
                .from('preferencias_usuario')
                .select('prefs')
                .eq('usuario_id', usuario.id)
                .maybeSingle();

            if (resultadoActual.error) {
                console.warn(
                    '[Apariencia] No se pudieron recuperar las preferencias:',
                    resultadoActual.error
                );
                return;
            }

            const nuevoPrefs = {
                ...(resultadoActual.data?.prefs || {}),
                [keyPrefs]: valor
            };

            const resultadoGuardar = await client
                .from('preferencias_usuario')
                .upsert(
                    {
                        usuario_id: usuario.id,
                        prefs: nuevoPrefs
                    },
                    { onConflict: 'usuario_id' }
                );

            if (resultadoGuardar.error) {
                console.warn(
                    '[Apariencia] Error guardando preferencias:',
                    resultadoGuardar.error
                );
            }
        } catch (error) {
            console.warn(
                '[Apariencia] No se pudo sincronizar con Supabase:',
                error
            );
        }
    }

    /* ================================================================
       COLOR
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

            r = Math.max(0, Math.min(255, r));
            g = Math.max(0, Math.min(255, g));
            b = Math.max(0, Math.min(255, b));

            return '#' + [r, g, b]
                .map(function (numero) {
                    return numero.toString(16).padStart(2, '0');
                })
                .join('');
        } catch (_) {
            return hex;
        }
    }

    /* ================================================================
       TEMA
       ================================================================ */

    /*
     * Tema "bn" (Blanco y negro): fondo negro puro y textos grises
     * claros, al estilo del modo negro de X. Solo cambia colores;
     * no toca dimensiones ni layout.
     */
    const CSS_TEMA_BN = `
        html.tema-bn {
            color-scheme: dark;
            --bg: #000000;
            --bg-color: #000000;
            --bg-primary: #000000;
            --bg-secondary: #16181c;
            --card: #16181c;
            --surface: #16181c;
            --text: #e7e9ea;
            --text-color: #e7e9ea;
            --text-primary: #e7e9ea;
            --text-secondary: #71767b;
            --muted: #71767b;
            --border: #2f3336;
            --border-color: #2f3336;
        }

        html.tema-bn,
        html.tema-bn body {
            background: #000000 !important;
            color: #e7e9ea;
        }
    `;

    function instalarTemaBN() {
        if (document.getElementById('sariels-tema-bn-css')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'sariels-tema-bn-css';
        style.textContent = CSS_TEMA_BN;

        (document.head || document.documentElement).appendChild(style);
    }

    function aplicarTema(tema) {
        const html = document.documentElement;
        tema = normalizarTema(tema);

        html.classList.remove('tema-dia', 'tema-noche', 'tema-bn');
        html.removeAttribute('data-tema');

        if (tema === 'dia') {
            html.classList.add('tema-dia');
            html.setAttribute('data-tema', 'dia');
            return;
        }

        if (tema === 'noche') {
            html.classList.add('tema-noche');
            html.setAttribute('data-tema', 'noche');
            return;
        }

        if (tema === 'bn') {
            instalarTemaBN();
            html.classList.add('tema-bn');
            html.setAttribute('data-tema', 'bn');
            return;
        }

        const prefiereOscuro = Boolean(
            window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
        );

        const temaSistema = prefiereOscuro ? 'noche' : 'dia';

        html.setAttribute('data-tema', temaSistema);
        html.classList.add(
            temaSistema === 'noche' ? 'tema-noche' : 'tema-dia'
        );
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
    }

    function aplicarTamanoFuente(porcentaje) {
        const html = document.documentElement;
        const valor = normalizarFuente(porcentaje);

        /*
         * Se conserva el ajuste original de Configuración.
         * No se modifica el ancho, alto, zoom ni escala de los
         * contenedores. El tamaño raíz sigue siendo compatible
         * con los diseños que usan rem.
         */
        html.style.fontSize = (16 * valor / 100) + 'px';
        html.setAttribute('data-font-size', String(valor));

        html.style.setProperty(
            '--preview-size',
            (15 * valor / 100) + 'px'
        );
    }

    function aplicarTodo(prefs) {
        const p = normalizarPreferencias(prefs || prefsActuales);

        aplicarTema(p.tema);
        aplicarColorAcento(p.color_acento);
        aplicarTamanoFuente(p.tamano_fuente);

        prefsActuales = { ...p };
    }

    /* ================================================================
       MICROINTERACCIONES
       Solo transform, brillo, color y sombra: nunca dimensiones,
       márgenes ni escalas de contenedores.
       ================================================================ */

    // Lista única de elementos interactivos (antes estaba repetida)
    // Solo elementos de Configuración: nunca botones ni enlaces globales,
    // para no afectar a la mascota ni al resto de la app.
    const SELECTOR_INTERACTIVO = [
        '.cfg-item',
        '.cfg-btn',
        '.cfg-header-back',
        '.cfg-header-action'
    ].join(',');

    // Elementos que reaccionan al toque con una compresión sutil
    const SELECTOR_PRESIONABLE = SELECTOR_INTERACTIVO;

    // Elementos que se animan al entrar (solo opacidad, nunca ocultan contenido)
    const SELECTOR_ENTRADA = '.cfg-item, .cfg-header';

    const CSS_MICROINTERACCIONES = `
        ${SELECTOR_INTERACTIVO} {
            -webkit-tap-highlight-color: transparent;
            transition:
                color 140ms ease,
                background-color 160ms ease,
                border-color 160ms ease,
                box-shadow 180ms ease,
                filter 140ms ease,
                transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        ${SELECTOR_PRESIONABLE}:active {
            transform: scale(0.98);
            filter: brightness(1.08);
        }

        ${SELECTOR_INTERACTIVO}:focus-visible {
            outline: 2px solid var(--accent, #D4AF37);
            outline-offset: 2px;
        }

        @media (hover: hover) and (pointer: fine) {
            ${SELECTOR_PRESIONABLE}:hover {
                box-shadow: 0 0 0 1px
                    color-mix(in srgb, var(--accent, #D4AF37) 22%, transparent);
            }
        }

        @keyframes sarielFadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
        }

        ${SELECTOR_ENTRADA} {
            animation: sarielFadeIn 220ms ease both;
        }

        @media (prefers-reduced-motion: reduce) {
            ${SELECTOR_INTERACTIVO},
            ${SELECTOR_ENTRADA} {
                transition: none !important;
                animation: none !important;
            }

            ${SELECTOR_PRESIONABLE}:active {
                transform: none !important;
            }
        }
    `;

    function instalarMicrointeracciones() {
        if (document.getElementById('sariels-motion-safe-css')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'sariels-motion-safe-css';
        style.textContent = CSS_MICROINTERACCIONES;

        (document.head || document.documentElement).appendChild(style);
    }

    /* ================================================================
       INICIALIZACIÓN Y SINCRONIZACIÓN
       ================================================================ */

    async function inicializar() {
        if (inicializacionEnCurso) {
            return inicializacionEnCurso;
        }

        inicializacionEnCurso = (async function () {
            const prefsLocal = leerDeLocalStorage();
            aplicarTodo(prefsLocal);

            let intentos = 0;

            while (!getSupabase() && intentos < 20) {
                await new Promise(function (resolve) {
                    setTimeout(resolve, 100);
                });

                intentos++;
            }

            const prefsSupabase = await leerDeSupabase();

            if (prefsSupabase) {
                const hayDiferencias =
                    prefsSupabase.tema !== prefsLocal.tema ||
                    prefsSupabase.tamano_fuente !==
                        prefsLocal.tamano_fuente ||
                    prefsSupabase.color_acento !==
                        prefsLocal.color_acento;

                if (hayDiferencias) {
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
        })();

        try {
            await inicializacionEnCurso;
        } finally {
            inicializacionEnCurso = null;
        }
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

        const actualizarTemaSistema = function () {
            if (prefsActuales.tema === 'sistema') {
                aplicarTema('sistema');
            }
        };

        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', actualizarTemaSistema);
        } else if (typeof mq.addListener === 'function') {
            mq.addListener(actualizarTemaSistema);
        }
    } catch (_) {}

    instalarMicrointeracciones();

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            function () {
                aplicarTodo();
            },
            { once: true }
        );
    }

    inicializar();

    /* ================================================================
       API PÚBLICA COMPATIBLE
       ================================================================ */

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
        TEMAS: TEMAS_VALIDOS.slice()
    };

    /* ================================================================
       MASCOTA ACTIVA
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

    function cargarCSS(id, src) {
        if (document.getElementById(id)) return;

        const css = document.createElement('link');
        css.id = id;
        css.rel = 'stylesheet';
        css.href = src;

        (document.head || document.documentElement).appendChild(css);
    }

    function cargarScript(id, src, alCargar) {
        if (document.getElementById(id)) return;

        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.defer = true;

        if (typeof alCargar === 'function') {
            script.onload = alCargar;
        }

        (document.head || document.documentElement)
            .appendChild(script);
    }

    function alDOMListo(callback) {
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

    const RUTAS_EXCLUIDAS_BASE = [
        '/login',
        '/registro',
        '/pagar',
        '/pay',
        '/checkout',
        '/success',
        '/cancel',
        '/terminos',
        '/privacidad',
        '/cookies',
        '/legal',
        '/info',
        '/live-terminos',
        '/eliminar-cuenta',
        '/actualizar-contrasena'
    ];

    function puedeInyectarMascota(rutaTienda) {
        return !rutaExcluida(
            RUTAS_EXCLUIDAS_BASE.concat(rutaTienda)
        );
    }

    /* ================================================================
       MARQUINHOS
       ================================================================ */

    (function inyectarMarquinhosPet() {
        if (getMascotaActiva() !== 'marquinhos') return;
        if (!puedeInyectarMascota(['/features/marquinhos/tienda'])) {
            return;
        }

        if (document.getElementById('marquinhos-pet-script')) return;

        alDOMListo(function () {
            cargarCSS(
                'marquinhos-pet-css',
                '/features/marquinhos/marquinhos-pet.css'
            );

            cargarScript(
                'marquinhos-boca-script',
                '/features/marquinhos/marquinhos-boca.js'
            );

            cargarScript(
                'marquinhos-fit-script',
                '/features/marquinhos/marquinhos-fit.js'
            );

            cargarScript(
                'marquinhos-accesorios-svg-script',
                '/features/marquinhos/marquinhos-accesorios-svg.js'
            );

            cargarScript(
                'marquinhos-anim-script',
                '/features/marquinhos/marquinhos-animaciones.js'
            );

            cargarScript(
                'marquinhos-pet-script',
                '/features/marquinhos/marquinhos-pet.js'
            );

            cargarScript(
                'marquinhos-brain-script',
                '/features/marquinhos/marquinhos-brain.js'
            );
        });
    })();

    /* ================================================================
       CAPITÁN MAÍZ
       ================================================================ */

    (function inyectarCapitanMaizPet() {
        if (getMascotaActiva() !== 'capitan-maiz') return;
        if (!puedeInyectarMascota(['/features/capitan-maiz/tienda'])) {
            return;
        }

        if (document.getElementById('capitan-maiz-pet-script')) return;

        alDOMListo(function () {
            cargarCSS(
                'capitan-maiz-pet-css',
                '/features/capitan-maiz/capitan-maiz-pet.css'
            );

            cargarScript(
                'capitan-maiz-fit-script',
                '/features/capitan-maiz/capitan-maiz-fit.js'
            );

            cargarScript(
                'capitan-maiz-pet-script',
                '/features/capitan-maiz/capitan-maiz-pet.js'
            );

            cargarScript(
                'capitan-maiz-brain-script',
                '/features/capitan-maiz/capitan-maiz-brain.js'
            );
        });
    })();

    /* ================================================================
       ITLASUHUA
       ================================================================ */

    (function inyectarItlasuhuaPet() {
        if (getMascotaActiva() !== 'itlasuhua') return;
        if (!puedeInyectarMascota(['/features/itlasuhua/tienda'])) {
            return;
        }

        if (document.getElementById('itlasuhua-pet-script')) return;

        alDOMListo(function () {
            cargarCSS(
                'itlasuhua-pet-css',
                '/features/itlasuhua/itlasuhua-pet.css'
            );

            cargarScript(
                'itlasuhua-pet-script',
                '/features/itlasuhua/itlasuhua-pet.js',
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

            cargarScript(
                'itlasuhua-brain-script',
                '/features/itlasuhua/itlasuhua-brain.js'
            );

            cargarScript(
                'itlasuhua-voice-script',
                '/features/itlasuhua/itlasuhua-voice.js'
            );
        });
    })();

    console.log(
        '[Apariencia] Módulo global v3.3 cargado. Mascota activa:',
        getMascotaActiva()
    );
})();