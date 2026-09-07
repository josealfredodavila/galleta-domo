/* ================================================================
   SERVER.JS - SARIEL'S ECOSYSTEM
   VERSIÓN PRODUCCIÓN - RAILWAY
   INCLUYE:
   ✅ Express
   ✅ Supabase Auth
   ✅ Supabase Admin
   ✅ LiveKit
   ✅ Payments
   ✅ Webhooks
   ✅ Membresía
   ✅ Seguridad / Helmet
   ✅ CORS
   ✅ Rate Limit
   ✅ Compresión
   ✅ I18N
   ✅ SISTEMA SEGURO DE ELIMINACIÓN DE CUENTA
   ✅ CLOUDFLARE TURNSTILE SERVER-SIDE
   ✅ VIDEOLLAMADA LIVEKIT
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
   CONFIGURACIÓN
================================================================ */

const app = express();

const PORT =
    Number(process.env.PORT) || 8080;

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

/* ================================================================
   LIVEKIT CONFIGURACIÓN
================================================================ */

const LIVEKIT_API_KEY =
    process.env.LIVEKIT_API_KEY;

const LIVEKIT_API_SECRET =
    process.env.LIVEKIT_API_SECRET;

const LIVEKIT_URL =
    process.env.LIVEKIT_URL;

/* ================================================================
   CLOUDFLARE TURNSTILE
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
   EDGE FUNCTIONS DE ELIMINACIÓN
================================================================ */

const ACCOUNT_DELETION_REQUEST_FUNCTION =
    'request-account-deletion';

const ACCOUNT_DELETION_PROCESS_FUNCTION =
    'process-account-deletion';

/* ================================================================
   VALIDACIÓN DE VARIABLES
================================================================ */

if (!SUPABASE_URL) {
    console.error(
        '❌ Falta SUPABASE_URL'
    );
}

if (!SUPABASE_ANON_KEY) {
    console.error(
        '❌ Falta SUPABASE_ANON_KEY'
    );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        '❌ Falta SUPABASE_SERVICE_ROLE_KEY'
    );
}

if (!TURNSTILE_SECRET_KEY) {
    console.error(
        '⚠️ Falta TURNSTILE_SECRET_KEY'
    );
}

if (!TURNSTILE_SITE_KEY) {
    console.warn(
        '⚠️ Falta TURNSTILE_SITE_KEY'
    );
}

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    console.warn(
        '⚠️ LiveKit no configurado correctamente. Las videollamadas no funcionarán.'
    );
}

/* ================================================================
   CLIENTE SUPABASE ADMIN
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
                    persistSession: false
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
        authorization.startsWith(
            'Bearer '
        )
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
                        persistSession: false
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
                persistSession: false
            }
        }
    );
}

/* ================================================================
   AUTENTICACIÓN
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

        next();

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
   ADMINISTRADOR
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
                .eq(
                    'user_id',
                    user.id
                )
                .eq(
                    'role',
                    'admin'
                )
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

        next();

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
   SISTEMA MULTIIDIOMA / I18N
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
   CARGAR CATÁLOGO DE IDIOMAS
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
            .eq(
                'activo',
                true
            )
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
   BUSCAR IDIOMA POR CÓDIGO
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
   DETECTAR IDIOMA DESDE ACCEPT-LANGUAGE
================================================================ */

function detectarIdiomaDesdeHeader(
    req
) {

    const header =
        req.headers[
            'accept-language'
        ];

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
                            ? Number(
                                prioridad
                            )
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
   OBTENER TRADUCCIONES
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

    const traducciones =
        {};

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
                ahora +
                CACHE_TTL
        }
    );

    return traducciones;
}

