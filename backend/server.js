/* ================================================================
   SERVER.JS - SARIEL'S ECOSYSTEM
   VERSIÓN PRODUCCIÓN - RAILWAY
   ================================================================
   INCLUYE:
   ✅ Express
   ✅ Supabase Auth
   ✅ Supabase Admin
   ✅ LiveKit
   ✅ Payments
   ✅ Webhooks
   ✅ Membresía
   ✅ Helmet
   ✅ CORS
   ✅ Rate Limit
   ✅ Compresión
   ✅ I18N
   ✅ Eliminación segura de cuenta
   ✅ Cloudflare Turnstile
   ✅ Videollamada LiveKit
   ✅ Streaming LIVE_
   ✅ Mensajería
   ✅ Content-Type correcto para JS
   ✅ Middleware en orden correcto
   ================================================================ */

const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');

require('dotenv').config();

/* ================================================================
   APP
================================================================ */

const app = express();

app.disable('x-powered-by');

const PORT =
    Number(process.env.PORT) || 8080;

/* ================================================================
   SUPABASE
================================================================ */

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

/* ================================================================
   LIVEKIT
================================================================ */

const LIVEKIT_API_KEY =
    process.env.LIVEKIT_API_KEY;

const LIVEKIT_API_SECRET =
    process.env.LIVEKIT_API_SECRET;

const LIVEKIT_URL =
    process.env.LIVEKIT_URL;

/* ================================================================
   TURNSTILE
================================================================ */

const TURNSTILE_SECRET_KEY =
    process.env.TURNSTILE_SECRET_KEY;

const TURNSTILE_SITE_KEY =
    process.env.TURNSTILE_SITE_KEY;

const TURNSTILE_VERIFY_URL =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const TURNSTILE_EXPECTED_ACTION =
    'delete_account';

const TURNSTILE_EXPECTED_HOSTNAME =
    'galleta-domo-production.up.railway.app';

/* ================================================================
   EDGE FUNCTIONS
================================================================ */

const ACCOUNT_DELETION_REQUEST_FUNCTION =
    'request-account-deletion';

const ACCOUNT_DELETION_PROCESS_FUNCTION =
    'process-account-deletion';

/* ================================================================
   VALIDACIÓN DE CONFIGURACIÓN
================================================================ */

if (!SUPABASE_URL) {
    console.error('❌ Falta SUPABASE_URL');
}

if (!SUPABASE_ANON_KEY) {
    console.error('❌ Falta SUPABASE_ANON_KEY');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY');
}

if (!TURNSTILE_SECRET_KEY) {
    console.warn('⚠️ Falta TURNSTILE_SECRET_KEY');
}

if (!TURNSTILE_SITE_KEY) {
    console.warn('⚠️ Falta TURNSTILE_SITE_KEY');
}

if (
    !LIVEKIT_API_KEY ||
    !LIVEKIT_API_SECRET ||
    !LIVEKIT_URL
) {
    console.warn(
        '⚠️ LiveKit no está configurado completamente.'
    );
}

/* ================================================================
   SUPABASE ADMIN
================================================================ */

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
   CLIENTE SUPABASE DEL USUARIO
================================================================ */

function clienteDelUsuario(req) {

    if (
        !SUPABASE_URL ||
        !SUPABASE_ANON_KEY
    ) {
        throw new Error(
            'Supabase no configurado'
        );
    }

    const authorization =
        req.headers.authorization || '';

    if (
        authorization.startsWith('Bearer ')
    ) {

        const token =
            authorization
                .slice(7)
                .trim();

        if (token) {

            return createClient(
                SUPABASE_URL,
                SUPABASE_ANON_KEY,
                {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false,
                        detectSessionInUrl: false
                    },
                    global: {
                        headers: {
                            Authorization:
                                `Bearer ${token}`
                        }
                    }
                }
            );
        }
    }

    return createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false
            }
        }
    );
}

/* ================================================================
   OBTENER USUARIO AUTENTICADO
================================================================ */

async function obtenerUsuario(req) {

    const supabase =
        clienteDelUsuario(req);

    const {
        data: { user },
        error
    } =
        await supabase.auth.getUser();

    if (
        error ||
        !user
    ) {
        return null;
    }

    return user;
}

/* ================================================================
   MIDDLEWARE AUTENTICACIÓN
================================================================ */

async function verificarAutenticacion(
    req,
    res,
    next
) {

    try {

        const user =
            await obtenerUsuario(req);

        if (!user) {

            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        req.user = user;

        return next();

    } catch (error) {

        console.error(
            '❌ Error de autenticación:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Error de autenticación'
        });
    }
}

/* ================================================================
   ADMIN
================================================================ */

async function verificarAdmin(
    req,
    res,
    next
) {

    try {

        const user =
            await obtenerUsuario(req);

        if (!user) {

            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        if (!supabaseAdmin) {

            return res.status(500).json({
                success: false,
                error:
                    'Supabase Admin no configurado'
            });
        }

        const {
            data: roleData,
            error: roleError
        } =
            await supabaseAdmin
                .from('user_roles')
                .select('role')
                .eq('user_id', user.id)
                .eq('role', 'admin')
                .maybeSingle();

        if (
            roleError ||
            !roleData
        ) {

            return res.status(403).json({
                success: false,
                error: 'No autorizado'
            });
        }

        req.user = user;

        return next();

    } catch (error) {

        console.error(
            '❌ Error verificando admin:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                'Error de autenticación'
        });
    }
}

/* ================================================================
   SEGURIDAD
================================================================ */

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(
    compression()
);

const isProduction =
    process.env.NODE_ENV === 'production';

/* ================================================================
   CORS
================================================================ */

const corsOrigins =
    (
        process.env.CORS_ORIGINS ||
        ''
    )
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);

/*
 * En producción permitimos:
 *
 * 1. Los orígenes explícitamente configurados.
 * 2. El propio dominio Railway de producción.
 *
 * Esto evita bloquear las peticiones normales del mismo sitio
 * cuando CORS_ORIGINS no contiene explícitamente el dominio.
 */

