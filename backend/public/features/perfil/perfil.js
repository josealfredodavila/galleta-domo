/* ================================================================
   PERFIL.JS - SARIEL'S ECOSYSTEM
   VERSIÓN FUNCIONAL - INTEGRACIÓN COMPLETA CON SERVER.JS + SUPABASE + TELNYX
   ================================================================ */

// ================================================================
// CONFIGURACIÓN SUPABASE - VERSIÓN SEGURA (funciona en ambos escenarios)
// ================================================================
const supabase = (typeof window.supabase.createClient === 'function')
    ? window.supabase.createClient(
        'https://zultnlogdoajehbswlih.supabase.co',
        'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
      )
    : window.supabase;

// ================================================================
// CONFIGURACIÓN DE ENTORNO
// ================================================================
const ENV = {
    isProduction: window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1'),
    isTestnet: true,
    networkName: 'Polygon Amoy Testnet',
    networkChainId: '0x13882',
    networkCurrency: 'MATIC',
    networkRPC: 'https://rpc-amoy.polygon.technology/',
    networkExplorer: 'https://www.oklink.com/amoy'
};

// ================================================================
// BACKEND ENDPOINTS
// ================================================================
const BACKEND_URL = window.location.origin;
const API_ENDPOINTS = {
    esim: `${BACKEND_URL}/api/esim`,
    pagos: `${BACKEND_URL}/api/pagos`,
    webhook: `${BACKEND_URL}/api/webhooks/nowpayments`,
    perfil: `${BACKEND_URL}/api/perfil`,
    estado: `${BACKEND_URL}/api/estado`,
    contactos: `${BACKEND_URL}/api/contactos`,
    mensajes: `${BACKEND_URL}/api/mensajes`,
    tokens: `${BACKEND_URL}/api/tokens`,
    muro: `${BACKEND_URL}/api/muro`,
    live: `${BACKEND_URL}/api/live`,
    qr: `${BACKEND_URL}/api/qr`
};

// ================================================================
// TOAST NOTIFICACIONES
// ================================================================
function showToast(msg, type = '', duration = 3500) {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show';
    t.style.animation = 'none';
    t.offsetHeight;
    t.style.animation = 'slideInRight 0.3s ease-out';
    
    if (type === 'error') t.classList.add('error');
    else if (type === 'warning') t.classList.add('warning');
    else if (type === 'success') t.classList.add('success');
    else t.classList.remove('error', 'warning', 'success');
    
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => {
        t.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => t.classList.remove('show'), 300);
    }, duration);
}

// ================================================================
// NAVEGACIÓN Y SESIÓN
// ================================================================
function cambiarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const tabContent = document.getElementById('tab-' + tab);
    if (tabContent) {
        tabContent.classList.add('active');
        tabContent.style.animation = 'fadeIn 0.3s ease-out';
    }
    const tabBtn = document.querySelector(`.tab-btn[onclick="cambiarTab('${tab}')"]`);
    if (tabBtn) tabBtn.classList.add('active');
}

async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ================================================================
// FORMATEO DE TEXTO
// ================================================================
function formatearTexto(texto) {
    if (!texto) return '';
    return texto
        .replace(/#(\w+)/g, '<a href="/features/muro/muro.html?tag=$1" class="hashtag" style="color:var(--gold);text-decoration:none;font-weight:600;">#$1</a>')
        .replace(/@(\w+)/g, '<a href="/perfil/$1" class="mencion" style="color:var(--cyan);text-decoration:none;font-weight:600;">@$1</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<em>$1</em>')
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        .replace(/`(.*?)`/g, '<code style="background:var(--bg-card);padding:2px 6px;border-radius:4px;font-family:monospace;">$1</code>');
}

// ================================================================
// CARGA DE PERFIL - RPC obtener_mi_perfil
// ================================================================
let perfilCache = null;
let ultimaActualizacion = 0;
const CACHE_DURATION = 30000;

async function cargarPerfil(forzarActualizacion = false) {
    try {
        const session = await getSession();
        if (!session) {
            window.location.href = '/';
            return;
        }

        const ahora = Date.now();
        if (!forzarActualizacion && perfilCache && (ahora - ultimaActualizacion) < CACHE_DURATION) {
            actualizarUI(perfilCache);
            return;
        }

        const { data, error } = await supabase.rpc('obtener_mi_perfil');

        if (error) throw error;

        const perfil = data && data.length > 0 ? data[0] : null;

        if (perfil) {
            perfilCache = perfil;
            ultimaActualizacion = ahora;
            await actualizarEstadoEnLinea(true);
            actualizarUI(perfil);
            
            if (perfil.esim_iccid) {
                await cargarDatosESIM(perfil.esim_iccid);
            }
            
            await cargarEstadoConexion();
            await cargarAmigosEnLinea();
            await cargarHistorialQR();
            await cargarSolicitudesPendientes();
        } else {
            const defaultData = {
                nombre: session.user.user_metadata?.nombre || 'Explorador',
                handle: session.user.email?.split('@')[0] || 'explorador',
                bio: 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad',
                avatar_url: null,
                tokens: 0,
                progreso_canje: 0,
                puede_canjear: false,
                wallet_address: null,
                esim_iccid: null,
                esim_status: null,
                esim_data_used: 0,
                esim_data_limit: 0,
                conexion_tipo: 'wifi',
                conexion_activa: true,
                online: true
            };
            perfilCache = defaultData;
            ultimaActualizacion = ahora;
            await actualizarEstadoEnLinea(true);
            actualizarUI(defaultData);
        }
    } catch (error) {
        console.error('Error cargando perfil:', error);
        showToast('❌ Error al cargar perfil', 'error');
    }
}

// ================================================================
// ESTADO ACTIVO/INACTIVO
// ================================================================
async function actualizarEstadoEnLinea(online) {
    try {
        const session = await getSession();
        if (!session) return;

        const response = await fetch(`${API_ENDPOINTS.estado}/online`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ online })
        });

        const result = await response.json();

        if (!result.success) throw new Error(result.error || 'Error actualizando estado');

        if (perfilCache) {
            perfilCache.online = online;
        }
        
        actualizarUIEstado(online);
        return true;
    } catch (error) {
        console.error('Error actualizando estado en línea:', error);
        return false;
    }
}

function actualizarUIEstado(online) {
    const estadoBadge = document.getElementById('estadoBadge');
    const estadoTexto = document.getElementById('estadoTexto');
    
    if (estadoBadge) {
        estadoBadge.innerHTML = online ? '🟢' : '⭕';
        estadoBadge.style.color = online ? 'var(--success)' : 'var(--text-muted)';
    }
    
    if (estadoTexto) {
        estadoTexto.textContent = online ? 'Activo ahora' : 'Inactivo';
        estadoTexto.style.color = online ? 'var(--success)' : 'var(--text-muted)';
    }
}

let tiempoInactividad = 0;
let maxInactividad = 300000;

function iniciarDetectorInactividad() {
    const resetInactividad = () => {
        tiempoInactividad = 0;
        if (perfilCache && !perfilCache.online) {
            actualizarEstadoEnLinea(true);
        }
    };

    const eventos = ['mousemove', 'mousedown', 'click', 'scroll', 'keydown', 'touchstart', 'touchmove'];
    eventos.forEach(evento => {
        document.addEventListener(evento, resetInactividad);
    });

    setInterval(async () => {
        tiempoInactividad += 30000;
        
        if (tiempoInactividad >= maxInactividad && perfilCache && perfilCache.online) {
            await actualizarEstadoEnLinea(false);
            showToast('⭕ Marcado como inactivo por inactividad', 'warning');
        }
    }, 30000);
}

async function cambiarEstado(online) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        await actualizarEstadoEnLinea(online);
        
        if (online) {
            showToast('🟢 Te has marcado como activo', 'success');
        } else {
            showToast('⭕ Te has marcado como inactivo', 'warning');
        }
        
        await notificarCambioEstado(online);
        
    } catch (error) {
        console.error('Error cambiando estado:', error);
        showToast('❌ Error al cambiar estado', 'error');
    }
}

// ================================================================
// AMIGOS EN TIEMPO REAL
// ================================================================
let canalAmigos = null;

function iniciarEscuchaAmigos() {
    if (canalAmigos) {
        supabase.removeChannel(canalAmigos);
    }

    canalAmigos = supabase
        .channel('amigos_online')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'usuarios',
            filter: 'online=eq.true'
        }, (payload) => {
            const usuario = payload.new;
            if (usuario.id !== perfilCache?.id) {
                actualizarListaAmigos();
            }
        })
        .subscribe();

    return canalAmigos;
}

