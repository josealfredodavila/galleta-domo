/* ================================================================
   CSARIEL'S ECOSYSTEM · APARIENCIA GLOBAL v3.4
   Archivo: backend/public/features/js/apariencia-global.js

   v3.4:
   - Cuatro tipos de tema: sistema, dia, noche, negro.
   - El tema negro (tipo X) pasa a ser una opción seleccionable,
     no un forzado global.
   - El tema por defecto es "negro" para conservar la identidad
     visual actual, pero el usuario puede cambiarlo.
   - Conserva acentos dorados y colores personalizados.
   - Conserva preferencias locales y sincronización con Supabase.
   - Conserva tamaños de fuente del 80 % al 140 %.
   - Conserva window.SarielApariencia y su API pública.
   - Conserva la carga exclusiva de la mascota activa.
   - No modifica dimensiones, márgenes ni escalas de contenedores.
   - Respeta prefers-reduced-motion.
   ================================================================ */

(function () {
    'use strict';

    const KEYS = {
        tema: 'mostrar_tema',
        tamano_fuente: 'mostrar_tamano_fuente',
        color_acento: 'mostrar_color_acento'
    };

    const TEMAS_VALIDOS = ['sistema', 'dia', 'noche', 'negro'];

    const DEFAULTS = {
        tema: 'negro',
        tamano_fuente: 100,
        color_acento: '#D4AF37'
    };

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
                        tamano_fuente:
                            datos.mostrar_tamano_fuente,
                        color_acento:
                            datos.mostrar_color_acento
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

    function resolverTemaSistema() {
        const prefiereOscuro = Boolean(
            window.matchMedia &&
            window.matchMedia(
                '(prefers-color-scheme: dark)'
            ).matches
        );

        return prefiereOscuro ? 'noche' : 'dia';
    }

    function aplicarTema(tema) {
        const html = document.documentElement;
        tema = normalizarTema(tema);

        html.classList.remove(
            'tema-dia',
            'tema-noche',
            'tema-negro',
            'sariel-tema-negro'
        );
        html.removeAttribute('data-tema');

        let temaEfectivo = tema;

        if (tema === 'sistema') {
            temaEfectivo = resolverTemaSistema();
        }

        html.setAttribute('data-tema', temaEfectivo);
        html.setAttribute(
            'data-tema-preferido',
            tema
        );

        if (temaEfectivo === 'dia') {
            html.classList.add('tema-dia');
            html.style.colorScheme = 'light';
        } else if (temaEfectivo === 'noche') {
            html.classList.add('tema-noche');
            html.style.colorScheme = 'dark';
        } else {
            /* temaEfectivo === 'negro' */
            html.classList.add('tema-negro');
            html.classList.add('sariel-tema-negro');
            html.style.colorScheme = 'dark';
        }
    }

    function aplicarColorAcento(color) {
        const html = document.documentElement;
        color = normalizarColor(color);

        html.style.setProperty('--gold', color);
        html.style.setProperty(
            '--gold-dark',
            ajustarColor(color, -15)
        );
        html.style.setProperty(
            '--gold-light',
            ajustarColor(color, 15)
        );
        html.style.setProperty(
            '--gold-bright',
            ajustarColor(color, 25)
        );
        html.style.setProperty('--cfg-gold', color);
        html.style.setProperty('--accent', color);
        html.style.setProperty(
            '--accent-dark',
            ajustarColor(color, -15)
        );
        html.style.setProperty(
            '--accent-light',
            ajustarColor(color, 15)
        );

        html.style.setProperty('--sariel-bg', '#000000');
        html.style.setProperty('--sariel-surface', '#080808');
        html.style.setProperty(
            '--sariel-surface-raised',
            '#111111'
        );
        html.style.setProperty('--sariel-border', '#292929');
        html.style.setProperty('--sariel-text', '#FFFFFF');
        html.style.setProperty('--sariel-muted', '#A7A7A7');
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
        const p = normalizarPreferencias(prefs || prefsActuales);

        aplicarTema(p.tema);
        aplicarColorAcento(p.color_acento);
        aplicarTamanoFuente(p.tamano_fuente);

        prefsActuales = { ...p };
    }

    /* ================================================================
       TEMA NEGRO GLOBAL (solo activo cuando data-tema="negro")
       Inspirado en la interfaz oscura de X.
       No utiliza zoom ni cambia dimensiones de los contenedores.
       ================================================================ */

    const CSS_TEMA_NEGRO = `
        html.sariel-tema-negro {
            color-scheme: dark !important;

            --sariel-bg: #000000;
            --sariel-surface: #080808;
            --sariel-surface-raised: #111111;
            --sariel-border: #292929;
            --sariel-text: #FFFFFF;
            --sariel-muted: #A7A7A7;

            --background: #000000;
            --background-color: #000000;
            --bg-primary: #000000;
            --bg-secondary: #080808;
            --surface: #080808;
            --surface-color: #080808;
            --card-bg: #080808;
            --text-primary: #FFFFFF;
            --text-secondary: #A7A7A7;
            --border-color: #292929;
        }

        html.sariel-tema-negro,
        html.sariel-tema-negro body {
            background-color: #000000 !important;
            color: #FFFFFF;
        }

        html.sariel-tema-negro body {
            min-height: 100%;
        }

        /* Texto general */
        html.sariel-tema-negro body,
        html.sariel-tema-negro body p,
        html.sariel-tema-negro body label,
        html.sariel-tema-negro body li,
        html.sariel-tema-negro body td,
        html.sariel-tema-negro body th,
        html.sariel-tema-negro body figcaption,
        html.sariel-tema-negro body summary,
        html.sariel-tema-negro body legend {
            color: #FFFFFF;
        }

        /* Encabezados */
        html.sariel-tema-negro body h1,
        html.sariel-tema-negro body h2,
        html.sariel-tema-negro body h3,
        html.sariel-tema-negro body h4,
        html.sariel-tema-negro body h5,
        html.sariel-tema-negro body h6 {
            color: #FFFFFF;
        }

        /* Textos secundarios */
        html.sariel-tema-negro body small,
        html.sariel-tema-negro body .text-muted,
        html.sariel-tema-negro body .text-secondary,
        html.sariel-tema-negro body .subtitle,
        html.sariel-tema-negro body .descripcion-secundaria,
        html.sariel-tema-negro body .muted,
        html.sariel-tema-negro body time {
            color: #A7A7A7;
        }

        /* Enlaces */
        html.sariel-tema-negro body a {
            color: var(--accent, #D4AF37);
        }

        /* Contenedores principales */
        html.sariel-tema-negro body main,
        html.sariel-tema-negro body .app,
        html.sariel-tema-negro body .app-container,
        html.sariel-tema-negro body .app-shell,
        html.sariel-tema-negro body .page,
        html.sariel-tema-negro body .page-container,
        html.sariel-tema-negro body .main-content,
        html.sariel-tema-negro body .content,
        html.sariel-tema-negro body .contenido,
        html.sariel-tema-negro body .layout,
        html.sariel-tema-negro body .dashboard,
        html.sariel-tema-negro body .dashboard-container,
        html.sariel-tema-negro body .view,
        html.sariel-tema-negro body .screen,
        html.sariel-tema-negro body .pantalla,
        html.sariel-tema-negro body .panel-principal {
            background-color: #000000 !important;
            color: #FFFFFF !important;
        }

        /* Barras superiores, inferiores y navegación */
        html.sariel-tema-negro body header,
        html.sariel-tema-negro body nav,
        html.sariel-tema-negro body footer,
        html.sariel-tema-negro body .navbar,
        html.sariel-tema-negro body .nav-bar,
        html.sariel-tema-negro body .topbar,
        html.sariel-tema-negro body .top-bar,
        html.sariel-tema-negro body .bottom-nav,
        html.sariel-tema-negro body .bottom-navigation,
        html.sariel-tema-negro body .tab-bar,
        html.sariel-tema-negro body .sidebar,
        html.sariel-tema-negro body .app-header,
        html.sariel-tema-negro body .app-footer,
        html.sariel-tema-negro body .mobile-nav {
            background-color: #000000 !important;
            color: #FFFFFF !important;
            border-color: #292929 !important;
        }

        /* Tarjetas y publicaciones */
        html.sariel-tema-negro body .card,
        html.sariel-tema-negro body .cfg-item,
        html.sariel-tema-negro body .cfg-card,
        html.sariel-tema-negro body .post,
        html.sariel-tema-negro body .post-card,
        html.sariel-tema-negro body .publication,
        html.sariel-tema-negro body .publicacion,
        html.sariel-tema-negro body .feed-item,
        html.sariel-tema-negro body .notification,
        html.sariel-tema-negro body .notification-item,
        html.sariel-tema-negro body .message-card,
        html.sariel-tema-negro body .profile-card,
        html.sariel-tema-negro body .service-card,
        html.sariel-tema-negro body .product-card,
        html.sariel-tema-negro body .modal-content,
        html.sariel-tema-negro body .dialog-content,
        html.sariel-tema-negro body .dropdown-menu,
        html.sariel-tema-negro body .popover,
        html.sariel-tema-negro body .menu-panel {
            background-color: #080808 !important;
            color: #FFFFFF !important;
            border-color: #292929 !important;
        }

        /* Capas y fondos de paneles */
        html.sariel-tema-negro body .panel,
        html.sariel-tema-negro body .section,
        html.sariel-tema-negro body .seccion,
        html.sariel-tema-negro body .settings-panel,
        html.sariel-tema-negro body .settings-section,
        html.sariel-tema-negro body .cfg-section,
        html.sariel-tema-negro body .list-container,
        html.sariel-tema-negro body .feed-container,
        html.sariel-tema-negro body .profile-container,
        html.sariel-tema-negro body .modal,
        html.sariel-tema-negro body dialog,
        html.sariel-tema-negro body [role="dialog"],
        html.sariel-tema-negro body [role="menu"] {
            background-color: #000000 !important;
            color: #FFFFFF !important;
            border-color: #292929 !important;
        }

        /* Formularios */
        html.sariel-tema-negro body input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
        html.sariel-tema-negro body textarea,
        html.sariel-tema-negro body select,
        html.sariel-tema-negro body .form-control,
        html.sariel-tema-negro body .input-field {
            background-color: #080808 !important;
            color: #FFFFFF !important;
            border-color: #3A3A3A !important;
            caret-color: #FFFFFF;
        }

        html.sariel-tema-negro body input::placeholder,
        html.sariel-tema-negro body textarea::placeholder {
            color: #888888 !important;
            opacity: 1;
        }

        html.sariel-tema-negro body option {
            background-color: #080808;
            color: #FFFFFF;
        }

        /* Botones */
        html.sariel-tema-negro body button,
        html.sariel-tema-negro body .btn,
        html.sariel-tema-negro body .cfg-btn {
            border-color: var(--sariel-border, #292929);
        }

        html.sariel-tema-negro body button:not(.primary):not(.btn-primary):not(.accent-button):not(.gold-button):not(.cfg-primary):not([data-theme-preserve]):not([class*="gold"]):not([class*="accent"]),
        html.sariel-tema-negro body .btn:not(.btn-primary):not(.primary):not([data-theme-preserve]) {
            color: #FFFFFF;
        }

        /* Separadores y bordes */
        html.sariel-tema-negro body hr,
        html.sariel-tema-negro body table,
        html.sariel-tema-negro body td,
        html.sariel-tema-negro body th,
        html.sariel-tema-negro body fieldset,
        html.sariel-tema-negro body .border,
        html.sariel-tema-negro body .divider,
        html.sariel-tema-negro body .separator {
            border-color: #292929;
        }

        /* Tablas */
        html.sariel-tema-negro body table {
            background-color: #000000;
            color: #FFFFFF;
        }

        html.sariel-tema-negro body thead,
        html.sariel-tema-negro body tr {
            border-color: #292929;
        }

        /* Selección y foco */
        html.sariel-tema-negro body ::selection {
            background: var(--accent, #D4AF37);
            color: #000000;
        }

        html.sariel-tema-negro body :focus-visible {
            outline-color: var(--accent, #D4AF37);
        }

        /* Scrollbar */
        html.sariel-tema-negro body * {
            scrollbar-color: #444444 #000000;
        }

        html.sariel-tema-negro body *::-webkit-scrollbar-track {
            background: #000000;
        }

        html.sariel-tema-negro body *::-webkit-scrollbar-thumb {
            background: #444444;
            border-color: #000000;
        }

        /* Mascotas: no se fuerzan fondos ni filtros */
        html.sariel-tema-negro body #marquinhos-pet,
        html.sariel-tema-negro body #capitan-maiz-pet,
        html.sariel-tema-negro body #itlasuhua-pet,
        html.sariel-tema-negro body .mascota-widget,
        html.sariel-tema-negro body .pet-widget {
            color: inherit;
        }

        @media (prefers-reduced-motion: reduce) {
            html.sariel-tema-negro *,
            html.sariel-tema-negro *::before,
            html.sariel-tema-negro *::after {
                scroll-behavior: auto !important;
            }
        }
    `;

    function instalarTemaNegroCSS() {
        let style = document.getElementById(
            'sariel-tema-negro-global-css'
        );

        if (!style) {
            style = document.createElement('style');
            style.id = 'sariel-tema-negro-global-css';

            (document.head || document.documentElement)
                .appendChild(style);
        }

        style.textContent = CSS_TEMA_NEGRO;
    }

    /* ================================================================
       MICROINTERACCIONES
       ================================================================ */

    const SELECTOR_INTERACTIVO = [
        '.cfg-item',
        '.cfg-btn',
        '.cfg-header-back',
        '.cfg-header-action'
    ].join(',');

    const SELECTOR_PRESIONABLE = SELECTOR_INTERACTIVO;
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
                    color-mix(
                        in srgb,
                        var(--accent, #D4AF37) 22%,
                        transparent
                    );
            }
        }

        @keyframes sarielFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
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
        let style = document.getElementById(
            'sariels-motion-safe-css'
        );

        if (!style) {
            style = document.createElement('style');
            style.id = 'sariels-motion-safe-css';

            (document.head || document.documentElement)
                .appendChild(style);
        }

        style.textContent = CSS_MICROINTERACCIONES;
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
            mq.addEventListener(
                'change',
                actualizarTemaSistema
            );
        } else if (typeof mq.addListener === 'function') {
            mq.addListener(actualizarTemaSistema);
        }
    } catch (_) {}

    instalarTemaNegroCSS();
    instalarMicrointeracciones();

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            function () {
                aplicarTodo();
                instalarTemaNegroCSS();
                instalarMicrointeracciones();
            },
            { once: true }
        );
    }

    inicializar();

    /* ================================================================
       API PÚBLICA COMPATIBLE
       ================================================================ */

    window.SarielApariencia = {
        TEMAS: TEMAS_VALIDOS.slice(),

        aplicar: aplicarTodo,

        aplicarTema: aplicarTema,
        aplicarColorAcento: aplicarColorAcento,
        aplicarTamanoFuente: aplicarTamanoFuente,

        leer: leerDeLocalStorage,
        leerSupabase: leerDeSupabase,
        guardarPref: guardarPref,

        getTemaActual: function () {
            return prefsActuales.tema;
        },

        getTemaEfectivo: function () {
            const html = document.documentElement;
            return html.getAttribute('data-tema') || 'dia';
        },

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

            return guardarPref(
                KEYS.tamano_fuente,
                fuente
            );
        },

        recargar: inicializar,
        KEYS: KEYS,
        DEFAULTS: DEFAULTS
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

        (document.head || document.documentElement)
            .appendChild(css);
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

        if (!puedeInyectarMascota([
            '/features/marquinhos/tienda'
        ])) {
            return;
        }

        if (document.getElementById('marquinhos-pet-script')) {
            return;
        }

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

        if (!puedeInyectarMascota([
            '/features/capitan-maiz/tienda'
        ])) {
            return;
        }

        if (document.getElementById('capitan-maiz-pet-script')) {
            return;
        }

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

        if (!puedeInyectarMascota([
            '/features/itlasuhua/tienda'
        ])) {
            return;
        }

        if (document.getElementById('itlasuhua-pet-script')) {
            return;
        }

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
        '[Apariencia] Módulo global v3.4 cargado. ' +
        'Temas: sistema, dia, noche, negro. ' +
        'Mascota activa:',
        getMascotaActiva()
    );
})();