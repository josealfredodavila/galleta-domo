// ================================================================
// ITLASUHUA · PET · SVG
// ================================================================
// Rey Itlasuhua, serpiente cósmica.
// Renderiza el SVG y expone API pública.
// ================================================================

(function (window) {
    'use strict';

    if (window.__itlasuhuaPetLoaded) return;
    window.__itlasuhuaPetLoaded = true;

    const svgString = `
    <svg
        id="itlasuhua-svg"
        class="itlasuhua-svg"
        viewBox="0 0 600 600"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Rey Itlasuhua, serpiente cósmica"
    >

        <defs>

            <!-- FONDOS Y GRADIENTES -->
            <linearGradient id="itla-skin" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#7EE7D8"/>
                <stop offset="38%" stop-color="#19C7C4"/>
                <stop offset="72%" stop-color="#1777A9"/>
                <stop offset="100%" stop-color="#513A8E"/>
            </linearGradient>

            <linearGradient id="itla-skin-dark" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#263B72"/>
                <stop offset="45%" stop-color="#171D57"/>
                <stop offset="100%" stop-color="#0A1030"/>
            </linearGradient>

            <linearGradient id="itla-belly" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FFE7A0"/>
                <stop offset="45%" stop-color="#F7C978"/>
                <stop offset="100%" stop-color="#B97842"/>
            </linearGradient>

            <linearGradient id="itla-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FFF0A6"/>
                <stop offset="22%" stop-color="#FFD45A"/>
                <stop offset="52%" stop-color="#E5A72E"/>
                <stop offset="78%" stop-color="#FFF09A"/>
                <stop offset="100%" stop-color="#9D641D"/>
            </linearGradient>

            <linearGradient id="itla-feather-teal" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#075A78"/>
                <stop offset="30%" stop-color="#00AEB5"/>
                <stop offset="60%" stop-color="#43E6D6"/>
                <stop offset="100%" stop-color="#B5FFF1"/>
            </linearGradient>

            <linearGradient id="itla-feather-blue" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#152B77"/>
                <stop offset="35%" stop-color="#126F9E"/>
                <stop offset="65%" stop-color="#21C8D1"/>
                <stop offset="100%" stop-color="#8CF5EA"/>
            </linearGradient>

            <linearGradient id="itla-feather-gold" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#D38A2B"/>
                <stop offset="38%" stop-color="#FFD76D"/>
                <stop offset="70%" stop-color="#FFF0A5"/>
                <stop offset="100%" stop-color="#FFE28A"/>
            </linearGradient>

            <radialGradient id="itla-face">
                <stop offset="0%" stop-color="#FFF3C9"/>
                <stop offset="65%" stop-color="#DDD4A9"/>
                <stop offset="100%" stop-color="#A99E7D"/>
            </radialGradient>

            <radialGradient id="itla-eye-cyan">
                <stop offset="0%" stop-color="#FFFFFF"/>
                <stop offset="20%" stop-color="#A9FFFF"/>
                <stop offset="50%" stop-color="#18D8D2"/>
                <stop offset="80%" stop-color="#1260A1"/>
                <stop offset="100%" stop-color="#081A49"/>
            </radialGradient>

            <radialGradient id="itla-eye-gold">
                <stop offset="0%" stop-color="#FFFFFF"/>
                <stop offset="18%" stop-color="#FFF6A2"/>
                <stop offset="48%" stop-color="#FFD52D"/>
                <stop offset="80%" stop-color="#E67D16"/>
                <stop offset="100%" stop-color="#5B2A19"/>
            </radialGradient>

            <linearGradient id="itla-galaxy" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#11183F"/>
                <stop offset="22%" stop-color="#29266A"/>
                <stop offset="42%" stop-color="#46317E"/>
                <stop offset="62%" stop-color="#164B76"/>
                <stop offset="80%" stop-color="#0D7F8D"/>
                <stop offset="100%" stop-color="#171A4A"/>
            </linearGradient>

            <linearGradient id="itla-wing-purple" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#10245D"/>
                <stop offset="45%" stop-color="#49347C"/>
                <stop offset="70%" stop-color="#1D7FA0"/>
                <stop offset="100%" stop-color="#31D7CC"/>
            </linearGradient>

            <!-- FILTROS -->
            <filter id="itla-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="4" result="blur"/>
                <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>

            <filter id="itla-soft-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="2"/>
            </filter>

            <filter id="itla-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000000" flood-opacity=".55"/>
            </filter>

            <!-- PATRONES -->
            <pattern id="itla-stars" width="70" height="70" patternUnits="userSpaceOnUse">
                <circle cx="8" cy="12" r="1.5" fill="#FFFFFF"/>
                <circle cx="33" cy="27" r="1" fill="#8FFAFF"/>
                <circle cx="56" cy="10" r="1.3" fill="#FFD95A"/>
                <circle cx="19" cy="52" r="1.2" fill="#FFFFFF"/>
                <circle cx="49" cy="57" r="1.5" fill="#73EFFF"/>
            </pattern>

        </defs>

        <!-- ESCALA GENERAL -->
        <g id="itlasuhua-scene">
            <animateTransform attributeName="transform" type="translate" values="0 0; 0 -3; 0 0" dur="4s" repeatCount="indefinite"/>

            <!-- BRILLO TRASERO -->
            <ellipse cx="300" cy="355" rx="245" ry="215" fill="#07112F" opacity=".35"/>
            <ellipse cx="300" cy="270" rx="205" ry="180" fill="#0A3552" opacity=".15" filter="url(#itla-soft-glow)"/>

            <!-- ESTRELLAS DEL FONDO -->
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

            <!-- GRAN ABANICO DE PLUMAS TRASERO -->
            <g id="itla-feather-crown" filter="url(#itla-shadow)">
                <g id="feather-center">
                    <path d="M300 215 C280 160 278 92 300 35 C322 92 320 160 300 215Z" fill="url(#itla-feather-teal)" stroke="#7EFFF2" stroke-width="3"/>
                    <path d="M300 48 C300 105 300 160 300 208" stroke="#0A5D70" stroke-width="4" fill="none"/>
                    <path d="M300 80 L284 68 M300 105 L280 92 M300 130 L279 116 M300 155 L281 143 M300 180 L284 170" stroke="#8FFFF2" stroke-width="2"/>
                </g>

                <path d="M286 215 C246 157 220 92 222 52 C270 84 293 145 302 207Z" fill="url(#itla-feather-blue)" stroke="#74FFF4" stroke-width="3"/>
                <path d="M229 61 C254 104 278 158 293 207" stroke="#0B6683" stroke-width="4" fill="none"/>

                <path d="M314 215 C354 157 380 92 378 52 C330 84 307 145 298 207Z" fill="url(#itla-feather-blue)" stroke="#74FFF4" stroke-width="3"/>
                <path d="M371 61 C346 104 322 158 307 207" stroke="#0B6683" stroke-width="4" fill="none"/>

                <path d="M266 211 C231 158 199 111 194 71 C231 78 263 124 281 194Z" fill="url(#itla-feather-gold)" stroke="#FFE99B" stroke-width="3"/>
                <path d="M334 211 C369 158 401 111 406 71 C369 78 337 124 319 194Z" fill="url(#itla-feather-gold)" stroke="#FFE99B" stroke-width="3"/>

                <path d="M245 226 C191 189 148 139 139 99 C189 111 231 150 263 207Z" fill="url(#itla-feather-teal)" stroke="#69FFF2" stroke-width="3"/>
                <path d="M355 226 C409 189 452 139 461 99 C411 111 369 150 337 207Z" fill="url(#itla-feather-teal)" stroke="#69FFF2" stroke-width="3"/>

                <path d="M226 237 C169 217 116 177 100 141 C152 142 202 174 248 219Z" fill="url(#itla-feather-gold)" stroke="#FFE99B" stroke-width="3"/>
                <path d="M374 237 C431 217 484 177 500 141 C448 142 398 174 352 219Z" fill="url(#itla-feather-gold)" stroke="#FFE99B" stroke-width="3"/>

                <path d="M211 250 C145 247 88 221 62 181 C126 181 183 202 229 231Z" fill="url(#itla-feather-blue)" stroke="#76FFF4" stroke-width="3"/>
                <path d="M389 250 C455 247 512 221 538 181 C474 181 417 202 371 231Z" fill="url(#itla-feather-blue)" stroke="#76FFF4" stroke-width="3"/>
            </g>

            <!-- ALAS PRINCIPALES -->
            <g id="itla-wings">
                <g id="ala-izq">
                    <animateTransform attributeName="transform" type="rotate" values="0 222 300; -4 222 300; 0 222 300" dur="2.4s" repeatCount="indefinite"/>

                    <path d="M238 278 C190 239 130 219 73 231 C100 252 122 280 155 296 C112 294 83 310 60 337 C117 335 173 321 224 302Z" fill="url(#itla-wing-purple)" stroke="#5DFFF1" stroke-width="4"/>
                    <path d="M228 287 C175 266 127 259 83 269 C124 281 162 295 212 303" fill="none" stroke="#79FFF1" stroke-width="3" opacity=".8"/>
                    <path d="M210 299 C164 305 119 319 82 337" fill="none" stroke="#FFD873" stroke-width="3"/>
                    <path d="M190 305 C154 316 126 330 106 348" fill="none" stroke="#36D9DB" stroke-width="4"/>

                    <path d="M204 292 C165 272 125 255 93 250 C117 276 152 294 201 306Z" fill="#159CB0"/>
                    <path d="M191 306 C151 304 112 309 82 321 C119 332 155 328 196 315Z" fill="#0D708E"/>
                </g>

                <g id="ala-der">
                    <animateTransform attributeName="transform" type="rotate" values="0 378 300; 4 378 300; 0 378 300" dur="2.4s" repeatCount="indefinite"/>

                    <path d="M362 278 C410 239 470 219 527 231 C500 252 478 280 445 296 C488 294 517 310 540 337 C483 335 427 321 376 302Z" fill="url(#itla-wing-purple)" stroke="#5DFFF1" stroke-width="4"/>
                    <path d="M372 287 C425 266 473 259 517 269 C476 281 438 295 388 303" fill="none" stroke="#79FFF1" stroke-width="3" opacity=".8"/>
                    <path d="M390 299 C436 305 481 319 518 337" fill="none" stroke="#FFD873" stroke-width="3"/>
                    <path d="M410 305 C446 316 474 330 494 348" fill="none" stroke="#36D9DB" stroke-width="4"/>

                    <path d="M396 292 C435 272 475 255 507 250 C483 276 448 294 399 306Z" fill="#159CB0"/>
                    <path d="M409 306 C449 304 488 309 518 321 C481 332 445 328 404 315Z" fill="#0D708E"/>
                </g>
            </g>

            <!-- CUERPO ENROLLADO -->
            <g id="itla-body">
                <ellipse cx="300" cy="445" rx="190" ry="86" fill="#06143C" opacity=".55" filter="url(#itla-soft-glow)"/>

                <path d="M300 365 C253 371 218 398 205 430 C191 466 213 500 258 514 C307 530 380 516 405 478 C426 447 407 415 371 407 C343 401 318 411 309 429 C300 447 316 460 337 459" fill="none" stroke="#07133A" stroke-width="72" stroke-linecap="round" filter="url(#itla-shadow)"/>

                <path d="M300 365 C253 371 218 398 205 430 C191 466 213 500 258 514 C307 530 380 516 405 478 C426 447 407 415 371 407 C343 401 318 411 309 429 C300 447 316 460 337 459" fill="none" stroke="url(#itla-galaxy)" stroke-width="58" stroke-linecap="round"/>

                <path d="M300 365 C253 371 218 398 205 430 C191 466 213 500 258 514 C307 530 380 516 405 478 C426 447 407 415 371 407 C343 401 318 411 309 429 C300 447 316 460 337 459" fill="none" stroke="url(#itla-stars)" stroke-width="48" stroke-linecap="round" opacity=".9"/>

                <path d="M300 365 C253 371 218 398 205 430 C191 466 213 500 258 514 C307 530 380 516 405 478 C426 447 407 415 371 407" fill="none" stroke="#3CEFE1" stroke-width="2" opacity=".8" filter="url(#itla-glow)"/>

                <g id="itla-scales" fill="none" stroke="#70D8D8" stroke-width="2" opacity=".65">
                    <path d="M228 416 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M250 400 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M277 392 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M305 391 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M335 398 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M363 410 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M217 444 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M242 453 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M270 461 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M300 467 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M331 464 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M361 451 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M238 480 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M267 492 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M298 497 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M330 492 q12 -14 24 0 q-12 14 -24 0"/>
                    <path d="M359 480 q12 -14 24 0 q-12 14 -24 0"/>
                </g>

                <g fill="#FFD86A">
                    <circle cx="233" cy="440" r="3"/>
                    <circle cx="275" cy="418" r="2"/>
                    <circle cx="323" cy="430" r="3"/>
                    <circle cx="372" cy="438" r="2"/>
                    <circle cx="246" cy="481" r="2"/>
                    <circle cx="302" cy="487" r="3"/>
                    <circle cx="354" cy="472" r="2"/>
                </g>

                <g fill="#6FFFF4">
                    <circle cx="258" cy="432" r="2"/>
                    <circle cx="344" cy="417" r="2"/>
                    <circle cx="218" cy="462" r="2"/>
                    <circle cx="330" cy="500" r="2"/>
                </g>
            </g>

            <!-- CUELLO -->
            <g id="itla-neck">
                <path d="M300 274 C274 300 270 334 282 382 C289 406 311 406 320 383 C332 343 327 303 300 274" fill="#08143B" stroke="#07102D" stroke-width="5"/>

                <path d="M300 270 C273 299 269 334 281 382 C288 405 311 405 319 382 C331 343 327 302 300 270" fill="url(#itla-belly)" stroke="#70462E" stroke-width="4"/>

                <g fill="none" stroke="#8A593B" stroke-width="3">
                    <path d="M282 302 Q300 310 323 302"/>
                    <path d="M278 323 Q300 331 326 323"/>
                    <path d="M277 345 Q300 354 324 345"/>
                    <path d="M279 367 Q300 376 321 367"/>
                    <path d="M284 387 Q300 394 317 387"/>
                </g>
            </g>

            <!-- CABEZA -->
            <g id="cabeza-itlasuhua" filter="url(#itla-shadow)">
                <path d="M202 265 C185 245 183 218 196 198 C207 218 220 227 233 238 C222 216 229 193 247 181 C249 211 258 224 270 235" fill="url(#itla-feather-teal)" stroke="#53FFF0" stroke-width="3"/>

                <path d="M398 265 C415 245 417 218 404 198 C393 218 380 227 367 238 C378 216 371 193 353 181 C351 211 342 224 330 235" fill="url(#itla-feather-teal)" stroke="#53FFF0" stroke-width="3"/>

                <ellipse cx="300" cy="255" rx="103" ry="91" fill="url(#itla-face)" stroke="#24203A" stroke-width="6"/>

                <ellipse cx="232" cy="290" rx="19" ry="9" fill="#FF9B9C" opacity=".75"/>
                <ellipse cx="368" cy="290" rx="19" ry="9" fill="#FF9B9C" opacity=".75"/>

                <g id="ojo-izq">
                    <ellipse cx="263" cy="249" rx="30" ry="37" fill="#081842" stroke="#17132B" stroke-width="5"/>
                    <ellipse cx="263" cy="249" rx="25" ry="32" fill="url(#itla-eye-cyan)" filter="url(#itla-glow)"/>
                    <circle cx="251" cy="241" r="3" fill="#FFFFFF"/>
                    <circle cx="270" cy="257" r="2" fill="#FFF6A0"/>
                    <circle cx="257" cy="268" r="2" fill="#FFFFFF"/>
                    <circle cx="278" cy="237" r="2" fill="#FFFFFF"/>
                    <ellipse cx="255" cy="237" rx="7" ry="10" fill="#FFFFFF" opacity=".9"/>
                </g>

                <g id="ojo-der">
                    <ellipse cx="337" cy="249" rx="30" ry="37" fill="#291A1A" stroke="#17132B" stroke-width="5"/>
                    <ellipse cx="337" cy="249" rx="25" ry="32" fill="url(#itla-eye-gold)" filter="url(#itla-glow)"/>
                    <circle cx="325" cy="240" r="3" fill="#FFFFFF"/>
                    <circle cx="344" cy="258" r="2" fill="#FFF6A0"/>
                    <circle cx="331" cy="269" r="2" fill="#FFFFFF"/>
                    <circle cx="352" cy="237" r="2" fill="#FFFFFF"/>
                    <ellipse cx="329" cy="237" rx="7" ry="10" fill="#FFFFFF" opacity=".9"/>
                </g>

                <path d="M235 213 Q262 198 283 213" fill="none" stroke="#30243C" stroke-width="7" stroke-linecap="round"/>
                <path d="M317 213 Q338 198 365 213" fill="none" stroke="#30243C" stroke-width="7" stroke-linecap="round"/>

                <path d="M297 263 Q292 270 300 274 Q308 270 303 263" fill="none" stroke="#54463E" stroke-width="3" stroke-linecap="round"/>

                <path d="M276 282 Q300 303 324 282" fill="none" stroke="#241A29" stroke-width="5" stroke-linecap="round"/>
                <path d="M300 295 Q300 300 307 300" fill="none" stroke="#241A29" stroke-width="3" stroke-linecap="round"/>
            </g>

            <!-- CORONA AZTECA -->
            <g id="itla-crown" filter="url(#itla-shadow)">
                <path d="M203 199 L210 164 L232 174 L238 142 L264 158 L274 121 L300 151 L326 121 L336 158 L362 142 L368 174 L390 164 L397 199 Q300 218 203 199Z" fill="url(#itla-gold)" stroke="#6D421B" stroke-width="5"/>

                <circle cx="220" cy="178" r="13" fill="#16D7D0" stroke="#6D421B" stroke-width="4"/>
                <circle cx="250" cy="164" r="12" fill="#FFD83D" stroke="#6D421B" stroke-width="4"/>
                <circle cx="300" cy="159" r="20" fill="#1BD8D2" stroke="#6D421B" stroke-width="5" filter="url(#itla-glow)"/>
                <circle cx="350" cy="164" r="12" fill="#FFD83D" stroke="#6D421B" stroke-width="4"/>
                <circle cx="380" cy="178" r="13" fill="#16D7D0" stroke="#6D421B" stroke-width="4"/>

                <circle cx="300" cy="159" r="8" fill="#BFFFF8"/>

                <path d="M286 154 L286 112 L300 91 L314 112 L314 154 Z" fill="url(#itla-gold)" stroke="#6D421B" stroke-width="5"/>
                <path d="M300 102 L309 127 L291 127 Z" fill="#FFF1A0" stroke="#6D421B" stroke-width="3"/>
                <rect x="289" y="130" width="22" height="18" rx="3" fill="#FFD74F" stroke="#6D421B" stroke-width="3"/>
            </g>

            <!-- PLUMAS PEQUEÑAS ALREDEDOR DE LA CABEZA -->
            <g id="itla-side-feathers">
                <path d="M207 222 C180 208 157 188 148 164 C177 168 199 184 221 210Z" fill="url(#itla-feather-blue)" stroke="#65FFF1" stroke-width="3"/>
                <path d="M393 222 C420 208 443 188 452 164 C423 168 401 184 379 210Z" fill="url(#itla-feather-blue)" stroke="#65FFF1" stroke-width="3"/>
                <path d="M202 241 C173 239 146 229 128 212 C158 208 185 216 211 230Z" fill="url(#itla-feather-gold)" stroke="#FFE79A" stroke-width="3"/>
                <path d="M398 241 C427 239 454 229 472 212 C442 208 415 216 389 230Z" fill="url(#itla-feather-gold)" stroke="#FFE79A" stroke-width="3"/>
            </g>

            <!-- DESTELLOS -->
            <g id="itla-sparkles">
                <path d="M174 282 l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#FFF7A1" filter="url(#itla-glow)"/>
                <path d="M426 282 l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#62FFF3" filter="url(#itla-glow)"/>
                <path d="M155 365 l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#FFD65C"/>
                <path d="M445 365 l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#FFFFFF"/>
                <circle cx="190" cy="390" r="3" fill="#4EFFF1"/>
                <circle cx="410" cy="390" r="3" fill="#FFD94F"/>
            </g>

        </g>
    </svg>
    `;

    function log(msg) {
        console.log('[Itlasuhua/Pet]', msg);
    }

    const render = (containerId) => {
        const container = document.getElementById(containerId);

        if (!container) {
            console.warn(
                `[Itlasuhua] Contenedor "${containerId}" no encontrado.`
            );
            return;
        }

        container.innerHTML = svgString;
        container.classList.add('itlasuhua-rendered');

        document.dispatchEvent(
            new CustomEvent('itlasuhua:rendered', {
                detail: { containerId }
            })
        );

        log('✅ SVG renderizado en #' + containerId);
    };

    const getSVG = () => document.getElementById('itlasuhua-svg');

    const getWings = () => document.querySelectorAll(
        '#itlasuhua-svg #ala-izq, #itlasuhua-svg #ala-der'
    );

    const crearWidget = () => {
        if (document.getElementById('itlasuhua-container')) return;

        const cont = document.createElement('div');
        cont.id = 'itlasuhua-container';
        document.body.appendChild(cont);

        render('itlasuhua-container');

        log('✅ Widget Itlasuhua creado');
    };

    window.ItlasuhuaPet = {
        render,
        getSVG,
        getWings,
        crearWidget,
        _svgString: svgString
    };

    log('✅ Itlasuhua Pet cargado');

})(window);