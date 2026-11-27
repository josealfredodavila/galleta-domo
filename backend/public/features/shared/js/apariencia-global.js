/* ================================================================
   SARIEL'S ECOSYSTEM · APARIENCIA GLOBAL v4.1 (blanco y negro)
   Archivo: backend/public/features/shared/js/apariencia-global.js

   Dos temas, ambos en blanco y negro puro:
   - bn-oscuro: fondo #000000, texto #ffffff, grises neutros.
   - bn-claro:  fondo #ffffff, texto #000000, grises neutros.

   Sin colores de acento: las variables --gold, --accent, --cyan,
   --danger, etc. toman el color del texto del tema activo.

   Compatibilidad:
   - Valores antiguos de mostrar_tema se convierten así:
       bn, noche, sistema → bn-oscuro (sistema usa el modo del
                            dispositivo: oscuro → bn-oscuro, claro → bn-claro)
       dia               → bn-claro
   - Se mantienen las clases tema-noche / tema-dia en <html>
     para CSS antiguo que las use.
   - setColor() queda como función vacía (ya no hay acento).
   - Se conservan: tamaño de fuente (80–140 %), sincronización con
     Supabase, window.SarielApariencia y la inyección de mascotas.

   CAMBIOS v4.1:
   - Las mascotas (Marquinhos, Capitán Maíz, Itlasuhua) no se montan
     en rutas de visor o perfil público.
   - Mientras haya un visor multimedia abierto (VisorMediaGlobal,
     #visorMediaGlobal, #pvLightbox o #pubVisorFull), <html> recibe
     la clase sariels-visor-abierto, que oculta cualquier mascota
     encima de fotos o videos. Si la mascota aparece después, la misma
     regla la oculta sin recargar.
   - El visor sube su z-index para quedar por encima de las mascotas.
   - Supabase: preferencias_usuario(usuario_id, prefs jsonb),
     obtener_mis_preferencias() y actualizar_preferencia(p_key, p_value)
     verificados en el esquema real.
   ================================================================ */

