// ================================================================
// MARQUINHOS · BRAIN
// ================================================================
// Conecta el widget con la IA real (/api/ai/chat).
// Guarda la conversación en Supabase para memoria persistente.
// Fallback local si el backend falla.
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosBrain) return;

    const HISTORIAL_MAX = 20;
    const TIMEOUT_MS = 45000;

    let _abortController = null;
    let _historialCache = null;
    let _nombreUsuario = null;

    // ================================================================
    // CONOCIMIENTO LOCAL (fallback si el backend falla)
    // ================================================================
    const RESPUESTAS_LOCALES = [
        {
            keys: ['hola', 'buenas', 'hey', 'qué tal', 'que tal'],
            responder: function(ctx) {
                return '¡Hola' + (ctx.nombre ? ' ' + ctx.nombre : '') + '! ¿En qué te puedo ayudar hoy?';
            }
        },
        {
            keys: ['cómo estás', 'como estas', 'cómo te va'],
            responder: function() {
                return '¡Muy bien! Aquí estoy listo para ayudarte. ¿Y tú cómo estás?';
            }
        },
        {
            keys: ['quién eres', 'quien eres', 'qué eres', 'que eres', 'cómo te llamas'],
            responder: function() {
                return 'Soy Marquinhos, tu asistente personal en Sariel\'s. Estoy aquí para guiarte por el ecosistema.';
            }
        },
        {
            keys: ['qué hora', 'que hora', 'hora es'],
            responder: function() {
                const n = new Date();
                const h = n.getHours();
                const m = n.getMinutes().toString().padStart(2, '0');
                return 'Son las ' + h + ':' + m + '.';
            }
        },
        {
            keys: ['qué día', 'que dia', 'qué fecha'],
            responder: function() {
                const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
                const n = new Date();
                return 'Hoy es ' + dias[n.getDay()] + '.';
            }
        },
        {
            keys: ['gracias'],
            responder: function() {
                return '¡De nada! Es un placer.';
            }
        },
        {
            keys: ['adiós', 'adios', 'hasta luego', 'chao', 'nos vemos'],
            responder: function() {
                return '¡Hasta luego! Aquí estaré cuando me necesites.';
            }
        },
        {
            keys: ['ayuda', 'qué puedes hacer', 'que puedes hacer', 'para qué sirves'],
            responder: function() {
                return 'Puedo ayudarte a navegar el ecosistema: te explico el Muro, los Canales, el Live, tu Perfil, la Wallet, los Es.stoks, y más. ¿Qué quieres saber?';
            }
        },
        {
            keys: ['muro', 'publicación', 'publicar'],
            responder: function() {
                return 'El Muro es donde compartes publicaciones con la comunidad. Puedes escribir texto, subir fotos, usar hashtags y mencionar a otros usuarios.';
            }
        },
        {
            keys: ['canal', 'canales', 'grupo', 'grupos'],
            responder: function() {
                return 'Los Canales son públicos: solo el creador publica. Los Grupos son privados: todos los miembros publican. Puedes verlos desde la sección Canales.';
            }
        },
        {
            keys: ['live', 'transmisión', 'transmitir'],
            responder: function() {
                return 'En Live puedes transmitir video en vivo. Necesitas un Live Pass activo. Puedes transmitir tu cámara o compartir tu pantalla.';
            }
        },
        {
            keys: ['perfil'],
            responder: function() {
                return 'En tu Perfil puedes ver tus Es.stoks, tus NFTs, tu eSIM, tu conexión, y todas tus estadísticas. Es tu tarjeta de presentación en Sariel\'s.';
            }
        },
        {
            keys: ['wallet', 'billetera'],
            responder: function() {
                return 'Tu Wallet te permite gestionar tus criptomonedas en Polygon. Puedes recibir y enviar USDT, USDC y otros tokens.';
            }
        },
        {
            keys: ['es.stok', 'esstok', 'es stok', 'token'],
            responder: function() {
                return 'Los Es.stoks son los tokens de Sariel\'s. Con 12 Es.stoks puedes canjear 1 NFT Domo. Se ganan participando en el ecosistema.';
            }
        },
        {
            keys: ['domo', 'domos', 'nft'],
            responder: function() {
                return 'Los Domos son productos físicos que acumulan Es.stoks. Con 12 Es.stoks canjeas un NFT Domo. Son parte central de Sariel\'s.';
            }
        },
        {
            keys: ['mensaje', 'mensajes', 'chat'],
            responder: function() {
                return 'En Mensajes puedes hablar con otros usuarios, enviar fotos, videos, notas de voz, y hasta hacer videollamadas.';
            }
        }
    ];

    // ================================================================
    // BUSCAR RESPUESTA LOCAL
    // ================================================================
    function buscarRespuestaLocal(texto, contexto) {
        const lower = texto.toLowerCase().trim();

        for (let i = 0; i < RESPUESTAS_LOCALES.length; i++) {
            const r = RESPUESTAS_LOCALES[i];
            for (let j = 0; j < r.keys.length; j++) {
                if (lower.indexOf(r.keys[j]) !== -1) {
                    return r.responder(contexto);
                }
            }
        }

        return null;
    }

    // ================================================================
    // GUARDAR MENSAJE EN SUPABASE
    // ================================================================
    async function guardarMensaje(role, contenido) {
        try {
            if (!window.getSupabase) return;
            const sb = window.getSupabase();
            if (!sb || !sb.auth) return;
            const r = await sb.auth.getSession();
            if (!r.data.session) return;

            const uid = r.data.session.user.id;
            await sb.from('marquinhos_conversaciones').insert({
                usuario_id: uid,
                rol: role,
                contenido: contenido,
                contexto_pagina: window.location.pathname
            });
        } catch (e) {
            // Silencioso
        }
    }

    // ================================================================
    // CARGAR HISTORIAL DE SUPABASE
    // ================================================================
    async function cargarHistorial() {
        if (_historialCache) return _historialCache;
        try {
            if (!window.getSupabase) return [];
            const sb = window.getSupabase();
            if (!sb || !sb.auth) return [];
            const r = await sb.auth.getSession();
            if (!r.data.session) return [];

            const uid = r.data.session.user.id;
            const { data } = await sb.from('marquinhos_conversaciones')
                .select('rol, contenido, created_at')
                .eq('usuario_id', uid)
                .order('created_at', { ascending: false })
                .limit(HISTORIAL_MAX);

            if (!data) return [];
            _historialCache = data.reverse().map(function(m) {
                return {
                    role: m.rol === 'user' ? 'user' : 'assistant',
                    content: m.contenido
                };
            });
            return _historialCache;
        } catch (e) {
            return [];
        }
    }

    // ================================================================
    // PREGUNTAR A LA IA
    // ================================================================
    async function preguntar(texto, historialLocal) {
        if (!texto || typeof texto !== 'string') return '';

        // Contexto local
        const userInfo = window.Marquinhos && window.Marquinhos.getUserInfo ? window.Marquinhos.getUserInfo() : null;
        const contexto = {
            nombre: userInfo ? userInfo.nombre : null,
            pagina: window.location.pathname
        };

        // 1. Intentar con el backend
        try {
            if (window.getSupabase) {
                const sb = window.getSupabase();
                const s = await sb.auth.getSession();

                if (s.data.session) {
                    // Historial desde Supabase + local
                    let historial = [];
                    try {
                        historial = await cargarHistorial();
                    } catch (e) {}

                    // Añadir mensajes recientes del local
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
                            context: 'chat_sariels',
                            history: historial,
                            page: contexto.pagina
                        }),
                        signal: _abortController.signal
                    });

                    clearTimeout(timeout);

                    if (resp.ok) {
                        const data = await resp.json();
                        const reply = data && (data.reply || data.message || data.response);
                        if (reply && typeof reply === 'string' && reply.trim().length > 0) {
                            // Guardar en Supabase
                            await guardarMensaje('user', texto);
                            await guardarMensaje('assistant', reply);
                            // Limpiar caché para próxima
                            _historialCache = null;
                            return reply.trim();
                        }
                    }
                }
            }
        } catch (e) {
            // Silencioso — cae al fallback
        }

        // 2. Fallback: respuesta local
        const respuestaLocal = buscarRespuestaLocal(texto, contexto);
        if (respuestaLocal) return respuestaLocal;

        // 3. Fallback final: mensaje útil
        return 'No entendí bien. Puedes preguntarme sobre el Muro, Canales, Live, tu Perfil, Wallet, Es.stoks, Domos, o Mensajes.';
    }

    // ================================================================
    // API PÚBLICA
    // ================================================================
    window.MarquinhosBrain = {
        preguntar: preguntar,
        limpiarHistorial: function() {
            _historialCache = null;
        },
        getHistorialCache: function() {
            return _historialCache;
        }
    };

    console.log('[Marquinhos/Brain] ✅ Cerebro cargado');
})();