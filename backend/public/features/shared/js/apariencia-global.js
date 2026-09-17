/* ================================================================
   APARIENCIA GLOBAL - SARIEL'S ECOSYSTEM
   Aplica tema, color de acento y tamaño de fuente en TODAS
   las páginas del ecosistema.
   ================================================================ */

(function() {
    'use strict';

    // Clave de localStorage para guardar preferencias
    const STORAGE_KEY = 'sariels-apariencia';

    // Preferencias por defecto
    const DEFAULTS = {
        tema: 'sistema',           // 'sistema' | 'dia' | 'noche'
        colorAcento: '#00d68f',    // color por defecto (verde Sariel's)
        tamanoFuente: 100          // % de 80 a 130
    };

    // Colores de acento disponibles
    const COLORES = {
        '#D4AF37': 'dorado',
        '#2196F3': 'azul',
        '#FFC107': 'amarillo',
        '#00d68f': 'verde',
        '#a855f7': 'morado',
        '#ff3366': 'rosa',
        '#ec4899': 'rosa-fuerte',
        '#00e5ff': 'cyan'
    };

    /* ----------------------------------------------------------------
       LEER PREFERENCIAS
       ---------------------------------------------------------------- */
    function leerPreferencias() {
        try {
            const guardadas = localStorage.getItem(STORAGE_KEY);
            if (!guardadas) return { ...DEFAULTS };
            const parsed = JSON.parse(guardadas);
            return { ...DEFAULTS, ...parsed };
        } catch (e) {
            console.warn('[Apariencia] Error leyendo preferencias:', e);
            return { ...DEFAULTS };
        }
    }

    /* ----------------------------------------------------------------
       APLICAR TEMA (claro/oscuro/sistema)
       ---------------------------------------------------------------- */
    function aplicarTema(tema) {
        const html = document.documentElement;

        // Quitar clases anteriores
        html.classList.remove('tema-dia', 'tema-noche');

        if (tema === 'dia') {
            html.classList.add('tema-dia');
            html.setAttribute('data-tema', 'dia');
        } else if (tema === 'noche') {
            html.classList.add('tema-noche');
            html.setAttribute('data-tema', 'noche');
        } else {
            // 'sistema' - sigue la preferencia del SO
            const prefiereOscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
            html.setAttribute('data-tema', prefiereOscuro ? 'noche' : 'dia');
            html.classList.add(prefiereOscuro ? 'tema-noche' : 'tema-dia');
        }

        console.log('[Apariencia] 🎨 Tema aplicado:', tema);
    }

    /* ----------------------------------------------------------------
       APLICAR COLOR DE ACENTO
       Cambia la variable CSS --gold y otras variantes
       ---------------------------------------------------------------- */
    function aplicarColorAcento(color) {
        const html = document.documentElement;
        const nombreColor = COLORES[color] || 'personalizado';

        // Variables CSS - sobreescriben las del :root original
        html.style.setProperty('--gold', color);
        html.style.setProperty('--gold-dark', oscurecer(color, 15));
        html.style.setProperty('--gold-light', aclarar(color, 15));
        html.style.setProperty('--gold-bright', aclarar(color, 25));

        // Color de acento general
        html.style.setProperty('--accent', color);
        html.style.setProperty('--accent-dark', oscurecer(color, 15));
        html.style.setProperty('--accent-light', aclarar(color, 15));

        console.log('[Apariencia] 🎨 Color de acento aplicado:', color, '(' + nombreColor + ')');
    }

    /* ----------------------------------------------------------------
       APLICAR TAMAÑO DE FUENTE
       ---------------------------------------------------------------- */
    function aplicarTamanoFuente(porcentaje) {
        const html = document.documentElement;
        const valor = Math.max(80, Math.min(130, porcentaje)); // límites 80-130

        // Ajustar el tamaño base del HTML
        html.style.fontSize = valor + '%';

        // Guardar en atributo para otras páginas
        html.setAttribute('data-font-size', valor);

        console.log('[Apariencia] 🔤 Tamaño de fuente aplicado:', valor + '%');
    }

    /* ----------------------------------------------------------------
       HELPERS DE COLOR
       ---------------------------------------------------------------- */
    function aclarar(hex, porcentaje) {
        return ajustarColor(hex, porcentaje);
    }

    function oscurecer(hex, porcentaje) {
        return ajustarColor(hex, -porcentaje);
    }

    function ajustarColor(hex, porcentaje) {
        try {
            let r = parseInt(hex.substring(1, 3), 16);
            let g = parseInt(hex.substring(3, 5), 16);
            let b = parseInt(hex.substring(5, 7), 16);

            const factor = porcentaje / 100;

            if (factor > 0) {
                // Aclarar
                r = Math.round(r + (255 - r) * factor);
                g = Math.round(g + (255 - g) * factor);
                b = Math.round(b + (255 - b) * factor);
            } else {
                // Oscurecer
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
       APLICAR TODO
       ---------------------------------------------------------------- */
    function aplicarTodo() {
        const prefs = leerPreferencias();
        aplicarTema(prefs.tema);
        aplicarColorAcento(prefs.colorAcento);
        aplicarTamanoFuente(prefs.tamanoFuente);
    }

    /* ----------------------------------------------------------------
       ESCUCHAR CAMBIOS DE OTRA PESTAÑA
       ---------------------------------------------------------------- */
    window.addEventListener('storage', function(e) {
        if (e.key === STORAGE_KEY) {
            console.log('[Apariencia] 🔄 Cambio detectado en otra pestaña, reaplicando...');
            aplicarTodo();
        }
    });

    /* ----------------------------------------------------------------
       ESCUCHAR CAMBIOS DEL SISTEMA (para tema 'sistema')
       ---------------------------------------------------------------- */
    try {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', function() {
            const prefs = leerPreferencias();
            if (prefs.tema === 'sistema') {
                aplicarTema('sistema');
            }
        });
    } catch (e) {
        console.warn('[Apariencia] matchMedia no disponible');
    }

    /* ----------------------------------------------------------------
       APLICAR INMEDIATAMENTE (antes de DOMContentLoaded)
       Para evitar el "flash" de tema incorrecto
       ---------------------------------------------------------------- */
    aplicarTodo();

    /* ----------------------------------------------------------------
       RE-APLICAR CUANDO EL DOM ESTÉ LISTO
       ---------------------------------------------------------------- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', aplicarTodo, { once: true });
    }

    /* ----------------------------------------------------------------
       API PÚBLICA
       Para que otras páginas puedan llamar a estas funciones
       ---------------------------------------------------------------- */
    window.SarielApariencia = {
        aplicar: aplicarTodo,
        aplicarTema: aplicarTema,
        aplicarColorAcento: aplicarColorAcento,
        aplicarTamanoFuente: aplicarTamanoFuente,
        leer: leerPreferencias,
        guardar: function(prefs) {
            try {
                const actuales = leerPreferencias();
                const nuevas = { ...actuales, ...prefs };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevas));
                aplicarTodo();
                return nuevas;
            } catch (e) {
                console.warn('[Apariencia] Error guardando:', e);
                return null;
            }
        },
        DEFAULTS: DEFAULTS,
        STORAGE_KEY: STORAGE_KEY
    };

    console.log('[Apariencia] ✅ Módulo de apariencia global cargado');
})();