const DEFAULT_PRODUCTION_ORIGINS = [
    'https://galleta-domo-production.up.railway.app'
];

const allowedCorsOrigins =
    Array.from(
        new Set([
            ...corsOrigins,
            ...DEFAULT_PRODUCTION_ORIGINS
        ])
    );

app.use(
    cors({
        origin: function (
            origin,
            callback
        ) {

            /*
             * Requests sin Origin:
             * curl, health checks, server-to-server, etc.
             */
            if (!origin) {
                return callback(null, true);
            }

            /*
             * Desarrollo:
             * permitimos localhost y cualquier origen.
             */
            if (!isProduction) {
                return callback(null, true);
            }

            if (
                allowedCorsOrigins.includes(origin)
            ) {
                return callback(null, true);
            }

            console.warn(
                `⚠️ CORS rechazó origen: ${origin}`
            );

            return callback(
                new Error(
                    'Origen no permitido por CORS'
                )
            );
        },

        credentials: true,

        methods: [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'OPTIONS'
        ],

        allowedHeaders: [
            'Origin',
            'X-Requested-With',
            'Content-Type',
            'Accept',
            'Authorization'
        ]
    })
);

/* ================================================================
   LOG
================================================================ */

app.use(
    morgan('combined')
);

/* ================================================================
   RATE LIMIT API
================================================================ */

const apiLimiter =
    rateLimit({
        windowMs:
            15 * 60 * 1000,

        max:
            300,

        standardHeaders:
            true,

        legacyHeaders:
            false,

        message: {
            success: false,
            error:
                'Demasiadas peticiones. Intenta nuevamente más tarde.'
        }
    });

app.use(
    '/api/',
    (req, res, next) => {

        /*
         * Webhooks no deben quedar bloqueados
         * por el rate limit general.
         */
        if (
            req.path.startsWith('/webhook/')
        ) {
            return next();
        }

        /*
         * LiveKit necesita permitir varias
         * solicitudes durante llamadas.
         */
        if (
            req.path === '/livekit/token'
        ) {
            return next();
        }

        return apiLimiter(
            req,
            res,
            next
        );
    }
);

/* ================================================================
   BODY PARSER
================================================================ */

app.use(
    express.json({
        limit: '2mb',

        verify: (
            req,
            res,
            buf
        ) => {

            req.rawBody =
                Buffer.from(buf);
        }
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '2mb',

        verify: (
            req,
            res,
            buf
        ) => {

            if (!req.rawBody) {

                req.rawBody =
                    Buffer.from(buf);
            }
        }
    })
);

/* ================================================================
   I18N
================================================================ */

const IDIOMAS_VALIDOS = [
    'es-MX',
    'es-ES',
    'pt-BR',
    'en-US',
    'fr-FR',
    'it-IT',
    'de-DE'
];

const IDIOMA_POR_DEFECTO =
    'es-MX';

const cacheIdiomas = {
    data: null,
    expiresAt: 0
};

const cacheTraducciones =
    new Map();

const CACHE_TTL =
    5 * 60 * 1000;

/* ================================================================
   OBTENER IDIOMAS
================================================================ */

async function obtenerIdiomas() {

    const ahora =
        Date.now();

    if (
        cacheIdiomas.data &&
        cacheIdiomas.expiresAt > ahora
    ) {
        return cacheIdiomas.data;
    }

    if (!supabaseAdmin) {

        throw new Error(
            'Supabase Admin no configurado'
        );
    }

    const {
        data,
        error
    } =
        await supabaseAdmin
            .from('idiomas_sistema')
            .select(`
                id,
                codigo,
                nombre,
                nombre_nativo,
                bandera,
                activo,
                created_at
            `)
            .eq('activo', true)
            .order(
                'nombre_nativo',
                {
                    ascending: true
                }
            );

    if (error) {
        throw error;
    }

    cacheIdiomas.data =
        data || [];

    cacheIdiomas.expiresAt =
        ahora + CACHE_TTL;

    return cacheIdiomas.data;
}

/* ================================================================
   BUSCAR IDIOMA
================================================================ */

async function obtenerIdiomaPorCodigo(
    codigo
) {

    if (!codigo) {
        return null;
    }

    const idiomas =
        await obtenerIdiomas();

    return idiomas.find(
        idioma =>
            idioma.codigo
                .toLowerCase() ===
            codigo.toLowerCase()
    ) || null;
}

/* ================================================================
   DETECTAR IDIOMA
================================================================ */

function detectarIdiomaDesdeHeader(
    req
) {

    const header =
        req.headers['accept-language'];

    if (!header) {
        return IDIOMA_POR_DEFECTO;
    }

    const candidatos =
        header
            .split(',')
            .map(item => {

                const [
                    codigo,
                    prioridad
                ] =
                    item
                        .trim()
                        .split(';q=');

                return {
                    codigo:
                        codigo.trim(),

                    prioridad:
                        prioridad
                            ? Number(prioridad)
                            : 1
                };
            })
            .sort(
                (a, b) =>
                    b.prioridad -
                    a.prioridad
            );

    for (
        const candidato
        of candidatos
    ) {

        const codigo =
            candidato.codigo;

        const exacto =
            IDIOMAS_VALIDOS.find(
                idioma =>
                    idioma.toLowerCase() ===
                    codigo.toLowerCase()
            );

        if (exacto) {
            return exacto;
        }

        const base =
            codigo
                .split('-')[0]
                .toLowerCase();

        const equivalente =
            IDIOMAS_VALIDOS.find(
                idioma =>
                    idioma
                        .split('-')[0]
                        .toLowerCase() ===
                    base
            );

        if (equivalente) {
            return equivalente;
        }
    }

    return IDIOMA_POR_DEFECTO;
}

/* ================================================================
   TRADUCCIONES
================================================================ */

