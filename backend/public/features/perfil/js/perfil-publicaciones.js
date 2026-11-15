// ================================================================
// PERFIL · PUBLICACIONES
// ================================================================
// v8.2 (Flujo de reportes completo + Menú de reacciones desplegable)
// ================================================================

window.listaMultimediaPerfil = [];

var PUB_RUTA_PERFIL_PUBLICO = '/features/perfil/perfil-publico.html';
var PUB_RUTA_PERFIL_PROPIO = '/features/perfil/perfil.html';

var PUB_EMOJIS_REACCION_DEFAULT = ['❤️', '😊', '👏', '😍', '😂', '🔥', '🎉', '🤩', '💎'];

var PUB_EMOJIS_PICKER_DEFAULT = [
'😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😋','😛','😜',
'🤪','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤯',
'😳','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🙄','😴','🤒','👍','👎','👏','🙌','🙏','🤝','💪','✌️',
'🤞','👌','❤️','🧡','💛','💚','💙','💜','🖤','💔','💯','🔥','⭐','✨','🎉','🎊','🎈','🎁','🏆','🥇',
'☕','🍕','🍔','🌮','🍩','🎵','🎶','🐶','🐱','🌹','🌈','☀️','🌙','⚡','💰','🚀','📸'
];

if (typeof window.archivosSeleccionados === 'undefined') {
    window.archivosSeleccionados = { imagen: null, video: null };
}

var archivosSeleccionados = window.archivosSeleccionados;

function pubEmojisReaccion() {
    return Array.isArray(window.EMOJIS_REACCION) && window.EMOJIS_REACCION.length ? window.EMOJIS_REACCION : PUB_EMOJIS_REACCION_DEFAULT;
}

function pubEmojisPicker() {
    return Array.isArray(window.emojisDisponibles) && window.emojisDisponibles.length ? window.emojisDisponibles : PUB_EMOJIS_PICKER_DEFAULT;
}

