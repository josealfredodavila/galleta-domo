/* ============================================================
   CSARIEL'S · CONTACTOS · solicitudes.js · v1.0
   ============================================================
   Módulo: gestión de solicitudes de amistad.
   - Solicitudes RECIBIDAS: aceptar / rechazar.
   - Solicitudes ENVIADAS: cancelar.
   - Actualiza contadores y listas sin romper el estado global.
   - Delega en window.SocialAcciones si está disponible; si no,
     usa Supabase directamente (fallback seguro).

   API pública (window.ContactosSolicitudes):
     - init(ctx)
     - refrescarRecibidas()
     - refrescarEnviadas()
     - aceptar(filaId)
     - rechazar(filaId)
     - cancelarEnviada(filaId)
     - renderRecibidas(lista, errores)
     - renderEnviadas(lista, errores)

   ctx esperado (proporcionado por contactos.js / contactos-ui.js):
     {
       getClient(): SupabaseClient,
       getSession(): Promise<Session|null>,
       getPerfiles(): Map<id, perfil>,
       getPerfil(id): datosPerfil(id),
       cargarPerfiles(ids): Promise<{errores: []}>,
       escapeHtml(v): string,
       obtenerInicial(nombre): string,
       avatarHtml(datos): string,
       showToast(msg, tipo): void,
       showConfirm(opts): Promise<boolean>,
       refrescarTodo(opts): Promise<void>,
       refrescarTodoReset(): void,
       avisoSeccion(seccion, msg, onRetry): void,
       quitarAviso(seccion): void,
       withRetry(fn, contexto): Promise<any>,
       detalleError(err): string,
       SVG: { agregarAmigo, check }
     }
   ============================================================ */

