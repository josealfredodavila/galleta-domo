/* ================================================================
   MERCADO - SARIEL'S ECOSYSTEM
   Backend: Registro y verificación de repartidores
   Ruta: /backend/routes/mercado-repartidor.js
   
   Endpoints:
   - POST /api/mercado/repartidor/validar-curp
   - POST /api/mercado/repartidor/guardar-documentos
   - POST /api/mercado/repartidor/procesar-verificacion
   - POST /api/mercado/repartidor/reintentar
   - GET  /api/mercado/repartidor/mi-estado
   - GET  /api/mercado/repartidor/mi-perfil
   - POST /api/mercado/repartidor/actualizar-datos
   - GET  /api/mercado/repartidor/paises
   - GET  /api/mercado/repartidor/health
   
   Esquema real:
   - mercado_repartidores (con +40 columnas de verificación)
   - mercado_repartidores_docs_log (auditoría de docs)
   - mercado_repartidores_historial (cambios de estado)
   - mercado_paises_soportados (países válidos)
   - mercado_configuracion (reglas editables)
   - mercado_lista_negra (teléfonos/emails/CURPs bloqueados)
   ================================================================ */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// ================================================================
// SUPABASE ADMIN
// ================================================================
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ================================================================
// CONFIG
// ================================================================
const STORAGE_BUCKET_DOCS = 'mercado_docs';
const MAX_FILE_SIZE_DOCS = 5 * 1024 * 1024; // 5 MB

const MIME_PERMITIDOS = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf'
];

// ================================================================
// LOGS
// ================================================================
function log(...args) {
    console.log('[Repartidor]', ...args);
}

function logError(...args) {
    console.error('[Repartidor ERROR]', ...args);
}

// ================================================================
// MIDDLEWARE: autenticar con JWT de Supabase
// ================================================================
async function autenticarUsuario(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '').trim();

        if (!token) {
            return res.status(401).json({ error: 'Falta token de autenticación' });
        }

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data || !data.user) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        req.usuario = data.user;
        next();
    } catch (e) {
        logError('Error autenticando:', e);
        return res.status(401).json({ error: 'Error de autenticación' });
    }
}

// ================================================================
// HELPERS
// ================================================================

// Limpia texto: trim + quitar caracteres raros
function limpiarTexto(texto) {
    if (!texto) return '';
    return String(texto).trim().replace(/\s+/g, ' ');
}

// Normaliza teléfono: quita espacios, guiones, paréntesis, +
function normalizarTelefono(tel) {
    if (!tel) return '';
    return String(tel).replace(/[\s\-\(\)\+\.]/g, '');
}

// Normaliza email: lowercase + trim
function normalizarEmail(email) {
    if (!email) return '';
    return String(email).trim().toLowerCase();
}

// Normaliza CURP: uppercase + trim
function normalizarCURP(curp) {
    if (!curp) return '';
    return String(curp).trim().toUpperCase();
}

// Valida CURP con el algoritmo oficial mexicano (mismo que la DB)
function validarCURPLocal(curp) {
    if (!curp) return false;
    curp = normalizarCURP(curp);

    if (curp.length !== 18) return false;

    // Patrón: 4 letras + 6 dígitos + 6 alfanum + 2 alfanum
    if (!/^[A-Z]{4}[0-9]{6}[A-Z]{6}[0-9A-Z]{2}$/.test(curp)) return false;

    // Diccionario oficial
    const diccionario = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
    let suma = 0;

    for (let i = 0; i < 17; i++) {
        const caracter = curp.substring(i, i + 1);
        const posicion = diccionario.indexOf(caracter);
        if (posicion === -1) return false;
        suma += posicion * (18 - i);
    }

    let digitoVerificador = 10 - (suma % 10);
    if (digitoVerificador === 10) digitoVerificador = 0;

    return curp.substring(17, 18) === String(digitoVerificador);
}

