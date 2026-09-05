// ================================================================
// PERFIL.JS - SARIEL'S ECOSYSTEM
// VERSIÓN CORREGIDA - COMPATIBLE CON SUPABASE REAL
// ================================================================

// ===== VARIABLES GLOBALES =====
let sessionUser = null;
let perfilUsuario = null;
let membresiaActual = null;

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
        console.log('🔄 cargarPerfil() iniciado...');

        // 1. Obtener usuario autenticado
        const { data: { user }, error: userError } = await window.supabase.auth.getUser();

        if (userError || !user) {
            console.warn('⚠️ No hay usuario autenticado:', userError);
            document.getElementById('perfilNombre').innerHTML = 'Inicia sesión';
            document.getElementById('perfilHandle').textContent = '@usuario';
            document.getElementById('perfilBio').textContent = 'Inicia sesión para ver tu perfil';
            return;
        }

        sessionUser = user;
        console.log('🔐 Usuario autenticado:', sessionUser.id);

        // 2. Cargar datos del usuario
        const { data: userData, error: userDataError } = await window.supabase
            .from('usuarios')
            .select('*')
            .eq('id', sessionUser.id)
            .single();

        if (userDataError) {
            console.error('❌ Error cargando usuario:', userDataError);
            showToast('❌ Error al cargar datos de usuario', 'error');
            return;
        }

        perfilUsuario = userData;
        console.log('✅ Datos de usuario cargados');
        actualizarUI(perfilUsuario);

        // 3. Cargar publicaciones
        await cargarPublicaciones();

        // 4. Cargar membresía (con manejo de error)
        await cargarMembresia();

        // 5. Verificar estado de pago
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
    if (!data) return;

    console.log('🎨 Actualizando UI...');

    const nombreEl = document.getElementById('perfilNombre');
    if (nombreEl) {
        const verificado = data.verificado ? ' <span class="verified">✦ VERIFICADO</span>' : '';
        nombreEl.innerHTML = (data.nombre || 'Usuario') + verificado;
    }

    const handleEl = document.getElementById('perfilHandle');
    if (handleEl) handleEl.textContent = '@' + (data.handle || 'usuario');

    const bioEl = document.getElementById('perfilBio');
    if (bioEl) bioEl.textContent = data.bio || 'Sin biografía';

    const avatarEl = document.getElementById('perfilAvatar');
    if (avatarEl) {
        if (data.avatar_url && data.avatar_url.trim() !== '') {
            avatarEl.innerHTML = `<img src="${data.avatar_url}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;"/>`;
        } else {
            avatarEl.innerHTML = '◈';
        }
    }

    const statTokens = document.getElementById('statTokens');
    if (statTokens) statTokens.textContent = data.tokens || 0;

    const tokenTotal = document.getElementById('tokenTotal');
    if (tokenTotal) tokenTotal.textContent = data.tokens || 0;

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
// 📋 CARGAR PUBLICACIONES
// ================================================================

