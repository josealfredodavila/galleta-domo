/* ================================================================
   PERFIL.JS - SARIEL'S ECOSYSTEM
   VERSIÓN PRODUCCIÓN — 100% SUPABASE DIRECTO

   Cambios de esta versión (ver resumen al final del mensaje):
   - Todas las funciones window.* se asignan AL CARGAR el archivo
     (no esperan a Supabase). Los botones responden desde el segundo 0.
   - El cliente de Supabase se toma de window.supabaseClient de forma
     perezosa (cli()), así ninguna función falla si se toca muy pronto.
   - cargarPerfil() lee primero la fila completa de usuarios (todas las
     columnas verificadas en la base) y usa obtener_mi_perfil solo de
     respaldo. Antes el RPC devolvía pocas columnas y el botón de canjear
     NFT, la eSIM y el estado en línea quedaban sin datos.
   - vincular_wallet: una sola firma (p_wallet_address, p_chain_id,
     p_network_name). Se quitó el UPDATE directo a wallet_address porque
     el trigger de protección lo rechaza.
   - Pro: se quitó la activación "manual/prueba" para usuarios normales
     (regalaba Pro). Solo la puede usar un admin (es_admin).
   - Menos consumo de Supabase: sin escrituras cada 10 s, sondeos cada
     60 s solo con la pestaña visible, realtime filtrado.
   - Se inyectan las animaciones CSS que faltaban (toast y confeti).
   ================================================================ */

(function () {
'use strict';

var supabaseClient = null;
var intentosSupabase = 0;
var MAX_INTENTOS_SUPABASE = 100;
var moduloInicializado = false;

var SESSION_TIMEOUT_MS = 15000;

/* Devuelve el cliente de Supabase (lo toma de window si aún no lo teníamos). */
function cli() {
    if (!supabaseClient && window.supabaseClient) supabaseClient = window.supabaseClient;
    return supabaseClient;
}

/* Traduce errores técnicos a mensajes claros. */
function msgError(e) {
    var m = (e && e.message) ? e.message : String(e || 'Error desconocido');
    if (/protected profile field/i.test(m)) return 'Ese dato solo lo puede cambiar el servidor.';
    if (/No autorizado/i.test(m)) return 'No tienes permiso para esta acción.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión con el servidor.';
    return m;
}

/* ================================================================
   ESTILOS QUE FALTABAN (animaciones de toast y confeti)
   ================================================================ */
function asegurarEstilosPerfil() {
    if (document.getElementById('perfilEstilosExtra')) return;
    var s = document.createElement('style');
    s.id = 'perfilEstilosExtra';
    s.textContent =
        '@keyframes slideInRight{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}' +
        '@keyframes slideOutRight{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(20px)}}' +
        '@keyframes confetiFall{to{transform:translateY(105vh) rotate(720deg);opacity:0.9}}';
    (document.head || document.documentElement).appendChild(s);
}

/* ================================================================
   INICIALIZACIÓN DE SUPABASE
   ================================================================ */
function inicializarSupabase() {
    if (moduloInicializado) return;

    if (window.supabaseClient) {
        supabaseClient = window.supabaseClient;
        console.log('[Perfil] ✅ Reutilizando supabaseClient existente.');
        inicializarModuloPerfil();
        return;
    }

    if (window.supabaseReady && typeof window.supabaseReady.then === 'function') {
        window.supabaseReady
            .then(function (client) {
                if (client) {
                    supabaseClient = client;
                    console.log('[Perfil] ✅ supabaseClient obtenido de window.supabaseReady.');
                    inicializarModuloPerfil();
                } else {
                    reintentarSupabase();
                }
            })
            .catch(function (err) {
                console.warn('[Perfil] Error esperando supabaseReady:', err);
                reintentarSupabase();
            });
        return;
    }

    reintentarSupabase();
}

function reintentarSupabase() {
    intentosSupabase++;
    if (intentosSupabase >= MAX_INTENTOS_SUPABASE) {
        console.error('[Perfil] ❌ No se pudo inicializar Supabase (sin cliente).');
        if (typeof window.mostrarErrorEnPantalla === 'function') {
            window.mostrarErrorEnPantalla('No se pudo conectar con la base de datos. Recarga la página.');
        }
        inicializarModuloPerfil();
        return;
    }
    setTimeout(inicializarSupabase, 200);
}

/* ================================================================
   I18N HELPERS
   ================================================================ */
function t(clave, fallback) {
    if (typeof window.tConFallback === 'function') {
        return window.tConFallback(clave, fallback);
    }
    return fallback !== undefined ? fallback : clave;
}

async function aplicarI18NPerfil(raiz) {
    try {
        if (typeof window.aplicarTraducciones === 'function') {
            await window.aplicarTraducciones(raiz || document.body);
        }
    } catch (e) {
        console.warn('[Perfil] I18N re-aplicar:', e);
    }
}

function traducirPlanMeta(meta) {
    if (!meta || typeof meta !== 'string') return meta;
    var diasT = t('perfil_dias', 'días');
    return meta.replace(/\bd[ií]as?\b/gi, diasT);
}

/* ================================================================
   CONSTANTES
   ================================================================ */
const PRO_PLAN_ID = 1;
const PRO_PRECIO_MXN = 60;
const PRO_DURACION_DIAS = 30;

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
    pagos:    `${BACKEND_URL}/api/payments`,
    webhook:  `${BACKEND_URL}/api/webhooks/nowpayments`
};

/* Todas estas columnas existen en public.usuarios (verificado). */
const COLUMNAS_PERFIL = [
    'id', 'email', 'nombre', 'handle', 'username', 'bio', 'avatar_url',
    'portada_url', 'ubicacion', 'sitio_web', 'verificado', 'es_admin',
    'tokens', 'tokens_acumulados', 'progreso_canje', 'puede_canjear',
    'nft_canjeado', 'domos', 'tokens_para_canje',
    'plan', 'plan_expira_at', 'plan_meta', 'membresia_live_hasta',
    'esim_iccid', 'esim_status', 'esim_data_used', 'esim_data_limit', 'esim_apn',
    'esim_imsi', 'esim_msisdn', 'esim_eid', 'esim_type',
    'esim_installation_status', 'esim_status_reason', 'esim_data_unit',
    'esim_last_sync_at', 'esim_last_error', 'esim_activated_at',
    'esim_expires_at', 'esim_operator', 'esim_network',
    'telnyx_sim_id', 'telnyx_connection_id', 'telefono_telnyx',
    'telefono', 'numero_verificado',
    'online', 'ultima_conexion', 'offline_desde',
    'conexion_tipo', 'conexion_activa', 'conexion_velocidad',
    'conexion_senal', 'conexion_ultimo_cambio',
    'wallet_address', 'stripe_account_id',
    'pais_codigo', 'roaming_activo', 'ciudad',
    'minutos_disponibles', 'sms_disponibles',
    'idioma_preferido_id', 'avatar_verificacion_url',
    'seguidores_count', 'siguiendo_count',
    'created_at', 'updated_at'
].join(', ');

/* ================================================================
   TOAST NOTIFICACIONES
   ================================================================ */
function showToast(msg, type, duration) {
    type = type || '';
    duration = duration || 3500;

    var toastEl = document.getElementById('toast');
    if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'toast';
        toastEl.className = 'toast';
        document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = 'toast show';
    toastEl.style.animation = 'none';
    void toastEl.offsetHeight;
    toastEl.style.animation = 'slideInRight 0.3s ease-out';

    if (type === 'error') toastEl.classList.add('error');
    else if (type === 'warning') toastEl.classList.add('warning');
    else if (type === 'success') toastEl.classList.add('success');
    else toastEl.classList.remove('error', 'warning', 'success');

    clearTimeout(toastEl._timeout);
    toastEl._timeout = setTimeout(function () {
        toastEl.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(function () { toastEl.classList.remove('show'); }, 300);
    }, duration);
}

/* ================================================================
   SESIÓN
   ================================================================ */
async function getSession() {
    if (!cli()) return null;

    try {
        const resultado = await Promise.race([
            supabaseClient.auth.getSession(),
            new Promise((resolve) => setTimeout(() => resolve({
                data: null,
                error: new Error('Timeout obteniendo sesión')
            }), SESSION_TIMEOUT_MS))
        ]);

        if (resultado.error) {
            console.error('[Perfil] Error sesión:', resultado.error);
            return null;
        }

        return resultado.data?.session || null;

    } catch (error) {
        console.error('[Perfil] Excepción sesión:', error);
        return null;
    }
}

/* ================================================================
   MEMBRESÍA PRO
   ================================================================ */
async function cargarEstadoPro() {
    try {
        if (!cli()) return;
        const session = await getSession();
        if (!session) return;

        try {
            const { data, error } = await supabaseClient.rpc('obtener_estado_pro');

            if (!error && data && data.success) {
                aplicarEstadoProUI({
                    plan: data.plan,
                    plan_expira_at: data.expira_at || data.expira,
                    plan_meta: data.meta,
                    dias_restantes: data.dias_restantes
                });
                return;
            }
        } catch (rpcErr) {
            console.warn('[Perfil] RPC obtener_estado_pro no disponible:', rpcErr?.message);
        }

        const { data: usuario, error: userErr } = await supabaseClient
            .from('usuarios')
            .select('plan, plan_expira_at, plan_meta, membresia_live_hasta')
            .eq('id', session.user.id)
            .maybeSingle();

        if (userErr) {
            console.warn('[Perfil] Error leyendo plan:', userErr.message);
            return;
        }

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
    } catch (error) {
        console.warn('[Perfil] Error cargando estado Pro:', error?.message);
    }
}

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
        if (btnContratarPro) btnContratarPro.textContent = '✅ ' + t('perfil_pro_ya_eres', 'Ya eres Pro');
    } else {
        if (proUpgradeCard) proUpgradeCard.style.display = 'block';
        if (proActiveInfo) proActiveInfo.style.display = 'none';
        if (btnContratarPro) btnContratarPro.textContent = '🚀 ' + t('perfil_pro_contratar', 'Contratar Pro por $60 MXN');
    }
    aplicarI18NPerfil();
}

