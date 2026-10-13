// ================================================================
// RUTAS LIVEKIT — Csariel's
//   POST /api/livekit/token   → token para unirse a una sala
//   GET  /api/livekit/streams → transmisiones activas (público, sin datos sensibles)
// La sala y el permiso de publicar los decide SIEMPRE el servidor.
// v5: /streams incluye lives de canal públicos (tipo 'canal') además de los
//     lives normales (tipo 'live'). Los canales privados nunca se listan.
// ================================================================

const express = require('express');
const router = express.Router();
const { AccessToken } = require('livekit-server-sdk');
const { supabase, supabaseAdmin } = require('../config/supabase');
const { verificarToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL } = process.env;

const LIMITE_CANAL_MINUTOS = 120;
const MAX_STREAMS_PUBLICOS = 50;

// Fecha de hoy en hora de México (YYYY-MM-DD)
function fechaHoyMexico() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

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
            .select('id, streamer_id, room_name, estado, is_live, precio_acceso, grupo_id')
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
        const esCanal = stream.grupo_id != null;

        // ---------- Candado de pago (solo lives normales con precio) ----------
        const precio = Number(stream.precio_acceso) || 0;
        if (!esCanal && !esDueno && precio > 0) {
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

        // ---------- Publicar ----------
        let canPublish = false;
        if (req.body?.rol === 'streamer' && esDueno) {
            if (esCanal) {
                // Canal: sin Live Pass; solo tiempo diario personal
                const { data: uso, error: errUso } = await db
                    .from('canal_live_uso')
                    .select('minutos_usados')
                    .eq('usuario_id', user.id)
                    .eq('fecha', fechaHoyMexico())
                    .maybeSingle();

                if (errUso) {
                    logger.error(`[LiveKit] canal uso: ${errUso.message}`);
                    return res.status(500).json({ success: false, error: 'db' });
                }
                const restantes = LIMITE_CANAL_MINUTOS - (uso?.minutos_usados || 0);
                if (restantes <= 0) {
                    return res.status(403).json({ success: false, error: 'sin_minutos_hoy' });
                }
                canPublish = true;
            } else {
                // Live normal: Live Pass válido
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
// GET /streams — público, sin sesión.
// Devuelve solo datos seguros: sin room_name, sin streamer_id.
// - tipo 'live'  → lives normales (live.html)
// - tipo 'canal' → lives de canales PÚBLICOS (grupos.html)
// ================================================================
router.get('/streams', async (req, res) => {
    try {
        const db = supabase || supabaseAdmin;
        if (!db) return res.status(500).json({ success: false, error: 'db_no_configurada' });

        const { data, error } = await db
            .from('transmisiones')
            .select('id, titulo, categoria, viewers_count, fecha_inicio, estado, is_live, precio_acceso, grupo_id')
            .eq('estado', 'en_vivo')
            .eq('is_live', true)
            .order('fecha_inicio', { ascending: false })
            .limit(MAX_STREAMS_PUBLICOS);

        if (error) throw error;

        const filas = data || [];

        // Canales de los lives de canal: solo los públicos
        const idsGrupo = [...new Set(filas.filter((f) => f.grupo_id).map((f) => f.grupo_id))];
        const gruposPublicos = new Map();

        if (idsGrupo.length > 0) {
            const { data: grupos, error: errGrupos } = await db
                .from('grupos_video')
                .select('id, nombre, visibilidad')
                .in('id', idsGrupo)
                .eq('visibilidad', 'publico');

            if (errGrupos) throw errGrupos;
            (grupos || []).forEach((g) => gruposPublicos.set(g.id, g));
        }

        const lista = [];

        for (const f of filas) {
            if (f.grupo_id) {
                const grupo = gruposPublicos.get(f.grupo_id);
                if (!grupo) continue; // canal privado o inexistente: no se muestra

                lista.push({
                    id: f.id,
                    tipo: 'canal',
                    titulo: f.titulo,
                    categoria: f.categoria,
                    viewers_count: f.viewers_count,
                    fecha_inicio: f.fecha_inicio,
                    precio_acceso: 0,
                    grupo_id: grupo.id,
                    canal_nombre: grupo.nombre
                });
            } else {
                lista.push({
                    id: f.id,
                    tipo: 'live',
                    titulo: f.titulo,
                    categoria: f.categoria,
                    viewers_count: f.viewers_count,
                    fecha_inicio: f.fecha_inicio,
                    precio_acceso: f.precio_acceso
                });
            }
        }

        return res.json({ success: true, data: lista });
    } catch (e) {
        logger.error(`[LiveKit] streams: ${e.message}`);
        return res.status(500).json({ success: false, error: 'db' });
    }
});

module.exports = router;