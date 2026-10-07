// ================================================================
// ITLASUHUA · PET · SVG v4.0
// ================================================================
// REY ITLASUHUA · SERPIENTE CÓSMICA
//
// v4.0
// - ViewBox oficial: 0 0 300 300
// - Render oficial: 140x140
// - Centro: 150,150
// - Cuerpo en 3 vueltas
// - Alas simétricas
// - Ojos galaxia
// - Corona de Rey
// - Penacho de 11 plumas
// - Glow cyan
// - Escamas cósmicas
// - Animaciones oficiales
// - Arrastre + posición persistente
// - Polvo arcoíris conservado
// ================================================================

(function (window) {
    'use strict';

    if (window.__itlasuhuaPetLoaded) return;
    window.__itlasuhuaPetLoaded = true;

    const POS_KEY = 'itlasuhua_posicion';

    const reduceMotion = !!(
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    // ============================================================
    // SVG OFICIAL
    // ============================================================

    const svgString = `
    <svg
        id="itlasuhua-svg"
        class="itlasuhua-svg"
        viewBox="0 0 300 300"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Rey Itlasuhua, serpiente cósmica"
    >

        <defs>

            <!-- ==================================================
                 CUERPO / GALAXIA
            ================================================== -->

            <linearGradient
                id="itla-body-galaxy"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
            >
                <stop offset="0%" stop-color="#1A1033"/>
                <stop offset="42%" stop-color="#2D1B69"/>
                <stop offset="70%" stop-color="#17102F"/>
                <stop offset="100%" stop-color="#1A1033"/>
            </linearGradient>

            <linearGradient
                id="itla-belly"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
            >
                <stop offset="0%" stop-color="#FDE6A8"/>
                <stop offset="65%" stop-color="#F0D48D"/>
                <stop offset="100%" stop-color="#E8C87A"/>
            </linearGradient>

            <!-- ==================================================
                 PLUMAS TURQUESA
            ================================================== -->

            <linearGradient
                id="itla-feather-teal"
                x1="0%"
                y1="100%"
                x2="100%"
                y2="0%"
            >
                <stop offset="0%" stop-color="#0F8A82"/>
                <stop offset="50%" stop-color="#14B8A6"/>
                <stop offset="100%" stop-color="#5EE9D5"/>
            </linearGradient>

            <linearGradient
                id="itla-feather-gold"
                x1="0%"
                y1="100%"
                x2="100%"
                y2="0%"
            >
                <stop offset="0%" stop-color="#D4AF37"/>
                <stop offset="55%" stop-color="#FFD700"/>
                <stop offset="100%" stop-color="#FFF1A0"/>
            </linearGradient>

            <!-- ==================================================
                 CARA
            ================================================== -->

            <linearGradient
                id="itla-face"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
            >
                <stop offset="0%" stop-color="#D8D0C5"/>
                <stop offset="55%" stop-color="#C8BEB0"/>
                <stop offset="100%" stop-color="#B7AB9D"/>
            </linearGradient>

            <!-- ==================================================
                 OJO IZQUIERDO
            ================================================== -->

            <radialGradient id="itla-eye-left">
                <stop offset="0%" stop-color="#00E5FF"/>
                <stop offset="30%" stop-color="#7C3AED"/>
                <stop offset="58%" stop-color="#2D1B69"/>
                <stop offset="100%" stop-color="#0A1A2F"/>
            </radialGradient>

            <!-- ==================================================
                 OJO DERECHO
            ================================================== -->

            <radialGradient id="itla-eye-right">
                <stop offset="0%" stop-color="#FFD700"/>
                <stop offset="32%" stop-color="#FFB800"/>
                <stop offset="58%" stop-color="#7C3AED"/>
                <stop offset="100%" stop-color="#1A1200"/>
            </radialGradient>

            <!-- ==================================================
                 PUPILA
            ================================================== -->

            <radialGradient id="itla-pupil">
                <stop offset="0%" stop-color="#000000"/>
                <stop offset="72%" stop-color="#000000"/>
                <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
            </radialGradient>

            <!-- ==================================================
                 GLOW
            ================================================== -->

            <filter
                id="itla-glow"
                x="-100%"
                y="-100%"
                width="300%"
                height="300%"
            >
                <feGaussianBlur
                    stdDeviation="2.5"
                    result="blur"
                />

                <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>

            <filter
                id="itla-glow-crown"
                x="-100%"
                y="-100%"
                width="300%"
                height="300%"
            >
                <feGaussianBlur
                    stdDeviation="4.5"
                    result="blur"
                />

                <feFlood
                    flood-color="#FFD700"
                    flood-opacity=".75"
                    result="gold"
                />

                <feComposite
                    in="gold"
                    in2="blur"
                    operator="in"
                    result="goldBlur"
                />

                <feMerge>
                    <feMergeNode in="goldBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>

            <!-- ==================================================
                 SOMBRA INTERIOR
            ================================================== -->

            <filter
                id="itla-body-shadow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
            >
                <feOffset
                    dx="0"
                    dy="4"
                    result="offset"
                />

                <feGaussianBlur
                    in="offset"
                    stdDeviation="3"
                    result="blur"
                />

                <feComponentTransfer>
                    <feFuncA
                        type="linear"
                        slope=".3"
                    />
                </feComponentTransfer>

                <feMerge>
                    <feMergeNode/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>

            <!-- ==================================================
                 PATRÓN DE ESCAMAS
            ================================================== -->

            <pattern
                id="itla-scales"
                width="32"
                height="26"
                patternUnits="userSpaceOnUse"
            >
                <path
                    d="M 12 13
                       L 16 10
                       L 20 13
                       L 16 16 Z"
                    fill="#7C3AED"
                    opacity=".9"
                />

                <circle
                    cx="6"
                    cy="7"
                    r="1.2"
                    fill="#00E5FF"
                />

                <circle
                    cx="25"
                    cy="19"
                    r="1.4"
                    fill="#FFD700"
                />

                <circle
                    cx="27"
                    cy="5"
                    r="1"
                    fill="#2D1B69"
                />
            </pattern>

            <!-- ==================================================
                 AURA EXTERNA
            ================================================== -->

            <radialGradient id="itla-aura">
                <stop
                    offset="0%"
                    stop-color="#00E5FF"
                    stop-opacity=".28"
                />

                <stop
                    offset="55%"
                    stop-color="#00E5FF"
                    stop-opacity=".10"
                />

                <stop
                    offset="100%"
                    stop-color="#00E5FF"
                    stop-opacity="0"
                />
            </radialGradient>

            <!-- ==================================================
                 PLUMA BASE
            ================================================== -->

            <path
                id="itla-feather"
                d="
                    M 0 0
                    C -3 -8, -1 -18, 0 -25
                    C 1 -18, 3 -8, 0 0
                    Z
                "
            />

            <!-- ==================================================
                 ESCAMA INDIVIDUAL
            ================================================== -->

            <path
                id="itla-scale"
                d="
                    M -4 0
                    L 0 -3
                    L 4 0
                    L 0 3
                    Z
                "
            />

        </defs>

        <!-- ======================================================
             ESCENA COMPLETA
        ======================================================= -->

        <g id="itlasuhua-scene">

            <!-- Flotación oficial -->
            <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0; 0 -5; 0 0"
                dur="3.5s"
                calcMode="spline"
                keySplines=".42 0 .58 1; .42 0 .58 1"
                repeatCount="indefinite"
            />

            <!-- ==================================================
                 AURA
            ================================================== -->

            <ellipse
                id="itla-aura"
                cx="150"
                cy="150"
                rx="145"
                ry="145"
                fill="url(#itla-aura)"
                filter="url(#itla-glow)"
            />

            <!-- ==================================================
                 CAPA 2 · ALAS
            ================================================== -->

            <g id="itla-wings">

                <!-- ALA IZQUIERDA -->
                <g
                    id="ala-izq"
                    transform-origin="125px 130px"
                >

                    <animateTransform
                        attributeName="transform"
                        type="rotate"
                        values="0 125 130; -12 125 130; 8 125 130; 0 125 130"
                        dur="0.8s"
                        repeatCount="indefinite"
                    />

                    <path
                        d="
                        M 125 130
                        C 80 110, 45 90, 20 60
                        C 35 75, 70 85, 95 95
                        C 60 75, 35 50, 15 20
                        C 40 40, 75 60, 105 85
                        C 80 60, 65 35, 50 15
                        C 75 35, 100 65, 125 95
                        Z"
                        fill="url(#itla-feather-teal)"
                        stroke="#0A0A0F"
                        stroke-width="2"
                        filter="url(#itla-glow)"
                    />

                    <!-- 3 plumas secundarias -->
                    <g
                        fill="#14B8A6"
                        stroke="#0A0A0F"
                        stroke-width="1.5"
                    >
                        <use
                            href="#itla-feather"
                            transform="translate(105 95) rotate(-15) scale(1)"
                        />

                        <use
                            href="#itla-feather"
                            transform="translate(92 82) rotate(-28) scale(.95)"
                        />

                        <use
                            href="#itla-feather"
                            transform="translate(78 68) rotate(-42) scale(.9)"
                        />
                    </g>

                </g>

                <!-- ALA DERECHA -->
                <g
                    id="ala-der"
                    transform-origin="175px 130px"
                >

                    <animateTransform
                        attributeName="transform"
                        type="rotate"
                        values="0 175 130; 12 175 130; -8 175 130; 0 175 130"
                        dur="0.8s"
                        repeatCount="indefinite"
                    />

                    <path
                        d="
                        M 175 130
                        C 220 110, 255 90, 280 60
                        C 265 75, 230 85, 205 95
                        C 240 75, 265 50, 285 20
                        C 260 40, 225 60, 195 85
                        C 220 60, 235 35, 250 15
                        C 225 35, 200 65, 175 95
                        Z"
                        fill="url(#itla-feather-teal)"
                        stroke="#0A0A0F"
                        stroke-width="2"
                        filter="url(#itla-glow)"
                    />

                    <g
                        fill="#14B8A6"
                        stroke="#0A0A0F"
                        stroke-width="1.5"
                    >
                        <use
                            href="#itla-feather"
                            transform="translate(195 95) rotate(15) scale(1)"
                        />

                        <use
                            href="#itla-feather"
                            transform="translate(208 82) rotate(28) scale(.95)"
                        />

                        <use
                            href="#itla-feather"
                            transform="translate(222 68) rotate(42) scale(.9)"
                        />
                    </g>

                </g>

            </g>

            <!-- ==================================================
                 CAPA 1 · CUERPO ENROSCADO
            ================================================== -->

            <g
                id="itla-body"
                filter="url(#itla-body-shadow)"
            >

                <!-- Vuelta exterior -->
                <path
                    id="itla-coil-outer"
                    d="
                    M 150 255
                    C 90 255, 55 230, 55 200
                    C 55 165, 90 145, 150 145
                    C 210 145, 245 165, 245 200
                    C 245 235, 205 255, 150 255
                    Z"
                    fill="url(#itla-body-galaxy)"
                    stroke="#0A0A0F"
                    stroke-width="2"
                />

                <!-- Escamas exteriores -->
                <g id="itla-scales-outer">

                    <use href="#itla-scale"
                         transform="translate(75 207)"
                         fill="#2D1B69"/>

                    <use href="#itla-scale"
                         transform="translate(84 225)"
                         fill="#7C3AED"/>

                    <use href="#itla-scale"
                         transform="translate(101 239)"
                         fill="#00E5FF"/>

                    <use href="#itla-scale"
                         transform="translate(122 247)"
                         fill="#FFD700"/>

                    <use href="#itla-scale"
                         transform="translate(146 250)"
                         fill="#7C3AED"/>

                    <use href="#itla-scale"
                         transform="translate(171 248)"
                         fill="#00E5FF"/>

                    <use href="#itla-scale"
                         transform="translate(194 241)"
                         fill="#FFD700"/>

                    <use href="#itla-scale"
                         transform="translate(215 229)"
                         fill="#7C3AED"/>

                    <use href="#itla-scale"
                         transform="translate(231 211)"
                         fill="#00E5FF"/>

                    <use href="#itla-scale"
                         transform="translate(221 188)"
                         fill="#FFD700"/>

                    <use href="#itla-scale"
                         transform="translate(198 173)"
                         fill="#7C3AED"/>

                    <use href="#itla-scale"
                         transform="translate(174 166)"
                         fill="#00E5FF"/>

                    <use href="#itla-scale"
                         transform="translate(148 164)"
                         fill="#FFD700"/>

                    <use href="#itla-scale"
                         transform="translate(122 166)"
                         fill="#7C3AED"/>

                    <use href="#itla-scale"
                         transform="translate(98 174)"
                         fill="#00E5FF"/>

                    <use href="#itla-scale"
                         transform="translate(78 188)"
                         fill="#FFD700"/>

                    <use href="#itla-scale"
                         transform="translate(67 204)"
                         fill="#7C3AED"/>

                    <use href="#itla-scale"
                         transform="translate(150 226)"
                         fill="#00E5FF"/>

                </g>

                <!-- Vuelta media -->
                <path
                    id="itla-coil-middle"
                    d="
                    M 150 225
                    C 105 225, 78 210, 78 188
                    C 78 165, 105 150, 150 150
                    C 195 150, 222 165, 222 188
                    C 222 215, 190 225, 150 225
                    Z"
                    fill="#2D1B69"
                    stroke="#0A0A0F"
                    stroke-width="2"
                    opacity=".96"
                />

                <path
                    d="
                    M 150 225
                    C 105 225, 78 210, 78 188
                    C 78 165, 105 150, 150 150
                    C 195 150, 222 165, 222 188
                    C 222 215, 190 225, 150 225
                    Z"
                    fill="url(#itla-scales)"
                    opacity=".38"
                />

                <!-- Conexión cuello -->
                <path
                    id="itla-neck"
                    d="
                    M 125 150
                    C 115 120, 120 90, 135 75
                    L 165 75
                    C 180 90, 185 120, 175 150
                    Z"
                    fill="url(#itla-body-galaxy)"
                    stroke="#0A0A0F"
                    stroke-width="2"
                />

                <!-- Escamas cuello -->
                <g opacity=".95">

                    <use
                        href="#itla-scale"
                        transform="translate(135 132)"
                        fill="#7C3AED"
                    />

                    <use
                        href="#itla-scale"
                        transform="translate(150 126)"
                        fill="#00E5FF"
                    />

                    <use
                        href="#itla-scale"
                        transform="translate(165 132)"
                        fill="#FFD700"
                    />

                    <use
                        href="#itla-scale"
                        transform="translate(130 112)"
                        fill="#00E5FF"
                    />

                    <use
                        href="#itla-scale"
                        transform="translate(150 108)"
                        fill="#7C3AED"
                    />

                    <use
                        href="#itla-scale"
                        transform="translate(170 112)"
                        fill="#FFD700"
                    />

                    <use
                        href="#itla-scale"
                        transform="translate(140 92)"
                        fill="#FFD700"
                    />

                    <use
                        href="#itla-scale"
                        transform="translate(160 92)"
                        fill="#00E5FF"
                    />

                </g>

                <!-- Panza -->
                <path
                    id="itla-belly"
                    d="
                    M 132 151
                    C 132 174, 136 195, 150 210
                    C 164 195, 168 174, 168 151
                    Z"
                    fill="#FDE6A8"
                    stroke="#E8C87A"
                    stroke-width="2"
                    opacity=".98"
                />

            </g>

            <!-- ==================================================
                 CAPA 3 · CABEZA
            ================================================== -->

            <g
                id="itla-cabeza"
            >

                <path
                    id="itla-head"
                    d="
                    M 85 85
                    C 85 45, 115 25, 150 25
                    C 185 25, 215 45, 215 85
                    C 215 110, 195 125, 150 125
                    C 105 125, 85 110, 85 85
                    Z"
                    fill="#C8BEB0"
                    stroke="#0A0A0F"
                    stroke-width="2"
                />

                <!-- Sombra inferior suave -->
                <path
                    d="
                    M 87 87
                    C 90 111, 110 124, 150 125
                    C 190 124, 210 111, 213 87
                    C 202 105, 182 113, 150 114
                    C 118 113, 98 105, 87 87
                    Z"
                    fill="#AFA397"
                    opacity=".25"
                />

                <!-- Hocico -->
                <path
                    id="itla-hocico"
                    d="
                    M 130 105
                    C 135 108, 165 108, 170 105
                    C 170 115, 130 115, 130 105
                    Z"
                    fill="#F1D9C5"
                    stroke="#0A0A0F"
                    stroke-width="1.5"
                />

                <!-- Chapitas -->
                <circle
                    cx="105"
                    cy="100"
                    r="4.5"
                    fill="#FF8FA3"
                    opacity=".6"
                />

                <circle
                    cx="195"
                    cy="100"
                    r="4.5"
                    fill="#FF8FA3"
                    opacity=".6"
                />

            </g>

            <!-- ==================================================
                 CAPA 4 · OJOS GALAXIA
            ================================================== -->

            <g id="itla-eyes">

                <!-- IZQUIERDO -->
                <g
                    id="itla-ojo-izq"
                    class="itla-ojo"
                >

                    <circle
                        cx="115"
                        cy="75"
                        r="22"
                        fill="#0A1A2F"
                        stroke="#0A0A0F"
                        stroke-width="2"
                    />

                    <g class="itla-eye-galaxy">
                        <circle
                            cx="115"
                            cy="75"
                            r="18"
                            fill="url(#itla-eye-left)"
                        />

                        <circle
                            cx="108"
                            cy="68"
                            r="4"
                            fill="#00E5FF"
                            filter="url(#itla-glow)"
                        />

                        <!-- 6 estrellas -->
                        <circle cx="122" cy="63" r="1.5" fill="#FFFFFF"/>
                        <circle cx="128" cy="72" r="1.5" fill="#00E5FF"/>
                        <circle cx="120" cy="84" r="1.5" fill="#FFD700"/>
                        <circle cx="108" cy="88" r="1.5" fill="#FFFFFF"/>
                        <circle cx="102" cy="77" r="1.5" fill="#00E5FF"/>
                        <circle cx="116" cy="71" r="1.5" fill="#FFD700"/>
                    </g>

                    <circle
                        cx="115"
                        cy="75"
                        r="9"
                        fill="url(#itla-pupil)"
                    />

                    <circle
                        cx="108"
                        cy="68"
                        r="2"
                        fill="#FFFFFF"
                    />

                    <path
                        d="M 93 75 Q 115 55, 137 75"
                        fill="none"
                        stroke="#0A0A0F"
                        stroke-width="2"
                        stroke-linecap="round"
                    />

                </g>

                <!-- DERECHO -->
                <g
                    id="itla-ojo-der"
                    class="itla-ojo"
                >

                    <circle
                        cx="185"
                        cy="75"
                        r="22"
                        fill="#1A1200"
                        stroke="#0A0A0F"
                        stroke-width="2"
                    />

                    <g class="itla-eye-galaxy">
                        <circle
                            cx="185"
                            cy="75"
                            r="18"
                            fill="url(#itla-eye-right)"
                        />

                        <circle
                            cx="192"
                            cy="68"
                            r="5"
                            fill="#FFD700"
                            filter="url(#itla-glow)"
                        />

                        <circle cx="178" cy="63" r="1.5" fill="#FFFFFF"/>
                        <circle cx="172" cy="72" r="1.5" fill="#FFD700"/>
                        <circle cx="180" cy="84" r="1.5" fill="#00E5FF"/>
                        <circle cx="192" cy="88" r="1.5" fill="#FFFFFF"/>
                        <circle cx="198" cy="77" r="1.5" fill="#FFD700"/>
                        <circle cx="184" cy="71" r="1.5" fill="#00E5FF"/>
                    </g>

                    <circle
                        cx="185"
                        cy="75"
                        r="9"
                        fill="url(#itla-pupil)"
                    />

                    <circle
                        cx="192"
                        cy="68"
                        r="2"
                        fill="#FFFFFF"
                    />

                    <path
                        d="M 163 75 Q 185 55, 207 75"
                        fill="none"
                        stroke="#0A0A0F"
                        stroke-width="2"
                        stroke-linecap="round"
                    />

                </g>

            </g>

            <!-- ==================================================
                 BOCA
            ================================================== -->

            <g id="itla-mouth">

                <path
                    id="itla-sonrisa"
                    d="M 135 108 Q 150 118 165 108"
                    fill="none"
                    stroke="#0A0A0F"
                    stroke-width="2"
                    stroke-linecap="round"
                />

                <g id="itla-boca-abierta">
                    <ellipse
                        cx="150"
                        cy="111"
                        rx="9"
                        ry="6"
                        fill="#45182A"
                        stroke="#0A0A0F"
                        stroke-width="1.5"
                    />

                    <ellipse
                        cx="150"
                        cy="114"
                        rx="5"
                        ry="2.5"
                        fill="#FF8FA3"
                    />
                </g>

            </g>

            <!-- ==================================================
                 CAPA 5 · CORONA
            ================================================== -->

            <g
                id="itla-corona"
                filter="url(#itla-glow-crown)"
            >

                <path
                    d="
                    M 90 55
                    L 90 35
                    L 105 35
                    L 110 20
                    L 125 35
                    L 135 35
                    L 145 15
                    L 155 15
                    L 165 35
                    L 175 35
                    L 190 20
                    L 195 35
                    L 210 35
                    L 210 55
                    Z"
                    fill="#FFD700"
                    stroke="#8A6D00"
                    stroke-width="2.5"
                    stroke-linejoin="round"
                />

                <!-- Brillo de la corona -->
                <path
                    d="
                    M 94 50
                    L 94 39
                    L 108 39
                    L 112 28
                    L 124 39
                    L 136 39
                    L 146 23
                    L 154 23
                    L 164 39
                    L 176 39
                    L 188 28
                    L 192 39
                    L 206 39
                    L 206 50
                    Z"
                    fill="#FFD700"
                    opacity=".35"
                />

                <!-- Gema central -->
                <circle
                    cx="150"
                    cy="40"
                    r="8"
                    fill="#2DD4BF"
                    stroke="#0F766E"
                    stroke-width="2"
                    filter="url(#itla-glow)"
                    class="itla-gema"
                />

                <!-- Gemas laterales -->
                <circle
                    cx="105"
                    cy="45"
                    r="5"
                    fill="#2DD4BF"
                    stroke="#0F766E"
                    stroke-width="2"
                    class="itla-gema"
                />

                <circle
                    cx="125"
                    cy="45"
                    r="5"
                    fill="#2DD4BF"
                    stroke="#0F766E"
                    stroke-width="2"
                    class="itla-gema"
                />

                <circle
                    cx="175"
                    cy="45"
                    r="5"
                    fill="#2DD4BF"
                    stroke="#0F766E"
                    stroke-width="2"
                    class="itla-gema"
                />

                <circle
                    cx="195"
                    cy="45"
                    r="5"
                    fill="#2DD4BF"
                    stroke="#0F766E"
                    stroke-width="2"
                    class="itla-gema"
                />

            </g>

            <!-- ==================================================
                 PENACHO · 11 PLUMAS
            ================================================== -->

            <g
                id="itla-penacho"
                fill="none"
                stroke="#0A0A0F"
                stroke-width="1.5"
                stroke-linejoin="round"
            >

                <!-- -45° -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(-45) scale(1.55)"
                    fill="#14B8A6"
                />

                <!-- -36° -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(-36) scale(1.5)"
                    fill="#FFD700"
                />

                <!-- -27° -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(-27) scale(1.55)"
                    fill="#14B8A6"
                />

                <!-- -18° -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(-18) scale(1.6)"
                    fill="#FFD700"
                />

                <!-- -9° -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(-9) scale(1.65)"
                    fill="#14B8A6"
                />

                <!-- 0° central -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(0) scale(1.8)"
                    fill="#FFD700"
                />

                <!-- +9° -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(9) scale(1.65)"
                    fill="#14B8A6"
                />

                <!-- +18° -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(18) scale(1.6)"
                    fill="#FFD700"
                />

                <!-- +27° -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(27) scale(1.55)"
                    fill="#14B8A6"
                />

                <!-- +36° -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(36) scale(1.5)"
                    fill="#FFD700"
                />

                <!-- +45° -->
                <use
                    href="#itla-feather"
                    transform="translate(150 30) rotate(45) scale(1.55)"
                    fill="#14B8A6"
                />

            </g>

            <!-- ==================================================
                 DESTELLOS
            ================================================== -->

            <g
                id="itla-sparkles"
                filter="url(#itla-glow)"
            >
                <path
                    d="M 63 132
                       l 2 5
                       5 2
                       -5 2
                       -2 5
                       -2 -5
                       -5 -2
                       5 -2
                       Z"
                    fill="#00E5FF"
                />

                <path
                    d="M 237 132
                       l 2 5
                       5 2
                       -5 2
                       -2 5
                       -2 -5
                       -5 -2
                       5 -2
                       Z"
                    fill="#FFD700"
                />

                <circle
                    cx="58"
                    cy="166"
                    r="2"
                    fill="#00E5FF"
                />

                <circle
                    cx="242"
                    cy="166"
                    r="2"
                    fill="#FFD700"
                />

            </g>

        </g>
    </svg>
    `;

    // ============================================================
    // LOG
    // ============================================================

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
            const size = 4 + Math.random() * 5;

            const dx =
                (Math.random() * 2 - 1) *
                (30 + 40 * fuerza);

            const dy =
                25 +
                Math.random() *
                (50 + 60 * fuerza);

            const dur =
                0.9 +
                Math.random() * 0.7;

            p.style.setProperty('--h', hue);
            p.style.setProperty('--s', size + 'px');
            p.style.setProperty('--dx', dx + 'px');
            p.style.setProperty('--dy', dy + 'px');
            p.style.setProperty('--t', dur + 's');

            p.addEventListener(
                'animationend',
                function () {
                    p.remove();
                },
                { once: true }
            );

            dustLayer.appendChild(p);
        }
    }

    function scheduleIdleSpit() {

        clearTimeout(idleTimer);

        if (reduceMotion) return;

        idleTimer = setTimeout(
            function () {

                if (!document.hidden) {
                    spit(4, 0.6);
                }

                scheduleIdleSpit();

            },
            3500 + Math.random() * 4000
        );
    }

    // ============================================================
    // RENDER
    // ============================================================

    const render = function (containerId) {

        const container =
            document.getElementById(containerId);

        if (!container) {
            console.warn(
                '[Itlasuhua] Contenedor "' +
                containerId +
                '" no encontrado.'
            );
            return;
        }

        container.innerHTML = svgString;

        container.classList.add(
            'itlasuhua-rendered'
        );

        document.dispatchEvent(
            new CustomEvent(
                'itlasuhua:rendered',
                {
                    detail: {
                        containerId
                    }
                }
            )
        );

        log(
            '✅ SVG 300x300 renderizado en #' +
            containerId
        );
    };

    // ============================================================
    // GETTERS
    // ============================================================

    const getSVG = function () {
        return document.getElementById(
            'itlasuhua-svg'
        );
    };

    const getWings = function () {
        return document.querySelectorAll(
            '#itlasuhua-svg #ala-izq,' +
            '#itlasuhua-svg #ala-der'
        );
    };

    // ============================================================
    // POSICIÓN
    // ============================================================

    function guardarPosicion(x, y) {

        try {

            localStorage.setItem(
                POS_KEY,
                JSON.stringify({
                    x: x,
                    y: y
                })
            );

        } catch (e) {}
    }

    function cargarPosicion() {

        try {

            const raw =
                localStorage.getItem(POS_KEY);

            if (!raw) return null;

            const data =
                JSON.parse(raw);

            if (
                data &&
                data.x != null &&
                data.y != null
            ) {
                return data;
            }

        } catch (e) {}

        return null;
    }

    // ============================================================
    // WIDGET
    // ============================================================

    const crearWidget = function () {

        if (
            document.getElementById(
                'itlasuhua-container'
            )
        ) {
            return;
        }

        const cont =
            document.createElement('div');

        cont.id =
            'itlasuhua-container';

        document.body.appendChild(cont);

        const posGuardada =
            cargarPosicion();

        if (posGuardada) {

            const ancho =
                cont.offsetWidth || 140;

            const alto =
                cont.offsetHeight || 140;

            const maxX =
                Math.max(
                    0,
                    window.innerWidth - ancho
                );

            const maxY =
                Math.max(
                    0,
                    window.innerHeight - alto
                );

            const x =
                Math.max(
                    0,
                    Math.min(
                        maxX,
                        posGuardada.x
                    )
                );

            const y =
                Math.max(
                    0,
                    Math.min(
                        maxY,
                        posGuardada.y
                    )
                );

            cont.style.left =
                x + 'px';

            cont.style.top =
                y + 'px';

            cont.style.right =
                'auto';

            cont.style.bottom =
                'auto';
        }

        render(
            'itlasuhua-container'
        );

        let isDragging = false;
        let hasMoved = false;

        let dragStartX = 0;
        let dragStartY = 0;

        let posStartX = 0;
        let posStartY = 0;

        cont.addEventListener(
            'pointerdown',
            function (e) {

                isDragging = true;
                hasMoved = false;

                dragStartX = e.clientX;
                dragStartY = e.clientY;

                try {

                    const rect =
                        cont.getBoundingClientRect();

                    posStartX =
                        rect.left;

                    posStartY =
                        rect.top;

                } catch (err) {

                    posStartX = 0;
                    posStartY = 0;
                }

                try {
                    cont.setPointerCapture(
                        e.pointerId
                    );
                } catch (err) {}

                cont.classList.add(
                    'itlasuhua-dragging'
                );
            }
        );

        cont.addEventListener(
            'pointermove',
            function (e) {

                if (!isDragging) return;

                const dx =
                    e.clientX -
                    dragStartX;

                const dy =
                    e.clientY -
                    dragStartY;

                if (
                    Math.abs(dx) > 5 ||
                    Math.abs(dy) > 5
                ) {
                    hasMoved = true;
                }

                if (!hasMoved) return;

                let newX =
                    posStartX + dx;

                let newY =
                    posStartY + dy;

                const ancho =
                    cont.offsetWidth || 140;

                const alto =
                    cont.offsetHeight || 140;

                const maxX =
                    Math.max(
                        0,
                        window.innerWidth -
                        ancho
                    );

                const maxY =
                    Math.max(
                        0,
                        window.innerHeight -
                        alto
                    );

                newX =
                    Math.max(
                        0,
                        Math.min(
                            maxX,
                            newX
                        )
                    );

                newY =
                    Math.max(
                        0,
                        Math.min(
                            maxY,
                            newY
                        )
                    );

                cont.style.left =
                    newX + 'px';

                cont.style.top =
                    newY + 'px';

                cont.style.right =
                    'auto';

                cont.style.bottom =
                    'auto';
            }
        );

        cont.addEventListener(
            'pointerup',
            function (e) {

                if (!isDragging) return;

                isDragging = false;

                cont.classList.remove(
                    'itlasuhua-dragging'
                );

                try {
                    cont.releasePointerCapture(
                        e.pointerId
                    );
                } catch (err) {}

                if (hasMoved) {

                    try {

                        const rect =
                            cont.getBoundingClientRect();

                        guardarPosicion(
                            rect.left,
                            rect.top
                        );

                        log(
                            '📍 Posición guardada'
                        );

                    } catch (err) {}

                } else {

                    spit(14, 1.2);
                }
            }
        );

        cont.addEventListener(
            'pointercancel',
            function () {

                isDragging = false;

                cont.classList.remove(
                    'itlasuhua-dragging'
                );
            }
        );

        scheduleIdleSpit();

        log(
            '✅ Widget Itlasuhua creado · 140x140 · arrastrable'
        );
    };

    // ============================================================
    // API PÚBLICA
    // ============================================================

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

    log(
        '✅ Itlasuhua Pet v4.0 cargado'
    );

})(window);