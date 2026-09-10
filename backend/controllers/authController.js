// ================================================================
// CONTROLADOR DE AUTENTICACIÓN
// ================================================================

const { supabase, supabaseAdmin } = require('../config/supabase');
const logger = require('../utils/logger');

class AuthController {
    // Registrar usuario
    static async register(req, res) {
        try {
            const { email, password, nombre } = req.body;

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { nombre: nombre || 'Explorador' }
                }
            });

            if (error) throw error;

            logger.info(`Usuario registrado: ${email}`);
            res.json({
                success: true,
                message: 'Usuario registrado correctamente',
                user: data.user
            });
        } catch (error) {
            logger.error(`Error en registro: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Iniciar sesión
    static async login(req, res) {
        try {
            const { email, password } = req.body;

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            logger.info(`Usuario logueado: ${email}`);
            res.json({
                success: true,
                message: 'Login exitoso',
                session: data.session
            });
        } catch (error) {
            logger.error(`Error en login: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Cerrar sesión
    static async logout(req, res) {
        try {
            const { data, error } = await supabase.auth.signOut();
            if (error) throw error;

            logger.info('Usuario cerró sesión');
            res.json({
                success: true,
                message: 'Sesión cerrada'
            });
        } catch (error) {
            logger.error(`Error en logout: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Recuperar contraseña (legado, se mantiene por compatibilidad)
    static async recoverPassword(req, res) {
        try {
            const { email } = req.body;

            const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${process.env.DOMINIO_FRONTEND}/actualizar-contrasena`
            });

            if (error) throw error;

            logger.info(`Recuperación de contraseña para: ${email}`);
            res.json({
                success: true,
                message: 'Correo de recuperación enviado'
            });
        } catch (error) {
            logger.error(`Error en recuperación: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Obtener perfil del usuario (legado, se mantiene por compatibilidad)
    static async getProfile(req, res) {
        try {
            const userId = req.usuario.id;

            const { data, error } = await supabase
                .from('usuarios')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;

            res.json({
                success: true,
                data
            });
        } catch (error) {
            logger.error(`Error obteniendo perfil: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // ============================================================
    // MÉTODOS NUEVOS — antes no existían y causaban el crash
    // ============================================================

    // GET /api/auth/me
    static async getMe(req, res) {
        try {
            const userId = req.usuarioId || req.usuario.id;

            const { data, error } = await supabase
                .from('usuarios')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;

            res.json({
                success: true,
                data
            });
        } catch (error) {
            logger.error(`Error obteniendo usuario autenticado: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // PUT /api/auth/me
    static async updateMe(req, res) {
        try {
            const userId = req.usuarioId || req.usuario.id;

            // Whitelist de campos editables: nunca aceptar columnas arbitrarias del body
            const camposPermitidos = ['nombre', 'handle', 'bio', 'avatar_url'];
            const actualizaciones = {};

            for (const campo of camposPermitidos) {
                if (req.body[campo] !== undefined) {
                    actualizaciones[campo] = req.body[campo];
                }
            }

            if (Object.keys(actualizaciones).length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No hay campos válidos para actualizar'
                });
            }

            const { data, error } = await supabase
                .from('usuarios')
                .update(actualizaciones)
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            logger.info(`Perfil actualizado: ${userId}`);
            res.json({
                success: true,
                message: 'Perfil actualizado correctamente',
                data
            });
        } catch (error) {
            logger.error(`Error actualizando perfil: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // POST /api/auth/change-password
    // Requiere supabaseAdmin (cliente con SERVICE_ROLE) para updateUserById
    static async changePassword(req, res) {
        try {
            const { passwordActual, passwordNueva } = req.body;

            if (!passwordNueva || passwordNueva.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'La nueva contraseña debe tener al menos 6 caracteres'
                });
            }

            const userId = req.usuarioId || req.usuario.id;

            // Si se envía la contraseña actual, la validamos antes de cambiarla
            if (passwordActual) {
                const { error: errorLogin } = await supabase.auth.signInWithPassword({
                    email: req.usuario.email,
                    password: passwordActual
                });

                if (errorLogin) {
                    return res.status(401).json({
                        success: false,
                        error: 'La contraseña actual es incorrecta'
                    });
                }
            }

            const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                password: passwordNueva
            });

            if (error) throw error;

            logger.info(`Contraseña cambiada: ${userId}`);
            res.json({
                success: true,
                message: 'Contraseña actualizada correctamente'
            });
        } catch (error) {
            logger.error(`Error cambiando contraseña: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // POST /api/auth/refresh-token
    static async refreshToken(req, res) {
        try {
            const { refresh_token } = req.body;

            if (!refresh_token) {
                return res.status(400).json({
                    success: false,
                    error: 'refresh_token requerido'
                });
            }

            const { data, error } = await supabase.auth.refreshSession({ refresh_token });

            if (error) throw error;

            res.json({
                success: true,
                session: data.session
            });
        } catch (error) {
            logger.error(`Error refrescando token: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // POST /api/auth/forgot-password
    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'Email requerido'
                });
            }

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                // Corregido: la ruta real del servidor es sin tilde/ñ
                redirectTo: `${process.env.DOMINIO_FRONTEND}/actualizar-contrasena`
            });

            if (error) throw error;

            logger.info(`Recuperación de contraseña solicitada para: ${email}`);
            res.json({
                success: true,
                message: 'Correo de recuperación enviado'
            });
        } catch (error) {
            logger.error(`Error en forgotPassword: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // POST /api/auth/reset-password
    // Requiere supabaseAdmin (cliente con SERVICE_ROLE) para updateUserById
    static async resetPassword(req, res) {
        try {
            const { access_token, passwordNueva } = req.body;

            if (!access_token || !passwordNueva) {
                return res.status(400).json({
                    success: false,
                    error: 'access_token y passwordNueva son requeridos'
                });
            }

            const { data: userData, error: errorUser } = await supabase.auth.getUser(access_token);

            if (errorUser || !userData?.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Token de recuperación inválido o expirado'
                });
            }

            const { error } = await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
                password: passwordNueva
            });

            if (error) throw error;

            logger.info(`Contraseña restablecida: ${userData.user.id}`);
            res.json({
                success: true,
                message: 'Contraseña restablecida correctamente'
            });
        } catch (error) {
            logger.error(`Error restableciendo contraseña: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = AuthController;
