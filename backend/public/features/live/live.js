/* ================================================================
   LIVE - SARIEL'S ECOSYSTEM
   VERSIÓN CORREGIDA - USANDO window.supabase (SINGLETON GLOBAL)
   ================================================================ */

// ================================================================
// CONFIGURACIÓN SUPABASE - REUTILIZAR EL CLIENTE GLOBAL
// ================================================================
// ✅ ELIMINADA LA DECLARACIÓN DUPLICADA DE supabaseClient
// ✅ Usamos window.supabase que es creado por app.js
const supabase = window.supabase;

// ================================================================
// CONFIGURACIÓN LIVEKIT - SIN SECRETOS
// ================================================================
const LIVEKIT_CONFIG = {
    url: 'wss://csariels-domo-57ujk04t.livekit.cloud'
};

// ================================================================
// CONFIGURACIÓN DONACIONES
// ================================================================
const DONACIONES = {
    5: { nombre: 'Cubo Plata', emoji: '🥈', color: '#C0C0C0', duracion: 3000, efecto: 'cubo_plata' },
    10: { nombre: 'Cubo Bronce', emoji: '🥉', color: '#CD7F32', duracion: 4000, efecto: 'cubo_bronce' },
    20: { nombre: 'Cubo Oro', emoji: '🥇', color: '#D4AF37', duracion: 5000, efecto: 'cubo_oro' },
    50: { nombre: 'Cohete Bronce', emoji: '🚀', color: '#CD7F32', duracion: 6000, efecto: 'cohete_explosion' },
    100: { nombre: 'Cohete Esmeralda', emoji: '💚', color: '#50C878', duracion: 8000, efecto: 'cohete_esmeralda' }
};

// ================================================================
// PALABRAS PROHIBIDAS
// ================================================================
const PALABRAS_PROHIBIDAS = [
    'puta', 'verga', 'mierda', 'pendejo', 'chingar', 'chingada',
    'cabron', 'cabrón', 'pinche', 'wey', 'güey', 'culero',
    'puto', 'maricon', 'maricón', 'joto',
    'negro', 'indio', 'naco', 'naca', 'sudaca',
    'matar', 'mata', 'asesinar', 'suicidio', 'violar',
    'droga', 'cocaína', 'marihuana', 'perico', 'cristal',
    'cerveza', 'tequila', 'whisky', 'ron', 'vodka',
    'fuck', 'shit', 'bitch', 'asshole', 'motherfucker'
];

