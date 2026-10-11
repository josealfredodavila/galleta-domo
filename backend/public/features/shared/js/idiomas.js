// ================================================================
// IDIOMAS · I18N GLOBAL DE SARIEL'S ECOSYSTEM · v6
//
// Compatible con:
// - data-clave, data-clave-title, data-placeholder, data-vars
// - <title data-clave="..."> y <html lang> dinámicos
// - window.t(), window.tConFallback(), window.obtenerTraduccionReal()
// - window.aplicarTraducciones(), window.aplicarTraduccionesDinamicas()
// - window.esperarIdiomas() (promesa, idempotente)
// - window.inicializarIdiomas() (idempotente)
//
// CAMBIOS v6:
// - Se elimina la clave pública hardcodeada. getSupabaseClient() usa
//   SOLO window.supabaseClient (lo crea auth-global.js o el HTML).
// - Nueva función interpolarVariables(): reemplaza {x} por valores.
// - t() y tConFallback() aceptan un 3er argumento opcional "vars".
// - aplicarTraducciones() lee el atributo data-vars de cada elemento
//   (JSON) y lo pasa a interpolarVariables().
//
// CAMBIOS v5 (se mantienen):
// - inicializarIdiomas() idempotente.
// - esperarIdiomas() permite que cualquier script espere.
// - data-clave-title traduce el atributo title.
// - <title data-clave> y <html lang> se actualizan.
// - MutationObserver traduce elementos dinámicos.
// - data-i18n-ok evita re-procesar en bucle.
// ================================================================

// ================================================================
// OBTENER CLIENTE SUPABASE
// ================================================================
// v6: ya no se crea un cliente nuevo con credenciales hardcodeadas.
// Si no hay window.supabaseClient, es porque auth-global.js o el
// bloque centralizado del HTML aún no lo crearon. Los llamadores
// deben esperar (ver inicializarIdiomasInterno, que reintenta).

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
// Si una variable no existe en vars, deja {clave} tal cual (para no
// perder información visible en pantalla).
// Ej: interpolarVariables("Hola {nombre}", {nombre: "Alfredo"})
//     => "Hola Alfredo"

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
        return match; // deja {clave} si no hay valor
    });
}

// ================================================================
// OBTENER EL IDIOMA DEL USUARIO
// ================================================================

async function obtenerIdiomaUsuario() {
    try {
        const client = getSupabaseClient();

        if (!client) {
            idiomaActual = IDIOMA_DEFAULT;
            window.idiomaActual = idiomaActual;
            return idiomaActual;
        }

        // 1. Perfil del usuario (fuente de verdad)
        const session = await getSession();

        if (session && session.user) {
            const {
                data: usuario,
                error: errUsuario
            } = await client
                .from('usuarios')
                .select('idioma_preferido_id')
                .eq('id', session.user.id)
                .maybeSingle();

            if (
                !errUsuario &&
                usuario &&
                usuario.idioma_preferido_id
            ) {
                const { data: idioma } = await client
                    .from('idiomas_sistema')
                    .select('*')
                    .eq('id', usuario.idioma_preferido_id)
                    .maybeSingle();

                if (idioma) {
                    idiomaActual = idioma;
                    window.idiomaActual = idiomaActual;
                    return idioma;
                }
            }
        }

        // 2. localStorage (visitantes o cuando no hay perfil)
        let localId = null;

        try {
            localId = localStorage.getItem('idioma_preferido');
        } catch (e) {
            console.warn('⚠️ No se pudo leer idioma_preferido:', e);
        }

        if (localId) {
            const { data: idioma } = await client
                .from('idiomas_sistema')
                .select('*')
                .eq('id', localId)
                .maybeSingle();

            if (idioma) {
                idiomaActual = idioma;
                window.idiomaActual = idiomaActual;
                return idioma;
            }
        }

        // 3. Idioma por defecto: es-MX
        const { data: idiomaDefault } = await client
            .from('idiomas_sistema')
            .select('*')
            .eq('codigo', 'es-MX')
            .eq('activo', true)
            .maybeSingle();

        idiomaActual = idiomaDefault || IDIOMA_DEFAULT;
        window.idiomaActual = idiomaActual;

        return idiomaActual;
    } catch (error) {
        console.error('Error obteniendo idioma:', error);

        idiomaActual = IDIOMA_DEFAULT;
        window.idiomaActual = idiomaActual;

        return idiomaActual;
    }
}

// ================================================================
// CARGAR TRADUCCIONES DEL IDIOMA ACTUAL
// ================================================================

async function cargarTraducciones(idiomaId) {
    try {
        const client = getSupabaseClient();

        if (!client || !idiomaId) {
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
// Devuelve el valor crudo de la traducción, o null si no existe.

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
// t() y tConFallback() aceptan un 3er argumento opcional `vars`:
// - Si se pasa, los {x} se reemplazan por los valores.
// - Si no se pasa, se devuelve el texto sin interpolar (comportamiento
//   anterior, retrocompatible).

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
//
// - Sin hijos: reemplaza el contenido completo.
// - Con hijos (iconos, spans): cambia solo el primer nodo de texto
//   no vacío y conserva espacios. Si no hay texto directo, lo inserta.
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
// Espera un JSON: <span data-vars='{"nombre":"Alfredo"}'>
// Si es inválido, se ignora sin romper.

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

        // DATA-CLAVE (texto) + DATA-VARS (interpolación)
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

        // DATA-CLAVE-TITLE (atributo title)
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

        // DATA-PLACEHOLDER (atributo placeholder)
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
//
// Traduce elementos que el JS agrega después de cargar la página.
// Solo mira nodos agregados (childList), no cambios de texto, para
// no entrar en bucle con las propias traducciones.
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

        const client = getSupabaseClient();

        if (!client) {
            select.innerHTML = '<option value="es-MX" selected>🌐 Español</option>';
            return;
        }

        select.innerHTML = '';

        const { data, error } = await client
            .from('idiomas_sistema')
            .select('id, codigo, nombre, nombre_nativo, bandera')
            .eq('activo', true)
            .order('nombre', { ascending: true });

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            select.innerHTML = '<option value="es-MX" selected>🌐 Español</option>';
            return;
        }

        const idiomaUsuario = await obtenerIdiomaUsuario();
        const idiomaIdActual = idiomaUsuario?.id;
        const codigosVistos = new Set();

        data.forEach(idioma => {
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
// Cualquier página que cargue este archivo queda traducida.
// Como es idempotente, si otra página también lo llama, no duplica nada.

inicializarIdiomas();

console.log('✅ Sistema de idiomas v6 cargado');