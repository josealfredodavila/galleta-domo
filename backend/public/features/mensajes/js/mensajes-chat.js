// ================================================================
// ✅ v3.7: abrirConversacionBot ULTRA-blindada
// ================================================================
async function abrirConversacionBot() {
    console.log('[Chat v3.7] abrirConversacionBot: iniciando');

    var box = $('messages');
    if (!box) {
        console.error('[Chat v3.7] ❌ #messages no existe');
        return false;
    }

    try {
        // ---- Verificar user ----
        if (!user) {
            console.error('[Chat v3.7] ❌ user es null');
            _renderizarErrorBot(box, 'No hay sesión activa. Recarga la página.');
            return false;
        }

        if (!user.id) {
            console.error('[Chat v3.7] ❌ user.id está vacío');
            _renderizarErrorBot(box, 'Sesión sin usuario. Recarga la página.');
            return false;
        }

        console.log('[Chat v3.7] user.id =', user.id);
        console.log('[Chat v3.7] BOT_UUID =', BOT_UUID);

        // ---- Verificar db ----
        if (typeof db === 'undefined' || !db) {
            console.error('[Chat v3.7] ❌ db es null/undefined');
            _renderizarErrorBot(box, 'Sistema no inicializado. Recarga la página.');
            return false;
        }

        // ---- Limpiar y asegurar UI ----
        _limpiarMensajes(box);
        var anchor = _asegurarUIBase(box);
        if (!anchor) {
            console.error('[Chat v3.7] ❌ No se pudo crear anchor');
            _renderizarErrorBot(box, 'Error creando interfaz. Recarga la página.');
            return false;
        }

        // ---- Emitir evento ----
        try {
            window.dispatchEvent(new CustomEvent('marquinhos:chatAbierto', {
                detail: { userId: user.id, botId: BOT_UUID }
            }));
        } catch (e) {}

        // ---- Cargar historial ----
        console.log('[Chat v3.7] Consultando historial...');
        var historial = [];
        var errorHistorial = null;

        try {
            var r = await db.from('mensajes_chat')
                .select('*')
                .eq('eliminado', false)
                .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')')
                .order('created_at', { ascending: true })
                .limit(200);

            if (r.error) {
                errorHistorial = r.error;
                console.error('[Chat v3.7] Error Supabase historial:', r.error);
            } else {
                historial = r.data || [];
                console.log('[Chat v3.7] Historial:', historial.length, 'mensajes');
            }
        } catch (e) {
            errorHistorial = e;
            console.error('[Chat v3.7] Excepción cargando historial:', e);
        }

        // ---- Verificar contexto ----
        if (!current || !_esConversacionBot()) {
            console.warn('[Chat v3.7] Usuario cambió de chat, abortando');
            return false;
        }
        if (!document.body.contains(box)) {
            console.warn('[Chat v3.7] box fuera del DOM');
            return false;
        }

        // ---- Reobtener anchor ----
        anchor = box.querySelector('#scrollAnchor');
        if (!anchor) {
            anchor = _asegurarUIBase(box);
            if (!anchor) {
                console.error('[Chat v3.7] ❌ Anchor perdido');
                return false;
            }
        }

        // ---- Mostrar error de historial si lo hay ----
        if (errorHistorial) {
            _renderizarErrorBot(box, 'Error al cargar historial: ' + (errorHistorial.message || 'desconocido'));
            return false;
        }

        // ---- Sin historial → bienvenida ----
        if (!historial.length) {
            console.log('[Chat v3.7] Sin historial, mostrando bienvenida');
            anchor.insertAdjacentHTML('beforebegin',
                '<div class="bubblewrap received">' +
                    '<div class="bubble">' +
                        '<div class="bubble-bot-info">✦ MARQUINHOS</div>' +
                        '¡Hola! 👋 Soy Marquinhos, el asistente de Sariel\'s. Puedes:<br><br>' +
                        '◈ Escribirme un mensaje de texto<br>' +
                        '◈ Enviarme una nota de voz<br>' +
                        '◈ Hablarme con el botón 🔊 (te responderé con voz)<br><br>' +
                        '¿En qué te puedo ayudar hoy?' +
                    '</div>' +
                '</div>');
            isUserAtBottom = true;
            scrollToBottom(true);
            console.log('[Chat v3.7] ✅ Bienvenida renderizada');
            return true;
        }

        // ---- Cargar URLs firmadas (con fallback) ----
        console.log('[Chat v3.7] Cargando URLs firmadas...');
        var results = await Promise.allSettled(
            historial.map(function(m) {
                try {
                    if (typeof getSignedUrlForMessage === 'function') {
                        return getSignedUrlForMessage(m);
                    }
                    // Fallback: sin signed URL
                    return Promise.resolve(m.imagen_url || null);
                } catch (e) {
                    console.warn('[Chat v3.7] Error en getSignedUrl:', e);
                    return Promise.resolve(m.imagen_url || null);
                }
            })
        );

        // ---- Verificar contexto de nuevo ----
        if (!current || !_esConversacionBot()) {
            console.warn('[Chat v3.7] Usuario cambió de chat durante carga, abortando');
            return false;
        }
        if (!document.body.contains(box)) return false;

        anchor = box.querySelector('#scrollAnchor');
        if (!anchor) {
            anchor = _asegurarUIBase(box);
            if (!anchor) return false;
        }

        // ---- Renderizar mensajes ----
        console.log('[Chat v3.7] Renderizando', historial.length, 'mensajes');
        var insertados = 0;
        var errores = 0;

        historial.forEach(function(m, i) {
            try {
                if (_yaRenderizado(m.id)) return;
                _marcarRenderizado(m.id);

                var url = (results[i] && results[i].status === 'fulfilled')
                    ? results[i].value
                    : (m.imagen_url || null);

                var esMio = _esMensajeMio(m) || _esAutoEnvio(m);
                var html = messageHTML(m, esMio, url);
                anchor.insertAdjacentHTML('beforebegin', html);
                insertados++;
            } catch (e) {
                errores++;
                console.error('[Chat v3.7] Error renderizando mensaje', m.id, ':', e);
            }
        });

        isUserAtBottom = true;
        observarCargaMultimedia(box);
        scrollToBottom(true);

        console.log('[Chat v3.7] ✅ Renderizado: ' + insertados + ' ok, ' + errores + ' errores');

        if (insertados === 0 && errores > 0) {
            _renderizarErrorBot(box, 'No se pudo renderizar ningún mensaje. Revisa la consola.');
            return false;
        }

        return true;

    } catch (e) {
        console.error('[Chat v3.7] 💥 Excepción general:', e);
        console.error('[Chat v3.7] Stack:', e && e.stack);
        _renderizarErrorBot(box, 'Error inesperado: ' + (e.message || 'desconocido'));
        return false;
    }
}

// ================================================================
// ✅ v3.7: Helper para mostrar errores en el chat
// ================================================================
function _renderizarErrorBot(box, mensaje) {
    try {
        if (!box) box = $('messages');
        if (!box) return;

        var anchor = box.querySelector('#scrollAnchor');
        if (!anchor) anchor = _asegurarUIBase(box);
        if (!anchor) return;

        // Escapar el mensaje
        var msgEscapado = String(mensaje)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        anchor.insertAdjacentHTML('beforebegin',
            '<div class="bubblewrap received" style="opacity:0.9;">' +
                '<div class="bubble" style="border:1px solid var(--danger);background:rgba(255,51,102,0.08);">' +
                    '<div class="bubble-bot-info">✦ MARQUINHOS</div>' +
                    '<div style="color:var(--danger);font-size:.8rem;">' +
                        '⚠️ ' + msgEscapado +
                    '</div>' +
                '</div>' +
            '</div>');
    } catch (e) {
        console.error('[Chat v3.7] Error al renderizar mensaje de error:', e);
    }
}