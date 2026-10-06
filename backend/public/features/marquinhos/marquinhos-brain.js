// ================================================================
// MARQUINHOS · BRAIN v6.0
// contexto largo + reintento + sesión robusta + motivo visible
// + ✅ v6.0: MEMORIA POR USUARIO (RAG con pgvector)
// ================================================================
// 1. ANTES de responder: BUSCA recuerdos relevantes del usuario.
// 2. Inyecta los recuerdos como contexto al modelo.
// 3. DESPUÉS de responder: GUARDA la conversación como recuerdo.
// 4. Si la memoria falla, la conversación sigue funcionando normal.
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosBrain) return;

    const TIMEOUT_MS = 30000;
    const HISTORIAL_ENVIO = 20;
    const MEMORIA_LIMITE = 5;          // cuántos recuerdos inyectar
    const MEMORIA_UMBRAL = 0.65;       // qué tan similares deben ser
    const MEMORIA_MIN_LONGITUD = 10;   // mínimo de caracteres para guardar
    const EMBEDDINGS_ENDPOINT = '/api/ai/embeddings';

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

        if (typeof window.getSupabase === 'function') {
            try {
                const t = await tokenDesde(window.getSupabase());
                if (t) return { token: t };
                motivo = 'sin sesión';
            } catch (e) { motivo = 'getSupabase falló'; }
        } else {
            motivo = 'getSupabase no existe aquí';
        }

        const nombres = ['supabaseClient', 'supabase', '_supabase', 'sb'];
        for (let i = 0; i < nombres.length; i++) {
            const t = await tokenDesde(window[nombres[i]]);
            if (t) return { token: t };
        }

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
    // ✅ v6.0: EMBEDDINGS (texto → vector)
    // ============================================================
    async function generarEmbedding(texto, token) {
        if (!texto || !token) return null;
        try {
            const resp = await fetch(EMBEDDINGS_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ text: texto })
            });
            if (!resp.ok) {
                console.warn('[Marquinhos/Brain] Embedding falló:', resp.status);
                return null;
            }
            const data = await resp.json();
            return data.embedding || null;
        } catch (e) {
            console.warn('[Marquinhos/Brain] Error generando embedding:', e.message);
            return null;
        }
    }

    // ============================================================
    // ✅ v6.0: MEMORIA — Buscar recuerdos relevantes
    // ============================================================
    async function buscarRecuerdos(texto, token) {
        try {
            const embedding = await generarEmbedding(texto, token);
            if (!embedding) return [];

            const sb = window.getSupabase();
            if (!sb) {
                const sbClient = window.supabaseClient;
                if (!sbClient) return [];
                const { data, error } = await sbClient.rpc('buscar_memoria_marquinhos', {
                    p_embedding: embedding,
                    p_limite: MEMORIA_LIMITE,
                    p_umbral: MEMORIA_UMBRAL
                });
                if (error || !data) return [];
                return data;
            }

            const cliente = await sb;
            const { data, error } = await cliente.rpc('buscar_memoria_marquinhos', {
                p_embedding: embedding,
                p_limite: MEMORIA_LIMITE,
                p_umbral: MEMORIA_UMBRAL
            });

            if (error || !data) return [];
            return data;
        } catch (e) {
            console.warn('[Marquinhos/Brain] Error buscando recuerdos:', e.message);
            return [];
        }
    }

    // ============================================================
    // ✅ v6.0: MEMORIA — Guardar recuerdo (asíncrono, no bloquea)
    // ============================================================
    async function guardarRecuerdo(contenido, token, tipo, importancia) {
        try {
            if (!contenido || contenido.length < MEMORIA_MIN_LONGITUD) return;

            const embedding = await generarEmbedding(contenido, token);
            if (!embedding) return;

            let cliente = null;
            if (typeof window.getSupabase === 'function') {
                cliente = await window.getSupabase();
            } else if (window.supabaseClient) {
                cliente = window.supabaseClient;
            }

            if (!cliente) return;

            await cliente.rpc('guardar_memoria_marquinhos', {
                p_contenido: contenido,
                p_embedding: embedding,
                p_tipo: tipo || 'conversacion',
                p_importancia: importancia || 1
            });

            console.log('[Marquinhos/Brain] 💾 Recuerdo guardado');
        } catch (e) {
            console.warn('[Marquinhos/Brain] Error guardando recuerdo:', e.message);
        }
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
    // PREGUNTAR (con memoria)
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
        let contextoMemoria = '';

        try {
            const auth = await obtenerToken();

            if (!auth.token) {
                motivoFallo = auth.motivo;
                console.warn('[Marquinhos/Brain] Sin token:', auth.motivo);
            } else {
                const token = auth.token;

                // ✅ v6.0: 1. Buscar recuerdos relevantes
                const recuerdos = await buscarRecuerdos(limpio, token);
                if (recuerdos && recuerdos.length > 0) {
                    console.log('[Marquinhos/Brain] 🧠 Recuerdos encontrados:', recuerdos.length);
                    contextoMemoria = 'Recuerdos relevantes de este usuario:\n' +
                        recuerdos.map(function(r) { return '- ' + r.contenido; }).join('\n') +
                        '\n\nUsa estos recuerdos para personalizar tu respuesta si son relevantes.';
                }

                // 2. Llamar a chat-pet con memoria
                const payload1 = {
                    message: limpio,
                    history: historialEnvio,
                    page: window.location.pathname,
                    user_name: ctx.nombre,
                    memoria: contextoMemoria
                };

                let r1 = await llamarEndpoint('/api/ai/chat-pet', payload1, token);
                if (!r1.ok && (!r1.status || r1.status >= 500) && !r1.aborted) {
                    await esperar(600);
                    r1 = await llamarEndpoint('/api/ai/chat-pet', payload1, token);
                }
                if (r1.ok) {
                    // ✅ v6.0: 3. Guardar como recuerdo (asíncrono, no bloquea)
                    const recuerdo = 'Usuario preguntó: "' + limpio.slice(0, 200) +
                                     '" y Marquinhos respondió: "' + r1.reply.slice(0, 300) + '"';
                    guardarRecuerdo(recuerdo, token, 'conversacion', 1);

                    return r1.reply;
                }

                // 3. Respaldo /api/ai/chat
                const r2 = await llamarEndpoint('/api/ai/chat', {
                    message: limpio,
                    context: 'marquinhos_pet',
                    history: historialEnvio,
                    memoria: contextoMemoria
                }, token);
                if (r2.ok) {
                    const recuerdo = 'Usuario preguntó: "' + limpio.slice(0, 200) +
                                     '" y Marquinhos respondió: "' + r2.reply.slice(0, 300) + '"';
                    guardarRecuerdo(recuerdo, token, 'conversacion', 1);

                    return r2.reply;
                }

                motivoFallo = 'chat-pet: ' + describirFallo(r1) + ' | chat: ' + describirFallo(r2);
                console.warn('[Marquinhos/Brain] Ambos endpoints fallaron:', motivoFallo);
            }
        } catch (e) {
            motivoFallo = 'error: ' + e.message;
            console.warn('[Marquinhos/Brain] Error general:', e.message);
        }

        const local = buscarRespuestaLocal(limpio, ctx);
        if (local) return local;

        return 'No pude conectarme ahora (' + motivoFallo.slice(0, 120) + '). Intenta de nuevo.';
    }

    window.MarquinhosBrain = { preguntar: preguntar };
    console.log('[Marquinhos/Brain] ✅ v6.0 cargado con MEMORIA POR USUARIO');
})();