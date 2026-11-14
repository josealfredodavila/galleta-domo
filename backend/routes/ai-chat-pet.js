/* ================================================================
   routes/ai-chat-pet.js — CHAT WEB DE MARQUINHOS (v7.1)
   ================================================================
   Endpoint: POST /api/ai/chat-pet
   Lógica:   services/marquinhos-core.js (compartida con WhatsApp)

   v7.1 — Recibe "conocimiento" y "estilo" desde el cerebro web y
          los pasa a marquinhos-core.js. Limpia el "Hola de nuevo"
          como respaldo en el servidor. Resto sin cambios.
================================================================ */

'use strict';

const express = require('express');
const router = express.Router();

const supabaseAdmin = require('../lib/supabase-admin');
const { responderMarquinhos } = require('../services/marquinhos-core');
const { generarCodigoVinculacion } = require('../services/marquinhos-whatsapp');

const MAX_CONOCIMIENTO_CHARS = 20000;

/* ================================================================
   HELPERS
================================================================ */

function sanitizarConocimiento(valor) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
    try {
        const json = JSON.stringify(valor);
        return json.length <= MAX_CONOCIMIENTO_CHARS ? valor : null;
    } catch (e) {
        return null;
    }
}

function sanitizarEstilo(valor) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
    return valor;
}

function limpiarSaludoRepetido(reply, history) {
    if (typeof reply !== 'string' || !reply) return reply;
    const hayConversacion = Array.isArray(history) &&
        history.some(m => m && m.role === 'assistant');
    if (!hayConversacion) return reply;
    return reply
        .replace(/^¡?\s*hola de nuevo(,?\s*[^!?.¿]*)?[!.]?\s*/i, (_, nombre) => '¡Hola' + (nombre || '') + '! ')
        .trim();
}

/* ================================================================
   AUTENTICACIÓN (sesión web)
================================================================ */

async function autenticar(req, res, next) {
    try {
        const auth = req.headers.authorization || '';

        if (!auth.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        const token = auth.slice(7).trim();
        if (!token) {
            return res.status(401).json({ success: false, error: 'Token no proporcionado' });
        }

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Sesión inválida o expirada' });
        }

        req.user = user;
        return next();
    } catch (error) {
        console.error('❌ Error autenticando chat-pet:', error);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   POST /api/ai/chat-pet
================================================================ */

router.post(['/', '/chat-pet'], autenticar, async (req, res) => {
    const {
        message,
        history = [],
        page = null,
        user_name = null,
        memoria = '',
        modo = 'texto',
        conocimiento = null,
        estilo = null
    } = req.body || {};

    const esVoz = modo === 'voz';
    const origen = esVoz ? 'voice_chat' : 'texto';

    const resultado = await responderMarquinhos({
        usuarioId: req.user.id,
        mensaje: message,
        history,
        page,
        userName: user_name,
        memoria,
        modo: esVoz ? 'voz' : 'texto',
        origen,
        conocimiento: sanitizarConocimiento(conocimiento),
        estilo: sanitizarEstilo(estilo)
    });

    if (!resultado.ok) {
        return res.status(resultado.httpStatus || 500).json({
            success: false,
            error: resultado.error
        });
    }

    const { ok, httpStatus, ...cuerpo } = resultado;

    if (typeof cuerpo.reply === 'string') {
        cuerpo.reply = limpiarSaludoRepetido(cuerpo.reply, history);
    }

    return res.status(200).json({ success: true, ...cuerpo });
});

/* ================================================================
   POST /api/ai/chat-pet/whatsapp/codigo
   Genera el código de 6 dígitos que el usuario envía por WhatsApp
   para vincular su número. Solo para sesiones válidas.
================================================================ */

router.post('/whatsapp/codigo', autenticar, async (req, res) => {
    try {
        const { codigo, expira_en } = await generarCodigoVinculacion(req.user.id);
        return res.status(200).json({
            success: true,
            codigo,
            expira_en,
            instrucciones: 'Envía este código por WhatsApp al número de Marquinhos. Vence en 10 minutos.'
        });
    } catch (error) {
        console.error('❌ Error generando código de WhatsApp:', error.message);
        return res.status(500).json({
            success: false,
            error: 'No se pudo generar el código. Intenta de nuevo.'
        });
    }
});

module.exports = router;