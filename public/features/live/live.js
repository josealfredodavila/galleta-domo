/* ================================================================
   LIVE ULTRA MEGA PRO - SARIEL'S
   Lógica premium competitiva con Silicon Valley
   ================================================================ */

// ================================================================
// TOAST
// ================================================================
function showToast(msg, type = '') {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show';
    if (type === 'error') t.classList.add('error');
    else if (type === 'warning') t.classList.add('warning');
    else t.classList.remove('error', 'warning');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}

// ================================================================
// SUPABASE CLIENTE
// ================================================================
const SUPABASE_URL = 'https://hbbwopkfpkvahgtawqke.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j';
let supabase = null;

if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('◉ Supabase cliente inicializado en live.js');
}

// ================================================================
// API URL - PRODUCCIÓN (RAILWAY)
// ================================================================
const API_URL = '/api';

// ================================================================
// HEADERS DE AUTENTICACIÓN
// ================================================================
async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (supabase) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }
        } catch (e) {
            console.warn('No se pudo obtener sesión de Supabase:', e);
        }
    }
    return headers;
}

async function fetchWithAuth(url, options = {}) {
    const headers = await getAuthHeaders();
    return fetch(url, {
        ...options,
        headers: {
            ...headers,
            ...(options.headers || {})
        }
    });
}

// ================================================================
// VARIABLES GLOBALES
// ================================================================
let localStream = null;
let isPlaying = false;
let isMuted = false;
let isLive = false;
let chatMessages = [];
let viewersCount = 0;
let streamsList = [];
let peerConnections = [];
let currentRoom = null;
let livekitToken = null;
let socket = null;
let isVoiceActive = false; // Lector de voz activo/inactivo

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    initStars();
    actualizarViewers();
    cargarStreams();
    iniciarSocket();

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') enviarMensaje();
        });
    }

    console.log('◉ Sariel\'s - Live Ultra Mega Pro');
    console.log('🔴 Sistema de transmisiones en vivo');
});

// ================================================================
// LECTOR DE VOZ (WEB SPEECH API - GRATIS)
// ================================================================
function toggleVoice() {
    isVoiceActive = !isVoiceActive;
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) {
        voiceBtn.classList.toggle('voice-active', isVoiceActive);
        voiceBtn.textContent = isVoiceActive ? '🔊' : '🔇';
    }
    showToast(isVoiceActive ? '🔊 Lector de voz activado' : '🔇 Lector de voz desactivado');
}

