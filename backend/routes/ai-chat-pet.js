/* ================================================================
   routes/ai-chat-pet.js — CHAT WEB DE MARQUINHOS (v7.0)
   ================================================================
   Endpoint: POST /api/ai/chat-pet
   Lógica:   services/marquinhos-core.js (compartida con WhatsApp)

   v7.0 — Refactor: la lógica del cerebro vive en marquinhos-core.js.
          Esta ruta solo autentica, valida el body y convierte el
          resultado en respuesta HTTP. Sin cambios de comportamiento.
          Nuevo: POST /api/ai/chat-pet/whatsapp/codigo para generar el
          código de 6 dígitos que vincula WhatsApp con la cuenta.
================================================================ */

'use strict';

const express = require('express');
const router = express.Router();

const supabaseAdmin = require('../lib/supabase-admin');
const { responderMarquinhos } = require('../services/marquinhos-core');
const { generarCodigoVinculacion } = require('../services/marquinhos-whatsapp');

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
        modo = 'texto'
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
        origen
    });

    if (!resultado.ok) {
        return res.status(resultado.httpStatus || 500).json({
            success: false,
            error: resultado.error
        });
    }

    const { ok, httpStatus, ...cuerpo } = resultado;
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