(function () {
    'use strict';

    if (window.ContactosSolicitudes) return;

    var CONFIG = {
        TABLA: 'contactos',
        RPC_RESPONDER: 'responder_solicitud_amistad',
        RPC_CANCELAR: null // DELETE directo con filtros de seguridad
    };

    var ctx = null;
    var operacionesEnCurso = new Set();

    /* ============================================================
       UTILIDADES INTERNAS
       ============================================================ */

    function _sb() {
        if (ctx && typeof ctx.getClient === 'function') return ctx.getClient();
        return window.supabaseClient || null;
    }

    function _session() {
        if (ctx && typeof ctx.getSession === 'function') return ctx.getSession();
        return Promise.resolve(null);
    }

    function _toast(msg, tipo) {
        if (ctx && typeof ctx.showToast === 'function') return ctx.showToast(msg, tipo);
        if (typeof window.showToast === 'function') return window.showToast(msg, tipo);
        console.log('[Solicitudes]', msg);
    }

    function _confirm(opts) {
        if (ctx && typeof ctx.showConfirm === 'function') return ctx.showConfirm(opts);
        return Promise.resolve(window.confirm((opts.title || '') + '\n\n' + (opts.message || '')));
    }

    function _err(err) {
        if (ctx && typeof ctx.detalleError === 'function') return ctx.detalleError(err);
        if (!err) return 'error desconocido';
        return (err.code ? err.code + ': ' : '') + (err.message || String(err));
    }

    function _escape(v) {
        if (ctx && typeof ctx.escapeHtml === 'function') return ctx.escapeHtml(v);
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function _inicial(nombre) {
        if (ctx && typeof ctx.obtenerInicial === 'function') return ctx.obtenerInicial(nombre);
        var t = String(nombre || 'U').trim();
        return t ? t.charAt(0).toUpperCase() : 'U';
    }

    function _avatarHtml(d) {
        if (ctx && typeof ctx.avatarHtml === 'function') return ctx.avatarHtml(d);
        if (d && d.avatar) return '<img src="' + _escape(d.avatar) + '" alt="" loading="lazy">';
        return _escape(_inicial(d && d.nombre));
    }

    function _datosPerfil(id) {
        if (ctx && typeof ctx.getPerfil === 'function') return ctx.getPerfil(id);
        return { nombre: 'Usuario', handle: '', avatar: '', estado: 'ok', verificado: false, online: false };
    }

    function _cargarPerfiles(ids) {
        if (ctx && typeof ctx.cargarPerfiles === 'function') return ctx.cargarPerfiles(ids);
        return Promise.resolve({ errores: [] });
    }

    function _withRetry(fn, contexto) {
        if (ctx && typeof ctx.withRetry === 'function') return ctx.withRetry(fn, contexto);
        return fn();
    }

    function _refrescar(opts) {
        if (ctx && typeof ctx.refrescarTodo === 'function') return ctx.refrescarTodo(opts || { reset: true });
        return Promise.resolve();
    }

    function _refrescarReset() {
        if (ctx && typeof ctx.refrescarTodoReset === 'function') return ctx.refrescarTodoReset();
        return _refrescar({ reset: true });
    }

    function _aviso(seccion, msg, retry) {
        if (ctx && typeof ctx.avisoSeccion === 'function') return ctx.avisoSeccion(seccion, msg, retry);
        console.warn('[Solicitudes] Aviso:', msg);
    }

    function _quitarAviso(seccion) {
        if (ctx && typeof ctx.quitarAviso === 'function') return ctx.quitarAviso(seccion);
    }

    function _clave(op, id) { return op + ':' + String(id); }
    function _bloqueado(clave) { return operacionesEnCurso.has(clave); }
    function _marcar(clave) { operacionesEnCurso.add(clave); }
    function _liberar(clave) { operacionesEnCurso.delete(clave); }

    /* ============================================================
       RENDER: solicitudes recibidas
       ============================================================ */

    function renderRecibidas(lista, errorConsulta, errorPerfiles) {
        var seccion = document.getElementById('solicitudesPendientesSection');
        var contenedor = document.getElementById('solicitudesPendientesLista');
        var contador = document.getElementById('solicitudesContador');
        if (!seccion || !contenedor || !contador) return;

        _quitarAviso(seccion);

        if (errorConsulta) {
            seccion.style.display = 'block';
            contenedor.innerHTML = '';
            _aviso(seccion, 'No se pudieron cargar las solicitudes recibidas: ' + errorConsulta, _refrescarReset);
            return;
        }

        var items = Array.isArray(lista) ? lista : [];
        if (!items.length) {
            seccion.style.display = 'none';
            contenedor.innerHTML = '';
            return;
        }

        seccion.style.display = 'block';
        contador.textContent = String(items.length);

        contenedor.innerHTML = items.map(function (s) {
            var d = _datosPerfil(s.usuario_id);
            return '<div class="solicitud-card" data-solicitud-recibida-id="' + _escape(s.id) + '">' +
                '<div class="avatar">' + _avatarHtml(d) + '</div>' +
                '<div class="info">' +
                    '<div class="nombre">' + _escape(d.nombre) + '</div>' +
                    '<div class="handle">' + _escape(d.handle) + '</div>' +
                '</div>' +
                '<div class="acciones">' +
                    '<button type="button" class="btn-aceptar" data-solicitud-aceptar="' + _escape(s.id) + '" data-usuario-id="' + _escape(s.usuario_id) + '">Aceptar</button>' +
                    '<button type="button" class="btn-rechazar" data-solicitud-rechazar="' + _escape(s.id) + '">Rechazar</button>' +
                '</div>' +
            '</div>';
        }).join('');

        if (errorPerfiles) {
            _aviso(seccion, 'Algunos nombres no se pudieron cargar: ' + errorPerfiles, _refrescarReset);
        }
    }

    /* ============================================================
       RENDER: solicitudes enviadas
       ============================================================ */

    function renderEnviadas(lista, errorConsulta, errorPerfiles) {
        var seccion = document.getElementById('solicitudesEnviadasSection');
        var contenedor = document.getElementById('solicitudesEnviadasLista');
        var contador = document.getElementById('solicitudesEnviadasContador');
        if (!seccion || !contenedor || !contador) return;

        _quitarAviso(seccion);

        if (errorConsulta) {
            seccion.style.display = 'block';
            contenedor.innerHTML = '';
            _aviso(seccion, 'No se pudieron cargar las solicitudes enviadas: ' + errorConsulta, _refrescarReset);
            return;
        }

        var items = Array.isArray(lista) ? lista : [];
        if (!items.length) {
            seccion.style.display = 'none';
            contenedor.innerHTML = '';
            return;
        }

        seccion.style.display = 'block';
        contador.textContent = String(items.length);

        contenedor.innerHTML = items.map(function (s) {
            var d = _datosPerfil(s.contacto_id);
            var reintentar = d.estado === 'error'
                ? '<button type="button" class="btn-reintentar-perfil" data-reintentar-perfil="' + _escape(s.contacto_id) + '">Reintentar</button>'
                : '';
            return '<div class="solicitud-enviada-card" data-solicitud-enviada-id="' + _escape(s.id) + '">' +
                '<div class="avatar">' + _avatarHtml(d) + '</div>' +
                '<div class="info">' +
                    '<div class="nombre">' + _escape(d.nombre) + '</div>' +
                    '<div class="handle">' + _escape(d.handle) + '</div>' +
                '</div>' +
                '<div class="acciones">' + reintentar +
                    '<button type="button" class="btn-cancelar-envio" data-solicitud-cancelar="' + _escape(s.id) + '">Cancelar envío</button>' +
                '</div>' +
            '</div>';
        }).join('');

        if (errorPerfiles) {
            _aviso(seccion, 'Algunos nombres no se pudieron cargar: ' + errorPerfiles, _refrescarReset);
        }
    }

    /* ============================================================
       CONSULTAS
       ============================================================ */

    async function cargarRecibidas() {
        var client = _sb();
        var session = await _session();
        if (!client || !session) return { lista: [], error: null, errorPerfiles: null };

        try {
            var r = await _withRetry(function () {
                return client.from(CONFIG.TABLA)
                    .select('id, usuario_id, contacto_id')
                    .eq('contacto_id', session.user.id)
                    .eq('estado', 'pendiente');
            }, 'solicitudes recibidas');

            if (r.error) throw r.error;

            var lista = (r.data || []).map(function (s) {
                return { id: s.id, usuario_id: s.usuario_id };
            });

            var ids = lista.map(function (s) { return s.usuario_id; }).filter(Boolean);
            var lote = await _cargarPerfiles(ids);
            var errorPerfiles = lote && lote.errores && lote.errores.length ? lote.errores[0] : null;

            return { lista: lista, error: null, errorPerfiles: errorPerfiles };
        } catch (err) {
            console.error('[Solicitudes] Recibidas:', _err(err));
            return { lista: [], error: _err(err), errorPerfiles: null };
        }
    }

    async function cargarEnviadas() {
        var client = _sb();
        var session = await _session();
        if (!client || !session) return { lista: [], error: null, errorPerfiles: null };

        try {
            var r = await _withRetry(function () {
                return client.from(CONFIG.TABLA)
                    .select('id, usuario_id, contacto_id')
                    .eq('usuario_id', session.user.id)
                    .eq('estado', 'pendiente');
            }, 'solicitudes enviadas');

            if (r.error) throw r.error;

            var lista = (r.data || []).map(function (s) {
                return { id: s.id, contacto_id: s.contacto_id };
            });

            var ids = lista.map(function (s) { return s.contacto_id; }).filter(Boolean);
            var lote = await _cargarPerfiles(ids);
            var errorPerfiles = lote && lote.errores && lote.errores.length ? lote.errores[0] : null;

            return { lista: lista, error: null, errorPerfiles: errorPerfiles };
        } catch (err) {
            console.error('[Solicitudes] Enviadas:', _err(err));
            return { lista: [], error: _err(err), errorPerfiles: null };
        }
    }

    /* ============================================================
       REFRESCO DE LISTAS (sin tocar el resto del estado global)
       ============================================================ */

    async function refrescarRecibidas() {
        var res = await cargarRecibidas();
        renderRecibidas(res.lista, res.error, res.errorPerfiles);
        return res;
    }

    async function refrescarEnviadas() {
        var res = await cargarEnviadas();
        renderEnviadas(res.lista, res.error, res.errorPerfiles);
        return res;
    }

    /* ============================================================
       ACCIONES: aceptar / rechazar
       ============================================================ */

    async function aceptar(filaId) {
        var fila = Number(filaId);
        if (!Number.isInteger(fila) || fila <= 0) {
            _toast('ID inválido.', 'error');
            return { ok: false };
        }
        var clave = _clave('aceptar', fila);
        if (_bloqueado(clave)) return { ok: false };

        var client = _sb();
        var session = await _session();
        if (!client || !session) {
            _toast('Inicia sesión.', 'error');
            return { ok: false };
        }

        _marcar(clave);
        try {
            // Delegación al cerebro unificado si está disponible
            if (window.SocialAcciones && typeof window.SocialAcciones.responderSolicitud === 'function') {
                var resSocial = await window.SocialAcciones.responderSolicitud(fila, true);
                if (!resSocial || !resSocial.ok) throw new Error('No se pudo aceptar la solicitud');
            } else {
                var r = await _withRetry(function () {
                    return client.rpc(CONFIG.RPC_RESPONDER, { p_fila_id: fila, p_aceptar: true });
                }, 'aceptar solicitud');
                if (r.error) throw r.error;
                _toast('Amistad aceptada.', 'success');
            }

            await _refrescar({ reset: true });
            return { ok: true };
        } catch (err) {
            console.error('[Solicitudes] Aceptar:', _err(err));
            _toast('Error al aceptar: ' + _err(err), 'error');
            return { ok: false };
        } finally {
            _liberar(clave);
        }
    }

    async function rechazar(filaId) {
        var fila = Number(filaId);
        if (!Number.isInteger(fila) || fila <= 0) {
            _toast('ID inválido.', 'error');
            return { ok: false };
        }
        var clave = _clave('rechazar', fila);
        if (_bloqueado(clave)) return { ok: false };

        var client = _sb();
        var session = await _session();
        if (!client || !session) {
            _toast('Inicia sesión.', 'error');
            return { ok: false };
        }

        _marcar(clave);
        try {
            if (window.SocialAcciones && typeof window.SocialAcciones.responderSolicitud === 'function') {
                var resSocial = await window.SocialAcciones.responderSolicitud(fila, false);
                if (!resSocial || !resSocial.ok) throw new Error('No se pudo rechazar la solicitud');
            } else {
                var r = await _withRetry(function () {
                    return client.rpc(CONFIG.RPC_RESPONDER, { p_fila_id: fila, p_aceptar: false });
                }, 'rechazar solicitud');
                if (r.error) throw r.error;
                _toast('Solicitud rechazada.', 'success');
            }

            await _refrescar({ reset: true });
            return { ok: true };
        } catch (err) {
            console.error('[Solicitudes] Rechazar:', _err(err));
            _toast('Error al rechazar: ' + _err(err), 'error');
            return { ok: false };
        } finally {
            _liberar(clave);
        }
    }

    /* ============================================================
       ACCIÓN: cancelar solicitud enviada
       ============================================================ */

    async function cancelarEnviada(filaId) {
        var client = _sb();
        var session = await _session();
        if (!client || !session) {
            _toast('Inicia sesión.', 'error');
            return { ok: false };
        }
        if (filaId == null) return { ok: false };

        var confirmado = await _confirm({
            title: 'Cancelar solicitud',
            message: '¿Retirar solicitud de amistad?',
            icon: '↩️',
            confirmText: 'Retirar',
            cancelText: 'Volver',
            danger: true
        });
        if (!confirmado) return { ok: false };

        var clave = _clave('cancelar', filaId);
        if (_bloqueado(clave)) return { ok: false };
        _marcar(clave);

        try {
            // Delegación al cerebro unificado si está disponible
            if (window.SocialAcciones && typeof window.SocialAcciones.cancelarSolicitud === 'function') {
                // OJO: SocialAcciones.cancelarSolicitud actual NO filtra por usuario_id.
                // Hacemos la operación segura directamente para no permitir borrar
                // filas ajenas si el filaId viniera manipulado desde el cliente.
                var r1 = await client.from(CONFIG.TABLA)
                    .delete()
                    .eq('id', filaId)
                    .eq('usuario_id', session.user.id)
                    .eq('estado', 'pendiente');
                if (r1.error) throw r1.error;
            } else {
                var r = await client.from(CONFIG.TABLA)
                    .delete()
                    .eq('id', filaId)
                    .eq('usuario_id', session.user.id)
                    .eq('estado', 'pendiente');
                if (r.error) throw r.error;
            }

            _toast('Solicitud retirada.', 'success');
            await _refrescar({ reset: true });
            return { ok: true };
        } catch (err) {
            console.error('[Solicitudes] Cancelar enviada:', _err(err));
            _toast('Error al cancelar: ' + _err(err), 'error');
            return { ok: false };
        } finally {
            _liberar(clave);
        }
    }

    /* ============================================================
       INICIALIZACIÓN
       ============================================================ */

    function init(contexto) {
        ctx = contexto || null;
        return {
            ok: true,
            api: window.ContactosSolicitudes
        };
    }

    /* ============================================================
       API PÚBLICA
       ============================================================ */

    window.ContactosSolicitudes = {
        // Config
        CONFIG: CONFIG,

        // Init
        init: init,

        // Render
        renderRecibidas: renderRecibidas,
        renderEnviadas: renderEnviadas,

        // Consultas
        cargarRecibidas: cargarRecibidas,
        cargarEnviadas: cargarEnviadas,
        refrescarRecibidas: refrescarRecibidas,
        refrescarEnviadas: refrescarEnviadas,

        // Acciones
        aceptar: aceptar,
        rechazar: rechazar,
        cancelarEnviada: cancelarEnviada
    };
})();