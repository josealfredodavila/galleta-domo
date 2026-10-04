// ================================================================
// MENSAJES · LLAMADAS (LiveKit)
// ================================================================
// Videollamadas y llamadas entrantes con LiveKit.
// Depende de: config, utils, auth, conversaciones.
// ================================================================

// ================================================================
// TOKEN DE LIVEKIT
// ================================================================
async function token(roomName, participantName) {
    var s = await session();
    if (!s) throw new Error('No autenticado');

    var r = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + s.access_token
        },
        body: JSON.stringify({ roomName: roomName, participantName: participantName })
    });

    var d = await r.json().catch(function() { return {}; });
    if (!r.ok) throw new Error(d.error || 'No se pudo obtener token LiveKit');
    return d;
}

// ================================================================
// INICIAR LLAMADA
// ================================================================
async function startCall() {
    if (current && current.bot) {
        toast('⚠️ Marquinhos no acepta llamadas', 'warning');
        return;
    }
    if (!current) {
        toast('⚠️ Selecciona una conversación', 'error');
        return;
    }
    if (call.active) {
        var overlay = $('callOverlay');
        if (overlay) overlay.classList.add('show');
        return;
    }

    try {
        var s = await session();
        if (!s) {
            toast('⚠️ Inicia sesión para llamar', 'error');
            return;
        }

        var id = crypto.randomUUID();
        var roomName = 'call_' + id;

        var ins = await db.from('llamadas').insert({
            id: id,
            creador_id: user.id,
            destinatario_id: current.id,
            tipo: 'video',
            estado: 'ringing',
            room_name: roomName,
            conversation_id: current.id
        });

        if (ins.error) throw ins.error;

        var pi = await db.from('llamadas_participantes').insert({
            llamada_id: id,
            usuario_id: user.id,
            rol: 'creador',
            estado: 'conectado',
            entro_at: new Date().toISOString()
        });

        if (pi.error) throw pi.error;

        call.id = id;
        call.initiator = true;

        await connectCall(roomName, user.id);
        subscribeCall(id);

        var overlay = $('callOverlay');
        if (overlay) overlay.classList.add('show');

        var info = $('callInfo');
        if (info) {
            info.textContent = '📞 Llamando a ' + (current.profile.nombre || 'usuario') + '…';
        }
    } catch (e) {
        console.error('[Mensajes] Error iniciando llamada:', e);
        toast('❌ ' + e.message, 'error');
        cleanupCall();
    }
}

// ================================================================
// CONECTAR A LA SALA DE LIVEKIT
// ================================================================
async function connectCall(roomName, name) {
    if (!window.LivekitClient) {
        throw new Error('LiveKit no está cargado');
    }

    var td = await token(roomName, name);
    var room = new LivekitClient.Room();

    // Suscripción a tracks remotos
    room.on(LivekitClient.RoomEvent.TrackSubscribed, function(track) {
        if (track.kind === 'video') {
            var rv = $('remoteVideo');
            if (rv) track.attach(rv);
        }
        if (track.kind === 'audio') {
            track.attach();
        }
    });

    // Desconexión inesperada
    room.on(LivekitClient.RoomEvent.Disconnected, function() {
        if (call.active) cleanupCall();
    });

    await room.connect(td.url, td.token);

    // Publicar cámara y micrófono
    var stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
        }
    });

    var at = stream.getAudioTracks()[0];
    var vt = stream.getVideoTracks()[0];

    if (at) {
        await room.localParticipant.publishTrack(at, {
            name: 'microphone',
            source: LivekitClient.TrackSource.Microphone
        });
        call.audio = at;
    }

    if (vt) {
        await room.localParticipant.publishTrack(vt, {
            name: 'camera',
            source: LivekitClient.TrackSource.Camera
        });
        call.video = vt;

        var lv = $('localVideo');
        if (lv) lv.srcObject = new MediaStream([vt]);
    }

    call.room = room;
    call.active = true;
}

// ================================================================
// SUSCRIPCIÓN A CAMBIOS DE LA LLAMADA
// ================================================================
function subscribeCall(id) {
    if (callChannel) {
        db.removeChannel(callChannel);
        callChannel = null;
    }

    callChannel = db
        .channel('call-' + id)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'llamadas',
            filter: 'id=eq.' + id
        }, function(p) {
            if (['ended', 'rejected', 'missed'].indexOf(p.new.estado) !== -1) {
                toast('📞 La llamada terminó', '');
                cleanupCall();
            }
        })
        .subscribe();
}

