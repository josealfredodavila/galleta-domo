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

        // Usar RPC obtener_mi_perfil() si existe, o consulta directa
        try {
            const { data: perfilRPC, error: rpcError } = await supabase
                .rpc('obtener_mi_perfil');
            
            if (!rpcError && perfilRPC) {
                perfilCache = perfilRPC;
                actualizarUI(perfilRPC);
            } else {
                // Fallback a consulta directa
                const { data: usuario, error } = await supabase
                    .from('usuarios')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                
                if (error) throw error;
                perfilCache = usuario;
                actualizarUI(usuario);
            }
        } catch (error) {
            // Fallback a consulta directa
            const { data: usuario, error } = await supabase
                .from('usuarios')
                .select('*')
                .eq('id', session.user.id)
                .single();
            
            if (error) throw error;
            perfilCache = usuario;
            actualizarUI(usuario);
        }

        // Cargas secundarias vinculadas
        await Promise.allSettled([
            cargarWalletConectada(),
            cargarHistorialESTOKS(),
            cargarNFTsUsuario(),
            cargarEstadisticas(),
            cargarRelacionesSociales(),
            cargarSolicitudesPendientes(),
            cargarAmigos()
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
        avatarEl.innerHTML = `<img src="${data.avatar_url}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;"/>`;
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
    const esimDataRestante = document.getElementById('esimDataRestante');
    const esimDataProgress = document.getElementById('esimDataProgress');
    const conexionTipo = document.getElementById('conexionTipo');

    if (esimIccid) esimIccid.textContent = data.esim_iccid || 'Sin eSIM';
    if (esimStatus) esimStatus.textContent = data.esim_status || 'Inactiva';

    if (data.esim_iccid) {
        const usado = data.esim_data_used || 0;
        const limite = data.esim_data_limit || 0;
        const restante = Math.max(0, limite - usado);
        
        if (esimDataUsed) esimDataUsed.textContent = `${(usado / 1024 / 1024).toFixed(2)} MB`;
        if (esimDataLimit) esimDataLimit.textContent = `${(limite / 1024 / 1024).toFixed(2)} MB`;
        if (esimDataRestante) esimDataRestante.textContent = `${(restante / 1024 / 1024).toFixed(2)} MB`;
        
        if (esimDataProgress) {
            const porcentaje = limite > 0 ? (usado / limite) * 100 : 0;
            esimDataProgress.style.width = `${Math.min(porcentaje, 100)}%`;
            esimDataProgress.style.background = porcentaje > 80 ? 'var(--danger)' : 'var(--success)';
        }
    } else {
        if (esimDataUsed) esimDataUsed.textContent = '0 MB';
        if (esimDataLimit) esimDataLimit.textContent = '0 MB';
        if (esimDataRestante) esimDataRestante.textContent = '0 MB';
        if (esimDataProgress) esimDataProgress.style.width = '0%';
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
        if (!session) {
            showToast('⚠️ Sesión no encontrada', 'error');
            return;
        }

        const nombre = document.getElementById('editNombre')?.value?.trim();
        const handle = document.getElementById('editHandle')?.value?.trim().replace('@', '');
        const bio = document.getElementById('editBio')?.value?.trim();
        const ubicacion = document.getElementById('editUbicacion')?.value?.trim();
        const sitio_web = document.getElementById('editSitioWeb')?.value?.trim();

        if (!handle || handle.length < 3) {
            showToast('❌ El handle debe tener al menos 3 caracteres', 'error');
            return;
        }

        // Validar que el handle no esté en uso por otro usuario
        const { data: existingUser, error: checkError } = await supabase
            .from('usuarios')
            .select('id')
            .eq('handle', handle)
            .neq('id', session.user.id)
            .maybeSingle();

        if (checkError) throw checkError;
        if (existingUser) {
            showToast('❌ Este handle ya está en uso', 'error');
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
// WALLET REAL (RPC: vincular_wallet / desvincular_wallet)
// ================================================================
async function cargarWalletConectada() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data: wallet } = await supabase
            .from('wallet_conexiones')
            .select('*')
            .eq('usuario_id', session.user.id)
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
    } catch (error) {
        console.error('Error al cargar wallet:', error);
    }
}

async function conectarWallet() {
    if (typeof window.ethereum === 'undefined') {
        showToast('⚠️ No se detectó proveedor Web3 (ej. MetaMask)', 'error');
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para conectar wallet', 'error');
            return;
        }

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const address = accounts[0];
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });

        // Usar RPC vincular_wallet
        const { data, error } = await supabase.rpc('vincular_wallet', {
            p_wallet_address: address,
            p_chain_id: chainId,
            p_network_name: ENV.networkName
        });

        if (error) throw error;

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
        if (!session) {
            showToast('⚠️ Inicia sesión para desconectar wallet', 'error');
            return;
        }

        // Usar RPC desvincular_wallet
        const { data, error } = await supabase.rpc('desvincular_wallet');

        if (error) throw error;

        showToast('🔌 Wallet desconectada', 'warning');
        await cargarPerfil();

    } catch (error) {
        console.error('Error al desconectar wallet:', error);
        showToast('❌ Error al desconectar wallet: ' + error.message, 'error');
    }
}

