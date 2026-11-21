// ================================================================
// MENSAJES · ESTADOS (HISTORIAS) v3.1 · MÓDULO 5 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-estados.js
//
// CSARIEL'S ECOSYSTEM
//
// - Integración con el sistema de historias de Mensajes.
// - Sin alertas, confirmaciones ni controles nativos del navegador.
// - Interfaz integrada con NeonModal y toast del ecosistema.
// - Publicación múltiple: hasta 5 videos y 10 imágenes activas.
// - Cada video: máximo 60 segundos y 25 MB.
// - Cada imagen: máximo 10 MB.
// - Cada archivo se publica individualmente.
// - Visor multimedia adaptable a móvil y pantalla completa.
// - Imágenes y videos sin deformaciones.
// - Historias activas durante 24 horas.
// - Vistas y comentarios integrados.
// - Control de propiedad al eliminar.
// - Limpieza de temporizadores y recursos multimedia.
// - No crea tablas, columnas, RPC ni buckets automáticamente.
// ================================================================

'use strict';

/* ================================================================
   CONFIGURACIÓN
================================================================ */

const ICO_ESTADO = {
    eye: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    chat: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>'
};

const ESTADOS_MAX_VIDEOS = 5;
const ESTADOS_MAX_IMAGENES = 10;
const ESTADOS_MAX_VIDEO_MB = 25;
const ESTADOS_MAX_IMAGEN_MB = 10;
const ESTADOS_MAX_VIDEO_SEGUNDOS = 60;
const ESTADOS_DURACION_IMAGEN = 5;
const ESTADOS_TTL_FALLBACK = 86400000;

let estadosCache = [];
let estadoActualIndex = 0;
let estadoActualUserId = null;
let estadoTimer = null;
let estadoProgresoActual = 0;
let estadoPausado = false;
let estadosArchivosSeleccionados = [];
let estadosSubiendo = false;
let estadoGeneracionVisor = 0;
let estadoGeneracionPreview = 0;
let estadoModalAbierto = false;

/* ================================================================
   UTILIDADES GENERALES
================================================================ */

function estadoElemento(id) {
    return document.getElementById(id);
}

function ocultarEl(id) {
    const elemento = estadoElemento(id);

    if (elemento) {
        elemento.classList.add('hidden');
    }
}

function mostrarEl(id) {
    const elemento = estadoElemento(id);

    if (elemento) {
        elemento.classList.remove('hidden');
    }
}

