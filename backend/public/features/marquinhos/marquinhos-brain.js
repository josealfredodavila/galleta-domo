// ================================================================
// MARQUINHOS · BRAIN v7.1
// Memoria por usuario (RAG) + filtro de recuerdos + respuestas locales
// + SOPORTE DE MÚSICA (Deezer)
// ================================================================

'use strict';

(function () {
    if (window.MarquinhosBrain) return;

    const VERSION = '7.1';
    const TIMEOUT_MS = 30000;
    const HISTORIAL_ENVIO = 20;
    const HISTORIAL_CHARS = 2000;
    const MEMORIA_LIMITE = 5;
    const MEMORIA_UMBRAL = 0.6;
    const MEMORIA_MIN_LONGITUD = 8;
    const MEMORIA_MAX_LONGITUD = 500;
    const EMBEDDINGS_ENDPOINT = '/api/ai/embeddings';
    const CHAT_PET_ENDPOINT = '/api/ai/chat-pet';
    const CHAT_ENDPOINT = '/api/ai/chat';
    const CONTEXTO_PET = 'marquinhos_pet';

    // ============================================================
    // UTILIDADES DE TEXTO
    // ============================================================
    function normalizar(t) {
        return String(t || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function paraCoincidencia(t) {
        return ' ' + normalizar(t).replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    }

    // ============================================================
    // RESPUESTAS LOCALES (fallback sin red)
    // ============================================================
    const RESPUESTAS_LOCALES = [
        { keys: ['es.stok', 'es.stoks', 'es stok', 'es stoks', 'estok', 'estoks', 'stoks'],
          r: function () {
              return 'Los Es.stoks son el token interno de Sariel\'s. Se obtienen escaneando el QR de cada Domo, ' +
                     'se pueden acumular, canjear por un NFT (12 Es.stoks = 1 NFT) o vender en El Muro.';
          } },

        { keys: ['domo', 'domos'],
          r: function () {
              return 'Un Domo es un producto físico de galleta de Sariel\'s con un QR. Al escanearlo desde la app, ' +
                     'se acredita 1 Es.stok en tu wallet. Los Es.stoks no existen sin una compra real de Domo.';
          } },

        { keys: ['nft', 'nfts'],
          r: function () {
              return 'Con 12 Es.stoks puedes canjear un NFT Domo. Tienes 30 días para cambiarlo por un Domo físico; ' +
                     'si no lo cambias, queda como NFT conmemorativo. Mientras esté activo no se puede vender ni transferir.';
          } },

        { keys: ['muro', 'el muro', 'p2p', 'mercado'],
          r: function () {
              return 'El Muro es el mercado P2P de Sariel\'s: los usuarios compran y venden Es.stoks entre ellos. ' +
                     'Por cada venta se cobra una comisión del 3%.';
          } },

        { keys: ['wallet', 'billetera', 'metamask', 'walletconnect', 'polygon'],
          r: function () {
              return 'La wallet se conecta desde la sección Wallet con MetaMask o WalletConnect, en la red Polygon.';
          } },

        { keys: ['live pass', 'livepass', 'membresia live', 'membresía live'],
          r: function () {
              return 'El Live Pass es la membresía de Sariel\'s Live, con planes Básico y Pro. Se paga con criptomonedas.';
          } },

        { keys: ['live', 'en vivo', 'transmitir', 'transmision', 'transmisiones', 'donacion', 'donaciones'],
          r: function () {
              return 'Sariel\'s Live es el módulo de transmisiones en vivo: puedes transmitir, ver a otros usuarios ' +
                     'y recibir donaciones. Algunas transmisiones son de pago.';
          } },

        { keys: ['plan', 'planes', 'premium', 'suscripcion', 'suscripciones', 'basico'],
          r: function () {
              return 'Marquinhos tiene estos planes: Gratis (el primer mes incluye búsqueda web), Básico $99 MXN, ' +
                     'Pro $250 MXN y Premium $850 MXN.';
          } },

        { keys: ['pagar', 'pago', 'pagos', 'spei', 'usdt', 'usdc', 'cripto', 'criptomoneda', 'tarjeta'],
          r: function () {
              return 'Según la opción de cada pantalla, puedes pagar con tarjeta, SPEI (en México) o criptomonedas (USDT/USDC).';
          } },

        { keys: ['internet', 'esim', 'datos moviles', 'paquete de datos', 'paquetes de datos'],
          r: function () {
              return 'El módulo Internet vende paquetes de datos móviles por eSIM, con cobertura declarada en Puebla, CDMX y Edomex.';
          } },

        { keys: ['quien eres', 'como te llamas', 'que puedes hacer', 'que haces', 'ayuda', 'ayudame'],
          r: function () {
              return 'Soy Marquinhos, el asistente de Sariel\'s. Puedo platicar contigo y darte pistas sobre ' +
                     'Es.stoks, Domos, El Muro, Wallet, Live e Internet.';
          } },

        { keys: ['sariels', 'sariel s', 'ecosistema'],
          r: function () {
              return 'Sariel\'s es un ecosistema con Domos de galleta, Es.stoks, El Muro, Wallet, Sariel\'s Live, ' +
                     'Internet (eSIM) y mensajería.';
          } },

        { keys: ['que hora', 'hora es', 'hora actual'],
          r: function () {
              const n = new Date();
              return 'Son las ' + n.getHours() + ':' + String(n.getMinutes()).padStart(2, '0') + '.';
          } },

        { keys: ['que dia', 'que fecha', 'dia es', 'fecha es'],
          r: function () {
              const d = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
              return 'Hoy es ' + d[new Date().getDay()] + '.';
          } },

        { keys: ['gracias', 'muchas gracias'],
          r: function () { return '¡De nada! Aquí estoy si necesitas algo más.'; } },

        { keys: ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'que tal'],
          r: function (c) { return '¡Hola' + (c && c.nombre ? ' ' + c.nombre : '') + '! ¿En qué te ayudo?'; } }
    ];

    const RESPUESTAS_COMPILADAS = RESPUESTAS_LOCALES.map(function (item) {
        return {
            keys: item.keys.map(function (k) { return ' ' + normalizar(k) + ' '; }),
            r: item.r
        };
    });

    function buscarRespuestaLocal(texto, ctx) {
        const t = paraCoincidencia(texto);
        for (let i = 0; i < RESPUESTAS_COMPILADAS.length; i++) {
            const item = RESPUESTAS_COMPILADAS[i];
            for (let j = 0; j < item.keys.length; j++) {
                if (t.indexOf(item.keys[j]) !== -1) return item.r(ctx);
            }
        }
        return null;
    }

    // ============================================================
    // FILTRO DE RECUERDOS
    // ============================================================
    const RE_COMANDO = /^(dime|dame|explica|explicame|muestrame|busca|resume|traduce|escribe|genera|crea|haz|calcula|cuanto|como|que|quien|cuando|donde|cual|por que|ayuda|ayudame)\b/;
    const RE_SALUDO_CORTO = /^(hola|buenas|hey|que tal|gracias|adios|hasta luego|ok|vale|si|no)\b/;
    const RE_PERSONAL = /\b(me llamo|mi nombre es|soy |tengo |vivo |trabajo |estudio |prefiero |me gusta |me encanta |odio |detesto |mi favorit[oa]|mi cumpleanos|mi edad|mi (esposa|esposo|novia|novio|hijo|hija|mama|papa|perro|gato|mascota|familia|ciudad|empresa|negocio|tienda)|recuerda|recuerdame|guarda|anota|memoriza)/;
    const RE_SENSIBLE = [
        /[\w.+-]+@[\w-]+\.[\w.-]+/,
        /(?:\d[\s-]?){10,}/,
        /\b(contrasena|password|pass|clave|pin|cvv|cuenta bancaria|clabe|tarjeta)\b/,
        /(api[ _-]?key|secreto|semilla|seed phrase|frase semilla|llave privada|private key)/,
        /(suicid|matarme|quitarme la vida|hacerme dano|autolesi|no quiero vivir)/,
        /\b(diagnosticad|diabetes|cancer|embarazad|depresion|ansiedad)\b/
    ];

    function esFraseUtil(texto) {
        if (!texto || typeof texto !== 'string') return false;
        const original = texto.trim();
        const t = normalizar(original);
        if (t.length < MEMORIA_MIN_LONGITUD) return false;
        if (/[¿?]/.test(original)) return false;
        if (RE_COMANDO.test(t)) return false;
        if (RE_SALUDO_CORTO.test(t) && t.length < 25) return false;
        if (RE_SENSIBLE.some(function (re) { return re.test(t); })) return false;
        return RE_PERSONAL.test(t);
    }

    // ============================================================
    // AUTENTICACIÓN Y CLIENTE SUPABASE
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
                const t = await tokenDesde(await window.getSupabase());
                if (t) return { token: t };
                motivo = 'sin sesión';
            } catch (e) {
                motivo = 'getSupabase falló';
            }
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
                    const t = j && (j.access_token || (j.currentSession && j.currentSession.access_token));
                    if (t) return { token: t };
                }
            }
        } catch (e) {}

        return { token: null, motivo: motivo || 'sin sesión' };
    }

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
    // EMBEDDINGS Y RPC (RAG)
    // ============================================================
    function embeddingValido(v) {
        return Array.isArray(v) && v.length > 0 && v.every(function (n) {
            return typeof n === 'number' && isFinite(n);
        });
    }

    async function generarEmbedding(texto, token) {
        if (!texto || !token) return null;
        try {
            const resp = await fetch(EMBEDDINGS_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ text: texto.slice(0, MEMORIA_MAX_LONGITUD) })
            });
            if (!resp.ok) {
                console.warn('[Marquinhos/Brain] Embedding falló:', resp.status);
                return null;
            }
            const data = await resp.json();
            const emb = data && data.embedding;
            return embeddingValido(emb) ? emb : null;
        } catch (e) {
            console.warn('[Marquinhos/Brain] Error generando embedding:', e.message);
            return null;
        }
    }

    async function buscarRecuerdos(embedding) {
        if (!embedding) return [];
        try {
            const cliente = await obtenerClienteSupabase();
            if (!cliente || typeof cliente.rpc !== 'function') return [];

            const { data, error } = await cliente.rpc('buscar_memoria_marquinhos', {
                p_embedding: embedding,
                p_limite: MEMORIA_LIMITE,
                p_umbral: MEMORIA_UMBRAL
            });

            if (error) {
                console.warn('[Marquinhos/Brain] Error RPC buscar:', error.message);
                return [];
            }

            const lista = Array.isArray(data) ? data.filter(function (r) {
                return r && typeof r.contenido === 'string' && r.contenido.trim() !== '';
            }) : [];

            console.log('[Marquinhos/Brain] 🧠 Recuerdos encontrados:', lista.length);
            return lista;
        } catch (e) {
            console.warn('[Marquinhos/Brain] Error buscando recuerdos:', e.message);
            return [];
        }
    }

    async function guardarRecuerdo(mensajeUsuario, embedding) {
        try {
            if (!embedding || !esFraseUtil(mensajeUsuario)) return;

            const contenidoLimpio = mensajeUsuario.trim().slice(0, MEMORIA_MAX_LONGITUD);
            const cliente = await obtenerClienteSupabase();
            if (!cliente || typeof cliente.rpc !== 'function') return;

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
    // ENDPOINTS DE CHAT
    // ============================================================
    async function llamarEndpoint(url, payload, token) {
        const ctrl = new AbortController();
        const timer = setTimeout(function () {
            try { ctrl.abort(); } catch (e) {}
        }, TIMEOUT_MS);

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

            if (!resp.ok) {
                const t = await resp.text().catch(function () { return ''; });
                let detalle = '';
                try {
                    const j = JSON.parse(t);
                    detalle = (j && j.error) ? String(j.error) : '';
                } catch (e) {}
                return { ok: false, status: resp.status, error: detalle || t.slice(0, 120) };
            }

            const data = await resp.json();
            
            // NUEVO: Capturamos el reply y si hay música
            const reply = data && (data.reply || data.message || data.response);
            const musica = data && data.musica ? data.musica : null;

            if (reply && typeof reply === 'string' && reply.trim()) {
                return { ok: true, reply: reply.trim(), musica: musica };
            }
            return { ok: false, status: resp.status, error: 'respuesta vacía' };
        } catch (e) {
            return { ok: false, error: e.message, aborted: e.name === 'AbortError' };
        } finally {
            clearTimeout(timer);
        }
    }

    function esperar(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    function describirFallo(r) {
        if (!r) return 'sin datos';
        if (r.aborted) return 'tiempo agotado';
        if (r.status) return 'servidor ' + r.status + (r.error ? ': ' + String(r.error).slice(0, 80) : '');
        return 'sin red' + (r.error ? ' (' + String(r.error).slice(0, 60) + ')' : '');
    }

    function construirHistorial(historialLocal, mensajeActual) {
        let hist = Array.isArray(historialLocal) ? historialLocal.slice() : [];
        const ult = hist[hist.length - 1];
        if (ult && ult.role === 'user' && String(ult.content || '').trim() === mensajeActual) {
            hist.pop();
        }
        return hist
            .filter(function (m) {
                return m && (m.role === 'user' || m.role === 'assistant') && m.content != null;
            })
            .slice(-HISTORIAL_ENVIO)
            .map(function (m) {
                return { role: m.role, content: String(m.content).slice(0, HISTORIAL_CHARS) };
            })
            .filter(function (m) { return m.content.trim() !== ''; });
    }

    // ============================================================
    // PREGUNTAR
    // ============================================================
    async function preguntar(texto, historialLocal, modo) {
        if (!texto || typeof texto !== 'string') return '';
        const limpio = texto.trim();
        if (!limpio) return '';

        const userInfo = window.Marquinhos && window.Marquinhos.getUserInfo
            ? window.Marquinhos.getUserInfo() : null;
        const ctx = { nombre: userInfo ? userInfo.nombre : null };

        const modoEnvio = (modo === 'texto') ? 'texto' : 'voz';
        const historialEnvio = construirHistorial(historialLocal, limpio);

        let motivoFallo = '';
        let contextoMemoria = '';

        try {
            const auth = await obtenerToken();

            if (!auth.token) {
                motivoFallo = auth.motivo || 'sin sesión';
                console.warn('[Marquinhos/Brain] Sin token:', motivoFallo);
            } else {
                const token = auth.token;

                const embedding = await generarEmbedding(limpio, token);
                const recuerdos = await buscarRecuerdos(embedding);

                if (recuerdos.length > 0) {
                    contextoMemoria =
                        'Datos que recuerdas de este usuario (úsalos con naturalidad si son relevantes):\n' +
                        recuerdos.map(function (r) { return '- ' + r.contenido; }).join('\n');
                }

                guardarRecuerdo(limpio, embedding);

                const payload1 = {
                    message: limpio,
                    history: historialEnvio,
                    page: window.location.pathname,
                    user_name: ctx.nombre,
                    memoria: contextoMemoria,
                    modo: modoEnvio
                };

                let r1 = await llamarEndpoint(CHAT_PET_ENDPOINT, payload1, token);
                if (!r1.ok && (!r1.status || r1.status >= 500) && !r1.aborted) {
                    await esperar(600);
                    r1 = await llamarEndpoint(CHAT_PET_ENDPOINT, payload1, token);
                }
                
                // Si la respuesta es exitosa, devolvemos el objeto completo (reply + musica)
                if (r1.ok) {
                    // NUEVO: Si hay música, disparamos un evento para que el reproductor visual la capture
                    if (r1.musica) {
                        window.dispatchEvent(new CustomEvent('marquinhos-musica', { detail: r1.musica }));
                    }
                    return r1.reply;
                }

                const r2 = await llamarEndpoint(CHAT_ENDPOINT, {
                    message: limpio,
                    context: CONTEXTO_PET,
                    history: historialEnvio,
                    memoria: contextoMemoria,
                    modo: modoEnvio
                }, token);
                
                if (r2.ok) {
                    if (r2.musica) {
                        window.dispatchEvent(new CustomEvent('marquinhos-musica', { detail: r2.musica }));
                    }
                    return r2.reply;
                }

                motivoFallo = 'chat-pet: ' + describirFallo(r1) + ' | chat: ' + describirFallo(r2);
            }
        } catch (e) {
            motivoFallo = 'error: ' + e.message;
        }

        const local = buscarRespuestaLocal(limpio, ctx);
        if (local) return local;

        return 'No pude conectarme ahora (' + motivoFallo.slice(0, 120) + '). Intenta de nuevo.';
    }

    window.MarquinhosBrain = {
        version: VERSION,
        preguntar: preguntar
    };
    console.log('[Marquinhos/Brain] ✅ v' + VERSION + ' cargado (memoria RAG + música)');
})();