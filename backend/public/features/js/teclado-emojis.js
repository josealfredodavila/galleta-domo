/* ============================================================
   LÓGICA DEL TECLADO DE EMOJIS
   ============================================================ */

// Estructura de los emojis según la imagen
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
            <button class="teclado-emojis-tab active" onclick="cambiarTabTeclado('generales')">Emojis</button>
            <button class="teclado-emojis-tab" onclick="cambiarTabTeclado('competitivos')">Competitivo</button>
            <button class="teclado-emojis-tab" onclick="cambiarTabTeclado('gestos')">Gestos</button>
        `;
        overlay.appendChild(tabs);

        // Grid
        const grid = document.createElement('div');
        grid.className = 'teclado-emojis-grid';
        grid.id = 'tecladoEmojisGrid';
        overlay.appendChild(grid);

        // Insertar antes del input (dentro del composer)
        const composer = input.closest('form') || input.parentElement;
        composer.style.position = 'relative';
        composer.appendChild(overlay);
    }

    // Evento para mostrar/ocultar
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
    document.querySelectorAll('.teclado-emojis-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.teclado-emojis-tab[onclick*="${tab}"]`).classList.add('active');
    renderizarEmojis(tab);
}

function renderizarEmojis(tab) {
    const grid = document.getElementById('tecladoEmojisGrid');
    if (!grid) return;

    const emojis = TECLADO_DATA[tab] || [];
    
    grid.innerHTML = emojis.map(e => `
        <div class="emoji-item" onclick="insertarEmoji('${e.fallback}', '${e.img}')" title="${e.id}">
            <img src="${e.img}" alt="${e.id}" onerror="this.style.display='none'; this.parentElement.innerText='${e.fallback}';">
        </div>
    `).join('');
}

function insertarEmoji(texto, imgPath) {
    // Buscar el input activo (el que abrió el teclado)
    const input = document.querySelector('input[type="text"], textarea');
    if (!input) return;

    // Insertar el texto en la posición del cursor
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const value = input.value;
    
    input.value = value.substring(0, start) + texto + value.substring(end);
    input.selectionStart = input.selectionEnd = start + texto.length;
    input.focus();
}