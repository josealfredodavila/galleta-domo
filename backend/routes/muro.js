// backend/routes/muro.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ========================================
// MIDDLEWARE DE AUTENTICACIÓN
// ========================================
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Autenticación requerida' });
    }
};

// ========================================
// CONFIGURACIÓN DE MULTER PARA ARCHIVOS
// ========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads/muro';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `muro-${unique}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const tipos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
        if (tipos.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato no soportado'), false);
        }
    }
});

// ========================================
// RUTA: CREAR PUBLICACIÓN
// POST /api/muro
// ========================================
router.post('/', auth, upload.single('archivo'), async (req, res) => {
    try {
        const { contenido, tipo, cantidadTokens, precioToken, tipoArchivo } = req.body;
        const userId = req.user.userId;

        const postData = {
            autor: userId,
            contenido: contenido || '',
            tipo: tipo || 'texto'
        };

        // Manejar archivo subido
        if (req.file) {
            const url = `/uploads/muro/${req.file.filename}`;
            if (tipoArchivo === 'image' || req.file.mimetype.startsWith('image/')) {
                postData.imagen = url;
            } else if (tipoArchivo === 'video' || req.file.mimetype.startsWith('video/')) {
                postData.video = url;
            }
        }

        // Manejar venta de tokens
        if (tipo === 'venta' || tipo === 'token') {
            postData.tipo = 'venta';
            postData.cantidadTokens = parseInt(cantidadTokens) || 0;
            postData.precioToken = parseFloat(precioToken) || 0;
        }

        const nuevoPost = new Post(postData);
        await nuevoPost.save();

        // Poblar autor
        await nuevoPost.populate('autor', 'nombre fotoPerfil walletAddress');

        res.status(201).json({
            success: true,
            post: nuevoPost,
            message: 'Publicación creada exitosamente'
        });

    } catch (error) {
        console.error('Error creando publicación:', error);
        res.status(500).json({ error: 'Error al crear publicación' });
    }
});

// ========================================
// RUTA: OBTENER PUBLICACIONES
// GET /api/muro?page=1&limit=10&autor=yo&tipo=venta
// ========================================
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, autor, tipo } = req.query;
        const userId = req.user.userId;

        const query = { visible: true };

        // Filtrar por autor
        if (autor === 'yo') {
            query.autor = userId;
        }

        // Filtrar por tipo
        if (tipo === 'venta') {
            query.tipo = 'venta';
        }

        // Excluir publicaciones de usuarios bloqueados
        const user = await User.findById(userId);
        if (user && user.bloqueados && user.bloqueados.length > 0) {
            query.autor = { $nin: user.bloqueados };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [publicaciones, total] = await Promise.all([
            Post.find(query)
                .populate('autor', 'nombre fotoPerfil walletAddress estado')
                .populate('comentarios')
                .populate('usuariosReaccionaron.usuario', 'nombre fotoPerfil')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Post.countDocuments(query)
        ]);

        // Marcar si el usuario ya reaccionó
        const publicacionesConReaccion = publicaciones.map(post => {
            const postObj = post.toObject();
            if (postObj.usuariosReaccionaron) {
                postObj.usuariosReaccionaron = postObj.usuariosReaccionaron.map(u => ({
                    ...u,
                    esUsuarioActual: u.usuario && u.usuario._id.toString() === userId
                }));
            }
            return postObj;
        });

        res.json({
            publicaciones: publicacionesConReaccion,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error obteniendo publicaciones:', error);
        res.status(500).json({ error: 'Error al obtener publicaciones' });
    }
});

// ========================================
// RUTA: OBTENER UNA PUBLICACIÓN
// GET /api/muro/:id
// ========================================
router.get('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const post = await Post.findById(id)
            .populate('autor', 'nombre fotoPerfil walletAddress estado')
            .populate('comentarios')
            .populate('usuariosReaccionaron.usuario', 'nombre fotoPerfil');

        if (!post) {
            return res.status(404).json({ error: 'Publicación no encontrada' });
        }

        res.json(post);
    } catch (error) {
        console.error('Error obteniendo publicación:', error);
        res.status(500).json({ error: 'Error al obtener publicación' });
    }
});

