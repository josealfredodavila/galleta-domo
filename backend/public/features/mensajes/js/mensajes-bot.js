
// ================================================================
// MENSAJES · BOT MARQUINHOS v2.2 · MÓDULO 4 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-bot.js
// Depende de: mensajes-core.js, mensajes-scroll-media.js,
//             mensajes-chats.js
//
// CAMBIOS v2.2:
//  - Indicador visual galáctico de Marquinhos.
//  - Cabeza tecnológica con estrella SVG dorada.
//  - Antena ultravioleta con aura pulsante.
//  - Texto animado Pensando… / Razonando…
//  - Indicador integrado en mensajes de texto y voz.
//  - Conserva #typing-bot y sus tres puntos originales.
//  - CSS autónomo inyectado desde este archivo.
//  - Limpieza garantizada ante errores y reintentos.
//  - Sin cambios en Supabase, endpoints ni HTML base.
//
// CAMBIOS v2.1 CONSERVADOS:
//  - La burbuja "Enviando…" se quita siempre.
//  - Si falla el envío, se borra el audio subido.
//  - Extensión de audio según MIME real.
//  - Mensajes de error claros.
// ================================================================

'use strict';

let voiceBotRecorder = null;
let voiceBotChunks = [];
let voiceBotGrabando = false;
let enviandoVozBot = false;

// ================================================================
// MARQUINHOS · INDICADOR VISUAL GALÁCTICO
// ================================================================

(function instalarEstilosMarquinhosHead() {
    if (document.getElementById('mqs-head-styles')) return;

    const style = document.createElement('style');
    style.id = 'mqs-head-styles';

    style.textContent = `
        .mqs-head-indicator {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 4px 2px;
            margin: 0 0 4px;
            pointer-events: none;
            animation: mqs-head-in .22s ease-out;
        }

        .mqs-head-indicator__avatar {
            position: relative;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: radial-gradient(
                circle at 30% 25%,
                #2a1b4d 0%,
                #0e0820 70%
            );
            box-shadow:
                0 0 0 1px rgba(160,80,255,.35),
                0 0 12px rgba(120,40,220,.25) inset;
            flex: 0 0 34px;
            isolation: isolate;
        }

        .mqs-head-indicator__avatar svg {
            position: relative;
            z-index: 2;
            width: 20px;
            height: 20px;
            fill: #d4af37;
            stroke: none;
            filter: drop-shadow(0 0 4px rgba(212,175,55,.65));
        }

        .mqs-head-indicator__avatar::before {
            content: "";
            position: absolute;
            z-index: 0;
            inset: -8px;
            border-radius: 50%;
            background: radial-gradient(
                circle,
                rgba(170,90,255,.55) 0%,
                rgba(90,20,180,0) 68%
            );
            animation: mqs-uv-pulse 1.6s ease-in-out infinite;
            pointer-events: none;
        }

        .mqs-head-indicator__avatar::after {
            content: "";
            position: absolute;
            z-index: 3;
            top: -4px;
            left: 50%;
            width: 4px;
            height: 4px;
            margin-left: -2px;
            border-radius: 50%;
            background: #e0aaff;
            box-shadow:
                0 0 6px #c47aff,
                0 0 12px #8a3cff;
            animation: mqs-uv-tip 1.2s ease-in-out infinite;
            pointer-events: none;
        }

        .mqs-head-indicator__text {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: .2px;
            color: #b9a7e0;
            background: linear-gradient(
                90deg,
                #b9a7e0,
                #e0aaff,
                #b9a7e0
            );
            background-size: 200% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: mqs-text-shimmer 2.4s linear infinite;
        }

        @keyframes mqs-head-in {
            from {
                opacity: 0;
                transform: translateY(-2px);
            }
            to {
                opacity: 1;
                transform: none;
            }
        }

        @keyframes mqs-uv-pulse {
            0%, 100% {
                opacity: .35;
                transform: scale(.85);
            }
            50% {
                opacity: 1;
                transform: scale(1.18);
            }
        }

        @keyframes mqs-uv-tip {
            0%, 100% {
                opacity: .6;
                box-shadow: 0 0 4px #c47aff;
            }
            50% {
                opacity: 1;
                box-shadow:
                    0 0 8px #c47aff,
                    0 0 18px #8a3cff;
            }
        }

        @keyframes mqs-text-shimmer {
            from {
                background-position: 200% 0;
            }
            to {
                background-position: -200% 0;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            .mqs-head-indicator,
            .mqs-head-indicator__avatar::before,
            .mqs-head-indicator__avatar::after,
            .mqs-head-indicator__text {
                animation: none !important;
            }

            .mqs-head-indicator__avatar::before {
                opacity: .6;
            }

            .mqs-head-indicator__text {
                -webkit-text-fill-color: #b9a7e0;
            }
        }
    `;

    document.head.appendChild(style);
})();

