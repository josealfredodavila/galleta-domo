// ================================================================
// IDIOMAS - FUNCIONES GLOBALES
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
            .single();
        
        idiomaActual = idiomaDefault;
        return idiomaDefault;
        
    } catch (error) {
        console.error('Error obteniendo idioma:', error);
        return { codigo: 'es-MX', nombre: 'Español' };
    }
}

/**
 * Cargar traducciones del idioma actual
 */
async function cargarTraducciones(idiomaId) {
    try {
        const { data, error } = await window.supabase
            .from('traducciones')
            .select('clave, valor, modulo')
            .eq('idioma_id', idiomaId);
        
        if (error) throw error;
        
        traducciones = {};
        data.forEach(item => {
            traducciones[item.clave] = item.valor;
        });
        
        return traducciones;
    } catch (error) {
        console.error('Error cargando traducciones:', error);
        return {};
    }
}

/**
 * Obtener texto traducido por clave
 * ✅ CORREGIDO: Reemplaza TODOS los guiones bajos
 */
function t(clave, modulo = null) {
    if (traducciones[clave]) {
        return traducciones[clave];
    }
    
    if (modulo) {
        const keyModulo = `${modulo}_${clave}`;
        if (traducciones[keyModulo]) {
            return traducciones[keyModulo];
        }
    }
    
    // ✅ CORREGIDO: reemplaza TODOS los guiones bajos
    return clave.replace(/_/g, ' ');
}

/**
 * Cambiar el idioma del usuario
 */
async function cambiarIdioma(idiomaId) {
    try {
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
        showToast('❌ Error al cambiar idioma', 'error');
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

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================

window.getSession = getSession;
window.obtenerIdiomaUsuario = obtenerIdiomaUsuario;
window.cargarTraducciones = cargarTraducciones;
window.t = t;
window.cambiarIdioma = cambiarIdioma;
window.aplicarTraducciones = aplicarTraducciones;

console.log('✅ Sistema de idiomas cargado correctamente');