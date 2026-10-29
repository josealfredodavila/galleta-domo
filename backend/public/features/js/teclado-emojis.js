/* ============================================================
   TECLADO DE EMOJIS Y EMOTES · v3 (archivo completo)
   - Inserta códigos :id: en el input (no texto del fallback)
   - formatearMensajeConEmotes() convierte :id: en <img> al mostrar mensajes
   - Categoría "desafio" para emotes tipo Double Kill, POTG, etc.
   ============================================================ */

const TECLADO_DATA = {
    generales: [
        { id: 'like', img: '/features/img/emojis/like.png', fallback: '👍' },
        { id: 'heart', img: '/features/img/emojis/heart.png', fallback: '❤️' },
        { id: 'laugh', img: '/features/img/emojis/laugh.png', fallback: '😂' },
        { id: 'surprised', img: '/features/img/emojis/surprised.png', fallback: '😮' },
        { id: 'sad', img: '/features/img/emojis/sad.png', fallback: '😢' },
        { id: 'angry', img: '/features/img/emojis/angry.png', fallback: '😡' },
        { id: 'fire', img: '/features/img/emojis/fire.png', fallback: '🔥' },
        { id: 'clap', img: '/features/img/emojis/clap.png', fallback: '👏' },
        { id: '100', img: '/features/img/emojis/100.png', fallback: '💯' },
        { id: 'crown', img: '/features/img/emojis/crown.png', fallback: '👑' }
    ],
    competitivos: [
        { id: 'gg', img: '/features/img/emojis/competitivos/gg.png', fallback: 'GG' },
        { id: 'wp', img: '/features/img/emojis/competitivos/wp.png', fallback: 'WP' },
        { id: 'ez', img: '/features/img/emojis/competitivos/ez.png', fallback: 'EZ' },
        { id: 'noob', img: '/features/img/emojis/competitivos/noob.png', fallback: '💀' },
        { id: 'pro', img: '/features/img/emojis/competitivos/pro.png', fallback: '😎' },
        { id: 'rage', img: '/features/img/emojis/competitivos/rage.png', fallback: '🤬' },
        { id: 'clutch', img: '/features/img/emojis/competitivos/clutch.png', fallback: '🎯' },
        { id: 'headshot', img: '/features/img/emojis/competitivos/headshot.png', fallback: '💀' },
        { id: 'victory', img: '/features/img/emojis/competitivos/victory.png', fallback: '🏆' },
        { id: 'defeat', img: '/features/img/emojis/competitivos/defeat.png', fallback: '🏆' }
    ],
    gestos: [
        { id: 'saludo', img: '/features/img/emojis/gestos/saludo.png', fallback: '👋' },
        { id: 'beso', img: '/features/img/emojis/gestos/beso.png', fallback: '😘' },
        { id: 'pulgar_arriba', img: '/features/img/emojis/gestos/pulgar_arriba.png', fallback: '👍' },
        { id: 'pulgar_abajo', img: '/features/img/emojis/gestos/pulgar_abajo.png', fallback: '👎' },
        { id: 'celebracion', img: '/features/img/emojis/gestos/celebracion.png', fallback: '🎉' },
        { id: 'bailar', img: '/features/img/emojis/gestos/bailar.png', fallback: '🕺' },
        { id: 'risa_fuerte', img: '/features/img/emojis/gestos/risa_fuerte.png', fallback: '😂' },
        { id: 'pensando', img: '/features/img/emojis/gestos/pensando.png', fallback: '🤔' },
        { id: 'enojado', img: '/features/img/emojis/gestos/enojado.png', fallback: '😡' },
        { id: 'dormir', img: '/features/img/emojis/gestos/dormir.png', fallback: '😴' }
    ],
    desafio: [
        { id: 'doble_kill', img: '/features/img/emojis/desafio/doble_kill.png', fallback: '⚔️', badge: true },
        { id: 'triple_kill', img: '/features/img/emojis/desafio/triple_kill.png', fallback: '🔥', badge: true },
        { id: 'team_kill', img: '/features/img/emojis/desafio/team_kill.png', fallback: '💥', badge: true },
        { id: 'potg', img: '/features/img/emojis/desafio/potg.png', fallback: '🏅', badge: true },
        { id: 'hype', img: '/features/img/emojis/desafio/hype.png', fallback: '⭐', badge: true },
        { id: 'overtime', img: '/features/img/emojis/desafio/overtime.png', fallback: '⏱️', badge: true },
        { id: 'vs', img: '/features/img/emojis/desafio/vs.png', fallback: '🆚', badge: true }
    ]
};

const TECLADO_ETIQUETAS = {
    generales: 'Emojis',
    competitivos: 'Competitivo',
    gestos: 'Gestos',
    desafio: 'Desafío'
};

// Mapa rápido id -> item, para renderizar códigos :id: en mensajes
const MAPA_EMOTES = {};
Object.values(TECLADO_DATA).forEach(lista => {
    lista.forEach(item => { MAPA_EMOTES[item.id] = item; });
});

let tecladoActual = 'generales';
let inputTeclado = null;
let overlayTeclado = null;
let botonTeclado = null;
let listenersGlobalesOk = false;

/* ---------- Inicialización ---------- */