// ================================================================
// MOSTRAR INDICADOR
// ================================================================

function mostrarIndicadorMarquinhos(texto) {
    const box = $('messages');

    if (!box || !current || !current.bot) return;

    const anchorRef = box.querySelector('#scrollAnchor');

    if (!anchorRef) return;

    const existente = box.querySelector('#mqs-head-indicator');

    if (existente) {
        actualizarIndicadorMarquinhos(texto);
        return;
    }

    box.querySelectorAll('.empty').forEach(el => el.remove());

    const mensaje = String(texto || 'Pensando…');

    const html = `
        <div class="bubblewrap received"
             id="mqs-head-indicator"
             aria-live="polite"
             aria-atomic="true">

            <div class="mqs-head-indicator">

                <div class="mqs-head-indicator__avatar"
                     aria-hidden="true">

                    <svg viewBox="0 0 24 24">
                        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>
                    </svg>

                </div>

                <div class="mqs-head-indicator__text"
                     id="mqs-head-text"></div>

            </div>
        </div>
    `;

    anchorRef.insertAdjacentHTML('beforebegin', html);

    actualizarIndicadorMarquinhos(mensaje);

    scrollToBottom(true);
}

// ================================================================
// ACTUALIZAR TEXTO DEL INDICADOR
// ================================================================

function actualizarIndicadorMarquinhos(texto) {
    const box = $('messages');
    if (!box) return;

    const indicador = box.querySelector('#mqs-head-indicator');
    if (!indicador) return;

    const textoIndicador = indicador.querySelector('#mqs-head-text');

    if (textoIndicador && texto) {
        textoIndicador.textContent = String(texto);
    }
}

// ================================================================
// QUITAR INDICADOR
// ================================================================

function quitarIndicadorMarquinhos() {
    const box = $('messages');
    if (!box) return;

    const indicador = box.querySelector('#mqs-head-indicator');

    if (indicador) indicador.remove();
}

// ================================================================
// BOTÓN DE VOZ
// ================================================================

function marcarBotonVoz(estado) {
    const btn = $('voiceBot');
    if (!btn) return;

    btn.classList.toggle('recording', estado === 'grabando');
    btn.classList.toggle('processing', estado === 'procesando');
    btn.disabled = estado === 'procesando';
}

// ================================================================
// EXTENSIÓN DE AUDIO
// ================================================================

function extensionDeAudio(mime) {
    const t = String(mime || '').toLowerCase();

    if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
    if (t.includes('ogg')) return 'ogg';

    return 'webm';
}

// ================================================================
// ABRIR CONVERSACIÓN CON MARQUINHOS
// ================================================================

