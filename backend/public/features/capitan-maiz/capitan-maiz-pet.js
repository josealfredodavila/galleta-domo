// ================================================================
// CAPITÁN MAÍZ · PET v2.1
// "GUARDIAN ANCESTRAL · GALACTIC CHARRO"
// ================================================================
// Fix v2.1: Sombrero corregido
// - Copa del sombrero más ancha y mejor conectada al ala
// - Antenas reposicionadas para que salgan del ala (no se tapen)
// - Estrella de la copa integrada al diseño
// ================================================================

'use strict';

(function() {

    if (window.__capitanMaizPetLoaded) return;
    window.__capitanMaizPetLoaded = true;

    const RUTAS_EXCLUIDAS = [
        '/login', '/registro',
        '/pagar', '/pay', '/checkout', '/success', '/cancel',
        '/terminos', '/privacidad', '/cookies', '/legal',
        '/info', '/live-terminos',
        '/eliminar-cuenta', '/actualizar-contrasena',
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
        natural: { rate: 1.0, pitch: 1.0 },
        sabio: { rate: 0.9, pitch: 0.95 },
        energico: { rate: 1.1, pitch: 1.05 },
        sereno: { rate: 0.85, pitch: 0.9 }
    };

    const TONO_PITCH = {
        grave: 0.85,
        medio: 1.0,
        agudo: 1.15
    };

    const HIST_MAX = 40;
    const HIST_MAX_ENVIO = 20;
    const HIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const HIST_KEY = 'capitan_maiz_hist_';
    const ACC_KEY = 'capitan_maiz_accesorios_equipados';

    const TERMINOS_VERSION = '1.0';
    const TERMINOS_KEY = 'capitan_maiz_terminos_aceptados_' + TERMINOS_VERSION;

    const TTS_FALLO_TTL_MS = 2 * 60 * 1000;
    let _ttsBackendFalloEn = 0;

    const VISEMAS_SVG = {
        REST: 'M 78 137 Q 100 150 122 137',
        A: 'M 70 134 Q 100 130 130 134 Q 126 154 100 154 Q 74 154 70 134 Z',
        E: 'M 72 137 Q 100 134 128 137 Q 122 150 100 150 Q 78 150 72 137 Z',
        I: 'M 74 139 Q 100 143 126 139 Q 100 148 74 139 Z',
        O: 'M 100 132 Q 116 132 116 143 Q 116 154 100 154 Q 84 154 84 143 Q 84 132 100 132 Z',
        U: 'M 100 135 Q 111 135 111 143 Q 111 151 100 151 Q 89 151 89 143 Q 89 135 100 135 Z',
        M: 'M 82 140 L 118 140'
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

    function log(msg) {
        console.log('[Capitán Maíz v2.1]', msg);
    }

    function esc(v) {
        const d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }

    function cargarConfig() {
        try {
            const g = localStorage.getItem('capitan_maiz_config');
            if (g) {
                config = { ...CONFIG_DEFAULT, ...JSON.parse(g) };
            }
            if (config.tamano != null) {
                config.tamano = Math.max(60, Math.min(150, parseInt(config.tamano, 10) || 100));
            }
            if (config.volumen != null) {
                config.volumen = Math.max(0, Math.min(1, parseFloat(config.volumen) || 1));
            }
            if (config.velocidad != null) {
                config.velocidad = Math.max(.5, Math.min(2, parseFloat(config.velocidad) || 1));
            }
        } catch (e) {}
    }

    function guardarConfig() {
        try {
            localStorage.setItem('capitan_maiz_config', JSON.stringify(config));
        } catch (e) {}
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
        } catch (e) {
            historialLocal = [];
        }
    }

    function guardarHistorial() {
        try {
            historialLocal = historialLocal.slice(-HIST_MAX);
            localStorage.setItem(HIST_KEY + (userInfo ? userInfo.id : 'anon'), JSON.stringify(historialLocal));
        } catch (e) {}
    }

    function olvidarTodo() {
        historialLocal = [];
        try {
            localStorage.removeItem(HIST_KEY + (userInfo ? userInfo.id : 'anon'));
        } catch (e) {}
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
            const { data } = await sb
                .from('usuarios')
                .select('nombre, handle, avatar_url')
                .eq('id', uid)
                .maybeSingle();
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
            if (Array.isArray(cached)) {
                accesoriosEquipados = cached;
            }
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
        return { x: 100, y: 180, size: 60 };
    }

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
                if (String(a.svg).trim().indexOf('<') === 0) {
                    return '<g>' + a.svg + '</g>';
                }
                const p = posicionPorCategoria(a.categoria);
                const yOffset = i * 30;
                return `
                    <text
                        x="${p.x}"
                        y="${p.y + yOffset}"
                        font-size="${p.size}"
                        text-anchor="middle">
                        ${esc(a.svg)}
                    </text>
                `;
            })
            .join('');
    }

    function cambiarVisema(nombre) {
        if (!bocaEl) return;
        const key = VISEMAS_SVG[nombre] ? nombre : 'REST';
        bocaEl.setAttribute('d', VISEMAS_SVG[key]);
        bocaEl.setAttribute('fill', VISEMAS_SIN_RELLENO[key] ? 'none' : '#0A0A0A');
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
        if (!window.CapitanMaizBoca) {
            animarBocaRandom();
            return;
        }
        const visemas = window.CapitanMaizBoca.analizar(texto);
        if (!visemas || !visemas.length) {
            animarBocaRandom();
            return;
        }
        _bocaActiva = true;
        const rateFactor = rate || 1.0;
        let tiempo = 0;
        visemas.forEach(function(v) {
            const dur = v.duracion / rateFactor;
            const t = setTimeout(function() {
                if (!_bocaActiva) return;
                cambiarVisema(v.visema);
            }, tiempo);
            _bocaTimeouts.push(t);
            tiempo += dur;
        });
        const tFin = setTimeout(function() {
            if (!_bocaActiva) return;
            cambiarVisema('REST');
            _bocaActiva = false;
        }, tiempo + 100);
        _bocaTimeouts.push(tFin);
    }

    function animarBocaRandom() {
        _bocaActiva = true;
        const visemas = ['A', 'E', 'O', 'I', 'A', 'U', 'E'];
        let idx = 0;
        function siguiente() {
            if (!_bocaActiva || !bocaEl) return;
            cambiarVisema(visemas[idx % visemas.length]);
            idx++;
            const t = setTimeout(siguiente, 90 + Math.random() * 70);
            _bocaTimeouts.push(t);
        }
        siguiente();
    }

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
        } catch (e) {
            return true;
        }
    }

    // ============================================================
    // CREAR WIDGET — SVG COMPLETO v2.1
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

        container.innerHTML = `
        <div class="cm-pet-bubble" id="cm-bubble">
            <div class="cm-pet-bubble-text" id="cm-bubble-text"></div>
        </div>

        <div class="cm-pet-avatar" id="cm-avatar" role="button" tabindex="0" aria-label="Hablar con el Capitán Maíz">
            <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" class="cm-pet-svg" style="overflow:visible">

                <defs>
                    <radialGradient id="cm-aura">
                        <stop offset="0%" stop-color="#00D9FF" stop-opacity=".38"/>
                        <stop offset="55%" stop-color="#6948C7" stop-opacity=".18"/>
                        <stop offset="100%" stop-color="#6948C7" stop-opacity="0"/>
                    </radialGradient>

                    <linearGradient id="cm-grad-cabeza" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#FFFFFF"/>
                        <stop offset="60%" stop-color="#F7F8FA"/>
                        <stop offset="100%" stop-color="#DCE2E9"/>
                    </linearGradient>

                    <linearGradient id="cm-grad-traje" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#18202C"/>
                        <stop offset="45%" stop-color="#080B12"/>
                        <stop offset="100%" stop-color="#020408"/>
                    </linearGradient>

                    <linearGradient id="cm-grad-botas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#273342"/>
                        <stop offset="55%" stop-color="#080B12"/>
                        <stop offset="100%" stop-color="#010205"/>
                    </linearGradient>

                    <linearGradient id="cm-grad-pantalon" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#FFFFFF"/>
                        <stop offset="100%" stop-color="#D9DEE5"/>
                    </linearGradient>

                    <linearGradient id="cm-grad-azul" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#69EDFF"/>
                        <stop offset="45%" stop-color="#00D9FF"/>
                        <stop offset="100%" stop-color="#178BFF"/>
                    </linearGradient>

                    <linearGradient id="cm-grad-capa" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#050817"/>
                        <stop offset="35%" stop-color="#111B46"/>
                        <stop offset="65%" stop-color="#25195B"/>
                        <stop offset="100%" stop-color="#050716"/>
                    </linearGradient>

                    <linearGradient id="cm-grad-sombrero" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#2E3D52"/>
                        <stop offset="25%" stop-color="#18202E"/>
                        <stop offset="70%" stop-color="#0A0E15"/>
                        <stop offset="100%" stop-color="#02040A"/>
                    </linearGradient>

                    <radialGradient id="cm-grad-ojo">
                        <stop offset="0%" stop-color="#FFFFFF"/>
                        <stop offset="18%" stop-color="#9EECFF"/>
                        <stop offset="45%" stop-color="#397BFF"/>
                        <stop offset="75%" stop-color="#182C6E"/>
                        <stop offset="100%" stop-color="#071126"/>
                    </radialGradient>

                    <filter id="cm-glow">
                        <feGaussianBlur stdDeviation="1.7" result="blur"/>
                        <feMerge>
                            <feMergeNode in="blur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>

                    <pattern id="cm-patron-sombrero" width="14" height="10" patternUnits="userSpaceOnUse">
                        <path d="M0 5 L7 0 L14 5 L7 10 Z" fill="none" stroke="#56647A" stroke-width="1" opacity=".55"/>
                    </pattern>

                    <clipPath id="cm-capa-clip">
                        <path d="M43 178 C25 185 13 203 9 228 C5 251 8 274 20 292 L49 276 L62 229 L72 191 Z M157 178 C175 185 187 203 191 228 C195 251 192 274 180 292 L151 276 L138 229 L128 191 Z"/>
                    </clipPath>
                </defs>

                <ellipse cx="100" cy="155" rx="98" ry="142" fill="url(#cm-aura)" opacity=".65">
                    <animate attributeName="opacity" values=".35;.7;.35" dur="3s" repeatCount="indefinite"/>
                </ellipse>

                <g id="cm-capa" data-acc-slot="capa">
                    <path d="M54 175 C34 181 17 198 11 223 C5 247 7 273 19 294 L47 278 C55 257 61 232 65 204 Z M146 175 C166 181 183 198 189 223 C195 247 193 273 181 294 L153 278 C145 257 139 232 135 204 Z" fill="url(#cm-grad-capa)" stroke="#314A83" stroke-width="2"/>

                    <path d="M19 294 C29 278 39 269 47 257 M181 294 C171 278 161 269 153 257" fill="none" stroke="#00D9FF" stroke-width="2" opacity=".85" filter="url(#cm-glow)"/>

                    <g fill="#FFFFFF" opacity=".9" clip-path="url(#cm-capa-clip)">
                        <circle cx="25" cy="226" r="1.4"/>
                        <circle cx="34" cy="250" r=".9"/>
                        <circle cx="25" cy="270" r=".7"/>
                        <circle cx="43" cy="215" r=".8"/>
                        <circle cx="176" cy="226" r="1.4"/>
                        <circle cx="166" cy="249" r=".9"/>
                        <circle cx="176" cy="269" r=".7"/>
                        <circle cx="158" cy="215" r=".8"/>
                    </g>

                    <g fill="#FFFFFF" filter="url(#cm-glow)">
                        <path d="M30 242 l2.2 5 l5 2.2 l-5 2.2 l-2.2 5 l-2.2-5 l-5-2.2 l5-2.2z"/>
                        <path d="M171 238 l1.8 4 l4 1.8 l-4 1.8 l-1.8 4 l-1.8-4 l-4-1.8 l4-1.8z"/>
                    </g>
                </g>

                <g id="cm-cuerpo">

                    <g id="cm-pierna-izq" class="cm-pierna">
                        <path d="M70 230 L94 230 L96 267 L88 280 L69 275 L67 250 Z" fill="url(#cm-grad-pantalon)" stroke="#6C7A89" stroke-width="2"/>
                        <path d="M80 237 L78 269" stroke="#AAB8C8" stroke-width="1.2"/>
                        <path d="M69 252 Q80 246 91 252 L90 266 Q80 271 70 266 Z" fill="#E4E8ED" stroke="#5E6D7C" stroke-width="2"/>
                        <path d="M72 254 Q80 250 88 254" fill="none" stroke="#00D9FF" stroke-width="1.4" filter="url(#cm-glow)"/>
                    </g>

                    <g id="cm-pierna-der" class="cm-pierna">
                        <path d="M106 230 L130 230 L133 250 L131 275 L112 280 L104 267 Z" fill="url(#cm-grad-pantalon)" stroke="#6C7A89" stroke-width="2"/>
                        <path d="M120 237 L122 269" stroke="#AAB8C8" stroke-width="1.2"/>
                        <path d="M109 252 Q120 246 131 252 L130 266 Q120 271 110 266 Z" fill="#E4E8ED" stroke="#5E6D7C" stroke-width="2"/>
                        <path d="M112 254 Q120 250 128 254" fill="none" stroke="#00D9FF" stroke-width="1.4" filter="url(#cm-glow)"/>
                    </g>

                    <g id="cm-botas" data-acc-slot="pies">
                        <path d="M66 267 Q77 264 90 270 L93 283 Q92 290 83 293 L57 293 Q52 289 57 284 L66 278 Z" fill="url(#cm-grad-botas)" stroke="#4D6074" stroke-width="2"/>
                        <path d="M107 270 Q120 264 134 267 L143 278 Q148 284 143 290 Q139 293 117 293 L107 289 Z" fill="url(#cm-grad-botas)" stroke="#4D6074" stroke-width="2"/>
                        <path d="M62 283 Q75 278 89 283" fill="none" stroke="#00D9FF" stroke-width="2" filter="url(#cm-glow)"/>
                        <path d="M111 283 Q124 278 140 283" fill="none" stroke="#00D9FF" stroke-width="2" filter="url(#cm-glow)"/>
                        <path d="M57 290 Q74 294 90 289 M109 289 Q126 294 143 288" fill="none" stroke="#121A26" stroke-width="3"/>
                    </g>

                    <g id="cm-torso" data-acc-slot="torso">
                        <path d="M65 148 Q100 137 135 148 L145 217 Q128 232 100 232 Q72 232 55 217 Z" fill="url(#cm-grad-traje)" stroke="#53657A" stroke-width="2.2"/>

                        <path d="M72 151 L91 157 L100 171 L109 157 L128 151 L136 211 L119 220 L100 216 L81 220 L64 211 Z" fill="#101722" stroke="#00D9FF" stroke-width="1.8"/>

                        <path d="M91 157 L100 171 L109 157 L106 207 L94 207 Z" fill="#0A0D13" stroke="#293849" stroke-width="1.3"/>

                        <path d="M86 151 L100 168 L114 151 L108 146 L100 158 L92 146 Z" fill="#151C27" stroke="#708093" stroke-width="1.3"/>

                        <g fill="#C7D3DF" stroke="#455467" stroke-width="1">
                            <circle cx="100" cy="178" r="2"/>
                            <circle cx="100" cy="188" r="2"/>
                            <circle cx="100" cy="198" r="2"/>
                        </g>

                        <g fill="none" stroke="#B7C5D5" stroke-width="1.2">
                            <path d="M75 158 Q82 169 87 178"/>
                            <path d="M125 158 Q118 169 113 178"/>
                            <path d="M75 192 Q82 201 87 208"/>
                            <path d="M125 192 Q118 201 113 208"/>
                        </g>

                        <path d="M67 151 Q60 179 65 210 M133 151 Q140 179 135 210" fill="none" stroke="#00D9FF" stroke-width="2" filter="url(#cm-glow)"/>

                        <path d="M100 181 L103 188 L111 188 L105 193 L108 201 L100 196 L92 201 L95 193 L89 188 L97 188 Z" fill="#00D9FF" opacity=".9" filter="url(#cm-glow)"/>

                        <path d="M66 151 Q57 153 53 163 L64 171 L73 157 Z" fill="#151D2A" stroke="#00D9FF" stroke-width="1.4"/>
                        <path d="M134 151 Q143 153 147 163 L136 171 L127 157 Z" fill="#151D2A" stroke="#00D9FF" stroke-width="1.4"/>
                    </g>

                    <g id="cm-brazo-izq" class="cm-brazo">
                        <path d="M66 158 Q54 158 47 170 L39 199 Q43 207 52 208 L64 179 L76 168 Z" fill="url(#cm-grad-traje)" stroke="#56697D" stroke-width="2"/>
                        <path d="M52 166 Q45 182 45 198" fill="none" stroke="#00D9FF" stroke-width="2" filter="url(#cm-glow)"/>

                        <g id="cm-mano-izq" class="cm-mano">
                            <path d="M39 198 Q32 200 31 208 Q32 218 42 222 Q51 224 55 216 L55 207 Q48 199 39 198 Z" fill="url(#cm-grad-cabeza)" stroke="#596979" stroke-width="2"/>
                            <path d="M38 207 Q44 211 50 207" fill="none" stroke="#A6B4C3" stroke-width="1.2"/>
                        </g>
                    </g>

                    <g id="cm-brazo-der" class="cm-brazo">
                        <path d="M134 158 Q146 158 153 170 L162 193 Q158 202 149 204 L136 179 L124 168 Z" fill="url(#cm-grad-traje)" stroke="#56697D" stroke-width="2"/>
                        <path d="M148 166 Q155 181 157 194" fill="none" stroke="#00D9FF" stroke-width="2" filter="url(#cm-glow)"/>

                        <path d="M149 193 Q158 189 164 196 L164 207 Q158 214 149 210 L143 201 Z" fill="#111823" stroke="#596979" stroke-width="2"/>

                        <g id="cm-mano-der" class="cm-mano">
                            <path d="M157 193 Q158 181 165 175 Q171 168 177 172 Q181 176 178 181 Q184 177 188 181 Q191 186 186 190 Q191 188 194 193 Q195 199 188 202 Q178 207 168 203 L158 200 Z" fill="url(#cm-grad-cabeza)" stroke="#596979" stroke-width="2"/>
                            <path d="M178 181 L183 187 M187 190 L181 193 M174 202 L171 194" fill="none" stroke="#9DAAB7" stroke-width="1.2" stroke-linecap="round"/>
                        </g>
                    </g>

                    <g id="cm-cinturon" data-acc-slot="cinturon">
                        <path d="M64 218 Q100 226 136 218 L137 231 Q100 240 63 231 Z" fill="#0A0E15" stroke="#3E4E61" stroke-width="2"/>
                        <path d="M100 218 L105 226 L114 226 L107 232 L110 241 L100 235 L90 241 L93 232 L86 226 L95 226 Z" fill="#DCEBFF" stroke="#00D9FF" stroke-width="1.7" filter="url(#cm-glow)"/>
                    </g>

                    <g id="cm-cabeza-grupo">
                        <g>
                            <circle cx="45" cy="111" r="15" fill="#E7EBF0" stroke="#667687" stroke-width="2"/>
                            <circle cx="155" cy="111" r="15" fill="#E7EBF0" stroke="#667687" stroke-width="2"/>
                            <circle cx="45" cy="111" r="8" fill="#111B2A" stroke="#00D9FF" stroke-width="1.5" filter="url(#cm-glow)"/>
                            <circle cx="155" cy="111" r="8" fill="#111B2A" stroke="#00D9FF" stroke-width="1.5" filter="url(#cm-glow)"/>
                        </g>

                        <rect x="48" y="68" width="104" height="96" rx="40" fill="url(#cm-grad-cabeza)" stroke="#687888" stroke-width="2.5"/>

                        <path d="M66 84 Q76 76 87 78" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".75" stroke-linecap="round"/>

                        <g id="cm-ojo-izq">
                            <ellipse cx="73" cy="111" rx="16" ry="21" fill="url(#cm-grad-ojo)" stroke="#1A2742" stroke-width="2"/>
                            <circle cx="67" cy="105" r="3" fill="#FFFFFF"/>
                            <circle cx="78" cy="116" r="2" fill="#E9A8FF"/>
                            <circle cx="70" cy="121" r="1.5" fill="#FFFFFF"/>
                            <ellipse id="cm-pupila-izq" cx="74" cy="112" rx="6" ry="9" fill="#071126" opacity=".8"/>
                        </g>

                        <g id="cm-ojo-der">
                            <ellipse cx="127" cy="111" rx="16" ry="21" fill="url(#cm-grad-ojo)" stroke="#1A2742" stroke-width="2"/>
                            <circle cx="121" cy="105" r="3" fill="#FFFFFF"/>
                            <circle cx="132" cy="116" r="2" fill="#E9A8FF"/>
                            <circle cx="124" cy="121" r="1.5" fill="#FFFFFF"/>
                            <ellipse id="cm-pupila-der" cx="126" cy="112" rx="6" ry="9" fill="#071126" opacity=".8"/>
                        </g>

                        <g fill="#FF9CA8" opacity=".55">
                            <ellipse cx="63" cy="132" rx="9" ry="4"/>
                            <ellipse cx="137" cy="132" rx="9" ry="4"/>
                        </g>

                        <path id="cm-boca" class="cm-pet-boca" d="M78 137 Q100 150 122 137" fill="none" stroke="#0A0A0A" stroke-width="3"/>
                    </g>

                    <!-- =================================================
                         SOMBRERO (v2.1 — corregido)
                         Copa más ancha y mejor conectada al ala
                         ================================================= -->
                    <g id="cm-sombrero" data-acc-slot="sombrero">

                        <!-- COPA (más ancha y más alta) -->
                        <path d="M64 73 Q62 42 72 22 Q82 6 100 6 Q118 6 128 22 Q138 42 136 73 Z"
                              fill="url(#cm-grad-sombrero)"
                              stroke="#4A5C72"
                              stroke-width="2.5"/>

                        <!-- ESTRELLA DE LA COPA (integrada) -->
                        <path d="M100 14 L103.5 24 L114 25.5 L106 33 L108.5 44 L100 38 L91.5 44 L94 33 L86 25.5 L96.5 24 Z"
                              fill="none"
                              stroke="#7B92AD"
                              stroke-width="1.4"
                              stroke-linejoin="round"/>

                        <!-- BRILLO DE LA COPA -->
                        <path d="M78 20 Q76 40 78 65"
                              fill="none"
                              stroke="#FFFFFF"
                              stroke-width="2"
                              opacity=".22"
                              stroke-linecap="round"/>

                        <!-- ALA (más ancha) -->
                        <ellipse cx="100" cy="70" rx="96" ry="28"
                                 fill="url(#cm-grad-sombrero)"
                                 stroke="#4A5C72"
                                 stroke-width="2.5"/>

                        <!-- PATRÓN GEOMÉTRICO EN EL ALA -->
                        <ellipse cx="100" cy="69" rx="84" ry="20"
                                 fill="url(#cm-patron-sombrero)"
                                 opacity=".85"/>

                        <!-- BANDA DEL SOMBRERO (más ancha y al frente) -->
                        <path d="M64 55 Q100 45 136 55 L137 68 Q100 58 63 68 Z"
                              fill="#06080E"
                              stroke="#00D9FF"
                              stroke-width="1.4"/>

                        <!-- BORDE NEÓN EXTERIOR DEL ALA -->
                        <ellipse cx="100" cy="70" rx="95" ry="27"
                                 fill="none"
                                 stroke="#00D9FF"
                                 stroke-width="2.4"
                                 filter="url(#cm-glow)"/>

                        <!-- BORDE NEÓN INTERIOR -->
                        <ellipse cx="100" cy="75" rx="85" ry="19"
                                 fill="none"
                                 stroke="#178BFF"
                                 stroke-width="1.6"
                                 opacity=".85"/>

                        <!-- ESTRELLAS DECORATIVAS EN EL ALA -->
                        <g fill="#FFFFFF" filter="url(#cm-glow)">
                            <circle cx="40" cy="62" r="1.5"/>
                            <circle cx="160" cy="61" r="1.5"/>
                            <circle cx="80" cy="56" r="1.1"/>
                            <circle cx="120" cy="56" r="1.1"/>
                            <circle cx="60" cy="80" r="1"/>
                            <circle cx="140" cy="79" r="1"/>
                        </g>

                    </g>

                    <!-- =================================================
                         ANTENAS (v2.1 — AHORA DESPUÉS DEL SOMBRERO)
                         Salen del ala hacia arriba, visibles
                         ================================================= -->
                    <g id="cm-antenas" data-acc-slot="cabeza">

                        <!-- ANTENA IZQUIERDA -->
                        <path d="M78 68 L68 38"
                              fill="none"
                              stroke="#B8C8D8"
                              stroke-width="3"
                              stroke-linecap="round"/>

                        <circle cx="68" cy="36" r="6"
                                fill="#B8F6FF"
                                stroke="#00D9FF"
                                stroke-width="2"
                                filter="url(#cm-glow)"/>

                        <!-- ANTENA DERECHA -->
                        <path d="M122 68 L132 38"
                              fill="none"
                              stroke="#B8C8D8"
                              stroke-width="3"
                              stroke-linecap="round"/>

                        <circle cx="132" cy="36" r="6"
                                fill="#B8F6FF"
                                stroke="#00D9FF"
                                stroke-width="2"
                                filter="url(#cm-glow)"/>

                    </g>
                </g>

                <g id="cm-acc-layer" data-acc-slot="accesorios"></g>

            </svg>
        </div>
        `;

        document.body.appendChild(container);

        bubble = document.getElementById('cm-bubble');
        bocaEl = document.getElementById('cm-boca');

        const avatar = document.getElementById('cm-avatar');

        avatar.addEventListener('click', async function() {
            if (hasMoved) {
                hasMoved = false;
                return;
            }
            const ok = await verificarTerminos();
            if (!ok) return;
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
            } catch (err) {
                posStartX = 0;
                posStartY = 0;
            }
            try {
                avatar.setPointerCapture(e.pointerId);
            } catch (err) {}
            container.classList.add('cm-dragging');
            e.preventDefault();
        });

        avatar.addEventListener('pointermove', function(e) {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                hasMoved = true;
            }
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
            try {
                avatar.releasePointerCapture(e.pointerId);
            } catch (err) {}
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

        log('Widget v2.1 creado · SVG Galactic Charro (sombrero corregido)');
    }

    function setEstado(e) {
        if (container) {
            container.setAttribute('data-estado', e);
        }
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
        if (bubble) {
            bubble.classList.remove('cm-bubble-visible');
        }
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
        const volumen = Math.max(0, Math.min(1, config.volumen || 1));

        if (config.mostrar_subtitulos) {
            mostrarBurbuja(texto);
        }

        isSpeaking = true;
        setEstado('hablando');
        animarBoca(texto, rate);

        let ok = false;
        const ttsBackendDisponible = Date.now() - _ttsBackendFalloEn > TTS_FALLO_TTL_MS;

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
                            character: 'capitan-maiz'
                        })
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        const url = data.audio_url || data.audioUrl;
                        if (url && miToken === ttsToken) {
                            ok = true;
                            await reproducirAudio(url);
                        }
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

        const completo = miToken === ttsToken;
        if (completo) {
            isSpeaking = false;
            setEstado('idle');
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
            if ((acc + ' ' + p).length > 170 && acc) {
                out.push(acc.trim());
                acc = p;
            } else {
                acc = acc ? acc + ' ' + p : p;
            }
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
                u.rate = Math.max(.5, Math.min(2, rate));
                u.pitch = Math.max(.5, Math.min(2, pitch));
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
                audioActual.volume = Math.max(0, Math.min(1, config.volumen || 1));
                audioActual.onended = function() {
                    audioActual = null;
                    resolve();
                };
                audioActual.onerror = function() {
                    audioActual = null;
                    resolve();
                };
                audioActual.play().catch(function() {
                    resolve();
                });
            } catch (e) {
                resolve();
            }
        });
    }

    function detenerTTS() {
        ttsToken++;
        try {
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        } catch (e) {}
        if (audioActual) {
            try {
                audioActual.pause();
            } catch (e) {}
            audioActual = null;
        }
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
                    hablar('¡Nos vidrios, paisano! Aquí andaré cuando me necesites.').then(function() {
                        guardarHistorial();
                    });
                    return;
                }

                if (/(olvida (todo|lo que hablamos)|borra (la )?conversaci[oó]n|empecemos de nuevo)/.test(lower)) {
                    olvidarTodo();
                    hablar('Listo, borrón y cuenta nueva. Empecemos de cero.').then(function() {
                        if (conversacionActiva) {
                            iniciarReconocimiento();
                        }
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
                } else {
                    setEstado('idle');
                }
            };

            recognition.onend = function() {
                recognitionActive = false;
                isListening = false;
                recognition = null;
                if (!procesando && !isSpeaking) {
                    setEstado('idle');
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
            try {
                recognition.abort ? recognition.abort() : recognition.stop();
            } catch (e) {}
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
            if (!respuesta) {
                respuesta = 'No supe qué decirte, pero aquí andamos.';
            }

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
            if (!isSpeaking && !isListening) {
                setEstado('idle');
            }
        }
    }

    function instalarVisibility() {
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                detenerConversacion();
            }
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
        getModoSubtitulos: function() {
            return !!config.mostrar_subtitulos;
        },
        getHistorial: function() {
            return historialLocal.slice();
        },
        getConfig: function() {
            return { ...config };
        },
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
        getUserInfo: function() {
            return userInfo;
        },
        _visemasDisponibles: function() {
            return Object.keys(VISEMAS_SVG);
        },
        reiniciarTerminos: function() {
            try {
                localStorage.removeItem(TERMINOS_KEY);
            } catch (e) {}
        },
        getTerminosVersion: function() {
            return TERMINOS_VERSION;
        }
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
        log('✅ Capitán Maíz v2.1 activo');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();