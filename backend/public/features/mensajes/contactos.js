/* ================================================================
   CSARIEL'S · CONTACTOS · v19
   Gestión de contactos · Supabase · Interfaz dinámica
   ================================================================
   - Carga de contactos y perfiles.
   - Búsqueda de usuarios.
   - Solicitudes recibidas y enviadas.
   - Aceptar y rechazar solicitudes.
   - Favoritos.
   - Bloqueo y eliminación.
   - Invitaciones.
   - Acceso a mensajes y llamadas.
   - Paginación y caché de perfiles.
   - Compatible con window.supabaseClient.
   ================================================================ */

(function () {
    'use strict';

    var VERSION = '19.0.0';

    var CONFIG = {
        TABLA_CONTACTOS: 'contactos',
        TABLA_PERFILES: 'perfiles_publicos',
        TABLA_BLOQUEOS: 'bloqueos',
        RPC_BLOQUEAR: 'bloquear_contacto',
        RPC_INVITACION: 'obtener_o_crear_invitacion',
        RPC_RESPONDER: 'responder_solicitud_amistad',
        RPC_ELIMINAR: 'eliminar_amistad',
        LIMITE_PAGINA: 30,
        CACHE_MAXIMO: 500,
        CACHE_TIEMPO: 300000,
        TIMEOUT_SESION: 10000
    };

    var estado = {
        usuario: null,
        contactos: [],
        solicitudes: [],
        sugerencias: [],
        bloqueados: [],
        perfiles: {},
        pagina: 0,
        cargando: false,
        cargandoMas: false,
        filtro: 'todos',
        busqueda: '',
        inicializado: false,
        idsContactos: {},
        idsBloqueados: {},
        finContactos: false
    };

    var temporizadorBusqueda = null;

    /* ============================================================
       UTILIDADES
    ============================================================ */

    function sb() {
        return window.supabaseClient || window.sbVideos || null;
    }

    function elemento(id) {
        return document.getElementById(id);
    }

    function escapar(valor) {
        return String(valor == null ? '' : valor)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function valorPerfil(perfil, nombres, defecto) {
        var i;

        if (!perfil) return defecto || '';

        for (i = 0; i < nombres.length; i++) {
            if (perfil[nombres[i]] != null && perfil[nombres[i]] !== '') {
                return perfil[nombres[i]];
            }
        }

        return defecto || '';
    }

    function obtenerIdContacto(fila) {
        if (!fila) return null;

        if (fila.usuario_id === estado.usuario.id) {
            return fila.contacto_id;
        }

        if (fila.contacto_id === estado.usuario.id) {
            return fila.usuario_id;
        }

        return null;
    }

    function mostrarToast(mensaje, tipo) {
        var toast = document.getElementById('contactosToast');

        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'contactosToast';
            toast.style.cssText =
                'position:fixed;bottom:25px;left:50%;' +
                'transform:translateX(-50%);z-index:999999;' +
                'padding:13px 20px;border-radius:14px;' +
                'background:#17251f;color:white;' +
                'border:1px solid #D4AF37;' +
                'box-shadow:0 8px 30px rgba(0,0,0,.35);' +
                'font-size:14px;max-width:90%;text-align:center;' +
                'transition:opacity .2s;';
            document.body.appendChild(toast);
        }

        toast.textContent = mensaje;
        toast.style.opacity = '1';
        toast.style.display = 'block';

        if (tipo === 'error') {
            toast.style.borderColor = '#ff6464';
        } else if (tipo === 'success') {
            toast.style.borderColor = '#35d69a';
        } else {
            toast.style.borderColor = '#D4AF37';
        }

        clearTimeout(toast._timer);

        toast._timer = setTimeout(function () {
            toast.style.opacity = '0';

            setTimeout(function () {
                toast.style.display = 'none';
            }, 250);
        }, 3000);
    }

    function mostrarError(error, contexto) {
        console.error('[Csariel Contactos] ' + contexto, error);

        mostrarToast(
            error && error.message
                ? error.message
                : 'No se pudo completar la operación.',
            'error'
        );
    }

    function obtenerAvatar(perfil) {
        var url = valorPerfil(
            perfil,
            ['avatar_url', 'foto_url', 'imagen_url', 'avatar', 'foto'],
            ''
        );

        if (!url) return '';

        if (/^https:\/\/|^http:\/\//i.test(url)) {
            return escapar(url);
        }

        return '';
    }

    function iniciales(nombre) {
        var partes = String(nombre || 'U').trim().split(/\s+/);

        if (partes.length > 1) {
            return escapar(
                (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase()
            );
        }

        return escapar(partes[0].substring(0, 2).toUpperCase());
    }

    function obtenerNombre(perfil) {
        return valorPerfil(
            perfil,
            ['nombre_completo', 'nombre', 'display_name', 'username', 'usuario'],
            'Usuario'
        );
    }

    function obtenerUsuario(perfil) {
        return valorPerfil(
            perfil,
            ['username', 'usuario', 'handle'],
            ''
        );
    }

    function obtenerPerfil(id) {
        return estado.perfiles[String(id)] || null;
    }

    function limpiarCache() {
        var claves = Object.keys(estado.perfiles);

        if (claves.length > CONFIG.CACHE_MAXIMO) {
            estado.perfiles = {};
        }
    }

    /* ============================================================
       SESIÓN
    ============================================================ */

    async function obtenerSesion() {
        var cliente = sb();

        if (!cliente || !cliente.auth) {
            throw new Error('No se encontró la conexión con Supabase.');
        }

        var resultado = await Promise.race([
            cliente.auth.getSession(),
            new Promise(function (_, rechazar) {
                setTimeout(function () {
                    rechazar(new Error('Tiempo de espera de autenticación agotado.'));
                }, CONFIG.TIMEOUT_SESION);
            })
        ]);

        if (resultado.error) throw resultado.error;

        var sesion = resultado.data && resultado.data.session;

        if (!sesion || !sesion.user) {
            throw new Error('Debes iniciar sesión para ver tus contactos.');
        }

        estado.usuario = sesion.user;

        return sesion.user;
    }

    /* ============================================================
       PERFILES
    ============================================================ */

    async function cargarPerfiles(ids) {
        var cliente = sb();
        var faltantes = [];
        var unicos = {};
        var i;

        for (i = 0; i < ids.length; i++) {
            var id = ids[i];

            if (!id || id === estado.usuario.id) continue;

            if (!unicos[id]) {
                unicos[id] = true;

                if (!estado.perfiles[String(id)]) {
                    faltantes.push(id);
                }
            }
        }

        if (!faltantes.length) return;

        for (var inicio = 0; inicio < faltantes.length; inicio += 100) {
            var lote = faltantes.slice(inicio, inicio + 100);

            var resultado = await cliente
                .from(CONFIG.TABLA_PERFILES)
                .select('*')
                .in('id', lote);

            if (resultado.error) {
                console.warn('[Csariel Contactos] Error cargando perfiles:', resultado.error);
                continue;
            }

            var filas = resultado.data || [];

            filas.forEach(function (perfil) {
                estado.perfiles[String(perfil.id)] = perfil;
            });
        }

        limpiarCache();
    }

    /* ============================================================
       CONTADORES
    ============================================================ */

    function actualizarContadores() {
        var total = elemento('totalContactos');
        var online = elemento('onlineContactos');

        var activos = estado.contactos.filter(function (fila) {
            return fila.estado === 'activo';
        });

        if (total) total.textContent = String(activos.length);

        if (online) {
            online.textContent = String(
                activos.filter(function (fila) {
                    var perfil = obtenerPerfil(obtenerIdContacto(fila));

                    return perfil && (
                        perfil.en_linea === true ||
                        perfil.online === true ||
                        perfil.estado_online === 'online'
                    );
                }).length
            );
        }
    }

    /* ============================================================
       CARGAR CONTACTOS
    ============================================================ */

    async function cargarContactos(reiniciar) {
        var cliente = sb();

        if (estado.cargandoMas || estado.cargando) return;

        if (reiniciar) {
            estado.pagina = 0;
            estado.contactos = [];
            estado.idsContactos = {};
            estado.finContactos = false;
        }

        if (estado.finContactos) return;

        estado.cargandoMas = true;

        try {
            var desde = estado.pagina * CONFIG.LIMITE_PAGINA;
            var hasta = desde + CONFIG.LIMITE_PAGINA - 1;

            var resultado = await cliente
                .from(CONFIG.TABLA_CONTACTOS)
                .select('*')
                .eq('usuario_id', estado.usuario.id)
                .order('created_at', { ascending: false })
                .range(desde, hasta);

            if (resultado.error) throw resultado.error;

            var filas = resultado.data || [];

            if (filas.length < CONFIG.LIMITE_PAGINA) {
                estado.finContactos = true;
            }

            var ids = [];

            filas.forEach(function (fila) {
                var id = obtenerIdContacto(fila);

                if (id) {
                    ids.push(id);
                    estado.idsContactos[String(id)] = true;
                }
            });

            await cargarPerfiles(ids);

            estado.contactos = estado.contactos.concat(filas);
            estado.pagina++;

            actualizarContadores();
            renderizarContactos();

        } catch (error) {
            mostrarError(error, 'cargarContactos');
        } finally {
            estado.cargandoMas = false;
            estado.cargando = false;
        }
    }

    /* ============================================================
       TARJETA DE CONTACTO
    ============================================================ */

    function crearTarjetaContacto(fila) {
        var id = obtenerIdContacto(fila);
        var perfil = obtenerPerfil(id);

        if (!id || !perfil) return '';

        var nombre = obtenerNombre(perfil);
        var usuario = obtenerUsuario(perfil);
        var avatar = obtenerAvatar(perfil);

        var online = perfil.en_linea === true ||
            perfil.online === true ||
            perfil.estado_online === 'online';

        var favorito = fila.favorito === true;

        var imagen = avatar
            ? '<img src="' + avatar + '" alt="' + escapar(nombre) +
              '" loading="lazy" onerror="this.style.display=\'none\'">'
            : '<span>' + iniciales(nombre) + '</span>';

        return (
            '<article class="cs-contact-card" data-contacto-id="' + escapar(id) + '">' +

                '<div class="cs-contact-avatar ' + (online ? 'is-online' : '') + '">' +
                    imagen +
                    '<span class="cs-online-indicator"></span>' +
                '</div>' +

                '<div class="cs-contact-info">' +
                    '<strong>' + escapar(nombre) + '</strong>' +
                    '<span class="cs-contact-status">' +
                        (online ? 'En línea' : 'Desconectado') +
                    '</span>' +
                    (usuario
                        ? '<small>@' + escapar(usuario) + '</small>'
                        : '') +
                '</div>' +

                '<div class="cs-contact-actions">' +
                    '<button type="button" data-accion="mensaje" data-id="' +
                        escapar(id) + '" aria-label="Enviar mensaje">Mensaje</button>' +

                    '<button type="button" data-accion="llamar" data-id="' +
                        escapar(id) + '" aria-label="Llamar">Llamar</button>' +

                    '<button type="button" data-accion="favorito" data-id="' +
                        escapar(id) + '" aria-label="Favorito" aria-pressed="' +
                        String(favorito) + '">' +
                        (favorito ? '★' : '☆') +
                    '</button>' +

                    '<button type="button" data-accion="bloquear" data-id="' +
                        escapar(id) + '" aria-label="Bloquear">Bloquear</button>' +

                    '<button type="button" data-accion="eliminar" data-id="' +
                        escapar(id) + '" aria-label="Eliminar">Eliminar</button>' +
                '</div>' +

            '</article>'
        );
    }

    /* ============================================================
       RENDERIZAR CONTACTOS
    ============================================================ */

    function renderizarContactos() {
        var contenedor = elemento('contactosList');

        if (!contenedor) return;

        var lista = estado.contactos.filter(function (fila) {
            var id = obtenerIdContacto(fila);
            var perfil = obtenerPerfil(id);

            if (!perfil || fila.estado !== 'activo') return false;

            if (estado.filtro === 'favoritos' && fila.favorito !== true) {
                return false;
            }

            if (estado.filtro === 'online') {
                var online = perfil.en_linea === true ||
                    perfil.online === true ||
                    perfil.estado_online === 'online';

                if (!online) return false;
            }

            if (estado.busqueda) {
                var texto = (
                    obtenerNombre(perfil) + ' ' +
                    obtenerUsuario(perfil)
                ).toLowerCase();

                if (texto.indexOf(estado.busqueda.toLowerCase()) === -1) {
                    return false;
                }
            }

            return true;
        });

        if (!lista.length) {
            contenedor.innerHTML =
                '<div class="cs-contact-empty">' +
                    '<div style="font-size:36px">👥</div>' +
                    '<strong>No hay contactos para mostrar</strong>' +
                    '<p>Busca personas y agrégalas a tu red.</p>' +
                '</div>';

            return;
        }

        contenedor.innerHTML = lista.map(crearTarjetaContacto).join('');
    }

    /* ============================================================
       SOLICITUDES RECIBIDAS
    ============================================================ */

    async function cargarSolicitudesPendientesUI() {
        var cliente = sb();

        try {
            var resultado = await cliente
                .from(CONFIG.TABLA_CONTACTOS)
                .select('*')
                .eq('contacto_id', estado.usuario.id)
                .eq('estado', 'pendiente');

            if (resultado.error) throw resultado.error;

            estado.solicitudes = resultado.data || [];

            var ids = estado.solicitudes.map(function (fila) {
                return fila.usuario_id;
            });

            await cargarPerfiles(ids);

            renderizarSolicitudes();

        } catch (error) {
            mostrarError(error, 'cargarSolicitudes');
        }
    }

    function renderizarSolicitudes() {
        var contenedor = elemento('solicitudesPendientesLista');
        var seccion = elemento('solicitudesPendientesSection');
        var contador = elemento('solicitudesContador');

        if (contador) {
            contador.textContent = String(estado.solicitudes.length);
        }

        if (seccion) {
            seccion.style.display = estado.solicitudes.length ? '' : 'none';
        }

        if (!contenedor) return;

        if (!estado.solicitudes.length) {
            contenedor.innerHTML = '';
            return;
        }

        contenedor.innerHTML = estado.solicitudes.map(function (fila) {
            var perfil = obtenerPerfil(fila.usuario_id);

            if (!perfil) return '';

            var nombre = obtenerNombre(perfil);
            var avatar = obtenerAvatar(perfil);

            return (
                '<div class="cs-request-card">' +
                    '<div class="cs-request-avatar">' +
                        (avatar
                            ? '<img src="' + avatar + '" alt="' + escapar(nombre) + '" loading="lazy">'
                            : iniciales(nombre)) +
                    '</div>' +
                    '<div class="cs-request-info">' +
                        '<strong>' + escapar(nombre) + '</strong>' +
                        '<small>Quiere conectar contigo</small>' +
                    '</div>' +
                    '<div class="cs-request-actions">' +
                        '<button type="button" data-accion="aceptar" data-id="' +
                            escapar(fila.id) + '">Aceptar</button>' +
                        '<button type="button" data-accion="rechazar" data-id="' +
                            escapar(fila.id) + '">Rechazar</button>' +
                    '</div>' +
                '</div>'
            );
        }).join('');
    }

    /* ============================================================
       SUGERENCIAS
    ============================================================ */

    async function cargarSugerenciasUI() {
        var cliente = sb();

        try {
            var resultado = await cliente
                .from(CONFIG.TABLA_PERFILES)
                .select('*')
                .neq('id', estado.usuario.id)
                .limit(12);

            if (resultado.error) throw resultado.error;

            var sugerencias = resultado.data || [];

            estado.sugerencias = sugerencias.filter(function (perfil) {
                var id = String(perfil.id);

                return !estado.idsContactos[id] &&
                    !estado.idsBloqueados[id];
            });

            renderizarSugerencias();

        } catch (error) {
            console.warn('[Csariel Contactos] No se pudieron cargar sugerencias:', error);
        }
    }

    function renderizarSugerencias() {
        var contenedor = elemento('sugerenciasLista');
        var seccion = elemento('sugerenciasSection');

        if (!contenedor) return;

        if (seccion) {
            seccion.style.display = estado.sugerencias.length ? '' : 'none';
        }

        contenedor.innerHTML = estado.sugerencias.map(function (perfil) {
            var nombre = obtenerNombre(perfil);
            var avatar = obtenerAvatar(perfil);

            return (
                '<div class="cs-suggestion-card">' +
                    '<div class="cs-suggestion-avatar">' +
                        (avatar
                            ? '<img src="' + avatar + '" alt="' + escapar(nombre) + '" loading="lazy">'
                            : iniciales(nombre)) +
                    '</div>' +
                    '<strong>' + escapar(nombre) + '</strong>' +
                    '<button type="button" data-accion="agregar" data-id="' +
                        escapar(perfil.id) + '">Agregar</button>' +
                '</div>'
            );
        }).join('');
    }

    /* ============================================================
       BÚSQUEDA DE USUARIOS
    ============================================================ */

    async function buscarContactos(termino) {
        var cliente = sb();
        var contenedor = elemento('resultadosBusqueda');

        if (!contenedor) return;

        termino = String(termino || '').trim();

        if (termino.length < 2) {
            contenedor.innerHTML =
                '<p>Escribe al menos 2 caracteres para buscar.</p>';
            return;
        }

        contenedor.innerHTML = '<p>Buscando usuarios...</p>';

        try {
            var limpio = termino.replace(/[%_]/g, '');

            var resultados = await cliente
                .from(CONFIG.TABLA_PERFILES)
                .select('*')
                .or(
                    'nombre_completo.ilike.%' + limpio +
                    '%,username.ilike.%' + limpio + '%'
                )
                .neq('id', estado.usuario.id)
                .limit(20);

            if (resultados.error) throw resultados.error;

            var perfiles = resultados.data || [];

            perfiles = perfiles.filter(function (perfil) {
                return !estado.idsContactos[String(perfil.id)] &&
                    !estado.idsBloqueados[String(perfil.id)];
            });

            if (!perfiles.length) {
                contenedor.innerHTML = '<p>No encontramos usuarios disponibles.</p>';
                return;
            }

            contenedor.innerHTML = perfiles.map(function (perfil) {
                var nombre = obtenerNombre(perfil);
                var avatar = obtenerAvatar(perfil);

                return (
                    '<div class="cs-search-result">' +
                        '<div class="cs-search-avatar">' +
                            (avatar
                                ? '<img src="' + avatar + '" alt="' + escapar(nombre) + '" loading="lazy">'
                                : iniciales(nombre)) +
                        '</div>' +
                        '<div class="cs-search-info">' +
                            '<strong>' + escapar(nombre) + '</strong>' +
                            '<small>@' + escapar(obtenerUsuario(perfil)) + '</small>' +
                        '</div>' +
                        '<button type="button" data-accion="agregar" data-id="' +
                            escapar(perfil.id) + '">Agregar</button>' +
                    '</div>'
                );
            }).join('');

        } catch (error) {
            mostrarError(error, 'buscarContactos');
            contenedor.innerHTML = '<p>No fue posible completar la búsqueda.</p>';
        }
    }

    /* ============================================================
       AGREGAR CONTACTO
    ============================================================ */

    async function agregarContacto(id) {
        var cliente = sb();

        if (!id || id === estado.usuario.id) {
            mostrarToast('No puedes agregarte a ti mismo.', 'error');
            return;
        }

        if (estado.idsContactos[String(id)]) {
            mostrarToast('Este usuario ya aparece en tus contactos.', 'error');
            return;
        }

        try {
            var resultado = await cliente
                .from(CONFIG.TABLA_CONTACTOS)
                .insert({
                    usuario_id: estado.usuario.id,
                    contacto_id: id,
                    estado: 'pendiente'
                });

            if (resultado.error) throw resultado.error;

            mostrarToast('Solicitud enviada correctamente.', 'success');

            delete estado.idsContactos[String(id)];

            var busqueda = elemento('searchInputModal');

            if (busqueda && busqueda.value) {
                buscarContactos(busqueda.value);
            }

            await cargarContactos(true);
            await cargarSugerenciasUI();

        } catch (error) {
            mostrarError(error, 'agregarContacto');
        }
    }

    /* ============================================================
       ACEPTAR / RECHAZAR SOLICITUD
    ============================================================ */

    async function responderSolicitud(id, aceptar) {
        var cliente = sb();

        try {
            var resultado = await cliente.rpc(CONFIG.RPC_RESPONDER, {
                p_solicitud_id: id,
                p_aceptar: aceptar
            });

            if (resultado.error) throw resultado.error;

            mostrarToast(
                aceptar ? 'Solicitud aceptada.' : 'Solicitud rechazada.',
                'success'
            );

            await cargarSolicitudesPendientesUI();
            await cargarContactos(true);

        } catch (error) {
            mostrarError(error, 'responderSolicitud');
        }
    }

    /* ============================================================
       CANCELAR SOLICITUD ENVIADA
    ============================================================ */

    async function cancelarSolicitud(id) {
        var cliente = sb();

        try {
            var resultado = await cliente
                .from(CONFIG.TABLA_CONTACTOS)
                .delete()
                .eq('id', id)
                .eq('usuario_id', estado.usuario.id)
                .eq('estado', 'pendiente');

            if (resultado.error) throw resultado.error;

            mostrarToast('Solicitud cancelada.', 'success');

            await cargarContactos(true);

        } catch (error) {
            mostrarError(error, 'cancelarSolicitud');
        }
    }

    /* ============================================================
       FAVORITOS
    ============================================================ */

    async function alternarFavorito(id) {
        var cliente = sb();

        var fila = estado.contactos.find(function (contacto) {
            return obtenerIdContacto(contacto) === id &&
                contacto.estado === 'activo';
        });

        if (!fila) {
            mostrarToast('No se encontró el contacto.', 'error');
            return;
        }

        try {
            var nuevoEstado = fila.favorito !== true;

            var resultado = await cliente
                .from(CONFIG.TABLA_CONTACTOS)
                .update({ favorito: nuevoEstado })
                .eq('id', fila.id)
                .eq('usuario_id', estado.usuario.id);

            if (resultado.error) throw resultado.error;

            fila.favorito = nuevoEstado;

            renderizarContactos();

            mostrarToast(
                nuevoEstado ? 'Agregado a favoritos.' : 'Eliminado de favoritos.',
                'success'
            );

        } catch (error) {
            mostrarError(error, 'alternarFavorito');
        }
    }

    /* ============================================================
       ELIMINAR CONTACTO
    ============================================================ */

    async function eliminarContacto(id) {
        var cliente = sb();

        if (!window.confirm('¿Deseas eliminar este contacto?')) return;

        try {
            var resultado = await cliente.rpc(CONFIG.RPC_ELIMINAR, {
                p_contacto_id: id
            });

            if (resultado.error) throw resultado.error;

            mostrarToast('Contacto eliminado.', 'success');

            await cargarContactos(true);
            await cargarSugerenciasUI();

        } catch (error) {
            mostrarError(error, 'eliminarContacto');
        }
    }

    /* ============================================================
       BLOQUEAR CONTACTO
    ============================================================ */

    async function bloquearContacto(id) {
        var cliente = sb();

        if (!window.confirm('¿Deseas bloquear a este usuario?')) return;

        try {
            var resultado = await cliente.rpc(CONFIG.RPC_BLOQUEAR, {
                p_contacto_id: id
            });

            if (resultado.error) throw resultado.error;

            estado.idsBloqueados[String(id)] = true;

            mostrarToast('Usuario bloqueado.', 'success');

            await cargarContactos(true);
            await cargarSugerenciasUI();

        } catch (error) {
            mostrarError(error, 'bloquearContacto');
        }
    }

    /* ============================================================
       CARGAR BLOQUEADOS
    ============================================================ */

    async function cargarBloqueados() {
        var cliente = sb();

        try {
            var resultado = await cliente
                .from(CONFIG.TABLA_BLOQUEOS)
                .select('*')
                .eq('usuario_id', estado.usuario.id);

            if (resultado.error) throw resultado.error;

            estado.bloqueados = resultado.data || [];
            estado.idsBloqueados = {};

            estado.bloqueados.forEach(function (fila) {
                estado.idsBloqueados[String(fila.bloqueado_id)] = true;
            });

        } catch (error) {
            console.warn('[Csariel Contactos] No se pudieron cargar bloqueados:', error);
        }
    }

    /* ============================================================
       MENSAJES Y LLAMADAS
    ============================================================ */

    function abrirMensaje(id) {
        if (!id) return;

        window.location.href =
            '/features/mensajes/mensajes.html?usuario=' +
            encodeURIComponent(id);
    }

    function llamarContacto(id) {
        if (!id) return;

        window.location.href =
            '/features/mensajes/mensajes.html?usuario=' +
            encodeURIComponent(id) +
            '&accion=llamada';
    }

    /* ============================================================
       INVITACIONES
    ============================================================ */

    async function invitarContacto() {
        var cliente = sb();

        try {
            var resultado = await cliente.rpc(CONFIG.RPC_INVITACION);

            if (resultado.error) throw resultado.error;

            var datos = resultado.data;
            var codigo = '';

            if (typeof datos === 'string') {
                codigo = datos;
            } else if (datos) {
                codigo = datos.codigo ||
                    datos.codigo_invitacion ||
                    datos.invitacion ||
                    '';
            }

            if (!codigo) {
                throw new Error('El servidor no devolvió un código de invitación.');
            }

            var campo = elemento('codigoInvitacion');

            if (campo) {
                campo.value = codigo;
                campo.textContent = codigo;
            }

            mostrarToast('Código de invitación generado.', 'success');

            var modal = elemento('modalInvitacion');

            if (modal) modal.style.display = 'flex';

        } catch (error) {
            mostrarError(error, 'invitarContacto');
        }
    }

    async function copiarCodigoInvitacion() {
        var campo = elemento('codigoInvitacion');

        if (!campo) return;

        var codigo = campo.value || campo.textContent;

        if (!codigo) {
            mostrarToast('No hay código para copiar.', 'error');
            return;
        }

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(codigo);
            } else {
                var auxiliar = document.createElement('textarea');
                auxiliar.value = codigo;
                document.body.appendChild(auxiliar);
                auxiliar.select();

                var copiado = document.execCommand('copy');

                document.body.removeChild(auxiliar);

                if (!copiado) throw new Error('No se pudo copiar el código.');
            }

            mostrarToast('Código copiado.', 'success');

        } catch (error) {
            mostrarError(error, 'copiarCodigoInvitacion');
        }
    }

    /* ============================================================
       MODALES
    ============================================================ */

    function abrirAgregarContacto() {
        var modal = elemento('modalBuscarContacto');

        if (modal) {
            modal.style.display = 'flex';

            var campo = elemento('searchInputModal');

            if (campo) {
                campo.value = '';
                campo.focus();
            }

            var resultados = elemento('resultadosBusqueda');

            if (resultados) {
                resultados.innerHTML = '<p>Busca personas para agregarlas a tu red.</p>';
            }
        }
    }

    function cerrarModalBuscar() {
        var modal = elemento('modalBuscarContacto');

        if (modal) modal.style.display = 'none';
    }

    function cerrarModalInvitacion() {
        var modal = elemento('modalInvitacion');

        if (modal) modal.style.display = 'none';
    }

    /* ============================================================
       FILTROS
    ============================================================ */

    function establecerFiltro(filtro) {
        estado.filtro = filtro || 'todos';

        var botones = document.querySelectorAll('[data-filtro-contactos]');

        botones.forEach(function (boton) {
            boton.classList.toggle(
                'active',
                boton.getAttribute('data-filtro-contactos') === estado.filtro
            );
        });

        renderizarContactos();
    }

    /* ============================================================
       EVENTOS DE INTERFAZ
    ============================================================ */

    function configurarEventos() {
        var lista = elemento('contactosList');

        if (lista) {
            lista.addEventListener('click', function (evento) {
                var boton = evento.target.closest('[data-accion]');

                if (!boton) return;

                var accion = boton.getAttribute('data-accion');
                var id = boton.getAttribute('data-id');

                if (!id) return;

                if (accion === 'mensaje') abrirMensaje(id);
                if (accion === 'llamar') llamarContacto(id);
                if (accion === 'favorito') alternarFavorito(id);
                if (accion === 'bloquear') bloquearContacto(id);
                if (accion === 'eliminar') eliminarContacto(id);
            });
        }

        document.addEventListener('click', function (evento) {
            var boton = evento.target.closest('[data-accion]');

            if (!boton) return;

            var accion = boton.getAttribute('data-accion');
            var id = boton.getAttribute('data-id');

            if (!id) return;

            if (accion === 'aceptar') {
                responderSolicitud(id, true);
            }

            if (accion === 'rechazar') {
                responderSolicitud(id, false);
            }

            if (accion === 'agregar') {
                agregarContacto(id);
            }

            if (accion === 'cancelar-solicitud') {
                cancelarSolicitud(id);
            }
        });

        var busqueda = elemento('searchInput');

        if (busqueda) {
            busqueda.addEventListener('input', function () {
                estado.busqueda = busqueda.value.trim();
                renderizarContactos();
            });
        }

        var busquedaModal = elemento('searchInputModal');

        if (busquedaModal) {
            busquedaModal.addEventListener('input', function () {
                clearTimeout(temporizadorBusqueda);

                var termino = busquedaModal.value;

                temporizadorBusqueda = setTimeout(function () {
                    buscarContactos(termino);
                }, 350);
            });
        }

        var filtros = document.querySelectorAll('[data-filtro-contactos]');

        filtros.forEach(function (boton) {
            boton.addEventListener('click', function () {
                establecerFiltro(
                    boton.getAttribute('data-filtro-contactos')
                );
            });
        });

        var modalBuscar = elemento('modalBuscarContacto');

        if (modalBuscar) {
            modalBuscar.addEventListener('click', function (evento) {
                if (evento.target === modalBuscar) {
                    cerrarModalBuscar();
                }
            });
        }

        var modalInvitacion = elemento('modalInvitacion');

        if (modalInvitacion) {
            modalInvitacion.addEventListener('click', function (evento) {
                if (evento.target === modalInvitacion) {
                    cerrarModalInvitacion();
                }
            });
        }

        var listaSolicitudes = elemento('solicitudesPendientesLista');

        if (listaSolicitudes) {
            listaSolicitudes.addEventListener('click', function (evento) {
                var boton = evento.target.closest('[data-accion]');

                if (!boton) return;

                var accion = boton.getAttribute('data-accion');
                var id = boton.getAttribute('data-id');

                if (accion === 'aceptar') responderSolicitud(id, true);
                if (accion === 'rechazar') responderSolicitud(id, false);
            });
        }

        var listaSugerencias = elemento('sugerenciasLista');

        if (listaSugerencias) {
            listaSugerencias.addEventListener('click', function (evento) {
                var boton = evento.target.closest('[data-accion="agregar"]');

                if (boton) {
                    agregarContacto(boton.getAttribute('data-id'));
                }
            });
        }

        window.addEventListener('scroll', function () {
            if (estado.cargandoMas || estado.finContactos) return;

            var posicion = window.innerHeight + window.scrollY;
            var limite = document.documentElement.scrollHeight - 450;

            if (posicion >= limite) {
                cargarContactos(false);
            }
        }, { passive: true });
    }

    /* ============================================================
       INICIALIZACIÓN
    ============================================================ */

    async function inicializarContactos() {
        if (estado.inicializado) return;

        estado.inicializado = true;

        try {
            await obtenerSesion();

            configurarEventos();

            await cargarBloqueados();

            await cargarContactos(true);

            await Promise.all([
                cargarSolicitudesPendientesUI(),
                cargarSugerenciasUI()
            ]);

            console.log(
                '[Csariel Contactos] Módulo v' + VERSION + ' inicializado.'
            );

        } catch (error) {
            estado.inicializado = false;
            mostrarError(error, 'inicializarContactos');
        }
    }

    /* ============================================================
       FUNCIONES PÚBLICAS
    ============================================================ */

    window.abrirAgregarContacto = abrirAgregarContacto;
    window.cerrarModalBuscar = cerrarModalBuscar;
    window.invitarContacto = invitarContacto;
    window.cerrarModalInvitacion = cerrarModalInvitacion;
    window.copiarCodigoInvitacion = copiarCodigoInvitacion;

    window.cargarContactos = cargarContactos;
    window.buscarContactos = buscarContactos;
    window.agregarContacto = agregarContacto;
    window.establecerFiltroContactos = establecerFiltro;

    window.CsarielContactos = {
        version: VERSION,
        inicializar: inicializarContactos,
        actualizar: function () {
            return Promise.all([
                cargarContactos(true),
                cargarSolicitudesPendientesUI(),
                cargarSugerenciasUI()
            ]);
        },
        abrirMensaje: abrirMensaje,
        llamar: llamarContacto,
        bloquear: bloquearContacto,
        eliminar: eliminarContacto,
        favorito: alternarFavorito
    };

    /* ============================================================
       ARRANQUE SEGURO
    ============================================================ */

    function esperarSupabase(intentos) {
        if (sb()) {
            inicializarContactos();
            return;
        }

        if (intentos <= 0) {
            console.error(
                '[Csariel Contactos] No se encontró window.supabaseClient.'
            );

            mostrarToast(
                'No se pudo conectar con el servicio de contactos.',
                'error'
            );

            return;
        }

        setTimeout(function () {
            esperarSupabase(intentos - 1);
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            esperarSupabase(100);
        });
    } else {
        esperarSupabase(100);
    }

})();