function leerMensaje(texto) {
    if (!isVoiceActive || !texto) return;
    
    // Usar la Web Speech API (gratis)
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'es-ES';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

// ================================================================
// SOCKET.IO (para chat en tiempo real)
// ================================================================
function iniciarSocket() {
    try {
        const socketUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:3001'
            : window.location.origin;

        socket = io(socketUrl, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 5
        });

        socket.on('connect', () => {
            console.log('◈ Conectado al servidor de Live');
        });

        socket.on('live_message', (data) => {
            if (data.room === currentRoom || !currentRoom) {
                const msg = {
                    nombre: data.userName || 'Usuario',
                    avatar: data.userAvatar || '◈',
                    texto: data.message,
                    hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
                chatMessages.push(msg);
                renderizarMensaje(msg);
                actualizarContadorChat();
                
                // Lector de voz: leer solo si está activo
                leerMensaje(`${msg.nombre} dice: ${msg.texto}`);
            }
        });

        socket.on('live_viewers', (data) => {
            if (data.room === currentRoom || !currentRoom) {
                viewersCount = data.count || viewersCount;
                actualizarViewers();
            }
        });

        socket.on('disconnect', () => {
            console.log('◈ Desconectado del servidor de Live');
        });

    } catch (error) {
        console.warn('⚠️ Socket.IO no disponible, modo offline:', error);
    }
}

// ================================================================
// OBTENER TOKEN DE LIVEKIT
// ================================================================
async function obtenerTokenLiveKit(roomName, participantName) {
    try {
        const response = await fetchWithAuth(`${API_URL}/token?room=${roomName}&name=${participantName}`);
        if (response.ok) {
            const data = await response.json();
            return data.token;
        } else {
            console.warn('Error obteniendo token LiveKit, usando modo simulado');
            return null;
        }
    } catch (error) {
        console.warn('Error obteniendo token LiveKit:', error);
        return null;
    }
}

// ================================================================
// INICIAR TRANSMISIÓN
// ================================================================
async function iniciarTransmision() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('⚠️ Tu navegador no soporta transmisiones', 'error');
            return;
        }

        const session = await getSession();
        if (!session) {
            showToast('⚠️ Conecta tu wallet primero', 'warning');
            return;
        }

        showToast('◉ Solicitando acceso a cámara y micrófono...');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
        });

        localStream = stream;

        const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
        const roomName = `live_${Date.now()}`;
        const participantName = perfil.nombre || 'Explorador';

        const token = await obtenerTokenLiveKit(roomName, participantName);
        if (token) {
            livekitToken = token;
            currentRoom = roomName;
            showToast('✅ Conectado a LiveKit');
        }

        const video = document.getElementById('liveVideo');
        if (video) {
            video.srcObject = stream;
            await video.play();
        }

        isPlaying = true;
        isLive = true;

        const playBtn = document.getElementById('playBtn');
        if (playBtn) playBtn.textContent = '◈';

        const container = document.getElementById('liveVideoContainer');
        if (container) {
            container.style.borderColor = 'var(--live-red)';
            container.style.boxShadow = '0 0 60px var(--live-red-glow)';
        }

        showToast('✅ Transmisión iniciada', 'success');

        viewersCount = Math.floor(Math.random() * 30) + 5;
        actualizarViewers();

        agregarStreamLocal();

        if (socket && socket.connected) {
            socket.emit('live_start', {
                room: roomName,
                host: participantName,
                hostId: session.user.id
            });
        }

        simularMensajes();

    } catch (error) {
        console.error('Error iniciando transmisión:', error);
        if (error.name === 'NotAllowedError') {
            showToast('❌ Permiso denegado para cámara/micrófono', 'error');
        } else {
            showToast('❌ Error al iniciar la transmisión', 'error');
        }
    }
}

// ================================================================
// OBTENER SESIÓN DE SUPABASE
// ================================================================
async function getSession() {
    if (supabase) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            return session;
        } catch (e) {
            console.warn('Error obteniendo sesión:', e);
        }
    }
    return null;
}

// ================================================================
// AGREGAR STREAM LOCAL A LA LISTA
// ================================================================
function agregarStreamLocal() {
    const container = document.getElementById('streamsList');
    if (!container) return;

    const empty = container.querySelector('.empty-state');
    if (empty) empty.remove();

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const nombre = perfil.nombre || 'Explorador';

    const oldLocal = document.getElementById('stream-local');
    if (oldLocal) oldLocal.remove();

    const card = document.createElement('div');
    card.className = 'stream-card';
    card.id = 'stream-local';
    card.innerHTML = `
        <div class="stream-thumb">
            <span class="live-badge">● EN VIVO</span>
            ◉
        </div>
        <div class="stream-name">Transmisión de ${nombre}</div>
        <div class="stream-host">${nombre} · Sariel's</div>
        <div class="stream-viewers">◈ ${viewersCount} espectadores</div>
    `;
    card.onclick = () => showToast('◈ Ya estás viendo tu transmisión');
    container.prepend(card);
}

