// backend/socket/livekitServer.js
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const config = require('../../config/config');

// ========================================
// CONFIGURACIÓN DE LIVEKIT
// ========================================
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || config.livekit.apiKey;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || config.livekit.apiSecret;
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || config.livekit.wsUrl;
const LIVEKIT_HTTP_URL = process.env.LIVEKIT_HTTP_URL || config.livekit.httpUrl;

// ========================================
// CLIENTE DE LIVEKIT
// ========================================
let roomService = null;
if (LIVEKIT_API_KEY && LIVEKIT_API_SECRET) {
    roomService = new RoomServiceClient(
        LIVEKIT_HTTP_URL,
        LIVEKIT_API_KEY,
        LIVEKIT_API_SECRET
    );
    console.log('✅ LiveKit RoomService inicializado');
} else {
    console.warn('⚠️ LiveKit no configurado - API Key/Secret faltantes');
}

// ========================================
// FUNCIONES PRINCIPALES
// ========================================

/**
 * Genera un token de acceso para LiveKit
 * @param {string} roomName - Nombre de la sala
 * @param {string} identity - Identidad del usuario
 * @param {string} name - Nombre del usuario
 * @param {Object} grants - Permisos
 * @returns {Promise<string>} Token JWT
 */
const generateToken = async (roomName, identity, name = '', grants = {}) => {
    try {
        const at = new AccessToken(
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET,
            {
                identity: identity,
                name: name || identity,
                ttl: 3600 // 1 hora
            }
        );

        // Permisos por defecto
        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
            ...grants
        });

        return await at.toJwt();
    } catch (error) {
        console.error('❌ Error generando token LiveKit:', error);
        throw error;
    }
};

/**
 * Crea una sala en LiveKit
 * @param {string} roomName - Nombre de la sala
 * @param {Object} options - Opciones de la sala
 * @returns {Promise<Object>} Información de la sala
 */
const createRoom = async (roomName, options = {}) => {
    try {
        if (!roomService) {
            throw new Error('LiveKit no configurado');
        }

        const room = await roomService.createRoom({
            name: roomName,
            emptyTimeout: 300, // 5 minutos
            maxParticipants: 100,
            ...options
        });

        console.log(`✅ Sala creada: ${roomName}`);
        return room;
    } catch (error) {
        console.error('❌ Error creando sala LiveKit:', error);
        throw error;
    }
};

/**
 * Elimina una sala en LiveKit
 * @param {string} roomName - Nombre de la sala
 * @returns {Promise<boolean>}
 */
const deleteRoom = async (roomName) => {
    try {
        if (!roomService) {
            throw new Error('LiveKit no configurado');
        }

        await roomService.deleteRoom(roomName);
        console.log(`✅ Sala eliminada: ${roomName}`);
        return true;
    } catch (error) {
        console.error('❌ Error eliminando sala LiveKit:', error);
        return false;
    }
};

/**
 * Obtiene información de una sala
 * @param {string} roomName - Nombre de la sala
 * @returns {Promise<Object>} Información de la sala
 */
const getRoomInfo = async (roomName) => {
    try {
        if (!roomService) {
            throw new Error('LiveKit no configurado');
        }

        const rooms = await roomService.listRooms();
        const room = rooms.find(r => r.name === roomName);
        
        if (!room) {
            return null;
        }

        return {
            name: room.name,
            participants: room.numParticipants,
            created_at: room.creationTime,
            metadata: room.metadata
        };
    } catch (error) {
        console.error('❌ Error obteniendo información de sala:', error);
        return null;
    }
};

/**
 * Lista todas las salas activas
 * @returns {Promise<Array>} Lista de salas
 */
const listRooms = async () => {
    try {
        if (!roomService) {
            throw new Error('LiveKit no configurado');
        }

        const rooms = await roomService.listRooms();
        return rooms.map(room => ({
            name: room.name,
            participants: room.numParticipants,
            created_at: room.creationTime,
            metadata: room.metadata
        }));
    } catch (error) {
        console.error('❌ Error listando salas:', error);
        return [];
    }
};

/**
 * Obtiene estadísticas de una sala
 * @param {string} roomName - Nombre de la sala
 * @returns {Promise<Object>} Estadísticas
 */
const getRoomStats = async (roomName) => {
    try {
        const room = await getRoomInfo(roomName);
        if (!room) return null;

        // Aquí se pueden agregar más métricas
        return {
            roomName: room.name,
            participants: room.participants,
            createdAt: room.created_at,
            status: room.participants > 0 ? 'active' : 'empty'
        };
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        return null;
    }
};

/**
 * Cierra una sala después de un tiempo inactivo
 * @param {string} roomName - Nombre de la sala
 * @param {number} timeout - Tiempo de espera en segundos
 */
const scheduleRoomCleanup = async (roomName, timeout = 300) => {
    setTimeout(async () => {
        try {
            const room = await getRoomInfo(roomName);
            if (room && room.participants === 0) {
                await deleteRoom(roomName);
                console.log(`🧹 Sala limpiada por inactividad: ${roomName}`);
            }
        } catch (error) {
            console.error('❌ Error en limpieza de sala:', error);
        }
    }, timeout * 1000);
};

// ========================================
// EXPORTAR FUNCIONES
// ========================================
module.exports = {
    generateToken,
    createRoom,
    deleteRoom,
    getRoomInfo,
    listRooms,
    getRoomStats,
    scheduleRoomCleanup,
    roomService
};