async function obtenerTraducciones(
    codigoIdioma
) {

    const idioma =
        await obtenerIdiomaPorCodigo(
            codigoIdioma
        );

    if (!idioma) {

        throw new Error(
            `Idioma no disponible: ${codigoIdioma}`
        );
    }

    const cacheKey =
        idioma.codigo;

    const ahora =
        Date.now();

    const cache =
        cacheTraducciones.get(
            cacheKey
        );

    if (
        cache &&
        cache.expiresAt > ahora
    ) {
        return cache.data;
    }

    if (!supabaseAdmin) {

        throw new Error(
            'Supabase Admin no configurado'
        );
    }

    const {
        data,
        error
    } =
        await supabaseAdmin
            .from('traducciones')
            .select(`
                id,
                idioma_id,
                clave,
                valor,
                valor_plural,
                variables,
                modulo,
                created_at,
                updated_at
            `)
            .eq(
                'idioma_id',
                idioma.id
            )
            .order(
                'modulo',
                {
                    ascending: true
                }
            )
            .order(
                'clave',
                {
                    ascending: true
                }
            );

    if (error) {
        throw error;
    }

    const traducciones = {};

    for (
        const item
        of data || []
    ) {

        traducciones[
            item.clave
        ] = {
            valor:
                item.valor,

            valor_plural:
                item.valor_plural,

            variables:
                item.variables || {},

            modulo:
                item.modulo
        };
    }

    cacheTraducciones.set(
        cacheKey,
        {
            data:
                traducciones,

            expiresAt:
                ahora + CACHE_TTL
        }
    );

    return traducciones;
}

/* ================================================================
   IDIOMA DEL USUARIO
================================================================ */

async function resolverIdiomaUsuario(
    req
) {

    try {

        const user =
            await obtenerUsuario(req);

        if (
            user &&
            supabaseAdmin
        ) {

            const {
                data: usuario,
                error
            } =
                await supabaseAdmin
                    .from('usuarios')
                    .select(`
                        idioma_preferido_id,
                        idiomas_sistema:idioma_preferido_id (
                            codigo
                        )
                    `)
                    .eq(
                        'id',
                        user.id
                    )
                    .maybeSingle();

            if (
                !error &&
                usuario?.idiomas_sistema?.codigo
            ) {

                return usuario
                    .idiomas_sistema
                    .codigo;
            }
        }

    } catch (error) {

        console.warn(
            '⚠️ No se pudo obtener idioma del usuario:',
            error.message
        );
    }

    return detectarIdiomaDesdeHeader(
        req
    );
}

/* ================================================================
   API IDIOMAS
================================================================ */

app.get(
    '/api/idiomas',
    async (req, res) => {

        try {

            const idiomas =
                await obtenerIdiomas();

            return res.status(200).json({
                success: true,
                data: idiomas
            });

        } catch (error) {

            console.error(
                '❌ Error obteniendo idiomas:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'No se pudieron obtener los idiomas'
            });
        }
    }
);

/* ================================================================
   API TRADUCCIONES
================================================================ */

app.get(
    '/api/traducciones',
    async (req, res) => {

        try {

            let codigo =
                req.query.idioma;

            if (!codigo) {

                codigo =
                    await resolverIdiomaUsuario(
                        req
                    );
            }

            const idioma =
                await obtenerIdiomaPorCodigo(
                    codigo
                );

            if (!idioma) {

                return res.status(400).json({
                    success: false,
                    error:
                        'Idioma no disponible',
                    idioma_solicitado:
                        codigo,
                    idiomas_disponibles:
                        IDIOMAS_VALIDOS
                });
            }

            const traducciones =
                await obtenerTraducciones(
                    idioma.codigo
                );

            return res.status(200).json({
                success: true,

                idioma: {
                    id:
                        idioma.id,

                    codigo:
                        idioma.codigo,

                    nombre:
                        idioma.nombre,

                    nombre_nativo:
                        idioma.nombre_nativo,

                    bandera:
                        idioma.bandera
                },

                traducciones
            });

        } catch (error) {

            console.error(
                '❌ Error obteniendo traducciones:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'No se pudieron obtener las traducciones'
            });
        }
    }
);

/* ================================================================
   API I18N
================================================================ */

app.get(
    '/api/i18n',
    async (req, res) => {

        try {

            let codigo =
                req.query.idioma;

            if (!codigo) {

                codigo =
                    await resolverIdiomaUsuario(
                        req
                    );
            }

            const idioma =
                await obtenerIdiomaPorCodigo(
                    codigo
                );

            if (!idioma) {

                return res.status(400).json({
                    success: false,
                    error:
                        'Idioma no disponible'
                });
            }

            const traducciones =
                await obtenerTraducciones(
                    idioma.codigo
                );

            return res.status(200).json({
                success: true,
                locale:
                    idioma.codigo,
                idioma,
                traducciones
            });

        } catch (error) {

            console.error(
                '❌ Error en /api/i18n:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Error cargando sistema de idiomas'
            });
        }
    }
);

/* ================================================================
   ACTUALIZAR IDIOMA
================================================================ */

app.patch(
    '/api/usuarios/idioma',
    verificarAutenticacion,
    async (req, res) => {

        try {

            const {
                codigo
            } = req.body;

            if (!codigo) {

                return res.status(400).json({
                    success: false,
                    error:
                        'Debe especificarse un código de idioma'
                });
            }

            const idioma =
                await obtenerIdiomaPorCodigo(
                    codigo
                );

            if (!idioma) {

                return res.status(400).json({
                    success: false,
                    error:
                        'Idioma no disponible',
                    idiomas_disponibles:
                        IDIOMAS_VALIDOS
                });
            }

            const supabase =
                clienteDelUsuario(req);

            const {
                error
            } =
                await supabase
                    .from('usuarios')
                    .update({
                        idioma_preferido_id:
                            idioma.id
                    })
                    .eq(
                        'id',
                        req.user.id
                    );

            if (error) {

                console.error(
                    '❌ Error actualizando idioma:',
                    error
                );

                return res.status(500).json({
                    success: false,
                    error:
                        'No se pudo actualizar el idioma'
                });
            }

            return res.status(200).json({
                success: true,

                message:
                    'Idioma actualizado correctamente',

                idioma: {
                    id:
                        idioma.id,

                    codigo:
                        idioma.codigo,

                    nombre:
                        idioma.nombre,

                    nombre_nativo:
                        idioma.nombre_nativo,

                    bandera:
                        idioma.bandera
                }
            });

        } catch (error) {

            console.error(
                '❌ Error actualizando idioma:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Error actualizando idioma'
            });
        }
    }
);

