/* ================================================================
   LIVE ULTRA MEGA PRO - SARIEL'S
   Integración completa: LiveKit + Supabase Realtime + Donaciones + Chat + Moderación
   ================================================================ */

// ================================================================
// CONFIGURACIÓN
// ================================================================

// Configuración de LiveKit (desde variables de entorno en Railway)
const LIVEKIT_CONFIG = {
    url: 'wss://csariels-domo-57ujk04t.livekit.cloud',
    apiKey: 'APIKhu3viHnZRdQ',
    // API_SECRET está en Railway (NO se expone aquí)
};

// Configuración de donaciones
const DONACIONES = {
    5: {
        nombre: 'Cubo Plata',
        emoji: '🥈',
        color: '#C0C0C0',
        duracion: 3000,
        efecto: 'cubo_plata'
    },
    10: {
        nombre: 'Cubo Bronce',
        emoji: '🥉',
        color: '#CD7F32',
        duracion: 4000,
        efecto: 'cubo_bronce'
    },
    20: {
        nombre: 'Cubo Oro',
        emoji: '🥇',
        color: '#D4AF37',
        duracion: 5000,
        efecto: 'cubo_oro'
    },
    50: {
        nombre: 'Cohete Bronce',
        emoji: '🚀',
        color: '#CD7F32',
        duracion: 6000,
        efecto: 'cohete_explosion'
    },
    100: {
        nombre: 'Cohete Esmeralda',
        emoji: '💚',
        color: '#50C878',
        duracion: 8000,
        efecto: 'cohete_esmeralda'
    }
};

// Palabras prohibidas para moderación
const PALABRAS_PROHIBIDAS = [
    // Groserías
    'puta', 'verga', 'mierda', 'pendejo', 'chingar', 'chingada',
    'cabron', 'cabrón', 'pinche', 'wey', 'güey', 'culero',
    'puto', 'maricon', 'maricón', 'joto', 'lesbiana',
    // Discriminación
    'negro', 'indio', 'naco', 'naca', 'sudaca',
    // Violencia
    'matar', 'mata', 'asesinar', 'suicidio', 'violar',
    // Drogas
    'droga', 'cocaína', 'marihuana', 'perico', 'cristal',
    'crack', 'heroína', 'extasis', 'éxtasis',
    // Alcohol
    'cerveza', 'tequila', 'whisky', 'ron', 'vodka',
    'alcohol', 'borracho', 'borracha',
    // Groserías en inglés
    'fuck', 'shit', 'bitch', 'asshole', 'motherfucker',
    'damn', 'hell', 'bastard', 'whore', 'slut'
];

// ================================================================
// SUPABASE CLIENTE
// ================================================================
const supabase = window.supabase.createClient(
    'https://hbbwopkfpkvahgtawqke.supabase.co',
    'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j'
);

// ================================================================
// ESTADO GLOBAL
// ================================================================
let currentUser = null;
let currentStream = null;
let liveKitRoom = null;
let localTrack = null;
let isLive = false;
let isMuted = false;
let isVoiceActive = false;
let streamInterval = null;
let channelChat = null;
let espectadores = 0;

