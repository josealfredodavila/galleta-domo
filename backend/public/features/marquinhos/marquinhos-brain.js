// ================================================================
// MARQUINHOS · BRAIN v6.1
// Memoria por usuario (RAG) + filtro inteligente de recuerdos
// ================================================================
// Sistema de memoria:
//   1. ANTES de responder: BUSCA recuerdos relevantes del usuario.
//   2. Inyecta los recuerdos como contexto al modelo.
//   3. DESPUÉS de responder: GUARDA solo el mensaje del usuario
//      (con filtro de frases útiles para evitar basura).
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosBrain) return;

    const TIMEOUT_MS = 30000;
    const HISTORIAL_ENVIO = 20;
    const MEMORIA_LIMITE = 5;
    const MEMORIA_UMBRAL = 0.55;       // ✅ v6.1: bajado de 0.65 a 0.55
    const MEMORIA_MIN_LONGITUD = 8;
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
    // ✅ v6.1: FILTRO INTELIGENTE DE FRASES ÚTILES
    // ============================================================
    function esFraseUtil(texto) {
        if (!texto || typeof texto !== 'string') return false;

        const t = texto.toLowerCase().trim();

        // Mínimo de longitud
        if (t.length < MEMORIA_MIN_LONGITUD) return false;

        // Ignorar saludos y frases de cortesía cortas
        const saludos = /^(hola|buenas|hey|qué tal|que tal|estás|estas|cómo estás|como estas|gracias|adiós|adios|hasta luego|ok|vale|sí|no)\b/i;
        if (saludos.test(t) && t.length < 25) return false;

        // Ignorar preguntas vacías o genéricas
        const preguntasVacias = /^(quién eres|quién soy|qué haces|qué puedes hacer|ayuda|ayúdame|qué hora|qué día|qué fecha)\b/i;
        if (preguntasVacias.test(t)) return false;

        // ✅ Guardar si contiene información personal o datos del usuario
        const palabrasClave = [
            'mi ', 'me ', 'yo ', 'soy ', 'tengo ', 'estoy ', 'vivo ',
            'trabajo ', 'estudio ', 'prefiero ', 'me gusta ', 'me encanta ',
            'odio ', 'detesto ', 'quiero ', 'necesito ', 'favorito',
            'favorita', 'cumpleaños', 'familia', 'esposa', 'esposo',
            'hijo', 'hija', 'mascota', 'perro', 'gato', 'cocina',
            'juego', 'deporte', 'música', 'musica', 'película', 'pelicula',
            'libro', 'color', 'comida', 'bebida', 'ciudad', 'país', 'pais',
            'trabajo en', 'vivo en', 'estudio en', 'recuerda', 'recuérdame',
            'guarda', 'anota', 'memoriza', 'llamo', 'nombre es', 'edad'
        ];

        for (let i = 0; i < palabrasClave.length; i++) {
            if (t.indexOf(palabrasClave[i]) !== -1) return true;
        }

        // Frases largas (>30 chars) probablemente contienen info útil
        if (t.length > 30) return true;

        return false;
    }

    // ============================================================
    // OBTENER TOKEN
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
    // ✅ v6.1: OBTENER CLIENTE SUPABASE (helper unificado)
    // ============================================================
    async function obtenerClienteSupabase() {
        try {
            if (typeof window.getSupabase === 'function') {
                return await window.getSupabase();
            }
            if (window.supabaseClient) {
                return window.supabaseClient;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    // ============================================================
    // ✅ v6.1: EMBEDDINGS
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
    // ✅ v6.1: BUSCAR RECUERDOS
    // ============================================================
    async function buscarRecuerdos(texto, token) {
        try {
            const embedding = await generarEmbedding(texto, token);
            if (!embedding) return [];

            const cliente = await obtenerClienteSupabase();
            if (!cliente) return [];

            const { data, error } = await cliente.rpc('buscar_memoria_marquinhos', {
                p_embedding: embedding,
                p_limite: MEMORIA_LIMITE,
                p_umbral: MEMORIA_UMBRAL
            });

            if (error) {
                console.warn('[Marquinhos/Brain] Error RPC buscar:', error.message);
                return [];
            }

            console.log('[Marquinhos/Brain] 🧠 Recuerdos encontrados:', data ? data.length : 0);
            return data || [];
        } catch (e) {
            console.warn('[Marquinhos/Brain] Error buscando recuerdos:', e.message);
            return [];
        }
    }

    // ============================================================
    // ✅ v6.1: GUARDAR RECUERDO (solo mensaje del usuario, filtrado)
    // ============================================================
    async function guardarRecuerdo(mensajeUsuario, token) {
        try {
            // Filtro: solo guardar frases útiles
            if (!esFraseUtil(mensajeUsuario)) {
                return;
            }

            const contenidoLimpio = mensajeUsuario.trim().slice(0, 500);
            const embedding = await generarEmbedding(contenidoLimpio, token);
            if (!embedding) return;

            const cliente = await obtenerClienteSupabase();
            if (!cliente) return;

            const { error } = await cliente.rpc('guardar_memoria_marquinhos', {
                p_contenido: contenidoLimpio,
                p_embedding: embedding,
                p_tipo: 'dato_usuario',
                p_importancia: 2
            });

            if (error) {
                console.warn('[Marquinhos/Brain] Error guardando:', error.message);
                return;
            }

            console.log('[Marquinhos/Brain] 💾 Recuerdo guardado:', contenidoLimpio.slice(0, 60));
        } catch (e) {
            console.warn('[Marquinhos/Brain] Error guardando recuerdo:', e.message);
        }
    }

    // ============================================================
    // LLAMAR ENDPOINT
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

            if (!resp.ok) {
                let t = await resp.text().catch(function(){ return ''; });
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

        // Historial sin el mensaje actual
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

                // ✅ v6.1: Buscar recuerdos
                const recuerdos = await buscarRecuerdos(limpio, token);
                if (recuerdos && recuerdos.length > 0) {
                    contextoMemoria = 'Datos que recuerdas de este usuario (úsalos con naturalidad si son relevantes):\n' +
                        recuerdos.map(function(r) { return '- ' + r.contenido; }).join('\n');
                }

                // ✅ v6.1: Guardar el mensaje del usuario (asíncrono)
                guardarRecuerdo(limpio, token);

                // Llamar a chat-pet con memoria
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
                if (r1.ok) return r1.reply;

                // Respaldo
                const r2 = await llamarEndpoint('/api/ai/chat', {
                    message: limpio,
                    context: 'marquinhos_pet',
                    history: historialEnvio,
                    memoria: contextoMemoria
                }, token);
                if (r2.ok) return r2.reply;

                motivoFallo = 'chat-pet: ' + describirFallo(r1) + ' | chat: ' + describirFallo(r2);
            }
        } catch (e) {
            motivoFallo = 'error: ' + e.message;
        }

        const local = buscarRespuestaLocal(limpio, ctx);
        if (local) return local;

        return 'No pude conectarme ahora (' + motivoFallo.slice(0, 120) + '). Intenta de nuevo.';
    }

    window.MarquinhosBrain = { preguntar: preguntar };
    console.log('[Marquinhos/Brain] ✅ v6.1 cargado (memoria con filtro inteligente)');
})();