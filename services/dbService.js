const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data.db');
const db = new sqlite3.Database(dbPath);

// Crear tablas
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT UNIQUE NOT NULL,
        nombre TEXT,
        tokens INTEGER DEFAULT 0,
        domos INTEGER DEFAULT 0,
        ha_canjeado INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL DEFAULT 'Anónimo',
        user_avatar TEXT DEFAULT '',
        message TEXT NOT NULL,
        type TEXT DEFAULT 'text',
        metadata TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('✅ Tablas SQLite creadas/verificadas');
});

// ================================================================
// FUNCIONES DE USUARIOS
// ================================================================

function getOrCreateUser(wallet, callback) {
    db.get(`SELECT * FROM users WHERE wallet_address = ?`, [wallet], (err, user) => {
        if (err) {
            console.error('Error obteniendo usuario:', err);
            callback(null);
            return;
        }
        if (user) {
            callback(user);
            return;
        }
        db.run(`INSERT INTO users (wallet_address) VALUES (?)`, [wallet], function(err) {
            if (err) {
                console.error('Error creando usuario:', err);
                callback(null);
            } else {
                db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (err, newUser) => {
                    callback(newUser);
                });
            }
        });
    });
}

function updateUserTokens(wallet, tokens, callback) {
    db.run(`UPDATE users SET tokens = tokens + ? WHERE wallet_address = ?`, [tokens, wallet], function(err) {
        callback(!err);
    });
}

function canjearNft(wallet, callback) {
    db.get(`SELECT tokens, ha_canjeado FROM users WHERE wallet_address = ?`, [wallet], (err, user) => {
        if (err || !user) {
            callback(false, 'Usuario no encontrado');
            return;
        }
        if (user.ha_canjeado === 1) {
            callback(false, 'Ya canjeaste tu NFT');
            return;
        }
        if (user.tokens < 12) {
            callback(false, 'Necesitas 12 tokens');
            return;
        }
        db.run(`UPDATE users SET tokens = tokens - 12, ha_canjeado = 1 WHERE wallet_address = ?`, [wallet], function(err) {
            if (err) {
                callback(false, 'Error al canjear');
            } else {
                callback(true, 'NFT canjeado exitosamente');
            }
        });
    });
}

// ================================================================
// FUNCIONES DE CHAT
// ================================================================

function saveChatMessage(data, callback) {
    const { streamId, userId, userName, userAvatar, message, type, metadata } = data;
    db.run(
        `INSERT INTO chat_messages (stream_id, user_id, user_name, user_avatar, message, type, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [streamId, userId, userName || 'Anónimo', userAvatar || '', message, type || 'text', JSON.stringify(metadata || {})],
        function(err) {
            if (err) {
                console.error('Error guardando mensaje:', err);
                callback(null);
            } else {
                callback(this.lastID);
            }
        }
    );
}

function getStreamMessages(streamId, limit = 50, callback) {
    db.all(
        `SELECT * FROM chat_messages WHERE stream_id = ? ORDER BY created_at DESC LIMIT ?`,
        [streamId, limit],
        (err, rows) => {
            if (err) {
                console.error('Error obteniendo mensajes:', err);
                callback([]);
            } else {
                callback(rows || []);
            }
        }
    );
}

module.exports = {
    db,
    getOrCreateUser,
    updateUserTokens,
    canjearNft,
    saveChatMessage,
    getStreamMessages
};