async function contratarPro() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión') + ' Pro', 'error');
            return;
        }

        const { data: usuario } = await supabaseClient
            .from('usuarios')
            .select('plan, plan_expira_at')
            .eq('id', session.user.id)
            .maybeSingle();

        if (usuario && usuario.plan && usuario.plan.toLowerCase().includes('pro')) {
            const expira = usuario.plan_expira_at ? new Date(usuario.plan_expira_at).toLocaleDateString('es-MX') : '';
            showToast('✅ ' + t('perfil_pro_ya_eres', 'Ya eres Pro') + '. ' + expira, 'success', 4000);
            return;
        }

        const confirmMsg = t('perfil_confirmar_pro', '¿Contratar Sariel\'s Pro por $' + PRO_PRECIO_MXN + ' MXN / ' + PRO_DURACION_DIAS + ' días?');
        if (!confirm(confirmMsg)) return;

        showToast('⏳ ' + t('perfil_pro_activando', 'Iniciando contratación...'), '', 4000);

        let pago = null;
        try {
            const { data, error } = await supabaseClient
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
        } catch (e) {
            console.warn('[Perfil] No se pudo registrar intento de pago:', e?.message);
        }

        let pasarelaOk = false;
        try {
            const response = await fetch(`${API_ENDPOINTS.pagos}/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    transmisionId: null,
                    monto: PRO_PRECIO_MXN,
                    metodo: 'crypto',
                    tipo: 'membresia_pro',
                    planId: PRO_PLAN_ID,
                    monto_mxn: PRO_PRECIO_MXN,
                    pago_pro_id: pago?.id || null,
                    idempotency_key: `pro_${session.user.id}_${Date.now()}`
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

            console.warn('[Perfil] Backend pagos respondió:', response.status, result);
        } catch (backendError) {
            console.warn('[Perfil] Backend de pagos no disponible:', backendError.message);
        }

        if (!pasarelaOk) {
            /* Activación manual: SOLO administradores (es_admin). */
            if (perfilCache?.es_admin === true) {
                const activar = confirm('No se pudo conectar con la pasarela de pago.\n\n¿Activar Pro en modo administrador (prueba)?');
                if (activar) await activarProDirecto(session.user.id);
            } else {
                showToast('⚠️ No se pudo conectar con la pasarela de pago. Intenta de nuevo en unos minutos.', 'warning', 6000);
            }
        }

    } catch (error) {
        console.error('[Perfil] Error contratando Pro:', error);
        showToast('❌ Error: ' + msgError(error), 'error');
    }
}

/* Solo admin. Usa el RPC (sin UPDATE directo a usuarios ni a pagos_pro). */
async function activarProDirecto(usuarioId) {
    try {
        if (perfilCache?.es_admin !== true) {
            showToast('⚠️ Solo un administrador puede activar Pro manualmente', 'warning');
            return;
        }
        showToast('⏳ ' + t('perfil_pro_activando', 'Activando Sariel\'s Pro...'), '', 4000);

        const { data, error } = await supabaseClient.rpc('activar_pro', {
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
        console.error('[Perfil] Error activando Pro:', error);
        showToast('❌ Error al activar Pro: ' + msgError(error), 'error');
    }
}

let pollingPagoProInterval = null;
function iniciarPollingPagoPro(pagoProId) {
    if (!pagoProId) return;
    if (pollingPagoProInterval) clearInterval(pollingPagoProInterval);

    let intentos = 0;
    const maxIntentos = 60;

    pollingPagoProInterval = setInterval(async () => {
        intentos++;

        try {
            const { data: pago } = await supabaseClient
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
        } catch (e) {
            console.warn('[Perfil] Polling pago Pro:', e?.message);
        }

        if (intentos >= maxIntentos) {
            clearInterval(pollingPagoProInterval);
            pollingPagoProInterval = null;
            showToast('⏳ ' + t('perfil_procesando_pago', 'El pago aún no se confirma. Revísalo más tarde.'), 'warning', 5000);
        }
    }, 5000);
}

/* ================================================================
   NAVEGACIÓN
   ================================================================ */
function cambiarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const tabContent = document.getElementById('tab-' + tab);
    if (tabContent) {
        tabContent.classList.add('active');
        tabContent.style.animation = 'fadeIn 0.3s ease-out';
    }
    const tabBtn = document.querySelector(`.tab-btn[onclick*="'${tab}'"]`);
    if (tabBtn) tabBtn.classList.add('active');
}

/* ================================================================
   FORMATEO DE TEXTO (con escape de HTML para evitar XSS)
   ================================================================ */
function escaparHTML(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatearTexto(texto) {
    if (!texto) return '';
    return escaparHTML(texto)
        .replace(/#(\w+)/g, '<a href="/features/muro/muro.html?tag=$1" class="hashtag" style="color:var(--gold);text-decoration:none;font-weight:600;">#$1</a>')
        .replace(/@(\w+)/g, '<a href="/perfil/$1" class="mencion" style="color:var(--cyan);text-decoration:none;font-weight:600;">@$1</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<em>$1</em>')
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        .replace(/`(.*?)`/g, '<code style="background:var(--bg-card);padding:2px 6px;border-radius:4px;font-family:monospace;">$1</code>');
}

/* ================================================================
   CACHE DE PERFIL
   ================================================================ */
let perfilCache = null;
let ultimaActualizacion = 0;
const CACHE_DURATION = 30000;
let contadoresSocialesCache = null;
let ultimaActualizacionContadores = 0;
const CONTADORES_CACHE_DURATION = 5 * 60 * 1000;

try {
    Object.defineProperty(window, 'perfilCache', {
        get: function () { return perfilCache; },
        set: function (v) { perfilCache = v; },
        configurable: true
    });
} catch (e) {
    window.perfilCache = perfilCache;
}

function perfilBasico(session) {
    return {
        id: session.user.id,
        email: session.user.email,
        nombre: session.user.user_metadata?.nombre || t('perfil_nombre_usuario', 'Explorador'),
        handle: session.user.email?.split('@')[0] || 'explorador',
        bio: t('perfil_biografia_default', "Explorando el ecosistema Sariel's · WEB3 · Comunidad"),
        avatar_url: null,
        tokens: 0,
        online: true
    };
}

/* ================================================================
   CARGAR PERFIL
   ================================================================ */
async function cargarPerfil(forzarActualizacion = false) {
    try {
        if (!cli()) {
            console.warn('[Perfil] supabaseClient no disponible');
            return;
        }

        const session = await getSession();
        if (!session) {
            console.warn('[Perfil] Sin sesión → redirigiendo al index');
            window.location.replace('/');
            return;
        }

        const ahora = Date.now();
        if (!forzarActualizacion && perfilCache && (ahora - ultimaActualizacion) < CACHE_DURATION) {
            actualizarUI(perfilCache);
            return;
        }

        let perfil = null;

        /* 1) Fila completa de usuarios */
        try {
            const { data, error } = await supabaseClient
                .from('usuarios')
                .select(COLUMNAS_PERFIL)
                .eq('id', session.user.id)
                .maybeSingle();
            if (error) console.warn('[Perfil] SELECT usuarios falló:', error.message);
            else perfil = data;
        } catch (e) {
            console.warn('[Perfil] SELECT usuarios excepción:', e?.message);
        }

        /* 2) Respaldo: RPC obtener_mi_perfil */
        if (!perfil) {
            try {
                const { data, error } = await supabaseClient.rpc('obtener_mi_perfil');
                if (!error && data) {
                    perfil = Array.isArray(data) ? (data.length > 0 ? data[0] : null) : data;
                }
            } catch (rpcErr) {
                console.warn('[Perfil] RPC obtener_mi_perfil falló:', rpcErr?.message);
            }
        }

        /* 3) Último recurso: datos de la sesión */
        if (!perfil) perfil = perfilBasico(session);

        perfilCache = perfil;
        window.perfilCache = perfil;
        ultimaActualizacion = ahora;

        await actualizarEstadoEnLinea(true);
        actualizarUI(perfil);

        if (perfil.esim_iccid) {
            await cargarDatosESIM(perfil.esim_iccid);
        }

        Promise.all([
            cargarEstadoConexion(),
            cargarAmigosEnLinea(),
            cargarHistorialQR(),
            cargarEstadoPro(),
            cargarContadoresSociales(session.user.id)
        ]).catch(err => console.warn('[Perfil] Error en cargas paralelas:', err?.message));

        await aplicarI18NPerfil();

    } catch (error) {
        console.error('[Perfil] Error cargando perfil:', error);
        showToast('❌ Error al cargar perfil', 'error');
    }
}

/* ================================================================
   ESTADO ONLINE
   ================================================================ */
async function actualizarEstadoEnLinea(online) {
    try {
        const session = await getSession();
        if (!session) return false;

        const ahora = new Date().toISOString();

        const { error } = await supabaseClient
            .from('usuarios')
            .update({
                online: online === true,
                ultima_conexion: ahora,
                offline_desde: online ? null : ahora
            })
            .eq('id', session.user.id);

        if (error) {
            console.warn('[Perfil] Error actualizando estado:', error.message);
            return false;
        }

        if (perfilCache) {
            perfilCache.online = online;
            perfilCache.ultima_conexion = ahora;
        }

        actualizarUIEstado(online);
        return true;
    } catch (error) {
        console.error('[Perfil] Error actualizando estado en línea:', error);
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
        estadoTexto.removeAttribute('data-clave');
        estadoTexto.setAttribute('data-no-traducir', '1');
        estadoTexto.textContent = online
            ? t('perfil_activo_ahora', 'Activo ahora')
            : t('perfil_inactivo', 'Inactivo');
        estadoTexto.style.color = online ? 'var(--success)' : 'var(--text-muted)';
    }
}

let tiempoInactividad = 0;
let maxInactividad = 300000;
let detectorInactividadIniciado = false;

function iniciarDetectorInactividad() {
    if (detectorInactividadIniciado) return;
    detectorInactividadIniciado = true;

    const resetInactividad = () => {
        tiempoInactividad = 0;
        if (perfilCache && !perfilCache.online) {
            actualizarEstadoEnLinea(true);
        }
    };

    const eventos = ['mousemove', 'mousedown', 'click', 'scroll', 'keydown', 'touchstart', 'touchmove'];
    eventos.forEach(evento => {
        document.addEventListener(evento, resetInactividad, { passive: true });
    });

    setInterval(async () => {
        tiempoInactividad += 30000;

        if (tiempoInactividad >= maxInactividad && perfilCache && perfilCache.online) {
            await actualizarEstadoEnLinea(false);
            showToast('⭕ ' + t('perfil_inactivo', 'Inactivo'), 'warning');
        }
    }, 30000);
}

async function cambiarEstado(online) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        const ok = await actualizarEstadoEnLinea(online);
        if (!ok) {
            showToast('❌ No se pudo cambiar el estado', 'error');
            return;
        }

        if (online) {
            showToast('🟢 ' + t('perfil_activo_ahora', 'Activo ahora'), 'success');
        } else {
            showToast('⭕ ' + t('perfil_inactivo', 'Inactivo'), 'warning');
        }

        await notificarCambioEstado(online);

    } catch (error) {
        console.error('[Perfil] Error cambiando estado:', error);
        showToast('❌ Error al cambiar estado', 'error');
    }
}

/* ================================================================
   AMIGOS EN TIEMPO REAL
   ================================================================ */
let canalAmigos = null;
let idsAmigos = new Set();
let temporizadorAmigos = null;

function iniciarEscuchaAmigos() {
    if (!cli()) return;
    if (canalAmigos) {
        try { supabaseClient.removeChannel(canalAmigos); } catch (e) {}
    }

    canalAmigos = supabaseClient
        .channel('amigos_online')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'usuarios'
        }, (payload) => {
            const usuario = payload.new;
            /* Solo refrescar si el cambio es de uno de mis contactos */
            if (usuario && usuario.id !== perfilCache?.id && idsAmigos.has(usuario.id)) {
                clearTimeout(temporizadorAmigos);
                temporizadorAmigos = setTimeout(actualizarListaAmigos, 2000);
            }
        })
        .subscribe();

    return canalAmigos;
}

async function cargarAmigosEnLinea() {
    try {
        const session = await getSession();
        if (!session) return null;

        const { data: contactos, error: contactosError } = await supabaseClient
            .from('contactos')
            .select('contacto_id, es_favorito, estado')
            .eq('usuario_id', session.user.id);

        if (contactosError) {
            console.warn('[Perfil] Error contactos:', contactosError.message);
            actualizarUIAmigos([], []);
            return null;
        }

        if (!contactos || contactos.length === 0) {
            idsAmigos = new Set();
            actualizarUIAmigos([], []);
            return { enLinea: [], todosContactos: [] };
        }

        const idsContactos = contactos
            .map(c => c?.contacto_id)
            .filter(Boolean);

        idsAmigos = new Set(idsContactos);

        if (idsContactos.length === 0) {
            actualizarUIAmigos([], []);
            return { enLinea: [], todosContactos: [] };
        }

        let todosContactos = [];

        try {
            const { data, error } = await supabaseClient
                .from('perfiles_publicos')
                .select('id, nombre, handle, avatar_url, online, ultima_conexion')
                .in('id', idsContactos);

            if (error) throw error;
            todosContactos = data || [];
        } catch (e) {
            console.warn('[Perfil] perfiles_publicos no disponible, usando usuarios:', e?.message);
            const { data, error } = await supabaseClient
                .from('usuarios')
                .select('id, nombre, handle, avatar_url, online, ultima_conexion')
                .in('id', idsContactos);
            if (error) {
                console.warn('[Perfil] Error usuarios fallback:', error.message);
                todosContactos = [];
            } else {
                todosContactos = data || [];
            }
        }

        const enLinea = todosContactos.filter(u => u.online === true);

        actualizarUIAmigos(todosContactos, enLinea);
        return { enLinea, todosContactos };

    } catch (error) {
        console.error('[Perfil] Error cargando amigos en línea:', error);
        actualizarUIAmigos([], []);
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
        container.innerHTML =
            '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.8rem;">'
                + '<span style="font-size:2rem;">👥</span>'
                + '<p style="margin-top:8px;">Aún no tienes amigos agregados</p>'
                + '<p style="font-size:0.6rem;">Explora el muro para conectar con otros</p>'
            + '</div>';
        aplicarI18NPerfil(container);
        return;
    }

    const enLineaIds = new Set(enLinea.map(a => a.id));
    const ordenados = [
        ...todosAmigos.filter(a => enLineaIds.has(a.id)),
        ...todosAmigos.filter(a => !enLineaIds.has(a.id))
    ];

    const activoAhoraT = t('perfil_activo_ahora', 'Activo ahora');
    const desconectadoT = t('perfil_desconectado', 'Desconectado');
    const enLineaT = t('perfil_en_linea', 'EN LÍNEA');

    container.innerHTML = ordenados.map(amigo => {
        const estaEnLinea = enLineaIds.has(amigo.id);
        const estadoTxt = estaEnLinea ? '🟢 ' + activoAhoraT : '⭕ ' + desconectadoT;
        const handleSafe = encodeURIComponent(String(amigo.handle || amigo.id || ''));
        const nombreSafe = escaparHTML(amigo.nombre || amigo.handle || '');
        const avatarSafe = amigo.avatar_url ? escaparHTML(amigo.avatar_url) : '';
        return ''
            + '<div class="amigo-item ' + (estaEnLinea ? 'online' : '') + '" onclick="window.location.href=\'/perfil/' + handleSafe + '\'">'
                + '<div class="avatar-mini">' + (avatarSafe ? '<img src="' + avatarSafe + '">' : '◈') + '</div>'
                + '<div class="info">'
                    + '<div class="nombre" style="color:' + (estaEnLinea ? 'var(--text-primary)' : 'var(--text-muted)') + '">' + nombreSafe + '</div>'
                    + '<div class="estado" style="color:' + (estaEnLinea ? 'var(--success)' : 'var(--text-muted)') + '">'
                        + estadoTxt
                        + (!estaEnLinea && amigo.ultima_conexion ? ' · ' + haceTiempo(amigo.ultima_conexion) : '')
                    + '</div>'
                + '</div>'
                + (estaEnLinea ? '<div class="badge-online">' + enLineaT + '</div>' : '')
            + '</div>';
    }).join('');
}

async function actualizarListaAmigos() {
    await cargarAmigosEnLinea();
}

async function notificarCambioEstado(online) {
    try {
        const session = await getSession();
        if (!session) return;

        const { data: contactos, error } = await supabaseClient
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id);

        if (error || !contactos || contactos.length === 0) return;

        const nombre = perfilCache?.nombre || 'Un usuario';
        const estado = online ? '🟢 ' + t('perfil_activo_ahora', 'activo') : '⭕ ' + t('perfil_desconectado', 'inactivo');

        const notifs = contactos.map(c => ({
            user_id: c.contacto_id,
            tipo: 'estado',
            mensaje: `${nombre} ${estado}`,
            emisor_id: session.user.id,
            leida: false,
            fecha: new Date().toISOString()
        }));

        for (let i = 0; i < notifs.length; i += 50) {
            await supabaseClient.from('notificaciones').insert(notifs.slice(i, i + 50));
        }

    } catch (error) {
        console.error('[Perfil] Error notificando cambio de estado:', error);
    }
}

function haceTiempo(fecha) {
    if (!fecha) return '';
    const ahora = new Date();
    const entonces = new Date(fecha);
    const diffMs = ahora - entonces;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffMin < 1440) return `hace ${Math.floor(diffMin / 60)} h`;
    return `hace ${Math.floor(diffMin / 1440)} d`;
}

/* ================================================================
   CONTADORES SOCIALES
   ================================================================ */
async function cargarContadoresSociales(usuarioId) {
    try {
        if (!usuarioId) return;
        if (!cli()) return;

        const ahora = Date.now();
        if (contadoresSocialesCache && (ahora - ultimaActualizacionContadores) < CONTADORES_CACHE_DURATION) {
            aplicarContadoresSociales(contadoresSocialesCache);
            return;
        }

        try {
            const { data: usuario, error } = await supabaseClient
                .from('usuarios')
                .select('seguidores_count, siguiendo_count')
                .eq('id', usuarioId)
                .maybeSingle();

            if (!error && usuario &&
                (typeof usuario.seguidores_count === 'number' || typeof usuario.siguiendo_count === 'number')) {
                contadoresSocialesCache = {
                    seguidores: usuario.seguidores_count || 0,
                    siguiendo: usuario.siguiendo_count || 0
                };
                ultimaActualizacionContadores = ahora;
                aplicarContadoresSociales(contadoresSocialesCache);
                return;
            }
        } catch (e) {}

        const [seguidoresRes, siguiendoRes] = await Promise.all([
            supabaseClient
                .from('contactos')
                .select('*', { count: 'exact', head: true })
                .eq('contacto_id', usuarioId),
            supabaseClient
                .from('contactos')
                .select('*', { count: 'exact', head: true })
                .eq('usuario_id', usuarioId)
        ]);

        contadoresSocialesCache = {
            seguidores: seguidoresRes.count || 0,
            siguiendo: siguiendoRes.count || 0
        };
        ultimaActualizacionContadores = ahora;
        aplicarContadoresSociales(contadoresSocialesCache);

    } catch (error) {
        console.warn('[Perfil] Error contadores sociales:', error?.message);
    }
}

function aplicarContadoresSociales(c) {
    const segEl = document.getElementById('statSeguidores');
    const sigEl = document.getElementById('statSiguiendo');
    if (segEl) segEl.textContent = String(c?.seguidores ?? 0);
    if (sigEl) sigEl.textContent = String(c?.siguiendo ?? 0);
}

/* ================================================================
   GESTIÓN DE CONEXIÓN
   ================================================================ */
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

/* Solo se escribe en la base cuando cambia el tipo o la disponibilidad. */
let ultimaClaveConexionGuardada = '';

async function cargarEstadoConexion() {
    try {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

        if (connection) {
            const velocidad = connection.downlink ? `${connection.downlink} Mbps` : '0 Mbps';

            let tipoConexion = 'wifi';
            if (connection.type) {
                if (connection.type === 'cellular' || connection.type === '4g' || connection.type === '3g') {
                    tipoConexion = 'datos';
                }
            } else if (connection.downlink && connection.downlink < 10) {
                tipoConexion = 'datos';
            }

            if (perfilCache?.conexion_tipo) {
                tipoConexion = perfilCache.conexion_tipo;
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
            estadoConexion = { ...estadoConexion, activa: navigator.onLine };
            actualizarUIConexion(estadoConexion);
        }

        return estadoConexion;

    } catch (error) {
        console.error('[Perfil] Error cargando estado de conexión:', error);
        estadoConexion = { ...estadoConexion, activa: navigator.onLine };
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
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        if (tipo === 'datos') {
            const perfil = getPerfilActual();
            if (!perfil || !perfil.esim_iccid) {
                showToast('⚠️ No tienes una eSIM activa. Compra una primero.', 'warning');
                return;
            }
            if (perfil.esim_status !== 'enabled' && perfil.esim_status !== 'active') {
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
        ultimaClaveConexionGuardada = tipo + '|true';

        if (perfilCache) {
            perfilCache.conexion_tipo = tipo;
            perfilCache.conexion_activa = true;
        }

        actualizarUIConexion(estadoConexion);

        if (tipo === 'wifi') {
            showToast('🛜 ' + t('perfil_conexion_wifi', 'WiFi'), 'success');
        } else {
            showToast('📶 ' + t('perfil_conexion_datos', 'Datos'), 'success');
        }

        if (tipo === 'datos') {
            await cargarDatosESIM(perfilCache?.esim_iccid);
        }

    } catch (error) {
        console.error('[Perfil] Error cambiando conexión:', error);
        showToast('❌ Error al cambiar conexión: ' + msgError(error), 'error');
    }
}

function getPerfilActual() {
    return perfilCache;
}

async function guardarEstadoConexion(estado) {
    try {
        const clave = estado.tipo + '|' + estado.activa;
        if (clave === ultimaClaveConexionGuardada) return;

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

        if (!error) ultimaClaveConexionGuardada = clave;

    } catch (error) {
        console.warn('[Perfil] Error guardando estado de conexión:', error?.message);
    }
}

function actualizarUIConexion(estado) {
    const conexionStatus = document.getElementById('conexionStatus');
    const conexionTipo = document.getElementById('conexionTipo');
    const conexionVelocidad = document.getElementById('conexionVelocidad');
    const conexionSeñal = document.getElementById('conexionSeñal');
    const wifiBtn = document.getElementById('btnWifi');
    const datosBtn = document.getElementById('btnDatos');
    const conexionOperador = document.getElementById('conexionOperador');

    const wifiT = t('perfil_conexion_wifi', 'WiFi');
    const datosT = t('perfil_conexion_datos', 'Datos');

    if (conexionStatus) {
        conexionStatus.removeAttribute('data-clave');
        conexionStatus.setAttribute('data-no-traducir', '1');
        if (!estado.activa) {
            conexionStatus.innerHTML = '⛔ Sin conexión';
            conexionStatus.style.color = 'var(--danger)';
        } else if (estado.tipo === 'wifi') {
            conexionStatus.innerHTML = '🛜 ' + wifiT;
            conexionStatus.style.color = 'var(--success)';
        } else {
            conexionStatus.innerHTML = '📶 ' + datosT;
            conexionStatus.style.color = 'var(--cyan)';
        }
    }

    if (conexionTipo) {
        conexionTipo.textContent = estado.tipo === 'wifi' ? '🛜 ' + wifiT : '📶 ' + datosT;
    }

    if (conexionVelocidad) {
        conexionVelocidad.textContent = estado.velocidad;
    }

    if (conexionSeñal) {
        const barras = Math.round((estado.señal / 100) * 4);
        conexionSeñal.textContent = '█'.repeat(barras) + '░'.repeat(4 - barras);
        conexionSeñal.style.color = estado.señal > 50 ? 'var(--success)' : 'var(--warning)';
    }

    if (conexionOperador) {
        conexionOperador.textContent = estado.operador || "Sariel's Net";
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

let escuchaConexionIniciada = false;
function iniciarEscuchaConexion() {
    if (escuchaConexionIniciada) return;
    escuchaConexionIniciada = true;

    window.addEventListener('online', () => {
        estadoConexion.activa = true;
        actualizarUIConexion(estadoConexion);
        guardarEstadoConexion(estadoConexion);
        showToast('🛜 ' + t('perfil_conexion', 'Conexión'), 'success');
    });

    window.addEventListener('offline', () => {
        estadoConexion.activa = false;
        actualizarUIConexion(estadoConexion);
        showToast('⛔ Sin conexión', 'error');
    });

    if (navigator.connection && navigator.connection.addEventListener) {
        navigator.connection.addEventListener('change', async () => {
            await cargarEstadoConexion();
        });
    }
}

/* ================================================================
   eSIM
   ================================================================ */
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
        const st = data.esim_status;
        esimStatus.textContent = st ? (statusMap[st] || st) : '⏳ Sin eSIM';
        esimStatus.style.color = (st === 'enabled' || st === 'active')
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
        esimIccid.removeAttribute('data-clave');
        const iccid = data.esim_iccid || t('perfil_no_asignado', 'No asignado');
        esimIccid.textContent = iccid.length > 10 ? iccid.slice(0, 10) + '...' + iccid.slice(-4) : iccid;
    }

    if (esimApn) {
        esimApn.textContent = data.esim_apn || 'data00.telnyx';
    }
}

function mostrarSinESIM() {
    actualizarUIESIM({
        esim_iccid: null,
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
        mostrarSinESIM();
        return null;
    }

    try {
        const session = await getSession();
        if (!session) return null;

        const { data: usuario, error } = await supabaseClient
            .from('usuarios')
            .select('esim_iccid, esim_status, esim_data_used, esim_data_limit, esim_apn, esim_activated_at, esim_expires_at, esim_operator, esim_network, esim_last_sync_at, esim_last_error, esim_imsi, esim_msisdn, esim_eid, esim_type, esim_installation_status, esim_status_reason, esim_data_unit')
            .eq('id', session.user.id)
            .maybeSingle();

        if (error) {
            console.warn('[Perfil] Error leyendo eSIM:', error.message);
            return null;
        }

        if (!usuario || !usuario.esim_iccid) {
            mostrarSinESIM();
            return null;
        }

        if (perfilCache) Object.assign(perfilCache, usuario);

        actualizarUIESIM({
            esim_iccid: usuario.esim_iccid,
            esim_status: usuario.esim_status,
            esim_data_used: usuario.esim_data_used || 0,
            esim_data_limit: usuario.esim_data_limit || 0,
            esim_apn: usuario.esim_apn || 'data00.telnyx'
        });

        return usuario;

    } catch (error) {
        console.error('[Perfil] Error cargando datos eSIM:', error);
        mostrarSinESIM();
        return null;
    }
}

async function sincronizarESIM() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        showToast('⏳ ' + t('perfil_sincronizando', 'Sincronizando...'), '', 3000);

        const { data: usuario, error } = await supabaseClient
            .from('usuarios')
            .select('esim_iccid, esim_status, esim_data_used, esim_data_limit, esim_apn, esim_last_sync_at')
            .eq('id', session.user.id)
            .maybeSingle();

        if (error) throw error;

        if (usuario && usuario.esim_iccid) {
            if (perfilCache) Object.assign(perfilCache, usuario);
            actualizarUIESIM(usuario);
            showToast('✅ ' + t('perfil_sincronizar', 'Datos sincronizados'), 'success');
        } else {
            mostrarSinESIM();
            showToast('⚠️ No tienes eSIM asignada', 'warning');
        }

    } catch (error) {
        console.error('[Perfil] Error sincronizando eSIM:', error);
        showToast('❌ Error al sincronizar: ' + msgError(error), 'error');
    }
}

async function comprarESIM(planId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        const { data: plan, error } = await supabaseClient
            .from('planes_esim')
            .select('*')
            .eq('id', planId)
            .maybeSingle();

        if (error || !plan) {
            showToast('❌ Plan no encontrado', 'error');
            return;
        }

        showToast('⏳ Creando orden de compra...', '', 5000);

        const response = await fetch(`${API_ENDPOINTS.pagos}/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                transmisionId: null,
                monto: Number(plan.precio_mxn) || 0,
                metodo: 'crypto',
                tipo: 'esim',
                planId: plan.id,
                idempotency_key: `esim_${session.user.id}_${planId}_${Date.now()}`
            })
        });

        let result = null;
        try { result = await response.json(); } catch (e) { result = null; }

        if (!response.ok || !result || !result.success) {
            throw new Error((result && result.error) || 'Error al crear la orden (' + response.status + ')');
        }

        if (result.data && result.data.payment_url) {
            mostrarModalPagoReal(result.data.payment_url, result.data.id, plan);
        } else {
            const qrData = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('Orden: ' + (result.data?.id || ''))}`;
            mostrarModalPagoSimulado(qrData, result.data?.id, plan);
        }

    } catch (error) {
        console.error('[Perfil] Error comprando eSIM:', error);
        showToast('❌ Error al comprar eSIM: ' + msgError(error), 'error');
    }
}

/* Cambiar esim_status está protegido en la base: solo el servidor puede hacerlo.
   Se intenta y, si la base lo rechaza, se avisa con un mensaje claro. */
async function activarESIM(iccid) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        const iccidParam = iccid || perfilCache?.esim_iccid;
        if (!iccidParam) {
            showToast('⚠️ No hay eSIM para activar', 'error');
            return;
        }

        showToast('⏳ Activando eSIM...', '', 5000);

        const { error } = await supabaseClient
            .from('usuarios')
            .update({
                esim_status: 'enabled',
                esim_last_sync_at: new Date().toISOString()
            })
            .eq('id', session.user.id);

        if (error) throw error;

        showToast('✅ eSIM activada correctamente', 'success');
        await cargarPerfil(true);

    } catch (error) {
        console.error('[Perfil] Error activando eSIM:', error);
        showToast('❌ No se pudo activar la eSIM: ' + msgError(error), 'error', 5000);
    }
}

async function desactivarESIM(iccid) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        const iccidParam = iccid || perfilCache?.esim_iccid;
        if (!iccidParam) {
            showToast('⚠️ No hay eSIM para desactivar', 'error');
            return;
        }

        const confirmMsg = t('perfil_confirmar_desactivar_esim', '¿Seguro que quieres desactivar tu eSIM?');
        if (!confirm(confirmMsg)) return;

        showToast('⏳ Desactivando eSIM...', '', 5000);

        const { error } = await supabaseClient
            .from('usuarios')
            .update({
                esim_status: 'disabled',
                esim_last_sync_at: new Date().toISOString()
            })
            .eq('id', session.user.id);

        if (error) throw error;

        showToast('🔌 eSIM desactivada', 'warning');
        await cargarPerfil(true);

    } catch (error) {
        console.error('[Perfil] Error desactivando eSIM:', error);
        showToast('❌ No se pudo desactivar la eSIM: ' + msgError(error), 'error', 5000);
    }
}

async function generarQRESIM(iccid) {
    try {
        const iccidParam = iccid || perfilCache?.esim_iccid;
        if (!iccidParam) {
            showToast('⚠️ No hay eSIM para generar QR', 'error');
            return;
        }
        const qrData = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('LPA:1$' + iccidParam + "$Sariel's")}`;
        mostrarModalQR(qrData);
    } catch (error) {
        console.error('[Perfil] Error generando QR:', error);
        showToast('❌ Error al generar QR: ' + msgError(error), 'error');
    }
}