// ================================================================
// ESCAPE HTML - PREVENCIÓN XSS
// ================================================================
function escapeHTML(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// ================================================================
// TOAST NOTIFICACIONES
// ================================================================
function showToast(msg, type = '', duration = 3500) {
    try {
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
        else if (type === 'success') t.classList.add('success');
        else t.classList.remove('error', 'warning', 'success');
        clearTimeout(t._timeout);
        t._timeout = setTimeout(() => t.classList.remove('show'), duration);
    } catch (e) {
        console.warn('Toast no disponible:', e);
        alert(msg);
    }
}

// ================================================================
// OBTENER SESIÓN
// ================================================================
async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ================================================================
// ESTADO GLOBAL
// ================================================================
let currentUser = null;
let currentStream = null;
let liveKitRoom = null;
let isLive = false;
let isMuted = false;
let isVoiceActive = false;
let streamInterval = null;
let channelChat = null;
let espectadores = 0;
let localStream = null;

// ================================================================
// OBTENER TOKEN LIVEKIT DEL BACKEND CON ROL
// ================================================================
async function obtenerTokenLiveKit(roomName, participantName, role = 'subscriber') {
    try {
        const session = await getSession();
        if (!session) throw new Error('No autenticado');

        const response = await fetch(`/api/token?room=${encodeURIComponent(roomName)}&role=${role}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al obtener token');
        }

        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error('Error obteniendo token LiveKit:', error);
        throw error;
    }
}

// ================================================================
// 🎥 INICIAR TRANSMISIÓN - CORREGIDO CON MANEJO DE PLAY() SEGURO
// ================================================================
async function iniciarTransmision() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para transmitir', 'error');
            return;
        }
        currentUser = session.user;

        showToast('⏳ Iniciando transmisión...', '', 3000);

        const titulo = prompt('Título de tu transmisión:', 'Mi live en Sariel\'s') || 'Live en Sariel\'s';
        const categoria = prompt('Categoría (gaming, musica, educacion, comunidad, tecnologia, general):', 'general') || 'general';

        // Usar RPC segura del backend
        const { data, error } = await supabase.rpc('iniciar_transmision_segura', {
            p_titulo: titulo,
            p_categoria: categoria,
            p_descripcion: '',
            p_tipo_transmision: 'gratis',
            p_precio: 0
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error);

        const streamData = data;
        currentStream = {
            id: streamData.stream_id,
            room_name: streamData.room_name,
            streamer_id: currentUser.id,
            titulo: titulo,
            categoria: categoria,
            estado: 'en_vivo',
            fecha_inicio: new Date().toISOString()
        };

        // CONECTAR A LIVEKIT PRIMERO
        try {
            showToast('🔗 Conectando a LiveKit...', '', 2000);

            const { Room } = window.livekitClient;
            liveKitRoom = new Room();

            const token = await obtenerTokenLiveKit(
                currentStream.room_name,
                currentUser.user_metadata?.nombre || currentUser.email || 'streamer',
                'publisher'
            );

            await liveKitRoom.connect(LIVEKIT_CONFIG.url, token);

            // Publicar cámara y micrófono con LiveKit
            await liveKitRoom.localParticipant.setCameraEnabled(true);
            await liveKitRoom.localParticipant.setMicrophoneEnabled(true);

            // Mostrar el video local en el elemento <video>
            const videoElement = document.getElementById('liveVideo');
            if (videoElement) {
                const videoTrack = liveKitRoom.localParticipant.videoTrackPublications.values().next().value;
                if (videoTrack && videoTrack.track) {
                    const stream = new MediaStream();
                    stream.addTrack(videoTrack.track);
                    videoElement.srcObject = stream;
                    // ✅ MANEJO SEGURO DE PLAY()
                    try {
                        await videoElement.play();
                    } catch (playError) {
                        console.warn('Autoplay bloqueado por el navegador:', playError);
                        showToast('⚠️ Presiona play para ver tu transmisión', 'warning', 3000);
                    }
                }
            }

            showToast('✅ Conectado a LiveKit', 'success');

            // Escuchar participantes
            liveKitRoom.on('participantConnected', (participant) => {
                espectadores++;
                document.getElementById('viewersCount').textContent = `${espectadores} espectadores`;
            });

            liveKitRoom.on('participantDisconnected', () => {
                espectadores = Math.max(0, espectadores - 1);
                document.getElementById('viewersCount').textContent = `${espectadores} espectadores`;
            });

        } catch (e) {
            console.warn('LiveKit no disponible, modo local:', e);
            showToast('⚠️ Modo local - sin transmisión en vivo', 'warning');
            
            // FALLBACK: capturar cámara local manualmente
            try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: 1280, height: 720 },
                    audio: true
                });
                localStream = fallbackStream;
                const video = document.getElementById('liveVideo');
                if (video) {
                    video.srcObject = fallbackStream;
                    try {
                        await video.play();
                    } catch (playError) {
                        console.warn('Autoplay bloqueado en fallback:', playError);
                    }
                }
            } catch (fallbackError) {
                console.warn('No se pudo capturar cámara en modo fallback:', fallbackError);
                showToast('⚠️ No se pudo acceder a la cámara. Verifica los permisos.', 'error');
            }
        }

        isLive = true;
        document.getElementById('viewersCount').textContent = '0 espectadores';

        iniciarContadorEspectadores();
        suscribirseAlChat();
        await notificarSeguidoresSeguro(currentStream.id);

        showToast('🎥 ¡Transmisión iniciada!', 'success', 4000);

    } catch (error) {
        console.error('Error iniciando transmisión:', error);
        showToast('❌ Error al iniciar: ' + error.message, 'error');
        
        // Limpiar en caso de error
        if (liveKitRoom) {
            try { await liveKitRoom.disconnect(); } catch (e) {}
            liveKitRoom = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
    }
}

// ================================================================
// ✋ FINALIZAR TRANSMISIÓN - CON LIMPIEZA COMPLETA
// ================================================================
async function finalizarTransmision() {
    try {
        if (!currentStream) {
            showToast('⚠️ No hay transmisión activa', 'error');
            return;
        }

        if (!confirm('¿Seguro que quieres finalizar la transmisión?')) return;

        showToast('⏳ Finalizando transmisión...', '', 3000);

        // Usar RPC segura
        const { data, error } = await supabase.rpc('finalizar_transmision_segura', {
            p_stream_id: currentStream.id
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error);

        showToast(`✅ Transmisión finalizada - Duración: ${Math.floor(data.duracion / 60)} min`, 'success');

    } catch (error) {
        console.error('Error finalizando transmisión:', error);
        showToast('❌ Error al finalizar: ' + error.message, 'error');
    } finally {
        // LIMPIEZA COMPLETA DE RECURSOS
        if (localStream) {
            try {
                localStream.getTracks().forEach(t => {
                    t.stop();
                    t.enabled = false;
                });
                localStream = null;
            } catch (e) {
                console.warn('Error limpiando localStream:', e);
            }
        }

        const video = document.getElementById('liveVideo');
        if (video) {
            try {
                if (video.srcObject) {
                    if (video.srcObject.getTracks) {
                        video.srcObject.getTracks().forEach(t => t.stop());
                    }
                    video.srcObject = null;
                }
                video.pause();
                video.src = '';
                video.load();
            } catch (e) {
                console.warn('Error limpiando video element:', e);
            }
        }

        if (liveKitRoom) {
            try {
                if (liveKitRoom.localParticipant) {
                    try {
                        await liveKitRoom.localParticipant.setCameraEnabled(false);
                        await liveKitRoom.localParticipant.setMicrophoneEnabled(false);
                    } catch (e) {
                        console.warn('Error deshabilitando dispositivos LiveKit:', e);
                    }
                }
                await liveKitRoom.disconnect();
                console.log('✅ LiveKit desconectado');
            } catch (lkError) {
                console.warn('Error desconectando LiveKit:', lkError);
            }
            liveKitRoom = null;
        }

        if (streamInterval) {
            clearInterval(streamInterval);
            streamInterval = null;
        }

        if (channelChat) {
            try {
                supabase.removeChannel(channelChat);
                console.log('✅ Canal de chat cerrado');
            } catch (e) {
                console.warn('Error cerrando canal de chat:', e);
            }
            channelChat = null;
        }

        isLive = false;
        currentStream = null;
        espectadores = 0;
        document.getElementById('viewersCount').textContent = '0 espectadores';

        const container = document.getElementById('liveVideoContainer');
        if (container) {
            const overlays = container.querySelectorAll('.donacion-overlay');
            overlays.forEach(el => el.remove());
        }

        console.log('🧹 Limpieza de recursos completada');
    }
}

// ================================================================
// 📺 UNIRSE A TRANSMISIÓN - CORREGIDO CON MANEJO DE PLAY() SEGURO
// ================================================================
async function unirseATransmision(streamId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para ver transmisiones', 'error');
            return;
        }

        showToast('⏳ Uniéndose a la transmisión...', '', 2000);

        const { data: stream, error } = await supabase
            .from('transmisiones')
            .select('*, usuarios(id, nombre, avatar_url)')
            .eq('id', streamId)
            .single();

        if (error) throw error;

        currentStream = stream;

        try {
            const { Room } = window.livekitClient;
            liveKitRoom = new Room();

            const token = await obtenerTokenLiveKit(
                stream.room_name,
                session.user.user_metadata?.nombre || session.user.email || 'espectador',
                'subscriber'
            );

            await liveKitRoom.connect(LIVEKIT_CONFIG.url, token);

            liveKitRoom.on('trackSubscribed', (track, publication, participant) => {
                if (track.kind === 'video') {
                    const video = document.getElementById('liveVideo');
                    if (video) {
                        track.attach(video);
                        // ✅ MANEJO SEGURO DE PLAY()
                        try {
                            video.play().catch(e => {
                                console.warn('Autoplay bloqueado en suscripción:', e);
                            });
                        } catch (e) {
                            console.warn('Error en play():', e);
                        }
                    }
                }
            });

            showToast('📺 Conectado a la transmisión', 'success');

        } catch (e) {
            console.warn('LiveKit no disponible, modo solo chat:', e);
            showToast('⚠️ Modo solo chat - sin video', 'warning');
        }

        suscribirseAlChat();

        const overlay = document.querySelector('.live-overlay .text');
        if (overlay) overlay.textContent = stream.titulo || 'EN VIVO';

        showToast(`📺 Viendo: ${stream.titulo || 'Live'}`, 'success');

    } catch (error) {
        console.error('Error uniéndose:', error);
        showToast('❌ Error al unirse', 'error');
    }
}

// ================================================================
// 💬 CHAT
// ================================================================

function suscribirseAlChat() {
    if (!currentStream) return;

    if (channelChat) {
        supabase.removeChannel(channelChat);
    }

    channelChat = supabase
        .channel(`live-${currentStream.id}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes_live',
            filter: `transmision_id=eq.${currentStream.id}`
        }, (payload) => {
            agregarMensajeAlChat(payload.new);
        })
        .subscribe();
}

async function enviarMensaje() {
    const input = document.getElementById('chatInput');
    const mensaje = input.value.trim();

    if (!mensaje) {
        showToast('⚠️ Escribe un mensaje', 'warning');
        return;
    }

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para chatear', 'error');
        return;
    }

    if (!currentStream) {
        showToast('⚠️ No hay transmisión activa', 'error');
        return;
    }

    const moderationResult = verificarContenido(mensaje);
    if (moderationResult.prohibido) {
        showToast(`⚠️ ${moderationResult.razon}`, 'warning');
        input.value = '';
        return;
    }

    try {
        const { data, error } = await supabase.rpc('enviar_mensaje_seguro', {
            p_transmision_id: currentStream.id,
            p_mensaje: mensaje
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error);

        input.value = '';
        input.focus();

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        showToast('❌ Error al enviar mensaje: ' + error.message, 'error');
    }
}

function agregarMensajeAlChat(mensaje) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-msg';

    const avatar = mensaje.nombre_usuario ? mensaje.nombre_usuario.charAt(0).toUpperCase() : '◈';

    div.innerHTML = `
        <div class="avatar">${avatar}</div>
        <div class="msg">
            <span class="name">${escapeHTML(mensaje.nombre_usuario || 'Explorador')}</span>
            <span class="time">${new Date(mensaje.creado_en || mensaje.created_at).toLocaleTimeString()}</span>
            <div class="text">${escapeHTML(mensaje.mensaje)}</div>
        </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    const countEl = document.getElementById('chatCount');
    if (countEl) {
        const messages = container.querySelectorAll('.chat-msg').length;
        countEl.textContent = `${messages} mensajes`;
    }
}

// ================================================================
// 🛡️ MODERACIÓN
// ================================================================

function verificarContenido(texto) {
    const textoLower = texto.toLowerCase();

    for (const palabra of PALABRAS_PROHIBIDAS) {
        if (textoLower.includes(palabra)) {
            return { prohibido: true, razon: `Contiene lenguaje inapropiado` };
        }
    }

    if (/(acoso|bullying|hostigamiento|amenaza)/i.test(texto)) {
        return { prohibido: true, razon: 'Contenido de acoso detectado' };
    }

    const palabras = texto.split(' ');
    const repetidas = palabras.filter((p, i) => palabras.indexOf(p) !== i);
    if (repetidas.length > 5) {
        return { prohibido: true, razon: 'Posible spam detectado' };
    }

    return { prohibido: false };
}

// ================================================================
// 💰 DONACIONES
// ================================================================

async function enviarDonacion(monto) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para donar', 'error');
            return;
        }

        if (!currentStream) {
            showToast('⚠️ No hay transmisión activa', 'error');
            return;
        }

        const donacion = DONACIONES[monto];
        if (!donacion) {
            showToast('⚠️ Monto no válido', 'error');
            return;
        }

        showToast(`⏳ Procesando donación de $${monto} USD...`, '', 3000);

        const idempotencyKey = `donacion_${session.user.id}_${currentStream.id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        const { data, error } = await supabase.rpc('crear_donacion_segura', {
            p_transmision_id: currentStream.id,
            p_monto_usd: monto,
            p_idempotency_key: idempotencyKey,
            p_mensaje: `💎 ${donacion.nombre}`
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error);

        mostrarEfectoDonacion(monto, donacion, session.user);

        const mensajeDonacion = {
            nombre_usuario: session.user.user_metadata?.nombre || 'Explorador',
            mensaje: `🎉 ¡Donó $${monto} USD (${donacion.nombre})!`,
            creado_en: new Date().toISOString()
        };
        agregarMensajeAlChat(mensajeDonacion);

        showToast(`🎉 ¡${donacion.nombre} recibido!`, 'success', 5000);

    } catch (error) {
        console.error('Error en donación:', error);
        showToast('❌ Error al procesar donación: ' + error.message, 'error');
    }
}

// ================================================================
// 🎨 EFECTOS VISUALES
// ================================================================

function mostrarEfectoDonacion(monto, donacion, usuario) {
    const container = document.getElementById('liveVideoContainer');
    if (!container) return;

    const overlay = document.createElement('div');
    overlay.className = 'donacion-overlay';
    overlay.style.animation = `fadeInOut ${donacion.duracion}ms ease forwards`;

    const nombre = escapeHTML(usuario.user_metadata?.nombre || 'Alguien');

    let contenido = '';
    switch (donacion.efecto) {
        case 'cubo_plata':
            contenido = `
                <div style="background:linear-gradient(135deg,#E8E8E8,#C0C0C0);border-radius:8px;padding:30px;font-size:4rem;box-shadow:0 0 50px rgba(192,192,192,0.5);animation:cuboGirar 3s ease;text-align:center;">
                    <div>🥈</div>
                    <div style="font-size:1rem;color:#C0C0C0;margin-top:10px;">${nombre} donó $${monto}</div>
                    <div style="font-size:0.7rem;color:#C0C0C0;">Cubo de Plata</div>
                </div>
            `;
            break;
        case 'cubo_bronce':
            contenido = `
                <div style="background:linear-gradient(135deg,#D4A574,#CD7F32);border-radius:8px;padding:30px;font-size:5rem;box-shadow:0 0 60px rgba(205,127,50,0.6);animation:cuboGirar 4s ease;text-align:center;">
                    <div>🥉</div>
                    <div style="font-size:1.2rem;color:#CD7F32;margin-top:10px;">${nombre} donó $${monto}</div>
                    <div style="font-size:0.8rem;color:#CD7F32;">Cubo de Bronce</div>
                </div>
            `;
            break;
        case 'cubo_oro':
            contenido = `
                <div style="background:linear-gradient(135deg,#F0D060,#D4AF37);border-radius:8px;padding:30px;font-size:6rem;box-shadow:0 0 80px rgba(212,175,55,0.7);animation:cuboGirar 5s ease;text-align:center;">
                    <div>🥇</div>
                    <div style="font-size:1.5rem;color:#D4AF37;margin-top:10px;text-shadow:0 0 20px rgba(212,175,55,0.5);">${nombre} donó $${monto}</div>
                    <div style="font-size:1rem;color:#D4AF37;">Cubo de Oro</div>
                </div>
            `;
            break;
        case 'cohete_explosion':
            contenido = `
                <div style="animation:coheteGirar 4s ease;text-align:center;">
                    <div style="font-size:8rem;animation:coheteVuelo 3s ease;">🚀</div>
                    <div style="font-size:1.5rem;color:#CD7F32;margin-top:10px;text-shadow:0 0 40px rgba(205,127,50,0.8);">${nombre} donó $${monto}</div>
                    <div style="font-size:1rem;color:#CD7F32;">🚀 Cohete Bronce</div>
                </div>
            `;
            break;
        case 'cohete_esmeralda':
            contenido = `
                <div style="animation:coheteGirar 6s ease;text-align:center;">
                    <div style="font-size:10rem;animation:coheteVuelo 4s ease;filter:drop-shadow(0 0 50px rgba(80,200,120,0.8));">🚀</div>
                    <div style="font-size:2rem;color:#50C878;margin-top:10px;text-shadow:0 0 60px rgba(80,200,120,0.9);">${nombre} donó $${monto}</div>
                    <div style="font-size:1.2rem;color:#50C878;">💚 Cohete Esmeralda</div>
                </div>
            `;
            break;
    }

    overlay.innerHTML = contenido;
    container.appendChild(overlay);

    setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
    }, donacion.duracion + 500);
}