async function cargarAmigosEnLinea() {
    try {
        const session = await getSession();
        if (!session) return;

        const response = await fetch(`${API_ENDPOINTS.contactos}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();

        if (!result.success) throw new Error(result.error || 'Error cargando contactos');

        const contactos = result.contactos || [];

        if (contactos.length === 0) {
            actualizarUIAmigos([]);
            return;
        }

        const idsContactos = contactos.map(c => c.contacto_id);

        const { data: enLinea, error: enLineaError } = await supabase
            .from('usuarios')
            .select('id, nombre, handle, avatar_url, online, ultima_conexion')
            .in('id', idsContactos)
            .eq('online', true);

        if (enLineaError) throw enLineaError;

        const { data: todosContactos, error: todosError } = await supabase
            .from('usuarios')
            .select('id, nombre, handle, avatar_url, online, ultima_conexion')
            .in('id', idsContactos);

        if (todosError) throw todosError;

        actualizarUIAmigos(todosContactos || [], enLinea || []);

        return { enLinea, todosContactos };

    } catch (error) {
        console.error('Error cargando amigos en línea:', error);
        return null;
    }
}

function actualizarUIAmigos(todosAmigos = [], enLinea = []) {
    const container = document.getElementById('amigosContainer');
    const contador = document.getElementById('amigosEnLineaContador');
    
    if (contador) {
        contador.textContent = enLinea.length;
        contador.style.color = enLinea.length > 0 ? 'var(--success)' : 'var(--text-muted)';
    }

    if (!container) return;

    if (!todosAmigos || todosAmigos.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.8rem;">
                <span style="font-size:2rem;">👥</span>
                <p style="margin-top:8px;">Aún no tienes amigos agregados</p>
                <p style="font-size:0.6rem;">Explora el muro para conectar con otros</p>
            </div>
        `;
        return;
    }

    const enLineaIds = enLinea.map(a => a.id);
    const ordenados = [
        ...todosAmigos.filter(a => enLineaIds.includes(a.id)),
        ...todosAmigos.filter(a => !enLineaIds.includes(a.id))
    ];

    container.innerHTML = ordenados.map(amigo => {
        const estaEnLinea = enLineaIds.includes(amigo.id);
        return `
            <div class="amigo-item ${estaEnLinea ? 'online' : ''}" onclick="window.location.href='/perfil/${amigo.handle}'">
                <div class="avatar-mini">
                    ${amigo.avatar_url ? `<img src="${amigo.avatar_url}">` : '◈'}
                </div>
                <div class="info">
                    <div class="nombre" style="color:${estaEnLinea ? 'var(--text-primary)' : 'var(--text-muted)'}">
                        ${amigo.nombre || amigo.handle}
                    </div>
                    <div class="estado" style="color:${estaEnLinea ? 'var(--success)' : 'var(--text-muted)'}">
                        ${estaEnLinea ? '🟢 Activo ahora' : '⭕ Desconectado'}
                        ${!estaEnLinea && amigo.ultima_conexion ? ` · ${haceTiempo(amigo.ultima_conexion)}` : ''}
                    </div>
                </div>
                ${estaEnLinea ? '<div class="badge-online">EN LÍNEA</div>' : ''}
            </div>
        `;
    }).join('');
}

async function actualizarListaAmigos() {
    await cargarAmigosEnLinea();
}

// ================================================================
// SISTEMA DE AMISTADES - COMPLETO CON RPCs
// ================================================================

// ================================================================
// CORRECCIÓN: notificarCambioEstado() - estado 'aceptado' → 'activo'
// ================================================================
async function notificarCambioEstado(online) {
    try {
        const session = await getSession();
        if (!session) return;

        // CORREGIDO: 'aceptado' → 'activo' (coincide con la función obtener_contactos_con_estado)
        const { data: contactos, error } = await supabase
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id)
            .eq('estado', 'activo');

        if (error || !contactos) return;

        for (const contacto of contactos) {
            await supabase
                .from('notificaciones')
                .insert({
                    user_id: contacto.contacto_id,
                    tipo: 'estado',
                    mensaje: `${perfilCache?.nombre || 'Un usuario'} está ${online ? '🟢 activo' : '⭕ inactivo'}`,
                    emisor_id: session.user.id,
                    leida: false,
                    fecha: new Date().toISOString()
                });
        }

    } catch (error) {
        console.error('Error notificando cambio de estado:', error);
    }
}

// ================================================================
// OBTENER SOLICITUDES PENDIENTES
// ================================================================
async function obtenerSolicitudesPendientes() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para ver solicitudes', 'error');
            return [];
        }

        const { data, error } = await supabase.rpc('obtener_solicitudes_pendientes');

        if (error) throw error;

        return data || [];

    } catch (error) {
        console.error('Error obteniendo solicitudes pendientes:', error);
        showToast('❌ Error al cargar solicitudes: ' + error.message, 'error');
        return [];
    }
}

// ================================================================
// ACEPTAR SOLICITUD DE AMISTAD
// ================================================================
async function aceptarSolicitudAmistad(solicitanteId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para aceptar solicitudes', 'error');
            return false;
        }

        if (!solicitanteId) {
            showToast('⚠️ ID de solicitante inválido', 'error');
            return false;
        }

        showToast('⏳ Aceptando solicitud...', '', 3000);

        const { data, error } = await supabase.rpc('aceptar_solicitud_amistad', {
            p_solicitante_id: solicitanteId
        });

        if (error) throw error;

        showToast('✅ Solicitud aceptada. ¡Ahora son amigos!', 'success', 4000);
        
        // Actualizar UI
        await cargarSolicitudesPendientes();
        await cargarAmigosEnLinea();
        await cargarPerfil(true);
        
        return true;

    } catch (error) {
        console.error('Error aceptando solicitud:', error);
        showToast('❌ Error al aceptar solicitud: ' + error.message, 'error');
        return false;
    }
}

// ================================================================
// RECHAZAR SOLICITUD DE AMISTAD
// ================================================================
async function rechazarSolicitudAmistad(solicitanteId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para rechazar solicitudes', 'error');
            return false;
        }

        if (!solicitanteId) {
            showToast('⚠️ ID de solicitante inválido', 'error');
            return false;
        }

        if (!confirm('¿Seguro que quieres rechazar esta solicitud de amistad?')) {
            return false;
        }

        showToast('⏳ Rechazando solicitud...', '', 3000);

        const { data, error } = await supabase.rpc('rechazar_solicitud_amistad', {
            p_solicitante_id: solicitanteId
        });

        if (error) throw error;

        showToast('❌ Solicitud rechazada', 'warning', 3000);
        
        // Actualizar UI
        await cargarSolicitudesPendientes();
        
        return true;

    } catch (error) {
        console.error('Error rechazando solicitud:', error);
        showToast('❌ Error al rechazar solicitud: ' + error.message, 'error');
        return false;
    }
}

// ================================================================
// CARGAR Y MOSTRAR SOLICITUDES PENDIENTES EN UI
// ================================================================
async function cargarSolicitudesPendientes() {
    try {
        const solicitudes = await obtenerSolicitudesPendientes();
        actualizarUISolicitudes(solicitudes);
        return solicitudes;
    } catch (error) {
        console.error('Error cargando solicitudes:', error);
        return [];
    }
}

function actualizarUISolicitudes(solicitudes = []) {
    const container = document.getElementById('solicitudesContainer');
    const contador = document.getElementById('solicitudesContador');
    
    if (contador) {
        contador.textContent = solicitudes.length;
        contador.style.color = solicitudes.length > 0 ? 'var(--warning)' : 'var(--text-muted)';
        contador.style.display = solicitudes.length > 0 ? 'inline' : 'none';
    }

    if (!container) {
        // Si no existe el contenedor, crearlo en la pestaña de contactos
        const contactosTab = document.getElementById('tab-contactos');
        if (contactosTab) {
            const solicitudesSection = document.createElement('div');
            solicitudesSection.id = 'solicitudesSection';
            solicitudesSection.innerHTML = `
                <div style="margin-top: 20px;">
                    <h4 style="color: var(--gold); font-size: 0.9rem; margin-bottom: 10px;">
                        📨 Solicitudes pendientes 
                        <span id="solicitudesContador" style="font-size:0.7rem; color:var(--warning);">${solicitudes.length}</span>
                    </h4>
                    <div id="solicitudesContainer" style="max-height: 200px; overflow-y: auto;">
                        ${renderSolicitudes(solicitudes)}
                    </div>
                </div>
            `;
            contactosTab.insertBefore(solicitudesSection, contactosTab.querySelector('#amigosContainer'));
        }
        return;
    }

    container.innerHTML = renderSolicitudes(solicitudes);
}

