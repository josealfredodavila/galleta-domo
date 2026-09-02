/* ================================================================
   PERFIL.JS - SARIEL'S ECOSYSTEM
   INTEGRACIÓN REAL SUPABASE - PRODUCCIÓN
   RUTA: backend/public/features/perfil/perfil.js
   ================================================================ */

// ================================================================
// CONFIGURACIÓN SUPABASE - REUTILIZAR EL CLIENTE GLOBAL
// ================================================================
let supabase = window.supabase;

if (typeof supabase === 'undefined') {
    console.error('❌ Supabase no está disponible. Asegúrate de que app.js cargue primero.');
}

// ================================================================
// CONFIGURACIÓN DE ENTORNO Y ENDPOINTS
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

const BACKEND_URL = window.location.origin;
const API_ENDPOINTS = {
    esim: `${BACKEND_URL}/api/esim`,
    pagos: `${BACKEND_URL}/api/pagos`,
    perfil: `${BACKEND_URL}/api/perfil`,
    qr: `${BACKEND_URL}/api/qr`
};

// ================================================================
// UTILIDADES
// ================================================================
function escapeHTML(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

function showToast(msg, type = '', duration = 3500) {
    try {
        let t = document.getElementById('toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toast';
            t.className = 'toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.className = 'toast show';
        
        if (type === 'error') t.classList.add('error');
        else if (type === 'warning') t.classList.add('warning');
        else if (type === 'success') t.classList.add('success');
        else t.classList.remove('error', 'warning', 'success');
        
        clearTimeout(t._timeout);
        t._timeout = setTimeout(() => {
            t.classList.remove('show');
        }, duration);
    } catch (e) {
        console.warn('Toast no disponible:', e);
        alert(msg);
    }
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
// SESIÓN Y NAVEGACIÓN
// ================================================================
async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;
    return session;
}

function cambiarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const tabContent = document.getElementById('tab-' + tab);
    if (tabContent) {
        tabContent.classList.add('active');
    }
    const tabBtn = document.querySelector(`.tab-btn[onclick="cambiarTab('${tab}')"]`);
    if (tabBtn) tabBtn.classList.add('active');
}

// ================================================================
// CARGA DE PERFIL REAL (TABLA: usuarios)
// ================================================================
let perfilCache = null;

async function cargarPerfil() {
    try {
        const session = await getSession();
        if (!session) {
            window.location.href = '/login.html';
            return;
        }

        const { data: usuario, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (error) throw error;

        perfilCache = usuario;
        actualizarUI(usuario);

        // Cargas secundarias vinculadas
        await Promise.allSettled([
            cargarWalletConectada(session.user.id),
            cargarHistorialESTOKS(session.user.id),
            cargarNFTsUsuario(session.user.id),
            cargarEstadisticas(session.user.id),
            cargarRelacionesSociales(session.user.id),
            cargarSolicitudesPendientes(session.user.id),
            cargarAmigos(session.user.id)
        ]);

    } catch (error) {
        console.error('Error al cargar perfil real:', error);
        showToast('❌ Error al cargar datos del perfil', 'error');
    }
}

function actualizarUI(data) {
    if (!data) return;

    // Identidad
    const nombreEl = document.getElementById('perfilNombre');
    const handleEl = document.getElementById('perfilHandle');
    const bioEl = document.getElementById('perfilBio');
    const avatarEl = document.getElementById('perfilAvatar');
    const portadaEl = document.getElementById('perfilPortada');
    const ubicacionEl = document.getElementById('perfilUbicacion');
    const sitioWebEl = document.getElementById('perfilSitioWeb');

    if (nombreEl) {
        const verificado = data.verificado ? ' <span class="verified">✦ VERIFICADO</span>' : '';
        nombreEl.innerHTML = `${escapeHTML(data.nombre || 'Usuario')}${verificado}`;
    }
    if (handleEl) handleEl.textContent = '@' + (data.handle || 'usuario');
    if (bioEl) bioEl.textContent = data.bio || 'Sin biografía';
    if (ubicacionEl) ubicacionEl.textContent = data.ubicacion || 'No especificada';
    if (sitioWebEl) sitioWebEl.textContent = data.sitio_web || '';

    if (avatarEl && data.avatar_url) {
        avatarEl.src = data.avatar_url;
    }
    if (portadaEl && data.portada_url) {
        portadaEl.style.backgroundImage = `url(${data.portada_url})`;
    }

    // Tokens y Canje
    const tokenTotal = document.getElementById('tokenTotal');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const btnCanjear = document.getElementById('canjearNft');

    const tokensParaCanje = data.tokens_para_canje || 0;
    const progreso = Math.min(tokensParaCanje, 12);

    if (tokenTotal) tokenTotal.textContent = data.tokens || 0;
    if (progressFill) progressFill.style.width = `${(progreso / 12) * 100}%`;
    if (progressText) progressText.textContent = `${progreso} / 12`;

    if (btnCanjear) {
        btnCanjear.disabled = !data.puede_canjear && tokensParaCanje < 12;
    }

    // Conectividad & eSIM
    actualizarUIConectividad(data);

    // Campos de edición
    const editNombre = document.getElementById('editNombre');
    const editHandle = document.getElementById('editHandle');
    const editBio = document.getElementById('editBio');
    const editUbicacion = document.getElementById('editUbicacion');
    const editSitioWeb = document.getElementById('editSitioWeb');

    if (editNombre) editNombre.value = data.nombre || '';
    if (editHandle) editHandle.value = data.handle || '';
    if (editBio) editBio.value = data.bio || '';
    if (editUbicacion) editUbicacion.value = data.ubicacion || '';
    if (editSitioWeb) editSitioWeb.value = data.sitio_web || '';
}

function actualizarUIConectividad(data) {
    const esimStatus = document.getElementById('esimStatus');
    const esimDataUsed = document.getElementById('esimDataUsed');
    const esimDataLimit = document.getElementById('esimDataLimit');
    const esimIccid = document.getElementById('esimIccid');
    const conexionTipo = document.getElementById('conexionTipo');

    if (esimIccid) esimIccid.textContent = data.esim_iccid || 'Sin eSIM';
    if (esimStatus) esimStatus.textContent = data.esim_status || 'Inactiva';

    if (data.esim_iccid) {
        if (esimDataUsed) esimDataUsed.textContent = `${((data.esim_data_used || 0) / 1024 / 1024).toFixed(2)} MB`;
        if (esimDataLimit) esimDataLimit.textContent = `${((data.esim_data_limit || 0) / 1024 / 1024).toFixed(2)} MB`;
    } else {
        if (esimDataUsed) esimDataUsed.textContent = '0 MB';
        if (esimDataLimit) esimDataLimit.textContent = '0 MB';
    }

    if (conexionTipo) {
        conexionTipo.textContent = data.conexion_tipo ? `${data.conexion_tipo.toUpperCase()} (${data.conexion_velocidad || 'N/A'})` : 'Desconectado';
    }
}

// ================================================================
// GUARDAR PERFIL REAL (TABLA: usuarios)
// ================================================================
async function guardarPerfil() {
    try {
        const session = await getSession();
        if (!session) return;

        const nombre = document.getElementById('editNombre')?.value?.trim();
        const handle = document.getElementById('editHandle')?.value?.trim().replace('@', '');
        const bio = document.getElementById('editBio')?.value?.trim();
        const ubicacion = document.getElementById('editUbicacion')?.value?.trim();
        const sitio_web = document.getElementById('editSitioWeb')?.value?.trim();

        if (!handle || handle.length < 3) {
            showToast('❌ El handle debe tener al menos 3 caracteres', 'error');
            return;
        }

        const updates = {
            nombre: nombre,
            handle: handle,
            bio: bio,
            ubicacion: ubicacion,
            sitio_web: sitio_web
        };

        const { error } = await supabase
            .from('usuarios')
            .update(updates)
            .eq('id', session.user.id);

        if (error) throw error;

        showToast('✅ Perfil actualizado exitosamente', 'success');
        await cargarPerfil();

    } catch (error) {
        console.error('Error al guardar perfil:', error);
        showToast('❌ Error al actualizar el perfil: ' + error.message, 'error');
    }
}

// ================================================================
// WALLET REAL (TABLA: wallet_conexiones)
// ================================================================
async function cargarWalletConectada(userId) {
    const { data: wallet } = await supabase
        .from('wallet_conexiones')
        .select('*')
        .eq('usuario_id', userId)
        .eq('activa', true)
        .maybeSingle();

    const walletDisplay = document.getElementById('walletDisplay');
    const btnConectar = document.getElementById('btnConectarWallet');
    const btnDesconectar = document.getElementById('btnDesconectarWallet');

    if (wallet && wallet.wallet_address) {
        if (walletDisplay) {
            walletDisplay.textContent = wallet.wallet_address.slice(0, 6) + '...' + wallet.wallet_address.slice(-4);
            walletDisplay.style.color = 'var(--success)';
        }
        if (btnConectar) btnConectar.style.display = 'none';
        if (btnDesconectar) btnDesconectar.style.display = 'inline-flex';
    } else {
        if (walletDisplay) {
            walletDisplay.textContent = '⚠️ No conectada';
            walletDisplay.style.color = 'var(--text-muted)';
        }
        if (btnConectar) btnConectar.style.display = 'inline-flex';
        if (btnDesconectar) btnDesconectar.style.display = 'none';
    }
}

async function conectarWallet() {
    if (typeof window.ethereum === 'undefined') {
        showToast('⚠️ No se detectó proveedor Web3 (ej. MetaMask)', 'error');
        return;
    }

    try {
        const session = await getSession();
        if (!session) return;

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const address = accounts[0];
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });

        // Sincronizar estado con tabla wallet_conexiones
        const { error: upsertError } = await supabase
            .from('wallet_conexiones')
            .upsert({
                usuario_id: session.user.id,
                wallet_address: address,
                chain_id: chainId,
                network_name: ENV.networkName,
                activa: true,
                conectada_en: new Date().toISOString()
            }, { onConflict: 'usuario_id, wallet_address' });

        if (upsertError) throw upsertError;

        // Actualizar referencia en usuarios
        await supabase
            .from('usuarios')
            .update({ wallet_address: address })
            .eq('id', session.user.id);

        showToast('✅ Wallet vinculada correctamente', 'success');
        await cargarPerfil();

    } catch (error) {
        console.error('Error al conectar wallet:', error);
        showToast('❌ Error al conectar wallet: ' + error.message, 'error');
    }
}

