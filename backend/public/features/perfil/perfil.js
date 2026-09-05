// ================================================================
// PERFIL.JS - SARIEL'S ECOSYSTEM
// VERSIÓN FINAL CORREGIDA - PRODUCCIÓN REAL
// ================================================================

// ===== VARIABLES GLOBALES =====
let sessionUser = null;
let membresiaActual = null;
let perfilUsuario = null;

// ===== TOAST =====
function showToast(msg, type) {
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
    t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}

// ================================================================
// CARGAR PERFIL
// ================================================================

async function cargarPerfil() {
    try {
        console.log('🔄 Iniciando cargarPerfil()...');

        const sessionResult = await window.supabase.auth.getSession();
        console.log('📡 Session result:', sessionResult);

        if (sessionResult.error) {
            console.error('❌ Error de sesión:', sessionResult.error);
            showToast('⚠️ Error de autenticación', 'error');
            return;
        }

        if (!sessionResult.data.session) {
            console.warn('⚠️ No hay sesión activa');
            document.getElementById('perfilNombre').innerHTML = 'Inicia sesión';
            document.getElementById('perfilHandle').textContent = '@usuario';
            document.getElementById('perfilBio').textContent = 'Inicia sesión para ver tu perfil';
            return;
        }

        sessionUser = sessionResult.data.session.user;
        console.log('🔐 sessionUser.id:', sessionUser.id);

        // Cargar datos del usuario
        const userResult = await window.supabase
            .from('usuarios')
            .select('*')
            .eq('id', sessionUser.id)
            .single();

        if (userResult.error) {
            console.error('❌ Error cargando usuario:', userResult.error);
            showToast('❌ Error al cargar datos de usuario', 'error');
            return;
        }

        if (!userResult.data) {
            console.warn('⚠️ No se encontraron datos del usuario');
            return;
        }

        perfilUsuario = userResult.data;
        console.log('✅ Datos de usuario cargados:', perfilUsuario);
        actualizarUI(perfilUsuario);

        // Cargar publicaciones
        console.log('📝 Cargando publicaciones...');
        await cargarPublicaciones();

        // Cargar membresía
        console.log('✦ Cargando membresía...');
        await cargarMembresia();

        // Verificar estado de pago
        verificarEstadoPago();

        showToast('✅ ¡Bienvenido ' + (perfilUsuario.nombre || 'Usuario') + '!', 'success');

    } catch (error) {
        console.error('❌ Error en cargarPerfil:', error);
        showToast('❌ Error al cargar perfil: ' + error.message, 'error');
    }
}

// ================================================================
// ACTUALIZAR UI
// ================================================================

function actualizarUI(data) {
    if (!data) {
        console.warn('⚠️ No hay datos para actualizar UI');
        return;
    }

    console.log('🎨 Actualizando UI con:', data);

    const nombreEl = document.getElementById('perfilNombre');
    if (nombreEl) {
        const verificado = data.verificado ? ' <span class="verified">✦ VERIFICADO</span>' : '';
        nombreEl.innerHTML = (data.nombre || 'Usuario') + verificado;
    }

    const handleEl = document.getElementById('perfilHandle');
    if (handleEl) {
        handleEl.textContent = '@' + (data.handle || 'usuario');
    }

    const bioEl = document.getElementById('perfilBio');
    if (bioEl) {
        bioEl.textContent = data.bio || 'Sin biografía';
    }

    const avatarEl = document.getElementById('perfilAvatar');
    if (avatarEl) {
        if (data.avatar_url && data.avatar_url.trim() !== '') {
            console.log('🖼️ Cargando avatar:', data.avatar_url);
            avatarEl.innerHTML = `<img src="${data.avatar_url}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;"/>`;
        } else {
            console.log('🖼️ No hay avatar, usando por defecto');
            avatarEl.textContent = '◈';
        }
    }

    const statTokens = document.getElementById('statTokens');
    if (statTokens) {
        statTokens.textContent = data.tokens || 0;
    }

    const tokenTotal = document.getElementById('tokenTotal');
    if (tokenTotal) {
        tokenTotal.textContent = data.tokens || 0;
    }

    const estadoBadge = document.getElementById('estadoBadge');
    const estadoTexto = document.getElementById('estadoTexto');
    if (estadoBadge && estadoTexto) {
        if (data.online) {
            estadoBadge.textContent = '🟢';
            estadoTexto.textContent = 'Activo ahora';
            estadoTexto.style.color = 'var(--success)';
        } else {
            estadoBadge.textContent = '⭕';
            estadoTexto.textContent = 'Inactivo';
            estadoTexto.style.color = 'var(--text-muted)';
        }
    }

    const editNombre = document.getElementById('editNombre');
    const editHandle = document.getElementById('editHandle');
    const editBio = document.getElementById('editBio');
    if (editNombre) editNombre.value = data.nombre || '';
    if (editHandle) editHandle.value = data.handle || '';
    if (editBio) editBio.value = data.bio || '';
}

