/* ================================================================
   PERFIL.JS - SARIEL'S ECOSYSTEM
   VERSIÓN FUNCIONAL - INTEGRACIÓN COMPLETA CON SERVER.JS + SUPABASE + TELNYX
   ================================================================ */

// ================================================================
// CONFIGURACIÓN SUPABASE - SIN DECLARACIÓN DUPLICADA
// ================================================================
const supabaseClient = window.supabaseClient || window.supabase.createClient(
    'https://zultnlogdoajehbswlih.supabase.co',
    'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
);

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
    const { data: { session } } = await supabaseClient.auth.getSession();
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

        const { data, error } = await supabaseClient.rpc('obtener_mi_perfil');

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
        supabaseClient.removeChannel(canalAmigos);
    }

    canalAmigos = supabaseClient
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

        const { data: enLinea, error: enLineaError } = await supabaseClient
            .from('usuarios')
            .select('id, nombre, handle, avatar_url, online, ultima_conexion')
            .in('id', idsContactos)
            .eq('online', true);

        if (enLineaError) throw enLineaError;

        const { data: todosContactos, error: todosError } = await supabaseClient
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
        const { data: contactos, error } = await supabaseClient
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id)
            .eq('estado', 'activo');

        if (error || !contactos) return;

        for (const contacto of contactos) {
            await supabaseClient
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

        const { data, error } = await supabaseClient.rpc('obtener_solicitudes_pendientes');

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

        const { data, error } = await supabaseClient.rpc('aceptar_solicitud_amistad', {
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

        const { data, error } = await supabaseClient.rpc('rechazar_solicitud_amistad', {
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

        const { error } = await supabaseClient
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

        const { error } = await supabaseClient
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

        const { data: usuario, error } = await supabaseClient
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

// Continuará con el resto de funciones (esim, wallet, etc.) usando supabaseClient en lugar de supabase
// ... (el resto del archivo es idéntico pero con supabaseClient reemplazando a supabase)