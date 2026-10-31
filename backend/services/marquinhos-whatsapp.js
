/* ================================================================
   services/marquinhos-whatsapp.js — CANAL WHATSAPP DE MARQUINHOS (v1.1)
   ================================================================
   Entrada: eventos message.received de Telnyx (desde telnyx-webhook.js).
   Salida:  respuesta por Telnyx desde el número de WhatsApp.

   v1.1 — Lee TELNYX_WHATSAPP_PHONE_NUMBER_ID (la variable que existe en
          Railway). Ese valor es el ID del número en Telnyx, no un token.
          El número real (+52…) se obtiene de la API de Telnyx y se cachea.
          Solo se necesitan TELNYX_API_KEY y TELNYX_WHATSAPP_PHONE_NUMBER_ID.

   - Solo usuarios vinculados con código de 6 dígitos.
   - El código se guarda con SHA-256; nunca en claro. Vence en 10 min.
   - Límites y membresía: los decide planGuard dentro de
     marquinhos-core.js (misma regla que la web).
================================================================ */

'use strict';

const axios = require('axios');
const crypto = require('crypto');

const sbAdmin = require('../lib/supabase-admin');
const { responderMarquinhos } = require('./marquinhos-core');

/* ================================================================
   CONFIGURACIÓN (variables existentes en Railway)
================================================================ */

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const WA_PHONE_NUMBER_ID = process.env.TELNYX_WHATSAPP_PHONE_NUMBER_ID;

const CODIGO_TTL_MS = 10 * 60 * 1000;
const MAX_INTENTOS_POR_TELEFONO = 5;
const VENTANA_INTENTOS_MS = 15 * 60 * 1000;

const NUMERO_CACHE_TTL_MS = 60 * 60 * 1000;

// Límite de intentos de código por número (en memoria del proceso)
const intentosPorTelefono = new Map();

// Número real (E.164) resuelto desde el ID de Telnyx
let numeroCache = { valor: null, expiraEn: 0 };

/* ================================================================
   UTILIDADES
================================================================ */

function normalizarTelefono(valor) {
    const s = String(valor || '').trim();
    return /^\+\d{8,15}$/.test(s) ? s : null;
}

function hashCodigo(codigo) {
    return crypto.createHash('sha256').update(String(codigo)).digest('hex');
}

function intentoPermitido(telefono) {
    const ahora = Date.now();
    const lista = (intentosPorTelefono.get(telefono) || [])
        .filter(function (t) { return ahora - t < VENTANA_INTENTOS_MS; });
    if (lista.length >= MAX_INTENTOS_POR_TELEFONO) {
        intentosPorTelefono.set(telefono, lista);
        return false;
    }
    lista.push(ahora);
    intentosPorTelefono.set(telefono, lista);
    return true;
}

function recortarLista(items, maximo) {
    return (items || []).slice(0, maximo);
}

/* ================================================================
   NÚMERO DE WHATSAPP: ID de Telnyx → número E.164
   GET /v2/phone_numbers/{id} devuelve el número asociado al ID.
   Si el ID no es de un número de Telnyx, la llamada falla y se registra.
================================================================ */

async function obtenerNumeroWhatsApp() {
    if (numeroCache.valor && Date.now() < numeroCache.expiraEn) {
        return numeroCache.valor;
    }

    if (!TELNYX_API_KEY || !WA_PHONE_NUMBER_ID) {
        throw new Error('Falta TELNYX_API_KEY o TELNYX_WHATSAPP_PHONE_NUMBER_ID');
    }

    try {
        const { data } = await axios.get(
            `https://api.telnyx.com/v2/phone_numbers/${encodeURIComponent(WA_PHONE_NUMBER_ID)}`,
            {
                headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
                timeout: 10000
            }
        );

        const numero = normalizarTelefono(data && data.data && data.data.phone_number);
        if (!numero) {
            throw new Error('Telnyx no devolvió un número válido para ese ID');
        }

        numeroCache = { valor: numero, expiraEn: Date.now() + NUMERO_CACHE_TTL_MS };
        console.log('✅ [whatsapp] número de WhatsApp resuelto desde Telnyx');
        return numero;
    } catch (error) {
        const cuerpo = error.response ? JSON.stringify(error.response.data).slice(0, 300) : error.message;
        console.error(`❌ [whatsapp] no se pudo resolver el número — HTTP ${error.response?.status || 'sin respuesta'} — ${cuerpo}`);
        throw error;
    }
}

// Carga el número al arrancar para que el webhook lo tenga listo
obtenerNumeroWhatsApp().catch(function () {});

/* ================================================================
   ENVÍO POR TELNYX
   Nota: 'type: WHATSAPP' debe confirmarse con la documentación de
   Telnyx para tu messaging profile. Si Telnyx rechaza el formato,
   el error se registra con el cuerpo de respuesta.
================================================================ */