// ================================================================
// E.S.TOKS REALES (TABLA: es_toks_movimientos)
// ================================================================
async function cargarHistorialESTOKS() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data: movimientos, error } = await supabase
            .from('es_toks_movimientos')
            .select('*')
            .eq('usuario_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('historialList');
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
// ESCANEO QR Y DOMOS (RPC: registrar_escaneo_domo)
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

        // Llamada correcta: SOLO p_codigo, usuario se obtiene con auth.uid()
        const { data, error } = await supabase.rpc('registrar_escaneo_domo', {
            p_codigo: codigoQR
        });

        if (error) throw error;

        if (data && data.ok) {
            // Actualizar UI con los datos devueltos
            if (data.tokens !== undefined) {
                const tokenTotal = document.getElementById('tokenTotal');
                if (tokenTotal) tokenTotal.textContent = data.tokens;
            }
            
            if (data.tokens_acumulados !== undefined) {
                const progressFill = document.getElementById('progressFill');
                const progressText = document.getElementById('progressText');
                const progreso = Math.min(data.tokens_acumulados, 12);
                if (progressFill) progressFill.style.width = `${(progreso / 12) * 100}%`;
                if (progressText) progressText.textContent = `${progreso} / 12`;
            }

            if (data.puede_canjear !== undefined) {
                const btnCanjear = document.getElementById('canjearNft');
                if (btnCanjear) btnCanjear.disabled = !data.puede_canjear;
            }

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
async function cargarNFTsUsuario() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data: nfts, error } = await supabase
            .from('nfts_usuario')
            .select('*')
            .eq('usuario_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('nftGalleryContainer');
        const statNFTS = document.getElementById('statNFTS');

        if (statNFTS) statNFTS.textContent = nfts ? nfts.length : 0;
        if (!container) return;

        if (!nfts || nfts.length === 0) {
            container.innerHTML = '<p class="empty-state">No posees NFTs conmemorativos.</p>';
            return;
        }

        container.innerHTML = nfts.map(nft => `
            <div class="nft-card" onclick="abrirModalNft('${nft.id}')">
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
async function cargarEstadisticas() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data: stats, error } = await supabase
            .from('estadisticas_usuarios')
            .select('*')
            .eq('user_id', session.user.id)
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
async function cargarRelacionesSociales() {
    try {
        const session = await getSession();
        if (!session) return;

        // Seguidores
        const { count: countSeguidores } = await supabase
            .from('seguidores')
            .select('*', { count: 'exact', head: true })
            .eq('seguido_id', session.user.id);

        // Siguiendo
        const { count: countSiguiendo } = await supabase
            .from('seguidores')
            .select('*', { count: 'exact', head: true })
            .eq('seguidor_id', session.user.id);

        const elSeguidores = document.getElementById('statSeguidores');
        const elSiguiendo = document.getElementById('statSiguiendo');

        if (elSeguidores) elSeguidores.textContent = countSeguidores || 0;
        if (elSiguiendo) elSiguiendo.textContent = countSiguiendo || 0;

    } catch (error) {
        console.error('Error cargando relaciones sociales:', error);
    }
}

async function cargarSolicitudesPendientes() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data: solicitudes, error } = await supabase
            .from('solicitudes_amistad')
            .select('id, solicitante_id, fecha_solicitud, usuarios!solicitante_id(nombre, handle, avatar_url)')
            .eq('receptor_id', session.user.id)
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
        if (!session) {
            showToast('⚠️ Sesión requerida', 'error');
            return;
        }

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

async function cargarAmigos() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data: amigos, error } = await supabase
            .from('amigos')
            .select('id, amigo_id, usuarios!amigo_id(id, nombre, handle, avatar_url, online)')
            .eq('usuario_id', session.user.id);

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
        if (!session) {
            showToast('⚠️ Sesión requerida', 'error');
            return;
        }

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
        showToast('❌ Error al bloquear usuario', 'error');
    }
}

// ================================================================
// FUNCIONES DE PERFIL (Handlers HTML → JS)
// ================================================================

// ===== EDICIÓN DE PERFIL =====
function editarPerfil() {
    cambiarTab('config');
    
    const form = document.getElementById('formPerfil');
    if (form) {
        setTimeout(() => {
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }
    
    const nombreInput = document.getElementById('editNombre');
    if (nombreInput) {
        setTimeout(() => nombreInput.focus(), 400);
    }
    
    showToast('✏️ Edita tu perfil en la pestaña Ajustes', '');
}

function compartirPerfil() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({
            title: 'Mi perfil en Sariel\'s',
            text: '◈ Mira mi perfil en Sariel\'s Ecosystem',
            url: url
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast('📋 Enlace copiado al portapapeles', 'success');
        }).catch(() => {
            showToast('📋 Copia el enlace: ' + url, '');
        });
    }
}

function generarQRPerfil() {
    const modal = document.getElementById('qrPerfilModal');
    if (!modal) {
        showToast('⚠️ Modal de QR no disponible', 'error');
        return;
    }
    
    const url = window.location.href;
    const qrImg = document.getElementById('qrPerfilImage');
    if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    }
    modal.classList.add('active');
}

// ===== IMAGENES =====
function abrirSelectorArchivo() {
    const input = document.getElementById('fileInput');
    if (input) {
        input.click();
    }
}

async function subirFoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Sesión requerida', 'error');
            return;
        }
        
        showToast('⏳ Subiendo imagen...', '', 4000);
        
        // Verificar si existe el bucket 'avatars'
        const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
        
        if (bucketError) {
            console.error('Error al listar buckets:', bucketError);
            showToast('❌ Storage no disponible', 'error');
            return;
        }
        
        const bucketExists = buckets.some(b => b.name === 'avatars');
        
        if (!bucketExists) {
            showToast('⚠️ El bucket de avatares no está configurado. Contacta al administrador.', 'error');
            return;
        }
        
        // Subir archivo a Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, file);
        
        if (uploadError) throw uploadError;
        
        // Obtener URL pública
        const { data: urlData } = await supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);
        
        const avatarUrl = urlData.publicUrl;
        
        // Registrar en tabla fotos_perfil
        const { error: fotoError } = await supabase
            .from('fotos_perfil')
            .insert({
                usuario_id: session.user.id,
                url: avatarUrl,
                tipo: 'avatar',
                es_principal: true,
                created_at: new Date().toISOString()
            });
        
        if (fotoError) {
            console.warn('Error al registrar foto en fotos_perfil:', fotoError);
            // Continuar de todas formas
        }
        
        // Actualizar avatar_url en usuarios
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ avatar_url: avatarUrl })
            .eq('id', session.user.id);
        
        if (updateError) throw updateError;
        
        // Actualizar UI
        const avatarEl = document.getElementById('perfilAvatar');
        if (avatarEl) {
            avatarEl.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;"/>`;
        }
        
        showToast('✅ Foto de perfil actualizada', 'success');
        await cargarPerfil();
        
    } catch (error) {
        console.error('Error al subir foto:', error);
        showToast('❌ Error al subir foto: ' + error.message, 'error');
    }
}

