// ================================================================
// ROUTES/MEDIA.JS — Sariel's Ecosystem
// Endpoint centralizado de subida con moderación
// ================================================================
// Endpoint:
//   POST /api/media/upload
//     multipart/form-data:
//       file    (obligatorio) — imagen o video
//       destino (obligatorio) — whitelist
//       tipo    (obligatorio) — 'imagen' | 'video'
//
// Destinos permitidos:
//   - muro-imagenes        (imágenes de publicaciones del muro)
//   - muro-videos          (imágenes y videos del perfil)
//   - grupos-publicaciones (posts, avatares, portadas de grupos)
//   - videos               (videos y miniaturas del feed de videos)
//   - sariels-avatars      (avatares de perfil del usuario)
//   - sariels-estados      (historias de 24 h)
//   - chat-attachments     (fotos y videos enviados en mensajes)
//   - mercado              (logos, portadas y fotos de productos)
//
// Reglas:
//   - Autenticación obligatoria (verificarToken).
//   - El id del usuario es req.usuario.id.
//   - Los límites de tamaño se validan ANTES de moderar.
//   - Si la moderación rechaza → 422 sin revelar la etiqueta.
//   - Logs solo con: usuario, fecha, destino, resultado. Nunca el archivo.
//   - El audio de voz NO pasa por aquí (no hay moderación de audio).
// ================================================================

'use strict';

const express = require('express');
const multer = require('multer');

const { verificarToken } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const { moderarImagen } = require('../services/moderacion/moderarImagen');
const { moderarVideo } = require('../services/moderacion/moderarVideo');

const router = express.Router();

// ================================================================
// CONFIGURACIÓN
// ================================================================

const LIMITE_IMAGEN_MB = 5;
const LIMITE_VIDEO_MB = 100;
const LIMITE_AVATAR_MB = 5;
const LIMITE_CHAT_VIDEO_MB = 50;

// Whitelist de destinos con sus reglas
const DESTINOS = {
    'muro-imagenes': {
        tipo: 'imagen',
        limiteMB: LIMITE_IMAGEN_MB
    },
    'muro-videos': {
        tipo: 'auto',
        limiteMBImagen: LIMITE_IMAGEN_MB,
        limiteMBVideo: LIMITE_VIDEO_MB
    },
    'grupos-publicaciones': {
        tipo: 'auto',
        limiteMBImagen: LIMITE_IMAGEN_MB,
        limiteMBVideo: LIMITE_VIDEO_MB
    },
    'videos': {
        tipo: 'auto',
        limiteMBImagen: LIMITE_IMAGEN_MB,
        limiteMBVideo: LIMITE_VIDEO_MB
    },
    'sariels-avatars': {
        tipo: 'imagen',
        limiteMB: LIMITE_AVATAR_MB
    },
    'sariels-estados': {
        tipo: 'imagen',
        limiteMB: LIMITE_IMAGEN_MB
    },
    'chat-attachments': {
        tipo: 'auto',
        limiteMBImagen: LIMITE_IMAGEN_MB,
        limiteMBVideo: LIMITE_CHAT_VIDEO_MB
    },
    // Mercado: logos, portadas y fotos de productos (solo imágenes, 3 MB)
    'mercado': {
        tipo: 'imagen',
        limiteMB: 3
    }
};

// Multer en memoria (máximo 100 MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024
    }
});

// ================================================================
// HELPERS
// ================================================================

function generarNombreArchivo(usuarioId, extension) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    return `${usuarioId}/${timestamp}-${random}.${extension}`;
}

function extensionSegura(mime) {
    const mapa = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov'
    };
    return mapa[mime] || null;
}

function logSubida(req, destino, resultado) {
    const usuario = req.usuario?.id || 'desconocido';
    const fecha = new Date().toISOString();
    console.log(
        `[media/upload] usuario=${usuario} fecha=${fecha} destino=${destino} resultado=${resultado}`
    );
}

// ================================================================
// POST /api/media/upload
// ================================================================

