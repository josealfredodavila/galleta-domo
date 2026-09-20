// ================================================================
// ROUTES/PAY/CUENTAS.JS
// CSARIEL'S PAY - ROUTER DE CUENTAS, SALDOS Y MOVIMIENTOS
// ================================================================
// Endpoints:
//   GET /api/pay/cuentas/mi-cuenta
//   GET /api/pay/cuentas/mi-cuenta/saldos
//   GET /api/pay/cuentas/mi-cuenta/movimientos
//   GET /api/pay/cuentas/mi-cuenta/resumen
//   GET /api/pay/cuentas/:cuentaId
//
// Todos privados (Bearer token de Supabase).
// Ownership siempre verificado.
// El frontend NUNCA puede modificar saldos desde aquí: solo lectura.
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');
const { verificarToken } = require('../../middleware/auth');

const errors = require('../../services/pay/errors');

// ================================================================
// HELPERS INTERNOS
// ================================================================

/**
 * Devuelve la cuenta Pay del usuario.
 * Prioriza vendedor si tiene ambos (por ahora).
 * Devuelve null si no tiene.
 */
async function obtenerCuentaDelUsuario(usuarioId) {
    const { data, error } = await supabaseAdmin
        .from('pay_cuentas')
        .select('id, usuario_id, tipo, tienda_id, repartidor_id, estado, moneda_principal, created_at, updated_at')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Cuentas] Error buscando cuenta: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    return data || null;
}

/**
 * Verifica ownership de una cuenta específica.
 */
async function verificarOwnershipCuenta(cuentaId, usuarioId) {
    const { data, error } = await supabaseAdmin
        .from('pay_cuentas')
        .select('id, usuario_id, tipo, tienda_id, repartidor_id, estado, moneda_principal, created_at, updated_at')
        .eq('id', cuentaId)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Cuentas] Error verificando ownership: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (!data) {
        throw errors.errorCuentaNoEncontrada({ cuenta_id: cuentaId });
    }

    if (data.usuario_id !== usuarioId) {
        throw errors.errorNoEsPropietario();
    }

    return data;
}

/**
 * Devuelve los saldos de una cuenta.
 */
async function obtenerSaldosDeCuenta(cuentaId) {
    const { data, error } = await supabaseAdmin
        .from('pay_saldos')
        .select('disponible_mxn, pendiente_mxn, updated_at')
        .eq('cuenta_id', cuentaId)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Cuentas] Error consultando saldos: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (!data) {
        return {
            disponible_mxn: 0,
            pendiente_mxn: 0,
            total_mxn: 0,
            updated_at: null
        };
    }

    const disponible = Number(data.disponible_mxn) || 0;
    const pendiente = Number(data.pendiente_mxn) || 0;

    return {
        disponible_mxn: disponible,
        pendiente_mxn: pendiente,
        total_mxn: Math.round((disponible + pendiente) * 100) / 100,
        updated_at: data.updated_at
    };
}

/**
 * Lista movimientos de una cuenta con paginación y filtros.
 */