// ================================================================
// LLAMADA ENTRANTE
// ================================================================
async function incoming(data) {
    if (call.active) {
        await db.from('llamadas').update({
            estado: 'rejected',
            finalizada_at: new Date().toISOString()
        }).eq('id', data.id);
        return;
    }

    if (data.creador_id === user.id) return;

    incomingId = data.id;
    var p = await profile(data.creador_id);

    var incomingName = $('incomingName');
    if (incomingName) incomingName.textContent = p.nombre || 'Usuario';

    var incomingAvatar = $('incomingAvatar');
    if (incomingAvatar) {
        incomingAvatar.innerHTML = p.avatar_url
            ? '<img src="' + esc(p.avatar_url) + '" alt="">'
            : esc((p.nombre || '◈').charAt(0).toUpperCase());
    }

    var overlay = $('incomingOverlay');
    if (overlay) overlay.classList.add('show');
}

// ================================================================
// ACEPTAR LLAMADA
// ================================================================
async function acceptCall() {
    if (!incomingId) return;

    try {
        var r = await db
            .from('llamadas')
            .select('room_name,creador_id')
            .eq('id', incomingId)
            .single();

        if (r.error) throw r.error;

        await db.from('llamadas').update({
            estado: 'active',
            contestada_at: new Date().toISOString()
        }).eq('id', incomingId);

        await db.from('llamadas_participantes').insert({
            llamada_id: incomingId,
            usuario_id: user.id,
            rol: 'invitado',
            estado: 'conectado',
            entro_at: new Date().toISOString()
        });

        call.id = incomingId;
        call.initiator = false;

        var incomingOverlay = $('incomingOverlay');
        if (incomingOverlay) incomingOverlay.classList.remove('show');

        await connectCall(r.data.room_name, user.id);
        subscribeCall(incomingId);
    } catch (e) {
        console.error('[Mensajes] Error aceptando llamada:', e);
        toast('❌ ' + e.message, 'error');
        cleanupCall();
    }
}

// ================================================================
// RECHAZAR LLAMADA
// ================================================================
async function rejectCall() {
    if (incomingId) {
        await db.from('llamadas').update({
            estado: 'rejected',
            finalizada_at: new Date().toISOString()
        }).eq('id', incomingId);
    }

    incomingId = null;

    var overlay = $('incomingOverlay');
    if (overlay) overlay.classList.remove('show');
}

// ================================================================
// COLGAR / LIMPIAR
// ================================================================
async function hangup() {
    if (call.id) {
        await db.from('llamadas').update({
            estado: 'ended',
            finalizada_at: new Date().toISOString()
        }).eq('id', call.id);
    }
    await cleanupCall();
}

async function cleanupCall() {
    try {
        if (call.room) call.room.disconnect();
        if (call.audio) call.audio.stop();
        if (call.video) call.video.stop();
        if (call.screen) call.screen.stop();

        var lv = $('localVideo');
        if (lv) lv.srcObject = null;

        var rv = $('remoteVideo');
        if (rv) rv.srcObject = null;

        if (callChannel) db.removeChannel(callChannel);
    } catch (e) {}

    Object.assign(call, {
        room: null,
        id: null,
        active: false,
        audio: null,
        video: null,
        screen: null
    });

    var overlay = $('callOverlay');
    if (overlay) overlay.classList.remove('show');

    var tm = $('toggleMic');
    if (tm) tm.textContent = '◉';

    var tc = $('toggleCam');
    if (tc) tc.textContent = '◈';

    var ts = $('toggleScreen');
    if (ts) ts.textContent = '▢';
}

// ================================================================
// TOGGLE MICRÓFONO
// ================================================================
async function toggleMic() {
    if (!call.audio) return;
    call.audio.enabled = !call.audio.enabled;
    var btn = $('toggleMic');
    if (btn) btn.textContent = call.audio.enabled ? '◉' : '◉̸';
}

// ================================================================
// TOGGLE CÁMARA
// ================================================================
async function toggleCam() {
    if (!call.video) return;
    call.video.enabled = !call.video.enabled;
    var btn = $('toggleCam');
    if (btn) btn.textContent = call.video.enabled ? '◈' : '◈̸';
}

// ================================================================
// COMPARTIR PANTALLA
// ================================================================
async function toggleScreen() {
    if (!call.room) return;

    try {
        // Si ya está compartiendo → detener
        if (call.screen) {
            await call.room.localParticipant.unpublishTrack(call.screen);
            call.screen.stop();
            call.screen = null;

            var btn = $('toggleScreen');
            if (btn) btn.textContent = '▢';
            return;
        }

        var s = await navigator.mediaDevices.getDisplayMedia({ video: true });
        var t = s.getVideoTracks()[0];

        await call.room.localParticipant.publishTrack(t, {
            name: 'screen',
            source: LivekitClient.TrackSource.ScreenShare
        });

        call.screen = t;

        var btn2 = $('toggleScreen');
        if (btn2) btn2.textContent = '▢⏹';

        t.onended = function() { toggleScreen(); };
    } catch (e) {
        if (e.name !== 'NotAllowedError') {
            toast('❌ No se pudo compartir pantalla', 'error');
        }
    }
}

console.log('[Mensajes] ✅ Llamadas cargado');