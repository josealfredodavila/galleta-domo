// ================================================================
// PERFIL · ESIM (Telnyx)
// ================================================================
// Panel de eSIM: estado, consumo, QR de activación, sincronización.
// Depende de: perfil-config.js, perfil-utils.js
//
// CAMBIO v2 (traducciones):
// - Todos los textos usan perfilT(clave, respaldo).
// - El botón "Instalar en este iPhone" se identifica por data-accion
//   (antes buscaba el texto "Instalar", que cambia según el idioma).
// ================================================================

// ================================================================
// HELPERS
// ================================================================
var LPA_REGEX = /^LPA:/;

async function getTokenEsim() {
    try {
        if (!window.supabaseClient) return null;
        var r = await window.supabaseClient.auth.getSession();
        return r && r.data && r.data.session ? r.data.session.access_token : null;
    } catch (e) {
        return null;
    }
}

async function fetchAuthEsim(url, opciones) {
    var token = await getTokenEsim();
    if (!token) {
        if (window.showToast) window.showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
        return null;
    }
    var opts = opciones || {};
    var headers = Object.assign({}, opts.headers || {}, {
        'Authorization': 'Bearer ' + token
    });
    if (opts.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    return fetch(url, Object.assign({}, opts, { headers: headers }));
}

function formatearMB(mb) {
    var n = Number(mb);
    if (!Number.isFinite(n) || n <= 0) return '0 MB';
    if (n >= 1000) return (n / 1000).toFixed(2) + ' GB';
    return Math.round(n) + ' MB';
}

function obtenerElementosEsim() {
    return {
        estado: document.getElementById('esimStatus'),
        used: document.getElementById('esimDataUsed'),
        limit: document.getElementById('esimDataLimit'),
        rest: document.getElementById('esimDataRestante'),
        iccid: document.getElementById('esimIccid'),
        progress: document.getElementById('esimDataProgress'),
        avisoSinSaldo: document.getElementById('esimAvisoSinSaldo'),
        error: document.getElementById('esimError'),
        btnComprar: document.getElementById('btnComprarEsim'),
        btnQr: document.getElementById('btnQrEsim'),
        btnSync: document.getElementById('btnSyncEsim'),
        wrap: document.getElementById('tab-esim')
    };
}

function mostrarErrorEsim(mensaje) {
    var el = document.getElementById('esimError');
    if (!el) return;
    el.textContent = mensaje;
    el.style.display = 'block';
}

function limpiarErrorEsim() {
    var el = document.getElementById('esimError');
    if (!el) return;
    el.style.display = 'none';
    el.textContent = '';
}

function resetUISinEsim() {
    var e = obtenerElementosEsim();
    if (e.estado) {
        e.estado.textContent = perfilT('perfil_esim_sin', 'Sin eSIM');
        e.estado.style.color = 'var(--text-muted)';
    }
    if (e.used) e.used.textContent = '0 MB';
    if (e.limit) e.limit.textContent = '0 MB';
    if (e.rest) {
        e.rest.textContent = '0 MB';
        e.rest.style.color = 'var(--text-muted)';
    }
    if (e.iccid) e.iccid.textContent = '—';
    if (e.progress) {
        e.progress.style.width = '0%';
        e.progress.style.background = 'var(--success)';
    }
    if (e.avisoSinSaldo) e.avisoSinSaldo.style.display = 'none';
    if (e.btnQr) e.btnQr.style.display = 'none';
    if (e.btnSync) e.btnSync.style.display = 'none';
    if (e.btnComprar) {
        e.btnComprar.style.display = '';
        var txt = document.getElementById('btnComprarEsimTxt');
        if (txt) txt.textContent = perfilT('perfil_esim_comprar', 'Comprar eSIM');
    }
    limpiarErrorEsim();
}

// ================================================================
// MOSTRAR UI CON DATOS DE ESIM
// ================================================================
function mostrarUIEsim(esim) {
    var e = obtenerElementosEsim();
    if (!e.estado) return;

    var estado = esim.estado || 'pendiente';
    var mapTexto = {
        activa: perfilT('perfil_esim_estado_activa', 'Activa'),
        sin_saldo: perfilT('perfil_esim_estado_sin_saldo', 'Sin saldo'),
        pendiente: perfilT('perfil_esim_estado_pendiente', 'Pendiente'),
        aprovisionando: perfilT('perfil_esim_estado_aprovisionando', 'Aprovisionando'),
        reemplazando: perfilT('perfil_esim_estado_reemplazando', 'Reemplazando')
    };
    var mapColor = {
        activa: 'var(--success)',
        sin_saldo: 'var(--danger)',
        pendiente: 'var(--warning)',
        aprovisionando: 'var(--warning)',
        reemplazando: 'var(--warning)'
    };
    e.estado.textContent = mapTexto[estado] || estado;
    e.estado.style.color = mapColor[estado] || 'var(--text-secondary)';

    var totalMb = Number(esim.datos_total_mb) || 0;
    var usadosMb = Number(esim.datos_usados_mb) || 0;
    var restanteMb = Math.max(totalMb - usadosMb, 0);
    var pct = totalMb > 0 ? Math.min((usadosMb / totalMb) * 100, 100) : 0;

    if (e.used) e.used.textContent = formatearMB(usadosMb);
    if (e.limit) e.limit.textContent = formatearMB(totalMb);
    if (e.rest) {
        e.rest.textContent = formatearMB(restanteMb);
        e.rest.style.color = restanteMb < 1000 ? 'var(--danger)' : 'var(--success)';
    }
    if (e.iccid) {
        var iccid = esim.iccid ? String(esim.iccid) : '—';
        e.iccid.textContent = iccid.length > 16 ? iccid.slice(0, 10) + '…' + iccid.slice(-4) : iccid;
    }
    if (e.progress) {
        e.progress.style.width = pct + '%';
        e.progress.style.background = pct > 80 ? 'var(--danger)' : (pct > 50 ? 'var(--warning)' : 'var(--success)');
    }
    if (e.avisoSinSaldo) e.avisoSinSaldo.style.display = (estado === 'sin_saldo') ? 'block' : 'none';
    if (e.btnQr) e.btnQr.style.display = '';
    if (e.btnSync) e.btnSync.style.display = '';
    if (e.btnComprar) {
        var txt = document.getElementById('btnComprarEsimTxt');
        if (txt) txt.textContent = perfilT('perfil_esim_recargar', 'Recargar gigas');
        e.btnComprar.style.display = '';
    }
    limpiarErrorEsim();
}

// ================================================================
// CARGAR ESIM DESDE BACKEND
// ================================================================
async function cargarEsimNueva() {
    var e = obtenerElementosEsim();
    if (e.estado) {
        e.estado.textContent = perfilT('perfil_esim_cargando', 'Cargando…');
        e.estado.style.color = 'var(--text-secondary)';
    }
    limpiarErrorEsim();

    try {
        var resp = await fetchAuthEsim(BACKEND_URL + '/api/telnyx/esim/mia');
        if (!resp) {
            resetUISinEsim();
            mostrarErrorEsim(perfilT('perfil_esim_err_conexion', 'No se pudo conectar. Inicia sesión e intenta de nuevo.'));
            return;
        }
        if (resp.status === 401) {
            resetUISinEsim();
            mostrarErrorEsim(perfilT('perfil_esim_sesion_expirada', 'Tu sesión expiró. Inicia sesión de nuevo.'));
            return;
        }
        var data = await resp.json();
        if (!resp.ok || !data || !data.success) {
            resetUISinEsim();
            var detalle = (data && data.error) || ('HTTP ' + resp.status);
            mostrarErrorEsim(perfilT('perfil_esim_err_obtener', 'No se pudo obtener tu eSIM:') + ' ' + detalle);
            return;
        }
        var esim = data.data || {};
        if (!esim.tiene_esim) {
            resetUISinEsim();
            return;
        }
        mostrarUIEsim(esim);
    } catch (err) {
        console.warn('[Perfil] Error cargando eSIM nueva:', err);
        resetUISinEsim();
        mostrarErrorEsim(perfilT('perfil_esim_err_red_cargar', 'Error de red al cargar tu eSIM. Intenta de nuevo.'));
    }
}

// ================================================================
// SINCRONIZAR ESIM
// ================================================================
async function sincronizarEsimNuevo() {
    limpiarErrorEsim();
    if (window.showToast) window.showToast(perfilT('perfil_esim_sincronizando', '⏳ Sincronizando consumo...'), '', 3000);
    try {
        var resp = await fetchAuthEsim(BACKEND_URL + '/api/telnyx/esim/sync', { method: 'POST' });
        if (!resp) return;
        var data = await resp.json();
        if (!resp.ok || !data.success) {
            if (window.showToast) {
                window.showToast('❌ ' + (data.error || perfilT('perfil_esim_err_sincronizar', 'No se pudo sincronizar')), 'error', 4000);
            }
            return;
        }
        if (window.showToast) window.showToast(perfilT('perfil_esim_actualizado', '✅ Datos actualizados'), 'success', 3000);
        if (data.data && data.data.tiene_esim) mostrarUIEsim(data.data);
    } catch (err) {
        console.error('[Perfil] Error sincronizarEsimNuevo:', err);
        var detalle = (err && err.message) ? err.message : perfilT('perfil_desconocido', 'desconocido');
        mostrarErrorEsim(perfilT('perfil_esim_err_sync_detalle', 'Error al sincronizar:') + ' ' + detalle);
        if (window.showToast) window.showToast(perfilT('perfil_esim_err_sincronizar_corto', '❌ Error al sincronizar'), 'error', 4000);
    }
}

// ================================================================
// VER QR DE ESIM
// ================================================================
async function verQREsimNuevo() {
    limpiarErrorEsim();
    if (window.showToast) window.showToast(perfilT('perfil_esim_cargando_toast', '⏳ Cargando eSIM...'), '', 3000);
    try {
        var resp = await fetchAuthEsim(BACKEND_URL + '/api/telnyx/esim/mia');
        if (!resp) return;
        var data = await resp.json();
        if (!resp.ok || !data.success || !data.data || !data.data.tiene_esim) {
            if (window.showToast) {
                window.showToast(perfilT('perfil_esim_no_activa', '⚠️ No tienes eSIM activa. Compra un paquete primero.'), 'warning', 5000);
            }
            return;
        }
        var esim = data.data;
        var code = esim.activation_code || '';
        if (!code || !LPA_REGEX.test(code)) {
            if (window.showToast) {
                window.showToast(perfilT('perfil_esim_sin_qr', '⚠️ La eSIM no tiene código QR disponible'), 'warning', 4000);
            }
            return;
        }
        mostrarModalQREsim(code);
    } catch (err) {
        console.error('[Perfil] Error verQREsimNuevo:', err);
        var detalle = (err && err.message) ? err.message : perfilT('perfil_desconocido', 'desconocido');
        mostrarErrorEsim(perfilT('perfil_esim_err_cargar_detalle', 'Error al cargar la eSIM:') + ' ' + detalle);
        if (window.showToast) window.showToast(perfilT('perfil_esim_err_cargar', '❌ Error al cargar la eSIM'), 'error', 4000);
    }
}

// ================================================================
// CREAR MODAL QR DE ESIM
// ================================================================
function crearModalEsim() {
    var modal = document.createElement('div');
    modal.id = 'esimQrModalNuevo';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);backdrop-filter:blur(10px);display:flex;justify-content:center;align-items:center;z-index:99999;padding:20px;';

    var card = document.createElement('div');
    card.style.cssText = 'background:linear-gradient(135deg,var(--bg-card),var(--bg-dark));border:2px solid var(--gold);border-radius:20px;padding:30px;max-width:420px;width:100%;text-align:center;position:relative;max-height:90vh;overflow-y:auto;';

    var btnCerrar = document.createElement('button');
    btnCerrar.textContent = '✕';
    btnCerrar.setAttribute('aria-label', perfilT('perfil_cerrar', 'Cerrar'));
    btnCerrar.style.cssText = 'position:absolute;top:10px;right:15px;background:transparent;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;';
    btnCerrar.addEventListener('click', cerrarModalEsim);

    var h = document.createElement('h3');
    h.textContent = perfilT('perfil_esim_activar_titulo', '📱 Activar eSIM');
    h.style.cssText = 'color:var(--gold);margin-bottom:12px;font-family:Orbitron,monospace;font-size:1rem;';

    var p = document.createElement('p');
    p.textContent = perfilT('perfil_esim_escanea', 'Escanea este código con la cámara de tu celular');
    p.style.cssText = 'color:var(--text-secondary);font-size:0.8rem;margin-bottom:14px;';

    var qrBox = document.createElement('div');
    qrBox.style.cssText = 'background:#fff;border-radius:12px;padding:15px;display:inline-block;margin-bottom:14px;';
    var canvas = document.createElement('canvas');
    canvas.id = 'esimQrCanvasNuevo';
    qrBox.appendChild(canvas);

    var lpaBox = document.createElement('div');
    lpaBox.style.cssText = 'background:rgba(0,0,0,0.6);border:1px solid var(--glass-border);border-radius:8px;padding:10px;word-break:break-all;margin-bottom:12px;text-align:left;';
    var lpaLabel = document.createElement('div');
    lpaLabel.textContent = perfilT('perfil_esim_lpa', 'CÓDIGO LPA');
    lpaLabel.style.cssText = 'font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;';
    var lpaValue = document.createElement('div');
    lpaValue.id = 'esimLpaValue';
    lpaValue.style.cssText = 'font-family:monospace;font-size:0.65rem;color:var(--gold);line-height:1.4;word-break:break-all;';
    lpaBox.appendChild(lpaLabel);
    lpaBox.appendChild(lpaValue);

    var smdpBox = document.createElement('div');
    smdpBox.style.cssText = 'background:rgba(0,0,0,0.6);border:1px solid var(--glass-border);border-radius:8px;padding:10px;word-break:break-all;margin-bottom:8px;text-align:left;';
    var smdpLabel = document.createElement('div');
    smdpLabel.textContent = 'SM-DP+';
    smdpLabel.style.cssText = 'font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;';
    var smdpValue = document.createElement('div');
    smdpValue.id = 'esimSmdpValue';
    smdpValue.style.cssText = 'font-family:monospace;font-size:0.7rem;color:var(--text-secondary);word-break:break-all;';
    smdpBox.appendChild(smdpLabel);
    smdpBox.appendChild(smdpValue);

    var actBox = document.createElement('div');
    actBox.style.cssText = 'background:rgba(0,0,0,0.6);border:1px solid var(--glass-border);border-radius:8px;padding:10px;word-break:break-all;margin-bottom:12px;text-align:left;';
    var actLabel = document.createElement('div');
    actLabel.textContent = perfilT('perfil_esim_codigo_activacion', 'CÓDIGO DE ACTIVACIÓN');
    actLabel.style.cssText = 'font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;';
    var actValue = document.createElement('div');
    actValue.id = 'esimActValue';
    actValue.style.cssText = 'font-family:monospace;font-size:0.7rem;color:var(--gold);word-break:break-all;';
    actBox.appendChild(actLabel);
    actBox.appendChild(actValue);

    var notaLbl = document.createElement('div');
    notaLbl.textContent = perfilT('perfil_esim_nota', 'No puedes escanear el QR con el mismo celular donde lo ves; usa el botón o el código copiado.');
    notaLbl.style.cssText = 'color:var(--text-muted);font-size:0.65rem;margin:6px 0 12px;line-height:1.4;';

    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;';

    var btnCopiar = document.createElement('button');
    btnCopiar.textContent = perfilT('perfil_esim_copiar', '📋 Copiar código');
    btnCopiar.style.cssText = 'background:rgba(212,175,55,0.1);border:1px solid var(--gold);color:var(--gold);padding:8px 18px;border-radius:30px;font-size:0.7rem;font-weight:600;cursor:pointer;';

    var btnInstalar = document.createElement('button');
    btnInstalar.dataset.accion = 'instalar';
    btnInstalar.textContent = perfilT('perfil_esim_instalar', '📲 Instalar en este iPhone');
    btnInstalar.style.cssText = 'background:linear-gradient(135deg,var(--gold),var(--gold-dark));border:1px solid var(--line-black);color:var(--space);padding:8px 18px;border-radius:30px;font-size:0.7rem;font-weight:700;cursor:pointer;display:none;';

    var btnCerrarSec = document.createElement('button');
    btnCerrarSec.textContent = perfilT('perfil_cerrar', 'Cerrar');
    btnCerrarSec.style.cssText = 'background:transparent;border:1px solid var(--text-muted);color:var(--text-muted);padding:8px 18px;border-radius:30px;font-size:0.7rem;cursor:pointer;';
    btnCerrarSec.addEventListener('click', cerrarModalEsim);

    actions.appendChild(btnCopiar);
    actions.appendChild(btnInstalar);
    actions.appendChild(btnCerrarSec);

    card.appendChild(btnCerrar);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(qrBox);
    card.appendChild(lpaBox);
    card.appendChild(smdpBox);
    card.appendChild(actBox);
    card.appendChild(notaLbl);
    card.appendChild(actions);
    modal.appendChild(card);

    btnCopiar.addEventListener('click', function () {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(modal.dataset.lpa).then(function () {
                    if (window.showToast) window.showToast(perfilT('perfil_esim_copiado', '📋 Código copiado'), 'success');
                }).catch(function () {
                    copiarConFallback(modal.dataset.lpa);
                });
            } else {
                copiarConFallback(modal.dataset.lpa);
            }
        } catch (e) {
            copiarConFallback(modal.dataset.lpa);
        }
    });

    return modal;
}

