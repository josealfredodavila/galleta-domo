// ================================================================
// GRUPOS · LIVE DE CANAL (LiveKit)
// ================================================================
// Transmisión libre dentro del canal, estilo TikTok.
// - Sin Live Pass y sin costo de entrada.
// - Límite personal de 120 min al día (sumando todos los canales),
//   reinicio a medianoche hora de México. Lo controla el servidor.
// - Solo el streamer consume tiempo. Los espectadores no.
// - Una sola sala activa a la vez en el navegador.
// - API para la tarjeta de video (feed): window.grpLiveTarjeta.
// Depende de: grupos-config.js, grupos-utils.js, grupos-interno.js
// ================================================================

var _timerMinutoCanal = null;
var _restantesCanal = null;
var _videoDestinoLive = null;   // <video> donde se adjunta el track de la sala actual

const MENSAJES_ERROR_CANAL = {
    sin_minutos_hoy: 'Ya usaste tus 2 horas de hoy. Se reinician a medianoche (hora de México).',
    canal_ya_en_vivo: 'Este canal ya tiene un live activo',
    transmision_no_activa: 'Esta transmisión ya finalizó',
    live_pass_invalido: 'Error de permisos del canal. Intenta de nuevo.',
    canal_privado: 'Este canal es privado. Solo sus miembros pueden ver el live.',
    no_es_miembro: 'Debes ser miembro del canal para transmitir.',
    'Debes ser miembro del canal': 'Debes ser miembro del canal',
    'Ya tienes una transmisión activa': 'Ya tienes una transmisión activa en otro canal'
};

const ICONO_RELOJ_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;">' +
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

const ICONO_EN_VIVO_SVG =
    '<svg class="icon icon-sm" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg>';

// ================================================================
// TOKEN DE LIVEKIT (endpoint real: streamId + rol)
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
    return {
        token: data.token,
        url: data.url || LIVEKIT_CONFIG.url,
        canPublish: data.canPublish === true
    };
}

// ================================================================
// TIEMPO DIARIO DEL STREAMER
// ================================================================
async function obtenerTiempoCanal() {
    const { data, error } = await window.supabaseClient.rpc('obtener_tiempo_canal');
    if (error) throw error;
    const r = Array.isArray(data) ? data[0] : data;
    return {
        restantes: Number(r?.restantes) || 0,
        usados: Number(r?.usados) || 0
    };
}

function formatoTiempoLive(minutos) {
    const m = Math.max(0, Math.floor(Number(minutos) || 0));
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h > 0 ? `${h} h ${r} min` : `${r} min`;
}

function asegurarBannerCanal() {
    let b = document.getElementById('canalTiempoBanner');
    if (b) return b;

    const cont = document.getElementById('grupoLiveContainer');
    if (!cont) return null;

    b = document.createElement('div');
    b.id = 'canalTiempoBanner';
    b.style.cssText =
        'padding:8px 14px;font-size:0.65rem;line-height:1.5;color:var(--gold);' +
        'background:rgba(0,0,0,0.35);border-bottom:1px solid var(--glass-border);';

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

    b.innerHTML =
        ICONO_RELOJ_SVG +
        grpEscapeHTML(
            `Te quedan ${formatoTiempoLive(restantes)} hoy. Tu límite de 2 h al día es personal ` +
            `(suma todos tus canales) y se reinicia a medianoche (hora de México).`
        );
    b.style.color = restantes <= 10 ? 'var(--danger)' : 'var(--gold)';
}

// ================================================================
// CONTADOR DEL STREAMER (solo quien transmite)
// ================================================================
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

            if (r?.finalizada) await terminarLivePorTiempo();
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
// SALAS DE LIVEKIT: una a la vez, con listeners creados una sola vez
// ================================================================
function actualizarEspectadoresLive() {
    const el = document.getElementById('grupoLiveEspectadores');
    if (el && liveKitRoomGrupo) {
        el.textContent = liveKitRoomGrupo.remoteParticipants.size || 0;
    }
}

function crearSalaLive(Room) {
    const sala = new Room();
    sala.on('trackSubscribed', (track) => adjuntarTrackGrupo(track));
    sala.on('participantConnected', actualizarEspectadoresLive);
    sala.on('participantDisconnected', actualizarEspectadoresLive);
    return sala;
}

// Desconecta la sala actual y el chat. No toca la UI.
async function desconectarSalaLive() {
    if (liveKitRoomGrupo) {
        try { await liveKitRoomGrupo.disconnect(); } catch (e) {}
        liveKitRoomGrupo = null;
    }
    if (channelChatGrupo) {
        try { window.supabaseClient.removeChannel(channelChatGrupo); } catch (e) {}
        channelChatGrupo = null;
    }
    _videoDestinoLive = null;
}