async function abrirConversacionBot() {
    const box = $('messages');

    if (!box) return;

    const btn = box.querySelector('#scrollDownBtn');
    const anchor = box.querySelector('#scrollAnchor');

    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
    box.querySelectorAll('.empty').forEach(el => el.remove());

    if (!anchor) {
        const newAnchor = document.createElement('div');
        newAnchor.id = 'scrollAnchor';
        box.appendChild(newAnchor);
    }

    if (!btn) {
        const newBtn = document.createElement('button');

        newBtn.type = 'button';
        newBtn.className = 'scroll-down-btn';
        newBtn.id = 'scrollDownBtn';
        newBtn.setAttribute('aria-label', 'Ir al final');

        newBtn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg><span class="badge-new" id="newMsgBadge" hidden>1</span>';

        box.appendChild(newBtn);

        newBtn.onclick = () => {
            isUserAtBottom = true;
            scrollToBottom(true);
            actualizarFlecha();
        };
    }

    let historial = [];

    try {
        const r = await db
            .from('mensajes_chat')
            .select('*')
            .eq('eliminado', false)
            .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`)
            .order('created_at', { ascending: true })
            .limit(200);

        if (!r.error) historial = r.data || [];

    } catch (e) {
        console.warn('No se pudo cargar el historial de Marquinhos:', e);
    }

    const anchorRef = box.querySelector('#scrollAnchor');

    if (!anchorRef) return;

    if (!historial.length) {
        anchorRef.insertAdjacentHTML('beforebegin', `
            <div class="bubblewrap received">
                <div class="bubble">
                    <div class="bubble-bot-info">MARQUINHOS</div>
                    Hola, soy Marquinhos, el asistente de Csariel's. Puedes:<br><br>
                    Escribirme un mensaje de texto.<br>
                    Enviarme una nota de voz con el micrófono.<br>
                    Hablarme con el botón de voz y te responderé con voz.<br><br>
                    ¿En qué te puedo ayudar hoy?
                </div>
            </div>`);

        isUserAtBottom = true;
        scrollToBottom(true);

        return;
    }

    const signedUrls = await Promise.all(
        historial.map(m => getSignedUrlForMessage(m))
    );

    historial.forEach((m, i) => {
        anchorRef.insertAdjacentHTML(
            'beforebegin',
            messageHTML(m, m.remitente_id === user.id, signedUrls[i])
        );
    });

    isUserAtBottom = true;

    observarCargaMultimedia(box);
    scrollToBottom(true);
}

// ================================================================
// ENVIAR MENSAJE DE TEXTO A MARQUINHOS
// ================================================================

async function enviarMensajeBot(textoLimpio) {
    if (!(await verificarTerminosMarquinhos())) {
        $('messageInput').value = textoLimpio;
        return;
    }

    let userMsg = {
        contenido: textoLimpio,
        created_at: new Date().toISOString(),
        tipo: 'texto',
        remitente_id: user.id,
        leido: true
    };

    try {
        const ins = await db
            .from('mensajes_chat')
            .insert({
                remitente_id: user.id,
                destinatario_id: BOT_UUID,
                contenido: textoLimpio,
                tipo: 'texto',
                leido: true,
                editado: false,
                eliminado: false
            })
            .select('*')
            .single();

        if (ins.error) throw ins.error;

        userMsg = ins.data;

    } catch (e) {
        if (esErrorContenidoNoPermitido(e)) {
            toast('Contenido no permitido por las normas de la comunidad.', 'error');
            $('messageInput').value = textoLimpio;
            return;
        }

        console.warn('No se pudo guardar el mensaje del usuario:', e);
    }

    append(userMsg, true);

    mostrarTypingBot();
    mostrarIndicadorMarquinhos('Pensando…');

    try {
        const historial = await cargarHistorialParaBot();

        actualizarIndicadorMarquinhos('Razonando…');

        const respuesta = await preguntarAlBotConMemoria(
            textoLimpio,
            historial
        );

        quitarTypingBot();
        quitarIndicadorMarquinhos();

        let botMsg = {
            contenido: respuesta,
            created_at: new Date().toISOString(),
            tipo: 'texto',
            remitente_id: BOT_UUID,
            leido: true,
            es_bot: true
        };

        try {
            const insBot = await db
                .from('mensajes_chat')
                .insert({
                    remitente_id: BOT_UUID,
                    destinatario_id: user.id,
                    contenido: respuesta,
                    tipo: 'texto',
                    leido: true,
                    editado: false,
                    eliminado: false
                })
                .select('*')
                .single();

            if (!insBot.error) {
                botMsg = {
                    ...insBot.data,
                    es_bot: true
                };
            }

        } catch (e) {
            console.warn('No se pudo guardar la respuesta de Marquinhos:', e);
        }

        append(botMsg, false);

        recargarBandeja();

    } catch (e) {
        quitarTypingBot();
        quitarIndicadorMarquinhos();

        console.error('Error Marquinhos:', e);

        append({
            contenido: e.message || 'Tuve un problema. Intenta de nuevo.',
            created_at: new Date().toISOString(),
            tipo: 'texto',
            remitente_id: BOT_UUID,
            leido: true,
            es_bot: true
        }, false);
    }
}

// ================================================================
// VERIFICACIÓN DE TÉRMINOS
// ================================================================

async function verificarTerminosMarquinhos() {
    const TERMINOS_VERSION = '1.1';
    const TERMINOS_KEY = 'marquinhos_terminos_aceptados_' + TERMINOS_VERSION;

    try {
        if (localStorage.getItem(TERMINOS_KEY)) return true;
    } catch (e) {}

    try {
        const { data, error } = await db.rpc(
            'verificar_aceptacion_terminos',
            { p_version: TERMINOS_VERSION }
        );

        if (error) throw error;

        let aceptado = false;

        if (data === true || data === "true") {
            aceptado = true;

        } else if (
            data === false ||
            data === null ||
            data === undefined ||
            data === "false" ||
            data === ""
        ) {
            aceptado = false;

        } else if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);

                if (parsed === true || parsed === "true") {
                    aceptado = true;

                } else if (parsed && typeof parsed === 'object') {
                    if (
                        parsed.aceptado === true ||
                        parsed.aceptado === "true"
                    ) {
                        aceptado = true;

                    } else if (
                        parsed.success === true &&
                        parsed.aceptado !== false
                    ) {
                        aceptado = true;
                    }
                }

            } catch (e) {
                aceptado = false;
            }

        } else if (typeof data === 'object') {
            if (
                data.aceptado === true ||
                data.aceptado === "true"
            ) {
                aceptado = true;

            } else if (
                data.success === true &&
                data.aceptado !== false
            ) {
                aceptado = true;
            }
        }

        if (aceptado) {
            try {
                localStorage.setItem(TERMINOS_KEY, 'true');
            } catch (e) {}

            return true;
        }

    } catch (e) {
        console.warn('Error verificando términos:', e);
    }

    toast('Debes aceptar los Términos de Marquinhos primero.', 'warning');

    const RUTA_TERMINOS_REAL = '/legal/terminos-marquinhos';

    setTimeout(() => {
        window.location.href = RUTA_TERMINOS_REAL;
    }, 1200);

    return false;
}

// ================================================================
// CARGAR HISTORIAL PARA IA
// ================================================================

async function cargarHistorialParaBot() {
    try {
        const r = await db
            .from('mensajes_chat')
            .select('remitente_id, contenido, tipo, created_at')
            .eq('eliminado', false)
            .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`)
            .order('created_at', { ascending: false })
            .limit(BOT_MAX_HISTORY);

        if (r.error || !Array.isArray(r.data)) return [];

        return r.data
            .reverse()
            .map(m => ({
                role: m.remitente_id === user.id ? 'user' : 'assistant',
                content: limpiarMarkdown(m.contenido || '').slice(0, 2000)
            }))
            .filter(m => m.content && m.content.length > 0);

    } catch (e) {
        console.warn('No se pudo cargar historial para el bot:', e);
        return [];
    }
}