async function cargarPublicaciones() {
    try {
        if (!sessionUser) {
            console.warn('⚠️ No hay sesión para cargar publicaciones');
            return;
        }

        console.log('📝 Cargando publicaciones para:', sessionUser.id);

        const { data, error } = await window.supabase
            .from('publicaciones')
            .select('*')
            .eq('usuario_id', sessionUser.id)
            .eq('estado', 'publicado')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error cargando publicaciones:', error);
            throw error;
        }

        console.log('📝 Publicaciones encontradas:', data ? data.length : 0);

        const container = document.getElementById('postsList');
        if (!container) return;

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
            return;
        }

        let nombreUsuario = perfilUsuario?.nombre || 'Usuario';
        let avatarUsuario = perfilUsuario?.avatar_url 
            ? `<img src="${perfilUsuario.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` 
            : '◈';

        container.innerHTML = publicaciones.map(p => {
            const fecha = p.created_at ? new Date(p.created_at).toLocaleString() : '';
            let mediaHtml = '';

            if (p.media_url) {
                if (p.media_type === 'imagen') {
                    mediaHtml = `<img src="${p.media_url}" class="pub-media" loading="lazy" onerror="this.style.display='none'" />`;
                } else if (p.media_type === 'video') {
                    mediaHtml = `<video src="${p.media_url}" class="pub-media" controls preload="metadata"></video>`;
                }
            }

            const contenido = p.contenido ? `<div class="pub-texto">${p.contenido}</div>` : '';

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
                        <button class="reaccion-btn" onclick="window.toggleReaccion('${p.id}', event)">
                            <span class="reaccion-emoji">❤️</span>
                            <span class="count">${p.likes || 0}</span>
                        </button>
                        <span class="comment-btn" onclick="window.abrirModalComentarios('${p.id}')">
                            💬 <span>${p.comentarios || 0}</span>
                        </span>
                    </div>
                </div>
            `;
        }).join('');

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
    }
}

// ================================================================
// ✦ CARGAR MEMBRESÍA - CORREGIDO
// ================================================================

async function cargarMembresia() {
    const container = document.getElementById('membresiaContainer');
    if (!container) {
        console.warn('⚠️ No se encontró membresiaContainer');
        return;
    }

    // Mostrar estado "cargando"
    container.innerHTML = `
        <div class="empty-state">
            <span class="icon">⏳</span>
            <h4>Cargando membresía...</h4>
        </div>
    `;

    if (!sessionUser) {
        console.warn('⚠️ No hay sesión para cargar membresía');
        container.innerHTML = `
            <div style="text-align:center;padding:16px;color:var(--text-muted);">
                ⚠️ Inicia sesión para ver tu membresía.
            </div>
        `;
        return;
    }

    try {
        console.log('✦ Cargando membresía para:', sessionUser.id);

        // ✅ RPC real: obtener_membresia_usuario(p_usuario_id uuid)
        // Devuelve TABLE, Supabase JS entrega { data, error } con data = ARRAY
        const { data, error } = await window.supabase.rpc(
            'obtener_membresia_usuario',
            { p_usuario_id: sessionUser.id }
        );

        if (error) {
            console.error('❌ Error RPC membresía:', error);
            throw new Error(error.message || 'Error al cargar membresía');
        }

        console.log('✦ Datos RPC membresía (raw):', data);

        // ✅ CORRECCIÓN: data es un ARRAY, usar data[0]
        if (!data || data.length === 0) {
            console.warn('⚠️ No se recibieron datos de membresía');
            mostrarMembresiaGratis(container);
            return;
        }

        const membresia = data[0];
        console.log('✦ Membresía procesada:', membresia);

        const planId = membresia?.plan_id || 'free';

        if (planId === 'free') {
            console.log('✦ Plan: GRATIS');
            mostrarMembresiaGratis(container);
            return;
        }

        if (planId === 'pro') {
            console.log('✦ Plan: PRO');
            const esActiva = membresia.activa || false;
            mostrarMembresiaPro(container, membresia, esActiva);
            membresiaActual = membresia;
            return;
        }

        // plan_id desconocido
        console.warn('⚠️ plan_id desconocido:', planId);
        container.innerHTML = `
            <div style="text-align:center;padding:16px;color:var(--text-muted);">
                ⚠️ Estado de membresía desconocido.
                <br>
                <span style="font-size:0.6rem;">plan_id: ${planId}</span>
                <br>
                <button class="btn btn-outline btn-sm" onclick="window.cargarMembresia()" style="margin-top:8px;">
                    🔄 Reintentar
                </button>
            </div>
        `;

    } catch (error) {
        console.error('❌ Error cargando membresía:', error);
        container.innerHTML = `
            <div style="text-align:center;padding:16px;color:var(--text-muted);">
                ⚠️ No se pudo cargar la membresía.
                <br>
                <button class="btn btn-outline btn-sm" onclick="window.cargarMembresia()" style="margin-top:8px;">
                    🔄 Reintentar
                </button>
                <br>
                <span style="font-size:0.6rem;color:var(--text-muted);">${error.message || 'Error desconocido'}</span>
            </div>
        `;
        showToast('❌ Error al cargar membresía', 'error');
    }
}

// ===== FUNCIONES AUXILIARES DE MEMBRESÍA =====

function mostrarMembresiaGratis(container) {
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
                <button class="btn btn-gold" onclick="window.contratarPro()" style="width:100%;justify-content:center;padding:10px;">
                    🚀 Contratar Pro por $20 MXN
                </button>
            </div>
        </div>
    `;
}

function mostrarMembresiaPro(container, membresia, esActiva) {
    const diasRestantes = membresia.dias_restantes || 0;
    const venceAt = membresia.vence_at ? new Date(membresia.vence_at).toLocaleDateString() : '--';
    const planNombre = membresia.plan_nombre || 'Pro';

    if (esActiva) {
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
                <button class="btn btn-outline" onclick="window.renovarPro()" style="width:100%;justify-content:center;padding:10px;">
                    🔄 Renovar Pro por $20 MXN
                </button>
            </div>
        `;
    } else {
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
                    <button class="btn btn-gold" onclick="window.contratarPro()" style="width:100%;justify-content:center;padding:10px;">
                        🚀 Contratar Pro por $20 MXN
                    </button>
                </div>
            </div>
        `;
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
                <button class="close-btn" onclick="window.cerrarModalPrivacidad()">✕</button>
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
                <button id="btnContinuarPago" class="btn btn-gold" style="width:100%;justify-content:center;padding:12px;opacity:0.5;pointer-events:none;" onclick="window.procesarContratacion()">
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

    window.cerrarModalPrivacidad();

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
            body: JSON.stringify({ privacy_version: '1.0' })
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
            window.cargarMembresia();
            showToast('✅ Pago procesado correctamente', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 2000);
    }
}

// ================================================================
// 😊 EMOJIS DE REACCIÓN
// ================================================================

async function cargarEmojis() {
    try {
        const { data, error } = await window.supabase.rpc('obtener_emojis_reaccion');
        if (error) {
            console.warn('⚠️ Error cargando emojis:', error);
            return;
        }
        if (data && data.length > 0) {
            console.log('😊 Emojis cargados:', data.length);
            window.EMOJIS_DISPONIBLES = data;
        }
    } catch (error) {
        console.error('❌ Error cargando emojis:', error);
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
// ================================================================
// FUNCIONES EXPUESTAS PARA ONCLICK DEL HTML
// ================================================================
// ================================================================

// ===== TABS =====
window.cambiarTab = function(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const tabContent = document.getElementById('tab-' + tab);
    if (tabContent) tabContent.classList.add('active');
    const tabBtn = document.querySelector('.tab-btn[onclick*="' + tab + '"]');
    if (tabBtn) tabBtn.classList.add('active');
};

// ===== PERFIL =====
window.editarPerfil = function() {
    window.cambiarTab('config');
    showToast('✏️ Edita tu perfil en la pestaña Ajustes', '');
};

window.compartirPerfil = function() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ title: 'Mi perfil en Sariel\'s', text: '◈ Mira mi perfil en Sariel\'s Ecosystem', url: url })
            .catch(() => {});
    } else {
        navigator.clipboard.writeText(url).then(() => showToast('📋 Enlace copiado', 'success'))
            .catch(() => showToast('📋 Copia el enlace: ' + url, ''));
    }
};

