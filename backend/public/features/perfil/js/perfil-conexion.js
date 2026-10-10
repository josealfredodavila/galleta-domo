// ================================================================
// PERFIL · CONEXIÓN (WiFi / Datos)
// ================================================================
// Detecta el tipo de conexión (WiFi o Datos móviles), muestra la
// velocidad y la señal, y permite al usuario cambiar manualmente.
// Depende de: perfil-config.js, perfil-utils.js
//
// CAMBIO v2 (traducciones):
// - Todos los textos usan perfilT(clave, respaldo).
// ================================================================

// ================================================================
// CARGAR ESTADO DE CONEXIÓN
// ================================================================
async function cargarEstadoConexion() {
    try {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

        if (connection) {
            const velocidad = connection.downlink ? connection.downlink + ' Mbps' : '0 Mbps';
            let tipoConexion = 'wifi';

            if (connection.type) {
                if (connection.type === 'cellular' || connection.type === '4g' || connection.type === '3g') {
                    tipoConexion = 'datos';
                }
            } else if (connection.downlink && connection.downlink < 10) {
                tipoConexion = 'datos';
            }

            if (perfilCache?.conexion_tipo) tipoConexion = perfilCache.conexion_tipo;

            estadoConexion = Object.assign({}, estadoConexion, {
                tipo: tipoConexion,
                activa: navigator.onLine,
                velocidad: velocidad,
                señal: Math.min(Math.round((connection.downlink || 50) * 2), 100)
            });

            actualizarUIConexion(estadoConexion);
            await guardarEstadoConexion(estadoConexion);
        } else {
            estadoConexion = Object.assign({}, estadoConexion, { activa: navigator.onLine });
            actualizarUIConexion(estadoConexion);
        }
        return estadoConexion;
    } catch (error) {
        estadoConexion = Object.assign({}, estadoConexion, { activa: navigator.onLine });
        actualizarUIConexion(estadoConexion);
        return estadoConexion;
    }
}