// ================================================================
// PREGUNTAR A MARQUINHOS CON MEMORIA
// ================================================================

async function preguntarAlBotConMemoria(mensaje, historial) {
    const s = await session();

    if (!s) {
        throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');
    }

    const userInfo =
        window.Marquinhos && window.Marquinhos.getUserInfo
            ? window.Marquinhos.getUserInfo()
            : null;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 50000);

    try {
        const r = await fetch('/api/ai/chat-pet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + s.access_token
            },
            body: JSON.stringify({
                message: mensaje.trim(),
                history: Array.isArray(historial) ? historial : [],
                page: '/features/mensajes/mensajes.html',
                user_name: userInfo ? userInfo.nombre : null,
                memoria: ''
            }),
            signal: controller.signal
        });

        let data = null;

        const contentType = r.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            try {
                data = await r.json();
            } catch (_) {
                data = null;
            }

        } else {
            if (!r.ok) {
                if (r.status === 502 || r.status === 504) {
                    throw new Error('El servidor está tardando o no disponible. Intenta de nuevo.');
                }

                if (r.status === 500) {
                    throw new Error('El servidor tuvo un error interno. Intenta más tarde.');
                }

                throw new Error(
                    'El servidor devolvió una respuesta inesperada. Código: ' + r.status
                );
            }

            throw new Error('El servidor no devolvió datos válidos.');
        }

        if (!r.ok) {
            throw new Error(
                (data && data.error) || `Error del servidor (${r.status})`
            );
        }

        if (!data || data.success === false) {
            throw new Error(
                (data && data.error) || 'Marquinhos no pudo responder.'
            );
        }

        const respuesta =
            typeof data.reply === 'string'
                ? data.reply.trim()
                : '';

        if (!respuesta) {
            throw new Error('Marquinhos respondió sin contenido.');
        }

        return limpiarMarkdown(respuesta);

    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(
                'Marquinhos está tardando demasiado en responder. Intenta nuevamente.'
            );
        }

        if (
            error.name === 'TypeError' &&
            /Failed to fetch|NetworkError/i.test(error.message || '')
        ) {
            throw new Error(
                'No se pudo conectar con el servidor. Revisa tu conexión.'
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

// ================================================================
// INDICADOR ORIGINAL DE PUNTITOS
// ================================================================

function mostrarTypingBot() {
    const box = $('messages');

    if (!box) return;

    box.querySelectorAll('.empty').forEach(el => el.remove());

    const anchorRef = box.querySelector('#scrollAnchor');

    if (anchorRef) {
        anchorRef.insertAdjacentHTML('beforebegin', `
            <div class="bubblewrap received" id="typing-bot">
                <div class="bubble">
                    <div class="bubble-bot-info">MARQUINHOS</div>
                    <div class="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            </div>`);
    }

    scrollToBottom(true);
}

function quitarTypingBot() {
    const el = $('typing-bot');

    if (el) el.remove();
}

// ================================================================
// GRABACIÓN DE VOZ PARA MARQUINHOS
// ================================================================

async function grabarVozParaBot() {
    if (!current?.bot) return;

    if (!await auth()) return;

    if (enviandoVozBot) {
        toast('Procesando el audio anterior. Espera un momento.', 'warning');
        return;
    }

    if (voiceBotGrabando) {
        if (
            voiceBotRecorder &&
            voiceBotRecorder.state !== 'inactive'
        ) {
            voiceBotRecorder.stop();
        }

        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        voiceBotChunks = [];

        voiceBotRecorder = new MediaRecorder(stream);

        voiceBotRecorder.ondataavailable = e => {
            if (e.data && e.data.size) {
                voiceBotChunks.push(e.data);
            }
        };

        voiceBotRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());

            voiceBotGrabando = false;

            marcarBotonVoz('');

            const tipo = voiceBotRecorder.mimeType || 'audio/webm';

            const blob = new Blob(voiceBotChunks, {
                type: tipo
            });

            voiceBotChunks = [];

            if (!blob.size) {
                toast('No se capturó audio.', 'error');
                return;
            }

            const file = new File(
                [blob],
                `voz-${Date.now()}.${extensionDeAudio(tipo)}`,
                { type: tipo }
            );

            await enviarVozAlBot(file);
        };

        voiceBotRecorder.start();

        voiceBotGrabando = true;

        marcarBotonVoz('grabando');

        toast('Habla ahora. Presiona otra vez para enviar.');

    } catch (e) {
        console.error('Error micrófono:', e);
        toast('No se pudo acceder al micrófono.', 'error');
    }
}