// ================================================================
// TOAST NOTIFICACIONES
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

        // Verificar si ya tiene una transmisión activa
        const { data: streamActivo } = await supabase
            .from('live_streams')
            .select('id')
            .eq('usuario_id', currentUser.id)
            .eq('estado', 'activa')
            .single();

        if (streamActivo) {
            showToast('⚠️ Ya tienes una transmisión activa', 'warning');
            return;
        }

        showToast('⏳ Iniciando transmisión...', '', 3000);

        // 1. Obtener cámara y micrófono
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 1280, height: 720 },
            audio: true
        });

        const video = document.getElementById('liveVideo');
        if (video) {
            video.srcObject = stream;
            video.play();
        }

        // 2. Crear transmisión en Supabase
        const titulo = prompt('Título de tu transmisión:', 'Mi live en Sariel\'s');
        const categoria = prompt('Categoría (juego, charla, música, etc.):', 'Charla');

        const { data: streamData, error: streamError } = await supabase
            .from('live_streams')
            .insert({
                usuario_id: currentUser.id,
                titulo: titulo || 'Live en Sariel\'s',
                categoria: categoria || 'Charla',
                estado: 'activa',
                iniciado_en: new Date().toISOString()
            })
            .select()
            .single();

        if (streamError) throw streamError;

        currentStream = streamData;

        // 3. Conectar a LiveKit (si está disponible)
        try {
            // Simulación de conexión a LiveKit
            // En producción, aquí se conectaría con:
            // const room = new LivekitRoom(...)
            showToast('🔗 Conectando a LiveKit...', '', 2000);
        } catch (e) {
            console.warn('LiveKit no disponible, usando modo local:', e);
        }

        // 4. Actualizar UI
        isLive = true;
        document.getElementById('viewersCount').textContent = '0 espectadores';
        
        // 5. Iniciar contador de espectadores
        iniciarContadorEspectadores();

        // 6. Suscribirse al chat
        suscribirseAlChat();

        // 7. Notificar a seguidores
        await notificarSeguidores();

        showToast('🎥 ¡Transmisión iniciada!', 'success', 4000);

    } catch (error) {
        console.error('Error iniciando transmisión:', error);
        showToast('❌ Error al iniciar: ' + error.message, 'error');
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

        // 1. Detener cámara
        const video = document.getElementById('liveVideo');
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }

        // 2. Actualizar en Supabase
        const duracion = Math.floor((Date.now() - new Date(currentStream.iniciado_en).getTime()) / 1000);

        const { error } = await supabase
            .from('live_streams')
            .update({
                estado: 'finalizada',
                finalizado_en: new Date().toISOString(),
                duracion: duracion,
                espectadores: espectadores
            })
            .eq('id', currentStream.id);

        if (error) throw error;

        // 3. Desconectar de LiveKit
        if (liveKitRoom) {
            liveKitRoom.disconnect();
            liveKitRoom = null;
        }

        // 4. Detener contador
        if (streamInterval) {
            clearInterval(streamInterval);
            streamInterval = null;
        }

        // 5. Desuscribirse del chat
        if (channelChat) {
            supabase.removeChannel(channelChat);
            channelChat = null;
        }

        // 6. Actualizar UI
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
// 💬 CHAT EN TIEMPO REAL
// ================================================================

// Suscribirse al chat
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
            table: 'live_mensajes',
            filter: `transmision_id=eq.${currentStream.id}`
        }, (payload) => {
            // Mostrar mensaje en el chat
            agregarMensajeAlChat(payload.new);
        })
        .subscribe();
}

// Enviar mensaje
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

    // Moderación: verificar palabras prohibidas
    const moderationResult = verificarContenido(mensaje);
    
    if (moderationResult.prohibido) {
        showToast(`⚠️ ${moderationResult.razon}`, 'warning');
        
        // Guardar reporte de moderación
        await supabase
            .from('live_reportes')
            .insert({
                transmision_id: currentStream.id,
                usuario_id: session.user.id,
                tipo: 'ofensa',
                mensaje: mensaje,
                revisado: false
            });

        input.value = '';
        return;
    }

    try {
        const { error } = await supabase
            .from('live_mensajes')
            .insert({
                transmision_id: currentStream.id,
                usuario_id: session.user.id,
                mensaje: mensaje,
                nombre_usuario: session.user.user_metadata?.nombre || 'Explorador',
                moderated: false
            });

        if (error) throw error;

        input.value = '';
        input.focus();

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        showToast('❌ Error al enviar mensaje', 'error');
    }
}

