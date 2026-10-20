// ================================================================
// REPRODUCTOR DE MÚSICA GLOBAL - MARQUINHOS
// Archivo: backend/public/features/js/music-player.js
// ================================================================

(function () {
    'use strict';

    function mostrarReproductor(cancion) {
        console.log("🎵 Marquinhos está reproduciendo:", cancion.titulo);

        let contenedor = document.getElementById('marquinhos-music-player');
        
        if (!contenedor) {
            contenedor = document.createElement('div');
            contenedor.id = 'marquinhos-music-player';
            // Estilos flotantes para que aparezca en la esquina de la pantalla
            contenedor.style.cssText = `
                position: fixed;
                bottom: 80px;
                right: 20px;
                background: rgba(15, 20, 30, 0.95);
                border: 1px solid #22C55E;
                border-radius: 12px;
                padding: 12px;
                display: flex;
                align-items: center;
                gap: 15px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                z-index: 99999;
                max-width: 320px;
                animation: slideUp 0.3s ease-out;
            `;
            document.body.appendChild(contenedor);
        }

        contenedor.innerHTML = `
            <img src="${cancion.caratula}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;">
            <div style="flex: 1; overflow: hidden;">
                <div style="color: #fff; font-weight: bold; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cancion.titulo}</div>
                <div style="color: #aaa; font-size: 0.75rem;">${cancion.artista}</div>
                <audio controls autoplay src="${cancion.audio_preview}" style="width: 100%; height: 30px; margin-top: 5px;"></audio>
            </div>
            <button onclick="document.getElementById('marquinhos-music-player').remove()" style="background: transparent; border: none; color: #ff5555; cursor: pointer; font-size: 1.2rem; padding: 5px;">✕</button>
        `;
    }

    // Escuchamos el evento que lanza marquinhos-brain.js cuando hay música
    window.addEventListener('marquinhos-musica', function (evento) {
        if (evento.detail) {
            mostrarReproductor(evento.detail);
        }
    });

    console.log("✅ Reproductor de música de Marquinhos listo.");
})();