router.post(
    '/upload',
    verificarToken,
    upload.single('file'),
    async (req, res) => {
        const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);
        const destino = (req.body && req.body.destino) || '';
        const tipo = (req.body && req.body.tipo) || '';

        // 1) Validar autenticación
        if (!usuarioId) {
            logSubida(req, destino, 'no_auth');
            return res.status(401).json({ ok: false, error: 'No autenticado' });
        }

        // 2) Validar destino contra whitelist
        if (!DESTINOS[destino]) {
            logSubida(req, destino, 'destino_invalido');
            return res.status(400).json({ ok: false, error: 'Destino no permitido' });
        }

        // 3) Validar que el archivo llegó
        if (!req.file || !req.file.buffer) {
            logSubida(req, destino, 'sin_archivo');
            return res.status(400).json({ ok: false, error: 'Archivo requerido' });
        }

        // 4) Validar tipo declarado
        if (tipo !== 'imagen' && tipo !== 'video') {
            logSubida(req, destino, 'tipo_invalido');
            return res.status(400).json({ ok: false, error: 'Tipo inválido' });
        }

        // 5) Validar coherencia tipo vs destino
        const reglas = DESTINOS[destino];
        if (reglas.tipo === 'imagen' && tipo !== 'imagen') {
            logSubida(req, destino, 'tipo_no_permitido_en_destino');
            return res.status(400).json({ ok: false, error: 'Este destino solo acepta imágenes' });
        }

        // 6) Validar límite de tamaño
        const tamanioMB = req.file.size / 1024 / 1024;
        let limiteMB = reglas.limiteMB;
        if (reglas.tipo === 'auto') {
            limiteMB = tipo === 'video' ? reglas.limiteMBVideo : reglas.limiteMBImagen;
        }

        if (tamanioMB > limiteMB) {
            logSubida(req, destino, 'tamano_excedido');
            return res.status(413).json({
                ok: false,
                error: `El archivo supera el límite de ${limiteMB} MB`
            });
        }

        // 7) Moderar
        let resultadoModeracion;
        try {
            if (tipo === 'imagen') {
                resultadoModeracion = await moderarImagen(req.file.buffer);
            } else {
                resultadoModeracion = await moderarVideo(req.file.buffer, req.file.mimetype);
            }
        } catch (modErr) {
            console.error('❌ [media/upload] Error en moderación:', modErr.message || modErr);
            logSubida(req, destino, 'error_moderacion');
            return res.status(503).json({
                ok: false,
                error: 'No pudimos revisar el contenido. Intenta de nuevo.'
            });
        }

        // 8) Interpretar resultado de moderación
        if (!resultadoModeracion || !resultadoModeracion.ok) {
            const motivo = resultadoModeracion && resultadoModeracion.motivo;

            if (motivo === 'contenido_no_permitido') {
                logSubida(req, destino, 'rechazado_contenido');
                return res.status(422).json({ ok: false, error: 'Contenido no permitido' });
            }

            if (motivo === 'timeout' || motivo === 'servicio_no_disponible') {
                logSubida(req, destino, 'servicio_no_disponible');
                return res.status(503).json({
                    ok: false,
                    error: 'No pudimos revisar el contenido. Intenta de nuevo.'
                });
            }

            if (motivo === 'tipo_invalido') {
                logSubida(req, destino, 'tipo_archivo_invalido');
                return res.status(400).json({ ok: false, error: 'Tipo de archivo inválido' });
            }

            if (motivo === 'tamano_invalido') {
                logSubida(req, destino, 'tamano_invalido');
                return res.status(413).json({ ok: false, error: 'Archivo demasiado grande' });
            }

            logSubida(req, destino, 'rechazado_otro');
            return res.status(422).json({ ok: false, error: 'Contenido no permitido' });
        }

        // 9) Determinar extensión segura
        const extension = extensionSegura(req.file.mimetype);
        if (!extension) {
            logSubida(req, destino, 'extension_no_soportada');
            return res.status(400).json({ ok: false, error: 'Formato no soportado' });
        }

        // 10) Subir a Supabase Storage
        const nombreArchivo = generarNombreArchivo(usuarioId, extension);

        let subida;
        try {
            subida = await supabaseAdmin.storage
                .from(destino)
                .upload(nombreArchivo, req.file.buffer, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: req.file.mimetype
                });
        } catch (upErr) {
            console.error('❌ [media/upload] Error subiendo:', upErr.message || upErr);
            logSubida(req, destino, 'error_subida');
            return res.status(500).json({ ok: false, error: 'Error al guardar el archivo' });
        }

        if (subida.error) {
            console.error('❌ [media/upload] Error Supabase:', subida.error.message || subida.error);
            logSubida(req, destino, 'error_supabase');
            return res.status(500).json({ ok: false, error: 'Error al guardar el archivo' });
        }

        // 11) Obtener URL pública
        const { data: urlData } = supabaseAdmin.storage
            .from(destino)
            .getPublicUrl(nombreArchivo);

        const url = urlData && urlData.publicUrl;

        if (!url) {
            logSubida(req, destino, 'sin_url_publica');
            return res.status(500).json({ ok: false, error: 'Error generando URL' });
        }

        logSubida(req, destino, 'ok');

        return res.status(200).json({
            ok: true,
            url,
            path: nombreArchivo
        });
    }
);

// ================================================================
// MANEJO DE ERRORES DE MULTER (límite superado, etc.)
// ================================================================

router.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ ok: false, error: 'Archivo demasiado grande' });
    }
    if (err) {
        console.error('❌ [media] Error en multer:', err.message || err);
        return res.status(500).json({ ok: false, error: 'Error procesando archivo' });
    }
    return next();
});

// ================================================================
// EXPORT
// ================================================================

module.exports = router;