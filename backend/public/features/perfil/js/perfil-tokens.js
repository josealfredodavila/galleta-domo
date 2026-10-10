// ================================================================
// PERFIL · TOKENS / NFT / PRO
// ================================================================
// Canjear NFT, estado Pro, contratación de Pro, polling de pago.
// Depende de: perfil-config.js, perfil-utils.js
//
// CAMBIO v2 (traducciones):
// - Textos con perfilT(clave, respaldo) y reemplazo de variables
//   ({precio}, {dias}, {id}).
// - Las fechas usan el idioma actual en lugar de fijar es-MX.
// - Se separaron claves que antes compartían el mismo nombre con
//   textos distintos (por ejemplo, el mensaje de pago).
// ================================================================

// ================================================================
// TEXTOS CON VARIABLES
// ================================================================
// Reemplaza {nombre} dentro de una traducción por su valor.
function perfilTConVars(clave, respaldo, vars) {
    let texto = perfilT(clave, respaldo);
    if (vars) {
        Object.keys(vars).forEach(function (nombre) {
            texto = texto.split('{' + nombre + '}').join(String(vars[nombre]));
        });
    }
    return texto;
}

// Precio de Pro para mostrar en los textos
function precioProTexto() {
    return '$' + PRO_PRECIO_MXN + ' MXN';
}

// Código de idioma actual para formatear fechas
function codigoIdiomaFechas() {
    try {
        if (typeof window.obtenerCodigoIdiomaActual === 'function') {
            return window.obtenerCodigoIdiomaActual();
        }
    } catch (e) {}
    return 'es-MX';
}

// ================================================================
// CARGAR ESTADO PRO (plan, expiración, días restantes)
// ================================================================
async function cargarEstadoPro() {
    try {
        if (!cli()) return;
        const session = await getSession();
        if (!session) return;

        // 1. Intento con RPC específico
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

        // 2. Fallback: leer perfil propio vía RPC seguro
        let usuario = null;
        try {
            const { data, error } = await window.supabaseClient.rpc('mi_perfil_privado');
            if (!error && data) {
                usuario = Array.isArray(data) ? (data.length > 0 ? data[0] : null) : data;
            }
        } catch (rpcErr) {
            console.warn('[Perfil] mi_perfil_privado (pro) falló:', rpcErr);
        }

        if (usuario) {
            let diasRestantes = 0;
            if (usuario.plan_expira_at) {
                const expira = new Date(usuario.plan_expira_at);
                diasRestantes = Math.max(0, Math.ceil((expira - Date.now()) / (1000 * 60 * 60 * 24)));
            }
            aplicarEstadoProUI({
                plan: usuario.plan || perfilT('perfil_pro_gratis', 'Gratis'),
                plan_expira_at: usuario.plan_expira_at,
                plan_meta: usuario.plan_meta || '1 GB · 90 días',
                dias_restantes: diasRestantes
            });
        } else {
            aplicarEstadoProUI({
                plan: perfilT('perfil_pro_gratis', 'Gratis'),
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

    const planActual = usuario.plan || perfilT('perfil_pro_gratis', 'Gratis');
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
            proExpiraEl.textContent = fecha.toLocaleDateString(codigoIdiomaFechas(), {
                day: 'numeric', month: 'long', year: 'numeric'
            }) + (dias > 0 ? ' (' + dias + ' ' + perfilT('perfil_dias', 'días') + ')' : '');
        }
        if (btnContratarPro) {
            btnContratarPro.textContent = '✅ ' + perfilT('perfil_pro_ya_eres', 'Ya eres Pro');
        }
    } else {
        if (proUpgradeCard) proUpgradeCard.style.display = 'block';
        if (proActiveInfo) proActiveInfo.style.display = 'none';
        if (btnContratarPro) {
            btnContratarPro.textContent = '🚀 ' + perfilTConVars(
                'perfil_pro_contratar_btn',
                'Contratar Pro por {precio}',
                { precio: precioProTexto() }
            );
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
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión') + ' Pro', 'error');
            return;
        }

        // Verificar si ya es Pro (lectura segura vía RPC)
        let usuario = null;
        try {
            const { data, error } = await window.supabaseClient.rpc('mi_perfil_privado');
            if (!error && data) {
                usuario = Array.isArray(data) ? (data.length > 0 ? data[0] : null) : data;
            }
        } catch (rpcErr) {
            console.warn('[Perfil] mi_perfil_privado (contratarPro) falló:', rpcErr);
        }

        if (usuario && usuario.plan && usuario.plan.toLowerCase().includes('pro')) {
            const expira = usuario.plan_expira_at
                ? new Date(usuario.plan_expira_at).toLocaleDateString(codigoIdiomaFechas())
                : '';
            showToast('✅ ' + perfilT('perfil_pro_ya_eres', 'Ya eres Pro') + '. ' + expira, 'success', 4000);
            return;
        }

        const confirmMsg = perfilTConVars(
            'perfil_pro_confirmar',
            "¿Contratar Sariel's Pro por {precio} / {dias} días?",
            { precio: precioProTexto(), dias: PRO_DURACION_DIAS }
        );
        if (!confirm(confirmMsg)) return;

        showToast('⏳ ' + perfilT('perfil_pro_iniciando', 'Iniciando contratación...'), '', 4000);

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
                    showToast('💳 ' + perfilT('perfil_pro_completa_pago', 'Completa el pago en la ventana que se abrió'), 'success', 5000);
                    if (pago?.id) iniciarPollingPagoPro(pago.id);
                    return;
                }
            }
        } catch (backendError) {}

        // Si no hay pasarela, activar directo SOLO si es admin
        if (!pasarelaOk) {
            if (perfilCache?.es_admin === true) {
                const activar = confirm(perfilT(
                    'perfil_pro_admin_confirm',
                    'No se pudo conectar con la pasarela de pago. ¿Activar Pro en modo administrador (prueba)?'
                ));
                if (activar) await activarProDirecto(session.user.id);
            } else {
                showToast(perfilT(
                    'perfil_pro_sin_pasarela',
                    '⚠️ No se pudo conectar con la pasarela de pago. Intenta de nuevo en unos minutos.'
                ), 'warning', 6000);
            }
        }
    } catch (error) {
        showToast(perfilT('perfil_error_generico', '❌ Error: ') + msgError(error), 'error');
    }
}

