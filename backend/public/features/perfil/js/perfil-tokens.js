// ================================================================
// PERFIL · TOKENS / NFT / PRO
// ================================================================
// Canjear NFT, estado Pro, contratación de Pro, polling de pago.
// Depende de: perfil-config.js, perfil-utils.js
// ================================================================

// ================================================================
// CARGAR ESTADO PRO (plan, expiración, días restantes)
// ================================================================
async function cargarEstadoPro() {
    try {
        if (!cli()) return;
        const session = await getSession();
        if (!session) return;

        // 1. Intento con RPC
        try {
            const { data, error } = await window.supabaseClient.rpc('obtener_estado_pro');
            if (!error && data && data.success) {
                aplicarEstadoProUI({
                    plan: data.plan,
                    plan_expira_at: data.expira_at || data.expira,
                    plan_meta: data.meta,
                    dias_restantes: data.dias_restantes
                });
                return;
            }
        } catch (rpcErr) {}

        // 2. Fallback: leer tabla directa
        const { data: usuario, error: userErr } = await window.supabaseClient
            .from('usuarios')
            .select('plan, plan_expira_at, plan_meta, membresia_live_hasta')
            .eq('id', session.user.id)
            .maybeSingle();
        if (userErr) return;

        if (usuario) {
            let diasRestantes = 0;
            if (usuario.plan_expira_at) {
                const expira = new Date(usuario.plan_expira_at);
                diasRestantes = Math.max(0, Math.ceil((expira - Date.now()) / (1000 * 60 * 60 * 24)));
            }
            aplicarEstadoProUI({
                plan: usuario.plan || 'Gratis',
                plan_expira_at: usuario.plan_expira_at,
                plan_meta: usuario.plan_meta || '1 GB · 90 días',
                dias_restantes: diasRestantes
            });
        } else {
            aplicarEstadoProUI({
                plan: 'Gratis',
                plan_expira_at: null,
                plan_meta: '1 GB · 90 días',
                dias_restantes: 0
            });
        }
    } catch (error) {}
}

// ================================================================
// APLICAR ESTADO PRO EN LA UI
// ================================================================
function aplicarEstadoProUI(usuario) {
    const planActualEl = document.getElementById('planActual');
    const planMetaEl = document.getElementById('planMeta');
    const proUpgradeCard = document.getElementById('proUpgradeCard');
    const proActiveInfo = document.getElementById('proActiveInfo');
    const proExpiraEl = document.getElementById('proExpira');
    const btnContratarPro = document.getElementById('btnContratarPro');

    const planActual = usuario.plan || 'Gratis';
    const planMeta = usuario.plan_meta || '1 GB · 90 días';
    const esPro = planActual.toLowerCase().includes('pro');

    if (planActualEl) {
        planActualEl.removeAttribute('data-clave');
        planActualEl.textContent = planActual;
    }
    if (planMetaEl) planMetaEl.textContent = traducirPlanMeta(planMeta);

    if (esPro) {
        if (proUpgradeCard) proUpgradeCard.style.display = 'none';
        if (proActiveInfo) proActiveInfo.style.display = 'block';
        if (proExpiraEl && usuario.plan_expira_at) {
            const fecha = new Date(usuario.plan_expira_at);
            const dias = usuario.dias_restantes || 0;
            proExpiraEl.textContent = fecha.toLocaleDateString('es-MX', {
                day: 'numeric', month: 'long', year: 'numeric'
            }) + (dias > 0 ? ' (' + dias + ' ' + t('perfil_dias', 'días') + ')' : '');
        }
        if (btnContratarPro) {
            btnContratarPro.textContent = '✅ ' + t('perfil_pro_ya_eres', 'Ya eres Pro');
        }
    } else {
        if (proUpgradeCard) proUpgradeCard.style.display = 'block';
        if (proActiveInfo) proActiveInfo.style.display = 'none';
        if (btnContratarPro) {
            btnContratarPro.textContent = '🚀 ' + t('perfil_pro_contratar', 'Contratar Pro por $60 MXN');
        }
    }
    aplicarI18NPerfil();
}

