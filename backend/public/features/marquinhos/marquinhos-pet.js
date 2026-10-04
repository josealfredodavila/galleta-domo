// ================================================================
// MARQUINHOS · PET (Mascota Virtual)
// ================================================================
// Widget flotante que vive en TODO el ecosistema.
// - Se activa con la palabra clave "Marquinhos".
// - Habla con TTS (Google o navegador).
// - Escucha con Web Speech API.
// - Guarda conversación para memoria persistente.
//
// Se inyecta vía apariencia-global.js en todas las páginas.
// ================================================================

'use strict';

(function() {
    // Evitar doble carga
    if (window.__marquinhosPetLoaded) return;
    window.__marquinhosPetLoaded = true;

    // ================================================================
    // CONSTANTES
    // ================================================================
    const RUTAS_EXCLUIDAS = [
        '/login', '/registro',
        '/pagar', '/pay', '/checkout', '/success', '/cancel',
        '/terminos', '/privacidad', '/cookies', '/legal',
        '/info', '/live-terminos', '/eliminar-cuenta',
        '/actualizar-contrasena'
    ];

    const WAKE_WORDS = [
        'marquinhos', 'marquinos', 'marquitos',
        'hey marquinhos', 'hola marquinhos',
        'ok marquinhos'
    ];

    const CONFIG_DEFAULT = {
        activo: true,
        estilo_voz: 'natural',    // 'natural' | 'calida' | 'energica' | 'serena'
        velocidad: 1.0,
        tono: 'medio',            // 'grave' | 'medio' | 'agudo'
        volumen: 1.0,
        timeout_seg: 20,
        manos_libres: true,
        idioma: null
    };

    const VOZ_ESTILOS = {
        natural:  { rate: 1.0,  pitch: 1.0,  google: 'es-ES-Neural2-C' },
        calida:   { rate: 0.95, pitch: 0.95, google: 'es-ES-Neural2-A' },
        energica: { rate: 1.15, pitch: 1.1,  google: 'es-US-Neural2-A' },
        serena:   { rate: 0.85, pitch: 0.9,  google: 'es-ES-Standard-B' }
    };

    const TONO_PITCH = {
        grave: 0.85,
        medio: 1.0,
        agudo: 1.15
    };

    // ================================================================
    // ESTADO
    // ================================================================
    let config = { ...CONFIG_DEFAULT };
    let container = null;
    let widget = null;
    let bubble = null;
    let statusEl = null;
    let isVisible = false;
    let isSpeaking = false;
    let isListening = false;
    let recognition = null;
    let recognitionActive = false;
    let timeoutTimer = null;
    let synthUtterance = null;
    let ultimoDiscurso = '';
    let audioActual = null;
    let historialLocal = [];   // memoria en memoria (se sube a Supabase)
    let userInfo = null;

    // ================================================================
    // DETECCIÓN DE RUTA EXCLUIDA
    // ================================================================
    function rutaExcluida() {
        const path = window.location.pathname.toLowerCase();
        return RUTAS_EXCLUIDAS.some(r => path.indexOf(r) !== -1);
    }

    // ================================================================
    // CONFIGURACIÓN · CARGAR / GUARDAR
    // ================================================================
    function cargarConfig() {
        try {
            const guardado = localStorage.getItem('marquinhos_config');
            if (guardado) {
                const parsed = JSON.parse(guardado);
                config = { ...CONFIG_DEFAULT, ...parsed };
            }
        } catch (e) { /* usar defaults */ }
    }

    function guardarConfig() {
        try {
            localStorage.setItem('marquinhos_config', JSON.stringify(config));
        } catch (e) {}
        // Guardar en Supabase (no bloqueante)
        if (window.getSupabase) {
            const sb = window.getSupabase();
            if (sb && sb.auth) {
                sb.auth.getSession().then(r => {
                    if (!r.data.session) return;
                    const uid = r.data.session.user.id;
                    sb.from('preferencias_usuario').select('prefs')
                        .eq('usuario_id', uid).maybeSingle()
                        .then(({ data }) => {
                            const prefs = { ...(data?.prefs || {}), marquinhos: config };
                            sb.from('preferencias_usuario').upsert({
                                usuario_id: uid, prefs
                            }, { onConflict: 'usuario_id' }).then(() => {});
                        });
                }).catch(() => {});
            }
        }
    }

    // ================================================================
    // CARGAR USUARIO
    // ================================================================
    async function cargarUsuario() {
        try {
            if (!window.getSupabase) return null;
            const sb = window.getSupabase();
            if (!sb || !sb.auth) return null;
            const r = await sb.auth.getSession();
            if (!r.data.session) return null;

            const uid = r.data.session.user.id;
            const { data } = await sb.from('usuarios')
                .select('nombre, handle, avatar_url')
                .eq('id', uid)
                .maybeSingle();

            userInfo = {
                id: uid,
                nombre: (data && data.nombre) || r.data.session.user.email?.split('@')[0] || 'amigo',
                handle: (data && data.handle) || 'usuario',
                avatar_url: data && data.avatar_url || null
            };

            // Cargar config desde Supabase si existe
            try {
                const { data: pref } = await sb.from('preferencias_usuario')
                    .select('prefs')
                    .eq('usuario_id', uid)
                    .maybeSingle();
                if (pref && pref.prefs && pref.prefs.marquinhos) {
                    config = { ...config, ...pref.prefs.marquinhos };
                    localStorage.setItem('marquinhos_config', JSON.stringify(config));
                }
            } catch (e) {}

            return userInfo;
        } catch (e) {
            console.warn('[Marquinhos] Error cargando usuario:', e);
            return null;
        }
    }

    // ================================================================
    // CREAR WIDGET EN EL DOM
    // ================================================================
    function crearWidget() {
        // Si ya existe, no duplicar
        if (document.getElementById('marquinhos-pet')) return;

        container = document.createElement('div');
        container.id = 'marquinhos-pet';
        container.className = 'mq-pet';
        container.setAttribute('aria-hidden', 'true');
        container.innerHTML = `
            <div class="mq-pet-bubble" id="mq-bubble" aria-live="polite">
                <div class="mq-pet-bubble-text" id="mq-bubble-text"></div>
            </div>
            <div class="mq-pet-avatar" id="mq-avatar">
                <svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" class="mq-pet-svg">
                    <!-- ANTENAS -->
                    <g id="mq-antenna-left">
                        <line x1="70" y1="40" x2="68" y2="20" stroke="#1565C0" stroke-width="3" stroke-linecap="round"/>
                        <circle cx="68" cy="16" r="6" fill="#FFF8E1" stroke="#1565C0" stroke-width="2"/>
                    </g>
                    <g id="mq-antenna-right">
                        <line x1="130" y1="40" x2="132" y2="20" stroke="#1565C0" stroke-width="3" stroke-linecap="round"/>
                        <circle cx="132" cy="16" r="6" fill="#FFF8E1" stroke="#1565C0" stroke-width="2"/>
                    </g>
                    <!-- CABEZA -->
                    <ellipse cx="100" cy="80" rx="62" ry="56" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                    <ellipse cx="100" cy="80" rx="54" ry="48" fill="none" stroke="#1565C0" stroke-width="1" opacity="0.2" stroke-dasharray="3 3"/>
                    <!-- OJOS -->
                    <ellipse cx="76" cy="80" rx="14" ry="16" fill="#1A0A2E"/>
                    <ellipse cx="76" cy="80" rx="12" ry="13" fill="#F5F0E8"/>
                    <circle cx="76" cy="82" r="6" fill="#0a1a3e"/>
                    <circle cx="74" cy="79" r="2" fill="#fff" opacity="0.9"/>
                    <ellipse cx="124" cy="80" rx="14" ry="16" fill="#1A0A2E"/>
                    <ellipse cx="124" cy="80" rx="12" ry="13" fill="#F5F0E8"/>
                    <circle cx="124" cy="82" r="6" fill="#0a1a3e"/>
                    <circle cx="122" cy="79" r="2" fill="#fff" opacity="0.9"/>
                    <!-- BOCA -->
                    <path d="M 85 108 Q 100 118 115 108" stroke="#1565C0" stroke-width="3" fill="none" stroke-linecap="round" id="mq-mouth"/>
                    <!-- MEJILLAS -->
                    <ellipse cx="62" cy="105" rx="8" ry="5" fill="#FF6B8A" opacity="0.4"/>
                    <ellipse cx="138" cy="105" rx="8" ry="5" fill="#FF6B8A" opacity="0.4"/>
                    <!-- CUERPO -->
                    <rect x="35" y="140" width="130" height="100" rx="22" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                    <rect x="70" y="152" width="60" height="26" rx="8" fill="#FFFFFF" stroke="#1565C0" stroke-width="2.5"/>
                    <text x="100" y="170" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="700" fill="#0D47A1" letter-spacing="0.5">MARQUINHOS</text>
                    <!-- BRAZOS -->
                    <g class="mq-arm-left">
                        <rect x="15" y="150" width="16" height="55" rx="8" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                        <circle cx="23" cy="210" r="12" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                    </g>
                    <g class="mq-arm-right">
                        <rect x="169" y="150" width="16" height="55" rx="8" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                        <circle cx="177" cy="210" r="12" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                    </g>
                    <!-- PIERNAS -->
                    <rect x="60" y="240" width="22" height="20" rx="8" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                    <rect x="118" y="240" width="22" height="20" rx="8" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                </svg>
            </div>
            <div class="mq-pet-status" id="mq-status">
                <span class="mq-dot"></span>
                <span class="mq-status-text">Di "Marquinhos"</span>
            </div>
        `;
        document.body.appendChild(container);

        widget = container;
        bubble = document.getElementById('mq-bubble');
        statusEl = document.getElementById('mq-status');

        // Click en el avatar → toggle manual (por si el wake word falla)
        container.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isVisible) mostrar();
            else ocultar();
        });
    }

    // ================================================================
    // MOSTRAR / OCULTAR WIDGET
    // ================================================================
    function mostrar() {
        if (!container || isVisible) return;
        isVisible = true;
        container.setAttribute('aria-hidden', 'false');
        container.classList.add('mq-visible');
        iniciarTimeout();

        // Reproducir sonido de aparición (opcional, sutil)
        // Sin sonido para no molestar.
    }

    function ocultar() {
        if (!container || !isVisible) return;
        isVisible = false;
        container.setAttribute('aria-hidden', 'true');
        container.classList.remove('mq-visible');
        detenerTimeout();
        detenerTTS();
        if (bubble) bubble.classList.remove('mq-bubble-visible');
    }

    function iniciarTimeout() {
        detenerTimeout();
        if (config.timeout_seg <= 0) return;
        timeoutTimer = setTimeout(() => {
            if (!isSpeaking && isVisible) {
                // Despedida automática
                hablar('Si me necesitas, solo di mi nombre.').then(() => {
                    setTimeout(ocultar, 800);
                });
            }
        }, config.timeout_seg * 1000);
    }

    function detenerTimeout() {
        if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
        }
    }

    // ================================================================
    // BURBUJA DE TEXTO
    // ================================================================
    function mostrarBurbuja(texto) {
        if (!bubble) return;
        const textEl = document.getElementById('mq-bubble-text');
        if (textEl) textEl.textContent = texto;
        bubble.classList.add('mq-bubble-visible');
    }

    function ocultarBurbuja() {
        if (bubble) bubble.classList.remove('mq-bubble-visible');
    }

    // ================================================================
    // TEXT-TO-SPEECH (HABLAR)
    // ================================================================
    async function hablar(texto) {
        if (!texto || typeof texto !== 'string') return;

        detenerTTS();

        ultimoDiscurso = texto;
        const estilo = VOZ_ESTILOS[config.estilo_voz] || VOZ_ESTILOS.natural;
        const pitchBase = TONO_PITCH[config.tono] || 1.0;
        const rate = estilo.rate * (config.velocidad || 1.0);
        const pitch = estilo.pitch * pitchBase;
        const volumen = Math.max(0, Math.min(1, config.volumen || 1.0));

        mostrarBurbuja(texto);
        isSpeaking = true;
        actualizarStatus('hablando', 'Marquinhos habla...');

        // 1. Intentar con backend (Google TTS) si está disponible
        let okBackend = false;
        if (window.getSupabase && !window.__marquinhosNoBackend) {
            try {
                const sb = window.getSupabase();
                if (sb && sb.auth) {
                    const s = await sb.auth.getSession();
                    if (s.data.session) {
                        const resp = await fetch('/api/ai/voice/tts', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + s.data.session.access_token
                            },
                            body: JSON.stringify({
                                text: texto,
                                voice: estilo.google,
                                rate: rate,
                                pitch: pitch
                            })
                        });
                        if (resp.ok) {
                            const data = await resp.json();
                            const audioUrl = data.audio_url || data.audioUrl;
                            if (audioUrl) {
                                okBackend = true;
                                await reproducirAudio(audioUrl);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[Marquinhos] TTS backend falló, usando navegador:', e);
                window.__marquinhosNoBackend = true;
            }
        }

        // 2. Fallback: SpeechSynthesis del navegador
        if (!okBackend) {
            await hablarConNavegador(texto, rate, pitch, volumen);
        }

        isSpeaking = false;
        actualizarStatus('espera', 'Di "Marquinhos"');
        setTimeout(() => {
            if (!isSpeaking) ocultarBurbuja();
        }, 2500);

        // Reiniciar timeout
        if (isVisible) iniciarTimeout();
    }

    function hablarConNavegador(texto, rate, pitch, volumen) {
        return new Promise((resolve) => {
            if (!window.speechSynthesis) { resolve(); return; }
            window.speechSynthesis.cancel();

            synthUtterance = new SpeechSynthesisUtterance(texto);
            synthUtterance.lang = config.idioma || 'es-MX';
            synthUtterance.rate = Math.max(0.5, Math.min(2, rate));
            synthUtterance.pitch = Math.max(0.5, Math.min(2, pitch));
            synthUtterance.volume = volumen;

            synthUtterance.onend = () => resolve();
            synthUtterance.onerror = () => resolve();

            window.speechSynthesis.speak(synthUtterance);
        });
    }

    function reproducirAudio(url) {
        return new Promise((resolve) => {
            try {
                audioActual = new Audio(url);
                audioActual.volume = Math.max(0, Math.min(1, config.volumen || 1.0));
                audioActual.onended = () => { audioActual = null; resolve(); };
                audioActual.onerror = () => { audioActual = null; resolve(); };
                audioActual.play().catch(() => resolve());
            } catch (e) {
                resolve();
            }
        });
    }

    function detenerTTS() {
        try {
            if (window.speechSynthesis) window.speechSynthesis.cancel();
        } catch (e) {}
        if (audioActual) {
            try { audioActual.pause(); audioActual = null; } catch (e) {}
        }
        isSpeaking = false;
    }

    // ================================================================
    // ACTUALIZAR ESTADO VISUAL
    // ================================================================
    function actualizarStatus(tipo, texto) {
        if (!statusEl) return;
        statusEl.className = 'mq-pet-status mq-status-' + tipo;
        const textEl = statusEl.querySelector('.mq-status-text');
        if (textEl) textEl.textContent = texto || '';
    }

    // ================================================================
    // RECONOCIMIENTO DE VOZ (ESCUCHAR)
    // ================================================================
    function iniciarReconocimiento() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            console.warn('[Marquinhos] Reconocimiento de voz no soportado');
            return false;
        }
        if (recognition) return true;

        recognition = new SR();
        recognition.lang = config.idioma || 'es-MX';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            recognitionActive = true;
            if (!isVisible) actualizarStatus('espera', 'Di "Marquinhos"');
        };

        recognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = (result[0].transcript || '').trim();
                const lower = transcript.toLowerCase();

                // ¿Es wake word?
                const esWake = WAKE_WORDS.some(w => lower.includes(w));

                if (esWake && !isVisible) {
                    // Activar
                    mostrar();
                    const nombre = (userInfo && userInfo.nombre) ? ', ' + userInfo.nombre : '';
                    const saludo = '¿Sí' + nombre + '? Te escucho.';
                    hablar(saludo);
                    continue;
                }

                if (esWake && isVisible && !isSpeaking) {
                    // Volver a saludar si ya está visible
                    continue;
                }

                // Si está visible y llegó una frase final (no wake), procesarla
                if (isVisible && result.isFinal && !isSpeaking) {
                    let comando = transcript;

                    // Quitar el wake word del inicio si está
                    WAKE_WORDS.forEach(w => {
                        const re = new RegExp('^\\s*' + w + '[\\s,.]*', 'i');
                        comando = comando.replace(re, '').trim();
                    });

                    if (comando.length > 1) {
                        procesarComando(comando);
                    }
                }
            }
        };

        recognition.onerror = (event) => {
            if (event.error === 'not-allowed') {
                console.warn('[Marquinhos] Permiso de micrófono denegado');
                actualizarStatus('error', 'Micrófono bloqueado');
            } else if (event.error === 'no-speech') {
                // Normal, ignorar
            } else if (event.error === 'aborted') {
                // Normal al cerrar
            } else {
                console.warn('[Marquinhos] Error reconocimiento:', event.error);
            }
        };

        recognition.onend = () => {
            recognitionActive = false;
            // Reiniciar si sigue activo
            if (window.__marquinhosPetLoaded && !document.hidden) {
                setTimeout(() => {
                    if (!recognitionActive && recognition) {
                        try { recognition.start(); } catch (e) {}
                    }
                }, 500);
            }
        };

        try {
            recognition.start();
            return true;
        } catch (e) {
            console.warn('[Marquinhos] No se pudo iniciar reconocimiento:', e);
            return false;
        }
    }

    function detenerReconocimiento() {
        if (recognition && recognitionActive) {
            try { recognition.stop(); } catch (e) {}
            recognitionActive = false;
        }
    }

    // ================================================================
    // PROCESAR COMANDO
    // ================================================================
    async function procesarComando(texto) {
        if (!texto || typeof texto !== 'string') return;
        detenerTimeout();
        actualizarStatus('pensando', 'Pensando...');

        // Guardar mensaje del usuario
        historialLocal.push({ role: 'user', content: texto, ts: Date.now() });

        // Llamar al cerebro
        let respuesta = '';
        if (window.MarquinhosBrain && typeof window.MarquinhosBrain.preguntar === 'function') {
            try {
                respuesta = await window.MarquinhosBrain.preguntar(texto, historialLocal);
            } catch (e) {
                console.error('[Marquinhos] Error del cerebro:', e);
                respuesta = 'Ups, tuve un problema. ¿Puedes repetir?';
            }
        } else {
            respuesta = 'Aún estoy aprendiendo. Intenta de nuevo en un momento.';
        }

        if (!respuesta) respuesta = 'No supe qué decir. ¿Puedes repetir?';

        // Guardar respuesta del bot
        historialLocal.push({ role: 'assistant', content: respuesta, ts: Date.now() });
        if (historialLocal.length > 30) historialLocal = historialLocal.slice(-30);

        await hablar(respuesta);
    }

    // ================================================================
    // VISIBILITY API (pausa si la pestaña pierde foco)
    // ================================================================
    function instalarVisibility() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Pestaña oculta → silenciar todo
                detenerTTS();
                detenerReconocimiento();
                detenerTimeout();
            } else {
                // Pestaña visible de nuevo → retomar
                if (config.manos_libres) iniciarReconocimiento();
                if (isVisible) iniciarTimeout();
            }
        });
    }

    // ================================================================
    // API PÚBLICA
    // ================================================================
    window.Marquinhos = {
        mostrar,
        ocultar,
        hablar,
        procesar: procesarComando,
        getConfig: () => ({ ...config }),
        setConfig: (nuevos) => {
            config = { ...config, ...nuevos };
            guardarConfig();
        },
        recargarConfig: cargarConfig,
        getHistorial: () => historialLocal.slice(),
        limpiarHistorial: () => { historialLocal = []; },
        getUserInfo: () => userInfo
    };

    // ================================================================
    // INIT
    // ================================================================
    async function init() {
        // 1. Ruta excluida → no hacer nada
        if (rutaExcluida()) {
            console.log('[Marquinhos] Ruta excluida, no se activa aquí');
            return;
        }

        // 2. Cargar config
        cargarConfig();

        // 3. Si está desactivado, no hacer nada
        if (!config.activo) {
            console.log('[Marquinhos] Desactivado por el usuario');
            return;
        }

        // 4. Cargar usuario
        await cargarUsuario();
        if (!userInfo) {
            console.log('[Marquinhos] Sin sesión, no se activa');
            return;
        }

        // 5. Crear widget
        crearWidget();

        // 6. Reconocimiento de voz (manos libres)
        if (config.manos_libres) {
            // Esperar a que el usuario interactúe (permiso de micrófono)
            const arrancarMic = () => {
                iniciarReconocimiento();
                document.removeEventListener('click', arrancarMic);
                document.removeEventListener('touchstart', arrancarMic);
            };
            document.addEventListener('click', arrancarMic, { once: true });
            document.addEventListener('touchstart', arrancarMic, { once: true });
        }

        // 7. Visibility
        instalarVisibility();

        // 8. Saludo inicial (silencioso, sin sonido)
        console.log('[Marquinhos] ✅ Listo. Di "Marquinhos" para activarme.');
    }

    // Arrancar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();