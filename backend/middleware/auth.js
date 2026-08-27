// ================================================================
// MIDDLEWARE DE AUTENTICACIÓN
// ================================================================

const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');

async function verificarToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Token no proporcionado',
                success: false
            });
        }

        const token = authHeader.split(' ')[1];
        
        // Verificar con Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            throw new Error('Token inválido');
        }

        req.usuario = user;
        next();
    } catch (error) {
        logger.error(`Error verificando token: ${error.message}`);
        return res.status(401).json({
            error: 'Token inválido o expirado',
            success: false
        });
    }
}

async function verificarRol(rolesPermitidos) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                error: 'No autenticado',
                success: false
            });
        }

        const userRole = req.usuario.user_metadata?.role || 'user';
        
        if (!rolesPermitidos.includes(userRole)) {
            return res.status(403).json({
                error: 'No tienes permisos para esta acción',
                success: false
            });
        }

        next();
    };
}

module.exports = {
    verificarToken,
    verificarRol
};