// ================================================================
// ROUTES/PUSH.JS - SARIEL'S ECOSYSTEM
// ================================================================
// Endpoints para Web Push Notifications.
//
// Endpoints:
//   GET  /api/push/vapid-public-key  → Devuelve VAPID key pública
//   POST /api/push/subscribe         → Guarda suscripción
//   POST /api/push/unsubscribe       → Borra suscripción
//   POST /api/push/test              → Notificación de prueba
//   POST /api/push/broadcast-live    → Notifica seguidores (live)
//
// Exporta:
//   enviarPushAUsuarios(ids, payload)
//   enviarPushASeguidores(streamerId, payload)
// ================================================================

const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

// ================================================================
// CONFIGURACIÓN VAPID
// ================================================================
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:noreply@csariels.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('⚠️ [Push] VAPID keys NO configuradas. Push deshabilitadas.');
} else {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log('✅ [Push] VAPID configurado');
}

// ================================================================
// SUPABASE ADMIN (usa service_role para leer subs de otros)
// ================================================================
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ================================================================
// MIDDLEWARE AUTENTICACIÓN
// ================================================================
async function verificarAutenticacion(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }
        const token = authHeader.slice(7).trim();
        if (!token) {
            return res.status(401).json({ success: false, error: 'Token vacío' });
        }
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Token inválido' });
        }
        req.user = user;
        next();
    } catch (error) {
        console.error('[Push] Error auth:', error);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

// ================================================================
// GET /api/push/vapid-public-key
// ================================================================
router.get('/vapid-public-key', (req, res) => {
    if (!VAPID_PUBLIC_KEY) {
        return res.status(503).json({
            success: false,
            error: 'Push notifications no configuradas'
        });
    }
    return res.json({
        success: true,
        publicKey: VAPID_PUBLIC_KEY
    });
});

// ================================================================
// POST /api/push/subscribe
// ================================================================
router.post('/subscribe', verificarAutenticacion, async (req, res) => {
    try {
        const { endpoint, keys, device_type } = req.body;

        if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
            return res.status(400).json({
                success: false,
                error: 'Faltan datos de suscripción'
            });
        }

        const userAgent = req.headers['user-agent'] || null;

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .upsert({
                usuario_id: req.user.id,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                device_type: device_type || 'unknown',
                user_agent: userAgent,
                activo: true,
                ultima_vez_usado: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'endpoint'
            });

        if (error) {
            console.error('[Push] Error guardando suscripción:', error);
            return res.status(500).json({ success: false, error: 'Error guardando suscripción' });
        }

        console.log(`[Push] Suscripción guardada para usuario ${req.user.id}`);

        return res.json({ success: true, message: 'Suscripción registrada' });
    } catch (error) {
        console.error('[Push] Error en /subscribe:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ================================================================
// POST /api/push/unsubscribe
// ================================================================
router.post('/unsubscribe', verificarAutenticacion, async (req, res) => {
    try {
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({ success: false, error: 'Falta endpoint' });
        }

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .update({ activo: false, updated_at: new Date().toISOString() })
            .eq('endpoint', endpoint)
            .eq('usuario_id', req.user.id);

        if (error) {
            console.error('[Push] Error borrando suscripción:', error);
            return res.status(500).json({ success: false, error: 'Error borrando suscripción' });
        }

        return res.json({ success: true, message: 'Suscripción eliminada' });
    } catch (error) {
        console.error('[Push] Error en /unsubscribe:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ================================================================
// POST /api/push/test
// ================================================================
router.post('/test', verificarAutenticacion, async (req, res) => {
    try {
        const resultado = await enviarPushAUsuarios(
            [req.user.id],
            {
                title: "◈ Csariel's",
                body: 'Notificación de prueba ✅',
                icon: '/icon-192.png',
                badge: '/badge-72.png',
                url: '/features/live/live.html',
                tag: 'test-notification'
            }
        );

        return res.json({ success: true, resultado });
    } catch (error) {
        console.error('[Push] Error en /test:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ================================================================
// POST /api/push/broadcast-live
// ================================================================
// Notifica a todos los seguidores que un streamer inició live.
// ================================================================
router.post('/broadcast-live', verificarAutenticacion, async (req, res) => {
    try {
        const { streamer_id, stream_id, titulo } = req.body;
        const streamerId = streamer_id || req.user.id;

        if (streamerId !== req.user.id) {
            return res.status(403).json({ success: false, error: 'No autorizado' });
        }

        // Obtener nombre del streamer
        const { data: usuario } = await supabaseAdmin
            .from('usuarios')
            .select('nombre')
            .eq('id', streamerId)
            .maybeSingle();

        const nombre = usuario?.nombre || 'Un streamer';

        const resultado = await enviarPushASeguidores(streamerId, {
            title: `🔴 ${nombre} está en vivo`,
            body: titulo || '¡Únete ahora!',
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            url: `/features/live/live.html?transmision=${stream_id}`,
            tag: `live-${stream_id}`,
            data: { stream_id, streamer_id: streamerId, tipo: 'live_iniciado' }
        });

        console.log(`[Push] Live broadcast: ${resultado.enviados} enviados, ${resultado.fallidos} fallidos`);

        return res.json({
            success: true,
            enviados: resultado.enviados,
            fallidos: resultado.fallidos
        });
    } catch (error) {
        console.error('[Push] Error en /broadcast-live:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ================================================================
// HELPER: Enviar push a usuarios específicos
// ================================================================
async function enviarPushAUsuarios(usuarioIds, payload) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.warn('[Push] VAPID no configurado, saltando envío');
        return { enviados: 0, fallidos: 0 };
    }

    if (!Array.isArray(usuarioIds) || usuarioIds.length === 0) {
        return { enviados: 0, fallidos: 0 };
    }

    const { data: subs, error } = await supabaseAdmin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .in('usuario_id', usuarioIds)
        .eq('activo', true);

    if (error) {
        console.error('[Push] Error consultando suscripciones:', error);
        return { enviados: 0, fallidos: 0 };
    }

    if (!subs || subs.length === 0) {
        return { enviados: 0, fallidos: 0 };
    }

    const payloadString = JSON.stringify({
        title: payload.title || "◈ Csariel's",
        body: payload.body || '',
        icon: payload.icon || '/icon-192.png',
        badge: payload.badge || '/badge-72.png',
        url: payload.url || '/',
        tag: payload.tag || 'default',
        data: payload.data || {},
        timestamp: Date.now()
    });

    let enviados = 0;
    let fallidos = 0;
    const endpointsExpirados = [];

    for (const sub of subs) {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
            }
        };

        try {
            await webpush.sendNotification(pushSubscription, payloadString);
            enviados++;
        } catch (err) {
            fallidos++;
            if (err.statusCode === 410 || err.statusCode === 404) {
                endpointsExpirados.push(sub.endpoint);
            } else {
                console.warn(`[Push] Error enviando:`, err.statusCode || err.message);
            }
        }
    }

    if (endpointsExpirados.length > 0) {
        await supabaseAdmin
            .from('push_subscriptions')
            .update({ activo: false })
            .in('endpoint', endpointsExpirados);
        console.log(`[Push] ${endpointsExpirados.length} suscripciones expiradas desactivadas`);
    }

    console.log(`[Push] Enviados: ${enviados}, Fallidos: ${fallidos}`);
    return { enviados, fallidos };
}

// ================================================================
// HELPER: Enviar push a seguidores de un streamer
// ================================================================
async function enviarPushASeguidores(streamerId, payload) {
    try {
        const { data: seguidores, error } = await supabaseAdmin
            .from('live_seguidores')
            .select('seguidor_id')
            .eq('streamer_id', streamerId);

        if (error || !seguidores || seguidores.length === 0) {
            return { enviados: 0, fallidos: 0 };
        }

        const ids = seguidores
            .map(s => s.seguidor_id)
            .filter(id => id !== streamerId); // No notificar al streamer mismo

        return await enviarPushAUsuarios(ids, payload);
    } catch (error) {
        console.error('[Push] Error enviando a seguidores:', error);
        return { enviados: 0, fallidos: 0 };
    }
}

module.exports = router;
module.exports.enviarPushAUsuarios = enviarPushAUsuarios;
module.exports.enviarPushASeguidores = enviarPushASeguidores;