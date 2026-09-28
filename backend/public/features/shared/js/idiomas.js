// ================================================================
// IDIOMAS - VERSIÓN COMPLETA Y CORREGIDA
// I18N GLOBAL DE SARIEL'S ECOSYSTEM
//
// Compatible con:
// - window.supabaseClient
// - window.supabase
// - data-clave
// - data-placeholder
// - contenido HTML dinámico
// - window.t()
// - window.tConFallback()
// - window.aplicarTraducciones()
// - window.aplicarTraduccionesDinamicas()
// - window.inicializarIdiomas()
//
// IMPORTANTE:
// - public.traducciones usa: idioma_id, clave, valor, modulo
// - No se crea un segundo sistema de traducciones
//
// FIX (v3):
// - aplicarTraducciones() NUNCA sobrescribe el contenido de un
//   elemento que tenga hijos HTML (children.length > 0).
//   Esto evita que se borren botones, spans, e iconos internos.
// - Se respeta el atributo data-no-traducir="1" para blindar
//   elementos que no deben ser tocados por el sistema.
// - Si un elemento está vacío o solo contiene texto plano, se
//   traduce con textContent. Si tiene hijos, se ignora.
// ================================================================

// ================================================================
// OBTENER CLIENTE SUPABASE
// ================================================================

function getSupabaseClient() {
    // 1. Usar cliente global existente (creado por el bloque del HTML)
    if (window.supabaseClient) {
        return window.supabaseClient;
    }

    // 2. Fallback: crear cliente desde la librería global
    if (
        window.supabase &&
        typeof window.supabase.createClient === 'function'
    ) {
        try {
            // ⚠️ Nota: estas credenciales solo se usan si el bloque
            // centralizado del HTML no pudo crear window.supabaseClient.
            // En producción /api/config/public es la fuente de verdad.
            const client = window.supabase.createClient(
                'https://zultnlogdoajehbswlih.supabase.co',
                'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
            );

            window.supabaseClient = client;

            return client;
        } catch (e) {
            console.warn(
                '⚠️ No se pudo crear cliente Supabase:',
                e
            );
        }
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
        console.error(
            '❌ Error obteniendo sesión:',
            e
        );

        return null;
    }
}

// ================================================================
// ESTADO GLOBAL DEL SISTEMA I18N
// ================================================================

let idiomaActual = null;
let traducciones = {};

// Exponer el objeto globalmente.
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

        // ------------------------------------------------------------
        // 1. Intentar desde el perfil del usuario
        // ------------------------------------------------------------

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
                const {
                    data: idioma
                } = await client
                    .from('idiomas_sistema')
                    .select('*')
                    .eq(
                        'id',
                        usuario.idioma_preferido_id
                    )
                    .maybeSingle();

                if (idioma) {
                    idiomaActual = idioma;
                    window.idiomaActual = idiomaActual;

                    return idioma;
                }
            }
        }

        // ------------------------------------------------------------
        // 2. Intentar desde localStorage
        // ------------------------------------------------------------

        let localId = null;

        try {
            localId = localStorage.getItem(
                'idioma_preferido'
            );
        } catch (e) {
            console.warn(
                '⚠️ No se pudo leer idioma_preferido:',
                e
            );
        }

        if (localId) {
            const {
                data: idioma
            } = await client
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

        // ------------------------------------------------------------
        // 3. Idioma por defecto: es-MX
        // ------------------------------------------------------------

        const {
            data: idiomaDefault
        } = await client
            .from('idiomas_sistema')
            .select('*')
            .eq('codigo', 'es-MX')
            .eq('activo', true)
            .maybeSingle();

        idiomaActual =
            idiomaDefault ||
            IDIOMA_DEFAULT;

        window.idiomaActual = idiomaActual;

        return idiomaActual;
    } catch (error) {
        console.error(
            'Error obteniendo idioma:',
            error
        );

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

        const {
            data,
            error
        } = await client
            .from('traducciones')
            .select(
                'clave, valor, modulo'
            )
            .eq(
                'idioma_id',
                idiomaId
            );

        if (error) {
            throw error;
        }

        // ------------------------------------------------------------
        // Crear nuevo mapa de traducciones
        // ------------------------------------------------------------

        const nuevoMapa = {};

        if (Array.isArray(data)) {
            data.forEach(item => {
                if (
                    !item ||
                    !item.clave
                ) {
                    return;
                }

                // La columna correcta es "valor".
                nuevoMapa[item.clave] =
                    item.valor ?? '';
            });
        }

        traducciones = nuevoMapa;

        // Sincronizar referencia global
        window.traducciones = traducciones;

        return traducciones;
    } catch (error) {
        console.error(
            'Error cargando traducciones:',
            error
        );

        traducciones = {};
        window.traducciones = traducciones;

        return traducciones;
    }
}