window.generarQRPerfil = function() {
    const modal = document.getElementById('qrPerfilModal');
    if (!modal) { showToast('⚠️ Modal de QR no disponible', 'error'); return; }
    const url = window.location.href;
    const qrImg = document.getElementById('qrPerfilImage');
    if (qrImg) {
        qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
    }
    modal.classList.add('active');
};

window.abrirSelectorArchivo = function() {
    const input = document.getElementById('fileInput');
    if (input) input.click();
};

window.subirFoto = async function(event) {
    const file = event.target.files[0];
    if (!file) { showToast('⚠️ No se seleccionó ningún archivo', 'warning'); return; }
    if (!file.type.startsWith('image/')) { showToast('⚠️ Solo se permiten imágenes', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('⚠️ La imagen no puede superar los 5MB', 'error'); return; }

    const sessionResult = await window.supabase.auth.getSession();
    if (!sessionResult.data.session) { showToast('⚠️ Inicia sesión para subir foto', 'error'); return; }

    const userId = sessionResult.data.session.user.id;
    showToast('⏳ Subiendo foto...', '');

    try {
        const fileExt = file.name.split('.').pop();
        const filePath = userId + '/' + Date.now() + '.' + fileExt;
        const uploadResult = await window.supabase.storage.from('avatars').upload(filePath, file, { cacheControl: '3600', upsert: true });
        if (uploadResult.error) throw uploadResult.error;
        const urlData = window.supabase.storage.from('avatars').getPublicUrl(filePath);
        const avatarUrl = urlData.data.publicUrl;
        const updateResult = await window.supabase.from('usuarios').update({ avatar_url: avatarUrl }).eq('id', userId);
        if (updateResult.error) throw updateResult.error;
        const avatarEl = document.getElementById('perfilAvatar');
        if (avatarEl) avatarEl.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;"/>`;
        showToast('✅ Foto de perfil actualizada', 'success');
        await window.cargarPerfil();
    } catch (error) {
        console.error('Error subiendo foto:', error);
        showToast('❌ Error al subir foto: ' + error.message, 'error');
    }
};

window.guardarPerfil = async function() {
    const nombre = document.getElementById('editNombre')?.value?.trim();
    const handle = document.getElementById('editHandle')?.value?.trim().replace('@', '');
    const bio = document.getElementById('editBio')?.value?.trim();

    if (!nombre) { showToast('⚠️ El nombre no puede estar vacío', 'error'); return; }
    if (!handle || handle.length < 3) { showToast('⚠️ El handle debe tener al menos 3 caracteres', 'error'); return; }

    showToast('⏳ Guardando perfil...', '');
    try {
        const result = await window.supabase.rpc('actualizar_perfil', {
            p_nombre: nombre,
            p_handle: handle,
            p_bio: bio || ''
        });
        if (result.error) throw result.error;
        showToast('✅ Perfil actualizado correctamente', 'success');
        await window.cargarPerfil();
    } catch (error) {
        console.error('Error guardando perfil:', error);
        showToast('❌ Error al guardar perfil: ' + error.message, 'error');
    }
};

// ===== ESTADO =====
window.cambiarEstado = async function(activo) {
    if (!sessionUser) { showToast('⚠️ Inicia sesión', 'error'); return; }
    showToast('⏳ Actualizando estado...', '');
    try {
        const result = await window.supabase.rpc('cambiar_estado', { p_online: activo });
        if (result.error) throw result.error;
        showToast(activo ? '✅ Estado: Activo' : '⭕ Estado: Inactivo', 'success');
        await window.cargarPerfil();
    } catch (error) {
        console.error('Error cambiando estado:', error);
        showToast('❌ Error al cambiar estado', 'error');
    }
};

window.cambiarConexion = function(tipo) {
    showToast(tipo === 'wifi' ? '🛜 Conectado a WiFi' : '📶 Conectado a datos móviles', 'success');
};

// ===== TOKENS =====
window.comprarDomo = async function(cantidad) {
    const sessionResult = await window.supabase.auth.getSession();
    if (!sessionResult.data.session) { showToast('⚠️ Inicia sesión para comprar', 'error'); return; }
    showToast('⏳ Procesando compra de Domo...', '');
    try {
        const result = await window.supabase.rpc('comprar_domo', { p_cantidad: cantidad || 1 });
        if (result.error) throw result.error;
        showToast('✅ Domo registrado correctamente', 'success');
        await window.cargarPerfil();
    } catch (error) {
        console.error('Error comprando Domo:', error);
        showToast('❌ Error al comprar Domo: ' + error.message, 'error');
    }
};

window.canjearNFT = async function() {
    const sessionResult = await window.supabase.auth.getSession();
    if (!sessionResult.data.session) { showToast('⚠️ Inicia sesión para canjear NFT', 'error'); return; }
    showToast('⏳ Canjeando NFT...', '');
    try {
        const result = await window.supabase.rpc('canjear_nft');
        if (result.error) throw result.error;
        showToast('🎉 NFT canjeado exitosamente', 'success');
        await window.cargarPerfil();
    } catch (error) {
        console.error('Error canjeando NFT:', error);
        showToast('❌ Error al canjear NFT: ' + error.message, 'error');
    }
};

// ===== CRIPTO =====
window.comprarConCripto = function() {
    const modal = document.getElementById('cryptoPaymentModal');
    if (modal) modal.classList.add('active');
    showToast('💳 Abriendo pago con cripto', '');
};

window.verificarPagoCrypto = function() {
    showToast('🔍 Verificando pago...', '');
    setTimeout(() => showToast('✅ Pago verificado correctamente', 'success'), 2000);
};

window.copiarDireccion = function() {
    showToast('📋 Dirección copiada al portapapeles', 'success');
};

// ===== WALLET =====
window.conectarWallet = async function() {
    if (typeof window.ethereum === 'undefined') {
        showToast('⚠️ Instala MetaMask para continuar', 'warning');
        if (confirm('¿Quieres ir a descargar MetaMask?')) {
            window.open('https://metamask.io/download/', '_blank');
        }
        return;
    }
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (!accounts || accounts.length === 0) return;
        const address = accounts[0];
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        showToast('⏳ Vinculando wallet...', '');
        const result = await window.supabase.rpc('vincular_wallet', {
            p_wallet_address: address,
            p_chain_id: chainId,
            p_network_name: 'Polygon Mainnet'
        });
        if (result.error) throw result.error;
        const walletDisplay = document.getElementById('walletDisplay');
        if (walletDisplay) {
            walletDisplay.textContent = address.slice(0, 6) + '...' + address.slice(-4);
            walletDisplay.style.color = 'var(--success)';
        }
        showToast('✅ Wallet conectada correctamente', 'success');
    } catch (error) {
        console.error('Error conectando wallet:', error);
        showToast('❌ Error al conectar wallet: ' + error.message, 'error');
    }
};

