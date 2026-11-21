// ================================================================
// MENSAJES · LLAMADAS v2.1 · MÓDULO 7 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-llamadas.js
//
// ACTUALIZACIÓN v2.1:
// - Compartir pantalla.
// - Enviar mensaje durante una llamada.
// - Cancelación de ruido configurable.
// - Añadir participantes a una llamada.
// - Integración con LiveKit.
// - Conserva Supabase, autenticación y endpoints existentes.
// - No modifica colores, fuentes ni estilos globales.
// ================================================================

'use strict';

const LLAMADA_TIMEOUT_MS = 45000;
const LLAMADA_VIGENCIA_MS = 60000;

const call = {
    room: null,
    id: null,
    active: false,
    audio: null,
    video: null,
    screen: null,
    initiator: false,
    roomName: null,
    tipo: 'video',
    noiseCancellation: true
};

let llamadaTimeoutTimer = null;
let ringTimer = null;
let ringChannel = null;
let llamadaConectando = false;
let llamadaAceptando = false;

const RECONEXION_MAX_INTENTOS = 2;
const RECONEXION_ESPERA_MS = 3000;

let reconectandoLlamada = false;
let controlesExtrasLlamadaInstalados = false;

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

    mensaje: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v13H8l-4 3V4z"/><path d="M8 9h8M8 13h5"/></svg>',

    participantes: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6"/></svg>',

    ruido: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 10v4M22 11v2"/></svg>',

    colgar: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>'
};

function ctrlHTML(icono, etiqueta) {
    return `<span class="ctrl-icon">${icono}</span><span class="ctrl-label">${etiqueta}</span>`;
}

function lkSource(nombre) {
    const LK = window.LivekitClient || {};
    const fuentes = (LK.Track && LK.Track.Source) || LK.TrackSource || {};

    const respaldo = {
        Microphone: 'microphone',
        Camera: 'camera',
        ScreenShare: 'screen_share'
    };

    return fuentes[nombre] || respaldo[nombre];
}

function textoErrorLlamada(err) {
    const code = err && (err.code || err.message);

    return MENSAJES_LLAMADA[code] ||
        `No se pudo completar la acción (${code || 'desconocido'}).`;
}

// ================================================================
// COMUNICACIÓN CON EL SERVIDOR
// ================================================================

async function llamadaFetch(path, body = {}) {
    const s = await session();

    if (!s) {
        const e = new Error('no_autenticado');
        e.code = 'no_autenticado';
        throw e;
    }

    const r = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + s.access_token
        },
        body: JSON.stringify(body)
    });

    const d = await r.json().catch(() => ({}));

    if (!r.ok || d.success !== true) {
        const code = d.error || ('http_' + r.status);
        const err = new Error(code);
        err.code = code;
        throw err;
    }

    return d.data || {};
}

async function terminarLlamadaServidor(id, body = {}) {
    if (!id) return;

    try {
        await llamadaFetch(
            `/api/llamadas/${encodeURIComponent(id)}/terminar`,
            body
        );
    } catch (e) {
        console.warn('[Llamadas] terminar:', e.code || e.message);
    }
}

// ================================================================
// INFORMACIÓN DE LLAMADA
// ================================================================

function mostrarLlamando(nombre) {
    $('callInfo').innerHTML =
        `<strong>Llamando a ${esc(nombre)}…</strong><br><small class="call-sub">Esperando respuesta</small>`;
}

function mostrarEnCurso() {
    $('callInfo').innerHTML =
        '<strong>Llamada en curso</strong><br><small class="call-sub">Usa el botón de colgar para terminar</small>';
}

// ================================================================
// LIVEKIT
// ================================================================

