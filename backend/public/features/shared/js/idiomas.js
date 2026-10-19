// ================================================================
// IDIOMAS · I18N GLOBAL DE SARIEL'S ECOSYSTEM · v7
//
// Compatible con:
// - data-clave, data-clave-title, data-placeholder, data-vars
// - <title data-clave="..."> y <html lang> dinámicos
// - window.t(), window.tConFallback(), window.obtenerTraduccionReal()
// - window.aplicarTraducciones(), window.aplicarTraduccionesDinamicas()
// - window.esperarIdiomas() (promesa, idempotente)
// - window.inicializarIdiomas() (idempotente)
//
// CAMBIOS v7 (reducción de egress):
// - La preferencia de idioma se resuelve UNA sola vez por página
//   (antes se consultaba dos veces: inicialización y selector).
// - Cache en localStorage con TTL para:
//     · preferencia de idioma por usuario (1 h)
//     · lista de idiomas activos (24 h)
//     · traducciones por idioma (12 h)
// - cambiarIdioma() invalida la cache de preferencia antes de recargar.
// - El selector reutiliza la lista ya cargada (sin consulta extra).
// - API pública idéntica a v6.
// ================================================================

// ================================================================
// CONFIGURACIÓN DE CACHE
// ================================================================

const I18N_CACHE_PREFIJO = 'sariels_i18n_v7';
const TTL_PREFERENCIA_MS = 60 * 60 * 1000;          // 1 hora
const TTL_LISTA_IDIOMAS_MS = 24 * 60 * 60 * 1000;   // 24 horas
const TTL_TRADUCCIONES_MS = 12 * 60 * 60 * 1000;    // 12 horas

function leerCacheI18n(clave, ttl) {
    try {
        const raw = localStorage.getItem(clave);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj.ts !== 'number') return null;
        if (Date.now() - obj.ts > ttl) return null;
        return obj.data ?? null;
    } catch (e) {
        return null;
    }
}

