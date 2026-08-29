// ================================================================
// MIDDLEWARE/AUTH.JS
// AUTENTICACIÓN - SARIEL'S BACKEND
// ================================================================

const {
    supabase
} = require('../config/supabase');

const logger = require('../utils/logger');

// ================================================================
// VERIFICAR TOKEN SUPABASE
// ================================================================

async function verificarToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        // --------------------------------------------------------
        // COMPROBAR HEADER
        // --------------------------------------------------------

        if (
            !authHeader ||
            !authHeader.startsWith('Bearer ')
        ) {
            return res.status(401).json({
                success: false,
                error: 'Token no proporcionado'
            });
        }

        const token =
            authHeader.substring(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token vacío'
            });
        }

        // --------------------------------------------------------
        // VALIDAR TOKEN CON SUPABASE
        // --------------------------------------------------------

        const {
            data,
            error
        } = await supabase.auth.getUser(token);

        if (error || !data?.user) {
            logger.warn(
                `Token Supabase inválido: ${
                    error?.message || 'usuario no encontrado'
                }`
            );

            return res.status(401).json({
                success: false,
                error: 'Token inválido o expirado'
            });
        }

        // --------------------------------------------------------
        // USUARIO AUTENTICADO
        // --------------------------------------------------------

        req.usuario = data.user;

        // También dejamos disponible el ID directamente.
        req.usuarioId = data.user.id;

        return next();

    } catch (error) {

        logger.error(
            `Error verificando token: ${error.message}`
        );

        return res.status(401).json({
            success: false,
            error: 'Token inválido o expirado'
        });
    }
}

// ================================================================
// VERIFICAR ROL
// ================================================================

function verificarRol(rolesPermitidos = []) {

    return (req, res, next) => {

        try {

            if (!req.usuario) {
                return res.status(401).json({
                    success: false,
                    error: 'No autenticado'
                });
            }

            if (!Array.isArray(rolesPermitidos)) {
                return res.status(500).json({
                    success: false,
                    error: 'Configuración de roles inválida'
                });
            }

            // ----------------------------------------------------
            // OBTENER ROL
            // ----------------------------------------------------

            const userRole =
                req.usuario.user_metadata?.role ||
                'user';

            // ----------------------------------------------------
            // COMPROBAR PERMISO
            // ----------------------------------------------------

            if (
                rolesPermitidos.length === 0 ||
                !rolesPermitidos.includes(userRole)
            ) {
                logger.warn(
                    `Acceso denegado por rol. Usuario: ${
                        req.usuario.id
                    }, rol: ${userRole}`
                );

                return res.status(403).json({
                    success: false,
                    error: 'No tienes permisos para esta acción'
                });
            }

            return next();

        } catch (error) {

            logger.error(
                `Error verificando rol: ${error.message}`
            );

            return res.status(500).json({
                success: false,
                error: 'Error verificando permisos'
            });
        }
    };
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    verificarToken,
    verificarRol
};