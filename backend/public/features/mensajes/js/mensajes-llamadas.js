// ================================================================
// MENSAJES · LLAMADAS v1.0 · MÓDULO 7 DE 8
// Ruta: backend/public/features/mensajes/js/mensajes-llamadas.js
// Depende de: mensajes-core.js (db, user, $, toast, esc, session,
//             profile, current, __livekitReady, NeonModal)
//             mensajes-chats.js (cerrarConversacion, recargarBandeja)
// Contenido: llamadas salientes y entrantes con LiveKit, timeout de
//            llamada sin respuesta, reconexión, controles de micrófono,
//            cámara y pantalla, colgar, rechazar, notificación push
//            (accept/reject desde service worker) y finalización local.
// NO cargar todavía en mensajes.html.
// ================================================================

'use strict';

const LLAMADA_TIMEOUT_MS = 45000;
const LLAMADA_VIGENCIA_MS = 60000;

const call = {
    room: null, id: null, active: false, audio: null, video: null,
    screen: null, initiator: false, roomName: null, tipo: 'video'
};

let llamadaTimeoutTimer = null;
let ringTimer = null;
let ringChannel = null;
let llamadaConectando = false;
let llamadaAceptando = false;

const RECONEXION_MAX_INTENTOS = 2;
const RECONEXION_ESPERA_MS = 3000;
let reconectandoLlamada = false;

const MENSAJES_LLAMADA = {
    llamada_no_disponible: 'La llamada ya no está disponible.',
    servidor: 'Error del servidor. Intenta de nuevo.',
    no_autenticado: 'Tu sesión expiró. Vuelve a iniciar sesión.',
    llamada_no_permitida: 'No puedes llamar a este usuario.'
};

function lkSource(nombre) {
    const LK = window.LivekitClient || {};
    const fuentes = (LK.Track && LK.Track.Source) || LK.TrackSource || {};
    const respaldo = { Microphone: 'microphone', Camera: 'camera', ScreenShare: 'screen_share' };
    return fuentes[nombre] || respaldo[nombre];
}

function textoErrorLlamada(err) {
    const code = err && (err.code || err.message);
    return MENSAJES_LLAMADA[code] || `No se pudo completar la acción (${code || 'desconocido'})`;
}

async function llamadaFetch(path, body = {}) {
    const s = await session();
    if (!s) { const e = new Error('no_autenticado'); e.code = 'no_autenticado'; throw e; }
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success !== true) { const code = d.error || ('http_' + r.status); const err = new Error(code); err.code = code; throw err; }
    return d.data || {};
}

async function terminarLlamadaServidor(id, body = {}) {
    if (!id) return;
    try { await llamadaFetch(`/api/llamadas/${encodeURIComponent(id)}/terminar`, body); }
    catch (e) { console.warn('[Llamadas] terminar:', e.code || e.message); }
}

function mostrarLlamando(nombre) { $('callInfo').innerHTML = `📞 <strong>Llamando a ${esc(nombre)}…</strong><br><small style="opacity:.7">Esperando respuesta</small>`; }
function mostrarEnCurso() { $('callInfo').innerHTML = '🟢 <strong>Llamada en curso</strong><br><small style="opacity:.7">Presiona ✕ para colgar</small>'; }

function crearRoom() {
    const LK = window.LivekitClient;
    if (!LK || !LK.Room || !LK.RoomEvent) throw new Error('LiveKit no está cargado correctamente');
    const room = new LK.Room();
    room.on(LK.RoomEvent.TrackSubscribed, track => {
        if (track.kind === 'video') track.attach($('remoteVideo'));
        else if (track.kind === 'audio') { const el = track.attach(); el.dataset.lk = '1'; el.style.display = 'none'; document.body.appendChild(el); el.play?.().catch(() => {}); }
    });
    room.on(LK.RoomEvent.Disconnected, reason => manejarDesconexionLlamada(room, reason));
    return room;
}

