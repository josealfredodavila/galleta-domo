/* ============================================================
   CSARIEL'S · CONTACTOS · solicitudes.js · v2.0
   PREMIUM SOCIAL EXPERIENCE · ENTERPRISE / NEXT-GEN
   ============================================================
   Diseño:
   - Experiencia visual inspirada en plataformas sociales globales.
   - Interfaz sobria, tecnológica, minimalista y profesional.
   - Sin emojis decorativos.
   - Identidad visual Csariel's: verde bosque y oro.
   - Solicitudes recibidas y enviadas con jerarquía visual.
   - Acciones compactas, elegantes y consistentes.
   - Estados de carga, error y actualización.
   - Diseño adaptable a móvil y escritorio.

   Funcionalidad:
   - Solicitudes RECIBIDAS: aceptar / rechazar.
   - Solicitudes ENVIADAS: cancelar.
   - Actualiza contadores y listas sin romper el estado global.
   - Delega en window.SocialAcciones si está disponible.
   - Fallback seguro con Supabase.

   API pública (window.ContactosSolicitudes):
     - init(ctx)
     - refrescarRecibidas()
     - refrescarEnviadas()
     - aceptar(filaId)
     - rechazar(filaId)
     - cancelarEnviada(filaId)
     - renderRecibidas(lista, errores)
     - renderEnviadas(lista, errores)

   IMPORTANTE:
   - No modifica el esquema de Supabase.
   - No crea tablas ni RPC adicionales.
   - Conserva los identificadores HTML existentes.
   - Conserva la compatibilidad con contactos.js.
   ============================================================ */