// ================================================================
// ACTIVAR PRO DIRECTO (solo admin, para pruebas)
// ================================================================
async function activarProDirecto(usuarioId) {
    try {
        if (perfilCache?.es_admin !== true) {
            showToast(perfilT('perfil_pro_solo_admin', '⚠️ Solo un administrador puede activar Pro manualmente'), 'warning');
            return;
        }
        showToast('⏳ ' + perfilT('perfil_pro_activando_admin', "Activando Sariel's Pro..."), '', 4000);
        const { data, error } = await window.supabaseClient.rpc('activar_pro', {
            p_usuario_id: usuarioId,
            p_plan_id: PRO_PLAN_ID
        });
        if (error) throw new Error(error.message);
        if (!data || !data.success) throw new Error((data && data.error) || 'No se pudo activar');
        showToast('🎉 ' + perfilT('perfil_pro_activado_ok', "🎉 ¡Sariel's Pro activado!").replace(/^🎉\s*/, ''), 'success', 5000);
        crearConfeti();
        await cargarEstadoPro();
        await cargarPerfil(true);
    } catch (error) {
        showToast(perfilT('perfil_error_activar_pro', '❌ Error al activar Pro: ') + msgError(error), 'error');
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
                showToast(perfilT('perfil_pro_pago_confirmado', '🎉 ¡Pago confirmado! Pro activado'), 'success', 5000);
                crearConfeti();
                await cargarEstadoPro();
                await cargarPerfil(true);
                return;
            }
        } catch (e) {}
        if (intentos >= maxIntentos) {
            clearInterval(pollingPagoProInterval);
            pollingPagoProInterval = null;
            showToast(perfilT(
                'perfil_pro_pago_pendiente',
                '⏳ El pago aún no se confirma. Revísalo más tarde.'
            ), 'warning', 5000);
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
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }
        showToast(perfilT('perfil_nft_verificando', '⏳ Verificando tokens...'), '', 4000);
        const { data, error } = await window.supabaseClient.rpc('canjear_nft');
        if (error) {
            const m = error.message || '';
            if (m.includes('insufficient tokens')) {
                showToast(perfilT('perfil_nft_necesitas', '❌ Necesitas exactamente 12 Es.stoks'), 'error');
            } else if (m.includes('already redeemed')) {
                showToast(perfilT('perfil_nft_ya_canjeado', '⚠️ Ya has canjeado tu NFT'), 'warning');
            } else {
                throw error;
            }
            return;
        }
        showToast(perfilT('perfil_nft_canjeado_toast', '🎁 ¡NFT Canjeado!'), 'success', 8000);
        await cargarPerfil(true);
        mostrarModalNFT(data);
    } catch (error) {
        showToast(perfilT('perfil_error_canjear_nft', '❌ Error al canjear NFT: ') + msgError(error), 'error');
    }
}

