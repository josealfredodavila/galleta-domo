// ================================================================
// GRUPOS · LIVE DE CANAL (LiveKit)
// ================================================================
// Transmisión libre dentro del canal, estilo TikTok.
// - Sin Live Pass y sin costo de entrada.
// - Límite personal de 120 min al día (sumando todos los canales),
//   reinicio a medianoche hora de México. Lo controla el servidor.
// Depende de: grupos-config.js, grupos-utils.js, grupos-interno.js
// ================================================================

var _timerMinutoCanal = null;
var _restantesCanal = null;

const LIMITE_CANAL_MIN = 120;
const MENSAJES_ERROR_CANAL = {
    sin_minutos_hoy: 'Ya usaste tus 2 horas de hoy. Se reinician a medianoche (hora de México).',
    canal_ya_en_vivo: 'Este canal ya tiene un live activo',
    transmision_no_activa: 'Esta transmisión ya finalizó',
    live_pass_invalido: 'Error de permisos del canal. Intenta de nuevo.',
    'Debes ser miembro del canal': 'Debes ser miembro del canal',
    'Ya tienes una transmisión activa': 'Ya tienes una transmisión activa en otro canal'
};

// ================================================================
// TOKEN DE LIVEKIT (usa el endpoint real: streamId + rol)
// ================================================================
async function obtenerTokenLiveKitGrupo(streamId, rol) {
    const session = await grpGetSession();
    if (!session) throw new Error('No autenticado');
    const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ streamId: Number(streamId), rol: rol })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) {
        const codigo = data.error || '';
        throw new Error(MENSAJES_ERROR_CANAL[codigo] || `No se pudo conectar (${codigo || response.status})`);
    }
    return { token: data.token, url: data.url || LIVEKIT_CONFIG.url, canPublish: data.canPublish === true };
}

// ================================================================
// TIEMPO DIARIO DEL CANAL
// ================================================================
async function obtenerTiempoCanal() {
    const { data, error } = await window.supabaseClient.rpc('obtener_tiempo_canal');
    if (error) throw error;
    const r = Array.isArray(data) ? data[0] : data;
    return { restantes: Number(r?.restantes) || 0, usados: Number(r?.usados) || 0 };
}

function asegurarBannerCanal() {
    let b = document.getElementById('canalTiempoBanner');
    if (b) return b;
    const cont = document.getElementById('grupoLiveContainer');
    if (!cont) return null;
    b = document.createElement('div');
    b.id = 'canalTiempoBanner';
    b.style.cssText = 'padding:8px 14px;font-size:0.65rem;line-height:1.5;color:var(--gold);background:rgba(0,0,0,0.35);border-bottom:1px solid var(--glass-border);';
    const videoWrap = cont.querySelector('.live-video-wrap');
    cont.insertBefore(b, videoWrap || cont.firstChild);
    return b;
}

function actualizarBannerCanal(restantes) {
    const b = asegurarBannerCanal();
    if (!b) return;
    if (restantes == null) {
        b.textContent = 'Calculando tu tiempo de hoy…';
        return;
    }
    const h = Math.floor(restantes / 60);
    const m = restantes % 60;
    const tiempo = h > 0 ? `${h} h ${m} min` : `${m} min`;
    b.textContent = `⏱ Te quedan ${tiempo} hoy. Tu límite de 2 h al día es personal (suma todos tus canales) y se reinicia a medianoche (hora de México).`;
    b.style.color = restantes <= 10 ? '#ff3366' : 'var(--gold)';
}

function detenerContadorCanal() {
    if (_timerMinutoCanal) {
        clearInterval(_timerMinutoCanal);
        _timerMinutoCanal = null;
    }
}

// Cuenta un minuto por cada 60 s. El servidor cierra el live al llegar a 0.
function iniciarContadorCanal(transmisionId) {
    detenerContadorCanal();
    _timerMinutoCanal = setInterval(async () => {
        try {
            const { data, error } = await window.supabaseClient.rpc('registrar_minuto_canal', {
                p_transmision_id: Number(transmisionId)
            });
            if (error) throw error;
            const r = Array.isArray(data) ? data[0] : data;
            _restantesCanal = Number(r?.restantes) || 0;
            actualizarBannerCanal(_restantesCanal);
            if (r?.finalizada) {
                await terminarLivePorTiempo();
            }
        } catch (e) {
            console.warn('[Canal] Error registrando minuto:', e?.message || e);
        }
    }, 60000);
}

async function terminarLivePorTiempo() {
    detenerContadorCanal();
    grpShowToast('Se agotaron tus 2 horas de hoy. El live terminó.', 'warning', 8000);
    await limpiarEstadoLiveCanal();
}

