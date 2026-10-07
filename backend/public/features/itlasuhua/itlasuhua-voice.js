// ================================================================
// ITLASUHUA · VOICE v1.0
// ================================================================
// Control de voz del Rey Itlasuhua.
// Flujo híbrido:
//   - Primer toque: habla frase ceremonial de bienvenida
//   - Toques siguientes: escucha → transcribe → IA responde → habla
// ================================================================

(function (window) {
    'use strict';

    if (window.__itlasuhuaVoiceLoaded) return;
    window.__itlasuhuaVoiceLoaded = true;

    function log(msg) {
        console.log('[Itlasuhua/Voice]', msg);
    }

    let isSpeaking = false;
    let isListening = false;
    let recognition = null;
    let recognitionActive = false;
    let audioActual = null;
    let ttsToken = 0;
    let conversacionActiva = false;
    let saludoHecho = false;
    let procesando = false;
    let recibioResultado = false;
    let historialLocal = [];

    const FRASES_BIENVENIDA = [
        'He sentido tu presencia, viajero. La serpiente cósmica te saluda. ¿Qué buscas en los confines de Csariel\'s?',
        'Los astros se alinean. Soy el Rey Itlasuhua, guardián del equilibrio. Habla, portador.',
        'La serpiente despierta. Tu voz resonará en el cosmos. ¿Qué deseas saber, viajero?'
    ];

    const FRASES_DESPEDIDA = [
        'Que las estrellas guíen tu camino, viajero.',
        'El equilibrio permanece. Hasta la próxima órbita, portador.',
        'La serpiente vela. Descansa, viajero.'
    ];

    const FRASES_ERROR = [
        'La conexión cósmica se ha interrumpido. Intenta de nuevo, viajero.',
        'Los astros no responden. Aguarda un momento.',
        'El equilibrio se tambalea. Repite tu voz.'
    ];

    function elegirAleatorio(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    async function obtenerClienteSupabase() {
        try {
            if (typeof window.getSupabase === 'function') {
                const c = await window.getSupabase();
                if (c && c.auth) return c;
            }
        } catch (e) {}
        if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
        if (window.supabase && window.supabase.auth) return window.supabase;
        return null;
    }

    async function hablar(texto) {
        if (!texto) return false;
        detenerTTS();
        const miToken = ++ttsToken;

        const container = document.getElementById('itlasuhua-container');
        if (container) container.classList.add('is-talking');
        if (window.ItlasuhuaBrain && typeof window.ItlasuhuaBrain.startTalking === 'function') {
            window.ItlasuhuaBrain.startTalking();
        }

        isSpeaking = true;

        try {
            const sb = await obtenerClienteSupabase();
            if (sb && miToken === ttsToken) {
                const r = await sb.auth.getSession();
                if (r.data.session && miToken === ttsToken) {
                    const resp = await fetch('/api/ai/tts-itlasuhua', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + r.data.session.access_token
                        },
                        body: JSON.stringify({ text: texto })
                    });

                    if (resp.ok) {
                        const data = await resp.json();
                        const url = data.audio_url || data.audioUrl;
                        if (url && miToken === ttsToken) {
                            await reproducirAudio(url);
                            finalizarHabla(miToken);
                            return true;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[Itlasuhua/Voice] TTS backend falló:', e);
        }

        if (miToken === ttsToken) {
            await hablarNavegador(texto, miToken);
        }

        finalizarHabla(miToken);
        return true;
    }

    function finalizarHabla(miToken) {
        if (miToken !== ttsToken) return;
        isSpeaking = false;
        const container = document.getElementById('itlasuhua-container');
        if (container) container.classList.remove('is-talking');
        if (window.ItlasuhuaBrain && typeof window.ItlasuhuaBrain.stopTalking === 'function') {
            window.ItlasuhuaBrain.stopTalking();
        }
    }

    function reproducirAudio(url) {
        return new Promise(function (resolve) {
            try {
                audioActual = new Audio(url);
                audioActual.volume = 1.0;
                audioActual.onended = function () { audioActual = null; resolve(); };
                audioActual.onerror = function () { audioActual = null; resolve(); };
                audioActual.play().catch(function () { resolve(); });
            } catch (e) { resolve(); }
        });
    }

    async function hablarNavegador(texto, miToken) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();

        const frases = texto.split(/(?<=[.!?…\n])\s+/).filter(Boolean);
        for (let i = 0; i < frases.length; i++) {
            if (miToken !== ttsToken) return;
            await new Promise(function (resolve) {
                const u = new SpeechSynthesisUtterance(frases[i]);
                u.lang = 'es-MX';
                u.rate = 0.85;
                u.pitch = 0.6;
                u.volume = 1.0;
                u.onend = resolve;
                u.onerror = resolve;
                window.speechSynthesis.speak(u);
            });
        }
    }

    function detenerTTS() {
        ttsToken++;
        try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
        if (audioActual) {
            try { audioActual.pause(); } catch (e) {}
            audioActual = null;
        }
        isSpeaking = false;
        const container = document.getElementById('itlasuhua-container');
        if (container) container.classList.remove('is-talking');
        if (window.ItlasuhuaBrain && typeof window.ItlasuhuaBrain.stopTalking === 'function') {
            window.ItlasuhuaBrain.stopTalking();
        }
    }

    function iniciarReconocimiento() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            hablar(elegirAleatorio(FRASES_ERROR));
            return false;
        }
        if (recognitionActive && recognition) return true;

        try {
            recognition = new SR();
            recognition.lang = 'es-MX';
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            recibioResultado = false;

            recognition.onstart = function () {
                recognitionActive = true;
                isListening = true;
            };

            recognition.onresult = function (event) {
                const transcript = event.results[0][0].transcript.trim();
                if (!transcript) return;
                recibioResultado = true;

                const lower = transcript.toLowerCase();

                if (/(adiós|adios|hasta luego|nos vemos|despídete)/.test(lower) && lower.length < 30) {
                    conversacionActiva = false;
                    hablar(elegirAleatorio(FRASES_DESPEDIDA));
                    return;
                }

                procesarComando(transcript);
            };

            recognition.onerror = function (event) {
                recognitionActive = false;
                isListening = false;
                recognition = null;
                if (event.error === 'not-allowed') {
                    hablar('Permite el micrófono para que pueda escucharte, viajero.');
                }
            };

            recognition.onend = function () {
                recognitionActive = false;
                isListening = false;
                recognition = null;
            };

            recognition.start();
            return true;
        } catch (e) {
            return false;
        }
    }

    function detenerReconocimiento() {
        if (recognition && recognitionActive) {
            try { recognition.abort(); } catch (e) {}
        }
        recognitionActive = false;
        isListening = false;
    }

    async function procesarComando(texto) {
        if (!texto) return;
        if (procesando) return;
        procesando = true;

        try {
            historialLocal.push({ role: 'user', content: texto, ts: Date.now() });
            historialLocal = historialLocal.slice(-20);

            const sb = await obtenerClienteSupabase();
            if (!sb) {
                procesando = false;
                hablar(elegirAleatorio(FRASES_ERROR));
                return;
            }

            const r = await sb.auth.getSession();
            if (!r.data.session) {
                procesando = false;
                hablar('Necesito tu presencia registrada, viajero. Inicia sesión.');
                return;
            }

            const resp = await fetch('/api/ai/chat-itlasuhua', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + r.data.session.access_token
                },
                body: JSON.stringify({
                    message: texto,
                    history: historialLocal.slice(-10),
                    page: window.location.pathname
                })
            });

            if (!resp.ok) {
                procesando = false;
                hablar(elegirAleatorio(FRASES_ERROR));
                return;
            }

            const data = await resp.json();
            const respuesta = data.reply || 'No tengo respuesta para eso, viajero.';

            historialLocal.push({ role: 'assistant', content: respuesta, ts: Date.now() });
            historialLocal = historialLocal.slice(-20);

            procesando = false;
            await hablar(respuesta);

            if (conversacionActiva) {
                setTimeout(function () {
                    if (conversacionActiva && !isSpeaking && !isListening) {
                        iniciarReconocimiento();
                    }
                }, 300);
            }
        } catch (e) {
            procesando = false;
            console.error('[Itlasuhua/Voice] Error procesando:', e);
            hablar(elegirAleatorio(FRASES_ERROR));
        }
    }

    async function onAvatarTap() {
        if (isSpeaking || isListening || procesando) {
            conversacionActiva = false;
            detenerTTS();
            detenerReconocimiento();
            return;
        }

        if (!saludoHecho) {
            saludoHecho = true;
            conversacionActiva = true;
            await hablar(elegirAleatorio(FRASES_BIENVENIDA));

            setTimeout(function () {
                if (conversacionActiva && !isSpeaking) {
                    iniciarReconocimiento();
                }
            }, 800);
            return;
        }

        conversacionActiva = true;
        const ok = iniciarReconocimiento();
        if (!ok) {
            conversacionActiva = false;
            hablar('Tu dispositivo no soporta reconocimiento de voz, viajero.');
        }
    }

    window.ItlasuhuaVoice = {
        hablar: hablar,
        detener: detenerTTS,
        onAvatarTap: onAvatarTap,
        estaHablando: function () { return isSpeaking; },
        estaEscuchando: function () { return isListening; },
        getHistorial: function () { return historialLocal.slice(); },
        resetSaludo: function () { saludoHecho = false; }
    };

    log('✅ Itlasuhua Voice v1.0 cargado');

})(window);