// ================================================================
// OBTENER TEXTO TRADUCIDO
// ================================================================
//
// Comportamiento:
// - Si la clave existe en el mapa: devuelve el valor.
// - Si no existe: devuelve la clave humanizada (con espacios).
//
// IMPORTANTE: aplicarTraducciones() NO usa el valor humanizado
// para sobrescribir el DOM. Lo usa solo si tú llamas a t() desde
// tu código JS explícitamente.
// ================================================================

function t(clave, modulo = null) {
    if (!clave) {
        return '';
    }

    // ------------------------------------------------------------
    // Buscar clave exacta
    // ------------------------------------------------------------

    if (
        Object.prototype.hasOwnProperty.call(
            traducciones,
            clave
        )
    ) {
        const valor =
            traducciones[clave];

        if (
            valor !== null &&
            valor !== undefined &&
            String(valor).trim() !== ''
        ) {
            return String(valor);
        }
    }

    // ------------------------------------------------------------
    // Buscar clave usando módulo
    // ------------------------------------------------------------

    if (modulo) {
        const keyModulo =
            `${modulo}_${clave}`;

        if (
            Object.prototype.hasOwnProperty.call(
                traducciones,
                keyModulo
            )
        ) {
            const valor =
                traducciones[keyModulo];

            if (
                valor !== null &&
                valor !== undefined &&
                String(valor).trim() !== ''
            ) {
                return String(valor);
            }
        }
    }

    // ------------------------------------------------------------
    // Fallback seguro
    //
    // Si no existe traducción, devuelve la clave legible.
    // ------------------------------------------------------------

    return String(clave)
        .replace(/_/g, ' ');
}

// ================================================================
// VERIFICAR SI UNA CLAVE TIENE TRADUCCIÓN REAL
// ================================================================
//
// Devuelve la traducción si existe, o null si no.
// NO usa el fallback humanizado. Útil para aplicarTraducciones().
// ================================================================

