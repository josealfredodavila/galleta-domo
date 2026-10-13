// ================================================================
// PERFIL · TOKENS / NFT / PRO
// ================================================================
// Canjear NFT, estado Pro, contratación de Pro.
// Depende de: perfil-config.js, perfil-utils.js
//
// CAMBIO v4 (depósito dentro de la app):
// - Tras crear el pago, la app muestra monto USDT, red TRON (TRC20),
//   dirección y QR. Ya no depende de la página de NOWPayments, que en
//   pruebas pedía elegir moneda y no ofrecía USDT.
// - Si el servidor no devuelve dirección, se usa payment_url como respaldo.
// - El polling cierra el depósito cuando la membresía queda activa.
// ================================================================

// ================================================================
// PRECIO PRO (fuente: planes_membresia)
// ================================================================
let proPrecioDB = null;

async function cargarPrecioProDB() {
    try {
        if (window.supabaseClient) {
            const { data, error } = await window.supabaseClient
                .from('planes_membresia')
                .select('precio_mxn')
                .eq('id', 'pro')
                .eq('activo', true)
                .maybeSingle();
            if (!error && data && Number.isFinite(Number(data.precio_mxn))) {
                proPrecioDB = Number(data.precio_mxn);
            }
        }
    } catch (e) {
        console.warn('[Perfil] No se pudo leer el precio Pro:', e);
    }
    return proPrecioDB !== null ? proPrecioDB : PRO_PRECIO_MXN;
}

// ================================================================
// TEXTOS CON VARIABLES
// ================================================================
function perfilTConVars(clave, respaldo, vars) {
    let texto = perfilT(clave, respaldo);
    if (vars) {
        Object.keys(vars).forEach(function (nombre) {
            texto = texto.split('{' + nombre + '}').join(String(vars[nombre]));
        });
    }
    return texto;
}

function precioProTexto() {
    const p = proPrecioDB !== null ? proPrecioDB : PRO_PRECIO_MXN;
    return '$' + p + ' MXN';
}

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

        await cargarPrecioProDB();

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
// DEPÓSITO DENTRO DE LA APP (monto, red, dirección y QR)
// ================================================================
function mostrarDepositoPro(data) {
    document.getElementById('depositoProModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'depositoProModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);' +
        'display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;';

    const caja = document.createElement('div');
    caja.style.cssText = 'background:var(--bg-card);border:2px solid var(--gold);border-radius:20px;' +
        'padding:22px;max-width:420px;width:100%;text-align:center;max-height:92vh;overflow-y:auto;';

    const titulo = document.createElement('h3');
    titulo.textContent = '◈ Pago de Sariel\'s Pro';
    titulo.style.cssText = 'color:var(--gold);margin-bottom:12px;';

    const monto = document.createElement('div');
    const cantidad = data.pay_amount ? String(data.pay_amount) : '—';
    monto.textContent = 'Envía exactamente ' + cantidad + ' USDT';
    monto.style.cssText = 'font-weight:700;font-size:1.05rem;margin-bottom:6px;color:var(--text-primary);';

    const red = document.createElement('div');
    red.textContent = 'Red: TRON (TRC20). Solo USDT por esta red.';
    red.style.cssText = 'font-size:0.8rem;color:var(--warning, #f7d44a);margin-bottom:14px;';

    const qrBox = document.createElement('div');
    qrBox.style.cssText = 'margin:0 auto 14px;min-height:200px;display:flex;justify-content:center;align-items:center;';

    const direccion = document.createElement('div');
    direccion.textContent = data.pay_address || '';
    direccion.style.cssText = 'font-family:monospace;font-size:0.78rem;word-break:break-all;' +
        'background:rgba(0,0,0,0.5);border:1px solid var(--line-black);border-radius:10px;padding:10px;margin-bottom:10px;';

    const copiar = document.createElement('button');
    copiar.type = 'button';
    copiar.className = 'btn btn-outline';
    copiar.textContent = 'Copiar dirección';
    copiar.style.cssText = 'width:100%;justify-content:center;margin-bottom:8px;';
    copiar.onclick = async function () {
        try {
            await navigator.clipboard.writeText(data.pay_address || '');
            copiar.textContent = '✓ Copiada';
        } catch (e) {
            copiar.textContent = 'No se pudo copiar';
        }
    };

    const estado = document.createElement('div');
    estado.id = 'depositoProEstado';
    estado.textContent = 'Esperando tu pago… se activa solo al confirmarse.';
    estado.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin:10px 0;';

    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'btn btn-outline';
    cerrar.textContent = 'Cerrar';
    cerrar.style.cssText = 'width:100%;justify-content:center;';
    cerrar.onclick = function () { modal.remove(); };

    caja.append(titulo, monto, red, qrBox, direccion, copiar, estado, cerrar);
    modal.appendChild(caja);
    document.body.appendChild(modal);

    // QR de la dirección (librería qrcode cargada en perfil.html)
    if (data.pay_address && typeof QRCode !== 'undefined' && QRCode.toDataURL) {
        QRCode.toDataURL(data.pay_address, { width: 200, margin: 1 })
            .then(function (url) {
                const img = document.createElement('img');
                img.src = url;
                img.alt = 'QR de pago';
                img.style.cssText = 'width:200px;height:200px;border-radius:10px;background:#fff;padding:6px;';
                qrBox.appendChild(img);
            })
            .catch(function () {
                qrBox.textContent = 'QR no disponible. Copia la dirección.';
            });
    } else {
        qrBox.textContent = 'QR no disponible. Copia la dirección.';
    }
}