function crearRoom() {
    const LK = window.LivekitClient;

    if (!LK || !LK.Room || !LK.RoomEvent) {
        throw new Error('LiveKit no está cargado correctamente');
    }

    const room = new LK.Room();

    room.on(LK.RoomEvent.TrackSubscribed, track => {
        if (track.kind === 'video') {
            track.attach($('remoteVideo'));
        } else if (track.kind === 'audio') {
            const el = track.attach();

            el.dataset.lk = '1';
            el.style.display = 'none';

            document.body.appendChild(el);

            el.play?.().catch(() => {});
        }
    });

    room.on(
        LK.RoomEvent.Disconnected,
        reason => manejarDesconexionLlamada(room, reason)
    );

    return room;
}

async function manejarDesconexionLlamada(room, reason) {
    if (!call.active || room !== call.room) return;

    const LK = window.LivekitClient;
    const id = call.id;
    const motivo = String(reason ?? 'desconocida');

    console.warn(
        '[Llamadas] Desconectado de LiveKit. Motivo:',
        reason
    );

    if (
        LK.DisconnectReason &&
        reason === LK.DisconnectReason.CLIENT_INITIATED
    ) {
        finalizarLlamadaLocal();
        terminarLlamadaServidor(id, { motivo: 'colgada' });
        return;
    }

    if (reconectandoLlamada) return;

    reconectandoLlamada = true;

    try {
        for (
            let intento = 1;
            intento <= RECONEXION_MAX_INTENTOS;
            intento++
        ) {
            await new Promise(resolve =>
                setTimeout(resolve, RECONEXION_ESPERA_MS)
            );

            if (!call.active || call.id !== id) return;

            try {
                const t = await llamadaFetch(
                    `/api/llamadas/${encodeURIComponent(id)}/token`,
                    {}
                );

                try {
                    call.audio?.stop();
                    call.video?.stop();
                } catch (e) {}

                call.active = false;

                await conectarYPublicar(
                    t.url,
                    t.token,
                    call.tipo
                );

                console.info(
                    '[Llamadas] Reconectado a la sala en el intento',
                    intento
                );

                return;

            } catch (err) {
                console.warn(
                    `[Llamadas] Reconexión ${intento} fallida:`,
                    err.code || err.message
                );

                call.active = true;
            }
        }

        finalizarLlamadaLocal();

        terminarLlamadaServidor(id, {
            motivo: 'desconexion_' + motivo
        });

    } finally {
        reconectandoLlamada = false;
    }
}

// ================================================================
// CANCELACIÓN DE RUIDO
// ================================================================

function restriccionesAudioLlamada() {
    return {
        echoCancellation: true,
        noiseSuppression: call.noiseCancellation,
        autoGainControl: true
    };
}

async function aplicarCancelacionRuido(activar) {
    call.noiseCancellation = !!activar;

    if (!call.audio) return true;

    try {
        await call.audio.applyConstraints({
            echoCancellation: true,
            noiseSuppression: call.noiseCancellation,
            autoGainControl: true
        });

        return true;

    } catch (e) {
        console.warn(
            '[Llamadas] No se pudo modificar la cancelación de ruido:',
            e
        );

        call.noiseCancellation = !activar;

        return false;
    }
}

async function toggleNoiseCancellation() {
    const nuevoEstado = !call.noiseCancellation;

    const resultado = await aplicarCancelacionRuido(nuevoEstado);

    if (!resultado) {
        toast(
            'Este dispositivo no permite modificar la cancelación de ruido durante la llamada.',
            'warning'
        );

        actualizarControlRuido();
        return;
    }

    actualizarControlRuido();

    toast(
        nuevoEstado
            ? 'Cancelación de ruido activada.'
            : 'Cancelación de ruido desactivada.',
        'success'
    );
}

function actualizarControlRuido() {
    const btn = $('toggleNoise');

    if (!btn) return;

    btn.innerHTML = ctrlHTML(
        ICO_LLAM.ruido,
        call.noiseCancellation
            ? 'Cancelación de ruido'
            : 'Ruido desactivado'
    );

    btn.setAttribute(
        'aria-pressed',
        String(call.noiseCancellation)
    );

    btn.classList.toggle(
        'active',
        call.noiseCancellation
    );
}