function obtenerTraduccionReal(clave, modulo = null) {
    if (!clave) {
        return null;
    }

    if (
        Object.prototype.hasOwnProperty.call(
            traducciones,
            clave
        )
    ) {
        const valor = traducciones[clave];

        if (
            valor !== null &&
            valor !== undefined &&
            String(valor).trim() !== ''
        ) {
            return String(valor);
        }
    }

    if (modulo) {
        const keyModulo = `${modulo}_${clave}`;

        if (
            Object.prototype.hasOwnProperty.call(
                traducciones,
                keyModulo
            )
        ) {
            const valor = traducciones[keyModulo];

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
// OBTENER TRADUCCIÓN CON FALLBACK PERSONALIZADO
// ================================================================

function tConFallback(
    clave,
    fallback = '',
    modulo = null
) {
    const real = obtenerTraduccionReal(clave, modulo);

    if (real !== null) {
        return real;
    }

    if (fallback !== undefined && fallback !== null) {
        return fallback;
    }

    return String(clave).replace(/_/g, ' ');
}

// ================================================================
// APLICAR TRADUCCIONES A HTML
// ================================================================
//
// Acepta una raíz opcional (document, un elemento, etc.).
//
// FIX v3:
// - Ahora es ESTRICTO: NUNCA sobrescribe el contenido de un
//   elemento que tenga hijos HTML. Solo traduce elementos cuyo
//   contenido sea texto plano (sin children).
// - Respeta data-no-traducir="1" para saltar elementos blindados.
// - Esto evita que se borren botones, íconos o spans internos.
// ================================================================

function aplicarTraducciones(raiz = document) {
    try {
        if (!raiz) {
            raiz = document;
        }

        // ----------------------------------------------------------
        // DATA-CLAVE
        // ----------------------------------------------------------

        const elementosClave =
            raiz.querySelectorAll
                ? raiz.querySelectorAll('[data-clave]')
                : [];

        elementosClave.forEach(el => {
            const clave =
                el.getAttribute('data-clave');

            if (!clave) {
                return;
            }

            // ✅ BLINDAJE 1: Si tiene hijos HTML, NO tocar.
            // Ejemplo: <div><span>texto</span><button>...</button></div>
            // NO se debe sobrescribir con textContent.
            if (el.children && el.children.length > 0) {
                return;
            }

            // ✅ BLINDAJE 2: Si tiene data-no-traducir, NO tocar.
            if (el.hasAttribute('data-no-traducir')) {
                return;
            }

            // ✅ BLINDAJE 3: Si tiene contenido con elementos (svg, img, etc.),
            // NO tocar aunque children esté vacío.
            if (el.innerHTML && el.innerHTML.indexOf('<') !== -1) {
                return;
            }

            const modulo =
                el.getAttribute('data-modulo') || null;

            // Obtener traducción REAL (null si no existe).
            const traduccion =
                obtenerTraduccionReal(clave, modulo);

            // SOLO sobrescribir si hay traducción real.
            if (traduccion !== null) {
                el.textContent = traduccion;
            }
        });

        // ----------------------------------------------------------
        // DATA-PLACEHOLDER
        // ----------------------------------------------------------

        const elementosPlaceholder =
            raiz.querySelectorAll
                ? raiz.querySelectorAll('[data-placeholder]')
                : [];

        elementosPlaceholder.forEach(el => {
            const clave =
                el.getAttribute('data-placeholder');

            if (!clave) {
                return;
            }

            if (el.hasAttribute('data-no-traducir')) {
                return;
            }

            const traduccion =
                obtenerTraduccionReal(clave);

            // SOLO sobrescribir el placeholder si hay traducción real.
            if (traduccion !== null) {
                el.setAttribute('placeholder', traduccion);
            }
        });

        return true;
    } catch (error) {
        console.error(
            '❌ Error aplicando traducciones:',
            error
        );

        return false;
    }
}

// ================================================================
// APLICAR TRADUCCIONES A CONTENIDO DINÁMICO
// ================================================================
//
// Alias explícito. No crea sistema nuevo.
// ================================================================

function aplicarTraduccionesDinamicas(raiz = document) {
    return aplicarTraducciones(raiz);
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

// ================================================================
// COMPROBAR SI EL IDIOMA ACTUAL ES UNO ESPECÍFICO
// ================================================================

function esIdioma(codigo) {
    return (
        obtenerCodigoIdiomaActual() ===
        codigo
    );
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
            localStorage.setItem(
                'idioma_preferido',
                idiomaId
            );
        } catch (e) {
            console.warn(
                '⚠️ No se pudo guardar idioma_preferido:',
                e
            );
        }

        const session =
            await getSession();

        if (
            session &&
            session.user
        ) {
            const client =
                getSupabaseClient();

            if (client) {
                const {
                    error
                } = await client
                    .from('usuarios')
                    .update({
                        idioma_preferido_id:
                            idiomaId
                    })
                    .eq(
                        'id',
                        session.user.id
                    );

                if (error) {
                    console.warn(
                        '⚠️ No se pudo guardar idioma en perfil:',
                        error
                    );
                }
            }
        }

        window.location.reload();
    } catch (error) {
        console.error(
            'Error cambiando idioma:',
            error
        );

        if (
            typeof window.showToast ===
            'function'
        ) {
            window.showToast(
                '❌ Error al cambiar idioma',
                'error'
            );
        }
    }
}

// ================================================================
// CARGAR SELECTOR DE IDIOMAS
// ================================================================

async function cargarSelectorIdiomas() {
    try {
        const select =
            document.getElementById(
                'selectorIdioma'
            );

        if (!select) {
            return;
        }

        const client =
            getSupabaseClient();

        if (!client) {
            select.innerHTML =
                '<option value="es-MX" selected>🌐 Español</option>';

            return;
        }

        select.innerHTML = '';

        const {
            data,
            error
        } = await client
            .from('idiomas_sistema')
            .select(
                'id, codigo, nombre, nombre_nativo, bandera'
            )
            .eq(
                'activo',
                true
            )
            .order(
                'nombre',
                {
                    ascending: true
                }
            );

        if (error) {
            throw error;
        }

        if (
            !data ||
            data.length === 0
        ) {
            select.innerHTML =
                '<option value="es-MX" selected>🌐 Español</option>';

            return;
        }

        const idiomaUsuario =
            await obtenerIdiomaUsuario();

        const idiomaIdActual =
            idiomaUsuario?.id;

        const codigosVistos =
            new Set();

        data.forEach(idioma => {
            if (
                !idioma ||
                !idioma.codigo
            ) {
                return;
            }

            if (
                codigosVistos.has(
                    idioma.codigo
                )
            ) {
                return;
            }

            codigosVistos.add(
                idioma.codigo
            );

            const option =
                document.createElement(
                    'option'
                );

            option.value =
                idioma.id;

            const bandera =
                idioma.bandera ||
                '🌐';

            const nombre =
                idioma.nombre_nativo ||
                idioma.nombre ||
                idioma.codigo;

            option.textContent =
                `${bandera} ${nombre}`;

            if (
                idioma.id ===
                idiomaIdActual
            ) {
                option.selected =
                    true;
            }

            select.appendChild(
                option
            );
        });

        console.log(
            `✅ Selector de idiomas cargado: ${select.options.length} idiomas`
        );
    } catch (error) {
        console.error(
            'Error cargando selector de idiomas:',
            error
        );

        const select =
            document.getElementById(
                'selectorIdioma'
            );

        if (select) {
            select.innerHTML =
                '<option value="es-MX" selected>🌐 Español</option>';
        }
    }
}

// ================================================================
// INICIALIZAR SISTEMA COMPLETO
// ================================================================

async function inicializarIdiomas() {
    try {
        let intentos = 0;

        while (
            !getSupabaseClient() &&
            intentos < 30
        ) {
            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        100
                    )
            );

            intentos++;
        }

        const idioma =
            await obtenerIdiomaUsuario();

        if (
            idioma &&
            idioma.id
        ) {
            await cargarTraducciones(
                idioma.id
            );

            aplicarTraducciones();
        }

        await cargarSelectorIdiomas();
    } catch (error) {
        console.error(
            'Error inicializando idiomas:',
            error
        );

        try {
            await cargarSelectorIdiomas();
        } catch (e) {
            console.warn(
                '⚠️ Error cargando selector:',
                e
            );
        }
    }
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================

window.getSession =
    getSession;

window.getSupabaseClient =
    getSupabaseClient;

window.obtenerIdiomaUsuario =
    obtenerIdiomaUsuario;

window.cargarTraducciones =
    cargarTraducciones;

window.t =
    t;

window.tConFallback =
    tConFallback;

window.obtenerTraduccionReal =
    obtenerTraduccionReal;

window.cambiarIdioma =
    cambiarIdioma;

window.aplicarTraducciones =
    aplicarTraducciones;

window.aplicarTraduccionesDinamicas =
    aplicarTraduccionesDinamicas;

window.cargarSelectorIdiomas =
    cargarSelectorIdiomas;

window.inicializarIdiomas =
    inicializarIdiomas;

window.obtenerCodigoIdiomaActual =
    obtenerCodigoIdiomaActual;

window.esIdioma =
    esIdioma;

// ================================================================
// LOG
// ================================================================

console.log(
    '✅ Sistema de idiomas cargado correctamente (v3 - blindaje estricto)'
);