async function manejarDesconexionLlamada(room, reason) {
    if (!call.active || room !== call.room) return;
    const LK = window.LivekitClient;
    const id = call.id;
    const motivo = String(reason ?? 'desconocida');
    console.warn('[Llamadas] Desconectado de LiveKit. Motivo:', reason);
    if (LK.DisconnectReason && reason === LK.DisconnectReason.CLIENT_INITIATED) {
        finalizarLlamadaLocal();
        terminarLlamadaServidor(id, { motivo: 'colgada' });
        return;
    }
    if (reconectandoLlamada) return;
    reconectandoLlamada = true;
    try {
        for (let intento = 1; intento <= RECONEXION_MAX_INTENTOS; intento++) {
            await new Promise(resolve => setTimeout(resolve, RECONEXION_ESPERA_MS));
            if (!call.active || call.id !== id) return;
            try {
                const t = await llamadaFetch(`/api/llamadas/${encodeURIComponent(id)}/token`, {});
                try { call.audio?.stop(); call.video?.stop(); } catch (e) {}
                call.active = false;
                await conectarYPublicar(t.url, t.token, call.tipo);
                console.info('[Llamadas] Reconectado a la sala en el intento', intento);
                return;
            } catch (err) {
                console.warn(`[Llamadas] Reconexión ${intento} fallida:`, err.code || err.message);
                call.active = true;
            }
        }
        finalizarLlamadaLocal();
        terminarLlamadaServidor(id, { motivo: 'desconexion_' + motivo });
    } finally {
        reconectandoLlamada = false;
    }
}

async function conectarYPublicar(url, token, tipo) {
    if (llamadaConectando) return;
    llamadaConectando = true;
    const room = crearRoom();
    let stream = null;
    try {
        await room.connect(url, token);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: tipo === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false });
        const at = stream.getAudioTracks()[0];
        const vt = stream.getVideoTracks()[0];
        if (at) { await room.localParticipant.publishTrack(at, { name: 'microphone', source: lkSource('Microphone') }); call.audio = at; }
        if (vt) { await room.localParticipant.publishTrack(vt, { name: 'camera', source: lkSource('Camera') }); call.video = vt; $('localVideo').srcObject = new MediaStream([vt]); }
        call.room = room; call.tipo = tipo; call.active = true;
    } catch (e) {
        if (stream) stream.getTracks().forEach(t => t.stop());
        try { room.disconnect(); } catch (_) {}
        throw e;
    } finally { llamadaConectando = false; }
}

function subscribeCall(llamadaId) {
    if (callChannel) { db.removeChannel(callChannel); callChannel = null; }
    callChannel = db.channel('call-' + llamadaId).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'llamadas', filter: 'id=eq.' + llamadaId }, async p => {
        if (call.id !== llamadaId) return;
        const estado = p.new?.estado;
        if (estado === 'active') {
            if (!call.initiator || call.active || llamadaConectando) return;
            clearTimeout(llamadaTimeoutTimer);
            $('callInfo').innerHTML = 'Conectando…';
            try {
                const t = await llamadaFetch(`/api/llamadas/${encodeURIComponent(llamadaId)}/token`, {});
                await conectarYPublicar(t.url, t.token, call.tipo);
                mostrarEnCurso();
            } catch (e) {
                console.error('[Llamadas] Error conectando al que llama:', e);
                toast('❌ ' + textoErrorLlamada(e), 'error');
                await terminarLlamadaServidor(llamadaId);
                await finalizarLlamadaLocal();
            }
        } else if (['ended', 'rejected', 'missed'].includes(estado)) {
            toast(estado === 'rejected' ? '📵 La llamada fue rechazada' : '📞 La llamada terminó', '');
            await finalizarLlamadaLocal();
        }
    }).subscribe();
}

function iniciarTimeoutLlamada() {
    clearTimeout(llamadaTimeoutTimer);
    llamadaTimeoutTimer = setTimeout(async () => {
        if (!call.initiator || call.active || !call.id) return;
        const id = call.id;
        toast('📵 Sin respuesta', 'warning');
        await terminarLlamadaServidor(id);
        await finalizarLlamadaLocal();
    }, LLAMADA_TIMEOUT_MS);
}