/* ================================================================
   LIVEKIT
================================================================ */

app.post(
    '/api/livekit/token',
    verificarAutenticacion,
    async (req, res) => {

        try {

            if (
                !LIVEKIT_API_KEY ||
                !LIVEKIT_API_SECRET ||
                !LIVEKIT_URL
            ) {

                return res.status(503).json({
                    success: false,
                    error:
                        'SERVICIO_NO_DISPONIBLE',
                    message:
                        'El servicio de videollamadas no está configurado'
                });
            }

            const {
                roomName,
                participantName
            } = req.body;

            if (
                !roomName ||
                typeof roomName !== 'string' ||
                roomName.length < 3 ||
                roomName.length > 200
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'ROOM_INVALIDA',
                    message:
                        'El nombre de la sala no es válido'
                });
            }

            if (
                !participantName ||
                typeof participantName !== 'string'
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'PARTICIPANTE_INVALIDO',
                    message:
                        'El participante es obligatorio'
                });
            }

            const userId =
                req.user.id;

            /*
             * El participante debe ser siempre
             * el usuario autenticado.
             */
            if (
                participantName !== userId
            ) {

                return res.status(403).json({
                    success: false,
                    error:
                        'NO_AUTORIZADO',
                    message:
                        'No puedes generar un token para otro usuario'
                });
            }

            const callIdMatch =
                roomName.match(/^call_([0-9a-fA-F-]{36})$/);

            const liveIdMatch =
                roomName.match(/^live_([0-9a-fA-F-]{36})$/);

            let callId = null;
            let liveId = null;

            const isCall =
                Boolean(callIdMatch);

            const isLive =
                Boolean(liveIdMatch);

            if (isCall) {

                callId =
                    callIdMatch[1];

            } else if (isLive) {

                liveId =
                    liveIdMatch[1];

            } else {

                return res.status(400).json({
                    success: false,
                    error:
                        'FORMATO_INVALIDO',
                    message:
                        'El nombre debe comenzar con call_ o live_ y contener un UUID válido'
                });
            }

            /* ====================================================
               AUTORIZACIÓN DE VIDEOLLAMADA

               ESQUEMA REAL:
               llamadas:
                 id
                 creador_id
                 estado

               llamadas_participantes:
                 llamada_id
                 usuario_id
                 rol
                 estado
            ==================================================== */

            if (isCall) {

                if (!supabaseAdmin) {

                    return res.status(500).json({
                        success: false,
                        error:
                            'SUPABASE_ADMIN_NO_CONFIGURADO'
                    });
                }

                const {
                    data: llamada,
                    error: llamadaError
                } =
                    await supabaseAdmin
                        .from('llamadas')
                        .select(`
                            id,
                            creador_id,
                            estado
                        `)
                        .eq(
                            'id',
                            callId
                        )
                        .maybeSingle();

                if (
                    llamadaError
                ) {

                    console.error(
                        '❌ Error consultando llamada:',
                        llamadaError
                    );

                    return res.status(500).json({
                        success: false,
                        error:
                            'ERROR_CONSULTANDO_LLAMADA'
                    });
                }

                if (!llamada) {

                    return res.status(404).json({
                        success: false,
                        error:
                            'LLAMADA_NO_ENCONTRADA',
                        message:
                            'La llamada no existe'
                    });
                }

                /*
                 * La llamada debe estar disponible.
                 */
                if (
                    llamada.estado !== 'active' &&
                    llamada.estado !== 'ringing'
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            'LLAMADA_NO_DISPONIBLE',
                        message:
                            'La llamada no está disponible'
                    });
                }

                /*
                 * El creador siempre está autorizado.
                 */
                const esCreador =
                    llamada.creador_id === userId;

                /*
                 * Los demás usuarios deben aparecer
                 * expresamente como participantes.
                 */
                let esParticipante =
                    false;

                if (!esCreador) {

                    const {
                        data: participante,
                        error:
                            participanteError
                    } =
                        await supabaseAdmin
                            .from(
                                'llamadas_participantes'
                            )
                            .select(
                                'id, usuario_id, estado'
                            )
                            .eq(
                                'llamada_id',
                                callId
                            )
                            .eq(
                                'usuario_id',
                                userId
                            )
                            .maybeSingle();

                    if (
                        participanteError
                    ) {

                        console.error(
                            '❌ Error consultando participante:',
                            participanteError
                        );

                        return res.status(500).json({
                            success: false,
                            error:
                                'ERROR_CONSULTANDO_PARTICIPANTE'
                        });
                    }

                    /*
                     * Si existe el registro, el usuario
                     * está autorizado.
                     */
                    esParticipante =
                        Boolean(
                            participante
                        );

                    /*
                     * Si el participante fue explícitamente
                     * rechazado/cancelado, no entra.
                     */
                    if (
                        participante &&
                        (
                            participante.estado ===
                                'rejected' ||
                            participante.estado ===
                                'cancelled'
                        )
                    ) {

                        esParticipante =
                            false;
                    }
                }

                if (
                    !esCreador &&
                    !esParticipante
                ) {

                    console.warn(
                        `⚠️ Usuario ${userId} intentó entrar a llamada ${callId} sin autorización`
                    );

                    return res.status(403).json({
                        success: false,
                        error:
                            'NO_AUTORIZADO',
                        message:
                            'No estás autorizado para unirte a esta llamada'
                    });
                }
            }

            /* ====================================================
               AUTORIZACIÓN DE LIVE
            ==================================================== */

            if (isLive) {

                if (!supabaseAdmin) {

                    return res.status(500).json({
                        success: false,
                        error:
                            'SUPABASE_ADMIN_NO_CONFIGURADO'
                    });
                }

                const {
                    data: stream,
                    error: streamError
                } =
                    await supabaseAdmin
                        .from('streams')
                        .select(
                            'usuario_id, estado'
                        )
                        .eq(
                            'id',
                            liveId
                        )
                        .maybeSingle();

                if (streamError) {

                    console.error(
                        '❌ Error consultando stream:',
                        streamError
                    );

                    return res.status(500).json({
                        success: false,
                        error:
                            'ERROR_CONSULTANDO_STREAM'
                    });
                }

                if (!stream) {

                    return res.status(404).json({
                        success: false,
                        error:
                            'STREAM_NO_ENCONTRADO',
                        message:
                            'El stream no existe'
                    });
                }

                /*
                 * Actualmente este endpoint mantiene
                 * el modelo original: solamente el creador
                 * puede solicitar el token de publicación.
                 */
                if (
                    stream.usuario_id !== userId
                ) {

                    return res.status(403).json({
                        success: false,
                        error:
                            'NO_AUTORIZADO',
                        message:
                            'No eres el creador de este stream'
                    });
                }

                if (
                    stream.estado !== 'active' &&
                    stream.estado !== 'live' &&
                    stream.estado !== 'starting'
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            'STREAM_NO_DISPONIBLE',
                        message:
                            'El stream no está disponible'
                    });
                }
            }

            /* ====================================================
               NOMBRE DEL USUARIO
            ==================================================== */

            let nombreUsuario =
                req.user.user_metadata?.nombre ||
                req.user.email ||
                'Usuario';

            if (supabaseAdmin) {

                const {
                    data: usuarioData,
                    error: usuarioError
                } =
                    await supabaseAdmin
                        .from('usuarios')
                        .select('nombre')
                        .eq(
                            'id',
                            userId
                        )
                        .maybeSingle();

                if (
                    !usuarioError &&
                    usuarioData?.nombre
                ) {

                    nombreUsuario =
                        usuarioData.nombre;
                }
            }

            /* ====================================================
               TOKEN
            ==================================================== */

            const token =
                new AccessToken(
                    LIVEKIT_API_KEY,
                    LIVEKIT_API_SECRET,
                    {
                        identity:
                            userId,

                        ttl:
                            3600,

                        name:
                            nombreUsuario
                    }
                );

            token.addGrant({
                roomJoin: true,
                room: roomName,
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
                canUpdateOwnMetadata: true
            });

            const jwt =
                token.toJwt();

            console.log(
                `✅ LiveKit token generado: ${userId} → ${roomName}`
            );

            return res.status(200).json({
                success: true,
                token: jwt,
                url: LIVEKIT_URL,
                identity: userId,
                roomName
            });

        } catch (error) {

            console.error(
                '❌ Error generando token LiveKit:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'ERROR_INTERNO',
                message:
                    'Error al generar el token de videollamada'
            });
        }
    }
);

