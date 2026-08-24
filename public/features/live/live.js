/* ================================================================
   LIVE ULTRA MEGA PRO - SARIEL'S
   Con LiveKit SDK + Supabase + Lector de Voz
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE (EL MISMO DE APP.JS)
// ================================================================
const supabase = window.supabase.createClient(
    'https://hbbwopkfpkvahgtawqke.supabase.co',
    'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j'
);

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
// LECTOR DE VOZ (WEB SPEECH API - GRATIS)
// ================================================================
let isVoiceActive = false;

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
    
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'es-ES';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
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
let currentRoom = null;
let livekitToken = null;
let room = null; // Sala LiveKit

// ================================================================
// OBTENER SESIÓN
// ================================================================
async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para transmitir', 'warning');
    }

    cargarStreams();
    
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') enviarMensaje();
        });
    }

    console.log('◉ Sariel\'s - Live Ultra Mega Pro con LiveKit');
});

// ================================================================
// OBTENER TOKEN DE LIVEKIT (desde /api/token)
// ================================================================
async function obtenerTokenLiveKit(roomName, participantName) {
    try {
        const session = await getSession();
        const response = await fetch(`/api/token?room=${roomName}&name=${participantName}`, {
            headers: {
                'Authorization': `Bearer ${session?.access_token || ''}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            return data.token;
        } else {
            console.warn('Error obteniendo token LiveKit');
            return null;
        }
    } catch (error) {
        console.warn('Error obteniendo token LiveKit:', error);
        return null;
    }
}

// ================================================================
// INICIAR TRANSMISIÓN (Con LiveKit SDK)
// ================================================================
async function iniciarTransmision() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('⚠️ Tu navegador no soporta transmisiones', 'error');
            return;
        }

        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para transmitir', 'error');
            return;
        }

        showToast('⏳ Solicitando acceso a cámara y micrófono...');

        // 1. Obtener stream local
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
        });

        document.getElementById('liveVideo').srcObject = localStream;
        await document.getElementById('liveVideo').play();

        // 2. Crear transmisión en Supabase
        const roomName = `live_${Date.now()}`;
        const { data: streamData, error: streamError } = await supabase
            .from('live_streams')
            .insert({
                host_id: session.user.id,
                room_name: roomName,
                titulo: 'Live de Sariel\'s',
                is_live: true
            })
            .select()
            .single();

        if (streamError) throw streamError;

        currentRoom = roomName;

        // 3. Obtener token de LiveKit
        const participantName = session.user.email?.split('@')[0] || 'Explorador';
        livekitToken = await obtenerTokenLiveKit(currentRoom, participantName);

        // 4. Conectar a la sala LiveKit
        if (livekitToken && typeof LivekitClient !== 'undefined') {
            room = new LivekitClient.Room();
            await room.connect('wss://csariels-domo-57ujk04t.livekit.cloud', livekitToken);
            
            // Publicar video y audio
            await room.localParticipant.setCameraEnabled(true);
            await room.localParticipant.setMicrophoneEnabled(true);
            
            // Publicar tracks locales en la sala
            localStream.getTracks().forEach(track => {
                room.localParticipant.publishTrack(track);
            });
            
            showToast('✅ Conectado a LiveKit');
        } else {
            showToast('⚠️ No se pudo conectar a LiveKit (SDK no disponible)', 'warning');
        }

        isPlaying = true;
        isLive = true;

        document.getElementById('playBtn').textContent = '◈';

        const container = document.getElementById('liveVideoContainer');
        if (container) {
            container.style.borderColor = 'var(--live-red)';
            container.style.boxShadow = '0 0 60px var(--live-red-glow)';
        }

        showToast('✅ Transmisión iniciada');

        // 5. Actualizar lista de transmisiones
        cargarStreams();

    } catch (error) {
        console.error('Error iniciando transmisión:', error);
        showToast('❌ Error al iniciar transmisión', 'error');
    }
}

// ================================================================
// FINALIZAR TRANSMISIÓN
// ================================================================
async function finalizarTransmision() {
    if (!isLive) {
        showToast('⚠️ No hay transmisión activa', 'warning');
        return;
    }

    // Detener cámara
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Desconectar de LiveKit
    if (room) {
        await room.disconnect();
        room = null;
    }

    document.getElementById('liveVideo').srcObject = null;
    isLive = false;
    isPlaying = false;

    // Actualizar Supabase
    if (currentRoom) {
        const { error } = await supabase
            .from('live_streams')
            .update({ is_live: false, ended_at: new Date().toISOString() })
            .eq('room_name', currentRoom);

        if (error) console.error('Error al finalizar en Supabase:', error);
    }

    currentRoom = null;
    livekitToken = null;
    showToast('🔴 Transmisión finalizada');

    cargarStreams();
}

// ================================================================
// CARGAR TRANSMISIONES ACTIVAS (Supabase)
// ================================================================
async function cargarStreams() {
    try {
        const { data, error } = await supabase
            .from('live_streams')
            .select('id, room_name, titulo, is_live, usuarios(nombre)')
            .eq('is_live', true)
            .order('started_at', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('streamsList');
        if (!container) return;

        if (data && data.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;padding:20px;">
                    <span class="icon">◉</span>
                    <h3>Sin transmisiones activas</h3>
                    <p>Sé el primero en iniciar una transmisión</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(stream => `
            <div class="stream-card" onclick="unirseTransmision('${stream.room_name}')">
                <div class="stream-thumb">
                    <span class="live-badge">● EN VIVO</span>
                    ◉
                </div>
                <div class="stream-name">${stream.titulo}</div>
                <div class="stream-host">${stream.usuarios?.nombre || 'Anfitrión'} · Sariel's</div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error cargando transmisiones:', error);
    }
}

// ================================================================
// UNIRSE A UNA TRANSMISIÓN
// ================================================================
async function unirseTransmision(roomName) {
    showToast(`◈ Uniéndose a ${roomName}...`);
    
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para unirte', 'error');
            return;
        }

        const participantName = session.user.email?.split('@')[0] || 'Espectador';
        const token = await obtenerTokenLiveKit(roomName, participantName);

        if (token && typeof LivekitClient !== 'undefined') {
            const viewerRoom = new LivekitClient.Room();
            await viewerRoom.connect('wss://csariels-domo-57ujk04t.livekit.cloud', token);
            
            viewerRoom.on('trackSubscribed', track => {
                if (track.kind === 'video') {
                    const videoElement = document.createElement('video');
                    videoElement.srcObject = new MediaStream([track.mediaStreamTrack]);
                    videoElement.autoplay = true;
                    document.body.appendChild(videoElement);
                }
            });
            
            showToast('✅ Conectado a la transmisión');
        } else {
            showToast('⚠️ No se pudo unir (SDK no disponible)', 'warning');
        }
    } catch (error) {
        showToast('❌ Error al unirse', 'error');
    }
}

// ================================================================
// PLAY/PAUSE
// ================================================================
function togglePlay() {
    const video = document.getElementById('liveVideo');
    if (!video.srcObject) return;

    if (isPlaying) {
        video.pause();
        isPlaying = false;
        document.getElementById('playBtn').textContent = '▶';
    } else {
        video.play();
        isPlaying = true;
        document.getElementById('playBtn').textContent = '◈';
    }
}

// ================================================================
// MUTE/UNMUTE
// ================================================================
function toggleMute() {
    const video = document.getElementById('liveVideo');
    if (!video.srcObject) return;

    isMuted = !isMuted;
    video.muted = isMuted;
    document.getElementById('muteBtn').textContent = isMuted ? '◌' : '◉';
}

// ================================================================
// CAPTURAR PANTALLA
// ================================================================
async function capturarPantalla() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        document.getElementById('liveVideo').srcObject = screenStream;
        showToast('✦ Compartiendo pantalla');
    } catch (error) {
        showToast('❌ Error al compartir pantalla', 'error');
    }
}

// ================================================================
// ENVIAR MENSAJE
// ================================================================
async function enviarMensaje() {
    const input = document.getElementById('chatInput');
    const texto = input.value.trim();
    if (!texto) return;

    const session = await getSession();
    const nombre = session?.user?.email?.split('@')[0] || 'Anónimo';

    const msg = {
        nombre: nombre,
        avatar: '◈',
        texto: texto,
        hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    chatMessages.push(msg);
    renderizarMensaje(msg);
    input.value = '';

    leerMensaje(`${msg.nombre} dice: ${msg.texto}`);
}

// ================================================================
// RENDERIZAR MENSAJE
// ================================================================
function renderizarMensaje(msg) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `
        <div class="avatar">${msg.avatar}</div>
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
// VER TODAS LAS TRANSMISIONES
// ================================================================
function verTodasLasTransmisiones() {
    cargarStreams();
    showToast('◈ Cargando transmisiones...');
}

// ================================================================
// EXPONER FUNCIONES
// ================================================================
window.showToast = showToast;
window.iniciarTransmision = iniciarTransmision;
window.finalizarTransmision = finalizarTransmision;
window.togglePlay = togglePlay;
window.toggleMute = toggleMute;
window.capturarPantalla = capturarPantalla;
window.enviarMensaje = enviarMensaje;
window.cargarStreams = cargarStreams;
window.unirseTransmision = unirseTransmision;
window.toggleVoice = toggleVoice;
window.leerMensaje = leerMensaje;
window.getSession = getSession;