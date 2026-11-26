/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · BORRADORES (v1)
   ================================================================
   Séptimo módulo de la división de videos-publicar.js.
   - Persistencia local en IndexedDB (progreso y video en curso).
   - Restauración del progreso al abrir la página.
   - Guardado de borradores en Supabase, con video y portada en Storage.
   - Listado, apertura y eliminación de borradores.
   - Aviso de cuota excedida y descarga del video actual.
   Dependencias en tiempo de uso:
     NS.preview → mostrarPreviewVideo, mostrarPortadaDesdeUrl,
                  actualizarResumenPreview, actualizarTextoBotonArchivo,
                  ponerArchivoEnInput
     NS.sheets  → seleccionarSonidoSinSonar, cerrarTodosLosSheets
     NS.ui      → csToast, csConfirm, actualizarBotonesSonidoUbicacion
   Expuesto en NS.borradores.
   Requiere: publicar-base.js, publicar-ui.js.
   ================================================================ */

(function () {
    'use strict';

    var NS = window.VideosPublicarNS;
    if (!NS || !NS.C || !NS.u || !NS.state || !NS.DATA || !NS.ui) {
        console.error('[VideosPublicar] publicar-borradores.js requiere base y ui.');
        return;
    }
    if (NS.borradores) return;

    var C = NS.C;
    var U = NS.u;
    var S = NS.state;
    var DATA = NS.DATA;
    var CONFIG = C.CONFIG;
    var $ = U.$;
    var esc = U.esc;
    var vt = U.vt;
    var UBICACIONES_SEED = DATA.UBICACIONES_SEED;

    /* Llama una función de otro módulo solo si ya existe. */
    function llamar(modulo, fn) {
        var args = Array.prototype.slice.call(arguments, 2);
        var m = NS[modulo];
        if (m && typeof m[fn] === 'function') return m[fn].apply(m, args);
        return undefined;
    }

    /* ----------------------------------------------------------------
       INDEXEDDB (progreso local)
       ---------------------------------------------------------------- */

    function abrirIDB() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(C.IDB_NAME, 1);
            req.onupgradeneeded = function () {
                req.result.createObjectStore(C.IDB_STORE);
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    async function idbSet(clave, valor) {
        var db = await abrirIDB();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(C.IDB_STORE, 'readwrite');
            tx.objectStore(C.IDB_STORE).put(valor, clave);
            tx.oncomplete = function () { db.close(); resolve(); };
            tx.onerror = function () { db.close(); reject(tx.error); };
        });
    }

    async function idbGet(clave) {
        var db = await abrirIDB();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(C.IDB_STORE, 'readonly');
            var req = tx.objectStore(C.IDB_STORE).get(clave);
            req.onsuccess = function () { db.close(); resolve(req.result || null); };
            req.onerror = function () { db.close(); reject(req.error); };
        });
    }

    async function idbDel(clave) {
        var db = await abrirIDB();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(C.IDB_STORE, 'readwrite');
            tx.objectStore(C.IDB_STORE).delete(clave);
            tx.oncomplete = function () { db.close(); resolve(); };
            tx.onerror = function () { db.close(); reject(tx.error); };
        });
    }

    /* ----------------------------------------------------------------
       PERSISTENCIA DEL PROGRESO
       ---------------------------------------------------------------- */

    var _persistMetaTimer = null;

    /* Guarda el progreso de texto con un retraso, para no escribir en cada tecla. */
    function persistirMetaDebounced() {
        clearTimeout(_persistMetaTimer);
        _persistMetaTimer = setTimeout(persistirMeta, 400);
    }

    /* Guarda título, descripción, sonido, ubicación y rutas remotas. */
    async function persistirMeta() {
        try {
            var titulo = ($('inputTituloVideo') || {}).value || '';
            var descripcion = ($('inputDescripcionVideo') || {}).value || '';
            var hayAlgo = S.archivoVideo || titulo.trim() || descripcion.trim() ||
                S.sonidoSeleccionado || S.ubicacionSeleccionada;

            if (!hayAlgo) {
                await idbDel(C.KEY_META);
                return;
            }

            await idbSet(C.KEY_META, {
                titulo: titulo,
                descripcion: descripcion,
                sonidoId: S.sonidoSeleccionado ? S.sonidoSeleccionado.id : null,
                ubicacionId: S.ubicacionSeleccionada ? S.ubicacionSeleccionada.id : null,
                borradorId: S.borradorEditandoId,
                archivoPathRemoto: S.archivoPathRemoto,
                portadaPathRemoto: S.portadaPathRemoto,
                ts: Date.now()
            });
        } catch (e) {
            U.warn('No se pudo guardar el progreso local:', e);
        }
    }

    /* Guarda el video en curso. Si pesa más que el límite, no se guarda. */
    async function persistirArchivo() {
        try {
            if (S.archivoVideo) {
                if (S.archivoVideo.size > C.MAX_FILE_SIZE_FOR_IDB) {
                    U.warn('Archivo demasiado grande para guardar en IndexedDB. Se omitirá.');
                    await idbDel(C.KEY_FILE);
                    return;
                }
                await idbSet(C.KEY_FILE, S.archivoVideo);
            } else {
                await idbDel(C.KEY_FILE);
            }
        } catch (e) {
            U.warn('No se pudo guardar el video local:', e);
        }
    }

    /* Borra el progreso local (al publicar o al resetear el formulario). */
    async function limpiarPersistencia() {
        try {
            await idbDel(C.KEY_META);
            await idbDel(C.KEY_FILE);
        } catch (e) {
            U.warn('No se pudo limpiar la persistencia local:', e);
        }
    }

    /* Recupera el progreso guardado al abrir la página. */
    async function restaurarLocal() {
        try {
            var meta = await idbGet(C.KEY_META);
            var file = await idbGet(C.KEY_FILE);

            if (file && file.size > C.MAX_FILE_SIZE_FOR_IDB) {
                U.warn('Archivo recuperado excede límite. Se descarta.');
                await idbDel(C.KEY_FILE);
                file = null;
                NS.ui.csToast('El video era demasiado grande para recuperarlo automáticamente.', 'info', 4000);
            }

            if (!meta && !file) return;

            if (meta) {
                var titulo = $('inputTituloVideo');
                var desc = $('inputDescripcionVideo');
                if (titulo) titulo.value = meta.titulo || '';
                if (desc) desc.value = meta.descripcion || '';

                S.borradorEditandoId = meta.borradorId || null;
                S.archivoPathRemoto = meta.archivoPathRemoto || null;
                S.portadaPathRemoto = meta.portadaPathRemoto || null;
                S.borradorPaths = { archivo: S.archivoPathRemoto, portada: S.portadaPathRemoto };

                if (meta.sonidoId) {
                    var s = U.buscarSonidoPorId(meta.sonidoId);
                    if (s) llamar('sheets', 'seleccionarSonidoSinSonar', s);
                }

                if (meta.ubicacionId) {
                    for (var i = 0; i < UBICACIONES_SEED.length; i++) {
                        if (UBICACIONES_SEED[i].id === meta.ubicacionId) {
                            S.ubicacionSeleccionada = UBICACIONES_SEED[i];
                            break;
                        }
                    }
                }
            }

            if (file instanceof Blob) {
                var archivo = file instanceof File
                    ? file
                    : new File([file], 'video-recuperado-' + Date.now() + '.webm', { type: file.type || 'video/webm' });

                S.archivoVideo = archivo;
                llamar('preview', 'ponerArchivoEnInput', archivo);
                llamar('preview', 'mostrarPreviewVideo', archivo);
                llamar('preview', 'actualizarTextoBotonArchivo', archivo);
            }

            llamar('preview', 'actualizarResumenPreview');
            NS.ui.actualizarBotonesSonidoUbicacion();
            NS.ui.csToast('Recuperamos tu video en curso', 'info', 3000);
            U.log('Progreso local restaurado');
        } catch (e) {
            U.warn('No se pudo restaurar el progreso local:', e);
        }
    }

    /* ----------------------------------------------------------------
       DESCARGA Y AVISO DE CUOTA
       ---------------------------------------------------------------- */

    /* Descarga un Blob como archivo con un enlace temporal. */
    function descargarBlob(blob, nombre) {
        var url = U.crearObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = nombre || ('video-' + Date.now() + '.webm');
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { U.revocarObjectURL(url); }, 4000);
    }

    /* Descarga el video actual: el archivo local o el del borrador. */
    async function descargarVideoActual() {
        if (S.archivoVideo) {
            descargarBlob(S.archivoVideo, S.archivoVideo.name);
            return;
        }

        if (S.archivoPathRemoto) {
            try {
                var resp = await fetch(U.urlPublicaBorrador(S.archivoPathRemoto));
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                var blob = await resp.blob();
                descargarBlob(blob, S.archivoPathRemoto.split('/').pop());
            } catch (e) {
                NS.ui.csToast('No se pudo descargar el video. Intenta de nuevo.', 'error');
            }
            return;
        }

        NS.ui.csToast('No hay video para descargar', 'warning');
    }

    /* Aviso de cuota. Si el servidor no informa el plan, el texto no asume ninguno. */
    function mostrarAvisoCuota(cuota) {
        var previo = document.getElementById('csModalCuota');
        if (previo) previo.remove();

        var c = cuota || {};
        var planDesconocido = c.plan == null;
        var esPro = c.plan === 'pro';
        var tieneCifras = c.limite_mb != null;

        var overlay = document.createElement('div');
        overlay.id = 'csModalCuota';
        overlay.className = 'cs-confirm-overlay show';
        overlay.style.setProperty('z-index', String(C.Z.CONFIRM), 'important');

        var modal = document.createElement('div');
        modal.className = 'cs-confirm-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        var titulo = document.createElement('div');
        titulo.className = 'cs-confirm-titulo';
        titulo.textContent = 'Alcanzaste el límite de tu espacio';

        var detalle = document.createElement('div');
        detalle.className = 'cs-confirm-mensaje';

        if (planDesconocido) {
            detalle.textContent = (tieneCifras
                ? 'Tu espacio disponible es de ' + U.formatearEspacio(c.limite_mb) + ' y ya lo usaste. '
                : 'Ya usaste el espacio disponible en tu cuenta. ') +
                'Tus videos y borradores siguen guardados. Libera espacio o revisa tus planes para subir más.';
        } else if (esPro) {
            detalle.textContent = tieneCifras
                ? 'Tu plan Pro incluye ' + U.formatearEspacio(c.limite_mb) + ' y ya lo usaste. Libera espacio para seguir subiendo.'
                : 'Ya usaste el espacio de tu plan Pro. Libera espacio para seguir subiendo.';
        } else {
            detalle.textContent = (tieneCifras
                ? 'Tu plan gratuito incluye ' + U.formatearEspacio(c.limite_mb) + ' y ya lo usaste. '
                : 'Ya usaste el espacio de tu plan gratuito. ') +
                'Tus videos y borradores siguen guardados. Para subir más, amplía a Pro o libera espacio.';
        }

        var acciones = document.createElement('div');
        acciones.className = 'cs-confirm-acciones';
        acciones.style.flexDirection = 'column';

        if (!esPro) {
            var btnPro = document.createElement('button');
            btnPro.type = 'button';
            btnPro.className = 'cs-confirm-btn cs-confirm-ok';
            btnPro.textContent = planDesconocido ? 'Ver planes' : 'Subir a Pro · $300 MXN por 5 GB';
            btnPro.addEventListener('click', function () {
                window.location.href = C.RUTA_MEMBRESIA_PRO;
            });
            acciones.appendChild(btnPro);
        }

        var btnDescargar = document.createElement('button');
        btnDescargar.type = 'button';
        btnDescargar.className = 'cs-confirm-btn cs-confirm-cancel';
        btnDescargar.textContent = 'Descargar mi video al teléfono';
        btnDescargar.addEventListener('click', descargarVideoActual);

        var btnCerrar = document.createElement('button');
        btnCerrar.type = 'button';
        btnCerrar.className = 'cs-confirm-btn cs-confirm-cancel';
        btnCerrar.textContent = 'Ahora no';
        btnCerrar.addEventListener('click', function () { overlay.remove(); });

        acciones.append(btnDescargar, btnCerrar);
        modal.append(titulo, detalle, acciones);
        overlay.append(modal);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });
        document.body.appendChild(overlay);
    }

    /* ----------------------------------------------------------------
       ALMACENAMIENTO DE BORRADORES (Supabase Storage)
       ---------------------------------------------------------------- */

    /* Ruta única dentro del bucket: borradores/usuario/fecha-nombre. */
    function rutaBorrador(usuarioId, nombre) {
        var limpio = String(nombre || 'archivo').replace(/[^\w.\-]/g, '_');
        return CONFIG.CARPETA_BORRADORES + '/' + usuarioId + '/' + Date.now() + '-' + limpio;
    }

    async function subirBorradorArchivo(path, blob, contentType) {
        var sb = U.getSupabaseClient();
        var r = await sb.storage.from(CONFIG.BUCKET).upload(path, blob, {
            contentType: contentType || 'application/octet-stream',
            upsert: false
        });
        if (r.error) throw new Error(r.error.message || 'No se pudo subir el archivo del borrador');
        return path;
    }

    /* Borra archivos del Storage. Si falla, solo avisa en consola. */
    async function borrarBorradorArchivos(paths) {
        var validos = (paths || []).filter(Boolean);
        if (!validos.length) return;
        var sb = U.getSupabaseClient();
        try {
            await sb.storage.from(CONFIG.BUCKET).remove(validos);
        } catch (e) {
            U.warn('No se pudieron borrar archivos del borrador:', e);
        }
    }

    /* Descarga el video de un borrador y lo devuelve como File. */
    async function descargarArchivoBorrador(path, nombre) {
        var resp = await fetch(U.urlPublicaBorrador(path));
        if (!resp.ok) throw new Error('No se pudo descargar el video del borrador');
        var blob = await resp.blob();
        var tipo = blob.type || 'video/webm';
        return new File([blob], nombre || ('borrador-' + Date.now() + '.webm'), { type: tipo });
    }

    function blobDePortadaActual() {
        return S.portadaBlob || null;
    }

    /* ----------------------------------------------------------------
       BASE DE DATOS DE BORRADORES (tabla videos_borradores)
       ---------------------------------------------------------------- */

    async function listarBorradores() {
        var sb = U.getSupabaseClient();
        var session = await U.obtenerSesion();
        if (!sb || !session) {
            return { ok: false, error: 'Inicia sesión para ver tus borradores', items: [] };
        }

        var r = await sb
            .from('videos_borradores')
            .select('*')
            .eq('usuario_id', session.user.id)
            .order('updated_at', { ascending: false })
            .limit(CONFIG.MAX_BORRADORES_LISTA);

        if (r.error) {
            return { ok: false, error: r.error.message || 'No se pudieron cargar los borradores', items: [] };
        }
        return { ok: true, items: r.data || [] };
    }

    /* Limpia las referencias de borrador en el estado. */
    function resetEstadoBorrador() {
        S.borradorEditandoId = null;
        S.archivoPathRemoto = null;
        S.portadaPathRemoto = null;
        S.borradorPaths = null;
    }

    async function contarBorradores(sb, usuarioId) {
        var r = await sb
            .from('videos_borradores')
            .select('id', { count: 'exact', head: true })
            .eq('usuario_id', usuarioId);
        if (r.error) throw new Error('No se pudo verificar tus borradores');
        return r.count || 0;
    }

    /* Consulta la cuota al servidor. Si falla, devuelve null y no bloquea el guardado. */
    async function consultarCuotaCliente(session) {
        try {
            var resp = await fetch('/api/media/cuota', {
                headers: { 'Authorization': 'Bearer ' + session.access_token }
            });
            if (!resp.ok) return null;
            var data = await resp.json();
            return data && data.ok ? data : null;
        } catch (e) {
            return null;
        }
    }

    /* ----------------------------------------------------------------
       GUARDAR BORRADOR
       ---------------------------------------------------------------- */

    async function guardarBorrador() {
        if (S.guardandoBorrador) return;

        var session = await U.obtenerSesion();
        if (!session) {
            NS.ui.csToast('Inicia sesión para guardar borradores', 'error');
            return;
        }

        var sb = U.getSupabaseClient();
        if (!sb) {
            NS.ui.csToast('Cliente Supabase no disponible', 'error');
            return;
        }

        var titulo = (($('inputTituloVideo') || {}).value || '').trim();
        var descripcion = (($('inputDescripcionVideo') || {}).value || '').trim();
        var archivo = S.archivoVideo;
        var sonido = S.sonidoSeleccionado;
        var ubicacion = S.ubicacionSeleccionada;

        if (!titulo && !archivo && !descripcion && !sonido && !ubicacion) {
            NS.ui.csToast('Escribe algo o elige un video antes de guardar el borrador', 'warning');
            return;
        }

        /* Límite de borradores y cuota, solo al crear uno nuevo. */
        if (!S.borradorEditandoId) {
            var total = await contarBorradores(sb, session.user.id);
            if (total >= C.LIMITE_BORRADORES) {
                NS.ui.csToast('Ya tienes ' + C.LIMITE_BORRADORES + ' borradores. Elimina uno para guardar otro.', 'warning', 5000);
                return;
            }

            var cuota = await consultarCuotaCliente(session);
            if (cuota && Number(cuota.usado_mb) >= Number(cuota.limite_mb)) {
                mostrarAvisoCuota(cuota);
                return;
            }
        }

        S.guardandoBorrador = true;
        NS.ui.csToast('Guardando borrador…', 'info', 2000);

        var subidos = [];
        var previos = S.borradorPaths || { archivo: null, portada: null };

        try {
            var usuarioId = session.user.id;

            var archivoPath = S.archivoPathRemoto;
            if (archivo && !archivoPath) {
                archivoPath = await subirBorradorArchivo(rutaBorrador(usuarioId, archivo.name), archivo, archivo.type);
                subidos.push(archivoPath);
            }

            var portadaPath = S.portadaPathRemoto;
            var portada = blobDePortadaActual();
            if (portada && !portadaPath) {
                portadaPath = await subirBorradorArchivo(rutaBorrador(usuarioId, 'portada.jpg'), portada, 'image/jpeg');
                subidos.push(portadaPath);
            }
            if (!portada) portadaPath = null;

            var duracion = null;
            var videoEl = $('csPreviewVideo');
            if (videoEl && isFinite(videoEl.duration) && videoEl.duration > 0) {
                duracion = Math.round(videoEl.duration);
            }

            var sonidoValido = sonido && U.urlSonidoValida(sonido.url) ? sonido : null;

            var fila = {
                usuario_id: usuarioId,
                titulo: titulo || null,
                descripcion: descripcion || null,
                sonido_id: sonidoValido ? sonidoValido.id : null,
                sonido_nombre: sonidoValido ? sonidoValido.nombre + ' — ' + sonidoValido.artista : null,
                sonido_url: sonidoValido ? sonidoValido.url : null,
                ubicacion_nombre: U.textoUbicacion(ubicacion),
                archivo_path: archivoPath || null,
                portada_path: portadaPath || null,
                duracion_seg: duracion,
                updated_at: new Date().toISOString()
            };

            var resultado;
            if (S.borradorEditandoId) {
                resultado = await sb.from('videos_borradores')
                    .update(fila)
                    .eq('id', S.borradorEditandoId)
                    .eq('usuario_id', usuarioId)
                    .select()
                    .single();
            } else {
                resultado = await sb.from('videos_borradores').insert(fila).select().single();
            }
            if (resultado.error) {
                throw new Error(resultado.error.message || 'No se pudo guardar el borrador');
            }

            /* Borra los archivos anteriores que ya no se usan. */
            var reemplazados = [];
            if (previos.archivo && previos.archivo !== archivoPath) reemplazados.push(previos.archivo);
            if (previos.portada && previos.portada !== portadaPath) reemplazados.push(previos.portada);
            if (reemplazados.length) await borrarBorradorArchivos(reemplazados);

            S.borradorEditandoId = resultado.data.id;
            S.archivoPathRemoto = archivoPath || null;
            S.portadaPathRemoto = portadaPath || null;
            S.borradorPaths = { archivo: S.archivoPathRemoto, portada: S.portadaPathRemoto };

            persistirMetaDebounced();
            NS.ui.csToast('Borrador guardado', 'success');
        } catch (e) {
            U.warn('Error guardando borrador:', e);
            await borrarBorradorArchivos(subidos);

            var msg = String((e && e.message) || '');
            if (msg.indexOf('limite_borradores') !== -1) {
                NS.ui.csToast('Ya tienes ' + C.LIMITE_BORRADORES + ' borradores. Elimina uno para guardar otro.', 'warning', 5000);
            } else if (msg.indexOf('cuota_excedida') !== -1) {
                mostrarAvisoCuota({ plan: null, limite_mb: null, usado_mb: null, disponible_mb: 0 });
            } else {
                NS.ui.csToast(msg || 'No se pudo guardar el borrador', 'error', 4000);
            }
        } finally {
            S.guardandoBorrador = false;
        }
    }

    /* ----------------------------------------------------------------
       LISTA, APERTURA Y ELIMINACIÓN
       ---------------------------------------------------------------- */

    /* Pinta la lista de borradores en la hoja correspondiente. */
    async function renderBorradores() {
        var lista = $('csBorradoresLista');
        if (!lista) return;

        lista.innerHTML = '<div class="cs-vacio"><span class="cs-ico-vacio">◈</span><p>Cargando borradores…</p></div>';

        var res = await listarBorradores();
        if (!res.ok) {
            lista.innerHTML = '<div class="cs-vacio"><span class="cs-ico-vacio">◈</span><p>' + esc(res.error) + '</p></div>';
            return;
        }

        if (res.items.length === 0) {
            lista.innerHTML = '<div class="cs-vacio"><span class="cs-ico-vacio">◈</span><p>Aún no tienes borradores.</p></div>';
            return;
        }

        lista.innerHTML = res.items.map(function (b) {
            var portada = b.portada_path ? U.urlPublicaBorrador(b.portada_path) : '';
            var fecha = b.updated_at
                ? new Date(b.updated_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '';
            var titulo = b.titulo || 'Sin título';
            var tieneVideo = b.archivo_path ? 'Con video' : 'Solo texto';

            return '' +
                '<div class="cs-borrador-item" data-borrador-id="' + esc(b.id) + '">' +
                    '<div class="cs-borrador-portada">' +
                        (portada ? '<img src="' + esc(portada) + '" alt="" />' : '<span>◈</span>') +
                    '</div>' +
                    '<div class="cs-borrador-info">' +
                        '<div class="cs-borrador-titulo">' + esc(titulo) + '</div>' +
                        '<div class="cs-borrador-meta">' + esc(tieneVideo) + ' · ' + esc(fecha) + '</div>' +
                    '</div>' +
                    '<div class="cs-borrador-acciones">' +
                        '<button type="button" class="cs-btn-ghost" data-accion="abrir" data-id="' + esc(b.id) + '">Abrir</button>' +
                        '<button type="button" class="cs-btn-ghost cs-btn-peligro" data-accion="eliminar" data-id="' + esc(b.id) + '">Eliminar</button>' +
                    '</div>' +
                '</div>';
        }).join('');

        lista.querySelectorAll('[data-accion]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = btn.dataset.id;
                if (btn.dataset.accion === 'abrir') abrirBorrador(id);
                else eliminarBorrador(id);
            });
        });
    }

    /* Carga un borrador en el formulario: texto, sonido, ubicación, video y portada. */
    async function abrirBorrador(id) {
        var sb = U.getSupabaseClient();
        var session = await U.obtenerSesion();
        if (!sb || !session) return;

        var r = await sb.from('videos_borradores')
            .select('*')
            .eq('id', id)
            .eq('usuario_id', session.user.id)
            .single();

        if (r.error || !r.data) {
            NS.ui.csToast('No se pudo abrir el borrador', 'error');
            return;
        }

        var data = r.data;

        resetEstadoBorrador();
        S.borradorEditandoId = data.id;
        S.archivoPathRemoto = data.archivo_path || null;
        S.portadaPathRemoto = data.portada_path || null;
        S.borradorPaths = { archivo: S.archivoPathRemoto, portada: S.portadaPathRemoto };

        var titulo = $('inputTituloVideo');
        var desc = $('inputDescripcionVideo');
        if (titulo) titulo.value = data.titulo || '';
        if (desc) desc.value = data.descripcion || '';

        if (data.sonido_id) {
            var s = U.buscarSonidoPorId(data.sonido_id);
            if (s) llamar('sheets', 'seleccionarSonidoSinSonar', s);
            else S.sonidoSeleccionado = null;
        } else {
            S.sonidoSeleccionado = null;
        }

        S.ubicacionSeleccionada = null;
        if (data.ubicacion_nombre) {
            for (var i = 0; i < UBICACIONES_SEED.length; i++) {
                if (U.textoUbicacion(UBICACIONES_SEED[i]) === data.ubicacion_nombre) {
                    S.ubicacionSeleccionada = UBICACIONES_SEED[i];
                    break;
                }
            }
        }

        if (data.archivo_path) {
            try {
                var archivo = await descargarArchivoBorrador(data.archivo_path, data.archivo_path.split('/').pop());
                S.archivoVideo = archivo;
                S.archivoConAudioMezclado = false;
                window.__csMiniaturaCamara = null;
                llamar('preview', 'ponerArchivoEnInput', archivo);
                llamar('preview', 'mostrarPreviewVideo', archivo);
                llamar('preview', 'actualizarTextoBotonArchivo', archivo);
            } catch (e) {
                U.warn('No se pudo cargar el video del borrador:', e);
                NS.ui.csToast('El video del borrador no se pudo cargar', 'warning', 4000);
            }
        }

        if (data.portada_path) {
            llamar('preview', 'mostrarPortadaDesdeUrl', U.urlPublicaBorrador(data.portada_path));
        }

        llamar('preview', 'actualizarResumenPreview');
        NS.ui.actualizarBotonesSonidoUbicacion();
        llamar('sheets', 'cerrarTodosLosSheets');
        persistirMetaDebounced();
        persistirArchivo();
        NS.ui.csToast('Borrador cargado. Puedes editarlo y publicarlo.', 'success', 3500);
    }

    /* Borra el borrador de la base y sus archivos del Storage. */
    async function eliminarBorrador(id) {
        var ok = await NS.ui.csConfirm({
            titulo: 'Eliminar borrador',
            mensaje: 'Se borrará el borrador y su video. Esta acción no se puede deshacer.',
            textoOk: 'Eliminar',
            peligroso: true
        });
        if (!ok) return;

        var sb = U.getSupabaseClient();
        var session = await U.obtenerSesion();
        if (!sb || !session) return;

        var previo = await sb.from('videos_borradores')
            .select('archivo_path, portada_path')
            .eq('id', id)
            .eq('usuario_id', session.user.id)
            .maybeSingle();

        var r = await sb.from('videos_borradores')
            .delete()
            .eq('id', id)
            .eq('usuario_id', session.user.id);

        if (r.error) {
            NS.ui.csToast('No se pudo eliminar el borrador', 'error');
            return;
        }

        if (previo.data) {
            await borrarBorradorArchivos([previo.data.archivo_path, previo.data.portada_path]);
        }

        if (S.borradorEditandoId === id) resetEstadoBorrador();
        NS.ui.csToast('Borrador eliminado', 'success');
        renderBorradores();
    }

    /* ----------------------------------------------------------------
       PERSISTENCIA AL ESCRIBIR TÍTULO Y DESCRIPCIÓN (una sola vez)
       ---------------------------------------------------------------- */

    function engancharPersistenciaCampos() {
        if (window.__csPersistenciaCampos) return;
        window.__csPersistenciaCampos = true;

        document.addEventListener('input', function (e) {
            if (!e.target || !e.target.id) return;
            if (e.target.id === 'inputTituloVideo' || e.target.id === 'inputDescripcionVideo') {
                persistirMetaDebounced();
            }
        });
    }

    /* Llamado por videos-publicar.js (entrada). */
    function inicializar() {
        engancharPersistenciaCampos();
    }

    /* ----------------------------------------------------------------
       EXPOSICIÓN
       ---------------------------------------------------------------- */

    NS.borradores = {
        inicializar: inicializar,
        restaurarLocal: restaurarLocal,
        persistirMeta: persistirMeta,
        persistirMetaDebounced: persistirMetaDebounced,
        persistirArchivo: persistirArchivo,
        limpiarPersistencia: limpiarPersistencia,
        resetEstadoBorrador: resetEstadoBorrador,
        guardarBorrador: guardarBorrador,
        renderBorradores: renderBorradores,
        abrirBorrador: abrirBorrador,
        eliminarBorrador: eliminarBorrador,
        listarBorradores: listarBorradores,
        mostrarAvisoCuota: mostrarAvisoCuota,
        descargarVideoActual: descargarVideoActual
    };
})();