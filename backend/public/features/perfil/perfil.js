/* ================================================================
   PERFIL.JS - SARIEL'S ECOSYSTEM
   VERSIÓN COMPLETA CON INTEGRACIÓN eSIM + PLACEHOLDERS
   ================================================================ */

// ================================================================
// CONFIGURACIÓN SUPABASE - SINGLETON GLOBAL
// ================================================================
const supabaseClient = window.supabaseClient;

// Verificar que el singleton existe
if (!supabaseClient) {
    console.error('❌ Supabase Client no inicializado. Cargando app.js primero.');
    window.location.reload();
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
// CONSTANTES
// ================================================================
const CACHE_DURATION = 30000;
const MAX_INACTIVIDAD = 300000;
const POSTS_PER_PAGE = 10;

// ================================================================
// ESTADO GLOBAL
// ================================================================
let perfilCache = null;
let ultimaActualizacion = 0;
let tiempoInactividad = 0;
let canalAmigos = null;
let qrScannerInterval = null;
let scannerActive = false;
let qrHistorial = [];
let qrScanningLock = false;
let streamInterval = null;
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

// ================================================================
// NOTA: showToast(), getSession(), escapeHTML(), formatearTexto() 
// ESTÁN EN app.js - NO DUPLICAR
// ================================================================

// ================================================================
// NAVEGACIÓN Y SESIÓN - Usa window.getSession
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

// ================================================================
// CARGA DE PERFIL - CON CACHÉ Y CONTROL DE ERRORES
// ================================================================
async function cargarPerfil(forzarActualizacion = false) {
    try {
        const session = await window.getSession();
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
        window.showToast('❌ Error al cargar perfil', 'error');
    }
}

// ================================================================
// ESTADO ACTIVO/INACTIVO - CON CONTROL DE RACE CONDITIONS
// ================================================================
let estadoEnLineaLock = false;

async function actualizarEstadoEnLinea(online) {
    if (estadoEnLineaLock) return;
    estadoEnLineaLock = true;
    
    try {
        const session = await window.getSession();
        if (!session) {
            estadoEnLineaLock = false;
            return;
        }

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
        estadoEnLineaLock = false;
        return true;
    } catch (error) {
        console.error('Error actualizando estado en línea:', error);
        estadoEnLineaLock = false;
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

// ================================================================
// DETECTOR DE INACTIVIDAD - CON REGISTER INTERVAL
// ================================================================
let detectorInactividadInterval = null;

function iniciarDetectorInactividad() {
    if (detectorInactividadInterval) {
        clearInterval(detectorInactividadInterval);
        detectorInactividadInterval = null;
    }

    const resetInactividad = () => {
        tiempoInactividad = 0;
        if (perfilCache && !perfilCache.online) {
            actualizarEstadoEnLinea(true);
        }
    };

    const eventos = ['mousemove', 'mousedown', 'click', 'scroll', 'keydown', 'touchstart', 'touchmove'];
    eventos.forEach(evento => {
        document.removeEventListener(evento, resetInactividad);
        document.addEventListener(evento, resetInactividad);
    });

    detectorInactividadInterval = setInterval(async () => {
        tiempoInactividad += 30000;
        
        if (tiempoInactividad >= MAX_INACTIVIDAD && perfilCache && perfilCache.online) {
            await actualizarEstadoEnLinea(false);
            window.showToast('⭕ Marcado como inactivo por inactividad', 'warning');
        }
    }, 30000);
    
    window.registerInterval(detectorInactividadInterval, 'detector_inactividad');
}

// ================================================================
// FUNCIÓN cambiarEstado() - EXPUESTA GLOBALMENTE
// ================================================================
async function cambiarEstado(online) {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        await actualizarEstadoEnLinea(online);
        
        if (online) {
            window.showToast('🟢 Te has marcado como activo', 'success');
        } else {
            window.showToast('⭕ Te has marcado como inactivo', 'warning');
        }
        
        await notificarCambioEstado(online);
        
    } catch (error) {
        console.error('Error cambiando estado:', error);
        window.showToast('❌ Error al cambiar estado', 'error');
    }
}

// ================================================================
// FUNCIÓN editarPerfil() - EXPUESTA GLOBALMENTE
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

// ================================================================
// FUNCIÓN subirVideo() - CON VALIDACIÓN Y CONTROL DE ERRORES
// ================================================================
async function subirVideo(event) {
    try {
        const file = event?.target?.files?.[0];
        if (!file) {
            window.showToast('⚠️ No se seleccionó ningún archivo', 'warning');
            return null;
        }

        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para subir videos', 'error');
            return null;
        }

        if (!file.type.startsWith('video/')) {
            window.showToast('❌ Formato no válido. Solo se permiten videos.', 'error');
            return null;
        }

        if (file.size > 50 * 1024 * 1024) {
            window.showToast('❌ El video excede 50MB', 'error');
            return null;
        }

        window.showToast('⏳ Subiendo video... 0%', '', 10000);
        
        const fileExt = file.name.split('.').pop();
        const filePath = `${session.user.id}/video_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabaseClient.storage
            .from('posts')
            .upload(filePath, file, {
                onProgress: (progress) => {
                    const percent = Math.round((progress.loaded / progress.total) * 100);
                    window.showToast(`⏳ Subiendo video... ${percent}%`, '', 10000);
                }
            });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabaseClient.storage
            .from('posts')
            .getPublicUrl(filePath);

        window.showToast('✅ Video subido con éxito', 'success');
        return urlData.publicUrl;
        
    } catch (error) {
        console.error('Error al subir video:', error);
        window.showToast('❌ Error al subir el video: ' + error.message, 'error');
        return null;
    }
}

// ================================================================
// FUNCIÓN guardarPerfil() - CON VALIDACIÓN ROBUSTA
// ================================================================
async function guardarPerfil() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para guardar', 'error');
            return;
        }

        const nombre = document.getElementById('editNombre')?.value?.trim() || 'Explorador';
        const handle = document.getElementById('editHandle')?.value?.trim().replace('@', '') || 'explorador';
        const bio = document.getElementById('editBio')?.value?.trim() || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad';

        if (!/^[a-zA-Z0-9_]+$/.test(handle)) {
            window.showToast('❌ El handle solo puede contener letras, números y _', 'error');
            return;
        }

        if (handle.length < 3 || handle.length > 30) {
            window.showToast('❌ El handle debe tener entre 3 y 30 caracteres', 'error');
            return;
        }

        const perfil = {
            nombre: nombre,
            handle: handle,
            bio: bio
        };

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

        window.showToast('✅ Perfil guardado correctamente', 'success');
        await cargarPerfil(true);
        
    } catch (error) {
        console.error('Error guardando perfil:', error);
        window.showToast('❌ Error al guardar: ' + (error.message || 'Error interno del servidor'), 'error');
    }
}

// ================================================================
// FUNCIÓN compartirPerfil()
// ================================================================
function compartirPerfil() {
    const nombre = document.getElementById('perfilNombre')?.textContent.split(' ')[0] || 'Explorador';
    const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
    const url = `${window.location.origin}/perfil/${handle}`;
    const texto = `◈ Perfil de ${nombre} en Sariel's\n◈ ${url}\n\n#Sariels #WEB3 #NFT #Comunidad`;

    if (navigator.share) {
        navigator.share({ title: `Perfil de ${nombre} en Sariel's`, text: texto, url: url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto).then(() => {
            window.showToast('◈ Copiado al portapapeles', 'success');
        }).catch(() => {
            prompt('Copia este enlace:', url);
        });
    }
}

// ================================================================
// FUNCIÓN irAMuro()
// ================================================================
function irAMuro() {
    window.location.href = '/features/muro/muro.html';
}

// ================================================================
// FUNCIÓN abrirSelectorArchivo()
// ================================================================
function abrirSelectorArchivo() {
    const input = document.getElementById('fileInput');
    if (input) input.click();
}

// ================================================================
// FUNCIÓN subirFoto() - CON VALIDACIÓN Y FALLBACK
// ================================================================
async function subirFoto(event) {
    try {
        const file = event?.target?.files?.[0];
        if (!file) {
            window.showToast('⚠️ No se seleccionó ningún archivo', 'warning');
            return;
        }

        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para subir foto', 'error');
            return;
        }

        if (!file.type.startsWith('image/')) {
            window.showToast('❌ Solo se permiten imágenes', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            window.showToast('❌ La imagen no puede superar los 5MB', 'error');
            return;
        }

        const fileExt = file.name.split('.').pop().toLowerCase();
        const filePath = `${session.user.id}/avatar.${fileExt}`;

        window.showToast('⏳ Subiendo foto...', '', 5000);

        const { error: uploadError } = await supabaseClient.storage
            .from('sariels-avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            if (uploadError.message.includes('bucket')) {
                const { error: uploadError2 } = await supabaseClient.storage
                    .from('avatars')
                    .upload(filePath, file, { upsert: true });
                    
                if (uploadError2) throw uploadError2;
                
                const { data: urlData2 } = supabaseClient.storage
                    .from('avatars')
                    .getPublicUrl(filePath);
                    
                const publicUrl = urlData2.publicUrl;
                
                const { error: updateError2 } = await supabaseClient
                    .from('usuarios')
                    .update({ avatar_url: publicUrl })
                    .eq('id', session.user.id);
                    
                if (updateError2) throw updateError2;
                
                window.showToast('✅ Foto actualizada correctamente', 'success');
                event.target.value = '';
                await cargarPerfil(true);
                return;
            }
            throw uploadError;
        }

        const { data: urlData } = supabaseClient.storage
            .from('sariels-avatars')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        const { error: updateError } = await supabaseClient
            .from('usuarios')
            .update({ avatar_url: publicUrl })
            .eq('id', session.user.id);

        if (updateError) throw updateError;

        window.showToast('✅ Foto actualizada correctamente', 'success');
        event.target.value = '';
        await cargarPerfil(true);
        
    } catch (error) {
        console.error('Error al subir foto:', error);
        window.showToast('❌ Error al subir foto: ' + (error.message || 'Error interno del servidor'), 'error');
    }
}

// ================================================================
// FUNCIÓN generarQRPerfil()
// ================================================================
async function generarQRPerfil() {
    try {
        const session = await window.getSession();
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
                <p style="color: var(--text-muted); margin-top: 15px; font-size: 12px;">${window.escapeHTML(url)}</p>
                <button onclick="this.parentElement.parentElement.remove()"
                        style="margin-top: 20px; background: var(--gold); border: none; color: #fff; padding: 10px 30px; border-radius: 10px; cursor: pointer;">
                    Cerrar
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Error generando QR:', error);
        window.showToast('❌ Error al generar QR', 'error');
    }
}

// ================================================================
// ACTUALIZAR UI PRINCIPAL - CON SANITIZACIÓN DE SALIDA
// ================================================================
function actualizarUI(data) {
    try {
        const nombreEl = document.getElementById('perfilNombre');
        const handleEl = document.getElementById('perfilHandle');
        const bioEl = document.getElementById('perfilBio');
        const avatarEl = document.getElementById('perfilAvatar');
        const walletDisplay = document.getElementById('walletDisplay');

        if (nombreEl) {
            const nombre = window.escapeHTML(data.nombre || 'Explorador');
            const verificado = data.verificado ? '<span class="verified">✦ VERIFICADO</span>' : '';
            nombreEl.innerHTML = `${nombre} ${verificado}`;
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
        
    } catch (error) {
        console.error('Error en actualizarUI:', error);
    }
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
// AMIGOS EN TIEMPO REAL - CON REGISTER CHANNEL
// ================================================================
function iniciarEscuchaAmigos() {
    if (canalAmigos) {
        try {
            supabaseClient.removeChannel(canalAmigos);
        } catch (e) {
            console.warn('Error removiendo canal amigos:', e);
        }
        canalAmigos = null;
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

    window.registerSupabaseChannel(canalAmigos, 'amigos_online');
    return canalAmigos;
}

async function cargarAmigosEnLinea() {
    try {
        const session = await window.getSession();
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
        const nombreSanitizado = window.escapeHTML(amigo.nombre || amigo.handle || 'Usuario');
        const handleSanitizado = window.escapeHTML(amigo.handle || 'usuario');
        const avatarHtml = amigo.avatar_url ? `<img src="${amigo.avatar_url}">` : '◈';
        
        return `
            <div class="amigo-item ${estaEnLinea ? 'online' : ''}" onclick="window.location.href='/perfil/${handleSanitizado}'">
                <div class="avatar-mini">
                    ${avatarHtml}
                </div>
                <div class="info">
                    <div class="nombre" style="color:${estaEnLinea ? 'var(--text-primary)' : 'var(--text-muted)'}">
                        ${nombreSanitizado}
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
// SISTEMA DE AMISTADES - CON PREVENCIÓN DE RACE CONDITIONS
// ================================================================
let notificandoCambioEstado = false;

async function notificarCambioEstado(online) {
    if (notificandoCambioEstado) return;
    notificandoCambioEstado = true;
    
    try {
        const session = await window.getSession();
        if (!session) {
            notificandoCambioEstado = false;
            return;
        }

        const { data: contactos, error } = await supabaseClient
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id)
            .eq('estado', 'activo');

        if (error || !contactos) {
            notificandoCambioEstado = false;
            return;
        }

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
        notificandoCambioEstado = false;
    } catch (error) {
        console.error('Error notificando cambio de estado:', error);
        notificandoCambioEstado = false;
    }
}

async function obtenerSolicitudesPendientes() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para ver solicitudes', 'error');
            return [];
        }

        const { data, error } = await supabaseClient.rpc('obtener_solicitudes_pendientes');

        if (error) throw error;

        return data || [];

    } catch (error) {
        console.error('Error obteniendo solicitudes pendientes:', error);
        window.showToast('❌ Error al cargar solicitudes: ' + error.message, 'error');
        return [];
    }
}

let aceptandoSolicitud = false;

async function aceptarSolicitudAmistad(solicitanteId) {
    if (aceptandoSolicitud) {
        window.showToast('⏳ Procesando solicitud...', 'warning');
        return false;
    }
    
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para aceptar solicitudes', 'error');
            return false;
        }

        if (!solicitanteId) {
            window.showToast('⚠️ ID de solicitante inválido', 'error');
            return false;
        }

        aceptandoSolicitud = true;
        window.showToast('⏳ Aceptando solicitud...', '', 3000);

        const { data, error } = await supabaseClient.rpc('aceptar_solicitud_amistad', {
            p_solicitante_id: solicitanteId
        });

        if (error) throw error;

        window.showToast('✅ Solicitud aceptada. ¡Ahora son amigos!', 'success', 4000);
        
        await cargarSolicitudesPendientes();
        await cargarAmigosEnLinea();
        await cargarPerfil(true);
        
        aceptandoSolicitud = false;
        return true;

    } catch (error) {
        console.error('Error aceptando solicitud:', error);
        window.showToast('❌ Error al aceptar solicitud: ' + error.message, 'error');
        aceptandoSolicitud = false;
        return false;
    }
}

let rechazandoSolicitud = false;

async function rechazarSolicitudAmistad(solicitanteId) {
    if (rechazandoSolicitud) {
        window.showToast('⏳ Procesando solicitud...', 'warning');
        return false;
    }
    
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para rechazar solicitudes', 'error');
            return false;
        }

        if (!solicitanteId) {
            window.showToast('⚠️ ID de solicitante inválido', 'error');
            return false;
        }

        if (!confirm('¿Seguro que quieres rechazar esta solicitud de amistad?')) {
            return false;
        }

        rechazandoSolicitud = true;
        window.showToast('⏳ Rechazando solicitud...', '', 3000);

        const { data, error } = await supabaseClient.rpc('rechazar_solicitud_amistad', {
            p_solicitante_id: solicitanteId
        });

        if (error) throw error;

        window.showToast('❌ Solicitud rechazada', 'warning', 3000);
        
        await cargarSolicitudesPendientes();
        
        rechazandoSolicitud = false;
        return true;

    } catch (error) {
        console.error('Error rechazando solicitud:', error);
        window.showToast('❌ Error al rechazar solicitud: ' + error.message, 'error');
        rechazandoSolicitud = false;
        return false;
    }
}

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

    return solicitudes.map(solicitud => {
        const nombreSanitizado = window.escapeHTML(solicitud.nombre || solicitud.handle || 'Usuario');
        const handleSanitizado = window.escapeHTML(solicitud.handle || 'usuario');
        const avatarHtml = solicitud.avatar_url ? `<img src="${solicitud.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : '◈';
        
        return `
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
                        ${avatarHtml}
                    </div>
                    <div>
                        <div style="font-weight:600; font-size:0.8rem; color:var(--text-primary);">
                            ${nombreSanitizado}
                        </div>
                        <div style="font-size:0.6rem; color:var(--text-muted);">
                            @${handleSanitizado} · ${haceTiempo(solicitud.fecha_solicitud)}
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
        `;
    }).join('');
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
// GESTIÓN DE CONEXIÓN - OPTIMIZADA
// ================================================================
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
            window.showToast('❌ Tipo de conexión no válido', 'error');
            return;
        }

        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para cambiar conexión', 'error');
            return;
        }

        if (tipo === 'datos') {
            const perfil = await getPerfilActual();
            if (!perfil || !perfil.esim_iccid) {
                window.showToast('⚠️ No tienes una eSIM activa. Compra una primero.', 'warning');
                return;
            }
            if (perfil.esim_status !== 'enabled') {
                window.showToast('⚠️ Tu eSIM no está activa. Actívala primero.', 'warning');
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
            window.showToast('🛜 Cambiado a WiFi', 'success');
        } else {
            window.showToast('📶 Cambiado a Datos Móviles', 'success');
        }
        
        await cargarPerfil(true);
        
        if (tipo === 'datos') {
            await cargarDatosESIM(perfilCache?.esim_iccid);
        }
        
    } catch (error) {
        console.error('Error cambiando conexión:', error);
        window.showToast('❌ Error al cambiar conexión: ' + error.message, 'error');
    }
}

function getPerfilActual() {
    return perfilCache;
}

// ================================================================
// GUARDAR ESTADO CONEXIÓN
// ================================================================
async function guardarEstadoConexion(estado) {
    try {
        const session = await window.getSession();
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
        window.showToast('🛜 Conexión restablecida', 'success');
    });

    window.addEventListener('offline', () => {
        estadoConexion.activa = false;
        actualizarUIConexion(estadoConexion);
        guardarEstadoConexion(estadoConexion);
        window.showToast('⛔ Sin conexión', 'error');
    });

    if (navigator.connection) {
        navigator.connection.addEventListener('change', async () => {
            await cargarEstadoConexion();
        });
    }
}

// ================================================================
// ================================================================
// 🚀 eSIM - TELNYX INTEGRATION (FRONTEND + BACKEND)
// ================================================================
// ================================================================

// ================================================================
// PLANES DISPONIBLES
// ================================================================
const PLANES_ESIM = [
    { id: 'basic', nombre: 'Básico', gb: 1, precio: 9.99, moneda: 'USD', duracion: '7 días' },
    { id: 'standard', nombre: 'Estándar', gb: 3, precio: 19.99, moneda: 'USD', duracion: '15 días' },
    { id: 'premium', nombre: 'Premium', gb: 10, precio: 49.99, moneda: 'USD', duracion: '30 días' },
    { id: 'unlimited', nombre: 'Ilimitado', gb: 999, precio: 99.99, moneda: 'USD', duracion: '30 días' }
];

// ================================================================
// ACTUALIZAR UI eSIM
// ================================================================
function actualizarUIESIM(data) {
    try {
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
    } catch (error) {
        console.error('Error en actualizarUIESIM:', error);
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

// ================================================================
// 📊 OBTENER DATOS eSIM DESDE TELNYX (via backend)
// ================================================================
async function cargarDatosESIM(iccid) {
    if (!iccid) {
        console.warn('⚠️ No hay ICCID para cargar datos eSIM');
        mostrarSinESIM();
        return null;
    }

    try {
        const session = await window.getSession();
        if (!session) {
            console.warn('⚠️ No hay sesión para cargar datos eSIM');
            return null;
        }

        window.showToast('⏳ Actualizando datos de eSIM...', '', 3000);

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
            window.showToast('⚠️ No se pudo actualizar la información de la eSIM. Mostrando último estado conocido.', 'warning', 5000);
        }

        return data;

    } catch (error) {
        console.error('Error cargando datos eSIM:', error);
        window.showToast('❌ Error al cargar datos de eSIM: ' + error.message, 'error');
        await cargarDatosESIMLocal(iccid);
        return null;
    }
}

async function cargarDatosESIMLocal(iccid) {
    try {
        const session = await window.getSession();
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
            window.showToast('ℹ️ Mostrando datos guardados localmente', 'warning', 3000);
        }
    } catch (error) {
        console.error('Error cargando datos locales:', error);
        mostrarSinESIM();
    }
}

// ================================================================
// 🔄 SINCRONIZAR eSIM CON TELNYX
// ================================================================
async function sincronizarESIM() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para sincronizar', 'error');
            return;
        }

        if (!perfilCache || !perfilCache.esim_iccid) {
            window.showToast('⚠️ No tienes una eSIM activa asignada', 'warning');
            return;
        }

        window.showToast('⏳ Sincronizando con Telnyx...', '', 5000);

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

        window.showToast('✅ Datos sincronizados correctamente', 'success');
        await cargarPerfil(true);

    } catch (error) {
        console.error('Error sincronizando eSIM:', error);
        window.showToast('❌ Error al sincronizar: ' + error.message, 'error');
    }
}