async function enviarWhatsApp(telefono, texto) {
    const from = await obtenerNumeroWhatsApp();

    try {
        await axios.post(
            'https://api.telnyx.com/v2/messages',
            {
                from: from,
                to: telefono,
                text: String(texto || '').slice(0, 1500),
                type: 'WHATSAPP'
            },
            {
                headers: {
                    Authorization: `Bearer ${TELNYX_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
    } catch (error) {
        const cuerpo = error.response ? JSON.stringify(error.response.data).slice(0, 400) : error.message;
        console.error(`❌ [whatsapp] envío a Telnyx falló — HTTP ${error.response?.status || 'sin respuesta'} — ${cuerpo}`);
        throw error;
    }
}

/* ================================================================
   DETECCIÓN DEL EVENTO
   Un mensaje entrante es de WhatsApp de Marquinhos si el destino es
   el número de WhatsApp resuelto. Si aún no está resuelto, no se
   procesa y se registra; así no se mezcla con SMS ni con eSIM.
================================================================ */

function esMensajeWhatsApp(evento) {
    const tipo = String(evento?.data?.event_type || evento?.type || '');
    if (tipo !== 'message.received') return false;

    const payload = evento?.data?.payload;
    if (!payload) return false;

    const numero = numeroCache.valor;
    if (!numero) {
        console.warn('[whatsapp] número aún no resuelto; se omite el evento');
        return false;
    }

    const destinos = Array.isArray(payload.to)
        ? payload.to.map(function (t) { return t && t.phone_number; })
        : [payload.to && payload.to.phone_number];

    return destinos.indexOf(numero) !== -1;
}

/* ================================================================
   VINCULACIÓN CON CÓDIGO DE 6 DÍGITOS
================================================================ */

async function generarCodigoVinculacion(usuarioId) {
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const expiraEn = new Date(Date.now() + CODIGO_TTL_MS).toISOString();

    const { error } = await sbAdmin
        .from('marquinhos_whatsapp_codigos')
        .upsert(
            {
                usuario_id: usuarioId,
                codigo_hash: hashCodigo(codigo),
                expira_en: expiraEn,
                intentos: 0
            },
            { onConflict: 'usuario_id' }
        );

    if (error) throw new Error(error.message);

    return { codigo, expira_en: expiraEn };
}

async function vincularConCodigo(telefono, codigo) {
    const { data: fila, error } = await sbAdmin
        .from('marquinhos_whatsapp_codigos')
        .select('usuario_id, expira_en')
        .eq('codigo_hash', hashCodigo(codigo))
        .maybeSingle();

    if (error || !fila) return false;
    if (new Date(fila.expira_en) <= new Date()) return false;

    const { error: errVinculo } = await sbAdmin
        .from('marquinhos_whatsapp_vinculos')
        .upsert(
            { telefono, usuario_id: fila.usuario_id, activo: true },
            { onConflict: 'telefono' }
        );

    if (errVinculo) {
        console.error('❌ [whatsapp] no se pudo guardar el vínculo:', errVinculo.message);
        return false;
    }

    // El código se usa una sola vez
    await sbAdmin
        .from('marquinhos_whatsapp_codigos')
        .delete()
        .eq('usuario_id', fila.usuario_id);

    return true;
}

async function buscarVinculo(telefono) {
    const { data, error } = await sbAdmin
        .from('marquinhos_whatsapp_vinculos')
        .select('usuario_id')
        .eq('telefono', telefono)
        .eq('activo', true)
        .maybeSingle();

    if (error) {
        console.error('❌ [whatsapp] error buscando vínculo:', error.message);
        return null;
    }
    return data || null;
}

/* ================================================================
   FORMATO DE RESPUESTA PARA TEXTO PLANO
   WhatsApp no tiene tarjetas: se envían los enlaces como texto.
================================================================ */

function formatearMusica(musica) {
    const lista = recortarLista(musica, 3);
    if (!lista.length) return '';
    return '\n\nCanciones:\n' + lista
        .map(function (c) { return `• ${c.titulo} — ${c.artista}\n${c.enlace}`; })
        .join('\n');
}

function formatearEventos(eventos) {
    const lista = recortarLista(eventos, 3);
    if (!lista.length) return '';
    return '\n\nEventos:\n' + lista
        .map(function (ev) {
            const partes = [ev.titulo];
            if (ev.fecha) partes.push(ev.fecha);
            if (ev.lugar) partes.push(ev.lugar);
            return `• ${partes.join(' · ')}\n${ev.enlace}`;
        })
        .join('\n');
}

/* ================================================================
   MANEJO DE MENSAJE ENTRANTE
================================================================ */

async function manejarMensajeWhatsApp(evento) {
    const payload = evento.data.payload;
    const telefono = normalizarTelefono(payload.from && payload.from.phone_number);
    const texto = String(payload.text || '').trim().slice(0, 1000);

    if (!telefono) {
        console.warn('[whatsapp] remitente inválido en el evento');
        return;
    }

    if (!texto) {
        return enviarWhatsApp(telefono, 'Mándame un mensaje de texto y te respondo.');
    }

    const vinculo = await buscarVinculo(telefono);

    if (!vinculo) {
        if (/^\d{6}$/.test(texto)) {
            if (!intentoPermitido(telefono)) {
                return enviarWhatsApp(telefono,
                    'Demasiados intentos. Espera unos minutos antes de volver a intentar.');
            }

            const ok = await vincularConCodigo(telefono, texto);
            return enviarWhatsApp(telefono, ok
                ? '¡Listo! Tu WhatsApp quedó vinculado a Marquinhos. Ya puedes platicar conmigo por aquí.'
                : 'Ese código no es válido o ya venció. Genera uno nuevo en la app de Sariel\'s.');
        }

        return enviarWhatsApp(telefono,
            'Para hablar conmigo por WhatsApp, genera tu código de vinculación en la app de Sariel\'s y envíamelo aquí.');
    }

    const resultado = await responderMarquinhos({
        usuarioId: vinculo.usuario_id,
        mensaje: texto,
        history: [],
        page: 'WhatsApp',
        modo: 'texto',
        origen: 'texto'
    });

    if (!resultado.ok) {
        return enviarWhatsApp(telefono,
            'Tuve un problema para responder. Intenta de nuevo en un momento.');
    }

    const cuerpo = resultado.reply + formatearMusica(resultado.musica) + formatearEventos(resultado.eventos);
    return enviarWhatsApp(telefono, cuerpo);
}

module.exports = {
    esMensajeWhatsApp,
    manejarMensajeWhatsApp,
    generarCodigoVinculacion,
    obtenerNumeroWhatsApp
};
