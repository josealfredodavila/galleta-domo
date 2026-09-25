'use strict';

/**
 * ================================================================
 * MERCADO · PEDIDOS
 * ================================================================
 *
 * Endpoints:
 *
 * POST /api/mercado/pedidos
 * POST /api/mercado/pedidos/:id/estado
 *
 * Responsabilidad:
 * - Autenticación JWT Supabase
 * - Crear pedidos desde valores confiables de DB
 * - Calcular comisiones
 * - Calcular retenciones
 * - Controlar máquina de estados
 * - Impedir que el frontend modifique valores financieros
 *
 * ================================================================
 */

const express = require('express');
const {
    createClient
} = require('@supabase/supabase-js');

const {
    calcularRetencionFiscal
} = require('../services/mercado/fiscal');

const {
    obtenerTipoCambioUSDTMXN,
    convertirCriptoAMxn
} = require('../services/mercado/tipoCambio');

const router =
    express.Router();

/* ================================================================
   SUPABASE ADMIN
================================================================ */

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
) {
    console.warn(
        '⚠️ Mercado pedidos: Supabase Admin no está configurado.'
    );
}

const supabaseAdmin =
    SUPABASE_URL &&
    SUPABASE_SERVICE_ROLE_KEY
        ? createClient(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false
                }
            }
        )
        : null;

/* ================================================================
   AUTENTICACIÓN
================================================================ */

async function autenticarUsuario(
    req,
    res,
    next
) {
    try {

        if (!supabaseAdmin) {
            return res.status(500).json({
                ok: false,
                error:
                    'Supabase Admin no configurado'
            });
        }

        const authorization =
            req.headers.authorization || '';

        if (
            !authorization.startsWith(
                'Bearer '
            )
        ) {
            return res.status(401).json({
                ok: false,
                error:
                    'Falta token de autenticación'
            });
        }

        const token =
            authorization
                .slice(7)
                .trim();

        if (!token) {
            return res.status(401).json({
                ok: false,
                error:
                    'Token de autenticación vacío'
            });
        }

        const {
            data,
            error
        } =
            await supabaseAdmin
                .auth
                .getUser(token);

        if (
            error ||
            !data ||
            !data.user
        ) {
            return res.status(401).json({
                ok: false,
                error:
                    'Token inválido o expirado'
            });
        }

        req.usuario =
            data.user;

        next();

    } catch (error) {

        console.error(
            '[Mercado Pedidos] Error autenticando:',
            error
        );

        return res.status(401).json({
            ok: false,
            error:
                'Error de autenticación'
        });
    }
}

/* ================================================================
   HELPERS
================================================================ */

function numeroPositivo(
    valor
) {
    const numero =
        Number(valor);

    return (
        Number.isFinite(numero) &&
        numero > 0
    );
}

function numeroNoNegativo(
    valor
) {
    const numero =
        Number(valor);

    return (
        Number.isFinite(numero) &&
        numero >= 0
    );
}

function dinero(
    valor
) {
    return Number(
        (Number(valor) || 0).toFixed(2)
    );
}

function generarCodigoPedido() {
    const ahora =
        Date.now()
            .toString(36)
            .toUpperCase();

    const aleatorio =
        Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();

    return `PED-${ahora}-${aleatorio}`;
}

/* ================================================================
   CONFIGURACIÓN MERCADO
================================================================ */

async function obtenerConfiguracion() {

    const {
        data,
        error
    } =
        await supabaseAdmin
            .from('mercado_configuracion')
            .select(
                'clave, valor'
            );

    if (error) {
        throw error;
    }

    const config = {};

    for (
        const row
        of data || []
    ) {
        config[row.clave] =
            row.valor;
    }

    return config;
}

/* ================================================================
   CREAR PEDIDO
================================================================ */

