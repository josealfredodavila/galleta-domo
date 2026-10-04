// ================================================================
// MENSAJES · CHAT
// ================================================================
// Envío, renderizado, scroll, markRead, suscripciones realtime.
// Depende de: config, utils, auth, conversaciones.
// ================================================================

// ================================================================
// RENDERIZAR MENSAJES (limpiar y pintar de nuevo)
// ================================================================
async function renderMessages(rows) {
    var box = $('messages');
    if (!box) return;

    // Limpiar
    box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
    box.querySelectorAll('.empty').forEach(function(el) { el.remove(); });

    // Asegurar anchor
    var anchor = box.querySelector('#scrollAnchor');
    if (!anchor) {
        anchor = document.createElement('div');
        anchor.id = 'scrollAnchor';
        box.appendChild(anchor);
    }

    if (!rows || !rows.length) {
        anchor.insertAdjacentHTML('beforebegin',
            '<div class="empty"><strong>◈</strong><div>Sin mensajes</div><small>Envía el primer mensaje</small></div>');
        return;
    }

    // Firmar URLs si es necesario
    var signedUrls = await Promise.all(rows.map(function(m) {
        return getSignedUrlForMessage(m);
    }));

    rows.forEach(function(m, i) {
        anchor.insertAdjacentHTML('beforebegin',
            messageHTML(m, m.remitente_id === user.id, signedUrls[i]));
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

// ================================================================
// HTML DE UN MENSAJE
// ================================================================
function messageHTML(m, sent, signedUrl) {
    var body = esc(limpiarMarkdown(m.contenido || ''));
    var urlToUse = signedUrl || m.imagen_url;

    if (urlToUse) {
        if (m.tipo === 'imagen') {
            body = '<img src="' + esc(urlToUse) + '" alt="' + esc(m.nombre_archivo || 'Imagen') + '" loading="lazy">';
        } else if (m.tipo === 'video') {
            body = '<video controls playsinline src="' + esc(urlToUse) + '"></video>';
        } else if (m.tipo === 'audio') {
            body = '<audio controls preload="metadata" src="' + esc(urlToUse) + '"></audio>';
        } else {
            var displayName = esc(m.nombre_archivo || limpiarMarkdown(m.contenido) || 'Archivo');
            body = '📎 <a href="' + esc(urlToUse) + '" target="_blank" rel="noopener" style="color:var(--gold)">' + displayName + '</a>';
        }
    }

    var esBotRecibido = !sent && (m.es_bot || m.bot_message);
    var headerBot = esBotRecibido ? '<div class="bubble-bot-info">✦ MARQUINHOS</div>' : '';

    var meta = '';
    if (m.created_at) {
        meta = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (sent) {
        meta += m.leido ? ' · ◆◆' : ' · ◈◈';
    }

    return '<div class="bubblewrap ' + (sent ? 'sent' : 'received') + '">' +
        '<div class="bubble">' + headerBot + body + '</div>' +
        '<div class="meta">' + esc(meta) + '</div>' +
    '</div>';
}

// ================================================================
// APPEND DE UN SOLO MENSAJE (para realtime o envío)
// ================================================================
async function append(m, sent) {
    var box = $('messages');
    if (!box) return;

    var empty = box.querySelector('.empty');
    if (empty) empty.remove();

    var signedUrl = await getSignedUrlForMessage(m);
    var anchor = box.querySelector('#scrollAnchor');
    var html = messageHTML(m, sent, signedUrl);

    if (anchor) {
        anchor.insertAdjacentHTML('beforebegin', html);
    } else {
        box.insertAdjacentHTML('beforeend', html);
    }

    observarCargaMultimedia(box);

    if (!sent && !isUserAtBottom) {
        unreadCount++;
        actualizarFlecha();
        return;
    }

    isUserAtBottom = true;
    scrollToBottom(true);
}

// ================================================================
// ENVIAR MENSAJE DE TEXTO
// ================================================================
async function sendMessage(text) {
    if (!current || !text || !text.trim()) return;
    if (!await auth()) return;

    var textoLimpio = text.trim();
    var input = $('messageInput');
    if (input) input.value = '';

    // ============================================================
    // CASO BOT
    // ============================================================
    if (current.bot) {
        var userMsg = {
            contenido: textoLimpio,
            created_at: new Date().toISOString(),
            tipo: 'texto',
            remitente_id: user.id,
            leido: true
        };

        try {
            var ins = await db.from('mensajes_chat').insert({
                remitente_id: user.id,
                destinatario_id: BOT_UUID,
                contenido: textoLimpio,
                tipo: 'texto',
                leido: true,
                editado: false,
                eliminado: false
            }).select('*').single();

            if (!ins.error) userMsg = ins.data;
        } catch (e) {
            console.warn('[Mensajes] No se pudo guardar el mensaje del usuario:', e);
        }

        append(userMsg, true);
        mostrarTypingBot();

        try {
            var historial = await cargarHistorialParaBot();
            var respuesta = await preguntarAlBot(textoLimpio, historial);
            quitarTypingBot();

            var botMsg = {
                contenido: respuesta,
                created_at: new Date().toISOString(),
                tipo: 'texto',
                remitente_id: BOT_UUID,
                leido: true,
                es_bot: true
            };

            try {
                var insBot = await db.from('mensajes_chat').insert({
                    remitente_id: BOT_UUID,
                    destinatario_id: user.id,
                    contenido: respuesta,
                    tipo: 'texto',
                    leido: true,
                    editado: false,
                    eliminado: false
                }).select('*').single();

                if (!insBot.error) {
                    botMsg = insBot.data;
                    botMsg.es_bot = true;
                }
            } catch (e) {
                console.warn('[Mensajes] No se pudo guardar la respuesta del bot:', e);
            }

            append(botMsg, false);
            loadConversations();
        } catch (e) {
            quitarTypingBot();
            console.error('[Mensajes] Error Marquinhos:', e);

            var errorMsg = {
                contenido: '⚠️ ' + (e.message || 'Ups, tuve un problema.'),
                created_at: new Date().toISOString(),
                tipo: 'texto',
                remitente_id: BOT_UUID,
                leido: true,
                es_bot: true
            };
            append(errorMsg, false);
        }
        return;
    }

    // ============================================================
    // CASO CHAT NORMAL
    // ============================================================
    var r = await db.from('mensajes_chat').insert({
        remitente_id: user.id,
        destinatario_id: current.id,
        contenido: textoLimpio,
        tipo: 'texto',
        leido: false,
        editado: false,
        eliminado: false
    }).select('*').single();

    if (r.error) {
        console.error(r.error);
        toast('❌ Error al enviar mensaje', 'error');
        return;
    }

    await append(r.data, true);
    loadConversations();
}

// ================================================================
// MARCAR MENSAJES COMO LEÍDOS
// ================================================================
async function markRead(id) {
    if (!user || id === BOT_ID) return;
    try {
        await db.from('mensajes_chat')
            .update({ leido: true })
            .eq('remitente_id', id)
            .eq('destinatario_id', user.id)
            .eq('leido', false)
            .eq('eliminado', false);
    } catch (e) {}
}

// ================================================================
// SUSCRIPCIÓN REALTIME A MENSAJES DE UNA CONVERSACIÓN
// ================================================================
function subscribeMessages(id) {
    if (id === BOT_ID) return;

    if (msgChannel) {
        db.removeChannel(msgChannel);
        msgChannel = null;
    }

    msgChannel = db
        .channel('chat-' + id)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes_chat'
        }, function(p) {
            var m = p.new;
            if (current && current.id === id && m.remitente_id === id && m.destinatario_id === user.id) {
                append(m, false);
                markRead(id);
            }
        })
        .subscribe();
}

// ================================================================
// SCROLL — comportamiento
// ================================================================
function scrollToBottom(force) {
    force = force || false;
    var box = $('messages');
    if (!box) return;
    if (!force && !isUserAtBottom) return;

    var doScroll = function() {
        var anchor = document.getElementById('scrollAnchor');
        if (anchor) {
            anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
        } else {
            box.scrollTop = box.scrollHeight;
        }
    };

    doScroll();
    requestAnimationFrame(doScroll);

    if (scrollRetryTimer) clearInterval(scrollRetryTimer);
    var intentos = 0;
    scrollRetryTimer = setInterval(function() {
        intentos++;
        if (force || isUserAtBottom) doScroll();
        if (intentos >= 10) {
            clearInterval(scrollRetryTimer);
            scrollRetryTimer = null;
        }
    }, 100);

    if (force || isUserAtBottom) {
        ocultarFlechaNuevos();
    }
}

function detectarSiEstaAbajo() {
    var box = $('messages');
    if (!box) return;
    var distanciaAlFondo = box.scrollHeight - box.scrollTop - box.clientHeight;
    var estabaAbajo = isUserAtBottom;
    isUserAtBottom = distanciaAlFondo < SCROLL_THRESHOLD;
    if (isUserAtBottom && !estabaAbajo) {
        ocultarFlechaNuevos();
    }
}

function actualizarFlecha() {
    var btn = $('scrollDownBtn');
    var badge = $('newMsgBadge');
    if (!btn) return;

    if (unreadCount > 0) {
        btn.classList.add('has-new');
        if (badge) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'flex';
        }
    } else {
        btn.classList.remove('has-new');
        if (badge) badge.style.display = 'none';
    }
}

function ocultarFlechaNuevos() {
    unreadCount = 0;
    actualizarFlecha();
}

// ================================================================
// OBSERVAR CARGA DE MULTIMEDIA (para re-scroll al cargar imágenes)
// ================================================================
function observarCargaMultimedia(box) {
    if (!box) return;
    var media = box.querySelectorAll('img, audio, video');
    media.forEach(function(el) {
        if (el.dataset.scrollListener) return;
        el.dataset.scrollListener = '1';

        var onLoad = function() {
            if (isUserAtBottom) {
                var anchor = document.getElementById('scrollAnchor');
                if (anchor) {
                    anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
                } else {
                    box.scrollTop = box.scrollHeight;
                }
            }
        };

        el.addEventListener('load', onLoad, { once: true });
        el.addEventListener('loadedmetadata', onLoad, { once: true });
        el.addEventListener('error', onLoad, { once: true });
    });
}

// ================================================================
// FIRMAR URL DE MENSAJE (para buckets privados)
// ================================================================
async function getSignedUrlForMessage(m) {
    if (!m || !m.imagen_url) return null;
    var raw = m.imagen_url;

    // URL pública directa
    if (raw.indexOf('http') === 0) {
        if (raw.indexOf('/object/public/') !== -1) return raw;

        try {
            var url = new URL(raw);
            var parts = url.pathname.split('/').filter(Boolean);
            var idx = parts.findIndex(function(p) {
                return p === 'chat-audio' || p === 'chat-attachments';
            });
            if (idx === -1) return raw;

            var bucket = parts[idx];
            var filePath = parts.slice(idx + 1).join('/');
            var r = await db.storage.from(bucket).createSignedUrl(filePath, 3600);
            if (r.error) return raw;
            return r.data.signedUrl;
        } catch (e) {
            return raw;
        }
    }

    // Formato interno: bucket://bucket/path
    if (raw.indexOf('bucket://') === 0) {
        try {
            var withoutPrefix = raw.replace('bucket://', '');
            var slashIdx = withoutPrefix.indexOf('/');
            if (slashIdx === -1) return null;

            var bucket2 = withoutPrefix.slice(0, slashIdx);
            var filePath2 = withoutPrefix.slice(slashIdx + 1);
            var r2 = await db.storage.from(bucket2).createSignedUrl(filePath2, 3600);
            if (r2.error) {
                console.warn('[Mensajes] Error firmando:', r2.error);
                return null;
            }
            return r2.data.signedUrl;
        } catch (e) {
            console.warn('[Mensajes] Error parseando ruta:', e);
            return null;
        }
    }

    return null;
}

console.log('[Mensajes] ✅ Chat cargado');