// ========================================
// RUTA: REACCIONAR A UNA PUBLICACIÓN
// POST /api/muro/reaccion
// ========================================
router.post('/reaccion', auth, async (req, res) => {
    try {
        const { postId, reaccion } = req.body;
        const userId = req.user.userId;

        // Tipos de reacción válidos
        const tiposValidos = ['meGusta', 'meDivierte', 'meEncanta', 'meEntristese', 'meEnoja'];
        if (!tiposValidos.includes(reaccion)) {
            return res.status(400).json({ error: 'Tipo de reacción inválido' });
        }

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: 'Publicación no encontrada' });
        }

        // Verificar si el usuario ya reaccionó
        const indexReaccion = post.usuariosReaccionaron.findIndex(
            u => u.usuario.toString() === userId
        );

        if (indexReaccion !== -1) {
            // Quitar reacción anterior
            const reaccionAnterior = post.usuariosReaccionaron[indexReaccion].reaccion;
            if (post.reacciones[reaccionAnterior]) {
                post.reacciones[reaccionAnterior]--;
            }
            post.usuariosReaccionaron.splice(indexReaccion, 1);

            // Si no hay nueva reacción, solo quitamos
            if (!reaccion) {
                await post.save();
                return res.json({ success: true, reacciones: post.reacciones });
            }
        }

        // Agregar nueva reacción
        if (reaccion) {
            post.reacciones[reaccion] = (post.reacciones[reaccion] || 0) + 1;
            post.usuariosReaccionaron.push({
                usuario: userId,
                reaccion
            });
        }

        await post.save();

        // Emitir evento de socket
        const io = req.app.get('io');
        if (io) {
            io.emit('post_updated', {
                postId: post._id,
                reacciones: post.reacciones
            });
        }

        res.json({
            success: true,
            reacciones: post.reacciones,
            total: Object.values(post.reacciones).reduce((a, b) => a + b, 0)
        });

    } catch (error) {
        console.error('Error reaccionando:', error);
        res.status(500).json({ error: 'Error al procesar reacción' });
    }
});

// ========================================
// RUTA: COMENTAR PUBLICACIÓN
// POST /api/muro/comentario
// ========================================
router.post('/comentario', auth, async (req, res) => {
    try {
        const { postId, comentario } = req.body;
        const userId = req.user.userId;

        if (!comentario || comentario.trim().length === 0) {
            return res.status(400).json({ error: 'El comentario no puede estar vacío' });
        }

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: 'Publicación no encontrada' });
        }

        // Crear comentario (usando subdocumento o modelo separado)
        const nuevoComentario = {
            usuario: userId,
            contenido: comentario.trim(),
            fecha: new Date()
        };

        // Si usas modelo Comment, aquí lo creas
        // Por ahora lo guardamos como array en el post
        post.comentarios.push(nuevoComentario);
        post.totalComentarios = (post.totalComentarios || 0) + 1;
        await post.save();

        res.status(201).json({
            success: true,
            comentario: nuevoComentario,
            message: 'Comentario agregado'
        });

    } catch (error) {
        console.error('Error comentando:', error);
        res.status(500).json({ error: 'Error al agregar comentario' });
    }
});

// ========================================
// RUTA: ELIMINAR PUBLICACIÓN
// DELETE /api/muro/:id
// ========================================
router.delete('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const post = await Post.findById(id);
        if (!post) {
            return res.status(404).json({ error: 'Publicación no encontrada' });
        }

        // Verificar que el usuario sea el autor
        if (post.autor.toString() !== userId) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar esta publicación' });
        }

        // Eliminar archivos asociados si existen
        if (post.imagen) {
            const filePath = path.join(__dirname, '../../public', post.imagen);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        if (post.video) {
            const filePath = path.join(__dirname, '../../public', post.video);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await Post.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Publicación eliminada'
        });

    } catch (error) {
        console.error('Error eliminando publicación:', error);
        res.status(500).json({ error: 'Error al eliminar publicación' });
    }
});

// ========================================
// RUTA: OBTENER PUBLICACIONES DE UN USUARIO
// GET /api/muro/usuario/:id
// ========================================
router.get('/usuario/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [publicaciones, total] = await Promise.all([
            Post.find({ autor: id, visible: true })
                .populate('autor', 'nombre fotoPerfil walletAddress')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Post.countDocuments({ autor: id, visible: true })
        ]);

        res.json({
            publicaciones,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error obteniendo publicaciones del usuario:', error);
        res.status(500).json({ error: 'Error al obtener publicaciones' });
    }
});

module.exports = router;