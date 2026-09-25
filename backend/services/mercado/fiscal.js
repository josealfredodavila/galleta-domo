'use strict';

/**
 * ================================================================
 * MERCADO · MOTOR FISCAL
 * ================================================================
 *
 * IMPORTANTE:
 * - Las tasas NO se queman en el código.
 * - Las reglas normales se leen desde mercado_configuracion.
 * - La ausencia de RFC validado NO se interpreta automáticamente
 *   como una tasa fiscal universal.
 * - Para operar sin RFC validado debe existir una configuración
 *   fiscal explícita de contingencia.
 *
 * La versión aplicada queda almacenada en la operación.
 * ================================================================
 */

const FISCAL_VERSION =
    process.env.MERCADO_REGLA_FISCAL_VERSION ||
    '2026-09';

function redondear(monto) {
    return Number(
        (Number(monto) || 0).toFixed(2)
    );
}

function convertirTasa(valor, clave) {
    const tasa = Number(valor);

    if (
        !Number.isFinite(tasa) ||
        tasa < 0 ||
        tasa > 100
    ) {
        throw new Error(
            `Tasa fiscal inválida en configuración: ${clave}`
        );
    }

    return tasa / 100;
}

async function cargarConfiguracionFiscal(
    supabaseAdmin
) {
    const claves = [
        // RFC validado
        'retencion_isr_vendedor',
        'retencion_iva_vendedor',
        'retencion_isr_repartidor',
        'retencion_iva_repartidor',

        // Contingencia sin RFC validado
        'retencion_isr_vendedor_sin_rfc',
        'retencion_iva_vendedor_sin_rfc',
        'retencion_isr_repartidor_sin_rfc',
        'retencion_iva_repartidor_sin_rfc'
    ];

    const {
        data,
        error
    } = await supabaseAdmin
        .from('mercado_configuracion')
        .select('clave, valor')
        .in('clave', claves);

    if (error) {
        throw error;
    }

    const config = {};

    for (const row of data || []) {
        config[row.clave] = row.valor;
    }

    return config;
}

/**
 * Calcula la retención fiscal.
 *
 * @param {Object} params
 * @param {Object} params.supabaseAdmin
 * @param {'vendedor'|'repartidor'} params.tipoParticipante
 * @param {string} params.tipoOperacion
 * @param {number} params.baseMxn
 * @param {boolean} params.rfcValidado
 */
async function calcularRetencionFiscal({
    supabaseAdmin,
    tipoParticipante,
    tipoOperacion,
    baseMxn,
    rfcValidado = false
}) {
    const base = Number(baseMxn);

    if (
        !Number.isFinite(base) ||
        base < 0
    ) {
        throw new Error(
            'base_retencion_mxn inválida'
        );
    }

    if (
        ![
            'vendedor',
            'repartidor'
        ].includes(tipoParticipante)
    ) {
        throw new Error(
            'tipo_participante inválido'
        );
    }

    const config =
        await cargarConfiguracionFiscal(
            supabaseAdmin
        );

    const prefijo =
        tipoParticipante === 'vendedor'
            ? 'vendedor'
            : 'repartidor';

    let claveIsr;
    let claveIva;
    let reglaFiscal;

    if (rfcValidado) {

        claveIsr =
            `retencion_isr_${prefijo}`;

        claveIva =
            `retencion_iva_${prefijo}`;

        reglaFiscal =
            'MERCADO_CONFIG_RFC_VALIDADO';

    } else {

        /*
         * NO se devuelve 0%.
         *
         * Tampoco se inventa automáticamente 20%/16%.
         *
         * La plataforma exige una regla de contingencia
         * explícitamente configurada en Supabase.
         */

        claveIsr =
            `retencion_isr_${prefijo}_sin_rfc`;

        claveIva =
            `retencion_iva_${prefijo}_sin_rfc`;

        reglaFiscal =
            'MERCADO_CONFIG_SIN_RFC_VALIDADO';

        if (
            config[claveIsr] === undefined ||
            config[claveIva] === undefined
        ) {
            const error =
                new Error(
                    'No existe una regla fiscal de contingencia configurada para participante sin RFC validado'
                );

            error.code =
                'FISCAL_RULE_MISSING';

            error.tipo_participante =
                tipoParticipante;

            error.clave_isr =
                claveIsr;

            error.clave_iva =
                claveIva;

            throw error;
        }
    }

    const tasaIsr =
        convertirTasa(
            config[claveIsr],
            claveIsr
        );

    const tasaIva =
        convertirTasa(
            config[claveIva],
            claveIva
        );

    const isrRetenido =
        redondear(
            base * tasaIsr
        );

    const ivaRetenido =
        redondear(
            base * tasaIva
        );

    return {
        tipo_participante:
            tipoParticipante,

        tipo_operacion:
            tipoOperacion,

        base_retencion_mxn:
            redondear(base),

        tasa_isr:
            tasaIsr,

        tasa_iva:
            tasaIva,

        isr_retenido_mxn:
            isrRetenido,

        iva_retenido_mxn:
            ivaRetenido,

        iva_mxn:
            ivaRetenido,

        regla_fiscal:
            reglaFiscal,

        version_regla_fiscal:
            FISCAL_VERSION,

        calculado_en:
            new Date().toISOString()
    };
}

module.exports = {
    FISCAL_VERSION,
    calcularRetencionFiscal
};