/* ================================================================
   RESOLVER IDIOMA DEL USUARIO
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
   RUTA: LISTAR IDIOMAS
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
   RUTA: OBTENER TRADUCCIONES
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
                    id: idioma.id,
                    codigo: idioma.codigo,
                    nombre: idioma.nombre,
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
   RUTA: I18N COMPLETO
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
   RUTA: ACTUALIZAR IDIOMA DEL USUARIO
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
                    id: idioma.id,
                    codigo: idioma.codigo,
                    nombre: idioma.nombre,
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
   ================================================================
   🎥 LIVEKIT - GENERAR TOKEN DE ACCESO
   ================================================================
   ================================================================ */

app.post(
    '/api/livekit/token',
    verificarAutenticacion,
    async (req, res) => {

        try {

            /* ----------------------------------------------------
               1. VALIDAR CONFIGURACIÓN DE LIVEKIT
            ---------------------------------------------------- */

            if (
                !LIVEKIT_API_KEY ||
                !LIVEKIT_API_SECRET ||
                !LIVEKIT_URL
            ) {

                console.error(
                    '❌ LiveKit no configurado correctamente'
                );

                return res.status(503).json({
                    success: false,
                    error: 'SERVICIO_NO_DISPONIBLE',
                    message: 'El servicio de videollamadas no está configurado'
                });
            }

            /* ----------------------------------------------------
               2. VALIDAR PARÁMETROS DE LA SOLICITUD
            ---------------------------------------------------- */

            const {
                roomName,
                participantName
            } = req.body;

            if (
                !roomName ||
                typeof roomName !== 'string' ||
                roomName.length < 3
            ) {

                return res.status(400).json({
                    success: false,
                    error: 'ROOM_INVALIDA',
                    message: 'El nombre de la sala es obligatorio y debe tener al menos 3 caracteres'
                });
            }

            if (
                !participantName ||
                typeof participantName !== 'string' ||
                participantName.length < 1
            ) {

                return res.status(400).json({
                    success: false,
                    error: 'PARTICIPANTE_INVALIDO',
                    message: 'El nombre del participante es obligatorio'
                });
            }

            /* ----------------------------------------------------
               3. VERIFICAR QUE EL USUARIO SOLICITA SU PROPIO TOKEN
            ---------------------------------------------------- */

            const userId =
                req.user.id;

            if (
                participantName !== userId
            ) {

                console.warn(
                    `⚠️ Intento de suplantación: ${participantName} intentó usar token de ${userId}`
                );

                return res.status(403).json({
                    success: false,
                    error: 'NO_AUTORIZADO',
                    message: 'No puedes generar un token para otro usuario'
                });
            }

            /* ----------------------------------------------------
               4. VERIFICAR QUE EL USUARIO ESTÁ AUTORIZADO EN LA LLAMADA
            ---------------------------------------------------- */

            // Extraer el ID de la llamada del roomName
            const callIdMatch =
                roomName.match(/^call_(.+)$/);

            let callId =
                null;

            if (callIdMatch) {
                callId =
                    callIdMatch[1];
            }

            if (callId) {

                // Verificar que el usuario participa en esta llamada
                const {
                    data: llamada,
                    error: llamadaError
                } =
                    await supabaseAdmin
                        .from('llamadas')
                        .select('usuario_origen, usuario_destino, estado')
                        .eq('id', callId)
                        .maybeSingle();

                if (llamadaError || !llamada) {

                    console.warn(
                        `⚠️ Llamada no encontrada: ${callId}`
                    );

                    return res.status(404).json({
                        success: false,
                        error: 'LLAMADA_NO_ENCONTRADA',
                        message: 'La llamada no existe'
                    });
                }

                // Verificar que el usuario es origen o destino
                const esOrigen =
                    llamada.usuario_origen === userId;

                const esDestino =
                    llamada.usuario_destino === userId;

                if (!esOrigen && !esDestino) {

                    console.warn(
                        `⚠️ Usuario ${userId} no autorizado en llamada ${callId}`
                    );

                    return res.status(403).json({
                        success: false,
                        error: 'NO_AUTORIZADO',
                        message: 'No estás autorizado para unirte a esta llamada'
                    });
                }

                // Verificar que la llamada está activa o en ringing
                if (
                    llamada.estado !== 'active' &&
                    llamada.estado !== 'ringing'
                ) {

                    console.warn(
                        `⚠️ Llamada ${callId} en estado ${llamada.estado}`
                    );

                    return res.status(400).json({
                        success: false,
                        error: 'LLAMADA_NO_DISPONIBLE',
                        message: 'La llamada no está disponible'
                    });
                }

            } else {

                // Si no es una llamada con formato call_*, verificar que el usuario tiene autorización
                // Solo permitir tokens para salas con formato call_*
                return res.status(400).json({
                    success: false,
                    error: 'FORMATO_INVALIDO',
                    message: 'El nombre de la sala debe comenzar con "call_"'
                });
            }

            /* ----------------------------------------------------
               5. OBTENER NOMBRE DE USUARIO
            ---------------------------------------------------- */

            let nombreUsuario =
                req.user.user_metadata?.nombre ||
                req.user.email ||
                'Usuario';

            const {
                data: usuarioData,
                error: usuarioError
            } =
                await supabaseAdmin
                    .from('usuarios')
                    .select('nombre')
                    .eq('id', userId)
                    .maybeSingle();

            if (
                !usuarioError &&
                usuarioData?.nombre
            ) {
                nombreUsuario =
                    usuarioData.nombre;
            }

            /* ----------------------------------------------------
               6. GENERAR TOKEN LIVEKIT
            ---------------------------------------------------- */

            const token =
                new AccessToken(
                    LIVEKIT_API_KEY,
                    LIVEKIT_API_SECRET,
                    {
                        identity: userId,
                        ttl: 3600, // 1 hora
                        name: nombreUsuario
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
                `✅ Token LiveKit generado para ${userId} en sala ${roomName}`
            );

            return res.status(200).json({
                success: true,
                token: jwt,
                url: LIVEKIT_URL,
                identity: userId,
                roomName: roomName
            });

        } catch (error) {

            console.error(
                '❌ Error generando token LiveKit:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'ERROR_INTERNO',
                message: 'Error al generar el token de videollamada'
            });
        }
    }
);

