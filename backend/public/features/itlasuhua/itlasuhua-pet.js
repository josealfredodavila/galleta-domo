// ================================================================
// ITLASUHUA · PET · SVG v3.3
// ================================================================
// Rey Itlasuhua, serpiente cósmica chibi.
//
// v3.2:
// - CORRECCIÓN PRINCIPAL: cola integrada cromáticamente con el cuerpo.
// - Se elimina el predominio morado de la cola.
// - Cola ahora usa azul cósmico + azul profundo + turquesa.
// - Mantiene estrellas, brillos y detalles dorados.
// - Punta de cola actualizada al mismo acabado.
// - No se modifican cabeza, corona, alas ni estructura general.
//
// v3.3:
// - NUEVO: listener click → llama a ItlasuhuaVoice.onAvatarTap()
//   (flujo híbrido: primer toque = saludo, siguientes = conversación)
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
    // COLA ENROSCADA
    //
    // La cola conserva los anillos:
    // - parte trasera detrás del cuerpo
    // - parte delantera por encima del cuerpo
    //
    // IMPORTANTE:
    // El color ahora está basado en el mismo lenguaje cromático
    // del cuerpo: azul profundo + azul cósmico + teal/turquesa.
    // ============================================================

    const anillo = (cy, rx, ry = 42) => {

        const x1 = 300 - rx;
        const x2 = 300 + rx;

        return {
            cy,
            rx,
            back: `M${x1} ${cy} A${rx} ${ry} 0 0 1 ${x2} ${cy}`,
            front: `M${x1} ${cy} A${rx} ${ry} 0 0 0 ${x2} ${cy}`
        };
    };


    // ============================================================
    // CAPA DE COLA
    //
    // ANTES:
    // url(#itla-galaxy)
    //
    // AHORA:
    // url(#itla-tail-body)
    //
    // Esto evita que la cola se vea morada y la integra con el
    // cuerpo cósmico.
    // ============================================================

    const capaCola = (d) => `
        <path
            d="${d}"
            fill="none"
            stroke="#07152F"
            stroke-width="50"
            stroke-linecap="round"
        />

        <path
            d="${d}"
            fill="none"
            stroke="url(#itla-tail-body)"
            stroke-width="42"
            stroke-linecap="round"
        />

        <path
            d="${d}"
            fill="none"
            stroke="url(#itla-tail-stars)"
            stroke-width="36"
            stroke-linecap="round"
            opacity=".9"
        />

        <path
            d="${d}"
            fill="none"
            stroke="#39E8DC"
            stroke-width="2.5"
            stroke-linecap="round"
            opacity=".85"
            filter="url(#itla-glow)"
        />

        <path
            d="${d}"
            fill="none"
            stroke="#FFE08A"
            stroke-width="3"
            stroke-linecap="round"
            stroke-dasharray="8 12"
            opacity=".7"
        >
            <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-40"
                dur="2.5s"
                repeatCount="indefinite"
            />
        </path>
    `;


    // ============================================================
    // PLUMAS
    // ============================================================

    const plumaEn = (
        x,
        y,
        rot,
        escala,
        relleno,
        borde
    ) => `
        <use
            href="#itla-pluma"
            xlink:href="#itla-pluma"
            transform="
                translate(${x} ${y})
                rotate(${rot})
                scale(${escala})
            "
            fill="${relleno}"
            stroke="${borde}"
            stroke-width="3"
        />
    `;


    const ORO = {
        f: 'url(#itla-feather-gold)',
        b: '#FFE99B'
    };


    const TEAL = {
        f: 'url(#itla-feather-teal)',
        b: '#6FFFF2'
    };


    const AZUL = {
        f: 'url(#itla-feather-blue)',
        b: '#74FFF4'
    };


    // ============================================================
    // ANILLOS
    // ============================================================

    const anillos = [

        anillo(400, 172),

        anillo(452, 184),

        anillo(504, 190),

        anillo(556, 180)

    ];


    const colaTrasera = anillos
        .map(a => capaCola(a.back))
        .join('');


    const colaDelantera = anillos
        .map(a => capaCola(a.front))
        .join('');


    // ============================================================
    // PUNTAS DE LA COLA
    //
    // AHORA también utilizan itla-tail-body.
    // ============================================================

    const puntaDer = `

        <path
            d="
                M470 546
                C520 540 548 506 540 470
                C536 450 520 452 522 470
                C524 494 500 514 466 528
                Z
            "
            fill="url(#itla-tail-body)"
            stroke="#3CF0E2"
            stroke-width="2.5"
            filter="url(#itla-glow)"
        />

        <path
            d="
                M130 546
                C80 540 52 506 60 470
                C64 450 80 452 78 470
                C76 494 100 514 134 528
                Z
            "
            fill="url(#itla-tail-body)"
            stroke="#3CF0E2"
            stroke-width="2.5"
            filter="url(#itla-glow)"
        />

        <!-- Reflejo turquesa sobre la punta -->
        <path
            d="
                M476 531
                C507 519 530 495 530 472
            "
            fill="none"
            stroke="#4BEFE3"
            stroke-width="3"
            stroke-linecap="round"
            opacity=".65"
        />

        <path
            d="
                M124 531
                C93 519 70 495 70 472
            "
            fill="none"
            stroke="#4BEFE3"
            stroke-width="3"
            stroke-linecap="round"
            opacity=".65"
        />
    `;


    // ============================================================
    // PLUMAS DE LA COLA
    // ============================================================

    const plumasCola = [

        plumaEn(
            300 - 172,
            400,
            -70,
            .42,
            ORO.f,
            ORO.b
        ),

        plumaEn(
            300 + 172,
            400,
            70,
            .42,
            ORO.f,
            ORO.b
        ),

        plumaEn(
            300 - 184,
            452,
            -78,
            .46,
            TEAL.f,
            TEAL.b
        ),

        plumaEn(
            300 + 184,
            452,
            78,
            .46,
            TEAL.f,
            TEAL.b
        ),

        plumaEn(
            300 - 190,
            504,
            -82,
            .48,
            AZUL.f,
            AZUL.b
        ),

        plumaEn(
            300 + 190,
            504,
            82,
            .48,
            AZUL.f,
            AZUL.b
        ),

        plumaEn(
            300 - 180,
            556,
            -86,
            .44,
            ORO.f,
            ORO.b
        ),

        plumaEn(
            300 + 180,
            556,
            86,
            .44,
            ORO.f,
            ORO.b
        ),

        plumaEn(
            300,
            598,
            180,
            .46,
            TEAL.f,
            TEAL.b
        ),

        plumaEn(
            300,
            352,
            0,
            .36,
            AZUL.f,
            AZUL.b
        ),

        plumaEn(
            540,
            446,
            28,
            .40,
            ORO.f,
            ORO.b
        ),

        plumaEn(
            78,
            446,
            -28,
            .40,
            TEAL.f,
            TEAL.b
        ),

        plumaEn(
            150,
            572,
            -40,
            .34,
            AZUL.f,
            AZUL.b
        ),

        plumaEn(
            450,
            572,
            40,
            .34,
            AZUL.f,
            AZUL.b
        )

    ].join('');


    // ============================================================
    // SVG
    // ============================================================

    const svgString = `

    <svg
        id="itlasuhua-svg"
        class="itlasuhua-svg"
        viewBox="0 0 600 620"
        xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Rey Itlasuhua, serpiente cósmica"
    >

        <defs>


            <!-- ================================================== -->
            <!-- PLUMAS TEAL -->
            <!-- ================================================== -->

            <linearGradient
                id="itla-feather-teal"
                x1="0%"
                y1="100%"
                x2="100%"
                y2="0%"
            >

                <stop
                    offset="0%"
                    stop-color="#0A6B82"
                />

                <stop
                    offset="35%"
                    stop-color="#00AEB5"
                />

                <stop
                    offset="65%"
                    stop-color="#43E6D6"
                />

                <stop
                    offset="100%"
                    stop-color="#C2FFF4"
                />

            </linearGradient>


            <!-- ================================================== -->
            <!-- PLUMAS AZULES -->
            <!-- ================================================== -->

            <linearGradient
                id="itla-feather-blue"
                x1="0%"
                y1="100%"
                x2="100%"
                y2="0%"
            >

                <stop
                    offset="0%"
                    stop-color="#152B77"
                />

                <stop
                    offset="35%"
                    stop-color="#126F9E"
                />

                <stop
                    offset="65%"
                    stop-color="#21C8D1"
                />

                <stop
                    offset="100%"
                    stop-color="#8CF5EA"
                />

            </linearGradient>


            <!-- ================================================== -->
            <!-- PLUMAS DORADAS -->
            <!-- ================================================== -->

            <linearGradient
                id="itla-feather-gold"
                x1="0%"
                y1="100%"
                x2="100%"
                y2="0%"
            >

                <stop
                    offset="0%"
                    stop-color="#B9741F"
                />

                <stop
                    offset="38%"
                    stop-color="#FFD76D"
                />

                <stop
                    offset="70%"
                    stop-color="#FFF0A5"
                />

                <stop
                    offset="100%"
                    stop-color="#FFE28A"
                />

            </linearGradient>


            <!-- ================================================== -->
            <!-- ORO -->
            <!-- ================================================== -->

            <linearGradient
                id="itla-gold"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
            >

                <stop
                    offset="0%"
                    stop-color="#FFF3B0"
                />

                <stop
                    offset="25%"
                    stop-color="#FFD45A"
                />

                <stop
                    offset="55%"
                    stop-color="#E5A72E"
                />

                <stop
                    offset="80%"
                    stop-color="#FFF09A"
                />

                <stop
                    offset="100%"
                    stop-color="#9D641D"
                />

            </linearGradient>


            <!-- ================================================== -->
            <!-- ALAS -->
            <!-- ================================================== -->

            <linearGradient
                id="itla-wing-galaxy"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
            >

                <stop
                    offset="0%"
                    stop-color="#1B1F5C"
                />

                <stop
                    offset="40%"
                    stop-color="#4A2D8A"
                />

                <stop
                    offset="70%"
                    stop-color="#1F7FA8"
                />

                <stop
                    offset="100%"
                    stop-color="#3FE0D2"
                />

            </linearGradient>


            <!-- ================================================== -->
            <!-- GALAXIA ORIGINAL
                 Se conserva para otros elementos.
            -->
            <!-- ================================================== -->

            <linearGradient
                id="itla-galaxy"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
            >

                <stop
                    offset="0%"
                    stop-color="#11183F"
                />

                <stop
                    offset="22%"
                    stop-color="#29266A"
                />

                <stop
                    offset="42%"
                    stop-color="#46317E"
                />

                <stop
                    offset="62%"
                    stop-color="#164B76"
                />

                <stop
                    offset="80%"
                    stop-color="#0D7F8D"
                />

                <stop
                    offset="100%"
                    stop-color="#171A4A"
                />

            </linearGradient>


            <!-- ================================================== -->
            <!-- NUEVO GRADIENTE DE COLA
                 MISMO LENGUAJE CROMÁTICO DEL CUERPO
            -->
            <!-- ================================================== -->

            <linearGradient
                id="itla-tail-body"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
            >

                <!-- Azul profundo -->
                <stop
                    offset="0%"
                    stop-color="#081A3D"
                />

                <!-- Azul cósmico -->
                <stop
                    offset="20%"
                    stop-color="#123C78"
                />

                <!-- Azul vivo -->
                <stop
                    offset="42%"
                    stop-color="#176F9D"
                />

                <!-- Turquesa -->
                <stop
                    offset="64%"
                    stop-color="#119FA8"
                />

                <!-- Teal luminoso -->
                <stop
                    offset="82%"
                    stop-color="#28CFC8"
                />

                <!-- Reflejo -->
                <stop
                    offset="100%"
                    stop-color="#155B78"
                />

            </linearGradient>


            <!-- ================================================== -->
            <!-- ESTRELLAS DE LA COLA
            ================================================== -->

            <linearGradient
                id="itla-tail-stars"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
            >

                <stop
                    offset="0%"
                    stop-color="#101E4A"
                />

                <stop
                    offset="24%"
                    stop-color="#174D78"
                />

                <stop
                    offset="45%"
                    stop-color="#216F94"
                />

                <stop
                    offset="64%"
                    stop-color="#0FA6A9"
                />

                <stop
                    offset="82%"
                    stop-color="#25D6CB"
                />

                <stop
                    offset="100%"
                    stop-color="#173A66"
                />

            </linearGradient>


            <!-- ================================================== -->
            <!-- VIENTRE -->
            <!-- ================================================== -->

            <linearGradient
                id="itla-belly"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
            >

                <stop
                    offset="0%"
                    stop-color="#FFF0C4"
                />

                <stop
                    offset="50%"
                    stop-color="#E9C98E"
                />

                <stop
                    offset="100%"
                    stop-color="#B88A55"
                />

            </linearGradient>


            <!-- ================================================== -->
            <!-- ROSTRO -->
            <!-- ================================================== -->

            <radialGradient
                id="itla-face"
                cx="50%"
                cy="40%"
                r="60%"
            >

                <stop
                    offset="0%"
                    stop-color="#FFF8E3"
                />

                <stop
                    offset="60%"
                    stop-color="#F1DFB4"
                />

                <stop
                    offset="100%"
                    stop-color="#C9A97A"
                />

            </radialGradient>


            <!-- ================================================== -->
            <!-- OJO CYAN -->
            <!-- ================================================== -->

            <radialGradient id="itla-eye-cyan">

                <stop
                    offset="0%"
                    stop-color="#FFFFFF"
                />

                <stop
                    offset="18%"
                    stop-color="#B5FFFF"
                />

                <stop
                    offset="45%"
                    stop-color="#2EE8DF"
                />

                <stop
                    offset="78%"
                    stop-color="#1368A8"
                />

                <stop
                    offset="100%"
                    stop-color="#081A49"
                />

            </radialGradient>


            <!-- ================================================== -->
            <!-- OJO DORADO -->
            <!-- ================================================== -->

            <radialGradient id="itla-eye-gold">

                <stop
                    offset="0%"
                    stop-color="#FFFFFF"
                />

                <stop
                    offset="18%"
                    stop-color="#FFF8B0"
                />

                <stop
                    offset="48%"
                    stop-color="#FFD52D"
                />

                <stop
                    offset="80%"
                    stop-color="#E67D16"
                />

                <stop
                    offset="100%"
                    stop-color="#5B2A19"
                />

            </radialGradient>


            <!-- ================================================== -->
            <!-- AURA -->
            <!-- ================================================== -->

            <radialGradient id="itla-aura">

                <stop
                    offset="0%"
                    stop-color="#3CFFE8"
                    stop-opacity=".55"
                />

                <stop
                    offset="45%"
                    stop-color="#327CB0"
                    stop-opacity=".22"
                />

                <stop
                    offset="100%"
                    stop-color="#123E69"
                    stop-opacity="0"
                />

            </radialGradient>


            <!-- ================================================== -->
            <!-- GLOW -->
            <!-- ================================================== -->

            <filter
                id="itla-glow"
                x="-100%"
                y="-100%"
                width="300%"
                height="300%"
            >

                <feGaussianBlur
                    stdDeviation="4"
                    result="blur"
                />

                <feMerge>

                    <feMergeNode in="blur"/>

                    <feMergeNode in="SourceGraphic"/>

                </feMerge>

            </filter>


            <!-- ================================================== -->
            <!-- SOMBRA -->
            <!-- ================================================== -->

            <filter
                id="itla-shadow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
            >

                <feDropShadow
                    dx="0"
                    dy="5"
                    stdDeviation="7"
                    flood-color="#000000"
                    flood-opacity=".5"
                />

            </filter>


            <!-- ================================================== -->
            <!-- ESTRELLAS -->
            <!-- ================================================== -->

            <pattern
                id="itla-stars"
                width="60"
                height="60"
                patternUnits="userSpaceOnUse"
            >

                <circle
                    cx="8"
                    cy="12"
                    r="1.5"
                    fill="#FFFFFF"
                />

                <circle
                    cx="33"
                    cy="27"
                    r="1.1"
                    fill="#8FFAFF"
                />

                <circle
                    cx="48"
                    cy="8"
                    r="1.4"
                    fill="#FFD95A"
                />

                <circle
                    cx="18"
                    cy="44"
                    r="1.2"
                    fill="#FFFFFF"
                />

                <circle
                    cx="46"
                    cy="50"
                    r="1.5"
                    fill="#73EFFF"
                />

            </pattern>


            <!-- ================================================== -->
            <!-- PLUMA BASE -->
            <!-- ================================================== -->

            <path
                id="itla-pluma"
                d="
                    M0 0
                    C-26 -36 -28 -100 0 -160
                    C28 -100 26 -36 0 0Z
                "
            />


            <!-- ================================================== -->
            <!-- ALA BASE -->
            <!-- ================================================== -->

            <g id="itla-ala-base">

                <path
                    d="
                        M240 292
                        C190 232 120 186 62 176
                        C112 214 170 252 240 306Z
                    "
                    fill="url(#itla-feather-teal)"
                    stroke="#6FFFF2"
                    stroke-width="3"
                />

                <path
                    d="
                        M248 296
                        C214 246 180 210 146 196
                        C172 232 200 262 252 306Z
                    "
                    fill="url(#itla-feather-blue)"
                    stroke="#6FFFF2"
                    stroke-width="3"
                />

                <path
                    d="
                        M236 300
                        C180 268 120 248 58 240
                        C110 268 166 290 238 314Z
                    "
                    fill="url(#itla-feather-gold)"
                    stroke="#FFE99B"
                    stroke-width="3"
                />

                <path
                    d="
                        M236 308
                        C180 300 120 300 66 306
                        C120 320 170 328 236 322Z
                    "
                    fill="url(#itla-wing-galaxy)"
                    stroke="#7AFFF1"
                    stroke-width="3"
                />

                <path
                    d="
                        M240 316
                        C190 332 136 352 96 380
                        C146 370 190 354 238 330Z
                    "
                    fill="url(#itla-feather-blue)"
                    stroke="#74FFF4"
                    stroke-width="3"
                />

                <path
                    d="
                        M244 324
                        C212 354 176 388 140 414
                        C180 406 214 370 242 336Z
                    "
                    fill="url(#itla-feather-gold)"
                    stroke="#FFE99B"
                    stroke-width="3"
                />

                <path
                    d="
                        M248 330
                        C226 366 206 396 186 430
                        C214 418 236 380 252 340Z
                    "
                    fill="url(#itla-feather-teal)"
                    stroke="#6FFFF2"
                    stroke-width="3"
                />

                <path
                    d="
                        M222 300
                        C180 280 130 270 92 268
                    "
                    fill="none"
                    stroke="#FFE9A0"
                    stroke-width="2"
                    opacity=".7"
                />

                <path
                    d="
                        M224 316
                        C180 316 136 332 110 352
                    "
                    fill="none"
                    stroke="#7FFFF0"
                    stroke-width="2"
                    opacity=".6"
                />

            </g>

        </defs>


        <!-- ====================================================== -->
        <!-- ESCENA -->
        <!-- ====================================================== -->

        <g id="itlasuhua-scene">

            <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0; 0 -10; 0 0"
                dur="3.2s"
                repeatCount="indefinite"
            />


            <!-- ================================================== -->
            <!-- AURA -->
            <!-- ================================================== -->

            <ellipse
                id="itla-aura"
                cx="300"
                cy="330"
                rx="285"
                ry="255"
                fill="url(#itla-aura)"
            />


            <!-- ================================================== -->
            <!-- ESTRELLAS DEL FONDO -->
            <!-- ================================================== -->

            <g id="itla-background-stars">

                <circle
                    cx="76"
                    cy="190"
                    r="3"
                    fill="#62FFF1"
                    filter="url(#itla-glow)"
                />

                <circle
                    cx="107"
                    cy="105"
                    r="2"
                    fill="#FFD965"
                />

                <circle
                    cx="145"
                    cy="65"
                    r="3"
                    fill="#FFFFFF"
                />

                <circle
                    cx="457"
                    cy="84"
                    r="2"
                    fill="#FFD95C"
                />

                <circle
                    cx="510"
                    cy="156"
                    r="3"
                    fill="#5DFFF5"
                    filter="url(#itla-glow)"
                />

                <circle
                    cx="550"
                    cy="270"
                    r="2"
                    fill="#FFFFFF"
                />

                <circle
                    cx="72"
                    cy="390"
                    r="2"
                    fill="#FFD35C"
                />

                <circle
                    cx="105"
                    cy="465"
                    r="3"
                    fill="#56F7ED"
                />

                <circle
                    cx="495"
                    cy="455"
                    r="3"
                    fill="#FFD64F"
                />

                <circle
                    cx="535"
                    cy="380"
                    r="2"
                    fill="#FFFFFF"
                />

                <path
                    d="M95 250 l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"
                    fill="#FFF7A5"
                    filter="url(#itla-glow)"
                />

                <path
                    d="M507 345 l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"
                    fill="#65FFF4"
                    filter="url(#itla-glow)"
                />

                <path
                    d="M137 425 l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"
                    fill="#FFD95D"
                />

                <path
                    d="M466 235 l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"
                    fill="#FFFFFF"
                />

            </g>


            <!-- ================================================== -->
            <!-- ALAS -->
            <!-- ================================================== -->

            <g id="itla-wings">

                <g id="ala-izq">

                    <animateTransform
                        attributeName="transform"
                        type="rotate"
                        values="
                            0 240 300;
                            -5 240 300;
                            0 240 300
                        "
                        dur="2.6s"
                        repeatCount="indefinite"
                    />

                    <use
                        href="#itla-ala-base"
                        xlink:href="#itla-ala-base"
                    />

                </g>


                <g id="ala-der">

                    <animateTransform
                        attributeName="transform"
                        type="rotate"
                        values="
                            0 360 300;
                            5 360 300;
                            0 360 300
                        "
                        dur="2.6s"
                        repeatCount="indefinite"
                    />

                    <use
                        href="#itla-ala-base"
                        xlink:href="#itla-ala-base"
                        transform="translate(600 0) scale(-1 1)"
                    />

                </g>

            </g>


            <!-- ================================================== -->
            <!-- COLA TRASERA
                 AHORA MISMO COLOR DEL CUERPO
            -->
            <!-- ================================================== -->

            <g id="itla-cola-trasera">

                ${colaTrasera}

            </g>


            <!-- ================================================== -->
            <!-- VIENTRE -->
            <!-- ================================================== -->

            <path
                d="
                    M264 368
                    C260 410 262 440 270 478
                    L330 478
                    C338 440 340 410 336 368Z
                "
                fill="url(#itla-belly)"
                stroke="#8A6A3E"
                stroke-width="3"
            />


            <g
                fill="none"
                stroke="#A8844E"
                stroke-width="3"
                stroke-linecap="round"
            >

                <path d="M262 392 Q300 402 338 392"/>

                <path d="M264 414 Q300 424 337 414"/>

                <path d="M266 436 Q300 446 335 436"/>

                <path d="M268 458 Q300 468 333 458"/>

            </g>


            <!-- ================================================== -->
            <!-- COLA DELANTERA
                 MISMO COLOR DEL CUERPO
            -->
            <!-- ================================================== -->

            <g id="itla-cola-delantera">

                ${colaDelantera}

                ${puntaDer}

            </g>


            <!-- ================================================== -->
            <!-- PLUMAS DE LA COLA -->
            <!-- ================================================== -->

            <g
                id="itla-plumas-cola"
                filter="url(#itla-shadow)"
            >

                ${plumasCola}

            </g>


            <!-- ================================================== -->
            <!-- PENACHO -->
            <!-- ================================================== -->

            <g
                id="itla-penacho"
                filter="url(#itla-shadow)"
            >

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(204 300) rotate(-112) scale(.6)"
                    fill="url(#itla-feather-gold)"
                    stroke="#FFE79A"
                    stroke-width="3"
                />

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(396 300) rotate(112) scale(.6)"
                    fill="url(#itla-feather-gold)"
                    stroke="#FFE79A"
                    stroke-width="3"
                />

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(300 230) rotate(-80) scale(.8)"
                    fill="url(#itla-feather-teal)"
                    stroke="#6FFFF2"
                    stroke-width="3"
                />

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(300 230) rotate(-58) scale(.95)"
                    fill="url(#itla-feather-gold)"
                    stroke="#FFE99B"
                    stroke-width="3"
                />

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(300 230) rotate(-36) scale(1)"
                    fill="url(#itla-feather-blue)"
                    stroke="#74FFF4"
                    stroke-width="3"
                />

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(300 230) rotate(-15) scale(1.08)"
                    fill="url(#itla-feather-teal)"
                    stroke="#6FFFF2"
                    stroke-width="3"
                />

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(300 230) rotate(0) scale(1.15)"
                    fill="url(#itla-feather-gold)"
                    stroke="#FFE99B"
                    stroke-width="3"
                />

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(300 230) rotate(15) scale(1.08)"
                    fill="url(#itla-feather-teal)"
                    stroke="#6FFFF2"
                    stroke-width="3"
                />

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(300 230) rotate(36) scale(1)"
                    fill="url(#itla-feather-blue)"
                    stroke="#74FFF4"
                    stroke-width="3"
                />

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(300 230) rotate(58) scale(.95)"
                    fill="url(#itla-feather-gold)"
                    stroke="#FFE99B"
                    stroke-width="3"
                />

                <use
                    href="#itla-pluma"
                    xlink:href="#itla-pluma"
                    transform="translate(300 230) rotate(80) scale(.8)"
                    fill="url(#itla-feather-teal)"
                    stroke="#6FFFF2"
                    stroke-width="3"
                />

            </g>


            <!-- ================================================== -->
            <!-- CABEZA -->
            <!-- ================================================== -->

            <g
                id="itla-cabeza"
                filter="url(#itla-shadow)"
            >

                <ellipse
                    cx="300"
                    cy="280"
                    rx="112"
                    ry="104"
                    fill="url(#itla-face)"
                    stroke="#2B2038"
                    stroke-width="5"
                />


                <!-- Mejillas -->

                <ellipse
                    cx="224"
                    cy="334"
                    rx="15"
                    ry="8"
                    fill="#FF8FA3"
                    opacity=".6"
                />

                <ellipse
                    cx="376"
                    cy="334"
                    rx="15"
                    ry="8"
                    fill="#FF8FA3"
                    opacity=".6"
                />


                <!-- ================================================= -->
                <!-- OJO IZQUIERDO -->
                <!-- ================================================= -->

                <g
                    id="itla-ojo-izq"
                    class="itla-ojo"
                >

                    <ellipse
                        cx="250"
                        cy="296"
                        rx="40"
                        ry="46"
                        fill="#0B1436"
                        stroke="#151026"
                        stroke-width="5"
                    />

                    <ellipse
                        cx="250"
                        cy="296"
                        rx="34"
                        ry="41"
                        fill="url(#itla-eye-cyan)"
                        filter="url(#itla-glow)"
                    />

                    <circle
                        cx="238"
                        cy="282"
                        r="2.5"
                        fill="#FFFFFF"
                    />

                    <circle
                        cx="262"
                        cy="312"
                        r="2"
                        fill="#FFF6A0"
                    />

                    <circle
                        cx="244"
                        cy="318"
                        r="1.8"
                        fill="#FFFFFF"
                    />

                    <circle
                        cx="262"
                        cy="276"
                        r="1.5"
                        fill="#FFFFFF"
                    />

                    <ellipse
                        cx="240"
                        cy="280"
                        rx="8"
                        ry="11"
                        fill="#FFFFFF"
                        opacity=".95"
                    />

                    <circle
                        cx="260"
                        cy="314"
                        r="4"
                        fill="#FFFFFF"
                        opacity=".8"
                    />

                </g>


                <!-- ================================================= -->
                <!-- OJO DERECHO -->
                <!-- ================================================= -->

                <g
                    id="itla-ojo-der"
                    class="itla-ojo"
                >

                    <ellipse
                        cx="350"
                        cy="296"
                        rx="40"
                        ry="46"
                        fill="#291A1A"
                        stroke="#151026"
                        stroke-width="5"
                    />

                    <ellipse
                        cx="350"
                        cy="296"
                        rx="34"
                        ry="41"
                        fill="url(#itla-eye-gold)"
                        filter="url(#itla-glow)"
                    />

                    <circle
                        cx="338"
                        cy="282"
                        r="2.5"
                        fill="#FFFFFF"
                    />

                    <circle
                        cx="362"
                        cy="312"
                        r="2"
                        fill="#FFF6A0"
                    />

                    <circle
                        cx="344"
                        cy="318"
                        r="1.8"
                        fill="#FFFFFF"
                    />

                    <circle
                        cx="362"
                        cy="276"
                        r="1.5"
                        fill="#FFFFFF"
                    />

                    <ellipse
                        cx="340"
                        cy="280"
                        rx="8"
                        ry="11"
                        fill="#FFFFFF"
                        opacity=".95"
                    />

                    <circle
                        cx="360"
                        cy="314"
                        r="4"
                        fill="#FFFFFF"
                        opacity=".8"
                    />

                </g>


                <!-- ================================================= -->
                <!-- NARIZ -->
                <!-- ================================================= -->

                <path
                    d="M294 322 Q300 327 306 322"
                    fill="none"
                    stroke="#6B4E36"
                    stroke-width="3"
                    stroke-linecap="round"
                />


                <!-- ================================================= -->
                <!-- SONRISA -->
                <!-- ================================================= -->

                <path
                    id="itla-sonrisa"
                    d="M280 342 Q300 360 320 342"
                    fill="none"
                    stroke="#3A2030"
                    stroke-width="4.5"
                    stroke-linecap="round"
                />


                <!-- ================================================= -->
                <!-- BOCA ABIERTA -->
                <!-- ================================================= -->

                <g id="itla-boca-abierta">

                    <ellipse
                        cx="300"
                        cy="352"
                        rx="13"
                        ry="10"
                        fill="#4A1A34"
                        stroke="#2B1020"
                        stroke-width="3"
                    />

                    <ellipse
                        cx="300"
                        cy="357"
                        rx="8"
                        ry="4"
                        fill="#FF7A9A"
                    />

                </g>

            </g>


            <!-- ================================================== -->
            <!-- CORONA -->
            <!-- ================================================== -->

            <g
                id="itla-corona"
                filter="url(#itla-shadow)"
            >

                <path
                    d="
                        M194 230
                        L194 200
                        L212 200
                        L212 184
                        L232 184
                        L232 168
                        L268 168
                        L268 140
                        L300 112
                        L332 140
                        L332 168
                        L368 168
                        L368 184
                        L388 184
                        L388 200
                        L406 200
                        L406 230
                        Q300 246 194 230Z
                    "
                    fill="url(#itla-gold)"
                    stroke="#6D421B"
                    stroke-width="5"
                />


                <path
                    d="M204 206 Q300 222 396 206"
                    fill="none"
                    stroke="#FFF1A0"
                    stroke-width="2"
                    opacity=".7"
                />


                <circle
                    cx="212"
                    cy="214"
                    r="10"
                    fill="#16D7D0"
                    stroke="#6D421B"
                    stroke-width="4"
                    class="itla-gema"
                />


                <circle
                    cx="250"
                    cy="200"
                    r="9"
                    fill="#FFD83D"
                    stroke="#6D421B"
                    stroke-width="4"
                />


                <circle
                    cx="300"
                    cy="190"
                    r="14"
                    fill="#1BD8D2"
                    stroke="#6D421B"
                    stroke-width="5"
                    filter="url(#itla-glow)"
                    class="itla-gema"
                />


                <circle
                    cx="350"
                    cy="200"
                    r="9"
                    fill="#FFD83D"
                    stroke="#6D421B"
                    stroke-width="4"
                />


                <circle
                    cx="388"
                    cy="214"
                    r="10"
                    fill="#16D7D0"
                    stroke="#6D421B"
                    stroke-width="4"
                    class="itla-gema"
                />


                <circle
                    cx="300"
                    cy="190"
                    r="5"
                    fill="#BFFFF8"
                />


                <path
                    d="
                        M286 168
                        L286 130
                        L300 112
                        L314 130
                        L314 168Z
                    "
                    fill="url(#itla-gold)"
                    stroke="#6D421B"
                    stroke-width="4"
                />


                <circle
                    cx="300"
                    cy="148"
                    r="6"
                    fill="#1BD8D2"
                    stroke="#6D421B"
                    stroke-width="3"
                />

            </g>


            <!-- ================================================== -->
            <!-- DESTELLOS -->
            <!-- ================================================== -->

            <g id="itla-sparkles">

                <path
                    d="M164 280 l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"
                    fill="#FFF7A1"
                    filter="url(#itla-glow)"
                />

                <path
                    d="M436 280 l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"
                    fill="#62FFF3"
                    filter="url(#itla-glow)"
                />

                <path
                    d="M150 380 l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"
                    fill="#FFD65C"
                />

                <path
                    d="M450 380 l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"
                    fill="#FFFFFF"
                />

                <circle
                    cx="186"
                    cy="410"
                    r="3"
                    fill="#4EFFF1"
                />

                <circle
                    cx="414"
                    cy="410"
                    r="3"
                    fill="#FFD94F"
                />

            </g>

        </g>

    </svg>
    `;


    // ============================================================
    // LOG
    // ============================================================

    function log(msg) {

        console.log(
            '[Itlasuhua/Pet]',
            msg
        );

    }


    // ============================================================
    // POLVO ARCOÍRIS
    // ============================================================

    let dustLayer = null;

    let idleTimer = null;


    function spit(cantidad, fuerza) {

        const container =
            document.getElementById(
                'itlasuhua-container'
            );

        if (!container) return;


        cantidad =
            cantidad || 10;


        fuerza =
            fuerza || 1;


        if (
            !dustLayer ||
            !dustLayer.isConnected
        ) {

            dustLayer =
                document.createElement('div');

            dustLayer.className =
                'itla-dust-layer';

            container.appendChild(
                dustLayer
            );

        }


        for (
            let i = 0;
            i < cantidad;
            i++
        ) {

            const p =
                document.createElement('span');


            p.className =
                'itla-dust';


            const hue =
                Math.floor(
                    Math.random() * 360
                );


            const size =
                5 +
                Math.random() * 7;


            const dx =
                (
                    Math.random() * 2 -
                    1
                ) *
                (
                    60 +
                    50 * fuerza
                );


            const dy =
                50 +
                Math.random() *
                (
                    90 +
                    70 * fuerza
                );


            const dur =
                1.0 +
                Math.random() * 0.8;


            p.style.setProperty(
                '--h',
                hue
            );


            p.style.setProperty(
                '--s',
                size + 'px'
            );


            p.style.setProperty(
                '--dx',
                dx + 'px'
            );


            p.style.setProperty(
                '--dy',
                dy + 'px'
            );


            p.style.setProperty(
                '--t',
                dur + 's'
            );


            p.addEventListener(
                'animationend',
                () => p.remove()
            );


            dustLayer.appendChild(
                p
            );

        }

    }


    // ============================================================
    // IDLE
    // ============================================================

    function scheduleIdleSpit() {

        clearTimeout(
            idleTimer
        );


        if (reduceMotion) return;


        idleTimer =
            setTimeout(
                () => {

                    if (!document.hidden) {

                        spit(
                            4,
                            0.6
                        );

                    }


                    scheduleIdleSpit();

                },
                3500 +
                Math.random() * 4000
            );

    }


    // ============================================================
    // RENDER
    // ============================================================

    const render = (
        containerId
    ) => {

        const container =
            document.getElementById(
                containerId
            );


        if (!container) {

            console.warn(
                `[Itlasuhua] Contenedor "${containerId}" no encontrado.`
            );

            return;
        }


        container.innerHTML =
            svgString;


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
            '✅ SVG renderizado en #' +
            containerId
        );

    };


    // ============================================================
    // OBTENER SVG
    // ============================================================

    const getSVG = () => {

        return document.getElementById(
            'itlasuhua-svg'
        );

    };


    // ============================================================
    // OBTENER ALAS
    // ============================================================

    const getWings = () => {

        return document.querySelectorAll(
            '#itlasuhua-svg #ala-izq, #itlasuhua-svg #ala-der'
        );

    };


    // ============================================================
    // PERSISTENCIA DE POSICIÓN
    // ============================================================

    function guardarPosicion(
        x,
        y
    ) {

        try {

            localStorage.setItem(
                POS_KEY,
                JSON.stringify({
                    x,
                    y
                })
            );

        } catch (e) {}

    }


    function cargarPosicion() {

        try {

            const raw =
                localStorage.getItem(
                    POS_KEY
                );


            if (!raw) {
                return null;
            }


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
    // CREAR WIDGET
    // ============================================================

    const crearWidget = () => {

        if (
            document.getElementById(
                'itlasuhua-container'
            )
        ) {

            return;

        }


        const cont =
            document.createElement(
                'div'
            );


        cont.id =
            'itlasuhua-container';


        document.body.appendChild(
            cont
        );


        const posGuardada =
            cargarPosicion();


        if (posGuardada) {

            const ancho =
                cont.offsetWidth ||
                300;


            const alto =
                cont.offsetHeight ||
                300;


            const maxX =
                window.innerWidth -
                ancho;


            const maxY =
                window.innerHeight -
                alto;


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


        // ========================================================
        // DRAG
        // ========================================================

        let isDragging =
            false;


        let hasMoved =
            false;


        let dragStartX =
            0;


        let dragStartY =
            0;


        let posStartX =
            0;


        let posStartY =
            0;


        cont.addEventListener(
            'pointerdown',
            function (e) {

                isDragging =
                    true;


                hasMoved =
                    false;


                dragStartX =
                    e.clientX;


                dragStartY =
                    e.clientY;


                try {

                    const rect =
                        cont.getBoundingClientRect();


                    posStartX =
                        rect.left;


                    posStartY =
                        rect.top;

                } catch (err) {

                    posStartX =
                        0;


                    posStartY =
                        0;

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

                if (!isDragging) {
                    return;
                }


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

                    hasMoved =
                        true;

                }


                if (!hasMoved) {
                    return;
                }


                let newX =
                    posStartX +
                    dx;


                let newY =
                    posStartY +
                    dy;


                const ancho =
                    cont.offsetWidth ||
                    300;


                const alto =
                    cont.offsetHeight ||
                    300;


                const maxX =
                    window.innerWidth -
                    ancho;


                const maxY =
                    window.innerHeight -
                    alto;


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

                if (!isDragging) {
                    return;
                }


                isDragging =
                    false;


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

                    // Toque sin arrastrar:
                    // pequeño estallido de polvo.

                    spit(
                        14,
                        1.2
                    );

                }

            }
        );


        cont.addEventListener(
            'pointercancel',
            function () {

                isDragging =
                    false;


                cont.classList.remove(
                    'itlasuhua-dragging'
                );

            }
        );


        // ========================================================
        // 🎙️ v3.3: Click → Voz híbrida
        // ========================================================
        // Primer toque: saludo ceremonial + escucha
        // Toques siguientes: conversación
        // Si está hablando/escuchando: detiene
        // ========================================================

        cont.addEventListener(
            'click',
            function (e) {

                if (hasMoved) {
                    hasMoved = false;
                    return;
                }

                if (
                    window.ItlasuhuaVoice &&
                    typeof window.ItlasuhuaVoice.onAvatarTap === 'function'
                ) {

                    window.ItlasuhuaVoice.onAvatarTap();

                }

            }
        );


        scheduleIdleSpit();


        log(
            '✅ Widget Itlasuhua creado · arrastrable + voz'
        );

    };


    // ============================================================
    // API GLOBAL
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
        '✅ Itlasuhua Pet cargado'
    );


})(window);