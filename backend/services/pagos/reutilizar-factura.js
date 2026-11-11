// ================================================================
// services/pagos/reutilizar-factura.js — Csariel's
// Decide si reutilizar una factura pendiente de NOWPayments o crear una nueva.
// Regla: nunca reutilizar sin confirmar el estado real en NOWPayments.
// ================================================================

'use strict';

const axios = require('axios');

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1/payment';

// Estados en los que la misma dirección sigue siendo útil para el usuario
const ESTADOS_REUTILIZABLES = ['waiting', 'confirming', 'sending'];

// Estados que deben cerrarse localmente para no bloquear nada
const ESTADOS_CERRADOS = ['expired', 'failed', 'refunded', 'canceled', 'cancelled'];

async function consultarEstadoNP(paymentId) {
    const r = await axios.get(`${NOWPAYMENTS_API_URL}/${encodeURIComponent(paymentId)}`, {
        headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY },
        timeout: 10000
    });
    return {
        status: String(r.data?.payment_status || 'unknown').toLowerCase(),
        payAddress: r.data?.pay_address || null,
        payAmount: r.data?.pay_amount != null ? Number(r.data.pay_amount) : null,
        payCurrency: r.data?.pay_currency || null
    };
}

/**
 * Busca una factura viva en la tabla indicada con los mismos filtros.
 *
 * @param {object} opts
 * @param {object} opts.supabaseAdmin  cliente con service_role
 * @param {string} opts.tabla          'pagos_anuncios' | 'pagos_membresia' | ...
 * @param {object} opts.filtros        ej. { usuario_id, anuncio_id, semanas, pay_currency }
 * @returns {Promise<
 *   { modo: 'reutilizar', fila, np } |
 *   { modo: 'crear' } |
 *   { modo: 'bloqueado', motivo, fila, np }
 * >}
 */
async function decidirFactura({ supabaseAdmin, tabla, filtros }) {
    let q = supabaseAdmin
        .from(tabla)
        .select('*')
        .eq('estado', 'pendiente')
        .not('payment_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

    for (const [columna, valor] of Object.entries(filtros)) {
        q = q.eq(columna, valor);
    }

    const { data: fila, error } = await q.maybeSingle();
    if (error) throw error;
    if (!fila) return { modo: 'crear' };

    // La verdad la tiene NOWPayments, no nuestra base
    const np = await consultarEstadoNP(fila.payment_id);

    if (np.status === 'partially_paid') {
        // Ya hay fondos parciales en esa dirección: no se reutiliza ni se crea otra
        // sin revisión, o el usuario pagaría dos veces. Lo resuelve soporte.
        return { modo: 'bloqueado', motivo: 'pago_parcial', fila, np };
    }

    if (ESTADOS_REUTILIZABLES.includes(np.status)) {
        return { modo: 'reutilizar', fila, np };
    }

    if (ESTADOS_CERRADOS.includes(np.status)) {
        // Factura muerta: se cierra localmente para que no bloquee archivar ni la limpieza
        await supabaseAdmin
            .from(tabla)
            .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
            .eq('id', fila.id)
            .eq('estado', 'pendiente');
        return { modo: 'crear' };
    }

    // Estado desconocido: no arriesgar; se trata como bloqueado hasta revisar
    return { modo: 'bloqueado', motivo: `estado_desconocido_${np.status}`, fila, np };
}

module.exports = { decidirFactura, consultarEstadoNP };