async function obtenerEstadoESIM() {
    try {
        const session = await getSession();
        if (!session) return null;

        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('esim_iccid, esim_status, esim_data_used, esim_data_limit, esim_apn')
            .eq('id', session.user.id)
            .maybeSingle();

        if (error) throw error;
        return data || null;

    } catch (error) {
        console.error('[Perfil] Error obteniendo estado eSIM:', error);
        return null;
    }
}

async function obtenerPlanesESIM() {
    try {
        if (!cli()) return [];
        const { data, error } = await supabaseClient
            .from('planes_esim')
            .select('*')
            .eq('activo', true)
            .order('precio_mxn', { ascending: true });

        if (error) throw error;
        return data || [];

    } catch (error) {
        console.error('[Perfil] Error obteniendo planes:', error);
        return [];
    }
}

/* ================================================================
   MODALES DE PAGO
   ================================================================ */
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
        ">
            <h2 style="color: var(--gold); margin-bottom: 10px;">📱 Compra eSIM</h2>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                ${escaparHTML(plan.nombre)} - ${escaparHTML(plan.datos_gb)} GB ${t('perfil_duracion', 'por')} ${escaparHTML(plan.duracion_dias)} ${t('perfil_dias', 'días')}
            </p>
            <p style="color: var(--gold); font-size: 1.2rem; font-weight: bold;">
                $${escaparHTML(plan.precio_usdt || plan.precio_mxn)} ${plan.precio_usdt ? 'USDT' : 'MXN'}
            </p>
            <p style="color: var(--text-muted); font-size: 0.8rem; margin: 10px 0;">
                💳 Paga con la pasarela segura
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 15px 0;">
                <a href="${escaparHTML(paymentUrl)}" target="_blank" rel="noopener noreferrer"
                   style="background: linear-gradient(135deg, var(--gold), #f7971e); border: none; color: #fff; padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer; text-decoration: none;">
                    💳 Ir a pagar
                </a>
                <button onclick="window.verificarPago('${escaparHTML(ordenId)}')"
                        style="background: var(--bg-card); border: 1px solid var(--cyan); color: var(--cyan); padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">
                    ✅ Verificar pago
                </button>
                <button onclick="this.closest('#pagoModal').remove()"
                        style="background: transparent; border: 1px solid var(--text-muted); color: var(--text-muted); padding: 12px 30px; border-radius: 10px; cursor: pointer;">
                    ${t('perfil_cerrar', 'Cerrar')}
                </button>
            </div>
            <div id="pagoStatus" style="margin-top: 10px; font-size: 0.8rem; color: var(--text-secondary);"></div>
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
        ">
            <h2 style="color: var(--gold); margin-bottom: 10px;">📱 Compra eSIM</h2>
            <div style="background: white; border-radius: 10px; padding: 15px; margin: 10px 0;">
                <img src="${escaparHTML(qrData)}" alt="QR de pago" style="max-width: 200px; width: 100%;">
            </div>
            <p style="color: var(--gold); font-size: 1.2rem; font-weight: bold;">
                $${escaparHTML(plan.precio_usdt || plan.precio_mxn)} ${plan.precio_usdt ? 'USDT' : 'MXN'}
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                <button onclick="window.verificarPago('${escaparHTML(ordenId)}')"
                        style="background: linear-gradient(135deg, var(--gold), #f7971e); border: none; color: #fff; padding: 10px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">
                    ✅ Verificar pago
                </button>
                <button onclick="this.closest('#pagoModal').remove()"
                        style="background: transparent; border: 1px solid var(--text-muted); color: var(--text-muted); padding: 10px 30px; border-radius: 10px; cursor: pointer;">
                    ${t('perfil_cerrar', 'Cerrar')}
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
    `;
    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, var(--bg-card), var(--bg-dark)); border: 2px solid var(--gold); border-radius: 20px; padding: 30px; max-width: 400px; width: 90%; text-align: center;">
            <h2 style="color: var(--gold); margin-bottom: 10px;">📱 Activa tu eSIM</h2>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">Escanea con la cámara de tu móvil</p>
            <div style="background: white; border-radius: 10px; padding: 15px; margin: 10px 0;">
                <img src="${escaparHTML(qrData)}" alt="QR de activación" style="max-width: 200px; width: 100%;">
            </div>
            <p style="color: var(--text-muted); font-size: 0.7rem;">📲 Ve a Ajustes > Datos Móviles > Añadir eSIM</p>
            <button onclick="this.parentElement.parentElement.remove()"
                    style="margin-top: 15px; background: var(--gold); border: none; color: #fff; padding: 10px 30px; border-radius: 10px; cursor: pointer;">
                ${t('perfil_cerrar', 'Cerrar')}
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
            statusEl.textContent = '❌ ' + t('perfil_inicia_sesion', 'Inicia sesión');
            return;
        }

        const response = await fetch(`${API_ENDPOINTS.pagos}/status/${encodeURIComponent(ordenId)}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        let result = null;
        try { result = await response.json(); } catch (e) { result = null; }

        if (!response.ok || !result || !result.success) {
            throw new Error((result && result.error) || 'Error al verificar pago (' + response.status + ')');
        }

        const orden = result.data;

        if (orden.estado === 'completado' || orden.estado === 'finished' || orden.estado === 'confirmed' || orden.estado === 'pagado') {
            statusEl.textContent = '✅ ¡Pago confirmado! Activando eSIM...';
            showToast('🎉 ¡eSIM activada exitosamente!', 'success');

            await cargarPerfil(true);

            setTimeout(() => {
                document.getElementById('pagoModal')?.remove();
            }, 2000);

        } else if (orden.estado === 'pendiente' || orden.estado === 'pagando') {
            statusEl.textContent = '⏳ Aún no se confirma el pago. Espera unos minutos.';
        } else {
            statusEl.textContent = `❌ Estado: ${orden.estado}`;
        }

    } catch (error) {
        console.error('[Perfil] Error verificando pago:', error);
        statusEl.textContent = '❌ Error al verificar: ' + msgError(error);
    }
}