// ================================================================
// CONTRATAR PRO (membresía real, con pago directo NOWPayments)
// ================================================================
async function contratarPro() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión') + ' Pro', 'error');
            return;
        }

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

        const precio = await cargarPrecioProDB();

        const confirmMsg = perfilTConVars(
            'perfil_pro_confirmar',
            "¿Contratar Sariel's Pro por {precio} / {dias} días?",
            { precio: '$' + precio + ' MXN', dias: PRO_DURACION_DIAS }
        );
        if (!confirm(confirmMsg)) return;

        showToast('⏳ ' + perfilT('perfil_pro_iniciando', 'Iniciando contratación...'), '', 4000);

        let errorMsg = '';
        try {
            const response = await fetch('/api/payments/membresia/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + session.access_token
                },
                body: JSON.stringify({ privacy_version: '1.0' })
            });

            const result = await response.json().catch(() => ({}));

            if (response.ok && result.success) {
                if (result.pay_address) {
                    // Depósito dentro de la app: no depende de la página de NOWPayments
                    mostrarDepositoPro(result);
                    iniciarPollingPagoPro();
                    return;
                }
                if (result.payment_url) {
                    // Respaldo si el servidor no devolvió dirección
                    window.location.href = result.payment_url;
                    return;
                }
            }

            errorMsg = result.error || ('HTTP ' + response.status);
        } catch (backendError) {
            errorMsg = backendError.message || 'Error de red';
        }

        console.error('[Perfil] Error creando pago Pro:', errorMsg);

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
// POLLING DE PAGO PRO (consulta la membresía real)
// ================================================================
function iniciarPollingPagoPro() {
    if (pollingPagoProInterval) clearInterval(pollingPagoProInterval);
    let intentos = 0;
    const maxIntentos = 120; // 120 × 5 s = 10 min
    pollingPagoProInterval = setInterval(async () => {
        intentos++;
        try {
            const session = await getSession();
            if (session) {
                const { data } = await window.supabaseClient
                    .rpc('obtener_membresia_usuario', { p_usuario_id: session.user.id });
                const m = Array.isArray(data) ? data[0] : data;
                if (m && m.activa) {
                    clearInterval(pollingPagoProInterval);
                    pollingPagoProInterval = null;
                    document.getElementById('depositoProModal')?.remove();
                    showToast(perfilT('perfil_pro_pago_confirmado', '🎉 ¡Pago confirmado! Pro activado'), 'success', 5000);
                    crearConfeti();
                    await cargarEstadoPro();
                    await cargarPerfil(true);
                    return;
                }
            }
        } catch (e) {}
        const estado = document.getElementById('depositoProEstado');
        if (estado && intentos % 6 === 0) {
            estado.textContent = 'Esperando confirmación de la red… puede tardar unos minutos.';
        }
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