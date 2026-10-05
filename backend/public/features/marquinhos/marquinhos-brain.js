// ================================================================
// MARQUINHOS · BRAIN v2.0
// ================================================================
// Conecta con IA real (/api/ai/chat) para respuestas complejas
// sobre CUALQUIER tema, no solo el ecosistema.
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosBrain) return;

    const HISTORIAL_MAX = 20;
    const TIMEOUT_MS = 60000;

    let _abortController = null;
    let _historialCache = null;

    // ================================================================
    // CONOCIMIENTO DEL ECOSISTEMA (system prompt adicional)
    // ================================================================
    const CONTEXTO_SARIELS = `
Eres Marquinhos, el asistente personal del ecosistema Sariel's.

Sobre Sariel's:
- Es un ecosistema Web3 en Polygon (cripto).
- Los Domos son productos físicos que acumulan Es.stoks.
- Los Es.stoks son tokens internos. 12 Es.stoks = 1 NFT Domo.
- Secciones: Muro (publicaciones), Canales (públicos), Grupos (privados), Live (transmisiones), Mensajes, Perfil, Wallet, Internet (eSIMs), Videos, Marketing, Mercado.
- El Muro es donde compartes publicaciones con texto, fotos, hashtags.
- Los Canales son públicos: solo el creador publica.
- Los Grupos son privados: todos los miembros publican.
- Live requiere un Live Pass activo (de pago).
- La Wallet gestiona cripto en Polygon.

Comportamiento:
- Habla natural, cercano, cálido.
- Usa español mexicano neutro.
- Respuestas fluidas y completas (2-5 frases normalmente).
- Si no sabes algo, dilo con honestidad.
- Puedes responder CUALQUIER pregunta (no solo del ecosistema): ayuda general, conocimiento, matemáticas, consejos, etc.
- Sé útil, conciso, no des vueltas.
- Nunca inventes datos personales del usuario.
`.trim();

    // ================================================================
    // RESPUESTAS LOCALES (fallback si el backend falla)
    // ================================================================
    const RESPUESTAS_LOCALES = [
        { keys: ['hola','buenas','hey','qué tal'], r: function(c){ return '¡Hola' + (c.nombre ? ' ' + c.nombre : '') + '! ¿En qué te ayudo?'; } },
        { keys: ['cómo estás','como estas'], r: function(){ return '¡Bien! Listo para ayudarte. ¿Y tú?'; } },
        { keys: ['quién eres','quien eres','cómo te llamas'], r: function(){ return 'Soy Marquinhos, tu asistente en Sariel\'s. Estoy aquí para ayudarte con lo que necesites.'; } },
        { keys: ['qué hora','que hora'], r: function(){ const n=new Date(); return 'Son las ' + n.getHours() + ':' + String(n.getMinutes()).padStart(2,'0') + '.'; } },
        { keys: ['qué día','que dia','qué fecha'], r: function(){ const d=['domingo','lunes','martes','miércoles','jueves','viernes','sábado']; return 'Hoy es ' + d[new Date().getDay()] + '.'; } },
        { keys: ['gracias'], r: function(){ return '¡De nada!'; } },
        { keys: ['ayuda','qué puedes hacer','qué haces'], r: function(){ return 'Puedo conversar sobre cualquier tema, ayudarte con tareas, explicarte el ecosistema Sariel\'s, darte consejos, hacer cálculos y mucho más. Pregúntame lo que quieras.'; } },
        { keys: ['muro'], r: function(){ return 'El Muro es donde compartes publicaciones. Puedes escribir, subir fotos, usar hashtags y mencionar a otros.'; } },
        { keys: ['canal','grupo'], r: function(){ return 'Los Canales son públicos: solo el creador publica. Los Grupos son privados: todos publican.'; } },
        { keys: ['live'], r: function(){ return 'En Live transmites video en vivo. Necesitas un Live Pass activo.'; } },
        { keys: ['es.stok','token','es stok'], r: function(){ return 'Los Es.stoks son los tokens del ecosistema. 12 Es.stoks equivalen a 1 NFT Domo.'; } },
        { keys: ['domo'], r: function(){ return 'Los Domos son productos físicos del ecosistema que acumulan Es.stoks.'; } }
    ];

    function buscarRespuestaLocal(texto, ctx) {
        const lower = texto.toLowerCase();
        for (let i = 0; i < RESPUESTAS_LOCALES.length; i++) {
            const item = RESPUESTAS_LOCALES[i];
            for (let j = 0; j < item.keys.length; j++) {
                if (lower.indexOf(item.keys[j]) !== -1) return item.r(ctx);
            }
        }
        return null;
    }

    // ================================================================
    // GUARDAR / CARGAR HISTORIAL
    // ================================================================
    async function guardarMensaje(role, contenido) {
        try {
            if (!window.getSupabase) return;
            const sb = window.getSupabase();
            const r = await sb.auth.getSession();
            if (!r.data.session) return;
            await sb.from('marquinhos_conversaciones').insert({
                usuario_id: r.data.session.user.id,
                rol: role,
                contenido: contenido,
                contexto_pagina: window.location.pathname
            });
        } catch (e) {}
    }

    async function cargarHistorial() {
        if (_historialCache) return _historialCache;
        try {
            if (!window.getSupabase) return [];
            const sb = window.getSupabase();
            const r = await sb.auth.getSession();
            if (!r.data.session) return [];
            const { data } = await sb.from('marquinhos_conversaciones')
                .select('rol, contenido, created_at')
                .eq('usuario_id', r.data.session.user.id)
                .order('created_at', { ascending: false })
                .limit(HISTORIAL_MAX);
            if (!data) return [];
            _historialCache = data.reverse().map(function(m) {
                return { role: m.rol === 'user' ? 'user' : 'assistant', content: m.contenido };
            });
            return _historialCache;
        } catch (e) { return []; }
    }

    // ================================================================
    // PREGUNTAR A LA IA
    // ================================================================
    async function preguntar(texto, historialLocal) {
        if (!texto || typeof texto !== 'string') return '';

        const userInfo = window.Marquinhos && window.Marquinhos.getUserInfo ? window.Marquinhos.getUserInfo() : null;
        const ctx = { nombre: userInfo ? userInfo.nombre : null };

        // === 1. Backend IA real ===
        try {
            if (window.getSupabase) {
                const sb = window.getSupabase();
                const s = await sb.auth.getSession();

                if (s.data.session) {
                    // Construir historial completo
                    let historial = [];
                    try { historial = await cargarHistorial(); } catch (e) {}

                    if (Array.isArray(historialLocal) && historialLocal.length > 0) {
                        const recientes = historialLocal.slice(-6).map(function(m) {
                            return { role: m.role, content: m.content };
                        });
                        historial = historial.concat(recientes).slice(-HISTORIAL_MAX);
                    }

                    // Abortar anterior
                    if (_abortController) {
                        try { _abortController.abort(); } catch (e) {}
                    }
                    _abortController = new AbortController();

                    const timeout = setTimeout(function() {
                        try { _abortController.abort(); } catch (e) {}
                    }, TIMEOUT_MS);

                    const resp = await fetch('/api/ai/chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'Authorization': 'Bearer ' + s.data.session.access_token
                        },
                        body: JSON.stringify({
                            message: texto.trim(),
                            context: 'marquinhos_pet',
                            system_extra: CONTEXTO_SARIELS,
                            history: historial,
                            page: window.location.pathname,
                            user_name: ctx.nombre
                        }),
                        signal: _abortController.signal
                    });

                    clearTimeout(timeout);

                    if (resp.ok) {
                        const data = await resp.json();
                        const reply = data && (data.reply || data.message || data.response);
                        if (reply && typeof reply === 'string' && reply.trim().length > 0) {
                            guardarMensaje('user', texto);
                            guardarMensaje('assistant', reply);
                            _historialCache = null;
                            return reply.trim();
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[Marquinhos/Brain] Backend falló:', e);
        }

        // === 2. Fallback local ===
        const local = buscarRespuestaLocal(texto, ctx);
        if (local) return local;

        // === 3. Mensaje genérico ===
        return 'No pude procesar eso ahora. Intenta preguntar algo más simple mientras me reconecto.';
    }

    window.MarquinhosBrain = {
        preguntar: preguntar,
        limpiarHistorial: function() { _historialCache = null; }
    };

    console.log('[Marquinhos/Brain] ✅ Cerebro v2.0 cargado (IA real)');
})();