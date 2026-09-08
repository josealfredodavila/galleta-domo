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