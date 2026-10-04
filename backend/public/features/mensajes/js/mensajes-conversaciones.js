// ================================================================
// ✅ v3.8: abrirConversacionBot ULTRA-blindada (garantía: NUNCA lanza)
// ================================================================
async function abrirConversacionBot() {
    // ============================================================
    // NIVEL 0: Todo el cuerpo envuelto en try/catch raíz
    // ============================================================
    try {
        console.log('[Chat v3.8] abrirConversacionBot: iniciando');

        // --------------------------------------------------------
        // NIVEL 1: Verificar DOM
        // --------------------------------------------------------
        var box = document.getElementById('messages');
        if (!box) {
            console.error('[Chat v3.8] ❌ #messages no existe en el DOM');
            return false;
        }

        // --------------------------------------------------------
        // NIVEL 2: Verificar globales críticos
        // --------------------------------------------------------
        if (typeof BOT_UUID === 'undefined' || !BOT_UUID) {
            console.error('[Chat v3.8] ❌ BOT_UUID no definido');
            _renderizarErrorBot(box, 'Configuración incompleta: BOT_UUID');
            return false;
        }

        if (typeof BOT_ID === 'undefined' || !BOT_ID) {
            console.warn('[Chat v3.8] ⚠️ BOT_ID no definido (usando BOT_UUID)');
        }

        if (typeof db === 'undefined' || !db) {
            console.error('[Chat v3.8] ❌ db no inicializado');
            _renderizarErrorBot(box, 'Sistema no inicializado. Recarga la página.');
            return false;
        }

        if (!user || !user.id) {
            console.error('[Chat v3.8] ❌ user no autenticado');
            _renderizarErrorBot(box, 'No hay sesión activa. Recarga la página.');
            return false;
        }

        console.log('[Chat v3.8] user.id =', user.id);
        console.log('[Chat v3.8] BOT_UUID =', BOT_UUID);

        // --------------------------------------------------------
        // NIVEL 3: Limpiar y asegurar UI (dentro de try propio)
        // --------------------------------------------------------
        try {
            if (typeof _limpiarMensajes === 'function') {
                _limpiarMensajes(box);
            } else {
                box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
            }
        } catch (e) {
            console.warn('[Chat v3.8] _limpiarMensajes falló:', e);
        }

        var anchor = null;
        try {
            if (typeof _asegurarUIBase === 'function') {
                anchor = _asegurarUIBase(box);
            } else {
                anchor = box.querySelector('#scrollAnchor');
                if (!anchor) {
                    anchor = document.createElement('div');
                    anchor.id = 'scrollAnchor';
                    box.appendChild(anchor);
                }
            }
        } catch (e) {
            console.error('[Chat v3.8] ❌ _asegurarUIBase falló:', e);
            _renderizarErrorBot(box, 'Error creando interfaz: ' + e.message);
            return false;
        }

        if (!anchor) {
            console.error('[Chat v3.8] ❌ anchor nulo');
            _renderizarErrorBot(box, 'Error de UI: anchor no creado');
            return false;
        }

        // --------------------------------------------------------
        // NIVEL 4: Emitir evento (opcional, no bloquea)
        // --------------------------------------------------------
        try {
            window.dispatchEvent(new CustomEvent('marquinhos:chatAbierto', {
                detail: { userId: user.id, botId: BOT_UUID }
            }));
        } catch (e) {}

        // --------------------------------------------------------
        // NIVEL 5: Cargar historial de Supabase
        // --------------------------------------------------------
        console.log('[Chat v3.8] Consultando historial...');
        var historial = [];
        var errorHistorial = null;

        try {
            var r = await db.from('mensajes_chat')
                .select('*')
                .eq('eliminado', false)
                .or(
                    'and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),' +
                    'and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')'
                )
                .order('created_at', { ascending: true })
                .limit(200);

            if (r && r.error) {
                errorHistorial = r.error;
                console.error('[Chat v3.8] ❌ Error Supabase historial:', r.error);
            } else {
                historial = (r && r.data) ? r.data : [];
                console.log('[Chat v3.8] Historial:', historial.length, 'mensajes');
            }
        } catch (e) {
            errorHistorial = e;
            console.error('[Chat v3.8] ❌ Excepción cargando historial:', e);
        }

        // --------------------------------------------------------
        // NIVEL 6: Verificar contexto (usuario no cambió de chat)
        // --------------------------------------------------------
        if (!current || !_esConversacionBot()) {
            console.warn('[Chat v3.8] Usuario cambió de chat, abortando');
            return false;
        }
        if (!document.body.contains(box)) {
            console.warn('[Chat v3.8] box fuera del DOM');
            return false;
        }

        // --------------------------------------------------------
        // NIVEL 7: Reobtener anchor (por si algo lo movió)
        // --------------------------------------------------------
        anchor = box.querySelector('#scrollAnchor');
        if (!anchor) {
            try {
                anchor = typeof _asegurarUIBase === 'function' ? _asegurarUIBase(box) : null;
            } catch (e) {}
            if (!anchor) {
                console.error('[Chat v3.8] ❌ Anchor perdido');
                return false;
            }
        }

        // --------------------------------------------------------
        // NIVEL 8: Si hubo error de historial, mostrarlo y salir
        // --------------------------------------------------------
        if (errorHistorial) {
            var msgHist = errorHistorial.message || 'desconocido';
            console.error('[Chat v3.8] Historial falló:', msgHist);
            _renderizarErrorBot(box, 'Error al cargar historial: ' + msgHist);
            return false;
        }

        // --------------------------------------------------------
        // NIVEL 9: Sin historial → bienvenida
        // --------------------------------------------------------
        if (!historial.length) {
            console.log('[Chat v3.8] Sin historial, mostrando bienvenida');
            try {
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
                console.log('[Chat v3.8] ✅ Bienvenida renderizada');
                return true;
            } catch (e) {
                console.error('[Chat v3.8] ❌ Error insertando bienvenida:', e);
                _renderizarErrorBot(box, 'Error al renderizar bienvenida');
                return false;
            }
        }

        // --------------------------------------------------------
        // NIVEL 10: Cargar URLs firmadas con fallback total
        // --------------------------------------------------------
        console.log('[Chat v3.8] Cargando URLs firmadas para', historial.length, 'mensajes');

        var results = await Promise.allSettled(
            historial.map(function(m) {
                try {
                    if (typeof getSignedUrlForMessage === 'function') {
                        var p = getSignedUrlForMessage(m);
                        return Promise.resolve(p).catch(function() {
                            return m.imagen_url || null;
                        });
                    }
                    return Promise.resolve(m.imagen_url || null);
                } catch (e) {
                    return Promise.resolve(m.imagen_url || null);
                }
            })
        );

        // --------------------------------------------------------
        // NIVEL 11: Verificar contexto de nuevo
        // --------------------------------------------------------
        if (!current || !_esConversacionBot()) {
            console.warn('[Chat v3.8] Usuario cambió de chat durante carga');
            return false;
        }
        if (!document.body.contains(box)) return false;

        anchor = box.querySelector('#scrollAnchor');
        if (!anchor) {
            try {
                anchor = typeof _asegurarUIBase === 'function' ? _asegurarUIBase(box) : null;
            } catch (e) {}
            if (!anchor) return false;
        }

        // --------------------------------------------------------
        // NIVEL 12: Renderizar mensajes uno por uno (aislado)
        // --------------------------------------------------------
        console.log('[Chat v3.8] Renderizando', historial.length, 'mensajes');
        var insertados = 0;
        var errores = 0;

        for (var i = 0; i < historial.length; i++) {
            var m = historial[i];

            try {
                if (typeof _yaRenderizado === 'function' && _yaRenderizado(m.id)) {
                    continue;
                }
                if (typeof _marcarRenderizado === 'function') {
                    _marcarRenderizado(m.id);
                }

                var url = (results[i] && results[i].status === 'fulfilled')
                    ? results[i].value
                    : (m.imagen_url || null);

                var esMio = (typeof _esMensajeMio === 'function' && _esMensajeMio(m))
                    || (typeof _esAutoEnvio === 'function' && _esAutoEnvio(m));

                var html;
                if (typeof messageHTML === 'function') {
                    html = messageHTML(m, esMio, url);
                } else {
                    // Fallback mínimo si messageHTML no existe
                    html = '<div class="bubblewrap ' + (esMio ? 'sent' : 'received') + '">' +
                        '<div class="bubble">' + String(m.contenido || '') + '</div>' +
                    '</div>';
                }

                anchor.insertAdjacentHTML('beforebegin', html);
                insertados++;

            } catch (e) {
                errores++;
                console.error('[Chat v3.8] Error renderizando mensaje', m.id, ':', e);
            }
        }

        // --------------------------------------------------------
        // NIVEL 13: Post-renderizado
        // --------------------------------------------------------
        try {
            isUserAtBottom = true;
            if (typeof observarCargaMultimedia === 'function') {
                observarCargaMultimedia(box);
            }
            if (typeof scrollToBottom === 'function') {
                scrollToBottom(true);
            }
        } catch (e) {
            console.warn('[Chat v3.8] Error en post-renderizado:', e);
        }

        console.log('[Chat v3.8] ✅ Renderizado: ' + insertados + ' ok, ' + errores + ' errores');

        // --------------------------------------------------------
        // NIVEL 14: Si nada se renderizó y hubo errores, avisar
        // --------------------------------------------------------
        if (insertados === 0 && errores > 0) {
            _renderizarErrorBot(box, 'No se pudo renderizar ningún mensaje. Revisa la consola.');
            return false;
        }

        return true;

    } catch (e) {
        // ============================================================
        // NIVEL FINAL: Atrapar CUALQUIER excepción no controlada
        // ============================================================
        console.error('[Chat v3.8] 💥 Excepción general NO capturada:', e);
        console.error('[Chat v3.8] Stack:', e && e.stack);
        console.error('[Chat v3.8] Tipo:', e && e.name);

        try {
            var boxFallback = document.getElementById('messages');
            if (boxFallback) {
                _renderizarErrorBot(boxFallback, 'Error inesperado: ' + (e && e.message ? e.message : 'desconocido'));
            }
        } catch (e2) {
            console.error('[Chat v3.8] Ni siquiera el fallback funcionó:', e2);
        }

        return false;
    }
}

// ================================================================
// ✅ v3.8: Helper para mostrar errores en el chat (nunca lanza)
// ================================================================
function _renderizarErrorBot(box, mensaje) {
    try {
        if (!box) {
            box = document.getElementById('messages');
        }
        if (!box) {
            console.error('[Chat v3.8] _renderizarErrorBot: box es null');
            return;
        }

        var anchor = box.querySelector('#scrollAnchor');
        if (!anchor) {
            try {
                if (typeof _asegurarUIBase === 'function') {
                    anchor = _asegurarUIBase(box);
                }
            } catch (e) {}
        }
        if (!anchor) {
            console.error('[Chat v3.8] _renderizarErrorBot: anchor es null');
            return;
        }

        // Escapar el mensaje de forma segura
        var msgEscapado = String(mensaje)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

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
        console.error('[Chat v3.8] _renderizarErrorBot TAMBIÉN falló:', e);
    }
}