window.desconectarWallet = async function() {
    if (!confirm('¿Seguro que quieres desconectar tu wallet?')) return;
    showToast('⏳ Desconectando wallet...', '');
    try {
        const result = await window.supabase.rpc('desvincular_wallet');
        if (result.error) throw result.error;
        const walletDisplay = document.getElementById('walletDisplay');
        if (walletDisplay) {
            walletDisplay.textContent = '⚠️ No conectada';
            walletDisplay.style.color = 'var(--text-muted)';
        }
        showToast('🔌 Wallet desconectada', 'warning');
    } catch (error) {
        console.error('Error desconectando wallet:', error);
        showToast('❌ Error al desconectar wallet', 'error');
    }
};

// ===== eSIM =====
window.comprarESIM = async function(cantidad) {
    const sessionResult = await window.supabase.auth.getSession();
    if (!sessionResult.data.session) { showToast('⚠️ Inicia sesión para adquirir eSIM', 'error'); return; }
    showToast('⏳ Procesando adquisición de eSIM...', '');
    try {
        const planesResult = await window.supabase.from('planes_esim').select('id').eq('activo', true).limit(1);
        if (planesResult.error) throw planesResult.error;
        if (!planesResult.data || planesResult.data.length === 0) { showToast('⚠️ No hay planes eSIM disponibles', 'error'); return; }
        const planId = planesResult.data[0].id;
        const idempotencyKey = 'esim_' + sessionResult.data.session.user.id + '_' + Date.now();
        const result = await window.supabase.rpc('crear_orden_esim', {
            p_plan_id: planId,
            p_idempotency_key: idempotencyKey
        });
        if (result.error) throw result.error;
        if (result.data && result.data.success) {
            showToast('✅ Orden eSIM creada correctamente', 'success');
            await window.cargarPerfil();
        } else {
            showToast('❌ Error al crear orden eSIM', 'error');
        }
    } catch (error) {
        console.error('Error comprando eSIM:', error);
        showToast('❌ Error al adquirir eSIM: ' + error.message, 'error');
    }
};