// ================================================================
// CONECTAR Y PUBLICAR AUDIO / VIDEO
// ================================================================

async function conectarYPublicar(url, token, tipo) {
    if (llamadaConectando) return;

    llamadaConectando = true;

    const room = crearRoom();
    let stream = null;

    try {
        await room.connect(url, token);

        stream = await navigator.mediaDevices.getUserMedia({
            audio: restriccionesAudioLlamada(),

            video: tipo === 'video'
                ? {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
                : false
        });

        const at = stream.getAudioTracks()[0];
        const vt = stream.getVideoTracks()[0];

        if (at) {
            await room.localParticipant.publishTrack(at, {
                name: 'microphone',
                source: lkSource('Microphone')
            });

            call.audio = at;
        }

        if (vt) {
            await room.localParticipant.publishTrack(vt, {
                name: 'camera',
                source: lkSource('Camera')
            });

            call.video = vt;

            $('localVideo').srcObject = new MediaStream([vt]);
        }

        call.room = room;
        call.tipo = tipo;
        call.active = true;

        actualizarControlRuido();

        instalarControlesExtrasLlamada();

    } catch (e) {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }

        try {
            room.disconnect();
        } catch (_) {}

        throw e;

    } finally {
        llamadaConectando = false;
    }
}

// ================================================================
// COMPARTIR PANTALLA
// ================================================================

async function toggleScreen() {
    if (!call.room || !call.active) {
        toast('Primero debes estar en una llamada.', 'warning');
        return;
    }

    try {
        if (call.screen) {
            const pantalla = call.screen;

            await call.room.localParticipant.unpublishTrack(pantalla);

            pantalla.onended = null;
            pantalla.stop();

            call.screen = null;

            $('toggleScreen').innerHTML = ctrlHTML(
                ICO_LLAM.pantalla,
                'Compartir pantalla'
            );

            toast('Compartir pantalla finalizado.', 'success');

            return;
        }

        if (!navigator.mediaDevices.getDisplayMedia) {
            toast(
                'Tu navegador no permite compartir pantalla.',
                'error'
            );
            return;
        }

        const s = await navigator.mediaDevices.getDisplayMedia({
            video: {
                frameRate: { ideal: 15, max: 30 }
            },
            audio: false
        });

        const t = s.getVideoTracks()[0];

        if (!t) {
            s.getTracks().forEach(track => track.stop());
            return;
        }

        await call.room.localParticipant.publishTrack(t, {
            name: 'screen',
            source: lkSource('ScreenShare')
        });

        call.screen = t;

        $('toggleScreen').innerHTML = ctrlHTML(
            ICO_LLAM.pantalla,
            'Dejar de compartir'
        );

        t.onended = async () => {
            if (call.screen !== t) return;

            try {
                if (call.room) {
                    await call.room.localParticipant.unpublishTrack(t);
                }
            } catch (e) {}

            call.screen = null;

            $('toggleScreen').innerHTML = ctrlHTML(
                ICO_LLAM.pantalla,
                'Compartir pantalla'
            );
        };

        toast('Estás compartiendo tu pantalla.', 'success');

    } catch (e) {
        console.error('[Llamadas] Compartir pantalla:', e);

        if (e.name !== 'NotAllowedError') {
            toast(
                'No se pudo compartir la pantalla.',
                'error'
            );
        }
    }
}

// ================================================================
// ENVIAR MENSAJE DURANTE LA LLAMADA
// ================================================================

