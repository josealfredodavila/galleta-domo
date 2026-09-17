/* ================================================================
   APARIENCIA GLOBAL - SARIEL'S ECOSYSTEM
   Aplica tema, color de acento y tamaño de fuente en TODAS
   las páginas del ecosistema automáticamente.
   ================================================================ */

(function() {
    'use strict';

    // Claves de localStorage (mismas que usa mostrar.html)
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

    /* ----------------------------------------------------------------
       LEER PREFERENCIAS
       ---------------------------------------------------------------- */
    function leerPref(clave, defecto) {
        try {
            const v = localStorage.getItem(clave);
            return v !== null ? v : defecto;
        } catch (e) {
            return defecto;
        }
    }

    function leerTodas() {
        return {
            tema: leerPref(KEYS.tema, DEFAULTS.tema),
            tamano_fuente: parseInt(leerPref(KEYS.tamano_fuente, DEFAULTS.tamano_fuente)) || 100,
            color_acento: leerPref(KEYS.color_acento, DEFAULTS.color_acento)
        };
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

        // Quitar clases anteriores
        html.classList.remove('tema-dia', 'tema-noche');
        html.removeAttribute('data-tema');

        if (tema === 'dia') {
            html.classList.add('tema-dia');
            html.setAttribute('data-tema', 'dia');
        } else if (tema === 'noche') {
            html.classList.add('tema-noche');
            html.setAttribute('data-tema', 'noche');
        } else {
            // 'sistema' - sigue la preferencia del SO
            const prefiereOscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            html.setAttribute('data-tema', prefiereOscuro ? 'noche' : 'dia');
            html.classList.add(prefiereOscuro ? 'tema-noche' : 'tema-dia');
        }
    }

    /* ----------------------------------------------------------------
       APLICAR COLOR DE ACENTO
       Cambia las variables CSS del ecosistema
       ---------------------------------------------------------------- */
    function aplicarColorAcento(color) {
        const html = document.documentElement;

        // Variables principales del ecosistema
        html.style.setProperty('--gold', color);
        html.style.setProperty('--gold-dark', ajustarColor(color, -15));
        html.style.setProperty('--gold-light', ajustarColor(color, 15));
        html.style.setProperty('--gold-bright', ajustarColor(color, 25));

        // Para las páginas de configuración
        html.style.setProperty('--cfg-gold', color);

        // Variable de acento general (para nuevas implementaciones)
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

        // Tamaño base 16px * (porcentaje/100)
        html.style.fontSize = (16 * valor / 100) + 'px';
        html.setAttribute('data-font-size', valor);

        // Variable para previsualización
        html.style.setProperty('--preview-size', (15 * valor / 100) + 'px');
    }

    /* ----------------------------------------------------------------
       APLICAR TODO
       ---------------------------------------------------------------- */
    function aplicarTodo() {
        const prefs = leerTodas();
        aplicarTema(prefs.tema);
        aplicarColorAcento(prefs.color_acento);
        aplicarTamanoFuente(prefs.tamano_fuente);
    }

    /* ----------------------------------------------------------------
       ESCUCHAR CAMBIOS DE OTRA PESTAÑA
       ---------------------------------------------------------------- */
    window.addEventListener('storage', function(e) {
        if (e.key && (e.key === KEYS.tema || e.key === KEYS.tamano_fuente || e.key === KEYS.color_acento)) {
            aplicarTodo();
        }
    });

    /* ----------------------------------------------------------------
       ESCUCHAR CAMBIOS DEL SISTEMA (para tema 'sistema')
       ---------------------------------------------------------------- */
    try {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', function() {
            const tema = leerPref(KEYS.tema, DEFAULTS.tema);
            if (tema === 'sistema') {
                aplicarTema('sistema');
            }
        });
    } catch (e) {}

    /* ----------------------------------------------------------------
       APLICAR INMEDIATAMENTE (antes de DOMContentLoaded)
       Para evitar el "flash" de tema incorrecto
       ---------------------------------------------------------------- */
    aplicarTodo();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', aplicarTodo, { once: true });
    }

    /* ----------------------------------------------------------------
       API PÚBLICA
       ---------------------------------------------------------------- */
    window.SarielApariencia = {
        aplicar: aplicarTodo,
        aplicarTema: aplicarTema,
        aplicarColorAcento: aplicarColorAcento,
        aplicarTamanoFuente: aplicarTamanoFuente,
        leer: leerTodas,
        KEYS: KEYS,
        DEFAULTS: DEFAULTS
    };

    console.log('[Apariencia] ✅ Módulo global cargado');
})();