/* ============================================================
   LÓGICA DEL TECLADO DE EMOJIS · v2 (corregido)
   Fixes aplicados:
   1. insertarEmoji ahora sí encuentra #messageInput
   2. Sin doble binding del botón (bandera dataset.emojiBound)
   3. Sin onclick inline (delegación con addEventListener)
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
    ]
};

let tecladoActual = 'generales';

function inicializarTecladoEmojis(inputId, botonId) {
    const input = document.getElementById(inputId);
    const boton = document.getElementById(botonId);
    if (!input || !boton) return;

    // Crear el contenedor del teclado si no existe
    let overlay = document.querySelector('.teclado-emojis-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'teclado-emojis-overlay';

        // Tabs
        const tabs = document.createElement('div');
        tabs.className = 'teclado-emojis-tabs';
        tabs.innerHTML = `
            <button type="button" class="teclado-emojis-tab active" data-tab="generales">Emojis</button>
            <button type="button" class="teclado-emojis-tab" data-tab="competitivos">Competitivo</button>
            <button type="button" class="teclado-emojis-tab" data-tab="gestos">Gestos</button>
        `;
        overlay.appendChild(tabs);

        // Grid
        const grid = document.createElement('div');
        grid.className = 'teclado-emojis-grid';
        grid.id = 'tecladoEmojisGrid';
        overlay.appendChild(grid);

        // Insertar dentro del composer para que position:absolute funcione
        const composer = input.closest('form') || input.parentElement;
        composer.style.position = 'relative';
        composer.appendChild(overlay);

        // Delegación de clicks en tabs (una sola vez)
        tabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.teclado-emojis-tab');
            if (!btn) return;
            e.preventDefault();
            cambiarTabTeclado(btn.dataset.tab);
        });
    }

    // Fix 2: no re-bindear si ya se inicializó
    if (boton.dataset.emojiBound === '1') {
        if (overlay.classList.contains('show')) renderizarEmojis(tecladoActual);
        return;
    }
    boton.dataset.emojiBound = '1';

    // Mostrar/ocultar
    boton.addEventListener('click', (e) => {
        e.preventDefault();
        overlay.classList.toggle('show');
        if (overlay.classList.contains('show')) {
            renderizarEmojis(tecladoActual);
        }
    });

    // Cerrar al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!overlay.contains(e.target) && !boton.contains(e.target)) {
            overlay.classList.remove('show');
        }
    });
}

function cambiarTabTeclado(tab) {
    tecladoActual = tab;
    document.querySelectorAll('.teclado-emojis-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    renderizarEmojis(tab);
}

function renderizarEmojis(tab) {
    const grid = document.getElementById('tecladoEmojisGrid');
    if (!grid) return;

    const emojis = TECLADO_DATA[tab] || [];
    if (!emojis.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#8aa8b8;font-size:.75rem;padding:12px;">Sin emojis en esta categoría</div>';
        return;
    }

    // Fix 3: sin onclick inline, solo data-attributes
    grid.innerHTML = emojis.map(e => `
        <div class="emoji-item" data-emoji="${e.fallback}" title="${e.id}">
            <img src="${e.img}" alt="${e.id}" loading="lazy">
        </div>
    `).join('');

    // Fallback si la imagen no carga (delegado, sin inline)
    grid.querySelectorAll('.emoji-item img').forEach(img => {
        img.addEventListener('error', () => {
            const item = img.closest('.emoji-item');
            if (!item) return;
            img.remove();
            item.textContent = item.dataset.emoji || '?';
        }, { once: true });
    });

    // Delegación de clicks en emojis (una sola vez por render)
    grid.querySelectorAll('.emoji-item').forEach(item => {
        item.addEventListener('click', () => {
            insertarEmoji(item.dataset.emoji || '');
        });
    });
}

function insertarEmoji(texto) {
    if (!texto) return;

    // Fix 1: buscar primero el input real del chat
    const input = document.getElementById('messageInput')
               || document.querySelector('textarea')
               || document.querySelector('input[type="text"]');
    if (!input) return;

    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd   ?? input.value.length;
    const value = input.value;

    input.value = value.substring(0, start) + texto + value.substring(end);
    const nuevaPos = start + texto.length;
    input.setSelectionRange(nuevaPos, nuevaPos);
    input.focus();

    // Avisa a otros listeners (autocompletado, contadores, etc.)
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

// Exponer globalmente por compatibilidad
window.cambiarTabTeclado = cambiarTabTeclado;
window.renderizarEmojis = renderizarEmojis;
window.insertarEmoji = insertarEmoji;
window.inicializarTecladoEmojis = inicializarTecladoEmojis;