/* ================================================================
   TURNSTILE
================================================================ */

async function verificarTurnstile(
    token,
    req
) {

    if (!TURNSTILE_SECRET_KEY) {

        return {
            success: false,
            error:
                'TURNSTILE_NOT_CONFIGURED'
        };
    }

    if (
        !token ||
        typeof token !== 'string'
    ) {

        return {
            success: false,
            error:
                'TURNSTILE_TOKEN_REQUIRED'
        };
    }

    try {

        const params =
            new URLSearchParams();

        params.append(
            'secret',
            TURNSTILE_SECRET_KEY
        );

        params.append(
            'response',
            token
        );

        const forwardedFor =
            req.headers[
                'x-forwarded-for'
            ];

        const remoteIp =
            forwardedFor
                ? forwardedFor
                    .split(',')[0]
                    .trim()
                : req.ip;

        if (remoteIp) {

            params.append(
                'remoteip',
                remoteIp
            );
        }

        const response =
            await axios.post(
                TURNSTILE_VERIFY_URL,
                params.toString(),
                {
                    headers: {
                        'Content-Type':
                            'application/x-www-form-urlencoded'
                    },
                    timeout:
                        10000
                }
            );

        const result =
            response.data || {};

        if (
            result.success !== true
        ) {

            return {
                success: false,
                error:
                    'TURNSTILE_FAILED',
                details:
                    result[
                        'error-codes'
                    ] || []
            };
        }

        if (
            result.action &&
            result.action !==
                TURNSTILE_EXPECTED_ACTION
        ) {

            return {
                success: false,
                error:
                    'TURNSTILE_ACTION_INVALID'
            };
        }

        if (
            result.hostname &&
            result.hostname !==
                TURNSTILE_EXPECTED_HOSTNAME
        ) {

            return {
                success: false,
                error:
                    'TURNSTILE_HOSTNAME_INVALID'
            };
        }

        return {
            success: true,
            hostname:
                result.hostname || null,
            action:
                result.action || null
        };

    } catch (error) {

        console.error(
            '❌ Error verificando Turnstile:',
            error.message
        );

        return {
            success: false,
            error:
                'TURNSTILE_VERIFY_ERROR'
        };
    }
}

/* ================================================================
   AUTHORIZATION HEADER
================================================================ */

function obtenerAuthorizationHeader(
    req
) {

    const authorization =
        req.headers.authorization;

    if (
        typeof authorization !== 'string'
    ) {
        return null;
    }

    if (
        !authorization.startsWith('Bearer ')
    ) {
        return null;
    }

    const token =
        authorization
            .slice(7)
            .trim();

    if (!token) {
        return null;
    }

    return authorization;
}

