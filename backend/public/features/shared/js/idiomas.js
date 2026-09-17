// ================================================================
// IDIOMAS - VERSIÓN COMPLETA Y CORREGIDA
// Compatible con window.supabaseClient y window.supabase
// ================================================================

// ===== OBTENER CLIENTE SUPABASE (con fallback) =====
function getSupabaseClient() {
    // 1. Intentar usar el cliente global existente
    if (window.supabaseClient) return window.supabaseClient;
    
    // 2. Crear uno nuevo si existe la librería
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        try {
            const client = window.supabase.createClient(
                'https://zultnlogdoajehbswlih.supabase.co',
                'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
            );
            window.supabaseClient = client;
            return client;
        } catch (e) {
            console.warn('⚠️ No se pudo crear cliente Supabase:', e);
        }
    }
    
    return null;
}

// ===== OBTENER SESIÓN =====
async function getSession() {
    try {
        const client = getSupabaseClient();
        if (!client) {
            console.warn('⚠️ Supabase no disponible');
            return null;
        }
        const { data: { session } } = await client.auth.getSession();
        return session;
    } catch (e) {
        console.error('❌ Error obteniendo sesión:', e);
        return null;
    }
}

let idiomaActual = null;
let traducciones = {};

// ===== IDIOMA POR DEFECTO =====
const IDIOMA_DEFAULT = {
    codigo: 'es-MX',
    nombre: 'Español',
    nombre_nativo: 'Español',
    bandera: '🌐'
};

/**
 * Obtener el idioma del usuario
 */
async function obtenerIdiomaUsuario() {
    try {
        const client = getSupabaseClient();
        if (!client) return IDIOMA_DEFAULT;

        const session = await getSession();
        if (session && session.user) {
            // 1. Intentar desde el perfil del usuario
            const { data: usuario, error: errUsuario } = await client
                .from('usuarios')
                .select('idioma_preferido_id')
                .eq('id', session.user.id)
                .maybeSingle();
            
            if (!errUsuario && usuario?.idioma_preferido_id) {
                const { data: idioma } = await client
                    .from('idiomas_sistema')
                    .select('*')
                    .eq('id', usuario.idioma_preferido_id)
                    .maybeSingle();
                
                if (idioma) {
                    idiomaActual = idioma;
                    return idioma;
                }
            }
        }
        
        // 2. Intentar desde localStorage
        const localId = localStorage.getItem('idioma_preferido');
        if (localId) {
            const { data: idioma } = await client
                .from('idiomas_sistema')
                .select('*')
                .eq('id', localId)
                .maybeSingle();
            
            if (idioma) {
                idiomaActual = idioma;
                return idioma;
            }
        }
        
        // 3. Idioma por defecto
        const { data: idiomaDefault } = await client
            .from('idiomas_sistema')
            .select('*')
            .eq('codigo', 'es-MX')
            .eq('activo', true)
            .maybeSingle();
        
        idiomaActual = idiomaDefault || IDIOMA_DEFAULT;
        return idiomaActual;
        
    } catch (error) {
        console.error('Error obteniendo idioma:', error);
        return IDIOMA_DEFAULT;
    }
}

/**
 * Cargar traducciones del idioma actual
 */
async function cargarTraducciones(idiomaId) {
    try {
        const client = getSupabaseClient();
        if (!client || !idiomaId) return {};

        const { data, error } = await client
            .from('traducciones')
            .select('clave, valor, modulo')
            .eq('idioma_id', idiomaId);
        
        if (error) throw error;
        
        traducciones = {};
        if (data) {
            data.forEach(item => {
                traducciones[item.clave] = item.valor;
            });
        }
        
        return traducciones;
    } catch (error) {
        console.error('Error cargando traducciones:', error);
        return {};
    }
}

/**
 * Obtener texto traducido por clave
 */