function enviarMensajeDuranteLlamada() {
    if (!call.id) {
        toast('No hay una llamada activa.', 'warning');
        return;
    }

    const detalle = {
        llamadaId: call.id,
        roomName: call.roomName,
        conversationId: current ? current.id : null,
        tipo: call.tipo
    };

    // Permite que el módulo de mensajes abra el chat
    // sin finalizar la llamada.

    window.dispatchEvent(
        new CustomEvent('csariels:llamada:enviar-mensaje', {
            detail: detalle
        })
    );

    // Compatibilidad con el compositor de mensajes existente.

    const selectores = [
        '#messageInput',
        '#chatInput',
        '#mensajeInput',
        '#msgInput',
        '[data-message-input]',
        '[contenteditable="true"]'
    ];

    let campo = null;

    for (let i = 0; i < selectores.length; i++) {
        const encontrado = document.querySelector(selectores[i]);

        if (
            encontrado &&
            encontrado.offsetParent !== null &&
            !encontrado.disabled
        ) {
            campo = encontrado;
            break;
        }
    }

    if (campo) {
        campo.focus();

        if (typeof campo.setSelectionRange === 'function') {
            try {
                const longitud = campo.value.length;
                campo.setSelectionRange(longitud, longitud);
            } catch (e) {}
        }

        return;
    }

    // El módulo de mensajes puede escuchar este evento
    // y abrir su compositor cuando el usuario lo solicite.

    if (typeof window.abrirMensajesDuranteLlamada === 'function') {
        window.abrirMensajesDuranteLlamada(detalle);
        return;
    }

    toast(
        'La llamada continúa. Abre la conversación para enviar un mensaje.',
        'info'
    );
}

// ================================================================
// AÑADIR PARTICIPANTES
// ================================================================

function anadirParticipantesLlamada() {
    if (!call.id || !call.room || !call.active) {
        toast('Primero debes estar en una llamada.', 'warning');
        return;
    }

    const detalle = {
        llamadaId: call.id,
        roomName: call.roomName,
        tipo: call.tipo,
        conversacionId: current ? current.id : null,
        participantes: call.room.remoteParticipants
            ? Array.from(
                call.room.remoteParticipants.values()
            ).map(participante => ({
                identity: participante.identity,
                name: participante.name || ''
            }))
            : []
    };

    // Integración con el selector de contactos del ecosistema.
    // El módulo de contactos puede escuchar este evento para
    // seleccionar usuarios y solicitar su incorporación.

    window.dispatchEvent(
        new CustomEvent('csariels:llamada:anadir-participantes', {
            detail: detalle
        })
    );

    // Punto de integración opcional con el selector existente.

    if (
        typeof window.abrirSelectorParticipantesLlamada === 'function'
    ) {
        window.abrirSelectorParticipantesLlamada(detalle);
        return;
    }

    toast(
        'El selector de participantes debe conectarse con el módulo de contactos.',
        'info'
    );
}

// ================================================================
// CONTROLES ADICIONALES
// ================================================================

function crearControlExtra(id, icono, etiqueta, accion) {
    const original = $('toggleScreen');

    if (!original || !original.parentNode) return null;

    const boton = original.cloneNode(true);

    boton.id = id;
    boton.removeAttribute('aria-pressed');
    boton.innerHTML = ctrlHTML(icono, etiqueta);

    boton.onclick = accion;

    boton.classList.remove('active');

    return boton;
}

function instalarControlesExtrasLlamada() {
    if (controlesExtrasLlamadaInstalados) return;

    const pantalla = $('toggleScreen');

    if (!pantalla || !pantalla.parentNode) return;

    const padre = pantalla.parentNode;

    // Compartir pantalla ya existe en la interfaz original.
    // Se agregan únicamente los controles nuevos.

    if (!$('toggleMessage')) {
        const mensaje = crearControlExtra(
            'toggleMessage',
            ICO_LLAM.mensaje,
            'Enviar mensaje',
            enviarMensajeDuranteLlamada
        );

        if (mensaje) {
            pantalla.insertAdjacentElement('afterend', mensaje);
        }
    }

    if (!$('toggleParticipants')) {
        const participantes = crearControlExtra(
            'toggleParticipants',
            ICO_LLAM.participantes,
            'Añadir participantes',
            anadirParticipantesLlamada
        );

        if (participantes) {
            padre.appendChild(participantes);
        }
    }

    if (!$('toggleNoise')) {
        const ruido = crearControlExtra(
            'toggleNoise',
            ICO_LLAM.ruido,
            'Cancelación de ruido',
            toggleNoiseCancellation
        );

        if (ruido) {
            padre.appendChild(ruido);
        }
    }

    controlesExtrasLlamadaInstalados = true;

    actualizarControlRuido();
}