function pubEscapeHtml(valor) {
    if (typeof window.escapeHtmlPerfil === 'function') return window.escapeHtmlPerfil(valor);
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function pubEscaparHTML(valor) {
    if (typeof window.escaparHTML === 'function') return window.escaparHTML(valor);
    return pubEscapeHtml(valor);
}

function pubEsUrlSegura(url) {
    if (typeof url !== 'string' || url.length === 0 || url.length > 2000) return false;
    try { var parsed = new URL(url); return parsed.protocol === 'https:' && Boolean(parsed.hostname); } catch (e) { return false; }
}

function pubPerfilT(clave, defecto) {
    if (typeof window.perfilT === 'function') return window.perfilT(clave, defecto);
    return defecto || clave;
}

function pubCrearAvatar(nombre, url) {
    if (typeof window.crearAvatar === 'function') return window.crearAvatar(nombre, url);
    var avatar = document.createElement('div');
    avatar.className = 'avatar-placeholder';
    avatar.textContent = String(nombre || '?').trim().charAt(0).toUpperCase() || '?';
    if (url && pubEsUrlSegura(url)) {
        var imagen = document.createElement('img');
        imagen.src = url; imagen.alt = ''; imagen.loading = 'lazy';
        imagen.style.width = '100%'; imagen.style.height = '100%'; imagen.style.objectFit = 'cover'; imagen.style.borderRadius = '50%';
        imagen.onerror = function () { if (imagen.parentNode) imagen.parentNode.removeChild(imagen); };
        avatar.textContent = ''; avatar.appendChild(imagen);
    }
    return avatar;
}

function pubCodigoIdioma() {
    try { if (typeof window.obtenerCodigoIdiomaActual === 'function') return window.obtenerCodigoIdiomaActual(); } catch (e) {}
    return 'es-MX';
}

function pubUrlPerfilAutor(handle, usuarioId, miId) {
    if (miId && usuarioId && String(usuarioId) === String(miId)) return PUB_RUTA_PERFIL_PROPIO;
    var h = String(handle || '').trim();
    if (!/^[A-Za-z0-9_]{1,40}$/.test(h)) return null;
    return PUB_RUTA_PERFIL_PUBLICO + '?u=' + encodeURIComponent(h);
}

// ================================================================
// VISOR A PANTALLA COMPLETA (CON FLUJO DE REPORTES COMPLETO)
// ================================================================

var pubVisor = { items: [], index: 0, tocoX: 0, tocoY: 0, postIdActual: null, motivoSeleccionado: '' };

function pubVisorEl() {
    var el = document.getElementById('pubVisorFull');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'pubVisorFull';
    el.className = 'pub-vf';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    
    var svgClose = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    var svgDots = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;
    var svgDownload = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
    var svgEyeOff = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    var svgReport = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    var svgChevronRight = `<svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    el.innerHTML =
        `<div class="pub-vf-header">` +
            `<button type="button" class="pub-vf-cerrar" aria-label="Cerrar">${svgClose}</button>` +
            `<button type="button" class="pub-vf-menu-btn" aria-label="Opciones">${svgDots}</button>` +
        `</div>` +
        `<div class="pub-vf-media"></div>` +
        
        `<div class="pub-vf-bottom-sheet" id="pubVfSheet">` +
            `<div class="pub-vf-drag-handle"></div>` +
            `<button type="button" class="pub-vf-sheet-btn" id="btnPubVfGuardar">` +
                `<span class="icon">${svgDownload}</span> Guardar` +
            `</button>` +
            `<button type="button" class="pub-vf-sheet-btn" id="btnPubVfOcultar">` +
                `<span class="icon">${svgEyeOff}</span> No quiero ver esto` +
            `</button>` +
            `<button type="button" class="pub-vf-sheet-btn" id="btnPubVfReportar">` +
                `<span class="icon">${svgReport}</span> Buscar ayuda o reportar foto` +
            `</button>` +
        `</div>` +

        `<div class="pub-vf-report-sheet" id="pubVfReportSheet1">` +
            `<div class="pub-vf-report-header">` +
                `<button type="button" class="pub-vf-report-back" id="btnPubVfBack1">` +
                    `<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><polyline points="15 18 9 12 15 6"></polyline></svg>` +
                `</button>` +
                `<span>Reportar</span>` +
                `<button type="button" class="pub-vf-report-cerrar" onclick="document.getElementById('pubVfReportSheet1').classList.remove('show');">` +
                    `<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>` +
                `</button>` +
            `</div>` +
            `<div class="pub-vf-report-content">` +
                `<h2>¿Por qué quieres reportar esta foto?</h2>` +
                `<p>Si alguien se encuentra en peligro inminente, busca ayuda antes de enviar un reporte. No esperes.</p>` +
                `<button class="pub-vf-report-option" data-motivo="Problema que involucra a un menor de 18 años">Problema que involucra a un menor de 18 años ${svgChevronRight}</button>` +
                `<button class="pub-vf-report-option" data-motivo="Bullying, acoso o abuso">Bullying, acoso o abuso ${svgChevronRight}</button>` +
                `<button class="pub-vf-report-option" data-motivo="Suicidio o autolesión">Suicidio o autolesión ${svgChevronRight}</button>` +
                `<button class="pub-vf-report-option" data-motivo="Contenido violento, perturbador o que incita al odio">Contenido violento, perturbador o que incita al odio ${svgChevronRight}</button>` +
                `<button class="pub-vf-report-option" data-motivo="Venta o promoción de artículos restringidos">Venta o promoción de artículos restringidos ${svgChevronRight}</button>` +
                `<button class="pub-vf-report-option" data-motivo="Contenido para adultos">Contenido para adultos ${svgChevronRight}</button>` +
                `<button class="pub-vf-report-option" data-motivo="Estafa, fraude o información falsa">Estafa, fraude o información falsa ${svgChevronRight}</button>` +
                `<button class="pub-vf-report-option" data-motivo="Propiedad intelectual">Propiedad intelectual ${svgChevronRight}</button>` +
                `<button class="pub-vf-report-option" data-motivo="No quiero ver esto">No quiero ver esto ${svgChevronRight}</button>` +
            `</div>` +
        `</div>` +

        `<div class="pub-vf-report-sheet" id="pubVfReportSheet2">` +
            `<div class="pub-vf-report-header">` +
                `<button type="button" class="pub-vf-report-back" id="btnPubVfBack2">` +
                    `<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><polyline points="15 18 9 12 15 6"></polyline></svg>` +
                `</button>` +
                `<span>Reportar</span>` +
                `<button type="button" class="pub-vf-report-cerrar" onclick="document.getElementById('pubVfReportSheet2').classList.remove('show');">` +
                    `<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>` +
                `</button>` +
            `</div>` +
            `<div class="pub-vf-report-content" style="flex:1;">` +
                `<h2 style="font-size:1.4rem;">Vas a enviar un reporte</h2>` +
                `<p style="font-size:1rem;">Solo eliminamos contenido que infringe nuestras <strong>Normas comunitarias</strong>.</p>` +
                `<h3 style="margin-top:20px; font-size:1.1rem; color:#000; margin-bottom:10px;">Detalles del reporte</h3>` +
                `<p style="font-size:.9rem; color:#666; margin-bottom:5px;">¿Por qué quieres reportar esta foto?</p>` +
                `<div id="pubVfResumenMotivo" style="font-weight:700; font-size:1.1rem; color:#000; margin-bottom:20px;"></div>` +
            `</div>` +
            `<div class="pub-vf-report-footer">` +
                `<button type="button" class="pub-vf-btn-enviar" id="btnPubVfEnviarFinal">Enviar</button>` +
            `</div>` +
        `</div>`;

    document.body.appendChild(el);

    el.querySelector('.pub-vf-cerrar').addEventListener('click', function (e) { e.stopPropagation(); pubCerrarVisor(); });
    
    el.querySelector('.pub-vf-menu-btn').addEventListener('click', function (e) {
        e.stopPropagation(); document.getElementById('pubVfSheet').classList.add('show');
    });

    el.querySelector('#btnPubVfGuardar').addEventListener('click', function (e) {
        e.stopPropagation();
        var item = pubVisor.items[pubVisor.index];
        if (item && typeof window.descargarArchivoForzado === 'function') window.descargarArchivoForzado(item.url);
        document.getElementById('pubVfSheet').classList.remove('show');
    });

    el.querySelector('#btnPubVfOcultar').addEventListener('click', async function (e) {
        e.stopPropagation();
        var btn = this; btn.disabled = true;
        try {
            var client = window.supabaseClient;
            var sessionResult = await client.auth.getSession();
            var session = sessionResult.data ? sessionResult.data.session : null;
            if (!session) throw new Error('No hay sesión');
            
            const { error } = await client.from('publicaciones_ocultas').insert({
                usuario_id: session.user.id,
                publicacion_id: pubVisor.postIdActual
            });
            if (error && error.code !== '23505') throw error;

            if (window.showToast) window.showToast('✅ Publicación oculta.', 'success');
            document.getElementById('pubVfSheet').classList.remove('show');
            pubCerrarVisor();
            if (typeof window.cargarMisPublicaciones === 'function') window.cargarMisPublicaciones(true);
        } catch (err) {
            console.error(err);
            if (window.showToast) window.showToast('❌ Error al ocultar.', 'error');
        } finally { btn.disabled = false; }
    });

    el.querySelector('#btnPubVfReportar').addEventListener('click', function (e) {
        e.stopPropagation();
        document.getElementById('pubVfSheet').classList.remove('show');
        document.getElementById('pubVfReportSheet1').classList.add('show');
    });

    el.querySelector('#btnPubVfBack1').addEventListener('click', function (e) {
        e.stopPropagation();
        document.getElementById('pubVfReportSheet1').classList.remove('show');
        document.getElementById('pubVfSheet').classList.add('show');
    });

    el.querySelector('#btnPubVfBack2').addEventListener('click', function (e) {
        e.stopPropagation();
        document.getElementById('pubVfReportSheet2').classList.remove('show');
        document.getElementById('pubVfReportSheet1').classList.add('show');
    });

    el.querySelectorAll('.pub-vf-report-option').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var motivo = this.getAttribute('data-motivo');
            
            if (motivo === 'No quiero ver esto') {
                document.getElementById('btnPubVfOcultar').click();
                document.getElementById('pubVfReportSheet1').classList.remove('show');
                return;
            }

            pubVisor.motivoSeleccionado = motivo;
            document.getElementById('pubVfResumenMotivo').textContent = motivo;
            document.getElementById('pubVfReportSheet1').classList.remove('show');
            document.getElementById('pubVfReportSheet2').classList.add('show');
        });
    });

    el.querySelector('#btnPubVfEnviarFinal').addEventListener('click', async function (e) {
        e.stopPropagation();
        var btn = this; btn.disabled = true; btn.textContent = 'Enviando...';
        try {
            var client = window.supabaseClient;
            var sessionResult = await client.auth.getSession();
            var session = sessionResult.data ? sessionResult.data.session : null;
            if (!session) throw new Error('No hay sesión');

            const { error } = await client.from('publicacion_reportes').insert({
                publicacion_id: pubVisor.postIdActual,
                usuario_id: session.user.id,
                motivo: pubVisor.motivoSeleccionado,
                estado: 'pendiente'
            });
            if (error) throw error;

            if (window.showToast) window.showToast('✅ Reporte enviado con éxito.', 'success');
            document.getElementById('pubVfReportSheet2').classList.remove('show');
            pubCerrarVisor();
        } catch (err) {
            console.error(err);
            if (window.showToast) window.showToast('❌ Error al enviar el reporte.', 'error');
        } finally { 
            btn.disabled = false; 
            btn.textContent = 'Enviar';
        }
    });

    el.querySelector('.pub-vf-media').addEventListener('click', function (e) {
        if (e.target === e.currentTarget) {
            var sheet = document.getElementById('pubVfSheet');
            var reportSheet1 = document.getElementById('pubVfReportSheet1');
            var reportSheet2 = document.getElementById('pubVfReportSheet2');
            if (sheet.classList.contains('show')) sheet.classList.remove('show');
            else if (reportSheet1.classList.contains('show')) reportSheet1.classList.remove('show');
            else if (reportSheet2.classList.contains('show')) reportSheet2.classList.remove('show');
            else pubCerrarVisor();
        }
    });

    el.addEventListener('touchstart', function (e) {
        pubVisor.tocoX = e.changedTouches[0].clientX; pubVisor.tocoY = e.changedTouches[0].clientY;
    }, { passive: true });

    el.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - pubVisor.tocoX;
        var dy = e.changedTouches[0].clientY - pubVisor.tocoY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) pubNavegar(dx < 0 ? 1 : -1);
        else if (dy > 110 && Math.abs(dy) > Math.abs(dx)) pubCerrarVisor();
    }, { passive: true });

    return el;
}

function pubMostrarItem() {
    var el = pubVisorEl();
    var caja = el.querySelector('.pub-vf-media');
    var item = pubVisor.items[pubVisor.index];
    if (!item) return;

    document.getElementById('pubVfSheet').classList.remove('show');
    document.getElementById('pubVfReportSheet1').classList.remove('show');
    document.getElementById('pubVfReportSheet2').classList.remove('show');

    caja.innerHTML = '';
    if (item.tipo === 'video') {
        var video = document.createElement('video');
        video.controls = true; video.playsInline = true; video.preload = 'auto'; video.src = item.url;
        caja.appendChild(video);
        var repro = video.play(); if (repro && typeof repro.catch === 'function') repro.catch(function () {});
    } else {
        var imagen = document.createElement('img'); imagen.alt = 'Publicación'; imagen.src = item.url;
        caja.appendChild(imagen);
    }
}

function pubNavegar(direccion) {
    var nuevo = pubVisor.index + direccion;
    if (nuevo < 0 || nuevo >= pubVisor.items.length) return;
    pubVisor.index = nuevo; pubMostrarItem();
}

function pubAbrirVisor(indice, postId) {
    var lista = Array.isArray(window.listaMultimediaPerfil) ? window.listaMultimediaPerfil : [];
    if (!lista[indice]) return;
    pubVisor.items = lista.slice(); 
    pubVisor.index = indice; 
    pubVisor.postIdActual = postId;
    pubMostrarItem();
    pubVisorEl().classList.add('show'); document.body.style.overflow = 'hidden';
}

function pubCerrarVisor() {
    var el = document.getElementById('pubVisorFull');
    if (!el) return;
    var video = el.querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    el.querySelector('.pub-vf-media').innerHTML = '';
    el.classList.remove('show'); document.body.style.overflow = '';
    pubVisor.postIdActual = null;
    pubVisor.motivoSeleccionado = '';
}

document.addEventListener('keydown', function (e) {
    var el = document.getElementById('pubVisorFull');
    if (!el || !el.classList.contains('show')) return;
    if (e.key === 'Escape') {
        var rs1 = document.getElementById('pubVfReportSheet1');
        var rs2 = document.getElementById('pubVfReportSheet2');
        var sheet = document.getElementById('pubVfSheet');
        if (rs2.classList.contains('show')) { rs2.classList.remove('show'); rs1.classList.add('show'); }
        else if (rs1.classList.contains('show')) { rs1.classList.remove('show'); sheet.classList.add('show'); }
        else if (sheet.classList.contains('show')) { sheet.classList.remove('show'); }
        else { pubCerrarVisor(); }
    }
    if (e.key === 'ArrowLeft') pubNavegar(-1);
    if (e.key === 'ArrowRight') pubNavegar(1);
});

// ================================================================
// ESTILOS CSS PARA TODO EL VISOR Y HOJAS
// ================================================================

(function inyectarEstilosReaccionesPerfil() {
    if (document.getElementById('perfil-reacciones-fb-styles')) return;
    var style = document.createElement('style');
    style.id = 'perfil-reacciones-fb-styles';

    style.appendChild(document.createTextNode(`
        #misPublicacionesList .publicacion-card {
            background: transparent !important; border: 0 !important; border-bottom: 1px solid rgba(255,255,255,.09) !important; border-radius: 0 !important; box-shadow: none !important; padding: 14px 0 12px !important; margin: 0 !important; width: 100%;
        }
        #misPublicacionesList .publicacion-card .header { display: flex !important; flex-direction: row !important; align-items: center !important; gap: 10px !important; padding: 0 !important; margin: 0 0 10px 0 !important; background: transparent !important; }
        #misPublicacionesList .publicacion-card .header > .avatar { width: 40px !important; height: 40px !important; min-width: 40px !important; flex: 0 0 40px !important; border-radius: 50% !important; overflow: hidden !important; }
        #misPublicacionesList .publicacion-card .nombre { font-weight: 700 !important; font-size: .92rem !important; color: var(--text-primary, #f0f4f8) !important; }
        #misPublicacionesList .publicacion-card .fecha { font-size: .72rem !important; color: var(--text-muted, #8aa8b8) !important; margin-top: 2px !important; }

        .pub-autor-enlace { color: inherit; text-decoration: none; }
        .pub-autor-handle { color: #3b82f6 !important; font-weight: 500 !important; font-size: .75rem !important; }
        .publicacion-card .contenido { display: flex; flex-direction: column; gap: 8px; color: var(--text-secondary, #c0d8e8); font-size: .95rem; line-height: 1.5; }
        
        .pub-media-wrap { position: relative; margin-top: 6px; }
        .pub-media-wrap img, .pub-media-wrap video { display: block; width: 100%; max-height: 620px; object-fit: contain; background: #000; border-radius: 0 !important; margin: 0 !important; cursor: pointer; }

        /* VISOR ESTILO FACEBOOK */
        .pub-vf { position: fixed; inset: 0; z-index: 100060; background: #000; display: none; align-items: center; justify-content: center; touch-action: manipulation; }
        .pub-vf.show { display: flex; }
        .pub-vf-media { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
        .pub-vf-media img, .pub-vf-media video { max-width: 100%; max-height: 100%; object-fit: contain; user-select: none; }

        .pub-vf-header { position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); left: 12px; right: 12px; display: flex; justify-content: space-between; z-index: 10; }
        .pub-vf-cerrar, .pub-vf-menu-btn { width: 44px; height: 44px; border-radius: 50%; border: 0; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; }

        /* HOJA INFERIOR (MENÚ) */
        .pub-vf-bottom-sheet {
            position: absolute; bottom: 0; left: 0; right: 0; background: #fff; border-top-left-radius: 16px; border-top-right-radius: 16px; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); z-index: 20; padding-bottom: env(safe-area-inset-bottom, 20px); display: flex; flex-direction: column;
        }
        .pub-vf-bottom-sheet.show { transform: translateY(0); }
        .pub-vf-drag-handle { width: 40px; height: 4px; background: #ccc; border-radius: 2px; margin: 10px auto 15px auto; }
        .pub-vf-sheet-btn { display: flex; align-items: center; gap: 15px; width: 100%; padding: 16px 20px; border: 0; border-top: 1px solid #eee; background: transparent; color: #000; font-size: 16px; text-align: left; cursor: pointer; }
        .pub-vf-sheet-btn:last-child { border-bottom: 1px solid #eee; }
        .pub-vf-sheet-btn .icon { display: flex; align-items: center; justify-content: center; color: #333; }

        /* PANTALLAS DE REPORTE (HOJAS COMPLETAS) */
        .pub-vf-report-sheet {
            position: absolute; inset: 0; background: #fff; z-index: 30; display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .pub-vf-report-sheet.show { transform: translateX(0); }
        .pub-vf-report-header { display: flex; align-items: center; justify-content: space-between; padding: 15px; border-bottom: 1px solid #eee; }
        .pub-vf-report-header span { font-weight: 700; font-size: 1.1rem; color: #000; }
        .pub-vf-report-back, .pub-vf-report-cerrar { background: transparent; border: 0; cursor: pointer; padding: 5px; }
        .pub-vf-report-content { padding: 20px; overflow-y: auto; }
        .pub-vf-report-content h2 { font-size: 1.2rem; color: #000; margin-bottom: 8px; }
        .pub-vf-report-content p { font-size: .85rem; color: #666; margin-bottom: 20px; }
        .pub-vf-report-option { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 16px 0; border: 0; border-bottom: 1px solid #eee; background: transparent; font-size: 1rem; font-weight: 600; color: #000; text-align: left; cursor: pointer; }
        .pub-vf-report-option:last-child { border-bottom: 0; }
        
        /* BOTÓN AZUL DE ENVIAR FINAL */
        .pub-vf-report-footer { padding: 15px 20px; border-top: 1px solid #eee; background: #fff; padding-bottom: calc(15px + env(safe-area-inset-bottom, 0px)); }
        .pub-vf-btn-enviar { width: 100%; padding: 16px; background: #1d7bf4; color: #fff; font-size: 1.1rem; font-weight: 700; border: 0; border-radius: 8px; cursor: pointer; }
        .pub-vf-btn-enviar:disabled { opacity: 0.7; }

        /* Reacciones y Comentarios */
        .reaccion-wrap { position: relative; display: inline-block; margin: 8px 0 0 0; padding: 0; }
        
        .reaccion-trigger { 
            display: inline-flex; align-items: center; justify-content: center; gap: 6px; 
            padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; 
            color: var(--text-muted, #8aa8b8); font-size: .82rem; font-weight: 600; 
            cursor: pointer; transition: background 0.2s, color 0.2s;
        }
        .reaccion-trigger:hover { background: rgba(255,255,255,.05); }
        .reaccion-trigger.activa { color: #3b82f6; }
        
        .reaccion-dropdown { 
            position: absolute; bottom: 100%; left: 0; margin-bottom: 8px; 
            display: flex; gap: 4px; 
            /* Ancho máximo ajustado para que quepan todos los emojis en móviles */
            max-width: min(320px, 90vw); 
            padding: 6px 10px; 
            background: #1c1f24; border-radius: 24px; 
            box-shadow: 0 6px 18px rgba(0,0,0,.5); 
            opacity: 0; visibility: hidden; 
            transform: translateY(8px) scale(.95); 
            transition: opacity .18s ease, transform .18s ease; 
            z-index: 100; 
        }
        .reaccion-dropdown.show { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0) scale(1); }
        
        .reaccion-dropdown button { 
            width: 38px; height: 38px; border: 0; border-radius: 50%; 
            background: transparent; font-size: 1.55rem; cursor: pointer; 
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.2s, background 0.2s;
            position: relative;
        }
        .reaccion-dropdown button:hover { transform: scale(1.3); background: rgba(255,255,255,0.1); }
        .reaccion-dropdown button.activa { background: rgba(59, 130, 246, 0.2); }
        
        /* Mini contador dentro del emoji */
        .reaccion-dropdown .mini-count {
            position: absolute; top: -2px; right: -2px;
            background: #3b82f6; color: white; font-size: 0.55rem; 
            font-weight: bold; padding: 2px 5px; border-radius: 10px;
            font-family: sans-serif;
        }

        .publicacion-card .stats { display: flex; align-items: center; gap: 4px; margin: 2px 0 0 0 !important; padding: 6px 0 0 0 !important; border-top: 1px solid rgba(255,255,255,.09); flex-wrap: wrap; }
        .btn-accion-pub { background: transparent !important; border: 0 !important; border-radius: 6px !important; padding: 6px 10px !important; color: var(--text-muted, #8aa8b8) !important; font-size: .82rem !important; font-weight: 600 !important; }
        .btn-accion-pub.danger { color: var(--danger, #ff3366) !important; }
        
        .comentarios-container { display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.09); }
        .comentarios-container.show { display: block; }
        .comentario-item { border-bottom: 0; padding: 6px 0; }
        .comentario-input-row input { background: transparent !important; border: 0 !important; border-bottom: 1px solid rgba(255,255,255,.12) !important; border-radius: 0 !important; padding: 6px 2px !important; }
        .comentario-input-row button { background: transparent !important; color: var(--gold, #D4AF37) !important; border: 0 !important; font-weight: 700 !important; }

        .avatar-placeholder { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; border-radius: 50%; background: #3b82f6; color: #fff; font-weight: 600; overflow: hidden; }
    `));
    document.head.appendChild(style);
})();

// ================================================================
// RESTO DE FUNCIONES (Moderación, Subida, Publicar, etc.)
// ================================================================

function esErrorModeracionPerfil(error) {
    var msg = ''; if (error) msg = String(error.message || '') + ' ' + String(error.code || '');
    return msg.indexOf('contenido_no_permitido') !== -1;
}

function htmlAvisoModeracionPerfil() {
    var aviso = document.createElement('div'); aviso.className = 'perfil-aviso-moderacion';
    var icono = document.createElement('span'); icono.className = 'perfil-aviso-moderacion-icono'; icono.textContent = '⚠️';
    var texto = document.createElement('span'); texto.textContent = 'Este mensaje contiene lenguaje inapropiado. Considera expresarte con respeto.';
    aviso.appendChild(icono); aviso.appendChild(texto); return aviso;
}

async function subirArchivoConModeracion(archivo, destino, tipo, token) {
    var fd = new FormData(); fd.append('file', archivo); fd.append('destino', destino); fd.append('tipo', tipo);
    var respuesta = await fetch('/api/media/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd });
    var data = null; try { data = await respuesta.json(); } catch (e) { data = {}; }
    if (!respuesta.ok || !data.ok) { var error = new Error(data && data.error ? data.error : 'No se pudo subir el archivo'); error.status = respuesta.status; throw error; }
    if (!data.url || !pubEsUrlSegura(data.url)) throw new Error('El servidor no devolvió una URL válida para el archivo.');
    return data;
}

async function descargarArchivoForzado(url, nombreOriginal) {
    var blobUrl = null;
    try {
        if (!pubEsUrlSegura(url)) throw new Error('La dirección del archivo no es válida.');
        if (window.showToast) window.showToast('Preparando descarga...', 'info', 2000);
        var response = await fetch(url); if (!response.ok) throw new Error('Error al descargar el archivo');
        var blob = await response.blob(); var extension = '';
        if (nombreOriginal && nombreOriginal.indexOf('.') !== -1) extension = nombreOriginal.split('.').pop().split('?')[0];
        else if (blob.type) { var mimeMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' }; extension = mimeMap[blob.type] || 'file'; }
        var nombreDescarga = 'descarga_' + Date.now() + '.' + extension;
        blobUrl = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = blobUrl; a.download = nombreDescarga; a.style.display = 'none';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        if (window.showToast) window.showToast('✅ Descarga iniciada', 'success', 2000);
    } catch (error) {
        if (window.showToast) window.showToast('❌ Error al descargar el archivo', 'error');
    } finally { if (blobUrl) setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 1000); }
}

function toggleEmojiPickerPerfil() { var picker = document.getElementById('emojiPickerPerfil'); if (!picker) return; if (picker.classList.contains('show')) { picker.classList.remove('show'); return; } var grid = document.getElementById('emojiGridPerfil'); if (grid && grid.children.length === 0) { pubEmojisPicker().forEach(function (emoji) { var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = emoji; btn.addEventListener('click', function (e) { e.stopPropagation(); insertarEmojiEnPerfil(emoji); picker.classList.remove('show'); }); grid.appendChild(btn); }); } picker.classList.add('show'); }
function insertarEmojiEnPerfil(emoji) { var input = document.getElementById('inputNuevaPublicacion'); if (!input) return; var start = input.selectionStart || 0; var end = input.selectionEnd || 0; var texto = input.value; input.value = texto.substring(0, start) + emoji + texto.substring(end); input.focus(); var posicion = start + emoji.length; input.selectionStart = posicion; input.selectionEnd = posicion; }
function insertarHashtagPerfil() { var input = document.getElementById('inputNuevaPublicacion'); if (!input) return; var start = input.selectionStart || 0; var end = input.selectionEnd || 0; var texto = input.value; input.value = texto.substring(0, start) + '#' + texto.substring(end); input.focus(); input.selectionStart = start + 1; input.selectionEnd = start + 1; }

function seleccionarArchivoPerfil(event, tipo) {
    var input = event && event.target ? event.target : null; var file = input && input.files ? input.files[0] : null; if (!file) return;
    if (tipo !== 'imagen' && tipo !== 'video') { if (window.showToast) window.showToast('Tipo de archivo no válido', 'error'); if (input) input.value = ''; return; }
    var otroTipo = tipo === 'imagen' ? 'video' : 'imagen';
    if (archivosSeleccionados[otroTipo]) { if (window.showToast) window.showToast('Por ahora puedes adjuntar una imagen o un video por publicación.', 'warning'); if (input) input.value = ''; return; }
    if (tipo === 'imagen') { if (file.size > 5 * 1024 * 1024) { if (window.showToast) window.showToast('Imagen mayor a 5 MB', 'error'); input.value = ''; return; } if (!file.type || file.type.indexOf('image/') !== 0) { if (window.showToast) window.showToast('Solo se permiten imágenes', 'error'); input.value = ''; return; } }
    else { if (file.size > 100 * 1024 * 1024) { if (window.showToast) window.showToast('Video mayor a 100 MB', 'error'); input.value = ''; return; } if (!file.type || file.type.indexOf('video/') !== 0) { if (window.showToast) window.showToast('Solo se permiten videos', 'error'); input.value = ''; return; } }
    archivosSeleccionados[tipo] = file; renderizarPreviewPerfil();
}

function renderizarPreviewPerfil() {
    var container = document.getElementById('previewArchivosPerfil'); if (!container) return; container.innerHTML = '';
    Object.keys(archivosSeleccionados).forEach(function (tipo) {
        var file = archivosSeleccionados[tipo]; if (!file) return; var wrapper = document.createElement('div'); wrapper.className = 'preview-item'; var reader = new FileReader();
        reader.onload = function (e) {
            if (!e.target || typeof e.target.result !== 'string') return; wrapper.innerHTML = ''; var media;
            if (tipo === 'imagen') { media = document.createElement('img'); media.alt = 'Vista previa'; } else if (tipo === 'video') { media = document.createElement('video'); media.muted = true; media.controls = true; } else { return; }
            media.src = e.target.result; var quitar = document.createElement('button'); quitar.type = 'button'; quitar.className = 'remove-btn'; quitar.textContent = '×'; quitar.addEventListener('click', function () { quitarArchivoPerfil(tipo); }); wrapper.appendChild(media); wrapper.appendChild(quitar);
        };
        reader.readAsDataURL(file); container.appendChild(wrapper);
    });
    if (archivosSeleccionados.imagen || archivosSeleccionados.video) {
        var controlDiv = document.createElement('div'); controlDiv.className = 'preview-download-control';
        var checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = 'chkPermitirDescarga'; checkbox.checked = true;
        var label = document.createElement('label'); label.htmlFor = 'chkPermitirDescarga'; label.textContent = 'Permitir que otros descarguen este archivo';
        controlDiv.appendChild(checkbox); controlDiv.appendChild(label); container.appendChild(controlDiv);
    }
}

function quitarArchivoPerfil(tipo) { if (tipo !== 'imagen' && tipo !== 'video') return; archivosSeleccionados[tipo] = null; var inputId = tipo === 'imagen' ? 'inputFotoPerfilPost' : 'inputVideoPerfilPost'; var input = document.getElementById(inputId); if (input) input.value = ''; renderizarPreviewPerfil(); }

async function publicarDesdePerfil() {
    var btn = document.getElementById('btnPublicarPerfil'); var input = document.getElementById('inputNuevaPublicacion'); var contenido = input ? input.value.trim() : '';
    if (!contenido && !archivosSeleccionados.imagen && !archivosSeleccionados.video) { if (window.showToast) window.showToast('Escribe algo o sube una foto/video', 'warning'); return; }
    var textoOriginalBtn = btn ? btn.innerHTML : 'Publicar'; if (btn && btn.disabled) return; if (btn) { btn.disabled = true; btn.innerHTML = 'Publicando...'; }
    try {
        var client = window.supabaseClient; if (!client) throw new Error('Supabase no está listo.');
        var sessionResult = await client.auth.getSession(); if (sessionResult.error) throw sessionResult.error;
        var session = sessionResult.data ? sessionResult.data.session : null; if (!session) { if (window.showToast) window.showToast('Inicia sesión para publicar', 'error'); return; }
        var token = session.access_token; var mediaUrl = null; var mediaType = null; var chkDescarga = document.getElementById('chkPermitirDescarga'); var permitirDescarga = chkDescarga ? chkDescarga.checked : true;
        if (archivosSeleccionados.imagen) { var resImg = await subirArchivoConModeracion(archivosSeleccionados.imagen, 'muro-videos', 'imagen', token); mediaUrl = resImg.url; mediaType = 'imagen'; }
        else if (archivosSeleccionados.video) { var resVid = await subirArchivoConModeracion(archivosSeleccionados.video, 'muro-videos', 'video', token); mediaUrl = resVid.url; mediaType = 'video'; }
        var insertResult = await client.from('publicaciones').insert({ usuario_id: session.user.id, contenido: contenido, media_url: mediaUrl, media_type: mediaType, estado: 'publicado', permitir_descarga: permitirDescarga }).select().single();
        if (insertResult.error) throw insertResult.error;
        if (window.showToast) window.showToast('¡Publicación creada!', 'success');
        if (input) input.value = ''; archivosSeleccionados.imagen = null; archivosSeleccionados.video = null; if (document.getElementById('inputFotoPerfilPost')) document.getElementById('inputFotoPerfilPost').value = ''; if (document.getElementById('inputVideoPerfilPost')) document.getElementById('inputVideoPerfilPost').value = ''; renderizarPreviewPerfil(); await cargarMisPublicaciones(true);
    } catch (error) { if (window.showToast) window.showToast(esErrorModeracionPerfil(error) ? '❌ Contenido no permitido' : '❌ ' + (error.message || 'No se pudo crear la publicación'), 'error'); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = textoOriginalBtn; } }
}

var videoObserverPerfil = null;
if (typeof IntersectionObserver !== 'undefined') {
    videoObserverPerfil = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            var video = entry.target; var autoPlayPref = 'true'; try { autoPlayPref = localStorage.getItem('contenido_auto_reproducir'); } catch (e) {}
            if (entry.isIntersecting && (autoPlayPref === null || autoPlayPref === 'true')) { video.muted = true; var playResult = video.play(); if (playResult && typeof playResult.catch === 'function') playResult.catch(function () {}); } else { video.pause(); }
        });
    }, { threshold: 0.5 });
}

var pubVersionRender = 0;
async function cargarMisPublicaciones(forzarRefresco) {
    var container = document.getElementById('misPublicacionesList'); var contador = document.getElementById('misPostsCount'); if (!container) return;
    var versionActual = ++pubVersionRender;
    try {
        var client = window.supabaseClient; if (!client) { if (!forzarRefresco) setTimeout(function () { cargarMisPublicaciones(true); }, 1000); return; }
        var sessionResult = await client.auth.getSession(); if (sessionResult.error) throw sessionResult.error;
        var session = sessionResult.data ? sessionResult.data.session : null; if (!session) { container.innerHTML = '<div class="empty-state"><h4>Inicia sesión</h4></div>'; if (contador) contador.textContent = '0'; return; }
        var result = await client.from('publicaciones_publicas').select('*').eq('usuario_id', session.user.id).order('created_at', { ascending: false }).limit(50); if (result.error) throw result.error;
        if (versionActual !== pubVersionRender) return;
        
        var publicaciones = result.data || []; 
        
        // FILTRAR PUBLICACIONES OCULTAS
        try {
            const { data: ocultas } = await client.from('publicaciones_ocultas').select('publicacion_id').eq('usuario_id', session.user.id);
            if (ocultas && ocultas.length > 0) {
                const idsOcultos = ocultas.map(o => o.publicacion_id);
                publicaciones = publicaciones.filter(p => !idsOcultos.includes(p.id));
            }
        } catch (e) { console.warn('No se pudieron cargar ocultas', e); }

        if (contador) contador.textContent = publicaciones.length;
        if (publicaciones.length === 0) { container.innerHTML = '<div class="empty-state"><h4>Sin publicaciones aún</h4><p>Publica algo para verlo aquí</p></div>'; window.listaMultimediaPerfil = []; return; }
        container.innerHTML = ''; window.listaMultimediaPerfil = [];
        var reaccionesUsuario = {}; var conteosReacciones = {}; var idsPublicaciones = publicaciones.map(function (p) { return p.id; }).filter(Boolean);
        
        if (idsPublicaciones.length > 0) {
            try {
                var reaccResult = await client.from('publicaciones_reacciones').select('publicacion_id, tipo, usuario_id').in('publicacion_id', idsPublicaciones);
                if (!reaccResult.error && reaccResult.data) { reaccResult.data.forEach(function (r) { if (!conteosReacciones[r.publicacion_id]) conteosReacciones[r.publicacion_id] = {}; var tipos = conteosReacciones[r.publicacion_id]; tipos[r.tipo] = (tipos[r.tipo] || 0) + 1; if (r.usuario_id === session.user.id) reaccionesUsuario[r.publicacion_id] = r.tipo; }); }
            } catch (errorReacciones) { console.error(errorReacciones); }
        }
        if (versionActual !== pubVersionRender) return;
        var miId = session.user.id;
        publicaciones.forEach(function (p) {
            var nombreReal = pubEscapeHtml(p.usuario_nombre || 'Explorador'); var handleSeguro = pubEscapeHtml(p.usuario_handle || ''); var urlAutor = pubUrlPerfilAutor(p.usuario_handle, p.usuario_id, miId);
            var card = document.createElement('div'); card.className = 'publicacion-card'; card.dataset.id = p.id;
            var header = document.createElement('div'); header.className = 'header';
            var avatarBox = document.createElement(urlAutor ? 'a' : 'div'); avatarBox.className = 'avatar' + (urlAutor ? ' pub-autor-avatar-enlace' : '');
            if (urlAutor) { avatarBox.href = urlAutor; }
            avatarBox.appendChild(pubCrearAvatar(p.usuario_nombre, p.usuario_avatar_url)); header.appendChild(avatarBox);
            var headerMeta = document.createElement('div'); var handleHtml = handleSeguro ? ' <span class="pub-autor-handle">@' + handleSeguro + '</span>' : '';
            var nombreHtml = '<span class="nombre" data-no-traducir="1"><span class="pub-autor-nombre">' + nombreReal + '</span>' + handleHtml + '</span>';
            var nombreBloque = urlAutor ? '<a class="pub-autor-enlace" href="' + pubEscapeHtml(urlAutor) + '">' + nombreHtml + '</a>' : '<div class="nombre" data-no-traducir="1">' + nombreReal + handleHtml + '</div>';
            headerMeta.innerHTML = nombreBloque + '<div class="fecha" data-no-traducir="1">' + (p.created_at ? pubEscaparHTML(new Date(p.created_at).toLocaleString(pubCodigoIdioma())) : '') + '</div>';
            header.appendChild(headerMeta); card.appendChild(header);
            if (p.aviso_moderacion === 'lenguaje_inapropiado') card.appendChild(htmlAvisoModeracionPerfil());
            var contenido = document.createElement('div'); contenido.className = 'contenido'; contenido.setAttribute('data-no-traducir', '1');
            if (p.contenido) { var texto = document.createElement('div'); texto.textContent = p.contenido; contenido.appendChild(texto); }
            if (pubEsUrlSegura(p.media_url)) {
                var tipoMedia = p.media_type;
                if (tipoMedia === 'video' || tipoMedia === 'imagen') {
                    var indexEnLista = window.listaMultimediaPerfil.length; window.listaMultimediaPerfil.push({ url: p.media_url, tipo: tipoMedia, permiteDescarga: p.permitir_descarga !== false });
                    var wrapMedia = document.createElement('div'); wrapMedia.className = 'pub-media-wrap'; var mediaEl;
                    if (tipoMedia === 'video') { mediaEl = document.createElement('video'); mediaEl.controls = true; mediaEl.preload = 'metadata'; mediaEl.src = p.media_url; mediaEl.playsInline = true; var autoplayInicial = 'true'; try { autoplayInicial = localStorage.getItem('contenido_auto_reproducir'); } catch (e) {} mediaEl.muted = autoplayInicial !== 'false'; if (videoObserverPerfil) videoObserverPerfil.observe(mediaEl); }
                    else { mediaEl = document.createElement('img'); mediaEl.alt = 'Imagen'; mediaEl.loading = 'lazy'; mediaEl.src = p.media_url; mediaEl.addEventListener('click', function (e) { e.stopPropagation(); pubAbrirVisor(indexEnLista, p.id); }); }
                    
                    wrapMedia.appendChild(mediaEl); contenido.appendChild(wrapMedia);
                }
            }
            card.appendChild(contenido);
            var reaccionUsuario = reaccionesUsuario[p.id] || null; var conteos = conteosReacciones[p.id] || {}; var totalReacciones = 0; Object.keys(conteos).forEach(function (k) { totalReacciones += conteos[k] || 0; }); var emojiMostrado = reaccionUsuario || '❤️';
            var wrap = document.createElement('div'); wrap.className = 'reaccion-wrap'; var dropdown = document.createElement('div'); dropdown.className = 'reaccion-dropdown'; dropdown.id = 'reaccion-dropdown-' + p.id;
            
            // CONSTRUIR EL DROPDOWN CON TODOS LOS EMOJIS
            pubEmojisReaccion().forEach(function (emoji) {
                var b = document.createElement('button'); b.textContent = emoji; if (reaccionUsuario === emoji) b.classList.add('activa'); 
                b.addEventListener('click', function (ev) { 
                    ev.stopPropagation(); 
                    dropdown.classList.remove('show'); // Ocultar menú tras reaccionar
                    reaccionarPublicacionPerfil(p.id, emoji); 
                });
                if (conteos[emoji] > 0) { var mini = document.createElement('span'); mini.className = 'mini-count'; mini.textContent = conteos[emoji]; b.appendChild(mini); } 
                dropdown.appendChild(b);
            });
            
            var trigger = document.createElement('button'); 
            trigger.className = 'reaccion-trigger' + (reaccionUsuario ? ' activa' : ''); 
            var emojiActual = document.createElement('span'); emojiActual.className = 'emoji-actual'; emojiActual.textContent = emojiMostrado; 
            var countActual = document.createElement('span'); countActual.className = 'count'; countActual.textContent = totalReacciones > 0 ? String(totalReacciones) : 'Reaccionar';
            trigger.appendChild(emojiActual); trigger.appendChild(countActual); 
            
            // EVENTO PRINCIPAL: Al dar clic en el botón, se abre el menú de emojis
            trigger.addEventListener('click', function (e) { 
                e.stopPropagation(); 
                // Si el dropdown ya está abierto, lo cerramos. Si no, cerramos los demás y lo abrimos.
                var estaAbierto = dropdown.classList.contains('show');
                document.querySelectorAll('.reaccion-dropdown.show').forEach(function (el) { el.classList.remove('show'); });
                if (!estaAbierto) dropdown.classList.add('show');
            });
            
            wrap.appendChild(dropdown); wrap.appendChild(trigger);
            var stats = document.createElement('div'); stats.className = 'stats'; stats.appendChild(wrap);
            var btnComentarios = document.createElement('button'); btnComentarios.className = 'btn-accion-pub'; btnComentarios.textContent = 'Comentarios'; btnComentarios.addEventListener('click', function (ev) { ev.stopPropagation(); toggleComentariosPerfil(p.id); });
            var btnEliminar = document.createElement('button'); btnEliminar.className = 'btn-accion-pub danger'; btnEliminar.textContent = 'Eliminar'; btnEliminar.addEventListener('click', function (ev) { ev.stopPropagation(); eliminarMiPublicacion(p.id, ev); });
            stats.appendChild(btnComentarios); stats.appendChild(btnEliminar); card.appendChild(stats);
            var comentariosContainer = document.createElement('div'); comentariosContainer.className = 'comentarios-container'; comentariosContainer.id = 'comentarios-container-' + p.id; comentariosContainer.dataset.dueno = p.usuario_id || '';
            var comentariosLista = document.createElement('div'); comentariosLista.className = 'comentarios-lista'; comentariosLista.id = 'comentarios-lista-' + p.id;
            var filaComentario = document.createElement('div'); filaComentario.className = 'comentario-input-row';
            var inputComentario = document.createElement('input'); inputComentario.type = 'text'; inputComentario.id = 'comentario-input-' + p.id; inputComentario.placeholder = 'Escribe un comentario...'; inputComentario.maxLength = 2000;
            var btnEnviarComentario = document.createElement('button'); btnEnviarComentario.textContent = 'Enviar'; btnEnviarComentario.addEventListener('click', function () { enviarComentarioPerfil(p.id); });
            inputComentario.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviarComentarioPerfil(p.id); } });
            filaComentario.appendChild(inputComentario); filaComentario.appendChild(btnEnviarComentario); comentariosContainer.appendChild(comentariosLista); comentariosContainer.appendChild(filaComentario); card.appendChild(comentariosContainer);
            container.appendChild(card);
        });
    } catch (error) {
        if (versionActual === pubVersionRender) { container.innerHTML = '<div class="empty-state"><h4>Error al cargar</h4><p>' + pubEscapeHtml(error.message || 'Intenta nuevamente.') + '</p></div>'; }
    }
}

// Función que antes no se usaba, pero la mantenemos para compatibilidad
function toggleReaccionDropdown(postId, forzarApertura) { var dd = document.getElementById('reaccion-dropdown-' + postId); if (!dd) return; var esta = dd.classList.contains('show'); document.querySelectorAll('.reaccion-dropdown.show').forEach(function (el) { el.classList.remove('show'); }); if (forzarApertura === true || !esta) dd.classList.add('show'); }

// Cerrar dropdowns al hacer clic fuera de ellos
document.addEventListener('click', function (e) { if (!e.target.closest('.reaccion-wrap')) { document.querySelectorAll('.reaccion-dropdown.show').forEach(function (el) { el.classList.remove('show'); }); } });

async function refrescarReaccionesPublicacion(postId) {
    var client = window.supabaseClient; if (!client) return; var card = document.querySelector('.publicacion-card[data-id="' + postId + '"]'); if (!card) return;
    var sessionResult = await client.auth.getSession(); var session = sessionResult.data ? sessionResult.data.session : null; var uid = session ? session.user.id : null;
    var result = await client.from('publicaciones_reacciones').select('tipo, usuario_id').eq('publicacion_id', postId);
    var conteos = {}; var usuarioTipo = null;
    (result.data || []).forEach(function (r) { conteos[r.tipo] = (conteos[r.tipo] || 0) + 1; if (uid && r.usuario_id === uid) usuarioTipo = r.tipo; });
    var total = 0; Object.keys(conteos).forEach(function (tipo) { total += conteos[tipo]; });
    var dominante = Object.keys(conteos).sort(function (a, b) { return conteos[b] - conteos[a]; })[0]; var emojiMostrado = usuarioTipo || dominante || '❤️';
    var trigger = card.querySelector('.reaccion-trigger'); 
    if (trigger) { 
        trigger.classList.toggle('activa', Boolean(usuarioTipo)); 
        var emojiActual = trigger.querySelector('.emoji-actual'); 
        var countActual = trigger.querySelector('.count'); 
        if (emojiActual) emojiActual.textContent = emojiMostrado; 
        if (countActual) countActual.textContent = total > 0 ? String(total) : 'Reaccionar'; 
    }
}

var pubReaccionesEnProceso = {};
async function reaccionarPublicacionPerfil(postId, emoji) {
    if (!pubEmojisReaccion().includes(emoji) || pubReaccionesEnProceso[postId]) return; var client = window.supabaseClient; if (!client) return; pubReaccionesEnProceso[postId] = true;
    try {
        var sessionResult = await client.auth.getSession(); var session = sessionResult.data ? sessionResult.data.session : null; if (!session) return;
        var existing = await client.from('publicaciones_reacciones').select('id, tipo').eq('publicacion_id', postId).eq('usuario_id', session.user.id).maybeSingle();
        if (existing.data && existing.data.tipo === emoji) await client.from('publicaciones_reacciones').delete().eq('id', existing.data.id);
        else if (existing.data) await client.from('publicaciones_reacciones').update({ tipo: emoji }).eq('id', existing.data.id);
        else await client.from('publicaciones_reacciones').insert({ publicacion_id: postId, usuario_id: session.user.id, tipo: emoji });
        await refrescarReaccionesPublicacion(postId);
    } catch (error) { console.error(error); } finally { delete pubReaccionesEnProceso[postId]; }
}

async function toggleComentariosPerfil(publicacionId) { var container = document.getElementById('comentarios-container-' + publicacionId); if (!container) return; if (container.classList.contains('show')) { container.classList.remove('show'); return; } container.classList.add('show'); await cargarComentariosPerfil(publicacionId); }

async function cargarComentariosPerfil(publicacionId) {
    var lista = document.getElementById('comentarios-lista-' + publicacionId); if (!lista) return; var contenedor = document.getElementById('comentarios-container-' + publicacionId); var duenoId = contenedor ? contenedor.dataset.dueno : ''; lista.textContent = 'Cargando...';
    try {
        var client = window.supabaseClient; var sessionResult = await client.auth.getSession(); var session = sessionResult.data ? sessionResult.data.session : null; var uid = session ? session.user.id : null; var soyDueno = Boolean(uid && duenoId && uid === duenoId);
        var result = await client.from('publicaciones_comentarios_publicos').select('*').eq('publicacion_id', publicacionId).order('created_at', { ascending: true }); var comentarios = result.data || [];
        if (comentarios.length === 0) { lista.textContent = 'Sin comentarios.'; return; } lista.innerHTML = '';
        comentarios.forEach(function (c) {
            var item = document.createElement('div'); item.className = 'comentario-item'; var avatarMini = document.createElement('div'); avatarMini.className = 'avatar-mini'; avatarMini.appendChild(pubCrearAvatar(c.usuario_nombre, c.usuario_avatar_url)); item.appendChild(avatarMini);
            var contenidoDiv = document.createElement('div'); contenidoDiv.className = 'contenido-comentario'; var nombre = document.createElement('div'); nombre.className = 'nombre'; nombre.textContent = c.usuario_nombre || 'Usuario'; contenidoDiv.appendChild(nombre);
            var textoDiv = document.createElement('div'); textoDiv.className = 'texto'; textoDiv.textContent = c.contenido || ''; contenidoDiv.appendChild(textoDiv);
            var fechaDiv = document.createElement('div'); fechaDiv.className = 'fecha'; fechaDiv.textContent = c.created_at ? new Date(c.created_at).toLocaleString(pubCodigoIdioma()) : ''; contenidoDiv.appendChild(fechaDiv);
            if (uid && (c.usuario_id === uid || soyDueno)) { var btnDel = document.createElement('button'); btnDel.className = 'comentario-eliminar'; btnDel.textContent = 'Eliminar'; btnDel.addEventListener('click', function (ev) { ev.stopPropagation(); eliminarComentarioPerfil(c.id, publicacionId); }); contenidoDiv.appendChild(btnDel); }
            item.appendChild(contenidoDiv); lista.appendChild(item);
        });
    } catch (error) { lista.textContent = 'Error al cargar comentarios.'; }
}

var pubComentariosEnProceso = {};
async function enviarComentarioPerfil(publicacionId) {
    var input = document.getElementById('comentario-input-' + publicacionId); var texto = input ? input.value.trim() : ''; if (!texto || pubComentariosEnProceso[publicacionId]) return;
    var client = window.supabaseClient; if (!client) return; pubComentariosEnProceso[publicacionId] = true;
    try {
        var sessionResult = await client.auth.getSession(); var session = sessionResult.data ? sessionResult.data.session : null; if (!session) return;
        await client.from('publicaciones_comentarios').insert({ publicacion_id: publicacionId, usuario_id: session.user.id, contenido: texto, created_at: new Date().toISOString() });
        if (input) input.value = ''; await cargarComentariosPerfil(publicacionId);
    } catch (error) { if (window.showToast) window.showToast('Error al enviar comentario', 'error'); } finally { delete pubComentariosEnProceso[publicacionId]; }
}

async function eliminarComentarioPerfil(comentarioId, publicacionId) {
    if (!confirm('¿Eliminar este comentario?')) return;
    try { var client = window.supabaseClient; await client.from('publicaciones_comentarios').delete().eq('id', comentarioId); await cargarComentariosPerfil(publicacionId); } catch (e) { if (window.showToast) window.showToast('Error al eliminar comentario', 'error'); }
}

async function liberarArchivoPublicacion(mediaUrl) {
    if (!mediaUrl) return;
    try { var client = window.supabaseClient; var sessionResult = await client.auth.getSession(); var token = sessionResult.data && sessionResult.data.session ? sessionResult.data.session.access_token : null; if (!token) return; await fetch('/api/media/liberar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ url: mediaUrl }) }); } catch (e) {}
}

async function eliminarMiPublicacion(publicacionId, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); } if (!confirm('¿Seguro que quieres eliminar esta publicación?')) return;
    try { var client = window.supabaseClient; var pubRes = await client.from('publicaciones').select('media_url').eq('id', publicacionId).maybeSingle(); var mediaUrl = pubRes.data ? pubRes.data.media_url : null; await client.from('publicaciones').delete().eq('id', publicacionId); await liberarArchivoPublicacion(mediaUrl); await cargarMisPublicaciones(true); } catch (error) { if (window.showToast) window.showToast('Error al eliminar publicación', 'error'); }
}

window.descargarArchivoForzado = descargarArchivoForzado;
window.publicarDesdePerfil = publicarDesdePerfil;
window.seleccionarArchivoPerfil = seleccionarArchivoPerfil;
window.quitarArchivoPerfil = quitarArchivoPerfil;
window.toggleEmojiPickerPerfil = toggleEmojiPickerPerfil;
window.insertarHashtagPerfil = insertarHashtagPerfil;
window.eliminarComentarioPerfil = eliminarComentarioPerfil;
window.cargarMisPublicaciones = cargarMisPublicaciones;
window.reaccionarPublicacionPerfil = reaccionarPublicacionPerfil;
window.toggleComentariosPerfil = toggleComentariosPerfil;
window.enviarComentarioPerfil = enviarComentarioPerfil;
window.pubUrlPerfilAutor = pubUrlPerfilAutor;
window.pubAbrirVisor = pubAbrirVisor;
window.pubCerrarVisor = pubCerrarVisor;