// ================================================================
// 🛒 COMPRAR eSIM - TELNYX
// ================================================================
async function comprarESIM() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para comprar eSIM', 'error');
            return;
        }

        // Mostrar modal de selección de plan
        const modal = document.createElement('div');
        modal.id = 'modalComprarESIM';
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
            <div style="background: var(--bg-card); border-radius: 20px; padding: 30px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
                <h3 style="color: var(--gold); margin-bottom: 20px;">📱 Comprar eSIM</h3>
                <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 20px;">
                    Selecciona un plan de datos para tu eSIM. La activación es instantánea.
                </p>
                <div id="planesESIM">
                    ${PLANES_ESIM.map(plan => `
                        <div style="
                            padding: 15px;
                            margin-bottom: 10px;
                            background: rgba(212,175,55,0.05);
                            border-radius: 12px;
                            border: 1px solid rgba(212,175,55,0.1);
                            cursor: pointer;
                            transition: all 0.2s ease;
                        " onclick="seleccionarPlanESIM('${plan.id}')" 
                           onmouseover="this.style.borderColor='var(--gold)'" 
                           onmouseout="this.style.borderColor='rgba(212,175,55,0.1)'">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: 600; color: var(--text-primary);">${plan.nombre}</div>
                                    <div style="font-size: 0.7rem; color: var(--text-muted);">
                                        ${plan.gb} GB · ${plan.duracion}
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="color: var(--gold); font-weight: 600;">$${plan.precio} ${plan.moneda}</div>
                                    <button style="
                                        background: linear-gradient(135deg, var(--gold), var(--gold-dark));
                                        border: none;
                                        color: var(--space);
                                        padding: 4px 12px;
                                        border-radius: 8px;
                                        font-size: 0.6rem;
                                        font-weight: 600;
                                        cursor: pointer;
                                        margin-top: 4px;
                                    " onclick="event.stopPropagation();seleccionarPlanESIM('${plan.id}')">
                                        Seleccionar
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button onclick="cerrarModalESIM()" style="
                    margin-top: 20px;
                    background: transparent;
                    border: 1px solid var(--text-muted);
                    color: var(--text-muted);
                    padding: 10px 30px;
                    border-radius: 10px;
                    cursor: pointer;
                    width: 100%;
                ">
                    Cancelar
                </button>
            </div>
        `;
        document.body.appendChild(modal);

    } catch (error) {
        console.error('Error abriendo modal eSIM:', error);
        window.showToast('❌ Error: ' + error.message, 'error');
    }
}

