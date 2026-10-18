<!DOCTYPE html>
<html lang="es" class="tema-negro sariel-tema-negro">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuración · Apariencia</title>
    <style>
        /* =========================================================
           ESTILOS BASE (Basados en tu captura)
           ========================================================= */
        :root {
            --bg-color: #000000;
            --surface-color: #080808;
            --border-color: #292929;
            --text-primary: #FFFFFF;
            --text-muted: #A7A7A7;
            --accent: #D4AF37; /* Se sobreescribe con JS */
        }

        body {
            margin: 0;
            padding: 0;
            background-color: var(--bg-color);
            color: var(--text-primary);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
        }

        /* Header */
        .cfg-header {
            display: flex;
            align-items: center;
            padding: 16px;
            border-bottom: 1px solid var(--border-color);
            gap: 16px;
            background: var(--bg-color);
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .cfg-header-back {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 2px solid #3b3b5c;
            background: transparent;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }

        .cfg-header-titles h1 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
        }

        .cfg-header-titles p {
            margin: 4px 0 0;
            font-size: 14px;
            color: var(--text-muted);
        }

        /* Contenido principal */
        .cfg-content {
            padding: 16px;
            max-width: 600px;
            margin: 0 auto;
            padding-bottom: 100px;
        }

        .cfg-section-title {
            font-size: 12px;
            font-weight: 700;
            color: #7f7fb5; /* Color morado de la captura */
            letter-spacing: 0.5px;
            margin: 24px 0 12px;
            text-transform: uppercase;
        }

        /* Grid de Temas (4 opciones) */
        .theme-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
        }

        .theme-btn {
            background: var(--surface-color);
            border: 2px solid var(--border-color);
            border-radius: 12px;
            padding: 12px 4px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            color: var(--text-primary);
            transition: border-color 0.2s, background 0.2s;
        }

        .theme-btn.active {
            border-color: #5c5cff;
            background: rgba(92, 92, 255, 0.1);
        }

        .theme-btn span {
            font-size: 12px;
            font-weight: 500;
        }

        .theme-icon {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #111;
        }

        .theme-icon svg {
            width: 24px;
            height: 24px;
        }

        /* Grid de Colores */
        .color-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 12px;
            margin-bottom: 24px;
        }

        .color-btn {
            width: 100%;
            aspect-ratio: 1;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .color-btn.active::after {
            content: "✓";
            color: white;
            font-size: 16px;
            font-weight: bold;
            text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }

        /* Slider de fuente */
        .font-slider-container {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 32px;
        }
        
        .font-slider-container span {
            font-size: 14px;
            color: var(--text-muted);
        }

        input[type=range] {
            flex: 1;
            -webkit-appearance: none;
            background: transparent;
        }

        input[type=range]::-webkit-slider-runnable-track {
            width: 100%;
            height: 4px;
            background: #333;
            border-radius: 2px;
        }

        input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 20px;
            width: 20px;
            border-radius: 50%;
            background: var(--accent);
            margin-top: -8px;
            cursor: pointer;
        }

        /* Preview */
        .preview-card {
            background: var(--surface-color);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 16px;
            display: flex;
            gap: 12px;
            position: relative;
            overflow: hidden;
        }

        .preview-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, #333, #111);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            flex-shrink: 0;
        }

        .preview-text {
            flex: 1;
        }

        .preview-text h3 {
            margin: 0 0 4px;
            font-size: 16px;
        }

        .preview-text p {
            margin: 0;
            font-size: 14px;
            line-height: 1.4;
        }
        
        .preview-mascot {
            position: absolute;
            right: 10px;
            bottom: -10px;
            width: 80px;
            opacity: 0.9;
        }

    </style>