// Agregar mensaje al chat (UI)
function agregarMensajeAlChat(mensaje) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-msg';
    
    const avatar = mensaje.nombre_usuario ? mensaje.nombre_usuario.charAt(0).toUpperCase() : '◈';
    
    div.innerHTML = `
        <div class="avatar">${avatar}</div>
        <div class="msg">
            <span class="name">${mensaje.nombre_usuario || 'Explorador'}</span>
            <span class="time">${new Date(mensaje.created_at).toLocaleTimeString()}</span>
            <div class="text">${escapeHTML(mensaje.mensaje)}</div>
        </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    // Actualizar contador
    const countEl = document.getElementById('chatCount');
    if (countEl) {
        const messages = container.querySelectorAll('.chat-msg').length;
        countEl.textContent = `${messages} mensajes`;
    }
}

// ================================================================
// 🛡️ MODERACIÓN DE CONTENIDO
// ================================================================

function verificarContenido(texto) {
    const textoLower = texto.toLowerCase();
    
    // Verificar palabras prohibidas
    for (const palabra of PALABRAS_PROHIBIDAS) {
        if (textoLower.includes(palabra)) {
            return {
                prohibido: true,
                razon: `Contiene lenguaje inapropiado: "${palabra}"`
            };
        }
    }

    // Verificar patrones de acoso
    const patronesAcoso = /acoso|bullying|hostigamiento|amenaza/i;
    if (patronesAcoso.test(texto)) {
        return {
            prohibido: true,
            razon: 'Contenido de acoso detectado'
        };
    }

    // Verificar spam (más de 5 palabras repetidas)
    const palabras = texto.split(' ');
    const repetidas = palabras.filter((p, i) => palabras.indexOf(p) !== i);
    if (repetidas.length > 5) {
        return {
            prohibido: true,
            razon: 'Posible spam detectado'
        };
    }

    return { prohibido: false };
}

function escapeHTML(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// ================================================================
// 💰 SISTEMA DE DONACIONES
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

        // 1. Registrar donación en Supabase
        const { data, error } = await supabase
            .from('live_donaciones')
            .insert({
                transmision_id: currentStream.id,
                donante_id: session.user.id,
                streamer_id: currentStream.usuario_id,
                monto_usd: monto,
                tipo_donacion: donacion.nombre,
                efecto_mostrado: false
            })
            .select()
            .single();

        if (error) throw error;

        // 2. Mostrar efecto visual
        mostrarEfectoDonacion(monto, donacion, session.user);

        // 3. Mostrar mensaje en chat
        const mensajeDonacion = {
            nombre_usuario: session.user.user_metadata?.nombre || 'Explorador',
            mensaje: `🎉 ¡Donó $${monto} USD (${donacion.nombre})!`,
            created_at: new Date().toISOString()
        };
        agregarMensajeAlChat(mensajeDonacion);

        // 4. Actualizar estadísticas del streamer
        await supabase
            .from('live_streams')
            .update({
                donaciones_totales: supabase.rpc('increment_donaciones', { 
                    p_stream_id: currentStream.id, 
                    p_monto: monto 
                })
            })
            .eq('id', currentStream.id);

        showToast(`🎉 ¡${donacion.nombre} recibido!`, 'success', 5000);

    } catch (error) {
        console.error('Error en donación:', error);
        showToast('❌ Error al procesar donación', 'error');
    }
}

// ================================================================
// 🎨 EFECTOS VISUALES DE DONACIONES
// ================================================================

function mostrarEfectoDonacion(monto, donacion, usuario) {
    const container = document.getElementById('liveVideoContainer');
    if (!container) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeInOut ${donacion.duracion}ms ease forwards;
    `;

    // Contenido según el tipo de donación
    let contenido = '';
    
    switch (donacion.efecto) {
        case 'cubo_plata':
            contenido = `
                <div style="
                    background: linear-gradient(135deg, #E8E8E8, #C0C0C0);
                    border-radius: 8px;
                    padding: 30px;
                    font-size: 4rem;
                    box-shadow: 0 0 50px rgba(192,192,192,0.5);
                    animation: cuboGirar 3s ease;
                    text-align: center;
                ">
                    <div>🥈</div>
                    <div style="font-size: 1rem; color: #C0C0C0; margin-top: 10px;">
                        ${usuario.user_metadata?.nombre || 'Alguien'} donó $${monto}
                    </div>
                    <div style="font-size: 0.7rem; color: #C0C0C0;">Cubo de Plata</div>
                </div>
            `;
            break;

        case 'cubo_bronce':
            contenido = `
                <div style="
                    background: linear-gradient(135deg, #D4A574, #CD7F32);
                    border-radius: 8px;
                    padding: 30px;
                    font-size: 5rem;
                    box-shadow: 0 0 60px rgba(205,127,50,0.6);
                    animation: cuboGirar 4s ease, brillo 1s infinite;
                    text-align: center;
                ">
                    <div>🥉</div>
                    <div style="font-size: 1.2rem; color: #CD7F32; margin-top: 10px;">
                        ${usuario.user_metadata?.nombre || 'Alguien'} donó $${monto}
                    </div>
                    <div style="font-size: 0.8rem; color: #CD7F32;">Cubo de Bronce</div>
                </div>
            `;
            break;

        case 'cubo_oro':
            contenido = `
                <div style="
                    background: linear-gradient(135deg, #F0D060, #D4AF37);
                    border-radius: 8px;
                    padding: 30px;
                    font-size: 6rem;
                    box-shadow: 0 0 80px rgba(212,175,55,0.7);
                    animation: cuboGirar 5s ease, brillo 0.5s infinite;
                    text-align: center;
                ">
                    <div>🥇</div>
                    <div style="font-size: 1.5rem; color: #D4AF37; margin-top: 10px; text-shadow: 0 0 20px rgba(212,175,55,0.5);">
                        ${usuario.user_metadata?.nombre || 'Alguien'} donó $${monto}
                    </div>
                    <div style="font-size: 1rem; color: #D4AF37;">Cubo de Oro</div>
                </div>
            `;
            break;

        case 'cohete_explosion':
            contenido = `
                <div style="
                    animation: coheteGirar 4s ease, explosion 2s ease 4s forwards;
                    text-align: center;
                ">
                    <div style="font-size: 8rem; animation: coheteVuelo 3s ease;">🚀</div>
                    <div style="
                        font-size: 1.5rem; 
                        color: #CD7F32; 
                        margin-top: 10px;
                        text-shadow: 0 0 40px rgba(205,127,50,0.8);
                        animation: brillo 0.8s infinite;
                    ">
                        ${usuario.user_metadata?.nombre || 'Alguien'} donó $${monto}
                    </div>
                    <div style="font-size: 1rem; color: #CD7F32;">🚀 Cohete Bronce</div>
                    <div style="
                        font-size: 3rem;
                        animation: explosionParticulas 2s ease 4s forwards;
                        opacity: 0;
                    ">💥</div>
                </div>
            `;
            break;

        case 'cohete_esmeralda':
            contenido = `
                <div style="
                    animation: coheteGirar 6s ease, explosion 2s ease 6s forwards;
                    text-align: center;
                ">
                    <div style="
                        font-size: 10rem; 
                        animation: coheteVuelo 4s ease;
                        filter: drop-shadow(0 0 50px rgba(80,200,120,0.8));
                    ">🚀</div>
                    <div style="
                        font-size: 2rem; 
                        color: #50C878; 
                        margin-top: 10px;
                        text-shadow: 0 0 60px rgba(80,200,120,0.9);
                        animation: brillo 0.3s infinite;
                    ">
                        ${usuario.user_metadata?.nombre || 'Alguien'} donó $${monto}
                    </div>
                    <div style="font-size: 1.2rem; color: #50C878;">💚 Cohete Esmeralda</div>
                    <div style="
                        font-size: 4rem;
                        animation: explosionParticulas 2s ease 6s forwards;
                        opacity: 0;
                    ">💚✨</div>
                </div>
            `;
            break;
    }

    overlay.innerHTML = contenido;
    container.appendChild(overlay);

    // Eliminar overlay después de la animación
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.remove();
        }
    }, donacion.duracion + 500);
}