// ===== ESTADO DEL USUARIO =====
async function cambiarEstado(activo) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Sesión requerida', 'error');
            return;
        }
        
        const { error } = await supabase
            .from('usuarios')
            .update({ 
                online: activo,
                ultima_conexion: activo ? new Date().toISOString() : null,
                offline_desde: activo ? null : new Date().toISOString()
            })
            .eq('id', session.user.id);
        
        if (error) throw error;
        
        const badge = document.getElementById('estadoBadge');
        const texto = document.getElementById('estadoTexto');
        
        if (badge) badge.textContent = activo ? '🟢' : '⭕';
        if (texto) {
            texto.textContent = activo ? 'Activo ahora' : 'Inactivo';
            texto.style.color = activo ? 'var(--success)' : 'var(--text-muted)';
        }
        
        showToast(activo ? '✅ Estado: Activo' : '⭕ Estado: Inactivo', 'success');
        
    } catch (error) {
        console.error('Error al cambiar estado:', error);
        showToast('❌ Error al actualizar estado', 'error');
    }
}

// ===== CONEXIÓN =====
async function cambiarConexion(tipo) {
    try {
        const session = await getSession();
        if (!session) return;
        
        const status = document.getElementById('conexionStatus');
        const tipoEl = document.getElementById('conexionTipo');
        const btnWifi = document.getElementById('btnWifi');
        const btnDatos = document.getElementById('btnDatos');
        
        // Persistir en la base de datos
        const { error } = await supabase
            .from('usuarios')
            .update({ conexion_tipo: tipo })
            .eq('id', session.user.id);
        
        if (error) throw error;
        
        if (tipo === 'wifi') {
            if (status) status.textContent = '🛜 WiFi';
            if (tipoEl) tipoEl.textContent = '🛜 WiFi';
            if (btnWifi) btnWifi.classList.add('active');
            if (btnDatos) btnDatos.classList.remove('active');
            showToast('🛜 Conectado a WiFi', 'success');
        } else if (tipo === 'datos') {
            if (status) status.textContent = '📶 Datos móviles';
            if (tipoEl) tipoEl.textContent = '📶 Datos móviles';
            if (btnDatos) btnDatos.classList.add('active');
            if (btnWifi) btnWifi.classList.remove('active');
            showToast('📶 Conectado a datos móviles', 'success');
        }
        
    } catch (error) {
        console.error('Error al cambiar conexión:', error);
        showToast('❌ Error al cambiar conexión', 'error');
    }
}