/* ================================================================
   ESCANEO QR
   ================================================================ */
let qrScannerInterval = null;
let scannerActive = false;
let qrHistorial = [];
let qrScanningLock = false;

async function abrirCamaraQR() {
    const container = document.getElementById('qrReaderContainer');
    const video = document.getElementById('qrVideo');
    const status = document.getElementById('qrCamaraStatus');
    const canvas = document.getElementById('qrCanvas');
    const ctx = canvas?.getContext('2d');

    if (scannerActive) {
        cerrarCamaraQR();
        return;
    }

    try {
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
                        inversionAttempts: 'dontInvert'
                    });

                    if (code && code.data) {
                        const qrData = code.data;
                        status.textContent = '✅ QR detectado: ' + qrData.slice(0, 30) + '...';

                        const input = document.getElementById('qrInput');
                        if (input) input.value = qrData;
                        cerrarCamaraQR();
                        await procesarQR(qrData);
                        return;
                    }
                } else {
                    status.textContent = '📱 Escanea el QR o ingresa el código manualmente';
                }

            } catch (error) {
                console.error('[Perfil] Error leyendo QR:', error);
            }
        };

        if (qrScannerInterval) clearInterval(qrScannerInterval);
        qrScannerInterval = setInterval(leerQR, 500);

        showToast('📷 Apunta la cámara al QR', 'warning');

    } catch (error) {
        console.error('[Perfil] Error abriendo cámara:', error);
        if (status) status.textContent = '❌ No se pudo acceder a la cámara';
        showToast('❌ No se pudo acceder a la cámara', 'error');
    }
}