// ================================================================
// 🔄 CONTADOR DE ESPECTADORES
// ================================================================

function iniciarContadorEspectadores() {
    if (streamInterval) clearInterval(streamInterval);

    streamInterval = setInterval(async () => {
        if (!currentStream) return;

        try {
            await supabase
                .from('transmisiones')
                .update({ viewers_count: espectadores })
                .eq('id', currentStream.id);
        } catch (e) {
            // Silenciar error
        }
    }, 15000);
}

// ================================================================
// 👥 SEGUIDORES
// ================================================================

async function seguirStreamer(streamerId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para seguir', 'error');
            return;
        }

        const { data, error } = await supabase.rpc('seguir_streamer_seguro', {
            p_streamer_id: streamerId
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error);

        showToast('✅ ' + data.message, 'success');

    } catch (error) {
        console.error('Error siguiendo:', error);
        showToast('❌ Error al seguir: ' + error.message, 'error');
    }
}

async function getSeguidores(streamerId) {
    try {
        const { data, error } = await supabase
            .from('live_seguidores')
            .select('seguidor_id', { count: 'exact' })
            .eq('streamer_id', streamerId);

        if (error) throw error;
        return data.length;

    } catch (error) {
        console.error('Error obteniendo seguidores:', error);
        return 0;
    }
}

