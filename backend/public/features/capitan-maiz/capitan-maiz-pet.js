// ================================================================
// CAPITÁN MAÍZ · PET v2.7
// "GUARDIAN ANCESTRAL · GALACTIC CHARRO"
// ================================================================
// Novedades v2.7:
// ✅ Sombrero realmente asentado sobre la cabeza
// ✅ Ala ligeramente superpuesta a la cabeza para eliminar efecto flotante
// ✅ Copa más ancha y mejor conectada con el ala
// ✅ Base de la copa encaja exactamente con el ala
// ✅ Se mantiene inclinación charra
// ✅ Se conservan luces, estrellas y patrón del sombrero
// ✅ Sin cambios en voz, IA, accesorios, Supabase ni lógica del PET
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

    const RESONANCIA_KEY = 'capitan_maiz_resonancia_';
    const RESONANCIA_MAX = 10;
    const RESONANCIA_DECAY_MS = 30 * 60 * 1000;

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

    let resonancia = 0;

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
        console.log('[Capitán Maíz v2.7]', msg);
    }

    function esc(v) {
        const d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }

    // Genera el path de una espiral (remolino hipnótico) centrada en cx,cy
    function espiral(cx, cy, fase) {
        let d = '';
        for (let i = 0; i <= 80; i++) {
            const th = i * 0.3;
            const r = 1.5 + th * 0.85;
            const a = th + fase;
            const x = cx + r * Math.cos(a);
            const y = cy + r * Math.sin(a);
            d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
        }
        return d;
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

    // ============================================================
    // SISTEMA DE RESONANCIA
    // ============================================================
    function cargarResonancia() {
        try {
            const key = RESONANCIA_KEY + (userInfo ? userInfo.id : 'anon');
            const raw = localStorage.getItem(key);
            if (!raw) {
                resonancia = 0;
                return;
            }
            const data = JSON.parse(raw);
            const ahora = Date.now();
            if (data.ts && (ahora - data.ts) > RESONANCIA_DECAY_MS) {
                resonancia = 0;
            } else {
                resonancia = Math.max(0, Math.min(RESONANCIA_MAX, parseInt(data.nivel) || 0));
            }
        } catch (e) {
            resonancia = 0;
        }
    }

    function guardarResonancia() {
        try {
            const key = RESONANCIA_KEY + (userInfo ? userInfo.id : 'anon');
            localStorage.setItem(key, JSON.stringify({
                nivel: resonancia,
                ts: Date.now()
            }));
        } catch (e) {}
    }

    function subirResonancia() {
        resonancia = Math.min(RESONANCIA_MAX, resonancia + 1);
        guardarResonancia();
        aplicarResonancia();
        log('⚡ Resonancia: ' + resonancia + '/' + RESONANCIA_MAX);
    }

    function aplicarResonancia() {
        if (!container) return;
        container.setAttribute('data-resonancia', String(resonancia));
        const factor = 0.3 + (resonancia / RESONANCIA_MAX) * 0.7;
        container.style.setProperty('--cm-resonancia', String(factor));
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
            if (!raw) {
                historialLocal = [];
                return;
            }
            const arr = JSON.parse(raw);
            const limite = Date.now() - HIST_TTL_MS;
            historialLocal = (Array.isArray(arr) ? arr : [])
                .filter(m =>
                    m &&
                    m.content &&
                    m.ts &&
                    m.ts > limite &&
                    (m.role === 'user' || m.role === 'assistant')
                )
                .slice(-HIST_MAX);
        } catch (e) {
            historialLocal = [];
        }
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
        resonancia = 0;
        try {
            localStorage.removeItem(HIST_KEY + (userInfo ? userInfo.id : 'anon'));
            localStorage.removeItem(RESONANCIA_KEY + (userInfo ? userInfo.id : 'anon'));
        } catch (e) {}
        aplicarResonancia();
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

            // ✅ NUEVO: leer perfil propio vía RPC seguro (SETOF usuarios → array)
            let data = null;
            try {
                const rpc = await sb.rpc('mi_perfil_privado');
                if (!rpc.error && rpc.data) {
                    data = Array.isArray(rpc.data) ? (rpc.data.length > 0 ? rpc.data[0] : null) : rpc.data;
                }
            } catch (rpcErr) {
                console.warn('[Capitán Maíz] mi_perfil_privado falló:', rpcErr);
            }

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
            .select(`
                accesorio_id,
                equipado,
                capitan_maiz_accesorios!inner (
                    nombre,
                    categoria,
                    svg_data
                )
            `)
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

        const { data, error } = await sb.rpc(
            'verificar_aceptacion_terminos_capitan_maiz',
            { p_version: TERMINOS_VERSION }
        );

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

        const { data, error } = await sb.rpc(
            'registrar_aceptacion_terminos_capitan_maiz',
            {
                p_version: TERMINOS_VERSION,
                p_user_agent: navigator.userAgent
            }
        );

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
        try {
            localStorage.setItem(TERMINOS_KEY, 'true');
        } catch (e) {}
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
// CREAR WIDGET — SVG v2.7
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
                    <stop offset="0%" stop-color="#00D9FF" stop-opacity=".5"/>
                    <stop offset="55%" stop-color="#6948C7" stop-opacity=".22"/>
                    <stop offset="100%" stop-color="#6948C7" stop-opacity="0"/>
                </radialGradient>

                <linearGradient id="cm-grad-cabeza" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#FFFFFF"/>
                    <stop offset="60%" stop-color="#F7F8FA"/>
                    <stop offset="100%" stop-color="#DCE2E9"/>
                </linearGradient>

                <linearGradient id="cm-grad-traje" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#0F1824"/>
                    <stop offset="45%" stop-color="#050810"/>
                    <stop offset="100%" stop-color="#000104"/>
                </linearGradient>

                <linearGradient id="cm-grad-botas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#1B2535"/>
                    <stop offset="55%" stop-color="#050810"/>
                    <stop offset="100%" stop-color="#000104"/>
                </linearGradient>

                <linearGradient id="cm-grad-pantalon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#FFFFFF"/>
                    <stop offset="100%" stop-color="#D9DEE5"/>
                </linearGradient>

                <linearGradient id="cm-grad-capa" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#04061A"/>
                    <stop offset="35%" stop-color="#0A1466"/>
                    <stop offset="65%" stop-color="#1B0F5C"/>
                    <stop offset="100%" stop-color="#03040E"/>
                </linearGradient>

                <linearGradient id="cm-grad-sombrero" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#4A607C"/>
                    <stop offset="22%" stop-color="#1E2A3D"/>
                    <stop offset="65%" stop-color="#0A1018"/>
                    <stop offset="100%" stop-color="#02040A"/>
                </linearGradient>

                <radialGradient id="cm-grad-ojo">
                    <stop offset="0%" stop-color="#FFFFFF"/>
                    <stop offset="18%" stop-color="#B8F6FF"/>
                    <stop offset="45%" stop-color="#4DA8FF"/>
                    <stop offset="75%" stop-color="#1E3C8E"/>
                    <stop offset="100%" stop-color="#071126"/>
                </radialGradient>

                <filter id="cm-glow">
                    <feGaussianBlur stdDeviation="1.7" result="blur"/>
                    <feMerge>
                        <feMergeNode in="blur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>

                <filter id="cm-glow-fuerte">
                    <feGaussianBlur stdDeviation="3" result="blur"/>
                    <feMerge>
                        <feMergeNode in="blur"/>
                        <feMergeNode in="blur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>

                <pattern id="cm-patron-sombrero" width="14" height="10" patternUnits="userSpaceOnUse">
                    <path d="M0 5 L7 0 L14 5 L7 10 Z"
                          fill="none"
                          stroke="#56647A"
                          stroke-width="1"
                          opacity=".55"/>
                </pattern>

                <clipPath id="cm-clip-ojo-izq">
                    <ellipse cx="73" cy="111" rx="15" ry="20"/>
                </clipPath>

                <clipPath id="cm-clip-ojo-der">
                    <ellipse cx="127" cy="111" rx="15" ry="20"/>
                </clipPath>
            </defs>

            <ellipse cx="100" cy="155" rx="98" ry="142" fill="url(#cm-aura)" opacity=".65">
                <animate attributeName="opacity"
                         values=".35;.7;.35"
                         dur="3s"
                         repeatCount="indefinite"/>
            </ellipse>

            <g id="cm-capa" data-acc-slot="capa">

                <path fill="url(#cm-grad-capa)"
                      stroke="#4A6FC8"
                      stroke-width="2.2"
                      d="M54 175 C34 181 17 198 11 223 C5 247 7 273 19 294 L47 278 C55 257 61 232 65 204 Z">

                    <animate attributeName="d"
                             dur="3.6s"
                             repeatCount="indefinite"
                             calcMode="spline"
                             keyTimes="0;.33;.66;1"
                             keySplines=".4 0 .6 1;.4 0 .6 1;.4 0 .6 1"
                             values="
                             M54 175 C34 181 17 198 11 223 C5 247 7 273 19 294 L47 278 C55 257 61 232 65 204 Z;
                             M54 175 C28 184 9 196 6 226 C0 252 14 272 30 298 L52 275 C58 255 60 232 65 204 Z;
                             M54 175 C40 178 24 201 17 220 C12 244 2 277 12 290 L44 281 C54 260 62 232 65 204 Z;
                             M54 175 C34 181 17 198 11 223 C5 247 7 273 19 294 L47 278 C55 257 61 232 65 204 Z"/>
                </path>

                <path fill="none"
                      stroke="#00E5FF"
                      stroke-width="2.4"
                      opacity=".95"
                      filter="url(#cm-glow)"
                      d="M19 294 C29 278 39 269 47 257">

                    <animate attributeName="d"
                             dur="3.6s"
                             repeatCount="indefinite"
                             calcMode="spline"
                             keyTimes="0;.33;.66;1"
                             keySplines=".4 0 .6 1;.4 0 .6 1;.4 0 .6 1"
                             values="
                             M19 294 C29 278 39 269 47 257;
                             M30 298 C37 281 45 270 52 256;
                             M12 290 C24 277 36 270 44 259;
                             M19 294 C29 278 39 269 47 257"/>
                </path>

                <path fill="url(#cm-grad-capa)"
                      stroke="#4A6FC8"
                      stroke-width="2.2"
                      d="M146 175 C166 181 183 198 189 223 C195 247 193 273 181 294 L153 278 C145 257 139 232 135 204 Z">

                    <animate attributeName="d"
                             dur="3.6s"
                             begin="-1.3s"
                             repeatCount="indefinite"
                             calcMode="spline"
                             keyTimes="0;.33;.66;1"
                             keySplines=".4 0 .6 1;.4 0 .6 1;.4 0 .6 1"
                             values="
                             M146 175 C166 181 183 198 189 223 C195 247 193 273 181 294 L153 278 C145 257 139 232 135 204 Z;
                             M146 175 C172 184 191 196 194 226 C200 252 186 272 170 298 L148 275 C142 255 140 232 135 204 Z;
                             M146 175 C160 178 176 201 183 220 C188 244 198 277 188 290 L156 281 C146 260 138 232 135 204 Z;
                             M146 175 C166 181 183 198 189 223 C195 247 193 273 181 294 L153 278 C145 257 139 232 135 204 Z"/>
                </path>

                <path fill="none"
                      stroke="#00E5FF"
                      stroke-width="2.4"
                      opacity=".95"
                      filter="url(#cm-glow)"
                      d="M181 294 C171 278 161 269 153 257">

                    <animate attributeName="d"
                             dur="3.6s"
                             begin="-1.3s"
                             repeatCount="indefinite"
                             calcMode="spline"
                             keyTimes="0;.33;.66;1"
                             keySplines=".4 0 .6 1;.4 0 .6 1;.4 0 .6 1"
                             values="
                             M181 294 C171 278 161 269 153 257;
                             M170 298 C163 281 155 270 148 256;
                             M188 290 C176 277 164 270 156 259;
                             M181 294 C171 278 161 269 153 257"/>
                </path>

                <g fill="#FFFFFF" opacity=".95">
                    <animateTransform attributeName="transform"
                                      type="translate"
                                      values="0,0; -2,1; 1,-1; 0,0"
                                      dur="3.6s"
                                      repeatCount="indefinite"/>

                    <circle cx="25" cy="226" r="1.4">
                        <animate attributeName="opacity"
                                 values="1;0.3;1"
                                 dur="2.2s"
                                 repeatCount="indefinite"/>
                    </circle>

                    <circle cx="34" cy="250" r=".9">
                        <animate attributeName="opacity"
                                 values="1;0.3;1"
                                 dur="2.8s"
                                 repeatCount="indefinite"
                                 begin="0.4s"/>
                    </circle>

                    <circle cx="28" cy="268" r=".7">
                        <animate attributeName="opacity"
                                 values="1;0.3;1"
                                 dur="3.1s"
                                 repeatCount="indefinite"
                                 begin="0.8s"/>
                    </circle>

                    <circle cx="43" cy="215" r=".8">
                        <animate attributeName="opacity"
                                 values="1;0.3;1"
                                 dur="2.5s"
                                 repeatCount="indefinite"
                                 begin="1.2s"/>
                    </circle>

                    <circle cx="176" cy="226" r="1.4">
                        <animate attributeName="opacity"
                                 values="1;0.3;1"
                                 dur="2.4s"
                                 repeatCount="indefinite"
                                 begin="0.6s"/>
                    </circle>

                    <circle cx="166" cy="249" r=".9">
                        <animate attributeName="opacity"
                                 values="1;0.3;1"
                                 dur="3s"
                                 repeatCount="indefinite"
                                 begin="1s"/>
                    </circle>

                    <circle cx="172" cy="267" r=".7">
                        <animate attributeName="opacity"
                                 values="1;0.3;1"
                                 dur="2.7s"
                                 repeatCount="indefinite"
                                 begin="1.4s"/>
                    </circle>

                    <circle cx="158" cy="215" r=".8">
                        <animate attributeName="opacity"
                                 values="1;0.3;1"
                                 dur="2.9s"
                                 repeatCount="indefinite"
                                 begin="1.8s"/>
                    </circle>
                </g>

                <g fill="#FFFFFF" filter="url(#cm-glow)">
                    <animateTransform attributeName="transform"
                                      type="translate"
                                      values="0,0; -2,1; 1,-1; 0,0"
                                      dur="3.6s"
                                      repeatCount="indefinite"/>

                    <path d="M30 242 l2.2 5 l5 2.2 l-5 2.2 l-2.2 5 l-2.2-5 l-5-2.2 l5-2.2z">
                        <animate attributeName="opacity"
                                 values="1;0.4;1"
                                 dur="3.2s"
                                 repeatCount="indefinite"/>
                    </path>

                    <path d="M171 238 l1.8 4 l4 1.8 l-4 1.8 l-1.8 4 l-1.8-4 l-4-1.8 l4-1.8z">
                        <animate attributeName="opacity"
                                 values="1;0.4;1"
                                 dur="3.6s"
                                 repeatCount="indefinite"
                                 begin="0.7s"/>
                    </path>
                </g>
            </g>

            <g id="cm-cuerpo">

                <g id="cm-pierna-izq" class="cm-pierna">
                    <path d="M70 230 L94 230 L96 267 L88 280 L69 275 L67 250 Z"
                          fill="url(#cm-grad-pantalon)"
                          stroke="#6C7A89"
                          stroke-width="2"/>

                    <path d="M80 237 L78 269"
                          stroke="#AAB8C8"
                          stroke-width="1.2"/>

                    <path d="M69 252 Q80 246 91 252 L90 266 Q80 271 70 266 Z"
                          fill="#E4E8ED"
                          stroke="#5E6D7C"
                          stroke-width="2"/>

                    <path d="M72 254 Q80 250 88 254"
                          fill="none"
                          stroke="#00E5FF"
                          stroke-width="1.4"
                          filter="url(#cm-glow)"/>
                </g>

                <g id="cm-pierna-der" class="cm-pierna">
                    <path d="M106 230 L130 230 L133 250 L131 275 L112 280 L104 267 Z"
                          fill="url(#cm-grad-pantalon)"
                          stroke="#6C7A89"
                          stroke-width="2"/>

                    <path d="M120 237 L122 269"
                          stroke="#AAB8C8"
                          stroke-width="1.2"/>

                    <path d="M109 252 Q120 246 131 252 L130 266 Q120 271 110 266 Z"
                          fill="#E4E8ED"
                          stroke="#5E6D7C"
                          stroke-width="2"/>

                    <path d="M112 254 Q120 250 128 254"
                          fill="none"
                          stroke="#00E5FF"
                          stroke-width="1.4"
                          filter="url(#cm-glow)"/>
                </g>

                <g id="cm-botas" data-acc-slot="pies">
                    <path d="M66 267 Q77 264 90 270 L93 283 Q92 290 83 293 L57 293 Q52 289 57 284 L66 278 Z"
                          fill="url(#cm-grad-botas)"
                          stroke="#4D6074"
                          stroke-width="2"/>

                    <path d="M107 270 Q120 264 134 267 L143 278 Q148 284 143 290 Q139 293 117 293 L107 289 Z"
                          fill="url(#cm-grad-botas)"
                          stroke="#4D6074"
                          stroke-width="2"/>

                    <path d="M62 283 Q75 278 89 283"
                          fill="none"
                          stroke="#00E5FF"
                          stroke-width="2.2"
                          filter="url(#cm-glow)"/>

                    <path d="M111 283 Q124 278 140 283"
                          fill="none"
                          stroke="#00E5FF"
                          stroke-width="2.2"
                          filter="url(#cm-glow)"/>

                    <path d="M57 290 Q74 294 90 289 M109 289 Q126 294 143 288"
                          fill="none"
                          stroke="#121A26"
                          stroke-width="3"/>
                </g>

                <g id="cm-torso" data-acc-slot="torso">
                    <path d="M65 148 Q100 137 135 148 L145 217 Q128 232 100 232 Q72 232 55 217 Z"
                          fill="url(#cm-grad-traje)"
                          stroke="#53657A"
                          stroke-width="2.2"/>

                    <path d="M72 151 L91 157 L100 171 L109 157 L128 151 L136 211 L119 220 L100 216 L81 220 L64 211 Z"
                          fill="#0A1018"
                          stroke="#00E5FF"
                          stroke-width="2"/>

                    <path d="M91 157 L100 171 L109 157 L106 207 L94 207 Z"
                          fill="#05080E"
                          stroke="#3A567F"
                          stroke-width="1.3"/>

                    <path d="M86 151 L100 168 L114 151 L108 146 L100 158 L92 146 Z"
                          fill="#0F1A28"
                          stroke="#8AA8D0"
                          stroke-width="1.3"/>

                    <g fill="#E0ECFF" stroke="#4A6080" stroke-width="1">
                        <circle cx="100" cy="178" r="2"/>
                        <circle cx="100" cy="188" r="2"/>
                        <circle cx="100" cy="198" r="2"/>
                    </g>

                    <g fill="none" stroke="#C7D9EE" stroke-width="1.2">
                        <path d="M75 158 Q82 169 87 178"/>
                        <path d="M125 158 Q118 169 113 178"/>
                        <path d="M75 192 Q82 201 87 208"/>
                        <path d="M125 192 Q118 201 113 208"/>
                    </g>

                    <path d="M67 151 Q60 179 65 210 M133 151 Q140 179 135 210"
                          fill="none"
                          stroke="#00E5FF"
                          stroke-width="2.4"
                          filter="url(#cm-glow)"/>

                    <g>
                        <animateTransform attributeName="transform"
                                          type="scale"
                                          values="1;1.05;1"
                                          dur="2s"
                                          repeatCount="indefinite"
                                          additive="sum"/>

                        <path d="M100 181 L103 188 L111 188 L105 193 L108 201 L100 196 L92 201 L95 193 L89 188 L97 188 Z"
                              fill="#00E5FF"
                              filter="url(#cm-glow)">

                            <animate attributeName="opacity"
                                     values=".85;1;.85"
                                     dur="1.8s"
                                     repeatCount="indefinite"/>
                        </path>
                    </g>

                    <path d="M66 151 Q57 153 53 163 L64 171 L73 157 Z"
                          fill="#0F1824"
                          stroke="#00E5FF"
                          stroke-width="1.6"/>

                    <path d="M134 151 Q143 153 147 163 L136 171 L127 157 Z"
                          fill="#0F1824"
                          stroke="#00E5FF"
                          stroke-width="1.6"/>
                </g>

                <g id="cm-brazo-izq" class="cm-brazo">
                    <path d="M66 158 Q54 158 47 170 L39 199 Q43 207 52 208 L64 179 L76 168 Z"
                          fill="url(#cm-grad-traje)"
                          stroke="#56697D"
                          stroke-width="2"/>

                    <path d="M52 166 Q45 182 45 198"
                          fill="none"
                          stroke="#00E5FF"
                          stroke-width="2.2"
                          filter="url(#cm-glow)"/>

                    <g>
                        <animateTransform attributeName="transform"
                                          type="rotate"
                                          values="10 45 200;-12 45 200;10 45 200"
                                          dur="1.3s"
                                          begin="0.3s"
                                          repeatCount="indefinite"
                                          calcMode="spline"
                                          keyTimes="0;.5;1"
                                          keySplines=".45 0 .55 1;.45 0 .55 1"/>

                        <g id="cm-mano-izq" class="cm-mano">
                            <path d="M39 198 Q32 200 31 208 Q32 218 42 222 Q51 224 55 216 L55 207 Q48 199 39 198 Z"
                                  fill="url(#cm-grad-cabeza)"
                                  stroke="#596979"
                                  stroke-width="2"/>

                            <path d="M38 207 Q44 211 50 207"
                                  fill="none"
                                  stroke="#A6B4C3"
                                  stroke-width="1.2"/>
                        </g>
                    </g>
                </g>

                <g id="cm-brazo-der" class="cm-brazo">
                    <path d="M134 158 Q146 158 153 170 L162 193 Q158 202 149 204 L136 179 L124 168 Z"
                          fill="url(#cm-grad-traje)"
                          stroke="#56697D"
                          stroke-width="2"/>

                    <path d="M148 166 Q155 181 157 194"
                          fill="none"
                          stroke="#00E5FF"
                          stroke-width="2.2"
                          filter="url(#cm-glow)"/>

                    <path d="M149 193 Q158 189 164 196 L164 207 Q158 214 149 210 L143 201 Z"
                          fill="#0A0E18"
                          stroke="#596979"
                          stroke-width="2"/>

                    <g>
                        <animateTransform attributeName="transform"
                                          type="rotate"
                                          values="-16 158 198;18 158 198;-16 158 198"
                                          dur="0.9s"
                                          repeatCount="indefinite"
                                          calcMode="spline"
                                          keyTimes="0;.5;1"
                                          keySplines=".45 0 .55 1;.45 0 .55 1"/>

                        <g id="cm-mano-der" class="cm-mano">
                            <path d="M157 193 Q158 181 165 175 Q171 168 177 172 Q181 176 178 181 Q184 177 188 181 Q191 186 186 190 Q191 188 194 193 Q195 199 188 202 Q178 207 168 203 L158 200 Z"
                                  fill="url(#cm-grad-cabeza)"
                                  stroke="#596979"
                                  stroke-width="2"/>

                            <path d="M178 181 L183 187 M187 190 L181 193 M174 202 L171 194"
                                  fill="none"
                                  stroke="#9DAAB7"
                                  stroke-width="1.2"
                                  stroke-linecap="round"/>
                        </g>
                    </g>
                </g>

                <g id="cm-cinturon" data-acc-slot="cinturon">
                    <path d="M64 218 Q100 226 136 218 L137 231 Q100 240 63 231 Z"
                          fill="#05080E"
                          stroke="#3E4E61"
                          stroke-width="2"/>

                    <path d="M100 218 L105 226 L114 226 L107 232 L110 241 L100 235 L90 241 L93 232 L86 226 L95 226 Z"
                          fill="#E8F4FF"
                          stroke="#00E5FF"
                          stroke-width="2"
                          filter="url(#cm-glow)"/>
                </g>

                <g id="cm-cabeza-grupo">

                    <g>
                        <circle cx="45" cy="111" r="15"
                                fill="#E7EBF0"
                                stroke="#667687"
                                stroke-width="2"/>

                        <circle cx="155" cy="111" r="15"
                                fill="#E7EBF0"
                                stroke="#667687"
                                stroke-width="2"/>

                        <circle cx="45" cy="111" r="8"
                                fill="#111B2A"
                                stroke="#00E5FF"
                                stroke-width="1.5"
                                filter="url(#cm-glow)"/>

                        <circle cx="155" cy="111" r="8"
                                fill="#111B2A"
                                stroke="#00E5FF"
                                stroke-width="1.5"
                                filter="url(#cm-glow)"/>
                    </g>

                    <rect x="48"
                          y="68"
                          width="104"
                          height="96"
                          rx="40"
                          fill="url(#cm-grad-cabeza)"
                          stroke="#687888"
                          stroke-width="2.5"/>

                    <path d="M66 90 Q76 84 87 86"
                          fill="none"
                          stroke="#FFFFFF"
                          stroke-width="3"
                          opacity=".75"/>

                    <g id="cm-ojo-izq">
                        <ellipse cx="73" cy="111" rx="16" ry="21"
                                 fill="url(#cm-grad-ojo)"
                                 stroke="#1A2742"
                                 stroke-width="2"/>

                        <g clip-path="url(#cm-clip-ojo-izq)">
                            <g>
                                <animateTransform attributeName="transform"
                                                  type="rotate"
                                                  from="0 73 111"
                                                  to="360 73 111"
                                                  dur="2.6s"
                                                  repeatCount="indefinite"/>

                                <path d="${espiral(73, 111, 0)}"
                                      fill="none"
                                      stroke="#00E5FF"
                                      stroke-width="2.2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      filter="url(#cm-glow)"/>

                                <path d="${espiral(73, 111, Math.PI)}"
                                      fill="none"
                                      stroke="#E9A8FF"
                                      stroke-width="1.6"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      opacity=".9"/>
                            </g>
                        </g>

                        <ellipse cx="73" cy="111" rx="16" ry="21"
                                 fill="none"
                                 stroke="#00E5FF"
                                 stroke-width="1.2"
                                 opacity=".7"
                                 filter="url(#cm-glow)">

                            <animate attributeName="opacity"
                                     values=".35;.9;.35"
                                     dur="1.6s"
                                     repeatCount="indefinite"/>
                        </ellipse>

                        <circle cx="67" cy="105" r="3" fill="#FFFFFF"/>
                        <circle cx="78" cy="116" r="2" fill="#E9A8FF"/>
                        <circle cx="70" cy="121" r="1.5" fill="#FFFFFF"/>

                        <ellipse id="cm-pupila-izq"
                                 cx="73"
                                 cy="111"
                                 rx="3.2"
                                 ry="4.2"
                                 fill="#FFFFFF"
                                 filter="url(#cm-glow)">

                            <animate attributeName="opacity"
                                     values=".75;1;.75"
                                     dur="1.4s"
                                     repeatCount="indefinite"/>
                        </ellipse>
                    </g>

                    <g id="cm-ojo-der">
                        <ellipse cx="127" cy="111" rx="16" ry="21"
                                 fill="url(#cm-grad-ojo)"
                                 stroke="#1A2742"
                                 stroke-width="2"/>

                        <g clip-path="url(#cm-clip-ojo-der)">
                            <g>
                                <animateTransform attributeName="transform"
                                                  type="rotate"
                                                  from="0 127 111"
                                                  to="360 127 111"
                                                  dur="2.6s"
                                                  repeatCount="indefinite"/>

                                <path d="${espiral(127, 111, 0)}"
                                      fill="none"
                                      stroke="#00E5FF"
                                      stroke-width="2.2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      filter="url(#cm-glow)"/>

                                <path d="${espiral(127, 111, Math.PI)}"
                                      fill="none"
                                      stroke="#E9A8FF"
                                      stroke-width="1.6"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      opacity=".9"/>
                            </g>
                        </g>

                        <ellipse cx="127" cy="111" rx="16" ry="21"
                                 fill="none"
                                 stroke="#00E5FF"
                                 stroke-width="1.2"
                                 opacity=".7"
                                 filter="url(#cm-glow)">

                            <animate attributeName="opacity"
                                     values=".35;.9;.35"
                                     dur="1.6s"
                                     repeatCount="indefinite"
                                     begin="0.4s"/>
                        </ellipse>

                        <circle cx="121" cy="105" r="3" fill="#FFFFFF"/>
                        <circle cx="132" cy="116" r="2" fill="#E9A8FF"/>
                        <circle cx="124" cy="121" r="1.5" fill="#FFFFFF"/>

                        <ellipse id="cm-pupila-der"
                                 cx="127"
                                 cy="111"
                                 rx="3.2"
                                 ry="4.2"
                                 fill="#FFFFFF"
                                 filter="url(#cm-glow)">

                            <animate attributeName="opacity"
                                     values=".75;1;.75"
                                     dur="1.4s"
                                     repeatCount="indefinite"
                                     begin="0.3s"/>
                        </ellipse>
                    </g>

                    <path id="cm-boca"
                          class="cm-pet-boca"
                          d="M78 137 Q100 150 122 137"
                          fill="none"
                          stroke="#0A0A0A"
                          stroke-width="3"/>
                </g>

                <g id="cm-sombrero" data-acc-slot="sombrero">

                    <g transform="rotate(-4 100 79)">

                        <ellipse cx="100"
                                 cy="79"
                                 rx="91"
                                 ry="15"
                                 fill="url(#cm-grad-sombrero)"
                                 stroke="#4A5C72"
                                 stroke-width="2.5"/>

                        <ellipse cx="100"
                                 cy="79"
                                 rx="79"
                                 ry="10"
                                 fill="url(#cm-patron-sombrero)"
                                 opacity=".8"/>

                        <ellipse cx="100"
                                 cy="79"
                                 rx="90"
                                 ry="14"
                                 fill="none"
                                 stroke="#00E5FF"
                                 stroke-width="2.6"
                                 filter="url(#cm-glow)"/>

                        <ellipse cx="100"
                                 cy="82"
                                 rx="81"
                                 ry="10"
                                 fill="none"
                                 stroke="#4DA8FF"
                                 stroke-width="1.4"
                                 opacity=".8"/>

                        <path d="
                            M70 79
                            Q68 50 75 31
                            Q82 12 100 11
                            Q118 12 125 31
                            Q132 50 130 79
                            Q100 87 70 79
                            Z"
                              fill="url(#cm-grad-sombrero)"
                              stroke="#4A5C72"
                              stroke-width="2.5"/>

                        <path d="
                            M70 72
                            Q100 80 130 72
                            L130 79
                            Q100 87 70 79
                            Z"
                              fill="#03060C"
                              opacity=".72"/>

                        <path d="M79 22 Q76 42 79 65"
                              fill="none"
                              stroke="#FFFFFF"
                              stroke-width="2"
                              opacity=".24"
                              stroke-linecap="round"/>

                        <path d="M84 20 Q81 39 83 54"
                              fill="none"
                              stroke="#8FA5BF"
                              stroke-width="1"
                              opacity=".22"
                              stroke-linecap="round"/>

                        <path d="M100 19
                                 L103 27
                                 L112 28
                                 L105 34
                                 L107 43
                                 L100 38
                                 L93 43
                                 L95 34
                                 L88 28
                                 L97 27
                                 Z"
                              fill="none"
                              stroke="#8FA5BF"
                              stroke-width="1.4"
                              stroke-linejoin="round"
                              opacity=".95"/>

                        <circle cx="100"
                                cy="30"
                                r="1.8"
                                fill="#00E5FF"
                                filter="url(#cm-glow)">

                            <animate attributeName="opacity"
                                     values=".6;1;.6"
                                     dur="2s"
                                     repeatCount="indefinite"/>
                        </circle>

                        <path d="
                            M70 67
                            Q100 75
                            130 67
                            L130 79
                            Q100 87
                            70 79
                            Z"
                              fill="#05080E"
                              stroke="#00E5FF"
                              stroke-width="1.6"/>

                        <path d="M71 68 Q100 76 129 68"
                              fill="none"
                              stroke="#6CEFFF"
                              stroke-width=".9"
                              opacity=".65"/>

                        <g fill="#FFFFFF" filter="url(#cm-glow)">

                            <circle cx="26"
                                    cy="79"
                                    r="1.4">
                                <animate attributeName="opacity"
                                         values="1;0.4;1"
                                         dur="2s"
                                         repeatCount="indefinite"/>
                            </circle>

                            <circle cx="174"
                                    cy="79"
                                    r="1.4">
                                <animate attributeName="opacity"
                                         values="1;0.4;1"
                                         dur="2.3s"
                                         repeatCount="indefinite"
                                         begin="0.5s"/>
                            </circle>

                            <circle cx="52"
                                    cy="87"
                                    r="1.1">
                                <animate attributeName="opacity"
                                         values="1;0.4;1"
                                         dur="2.6s"
                                         repeatCount="indefinite"
                                         begin="1s"/>
                            </circle>

                            <circle cx="148"
                                    cy="87"
                                    r="1.1">
                                <animate attributeName="opacity"
                                         values="1;0.4;1"
                                         dur="2.9s"
                                         repeatCount="indefinite"
                                         begin="1.5s"/>
                            </circle>

                            <circle cx="60"
                                    cy="73"
                                    r="1">
                                <animate attributeName="opacity"
                                         values="1;0.4;1"
                                         dur="2.2s"
                                         repeatCount="indefinite"
                                         begin="0.3s"/>
                            </circle>

                            <circle cx="140"
                                    cy="73"
                                    r="1">
                                <animate attributeName="opacity"
                                         values="1;0.4;1"
                                         dur="3.2s"
                                         repeatCount="indefinite"
                                         begin="0.8s"/>
                            </circle>

                        </g>

                    </g>
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
    aplicarResonancia();
    cambiarVisema('REST');

    (async function() {
        const terminosOk = await verificarTerminos();

        if (terminosOk) {
            setTimeout(function() {
                if (window.CapitanMaizAnim &&
                    typeof window.CapitanMaizAnim.iniciar === 'function') {
                    window.CapitanMaizAnim.iniciar();
                }
            }, 500);
        }
    })();

    log('Widget v2.7 creado · sombrero totalmente asentado · ojos remolino · manos saludando · capa al viento');
}
    function setEstado(e) {
        if (container) {
            container.setAttribute('data-estado', e);
        }

        if (e === 'escuchando' && container) {
            container.classList.add('cm-resonando');
        } else if (container) {
            container.classList.remove('cm-resonando');
        }

        if (window.CapitanMaizAnim &&
            typeof window.CapitanMaizAnim.setEstado === 'function') {
            window.CapitanMaizAnim.setEstado(e);
        }
    }

    function mostrarBurbuja(texto) {
        if (!config.mostrar_subtitulos) return;
        if (!bubble) return;

        const t = document.getElementById('cm-bubble-text');
        const corto = texto.length > 160
            ? texto.slice(0, 157) + '…'
            : texto;

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
                mostrarBurbuja(
                    'Tu navegador no soporta reconocimiento de voz.'
                );

                setTimeout(ocultarBurbuja, 4000);
            }
        }
    }

    async function hablar(texto) {
        if (!texto) return false;

        detenerTTS();

        const miToken = ++ttsToken;

        const estilo =
            VOZ_ESTILOS[config.estilo_voz] ||
            VOZ_ESTILOS.sabio;

        const pitchBase =
            TONO_PITCH[config.tono] || 1.0;

        const rate =
            estilo.rate * (config.velocidad || 1.0);

        const pitch =
            estilo.pitch * pitchBase;

        const volumen =
            Math.max(
                0,
                Math.min(1, config.volumen || 1)
            );

        if (config.mostrar_subtitulos) {
            mostrarBurbuja(texto);
        }

        isSpeaking = true;
        setEstado('hablando');
        animarBoca(texto, rate);

        let ok = false;

        const ttsBackendDisponible =
            Date.now() - _ttsBackendFalloEn > TTS_FALLO_TTL_MS;

        if (
            texto.length <= 300 &&
            window.getSupabase &&
            ttsBackendDisponible
        ) {
            try {
                const sb = window.getSupabase();

                const s = await sb.auth.getSession();

                if (
                    s.data.session &&
                    miToken === ttsToken
                ) {
                    const resp = await fetch(
                        '/api/ai/voice/tts',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization':
                                    'Bearer ' +
                                    s.data.session.access_token
                            },
                            body: JSON.stringify({
                                text: texto,
                                rate: rate,
                                pitch: pitch,
                                character: 'capitan-maiz'
                            })
                        }
                    );

                    if (resp.ok) {
                        const data = await resp.json();

                        const url =
                            data.audio_url ||
                            data.audioUrl;

                        if (
                            url &&
                            miToken === ttsToken
                        ) {
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

        if (
            !ok &&
            miToken === ttsToken
        ) {
            await hablarNavegador(
                texto,
                rate,
                pitch,
                volumen,
                miToken
            );
        }

        const completo =
            miToken === ttsToken;

        if (completo) {
            isSpeaking = false;
            setEstado('idle');
            detenerAnimacionBoca();

            setTimeout(function() {
                if (
                    !isSpeaking &&
                    !isListening &&
                    !procesando
                ) {
                    ocultarBurbuja();
                }
            }, 2500);
        }

        return completo;
    }

    function dividirEnFrases(texto) {
        const partes =
            texto.split(/(?<=[.!?…\n])\s+/);

        const out = [];
        let acc = '';

        partes.forEach(function(p) {
            if (
                (acc + ' ' + p).length > 170 &&
                acc
            ) {
                out.push(acc.trim());
                acc = p;
            } else {
                acc = acc
                    ? acc + ' ' + p
                    : p;
            }
        });

        if (acc.trim()) {
            out.push(acc.trim());
        }

        return out;
    }

    async function hablarNavegador(
        texto,
        rate,
        pitch,
        volumen,
        miToken
    ) {
        if (!window.speechSynthesis) return;

        window.speechSynthesis.cancel();

        const frases =
            dividirEnFrases(texto);

        for (let i = 0; i < frases.length; i++) {
            if (miToken !== ttsToken) return;

            await new Promise(function(resolve) {
                const u =
                    new SpeechSynthesisUtterance(
                        frases[i]
                    );

                u.lang =
                    config.idioma || 'es-MX';

                u.rate =
                    Math.max(
                        .5,
                        Math.min(2, rate)
                    );

                u.pitch =
                    Math.max(
                        .5,
                        Math.min(2, pitch)
                    );

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

                audioActual.volume =
                    Math.max(
                        0,
                        Math.min(
                            1,
                            config.volumen || 1
                        )
                    );

                audioActual.onended =
                    function() {
                        audioActual = null;
                        resolve();
                    };

                audioActual.onerror =
                    function() {
                        audioActual = null;
                        resolve();
                    };

                audioActual.play().catch(
                    function() {
                        resolve();
                    }
                );
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
        const SR =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;

        if (!SR) return false;

        if (
            recognitionActive &&
            recognition
        ) {
            return true;
        }

        try {
            recognition = new SR();

            recognition.lang =
                config.idioma || 'es-MX';

            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recibioResultado = false;

            recognition.onstart =
                function() {
                    recognitionActive = true;
                    isListening = true;
                    setEstado('escuchando');
                };

            recognition.onresult =
                function(event) {
                    const transcript =
                        event.results[0][0]
                            .transcript
                            .trim();

                    if (!transcript) return;

                    recibioResultado = true;

                    const lower =
                        transcript.toLowerCase();

                    if (
                        /(adiós|adios|hasta luego|nos vemos|ya no|nos vidrios)/
                            .test(lower) &&
                        lower.length < 30
                    ) {
                        conversacionActiva = false;

                        historialLocal.push({
                            role: 'user',
                            content: transcript,
                            ts: Date.now()
                        });

                        hablar(
                            '¡Nos vidrios, paisano! Aquí andaré cuando me necesites.'
                        ).then(function() {
                            guardarHistorial();
                        });

                        return;
                    }

                    if (
                        /(olvida (todo|lo que hablamos)|borra (la )?conversaci[oó]n|empecemos de nuevo)/
                            .test(lower)
                    ) {
                        olvidarTodo();

                        hablar(
                            'Listo, borrón y cuenta nueva. Empecemos de cero.'
                        ).then(function() {
                            if (conversacionActiva) {
                                iniciarReconocimiento();
                            }
                        });

                        return;
                    }

                    procesarComando(transcript);
                };

            recognition.onerror =
                function(event) {
                    recognitionActive = false;
                    isListening = false;
                    recognition = null;

                    if (
                        event.error === 'not-allowed' ||
                        event.error === 'service-not-allowed'
                    ) {
                        conversacionActiva = false;
                        setEstado('idle');

                        if (config.mostrar_subtitulos) {
                            mostrarBurbuja(
                                'Permite el micrófono, paisano.'
                            );

                            setTimeout(
                                ocultarBurbuja,
                                5000
                            );
                        }
                    } else {
                        setEstado('idle');
                    }
                };

            recognition.onend =
                function() {
                    recognitionActive = false;
                    isListening = false;
                    recognition = null;

                    if (
                        !procesando &&
                        !isSpeaking
                    ) {
                        setEstado('idle');
                    }

                    if (
                        !recibioResultado &&
                        !procesando &&
                        !isSpeaking
                    ) {
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
        if (
            recognition &&
            recognitionActive
        ) {
            try {
                recognition.abort
                    ? recognition.abort()
                    : recognition.stop();
            } catch (e) {}
        }

        recognitionActive = false;
        isListening = false;
    }

    async function procesarComando(texto) {
        if (!texto) return;

        const miConversacionToken =
            ++conversationToken;

        procesando = true;

        setEstado('pensando');
        cambiarVisema('M');

        try {
            historialLocal.push({
                role: 'user',
                content: texto,
                ts: Date.now()
            });

            let respuesta = '';

            if (
                window.CapitanMaizBrain &&
                typeof window.CapitanMaizBrain.preguntar === 'function'
            ) {
                try {
                    const historialTruncado =
                        historialLocal.slice(
                            -HIST_MAX_ENVIO
                        );

                    respuesta =
                        await window.CapitanMaizBrain.preguntar(
                            texto,
                            historialTruncado
                        );

                } catch (e) {
                    respuesta =
                        'Ay, paisano. Tuve un cortocircuito en el sombrero. ¿Me repites?';
                }

            } else {
                respuesta =
                    'Ahorita no puedo pensar, pero aquí sigo, firme como el maíz.';
            }

            if (
                miConversacionToken !==
                conversationToken
            ) {
                return;
            }

            if (!respuesta) {
                respuesta =
                    'No supe qué decirte, pero aquí andamos.';
            }

            historialLocal.push({
                role: 'assistant',
                content: respuesta,
                ts: Date.now()
            });

            guardarHistorial();

            subirResonancia();

            procesando = false;

            const completo =
                await hablar(respuesta);

            if (
                completo &&
                conversacionActiva &&
                miConversacionToken ===
                    conversationToken
            ) {
                recibioResultado = false;

                setTimeout(function() {
                    if (
                        conversacionActiva &&
                        !isSpeaking &&
                        !isListening &&
                        !procesando
                    ) {
                        iniciarReconocimiento();
                    }
                }, 300);
            }

        } catch (e) {
            console.error(
                '[Capitán Maíz] Error en procesarComando:',
                e
            );

        } finally {
            procesando = false;

            if (
                !isSpeaking &&
                !isListening
            ) {
                setEstado('idle');
            }
        }
    }

    function instalarVisibility() {
        document.addEventListener(
            'visibilitychange',
            function() {
                if (document.hidden) {
                    detenerConversacion();
                }
            }
        );
    }

    window.CapitanMaiz = {
        hablar: hablar,

        procesar: procesarComando,

        olvidar: olvidarTodo,

        recargarAccesorios:
            async function() {
                await cargarAccesorios();
                renderAccesoriosEnAvatar();
            },

        setModoSubtitulos:
            function(activo) {
                config.mostrar_subtitulos =
                    !!activo;

                guardarConfig();
                aplicarModo();
            },

        getModoSubtitulos:
            function() {
                return !!config.mostrar_subtitulos;
            },

        getHistorial:
            function() {
                return historialLocal.slice();
            },

        getConfig:
            function() {
                return { ...config };
            },

        setConfig:
            function(nuevos) {
                config = {
                    ...config,
                    ...nuevos
                };

                guardarConfig();
                aplicarModo();
                aplicarTamano();
            },

        resetPosicion:
            function() {
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

        getUserInfo:
            function() {
                return userInfo;
            },

        _visemasDisponibles:
            function() {
                return Object.keys(
                    VISEMAS_SVG
                );
            },

        reiniciarTerminos:
            function() {
                try {
                    localStorage.removeItem(
                        TERMINOS_KEY
                    );
                } catch (e) {}
            },

        getTerminosVersion:
            function() {
                return TERMINOS_VERSION;
            },

        getResonancia:
            function() {
                return resonancia;
            },

        getResonanciaMax:
            function() {
                return RESONANCIA_MAX;
            }
    };

    async function init() {
        if (rutaExcluida()) return;

        cargarConfig();

        if (!config.activo) return;

        await cargarUsuario();

        cargarHistorial();
        cargarResonancia();

        await cargarAccesorios();

        crearWidget();
        instalarVisibility();

        log('✅ Capitán Maíz v2.7 activo');
    }

    if (
        document.readyState === 'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            init
        );
    } else {
        init();
    }

})();