// ================================================================
// GRUPOS · UTILIDADES
// ================================================================
// Helpers generales: sesión, escape HTML, toast, moderación de texto.
// Depende de: grupos-config.js
// ================================================================

// ================================================================
// HELPERS BÁSICOS
// ================================================================
function grpOk(r) {
    if (r && r.error) throw r.error;
    return r;
}

async function esperarSupabase() {
    for (var i = 0; i < 10; i++) {
        if (window.supabaseClient) return true;
        await new Promise(function(r) { setTimeout(r, 300); });
    }
    return false;
}

async function grpGetSession() {
    try {
        if (!window.supabaseClient) {
            console.warn('[Grupos] supabaseClient no disponible');
            return null;
        }
        var r = await window.supabaseClient.auth.getSession();
        return r.data.session;
    } catch (e) {
        console.error('[Grupos] Error sesión:', e);
        return null;
    }
}

function grpEscapeHTML(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function grpSafeUrl(u) {
    if (!u) return '';
    return (typeof u === 'string' && u.startsWith('https://')) ? u : '';
}

async function grpCargarLiveKit() {
    return await import('https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.esm.mjs');
}

// ================================================================
// TOAST (notificaciones emergentes)
// ================================================================
function grpShowToast(msg, type, ms) {
    var t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show';
    if (type === 'error') t.classList.add('error');
    else if (type === 'warning') t.classList.add('warning');
    else if (type === 'success') t.classList.add('success');
    else t.classList.remove('error', 'warning', 'success');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(function() { t.classList.remove('show'); }, ms || 3500);
}

// ================================================================
// CARGA DEL USUARIO ACTUAL
// ================================================================
async function cargarUsuarioActual() {
    try {
        var session = await grpGetSession();
        if (!session) { sessionUser = null; return null; }
        sessionUser = session.user;
        var result = await window.supabaseClient
            .from('usuarios')
            .select('nombre, handle, tokens')
            .eq('id', session.user.id)
            .single();
        if (!result.error && result.data) {
            var badge = document.getElementById('tokenBadgeCantidad');
            if (badge) badge.textContent = result.data.tokens || 0;
        }
        return result.data || null;
    } catch (e) {
        console.error('[Grupos] Error cargando usuario:', e);
        return null;
    }
}

// ================================================================
// 🚫 MODERACIÓN · NORMALIZAR TEXTO
// ================================================================
function normalizarTexto(texto) {
    if (!texto) return '';
    return texto.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,;:!?¿¡\-_\(\)\[\]\{\}\/\\|@#$%^&*+=~`"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function contienePalabrasDeCategoria(texto, categoria) {
    if (!texto || !CATEGORIAS_BLOQUEADAS[categoria]) return false;
    const textoNorm = normalizarTexto(texto);
    return CATEGORIAS_BLOQUEADAS[categoria].some(function(palabra) {
        const palabraNorm = normalizarTexto(palabra);
        if (!palabraNorm) return false;
        if (palabraNorm.includes(' ')) return textoNorm.includes(palabraNorm);
        const regex = new RegExp('\\b' + palabraNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        return regex.test(textoNorm);
    });
}

function detectarInfraccion(texto) {
    const resultado = { bloqueado: false, categorias: [] };
    if (!texto) return resultado;
    for (const cat in CATEGORIAS_BLOQUEADAS) {
        if (contienePalabrasDeCategoria(texto, cat)) {
            resultado.bloqueado = true;
            resultado.categorias.push(NOMBRES_CATEGORIAS[cat] || cat);
        }
    }
    return resultado;
}

function contienePalabrasCripto(texto) {
    return contienePalabrasDeCategoria(texto, 'activos_digitales');
}

function validarTextoPermitido(texto, nombreCampo) {
    if (!texto) return true;
    var inf = detectarInfraccion(texto);
    if (inf.bloqueado) {
        var cats = inf.categorias.join(', ');
        grpShowToast((nombreCampo || 'Contenido') + ' bloqueado: ' + cats, 'error', 6000);
        return false;
    }
    return true;
}