(function () {
    'use strict';

    if (window.ContactosSolicitudes) return;

    var CONFIG = {
        TABLA: 'contactos',
        RPC_RESPONDER: 'responder_solicitud_amistad',
        RPC_CANCELAR: null,
        VERSION: '2.0'
    };

    var ESTILO_ID = 'csariel-solicitudes-premium-v2';
    var ctx = null;
    var operacionesEnCurso = new Set();

    /* ============================================================
       IDENTIDAD VISUAL · CSARIEL'S
       ============================================================ */

    function instalarEstilos() {
        if (document.getElementById(ESTILO_ID)) return;

        var css = `
        /* =====================================================
           CSARIEL'S · SOLICITUDES · PREMIUM SOCIAL INTERFACE
           ===================================================== */

        #solicitudesPendientesSection,
        #solicitudesEnviadasSection {
            --cs-bg: #0b0e0d;
            --cs-surface: #101513;
            --cs-surface-hover: #151c18;
            --cs-border: rgba(255,255,255,.085);
            --cs-text: #f4f6f4;
            --cs-muted: #858e88;
            --cs-green: #0f2d1a;
            --cs-green-light: #1c7046;
            --cs-gold: #d4af37;
            --cs-red: #e36d70;
            width: 100%;
            color: var(--cs-text);
            font-family: inherit;
            box-sizing: border-box;
        }

        #solicitudesPendientesSection *,
        #solicitudesEnviadasSection * {
            box-sizing: border-box;
        }

        #solicitudesPendientesLista,
        #solicitudesEnviadasLista {
            display: flex;
            flex-direction: column;
            width: 100%;
            gap: 0;
            overflow: hidden;
            border-top: 1px solid var(--cs-border);
        }

        /* FILAS DE SOLICITUDES */

        #solicitudesPendientesLista .solicitud-card,
        #solicitudesEnviadasLista .solicitud-enviada-card {
            position: relative;
            display: flex;
            align-items: center;
            width: 100%;
            min-width: 0;
            gap: 13px;
            padding: 15px 12px;
            margin: 0;
            background: transparent;
            border: 0;
            border-bottom: 1px solid var(--cs-border);
            border-radius: 0;
            box-shadow: none;
            transition: background .18s ease;
        }

        #solicitudesPendientesLista .solicitud-card:hover,
        #solicitudesEnviadasLista .solicitud-enviada-card:hover {
            background: rgba(255,255,255,.025);
        }

        /* AVATARES */

        #solicitudesPendientesLista .avatar,
        #solicitudesEnviadasLista .avatar {
            position: relative;
            display: flex;
            flex: 0 0 49px;
            align-items: center;
            justify-content: center;
            width: 49px;
            height: 49px;
            overflow: hidden;
            border: 1px solid rgba(212,175,55,.24);
            border-radius: 50%;
            background: linear-gradient(145deg,#183c29,#101b14);
            color: #e6c75e;
            font-size: 17px;
            font-weight: 700;
            letter-spacing: -.5px;
        }

        #solicitudesPendientesLista .avatar img,
        #solicitudesEnviadasLista .avatar img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
        }

        /* INFORMACIÓN */

        #solicitudesPendientesLista .info,
        #solicitudesEnviadasLista .info {
            display: flex;
            flex: 1 1 auto;
            flex-direction: column;
            justify-content: center;
            min-width: 0;
            gap: 4px;
        }

        #solicitudesPendientesLista .nombre,
        #solicitudesEnviadasLista .nombre {
            overflow: hidden;
            color: #f4f6f4;
            font-size: 14px;
            font-weight: 700;
            line-height: 1.35;
            letter-spacing: -.2px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #solicitudesPendientesLista .handle,
        #solicitudesEnviadasLista .handle {
            overflow: hidden;
            color: #858e88;
            font-size: 12px;
            font-weight: 400;
            line-height: 1.4;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* ACCIONES */

        #solicitudesPendientesLista .acciones,
        #solicitudesEnviadasLista .acciones {
            display: flex;
            flex: 0 0 auto;
            align-items: center;
            justify-content: flex-end;
            gap: 7px;
            margin-left: auto;
        }

        #solicitudesPendientesLista button,
        #solicitudesEnviadasLista button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 34px;
            padding: 0 12px;
            border: 1px solid transparent;
            border-radius: 7px;
            font-family: inherit;
            font-size: 11px;
            font-weight: 700;
            line-height: 1;
            letter-spacing: .1px;
            white-space: nowrap;
            cursor: pointer;
            transition:
                background .18s ease,
                border-color .18s ease,
                transform .18s ease,
                opacity .18s ease;
        }

        #solicitudesPendientesLista button:active,
        #solicitudesEnviadasLista button:active {
            transform: scale(.97);
        }

        #solicitudesPendientesLista button:disabled,
        #solicitudesEnviadasLista button:disabled {
            opacity: .45;
            cursor: not-allowed;
        }

        /* ACEPTAR */

        #solicitudesPendientesLista .btn-aceptar {
            color: #ffffff;
            background: #155d39;
            border-color: rgba(83,190,127,.2);
        }

        #solicitudesPendientesLista .btn-aceptar:hover {
            background: #1b7548;
            border-color: rgba(83,190,127,.55);
        }

        /* RECHAZAR */

        #solicitudesPendientesLista .btn-rechazar {
            color: #b9c0bb;
            background: transparent;
            border-color: rgba(255,255,255,.13);
        }

        #solicitudesPendientesLista .btn-rechazar:hover {
            color: #ffffff;
            background: rgba(255,255,255,.07);
            border-color: rgba(255,255,255,.25);
        }

        /* CANCELAR */

        #solicitudesEnviadasLista .btn-cancelar-envio {
            color: #c0c7c1;
            background: transparent;
            border-color: rgba(255,255,255,.14);
        }

        #solicitudesEnviadasLista .btn-cancelar-envio:hover {
            color: #f18b8b;
            border-color: rgba(227,109,112,.45);
            background: rgba(227,109,112,.07);
        }

        /* REINTENTAR */

        #solicitudesEnviadasLista .btn-reintentar-perfil {
            color: #e1c45c;
            background: rgba(212,175,55,.07);
            border-color: rgba(212,175,55,.22);
        }

        /* CONTADORES */

        #solicitudesContador,
        #solicitudesEnviadasContador {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 21px;
            height: 21px;
            padding: 0 6px;
            color: #e5c65d;
            background: rgba(212,175,55,.11);
            border: 1px solid rgba(212,175,55,.2);
            border-radius: 20px;
            font-size: 11px;
            font-weight: 800;
            font-variant-numeric: tabular-nums;
        }

        /* AVISOS */

        #solicitudesPendientesSection .cs-solicitudes-error,
        #solicitudesEnviadasSection .cs-solicitudes-error {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 14px;
            color: #e4b2b2;
            background: rgba(227,109,112,.055);
            border-bottom: 1px solid rgba(227,109,112,.2);
            font-size: 12px;
            line-height: 1.5;
        }

        #solicitudesPendientesSection .cs-solicitudes-error button,
        #solicitudesEnviadasSection .cs-solicitudes-error button {
            align-self: flex-start;
            color: #e4c76b;
            background: transparent;
            border: 1px solid rgba(212,175,55,.3);
        }

        /* INDICADOR DE OPERACIÓN */

        #solicitudesPendientesLista .cs-procesando,
        #solicitudesEnviadasLista .cs-procesando {
            opacity: .5;
            pointer-events: none;
        }

        /* ACCESIBILIDAD */

        #solicitudesPendientesSection button:focus-visible,
        #solicitudesEnviadasSection button:focus-visible {
            outline: 2px solid #d4af37;
            outline-offset: 3px;
        }

        /* MÓVIL */

        @media (max-width: 480px) {
            #solicitudesPendientesLista .solicitud-card,
            #solicitudesEnviadasLista .solicitud-enviada-card {
                gap: 10px;
                padding: 13px 9px;
            }

            #solicitudesPendientesLista .avatar,
            #solicitudesEnviadasLista .avatar {
                flex-basis: 43px;
                width: 43px;
                height: 43px;
            }

            #solicitudesPendientesLista .acciones,
            #solicitudesEnviadasLista .acciones {
                gap: 5px;
            }

            #solicitudesPendientesLista button,
            #solicitudesEnviadasLista button {
                min-height: 32px;
                padding: 0 9px;
                font-size: 10px;
            }

            #solicitudesPendientesLista .nombre,
            #solicitudesEnviadasLista .nombre {
                font-size: 13px;
            }

            #solicitudesPendientesLista .handle,
            #solicitudesEnviadasLista .handle {
                font-size: 11px;
            }
        }

        @media (max-width: 350px) {
            #solicitudesPendientesLista .solicitud-card,
            #solicitudesEnviadasLista .solicitud-enviada-card {
                flex-wrap: wrap;
            }

            #solicitudesPendientesLista .acciones,
            #solicitudesEnviadasLista .acciones {
                width: 100%;
                padding-left: 53px;
                justify-content: flex-start;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #solicitudesPendientesSection *,
            #solicitudesEnviadasSection * {
                transition: none !important;
            }
        }
        `;

        var style = document.createElement('style');
        style.id = ESTILO_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

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
        if (!err) return 'Error desconocido';
        return (err.code ? err.code + ': ' : '') + (err.message || String(err));
    }

    function _escape(v) {
        if (ctx && typeof ctx.escapeHtml === 'function') return ctx.escapeHtml(v);

        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function _inicial(nombre) {
        if (ctx && typeof ctx.obtenerInicial === 'function') return ctx.obtenerInicial(nombre);

        var t = String(nombre || 'U').trim();
        return t ? t.charAt(0).toUpperCase() : 'U';
    }

    function _avatarHtml(d) {
        if (ctx && typeof ctx.avatarHtml === 'function') return ctx.avatarHtml(d);

        if (d && d.avatar) {
            return '<img src="' + _escape(d.avatar) + '" alt="" loading="lazy">';
        }

        return _escape(_inicial(d && d.nombre));
    }

    function _datosPerfil(id) {
        if (ctx && typeof ctx.getPerfil === 'function') return ctx.getPerfil(id);

        return {
            nombre: 'Usuario',
            handle: '',
            avatar: '',
            estado: 'ok',
            verificado: false,
            online: false
        };
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
        if (ctx && typeof ctx.refrescarTodo === 'function') {
            return ctx.refrescarTodo(opts || { reset: true });
        }

        return Promise.resolve();
    }

    function _refrescarReset() {
        if (ctx && typeof ctx.refrescarTodoReset === 'function') {
            return ctx.refrescarTodoReset();
        }

        return _refrescar({ reset: true });
    }

    function _aviso(seccion, msg, retry) {
        if (ctx && typeof ctx.avisoSeccion === 'function') {
            return ctx.avisoSeccion(seccion, msg, retry);
        }

        var anterior = seccion.querySelector('.cs-solicitudes-error');

        if (anterior) anterior.remove();

        var aviso = document.createElement('div');
        aviso.className = 'cs-solicitudes-error';

        var texto = document.createElement('div');
        texto.textContent = msg;
        aviso.appendChild(texto);

        if (typeof retry === 'function') {
            var boton = document.createElement('button');
            boton.type = 'button';
            boton.textContent = 'Volver a intentar';
            boton.addEventListener('click', retry);
            aviso.appendChild(boton);
        }

        seccion.appendChild(aviso);
    }

    function _quitarAviso(seccion) {
        if (ctx && typeof ctx.quitarAviso === 'function') {
            ctx.quitarAviso(seccion);
        }

        var aviso = seccion.querySelector('.cs-solicitudes-error');
        if (aviso) aviso.remove();
    }

    function _clave(op, id) {
        return op + ':' + String(id);
    }

    function _bloqueado(clave) {
        return operacionesEnCurso.has(clave);
    }

    function _marcar(clave) {
        operacionesEnCurso.add(clave);
    }

    function _liberar(clave) {
        operacionesEnCurso.delete(clave);
    }

    function _marcarBotones(id, atributo, estado) {
        var selector = '[' + atributo + '="' + String(id).replace(/"/g, '\\"') + '"]';
        var botones = document.querySelectorAll(selector);

        Array.prototype.forEach.call(botones, function (boton) {
            boton.disabled = estado;

            if (estado) {
                boton.setAttribute('aria-busy', 'true');
            } else {
                boton.removeAttribute('aria-busy');
            }
        });
    }

    /* ============================================================
       RENDER · SOLICITUDES RECIBIDAS
       ============================================================ */

    function renderRecibidas(lista, errorConsulta, errorPerfiles) {
        instalarEstilos();

        var seccion = document.getElementById('solicitudesPendientesSection');
        var contenedor = document.getElementById('solicitudesPendientesLista');
        var contador = document.getElementById('solicitudesContador');

        if (!seccion || !contenedor || !contador) return;

        _quitarAviso(seccion);

        if (errorConsulta) {
            seccion.style.display = 'block';
            contenedor.innerHTML = '';

            _aviso(
                seccion,
                'No se pudieron cargar las solicitudes recibidas: ' + errorConsulta,
                _refrescarReset
            );

            return;
        }

        var items = Array.isArray(lista) ? lista : [];

        contador.textContent = String(items.length);

        if (!items.length) {
            seccion.style.display = 'none';
            contenedor.innerHTML = '';
            return;
        }

        seccion.style.display = 'block';

        contenedor.innerHTML = items.map(function (s) {
            var d = _datosPerfil(s.usuario_id);

            var nombre = d.nombre || 'Usuario';
            var handle = d.handle || '';

            return (
                '<div class="solicitud-card" data-solicitud-recibida-id="' + _escape(s.id) + '">' +

                    '<div class="avatar">' +
                        _avatarHtml(d) +
                    '</div>' +

                    '<div class="info">' +
                        '<div class="nombre">' + _escape(nombre) + '</div>' +
                        '<div class="handle">' + _escape(handle) + '</div>' +
                    '</div>' +

                    '<div class="acciones">' +

                        '<button type="button" class="btn-aceptar"' +
                            ' data-solicitud-aceptar="' + _escape(s.id) + '"' +
                            ' data-usuario-id="' + _escape(s.usuario_id) + '"' +
                            ' aria-label="Aceptar solicitud">' +
                            'Aceptar' +
                        '</button>' +

                        '<button type="button" class="btn-rechazar"' +
                            ' data-solicitud-rechazar="' + _escape(s.id) + '"' +
                            ' aria-label="Rechazar solicitud">' +
                            'Rechazar' +
                        '</button>' +

                    '</div>' +

                '</div>'
            );
        }).join('');

        if (errorPerfiles) {
            _aviso(
                seccion,
                'Algunos perfiles no se pudieron cargar: ' + errorPerfiles,
                _refrescarReset
            );
        }
    }

    /* ============================================================
       RENDER · SOLICITUDES ENVIADAS
       ============================================================ */

    function renderEnviadas(lista, errorConsulta, errorPerfiles) {
        instalarEstilos();

        var seccion = document.getElementById('solicitudesEnviadasSection');
        var contenedor = document.getElementById('solicitudesEnviadasLista');
        var contador = document.getElementById('solicitudesEnviadasContador');

        if (!seccion || !contenedor || !contador) return;

        _quitarAviso(seccion);

        if (errorConsulta) {
            seccion.style.display = 'block';
            contenedor.innerHTML = '';

            _aviso(
                seccion,
                'No se pudieron cargar las solicitudes enviadas: ' + errorConsulta,
                _refrescarReset
            );

            return;
        }

        var items = Array.isArray(lista) ? lista : [];

        contador.textContent = String(items.length);

        if (!items.length) {
            seccion.style.display = 'none';
            contenedor.innerHTML = '';
            return;
        }

        seccion.style.display = 'block';

        contenedor.innerHTML = items.map(function (s) {
            var d = _datosPerfil(s.contacto_id);

            var nombre = d.nombre || 'Usuario';
            var handle = d.handle || '';

            var reintentar = d.estado === 'error'
                ? (
                    '<button type="button" class="btn-reintentar-perfil"' +
                    ' data-reintentar-perfil="' + _escape(s.contacto_id) + '">' +
                    'Reintentar' +
                    '</button>'
                )
                : '';

            return (
                '<div class="solicitud-enviada-card" data-solicitud-enviada-id="' + _escape(s.id) + '">' +

                    '<div class="avatar">' +
                        _avatarHtml(d) +
                    '</div>' +

                    '<div class="info">' +
                        '<div class="nombre">' + _escape(nombre) + '</div>' +
                        '<div class="handle">' + _escape(handle) + '</div>' +
                    '</div>' +

                    '<div class="acciones">' +

                        reintentar +

                        '<button type="button" class="btn-cancelar-envio"' +
                            ' data-solicitud-cancelar="' + _escape(s.id) + '"' +
                            ' aria-label="Cancelar solicitud enviada">' +
                            'Cancelar' +
                        '</button>' +

                    '</div>' +

                '</div>'
            );
        }).join('');

        if (errorPerfiles) {
            _aviso(
                seccion,
                'Algunos perfiles no se pudieron cargar: ' + errorPerfiles,
                _refrescarReset
            );
        }
    }

    /* ============================================================
       CONSULTAS · SUPABASE
       ============================================================ */

    async function cargarRecibidas() {
        var client = _sb();
        var session = await _session();

        if (!client || !session) {
            return {
                lista: [],
                error: null,
                errorPerfiles: null
            };
        }

        try {
            var r = await _withRetry(function () {
                return client.from(CONFIG.TABLA)
                    .select('id, usuario_id, contacto_id')
                    .eq('contacto_id', session.user.id)
                    .eq('estado', 'pendiente');
            }, 'solicitudes recibidas');

            if (r.error) throw r.error;

            var lista = (r.data || []).map(function (s) {
                return {
                    id: s.id,
                    usuario_id: s.usuario_id
                };
            });

            var ids = lista.map(function (s) {
                return s.usuario_id;
            }).filter(Boolean);

            var lote = await _cargarPerfiles(ids);

            var errorPerfiles = lote && lote.errores && lote.errores.length
                ? lote.errores[0]
                : null;

            return {
                lista: lista,
                error: null,
                errorPerfiles: errorPerfiles
            };

        } catch (err) {
            console.error('[Solicitudes] Recibidas:', _err(err));

            return {
                lista: [],
                error: _err(err),
                errorPerfiles: null
            };
        }
    }

    async function cargarEnviadas() {
        var client = _sb();
        var session = await _session();

        if (!client || !session) {
            return {
                lista: [],
                error: null,
                errorPerfiles: null
            };
        }

        try {
            var r = await _withRetry(function () {
                return client.from(CONFIG.TABLA)
                    .select('id, usuario_id, contacto_id')
                    .eq('usuario_id', session.user.id)
                    .eq('estado', 'pendiente');
            }, 'solicitudes enviadas');

            if (r.error) throw r.error;

            var lista = (r.data || []).map(function (s) {
                return {
                    id: s.id,
                    contacto_id: s.contacto_id
                };
            });

            var ids = lista.map(function (s) {
                return s.contacto_id;
            }).filter(Boolean);

            var lote = await _cargarPerfiles(ids);

            var errorPerfiles = lote && lote.errores && lote.errores.length
                ? lote.errores[0]
                : null;

            return {
                lista: lista,
                error: null,
                errorPerfiles: errorPerfiles
            };

        } catch (err) {
            console.error('[Solicitudes] Enviadas:', _err(err));

            return {
                lista: [],
                error: _err(err),
                errorPerfiles: null
            };
        }
    }

    /* ============================================================
       REFRESCO DE LISTAS
       ============================================================ */

    async function refrescarRecibidas() {
        var res = await cargarRecibidas();

        renderRecibidas(
            res.lista,
            res.error,
            res.errorPerfiles
        );

        return res;
    }

    async function refrescarEnviadas() {
        var res = await cargarEnviadas();

        renderEnviadas(
            res.lista,
            res.error,
            res.errorPerfiles
        );

        return res;
    }

    /* ============================================================
       ACCIONES · ACEPTAR SOLICITUD
       ============================================================ */

    async function aceptar(filaId) {
        var fila = Number(filaId);

        if (!Number.isInteger(fila) || fila <= 0) {
            _toast('ID de solicitud inválido.', 'error');
            return { ok: false };
        }

        var clave = _clave('aceptar', fila);

        if (_bloqueado(clave)) return { ok: false };

        var client = _sb();
        var session = await _session();

        if (!client || !session) {
            _toast('Inicia sesión para aceptar solicitudes.', 'error');
            return { ok: false };
        }

        _marcar(clave);
        _marcarBotones(fila, 'data-solicitud-aceptar', true);

        try {
            if (
                window.SocialAcciones &&
                typeof window.SocialAcciones.responderSolicitud === 'function'
            ) {
                var resSocial = await window.SocialAcciones.responderSolicitud(fila, true);

                if (!resSocial || !resSocial.ok) {
                    throw new Error('No se pudo aceptar la solicitud');
                }

            } else {
                var r = await _withRetry(function () {
                    return client.rpc(CONFIG.RPC_RESPONDER, {
                        p_fila_id: fila,
                        p_aceptar: true
                    });
                }, 'aceptar solicitud');

                if (r.error) throw r.error;

                _toast('Solicitud aceptada.', 'success');
            }

            await _refrescar({ reset: true });

            return { ok: true };

        } catch (err) {
            console.error('[Solicitudes] Aceptar:', _err(err));

            _toast('No se pudo aceptar la solicitud: ' + _err(err), 'error');

            return { ok: false };

        } finally {
            _liberar(clave);
        }
    }

    /* ============================================================
       ACCIONES · RECHAZAR SOLICITUD
       ============================================================ */

    async function rechazar(filaId) {
        var fila = Number(filaId);

        if (!Number.isInteger(fila) || fila <= 0) {
            _toast('ID de solicitud inválido.', 'error');
            return { ok: false };
        }

        var clave = _clave('rechazar', fila);

        if (_bloqueado(clave)) return { ok: false };

        var client = _sb();
        var session = await _session();

        if (!client || !session) {
            _toast('Inicia sesión para gestionar solicitudes.', 'error');
            return { ok: false };
        }

        _marcar(clave);
        _marcarBotones(fila, 'data-solicitud-rechazar', true);

        try {
            if (
                window.SocialAcciones &&
                typeof window.SocialAcciones.responderSolicitud === 'function'
            ) {
                var resSocial = await window.SocialAcciones.responderSolicitud(fila, false);

                if (!resSocial || !resSocial.ok) {
                    throw new Error('No se pudo rechazar la solicitud');
                }

            } else {
                var r = await _withRetry(function () {
                    return client.rpc(CONFIG.RPC_RESPONDER, {
                        p_fila_id: fila,
                        p_aceptar: false
                    });
                }, 'rechazar solicitud');

                if (r.error) throw r.error;

                _toast('Solicitud rechazada.', 'success');
            }

            await _refrescar({ reset: true });

            return { ok: true };

        } catch (err) {
            console.error('[Solicitudes] Rechazar:', _err(err));

            _toast('No se pudo rechazar la solicitud: ' + _err(err), 'error');

            return { ok: false };

        } finally {
            _liberar(clave);
        }
    }

    /* ============================================================
       ACCIÓN · CANCELAR SOLICITUD ENVIADA
       ============================================================ */

    async function cancelarEnviada(filaId) {
        var client = _sb();
        var session = await _session();

        if (!client || !session) {
            _toast('Inicia sesión para gestionar solicitudes.', 'error');
            return { ok: false };
        }

        if (filaId == null) return { ok: false };

        var fila = Number(filaId);

        if (!Number.isInteger(fila) || fila <= 0) {
            _toast('ID de solicitud inválido.', 'error');
            return { ok: false };
        }

        var clave = _clave('cancelar', fila);

        if (_bloqueado(clave)) return { ok: false };

        var confirmado = await _confirm({
            title: 'Cancelar solicitud',
            message: '¿Deseas retirar esta solicitud de amistad?',
            confirmText: 'Retirar solicitud',
            cancelText: 'Conservar solicitud',
            danger: true
        });

        if (!confirmado) return { ok: false };

        _marcar(clave);
        _marcarBotones(fila, 'data-solicitud-cancelar', true);

        try {
            /*
             * Se conserva el DELETE directo con filtros de seguridad.
             * La operación únicamente puede retirar solicitudes
             * pertenecientes al usuario autenticado.
             */

            var r = await client.from(CONFIG.TABLA)
                .delete()
                .eq('id', fila)
                .eq('usuario_id', session.user.id)
                .eq('estado', 'pendiente');

            if (r.error) throw r.error;

            _toast('Solicitud retirada.', 'success');

            await _refrescar({ reset: true });

            return { ok: true };

        } catch (err) {
            console.error('[Solicitudes] Cancelar enviada:', _err(err));

            _toast('No se pudo cancelar la solicitud: ' + _err(err), 'error');

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

        instalarEstilos();

        return {
            ok: true,
            version: CONFIG.VERSION,
            api: window.ContactosSolicitudes
        };
    }

    /* ============================================================
       API PÚBLICA
       ============================================================ */

    window.ContactosSolicitudes = {

        CONFIG: CONFIG,

        init: init,

        renderRecibidas: renderRecibidas,
        renderEnviadas: renderEnviadas,

        cargarRecibidas: cargarRecibidas,
        cargarEnviadas: cargarEnviadas,

        refrescarRecibidas: refrescarRecibidas,
        refrescarEnviadas: refrescarEnviadas,

        aceptar: aceptar,
        rechazar: rechazar,
        cancelarEnviada: cancelarEnviada

    };

})();