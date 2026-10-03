// ================================================================
// PERFIL · ÓRDENES DE INTERNET
// ================================================================
// Muestra las órdenes de compra de internet (eSIM) del usuario,
// con filtros por estado (todas, activas, pendientes, canceladas).
// Depende de: perfil-config.js, perfil-utils.js
// ================================================================

var ordenesInternet = [];
var filtroInternet = 'all';

var GRUPOS_ESTADO_INTERNET = {
    activa:   ['activa', 'activada', 'completado', 'pagada'],
    pendiente: ['pendiente', 'pagando', 'confirmando'],
    cancelada: ['cancelada', 'cancelado']
};

// ================================================================
// FORMATEAR FECHA
// ================================================================
function formatearFechaInternet(fecha) {
    if (!fecha) return '—';
    try {
        var d = new Date(fecha);
        return d.toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }) + ' · ' + d.toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return '—';
    }
}

// ================================================================
// INFO DE ESTADO (colores y textos)
// ================================================================
function estadoInfoInternet(estado) {
    var map = {
        'pendiente':   { color: '#f59e0b', texto: 'Pendiente de pago', bg: 'rgba(245, 158, 11, 0.12)' },
        'pagando':     { color: '#f59e0b', texto: 'Procesando pago',  bg: 'rgba(245, 158, 11, 0.12)' },
        'confirmando': { color: '#22d3ee', texto: 'Confirmando',         bg: 'rgba(34, 211, 238, 0.12)' },
        'pagada':      { color: '#00d68f', texto: 'Pagada',                    bg: 'rgba(0, 214, 143, 0.12)' },
        'activa':      { color: '#00d68f', texto: 'Activa',                    bg: 'rgba(0, 214, 143, 0.12)' },
        'activada':    { color: '#00d68f', texto: 'Activa',                    bg: 'rgba(0, 214, 143, 0.12)' },
        'completado':  { color: '#00d68f', texto: 'Completado',            bg: 'rgba(0, 214, 143, 0.12)' },
        'cancelada':   { color: '#ff3366', texto: 'Cancelada',              bg: 'rgba(255, 51, 102, 0.12)' },
        'cancelado':   { color: '#ff3366', texto: 'Cancelada',              bg: 'rgba(255, 51, 102, 0.12)' }
    };
    return map[estado] || {
        color: '#8aa8b8',
        texto: estado || 'Desconocido',
        bg: 'rgba(138, 168, 184, 0.12)'
    };
}

// ================================================================
// CARGAR ÓRDENES DE INTERNET
// ================================================================
async function cargarOrdenesInternet() {
    var list = document.getElementById('ordenesInternetList');
    var contador = document.getElementById('internetOrdenesCount');
    if (!list) return;

    list.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg><h4>Cargando órdenes...</h4></div>';

    try {
        var client = window.supabaseClient;
        if (!client) throw new Error('Supabase no disponible');
        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;
        if (!session) {
            list.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg><h4>Inicia sesión</h4><p>Para ver tu historial de compras</p></div>';
            return;
        }

        var response = await client
            .from('ordenes_internet')
            .select('*')
            .eq('usuario_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (response.error) throw response.error;
        ordenesInternet = response.data || [];
        if (contador) contador.textContent = ordenesInternet.length;

        if (ordenesInternet.length === 0) {
            list.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg><h4>Sin compras de Internet</h4><p>Cuando compres un paquete aparecerá aquí</p></div>';
            return;
        }
        renderOrdenesInternet();
    } catch (error) {
        console.error('Error cargando órdenes Internet:', error);
        list.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><h4>Error al cargar</h4><p style="font-size:0.75rem;">' + escaparHTML(error.message) + '</p></div>';
    }
}

// ================================================================
// RENDERIZAR ÓRDENES CON FILTRO APLICADO
// ================================================================
function renderOrdenesInternet() {
    var list = document.getElementById('ordenesInternetList');
    if (!list) return;

    var filtered = ordenesInternet;
    if (filtroInternet !== 'all') {
        var grupo = GRUPOS_ESTADO_INTERNET[filtroInternet] || [filtroInternet];
        filtered = ordenesInternet.filter(function(o) {
            return grupo.indexOf(o.estado) !== -1;
        });
    }

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg><h4>Sin órdenes en este filtro</h4></div>';
        return;
    }

    list.innerHTML = filtered.map(function(o) {
        var info = estadoInfoInternet(o.estado);
        var esActiva = ['activa', 'activada', 'completado', 'pagada'].indexOf(o.estado) !== -1;
        return '<div class="publicacion-card" style="border-left:3px solid ' + info.color + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">' +
                '<div style="flex:1;min-width:180px;">' +
                    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                        '<svg class="icon" viewBox="0 0 24 24"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' +
                        '<strong style="color:var(--gold);font-size:0.9rem;font-family:\'Orbitron\',monospace;">' + escaparHTML(o.plan_nombre || 'Paquete') + '</strong>' +
                    '</div>' +
                    '<div style="color:var(--text-secondary);font-size:0.8rem;line-height:1.6;"><strong>' + (o.datos_gb || 0) + ' GB</strong> · ' + (o.duracion_dias || 0) + ' días</div>' +
                    '<div style="color:var(--text-muted);font-size:0.7rem;margin-top:4px;">' + escaparHTML(o.telefono_activacion || '—') + '</div>' +
                '</div>' +
                '<div style="text-align:right;min-width:140px;">' +
                    '<div style="background:' + info.bg + ';color:' + info.color + ';padding:4px 12px;border-radius:20px;font-size:0.65rem;font-weight:700;display:inline-block;margin-bottom:6px;">' + escaparHTML(info.texto) + '</div>' +
                    '<div style="color:var(--gold);font-family:\'Orbitron\',monospace;font-size:1rem;font-weight:700;">$' + parseFloat(o.monto_mxn || 0).toFixed(2) + ' MXN</div>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.5);font-size:0.65rem;color:var(--text-muted);flex-wrap:wrap;gap:6px;">' +
                '<span>' + formatearFechaInternet(o.created_at) + '</span>' +
                (esActiva && o.activado_en ? '<span style="color:var(--success);">' + formatearFechaInternet(o.activado_en) + '</span>' : '') +
            '</div>' +
        '</div>';
    }).join('');
}

// ================================================================
// FILTRAR ÓRDENES POR ESTADO
// ================================================================
function filtrarOrdenesInternet(filtro) {
    filtroInternet = filtro;
    document.querySelectorAll('.internet-filter').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.filter === filtro);
    });
    renderOrdenesInternet();
}