async function listarMovimientos(cuentaId, opciones) {
    const opts = opciones || {};

    const limite = Math.min(Math.max(parseInt(opts.limite, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);

    let query = supabaseAdmin
        .from('pay_movimientos')
        .select('id, tipo, monto_mxn, signo, estado, referencia, metadata, intencion_id, retiro_id, created_at', { count: 'exact' })
        .eq('cuenta_id', cuentaId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limite - 1);

    if (opts.tipo) {
        const tiposValidos = ['credito_pago', 'liberacion', 'retiro', 'reembolso', 'ajuste'];
        if (tiposValidos.includes(opts.tipo)) {
            query = query.eq('tipo', opts.tipo);
        }
    }

    if (opts.estado) {
        const estadosValidos = ['pendiente', 'confirmado', 'reversado'];
        if (estadosValidos.includes(opts.estado)) {
            query = query.eq('estado', opts.estado);
        }
    }

    const { data, error, count } = await query;

    if (error) {
        logger.error(`[Pay Cuentas] Error listando movimientos: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    return {
        movimientos: data || [],
        total: count || 0,
        limite: limite,
        offset: offset
    };
}

/**
 * Calcula totales de un periodo (o global) desde pay_movimientos.
 * Solo suma movimientos confirmados.
 */
async function calcularTotales(cuentaId) {
    const { data, error } = await supabaseAdmin
        .from('pay_movimientos')
        .select('tipo, monto_mxn, signo, estado')
        .eq('cuenta_id', cuentaId);

    if (error) {
        logger.error(`[Pay Cuentas] Error calculando totales: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    const movs = data || [];

    let totalRecibido = 0;      // créditos confirmados
    let totalRetirado = 0;      // retiros confirmados
    let totalPendiente = 0;     // movimientos en estado pendiente
    let totalReversado = 0;     // movimientos reversados

    for (const m of movs) {
        const monto = Number(m.monto_mxn) || 0;

        if (m.estado === 'reversado') {
            totalReversado += monto;
            continue;
        }

        if (m.estado === 'pendiente') {
            totalPendiente += monto;
            continue;
        }

        // estado === 'confirmado'
        if (m.tipo === 'credito_pago' || m.tipo === 'liberacion') {
            totalRecibido += monto;
        } else if (m.tipo === 'retiro') {
            totalRetirado += monto;
        }
    }

    return {
        total_recibido_mxn: Math.round(totalRecibido * 100) / 100,
        total_retirado_mxn: Math.round(totalRetirado * 100) / 100,
        total_pendiente_mxn: Math.round(totalPendiente * 100) / 100,
        total_reversado_mxn: Math.round(totalReversado * 100) / 100,
        movimientos_totales: movs.length
    };
}

// ================================================================
// GET /api/pay/cuentas/mi-cuenta
// PRIVADO - Cuenta Pay del usuario autenticado.
// ================================================================

router.get(
    '/mi-cuenta',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const cuenta = await obtenerCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(200).json({
                    success: true,
                    data: {
                        tiene_cuenta: false,
                        cuenta: null,
                        mensaje: 'Aún no tienes una cuenta de Csariel\'s Pay. Abre una tienda o regístrate como repartidor.'
                    }
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    tiene_cuenta: true,
                    cuenta: cuenta
                }
            });

        } catch (err) {
            logger.error(`[Pay Cuentas] Error en mi-cuenta: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// GET /api/pay/cuentas/mi-cuenta/saldos
// PRIVADO - Saldos actuales.
// ================================================================

router.get(
    '/mi-cuenta/saldos',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const cuenta = await obtenerCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(200).json({
                    success: true,
                    data: {
                        disponible_mxn: 0,
                        pendiente_mxn: 0,
                        total_mxn: 0,
                        updated_at: null,
                        tiene_cuenta: false
                    }
                });
            }

            const saldos = await obtenerSaldosDeCuenta(cuenta.id);

            return res.status(200).json({
                success: true,
                data: Object.assign(
                    { cuenta_id: cuenta.id, tipo: cuenta.tipo, moneda_principal: cuenta.moneda_principal, tiene_cuenta: true },
                    saldos
                )
            });

        } catch (err) {
            logger.error(`[Pay Cuentas] Error en saldos: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// GET /api/pay/cuentas/mi-cuenta/movimientos
// PRIVADO - Ledger del usuario.
// Query: ?tipo=credito_pago&estado=confirmado&limite=50&offset=0
// ================================================================

router.get(
    '/mi-cuenta/movimientos',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const cuenta = await obtenerCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(200).json({
                    success: true,
                    data: {
                        movimientos: [],
                        total: 0,
                        limite: 50,
                        offset: 0,
                        tiene_cuenta: false
                    }
                });
            }

            const resultado = await listarMovimientos(cuenta.id, {
                tipo: req.query.tipo || null,
                estado: req.query.estado || null,
                limite: req.query.limite,
                offset: req.query.offset
            });

            return res.status(200).json({
                success: true,
                data: Object.assign(
                    { tiene_cuenta: true, cuenta_id: cuenta.id },
                    resultado
                )
            });

        } catch (err) {
            logger.error(`[Pay Cuentas] Error en movimientos: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// GET /api/pay/cuentas/mi-cuenta/resumen
// PRIVADO - Todo en uno para el panel.
// Devuelve cuenta + saldos + últimos 10 movimientos + totales.
// ================================================================

router.get(
    '/mi-cuenta/resumen',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const cuenta = await obtenerCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(200).json({
                    success: true,
                    data: {
                        tiene_cuenta: false,
                        cuenta: null,
                        saldos: {
                            disponible_mxn: 0,
                            pendiente_mxn: 0,
                            total_mxn: 0,
                            updated_at: null
                        },
                        movimientos_recientes: [],
                        totales: {
                            total_recibido_mxn: 0,
                            total_retirado_mxn: 0,
                            total_pendiente_mxn: 0,
                            total_reversado_mxn: 0,
                            movimientos_totales: 0
                        }
                    }
                });
            }

            // Cargar en paralelo: saldos, últimos movimientos, totales
            const [saldos, movsRecientes, totales] = await Promise.all([
                obtenerSaldosDeCuenta(cuenta.id),
                listarMovimientos(cuenta.id, { limite: 10, offset: 0 }),
                calcularTotales(cuenta.id)
            ]);

            return res.status(200).json({
                success: true,
                data: {
                    tiene_cuenta: true,
                    cuenta: cuenta,
                    saldos: saldos,
                    movimientos_recientes: movsRecientes.movimientos,
                    totales: totales
                }
            });

        } catch (err) {
            logger.error(`[Pay Cuentas] Error en resumen: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// GET /api/pay/cuentas/:cuentaId
// PRIVADO - Consulta una cuenta específica (con ownership).
// ================================================================

router.get(
    '/:cuentaId',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const cuentaId = req.params.cuentaId;

            if (!cuentaId) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el ID de cuenta'
                });
            }

            const cuenta = await verificarOwnershipCuenta(cuentaId, usuarioId);
            const saldos = await obtenerSaldosDeCuenta(cuenta.id);

            return res.status(200).json({
                success: true,
                data: {
                    cuenta: cuenta,
                    saldos: saldos
                }
            });

        } catch (err) {
            logger.error(`[Pay Cuentas] Error en /:cuentaId: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// EXPORTAR
// ================================================================

module.exports = router;