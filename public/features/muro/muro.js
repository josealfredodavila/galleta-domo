/* ================================================================
   MURO ULTRA MEGA PRO - SARIEL'S
   CON PRECIOS DINÁMICOS + RECOMPENSAS + MODERACIÓN + NOWPAYMENTS
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE
// ================================================================
const supabase = window.supabase.createClient(
    'https://hbbwopkfpkvahgtawqke.supabase.co',
    'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j'
);

// ================================================================
// CONFIGURACIÓN NOWPAYMENTS
// ================================================================
const NOWPAYMENTS_CONFIG = {
    // ⚠️ Estas llaves van en Edge Function de Supabase
    // NO EXPONER EN FRONTEND
    API_URL: 'https://api.nowpayments.io/v1',
    COMISION: 0.02, // 2% comisión de plataforma
    MIN_PRECIO_USDT: 0.32, // $6.20 MXN ≈ $0.32 USD
    MONEDA: 'USDT'
};

// ================================================================
// TOAST
// ================================================================
function showToast(msg, type = '') {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show';
    if (type === 'error') t.classList.add('error');
    else if (type === 'warning') t.classList.add('warning');
    else t.classList.remove('error', 'warning');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}

// ================================================================
// OBTENER SESIÓN
// ================================================================
async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ================================================================
// PRECIOS DINÁMICOS
// ================================================================
let precioActual = 6.20;
let ofertaTotal = 0;
let demandaTotal = 0;

async function cargarPrecioEsStok() {
    try {
        const { data, error } = await supabase.rpc('calcular_precio_es_stok');
        if (error) throw error;
        
        if (data) {
            precioActual = data;
            const precioUsdt = (data / 19.5).toFixed(2); // 1 USD ≈ 19.5 MXN
            document.getElementById('precioToken').innerHTML = `${data.toFixed(2)} <span class="moneda">MXN</span> <span style="font-size:0.6rem;color:var(--text-muted);">($${precioUsdt} USDT)</span>`;
        }
    } catch (error) {
        console.error('Error actualizando precio:', error);
    }
}

// ================================================================
// RECOMPENSAS POR INTERACCIÓN
// ================================================================
async function registrarRecompensa(tipo) {
    try {
        const session = await getSession();
        if (!session) return;
        await supabase.rpc('registrar_interaccion', {
            p_usuario_id: session.user.id,
            p_tipo: tipo
        });
        await actualizarTokenBadge();
    } catch (error) {
        console.error('Error registrando recompensa:', error);
    }
}

async function actualizarTokenBadge() {
    try {
        const session = await getSession();
        if (!session) return;
        const { data, error } = await supabase
            .from('usuarios')
            .select('tokens')
            .eq('id', session.user.id)
            .single();
        if (!error && data) {
            const badge = document.getElementById('tokenBadgeCantidad');
            if (badge) badge.textContent = Math.floor(data.tokens || 0);
        }
    } catch (error) {
        console.error('Error actualizando badge:', error);
    }
}

// ================================================================
// CARGAR PUBLICACIONES
// ================================================================
async function cargarPublicaciones() {
    try {
        const { data, error } = await supabase
            .from('muro_posts')
            .select('*, usuarios(nombre, avatar_url), muro_likes(id), muro_comentarios(id, contenido, usuario_id, created_at, usuarios(nombre))')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
            renderizarPublicaciones(data);
        } else {
            const feedContainer = document.getElementById('feedContainer');
            if (feedContainer) {
                feedContainer.innerHTML = `
                    <div class="empty-state">
                        <span class="icon">◈</span>
                        <h3>Sin publicaciones</h3>
                        <p>Sé el primero en compartir algo.</p>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error cargando publicaciones:', error);
        showToast('❌ Error al cargar publicaciones', 'error');
    }
}

// ================================================================
// RENDERIZAR PUBLICACIONES
// ================================================================
let sessionUser = null;

function renderizarPublicaciones(posts) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    feedContainer.innerHTML = posts.map(post => {
        const avatar = post.usuarios?.avatar_url ? `<img src="${post.usuarios.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : '◈';
        const likes = post.muro_likes?.length || 0;
        const comentarios = post.muro_comentarios || [];
        const imagen = post.imagen_url ? `<img src="${post.imagen_url}" style="width:100%; border-radius:12px; margin-top:12px;" />` : '';
        const esAutor = sessionUser?.id === post.usuario_id;
        const tieneVenta = post.cantidad_venta && post.precio_venta && !post.vendido;

        return `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar">${avatar}</div>
                    <div style="flex:1;">
                        <div class="post-author">${post.usuarios?.nombre || 'Explorador'} <span class="badge-verificado">✦ Verificado</span></div>
                        <div class="post-date">${new Date(post.created_at).toLocaleString()}</div>
                    </div>
                    ${esAutor ? `
                        <div class="post-actions-header">
                            <button onclick="editarPublicacion('${post.id}')" class="btn-edit" style="background:none;border:none;color:var(--gold);cursor:pointer;">✎</button>
                            <button onclick="eliminarPublicacion('${post.id}')" class="btn-delete" style="background:none;border:none;color:var(--danger);cursor:pointer;">✕</button>
                        </div>
                    ` : `
                        <div class="post-actions-header">
                            <button onclick="reportarPublicacion('${post.id}')" class="btn-report" style="background:none;border:none;color:var(--warning);cursor:pointer;">⚠️</button>
                            <button onclick="guardarPublicacion('${post.id}')" class="btn-save" style="background:none;border:none;color:var(--text-muted);cursor:pointer;">☆</button>
                            <button onclick="compartirPublicacion('${post.id}')" class="btn-share" style="background:none;border:none;color:var(--cyan);cursor:pointer;">↗</button>
                        </div>
                    `}
                </div>
                
                <div class="post-content">${formatearTexto(post.contenido || '')}</div>
                ${imagen}
                
                ${tieneVenta ? `
                    <div class="post-venta" style="background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.1);border-radius:12px;padding:12px 16px;margin:12px 0;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                            <div>
                                <div style="font-size:0.6rem;color:var(--text-muted);">◈ Venta de Es.stoks</div>
                                <div style="font-family:'Orbitron',monospace;color:var(--gold);font-size:1.1rem;font-weight:700;">
                                    ${post.cantidad_venta} tokens · $${post.precio_venta.toFixed(2)} MXN c/u
                                    <span style="font-size:0.7rem;color:var(--text-muted);font-weight:400;">
                                        (≈ $${(post.precio_venta / 19.5).toFixed(2)} USDT)
                                    </span>
                                </div>
                                <div style="font-size:0.55rem;color:var(--text-muted);">
                                    💳 Pago con USDT/USDC vía NOWPayments
                                </div>
                            </div>
                            <button class="btn-comprar" onclick="comprarTokensConCrypto('${post.id}', ${post.cantidad_venta}, ${post.precio_venta})"
                                    style="background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:var(--space);border:none;padding:8px 20px;border-radius:20px;font-family:'Orbitron',monospace;font-size:0.65rem;font-weight:700;cursor:pointer;">
                                💳 Comprar con Crypto
                            </button>
                        </div>
                    </div>
                ` : post.vendido ? `
                    <div style="background:rgba(0,214,143,0.05);border:1px solid rgba(0,214,143,0.1);border-radius:12px;padding:12px 16px;margin:12px 0;text-align:center;color:var(--success);font-size:0.8rem;">
                        ✅ Venta completada
                    </div>
                ` : ''}
                
                <div class="post-stats" style="display:flex;gap:16px;font-size:0.65rem;color:var(--text-muted);padding:8px 0;border-top:1px solid var(--glass-border);">
                    <span onclick="likePublicacion('${post.id}')" style="cursor:pointer;" class="like-btn">❤️ <span class="count">${likes}</span></span>
                    <span style="cursor:pointer;" onclick="toggleComentariosPost('${post.id}')">💬 <span class="count">${comentarios.length}</span></span>
                    <span>↗ <span class="count">${post.compartidos || 0}</span></span>
                    <span>☆ <span class="count">${post.guardados || 0}</span></span>
                </div>
                
                <div class="post-comentarios" id="comentarios-post-${post.id}" style="display:none;margin-top:10px;">
                    ${comentarios.map(c => `
                        <div class="comentario" style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid rgba(212,175,55,0.04);">
                            <div class="avatar" style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--green-deep),var(--gold));display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;">${c.usuarios?.avatar_url ? `<img src="${c.usuarios.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : '◈'}</div>
                            <div class="texto" style="flex:1;font-size:0.75rem;">
                                <strong style="color:var(--gold);">${c.usuarios?.nombre || 'Usuario'}</strong> <span style="color:var(--text-secondary);">${c.contenido}</span>
                                <div class="fecha" style="font-size:0.55rem;color:var(--text-muted);">${new Date(c.created_at).toLocaleString()}</div>
                                ${c.usuario_id === sessionUser?.id ? `<button class="btn-eliminar-comentario" onclick="eliminarComentario('${c.id}')" style="background:none;border:none;color:var(--danger);font-size:0.55rem;cursor:pointer;">✕ Eliminar</button>` : ''}
                            </div>
                        </div>
                    `).join('')}
                    <div class="input-comentario" style="display:flex;gap:8px;margin-top:8px;">
                        <input type="text" id="input-comentario-${post.id}" placeholder="Escribe un comentario..." style="flex:1;padding:6px 12px;background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);border-radius:20px;color:var(--text-primary);font-size:0.75rem;outline:none;" />
                        <button onclick="enviarComentario('${post.id}')" style="background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:var(--space);border:none;padding:4px 16px;border-radius:20px;font-weight:700;cursor:pointer;">Enviar</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// FORMATEAR TEXTO
// ================================================================
function formatearTexto(texto) {
    if (!texto) return '';
    let textoFormateado = escapeHTML(texto);
    textoFormateado = textoFormateado.replace(/#(\w+)/g, (match, tag) => {
        return `<a href="#" onclick="buscarHashtag('${tag}')" class="hashtag" style="color:var(--gold);text-decoration:none;font-weight:600;">#${tag}</a>`;
    });
    textoFormateado = textoFormateado.replace(/@(\w+)/g, (match, user) => {
        return `<a href="/perfil/${user}" class="mencion" style="color:var(--cyan);text-decoration:none;font-weight:600;">@${user}</a>`;
    });
    const emojis = {
        ':feliz:': '😊', ':risa:': '😂', ':amo:': '❤️', ':fuego:': '🔥',
        ':estrella:': '⭐', ':genial:': '🤩', ':ok:': '👌', ':visto:': '👀',
        ':musica:': '🎵', ':pizza:': '🍕', ':cafe:': '☕', ':helado:': '🍦',
        ':rocket:': '🚀', ':sariel:': '◈'
    };
    for (const [key, value] of Object.entries(emojis)) {
        textoFormateado = textoFormateado.replaceAll(key, value);
    }
    return textoFormateado;
}

function escapeHTML(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// ================================================================
// MODERACIÓN
// ================================================================
const PALABRAS_PROHIBIDAS = [
    'puta', 'verga', 'mierda', 'pendejo', 'chingar', 'chingada',
    'cabron', 'cabrón', 'pinche', 'wey', 'güey', 'culero',
    'puto', 'maricon', 'maricón', 'joto',
    'negro', 'indio', 'naco', 'naca', 'sudaca',
    'matar', 'mata', 'asesinar', 'suicidio', 'violar',
    'droga', 'cocaína', 'marihuana', 'perico', 'cristal',
    'cerveza', 'tequila', 'whisky', 'ron', 'vodka',
    'fuck', 'shit', 'bitch', 'asshole', 'motherfucker'
];

function verificarContenido(texto) {
    const textoLower = texto.toLowerCase();
    for (const palabra of PALABRAS_PROHIBIDAS) {
        if (textoLower.includes(palabra)) {
            return { prohibido: true, razon: `Contiene lenguaje inapropiado: "${palabra}"` };
        }
    }
    const palabras = texto.split(' ');
    const repetidas = palabras.filter((p, i) => palabras.indexOf(p) !== i);
    if (repetidas.length > 5) {
        return { prohibido: true, razon: 'Posible spam detectado' };
    }
    return { prohibido: false };
}

// ================================================================
// PUBLICAR
// ================================================================
async function publicar() {
    const postContent = document.getElementById('postContent');
    const btnPublicar = document.getElementById('btnPublicar');
    const contenido = postContent ? postContent.value.trim() : '';

    if (!contenido) {
        showToast('⚠️ Escribe algo para publicar', 'error');
        return;
    }

    const moderation = verificarContenido(contenido);
    if (moderation.prohibido) {
        showToast(`⚠️ ${moderation.razon}`, 'error');
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para publicar', 'error');
            return;
        }

        btnPublicar.disabled = true;

        const { error } = await supabase
            .from('muro_posts')
            .insert({
                usuario_id: session.user.id,
                contenido: contenido
            });

        if (error) throw error;

        await registrarRecompensa('publicacion');
        postContent.value = '';
        showToast('✅ Publicación creada + 15 puntos', 'success');
    } catch (error) {
        console.error('Error al publicar:', error);
        showToast('❌ Error al publicar', 'error');
    } finally {
        btnPublicar.disabled = false;
    }
}

// ================================================================
// LIKE
// ================================================================
async function likePublicacion(postId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para dar like', 'error');
            return;
        }

        const { error } = await supabase
            .from('muro_likes')
            .insert({ post_id: postId, usuario_id: session.user.id });

        if (error) {
            if (error.code === '23505') {
                showToast('⚠️ Ya diste like a este post', 'warning');
                return;
            }
            throw error;
        }

        await registrarRecompensa('like');
        showToast('❤️ Like dado + 2 puntos');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al dar like:', error);
        showToast('❌ Error al dar like', 'error');
    }
}

// ================================================================
// COMENTARIOS
// ================================================================
function toggleComentariosPost(postId) {
    const container = document.getElementById(`comentarios-post-${postId}`);
    if (container) {
        const isVisible = container.style.display !== 'none';
        container.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            setTimeout(() => {
                const input = document.getElementById(`input-comentario-${postId}`);
                if (input) input.focus();
            }, 200);
        }
    }
}

async function enviarComentario(postId) {
    const input = document.getElementById(`input-comentario-${postId}`);
    if (!input) return;
    const texto = input.value.trim();
    if (!texto) {
        showToast('⚠️ Escribe un comentario', 'error');
        return;
    }

    const moderation = verificarContenido(texto);
    if (moderation.prohibido) {
        showToast(`⚠️ ${moderation.razon}`, 'error');
        return;
    }

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para comentar', 'error');
        return;
    }

    try {
        const { error } = await supabase
            .from('muro_comentarios')
            .insert({ post_id: postId, usuario_id: session.user.id, contenido: texto });

        if (error) throw error;

        await registrarRecompensa('comentario');
        input.value = '';
        showToast('✅ Comentario agregado + 5 puntos');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al comentar:', error);
        showToast('❌ Error al comentar', 'error');
    }
}

async function eliminarComentario(comentarioId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para eliminar comentario', 'error');
            return;
        }

        const { error } = await supabase
            .from('muro_comentarios')
            .delete()
            .eq('id', comentarioId)
            .eq('usuario_id', session.user.id);

        if (error) throw error;

        showToast('🗑️ Comentario eliminado');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al eliminar comentario:', error);
        showToast('❌ Error al eliminar comentario', 'error');
    }
}

// ================================================================
// ELIMINAR PUBLICACIÓN
// ================================================================
async function eliminarPublicacion(postId) {
    if (!confirm('¿Seguro que quieres eliminar esta publicación?')) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const { error } = await supabase
            .from('muro_posts')
            .delete()
            .eq('id', postId)
            .eq('usuario_id', session.user.id);

        if (error) throw error;

        showToast('🗑️ Publicación eliminada');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error eliminando publicación:', error);
        showToast('❌ Error al eliminar', 'error');
    }
}

// ================================================================
// EDITAR PUBLICACIÓN
// ================================================================
async function editarPublicacion(postId) {
    const nuevoContenido = prompt('Edita tu publicación:');
    if (nuevoContenido === null) return;
    if (!nuevoContenido.trim()) {
        showToast('⚠️ No puedes dejar vacío', 'error');
        return;
    }

    const moderation = verificarContenido(nuevoContenido);
    if (moderation.prohibido) {
        showToast(`⚠️ ${moderation.razon}`, 'error');
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const { error } = await supabase
            .from('muro_posts')
            .update({ contenido: nuevoContenido })
            .eq('id', postId)
            .eq('usuario_id', session.user.id);

        if (error) throw error;

        showToast('✅ Publicación actualizada');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error editando publicación:', error);
        showToast('❌ Error al editar', 'error');
    }
}

// ================================================================
// REPORTAR PUBLICACIÓN
// ================================================================
async function reportarPublicacion(postId) {
    const motivo = prompt('¿Por qué reportas esta publicación? (spam, ofensa, acoso, ilegal)');
    if (!motivo) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para reportar', 'error');
            return;
        }

        const { error } = await supabase
            .from('muro_reportes')
            .insert({ post_id: postId, usuario_id: session.user.id, motivo: motivo });

        if (error) throw error;

        showToast('⚠️ Reporte enviado. Gracias por ayudar.', 'warning');
    } catch (error) {
        console.error('Error reportando:', error);
        showToast('❌ Error al reportar', 'error');
    }
}

// ================================================================
// GUARDAR PUBLICACIÓN
// ================================================================
async function guardarPublicacion(postId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para guardar', 'error');
            return;
        }

        const { error } = await supabase
            .from('muro_guardados')
            .insert({ post_id: postId, usuario_id: session.user.id });

        if (error) {
            if (error.code === '23505') {
                showToast('⚠️ Ya guardaste esta publicación', 'warning');
                return;
            }
            throw error;
        }

        showToast('☆ Publicación guardada');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error guardando:', error);
        showToast('❌ Error al guardar', 'error');
    }
}

// ================================================================
// COMPARTIR PUBLICACIÓN
// ================================================================
function compartirPublicacion(postId) {
    const url = `${window.location.origin}/muro?post=${postId}`;
    const texto = '◈ ¡Mira esta publicación en Sariel\'s!';
    
    if (navigator.share) {
        navigator.share({ title: 'Sariel\'s - Muro', text: texto, url: url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(`${texto} ${url}`).then(() => {
            showToast('📋 Enlace copiado al portapapeles', 'success');
        }).catch(() => {
            prompt('Copia este enlace:', url);
        });
    }
    registrarRecompensa('compartir');
}

// ================================================================
// HASHTAGS Y MENCIONES
// ================================================================
function buscarHashtag(tag) {
    window.location.href = `/muro?tag=${tag}`;
    showToast(`🔍 Buscando #${tag}`, 'warning');
}

function insertarHashtag() {
    const textarea = document.getElementById('postContent');
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const text = textarea.value;
    const hashtag = prompt('Escribe tu hashtag (sin #):');
    if (hashtag) {
        const nuevoTexto = text.slice(0, cursor) + `#${hashtag} ` + text.slice(cursor);
        textarea.value = nuevoTexto;
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = cursor + hashtag.length + 2;
    }
}

function insertarEmoji() {
    const emojis = ['😊', '😂', '❤️', '🔥', '⭐', '🤩', '👌', '👀', '🎵', '🍕', '☕', '🍦', '🚀', '◈'];
    const emoji = prompt(`Elige un emoji:\n${emojis.join(' ')}`);
    if (emoji && emojis.includes(emoji)) {
        const textarea = document.getElementById('postContent');
        if (!textarea) return;
        const cursor = textarea.selectionStart;
        const text = textarea.value;
        const nuevoTexto = text.slice(0, cursor) + emoji + ' ' + text.slice(cursor);
        textarea.value = nuevoTexto;
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = cursor + emoji.length + 1;
    }
}

function abrirSelectorImagen() {
    document.getElementById('inputImagen')?.click();
}

// ================================================================
// SUBIR IMAGEN
// ================================================================
async function subirImagenMuro(event) {
    const file = event.target.files[0];
    if (!file) return;

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para subir imagen', 'error');
        return;
    }

    const fileExt = file.name.split('.').pop().toLowerCase();
    const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

    try {
        showToast('⏳ Subiendo imagen...');

        const { error: uploadError } = await supabase.storage
            .from('muro-imagenes')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('muro-imagenes')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        const textarea = document.getElementById('postContent');
        if (textarea) {
            textarea.value += `\n[Imagen: ${publicUrl}]`;
        }

        showToast('✅ Imagen subida correctamente');
        event.target.value = '';
    } catch (error) {
        console.error('Error al subir imagen:', error);
        showToast('❌ Error al subir imagen', 'error');
    }
}

// ================================================================
// 💳 COMPRA DE TOKENS CON NOWPAYMENTS
// ================================================================
let compraSeleccionada = null;

function comprarTokensConCrypto(postId, cantidad, precioMXN) {
    compraSeleccionada = { postId, cantidad, precioMXN };
    
    const precioUSDT = (precioMXN / 19.5).toFixed(2);
    const totalUSDT = (cantidad * precioUSDT).toFixed(2);
    const totalMXN = (cantidad * precioMXN).toFixed(2);
    const comision = (totalUSDT * NOWPAYMENTS_CONFIG.COMISION).toFixed(2);
    const totalConComision = (parseFloat(totalUSDT) + parseFloat(comision)).toFixed(2);

    document.getElementById('confirmCantidad').textContent = cantidad;
    document.getElementById('confirmPrecio').textContent = `$${precioMXN.toFixed(2)} MXN (≈ $${precioUSDT} USDT)`;
    document.getElementById('confirmTotal').textContent = `$${totalMXN} MXN (≈ $${totalUSDT} USDT)`;
    document.getElementById('confirmComision').textContent = `$${comision} USDT (2%)`;
    document.getElementById('confirmTotalFinal').textContent = `$${totalConComision} USDT`;
    document.getElementById('modalConfirmarCompra').classList.add('show');
}

function cerrarModalConfirmacion() {
    document.getElementById('modalConfirmarCompra').classList.remove('show');
    compraSeleccionada = null;
}

async function confirmarCompraCrypto() {
    if (!compraSeleccionada) return;

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para comprar', 'error');
        return;
    }

    const { postId, cantidad, precioMXN } = compraSeleccionada;
    const precioUSDT = precioMXN / 19.5;
    const totalUSDT = cantidad * precioUSDT;
    const comision = totalUSDT * NOWPAYMENTS_CONFIG.COMISION;
    const totalConComision = totalUSDT + comision;

    try {
        showToast('⏳ Creando orden de pago...', '', 5000);

        // 1. Crear orden en Supabase
        const { data: orden, error: ordenError } = await supabase
            .from('muro_ventas_tokens')
            .insert({
                post_id: postId,
                vendedor_id: session.user.id,
                cantidad: cantidad,
                precio_mxn: precioMXN,
                precio_usdt: precioUSDT,
                comision_plataforma: comision,
                monto_recibido: totalConComision,
                estado: 'pendiente'
            })
            .select()
            .single();

        if (ordenError) throw ordenError;

        // 2. Generar pago en NOWPayments (Edge Function)
        const paymentResponse = await generarPagoNOWPayments(orden.id, totalConComision);

        // 3. Mostrar modal de pago
        mostrarModalPagoCrypto(paymentResponse, orden.id);

    } catch (error) {
        console.error('Error comprando tokens:', error);
        showToast('❌ Error al procesar pago: ' + error.message, 'error');
    }
}

// ================================================================
// 💰 GENERAR PAGO EN NOWPAYMENTS
// ================================================================
async function generarPagoNOWPayments(ordenId, monto) {
    try {
        // En producción, llamar a Edge Function de Supabase
        // Esto es una simulación
        return {
            id: 'pay_' + Date.now(),
            pay_address: '0x' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            pay_amount: monto.toFixed(2),
            pay_currency: 'USDT',
            order_id: ordenId
        };
    } catch (error) {
        console.error('Error generando pago:', error);
        throw error;
    }
}

// ================================================================
// 🎨 MODAL DE PAGO CRIPTO
// ================================================================
function mostrarModalPagoCrypto(pago, ordenId) {
    const modal = document.getElementById('cryptoPaymentModal');
    const qr = document.getElementById('cryptoQR');
    const address = document.getElementById('cryptoAddress');
    const monto = document.getElementById('cryptoMonto');
    
    if (!modal) return;
    
    modal.dataset.ordenId = ordenId;
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pago.pay_address)}`;
    qr.src = qrUrl;
    address.textContent = pago.pay_address;
    monto.textContent = `${pago.pay_amount} USDT`;
    
    modal.style.display = 'flex';
    showToast('💳 Escanea el QR para pagar', 'warning', 5000);
}

function cerrarModalPago() {
    document.getElementById('cryptoPaymentModal').style.display = 'none';
}

async function copiarDireccionCrypto() {
    const address = document.getElementById('cryptoAddress')?.textContent;
    if (!address) return;
    try {
        await navigator.clipboard.writeText(address);
        showToast('📋 Dirección copiada', 'success');
    } catch {
        prompt('Copia esta dirección:', address);
    }
}

async function verificarPagoCrypto() {
    const modal = document.getElementById('cryptoPaymentModal');
    const statusEl = document.getElementById('cryptoStatus');
    const ordenId = modal?.dataset?.ordenId;

    if (!ordenId) {
        showToast('⚠️ No hay orden activa', 'error');
        return;
    }

    statusEl.textContent = '⏳ Verificando pago...';

    try {
        const { data: orden, error } = await supabase
            .from('muro_ventas_tokens')
            .select('*')
            .eq('id', ordenId)
            .single();

        if (error) throw error;

        if (orden.estado === 'pagado' || orden.estado === 'completado') {
            statusEl.textContent = '✅ ¡Pago confirmado! Procesando...';
            
            // Marcar venta como completada
            await supabase
                .from('muro_ventas_tokens')
                .update({ estado: 'completado' })
                .eq('id', ordenId);

            // Marcar post como vendido
            await supabase
                .from('muro_posts')
                .update({ vendido: true })
                .eq('id', orden.post_id);

            // Asignar tokens al comprador
            const session = await getSession();
            if (session) {
                await supabase
                    .from('usuarios')
                    .update({ tokens: supabase.rpc('increment_tokens', { p_cantidad: orden.cantidad }) })
                    .eq('id', session.user.id);
            }

            showToast('🎉 ¡Compra completada!', 'success');
            await cargarPublicaciones();
            await actualizarTokenBadge();
            
            setTimeout(() => cerrarModalPago(), 2000);
        } else {
            statusEl.textContent = '⏳ Esperando confirmación de pago...';
        }
    } catch (error) {
        console.error('Error verificando pago:', error);
        statusEl.textContent = '❌ Error al verificar';
    }
}

// ================================================================
// VENTA DE TOKENS
// ================================================================
function abrirModalVenta() {
    document.getElementById('modalVender').classList.add('show');
    actualizarTokensDisponibles();
}

function cerrarModalVenta() {
    document.getElementById('modalVender').classList.remove('show');
}

async function actualizarTokensDisponibles() {
    try {
        const session = await getSession();
        if (!session) return;
        const { data, error } = await supabase
            .from('usuarios')
            .select('tokens')
            .eq('id', session.user.id)
            .single();
        if (!error && data) {
            document.getElementById('tokensDisponibles').textContent = Math.floor(data.tokens || 0);
            document.getElementById('precioSugerido').textContent = precioActual.toFixed(2);
            document.getElementById('inputPrecioToken').value = precioActual.toFixed(2);
            // Mostrar precio en USDT
            const precioUsdt = (precioActual / 19.5).toFixed(2);
            document.getElementById('precioUsdtSugerido').textContent = `≈ $${precioUsdt} USDT`;
        }
    } catch (error) {
        console.error('Error obteniendo tokens:', error);
    }
}

async function publicarVenta() {
    const cantidad = parseInt(document.getElementById('inputCantidadTokens').value);
    const precio = parseFloat(document.getElementById('inputPrecioToken').value);

    if (!cantidad || cantidad < 1) {
        showToast('⚠️ Ingresa una cantidad válida', 'error');
        return;
    }

    if (!precio || precio < 6.20) {
        showToast(`⚠️ El precio mínimo es $6.20 MXN por token`, 'error');
        return;
    }

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para vender', 'error');
        return;
    }

    const { data: userData } = await supabase
        .from('usuarios')
        .select('tokens')
        .eq('id', session.user.id)
        .single();

    if (!userData || userData.tokens < cantidad) {
        showToast('⚠️ No tienes suficientes tokens', 'error');
        return;
    }

    try {
        // Descontar tokens del vendedor
        await supabase.rpc('decrement_tokens', { p_user_id: session.user.id, p_cantidad: cantidad });

        const { error } = await supabase
            .from('muro_posts')
            .insert({
                usuario_id: session.user.id,
                contenido: `◈ Vendo ${cantidad} Es.stoks a $${precio.toFixed(2)} MXN c/u (≈ $${(precio / 19.5).toFixed(2)} USDT)`,
                cantidad_venta: cantidad,
                precio_venta: precio
            });

        if (error) throw error;

        showToast(`✅ Venta publicada: ${cantidad} tokens a $${precio.toFixed(2)} MXN`);
        cerrarModalVenta();
        cargarPublicaciones();
        actualizarTokenBadge();
    } catch (error) {
        console.error('Error publicando venta:', error);
        showToast('❌ Error al publicar venta', 'error');
    }
}

// ================================================================
// SUSCRIBIRSE A REALTIME
// ================================================================
async function suscribirseARealtime() {
    const session = await getSession();
    sessionUser = session?.user || null;

    const channel = supabase
        .channel('muro-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'muro_posts' }, (payload) => {
            const existingPost = document.querySelector(`[data-post-id="${payload.new.id}"]`);
            if (!existingPost) agregarPostRealtime(payload.new);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'muro_comentarios' }, () => cargarPublicaciones())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'muro_likes' }, () => cargarPublicaciones())
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'muro_comentarios' }, () => cargarPublicaciones())
        .subscribe();

    return channel;
}

// ================================================================
// AGREGAR POST EN TIEMPO REAL
// ================================================================
async function agregarPostRealtime(post) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    const { data: userData } = await supabase
        .from('usuarios')
        .select('nombre, avatar_url')
        .eq('id', post.usuario_id)
        .single();

    const avatar = userData?.avatar_url ? `<img src="${userData.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : '◈';
    const nombre = userData?.nombre || 'Explorador';

    const newPost = `
        <div class="post-card" data-post-id="${post.id}">
            <div class="post-header">
                <div class="post-avatar">${avatar}</div>
                <div>
                    <div class="post-author">${nombre} <span class="badge-verificado">✦ Verificado</span></div>
                    <div class="post-date">${new Date(post.created_at).toLocaleString()}</div>
                </div>
            </div>
            <div class="post-content">${post.contenido || ''}</div>
            ${post.imagen_url ? `<img src="${post.imagen_url}" style="width:100%; border-radius:12px; margin-top:12px;" />` : ''}
            <div class="post-stats">
                <span onclick="likePublicacion('${post.id}')" style="cursor:pointer;">❤️ <span class="count">0</span></span>
                <span style="cursor:pointer;" onclick="toggleComentariosPost('${post.id}')">💬 <span class="count">0</span></span>
            </div>
        </div>
    `;

    feedContainer.insertAdjacentHTML('afterbegin', newPost);
}

// ================================================================
// VER TOKENS
// ================================================================
function verTokens() {
    window.location.href = '/features/perfil/perfil.html';
}

// ================================================================
// CERRAR MODALES CON CLICK FUERA
// ================================================================
window.addEventListener('click', function(event) {
    const modalVender = document.getElementById('modalVender');
    const modalConfirmar = document.getElementById('modalConfirmarCompra');
    const modalPago = document.getElementById('cryptoPaymentModal');
    
    if (event.target === modalVender) cerrarModalVenta();
    if (event.target === modalConfirmar) cerrarModalConfirmacion();
    if (event.target === modalPago) cerrarModalPago();
});

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    const session = await getSession();
    sessionUser = session?.user || null;

    await cargarPrecioEsStok();
    await cargarPublicaciones();
    await actualizarTokenBadge();

    suscribirseARealtime();
    setInterval(cargarPrecioEsStok, 60000);

    const btnPublicar = document.getElementById('btnPublicar');
    if (btnPublicar) btnPublicar.addEventListener('click', publicar);

    document.getElementById('postContent')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) publicar();
    });

    console.log('◈ Sariel\'s - Muro Ultra Mega Pro');
    console.log('📊 Precio Es.stok:', precioActual);
    console.log('💳 NOWPayments integrado para compra de tokens');
});

// ================================================================
// EXPONER FUNCIONES
// ================================================================
window.publicar = publicar;
window.cargarPublicaciones = cargarPublicaciones;
window.likePublicacion = likePublicacion;
window.subirImagenMuro = subirImagenMuro;
window.showToast = showToast;
window.toggleComentariosPost = toggleComentariosPost;
window.enviarComentario = enviarComentario;
window.eliminarComentario = eliminarComentario;
window.eliminarPublicacion = eliminarPublicacion;
window.editarPublicacion = editarPublicacion;
window.reportarPublicacion = reportarPublicacion;
window.guardarPublicacion = guardarPublicacion;
window.compartirPublicacion = compartirPublicacion;
window.buscarHashtag = buscarHashtag;
window.insertarHashtag = insertarHashtag;
window.insertarEmoji = insertarEmoji;
window.abrirSelectorImagen = abrirSelectorImagen;
window.abrirModalVenta = abrirModalVenta;
window.cerrarModalVenta = cerrarModalVenta;
window.publicarVenta = publicarVenta;
window.comprarTokensConCrypto = comprarTokensConCrypto;
window.cerrarModalConfirmacion = cerrarModalConfirmacion;
window.confirmarCompraCrypto = confirmarCompraCrypto;
window.verTokens = verTokens;
window.actualizarTokenBadge = actualizarTokenBadge;
window.cerrarModalPago = cerrarModalPago;
window.copiarDireccionCrypto = copiarDireccionCrypto;
window.verificarPagoCrypto = verificarPagoCrypto;