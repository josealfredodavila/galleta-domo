// ================================================================
// PERFIL · VISOR DE MULTIMEDIA (Fotos y Videos)
// ================================================================
// Maneja el modal a pantalla completa y el botón de descarga.
// ================================================================

(function() {
    'use strict';

    // 1. Inyectar los estilos del visor en el HEAD
    const style = document.createElement('style');
    style.innerHTML = `
        #visorMediaModal {
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0, 0, 0, 0.92); backdrop-filter: blur(5px);
            display: none; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.25s ease;
        }
        #visorMediaModal.show { display: flex; opacity: 1; }
        #visorMediaContenido {
            max-width: 95vw; max-height: 90vh; object-fit: contain;
            border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
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
            background: rgba(20, 20, 20, 0.85); color: #ccff00; /* Verde neón Csariel */
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

    // 2. Inyectar el HTML del visor en el BODY
    const modalHTML = `
        <div id="visorMediaModal">
            <button class="btn-cerrar-visor" onclick="window.cerrarVisorModal()">×</button>
            <img id="visorMediaContenido" src="" alt="Visor" />
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

        document.getElementById('visorMediaModal').addEventListener('click', function(e) {
            if (e.target === this) window.cerrarVisorModal();
        });
    }

    // 3. Función Global para abrir el visor (la llama perfil-publicaciones.js)
    window.expandirFotoPublicacion = function(url, postId, permiteDescarga) {
        initVisor();
        
        const modal = document.getElementById('visorMediaModal');
        const img = document.getElementById('visorMediaContenido');
        const btnDescarga = document.getElementById('btnDescargarVisor');

        img.src = url;
        
        if (permiteDescarga) {
            btnDescarga.style.display = 'flex';
            // Clonamos para limpiar eventos viejos
            const newBtn = btnDescarga.cloneNode(true);
            btnDescarga.parentNode.replaceChild(newBtn, btnDescarga);
            
            newBtn.addEventListener('click', function() {
                if (typeof window.descargarArchivoForzado === 'function') {
                    window.descargarArchivoForzado(url);
                }
            });
        } else {
            btnDescarga.style.display = 'none';
        }

        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    };

    // 4. Función Global para cerrar
    window.cerrarVisorModal = function() {
        const modal = document.getElementById('visorMediaModal');
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
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