// ================================================================
// ENVIAR NOTA DE VOZ A MARQUINHOS
// ================================================================

async function enviarVozAlBot(file) {
    if (enviandoVozBot) {
        toast('Ya hay un audio en proceso. Espera.', 'warning');
        return;
    }

    enviandoVozBot = true;

    marcarBotonVoz('procesando');

    const tempId = 'voice-user-' + Date.now();

    let pathSubido = null;
    let guardado = false;

    try {
        const s = await session();

        if (!s) {
            throw new Error('Inicia sesión nuevamente.');
        }

        const tipoArchivo = file.type || 'audio/webm';

        const path =
            `${user.id}/bot-voice/${Date.now()}.${extensionDeAudio(tipoArchivo)}`;

        const up = await db
            .storage
            .from('chat-audio')
            .upload(path, file, {
                contentType: tipoArchivo,
                upsert: false
            });

        if (up.error) {
            throw new Error('No se pudo subir el audio.');
        }

        pathSubido = path;

        const firma = await db
            .storage
            .from('chat-audio')
            .createSignedUrl(path, 3600);

        if (!firma.data || !firma.data.signedUrl) {
            throw new Error('No se pudo preparar el audio.');
        }

        const box = $('messages');

        if (!box) {
            throw new Error('No se encontró el área de conversación.');
        }

        const anchorRef = box.querySelector('#scrollAnchor');

        const tempHTML = `
            <div class="bubblewrap sent" id="${tempId}">
                <div class="bubble">
                    <div class="voice-label">Tu voz</div>
                    <div class="voice-loading">Enviando a Marquinhos…</div>
                </div>
            </div>`;

        if (anchorRef) {
            anchorRef.insertAdjacentHTML('beforebegin', tempHTML);
        } else {
            box.insertAdjacentHTML('beforeend', tempHTML);
        }

        mostrarIndicadorMarquinhos('Escuchando…');

        scrollToBottom(true);

        actualizarIndicadorMarquinhos('Razonando…');

        let intentos = 0;
        const maxIntentos = 3;

        let exito = false;
        let data = {};
        let ultimoError = 'Error procesando voz';

        while (intentos < maxIntentos && !exito) {
            const r = await fetch('/api/ai/voice/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + s.access_token
                },
                body: JSON.stringify({
                    audio_url: firma.data.signedUrl
                })
            });

            data = await r.json().catch(() => ({}));

            if (r.status === 429) {
                intentos++;

                const espera = intentos * 2000;

                toast(
                    `Servidor ocupado. Reintentando en ${espera / 1000} s.`,
                    'warning'
                );

                await new Promise(resolve => {
                    setTimeout(resolve, espera);
                });

                continue;
            }

            if (!r.ok || data.success === false) {
                ultimoError = data.error || 'Error procesando voz';
                break;
            }

            exito = true;
        }

        if (!exito) {
            if (intentos >= maxIntentos) {
                throw new Error(
                    'El asistente está saturado. Intenta de nuevo en unos minutos.'
                );
            }

            throw new Error(
                ultimoError + '. Marquinhos no pudo escuchar el audio, intenta de nuevo.'
            );
        }

        // --------------------------------------------------------
        // GUARDAR MENSAJE DE VOZ
        // --------------------------------------------------------

        try {
            await db
                .from('mensajes_chat')
                .insert({
                    remitente_id: user.id,
                    destinatario_id: BOT_UUID,
                    contenido: data.transcripcion || file.name,
                    nombre_archivo: file.name,
                    imagen_url: `bucket://chat-audio/${path}`,
                    tipo: 'audio',
                    leido: true,
                    editado: false,
                    eliminado: false
                });

        } catch (e) {
            console.warn('No se pudo guardar la nota de voz:', e);
        }

        // --------------------------------------------------------
        // GUARDAR RESPUESTA DEL BOT
        // --------------------------------------------------------

        try {
            if (data.reply) {
                await db
                    .from('mensajes_chat')
                    .insert({
                        remitente_id: BOT_UUID,
                        destinatario_id: user.id,
                        contenido: data.reply,
                        tipo: 'texto',
                        leido: true,
                        editado: false,
                        eliminado: false
                    });
            }

        } catch (e) {
            console.warn('No se pudo guardar la respuesta de Marquinhos:', e);
        }

        guardado = true;

        // --------------------------------------------------------
        // CONSTRUIR RESPUESTA VISUAL
        // --------------------------------------------------------

        const botId = 'voice-bot-' + Date.now();

        let botBody = '<div class="bubble-bot-info">MARQUINHOS</div>';

        if (data.transcripcion) {
            botBody += `
                <div class="bot-transcripcion">
                    Escuché: "${esc(data.transcripcion)}"
                </div>`;
        }

        botBody += `
            <div>${esc(limpiarMarkdown(data.reply || 'Sin respuesta'))}</div>`;

        if (data.audio_url) {
            botBody += `
                <audio class="bot-audio"
                       controls
                       src="${esc(data.audio_url)}"></audio>`;
        }

        const botHTML = `
            <div class="bubblewrap received" id="${botId}">
                <div class="bubble">${botBody}</div>
            </div>`;

        const anchorFinal = box.querySelector('#scrollAnchor');

        if (anchorFinal) {
            anchorFinal.insertAdjacentHTML('beforebegin', botHTML);
        } else {
            box.insertAdjacentHTML('beforeend', botHTML);
        }

        // Limpiar indicadores antes de mostrar el resultado definitivo.
        quitarIndicadorMarquinhos();

        observarCargaMultimedia(box);

        scrollToBottom(true);

        if (data.audio_url) {
            const audio = document.querySelector(`#${botId} audio`);

            if (audio) {
                audio.play().catch(() => {});
            }
        }

        recargarBandeja();

    } catch (e) {
        console.error('Error voz bot:', e);

        if (pathSubido && !guardado) {
            try {
                await db
                    .storage
                    .from('chat-audio')
                    .remove([pathSubido]);

            } catch (err) {}
        }

        if (String(e.message || '').includes('saturado')) {
            toast(
                'El asistente está saturado. Espera unos segundos e intenta de nuevo.',
                'warning'
            );

        } else {
            toast(
                e.message || 'No se pudo enviar la nota de voz.',
                'error'
            );
        }

    } finally {
        const temp = document.getElementById(tempId);

        if (temp) temp.remove();

        quitarIndicadorMarquinhos();

        enviandoVozBot = false;

        marcarBotonVoz('');
    }
}