/* ================================================================
   EDGE FUNCTION
================================================================ */

async function llamarEdgeFunction(
    functionName,
    authorization
) {

    if (
        !SUPABASE_URL ||
        !SUPABASE_ANON_KEY
    ) {

        throw new Error(
            'Supabase no configurado'
        );
    }

    const url =
        `${SUPABASE_URL}/functions/v1/${functionName}`;

    const response =
        await axios.post(
            url,
            {},
            {
                headers: {
                    Authorization:
                        authorization,

                    apikey:
                        SUPABASE_ANON_KEY,

                    'Content-Type':
                        'application/json',

                    Accept:
                        'application/json'
                },

                timeout:
                    30000,

                validateStatus:
                    () => true
            }
        );

    let data =
        response.data;

    if (
        typeof data === 'string'
    ) {

        try {

            data =
                JSON.parse(data);

        } catch {

            data = {
                raw:
                    data
            };
        }
    }

    if (
        response.status < 200 ||
        response.status >= 300
    ) {

        const error =
            new Error(
                `Edge Function ${functionName} respondió HTTP ${response.status}`
            );

        error.status =
            response.status;

        error.data =
            data;

        throw error;
    }

    return data;
}

/* ================================================================
   ELIMINACIÓN DE CUENTA
================================================================ */

app.post(
    '/api/account/delete',
    async (req, res) => {

        const requestId =
            crypto.randomUUID();

        try {

            console.log(
                `🗑️ Solicitud de eliminación [${requestId}]`
            );

            if (
                !SUPABASE_URL ||
                !SUPABASE_ANON_KEY
            ) {

                return res.status(500).json({
                    success: false,
                    error:
                        'SERVIDOR_NO_CONFIGURADO'
                });
            }

            if (
                !TURNSTILE_SECRET_KEY
            ) {

                return res.status(503).json({
                    success: false,
                    error:
                        'SEGURIDAD_NO_CONFIGURADA'
                });
            }

            const authorization =
                obtenerAuthorizationHeader(
                    req
                );

            if (!authorization) {

                return res.status(401).json({
                    success: false,
                    error:
                        'NO_AUTENTICADO'
                });
            }

            const user =
                await obtenerUsuario(req);

            if (!user) {

                return res.status(401).json({
                    success: false,
                    error:
                        'NO_AUTENTICADO'
                });
            }

            const confirmation =
                typeof req.body?.confirmation ===
                    'string'
                    ? req.body.confirmation.trim()
                    : '';

            if (
                confirmation !== 'ELIMINAR'
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'CONFIRMACION_INVALIDA'
                });
            }

            const action =
                typeof req.body?.action ===
                    'string'
                    ? req.body.action.trim()
                    : '';

            if (
                action !== 'delete_account'
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'ACCION_INVALIDA'
                });
            }

            const turnstileToken =
                typeof req.body?.turnstile_token ===
                    'string'
                    ? req.body.turnstile_token.trim()
                    : '';

            if (!turnstileToken) {

                return res.status(400).json({
                    success: false,
                    error:
                        'VERIFICACION_SEGURIDAD_REQUERIDA'
                });
            }

            const turnstile =
                await verificarTurnstile(
                    turnstileToken,
                    req
                );

            if (
                !turnstile.success
            ) {

                return res.status(403).json({
                    success: false,
                    error:
                        'VERIFICACION_SEGURIDAD_FALLIDA'
                });
            }

            let deletionRequest;

            try {

                deletionRequest =
                    await llamarEdgeFunction(
                        ACCOUNT_DELETION_REQUEST_FUNCTION,
                        authorization
                    );

            } catch (error) {

                console.error(
                    `❌ [${requestId}] request-account-deletion:`,
                    error.data ||
                        error.message
                );

                return res.status(
                    error.status === 401
                        ? 401
                        : 500
                ).json({
                    success: false,
                    error:
                        'NO_SE_PUDO_CREAR_SOLICITUD_ELIMINACION',
                    request_id:
                        requestId
                });
            }

            let deletionResult;

            try {

                deletionResult =
                    await llamarEdgeFunction(
                        ACCOUNT_DELETION_PROCESS_FUNCTION,
                        authorization
                    );

            } catch (error) {

                console.error(
                    `❌ [${requestId}] process-account-deletion:`,
                    error.data ||
                        error.message
                );

                return res.status(
                    error.status === 401
                        ? 401
                        : 500
                ).json({
                    success: false,
                    error:
                        'NO_SE_PUDO_PROCESAR_ELIMINACION',
                    request_id:
                        requestId
                });
            }

            if (
                !deletionResult ||
                deletionResult.success !== true
            ) {

                console.error(
                    `❌ [${requestId}] Eliminación incompleta`
                );

                return res.status(500).json({
                    success: false,
                    error:
                        'ELIMINACION_NO_COMPLETADA',
                    request_id:
                        requestId
                });
            }

            console.log(
                `✅ [${requestId}] Cuenta eliminada`
            );

            return res.status(200).json({
                success: true,
                status:
                    'completed',

                message:
                    'La cuenta y los datos eliminables fueron eliminados correctamente.',

                request_id:
                    requestId,

                deletion:
                    deletionResult,

                request:
                    deletionRequest
            });

        } catch (error) {

            console.error(
                `❌ [${requestId}] Error eliminación:`,
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'ERROR_INTERNO_ELIMINACION',
                request_id:
                    requestId
            });
        }
    }
);

/* ================================================================
   ARCHIVOS ESTÁTICOS
================================================================ */

const publicPath =
    path.join(
        __dirname,
        'public'
    );

