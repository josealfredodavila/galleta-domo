const express = require('express');
const router = express.Router();

// Ruta para buscar música
router.get('/buscar', async (req, res) => {
    try {
        const cancion = req.query.q; // Lo que el usuario pide
        if (!cancion) {
            return res.status(400).json({ error: 'Falta el nombre de la canción' });
        }

        // Hacemos la petición a Deezer (igual que lo hiciste en el navegador)
        const url = `https://api.deezer.com/search?q=${encodeURIComponent(cancion)}`;
        const respuesta = await fetch(url);
        const datos = await respuesta.json();

        // Si Deezer encuentra algo, devolvemos los datos limpios
        if (datos.data && datos.data.length > 0) {
            const primera = datos.data[0];
            return res.json({
                exito: true,
                titulo: primera.title,
                artista: primera.artist.name,
                caratula: primera.album.cover_medium,
                audio_preview: primera.preview
            });
        } else {
            return res.json({ exito: false, mensaje: 'No se encontró la canción' });
        }
    } catch (error) {
        console.error("Error en Deezer:", error);
        return res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;