function cerrarCamaraQR() {
    const container = document.getElementById('qrReaderContainer');
    const video = document.getElementById('qrVideo');
    const status = document.getElementById('qrCamaraStatus');

    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
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
        showToast('⏳ Procesando otro QR...', 'warning');
        return;
    }

    qrScanningLock = true;
    const status = document.getElementById('qrStatus');
    const input = document.getElementById('qrInput');

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        if (status) status.textContent = '⏳ Validando QR...';
        showToast('⏳ Verificando QR...', '', 5000);

        const { data, error } = await supabaseClient.rpc('reclamar_qr_domo', {
            p_codigo: codigo
        });

        if (error) {
            const m = error.message || '';
            if (m.includes('already used')) {
                showToast('❌ Este QR ya fue usado', 'error');
                if (status) status.textContent = '❌ QR ya utilizado';
            } else if (m.includes('invalid code')) {
                showToast('❌ QR inválido', 'error');
                if (status) status.textContent = '❌ QR inválido';
            } else if (m.includes('not a domo')) {
                showToast('❌ Este QR no es para un domo', 'error');
                if (status) status.textContent = '❌ QR no es domo';
            } else {
                throw error;
            }
            return;
        }

        if (!data || !data.success) {
            showToast('❌ ' + ((data && data.error) || 'Error al reclamar QR'), 'error');
            if (status) status.textContent = '❌ ' + ((data && data.error) || 'Error');
            return;
        }

        if (status) status.textContent = '✅ ¡QR reclamado exitosamente!';
        if (input) input.value = '';

        showToast('🎉 ¡QR escaneado! +1 Es.stok', 'success');

        await cargarPerfil(true);
        await cargarHistorialQR();
        mostrarCelebracion();

    } catch (error) {
        console.error('[Perfil] Error procesando QR:', error);
        if (status) status.textContent = '❌ Error al procesar QR';
        showToast('❌ Error al escanear QR: ' + msgError(error), 'error');
    } finally {
        qrScanningLock = false;
    }
}