// ================================================================
// SUSCRIPCIÓN A CAMBIOS DE LLAMADA EN SUPABASE
// ================================================================

function subscribeCall(llamadaId) {
    if (callChannel) {
        db.removeChannel(callChannel);
        callChannel = null;
    }

    callChannel = db.channel('call-' + llamadaId)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'llamadas',
                filter: 'id=eq.' + llamadaId
            },
            async p => {
                if (call.id !== llamadaId) return;

                const estado = p.new?.estado;

                if (estado === 'active') {
                    if (
                        !call.initiator ||
                        call.active ||
                        llamadaConectando
                    ) {
                        return;
                    }

                    clearTimeout(llamadaTimeoutTimer);

                    $('callInfo').textContent = 'Conectando…';

                    try {
                        const t = await llamadaFetch(
                            `/api/llamadas/${encodeURIComponent(llamadaId)}/token`,
                            {}
                        );

                        await conectarYPublicar(
                            t.url,
                            t.token,
                            call.tipo
                        );

                        mostrarEnCurso();

                    } catch (e) {
                        console.error(
                            '[Llamadas] Error conectando al que llama:',
                            e
                        );

                        toast(textoErrorLlamada(e), 'error');

                        await terminarLlamadaServidor(llamadaId);

                        await finalizarLlamadaLocal();
                    }

                } else if (
                    ['ended', 'rejected', 'missed'].includes(estado)
                ) {
                    toast(
                        estado === 'rejected'
                            ? 'La llamada fue rechazada.'
                            : 'La llamada terminó.',
                        ''
                    );

                    await finalizarLlamadaLocal();
                }
            }
        )
        .subscribe();
}

// ================================================================
// TIEMPO DE ESPERA
// ================================================================

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

// ================================================================
// INICIAR LLAMADA
// ================================================================

async function startCall(tipo = 'video') {
    if (current?.bot) {
        toast('Marquinhos no acepta llamadas.', 'warning');
        return;
    }

    if (!current) {
        toast('Selecciona una conversación primero.', 'error');
        return;
    }

    if (call.active || call.id) {
        $('callOverlay').classList.add('show');
        return;
    }

    if (!window.__livekitReady) {
        toast(
            'Las llamadas no están disponibles en este dispositivo. Recarga la página.',
            'error'
        );
        return;
    }

    const nombre = current.profile?.nombre || 'usuario';

    try {
        const d = await llamadaFetch('/api/llamadas/iniciar', {
            destinatarioId: current.id,
            tipo
        });

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

        toast(
            'No se pudo iniciar la llamada: ' + textoErrorLlamada(e),
            'error'
        );

        await finalizarLlamadaLocal();
    }
}

// ================================================================
// FECHAS SUPABASE
// ================================================================

function parsearFechaSupabase(iso) {
    if (!iso) return null;

    if (iso instanceof Date) return iso;

    const s = String(iso);

    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
        return new Date(s + 'Z');
    }

    return new Date(s);
}

// ================================================================
// LLAMADA ENTRANTE
// ================================================================