router.post(
    '/',
    autenticarUsuario,
    async (
        req,
        res
    ) => {

        try {

            const usuarioId =
                req.usuario.id;

            const {
                tienda_id,
                items,
                direccion_entrega,
                latitud_entrega,
                longitud_entrega,
                telefono_contacto,
                notas,
                tipo_entrega,
                metodo_pago_comprador
            } = req.body;

            /* ----------------------------------------------------
               VALIDACIONES BÁSICAS
            ---------------------------------------------------- */

            if (
                !numeroPositivo(
                    tienda_id
                )
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        'tienda_id inválido'
                });
            }

            if (
                !Array.isArray(items) ||
                items.length === 0
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        'El pedido debe contener al menos un producto'
                });
            }

            if (
                items.length > 100
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        'Demasiados productos en un pedido'
                });
            }

            const tipoEntrega =
                tipo_entrega ||
                'delivery';

            if (
                ![
                    'delivery',
                    'pickup'
                ].includes(
                    tipoEntrega
                )
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        'tipo_entrega inválido'
                });
            }

            if (
                tipoEntrega ===
                'delivery' &&
                !direccion_entrega
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        'La dirección de entrega es obligatoria'
                });
            }

            /* ----------------------------------------------------
               OBTENER TIENDA DESDE DB
            ---------------------------------------------------- */

            const {
                data: tienda,
                error: tiendaError
            } =
                await supabaseAdmin
                    .from('mercado_tiendas')
                    .select(`
                        id,
                        usuario_id,
                        nombre_negocio,
                        estado,
                        acepta_delivery,
                        acepta_pickup,
                        envio_mxn,
                        comision_porcentaje
                    `)
                    .eq(
                        'id',
                        tienda_id
                    )
                    .maybeSingle();

            if (
                tiendaError
            ) {
                throw tiendaError;
            }

            if (!tienda) {
                return res.status(404).json({
                    ok: false,
                    error:
                        'Tienda no encontrada'
                });
            }

            if (
                tienda.estado !==
                'activa'
            ) {
                return res.status(409).json({
                    ok: false,
                    error:
                        'La tienda no está activa'
                });
            }

            if (
                tipoEntrega ===
                    'delivery' &&
                tienda.acepta_delivery ===
                    false
            ) {
                return res.status(409).json({
                    ok: false,
                    error:
                        'La tienda no acepta entregas'
                });
            }

            if (
                tipoEntrega ===
                    'pickup' &&
                tienda.acepta_pickup ===
                    false
            ) {
                return res.status(409).json({
                    ok: false,
                    error:
                        'La tienda no acepta pickup'
                });
            }

            /* ----------------------------------------------------
               NORMALIZAR PRODUCTOS
            ---------------------------------------------------- */

            const cantidades = {};

            for (
                const item
                of items
            ) {

                const productoId =
                    Number(
                        item.producto_id
                    );

                const cantidad =
                    Number(
                        item.cantidad
                    );

                if (
                    !Number.isInteger(
                        productoId
                    ) ||
                    productoId <= 0
                ) {
                    return res.status(400).json({
                        ok: false,
                        error:
                            'producto_id inválido'
                    });
                }

                if (
                    !Number.isInteger(
                        cantidad
                    ) ||
                    cantidad <= 0 ||
                    cantidad > 1000
                ) {
                    return res.status(400).json({
                        ok: false,
                        error:
                            'Cantidad inválida'
                    });
                }

                cantidades[
                    productoId
                ] =
                    (
                        cantidades[
                            productoId
                        ] || 0
                    ) + cantidad;
            }

            const productoIds =
                Object.keys(
                    cantidades
                ).map(Number);

            /* ----------------------------------------------------
               PRODUCTOS DESDE DB
               NUNCA usamos precio enviado por frontend
            ---------------------------------------------------- */

            const {
                data: productos,
                error: productosError
            } =
                await supabaseAdmin
                    .from('mercado_productos')
                    .select(`
                        id,
                        tienda_id,
                        nombre,
                        precio_mxn,
                        precio_promocion,
                        stock,
                        stock_ilimitado,
                        activo,
                        fotos
                    `)
                    .in(
                        'id',
                        productoIds
                    )
                    .eq(
                        'tienda_id',
                        tienda.id
                    )
                    .eq(
                        'activo',
                        true
                    );

            if (
                productosError
            ) {
                throw productosError;
            }

            if (
                !productos ||
                productos.length !==
                    productoIds.length
            ) {
                return res.status(409).json({
                    ok: false,
                    error:
                        'Uno o más productos ya no están disponibles'
                });
            }

            /* ----------------------------------------------------
               CONSTRUIR ITEMS AUTORITATIVOS
            ---------------------------------------------------- */

            const itemsDB = [];

            let subtotal =
                0;

            let totalItems =
                0;

            for (
                const producto
                of productos
            ) {

                const cantidad =
                    cantidades[
                        producto.id
                    ];

                if (
                    !producto.stock_ilimitado &&
                    Number.isFinite(
                        Number(
                            producto.stock
                        )
                    ) &&
                    Number(
                        producto.stock
                    ) < cantidad
                ) {
                    return res.status(409).json({
                        ok: false,
                        error:
                            `Stock insuficiente para ${producto.nombre}`
                    });
                }

                const precio =
                    numeroNoNegativo(
                        producto.precio_promocion
                    ) &&
                    Number(
                        producto.precio_promocion
                    ) > 0
                        ? Number(
                            producto.precio_promocion
                        )
                        : Number(
                            producto.precio_mxn
                        );

                if (
                    !numeroNoNegativo(
                        precio
                    )
                ) {
                    return res.status(500).json({
                        ok: false,
                        error:
                            'Producto con precio inválido'
                    });
                }

                const itemSubtotal =
                    dinero(
                        precio *
                        cantidad
                    );

                subtotal +=
                    itemSubtotal;

                totalItems +=
                    cantidad;

                let fotoUrl =
                    null;

                if (
                    Array.isArray(
                        producto.fotos
                    ) &&
                    producto.fotos.length
                ) {
                    fotoUrl =
                        producto.fotos[0];
                }

                itemsDB.push({
                    producto_id:
                        producto.id,

                    nombre_producto:
                        producto.nombre,

                    precio_unitario:
                        dinero(precio),

                    cantidad,

                    subtotal:
                        itemSubtotal,

                    foto_url:
                        fotoUrl,

                    notas:
                        null
                });
            }

            subtotal =
                dinero(subtotal);

            /* ----------------------------------------------------
               CONFIGURACIÓN FINANCIERA
            ---------------------------------------------------- */

            const config =
                await obtenerConfiguracion();

            const comisionVendedorPct =
                Number(
                    config
                        .comision_vendedor_porcentaje
                );

            const comisionRepartidorPct =
                Number(
                    config
                        .comision_repartidor_porcentaje
                );

            const comisionComprador =
                Number(
                    config
                        .comision_comprador_mxn
                );

            if (
                !Number.isFinite(
                    comisionVendedorPct
                ) ||
                !Number.isFinite(
                    comisionRepartidorPct
                ) ||
                !Number.isFinite(
                    comisionComprador
                )
            ) {
                throw new Error(
                    'Configuración de comisiones inválida'
                );
            }

            /* ----------------------------------------------------
               ENVÍO
            ---------------------------------------------------- */

            const envio =
                tipoEntrega ===
                    'delivery'
                    ? dinero(
                        tienda.envio_mxn || 0
                    )
                    : 0;

            const envioCobrado =
                tipoEntrega ===
                    'delivery';

            /* ----------------------------------------------------
               COMISIONES
            ---------------------------------------------------- */

            const comisionVendedor =
                dinero(
                    subtotal *
                    (
                        comisionVendedorPct /
                        100
                    )
                );

            const comisionRepartidor =
                dinero(
                    envio *
                    (
                        comisionRepartidorPct /
                        100
                    )
                );

            const comisionComprador =
                dinero(
                    comisionComprador
                );

            const comisionTotal =
                dinero(
                    comisionVendedor +
                    comisionRepartidor +
                    comisionComprador
                );

            /*
             * Lo que recibe el vendedor antes de retenciones.
             */
            const baseVendedor =
                dinero(
                    subtotal -
                    comisionVendedor
                );

            /*
             * Lo que recibe el repartidor antes
             * de retenciones.
             */
            const baseRepartidor =
                dinero(
                    envio -
                    comisionRepartidor
                );

            /* ----------------------------------------------------
               RFC DEL VENDEDOR
            ---------------------------------------------------- */

            const {
                data: vendedor,
                error: vendedorError
            } =
                await supabaseAdmin
                    .from('mercado_tiendas')
                    .select(`
                        usuario_id,
                        rfc_validado,
                        rfc,
                        regimen_fiscal,
                        situacion_fiscal
                    `)
                    .eq(
                        'id',
                        tienda.id
                    )
                    .single();

            if (
                vendedorError
            ) {
                throw vendedorError;
            }

            /* ----------------------------------------------------
               RETENCIÓN VENDEDOR
            ---------------------------------------------------- */

            const fiscalVendedor =
                await calcularRetencionFiscal({
                    supabaseAdmin,

                    tipoParticipante:
                        'vendedor',

                    tipoOperacion:
                        'venta_producto',

                    baseMxn:
                        subtotal,

                    rfcValidado:
                        vendedor.rfc_validado === true
                });

            /* ----------------------------------------------------
               RETENCIÓN REPARTIDOR
               Se calcula como regla aplicable al participante.
               Si todavía no existe repartidor, se deja pendiente.
            ---------------------------------------------------- */

            let fiscalRepartidor =
                null;

            /*
             * El repartidor todavía no existe al crear
             * el pedido. Por tanto no inventamos su RFC
             * ni calculamos una retención a ciegas.
             *
             * Se calculará al asignarse/confirmarse el repartidor.
             */

            /* ----------------------------------------------------
               IVA / ISR VENDEDOR
            ---------------------------------------------------- */

            const isrVendedor =
                fiscalVendedor
                    .isr_retenido_mxn;

            const ivaVendedor =
                fiscalVendedor
                    .iva_retenido_mxn;

            const ivaComision =
                dinero(
                    comisionVendedor *
                    0
                );

            /*
             * El total cobrado al comprador no incluye
             * automáticamente impuestos del vendedor como
             * una comisión adicional.
             *
             * Los impuestos retenidos se registran sobre
             * la base correspondiente.
             */

            const montoVendedor =
                dinero(
                    baseVendedor -
                    isrVendedor -
                    ivaVendedor
                );

            /* ----------------------------------------------------
               TOTAL DEL COMPRADOR
            ---------------------------------------------------- */

            const total =
                dinero(
                    subtotal +
                    envio +
                    comisionComprador
                );

            /* ----------------------------------------------------
               FORMA DE PAGO
            ---------------------------------------------------- */

            const metodoPago =
                metodo_pago_comprador ||
                'efectivo';

            const metodosPermitidos = [
                'efectivo',
                'spei',
                'tarjeta',
                'usdt'
            ];

            if (
                !metodosPermitidos.includes(
                    metodoPago
                )
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        'Método de pago no soportado'
                });
            }

            /* ----------------------------------------------------
               SNAPSHOT USDT/MXN
               Solo para pagos USDT.
            ---------------------------------------------------- */

            let snapshotFX =
                null;

            let valorCriptoMxn =
                null;

            let criptoMonto =
                null;

            if (
                metodoPago ===
                'usdt'
            ) {

                snapshotFX =
                    await obtenerTipoCambioUSDTMXN();

                valorCriptoMxn =
                    dinero(total);

                criptoMonto =
                    Number(
                        (
                            total /
                            snapshotFX
                                .tipo_cambio_mxn
                        ).toFixed(8)
                    );
            }

            /* ----------------------------------------------------
               CREAR PEDIDO
            ---------------------------------------------------- */

            const ahora =
                new Date().toISOString();

            const pedidoInsert = {
                comprador_id:
                    usuarioId,

                tienda_id:
                    tienda.id,

                codigo:
                    generarCodigoPedido(),

                tipo_entrega:
                    tipoEntrega,

                subtotal_mxn:
                    subtotal,

                envio_mxn:
                    envio,

                total_mxn:
                    total,

                direccion_entrega:
                    direccion_entrega ||
                    null,

                latitud_entrega:
                    latitud_entrega !==
                        undefined
                        ? Number(
                            latitud_entrega
                        )
                        : null,

                longitud_entrega:
                    longitud_entrega !==
                        undefined
                        ? Number(
                            longitud_entrega
                        )
                        : null,

                telefono_contacto:
                    telefono_contacto ||
                    null,

                notas:
                    notas ||
                    null,

                estado:
                    'pendiente',

                forma_pago:
                    metodoPago,

                metodo_pago_comprador:
                    metodoPago,

                envio_cobrado_en_app:
                    envioCobrado,

                total_items:
                    totalItems,

                comision_vendedor_mxn:
                    comisionVendedor,

                comision_repartidor_mxn:
                    comisionRepartidor,

                comision_comprador_mxn:
                    comisionComprador,

                comision_total_plataforma_mxn:
                    comisionTotal,

                monto_al_vendedor_mxn:
                    montoVendedor,

                monto_al_repartidor_mxn:
                    0,

                iva_comision_mxn:
                    ivaComision,

                isr_retenido_vendedor_mxn:
                    isrVendedor,

                iva_retenido_vendedor_mxn:
                    ivaVendedor,

                isr_retenido_repartidor_mxn:
                    0,

                iva_retenido_repartidor_mxn:
                    0,

                cripto_usada:
                    metodoPago ===
                        'usdt'
                        ? 'USDT'
                        : null,

                cripto_monto:
                    criptoMonto !== null
                        ? String(
                            criptoMonto
                        )
                        : null,

                tipo_cambio_mxn:
                    snapshotFX
                        ? snapshotFX
                            .tipo_cambio_mxn
                        : null,

                valor_cripto_mxn:
                    valorCriptoMxn,

                tipo_cambio_fuente:
                    snapshotFX
                        ? snapshotFX
                            .tipo_cambio_fuente
                        : null,

                tipo_cambio_at:
                    snapshotFX
                        ? snapshotFX
                            .tipo_cambio_at
                        : null,

                created_at:
                    ahora,

                updated_at:
                    ahora
            };

            const {
                data: pedido,
                error: pedidoError
            } =
                await supabaseAdmin
                    .from('mercado_pedidos')
                    .insert(
                        pedidoInsert
                    )
                    .select()
                    .single();

            if (
                pedidoError
            ) {
                throw pedidoError;
            }

            /* ----------------------------------------------------
               INSERTAR ITEMS
            ---------------------------------------------------- */

            const itemsInsert =
                itemsDB.map(
                    item => ({
                        pedido_id:
                            pedido.id,

                        ...item,

                        created_at:
                            ahora
                    })
                );

            const {
                error: itemsError
            } =
                await supabaseAdmin
                    .from(
                        'mercado_pedido_items'
                    )
                    .insert(
                        itemsInsert
                    );

            if (
                itemsError
            ) {

                /*
                 * Compensación básica:
                 * si fallan los items, eliminamos el pedido
                 * recién creado.
                 *
                 * Para producción de máxima atomicidad,
                 * esto posteriormente debe migrarse a una
                 * función RPC transaccional.
                 */

                await supabaseAdmin
                    .from(
                        'mercado_pedidos'
                    )
                    .delete()
                    .eq(
                        'id',
                        pedido.id
                    );

                throw itemsError;
            }

            /* ----------------------------------------------------
               RESPUESTA
            ---------------------------------------------------- */

            return res.status(201).json({
                ok: true,

                pedido: {
                    id:
                        pedido.id,

                    codigo:
                        pedido.codigo,

                    estado:
                        pedido.estado,

                    subtotal_mxn:
                        pedido.subtotal_mxn,

                    envio_mxn:
                        pedido.envio_mxn,

                    total_mxn:
                        pedido.total_mxn,

                    total_items:
                        pedido.total_items,

                    metodo_pago:
                        pedido.metodo_pago_comprador,

                    cripto_monto:
                        pedido.cripto_monto,

                    tipo_cambio_mxn:
                        pedido.tipo_cambio_mxn,

                    tipo_cambio_fuente:
                        pedido.tipo_cambio_fuente,

                    tipo_cambio_at:
                        pedido.tipo_cambio_at
                }
            });

        } catch (error) {

            console.error(
                '[Mercado Pedidos] Error creando pedido:',
                error
            );

            if (
                error.code ===
                'FISCAL_RULE_MISSING'
            ) {
                return res.status(503).json({
                    ok: false,
                    error:
                        'No existe una regla fiscal configurada para esta operación.',
                    code:
                        'FISCAL_RULE_MISSING'
                });
            }

            return res.status(500).json({
                ok: false,
                error:
                    'No se pudo crear el pedido'
            });
        }
    }
);