// ================================================================
// 📋 CARGAR PUBLICACIONES - CON NOMBRE DEL USUARIO
// ================================================================

async function cargarPublicaciones() {
    try {
        if (!sessionUser) {
            console.warn('⚠️ No hay sesión para cargar publicaciones');
            return;
        }

        console.log('🔐 sessionUser.id para publicaciones:', sessionUser.id);

        // Consulta principal - SIN JOIN
        const { data, error } = await window.supabase
            .from('publicaciones')
            .select('*')
            .eq('usuario_id', sessionUser.id)
            .eq('estado', 'publicado')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error Supabase publicaciones:', error);
            throw error;
        }

        console.log('📝 publicaciones data:', data);
        console.log('📝 cantidad de publicaciones:', data ? data.length : 0);

        const container = document.getElementById('postsList');
        if (!container) {
            console.warn('⚠️ No se encontró postsList');
            return;
        }

        const publicaciones = data || [];

        const countEl = document.getElementById('postsCount');
        if (countEl) countEl.textContent = publicaciones.length;

        if (publicaciones.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="icon">📝</span>
                    <h4>Sin publicaciones</h4>
                    <p>Crea tu primera publicación desde el botón "Nueva Publicación".</p>
                </div>
            `;
            console.log('📝 No hay publicaciones para mostrar');
            return;
        }

        // Obtener el nombre del usuario para mostrar en las publicaciones
        let nombreUsuario = 'Usuario';
        let avatarUsuario = '◈';

        if (perfilUsuario) {
            nombreUsuario = perfilUsuario.nombre || 'Usuario';
            avatarUsuario = perfilUsuario.avatar_url 
                ? `<img src="${perfilUsuario.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` 
                : '◈';
        } else {
            // Fallback: consultar el usuario si no está en memoria
            try {
                const userResult = await window.supabase
                    .from('usuarios')
                    .select('nombre, avatar_url')
                    .eq('id', sessionUser.id)
                    .single();

                if (userResult.data) {
                    nombreUsuario = userResult.data.nombre || 'Usuario';
                    avatarUsuario = userResult.data.avatar_url 
                        ? `<img src="${userResult.data.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` 
                        : '◈';
                }
            } catch (e) {
                console.warn('⚠️ No se pudo obtener nombre del usuario:', e);
            }
        }

        container.innerHTML = publicaciones.map(p => {
            const fecha = p.created_at
                ? new Date(p.created_at).toLocaleString()
                : '';

            let mediaHtml = '';

            if (p.media_url) {
                if (p.media_type === 'imagen') {
                    mediaHtml = `
                        <img
                            src="${p.media_url}"
                            class="pub-media"
                            loading="lazy"
                            alt="Publicación"
                            onerror="this.style.display='none'"
                        />
                    `;
                } else if (p.media_type === 'video') {
                    mediaHtml = `
                        <video
                            src="${p.media_url}"
                            class="pub-media"
                            controls
                            preload="metadata"
                        ></video>
                    `;
                }
            }

            const contenido = p.contenido
                ? `<div class="pub-texto">${p.contenido}</div>`
                : '';

            return `
                <div class="publicacion-item" data-id="${p.id}">
                    <div class="pub-header">
                        <div class="avatar-mini">${avatarUsuario}</div>
                        <span class="pub-nombre">${nombreUsuario}</span>
                        <span class="pub-fecha">${fecha}</span>
                    </div>
                    ${contenido}
                    ${mediaHtml}
                    <div class="pub-actions">
                        <button class="reaccion-btn" onclick="toggleReaccion('${p.id}', event)">
                            <span class="reaccion-emoji">❤️</span>
                            <span class="count">${p.likes || 0}</span>
                        </button>
                        <span class="comment-btn" onclick="abrirModalComentarios('${p.id}')">
                            💬 <span>${p.comentarios || 0}</span>
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        console.log('✅ Publicaciones renderizadas correctamente');

    } catch (error) {
        console.error('❌ Error cargando publicaciones:', error);

        const container = document.getElementById('postsList');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="icon">⚠️</span>
                    <h4>Error al cargar publicaciones</h4>
                    <p>${error.message || 'Intenta nuevamente.'}</p>
                </div>
            `;
        }

        showToast('❌ Error al cargar publicaciones', 'error');
    }
}

