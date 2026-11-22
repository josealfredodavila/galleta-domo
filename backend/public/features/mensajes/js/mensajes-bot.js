// ================================================================
// MENSAJES · BOT MARQUINHOS v2.5 · MÓDULO 4 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-bot.js
// Depende de: mensajes-core.js, mensajes-scroll-media.js,
//             mensajes-chats.js
//
// CAMBIOS v2.5:
//  - Resumen corto en vivo junto al indicador debajo de la pregunta
//    mientras Marquinhos busca y razona.
//  - Panel deslizable hacia arriba ("Razonamientos") mientras está
//    procesando, con pasos breves y cierre/limpieza automática.
//
// CAMBIOS v2.3 / v2.2 / v2.1 CONSERVADOS:
//  - Cabeza de bot tecnológica con visor y antena con destellos
//    ultravioleta / galácticos.
//  - Posición debajo de la última pregunta del usuario mientras
//    procesa y limpieza automática al terminar o fallar.
//  - Indicador integrado en mensajes de texto y voz.
//  - CSS autónomo inyectado desde este archivo (#mqs-head-styles).
//  - Burbuja "Enviando…" removida siempre, borrado de audio si falla,
//    extensión según MIME real y mensajes de error claros.
// ================================================================

'use strict';

let voiceBotRecorder = null;
let voiceBotChunks = [];
let voiceBotGrabando = false;
let enviandoVozBot = false;

let mqsSheetTouchStartY = null;
let mqsSheetDragOffset = 0;

// ================================================================
// MARQUINHOS · INDICADOR VISUAL GALÁCTICO (CABEZA + ANTENA UV)
// ================================================================

(function instalarEstilosMarquinhosHead() {
    if (document.getElementById('mqs-head-styles')) return;

    const style = document.createElement('style');
    style.id = 'mqs-head-styles';

    style.textContent = `
        .mqs-head-indicator {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px 6px 6px;
            margin: 4px 0 6px;
            cursor: pointer;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
            animation: mqs-head-in .22s ease-out;
        }

        .mqs-head-indicator__avatar {
            position: relative;
            width: 42px;
            height: 44px;
            display: grid;
            place-items: center;
            flex: 0 0 42px;
            isolation: isolate;
            pointer-events: none;
        }

        .mqs-head-indicator__avatar::before {
            content: "";
            position: absolute;
            inset: -6px;
            border-radius: 50%;
            background: radial-gradient(
                circle,
                rgba(168, 85, 247, 0.42) 0%,
                rgba(99, 102, 241, 0.16) 45%,
                rgba(59, 130, 246, 0) 72%
            );
            animation: mqs-uv-aura 1.5s ease-in-out infinite;
            pointer-events: none;
            z-index: 0;
        }

        .mqs-head-indicator__bot {
            position: relative;
            z-index: 2;
            width: 34px;
            height: 36px;
            overflow: visible;
            filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.75));
        }

        .mqs-head-indicator__antena-punta {
            transform-origin: 18px 3px;
            animation: mqs-antena-destello 1.1s ease-in-out infinite;
        }

        .mqs-head-indicator__chispas {
            transform-origin: 18px 3px;
            animation: mqs-chispas-galaxia 1.35s ease-in-out infinite;
        }

        .mqs-head-indicator__visor-luz {
            animation: mqs-visor-pulso 1.6s ease-in-out infinite;
        }

        .mqs-head-indicator__meta {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
            pointer-events: none;
        }

        .mqs-head-indicator__row {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }

        .mqs-head-indicator__text {
            font-size: 12.5px;
            font-weight: 600;
            letter-spacing: .25px;
            background: linear-gradient(
                90deg,
                #c4b5fd,
                #e879f9,
                #67e8f9,
                #c4b5fd
            );
            background-size: 240% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: mqs-text-shimmer 2.2s linear infinite;
        }

        .mqs-head-indicator__resumen {
            font-size: 11px;
            color: #c4b5fd;
            opacity: .85;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 220px;
        }

        .mqs-head-indicator__chevron {
            font-size: 12px;
            color: #d8b4fe;
            opacity: .85;
            transform: translateY(-1px);
        }

        .mqs-razonamiento-sheet {
            position: fixed;
            left: 10px;
            right: 10px;
            bottom: 72px;
            z-index: 950;
            background: linear-gradient(180deg, #1b1033 0%, #0d081a 100%);
            border: 1px solid rgba(168, 85, 247, 0.35);
            border-radius: 16px;
            padding: 10px 14px 14px;
            box-shadow: 0 -6px 28px rgba(0, 0, 0, 0.55), 0 0 18px rgba(139, 92, 246, 0.22);
            color: #e9d5ff;
            transform: translateY(115%);
            opacity: 0;
            pointer-events: none;
            transition: transform .24s ease-out, opacity .2s ease-out;
            touch-action: none;
        }

        .mqs-razonamiento-sheet.is-open {
            transform: translateY(0);
            opacity: 1;
            pointer-events: auto;
        }

        .mqs-razonamiento-sheet__handle {
            width: 34px;
            height: 4px;
            border-radius: 999px;
            background: rgba(216, 180, 254, 0.38);
            margin: 0 auto 8px;
        }

        .mqs-razonamiento-sheet__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }

        .mqs-razonamiento-sheet__title {
            font-size: 12.5px;
            font-weight: 700;
            color: #f3e8ff;
            letter-spacing: .2px;
        }

        .mqs-razonamiento-sheet__close {
            background: transparent;
            border: 0;
            color: #c4b5fd;
            font-size: 14px;
            line-height: 1;
            padding: 2px 6px;
            cursor: pointer;
        }

        .mqs-razonamiento-sheet__list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 11.5px;
            color: #d8b4fe;
        }

        .mqs-razonamiento-sheet__item {
            display: flex;
            align-items: center;
            gap: 8px;
            opacity: .92;
        }

        .mqs-razonamiento-sheet__dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #e879f9;
            box-shadow: 0 0 8px #c084fc;
            flex: 0 0 6px;
        }

        @keyframes mqs-head-in {
            from {
                opacity: 0;
                transform: translateY(3px);
            }
            to {
                opacity: 1;
                transform: none;
            }
        }

        @keyframes mqs-uv-aura {
            0%, 100% {
                opacity: .45;
                transform: scale(.9);
            }
            50% {
                opacity: 1;
                transform: scale(1.18);
            }
        }

        @keyframes mqs-antena-destello {
            0%, 100% {
                opacity: .75;
                transform: scale(1);
            }
            50% {
                opacity: 1;
                transform: scale(1.35);
            }
        }

        @keyframes mqs-chispas-galaxia {
            0%, 100% {
                opacity: .25;
                transform: scale(.8) rotate(0deg);
            }
            50% {
                opacity: 1;
                transform: scale(1.25) rotate(25deg);
            }
        }

        @keyframes mqs-visor-pulso {
            0%, 100% {
                opacity: .65;
            }
            50% {
                opacity: 1;
            }
        }

        @keyframes mqs-text-shimmer {
            from {
                background-position: 240% 0;
            }
            to {
                background-position: -240% 0;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            .mqs-head-indicator,
            .mqs-head-indicator__avatar::before,
            .mqs-head-indicator__antena-punta,
            .mqs-head-indicator__chispas,
            .mqs-head-indicator__visor-luz,
            .mqs-head-indicator__text,
            .mqs-razonamiento-sheet {
                animation: none !important;
                transition: none !important;
            }

            .mqs-head-indicator__text {
                -webkit-text-fill-color: #d8b4fe;
            }
        }
    `;

    document.head.appendChild(style);
})();

