// ================================================================
// MARQUINHOS · PET v2.0 (optimizado para móvil)
// ================================================================
// - Botón flotante visible SIEMPRE
// - Tap → pide permiso de micrófono (iOS friendly)
// - Wake word opcional
// - Sin dependencia de consola
// ================================================================

'use strict';

(function() {
    if (window.__marquinhosPetLoaded) return;
    window.__marquinhosPetLoaded = true;

    // ================================================================
    // CONFIGURACIÓN
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
        estilo_voz: 'natural',
        velocidad: 1.0,
        tono: 'medio',
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

    const TONO_PITCH = { grave: 0.85, medio: 1.0, agudo: 1.15 };

    // ================================================================
    // ESTADO
    // ================================================================
    let config = { ...CONFIG_DEFAULT };
    let container = null;
    let bubble = null;
    let statusEl = null;
    let isVisible = false;
    let isSpeaking = false;
    let isListening = false;
    let recognition = null;
    let recognitionActive = false;
    let timeoutTimer = null;
    let ultimoDiscurso = '';
    let audioActual = null;
    let historialLocal = [];
    let userInfo = null;
    let modoActivo = 'idle'; // idle | esperando | escuchando | hablando

    // ================================================================
    // DETECCIÓN
    // ================================================================
    function rutaExcluida() {
        const path = window.location.pathname.toLowerCase();
        return RUTAS_EXCLUIDAS.some(r => path.indexOf(r) !== -1);
    }

    function soportaVoz() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    function soportaTTS() {
        return !!window.speechSynthesis;
    }

    // ================================================================
    // CONFIGURACIÓN
    // ================================================================
    function cargarConfig() {
        try {
            const g = localStorage.getItem('marquinhos_config');
            if (g) config = { ...CONFIG_DEFAULT, ...JSON.parse(g) };
        } catch (e) {}
    }

    function guardarConfig() {
        try { localStorage.setItem('marquinhos_config', JSON.stringify(config)); } catch (e) {}
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
            try {
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
            } catch (e) {
                userInfo = {
                    id: uid,
                    nombre: r.data.session.user.email?.split('@')[0] || 'amigo',
                    handle: 'usuario'
                };
            }
            return userInfo;
        } catch (e) {
            return null;
        }
    }

    // ================================================================
    // CREAR WIDGET
    // ================================================================
    function crearWidget() {
        if (document.getElementById('marquinhos-pet')) return;

        container = document.createElement('div');
        container.id = 'marquinhos-pet';
        container.className = 'mq-pet';
        container.innerHTML = `
            <!-- Burbuja de texto -->
            <div class="mq-pet-bubble" id="mq-bubble">
                <div class="mq-pet-bubble-text" id="mq-bubble-text"></div>
            </div>

            <!-- Avatar -->
            <div class="mq-pet-avatar" id="mq-avatar" role="button" tabindex="0" aria-label="Activar Marquinhos">
                <svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" class="mq-pet-svg">
                    <g>
                        <line x1="70" y1="40" x2="68" y2="20" stroke="#1565C0" stroke-width="3" stroke-linecap="round"/>
                        <circle cx="68" cy="16" r="6" fill="#FFF8E1" stroke="#1565C0" stroke-width="2"/>
                    </g>
                    <g>
                        <line x1="130" y1="40" x2="132" y2="20" stroke="#1565C0" stroke-width="3" stroke-linecap="round"/>
                        <circle cx="132" cy="16" r="6" fill="#FFF8E1" stroke="#1565C0" stroke-width="2"/>
                    </g>
                    <ellipse cx="100" cy="80" rx="62" ry="56" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                    <ellipse cx="76" cy="80" rx="14" ry="16" fill="#1A0A2E"/>
                    <ellipse cx="76" cy="80" rx="12" ry="13" fill="#F5F0E8"/>
                    <circle cx="76" cy="82" r="6" fill="#0a1a3e"/>
                    <circle cx="74" cy="79" r="2" fill="#fff" opacity="0.9"/>
                    <ellipse cx="124" cy="80" rx="14" ry="16" fill="#1A0A2E"/>
                    <ellipse cx="124" cy="80" rx="12" ry="13" fill="#F5F0E8"/>
                    <circle cx="124" cy="82" r="6" fill="#0a1a3e"/>
                    <circle cx="122" cy="79" r="2" fill="#fff" opacity="0.9"/>
                    <path d="M 85 108 Q 100 118 115 108" stroke="#1565C0" stroke-width="3" fill="none" stroke-linecap="round" id="mq-mouth"/>
                    <ellipse cx="62" cy="105" rx="8" ry="5" fill="#FF6B8A" opacity="0.4"/>
                    <ellipse cx="138" cy="105" rx="8" ry="5" fill="#FF6B8A" opacity="0.4"/>
                    <rect x="35" y="140" width="130" height="100" rx="22" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                    <rect x="70" y="152" width="60" height="26" rx="8" fill="#FFFFFF" stroke="#1565C0" stroke-width="2.5"/>
                    <text x="100" y="170" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="700" fill="#0D47A1" letter-spacing="0.5">MARQUINHOS</text>
                    <g>
                        <rect x="15" y="150" width="16" height="55" rx="8" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                        <circle cx="23" cy="210" r="12" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                    </g>
                    <g>
                        <rect x="169" y="150" width="16" height="55" rx="8" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                        <circle cx="177" cy="210" r="12" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                    </g>
                    <rect x="60" y="240" width="22" height="20" rx="8" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                    <rect x="118" y="240" width="22" height="20" rx="8" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                </svg>
            </div>

            <!-- Estado -->
            <div class="mq-pet-status" id="mq-status">
                <span class="mq-dot"></span>
                <span class="mq-status-text">Tócame</span>
            </div>
        `;

        document.body.appendChild(container);
        bubble = document.getElementById('mq-bubble');
        statusEl = document.getElementById('mq-status');

        // TAP en el avatar → activar
        const avatar = document.getElementById('mq-avatar');
        avatar.addEventListener('click', onAvatarTap);
        avatar.addEventListener('touchend', (e) => {
            e.preventDefault();
            onAvatarTap();
        }, { passive: false });
    }

    // ================================================================
    // TAP EN EL AVATAR (activación manual, iOS-friendly)
    // ================================================================
    async function onAvatarTap() {
        if (isSpeaking) {
            // Si está hablando, callar
            detenerTTS();
            return;
        }

        if (!isVisible) {
            // Mostrar + pedir permiso + escuchar
            mostrar();
            await pedirPermisoYEscuchar();
            return;
        }

        if (isListening) {
            // Si ya escucha, callar
            detenerReconocimiento();
            actualizarStatus('espera', 'Tócame para hablar');
            return;
        }

        // Está visible pero no escuchando → volver a escuchar
        await pedirPermisoYEscuchar();
    }

    // ================================================================
    // PEDIR PERMISO DE MICRÓFONO
    // ================================================================
    async function pedirPermisoYEscuchar() {
        actualizarStatus('escuchando', 'Pidiendo permiso...');

        try {
            // Pedir permiso con getUserMedia
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Cerrar el stream inmediatamente (solo queríamos el permiso)
            stream.getTracks().forEach(t => t.stop());
        } catch (e) {
            actualizarStatus('error', 'Sin permiso de micrófono');
            mostrarBurbuja('No puedo escucharte. Activa el micrófono en los ajustes del navegador.');
            setTimeout(ocultarBurbuja, 4000);
            return;
        }

        // Ahora iniciar reconocimiento
        const ok = iniciarReconocimiento();
        if (!ok) {
            actualizarStatus('error', 'Voz no soportada');
            mostrarBurbuja('Tu navegador no soporta reconocimiento de voz. Puedes escribirme.');
            setTimeout(ocultarBurbuja, 4000);
            return;
        }

        const saludo = 'Te escucho, ' + (userInfo?.nombre || 'amigo') + '.';
        hablar(saludo);
    }

    // ================================================================
    // MOSTRAR / OCULTAR
    // ================================================================
    function mostrar() {
        if (!container) return;
        isVisible = true;
        container.classList.add('mq-visible');
        iniciarTimeout();
    }

    function ocultar() {
        if (!container) return;
        isVisible = false;
        container.classList.remove('mq-visible');
        detenerTimeout();
        detenerTTS();
        detenerReconocimiento();
        ocultarBurbuja();
    }

    function iniciarTimeout() {
        detenerTimeout();
        if (config.timeout_seg <= 0) return;
        timeoutTimer = setTimeout(() => {
            if (!isSpeaking && !isListening && isVisible) {
                hablar('Si me necesitas, tócame otra vez.').then(() => {
                    setTimeout(ocultar, 1200);
                });
            }
        }, config.timeout_seg * 1000);
    }

    function detenerTimeout() {
        if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
    }

    // ================================================================
    // BURBUJA
    // ================================================================
    function mostrarBurbuja(texto) {
        if (!bubble) return;
        const t = document.getElementById('mq-bubble-text');
        if (t) t.textContent = texto;
        bubble.classList.add('mq-bubble-visible');
    }

    function ocultarBurbuja() {
        if (bubble) bubble.classList.remove('mq-bubble-visible');
    }

    // ================================================================
    // HABLAR (TTS)
    // ================================================================
    async function hablar(texto) {
        if (!texto) return;
        detenerTTS();

        ultimoDiscurso = texto;
        const estilo = VOZ_ESTILOS[config.estilo_voz] || VOZ_ESTILOS.natural;
        const pitchBase = TONO_PITCH[config.tono] || 1.0;
        const rate = estilo.rate * (config.velocidad || 1.0);
        const pitch = estilo.pitch * pitchBase;
        const volumen = Math.max(0, Math.min(1, config.volumen || 1.0));

        mostrarBurbuja(texto);
        isSpeaking = true;
        actualizarStatus('hablando', 'Hablando...');

        // Intentar con backend primero
        let ok = false;
        if (!window.__marquinhosNoBackend && window.getSupabase) {
            try {
                const sb = window.getSupabase();
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
                        const url = data.audio_url || data.audioUrl;
                        if (url) {
                            ok = true;
                            await reproducirAudio(url);
                        }
                    }
                }
            } catch (e) {
                window.__marquinhosNoBackend = true;
            }
        }

        // Fallback: navegador
        if (!ok) {
            await hablarNavegador(texto, rate, pitch, volumen);
        }

        isSpeaking = false;
        actualizarStatus('espera', 'Tócame');
        setTimeout(() => { if (!isSpeaking) ocultarBurbuja(); }, 2500);
        if (isVisible) iniciarTimeout();
    }

    function hablarNavegador(texto, rate, pitch, volumen) {
        return new Promise((resolve) => {
            if (!window.speechSynthesis) { resolve(); return; }
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(texto);
            u.lang = config.idioma || 'es-MX';
            u.rate = Math.max(0.5, Math.min(2, rate));
            u.pitch = Math.max(0.5, Math.min(2, pitch));
            u.volume = volumen;
            u.onend = resolve;
            u.onerror = resolve;
            window.speechSynthesis.speak(u);
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
            } catch (e) { resolve(); }
        });
    }

    function detenerTTS() {
        try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
        if (audioActual) { try { audioActual.pause(); audioActual = null; } catch (e) {} }
        isSpeaking = false;
    }

    // ================================================================
    // ESTADO VISUAL
    // ================================================================
    function actualizarStatus(tipo, texto) {
        if (!statusEl) return;
        statusEl.className = 'mq-pet-status mq-status-' + tipo;
        const t = statusEl.querySelector('.mq-status-text');
        if (t) t.textContent = texto || '';
        if (container) container.setAttribute('data-estado', tipo);
    }

    // ================================================================
    // RECONOCIMIENTO DE VOZ
    // ================================================================
    function iniciarReconocimiento() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return false;

        if (recognitionActive && recognition) return true;

        try {
            recognition = new SR();
            recognition.lang = config.idioma || 'es-MX';
            recognition.continuous = false;    // iOS no soporta continuous bien
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onstart = () => {
                recognitionActive = true;
                isListening = true;
                actualizarStatus('escuchando', 'Escuchando...');
                mostrarBurbuja('Te escucho...');
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript.trim();
                if (!transcript) return;

                const lower = transcript.toLowerCase();

                // Si dice adiós → cerrar
                if (lower.includes('adiós') || lower.includes('adios') ||
                    lower.includes('chao') || lower.includes('hasta luego')) {
                    hablar('¡Hasta luego!').then(() => ocultar());
                    return;
                }

                // Procesar comando
                procesarComando(transcript);
            };

            recognition.onerror = (event) => {
                recognitionActive = false;
                isListening = false;
                if (event.error === 'not-allowed') {
                    actualizarStatus('error', 'Micrófono bloqueado');
                } else if (event.error === 'no-speech') {
                    actualizarStatus('espera', 'Tócame para hablar');
                } else {
                    actualizarStatus('error', 'Error de audio');
                }
            };

            recognition.onend = () => {
                recognitionActive = false;
                isListening = false;
                if (isVisible && !isSpeaking) {
                    actualizarStatus('espera', 'Tócame');
                }
            };

            recognition.start();
            return true;
        } catch (e) {
            return false;
        }
    }

    function detenerReconocimiento() {
        if (recognition && recognitionActive) {
            try { recognition.stop(); } catch (e) {}
        }
        recognitionActive = false;
        isListening = false;
    }

    // ================================================================
    // PROCESAR COMANDO
    // ================================================================
    async function procesarComando(texto) {
        if (!texto) return;
        detenerTimeout();
        actualizarStatus('pensando', 'Pensando...');

        historialLocal.push({ role: 'user', content: texto, ts: Date.now() });

        let respuesta = '';
        if (window.MarquinhosBrain && typeof window.MarquinhosBrain.preguntar === 'function') {
            try {
                respuesta = await window.MarquinhosBrain.preguntar(texto, historialLocal);
            } catch (e) {
                respuesta = 'Ups, tuve un problema. ¿Puedes repetir?';
            }
        } else {
            respuesta = 'Aún estoy aprendiendo. ¿Puedes preguntarme algo más simple?';
        }

        if (!respuesta) respuesta = 'No supe qué decir.';

        historialLocal.push({ role: 'assistant', content: respuesta, ts: Date.now() });
        if (historialLocal.length > 30) historialLocal = historialLocal.slice(-30);

        await hablar(respuesta);
    }

    // ================================================================
    // VISIBILITY
    // ================================================================
    function instalarVisibility() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                detenerTTS();
                detenerReconocimiento();
                detenerTimeout();
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
        activar: () => { mostrar(); pedirPermisoYEscuchar(); },
        getConfig: () => ({ ...config }),
        setConfig: (nuevos) => { config = { ...config, ...nuevos }; guardarConfig(); },
        recargarConfig: cargarConfig,
        getHistorial: () => historialLocal.slice(),
        getUserInfo: () => userInfo
    };

    // ================================================================
    // INIT
    // ================================================================
    async function init() {
        if (rutaExcluida()) return;

        cargarConfig();
        if (!config.activo) return;

        await cargarUsuario();
        if (!userInfo) return;

        crearWidget();
        instalarVisibility();

        // Mostrar burbuja al cargar
        setTimeout(() => {
            mostrarBurbuja('¡Hola ' + (userInfo.nombre || '') + '! Tócame para hablar.');
            setTimeout(() => {
                if (!isSpeaking) ocultarBurbuja();
            }, 4000);
        }, 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();