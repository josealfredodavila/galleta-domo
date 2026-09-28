/* ================================================================
   PERFIL.JS - SARIEL'S ECOSYSTEM
   VERSIÓN PRODUCCIÓN — 100% SUPABASE DIRECTO

   - Sin credenciales hardcodeadas.
   - Usa window.supabaseClient creado por el bloque centralizado del perfil.html.
   - Si no hay sesión → redirige al index.
   - Cerrar sesión → signOut() y luego replace('/').
   - vincular_wallet fallback usa wallet_address.
   - SESSION_TIMEOUT_MS = 15000.
   - RPC obtener_estado_pro / activar_pro restauradas.
   - subirVideo() usa bucket muro-videos (50 MB).
   - eliminarFotoPerfil() nueva función.
   - Blindaje de botones de tarjetas con data-no-traducir.
   ================================================================ */

(function () {
'use strict';

var supabaseClient = null;
var intentosSupabase = 0;
var MAX_INTENTOS_SUPABASE = 100;
var moduloInicializado = false;

var SESSION_TIMEOUT_MS = 15000;

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
                    intentosSupabase++;
                    if (intentosSupabase >= MAX_INTENTOS_SUPABASE) {
                        console.error('[Perfil] ❌ No se pudo inicializar Supabase.');
                        inicializarModuloPerfil();
                    } else {
                        setTimeout(inicializarSupabase, 200);
                    }
                }
            })
            .catch(function (err) {
                console.warn('[Perfil] Error esperando supabaseReady:', err);
                intentosSupabase++;
                if (intentosSupabase >= MAX_INTENTOS_SUPABASE) {
                    inicializarModuloPerfil();
                } else {
                    setTimeout(inicializarSupabase, 200);
                }
            });
        return;
    }

    intentosSupabase++;
    if (intentosSupabase >= MAX_INTENTOS_SUPABASE) {
        console.error('[Perfil] ❌ No se pudo inicializar Supabase (sin cliente).');
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
   CONSTANTES PRO
   ================================================================ */
const PRO_PLAN_ID = 1;
const PRO_PRECIO_MXN = 60;
const PRO_DURACION_DIAS = 30;
const PRO_GB = 5;

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

/* ================================================================
   TOAST NOTIFICACIONES
   ================================================================ */
function showToast(msg, type = '', duration = 3500) {
    let toastEl = document.getElementById('toast');
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
    toastEl._timeout = setTimeout(() => {
        toastEl.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => toastEl.classList.remove('show'), 300);
    }, duration);
}

/* ================================================================
   SESIÓN
   ================================================================ */
