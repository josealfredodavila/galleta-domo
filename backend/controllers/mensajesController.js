// ================================================================
// MENSAJES CONTROLLER - SARIEL'S WEB3
// VERSIÓN COMPLETA CON RPC Y ESQUEMA REAL DE SUPABASE
// ================================================================

const { supabaseAdmin } = require('../config/supabase');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ================================================================
// OBTENER CONVERSACIONES
// ================================================================
exports.obtenerConversaciones = async (req, res) => {
    try {
        const userId = req.usuario.id;

        // Obtener IDs de conversaciones donde participa el usuario
        const { data: participaciones, error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (partError) throw partError;

        if (!participaciones || participaciones.length === 0) {
            return res.json({ success: true, conversaciones: [] });
        }

        const convIds = participaciones.map(p => p.conversation_id);

        // Obtener conversaciones con participantes
        const { data: conversaciones, error: convError } = await supabaseAdmin
            .from('conversations')
            .select(`
                id,
                created_at,
                updated_at,
                conversation_participants (
                    user_id,
                    users (id, username, avatar_url)
                )
            `)
            .in('id', convIds)
            .order('updated_at', { ascending: false });

        if (convError) throw convError;

        // Obtener último mensaje de cada conversación
        const conversacionesConUltimo = await Promise.all(conversaciones.map(async (conv) => {
            const { data: ultimoMsg, error: msgError } = await supabaseAdmin
                .from('messages')
                .select('id, content, sender_id, created_at, media_url, is_read')
                .eq('conversation_id', conv.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
                .limit(1);

            if (msgError) throw msgError;

            const otrosParticipantes = conv.conversation_participants
                .filter(p => p.user_id !== userId)
                .map(p => p.users || { username: 'Usuario', avatar_url: null });

            return {
                id: conv.id,
                created_at: conv.created_at,
                updated_at: conv.updated_at,
                otros_participantes: otrosParticipantes,
                ultimo_mensaje: ultimoMsg?.[0] || null
            };
        }));

        res.json({ success: true, conversaciones: conversacionesConUltimo });
    } catch (error) {
        console.error('❌ Error en obtenerConversaciones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// OBTENER MENSAJES
// ================================================================
exports.obtenerMensajes = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { conversationId } = req.params;
        const { limit = 50, since } = req.query;

        // Verificar que el usuario pertenece a la conversación usando RPC
        const { data: esMiembro, error: memberError } = await supabaseAdmin
            .rpc('is_conversation_member', {
                p_conversation_id: conversationId,
                p_user_id: userId
            });

        if (memberError) throw memberError;

        if (!esMiembro) {
            return res.status(403).json({ success: false, error: 'No tienes acceso a esta conversación' });
        }

        let query = supabaseAdmin
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true })
            .limit(parseInt(limit));

        if (since) {
            query = query.gt('created_at', since);
        }

        const { data: mensajes, error: msgError } = await query;

        if (msgError) throw msgError;

        res.json({
            success: true,
            mensajes: mensajes || [],
            usuario_id: userId
        });
    } catch (error) {
        console.error('❌ Error en obtenerMensajes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// ENVIAR MENSAJE
// ================================================================
exports.enviarMensaje = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { conversationId, contenido, media_url, media_type, file_name } = req.body;

        if (!conversationId) {
            return res.status(400).json({ success: false, error: 'Conversation ID requerido' });
        }

        if (!contenido && !media_url) {
            return res.status(400).json({ success: false, error: 'Mensaje o archivo requerido' });
        }

        // Verificar que el usuario pertenece a la conversación
        const { data: esMiembro, error: memberError } = await supabaseAdmin
            .rpc('is_conversation_member', {
                p_conversation_id: conversationId,
                p_user_id: userId
            });

        if (memberError) throw memberError;

        if (!esMiembro) {
            return res.status(403).json({ success: false, error: 'No tienes acceso a esta conversación' });
        }

        // Insertar mensaje
        const { data: mensaje, error: msgError } = await supabaseAdmin
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender_id: userId,
                content: contenido || null,
                media_url: media_url || null,
                tipo: media_type || 'texto',
                nombre_archivo: file_name || null,
                is_read: false,
                is_deleted: false
            })
            .select()
            .single();

        if (msgError) throw msgError;

        // Actualizar updated_at de la conversación
        await supabaseAdmin
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        res.json({
            success: true,
            mensaje: mensaje
        });
    } catch (error) {
        console.error('❌ Error en enviarMensaje:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// CREAR CONVERSACIÓN (NUEVA)
// ================================================================
exports.crearConversacion = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { targetUserId } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ success: false, error: 'Usuario destino requerido' });
        }

        if (targetUserId === userId) {
            return res.status(400).json({ success: false, error: 'No puedes chatear contigo mismo' });
        }

        // Verificar si ya existe conversación entre ambos
        const { data: existing, error: existError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (existError) throw existError;

        const convIds = existing.map(e => e.conversation_id);

        let convExistente = null;
        if (convIds.length > 0) {
            const { data: participantes, error: partError } = await supabaseAdmin
                .from('conversation_participants')
                .select('conversation_id')
                .in('conversation_id', convIds)
                .eq('user_id', targetUserId);

            if (!partError && participantes && participantes.length > 0) {
                convExistente = participantes[0].conversation_id;
            }
        }

        if (convExistente) {
            // Devolver conversación existente
            const { data: convData, error: convError } = await supabaseAdmin
                .from('conversations')
                .select('*')
                .eq('id', convExistente)
                .single();

            if (convError) throw convError;

            const { data: participantes, error: partError2 } = await supabaseAdmin
                .from('conversation_participants')
                .select('user_id, users(id, username, avatar_url)')
                .eq('conversation_id', convExistente);

            if (partError2) throw partError2;

            return res.json({
                success: true,
                conversacion: convData,
                otros_participantes: participantes
                    .filter(p => p.user_id !== userId)
                    .map(p => p.users || { username: 'Usuario', avatar_url: null })
            });
        }

        // Crear nueva conversación
        const { data: conversacion, error: convError } = await supabaseAdmin
            .from('conversations')
            .insert({})
            .select()
            .single();

        if (convError) throw convError;

        // Agregar participantes
        const { error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .insert([
                { conversation_id: conversacion.id, user_id: userId },
                { conversation_id: conversacion.id, user_id: targetUserId }
            ]);

        if (partError) throw partError;

        // Obtener datos del otro usuario
        const { data: targetUser, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, username, avatar_url')
            .eq('id', targetUserId)
            .single();

        if (userError) throw userError;

        res.json({
            success: true,
            conversacion: conversacion,
            otros_participantes: [targetUser]
        });
    } catch (error) {
        console.error('❌ Error en crearConversacion:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// SALIR DE CONVERSACIÓN
// ================================================================
exports.salirConversacion = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { conversationId } = req.params;

        const { error } = await supabaseAdmin
            .from('conversation_participants')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error en salirConversacion:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// BUSCAR USUARIOS
// ================================================================
exports.buscarUsuarios = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { query } = req.query;

        if (!query || query.length < 2) {
            return res.json({ success: true, usuarios: [] });
        }

        const { data: usuarios, error } = await supabaseAdmin
            .from('users')
            .select('id, username, avatar_url')
            .neq('id', userId)
            .ilike('username', `%${query}%`)
            .limit(20);

        if (error) throw error;

        res.json({ success: true, usuarios: usuarios || [] });
    } catch (error) {
        console.error('❌ Error en buscarUsuarios:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// SUBIR ARCHIVO
// ================================================================
exports.subirArchivo = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, error: 'No se recibió archivo' });
        }

        // Validar tamaño (50MB)
        if (file.size > 50 * 1024 * 1024) {
            return res.status(400).json({ success: false, error: 'Archivo excede 50MB' });
        }

        const ext = path.extname(file.originalname);
        const filename = `${uuidv4()}${ext}`;
        const folder = getFolderByMime(file.mimetype);
        const filePath = `${folder}/${filename}`;

        // Subir a Supabase Storage
        const { data, error } = await supabaseAdmin.storage
            .from('chat-files')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // Obtener URL pública
        const { data: publicUrl } = supabaseAdmin.storage
            .from('chat-files')
            .getPublicUrl(filePath);

        const tipo = getTipoByMime(file.mimetype);

        res.json({
            success: true,
            url: publicUrl.publicUrl,
            tipo: tipo,
            nombre: file.originalname
        });
    } catch (error) {
        console.error('❌ Error en subirArchivo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

function getFolderByMime(mime) {
    if (mime.startsWith('image/')) return 'images';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'videos';
    return 'files';
}

function getTipoByMime(mime) {
    if (mime.startsWith('image/')) return 'imagen';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    return 'archivo';
}

// ================================================================
// EDITAR MENSAJE
// ================================================================
exports.editarMensaje = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { messageId } = req.params;
        const { contenido } = req.body;

        if (!contenido || contenido.trim() === '') {
            return res.status(400).json({ success: false, error: 'Contenido requerido' });
        }

        // Verificar que el mensaje existe y es del usuario
        const { data: mensaje, error: msgError } = await supabaseAdmin
            .from('messages')
            .select('*')
            .eq('id', messageId)
            .eq('sender_id', userId)
            .eq('is_deleted', false)
            .single();

        if (msgError || !mensaje) {
            return res.status(404).json({ success: false, error: 'Mensaje no encontrado o no autorizado' });
        }

        const { error } = await supabaseAdmin
            .from('messages')
            .update({
                content: contenido.trim(),
                editado: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', messageId);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error en editarMensaje:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// ELIMINAR MENSAJE (SOFT DELETE)
// ================================================================
exports.eliminarMensaje = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { messageId } = req.params;

        // Verificar que el mensaje existe y es del usuario
        const { data: mensaje, error: msgError } = await supabaseAdmin
            .from('messages')
            .select('*')
            .eq('id', messageId)
            .eq('sender_id', userId)
            .eq('is_deleted', false)
            .single();

        if (msgError || !mensaje) {
            return res.status(404).json({ success: false, error: 'Mensaje no encontrado o no autorizado' });
        }

        // Soft delete
        const { error } = await supabaseAdmin
            .from('messages')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', messageId);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error en eliminarMensaje:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// MARCAR MENSAJES COMO LEÍDOS (VERSIÓN CON RPC)
// ================================================================
exports.marcarLeidos = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { conversacionId } = req.params;

        // Obtener el otro participante
        const { data: participantes, error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversacionId);

        if (partError) throw partError;

        const otro = (participantes || []).find(p => p.user_id !== userId);
        if (!otro) {
            return res.status(404).json({ success: false, error: 'No se encontró el otro participante' });
        }

        // Usar RPC para marcar mensajes como leídos
        const { error: rpcError } = await supabaseAdmin.rpc('marcar_mensajes_leidos', {
            p_remitente_id: otro.user_id,
            p_destinatario_id: userId
        });

        if (rpcError) throw rpcError;

        res.json({ success: true, mensaje: 'Mensajes marcados como leídos' });

    } catch (error) {
        console.error('❌ Error en marcarLeidos:', error);
        res.status(500).json({ success: false, error: 'Error al marcar mensajes como leídos' });
    }
};

// ================================================================
// REPORTAR MENSAJE
// ================================================================
exports.reportarMensaje = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { id } = req.params;
        const { motivo } = req.body;

        if (!motivo || !motivo.trim()) {
            return res.status(400).json({ success: false, error: 'El motivo es requerido' });
        }

        const { error: reporteError } = await supabaseAdmin
            .from('mensajes_reportes')
            .insert({
                mensaje_id: id,
                usuario_id: userId,
                motivo: motivo.trim()
            });

        if (reporteError) throw reporteError;

        res.json({ success: true, mensaje: 'Mensaje reportado correctamente' });

    } catch (error) {
        console.error('❌ Error en reportarMensaje:', error);
        res.status(500).json({ success: false, error: 'Error al reportar mensaje' });
    }
};

// ================================================================
// BLOQUEAR USUARIO (CON RPC)
// ================================================================
exports.bloquearUsuario = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { id } = req.params;

        if (id === userId) {
            return res.status(400).json({ success: false, error: 'No puedes bloquearte a ti mismo' });
        }

        const { error } = await supabaseAdmin.rpc('bloquear_usuario', {
            p_usuario_id: userId,
            p_bloqueado_id: id
        });

        if (error) throw error;

        res.json({ success: true, mensaje: 'Usuario bloqueado' });

    } catch (error) {
        console.error('❌ Error en bloquearUsuario:', error);
        res.status(500).json({ success: false, error: 'Error al bloquear usuario' });
    }
};