// ================================================================
// 🔔 NOTIFICACIONES A SEGUIDORES - RPC SEGURA
// ================================================================

async function notificarSeguidoresSeguro(streamId) {
    try {
        if (!streamId) return;

        const { data, error } = await supabase.rpc('notificar_seguidores_seguro', {
            p_stream_id: streamId
        });

        if (error) {
            console.error('Error notificando seguidores:', error);
            return;
        }

        if (data.success) {
            console.log(`✅ Notificados ${data.notificaciones_enviadas || 0} seguidores`);
        }

    } catch (error) {
        console.error('Error notificando seguidores:', error);
    }
}

// ================================================================
// 📋 LISTA DE TRANSMISIONES ACTIVAS
// ================================================================

async function cargarTransmisionesActivas() {
    try {
        const { data, error } = await supabase
            .from('transmisiones')
            .select(`
                *,
                usuarios(id, nombre, avatar_url)
            `)
            .eq('estado', 'en_vivo')
            .order('fecha_inicio', { ascending: false });

        if (error) throw error;

        renderizarTransmisiones(data);

    } catch (error) {
        console.error('Error cargando transmisiones:', error);
    }
}

function renderizarTransmisiones(streams) {
    const container = document.getElementById('streamsList');
    if (!container) return;

    if (!streams || streams.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;padding:20px;">
                <span class="icon">◉</span>
                <h3>Sin transmisiones activas</h3>
                <p>Sé el primero en iniciar una transmisión</p>
            </div>
        `;
        return;
    }

    container.innerHTML = streams.map(stream => `
        <div class="stream-card" onclick="unirseATransmision('${stream.id}')">
            <div class="stream-thumb">
                <span style="font-size:2rem;">◉</span>
                <span class="live-badge">🔴 EN VIVO</span>
            </div>
            <div class="stream-name">${escapeHTML(stream.titulo || 'Live')}</div>
            <div class="stream-host">
                ${escapeHTML(stream.usuarios?.nombre || 'Streamer')} · ${stream.viewers_count || 0} espectadores
            </div>
            <div style="font-size:0.55rem;color:var(--text-muted);margin-top:4px;">
                ${escapeHTML(stream.categoria || 'General')} · ${new Date(stream.fecha_inicio).toLocaleTimeString()}
            </div>
        </div>
    `).join('');
}

// ================================================================
// 🎮 CONTROLES - CON MANEJO SEGURO DE PLAY()
// ================================================================

function togglePlay() {
    const video = document.getElementById('liveVideo');
    if (!video) return;

    if (video.paused) {
        // ✅ MANEJO SEGURO DE PLAY()
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                document.getElementById('playBtn').textContent = '⏸';
            }).catch(error => {
                console.warn('Autoplay o reproducción pausada/bloqueada:', error);
                showToast('⚠️ Presiona play manualmente', 'warning', 2000);
            });
        }
    } else {
        video.pause();
        document.getElementById('playBtn').textContent = '▶';
    }
}

function toggleMute() {
    const video = document.getElementById('liveVideo');
    if (!video) return;

    isMuted = !isMuted;
    video.muted = isMuted;

    const btn = document.getElementById('muteBtn');
    if (isMuted) {
        btn.textContent = '🔇';
        btn.classList.add('muted');
    } else {
        btn.textContent = '🔊';
        btn.classList.remove('muted');
    }
}

async function capturarPantalla() {
    // ✅ VERIFICAR SOPORTE DE getDisplayMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        showToast('⚠️ Tu navegador no soporta compartir pantalla', 'error');
        return;
    }

    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        const video = document.getElementById('liveVideo');
        if (video) {
            video.srcObject = screenStream;
            try {
                await video.play();
                document.getElementById('playBtn').textContent = '⏸';
            } catch (playError) {
                console.warn('Autoplay bloqueado en compartir pantalla:', playError);
            }
        }

        showToast('🖥️ Compartiendo pantalla', 'success');

        screenStream.getVideoTracks()[0].onended = () => {
            restaurarCamara();
        };

    } catch (error) {
        console.error('Error capturando pantalla:', error);
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            showToast('⚠️ Permiso denegado para compartir pantalla', 'warning');
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            showToast('⚠️ No se encontró ninguna pantalla para compartir', 'warning');
        } else {
            showToast('❌ Error al compartir pantalla: ' + error.message, 'error');
        }
    }
}

async function restaurarCamara() {
    try {
        if (liveKitRoom) {
            await liveKitRoom.localParticipant.setCameraEnabled(true);
            const videoTrack = liveKitRoom.localParticipant.videoTrackPublications.values().next().value;
            if (videoTrack && videoTrack.track) {
                const stream = new MediaStream();
                stream.addTrack(videoTrack.track);
                const video = document.getElementById('liveVideo');
                if (video) {
                    video.srcObject = stream;
                    try {
                        await video.play();
                    } catch (playError) {
                        console.warn('Autoplay bloqueado al restaurar cámara:', playError);
                    }
                }
            }
        } else {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 1280, height: 720 },
                audio: true
            });
            const video = document.getElementById('liveVideo');
            if (video) {
                video.srcObject = stream;
                try {
                    await video.play();
                } catch (playError) {
                    console.warn('Autoplay bloqueado al restaurar cámara:', playError);
                }
            }
        }
    } catch (error) {
        console.error('Error restaurando cámara:', error);
        showToast('⚠️ No se pudo restaurar la cámara', 'error');
    }
}

function toggleVoice() {
    isVoiceActive = !isVoiceActive;
    const btn = document.getElementById('voiceBtn');

    if (isVoiceActive) {
        btn.textContent = '🔊';
        btn.classList.add('voice-active');
        const msg = 'Bienvenidos al Live de Sariel\'s';
        const utterance = new SpeechSynthesisUtterance(msg);
        utterance.lang = 'es-ES';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    } else {
        btn.textContent = '🔈';
        btn.classList.remove('voice-active');
        window.speechSynthesis.cancel();
    }
}

function verTodasLasTransmisiones() {
    cargarTransmisionesActivas();
    showToast('📺 Cargando transmisiones activas...', '', 2000);
}

// ================================================================
// 📊 ESTADÍSTICAS
// ================================================================

async function cargarEstadisticas() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para ver estadísticas', 'error');
            return;
        }

        const { data, error } = await supabase
            .from('transmisiones')
            .select('*')
            .eq('streamer_id', session.user.id)
            .order('fecha_inicio', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            showToast('📊 Sin estadísticas aún', 'warning');
            return;
        }

        const totalStreams = data.length;
        const totalHoras = data.reduce((acc, s) => {
            if (s.fecha_inicio && s.fecha_fin) {
                const diff = (new Date(s.fecha_fin) - new Date(s.fecha_inicio)) / 1000;
                return acc + (diff > 0 ? diff : 0);
            }
            return acc;
        }, 0) / 3600;
        const totalEspectadores = data.reduce((acc, s) => acc + (s.viewers_count || 0), 0);
        const totalDonaciones = data.reduce((acc, s) => acc + (s.donaciones_totales || 0), 0);

        showToast(`
            📊 Estadísticas:
            Transmisiones: ${totalStreams}
            Horas: ${totalHoras.toFixed(1)}h
            Espectadores: ${totalEspectadores}
            Donaciones: $${totalDonaciones.toFixed(2)} USD
        `, 'success', 6000);

    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        showToast('❌ Error cargando estadísticas', 'error');
    }
}

// ================================================================
// LIMPIEZA DE RECURSOS
// ================================================================
function limpiarRecursosLive() {
    if (streamInterval) clearInterval(streamInterval);
    if (channelChat) {
        try { supabase.removeChannel(channelChat); } catch(e) {}
        channelChat = null;
    }
    if (liveKitRoom) {
        try { liveKitRoom.disconnect(); } catch(e) {}
        liveKitRoom = null;
    }
    if (localStream) {
        try { localStream.getTracks().forEach(t => t.stop()); } catch(e) {}
        localStream = null;
    }
    const video = document.getElementById('liveVideo');
    if (video) {
        try {
            if (video.srcObject) {
                video.srcObject.getTracks().forEach(t => t.stop());
                video.srcObject = null;
            }
            video.pause();
            video.src = '';
            video.load();
        } catch(e) {}
    }
}

window.addEventListener('beforeunload', limpiarRecursosLive);

// ================================================================
// 🚀 INICIALIZACIÓN
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    const session = await getSession();
    if (session) {
        currentUser = session.user;
    } else {
        showToast('⚠️ Inicia sesión para transmitir y chatear', 'warning');
    }

    cargarTransmisionesActivas();
    setInterval(cargarTransmisionesActivas, 30000);

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                enviarMensaje();
            }
        });
    }

    console.log('◈ Sariel\'s - Live');
    console.log('📡 LiveKit URL:', LIVEKIT_CONFIG.url);
});

// ================================================================
// 📤 EXPOSICIÓN DE FUNCIONES GLOBALES
// ================================================================
window.iniciarTransmision = iniciarTransmision;
window.finalizarTransmision = finalizarTransmision;
window.verTodasLasTransmisiones = verTodasLasTransmisiones;
window.unirseATransmision = unirseATransmision;
window.enviarMensaje = enviarMensaje;
window.enviarDonacion = enviarDonacion;
window.togglePlay = togglePlay;
window.toggleMute = toggleMute;
window.capturarPantalla = capturarPantalla;
window.toggleVoice = toggleVoice;
window.seguirStreamer = seguirStreamer;
window.getSeguidores = getSeguidores;
window.cargarEstadisticas = cargarEstadisticas;
window.showToast = showToast;
window.limpiarRecursosLive = limpiarRecursosLive;