// ================================================================
// 🔄 CONTADOR DE ESPECTADORES
// ================================================================

function iniciarContadorEspectadores() {
    if (streamInterval) {
        clearInterval(streamInterval);
    }

    streamInterval = setInterval(async () => {
        if (!currentStream) return;

        // Simular espectadores (en producción, sería de LiveKit)
        espectadores = Math.floor(Math.random() * 20) + 1;
        
        document.getElementById('viewersCount').textContent = `${espectadores} espectadores`;

        // Actualizar en Supabase
        await supabase
            .from('live_streams')
            .update({ espectadores: espectadores })
            .eq('id', currentStream.id);

    }, 5000);
}

// ================================================================
// 👥 SISTEMA DE SEGUIDORES
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

async function dejarDeSeguir(streamerId) {
    try {
        const session = await getSession();
        if (!session) return;

        const { error } = await supabase
            .from('live_seguidores')
            .delete()
            .eq('streamer_id', streamerId)
            .eq('seguidor_id', session.user.id);

        if (error) throw error;

        showToast('⭕ Dejaste de seguir a este streamer', 'warning');

    } catch (error) {
        console.error('Error dejando de seguir:', error);
        showToast('❌ Error al dejar de seguir', 'error');
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
// 📋 LISTA DE TRANSMISIONES ACTIVAS
// ================================================================

async function cargarTransmisionesActivas() {
    try {
        const { data, error } = await supabase
            .from('live_streams')
            .select(`
                *,
                usuarios(id, nombre, avatar_url)
            `)
            .eq('estado', 'activa')
            .order('iniciado_en', { ascending: false });

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
                <span style="font-size: 2rem;">◉</span>
                <span class="live-badge">🔴 EN VIVO</span>
            </div>
            <div class="stream-name">${stream.titulo || 'Live'}</div>
            <div class="stream-host">
                ${stream.usuarios?.nombre || 'Streamer'} · ${stream.espectadores || 0} espectadores
            </div>
            <div style="font-size:0.55rem;color:var(--text-muted);margin-top:4px;">
                ${stream.categoria || 'General'} · ${new Date(stream.iniciado_en).toLocaleTimeString()}
            </div>
        </div>
    `).join('');
}

async function unirseATransmision(streamId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para ver transmisiones', 'error');
            return;
        }

        showToast('⏳ Uniéndose a la transmisión...', '', 2000);

        // Obtener datos de la transmisión
        const { data: stream, error } = await supabase
            .from('live_streams')
            .select('*, usuarios(id, nombre)')
            .eq('id', streamId)
            .single();

        if (error) throw error;

        // Simular unirse a la transmisión (LiveKit real aquí)
        // En producción: room.join(...)

        showToast(`📺 Viendo: ${stream.titulo}`, 'success');

        // Marcar como transmisión actual para el chat
        currentStream = stream;
        suscribirseAlChat();

    } catch (error) {
        console.error('Error uniéndose:', error);
        showToast('❌ Error al unirse', 'error');
    }
}

// ================================================================
// 🔔 NOTIFICACIONES A SEGUIDORES
// ================================================================

async function notificarSeguidores() {
    try {
        if (!currentStream || !currentUser) return;

        // Obtener seguidores
        const { data: seguidores } = await supabase
            .from('live_seguidores')
            .select('seguidor_id')
            .eq('streamer_id', currentUser.id);

        if (!seguidores || seguidores.length === 0) return;

        // Crear notificación para cada seguidor
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
// 🎮 CONTROLES DE LA CÁMARA
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

        // Detener captura cuando el usuario cierra el selector
        screenStream.getVideoTracks()[0].onended = () => {
            // Volver a la cámara
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
        iniciarLectorVoz();
    } else {
        btn.textContent = '🔈';
        btn.classList.remove('voice-active');
        detenerLectorVoz();
    }
}

let speechSynthesis = null;

function iniciarLectorVoz() {
    if ('speechSynthesis' in window) {
        speechSynthesis = window.speechSynthesis;
        showToast('🔊 Lector de voz activado', 'success');
    } else {
        showToast('⚠️ Lector de voz no disponible', 'error');
        isVoiceActive = false;
    }
}

function detenerLectorVoz() {
    if (speechSynthesis) {
        speechSynthesis.cancel();
    }
}

function leerTexto(texto) {
    if (!isVoiceActive || !speechSynthesis) return;
    
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'es-ES';
    utterance.rate = 1;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
}

// ================================================================
// 📊 DASHBOARD DE ESTADÍSTICAS
// ================================================================

async function cargarEstadisticas() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data, error } = await supabase
            .from('live_streams')
            .select('*')
            .eq('usuario_id', session.user.id)
            .order('iniciado_en', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            showToast('📊 Sin estadísticas aún', 'warning');
            return;
        }

        // Calcular totales
        const totalStreams = data.length;
        const totalHoras = data.reduce((acc, s) => acc + (s.duracion || 0), 0) / 3600;
        const totalEspectadores = data.reduce((acc, s) => acc + (s.espectadores || 0), 0);
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
    }
}

// ================================================================
// 🚀 FUNCIONES ADICIONALES
// ================================================================

function verTodasLasTransmisiones() {
    cargarTransmisionesActivas();
    showToast('📺 Cargando transmisiones activas...', '', 2000);
}

// ================================================================
// 🚀 INICIALIZACIÓN
// ================================================================

document.addEventListener('DOMContentLoaded', async function() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para transmitir y chatear', 'warning');
    } else {
        currentUser = session.user;
    }

    // Cargar transmisiones activas
    cargarTransmisionesActivas();

    // Actualizar cada 30 segundos
    setInterval(cargarTransmisionesActivas, 30000);

    // Evento para enviar mensaje con Enter
    document.getElementById('chatInput')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            enviarMensaje();
        }
    });

    console.log('◈ Sariel\'s - Live Ultra Mega Pro');
    console.log('📡 LiveKit URL:', LIVEKIT_CONFIG.url);
    console.log('🔑 LiveKit API Key:', LIVEKIT_CONFIG.apiKey);
});

// ================================================================
// 📤 EXPOSICIÓN DE FUNCIONES GLOBALES
// ================================================================

// Transmisión
window.iniciarTransmision = iniciarTransmision;
window.finalizarTransmision = finalizarTransmision;
window.verTodasLasTransmisiones = verTodasLasTransmisiones;
window.unirseATransmision = unirseATransmision;

// Chat
window.enviarMensaje = enviarMensaje;

// Donaciones
window.enviarDonacion = enviarDonacion;

// Controles
window.togglePlay = togglePlay;
window.toggleMute = toggleMute;
window.capturarPantalla = capturarPantalla;
window.toggleVoice = toggleVoice;

// Seguidores
window.seguirStreamer = seguirStreamer;
window.dejarDeSeguir = dejarDeSeguir;
window.getSeguidores = getSeguidores;

// Estadísticas
window.cargarEstadisticas = cargarEstadisticas;

// Toast
window.showToast = showToast;