function copiarConFallback(texto) {
    try {
        var ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok && window.showToast) {
            window.showToast(perfilT('perfil_esim_copiado', '📋 Código copiado'), 'success');
        } else if (window.showToast) {
            window.showToast(perfilT('perfil_esim_no_copiar', 'No se pudo copiar. Selecciona el texto manualmente.'), 'warning', 4000);
        }
    } catch (e) {
        if (window.showToast) {
            window.showToast(perfilT('perfil_esim_no_copiar', 'No se pudo copiar. Selecciona el texto manualmente.'), 'warning', 4000);
        }
    }
}

function cerrarModalEsim() {
    var m = document.getElementById('esimQrModalNuevo');
    if (m) m.remove();
    document.removeEventListener('keydown', onKeyEscEsim);
}

function onKeyEscEsim(ev) {
    if (ev.key === 'Escape') cerrarModalEsim();
}

function mostrarModalQREsim(code) {
    var previo = document.getElementById('esimQrModalNuevo');
    if (previo) previo.remove();

    var modal = crearModalEsim();
    modal.dataset.lpa = code;

    var partes = String(code).split('$');
    var smdp = partes[1] || '';
    var actCode = partes[2] || '';

    modal.querySelector('#esimLpaValue').textContent = code;
    modal.querySelector('#esimSmdpValue').textContent = smdp || '—';
    modal.querySelector('#esimActValue').textContent = actCode || '—';

    // Botón de instalación solo en iPhone/iPad (se identifica por data-accion)
    var esIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (esIOS) {
        var btnInstalar = modal.querySelector('[data-accion="instalar"]');
        if (btnInstalar) {
            btnInstalar.style.display = '';
            btnInstalar.addEventListener('click', function () {
                var url = 'https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=' + encodeURI(code);
                window.location.href = url;
            });
        }
    }

    modal.addEventListener('click', function (ev) {
        if (ev.target === modal) cerrarModalEsim();
    });
    document.addEventListener('keydown', onKeyEscEsim);

    document.body.appendChild(modal);

    var canvas = document.getElementById('esimQrCanvasNuevo');
    if (typeof QRCode !== 'undefined' && canvas) {
        QRCode.toCanvas(canvas, code, {
            width: 220,
            margin: 1,
            color: { dark: '#05080f', light: '#ffffff' }
        }, function (err) {
            if (err) console.error('[Perfil] Error QR:', err);
        });
    } else if (canvas) {
        canvas.width = 220;
        canvas.height = 220;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#05080f';
        ctx.fillRect(0, 0, 220, 220);
        ctx.fillStyle = '#D4AF37';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(perfilT('perfil_esim_qr_no_disponible', 'QR no disponible'), 110, 110);
    }
}

// ================================================================
// IR A COMPRAR INTERNET
// ================================================================
function irAComprarInternet() {
    window.location.href = '/features/internet/internet.html';
}