function renderizarCabezaBotSVG() {
    return `
        <svg class="mqs-head-indicator__bot" viewBox="0 0 36 38" aria-hidden="true">
            <defs>
                <linearGradient id="mqsCabezaGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#3b1d6e"/>
                    <stop offset="100%" stop-color="#140b29"/>
                </linearGradient>
                <linearGradient id="mqsVisorGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#e879f9"/>
                    <stop offset="50%" stop-color="#a855f7"/>
                    <stop offset="100%" stop-color="#38bdf8"/>
                </linearGradient>
                <radialGradient id="mqsUvGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#ffffff"/>
                    <stop offset="45%" stop-color="#d946ef"/>
                    <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
                </radialGradient>
            </defs>

            <!-- Antena superior -->
            <line x1="18" y1="11" x2="18" y2="4" stroke="#c084fc" stroke-width="2" stroke-linecap="round"/>

            <!-- Destellos galácticos / ultravioleta en la punta de la antena -->
            <g class="mqs-head-indicator__chispas" stroke="#e879f9" stroke-width="1.4" stroke-linecap="round">
                <line x1="18" y1="-1" x2="18" y2="1.5"/>
                <line x1="18" y1="6.5" x2="18" y2="9"/>
                <line x1="13.5" y1="4" x2="16" y2="4"/>
                <line x1="20" y1="4" x2="22.5" y2="4"/>
                <line x1="14.5" y1="0.5" x2="16.2" y2="2.2"/>
                <line x1="19.8" y1="5.8" x2="21.5" y2="7.5"/>
                <line x1="21.5" y1="0.5" x2="19.8" y2="2.2"/>
                <line x1="16.2" y1="5.8" x2="14.5" y2="7.5"/>
            </g>

            <g class="mqs-head-indicator__antena-punta">
                <circle cx="18" cy="4" r="5.5" fill="url(#mqsUvGlow)"/>
                <circle cx="18" cy="4" r="2.6" fill="#f5d0fe"/>
            </g>

            <!-- Orejas / conectores laterales -->
            <rect x="4" y="17" width="3" height="8" rx="1.5" fill="#7e22ce"/>
            <rect x="29" y="17" width="3" height="8" rx="1.5" fill="#7e22ce"/>

            <!-- Cabeza del bot -->
            <rect x="7" y="11" width="22" height="20" rx="8" fill="url(#mqsCabezaGrad)" stroke="#a855f7" stroke-width="1.4"/>

            <!-- Visor tecnológico -->
            <rect x="10.5" y="16" width="15" height="8" rx="4" fill="#090514" stroke="url(#mqsVisorGrad)" stroke-width="1.2"/>

            <!-- Ojos / destellos en el visor -->
            <g class="mqs-head-indicator__visor-luz">
                <circle cx="15" cy="20" r="2" fill="#f0abfc"/>
                <circle cx="21" cy="20" r="2" fill="#67e8f9"/>
            </g>

            <!-- Detalle inferior de barbilla / señal -->
            <path d="M14 27.5h8" stroke="#d4af37" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
    `;
}

