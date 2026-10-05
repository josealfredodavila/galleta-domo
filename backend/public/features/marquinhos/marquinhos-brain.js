// ================================================================
// MARQUINHOS · BRAIN v3.0 (IA real + memoria persistente)
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosBrain) return;

    const TIMEOUT_MS = 60000;

    let _abortController = null;
    let _historialSesion = [];

    // ================================================================
    // FALLBACK LOCAL
    // ================================================================
    const RESPUESTAS_LOCALES = [
        { keys: ['hola','buenas','hey','qué tal'], r: function(c){ return '¡Hola' + (c.nombre ? ' ' + c.nombre : '') + '! ¿En qué te ayudo?'; } },
        { keys: ['cómo estás','como estas'], r: function(){ return '¡Bien! Listo para ayudarte. ¿Y tú?'; } },
        { keys: ['quién eres','quien eres'], r: function(){ return 'Soy Marquinhos, tu asistente personal en Sariel\'s.'; } },
        { keys: ['qué hora','que hora'], r: function(){ const n=new Date(); return 'Son las ' + n.getHours() + ':' + String(n.getMinutes()).padStart(2,'0') + '.'; } },
        { keys: ['qué día','que dia'], r: function(){ const d=['domingo','lunes','martes','miércoles','jueves','viernes','sábado']; return 'Hoy es ' + d[new Date().getDay()] + '.'; } },
        { keys: ['gracias'], r: function(){ return '¡De nada!'; } },
        { keys: ['ayuda','qué puedes hacer'], r: function(){ return 'Puedo ayudarte con el Muro, Canales, Grupos, Live, Mensajes, tu Perfil, la Wallet, los Es.stoks, los Domos, y también responder preguntas generales.'; } },
        { keys: ['muro'], r: function(){ return 'El Muro es un mercado P2P donde compras y venden Es.stoks entre usuarios. Hay comisión del 3%.'; } },
        { keys: ['canal','grupo'], r: function(){ return 'Los Canales son públicos y solo el creador publica. Los Grupos son privados y todos los miembros publican.'; } },
        { keys: ['live'], r: function(){ return 'En Live hay dos modos: Profesional (con membresía de pago) y en Grupos (gratis aceptando términos).'; } },
        { keys: ['es.stok','es stok','token'], r: function(){ return 'Los Es.stoks son tokens del ecosistema. 12 Es.stoks equivalen a 1 NFT Domo.'; } },
        { keys: ['domo'], r: function(){ return 'Los Domos son productos físicos del ecosistema. Cada Domo tiene un QR que se escanea para recibir Es.stoks.'; } }
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
    // PREGUNTAR
    // ================================================================
    async function preguntar(texto, historialLocal) {
        if (!texto || typeof texto !== 'string') return '';

        const userInfo = window.Marquinhos && window.Marquinhos.getUserInfo ? window.Marquinhos.getUserInfo() : null;
        const ctx = { nombre: userInfo ? userInfo.nombre : null };

        // 1. Intentar con backend IA real
        try {
            if (window.getSupabase) {
                const sb = window.getSupabase();
                const s = await sb.auth.getSession();

                if (s.data.session) {
                    // Abortar anterior
                    if (_abortController) {
                        try { _abortController.abort(); } catch (e) {}
                    }
                    _abortController = new AbortController();

                    const timeout = setTimeout(function() {
                        try { _abortController.abort(); } catch (e) {}
                    }, TIMEOUT_MS);

                    // Historial local de la sesión
                    const historialEnvio = Array.isArray(historialLocal)
                        ? historialLocal.slice(-10).map(function(m) {
                            return { role: m.role, content: m.content };
                          })
                        : [];

                    const resp = await fetch('/api/ai/chat-pet', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'Authorization': 'Bearer ' + s.data.session.access_token
                        },
                        body: JSON.stringify({
                            message: texto.trim(),
                            history: historialEnvio,
                            page: window.location.pathname,
                            user_name: ctx.nombre
                        }),
                        signal: _abortController.signal
                    });

                    clearTimeout(timeout);

                    if (resp.ok) {
                        const data = await resp.json();
                        const reply = data && data.reply;
                        if (reply && typeof reply === 'string' && reply.trim().length > 0) {
                            return reply.trim();
                        }
                    } else {
                        console.warn('[Marquinhos/Brain] Backend respondió:', resp.status);
                    }
                }
            }
        } catch (e) {
            console.warn('[Marquinhos/Brain] Error backend:', e.message);
        }

        // 2. Fallback local
        const local = buscarRespuestaLocal(texto, ctx);
        if (local) return local;

        return 'No pude procesar eso ahora. Intenta de nuevo en unos segundos.';
    }

    window.MarquinhosBrain = {
        preguntar: preguntar
    };

    console.log('[Marquinhos/Brain] ✅ Cerebro v3.0 cargado (IA real + memoria)');
})();