/* ================================================================
   MIDDLEWARES DE SEGURIDAD
================================================================ */

app.disable(
    'x-powered-by'
);

app.use(
    helmet({
        contentSecurityPolicy:
            false
    })
);

app.use(
    compression()
);

const isProduction =
    process.env.NODE_ENV ===
    'production';

const corsOrigins =
    (
        process.env.CORS_ORIGINS ||
        ''
    )
        .split(',')
        .map(origin =>
            origin.trim()
        )
        .filter(Boolean);

app.use(
    cors({
        origin:
            function (
                origin,
                callback
            ) {

                if (!origin) {
                    return callback(
                        null,
                        true
                    );
                }

                if (!isProduction) {
                    return callback(
                        null,
                        true
                    );
                }

                if (
                    corsOrigins.length ===
                    0
                ) {

                    console.warn(
                        '⚠️ CORS_ORIGINS no configurado en producción'
                    );

                    return callback(
                        new Error(
                            'Origen no permitido por CORS'
                        )
                    );
                }

                if (
                    corsOrigins.includes(
                        origin
                    )
                ) {

                    return callback(
                        null,
                        true
                    );
                }

                return callback(
                    new Error(
                        'Origen no permitido por CORS'
                    )
                );
            },

        credentials:
            true
    })
);

app.use(
    morgan('combined')
);