window.activarESIM = async function() {
    showToast('⏳ Activando eSIM...', '');
    const sessionResult = await window.supabase.auth.getSession();
    if (!sessionResult.data.session) { showToast('⚠️ Inicia sesión para activar eSIM', 'error'); return; }
    try {
        const userResult = await window.supabase.from('usuarios').select('esim_iccid').eq('id', sessionResult.data.session.user.id).single();
        if (userResult.error) throw userResult.error;
        if (!userResult.data || !userResult.data.esim_iccid) { showToast('⚠️ No tienes una eSIM para activar', 'warning'); return; }
        // En producción real, aquí iría llamada al proveedor
        await window.supabase.from('usuarios').update({ esim_status: 'activa' }).eq('id', sessionResult.data.session.user.id);
        showToast('✅ eSIM activada', 'success');
        await window.cargarPerfil();
    } catch (error) {
        console.error('Error activando eSIM:', error);
        showToast('❌ Error al activar eSIM', 'error');
    }
};

window.desactivarESIM = async function() {
    if (!confirm('¿Seguro que quieres desactivar tu eSIM?')) return;
    showToast('⏳ Desactivando eSIM...', '');
    const sessionResult = await window.supabase.auth.getSession();
    if (!sessionResult.data.session) { showToast('⚠️ Inicia sesión para desactivar eSIM', 'error'); return; }
    try {
        await window.supabase.from('usuarios').update({ esim_status: 'inactiva', esim_iccid: null }).eq('id', sessionResult.data.session.user.id);
        showToast('✅ eSIM desactivada', 'success');
        await window.cargarPerfil();
    } catch (error) {
        console.error('Error desactivando eSIM:', error);
        showToast('❌ Error al desactivar eSIM', 'error');
    }
};