// ================================================================
// MODAL NFT (al canjear exitosamente)
// ================================================================
function mostrarModalNFT(data) {
    const modal = document.createElement('div');
    modal.id = 'nftModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; justify-content: center; align-items: center; z-index: 9999;';

    const idNft = (data && data.nft_id) ? data.nft_id : ('NFT-' + Date.now().toString().slice(-6));
    const nftId = escaparHTML(idNft);
    const vigencia = escaparHTML(perfilTConVars('perfil_nft_vigencia', '⏳ Vigencia: {dias} días', { dias: 30 }));
    const idTexto = escaparHTML(perfilTConVars('perfil_nft_id', 'ID: {id}', { id: idNft }));

    modal.innerHTML = '<div style="background: linear-gradient(135deg, var(--bg-card), var(--bg-dark)); border: 2px solid var(--gold); border-radius: 20px; padding: 40px; max-width: 500px; width: 90%; text-align: center;">'
        + '<div style="font-size: 80px; margin-bottom: 20px;">🎁</div>'
        + '<h2 style="color: var(--gold); font-size: 28px; margin-bottom: 10px;">' + escaparHTML(perfilT('perfil_nft_titulo', '¡NFT Canjeado!')) + '</h2>'
        + '<p style="color: var(--text-primary); margin-bottom: 20px; font-size: 18px;">' + escaparHTML(perfilT('perfil_nft_domo_espera', 'Tu Domo físico te espera')) + '</p>'
        + '<div style="background: var(--bg-dark); border-radius: 10px; padding: 15px; margin-bottom: 20px;">'
        + '<p style="color: var(--text-muted); font-size: 14px;">' + vigencia + '</p>'
        + '<p style="color: var(--cyan); font-size: 12px; margin-top: 5px;">' + idTexto + '</p></div>'
        + '<div style="display: flex; gap: 10px; justify-content: center;">'
        + '<button onclick="this.closest(\'#nftModal\').remove()" style="background: linear-gradient(135deg, var(--gold), #f7971e); border: none; color: #fff; padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">'
        + escaparHTML(perfilT('perfil_entendido', '✅ Entendido')) + '</button>'
        + '<button onclick="window.compartirLogro()" style="background: transparent; border: 2px solid var(--cyan); color: var(--cyan); padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">'
        + escaparHTML(perfilT('perfil_nft_btn_compartir', '📤 Compartir')) + '</button>'
        + '</div></div>';

    document.body.appendChild(modal);
    crearConfeti();
}

// ================================================================
// COMPARTIR LOGRO
// ================================================================
function compartirLogro() {
    const texto = perfilT('perfil_nft_texto_compartir', "🎁 ¡Acabo de canjear mi NFT en Sariel's! #Sariels #WEB3 #NFT");
    if (navigator.share) {
        navigator.share({ title: perfilT('perfil_mi_logro', 'Mi logro'), text: texto }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto).then(() => {
            showToast(perfilT('perfil_copiado', '📋 Copiado'), 'success');
        });
    }
}