async function startCall(tipo = 'video') {
    if (current?.bot) { toast('⚠️ Marquinhos no acepta llamadas', 'warning'); return; }
    if (!current) { toast('⚠️ Selecciona una conversación primero', 'error'); return; }
    if (call.active || call.id) { $('callOverlay').classList.add('show'); return; }
    if (!window.__livekitReady) { toast('❌ Las llamadas no están disponibles en este dispositivo. Recarga la página.', 'error'); return; }
    const nombre = current.profile?.nombre || 'usuario';
    try {
        const d = await llamadaFetch('/api/llamadas/iniciar', { destinatarioId: current.id, tipo });
        call.id = d.llamadaId; call.roomName = d.roomName; call.tipo = tipo; call.initiator = true;
        subscribeCall(call.id);
        $('callOverlay').classList.add('show');
        mostrarLlamando(nombre);
        toast(`📞 Llamando a ${nombre}…`, 'success');
        iniciarTimeoutLlamada();
    } catch (e) {
        console.error('[Llamadas] Error al iniciar:', e);
        toast('❌ No se pudo iniciar la llamada: ' + textoErrorLlamada(e), 'error');
        await finalizarLlamadaLocal();
    }
}

function parsearFechaSupabase(iso) {
    if (!iso) return null;
    if (iso instanceof Date) return iso;
    const s = String(iso);
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
        return new Date(s + 'Z');
    }
    return new Date(s);
}

function cerrarOverlayEntrante() {
    clearTimeout(ringTimer);
    ringTimer = null;
    if (ringChannel) { db.removeChannel(ringChannel); ringChannel = null; }
    incomingId = null;
    $('incomingOverlay').classList.remove('show');
}

async function incoming(data) {
    if (!user || !data || data.creador_id === user.id) return;
    if (data.estado && data.estado !== 'ringing') return;
    const fecha = parsearFechaSupabase(data.created_at);
    if (fecha) {
        const edad = Date.now() - fecha.getTime();
        if (edad > LLAMADA_VIGENCIA_MS) return;
    }
    if (call.active || call.id || incomingId) {
        if (incomingId !== data.id && !call.id) await terminarLlamadaServidor(data.id, { motivo: 'ocupado' });
        return;
    }
    incomingId = data.id;
    const id = data.id;
    const p = await profile(data.creador_id);
    $('incomingName').textContent = p.nombre || 'Usuario';
    $('incomingAvatar').innerHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.nombre || '◈').charAt(0).toUpperCase());
    const halo = $('incomingHalo');
    if (halo) { halo.innerHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.nombre || '◈').charAt(0).toUpperCase()); }
    $('incomingOverlay').classList.add('show');
    toast('🔔 ' + (p.nombre || 'Alguien') + ' te está llamando…', 'success');
    ringChannel = db.channel('ring-' + id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'llamadas', filter: 'id=eq.' + id }, p2 => {
        if (incomingId === id && p2.new?.estado !== 'ringing') { cerrarOverlayEntrante(); toast('📞 La llamada ya no está disponible', 'warning'); }
    }).subscribe();
    ringTimer = setTimeout(async () => {
        if (incomingId !== id) return;
        cerrarOverlayEntrante();
        await terminarLlamadaServidor(id);
    }, LLAMADA_TIMEOUT_MS);
}

async function acceptCall() {
    if (!incomingId || llamadaAceptando) return;
    if (!window.__livekitReady) {
        toast('❌ Las llamadas no están disponibles en este dispositivo. No se puede aceptar.', 'error');
        const id = incomingId;
        cerrarOverlayEntrante();
        if (id) await terminarLlamadaServidor(id, { motivo: 'fallida' });
        return;
    }
    llamadaAceptando = true;
    const id = incomingId;
    try {
        const d = await llamadaFetch(`/api/llamadas/${encodeURIComponent(id)}/aceptar`, {});
        cerrarOverlayEntrante();
        call.id = d.llamadaId || id; call.roomName = d.roomName; call.tipo = d.tipo || 'video'; call.initiator = false;
        subscribeCall(call.id);
        $('callOverlay').classList.add('show');
        $('callInfo').innerHTML = 'Conectando…';
        await conectarYPublicar(d.url, d.token, call.tipo);
        mostrarEnCurso();
    } catch (e) {
        console.error('[Llamadas] Error al aceptar:', e);
        toast('❌ ' + textoErrorLlamada(e), 'error');
        cerrarOverlayEntrante();
        await terminarLlamadaServidor(id);
        await finalizarLlamadaLocal();
    } finally { llamadaAceptando = false; }
}