// ================================================================
// CONTRATAR PRO
// ================================================================
async function contratarPro() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión') + ' Pro', 'error');
            return;
        }

        // Verificar si ya es Pro
        const { data: usuario } = await window.supabaseClient
            .from('usuarios')
            .select('plan, plan_expira_at')
            .eq('id', session.user.id)
            .maybeSingle();
        if (usuario && usuario.plan && usuario.plan.toLowerCase().includes('pro')) {
            const expira = usuario.plan_expira_at
                ? new Date(usuario.plan_expira_at).toLocaleDateString('es-MX')
                : '';
            showToast('✅ ' + t('perfil_pro_ya_eres', 'Ya eres Pro') + '. ' + expira, 'success', 4000);
            return;
        }

        const confirmMsg = t('perfil_confirmar_pro', '¿Contratar Sariel\'s Pro por $' + PRO_PRECIO_MXN + ' MXN / ' + PRO_DURACION_DIAS + ' días?');
        if (!confirm(confirmMsg)) return;

        showToast('⏳ ' + t('perfil_pro_activando', 'Iniciando contratación...'), '', 4000);

        // Crear registro pendiente en pagos_pro
        let pago = null;
        try {
            const { data, error } = await window.supabaseClient
                .from('pagos_pro')
                .insert({
                    usuario_id: session.user.id,
                    plan_id: PRO_PLAN_ID,
                    monto_mxn: PRO_PRECIO_MXN,
                    estado: 'pendiente',
                    metodo_pago: 'por_definir'
                })
                .select()
                .single();
            if (!error) pago = data;
        } catch (e) {}

        // Intentar llamar al backend de pagos
        let pasarelaOk = false;
        try {
            const response = await fetch(API_ENDPOINTS.pagos + '/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + session.access_token
                },
                body: JSON.stringify({
                    transmisionId: null,
                    monto: PRO_PRECIO_MXN,
                    metodo: 'crypto',
                    tipo: 'membresia_pro',
                    planId: PRO_PLAN_ID,
                    monto_mxn: PRO_PRECIO_MXN,
                    pago_pro_id: pago?.id || null,
                    idempotency_key: 'pro_' + session.user.id + '_' + Date.now()
                })
            });
            let result = null;
            try { result = await response.json(); } catch (e) { result = null; }

            if (response.ok && result && result.success && result.data) {
                if (result.data.payment_url || result.data.pay_address) {
                    pasarelaOk = true;
                    window.open(result.data.payment_url || result.data.pay_address, '_blank');
                    showToast('💳 ' + t('perfil_pro_activando', 'Completa el pago en la ventana que se abrió'), 'success', 5000);
                    if (pago?.id) iniciarPollingPagoPro(pago.id);
                    return;
                }
            }
        } catch (backendError) {}

        // Si no hay pasarela, activar directo SOLO si es admin
        if (!pasarelaOk) {
            if (perfilCache?.es_admin === true) {
                const activar = confirm('No se pudo conectar con la pasarela de pago.\n\n¿Activar Pro en modo administrador (prueba)?');
                if (activar) await activarProDirecto(session.user.id);
            } else {
                showToast('⚠️ No se pudo conectar con la pasarela de pago. Intenta de nuevo en unos minutos.', 'warning', 6000);
            }
        }
    } catch (error) {
        showToast('❌ Error: ' + msgError(error), 'error');
    }
}

// ================================================================
// ACTIVAR PRO DIRECTO (solo admin, para pruebas)
// ================================================================
async function activarProDirecto(usuarioId) {
    try {
        if (perfilCache?.es_admin !== true) {
            showToast('⚠️ Solo un administrador puede activar Pro manualmente', 'warning');
            return;
        }
        showToast('⏳ ' + t('perfil_pro_activando', 'Activando Sariel\'s Pro...'), '', 4000);
        const { data, error } = await window.supabaseClient.rpc('activar_pro', {
            p_usuario_id: usuarioId,
            p_plan_id: PRO_PLAN_ID
        });
        if (error) throw new Error(error.message);
        if (!data || !data.success) throw new Error((data && data.error) || 'No se pudo activar');
        showToast('🎉 ' + t('perfil_pro_activado', "¡Sariel's Pro activado!"), 'success', 5000);
        crearConfeti();
        await cargarEstadoPro();
        await cargarPerfil(true);
    } catch (error) {
        showToast('❌ Error al activar Pro: ' + msgError(error), 'error');
    }
}