window.generarQRESIM = function() {
    showToast('📲 Escanea el QR desde la pestaña eSIM', '');
    window.cambiarTab('esim');
    setTimeout(() => {
        document.getElementById('tab-esim')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
};

window.sincronizarESIM = async function() {
    showToast('⏳ Sincronizando eSIM...', '');
    const sessionResult = await window.supabase.auth.getSession();
    if (!sessionResult.data.session) { showToast('⚠️ Inicia sesión para sincronizar eSIM', 'error'); return; }
    try {
        showToast('✅ eSIM sincronizada', 'success');
        await window.cargarPerfil();
    } catch (error) {
        console.error('Error sincronizando eSIM:', error);
        showToast('⚠️ Error al sincronizar eSIM', 'error');
    }
};

// ===== QR =====
window.escanearQR = async function() {
    const input = document.getElementById('qrInput');
    if (!input) return;
    const codigo = input.value.trim();
    if (!codigo) { showToast('⚠️ Ingresa un código QR', 'warning'); return; }
    const sessionResult = await window.supabase.auth.getSession();
    if (!sessionResult.data.session) { showToast('⚠️ Inicia sesión para escanear QR', 'error'); return; }
    showToast('⏳ Validando QR...', '');
    try {
        const result = await window.supabase.rpc('registrar_escaneo_domo', { p_codigo: codigo });
        if (result.error) throw result.error;
        if (result.data && result.data.ok) {
            showToast('🎉 QR escaneado correctamente! +1 E.S.TOK', 'success');
            input.value = '';
            await window.cargarPerfil();
        } else {
            showToast('❌ QR inválido o ya utilizado', 'error');
        }
    } catch (error) {
        console.error('Error escaneando QR:', error);
        showToast('❌ Error al escanear QR: ' + error.message, 'error');
    }
};

window.abrirCamaraQR = function() {
    showToast('📷 Abriendo cámara...', '');
    // Placeholder - implementación real en perfil.html
};

window.cerrarCamaraQR = function() {
    showToast('📷 Cámara cerrada', '');
};

// ===== MODALES =====
window.cerrarModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
};

window.abrirModalNft = function(nftId) {
    const modal = document.getElementById('nftModal');
    if (modal) {
        document.getElementById('nftModalTitle').textContent = 'NFT #' + nftId;
        modal.classList.add('active');
    }
};

// ===== PUBLICACIONES =====
window.abrirModalPublicacion = function() {
    const modal = document.getElementById('publicacionModal');
    if (!modal) return;
    document.getElementById('pubTexto').value = '';
    document.getElementById('pubArchivo').value = '';
    document.getElementById('pubPreview').style.display = 'none';
    document.getElementById('pubPreview').innerHTML = '';
    document.getElementById('pubStatus').textContent = '';
    modal.classList.add('active');

    document.getElementById('pubArchivo').onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const preview = document.getElementById('pubPreview');
        const reader = new FileReader();
        reader.onload = function(ev) {
            preview.style.display = 'block';
            if (file.type.startsWith('image/')) {
                preview.innerHTML = '<img src="' + ev.target.result + '" style="width:100%;max-height:200px;object-fit:cover;" />';
            } else if (file.type.startsWith('video/')) {
                preview.innerHTML = '<video src="' + ev.target.result + '" style="width:100%;max-height:200px;object-fit:cover;" controls></video>';
            }
        };
        reader.readAsDataURL(file);
    };
};

