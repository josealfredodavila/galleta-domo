/* ================================================================
   LIVE - SARIEL'S ECOSYSTEM
   VERSIÓN FUNCIONAL - CONEXIÓN REAL CON SUPABASE + LIVEKIT
   ================================================================ */

// ================================================================
// CONFIGURACIÓN SUPABASE
// ================================================================
const supabase = window.supabase.createClient(
    'https://zultnlogdoajehbswlih.supabase.co',
    'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
);

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
// TOAST
// ================================================================
function showToast(msg, type = '', duration = 3500) {
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
}

// ================================================================
// OBTENER SESIÓN
// ================================================================
async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ================================================================
// OBTENER TOKEN LIVEKIT DEL BACKEND
// ================================================================
async function obtenerTokenLiveKit(roomName, participantName) {
    try {
        const session = await getSession();
        if (!session) throw new Error('No autenticado');

        const response = await fetch(`/api/token?room=${encodeURIComponent(roomName)}`, {
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
// 🎥 INICIAR TRANSMISIÓN
// ================================================================
async function iniciarTransmision() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para transmitir', 'error');
            return;
        }
        currentUser = session.user;

        // Verificar transmisión activa
        const { data: streamActivo, error: checkError } = await supabase
            .from('transmisiones')
            .select('id')
            .eq('streamer_id', currentUser.id)
            .eq('estado', 'activa')
            .maybeSingle();

        if (checkError) throw checkError;
        if (streamActivo) {
            showToast('⚠️ Ya tienes una transmisión activa', 'warning');
            return;
        }

        showToast('⏳ Iniciando transmisión...', '', 3000);

        // Obtener cámara y micrófono
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 1280, height: 720 },
            audio: true
        });

        const video = document.getElementById('liveVideo');
        if (video) {
            video.srcObject = localStream;
            await video.play();
        }

        const titulo = prompt('Título de tu transmisión:', 'Mi live en Sariel\'s') || 'Live en Sariel\'s';
        const categoria = prompt('Categoría:', 'Charla') || 'Charla';

        const roomName = `live-${currentUser.id}-${Date.now()}`;

        // Crear transmisión en Supabase
        const { data: streamData, error: streamError } = await supabase
            .from('transmisiones')
            .insert({
                streamer_id: currentUser.id,
                titulo: titulo,
                categoria: categoria,
                estado: 'activa',
                fecha_inicio: new Date().toISOString(),
                room_name: roomName,
                viewers_count: 0
            })
            .select()
            .single();

        if (streamError) throw streamError;

        currentStream = streamData;

        // CONEXIÓN LIVEKIT
        try {
            showToast('🔗 Conectando a LiveKit...', '', 2000);

            const { Room } = await import('https://cdn.jsdelivr.net/npm/livekit-client@1/dist/index.js');

            liveKitRoom = new Room();

            const token = await obtenerTokenLiveKit(
                currentStream.room_name,
                currentUser.user_metadata?.nombre || currentUser.email || 'streamer'
            );

            await liveKitRoom.connect(LIVEKIT_CONFIG.url, token);

            // Publicar video
            await liveKitRoom.localParticipant.setCameraEnabled(true);
            await liveKitRoom.localParticipant.setMicrophoneEnabled(true);

            // Publicar pista de video local
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                // Ya está publicado por setCameraEnabled
            }

            showToast('✅ Conectado a LiveKit', 'success');

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
        }

        isLive = true;
        document.getElementById('viewersCount').textContent = '0 espectadores';

        iniciarContadorEspectadores();
        suscribirseAlChat();
        await notificarSeguidores();

        showToast('🎥 ¡Transmisión iniciada!', 'success', 4000);

    } catch (error) {
        console.error('Error iniciando transmisión:', error);
        showToast('❌ Error al iniciar: ' + error.message, 'error');
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
    }
}

// ================================================================
// ✋ FINALIZAR TRANSMISIÓN
// ================================================================
async function finalizarTransmision() {
    try {
        if (!currentStream) {
            showToast('⚠️ No hay transmisión activa', 'error');
            return;
        }

        if (!confirm('¿Seguro que quieres finalizar la transmisión?')) return;

        showToast('⏳ Finalizando transmisión...', '', 3000);

        const video = document.getElementById('liveVideo');
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }

        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }

        const duracion = Math.floor((Date.now() - new Date(currentStream.fecha_inicio).getTime()) / 1000);

        const { error } = await supabase
            .from('transmisiones')
            .update({
                estado: 'finalizada',
                fecha_fin: new Date().toISOString(),
                viewers_count: espectadores
            })
            .eq('id', currentStream.id);

        if (error) throw error;

        if (liveKitRoom) {
            try {
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
            supabase.removeChannel(channelChat);
            channelChat = null;
        }

        isLive = false;
        currentStream = null;
        document.getElementById('viewersCount').textContent = '0 espectadores';

        showToast('✅ Transmisión finalizada', 'success');

    } catch (error) {
        console.error('Error finalizando transmisión:', error);
        showToast('❌ Error al finalizar: ' + error.message, 'error');
    }
}