async function escanearQR() {
    const input = document.getElementById('qrInput');
    const qrCode = input?.value?.trim();

    if (!qrCode) {
        showToast('⚠️ Escribe o escanea el código QR', 'error');
        return;
    }

    await procesarQR(qrCode);
}

async function cargarHistorialQR() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
            .from('qr_historial')
            .select('*')
            .eq('user_id', session.user.id)
            .order('fecha', { ascending: false })
            .limit(10);

        if (error) {
            if (error.code === '42P01') {
                qrHistorial = [];
                actualizarUIHistorialQR([]);
                return;
            }
            throw error;
        }

        qrHistorial = data || [];
        actualizarUIHistorialQR(qrHistorial);

    } catch (error) {
        console.error('[Perfil] Error cargando historial QR:', error);
        actualizarUIHistorialQR([]);
    }
}

function actualizarUIHistorialQR(historial = []) {
    const container = document.getElementById('qrHistorialList');
    const contador = document.getElementById('qrHistorialCount');

    if (contador) {
        contador.textContent = historial.length + ' ' + t('perfil_escaneos', 'escaneos');
    }

    if (!container) return;

    if (!historial || historial.length === 0) {
        container.innerHTML =
            '<div class="empty-state" style="padding:10px;">'
                + '<span class="icon" style="font-size:1.5rem;">◈</span>'
                + '<p style="font-size:0.7rem;">Sin escaneos recientes</p>'
            + '</div>';
        aplicarI18NPerfil(container);
        return;
    }

    container.innerHTML = historial.map(item => {
        const fecha = new Date(item.fecha).toLocaleString('es-MX');
        const qrId = item.qr_id ? escaparHTML(String(item.qr_id).slice(0, 15)) : 'N/A';
        return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(212,175,55,0.05);font-size:0.7rem;color:var(--text-muted);">
                <span>📱 QR: ${qrId}</span>
                <span>${fecha}</span>
            </div>
        `;
    }).join('');
}

/* ================================================================
   ACTUALIZAR UI PRINCIPAL
   ================================================================ */
function actualizarUI(data) {
    if (!data) return;

    const nombreEl = document.getElementById('perfilNombre');
    const handleEl = document.getElementById('perfilHandle');
    const bioEl = document.getElementById('perfilBio');
    const avatarEl = document.getElementById('perfilAvatar');

    if (nombreEl) {
        const verificado = data.verificado ? '<span class="verified">✦ VERIFICADO</span>' : '';
        const nombreSafe = escaparHTML(data.nombre || t('perfil_nombre_usuario', 'Explorador'));
        nombreEl.innerHTML = `<span data-no-traducir="1">${nombreSafe}</span> ${verificado}`;
        nombreEl.setAttribute('data-no-traducir', '1');
    }

    if (handleEl) handleEl.textContent = '@' + (data.handle || 'explorador');

    if (bioEl) {
        const bioDefault = "Explorando el ecosistema Sariel's · WEB3 · Comunidad";
        const bioT = t('perfil_biografia_default', bioDefault);
        if (!data.bio || data.bio === bioDefault) {
            bioEl.setAttribute('data-clave', 'perfil_biografia_default');
            bioEl.textContent = bioT;
        } else {
            bioEl.removeAttribute('data-clave');
            bioEl.setAttribute('data-no-traducir', '1');
            bioEl.innerHTML = formatearTexto(data.bio);
        }
    }

    if (avatarEl) {
        const toggle = '<span class="avatar-menu-toggle" onclick="event.stopPropagation(); window.toggleAvatarMenu(event)" title="Opciones de foto">✎</span>';
        if (data.avatar_url) {
            const urlSafe = escaparHTML(data.avatar_url);
            avatarEl.innerHTML = `<img src="${urlSafe}" alt="Avatar" style="animation: fadeIn 0.5s ease-out;">` + toggle;
            const img = avatarEl.querySelector('img');
            if (img) {
                img.addEventListener('error', function () {
                    avatarEl.innerHTML = '◈' + toggle;
                });
            }
        } else {
            avatarEl.innerHTML = '◈' + toggle;
        }
    }

    const stats = [
        { id: 'statTokens', value: data.tokens || 0 },
        { id: 'statNFTS', value: data.nft_canjeado ? 1 : (data.domos || 0) }
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
        progressText.textContent = `${progreso} / 12` + (progreso >= 12 ? ' 🎯' : '');
        progressText.style.color = progreso >= 12 ? 'var(--gold)' : '';
    }

    const tokenTotal = document.getElementById('tokenTotal');
    const tokenDisponibles = document.getElementById('tokenDisponibles');
    const tokenNFTs = document.getElementById('tokenNFTs');
    const tokenVendidos = document.getElementById('tokenVendidos');

    if (tokenTotal) tokenTotal.textContent = tokens;
    if (tokenDisponibles) tokenDisponibles.textContent = tokens;
    if (tokenNFTs) tokenNFTs.textContent = data.nft_canjeado ? 1 : 0;
    if (tokenVendidos) tokenVendidos.textContent = data.tokens_acumulados ? Math.max(0, (data.tokens_acumulados || 0) - tokens) : 0;

    const btnCanjear = document.getElementById('canjearNft');
    if (btnCanjear) {
        btnCanjear.removeAttribute('data-clave');
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

    if (data.esim_iccid !== undefined) actualizarUIESIM(data);
    actualizarUIConexion(estadoConexion);
    actualizarUIEstado(data.online !== false);
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

/* ================================================================
   WALLET — METAMASK
   ================================================================ */
async function conectarWallet() {
    if (typeof window.ethereum === 'undefined') {
        showToast('⚠️ Instala MetaMask para conectar tu wallet', 'error', 5000);
        setTimeout(() => {
            window.open('https://metamask.io/es/download', '_blank', 'noopener,noreferrer');
        }, 800);
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        let accounts;
        try {
            accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        } catch (err) {
            if (err.code === 4001) {
                showToast('❌ Cancelaste la conexión en MetaMask', 'warning');
            } else {
                showToast('❌ Error al abrir MetaMask: ' + (err.message || 'Desconocido'), 'error');
            }
            return;
        }

        if (!accounts || accounts.length === 0) {
            showToast('❌ No se obtuvo ninguna cuenta de MetaMask', 'error');
            return;
        }

        const cuenta = accounts[0];
        let chainId = await window.ethereum.request({ method: 'eth_chainId' });

        if (chainId !== ENV.networkChainId) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: ENV.networkChainId }]
                });
                chainId = ENV.networkChainId;
            } catch (switchError) {
                if (switchError.code === 4902) {
                    try {
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
                        chainId = ENV.networkChainId;
                    } catch (addError) {
                        showToast('❌ No se pudo agregar la red Polygon Amoy', 'error');
                        return;
                    }
                } else {
                    showToast('❌ No se pudo cambiar a la red Polygon Amoy', 'error');
                    return;
                }
            }
        }

        /* Única firma vigente de vincular_wallet. El UPDATE directo a
           wallet_address ya no se intenta: el trigger de protección lo rechaza. */
        const { error: rpcErr } = await supabaseClient.rpc('vincular_wallet', {
            p_wallet_address: cuenta,
            p_chain_id: chainId,
            p_network_name: ENV.networkName
        });

        if (rpcErr) throw rpcErr;

        showToast(`✅ Wallet conectada a ${ENV.networkName}`, 'success', 4000);
        await cargarPerfil(true);

    } catch (error) {
        console.error('[Perfil] Error conectando wallet:', error);
        if (error.code === -32002) {
            showToast('⚠️ MetaMask ya tiene una solicitud pendiente. Ábrelo y confirma.', 'warning', 5000);
        } else {
            showToast('❌ Error al conectar wallet: ' + msgError(error), 'error');
        }
    }
}

async function desconectarWallet() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        const { error: rpcError } = await supabaseClient.rpc('desvincular_wallet');
        if (rpcError) throw rpcError;

        showToast('🔌 Wallet desconectada', 'warning');
        await cargarPerfil(true);

    } catch (error) {
        console.error('[Perfil] Error desconectando wallet:', error);
        showToast('❌ Error al desconectar wallet: ' + msgError(error), 'error');
    }
}

/* ================================================================
   COMPRAR DOMO
   ================================================================ */
async function comprarDomo(cantidad = 1) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        cantidad = Math.max(1, Math.floor(Number(cantidad) || 1));
        if (cantidad > 10) {
            showToast('⚠️ Máximo 10 domos por transacción', 'warning');
            return;
        }

        showToast('⏳ Procesando compra de ' + cantidad + ' domo(s)...', '', 5000);

        const { error } = await supabaseClient.rpc('comprar_domo', { p_cantidad: cantidad });

        if (error) {
            if ((error.message || '').includes('insufficient')) {
                showToast('❌ Fondos insuficientes para comprar domos', 'error');
                return;
            }
            throw error;
        }

        showToast(`🎉 ¡${cantidad} Domo(s) comprado(s) exitosamente!`, 'success', 5000);
        await cargarPerfil(true);
        mostrarCelebracion();

    } catch (error) {
        console.error('[Perfil] Error al comprar domo:', error);
        showToast('❌ Error en la compra: ' + msgError(error), 'error');
    }
}

/* ================================================================
   COMPRAR CON CRIPTO
   ================================================================ */
async function comprarConCripto() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
        return;
    }

    const qtyEl = document.getElementById('cryptoQuantity');
    const qty = parseInt(qtyEl?.textContent || '1');
    if (qty < 1 || qty > 10) {
        showToast('⚠️ Cantidad inválida (1-10)', 'warning');
        return;
    }

    const precioUnitario = 4.50;
    const total = qty * precioUnitario;
    const comision = total * 0.02;
    const totalConComision = total + comision;

    const modal = document.getElementById('cryptoPaymentModal');
    const qrImg = document.getElementById('cryptoQR');
    const addressEl = document.getElementById('cryptoAddress');
    const montoEl = document.getElementById('cryptoMonto');
    const monedaEl = document.getElementById('cryptoMoneda');
    const statusEl = document.getElementById('cryptoStatus');

    if (modal) modal.classList.add('active');

    try {
        const response = await fetch(`${API_ENDPOINTS.pagos}/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                transmisionId: null,
                monto: totalConComision,
                metodo: 'crypto',
                tipo: 'domo',
                cantidad: qty,
                idempotency_key: `domo_${session.user.id}_${qty}_${Date.now()}`
            })
        });

        let result = null;
        try { result = await response.json(); } catch (e) { result = null; }

        if (!response.ok || !result || !result.success) {
            showToast('❌ Error al crear pago: ' + ((result && result.error) || 'Error ' + response.status), 'error');
            if (modal) modal.classList.remove('active');
            return;
        }

        const pagoData = result.data;
        if (montoEl) montoEl.textContent = totalConComision.toFixed(2);
        if (monedaEl) monedaEl.textContent = 'USDT';
        if (addressEl) {
            addressEl.removeAttribute('data-clave');
            addressEl.textContent = pagoData.pay_address || pagoData.payment_address || '0x...';
        }
        if (statusEl) {
            statusEl.removeAttribute('data-clave');
            statusEl.textContent = '⏳ Esperando confirmación de pago...';
        }

        if (qrImg) {
            if (pagoData.payment_url) {
                qrImg.src = pagoData.payment_url;
            } else {
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('Orden: ' + pagoData.id)}`;
            }
        }

        window._ordenPagoId = pagoData.id;

        showToast('💳 QR generado. Escanea para pagar.', 'success');

    } catch (error) {
        console.error('[Perfil] Error comprando cripto:', error);
        showToast('❌ Error al crear el pago: ' + msgError(error), 'error');
        if (modal) modal.classList.remove('active');
    }
}

async function verificarPagoCrypto() {
    const statusEl = document.getElementById('cryptoStatus');
    const ordenId = window._ordenPagoId;

    if (!ordenId) {
        if (statusEl) statusEl.textContent = '❌ No hay orden para verificar';
        return;
    }

    if (statusEl) statusEl.textContent = '⏳ Verificando pago...';

    try {
        const session = await getSession();
        if (!session) {
            if (statusEl) statusEl.textContent = '❌ ' + t('perfil_inicia_sesion', 'Inicia sesión');
            return;
        }

        const response = await fetch(`${API_ENDPOINTS.pagos}/status/${encodeURIComponent(ordenId)}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        let result = null;
        try { result = await response.json(); } catch (e) { result = null; }

        if (!response.ok || !result || !result.success) {
            throw new Error((result && result.error) || 'Error al verificar pago (' + response.status + ')');
        }

        const orden = result.data;

        if (orden.estado === 'completado' || orden.estado === 'finished' || orden.estado === 'confirmed' || orden.estado === 'pagado') {
            if (statusEl) statusEl.textContent = '✅ ¡Pago confirmado! Procesando compra...';
            showToast('🎉 ¡Compra exitosa!', 'success');
            await cargarPerfil(true);
            setTimeout(() => cerrarModalPago(), 2000);
        } else if (orden.estado === 'pendiente' || orden.estado === 'pagando') {
            if (statusEl) statusEl.textContent = '⏳ Aún no se confirma el pago.';
        } else {
            if (statusEl) statusEl.textContent = `❌ Estado: ${orden.estado}`;
        }

    } catch (error) {
        console.error('[Perfil] Error verificando pago:', error);
        if (statusEl) statusEl.textContent = '❌ Error: ' + msgError(error);
    }
}

