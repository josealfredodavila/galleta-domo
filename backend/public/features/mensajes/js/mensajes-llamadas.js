// ================================================================
// MENSAJES · LLAMADAS (LiveKit)
// ================================================================
// Videollamadas y llamadas entrantes con LiveKit.
// Se carga DESPUÉS de config, utils, auth, conversaciones, chat.
//
// FUENTE DE VERDAD: monolítico mensajes.html original.
// COMPATIBLE CON: tablas llamadas, llamadas_participantes.
// API BACKEND: POST /api/livekit/token
// ================================================================

'use strict';

// ================================================================
// TOKEN DE LIVEKIT
// ================================================================
async function token(roomName, participantName) {
    var s = await session();
    if (!s) throw new Error('No autenticado');
    if (!s.access_token) throw new Error('Sesión sin token');

    var r = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + s.access_token
        },
        body: JSON.stringify({
            roomName: roomName,
            participantName: participantName
        })
    });

    var d = await r.json().catch(function() { return {}; });
    if (!r.ok) throw new Error(d.error || 'No se pudo obtener token LiveKit');
    return d;
}

// ================================================================
// INICIAR LLAMADA (outgoing)
// ================================================================
async function startCall() {
    if (current && current.bot) {
        toast('⚠️ ' + BOT_NOMBRE + ' no acepta llamadas', 'warning');
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

        // Snapshot
        var chatIdAlInicio = current.id;
        var destinatarioId = chatIdAlInicio;

        var id = (crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : ('call-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));

        var roomName = 'call_' + id;

        // ---- Insert llamada ----
        var ins = await db.from('llamadas').insert({
            id: id,
            creador_id: user.id,
            destinatario_id: destinatarioId,
            tipo: 'video',
            estado: 'ringing',
            room_name: roomName,
            conversation_id: chatIdAlInicio
        });

        if (ins.error) {
            console.error('[Mensajes/Llamadas] Error INSERT llamada:', ins.error);
            throw ins.error;
        }

        // ---- Insert participante ----
        var pi = await db.from('llamadas_participantes').insert({
            llamada_id: id,
            usuario_id: user.id,
            rol: 'creador',
            estado: 'conectado',
            entro_at: new Date().toISOString()
        });

        if (pi.error) {
            console.error('[Mensajes/Llamadas] Error INSERT participante:', pi.error);
            throw pi.error;
        }

        call.id = id;
        call.initiator = true;

        // ---- Conectar ----
        await connectCall(roomName, user.id);
        subscribeCall(id);

        var overlay = $('callOverlay');
        if (overlay) overlay.classList.add('show');

        var info = $('callInfo');
        if (info) {
            info.textContent = '📞 Llamando a ' + ((current && current.profile && current.profile.nombre) || 'usuario') + '…';
        }
    } catch (e) {
        console.error('[Mensajes/Llamadas] Error iniciando:', e);
        toast('❌ ' + (e.message || 'Error al iniciar llamada'), 'error');
        await cleanupCall();
    }
}

// ================================================================
// CONECTAR A LIVEKIT
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

    // Token expirado / error
    room.on(LivekitClient.RoomEvent.ConnectionStateChanged, function(state) {
        if (window.DEBUG_CHAT) console.log('[Mensajes/Llamadas] State:', state);
    });

    await room.connect(td.url || (LIVEKIT_CONFIG && LIVEKIT_CONFIG.url), td.token);

    // ---- Publicar cámara y micrófono ----
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
// SUSCRIPCIÓN A CAMBIOS DE LA LLAMADA (UPDATE en tabla)
// ================================================================
function subscribeCall(id) {
    if (callChannel && db) {
        try { db.removeChannel(callChannel); } catch (e) {}
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
            var estado = p.new && p.new.estado;
            if (estado === 'ended' || estado === 'rejected' || estado === 'missed') {
                toast('📞 La llamada terminó');
                cleanupCall();
            }
        })
        .subscribe();
}

// ================================================================
// LLAMADA ENTRANTE
// ================================================================
async function incoming(data) {
    if (!data || !data.id) return;

    // Si ya estoy en llamada → rechazar
    if (call.active) {
        try {
            await db.from('llamadas').update({
                estado: 'rejected',
                finalizada_at: new Date().toISOString()
            }).eq('id', data.id);
        } catch (e) {}
        return;
    }

    // Si yo la inicié → ignorar
    if (data.creador_id === user.id) return;

    incomingId = data.id;

    var p = await profile(data.creador_id);

    var incomingName = $('incomingName');
    if (incomingName) incomingName.textContent = p.nombre || 'Usuario';

    var incomingAvatar = $('incomingAvatar');
    if (incomingAvatar) {
        incomingAvatar.innerHTML = (p.avatar_url && urlSegura(p.avatar_url))
            ? '<img src="' + esc(p.avatar_url) + '" alt="">'
            : esc((p.nombre || '◈').charAt(0).toUpperCase());
    }

    var overlay = $('incomingOverlay');
    if (overlay) overlay.classList.add('show');

    // Auto-rechazar si el usuario no responde en 30 s
    setTimeout(function() {
        if (incomingId === data.id) {
            var ov = $('incomingOverlay');
            if (ov && ov.classList.contains('show')) {
                rejectCall();
            }
        }
    }, 30000);
}

// ================================================================
// ACEPTAR LLAMADA
// ================================================================
async function acceptCall() {
    if (!incomingId) return;

    var incomingIdLocal = incomingId;

    try {
        var r = await db
            .from('llamadas')
            .select('room_name,creador_id')
            .eq('id', incomingIdLocal)
            .single();

        if (r.error) throw r.error;

        // ---- Update estado ----
        await db.from('llamadas').update({
            estado: 'active',
            contestada_at: new Date().toISOString()
        }).eq('id', incomingIdLocal);

        // ---- Insert participante ----
        await db.from('llamadas_participantes').insert({
            llamada_id: incomingIdLocal,
            usuario_id: user.id,
            rol: 'invitado',
            estado: 'conectado',
            entro_at: new Date().toISOString()
        });

        call.id = incomingIdLocal;
        call.initiator = false;

        var incomingOverlay = $('incomingOverlay');
        if (incomingOverlay) incomingOverlay.classList.remove('show');

        await connectCall(r.data.room_name, user.id);
        subscribeCall(incomingIdLocal);

        var overlay = $('callOverlay');
        if (overlay) overlay.classList.add('show');

        incomingId = null;
    } catch (e) {
        console.error('[Mensajes/Llamadas] Error aceptando:', e);
        toast('❌ ' + (e.message || 'Error al aceptar llamada'), 'error');
        await cleanupCall();
        incomingId = null;
    }
}

// ================================================================
// RECHAZAR LLAMADA
// ================================================================
async function rejectCall() {
    var incomingIdLocal = incomingId;

    if (incomingIdLocal) {
        try {
            await db.from('llamadas').update({
                estado: 'rejected',
                finalizada_at: new Date().toISOString()
            }).eq('id', incomingIdLocal);
        } catch (e) {}
    }

    incomingId = null;

    var overlay = $('incomingOverlay');
    if (overlay) overlay.classList.remove('show');
}

// ================================================================
// COLGAR
// ================================================================
async function hangup() {
    if (call.id) {
        try {
            await db.from('llamadas').update({
                estado: 'ended',
                finalizada_at: new Date().toISOString()
            }).eq('id', call.id);
        } catch (e) {}
    }
    await cleanupCall();
}

// ================================================================
// LIMPIAR LLAMADA
// ================================================================
async function cleanupCall() {
    try {
        if (call.room) {
            try { await call.room.disconnect(); } catch (e) {}
        }
        if (call.audio) {
            try { call.audio.stop(); } catch (e) {}
        }
        if (call.video) {
            try { call.video.stop(); } catch (e) {}
        }
        if (call.screen) {
            try { call.screen.stop(); } catch (e) {}
        }

        var lv = $('localVideo');
        if (lv) lv.srcObject = null;

        var rv = $('remoteVideo');
        if (rv) rv.srcObject = null;

        if (callChannel && db) {
            try { db.removeChannel(callChannel); } catch (e) {}
            callChannel = null;
        }
    } catch (e) {}

    // Reset estado
    call.room = null;
    call.id = null;
    call.active = false;
    call.audio = null;
    call.video = null;
    call.screen = null;
    call.initiator = false;

    var overlay = $('callOverlay');
    if (overlay) overlay.classList.remove('show');

    var tm = $('toggleMic');
    if (tm) tm.textContent = '🎤';

    var tc = $('toggleCam');
    if (tc) tc.textContent = '📷';

    var ts = $('toggleScreen');
    if (ts) ts.textContent = '🖥️';
}

// ================================================================
// TOGGLE MICRÓFONO
// ================================================================
async function toggleMic() {
    if (!call.audio) return;
    call.audio.enabled = !call.audio.enabled;

    var btn = $('toggleMic');
    if (btn) btn.textContent = call.audio.enabled ? '🎤' : '🔇';
}

// ================================================================
// TOGGLE CÁMARA
// ================================================================
async function toggleCam() {
    if (!call.video) return;
    call.video.enabled = !call.video.enabled;

    var btn = $('toggleCam');
    if (btn) btn.textContent = call.video.enabled ? '📷' : '📷❌';
}

// ================================================================
// COMPARTIR PANTALLA
// ================================================================
async function toggleScreen() {
    if (!call.room) return;

    try {
        // Si ya está compartiendo → detener
        if (call.screen) {
            try {
                await call.room.localParticipant.unpublishTrack(call.screen);
            } catch (e) {}
            try { call.screen.stop(); } catch (e) {}
            call.screen = null;

            var btn = $('toggleScreen');
            if (btn) btn.textContent = '🖥️';
            return;
        }

        // Iniciar share
        var s = await navigator.mediaDevices.getDisplayMedia({ video: true });
        var t = s.getVideoTracks()[0];

        await call.room.localParticipant.publishTrack(t, {
            name: 'screen',
            source: LivekitClient.TrackSource.ScreenShare
        });

        call.screen = t;

        var btn2 = $('toggleScreen');
        if (btn2) btn2.textContent = '🖥️⏹️';

        // Detener cuando el usuario para el share desde el navegador
        t.onended = function() {
            if (call.screen === t) toggleScreen();
        };
    } catch (e) {
        if (e.name !== 'NotAllowedError') {
            console.error('[Mensajes/Llamadas] Error screen:', e);
            toast('❌ No se pudo compartir pantalla', 'error');
        }
    }
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.token = token;
window.startCall = startCall;
window.connectCall = connectCall;
window.subscribeCall = subscribeCall;
window.incoming = incoming;
window.acceptCall = acceptCall;
window.rejectCall = rejectCall;
window.hangup = hangup;
window.cleanupCall = cleanupCall;
window.toggleMic = toggleMic;
window.toggleCam = toggleCam;
window.toggleScreen = toggleScreen;

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Llamadas] ✅ Llamadas cargado');
}