// ================================================================
// POLLING DE PAGO PRO (espera confirmación de la pasarela)
// ================================================================
function iniciarPollingPagoPro(pagoProId) {
    if (!pagoProId) return;
    if (pollingPagoProInterval) clearInterval(pollingPagoProInterval);
    let intentos = 0;
    const maxIntentos = 60;
    pollingPagoProInterval = setInterval(async () => {
        intentos++;
        try {
            const { data: pago } = await window.supabaseClient
                .from('pagos_pro')
                .select('estado')
                .eq('id', pagoProId)
                .maybeSingle();
            if (pago && pago.estado === 'completado') {
                clearInterval(pollingPagoProInterval);
                pollingPagoProInterval = null;
                showToast('🎉 ' + t('perfil_pro_activado', '¡Pago confirmado! Pro activado'), 'success', 5000);
                crearConfeti();
                await cargarEstadoPro();
                await cargarPerfil(true);
                return;
            }
        } catch (e) {}
        if (intentos >= maxIntentos) {
            clearInterval(pollingPagoProInterval);
            pollingPagoProInterval = null;
            showToast('⏳ ' + t('perfil_procesando_pago', 'El pago aún no se confirma. Revísalo más tarde.'), 'warning', 5000);
        }
    }, 5000);
}

// ================================================================
// CANJEAR NFT
// ================================================================
async function canjearNFT() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }
        showToast('⏳ Verificando tokens...', '', 4000);
        const { data, error } = await window.supabaseClient.rpc('canjear_nft');
        if (error) {
            const m = error.message || '';
            if (m.includes('insufficient tokens')) showToast('❌ Necesitas exactamente 12 Es.stoks', 'error');
            else if (m.includes('already redeemed')) showToast('⚠️ Ya has canjeado tu NFT', 'warning');
            else throw error;
            return;
        }
        showToast('🎁 ¡NFT Canjeado!', 'success', 8000);
        await cargarPerfil(true);
        mostrarModalNFT(data);
    } catch (error) {
        showToast('❌ Error al canjear NFT: ' + msgError(error), 'error');
    }
}

// ================================================================
// MODAL NFT (al canjear exitosamente)
// ================================================================
function mostrarModalNFT(data) {
    const modal = document.createElement('div');
    modal.id = 'nftModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; justify-content: center; align-items: center; z-index: 9999;';
    const nftId = escaparHTML((data && data.nft_id) ? data.nft_id : ('NFT-' + Date.now().toString().slice(-6)));
    modal.innerHTML = '<div style="background: linear-gradient(135deg, var(--bg-card), var(--bg-dark)); border: 2px solid var(--gold); border-radius: 20px; padding: 40px; max-width: 500px; width: 90%; text-align: center;">'
        + '<div style="font-size: 80px; margin-bottom: 20px;">🎁</div>'
        + '<h2 style="color: var(--gold); font-size: 28px; margin-bottom: 10px;">¡NFT Canjeado!</h2>'
        + '<p style="color: var(--text-primary); margin-bottom: 20px; font-size: 18px;">Tu Domo físico te espera</p>'
        + '<div style="background: var(--bg-dark); border-radius: 10px; padding: 15px; margin-bottom: 20px;">'
        + '<p style="color: var(--text-muted); font-size: 14px;">⏳ Vigencia: 30 días</p>'
        + '<p style="color: var(--cyan); font-size: 12px; margin-top: 5px;">ID: ' + nftId + '</p></div>'
        + '<div style="display: flex; gap: 10px; justify-content: center;">'
        + '<button onclick="this.closest(\'#nftModal\').remove()" style="background: linear-gradient(135deg, var(--gold), #f7971e); border: none; color: #fff; padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">✅ Entendido</button>'
        + '<button onclick="window.compartirLogro()" style="background: transparent; border: 2px solid var(--cyan); color: var(--cyan); padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">📤 Compartir</button>'
        + '</div></div>';
    document.body.appendChild(modal);
    crearConfeti();
}

// ================================================================
// COMPARTIR LOGRO
// ================================================================
function compartirLogro() {
    const texto = "🎁 ¡Acabo de canjear mi NFT en Sariel's! #Sariels #WEB3 #NFT";
    if (navigator.share) {
        navigator.share({ title: "Mi logro", text: texto }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto).then(() => {
            showToast('📋 Copiado', 'success');
        });
    }
}