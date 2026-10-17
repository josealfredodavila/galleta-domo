// ================================================================
// PERFIL · VISOR DE MULTIMEDIA (Fotos y Videos)
// ================================================================
// Maneja el modal a pantalla completa, botón de descarga y swipe táctil.
// v3.1 (Soporte para Autoplay configurable por el usuario)
// ================================================================

(function() {
    'use strict';

    let indiceActual = 0;
    let startY = 0;
    let endY = 0;

    // 1. Inyectar los estilos del visor en el HEAD
    const style = document.createElement('style');
    style.innerHTML = `
        #visorMediaModal {
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0, 0, 0, 0.92); backdrop-filter: blur(5px);
            display: none; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.25s ease;
            overflow: hidden;
        }
        #visorMediaModal.show { display: flex; opacity: 1; }
        
        #visorMediaContenido {
            max-width: 95vw; max-height: 90vh; object-fit: contain;
            border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
            transition: transform 0.2s ease-out;
        }

        #visorVideoContenido {
            max-width: 95vw; max-height: 90vh; border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 10;
        }

        .btn-cerrar-visor {
            position: absolute; top: 20px; right: 20px;
            background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2);
            color: white; width: 40px; height: 40px; border-radius: 50%;
            font-size: 24px; display: flex; align-items: center; justify-content: center;
            cursor: pointer; z-index: 100000; transition: background 0.2s;
        }
        .btn-cerrar-visor:hover { background: rgba(255,255,255,0.2); }
        
        .btn-descarga-visormodal {
            position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: rgba(20, 20, 20, 0.85); color: #ccff00; 
            border: 1px solid #ccff00; border-radius: 30px; padding: 10px 24px;
            font-size: 0.9rem; font-weight: bold; cursor: pointer;
            display: flex; align-items: center; gap: 8px;
            backdrop-filter: blur(10px); transition: all 0.2s ease;
            z-index: 100000; box-shadow: 0 4px 15px rgba(204, 255, 0, 0.2);
        }
        .btn-descarga-visormodal:hover {
            background: #ccff00; color: #000; transform: translateX(-50%) scale(1.05);
        }
    `;
    document.head.appendChild(style);

    // 2. Inyectar el HTML del visor en el BODY (Sin flechas)
    const modalHTML = `
        <div id="visorMediaModal">
            <button class="btn-cerrar-visor" onclick="window.cerrarVisorModal()">×</button>
            <img id="visorMediaContenido" src="" alt="Visor" style="display:none;" />
            <video id="visorVideoContenido" src="" controls playsinline style="display:none;"></video>
            
            <button id="btnDescargarVisor" class="btn-descarga-visormodal" style="display:none;">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Descargar
            </button>
        </div>
    `;

    function initVisor() {
        if (document.getElementById('visorMediaModal')) return;
        const div = document.createElement('div');
        div.innerHTML = modalHTML;
        document.body.appendChild(div.firstElementChild);

        const modal = document.getElementById('visorMediaModal');
        
        modal.addEventListener('click', function(e) {
            if (e.target === this) window.cerrarVisorModal();
        });

        // Lógica de Swipe (sin flechas)
        modal.addEventListener('touchstart', function(e) {
            startY = e.changedTouches[0].screenY;
        }, { passive: true });

        modal.addEventListener('touchend', function(e) {
            endY = e.changedTouches[0].screenY;
            procesarSwipe();
        }, { passive: true });
        
        modal.addEventListener('mousedown', function(e) {
            startY = e.screenY;
        });
        modal.addEventListener('mouseup', function(e) {
            endY = e.screenY;
            procesarSwipe();
        });
    }

    function procesarSwipe() {
        const distancia = startY - endY;
        const minimoDesliz = 40;

        if (Math.abs(distancia) < minimoDesliz) return;

        if (distancia > 0) {
            cambiarMultimedia(1); // Arriba -> Siguiente
        } else {
            cambiarMultimedia(-1); // Abajo -> Anterior
        }
    }

    function actualizarVisor() {
        const lista = window.listaMultimediaPerfil || [];
        if (lista.length === 0) return;

        const item = lista[indiceActual];
        const img = document.getElementById('visorMediaContenido');
        const video = document.getElementById('visorVideoContenido');
        const btnDescarga = document.getElementById('btnDescargarVisor');

        img.style.display = 'none';
        video.style.display = 'none';
        video.pause(); 
        video.src = ''; 

        if (item.tipo === 'video') {
            video.src = item.url;
            video.style.display = 'block';
            
            // Leer la preferencia del usuario
            const autoPlayPref = localStorage.getItem('contenido_auto_reproducir');
            const activarAutoplay = autoPlayPref === null || autoPlayPref === 'true'; // Por defecto true

            if (activarAutoplay) {
                video.loop = true;
                video.autoplay = true;
                // Intentar reproducir (algunos navegadores bloquean autoplay con sonido)
                video.play().catch(e => console.log('Autoplay bloqueado por el navegador:', e));
            } else {
                video.loop = false;
                video.autoplay = false;
            }

        } else {
            img.src = item.url;
            img.style.display = 'block';
        }

        if (item.permiteDescarga) {
            btnDescarga.style.display = 'flex';
            const newBtn = btnDescarga.cloneNode(true);
            btnDescarga.parentNode.replaceChild(newBtn, btnDescarga);
            
            newBtn.addEventListener('click', function() {
                if (typeof window.descargarArchivoForzado === 'function') {
                    window.descargarArchivoForzado(item.url);
                }
            });
        } else {
            btnDescarga.style.display = 'none';
        }
    }

    function cambiarMultimedia(direccion) {
        const lista = window.listaMultimediaPerfil || [];
        const nuevoIndice = indiceActual + direccion;

        if (nuevoIndice >= 0 && nuevoIndice < lista.length) {
            indiceActual = nuevoIndice;
            actualizarVisor();
        }
    }

    window.expandirFotoPublicacion = function(index) {
        initVisor();
        indiceActual = index;
        
        const modal = document.getElementById('visorMediaModal');
        actualizarVisor();
        
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    };

    window.cerrarVisorModal = function() {
        const modal = document.getElementById('visorMediaModal');
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
            
            const video = document.getElementById('visorVideoContenido');
            if (video) { video.pause(); video.src = ''; }
            
            setTimeout(() => {
                const img = document.getElementById('visorMediaContenido');
                if (img) img.src = '';
            }, 300);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVisor);
    } else {
        initVisor();
    }
})();