/* ================================================================
   RATE LIMIT GENERAL API
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
            success:
                false,

            error:
                'Demasiadas peticiones'
        }
    });

app.use(
    '/api/',
    (req, res, next) => {

        if (
            req.path.startsWith(
                '/webhook/'
            )
        ) {
            return next();
        }

        // Excepción para LiveKit para no limitar demasiado
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
        limit:
            '2mb',

        verify:
            (
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
        extended:
            true,

        limit:
            '2mb',

        verify:
            (
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
   FUNCIÓN AUXILIAR:
   VALIDAR TOKEN TURNSTILE
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
        typeof token !==
            'string'
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
            result.success !==
            true
        ) {

            console.warn(
                '⚠️ Turnstile rechazó la solicitud:',
                result['error-codes'] ||
                    []
            );

            return {
                success:
                    false,

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

            console.warn(
                '⚠️ Acción Turnstile inválida:',
                result.action
            );

            return {
                success:
                    false,

                error:
                    'TURNSTILE_ACTION_INVALID'
            };
        }

        if (
            result.hostname &&
            result.hostname !==
                TURNSTILE_EXPECTED_HOSTNAME
        ) {

            console.warn(
                '⚠️ Hostname Turnstile inválido:',
                result.hostname
            );

            return {
                success:
                    false,

                error:
                    'TURNSTILE_HOSTNAME_INVALID'
            };
        }

        return {
            success:
                true,

            hostname:
                result.hostname ||
                null,

            action:
                result.action ||
                null
        };

    } catch (error) {

        console.error(
            '❌ Error verificando Turnstile:',
            error.message
        );

        return {
            success:
                false,

            error:
                'TURNSTILE_VERIFY_ERROR'
        };
    }
}

/* ================================================================
   FUNCIÓN AUXILIAR:
   OBTENER TOKEN DE AUTORIZACIÓN
================================================================ */