// ===== QR Y ESCANEO =====
function escanearQR() {
    const input = document.getElementById('qrInput');
    const status = document.getElementById('qrStatus');
    
    if (!input) return;
    
    const codigo = input.value.trim();
    if (!codigo) {
        if (status) status.textContent = '⚠️ Ingresa un código QR válido';
        showToast('⚠️ Ingresa un código QR', 'warning');
        return;
    }
    
    if (status) status.textContent = '⏳ Validando código...';
    procesarEscaneoQR(codigo);
    
    input.value = '';
}

function abrirCamaraQR() {
    const container = document.getElementById('qrReaderContainer');
    const video = document.getElementById('qrVideo');
    const canvas = document.getElementById('qrCanvas');
    const status = document.getElementById('qrCamaraStatus');
    
    if (!container || !video) {
        showToast('⚠️ Elementos de cámara no encontrados', 'error');
        return;
    }
    
    container.style.display = 'block';
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then((stream) => {
                video.srcObject = stream;
                video.setAttribute('playsinline', 'true');
                video.play();
                if (status) status.textContent = '📷 Cámara activa - Enfoca el QR';
                
                escanearContinuoQR(video, canvas);
            })
            .catch((err) => {
                console.error('Error al acceder a la cámara:', err);
                if (status) status.textContent = '❌ No se pudo acceder a la cámara';
                showToast('❌ Error al abrir la cámara', 'error');
            });
    } else {
        if (status) status.textContent = '❌ Cámara no soportada en este dispositivo';
        showToast('❌ Cámara no soportada', 'error');
    }
}

