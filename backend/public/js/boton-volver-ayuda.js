/* ============================================================
   INYECTOR DE BOTÓN "VOLVER AL CENTRO DE AYUDA"
   Ubicación: backend/public/js/boton-volver-ayuda.js
   ============================================================ */
(function () {
    'use strict';

    // Evitar inyección doble
    if (document.getElementById('btn-volver-centro-ayuda-global')) return;

    // No inyectar si ya estamos en el centro de ayuda o en el perfil
    if (window.location.pathname.includes('/centro-ayuda/')) return;

    const css = `
        #btn-volver-centro-ayuda-global {
            position: fixed;
            top: 16px;
            left: 16px;
            z-index: 99999;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(13, 17, 23, 0.85);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(0, 229, 255, 0.3);
            color: #00E5FF;
            padding: 10px 18px;
            border-radius: 40px;
            font-family: 'Inter', -apple-system, sans-serif;
            font-size: 0.85rem;
            font-weight: 600;
            text-decoration: none;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            transition: all 0.3s ease;
            opacity: 0;
            transform: translateY(-10px);
            animation: fadeInDownAyuda 0.4s ease forwards;
        }
        #btn-volver-centro-ayuda-global:hover {
            background: rgba(0, 229, 255, 0.1);
            border-color: #00E5FF;
            color: #FFF;
            transform: translateY(0) scale(1.02);
            box-shadow: 0 0 25px rgba(0, 229, 255, 0.3);
        }
        #btn-volver-centro-ayuda-global svg {
            width: 16px;
            height: 16px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        @keyframes fadeInDownAyuda {
            to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 600px) {
            #btn-volver-centro-ayuda-global {
                top: auto;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(10px);
                animation: fadeInUpAyuda 0.4s ease forwards;
                background: rgba(13, 17, 23, 0.95);
                padding: 12px 24px;
            }
            @keyframes fadeInUpAyuda {
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
        }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const btn = document.createElement('a');
    btn.id = 'btn-volver-centro-ayuda-global';
    btn.href = '/features/centro-ayuda/index.html';
    btn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Volver al Centro de Ayuda
    `;

    // Insertar al principio del body para que los lectores de pantalla lo lean primero
    document.body.insertBefore(btn, document.body.firstChild);
})();