function obtenerAuthorizationHeader(
    req
) {

    const authorization =
        req.headers.authorization;

    if (
        typeof authorization !==
        'string'
    ) {
        return null;
    }

    if (
        !authorization.startsWith(
            'Bearer '
        )
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
   FUNCIÓN AUXILIAR:
   LLAMAR EDGE FUNCTION
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
        typeof data ===
        'string'
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
   RUTA:
   ELIMINACIÓN SEGURA DE CUENTA
================================================================ */

app.post(
    '/api/account/delete',
    async (req, res) => {

        const requestId =
            crypto.randomUUID();

        try {

            console.log(
                `🗑️ Solicitud de eliminación recibida [${requestId}]`
            );

            /* ----------------------------------------------------
               1. VALIDAR CONFIGURACIÓN
            ---------------------------------------------------- */

            if (
                !SUPABASE_URL ||
                !SUPABASE_ANON_KEY
            ) {

                console.error(
                    `[${requestId}] Supabase no configurado`
                );

                return res.status(500).json({
                    success:
                        false,

                    error:
                        'SERVIDOR_NO_CONFIGURADO'
                });
            }

            if (
                !TURNSTILE_SECRET_KEY
            ) {

                console.error(
                    `[${requestId}] Turnstile Secret no configurado`
                );

                return res.status(503).json({
                    success:
                        false,

                    error:
                        'SEGURIDAD_NO_CONFIGURADA'
                });
            }

            /* ----------------------------------------------------
               2. AUTORIZACIÓN
            ---------------------------------------------------- */

            const authorization =
                obtenerAuthorizationHeader(
                    req
                );

            if (!authorization) {

                console.warn(
                    `[${requestId}] Solicitud sin Bearer token`
                );

                return res.status(401).json({
                    success:
                        false,

                    error:
                        'NO_AUTENTICADO'
                });
            }

            /* ----------------------------------------------------
               3. OBTENER USUARIO
            ---------------------------------------------------- */

            const user =
                await obtenerUsuario(
                    req
                );

            if (!user) {

                console.warn(
                    `[${requestId}] Token inválido o usuario inexistente`
                );

                return res.status(401).json({
                    success:
                        false,

                    error:
                        'NO_AUTENTICADO'
                });
            }

            /* ----------------------------------------------------
               4. VALIDAR CONFIRMACIÓN
            ---------------------------------------------------- */

            const confirmation =
                typeof req.body
                    ?.confirmation ===
                    'string'
                    ? req.body
                        .confirmation
                        .trim()
                    : '';

            if (
                confirmation !==
                'ELIMINAR'
            ) {

                console.warn(
                    `[${requestId}] Confirmación inválida para usuario ${user.id}`
                );

                return res.status(400).json({
                    success:
                        false,

                    error:
                        'CONFIRMACION_INVALIDA'
                });
            }

            /* ----------------------------------------------------
               5. VALIDAR ACTION
            ---------------------------------------------------- */

            const action =
                typeof req.body
                    ?.action ===
                    'string'
                    ? req.body
                        .action
                        .trim()
                    : '';

            if (
                action !==
                'delete_account'
            ) {

                return res.status(400).json({
                    success:
                        false,

                    error:
                        'ACCION_INVALIDA'
                });
            }

            /* ----------------------------------------------------
               6. OBTENER TOKEN TURNSTILE
            ---------------------------------------------------- */

            const turnstileToken =
                typeof req.body
                    ?.turnstile_token ===
                    'string'
                    ? req.body
                        .turnstile_token
                        .trim()
                    : '';

            if (!turnstileToken) {

                return res.status(400).json({
                    success:
                        false,

                    error:
                        'VERIFICACION_SEGURIDAD_REQUERIDA'
                });
            }

            /* ----------------------------------------------------
               7. VALIDAR TURNSTILE
            ---------------------------------------------------- */

            const turnstile =
                await verificarTurnstile(
                    turnstileToken,
                    req
                );

            if (
                !turnstile.success
            ) {

                console.warn(
                    `[${requestId}] Turnstile rechazado para usuario ${user.id}: ${turnstile.error}`
                );

                return res.status(403).json({
                    success:
                        false,

                    error:
                        'VERIFICACION_SEGURIDAD_FALLIDA'
                });
            }

            /* ----------------------------------------------------
               8. CREAR SOLICITUD
            ---------------------------------------------------- */

            console.log(
                `📝 [${requestId}] Creando solicitud de eliminación para ${user.id}`
            );

            let deletionRequest;

            try {

                deletionRequest =
                    await llamarEdgeFunction(
                        ACCOUNT_DELETION_REQUEST_FUNCTION,
                        authorization
                    );

            } catch (error) {

                console.error(
                    `❌ [${requestId}] Error request-account-deletion:`,
                    error.data ||
                        error.message
                );

                return res.status(
                    error.status ===
                        401
                        ? 401
                        : 500
                ).json({

                    success:
                        false,

                    error:
                        'NO_SE_PUDO_CREAR_SOLICITUD_ELIMINACION',

                    request_id:
                        requestId
                });
            }

            /* ----------------------------------------------------
               9. PROCESAR ELIMINACIÓN
            ---------------------------------------------------- */

            console.log(
                `⚙️ [${requestId}] Procesando eliminación para ${user.id}`
            );

            let deletionResult;

            try {

                deletionResult =
                    await llamarEdgeFunction(
                        ACCOUNT_DELETION_PROCESS_FUNCTION,
                        authorization
                    );

            } catch (error) {

                console.error(
                    `❌ [${requestId}] Error process-account-deletion:`,
                    error.data ||
                        error.message
                );

                return res.status(
                    error.status ===
                        401
                        ? 401
                        : 500
                ).json({

                    success:
                        false,

                    error:
                        'NO_SE_PUDO_PROCESAR_ELIMINACION',

                    request_id:
                        requestId
                });
            }

            /* ----------------------------------------------------
               10. VERIFICAR RESULTADO
            ---------------------------------------------------- */

            if (
                !deletionResult ||
                deletionResult.success !==
                    true
            ) {

                console.error(
                    `❌ [${requestId}] Eliminación no completada:`,
                    deletionResult
                );

                return res.status(500).json({

                    success:
                        false,

                    error:
                        'ELIMINACION_NO_COMPLETADA',

                    request_id:
                        requestId
                });
            }

            /* ----------------------------------------------------
               11. RESPUESTA FINAL
            ---------------------------------------------------- */

            console.log(
                `✅ [${requestId}] Cuenta eliminada correctamente: ${user.id}`
            );

            return res.status(200).json({

                success:
                    true,

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
                `❌ [${requestId}] Error inesperado en eliminación:`,
                error
            );

            return res.status(500).json({

                success:
                    false,

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
    fs.existsSync(
        publicPath
    )
) {

    app.use(
        express.static(
            publicPath
        )
    );

    console.log(
        '✅ Sirviendo archivos estáticos desde:',
        publicPath
    );

} else {

    console.warn(
        '⚠️ No se encontró la carpeta public/:',
        publicPath
    );

    console.log(
        '📁 Archivos en /app:',
        fs.readdirSync(
            __dirname
        ).join(', ')
    );
}

/* ================================================================
   RUTAS DE FEATURES
================================================================ */

app.use(
    '/live',
    express.static(
        path.join(
            __dirname,
            'public',
            'features',
            'live'
        )
    )
);

app.use(
    '/videos',
    express.static(
        path.join(
            __dirname,
            'public',
            'features',
            'videos'
        )
    )
);

app.use(
    '/muro',
    express.static(
        path.join(
            __dirname,
            'public',
            'features',
            'muro'
        )
    )
);

app.use(
    '/perfil',
    express.static(
        path.join(
            __dirname,
            'public',
            'features',
            'perfil'
        )
    )
);

app.use(
    '/mensajes',
    express.static(
        path.join(
            __dirname,
            'public',
            'features',
            'mensajes'
        )
    )
);

app.use(
    '/internet',
    express.static(
        path.join(
            __dirname,
            'public',
            'features',
            'internet'
        )
    )
);

/* ================================================================
   RUTAS DE AUTENTICACIÓN
================================================================ */

const authRoutes =
    require('./routes/auth');

app.use(
    '/api/auth',
    authRoutes
);

/* ================================================================
   RUTAS DE PAGOS Y WEBHOOK
================================================================ */

const paymentsRoutes =
    require('./routes/payments');

const webhooksRoutes =
    require('./routes/webhooks');

app.use(
    '/api/payments',
    paymentsRoutes
);

app.use(
    '/api/webhook',
    webhooksRoutes
);

/* ================================================================
   RUTA DE MEMBRESÍA
================================================================ */

const membresiaRoutes =
    require('./routes/membresia');

app.use(
    '/api/payments/membresia',
    membresiaRoutes
);

/* ================================================================
   RUTAS HTML
================================================================ */

app.get(
    '/',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'index.html'
            )
        );
    }
);

app.get(
    '/features/muro/muro.html',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'muro',
                'muro.html'
            )
        );
    }
);

app.get(
    '/features/perfil/perfil.html',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'perfil',
                'perfil.html'
            )
        );
    }
);

