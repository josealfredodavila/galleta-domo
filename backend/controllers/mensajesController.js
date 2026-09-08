// ================================================================
// CONTROLLERS/MENSAJESCONTROLLER.JS - SARIEL'S BACKEND (PRODUCCIÓN)
// Lógica de Mensajería adaptada al nuevo esquema unificado de Supabase
// ================================================================

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');

// ================================================================
// UTILIDAD: OBTENER CLIENTE SUPABASE
// ================================================================

function obtenerCliente(req) {
    if (req.supabase) {
        return req.supabase;
    }
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

        // 1. Obtener las conversaciones donde participa el usuario actual
        const { data: participaciones, error: partError } = await supabaseClient
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (partError) {
            logger.error('getConversaciones participaciones:', partError);
            return res.status(500).json({ success: false, error: 'Error al obtener conversaciones' });
        }

        if (!participaciones || participaciones.length === 0) {
            return res.json({ success: true, conversaciones: [] });
        }

        const convIds = participaciones.map(p => p.conversation_id);

        // 2. Obtener los detalles de esas conversaciones
        const { data: conversacionesList, error: convError } = await supabaseClient
            .from('conversations')
            .select('*')
            .in('id', convIds);

        if (convError) {
            logger.error('getConversaciones list:', convError);
            return res.status(500).json({ success: false, error: 'Error al obtener detalles de conversaciones' });
        }

        // 3. Obtener el otro participante y el último mensaje de cada conversación
        const conversaciones = await Promise.all((conversacionesList || []).map(async (conv) => {
            // Buscar el otro usuario en la misma conversación
            const { data: otroParticipante } = await supabaseClient
                .from('conversation_participants')
                .select('user_id, usuarios(id, username, handle, avatar_url, online, ultima_conexion)')
                .eq('conversation_id', conv.id)
                .neq('user_id', userId)
                .maybeSingle();

            const userInfo = otroParticipante?.usuarios || {};

            // Obtener el último mensaje de esta conversación
            const { data: ultimoMensaje } = await supabaseClient
                .from('messages')
                .select('contenido, created_at, sender_id, is_read, tipo')
                .eq('conversation_id', conv.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            // Contar mensajes no leídos en esta conversación
            const { count: noLeidos } = await supabaseClient
                .from('messages')
                .select('id', { count: 'exact' })
                .eq('conversation_id', conv.id)
                .neq('sender_id', userId)
                .eq('is_read', false)
                .eq('is_deleted', false);

            let previewTexto = 'Sin mensajes';
            if (ultimoMensaje) {
                if (ultimoMensaje.contenido) previewTexto = ultimoMensaje.contenido;
                else if (ultimoMensaje.tipo === 'imagen') previewTexto = '📷 [Imagen]';
                else if (ultimoMensaje.tipo === 'video') previewTexto = '🎥 [Video]';
                else if (ultimoMensaje.tipo === 'audio') previewTexto = '🎙️ [Nota de voz]';
                else if (ultimoMensaje.tipo === 'archivo') previewTexto = '📎 [Archivo]';
            }

            return {
                id: conv.id, // ID de la conversación
                contacto_id: userInfo.id || null,
                nombre: userInfo.username || 'Usuario',
                handle: userInfo.handle || 'usuario',
                avatar_url: userInfo.avatar_url || null,
                online: userInfo.online || false,
                ultima_conexion: userInfo.ultima_conexion || null,
                ultimoMensaje: previewTexto,
                ultimoRemitente: ultimoMensaje?.sender_id,
                noLeidos: noLeidos || 0,
                fecha: ultimoMensaje?.created_at || conv.created_at
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
            conversaciones
        });

    } catch (error) {
        logger.error('getConversaciones general:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}

// ================================================================
// GET /api/mensajes/mensajes/:id
// OBTENER MENSAJES DE UNA CONVERSACIÓN (id = conversation_id)
// ================================================================

async function getMensajes(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const conversacionId = req.params.id;
        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
        }

        if (!conversacionId) {
            return res.status(400).json({ success: false, error: 'ID de conversación requerido' });
        }

        // Verificar que el usuario pertenezca a esta conversación
        const { data: miembro, error: miembroError } = await supabaseClient
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', conversacionId)
            .eq('user_id', userId)
            .maybeSingle();

        if (miembroError || !miembro) {
            return res.status(403).json({ success: false, error: 'No tienes acceso a esta conversación' });
        }

        const { data, error } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('conversation_id', conversacionId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true });

        if (error) {
            logger.error('getMensajes:', error);
            return res.status(500).json({ success: false, error: 'Error al obtener mensajes' });
        }

        return res.json({
            success: true,
            mensajes: data || []
        });

    } catch (error) {
        logger.error('getMensajes general:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
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
            conversation_id,
            destinatario_id, // Por compatibilidad si envían destinatario directo
            contenido,
            tipo = 'texto',
            media_url = null,
            nombre_archivo = null,
            tamano_bytes = null,
            mime_type = null
        } = req.body;

        const supabaseClient = obtenerCliente(req);

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
        }

        let targetConvId = conversation_id;

        // Si no mandan conversation_id pero mandan destinatario_id, buscamos o creamos la conversación
        if (!targetConvId && destinatario_id) {
            if (destinatario_id === userId) {
                return res.status(400).json({ success: false, error: 'No puedes enviarte mensajes a ti mismo' });
            }

            // Buscar si ya existe una conversación directa entre ambos
            const { data: misConves } = await supabaseClient
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', userId);

            if (misConves && misConves.length > 0) {
                const misIds = misConves.map(m => m.conversation_id);
                const { data: convCompartida } = await supabaseClient
                    .from('conversation_participants')
                    .select('conversation_id')
                    .eq('user_id', destinatario_id)
                    .in('conversation_id', misIds)
                    .maybeSingle();

                if (convCompartida) {
                    targetConvId = convCompartida.conversation_id;
                }
            }

            // Si no existe, la creamos
            if (!targetConvId) {
                const { data: nuevaConv, error: createConvErr } = await supabaseClient
                    .from('conversations')
                    .insert({
                        usuario_a_id: userId,
                        usuario_b_id: destinatario_id,
                        tipo: 'directo'
                    })
                    .select()
                    .single();

                if (createConvErr) {
                    logger.error('Error creando conversacion:', createConvErr);
                    return res.status(500).json({ success: false, error: 'Error al iniciar conversación' });
                }

                targetConvId = nuevaConv.id;

                await supabaseClient.from('conversation_participants').insert([
                    { conversation_id: targetConvId, user_id: userId },
                    { conversation_id: targetConvId, user_id: destinatario_id }
                ]);
            }
        }

        if (!targetConvId) {
            return res.status(400).json({ success: false, error: 'conversation_id o destinatario_id es obligatorio' });
        }

        const tiposPermitidos = ['texto', 'imagen', 'video', 'audio', 'archivo'];
        if (!tiposPermitidos.includes(tipo)) {
            return res.status(400).json({ success: false, error: 'Tipo de mensaje inválido' });
        }

        if (tipo === 'texto' && (!contenido || !String(contenido).trim())) {
            return res.status(400).json({ success: false, error: 'El contenido es obligatorio para texto' });
        }

        // Insertar en la tabla unificada 'messages'
        const { data, error } = await supabaseClient
            .from('messages')
            .insert({
                conversation_id: targetConvId,
                sender_id: userId,
                contenido: contenido || null,
                tipo,
                media_url: media_url || null,
                nombre_archivo: nombre_archivo || null,
                tamano_bytes: tamano_bytes || null,
                mime_type: mime_type || null,
                is_read: false,
                is_deleted: false,
                editado: false
            })
            .select('*')
            .single();

        if (error) {
            logger.error('enviarMensaje insert:', error);
            return res.status(500).json({ success: false, error: 'Error al enviar mensaje' });
        }

        logger.info(`Mensaje enviado en conv ${targetConvId} por ${userId}`);

        return res.status(201).json({
            success: true,
            mensaje: data
        });

    } catch (error) {
        logger.error('enviarMensaje general:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
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

        if (!userId) return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
        if (!contenido) return res.status(400).json({ success: false, error: 'El contenido es obligatorio' });

        const { data, error } = await supabaseClient
            .from('messages')
            .update({
                contenido: String(contenido).trim(),
                editado: true,
                fecha_edicion: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('sender_id', userId)
            .eq('is_deleted', false)
            .select('*')
            .maybeSingle();

        if (error) {
            logger.error('editarMensaje:', error);
            return res.status(500).json({ success: false, error: 'Error al editar mensaje' });
        }

        if (!data) {
            return res.status(404).json({ success: false, error: 'Mensaje no encontrado o sin permisos' });
        }

        return res.json({ success: true, mensaje: data });
    } catch (error) {
        logger.error('editarMensaje general:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
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

        if (!userId) return res.status(401).json({ success: false, error: 'Usuario no autenticado' });

        const { data, error } = await supabaseClient
            .from('messages')
            .update({
                is_deleted: true,
                eliminado: true,
                fecha_eliminacion: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('sender_id', userId)
            .eq('is_deleted', false)
            .select('id')
            .maybeSingle();

        if (error) {
            logger.error('eliminarMensaje:', error);
            return res.status(500).json({ success: false, error: 'Error al eliminar mensaje' });
        }

        if (!data) {
            return res.status(404).json({ success: false, error: 'Mensaje no encontrado o sin permisos' });
        }

        return res.json({ success: true, mensaje: 'Mensaje eliminado correctamente' });
    } catch (error) {
        logger.error('eliminarMensaje general:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
}

// ================================================================
// PATCH /api/mensajes/mensajes/leer
// MARCAR MENSAJES COMO LEÍDOS
// ================================================================

async function marcarLeidos(req, res) {
    try {
        const userId = req.usuarioId || req.user?.id;
        const { conversation_id } = req.body;
        const supabaseClient = obtenerCliente(req);

        if (!userId) return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
        if (!conversation_id) return res.status(400).json({ success: false, error: 'conversation_id es obligatorio' });

        const { error } = await supabaseClient
            .from('messages')
            .update({
                is_read: true,
                leido: true,
                fecha_leido: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', conversation_id)
            .neq('sender_id', userId)
            .eq('is_read', false)
            .eq('is_deleted', false);

        if (error) {
            logger.error('marcarLeidos:', error);
            return res.status(500).json({ success: false, error: 'Error al marcar como leídos' });
        }

        return res.json({ success: true, mensaje: 'Mensajes marcados como leídos' });
    } catch (error) {
        logger.error('marcarLeidos general:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
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

        if (!userId) return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
        if (!motivo || !String(motivo).trim()) return res.status(400).json({ success: false, error: 'Motivo obligatorio' });

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
            return res.status(500).json({ success: false, error: 'Error al reportar mensaje' });
        }

        return res.status(201).json({ success: true, reporte: data });
    } catch (error) {
        logger.error('reportarMensaje general:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
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
    reportarMensaje
};
