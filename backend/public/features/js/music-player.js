// ================================================================
// REPRODUCTOR DE MÚSICA GLOBAL - MARQUINHOS
// Archivo: public/features/js/music-player.js
// v2.0 — DOM seguro (sin innerHTML con datos externos), URLs
//        HTTPS validadas, autoplay bloqueado manejado, un solo
//        reproductor a la vez, guard contra carga doble.
// ================================================================

(function () {
    'use strict';

    if (window.__marquinhosMusicPlayerListo) return;
    window.__marquinhosMusicPlayerListo = true;

    const ID = 'marquinhos-music-player';
    const STYLE_ID = 'marquinhos-music-player-style';

    function asegurarEstilos() {
        if (document.getElementById(STYLE_ID)) return;

        const st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = `
            #${ID} {
                position: fixed;
                bottom: calc(80px + env(safe-area-inset-bottom, 0px));
                right: 20px;
                background: rgba(15, 20, 30, 0.95);
                border: 1px solid #22C55E;
                border-radius: 12px;
                padding: 12px;
                display: flex;
                align-items: center;
                gap: 12px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
                z-index: 99999;
                max-width: min(320px, calc(100vw - 40px));
                animation: marquinhosSlideUp 0.3s ease-out;
            }
            #${ID} img {
                width: 50px;
                height: 50px;
                border-radius: 8px;
                object-fit: cover;
                flex-shrink: 0;
            }
            #${ID} .mp-info { flex: 1; min-width: 0; }
            #${ID} .mp-titulo {
                color: #fff;
                font-weight: bold;
                font-size: 0.9rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #${ID} .mp-artista {
                color: #aaa;
                font-size: 0.75rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #${ID} audio {
                width: 100%;
                height: 30px;
                margin-top: 5px;
            }
            #${ID} .mp-cerrar {
                background: transparent;
                border: none;
                color: #ff5555;
                cursor: pointer;
                font-size: 1.2rem;
                padding: 5px;
                flex-shrink: 0;
            }
            @keyframes marquinhosSlideUp {
                from { transform: translateY(20px); opacity: 0; }
                to   { transform: none; opacity: 1; }
            }
        `;
        document.head.appendChild(st);
    }

    // Solo acepta URLs HTTPS válidas. Devuelve '' si no lo son.
    function urlSegura(valor) {
        try {
            const u = new URL(String(valor || ''));
            return u.protocol === 'https:' ? u.href : '';
        } catch (e) {
            return '';
        }
    }

    function quitarReproductor() {
        const el = document.getElementById(ID);
        if (!el) return;

        const audio = el.querySelector('audio');
        if (audio) {
            try {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
            } catch (e) {}
        }
        el.remove();
    }

    function mostrarReproductor(cancion) {
        const audioUrl = urlSegura(cancion && cancion.audio_preview);
        if (!audioUrl) {
            console.warn('[MusicPlayer] audio_preview inválido, no se muestra el reproductor');
            return;
        }

        asegurarEstilos();
        quitarReproductor();

        const contenedor = document.createElement('div');
        contenedor.id = ID;
        contenedor.setAttribute('role', 'region');
        contenedor.setAttribute('aria-label', 'Reproductor de Marquinhos');

        const caratulaUrl = urlSegura(cancion.caratula);
        if (caratulaUrl) {
            const img = document.createElement('img');
            img.src = caratulaUrl;
            img.alt = '';
            contenedor.appendChild(img);
        }

        const info = document.createElement('div');
        info.className = 'mp-info';

        const titulo = document.createElement('div');
        titulo.className = 'mp-titulo';
        titulo.textContent = String(cancion.titulo || '');

        const artista = document.createElement('div');
        artista.className = 'mp-artista';
        artista.textContent = String(cancion.artista || '');

        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'auto';
        audio.src = audioUrl;

        info.appendChild(titulo);
        info.appendChild(artista);
        info.appendChild(audio);

        const btnCerrar = document.createElement('button');
        btnCerrar.type = 'button';
        btnCerrar.className = 'mp-cerrar';
        btnCerrar.textContent = '✕';
        btnCerrar.setAttribute('aria-label', 'Cerrar reproductor');
        btnCerrar.addEventListener('click', quitarReproductor);

        contenedor.appendChild(info);
        contenedor.appendChild(btnCerrar);
        document.body.appendChild(contenedor);

        // Si el navegador bloquea el autoplay, el control nativo sigue visible
        // para que el usuario pulse play.
        const intento = audio.play();
        if (intento && typeof intento.catch === 'function') {
            intento.catch(function () {
                console.info('[MusicPlayer] Autoplay bloqueado: el usuario debe pulsar play');
            });
        }
    }

    window.addEventListener('marquinhos-musica', function (evento) {
        if (evento && evento.detail) {
            mostrarReproductor(evento.detail);
        }
    });

    console.log('✅ Reproductor de música de Marquinhos listo (v2.0).');
})();