// ================================================================
// ✦ CARGAR MEMBRESÍA - CORREGIDO
// ================================================================

async function cargarMembresia() {
    if (!sessionUser) {
        console.warn('⚠️ No hay sesión para cargar membresía');
        return;
    }

    try {
        const container = document.getElementById('membresiaContainer');
        if (!container) {
            console.warn('⚠️ No se encontró membresiaContainer');
            return;
        }

        console.log('✦ Cargando membresía para usuario:', sessionUser.id);

        // ✅ RPC con tratamiento correcto (devuelve TABLE/array)
        const { data, error } = await window.supabase.rpc(
            'obtener_membresia_usuario',
            {
                p_usuario_id: sessionUser.id
            }
        );

        if (error) {
            console.error('❌ Error RPC membresía:', error);
            throw error;
        }

        console.log('✦ Datos RPC membresía (raw):', data);

        // ✅ CORRECCIÓN: La RPC devuelve un array
        const membresia = Array.isArray(data) ? data[0] : data;

        console.log('✦ Membresía procesada:', membresia);

        // ✅ Validación correcta con plan_id explícito
        const planId = membresia?.plan_id || 'free';

        // Caso 1: Sin membresía o plan Gratis
        if (!membresia || planId === 'free') {
            console.log('✦ Usuario tiene plan GRATIS (plan_id: free)');
            container.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                        <div>
                            <span style="font-size:0.8rem;color:var(--text-secondary);">Plan actual:</span>
                            <span style="font-weight:700;color:var(--text-primary);">Gratis</span>
                        </div>
                        <span style="font-size:0.6rem;color:var(--text-muted);">1 GB · 90 días</span>
                    </div>
                    <div style="background:rgba(212,175,55,0.05);border:1px solid var(--gold);border-radius:12px;padding:14px;text-align:center;">
                        <div style="font-family:'Orbitron',monospace;font-size:1.2rem;color:var(--gold);font-weight:700;">✦ Sariel's Pro</div>
                        <div style="font-size:0.8rem;color:var(--text-secondary);margin:4px 0;">$20 MXN / 30 días</div>
                        <div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:10px;">Conservación ampliada · 5 GB</div>
                        <button class="btn btn-gold" onclick="contratarPro()" style="width:100%;justify-content:center;padding:10px;">
                            🚀 Contratar Pro por $20 MXN
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        // Caso 2: Plan Pro
        if (planId === 'pro') {
            console.log('✦ Usuario tiene plan PRO (plan_id: pro)');

            const esActiva = membresia.activa || false;
            const diasRestantes = membresia.dias_restantes || 0;
            const venceAt = membresia.vence_at ? new Date(membresia.vence_at).toLocaleDateString() : '--';
            const planNombre = membresia.plan_nombre || 'Pro';

            if (esActiva) {
                // PRO ACTIVA
                container.innerHTML = `
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                            <div>
                                <span style="font-size:0.8rem;color:var(--text-secondary);">Plan actual:</span>
                                <span style="font-weight:700;color:var(--gold);">✦ ${planNombre}</span>
                            </div>
                            <span style="font-size:0.6rem;color:var(--success);">✅ Activa</span>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;">
                            <div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:10px;text-align:center;">
                                <div style="font-size:1.2rem;font-weight:700;color:var(--gold);">${diasRestantes}</div>
                                <div style="font-size:0.5rem;color:var(--text-muted);">DÍAS RESTANTES</div>
                            </div>
                            <div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:10px;text-align:center;">
                                <div style="font-size:0.8rem;color:var(--text-secondary);">${venceAt}</div>
                                <div style="font-size:0.5rem;color:var(--text-muted);">VENCE EL</div>
                            </div>
                            <div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:10px;text-align:center;">
                                <div style="font-size:0.8rem;color:var(--text-secondary);">5 GB</div>
                                <div style="font-size:0.5rem;color:var(--text-muted);">ALMACENAMIENTO</div>
                            </div>
                        </div>
                        <button class="btn btn-outline" onclick="renovarPro()" style="width:100%;justify-content:center;padding:10px;">
                            🔄 Renovar Pro por $20 MXN
                        </button>
                    </div>
                `;
            } else {
                // PRO INACTIVA/VENCIDA
                container.innerHTML = `
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                            <div>
                                <span style="font-size:0.8rem;color:var(--text-secondary);">Plan actual:</span>
                                <span style="font-weight:700;color:var(--gold);">✦ ${planNombre}</span>
                            </div>
                            <span style="font-size:0.6rem;color:var(--text-muted);">⏳ Inactiva</span>
                        </div>
                        <div style="background:rgba(212,175,55,0.05);border:1px solid var(--gold);border-radius:12px;padding:14px;text-align:center;">
                            <div style="font-family:'Orbitron',monospace;font-size:1.2rem;color:var(--gold);font-weight:700;">✦ Sariel's Pro</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);margin:4px 0;">$20 MXN / 30 días</div>
                            <div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:10px;">Conservación ampliada · 5 GB</div>
                            <button class="btn btn-gold" onclick="contratarPro()" style="width:100%;justify-content:center;padding:10px;">
                                🚀 Contratar Pro por $20 MXN
                            </button>
                        </div>
                    </div>
                `;
            }

            membresiaActual = membresia;
            console.log('✅ Membresía renderizada correctamente');
            return;
        }

        // Caso 3: plan_id desconocido (error controlado)
        console.warn('⚠️ plan_id desconocido:', planId);
        container.innerHTML = `
            <div style="text-align:center;padding:16px;color:var(--text-muted);">
                ⚠️ Estado de membresía desconocido.
                <br>
                <span style="font-size:0.6rem;">plan_id: ${planId}</span>
                <br>
                <button class="btn btn-outline btn-sm" onclick="cargarMembresia()" style="margin-top:8px;">
                    🔄 Reintentar
                </button>
            </div>
        `;

    } catch (error) {
        console.error('❌ Error cargando membresía:', error);

        const container = document.getElementById('membresiaContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align:center;padding:16px;color:var(--text-muted);">
                    ⚠️ No se pudo cargar la membresía.
                    <br>
                    <button class="btn btn-outline btn-sm" onclick="cargarMembresia()" style="margin-top:8px;">
                        🔄 Reintentar
                    </button>
                    <br>
                    <span style="font-size:0.6rem;color:var(--text-muted);">Error: ${error.message || 'Error desconocido'}</span>
                </div>
            `;
        }

        showToast('❌ Error al cargar membresía: ' + error.message, 'error');
    }
}

// ================================================================
// CONTRATAR PRO
// ================================================================

window.contratarPro = async function() {
    if (!sessionUser) {
        showToast('⚠️ Inicia sesión para contratar Pro', 'error');
        return;
    }

    mostrarModalPrivacidad('contratar');
};

// ================================================================
// RENOVAR PRO
// ================================================================

window.renovarPro = async function() {
    if (!sessionUser) {
        showToast('⚠️ Inicia sesión para renovar Pro', 'error');
        return;
    }

    mostrarModalPrivacidad('renovar');
};

// ================================================================
// MODAL DE PRIVACIDAD
// ================================================================

function mostrarModalPrivacidad(accion) {
    let modal = document.getElementById('modalPrivacidad');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalPrivacidad';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:520px;text-align:left;">
                <button class="close-btn" onclick="cerrarModalPrivacidad()">✕</button>
                <h2 style="text-align:center;color:var(--gold);">📋 AVISO DE PRIVACIDAD</h2>
                <div style="font-size:0.8rem;color:var(--text-secondary);margin:12px 0;line-height:1.6;max-height:200px;overflow-y:auto;padding:8px 4px;">
                    <p style="margin-bottom:10px;">Al contratar Sariel's Pro, tus datos de cuenta, perfil y contenido podrán ser tratados para prestar el servicio, conservar tu contenido conforme al plan contratado, procesar pagos, mantener la seguridad y cumplir obligaciones legales.</p>
                    <p style="margin-bottom:10px;"><strong>Sariel's Pro</strong></p>
                    <p style="margin-bottom:4px;">💰 $20 MXN / 30 días</p>
                    <p style="margin-bottom:4px;">💾 5 GB de almacenamiento</p>
                    <p style="margin-bottom:10px;">♻️ Conservación ampliada mientras Pro esté activa</p>
                    <p style="font-size:0.7rem;color:var(--text-muted);">Consulta el aviso de privacidad integral para conocer tus derechos y mecanismos de atención.</p>
                </div>
                <div style="display:flex;align-items:center;gap:10px;margin:12px 0;">
                    <input type="checkbox" id="aceptaPrivacidad" style="width:18px;height:18px;accent-color:var(--gold);">
                    <label for="aceptaPrivacidad" style="font-size:0.75rem;color:var(--text-secondary);">
                        He leído y acepto el aviso de privacidad
                    </label>
                </div>
                <button id="btnContinuarPago" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px;opacity:0.5;pointer-events:none;" onclick="procesarContratacion()">
                    ${accion === 'renovar' ? '🔄 Renovar Pro' : '🚀 Continuar al pago'}
                </button>
                <div id="privacidadStatus" style="margin-top:8px;font-size:0.7rem;color:var(--text-muted);text-align:center;"></div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('aceptaPrivacidad').addEventListener('change', function() {
            const btn = document.getElementById('btnContinuarPago');
            if (this.checked) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            } else {
                btn.style.opacity = '0.5';
                btn.style.pointerEvents = 'none';
            }
        });
    }

    modal.dataset.accion = accion || 'contratar';
    modal.classList.add('active');
}

window.cerrarModalPrivacidad = function() {
    const modal = document.getElementById('modalPrivacidad');
    if (modal) modal.classList.remove('active');
    document.getElementById('aceptaPrivacidad').checked = false;
    const btn = document.getElementById('btnContinuarPago');
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
    document.getElementById('privacidadStatus').textContent = '';
};

window.procesarContratacion = function() {
    const modal = document.getElementById('modalPrivacidad');
    const accion = modal.dataset.accion || 'contratar';
    const acepta = document.getElementById('aceptaPrivacidad').checked;
    const status = document.getElementById('privacidadStatus');

    if (!acepta) {
        status.textContent = '⚠️ Debes aceptar el aviso de privacidad';
        status.style.color = 'var(--danger)';
        return;
    }

    cerrarModalPrivacidad();

    if (accion === 'renovar') {
        ejecutarRenovacion();
    } else {
        ejecutarContratacion();
    }
};

// ================================================================
// EJECUTAR CONTRATACIÓN
// ================================================================

async function ejecutarContratacion() {
    showToast('⏳ Creando orden de pago...', '');

    try {
        const session = await window.supabase.auth.getSession();
        const token = session.data.session?.access_token;

        const response = await fetch('/api/payments/membresia/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                privacy_version: '1.0'
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al crear la orden');
        }

        showToast('✅ Orden creada. Redirigiendo al pago...', 'success');

        sessionStorage.setItem('pro_order_id', data.order_id);

        if (data.payment_url) {
            window.location.href = data.payment_url;
        } else {
            showToast('📋 Pago pendiente. Revisa tu correo.', '');
        }

    } catch (error) {
        console.error('❌ Error contratando Pro:', error);
        showToast('❌ Error: ' + error.message, 'error');
    }
}

// ================================================================
// EJECUTAR RENOVACIÓN
// ================================================================

async function ejecutarRenovacion() {
    showToast('⏳ Creando orden de renovación...', '');

    try {
        const session = await window.supabase.auth.getSession();
        const token = session.data.session?.access_token;

        const response = await fetch('/api/payments/membresia/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                renovar: true,
                privacy_version: '1.0'
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al crear la orden');
        }

        showToast('✅ Orden de renovación creada. Redirigiendo...', 'success');

        sessionStorage.setItem('pro_order_id', data.order_id);

        if (data.payment_url) {
            window.location.href = data.payment_url;
        }

    } catch (error) {
        console.error('❌ Error renovando Pro:', error);
        showToast('❌ Error: ' + error.message, 'error');
    }
}

// ================================================================
// VERIFICAR ESTADO DESPUÉS DE PAGO
// ================================================================

function verificarEstadoPago() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
        showToast('⏳ Procesando pago...', '');
        setTimeout(() => {
            cargarMembresia();
            showToast('✅ Pago procesado correctamente', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 2000);
    }
}

// ================================================================
// TOGGLE REACCION (PLACEHOLDER)
// ================================================================

window.toggleReaccion = function(publicacionId, event) {
    showToast('❤️ Reacción agregada', 'success');
};

// ================================================================
// ABRIR MODAL COMENTARIOS (PLACEHOLDER)
// ================================================================

window.abrirModalComentarios = function(publicacionId) {
    showToast('💬 Comentarios próximamente', '');
};

// ================================================================
// INICIALIZACIÓN
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ perfil.js cargado');
    console.log('🔍 Supabase disponible:', typeof window.supabase !== 'undefined');
    cargarPerfil();
});

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================

window.cargarPerfil = cargarPerfil;
window.cargarPublicaciones = cargarPublicaciones;
window.cargarMembresia = cargarMembresia;
window.contratarPro = window.contratarPro;
window.renovarPro = window.renovarPro;
window.showToast = showToast;
window.cerrarModalPrivacidad = window.cerrarModalPrivacidad;
window.procesarContratacion = window.procesarContratacion;
window.toggleReaccion = window.toggleReaccion;
window.abrirModalComentarios = window.abrirModalComentarios;
window.actualizarUI = actualizarUI;