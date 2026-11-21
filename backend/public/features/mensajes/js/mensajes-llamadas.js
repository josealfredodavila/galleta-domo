// ================================================================
// MENSAJES · LLAMADAS v2.0 · MÓDULO 7 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-llamadas.js
// Depende de: mensajes-core.js, mensajes-chats.js
// Cambios v2.0: sin emojis; iconos SVG planos en los controles de
//               llamada; mensajes de estado en texto limpio.
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

const ICO_LLAM = {
    mic: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    micOff: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9v2a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M19 11a7 7 0 0 1-.11 1.23M5 11a7 7 0 0 0 11.42 5.42M12 18v3M3 3l18 18"/></svg>',
    cam: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/></svg>',
    camOff: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 10l6-3v10l-6-3"/><path d="M2 6h9M2 18h9M11 6v12M3 3l18 18"/></svg>',
    pantalla: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    colgar: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>'
};

function ctrlHTML(icono, etiqueta) {
    return `<span class="ctrl-icon">${icono}</span><span class="ctrl-label">${etiqueta}</span>`;
}

function lkSource(nombre) {
    const LK = window.LivekitClient || {};
    const fuentes = (LK.Track && LK.Track.Source) || LK.TrackSource || {};
    const respaldo = { Microphone: 'microphone', Camera: 'camera', ScreenShare: 'screen_share' };
    return fuentes[nombre] || respaldo[nombre];
}

function textoErrorLlamada(err) {
    const code = err && (err.code || err.message);
    return MENSAJES_LLAMADA[code] || `No se pudo completar la acción (${code || 'desconocido'}).`;
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

function mostrarLlamando(nombre) {
    $('callInfo').innerHTML = `<strong>Llamando a ${esc(nombre)}…</strong><br><small class="call-sub">Esperando respuesta</small>`;
}

function mostrarEnCurso() {
    $('callInfo').innerHTML = '<strong>Llamada en curso</strong><br><small class="call-sub">Usa el botón de colgar para terminar</small>';
}

function crearRoom() {
    const LK = window.LivekitClient;
    if (!LK || !LK.Room || !LK.RoomEvent) throw new Error('LiveKit no está cargado correctamente');
    const room = new LK.Room();
    room.on(LK.RoomEvent.TrackSubscribed, track => {
        if (track.kind === 'video') track.attach($('remoteVideo'));
        else if (track.kind === 'audio') {
            const el = track.attach();
            el.dataset.lk = '1';
            el.style.display = 'none';
            document.body.appendChild(el);
            el.play?.().catch(() => {});
        }
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
        call.room = room;
        call.tipo = tipo;
        call.active = true;
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
            $('callInfo').textContent = 'Conectando…';
            try {
                const t = await llamadaFetch(`/api/llamadas/${encodeURIComponent(llamadaId)}/token`, {});
                await conectarYPublicar(t.url, t.token, call.tipo);
                mostrarEnCurso();
            } catch (e) {
                console.error('[Llamadas] Error conectando al que llama:', e);
                toast(textoErrorLlamada(e), 'error');
                await terminarLlamadaServidor(llamadaId);
                await finalizarLlamadaLocal();
            }
        } else if (['ended', 'rejected', 'missed'].includes(estado)) {
            toast(estado === 'rejected' ? 'La llamada fue rechazada.' : 'La llamada terminó.', '');
            await finalizarLlamadaLocal();
        }
    }).subscribe();
}

function iniciarTimeoutLlamada() {
    clearTimeout(llamadaTimeoutTimer);
    llamadaTimeoutTimer = setTimeout(async () => {
        if (!call.initiator || call.active || !call.id) return;
        const id = call.id;
        toast('Sin respuesta.', 'warning');
        await terminarLlamadaServidor(id);
        await finalizarLlamadaLocal();
    }, LLAMADA_TIMEOUT_MS);
}

async function startCall(tipo = 'video') {
    if (current?.bot) { toast('Marquinhos no acepta llamadas.', 'warning'); return; }
    if (!current) { toast('Selecciona una conversación primero.', 'error'); return; }
    if (call.active || call.id) { $('callOverlay').classList.add('show'); return; }
    if (!window.__livekitReady) { toast('Las llamadas no están disponibles en este dispositivo. Recarga la página.', 'error'); return; }
    const nombre = current.profile?.nombre || 'usuario';
    try {
        const d = await llamadaFetch('/api/llamadas/iniciar', { destinatarioId: current.id, tipo });
        call.id = d.llamadaId;
        call.roomName = d.roomName;
        call.tipo = tipo;
        call.initiator = true;
        subscribeCall(call.id);
        $('callOverlay').classList.add('show');
        mostrarLlamando(nombre);
        toast(`Llamando a ${nombre}…`, 'success');
        iniciarTimeoutLlamada();
    } catch (e) {
        console.error('[Llamadas] Error al iniciar:', e);
        toast('No se pudo iniciar la llamada: ' + textoErrorLlamada(e), 'error');
        await finalizarLlamadaLocal();
    }
}