function renderSolicitudes(solicitudes) {
    if (!solicitudes || solicitudes.length === 0) {
        return `
            <div style="text-align:center; padding:10px; color:var(--text-muted); font-size:0.7rem;">
                <span style="font-size:1.2rem;">✅</span>
                <p>No tienes solicitudes pendientes</p>
            </div>
        `;
    }

    return solicitudes.map(solicitud => `
        <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            margin-bottom: 6px;
            background: rgba(212,175,55,0.05);
            border-radius: 10px;
            border: 1px solid rgba(212,175,55,0.1);
            animation: fadeIn 0.3s ease-out;
        ">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: var(--bg-dark);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.8rem;
                    overflow: hidden;
                ">
                    ${solicitud.avatar_url ? `<img src="${solicitud.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : '◈'}
                </div>
                <div>
                    <div style="font-weight:600; font-size:0.8rem; color:var(--text-primary);">
                        ${solicitud.nombre || solicitud.handle}
                    </div>
                    <div style="font-size:0.6rem; color:var(--text-muted);">
                        @${solicitud.handle} · ${haceTiempo(solicitud.fecha_solicitud)}
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 5px;">
                <button onclick="aceptarSolicitudAmistad('${solicitud.solicitante_id}')" 
                        style="
                            background: linear-gradient(135deg, #2ecc71, #27ae60);
                            border: none;
                            color: #fff;
                            padding: 4px 12px;
                            border-radius: 6px;
                            font-size: 0.6rem;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s ease;
                        "
                        onmouseover="this.style.transform='scale(1.05)'"
                        onmouseout="this.style.transform='scale(1)'">
                    ✅ Aceptar
                </button>
                <button onclick="rechazarSolicitudAmistad('${solicitud.solicitante_id}')" 
                        style="
                            background: transparent;
                            border: 1px solid #ff6b6b;
                            color: #ff6b6b;
                            padding: 4px 12px;
                            border-radius: 6px;
                            font-size: 0.6rem;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s ease;
                        "
                        onmouseover="this.style.background='rgba(255,107,107,0.1)'; this.style.transform='scale(1.05)'"
                        onmouseout="this.style.background='transparent'; this.style.transform='scale(1)'">
                    ✕ Rechazar
                </button>
            </div>
        </div>
    `).join('');
}

function haceTiempo(fecha) {
    if (!fecha) return 'hace tiempo';
    const ahora = new Date();
    const entonces = new Date(fecha);
    const diffMs = ahora - entonces;
    const diffMin = Math.floor(diffMs / 60000);
    
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffMin < 1440) return `hace ${Math.floor(diffMin / 60)} h`;
    return `hace ${Math.floor(diffMin / 1440)} d`;
}

// ================================================================
// GESTIÓN DE CONEXIÓN (WiFi / Datos Móviles)
// ================================================================
let estadoConexion = {
    tipo: 'wifi',
    activa: true,
    velocidad: '0 Mbps',
    señal: 100,
    operador: 'Sariel\'s Net',
    datos_usados: 0,
    datos_limite: 0,
    datos_restantes: 0
};

async function cargarEstadoConexion() {
    try {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        
        if (connection) {
            const tipo = connection.effectiveType || 'unknown';
            const velocidad = connection.downlink ? `${connection.downlink} Mbps` : '0 Mbps';
            
            let tipoConexion = 'wifi';
            if (connection.type) {
                if (connection.type === 'cellular' || connection.type === '4g' || connection.type === '3g') {
                    tipoConexion = 'datos';
                } else if (connection.type === 'wifi') {
                    tipoConexion = 'wifi';
                } else {
                    tipoConexion = 'wifi';
                }
            } else {
                if (connection.downlink && connection.downlink < 10) {
                    tipoConexion = 'datos';
                }
            }
            
            estadoConexion = {
                ...estadoConexion,
                tipo: tipoConexion,
                activa: navigator.onLine,
                velocidad: velocidad,
                señal: Math.min(Math.round((connection.downlink || 50) * 2), 100)
            };
            
            actualizarUIConexion(estadoConexion);
            await guardarEstadoConexion(estadoConexion);
        } else {
            estadoConexion = {
                ...estadoConexion,
                activa: navigator.onLine
            };
            actualizarUIConexion(estadoConexion);
        }
        
        return estadoConexion;
        
    } catch (error) {
        console.error('Error cargando estado de conexión:', error);
        estadoConexion = {
            ...estadoConexion,
            activa: navigator.onLine
        };
        actualizarUIConexion(estadoConexion);
        return estadoConexion;
    }
}

async function cambiarConexion(tipo) {
    try {
        if (!['wifi', 'datos'].includes(tipo)) {
            showToast('❌ Tipo de conexión no válido', 'error');
            return;
        }

        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para cambiar conexión', 'error');
            return;
        }

        if (tipo === 'datos') {
            const perfil = await getPerfilActual();
            if (!perfil || !perfil.esim_iccid) {
                showToast('⚠️ No tienes una eSIM activa. Compra una primero.', 'warning');
                return;
            }
            if (perfil.esim_status !== 'enabled') {
                showToast('⚠️ Tu eSIM no está activa. Actívala primero.', 'warning');
                return;
            }
        }

        const { error } = await supabase
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
        
        actualizarUIConexion(estadoConexion);
        
        if (tipo === 'wifi') {
            showToast('🛜 Cambiado a WiFi', 'success');
        } else {
            showToast('📶 Cambiado a Datos Móviles', 'success');
        }
        
        await cargarPerfil(true);
        
        if (tipo === 'datos') {
            await cargarDatosESIM(perfilCache?.esim_iccid);
        }
        
    } catch (error) {
        console.error('Error cambiando conexión:', error);
        showToast('❌ Error al cambiar conexión: ' + error.message, 'error');
    }
}

function getPerfilActual() {
    return perfilCache;
}

// ================================================================
// CORRECCIÓN 1: guardarEstadoConexion() - conexion_senal (sin ñ)
// ================================================================
async function guardarEstadoConexion(estado) {
    try {
        const session = await getSession();
        if (!session) return;

        const { error } = await supabase
            .from('usuarios')
            .update({
                conexion_tipo: estado.tipo,
                conexion_activa: estado.activa,
                conexion_velocidad: estado.velocidad,
                conexion_senal: estado.señal
            })
            .eq('id', session.user.id);

        if (error) throw error;
        
    } catch (error) {
        console.error('Error guardando estado de conexión:', error);
    }
}

function actualizarUIConexion(estado) {
    const conexionStatus = document.getElementById('conexionStatus');
    const conexionTipo = document.getElementById('conexionTipo');
    const conexionVelocidad = document.getElementById('conexionVelocidad');
    const conexionSeñal = document.getElementById('conexionSeñal');
    const wifiBtn = document.getElementById('btnWifi');
    const datosBtn = document.getElementById('btnDatos');

    if (conexionStatus) {
        if (!estado.activa) {
            conexionStatus.innerHTML = '⛔ Sin conexión';
            conexionStatus.style.color = 'var(--danger)';
        } else if (estado.tipo === 'wifi') {
            conexionStatus.innerHTML = '🛜 WiFi';
            conexionStatus.style.color = 'var(--success)';
        } else {
            conexionStatus.innerHTML = '📶 Datos Móviles';
            conexionStatus.style.color = 'var(--quantum)';
        }
    }

    if (conexionTipo) {
        conexionTipo.textContent = estado.tipo === 'wifi' ? '🛜 WiFi' : '📶 Datos Móviles';
    }

    if (conexionVelocidad) {
        conexionVelocidad.textContent = estado.velocidad;
    }

    if (conexionSeñal) {
        const barras = Math.round((estado.señal / 100) * 4);
        conexionSeñal.textContent = '█'.repeat(barras) + '░'.repeat(4 - barras);
        conexionSeñal.style.color = estado.señal > 50 ? 'var(--success)' : 'var(--warning)';
    }

    if (wifiBtn) {
        wifiBtn.style.borderColor = estado.tipo === 'wifi' ? 'var(--gold)' : 'var(--glass-border)';
        wifiBtn.style.background = estado.tipo === 'wifi' ? 'rgba(212,175,55,0.15)' : 'transparent';
    }
    if (datosBtn) {
        datosBtn.style.borderColor = estado.tipo === 'datos' ? 'var(--gold)' : 'var(--glass-border)';
        datosBtn.style.background = estado.tipo === 'datos' ? 'rgba(212,175,55,0.15)' : 'transparent';
    }
}

function iniciarEscuchaConexion() {
    window.addEventListener('online', () => {
        estadoConexion.activa = true;
        actualizarUIConexion(estadoConexion);
        guardarEstadoConexion(estadoConexion);
        showToast('🛜 Conexión restablecida', 'success');
    });

    window.addEventListener('offline', () => {
        estadoConexion.activa = false;
        actualizarUIConexion(estadoConexion);
        guardarEstadoConexion(estadoConexion);
        showToast('⛔ Sin conexión', 'error');
    });

    if (navigator.connection) {
        navigator.connection.addEventListener('change', async () => {
            await cargarEstadoConexion();
        });
    }
}

// ================================================================
// eSIM - TELNYX FUNCTIONS (INTEGRACIÓN CON SERVER.JS)
// ================================================================

function actualizarUIESIM(data) {
    const esimStatus = document.getElementById('esimStatus');
    const esimDataUsed = document.getElementById('esimDataUsed');
    const esimDataLimit = document.getElementById('esimDataLimit');
    const esimDataProgress = document.getElementById('esimDataProgress');
    const esimIccid = document.getElementById('esimIccid');
    const esimApn = document.getElementById('esimApn');
    const esimRestante = document.getElementById('esimDataRestante');

    if (esimStatus) {
        const statusMap = {
            'enabled': '✅ Activo',
            'active': '✅ Activo',
            'disabled': '❌ Inactivo',
            'inactive': '❌ Inactivo',
            'standby': '⏳ En espera',
            'pending': '🔄 Pendiente',
            'unknown': '❓ Desconocido'
        };
        esimStatus.textContent = data.esim_status ? (statusMap[data.esim_status] || data.esim_status) : '⏳ Sin eSIM';
        esimStatus.style.color = (data.esim_status === 'enabled' || data.esim_status === 'active') 
            ? 'var(--success)' 
            : 'var(--warning)';
    }

    if (esimDataUsed) {
        const used = (data.esim_data_used || 0) / 1024 / 1024 / 1024;
        esimDataUsed.textContent = used.toFixed(2) + ' GB';
    }

    if (esimDataLimit) {
        const limit = (data.esim_data_limit || 0) / 1024 / 1024 / 1024;
        esimDataLimit.textContent = limit.toFixed(2) + ' GB';
    }

    if (esimRestante) {
        const usado = (data.esim_data_used || 0) / 1024 / 1024 / 1024;
        const limite = (data.esim_data_limit || 0) / 1024 / 1024 / 1024;
        const restante = Math.max(limite - usado, 0);
        esimRestante.textContent = restante.toFixed(2) + ' GB';
        esimRestante.style.color = restante < 1 ? 'var(--danger)' : 'var(--success)';
    }

    if (esimDataProgress && data.esim_data_limit > 0) {
        const porcentaje = ((data.esim_data_used || 0) / (data.esim_data_limit || 1)) * 100;
        esimDataProgress.style.width = Math.min(porcentaje, 100) + '%';
        esimDataProgress.style.transition = 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
        
        if (porcentaje > 80) {
            esimDataProgress.style.background = 'var(--danger)';
        } else if (porcentaje > 50) {
            esimDataProgress.style.background = 'var(--warning)';
        } else {
            esimDataProgress.style.background = 'var(--success)';
        }
    }

    if (esimIccid) {
        const iccid = data.esim_iccid || 'No asignado';
        esimIccid.textContent = iccid.length > 10 ? iccid.slice(0, 10) + '...' + iccid.slice(-4) : iccid;
    }

    if (esimApn) {
        esimApn.textContent = data.esim_apn || 'data00.telnyx';
    }
}

function mostrarSinESIM() {
    actualizarUIESIM({
        esim_iccid: 'No asignado',
        esim_status: 'disabled',
        esim_data_used: 0,
        esim_data_limit: 0,
        esim_apn: 'data00.telnyx'
    });
    const esimStatus = document.getElementById('esimStatus');
    if (esimStatus) {
        esimStatus.textContent = '⏳ Sin eSIM';
        esimStatus.style.color = 'var(--text-muted)';
    }
}

async function cargarDatosESIM(iccid) {
    if (!iccid) {
        console.warn('⚠️ No hay ICCID para cargar datos eSIM');
        mostrarSinESIM();
        return null;
    }

    try {
        const session = await getSession();
        if (!session) {
            console.warn('⚠️ No hay sesión para cargar datos eSIM');
            return null;
        }

        showToast('⏳ Actualizando datos de eSIM...', '', 3000);

        const response = await fetch(`${API_ENDPOINTS.esim}/profile`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al cargar datos eSIM');
        }

        const data = result.data;

        if (!data.has_esim) {
            mostrarSinESIM();
            return null;
        }

        actualizarUIESIM({
            esim_iccid: data.iccid,
            esim_status: data.status,
            esim_data_used: data.data_used_bytes || 0,
            esim_data_limit: data.data_limit_bytes || 0,
            esim_apn: data.apn || 'data00.telnyx',
            esim_activated_at: data.activated_at,
            esim_expires_at: data.expires_at,
            esim_operator: data.operator || 'Telnyx',
            esim_network: data.network || '4G/5G'
        });

        if (data.telnyx_error) {
            showToast('⚠️ No se pudo actualizar la información de la eSIM. Mostrando último estado conocido.', 'warning', 5000);
        }

        return data;

    } catch (error) {
        console.error('Error cargando datos eSIM:', error);
        showToast('❌ Error al cargar datos de eSIM: ' + error.message, 'error');
        await cargarDatosESIMLocal(iccid);
        return null;
    }
}

async function cargarDatosESIMLocal(iccid) {
    try {
        const session = await getSession();
        if (!session) return;

        const { data: usuario, error } = await supabase
            .from('usuarios')
            .select('esim_iccid, esim_status, esim_data_used, esim_data_limit, esim_apn')
            .eq('id', session.user.id)
            .single();

        if (error) throw error;

        if (usuario && usuario.esim_iccid) {
            actualizarUIESIM({
                esim_iccid: usuario.esim_iccid,
                esim_status: usuario.esim_status || 'disabled',
                esim_data_used: usuario.esim_data_used || 0,
                esim_data_limit: usuario.esim_data_limit || 0,
                esim_apn: usuario.esim_apn || 'data00.telnyx'
            });
            showToast('ℹ️ Mostrando datos guardados localmente', 'warning', 3000);
        }
    } catch (error) {
        console.error('Error cargando datos locales:', error);
        mostrarSinESIM();
    }
}

async function sincronizarESIM() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para sincronizar', 'error');
            return;
        }

        showToast('⏳ Sincronizando con Telnyx...', '', 5000);

        const response = await fetch(`${API_ENDPOINTS.esim}/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al sincronizar');
        }

        showToast('✅ Datos sincronizados correctamente', 'success');
        await cargarPerfil(true);

    } catch (error) {
        console.error('Error sincronizando eSIM:', error);
        showToast('❌ Error al sincronizar: ' + error.message, 'error');
    }
}