function escanearContinuoQR(video, canvas) {
    if (typeof jsQR === 'undefined') {
        console.warn('jsQR no cargado');
        return;
    }
    
    const context = canvas.getContext('2d');
    let escaneando = true;
    let ultimoEscaneo = 0;
    
    function scanFrame() {
        if (!escaneando) return;
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });
            
            if (code && code.data && (Date.now() - ultimoEscaneo > 2000)) {
                ultimoEscaneo = Date.now();
                const input = document.getElementById('qrInput');
                const status = document.getElementById('qrStatus');
                
                if (input) input.value = code.data;
                if (status) status.textContent = '✅ QR detectado: ' + code.data;
                
                escanearQR();
                escaneando = false;
                
                cerrarCamaraQR();
                showToast('✅ QR escaneado correctamente', 'success');
                return;
            }
        }
        
        requestAnimationFrame(scanFrame);
    }
    
    scanFrame();
}

function cerrarCamaraQR() {
    const container = document.getElementById('qrReaderContainer');
    const video = document.getElementById('qrVideo');
    
    if (video && video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    
    if (container) container.style.display = 'none';
    
    const status = document.getElementById('qrCamaraStatus');
    if (status) status.textContent = '📷 Cámara cerrada';
}

// ===== E.S.TOKS Y DOMOS =====
async function comprarDomo(cantidad) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para comprar Domos', 'error');
            return;
        }
        
        showToast('⏳ Procesando compra de Domo...', '', 4000);
        
        // Usar RPC comprar_domo si existe
        const { data, error } = await supabase.rpc('comprar_domo', {
            p_cantidad: cantidad || 1
        });
        
        if (error) throw error;
        
        showToast('✅ Domo registrado correctamente', 'success');
        await cargarPerfil();
        
    } catch (error) {
        console.error('Error al comprar Domo:', error);
        showToast('❌ Error al registrar Domo: ' + error.message, 'error');
    }
}

async function canjearNFT() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para canjear NFT', 'error');
            return;
        }
        
        showToast('⏳ Canjeando NFT...', '', 4000);
        
        // Usar RPC canjear_nft - NO recibe parámetros
        const { data, error } = await supabase.rpc('canjear_nft');
        
        if (error) throw error;
        
        if (data && data.nft_id) {
            showToast('🎉 ¡NFT canjeado exitosamente!', 'success');
            await cargarPerfil();
        } else {
            showToast('❌ No se pudo canjear el NFT', 'error');
        }
        
    } catch (error) {
        console.error('Error al canjear NFT:', error);
        showToast('❌ Error al canjear NFT: ' + error.message, 'error');
    }
}

