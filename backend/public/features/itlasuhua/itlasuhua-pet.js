// ================================================================
// ITLASUHUA · PET · SVG v3.0
// ================================================================
// Rey Itlasuhua, serpiente cósmica chibi.
// v3.0: estilo fiel a la referencia, brillo, boca animada,
//       polvo arcoíris, alas suspendidas, cola en movimiento.
// ================================================================

(function (window) {
    'use strict';

    if (window.__itlasuhuaPetLoaded) return;
    window.__itlasuhuaPetLoaded = true;

    const POS_KEY = 'itlasuhua_posicion';
    const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const svgString = `
    <svg
        id="itlasuhua-svg"
        class="itlasuhua-svg"
        viewBox="0 0 600 600"
        xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Rey Itlasuhua, serpiente cósmica"
    >
        <defs>
            <linearGradient id="itla-feather-teal" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#0A6B82"/>
                <stop offset="35%" stop-color="#00AEB5"/>
                <stop offset="65%" stop-color="#43E6D6"/>
                <stop offset="100%" stop-color="#C2FFF4"/>
            </linearGradient>

            <linearGradient id="itla-feather-blue" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#152B77"/>
                <stop offset="35%" stop-color="#126F9E"/>
                <stop offset="65%" stop-color="#21C8D1"/>
                <stop offset="100%" stop-color="#8CF5EA"/>
            </linearGradient>

            <linearGradient id="itla-feather-gold" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#B9741F"/>
                <stop offset="38%" stop-color="#FFD76D"/>
                <stop offset="70%" stop-color="#FFF0A5"/>
                <stop offset="100%" stop-color="#FFE28A"/>
            </linearGradient>

            <linearGradient id="itla-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FFF3B0"/>
                <stop offset="25%" stop-color="#FFD45A"/>
                <stop offset="55%" stop-color="#E5A72E"/>
                <stop offset="80%" stop-color="#FFF09A"/>
                <stop offset="100%" stop-color="#9D641D"/>
            </linearGradient>

            <linearGradient id="itla-wing-galaxy" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#1B1F5C"/>
                <stop offset="40%" stop-color="#4A2D8A"/>
                <stop offset="70%" stop-color="#1F7FA8"/>
                <stop offset="100%" stop-color="#3FE0D2"/>
            </linearGradient>

            <linearGradient id="itla-galaxy" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#11183F"/>
                <stop offset="22%" stop-color="#29266A"/>
                <stop offset="42%" stop-color="#46317E"/>
                <stop offset="62%" stop-color="#164B76"/>
                <stop offset="80%" stop-color="#0D7F8D"/>
                <stop offset="100%" stop-color="#171A4A"/>
            </linearGradient>

            <linearGradient id="itla-belly" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FFF0C4"/>
                <stop offset="50%" stop-color="#E9C98E"/>
                <stop offset="100%" stop-color="#B88A55"/>
            </linearGradient>

            <radialGradient id="itla-face" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stop-color="#FFF8E3"/>
                <stop offset="60%" stop-color="#F1DFB4"/>
                <stop offset="100%" stop-color="#C9A97A"/>
            </radialGradient>

            <radialGradient id="itla-eye-cyan">
                <stop offset="0%" stop-color="#FFFFFF"/>
                <stop offset="18%" stop-color="#B5FFFF"/>
                <stop offset="45%" stop-color="#2EE8DF"/>
                <stop offset="78%" stop-color="#1368A8"/>
                <stop offset="100%" stop-color="#081A49"/>
            </radialGradient>

            <radialGradient id="itla-eye-gold">
                <stop offset="0%" stop-color="#FFFFFF"/>
                <stop offset="18%" stop-color="#FFF8B0"/>
                <stop offset="48%" stop-color="#FFD52D"/>
                <stop offset="80%" stop-color="#E67D16"/>
                <stop offset="100%" stop-color="#5B2A19"/>
            </radialGradient>

            <radialGradient id="itla-aura">
                <stop offset="0%" stop-color="#3CFFE8" stop-opacity=".55"/>
                <stop offset="45%" stop-color="#7A4BFF" stop-opacity=".25"/>
                <stop offset="100%" stop-color="#7A4BFF" stop-opacity="0"/>
            </radialGradient>

            <filter id="itla-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="4" result="blur"/>
                <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>

            <filter id="itla-glow-strong" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="9" result="blur"/>
                <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>

            <filter id="itla-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000000" flood-opacity=".5"/>
            </filter>

            <pattern id="itla-stars" width="60" height="60" patternUnits="userSpaceOnUse">
                <circle cx="8" cy="12" r="1.5" fill="#FFFFFF"/>
                <circle cx="33" cy="27" r="1.1" fill="#8FFAFF"/>
                <circle cx="48" cy="8" r="1.4" fill="#FFD95A"/>
                <circle cx="18" cy="44" r="1.2" fill="#FFFFFF"/>
                <circle cx="46" cy="50" r="1.5" fill="#73EFFF"/>
            </pattern>

            <path id="itla-pluma" d="M0 0 C-26 -36 -28 -100 0 -160 C28 -100 26 -36 0 0Z"/>

            <g id="itla-ala-base">
                <path d="M240 292 C190 232 120 186 62 176 C112 214 170 252 240 306Z" fill="url(#itla-feather-teal)" stroke="#6FFFF2" stroke-width="3"/>
                <path d="M248 296 C214 246 180 210 146 196 C172 232 200 262 252 306Z" fill="url(#itla-feather-blue)" stroke="#6FFFF2" stroke-width="3"/>
                <path d="M236 300 C180 268 120 248 58 240 C110 268 166 290 238 314Z" fill="url(#itla-feather-gold)" stroke="#FFE99B" stroke-width="3"/>
                <path d="M236 308 C180 300 120 300 66 306 C120 320 170 328 236 322Z" fill="url(#itla-wing-galaxy)" stroke="#7AFFF1" stroke-width="3"/>
                <path d="M240 316 C190 332 136 352 96 380 C146 370 190 354 238 330Z" fill="url(#itla-feather-blue)" stroke="#74FFF4" stroke-width="3"/>
                <path d="M244 324 C212 354 176 388 140 414 C180 406 214 370 242 336Z" fill="url(#itla-feather-gold)" stroke="#FFE99B" stroke-width="3"/>
                <path d="M248 330 C226 366 206 396 186 430 C214 418 236 380 252 340Z" fill="url(#itla-feather-teal)" stroke="#6FFFF2" stroke-width="3"/>
                <path d="M222 300 C180 280 130 270 92 268" fill="none" stroke="#FFE9A0" stroke-width="2" opacity=".7"/>
                <path d="M224 316 C180 316 136 332 110 352" fill="none" stroke="#7FFFF0" stroke-width="2" opacity=".6"/>
            </g>
        </defs>

        <g id="itlasuhua-scene">
            <animateTransform attributeName="transform" type="translate" values="0 0; 0 -10; 0 0" dur="3.2s" repeatCount="indefinite"/>

            <ellipse id="itla-aura" cx="300" cy="330" rx="285" ry="255" fill="url(#itla-aura)"/>

            <g id="itla-background-stars">
                <circle cx="76" cy="190" r="3" fill="#62FFF1" filter="url(#itla-glow)"/>
                <circle cx="107" cy="105" r="2" fill="#FFD965"/>
                <circle cx="145" cy="65" r="3" fill="#FFFFFF"/>
                <circle cx="457" cy="84" r="2" fill="#FFD95C"/>
                <circle cx="510" cy="156" r="3" fill="#5DFFF5" filter="url(#itla-glow)"/>
                <circle cx="550" cy="270" r="2" fill="#FFFFFF"/>
                <circle cx="72" cy="390" r="2" fill="#FFD35C"/>
                <circle cx="105" cy="465" r="3" fill="#56F7ED"/>
                <circle cx="495" cy="455" r="3" fill="#FFD64F"/>
                <circle cx="535" cy="380" r="2" fill="#FFFFFF"/>
                <path d="M95 250 l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#FFF7A5" filter="url(#itla-glow)"/>
                <path d="M507 345 l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#65FFF4" filter="url(#itla-glow)"/>
                <path d="M137 425 l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#FFD95D"/>
                <path d="M466 235 l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#FFFFFF"/>
            </g>

            <g id="itla-wings">
                <g id="ala-izq">
                    <animateTransform attributeName="transform" type="rotate" values="0 240 300; -5 240 300; 0 240 300" dur="2.6s" repeatCount="indefinite"/>
                    <use href="#itla-ala-base" xlink:href="#itla-ala-base"/>
                </g>
                <g id="ala-der">
                    <animateTransform attributeName="transform" type="rotate" values="0 360 300; 5 360 300; 0 360 300" dur="2.6s" repeatCount="indefinite"/>
                    <use href="#itla-ala-base" xlink:href="#itla-ala-base" transform="translate(600 0) scale(-1 1)"/>
                </g>
            </g>

            <g id="itla-cola">
                <animateTransform attributeName="transform" type="rotate" values="-3 320 520; 3 320 520; -3 320 520" dur="3.6s" repeatCount="indefinite"/>
                <path d="M250 470 C170 470 140 530 196 566 C260 604 436 586 448 520 C456 470 388 452 344 480" fill="none" stroke="#0B1638" stroke-width="72" stroke-linecap="round"/>
                <path d="M250 470 C170 470 140 530 196 566 C260 604 436 586 448 520 C456 470 388 452 344 480" fill="none" stroke="url(#itla-galaxy)" stroke-width="62" stroke-linecap="round"/>
                <path d="M250 470 C170 470 140 530 196 566 C260 604 436 586 448 520 C456 470 388 452 344 480" fill="none" stroke="url(#itla-stars)" stroke-width="54" stroke-linecap="round" opacity=".85"/>
                <path d="M250 470 C170 470 140 530 196 566 C260 604 436 586 448 520 C456 470 388 452 344 480" fill="none" stroke="#E8C98A" stroke-width="5" stroke-dasharray="10 14" opacity=".55"/>
                <path d="M250 470 C170 470 140 530 196 566 C260 604 436 586 448 520 C456 470 388 452 344 480" fill="none" stroke="#3CF0E2" stroke-width="3" opacity=".8" filter="url(#itla-glow)"/>
            </g>

            <path d="M264 368 C260 410 262 440 270 478 L330 478 C338 440 340 410 336 368Z" fill="url(#itla-belly)" stroke="#8A6A3E" stroke-width="3"/>
            <g fill="none" stroke="#A8844E" stroke-width="3" stroke-linecap="round">
                <path d="M262 392 Q300 402 338 392"/>
                <path d="M264 414 Q300 424 337 414"/>
                <path d="M266 436 Q300 446 335 436"/>
                <path d="M268 458 Q300 468 333 458"/>
            </g>

            <g id="itla-penacho" filter="url(#itla-shadow)">
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(204 300) rotate(-112) scale(.6)" fill="url(#itla-feather-gold)" stroke="#FFE79A" stroke-width="3"/>
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(396 300) rotate(112) scale(.6)" fill="url(#itla-feather-gold)" stroke="#FFE79A" stroke-width="3"/>
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(300 230) rotate(-80) scale(.8)" fill="url(#itla-feather-teal)" stroke="#6FFFF2" stroke-width="3"/>
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(300 230) rotate(-58) scale(.95)" fill="url(#itla-feather-gold)" stroke="#FFE99B" stroke-width="3"/>
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(300 230) rotate(-36) scale(1)" fill="url(#itla-feather-blue)" stroke="#74FFF4" stroke-width="3"/>
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(300 230) rotate(-15) scale(1.08)" fill="url(#itla-feather-teal)" stroke="#6FFFF2" stroke-width="3"/>
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(300 230) rotate(0) scale(1.15)" fill="url(#itla-feather-gold)" stroke="#FFE99B" stroke-width="3"/>
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(300 230) rotate(15) scale(1.08)" fill="url(#itla-feather-teal)" stroke="#6FFFF2" stroke-width="3"/>
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(300 230) rotate(36) scale(1)" fill="url(#itla-feather-blue)" stroke="#74FFF4" stroke-width="3"/>
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(300 230) rotate(58) scale(.95)" fill="url(#itla-feather-gold)" stroke="#FFE99B" stroke-width="3"/>
                <use href="#itla-pluma" xlink:href="#itla-pluma" transform="translate(300 230) rotate(80) scale(.8)" fill="url(#itla-feather-teal)" stroke="#6FFFF2" stroke-width="3"/>
            </g>

            <g id="itla-cabeza" filter="url(#itla-shadow)">
                <ellipse cx="300" cy="280" rx="112" ry="104" fill="url(#itla-face)" stroke="#2B2038" stroke-width="5"/>

                <ellipse cx="224" cy="334" rx="15" ry="8" fill="#FF8FA3" opacity=".6"/>
                <ellipse cx="376" cy="334" rx="15" ry="8" fill="#FF8FA3" opacity=".6"/>

                <g id="itla-ojo-izq" class="itla-ojo">
                    <ellipse cx="250" cy="296" rx="40" ry="46" fill="#0B1436" stroke="#151026" stroke-width="5"/>
                    <ellipse cx="250" cy="296" rx="34" ry="41" fill="url(#itla-eye-cyan)" filter="url(#itla-glow)"/>
                    <circle cx="238" cy="282" r="2.5" fill="#FFFFFF"/>
                    <circle cx="262" cy="312" r="2" fill="#FFF6A0"/>
                    <circle cx="244" cy="318" r="1.8" fill="#FFFFFF"/>
                    <circle cx="262" cy="276" r="1.5" fill="#FFFFFF"/>
                    <ellipse cx="240" cy="280" rx="8" ry="11" fill="#FFFFFF" opacity=".95"/>
                    <circle cx="260" cy="314" r="4" fill="#FFFFFF" opacity=".8"/>
                </g>

                <g id="itla-ojo-der" class="itla-ojo">
                    <ellipse cx="350" cy="296" rx="40" ry="46" fill="#291A1A" stroke="#151026" stroke-width="5"/>
                    <ellipse cx="350" cy="296" rx="34" ry="41" fill="url(#itla-eye-gold)" filter="url(#itla-glow)"/>
                    <circle cx="338" cy="282" r="2.5" fill="#FFFFFF"/>
                    <circle cx="362" cy="312" r="2" fill="#FFF6A0"/>
                    <circle cx="344" cy="318" r="1.8" fill="#FFFFFF"/>
                    <circle cx="362" cy="276" r="1.5" fill="#FFFFFF"/>
                    <ellipse cx="340" cy="280" rx="8" ry="11" fill="#FFFFFF" opacity=".95"/>
                    <circle cx="360" cy="314" r="4" fill="#FFFFFF" opacity=".8"/>
                </g>

                <path d="M294 322 Q300 327 306 322" fill="none" stroke="#6B4E36" stroke-width="3" stroke-linecap="round"/>

                <path id="itla-sonrisa" d="M280 342 Q300 360 320 342" fill="none" stroke="#3A2030" stroke-width="4.5" stroke-linecap="round"/>
                <g id="itla-boca-abierta">
                    <ellipse cx="300" cy="352" rx="13" ry="10" fill="#4A1A34" stroke="#2B1020" stroke-width="3"/>
                    <ellipse cx="300" cy="357" rx="8" ry="4" fill="#FF7A9A"/>
                </g>
            </g>

            <g id="itla-corona" filter="url(#itla-shadow)">
                <path d="M194 230 L194 200 L212 200 L212 184 L232 184 L232 168 L268 168 L268 140 L300 112 L332 140 L332 168 L368 168 L368 184 L388 184 L388 200 L406 200 L406 230 Q300 246 194 230Z" fill="url(#itla-gold)" stroke="#6D421B" stroke-width="5"/>
                <path d="M204 206 Q300 222 396 206" fill="none" stroke="#FFF1A0" stroke-width="2" opacity=".7"/>
                <circle cx="212" cy="214" r="10" fill="#16D7D0" stroke="#6D421B" stroke-width="4" class="itla-gema"/>
                <circle cx="250" cy="200" r="9" fill="#FFD83D" stroke="#6D421B" stroke-width="4"/>
                <circle cx="300" cy="190" r="14" fill="#1BD8D2" stroke="#6D421B" stroke-width="5" filter="url(#itla-glow)" class="itla-gema"/>
                <circle cx="350" cy="200" r="9" fill="#FFD83D" stroke="#6D421B" stroke-width="4"/>
                <circle cx="388" cy="214" r="10" fill="#16D7D0" stroke="#6D421B" stroke-width="4" class="itla-gema"/>
                <circle cx="300" cy="190" r="5" fill="#BFFFF8"/>
                <path d="M286 168 L286 130 L300 112 L314 130 L314 168Z" fill="url(#itla-gold)" stroke="#6D421B" stroke-width="4"/>
                <circle cx="300" cy="148" r="6" fill="#1BD8D2" stroke="#6D421B" stroke-width="3"/>
            </g>

            <g id="itla-sparkles">
                <path d="M164 280 l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#FFF7A1" filter="url(#itla-glow)"/>
                <path d="M436 280 l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#62FFF3" filter="url(#itla-glow)"/>
                <path d="M150 380 l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#FFD65C"/>
                <path d="M450 380 l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#FFFFFF"/>
                <circle cx="186" cy="410" r="3" fill="#4EFFF1"/>
                <circle cx="414" cy="410" r="3" fill="#FFD94F"/>
            </g>
        </g>
    </svg>
    `;

    function log(msg) {
        console.log('[Itlasuhua/Pet]', msg);
    }

    // ============================================================
    // POLVO ARCOÍRIS
    // ============================================================
    let dustLayer = null;
    let idleTimer = null;

    function spit(cantidad, fuerza) {
        const container = document.getElementById('itlasuhua-container');
        if (!container) return;

        cantidad = cantidad || 10;
        fuerza = fuerza || 1;

        if (!dustLayer || !dustLayer.isConnected) {
            dustLayer = document.createElement('div');
            dustLayer.className = 'itla-dust-layer';
            container.appendChild(dustLayer);
        }

        for (let i = 0; i < cantidad; i++) {
            const p = document.createElement('span');
            p.className = 'itla-dust';
            const hue = Math.floor(Math.random() * 360);
            const size = 5 + Math.random() * 7;
            const dx = (Math.random() * 2 - 1) * (60 + 50 * fuerza);
            const dy = 50 + Math.random() * (90 + 70 * fuerza);
            const dur = 1.0 + Math.random() * 0.8;

            p.style.setProperty('--h', hue);
            p.style.setProperty('--s', size + 'px');
            p.style.setProperty('--dx', dx + 'px');
            p.style.setProperty('--dy', dy + 'px');
            p.style.setProperty('--t', dur + 's');

            p.addEventListener('animationend', () => p.remove());
            dustLayer.appendChild(p);
        }
    }

    function scheduleIdleSpit() {
        clearTimeout(idleTimer);
        if (reduceMotion) return;
        idleTimer = setTimeout(() => {
            if (!document.hidden) spit(4, 0.6);
            scheduleIdleSpit();
        }, 3500 + Math.random() * 4000);
    }

    // ============================================================
    // RENDER
    // ============================================================
    const render = (containerId) => {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`[Itlasuhua] Contenedor "${containerId}" no encontrado.`);
            return;
        }

        container.innerHTML = svgString;
        container.classList.add('itlasuhua-rendered');

        document.dispatchEvent(
            new CustomEvent('itlasuhua:rendered', { detail: { containerId } })
        );

        log('✅ SVG renderizado en #' + containerId);
    };

    const getSVG = () => document.getElementById('itlasuhua-svg');

    const getWings = () => document.querySelectorAll(
        '#itlasuhua-svg #ala-izq, #itlasuhua-svg #ala-der'
    );

    // ============================================================
    // PERSISTENCIA DE POSICIÓN
    // ============================================================
    function guardarPosicion(x, y) {
        try {
            localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
        } catch (e) {}
    }

    function cargarPosicion() {
        try {
            const raw = localStorage.getItem(POS_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (data && data.x != null && data.y != null) return data;
        } catch (e) {}
        return null;
    }

    // ============================================================
    // WIDGET + DRAG
    // ============================================================
    const crearWidget = () => {
        if (document.getElementById('itlasuhua-container')) return;

        const cont = document.createElement('div');
        cont.id = 'itlasuhua-container';
        document.body.appendChild(cont);

        const posGuardada = cargarPosicion();
        if (posGuardada) {
            const ancho = cont.offsetWidth || 300;
            const alto = cont.offsetHeight || 300;
            const maxX = window.innerWidth - ancho;
            const maxY = window.innerHeight - alto;
            const x = Math.max(0, Math.min(maxX, posGuardada.x));
            const y = Math.max(0, Math.min(maxY, posGuardada.y));
            cont.style.left = x + 'px';
            cont.style.top = y + 'px';
            cont.style.right = 'auto';
            cont.style.bottom = 'auto';
        }

        render('itlasuhua-container');

        let isDragging = false;
        let hasMoved = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let posStartX = 0;
        let posStartY = 0;

        cont.addEventListener('pointerdown', function (e) {
            isDragging = true;
            hasMoved = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            try {
                const rect = cont.getBoundingClientRect();
                posStartX = rect.left;
                posStartY = rect.top;
            } catch (err) {
                posStartX = 0;
                posStartY = 0;
            }

            try { cont.setPointerCapture(e.pointerId); } catch (err) {}
            cont.classList.add('itlasuhua-dragging');
        });

        cont.addEventListener('pointermove', function (e) {
            if (!isDragging) return;

            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;

            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                hasMoved = true;
            }
            if (!hasMoved) return;

            let newX = posStartX + dx;
            let newY = posStartY + dy;

            const ancho = cont.offsetWidth || 300;
            const alto = cont.offsetHeight || 300;
            const maxX = window.innerWidth - ancho;
            const maxY = window.innerHeight - alto;

            newX = Math.max(0, Math.min(maxX, newX));
            newY = Math.max(0, Math.min(maxY, newY));

            cont.style.left = newX + 'px';
            cont.style.top = newY + 'px';
            cont.style.right = 'auto';
            cont.style.bottom = 'auto';
        });

        cont.addEventListener('pointerup', function (e) {
            if (!isDragging) return;
            isDragging = false;
            cont.classList.remove('itlasuhua-dragging');

            try { cont.releasePointerCapture(e.pointerId); } catch (err) {}

            if (hasMoved) {
                try {
                    const rect = cont.getBoundingClientRect();
                    guardarPosicion(rect.left, rect.top);
                    log('📍 Posición guardada');
                } catch (err) {}
            } else {
                // Un toque sin arrastrar: la mascota suelta un estallido de polvo
                spit(14, 1.2);
            }
        });

        cont.addEventListener('pointercancel', function () {
            isDragging = false;
            cont.classList.remove('itlasuhua-dragging');
        });

        scheduleIdleSpit();
        log('✅ Widget Itlasuhua creado · arrastrable');
    };

    window.ItlasuhuaPet = {
        render,
        getSVG,
        getWings,
        crearWidget,
        guardarPosicion,
        cargarPosicion,
        spit,
        _svgString: svgString
    };

    log('✅ Itlasuhua Pet cargado');

})(window);