function t(clave, modulo = null) {
    if (!clave) return '';

    if (traducciones[clave]) {
        return traducciones[clave];
    }
    
    if (modulo) {
        const keyModulo = `${modulo}_${clave}`;
        if (traducciones[keyModulo]) {
            return traducciones[keyModulo];
        }
    }
    
    return clave.replace(/_/g, ' ');
}

/**
 * Cambiar el idioma del usuario
 */
async function cambiarIdioma(idiomaId) {
    try {
        if (!idiomaId) return;

        localStorage.setItem('idioma_preferido', idiomaId);
        
        const session = await getSession();
        if (session && session.user) {
            const client = getSupabaseClient();
            if (client) {
                await client
                    .from('usuarios')
                    .update({ idioma_preferido_id: idiomaId })
                    .eq('id', session.user.id);
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

/**
 * Aplicar traducciones a la página
 */
function aplicarTraducciones() {
    document.querySelectorAll('[data-clave]').forEach(el => {
        const clave = el.getAttribute('data-clave');
        const modulo = el.getAttribute('data-modulo') || null;
        const traduccion = t(clave, modulo);
        
        if (traduccion && traduccion !== clave) {
            el.textContent = traduccion;
        }
    });
    
    document.querySelectorAll('[data-placeholder]').forEach(el => {
        const clave = el.getAttribute('data-placeholder');
        const traduccion = t(clave);
        if (traduccion && traduccion !== clave) {
            el.placeholder = traduccion;
        }
    });
}

/**
 * Cargar el selector de idiomas
 */
async function cargarSelectorIdiomas() {
    try {
        const select = document.getElementById('selectorIdioma');
        if (!select) {
            return; // Silencioso: no todas las páginas tienen selector
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

        if (error) throw error;

        if (!data || data.length === 0) {
            select.innerHTML = '<option value="es-MX" selected>🌐 Español</option>';
            return;
        }

        const idiomaUsuario = await obtenerIdiomaUsuario();
        const idiomaIdActual = idiomaUsuario?.id;

        const codigosVistos = new Set();
        data.forEach(idioma => {
            if (codigosVistos.has(idioma.codigo)) return;
            codigosVistos.add(idioma.codigo);

            const option = document.createElement('option');
            option.value = idioma.id;
            const bandera = idioma.bandera || '🌐';
            const nombre = idioma.nombre_nativo || idioma.nombre;
            option.textContent = `${bandera} ${nombre}`;
            
            if (idioma.id === idiomaIdActual) {
                option.selected = true;
            }
            
            select.appendChild(option);
        });

        console.log(`✅ Selector de idiomas cargado: ${select.options.length} idiomas`);

    } catch (error) {
        console.error('Error cargando selector de idiomas:', error);
        const select = document.getElementById('selectorIdioma');
        if (select) {
            select.innerHTML = '<option value="es-MX" selected>🌐 Español</option>';
        }
    }
}

/**
 * Inicializar el sistema completo
 */
async function inicializarIdiomas() {
    try {
        // Esperar a que supabaseClient esté disponible (máx 3 segundos)
        let intentos = 0;
        while (!getSupabaseClient() && intentos < 30) {
            await new Promise(r => setTimeout(r, 100));
            intentos++;
        }

        const idioma = await obtenerIdiomaUsuario();
        if (idioma && idioma.id) {
            await cargarTraducciones(idioma.id);
            aplicarTraducciones();
        }
        await cargarSelectorIdiomas();
    } catch (error) {
        console.error('Error inicializando idiomas:', error);
        await cargarSelectorIdiomas();
    }
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================

window.getSession = getSession;
window.getSupabaseClient = getSupabaseClient;
window.obtenerIdiomaUsuario = obtenerIdiomaUsuario;
window.cargarTraducciones = cargarTraducciones;
window.t = t;
window.cambiarIdioma = cambiarIdioma;
window.aplicarTraducciones = aplicarTraducciones;
window.cargarSelectorIdiomas = cargarSelectorIdiomas;
window.inicializarIdiomas = inicializarIdiomas;

console.log('✅ Sistema de idiomas cargado correctamente');