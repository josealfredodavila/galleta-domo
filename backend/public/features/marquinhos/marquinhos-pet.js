// ================================================================
// MARQUINHOS · PET v8.2
// arrastrable + memoria + conversación continua + accesorios
// + MODO SOLO VOZ / SUBTÍTULOS
// + BOCA DINÁMICA POR VISEMAS
// + SISTEMA DISNEY DE ANIMACIONES
// + MODAL DE ACEPTACIÓN DE TÉRMINOS DE USO
// + ✅ v8.2: TAMAÑO CONFIGURABLE POR EL USUARIO (60% - 150%)
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
        '/actualizar-contrasena',
        '/features/marquinhos/tienda'
    ];

    const CONFIG_DEFAULT = {
        activo: true,
        estilo_voz: 'natural',
        velocidad: 1.0,
        tono: 'medio',
        volumen: 1.0,
        timeout_seg: 20,
        manos_libres: false,
        conversacion: true,
        mostrar_subtitulos: false,
        idioma: null,
        posicion_x: null,
        posicion_y: null,
        tamano: 100   // ✅ v8.2: tamaño del muñeco (60 - 150, %)
    };

    const VOZ_ESTILOS = {
        natural:  { rate: 1.0,  pitch: 1.0 },
        calida:   { rate: 0.95, pitch: 0.95 },
        energica: { rate: 1.15, pitch: 1.1 },
        serena:   { rate: 0.85, pitch: 0.9 }
    };

    const TONO_PITCH = { grave: 0.85, medio: 1.0, agudo: 1.15 };

    const HIST_MAX = 40;
    const HIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const HIST_KEY = 'marquinhos_hist_';
    const ACC_KEY = 'marquinhos_accesorios_equipados';

    // ✅ Versión de los términos (si cambia, vuelve a mostrarse el modal)
    const TERMINOS_VERSION = '1.0';
    const TERMINOS_KEY = 'marquinhos_terminos_aceptados_' + TERMINOS_VERSION;

    // ============================================================
    // FORMAS DE BOCA (paths SVG por visema)
    // ============================================================
    var VISEMAS_SVG = {
        REST: 'M 85 108 Q 100 114 115 108',
        A:    'M 80 105 Q 100 132 120 105 Q 100 138 80 105',
        E:    'M 82 108 Q 100 120 118 108 Q 100 122 82 108',
        I:    'M 78 108 Q 100 114 122 108',
        O:    'M 100 100 Q 118 100 118 112 Q 118 124 100 124 Q 82 124 82 112 Q 82 100 100 100 Z',
        U:    'M 100 105 Q 112 105 112 113 Q 112 120 100 120 Q 88 120 88 113 Q 88 105 100 105 Z',
        M:    'M 82 110 L 118 110'
    };

    let config = { ...CONFIG_DEFAULT };
    let container = null;
    let bubble = null;
    let dots = null;
    let bocaEl = null;
    let isSpeaking = false;
    let isListening = false;
    let recognition = null;
    let recognitionActive = false;
    let audioActual = null;
    let historialLocal = [];
    let userInfo = null;
    let ttsToken = 0;
    let conversacionActiva = false;
    let procesando = false;
    let recibioResultado = false;
    let accesoriosEquipados = [];

    // Animación de boca
    var _bocaTimeouts = [];
    var _bocaActiva = false;

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

    function esc(v) {
        const d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }

    function cargarConfig() {
        try {
            const g = localStorage.getItem('marquinhos_config');
            if (g) config = { ...CONFIG_DEFAULT, ...JSON.parse(g) };
        } catch (e) {}
    }

    function guardarConfig() {
        try { localStorage.setItem('marquinhos_config', JSON.stringify(config)); } catch (e) {}
    }

    // ============================================================
    // ✅ v8.2: APLICAR TAMAÑO DEL MUÑECO
    // ============================================================
    function aplicarTamano() {
        if (!container) return;

        const porcentaje = (config.tamano != null ? config.tamano : 100) / 100;
        const baseAncho = 90;
        const baseAlto = 130;
        const ancho = Math.round(baseAncho * porcentaje);
        const alto = Math.round(baseAlto * porcentaje);

        // Setear las variables CSS que usa marquinhos-pet.css
        container.style.setProperty('--mq-pet-ancho', ancho + 'px');
        container.style.setProperty('--mq-pet-alto', alto + 'px');

        // También aplicar directamente al container y al avatar por seguridad
        container.style.width = ancho + 'px';
        container.style.height = alto + 'px';

        const avatar = document.getElementById('mq-avatar');
        if (avatar) {
            avatar.style.width = ancho + 'px';
            avatar.style.height = alto + 'px';
        }
    }

    // ============================================================
    // MODO: VOZ o SUBTÍTULOS
    // ============================================================
    function aplicarModo() {
        if (!container) return;
        if (config.mostrar_subtitulos) {
            container.classList.remove('mq-modo-voz');
        } else {
            container.classList.add('mq-modo-voz');
        }
    }

    // ============================================================
    // MEMORIA
    // ============================================================
    function cargarHistorial() {
        try {
            const raw = localStorage.getItem(HIST_KEY + (userInfo ? userInfo.id : 'anon'));
            if (!raw) { historialLocal = []; return; }
            const arr = JSON.parse(raw);
            const limite = Date.now() - HIST_TTL_MS;
            historialLocal = (Array.isArray(arr) ? arr : [])
                .filter(m => m && m.content && m.ts && m.ts > limite)
                .slice(-HIST_MAX);
        } catch (e) { historialLocal = []; }
    }

    function guardarHistorial() {
        try {
            historialLocal = historialLocal.slice(-HIST_MAX);
            localStorage.setItem(
                HIST_KEY + (userInfo ? userInfo.id : 'anon'),
                JSON.stringify(historialLocal)
            );
        } catch (e) {}
    }

    function olvidarTodo() {
        historialLocal = [];
        try { localStorage.removeItem(HIST_KEY + (userInfo ? userInfo.id : 'anon')); } catch (e) {}
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

    // ============================================================
    // ACCESORIOS
    // ============================================================
    async function cargarAccesorios() {
        try {
            const cached = JSON.parse(localStorage.getItem(ACC_KEY) || '[]');
            if (Array.isArray(cached)) accesoriosEquipados = cached;
        } catch (e) {
            accesoriosEquipados = [];
        }

        try {
            if (!window.getSupabase) return;
            const sb = window.getSupabase();
            const r = await sb.auth.getSession();
            if (!r.data.session) return;
            const uid = r.data.session.user.id;

            const { data, error } = await sb
                .from('marquinhos_inventario')
                .select(`
                    accesorio_id,
                    equipado,
                    marquinhos_accesorios!inner (
                        nombre, categoria, svg_data
                    )
                `)
                .eq('usuario_id', uid)
                .eq('equipado', true);

            if (error) return;

            if (Array.isArray(data)) {
                accesoriosEquipados = data.map(d => ({
                    id: d.accesorio_id,
                    categoria: d.marquinhos_accesorios?.categoria || 'accesorio',
                    svg: d.marquinhos_accesorios?.svg_data || '',
                    nombre: d.marquinhos_accesorios?.nombre || ''
                }));
                localStorage.setItem(ACC_KEY, JSON.stringify(accesoriosEquipados));
            }
        } catch (e) {}
    }

    function posicionPorCategoria(cat) {
        switch (cat) {
            case 'sombrero':   return { x: 100, y: 35,  size: 70 };
            case 'playera':    return { x: 100, y: 195, size: 90 };
            case 'pantalon':   return { x: 100, y: 235, size: 70 };
            case 'zapatos':    return { x: 100, y: 258, size: 60 };
            case 'lentes':     return { x: 100, y: 82,  size: 60 };
            case 'accesorio':  return { x: 175, y: 195, size: 60 };
            default:           return { x: 100, y: 100, size: 50 };
        }
    }

    function renderAccesoriosEnAvatar() {
        const layer = document.getElementById('mq-acc-layer');
        if (!layer) return;
        layer.innerHTML = accesoriosEquipados.map(a => {
            const p = posicionPorCategoria(a.categoria);
            return `<text x="${p.x}" y="${p.y}" font-size="${p.size}" text-anchor="middle">${esc(a.svg)}</text>`;
        }).join('');
    }

    // ============================================================
    // ANIMACIÓN DE BOCA
    // ============================================================
    function detenerAnimacionBoca() {
        _bocaActiva = false;
        _bocaTimeouts.forEach(function(t) { clearTimeout(t); });
        _bocaTimeouts = [];
        if (bocaEl) {
            bocaEl.setAttribute('d', VISEMAS_SVG.REST);
        }
    }

    function cambiarVisema(nombre) {
        if (!bocaEl) return;
        var d = VISEMAS_SVG[nombre] || VISEMAS_SVG.REST;
        bocaEl.setAttribute('d', d);
    }

    function animarBoca(texto, rate) {
        detenerAnimacionBoca();
        if (!bocaEl) return;
        if (!window.MarquinhosBoca) {
            animarBocaRandom();
            return;
        }

        var visemas = window.MarquinhosBoca.analizar(texto);
        if (!visemas || !visemas.length) {
            animarBocaRandom();
            return;
        }

        _bocaActiva = true;
        var rateFactor = rate || 1.0;
        var tiempo = 0;

        visemas.forEach(function(v) {
            var dur = v.duracion / rateFactor;
            var t = setTimeout(function() {
                if (!_bocaActiva) return;
                cambiarVisema(v.visema);
                if (window.MarquinhosAnim && typeof window.MarquinhosAnim.squash === 'function') {
                    window.MarquinhosAnim.squash();
                }
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
        var visemas = ['A', 'E', 'I', 'O', 'U'];
        var idx = 0;

        function siguiente() {
            if (!_bocaActiva || !bocaEl) return;
            cambiarVisema(visemas[idx % visemas.length]);
            idx++;
            var t = setTimeout(siguiente, 80 + Math.random() * 60);
            _bocaTimeouts.push(t);
        }
        siguiente();
    }

    // ============================================================
    // MODAL DE ACEPTACIÓN DE TÉRMINOS
    // ============================================================
    function mostrarModalTerminos() {
        if (document.getElementById('mq-modal-terminos')) return;

        const modal = document.createElement('div');
        modal.id = 'mq-modal-terminos';
        modal.innerHTML = `
            <div class="mq-modal-overlay">
                <div class="mq-modal-content">
                    <h2>◈ Términos de Uso de Marquinhos</h2>
                    <div class="mq-modal-body">
                        <p>Antes de comenzar a hablar con Marquinhos, es importante que conozcas lo siguiente:</p>
                        <ul>
                            <li><strong>Marquinhos es una IA</strong>, no un humano ni un profesional de la salud, legal o financiero.</li>
                            <li><strong>Puede cometer errores.</strong> Verifica siempre la información importante.</li>
                            <li><strong>No reemplaza a un terapeuta, médico o asesor profesional.</strong></li>
                            <li><strong>No genera contenido sexual, gore ni relaciones románticas.</strong></li>
                            <li><strong>Respeta los derechos de autor</strong> y no reproduce material protegido.</li>
                            <li><strong>Tu memoria es privada.</strong> Cada usuario tiene su propia burbuja de recuerdos aislada.</li>
                            <li><strong>Edad mínima: 13 años.</strong></li>
                        </ul>
                        <p>Al continuar, aceptas los <a href="/legal/terminos-marquinhos" target="_blank" rel="noopener">Términos de Uso completos</a>.</p>
                    </div>
                    <div class="mq-modal-actions">
                        <button id="mq-btn-aceptar" class="mq-btn-aceptar" type="button">Acepto y continúo</button>
                        <button id="mq-btn-rechazar" class="mq-btn-rechazar" type="button">No acepto</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        if (container) container.style.display = 'none';

        document.getElementById('mq-btn-aceptar').addEventListener('click', function() {
            localStorage.setItem(TERMINOS_KEY, 'true');
            modal.remove();
            if (container) container.style.display = '';
            if (window.MarquinhosAnim && typeof window.MarquinhosAnim.iniciar === 'function') {
                window.MarquinhosAnim.iniciar();
            }
            log('✅ Términos aceptados. Pet activado.');
        });

        document.getElementById('mq-btn-rechazar').addEventListener('click', function() {
            modal.remove();
            if (container) container.style.display = 'none';
            log('❌ Usuario rechazó los términos. Pet oculto.');
        });
    }

    function verificarTerminos() {
        try {
            const aceptados = localStorage.getItem(TERMINOS_KEY);
            if (!aceptados) {
                mostrarModalTerminos();
                return false;
            }
            return true;
        } catch (e) {
            return true;
        }
    }

    // ============================================================
    // WIDGET
    // ============================================================
    function crearWidget() {
        if (document.getElementById('marquinhos-pet')) return;

        container = document.createElement('div');
        container.id = 'marquinhos-pet';
        container.className = 'mq-pet';

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

            <div class="mq-pet-bubble-dots" id="mq-dots">
                <span class="mq-dot"></span>
                <span class="mq-dot"></span>
                <span class="mq-dot"></span>
            </div>

            <div class="mq-pet-avatar" id="mq-avatar" role="button" tabindex="0" aria-label="Hablar con Marquinhos">
                <svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" class="mq-pet-svg">
                    <g id="mq-acc-layer"></g>
                    <g id="mq-cuerpo">
                        <line x1="70" y1="40" x2="68" y2="20" stroke="#1565C0" stroke-width="3" stroke-linecap="round"/>
                        <circle cx="68" cy="16" r="6" fill="#FFF8E1" stroke="#1565C0" stroke-width="2"/>
                        <line x1="130" y1="40" x2="132" y2="20" stroke="#1565C0" stroke-width="3" stroke-linecap="round"/>
                        <circle cx="132" cy="16" r="6" fill="#FFF8E1" stroke="#1565C0" stroke-width="2"/>
                        <ellipse cx="100" cy="80" rx="62" ry="56" fill="#FFF8E1" stroke="#1565C0" stroke-width="3"/>
                        
                        <ellipse id="mq-ojo-izq" cx="76" cy="80" rx="14" ry="16" fill="#1A0A2E"/>
                        <ellipse cx="76" cy="80" rx="12" ry="13" fill="#F5F0E8"/>
                        <circle id="mq-pupila-izq" cx="76" cy="82" r="6" fill="#0a1a3e"/>
                        <circle id="mq-brillo-izq" cx="74" cy="79" r="2" fill="#fff" opacity="0.9"/>
                        <ellipse id="mq-ojo-der" cx="124" cy="80" rx="14" ry="16" fill="#1A0A2E"/>
                        <ellipse cx="124" cy="80" rx="12" ry="13" fill="#F5F0E8"/>
                        <circle id="mq-pupila-der" cx="124" cy="82" r="6" fill="#0a1a3e"/>
                        <circle id="mq-brillo-der" cx="122" cy="79" r="2" fill="#fff" opacity="0.9"/>
                        
                        <path id="mq-boca" class="mq-pet-boca"
                              d="M 85 108 Q 100 114 115 108"
                              stroke="#1565C0" stroke-width="3"
                              fill="none" stroke-linecap="round"/>
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
                    </g>
                </svg>
            </div>
        `;

        document.body.appendChild(container);
        try { document.body.style.overflowX = 'visible'; } catch (e) {}

        bubble = document.getElementById('mq-bubble');
        dots = document.getElementById('mq-dots');
        bocaEl = document.getElementById('mq-boca');

        const avatar = document.getElementById('mq-avatar');

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
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;
            if (!hasMoved) return;

            // ✅ v8.2: usar el tamaño actual para los límites
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
            container.classList.remove('mq-dragging');
            try { avatar.releasePointerCapture(e.pointerId); } catch (err) {}
            if (hasMoved) {
                const rect = container.getBoundingClientRect();
                config.posicion_x = rect.left;
                config.posicion_y = rect.top;
                guardarConfig();
            }
        });

        avatar.addEventListener('pointercancel', function() {
            isDragging = false;
            container.classList.remove('mq-dragging');
        });

        renderAccesoriosEnAvatar();
        aplicarModo();
        aplicarTamano();   // ✅ v8.2: aplicar el tamaño configurado

        const terminosOk = verificarTerminos();

        if (terminosOk) {
            setTimeout(function() {
                if (window.MarquinhosAnim && typeof window.MarquinhosAnim.iniciar === 'function') {
                    window.MarquinhosAnim.iniciar();
                }
            }, 500);
        }

        log('Widget creado con Términos v8.2 (tamaño configurable)');
    }

    // ============================================================
    // BURBUJITAS
    // ============================================================
    function mostrarDots() {
        if (dots) dots.classList.add('mq-dots-visible');
    }

    function ocultarDots() {
        if (dots) dots.classList.remove('mq-dots-visible');
    }

    // ============================================================
    // BURBUJA
    // ============================================================
    function setEstado(e) {
        if (container) container.setAttribute('data-estado', e);
        if (window.MarquinhosAnim && typeof window.MarquinhosAnim.setEstado === 'function') {
            window.MarquinhosAnim.setEstado(e);
        }
    }

    function mostrarBurbuja(texto) {
        if (!config.mostrar_subtitulos) return;
        if (!bubble) return;
        const t = document.getElementById('mq-bubble-text');
        const corto = texto.length > 160 ? texto.slice(0, 157) + '…' : texto;
        if (t) t.textContent = corto;
        bubble.classList.add('mq-bubble-visible');
    }

    function ocultarBurbuja() {
        if (bubble) bubble.classList.remove('mq-bubble-visible');
    }

    // ============================================================
    // TAP
    // ============================================================
    function detenerConversacion() {
        conversacionActiva = false;
        detenerTTS();
        detenerReconocimiento();
        detenerAnimacionBoca();
        setEstado('idle');
        ocultarBurbuja();
        ocultarDots();
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

    // ============================================================
    // VOZ
    // ============================================================
    async function hablar(texto) {
        if (!texto) return false;
        detenerTTS();
        const miToken = ++ttsToken;

        const estilo = VOZ_ESTILOS[config.estilo_voz] || VOZ_ESTILOS.natural;
        const pitchBase = TONO_PITCH[config.tono] || 1.0;
        const rate = estilo.rate * (config.velocidad || 1.0);
        const pitch = estilo.pitch * pitchBase;
        const volumen = Math.max(0, Math.min(1, config.volumen || 1.0));

        if (config.mostrar_subtitulos) mostrarBurbuja(texto);
        mostrarDots();
        isSpeaking = true;
        setEstado('hablando');

        if (window.MarquinhosAnim && typeof window.MarquinhosAnim.anticipar === 'function') {
            window.MarquinhosAnim.anticipar();
        }

        animarBoca(texto, rate);

        let ok = false;
        if (texto.length <= 300 && window.getSupabase && !window.__marquinhosNoBackendTTS) {
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
                        body: JSON.stringify({ text: texto, rate: rate, pitch: pitch })
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        const url = data.audio_url || data.audioUrl;
                        if (url && miToken === ttsToken) {
                            ok = true;
                            await reproducirAudio(url);
                        }
                    } else {
                        window.__marquinhosNoBackendTTS = true;
                    }
                }
            } catch (e) {
                window.__marquinhosNoBackendTTS = true;
            }
        }

        if (!ok && miToken === ttsToken) {
            await hablarNavegador(texto, rate, pitch, volumen, miToken);
        }

        const completo = (miToken === ttsToken);
        if (completo) {
            isSpeaking = false;
            setEstado('idle');
            ocultarDots();
            detenerAnimacionBoca();
            setTimeout(function() {
                if (!isSpeaking && !isListening && !procesando) {
                    ocultarBurbuja();
                }
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
        ocultarDots();
        detenerAnimacionBoca();
    }

    // ============================================================
    // RECONOCIMIENTO
    // ============================================================
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
                mostrarDots();
            };

            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript.trim();
                if (!transcript) return;
                recibioResultado = true;
                const lower = transcript.toLowerCase();

                if (/(adiós|adios|hasta luego|nos vemos|ya no)/.test(lower) && lower.length < 30) {
                    conversacionActiva = false;
                    historialLocal.push({ role: 'user', content: transcript, ts: Date.now() });
                    hablar('¡Hasta luego!').then(function() { guardarHistorial(); });
                    return;
                }

                if (/(olvida (todo|lo que hablamos)|borra (la )?conversaci[oó]n|empecemos de nuevo)/.test(lower)) {
                    olvidarTodo();
                    hablar('Listo, empezamos de cero.').then(function() {
                        if (conversacionActiva) iniciarReconocimiento();
                    });
                    return;
                }

                procesarComando(transcript);
            };

            recognition.onerror = function(event) {
                recognitionActive = false;
                isListening = false;
                ocultarDots();
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    conversacionActiva = false;
                    setEstado('idle');
                    if (config.mostrar_subtitulos) {
                        mostrarBurbuja('Permite el micrófono.');
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
                if (!procesando && !isSpeaking) {
                    setEstado('idle');
                    ocultarDots();
                }
                if (!recibioResultado && !procesando && !isSpeaking) {
                    conversacionActiva = false;
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
            try { recognition.abort ? recognition.abort() : recognition.stop(); } catch (e) {}
        }
        recognitionActive = false;
        isListening = false;
    }

    // ============================================================
    // PROCESAR
    // ============================================================
    async function procesarComando(texto) {
        if (!texto) return;
        procesando = true;
        setEstado('pensando');
        mostrarDots();

        if (bocaEl) cambiarVisema('E');

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
        guardarHistorial();

        procesando = false;
        const completo = await hablar(respuesta);

        if (completo && conversacionActiva) {
            recibioResultado = false;
            setTimeout(function() {
                if (conversacionActiva && !isSpeaking && !isListening && !procesando) {
                    iniciarReconocimiento();
                }
            }, 300);
        }
    }

    function instalarVisibility() {
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) detenerConversacion();
        });
    }

    // ============================================================
    // ✅ v8.2: ESCUCHAR CAMBIOS EN LOCALSTORAGE
    // ============================================================
    window.addEventListener('storage', function(e) {
        if (e.key === 'marquinhos_config') {
            cargarConfig();
            aplicarModo();
            aplicarTamano();   // ✅ v8.2: aplicar tamaño si cambió
        }
        if (e.key === ACC_KEY) {
            try {
                accesoriosEquipados = JSON.parse(e.newValue || '[]');
                renderAccesoriosEnAvatar();
            } catch (err) {}
        }
    });

    // ============================================================
    // API PÚBLICA
    // ============================================================
    window.Marquinhos = {
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
            aplicarTamano();   // ✅ v8.2: aplicar tamaño si cambió
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
            log('Términos reiniciados. El modal aparecerá de nuevo.');
        },
        getTerminosVersion: function() { return TERMINOS_VERSION; },
        // ✅ v8.2: métodos nuevos para el tamaño
        setTamano: function(porcentaje) {
            config.tamano = Math.max(60, Math.min(150, parseInt(porcentaje, 10) || 100));
            guardarConfig();
            aplicarTamano();
        },
        getTamano: function() { return config.tamano != null ? config.tamano : 100; }
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
        log('✅ Listo. Disney v8.2 activo (con términos + tamaño configurable). Mensajes: ' + historialLocal.length + ' · Accesorios: ' + accesoriosEquipados.length + ' · Tamaño: ' + (config.tamano || 100) + '%');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();