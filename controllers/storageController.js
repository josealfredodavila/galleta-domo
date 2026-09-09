// ================================================================
// CONTROLLERS/STORAGECONTROLLER.JS - SARIEL'S BACKEND
// ================================================================

const { supabaseAdmin } = require('../config/supabase');

const ALLOWED_BUCKETS = ['chat-attachments', 'chat-audio'];

/**
 * Genera una URL firmada para un archivo en Supabase Storage
 */
exports.generarUrlFirmada = async (req, res) => {
    try {
        const { bucket, filePath, expiresIn = 3600 } = req.body;

        // Validar parámetros
        if (!bucket) {
            return res.status(400).json({ 
                success: false, 
                error: 'Falta el parámetro "bucket"' 
            });
        }

        if (!filePath) {
            return res.status(400).json({ 
                success: false, 
                error: 'Falta el parámetro "filePath"' 
            });
        }

        // Validar bucket permitido
        if (!ALLOWED_BUCKETS.includes(bucket)) {
            return res.status(400).json({
                success: false,
                error: `Bucket no permitido. Usa: ${ALLOWED_BUCKETS.join(', ')}`
            });
        }

        // Validar expiración (máximo 7 días)
        if (expiresIn > 604800) {
            return res.status(400).json({
                success: false,
                error: 'La expiración no puede superar los 7 días (604800 segundos)'
            });
        }

        // Generar URL firmada
        const { data, error } = await supabaseAdmin.storage
            .from(bucket)
            .createSignedUrl(filePath, expiresIn);

        if (error) {
            console.error('Error generando URL firmada:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al generar URL firmada: ' + error.message
            });
        }

        // Devolver URL firmada
        return res.status(200).json({
            success: true,
            signedUrl: data.signedUrl,
            expiresIn: expiresIn,
            bucket: bucket,
            filePath: filePath
        });

    } catch (error) {
        console.error('Error en generarUrlFirmada:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor: ' + error.message
        });
    }
};