// Valida email con regex básica
function validarEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Valida teléfono (al menos 8 dígitos)
function validarTelefono(tel) {
    if (!tel) return false;
    const limpio = normalizarTelefono(tel);
    return limpio.length >= 8 && limpio.length <= 15;
}

// Calcula edad desde fecha de nacimiento
function calcularEdad(fechaNacimiento) {
    if (!fechaNacimiento) return 0;
    const hoy = new Date();
    const nac = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const mes = hoy.getMonth() - nac.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) {
        edad--;
    }
    return edad;
}

// Lee una config de la DB
async function leerConfig(clave, valorDefault) {
    try {
        const { data, error } = await supabaseAdmin
            .from('mercado_configuracion')
            .select('valor, tipo')
            .eq('clave', clave)
            .maybeSingle();

        if (error || !data) return valorDefault;

        if (data.tipo === 'number') return parseFloat(data.valor);
        if (data.tipo === 'boolean') return data.valor === 'true';
        if (data.tipo === 'json') {
            try { return JSON.parse(data.valor); } catch (e) { return valorDefault; }
        }
        return data.valor;
    } catch (e) {
        return valorDefault;
    }
}

// Verifica si un valor está en lista negra
async function estaEnListaNegra(tipo, valor) {
    if (!valor) return false;
    try {
        const { data, error } = await supabaseAdmin
            .from('mercado_lista_negra')
            .select('id')
            .eq('tipo', tipo)
            .eq('valor', String(valor).toLowerCase().trim())
            .eq('activo', true)
            .maybeSingle();

        return !error && !!data;
    } catch (e) {
        return false;
    }
}

// Registra un intento de registro
async function registrarIntento(datos) {
    try {
        await supabaseAdmin
            .from('mercado_intentos_registro')
            .insert({
                ip: datos.ip || null,
                user_agent: datos.userAgent || null,
                email: datos.email || null,
                telefono: datos.telefono || null,
                exitoso: datos.exitoso || false,
                motivo_fallo: datos.motivoFallo || null
            });
    } catch (e) {
        logError('Error registrando intento:', e);
    }
}

// Obtiene la IP real del request (considera proxies de Railway)
function obtenerIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