function estadoEscapar(valor) {
    if (typeof esc === 'function') {
        return esc(String(valor == null ? '' : valor));
    }

    return String(valor == null ? '' : valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function estadoAvisar(mensaje, tipo) {
    if (typeof toast === 'function') {
        toast(mensaje, tipo || 'info');
    }
}

function estadoFechaExpiracion() {
    const ttl = (
        typeof ESTADOS_TTL_MS === 'number' &&
        ESTADOS_TTL_MS > 0
    ) ? ESTADOS_TTL_MS : ESTADOS_TTL_FALLBACK;

    return new Date(Date.now() + ttl).toISOString();
}

function estadoEsNuevo(estado) {
    if (!window.__estadosVistosIds) {
        return true;
    }

    return !window.__estadosVistosIds.has(estado.id);
}

function estadoEsVideo(estado) {
    if (!estado) return false;

    if (estado.media_tipo === 'video') {
        return true;
    }

    const url = estado.media_url || estado.imagen_url || '';

    return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

function estadoObtenerURL(estado) {
    if (!estado) return '';

    return estado.media_url || estado.imagen_url || '';
}

function estadoTiempoDetener() {
    if (estadoTimer) {
        clearInterval(estadoTimer);
        estadoTimer = null;
    }
}

function estadoDetenerVideo() {
    const video = estadoElemento('evVideo');

    if (!video) return;

    video.pause();
    video.onended = null;
    video.ontimeupdate = null;
    video.onloadedmetadata = null;
    video.removeAttribute('src');

    try {
        video.load();
    } catch (e) {}
}

function estadoLimpiarPreviews() {
    estadosArchivosSeleccionados.forEach(function (item) {
        if (item && item.url) {
            try {
                URL.revokeObjectURL(item.url);
            } catch (e) {}
        }
    });

    estadosArchivosSeleccionados = [];
}

function estadoObtenerPathStorage(url) {
    if (!url) return null;

    const coincidencia = String(url).match(
        /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/
    );

    if (coincidencia) {
        try {
            return decodeURIComponent(coincidencia[2]);
        } catch (e) {
            return coincidencia[2];
        }
    }

    if (
        !/^https?:\/\//i.test(url) &&
        String(url).indexOf('/') !== -1
    ) {
        return String(url).split('?')[0];
    }

    return null;
}

function estadoEsMiHistoria(estado) {
    return !!(
        estado &&
        user &&
        estado.usuario_id === user.id
    );
}

function haceTiempo(fecha) {
    if (!fecha) return 'hace tiempo';

    const tiempo = new Date(fecha).getTime();

    if (!isFinite(tiempo)) return 'hace tiempo';

    const diferencia = Math.max(0, Date.now() - tiempo);
    const minutos = Math.floor(diferencia / 60000);

    if (minutos < 1) return 'ahora';
    if (minutos < 60) return 'hace ' + minutos + ' min';

    const horas = Math.floor(minutos / 60);

    if (horas < 24) return 'hace ' + horas + ' h';

    return 'hace ' + Math.floor(horas / 24) + ' d';
}

function avatarInicialHTML(nombre, avatarUrl) {
    if (avatarUrl) {
        return '<img src="' + estadoEscapar(avatarUrl) +
            '" alt="" loading="lazy">';
    }

    return estadoEscapar(
        String(nombre || 'U').charAt(0).toUpperCase()
    );
}

function urlPerfil(handle, uid) {
    if (handle) {
        return '/features/perfil/perfil-publico.html?u=' +
            encodeURIComponent(handle);
    }

    if (uid) {
        return '/features/perfil/perfil-publico.html?id=' +
            encodeURIComponent(uid);
    }

    return null;
}

/* ================================================================
   ESTILOS DEL ECOSISTEMA
   CSS LOCAL DEL MÓDULO. NO ALTERA EL RESTO DE MENSAJES.
================================================================ */

function estadoInstalarEstilos() {
    if (estadoElemento('mensajes-estados-responsive-css')) {
        return;
    }

    const style = document.createElement('style');

    style.id = 'mensajes-estados-responsive-css';

    style.textContent = `
        #estadoViewer {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            max-height: 100dvh !important;
            overflow: hidden !important;
            background: #05080f !important;
            z-index: 99999 !important;
            box-sizing: border-box !important;
        }

        #estadoViewer *,
        #estadoUploadModal *,
        #vistasModal * {
            box-sizing: border-box;
        }

        #estadoViewer .estado-media-stage {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            overflow: hidden !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: #05080f !important;
        }

        #estadoViewer #evImage,
        #estadoViewer #evVideo {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            margin: auto !important;
            object-fit: contain !important;
            object-position: center center !important;
            background: #05080f !important;
            border: 0 !important;
        }

        #estadoViewer #evVideo {
            z-index: 2;
        }

        #estadoViewer #evImage {
            z-index: 1;
        }

        #estadoViewer .hidden,
        #estadoUploadModal .hidden,
        #vistasModal .hidden {
            display: none !important;
        }

        #estadoUploadModal .estado-preview-grid {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(105px, 1fr));
            gap: 10px;
            width: 100%;
            max-width: 100%;
            min-width: 0;
        }

        #estadoUploadModal .estado-preview-item {
            position: relative;
            min-width: 0;
            width: 100%;
            aspect-ratio: 9 / 16;
            overflow: hidden;
            background: #05080f;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 12px;
        }

        #estadoUploadModal .estado-preview-item img,
        #estadoUploadModal .estado-preview-item video {
            display: block;
            width: 100%;
            height: 100%;
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            object-position: center;
            background: #05080f;
        }

        #estadoUploadModal .estado-preview-numero {
            position: absolute;
            top: 7px;
            left: 7px;
            z-index: 3;
            padding: 4px 8px;
            border-radius: 20px;
            color: #fff;
            background: rgba(5,8,15,.8);
            font-size: 11px;
            pointer-events: none;
        }

        #estadoUploadModal .estado-preview-controles {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 10px;
            color: inherit;
            font-size: 12px;
        }

        #estadoUploadModal .estado-preview-eliminar {
            position: absolute;
            top: 7px;
            right: 7px;
            z-index: 4;
            width: 28px;
            height: 28px;
            border: 1px solid rgba(255,255,255,.25);
            border-radius: 50%;
            background: rgba(5,8,15,.88);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
        }

        #estadoUploadModal .estado-preview-eliminar:disabled {
            opacity: .4;
            cursor: default;
        }

        #estadoUploadModal .estado-preview-progreso {
            height: 3px;
            width: 100%;
            margin-top: 5px;
            overflow: hidden;
            border-radius: 5px;
            background: rgba(255,255,255,.12);
        }

        #estadoUploadModal .estado-preview-progreso > span {
            display: block;
            height: 100%;
            width: 100%;
            background: #D4AF37;
        }

        #estadoUploadModal .estado-preview-info {
            min-width: 0;
            overflow-wrap: anywhere;
            font-size: 11px;
            opacity: .8;
            padding: 5px 2px;
        }

        #estadoUploadModal #estadoPreviewWrap {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            overflow: hidden;
        }

        #estadoUploadModal #estadoPreviewImg,
        #estadoUploadModal #estadoPreviewVideo {
            display: block;
            width: 100%;
            max-width: 100%;
            max-height: min(60vh, 620px);
            max-height: min(60dvh, 620px);
            object-fit: contain;
            background: #05080f;
        }

        #estadoUploadModal .estado-preview-contador {
            margin-top: 10px;
            font-size: 12px;
            opacity: .8;
        }

        #estadoUploadModal .estado-progreso-publicacion {
            width: 100%;
            height: 3px;
            overflow: hidden;
            border-radius: 5px;
            background: rgba(255,255,255,.12);
            margin-top: 10px;
        }

        #estadoUploadModal .estado-progreso-publicacion span {
            display: block;
            width: 0;
            height: 100%;
            background: #D4AF37;
            transition: width .2s ease;
        }

        #vistasModal .estado-tabs {
            display: flex;
            gap: 18px;
            border-bottom: 1px solid rgba(255,255,255,.12);
            margin-bottom: 12px;
        }

        #vistasModal .estado-tab {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            border: 0;
            border-bottom: 2px solid transparent;
            padding: 10px 2px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font: inherit;
        }

        #vistasModal .estado-tab.active {
            border-bottom-color: #D4AF37;
            color: #D4AF37;
        }

        #vistasModal .estado-tab .ico {
            width: 17px;
            height: 17px;
        }

        #vistasModal .estado-panel-msg {
            padding: 22px 12px;
            text-align: center;
            opacity: .75;
        }

        #vistasModal .estado-result {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 11px 2px;
            border-bottom: 1px solid rgba(255,255,255,.08);
            cursor: pointer;
        }

        #vistasModal .estado-result .avatar {
            flex: 0 0 40px;
            width: 40px;
            height: 40px;
            overflow: hidden;
            border-radius: 50%;
        }

        #vistasModal .estado-result .avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        #vistasModal .estado-result-info {
            min-width: 0;
            flex: 1;
        }

        #vistasModal .estado-result-meta {
            margin-top: 3px;
            font-size: 12px;
            opacity: .65;
        }

        #vistasModal .estado-comentario {
            margin-top: 5px;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
        }

        #estadoUploadModal .estado-upload-error {
            padding: 10px 0;
            color: #ff8d8d;
            font-size: 12px;
        }

        #estadosScroll .estado-video-thumb {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            color: #D4AF37;
            background: #101722;
        }

        @media (max-width: 480px) {
            #estadoUploadModal .estado-preview-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 7px;
            }

            #estadoUploadModal .estado-preview-item {
                border-radius: 9px;
            }
        }
    `;

    document.head.appendChild(style);
}

function estadoAplicarVisorCompleto() {
    estadoInstalarEstilos();

    const viewer = estadoElemento('estadoViewer');

    if (!viewer) return;

    viewer.classList.add('estado-viewer-responsive');

    const imagen = estadoElemento('evImage');
    const video = estadoElemento('evVideo');
    const media = imagen || video;

    if (media && media.parentElement) {
        media.parentElement.classList.add('estado-media-stage');
    }

    [imagen, video].forEach(function (elemento) {
        if (!elemento) return;

        elemento.style.objectFit = 'contain';
        elemento.style.objectPosition = 'center center';
        elemento.style.maxWidth = '100%';
        elemento.style.maxHeight = '100%';
    });
}

/* ================================================================
   REGISTRO Y CONSULTA DE VISTAS
================================================================ */

async function registrarVistaEstado(estadoId) {
    if (!user || !estadoId) return;

    try {
        const resultado = await db.from('estados_vistas').upsert(
            {
                estado_id: estadoId,
                usuario_id: user.id
            },
            {
                onConflict: 'estado_id,usuario_id',
                ignoreDuplicates: true
            }
        );

        if (!resultado.error) {
            if (!window.__estadosVistosIds) {
                window.__estadosVistosIds = new Set();
            }

            window.__estadosVistosIds.add(estadoId);
        }
    } catch (e) {
        console.warn('[Estados] No se pudo registrar la vista:', e);
    }
}

async function obtenerVistasEstado(estadoId) {
    try {
        const resultado = await db.from('estados_vistas')
            .select('id', {
                count: 'exact',
                head: true
            })
            .eq('estado_id', estadoId);

        if (resultado.error) {
            throw resultado.error;
        }

        return resultado.count || 0;
    } catch (e) {
        console.warn('[Estados] No se pudieron consultar las vistas:', e);
        return 0;
    }
}

/* ================================================================
   CARGAR HISTORIAS DEL ECOSISTEMA
================================================================ */

async function cargarEstados() {
    const scroll = estadoElemento('estadosScroll');

    if (!scroll || !user) return;

    scroll.innerHTML = '<div class="estados-vacio">Cargando historias...</div>';

    try {
        let filas = [];

        const rpc = await db.rpc('estados_mensajes_activos');

        if (!rpc.error && Array.isArray(rpc.data)) {
            if (
                rpc.data.length > 0 &&
                Array.isArray(rpc.data[0].estados)
            ) {
                rpc.data.forEach(function (grupo) {
                    (grupo.estados || []).forEach(function (estado) {
                        filas.push({
                            id: estado.id,
                            usuario_id: grupo.usuario_id,
                            imagen_url: estado.imagen_url,
                            media_url: estado.media_url,
                            media_tipo: estado.media_tipo,
                            duracion_segundos: estado.duracion_segundos,
                            caption: estado.caption,
                            created_at: estado.created_at,
                            expires_at: estado.expires_at,
                            origen: 'mensajes'
                        });
                    });
                });
            } else {
                filas = rpc.data.map(function (estado) {
                    return Object.assign({}, estado, {
                        origen: estado.origen || 'mensajes'
                    });
                });
            }
        } else {
            if (rpc.error) {
                console.warn(
                    '[Estados] RPC estados_mensajes_activos:',
                    rpc.error.message
                );
            }

            const consulta = await db.from('estados')
                .select(
                    'id, usuario_id, imagen_url, media_url, media_tipo, duracion_segundos, caption, created_at, expires_at, origen'
                )
                .eq('origen', 'mensajes')
                .gt('expires_at', new Date().toISOString())
                .order('created_at', {
                    ascending: true
                });

            if (consulta.error) {
                throw consulta.error;
            }

            filas = consulta.data || [];
        }

        const ahora = Date.now();

        estadosCache = filas.filter(function (estado) {
            if (!estado.id || !estado.usuario_id) return false;

            if (estado.expires_at) {
                const expiracion = new Date(estado.expires_at).getTime();

                if (isFinite(expiracion) && expiracion <= ahora) {
                    return false;
                }
            }

            return !!estadoObtenerURL(estado);
        });

        estadosCache.sort(function (a, b) {
            return new Date(a.created_at || 0).getTime() -
                new Date(b.created_at || 0).getTime();
        });

        window.__estadosVistosIds = new Set();

        if (!estadosCache.length) {
            scroll.innerHTML = '<div class="estados-vacio">Todavía no hay historias</div>';
            return;
        }

        const idsEstados = estadosCache.map(function (estado) {
            return estado.id;
        });

        try {
            const vistas = await db.from('estados_vistas')
                .select('estado_id')
                .eq('usuario_id', user.id)
                .in('estado_id', idsEstados);

            if (!vistas.error) {
                (vistas.data || []).forEach(function (vista) {
                    window.__estadosVistosIds.add(vista.estado_id);
                });
            }
        } catch (e) {
            console.warn('[Estados] No se pudieron cargar vistas previas:', e);
        }

        const porUsuario = {};

        estadosCache.forEach(function (estado) {
            if (!porUsuario[estado.usuario_id]) {
                porUsuario[estado.usuario_id] = [];
            }

            porUsuario[estado.usuario_id].push(estado);
        });

        const idsPerfiles = Object.keys(porUsuario).filter(function (uid) {
            return uid !== user.id;
        });

        if (idsPerfiles.length) {
            try {
                const perfiles = await db.from('perfiles_publicos')
                    .select('id,nombre,handle,avatar_url')
                    .in('id', idsPerfiles);

                if (!perfiles.error) {
                    (perfiles.data || []).forEach(function (perfil) {
                        if (
                            typeof perfilCache !== 'undefined' &&
                            perfilCache &&
                            typeof perfilCache.set === 'function'
                        ) {
                            if (
                                typeof PERFIL_CACHE_LIMITE === 'number' &&
                                perfilCache.size >= PERFIL_CACHE_LIMITE
                            ) {
                                const primera = perfilCache.keys().next().value;

                                if (primera !== undefined) {
                                    perfilCache.delete(primera);
                                }
                            }

                            perfilCache.set(perfil.id, {
                                ts: Date.now(),
                                data: perfil
                            });
                        }
                    });
                }
            } catch (e) {
                console.warn('[Estados] No se pudieron cargar perfiles:', e);
            }
        }

        const miEstado = porUsuario[user.id];

        if (miEstado && miEstado.length) {
            const tieneNuevos = miEstado.some(estadoEsNuevo);
            const ultimo = miEstado[miEstado.length - 1];
            const ultimoURL = estadoObtenerURL(ultimo);
            const totalVistas = await obtenerVistasEstado(ultimo.id);

            scroll.insertAdjacentHTML('beforeend', `
                <div class="estado-item" data-userid="${estadoEscapar(user.id)}">
                    <div class="estado-circle ${tieneNuevos ? '' : 'visto'}">
                        <div class="estado-inner">
                            ${estadoEsVideo(ultimo)
                                ? '<div class="estado-video-thumb">' + ICO_ESTADO.video + '</div>'
                                : '<img src="' + estadoEscapar(ultimoURL) + '" alt="" loading="lazy">'
                            }
                        </div>
                    </div>
                    ${totalVistas > 0
                        ? '<span class="estado-vistas-badge">' + totalVistas + '</span>'
                        : ''
                    }
                    <div class="estado-name">Tu historia</div>
                </div>
            `);

            const miItem = scroll.querySelector(
                '[data-userid="' + CSS.escape(user.id) + '"]'
            );

            if (miItem) {
                miItem.onclick = function () {
                    abrirEstadoUsuario(user.id);
                };
            }
        } else {
            scroll.insertAdjacentHTML('beforeend', `
                <div class="estado-item estado-item-crear" data-crear-estado="1">
                    <div class="estado-circle">
                        <div class="estado-inner estado-crear-icono">+</div>
                    </div>
                    <div class="estado-name">Tu historia</div>
                </div>
            `);

            const crear = scroll.querySelector('[data-crear-estado="1"]');

            if (crear) {
                crear.onclick = abrirModalEstado;
            }
        }

        const otrosUsuarios = Object.keys(porUsuario).filter(function (uid) {
            return uid !== user.id;
        });

        for (let i = 0; i < otrosUsuarios.length; i++) {
            const uid = otrosUsuarios[i];

            const entrada = (
                typeof perfilCache !== 'undefined' &&
                perfilCache &&
                perfilCache.get
            ) ? perfilCache.get(uid) : null;

            const ttlPerfil = (
                typeof TTL_PERFIL_MS === 'number' &&
                TTL_PERFIL_MS > 0
            ) ? TTL_PERFIL_MS : 300000;

            const perfil = (
                entrada &&
                Date.now() - entrada.ts < ttlPerfil &&
                entrada.data
            ) || {
                id: uid,
                nombre: 'Usuario',
                handle: '',
                avatar_url: null
            };

            const tieneNuevos = porUsuario[uid].some(estadoEsNuevo);

            scroll.insertAdjacentHTML('beforeend', `
                <div class="estado-item" data-userid="${estadoEscapar(uid)}">
                    <div class="estado-circle ${tieneNuevos ? '' : 'visto'}">
                        <div class="estado-inner">
                            ${avatarInicialHTML(perfil.nombre, perfil.avatar_url)}
                        </div>
                    </div>
                    <div class="estado-name">${estadoEscapar(perfil.nombre || 'Usuario')}</div>
                </div>
            `);

            const item = scroll.querySelector(
                '[data-userid="' + CSS.escape(uid) + '"]'
            );

            if (item) {
                item.onclick = function () {
                    abrirEstadoUsuario(uid);
                };
            }
        }

    } catch (e) {
        console.error('[Estados] Error cargando historias:', e);

        scroll.innerHTML =
            '<div class="estados-vacio">No se pudieron cargar las historias. Inténtalo nuevamente.</div>';
    }
}

/* ================================================================
   VISOR DE HISTORIAS
================================================================ */

function abrirEstadoUsuario(uid) {
    if (!uid) return;

    const estados = estadosCache.filter(function (estado) {
        return estado.usuario_id === uid;
    });

    if (!estados.length) {
        estadoAvisar('Este usuario todavía no tiene historias activas.', 'warning');
        return;
    }

    estadoTiempoDetener();
    estadoDetenerVideo();

    estadoActualUserId = uid;
    estadoActualIndex = 0;
    estadoProgresoActual = 0;
    estadoPausado = false;

    estadoAplicarVisorCompleto();

    const viewer = estadoElemento('estadoViewer');

    if (viewer) {
        viewer.classList.add('show');
    }

    mostrarEstadoActual();
}

async function mostrarEstadoActual() {
    const generacion = ++estadoGeneracionVisor;

    estadoTiempoDetener();
    estadoDetenerVideo();

    const estados = estadosCache.filter(function (estado) {
        return estado.usuario_id === estadoActualUserId;
    });

    if (
        !estadoActualUserId ||
        estadoActualIndex < 0 ||
        estadoActualIndex >= estados.length
    ) {
        cerrarEstadoViewer();
        return;
    }

    const estado = estados[estadoActualIndex];
    const esMiEstado = estadoEsMiHistoria(estado);

    const avatar = estadoElemento('evAvatar');
    const nombre = estadoElemento('evName');
    const imagen = estadoElemento('evImage');

    let video = estadoElemento('evVideo');

    if (!video && imagen && imagen.parentNode) {
        video = document.createElement('video');
        video.id = 'evVideo';
        video.className = 'estado-viewer-video hidden';
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';

        imagen.parentNode.appendChild(video);
    }

    if (esMiEstado) {
        if (avatar) {
            avatar.innerHTML = avatarInicialHTML(
                currentUserProfile && currentUserProfile.nombre,
                currentUserProfile && currentUserProfile.avatar_url
            );
        }

        if (nombre) {
            nombre.textContent = 'Tú';
        }
    } else {
        if (avatar) {
            avatar.innerHTML = '';
        }

        if (nombre) {
            nombre.textContent = 'Usuario';
        }

        try {
            const perfil = await db.from('perfiles_publicos')
                .select('nombre, handle, avatar_url')
                .eq('id', estado.usuario_id)
                .maybeSingle();

            if (generacion !== estadoGeneracionVisor) return;

            if (perfil.data) {
                if (avatar) {
                    avatar.innerHTML = avatarInicialHTML(
                        perfil.data.nombre,
                        perfil.data.avatar_url
                    );
                }

                if (nombre) {
                    nombre.textContent = perfil.data.nombre || 'Usuario';
                }
            }
        } catch (e) {
            console.warn('[Estados] No se pudo consultar el perfil:', e);
        }
    }

    if (generacion !== estadoGeneracionVisor) return;

    const urlMedia = estadoObtenerURL(estado);
    const esVideo = estadoEsVideo(estado);

    if (esVideo) {
        if (imagen) {
            imagen.classList.add('hidden');
            imagen.removeAttribute('src');
        }

        if (video) {
            video.classList.remove('hidden');
            video.controls = true;
            video.playsInline = true;
            video.autoplay = true;
            video.loop = false;
            video.muted = false;
            video.preload = 'auto';
            video.style.objectFit = 'contain';

            video.src = urlMedia;
            video.load();

            video.onended = function () {
                if (generacion !== estadoGeneracionVisor) return;

                estadoTiempoDetener();
                estadoProgresoActual = 100;

                const progress = estadoElemento('estadoProgress');

                if (progress) {
                    progress.style.width = '100%';
                }

                siguienteEstado();
            };

            video.ontimeupdate = function () {
                if (
                    generacion !== estadoGeneracionVisor ||
                    !video.duration ||
                    !isFinite(video.duration)
                ) {
                    return;
                }

                estadoProgresoActual = Math.min(
                    100,
                    (video.currentTime / video.duration) * 100
                );

                const progress = estadoElemento('estadoProgress');

                if (progress) {
                    progress.style.width = estadoProgresoActual + '%';
                }
            };

            const reproduccion = video.play();

            if (reproduccion && reproduccion.catch) {
                reproduccion.catch(function () {
                    // El usuario puede iniciar el video desde sus controles.
                });
            }
        }
    } else {
        if (video) {
            video.pause();
            video.classList.add('hidden');
            video.removeAttribute('src');

            try {
                video.load();
            } catch (e) {}
        }

        if (imagen) {
            imagen.classList.remove('hidden');
            imagen.style.objectFit = 'contain';
            imagen.style.objectPosition = 'center';
            imagen.src = urlMedia;
            imagen.alt = 'Historia publicada';
        }
    }

    estadoAplicarVisorCompleto();

    const tiempo = estadoElemento('evTime');

    if (tiempo) {
        tiempo.textContent = haceTiempo(estado.created_at);
    }

    const caption = estadoElemento('evCaption');

    if (caption) {
        if (estado.caption) {
            caption.textContent = estado.caption;
            caption.classList.remove('hidden');
        } else {
            caption.textContent = '';
            caption.classList.add('hidden');
        }
    }

    registrarVistaEstado(estado.id);

    const anteriores = estadoElemento('evPrev');
    const siguientes = estadoElemento('evNext');

    if (anteriores) {
        anteriores.classList.toggle('hidden', estadoActualIndex === 0);
    }

    if (siguientes) {
        siguientes.classList.toggle(
            'hidden',
            estadoActualIndex >= estados.length - 1
        );
    }

    const vistas = estadoElemento('evVistas');
    const eliminar = estadoElemento('evEliminar');
    const comentar = estadoElemento('evComentar');

    if (esMiEstado) {
        if (vistas) {
            vistas.classList.remove('hidden');
            vistas.dataset.estadoId = estado.id;

            vistas.onclick = function (event) {
                event.stopPropagation();
                abrirPanelEstado(estado.id, 'vistas');
            };
        }

        if (eliminar) {
            eliminar.classList.remove('hidden');
            eliminar.dataset.estadoId = estado.id;

            eliminar.onclick = function (event) {
                event.stopPropagation();
                eliminarHistoriaMensajes(estado.id);
            };
        }

        ocultarEl('evComentar');

        const total = await obtenerVistasEstado(estado.id);

        if (generacion !== estadoGeneracionVisor) return;

        const contador = estadoElemento('evVistasCount');

        if (contador) {
            contador.textContent = String(total);
        }
    } else {
        ocultarEl('evVistas');
        ocultarEl('evEliminar');

        if (comentar) {
            comentar.classList.remove('hidden');
            comentar.dataset.estadoId = estado.id;

            comentar.onclick = function (event) {
                event.stopPropagation();
                comentarHistoriaMensajes(estado.id);
            };
        }
    }

    const saltar = estadoElemento('evSkip');

    if (saltar) {
        saltar.classList.remove('hidden');

        saltar.onclick = function (event) {
            event.stopPropagation();
            saltarGrupoMensajes();
        };
    }

    iniciarProgresoEstado(estado);
}

/* ================================================================
   PROGRESO DEL VISOR
================================================================ */

function iniciarProgresoEstado(estado) {
    estadoTiempoDetener();

    estadoProgresoActual = 0;

    const progress = estadoElemento('estadoProgress');

    if (progress) {
        progress.style.width = '0%';
    }

    if (estadoEsVideo(estado)) {
        const video = estadoElemento('evVideo');

        if (!video) return;

        estadoTimer = setInterval(function () {
            if (estadoPausado || video.paused) return;

            if (
                video.duration &&
                isFinite(video.duration) &&
                video.duration > 0
            ) {
                estadoProgresoActual = Math.min(
                    100,
                    (video.currentTime / video.duration) * 100
                );

                if (progress) {
                    progress.style.width = estadoProgresoActual + '%';
                }
            }
        }, 150);

        return;
    }

    const duracion = ESTADOS_DURACION_IMAGEN * 1000;
    const intervalo = 50;
    const incremento = 100 / (duracion / intervalo);

    estadoTimer = setInterval(function () {
        if (estadoPausado) return;

        estadoProgresoActual = Math.min(
            100,
            estadoProgresoActual + incremento
        );

        if (progress) {
            progress.style.width = estadoProgresoActual + '%';
        }

        if (estadoProgresoActual >= 100) {
            estadoTiempoDetener();
            siguienteEstado();
        }
    }, intervalo);
}

function siguienteEstado() {
    const estados = estadosCache.filter(function (estado) {
        return estado.usuario_id === estadoActualUserId;
    });

    if (estadoActualIndex < estados.length - 1) {
        estadoActualIndex++;
        estadoProgresoActual = 0;
        estadoPausado = false;

        mostrarEstadoActual();
    } else {
        saltarGrupoMensajes();
    }
}

function anteriorEstado() {
    if (estadoActualIndex <= 0) return;

    estadoActualIndex--;
    estadoProgresoActual = 0;
    estadoPausado = false;

    mostrarEstadoActual();
}

function saltarGrupoMensajes() {
    if (!estadoActualUserId) return;

    const ordenUsuarios = [];

    estadosCache.forEach(function (estado) {
        if (!ordenUsuarios.includes(estado.usuario_id)) {
            ordenUsuarios.push(estado.usuario_id);
        }
    });

    const indice = ordenUsuarios.indexOf(estadoActualUserId);

    for (let i = indice + 1; i < ordenUsuarios.length; i++) {
        const uid = ordenUsuarios[i];

        if (estadosCache.some(function (estado) {
            return estado.usuario_id === uid;
        })) {
            estadoTiempoDetener();
            estadoDetenerVideo();

            estadoActualUserId = uid;
            estadoActualIndex = 0;
            estadoProgresoActual = 0;
            estadoPausado = false;

            mostrarEstadoActual();
            return;
        }
    }

    cerrarEstadoViewer();
}

function cerrarEstadoViewer() {
    estadoGeneracionVisor++;

    estadoTiempoDetener();
    estadoDetenerVideo();

    const viewer = estadoElemento('estadoViewer');

    if (viewer) {
        viewer.classList.remove('show');
    }

    estadoPausado = false;
    estadoProgresoActual = 0;
    estadoActualUserId = null;
    estadoActualIndex = 0;

    const progress = estadoElemento('estadoProgress');

    if (progress) {
        progress.style.width = '0%';
    }

    cargarEstados();
}

function activarPausaEstado() {
    const viewer = estadoElemento('estadoViewer');

    if (!viewer || !viewer.classList.contains('show')) return;

    estadoPausado = true;

    const video = estadoElemento('evVideo');

    if (video) {
        video.pause();
    }
}

function desactivarPausaEstado() {
    const viewer = estadoElemento('estadoViewer');

    if (!viewer || !viewer.classList.contains('show')) return;

    estadoPausado = false;

    const video = estadoElemento('evVideo');

    if (video && !video.classList.contains('hidden')) {
        const resultado = video.play();

        if (resultado && resultado.catch) {
            resultado.catch(function () {});
        }
    }
}

/* ================================================================
   PANEL DE VISTAS Y COMENTARIOS
================================================================ */

async function abrirPanelEstado(estadoId, tab) {
    tab = tab || 'vistas';

    if (!estadoId) return;

    const modal = estadoElemento('vistasModal');
    const lista = estadoElemento('vistasList');
    const contador = estadoElemento('vistasModalCount');

    if (!modal || !lista) {
        estadoAvisar('No está disponible el panel de historias.', 'warning');
        return;
    }

    modal.classList.add('show');

    lista.innerHTML = '<div class="estado-panel-msg">Cargando...</div>';

    if (contador) {
        contador.textContent = '';
    }

    let tabs = estadoElemento('vistasTabsBar');

    if (!tabs) {
        tabs = document.createElement('div');
        tabs.id = 'vistasTabsBar';
        tabs.className = 'estado-tabs';

        lista.parentNode.insertBefore(tabs, lista);
    }

    tabs.innerHTML = `
        <button type="button" class="estado-tab ${tab === 'vistas' ? 'active' : ''}" data-tab="vistas">
            ${ICO_ESTADO.eye}
            <span>Vistas</span>
        </button>
        <button type="button" class="estado-tab ${tab === 'comentarios' ? 'active' : ''}" data-tab="comentarios">
            ${ICO_ESTADO.chat}
            <span>Comentarios</span>
        </button>
    `;

    tabs.querySelectorAll('[data-tab]').forEach(function (boton) {
        boton.onclick = function () {
            abrirPanelEstado(estadoId, boton.dataset.tab);
        };
    });

    try {
        if (tab === 'vistas') {
            const resultado = await db.from('estados_vistas')
                .select('usuario_id, visto_at')
                .eq('estado_id', estadoId)
                .order('visto_at', {
                    ascending: false
                });

            if (resultado.error) {
                throw resultado.error;
            }

            const vistas = resultado.data || [];

            if (contador) {
                contador.textContent = '(' + vistas.length + ')';
            }

            if (!vistas.length) {
                lista.innerHTML =
                    '<div class="estado-panel-msg">Todavía no hay vistas registradas.</div>';
                return;
            }

            const ids = vistas.map(function (vista) {
                return vista.usuario_id;
            });

            const consultaPerfiles = await db.from('perfiles_publicos')
                .select('id,nombre,handle,avatar_url')
                .in('id', ids);

            if (consultaPerfiles.error) {
                throw consultaPerfiles.error;
            }

            const perfiles = {};

            (consultaPerfiles.data || []).forEach(function (perfil) {
                perfiles[perfil.id] = perfil;
            });

            lista.innerHTML = '';

            vistas.forEach(function (vista) {
                const perfil = perfiles[vista.usuario_id] || {
                    nombre: 'Usuario',
                    handle: '',
                    avatar_url: null
                };

                const url = urlPerfil(perfil.handle, vista.usuario_id);

                const fila = document.createElement('div');

                fila.className = 'result estado-result';

                if (url) {
                    fila.dataset.url = url;
                }

                fila.innerHTML = `
                    <div class="avatar">
                        ${avatarInicialHTML(perfil.nombre, perfil.avatar_url)}
                    </div>
                    <div class="estado-result-info">
                        <b>${estadoEscapar(perfil.nombre || 'Usuario')}</b>
                        <div class="estado-result-meta">
                            @${estadoEscapar(perfil.handle || 'usuario')}
                            · ${estadoEscapar(haceTiempo(vista.visto_at))}
                        </div>
                    </div>
                `;

                if (url) {
                    fila.onclick = function () {
                        window.location.href = url;
                    };
                }

                lista.appendChild(fila);
            });

        } else {
            const resultado = await db.rpc(
                'estado_comentarios_lista',
                {
                    p_estado_id: estadoId
                }
            );

            if (resultado.error) {
                throw resultado.error;
            }

            const comentarios = Array.isArray(resultado.data)
                ? resultado.data
                : (
                    resultado.data &&
                    Array.isArray(resultado.data.data)
                ) ? resultado.data.data : [];

            if (contador) {
                contador.textContent = '(' + comentarios.length + ')';
            }

            if (!comentarios.length) {
                lista.innerHTML =
                    '<div class="estado-panel-msg">Todavía no hay comentarios.</div>';
                return;
            }

            lista.innerHTML = '';

            comentarios.forEach(function (comentario) {
                const nombre =
                    comentario.nombre ||
                    comentario.usuario_handle ||
                    'Usuario';

                const texto =
                    comentario.comentario ||
                    comentario.texto ||
                    comentario.contenido ||
                    '';

                const fila = document.createElement('div');

                fila.className = 'result estado-result estado-result-top';

                fila.innerHTML = `
                    <div class="avatar">
                        ${avatarInicialHTML(nombre, comentario.avatar_url)}
                    </div>
                    <div class="estado-result-info">
                        <b>${estadoEscapar(nombre)}</b>
                        <div class="estado-comentario">${estadoEscapar(texto)}</div>
                        ${comentario.created_at
                            ? '<div class="estado-result-meta">' +
                                estadoEscapar(haceTiempo(comentario.created_at)) +
                              '</div>'
                            : ''
                        }
                    </div>
                `;

                lista.appendChild(fila);
            });
        }

    } catch (e) {
        console.error('[Estados] Error cargando el panel:', e);

        lista.innerHTML =
            '<div class="estado-panel-msg estado-panel-error">No se pudo cargar la información.</div>';
    }
}

async function abrirVistasModal(estadoId) {
    return abrirPanelEstado(estadoId, 'vistas');
}

function cerrarVistasModal() {
    const modal = estadoElemento('vistasModal');

    if (modal) {
        modal.classList.remove('show');
    }
}

/* ================================================================
   ELIMINAR HISTORIA
================================================================ */

async function eliminarHistoriaMensajes(estadoId) {
    if (!estadoId || !user) return;

    const estado = estadosCache.find(function (item) {
        return item.id === estadoId;
    });

    if (!estadoEsMiHistoria(estado)) {
        estadoAvisar('Solo puedes eliminar tus propias historias.', 'error');
        return;
    }

    let confirmado = false;

    if (typeof NeonModal !== 'undefined' && NeonModal.confirm) {
        confirmado = await NeonModal.confirm({
            title: 'Eliminar historia',
            message: 'Esta historia dejará de estar disponible para todos.',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            danger: true
        });
    } else {
        estadoAvisar(
            'El sistema de confirmación del ecosistema no está disponible.',
            'error'
        );
        return;
    }

    if (!confirmado) return;

    try {
        const consulta = await db.from('estados')
            .select('id, media_url, imagen_url, usuario_id')
            .eq('id', estadoId)
            .maybeSingle();

        if (consulta.error) {
            throw consulta.error;
        }

        if (!consulta.data || consulta.data.usuario_id !== user.id) {
            throw new Error('No puedes eliminar esta historia.');
        }

        const url = consulta.data.media_url || consulta.data.imagen_url;

        const eliminacion = await db.from('estados')
            .delete()
            .eq('id', estadoId)
            .eq('usuario_id', user.id);

        if (eliminacion.error) {
            throw eliminacion.error;
        }

        if (url) {
            const path = estadoObtenerPathStorage(url);

            if (path) {
                try {
                    const borrado = await db.storage
                        .from(ESTADOS_BUCKET)
                        .remove([path]);

                    if (borrado.error) {
                        console.warn(
                            '[Estados] No se pudo borrar el archivo:',
                            borrado.error
                        );
                    }
                } catch (errorStorage) {
                    console.warn(
                        '[Estados] Error limpiando Storage:',
                        errorStorage
                    );
                }
            }
        }

        estadosCache = estadosCache.filter(function (item) {
            return item.id !== estadoId;
        });

        estadoAvisar('Historia eliminada correctamente.', 'success');

        if (estadoActualUserId === user.id) {
            const propios = estadosCache.filter(function (item) {
                return item.usuario_id === user.id;
            });

            if (!propios.length) {
                cerrarEstadoViewer();
            } else if (estadoActualIndex >= propios.length) {
                estadoActualIndex = propios.length - 1;
                mostrarEstadoActual();
            } else {
                mostrarEstadoActual();
            }
        } else {
            await cargarEstados();
        }

    } catch (e) {
        console.error('[Estados] Error eliminando historia:', e);

        estadoAvisar(
            e.message || 'No se pudo eliminar la historia.',
            'error'
        );
    }
}

/* ================================================================
   COMENTARIOS DE HISTORIAS
================================================================ */

async function comentarHistoriaMensajes(estadoId) {
    if (!estadoId || !user) return;

    if (typeof NeonModal === 'undefined' || !NeonModal.prompt) {
        estadoAvisar('El sistema de comentarios no está disponible.', 'error');
        return;
    }

    const texto = await NeonModal.prompt({
        title: 'Comentar historia',
        message: 'Escribe un comentario de hasta 200 caracteres.',
        placeholder: 'Escribe tu comentario',
        confirmText: 'Enviar',
        cancelText: 'Cancelar',
        maxlength: 200
    });

    if (!texto || !texto.trim()) return;

    const comentario = texto.trim().slice(0, 200);

    try {
        const resultado = await db.rpc(
            'estado_enviar_comentario',
            {
                p_estado_id: estadoId,
                p_comentario: comentario
            }
        );

        if (resultado.error) {
            throw resultado.error;
        }

        estadoAvisar('Comentario enviado.', 'success');

    } catch (e) {
        console.error('[Estados] Error enviando comentario:', e);

        estadoAvisar(
            e.message || 'No se pudo enviar el comentario.',
            'error'
        );
    }
}

/* ================================================================
   MODAL DE PUBLICACIÓN
================================================================ */

function abrirModalEstado() {
    const modal = estadoElemento('estadoUploadModal');

    if (!modal) {
        estadoAvisar('El módulo de publicación no está disponible.', 'error');
        return;
    }

    if (estadosSubiendo) return;

    estadoLimpiarPreviews();

    estadoModalAbierto = true;

    const input = estadoElemento('estadoFileInput');
    const caption = estadoElemento('estadoCaption');
    const boton = estadoElemento('btnPublicarEstado');

    if (input) {
        input.value = '';
        input.multiple = true;
        input.accept = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-m4v';
    }

    if (caption) {
        caption.value = '';
    }

    if (boton) {
        boton.disabled = true;
        boton.classList.remove('is-loading');
    }

    const lista = estadoElemento('estadoPreviewLista');

    if (lista) {
        lista.innerHTML = '';
    }

    const contador = estadoElemento('estadoPreviewContador');

    if (contador) {
        contador.textContent = '';
    }

    ocultarEl('estadoPreviewWrap');

    const imagen = estadoElemento('estadoPreviewImg');

    if (imagen) {
        imagen.removeAttribute('src');
        imagen.classList.add('hidden');
    }

    const video = estadoElemento('estadoPreviewVideo');

    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.classList.add('hidden');

        try {
            video.load();
        } catch (e) {}
    }

    modal.classList.add('show');
}

function cerrarModalEstado() {
    const modal = estadoElemento('estadoUploadModal');

    estadoModalAbierto = false;
    estadoGeneracionPreview++;

    if (modal) {
        modal.classList.remove('show');
    }

    estadoLimpiarPreviews();

    const input = estadoElemento('estadoFileInput');

    if (input) {
        input.value = '';
    }

    const caption = estadoElemento('estadoCaption');

    if (caption) {
        caption.value = '';
    }

    const boton = estadoElemento('btnPublicarEstado');

    if (boton) {
        boton.disabled = false;
        boton.classList.remove('is-loading');
    }

    const video = estadoElemento('estadoPreviewVideo');

    if (video) {
        video.pause();
        video.removeAttribute('src');

        try {
            video.load();
        } catch (e) {}
    }

    const imagen = estadoElemento('estadoPreviewImg');

    if (imagen) {
        imagen.removeAttribute('src');
    }

    const lista = estadoElemento('estadoPreviewLista');

    if (lista) {
        lista.innerHTML = '';
    }

    ocultarEl('estadoPreviewWrap');
}

function seleccionarArchivoEstado() {
    const input = estadoElemento('estadoFileInput');

    if (!input || estadosSubiendo) return;

    input.multiple = true;
    input.accept = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-m4v';
    input.click();
}

/* ================================================================
   VALIDACIÓN DE ARCHIVOS
================================================================ */

function estadoValidarArchivo(file) {
    if (!file) {
        return {
            valido: false,
            mensaje: 'Archivo no válido.'
        };
    }

    const tipo = String(file.type || '').toLowerCase();
    const esVideo = tipo.indexOf('video/') === 0;
    const esImagen = tipo.indexOf('image/') === 0;

    if (!esVideo && !esImagen) {
        return {
            valido: false,
            mensaje: 'Selecciona imágenes o videos compatibles.'
        };
    }

    if (esVideo) {
        const permitidos = [
            'video/mp4',
            'video/webm',
            'video/quicktime',
            'video/x-m4v'
        ];

        if (!permitidos.includes(tipo)) {
            return {
                valido: false,
                mensaje: 'Formato no compatible. Utiliza MP4, WebM o MOV.'
            };
        }

        if (file.size > ESTADOS_MAX_VIDEO_MB * 1024 * 1024) {
            return {
                valido: false,
                mensaje: 'Cada video puede pesar máximo 25 MB.'
            };
        }
    } else {
        const permitidosImagen = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif'
        ];

        if (!permitidosImagen.includes(tipo)) {
            return {
                valido: false,
                mensaje: 'Formato de imagen no compatible.'
            };
        }

        if (file.size > ESTADOS_MAX_IMAGEN_MB * 1024 * 1024) {
            return {
                valido: false,
                mensaje: 'Cada imagen puede pesar máximo 10 MB.'
            };
        }
    }

    return {
        valido: true,
        esVideo: esVideo,
        esImagen: esImagen
    };
}

function estadoObtenerDuracionVideo(file) {
    return new Promise(function (resolve, reject) {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        let terminado = false;

        function limpiar() {
            if (terminado) return;

            terminado = true;

            video.onloadedmetadata = null;
            video.onerror = null;

            try {
                video.pause();
                video.removeAttribute('src');
                video.load();
            } catch (e) {}

            try {
                URL.revokeObjectURL(url);
            } catch (e) {}
        }

        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        video.onloadedmetadata = function () {
            const duracion = video.duration;

            limpiar();

            if (!isFinite(duracion) || duracion <= 0) {
                reject(new Error('No se pudo determinar la duración del video.'));
                return;
            }

            if (duracion > ESTADOS_MAX_VIDEO_SEGUNDOS) {
                reject(new Error('Cada video debe durar máximo 60 segundos.'));
                return;
            }

            resolve(duracion);
        };

        video.onerror = function () {
            limpiar();
            reject(new Error('No se pudo leer el archivo de video.'));
        };

        video.src = url;
    });
}

/* ================================================================
   PREVISUALIZACIÓN MÚLTIPLE
================================================================ */

async function previewEstado(event) {
    const input = event && event.target
        ? event.target
        : estadoElemento('estadoFileInput');

    if (!input || estadosSubiendo) return;

    const generacion = ++estadoGeneracionPreview;
    const archivos = Array.from(input.files || []);

    if (!archivos.length) return;

    const videos = archivos.filter(function (file) {
        return String(file.type || '').indexOf('video/') === 0;
    });

    const imagenes = archivos.filter(function (file) {
        return String(file.type || '').indexOf('image/') === 0;
    });

    if (videos.length > ESTADOS_MAX_VIDEOS) {
        input.value = '';
        estadoAvisar('Puedes tener hasta 5 videos activos.', 'error');
        return;
    }

    if (imagenes.length > ESTADOS_MAX_IMAGENES) {
        input.value = '';
        estadoAvisar('Puedes tener hasta 10 imágenes activas.', 'error');
        return;
    }

    if (videos.length + imagenes.length !== archivos.length) {
        input.value = '';
        estadoAvisar('Hay archivos que no son compatibles.', 'error');
        return;
    }

    const boton = estadoElemento('btnPublicarEstado');

    if (boton) {
        boton.disabled = true;
    }

    const wrap = estadoElemento('estadoPreviewWrap');

    if (wrap) {
        wrap.classList.remove('hidden');
    }

    const lista = estadoElemento('estadoPreviewLista');

    if (lista) {
        lista.innerHTML = '<div class="estado-panel-msg">Validando archivos...</div>';
    }

    const validos = [];

    try {
        for (let i = 0; i < archivos.length; i++) {
            if (generacion !== estadoGeneracionPreview) {
                throw new Error('La selección cambió durante la validación.');
            }

            const file = archivos[i];
            const validacion = estadoValidarArchivo(file);

            if (!validacion.valido) {
                throw new Error(validacion.mensaje);
            }

            let duracion = 0;

            if (validacion.esVideo) {
                duracion = await estadoObtenerDuracionVideo(file);
            }

            validos.push({
                file: file,
                tipo: validacion.esVideo ? 'video' : 'imagen',
                duracion: duracion,
                url: URL.createObjectURL(file)
            });
        }

        if (generacion !== estadoGeneracionPreview) {
            validos.forEach(function (item) {
                URL.revokeObjectURL(item.url);
            });

            return;
        }

        estadoLimpiarPreviews();

        estadosArchivosSeleccionados = validos;

        estadoRenderizarPreviews();

        if (boton) {
            boton.disabled = estadosArchivosSeleccionados.length === 0;
        }

    } catch (e) {
        validos.forEach(function (item) {
            try {
                URL.revokeObjectURL(item.url);
            } catch (error) {}
        });

        if (generacion !== estadoGeneracionPreview) return;

        estadoLimpiarPreviews();

        input.value = '';

        if (boton) {
            boton.disabled = true;
        }

        if (lista) {
            lista.innerHTML = '';
        }

        if (wrap) {
            wrap.classList.add('hidden');
        }

        estadoAvisar(
            e.message || 'No se pudieron validar los archivos.',
            'error'
        );
    }
}

function estadoRenderizarPreviews() {
    const wrap = estadoElemento('estadoPreviewWrap');

    if (!wrap) return;

    wrap.classList.remove('hidden');

    let lista = estadoElemento('estadoPreviewLista');

    if (!lista) {
        lista = document.createElement('div');
        lista.id = 'estadoPreviewLista';
        lista.className = 'estado-preview-grid';
        wrap.appendChild(lista);
    }

    lista.className = 'estado-preview-grid';
    lista.innerHTML = '';

    estadosArchivosSeleccionados.forEach(function (item, indice) {
        const tarjeta = document.createElement('div');

        tarjeta.className = 'estado-preview-item';

        const media = item.tipo === 'video'
            ? document.createElement('video')
            : document.createElement('img');

        if (item.tipo === 'video') {
            media.muted = true;
            media.playsInline = true;
            media.controls = true;
            media.preload = 'metadata';
        } else {
            media.alt = 'Vista previa de imagen';
            media.loading = 'lazy';
        }

        media.src = item.url;

        const numero = document.createElement('span');

        numero.className = 'estado-preview-numero';
        numero.textContent = (indice + 1) + ' / ' +
            estadosArchivosSeleccionados.length;

        const eliminar = document.createElement('button');

        eliminar.type = 'button';
        eliminar.className = 'estado-preview-eliminar';
        eliminar.setAttribute('aria-label', 'Quitar archivo');
        eliminar.textContent = '×';

        eliminar.onclick = function () {
            if (estadosSubiendo) return;

            if (item.url) {
                try {
                    URL.revokeObjectURL(item.url);
                } catch (e) {}
            }

            estadosArchivosSeleccionados.splice(indice, 1);

            const input = estadoElemento('estadoFileInput');

            if (input) {
                input.value = '';
            }

            estadoRenderizarPreviews();

            const boton = estadoElemento('btnPublicarEstado');

            if (boton) {
                boton.disabled = estadosArchivosSeleccionados.length === 0;
            }

            if (!estadosArchivosSeleccionados.length) {
                ocultarEl('estadoPreviewWrap');
            }
        };

        const informacion = document.createElement('div');

        informacion.className = 'estado-preview-info';

        informacion.textContent = item.tipo === 'video'
            ? 'Video · ' + Math.ceil(item.duracion) + ' s'
            : 'Imagen';

        tarjeta.appendChild(media);
        tarjeta.appendChild(numero);
        tarjeta.appendChild(eliminar);
        tarjeta.appendChild(informacion);

        lista.appendChild(tarjeta);
    });

    let contador = estadoElemento('estadoPreviewContador');

    if (!contador) {
        contador = document.createElement('div');
        contador.id = 'estadoPreviewContador';
        contador.className = 'estado-preview-contador';
        wrap.appendChild(contador);
    }

    const totalVideos = estadosArchivosSeleccionados.filter(function (item) {
        return item.tipo === 'video';
    }).length;

    const totalImagenes = estadosArchivosSeleccionados.filter(function (item) {
        return item.tipo === 'imagen';
    }).length;

    contador.textContent =
        totalVideos + '/5 videos · ' +
        totalImagenes + '/10 imágenes seleccionadas';
}

/* ================================================================
   CUOTAS ACTIVAS EN SUPABASE
================================================================ */

async function estadoConsultarCuotas() {
    if (!user) {
        throw new Error('Inicia sesión para publicar historias.');
    }

    const resultado = await db.from('estados')
        .select('id, media_tipo, media_url, imagen_url')
        .eq('usuario_id', user.id)
        .eq('origen', 'mensajes')
        .gt('expires_at', new Date().toISOString());

    if (resultado.error) {
        throw resultado.error;
    }

    const activos = resultado.data || [];

    let videos = 0;
    let imagenes = 0;

    activos.forEach(function (estado) {
        if (estadoEsVideo(estado)) {
            videos++;
        } else {
            imagenes++;
        }
    });

    return {
        videos: videos,
        imagenes: imagenes,
        total: activos.length
    };
}

/* ================================================================
   PUBLICAR HISTORIAS EN EL ECOSISTEMA
================================================================ */

async function publicarEstado() {
    if (estadosSubiendo) return;

    if (!user || !await auth()) {
        estadoAvisar('Inicia sesión para publicar historias.', 'warning');
        return;
    }

    if (!estadosArchivosSeleccionados.length) {
        const input = estadoElemento('estadoFileInput');

        if (input && input.files && input.files.length) {
            await previewEstado({
                target: input
            });
        }
    }

    if (!estadosArchivosSeleccionados.length) {
        estadoAvisar('Selecciona al menos una imagen o un video.', 'warning');
        return;
    }

    const archivos = estadosArchivosSeleccionados.slice();

    const videosNuevos = archivos.filter(function (item) {
        return item.tipo === 'video';
    }).length;

    const imagenesNuevas = archivos.filter(function (item) {
        return item.tipo === 'imagen';
    }).length;

    if (videosNuevos > ESTADOS_MAX_VIDEOS) {
        estadoAvisar('Puedes publicar hasta 5 videos activos.', 'error');
        return;
    }

    if (imagenesNuevas > ESTADOS_MAX_IMAGENES) {
        estadoAvisar('Puedes publicar hasta 10 imágenes activas.', 'error');
        return;
    }

    estadosSubiendo = true;

    const boton = estadoElemento('btnPublicarEstado');

    if (boton) {
        boton.disabled = true;
        boton.classList.add('is-loading');
        boton.textContent = 'Publicando...';
    }

    let barra = estadoElemento('estadoProgresoPublicacion');

    if (!barra) {
        const wrap = estadoElemento('estadoPreviewWrap');

        if (wrap) {
            barra = document.createElement('div');
            barra.id = 'estadoProgresoPublicacion';
            barra.className = 'estado-progreso-publicacion';
            barra.innerHTML = '<span></span>';
            wrap.appendChild(barra);
        }
    }

    let publicados = 0;
    let errores = [];
    let cuotas = null;

    const captionInput = estadoElemento('estadoCaption');

    const caption = captionInput
        ? String(captionInput.value || '').trim().slice(0, 300)
        : '';

    try {
        // La cuota se consulta en Supabase antes de subir.
        cuotas = await estadoConsultarCuotas();

        if (cuotas.videos + videosNuevos > ESTADOS_MAX_VIDEOS) {
            throw new Error(
                'Ya tienes ' + cuotas.videos +
                ' videos activos. El máximo permitido es 5. Elimina o espera a que expire alguno.'
            );
        }

        if (cuotas.imagenes + imagenesNuevas > ESTADOS_MAX_IMAGENES) {
            throw new Error(
                'Ya tienes ' + cuotas.imagenes +
                ' imágenes activas. El máximo permitido es 10. Elimina o espera a que expire alguna.'
            );
        }

        for (let i = 0; i < archivos.length; i++) {
            const item = archivos[i];

            try {
                const validacion = estadoValidarArchivo(item.file);

                if (!validacion.valido) {
                    throw new Error(validacion.mensaje);
                }

                if (item.tipo === 'video') {
                    const duracionReal = await estadoObtenerDuracionVideo(item.file);

                    if (duracionReal > ESTADOS_MAX_VIDEO_SEGUNDOS) {
                        throw new Error('Los videos no pueden superar 60 segundos.');
                    }

                    item.duracion = duracionReal;
                }

                const subida = await subirViaBackend(
                    item.file,
                    ESTADOS_BUCKET,
                    item.tipo
                );

                if (!subida || !subida.url) {
                    throw new Error('El almacenamiento no devolvió la URL del archivo.');
                }

                const urlArchivo = subida.url;

                const registro = await db.from('estados').insert({
                    usuario_id: user.id,
                    imagen_url: urlArchivo,
                    media_url: urlArchivo,
                    media_tipo: item.tipo,
                    duracion_segundos: item.tipo === 'video'
                        ? Math.min(
                            ESTADOS_MAX_VIDEO_SEGUNDOS,
                            Math.ceil(item.duracion)
                        )
                        : ESTADOS_DURACION_IMAGEN,
                    caption: caption || null,
                    origen: 'mensajes',
                    expires_at: estadoFechaExpiracion()
                });

                if (registro.error) {
                    // Si falla el registro, intenta retirar el archivo huérfano.
                    const path = estadoObtenerPathStorage(urlArchivo);

                    if (path) {
                        try {
                            await db.storage
                                .from(ESTADOS_BUCKET)
                                .remove([path]);
                        } catch (errorStorage) {
                            console.warn(
                                '[Estados] No se pudo limpiar archivo sin registro:',
                                errorStorage
                            );
                        }
                    }

                    throw registro.error;
                }

                publicados++;

                if (barra) {
                    const progreso = barra.querySelector('span');

                    if (progreso) {
                        progreso.style.width =
                            ((i + 1) / archivos.length * 100) + '%';
                    }
                }

            } catch (errorArchivo) {
                console.error(
                    '[Estados] Error publicando archivo ' + (i + 1) + ':',
                    errorArchivo
                );

                errores.push({
                    numero: i + 1,
                    mensaje: errorArchivo.message || 'Error desconocido'
                });
            }
        }

        if (publicados > 0) {
            estadoAvisar(
                publicados + ' de ' + archivos.length +
                ' historias publicadas correctamente.',
                'success'
            );

            cerrarModalEstado();

            await cargarEstados();
        }

        if (errores.length) {
            const mensaje = errores.length === archivos.length
                ? 'No se pudo publicar ningún archivo.'
                : 'Algunos archivos no se pudieron publicar.';

            estadoAvisar(mensaje, 'warning');

            console.warn('[Estados] Errores de publicación:', errores);
        }

    } catch (e) {
        console.error('[Estados] Error general de publicación:', e);

        if (e.code === '42P01') {
            estadoAvisar(
                'No se encuentra la tabla de historias en Supabase.',
                'error'
            );
        } else if (e.code === '42703') {
            estadoAvisar(
                'Falta una columna requerida en Supabase.',
                'error'
            );
        } else {
            estadoAvisar(
                e.message || 'No se pudieron publicar las historias.',
                'error'
            );
        }

    } finally {
        estadosSubiendo = false;

        if (barra) {
            const progreso = barra.querySelector('span');

            if (progreso && publicados === 0) {
                progreso.style.width = '0%';
            }
        }

        if (boton) {
            boton.disabled = estadosArchivosSeleccionados.length === 0;
            boton.classList.remove('is-loading');
            boton.textContent = 'Publicar historia';
        }
    }
}

/* ================================================================
   NAVEGACIÓN Y GESTOS
================================================================ */

function estadoInstalarNavegacion() {
    const viewer = estadoElemento('estadoViewer');

    if (!viewer || viewer.dataset.estadosEventos === '1') {
        return;
    }

    viewer.dataset.estadosEventos = '1';

    let inicioX = 0;
    let inicioY = 0;

    viewer.addEventListener('click', function (event) {
        const target = event.target;

        if (
            target.closest('#evPrev') ||
            target.closest('#evNext') ||
            target.closest('#evEliminar') ||
            target.closest('#evComentar') ||
            target.closest('#evVistas') ||
            target.closest('#evSkip') ||
            target.closest('video') ||
            target.closest('button') ||
            target.closest('a')
        ) {
            return;
        }

        const rect = viewer.getBoundingClientRect();
        const mitad = rect.left + rect.width / 2;

        if (event.clientX < mitad) {
            anteriorEstado();
        } else {
            siguienteEstado();
        }
    });

    viewer.addEventListener('touchstart', function (event) {
        if (!event.touches || !event.touches.length) return;

        const target = event.target;

        if (
            target.closest('video') ||
            target.closest('button') ||
            target.closest('input') ||
            target.closest('textarea')
        ) {
            return;
        }

        inicioX = event.touches[0].clientX;
        inicioY = event.touches[0].clientY;

        estadoPausado = true;

        const video = estadoElemento('evVideo');

        if (video && !video.classList.contains('hidden')) {
            video.pause();
        }
    }, {
        passive: true
    });

    viewer.addEventListener('touchend', function (event) {
        if (!viewer.classList.contains('show')) return;

        if (!event.changedTouches || !event.changedTouches.length) {
            estadoPausado = false;
            return;
        }

        const finX = event.changedTouches[0].clientX;
        const finY = event.changedTouches[0].clientY;

        const deltaX = finX - inicioX;
        const deltaY = finY - inicioY;

        if (Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY)) {
            estadoPausado = false;

            if (deltaX < 0) {
                siguienteEstado();
            } else {
                anteriorEstado();
            }

            return;
        }

        estadoPausado = false;

        const video = estadoElemento('evVideo');

        if (video && !video.classList.contains('hidden')) {
            const resultado = video.play();

            if (resultado && resultado.catch) {
                resultado.catch(function () {});
            }
        }
    }, {
        passive: true
    });

    viewer.addEventListener('touchcancel', function () {
        estadoPausado = false;
    }, {
        passive: true
    });
}

