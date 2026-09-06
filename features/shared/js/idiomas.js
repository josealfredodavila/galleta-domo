// ================================================================
// IDIOMAS - FUNCIONES GLOBALES
// ================================================================

let idiomaActual = null;
let traducciones = {};

/**
 * Obtener el idioma del usuario (de perfil o por defecto)
 */
async function obtenerIdiomaUsuario() {
    try {
        // 1. Intentar desde la sesión del usuario
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
        
        // 2. Intentar desde localStorage (si guardó preferencia)
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
        
        // 3. Idioma por defecto (Español México)
        const { data: idiomaDefault } = await window.supabase
            .from('idiomas_sistema')
            .select('*')
            .eq('codigo', 'es')
            .single();
        
        idiomaActual = idiomaDefault;
        return idiomaDefault;
        
    } catch (error) {
        console.error('Error obteniendo idioma:', error);
        return { codigo: 'es', nombre: 'Español' };
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
        
        // Guardar en objeto para acceso rápido
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
 */
function t(clave, modulo = null) {
    // Si hay traducción, devolverla
    if (traducciones[clave]) {
        return traducciones[clave];
    }
    
    // Si no, buscar por modulo + clave
    if (modulo) {
        const keyModulo = `${modulo}_${clave}`;
        if (traducciones[keyModulo]) {
            return traducciones[keyModulo];
        }
    }
    
    // Si no hay traducción, devolver la clave (fallback)
    return clave.replace('_', ' ');
}

/**
 * Cambiar el idioma del usuario
 */
async function cambiarIdioma(idiomaId) {
    try {
        // Guardar en localStorage
        localStorage.setItem('idioma_preferido', idiomaId);
        
        // Si hay sesión, guardar en Supabase
        const session = await getSession();
        if (session) {
            await window.supabase
                .from('usuarios')
                .update({ idioma_preferido_id: idiomaId })
                .eq('id', session.user.id);
        }
        
        // Recargar la página para aplicar cambios
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
    // Buscar todos los elementos con data-clave
    document.querySelectorAll('[data-clave]').forEach(el => {
        const clave = el.getAttribute('data-clave');
        const modulo = el.getAttribute('data-modulo') || null;
        const traduccion = t(clave, modulo);
        
        if (traduccion && traduccion !== clave) {
            el.textContent = traduccion;
        }
    });
    
    // Buscar todos los elementos con data-placeholder
    document.querySelectorAll('[data-placeholder]').forEach(el => {
        const clave = el.getAttribute('data-placeholder');
        const traduccion = t(clave);
        if (traduccion && traduccion !== clave) {
            el.placeholder = traduccion;
        }
    });
}