app.get(
    '/features/mensajes/mensajes.html',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'mensajes',
                'mensajes.html'
            )
        );
    }
);

app.get(
    '/features/mensajes/contactos.html',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'mensajes',
                'contactos.html'
            )
        );
    }
);

app.get(
    '/features/live/live.html',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'live',
                'live.html'
            )
        );
    }
);

app.get(
    '/features/internet/internet.html',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'internet',
                'internet.html'
            )
        );
    }
);

app.get(
    '/features/videos/videos.html',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'videos',
                'videos.html'
            )
        );
    }
);

/* ================================================================
   RUTAS AMIGABLES
================================================================ */

app.get(
    '/muro',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'muro',
                'muro.html'
            )
        );
    }
);

app.get(
    '/perfil',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'perfil',
                'perfil.html'
            )
        );
    }
);

app.get(
    '/mensajes',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'mensajes',
                'mensajes.html'
            )
        );
    }
);

app.get(
    '/contactos',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'mensajes',
                'contactos.html'
            )
        );
    }
);

app.get(
    '/live',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'live',
                'live.html'
            )
        );
    }
);

app.get(
    '/internet',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'internet',
                'internet.html'
            )
        );
    }
);

app.get(
    '/videos',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'features',
                'videos',
                'videos.html'
            )
        );
    }
);