function parsearFechaSupabase(iso) {
    if (!iso) return null;
    if (iso instanceof Date) return iso;
    const s = String(iso);
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return new Date(s + 'Z');
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
    const inicial = esc((p.nombre || 'U').charAt(0).toUpperCase());
    const contenidoAvatar = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : inicial;
    $('incomingAvatar').innerHTML = contenidoAvatar;
    const halo = $('incomingHalo');
    if (halo) halo.innerHTML = contenidoAvatar;
    $('incomingOverlay').classList.add('show');
    toast((p.nombre || 'Alguien') + ' te está llamando…', 'success');
    ringChannel = db.channel('ring-' + id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'llamadas', filter: 'id=eq.' + id }, p2 => {
        if (incomingId === id && p2.new?.estado !== 'ringing') {
            cerrarOverlayEntrante();
            toast('La llamada ya no está disponible.', 'warning');
        }
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
        toast('Las llamadas no están disponibles en este dispositivo. No se puede aceptar.', 'error');
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
        call.id = d.llamadaId || id;
        call.roomName = d.roomName;
        call.tipo = d.tipo || 'video';
        call.initiator = false;
        subscribeCall(call.id);
        $('callOverlay').classList.add('show');
        $('callInfo').textContent = 'Conectando…';
        await conectarYPublicar(d.url, d.token, call.tipo);
        mostrarEnCurso();
    } catch (e) {
        console.error('[Llamadas] Error al aceptar:', e);
        toast(textoErrorLlamada(e), 'error');
        cerrarOverlayEntrante();
        await terminarLlamadaServidor(id);
        await finalizarLlamadaLocal();
    } finally { llamadaAceptando = false; }
}

async function rejectCall() {
    const id = incomingId;
    cerrarOverlayEntrante();
    if (id) await terminarLlamadaServidor(id, { motivo: 'rechazada' });
    toast('Llamada rechazada.', 'warning');
}

async function hangup() {
    const id = call.id;
    await terminarLlamadaServidor(id);
    toast('Llamada finalizada.', 'warning');
    await finalizarLlamadaLocal();
}

async function finalizarLlamadaLocal() {
    clearTimeout(llamadaTimeoutTimer);
    llamadaTimeoutTimer = null;
    const room = call.room;
    call.room = null;
    call.active = false;
    try { room?.disconnect(); } catch (e) {}
    try { call.audio?.stop(); call.video?.stop(); call.screen?.stop(); } catch (e) {}
    $('localVideo').srcObject = null;
    $('remoteVideo').srcObject = null;
    document.querySelectorAll('audio[data-lk="1"]').forEach(el => el.remove());
    if (callChannel) { db.removeChannel(callChannel); callChannel = null; }
    Object.assign(call, { room: null, id: null, active: false, audio: null, video: null, screen: null, roomName: null, initiator: false });
    llamadaConectando = false;
    $('callOverlay').classList.remove('show');
    $('toggleMic').innerHTML = ctrlHTML(ICO_LLAM.mic, 'Micrófono');
    $('toggleCam').innerHTML = ctrlHTML(ICO_LLAM.cam, 'Cámara');
    $('toggleScreen').innerHTML = ctrlHTML(ICO_LLAM.pantalla, 'Pantalla');
}

async function cleanupCall() { await finalizarLlamadaLocal(); }

async function toggleMic() {
    if (!call.audio) return;
    call.audio.enabled = !call.audio.enabled;
    $('toggleMic').innerHTML = call.audio.enabled
        ? ctrlHTML(ICO_LLAM.mic, 'Micrófono')
        : ctrlHTML(ICO_LLAM.micOff, 'Silenciado');
}

async function toggleCam() {
    if (!call.video) return;
    call.video.enabled = !call.video.enabled;
    $('toggleCam').innerHTML = call.video.enabled
        ? ctrlHTML(ICO_LLAM.cam, 'Cámara')
        : ctrlHTML(ICO_LLAM.camOff, 'Sin cámara');
}

async function toggleScreen() {
    if (!call.room) return;
    try {
        if (call.screen) {
            await call.room.localParticipant.unpublishTrack(call.screen);
            call.screen.stop();
            call.screen = null;
            $('toggleScreen').innerHTML = ctrlHTML(ICO_LLAM.pantalla, 'Pantalla');
            return;
        }
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const t = s.getVideoTracks()[0];
        await call.room.localParticipant.publishTrack(t, { name: 'screen', source: lkSource('ScreenShare') });
        call.screen = t;
        $('toggleScreen').innerHTML = ctrlHTML(ICO_LLAM.colgar, 'Detener');
        t.onended = () => toggleScreen();
    } catch (e) {
        if (e.name !== 'NotAllowedError') toast('No se pudo compartir la pantalla.', 'error');
    }
}

function enlazarBotonesLlamada() {
    const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    bind('videoCall', () => startCall('video'));
    bind('audioCall', () => startCall('audio'));
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