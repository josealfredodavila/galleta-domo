/* ============================================================
   CSARIEL'S · BIBLIOTECA DE SONIDOS RAINBOW
   Verde bosque + oro + espectro de frecuencias
   ============================================================ */

(function () {
    'use strict';

    /* --------------------------------------------------------
       Evitar carga múltiple
       -------------------------------------------------------- */
    if (window.__csarielsVideosPublicarLoaded) return;
    window.__csarielsVideosPublicarLoaded = true;

    /* --------------------------------------------------------
       Constantes globales
       -------------------------------------------------------- */
    const Z = {
        CAMARA: 99999,
        SHEET_BACKDROP: 100000,
        SHEET: 100001,
        CONFIRM: 100010,
        TOAST: 100020
    };

    function vt(clave, respaldo) {
        if (typeof window.tConFallback === 'function')
            return window.tConFallback(clave, respaldo);
        return respaldo !== undefined ? respaldo : clave;
    }

    const CONFIG = {
        PROVIDER: 'supabase',
        BUCKET: 'videos',
        CARPETA_BORRADORES: 'borradores',
        MAX_VIDEO_MB: 100,
        MAX_VIDEO_MB_R2: 500,
        VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/quicktime'],
        IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
        PORTADA_TIMEOUT_MS: 4000,
        BARRAS_EQ: 4,
        MAX_BORRADORES_LISTA: 50
    };

    const SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
    const SUPABASE_STORAGE_URL = SUPABASE_URL + '/storage/v1/object/public/audios';

    /* --------------------------------------------------------
       Catálogo de sonidos (seed)
       -------------------------------------------------------- */
    const SONIDOS_SEED = {
        parati: [
            { id: 'sd-phonk', nombre: 'Phonk Bass Drop', artista: 'Echoes of Lumen', url: `${SUPABASE_STORAGE_URL}/echoes_of_lumen-phonk-bass-neon-aura-night-drive-588671.mp3`, duracion: 128 },
            { id: 'sd-suspenso', nombre: 'Suspenso Épico', artista: 'Absolute Sound', url: `${SUPABASE_STORAGE_URL}/absolutesound-suspense-tense-atmosphere-514617.mp3`, duracion: 137 },
            { id: 'sd-comedia', nombre: 'Risa y Caos', artista: 'Alex Morgan', url: `${SUPABASE_STORAGE_URL}/alex-morgan-comedy-bgm-funny-background-music-583242.mp3`, duracion: 62 },
            { id: 'sd-n1', nombre: 'Brazilian Phonk', artista: 'Sub Clair', url: `${SUPABASE_STORAGE_URL}/sub_clair-brazilian-phonk-instrumental-585588.mp3`, duracion: 120 },
            { id: 'sd-n2', nombre: 'Sosin Phonk Music', artista: 'Sosin', url: `${SUPABASE_STORAGE_URL}/sosin-phonk-phonk-music-621003.mp3`, duracion: 110 },
            { id: 'sd-n3', nombre: 'Phonk No Copyright', artista: 'ARP Media', url: `${SUPABASE_STORAGE_URL}/arpmedia-phonk-no-copyright-music-588451.mp3`, duracion: 95 },
            { id: 'sd-n4', nombre: 'Gym Workout', artista: 'Echoes of Lumen', url: `${SUPABASE_STORAGE_URL}/echoes_of_lumen-sport-phonk-gym-workout-586978.mp3`, duracion: 105 }
        ],
        populares: [
            { id: 'sd-trend1', nombre: 'Aesthetic Vibes', artista: 'Adrihuwu', url: `${SUPABASE_STORAGE_URL}/adrihuwu-adrihuwu-join-my-server-209103.mp3`, duracion: 134 },
            { id: 'sd-trend2', nombre: 'Corrido Bélico (Trap)', artista: 'LN Plus Music', url: `${SUPABASE_STORAGE_URL}/lnplusmusic-cuban-latin-trap-beat-469610.mp3`, duracion: 127 },
            { id: 'sd-reward', nombre: '... (continúa)', /* resto del seed */ }
        ]
        /* …más categorías si las hubiera… */
    };

    /* --------------------------------------------------------
       UTILIDADES DE SUPABASE (auth, storage, etc.)
       -------------------------------------------------------- */
    // ... (funciones de autenticación, subida, borrado, etc.) 
    // **NADA DE ESTAS FUNCIONES SE MODIFICA EN ESTA ENTREGA**

    /* --------------------------------------------------------
       INYECCIÓN DE ESTILOS PERSONALIZADOS
       -------------------------------------------------------- */
    function inyectarEstilosExtra() {
        // Evita duplicados
        if (document.getElementById('csariels-videos-publicar-estilos')) return;

        const estilo = document.createElement('style');
        estilo.id = 'csariels-videos-publicar-estilos';
        estilo.textContent = `
.cs-sonido-play {
    position: relative;
    background: rgba(15, 45, 26, 0.92);
    border: 1px solid rgba(212, 175, 55, 0.55);
    border-radius: 50%;
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #D4AF37;
    cursor: pointer;
    margin-right: 12px;
    flex-shrink: 0;
    overflow: hidden;
    transition:
        transform 0.2s ease,
        box-shadow 0.2s ease,
        border-color 0.2s ease;
}
.cs-sonido-play:hover {
    transform: scale(1.07);
    border-color: #ffffff;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.35);
}
.cs-sonido-ico {
    position: relative;
    z-index: 2;
    font-size: 0.9rem;
}
.cs-eq {
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 8px;
    pointer-events: none;
    z-index: 1;
}
.cs-eq-bar {
    width: 4px;
    height: 4px;
    min-height: 4px;
    max-height: 24px;
    border-radius: 4px;
    background: #D4AF37;
    box-shadow: 0 0 7px currentColor;
    transition: height 0.08s linear;
}

/* Espectro arcoíris: cada barra representa una banda distinta. */
.cs-eq-bar:nth-child(1) { background: #FF3366; color: #FF3366; }
.cs-eq-bar:nth-child(2) { background: #FF8C42; color: #FF8C42; }
.cs-eq-bar:nth-child(3) { background: #FFE45E; color: #FFE45E; }
.cs-eq-bar:nth-child(4) { background: #45E68C; color: #45E68C; }

.cs-sonido-item.cs-sonando .cs-sonido-play {
    border-color: #00E5FF;
    box-shadow:
        0 0 10px rgba(0, 229, 255, 0.45),
        0 0 22px rgba(180, 70, 255, 0.22);
    background: rgba(15, 45, 26, 0.98);
}
.cs-sonido-item.cs-sonando .cs-sonido-ico { display: none; }
.cs-sonido-item.cs-sonando .cs-eq { display: flex; }
.cs-sonido-item.cs-sonando .cs-eq-bar {
    animation: cs-eq-rainbow 0.65s ease-in-out infinite alternate;
}
.cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(2) { animation-delay: 0.12s; }
.cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(3) { animation-delay: 0.24s; }
.cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(4) { animation-delay: 0.36s; }

@keyframes cs-eq-rainbow {
    from {
        transform: scaleY(0.35);
        filter: brightness(0.85);
    }
    to {
        transform: scaleY(1.5);
        filter: brightness(1.45);
    }
}

/* Tarjetas de sonidos con identidad visual viva. */
.cs-sonido-item {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 14px;
    background: linear-gradient(
        110deg,
        rgba(15, 45, 26, 0.96),
        rgba(25, 20, 48, 0.88),
        rgba(13, 43, 55, 0.88)
    );
    transition:
        border-color 0.2s ease,
        background 0.2s ease,
        transform 0.2s ease;
}
.cs-sonido-item:hover {
    border-color: rgba(0, 229, 255, 0.65);
    background: linear-gradient(
        110deg,
        rgba(15, 61, 43, 0.98),
        rgba(58, 28, 85, 0.95),
        rgba(12, 64, 76, 0.95)
    );
}
.cs-sonido-item.activo {
    border-color: #D4AF37;
    box-shadow: inset 3px 0 0 #D4AF37;
}
.cs-sonido-item.cs-error .cs-sonido-play {
    border-color: #FF3366;
    color: #FF3366;
}
.cs-sonido-item.cs-pausado .cs-sonido-play {
    border-color: #00E5FF;
}

/* Respeto a usuarios con preferencia por reducir movimiento */
@media (prefers-reduced-motion: reduce) {
    .cs-sonido-item,
    .cs-sonido-play,
    .cs-eq-bar {
        transition: none !important;
    }
    .cs-sonido-item.cs-sonando .cs-eq-bar {
        animation: none;
        height: 12px;
        transform: none;
    }
}
        `;
        document.head.appendChild(estilo);
    }

    /* --------------------------------------------------------
       INICIALIZACIÓN
       -------------------------------------------------------- */
    function init() {
        // Inyección de estilos personalizados (solo una vez)
        inyectarEstilosExtra();

        // ... resto de la lógica de inicialización:
        // – montar DOM, listeners, carga de borradores, preview, etc.
        // – **NADA DE ESTO SE MODIFICA** en esta entrega.
    }

    // Ejecutar al cargar el script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* --------------------------------------------------------
       EXPORTS (si se usa como módulo)
       -------------------------------------------------------- */
    // window.csarielsVideosPublicar = { /* exponer lo necesario */ };
})();