// ================================================================
// LIMPIEZA COMÚN (salir al aire fallido, fin de tiempo, finalizar)
// ================================================================
async function limpiarEstadoLiveCanal() {
    detenerContadorCanal();
    await desconectarSalaLive();

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

    if (grupoActualId) await cargarPublicacionesGrupo(grupoActualId);
    await cargarDashboard();
}

// ================================================================
// CERRAR / MOSTRAR LIVE INLINE
// ================================================================
// Cerrar la vista no corta el live del streamer. Al espectador sí se le desconecta.
async function cerrarLiveGrupoInline() {
    const container = document.getElementById('grupoLiveContainer');
    if (container) container.classList.remove('visible');

    if (!esStreamerDelLiveGrupo) {
        await desconectarSalaLive();
    }
}

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
    const aceptar = confirm(
        'Vas a salir al aire en el canal.\n\n' +
        `• Te quedan ${formatoTiempoLive(minutos)} hoy. Tu límite es de 2 horas al día en total, sumando todos tus canales.\n` +
        '• El contador se reinicia a medianoche (hora de México).\n' +
        '• Al agotarse tu tiempo, el live se cierra solo.\n' +
        '• Las donaciones se reparten: 50% para el creador y 50% para la plataforma.\n' +
        '• Transmite contenido apto para público general.\n\n' +
        '¿Quieres comenzar?'
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
        await desconectarSalaLive();
        liveKitRoomGrupo = crearSalaLive(Room);
        _videoDestinoLive = document.getElementById('grupoLiveVideo');

        const tokenInfo = await obtenerTokenLiveKitGrupo(transmision.id, 'streamer');
        if (!tokenInfo.canPublish) throw new Error(MENSAJES_ERROR_CANAL.sin_minutos_hoy);

        await liveKitRoomGrupo.connect(tokenInfo.url, tokenInfo.token);
        await liveKitRoomGrupo.localParticipant.setCameraEnabled(true);
        await liveKitRoomGrupo.localParticipant.setMicrophoneEnabled(true);

        const localVideoTrack = liveKitRoomGrupo.localParticipant
            .getTrackPublication(Track.Source.Camera)?.videoTrack;
        if (localVideoTrack && _videoDestinoLive) {
            localVideoTrack.attach(_videoDestinoLive);
        }

        document.getElementById('grupoLiveEstado').innerHTML = ICONO_EN_VIVO_SVG + ' En vivo';
        grpShowToast('Transmitiendo en el canal', 'success');

        iniciarContadorCanal(transmision.id);
        suscribirseAlChatGrupo();
    } catch (e) {
        console.error('[Canal] Error al iniciar live:', e);

        if (transmisionId) {
            try { await window.supabaseClient.rpc('finalizar_transmision', { p_transmision_id: transmisionId }); }
            catch (e2) { console.warn('[Canal] Error finalizando:', e2); }
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
// CANAL PRIVADO: ¿puede este usuario ver el live?
// ================================================================
async function puedeVerLive(grupoId) {
    if (!sessionUser) return false;

    const { data: grupo, error: errGrupo } = await window.supabaseClient
        .from('grupos_video')
        .select('visibilidad')
        .eq('id', grupoId)
        .maybeSingle();
    if (errGrupo) return false;
    if (!grupo || grupo.visibilidad !== 'privado') return true;

    const { data: miembro } = await window.supabaseClient
        .from('grupos_video_miembros')
        .select('grupo_id')
        .eq('grupo_id', grupoId)
        .eq('usuario_id', sessionUser.id)
        .eq('estado', 'activo')
        .maybeSingle();
    return !!miembro;
}

// ================================================================
// CONECTAR ESPECTADOR A UNA SALA (interno del canal o tarjeta)
// ================================================================
async function conectarEspectadorLive(transmision, videoEl) {
    if (!transmision) throw new Error('No hay transmisión');

    if (!(await puedeVerLive(transmision.grupo_id))) {
        throw new Error('Este canal es privado. Solo sus miembros pueden ver el live.');
    }

    const { Room } = await grpCargarLiveKit();
    await desconectarSalaLive();
    liveKitRoomGrupo = crearSalaLive(Room);
    _videoDestinoLive = videoEl || document.getElementById('grupoLiveVideo');

    const tokenInfo = await obtenerTokenLiveKitGrupo(transmision.id, 'viewer');
    await liveKitRoomGrupo.connect(tokenInfo.url, tokenInfo.token);

    liveKitRoomGrupo.remoteParticipants.forEach(function (participant) {
        participant.trackPublications.forEach(function (pub) {
            if (pub.track) adjuntarTrackGrupo(pub.track);
        });
    });

    actualizarEspectadoresLive();
    suscribirseAlChatGrupo();
}

// ================================================================
// VER LIVE ACTIVO (espectador o streamer que regresa)
// ================================================================
async function verLiveActivo() {
    if (!liveActivoEnGrupo) { grpShowToast('No hay LIVE activo', 'warning'); return; }

    mostrarLiveGrupoInline(liveActivoEnGrupo);
    esStreamerDelLiveGrupo = !!(sessionUser && liveActivoEnGrupo.streamer_id === sessionUser.id);
    document.getElementById('grupoLiveEndBtn').style.display = esStreamerDelLiveGrupo ? 'flex' : 'none';

    const videoEl = document.getElementById('grupoLiveVideo');
    if (videoEl) videoEl.muted = esStreamerDelLiveGrupo;

    try {
        if (esStreamerDelLiveGrupo) {
            // El streamer regresa a su propio live: reconecta como streamer y retoma su contador.
            const { Room } = await grpCargarLiveKit();
            await desconectarSalaLive();
            liveKitRoomGrupo = crearSalaLive(Room);
            _videoDestinoLive = videoEl;

            const tokenInfo = await obtenerTokenLiveKitGrupo(liveActivoEnGrupo.id, 'streamer');
            await liveKitRoomGrupo.connect(tokenInfo.url, tokenInfo.token);

            document.getElementById('grupoLiveEstado').innerHTML = ICONO_EN_VIVO_SVG + ' En vivo';
            grpShowToast('Conectado al LIVE', 'success');

            actualizarBannerCanal(null);
            try {
                const tiempo = await obtenerTiempoCanal();
                actualizarBannerCanal(tiempo.restantes);
            } catch (e) {}
            iniciarContadorCanal(liveActivoEnGrupo.id);
            suscribirseAlChatGrupo();
        } else {
            // Espectador: no consume tiempo y no abre contador.
            await conectarEspectadorLive(liveActivoEnGrupo, videoEl);
            document.getElementById('grupoLiveEstado').innerHTML = ICONO_EN_VIVO_SVG + ' En vivo';
            grpShowToast('Conectado al LIVE', 'success');
        }
    } catch (e) {
        grpShowToast('Error al conectar: ' + (e.message || e), 'warning');
    }
}

// ================================================================
// ADJUNTAR TRACK (video/audio) al destino actual
// ================================================================
function adjuntarTrackGrupo(track) {
    const destino = _videoDestinoLive || document.getElementById('grupoLiveVideo');

    if (track.kind === 'video') {
        if (destino) {
            track.attach(destino);
            destino.play().catch(() => {});
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
    if (channelChatGrupo) window.supabaseClient.removeChannel(channelChatGrupo);

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
// MICRÓFONO (solo el streamer)
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
// REGALOS EN USDT DESDE EL LIVE
// ================================================================
// El flujo de pago vive en abrirModalRegalos (grupos-interno / marketplace).
// Aquí solo se le pasa el destinatario: el streamer del live activo.
function abrirRegaloLive() {
    const t = liveActivoEnGrupo;
    if (!t) { grpShowToast('No hay LIVE activo', 'warning'); return; }
    if (!sessionUser) { grpShowToast('Inicia sesión para regalar', 'error'); return; }
    if (typeof window.abrirModalRegalos !== 'function') {
        grpShowToast('Regalos en USDT no disponibles', 'warning');
        return;
    }
    window.abrirModalRegalos(t.streamer_id, grupoActual?.nombre || 'el creador');
}

// ================================================================
// FINALIZAR LIVE (manual, solo el streamer)
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

// ================================================================
// API PARA LA TARJETA DE VIDEO (feed de videos.html)
// ================================================================
// Uso desde la tarjeta activa del carrusel:
//   window.grpLiveTarjeta.conectar(transmision, videoEl)  → una sola sala a la vez
//   window.grpLiveTarjeta.desconectar()                   → al salir de la tarjeta
//   window.grpLiveTarjeta.regalar()                       → abre el flujo de USDT
window.grpLiveTarjeta = {
    conectar: async function (transmision, videoEl) {
        try {
            await conectarEspectadorLive(transmision, videoEl);
            return true;
        } catch (e) {
            console.warn('[Live tarjeta]', e?.message || e);
            return false;
        }
    },
    desconectar: async function () {
        if (!esStreamerDelLiveGrupo) await desconectarSalaLive();
    },
    regalar: abrirRegaloLive
};