// ================================================================
// LIMPIEZA COMÚN (salir al aire fallido, fin de tiempo, finalizar)
// ================================================================
async function limpiarEstadoLiveCanal() {
    detenerContadorCanal();
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
    _restantesCanal = null;

    cerrarLiveGrupoInline();

    const banner = document.getElementById('canalTiempoBanner');
    if (banner) banner.remove();

    document.getElementById('grupoLiveBadge').style.display = 'none';
    document.getElementById('btnIniciarLive').style.display = 'inline-flex';
    document.getElementById('btnVerLive').style.display = 'none';
    document.getElementById('btnFinalizarLive').style.display = 'none';
    document.getElementById('grupoLiveEndBtn').style.display = 'none';

    if (grupoActualId) {
        await cargarPublicacionesGrupo(grupoActualId);
    }
    await cargarDashboard();
}

// ================================================================
// CERRAR LIVE INLINE (solo vista; el streamer sigue en el live)
// ================================================================
async function cerrarLiveGrupoInline() {
    const container = document.getElementById('grupoLiveContainer');
    if (container) container.classList.remove('visible');

    if (!esStreamerDelLiveGrupo) {
        if (liveKitRoomGrupo) {
            try { await liveKitRoomGrupo.disconnect(); } catch (e) {}
            liveKitRoomGrupo = null;
        }
        if (channelChatGrupo) {
            try { window.supabaseClient.removeChannel(channelChatGrupo); } catch (e) {}
            channelChatGrupo = null;
        }
    }
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
// INICIAR LIVE EN CANAL (SALIR AL AIRE)
// ================================================================
async function iniciarLiveEnGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) { grpShowToast('No hay canal seleccionado', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro del canal', 'error'); return; }
    if (isLiveGrupoActivo) { grpShowToast('Ya hay un LIVE activo', 'warning'); return; }

    const liveExistente = await verificarLiveActivoGrupo(grupoActualId);
    if (liveExistente) { grpShowToast('Ya hay un LIVE activo', 'warning'); return; }

    // Tiempo disponible antes de pedir título
    let tiempo;
    try {
        tiempo = await obtenerTiempoCanal();
    } catch (e) {
        grpShowToast('No se pudo verificar tu tiempo de hoy', 'error');
        return;
    }
    if (tiempo.restantes <= 0) {
        grpShowToast(MENSAJES_ERROR_CANAL.sin_minutos_hoy, 'warning', 6000);
        return;
    }

    const minutos = tiempo.restantes;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    const tiempoTxt = h > 0 ? `${h} h ${m} min` : `${m} min`;
    const aceptar = confirm(
        `Vas a salir al aire en el canal.\n\n` +
        `• Te quedan ${tiempoTxt} hoy. Tu límite es de 2 horas al día en total, sumando todos tus canales.\n` +
        `• El contador se reinicia a medianoche (hora de México).\n` +
        `• Al agotarse tu tiempo, el live se cierra solo.\n` +
        `• Las donaciones se reparten: 50% para el creador y 50% para la plataforma.\n` +
        `• Transmite contenido apto para público general.\n\n` +
        `¿Quieres comenzar?`
    );
    if (!aceptar) return;

    const titulo = prompt('Título del LIVE:', 'Saliendo al aire en ' + (grupoActual?.nombre || 'canal')) || 'Live en canal';
    if (!validarTextoPermitido(titulo, 'Título del Live')) return;

    let transmisionId = null;
    try {
        grpShowToast('Saliendo al aire...', '');

        const { data: nuevoId, error } = await window.supabaseClient.rpc('crear_transmision_canal', {
            p_grupo_id: grupoActualId,
            p_titulo: titulo.slice(0, 80),
            p_categoria: 'general'
        });
        if (error) throw new Error(MENSAJES_ERROR_CANAL[error.message] || error.message || 'No se pudo crear el LIVE');
        transmisionId = Number(typeof nuevoId === 'object' && nuevoId !== null ? nuevoId.id : nuevoId);
        if (!transmisionId) throw new Error('No se pudo crear la transmisión');

        const { data: transmision, error: fetchError } = await window.supabaseClient
            .from('transmisiones')
            .select('*')
            .eq('id', transmisionId)
            .single();
        if (fetchError || !transmision) throw new Error('No se pudo recuperar la transmisión');

        currentStreamGrupoId = transmision.id;
        liveActivoEnGrupo = transmision;
        isLiveGrupoActivo = true;
        esStreamerDelLiveGrupo = true;

        mostrarLiveGrupoInline(transmision);
        actualizarBannerCanal(minutos);
        document.getElementById('grupoLiveBadge').style.display = 'inline-flex';
        document.getElementById('btnIniciarLive').style.display = 'none';
        document.getElementById('btnFinalizarLive').style.display = 'inline-flex';
        document.getElementById('btnVerLive').style.display = 'inline-flex';
        document.getElementById('grupoLiveEndBtn').style.display = 'flex';

        await cargarDashboard();

        grpShowToast('Conectando a LiveKit...', '', 2000);
        const { Room, Track } = await grpCargarLiveKit();
        liveKitRoomGrupo = new Room();

        const tokenInfo = await obtenerTokenLiveKitGrupo(transmision.id, 'streamer');
        if (!tokenInfo.canPublish) throw new Error(MENSAJES_ERROR_CANAL.sin_minutos_hoy);

        await liveKitRoomGrupo.connect(tokenInfo.url, tokenInfo.token);
        await liveKitRoomGrupo.localParticipant.setCameraEnabled(true);
        await liveKitRoomGrupo.localParticipant.setMicrophoneEnabled(true);

        const localVideoTrack = liveKitRoomGrupo.localParticipant
            .getTrackPublication(Track.Source.Camera)?.videoTrack;
        if (localVideoTrack) {
            localVideoTrack.attach(document.getElementById('grupoLiveVideo'));
        }

        document.getElementById('grupoLiveEstado').innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg> En vivo';
        grpShowToast('Transmitiendo en el canal', 'success');

        iniciarContadorCanal(transmision.id);
        suscribirseAlChatGrupo();
    } catch (e) {
        console.error('[Canal] Error al iniciar live:', e);

        if (transmisionId) {
            try { await window.supabaseClient.rpc('finalizar_transmision', { p_transmision_id: transmisionId }); }
            catch (e2) { console.warn('[Canal] Error finalizando:', e2); }
        }
        if (liveKitRoomGrupo) {
            try { await liveKitRoomGrupo.disconnect(); } catch (e3) {}
        }
        await limpiarEstadoLiveCanal();

        let msj = 'No se pudo iniciar la transmisión';
        if (e && e.name === 'NotAllowedError') msj = 'Permite cámara y micrófono en el navegador';
        else if (e && e.name === 'NotReadableError') msj = 'La cámara está en uso por otra app';
        else if (e && e.message) msj = e.message;
        grpShowToast(msj, 'error', 6000);
    }
}

// ================================================================
// VER LIVE ACTIVO (espectador o streamer que regresa)
// ================================================================
async function verLiveActivo() {
    if (!liveActivoEnGrupo) { grpShowToast('No hay LIVE activo', 'warning'); return; }
    mostrarLiveGrupoInline(liveActivoEnGrupo);
    esStreamerDelLiveGrupo = (sessionUser && liveActivoEnGrupo.streamer_id === sessionUser.id);

    document.getElementById('grupoLiveEndBtn').style.display = esStreamerDelLiveGrupo ? 'flex' : 'none';

    const videoEl = document.getElementById('grupoLiveVideo');
    if (videoEl) videoEl.muted = esStreamerDelLiveGrupo;

    try {
        const { Room } = await grpCargarLiveKit();
        if (liveKitRoomGrupo) {
            try { await liveKitRoomGrupo.disconnect(); } catch (e) {}
            liveKitRoomGrupo = null;
        }
        liveKitRoomGrupo = new Room();

        const rol = esStreamerDelLiveGrupo ? 'streamer' : 'viewer';
        const tokenInfo = await obtenerTokenLiveKitGrupo(liveActivoEnGrupo.id, rol);
        await liveKitRoomGrupo.connect(tokenInfo.url, tokenInfo.token);

        liveKitRoomGrupo.remoteParticipants.forEach(function (participant) {
            participant.trackPublications.forEach(function (pub) {
                if (pub.track) adjuntarTrackGrupo(pub.track);
            });
        });

        liveKitRoomGrupo.on('trackSubscribed', (track) => adjuntarTrackGrupo(track));

        function actualizarEspectadores() {
            const el = document.getElementById('grupoLiveEspectadores');
            if (el && liveKitRoomGrupo) {
                el.textContent = liveKitRoomGrupo.remoteParticipants.size || 0;
            }
        }
        actualizarEspectadores();
        liveKitRoomGrupo.on('participantConnected', actualizarEspectadores);
        liveKitRoomGrupo.on('participantDisconnected', actualizarEspectadores);

        document.getElementById('grupoLiveEstado').innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg> En vivo';
        grpShowToast('Conectado al LIVE', 'success');

        if (esStreamerDelLiveGrupo) {
            // Streamer que regresa: retoma el contador de su tiempo
            actualizarBannerCanal(null);
            try {
                const tiempo = await obtenerTiempoCanal();
                actualizarBannerCanal(tiempo.restantes);
            } catch (e) {}
            iniciarContadorCanal(liveActivoEnGrupo.id);
        }
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
            video.play().catch(() => {});
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
        audioEl.play().catch(() => {});
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
// FINALIZAR LIVE (manual)
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
                .update({ estado: 'finalizada', is_live: false, fecha_fin: new Date().toISOString() })
                .eq('id', transmisionActiva.id);
        }
        grpShowToast('LIVE finalizado', 'success');
        await limpiarEstadoLiveCanal();
        await cargarGrupos();
    } catch (e) {
        grpShowToast('Error: ' + e.message, 'error');
    }
}