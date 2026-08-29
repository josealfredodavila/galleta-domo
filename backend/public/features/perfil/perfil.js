/* ================================================================
   PERFIL.JS - SECCIÓN eSIM/TELNYX CORREGIDA
   REEMPLAZAR LAS FUNCIONES EXISTENTES
   ================================================================ */

// ================================================================
// eSIM - TELNYX FUNCTIONS
// ================================================================

/**
 * Cargar datos reales de eSIM desde el backend
 */
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

        // ✅ Llamar al endpoint unificado /api/esim/profile
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

        // Actualizar UI con datos reales
        actualizarUIESIM({
            esim_iccid: data.iccid,
            esim_status: data.status,
            esim_data_used: data.data_used_gb ? data.data_used_gb * 1024 * 1024 * 1024 : 0,
            esim_data_limit: data.data_limit_gb ? data.data_limit_gb * 1024 * 1024 * 1024 : 0,
            esim_apn: data.apn || 'data00.telnyx',
            esim_activated_at: data.activated_at,
            esim_expires_at: data.expires_at,
            esim_operator: data.operator || 'Telnyx',
            esim_network: data.network || '4G/5G'
        });

        // Mostrar advertencia si hubo error con Telnyx
        if (data.telnyx_error) {
            showToast('⚠️ No se pudo actualizar la información de la eSIM. Mostrando último estado conocido.', 'warning', 5000);
        }

        return data;

    } catch (error) {
        console.error('Error cargando datos eSIM:', error);
        showToast('❌ Error al cargar datos de eSIM: ' + error.message, 'error');
        
        // Intentar cargar datos locales de Supabase como fallback
        await cargarDatosESIMLocal(iccid);
        return null;
    }
}

/**
 * Fallback: Cargar datos locales de Supabase
 */
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

/**
 * Mostrar estado "Sin eSIM"
 */
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

/**
 * Actualizar UI de eSIM con datos reales
 */
function actualizarUIESIM(data) {
    const esimStatus = document.getElementById('esimStatus');
    const esimDataUsed = document.getElementById('esimDataUsed');
    const esimDataLimit = document.getElementById('esimDataLimit');
    const esimDataProgress = document.getElementById('esimDataProgress');
    const esimIccid = document.getElementById('esimIccid');
    const esimApn = document.getElementById('esimApn');
    const esimRestante = document.getElementById('esimDataRestante');

    // Estado
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
        esimStatus.textContent = statusMap[data.esim_status] || data.esim_status || 'Sin eSIM';
        esimStatus.style.color = data.esim_status === 'enabled' || data.esim_status === 'active' 
            ? 'var(--success)' 
            : 'var(--warning)';
    }

    // Datos usados (GB)
    if (esimDataUsed) {
        const used = (data.esim_data_used || 0) / 1024 / 1024 / 1024;
        esimDataUsed.textContent = used.toFixed(2) + ' GB';
    }

    // Límite (GB)
    if (esimDataLimit) {
        const limit = (data.esim_data_limit || 0) / 1024 / 1024 / 1024;
        esimDataLimit.textContent = limit.toFixed(2) + ' GB';
    }

    // Restante (GB)
    if (esimRestante) {
        const usado = (data.esim_data_used || 0) / 1024 / 1024 / 1024;
        const limite = (data.esim_data_limit || 0) / 1024 / 1024 / 1024;
        const restante = Math.max(limite - usado, 0);
        esimRestante.textContent = restante.toFixed(2) + ' GB';
        esimRestante.style.color = restante < 1 ? 'var(--danger)' : 'var(--success)';
    }

    // Barra de progreso
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

    // ICCID
    if (esimIccid) {
        const iccid = data.esim_iccid || 'No asignado';
        esimIccid.textContent = iccid.length > 10 ? iccid.slice(0, 10) + '...' + iccid.slice(-4) : iccid;
    }

    // APN
    if (esimApn) {
        esimApn.textContent = data.esim_apn || 'data00.telnyx';
    }
}

/**
 * Sincronizar eSIM manualmente
 */
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

/**
 * Obtener estado actual de eSIM
 */
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

/**
 * Obtener consumo de datos
 */
async function obtenerUsoESIM() {
    try {
        const session = await getSession();
        if (!session) return null;

        const response = await fetch(`${API_ENDPOINTS.esim}/usage`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();
        return result.success ? result.data : null;

    } catch (error) {
        console.error('Error obteniendo uso:', error);
        return null;
    }
}

// ================================================================
// FUNCIONES PARA EL HTML (Botones de eSIM)
// ================================================================

/**
 * Comprar eSIM - Llama al backend
 */
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

/**
 * Activar eSIM - Llama al backend
 */
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

/**
 * Desactivar eSIM - Llama al backend
 */
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

/**
 * Generar QR de activación eSIM
 */
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

/**
 * Obtener planes eSIM
 */
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