async function comprarESIM(planId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para comprar eSIM', 'error');
            return;
        }

        const { data: plan, error } = await supabase
            .from('planes_esim')
            .select('*')
            .eq('id', planId)
            .single();

        if (error) throw error;

        showToast('⏳ Creando orden de compra...', '', 5000);

        const response = await fetch(`${API_ENDPOINTS.pagos}/crear`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                transmisionId: null,
                tipo: 'esim',
                planId: plan.id,
                idempotency_key: `esim_${session.user.id}_${planId}_${Date.now()}`
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al crear la orden');
        }

        if (result.data && result.data.payment_url) {
            mostrarModalPagoReal(result.data.payment_url, result.data.id, plan);
        } else {
            const qrData = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('Orden: ' + result.data.id)}`;
            mostrarModalPagoSimulado(qrData, result.data.id, plan);
        }

    } catch (error) {
        console.error('Error comprando eSIM:', error);
        showToast('❌ Error al comprar eSIM: ' + error.message, 'error');
    }
}

async function activarESIM(iccid) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const iccidParam = iccid || perfilCache?.esim_iccid;
        if (!iccidParam) {
            showToast('⚠️ No hay eSIM para activar', 'error');
            return;
        }

        showToast('⏳ Activando eSIM...', '', 5000);

        const response = await fetch(`${API_ENDPOINTS.esim}/activar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ iccid: iccidParam })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al activar eSIM');
        }

        showToast('✅ eSIM activada correctamente', 'success');
        await cargarPerfil(true);

    } catch (error) {
        console.error('Error activando eSIM:', error);
        showToast('❌ Error al activar eSIM: ' + error.message, 'error');
    }
}

async function desactivarESIM(iccid) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const iccidParam = iccid || perfilCache?.esim_iccid;
        if (!iccidParam) {
            showToast('⚠️ No hay eSIM para desactivar', 'error');
            return;
        }

        if (!confirm('¿Seguro que quieres desactivar tu eSIM?')) return;

        showToast('⏳ Desactivando eSIM...', '', 5000);

        const response = await fetch(`${API_ENDPOINTS.esim}/desactivar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ iccid: iccidParam })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al desactivar eSIM');
        }

        showToast('🔌 eSIM desactivada', 'warning');
        await cargarPerfil(true);

    } catch (error) {
        console.error('Error desactivando eSIM:', error);
        showToast('❌ Error al desactivar eSIM: ' + error.message, 'error');
    }
}

async function generarQRESIM(iccid) {
    try {
        const iccidParam = iccid || perfilCache?.esim_iccid;
        if (!iccidParam) {
            showToast('⚠️ No hay eSIM para generar QR', 'error');
            return;
        }
        const qrData = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('LPA:1$' + iccidParam + '$Sariel\'s')}`;
        mostrarModalQR(qrData);
    } catch (error) {
        console.error('Error generando QR:', error);
        showToast('❌ Error al generar QR: ' + error.message, 'error');
    }
}

async function obtenerEstadoESIM() {
    try {
        const session = await getSession();
        if (!session) return null;

        const response = await fetch(`${API_ENDPOINTS.esim}/status`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();
        return result.success ? result.data : null;

    } catch (error) {
        console.error('Error obteniendo estado:', error);
        return null;
    }
}

async function obtenerPlanesESIM() {
    try {
        const { data, error } = await supabase
            .from('planes_esim')
            .select('*')
            .eq('activo', true)
            .order('precio_mxn', { ascending: true });

        if (error) throw error;
        return data || [];

    } catch (error) {
        console.error('Error obteniendo planes:', error);
        return [];
    }
}

// ================================================================
// MODALES DE PAGO
// ================================================================

function mostrarModalPagoReal(paymentUrl, ordenId, plan) {
    const modal = document.createElement('div');
    modal.id = 'pagoModal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(10px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        animation: fadeIn 0.3s ease-out;
    `;
    modal.innerHTML = `
        <div style="
            background: linear-gradient(135deg, var(--bg-card), var(--bg-dark));
            border: 2px solid var(--gold);
            border-radius: 20px;
            padding: 30px;
            max-width: 450px;
            width: 90%;
            text-align: center;
            animation: scaleIn 0.3s ease-out;
        ">
            <h2 style="color: var(--gold); margin-bottom: 10px;">📱 Compra eSIM</h2>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                ${plan.nombre} - ${plan.datos_gb} GB por ${plan.duracion_dias} días
            </p>
            <p style="color: var(--gold); font-size: 1.2rem; font-weight: bold;">
                $${plan.precio_usdt} USDT
            </p>
            <p style="color: var(--text-muted); font-size: 0.8rem; margin: 10px 0;">
                💳 Paga con NOWPayments (USDT en TRC-20)
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 15px 0;">
                <a href="${paymentUrl}" target="_blank" 
                   style="background: linear-gradient(135deg, var(--gold), #f7971e); border: none; color: #fff; padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer; text-decoration: none;">
                    💳 Ir a pagar
                </a>
                <button onclick="verificarPago('${ordenId}')"
                        style="background: var(--bg-card); border: 1px solid var(--cyan); color: var(--cyan); padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">
                    ✅ Verificar pago
                </button>
                <button onclick="this.parentElement.parentElement.parentElement.remove()"
                        style="background: transparent; border: 1px solid var(--text-muted); color: var(--text-muted); padding: 12px 30px; border-radius: 10px; cursor: pointer;">
                    Cerrar
                </button>
            </div>
            <div id="pagoStatus" style="margin-top: 10px; font-size: 0.8rem; color: var(--text-secondary);"></div>
            <p style="color: var(--text-muted); font-size: 0.6rem; margin-top: 10px;">
                ⏳ El pago se confirmará automáticamente vía webhook
            </p>
        </div>
    `;
    document.body.appendChild(modal);
}

function mostrarModalPagoSimulado(qrData, ordenId, plan) {
    const modal = document.createElement('div');
    modal.id = 'pagoModal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(10px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        animation: fadeIn 0.3s ease-out;
    `;
    modal.innerHTML = `
        <div style="
            background: linear-gradient(135deg, var(--bg-card), var(--bg-dark));
            border: 2px solid var(--gold);
            border-radius: 20px;
            padding: 30px;
            max-width: 450px;
            width: 90%;
            text-align: center;
            animation: scaleIn 0.3s ease-out;
        ">
            <h2 style="color: var(--gold); margin-bottom: 10px;">📱 Compra eSIM</h2>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                ${plan.nombre} - ${plan.datos_gb} GB por ${plan.duracion_dias} días
            </p>
            <div style="background: white; border-radius: 10px; padding: 15px; margin: 10px 0;">
                <img src="${qrData}" alt="QR de pago" style="max-width: 200px; width: 100%;">
            </div>
            <p style="color: var(--gold); font-size: 1.2rem; font-weight: bold;">
                $${plan.precio_usdt} USDT
            </p>
            <p style="color: var(--text-muted); font-size: 0.7rem; margin: 10px 0;">
                ⏳ Escanea el QR para pagar. Se activará automáticamente.
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button onclick="verificarPago('${ordenId}')"
                        style="background: linear-gradient(135deg, var(--gold), #f7971e); border: none; color: #fff; padding: 10px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">
                    ✅ Verificar pago
                </button>
                <button onclick="this.parentElement.parentElement.parentElement.remove()"
                        style="background: transparent; border: 1px solid var(--text-muted); color: var(--text-muted); padding: 10px 30px; border-radius: 10px; cursor: pointer;">
                    Cerrar
                </button>
            </div>
            <div id="pagoStatus" style="margin-top: 10px; font-size: 0.8rem; color: var(--text-secondary);"></div>
        </div>
    `;
    document.body.appendChild(modal);
}

function mostrarModalQR(qrData) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(10px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        animation: fadeIn 0.3s ease-out;
    `;
    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, var(--bg-card), var(--bg-dark)); border: 2px solid var(--gold); border-radius: 20px; padding: 30px; max-width: 400px; width: 90%; text-align: center; animation: scaleIn 0.3s ease-out;">
            <h2 style="color: var(--gold); margin-bottom: 10px;">📱 Activa tu eSIM</h2>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">Escanea con la cámara de tu móvil</p>
            <div style="background: white; border-radius: 10px; padding: 15px; margin: 10px 0;">
                <img src="${qrData}" alt="QR de activación" style="max-width: 200px; width: 100%;">
            </div>
            <p style="color: var(--text-muted); font-size: 0.7rem;">📲 Ve a Ajustes > Datos Móviles > Añadir eSIM</p>
            <button onclick="this.parentElement.parentElement.remove()"
                    style="margin-top: 15px; background: var(--gold); border: none; color: #fff; padding: 10px 30px; border-radius: 10px; cursor: pointer;">
                Listo
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

async function verificarPago(ordenId) {
    const statusEl = document.getElementById('pagoStatus');
    if (!statusEl) return;

    statusEl.textContent = '⏳ Verificando pago...';

    try {
        const session = await getSession();
        if (!session) {
            statusEl.textContent = '❌ Inicia sesión nuevamente';
            return;
        }

        const response = await fetch(`${API_ENDPOINTS.pagos}/estado/${ordenId}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al verificar pago');
        }

        const orden = result.data;

        if (orden.estado === 'completado' || orden.estado === 'finished' || orden.estado === 'confirmed') {
            statusEl.textContent = '✅ ¡Pago confirmado! Activando eSIM...';
            showToast('🎉 ¡eSIM activada exitosamente!', 'success');
            
            await cargarPerfil(true);
            
            setTimeout(() => {
                document.getElementById('pagoModal')?.remove();
            }, 2000);
            
        } else if (orden.estado === 'pendiente') {
            statusEl.textContent = '⏳ Aún no se confirma el pago. Espera unos minutos.';
            setTimeout(() => verificarPago(ordenId), 10000);
        } else {
            statusEl.textContent = `❌ Estado: ${orden.estado}`;
        }

    } catch (error) {
        console.error('Error verificando pago:', error);
        statusEl.textContent = '❌ Error al verificar: ' + error.message;
    }
}