// ===== CRIPTO PAGOS =====
function comprarConCripto() {
    const modal = document.getElementById('cryptoPaymentModal');
    if (!modal) {
        showToast('⚠️ Modal de pago no disponible', 'error');
        return;
    }
    
    // Obtener cantidad
    const qtyEl = document.getElementById('cryptoQuantity');
    const cantidad = qtyEl ? parseInt(qtyEl.textContent) || 1 : 1;
    
    // Mostrar modal con estado de carga
    const statusEl = document.getElementById('cryptoStatus');
    if (statusEl) {
        statusEl.textContent = '⏳ Cargando información de pago...';
    }
    
    // Obtener precio real del backend
    fetch('/api/pagos/precio', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) throw new Error('Error al obtener precio');
        return response.json();
    })
    .then(data => {
        if (data.success && data.precio) {
            const montoEl = document.getElementById('cryptoMonto');
            const monedaEl = document.getElementById('cryptoMoneda');
            const addressEl = document.getElementById('cryptoAddress');
            const qrEl = document.getElementById('cryptoQR');
            const statusEl = document.getElementById('cryptoStatus');
            
            if (montoEl) montoEl.textContent = (data.precio * cantidad).toFixed(2);
            if (monedaEl) monedaEl.textContent = data.moneda || 'USDT';
            if (addressEl) addressEl.textContent = data.direccion || 'No disponible';
            
            if (qrEl && data.direccion) {
                qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.direccion)}`;
            }
            
            if (statusEl) statusEl.textContent = '⏳ Esperando confirmación en la red...';
            modal.classList.add('active');
        } else {
            throw new Error(data.message || 'No se pudo obtener precio');
        }
    })
    .catch(error => {
        console.error('Error al obtener precio:', error);
        showToast('❌ Error al cargar información de pago', 'error');
        if (statusEl) statusEl.textContent = '❌ No se pudo cargar la información de pago';
    });
}

async function verificarPagoCrypto() {
    const statusEl = document.getElementById('cryptoStatus');
    if (!statusEl) return;
    
    try {
        statusEl.textContent = '🔍 Verificando depósito en la blockchain...';
        
        const session = await getSession();
        if (!session) {
            statusEl.textContent = '⚠️ Sesión expirada';
            return;
        }
        
        const response = await fetch('/api/pagos/verificar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                usuario_id: session.user.id
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || 'Error al verificar');
        
        if (data.success) {
            statusEl.textContent = '✅ Pago verificado correctamente';
            showToast('✅ Pago verificado. ¡Domo registrado!', 'success');
            setTimeout(() => {
                cerrarModal('cryptoPaymentModal');
                comprarDomo(1);
            }, 1500);
        } else {
            statusEl.textContent = `⏳ ${data.message || 'Pago no confirmado aún'}`;
            showToast('⏳ Pago pendiente de confirmación', 'warning');
        }
        
    } catch (error) {
        console.error('Error al verificar pago:', error);
        statusEl.textContent = '❌ Error al verificar pago: ' + error.message;
        showToast('❌ Error al verificar pago', 'error');
    }
}

function copiarDireccion() {
    const addressEl = document.getElementById('cryptoAddress');
    if (addressEl && addressEl.textContent && addressEl.textContent !== 'No disponible') {
        navigator.clipboard.writeText(addressEl.textContent).then(() => {
            showToast('📋 Dirección copiada al portapapeles', 'success');
        }).catch(() => {
            showToast('📋 Selecciona y copia la dirección manualmente', '');
        });
    } else {
        showToast('⚠️ No hay dirección disponible para copiar', 'warning');
    }
}

// ===== eSIM =====
async function comprarESIM(cantidad) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para adquirir eSIM', 'error');
            return;
        }
        
        showToast('⏳ Procesando adquisición de eSIM...', '', 4000);
        
        // Obtener planes disponibles
        const { data: planes, error: planesError } = await supabase
            .from('planes_esim')
            .select('*')
            .eq('activo', true)
            .order('precio', { ascending: true });
        
        if (planesError) throw planesError;
        
        if (!planes || planes.length === 0) {
            showToast('⚠️ No hay planes eSIM disponibles', 'error');
            return;
        }
        
        // Seleccionar primer plan disponible (o plan por defecto)
        const planId = planes[0].id;
        const idempotencyKey = `esim_${session.user.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        // Usar RPC crear_orden_esim
        const { data, error } = await supabase.rpc('crear_orden_esim', {
            p_plan_id: planId,
            p_idempotency_key: idempotencyKey
        });
        
        if (error) throw error;
        
        if (data && data.success) {
            showToast('✅ Orden eSIM creada correctamente', 'success');
            await cargarPerfil();
        } else if (data && data.idempotent) {
            showToast('⏳ Esta orden ya fue procesada', 'warning');
        } else {
            showToast('❌ Error al crear orden eSIM', 'error');
        }
        
    } catch (error) {
        console.error('Error al comprar eSIM:', error);
        showToast('❌ Error al adquirir eSIM: ' + error.message, 'error');
    }
}

async function generarQRESIM() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para obtener QR de eSIM', 'error');
            return;
        }
        
        showToast('⏳ Generando QR de eSIM...', '', 4000);
        
        // Obtener ordenes activas del usuario
        const { data: ordenes, error } = await supabase
            .from('ordenes_esim')
            .select('*')
            .eq('usuario_id', session.user.id)
            .eq('estado', 'activa')
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (error) throw error;
        
        if (!ordenes || ordenes.length === 0) {
            showToast('⚠️ No tienes ninguna eSIM activa', 'warning');
            return;
        }
        
        const orden = ordenes[0];
        
        // Si la orden tiene QR, mostrarlo
        if (orden.qr_code) {
            const qrWindow = window.open('', '_blank');
            if (qrWindow) {
                qrWindow.document.write(`
                    <html>
                        <head>
                            <title>QR eSIM - Sariel's</title>
                            <style>
                                body {
                                    display: flex;
                                    justify-content: center;
                                    align-items: center;
                                    height: 100vh;
                                    margin: 0;
                                    background: #0F2D1A;
                                    font-family: 'Inter', sans-serif;
                                }
                                .container {
                                    text-align: center;
                                    padding: 40px;
                                    background: rgba(15, 45, 26, 0.9);
                                    border-radius: 20px;
                                    border: 1px solid #D4AF37;
                                }
                                h2 {
                                    color: #D4AF37;
                                    font-family: 'Orbitron', monospace;
                                    margin-bottom: 20px;
                                }
                                img {
                                    max-width: 300px;
                                    border: 2px solid #D4AF37;
                                    border-radius: 12px;
                                    background: white;
                                    padding: 10px;
                                }
                                .info {
                                    color: #c0d8e8;
                                    margin-top: 15px;
                                    font-size: 0.8rem;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h2>📱 eSIM - Sariel's</h2>
                                <img src="${orden.qr_code}" alt="QR eSIM"/>
                                <div class="info">ICCID: ${orden.iccid || '---'}</div>
                            </div>
                        </body>
                    </html>
                `);
            }
            showToast('✅ QR de eSIM generado', 'success');
        } else {
            showToast('⚠️ Esta eSIM no tiene QR disponible', 'warning');
        }
        
    } catch (error) {
        console.error('Error al generar QR eSIM:', error);
        showToast('❌ Error al generar QR de eSIM', 'error');
    }
}

