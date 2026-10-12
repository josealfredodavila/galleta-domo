// ================================================================
// MIDDLEWARE/AUTH.JS — Csariel's Backend
// verificarToken: valida el JWT con Supabase.
// verificarRol:   autoriza por app_metadata.role (solo lo escribe el servidor).
//                 NUNCA user_metadata: el usuario puede cambiarlo.
// ================================================================

const { supabase, supabaseAdmin } = require('../config/supabase');
const logger = require('../utils/logger');

async function verificarToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Token no proporcionado' });
        }

        const token = authHeader.slice(7).trim();
        if (!token) {
            return res.status(401).json({ success: false, error: 'Token vacío' });
        }

        const cliente = supabaseAdmin || supabase;
        if (!cliente) {
            logger.error('[Auth] Cliente de Supabase no configurado');
            return res.status(500).json({ success: false, error: 'Auth no configurado' });
        }

        const { data, error } = await cliente.auth.getUser(token);
        if (error || !data?.user) {
            logger.warn(`Token inválido: ${error?.message || 'usuario no encontrado'}`);
            return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
        }

        req.usuario = data.user;
        req.usuarioId = data.user.id;
        return next();
    } catch (e) {
        logger.error(`Error verificando token: ${e.message}`);
        return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }
}

function verificarRol(rolesPermitidos = []) {
    return (req, res, next) => {
        try {
            if (!req.usuario) {
                return res.status(401).json({ success: false, error: 'No autenticado' });
            }
            if (!Array.isArray(rolesPermitidos)) {
                return res.status(500).json({ success: false, error: 'Configuración de roles inválida' });
            }

            const rol = req.usuario.app_metadata?.role || 'user';

            if (rolesPermitidos.length === 0 || !rolesPermitidos.includes(rol)) {
                logger.warn(`Acceso denegado por rol. Usuario: ${req.usuario.id}, rol: ${rol}`);
                return res.status(403).json({ success: false, error: 'No tienes permisos para esta acción' });
            }
            return next();
        } catch (e) {
            logger.error(`Error verificando rol: ${e.message}`);
            return res.status(500).json({ success: false, error: 'Error verificando permisos' });
        }
    };
}

module.exports = { verificarToken, verificarRol };