async function desconectarWallet() {
    try {
        const session = await getSession();
        if (!session) return;

        const { error } = await supabase
            .from('wallet_conexiones')
            .update({ activa: false, desconectada_en: new Date().toISOString() })
            .eq('usuario_id', session.user.id)
            .eq('activa', true);

        if (error) throw error;

        await supabase
            .from('usuarios')
            .update({ wallet_address: null })
            .eq('id', session.user.id);

        showToast('🔌 Wallet desconectada', 'warning');
        await cargarPerfil();

    } catch (error) {
        console.error('Error al desconectar wallet:', error);
        showToast('❌ Error al desconectar wallet', 'error');
    }
}

// ================================================================
// E.S.TOKS REALES (TABLA: es_toks_movimientos)
// ================================================================
async function cargarHistorialESTOKS(userId) {
    try {
        const { data: movimientos, error } = await supabase
            .from('es_toks_movimientos')
            .select('*')
            .eq('usuario_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('historialESTOKSContainer');
        if (!container) return;

        if (!movimientos || movimientos.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay movimientos registrados.</p>';
            return;
        }

        container.innerHTML = movimientos.map(m => `
            <div class="movimiento-item">
                <span class="tipo ${m.cantidad >= 0 ? 'ingreso' : 'egreso'}">${escapeHTML(m.tipo)}</span>
                <span class="cantidad">${m.cantidad >= 0 ? '+' : ''}${m.cantidad}</span>
                <span class="fecha">${haceTiempo(m.created_at)}</span>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error al cargar E.S.TOKS:', error);
    }
}

// ================================================================
// ESCANEO QR Y DOMOS (OPERACIÓN BACKEND / RPC SEGURA)
// ================================================================
async function procesarEscaneoQR(codigoQR) {
    if (!codigoQR) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Sesión requerida para escanear', 'error');
            return;
        }

        showToast('⏳ Validando QR con el servidor...', '', 4000);

        // Invocación a operación segura en backend/RPC
        const { data, error } = await supabase.rpc('procesar_escaneo_qr', {
            p_codigo: codigoQR
        });

        if (error) throw error;

        if (data && data.success) {
            showToast('🎉 ¡QR Escaneado con éxito! +1 E.S.TOK', 'success');
            await cargarPerfil();
        } else {
            showToast(`❌ Error: ${data?.message || 'QR inválido o ya utilizado'}`, 'error');
        }

    } catch (error) {
        console.error('Error en procesarEscaneoQR:', error);
        showToast('❌ Fallo en la validación del QR: ' + error.message, 'error');
    }
}

// ================================================================
// NFTS REALES (TABLA: nfts_usuario)
// ================================================================
async function cargarNFTsUsuario(userId) {
    try {
        const { data: nfts, error } = await supabase
            .from('nfts_usuario')
            .select('*')
            .eq('usuario_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('nftsContainer');
        const statNFTS = document.getElementById('statNFTS');

        if (statNFTS) statNFTS.textContent = nfts ? nfts.length : 0;
        if (!container) return;

        if (!nfts || nfts.length === 0) {
            container.innerHTML = '<p class="empty-state">No posees NFTs conmemorativos.</p>';
            return;
        }

        container.innerHTML = nfts.map(nft => `
            <div class="nft-card">
                <img src="${nft.imagen_url || '/placeholder-nft.png'}" alt="${escapeHTML(nft.nombre)}" class="nft-img"/>
                <div class="nft-info">
                    <h4>${escapeHTML(nft.nombre)}</h4>
                    <p class="codigo">Código: ${escapeHTML(nft.codigo_nft)}</p>
                    <p class="estado">Estado: ${escapeHTML(nft.estado)}</p>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error al cargar NFTs:', error);
    }
}

// ================================================================
// ESTADÍSTICAS REALES (TABLA: estadisticas_usuarios)
// ================================================================
async function cargarEstadisticas(userId) {
    try {
        const { data: stats, error } = await supabase
            .from('estadisticas_usuarios')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) throw error;
        if (!stats) return;

        const domosEl = document.getElementById('statDomos');
        const publicacionesEl = document.getElementById('statPublicaciones');

        if (domosEl) domosEl.textContent = stats.domos_comprados || 0;
        if (publicacionesEl) publicacionesEl.textContent = stats.publicaciones_creadas || 0;

    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}

// ================================================================
// RED SOCIAL REAL
// ================================================================
async function cargarRelacionesSociales(userId) {
    try {
        // Seguidores
        const { count: countSeguidores } = await supabase
            .from('seguidores')
            .select('*', { count: 'exact', head: true })
            .eq('seguido_id', userId);

        // Siguiendo
        const { count: countSiguiendo } = await supabase
            .from('seguidores')
            .select('*', { count: 'exact', head: true })
            .eq('seguidor_id', userId);

        const elSeguidores = document.getElementById('statSeguidores');
        const elSiguiendo = document.getElementById('statSiguiendo');

        if (elSeguidores) elSeguidores.textContent = countSeguidores || 0;
        if (elSiguiendo) elSiguiendo.textContent = countSiguiendo || 0;

    } catch (error) {
        console.error('Error cargando relaciones sociales:', error);
    }
}

async function cargarSolicitudesPendientes(userId) {
    try {
        const { data: solicitudes, error } = await supabase
            .from('solicitudes_amistad')
            .select('id, solicitante_id, fecha_solicitud, usuarios!solicitante_id(nombre, handle, avatar_url)')
            .eq('receptor_id', userId)
            .eq('estado', 'pendiente');

        if (error) throw error;
        renderSolicitudesUI(solicitudes || []);

    } catch (error) {
        console.error('Error cargando solicitudes:', error);
    }
}

function renderSolicitudesUI(solicitudes) {
    const container = document.getElementById('solicitudesContainer');
    if (!container) return;

    if (solicitudes.length === 0) {
        container.innerHTML = '<p class="empty-state">No hay solicitudes pendientes.</p>';
        return;
    }

    container.innerHTML = solicitudes.map(s => {
        const u = s.usuarios || {};
        return `
            <div class="solicitud-item">
                <span>${escapeHTML(u.nombre || u.handle)}</span>
                <div>
                    <button onclick="responderSolicitud('${s.id}', 'aceptada')">Aceptar</button>
                    <button onclick="responderSolicitud('${s.id}', 'rechazada')">Rechazar</button>
                </div>
            </div>
        `;
    }).join('');
}

async function responderSolicitud(solicitudId, nuevoEstado) {
    try {
        const session = await getSession();
        if (!session) return;

        const { error } = await supabase
            .from('solicitudes_amistad')
            .update({ estado: nuevoEstado })
            .eq('id', solicitudId)
            .eq('receptor_id', session.user.id);

        if (error) throw error;

        showToast(`Solicitud ${nuevoEstado}`, 'success');
        await cargarPerfil();

    } catch (error) {
        console.error('Error al responder solicitud:', error);
        showToast('❌ Error al actualizar solicitud', 'error');
    }
}

async function cargarAmigos(userId) {
    try {
        const { data: amigos, error } = await supabase
            .from('amigos')
            .select('id, amigo_id, usuarios!amigo_id(id, nombre, handle, avatar_url, online)')
            .eq('usuario_id', userId);

        if (error) throw error;

        const container = document.getElementById('amigosContainer');
        if (!container) return;

        if (!amigos || amigos.length === 0) {
            container.innerHTML = '<p class="empty-state">Sin amigos agregados.</p>';
            return;
        }

        container.innerHTML = amigos.map(a => {
            const u = a.usuarios || {};
            return `
                <div class="amigo-card">
                    <img src="${u.avatar_url || '/placeholder-avatar.png'}" class="avatar-mini"/>
                    <span>${escapeHTML(u.nombre || u.handle)}</span>
                    <span class="status">${u.online ? '🟢' : '⭕'}</span>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error al cargar amigos:', error);
    }
}

async function bloquearUsuario(targetUserId) {
    try {
        const session = await getSession();
        if (!session) return;

        const { error } = await supabase
            .from('bloquear')
            .insert({
                usuario_id: session.user.id,
                bloqueado_id: targetUserId,
                created_at: new Date().toISOString()
            });

        if (error) throw error;
        showToast('Usuario bloqueado', 'warning');

    } catch (error) {
        console.error('Error al bloquear usuario:', error);
    }
}

// ================================================================
// INICIALIZACIÓN
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    cargarPerfil();
});
