/* ================================================================
   CSARIEL'S · REACCIONES GLOBAL v1.0
   Módulo común de reacciones · 4 emojis oficiales
   ================================================================
   RESPONSABILIDAD:
   - Lista oficial de emojis (❤️ 😂 🥺 💎)
   - Motor visual (entropía --dur / --delay)
   - Crear botón de reacción y barra de opciones
   - Cargar reacciones desde Supabase
   - Lógica de toggle (insert / update / delete)
   ================================================================ */

(function (global) {
    'use strict';

    var EMOJIS = ['❤️', '😂', '🥺', '💎'];
    var DEFAULT = '❤️';

    var CLASES_EMOJI = {
        '❤️': 'emo-corazon',
        '😂': 'emo-risa',
        '🥺': 'emo-brillo',
        '💎': 'emo-diamante',
        '🤩': 'emo-estrellas'
    };

    var CLASES_TODAS = ['emo-corazon', 'emo-risa', 'emo-brillo', 'emo-diamante', 'emo-estrellas', 'emo-fluido'];

    var SVG_CORAZON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

    function claseEmoji(emoji) {
        return CLASES_EMOJI[emoji] || 'emo-fluido';
    }

    function aplicarMotorEmoji(el, emoji) {
        if (!el) return;
        CLASES_TODAS.forEach(function (c) { el.classList.remove(c); });
        el.classList.add(claseEmoji(emoji));
        var dur = 1.6 + Math.random() * 1.2;
        var delay = -Math.random() * dur;
        el.style.setProperty('--dur', dur.toFixed(2) + 's');
        el.style.setProperty('--delay', delay.toFixed(2) + 's');
    }

    function escapeHtml(valor) {
        if (valor === null || valor === undefined) return '';
        return String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatearContador(n) {
        if (!n) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
        return String(n);
    }

    /* Crea el botón principal de reacción (el que ve el usuario) */
    function crearBotonReaccion(opts) {
        opts = opts || {};
        var boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'acc-btn reac-btn';
        boton.setAttribute('aria-label', 'Reaccionar');
        if (opts.id) boton.dataset.videoId = opts.id;
        actualizarBotonReaccion(boton, opts.miTipo, opts.iconoCorazon);
        return boton;
    }

    function actualizarBotonReaccion(boton, miTipo, iconoCorazon) {
        if (!boton) return;
        var corazon = iconoCorazon || SVG_CORAZON;
        if (miTipo && EMOJIS.indexOf(miTipo) !== -1) {
            boton.innerHTML = '<span class="reac-emoji">' + escapeHtml(miTipo) + '</span>';
            aplicarMotorEmoji(boton.querySelector('.reac-emoji'), miTipo);
        } else {
            boton.innerHTML = corazon;
        }
    }

    /* Crea la barra con los 4 botones de emoji */
    function crearBarraReacciones(opts) {
        opts = opts || {};
        var barra = document.createElement('div');
        barra.className = 'reac-barra';
        if (opts.id) barra.id = 'reac-' + opts.id;
        EMOJIS.forEach(function (e) {
            var op = document.createElement('button');
            op.type = 'button';
            op.className = 'reac-op' + (opts.miTipo === e ? ' activa' : '');
            op.dataset.e = e;
            op.textContent = e;
            barra.appendChild(op);
        });
        return barra;
    }

    /* Carga las reacciones de un conjunto de IDs desde Supabase */
    async function cargarReacciones(opts) {
        var client = opts.client;
        var tabla = opts.tabla;
        var columnaFk = opts.columnaFk;
        var ids = opts.ids;
        var usuarioId = opts.usuarioId;

        var cache = { totales: {}, mio: {} };
        if (!client || !ids || !ids.length) return cache;

        var result = await client.from(tabla).select(columnaFk + ', usuario_id, tipo').in(columnaFk, ids);
        if (result.error) throw result.error;

        (result.data || []).forEach(function (r) {
            var tipo = r.tipo || DEFAULT;
            if (!cache.totales[r[columnaFk]]) cache.totales[r[columnaFk]] = {};
            cache.totales[r[columnaFk]][tipo] = (cache.totales[r[columnaFk]][tipo] || 0) + 1;
            if (usuarioId && r.usuario_id === usuarioId) {
                cache.mio[r[columnaFk]] = tipo;
            }
        });

        return cache;
    }

    function contar(cache, postId) {
        if (!cache || !cache.totales || !cache.totales[postId]) return 0;
        var t = 0;
        var tipos = cache.totales[postId];
        Object.keys(tipos).forEach(function (k) { t += tipos[k]; });
        return t;
    }

    /* Lógica completa: insert / update / delete según estado previo */
    async function reaccionar(opts) {
        var client = opts.client;
        var tabla = opts.tabla;
        var columnaFk = opts.columnaFk;
        var postId = opts.postId;
        var usuarioId = opts.usuarioId;
        var emoji = opts.emoji;
        var tipoPrevio = opts.tipoPrevio || null;

        if (!client || !postId || !usuarioId) throw new Error('Datos incompletos');
        if (EMOJIS.indexOf(emoji) === -1) throw new Error('Emoji no permitido');

        if (tipoPrevio === emoji) {
            var del = await client.from(tabla).delete().eq(columnaFk, postId).eq('usuario_id', usuarioId);
            if (del.error) throw del.error;
            return { accion: 'eliminada', tipo: null };
        }

        if (tipoPrevio) {
            var upd = await client.from(tabla).update({ tipo: emoji }).eq(columnaFk, postId).eq('usuario_id', usuarioId);
            if (upd.error) throw upd.error;
            return { accion: 'actualizada', tipo: emoji };
        }

        var ins = await client.from(tabla).insert({
            [columnaFk]: postId,
            usuario_id: usuarioId,
            tipo: emoji
        });
        if (ins.error) throw ins.error;
        return { accion: 'creada', tipo: emoji };
    }

    global.ReaccionesGlobal = {
        EMOJIS: EMOJIS,
        DEFAULT: DEFAULT,
        CLASES_EMOJI: CLASES_EMOJI,
        SVG_CORAZON: SVG_CORAZON,
        aplicarMotorEmoji: aplicarMotorEmoji,
        crearBotonReaccion: crearBotonReaccion,
        actualizarBotonReaccion: actualizarBotonReaccion,
        crearBarraReacciones: crearBarraReacciones,
        cargarReacciones: cargarReacciones,
        contar: contar,
        reaccionar: reaccionar,
        escapeHtml: escapeHtml,
        formatearContador: formatearContador
    };
})(window);