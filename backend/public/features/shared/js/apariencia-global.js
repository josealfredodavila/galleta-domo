/* ================================================================
   APARIENCIA GLOBAL - SARIEL'S ECOSYSTEM v2.5
   - Lee de localStorage (rápido, sin red)
   - Sincroniza con Supabase preferencias_usuario (persistente)
   - Aplica tema, color de acento y tamaño de fuente globalmente
   - Inyecta Marquinhos-pet en todas las páginas
   - ✅ v2.5: Carga marquinhos-fit.js + marquinhos-accesorios-svg.js
              (FASE 1 y FASE 2 de accesorios con SVG real)
   ================================================================ */

(function() {
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

    let prefsActuales = { ...DEFAULTS };
    let syncConSupabaseListo = false;

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

    async function leerDeSupabase() {
        try {
            const client = getSupabase();
            if (!client) return null;

            const sessionResult = await client.auth.getSession();
            if (sessionResult.error || !sessionResult.data?.session?.user) return null;

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
                console.warn('[Apariencia] RPC obtener_mis_preferencias falló:', rpcError);
            }

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

    async function guardarPref(clave, valor) {
        try {
            localStorage.setItem(clave, valor);
        } catch (e) {
            console.warn('[Apariencia] No se pudo guardar en localStorage:', e);
        }

        const client = getSupabase();
        if (!client) return;

        try {
            const sessionResult = await client.auth.getSession();
            if (!sessionResult.data?.session?.user) return;

            const keyPrefs = clave === KEYS.tema ? 'mostrar_tema' :
                             clave === KEYS.tamano_fuente ? 'mostrar_tamano_fuente' :
                             clave === KEYS.color_acento ? 'mostrar_color_acento' : clave;

            try {
                await client.rpc('actualizar_preferencia', {
                    p_key: keyPrefs,
                    p_value: valor
                });
                return;
            } catch (rpcError) {
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

    function aplicarTamanoFuente(porcentaje) {
        const html = document.documentElement;
        const valor = Math.max(80, Math.min(140, porcentaje));

        html.style.fontSize = (16 * valor / 100) + 'px';
        html.setAttribute('data-font-size', valor);
        html.style.setProperty('--preview-size', (15 * valor / 100) + 'px');
    }

    function aplicarTodo(prefs) {
        const p = prefs || prefsActuales;
        aplicarTema(p.tema);
        aplicarColorAcento(p.color_acento);
        aplicarTamanoFuente(p.tamano_fuente);
        prefsActuales = { ...p };
    }

    async function inicializar() {
        const prefsLocal = leerDeLocalStorage();
        aplicarTodo(prefsLocal);

        let intentos = 0;
        while (!getSupabase() && intentos < 20) {
            await new Promise(r => setTimeout(r, 100));
            intentos++;
        }

        const prefsSupabase = await leerDeSupabase();
        if (prefsSupabase) {
            const hayDiferencias =
                prefsSupabase.tema !== prefsLocal.tema ||
                prefsSupabase.tamano_fuente !== prefsLocal.tamano_fuente ||
                prefsSupabase.color_acento !== prefsLocal.color_acento;

            if (hayDiferencias) {
                aplicarTodo(prefsSupabase);

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

    window.addEventListener('storage', function(e) {
        if (e.key && (e.key === KEYS.tema || e.key === KEYS.tamano_fuente || e.key === KEYS.color_acento)) {
            const prefs = leerDeLocalStorage();
            aplicarTodo(prefs);
        }
    });

    try {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', function() {
            if (prefsActuales.tema === 'sistema') {
                aplicarTema('sistema');
            }
        });
    } catch (e) {}

    inicializar();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { aplicarTodo(); }, { once: true });
    }

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

    /* ================================================================
       ✅ Inyectar Marquinhos-pet en todas las páginas
       ================================================================
       Orden de carga:
       CSS → boca.js → fit.js → accesorios-svg.js → animaciones.js
       → pet.js → brain.js
       ================================================================ */
    (function inyectarMarquinhosPet() {
        var path = window.location.pathname.toLowerCase();

        var excluidas = [
            '/login', '/registro',
            '/pagar', '/pay', '/checkout', '/success', '/cancel',
            '/terminos', '/privacidad', '/cookies', '/legal',
            '/info', '/live-terminos', '/eliminar-cuenta',
            '/actualizar-contrasena',
            '/features/marquinhos/tienda'
        ];

        for (var i = 0; i < excluidas.length; i++) {
            if (path.indexOf(excluidas[i]) !== -1) return;
        }

        if (document.getElementById('marquinhos-pet-script')) return;

        var insertar = function() {
            // CSS
            var css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = '/features/marquinhos/marquinhos-pet.css';
            css.id = 'marquinhos-pet-css';
            document.head.appendChild(css);

            // Analizador de boca (visemas)
            var boca = document.createElement('script');
            boca.id = 'marquinhos-boca-script';
            boca.src = '/features/marquinhos/marquinhos-boca.js';
            boca.defer = true;
            document.head.appendChild(boca);

            // Sistema de fit compartido
            var fit = document.createElement('script');
            fit.id = 'marquinhos-fit-script';
            fit.src = '/features/marquinhos/marquinhos-fit.js';
            fit.defer = true;
            document.head.appendChild(fit);

            // ✅ NUEVO v2.5: Biblioteca de SVG reales de accesorios
            var svgAcc = document.createElement('script');
            svgAcc.id = 'marquinhos-accesorios-svg-script';
            svgAcc.src = '/features/marquinhos/marquinhos-accesorios-svg.js';
            svgAcc.defer = true;
            document.head.appendChild(svgAcc);

            // Sistema de animaciones Disney
            var anim = document.createElement('script');
            anim.id = 'marquinhos-anim-script';
            anim.src = '/features/marquinhos/marquinhos-animaciones.js';
            anim.defer = true;
            document.head.appendChild(anim);

            // Pet
            var js = document.createElement('script');
            js.id = 'marquinhos-pet-script';
            js.src = '/features/marquinhos/marquinhos-pet.js';
            js.defer = true;
            document.head.appendChild(js);

            // Brain
            var brain = document.createElement('script');
            brain.id = 'marquinhos-brain-script';
            brain.src = '/features/marquinhos/marquinhos-brain.js';
            brain.defer = true;
            document.head.appendChild(brain);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', insertar);
        } else {
            insertar();
        }
    })();

    console.log('[Apariencia] ✅ Módulo global v2.5 cargado (localStorage + Supabase + Pet + Boca + Fit + SVG Accesorios + Animaciones Disney)');
})();