// ================================================================
// ESCANEO QR
// ================================================================

let qrScannerInterval = null;
let scannerActive = false;
let qrHistorial = [];
let qrScanningLock = false;

async function abrirCamaraQR() {
    const container = document.getElementById('qrReaderContainer');
    const video = document.getElementById('qrVideo');
    const status = document.getElementById('qrCamaraStatus');
    const canvas = document.getElementById('qrCanvas');
    const ctx = canvas?.getContext('2d');
    
    if (scannerActive) {
        cerrarCamaraQR();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        
        video.srcObject = stream;
        await video.play();
        container.style.display = 'block';
        scannerActive = true;
        status.textContent = '📷 Enfoca el QR...';

        const leerQR = async () => {
            if (!scannerActive || !video.readyState || video.readyState < 2) return;
            
            try {
                if (!canvas || !ctx) return;
                
                canvas.width = video.videoWidth || 400;
                canvas.height = video.videoHeight || 300;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                if (typeof jsQR !== 'undefined') {
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert",
                    });
                    
                    if (code && code.data) {
                        const qrData = code.data;
                        status.textContent = '✅ QR detectado: ' + qrData.slice(0, 30) + '...';
                        
                        const input = document.getElementById('qrInput');
                        if (input) {
                            input.value = qrData;
                            setTimeout(async () => {
                                await procesarQR(qrData);
                            }, 1000);
                        }
                        cerrarCamaraQR();
                        return;
                    }
                } else {
                    status.textContent = '📱 Escanea el QR o ingresa el código manualmente';
                }
                
            } catch (error) {
                console.error('Error leyendo QR:', error);
            }
        };

        if (qrScannerInterval) {
            clearInterval(qrScannerInterval);
        }
        qrScannerInterval = setInterval(leerQR, 500);

        showToast('📷 Apunta la cámara al QR', 'warning');

    } catch (error) {
        console.error('Error abriendo cámara:', error);
        status.textContent = '❌ No se pudo acceder a la cámara';
        showToast('❌ No se pudo acceder a la cámara', 'error');
    }
}

function cerrarCamaraQR() {
    const container = document.getElementById('qrReaderContainer');
    const video = document.getElementById('qrVideo');
    const status = document.getElementById('qrCamaraStatus');
    
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    video.srcObject = null;
    if (container) container.style.display = 'none';
    scannerActive = false;
    if (status) status.textContent = '';
    
    if (qrScannerInterval) {
        clearInterval(qrScannerInterval);
        qrScannerInterval = null;
    }
}

async function procesarQR(codigo) {
    if (qrScanningLock) {
        showToast('⏳ Procesando otro QR...', 'warning');
        return;
    }
    
    qrScanningLock = true;
    const status = document.getElementById('qrStatus');
    const input = document.getElementById('qrInput');
    
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para escanear QR', 'error');
            qrScanningLock = false;
            return;
        }

        if (status) status.textContent = '⏳ Validando QR...';
        showToast('⏳ Verificando QR...', '', 5000);

        const { data, error } = await supabase.rpc('reclamar_qr_domo', {
            p_codigo: codigo
        });

        if (error) {
            if (error.message.includes('already used')) {
                showToast('❌ Este QR ya fue usado', 'error');
                if (status) status.textContent = '❌ QR ya utilizado';
            } else if (error.message.includes('invalid code')) {
                showToast('❌ QR inválido', 'error');
                if (status) status.textContent = '❌ QR inválido';
            } else if (error.message.includes('not a domo')) {
                showToast('❌ Este QR no es para un domo', 'error');
                if (status) status.textContent = '❌ QR no es domo';
            } else {
                throw error;
            }
            qrScanningLock = false;
            return;
        }

        if (!data.success) {
            showToast('❌ ' + (data.error || 'Error al reclamar QR'), 'error');
            if (status) status.textContent = '❌ ' + data.error;
            qrScanningLock = false;
            return;
        }

        if (status) status.textContent = '✅ ¡QR reclamado exitosamente!';
        if (input) input.value = '';
        
        showToast('🎉 ¡QR escaneado! +1 Es.stok', 'success');
        
        await cargarPerfil(true);
        await cargarHistorialQR();
        mostrarCelebracion();

    } catch (error) {
        console.error('Error procesando QR:', error);
        if (status) status.textContent = '❌ Error al procesar QR';
        showToast('❌ Error al escanear QR: ' + error.message, 'error');
    } finally {
        qrScanningLock = false;
    }
}

async function escanearQR() {
    const input = document.getElementById('qrInput');
    const qrCode = input?.value?.trim();

    if (!qrCode) {
        showToast('⚠️ Escribe o escanea el código QR', 'error');
        return;
    }

    await procesarQR(qrCode);
}

async function cargarHistorialQR() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data, error } = await supabase
            .from('qr_historial')
            .select('*')
            .eq('user_id', session.user.id)
            .order('fecha', { ascending: false })
            .limit(10);

        if (error) throw error;

        qrHistorial = data || [];
        actualizarUIHistorialQR(qrHistorial);

    } catch (error) {
        console.error('Error cargando historial QR:', error);
    }
}