/* ================================================================
   INTEGRACIÓN CON EL CICLO DE VIDA DEL ECOSISTEMA
================================================================ */

function estadoInicializarModulo() {
    estadoInstalarEstilos();
    estadoInstalarNavegacion();

    const input = estadoElemento('estadoFileInput');

    if (input && input.dataset.estadosChange !== '1') {
        input.dataset.estadosChange = '1';

        input.addEventListener('change', function (event) {
            previewEstado(event);
        });
    }

    const boton = estadoElemento('btnPublicarEstado');

    if (boton && boton.dataset.estadosClick !== '1') {
        boton.dataset.estadosClick = '1';

        boton.addEventListener('click', function (event) {
            event.preventDefault();
            publicarEstado();
        });
    }

    const imagen = estadoElemento('evImage');

    if (imagen && imagen.parentElement) {
        imagen.parentElement.classList.add('estado-media-stage');
    }

    const video = estadoElemento('evVideo');

    if (video) {
        video.playsInline = true;
        video.preload = 'metadata';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener(
        'DOMContentLoaded',
        estadoInicializarModulo
    );
} else {
    estadoInicializarModulo();
}

/* ================================================================
   REFERENCIA DE SUPABASE · ESTRUCTURAS EXISTENTES
================================================================

Este módulo utiliza las estructuras ya integradas en Csariel's:

TABLAS:
- public.estados
- public.estados_vistas
- public.perfiles_publicos

FUNCIONES RPC:
- estados_mensajes_activos
- estado_comentarios_lista
- estado_enviar_comentario

COLUMNAS UTILIZADAS EN public.estados:
- id
- usuario_id
- imagen_url
- media_url
- media_tipo
- duracion_segundos
- caption
- origen
- created_at
- expires_at

COLUMNAS UTILIZADAS EN public.estados_vistas:
- id
- estado_id
- usuario_id
- visto_at

COLUMNAS UTILIZADAS EN public.perfiles_publicos:
- id
- nombre
- handle
- avatar_url

BUCKET:
- ESTADOS_BUCKET

VERIFICAR TABLAS EXISTENTES ANTES DE MODIFICAR:

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'estados',
      'estados_vistas',
      'perfiles_publicos'
  );

VERIFICAR COLUMNAS DE HISTORIAS:

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'estados'
ORDER BY ordinal_position;

VERIFICAR COLUMNAS DE VISTAS:

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'estados_vistas'
ORDER BY ordinal_position;

VERIFICAR FUNCIONES RPC:

SELECT
    routine_schema,
    routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
      'estados_mensajes_activos',
      'estado_comentarios_lista',
      'estado_enviar_comentario'
  );

IMPORTANTE:
- No se crea ninguna tabla automáticamente.
- No se presupone una columna nueva.
- No se reemplazan las funciones RPC existentes.
- Los límites del navegador son 5 videos activos y 10 imágenes
  activas por usuario, por separado.
- La consulta de cuotas se realiza sobre public.estados.
- Para evitar publicaciones simultáneas que superen el límite,
  el servidor debe volver a validar la cuota antes del INSERT.
- El backend debe validar el tipo MIME real, el tamaño y la
  duración del video; la validación del navegador no sustituye
  la validación del servidor.
- La publicación requiere permisos INSERT para el usuario
  autenticado y permisos de lectura del bucket para las historias.
- La eliminación requiere permisos DELETE limitados al propietario.
- Las vistas deben permitir registrar la vista del usuario
  autenticado sin permitir suplantar a otros usuarios.
- Las historias vencidas dejan de mostrarse después de 24 horas.

=============================================================== */