if (
    fs.existsSync(publicPath)
) {

    /*
     * IMPORTANTE:
     *
     * El Content-Type se establece AQUÍ,
     * antes de que express.static responda.
     *
     * El middleware anterior estaba después de
     * express.static(), por lo que podía no ejecutarse.
     */
    const staticOptions = {

        setHeaders: (
            res,
            filePath
        ) => {

            if (
                filePath
                    .toLowerCase()
                    .endsWith('.js')
            ) {

                res.setHeader(
                    'Content-Type',
                    'application/javascript; charset=utf-8'
                );

                res.setHeader(
                    'Cache-Control',
                    'no-cache, no-store, must-revalidate'
                );

                res.setHeader(
                    'Pragma',
                    'no-cache'
                );
            }
        }
    };

    app.use(
        express.static(
            publicPath,
            staticOptions
        )
    );

    console.log(
        '✅ Archivos estáticos:',
        publicPath
    );

} else {

    console.warn(
        '⚠️ No se encontró public/:',
        publicPath
    );
}

/* ================================================================
   FEATURES ESTÁTICOS
================================================================ */

function servirFeature(
    ruta,
    carpeta
) {

    const featurePath =
        path.join(
            publicPath,
            'features',
            carpeta
        );

    app.use(
        ruta,
        express.static(
            featurePath,
            {
                setHeaders: (
                    res,
                    filePath
                ) => {

                    if (
                        filePath
                            .toLowerCase()
                            .endsWith('.js')
                    ) {

                        res.setHeader(
                            'Content-Type',
                            'application/javascript; charset=utf-8'
                        );

                        res.setHeader(
                            'Cache-Control',
                            'no-cache, no-store, must-revalidate'
                        );
                    }
                }
            }
        )
    );
}

servirFeature(
    '/live',
    'live'
);

servirFeature(
    '/videos',
    'videos'
);

servirFeature(
    '/muro',
    'muro'
);

servirFeature(
    '/perfil',
    'perfil'
);

servirFeature(
    '/mensajes',
    'mensajes'
);

servirFeature(
    '/internet',
    'internet'
);

/* ================================================================
   RUTA EXPLÍCITA MENSAJES.JS
================================================================ */

app.get(
    '/features/mensajes/mensajes.js',
    (req, res) => {

        const archivo =
            path.join(
                publicPath,
                'features',
                'mensajes',
                'mensajes.js'
            );

        if (
            !fs.existsSync(archivo)
        ) {

            return res.status(404).send(
                'Archivo mensajes.js no encontrado'
            );
        }

        res.setHeader(
            'Content-Type',
            'application/javascript; charset=utf-8'
        );

        res.setHeader(
            'Cache-Control',
            'no-cache, no-store, must-revalidate'
        );

        res.setHeader(
            'Pragma',
            'no-cache'
        );

        return res.sendFile(
            archivo
        );
    }
);

/* ================================================================
   ROUTERS
================================================================ */

const authRoutes =
    require('./routes/auth');

app.use(
    '/api/auth',
    authRoutes
);

const paymentsRoutes =
    require('./routes/payments');

app.use(
    '/api/payments',
    paymentsRoutes
);

const webhooksRoutes =
    require('./routes/webhooks');

app.use(
    '/api/webhook',
    webhooksRoutes
);

const membresiaRoutes =
    require('./routes/membresia');

app.use(
    '/api/payments/membresia',
    membresiaRoutes
);

/* ================================================================
   MENSAJERÍA
================================================================ */

const mensajesRoutes =
    require('./routes/mensajes');

app.use(
    '/api/mensajes',
    mensajesRoutes
);

/* ================================================================
   RUTAS HTML
================================================================ */

function enviarHTML(
    archivo
) {

    return (
        req,
        res
    ) => {

        const ruta =
            path.join(
                publicPath,
                archivo
            );

        if (
            !fs.existsSync(ruta)
        ) {

            return res.status(404).send(
                'Página no encontrada'
            );
        }

        return res.sendFile(ruta);
    };
}

/* ================================================================
   PRINCIPALES
================================================================ */

app.get(
    '/',
    enviarHTML('index.html')
);

app.get(
    '/features/muro/muro.html',
    enviarHTML(
        'features/muro/muro.html'
    )
);

app.get(
    '/features/perfil/perfil.html',
    enviarHTML(
        'features/perfil/perfil.html'
    )
);

app.get(
    '/features/mensajes/mensajes.html',
    enviarHTML(
        'features/mensajes/mensajes.html'
    )
);

app.get(
    '/features/mensajes/contactos.html',
    enviarHTML(
        'features/mensajes/contactos.html'
    )
);

app.get(
    '/features/live/live.html',
    enviarHTML(
        'features/live/live.html'
    )
);

app.get(
    '/features/internet/internet.html',
    enviarHTML(
        'features/internet/internet.html'
    )
);

app.get(
    '/features/videos/videos.html',
    enviarHTML(
        'features/videos/videos.html'
    )
);

/* ================================================================
   RUTAS AMIGABLES
================================================================ */

app.get(
    '/muro',
    enviarHTML(
        'features/muro/muro.html'
    )
);

app.get(
    '/perfil',
    enviarHTML(
        'features/perfil/perfil.html'
    )
);

app.get(
    '/mensajes',
    enviarHTML(
        'features/mensajes/mensajes.html'
    )
);

app.get(
    '/contactos',
    enviarHTML(
        'features/mensajes/contactos.html'
    )
);

app.get(
    '/live',
    enviarHTML(
        'features/live/live.html'
    )
);

app.get(
    '/internet',
    enviarHTML(
        'features/internet/internet.html'
    )
);

app.get(
    '/videos',
    enviarHTML(
        'features/videos/videos.html'
    )
);

/* ================================================================
   OTRAS PÁGINAS
================================================================ */

app.get(
    '/admin.html',
    enviarHTML('admin.html')
);

app.get(
    '/qr',
    enviarHTML('qr-generator.html')
);

app.get(
    '/actualizar-contrasena',
    enviarHTML(
        'actualizar-contrasena.html'
    )
);

app.get(
    '/terminos',
    enviarHTML('terminos.html')
);

app.get(
    '/privacidad',
    enviarHTML('privacidad.html')
);

app.get(
    '/cookies',
    enviarHTML('cookies.html')
);

