// ================================================================
// routes/account.js
// Endpoints de gestión de cuenta
// ================================================================

const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// ================================================================
// CONFIGURACIÓN
// ================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let PUBLIC_APP_HOSTNAME = '';
try {
    const parsed = new URL(PUBLIC_APP_URL);
    PUBLIC_APP_HOSTNAME = parsed.hostname;
} catch (_) {}

// ================================================================
// MIDDLEWARE DE AUTENTICACIÓN
// ================================================================

async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';

        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const token = authHeader.substring(7).trim();

        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }

        const { data, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !data || !data.user) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        req.user = data.user;
        req.accessToken = token;

        next();
    } catch (error) {
        console.error('❌ Error authMiddleware (account):', error);
        return res.status(401).json({ error: 'No autenticado' });
    }
}

// ================================================================
// VERIFICAR TURNSTILE
// ================================================================

async function verificarTurnstile(token, remoteip) {
    if (!TURNSTILE_SECRET_KEY) {
        return { success: false, error: 'Turnstile no configurado' };
    }

    if (!token) {
        return { success: false, error: 'Token Turnstile requerido' };
    }

    if (!PUBLIC_APP_HOSTNAME) {
        return {
            success: false,
            error: 'Hostname de aplicación no configurado'
        };
    }

    try {
        const params = new URLSearchParams();
        params.append('secret', TURNSTILE_SECRET_KEY);
        params.append('response', token);
        if (remoteip) params.append('remoteip', remoteip);

        const response = await axios.post(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const result = response.data || {};

        if (!result.success) return result;

        if (result.hostname !== PUBLIC_APP_HOSTNAME) {
            console.warn(
                '⚠️ Turnstile hostname inesperado:',
                result.hostname
            );
            return {
                success: false,
                error: 'Hostname Turnstile no permitido'
            };
        }

        return result;
    } catch (error) {
        console.error('❌ Error Turnstile:', error.message);
        return { success: false, error: 'Error verificando Turnstile' };
    }
}

// ================================================================
// DELETE /api/account/delete
// ================================================================
// Flujo:
// 1. Verifica sesión (authMiddleware)
// 2. Valida confirmación literal "ELIMINAR"
// 3. Verifica Turnstile
// 4. Consulta el estado actual del usuario
// 5. Borra todas las publicaciones del usuario
// 6. Registra la solicitud en solicitudes_eliminacion (auditoría)
// 7. Soft delete + anonimización de 7 campos personales
// 8. Revoca todas las sesiones activas
// 9. Devuelve redirect a "/"
//
// El hard delete físico se hace 30 días después vía cron.
//
// IMPORTANTE:
// - NO se llama a supabaseAdmin.auth.admin.deleteUser() porque
//   fallaría por FKs con NO ACTION en tablas de negocio.
// - Los ES.TOKS y NFTs NO se tocan (viven en Polygon).
// - La wallet se desvincula (wallet_address = null).
// ================================================================

router.post('/delete', authMiddleware, async (req, res) => {
    try {
        const turnstileToken =
            req.body.turnstile_token || req.body.turnstileToken;

        const confirmacion = (
            req.body.confirmation || req.body.confirmacion || ''
        )
            .toString()
            .trim()
            .toUpperCase();

        if (confirmacion !== 'ELIMINAR') {
            return res.status(400).json({
                success: false,
                error: 'La confirmación no coincide. Debes escribir ELIMINAR.'
            });
        }

        const turnstile = await verificarTurnstile(turnstileToken, req.ip);

        if (!turnstile.success) {
            return res.status(400).json({
                success: false,
                error: 'Verificación de seguridad fallida.'
            });
        }

        const userId = req.user.id;
        const userEmail = req.user.email || null;

        // 1. Consultar estado del usuario
        const { data: usuario, error: usuarioError } = await supabaseAdmin
            .from('usuarios')
            .select('id, email, activo, deleted_at, handle')
            .eq('id', userId)
            .maybeSingle();

        if (usuarioError) {
            console.error('❌ Error consultando usuario:', usuarioError);
            return res.status(500).json({
                success: false,
                error: 'No se pudo verificar el estado de la cuenta.'
            });
        }

        if (!usuario) {
            return res.status(404).json({
                success: false,
                error: 'Cuenta no encontrada.'
            });
        }

        if (usuario.deleted_at) {
            return res.status(400).json({
                success: false,
                error: 'Esta cuenta ya fue eliminada previamente.'
            });
        }

        const ahora = new Date().toISOString();

        // 2. Borrar todas las publicaciones del usuario
        try {
            const { error: pubError } = await supabaseAdmin
                .from('publicaciones')
                .delete()
                .eq('usuario_id', userId);

            if (pubError) {
                console.warn(
                    '⚠️ No se pudieron borrar publicaciones:',
                    pubError.message
                );
            }
        } catch (e) {
            console.warn('⚠️ Excepción borrando publicaciones:', e.message);
        }

        try {
            const { error: muroError } = await supabaseAdmin
                .from('muro_posts')
                .delete()
                .eq('usuario_id', userId);

            if (muroError) {
                console.warn(
                    '⚠️ No se pudieron borrar muro_posts:',
                    muroError.message
                );
            }
        } catch (e) {
            console.warn('⚠️ Excepción borrando muro_posts:', e.message);
        }

        // 3. Registrar solicitud en auditoría
        const handleAnonimo =
            'deleted_' +
            userId.replace(/-/g, '').slice(0, 12) +
            '_' +
            Date.now().toString(36);

        const { error: solicitudError } = await supabaseAdmin
            .from('solicitudes_eliminacion')
            .insert({
                usuario_id: userId,
                email_confirmacion: userEmail || 'sin-email',
                motivo: null,
                ip_address: req.ip || null,
                user_agent: req.headers['user-agent'] || null,
                estado: 'procesada',
                procesado_en: ahora,
                created_at: ahora
            });

        if (solicitudError) {
            console.error('❌ Error registrando solicitud:', solicitudError);
        }

        // 4. Soft delete + anonimización
        const { error: updateError } = await supabaseAdmin
            .from('usuarios')
            .update({
                activo: false,
                deleted_at: ahora,
                email: null,
                nombre: 'Usuario eliminado',
                handle: handleAnonimo,
                bio: null,
                avatar_url: null,
                wallet_address: null,
                telefono: null,
                online: false,
                updated_at: ahora
            })
            .eq('id', userId);

        if (updateError) {
            console.error('❌ Error anonimizando usuario:', updateError);
            return res.status(500).json({
                success: false,
                error: 'No se pudo completar la eliminación. Intenta nuevamente.'
            });
        }

        // 5. Revocar todas las sesiones
        try {
            await supabaseAdmin.auth.admin.signOut(userId);
        } catch (signOutError) {
            console.warn('⚠️ No se pudo revocar sesión:', signOutError.message);
        }

        console.log(
            `🗑️ Cuenta eliminada (soft delete): ${userId} — handle original: @${usuario.handle || 'n/a'}`
        );

        return res.status(200).json({
            success: true,
            message: 'Cuenta eliminada correctamente.',
            redirect: '/',
            deleted_at: ahora
        });

    } catch (error) {
        console.error('❌ Error /api/account/delete:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno eliminando la cuenta.'
        });
    }
});

// ================================================================
// EXPORT
// ================================================================

module.exports = router;