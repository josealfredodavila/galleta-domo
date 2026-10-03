// ================================================================
// GRUPOS · LIVE (LiveKit)
// ================================================================
// Sistema completo de transmisión en vivo dentro del canal:
// salir al aire, ver live, chat inline, finalizar.
// Depende de: grupos-config.js, grupos-utils.js, grupos-interno.js
// ================================================================

// ================================================================
// OBTENER TOKEN DE LIVEKIT
// ================================================================
async function obtenerTokenLiveKitGrupo(roomName, participantName, role) {
    const session = await grpGetSession();
    if (!session) throw new Error('No autenticado');
    const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ roomName: roomName, participantName: participantName })
    });
    if (!response.ok) {
        let error = { message: 'Error' };
        try { error = await response.json(); } catch (e) {}
        throw new Error(error.message || error.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.token;
}

// ================================================================
// MOSTRAR LIVE INLINE
// ================================================================
function mostrarLiveGrupoInline(transmision) {
    const container = document.getElementById('grupoLiveContainer');
    const titulo = document.getElementById('grupoLiveTitulo');
    if (!container) return;
    container.classList.add('visible');
    if (titulo) titulo.textContent = transmision.titulo || 'Transmisión del canal';
}

// ================================================================
// CERRAR LIVE INLINE
// ================================================================
async function cerrarLiveGrupoInline() {
    const container = document.getElementById('grupoLiveContainer');
    if (container) container.classList.remove('visible');

    if (!esStreamerDelLiveGrupo) {
        if (liveKitRoomGrupo) {
            try { await liveKitRoomGrupo.disconnect(); } catch(e) {}
            liveKitRoomGrupo = null;
        }
        if (channelChatGrupo) {
            try { window.supabaseClient.removeChannel(channelChatGrupo); } catch(e) {}
            channelChatGrupo = null;
        }
    }
}

// ================================================================
// INICIAR LIVE EN GRUPO (SALIR AL AIRE)
// ================================================================
async function iniciarLiveEnGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) { grpShowToast('No hay canal seleccionado', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro del canal', 'error'); return; }
    if (isLiveGrupoActivo) { grpShowToast('Ya hay un LIVE activo', 'warning'); return; }

    var liveExistente = await verificarLiveActivoGrupo(grupoActualId);
    if (liveExistente) { grpShowToast('Ya hay un LIVE activo', 'warning'); return; }

    try {
        var titulo = prompt('Título del LIVE:', 'Saliendo al aire en ' + (grupoActual.nombre || 'canal')) || 'Live en canal';
        if (!validarTextoPermitido(titulo, 'Título del Live')) return;

        grpShowToast('Saliendo al aire...', '');

        const { data: rpcResult, error } = await window.supabaseClient.rpc('crear_transmision', {
            p_titulo: titulo,
            p_categoria: 'grupo',
            p_room_name: null,
            p_grupo_id: grupoActualId
        });
        if (error) throw new Error(error.message || 'Error al crear LIVE');

        const nuevoId = (typeof rpcResult === 'object' && rpcResult !== null) ? rpcResult.id : rpcResult;
        if (!nuevoId) throw new Error('No se pudo crear la transmisión');

        const { data: transmision, error: fetchError } = await window.supabaseClient
            .from('transmisiones')
            .select('*')
            .eq('id', nuevoId)
            .single();
        if (fetchError || !transmision) throw new Error('No se pudo recuperar la transmisión');

        currentStreamGrupoId = transmision.id;
        liveActivoEnGrupo = transmision;
        isLiveGrupoActivo = true;
        esStreamerDelLiveGrupo = true;

        mostrarLiveGrupoInline(transmision);
        document.getElementById('grupoLiveBadge').style.display = 'inline-flex';
        document.getElementById('btnIniciarLive').style.display = 'none';
        document.getElementById('btnFinalizarLive').style.display = 'inline-flex';
        document.getElementById('btnVerLive').style.display = 'inline-flex';
        document.getElementById('grupoLiveEndBtn').style.display = 'flex';

        await cargarDashboard();

        try {
            grpShowToast('Conectando a LiveKit...', '', 2000);
            const { Room, Track } = await grpCargarLiveKit();
            liveKitRoomGrupo = new Room();

            const token = await obtenerTokenLiveKitGrupo(transmision.room_name, sessionUser.id, 'publisher');
            await liveKitRoomGrupo.connect(LIVEKIT_CONFIG.url, token);
            await liveKitRoomGrupo.localParticipant.setCameraEnabled(true);
            await liveKitRoomGrupo.localParticipant.setMicrophoneEnabled(true);

            const localVideoTrack = liveKitRoomGrupo.localParticipant
                .getTrackPublication(Track.Source.Camera)?.videoTrack;
            if (localVideoTrack) {
                localVideoTrack.attach(document.getElementById('grupoLiveVideo'));
            }

            document.getElementById('grupoLiveEstado').innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg> En vivo';
            grpShowToast('Transmitiendo en el canal', 'success');
        } catch (e) {
            console.error('[LiveKit] Error al conectar:', e);
            try {
                if (transmision && transmision.id) {
                    await window.supabaseClient.rpc('finalizar_transmision', { p_transmision_id: transmision.id });
                }
            } catch (e2) { console.warn('[LiveKit] Error finalizando transmision:', e2); }
            try {
                if (liveKitRoomGrupo) { await liveKitRoomGrupo.disconnect(); }
            } catch (e3) { console.warn('[LiveKit] Error desconectando:', e3); }

            liveKitRoomGrupo = null;
            liveActivoEnGrupo = null;
            isLiveGrupoActivo = false;
            currentStreamGrupoId = null;
            esStreamerDelLiveGrupo = false;
            cerrarLiveGrupoInline();

            document.getElementById('grupoLiveBadge').style.display = 'none';
            document.getElementById('btnIniciarLive').style.display = 'inline-flex';
            document.getElementById('btnFinalizarLive').style.display = 'none';
            document.getElementById('btnVerLive').style.display = 'none';
            document.getElementById('grupoLiveEndBtn').style.display = 'none';

            var msj = 'No se pudo iniciar la transmisión';
            if (e && e.name === 'NotAllowedError') msj = 'Permite cámara y micrófono en el navegador';
            else if (e && e.name === 'NotReadableError') msj = 'La cámara está en uso por otra app';
            else if (e && e.message) msj = e.message;
            grpShowToast(msj, 'error', 6000);
            return;
        }

        suscribirseAlChatGrupo();
    } catch (e) {
        grpShowToast('Error: ' + e.message, 'error');
        isLiveGrupoActivo = false;
    }
}

// ================================================================
// VER LIVE ACTIVO (como espectador o streamer)
// ================================================================
async function verLiveActivo() {
    if (!liveActivoEnGrupo) { grpShowToast('No hay LIVE activo', 'warning'); return; }
    mostrarLiveGrupoInline(liveActivoEnGrupo);
    esStreamerDelLiveGrupo = (sessionUser && liveActivoEnGrupo.streamer_id === sessionUser.id);

    document.getElementById('grupoLiveEndBtn').style.display = esStreamerDelLiveGrupo ? 'flex' : 'none';

    const videoEl = document.getElementById('grupoLiveVideo');
    if (videoEl) {
        videoEl.muted = esStreamerDelLiveGrupo;
    }

    try {
        const { Room } = await grpCargarLiveKit();
        if (liveKitRoomGrupo) {
            try { await liveKitRoomGrupo.disconnect(); } catch(e) {}
            liveKitRoomGrupo = null;
        }
        liveKitRoomGrupo = new Room();
        const token = await obtenerTokenLiveKitGrupo(liveActivoEnGrupo.room_name, sessionUser?.id || 'anon', 'subscriber');
        await liveKitRoomGrupo.connect(LIVEKIT_CONFIG.url, token);

        liveKitRoomGrupo.remoteParticipants.forEach(function(participant) {
            participant.trackPublications.forEach(function(pub) {
                if (pub.track) {
                    adjuntarTrackGrupo(pub.track);
                }
            });
        });

        liveKitRoomGrupo.on('trackSubscribed', (track) => {
            adjuntarTrackGrupo(track);
        });

        function actualizarEspectadores() {
            var el = document.getElementById('grupoLiveEspectadores');
            if (el && liveKitRoomGrupo) {
                el.textContent = liveKitRoomGrupo.remoteParticipants.size || 0;
            }
        }
        actualizarEspectadores();
        liveKitRoomGrupo.on('participantConnected', actualizarEspectadores);
        liveKitRoomGrupo.on('participantDisconnected', actualizarEspectadores);

        document.getElementById('grupoLiveEstado').innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg> En vivo';
        grpShowToast('Conectado al LIVE', 'success');
        suscribirseAlChatGrupo();
    } catch (e) {
        grpShowToast('Error al conectar: ' + e.message, 'warning');
    }
}

// ================================================================
// ADJUNTAR TRACK (video/audio)
// ================================================================
function adjuntarTrackGrupo(track) {
    if (track.kind === 'video') {
        const video = document.getElementById('grupoLiveVideo');
        if (video) {
            track.attach(video);
            video.play().catch(e => {});
        }
    } else if (track.kind === 'audio') {
        let audioEl = document.getElementById('grupoLiveAudio');
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = 'grupoLiveAudio';
            audioEl.autoplay = true;
            audioEl.style.display = 'none';
            document.body.appendChild(audioEl);
        }
        track.attach(audioEl);
        audioEl.play().catch(e => {});
    }
}

