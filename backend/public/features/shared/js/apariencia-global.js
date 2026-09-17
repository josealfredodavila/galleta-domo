/* ================================================================
   APARIENCIA GLOBAL - SARIEL'S ECOSYSTEM v2.0
   - Lee de localStorage (rápido, sin red)
   - Sincroniza con Supabase preferencias_usuario (persistente)
   - Aplica tema, color de acento y tamaño de fuente globalmente
   ================================================================ */

(function() {
    'use strict';

    // Claves de localStorage
    const KEYS = {
        tema: 'mostrar_tema',
        tamano_fuente: 'mostrar_tamano_fuente',
        color_acento: 'mostrar_color_acento'
    };

    // Valores por defecto
    const DEFAULTS = {
        tema: 'sistema',
        tamano_fuente: 100,
        color_acento: '#D4AF37'
    };

    // Estado interno
    let prefsActuales = { ...DEFAULTS };
    let syncConSupabaseListo = false;

    /* ----------------------------------------------------------------
       HELPERS DE CLIENTE SUPABASE
       ---------------------------------------------------------------- */
    function getSupabase() {
        if (window.supabaseClient) return window.supabaseClient;
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            try {
                const c = window.supabase.createClient(
                    'https://zultnlogdoajehbswlih.supabase.co',
                    'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
                );
                window.supabaseClient = c;
                return c;
            } catch (e) { return null; }
        }
        return null;
    }

    /* ----------------------------------------------------------------
       LEER PREFERENCIAS DE LOCALSTORAGE
       ---------------------------------------------------------------- */
    function leerPref(clave, defecto) {
        try {
            const v = localStorage.getItem(clave);
            return v !== null ? v : defecto;
        } catch (e) {
            return defecto;
        }
    }

    function leerDeLocalStorage() {
        return {
            tema: leerPref(KEYS.tema, DEFAULTS.tema),
            tamano_fuente: parseInt(leerPref(KEYS.tamano_fuente, DEFAULTS.tamano_fuente)) || 100,
            color_acento: leerPref(KEYS.color_acento, DEFAULTS.color_acento)
        };
    }

    /* ----------------------------------------------------------------
       LEER PREFERENCIAS DE SUPABASE
       ---------------------------------------------------------------- */
    async function leerDeSupabase() {
        try {
            const client = getSupabase();
            if (!client) return null;

            const sessionResult = await client.auth.getSession();
            if (sessionResult.error || !sessionResult.data?.session?.user) return null;

            // Intentar con RPC primero
            try {
                const { data, error } = await client.rpc('obtener_mis_preferencias');
                if (!error && data) {
                    return {
                        tema: data.mostrar_tema || DEFAULTS.tema,
                        tamano_fuente: parseInt(data.mostrar_tamano_fuente) || DEFAULTS.tamano_fuente,
                        color_acento: data.mostrar_color_acento || DEFAULTS.color_acento
                    };
                }
            } catch (rpcError) {
                console.warn('[Apariencia] RPC obtener_mis_preferencias falló, usando tabla directa:', rpcError);
            }

            // Fallback: leer tabla directa
            const { data: pref, error: errTabla } = await client
                .from('preferencias_usuario')
                .select('prefs')
                .eq('usuario_id', sessionResult.data.session.user.id)
                .maybeSingle();

            if (errTabla || !pref || !pref.prefs) return null;

            return {
                tema: pref.prefs.mostrar_tema || DEFAULTS.tema,
                tamano_fuente: parseInt(pref.prefs.mostrar_tamano_fuente) || DEFAULTS.tamano_fuente,
                color_acento: pref.prefs.mostrar_color_acento || DEFAULTS.color_acento
            };
        } catch (e) {
            console.warn('[Apariencia] Error leyendo de Supabase:', e);
            return null;
        }
    }

    /* ----------------------------------------------------------------
       GUARDAR PREFERENCIAS EN AMBOS LADOS
       ---------------------------------------------------------------- */
    async function guardarPref(clave, valor) {
        // 1. Guardar en localStorage (inmediato)
        try {
            localStorage.setItem(clave, valor);
        } catch (e) {
            console.warn('[Apariencia] No se pudo guardar en localStorage:', e);
        }

        // 2. Guardar en Supabase (async, no bloquea)
        const client = getSupabase();
        if (!client) return;

        try {
            const sessionResult = await client.auth.getSession();
            if (!sessionResult.data?.session?.user) return;

            const keyPrefs = clave === KEYS.tema ? 'mostrar_tema' :
                             clave === KEYS.tamano_fuente ? 'mostrar_tamano_fuente' :
                             clave === KEYS.color_acento ? 'mostrar_color_acento' : clave;

            // Intentar con RPC
            try {
                await client.rpc('actualizar_preferencia', {
                    p_key: keyPrefs,
                    p_value: valor
                });
                return;
            } catch (rpcError) {
                // Fallback: update directo
                const { data: pref } = await client
                    .from('preferencias_usuario')
                    .select('prefs')
                    .eq('usuario_id', sessionResult.data.session.user.id)
                    .maybeSingle();

                const nuevoPrefs = { ...(pref?.prefs || {}), [keyPrefs]: valor };
                await client
                    .from('preferencias_usuario')
                    .upsert({
                        usuario_id: sessionResult.data.session.user.id,
                        prefs: nuevoPrefs
                    }, { onConflict: 'usuario_id' });
            }
        } catch (e) {
            console.warn('[Apariencia] No se pudo guardar en Supabase:', e);
        }
    }

    /* ----------------------------------------------------------------
       HELPERS DE COLOR
       ---------------------------------------------------------------- */
    function ajustarColor(hex, porcentaje) {
        try {
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

            return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            return hex;
        }
    }

    /* ----------------------------------------------------------------
       APLICAR TEMA
       ---------------------------------------------------------------- */
    function aplicarTema(tema) {
        const html = document.documentElement;

        html.classList.remove('tema-dia', 'tema-noche');
        html.removeAttribute('data-tema');

        if (tema === 'dia') {
            html.classList.add('tema-dia');
            html.setAttribute('data-tema', 'dia');
        } else if (tema === 'noche') {
            html.classList.add('tema-noche');
            html.setAttribute('data-tema', 'noche');
        } else {
            const prefiereOscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            html.setAttribute('data-tema', prefiereOscuro ? 'noche' : 'dia');
            html.classList.add(prefiereOscuro ? 'tema-noche' : 'tema-dia');
        }
    }

    /* ----------------------------------------------------------------
       APLICAR COLOR DE ACENTO
       ---------------------------------------------------------------- */
    function aplicarColorAcento(color) {
        const html = document.documentElement;

        html.style.setProperty('--gold', color);
        html.style.setProperty('--gold-dark', ajustarColor(color, -15));
        html.style.setProperty('--gold-light', ajustarColor(color, 15));
        html.style.setProperty('--gold-bright', ajustarColor(color, 25));
        html.style.setProperty('--cfg-gold', color);
        html.style.setProperty('--accent', color);
        html.style.setProperty('--accent-dark', ajustarColor(color, -15));
        html.style.setProperty('--accent-light', ajustarColor(color, 15));
    }

    /* ----------------------------------------------------------------
       APLICAR TAMAÑO DE FUENTE
       ---------------------------------------------------------------- */
    function aplicarTamanoFuente(porcentaje) {
        const html = document.documentElement;
        const valor = Math.max(80, Math.min(140, porcentaje));

        html.style.fontSize = (16 * valor / 100) + 'px';
        html.setAttribute('data-font-size', valor);
        html.style.setProperty('--preview-size', (15 * valor / 100) + 'px');
    }

    /* ----------------------------------------------------------------
       APLICAR TODO
       ---------------------------------------------------------------- */
    function aplicarTodo(prefs) {
        const p = prefs || prefsActuales;
        aplicarTema(p.tema);
        aplicarColorAcento(p.color_acento);
        aplicarTamanoFuente(p.tamano_fuente);
        prefsActuales = { ...p };
    }

    /* ----------------------------------------------------------------
       INICIALIZACIÓN
       1. Aplica localStorage INMEDIATAMENTE (sin flash)
       2. Luego consulta Supabase y sobreescribe si hay diferencias
       ---------------------------------------------------------------- */
    async function inicializar() {
        // PASO 1: Aplicar localStorage ya (0ms delay)
        const prefsLocal = leerDeLocalStorage();
        aplicarTodo(prefsLocal);

        // PASO 2: Esperar Supabase y comparar
        let intentos = 0;
        while (!getSupabase() && intentos < 20) {
            await new Promise(r => setTimeout(r, 100));
            intentos++;
        }

        const prefsSupabase = await leerDeSupabase();
        if (prefsSupabase) {
            // ¿Hay diferencias?
            const hayDiferencias =
                prefsSupabase.tema !== prefsLocal.tema ||
                prefsSupabase.tamano_fuente !== prefsLocal.tamano_fuente ||
                prefsSupabase.color_acento !== prefsLocal.color_acento;

            if (hayDiferencias) {
                // Supabase GANA (es la fuente de verdad)
                aplicarTodo(prefsSupabase);

                // Sincronizar localStorage con Supabase
                try {
                    localStorage.setItem(KEYS.tema, prefsSupabase.tema);
                    localStorage.setItem(KEYS.tamano_fuente, String(prefsSupabase.tamano_fuente));
                    localStorage.setItem(KEYS.color_acento, prefsSupabase.color_acento);
                } catch (e) {}

                console.log('[Apariencia] 🔄 Sincronizado desde Supabase:', prefsSupabase);
            }
        }

        syncConSupabaseListo = true;
    }

    /* ----------------------------------------------------------------
       ESCUCHAR CAMBIOS DE OTRA PESTAÑA (localStorage)
       ---------------------------------------------------------------- */
    window.addEventListener('storage', function(e) {
        if (e.key && (e.key === KEYS.tema || e.key === KEYS.tamano_fuente || e.key === KEYS.color_acento)) {
            const prefs = leerDeLocalStorage();
            aplicarTodo(prefs);
        }
    });

    /* ----------------------------------------------------------------
       ESCUCHAR CAMBIOS DEL SISTEMA (tema 'sistema')
       ---------------------------------------------------------------- */
    try {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', function() {
            if (prefsActuales.tema === 'sistema') {
                aplicarTema('sistema');
            }
        });
    } catch (e) {}

    /* ----------------------------------------------------------------
       ARRANCAR
       ---------------------------------------------------------------- */
    inicializar();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { aplicarTodo(); }, { once: true });
    }

    /* ----------------------------------------------------------------
       API PÚBLICA
       ---------------------------------------------------------------- */
    window.SarielApariencia = {
        aplicar: aplicarTodo,
        aplicarTema: aplicarTema,
        aplicarColorAcento: aplicarColorAcento,
        aplicarTamanoFuente: aplicarTamanoFuente,
        leer: leerDeLocalStorage,
        leerSupabase: leerDeSupabase,
        guardarPref: guardarPref,
        setTema: function(t) { guardarPref(KEYS.tema, t); aplicarTema(t); prefsActuales.tema = t; },
        setColor: function(c) { guardarPref(KEYS.color_acento, c); aplicarColorAcento(c); prefsActuales.color_acento = c; },
        setFuente: function(f) { guardarPref(KEYS.tamano_fuente, f); aplicarTamanoFuente(f); prefsActuales.tamano_fuente = f; },
        recargar: inicializar,
        KEYS: KEYS,
        DEFAULTS: DEFAULTS
    };

    console.log('[Apariencia] ✅ Módulo global v2.0 cargado (localStorage + Supabase)');
})();