// ================================================================
// MARQUINHOS · PET v9.5 "GALACTIC PRO"
// FASE 1: usa marquinhos-fit.js para coordenadas compartidas
// Manos iguales a la tienda (claras) · Brazos y piernas mejorados
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
        tamano: 100
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

    const TERMINOS_VERSION = '1.0';
    const TERMINOS_KEY = 'marquinhos_terminos_aceptados_' + TERMINOS_VERSION;

    var VISEMAS_SVG = {
        REST: 'M 80 138 Q 100 148 120 138',
        A:    'M 70 134 Q 100 130 130 134 Q 126 154 100 154 Q 74 154 70 134 Z',
        E:    'M 72 137 Q 100 134 128 137 Q 122 150 100 150 Q 78 150 72 137 Z',
        I:    'M 74 139 Q 100 143 126 139 Q 100 148 74 139 Z',
        O:    'M 100 132 Q 116 132 116 143 Q 116 154 100 154 Q 84 154 84 143 Q 84 132 100 132 Z',
        U:    'M 100 135 Q 111 135 111 143 Q 111 151 100 151 Q 89 151 89 143 Q 89 135 100 135 Z',
        M:    'M 82 140 L 118 140'
    };
    var VISEMAS_SIN_RELLENO = { REST: true, M: true };

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
    let conversacionActiva = false;
    let procesando = false;
    let recibioResultado = false;
    let accesoriosEquipados = [];

    var _bocaTimeouts = [];
    var _bocaActiva = false;

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

    function aplicarTamano() {
        if (!container) return;
        const porcentaje = (config.tamano != null ? config.tamano : 100) / 100;
        const ancho = Math.round(90 * porcentaje);
        const alto = Math.round(130 * porcentaje);

        container.style.setProperty('--mq-pet-ancho', ancho + 'px');
        container.style.setProperty('--mq-pet-alto', alto + 'px');
        container.style.width = ancho + 'px';
        container.style.height = alto + 'px';

        const avatar = document.getElementById('mq-avatar');
        if (avatar) {
            avatar.style.width = ancho + 'px';
            avatar.style.height = alto + 'px';
        }
    }

    function aplicarModo() {
        if (!container) return;
        if (config.mostrar_subtitulos) {
            container.classList.remove('mq-modo-voz');
        } else {
            container.classList.add('mq-modo-voz');
        }
    }

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
                .eq('id', uid).maybeSingle();
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
                .from('marquinhos_inventario')
                .select(`accesorio_id, equipado, marquinhos_accesorios!inner (nombre, categoria, svg_data)`)
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

    // ============================================================
    // ✅ v9.5: usa el sistema compartido marquinhos-fit.js
    // ============================================================
    function posicionPorCategoria(cat) {
        if (window.MarquinhosFit && typeof window.MarquinhosFit.getCategoria === 'function') {
            const fit = window.MarquinhosFit.getCategoria(cat);
            return { x: fit.x, y: fit.y, size: fit.size };
        }
        // Fallback por si marquinhos-fit.js no carga
        return { x: 100, y: 100, size: 55 };
    }

    function renderAccesoriosEnAvatar() {
        const layer = document.getElementById('mq-acc-layer');
        if (!layer) return;
        layer.innerHTML = accesoriosEquipados.map(a => {
            const p = posicionPorCategoria(a.categoria);
            return `<text x="${p.x}" y="${p.y}" font-size="${p.size}" text-anchor="middle">${esc(a.svg)}</text>`;
        }).join('');
    }

    function cambiarVisema(nombre) {
        if (!bocaEl) return;
        var key = VISEMAS_SVG[nombre] ? nombre : 'REST';
        bocaEl.setAttribute('d', VISEMAS_SVG[key]);
        bocaEl.setAttribute('fill', VISEMAS_SIN_RELLENO[key] ? 'none' : '#0a1a3e');
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
        if (!window.MarquinhosBoca) { animarBocaRandom(); return; }

        var visemas = window.MarquinhosBoca.analizar(texto);
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
            log('✅ Términos aceptados.');
        });

        document.getElementById('mq-btn-rechazar').addEventListener('click', function() {
            modal.remove();
            if (container) container.style.display = 'none';
            log('❌ Términos rechazados.');
        });
    }

    function verificarTerminos() {
        try {
            const aceptados = localStorage.getItem(TERMINOS_KEY);
            if (!aceptados) { mostrarModalTerminos(); return false; }
            return true;
        } catch (e) { return true; }
    }

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

            <div class="mq-pet-avatar" id="mq-avatar" role="button" tabindex="0" aria-label="Hablar con Marquinhos">
                <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" class="mq-pet-svg">
                    <defs>
                        <linearGradient id="mq-grad-cabeza" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#FFFFFF"/>
                            <stop offset="50%" stop-color="#D4EEFF"/>
                            <stop offset="100%" stop-color="#C9D8FF"/>
                        </linearGradient>

                        <linearGradient id="mq-grad-cuerpo" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#B8ECFF"/>
                            <stop offset="40%" stop-color="#C9BCFF"/>
                            <stop offset="100%" stop-color="#B69CFF"/>
                        </linearGradient>

                        <radialGradient id="mq-grad-antena-on" cx="50%" cy="50%">
                            <stop offset="0%" stop-color="#FFFFFF"/>
                            <stop offset="30%" stop-color="#00E5FF"/>
                            <stop offset="70%" stop-color="#7C4DFF"/>
                            <stop offset="100%" stop-color="#5E35B1"/>
                        </radialGradient>

                        <radialGradient id="mq-grad-antena-off" cx="50%" cy="50%">
                            <stop offset="0%" stop-color="#B0C4DE"/>
                            <stop offset="70%" stop-color="#7A8FA8"/>
                            <stop offset="100%" stop-color="#5A6B82"/>
                        </radialGradient>

                        <radialGradient id="mq-grad-iris" cx="50%" cy="45%">
                            <stop offset="0%" stop-color="#9CF6FF"/>
                            <stop offset="55%" stop-color="#00C8FF"/>
                            <stop offset="100%" stop-color="#0277BD"/>
                        </radialGradient>

                        <linearGradient id="mq-grad-bota" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#7C4DFF"/>
                            <stop offset="100%" stop-color="#00C8FF"/>
                        </linearGradient>

                        <radialGradient id="mq-grad-aura" cx="50%" cy="50%">
                            <stop offset="0%" stop-color="#7C4DFF" stop-opacity="0.55"/>
                            <stop offset="100%" stop-color="#7C4DFF" stop-opacity="0"/>
                        </radialGradient>
                    </defs>

                    <ellipse cx="100" cy="160" rx="85" ry="120" fill="url(#mq-grad-aura)" opacity="0.6">
                        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite"/>
                    </ellipse>

                    <g id="mq-acc-layer-fondo"></g>

                    <g id="mq-cuerpo">

                        <g id="mq-antena">
                            <line x1="100" y1="40" x2="100" y2="12" stroke="#0D47A1" stroke-width="3" stroke-linecap="round"/>
                            <g id="mq-antena-apagada" visibility="visible">
                                <circle cx="100" cy="6" r="9"
                                        fill="url(#mq-grad-antena-off)"
                                        stroke="#0D47A1" stroke-width="1.5"/>
                            </g>
                            <g id="mq-antena-encendida" visibility="hidden">
                                <circle cx="100" cy="6" r="14" fill="#00E5FF" opacity="0.5">
                                    <animate attributeName="r" values="14;23;14" dur="0.9s" repeatCount="indefinite"/>
                                    <animate attributeName="opacity" values="0.65;0.12;0.65" dur="0.9s" repeatCount="indefinite"/>
                                </circle>
                                <circle cx="100" cy="6" r="10"
                                        fill="url(#mq-grad-antena-on)"
                                        stroke="#0D47A1" stroke-width="1.5">
                                    <animate attributeName="r" values="10;12.5;10" dur="0.9s" repeatCount="indefinite"/>
                                </circle>
                            </g>
                        </g>

                        <g id="mq-cabeza-grupo">
                            <rect x="35" y="40" width="130" height="120" rx="28" ry="28"
                                  fill="url(#mq-grad-cabeza)"
                                  stroke="#0D47A1" stroke-width="3"/>
                            <ellipse cx="70" cy="58" rx="25" ry="9" fill="#FFFFFF" opacity="0.6"/>

                            <g id="mq-cejas">
                                <path id="mq-ceja-izq" d="M 56 80 Q 72 74 88 83" stroke="#0D47A1" stroke-width="3" fill="none" stroke-linecap="round"/>
                                <path id="mq-ceja-der" d="M 112 83 Q 128 74 144 80" stroke="#0D47A1" stroke-width="3" fill="none" stroke-linecap="round"/>
                            </g>

                            <g id="mq-ojo-izq" class="mq-ojo">
                                <ellipse cx="72" cy="108" rx="16" ry="13" fill="#0a1a3e" stroke="#0D47A1" stroke-width="2"/>
                                <ellipse cx="72" cy="108" rx="12" ry="9.5" fill="url(#mq-grad-iris)"/>
                                <circle id="mq-pupila-izq" cx="72" cy="108" r="5" fill="#04102b"/>
                                <circle cx="76" cy="104" r="1.8" fill="#FFFFFF" opacity="0.9"/>
                            </g>

                            <g id="mq-ojo-der" class="mq-ojo">
                                <ellipse cx="128" cy="108" rx="16" ry="13" fill="#0a1a3e" stroke="#0D47A1" stroke-width="2"/>
                                <ellipse cx="128" cy="108" rx="12" ry="9.5" fill="url(#mq-grad-iris)"/>
                                <circle id="mq-pupila-der" cx="128" cy="108" r="5" fill="#04102b"/>
                                <circle cx="132" cy="104" r="1.8" fill="#FFFFFF" opacity="0.9"/>
                            </g>

                            <path id="mq-boca" class="mq-pet-boca"
                                  d="M 80 138 Q 100 148 120 138"
                                  stroke="#0D47A1" stroke-width="3.5"
                                  stroke-linejoin="round"
                                  fill="none" stroke-linecap="round"/>
                        </g>

                        <rect x="88" y="158" width="24" height="12" fill="#A8C4DE" stroke="#0D47A1" stroke-width="2"/>

                        <g id="mq-torso">
                            <path d="M 60 170 Q 60 165 65 165 L 135 165 Q 140 165 140 170 L 140 235 Q 140 250 125 250 L 75 250 Q 60 250 60 235 Z"
                                  fill="url(#mq-grad-cuerpo)"
                                  stroke="#0D47A1" stroke-width="3"/>
                            <ellipse cx="100" cy="185" rx="30" ry="10" fill="#FFFFFF" opacity="0.5"/>
                            <rect x="70" y="185" width="60" height="22" rx="6" fill="#0D47A1"/>
                            <text x="100" y="200" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="800" fill="#FFFFFF" letter-spacing="0.5">MARQUINHOS</text>
                            <circle cx="80" cy="235" r="3" fill="#7C4DFF" opacity="0.9">
                                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/>
                            </circle>
                            <circle cx="120" cy="235" r="3" fill="#00E5FF" opacity="0.9">
                                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" begin="1s"/>
                            </circle>
                        </g>

                        <g id="mq-brazo-izq" class="mq-brazo">
                            <line x1="60" y1="180" x2="30" y2="205" stroke="#0D47A1" stroke-width="12.5" stroke-linecap="round"/>
                            <line x1="60" y1="180" x2="30" y2="205" stroke="#C9D8FF" stroke-width="9" stroke-linecap="round"/>
                            <circle cx="30" cy="205" r="4.5" fill="#7C4DFF" stroke="#0D47A1" stroke-width="1.5"/>
                            <g id="mq-antebrazo-izq" class="mq-antebrazo">
                                <line x1="30" y1="205" x2="18" y2="228" stroke="#0D47A1" stroke-width="11.5" stroke-linecap="round"/>
                                <line x1="30" y1="205" x2="18" y2="228" stroke="#C9D8FF" stroke-width="8" stroke-linecap="round"/>
                                <circle cx="18" cy="228" r="3.8" fill="#7C4DFF" stroke="#0D47A1" stroke-width="1.5"/>
                                <g id="mq-mano-izq" class="mq-mano">
                                    <g class="mq-dedo" data-o="10 238" data-s="1">
                                        <line x1="10" y1="238" x2="6" y2="249" stroke="#0D47A1" stroke-width="7.5" stroke-linecap="round"/>
                                        <line x1="10" y1="238" x2="6" y2="249" stroke="#DCE6FF" stroke-width="4.5" stroke-linecap="round"/>
                                        <circle cx="6" cy="249" r="1.6" fill="#7C4DFF"/>
                                    </g>
                                    <g class="mq-dedo" data-o="15 240" data-s="0">
                                        <line x1="15" y1="240" x2="14" y2="252" stroke="#0D47A1" stroke-width="7.5" stroke-linecap="round"/>
                                        <line x1="15" y1="240" x2="14" y2="252" stroke="#DCE6FF" stroke-width="4.5" stroke-linecap="round"/>
                                        <circle cx="14" cy="252" r="1.6" fill="#7C4DFF"/>
                                    </g>
                                    <g class="mq-dedo" data-o="20 238" data-s="-1">
                                        <line x1="20" y1="238" x2="23" y2="249" stroke="#0D47A1" stroke-width="7.5" stroke-linecap="round"/>
                                        <line x1="20" y1="238" x2="23" y2="249" stroke="#DCE6FF" stroke-width="4.5" stroke-linecap="round"/>
                                        <circle cx="23" cy="249" r="1.6" fill="#7C4DFF"/>
                                    </g>
                                    <g class="mq-dedo" data-o="21 232" data-s="-1">
                                        <line x1="21" y1="232" x2="28" y2="238" stroke="#0D47A1" stroke-width="7.5" stroke-linecap="round"/>
                                        <line x1="21" y1="232" x2="28" y2="238" stroke="#DCE6FF" stroke-width="4.5" stroke-linecap="round"/>
                                        <circle cx="28" cy="238" r="1.6" fill="#7C4DFF"/>
                                    </g>
                                    <ellipse cx="15" cy="233" rx="8" ry="7.5" fill="#C9D8FF" stroke="#0D47A1" stroke-width="2"/>
                                </g>
                            </g>
                        </g>

                        <g id="mq-brazo-der" class="mq-brazo">
                            <line x1="140" y1="180" x2="170" y2="205" stroke="#0D47A1" stroke-width="12.5" stroke-linecap="round"/>
                            <line x1="140" y1="180" x2="170" y2="205" stroke="#C9D8FF" stroke-width="9" stroke-linecap="round"/>
                            <circle cx="170" cy="205" r="4.5" fill="#7C4DFF" stroke="#0D47A1" stroke-width="1.5"/>
                            <g id="mq-antebrazo-der" class="mq-antebrazo">
                                <line x1="170" y1="205" x2="182" y2="228" stroke="#0D47A1" stroke-width="11.5" stroke-linecap="round"/>
                                <line x1="170" y1="205" x2="182" y2="228" stroke="#C9D8FF" stroke-width="8" stroke-linecap="round"/>
                                <circle cx="182" cy="228" r="3.8" fill="#7C4DFF" stroke="#0D47A1" stroke-width="1.5"/>
                                <g id="mq-mano-der" class="mq-mano">
                                    <g class="mq-dedo" data-o="190 238" data-s="-1">
                                        <line x1="190" y1="238" x2="194" y2="249" stroke="#0D47A1" stroke-width="7.5" stroke-linecap="round"/>
                                        <line x1="190" y1="238" x2="194" y2="249" stroke="#DCE6FF" stroke-width="4.5" stroke-linecap="round"/>
                                        <circle cx="194" cy="249" r="1.6" fill="#7C4DFF"/>
                                    </g>
                                    <g class="mq-dedo" data-o="185 240" data-s="0">
                                        <line x1="185" y1="240" x2="186" y2="252" stroke="#0D47A1" stroke-width="7.5" stroke-linecap="round"/>
                                        <line x1="185" y1="240" x2="186" y2="252" stroke="#DCE6FF" stroke-width="4.5" stroke-linecap="round"/>
                                        <circle cx="186" cy="252" r="1.6" fill="#7C4DFF"/>
                                    </g>
                                    <g class="mq-dedo" data-o="180 238" data-s="1">
                                        <line x1="180" y1="238" x2="177" y2="249" stroke="#0D47A1" stroke-width="7.5" stroke-linecap="round"/>
                                        <line x1="180" y1="238" x2="177" y2="249" stroke="#DCE6FF" stroke-width="4.5" stroke-linecap="round"/>
                                        <circle cx="177" cy="249" r="1.6" fill="#7C4DFF"/>
                                    </g>
                                    <g class="mq-dedo" data-o="179 232" data-s="1">
                                        <line x1="179" y1="232" x2="172" y2="238" stroke="#0D47A1" stroke-width="7.5" stroke-linecap="round"/>
                                        <line x1="179" y1="232" x2="172" y2="238" stroke="#DCE6FF" stroke-width="4.5" stroke-linecap="round"/>
                                        <circle cx="172" cy="238" r="1.6" fill="#7C4DFF"/>
                                    </g>
                                    <ellipse cx="185" cy="233" rx="8" ry="7.5" fill="#C9D8FF" stroke="#0D47A1" stroke-width="2"/>
                                </g>
                            </g>
                        </g>

                        <g id="mq-pierna-izq" class="mq-pierna">
                            <line x1="82" y1="250" x2="82" y2="268" stroke="#C9D8FF" stroke-width="10" stroke-linecap="round"/>
                            <line x1="82" y1="250" x2="82" y2="268" stroke="#0D47A1" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                            <circle cx="82" cy="268" r="3.5" fill="#7C4DFF" stroke="#0D47A1" stroke-width="1.5"/>
                            <line x1="82" y1="268" x2="82" y2="278" stroke="#C9D8FF" stroke-width="9" stroke-linecap="round"/>
                            <line x1="82" y1="268" x2="82" y2="278" stroke="#0D47A1" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                            <path d="M 70 278 Q 70 290 82 290 Q 94 290 94 282 L 94 278 Z"
                                  fill="url(#mq-grad-bota)" stroke="#0D47A1" stroke-width="2"/>
                        </g>

                        <g id="mq-pierna-der" class="mq-pierna">
                            <line x1="118" y1="250" x2="118" y2="268" stroke="#C9D8FF" stroke-width="10" stroke-linecap="round"/>
                            <line x1="118" y1="250" x2="118" y2="268" stroke="#0D47A1" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                            <circle cx="118" cy="268" r="3.5" fill="#7C4DFF" stroke="#0D47A1" stroke-width="1.5"/>
                            <line x1="118" y1="268" x2="118" y2="278" stroke="#C9D8FF" stroke-width="9" stroke-linecap="round"/>
                            <line x1="118" y1="268" x2="118" y2="278" stroke="#0D47A1" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                            <path d="M 106 278 Q 106 290 118 290 Q 130 290 130 282 L 130 278 Z"
                                  fill="url(#mq-grad-bota)" stroke="#0D47A1" stroke-width="2"/>
                        </g>

                    </g>

                    <g id="mq-acc-layer"></g>
                </svg>
            </div>
        `;

        document.body.appendChild(container);
        try { document.body.style.overflowX = 'visible'; } catch (e) {}

        bubble = document.getElementById('mq-bubble');
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
        aplicarTamano();
        cambiarVisema('REST');

        const terminosOk = verificarTerminos();
        if (terminosOk) {
            setTimeout(function() {
                if (window.MarquinhosAnim && typeof window.MarquinhosAnim.iniciar === 'function') {
                    window.MarquinhosAnim.iniciar();
                }
                if (window.MarquinhosAnim && typeof window.MarquinhosAnim.saludar === 'function') {
                    setTimeout(function() {
                        window.MarquinhosAnim.saludar();
                    }, 800);
                }
            }, 500);
        }

        log('Widget v9.5 Galactic Pro creado');
    }
    function mostrarDots() {}
    function ocultarDots() {}

    function setEstado(e) {
        if (container) container.setAttribute('data-estado', e);

        const apagada = document.getElementById('mq-antena-apagada');
        const encendida = document.getElementById('mq-antena-encendida');
        if (apagada && encendida) {
            const escuchando = (e === 'escuchando');
            apagada.setAttribute('visibility', escuchando ? 'hidden' : 'visible');
            encendida.setAttribute('visibility', escuchando ? 'visible' : 'hidden');
        }

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

    function detenerConversacion() {
        conversacionActiva = false;
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

        const estilo = VOZ_ESTILOS[config.estilo_voz] || VOZ_ESTILOS.natural;
        const pitchBase = TONO_PITCH[config.tono] || 1.0;
        const rate = estilo.rate * (config.velocidad || 1.0);
        const pitch = estilo.pitch * pitchBase;
        const volumen = Math.max(0, Math.min(1, config.volumen || 1.0));

        if (config.mostrar_subtitulos) mostrarBurbuja(texto);
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
                        if (url && miToken === ttsToken) { ok = true; await reproducirAudio(url); }
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
        procesando = true;
        setEstado('pensando');

        cambiarVisema('M');

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

    window.addEventListener('storage', function(e) {
        if (e.key === 'marquinhos_config') {
            cargarConfig();
            aplicarModo();
            aplicarTamano();
        }
        if (e.key === ACC_KEY) {
            try {
                accesoriosEquipados = JSON.parse(e.newValue || '[]');
                renderAccesoriosEnAvatar();
            } catch (err) {}
        }
    });

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
            log('Términos reiniciados.');
        },
        getTerminosVersion: function() { return TERMINOS_VERSION; },
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
        log('✅ Marquinhos v9.5 Galactic Pro activo');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();