// ================================================================
// FINALIZAR TRANSMISIÓN
// ================================================================
function finalizarTransmision() {
    if (!isLive) {
        showToast('⚠️ No hay una transmisión activa', 'warning');
        return;
    }

    if (!confirm('¿Finalizar la transmisión?')) return;

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    const video = document.getElementById('liveVideo');
    if (video) video.srcObject = null;

    isPlaying = false;
    isLive = false;

    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.textContent = '◈';

    const container = document.getElementById('liveVideoContainer');
    if (container) {
        container.style.borderColor = '';
        container.style.boxShadow = '';
    }

    const local = document.getElementById('stream-local');
    if (local) local.remove();

    if (socket && socket.connected && currentRoom) {
        socket.emit('live_end', { room: currentRoom });
    }

    currentRoom = null;
    livekitToken = null;

    viewersCount = 0;
    actualizarViewers();

    showToast('🔴 Transmisión finalizada');

    const containerList = document.getElementById('streamsList');
    if (containerList && containerList.children.length === 0) {
        containerList.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;padding:20px;">
                <span class="icon">◉</span>
                <h3>Sin transmisiones activas</h3>
                <p>Sé el primero en iniciar una transmisión</p>
            </div>
        `;
    }
}

// ================================================================
// PLAY/PAUSE
// ================================================================
function togglePlay() {
    const video = document.getElementById('liveVideo');
    const btn = document.getElementById('playBtn');

    if (!video || !video.srcObject) {
        showToast('⚠️ No hay transmisión activa', 'warning');
        return;
    }

    if (isPlaying) {
        video.pause();
        if (btn) btn.textContent = '▶';
        isPlaying = false;
    } else {
        video.play();
        if (btn) btn.textContent = '◈';
        isPlaying = true;
    }
}

// ================================================================
// MUTE/UNMUTE
// ================================================================
function toggleMute() {
    const video = document.getElementById('liveVideo');
    const btn = document.getElementById('muteBtn');

    if (!video || !video.srcObject) {
        showToast('⚠️ No hay transmisión activa', 'warning');
        return;
    }

    isMuted = !isMuted;
    video.muted = isMuted;
    if (btn) {
        btn.textContent = isMuted ? '◌' : '◉';
        btn.className = isMuted ? 'mic muted' : 'mic';
    }
}

// ================================================================
// COMPARTIR PANTALLA
// ================================================================
async function capturarPantalla() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            showToast('⚠️ Tu navegador no soporta compartir pantalla', 'error');
            return;
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        const video = document.getElementById('liveVideo');
        if (video) {
            video.srcObject = screenStream;
            await video.play();
        }

        isPlaying = true;
        const playBtn = document.getElementById('playBtn');
        if (playBtn) playBtn.textContent = '◈';

        showToast('✦ Compartiendo pantalla', 'success');

        screenStream.getVideoTracks()[0].onended = () => {
            if (localStream) {
                video.srcObject = localStream;
                video.play();
                showToast('◈ Volviendo a la cámara');
            }
        };

    } catch (error) {
        console.error('Error compartiendo pantalla:', error);
        if (error.name !== 'NotAllowedError') {
            showToast('❌ Error al compartir pantalla', 'error');
        }
    }
}

// ================================================================
// ENVIAR MENSAJE
// ================================================================
function enviarMensaje() {
    const input = document.getElementById('chatInput');
    if (!input) return;

    const texto = input.value.trim();
    if (!texto) {
        showToast('⚠️ Escribe un mensaje', 'warning');
        return;
    }

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const nombre = perfil.nombre || 'Explorador';
    const avatar = perfil.avatar ? perfil.avatar[0].toUpperCase() : '◈';

    const msg = {
        nombre: nombre,
        avatar: avatar,
        texto: texto,
        hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    chatMessages.push(msg);
    renderizarMensaje(msg);
    input.value = '';
    actualizarContadorChat();

    if (socket && socket.connected && currentRoom) {
        socket.emit('live_message', {
            room: currentRoom,
            userName: nombre,
            userAvatar: avatar,
            message: texto
        });
    }

    if (Math.random() > 0.7) {
        setTimeout(() => {
            const respuestas = [
                '🔥 ¡Buen vibra!',
                '✨ Excelente comentario',
                '🚀 Sariel\'s es lo mejor',
                '💎 Gracias por estar aquí',
                '🎯 ¡Totalmente de acuerdo!',
                '🌟 Eres parte de esta comunidad',
                '◉ ¡Gracias por participar!'
            ];
            const random = respuestas[Math.floor(Math.random() * respuestas.length)];
            const botMsg = {
                nombre: 'Sariel\'s Bot',
                avatar: '◈',
                texto: random,
                hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            chatMessages.push(botMsg);
            renderizarMensaje(botMsg);
            actualizarContadorChat();
            
            leerMensaje(`Nuevo mensaje de ${botMsg.nombre}: ${botMsg.texto}`);
        }, 2000 + Math.random() * 3000);
    }
}

// ================================================================
// RENDERIZAR MENSAJE
// ================================================================
function renderizarMensaje(msg) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const welcome = container.querySelector('.chat-msg:first-child');
    if (welcome && welcome.querySelector('.name')?.textContent === 'Sariel\'s Bot' && chatMessages.length > 1) {
        welcome.remove();
    }

    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `
        <div class="avatar">${msg.avatar || '◈'}</div>
        <div class="msg">
            <span class="name">${msg.nombre}</span>
            <span class="time">${msg.hora}</span>
            <div class="text">${msg.texto}</div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ================================================================
// SIMULAR MENSAJES DE CHAT
// ================================================================
function simularMensajes() {
    const mensajesBienvenida = [
        '🔥 ¡Qué buena transmisión!',
        '✨ Alguien tiene talento',
        '🚀 Sariel\'s en vivo',
        '💎 Esto es increíble',
        '🎯 Me encanta esta comunidad'
    ];

    let index = 0;

    const interval = setInterval(() => {
        if (!isLive) {
            clearInterval(interval);
            return;
        }

        if (index < mensajesBienvenida.length) {
            const nombre = `Usuario${Math.floor(Math.random() * 100)}`;
            const msg = {
                nombre: nombre,
                avatar: '✦',
                texto: mensajesBienvenida[index],
                hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            chatMessages.push(msg);
            renderizarMensaje(msg);
            actualizarContadorChat();
            
            leerMensaje(`${msg.nombre} dice: ${msg.texto}`);
            index++;
        } else {
            clearInterval(interval);
        }
    }, 3000);

    const viewerInterval = setInterval(() => {
        if (!isLive) {
            clearInterval(viewerInterval);
            return;
        }
        if (Math.random() > 0.7) {
            viewersCount += Math.floor(Math.random() * 3);
            actualizarViewers();
        }
    }, 5000);
}

// ================================================================
// ACTUALIZAR VIEWERS
// ================================================================
function actualizarViewers() {
    const el = document.getElementById('viewersCount');
    if (el) el.textContent = `${viewersCount} espectadores`;
}

function actualizarContadorChat() {
    const el = document.getElementById('chatCount');
    if (el) el.textContent = `${chatMessages.length} mensajes`;
}

// ================================================================
// CARGAR STREAMS DESDE EL SERVIDOR
// ================================================================
async function cargarStreams() {
    try {
        const response = await fetchWithAuth(`${API_URL}/live/activos`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.streams) {
                streamsList = data.streams;
                renderizarStreams(streamsList);
                return;
            }
        }
    } catch (error) {
        console.warn('Error cargando streams, usando datos locales:', error);
    }

    streamsList = [];
    renderizarStreams(streamsList);
}

// ================================================================
// RENDERIZAR STREAMS
// ================================================================
function renderizarStreams(streams) {
    const container = document.getElementById('streamsList');
    if (!container) return;

    const local = document.getElementById('stream-local');
    container.innerHTML = '';
    if (local) container.appendChild(local);

    if (streams.length === 0 && !local) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;padding:20px;">
                <span class="icon">◉</span>
                <h3>Sin transmisiones activas</h3>
                <p>Sé el primero en iniciar una transmisión</p>
            </div>
        `;
        return;
    }

    streams.forEach(stream => {
        const card = document.createElement('div');
        card.className = 'stream-card';
        card.onclick = () => unirseTransmision(stream.id);
        card.innerHTML = `
            <div class="stream-thumb">
                ${stream.is_live ? '<span class="live-badge">● EN VIVO</span>' : ''}
                ${stream.room_name ? '◉' : '◈'}
            </div>
            <div class="stream-name">${stream.titulo || 'Transmisión'}</div>
            <div class="stream-host">${stream.usuarios?.nombre || stream.host || 'Anfitrión'} · Sariel's</div>
            <div class="stream-viewers">◈ ${stream.viewers_count || 0} espectadores</div>
        `;
        container.appendChild(card);
    });
}

// ================================================================
// UNIRSE A UNA TRANSMISIÓN
// ================================================================
function unirseTransmision(streamId) {
    showToast('◈ Uniéndose a la transmisión...');
    setTimeout(() => {
        showToast('✅ Transmisión abierta', 'success');
    }, 1500);
}

// ================================================================
// VER TODAS LAS TRANSMISIONES
// ================================================================
function verTodasLasTransmisiones() {
    showToast('◈ Cargando todas las transmisiones...');
    cargarStreams();
}

// ================================================================
// CAMBIAR MODO OSCURO/CLARO
// ================================================================
function toggleModo() {
    const body = document.body;
    const isDark = !body.classList.contains('modo-claro');
    if (isDark) {
        body.classList.remove('modo-claro');
        localStorage.setItem('sariels_modo', 'oscuro');
        showToast('◈ Modo oscuro');
    } else {
        body.classList.add('modo-claro');
        localStorage.setItem('sariels_modo', 'claro');
        showToast('✦ Modo claro');
    }
}

function cargarModo() {
    const modo = localStorage.getItem('sariels_modo');
    if (modo === 'claro') {
        document.body.classList.add('modo-claro');
    }
}

// ================================================================
// ESTRELLAS
// ================================================================
function initStars() {
    const canvas = document.getElementById('stars-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height, stars = [];
    let animId = null;
    let isVisible = true;

    const isMobile = window.innerWidth < 600;
    const STAR_COUNT = isMobile ? 40 : 100;

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        createStars();
    }

    function createStars() {
        stars = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 0.8 + 0.2,
                speed: Math.random() * 0.005 + 0.002,
                opacity: Math.random() * 0.5 + 0.2,
                twinklePhase: Math.random() * Math.PI * 2
            });
        }
    }

    function draw() {
        if (!isVisible) {
            animId = requestAnimationFrame(draw);
            return;
        }
        ctx.clearRect(0, 0, width, height);
        for (let star of stars) {
            const opacity = star.opacity * (0.6 + 0.4 * Math.sin(star.twinklePhase));
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fill();
            star.twinklePhase += 0.02;
            star.y += star.speed;
            if (star.y > height) {
                star.y = 0;
                star.x = Math.random() * width;
            }
        }
        animId = requestAnimationFrame(draw);
    }

    function pauseAnimation() { isVisible = false; }
    function resumeAnimation() { isVisible = true; }

    resize();
    draw();

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) pauseAnimation();
        else resumeAnimation();
    });

    return { pauseAnimation, resumeAnimation };
}

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.showToast = showToast;
window.iniciarTransmision = iniciarTransmision;
window.finalizarTransmision = finalizarTransmision;
window.togglePlay = togglePlay;
window.toggleMute = toggleMute;
window.capturarPantalla = capturarPantalla;
window.enviarMensaje = enviarMensaje;
window.verTodasLasTransmisiones = verTodasLasTransmisiones;
window.actualizarViewers = actualizarViewers;
window.cargarStreams = cargarStreams;
window.unirseTransmision = unirseTransmision;
window.toggleModo = toggleModo;
window.cargarModo = cargarModo;
window.getSession = getSession;
window.toggleVoice = toggleVoice;
window.leerMensaje = leerMensaje;

console.log('◉ live.js cargado correctamente con Supabase Auth y Lector de Voz');