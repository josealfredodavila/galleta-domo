// backend/public/features/muro/js/music-player.js

(function() {
    'use strict';

    // Función para inyectar el reproductor visual en el DOM
    function mostrarReproductor(cancion) {
        console.log("🎵 Recibida canción para reproducir:", cancion);

        // Buscamos si ya existe un contenedor para el reproductor, si no, lo creamos
        let contenedor = document.getElementById('marquinhos-music-player');
        
        if (!contenedor) {
            contenedor = document.createElement('div');
            contenedor.id = 'marquinhos-music-player';
            // Estilos en línea para que se vea bien sin tocar tu CSS
            contenedor.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(15, 20, 30, 0.95);
                border: 1px solid var(--green, #22C55E);
                border-radius: 12px;
                padding: 12px;
                display: flex;
                align-items: center;
                gap: 15px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                z-index: 9999;
                max-width: 350px;
                animation: slideUp 0.3s ease-out;
            `;
            document.body.appendChild(contenedor);
        }

        // Actualizamos el contenido del reproductor
        contenedor.innerHTML = `
            <img src="${cancion.caratula}" alt="${cancion.titulo}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;">
            <div style="flex: 1; overflow: hidden;">
                <div style="color: #fff; font-weight: bold; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cancion.titulo}</div>
                <div style="color: #aaa; font-size: 0.75rem;">${cancion.artista}</div>
                <audio controls autoplay src="${cancion.audio_preview}" style="width: 100%; height: 30px; margin-top: 5px;"></audio>
            </div>
            <button onclick="document.getElementById('marquinhos-music-player').remove()" style="background: transparent; border: none; color: #ff5555; cursor: pointer; font-size: 1.2rem;">✕</button>
        `;
    }

    // NUEVO: Escuchamos el evento que lanza marquinhos-brain.js
    window.addEventListener('marquinhos-musica', function(evento) {
        if (evento.detail) {
            mostrarReproductor(evento.detail);
        }
    });

    console.log("✅ Reproductor de Marquinhos listo y escuchando eventos.");
})();