async function rejectCall() {
    const id = incomingId;
    cerrarOverlayEntrante();
    if (id) await terminarLlamadaServidor(id, { motivo: 'rechazada' });
    toast('📵 Llamada rechazada', 'warning');
}

async function hangup() {
    const id = call.id;
    await terminarLlamadaServidor(id);
    toast('📞 Llamada finalizada', 'warning');
    await finalizarLlamadaLocal();
}

async function finalizarLlamadaLocal() {
    clearTimeout(llamadaTimeoutTimer);
    llamadaTimeoutTimer = null;
    const room = call.room;
    call.room = null; call.active = false;
    try { room?.disconnect(); } catch (e) {}
    try { call.audio?.stop(); call.video?.stop(); call.screen?.stop(); } catch (e) {}
    $('localVideo').srcObject = null; $('remoteVideo').srcObject = null;
    document.querySelectorAll('audio[data-lk="1"]').forEach(el => el.remove());
    if (callChannel) { db.removeChannel(callChannel); callChannel = null; }
    Object.assign(call, { room: null, id: null, active: false, audio: null, video: null, screen: null, roomName: null, initiator: false });
    llamadaConectando = false;
    $('callOverlay').classList.remove('show');
    $('toggleMic').innerHTML = '<span class="ctrl-icon">🎤</span><span class="ctrl-label">Micrófono</span>';
    $('toggleCam').innerHTML = '<span class="ctrl-icon">📷</span><span class="ctrl-label">Cámara</span>';
    $('toggleScreen').innerHTML = '<span class="ctrl-icon">🖥️</span><span class="ctrl-label">Pantalla</span>';
}

async function cleanupCall() { await finalizarLlamadaLocal(); }

async function toggleMic() {
    if (!call.audio) return;
    call.audio.enabled = !call.audio.enabled;
    $('toggleMic').innerHTML = call.audio.enabled ? '<span class="ctrl-icon">🎤</span><span class="ctrl-label">Micrófono</span>' : '<span class="ctrl-icon">🔇</span><span class="ctrl-label">Silenciado</span>';
}

async function toggleCam() {
    if (!call.video) return;
    call.video.enabled = !call.video.enabled;
    $('toggleCam').innerHTML = call.video.enabled ? '<span class="ctrl-icon">📷</span><span class="ctrl-label">Cámara</span>' : '<span class="ctrl-icon">📷❌</span><span class="ctrl-label">Sin cámara</span>';
}

async function toggleScreen() {
    if (!call.room) return;
    try {
        if (call.screen) {
            await call.room.localParticipant.unpublishTrack(call.screen);
            call.screen.stop();
            call.screen = null;
            $('toggleScreen').innerHTML = '<span class="ctrl-icon">🖥️</span><span class="ctrl-label">Pantalla</span>';
            return;
        }
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const t = s.getVideoTracks()[0];
        await call.room.localParticipant.publishTrack(t, { name: 'screen', source: lkSource('ScreenShare') });
        call.screen = t;
        $('toggleScreen').innerHTML = '<span class="ctrl-icon">🖥️⏹️</span><span class="ctrl-label">Detener</span>';
        t.onended = () => toggleScreen();
    } catch (e) { if (e.name !== 'NotAllowedError') toast('❌ No se pudo compartir pantalla', 'error'); }
}

function enlazarBotonesLlamada() {
    const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    bind('videoCall', () => startCall('video'));
    bind('hangup', hangup);
    bind('toggleMic', toggleMic);
    bind('toggleCam', toggleCam);
    bind('toggleScreen', toggleScreen);
    bind('acceptCall', acceptCall);
    bind('rejectCall', rejectCall);
}

// Expuesto para llamadas-ui.js y para el service worker
window.startCall = startCall;
window.acceptCall = acceptCall;
window.endCall = finalizarLlamadaLocal;
window.cancelCall = finalizarLlamadaLocal;
window.incoming = incoming;
window.enlazarBotonesLlamada = enlazarBotonesLlamada;