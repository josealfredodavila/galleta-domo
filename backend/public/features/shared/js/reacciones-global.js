/* ================================================================
   CSARIEL'S · REACCIONES GLOBAL
   Única fuente de la lista de reacciones para todo el ecosistema.
   Sin dependencias. Carga el motor visual (emojis-animations.css).
   ================================================================ */
(function () {
    'use strict';

    if (window.ReaccionesGlobal) return;

    var EMOJIS = ['❤️', '😂', '🥺', '💎'];
    var POR_DEFECTO = '❤️';

    var CLASES = {
        '❤️': 'emo-corazon',
        '😂': 'emo-risa',
        '🥺': 'emo-brillo',
        '💎': 'emo-diamante'
    };

    var CLASES_TODAS = ['emo-corazon', 'emo-risa', 'emo-brillo', 'emo-diamante', 'emo-estrellas', 'emo-fluido'];

    var CSS_PATH = '/features/perfil/css/emojis-animations.css';

    function asegurarCss() {
        if (document.querySelector('link[href="' + CSS_PATH + '"]')) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = CSS_PATH;
        document.head.appendChild(link);
    }

    function esValido(emoji) {
        return EMOJIS.indexOf(emoji) !== -1;
    }

    // Convierte cualquier valor guardado en uno de los 4 emojis.
    // Los valores antiguos (👍, 🥰, like, nulos) pasan a ❤️.
    function normalizar(emoji) {
        return esValido(emoji) ? emoji : POR_DEFECTO;
    }

    function claseEmoji(emoji) {
        return CLASES[emoji] || 'emo-fluido';
    }

    // Asigna la animación y una duración/retraso aleatorios para que
    // los emojis no se muevan de forma robótica.
    function aplicarMotor(el, emoji) {
        if (!el) return;

        CLASES_TODAS.forEach(function (c) { el.classList.remove(c); });
        el.classList.add(claseEmoji(normalizar(emoji)));

        var duracion = 1.6 + Math.random() * 1.2;
        var retraso = -Math.random() * duracion;

        el.style.setProperty('--dur', duracion.toFixed(2) + 's');
        el.style.setProperty('--delay', retraso.toFixed(2) + 's');
    }

    // Resume una lista de reacciones: { tipo, usuario_id }.
    // Devuelve totales por emoji, total general y la reacción del usuario.
    function resumir(filas, usuarioId) {
        var totales = {};
        var total = 0;
        var miTipo = null;

        (filas || []).forEach(function (f) {
            var tipo = normalizar(f.tipo);
            totales[tipo] = (totales[tipo] || 0) + 1;
            total++;
            if (usuarioId && f.usuario_id === usuarioId) miTipo = tipo;
        });

        return { totales: totales, total: total, miTipo: miTipo };
    }

    window.ReaccionesGlobal = {
        EMOJIS: EMOJIS.slice(),
        POR_DEFECTO: POR_DEFECTO,
        esValido: esValido,
        normalizar: normalizar,
        claseEmoji: claseEmoji,
        aplicarMotor: aplicarMotor,
        resumir: resumir,
        asegurarCss: asegurarCss
    };

    asegurarCss();
})();