// ================================================================
// CAPITÁN MAÍZ · PET v1.0 "GUARDIA ANCESTRAL"
// Personaje independiente de Marquinhos.
// Estilo: Chibi Kawaii Galáctico + Neon Charro
// Personalidad: Sabio ancestral mexicano con modismos
// ================================================================
// NOTA: Este es el esqueleto. Anthropic completará el SVG con slots
// (data-acc-slot) igual que en marquinhos-pet.js.
// ================================================================

'use strict';

(function() {
    if (window.__capitanMaizPetLoaded) return;
    window.__capitanMaizPetLoaded = true;

    const RUTAS_EXCLUIDAS = [
        '/login', '/registro',
        '/pagar', '/pay', '/checkout', '/success', '/cancel',
        '/terminos', '/privacidad', '/cookies', '/legal',
        '/info', '/live-terminos', '/eliminar-cuenta',
        '/actualizar-contrasena',
        '/features/capitan-maiz/tienda'
    ];

    const CONFIG_DEFAULT = {
        activo: true,
        estilo_voz: 'natural',
        velocidad: 1.0,
        tono: 'medio',
        volumen: 1.0,
        timeout_seg: 20,
        conversacion: true,
        mostrar_subtitulos: false,
        idioma: null,
        posicion_x: null,
        posicion_y: null,
        tamano: 100
    };

    const VOZ_ESTILOS = {
        natural:  { rate: 1.0,  pitch: 1.0 },
        sabio:    { rate: 0.9,  pitch: 0.95 }, // Voz más pausada, ancestral
        energico: { rate: 1.1,  pitch: 1.05 },
        sereno:   { rate: 0.85, pitch: 0.9 }
    };

    const TONO_PITCH = { grave: 0.85, medio: 1.0, agudo: 1.15 };

    const HIST_MAX = 40;
    const HIST_MAX_ENVIO = 20;
    const HIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const HIST_KEY = 'capitan_maiz_hist_';
    const ACC_KEY = 'capitan_maiz_accesorios_equipados';

    const TERMINOS_VERSION = '1.0';
    const TERMINOS_KEY = 'capitan_maiz_terminos_aceptados_' + TERMINOS_VERSION;

    const TTS_FALLO_TTL_MS = 2 * 60 * 1000;
    let _ttsBackendFalloEn = 0;

    // Visemas (mismos que Marquinhos, pero pueden ajustarse al SVG del Capitán)
    const VISEMAS_SVG = {
        REST: 'M 78 137 Q 100 150 122 137',
        A:    'M 70 134 Q 100 130 130 134 Q 126 154 100 154 Q 74 154 70 134 Z',
        E:    'M 72 137 Q 100 134 128 137 Q 122 150 100 150 Q 78 150 72 137 Z',
        I:    'M 74 139 Q 100 143 126 139 Q 100 148 74 139 Z',
        O:    'M 100 132 Q 116 132 116 143 Q 116 154 100 154 Q 84 154 84 143 Q 84 132 100 132 Z',
        U:    'M 100 135 Q 111 135 111 143 Q 111 151 100 151 Q 89 151 89 143 Q 89 135 100 135 Z',
        M:    'M 82 140 L 118 140'
    };
    const VISEMAS_SIN_RELLENO = { REST: true, M: true };

    let config = { ...CONFIG_DEFAULT };
    let container = null;
    let bubble = null;
    let bocaEl = null;
    let isSpeaking = false;
    let isListening = false;
    let recognition = null;
    let recognitionActive = false;
    let audioActual = null;
    let historialLocal = [];
    let userInfo = null;
    let ttsToken = 0;
    let conversationToken = 0;
    let conversacionActiva = false;
    let procesando = false;
    let recibioResultado = false;
    let accesoriosEquipados = [];

    let _bocaTimeouts = [];
    let _bocaActiva = false;
    let _terminosProcesando = false;

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

    function log(msg) { console.log('[Capitán Maíz v1.0]', msg); }

    function esc(v) {
        const d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }

    function cargarConfig() {
        try {
            const g = localStorage.getItem('capitan_maiz_config');
            if (g) config = { ...CONFIG_DEFAULT, ...JSON.parse(g) };
            if (config.tamano != null) config.tamano = Math.max(60, Math.min(150, parseInt(config.tamano, 10) || 100));
            if (config.volumen != null) config.volumen = Math.max(0, Math.min(1, parseFloat(config.volumen) || 1));
            if (config.velocidad != null) config.velocidad = Math.max(0.5, Math.min(2, parseFloat(config.velocidad) || 1));
        } catch (e) {}
    }

    function guardarConfig() {
        try { localStorage.setItem('capitan_maiz_config', JSON.stringify(config)); } catch (e) {}
    }

    function aplicarTamano() {
        if (!container) return;
        const porcentaje = (config.tamano != null ? config.tamano : 100) / 100;
        const ancho = Math.round(90 * porcentaje);
        const alto = Math.round(130 * porcentaje);

        container.style.setProperty('--cm-ancho', ancho + 'px');
        container.style.setProperty('--cm-alto', alto + 'px');
        container.style.width = ancho + 'px';
        container.style.height = alto + 'px';

        const avatar = document.getElementById('cm-avatar');
        if (avatar) {
            avatar.style.width = ancho + 'px';
            avatar.style.height = alto + 'px';
        }
    }

    function aplicarModo() {
        if (!container) return;
        if (config.mostrar_subtitulos) {
            container.classList.remove('cm-modo-voz');
        } else {
            container.classList.add('cm-modo-voz');
        }
    }

    function cargarHistorial() {
        try {
            const raw = localStorage.getItem(HIST_KEY + (userInfo ? userInfo.id : 'anon'));
            if (!raw) { historialLocal = []; return; }
            const arr = JSON.parse(raw);
            const limite = Date.now() - HIST_TTL_MS;
            historialLocal = (Array.isArray(arr) ? arr : [])
                .filter(m => m && m.content && m.ts && m.ts > limite &&
                             (m.role === 'user' || m.role === 'assistant'))
                .slice(-HIST_MAX);
        } catch (e) { historialLocal = []; }
    }

    function guardarHistorial() {
        try {
            historialLocal = historialLocal.slice(-HIST_MAX);
            localStorage.setItem(HIST_KEY + (userInfo ? userInfo.id : 'anon'), JSON.stringify(historialLocal));
        } catch (e) {}
    }

    function olvidarTodo() {
        historialLocal = [];
        try { localStorage.removeItem(HIST_KEY + (userInfo ? userInfo.id : 'anon')); } catch (e) {}
    }

    async function cargarUsuario() {
        try {
            if (!window.getSupabase) {
                userInfo = { id: 'anon', nombre: 'paisano' };
                return userInfo;
            }
            const sb = window.getSupabase();
            const r = await sb.auth.getSession();
            if (!r.data.session) {
                userInfo = { id: 'anon', nombre: 'paisano' };
                return userInfo;
            }
            const uid = r.data.session.user.id;
            const { data } = await sb.from('usuarios')
                .select('nombre, handle, avatar_url')
                .eq('id', uid).maybeSingle();
            userInfo = {
                id: uid,
                nombre: (data && data.nombre) || 'paisano',
                handle: (data && data.handle) || 'usuario'
            };
            return userInfo;
        } catch (e) {
            userInfo = { id: 'anon', nombre: 'paisano' };
            return userInfo;
        }
    }

    async function cargarAccesorios() {
        try {
            const cached = JSON.parse(localStorage.getItem(ACC_KEY) || '[]');
            if (Array.isArray(cached)) accesoriosEquipados = cached;
        } catch (e) { accesoriosEquipados = []; }

        try {
            if (!window.getSupabase) return;
            const sb = window.getSupabase();
            const r = await sb.auth.getSession();
            if (!r.data.session) return;
            const uid = r.data.session.user.id;

            const { data, error } = await sb
                .from('capitan_maiz_inventario')
                .select(`accesorio_id, equipado, capitan_maiz_accesorios!inner (nombre, categoria, svg_data)`)
                .eq('usuario_id', uid)
                .eq('equipado', true);
            if (error) return;
            if (Array.isArray(data)) {
                accesoriosEquipados = data.map(d => ({
                    id: d.accesorio_id,
                    categoria: d.capitan_maiz_accesorios?.categoria || 'accesorio',
                    svg: d.capitan_maiz_accesorios?.svg_data || '',
                    nombre: d.capitan_maiz_accesorios?.nombre || ''
                }));
                localStorage.setItem(ACC_KEY, JSON.stringify(accesoriosEquipados));
            }
        } catch (e) {}
    }

    function posicionPorCategoria(cat) {
        if (window.CapitanMaizFit && typeof window.CapitanMaizFit.getCategoria === 'function') {
            try {
                const fit = window.CapitanMaizFit.getCategoria(cat);
                if (fit && fit.x != null && fit.y != null && fit.size != null) {
                    return { x: fit.x, y: fit.y, size: fit.size };
                }
            } catch (e) {}
        }
        return { x: 100, y: 200, size: 60 };
    }

    // ============================================================
    // Renderiza accesorios con slots (cuando Anthropic complete el SVG)
    // ============================================================
    function renderAccesoriosEnAvatar(intento) {
        const svg = container ? container.querySelector('svg.cm-pet-svg') : null;
        if (!svg) return;

        const lib = window.CapitanMaizAccesoriosSVG;
        const lista = accesoriosEquipados.map(a => a.svg).filter(Boolean);

        const intentoActual = intento || 0;
        if ((!lib || typeof lib.aplicar !== 'function') && lista.length > 0 && intentoActual < 5) {
            setTimeout(function() {
                renderAccesoriosEnAvatar(intentoActual + 1);
            }, 600 + intentoActual * 400);
        }

        let resto = lista;
        if (lib && typeof lib.aplicar === 'function' && svg.querySelector('[data-acc-slot]')) {
            try {
                const resultado = lib.aplicar(svg, lista);
                resto = Array.isArray(resultado) ? resultado : lista;
            } catch (e) {
                resto = lista;
            }
        }

        const layer = document.getElementById('cm-acc-layer');
        if (!layer) return;

        layer.innerHTML = accesoriosEquipados
            .filter(a => a.svg && Array.isArray(resto) && resto.indexOf(a.svg) !== -1)
            .map((a, i) => {
                if (String(a.svg).trim().indexOf('<') === 0) return '<g>' + a.svg + '</g>';
                const p = posicionPorCategoria(a.categoria);
                const yOffset = i * 30;
                return `<text x="${p.x}" y="${p.y + yOffset}" font-size="${p.size}" text-anchor="middle">${esc(a.svg)}</text>`;
            }).join('');
    }

    function cambiarVisema(nombre) {
        if (!bocaEl) return;
        var key = VISEMAS_SVG[nombre] ? nombre : 'REST';
        bocaEl.setAttribute('d', VISEMAS_SVG[key]);
        bocaEl.setAttribute('fill', VISEMAS_SIN_RELLENO[key] ? 'none' : '#0a0a0a');
    }

    function detenerAnimacionBoca() {
        _bocaActiva = false;
        _bocaTimeouts.forEach(t => clearTimeout(t));
        _bocaTimeouts = [];
        cambiarVisema('REST');
    }

    function animarBoca(texto, rate) {
        detenerAnimacionBoca();
        if (!bocaEl) return;
        if (!window.CapitanMaizBoca) { animarBocaRandom(); return; }

        var visemas = window.CapitanMaizBoca.analizar(texto);
        if (!visemas || !visemas.length) { animarBocaRandom(); return; }

        _bocaActiva = true;
        var rateFactor = rate || 1.0;
        var tiempo = 0;

        visemas.forEach(function(v) {
            var dur = v.duracion / rateFactor;
            var t = setTimeout(function() {
                if (!_bocaActiva) return;
                cambiarVisema(v.visema);
            }, tiempo);
            _bocaTimeouts.push(t);
            tiempo += dur;
        });

        var tFin = setTimeout(function() {
            if (!_bocaActiva) return;
            cambiarVisema('REST');
            _bocaActiva = false;
        }, tiempo + 100);
        _bocaTimeouts.push(tFin);
    }

    function animarBocaRandom() {
        _bocaActiva = true;
        var visemas = ['A', 'E', 'O', 'I', 'A', 'U', 'E'];
        var idx = 0;
        function siguiente() {
            if (!_bocaActiva || !bocaEl) return;
            cambiarVisema(visemas[idx % visemas.length]);
            idx++;
            var t = setTimeout(siguiente, 90 + Math.random() * 70);
            _bocaTimeouts.push(t);
        }
        siguiente();
    }

    // ============================================================
    // Términos con Supabase
    // ============================================================
    async function verificarTerminosEnSupabase() {
        if (!window.getSupabase) return false;
        try {
            const sb = window.getSupabase();
            const r = await sb.auth.getSession();
            if (!r.data.session) return false;

            const { data, error } = await sb.rpc('verificar_aceptacion_terminos_capitan_maiz', {
                p_version: TERMINOS_VERSION
            });
            if (!error && data && data.aceptado === true) {
                try {
                    localStorage.setItem(TERMINOS_KEY, 'true');
                    localStorage.setItem('capitan_maiz_terminos_fecha', data.fecha_aceptacion || '');
                } catch (e) {}
                return true;
            }
        } catch (e) {}
        return false;
    }

    async function registrarTerminosEnSupabase() {
        if (!window.getSupabase) return false;
        try {
            const sb = window.getSupabase();
            const r = await sb.auth.getSession();
            if (!r.data.session) return false;

            const { data, error } = await sb.rpc('registrar_aceptacion_terminos_capitan_maiz', {
                p_version: TERMINOS_VERSION,
                p_user_agent: navigator.userAgent
            });
            if (!error && data && data.success === true) return true;
        } catch (e) {}
        return false;
    }

    function mostrarModalTerminos() {
        if (document.getElementById('cm-modal-terminos')) return;

        const modal = document.createElement('div');
        modal.id = 'cm-modal-terminos';
        modal.innerHTML = `
            <div class="cm-modal-overlay">
                <div class="cm-modal-content">
                    <h2>🌽 Términos del Capitán Maíz</h2>
                    <div class="cm-modal-body">
                        <p>Antes de hablar con el Capitán Maíz, guardián ancestral del ecosistema, conoce lo siguiente:</p>
                        <ul>
                            <li><strong>El Capitán Maíz es una IA</strong>, no un humano ni un profesional.</li>
                            <li><strong>Puede cometer errores.</strong> Verifica siempre la información importante.</li>
                            <li><strong>No reemplaza a un terapeuta, médico o asesor profesional.</strong></li>
                            <li><strong>No genera contenido sexual, gore ni relaciones románticas.</strong></li>
                            <li><strong>Respeta los derechos de autor.</strong></li>
                            <li><strong>Tu memoria es privada</strong>, aislada por usuario.</li>
                            <li><strong>Edad mínima: 13 años.</strong></li>
                        </ul>
                        <p>Al continuar, aceptas los <a href="/legal/terminos-capitan-maiz" target="_blank" rel="noopener">Términos completos</a>.</p>
                    </div>
                    <div class="cm-modal-actions">
                        <button id="cm-btn-aceptar" class="cm-btn-aceptar" type="button">Acepto y continúo</button>
                        <button id="cm-btn-rechazar" class="cm-btn-rechazar" type="button">No acepto</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (container) container.style.display = 'none';

        document.getElementById('cm-btn-aceptar').addEventListener('click', async function() {
            if (_terminosProcesando) return;
            _terminosProcesando = true;

            const btn = this;
            btn.disabled = true;
            btn.textContent = 'Guardando...';

            try { localStorage.setItem(TERMINOS_KEY, 'true'); } catch (e) {}
            await registrarTerminosEnSupabase();

            modal.remove();
            _terminosProcesando = false;
            if (container) container.style.display = '';
            if (window.CapitanMaizAnim && typeof window.CapitanMaizAnim.iniciar === 'function') {
                window.CapitanMaizAnim.iniciar();
            }
            log('✅ Términos aceptados');
        });

        document.getElementById('cm-btn-rechazar').addEventListener('click', function() {
            modal.remove();
            if (container) container.style.display = 'none';
            log('❌ Términos rechazados.');
        });
    }

    async function verificarTerminos() {
        try {
            const aceptados = localStorage.getItem(TERMINOS_KEY);
            if (aceptados) return true;
            const okServidor = await verificarTerminosEnSupabase();
            if (okServidor) return true;
            mostrarModalTerminos();
            return false;
        } catch (e) { return true; }
    }

    // ============================================================
    // WIDGET
    // ⚠️ El SVG completo lo entregará Anthropic.
    // Aquí va un placeholder temporal hasta que llegue.
    // ============================================================
    function crearWidget() {
        if (document.getElementById('capitan-maiz-pet')) return;

        container = document.createElement('div');
        container.id = 'capitan-maiz-pet';
        container.className = 'cm-pet';

        if (config.posicion_x !== null && config.posicion_y !== null) {
            container.style.left = config.posicion_x + 'px';
            container.style.top = config.posicion_y + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        }

        // ⚠️ PLACEHOLDER SVG — Reemplazar por el SVG completo de Anthropic
        container.innerHTML = `
            <div class="cm-pet-bubble" id="cm-bubble">
                <div class="cm-pet-bubble-text" id="cm-bubble-text"></div>
            </div>

            <div class="cm-pet-avatar" id="cm-avatar" role="button" tabindex="0" aria-label="Hablar con el Capitán Maíz">
                <svg viewBox="0 -22 200 322" xmlns="http://www.w3.org/2000/svg" class="cm-pet-svg" style="overflow:visible">
                    <defs>
                        <linearGradient id="cm-grad-cabeza" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#FFFFFF"/>
                            <stop offset="100%" stop-color="#F5F5F5"/>
                        </linearGradient>
                        <radialGradient id="cm-grad-aura" cx="50%" cy="50%">
                            <stop offset="0%" stop-color="#00D4FF" stop-opacity="0.4"/>
                            <stop offset="100%" stop-color="#00D4FF" stop-opacity="0"/>
                        </radialGradient>
                    </defs>

                    <ellipse cx="100" cy="140" rx="85" ry="110" fill="url(#cm-grad-aura)" opacity="0.6">
                        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite"/>
                    </ellipse>

                    <!-- ⚠️ TODO: Reemplazar por el SVG completo del Capitán Maíz -->
                    <g id="cm-cuerpo">
                        <g id="cm-cabeza-grupo">
                            <rect x="35" y="40" width="130" height="120" rx="28" fill="url(#cm-grad-cabeza)" stroke="#5A6C7D" stroke-width="3"/>
                            <text x="100" y="110" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#0A0A0A">🌽</text>
                        </g>
                    </g>

                    <g id="cm-acc-layer"></g>
                </svg>
            </div>
        `;

        document.body.appendChild(container);

        bubble = document.getElementById('cm-bubble');
        bocaEl = document.getElementById('cm-boca');

        const avatar = document.getElementById('cm-avatar');

        avatar.addEventListener('click', function() {
            if (hasMoved) { hasMoved = false; return; }
            if (!verificarTerminos()) return;
            onAvatarTap();
        });

        avatar.addEventListener('pointerdown', function(e) {
            isDragging = true;
            hasMoved = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            try {
                const rect = container.getBoundingClientRect();
                posStartX = rect.left;
                posStartY = rect.top;
            } catch (err) { posStartX = 0; posStartY = 0; }
            avatar.setPointerCapture(e.pointerId);
            container.classList.add('cm-dragging');
            e.preventDefault();
        });

        avatar.addEventListener('pointermove', function(e) {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;
            if (!hasMoved) return;

            const porcentaje = (config.tamano != null ? config.tamano : 100) / 100;
            const ancho = Math.round(90 * porcentaje);
            const alto = Math.round(130 * porcentaje);

            let newX = posStartX + dx;
            let newY = posStartY + dy;
            const maxX = window.innerWidth - ancho;
            const maxY = window.innerHeight - alto;
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
            container.classList.remove('cm-dragging');
            try { avatar.releasePointerCapture(e.pointerId); } catch (err) {}
            if (hasMoved) {
                try {
                    const rect = container.getBoundingClientRect();
                    config.posicion_x = rect.left;
                    config.posicion_y = rect.top;
                    guardarConfig();
                } catch (err) {}
            }
        });

        avatar.addEventListener('pointercancel', function() {
            isDragging = false;
            container.classList.remove('cm-dragging');
        });

        renderAccesoriosEnAvatar();
        aplicarModo();
        aplicarTamano();
        cambiarVisema('REST');

        (async function() {
            const terminosOk = await verificarTerminos();
            if (terminosOk) {
                setTimeout(function() {
                    if (window.CapitanMaizAnim && typeof window.CapitanMaizAnim.iniciar === 'function') {
                        window.CapitanMaizAnim.iniciar();
                    }
                }, 500);
            }
        })();

        log('Widget v1.0 creado (placeholder SVG)');
    }

    function setEstado(e) {
        if (container) container.setAttribute('data-estado', e);
        if (window.CapitanMaizAnim && typeof window.CapitanMaizAnim.setEstado === 'function') {
            window.CapitanMaizAnim.setEstado(e);
        }
    }

    function mostrarBurbuja(texto) {
        if (!config.mostrar_subtitulos) return;
        if (!bubble) return;
        const t = document.getElementById('cm-bubble-text');
        const corto = texto.length > 160 ? texto.slice(0, 157) + '…' : texto;
        if (t) t.textContent = corto;
        bubble.classList.add('cm-bubble-visible');
    }

    function ocultarBurbuja() {
        if (bubble) bubble.classList.remove('cm-bubble-visible');
    }

    function detenerConversacion() {
        conversacionActiva = false;
        conversationToken++;
        detenerTTS();
        detenerReconocimiento();
        detenerAnimacionBoca();
        setEstado('idle');
        ocultarBurbuja();
    }

    async function onAvatarTap() {
        if (isSpeaking || isListening || procesando) {
            detenerConversacion();
            return;
        }
        conversacionActiva = !!config.conversacion;
        const ok = iniciarReconocimiento();
        if (!ok) {
            conversacionActiva = false;
            if (config.mostrar_subtitulos) {
                mostrarBurbuja('Tu navegador no soporta reconocimiento de voz.');
                setTimeout(ocultarBurbuja, 4000);
            }
        }
    }

    async function hablar(texto) {
        if (!texto) return false;
        detenerTTS();
        const miToken = ++ttsToken;

        const estilo = VOZ_ESTILOS[config.estilo_voz] || VOZ_ESTILOS.sabio;
        const pitchBase = TONO_PITCH[config.tono] || 1.0;
        const rate = estilo.rate * (config.velocidad || 1.0);
        const pitch = estilo.pitch * pitchBase;
        const volumen = Math.max(0, Math.min(1, config.volumen || 1.0));

        if (config.mostrar_subtitulos) mostrarBurbuja(texto);
        isSpeaking = true;
        setEstado('hablando');

        animarBoca(texto, rate);

        let ok = false;
        const ttsBackendDisponible = (Date.now() - _ttsBackendFalloEn > TTS_FALLO_TTL_MS);
        if (texto.length <= 300 && window.getSupabase && ttsBackendDisponible) {
            try {
                const sb = window.getSupabase();
                const s = await sb.auth.getSession();
                if (s.data.session && miToken === ttsToken) {
                    const resp = await fetch('/api/ai/voice/tts', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + s.data.session.access_token
                        },
                        body: JSON.stringify({
                            text: texto,
                            rate: rate,
                            pitch: pitch,
                            character: 'capitan-maiz' // 🆕 el backend puede diferenciar la voz
                        })
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        const url = data.audio_url || data.audioUrl;
                        if (url && miToken === ttsToken) { ok = true; await reproducirAudio(url); }
                    } else {
                        _ttsBackendFalloEn = Date.now();
                    }
                }
            } catch (e) {
                _ttsBackendFalloEn = Date.now();
            }
        }

        if (!ok && miToken === ttsToken) {
            await hablarNavegador(texto, rate, pitch, volumen, miToken);
        }

        const completo = (miToken === ttsToken);
        if (completo) {
            isSpeaking = false;
            setEstado('idle');
            detenerAnimacionBoca();
            setTimeout(function() {
                if (!isSpeaking && !isListening && !procesando) ocultarBurbuja();
            }, 2500);
        }
        return completo;
    }

    function dividirEnFrases(texto) {
        const partes = texto.split(/(?<=[.!?…\n])\s+/);
        const out = [];
        let acc = '';
        partes.forEach(function(p) {
            if ((acc + ' ' + p).length > 170 && acc) { out.push(acc.trim()); acc = p; }
            else acc = acc ? acc + ' ' + p : p;
        });
        if (acc.trim()) out.push(acc.trim());
        return out;
    }

    async function hablarNavegador(texto, rate, pitch, volumen, miToken) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const frases = dividirEnFrases(texto);
        for (let i = 0; i < frases.length; i++) {
            if (miToken !== ttsToken) return;
            await new Promise(function(resolve) {
                const u = new SpeechSynthesisUtterance(frases[i]);
                u.lang = config.idioma || 'es-MX';
                u.rate = Math.max(0.5, Math.min(2, rate));
                u.pitch = Math.max(0.5, Math.min(2, pitch));
                u.volume = volumen;
                u.onend = resolve;
                u.onerror = resolve;
                window.speechSynthesis.speak(u);
            });
        }
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
        ttsToken++;
        try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
        if (audioActual) { try { audioActual.pause(); } catch (e) {} audioActual = null; }
        isSpeaking = false;
        detenerAnimacionBoca();
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
            recibioResultado = false;

            recognition.onstart = function() {
                recognitionActive = true;
                isListening = true;
                setEstado('escuchando');
            };

            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript.trim();
                if (!transcript) return;
                recibioResultado = true;
                const lower = transcript.toLowerCase();

                if (/(adiós|adios|hasta luego|nos vemos|ya no|nos vidrios)/.test(lower) && lower.length < 30) {
                    conversacionActiva = false;
                    historialLocal.push({ role: 'user', content: transcript, ts: Date.now() });
                    hablar('¡Nos vidrios, paisano! Aquí andaré cuando me necesites.').then(function() { guardarHistorial(); });
                    return;
                }

                if (/(olvida (todo|lo que hablamos)|borra (la )?conversaci[oó]n|empecemos de nuevo)/.test(lower)) {
                    olvidarTodo();
                    hablar('Listo, borrón y cuenta nueva. Empecemos de cero.').then(function() {
                        if (conversacionActiva) iniciarReconocimiento();
                    });
                    return;
                }

                procesarComando(transcript);
            };

            recognition.onerror = function(event) {
                recognitionActive = false;
                isListening = false;
                recognition = null;
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    conversacionActiva = false;
                    setEstado('idle');
                    if (config.mostrar_subtitulos) {
                        mostrarBurbuja('Permite el micrófono, paisano.');
                        setTimeout(ocultarBurbuja, 5000);
                    }
                } else if (event.error === 'no-speech' || event.error === 'aborted') {
                    conversacionActiva = false;
                    setEstado('idle');
                } else {
                    setEstado('idle');
                }
            };

            recognition.onend = function() {
                recognitionActive = false;
                isListening = false;
                recognition = null;
                if (!procesando && !isSpeaking) { setEstado('idle'); }
                if (!recibioResultado && !procesando && !isSpeaking) conversacionActiva = false;
            };

            recognition.start();
            return true;
        } catch (e) { return false; }
    }

    function detenerReconocimiento() {
        if (recognition && recognitionActive) {
            try { recognition.abort ? recognition.abort() : recognition.stop(); } catch (e) {}
        }
        recognitionActive = false;
        isListening = false;
    }

    async function procesarComando(texto) {
        if (!texto) return;
        const miConversacionToken = ++conversationToken;

        procesando = true;
        setEstado('pensando');
        cambiarVisema('M');

        try {
            historialLocal.push({ role: 'user', content: texto, ts: Date.now() });

            let respuesta = '';
            if (window.CapitanMaizBrain && typeof window.CapitanMaizBrain.preguntar === 'function') {
                try {
                    const historialTruncado = historialLocal.slice(-HIST_MAX_ENVIO);
                    respuesta = await window.CapitanMaizBrain.preguntar(texto, historialTruncado);
                } catch (e) {
                    respuesta = 'Ay, paisano. Tuve un cortocircuito en el sombrero. ¿Me repites?';
                }
            } else {
                respuesta = 'Ahorita no puedo pensar, pero aquí sigo, firme como el maíz.';
            }

            if (miConversacionToken !== conversationToken) return;
            if (!respuesta) respuesta = 'No supe qué decirte, pero aquí andamos.';

            historialLocal.push({ role: 'assistant', content: respuesta, ts: Date.now() });
            guardarHistorial();

            procesando = false;
            const completo = await hablar(respuesta);

            if (completo && conversacionActiva && miConversacionToken === conversationToken) {
                recibioResultado = false;
                setTimeout(function() {
                    if (conversacionActiva && !isSpeaking && !isListening && !procesando) {
                        iniciarReconocimiento();
                    }
                }, 300);
            }
        } catch (e) {
            console.error('[Capitán Maíz] Error en procesarComando:', e);
        } finally {
            procesando = false;
            if (!isSpeaking && !isListening) setEstado('idle');
        }
    }

    function instalarVisibility() {
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) detenerConversacion();
        });
    }

    window.CapitanMaiz = {
        hablar: hablar,
        procesar: procesarComando,
        olvidar: olvidarTodo,
        recargarAccesorios: async function() {
            await cargarAccesorios();
            renderAccesoriosEnAvatar();
        },
        setModoSubtitulos: function(activo) {
            config.mostrar_subtitulos = !!activo;
            guardarConfig();
            aplicarModo();
        },
        getModoSubtitulos: function() { return !!config.mostrar_subtitulos; },
        getHistorial: function() { return historialLocal.slice(); },
        getConfig: function() { return { ...config }; },
        setConfig: function(nuevos) {
            config = { ...config, ...nuevos };
            guardarConfig();
            aplicarModo();
            aplicarTamano();
        },
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
        getUserInfo: function() { return userInfo; },
        _visemasDisponibles: function() { return Object.keys(VISEMAS_SVG); },
        reiniciarTerminos: function() {
            try { localStorage.removeItem(TERMINOS_KEY); } catch (e) {}
        },
        getTerminosVersion: function() { return TERMINOS_VERSION; }
    };

    async function init() {
        if (rutaExcluida()) return;
        cargarConfig();
        if (!config.activo) return;

        await cargarUsuario();
        cargarHistorial();
        await cargarAccesorios();
        crearWidget();
        instalarVisibility();
        log('✅ Capitán Maíz v1.0 activo');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();