</head>
<body>

    <!-- HEADER -->
    <header class="cfg-header">
        <button class="cfg-header-back" onclick="history.back()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div class="cfg-header-titles">
            <h1>Mostrar</h1>
            <p>Tema · Fuente · Color</p>
        </div>
    </header>

    <!-- CONTENIDO -->
    <main class="cfg-content">

        <!-- TEMA -->
        <h2 class="cfg-section-title">TEMA</h2>
        <div class="theme-grid">
            
            <!-- OPCIÓN 1: SISTEMA -->
            <button class="theme-btn" data-theme="sistema" onclick="cambiarTema('sistema', this)">
                <div class="theme-icon" style="background: #fff; color: #000;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
                </div>
                <span>Sistema</span>
            </button>

            <!-- OPCIÓN 2: DÍA -->
            <button class="theme-btn" data-theme="dia" onclick="cambiarTema('dia', this)">
                <div class="theme-icon" style="background: #fff; color: #000;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                </div>
                <span>Día</span>
            </button>

            <!-- OPCIÓN 3: NOCHE -->
            <button class="theme-btn" data-theme="noche" onclick="cambiarTema('noche', this)">
                <div class="theme-icon" style="background: #1a1a1a; color: #5c5cff;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                </div>
                <span>Noche</span>
            </button>

            <!-- OPCIÓN 4: NEGRO (NUEVA) -->
            <button class="theme-btn" data-theme="negro" onclick="cambiarTema('negro', this)">
                <div class="theme-icon" style="background: #000; color: #fff; border: 1px solid #333;">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </div>
                <span>Negro</span>
            </button>

        </div>

        <!-- COLOR DE ACENTO -->
        <h2 class="cfg-section-title">COLOR DE ACENTO</h2>
        <div class="color-grid" id="colorGrid">
            <!-- Los colores se generan con JS -->
        </div>

        <!-- TAMAÑO DE FUENTE -->
        <h2 class="cfg-section-title">TAMAÑO DE FUENTE</h2>
        <div class="font-slider-container">
            <span style="font-size: 12px;">Aa</span>
            <input type="range" id="fontSlider" min="80" max="140" value="100" oninput="cambiarFuente(this.value)">
            <span style="font-size: 24px;">Aa</span>
        </div>
        <div style="text-align: center; color: var(--accent); font-weight: bold; margin-top: -20px; margin-bottom: 30px;" id="fontValue">100%</div>

        <!-- VISTA PREVIA -->
        <h2 class="cfg-section-title">VISTA PREVIA</h2>
        <div class="preview-card">
            <div class="preview-avatar">💎</div>
            <div class="preview-text">
                <h3>Explorador</h3>
                <p style="color: var(--text-muted); font-size: 12px;">@explorador · ahora</p>
                <p style="margin-top: 8px;">Así se ve el texto con tus preferencias actuales. Ajusta el tamaño y color.</p>
            </div>
        </div>

    </main>

    <!-- =========================================================
         SCRIPTS DE CONTROL (Vinculación con apariencia-global.js)
         ========================================================= -->
    <script>
        // 1. Paleta de colores (tal como en tu captura)
        const colores = [
            '#D4AF37', '#3b82f6', '#eab308', '#10b981', '#8b5cf6', '#ef4444',
            '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#f43f5e',
            '#f59e0b', '#84cc16', '#22c55e', '#0ea5e9'
        ];

        // 2. Renderizar colores
        const colorGrid = document.getElementById('colorGrid');
        const colorActual = localStorage.getItem('mostrar_color_acento') || '#D4AF37';

        colores.forEach(color => {
            const btn = document.createElement('button');
            btn.className = 'color-btn' + (color === colorActual ? ' active' : '');
            btn.style.backgroundColor = color;
            btn.onclick = () => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Llamada al archivo global
                if (window.SarielApariencia) {
                    window.SarielApariencia.setColor(color);
                }
            };
            colorGrid.appendChild(btn);
        });

        // 3. Inicializar Tema Activo
        function initTema() {
            const temaGuardado = localStorage.getItem('mostrar_tema') || 'negro';
            const botonActivo = document.querySelector(`.theme-btn[data-theme="${temaGuardado}"]`);
            
            if (botonActivo) {
                botonActivo.classList.add('active');
            } else {
                // Fallback al botón "Sistema" o "Negro"
                document.querySelector('.theme-btn[data-theme="negro"]').classList.add('active');
            }
        }

        // 4. Cambiar Tema
        function cambiarTema(tema, btn) {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (window.SarielApariencia) {
                window.SarielApariencia.setTema(tema);
            } else {
                console.warn("Esperando a que apariencia-global.js cargue...");
                // Fallback local por si acaso
                localStorage.setItem('mostrar_tema', tema);
                document.documentElement.setAttribute('data-tema', tema);
            }
        }

        // 5. Cambiar Fuente
        function cambiarFuente(valor) {
            document.getElementById('fontValue').textContent = valor + '%';
            if (window.SarielApariencia) {
                window.SarielApariencia.setFuente(valor);
            }
        }

        // 6. Inicializar valores de la fuente
        function initFuente() {
            const fuenteGuardada = localStorage.getItem('mostrar_tamano_fuente') || '100';
            document.getElementById('fontSlider').value = fuenteGuardada;
            document.getElementById('fontValue').textContent = fuenteGuardada + '%';
        }

        // Ejecutar al cargar
        initTema();
        initFuente();
    </script>
</body>
</html>