// ================================================================
// DESBLOQUEAR USUARIO (CON RPC)
// ================================================================
exports.desbloquearUsuario = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { id } = req.params;

        const { error } = await supabaseAdmin.rpc('desbloquear_usuario', {
            p_usuario_id: userId,
            p_bloqueado_id: id
        });

        if (error) throw error;

        res.json({ success: true, mensaje: 'Usuario desbloqueado' });

    } catch (error) {
        console.error('❌ Error en desbloquearUsuario:', error);
        res.status(500).json({ success: false, error: 'Error al desbloquear usuario' });
    }
};

// ================================================================
// BUSCAR EN CONVERSACIÓN (CON RPC)
// ================================================================
exports.buscarEnConversacion = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { conversacionId } = req.params;
        const { q } = req.query;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Escribe algo para buscar' });
        }

        // Verificar que el usuario es miembro de la conversación usando RPC
        const { data: esMiembro, error: memberError } = await supabaseAdmin
            .rpc('is_conversation_member', {
                p_conversation_id: conversacionId,
                p_user_id: userId
            });

        if (memberError) throw memberError;

        if (!esMiembro) {
            return res.status(403).json({ success: false, error: 'No tienes acceso a esta conversación' });
        }

        // Buscar mensajes que coincidan con la query
        const { data: mensajes, error: msgError } = await supabaseAdmin
            .from('messages')
            .select('*')
            .eq('conversation_id', conversacionId)
            .eq('is_deleted', false)
            .ilike('content', `%${q.trim()}%`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (msgError) throw msgError;

        res.json({ 
            success: true, 
            mensajes: mensajes || [], 
            usuario_id: userId,
            total: mensajes?.length || 0
        });

    } catch (error) {
        console.error('❌ Error en buscarEnConversacion:', error);
        res.status(500).json({ success: false, error: 'Error al buscar mensajes' });
    }
};

