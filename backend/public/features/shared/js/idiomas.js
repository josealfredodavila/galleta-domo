// ================================================================
// IDIOMAS - VERSIÓN COMPLETA
// Funciones globales: cargar, cambiar, aplicar, llenar selector
// ================================================================

// ===== OBTENER SESIÓN - FUNCIÓN INDEPENDIENTE =====
async function getSession() {
    try {
        if (typeof window.supabase === 'undefined') {
            console.warn('⚠️ Supabase no disponible');
            return null;
        }
        const { data: { session } } = await window.supabase.auth.getSession();
        return session;
    } catch (e) {
        console.error('❌ Error obteniendo sesión:', e);
        return null;
    }
}

let idiomaActual = null;
let traducciones = {};

/**
 * Obtener el idioma del usuario (de perfil o por defecto)
 */
async function obtenerIdiomaUsuario() {
    try {
        if (typeof window.supabase === 'undefined') {
            return { codigo: 'es-MX', nombre: 'Español', nombre_nativo: 'Español', bandera: '🌐' };
        }

        const session = await getSession();
        if (session) {
            const { data, error } = await window.supabase
                .from('usuarios')
                .select('idioma_preferido_id')
                .eq('id', session.user.id)
                .single();
            
            if (!error && data?.idioma_preferido_id) {
                const { data: idioma } = await window.supabase
                    .from('idiomas_sistema')
                    .select('*')
                    .eq('id', data.idioma_preferido_id)
                    .single();
                
                if (idioma) {
                    idiomaActual = idioma;
                    return idioma;
                }
            }
        }
        
        const localId = localStorage.getItem('idioma_preferido');
        if (localId) {
            const { data: idioma } = await window.supabase
                .from('idiomas_sistema')
                .select('*')
                .eq('id', localId)
                .single();
            
            if (idioma) {
                idiomaActual = idioma;
                return idioma;
            }
        }
        
        const { data: idiomaDefault } = await window.supabase
            .from('idiomas_sistema')
            .select('*')
            .eq('codigo', 'es-MX')
            .eq('activo', true)
            .single();
        
        idiomaActual = idiomaDefault;
        return idiomaDefault;
        
    } catch (error) {
        console.error('Error obteniendo idioma:', error);
        return { codigo: 'es-MX', nombre: 'Español', nombre_nativo: 'Español', bandera: '🌐' };
    }
}

/**
 * Cargar traducciones del idioma actual
 */
async function cargarTraducciones(idiomaId) {
    try {
        if (typeof window.supabase === 'undefined') {
            return {};
        }

        const { data, error } = await window.supabase
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
        if (session) {
            await window.supabase
                .from('usuarios')
                .update({ idioma_preferido_id: idiomaId })
                .eq('id', session.user.id);
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
 * ✅ NUEVA FUNCIÓN: Cargar el selector de idiomas
 * Esta función llena el <select id="selectorIdioma"> con los idiomas
 * activos de Supabase. Sin duplicados.
 */
async function cargarSelectorIdiomas() {
    try {
        const select = document.getElementById('selectorIdioma');
        if (!select) {
            console.warn('⚠️ No se encontró #selectorIdioma');
            return;
        }

        if (typeof window.supabase === 'undefined') {
            console.warn('⚠️ Supabase no disponible para cargar idiomas');
            select.innerHTML = '<option value="es-MX" selected>🌐 Español</option>';
            return;
        }

        // Limpiar el select completamente
        select.innerHTML = '';

        // Traer idiomas activos
        const { data, error } = await window.supabase
            .from('idiomas_sistema')
            .select('id, codigo, nombre, nombre_nativo, bandera')
            .eq('activo', true)
            .order('nombre', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            // Fallback: solo español si no hay idiomas
            select.innerHTML = '<option value="es-MX" selected>🌐 Español</option>';
            return;
        }

        // Obtener idioma actual del usuario
        const idiomaUsuario = await obtenerIdiomaUsuario();
        const idiomaIdActual = idiomaUsuario?.id;

        // Llenar el select con los idiomas (sin duplicados)
        const codigosVistos = new Set();
        data.forEach(idioma => {
            // Evitar duplicados por código
            if (codigosVistos.has(idioma.codigo)) {
                return;
            }
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
        // Fallback: al menos mostrar español
        const select = document.getElementById('selectorIdioma');
        if (select) {
            select.innerHTML = '<option value="es-MX" selected>🌐 Español</option>';
        }
    }
}

/**
 * ✅ NUEVA FUNCIÓN: Inicializar el sistema completo
 * Carga traducciones + llena el selector
 */
async function inicializarIdiomas() {
    try {
        const idioma = await obtenerIdiomaUsuario();
        if (idioma && idioma.id) {
            await cargarTraducciones(idioma.id);
            aplicarTraducciones();
        }
        await cargarSelectorIdiomas();
    } catch (error) {
        console.error('Error inicializando idiomas:', error);
        // Aún así intentar llenar el selector
        await cargarSelectorIdiomas();
    }
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================

window.getSession = getSession;
window.obtenerIdiomaUsuario = obtenerIdiomaUsuario;
window.cargarTraducciones = cargarTraducciones;
window.t = t;
window.cambiarIdioma = cambiarIdioma;
window.aplicarTraducciones = aplicarTraducciones;
window.cargarSelectorIdiomas = cargarSelectorIdiomas;
window.inicializarIdiomas = inicializarIdiomas;

console.log('✅ Sistema de idiomas cargado correctamente');