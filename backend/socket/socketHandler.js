// backend/socket/socketHandler.js
const User = require('../models/User');
const Message = require('../models/Message');
const Post = require('../models/Post');

module.exports = (io) => {

    io.on('connection', (socket) => {
        console.log(`🔌 Nuevo usuario conectado: ${socket.id}`);

        // ========================================
        // AUTENTICACIÓN
        // ========================================
        socket.on('authenticate', async (data) => {
            try {
                const { userId } = data;
                socket.userId = userId;

                // Actualizar estado del usuario
                await User.findByIdAndUpdate(userId, {
                    estado: 'conectado',
                    ultimaConexion: new Date()
                });

                // Unirse a su sala personal
                socket.join(`user_${userId}`);

                console.log(`✅ Usuario ${userId} autenticado`);

                // Notificar a contactos que está en línea
                const user = await User.findById(userId).populate('contactos');
                if (user && user.contactos) {
                    user.contactos.forEach(contacto => {
                        io.to(`user_${contacto._id}`).emit('user_online', { 
                            userId: userId,
                            nombre: user.nombre 
                        });
                    });
                }

            } catch (error) {
                console.error('Error en autenticación:', error);
            }
        });

        // ========================================
        // MENSAJERÍA
        // ========================================

        // Enviar mensaje
        socket.on('send_message', async (data) => {
            try {
                const { para, tipo, contenido, archivo } = data;
                const de = socket.userId;

                // Verificar que el usuario no esté bloqueado
                const user = await User.findById(de);
                if (user.bloqueados && user.bloqueados.includes(para)) {
                    socket.emit('message_error', { error: 'Usuario bloqueado' });
                    return;
                }

                // Guardar mensaje en DB
                const nuevoMensaje = new Message({
                    de,
                    para,
                    tipo: tipo || 'texto',
                    contenido: contenido || '',
                    archivo: archivo || null
                });
                await nuevoMensaje.save();

                // Poblar para respuesta
                await nuevoMensaje.populate('de', 'nombre fotoPerfil walletAddress');

                // Enviar al receptor si está conectado
                const receptor = await User.findById(para);
                if (receptor && receptor.estado === 'conectado') {
                    io.to(`user_${para}`).emit('new_message', {
                        mensaje: nuevoMensaje,
                        de: de
                    });
                    // Marcar como entregado
                    nuevoMensaje.entregado = true;
                    nuevoMensaje.fechaEntrega = new Date();
                    await nuevoMensaje.save();
                }

                // Confirmar al emisor
                socket.emit('message_sent', {
                    success: true,
                    mensajeId: nuevoMensaje._id
                });

            } catch (error) {
                console.error('Error enviando mensaje:', error);
                socket.emit('message_error', { error: 'Error al enviar mensaje' });
            }
        });

        // Marcar mensaje como leído
        socket.on('message_read', async (data) => {
            try {
                const { messageId } = data;
                await Message.findByIdAndUpdate(messageId, {
                    leido: true,
                    fechaLeido: new Date()
                });
            } catch (error) {
                console.error('Error marcando como leído:', error);
            }
        });

        // Marcar todos los mensajes como leídos (conversación)
        socket.on('mark_conversation_read', async (data) => {
            try {
                const { contactoId } = data;
                const userId = socket.userId;

                await Message.updateMany(
                    {
                        de: contactoId,
                        para: userId,
                        leido: false
                    },
                    {
                        leido: true,
                        fechaLeido: new Date()
                    }
                );
            } catch (error) {
                console.error('Error marcando conversación como leída:', error);
            }
        });

        // ========================================
        // MURO - PUBLICACIONES
        // ========================================

        // Nueva publicación
        socket.on('new_post', async (data) => {
            try {
                const { tipo, contenido, imagen, video, precioToken, cantidadTokens } = data;
                const userId = socket.userId;

                const nuevoPost = new Post({
                    autor: userId,
                    tipo: tipo || 'texto',
                    contenido: contenido || '',
                    imagen: imagen || null,
                    video: video || null,
                    precioToken: precioToken || 0,
                    cantidadTokens: cantidadTokens || 0
                });
                await nuevoPost.save();

                // Poblar autor
                await nuevoPost.populate('autor', 'nombre fotoPerfil walletAddress');

                // Notificar a contactos
                const user = await User.findById(userId).populate('contactos');
                if (user && user.contactos) {
                    user.contactos.forEach(contacto => {
                        io.to(`user_${contacto._id}`).emit('new_post', {
                            post: nuevoPost,
                            autor: {
                                _id: userId,
                                nombre: user.nombre,
                                fotoPerfil: user.fotoPerfil
                            }
                        });
                    });
                }

                socket.emit('post_created', { success: true, postId: nuevoPost._id });

            } catch (error) {
                console.error('Error publicando:', error);
                socket.emit('post_error', { error: 'Error al publicar' });
            }
        });

        // Reacción a publicación
        socket.on('react_post', async (data) => {
            try {
                const { postId, reaccion } = data;
                const userId = socket.userId;

                const post = await Post.findById(postId);
                if (!post) return;

                await post.agregarReaccion(userId, reaccion);

                // Emitir actualización a todos los que siguen el post
                io.emit('post_updated', {
                    postId: post._id,
                    reacciones: post.reacciones,
                    total: post.totalReacciones()
                });

            } catch (error) {
                console.error('Error reaccionando:', error);
            }
        });

        // ========================================
        // USUARIOS - ESTADO
        // ========================================

        // Usuario escribiendo
        socket.on('typing', async (data) => {
            try {
                const { para } = data;
                const userId = socket.userId;
                io.to(`user_${para}`).emit('user_typing', {
                    de: userId,
                    nombre: await User.findById(userId).select('nombre')
                });
            } catch (error) {
                console.error('Error en typing:', error);
            }
        });

        // Usuario dejó de escribir
        socket.on('stop_typing', async (data) => {
            try {
                const { para } = data;
                io.to(`user_${para}`).emit('user_stop_typing', {
                    de: socket.userId
                });
            } catch (error) {
                console.error('Error en stop typing:', error);
            }
        });

        // ========================================
        // DESCONEXIÓN
        // ========================================

        socket.on('disconnect', async () => {
            console.log(`🔌 Usuario desconectado: ${socket.id}`);

            if (socket.userId) {
                try {
                    await User.findByIdAndUpdate(socket.userId, {
                        estado: 'ausente',
                        ultimaConexion: new Date()
                    });

                    // Notificar a contactos
                    const user = await User.findById(socket.userId).populate('contactos');
                    if (user && user.contactos) {
                        user.contactos.forEach(contacto => {
                            io.to(`user_${contacto._id}`).emit('user_offline', {
                                userId: socket.userId,
                                nombre: user.nombre
                            });
                        });
                    }
                } catch (error) {
                    console.error('Error en desconexión:', error);
                }
            }
        });

    });

};