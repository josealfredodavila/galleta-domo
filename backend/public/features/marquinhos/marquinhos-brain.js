// ================================================================
// MARQUINHOS · BRAIN v7.5
// Memoria por usuario (RAG) + filtro de recuerdos + respuestas locales
// + MÚSICA (Deezer: enlace de canción, sin audio)
// + EVENTOS (Ticketmaster Discovery: solo lectura, enlace oficial)
//
// v7.5 — Conocimiento del ecosistema verificado contra Supabase
//        (planes, precios, NFT, Es.stoks, Muro, Mercado, Live, IA).
//        Precios y plazos corregidos. Se envía al backend en el
//        campo "conocimiento" para que Marquinhos responda con datos.
//        Estilo natural: sin saludos repetidos ni tono forzado.
//        Se limpia el "Hola de nuevo" si el backend lo devuelve.
// ================================================================

'use strict';

(function () {
    if (window.MarquinhosBrain) return;

    const VERSION = '7.5';
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
    // CONOCIMIENTO DEL ECOSISTEMA (solo información pública)
    // Fuente: base de datos Csariels ecosistema (verificada).
    // Los precios pueden cambiar: si el backend trae valores
    // actualizados, esos tienen prioridad.
    // ============================================================
    const CONOCIMIENTO_ECOSISTEMA = {
        nombre: 'Sariel\'s',
        resumen: 'Sariel\'s es un ecosistema con red social, mensajería, llamadas, ' +
                 'Muro con Es.stoks, Mercado de tiendas, Live, Internet por eSIM, noticias, ' +
                 'videos y canales, y la mascota Marquinhos.',

        modulos: {
            muro: 'El Muro es la parte social: publicaciones, historias de 24 horas, tendencias y ' +
                  'la compra y venta de Es.stoks entre usuarios.',
            mensajes: 'Mensajes y llamadas entre contactos. Puedes configurar quién te puede ' +
                      'escribir o llamar, y las solicitudes de mensaje se aceptan o rechazan.',
            contactos: 'Agregas personas con una solicitud de amistad. Puedes buscarlas por nombre o @usuario. ' +
                       'Por email o teléfono solo aparecen si la persona lo permite.',
            live: 'Sariel\'s Live es para transmitir en vivo. Para transmitir necesitas Live Pass.',
            internet: 'Internet vende paquetes de datos móviles por eSIM.',
            videos: 'Videos y canales agrupados por categorías.',
            mercado: 'Mercado es para tiendas: publicar productos, recibir pedidos y repartidores.',
            noticias: 'Sección de noticias del ecosistema.',
            marquinhos: 'Marquinhos es el asistente IA. Puedes personalizarlo con accesorios de la tienda.'
        },

        esToks: {
            que_es: 'Los Es.stoks son el token interno de Sariel\'s.',
            como_se_obtienen: 'Se obtienen reclamando el código QR de un producto Domo (galleta física de Sariel\'s).',
            para_que_sirven: 'Se pueden vender en El Muro a otros usuarios, o canjear por un NFT.',
            precio_referencia: 'El precio de referencia del Muro cambia con la oferta y la demanda. ' +
                               'Al momento de la última actualización era de $6.20 MXN por Es.stok.'
        },

        nft: {
            nombre: 'NFT de Sariel\'s',
            costo: '12 Es.stoks por NFT.',
            vigencia: 'El NFT tiene vigencia de 30 días desde el canje. Durante ese plazo se puede canjear por un Domo físico. Al vencer queda como conmemorativo: ya no se puede canjear por un Domo, pero sí regalar o transferir.',
            como: 'Se canjea desde la sección de NFT cuando tienes 12 Es.stoks disponibles. Puedes canjear varios si tienes Es.stoks suficientes.'
        },

        planes_ia_marquinhos: [
            { nombre: 'Gratis', precio: '$0 MXN', detalle: 'Acceso a Marquinhos. Sin búsqueda web.' },
            { nombre: 'Prueba gratis (primer mes)', precio: '$0 MXN', detalle: 'Acceso a Marquinhos con 10 búsquedas web.' },
            { nombre: 'Básico', precio: '$300 MXN al mes', detalle: 'Marquinhos, 100 mensajes al mes y 10 búsquedas web.' },
            { nombre: 'Pro', precio: '$500 MXN al mes', detalle: 'Marquinhos, Maíz e Itlasuhua, 500 mensajes, 100 búsquedas web y 10 de búsqueda avanzada.' },
            { nombre: 'Premium', precio: '$850 MXN al mes', detalle: 'Marquinhos, Maíz e Itlasuhua con mensajes sin límite, 500 búsquedas web y 100 de búsqueda avanzada.' }
        ],

        planes_almacenamiento: [
            { nombre: 'Gratis', precio: '$0', detalle: '1 GB de almacenamiento y conservación de contenido por 90 días.' },
            { nombre: 'Pro', precio: '$300 MXN al mes', detalle: '5 GB y conservación ampliada mientras la membresía esté activa.' }
        ],

        live_pass: [
            { nombre: 'Live Básico', precio: '$300 MXN al mes', detalle: '2 horas al día para transmitir en vivo.' },
            { nombre: 'Live Pro', precio: '$600 MXN al mes', detalle: '5 horas al día para transmitir en vivo.' }
        ],

        mercado_tiendas: [
            { nombre: 'Básico', precio: '$300 MXN al mes', detalle: 'Hasta 10 productos y 20 pedidos al mes.' },
            { nombre: 'Pro', precio: '$400 MXN al mes', detalle: 'Hasta 50 productos y 100 pedidos al mes. Destacado.' },
            { nombre: 'Max', precio: '$500 MXN al mes', detalle: 'Hasta 500 productos, pedidos ilimitados, video y insignia verificada.' }
        ],

        pagos: 'Los pagos se hacen con tarjeta, SPEI o criptomonedas, según lo que muestre cada pantalla. ' +
               'Las membresías de Live Pass se pagan con criptomonedas.',

        reglas_generales: [
            'La edad mínima para usar Sariel\'s es de 13 años.',
            'Tu memoria con Marquinhos es privada: cada usuario tiene la suya.',
            'Para problemas con la cuenta o un pago, el usuario debe usar la sección de ayuda o soporte de la app.'
        ]
    };

    // Reglas de estilo que el backend debe seguir al responder
    const ESTILO_RESPUESTA = {
        idioma: 'español de México, natural y cercano',
        longitud: 'breve: 1 a 3 frases salvo que el usuario pida detalle',
        saludos: 'No repitas saludos. Si el usuario dice "hola" de nuevo, responde algo corto sin decir "de nuevo".',
        precios: 'Usa solo los precios y plazos del campo conocimiento. Nunca inventes precios ni cifras.',
        tono: 'Amable y directo. Sin exagerar, sin jerga de vendedor y sin frases forzadas.'
    };

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
    // Solo datos verificados y tono natural.
    // ============================================================
    const RESPUESTAS_LOCALES = [
        { keys: ['es.stok', 'es.stoks', 'es stok', 'es stoks', 'estok', 'estoks', 'stoks'],
          r: function () {
              return 'Los Es.stoks son el token de Sariel\'s. Se obtienen reclamando el QR de un Domo, ' +
                     'se pueden vender en El Muro o canjear por un NFT (12 Es.stoks).';
          } },

        { keys: ['domo', 'domos'],
          r: function () {
              return 'Un Domo es una galleta física de Sariel\'s con un código QR. Al reclamar su QR desde la app, ' +
                     'recibes Es.stoks en tu cuenta.';
          } },

        { keys: ['nft', 'nfts', 'galleta dorada'],
          r: function () {
              return 'Con 12 Es.stoks puedes canjear un NFT de Sariel\'s. Tiene vigencia de 30 días desde el canje; después queda como conmemorativo.';
          } },

        { keys: ['muro', 'el muro', 'p2p', 'mercado de tokens'],
          r: function () {
              return 'El Muro es donde publicas, sigues tendencias y compras o vendes Es.stoks con otros usuarios. ' +
                     'La venta tiene una comisión del 3%.';
          } },

        { keys: ['wallet', 'billetera', 'metamask', 'walletconnect', 'polygon'],
          r: function () {
              return 'Puedes conectar tu wallet desde la sección Wallet con MetaMask o WalletConnect, en la red Polygon.';
          } },

        { keys: ['live pass', 'livepass', 'membresia live', 'membresía live', 'live basico', 'live pro'],
          r: function () {
              return 'Live Básico cuesta $300 MXN al mes y te da 2 horas al día para transmitir. ' +
                     'Live Pro cuesta $600 MXN al mes y da 5 horas al día.';
          } },

        { keys: ['live', 'en vivo', 'transmitir', 'transmision', 'transmisiones', 'donacion', 'donaciones'],
          r: function () {
              return 'Sariel\'s Live es para transmitir en vivo y ver a otros. Para transmitir necesitas un Live Pass.';
          } },

        { keys: ['plan', 'planes', 'premium', 'suscripcion', 'suscripciones', 'basico', 'pro'],
          r: function () {
              return 'Los planes de Marquinhos son: Gratis, Básico ($300 MXN al mes), Pro ($500 MXN al mes) ' +
                     'y Premium ($850 MXN al mes). Cada uno cambia cuántos mensajes y búsquedas web incluye.';
          } },

        { keys: ['pagar', 'pago', 'pagos', 'spei', 'usdt', 'usdc', 'cripto', 'criptomoneda', 'tarjeta'],
          r: function () {
              return 'Según la pantalla, puedes pagar con tarjeta, SPEI o criptomonedas como USDT o USDC.';
          } },

        { keys: ['internet', 'esim', 'datos moviles', 'paquete de datos', 'paquetes de datos'],
          r: function () {
              return 'En la sección Internet puedes comprar paquetes de datos móviles por eSIM.';
          } },

        { keys: ['quien eres', 'como te llamas', 'que puedes hacer', 'que haces', 'ayuda', 'ayudame'],
          r: function () {
              return 'Soy Marquinhos, el asistente de Sariel\'s. Te puedo explicar cómo funciona el Muro, ' +
                     'los Es.stoks, los Domos, el Mercado, el Live, los planes y más.';
          } },

        { keys: ['sariels', 'sariel s', 'ecosistema'],
          r: function () { return CONOCIMIENTO_ECOSISTEMA.resumen; } },

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
          r: function () { return '¡De nada! Si necesitas algo más, aquí estoy.'; } },

        { keys: ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'que tal'],
          r: function (c) { return '¡Hola' + (c && c.nombre ? ' ' + c.nombre : '') + '! ¿Qué necesitas?'; } }
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
    // LIMPIEZA DE SALUDOS REPETIDOS
    // Si el backend responde "Hola de nuevo" y ya hubo conversación,
    // se quita la frase "de nuevo" para no sonar robótico.
    // ============================================================
    function limpiarSaludoRepetido(reply, historial) {
        if (!reply || typeof reply !== 'string') return reply;
        const hayConversacion = Array.isArray(historial) &&
            historial.some(function (m) { return m && m.role === 'assistant'; });
        if (!hayConversacion) return reply;
        return reply.replace(/^¡?\s*hola de nuevo(,?\s*[^!?.¿]*)?[!.]?\s*/i, function (_, nombre) {
            return '¡Hola' + (nombre || '') + '! ';
        }).trim();
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
    // MÚSICA: validación y emisión del evento
    // Deezer devuelve titulo, artista, caratula y enlace (sin audio).
    // ============================================================
    function musicaValida(m) {
        return Boolean(
            m && typeof m === 'object' &&
            typeof m.titulo === 'string' && m.titulo.trim() !== '' &&
            typeof m.enlace === 'string' && /^https:\/\/(www\.)?deezer\.com\//.test(m.enlace)
        );
    }

    function listaMusicaValida(lista) {
        if (!Array.isArray(lista)) return null;
        const validas = lista.filter(musicaValida);
        return validas.length ? validas : null;
    }

    function emitirMusica(lista) {
        if (!lista) return;
        try {
            window.dispatchEvent(new CustomEvent('marquinhos-musica', { detail: lista }));
        } catch (e) {
            console.warn('[Marquinhos/Brain] No se pudo emitir música:', e.message);
        }
    }

    // ============================================================
    // EVENTOS: validación y emisión del evento
    // Ticketmaster Discovery (solo lectura). Solo enlaces oficiales.
    // ============================================================
    function enlaceTicketmasterSeguro(url) {
        if (typeof url !== 'string') return false;
        try {
            const u = new URL(url);
            const host = u.hostname.toLowerCase();
            return u.protocol === 'https:' &&
                (host === 'ticketmaster.com' || host.endsWith('.ticketmaster.com'));
        } catch (e) {
            return false;
        }
    }

    function eventoValido(ev) {
        return Boolean(
            ev && typeof ev === 'object' &&
            typeof ev.titulo === 'string' && ev.titulo.trim() !== '' &&
            enlaceTicketmasterSeguro(ev.enlace)
        );
    }

    function listaEventosValida(lista) {
        if (!Array.isArray(lista)) return null;
        const validos = lista.filter(eventoValido);
        return validos.length ? validos : null;
    }

    function emitirEventos(lista) {
        if (!lista) return;
        try {
            window.dispatchEvent(new CustomEvent('marquinhos-eventos', { detail: lista }));
        } catch (e) {
            console.warn('[Marquinhos/Brain] No se pudo emitir eventos:', e.message);
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
            const reply = data && (data.reply || data.message || data.response);
            const musica = listaMusicaValida(data && data.musica);
            const eventos = listaEventosValida(data && data.eventos);

            if (reply && typeof reply === 'string' && reply.trim()) {
                return { ok: true, reply: reply.trim(), musica: musica, eventos: eventos };
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
    // Devuelve { reply, musica, eventos } si hay resultados; si no, texto.
    // ============================================================
    async function preguntar(texto, historialLocal, modo) {
        if (!texto || typeof texto !== 'string') return '';
        const limpio = texto.trim();
        if (!limpio) return '';

        window.MarquinhosBrain.ultimaMusica = null;
        window.MarquinhosBrain.ultimosEventos = null;

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
                    modo: modoEnvio,
                    conocimiento: CONOCIMIENTO_ECOSISTEMA,
                    estilo: ESTILO_RESPUESTA
                };

                let r1 = await llamarEndpoint(CHAT_PET_ENDPOINT, payload1, token);

                // Reintento solo si la red falló ANTES de llegar al servidor.
                // Si el servidor respondió con error, no se reintenta:
                // cada llamada consume un mensaje del plan.
                if (!r1.ok && !r1.status && !r1.aborted) {
                    await esperar(600);
                    r1 = await llamarEndpoint(CHAT_PET_ENDPOINT, payload1, token);
                }

                if (r1.ok) {
                    return entregarRespuesta(r1.reply, r1.musica, r1.eventos, historialEnvio);
                }

                const r2 = await llamarEndpoint(CHAT_ENDPOINT, {
                    message: limpio,
                    context: CONTEXTO_PET,
                    history: historialEnvio,
                    memoria: contextoMemoria,
                    modo: modoEnvio,
                    conocimiento: CONOCIMIENTO_ECOSISTEMA,
                    estilo: ESTILO_RESPUESTA
                }, token);

                if (r2.ok) {
                    return entregarRespuesta(r2.reply, r2.musica, r2.eventos, historialEnvio);
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

    // Une la respuesta con música y eventos (si los hay), limpia saludos
    // repetidos y deja los resultados disponibles para el frontend.
    function entregarRespuesta(reply, musica, eventos, historial) {
        const replyLimpio = limpiarSaludoRepetido(reply, historial);
        const hayMusica = Array.isArray(musica) && musica.length > 0;
        const hayEventos = Array.isArray(eventos) && eventos.length > 0;

        if (hayMusica) {
            window.MarquinhosBrain.ultimaMusica = musica;
            emitirMusica(musica);
        }
        if (hayEventos) {
            window.MarquinhosBrain.ultimosEventos = eventos;
            emitirEventos(eventos);
        }

        if (hayMusica || hayEventos) {
            return {
                reply: replyLimpio,
                musica: hayMusica ? musica : null,
                eventos: hayEventos ? eventos : null
            };
        }
        return replyLimpio;
    }

    window.MarquinhosBrain = {
        version: VERSION,
        preguntar: preguntar,
        conocimiento: CONOCIMIENTO_ECOSISTEMA,
        ultimaMusica: null,
        ultimosEventos: null
    };
    console.log('[Marquinhos/Brain] ✅ v' + VERSION + ' cargado (conocimiento + memoria RAG + música + eventos)');
})();
