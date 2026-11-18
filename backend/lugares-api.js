// backend/lugares-api.js
const express = require('express');
const router = express.Router();

router.get('/buscar', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 3) return res.status(400).json({ error: 'Búsqueda muy corta' });

        const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
        if (!GOOGLE_API_KEY) {
            return res.status(500).json({ error: 'Falta la API Key de Google en el servidor' });
        }

        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&language=es`;
        
        // Usamos fetch nativo (Node 18+)
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            console.error('[Google Places] Error:', data.status, data.error_message);
            return res.status(500).json({ error: 'Error al buscar lugares' });
        }

        const resultados = (data.results || []).map(lugar => ({
            place_id: lugar.place_id,
            nombre: lugar.name,
            direccion: lugar.formatted_address,
            lat: lugar.geometry.location.lat,
            lng: lugar.geometry.location.lng
        }));

        res.json({ resultados });
    } catch (error) {
        console.error('Error en el servidor buscando lugares:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;