// ================================================================
// CREAR LLAMADA
// ================================================================
exports.crearLlamada = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { conversationId, tipo, roomName } = req.body;

        if (!conversationId || !roomName) {
            return res.status(400).json({ success: false, error: 'conversationId y roomName son requeridos' });
        }

        // Obtener el otro participante
        const { data: participantes, error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId);

        if (partError) throw partError;

        const otro = (participantes || []).find(p => p.user_id !== userId);
        if (!otro) {
            return res.status(404).json({ success: false, error: 'No se encontró el otro participante' });
        }

        const { data: llamada, error: llamadaError } = await supabaseAdmin
            .from('llamadas')
            .insert({
                conversation_id: conversationId,
                creador_id: userId,
                destinatario_id: otro.user_id,
                room_name: roomName,
                tipo: tipo || 'video',
                estado: 'ringing'
            })
            .select()
            .single();

        if (llamadaError) throw llamadaError;

        res.json({ success: true, llamada });

    } catch (error) {
        console.error('❌ Error en crearLlamada:', error);
        res.status(500).json({ success: false, error: 'Error al crear la llamada' });
    }
};

// ================================================================
// VERIFICAR LLAMADA ACTIVA
// ================================================================
exports.verificarLlamada = async (req, res) => {
    try {
        const { conversacionId } = req.params;

        const { data: llamada, error } = await supabaseAdmin
            .from('llamadas')
            .select('*')
            .eq('conversation_id', conversacionId)
            .in('estado', ['ringing', 'active'])
            .order('created_at', { ascending: false })
            .maybeSingle();

        if (error) throw error;

        res.json({ success: true, activa: Boolean(llamada), llamada: llamada || null });

    } catch (error) {
        console.error('❌ Error en verificarLlamada:', error);
        res.status(500).json({ success: false, error: 'Error al verificar la llamada' });
    }
};

// ================================================================
// ACTUALIZAR ESTADO DE LLAMADA
// ================================================================
exports.actualizarLlamada = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        if (!['ringing', 'active', 'ended', 'rejected'].includes(estado)) {
            return res.status(400).json({ success: false, error: 'Estado inválido' });
        }

        const updates = { estado };
        if (estado === 'active') updates.contestada_at = new Date().toISOString();
        if (estado === 'ended' || estado === 'rejected') {
            updates.ended_at = new Date().toISOString();
            updates.finalizada_at = new Date().toISOString();
        }

        const { data: llamada, error } = await supabaseAdmin
            .from('llamadas')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, llamada });

    } catch (error) {
        console.error('❌ Error en actualizarLlamada:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar la llamada' });
    }
};