// ================================================================
// 📺 UNIRSE A TRANSMISIÓN
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
            const { Room } = await import('https://cdn.jsdelivr.net/npm/livekit-client@1/dist/index.js');

            liveKitRoom = new Room();

            const token = await obtenerTokenLiveKit(
                stream.room_name,
                session.user.user_metadata?.nombre || session.user.email || 'espectador'
            );

            await liveKitRoom.connect(LIVEKIT_CONFIG.url, token);

            liveKitRoom.on('trackSubscribed', (track, publication, participant) => {
                if (track.kind === 'video') {
                    const video = document.getElementById('liveVideo');
                    if (video) {
                        track.attach(video);
                    }
                }
            });

            showToast('📺 Conectado a la transmisión', 'success');

        } catch (e) {
            console.warn('LiveKit no disponible, modo solo chat:', e);
            showToast('⚠️ Modo solo chat - sin video', 'warning');
        }

        suscribirseAlChat();

        // Mostrar título
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
        const { error } = await supabase
            .from('mensajes_live')
            .insert({
                transmision_id: currentStream.id,
                usuario_id: session.user.id,
                mensaje: mensaje,
                nombre_usuario: session.user.user_metadata?.nombre || 'Explorador'
            });

        if (error) throw error;

        input.value = '';
        input.focus();

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        showToast('❌ Error al enviar mensaje', 'error');
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
            <span class="time">${new Date(mensaje.created_at).toLocaleTimeString()}</span>
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

function escapeHTML(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
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

        // Insertar donación
        const { data, error } = await supabase
            .from('live_donaciones')
            .insert({
                transmision_id: currentStream.id,
                donante_id: session.user.id,
                streamer_id: currentStream.streamer_id,
                monto_usd: monto,
                tipo_donacion: donacion.nombre,
                efecto_mostrado: false
            })
            .select()
            .single();

        if (error) throw error;

        mostrarEfectoDonacion(monto, donacion, session.user);

        const mensajeDonacion = {
            nombre_usuario: session.user.user_metadata?.nombre || 'Explorador',
            mensaje: `🎉 ¡Donó $${monto} USD (${donacion.nombre})!`,
            created_at: new Date().toISOString()
        };
        agregarMensajeAlChat(mensajeDonacion);

        // Actualizar estadísticas de transmisión
        const { data: streamData, error: streamError } = await supabase
            .from('transmisiones')
            .select('donaciones_totales')
            .eq('id', currentStream.id)
            .single();

        if (!streamError && streamData) {
            const nuevasDonaciones = (streamData.donaciones_totales || 0) + monto;
            await supabase
                .from('transmisiones')
                .update({ donaciones_totales: nuevasDonaciones })
                .eq('id', currentStream.id);
        }

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

    const nombre = usuario.user_metadata?.nombre || 'Alguien';

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

        await supabase
            .from('transmisiones')
            .update({ viewers_count: espectadores })
            .eq('id', currentStream.id);
    }, 10000);
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

        if (session.user.id === streamerId) {
            showToast('⚠️ No puedes seguirte a ti mismo', 'warning');
            return;
        }

        const { error } = await supabase
            .from('live_seguidores')
            .insert({
                streamer_id: streamerId,
                seguidor_id: session.user.id
            });

        if (error) {
            if (error.code === '23505') {
                showToast('⚠️ Ya sigues a este streamer', 'warning');
                return;
            }
            throw error;
        }

        showToast('✅ Ahora sigues a este streamer', 'success');

    } catch (error) {
        console.error('Error siguiendo:', error);
        showToast('❌ Error al seguir', 'error');
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
// 🔔 NOTIFICACIONES A SEGUIDORES
// ================================================================

async function notificarSeguidores() {
    try {
        if (!currentStream || !currentUser) return;

        const { data: seguidores } = await supabase
            .from('live_seguidores')
            .select('seguidor_id')
            .eq('streamer_id', currentUser.id);

        if (!seguidores || seguidores.length === 0) return;

        for (const s of seguidores) {
            await supabase
                .from('notificaciones')
                .insert({
                    user_id: s.seguidor_id,
                    tipo: 'live',
                    mensaje: `🔴 ${currentUser.user_metadata?.nombre || 'Un streamer'} ha iniciado una transmisión: "${currentStream.titulo}"`,
                    emisor_id: currentUser.id,
                    leida: false,
                    fecha: new Date().toISOString()
                });
        }

        showToast(`🔔 Notificados ${seguidores.length} seguidores`, 'success');

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
            .eq('estado', 'activa')
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
                ${stream.usuarios?.nombre || 'Streamer'} · ${stream.viewers_count || 0} espectadores
            </div>
            <div style="font-size:0.55rem;color:var(--text-muted);margin-top:4px;">
                ${stream.categoria || 'General'} · ${new Date(stream.fecha_inicio).toLocaleTimeString()}
            </div>
        </div>
    `).join('');
}

// ================================================================
// 🎮 CONTROLES
// ================================================================

function togglePlay() {
    const video = document.getElementById('liveVideo');
    if (!video) return;

    if (video.paused) {
        video.play();
        document.getElementById('playBtn').textContent = '⏸';
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
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        const video = document.getElementById('liveVideo');
        if (video) {
            video.srcObject = screenStream;
            video.play();
        }

        showToast('🖥️ Compartiendo pantalla', 'success');

        screenStream.getVideoTracks()[0].onended = () => {
            restaurarCamara();
        };

    } catch (error) {
        console.error('Error capturando pantalla:', error);
        showToast('❌ Error al compartir pantalla', 'error');
    }
}

async function restaurarCamara() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 1280, height: 720 },
            audio: true
        });

        const video = document.getElementById('liveVideo');
        if (video) {
            video.srcObject = stream;
            video.play();
        }

    } catch (error) {
        console.error('Error restaurando cámara:', error);
    }
}

function toggleVoice() {
    isVoiceActive = !isVoiceActive;
    const btn = document.getElementById('voiceBtn');

    if (isVoiceActive) {
        btn.textContent = '🔊';
        btn.classList.add('voice-active');
        // Iniciar lectura de voz (simple)
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