function inicializarTecladoEmojis(inputId, botonId) {
    inputTeclado = document.getElementById(inputId);
    botonTeclado = document.getElementById(botonId);
    if (!inputTeclado || !botonTeclado) return;

    if (!overlayTeclado) {
        overlayTeclado = crearOverlay();
        const composer = inputTeclado.closest('form') || inputTeclado.parentElement;
        composer.style.position = 'relative';
        composer.appendChild(overlayTeclado);
    }

    // Evitar doble binding del botón
    if (botonTeclado.dataset.emojiBound !== '1') {
        botonTeclado.dataset.emojiBound = '1';
        botonTeclado.addEventListener('click', (e) => {
            e.preventDefault();
            overlayTeclado.classList.toggle('show');
            if (overlayTeclado.classList.contains('show')) {
                renderizarEmojis(tecladoActual);
            }
        });
    }

    if (!listenersGlobalesOk) {
        listenersGlobalesOk = true;

        // Cerrar al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!overlayTeclado.contains(e.target) && !botonTeclado.contains(e.target)) {
                overlayTeclado.classList.remove('show');
            }
        });

        // Fallback de imágenes rotas (error no burbujea, por eso capture)
        document.addEventListener('error', (e) => {
            const img = e.target;
            if (!img || img.tagName !== 'IMG') return;
            if (!img.classList.contains('emote-img') && !img.closest('.emoji-item')) return;
            const texto = img.dataset.fallback || img.alt || '?';
            img.replaceWith(document.createTextNode(texto));
        }, true);
    }
}

function crearOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'teclado-emojis-overlay';

    const tabs = document.createElement('div');
    tabs.className = 'teclado-emojis-tabs';
    tabs.innerHTML = Object.keys(TECLADO_DATA).map(tab => `
        <button type="button" class="teclado-emojis-tab${tab === tecladoActual ? ' active' : ''}" data-tab="${tab}">${TECLADO_ETIQUETAS[tab]}</button>
    `).join('');
    overlay.appendChild(tabs);

    const grid = document.createElement('div');
    grid.className = 'teclado-emojis-grid';
    grid.id = 'tecladoEmojisGrid';
    overlay.appendChild(grid);

    tabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.teclado-emojis-tab');
        if (!btn) return;
        e.preventDefault();
        cambiarTabTeclado(btn.dataset.tab);
    });

    // Un solo listener para todos los emojis (delegación)
    grid.addEventListener('click', (e) => {
        const item = e.target.closest('.emoji-item');
        if (!item) return;
        insertarEmoji(item.dataset.id || '');
    });

    return overlay;
}

/* ---------- Tabs y render ---------- */

function cambiarTabTeclado(tab) {
    if (!TECLADO_DATA[tab]) return;
    tecladoActual = tab;
    overlayTeclado?.querySelectorAll('.teclado-emojis-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    renderizarEmojis(tab);
}

function renderizarEmojis(tab) {
    const grid = document.getElementById('tecladoEmojisGrid');
    if (!grid) return;

    const emojis = TECLADO_DATA[tab] || [];
    if (!emojis.length) {
        grid.innerHTML = '<div class="teclado-emojis-vacio">Sin emojis en esta categoría</div>';
        return;
    }

    grid.innerHTML = emojis.map(e => `
        <div class="emoji-item${e.badge ? ' badge' : ''}" data-id="${e.id}" title="${e.id}">
            <img src="${e.img}" alt="${e.id}" data-fallback="${e.fallback}" loading="lazy">
        </div>
    `).join('');
}

/* ---------- Insertar en el input ---------- */

function insertarEmoji(id) {
    if (!id || !inputTeclado) return;

    const codigo = `:${id}:`;
    const start = inputTeclado.selectionStart ?? inputTeclado.value.length;
    const end = inputTeclado.selectionEnd ?? inputTeclado.value.length;
    const value = inputTeclado.value;

    inputTeclado.value = value.substring(0, start) + codigo + value.substring(end);
    const nuevaPos = start + codigo.length;
    inputTeclado.setSelectionRange(nuevaPos, nuevaPos);
    inputTeclado.focus();

    // Avisa a otros listeners (contadores, autocompletado, etc.)
    inputTeclado.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---------- Render en mensajes del chat ---------- */

function escaparHTML(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/**
 * Convierte un mensaje con códigos :id: en HTML seguro con <img>.
 * Úsalo así:  elemento.innerHTML = formatearMensajeConEmotes(mensaje.texto);
 * El texto se escapa primero, así que no hay riesgo de inyección.
 */
function formatearMensajeConEmotes(texto) {
    return escaparHTML(texto).replace(/:([a-z0-9_]+):/g, (coincidencia, id) => {
        const emote = MAPA_EMOTES[id];
        if (!emote) return coincidencia; // código desconocido: se muestra tal cual
        const clase = emote.badge ? 'emote-img emote-badge' : 'emote-img';
        return `<img class="${clase}" src="${emote.img}" alt=":${id}:" title=":${id}:" data-fallback="${escaparHTML(emote.fallback)}" loading="lazy">`;
    });
}

// Exponer globalmente
window.cambiarTabTeclado = cambiarTabTeclado;
window.renderizarEmojis = renderizarEmojis;
window.insertarEmoji = insertarEmoji;
window.inicializarTecladoEmojis = inicializarTecladoEmojis;
window.formatearMensajeConEmotes = formatearMensajeConEmotes;
