// ================================================================
// CONTROLADOR DE AUTENTICACIÓN
// ================================================================

const { supabase } = require('../config/supabase');
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

    // Recuperar contraseña
    static async recoverPassword(req, res) {
        try {
            const { email } = req.body;

            const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${process.env.DOMINIO_FRONTEND}/actualizar-contraseña.html`
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

    // Obtener perfil del usuario
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
}

module.exports = AuthController;