// ================================================================
// CHAT EN VIVO (suscripción a mensajes_live)
// ================================================================
function suscribirseAlChatGrupo() {
    if (!currentStreamGrupoId) return;
    if (channelChatGrupo) { window.supabaseClient.removeChannel(channelChatGrupo); }
    channelChatGrupo = window.supabaseClient
        .channel(`grupo-live-${currentStreamGrupoId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes_live',
            filter: `transmision_id=eq.${currentStreamGrupoId}`
        }, (payload) => {
            agregarMensajeChatGrupo(payload.new);
        })
        .subscribe();
}

async function enviarMensajeLiveGrupo() {
    const input = document.getElementById('grupoLiveChatInput');
    const mensaje = (input?.value || '').trim();
    if (!mensaje) return;
    if (!sessionUser) { grpShowToast('Inicia sesión para chatear', 'error'); return; }
    if (!currentStreamGrupoId) { grpShowToast('No hay LIVE activo', 'error'); return; }
    if (!validarTextoPermitido(mensaje, 'Mensaje del Live')) return;

    try {
        grpOk(await window.supabaseClient.from('mensajes_live').insert({
            transmision_id: currentStreamGrupoId,
            usuario_id: sessionUser.id,
            mensaje: mensaje,
            nombre_usuario: sessionUser.user_metadata?.nombre || 'Usuario',
            creado_en: new Date().toISOString()
        }));
        input.value = '';
    } catch (e) {
        grpShowToast('Error al enviar: ' + (e.message || e), 'error');
    }
}

function agregarMensajeChatGrupo(mensaje) {
    const container = document.getElementById('grupoLiveChat');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<strong>${grpEscapeHTML(mensaje.nombre_usuario || 'Usuario')}:</strong> ${grpEscapeHTML(mensaje.mensaje)}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ================================================================
// TOGGLE MUTE (solo el streamer)
// ================================================================
async function toggleMuteGrupoLive() {
    if (!liveKitRoomGrupo || !esStreamerDelLiveGrupo) {
        grpShowToast('Solo el streamer', 'warning');
        return;
    }
    try {
        const enabled = liveKitRoomGrupo.localParticipant.isMicrophoneEnabled;
        await liveKitRoomGrupo.localParticipant.setMicrophoneEnabled(!enabled);
        grpShowToast(enabled ? 'Micrófono silenciado' : 'Micrófono activado', 'success', 2000);
    } catch (e) {
        console.warn('Error micrófono:', e);
    }
}

// ================================================================
// FINALIZAR LIVE
// ================================================================
async function finalizarLiveGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) { grpShowToast('No hay canal', 'error'); return; }

    const { data: transmisionActiva } = await window.supabaseClient
        .from('transmisiones')
        .select('*')
        .eq('grupo_id', grupoActualId)
        .eq('estado', 'en_vivo')
        .eq('is_live', true)
        .maybeSingle();
    if (!transmisionActiva) { grpShowToast('No hay LIVE activo', 'warning'); return; }
    if (transmisionActiva.streamer_id !== sessionUser.id) { grpShowToast('Solo el streamer', 'error'); return; }
    if (!confirm('¿Finalizar el LIVE del canal?')) return;

    grpShowToast('Finalizando...', '');

    try {
        const { error } = await window.supabaseClient.rpc('finalizar_transmision', {
            p_transmision_id: transmisionActiva.id
        });
        if (error) {
            await window.supabaseClient
                .from('transmisiones')
                .update({
                    estado: 'finalizada',
                    is_live: false,
                    fecha_fin: new Date().toISOString()
                })
                .eq('id', transmisionActiva.id);
        }

        grpShowToast('LIVE finalizado', 'success');

        if (liveKitRoomGrupo) {
            try { await liveKitRoomGrupo.disconnect(); } catch (e) {}
            liveKitRoomGrupo = null;
        }
        if (channelChatGrupo) {
            try { window.supabaseClient.removeChannel(channelChatGrupo); } catch (e) {}
            channelChatGrupo = null;
        }

        liveActivoEnGrupo = null;
        isLiveGrupoActivo = false;
        currentStreamGrupoId = null;
        esStreamerDelLiveGrupo = false;

        cerrarLiveGrupoInline();

        document.getElementById('grupoLiveBadge').style.display = 'none';
        document.getElementById('btnIniciarLive').style.display = 'inline-flex';
        document.getElementById('btnVerLive').style.display = 'none';
        document.getElementById('btnFinalizarLive').style.display = 'none';
        document.getElementById('grupoLiveEndBtn').style.display = 'none';

        await cargarPublicacionesGrupo(grupoActualId);
        await cargarDashboard();
        await cargarGrupos();
    } catch (e) {
        grpShowToast('Error: ' + e.message, 'error');
    }
}