function actualizarUIHistorialQR(historial = []) {
    const container = document.getElementById('qrHistorialList');
    const contador = document.getElementById('qrHistorialCount');

    if (contador) {
        contador.textContent = `${historial.length} escaneos`;
    }

    if (!container) return;

    if (!historial || historial.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding:10px;">
                <span class="icon" style="font-size:1.5rem;">◈</span>
                <p style="font-size:0.7rem;">Sin escaneos recientes</p>
            </div>
        `;
        return;
    }

    container.innerHTML = historial.map(item => `
        <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            border-bottom: 1px solid rgba(212,175,55,0.05);
            font-size: 0.7rem;
            color: var(--text-muted);
        ">
            <span>📱 QR: ${item.qr_id?.slice(0, 15) || 'N/A'}</span>
            <span>${new Date(item.fecha).toLocaleDateString()} ${new Date(item.fecha).toLocaleTimeString()}</span>
        </div>
    `).join('');
}

// ================================================================
// ACTUALIZAR UI PRINCIPAL
// ================================================================
function actualizarUI(data) {
    const nombreEl = document.getElementById('perfilNombre');
    const handleEl = document.getElementById('perfilHandle');
    const bioEl = document.getElementById('perfilBio');
    const avatarEl = document.getElementById('perfilAvatar');
    const walletDisplay = document.getElementById('walletDisplay');

    if (nombreEl) {
        const verificado = data.verificado ? '<span class="verified">✦ VERIFICADO</span>' : '';
        nombreEl.innerHTML = `${data.nombre || 'Explorador'} ${verificado}`;
    }
    
    if (handleEl) handleEl.textContent = '@' + (data.handle || 'explorador');
    if (bioEl) bioEl.innerHTML = formatearTexto(data.bio || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad');

    if (avatarEl) {
        if (data.avatar_url) {
            avatarEl.innerHTML = `
                <img src="${data.avatar_url}" alt="Avatar" style="animation: fadeIn 0.5s ease-out;" 
                     onerror="this.style.display='none';this.parentElement.innerHTML='◈<span class=\\'edit-badge\\' onclick=\\'abrirSelectorArchivo()\\' title=\\'Cambiar avatar\\'>✎</span>'"/>
                <span class="edit-badge" onclick="abrirSelectorArchivo()" title="Cambiar avatar">✎</span>
            `;
        } else {
            avatarEl.innerHTML = `◈<span class="edit-badge" onclick="abrirSelectorArchivo()" title="Cambiar avatar">✎</span>`;
        }
    }

    if (walletDisplay && data.wallet_address) {
        walletDisplay.textContent = data.wallet_address.slice(0, 6) + '...' + data.wallet_address.slice(-4);
        walletDisplay.style.color = 'var(--success)';
        document.getElementById('btnConectarWallet').style.display = 'none';
        document.getElementById('btnDesconectarWallet').style.display = 'inline-flex';
    } else if (walletDisplay) {
        walletDisplay.textContent = '⚠️ No conectada';
        walletDisplay.style.color = 'var(--text-muted)';
        document.getElementById('btnConectarWallet').style.display = 'inline-flex';
        document.getElementById('btnDesconectarWallet').style.display = 'none';
    }

    const stats = [
        { id: 'statTokens', value: data.tokens || 0 },
        { id: 'statNFTS', value: data.nfts || 0 },
        { id: 'statSeguidores', value: data.seguidores || 0 },
        { id: 'statSiguiendo', value: data.siguiendo || 0 }
    ];

    stats.forEach(stat => {
        const el = document.getElementById(stat.id);
        if (el && el.textContent !== String(stat.value)) {
            animarContador(el, parseInt(el.textContent) || 0, stat.value);
        }
    });

    const tokens = data.tokens || 0;
    const progreso = Math.min(tokens, 12);
    const puedeCanjear = data.puede_canjear || false;

    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressFill) {
        const porcentaje = (progreso / 12) * 100;
        progressFill.style.width = `${porcentaje}%`;
        progressFill.style.transition = 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
    }
    if (progressText) {
        progressText.textContent = `${progreso} / 12`;
        if (progreso >= 12) {
            progressText.style.color = 'var(--gold)';
            progressText.innerHTML += ' 🎯';
        }
    }

    const tokenTotal = document.getElementById('tokenTotal');
    const tokenDisponibles = document.getElementById('tokenDisponibles');
    const tokenNFTs = document.getElementById('tokenNFTs');

    if (tokenTotal) tokenTotal.textContent = tokens;
    if (tokenDisponibles) tokenDisponibles.textContent = tokens;
    if (tokenNFTs) tokenNFTs.textContent = data.progreso_canje || 0;

    const editNombre = document.getElementById('editNombre');
    const editHandle = document.getElementById('editHandle');
    const editBio = document.getElementById('editBio');

    if (editNombre) editNombre.value = data.nombre || 'Explorador';
    if (editHandle) editHandle.value = (data.handle || 'explorador');
    if (editBio) editBio.value = data.bio || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad';

    const btnCanjear = document.getElementById('canjearNft');
    if (btnCanjear) {
        btnCanjear.disabled = !puedeCanjear;
        if (puedeCanjear) {
            btnCanjear.style.background = 'linear-gradient(135deg, var(--gold), #f7971e)';
            btnCanjear.style.border = 'none';
            btnCanjear.style.color = '#fff';
            btnCanjear.innerHTML = '🎁 CANJEAR NFT';
        } else {
            btnCanjear.style.background = 'var(--bg-card)';
            btnCanjear.style.border = '1px solid var(--text-muted)';
            btnCanjear.style.color = 'var(--text-muted)';
            btnCanjear.innerHTML = '🔒 NECESITAS 12 TOKENS';
        }
    }

    actualizarUIESIM(data);
    actualizarUIConexion(estadoConexion);
    actualizarUIEstado(data.online !== false);
}

function animarContador(elemento, inicio, fin) {
    if (!elemento || inicio === fin) return;
    const duracion = 800;
    const paso = 20;
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
// WALLET
// ================================================================

// ================================================================
// CORRECCIÓN 2: conectarWallet() - Ahora envía p_chain_id y p_network_name
// ================================================================
async function conectarWallet() {
    if (typeof window.ethereum === 'undefined') {
        showToast('⚠️ Instala MetaMask para conectar tu wallet', 'error');
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para vincular wallet', 'error');
            return;
        }

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const cuenta = accounts[0];

        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        
        if (chainId !== ENV.networkChainId) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: ENV.networkChainId }]
                });
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: ENV.networkChainId,
                            chainName: ENV.networkName,
                            nativeCurrency: { name: ENV.networkCurrency, symbol: ENV.networkCurrency, decimals: 18 },
                            rpcUrls: [ENV.networkRPC],
                            blockExplorerUrls: [ENV.networkExplorer]
                        }]
                    });
                } else {
                    throw switchError;
                }
            }
        }

        // CORREGIDO: Ahora incluye p_chain_id y p_network_name
        const { error } = await supabase.rpc('vincular_wallet', { 
            p_wallet_address: cuenta,
            p_chain_id: chainId,
            p_network_name: ENV.networkName
        });
        if (error) throw error;

        const walletDisplay = document.getElementById('walletDisplay');
        const btnConectar = document.getElementById('btnConectarWallet');
        const btnDesconectar = document.getElementById('btnDesconectarWallet');

        if (walletDisplay) {
            walletDisplay.textContent = cuenta.slice(0, 6) + '...' + cuenta.slice(-4);
            walletDisplay.style.color = 'var(--success)';
        }
        if (btnConectar) btnConectar.style.display = 'none';
        if (btnDesconectar) btnDesconectar.style.display = 'inline-flex';

        showToast(`✅ Wallet conectada a ${ENV.networkName}`, 'success');
        await cargarPerfil(true);
        
    } catch (error) {
        console.error('Error conectando wallet:', error);
        showToast('❌ Error al conectar wallet: ' + error.message, 'error');
    }
}

async function desconectarWallet() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const { error } = await supabase.rpc('desvincular_wallet');
        if (error) console.warn('RPC desvincular_wallet no encontrada:', error);

        const walletDisplay = document.getElementById('walletDisplay');
        const btnConectar = document.getElementById('btnConectarWallet');
        const btnDesconectar = document.getElementById('btnDesconectarWallet');

        if (walletDisplay) {
            walletDisplay.textContent = '⚠️ No conectada';
            walletDisplay.style.color = 'var(--text-muted)';
        }
        if (btnConectar) btnConectar.style.display = 'inline-flex';
        if (btnDesconectar) btnDesconectar.style.display = 'none';

        showToast('🔌 Wallet desconectada', 'warning');
        await cargarPerfil(true);
        
    } catch (error) {
        console.error('Error desconectando wallet:', error);
        showToast('❌ Error al desconectar wallet', 'error');
    }
}

// ================================================================
// COMPRAR DOMO
// ================================================================
async function comprarDomo(cantidad = 1) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para comprar domos', 'error');
            return;
        }

        cantidad = Math.max(1, Math.floor(cantidad));
        if (cantidad > 10) {
            showToast('⚠️ Máximo 10 domos por transacción', 'warning');
            return;
        }

        showToast('⏳ Procesando compra de ' + cantidad + ' domo(s)...', '', 5000);

        const { data, error } = await supabase.rpc('comprar_domo', { p_cantidad: cantidad });

        if (error) {
            if (error.message.includes('insufficient')) {
                showToast('❌ Fondos insuficientes para comprar domos', 'error');
            } else {
                throw error;
            }
            return;
        }

        showToast(`🎉 ¡${cantidad} Domo(s) comprado(s) exitosamente!`, 'success', 5000);
        await cargarPerfil(true);
        mostrarCelebracion();

    } catch (error) {
        console.error('Error al comprar domo:', error);
        showToast('❌ Error en la compra: ' + error.message, 'error');
    }
}

// ================================================================
// COMPRAR CON CRIPTO
// ================================================================
async function comprarConCripto() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para comprar', 'error');
        return;
    }

    const qty = parseInt(document.getElementById('cryptoQuantity').textContent);
    if (qty < 1 || qty > 10) {
        showToast('⚠️ Cantidad inválida (1-10)', 'warning');
        return;
    }

    const precioUnitario = 4.50;
    const total = qty * precioUnitario;
    const comision = total * 0.02;
    const totalConComision = total + comision;

    const modal = document.getElementById('cryptoPaymentModal');
    const qrImg = document.getElementById('cryptoQR');
    const addressEl = document.getElementById('cryptoAddress');
    const montoEl = document.getElementById('cryptoMonto');
    const monedaEl = document.getElementById('cryptoMoneda');
    const statusEl = document.getElementById('cryptoStatus');

    modal.classList.add('active');

    const response = await fetch(`${API_ENDPOINTS.pagos}/crear`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
            transmisionId: null,
            tipo: 'domo',
            cantidad: qty,
            idempotency_key: `domo_${session.user.id}_${qty}_${Date.now()}`
        })
    });

    const result = await response.json();

    if (!result.success) {
        showToast('❌ Error al crear pago: ' + (result.error || 'Error desconocido'), 'error');
        modal.classList.remove('active');
        return;
    }

    const pagoData = result.data;
    montoEl.textContent = totalConComision.toFixed(2);
    monedaEl.textContent = 'USDT';
    addressEl.textContent = pagoData.payment_address || '0x...';
    statusEl.textContent = '⏳ Esperando confirmación de pago...';

    if (pagoData.payment_url) {
        qrImg.src = pagoData.payment_url;
    } else {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('Orden: ' + pagoData.id)}`;
    }

    window._ordenPagoId = pagoData.id;

    showToast('💳 QR generado. Escanea para pagar.', 'success');
}

