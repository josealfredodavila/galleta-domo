/* ================================================================
   routes/music.js - BÚSQUEDA DE MÚSICA (Deezer)
   ================================================================
   Montado en server.js como: app.use('/api/music', router)
   Endpoint: GET /api/music/buscar?q=...

   v2.0 — Validación de q, filtro de resultados sin preview,
          timeout, axios en lugar de fetch, formato único
          { success, resultados: [...] }.
================================================================ */

'use strict';

const express = require('express');
const axios = require('axios');

const router = express.Router();

const DEEZER_URL = 'https://api.deezer.com/search';
const DEEZER_TIMEOUT_MS = 8000;
const QUERY_MAX = 100;
const RESULTADOS_MAX = 5;

router.get('/buscar', async (req, res) => {
    try {
        const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

        if (!query) {
            return res.status(400).json({ success: false, error: 'Falta el parámetro q (canción)' });
        }

        if (query.length > QUERY_MAX) {
            return res.status(400).json({
                success: false,
                error: `El parámetro q es demasiado largo (máx ${QUERY_MAX})`
            });
        }

        const respuesta = await axios.get(DEEZER_URL, {
            params: { q: query },
            timeout: DEEZER_TIMEOUT_MS
        });

        const datos = Array.isArray(respuesta.data?.data) ? respuesta.data.data : [];

        const resultados = datos
            .filter(c => c && c.preview && c.artist && c.album)
            .slice(0, RESULTADOS_MAX)
            .map(c => ({
                id: c.id,
                titulo: c.title || '',
                artista: c.artist.name || '',
                caratula: c.album.cover_medium || '',
                audio_preview: c.preview,
                link_deezer: c.link || ''
            }));

        if (resultados.length === 0) {
            return res.json({ success: false, mensaje: 'No se encontró la canción' });
        }

        return res.json({ success: true, resultados });
    } catch (error) {
        console.error('❌ Error en Deezer (routes/music):', error.message);
        return res.status(500).json({ success: false, error: 'Error al conectar con Deezer' });
    }
});

module.exports = router;