// ================================================================
// GET /api/mercado/repartidor/health
// ================================================================
router.get('/health', (req, res) => {
    res.json({
        ok: true,
        servicio: 'Repartidor Backend',
        storage_bucket: STORAGE_BUCKET_DOCS,
        max_file_mb: MAX_FILE_SIZE_DOCS / 1024 / 1024,
        mimes_permitidos: MIME_PERMITIDOS,
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// GET /api/mercado/repartidor/paises
// Lista de países soportados
// ================================================================
router.get('/paises', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('mercado_paises_soportados')
            .select('*')
            .eq('activo', true)
            .order('orden', { ascending: true });

        if (error) throw error;

        return res.json({ ok: true, paises: data || [] });

    } catch (e) {
        logError('Error países:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// POST /api/mercado/repartidor/validar-curp
// Valida una CURP (algoritmo oficial)
// Body: { curp }
// ================================================================
router.post('/validar-curp', autenticarUsuario, async (req, res) => {
    try {
        const { curp } = req.body;

        if (!curp) {
            return res.status(400).json({ ok: false, error: 'Falta CURP' });
        }

        const curpNorm = normalizarCURP(curp);
        const esValida = validarCURPLocal(curpNorm);

        // Info adicional que se puede extraer de la CURP
        let info = null;
        if (esValida) {
            try {
                // Posiciones: 
                // 5-10 = fecha nacimiento (YYMMDD)
                // 11 = sexo (H/M)
                // 12-13 = entidad federativa
                const fechaYYMMDD = curpNorm.substring(4, 10);
                const sexo = curpNorm.substring(10, 11);
                const entidad = curpNorm.substring(11, 13);

                const anio = parseInt(fechaYYMMDD.substring(0, 2));
                const mes = parseInt(fechaYYMMDD.substring(2, 4));
                const dia = parseInt(fechaYYMMDD.substring(4, 6));

                // Determinar siglo (asumiendo que nacieron en 1900 o 2000)
                const anioActual = new Date().getFullYear() % 100;
                const siglo = anio <= anioActual ? 2000 : 1900;
                const anioCompleto = siglo + anio;

                info = {
                    fecha_nacimiento: `${anioCompleto}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
                    sexo: sexo === 'H' ? 'hombre' : 'mujer',
                    entidad: entidad,
                    edad: calcularEdad(`${anioCompleto}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`)
                };
            } catch (eInfo) {
                // silencioso
            }
        }

        return res.json({
            ok: true,
            valida: esValida,
            curp_normalizada: curpNorm,
            info: info
        });

    } catch (e) {
        logError('Error validando CURP:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// POST /api/mercado/repartidor/guardar-documentos
// Guarda las URLs de los documentos subidos al bucket
// Body: {
//   documento_frente_url,
//   documento_reverso_url,
//   selfie_url,
//   foto_vehiculo_url,
//   ocr_texto,
//   ocr_nombre,
//   ocr_curp,
//   face_match_score
// }
// ================================================================
router.post('/guardar-documentos', autenticarUsuario, async (req, res) => {
    const usuarioId = req.usuario.id;
    const ip = obtenerIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
        const {
            documento_frente_url,
            documento_reverso_url,
            selfie_url,
            foto_vehiculo_url,
            ocr_texto,
            ocr_nombre,
            ocr_curp,
            face_match_score
        } = req.body;

        // Verificar que el repartidor exista
        const { data: rep, error: errRep } = await supabaseAdmin
            .from('mercado_repartidores')
            .select('id, usuario_id, estado_verificacion, nombre_completo, curp, intentos_verificacion')
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (errRep || !rep) {
            return res.status(404).json({ error: 'Perfil de repartidor no encontrado. Debes iniciar el registro primero.' });
        }

        // Verificar intentos máximos
        const maxIntentos = await leerConfig('registro_max_intentos', 3);
        if (rep.intentos_verificacion >= maxIntentos) {
            return res.status(429).json({
                error: 'Has superado el máximo de intentos de verificación. Contacta a soporte.'
            });
        }

        // Determinar si el OCR coincidió con el nombre registrado
        let ocrCoincide = false;
        if (ocr_nombre && rep.nombre_completo) {
            const normalizar = (s) => String(s).toUpperCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ').trim();

            const nombreReg = normalizar(rep.nombre_completo);
            const nombreOcr = normalizar(ocr_nombre);

            // Coincide si al menos 2 palabras clave están presentes
            const palabrasReg = nombreReg.split(' ').filter(p => p.length > 2);
            const palabrasOcr = nombreOcr.split(' ').filter(p => p.length > 2);

            let coincidencias = 0;
            palabrasReg.forEach(p => {
                if (palabrasOcr.some(o => o === p || o.includes(p) || p.includes(o))) {
                    coincidencias++;
                }
            });

            ocrCoincide = coincidencias >= 2;
        }

        // Determinar si la CURP del OCR coincide con la registrada
        let curpCoincide = false;
        if (ocr_curp && rep.curp) {
            curpCoincide = normalizarCURP(ocr_curp) === normalizarCURP(rep.curp);
        }

        // Actualizar el repartidor con las URLs y los resultados
        const { error: errUpd } = await supabaseAdmin
            .from('mercado_repartidores')
            .update({
                documento_frente_url: documento_frente_url || null,
                documento_reverso_url: documento_reverso_url || null,
                selfie_url: selfie_url || null,
                foto_vehiculo_url: foto_vehiculo_url || null,
                ocr_nombre_coincide: ocrCoincide,
                face_match_score: face_match_score ? parseFloat(face_match_score) : null,
                ip_registro: ip,
                user_agent_registro: userAgent,
                updated_at: new Date().toISOString()
            })
            .eq('id', rep.id);

        if (errUpd) {
            logError('Error actualizando repartidor:', errUpd);
            return res.status(500).json({ error: 'No se pudieron guardar los documentos' });
        }

        // Registrar cada documento en el log de auditoría
        const docs = [
            { tipo: 'ine_frente', url: documento_frente_url, texto: ocr_texto },
            { tipo: 'ine_reverso', url: documento_reverso_url },
            { tipo: 'selfie', url: selfie_url },
            { tipo: 'vehiculo', url: foto_vehiculo_url }
        ].filter(d => d.url);

        for (const doc of docs) {
            try {
                await supabaseAdmin
                    .from('mercado_repartidores_docs_log')
                    .insert({
                        repartidor_id: rep.id,
                        tipo_doc: doc.tipo,
                        url: doc.url,
                        ocr_texto: doc.texto || null,
                        valido: true
                    });
            } catch (eDoc) {
                logError('Error insertando docs_log:', eDoc);
            }
        }

        return res.json({
            ok: true,
            mensaje: 'Documentos guardados correctamente',
            ocr_nombre_coincide: ocrCoincide,
            curp_ocr_coincide: curpCoincide,
            face_match_score: face_match_score || null
        });

    } catch (e) {
        logError('Error guardando documentos:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// POST /api/mercado/repartidor/procesar-verificacion
// Cambia el estado a 'procesando' → el trigger decide automáticamente
// ================================================================
router.post('/procesar-verificacion', autenticarUsuario, async (req, res) => {
    const usuarioId = req.usuario.id;
    const ip = obtenerIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
        // Obtener el perfil
        const { data: rep, error: errRep } = await supabaseAdmin
            .from('mercado_repartidores')
            .select('*')
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (errRep || !rep) {
            return res.status(404).json({ error: 'Perfil no encontrado' });
        }

        // Validaciones previas
        if (!rep.telefono_verificado) {
            await registrarIntento({
                ip, userAgent, email: rep.email, telefono: rep.telefono,
                exitoso: false, motivoFallo: 'teléfono_no_verificado'
            });
            return res.status(400).json({ error: 'Debes verificar tu teléfono primero' });
        }

        if (!rep.email_verificado) {
            await registrarIntento({
                ip, userAgent, email: rep.email, telefono: rep.telefono,
                exitoso: false, motivoFallo: 'email_no_verificado'
            });
            return res.status(400).json({ error: 'Debes verificar tu email primero' });
        }

        if (!rep.curp_valida) {
            return res.status(400).json({ error: 'La CURP no está validada' });
        }

        if (!rep.terminos_aceptados) {
            return res.status(400).json({ error: 'Debes aceptar los términos y condiciones' });
        }

        if (!rep.documento_frente_url) {
            return res.status(400).json({ error: 'Falta subir el documento de identidad (frente)' });
        }

        if (!rep.selfie_url) {
            return res.status(400).json({ error: 'Falta subir la selfie' });
        }

        // Verificar lista negra
        if (await estaEnListaNegra('telefono', normalizarTelefono(rep.telefono)) ||
            await estaEnListaNegra('email', normalizarEmail(rep.email)) ||
            await estaEnListaNegra('curp', normalizarCURP(rep.curp))) {

            await supabaseAdmin
                .from('mercado_repartidores')
                .update({
                    estado_verificacion: 'rechazado',
                    en_lista_negra: true,
                    motivo_rechazo: 'Registro bloqueado por seguridad'
                })
                .eq('id', rep.id);

            await registrarIntento({
                ip, userAgent, email: rep.email, telefono: rep.telefono,
                exitoso: false, motivoFallo: 'lista_negra'
            });

            return res.status(403).json({ error: 'Registro bloqueado por seguridad' });
        }

        // Cambiar a 'procesando' → el trigger decide
        const { error: errUpd } = await supabaseAdmin
            .from('mercado_repartidores')
            .update({
                estado_verificacion: 'procesando',
                ip_registro: ip,
                user_agent_registro: userAgent,
                updated_at: new Date().toISOString()
            })
            .eq('id', rep.id);

        if (errUpd) {
            logError('Error procesando:', errUpd);
            return res.status(500).json({ error: 'No se pudo procesar la verificación' });
        }

        // Leer el estado resultante (el trigger ya lo actualizó)
        const { data: repFinal } = await supabaseAdmin
            .from('mercado_repartidores')
            .select('estado_verificacion, score_confianza, motivo_rechazo')
            .eq('id', rep.id)
            .single();

        await registrarIntento({
            ip, userAgent, email: rep.email, telefono: rep.telefono,
            exitoso: true, motivoFallo: null
        });

        return res.json({
            ok: true,
            mensaje: 'Verificación procesada',
            estado: repFinal?.estado_verificacion || 'procesando',
            score: repFinal?.score_confianza || 0,
            motivo_rechazo: repFinal?.motivo_rechazo || null
        });

    } catch (e) {
        logError('Error procesando verificación:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// POST /api/mercado/repartidor/reintentar
// Permite volver a intentar si fue rechazado
// ================================================================
router.post('/reintentar', autenticarUsuario, async (req, res) => {
    const usuarioId = req.usuario.id;

    try {
        const { data: rep, error: errRep } = await supabaseAdmin
            .from('mercado_repartidores')
            .select('id, estado_verificacion, intentos_verificacion')
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (errRep || !rep) {
            return res.status(404).json({ error: 'Perfil no encontrado' });
        }

        // Solo se puede reintentar si está rechazado
        if (rep.estado_verificacion !== 'rechazado' && rep.estado_verificacion !== 'revision_manual') {
            return res.status(400).json({
                error: 'Solo puedes reintentar si tu verificación fue rechazada'
            });
        }

        // Verificar intentos máximos
        const maxIntentos = await leerConfig('registro_max_intentos', 3);
        if (rep.intentos_verificacion >= maxIntentos) {
            return res.status(429).json({
                error: `Has superado el máximo de ${maxIntentos} intentos. Contacta a soporte.`
            });
        }

        // Resetear estado para reintentar
        const { error: errUpd } = await supabaseAdmin
            .from('mercado_repartidores')
            .update({
                estado_verificacion: 'pendiente_registro',
                motivo_rechazo: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', rep.id);

        if (errUpd) {
            return res.status(500).json({ error: errUpd.message });
        }

        // Registrar en historial
        try {
            await supabaseAdmin
                .from('mercado_repartidores_historial')
                .insert({
                    repartidor_id: rep.id,
                    estado_anterior: rep.estado_verificacion,
                    estado_nuevo: 'pendiente_registro',
                    motivo: 'Reintento solicitado por el usuario',
                    cambiado_por: 'usuario'
                });
        } catch (eH) { /* silencioso */ }

        return res.json({
            ok: true,
            mensaje: 'Puedes volver a intentar',
            intentos_usados: rep.intentos_verificacion,
            intentos_restantes: maxIntentos - rep.intentos_verificacion
        });

    } catch (e) {
        logError('Error reintentando:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// GET /api/mercado/repartidor/mi-estado
// Devuelve el estado actual de verificación del repartidor
// ================================================================
router.get('/mi-estado', autenticarUsuario, async (req, res) => {
    const usuarioId = req.usuario.id;

    try {
        const { data: rep, error } = await supabaseAdmin
            .from('mercado_repartidores')
            .select(`
                id,
                estado_verificacion,
                score_confianza,
                motivo_rechazo,
                intentos_verificacion,
                telefono_verificado,
                email_verificado,
                curp_valida,
                ocr_nombre_coincide,
                face_match_score,
                vehiculo_verificado,
                terminos_aceptados,
                aprobado_en,
                created_at,
                updated_at
            `)
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        if (!rep) {
            return res.json({
                ok: true,
                registrado: false,
                estado: 'no_registrado'
            });
        }

        // Intentos restantes
        const maxIntentos = await leerConfig('registro_max_intentos', 3);

        // Checklist de pasos completados
        const checklist = {
            telefono_verificado: rep.telefono_verificado || false,
            email_verificado: rep.email_verificado || false,
            curp_valida: rep.curp_valida || false,
            ocr_nombre_coincide: rep.ocr_nombre_coincide || false,
            face_match_ok: (rep.face_match_score || 0) >= 0.8,
            vehiculo_verificado: rep.vehiculo_verificado || false,
            terminos_aceptados: rep.terminos_aceptados || false
        };

        // Siguiente paso sugerido
        let siguientePaso = null;
        if (!checklist.telefono_verificado) siguientePaso = 'verificar_telefono';
        else if (!checklist.email_verificado) siguientePaso = 'verificar_email';
        else if (!checklist.curp_valida) siguientePaso = 'validar_curp';
        else if (!checklist.ocr_nombre_coincide) siguientePaso = 'subir_documentos';
        else if (!checklist.face_match_ok) siguientePaso = 'subir_selfie';
        else if (!checklist.vehiculo_verificado) siguientePaso = 'subir_vehiculo';
        else if (!checklist.terminos_aceptados) siguientePaso = 'aceptar_terminos';
        else siguientePaso = 'procesar_verificacion';

        return res.json({
            ok: true,
            registrado: true,
            estado: rep.estado_verificacion || 'pendiente_registro',
            score: rep.score_confianza || 0,
            motivo_rechazo: rep.motivo_rechazo || null,
            intentos_usados: rep.intentos_verificacion || 0,
            intentos_restantes: Math.max(0, maxIntentos - (rep.intentos_verificacion || 0)),
            aprobado_en: rep.aprobado_en,
            creado_en: rep.created_at,
            actualizado_en: rep.updated_at,
            checklist: checklist,
            siguiente_paso: siguientePaso
        });

    } catch (e) {
        logError('Error mi-estado:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// GET /api/mercado/repartidor/mi-perfil
// Datos completos del repartidor (para el panel)
// ================================================================
router.get('/mi-perfil', autenticarUsuario, async (req, res) => {
    const usuarioId = req.usuario.id;

    try {
        const { data: rep, error } = await supabaseAdmin
            .from('mercado_repartidores')
            .select('*')
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        if (!rep) {
            return res.json({ ok: true, registrado: false, perfil: null });
        }

        // Ocultar datos sensibles
        const perfilSeguro = { ...rep };
        delete perfilSeguro.documento_frente_url;
        delete perfilSeguro.documento_reverso_url;
        delete perfilSeguro.selfie_url;
        delete perfilSeguro.foto_vehiculo_url;
        delete perfilSeguro.curp;

        return res.json({
            ok: true,
            registrado: true,
            perfil: perfilSeguro
        });

    } catch (e) {
        logError('Error mi-perfil:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// POST /api/mercado/repartidor/actualizar-datos
// Actualiza datos básicos del repartidor (nombre, vehículo, zona, etc.)
// Body: { nombre_completo, telefono, email, vehiculo, marca_vehiculo,
//         modelo_vehiculo, anio_vehiculo, color_vehiculo, placas,
//         numero_serie, pais, ciudad, colonia_principal, radio_cobertura_km,
//         fecha_nacimiento, curp, genero, telefono_emergencia,
//         contacto_emergencia_nombre, codigo_postal, direccion_completa }
// ================================================================
router.post('/actualizar-datos', autenticarUsuario, async (req, res) => {
    const usuarioId = req.usuario.id;

    try {
        const {
            nombre_completo,
            telefono,
            email,
            vehiculo,
            marca_vehiculo,
            modelo_vehiculo,
            anio_vehiculo,
            color_vehiculo,
            placas,
            numero_serie,
            pais,
            ciudad,
            colonia_principal,
            radio_cobertura_km,
            fecha_nacimiento,
            curp,
            genero,
            telefono_emergencia,
            contacto_emergencia_nombre,
            codigo_postal,
            direccion_completa
        } = req.body;

        // Validaciones básicas
        if (nombre_completo && limpiarTexto(nombre_completo).length < 3) {
            return res.status(400).json({ error: 'Nombre demasiado corto' });
        }

        if (telefono && !validarTelefono(telefono)) {
            return res.status(400).json({ error: 'Teléfono inválido' });
        }

        if (email && !validarEmail(email)) {
            return res.status(400).json({ error: 'Email inválido' });
        }

        if (curp && !validarCURPLocal(curp)) {
            return res.status(400).json({ error: 'CURP inválida' });
        }

        // Edad mínima
        if (fecha_nacimiento) {
            const edad = calcularEdad(fecha_nacimiento);
            const edadMin = await leerConfig('registro_edad_minima', 18);
            if (edad < edadMin) {
                return res.status(400).json({
                    error: `Debes tener al menos ${edadMin} años`
                });
            }
        }

        // Construir payload solo con campos provistos
        const payload = {};
        if (nombre_completo) payload.nombre_completo = limpiarTexto(nombre_completo);
        if (telefono) payload.telefono = limpiarTexto(telefono);
        if (email) payload.email = normalizarEmail(email);
        if (vehiculo) payload.vehiculo = limpiarTexto(vehiculo);
        if (marca_vehiculo) payload.marca_vehiculo = limpiarTexto(marca_vehiculo);
        if (modelo_vehiculo) payload.modelo_vehiculo = limpiarTexto(modelo_vehiculo);
        if (anio_vehiculo) payload.anio_vehiculo = parseInt(anio_vehiculo);
        if (color_vehiculo) payload.color_vehiculo = limpiarTexto(color_vehiculo);
        if (placas) payload.placas = limpiarTexto(placas).toUpperCase();
        if (numero_serie) payload.numero_serie = limpiarTexto(numero_serie);
        if (pais) payload.pais = String(pais).toUpperCase();
        if (ciudad) payload.ciudad = limpiarTexto(ciudad);
        if (colonia_principal) payload.colonia_principal = limpiarTexto(colonia_principal);
        if (radio_cobertura_km) payload.radio_cobertura_km = parseInt(radio_cobertura_km);
        if (fecha_nacimiento) payload.fecha_nacimiento = fecha_nacimiento;
        if (curp) {
            payload.curp = normalizarCURP(curp);
            payload.curp_valida = validarCURPLocal(curp);
        }
        if (genero) payload.genero = limpiarTexto(genero);
        if (telefono_emergencia) payload.telefono_emergencia = limpiarTexto(telefono_emergencia);
        if (contacto_emergencia_nombre) payload.contacto_emergencia_nombre = limpiarTexto(contacto_emergencia_nombre);
        if (codigo_postal) payload.codigo_postal = limpiarTexto(codigo_postal);
        if (direccion_completa) payload.direccion_completa = limpiarTexto(direccion_completa);

        payload.updated_at = new Date().toISOString();

        // Actualizar o crear
        const { data: repExistente } = await supabaseAdmin
            .from('mercado_repartidores')
            .select('id')
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (repExistente) {
            // Actualizar
            const { error: errUpd } = await supabaseAdmin
                .from('mercado_repartidores')
                .update(payload)
                .eq('usuario_id', usuarioId);

            if (errUpd) throw errUpd;
        } else {
            // Crear nuevo
            payload.usuario_id = usuarioId;
            payload.estado_verificacion = 'pendiente_registro';

            const { error: errIns } = await supabaseAdmin
                .from('mercado_repartidores')
                .insert(payload);

            if (errIns) throw errIns;
        }

        return res.json({
            ok: true,
            mensaje: 'Datos actualizados correctamente'
        });

    } catch (e) {
        logError('Error actualizar-datos:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// EXPORT
// ================================================================
module.exports = router;