app.get(
    '/live-terminos',
    enviarHTML('live-terminos.html')
);

/* ================================================================
   HEALTH CHECK
================================================================ */

app.get(
    '/api/health',
    (req, res) => {

        return res.status(200).json({

            status:
                'healthy',

            timestamp:
                new Date().toISOString(),

            environment:
                process.env.NODE_ENV ||
                'development',

            i18n: {

                enabled:
                    true,

                default_locale:
                    IDIOMA_POR_DEFECTO,

                supported_locales:
                    IDIOMAS_VALIDOS
            },

            account_deletion: {

                enabled:
                    true,

                endpoint:
                    '/api/account/delete',

                turnstile:
                    Boolean(
                        TURNSTILE_SECRET_KEY
                    ),

                request_function:
                    ACCOUNT_DELETION_REQUEST_FUNCTION,

                process_function:
                    ACCOUNT_DELETION_PROCESS_FUNCTION
            },

            livekit: {

                configured:
                    Boolean(
                        LIVEKIT_API_KEY &&
                        LIVEKIT_API_SECRET &&
                        LIVEKIT_URL
                    ),

                endpoint:
                    '/api/livekit/token'
            },

            mensajeria: {

                enabled:
                    true,

                endpoints: {

                    conversaciones:
                        '/api/mensajes/conversaciones',

                    mensajes:
                        '/api/mensajes/mensajes/:id',

                    enviar:
                        '/api/mensajes/mensajes',

                    editar:
                        '/api/mensajes/mensajes/:id',

                    eliminar:
                        '/api/mensajes/mensajes/:id',

                    leer:
                        '/api/mensajes/mensajes/leer',

                    contactos:
                        '/api/mensajes/contactos',

                    bloquear:
                        '/api/mensajes/bloquear/:id',

                    reportar:
                        '/api/mensajes/reportar/:id'
                }
            }
        });
    }
);

/* ================================================================
   SPA FALLBACK
================================================================ */

/*
 * NO usamos:
 *
 * app.get('*', ...)
 *
 * porque Express 5 cambió la sintaxis de wildcards.
 *
 * Usamos middleware sin patrón de ruta.
 * Esto funciona independientemente de la sintaxis de path-to-regexp.
 */

app.use(
    (req, res, next) => {

        /*
         * Las APIs nunca deben recibir index.html.
         */
        if (
            req.path.startsWith('/api/')
        ) {
            return next();
        }

        if (
            req.path.startsWith('/webhook/')
        ) {
            return next();
        }

        /*
         * Si parece un archivo solicitado,
         * dejamos que el 404 correspondiente
         * continúe.
         */
        if (
            path.extname(req.path) !== ''
        ) {
            return next();
        }

        const indexPath =
            path.join(
                publicPath,
                'index.html'
            );

        if (
            fs.existsSync(indexPath)
        ) {

            return res.sendFile(
                indexPath
            );
        }

        return next();
    }
);

/* ================================================================
   404 API
================================================================ */

app.use(
    '/api',
    (req, res) => {

        return res.status(404).json({
            success: false,
            error:
                'Endpoint no encontrado'
        });
    }
);

/* ================================================================
   ERROR HANDLER
================================================================ */

app.use(
    (
        err,
        req,
        res,
        next
    ) => {

        console.error(
            '❌ Error interno:',
            err
        );

        if (
            res.headersSent
        ) {

            return next(err);
        }

        return res.status(500).json({

            success:
                false,

            error:
                isProduction
                    ? 'Error interno del servidor'
                    : err.message
        });
    }
);

/* ================================================================
   SERVIDOR
================================================================ */

app.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log(
            '========================================'
        );

        console.log(
            `✅ Servidor corriendo en puerto ${PORT}`
        );

        console.log(
            `📁 Archivos: ${publicPath}`
        );

        console.log(
            `🌐 Local: http://localhost:${PORT}`
        );

        console.log(
            `🌍 Entorno: ${
                process.env.NODE_ENV ||
                'development'
            }`
        );

        console.log(
            '🔐 Auth router: ✅ /api/auth'
        );

        console.log(
            '💳 Payments router: ✅ /api/payments'
        );

        console.log(
            '📡 Webhook router: ✅ /api/webhook'
        );

        console.log(
            '✨ Membresía router: ✅ /api/payments/membresia'
        );

        console.log(
            '💬 Mensajería router: ✅ /api/mensajes'
        );

        console.log(
            '🌎 I18N: ✅ /api/idiomas'
        );

        console.log(
            '📝 Traducciones: ✅ /api/traducciones'
        );

        console.log(
            '🌐 I18N completo: ✅ /api/i18n'
        );

        console.log(
            '👤 Idioma usuario: ✅ /api/usuarios/idioma'
        );

        console.log(
            '🗑️ Eliminación de cuenta: ✅ /api/account/delete'
        );

        console.log(
            `🛡️ Turnstile: ${
                TURNSTILE_SECRET_KEY
                    ? '✅ Configurado'
                    : '❌ No configurado'
            }`
        );

        console.log(
            `💳 NOWPayments: ${
                process.env.NOWPAYMENTS_API_KEY
                    ? '✅ Configurado'
                    : '❌ No configurado'
            }`
        );

        console.log(
            `📱 Telnyx: ${
                process.env.TELNYX_API_KEY
                    ? '✅ Configurado'
                    : '❌ No configurado'
            }`
        );

        console.log(
            `🎥 LiveKit: ${
                LIVEKIT_API_KEY &&
                LIVEKIT_API_SECRET &&
                LIVEKIT_URL
                    ? '✅ Configurado'
                    : '❌ No configurado'
            }`
        );

        console.log(
            `🌎 Idioma por defecto: ${IDIOMA_POR_DEFECTO}`
        );

        console.log(
            `🌍 Idiomas: ${IDIOMAS_VALIDOS.join(', ')}`
        );

        console.log(
            '========================================'
        );
    }
);

module.exports = app;