// ================================================================
// PERFIL · REPARTIDOR
// ================================================================
// Muestra el estado del usuario como repartidor de Csariel's y
// permite navegar al panel/registro según corresponda.
// Depende de: perfil-config.js, perfil-utils.js
//
// CAMBIO v2 (traducciones):
// - Todos los textos usan perfilT(clave, respaldo).
// - El puntaje y el motivo de rechazo se insertan con variables.
// ================================================================

// Reemplaza {nombre} dentro de una traducción por su valor
function repTexto(clave, respaldo, vars) {
    var texto = perfilT(clave, respaldo);
    if (vars) {
        Object.keys(vars).forEach(function (nombre) {
            texto = texto.split('{' + nombre + '}').join(String(vars[nombre]));
        });
    }
    return texto;
}

// ================================================================
// VERIFICAR ESTADO DEL REPARTIDOR
// ================================================================
async function verificarEstadoRepartidorPerfil() {
    try {
        var section = document.getElementById('repartidorSection');
        var badge = document.getElementById('repBadge');
        var info = document.getElementById('repInfo');
        var btn = document.getElementById('repBtn');
        if (!section) return;

        var client = window.supabaseClient;
        if (!client) return;

        var session = await client.auth.getSession();
        if (!session.data.session) return;
        var usuarioId = session.data.session.user.id;

        var result = await client
            .from('mercado_repartidores')
            .select('estado_verificacion, score_confianza, motivo_rechazo')
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        section.style.display = 'block';

        // No registrado
        if (result.error || !result.data) {
            badge.textContent = perfilT('perfil_rep_se_primero', 'Sé el primero');
            badge.className = 'rep-badge no-registrado';
            info.innerHTML = perfilT(
                'perfil_rep_no_registrado_desc',
                'Gana dinero entregando pedidos en tu ciudad. Regístrate como repartidor y empieza hoy mismo. <strong>Verificación 100% automática</strong>, sin esperas.'
            );
            btn.textContent = perfilT('perfil_rep_registrarme', 'Registrarme como repartidor');
            btn.className = 'rep-btn registrar';
            return;
        }

        var estado = result.data.estado_verificacion;

        if (estado === 'activo') {
            badge.textContent = perfilT('perfil_rep_verificado', 'Verificado');
            badge.className = 'rep-badge activo';
            var score = Number(result.data.score_confianza) || 100;
            info.innerHTML = repTexto(
                'perfil_rep_activo_desc',
                'Eres repartidor verificado. Puedes recibir pedidos ahora mismo. <strong>Score: {score}</strong>',
                { score: score }
            );
            btn.textContent = perfilT('perfil_rep_ir_panel', 'Ir a mi panel de repartidor');
            btn.className = 'rep-btn ir-panel';
        } else if (estado === 'procesando' || estado === 'revision_manual') {
            badge.textContent = perfilT('perfil_rep_en_revision', 'En revisión');
            badge.className = 'rep-badge pendiente';
            info.innerHTML = perfilT(
                'perfil_rep_revision_desc',
                'Estamos verificando tu identidad. Te avisaremos cuando termine. <strong>Esto puede tomar hasta 24 horas.</strong>'
            );
            btn.textContent = perfilT('perfil_rep_ver_estado', 'Ver estado de verificación');
            btn.className = 'rep-btn ver-estado';
        } else if (estado === 'rechazado') {
            badge.textContent = perfilT('perfil_rep_rechazado', 'Rechazado');
            badge.className = 'rep-badge rechazado';
            var motivo = result.data.motivo_rechazo
                ? escapeHtmlPerfil(result.data.motivo_rechazo)
                : perfilT('perfil_rep_revisa_requisitos', 'Revisa los requisitos');
            info.innerHTML = repTexto(
                'perfil_rep_rechazado_desc',
                'Tu registro fue rechazado. <strong>Motivo:</strong> {motivo}',
                { motivo: motivo }
            );
            btn.textContent = perfilT('perfil_rep_reintentar', 'Volver a intentar');
            btn.className = 'rep-btn reintentar';
        } else {
            badge.textContent = perfilT('perfil_rep_completar', 'Completar');
            badge.className = 'rep-badge pendiente';
            info.innerHTML = perfilT(
                'perfil_rep_pendiente_desc',
                'Tienes un registro pendiente. <strong>Complétalo para empezar a ganar.</strong>'
            );
            btn.textContent = perfilT('perfil_rep_completar_registro', 'Completar registro');
            btn.className = 'rep-btn registrar';
        }
    } catch (e) {
        console.warn('Error verificando estado repartidor:', e);
    }
}

// ================================================================
// IR AL REPARTIDOR (según estado)
// ================================================================
async function irARepartidorDesdePerfil() {
    try {
        var client = window.supabaseClient;
        if (!client) return;

        var session = await client.auth.getSession();
        if (!session.data.session) {
            if (window.showToast) {
                window.showToast(perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'warning');
            }
            return;
        }
        var usuarioId = session.data.session.user.id;

        var result = await client
            .from('mercado_repartidores')
            .select('estado_verificacion')
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        // No registrado → registro
        if (result.error || !result.data) {
            window.location.href = '/features/mercado/repartidor/registro.html';
            return;
        }

        var estado = result.data.estado_verificacion;

        if (estado === 'activo') {
            window.location.href = '/features/mercado/repartidor/panel.html';
        } else if (estado === 'rechazado' || estado === 'procesando' || estado === 'revision_manual') {
            window.location.href = '/features/mercado/repartidor/estado-verificacion.html';
        } else {
            window.location.href = '/features/mercado/repartidor/registro.html';
        }
    } catch (e) {
        console.error('Error:', e);
        window.location.href = '/features/mercado/repartidor/registro.html';
    }
}