(function () {
    'use strict';

    const KEYS = {
        tema: 'mostrar_tema',
        tamano_fuente: 'mostrar_tamano_fuente'
    };

    const DEFAULTS = {
        tema: 'bn-oscuro',
        tamano_fuente: 100
    };

    const TEMAS_VALIDOS = ['bn-oscuro', 'bn-claro'];

    const TEMAS_LEGADOS = {
        bn: 'bn-oscuro',
        noche: 'bn-oscuro',
        dia: 'bn-claro',
        sistema: null   // se resuelve según el modo del dispositivo
    };

    const MASCOTA_KEY = 'mascota_activa';
    const MASCOTA_DEFAULT = 'marquinhos';
    const MASCOTAS_VALIDAS = ['marquinhos', 'capitan-maiz', 'itlasuhua', 'ninguna'];

    /* Variables que la versión anterior escribía en el <html> como estilo
       en línea. Se limpian para que no pisen la paleta blanco y negro. */
    const VARIABLES_LEGADAS = [
        '--gold', '--gold-dark', '--gold-light', '--gold-bright',
        '--cfg-gold', '--accent', '--accent-dark', '--accent-light'
    ];

    /* Paletas en blanco y negro. Cada clave es una variable CSS (sin "--"). */
    const PALETAS = {
        'bn-oscuro': {
            'bg': '#000000',
            'bg-color': '#000000',
            'bg-primary': '#000000',
            'bg-secondary': '#111111',
            'card': '#111111',
            'surface': '#111111',
            'text': '#ffffff',
            'text-color': '#ffffff',
            'text-primary': '#ffffff',
            'text-secondary': '#a3a3a3',
            'muted': '#737373',
            'text-muted': '#737373',
            'cfg-text-secondary': '#a3a3a3',
            'border': '#262626',
            'border-color': '#262626',
            'line': 'rgba(255,255,255,0.12)',
            'line-strong': 'rgba(255,255,255,0.22)',
            'glass-border': 'rgba(255,255,255,0.14)',
            'gold': '#ffffff',
            'gold-dark': '#d4d4d4',
            'gold-light': '#ffffff',
            'gold-bright': '#ffffff',
            'cfg-gold': '#ffffff',
            'accent': '#ffffff',
            'accent-dark': '#d4d4d4',
            'accent-light': '#ffffff',
            'accent-soft': 'rgba(255,255,255,0.08)',
            'focus': '#ffffff',
            'success': '#ffffff',
            'danger': '#ffffff',
            'warning': '#ffffff',
            'cyan': '#ffffff',
            'green': '#ffffff',
            'red': '#ffffff',
            'orange': '#ffffff',
            'cfg-danger': '#ffffff',
            'space': '#000000',
            'green-deep': '#111111'
        },
        'bn-claro': {
            'bg': '#ffffff',
            'bg-color': '#ffffff',
            'bg-primary': '#ffffff',
            'bg-secondary': '#f5f5f5',
            'card': '#f5f5f5',
            'surface': '#f5f5f5',
            'text': '#000000',
            'text-color': '#000000',
            'text-primary': '#000000',
            'text-secondary': '#525252',
            'muted': '#737373',
            'text-muted': '#737373',
            'cfg-text-secondary': '#525252',
            'border': '#d4d4d4',
            'border-color': '#d4d4d4',
            'line': 'rgba(0,0,0,0.12)',
            'line-strong': 'rgba(0,0,0,0.22)',
            'glass-border': 'rgba(0,0,0,0.14)',
            'gold': '#000000',
            'gold-dark': '#262626',
            'gold-light': '#000000',
            'gold-bright': '#000000',
            'cfg-gold': '#000000',
            'accent': '#000000',
            'accent-dark': '#262626',
            'accent-light': '#000000',
            'accent-soft': 'rgba(0,0,0,0.06)',
            'focus': '#000000',
            'success': '#000000',
            'danger': '#000000',
            'warning': '#000000',
            'cyan': '#000000',
            'green': '#000000',
            'red': '#000000',
            'orange': '#000000',
            'cfg-danger': '#000000',
            'space': '#ffffff',
            'green-deep': '#f5f5f5'
        }
    };

    let prefsActuales = { ...DEFAULTS };
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

    function temaDelSistema() {
        try {
            const oscuro = window.matchMedia &&
                window.matchMedia('(prefers-color-scheme: dark)').matches;
            return oscuro ? 'bn-oscuro' : 'bn-claro';
        } catch (_) {
            return DEFAULTS.tema;
        }
    }

    function normalizarTema(valor) {
        if (TEMAS_VALIDOS.includes(valor)) return valor;

        if (Object.prototype.hasOwnProperty.call(TEMAS_LEGADOS, valor)) {
            return TEMAS_LEGADOS[valor] || temaDelSistema();
        }

        return DEFAULTS.tema;
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
            tamano_fuente: normalizarFuente(datos.tamano_fuente)
        };
    }

    function leerDeLocalStorage() {
        return normalizarPreferencias({
            tema: leerPref(KEYS.tema, DEFAULTS.tema),
            tamano_fuente: leerPref(KEYS.tamano_fuente, DEFAULTS.tamano_fuente)
        });
    }

    /* Lectura desde Supabase: primero la RPC obtener_mis_preferencias()
       (sin parámetros); si no responde, la tabla preferencias_usuario
       (usuario_id, prefs jsonb). */
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
                const resultado = await client.rpc('obtener_mis_preferencias');

                if (!resultado.error && resultado.data) {
                    let datos = resultado.data;

                    if (datos.prefs && typeof datos.prefs === 'object') {
                        datos = datos.prefs;
                    }

                    return normalizarPreferencias({
                        tema: datos.mostrar_tema,
                        tamano_fuente: datos.mostrar_tamano_fuente
                    });
                }
            } catch (error) {
                console.warn('[Apariencia] RPC de lectura no disponible:', error);
            }

            const resultadoTabla = await client
                .from('preferencias_usuario')
                .select('prefs')
                .eq('usuario_id', resultadoSesion.data.session.user.id)
                .maybeSingle();

            if (resultadoTabla.error || !resultadoTabla.data?.prefs) {
                return null;
            }

            const prefs = resultadoTabla.data.prefs;

            return normalizarPreferencias({
                tema: prefs.mostrar_tema,
                tamano_fuente: prefs.mostrar_tamano_fuente
            });
        } catch (error) {
            console.warn('[Apariencia] Error leyendo preferencias:', error);
            return null;
        }
    }

    /* Escritura: primero la RPC actualizar_preferencia(p_key text, p_value jsonb);
       si falla, upsert en preferencias_usuario conservando el resto de prefs. */
    async function guardarPref(clave, valor) {
        try {
            localStorage.setItem(clave, String(valor));
        } catch (error) {
            console.warn('[Apariencia] No se pudo guardar localmente:', error);
        }

        const client = getSupabase();
        if (!client) return;

        try {
            const resultadoSesion = await client.auth.getSession();
            const usuario = resultadoSesion.data?.session?.user;

            if (!usuario) return;

            const keyPrefs = clave === KEYS.tema
                ? 'mostrar_tema'
                : clave === KEYS.tamano_fuente
                    ? 'mostrar_tamano_fuente'
                    : clave;

            let rpcCorrecto = false;

            try {
                const resultado = await client.rpc('actualizar_preferencia', {
                    p_key: keyPrefs,
                    p_value: valor
                });

                rpcCorrecto = !resultado.error;
            } catch (error) {
                console.warn('[Apariencia] No se pudo actualizar mediante RPC:', error);
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
                    { usuario_id: usuario.id, prefs: nuevoPrefs },
                    { onConflict: 'usuario_id' }
                );

            if (resultadoGuardar.error) {
                console.warn('[Apariencia] Error guardando preferencias:', resultadoGuardar.error);
            }
        } catch (error) {
            console.warn('[Apariencia] No se pudo sincronizar con Supabase:', error);
        }
    }

    /* ================================================================
       MASCOTA ACTIVA · LECTURA Y ESCRITURA
       ================================================================ */

    function normalizarMascota(valor) {
        return MASCOTAS_VALIDAS.includes(valor) ? valor : MASCOTA_DEFAULT;
    }

    function getMascotaActiva() {
        try {
            return normalizarMascota(localStorage.getItem(MASCOTA_KEY) || MASCOTA_DEFAULT);
        } catch (_) {
            return MASCOTA_DEFAULT;
        }
    }

    async function leerMascotaSupabase() {
        try {
            const client = getSupabase();
            if (!client) return null;

            const sesion = await client.auth.getSession();
            const usuario = sesion.data?.session?.user;
            if (!usuario) return null;

            const resultado = await client
                .from('preferencias_usuario')
                .select('prefs')
                .eq('usuario_id', usuario.id)
                .maybeSingle();

            if (resultado.error) return null;

            const valor = resultado.data?.prefs?.mascota_activa;
            return MASCOTAS_VALIDAS.includes(valor) ? valor : null;
        } catch (error) {
            console.warn('[Apariencia] No se pudo leer la mascota:', error);
            return null;
        }
    }

    async function sincronizarMascota() {
        const remota = await leerMascotaSupabase();
        if (!remota) return;

        try {
            localStorage.setItem(MASCOTA_KEY, remota);
        } catch (_) {}
    }

    async function guardarMascota(mascota) {
        const valor = normalizarMascota(mascota);
        let local = false;

        try {
            localStorage.setItem(MASCOTA_KEY, valor);
            local = true;
        } catch (_) {}

        const client = getSupabase();
        if (!client) return { local, remoto: null };

        try {
            const sesion = await client.auth.getSession();
            const usuario = sesion.data?.session?.user;
            if (!usuario) return { local, remoto: null };

            const actual = await client
                .from('preferencias_usuario')
                .select('prefs')
                .eq('usuario_id', usuario.id)
                .maybeSingle();

            if (actual.error) return { local, remoto: false };

            const nuevoPrefs = {
                ...(actual.data?.prefs || {}),
                [MASCOTA_KEY]: valor
            };

            const guardado = await client
                .from('preferencias_usuario')
                .upsert(
                    { usuario_id: usuario.id, prefs: nuevoPrefs },
                    { onConflict: 'usuario_id' }
                );

            if (guardado.error) {
                console.warn('[Apariencia] Error guardando mascota:', guardado.error);
                return { local, remoto: false };
            }

            return { local, remoto: true };
        } catch (error) {
            console.warn('[Apariencia] No se pudo guardar la mascota en Supabase:', error);
            return { local, remoto: false };
        }
    }

    /* ================================================================
       ESTILOS DE LOS DOS TEMAS (una sola hoja, siempre instalada)
       ================================================================ */

    function variablesCSS(paleta) {
        return Object.keys(paleta)
            .map(function (nombre) {
                return '--' + nombre + ':' + paleta[nombre] + ';';
            })
            .join(' ');
    }

    function construirCSSTemas() {
        const oscuro = PALETAS['bn-oscuro'];
        const claro = PALETAS['bn-claro'];

        return `
            html.tema-bn-oscuro { color-scheme: dark; ${variablesCSS(oscuro)} }
            html.tema-bn-claro  { color-scheme: light; ${variablesCSS(claro)} }

            html.tema-bn-oscuro,
            html.tema-bn-oscuro body {
                background: #000000 !important;
                color: #ffffff;
            }

            html.tema-bn-claro,
            html.tema-bn-claro body {
                background: #ffffff !important;
                color: #000000;
            }
        `;
    }

    function instalarEstilosTemas() {
        let style = document.getElementById('sariels-bn-css');

        if (!style) {
            style = document.createElement('style');
            style.id = 'sariels-bn-css';
            (document.head || document.documentElement).appendChild(style);
        }

        style.textContent = construirCSSTemas();
    }

    /* ================================================================
       APLICAR TEMA, COLOR Y TAMAÑO
       ================================================================ */

    function aplicarTema(tema) {
        const html = document.documentElement;
        const valor = normalizarTema(tema);

        html.classList.remove(
            'tema-dia', 'tema-noche',
            'tema-bn-oscuro', 'tema-bn-claro'
        );

        html.classList.add('tema-' + valor);

        /* Clases antiguas para CSS que todavía las use. */
        html.classList.add(valor === 'bn-oscuro' ? 'tema-noche' : 'tema-dia');

        html.setAttribute('data-tema', valor);
    }

    /* Quita los colores que la versión anterior escribía como estilo en línea,
       para que la paleta blanco y negro sea la única que manda. */
    function limpiarVariablesLegadas() {
        const html = document.documentElement;

        VARIABLES_LEGADAS.forEach(function (nombre) {
            html.style.removeProperty(nombre);
        });
    }

    function aplicarTamanoFuente(porcentaje) {
        const html = document.documentElement;
        const valor = normalizarFuente(porcentaje);

        html.style.fontSize = (16 * valor / 100) + 'px';
        html.setAttribute('data-font-size', String(valor));
        html.style.setProperty('--preview-size', (15 * valor / 100) + 'px');
    }

    function aplicarTodo(prefs) {
        const p = normalizarPreferencias(prefs || prefsActuales);

        instalarEstilosTemas();
        aplicarTema(p.tema);
        limpiarVariablesLegadas();
        aplicarTamanoFuente(p.tamano_fuente);

        prefsActuales = { ...p };
    }

    /* ================================================================
       VISOR MULTIMEDIA · MASCOTA OCULTA ENCIMA DE FOTOS Y VIDEOS
       ================================================================ */

    const CLASE_VISOR_ABIERTO = 'sariels-visor-abierto';

    /* Elementos del visor que pueden estar abiertos. */
    const IDS_VISOR = ['visorMediaGlobal', 'pvLightbox', 'pubVisorFull'];

    function visorAbierto() {
        for (let i = 0; i < IDS_VISOR.length; i++) {
            const el = document.getElementById(IDS_VISOR[i]);
            if (el && !el.hidden) return true;
        }

        try {
            if (window.VisorMediaGlobal &&
                typeof window.VisorMediaGlobal.estaAbierto === 'function' &&
                window.VisorMediaGlobal.estaAbierto()) {
                return true;
            }
        } catch (_) {}

        return false;
    }

    function sincronizarVisor() {
        document.documentElement.classList.toggle(CLASE_VISOR_ABIERTO, visorAbierto());
    }

    /* Regla que oculta cualquier mascota mientras el visor esté abierto,
       y pone el visor por encima de todo lo demás. */
    const CSS_VISOR_MASCOTAS = `
        html.${CLASE_VISOR_ABIERTO} [id*="marquinhos"],
        html.${CLASE_VISOR_ABIERTO} [class*="marquinhos-pet"],
        html.${CLASE_VISOR_ABIERTO} [id*="capitan-maiz"],
        html.${CLASE_VISOR_ABIERTO} [class*="capitan-maiz-pet"],
        html.${CLASE_VISOR_ABIERTO} [id*="itlasuhua"],
        html.${CLASE_VISOR_ABIERTO} [class*="itlasuhua-pet"],
        html.${CLASE_VISOR_ABIERTO} [data-mascota] {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }

        #visorMediaGlobal,
        #pvLightbox,
        #pubVisorFull {
            z-index: 2147483600 !important;
        }
    `;

    function instalarReglasVisor() {
        if (document.getElementById('sariels-visor-mascotas-css')) return;

        const style = document.createElement('style');
        style.id = 'sariels-visor-mascotas-css';
        style.textContent = CSS_VISOR_MASCOTAS;

        (document.head || document.documentElement).appendChild(style);
    }

    let pendienteSincronizacion = false;

    function programarSincronizacionVisor() {
        if (pendienteSincronizacion) return;
        pendienteSincronizacion = true;

        const ejecutar = function () {
            pendienteSincronizacion = false;
            sincronizarVisor();
        };

        if (window.requestAnimationFrame) {
            window.requestAnimationFrame(ejecutar);
        } else {
            setTimeout(ejecutar, 16);
        }
    }

    function vigilarVisor() {
        if (!window.MutationObserver) return;

        const observador = new MutationObserver(programarSincronizacionVisor);

        observador.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['hidden', 'class']
        });

        /* Respaldo: revisa cada segundo por si el visor cambia sin mutación visible. */
        setInterval(sincronizarVisor, 1000);

        sincronizarVisor();
    }

    /* ================================================================
       MICROINTERACCIONES (sin colores de acento)
       ================================================================ */

    const SELECTOR_INTERACTIVO = [
        '.cfg-item',
        '.cfg-btn',
        '.cfg-header-back',
        '.cfg-header-action'
    ].join(',');

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

        ${SELECTOR_INTERACTIVO}:active {
            transform: scale(0.98);
            filter: brightness(1.08);
        }

        ${SELECTOR_INTERACTIVO}:focus-visible {
            outline: 2px solid var(--focus, #808080);
            outline-offset: 2px;
        }

        @media (hover: hover) and (pointer: fine) {
            ${SELECTOR_INTERACTIVO}:hover {
                box-shadow: 0 0 0 1px var(--line-strong, rgba(128,128,128,0.4));
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

            ${SELECTOR_INTERACTIVO}:active {
                transform: none !important;
            }
        }
    `;

    function instalarMicrointeracciones() {
        if (document.getElementById('sariels-motion-safe-css')) return;

        const style = document.createElement('style');
        style.id = 'sariels-motion-safe-css';
        style.textContent = CSS_MICROINTERACCIONES;

        (document.head || document.documentElement).appendChild(style);
    }

    /* ================================================================
       INICIALIZACIÓN Y SINCRONIZACIÓN
       ================================================================ */

    async function inicializar() {
        if (inicializacionEnCurso) return inicializacionEnCurso;

        inicializacionEnCurso = (async function () {
            const prefsLocal = leerDeLocalStorage();
            aplicarTodo(prefsLocal);

            let intentos = 0;

            while (!getSupabase() && intentos < 20) {
                await new Promise(function (resolve) { setTimeout(resolve, 100); });
                intentos++;
            }

            const prefsSupabase = await leerDeSupabase();

            if (prefsSupabase) {
                const hayDiferencias =
                    prefsSupabase.tema !== prefsLocal.tema ||
                    prefsSupabase.tamano_fuente !== prefsLocal.tamano_fuente;

                if (hayDiferencias) {
                    aplicarTodo(prefsSupabase);

                    try {
                        localStorage.setItem(KEYS.tema, prefsSupabase.tema);
                        localStorage.setItem(
                            KEYS.tamano_fuente,
                            String(prefsSupabase.tamano_fuente)
                        );
                    } catch (_) {}

                    console.log('[Apariencia] Preferencias sincronizadas desde Supabase.');
                }
            }

            await sincronizarMascota();
        })();

        try {
            await inicializacionEnCurso;
        } finally {
            inicializacionEnCurso = null;
        }
    }

    window.addEventListener('storage', function (evento) {
        if (evento.key && Object.values(KEYS).includes(evento.key)) {
            aplicarTodo(leerDeLocalStorage());
        }
    });

    instalarMicrointeracciones();
    instalarEstilosTemas();
    instalarReglasVisor();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            aplicarTodo();
            vigilarVisor();
        }, { once: true });
    } else {
        vigilarVisor();
    }

    /* ================================================================
       API PÚBLICA
       ================================================================ */

    window.SarielApariencia = {
        aplicar: aplicarTodo,
        aplicarTema: aplicarTema,
        aplicarTamanoFuente: aplicarTamanoFuente,
        leer: leerDeLocalStorage,
        leerSupabase: leerDeSupabase,
        guardarPref: guardarPref,

        getMascota: getMascotaActiva,
        leerMascotaSupabase: leerMascotaSupabase,
        setMascota: guardarMascota,

        setTema: function (tema) {
            const valor = normalizarTema(tema);

            prefsActuales.tema = valor;
            aplicarTema(valor);

            return guardarPref(KEYS.tema, valor);
        },

        /* Ya no hay colores de acento. Se mantiene para no romper llamadas antiguas. */
        setColor: function () {
            console.warn('[Apariencia] setColor() ya no tiene efecto: el tema es blanco y negro.');
            return Promise.resolve();
        },

        setFuente: function (fuente) {
            const valor = normalizarFuente(fuente);

            prefsActuales.tamano_fuente = valor;
            aplicarTamanoFuente(valor);

            return guardarPref(KEYS.tamano_fuente, valor);
        },

        recargar: inicializar,
        visorAbierto: visorAbierto,
        KEYS: KEYS,
        DEFAULTS: DEFAULTS,
        TEMAS: TEMAS_VALIDOS.slice(),
        MASCOTAS: MASCOTAS_VALIDAS.slice()
    };

    /* ================================================================
       MASCOTA ACTIVA · INYECCIÓN
       ================================================================ */

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

        (document.head || document.documentElement).appendChild(script);
    }

    function alDOMListo(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
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
        '/actualizar-contrasena',
        '/centro-ayuda',
        '/features/mensajes',
        '/features/videos',
        '/features/live',
        '/features/grupos',
        '/features/perfil-publico',
        '/features/galeria',
        '/visor'
    ];

    function puedeInyectarMascota(rutaTienda) {
        return !rutaExcluida(RUTAS_EXCLUIDAS_BASE.concat(rutaTienda));
    }

    /* Nunca montar una mascota mientras hay un visor abierto.
       Si el visor se abre después, CSS_VISOR_MASCOTAS la oculta. */
    function puedeMontarAhora() {
        return !visorAbierto();
    }

    function inyectarMarquinhosPet() {
        if (getMascotaActiva() !== 'marquinhos') return;
        if (!puedeInyectarMascota(['/features/marquinhos/tienda'])) return;
        if (!puedeMontarAhora()) return;
        if (document.getElementById('marquinhos-pet-script')) return;

        alDOMListo(function () {
            cargarCSS('marquinhos-pet-css', '/features/marquinhos/marquinhos-pet.css');
            cargarScript('marquinhos-boca-script', '/features/marquinhos/marquinhos-boca.js');
            cargarScript('marquinhos-fit-script', '/features/marquinhos/marquinhos-fit.js');
            cargarScript('marquinhos-accesorios-svg-script', '/features/marquinhos/marquinhos-accesorios-svg.js');
            cargarScript('marquinhos-anim-script', '/features/marquinhos/marquinhos-animaciones.js');
            cargarScript('marquinhos-pet-script', '/features/marquinhos/marquinhos-pet.js');
            cargarScript('marquinhos-brain-script', '/features/marquinhos/marquinhos-brain.js');
        });
    }

    function inyectarCapitanMaizPet() {
        if (getMascotaActiva() !== 'capitan-maiz') return;
        if (!puedeInyectarMascota(['/features/capitan-maiz/tienda'])) return;
        if (!puedeMontarAhora()) return;
        if (document.getElementById('capitan-maiz-pet-script')) return;

        alDOMListo(function () {
            cargarCSS('capitan-maiz-pet-css', '/features/capitan-maiz/capitan-maiz-pet.css');
            cargarScript('capitan-maiz-fit-script', '/features/capitan-maiz/capitan-maiz-fit.js');
            cargarScript('capitan-maiz-pet-script', '/features/capitan-maiz/capitan-maiz-pet.js');
            cargarScript('capitan-maiz-brain-script', '/features/capitan-maiz/capitan-maiz-brain.js');
        });
    }

    function inyectarItlasuhuaPet() {
        if (getMascotaActiva() !== 'itlasuhua') return;
        if (!puedeInyectarMascota(['/features/itlasuhua/tienda'])) return;
        if (!puedeMontarAhora()) return;
        if (document.getElementById('itlasuhua-pet-script')) return;

        alDOMListo(function () {
            cargarCSS('itlasuhua-pet-css', '/features/itlasuhua/itlasuhua-pet.css');

            cargarScript('itlasuhua-pet-script', '/features/itlasuhua/itlasuhua-pet.js', function () {
                if (window.ItlasuhuaPet && typeof window.ItlasuhuaPet.crearWidget === 'function') {
                    window.ItlasuhuaPet.crearWidget();
                }
            });

            cargarScript('itlasuhua-brain-script', '/features/itlasuhua/itlasuhua-brain.js');
            cargarScript('itlasuhua-voice-script', '/features/itlasuhua/itlasuhua-voice.js');
        });
    }

    function inyectarMascotaActiva() {
        inyectarMarquinhosPet();
        inyectarCapitanMaizPet();
        inyectarItlasuhuaPet();

        console.log('[Apariencia] Módulo global v4.1 cargado. Tema:', prefsActuales.tema,
            '· Mascota activa:', getMascotaActiva());
    }

    /* ================================================================
       ARRANQUE
       Primero sincroniza tema, fuente y mascota con Supabase;
       después inyecta la mascota. Si algo falla, igual se inyecta
       con lo que haya en localStorage.
       ================================================================ */

    inicializar()
        .catch(function (error) {
            console.warn('[Apariencia] Error al iniciar:', error);
        })
        .then(inyectarMascotaActiva);
})();