async function sincronizarESIM() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para sincronizar eSIM', 'error');
            return;
        }
        
        showToast('⏳ Sincronizando eSIM...', '', 4000);
        
        // Sincronizar desde Telnyx (si existe endpoint)
        const response = await fetch('/api/esim/sincronizar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                usuario_id: session.user.id
            })
        });
        
        if (!response.ok) {
            // Si no existe endpoint, usar datos locales
            console.warn('Endpoint /api/esim/sincronizar no disponible, usando datos locales');
            await cargarPerfil();
            showToast('✅ eSIM sincronizada (datos locales)', 'success');
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ eSIM sincronizada correctamente', 'success');
            await cargarPerfil();
        } else {
            showToast('❌ Error al sincronizar eSIM: ' + data.message, 'error');
        }
        
    } catch (error) {
        console.error('Error al sincronizar eSIM:', error);
        // Fallback: recargar perfil
        await cargarPerfil();
        showToast('✅ eSIM sincronizada (datos locales)', 'success');
    }
}

async function activarESIM() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para activar eSIM', 'error');
            return;
        }
        
        showToast('⏳ Activando eSIM...', '', 4000);
        
        const { error } = await supabase
            .from('usuarios')
            .update({ esim_status: 'activa' })
            .eq('id', session.user.id);
        
        if (error) throw error;
        
        showToast('✅ eSIM activada correctamente', 'success');
        await cargarPerfil();
        
    } catch (error) {
        console.error('Error al activar eSIM:', error);
        showToast('❌ Error al activar eSIM', 'error');
    }
}

