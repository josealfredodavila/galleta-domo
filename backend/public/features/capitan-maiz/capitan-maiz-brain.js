// ================================================================
// CAPITÁN MAÍZ · BRAIN v2.1
// ================================================================
// Cliente de IA para el Capitán Maíz.
// Personalidad: Sabio ancestral mexicano con modismos.
//
// Ecosistema: Sariel's
// Endpoint: /api/ai/chat-maiz (separado de Marquinhos)
// ================================================================

'use strict';

(function() {

    if (window.__capitanMaizBrainLoaded) return;
    window.__capitanMaizBrainLoaded = true;

    const ENDPOINT = '/api/ai/chat-maiz';
    const CHARACTER = 'capitan-maiz';
    const MAX_INTENTOS = 2;
    const TIMEOUT_MS = 30000;

    const SYSTEM_PROMPT = `
Eres el **Capitán Maíz** 🌽⚔️, guardián ancestral del ecosistema Sariel's.

## Tu identidad
Eres un guardián cósmico con raíces mexicanas profundas. Proteges la abundancia, guías a los viajeros del ecosistema y velas por el orden cósmico desde la milpa galáctica.

## Tu personalidad
- **Sabio ancestral**: hablas con calma, con la seguridad de quien ha visto muchas eras pasar.
- **Mexicano de corazón**: usas modismos mexicanos naturales ("quihubo", "órale", "a la mejor", "paisano", "morro", "chido", "a poco", "neta", "gacho", "qué padre") pero sin exagerar ni caricaturizar.
- **Cálido pero con autoridad**: eres cercano y amable, pero se nota que eres un guardián.
- **Protector**: te preocupas genuinamente por el usuario.
- **Con humor ligero**: sueltas comentarios con gracia cuando viene al caso.
- **Directo**: no te andas con rodeos.

## Tu tono
- Cercano: tuteas siempre.
- Auténtico: como un tío sabio mexicano que también es guardián cósmico.
- Sin exageraciones.

## Tu sabiduría
- Puedes hablar de cualquier tema: ciencia, tecnología, matemáticas, código, redacción, cocina, historia, finanzas, filosofía, consejos de vida.
- Cuando el tema sea del ecosistema Sariel's, conoces bien cómo funciona.
- Cuando sea general, respondes como un sabio conocedor.

## Referencia a Marquinhos
Si el usuario pregunta por Marquinhos:
- Es tu compañero de misión.
- Marquinhos es más joven y curioso, tú más sabio y ancestral.
- Trabajan juntos cuidando el ecosistema.

## Reglas estrictas

### 🔒 Regla 1 — Salud mental
Si el usuario menciona depresión, ideación suicida, autolesión o violencia:
1. Validas con calidez.
2. Sugieres hablar con alguien de confianza o profesional.
3. Compartes líneas de ayuda (México 800 911 2000, USA 988).
4. NUNCA das métodos ni minimizas.

### 🔒 Regla 2 — Menores
- Edad mínima: 13.
- NO contenido sexual, gore, romántico/parasocial.
- NO pides datos sensibles.

### 🔒 Regla 3 — Anti-copyright
- NO reproduces material con derechos de autor verbatim.
- Máximo 90 caracteres entrecomillados.

## Formato
- Español mexicano natural.
- Conciso: 1-3 párrafos.
- Emojis con moderación: 🌽⚔️✦
- Sin markdown complejo.

## IMPORTANTE
- Eres Capitán Maíz, no Marquinhos.
- Si te piden algo fuera de reglas, respondes con calidez pero firme.
`.trim();

    function log(msg) {
        console.log('[Capitán Maíz/Brain]', msg);
    }

    function logError(msg, err) {
        console.error('[Capitán Maíz/Brain]', msg, err || '');
    }

    async function getSupabaseClient() {
        if (window.getSupabase) {
            try {
                const sb = window.getSupabase();
                if (sb) return sb;
            } catch (e) {}
        }
        return window.supabaseClient || null;
    }

    async function preguntar(pregunta, historial) {
        if (!pregunta || typeof pregunta !== 'string') {
            logError('Pregunta inválida');
            return 'Ay, paisano. No te escuché bien. ¿Me repites?';
        }

        const texto = pregunta.trim();
        if (!texto) return 'No te escuché, paisano. ¿Me repites?';

        const historialLimpio = Array.isArray(historial)
            ? historial
                .filter(m =>
                    m &&
                    m.content &&
                    (m.role === 'user' || m.role === 'assistant')
                )
                .slice(-20)
                .map(m => ({
                    role: m.role,
                    content: String(m.content).substring(0, 2000)
                }))
            : [];

        const sb = await getSupabaseClient();
        if (sb) {
            try {
                const session = await sb.auth.getSession();
                const token = session?.data?.session?.access_token;

                if (token) {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

                    try {
                        const resp = await fetch(ENDPOINT, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + token
                            },
                            body: JSON.stringify({
                                message: texto,
                                history: historialLimpio
                            }),
                            signal: controller.signal
                        });

                        clearTimeout(timeoutId);

                        if (resp.ok) {
                            const data = await resp.json();
                            const respuesta = data.reply || data.respuesta || data.response || data.message;

                            if (respuesta && typeof respuesta === 'string' && respuesta.trim()) {
                                log('✅ Respuesta del backend');
                                return respuesta.trim();
                            }
                        } else if (resp.status === 401) {
                            logError('No autenticado en el backend');
                        } else if (resp.status === 429) {
                            logError('Rate limit alcanzado');
                            return 'Espérate tantito, paisano. Estoy atendiendo a otros viajeros. Dame unos segundos. 🌽';
                        } else {
                            logError('Backend respondió con status ' + resp.status);
                        }
                    } catch (fetchErr) {
                        clearTimeout(timeoutId);
                        if (fetchErr.name === 'AbortError') {
                            logError('Timeout del backend');
                        } else {
                            logError('Error de red:', fetchErr);
                        }
                    }
                }
            } catch (e) {
                logError('Error general en backend:', e);
            }
        }

        return respuestaLocal(texto);
    }

    function respuestaLocal(texto) {
        const lower = texto.toLowerCase();

        if (/^(hola|qué tal|quihubo|buenos días|buenas tardes|buenas noches|hey)/.test(lower)) {
            return '¡Quihubo, paisano! 🌽 Aquí ando, firme como el maíz, cuidando el cosmos. ¿En qué te asisto?';
        }

        if (/^(adiós|adios|hasta luego|nos vemos|bye|chao)/.test(lower)) {
            return '¡Nos vidrios, paisano! Aquí andaré cuando me necesites. 🌽';
        }

        if (/(gracias|te agradezco|mil gracias)/.test(lower)) {
            return 'Al contrario, paisano. Pa\' servirle. ¿Algo más? ⚔️';
        }

        if (/marquinhos|marquino/.test(lower)) {
            return 'Marquinhos es mi compañero de misión. 🌽⚔️ Él es más joven y curioso, yo ando en la sabiduría ancestral.';
        }

        if (/quién eres|quién es usted|qué eres/.test(lower)) {
            return 'Soy el Capitán Maíz 🌽, guardián ancestral del ecosistema Sariel\'s. ¿Y tú, paisano, cómo te llamas?';
        }

        return 'Mmm... te soy honesto, paisano. Ahorita tengo el sombrero medio desconectado del cosmos. 🌽 Intenta en un ratito.';
    }

    window.CapitanMaizBrain = {
        preguntar: preguntar,
        _systemPrompt: SYSTEM_PROMPT,
        _character: CHARACTER,
        _endpoint: ENDPOINT,
        _respuestaLocal: respuestaLocal,
        getInfo: function() {
            return {
                version: '2.1',
                character: CHARACTER,
                endpoint: ENDPOINT,
                autenticado: false
            };
        }
    };

    log('✅ Capitán Maíz Brain v2.1 cargado · endpoint: ' + ENDPOINT);

})();