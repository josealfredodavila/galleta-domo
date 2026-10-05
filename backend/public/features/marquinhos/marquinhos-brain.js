// ================================================================
// MARQUINHOS · BRAIN v5.1
// contexto largo + reintento + sesión robusta + motivo visible
// ================================================================
// 1. POST /api/ai/chat-pet  (IA general con contexto) — 1 reintento
// 2. POST /api/ai/chat      (respaldo)
// 3. Fallback local solo si no hay red / servidor / sesión
// Si falla, el mensaje incluye el MOTIVO entre paréntesis para poder
// diagnosticar desde el celular sin consola.
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosBrain) return;

    const TIMEOUT_MS = 30000;
    const HISTORIAL_ENVIO = 20;

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

    // ============================================================
    // OBTENER TOKEN (varias vías)
    // ============================================================
    async function tokenDesde(cliente) {
        try {
            if (cliente && cliente.auth && typeof cliente.auth.getSession === 'function') {
                const s = await cliente.auth.getSession();
                if (s && s.data && s.data.session && s.data.session.access_token) {
                    return s.data.session.access_token;
                }
            }
        } catch (e) {}
        return null;
    }

    async function obtenerToken() {
        let motivo = '';

        // 1. window.getSupabase()
        if (typeof window.getSupabase === 'function') {
            try {
                const t = await tokenDesde(window.getSupabase());
                if (t) return { token: t };
                motivo = 'sin sesión';
            } catch (e) { motivo = 'getSupabase falló'; }
        } else {
            motivo = 'getSupabase no existe aquí';
        }

        // 2. Clientes globales comunes
        const nombres = ['supabaseClient', 'supabase', '_supabase', 'sb'];
        for (let i = 0; i < nombres.length; i++) {
            const t = await tokenDesde(window[nombres[i]]);
            if (t) return { token: t };
        }

        // 3. Sesión guardada por Supabase en localStorage
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && /^sb-.*-auth-token$/.test(k)) {
                    const j = JSON.parse(localStorage.getItem(k));
                    const t = (j && (j.access_token || (j.currentSession && j.currentSession.access_token)));
                    if (t) return { token: t };
                }
            }
        } catch (e) {}

        return { token: null, motivo: motivo || 'sin sesión' };
    }

    // ============================================================
    // LLAMAR A UN ENDPOINT
    // ============================================================
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
                let t = await resp.text().catch(function(){ return ''; });
                console.warn('[Marquinhos/Brain] Error:', t.slice(0, 300));
                let detalle = '';
                try { const j = JSON.parse(t); detalle = j.error || ''; } catch (e) {}
                return { ok: false, status: resp.status, error: detalle || t.slice(0, 120) };
            }

            const data = await resp.json();
            const reply = data && (data.reply || data.message || data.response);
            if (reply && typeof reply === 'string' && reply.trim()) {
                return { ok: true, reply: reply.trim() };
            }
            return { ok: false, status: resp.status, error: 'respuesta vacía' };
        } catch (e) {
            clearTimeout(timer);
            console.warn('[Marquinhos/Brain] Fetch falló:', e.name, e.message);
            return { ok: false, error: e.message, aborted: e.name === 'AbortError' };
        }
    }

    function esperar(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    function describirFallo(r) {
        if (!r) return 'sin datos';
        if (r.aborted) return 'tiempo agotado';
        if (r.status) return 'servidor ' + r.status + (r.error ? ': ' + String(r.error).slice(0, 80) : '');
        return 'sin red';
    }

    // ============================================================
    // PREGUNTAR
    // ============================================================
    async function preguntar(texto, historialLocal) {
        if (!texto || typeof texto !== 'string') return '';

        const userInfo = window.Marquinhos && window.Marquinhos.getUserInfo
            ? window.Marquinhos.getUserInfo() : null;
        const ctx = { nombre: userInfo ? userInfo.nombre : null };
        const limpio = texto.trim();

        // Historial SIN el mensaje actual
        let hist = Array.isArray(historialLocal) ? historialLocal.slice() : [];
        const ult = hist[hist.length - 1];
        if (ult && ult.role === 'user' && String(ult.content).trim() === limpio) hist.pop();
        const historialEnvio = hist.slice(-HISTORIAL_ENVIO).map(function(m) {
            return { role: m.role, content: String(m.content || '').slice(0, 2000) };
        });

        let motivoFallo = '';

        try {
            const auth = await obtenerToken();

            if (!auth.token) {
                motivoFallo = auth.motivo;
                console.warn('[Marquinhos/Brain] Sin token:', auth.motivo);
            } else {
                const token = auth.token;

                // 1. chat-pet (+1 reintento por red/5xx)
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

                // 2. respaldo /api/ai/chat
                const r2 = await llamarEndpoint('/api/ai/chat', {
                    message: limpio,
                    context: 'marquinhos_pet',
                    history: historialEnvio
                }, token);
                if (r2.ok) return r2.reply;

                motivoFallo = 'chat-pet: ' + describirFallo(r1) + ' | chat: ' + describirFallo(r2);
                console.warn('[Marquinhos/Brain] Ambos endpoints fallaron:', motivoFallo);
            }
        } catch (e) {
            motivoFallo = 'error: ' + e.message;
            console.warn('[Marquinhos/Brain] Error general:', e.message);
        }

        const local = buscarRespuestaLocal(limpio, ctx);
        if (local) return local;

        // Motivo corto, visible en la burbuja (útil para diagnosticar desde el celular)
        return 'No pude conectarme ahora (' + motivoFallo.slice(0, 120) + '). Intenta de nuevo.';
    }

    window.MarquinhosBrain = { preguntar: preguntar };
    console.log('[Marquinhos/Brain] ✅ v5.1 cargado');
})();