function cerrarOverlayEntrante() {
    clearTimeout(ringTimer);

    ringTimer = null;

    if (ringChannel) {
        db.removeChannel(ringChannel);
        ringChannel = null;
    }

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
        if (incomingId !== data.id && !call.id) {
            await terminarLlamadaServidor(
                data.id,
                { motivo: 'ocupado' }
            );
        }

        return;
    }

    incomingId = data.id;

    const id = data.id;

    const p = await profile(data.creador_id);

    $('incomingName').textContent = p.nombre || 'Usuario';

    const inicial = esc(
        (p.nombre || 'U').charAt(0).toUpperCase()
    );

    const contenidoAvatar = p.avatar_url
        ? `<img src="${esc(p.avatar_url)}" alt="">`
        : inicial;

    $('incomingAvatar').innerHTML = contenidoAvatar;

    const halo = $('incomingHalo');

    if (halo) {
        halo.innerHTML = contenidoAvatar;
    }

    $('incomingOverlay').classList.add('show');

    toast(
        (p.nombre || 'Alguien') + ' te está llamando…',
        'success'
    );

    ringChannel = db.channel('ring-' + id)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'llamadas',
                filter: 'id=eq.' + id
            },
            p2 => {
                if (
                    incomingId === id &&
                    p2.new?.estado !== 'ringing'
                ) {
                    cerrarOverlayEntrante();

                    toast(
                        'La llamada ya no está disponible.',
                        'warning'
                    );
                }
            }
        )
        .subscribe();

    ringTimer = setTimeout(async () => {
        if (incomingId !== id) return;

        cerrarOverlayEntrante();

        await terminarLlamadaServidor(id);

    }, LLAMADA_TIMEOUT_MS);
}

// ================================================================
// ACEPTAR LLAMADA
// ================================================================

async function acceptCall() {
    if (!incomingId || llamadaAceptando) return;

    if (!window.__livekitReady) {
        toast(
            'Las llamadas no están disponibles en este dispositivo. No se puede aceptar.',
            'error'
        );

        const id = incomingId;

        cerrarOverlayEntrante();

        if (id) {
            await terminarLlamadaServidor(
                id,
                { motivo: 'fallida' }
            );
        }

        return;
    }

    llamadaAceptando = true;

    const id = incomingId;

    try {
        const d = await llamadaFetch(
            `/api/llamadas/${encodeURIComponent(id)}/aceptar`,
            {}
        );

        cerrarOverlayEntrante();

        call.id = d.llamadaId || id;
        call.roomName = d.roomName;
        call.tipo = d.tipo || 'video';
        call.initiator = false;

        subscribeCall(call.id);

        $('callOverlay').classList.add('show');

        $('callInfo').textContent = 'Conectando…';

        await conectarYPublicar(
            d.url,
            d.token,
            call.tipo
        );

        mostrarEnCurso();

    } catch (e) {
        console.error('[Llamadas] Error al aceptar:', e);

        toast(textoErrorLlamada(e), 'error');

        cerrarOverlayEntrante();

        await terminarLlamadaServidor(id);

        await finalizarLlamadaLocal();

    } finally {
        llamadaAceptando = false;
    }
}

// ================================================================
// RECHAZAR LLAMADA
// ================================================================

async function rejectCall() {
    const id = incomingId;

    cerrarOverlayEntrante();

    if (id) {
        await terminarLlamadaServidor(
            id,
            { motivo: 'rechazada' }
        );
    }

    toast('Llamada rechazada.', 'warning');
}

// ================================================================
// COLGAR
// ================================================================

async function hangup() {
    const id = call.id;

    await terminarLlamadaServidor(id);

    toast('Llamada finalizada.', 'warning');

    await finalizarLlamadaLocal();
}

// ================================================================
// LIMPIEZA COMPLETA
// ================================================================

