// ================================================================
// ROUTES/PUSH.JS — Csariel's · v2.7
// CAMBIOS v2.7:
// - enviarPushLlamadaEntrante: vibración larga y requireInteraction
//   para despertar la pantalla en llamadas entrantes.
// ================================================================

const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const { supabaseAdmin } = require('../config/supabase');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:noreply@csariels.com';

const PUSH_ACTIVO = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (!PUSH_ACTIVO) {
    console.error('⚠️ [Push] VAPID keys NO configuradas. Push deshabilitadas.');
} else {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log('✅ [Push] VAPID configurado');
}

// ================================================================
// AUTENTICACIÓN
// ================================================================
async function verificarAutenticacion(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
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
        return next();
    } catch (error) {
        console.error('[Push] Error auth:', error.message);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

// ================================================================
// GET /vapid-public-key
// ================================================================
router.get('/vapid-public-key', (req, res) => {
    if (!PUSH_ACTIVO) {
        return res.status(503).json({ success: false, error: 'Push notifications no configuradas' });
    }
    return res.json({ success: true, publicKey: VAPID_PUBLIC_KEY });
});

// ================================================================
// POST /subscribe
// ================================================================
router.post('/subscribe', verificarAutenticacion, async (req, res) => {
    try {
        const { endpoint, keys, device_type } = req.body || {};

        if (!endpoint || typeof endpoint !== 'string' || !keys || !keys.p256dh || !keys.auth) {
            return res.status(400).json({ success: false, error: 'Faltan datos de suscripción' });
        }

        const { error: errLimpieza } = await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpoint)
            .neq('usuario_id', req.user.id);

        if (errLimpieza) {
            console.error('[Push] Error limpiando endpoint ajeno:', errLimpieza.message);
            return res.status(500).json({ success: false, error: 'Error guardando suscripción' });
        }

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .upsert({
                usuario_id: req.user.id,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                device_type: String(device_type || 'unknown').slice(0, 20),
                user_agent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
                activo: true,
                ultima_vez_usado: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { onConflict: 'usuario_id,endpoint' });

        if (error) {
            console.error('[Push] Error guardando suscripción:', error.message);
            return res.status(500).json({ success: false, error: 'Error guardando suscripción' });
        }

        return res.json({ success: true, message: 'Suscripción registrada' });
    } catch (error) {
        console.error('[Push] Error en /subscribe:', error.message);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ================================================================
// POST /unsubscribe
// ================================================================
router.post('/unsubscribe', verificarAutenticacion, async (req, res) => {
    try {
        const { endpoint } = req.body || {};
        if (!endpoint) {
            return res.status(400).json({ success: false, error: 'Falta endpoint' });
        }

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .update({ activo: false, updated_at: new Date().toISOString() })
            .eq('endpoint', endpoint)
            .eq('usuario_id', req.user.id);

        if (error) {
            console.error('[Push] Error desactivando suscripción:', error.message);
            return res.status(500).json({ success: false, error: 'Error borrando suscripción' });
        }

        return res.json({ success: true, message: 'Suscripción eliminada' });
    } catch (error) {
        console.error('[Push] Error en /unsubscribe:', error.message);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ================================================================
// POST /test
// ================================================================
router.post('/test', verificarAutenticacion, async (req, res) => {
    try {
        const resultado = await enviarPushAUsuarios([req.user.id], {
            title: "◈ Csariel's",
            body: 'Notificación de prueba ✅',
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            url: '/features/live/live.html',
            tag: 'test-notification'
        });
        return res.json({ success: true, resultado });
    } catch (error) {
        console.error('[Push] Error en /test:', error.message);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ================================================================
// POST /broadcast-live
// ================================================================
router.post('/broadcast-live', verificarAutenticacion, async (req, res) => {
    try {
        const streamId = Number(req.body?.stream_id);
        if (!Number.isInteger(streamId) || streamId <= 0) {
            return res.status(400).json({ success: false, error: 'stream_id inválido' });
        }

        const { data: stream, error: errStream } = await supabaseAdmin
            .from('transmisiones')
            .select('id, titulo, streamer_id, estado, is_live')
            .eq('id', streamId)
            .maybeSingle();

        if (errStream) {
            console.error('[Push] Error consultando transmisión:', errStream.message);
            return res.status(500).json({ success: false, error: 'Error consultando transmisión' });
        }

        if (!stream || stream.estado !== 'en_vivo' || stream.is_live !== true) {
            return res.status(404).json({ success: false, error: 'Transmisión no activa' });
        }

        if (stream.streamer_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'No autorizado' });
        }

        const { data: usuario } = await supabaseAdmin
            .from('usuarios')
            .select('nombre')
            .eq('id', req.user.id)
            .maybeSingle();

        const nombre = usuario?.nombre || 'Un streamer';
        const titulo = String(stream.titulo || '¡Únete ahora!').slice(0, 120);

        const resultado = await enviarPushASeguidores(req.user.id, {
            title: `🔴 ${nombre} está en vivo`,
            body: titulo,
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            url: '/features/live/live.html',
            tag: `live-${stream.id}`,
            data: { stream_id: stream.id, streamer_id: req.user.id, tipo: 'live_iniciado' }
        });

        console.log(`[Push] Live ${stream.id}: ${resultado.enviados} enviados, ${resultado.fallidos} fallidos`);

        return res.json({
            success: true,
            enviados: resultado.enviados,
            fallidos: resultado.fallidos
        });
    } catch (error) {
        console.error('[Push] Error en /broadcast-live:', error.message);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ================================================================
// HELPER: push a usuarios específicos
// ================================================================
async function enviarPushAUsuarios(usuarioIds, payload) {
    if (!PUSH_ACTIVO) {
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
        console.error('[Push] Error consultando suscripciones:', error.message);
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
        requireInteraction: payload.requireInteraction || false,
        renotify: payload.renotify || false,
        vibrate: payload.vibrate || [200, 100, 200, 100, 200],
        actions: Array.isArray(payload.actions) ? payload.actions : [],
        timestamp: Date.now()
    });

    let enviados = 0;
    let fallidos = 0;
    const endpointsExpirados = [];

    for (const sub of subs) {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
        };

        try {
            await webpush.sendNotification(pushSubscription, payloadString, {
                TTL: 60,
                urgency: 'high',
                topic: 'llamada-entrante'
            });
            enviados++;
        } catch (err) {
            fallidos++;
            if (err.statusCode === 410 || err.statusCode === 404) {
                endpointsExpirados.push(sub.endpoint);
            } else {
                console.warn('[Push] Error enviando:', err.statusCode || err.message);
            }
        }
    }

    if (endpointsExpirados.length > 0) {
        const { error: errDesactiva } = await supabaseAdmin
            .from('push_subscriptions')
            .update({ activo: false, updated_at: new Date().toISOString() })
            .in('endpoint', endpointsExpirados)
            .in('usuario_id', usuarioIds);

        if (errDesactiva) {
            console.error('[Push] Error desactivando expirados:', errDesactiva.message);
        } else {
            console.log(`[Push] ${endpointsExpirados.length} suscripciones expiradas desactivadas`);
        }
    }

    return { enviados, fallidos };
}

// ================================================================
// HELPER: push a seguidores de un streamer
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
            .map((s) => s.seguidor_id)
            .filter((id) => id && id !== streamerId);

        return await enviarPushAUsuarios(ids, payload);
    } catch (error) {
        console.error('[Push] Error enviando a seguidores:', error.message);
        return { enviados: 0, fallidos: 0 };
    }
}

// ================================================================
// HELPER: push de llamada entrante (usado por llamadas.js)
// ================================================================
async function enviarPushLlamadaEntrante(destinatarioId, nombre, avatar, llamadaId) {
    console.log(`[Push] Iniciando envío de Push a ${destinatarioId} para llamada ${llamadaId}`);

    const resultado = await enviarPushAUsuarios([destinatarioId], {
        title: `📞 Llamada de ${nombre}`,
        body: 'Toca para contestar la videollamada',
        icon: avatar || '/icon-192.png',
        badge: '/badge-72.png',
        url: `/features/mensajes/mensajes.html?llamadaId=${llamadaId}`,
        tag: `llamada-${llamadaId}`,
        requireInteraction: true, // 🔥 Mantiene la notificación fija en pantalla
        renotify: true,
        vibrate: [1000, 500, 1000, 500, 1000], // 🔥 Vibración larga e insistente
        data: { tipo: 'llamada_entrante', llamadaId },
        actions: [
            { action: 'accept', title: '✅ Aceptar' },
            { action: 'reject', title: '❌ Rechazar' }
        ]
    });

    console.log(`[Push] Llamada ${llamadaId}: ${resultado.enviados} enviados, ${resultado.fallidos} fallidos`);

    return resultado;
}

module.exports = router;
module.exports.enviarPushAUsuarios = enviarPushAUsuarios;
module.exports.enviarPushASeguidores = enviarPushASeguidores;
module.exports.enviarPushLlamadaEntrante = enviarPushLlamadaEntrante;