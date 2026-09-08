// ================================================================
// MENSAJES CONTROLLER - SARIEL'S WEB3
// VERSIÓN CORREGIDA - ESQUEMA REAL DE SUPABASE
// ================================================================

const { supabaseAdmin } = require('../config/supabase');
const path = require('path');

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
                tipo,
                usuario_a_id,
                usuario_b_id,
                participants:conversation_participants!inner(
                    user_id,
                    usuarios(id, username, avatar_url)
                )
            `)
            .in('id', convIds)
            .order('created_at', { ascending: false });

        if (convError) throw convError;

        // Obtener último mensaje de cada conversación
        const conversacionesFormateadas = await Promise.all(conversaciones.map(async (conv) => {
            const { data: ultimoMensaje, error: msgError } = await supabaseAdmin
                .from('messages')
                .select('contenido, created_at, sender_id')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(1);

            if (msgError) console.error('Error obteniendo último mensaje:', msgError);

            const otrosParticipantes = (conv.participants || [])
                .filter(p => p.user_id !== userId)
                .map(p => p.usuarios)
                .filter(u => u !== null);

            return {
                id: conv.id,
                created_at: conv.created_at,
                tipo: conv.tipo,
                usuario_a_id: conv.usuario_a_id,
                usuario_b_id: conv.usuario_b_id,
                otros_participantes: otrosParticipantes,
                ultimo_mensaje: ultimoMensaje && ultimoMensaje.length > 0 ? ultimoMensaje[0] : null
            };
        }));

        res.json({ success: true, conversaciones: conversacionesFormateadas });

    } catch (error) {
        console.error('❌ Error en obtenerConversaciones:', error);
        res.status(500).json({ success: false, error: 'Error al obtener conversaciones' });
    }
};

// ================================================================
// OBTENER MENSAJES
// ================================================================
exports.obtenerMensajes = async (req, res) => {
    try {
        const { conversacionId } = req.params;
        const userId = req.usuario.id;

        // Verificar acceso
        const { data: participante, error: accesoError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('conversation_id', conversacionId)
            .eq('user_id', userId)
            .single();

        if (accesoError || !participante) {
            return res.status(403).json({ success: false, error: 'No tienes acceso a esta conversación' });
        }

        // Obtener mensajes
        const { data: mensajes, error: msgError } = await supabaseAdmin
            .from('messages')
            .select('*')
            .eq('conversation_id', conversacionId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        // Marcar mensajes como leídos
        const mensajesNoLeidos = mensajes.filter(m => !m.is_read && m.sender_id !== userId);
        if (mensajesNoLeidos.length > 0) {
            const idsNoLeidos = mensajesNoLeidos.map(m => m.id);
            await supabaseAdmin
                .from('messages')
                .update({ 
                    is_read: true,
                    fecha_leido: new Date().toISOString()
                })
                .in('id', idsNoLeidos);
        }

        res.json({ 
            success: true, 
            mensajes: mensajes || [],
            usuario_id: userId
        });

    } catch (error) {
        console.error('❌ Error en obtenerMensajes:', error);
        res.status(500).json({ success: false, error: 'Error al obtener mensajes' });
    }
};

// ================================================================
// ENVIAR MENSAJE
// ================================================================
exports.enviarMensaje = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { 
            conversationId, 
            contenido, 
            media_url, 
            media_type,
            file_name,
            file_size,
            mime_type,
            duracion_segundos
        } = req.body;

        if (!conversationId) {
            return res.status(400).json({ success: false, error: 'ID de conversación requerido' });
        }

        if (!contenido && !media_url) {
            return res.status(400).json({ success: false, error: 'Se requiere contenido o archivo' });
        }

        // Verificar participación
        const { data: participante, error: accesoError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (accesoError || !participante) {
            return res.status(403).json({ success: false, error: 'No tienes acceso a esta conversación' });
        }

        // Insertar mensaje - USANDO ESQUEMA REAL
        const mensajeData = {
            conversation_id: conversationId,
            sender_id: userId,
            contenido: contenido || null,
            media_url: media_url || null,
            tipo: media_type || 'texto',          // ✅ REAL: tipo
            nombre_archivo: file_name || null,    // ✅ REAL: nombre_archivo
            tamano_bytes: file_size || null,      // ✅ REAL: tamano_bytes
            mime_type: mime_type || null,         // ✅ REAL: mime_type
            duracion_segundos: duracion_segundos || null, // ✅ REAL: duracion_segundos
            is_read: false,
            is_deleted: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data: mensaje, error: msgError } = await supabaseAdmin
            .from('messages')
            .insert(mensajeData)
            .select()
            .single();

        if (msgError) throw msgError;

        res.json({ 
            success: true, 
            mensaje: mensaje,
            mensaje: 'Mensaje enviado correctamente'
        });

    } catch (error) {
        console.error('❌ Error en enviarMensaje:', error);
        res.status(500).json({ success: false, error: 'Error al enviar mensaje' });
    }
};

// ================================================================
// CREAR CONVERSACIÓN
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

        // Verificar que el usuario destino existe
        const { data: usuarioDestino, error: userError } = await supabaseAdmin
            .from('usuarios')
            .select('id, username, avatar_url')
            .eq('id', targetUserId)
            .single();

        if (userError || !usuarioDestino) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        // Verificar si ya existe conversación entre estos usuarios
        const { data: convExistente, error: existError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (!existError && convExistente && convExistente.length > 0) {
            const convIds = convExistente.map(p => p.conversation_id);
            
            const { data: participantes, error: partError } = await supabaseAdmin
                .from('conversation_participants')
                .select('conversation_id')
                .in('conversation_id', convIds)
                .eq('user_id', targetUserId);

            if (!partError && participantes && participantes.length > 0) {
                const convId = participantes[0].conversation_id;
                const { data: conversacion, error: convError } = await supabaseAdmin
                    .from('conversations')
                    .select('id, created_at, tipo, usuario_a_id, usuario_b_id')
                    .eq('id', convId)
                    .single();

                if (!convError && conversacion) {
                    return res.json({ 
                        success: true, 
                        conversacion: conversacion,
                        otros_participantes: [usuarioDestino],
                        mensaje: 'Conversación existente'
                    });
                }
            }
        }

        // Crear nueva conversación - USANDO ESQUEMA REAL
        const { data: conversacion, error: convError } = await supabaseAdmin
            .from('conversations')
            .insert({
                tipo: 'directo',              // ✅ REAL: tipo
                usuario_a_id: userId,         // ✅ REAL: usuario_a_id
                usuario_b_id: targetUserId,   // ✅ REAL: usuario_b_id
                created_at: new Date().toISOString()
            })
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

        res.json({ 
            success: true, 
            conversacion: conversacion,
            otros_participantes: [usuarioDestino],
            mensaje: 'Conversación creada correctamente'
        });

    } catch (error) {
        console.error('❌ Error en crearConversacion:', error);
        res.status(500).json({ success: false, error: 'Error al crear conversación' });
    }
};

// ================================================================
// SALIR DE CONVERSACIÓN
// ================================================================
exports.salirConversacion = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { conversacionId } = req.params;

        if (!conversacionId) {
            return res.status(400).json({ success: false, error: 'ID de conversación requerido' });
        }

        // Verificar participación
        const { data: participante, error: accesoError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('conversation_id', conversacionId)
            .eq('user_id', userId)
            .single();

        if (accesoError || !participante) {
            return res.status(403).json({ success: false, error: 'No eres participante de esta conversación' });
        }

        // Eliminar al usuario
        const { error: deleteError } = await supabaseAdmin
            .from('conversation_participants')
            .delete()
            .eq('conversation_id', conversacionId)
            .eq('user_id', userId);

        if (deleteError) throw deleteError;

        // Verificar si quedan participantes
        const { data: participantesRestantes, error: restError } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversacionId);

        if (restError) throw restError;

        // Si no quedan participantes, eliminar la conversación
        if (!participantesRestantes || participantesRestantes.length === 0) {
            await supabaseAdmin
                .from('conversations')
                .delete()
                .eq('id', conversacionId);
        }

        res.json({ success: true, mensaje: 'Has salido de la conversación' });

    } catch (error) {
        console.error('❌ Error en salirConversacion:', error);
        res.status(500).json({ success: false, error: 'Error al salir de la conversación' });
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
            .from('usuarios')
            .select('id, username, avatar_url')
            .ilike('username', `%${query}%`)
            .neq('id', userId)
            .limit(10);

        if (error) throw error;

        res.json({ success: true, usuarios: usuarios || [] });

    } catch (error) {
        console.error('❌ Error en buscarUsuarios:', error);
        res.status(500).json({ success: false, error: 'Error al buscar usuarios' });
    }
};

// ================================================================
// SUBIR ARCHIVO
// ================================================================
exports.subirArchivo = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { conversacionId } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, error: 'Archivo no proporcionado' });
        }

        if (!conversacionId) {
            return res.status(400).json({ success: false, error: 'ID de conversación requerido' });
        }

        // Verificar acceso
        const { data: participante, error: accesoError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('conversation_id', conversacionId)
            .eq('user_id', userId)
            .single();

        if (accesoError || !participante) {
            return res.status(403).json({ success: false, error: 'No tienes acceso a esta conversación' });
        }

        // Determinar bucket y carpeta
        const esAudio = file.mimetype.startsWith('audio/');
        const esImagen = file.mimetype.startsWith('image/');
        const esVideo = file.mimetype.startsWith('video/');
        
        let bucket = 'chat-attachments';
        let folder = 'media';
        
        if (esAudio) {
            bucket = 'chat-audio';
            folder = 'audios';
        } else if (esImagen) {
            bucket = 'chat-attachments';
            folder = 'imagenes';
        } else if (esVideo) {
            bucket = 'chat-attachments';
            folder = 'videos';
        }

        const fileExt = path.extname(file.originalname).toLowerCase();
        const fileName = `${folder}/${conversacionId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}${fileExt}`;

        // Subir a Supabase Storage
        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600'
            });

        if (uploadError) throw uploadError;

        // Obtener URL pública
        const { data: urlData } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(fileName);

        const publicUrl = urlData.publicUrl;

        // Determinar tipo
        let tipo = 'archivo';
        if (esImagen) tipo = 'imagen';
        else if (esAudio) tipo = 'audio';
        else if (esVideo) tipo = 'video';

        res.json({
            success: true,
            url: publicUrl,
            tipo: tipo,
            filename: file.originalname,
            size: file.size,
            mimeType: file.mimetype
        });

    } catch (error) {
        console.error('❌ Error en subirArchivo:', error);
        res.status(500).json({ success: false, error: 'Error al subir archivo' });
    }
};

// ================================================================
// EXPORTAR TODAS LAS FUNCIONES
// ================================================================

module.exports = {
    obtenerConversaciones: exports.obtenerConversaciones,
    obtenerMensajes: exports.obtenerMensajes,
    enviarMensaje: exports.enviarMensaje,
    crearConversacion: exports.crearConversacion,
    salirConversacion: exports.salirConversacion,
    buscarUsuarios: exports.buscarUsuarios,
    subirArchivo: exports.subirArchivo
};