async function desactivarESIM() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para desactivar eSIM', 'error');
            return;
        }
        
        showToast('⏳ Desactivando eSIM...', '', 4000);
        
        const { error } = await supabase
            .from('usuarios')
            .update({ esim_status: 'inactiva' })
            .eq('id', session.user.id);
        
        if (error) throw error;
        
        showToast('✅ eSIM desactivada correctamente', 'success');
        await cargarPerfil();
        
    } catch (error) {
        console.error('Error al desactivar eSIM:', error);
        showToast('❌ Error al desactivar eSIM', 'error');
    }
}

// ===== SESIÓN =====
async function cerrarSesion() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        showToast('👋 Sesión cerrada correctamente', 'success');
        
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 1000);
        
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        showToast('❌ Error al cerrar sesión: ' + error.message, 'error');
    }
}

// ===== MODAL NFT =====
function abrirModalNft(nftId) {
    const modal = document.getElementById('nftModal');
    if (!modal) {
        showToast('⚠️ Modal de NFT no disponible', 'error');
        return;
    }
    
    // Cargar datos del NFT desde Supabase
    supabase
        .from('nfts_usuario')
        .select('*')
        .eq('id', nftId)
        .single()
        .then(({ data, error }) => {
            if (error) throw error;
            
            const title = document.getElementById('nftModalTitle');
            const image = document.getElementById('nftModalImage');
            const description = document.getElementById('nftModalDescription');
            const domo = document.getElementById('nftModalDomo');
            const fecha = document.getElementById('nftModalFecha');
            
            if (title) title.textContent = data.nombre || 'NFT Conmemorativo';
            if (image) image.src = data.imagen_url || '/placeholder-nft.png';
            if (description) {
                description.textContent = `NFT conmemorativo de Sariel's Ecosystem - ${data.codigo_nft || 'Código: N/A'}`;
            }
            if (domo) domo.textContent = data.qr_domo_origen || '---';
            if (fecha) {
                fecha.textContent = data.fecha_canje ? 
                    new Date(data.fecha_canje).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }) : '---';
            }
            
            modal.classList.add('active');
        })
        .catch(error => {
            console.error('Error al cargar NFT:', error);
            showToast('❌ Error al cargar detalles del NFT', 'error');
        });
}

// ================================================================
// INICIALIZACIÓN
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    cargarPerfil();
    
    // Botones de cantidad para cripto
    const decreaseBtn = document.getElementById('cryptoDecreaseQty');
    const increaseBtn = document.getElementById('cryptoIncreaseQty');
    const qtyDisplay = document.getElementById('cryptoQuantity');
    
    if (decreaseBtn && qtyDisplay) {
        decreaseBtn.addEventListener('click', () => {
            let val = parseInt(qtyDisplay.textContent) || 1;
            if (val > 1) {
                qtyDisplay.textContent = val - 1;
            }
        });
    }
    
    if (increaseBtn && qtyDisplay) {
        increaseBtn.addEventListener('click', () => {
            let val = parseInt(qtyDisplay.textContent) || 1;
            qtyDisplay.textContent = val + 1;
        });
    }
});