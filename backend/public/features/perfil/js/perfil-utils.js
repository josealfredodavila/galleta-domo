// ================================================================
// PERFIL · UTILIDADES
// ================================================================
// Helpers: toast, escape HTML, tiempo relativo, formateo, traducción.
// Depende de: perfil-config.js
//
// CAMBIO v2 (traducciones):
// - La función de traducción del perfil se llama perfilT y se expone
//   también como window.t. Usa window.tConFallback si existe y, si no,
//   devuelve el respaldo en español.
// - window.t queda protegido para que idiomas.js no lo reemplace.
//   Así t(clave, respaldo) siempre devuelve el respaldo cuando falta
//   una traducción, en lugar de mostrar el nombre técnico de la clave.
// ================================================================

// ================================================================
// TRADUCCIONES
// ================================================================
var perfilT = function (clave, respaldo) {
    if (typeof window.tConFallback === 'function') {
        return window.tConFallback(clave, respaldo);
    }

    return respaldo !== undefined ? respaldo : clave;
};

window.perfilT = perfilT;

try {
    // idiomas.js hace window.t = t al cargar. Con writable:false
    // esa asignación no surte efecto y perfilT se conserva.
    Object.defineProperty(window, 't', {
        value: perfilT,
        writable: false,
        configurable: true,
        enumerable: true
    });
} catch (e) {
    window.t = perfilT;
}

async function aplicarI18NPerfil(raiz) {
    try {
        if (typeof window.aplicarTraducciones === 'function') {
            await window.aplicarTraducciones(raiz || document.body);
        }
    } catch (e) {}
}

function traducirPlanMeta(meta) {
    if (!meta || typeof meta !== 'string') return meta;
    var diasT = perfilT('perfil_dias', 'días');
    return meta.replace(/\bd[ií]as?\b/gi, diasT);
}

// ================================================================
// TOAST (notificaciones emergentes)
// ================================================================
function showToast(msg, type, duration) {
    type = type || '';
    duration = duration || 3500;
    var toastEl = document.getElementById('toast');
    if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'toast';
        toastEl.className = 'toast';
        document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = 'toast show';
    toastEl.style.animation = 'none';
    void toastEl.offsetHeight;
    toastEl.style.animation = 'slideInRight 0.3s ease-out';
    if (type === 'error') toastEl.classList.add('error');
    else if (type === 'warning') toastEl.classList.add('warning');
    else if (type === 'success') toastEl.classList.add('success');
    else toastEl.classList.remove('error', 'warning', 'success');
    clearTimeout(toastEl._timeout);
    toastEl._timeout = setTimeout(function () {
        toastEl.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(function () { toastEl.classList.remove('show'); }, 300);
    }, duration);
}

// ================================================================
// ANIMACIONES CSS EXTRA
// ================================================================
function asegurarEstilosPerfil() {
    if (document.getElementById('perfilEstilosExtra')) return;
    var s = document.createElement('style');
    s.id = 'perfilEstilosExtra';
    s.textContent =
        '@keyframes slideInRight{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}' +
        '@keyframes slideOutRight{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(20px)}}' +
        '@keyframes confetiFall{to{transform:translateY(105vh) rotate(720deg);opacity:0.9}}';
    (document.head || document.documentElement).appendChild(s);
}

// ================================================================
// SESIÓN
// ================================================================
async function getSession() {
    if (!cli()) return null;
    try {
        const resultado = await Promise.race([
            window.supabaseClient.auth.getSession(),
            new Promise((resolve) => setTimeout(() => resolve({
                data: null,
                error: new Error('Timeout obteniendo sesión')
            }), SESSION_TIMEOUT_MS))
        ]);
        if (resultado.error) return null;
        return resultado.data?.session || null;
    } catch (error) {
        return null;
    }
}

// ================================================================
// MENSAJES DE ERROR AMIGABLES
// ================================================================
function msgError(e) {
    var m = (e && e.message) ? e.message : String(e || perfilT('perfil_error_desconocido', 'Error desconocido'));
    if (/protected profile field/i.test(m)) return perfilT('perfil_error_solo_servidor', 'Ese dato solo lo puede cambiar el servidor.');
    if (/No autorizado/i.test(m)) return perfilT('perfil_error_permiso', 'No tienes permiso para esta acción.');
    if (/Failed to fetch|NetworkError/i.test(m)) return perfilT('perfil_error_sin_conexion', 'Sin conexión con el servidor.');
    return m;
}