async function verificarPagoCrypto() {
    const statusEl = document.getElementById('cryptoStatus');
    const ordenId = window._ordenPagoId;

    if (!ordenId) {
        statusEl.textContent = '❌ No hay orden para verificar';
        return;
    }

    statusEl.textContent = '⏳ Verificando pago...';

    try {
        const session = await getSession();
        if (!session) {
            statusEl.textContent = '❌ Inicia sesión nuevamente';
            return;
        }

        const response = await fetch(`${API_ENDPOINTS.pagos}/estado/${ordenId}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al verificar pago');
        }

        const orden = result.data;

        if (orden.estado === 'completado' || orden.estado === 'finished' || orden.estado === 'confirmed') {
            statusEl.textContent = '✅ ¡Pago confirmado! Procesando compra...';
            showToast('🎉 ¡Compra exitosa!', 'success');
            
            await cargarPerfil(true);
            setTimeout(() => cerrarModalPago(), 2000);
        } else if (orden.estado === 'pendiente') {
            statusEl.textContent = '⏳ Aún no se confirma el pago. Espera unos minutos.';
            setTimeout(() => verificarPagoCrypto(), 10000);
        } else {
            statusEl.textContent = `❌ Estado: ${orden.estado}`;
        }

    } catch (error) {
        console.error('Error verificando pago:', error);
        statusEl.textContent = '❌ Error al verificar: ' + error.message;
    }
}

function copiarDireccion() {
    const addressEl = document.getElementById('cryptoAddress');
    const address = addressEl.textContent;

    if (address && address !== 'Cargando dirección...') {
        navigator.clipboard.writeText(address).then(() => {
            showToast('📋 Dirección copiada al portapapeles', 'success');
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = address;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            textArea.remove();
            showToast('📋 Dirección copiada al portapapeles', 'success');
        });
    }
}

function cerrarModalPago() {
    const modal = document.getElementById('cryptoPaymentModal');
    modal.classList.remove('active');
    window._ordenPagoId = null;
}

// ================================================================
// CANJEAR NFT
// ================================================================
async function canjearNFT() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para canjear tu NFT', 'error');
            return;
        }

        showToast('⏳ Verificando tokens para canje...', '', 4000);

        const { data, error } = await supabase.rpc('canjear_nft');

        if (error) {
            if (error.message.includes('insufficient tokens')) {
                showToast('❌ Necesitas exactamente 12 Es.stoks para canjear', 'error');
            } else if (error.message.includes('already redeemed')) {
                showToast('⚠️ Ya has canjeado tu NFT', 'warning');
            } else {
                throw error;
            }
            return;
        }

        showToast('🎁 ¡NFT Canjeado Exitosamente! Tienes 30 días para reclamar.', 'success', 8000);
        await cargarPerfil(true);
        mostrarModalNFT(data);

    } catch (error) {
        console.error('Error al canjear NFT:', error);
        showToast('❌ Error al canjear NFT: ' + error.message, 'error');
    }
}

// ================================================================
// EFECTO CONFETI Y MODALES
// ================================================================
function crearConfeti() {
    const colores = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd'];
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confeti = document.createElement('div');
            confeti.style.cssText = `
                position: fixed;
                width: 10px;
                height: 10px;
                background: ${colores[Math.floor(Math.random() * colores.length)]};
                left: ${Math.random() * 100}vw;
                top: -10px;
                border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
                animation: confetiFall ${2 + Math.random() * 3}s linear forwards;
                transform: rotate(${Math.random() * 360}deg);
                z-index: 9998;
                pointer-events: none;
            `;
            document.body.appendChild(confeti);
            setTimeout(() => confeti.remove(), 5000);
        }, i * 50);
    }
}

function mostrarCelebracion() {
    crearConfeti();
    showToast('🎉 ¡Transacción exitosa!', 'success');
}

function compartirLogro() {
    const texto = '🎁 ¡Acabo de canjear mi NFT en Sariel\'s! Únete al ecosistema. #Sariels #WEB3 #NFT';
    if (navigator.share) {
        navigator.share({ title: 'Mi logro en Sariel\'s', text: texto });
    } else {
        navigator.clipboard.writeText(texto).then(() => {
            showToast('📋 Copiado al portapapeles', 'success');
        });
    }
}

function mostrarModalNFT(data) {
    const modal = document.createElement('div');
    modal.id = 'nftModal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8);
        backdrop-filter: blur(10px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        animation: fadeIn 0.5s ease-out;
    `;
    
    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, var(--bg-card), var(--bg-dark)); border: 2px solid var(--gold); border-radius: 20px; padding: 40px; max-width: 500px; width: 90%; text-align: center; animation: scaleIn 0.5s ease-out;">
            <div style="font-size: 80px; margin-bottom: 20px;">🎁</div>
            <h2 style="color: var(--gold); font-size: 28px; margin-bottom: 10px;">¡NFT Canjeado!</h2>
            <p style="color: var(--text-primary); margin-bottom: 20px; font-size: 18px;">Tu Domo físico te espera</p>
            <div style="background: var(--bg-dark); border-radius: 10px; padding: 15px; margin-bottom: 20px;">
                <p style="color: var(--text-muted); font-size: 14px;">⏳ Vigencia: 30 días para reclamar</p>
                <p style="color: var(--cyan); font-size: 12px; margin-top: 5px;">ID: ${data?.nft_id || 'NFT-' + Date.now().toString().slice(-6)}</p>
            </div>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                        style="background: linear-gradient(135deg, var(--gold), #f7971e); border: none; color: #fff; padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">
                    ✅ Entendido
                </button>
                <button onclick="compartirLogro()"
                        style="background: transparent; border: 2px solid var(--cyan); color: var(--cyan); padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">
                    📤 Compartir
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    crearConfeti();
}

// ================================================================
// GESTIÓN DE PERFIL
// ================================================================
function editarPerfil() {
    cambiarTab('config');
    setTimeout(() => {
        const input = document.getElementById('editNombre');
        if (input) {
            input.focus();
            input.select();
        }
    }, 300);
}

async function guardarPerfil() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para guardar', 'error');
        return;
    }

    const perfil = {
        nombre: document.getElementById('editNombre').value.trim() || 'Explorador',
        handle: document.getElementById('editHandle').value.trim().replace('@', '') || 'explorador',
        bio: document.getElementById('editBio').value.trim() || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad'
    };

    if (!/^[a-zA-Z0-9_]+$/.test(perfil.handle)) {
        showToast('❌ El handle solo puede contener letras, números y _', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_ENDPOINTS.perfil}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(perfil)
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error guardando perfil');
        }

        showToast('✅ Perfil guardado correctamente', 'success');
        await cargarPerfil(true);
        
    } catch (error) {
        console.error('Error guardando perfil:', error);
        showToast('❌ Error al guardar: ' + error.message, 'error');
    }
}

function compartirPerfil() {
    const nombre = document.getElementById('perfilNombre')?.textContent.split(' ')[0] || 'Explorador';
    const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
    const url = `${window.location.origin}/perfil/${handle}`;
    const texto = `◈ Perfil de ${nombre} en Sariel's\n◈ ${url}\n\n#Sariels #WEB3 #NFT #Comunidad`;

    if (navigator.share) {
        navigator.share({ title: `Perfil de ${nombre} en Sariel's`, text: texto, url: url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto).then(() => {
            showToast('◈ Copiado al portapapeles', 'success');
        }).catch(() => {
            prompt('Copia este enlace:', url);
        });
    }
}

function irAMuro() {
    window.location.href = '/features/muro/muro.html';
}

function abrirSelectorArchivo() {
    const input = document.getElementById('fileInput');
    if (input) input.click();
}

async function subirFoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para subir foto', 'error');
        return;
    }

    const fileExt = file.name.split('.').pop().toLowerCase();
    const filePath = `${session.user.id}/avatar.${fileExt}`;

    try {
        showToast('⏳ Subiendo foto...', '', 5000);

        const { error: uploadError } = await supabase.storage
            .from('sariels-avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('sariels-avatars')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ avatar_url: publicUrl })
            .eq('id', session.user.id);

        if (updateError) throw updateError;

        showToast('✅ Foto actualizada correctamente', 'success');
        event.target.value = '';
        await cargarPerfil(true);
        
    } catch (error) {
        console.error('Error al subir foto:', error);
        showToast('❌ Error al subir foto', 'error');
    }
}

// ================================================================
// INTERACCIONES SOCIALES
// ================================================================
async function reaccionarPublicacion(postId, tipoReaccion) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Debes iniciar sesión', 'error');
            return;
        }

        const { error } = await supabase
            .from('reacciones')
            .upsert({
                post_id: postId,
                usuario_id: session.user.id,
                tipo: tipoReaccion
            }, { onConflict: 'post_id, usuario_id' });

        if (error) throw error;
        showToast(`❤️ Reaccionaste con ${tipoReaccion}`, 'success');
    } catch (error) {
        console.error('Error al reaccionar:', error);
        showToast('❌ Error al reaccionar', 'error');
    }
}

async function comentarPublicacion(postId, contenido) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para comentar', 'error');
            return;
        }
        if (!contenido.trim()) {
            showToast('⚠️ Escribe un comentario', 'warning');
            return;
        }

        const textoFormateado = formatearTexto(contenido);

        const { error } = await supabase
            .from('muro_comentarios')
            .insert({
                post_id: postId,
                usuario_id: session.user.id,
                contenido: textoFormateado
            });

        if (error) throw error;
        showToast('💬 Comentario publicado', 'success');
        
    } catch (error) {
        console.error('Error al comentar:', error);
        showToast('❌ Error al enviar comentario', 'error');
    }
}

// ================================================================
// SISTEMA DE AMIGOS - SOLICITUDES MEJORADA
// ================================================================
async function agregarAmigo(amigoId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para agregar amigos', 'error');
            return;
        }

        if (amigoId === session.user.id) {
            showToast('⚠️ No puedes agregarte a ti mismo', 'warning');
            return;
        }

        const { error } = await supabase
            .from('contactos')
            .insert({
                usuario_id: session.user.id,
                contacto_id: amigoId,
                estado: 'pendiente'
            });

        if (error) {
            if (error.code === '23505') {
                showToast('⚠️ Ya enviaste solicitud a este usuario', 'warning');
            } else {
                throw error;
            }
            return;
        }

        showToast('🤝 Solicitud de amistad enviada', 'success');
        await cargarSolicitudesPendientes();
        
    } catch (error) {
        console.error('Error al agregar amigo:', error);
        showToast('❌ No se pudo enviar la solicitud: ' + error.message, 'error');
    }
}

