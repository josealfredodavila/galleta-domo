// ================================================================
// MARQUINHOS · PET v3.0 (arrastrable + IA real + sin subtítulo)
// ================================================================

'use strict';

(function() {
    if (window.__marquinhosPetLoaded) return;
    window.__marquinhosPetLoaded = true;

    const RUTAS_EXCLUIDAS = [
        '/login', '/registro',
        '/pagar', '/pay', '/checkout', '/success', '/cancel',
        '/terminos', '/privacidad', '/cookies', '/legal',
        '/info', '/live-terminos', '/eliminar-cuenta',
        '/actualizar-contrasena'
    ];

    const CONFIG_DEFAULT = {
        activo: true,
        estilo_voz: 'natural',
        velocidad: 1.0,
        tono: 'medio',
        volumen: 1.0,
        timeout_seg: 20,
        manos_libres: false,
        idioma: null,
        posicion_x: null,
        posicion_y: null
    };

    const VOZ_ESTILOS = {
        natural:  { rate: 1.0,  pitch: 1.0 },
        calida:   { rate: 0.95, pitch: 0.95 },
        energica: { rate: 1.15, pitch: 1.1 },
        serena:   { rate: 0.85, pitch: 0.9 }
    };

    const TONO_PITCH = { grave: 0.85, medio: 1.0, agudo: 1.15 };

    let config = { ...CONFIG_DEFAULT };
    let container = null;
    let bubble = null;
    let isVisible = true;
    let isSpeaking = false;
    let isListening = false;
    let recognition = null;
    let recognitionActive = false;
    let timeoutTimer = null;
    let audioActual = null;
    let historialLocal = [];
    let userInfo = null;

    // Arrastre
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let posStartX = 0;
    let posStartY = 0;
    let hasMoved = false;

    function rutaExcluida() {
        const path = window.location.pathname.toLowerCase();
        return RUTAS_EXCLUIDAS.some(r => path.indexOf(r) !== -1);
    }

    function log(msg) { console.log('[Marquinhos]', msg); }

    function cargarConfig() {
        try {
            const g = localStorage.getItem('marquinhos_config');
            if (g) config = { ...CONFIG_DEFAULT, ...JSON.parse(g) };
        } catch (e) {}
    }

    function guardarConfig() {
        try { localStorage.setItem('marquinhos_config', JSON.stringify(config)); } catch (e) {}
    }

    async function cargarUsuario() {
        try {
            if (!window.getSupabase) {
                userInfo = { id: 'anon', nombre: 'amigo' };
                return userInfo;
            }
            const sb = window.getSupabase();
            const r = await sb.auth.getSession();
            if (!r.data.session) {
                userInfo = { id: 'anon', nombre: 'amigo' };
                return userInfo;
            }
            const uid = r.data.session.user.id;
            const { data } = await sb.from('usuarios')
                .select('nombre, handle, avatar_url')
                .eq('id', uid)
                .maybeSingle();
            userInfo = {
                id: uid,
                nombre: (data && data.nombre) || 'amigo',
                handle: (data && data.handle) || 'usuario'
            };
            return userInfo;
        } catch (e) {
            userInfo = { id: 'anon', nombre: 'amigo' };
            return userInfo;
        }
    }

    function crearWidget() {
        if (document.getElementById('marquinhos-pet')) return;

        container = document.createElement('div');
        container.id = 'marquinhos-pet';
        container.className = 'mq-pet';

        // Restaurar posición guardada
        if (config.posicion_x !== null && config.posicion_y !== null) {
            container.style.left = config.posicion_x + 'px';
            container.style.top = config.posicion_y + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        }

        container.innerHTML = `
            <div class="mq-pet-bubble" id="mq-bubble">
                <div class="mq-pet-bubble-text" id="mq-bubble-text"></div>
            </div>
            <div class="mq-pet-avatar" id="mq-avatar" role="button" tabindex="0" aria-label="Hablar con Marquinhos">
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
                    <path d="M 85 108 Q 100 118 115 108" stroke="#1565C0" stroke-width="3" fill="none" stroke-linecap="round"/>
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
        `;

        document.body.appendChild(container);

        try { document.body.style.overflowX = 'visible'; } catch (e) {}

        bubble = document.getElementById('mq-bubble');

        const avatar = document.getElementById('mq-avatar');

        // ============================================================
        // TAP → ACTIVAR VOZ
        // ============================================================
        avatar.addEventListener('click', function(e) {
            // Si fue un drag, no hacer nada
            if (hasMoved) {
                hasMoved = false;
                return;
            }
            onAvatarTap();
        });

        // ============================================================
        // ARRASTRE CON POINTER EVENTS (funciona mouse + touch)
        // ============================================================
        avatar.addEventListener('pointerdown', function(e) {
            isDragging = true;
            hasMoved = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = container.getBoundingClientRect();
            posStartX = rect.left;
            posStartY = rect.top;

            avatar.setPointerCapture(e.pointerId);
            container.classList.add('mq-dragging');
            e.preventDefault();
        });

        avatar.addEventListener('pointermove', function(e) {
            if (!isDragging) return;

            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;

            // Detectar movimiento real (más de 5px)
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                hasMoved = true;
            }

            if (!hasMoved) return;

            let newX = posStartX + dx;
            let newY = posStartY + dy;

            // Limitar dentro de la pantalla
            const maxX = window.innerWidth - 90;
            const maxY = window.innerHeight - 130;
            newX = Math.max(0, Math.min(maxX, newX));
            newY = Math.max(0, Math.min(maxY, newY));

            container.style.left = newX + 'px';
            container.style.top = newY + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        });

        avatar.addEventListener('pointerup', function(e) {
            if (!isDragging) return;
            isDragging = false;
            container.classList.remove('mq-dragging');
            avatar.releasePointerCapture(e.pointerId);

            // Guardar posición
            if (hasMoved) {
                const rect = container.getBoundingClientRect();
                config.posicion_x = rect.left;
                config.posicion_y = rect.top;
                guardarConfig();
            }
        });

        avatar.addEventListener('pointercancel', function(e) {
            isDragging = false;
            container.classList.remove('mq-dragging');
        });

        log('Widget creado');
    }

    async function onAvatarTap() {
        if (isSpeaking) {
            detenerTTS();
            return;
        }
        if (isListening) {
            detenerReconocimiento();
            return;
        }

        const ok = iniciarReconocimiento();
        if (!ok) {
            mostrarBurbuja('Tu navegador no soporta reconocimiento de voz.');
            setTimeout(ocultarBurbuja, 4000);
            return;
        }

        const saludo = '¿Sí, ' + (userInfo?.nombre || 'amigo') + '?';
        hablar(saludo);
    }

    function mostrarBurbuja(texto) {
        if (!bubble) return;
        const t = document.getElementById('mq-bubble-text');
        if (t) t.textContent = texto;
        bubble.classList.add('mq-bubble-visible');
    }

    function ocultarBurbuja() {
        if (bubble) bubble.classList.remove('mq-bubble-visible');
    }

    async function hablar(texto) {
        if (!texto) return;
        detenerTTS();

        const estilo = VOZ_ESTILOS[config.estilo_voz] || VOZ_ESTILOS.natural;
        const pitchBase = TONO_PITCH[config.tono] || 1.0;
        const rate = estilo.rate * (config.velocidad || 1.0);
        const pitch = estilo.pitch * pitchBase;
        const volumen = Math.max(0, Math.min(1, config.volumen || 1.0));

        mostrarBurbuja(texto);
        isSpeaking = true;
        if (container) container.setAttribute('data-estado', 'hablando');

        // 1. Intentar con TTS del backend
        let ok = false;
        if (window.getSupabase && !window.__marquinhosNoBackendTTS) {
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
                window.__marquinhosNoBackendTTS = true;
            }
        }

        // 2. Fallback: navegador
        if (!ok) {
            await hablarNavegador(texto, rate, pitch, volumen);
        }

        isSpeaking = false;
        if (container) container.setAttribute('data-estado', 'idle');
        setTimeout(function() { if (!isSpeaking) ocultarBurbuja(); }, 3000);
    }

    function hablarNavegador(texto, rate, pitch, volumen) {
        return new Promise(function(resolve) {
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
        return new Promise(function(resolve) {
            try {
                audioActual = new Audio(url);
                audioActual.volume = Math.max(0, Math.min(1, config.volumen || 1.0));
                audioActual.onended = function() { audioActual = null; resolve(); };
                audioActual.onerror = function() { audioActual = null; resolve(); };
                audioActual.play().catch(function() { resolve(); });
            } catch (e) { resolve(); }
        });
    }

    function detenerTTS() {
        try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
        if (audioActual) { try { audioActual.pause(); audioActual = null; } catch (e) {} }
        isSpeaking = false;
    }

    function iniciarReconocimiento() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return false;
        if (recognitionActive && recognition) return true;

        try {
            recognition = new SR();
            recognition.lang = config.idioma || 'es-MX';
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onstart = function() {
                recognitionActive = true;
                isListening = true;
                if (container) container.setAttribute('data-estado', 'escuchando');
                mostrarBurbuja('Te escucho...');
            };

            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript.trim();
                if (!transcript) return;
                const lower = transcript.toLowerCase();
                if (lower.includes('adiós') || lower.includes('adios') || lower.includes('hasta luego')) {
                    hablar('¡Hasta luego!');
                    return;
                }
                procesarComando(transcript);
            };

            recognition.onerror = function(event) {
                recognitionActive = false;
                isListening = false;
                if (container) container.setAttribute('data-estado', 'idle');
                if (event.error === 'not-allowed') {
                    mostrarBurbuja('Permite el micrófono.');
                    setTimeout(ocultarBurbuja, 5000);
                }
            };

            recognition.onend = function() {
                recognitionActive = false;
                isListening = false;
                if (container) container.setAttribute('data-estado', 'idle');
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

    async function procesarComando(texto) {
        if (!texto) return;
        if (container) container.setAttribute('data-estado', 'pensando');
        mostrarBurbuja('...');

        historialLocal.push({ role: 'user', content: texto, ts: Date.now() });

        let respuesta = '';
        if (window.MarquinhosBrain && typeof window.MarquinhosBrain.preguntar === 'function') {
            try {
                respuesta = await window.MarquinhosBrain.preguntar(texto, historialLocal);
            } catch (e) {
                respuesta = 'Ups, tuve un problema. ¿Puedes repetir?';
            }
        } else {
            respuesta = 'No puedo pensar ahora mismo.';
        }

        if (!respuesta) respuesta = 'No supe qué decir.';

        historialLocal.push({ role: 'assistant', content: respuesta, ts: Date.now() });
        if (historialLocal.length > 30) historialLocal = historialLocal.slice(-30);

        await hablar(respuesta);
    }

    function instalarVisibility() {
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                detenerTTS();
                detenerReconocimiento();
            }
        });
    }

    window.Marquinhos = {
        hablar: hablar,
        procesar: procesarComando,
        getConfig: function() { return { ...config }; },
        setConfig: function(nuevos) { config = { ...config, ...nuevos }; guardarConfig(); },
        resetPosicion: function() {
            config.posicion_x = null;
            config.posicion_y = null;
            guardarConfig();
            if (container) {
                container.style.left = '';
                container.style.top = '';
                container.style.right = '16px';
                container.style.bottom = '16px';
            }
        },
        getUserInfo: function() { return userInfo; }
    };

    async function init() {
        if (rutaExcluida()) return;
        cargarConfig();
        if (!config.activo) return;

        await cargarUsuario();
        crearWidget();
        instalarVisibility();
        log('✅ Listo.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();