// ================================================================
// 📋 SELECCIONAR PLAN eSIM
// ================================================================
async function seleccionarPlanESIM(planId) {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para comprar', 'error');
            return;
        }

        const plan = PLANES_ESIM.find(p => p.id === planId);
        if (!plan) {
            window.showToast('❌ Plan no válido', 'error');
            return;
        }

        // Confirmar compra
        if (!confirm(`¿Comprar plan ${plan.nombre} (${plan.gb} GB) por $${plan.precio} ${plan.moneda}?`)) {
            return;
        }

        window.showToast('⏳ Procesando compra de eSIM...', '', 5000);

        const response = await fetch(`${API_ENDPOINTS.esim}/comprar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                plan_id: plan.id,
                cantidad_gb: plan.gb,
                precio: plan.precio
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al comprar eSIM');
        }

        window.showToast('✅ eSIM comprada exitosamente. Revisa tu correo para activar.', 'success', 6000);
        
        cerrarModalESIM();
        await cargarPerfil(true);

        // Mostrar QR de activación si existe
        if (result.data && result.data.qr_code) {
            mostrarQRESIM(result.data.qr_code);
        }

    } catch (error) {
        console.error('Error comprando eSIM:', error);
        window.showToast('❌ Error al comprar eSIM: ' + error.message, 'error');
    }
}

// ================================================================
// 📱 MOSTRAR QR DE ACTIVACIÓN eSIM
// ================================================================
function mostrarQRESIM(qrData) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8);
        backdrop-filter: blur(10px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease-out;
    `;
    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: 20px; padding: 30px; max-width: 400px; width: 90%; text-align: center;">
            <h3 style="color: var(--gold); margin-bottom: 15px;">📱 Activa tu eSIM</h3>
            <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 20px;">
                Escanea este QR con la cámara de tu dispositivo para activar la eSIM.
            </p>
            <div style="background: white; padding: 20px; border-radius: 12px; display: inline-block;">
                <img src="${qrData}" alt="eSIM QR" style="max-width: 200px; border-radius: 8px;">
            </div>
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
                <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
                    background: linear-gradient(135deg, var(--gold), var(--gold-dark));
                    border: none;
                    color: var(--space);
                    padding: 10px 30px;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                ">
                    ✅ Entendido
                </button>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
                    background: transparent;
                    border: 1px solid var(--text-muted);
                    color: var(--text-muted);
                    padding: 10px 30px;
                    border-radius: 10px;
                    cursor: pointer;
                ">
                    Cerrar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// ================================================================
// 🚫 CERRAR MODAL eSIM
// ================================================================
function cerrarModalESIM() {
    const modal = document.getElementById('modalComprarESIM');
    if (modal) modal.remove();
}

// ================================================================
// 🔄 ACTIVAR eSIM (via backend)
// ================================================================
async function activarESIM() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para activar eSIM', 'error');
            return;
        }

        if (!perfilCache || !perfilCache.esim_iccid) {
            window.showToast('⚠️ No tienes una eSIM asignada', 'warning');
            return;
        }

        window.showToast('⏳ Activando eSIM...', '', 5000);

        const response = await fetch(`${API_ENDPOINTS.esim}/activar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                iccid: perfilCache.esim_iccid
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al activar eSIM');
        }

        window.showToast('✅ eSIM activada correctamente', 'success');
        await cargarPerfil(true);

    } catch (error) {
        console.error('Error activando eSIM:', error);
        window.showToast('❌ Error al activar eSIM: ' + error.message, 'error');
    }
}

// ================================================================
// 🚫 DESACTIVAR eSIM (via backend)
// ================================================================
async function desactivarESIM() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para desactivar eSIM', 'error');
            return;
        }

        if (!perfilCache || !perfilCache.esim_iccid) {
            window.showToast('⚠️ No tienes una eSIM activa', 'warning');
            return;
        }

        if (!confirm('¿Desactivar tu eSIM? Perderás conectividad de datos.')) {
            return;
        }

        window.showToast('⏳ Desactivando eSIM...', '', 5000);

        const response = await fetch(`${API_ENDPOINTS.esim}/desactivar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                iccid: perfilCache.esim_iccid
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al desactivar eSIM');
        }

        window.showToast('🔌 eSIM desactivada', 'warning');
        await cargarPerfil(true);

    } catch (error) {
        console.error('Error desactivando eSIM:', error);
        window.showToast('❌ Error al desactivar eSIM: ' + error.message, 'error');
    }
}

