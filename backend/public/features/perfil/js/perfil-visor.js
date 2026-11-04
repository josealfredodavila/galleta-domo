// ================================================================
// PERFIL · FOTO DE PERFIL A PANTALLA COMPLETA
// ================================================================
// v1 Tocar la foto abre el visor a pantalla completa.
//    Tocar el lápiz (o el avatar sin foto) sigue abriendo el menú.
// ================================================================

(function () {
    'use strict';

    var OVERLAY_ID = 'avatarVisorFull';

    function inyectarEstilos() {
        if (document.getElementById('avatarVisorFull-style')) return;

        var style = document.createElement('style');
        style.id = 'avatarVisorFull-style';
        style.textContent = `
            #avatarVisorFull {
                position: fixed;
                inset: 0;
                width: 100vw;
                height: 100vh;
                height: 100dvh;
                background: #000;
                z-index: 100000;
                display: none;
                align-items: center;
                justify-content: center;
                touch-action: none;
            }
            #avatarVisorFull.show { display: flex; }
            #avatarVisorFull img {
                width: 100vw;
                height: 100vh;
                height: 100dvh;
                object-fit: contain;
                display: block;
                user-select: none;
                -webkit-user-drag: none;
            }
            #avatarVisorFull .av-cerrar {
                position: absolute;
                top: calc(12px + env(safe-area-inset-top, 0px));
                right: 12px;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 0;
                background: rgba(0, 0, 0, 0.55);
                color: #fff;
                font-size: 24px;
                line-height: 1;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }

    function crearOverlay() {
        var overlay = document.getElementById(OVERLAY_ID);
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Foto de perfil');

        var img = document.createElement('img');
        img.alt = 'Foto de perfil';

        var cerrar = document.createElement('button');
        cerrar.type = 'button';
        cerrar.className = 'av-cerrar';
        cerrar.setAttribute('aria-label', 'Cerrar');
        cerrar.textContent = '×';

        overlay.appendChild(img);
        overlay.appendChild(cerrar);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', cerrarVisor);
        cerrar.addEventListener('click', function (e) {
            e.stopPropagation();
            cerrarVisor();
        });

        return overlay;
    }

    function abrirVisor(src) {
        if (!src) return;
        inyectarEstilos();

        var overlay = crearOverlay();
        overlay.querySelector('img').src = src;
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function cerrarVisor() {
        var overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) return;

        overlay.classList.remove('show');
        overlay.querySelector('img').removeAttribute('src');
        document.body.style.overflow = '';
    }

    // Captura en fase de captura: se ejecuta antes que el menú y que
    // el onclick inline de la imagen, así que el menú no se abre.
    document.addEventListener('click', function (e) {
        var target = e.target;
        if (!target || !target.closest) return;

        var img = target.closest('#perfilAvatar img');
        if (!img) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        abrirVisor(img.currentSrc || img.src);
    }, true);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') cerrarVisor();
    });

    window.cerrarAvatarVisor = cerrarVisor;
})();