function copiarDireccion() {
    const addressEl = document.getElementById('cryptoAddress');
    const address = addressEl?.textContent;

    if (address && address !== 'Cargando dirección...') {
        navigator.clipboard.writeText(address).then(() => {
            showToast('📋 Dirección copiada', 'success');
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = address;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            textArea.remove();
            showToast('📋 Dirección copiada', 'success');
        });
    }
}

function cerrarModalPago() {
    const modal = document.getElementById('cryptoPaymentModal');
    if (modal) modal.classList.remove('active');
    window._ordenPagoId = null;
}

/* ================================================================
   CANJEAR NFT
   ================================================================ */
async function canjearNFT() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        showToast('⏳ Verificando tokens para canje...', '', 4000);

        const { data, error } = await supabaseClient.rpc('canjear_nft');

        if (error) {
            const m = error.message || '';
            if (m.includes('insufficient tokens')) {
                showToast('❌ Necesitas exactamente 12 Es.stoks', 'error');
            } else if (m.includes('already redeemed')) {
                showToast('⚠️ Ya has canjeado tu NFT', 'warning');
            } else {
                throw error;
            }
            return;
        }

        showToast('🎁 ¡NFT Canjeado! Tienes 30 días para reclamar.', 'success', 8000);
        await cargarPerfil(true);
        mostrarModalNFT(data);

    } catch (error) {
        console.error('[Perfil] Error al canjear NFT:', error);
        showToast('❌ Error al canjear NFT: ' + msgError(error), 'error');
    }
}