// ================================================================
// 📊 OBTENER ESTADO eSIM (via backend)
// ================================================================
async function obtenerEstadoESIM() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para ver estado', 'error');
            return;
        }

        if (!perfilCache || !perfilCache.esim_iccid) {
            window.showToast('⚠️ No tienes una eSIM asignada', 'warning');
            return;
        }

        const response = await fetch(`${API_ENDPOINTS.esim}/estado`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al obtener estado');
        }

        window.showToast(`📊 eSIM: ${result.data.status} · ${result.data.data_used_gb} GB usado`, 'success', 5000);

        return result.data;

    } catch (error) {
        console.error('Error obteniendo estado eSIM:', error);
        window.showToast('❌ Error al obtener estado: ' + error.message, 'error');
        return null;
    }
}

// ================================================================
// 📋 OBTENER PLANES eSIM (via backend)
// ================================================================
async function obtenerPlanesESIM() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para ver planes', 'error');
            return;
        }

        const response = await fetch(`${API_ENDPOINTS.esim}/planes`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al obtener planes');
        }

        // Mostrar planes en un modal
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
            <div style="background: var(--bg-card); border-radius: 20px; padding: 30px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
                <h3 style="color: var(--gold); margin-bottom: 20px;">📋 Planes eSIM</h3>
                ${result.data.map(plan => `
                    <div style="
                        padding: 12px 15px;
                        margin-bottom: 8px;
                        background: rgba(212,175,55,0.05);
                        border-radius: 10px;
                        border: 1px solid rgba(212,175,55,0.1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <div>
                            <div style="font-weight: 600;">${plan.nombre}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted);">
                                ${plan.gb} GB · ${plan.duracion}
                            </div>
                        </div>
                        <div style="color: var(--gold); font-weight: 600;">
                            $${plan.precio} ${plan.moneda}
                        </div>
                    </div>
                `).join('')}
                <button onclick="this.parentElement.parentElement.remove()" style="
                    margin-top: 20px;
                    background: linear-gradient(135deg, var(--gold), var(--gold-dark));
                    border: none;
                    color: var(--space);
                    padding: 10px 30px;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    width: 100%;
                ">
                    Cerrar
                </button>
            </div>
        `;
        document.body.appendChild(modal);

        return result.data;

    } catch (error) {
        console.error('Error obteniendo planes eSIM:', error);
        window.showToast('❌ Error al obtener planes: ' + error.message, 'error');
        return null;
    }
}

// ================================================================
// 📱 GENERAR QR eSIM
// ================================================================
async function generarQRESIM(iccid) {
    try {
        const iccidParam = iccid || perfilCache?.esim_iccid;
        
        if (!iccidParam) {
            window.showToast('⚠️ No tienes una eSIM activa para generar QR', 'warning');
            return;
        }
        
        const response = await fetch(`${API_ENDPOINTS.esim}/qr`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                iccid: iccidParam
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al generar QR');
        }

        mostrarQRESIM(result.data.qr_code);

    } catch (error) {
        console.error('Error generando QR eSIM:', error);
        window.showToast('❌ Error al generar QR: ' + error.message, 'error');
    }
}

// ================================================================
// ✅ VERIFICAR PAGO eSIM (via webhook)
// ================================================================
async function verificarPago(ordenId) {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para verificar pago', 'error');
            return;
        }

        if (!ordenId) {
            window.showToast('⚠️ ID de orden no proporcionado', 'error');
            return;
        }

        window.showToast('⏳ Verificando pago...', '', 5000);

        const response = await fetch(`${API_ENDPOINTS.pagos}/verificar/${ordenId}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al verificar pago');
        }

        if (result.data.pagado) {
            window.showToast('✅ Pago verificado. eSIM activada.', 'success');
            await cargarPerfil(true);
        } else {
            window.showToast('⏳ Pago pendiente. Espera confirmación.', 'warning');
        }

        return result.data;

    } catch (error) {
        console.error('Error verificando pago:', error);
        window.showToast('❌ Error al verificar pago: ' + error.message, 'error');
        return null;
    }
}