/* ================================================================
   MÁQUINA DE ESTADOS
================================================================ */

const TRANSICIONES = {
    pendiente: {
        vendedor: [
            'aceptado',
            'rechazado'
        ],

        comprador: [
            'cancelado'
        ]
    },

    aceptado: {
        vendedor: [
            'preparando'
        ]
    },

    preparando: {
        vendedor: [
            'listo'
        ]
    },

    listo: {
        repartidor: [
            'asignado'
        ]
    },

    asignado: {
        repartidor: [
            'en_camino'
        ]
    },

    en_camino: {
        repartidor: [
            'entregado'
        ]
    }
};

/* ================================================================
   OBTENER ROL SOBRE PEDIDO
================================================================ */

async function obtenerRolPedido(
    pedido,
    usuarioId
) {

    if (
        pedido.comprador_id ===
        usuarioId
    ) {
        return 'comprador';
    }

    const {
        data: tienda
    } =
        await supabaseAdmin
            .from('mercado_tiendas')
            .select(
                'usuario_id'
            )
            .eq(
                'id',
                pedido.tienda_id
            )
            .maybeSingle();

    if (
        tienda &&
        tienda.usuario_id ===
            usuarioId
    ) {
        return 'vendedor';
    }

    /*
     * repartidor_id es UUID en el esquema real.
     */
    if (
        pedido.repartidor_id ===
        usuarioId
    ) {
        return 'repartidor';
    }

    return null;
}

