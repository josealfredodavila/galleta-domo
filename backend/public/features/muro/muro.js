/* ================================================================
   MURO ULTRA MEGA PRO - SARIEL'S
   CON COMENTARIOS FUNCIONALES + VENTAS + PRECIOS EN TIEMPO REAL
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE (CON NUEVAS LLAVES)
// ================================================================
const supabase = window.supabase.createClient(
    'https://zultnlogdoajehbswlih.supabase.co',
    'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
);

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
    else if (type === 'success') t.classList.add('success');
    else t.classList.remove('error', 'warning', 'success');
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
// VARIABLES GLOBALES
// ================================================================
let sessionUser = null;
let precioActual = 0;
let precioBase = 0;
let ofertaTotal = 0;
let demandaTotal = 0;
let postSeleccionado = null;

// ================================================================
// 📊 CARGAR PRECIOS DE MERCADO - muro_precios
// ================================================================
async function cargarPreciosMercado() {
    try {
        const { data, error } = await supabase
            .from('muro_precios')
            .select('*')
            .order('ultima_actualizacion', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            const precios = data[0];
            precioActual = precios.precio_actual || 0;
            precioBase = precios.precio_base || 0;
            ofertaTotal = precios.oferta_total || 0;
            demandaTotal = precios.demanda_total || 0;

            // Actualizar UI
            const precioToken = document.getElementById('precioToken');
            const ofertaTotalEl = document.getElementById('ofertaTotal');
            const demandaTotalEl = document.getElementById('demandaTotal');
            const tendenciaValor = document.getElementById('tendenciaValor');

            if (precioToken) {
                precioToken.textContent = `$${precioActual.toFixed(2)} MXN`;
                precioToken.style.color = precioActual > 0 ? 'var(--gold)' : 'var(--text-muted)';
            }

            if (ofertaTotalEl) {
                ofertaTotalEl.textContent = ofertaTotal.toFixed(2);
            }

            if (demandaTotalEl) {
                demandaTotalEl.textContent = demandaTotal.toFixed(2);
            }

            if (tendenciaValor) {
                const diferencia = precioActual - precioBase;
                if (diferencia > 0) {
                    tendenciaValor.textContent = '📈 ALZA';
                    tendenciaValor.className = 'tendencia up';
                    tendenciaValor.style.color = 'var(--success)';
                } else if (diferencia < 0) {
                    tendenciaValor.textContent = '📉 BAJA';
                    tendenciaValor.className = 'tendencia down';
                    tendenciaValor.style.color = 'var(--danger)';
                } else {
                    tendenciaValor.textContent = '➡️ ESTABLE';
                    tendenciaValor.className = 'tendencia stable';
                    tendenciaValor.style.color = 'var(--text-muted)';
                }
            }

            return precios;
        } else {
            // Datos por defecto si no hay registros
            precioActual = 4.50;
            precioBase = 4.50;
            ofertaTotal = 0;
            demandaTotal = 0;

            const precioToken = document.getElementById('precioToken');
            const tendenciaValor = document.getElementById('tendenciaValor');
            
            if (precioToken) {
                precioToken.textContent = `$${precioActual.toFixed(2)} MXN`;
            }
            if (tendenciaValor) {
                tendenciaValor.textContent = '➡️ ESTABLE';
                tendenciaValor.className = 'tendencia stable';
                tendenciaValor.style.color = 'var(--text-muted)';
            }

            return null;
        }
    } catch (error) {
        console.error('Error cargando precios de mercado:', error);
        // No mostrar toast para no molestar
        return null;
    }
}

// ================================================================
// CARGAR PUBLICACIONES (Con likes y comentarios)
// ================================================================
async function cargarPublicaciones() {
    try {
        const { data, error } = await supabase
            .from('muro_posts')
            .select('*, usuarios(nombre, avatar_url), muro_likes(id), muro_comentarios(id, contenido, usuario_id, created_at, usuarios(nombre, avatar_url))')
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
        console.error('Error cargando publicaciones desde Supabase:', error);
        showToast('❌ Error al cargar publicaciones', 'error');
    }
}

// ================================================================
// RENDERIZAR PUBLICACIONES (Con Comentarios, Likes y SECCIÓN VENTA)
// ================================================================
function renderizarPublicaciones(posts) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    feedContainer.innerHTML = posts.map(post => {
        const avatar = post.usuarios?.avatar_url ? `<img src="${post.usuarios.avatar_url}">` : '◈';
        const likes = post.muro_likes?.length || 0;
        const comentarios = post.muro_comentarios || [];
        const imagen = post.imagen_url ? `<img src="${post.imagen_url}" style="width:100%; border-radius:12px; margin-top:12px;" />` : '';

        // 🔥 NUEVO: Sección de venta si el post tiene cantidad_venta y precio_venta
        let seccionVenta = '';
        if (post.cantidad_venta && post.cantidad_venta > 0 && post.precio_venta) {
            const precioPorToken = (post.precio_venta / post.cantidad_venta).toFixed(2);
            seccionVenta = `
                <div class="post-venta" style="
                    margin-top: 16px;
                    padding: 16px;
                    background: linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.02));
                    border: 1px solid rgba(212,175,55,0.2);
                    border-radius: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 12px;
                ">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="font-size: 0.7rem; color: var(--text-muted);">💎 Venta de tokens</span>
                        <span style="font-weight: 600; color: var(--gold);">
                            ${post.cantidad_venta} tokens · $${precioPorToken} c/u
                        </span>
                        <span style="font-size: 0.65rem; color: var(--text-muted);">
                            Total: $${post.precio_venta.toFixed(2)} MXN
                        </span>
                    </div>
                    <button onclick="abrirModalCompra('${post.id}')" 
                            style="
                                background: linear-gradient(135deg, var(--gold), #f7971e);
                                border: none;
                                color: #fff;
                                padding: 8px 20px;
                                border-radius: 8px;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.3s ease;
                            "
                            onmouseover="this.style.transform='scale(1.05)'"
                            onmouseout="this.style.transform='scale(1)'">
                        Comprar
                    </button>
                </div>
            `;
        }

        return `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar">${avatar}</div>
                    <div>
                        <div class="post-author">${post.usuarios?.nombre || 'Explorador'} <span class="badge-verificado">✦ Verificado</span></div>
                        <div class="post-date">${new Date(post.created_at).toLocaleString()}</div>
                    </div>
                </div>
                <div class="post-content">${post.contenido || ''}</div>
                ${imagen}
                ${seccionVenta}
                <div class="post-stats">
                    <span onclick="likePublicacion('${post.id}')" style="cursor:pointer;" class="like-btn">❤️ <span class="count">${likes}</span></span>
                    <span style="cursor:pointer;" onclick="toggleComentariosPost('${post.id}')">💬 <span class="count">${comentarios.length}</span></span>
                    ${post.cantidad_venta ? `<span style="color:var(--gold);font-size:0.7rem;">💎 ${post.cantidad_venta} tokens en venta</span>` : ''}
                </div>
                <div class="post-comentarios" id="comentarios-post-${post.id}" style="display:none;">
                    ${comentarios.map(c => `
                        <div class="comentario">
                            <div class="avatar">${c.usuarios?.avatar_url ? `<img src="${c.usuarios.avatar_url}">` : '◈'}</div>
                            <div class="texto">
                                <strong>${c.usuarios?.nombre || 'Usuario'}</strong> ${c.contenido}
                                <div class="fecha">${new Date(c.created_at).toLocaleString()}</div>
                                ${c.usuario_id === sessionUser?.id ? `<button class="btn-eliminar-comentario" onclick="eliminarComentario('${c.id}')">✕ Eliminar</button>` : ''}
                            </div>
                        </div>
                    `).join('')}
                    <div class="input-comentario">
                        <input type="text" id="input-comentario-${post.id}" placeholder="Escribe un comentario..." />
                        <button onclick="enviarComentario('${post.id}')">Enviar</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// TOGGLE COMENTARIOS
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

// ================================================================
// ENVIAR COMENTARIO
// ================================================================
async function enviarComentario(postId) {
    const input = document.getElementById(`input-comentario-${postId}`);
    if (!input) return;
    const texto = input.value.trim();
    if (!texto) {
        showToast('⚠️ Escribe un comentario', 'error');
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
            .insert({
                post_id: postId,
                usuario_id: session.user.id,
                contenido: texto
            });

        if (error) throw error;

        input.value = '';
        showToast('✅ Comentario agregado', 'success');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al comentar:', error);
        showToast('❌ Error al comentar', 'error');
    }
}

// ================================================================
// ELIMINAR COMENTARIO (Solo del autor)
// ================================================================
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

        showToast('🗑️ Comentario eliminado', 'success');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al eliminar comentario:', error);
        showToast('❌ Error al eliminar comentario', 'error');
    }
}

// ================================================================
// DAR LIKE (Manejo del error 23505)
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
            .insert({
                post_id: postId,
                usuario_id: session.user.id
            });

        if (error) {
            if (error.code === '23505') {
                showToast('⚠️ Ya diste like a este post', 'warning');
                return;
            }
            throw error;
        }

        showToast('❤️ Like dado', 'success');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al dar like:', error);
        showToast('❌ Error al dar like', 'error');
    }
}

// ================================================================
// SUBIR IMAGEN AL MURO
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

        const { error: insertError } = await supabase
            .from('muro_posts')
            .insert({
                usuario_id: session.user.id,
                contenido: '',
                imagen_url: publicUrl
            });

        if (insertError) throw insertError;

        showToast('✅ Imagen subida correctamente', 'success');
        event.target.value = '';
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al subir imagen:', error);
        showToast('❌ Error al subir imagen', 'error');
    }
}

// ================================================================
// 🔥 FUNCIONES DE VENTA - MODALES
// ================================================================

// ABRIR MODAL VENTA
function abrirModalVenta() {
    const modal = document.getElementById('modalVenta');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.animation = 'fadeIn 0.3s ease-out';
        // Limpiar campos
        document.getElementById('inputCantidadTokens').value = '';
        document.getElementById('inputPrecioToken').value = '';
        document.getElementById('inputContenidoVenta').value = '';
        // Enfocar primer campo
        setTimeout(() => {
            document.getElementById('inputCantidadTokens').focus();
        }, 200);
    } else {
        showToast('❌ Modal no encontrado', 'error');
    }
}

// CERRAR MODAL VENTA
function cerrarModalVenta() {
    const modal = document.getElementById('modalVenta');
    if (modal) {
        modal.style.display = 'none';
    }
}

// PUBLICAR VENTA - inserta en muro_posts
async function publicarVenta() {
    const cantidadInput = document.getElementById('inputCantidadTokens');
    const precioInput = document.getElementById('inputPrecioToken');
    const contenidoInput = document.getElementById('inputContenidoVenta');
    const btn = document.getElementById('btnPublicarVenta');

    const cantidad = parseInt(cantidadInput?.value);
    const precio = parseFloat(precioInput?.value);
    const contenido = contenidoInput?.value.trim() || '';

    if (!cantidad || cantidad <= 0) {
        showToast('⚠️ Ingresa una cantidad válida de tokens', 'error');
        cantidadInput?.focus();
        return;
    }

    if (!precio || precio <= 0) {
        showToast('⚠️ Ingresa un precio válido', 'error');
        precioInput?.focus();
        return;
    }

    if (cantidad > 100) {
        showToast('⚠️ Máximo 100 tokens por venta', 'error');
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para publicar venta', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = '⏳ Publicando...';

        const { error } = await supabase
            .from('muro_posts')
            .insert({
                usuario_id: session.user.id,
                contenido: contenido || `💎 Venta de ${cantidad} tokens`,
                cantidad_venta: cantidad,
                precio_venta: precio
            });

        if (error) throw error;

        showToast('✅ Venta publicada correctamente', 'success');
        cerrarModalVenta();
        cargarPublicaciones();

    } catch (error) {
        console.error('Error publicando venta:', error);
        showToast('❌ Error al publicar venta: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '💎 Publicar Venta';
    }
}

// ================================================================
// 🔥 FUNCIONES DE COMPRA - MODALES
// ================================================================

// ABRIR MODAL COMPRA (desde botón Comprar en post)
function abrirModalCompra(postId) {
    postSeleccionado = postId;
    const modal = document.getElementById('modalConfirmacionCompra');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.animation = 'fadeIn 0.3s ease-out';
        // Mostrar info del post seleccionado
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        if (postCard) {
            const precioEl = postCard.querySelector('.post-venta span');
            if (precioEl) {
                document.getElementById('infoCompra').textContent = precioEl.textContent;
            }
        }
    } else {
        showToast('❌ Modal no encontrado', 'error');
    }
}

// CERRAR MODAL CONFIRMACIÓN
function cerrarModalConfirmacion() {
    const modal = document.getElementById('modalConfirmacionCompra');
    if (modal) {
        modal.style.display = 'none';
    }
    postSeleccionado = null;
}

// CONFIRMAR COMPRA CRYPTO - inserta en muro_ventas_tokens
async function confirmarCompraCrypto() {
    if (!postSeleccionado) {
        showToast('❌ No hay post seleccionado', 'error');
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para comprar', 'error');
            return;
        }

        // Obtener datos del post
        const { data: post, error: postError } = await supabase
            .from('muro_posts')
            .select('id, usuario_id, cantidad_venta, precio_venta')
            .eq('id', postSeleccionado)
            .single();

        if (postError) throw postError;
        if (!post) {
            showToast('❌ Post no encontrado', 'error');
            return;
        }

        if (post.usuario_id === session.user.id) {
            showToast('⚠️ No puedes comprar tus propios tokens', 'error');
            return;
        }

        const comision = post.precio_venta * 0.02; // 2% comisión
        const montoRecibido = post.precio_venta - comision;
        const precioUsdt = post.precio_venta / 4.50; // Aprox 4.50 MXN por USDT

        const { error: insertError } = await supabase
            .from('muro_ventas_tokens')
            .insert({
                post_id: post.id,
                vendedor_id: post.usuario_id,
                comprador_id: session.user.id,
                cantidad: post.cantidad_venta,
                precio_mxn: post.precio_venta,
                precio_usdt: precioUsdt,
                comision_plataforma: comision,
                monto_recibido: montoRecibido,
                estado: 'pendiente'
            });

        if (insertError) throw insertError;

        showToast('✅ Orden de compra creada. Procede al pago.', 'success');
        cerrarModalConfirmacion();
        abrirModalPago();

        // Actualizar el post para quitar la venta (opcional - se puede hacer después de confirmar pago)
        // Por ahora solo mostramos el modal de pago

    } catch (error) {
        console.error('Error confirmando compra:', error);
        showToast('❌ Error al confirmar compra: ' + error.message, 'error');
    }
}

// ABRIR MODAL PAGO
function abrirModalPago() {
    const modal = document.getElementById('modalPagoCrypto');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.animation = 'fadeIn 0.3s ease-out';
        // Generar dirección de pago (mock)
        const direccion = '0x' + Array.from({length: 40}, () => Math.floor(Math.random() * 16).toString(16)).join('');
        document.getElementById('direccionCrypto').textContent = direccion;
        document.getElementById('montoPago').textContent = `$${precioActual.toFixed(2)} MXN`;
    } else {
        showToast('❌ Modal no encontrado', 'error');
    }
}

// CERRAR MODAL PAGO
function cerrarModalPago() {
    const modal = document.getElementById('modalPagoCrypto');
    if (modal) {
        modal.style.display = 'none';
    }
}

// COPIAR DIRECCIÓN CRYPTO
function copiarDireccionCrypto() {
    const direccionEl = document.getElementById('direccionCrypto');
    if (direccionEl) {
        const direccion = direccionEl.textContent;
        navigator.clipboard.writeText(direccion).then(() => {
            showToast('📋 Dirección copiada', 'success');
        }).catch(() => {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = direccion;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('📋 Dirección copiada', 'success');
        });
    }
}

// VERIFICAR PAGO CRYPTO
async function verificarPagoCrypto() {
    const btn = document.getElementById('btnVerificarPago');
    const statusEl = document.getElementById('pagoCryptoStatus');

    try {
        btn.disabled = true;
        btn.textContent = '⏳ Verificando...';
        statusEl.textContent = '⏳ Verificando pago en blockchain...';
        statusEl.style.color = 'var(--text-secondary)';

        // Simular verificación (por ahora solo actualiza estado)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Actualizar estado de la última venta pendiente
        const session = await getSession();
        if (session && postSeleccionado) {
            const { error } = await supabase
                .from('muro_ventas_tokens')
                .update({ estado: 'pagado' })
                .eq('post_id', postSeleccionado)
                .eq('comprador_id', session.user.id)
                .eq('estado', 'pendiente');

            if (error) throw error;

            // Marcar el post como vendido (cantidad_venta = 0)
            await supabase
                .from('muro_posts')
                .update({ cantidad_venta: 0 })
                .eq('id', postSeleccionado);
        }

        statusEl.textContent = '✅ ¡Pago verificado! Tokens transferidos.';
        statusEl.style.color = 'var(--success)';
        showToast('✅ ¡Compra completada exitosamente!', 'success');

        setTimeout(() => {
            cerrarModalPago();
            cargarPublicaciones();
            cargarPreciosMercado();
        }, 2000);

    } catch (error) {
        console.error('Error verificando pago:', error);
        statusEl.textContent = '❌ Error al verificar pago';
        statusEl.style.color = 'var(--danger)';
        showToast('❌ Error al verificar pago', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '✅ Verificar Pago';
    }
}

// ================================================================
// 🔥 FUNCIONES DE TOKENS, HASHTAGS, EMOJIS, IMÁGENES
// ================================================================

// VER TOKENS - redirige al perfil
function verTokens() {
    window.location.href = '/features/perfil/perfil.html#tokens';
}

// INSERTAR HASHTAG
function insertarHashtag() {
    const input = document.getElementById('postContent');
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const texto = input.value;
    const hashtag = '#';
    input.value = texto.substring(0, start) + hashtag + texto.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + hashtag.length;
}

// INSERTAR EMOJI
function insertarEmoji(emoji) {
    const input = document.getElementById('postContent');
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const texto = input.value;
    input.value = texto.substring(0, start) + emoji + texto.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
    // Cerrar selector de emojis si existe
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) emojiPicker.style.display = 'none';
}

// ABRIR SELECTOR DE IMAGEN
function abrirSelectorImagen() {
    const input = document.getElementById('fileInput');
    if (input) {
        input.click();
    }
}

// BUSCAR HASHTAG
async function buscarHashtag() {
    const input = document.getElementById('searchHashtag');
    if (!input) return;
    const tag = input.value.trim().replace('#', '');
    if (!tag) {
        showToast('⚠️ Escribe un hashtag para buscar', 'warning');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('muro_posts')
            .select('*, usuarios(nombre, avatar_url), muro_likes(id), muro_comentarios(id, contenido, usuario_id, usuarios(nombre))')
            .ilike('contenido', `%#${tag}%`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
            renderizarPublicaciones(data);
            showToast(`🔍 Encontradas ${data.length} publicaciones con #${tag}`, 'success');
            // Actualizar título
            const titulo = document.querySelector('.feed-header h2');
            if (titulo) titulo.textContent = `#${tag}`;
        } else {
            showToast(`🔍 No se encontraron publicaciones con #${tag}`, 'warning');
            // Recargar todas
            cargarPublicaciones();
        }

        input.value = '';
    } catch (error) {
        console.error('Error buscando hashtag:', error);
        showToast('❌ Error al buscar hashtag', 'error');
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
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'muro_posts' },
            (payload) => {
                const existingPost = document.querySelector(`[data-post-id="${payload.new.id}"]`);
                if (!existingPost) {
                    agregarPostRealtime(payload.new);
                }
            }
        )
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'muro_comentarios' },
            () => cargarPublicaciones()
        )
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'muro_likes' },
            () => cargarPublicaciones()
        )
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'muro_comentarios' },
            () => cargarPublicaciones()
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'muro_precios' },
            () => cargarPreciosMercado()
        )
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

    const avatar = userData?.avatar_url ? `<img src="${userData.avatar_url}">` : '◈';
    const nombre = userData?.nombre || 'Explorador';

    let seccionVenta = '';
    if (post.cantidad_venta && post.cantidad_venta > 0 && post.precio_venta) {
        const precioPorToken = (post.precio_venta / post.cantidad_venta).toFixed(2);
        seccionVenta = `
            <div class="post-venta" style="
                margin-top: 16px;
                padding: 16px;
                background: linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.02));
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 12px;
            ">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">💎 Venta de tokens</span>
                    <span style="font-weight: 600; color: var(--gold);">
                        ${post.cantidad_venta} tokens · $${precioPorToken} c/u
                    </span>
                    <span style="font-size: 0.65rem; color: var(--text-muted);">
                        Total: $${post.precio_venta.toFixed(2)} MXN
                    </span>
                </div>
                <button onclick="abrirModalCompra('${post.id}')" 
                        style="
                            background: linear-gradient(135deg, var(--gold), #f7971e);
                            border: none;
                            color: #fff;
                            padding: 8px 20px;
                            border-radius: 8px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s ease;
                        "
                        onmouseover="this.style.transform='scale(1.05)'"
                        onmouseout="this.style.transform='scale(1)'">
                    Comprar
                </button>
            </div>
        `;
    }

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
            ${seccionVenta}
        </div>
    `;

    feedContainer.insertAdjacentHTML('afterbegin', newPost);
}

// ================================================================
// PUBLICAR NUEVA PUBLICACIÓN
// ================================================================
async function publicar() {
    const postContent = document.getElementById('postContent');
    const btnPublicar = document.getElementById('btnPublicar');
    const contenido = postContent ? postContent.value.trim() : '';

    if (!contenido) {
        showToast('⚠️ Escribe algo para publicar', 'error');
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

        postContent.value = '';
        showToast('✅ Publicación creada', 'success');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al publicar:', error);
        showToast('❌ Error al publicar', 'error');
    } finally {
        btnPublicar.disabled = false;
    }
}

// ================================================================
// TOGGLE EMOJI PICKER
// ================================================================
function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (picker) {
        const isVisible = picker.style.display !== 'none';
        picker.style.display = isVisible ? 'none' : 'flex';
    }
}

// Cerrar emoji picker al hacer clic fuera
document.addEventListener('click', function(e) {
    const picker = document.getElementById('emojiPicker');
    const btn = document.querySelector('.btn-emoji');
    if (picker && btn) {
        if (!picker.contains(e.target) && !btn.contains(e.target)) {
            picker.style.display = 'none';
        }
    }
});

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    const session = await getSession();
    sessionUser = session?.user || null;

    await cargarPreciosMercado();
    cargarPublicaciones();
    suscribirseARealtime();

    const btnPublicar = document.getElementById('btnPublicar');
    if (btnPublicar) {
        btnPublicar.addEventListener('click', publicar);
    }

    // Evento Enter para buscar hashtag
    const searchInput = document.getElementById('searchHashtag');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                buscarHashtag();
            }
        });
    }

    // Evento Enter para comentarios (delegado)
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const input = e.target;
            if (input.id && input.id.startsWith('input-comentario-')) {
                const postId = input.id.replace('input-comentario-', '');
                enviarComentario(postId);
            }
        }
    });
});

// ================================================================
// EXPONER FUNCIONES
// ================================================================
window.publicar = publicar;
window.cargarPublicaciones = cargarPublicaciones;
window.cargarPreciosMercado = cargarPreciosMercado;
window.likePublicacion = likePublicacion;
window.subirImagenMuro = subirImagenMuro;
window.showToast = showToast;
window.toggleComentariosPost = toggleComentariosPost;
window.enviarComentario = enviarComentario;
window.eliminarComentario = eliminarComentario;

// Funciones de venta
window.abrirModalVenta = abrirModalVenta;
window.cerrarModalVenta = cerrarModalVenta;
window.publicarVenta = publicarVenta;
window.abrirModalCompra = abrirModalCompra;
window.cerrarModalConfirmacion = cerrarModalConfirmacion;
window.confirmarCompraCrypto = confirmarCompraCrypto;
window.cerrarModalPago = cerrarModalPago;
window.copiarDireccionCrypto = copiarDireccionCrypto;
window.verificarPagoCrypto = verificarPagoCrypto;

// Funciones de utilidad
window.verTokens = verTokens;
window.insertarHashtag = insertarHashtag;
window.insertarEmoji = insertarEmoji;
window.abrirSelectorImagen = abrirSelectorImagen;
window.buscarHashtag = buscarHashtag;
window.toggleEmojiPicker = toggleEmojiPicker;