// ================================================================
// ================================================================
// 💳 CRYPTO - FUNCIONES
// ================================================================
// ================================================================

// ================================================================
// COMPRAR CON CRIPTO (placeholder)
// ================================================================
async function comprarConCripto() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para comprar', 'error');
            return;
        }

        window.showToast('⏳ Generando orden de pago...', '', 3000);

        const response = await fetch(`${API_ENDPOINTS.pagos}/cripto/crear`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                monto: 50,
                moneda: 'USDT',
                concepto: 'Compra de tokens'
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al crear orden');
        }

        // Mostrar modal de pago
        const modal = document.getElementById('cryptoPaymentModal');
        if (modal) {
            modal.classList.add('show');
            document.getElementById('cryptoAddress').textContent = result.data.direccion;
            document.getElementById('cryptoMonto').textContent = result.data.monto;
            document.getElementById('cryptoStatus').textContent = '⏳ Esperando pago...';
            const qrImg = document.getElementById('cryptoQR');
            if (qrImg) {
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.data.direccion)}`;
            }
            document.getElementById('cryptoPaymentModal').dataset.ordenId = result.data.orden_id;
        }

    } catch (error) {
        console.error('Error comprando con cripto:', error);
        window.showToast('❌ Error: ' + error.message, 'error');
    }
}

// ================================================================
// COPIAR DIRECCIÓN CRYPTO
// ================================================================
function copiarDireccion() {
    const addressEl = document.getElementById('cryptoAddress');
    if (!addressEl) return;
    const address = addressEl.textContent;
    if (address && address !== 'Cargando...') {
        navigator.clipboard.writeText(address).then(() => {
            window.showToast('📋 Dirección copiada', 'success');
        }).catch(() => {
            prompt('Copia esta dirección:', address);
        });
    }
}

// ================================================================
// ================================================================
// 💰 NFT Y DOMOS
// ================================================================
// ================================================================

let comprandoDomo = false;

async function comprarDomo(cantidad = 1) {
    if (comprandoDomo) {
        window.showToast('⏳ Ya hay una compra en proceso...', 'warning');
        return;
    }
    
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para comprar domos', 'error');
            return;
        }

        cantidad = Math.max(1, Math.floor(cantidad));
        if (cantidad > 10) {
            window.showToast('⚠️ Máximo 10 domos por transacción', 'warning');
            return;
        }

        comprandoDomo = true;
        window.showToast('⏳ Procesando compra de ' + cantidad + ' domo(s)...', '', 5000);

        const { data, error } = await supabaseClient.rpc('comprar_domo', { p_cantidad: cantidad });

        if (error) {
            if (error.message.includes('insufficient')) {
                window.showToast('❌ Fondos insuficientes para comprar domos', 'error');
            } else {
                throw error;
            }
            comprandoDomo = false;
            return;
        }

        window.showToast(`🎉 ¡${cantidad} Domo(s) comprado(s) exitosamente!`, 'success', 5000);
        await cargarPerfil(true);
        mostrarCelebracion();
        comprandoDomo = false;

    } catch (error) {
        console.error('Error al comprar domo:', error);
        window.showToast('❌ Error en la compra: ' + error.message, 'error');
        comprandoDomo = false;
    }
}

let canjeandoNFT = false;

async function canjearNFT() {
    if (canjeandoNFT) {
        window.showToast('⏳ Procesando canje...', 'warning');
        return;
    }
    
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para canjear tu NFT', 'error');
            return;
        }

        canjeandoNFT = true;
        window.showToast('⏳ Verificando tokens para canje...', '', 4000);

        const { data, error } = await supabaseClient.rpc('canjear_nft');

        if (error) {
            if (error.message.includes('insufficient tokens')) {
                window.showToast('❌ Necesitas exactamente 12 Es.stoks para canjear', 'error');
            } else if (error.message.includes('already redeemed')) {
                window.showToast('⚠️ Ya has canjeado tu NFT', 'warning');
            } else {
                throw error;
            }
            canjeandoNFT = false;
            return;
        }

        window.showToast('🎁 ¡NFT Canjeado Exitosamente! Tienes 30 días para reclamar.', 'success', 8000);
        await cargarPerfil(true);
        mostrarModalNFT(data);
        canjeandoNFT = false;

    } catch (error) {
        console.error('Error al canjear NFT:', error);
        window.showToast('❌ Error al canjear NFT: ' + error.message, 'error');
        canjeandoNFT = false;
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
    window.showToast('🎉 ¡Transacción exitosa!', 'success');
}

function compartirLogro() {
    const texto = '🎁 ¡Acabo de canjear mi NFT en Sariel\'s! Únete al ecosistema. #Sariels #WEB3 #NFT';
    if (navigator.share) {
        navigator.share({ title: 'Mi logro en Sariel\'s', text: texto });
    } else {
        navigator.clipboard.writeText(texto).then(() => {
            window.showToast('📋 Copiado al portapapeles', 'success');
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
// CERRAR SESIÓN
// ================================================================
async function cerrarSesion() {
    if (!confirm('¿Seguro que quieres cerrar sesión?')) return;
    
    try {
        await actualizarEstadoEnLinea(false);
        await supabaseClient.auth.signOut();
        window.location.href = '/';
        window.showToast('🔌 Sesión cerrada', 'success');
    } catch (error) {
        console.error('Error cerrando sesión:', error);
        window.showToast('❌ Error al cerrar sesión', 'error');
    }
}

// ================================================================
// NOTIFICACIONES EN TIEMPO REAL - CON REGISTER CHANNEL
// ================================================================
function iniciarNotificacionesRealtime() {
    const channel = supabaseClient
        .channel('notificaciones')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notificaciones'
        }, (payload) => {
            const notificacion = payload.new;
            if (notificacion.user_id === perfilCache?.id) {
                window.showToast(`🔔 ${notificacion.mensaje}`, 'warning', 4000);
                
                try {
                    const audio = new Audio('/sound/notification.mp3');
                    audio.play().catch(() => {});
                } catch (e) {}
            }
        })
        .subscribe();

    window.registerSupabaseChannel(channel, 'notificaciones');
    return channel;
}

// ================================================================
// FUNCIONES DE WALLET
// ================================================================
async function conectarWallet() {
    if (typeof window.ethereum === 'undefined') {
        window.showToast('⚠️ Instala MetaMask para conectar tu wallet', 'error');
        return;
    }

    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para vincular wallet', 'error');
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

        const { error } = await supabaseClient.rpc('vincular_wallet', { 
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

        window.showToast(`✅ Wallet conectada a ${ENV.networkName}`, 'success');
        await cargarPerfil(true);
        
    } catch (error) {
        console.error('Error conectando wallet:', error);
        window.showToast('❌ Error al conectar wallet: ' + error.message, 'error');
    }
}

async function desconectarWallet() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const { error } = await supabaseClient.rpc('desvincular_wallet');
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

        window.showToast('🔌 Wallet desconectada', 'warning');
        await cargarPerfil(true);
        
    } catch (error) {
        console.error('Error desconectando wallet:', error);
        window.showToast('❌ Error al desconectar wallet', 'error');
    }
}

// ================================================================
// FUNCIONES DE QR - CON MEMORY LEAK PREVENTION
// ================================================================
async function abrirCamaraQR() {
    try {
        const container = document.getElementById('qrReaderContainer');
        const video = document.getElementById('qrVideo');
        const status = document.getElementById('qrCamaraStatus');
        const canvas = document.getElementById('qrCanvas');
        const ctx = canvas?.getContext('2d');
        
        if (scannerActive) {
            cerrarCamaraQR();
            return;
        }

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
        window.registerInterval(qrScannerInterval, 'qr_scanner');

        window.showToast('📷 Apunta la cámara al QR', 'warning');

    } catch (error) {
        console.error('Error abriendo cámara:', error);
        window.showToast('❌ No se pudo acceder a la cámara', 'error');
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
        window.showToast('⏳ Procesando otro QR...', 'warning');
        return;
    }
    
    qrScanningLock = true;
    const status = document.getElementById('qrStatus');
    const input = document.getElementById('qrInput');
    
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para escanear QR', 'error');
            qrScanningLock = false;
            return;
        }

        if (status) status.textContent = '⏳ Validando QR...';
        window.showToast('⏳ Verificando QR...', '', 5000);

        const { data, error } = await supabaseClient.rpc('reclamar_qr_domo', {
            p_codigo: codigo
        });

        if (error) {
            if (error.message.includes('already used')) {
                window.showToast('❌ Este QR ya fue usado', 'error');
                if (status) status.textContent = '❌ QR ya utilizado';
            } else if (error.message.includes('invalid code')) {
                window.showToast('❌ QR inválido', 'error');
                if (status) status.textContent = '❌ QR inválido';
            } else if (error.message.includes('not a domo')) {
                window.showToast('❌ Este QR no es para un domo', 'error');
                if (status) status.textContent = '❌ QR no es domo';
            } else {
                throw error;
            }
            qrScanningLock = false;
            return;
        }

        if (!data.success) {
            window.showToast('❌ ' + (data.error || 'Error al reclamar QR'), 'error');
            if (status) status.textContent = '❌ ' + data.error;
            qrScanningLock = false;
            return;
        }

        if (status) status.textContent = '✅ ¡QR reclamado exitosamente!';
        if (input) input.value = '';
        
        window.showToast('🎉 ¡QR escaneado! +1 Es.stok', 'success');
        
        await cargarPerfil(true);
        await cargarHistorialQR();
        mostrarCelebracion();

    } catch (error) {
        console.error('Error procesando QR:', error);
        if (status) status.textContent = '❌ Error al procesar QR';
        window.showToast('❌ Error al escanear QR: ' + error.message, 'error');
    } finally {
        qrScanningLock = false;
    }
}

async function escanearQR() {
    const input = document.getElementById('qrInput');
    const qrCode = input?.value?.trim();

    if (!qrCode) {
        window.showToast('⚠️ Escribe o escanea el código QR', 'error');
        return;
    }

    await procesarQR(qrCode);
}

async function cargarHistorialQR() {
    try {
        const session = await window.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
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
// FUNCIONES DE ESTADÍSTICAS
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
        const session = await window.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
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

// ================================================================
// INTERACCIONES SOCIALES
// ================================================================
async function reaccionarPublicacion(postId, tipoReaccion) {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Debes iniciar sesión', 'error');
            return;
        }

        const { error } = await supabaseClient
            .from('reacciones')
            .upsert({
                post_id: postId,
                usuario_id: session.user.id,
                tipo: tipoReaccion
            }, { onConflict: 'post_id, usuario_id' });

        if (error) throw error;
        window.showToast(`❤️ Reaccionaste con ${tipoReaccion}`, 'success');
    } catch (error) {
        console.error('Error al reaccionar:', error);
        window.showToast('❌ Error al reaccionar', 'error');
    }
}

async function comentarPublicacion(postId, contenido) {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para comentar', 'error');
            return;
        }
        if (!contenido.trim()) {
            window.showToast('⚠️ Escribe un comentario', 'warning');
            return;
        }

        const textoFormateado = formatearTexto(contenido);

        const { error } = await supabaseClient
            .from('muro_comentarios')
            .insert({
                post_id: postId,
                usuario_id: session.user.id,
                contenido: textoFormateado
            });

        if (error) throw error;
        window.showToast('💬 Comentario publicado', 'success');
        
    } catch (error) {
        console.error('Error al comentar:', error);
        window.showToast('❌ Error al enviar comentario', 'error');
    }
}

// ================================================================
// SISTEMA DE AMIGOS - SOLICITUDES MEJORADA
// ================================================================
async function agregarAmigo(amigoId) {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para agregar amigos', 'error');
            return;
        }

        if (amigoId === session.user.id) {
            window.showToast('⚠️ No puedes agregarte a ti mismo', 'warning');
            return;
        }

        const { error } = await supabaseClient
            .from('contactos')
            .insert({
                usuario_id: session.user.id,
                contacto_id: amigoId,
                estado: 'pendiente'
            });

        if (error) {
            if (error.code === '23505') {
                window.showToast('⚠️ Ya enviaste solicitud a este usuario', 'warning');
            } else {
                throw error;
            }
            return;
        }

        window.showToast('🤝 Solicitud de amistad enviada', 'success');
        await cargarSolicitudesPendientes();
        
    } catch (error) {
        console.error('Error al agregar amigo:', error);
        window.showToast('❌ No se pudo enviar la solicitud: ' + error.message, 'error');
    }
}

// ================================================================
// LIMPIEZA DE RECURSOS - DELEGADA AL RESOURCE MANAGER
// ================================================================
function limpiarRecursos() {
    console.log('🧹 Limpieza de recursos delegada al ResourceManager');
}

// ================================================================
// INICIALIZACIÓN PRINCIPAL
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    if (typeof jsQR === 'undefined') {
        try {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
            document.head.appendChild(script);
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
        } catch (e) {
            console.warn('jsQR no pudo cargarse:', e);
        }
    }
    
    try {
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

        let esimInterval = null;
        if (perfilCache?.esim_iccid) {
            esimInterval = setInterval(() => {
                cargarDatosESIM(perfilCache.esim_iccid);
            }, 60000);
            window.registerInterval(esimInterval, 'esim_update');
        }

        const conexionInterval = setInterval(cargarEstadoConexion, 30000);
        window.registerInterval(conexionInterval, 'conexion_update');

        const amigosInterval = setInterval(cargarAmigosEnLinea, 30000);
        window.registerInterval(amigosInterval, 'amigos_update');

        window._perfilIntervals = {
            esim: esimInterval,
            conexion: conexionInterval,
            amigos: amigosInterval
        };

        const cryptoQty = document.getElementById('cryptoQuantity');
        if (cryptoQty) {
            document.getElementById('cryptoDecreaseQty')?.addEventListener('click', () => {
                let val = parseInt(cryptoQty.textContent);
                if (val > 1) {
                    cryptoQty.textContent = val - 1;
                    actualizarCryptoTotal();
                }
            });
            document.getElementById('cryptoIncreaseQty')?.addEventListener('click', () => {
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
        
    } catch (error) {
        console.error('Error en inicialización:', error);
        window.showToast('⚠️ Error al inicializar perfil', 'error');
    }
});

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
window.cambiarEstado = cambiarEstado;
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
window.generarQRPerfil = generarQRPerfil;
window.calcularNivel = calcularNivel;
window.compartirLogro = compartirLogro;
window.limpiarRecursos = limpiarRecursos;

// ✅ eSIM - TODAS LAS FUNCIONES EXPUESTAS
window.comprarESIM = comprarESIM;
window.cargarDatosESIM = cargarDatosESIM;
window.activarESIM = activarESIM;
window.desactivarESIM = desactivarESIM;
window.generarQRESIM = generarQRESIM;
window.obtenerEstadoESIM = obtenerEstadoESIM;
window.obtenerPlanesESIM = obtenerPlanesESIM;
window.verificarPago = verificarPago;
window.sincronizarESIM = sincronizarESIM;
window.cerrarModalESIM = cerrarModalESIM;
window.seleccionarPlanESIM = seleccionarPlanESIM;

// ✅ Crypto
window.comprarConCripto = comprarConCripto;
window.copiarDireccion = copiarDireccion;
window.cerrarModalPago = cerrarModalPago;

// Conexión
window.cambiarConexion = cambiarConexion;
window.cargarEstadoConexion = cargarEstadoConexion;
window.getPerfilActual = getPerfilActual;

// Estado
window.actualizarEstadoEnLinea = actualizarEstadoEnLinea;
window.cargarAmigosEnLinea = cargarAmigosEnLinea;
window.actualizarListaAmigos = actualizarListaAmigos;

// QR
window.escanearQR = escanearQR;
window.abrirCamaraQR = abrirCamaraQR;
window.cerrarCamaraQR = cerrarCamaraQR;
window.cargarHistorialQR = cargarHistorialQR;
window.actualizarUIHistorialQR = actualizarUIHistorialQR;
window.procesarQR = procesarQR;

// Amistades
window.obtenerSolicitudesPendientes = obtenerSolicitudesPendientes;
window.aceptarSolicitudAmistad = aceptarSolicitudAmistad;
window.rechazarSolicitudAmistad = rechazarSolicitudAmistad;
window.cargarSolicitudesPendientes = cargarSolicitudesPendientes;
window.actualizarUISolicitudes = actualizarUISolicitudes;