/* ================================================================
   POST /:id/estado
================================================================ */

router.post(
    '/:id/estado',
    autenticarUsuario,
    async (
        req,
        res
    ) => {

        try {

            const pedidoId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    pedidoId
                ) ||
                pedidoId <= 0
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        'ID de pedido inválido'
                });
            }

            const {
                estado:
                    nuevoEstado,
                motivo
            } =
                req.body;

            if (
                typeof nuevoEstado !==
                'string'
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        'Falta el nuevo estado'
                });
            }

            const {
                data: pedido,
                error: pedidoError
            } =
                await supabaseAdmin
                    .from(
                        'mercado_pedidos'
                    )
                    .select('*')
                    .eq(
                        'id',
                        pedidoId
                    )
                    .maybeSingle();

            if (
                pedidoError
            ) {
                throw pedidoError;
            }

            if (!pedido) {
                return res.status(404).json({
                    ok: false,
                    error:
                        'Pedido no encontrado'
                });
            }

            const usuarioId =
                req.usuario.id;

            const rol =
                await obtenerRolPedido(
                    pedido,
                    usuarioId
                );

            if (!rol) {
                return res.status(403).json({
                    ok: false,
                    error:
                        'No tienes permisos sobre este pedido'
                });
            }

            const estadosPermitidos =
                TRANSICIONES[
                    pedido.estado
                ]?.[rol] || [];

            if (
                !estadosPermitidos.includes(
                    nuevoEstado
                )
            ) {
                return res.status(409).json({
                    ok: false,
                    error:
                        'Transición de estado no permitida',
                    estado_actual:
                        pedido.estado,
                    estado_solicitado:
                        nuevoEstado,
                    rol
                });
            }

            const ahora =
                new Date().toISOString();

            const cambios = {
                estado:
                    nuevoEstado,

                updated_at:
                    ahora
            };

            /* ----------------------------------------------------
               SELLER
            ---------------------------------------------------- */

            if (
                nuevoEstado ===
                'aceptado'
            ) {
                cambios.aceptado_en =
                    ahora;
            }

            if (
                nuevoEstado ===
                'rechazado'
            ) {
                cambios.cancelado_motivo =
                    motivo ||
                    'Pedido rechazado por el vendedor';

                cambios.cancelado_por =
                    'vendedor';

                cambios.cancelado_en =
                    ahora;
            }

            if (
                nuevoEstado ===
                'listo'
            ) {
                cambios.listo_en =
                    ahora;
            }

            /* ----------------------------------------------------
               COMPRADOR
            ---------------------------------------------------- */

            if (
                nuevoEstado ===
                'cancelado'
            ) {
                cambios.cancelado_en =
                    ahora;

                cambios.cancelado_motivo =
                    motivo ||
                    'Cancelado por el comprador';

                cambios.cancelado_por =
                    'comprador';
            }

            /* ----------------------------------------------------
               REPARTIDOR
            ---------------------------------------------------- */

            if (
                nuevoEstado ===
                'asignado'
            ) {

                /*
                 * El repartidor debe quedar identificado.
                 * Nunca aceptamos repartidor_id desde el body.
                 */
                cambios.repartidor_id =
                    usuarioId;

                cambios.asignado_en =
                    ahora;
            }

            if (
                nuevoEstado ===
                'en_camino'
            ) {
                cambios.en_camino_en =
                    ahora;
            }

            /* ----------------------------------------------------
               ENTREGA
            ---------------------------------------------------- */

            if (
                nuevoEstado ===
                'entregado'
            ) {

                cambios.entregado_en =
                    ahora;

                /*
                 * El frontend NO proporciona
                 * ganancia_repartidor.
                 *
                 * La calculamos con el valor financiero
                 * almacenado en el pedido.
                 */

                const gananciaBase =
                    Number(
                        pedido.envio_mxn ||
                        0
                    ) -
                    Number(
                        pedido.comision_repartidor_mxn ||
                        0
                    );

                cambios.ganancia_repartidor =
                    dinero(
                        Math.max(
                            0,
                            gananciaBase
                        )
                    );

                /*
                 * Recuperamos el RFC del repartidor
                 * para calcular la retención en el momento
                 * en que ya existe el participante real.
                 */

                const {
                    data: repartidor,
                    error:
                        repartidorError
                } =
                    await supabaseAdmin
                        .from(
                            'mercado_repartidores'
                        )
                        .select(`
                            usuario_id,
                            rfc_validado,
                            rfc,
                            regimen_fiscal,
                            situacion_fiscal
                        `)
                        .eq(
                            'usuario_id',
                            usuarioId
                        )
                        .maybeSingle();

                if (
                    repartidorError
                ) {
                    throw repartidorError;
                }

                if (
                    !repartidor
                ) {
                    return res.status(409).json({
                        ok: false,
                        error:
                            'No existe el perfil de repartidor'
                    });
                }

                const fiscalRepartidor =
                    await calcularRetencionFiscal({
                        supabaseAdmin,

                        tipoParticipante:
                            'repartidor',

                        tipoOperacion:
                            'entrega_pedido',

                        baseMxn:
                            Number(
                                pedido.envio_mxn ||
                                0
                            ),

                        rfcValidado:
                            repartidor
                                .rfc_validado ===
                            true
                    });

                cambios.isr_retenido_repartidor_mxn =
                    fiscalRepartidor
                        .isr_retenido_mxn;

                cambios.iva_retenido_repartidor_mxn =
                    fiscalRepartidor
                        .iva_retenido_mxn;

                cambios.monto_al_repartidor_mxn =
                    dinero(
                        Math.max(
                            0,
                            gananciaBase -
                            fiscalRepartidor
                                .isr_retenido_mxn -
                            fiscalRepartidor
                                .iva_retenido_mxn
                        )
                    );
            }

            /* ----------------------------------------------------
               ACTUALIZACIÓN CONDICIONAL
               Evita que dos repartidores tomen simultáneamente
               el mismo pedido.
            ---------------------------------------------------- */

            let updateQuery =
                supabaseAdmin
                    .from(
                        'mercado_pedidos'
                    )
                    .update(
                        cambios
                    )
                    .eq(
                        'id',
                        pedidoId
                    )
                    .eq(
                        'estado',
                        pedido.estado
                    );

            /*
             * Para tomar el pedido:
             * solamente si todavía no tiene repartidor.
             */

            if (
                nuevoEstado ===
                'asignado'
            ) {
                updateQuery =
                    updateQuery
                        .is(
                            'repartidor_id',
                            null
                        );
            }

            const {
                data: actualizado,
                error:
                    updateError
            } =
                await updateQuery
                    .select()
                    .maybeSingle();

            if (
                updateError
            ) {
                throw updateError;
            }

            /*
             * Si no se actualizó ninguna fila,
             * otro proceso ganó la transición.
             */

            if (!actualizado) {
                return res.status(409).json({
                    ok: false,
                    error:
                        'El pedido cambió antes de completar la operación. Recarga el pedido.',
                    code:
                        'ORDER_STATE_CONFLICT'
                });
            }

            return res.json({
                ok: true,

                pedido_id:
                    actualizado.id,

                estado_anterior:
                    pedido.estado,

                estado:
                    actualizado.estado,

                actualizado_en:
                    actualizado.updated_at
            });

        } catch (error) {

            console.error(
                '[Mercado Pedidos] Error cambiando estado:',
                error
            );

            if (
                error.code ===
                'FISCAL_RULE_MISSING'
            ) {
                return res.status(503).json({
                    ok: false,
                    error:
                        'No existe una regla fiscal configurada para esta operación.',
                    code:
                        'FISCAL_RULE_MISSING'
                });
            }

            return res.status(500).json({
                ok: false,
                error:
                    'No se pudo cambiar el estado del pedido'
            });
        }
    }
);

module.exports = router;