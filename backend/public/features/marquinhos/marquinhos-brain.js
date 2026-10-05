// ================================================================
// MARQUINHOS · BRAIN v5.0 (contexto largo + reintento + fallback)
// ================================================================
// 1. POST /api/ai/chat-pet  (IA general con contexto)  — 1 reintento
// 2. POST /api/ai/chat      (respaldo)
// 3. Fallback local solo si no hay red / servidor
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosBrain) return;

    const TIMEOUT_MS = 30000;
    const HISTORIAL_ENVIO = 20; // mensajes de contexto enviados al servidor

    let _abort = null;

    const RESPUESTAS_LOCALES = [
        { keys: ['hola','buenas','hey','qué tal','que tal'],
          r: function(c){ return '¡Hola' + (c.nombre ? ' ' + c.nombre : '') + '! ¿En qué te ayudo?'; } },
        { keys: ['qué hora','que hora'],
          r: function(){ const n=new Date(); return 'Son las ' + n.getHours() + ':' + String(n.getMinutes()).padStart(2,'0') + '.'; } },
        { keys: ['qué día','que dia','qué fecha'],
          r: function(){ const d=['domingo','lunes','martes','miércoles','jueves','viernes','sábado']; return 'Hoy es ' + d[new Date().getDay()] + '.'; } },
        { keys: ['gracias'], r: function(){ return '¡De nada!'; } },
        { keys: ['muro'], r: function(){ return 'El Muro es un mercado P2P donde compras y vendes Es.stoks entre usuarios. Se cobra 3% de comisión.'; } },
        { keys: ['es.stok','es stok','esstok'], r: function(){ return 'Los Es.stoks son tokens del ecosistema. 12 Es.stoks equivalen a 1 NFT Domo.'; } },
        { keys: ['domo'], r: function(){ return 'Los Domos son productos físicos con un QR que se escanea para recibir Es.stoks.'; } },
        { keys: ['wallet','billetera'], r: function(){ return 'La Wallet se conecta desde Configuración, Wallet y Polygon.'; } }
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

    async function llamarEndpoint(url, payload, token) {
        try { if (_abort) _abort.abort(); } catch (e) {}
        const ctrl = new AbortController();
        _abort = ctrl;
        const timer = setTimeout(function() { try { ctrl.abort(); } catch (e) {} }, TIMEOUT_MS);

        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(payload),
                signal: ctrl.signal
            });
            clearTimeout(timer);
            console.log('[Marquinhos/Brain]', url, '→', resp.status);

            if (!resp.ok) {
                const t = await resp.text().catch(function(){ return ''; });
                console.warn('[Marquinhos/Brain] Error:', t.slice(0, 300));
                return { ok: false, status: resp.status, error: t };
            }

            const data = await resp.json();
            const reply = data && (data.reply || data.message || data.response);
            if (reply && typeof reply === 'string' && reply.trim()) {
                return { ok: true, reply: reply.trim() };
            }
            return { ok: false, status: resp.status, error: 'sin reply' };
        } catch (e) {
            clearTimeout(timer);
            console.warn('[Marquinhos/Brain] Fetch falló:', e.name, e.message);
            return { ok: false, error: e.message, aborted: e.name === 'AbortError' };
        }
    }

    function esperar(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    async function preguntar(texto, historialLocal) {
        if (!texto || typeof texto !== 'string') return '';

        const userInfo = window.Marquinhos && window.Marquinhos.getUserInfo
            ? window.Marquinhos.getUserInfo() : null;
        const ctx = { nombre: userInfo ? userInfo.nombre : null };
        const limpio = texto.trim();

        // Historial SIN el mensaje actual (el servidor lo agrega al final)
        let hist = Array.isArray(historialLocal) ? historialLocal.slice() : [];
        const ult = hist[hist.length - 1];
        if (ult && ult.role === 'user' && String(ult.content).trim() === limpio) hist.pop();
        const historialEnvio = hist.slice(-HISTORIAL_ENVIO).map(function(m) {
            return { role: m.role, content: String(m.content || '').slice(0, 2000) };
        });

        try {
            if (window.getSupabase) {
                const sb = window.getSupabase();
                const s = await sb.auth.getSession();

                if (s && s.data && s.data.session && s.data.session.access_token) {
                    const token = s.data.session.access_token;

                    // 1. chat-pet (con un reintento si falla por red/5xx)
                    const payload1 = {
                        message: limpio,
                        history: historialEnvio,
                        page: window.location.pathname,
                        user_name: ctx.nombre
                    };
                    let r1 = await llamarEndpoint('/api/ai/chat-pet', payload1, token);
                    if (!r1.ok && (!r1.status || r1.status >= 500) && !r1.aborted) {
                        await esperar(600);
                        r1 = await llamarEndpoint('/api/ai/chat-pet', payload1, token);
                    }
                    if (r1.ok) return r1.reply;

                    // 2. respaldo: /api/ai/chat
                    const r2 = await llamarEndpoint('/api/ai/chat', {
                        message: limpio,
                        context: 'marquinhos_pet',
                        history: historialEnvio
                    }, token);
                    if (r2.ok) return r2.reply;

                    console.warn('[Marquinhos/Brain] Ambos endpoints fallaron.');
                } else {
                    console.warn('[Marquinhos/Brain] No hay sesión activa.');
                }
            }
        } catch (e) {
            console.warn('[Marquinhos/Brain] Error general:', e.message);
        }

        const local = buscarRespuestaLocal(limpio, ctx);
        if (local) return local;
        return 'No pude conectarme ahora. Intenta de nuevo en unos segundos.';
    }

    window.MarquinhosBrain = { preguntar: preguntar };
    console.log('[Marquinhos/Brain] ✅ v5.0 cargado');
})();