// ================================================================
// ESCAPE HTML
// ================================================================
function escaparHTML(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeHtmlPerfil(texto) {
    if (!texto) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>');
}

// ================================================================
// FORMATEAR TEXTO (hashtags, menciones, negritas, etc.)
// ================================================================
function formatearTexto(texto) {
    if (!texto) return '';
    return escaparHTML(texto)
        .replace(/#(\w+)/g, '<a href="/features/muro/muro.html?tag=$1" class="hashtag" style="color:var(--gold);text-decoration:none;font-weight:600;">#$1</a>')
        .replace(/@(\w+)/g, '<a href="/perfil/$1" class="mencion" style="color:var(--cyan);text-decoration:none;font-weight:600;">@$1</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<em>$1</em>')
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        .replace(/`(.*?)`/g, '<code style="background:var(--bg-card);padding:2px 6px;border-radius:4px;font-family:monospace;">$1</code>');
}

// ================================================================
// TIEMPO RELATIVO
// ================================================================
function haceTiempo(fecha) {
    if (!fecha) return '';
    const diffMin = Math.floor((new Date() - new Date(fecha)) / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return 'hace ' + diffMin + ' min';
    if (diffMin < 1440) return 'hace ' + Math.floor(diffMin / 60) + ' h';
    return 'hace ' + Math.floor(diffMin / 1440) + ' d';
}

// ================================================================
// URL SEGURA DE SUPABASE
// ================================================================
const SUPABASE_PUBLIC_PREFIX = 'https://zultnlogdoajehbswlih.supabase.co/storage/v1/object/public/';

function esUrlSegura(url) {
    return typeof url === 'string' && url.indexOf(SUPABASE_PUBLIC_PREFIX) === 0;
}

// ================================================================
// PERFIL BÁSICO (fallback si no se puede leer Supabase)
// ================================================================
function perfilBasico(session) {
    return {
        id: session.user.id,
        email: session.user.email,
        nombre: session.user.user_metadata?.nombre || perfilT('perfil_nombre_usuario', 'Explorador'),
        handle: session.user.email?.split('@')[0] || 'explorador',
        bio: perfilT('perfil_biografia_default', "Explorando el ecosistema Sariel's · WEB3 · Comunidad"),
        avatar_url: null,
        tokens: 0,
        online: true
    };
}

// ================================================================
// NIVELES
// ================================================================
// El nombre del nivel se traduce en perfil-init.js con la clave
// perfil_nivel_<nombre en minúsculas>.
function calcularNivel(tokens) {
    const niveles = [
        { min: 0, max: 4, nombre: 'Explorador', emoji: '🌱', clave: 'perfil_nivel_explorador' },
        { min: 5, max: 9, nombre: 'Cazador', emoji: '⚡', clave: 'perfil_nivel_cazador' },
        { min: 10, max: 14, nombre: 'Leyenda', emoji: '🏆', clave: 'perfil_nivel_leyenda' },
        { min: 15, max: 19, nombre: 'Maestro', emoji: '👑', clave: 'perfil_nivel_maestro' },
        { min: 20, max: Infinity, nombre: 'Inmortal', emoji: '✨', clave: 'perfil_nivel_inmortal' }
    ];
    for (const nivel of niveles) if (tokens >= nivel.min && tokens <= nivel.max) return nivel;
    return niveles[0];
}

// ================================================================
// UTILIDADES DE ARCHIVOS
// ================================================================
function esUrlSeguraPublica(url) {
    return esUrlSegura(url);
}

// ================================================================
// CREAR AVATAR (con fallback de letra)
// ================================================================
function crearAvatar(usuarioNombre, avatarUrl, size) {
    var letra = (usuarioNombre || '◈').charAt(0).toUpperCase() || '◈';
    if (!esUrlSegura(avatarUrl)) return document.createTextNode(letra);
    var img = document.createElement('img');
    img.alt = 'Avatar';
    img.loading = 'lazy';
    if (size) {
        img.style.width = size + 'px';
        img.style.height = size + 'px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
    } else {
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
    }
    img.addEventListener('error', function() {
        var parent = img.parentNode;
        if (!parent) return;
        img.remove();
        parent.textContent = letra;
    });
    img.src = avatarUrl;
    return img;
}

// ================================================================
// ANIMAR CONTADOR NUMÉRICO
// ================================================================
function animarContador(elemento, inicio, fin) {
    if (!elemento || inicio === fin) return;
    const duracion = 800, paso = 20;
    const incremento = (fin - inicio) / (duracion / paso);
    let actual = inicio;
    const intervalo = setInterval(() => {
        actual += incremento;
        if ((incremento > 0 && actual >= fin) || (incremento < 0 && actual <= fin)) {
            actual = fin;
            clearInterval(intervalo);
        }
        elemento.textContent = Math.round(actual);
    }, paso);
}

// ================================================================
// CONFETI
// ================================================================
function crearConfeti() {
    asegurarEstilosPerfil();
    const colores = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd'];
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confeti = document.createElement('div');
            confeti.style.cssText = 'position: fixed; width: 10px; height: 10px; background: ' + colores[Math.floor(Math.random() * colores.length)] + '; left: ' + (Math.random() * 100) + 'vw; top: -10px; border-radius: ' + (Math.random() > 0.5 ? '50%' : '2px') + '; animation: confetiFall ' + (2 + Math.random() * 3) + 's linear forwards; transform: rotate(' + (Math.random() * 360) + 'deg); z-index: 9998; pointer-events: none;';
            document.body.appendChild(confeti);
            setTimeout(() => confeti.remove(), 5000);
        }, i * 50);
    }
}

function mostrarCelebracion() {
    crearConfeti();
    showToast(perfilT('perfil_transaccion_exitosa', '🎉 ¡Transacción exitosa!'), 'success');
}

// ================================================================
// VISOR DE IMAGEN (lightbox)
// ================================================================
function abrirVisorImagen(src, alt, idModal) {
    if (!src) return;
    const modal = document.createElement('div');
    modal.id = idModal;
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.95); backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 2147483647; cursor: zoom-out; padding: 20px; box-sizing: border-box;';
    const imgFull = document.createElement('img');
    imgFull.src = src;
    imgFull.alt = alt;
    imgFull.style.cssText = 'max-width: 95vw; max-height: 95vh; width: auto; height: auto; object-fit: contain; border-radius: 16px; box-shadow: 0 0 60px rgba(212,175,55,0.5), 0 0 0 3px rgba(212,175,55,0.6); display: block;';
    modal.appendChild(imgFull);
    document.body.appendChild(modal);
    const cerrar = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        modal.remove();
        document.removeEventListener('keydown', onKeyDown);
    };
    const onKeyDown = function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') cerrar();
    };
    modal.addEventListener('click', cerrar);
    imgFull.addEventListener('click', cerrar);
    document.addEventListener('keydown', onKeyDown);
}

// ================================================================
// QR MODAL: agregar estilos al head para el modal de eSIM
// ================================================================
// (ya está en el CSS del HTML original)