function guardarCacheI18n(clave, data) {
    try {
        localStorage.setItem(clave, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {
        // Cache llena o modo privado: seguimos sin cache
    }
}

function borrarCacheI18n(clave) {
    try { localStorage.removeItem(clave); } catch (e) {}
}

// ================================================================
// OBTENER CLIENTE SUPABASE
// ================================================================
// No se crea un cliente nuevo: se usa window.supabaseClient, creado
// por auth-global.js o por el bloque centralizado del HTML.

function getSupabaseClient() {
    if (window.supabaseClient) {
        return window.supabaseClient;
    }
    return null;
}

// ================================================================
// OBTENER SESIÓN
// ================================================================

async function getSession() {
    try {
        const client = getSupabaseClient();

        if (!client) {
            console.warn('⚠️ Supabase no disponible');
            return null;
        }

        const {
            data: { session }
        } = await client.auth.getSession();

        return session;
    } catch (e) {
        console.error('❌ Error obteniendo sesión:', e);
        return null;
    }
}

// ================================================================
// ESTADO GLOBAL DEL SISTEMA I18N
// ================================================================

let idiomaActual = null;
let traducciones = {};
let observadorDinamico = null;
let aplicandoTraducciones = false;
let inicializacionPromesa = null;
let idiomaPromesa = null;          // memo: se resuelve una vez por página
let listaIdiomasPromesa = null;    // memo: lista de idiomas una vez por página

window.traducciones = traducciones;
window.idiomaActual = idiomaActual;

// ================================================================
// IDIOMA POR DEFECTO
// ================================================================

const IDIOMA_DEFAULT = {
    codigo: 'es-MX',
    nombre: 'Español',
    nombre_nativo: 'Español',
    bandera: '🌐'
};

// ================================================================
// INTERPOLAR VARIABLES EN UN TEXTO
// ================================================================
// Reemplaza {clave} por el valor correspondiente en el objeto vars.
// Si una variable no existe en vars, deja {clave} tal cual.

function interpolarVariables(texto, vars) {
    if (texto === null || texto === undefined) {
        return texto;
    }
    if (!vars || typeof vars !== 'object') {
        return String(texto);
    }

    return String(texto).replace(/\{(\w+)\}/g, function (match, clave) {
        if (Object.prototype.hasOwnProperty.call(vars, clave)) {
            const valor = vars[clave];
            return valor === null || valor === undefined ? '' : String(valor);
        }
        return match;
    });
}

// ================================================================
// LISTA DE IDIOMAS ACTIVOS (con cache y memo)
// ================================================================

async function obtenerListaIdiomas() {
    if (listaIdiomasPromesa) return listaIdiomasPromesa;

    listaIdiomasPromesa = (async () => {
        const cacheKey = `${I18N_CACHE_PREFIJO}_lista`;
        const enCache = leerCacheI18n(cacheKey, TTL_LISTA_IDIOMAS_MS);
        if (Array.isArray(enCache) && enCache.length) return enCache;

        const client = getSupabaseClient();
        if (!client) return [];

        const { data, error } = await client
            .from('idiomas_sistema')
            .select('*')
            .eq('activo', true)
            .order('nombre', { ascending: true });

        if (error || !Array.isArray(data)) return [];

        guardarCacheI18n(cacheKey, data);
        return data;
    })();

    return listaIdiomasPromesa;
}

// ================================================================
// OBTENER EL IDIOMA DEL USUARIO (memoizado por página)
// ================================================================

async function obtenerIdiomaUsuario() {
    if (idiomaPromesa) return idiomaPromesa;

    idiomaPromesa = resolverIdiomaUsuario();
    const resultado = await idiomaPromesa;
    idiomaActual = resultado;
    window.idiomaActual = idiomaActual;
    return resultado;
}

async function resolverIdiomaUsuario() {
    try {
        const client = getSupabaseClient();

        if (!client) {
            return IDIOMA_DEFAULT;
        }

        const session = await getSession();
        const userId = session?.user?.id || null;

        // 1. Preferencia del usuario logueado (cache por usuario)
        if (userId) {
            const prefKey = `${I18N_CACHE_PREFIJO}_pref_${userId}`;
            const prefCache = leerCacheI18n(prefKey, TTL_PREFERENCIA_MS);
            if (prefCache && prefCache.codigo) {
                return prefCache;
            }

            const { data: usuario, error: errUsuario } = await client
                .from('usuarios')
                .select('idioma_preferido_id')
                .eq('id', userId)
                .maybeSingle();

            if (!errUsuario && usuario && usuario.idioma_preferido_id) {
                const lista = await obtenerListaIdiomas();
                let idioma = lista.find(i => i.id === usuario.idioma_preferido_id) || null;

                if (!idioma) {
                    const { data } = await client
                        .from('idiomas_sistema')
                        .select('*')
                        .eq('id', usuario.idioma_preferido_id)
                        .maybeSingle();
                    idioma = data || null;
                }

                if (idioma) {
                    guardarCacheI18n(prefKey, idioma);
                    return idioma;
                }
            }
        }

        // 2. Preferencia guardada en este navegador (visitantes)
        let localId = null;
        try {
            localId = localStorage.getItem('idioma_preferido');
        } catch (e) {
            console.warn('⚠️ No se pudo leer idioma_preferido:', e);
        }

        const lista = await obtenerListaIdiomas();

        if (localId) {
            const idioma = lista.find(i => i.id === localId);
            if (idioma) return idioma;
        }

        // 3. Idioma por defecto: es-MX
        const porDefecto = lista.find(i => i.codigo === 'es-MX');
        return porDefecto || IDIOMA_DEFAULT;
    } catch (error) {
        console.error('Error obteniendo idioma:', error);
        return IDIOMA_DEFAULT;
    }
}

// ================================================================
// CARGAR TRADUCCIONES DEL IDIOMA ACTUAL (con cache por idioma)
// ================================================================

async function cargarTraducciones(idiomaId) {
    try {
        if (!idiomaId) {
            traducciones = {};
            window.traducciones = traducciones;
            return traducciones;
        }

        const cacheKey = `${I18N_CACHE_PREFIJO}_tr_${idiomaId}`;
        const enCache = leerCacheI18n(cacheKey, TTL_TRADUCCIONES_MS);
        if (enCache && typeof enCache === 'object') {
            traducciones = enCache;
            window.traducciones = traducciones;
            return traducciones;
        }

        const client = getSupabaseClient();
        if (!client) {
            traducciones = {};
            window.traducciones = traducciones;
            return traducciones;
        }

        const { data, error } = await client
            .from('traducciones')
            .select('clave, valor, modulo')
            .eq('idioma_id', idiomaId);

        if (error) {
            throw error;
        }

        const nuevoMapa = {};

        if (Array.isArray(data)) {
            data.forEach(item => {
                if (!item || !item.clave) {
                    return;
                }
                nuevoMapa[item.clave] = item.valor ?? '';
            });
        }

        guardarCacheI18n(cacheKey, nuevoMapa);
        traducciones = nuevoMapa;
        window.traducciones = traducciones;

        return traducciones;
    } catch (error) {
        console.error('Error cargando traducciones:', error);

        traducciones = {};
        window.traducciones = traducciones;

        return traducciones;
    }
}

// ================================================================
// OBTENER TEXTO TRADUCIDO (sin interpolar)
// ================================================================

function obtenerTraduccionReal(clave, modulo = null) {
    if (!clave) {
        return null;
    }

    const candidatas = [clave];

    if (modulo) {
        candidatas.push(`${modulo}_${clave}`);
    }

    for (const k of candidatas) {
        if (Object.prototype.hasOwnProperty.call(traducciones, k)) {
            const valor = traducciones[k];

            if (
                valor !== null &&
                valor !== undefined &&
                String(valor).trim() !== ''
            ) {
                return String(valor);
            }
        }
    }

    return null;
}

// ================================================================
// TRADUCIR + INTERPOLAR
// ================================================================

function t(clave, modulo = null, vars = null) {
    if (!clave) {
        return '';
    }

    const real = obtenerTraduccionReal(clave, modulo);

    if (real !== null) {
        return interpolarVariables(real, vars);
    }

    return String(clave).replace(/_/g, ' ');
}

function tConFallback(clave, fallback = '', modulo = null, vars = null) {
    const real = obtenerTraduccionReal(clave, modulo);

    if (real !== null) {
        return interpolarVariables(real, vars);
    }

    if (fallback !== undefined && fallback !== null) {
        return interpolarVariables(fallback, vars);
    }

    return String(clave).replace(/_/g, ' ');
}

// ================================================================
// ESCRIBIR TEXTO TRADUCIDO SIN BORRAR HIJOS
// ================================================================

function escribirTextoTraducido(el, texto) {
    if (!el.children || el.children.length === 0) {
        el.textContent = texto;
        return;
    }

    const nodos = Array.from(el.childNodes).filter(
        n => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== ''
    );

    if (nodos.length === 0) {
        el.insertBefore(document.createTextNode(texto), el.firstChild);
        return;
    }

    const primero = nodos[0];
    const espacioInicial = (primero.textContent.match(/^\s*/) || [''])[0];
    const espacioFinal = (primero.textContent.match(/\s*$/) || [''])[0];

    primero.textContent = espacioInicial + texto + espacioFinal;

    nodos.slice(1).forEach(n => {
        n.textContent = '';
    });
}

// ================================================================
// SELECCIONAR ELEMENTOS (la raíz también cuenta)
// ================================================================

function elementosConAtributo(raiz, selector) {
    const lista = [];

    if (!raiz) {
        return lista;
    }

    if (raiz.nodeType === 1 && raiz.matches && raiz.matches(selector)) {
        lista.push(raiz);
    }

    if (raiz.querySelectorAll) {
        lista.push(...raiz.querySelectorAll(selector));
    }

    return lista;
}

// ================================================================
// LEER VARIABLES DE UN ELEMENTO (data-vars)
// ================================================================

function leerVarsDeElemento(el) {
    if (!el || !el.hasAttribute || !el.hasAttribute('data-vars')) {
        return null;
    }
    const raw = el.getAttribute('data-vars');
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (e) {
        console.warn('⚠️ data-vars inválido en', el, e);
        return null;
    }
}

// ================================================================
// TÍTULO DE PÁGINA E IDIOMA DEL HTML
// ================================================================

function aplicarMetaPagina() {
    try {
        const tituloEl = document.querySelector('title[data-clave]');

        if (tituloEl) {
            const traduccion = obtenerTraduccionReal(
                tituloEl.getAttribute('data-clave')
            );

            if (traduccion !== null) {
                document.title = traduccion;
            }
        }

        const codigo = obtenerCodigoIdiomaActual();

        if (codigo) {
            document.documentElement.setAttribute('lang', codigo);
        }
    } catch (e) {
        console.warn('⚠️ No se pudo aplicar meta de página:', e);
    }
}

// ================================================================
// APLICAR TRADUCCIONES
// ================================================================

function aplicarTraducciones(raiz = document) {
    try {
        if (!raiz) {
            raiz = document;
        }

        const codigo = obtenerCodigoIdiomaActual();

        aplicandoTraducciones = true;

        elementosConAtributo(raiz, '[data-clave]').forEach(el => {
            if (el.hasAttribute('data-no-traducir')) {
                return;
            }

            const clave = el.getAttribute('data-clave');

            if (!clave) {
                return;
            }

            let traduccion = obtenerTraduccionReal(
                clave,
                el.getAttribute('data-modulo') || null
            );

            if (traduccion !== null) {
                const vars = leerVarsDeElemento(el);
                if (vars) {
                    traduccion = interpolarVariables(traduccion, vars);
                }
                escribirTextoTraducido(el, traduccion);
            }

            el.setAttribute('data-i18n-ok', codigo);
        });

        elementosConAtributo(raiz, '[data-clave-title]').forEach(el => {
            if (el.hasAttribute('data-no-traducir')) {
                return;
            }

            let traduccion = obtenerTraduccionReal(
                el.getAttribute('data-clave-title')
            );

            if (traduccion !== null) {
                const vars = leerVarsDeElemento(el);
                if (vars) {
                    traduccion = interpolarVariables(traduccion, vars);
                }
                el.setAttribute('title', traduccion);
            }
        });

        elementosConAtributo(raiz, '[data-placeholder]').forEach(el => {
            if (el.hasAttribute('data-no-traducir')) {
                return;
            }

            let traduccion = obtenerTraduccionReal(
                el.getAttribute('data-placeholder')
            );

            if (traduccion !== null) {
                const vars = leerVarsDeElemento(el);
                if (vars) {
                    traduccion = interpolarVariables(traduccion, vars);
                }
                el.setAttribute('placeholder', traduccion);
            }
        });

        if (raiz === document) {
            aplicarMetaPagina();
        }

        return true;
    } catch (error) {
        console.error('❌ Error aplicando traducciones:', error);
        return false;
    } finally {
        aplicandoTraducciones = false;
    }
}

function aplicarTraduccionesDinamicas(raiz = document) {
    return aplicarTraducciones(raiz);
}

// ================================================================
// OBSERVADOR DE CONTENIDO DINÁMICO
// ================================================================

function iniciarObservadorDinamico() {
    if (observadorDinamico || !window.MutationObserver || !document.body) {
        return;
    }

    observadorDinamico = new MutationObserver(function (mutaciones) {
        const codigo = obtenerCodigoIdiomaActual();
        const pendientes = [];

        mutaciones.forEach(function (mutacion) {
            mutacion.addedNodes.forEach(function (nodo) {
                if (
                    nodo.nodeType === 1 &&
                    nodo.getAttribute('data-i18n-ok') !== codigo
                ) {
                    pendientes.push(nodo);
                }
            });
        });

        pendientes.forEach(function (nodo) {
            if (document.contains(nodo)) {
                aplicarTraducciones(nodo);
            }
        });
    });

    observadorDinamico.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// ================================================================
// CÓDIGO DEL IDIOMA ACTUAL
// ================================================================

function obtenerCodigoIdiomaActual() {
    return (
        idiomaActual?.codigo ||
        window.idiomaActual?.codigo ||
        IDIOMA_DEFAULT.codigo
    );
}

function esIdioma(codigo) {
    return obtenerCodigoIdiomaActual() === codigo;
}

// ================================================================
// CAMBIAR EL IDIOMA DEL USUARIO
// ================================================================

async function cambiarIdioma(idiomaId) {
    try {
        if (!idiomaId) {
            return;
        }

        try {
            localStorage.setItem('idioma_preferido', idiomaId);
        } catch (e) {
            console.warn('⚠️ No se pudo guardar idioma_preferido:', e);
        }

        const session = await getSession();

        if (session && session.user) {
            const client = getSupabaseClient();

            // Invalidar la cache de preferencia del usuario
            borrarCacheI18n(`${I18N_CACHE_PREFIJO}_pref_${session.user.id}`);

            if (client) {
                const { error } = await client
                    .from('usuarios')
                    .update({ idioma_preferido_id: idiomaId })
                    .eq('id', session.user.id);

                if (error) {
                    console.warn('⚠️ No se pudo guardar idioma en perfil:', error);
                }
            }
        }

        window.location.reload();
    } catch (error) {
        console.error('Error cambiando idioma:', error);

        if (typeof window.showToast === 'function') {
            window.showToast('❌ Error al cambiar idioma', 'error');
        }
    }
}

// ================================================================
// CARGAR SELECTOR DE IDIOMAS (solo si la página tiene #selectorIdioma)
// ================================================================

async function cargarSelectorIdiomas() {
    try {
        const select = document.getElementById('selectorIdioma');

        if (!select) {
            return;
        }

        const lista = await obtenerListaIdiomas();

        if (!lista || lista.length === 0) {
            select.innerHTML = '<option value="es-MX" selected>🌐 Español</option>';
            return;
        }

        const idiomaUsuario = await obtenerIdiomaUsuario();
        const idiomaIdActual = idiomaUsuario?.id;
        const codigosVistos = new Set();

        select.innerHTML = '';

        lista.forEach(idioma => {
            if (!idioma || !idioma.codigo || codigosVistos.has(idioma.codigo)) {
                return;
            }

            codigosVistos.add(idioma.codigo);

            const option = document.createElement('option');

            option.value = idioma.id;
            option.textContent =
                `${idioma.bandera || '🌐'} ${idioma.nombre_nativo || idioma.nombre || idioma.codigo}`;

            if (idioma.id === idiomaIdActual) {
                option.selected = true;
            }

            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error cargando selector de idiomas:', error);

        const select = document.getElementById('selectorIdioma');

        if (select) {
            select.innerHTML = '<option value="es-MX" selected>🌐 Español</option>';
        }
    }
}

// ================================================================
// INICIALIZACIÓN (idempotente)
// ================================================================

async function inicializarIdiomasInterno() {
    try {
        if (document.readyState === 'loading') {
            await new Promise(resolve =>
                document.addEventListener('DOMContentLoaded', resolve, { once: true })
            );
        }

        let intentos = 0;

        while (!getSupabaseClient() && intentos < 30) {
            await new Promise(resolve => setTimeout(resolve, 100));
            intentos++;
        }

        const idioma = await obtenerIdiomaUsuario();

        if (idioma && idioma.id) {
            await cargarTraducciones(idioma.id);
        }

        aplicarTraducciones(document);
        iniciarObservadorDinamico();

        await cargarSelectorIdiomas();
    } catch (error) {
        console.error('Error inicializando idiomas:', error);

        try {
            await cargarSelectorIdiomas();
        } catch (e) {
            console.warn('⚠️ Error cargando selector:', e);
        }
    }

    return true;
}

function inicializarIdiomas() {
    if (!inicializacionPromesa) {
        inicializacionPromesa = inicializarIdiomasInterno();
    }

    return inicializacionPromesa;
}

function esperarIdiomas() {
    return inicializarIdiomas();
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================

window.getSession = getSession;
window.getSupabaseClient = getSupabaseClient;
window.obtenerIdiomaUsuario = obtenerIdiomaUsuario;
window.cargarTraducciones = cargarTraducciones;
window.t = t;
window.tConFallback = tConFallback;
window.obtenerTraduccionReal = obtenerTraduccionReal;
window.interpolarVariables = interpolarVariables;
window.cambiarIdioma = cambiarIdioma;
window.aplicarTraducciones = aplicarTraducciones;
window.aplicarTraduccionesDinamicas = aplicarTraduccionesDinamicas;
window.cargarSelectorIdiomas = cargarSelectorIdiomas;
window.inicializarIdiomas = inicializarIdiomas;
window.esperarIdiomas = esperarIdiomas;
window.obtenerCodigoIdiomaActual = obtenerCodigoIdiomaActual;
window.esIdioma = esIdioma;

// ================================================================
// AUTO-ARRANQUE
// ================================================================

inicializarIdiomas();

console.log('✅ Sistema de idiomas v7 cargado');