/* ================================================================
   OTRAS RUTAS
================================================================ */

app.get(
    '/admin.html',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'admin.html'
            )
        );
    }
);

app.get(
    '/qr',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'qr-generator.html'
            )
        );
    }
);

app.get(
    '/actualizar-contrasena',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'actualizar-contrasena.html'
            )
        );
    }
);

app.get(
    '/terminos',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'terminos.html'
            )
        );
    }
);

app.get(
    '/privacidad',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'privacidad.html'
            )
        );
    }
);

app.get(
    '/cookies',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'cookies.html'
            )
        );
    }
);

app.get(
    '/live-terminos',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'live-terminos.html'
            )
        );
    }
);

/* ================================================================
   HEALTH CHECK
================================================================ */

app.get(
    '/api/health',
    (req, res) => {

        res.status(200).json({

            status:
                'healthy',

            timestamp:
                new Date()
                    .toISOString(),

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
            }
        });
    }
);

/* ================================================================
   SPA FALLBACK
================================================================ */

app.get(
    '*',
    (req, res, next) => {

        if (
            req.path.startsWith(
                '/api/'
            ) ||
            req.path.startsWith(
                '/webhook/'
            )
        ) {

            return next();
        }

        if (
            path.extname(
                req.path
            ) !== ''
        ) {

            return next();
        }

        const indexPath =
            path.join(
                __dirname,
                'public',
                'index.html'
            );

        if (
            fs.existsSync(
                indexPath
            )
        ) {

            res.sendFile(
                indexPath
            );

        } else {

            next();
        }
    }
);

/* ================================================================
   MANEJO DE ERRORES - API
================================================================ */

app.use(
    '/api',
    (req, res) => {

        return res.status(404).json({

            success:
                false,

            error:
                'Endpoint no encontrado'
        });
    }
);

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
                process.env.NODE_ENV ===
                'production'
                    ? 'Error interno del servidor'
                    : err.message
        });
    }
);

/* ================================================================
   INICIAR SERVIDOR
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
            `🔐 Auth router: ✅ /api/auth`
        );

        console.log(
            `💳 Payments router: ✅ /api/payments`
        );

        console.log(
            `📡 Webhook router: ✅ /api/webhook`
        );

        console.log(
            `✨ Membresía router: ✅ /api/payments/membresia`
        );

        console.log(
            `🌎 I18N: ✅ /api/idiomas`
        );

        console.log(
            `📝 Traducciones: ✅ /api/traducciones`
        );

        console.log(
            `🌐 I18N completo: ✅ /api/i18n`
        );

        console.log(
            `👤 Idioma usuario: ✅ /api/usuarios/idioma`
        );

        console.log(
            `🗑️ Eliminación de cuenta: ✅ /api/account/delete`
        );

        console.log(
            `🛡️ Turnstile eliminación: ${
                TURNSTILE_SECRET_KEY
                    ? '✅ Configurado'
                    : '❌ No configurado'
            }`
        );

        console.log(
            `📝 Request deletion function: ${
                ACCOUNT_DELETION_REQUEST_FUNCTION
            }`
        );

        console.log(
            `⚙️ Process deletion function: ${
                ACCOUNT_DELETION_PROCESS_FUNCTION
            }`
        );

        console.log(
            `🌎 Idioma por defecto: ${IDIOMA_POR_DEFECTO}`
        );

        console.log(
            `🌍 Idiomas soportados: ${IDIOMAS_VALIDOS.join(', ')}`
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
                LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL
                    ? '✅ Configurado'
                    : '❌ No configurado'
            }`
        );

        console.log(
            '========================================'
        );
    }
);

module.exports = app;