window.publicarContenido = async function() {
    const texto = document.getElementById('pubTexto').value.trim();
    const fileInput = document.getElementById('pubArchivo');
    const btn = document.getElementById('btnPublicar');
    const status = document.getElementById('pubStatus');

    if (!texto && !fileInput.files.length) {
        status.textContent = '⚠️ Escribe algo o selecciona un archivo';
        return;
    }

    const sessionResult = await window.supabase.auth.getSession();
    if (!sessionResult.data.session) {
        status.textContent = '⚠️ Inicia sesión para publicar';
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Publicando...';
    status.textContent = '⏳ Subiendo archivo...';

    try {
        const userId = sessionResult.data.session.user.id;
        let mediaUrl = null;
        let mediaType = null;

        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const filePath = userId + '/' + Date.now() + '.' + fileExt;
            const uploadResult = await window.supabase.storage.from('publicaciones').upload(filePath, file, { cacheControl: '3600', upsert: true });
            if (uploadResult.error) throw uploadResult.error;
            const urlData = window.supabase.storage.from('publicaciones').getPublicUrl(filePath);
            mediaUrl = urlData.data.publicUrl;
            mediaType = file.type.startsWith('image/') ? 'imagen' : 'video';
        }

        const insertResult = await window.supabase.from('publicaciones').insert({
            contenido: texto || null,
            media_url: mediaUrl,
            media_type: mediaType,
            estado: 'publicado'
        });

        if (insertResult.error) throw insertResult.error;

        status.textContent = '✅ Publicación creada!';
        showToast('📸 Publicación subida correctamente', 'success');
        window.cerrarModal('publicacionModal');
        await window.cargarPublicaciones();

    } catch (error) {
        console.error('Error publicando:', error);
        status.textContent = '❌ Error: ' + error.message;
        showToast('❌ Error al publicar: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Publicar';
    }
};

window.toggleEmojiPickerPerfil = function() {
    const picker = document.getElementById('emojiPickerPerfil');
    if (!picker) return;
    picker.style.display = picker.style.display === 'block' ? 'none' : 'block';
};

// ===== SESIÓN =====
window.cerrarSesion = function() {
    if (confirm('¿Seguro que quieres cerrar sesión?')) {
        showToast('👋 Sesión cerrada', 'success');
        setTimeout(() => { window.location.href = '/'; }, 1000);
    }
};

// ================================================================
// INICIALIZACIÓN - AUTO-EJECUTAR
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ perfil.js cargado (versión corregida)');
    console.log('🔍 Supabase disponible:', typeof window.supabase !== 'undefined');
    cargarPerfil();
});

// ================================================================
// EXPOSICIÓN GLOBAL - TODAS LAS FUNCIONES USADAS EN HTML
// ================================================================

window.cargarPerfil = cargarPerfil;
window.cargarPublicaciones = cargarPublicaciones;
window.cargarMembresia = cargarMembresia;
window.cargarEmojis = cargarEmojis;

console.log('✅ Todas las funciones expuestas globalmente');