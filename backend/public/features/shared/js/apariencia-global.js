/* ================================================================
   SARIEL'S ECOSYSTEM · APARIENCIA GLOBAL v4.0 (Producción)
   ================================================================ */

(function () {
    'use strict';

    const KEYS = { tema: 'mostrar_tema', tamano_fuente: 'mostrar_tamano_fuente', color_acento: 'mostrar_color_acento' };
    const DEFAULTS = { tema: 'sistema', tamano_fuente: 100, color_acento: '#D4AF37' };
    const TEMAS_VALIDOS = ['sistema', 'dia', 'noche', 'bn'];

    let prefsActuales = { ...DEFAULTS };
    let inicializacionEnCurso = null;

    // --- UTILIDADES BÁSICAS ---
    function getSupabase() {
        return window.supabaseClient || window.supabase || null;
    }
    
    function leerPref(clave, defecto) {
        try { const valor = localStorage.getItem(clave); return valor !== null ? valor : defecto; } catch (_) { return defecto; }
    }

    function normalizarPreferencias(datos) {
        datos = datos || {};
        return {
            tema: TEMAS_VALIDOS.includes(datos.tema) ? datos.tema : DEFAULTS.tema,
            tamano_fuente: Number.isFinite(Number(datos.tamano_fuente)) ? Math.max(80, Math.min(140, Number(datos.tamano_fuente))) : DEFAULTS.tamano_fuente,
            color_acento: typeof datos.color_acento === 'string' && /^#[0-9a-fA-F]{6}$/.test(datos.color_acento) ? datos.color_acento : DEFAULTS.color_acento
        };
    }

    function leerDeLocalStorage() {
        return normalizarPreferencias({
            tema: leerPref(KEYS.tema, DEFAULTS.tema),
            tamano_fuente: leerPref(KEYS.tamano_fuente, DEFAULTS.tamano_fuente),
            color_acento: leerPref(KEYS.color_acento, DEFAULTS.color_acento)
        });
    }

    async function leerDeSupabase() {
        try {
            const client = getSupabase();
            if (!client) return null;
            const { data: { session } } = await client.auth.getSession();
            if (!session) return null;

            const resultado = await client.from('preferencias_usuario').select('prefs').eq('usuario_id', session.user.id).maybeSingle();
            if (resultado.error || !resultado.data?.prefs) return null;

            const prefs = resultado.data.prefs;
            return normalizarPreferencias({
                tema: prefs.mostrar_tema, tamano_fuente: prefs.mostrar_tamano_fuente, color_acento: prefs.mostrar_color_acento
            });
        } catch (error) { return null; }
    }

    async function guardarPref(clave, valor) {
        try { localStorage.setItem(clave, String(valor)); } catch (e) {}
        const client = getSupabase();
        if (!client) return;

        try {
            const { data: { session } } = await client.auth.getSession();
            if (!session) return;
            const keyPrefs = clave === KEYS.tema ? 'mostrar_tema' : clave === KEYS.tamano_fuente ? 'mostrar_tamano_fuente' : clave === KEYS.color_acento ? 'mostrar_color_acento' : clave;

            const resultadoActual = await client.from('preferencias_usuario').select('prefs').eq('usuario_id', session.user.id).maybeSingle();
            const nuevoPrefs = { ...(resultadoActual.data?.prefs || {}), [keyPrefs]: valor };
            await client.from('preferencias_usuario').upsert({ usuario_id: session.user.id, prefs: nuevoPrefs }, { onConflict: 'usuario_id' });
        } catch (error) {}
    }

    // --- APLICAR CSS ---
    function aplicarTema(tema) { 
        document.documentElement.classList.remove('tema-dia', 'tema-noche', 'tema-bn'); 
        document.documentElement.setAttribute('data-tema', tema); 
        document.documentElement.classList.add('tema-' + tema); 
    }
    function aplicarColorAcento(color) { 
        document.documentElement.style.setProperty('--accent', color); 
        document.documentElement.style.setProperty('--gold', color); 
    }
    function aplicarTamanoFuente(porcentaje) { 
        document.documentElement.style.fontSize = (16 * porcentaje / 100) + 'px'; 
    }

    function aplicarTodo(prefs) {
        const p = normalizarPreferencias(prefs || prefsActuales);
        aplicarTema(p.tema); 
        aplicarColorAcento(p.color_acento); 
        aplicarTamanoFuente(p.tamano_fuente);
        prefsActuales = { ...p };
    }

    // --- LÓGICA DE MASCOTA ---
    async function getMascotaActivaDB() {
        try {
            let intentos = 0;
            while (!getSupabase() && intentos < 20) { await new Promise(r => setTimeout(r, 100)); intentos++; }
            const client = getSupabase();
            if (!client) return 'marquinhos';
            const { data: { session } } = await client.auth.getSession();
            if (!session) return 'marquinhos'; // Si no hay sesión, siempre Marquinhos

            const { data, error } = await client.from('usuarios').select('mascota_activa').eq('id', session.user.id).single();
            if (error || !data || !data.mascota_activa) return 'marquinhos';
            return data.mascota_activa;
        } catch (e) { return 'marquinhos'; }
    }

    function inyectarMascota(mascota) {
        if (mascota === 'ninguna') return;

        const rutasExcluidas = ['/login', '/registro', '/pagar', '/checkout', '/legal', '/centro-ayuda', '/eliminar-cuenta'];
        if (rutasExcluidas.some(r => window.location.pathname.includes(r))) return;

        const inyectarCSS = (id, src) => { if (!document.getElementById(id)) { const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; link.href = src; document.head.appendChild(link); } };
        const inyectarJS = (id, src, callback) => { if (!document.getElementById(id)) { const script = document.createElement('script'); script.id = id; script.src = src; script.defer = true; if (callback) script.onload = callback; document.head.appendChild(script); } };

        if (mascota === 'marquinhos') {
            inyectarCSS('mq-css', '/features/marquinhos/marquinhos-pet.css');
            inyectarJS('mq-boca', '/features/marquinhos/marquinhos-boca.js');
            inyectarJS('mq-fit', '/features/marquinhos/marquinhos-fit.js');
            inyectarJS('mq-acc', '/features/marquinhos/marquinhos-accesorios-svg.js');
            inyectarJS('mq-anim', '/features/marquinhos/marquinhos-animaciones.js');
            inyectarJS('mq-pet', '/features/marquinhos/marquinhos-pet.js');
            inyectarJS('mq-brain', '/features/marquinhos/marquinhos-brain.js');
        } else if (mascota === 'capitan-maiz') {
            inyectarCSS('cm-css', '/features/capitan-maiz/capitan-maiz-pet.css');
            inyectarJS('cm-fit', '/features/capitan-maiz/capitan-maiz-fit.js');
            inyectarJS('cm-pet', '/features/capitan-maiz/capitan-maiz-pet.js');
            inyectarJS('cm-brain', '/features/capitan-maiz/capitan-maiz-brain.js');
        } else if (mascota === 'itlasuhua') {
            inyectarCSS('it-css', '/features/itlasuhua/itlasuhua-pet.css');
            inyectarJS('it-pet', '/features/itlasuhua/itlasuhua-pet.js', () => { if (window.ItlasuhuaPet && window.ItlasuhuaPet.crearWidget) window.ItlasuhuaPet.crearWidget(); });
            inyectarJS('it-brain', '/features/itlasuhua/itlasuhua-brain.js');
            inyectarJS('it-voice', '/features/itlasuhua/itlasuhua-voice.js');
        }
    }

    // --- INICIALIZACIÓN ---
    async function inicializar() {
        if (inicializacionEnCurso) return inicializacionEnCurso;
        inicializacionEnCurso = (async function () {
            aplicarTodo(leerDeLocalStorage());
            
            let intentos = 0;
            while (!getSupabase() && intentos < 20) { await new Promise(r => setTimeout(r, 100)); intentos++; }

            const prefsSupabase = await leerDeSupabase();
            if (prefsSupabase) aplicarTodo(prefsSupabase);
        })();
        try { await inicializacionEnCurso; } finally { inicializacionEnCurso = null; }
    }

    // Arrancamos
    inicializar();
    document.addEventListener('DOMContentLoaded', () => aplicarTodo());

    // Exponemos API
    window.SarielApariencia = {
        aplicar: aplicarTodo, 
        setTema: (t) => { prefsActuales.tema = t; aplicarTema(t); return guardarPref(KEYS.tema, t); },
        setColor: (c) => { prefsActuales.color_acento = c; aplicarColorAcento(c); return guardarPref(KEYS.color_acento, c); },
        setFuente: (f) => { prefsActuales.tamano_fuente = f; aplicarTamanoFuente(f); return guardarPref(KEYS.tamano_fuente, f); }
    };

    // Ejecutamos la inyección de la mascota de forma asíncrona
    (async () => {
        const mascota = await getMascotaActivaDB();
        console.log('[Apariencia] Mascota activa cargada desde DB:', mascota);
        inyectarMascota(mascota);
    })();

})();