async function getSession() {
    if (!supabaseClient) return null;

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
   CARGAR ESTADO DE MEMBRESÍA PRO
   ================================================================ */
async function cargarEstadoPro() {
    try {
        if (!supabaseClient) return;
        const session = await getSession();
        if (!session) return;

        try {
            const { data, error } = await supabaseClient.rpc('obtener_estado_pro');

            if (!error && data && data.success) {
                aplicarEstadoProUI({
                    plan: data.plan,
                    plan_expira_at: data.expira_at,
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

    if (planActualEl) planActualEl.textContent = planActual;
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

/* ================================================================
   CONTRATAR MEMBRESÍA PRO
   ================================================================ */
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

            const result = await response.json();

            if (response.ok && result.success && result.data) {
                if (result.data.payment_url || result.data.pay_address) {
                    window.open(result.data.payment_url || result.data.pay_address, '_blank');
                    showToast('💳 ' + t('perfil_pro_activando', 'Completa el pago en la ventana que se abrió'), 'success', 5000);
                    if (pago?.id) iniciarPollingPagoPro(pago.id);
                    return;
                }
            }

            if (!response.ok) {
                console.warn('[Perfil] Backend pagos respondió:', response.status, result);
            }
        } catch (backendError) {
            console.warn('[Perfil] Backend de pagos no disponible:', backendError.message);
        }

        const activar = confirm(
            'No se pudo conectar con la pasarela de pago.\n\n' +
            '¿Quieres activar Pro en modo manual (prueba)?\n' +
            'Se activará por ' + PRO_DURACION_DIAS + ' días.'
        );

        if (activar) {
            await activarProDirecto(session.user.id, pago?.id);
        }

    } catch (error) {
        console.error('[Perfil] Error contratando Pro:', error);
        showToast('❌ Error: ' + error.message, 'error');
    }
}

async function activarProDirecto(usuarioId, pagoProId) {
    try {
        showToast('⏳ ' + t('perfil_pro_activando', 'Activando Sariel\'s Pro...'), '', 4000);

        let activado = false;
        try {
            const { data, error } = await supabaseClient.rpc('activar_pro', {
                p_usuario_id: usuarioId,
                p_plan_id: PRO_PLAN_ID
            });
            if (!error && data && data.success) {
                activado = true;
            }
        } catch (rpcErr) {
            console.warn('[Perfil] RPC activar_pro no disponible:', rpcErr?.message);
        }

        if (!activado) {
            const expira = new Date(Date.now() + PRO_DURACION_DIAS * 24 * 60 * 60 * 1000).toISOString();
            const { error } = await supabaseClient
                .from('usuarios')
                .update({
                    plan: 'Pro',
                    plan_expira_at: expira,
                    plan_meta: PRO_GB + ' GB · ' + PRO_DURACION_DIAS + ' días'
                })
                .eq('id', usuarioId);
            if (error) throw new Error(error.message);
        }

        if (pagoProId) {
            await supabaseClient
                .from('pagos_pro')
                .update({ estado: 'completado', metodo_pago: 'manual_prueba' })
                .eq('id', pagoProId);
        }

        showToast('🎉 ' + t('perfil_pro_activado', "¡Sariel's Pro activado!"), 'success', 5000);
        crearConfeti();

        await cargarEstadoPro();
        await cargarPerfil(true);

    } catch (error) {
        console.error('[Perfil] Error activando Pro:', error);
        showToast('❌ Error al activar Pro: ' + error.message, 'error');
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
   FORMATEO DE TEXTO
   ================================================================ */
function formatearTexto(texto) {
    if (!texto) return '';
    return texto
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

Object.defineProperty(window, 'perfilCache', {
    get: function () { return perfilCache; },
    set: function (v) { perfilCache = v; },
    configurable: true
});

/* ================================================================
   CARGAR PERFIL
   ================================================================ */
async function cargarPerfil(forzarActualizacion = false) {
    try {
        if (!supabaseClient) {
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
        try {
            const { data, error } = await supabaseClient.rpc('obtener_mi_perfil');
            if (!error && data) {
                perfil = Array.isArray(data) && data.length > 0 ? data[0] : (Array.isArray(data) ? null : data);
            }
        } catch (rpcErr) {
            console.warn('[Perfil] RPC obtener_mi_perfil falló, usando SELECT directo:', rpcErr?.message);
        }

        if (!perfil) {
            const { data, error } = await supabaseClient
                .from('usuarios')
                .select(`
                    id, email, nombre, handle, username, bio, avatar_url,
                    portada_url, ubicacion, sitio_web, verificado, es_admin,
                    tokens, tokens_acumulados, progreso_canje, puede_canjear,
                    nft_canjeado, domos, tokens_para_canje,
                    plan, plan_expira_at, plan_meta, membresia_live_hasta,
                    esim_iccid, esim_status, esim_data_used, esim_data_limit, esim_apn,
                    esim_imsi, esim_msisdn, esim_eid, esim_type,
                    esim_installation_status, esim_status_reason, esim_data_unit,
                    esim_last_sync_at, esim_last_error, esim_activated_at,
                    esim_expires_at, esim_operator, esim_network,
                    telnyx_sim_id, telnyx_connection_id, telefono_telnyx,
                    telefono, numero_verificado,
                    online, ultima_conexion, offline_desde,
                    conexion_tipo, conexion_activa, conexion_velocidad,
                    conexion_senal, conexion_ultimo_cambio,
                    wallet_address, stripe_account_id,
                    pais_codigo, roaming_activo, ciudad,
                    minutos_disponibles, sms_disponibles,
                    idioma_preferido_id,
                    avatar_verificacion_url,
                    created_at, updated_at
                `)
                .eq('id', session.user.id)
                .maybeSingle();

            if (error) {
                console.error('[Perfil] Error leyendo usuarios:', error.message);
                perfil = {
                    id: session.user.id,
                    email: session.user.email,
                    nombre: session.user.user_metadata?.nombre || t('perfil_nombre_usuario', 'Explorador'),
                    handle: session.user.email?.split('@')[0] || 'explorador',
                    bio: t('perfil_biografia_default', "Explorando el ecosistema Sariel's · WEB3 · Comunidad"),
                    avatar_url: null,
                    tokens: 0,
                    online: true
                };
            } else {
                perfil = data;
            }
        }

        if (!perfil) {
            perfil = {
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
            cargarContadoresSociales(session.user.id),
            cargarPortadaUbicacion(session.user.id)
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

function iniciarDetectorInactividad() {
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

        await actualizarEstadoEnLinea(online);

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

function iniciarEscuchaAmigos() {
    if (!supabaseClient) return;
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
            if (usuario.id !== perfilCache?.id) {
                actualizarListaAmigos();
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
            actualizarUIAmigos([], []);
            return { enLinea: [], todosContactos: [] };
        }

        const idsContactos = contactos
            .map(c => c?.contacto_id)
            .filter(Boolean);

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
        const handleSafe = String(amigo.handle || amigo.id || '').replace(/[<>"']/g, '');
        const nombreSafe = String(amigo.nombre || amigo.handle || '').replace(/[<>"']/g, '');
        const avatarSafe = amigo.avatar_url ? String(amigo.avatar_url).replace(/"/g, '&quot;') : '';
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
        if (!supabaseClient) return;

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
   PORTADA / UBICACIÓN / SITIO WEB
   ================================================================ */
async function cargarPortadaUbicacion(usuarioId) {
    try {
        if (!usuarioId || !supabaseClient) return;

        const { data, error } = await supabaseClient
            .from('perfiles')
            .select('portada_url, ubicacion, sitio_web')
            .eq('id', usuarioId)
            .maybeSingle();

        if (error || !data) return;

        if (perfilCache) {
            perfilCache.portada_url = data.portada_url || null;
            perfilCache.ubicacion = data.ubicacion || null;
            perfilCache.sitio_web = data.sitio_web || null;
        }
    } catch (error) {
        console.warn('[Perfil] Error cargando portada:', error?.message);
    }
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

async function cargarEstadoConexion() {
    try {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

        if (connection) {
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
            estadoConexion = {
                ...estadoConexion,
                activa: navigator.onLine
            };
            actualizarUIConexion(estadoConexion);
        }

        return estadoConexion;

    } catch (error) {
        console.error('[Perfil] Error cargando estado de conexión:', error);
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
            showToast('❌ Tipo de conexión no válido', 'error');
            return;
        }

        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        if (tipo === 'datos') {
            const perfil = await getPerfilActual();
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
        showToast('❌ Error al cambiar conexión: ' + error.message, 'error');
    }
}

function getPerfilActual() {
    return perfilCache;
}

async function guardarEstadoConexion(estado) {
    try {
        const session = await getSession();
        if (!session) return;

        await supabaseClient
            .from('usuarios')
            .update({
                conexion_tipo: estado.tipo,
                conexion_activa: estado.activa,
                conexion_velocidad: estado.velocidad,
                conexion_senal: estado.señal
            })
            .eq('id', session.user.id);

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

function iniciarEscuchaConexion() {
    window.addEventListener('online', () => {
        estadoConexion.activa = true;
        actualizarUIConexion(estadoConexion);
        guardarEstadoConexion(estadoConexion);
        showToast('🛜 ' + t('perfil_conexion', 'Conexión'), 'success');
    });

    window.addEventListener('offline', () => {
        estadoConexion.activa = false;
        actualizarUIConexion(estadoConexion);
        guardarEstadoConexion(estadoConexion);
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

        actualizarUIESIM({
            esim_iccid: usuario.esim_iccid,
            esim_status: usuario.esim_status,
            esim_data_used: usuario.esim_data_used || 0,
            esim_data_limit: usuario.esim_data_limit || 0,
            esim_apn: usuario.esim_apn || 'data00.telnyx',
            esim_activated_at: usuario.esim_activated_at,
            esim_expires_at: usuario.esim_expires_at,
            esim_operator: usuario.esim_operator || 'Telnyx',
            esim_network: usuario.esim_network || '4G/5G'
        });

        return usuario;

    } catch (error) {
        console.error('[Perfil] Error cargando datos eSIM:', error);
        await cargarDatosESIMLocal(iccid);
        return null;
    }
}

async function cargarDatosESIMLocal(iccid) {
    try {
        const session = await getSession();
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
        }
    } catch (error) {
        console.error('[Perfil] Error cargando datos locales:', error);
        mostrarSinESIM();
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
            actualizarUIESIM(usuario);
            showToast('✅ ' + t('perfil_sincronizar', 'Datos sincronizados'), 'success');
        } else {
            mostrarSinESIM();
            showToast('⚠️ No tienes eSIM asignada', 'warning');
        }

    } catch (error) {
        console.error('[Perfil] Error sincronizando eSIM:', error);
        showToast('❌ Error al sincronizar: ' + error.message, 'error');
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

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Error al crear la orden');
        }

        if (result.data && result.data.payment_url) {
            mostrarModalPagoReal(result.data.payment_url, result.data.id, plan);
        } else {
            const qrData = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('Orden: ' + (result.data?.id || ''))}`;
            mostrarModalPagoSimulado(qrData, result.data?.id, plan);
        }

    } catch (error) {
        console.error('[Perfil] Error comprando eSIM:', error);
        showToast('❌ Error al comprar eSIM: ' + error.message, 'error');
    }
}

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
        showToast('❌ Error al activar eSIM: ' + error.message, 'error');
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
        showToast('❌ Error al desactivar eSIM: ' + error.message, 'error');
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
        showToast('❌ Error al generar QR: ' + error.message, 'error');
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
                ${plan.nombre} - ${plan.datos_gb} GB ${t('perfil_duracion', 'por')} ${plan.duracion_dias} ${t('perfil_dias', 'días')}
            </p>
            <p style="color: var(--gold); font-size: 1.2rem; font-weight: bold;">
                $${plan.precio_usdt || plan.precio_mxn} ${plan.precio_usdt ? 'USDT' : 'MXN'}
            </p>
            <p style="color: var(--text-muted); font-size: 0.8rem; margin: 10px 0;">
                💳 Paga con la pasarela segura
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 15px 0;">
                <a href="${paymentUrl}" target="_blank" rel="noopener noreferrer"
                   style="background: linear-gradient(135deg, var(--gold), #f7971e); border: none; color: #fff; padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer; text-decoration: none;">
                    💳 Ir a pagar
                </a>
                <button onclick="window.verificarPago('${ordenId}')"
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
                <img src="${qrData}" alt="QR de pago" style="max-width: 200px; width: 100%;">
            </div>
            <p style="color: var(--gold); font-size: 1.2rem; font-weight: bold;">
                $${plan.precio_usdt || plan.precio_mxn} ${plan.precio_usdt ? 'USDT' : 'MXN'}
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                <button onclick="window.verificarPago('${ordenId}')"
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
                <img src="${qrData}" alt="QR de activación" style="max-width: 200px; width: 100%;">
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

        const response = await fetch(`${API_ENDPOINTS.pagos}/status/${ordenId}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Error al verificar pago');
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
            setTimeout(() => verificarPago(ordenId), 10000);
        } else {
            statusEl.textContent = `❌ Estado: ${orden.estado}`;
        }

    } catch (error) {
        console.error('[Perfil] Error verificando pago:', error);
        statusEl.textContent = '❌ Error al verificar: ' + error.message;
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
                console.error('[Perfil] Error leyendo QR:', error);
            }
        };

        if (qrScannerInterval) clearInterval(qrScannerInterval);
        qrScannerInterval = setInterval(leerQR, 500);

        showToast('📷 Apunta la cámara al QR', 'warning');

    } catch (error) {
        console.error('[Perfil] Error abriendo cámara:', error);
        status.textContent = '❌ No se pudo acceder a la cámara';
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
            qrScanningLock = false;
            return;
        }

        if (status) status.textContent = '⏳ Validando QR...';
        showToast('⏳ Verificando QR...', '', 5000);

        const { data, error } = await supabaseClient.rpc('reclamar_qr_domo', {
            p_codigo: codigo
        });

        if (error) {
            if (error.message.includes('already used')) {
                showToast('❌ Este QR ya fue usado', 'error');
                if (status) status.textContent = '❌ QR ya utilizado';
            } else if (error.message.includes('invalid code')) {
                showToast('❌ QR inválido', 'error');
                if (status) status.textContent = '❌ QR inválido';
            } else if (error.message.includes('not a domo')) {
                showToast('❌ Este QR no es para un domo', 'error');
                if (status) status.textContent = '❌ QR no es domo';
            } else {
                throw error;
            }
            qrScanningLock = false;
            return;
        }

        if (!data || !data.success) {
            showToast('❌ ' + ((data && data.error) || 'Error al reclamar QR'), 'error');
            if (status) status.textContent = '❌ ' + ((data && data.error) || 'Error');
            qrScanningLock = false;
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
        showToast('❌ Error al escanear QR: ' + error.message, 'error');
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
        const qrId = item.qr_id ? String(item.qr_id).slice(0, 15) : 'N/A';
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
        const nombreSafe = String(data.nombre || t('perfil_nombre_usuario', 'Explorador')).replace(/[<>]/g, '');
        nombreEl.innerHTML = `<span data-no-traducir="1">${nombreSafe}</span> ${verificado}`;
        nombreEl.setAttribute('data-no-traducir', '1');
    }

    if (handleEl) handleEl.textContent = '@' + (data.handle || 'explorador');

    if (bioEl) {
        const bioDefault = "Explorando el ecosistema Sariel's · WEB3 · Comunidad";
        const bioT = t('perfil_biografia_default', bioDefault);
        if (!data.bio || data.bio === bioDefault) {
            bioEl.setAttribute('data-clave', 'perfil_biografia_default');
            bioEl.innerHTML = bioT;
        } else {
            bioEl.removeAttribute('data-clave');
            bioEl.setAttribute('data-no-traducir', '1');
            bioEl.innerHTML = formatearTexto(data.bio);
        }
    }

    if (avatarEl) {
        if (data.avatar_url) {
            const urlSafe = String(data.avatar_url).replace(/"/g, '&quot;');
            avatarEl.innerHTML = `
                <img src="${urlSafe}" alt="Avatar" style="animation: fadeIn 0.5s ease-out;"
                     onerror="this.style.display='none';this.parentElement.innerHTML='◈<span class=\\'avatar-menu-toggle\\' onclick=\\'event.stopPropagation(); window.toggleAvatarMenu(event)\\' title=\\'Opciones de foto\\'>✎</span>'"/>
                <span class="avatar-menu-toggle" onclick="event.stopPropagation(); window.toggleAvatarMenu(event)" title="Opciones de foto">✎</span>
            `;
        } else {
            avatarEl.innerHTML = `◈<span class="avatar-menu-toggle" onclick="event.stopPropagation(); window.toggleAvatarMenu(event)" title="Opciones de foto">✎</span>`;
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
        progressText.textContent = `${progreso} / 12`;
        if (progreso >= 12) {
            progressText.style.color = 'var(--gold)';
            if (!progressText.innerHTML.includes('🎯')) {
                progressText.innerHTML += ' 🎯';
            }
        }
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
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });

        if (chainId !== ENV.networkChainId) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: ENV.networkChainId }]
                });
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

        const { error: rpcErr } = await supabaseClient.rpc('vincular_wallet', { p_wallet_address: cuenta });

        if (rpcErr) {
            console.warn('[Perfil] RPC vincular_wallet falló, usando UPDATE directo:', rpcErr.message);
            const { error: updateError } = await supabaseClient
                .from('usuarios')
                .update({ wallet_address: cuenta })
                .eq('id', session.user.id);
            if (updateError) throw updateError;
        }

        showToast(`✅ Wallet conectada a ${ENV.networkName}`, 'success', 4000);
        await cargarPerfil(true);

    } catch (error) {
        console.error('[Perfil] Error conectando wallet:', error);
        if (error.code === -32002) {
            showToast('⚠️ MetaMask ya tiene una solicitud pendiente. Ábrelo y confirma.', 'warning', 5000);
        } else {
            showToast('❌ Error al conectar wallet: ' + (error.message || 'Desconocido'), 'error');
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
        if (rpcError) {
            const { error: updateError } = await supabaseClient
                .from('usuarios')
                .update({ wallet_address: null })
                .eq('id', session.user.id);
            if (updateError) throw updateError;
        }

        showToast('🔌 Wallet desconectada', 'warning');
        await cargarPerfil(true);

    } catch (error) {
        console.error('[Perfil] Error desconectando wallet:', error);
        showToast('❌ Error al desconectar wallet', 'error');
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

        cantidad = Math.max(1, Math.floor(cantidad));
        if (cantidad > 10) {
            showToast('⚠️ Máximo 10 domos por transacción', 'warning');
            return;
        }

        showToast('⏳ Procesando compra de ' + cantidad + ' domo(s)...', '', 5000);

        const { data, error } = await supabaseClient.rpc('comprar_domo', { p_cantidad: cantidad });

        if (error) {
            if (error.message.includes('insufficient')) {
                showToast('❌ Fondos insuficientes para comprar domos', 'error');
            } else {
                throw error;
            }
            return;
        }

        showToast(`🎉 ¡${cantidad} Domo(s) comprado(s) exitosamente!`, 'success', 5000);
        await cargarPerfil(true);
        mostrarCelebracion();

    } catch (error) {
        console.error('[Perfil] Error al comprar domo:', error);
        showToast('❌ Error en la compra: ' + error.message, 'error');
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

        const result = await response.json();

        if (!response.ok || !result.success) {
            showToast('❌ Error al crear pago: ' + (result.error || 'Error desconocido'), 'error');
            if (modal) modal.classList.remove('active');
            return;
        }

        const pagoData = result.data;
        if (montoEl) montoEl.textContent = totalConComision.toFixed(2);
        if (monedaEl) monedaEl.textContent = 'USDT';
        if (addressEl) addressEl.textContent = pagoData.pay_address || pagoData.payment_address || '0x...';
        if (statusEl) statusEl.textContent = '⏳ Esperando confirmación de pago...';

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
        showToast('❌ Error al crear el pago', 'error');
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

        const response = await fetch(`${API_ENDPOINTS.pagos}/status/${ordenId}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Error al verificar pago');
        }

        const orden = result.data;

        if (orden.estado === 'completado' || orden.estado === 'finished' || orden.estado === 'confirmed' || orden.estado === 'pagado') {
            if (statusEl) statusEl.textContent = '✅ ¡Pago confirmado! Procesando compra...';
            showToast('🎉 ¡Compra exitosa!', 'success');
            await cargarPerfil(true);
            setTimeout(() => cerrarModalPago(), 2000);
        } else if (orden.estado === 'pendiente' || orden.estado === 'pagando') {
            if (statusEl) statusEl.textContent = '⏳ Aún no se confirma el pago.';
            setTimeout(() => verificarPagoCrypto(), 10000);
        } else {
            if (statusEl) statusEl.textContent = `❌ Estado: ${orden.estado}`;
        }

    } catch (error) {
        console.error('[Perfil] Error verificando pago:', error);
        if (statusEl) statusEl.textContent = '❌ Error: ' + error.message;
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
            if (error.message.includes('insufficient tokens')) {
                showToast('❌ Necesitas exactamente 12 Es.stoks', 'error');
            } else if (error.message.includes('already redeemed')) {
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
        showToast('❌ Error al canjear NFT: ' + error.message, 'error');
    }
}

/* ================================================================
   CONFETI / CELEBRACIÓN / MODAL NFT
   ================================================================ */
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

    const nftId = (data && data.nft_id) ? data.nft_id : ('NFT-' + Date.now().toString().slice(-6));

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
        showToast('❌ Error al guardar: ' + error.message, 'error');
    }
}

function compartirPerfil() {
    const nombre = document.getElementById('perfilNombre')?.textContent.split(' ')[0] || 'Explorador';
    const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
    const url = `${window.location.origin}/perfil/${handle}`;
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
   EXPANDIR AVATAR / FOTO
   ================================================================ */
function expandirAvatar() {
    const avatarEl = document.getElementById('perfilAvatar');
    if (!avatarEl) return;

    const img = avatarEl.querySelector('img');
    if (!img || !img.src) return;

    const modal = document.createElement('div');
    modal.id = 'perfilAvatarModal';
    modal.style.cssText = [
        'position: fixed',
        'top: 0', 'left: 0', 'right: 0', 'bottom: 0',
        'width: 100vw', 'height: 100vh',
        'background: rgba(0,0,0,0.95)',
        '-webkit-backdrop-filter: blur(8px)',
        'backdrop-filter: blur(8px)',
        'display: flex',
        'justify-content: center',
        'align-items: center',
        'z-index: 2147483647',
        'cursor: zoom-out',
        'padding: 20px',
        'box-sizing: border-box'
    ].join(';');

    const imgFull = document.createElement('img');
    imgFull.src = img.src;
    imgFull.alt = 'Avatar';
    imgFull.style.cssText = [
        'max-width: 95vw',
        'max-height: 95vh',
        'width: auto',
        'height: auto',
        'object-fit: contain',
        'border-radius: 16px',
        'box-shadow: 0 0 60px rgba(212, 175, 55, 0.5), 0 0 0 3px rgba(212, 175, 55, 0.6)',
        'display: block'
    ].join(';');

    modal.appendChild(imgFull);
    document.body.appendChild(modal);

    const cerrar = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        modal.remove();
        document.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') cerrar();
    };

    modal.addEventListener('click', cerrar);
    imgFull.addEventListener('click', cerrar);
    document.addEventListener('keydown', onKeyDown);
}

function expandirFotoPublicacion(src) {
    if (!src) return;

    const modal = document.createElement('div');
    modal.id = 'fotoPublicacionModal';
    modal.style.cssText = [
        'position: fixed',
        'top: 0', 'left: 0', 'right: 0', 'bottom: 0',
        'width: 100vw', 'height: 100vh',
        'background: rgba(0,0,0,0.95)',
        '-webkit-backdrop-filter: blur(8px)',
        'backdrop-filter: blur(8px)',
        'display: flex',
        'justify-content: center',
        'align-items: center',
        'z-index: 2147483647',
        'cursor: zoom-out',
        'padding: 20px',
        'box-sizing: border-box'
    ].join(';');

    const imgFull = document.createElement('img');
    imgFull.src = src;
    imgFull.alt = 'Imagen publicada';
    imgFull.style.cssText = [
        'max-width: 95vw',
        'max-height: 95vh',
        'width: auto',
        'height: auto',
        'object-fit: contain',
        'border-radius: 16px',
        'box-shadow: 0 0 60px rgba(212, 175, 55, 0.5), 0 0 0 3px rgba(212, 175, 55, 0.6)',
        'display: block'
    ].join(';');

    modal.appendChild(imgFull);
    document.body.appendChild(modal);

    const cerrar = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        modal.remove();
        document.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') cerrar();
    };

    modal.addEventListener('click', cerrar);
    imgFull.addEventListener('click', cerrar);
    document.addEventListener('keydown', onKeyDown);
}

/* ================================================================
   SUBIR FOTO DE PERFIL
   ================================================================ */
async function subirFoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const session = await getSession();
    if (!session) {
        showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast('❌ La imagen no puede superar los 5 MB', 'error');
        event.target.value = '';
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('❌ Solo se permiten imágenes', 'error');
        event.target.value = '';
        return;
    }

    const fileExt = file.name.split('.').pop().toLowerCase();
    const filePath = `${session.user.id}/avatar.${fileExt}`;

    try {
        showToast('⏳ Subiendo foto...', '', 5000);

        const { error: uploadError } = await supabaseClient.storage
            .from('sariels-avatars')
            .upload(filePath, file, { upsert: true, contentType: file.type });

        if (uploadError) {
            console.error('[Perfil] Error storage:', uploadError);
            if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
                showToast('❌ Bucket de avatares no configurado', 'error');
            } else if (uploadError.message?.includes('policy') || uploadError.message?.includes('violates')) {
                showToast('❌ Sin permiso para subir foto', 'error');
            } else {
                showToast('❌ Error: ' + uploadError.message, 'error');
            }
            return;
        }

        const { data: urlData } = supabaseClient.storage
            .from('sariels-avatars')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl + '?t=' + Date.now();

        const { error: updateError } = await supabaseClient
            .from('usuarios')
            .update({ avatar_url: publicUrl })
            .eq('id', session.user.id);

        if (updateError) throw updateError;

        showToast('✅ Foto actualizada correctamente', 'success');
        event.target.value = '';
        await cargarPerfil(true);

    } catch (error) {
        console.error('[Perfil] Error al subir foto:', error);
        showToast('❌ Error al subir foto: ' + error.message, 'error');
    }
}

/* ================================================================
   ELIMINAR FOTO DE PERFIL
   ================================================================ */
async function eliminarFotoPerfil() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
        return;
    }

    const confirmMsg = t('perfil_confirma_eliminar_foto', '¿Seguro que quieres eliminar tu foto de perfil?');
    if (!confirm(confirmMsg)) return;

    try {
        showToast('⏳ Eliminando foto...', '', 4000);

        const extensiones = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
        const paths = extensiones.map(ext => `${session.user.id}/avatar.${ext}`);

        try {
            await supabaseClient.storage.from('sariels-avatars').remove(paths);
        } catch (storageErr) {
            console.warn('[Perfil] No se pudo borrar el archivo del bucket:', storageErr);
        }

        const { error } = await supabaseClient
            .from('usuarios')
            .update({ avatar_url: null })
            .eq('id', session.user.id);

        if (error) throw error;

        showToast('✅ Foto de perfil eliminada', 'success');

        const avatarEl = document.getElementById('perfilAvatar');
        if (avatarEl) {
            avatarEl.innerHTML = '◈<span class="avatar-menu-toggle" onclick="event.stopPropagation(); window.toggleAvatarMenu(event)" title="Opciones de foto">✎</span>';
        }

        await cargarPerfil(true);

    } catch (error) {
        console.error('[Perfil] Error eliminando foto de perfil:', error);
        showToast('❌ Error al eliminar foto: ' + error.message, 'error');
    }
}

/* ================================================================
   SUBIR VIDEO (a bucket muro-videos)
   ================================================================ */
async function subirVideo(event) {
    const file = event.target.files[0];
    if (!file) return;

    const session = await getSession();
    if (!session) {
        showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
        return;
    }

    if (!file.type.startsWith('video/')) {
        showToast('❌ Formato no válido (solo videos)', 'error');
        event.target.value = '';
        return;
    }

    if (file.size > 50 * 1024 * 1024) {
        showToast('❌ El video excede 50 MB', 'error');
        event.target.value = '';
        return;
    }

    try {
        showToast('⏳ Subiendo video...', '', 15000);

        const fileExt = file.name.split('.').pop().toLowerCase();
        const filePath = `${session.user.id}/video_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabaseClient.storage
            .from('muro-videos')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type
            });

        if (uploadError) {
            console.error('[Perfil] Error storage:', uploadError);
            if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
                showToast('❌ Bucket de videos no configurado', 'error');
            } else if (uploadError.message?.includes('policy') || uploadError.message?.includes('violates')) {
                showToast('❌ Sin permiso para subir video', 'error');
            } else {
                showToast('❌ Error: ' + uploadError.message, 'error');
            }
            return;
        }

        const { data: urlData } = supabaseClient.storage
            .from('muro-videos')
            .getPublicUrl(filePath);

        showToast('✅ Video subido con éxito', 'success');
        event.target.value = '';
        return urlData.publicUrl;

    } catch (error) {
        console.error('[Perfil] Error al subir video:', error);
        showToast('❌ Error al subir el video: ' + error.message, 'error');
    }
}

/* ================================================================
   SISTEMA DE AMIGOS
   ================================================================ */
async function agregarAmigo(amigoId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
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
            if (error.code === '23505') showToast('⚠️ Ya enviaste solicitud a este usuario', 'warning');
            else if (error.code === '42P01') showToast('❌ Tabla de contactos no configurada', 'error');
            else if (error.code === '42501') showToast('❌ Sin permiso para agregar', 'error');
            else showToast('❌ Error: ' + error.message, 'error');
            return;
        }

        showToast('🤝 Solicitud de amistad enviada', 'success');
    } catch (error) {
        console.error('[Perfil] Error al agregar amigo:', error);
        showToast('❌ No se pudo enviar la solicitud', 'error');
    }
}

/* ================================================================
   GENERAR QR PERFIL
   ================================================================ */
async function generarQRPerfil() {
    try {
        const session = await getSession();
        if (!session) return;

        const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
        const url = `${window.location.origin}/perfil/${handle}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(10px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        `;
        modal.innerHTML = `
            <div style="background: var(--bg-card); border-radius: 20px; padding: 30px; text-align: center; max-width: 90vw;">
                <h3 style="color: var(--gold); margin-bottom: 20px;">📱 Share QR</h3>
                <img src="${qrUrl}" alt="QR Code" style="border-radius: 10px; max-width: 200px;">
                <p style="color: var(--text-muted); margin-top: 15px; font-size: 12px; word-break: break-all;">${url}</p>
                <button onclick="this.parentElement.parentElement.remove()"
                        style="margin-top: 20px; background: var(--gold); border: none; color: #fff; padding: 10px 30px; border-radius: 10px; cursor: pointer;">
                    Cerrar
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        aplicarI18NPerfil(modal);

    } catch (error) {
        console.error('[Perfil] Error generando QR:', error);
        showToast('❌ Error al generar QR', 'error');
    }
}

/* ================================================================
   NIVEL Y ESTADÍSTICAS
   ================================================================ */
function calcularNivel(tokens) {
    const niveles = [
        { min: 0, max: 4, nombre: '🌱 Explorador', emoji: '🌱' },
        { min: 5, max: 9, nombre: '⚡ Cazador', emoji: '⚡' },
        { min: 10, max: 14, nombre: '🏆 Leyenda', emoji: '🏆' },
        { min: 15, max: 19, nombre: '👑 Maestro', emoji: '👑' },
        { min: 20, max: Infinity, nombre: '✨ Inmortal', emoji: '✨' }
    ];

    for (const nivel of niveles) {
        if (tokens >= nivel.min && tokens <= nivel.max) return nivel;
    }
    return niveles[0];
}

async function obtenerEstadisticas() {
    try {
        const session = await getSession();
        if (!session) return null;

        const { data, error } = await supabaseClient
            .from('estadisticas_usuarios')
            .select('*')
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    } catch (error) {
        console.warn('[Perfil] Error obteniendo estadísticas:', error?.message);
        return null;
    }
}

/* ================================================================
   CERRAR SESIÓN
   ================================================================ */
async function cerrarSesion() {
    const confirmMsg = t('perfil_cerrar_sesion', '¿Seguro que quieres cerrar sesión?');
    if (!confirm(confirmMsg)) return;

    try {
        await actualizarEstadoEnLinea(false);
    } catch (e) {
        console.warn('[Perfil] No se pudo marcar offline:', e?.message);
    }

    try {
        await supabaseClient.auth.signOut();
    } catch (error) {
        console.error('[Perfil] Error cerrando sesión:', error);
        showToast('❌ Error al cerrar sesión', 'error');
        return;
    }

    window.location.replace('/');
}

/* ================================================================
   NOTIFICACIONES EN TIEMPO REAL
   ================================================================ */
function iniciarNotificacionesRealtime() {
    if (!supabaseClient) return;
    const channel = supabaseClient
        .channel('notificaciones')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notificaciones'
        }, (payload) => {
            const notificacion = payload.new;
            if (notificacion.user_id === perfilCache?.id) {
                showToast(`🔔 ${notificacion.mensaje}`, 'warning', 4000);

                try {
                    const audio = new Audio('/sound/notification.mp3');
                    audio.play().catch(() => {});
                } catch (e) {}
            }
        })
        .subscribe();

    return channel;
}

/* ================================================================
   INICIALIZACIÓN DEL MÓDULO
   ================================================================ */
function inicializarModuloPerfil() {
    if (moduloInicializado) return;
    moduloInicializado = true;

    console.log('[Perfil] 🚀 Inicializando módulo...');

    window.cambiarTab = cambiarTab;
    window.cargarPerfil = cargarPerfil;
    window.guardarPerfil = guardarPerfil;
    window.abrirSelectorArchivo = abrirSelectorArchivo;
    window.expandirAvatar = expandirAvatar;
    window.expandirFotoPublicacion = expandirFotoPublicacion;
    window.subirFoto = subirFoto;
    window.subirVideo = subirVideo;
    window.eliminarFotoPerfil = eliminarFotoPerfil;
    window.editarPerfil = editarPerfil;
    window.compartirPerfil = compartirPerfil;
    window.conectarWallet = conectarWallet;
    window.desconectarWallet = desconectarWallet;
    window.comprarDomo = comprarDomo;
    window.canjearNFT = canjearNFT;
    window.agregarAmigo = agregarAmigo;
    window.cerrarSesion = cerrarSesion;
    window.irAMuro = irAMuro;
    window.showToast = showToast;
    window.generarQRPerfil = generarQRPerfil;
    window.calcularNivel = calcularNivel;
    window.compartirLogro = compartirLogro;

    window.comprarESIM = comprarESIM;
    window.cargarDatosESIM = cargarDatosESIM;
    window.activarESIM = activarESIM;
    window.desactivarESIM = desactivarESIM;
    window.generarQRESIM = generarQRESIM;
    window.obtenerEstadoESIM = obtenerEstadoESIM;
    window.obtenerPlanesESIM = obtenerPlanesESIM;
    window.verificarPago = verificarPago;
    window.sincronizarESIM = sincronizarESIM;

    window.comprarConCripto = comprarConCripto;
    window.verificarPagoCrypto = verificarPagoCrypto;
    window.copiarDireccion = copiarDireccion;
    window.cerrarModalPago = cerrarModalPago;

    window.cambiarConexion = cambiarConexion;
    window.cargarEstadoConexion = cargarEstadoConexion;
    window.getPerfilActual = getPerfilActual;

    window.actualizarEstadoEnLinea = actualizarEstadoEnLinea;
    window.cambiarEstado = cambiarEstado;
    window.cargarAmigosEnLinea = cargarAmigosEnLinea;
    window.actualizarListaAmigos = actualizarListaAmigos;

    window.escanearQR = escanearQR;
    window.abrirCamaraQR = abrirCamaraQR;
    window.cerrarCamaraQR = cerrarCamaraQR;
    window.cargarHistorialQR = cargarHistorialQR;
    window.actualizarUIHistorialQR = actualizarUIHistorialQR;
    window.procesarQR = procesarQR;

    window.cargarEstadoPro = cargarEstadoPro;
    window.contratarPro = contratarPro;
    window.activarProDirecto = activarProDirecto;

    window.perfilT = t;
    window.aplicarI18NPerfil = aplicarI18NPerfil;
    window.traducirPlanMeta = traducirPlanMeta;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciarPerfil);
    } else {
        iniciarPerfil();
    }
}

async function iniciarPerfil() {
    console.log('[Perfil] 🎬 Cargando datos del perfil...');

    if (typeof jsQR === 'undefined') {
        try {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
            document.head.appendChild(script);
            await new Promise(resolve => { script.onload = resolve; script.onerror = resolve; });
        } catch (e) {}
    }

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

    if (perfilCache?.esim_iccid) {
        setInterval(() => {
            cargarDatosESIM(perfilCache.esim_iccid);
        }, 30000);
    }

    setInterval(() => {
        cargarEstadoConexion();
    }, 10000);

    setInterval(() => {
        cargarAmigosEnLinea();
    }, 15000);

    const cryptoQty = document.getElementById('cryptoQuantity');
    const decBtn = document.getElementById('cryptoDecreaseQty');
    const incBtn = document.getElementById('cryptoIncreaseQty');

    if (decBtn && cryptoQty) {
        decBtn.addEventListener('click', () => {
            let val = parseInt(cryptoQty.textContent);
            if (val > 1) {
                cryptoQty.textContent = val - 1;
                actualizarCryptoTotal();
            }
        });
    }
    if (incBtn && cryptoQty) {
        incBtn.addEventListener('click', () => {
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

    console.log('[Perfil] ✅ Módulo inicializado completamente.');
}

/* ================================================================
   ARRANCAR
   ================================================================ */
inicializarSupabase();

})();