/* ================================================================
   CONFETI / CELEBRACIÓN / MODAL NFT
   ================================================================ */
function crearConfeti() {
    asegurarEstilosPerfil();
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
    showToast('🎉 ¡Transacción exitosa!', 'success');
}

function compartirLogro() {
    const texto = "🎁 ¡Acabo de canjear mi NFT en Sariel's! Únete al ecosistema. #Sariels #WEB3 #NFT";
    if (navigator.share) {
        navigator.share({ title: "Mi logro en Sariel's", text: texto }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto).then(() => {
            showToast('📋 Copiado al portapapeles', 'success');
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
    `;

    const nftId = escaparHTML((data && data.nft_id) ? data.nft_id : ('NFT-' + Date.now().toString().slice(-6)));

    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, var(--bg-card), var(--bg-dark)); border: 2px solid var(--gold); border-radius: 20px; padding: 40px; max-width: 500px; width: 90%; text-align: center;">
            <div style="font-size: 80px; margin-bottom: 20px;">🎁</div>
            <h2 style="color: var(--gold); font-size: 28px; margin-bottom: 10px;">¡NFT Canjeado!</h2>
            <p style="color: var(--text-primary); margin-bottom: 20px; font-size: 18px;">Tu Domo físico te espera</p>
            <div style="background: var(--bg-dark); border-radius: 10px; padding: 15px; margin-bottom: 20px;">
                <p style="color: var(--text-muted); font-size: 14px;">⏳ Vigencia: 30 días para reclamar</p>
                <p style="color: var(--cyan); font-size: 12px; margin-top: 5px;">ID: ${nftId}</p>
            </div>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button onclick="this.closest('#nftModal').remove()"
                        style="background: linear-gradient(135deg, var(--gold), #f7971e); border: none; color: #fff; padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">
                    ✅ Entendido
                </button>
                <button onclick="window.compartirLogro()"
                        style="background: transparent; border: 2px solid var(--cyan); color: var(--cyan); padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer;">
                    📤 Compartir
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    crearConfeti();
}

/* ================================================================
   GESTIÓN DE PERFIL
   ================================================================ */
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

async function guardarPerfil() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
        return;
    }

    const perfil = {
        nombre: (document.getElementById('editNombre')?.value || '').trim() || t('perfil_nombre_usuario', 'Explorador'),
        handle: (document.getElementById('editHandle')?.value || '').trim().replace('@', '') || 'explorador',
        bio: (document.getElementById('editBio')?.value || '').trim() || t('perfil_biografia_default', "Explorando el ecosistema Sariel's · WEB3 · Comunidad")
    };

    if (!/^[a-zA-Z0-9_]+$/.test(perfil.handle)) {
        showToast('❌ El handle solo puede contener letras, números y _', 'error');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('usuarios')
            .update({
                nombre: perfil.nombre,
                handle: perfil.handle,
                bio: perfil.bio,
                updated_at: new Date().toISOString()
            })
            .eq('id', session.user.id);

        if (error) throw error;

        showToast('✅ Perfil guardado correctamente', 'success');
        await cargarPerfil(true);

    } catch (error) {
        console.error('[Perfil] Error guardando perfil:', error);
        showToast('❌ Error al guardar: ' + msgError(error), 'error');
    }
}

function compartirPerfil() {
    const nombre = document.getElementById('perfilNombre')?.textContent.replace('✦ VERIFICADO', '').trim().split(' ')[0] || 'Explorador';
    const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
    const url = `${window.location.origin}/perfil/${encodeURIComponent(handle)}`;
    const texto = `◈ Perfil de ${nombre} en Sariel's\n◈ ${url}\n\n#Sariels #WEB3 #NFT #Comunidad`;

    if (navigator.share) {
        navigator.share({ title: `Perfil de ${nombre} en Sariel's`, text: texto, url: url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto).then(() => {
            showToast('◈ Copiado al portapapeles', 'success');
        }).catch(() => {
            prompt('Copia este enlace:', url);
        });
    }
}

function irAMuro() {
    window.location.href = '/features/muro/muro.html';
}

function abrirSelectorArchivo() {
    const input = document.getElementById('fileInput');
    if (input) input.click();
}

/* ================================================================
   VISOR DE IMÁGENES (avatar y fotos de publicaciones)
   ================================================================ */
function abrirVisorImagen(src, alt, idModal) {
    if (!src) return;

    const modal = documen