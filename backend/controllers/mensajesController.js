// ================================================================
// CONTROLLERS/MENSAJESCONTROLLER.JS
// MENSAJERÍA - SARIEL'S BACKEND
// ================================================================

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');

// ================================================================
// UTILIDAD: OBTENER CLIENTE SUPABASE
// ================================================================

function obtenerCliente(req) {
    // Si ya tenemos un cliente en req (desde auth.js), usarlo
    if (req.supabase) {
        return req.supabase;
    }
    // Si no, usar el cliente global
    return supabase;
}

// ================================================================
// GET /api/mensajes/conversaciones
// OBTENER TODAS LAS CONVERSACIONES DEL USUARIO
// ================================================================

async function getConversaciones(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        const { data, error } = await supabaseClient
            .from('contactos')
            .select(`
                id,
                estado,
                created_at,
                contacto:contacto_id (
                    id,
                    nombre,
                    handle,
                    avatar_url,
                    online,
                    ultima_conexion
                )
            `)
            .eq('usuario_id', userId)
            .eq('estado', 'activo')
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('getConversaciones:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al obtener conversaciones'
            });
        }

        // Procesar cada conversación para obtener último mensaje y no leídos
        const conversaciones = await Promise.all((data || []).map(async (contacto) => {
            const contactoInfo = contacto.contacto || {};
            
            // Obtener último mensaje
            const { data: ultimoMensaje } = await supabaseClient
                .from('mensajes_chat')
                .select('contenido, created_at, remitente_id, leido')
                .or(`and(remitente_id.eq.${userId},destinatario_id.eq.${contactoInfo.id}),and(remitente_id.eq.${contactoInfo.id},destinatario_id.eq.${userId})`)
                .eq('eliminado', false)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            // Contar no leídos
            const { count: noLeidos } = await supabaseClient
                .from('mensajes_chat')
                .select('id', { count: 'exact' })
                .eq('remitente_id', contactoInfo.id)
                .eq('destinatario_id', userId)
                .eq('leido', false)
                .eq('eliminado', false);

            return {
                id: contactoInfo.id,
                nombre: contactoInfo.nombre || 'Usuario',
                handle: contactoInfo.handle || 'usuario',
                avatar_url: contactoInfo.avatar_url || null,
                online: contactoInfo.online || false,
                ultima_conexion: contactoInfo.ultima_conexion || null,
                ultimoMensaje: ultimoMensaje?.contenido || 'Sin mensajes',
                ultimoRemitente: ultimoMensaje?.remitente_id,
                noLeidos: noLeidos || 0,
                fecha: ultimoMensaje?.created_at
            };
        }));

        // Ordenar por fecha (más reciente primero)
        conversaciones.sort((a, b) => {
            if (!a.fecha) return 1;
            if (!b.fecha) return -1;
            return new Date(b.fecha) - new Date(a.fecha);
        });

        return res.json({
            success: true,
            conversaciones: conversaciones || []
        });

    } catch (error) {
        logger.error('getConversaciones:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// GET /api/mensajes/mensajes/:id
// OBTENER MENSAJES DE UNA CONVERSACIÓN
// ================================================================

async function getMensajes(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const conversacionId = req.params.id;
        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        if (!conversacionId) {
            return res.status(400).json({
                success: false,
                error: 'ID de conversación requerido'
            });
        }

        const { data, error } = await supabaseClient
            .from('mensajes_chat')
            .select('*')
            .or(
                `and(remitente_id.eq.${userId},destinatario_id.eq.${conversacionId}),` +
                `and(remitente_id.eq.${conversacionId},destinatario_id.eq.${userId})`
            )
            .eq('eliminado', false)
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('getMensajes:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al obtener mensajes'
            });
        }

        return res.json({
            success: true,
            mensajes: data || []
        });

    } catch (error) {
        logger.error('getMensajes:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// POST /api/mensajes/mensajes
// ENVIAR NUEVO MENSAJE
// ================================================================

async function enviarMensaje(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const {
            destinatario_id,
            contenido,
            tipo = 'texto',
            imagen_url = null
        } = req.body;

        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        // Validaciones
        if (!destinatario_id) {
            return res.status(400).json({
                success: false,
                error: 'destinatario_id es obligatorio'
            });
        }

        if (destinatario_id === userId) {
            return res.status(400).json({
                success: false,
                error: 'No puedes enviarte mensajes a ti mismo'
            });
        }

        const tiposPermitidos = ['texto', 'imagen', 'voz', 'video'];
        if (!tiposPermitidos.includes(tipo)) {
            return res.status(400).json({
                success: false,
                error: 'Tipo de mensaje inválido. Permitidos: texto, imagen, voz, video'
            });
        }

        if (tipo === 'texto' && (!contenido || !String(contenido).trim())) {
            return res.status(400).json({
                success: false,
                error: 'El contenido es obligatorio para mensajes de texto'
            });
        }

        // Verificar que el destinatario existe
        const { data: destinatario, error: destinatarioError } = await supabaseClient
            .from('usuarios')
            .select('id')
            .eq('id', destinatario_id)
            .maybeSingle();

        if (destinatarioError || !destinatario) {
            logger.warn(`Destinatario no encontrado: ${destinatario_id}`);
            return res.status(404).json({
                success: false,
                error: 'El destinatario no existe'
            });
        }

        // Verificar bloqueo (el destinatario bloqueó al remitente)
        const { data: bloqueo, error: bloqueoError } = await supabaseClient
            .from('bloqueos')
            .select('id')
            .eq('usuario_id', destinatario_id)
            .eq('bloqueado_id', userId)
            .maybeSingle();

        if (bloqueoError) {
            logger.error('enviarMensaje bloqueo:', bloqueoError);
            return res.status(500).json({
                success: false,
                error: 'No se pudo comprobar el bloqueo'
            });
        }

        if (bloqueo) {
            logger.warn(`Usuario ${userId} bloqueado por ${destinatario_id}`);
            return res.status(403).json({
                success: false,
                error: 'No puedes enviar mensajes a este usuario'
            });
        }

        // Insertar mensaje
        const { data, error } = await supabaseClient
            .from('mensajes_chat')
            .insert({
                remitente_id: userId,
                destinatario_id,
                contenido: contenido || null,
                tipo,
                imagen_url: imagen_url || null,
                leido: false,
                editado: false,
                eliminado: false
            })
            .select('*')
            .single();

        if (error) {
            logger.error('enviarMensaje:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al enviar mensaje'
            });
        }

        logger.info(`Mensaje enviado de ${userId} a ${destinatario_id}`);

        return res.status(201).json({
            success: true,
            mensaje: data
        });

    } catch (error) {
        logger.error('enviarMensaje:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// PUT /api/mensajes/mensajes/:id
// EDITAR MENSAJE EXISTENTE
// ================================================================

async function editarMensaje(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const id = req.params.id;
        const { contenido } = req.body;
        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        if (!contenido || !String(contenido).trim()) {
            return res.status(400).json({
                success: false,
                error: 'El contenido es obligatorio'
            });
        }

        const { data, error } = await supabaseClient
            .from('mensajes_chat')
            .update({
                contenido: String(contenido).trim(),
                editado: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('remitente_id', userId)
            .eq('eliminado', false)
            .select('*')
            .maybeSingle();

        if (error) {
            logger.error('editarMensaje:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al editar mensaje'
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: 'Mensaje no encontrado o no tienes permiso para editarlo'
            });
        }

        logger.info(`Mensaje ${id} editado por ${userId}`);

        return res.json({
            success: true,
            mensaje: data
        });

    } catch (error) {
        logger.error('editarMensaje:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// DELETE /api/mensajes/mensajes/:id
// ELIMINAR MENSAJE (SOFT DELETE)
// ================================================================

async function eliminarMensaje(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const id = req.params.id;
        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        const { data, error } = await supabaseClient
            .from('mensajes_chat')
            .update({
                eliminado: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('remitente_id', userId)
            .eq('eliminado', false)
            .select('id')
            .maybeSingle();

        if (error) {
            logger.error('eliminarMensaje:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al eliminar mensaje'
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: 'Mensaje no encontrado o no tienes permiso para eliminarlo'
            });
        }

        logger.info(`Mensaje ${id} eliminado por ${userId}`);

        return res.json({
            success: true,
            mensaje: 'Mensaje eliminado correctamente'
        });

    } catch (error) {
        logger.error('eliminarMensaje:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// PATCH /api/mensajes/mensajes/leer
// MARCAR MENSAJES COMO LEÍDOS
// ================================================================

async function marcarLeidos(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const { remitente_id } = req.body;
        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        if (!remitente_id) {
            return res.status(400).json({
                success: false,
                error: 'remitente_id es obligatorio'
            });
        }

        const { error } = await supabaseClient
            .from('mensajes_chat')
            .update({
                leido: true,
                updated_at: new Date().toISOString()
            })
            .eq('remitente_id', remitente_id)
            .eq('destinatario_id', userId)
            .eq('leido', false)
            .eq('eliminado', false);

        if (error) {
            logger.error('marcarLeidos:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al marcar mensajes como leídos'
            });
        }

        return res.json({
            success: true,
            mensaje: 'Mensajes marcados como leídos'
        });

    } catch (error) {
        logger.error('marcarLeidos:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// POST /api/mensajes/contactos
// AGREGAR NUEVO CONTACTO
// ================================================================

async function agregarContacto(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const { contacto_id } = req.body;
        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        if (!contacto_id) {
            return res.status(400).json({
                success: false,
                error: 'contacto_id es obligatorio'
            });
        }

        if (contacto_id === userId) {
            return res.status(400).json({
                success: false,
                error: 'No puedes agregarte a ti mismo'
            });
        }

        // Verificar que el usuario existe
        const { data: usuario, error: usuarioError } = await supabaseClient
            .from('usuarios')
            .select('id')
            .eq('id', contacto_id)
            .maybeSingle();

        if (usuarioError || !usuario) {
            return res.status(404).json({
                success: false,
                error: 'El usuario no existe'
            });
        }

        // Verificar si ya es contacto
        const { data: existente, error: existenteError } = await supabaseClient
            .from('contactos')
            .select('id')
            .eq('usuario_id', userId)
            .eq('contacto_id', contacto_id)
            .maybeSingle();

        if (existenteError) {
            logger.error('agregarContacto existente:', existenteError);
            return res.status(500).json({
                success: false,
                error: 'Error al comprobar contacto'
            });
        }

        if (existente) {
            return res.status(409).json({
                success: false,
                error: 'El contacto ya existe'
            });
        }

        const { data, error } = await supabaseClient
            .from('contactos')
            .insert({
                usuario_id: userId,
                contacto_id,
                estado: 'activo'
            })
            .select('*')
            .single();

        if (error) {
            logger.error('agregarContacto:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al agregar contacto'
            });
        }

        logger.info(`Contacto agregado: ${userId} -> ${contacto_id}`);

        return res.status(201).json({
            success: true,
            contacto: data
        });

    } catch (error) {
        logger.error('agregarContacto:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// DELETE /api/mensajes/contactos/:id
// ELIMINAR CONTACTO
// ================================================================

async function eliminarContacto(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const contactoId = req.params.id;
        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        const { error } = await supabaseClient
            .from('contactos')
            .delete()
            .eq('usuario_id', userId)
            .eq('contacto_id', contactoId);

        if (error) {
            logger.error('eliminarContacto:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al eliminar contacto'
            });
        }

        logger.info(`Contacto eliminado: ${userId} -> ${contactoId}`);

        return res.json({
            success: true,
            mensaje: 'Contacto eliminado correctamente'
        });

    } catch (error) {
        logger.error('eliminarContacto:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// POST /api/mensajes/bloquear/:id
// BLOQUEAR USUARIO
// ================================================================

async function bloquearUsuario(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const bloqueadoId = req.params.id;
        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        if (bloqueadoId === userId) {
            return res.status(400).json({
                success: false,
                error: 'No puedes bloquearte a ti mismo'
            });
        }

        // Verificar que el usuario existe
        const { data: usuario, error: usuarioError } = await supabaseClient
            .from('usuarios')
            .select('id')
            .eq('id', bloqueadoId)
            .maybeSingle();

        if (usuarioError || !usuario) {
            return res.status(404).json({
                success: false,
                error: 'El usuario no existe'
            });
        }

        // Verificar si ya está bloqueado
        const { data: bloqueoExistente, error: bloqueoError } = await supabaseClient
            .from('bloqueos')
            .select('id')
            .eq('usuario_id', userId)
            .eq('bloqueado_id', bloqueadoId)
            .maybeSingle();

        if (bloqueoError) {
            logger.error('bloquearUsuario comprobar:', bloqueoError);
            return res.status(500).json({
                success: false,
                error: 'Error al comprobar bloqueo'
            });
        }

        if (!bloqueoExistente) {
            const { error: insertarError } = await supabaseClient
                .from('bloqueos')
                .insert({
                    usuario_id: userId,
                    bloqueado_id: bloqueadoId
                });

            if (insertarError) {
                logger.error('bloquearUsuario insertar:', insertarError);
                return res.status(500).json({
                    success: false,
                    error: 'Error al bloquear usuario'
                });
            }
        }

        // Eliminar contacto si existe (en ambas direcciones)
        const { error: eliminarContactoError } = await supabaseClient
            .from('contactos')
            .delete()
            .or(
                `and(usuario_id.eq.${userId},contacto_id.eq.${bloqueadoId}),` +
                `and(usuario_id.eq.${bloqueadoId},contacto_id.eq.${userId})`
            );

        if (eliminarContactoError) {
            logger.error('bloquearUsuario eliminar contacto:', eliminarContactoError);
        }

        logger.info(`Usuario bloqueado: ${userId} bloqueó a ${bloqueadoId}`);

        return res.json({
            success: true,
            mensaje: 'Usuario bloqueado correctamente'
        });

    } catch (error) {
        logger.error('bloquearUsuario:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// POST /api/mensajes/reportar/:id
// REPORTAR MENSAJE
// ================================================================

async function reportarMensaje(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const mensajeId = req.params.id;
        const { motivo } = req.body;
        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        if (!motivo || !String(motivo).trim()) {
            return res.status(400).json({
                success: false,
                error: 'El motivo es obligatorio'
            });
        }

        if (String(motivo).trim().length < 3) {
            return res.status(400).json({
                success: false,
                error: 'El motivo debe tener al menos 3 caracteres'
            });
        }

        // Verificar que el mensaje existe y el usuario tiene acceso
        const { data: mensaje, error: mensajeError } = await supabaseClient
            .from('mensajes_chat')
            .select('id, remitente_id, destinatario_id')
            .eq('id', mensajeId)
            .or(`remitente_id.eq.${userId},destinatario_id.eq.${userId}`)
            .eq('eliminado', false)
            .maybeSingle();

        if (mensajeError) {
            logger.error('reportarMensaje comprobar:', mensajeError);
            return res.status(500).json({
                success: false,
                error: 'Error al comprobar mensaje'
            });
        }

        if (!mensaje) {
            return res.status(404).json({
                success: false,
                error: 'Mensaje no encontrado'
            });
        }

        // Verificar si ya reportó este mensaje
        const { data: reporteExistente, error: reporteExistenteError } = await supabaseClient
            .from('mensajes_reportes')
            .select('id')
            .eq('mensaje_id', mensajeId)
            .eq('usuario_id', userId)
            .maybeSingle();

        if (reporteExistenteError) {
            logger.error('reportarMensaje existente:', reporteExistenteError);
        }

        if (reporteExistente) {
            return res.status(409).json({
                success: false,
                error: 'Ya reportaste este mensaje'
            });
        }

        const { data, error } = await supabaseClient
            .from('mensajes_reportes')
            .insert({
                mensaje_id: mensajeId,
                usuario_id: userId,
                motivo: String(motivo).trim(),
                estado: 'pendiente'
            })
            .select('*')
            .single();

        if (error) {
            logger.error('reportarMensaje:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al reportar mensaje'
            });
        }

        logger.info(`Mensaje ${mensajeId} reportado por ${userId}`);

        return res.status(201).json({
            success: true,
            reporte: data
        });

    } catch (error) {
        logger.error('reportarMensaje:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    getConversaciones,
    getMensajes,
    enviarMensaje,
    editarMensaje,
    eliminarMensaje,
    marcarLeidos,
    agregarContacto,
    eliminarContacto,
    bloquearUsuario,
    reportarMensaje
};