// ================================================================
// CAMBIAR CONEXIÓN (wifi / datos)
// ================================================================
async function cambiarConexion(tipo) {
    try {
        if (!['wifi', 'datos'].includes(tipo)) {
            showToast(perfilT('perfil_conexion_tipo_invalido', '❌ Tipo de conexión no válido'), 'error');
            return;
        }
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        // Antes de pasar a "datos", verificar que tiene eSIM activa
        if (tipo === 'datos') {
            const token = session.access_token;
            let r, j;
            try {
                r = await fetch(BACKEND_URL + '/api/telnyx/esim/mia', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                j = await r.json().catch(() => null);
            } catch (netErr) {
                showToast(perfilT('perfil_esim_error_red', '❌ Error de red al verificar tu eSIM. Intenta de nuevo.'), 'error', 5000);
                return;
            }
            const e = j && j.success ? j.data : null;
            if (!e || !e.tiene_esim) {
                showToast(perfilT('perfil_esim_no_tiene', '⚠️ Aún no tienes eSIM. Compra un paquete en Internet.'), 'warning', 5000);
                return;
            }
            if (e.estado !== 'activa') {
                showToast(perfilT('perfil_esim_sin_saldo', '⚠️ Tu eSIM no tiene saldo. Recarga gigas en Internet.'), 'warning', 5000);
                return;
            }
        }

        const { error } = await window.supabaseClient
            .from('usuarios')
            .update({
                conexion_tipo: tipo,
                conexion_activa: true,
                conexion_ultimo_cambio: new Date().toISOString()
            })
            .eq('id', session.user.id);
        if (error) throw error;

        estadoConexion.tipo = tipo;
        estadoConexion.activa = true;
        ultimaClaveConexionGuardada = tipo + '|true';

        if (perfilCache) {
            perfilCache.conexion_tipo = tipo;
            perfilCache.conexion_activa = true;
        }
        actualizarUIConexion(estadoConexion);
        showToast(
            tipo === 'wifi'
                ? '🛜 ' + perfilT('perfil_conexion_wifi', 'WiFi')
                : '📶 ' + perfilT('perfil_conexion_datos', 'Datos'),
            'success'
        );
    } catch (error) {
        showToast(perfilT('perfil_error_cambiar_conexion', '❌ Error al cambiar conexión: ') + msgError(error), 'error');
    }
}

// ================================================================
// GUARDAR ESTADO DE CONEXIÓN EN SUPABASE (evita updates repetidos)
// ================================================================
async function guardarEstadoConexion(estado) {
    try {
        const clave = estado.tipo + '|' + estado.activa;
        if (clave === ultimaClaveConexionGuardada) return;
        const session = await getSession();
        if (!session) return;
        const { error } = await window.supabaseClient
            .from('usuarios')
            .update({
                conexion_tipo: estado.tipo,
                conexion_activa: estado.activa,
                conexion_velocidad: estado.velocidad,
                conexion_senal: estado.señal
            })
            .eq('id', session.user.id);
        if (!error) ultimaClaveConexionGuardada = clave;
    } catch (error) {}
}

// ================================================================
// ACTUALIZAR UI DE CONEXIÓN
// ================================================================
function actualizarUIConexion(estado) {
    const conexionStatus = document.getElementById('conexionStatus');
    const conexionTipo = document.getElementById('conexionTipo');
    const conexionVelocidad = document.getElementById('conexionVelocidad');
    const conexionSeñal = document.getElementById('conexionSeñal');
    const wifiBtn = document.getElementById('btnWifi');
    const datosBtn = document.getElementById('btnDatos');
    const conexionOperador = document.getElementById('conexionOperador');

    const wifiT = perfilT('perfil_conexion_wifi', 'WiFi');
    const datosT = perfilT('perfil_conexion_datos', 'Datos');

    if (conexionStatus) {
        conexionStatus.removeAttribute('data-clave');
        conexionStatus.setAttribute('data-no-traducir', '1');
        if (!estado.activa) {
            conexionStatus.textContent = perfilT('perfil_sin_conexion', '⛔ Sin conexión');
            conexionStatus.style.color = 'var(--danger)';
        } else if (estado.tipo === 'wifi') {
            conexionStatus.textContent = '🛜 ' + wifiT;
            conexionStatus.style.color = 'var(--success)';
        } else {
            conexionStatus.textContent = '📶 ' + datosT;
            conexionStatus.style.color = 'var(--cyan)';
        }
    }
    if (conexionTipo) {
        conexionTipo.textContent = estado.tipo === 'wifi' ? '🛜 ' + wifiT : '📶 ' + datosT;
    }
    if (conexionVelocidad) conexionVelocidad.textContent = estado.velocidad;
    if (conexionSeñal) {
        const barras = Math.round((estado.señal / 100) * 4);
        conexionSeñal.textContent = '█'.repeat(barras) + '░'.repeat(4 - barras);
        conexionSeñal.style.color = estado.señal > 50 ? 'var(--success)' : 'var(--warning)';
    }
    if (conexionOperador) conexionOperador.textContent = estado.operador || "Sariel's Net";
    if (wifiBtn) {
        wifiBtn.style.borderColor = estado.tipo === 'wifi' ? 'var(--gold)' : 'var(--glass-border)';
        wifiBtn.style.background = estado.tipo === 'wifi' ? 'rgba(212,175,55,0.15)' : 'transparent';
    }
    if (datosBtn) {
        datosBtn.style.borderColor = estado.tipo === 'datos' ? 'var(--gold)' : 'var(--glass-border)';
        datosBtn.style.background = estado.tipo === 'datos' ? 'rgba(212,175,55,0.15)' : 'transparent';
    }
}

// ================================================================
// ESCUCHAR CAMBIOS DE CONEXIÓN DEL NAVEGADOR
// ================================================================
function iniciarEscuchaConexion() {
    if (escuchaConexionIniciada) return;
    escuchaConexionIniciada = true;

    window.addEventListener('online', () => {
        estadoConexion.activa = true;
        actualizarUIConexion(estadoConexion);
        guardarEstadoConexion(estadoConexion);
        showToast('🛜 ' + perfilT('perfil_conexion', 'Conexión'), 'success');
    });

    window.addEventListener('offline', () => {
        estadoConexion.activa = false;
        actualizarUIConexion(estadoConexion);
        showToast(perfilT('perfil_sin_conexion', '⛔ Sin conexión'), 'error');
    });

    if (navigator.connection && navigator.connection.addEventListener) {
        navigator.connection.addEventListener('change', async () => {
            await cargarEstadoConexion();
        });
    }
}