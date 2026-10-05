// ================================================================
// MARQUINHOS · BRAIN v4.0 (doble endpoint + logs visibles)
// ================================================================
// 1. Intenta POST /api/ai/chat-pet  (respuestas fluidas, contexto Sariel's)
// 2. Si falla, intenta POST /api/ai/chat  (el que YA funciona en mensajes)
// 3. Si ambos fallan, usa fallback local
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosBrain) return;

    const TIMEOUT_MS = 30000;

    let _abortController = null;

    // ================================================================
    // FALLBACK LOCAL AMPLIADO
    // ================================================================
    const RESPUESTAS_LOCALES = [
        { keys: ['hola','buenas','hey','qué tal','que tal'],
          r: function(c){ return '¡Hola' + (c.nombre ? ' ' + c.nombre : '') + '! ¿En qué te ayudo?'; } },

        { keys: ['cómo estás','como estas','cómo te va'],
          r: function(){ return '¡Muy bien! Listo para ayudarte. ¿Y tú?'; } },

        { keys: ['quién eres','quien eres','cómo te llamas'],
          r: function(){ return 'Soy Marquinhos, tu asistente personal en Sariel\'s. Estoy aquí para ayudarte con lo que necesites.'; } },

        { keys: ['qué hora','que hora'],
          r: function(){ const n=new Date(); return 'Son las ' + n.getHours() + ':' + String(n.getMinutes()).padStart(2,'0') + '.'; } },

        { keys: ['qué día','que dia','qué fecha'],
          r: function(){ const d=['domingo','lunes','martes','miércoles','jueves','viernes','sábado']; return 'Hoy es ' + d[new Date().getDay()] + '.'; } },

        { keys: ['gracias'],
          r: function(){ return '¡De nada!'; } },

        { keys: ['ayuda','qué puedes hacer','qué haces'],
          r: function(){ return 'Puedo conversar sobre cualquier tema, explicarte el ecosistema Sariel\'s (Muro, Canales, Grupos, Live, Mensajes, Perfil, Wallet, Es.stoks, Domos), darte consejos, hacer cálculos y más.'; } },

        { keys: ['muro'],
          r: function(){ return 'El Muro es un mercado P2P donde compras y vendes Es.stoks entre usuarios. Se cobra 3% de comisión.'; } },

        { keys: ['canal','canales'],
          r: function(){ return 'Los Canales son públicos y solo el creador publica.'; } },

        { keys: ['grupo','grupos'],
          r: function(){ return 'Los Grupos son privados y todos los miembros pueden publicar.'; } },

        { keys: ['live','transmit'],
          r: function(){ return 'En Live hay dos modos: Profesional (con membresía) y en Grupos (gratis aceptando términos).'; } },

        { keys: ['es.stok','es stok','esstok','token'],
          r: function(){ return 'Los Es.stoks son tokens del ecosistema. 12 Es.stoks equivalen a 1 NFT Domo.'; } },

        { keys: ['domo'],
          r: function(){ return 'Los Domos son productos físicos del ecosistema. Cada uno tiene un QR que se escanea para recibir Es.stoks.'; } },

        { keys: ['wallet','billetera'],
          r: function(){ return 'La Wallet se conecta desde Configuración → Wallet y Polygon. Sirve para recibir y enviar cripto en Polygon.'; } },

        { keys: ['dormir','descansar','sueño','insomnio'],
          r: function(){ return 'Para dormir mejor: 1) Evita pantallas 1 hora antes de dormir. 2) Toma algo tibio como leche o té de manzanilla. 3) Mantén la habitación fresca y oscura. 4) Acuéstate a la misma hora todos los días.'; } },

        { keys: ['ejercicio','entrenar'],
          r: function(){ return 'Hacer ejercicio 30 minutos al día mejora tu ánimo, tu sueño y tu salud. Empieza caminando y ve subiendo poco a poco.'; } },

        { keys: ['agua','hidrat'],
          r: function(){ return 'Tomar suficiente agua al día mejora tu energía y concentración. Se recomienda entre 6 y 8 vasos.'; } }
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
    // LLAMAR A UN ENDPOINT
    // ================================================================
    async function llamarEndpoint(url, payload, token, timeoutMs) {
        // Abortar anterior
        if (_abortController) {
            try { _abortController.abort(); } catch (e) {}
        }
        _abortController = new AbortController();

        const timeout = setTimeout(function() {
            try { _abortController.abort(); } catch (e) {}
        }, timeoutMs);

        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(payload),
                signal: _abortController.signal
            });

            clearTimeout(timeout);

            console.log('[Marquinhos/Brain] ' + url + ' →', resp.status);

            if (!resp.ok) {
                const errText = await resp.text().catch(function(){ return ''; });
                console.warn('[Marquinhos/Brain] Error body:', errText.slice(0, 300));
                return { ok: false, status: resp.status, error: errText };
            }

            const data = await resp.json();
            const reply = data && (data.reply || data.message || data.response);

            if (reply && typeof reply === 'string' && reply.trim().length > 0) {
                return { ok: true, reply: reply.trim() };
            }

            return { ok: false, status: resp.status, error: 'sin reply' };

        } catch (e) {
            clearTimeout(timeout);
            console.warn('[Marquinhos/Brain] Fetch falló:', e.name, e.message);
            return { ok: false, error: e.message, aborted: e.name === 'AbortError' };
        }
    }

    // ================================================================
    // PREGUNTAR
    // ================================================================
    async function preguntar(texto, historialLocal) {
        if (!texto || typeof texto !== 'string') return '';

        const userInfo = window.Marquinhos && window.Marquinhos.getUserInfo
            ? window.Marquinhos.getUserInfo()
            : null;
        const ctx = { nombre: userInfo ? userInfo.nombre : null };

        // Historial corto
        const historialEnvio = Array.isArray(historialLocal)
            ? historialLocal.slice(-6).map(function(m) {
                return { role: m.role, content: m.content };
              })
            : [];

        // ============================================================
        // 1. Intentar /api/ai/chat-pet
        // ============================================================
        try {
            if (window.getSupabase) {
                const sb = window.getSupabase();
                const s = await sb.auth.getSession();

                if (s && s.data && s.data.session && s.data.session.access_token) {
                    const token = s.data.session.access_token;

                    console.log('[Marquinhos/Brain] Intentando chat-pet...');

                    const r1 = await llamarEndpoint(
                        '/api/ai/chat-pet',
                        {
                            message: texto.trim(),
                            history: historialEnvio,
                            page: window.location.pathname,
                            user_name: ctx.nombre
                        },
                        token,
                        TIMEOUT_MS
                    );

                    if (r1.ok) {
                        console.log('[Marquinhos/Brain] ✅ chat-pet OK');
                        return r1.reply;
                    }

                    console.warn('[Marquinhos/Brain] chat-pet falló, probando chat normal...');

                    // ====================================================
                    // 2. Fallback: /api/ai/chat (el que SÍ funciona)
                    // ====================================================
                    const r2 = await llamarEndpoint(
                        '/api/ai/chat',
                        {
                            message: texto.trim(),
                            context: 'marquinhos_pet',
                            history: historialEnvio
                        },
                        token,
                        TIMEOUT_MS
                    );

                    if (r2.ok) {
                        console.log('[Marquinhos/Brain] ✅ chat normal OK');
                        return r2.reply;
                    }

                    console.warn('[Marquinhos/Brain] Ambos endpoints fallaron.');
                } else {
                    console.warn('[Marquinhos/Brain] No hay sesión activa.');
                }
            } else {
                console.warn('[Marquinhos/Brain] getSupabase no disponible.');
            }
        } catch (e) {
            console.warn('[Marquinhos/Brain] Error general:', e.message);
        }

        // ============================================================
        // 3. Fallback local
        // ============================================================
        const local = buscarRespuestaLocal(texto, ctx);
        if (local) return local;

        return 'No pude procesar eso ahora. Intenta de nuevo en unos segundos.';
    }

    window.MarquinhosBrain = {
        preguntar: preguntar
    };

    console.log('[Marquinhos/Brain] ✅ v4.0 cargado (doble endpoint + fallback)');
})();