async function finalizarLlamadaLocal() {
    clearTimeout(llamadaTimeoutTimer);

    llamadaTimeoutTimer = null;

    const room = call.room;

    call.room = null;
    call.active = false;

    try {
        room?.disconnect();
    } catch (e) {}

    try {
        call.audio?.stop();
        call.video?.stop();

        if (call.screen) {
            call.screen.onended = null;
            call.screen.stop();
        }

    } catch (e) {}

    $('localVideo').srcObject = null;
    $('remoteVideo').srcObject = null;

    document.querySelectorAll('audio[data-lk="1"]')
        .forEach(el => el.remove());

    if (callChannel) {
        db.removeChannel(callChannel);
        callChannel = null;
    }

    Object.assign(call, {
        room: null,
        id: null,
        active: false,
        audio: null,
        video: null,
        screen: null,
        roomName: null,
        initiator: false,
        noiseCancellation: true
    });

    llamadaConectando = false;

    $('callOverlay').classList.remove('show');

    $('toggleMic').innerHTML = ctrlHTML(
        ICO_LLAM.mic,
        'Micrófono'
    );

    $('toggleCam').innerHTML = ctrlHTML(
        ICO_LLAM.cam,
        'Cámara'
    );

    $('toggleScreen').innerHTML = ctrlHTML(
        ICO_LLAM.pantalla,
        'Compartir pantalla'
    );

    actualizarControlRuido();
}

async function cleanupCall() {
    await finalizarLlamadaLocal();
}

// ================================================================
// MICRÓFONO
// ================================================================

async function toggleMic() {
    if (!call.audio) return;

    call.audio.enabled = !call.audio.enabled;

    $('toggleMic').innerHTML = call.audio.enabled
        ? ctrlHTML(ICO_LLAM.mic, 'Micrófono')
        : ctrlHTML(ICO_LLAM.micOff, 'Silenciado');
}

// ================================================================
// CÁMARA
// ================================================================

async function toggleCam() {
    if (!call.video) return;

    call.video.enabled = !call.video.enabled;

    $('toggleCam').innerHTML = call.video.enabled
        ? ctrlHTML(ICO_LLAM.cam, 'Cámara')
        : ctrlHTML(ICO_LLAM.camOff, 'Sin cámara');
}

// ================================================================
// ENLACE DE BOTONES
// ================================================================

function enlazarBotonesLlamada() {
    const bind = (id, fn) => {
        const el = $(id);

        if (el) {
            el.onclick = fn;
        }
    };

    bind('videoCall', () => startCall('video'));
    bind('audioCall', () => startCall('audio'));

    bind('hangup', hangup);

    bind('toggleMic', toggleMic);
    bind('toggleCam', toggleCam);
    bind('toggleScreen', toggleScreen);

    bind('toggleNoise', toggleNoiseCancellation);
    bind('toggleMessage', enviarMensajeDuranteLlamada);
    bind('toggleParticipants', anadirParticipantesLlamada);

    bind('acceptCall', acceptCall);
    bind('rejectCall', rejectCall);

    instalarControlesExtrasLlamada();
}

// ================================================================
// INTEGRACIÓN CON EL ECOSISTEMA CSARIEL'S
// ================================================================

window.startCall = startCall;
window.acceptCall = acceptCall;

window.endCall = finalizarLlamadaLocal;
window.cancelCall = finalizarLlamadaLocal;

window.incoming = incoming;

window.enlazarBotonesLlamada = enlazarBotonesLlamada;

window.toggleScreen = toggleScreen;
window.toggleNoiseCancellation = toggleNoiseCancellation;

window.enviarMensajeDuranteLlamada =
    enviarMensajeDuranteLlamada;

window.anadirParticipantesLlamada =
    anadirParticipantesLlamada;

window.abrirSelectorParticipantesLlamada =
    window.abrirSelectorParticipantesLlamada || null;

window.llamadaCsariels = {
    get activa() {
        return call.active;
    },

    get id() {
        return call.id;
    },

    get tipo() {
        return call.tipo;
    },

    get cancelacionRuido() {
        return call.noiseCancellation;
    },

    get participantes() {
        if (!call.room || !call.room.remoteParticipants) {
            return [];
        }

        return Array.from(
            call.room.remoteParticipants.values()
        ).map(p => ({
            identity: p.identity,
            name: p.name || ''
        }));
    },

    compartirPantalla: toggleScreen,
    enviarMensaje: enviarMensajeDuranteLlamada,
    anadirParticipantes: anadirParticipantesLlamada,
    cancelarRuido: toggleNoiseCancellation
};