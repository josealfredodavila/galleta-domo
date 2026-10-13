// ================================================================
// RUTAS LIVEKIT — Csariel's
//   POST /api/livekit/token   → token para unirse a una sala
//   GET  /api/livekit/streams → transmisiones activas (columnas públicas)
// La sala y el permiso de publicar los decide SIEMPRE el servidor.
// v3: registra cada espectador único en live_espectadores (vistas reales).
//     Los lives de pago exigen un pago confirmado (402 si no lo tiene).
// ================================================================

const express = require('express');
const router = express.Router();
const { AccessToken } = require('livekit-server-sdk');
const { supabase, supabaseAdmin } = require('../config/supabase');
const { verificarToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL } = process.env;

// ================================================================
// POST /token
// Body: { streamId: number, rol: 'streamer' | 'viewer' }
// ================================================================
router.post('/token', verificarToken, async (req, res) => {
    try {
        const user = req.usuario;
        const streamId = Number(req.body?.streamId);

        if (!Number.isInteger(streamId) || streamId <= 0) {
            return res.status(400).json({ success: false, error: 'streamId_invalido' });
        }
        if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_WS_URL) {
            logger.error('[LiveKit] Variables de entorno incompletas');
            return res.status(500).json({ success: false, error: 'livekit_no_configurado' });
        }

        const db = supabaseAdmin || supabase;
        if (!db) return res.status(500).json({ success: false, error: 'db_no_configurada' });

        const { data: stream, error } = await db
            .from('transmisiones')
            .select('id, streamer_id, room_name, estado, is_live, precio_acceso')
            .eq('id', streamId)
            .maybeSingle();

        if (error) {
            logger.error(`[LiveKit] db: ${error.message}`);
            return res.status(500).json({ success: false, error: 'db' });
        }
        if (!stream || stream.estado !== 'en_vivo' || stream.is_live !== true) {
            return res.status(404).json({ success: false, error: 'transmision_no_activa' });
        }

        const esDueno = stream.streamer_id === user.id;

        // ---------- Candado de pago (solo espectadores de lives con precio) ----------
        const precio = Number(stream.precio_acceso) || 0;
        if (!esDueno && precio > 0) {
            const { data: pago, error: errPago } = await db
                .from('pagos_transmision')
                .select('id')
                .eq('transmision_id', stream.id)
                .eq('espectador_id', user.id)
                .eq('estado', 'pagado')
                .limit(1)
                .maybeSingle();

            if (errPago) {
                logger.error(`[LiveKit] pago: ${errPago.message}`);
                return res.status(500).json({ success: false, error: 'db' });
            }
            if (!pago) {
                return res.status(402).json({
                    success: false,
                    error: 'pago_requerido',
                    precio_acceso: precio,
                    moneda: 'USD'
                });
            }
        }

        // ---------- Publicar solo: dueño + rol streamer + Live Pass válido ----------
        let canPublish = false;
        if (req.body?.rol === 'streamer' && esDueno) {
            const { data: pass, error: passErr } = await db.rpc('puede_transmitir_live', {
                p_usuario_id: user.id
            });
            if (passErr) {
                logger.error(`[LiveKit] live pass: ${passErr.message}`);
                return res.status(500).json({ success: false, error: 'live_pass_check' });
            }
            if (pass?.puede !== true) {
                return res.status(403).json({ success: false, error: 'live_pass_invalido' });
            }
            canPublish = true;
        }

        // ---------- Registrar espectador único (no cuenta al dueño) ----------
        if (!esDueno) {
            const { error: errEsp } = await db
                .from('live_espectadores')
                .upsert(
                    { transmision_id: stream.id, usuario_id: user.id },
                    { onConflict: 'transmision_id,usuario_id', ignoreDuplicates: true }
                );
            if (errEsp) {
                // No bloquea la entrada: solo afecta el contador de vistas
                logger.warn(`[LiveKit] registrar espectador: ${errEsp.message}`);
            }
        }

        // Nombre visible desde la tabla de perfiles, no desde metadatos editables
        const { data: perfil } = await db
            .from('usuarios')
            .select('nombre')
            .eq('id', user.id)
            .maybeSingle();

        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: user.id,
            name: perfil?.nombre || 'Usuario',
            ttl: '2h'
        });
        at.addGrant({
            roomJoin: true,
            room: stream.room_name,
            canPublish,
            canSubscribe: true,
            canPublishData: false
        });
        const token = await at.toJwt();

        return res.json({
            success: true,
            token,
            url: LIVEKIT_WS_URL,
            wsUrl: LIVEKIT_WS_URL,
            canPublish,
            identity: user.id
        });
    } catch (e) {
        logger.error(`[LiveKit] token: ${e.message}`);
        return res.status(500).json({ success: false, error: 'servidor' });
    }
});

// ================================================================
// GET /streams — solo columnas públicas, sin room_name ni streamer_id
// ================================================================
router.get('/streams', async (req, res) => {
    try {
        const db = supabase || supabaseAdmin;
        if (!db) return res.status(500).json({ success: false, error: 'db_no_configurada' });

        const { data, error } = await db
            .from('transmisiones')
            .select('id, titulo, categoria, viewers_count, fecha_inicio, estado, is_live, precio_acceso')
            .eq('estado', 'en_vivo')
            .eq('is_live', true)
            .is('grupo_id', null)
            .order('fecha_inicio', { ascending: false })
            .limit(50);

        if (error) throw error;
        return res.json({ success: true, data });
    } catch (e) {
        logger.error(`[LiveKit] streams: ${e.message}`);
        return res.status(500).json({ success: false, error: 'db' });
    }
});

module.exports = router;