// ================================================================
// GENERAR QR PERFIL
// ================================================================
async function generarQRPerfil() {
    try {
        const session = await getSession();
        if (!session) return;
        
        const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
        const url = `${window.location.origin}/perfil/${handle}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
        
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(10px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            animation: fadeIn 0.3s ease-out;
        `;
        modal.innerHTML = `
            <div style="background: var(--bg-card); border-radius: 20px; padding: 30px; text-align: center; animation: scaleIn 0.3s ease-out;">
                <h3 style="color: var(--gold); margin-bottom: 20px;">📱 Escanea mi perfil</h3>
                <img src="${qrUrl}" alt="QR Code" style="border-radius: 10px; max-width: 200px;">
                <p style="color: var(--text-muted); margin-top: 15px; font-size: 12px;">${url}</p>
                <button onclick="this.parentElement.parentElement.remove()"
                        style="margin-top: 20px; background: var(--gold); border: none; color: #fff; padding: 10px 30px; border-radius: 10px; cursor: pointer;">
                    Cerrar
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Error generando QR:', error);
        showToast('❌ Error al generar QR', 'error');
    }
}

// ================================================================
// NIVEL Y ESTADÍSTICAS
// ================================================================
function calcularNivel(tokens) {
    const niveles = [
        { min: 0, max: 4, nombre: '🌱 Explorador', emoji: '🌱' },
        { min: 5, max: 9, nombre: '⚡ Cazador', emoji: '⚡' },
        { min: 10, max: 14, nombre: '🏆 Leyenda', emoji: '🏆' },
        { min: 15, max: 19, nombre: '👑 Maestro', emoji: '👑' },
        { min: 20, max: Infinity, nombre: '✨ Inmortal', emoji: '✨' }
    ];
    
    for (const nivel of niveles) {
        if (tokens >= nivel.min && tokens <= nivel.max) {
            return nivel;
        }
    }
    return niveles[0];
}

async function obtenerEstadisticas() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data, error } = await supabase
            .from('estadisticas_usuarios')
            .select('*')
            .eq('user_id', session.user.id)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        return null;
    }
}

async function subirVideo(event) {
    const file = event.target.files[0];
    if (!file) return;

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para subir videos', 'error');
        return;
    }

    if (!file.type.startsWith('video/')) {
        showToast('❌ Formato no válido', 'error');
        return;
    }

    if (file.size > 50 * 1024 * 1024) {
        showToast('❌ El video excede 50MB', 'error');
        return;
    }

    try {
        showToast('⏳ Subiendo video... 0%', '', 10000);
        
        const fileExt = file.name.split('.').pop();
        const filePath = `${session.user.id}/video_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('posts')
            .upload(filePath, file, {
                onProgress: (progress) => {
                    const percent = Math.round((progress.loaded / progress.total) * 100);
                    showToast(`⏳ Subiendo video... ${percent}%`, '', 10000);
                }
            });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('posts')
            .getPublicUrl(filePath);

        showToast('✅ Video subido con éxito', 'success');
        return urlData.publicUrl;
        
    } catch (error) {
        console.error('Error al subir video:', error);
        showToast('❌ Error al subir el video: ' + error.message, 'error');
    }
}

// ================================================================
// CERRAR SESIÓN
// ================================================================
async function cerrarSesion() {
    if (!confirm('¿Seguro que quieres cerrar sesión?')) return;
    
    try {
        await actualizarEstadoEnLinea(false);
        await supabase.auth.signOut();
        window.location.href = '/';
        showToast('🔌 Sesión cerrada', 'success');
    } catch (error) {
        console.error('Error cerrando sesión:', error);
        showToast('❌ Error al cerrar sesión', 'error');
    }
}

// ================================================================
// NOTIFICACIONES EN TIEMPO REAL
// ================================================================
function iniciarNotificacionesRealtime() {
    const channel = supabase
        .channel('notificaciones')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notificaciones'
        }, (payload) => {
            const notificacion = payload.new;
            if (notificacion.user_id === perfilCache?.id) {
                showToast(`🔔 ${notificacion.mensaje}`, 'warning', 4000);
                
                try {
                    const audio = new Audio('/sound/notification.mp3');
                    audio.play().catch(() => {});
                } catch (e) {}
            }
        })
        .subscribe();

    return channel;
}

// ================================================================
// INICIALIZACIÓN
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    if (typeof jsQR === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
        document.head.appendChild(script);
        await new Promise(resolve => script.onload = resolve);
    }
    
    await cargarPerfil();
    
    const stats = await obtenerEstadisticas();
    if (stats) {
        const nivel = calcularNivel(stats.tokens_actuales || 0);
        const nivelEl = document.getElementById('nivelUsuario');
        if (nivelEl) {
            nivelEl.textContent = `${nivel.emoji} ${nivel.nombre}`;
        }
    }
    
    iniciarNotificacionesRealtime();
    iniciarEscuchaConexion();
    iniciarEscuchaAmigos();
    iniciarDetectorInactividad();
    await cargarHistorialQR();
    await cargarSolicitudesPendientes();

    if (perfilCache?.esim_iccid) {
        setInterval(() => {
            cargarDatosESIM(perfilCache.esim_iccid);
        }, 30000);
    }

    setInterval(() => {
        cargarEstadoConexion();
    }, 10000);

    setInterval(() => {
        cargarAmigosEnLinea();
    }, 15000);

    // Controles de cantidad crypto
    const cryptoQty = document.getElementById('cryptoQuantity');
    if (cryptoQty) {
        document.getElementById('cryptoDecreaseQty').addEventListener('click', () => {
            let val = parseInt(cryptoQty.textContent);
            if (val > 1) {
                cryptoQty.textContent = val - 1;
                actualizarCryptoTotal();
            }
        });
        document.getElementById('cryptoIncreaseQty').addEventListener('click', () => {
            let val = parseInt(cryptoQty.textContent);
            if (val < 10) {
                cryptoQty.textContent = val + 1;
                actualizarCryptoTotal();
            }
        });
    }

    function actualizarCryptoTotal() {
        const qty = parseInt(cryptoQty?.textContent || 1);
        const total = qty * 4.50;
        const comision = total * 0.02;
        const totalConComision = total + comision;
        const totalEl = document.getElementById('cryptoTotal');
        if (totalEl) {
            totalEl.textContent = `$${totalConComision.toFixed(2)} USDT`;
        }
    }
    actualizarCryptoTotal();
});

// ================================================================
// ESTILOS CSS INYECTADOS
// ================================================================
const estilosAnimacion = document.createElement('style');
estilosAnimacion.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    @keyframes scaleIn {
        from { transform: scale(0.8); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
    }
    @keyframes slideInRight {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100px); opacity: 0; }
    }
    @keyframes confetiFall {
        from { transform: translateY(0) rotate(0deg); opacity: 1; }
        to { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }
    .toast {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 12px;
        background: var(--bg-card);
        color: var(--text-primary);
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        border: 1px solid var(--border-color);
        z-index: 9999;
        transform: translateX(100px);
        opacity: 0;
        transition: all 0.3s ease;
        max-width: 400px;
        backdrop-filter: blur(10px);
    }
    .toast.show {
        transform: translateX(0);
        opacity: 1;
    }
    .toast.error {
        border-color: #ff6b6b;
        background: rgba(255, 107, 107, 0.1);
    }
    .toast.warning {
        border-color: #feca57;
        background: rgba(254, 202, 87, 0.1);
    }
    .toast.success {
        border-color: #2ecc71;
        background: rgba(46, 204, 113, 0.1);
    }
`;
document.head.appendChild(estilosAnimacion);

// ================================================================
// EXPOSICIÓN DE FUNCIONES GLOBALES
// ================================================================
window.cambiarTab = cambiarTab;
window.cargarPerfil = cargarPerfil;
window.guardarPerfil = guardarPerfil;
window.abrirSelectorArchivo = abrirSelectorArchivo;
window.subirFoto = subirFoto;
window.subirVideo = subirVideo;
window.editarPerfil = editarPerfil;
window.compartirPerfil = compartirPerfil;
window.conectarWallet = conectarWallet;
window.desconectarWallet = desconectarWallet;
window.comprarDomo = comprarDomo;
window.canjearNFT = canjearNFT;
window.reaccionarPublicacion = reaccionarPublicacion;
window.comentarPublicacion = comentarPublicacion;
window.agregarAmigo = agregarAmigo;
window.cerrarSesion = cerrarSesion;
window.irAMuro = irAMuro;
window.showToast = showToast;
window.generarQRPerfil = generarQRPerfil;
window.calcularNivel = calcularNivel;
window.compartirLogro = compartirLogro;

window.comprarESIM = comprarESIM;
window.cargarDatosESIM = cargarDatosESIM;
window.activarESIM = activarESIM;
window.desactivarESIM = desactivarESIM;
window.generarQRESIM = generarQRESIM;
window.obtenerEstadoESIM = obtenerEstadoESIM;
window.obtenerPlanesESIM = obtenerPlanesESIM;
window.verificarPago = verificarPago;
window.sincronizarESIM = sincronizarESIM;

window.comprarConCripto = comprarConCripto;
window.verificarPagoCrypto = verificarPagoCrypto;
window.copiarDireccion = copiarDireccion;
window.cerrarModalPago = cerrarModalPago;

window.cambiarConexion = cambiarConexion;
window.cargarEstadoConexion = cargarEstadoConexion;
window.getPerfilActual = getPerfilActual;

window.actualizarEstadoEnLinea = actualizarEstadoEnLinea;
window.cambiarEstado = cambiarEstado;
window.cargarAmigosEnLinea = cargarAmigosEnLinea;
window.actualizarListaAmigos = actualizarListaAmigos;

window.escanearQR = escanearQR;
window.abrirCamaraQR = abrirCamaraQR;
window.cerrarCamaraQR = cerrarCamaraQR;
window.cargarHistorialQR = cargarHistorialQR;
window.actualizarUIHistorialQR = actualizarUIHistorialQR;
window.procesarQR = procesarQR;

// Funciones del sistema de amistades
window.obtenerSolicitudesPendientes = obtenerSolicitudesPendientes;
window.aceptarSolicitudAmistad = aceptarSolicitudAmistad;
window.rechazarSolicitudAmistad = rechazarSolicitudAmistad;
window.cargarSolicitudesPendientes = cargarSolicitudesPendientes;
window.actualizarUISolicitudes = actualizarUISolicitudes;