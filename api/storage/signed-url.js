// /api/storage/signed-url.js
// ================================================================
// ENDPOINT PARA GENERAR URLs FIRMADAS DE SUPABASE STORAGE
// ================================================================
// Este endpoint recibe un bucket y filePath, y devuelve una URL
// firmada con expiración de 1 hora (3600 segundos).
// ================================================================

import { createClient } from '@supabase/supabase-js'

// ================================================================
// CONFIGURACIÓN
// ================================================================

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Crear cliente con SERVICE_ROLE_KEY (tiene permisos completos)
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Buckets permitidos (por seguridad)
const ALLOWED_BUCKETS = ['chat-attachments', 'chat-audio']

// ================================================================
// HANDLER PRINCIPAL
// ================================================================

export default async function handler(req, res) {
    // 1. VERIFICAR MÉTODO
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Método no permitido. Usa POST.'
        })
    }

    try {
        // 2. OBTENER DATOS DEL BODY
        const { bucket, filePath, expiresIn = 3600 } = req.body

        // 3. VALIDAR PARÁMETROS
        if (!bucket) {
            return res.status(400).json({
                success: false,
                error: 'Falta el parámetro "bucket"'
            })
        }

        if (!filePath) {
            return res.status(400).json({
                success: false,
                error: 'Falta el parámetro "filePath"'
            })
        }

        // 4. VALIDAR BUCKET PERMITIDO (seguridad)
        if (!ALLOWED_BUCKETS.includes(bucket)) {
            return res.status(400).json({
                success: false,
                error: `Bucket no permitido. Usa: ${ALLOWED_BUCKETS.join(', ')}`
            })
        }

        // 5. VALIDAR EXPIRACIÓN (máximo 7 días)
        if (expiresIn > 604800) {
            return res.status(400).json({
                success: false,
                error: 'La expiración no puede superar los 7 días (604800 segundos)'
            })
        }

        // 6. GENERAR URL FIRMADA
        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(filePath, expiresIn)

        // 7. MANEJAR ERRORES
        if (error) {
            console.error('Error generando URL firmada:', error)
            return res.status(500).json({
                success: false,
                error: 'Error al generar URL firmada: ' + error.message
            })
        }

        // 8. DEVOLVER URL FIRMADA
        return res.status(200).json({
            success: true,
            signedUrl: data.signedUrl,
            expiresIn: expiresIn,
            bucket: bucket,
            filePath: filePath
        })

    } catch (error) {
        // 9. ERROR INESPERADO
        console.error('Error en el endpoint /api/storage/signed-url:', error)
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor: ' + error.message
        })
    }
}

// ================================================================
// CONFIGURACIÓN PARA NEXT.JS (opcional)
// ================================================================

// Deshabilitar bodyParser por defecto (no necesario para JSON)
export const config = {
    api: {
        bodyParser: true,
    },
}