// ================================================================
// PANEL DESLIZABLE DE RAZONAMIENTO + RESUMEN CORTO
// ================================================================

function asegurarHojaRazonamientoMarquinhos() {
    let sheet = document.getElementById('mqs-razonamiento-sheet');
    if (sheet) return sheet;

    sheet = document.createElement('div');
    sheet.id = 'mqs-razonamiento-sheet';
    sheet.className = 'mqs-razonamiento-sheet';
    sheet.setAttribute('role', 'region');
    sheet.setAttribute('aria-label', 'Resumen de razonamiento de Marquinhos');
    sheet.innerHTML = `
        <div class="mqs-razonamiento-sheet__handle" aria-hidden="true"></div>
        <div class="mqs-razonamiento-sheet__header">
            <span class="mqs-razonamiento-sheet__title">Razonamientos de Marquinhos</span>
            <button type="button" class="mqs-razonamiento-sheet__close" id="mqs-sheet-close" aria-label="Cerrar">✕</button>
        </div>
        <ul class="mqs-razonamiento-sheet__list" id="mqs-sheet-steps"></ul>
    `;

    sheet.querySelector('#mqs-sheet-close').addEventListener('click', () => {
        establecerEstadoHojaRazonamiento(false);
    });

    sheet.addEventListener('touchstart', e => {
        if (!e.touches || !e.touches.length) return;
        mqsSheetTouchStartY = e.touches[0].clientY;
        mqsSheetDragOffset = 0;
    }, { passive: true });

    sheet.addEventListener('touchmove', e => {
        if (mqsSheetTouchStartY === null || !e.touches || !e.touches.length) return;
        const deltaY = e.touches[0].clientY - mqsSheetTouchStartY;
        if (deltaY > 0) {
            mqsSheetDragOffset = deltaY;
            sheet.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: true });

    sheet.addEventListener('touchend', () => {
        if (mqsSheetTouchStartY === null) return;
        const shouldClose = mqsSheetDragOffset > 45;
        sheet.style.transform = '';
        mqsSheetTouchStartY = null;
        mqsSheetDragOffset = 0;
        if (shouldClose) establecerEstadoHojaRazonamiento(false);
    });

    document.body.appendChild(sheet);
    return sheet;
}

function establecerEstadoHojaRazonamiento(abierta) {
    const sheet = document.getElementById('mqs-razonamiento-sheet');
    if (!sheet) return;
    sheet.style.transform = '';
    sheet.classList.toggle('is-open', Boolean(abierta));
}

function renderizarPasosHoja(pasos) {
    const sheet = asegurarHojaRazonamientoMarquinhos();
    const list = sheet.querySelector('#mqs-sheet-steps');
    if (!list) return;
    const lista = Array.isArray(pasos) && pasos.length
        ? pasos
        : ['Analizando consulta…', 'Buscando contexto en Marquinhos…'];

    list.innerHTML = lista
        .slice(-3)
        .map(p => `<li class="mqs-razonamiento-sheet__item"><span class="mqs-razonamiento-sheet__dot"></span><span>${esc(String(p))}</span></li>`)
        .join('');
}

// ================================================================
// MOSTRAR / ACTUALIZAR / QUITAR INDICADOR
// ================================================================

function mostrarIndicadorMarquinhos(texto, resumen = '', pasos = []) {
    const box = $('messages');

    if (!box || !current || !current.bot) return;

    const anchorRef = box.querySelector('#scrollAnchor');

    if (!anchorRef) return;

    const existente = box.querySelector('#mqs-head-indicator');

    if (existente) {
        actualizarIndicadorMarquinhos(texto, resumen, pasos);
        return;
    }

    box.querySelectorAll('.empty').forEach(el => el.remove());

    const mensaje = String(texto || 'Pensando…');

    const html = `
        <div class="bubblewrap received"
             id="mqs-head-indicator"
             aria-live="polite"
             aria-atomic="true">
            <div class="mqs-head-indicator" id="mqs-head-trigger" title="Desliza arriba o toca para ver el resumen">
                <div class="mqs-head-indicator__avatar" aria-hidden="true">
                    ${renderizarCabezaBotSVG()}
                </div>
                <div class="mqs-head-indicator__meta">
                    <div class="mqs-head-indicator__row">
                        <span class="mqs-head-indicator__text" id="mqs-head-text"></span>
                        <span class="mqs-head-indicator__chevron" aria-hidden="true">⌃</span>
                    </div>
                    <span class="mqs-head-indicator__resumen" id="mqs-head-resumen"></span>
                </div>
            </div>
        </div>
    `;

    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const nodo = tpl.content.firstChild;

    const enviados = box.querySelectorAll('.bubblewrap.sent');
    const ultimoEnviado = enviados.length ? enviados[enviados.length - 1] : null;

    if (ultimoEnviado && ultimoEnviado.parentNode) {
        ultimoEnviado.parentNode.insertBefore(nodo, ultimoEnviado.nextSibling);
    } else {
        anchorRef.parentNode.insertBefore(nodo, anchorRef);
    }

    const trigger = nodo.querySelector('#mqs-head-trigger');
    if (trigger) {
        let startY = null;
        trigger.addEventListener('click', () => {
            const sheet = asegurarHojaRazonamientoMarquinhos();
            establecerEstadoHojaRazonamiento(!sheet.classList.contains('is-open'));
        });
        trigger.addEventListener('touchstart', e => {
            if (e.touches && e.touches.length) startY = e.touches[0].clientY;
        }, { passive: true });
        trigger.addEventListener('touchend', e => {
            if (startY === null || !e.changedTouches || !e.changedTouches.length) return;
            const diffY = startY - e.changedTouches[0].clientY;
            startY = null;
            if (diffY > 20) establecerEstadoHojaRazonamiento(true);
        }, { passive: true });
    }

    actualizarIndicadorMarquinhos(mensaje, resumen, pasos);

    scrollToBottom(true);
}

function actualizarIndicadorMarquinhos(texto, resumen = '', pasos = []) {
    const box = $('messages');
    if (!box) return;

    const indicador = box.querySelector('#mqs-head-indicator');
    if (!indicador) return;

    const textoIndicador = indicador.querySelector('#mqs-head-text');
    if (textoIndicador && texto) {
        textoIndicador.textContent = String(texto);
    }

    const resumenEl = indicador.querySelector('#mqs-head-resumen');
    if (resumenEl && resumen) {
        const limpio = String(resumen).replace(/\s+/g, ' ').trim();
        resumenEl.textContent = limpio.length > 54 ? limpio.slice(0, 54) + '…' : limpio;
    }

    if (Array.isArray(pasos) && pasos.length) {
        renderizarPasosHoja(pasos);
    }
}

function quitarIndicadorMarquinhos() {
    establecerEstadoHojaRazonamiento(false);
    const sheet = document.getElementById('mqs-razonamiento-sheet');
    if (sheet) sheet.remove();

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
    quitarIndicadorMarquinhos();

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

    const resumenConsulta = `Buscando respuesta para: "${textoLimpio}"`;
    mostrarIndicadorMarquinhos(
        'Pensando…',
        resumenConsulta,
        ['Recibiendo pregunta', 'Cargando historial de conversación']
    );
    mostrarTypingBot();

    try {
        const historial = await cargarHistorialParaBot();

        actualizarIndicadorMarquinhos(
            'Razonando…',
            resumenConsulta,
            ['Recibiendo pregunta', 'Historial cargado', 'Razonando respuesta con Marquinhos']
        );

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

        const resumenVoz = `Procesando nota de voz (${file.name || 'audio'})`;
        mostrarIndicadorMarquinhos(
            'Escuchando…',
            resumenVoz,
            ['Audio subido y firmado', 'Escuchando nota de voz']
        );

        scrollToBottom(true);

        actualizarIndicadorMarquinhos(
            'Razonando…',
            resumenVoz,
            ['Audio subido y firmado', 'Audio escuchado', 'Razonando respuesta de voz']
        );

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

                actualizarIndicadorMarquinhos(
                    'Razonando…',
                    `Servidor ocupado, reintentando (${intentos}/${maxIntentos})…`,
                    ['Servidor ocupado (429)', `Reintentando en ${espera / 1000} s`]
                );

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
