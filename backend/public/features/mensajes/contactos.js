/* ================================================================
   CONTACTOS - SARIEL'S ECOSYSTEM
   VERSIÓN ACTUALIZADA CONTRA SUPABASE REAL
   Proyecto: zultnlogdoajehbswlih

   TABLAS UTILIZADAS:
   - public.contactos
   - public.usuarios
   - public.bloqueos
   - public.invitaciones

   NO MODIFICA:
   - Videos
   - Live
   - Grupos
   - Transmisiones
   - Mensajes
   ================================================================ */

'use strict';

/* ================================================================
   SUPABASE
   ================================================================ */

function sb() {
    return window.supabaseClient || window.supabase || null;
}

/* ================================================================
   ESCAPE HTML
   ================================================================ */

function escapeHTML(texto) {
    if (texto === null || texto === undefined) return '';

    const div = document.createElement('div');
    div.textContent = String(texto);

    return div.innerHTML;
}

/* ================================================================
   ESCAPE ATRIBUTOS
   ================================================================ */

function escapeAttr(texto) {
    return escapeHTML(texto)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ================================================================
   TOAST
   ================================================================ */

function showToast(msg, type = '') {
    try {
        let toast = document.getElementById('toast');

        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }

        toast.textContent = msg;

        toast.className = 'toast show';

        if (type === 'error') {
            toast.classList.add('error');
        } else if (type === 'warning') {
            toast.classList.add('warning');
        } else if (type === 'success') {
            toast.classList.add('success');
        }

        clearTimeout(toast._timeout);

        toast._timeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);

    } catch (error) {
        console.warn('Error mostrando toast:', error);
    }
}

/* ================================================================
   SESIÓN
   ================================================================ */

async function getSession() {
    try {
        const client = sb();

        if (!client || !client.auth) {
            return null;
        }

        const {
            data: { session },
            error
        } = await client.auth.getSession();

        if (error) {
            console.error('Error obteniendo sesión:', error);
            return null;
        }

        return session || null;

    } catch (error) {
        console.error('Error obteniendo sesión:', error);
        return null;
    }
}

/* ================================================================
   VARIABLES GLOBALES
   ================================================================ */

let contactos = [];
let contactosFiltrados = [];

let filtroActual = 'todos';

let usuarioActual = null;

let canalContactos = null;
let canalUsuarios = null;

/* ================================================================
   AUTENTICACIÓN
   ================================================================ */

async function verificarAutenticacion() {

    const session = await getSession();

    if (!session) {

        usuarioActual = null;

        showToast(
            '⚠️ Inicia sesión para ver tus contactos',
            'warning'
        );

        return false;
    }

    usuarioActual = session.user;

    return true;
}

/* ================================================================
   ACTUALIZAR ESTADO ONLINE
   TABLA REAL: public.usuarios

   COLUMNAS:
   - online
   - ultima_conexion
   - offline_desde
   ================================================================ */

async function actualizarOnline(online) {

    try {

        const session = await getSession();

        if (!session) return;

        const client = sb();

        if (!client) return;

        const ahora = new Date().toISOString();

        const datos = {
            online: Boolean(online),
            ultima_conexion: ahora
        };

        if (!online) {
            datos.offline_desde = ahora;
        } else {
            datos.offline_desde = null;
        }

        const { error } = await client
            .from('usuarios')
            .update(datos)
            .eq('id', session.user.id);

        if (error) {
            console.error(
                'Error actualizando estado online:',
                error
            );
            return;
        }

        if (usuarioActual) {
            usuarioActual.online = Boolean(online);
        }

    } catch (error) {

        console.error(
            'Error actualizando estado online:',
            error
        );
    }
}

/* ================================================================
   CARGAR CONTACTOS
   TABLA: public.contactos

   ESTRUCTURA REAL:

   id
   usuario_id
   contacto_id
   es_favorito
   estado
   fecha
   created_at

   IMPORTANTE:
   contactos tiene DOS FK hacia usuarios.

   Por eso se utiliza explícitamente:

   usuarios!contactos_contacto_id_fkey
   ================================================================ */

async function cargarContactos() {

    try {

        if (!await verificarAutenticacion()) {
            mostrarSinContactos();
            return;
        }

        const client = sb();

        if (!client) {
            mostrarSinContactos();
            return;
        }

        const { data, error } = await client
            .from('contactos')
            .select(`
                id,
                usuario_id,
                contacto_id,
                es_favorito,
                estado,
                fecha,
                created_at,
                contacto:usuarios!contactos_contacto_id_fkey (
                    id,
                    nombre,
                    handle,
                    avatar_url,
                    online,
                    ultima_conexion,
                    offline_desde,
                    verificado
                )
            `)
            .eq('usuario_id', usuarioActual.id)
            .eq('estado', 'activo')
            .order('created_at', {
                ascending: false
            });

        if (error) {
            console.error(
                'Error Supabase cargando contactos:',
                error
            );

            mostrarSinContactos();
            return;
        }

        contactos = (data || [])
            .map(registro => {

                const usuario = registro.contacto || {};

                return {
                    id: registro.id,

                    _id: registro.contacto_id,

                    usuario_id: registro.usuario_id,

                    nombre: usuario.nombre || 'Usuario',

                    handle: usuario.handle || '',

                    avatar_url: usuario.avatar_url || null,

                    online: usuario.online === true,

                    ultima_conexion:
                        usuario.ultima_conexion || null,

                    offline_desde:
                        usuario.offline_desde || null,

                    esFavorito:
                        registro.es_favorito === true,

                    verificado:
                        usuario.verificado === true,

                    estado_relacion:
                        registro.estado || 'activo',

                    fecha:
                        registro.fecha || null,

                    created_at:
                        registro.created_at || null
                };
            });

        actualizarContadores();

        aplicarFiltros();

        iniciarEscuchaContactos();

    } catch (error) {

        console.error(
            'Error cargando contactos:',
            error
        );

        contactos = [];

        actualizarContadores();

        mostrarSinContactos();
    }
}

/* ================================================================
   ESTADO VACÍO
   ================================================================ */

function mostrarSinContactos() {

    const lista =
        document.getElementById('contactosList');

    if (!lista) return;

    lista.innerHTML = `
        <div class="empty-state">

            <span class="icon">◈</span>

            <h3>Sin contactos</h3>

            <p>
                Comienza a agregar personas
                a tu red.
            </p>

            <button
                class="btn-accion"
                onclick="abrirAgregarContacto()"
            >
                ◈ Agregar contacto
            </button>

        </div>
    `;
}

/* ================================================================
   REALTIME
   ================================================================ */

function iniciarEscuchaContactos() {

    const client = sb();

    if (!client || !usuarioActual) {
        return;
    }

    /* ------------------------------------------------------------
       CANAL CONTACTOS
       ------------------------------------------------------------ */

    if (canalContactos) {

        try {
            client.removeChannel(canalContactos);
        } catch (error) {
            console.warn(
                'No se pudo eliminar canal anterior:',
                error
            );
        }

        canalContactos = null;
    }

    canalContactos = client
        .channel(
            'contactos-realtime-' +
            usuarioActual.id
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'contactos',
                filter:
                    `usuario_id=eq.${usuarioActual.id}`
            },
            async () => {

                await cargarContactos();
            }
        )
        .subscribe();

    /* ------------------------------------------------------------
       CANAL USUARIOS

       Se escucha UPDATE porque online,
       ultima_conexion y offline_desde viven
       en public.usuarios.
       ------------------------------------------------------------ */

    if (canalUsuarios) {

        try {
            client.removeChannel(canalUsuarios);
        } catch (error) {}

        canalUsuarios = null;
    }

    canalUsuarios = client
        .channel(
            'usuarios-contactos-' +
            usuarioActual.id
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'usuarios'
            },
            payload => {

                const usuario = payload.new;

                if (!usuario || !usuario.id) {
                    return;
                }

                const contacto =
                    contactos.find(
                        item =>
                            item._id === usuario.id
                    );

                if (!contacto) {
                    return;
                }

                contacto.nombre =
                    usuario.nombre ||
                    contacto.nombre;

                contacto.handle =
                    usuario.handle ||
                    contacto.handle;

                contacto.avatar_url =
                    usuario.avatar_url ||
                    contacto.avatar_url;

                contacto.online =
                    usuario.online === true;

                contacto.ultima_conexion =
                    usuario.ultima_conexion ||
                    null;

                contacto.offline_desde =
                    usuario.offline_desde ||
                    null;

                contacto.verificado =
                    usuario.verificado === true;

                actualizarContadores();

                aplicarFiltros();
            }
        )
        .subscribe();
}

/* ================================================================
   CONTADORES
   ================================================================ */

function actualizarContadores() {

    const total =
        contactos.length;

    const online =
        contactos.filter(
            contacto => contacto.online === true
        ).length;

    const totalEl =
        document.getElementById(
            'totalContactos'
        );

    const onlineEl =
        document.getElementById(
            'onlineContactos'
        );

    if (totalEl) {
        totalEl.textContent = total;
    }

    if (onlineEl) {
        onlineEl.textContent = online;
    }
}

/* ================================================================
   FORMATEAR TIEMPO
   ================================================================ */

function formatearTiempo(fecha) {

    if (!fecha) {
        return 'Desconectado';
    }

    const ahora = Date.now();

    const timestamp =
        new Date(fecha).getTime();

    if (Number.isNaN(timestamp)) {
        return 'Desconectado';
    }

    const diffMin =
        Math.floor(
            (ahora - timestamp) / 60000
        );

    if (diffMin < 1) {
        return 'hace un momento';
    }

    if (diffMin < 60) {
        return `hace ${diffMin} min`;
    }

    if (diffMin < 1440) {
        return `hace ${Math.floor(
            diffMin / 60
        )} h`;
    }

    return `hace ${Math.floor(
        diffMin / 1440
    )} d`;
}

/* ================================================================
   RENDER CONTACTOS
   ================================================================ */

function renderizarContactos(lista) {

    const listaEl =
        document.getElementById(
            'contactosList'
        );

    if (!listaEl) return;

    if (!lista || lista.length === 0) {

        mostrarSinContactos();

        return;
    }

    listaEl.innerHTML =
        lista.map(contacto => {

            const esOnline =
                contacto.online === true;

            const esFavorito =
                contacto.esFavorito === true;

            const nombre =
                contacto.nombre ||
                'Usuario';

            const handle =
                contacto.handle ||
                'usuario';

            const inicial =
                nombre
                    .trim()
                    .charAt(0)
                    .toUpperCase() ||
                '✦';

            const estadoTexto =
                esOnline
                    ? '◉ En línea'
                    : `◈ ${
                        formatearTiempo(
                            contacto.ultima_conexion
                        )
                    }`;

            const id =
                escapeAttr(contacto._id);

            const nombreHTML =
                escapeHTML(nombre);

            const handleHTML =
                escapeHTML(handle);

            const avatar =
                contacto.avatar_url
                    ? `
                        <img
                            src="${escapeAttr(
                                contacto.avatar_url
                            )}"
                            alt="${nombreHTML}"
                            style="
                                width:100%;
                                height:100%;
                                object-fit:cover;
                                border-radius:50%;
                            "
                        >
                    `
                    : escapeHTML(inicial);

            return `
                <div
                    class="contacto-card"
                    data-id="${id}"
                >

                    <div
                        class="
                            contacto-avatar
                            ${esOnline ? 'online' : 'offline'}
                            ${esFavorito ? 'favorito' : ''}
                        "
                    >

                        ${avatar}

                        ${
                            esOnline
                                ? '<span class="online-dot"></span>'
                                : ''
                        }

                        ${
                            esFavorito
                                ? '<span class="favorito-badge">◆</span>'
                                : ''
                        }

                    </div>

                    <div class="contacto-info">

                        <div class="nombre">

                            ${nombreHTML}

                            ${
                                contacto.verificado
                                    ? '<span class="verified">✦ VERIFICADO</span>'
                                    : ''
                            }

                        </div>

                        <div
                            class="
                                estado
                                ${esOnline ? 'online' : 'offline'}
                            "
                        >
                            ${escapeHTML(estadoTexto)}
                        </div>

                        <div class="contacto-meta">

                            <span>
                                @${handleHTML}
                            </span>

                        </div>

                    </div>

                    <div class="contacto-actions">

                        <button
                            class="mensaje"
                            onclick="irAMensajes('${id}')"
                            title="Enviar mensaje"
                        >
                            ◈
                        </button>

                        <button
                            class="
                                favorito
                                ${esFavorito ? 'active' : ''}
                            "
                            onclick="toggleFavorito('${id}')"
                            title="Favorito"
                        >
                            ◆
                        </button>

                        <button
                            class="bloquear"
                            onclick="bloquearContacto('${id}')"
                            title="Bloquear"
                        >
                            🚫
                        </button>

                        <button
                            class="eliminar"
                            onclick="eliminarContacto('${id}')"
                            title="Eliminar"
                        >
                            ✕
                        </button>

                    </div>

                </div>
            `;

        }).join('');
}

/* ================================================================
   FILTROS
   ================================================================ */

function aplicarFiltros() {

    const searchInput =
        document.getElementById(
            'searchInput'
        );

    const query =
        searchInput
            ? searchInput.value
                .toLowerCase()
                .trim()
            : '';

    contactosFiltrados =
        contactos.filter(contacto => {

            const nombre =
                (contacto.nombre || '')
                    .toLowerCase();

            const handle =
                (contacto.handle || '')
                    .toLowerCase();

            const coincideBusqueda =
                !query ||
                nombre.includes(query) ||
                handle.includes(query);

            let coincideFiltro = true;

            switch (filtroActual) {

                case 'online':

                    coincideFiltro =
                        contacto.online === true;

                    break;

                case 'favoritos':

                    coincideFiltro =
                        contacto.esFavorito === true;

                    break;

                case 'todos':
                default:

                    coincideFiltro = true;

                    break;
            }

            return (
                coincideBusqueda &&
                coincideFiltro
            );
        });

    renderizarContactos(
        contactosFiltrados
    );
}

/* ================================================================
   BUSCAR USUARIOS
   TABLA REAL: public.usuarios
   ================================================================ */

async function buscarUsuarios(query) {

    const container =
        document.getElementById(
            'resultadosBusqueda'
        );

    if (!query || query.trim().length < 2) {

        if (container) {
            container.innerHTML = '';
        }

        return;
    }

    try {

        const session =
            await getSession();

        if (!session) return;

        const client = sb();

        if (!client) return;

        /*
         * Limpieza para evitar caracteres
         * especiales de filtros PostgREST.
         */

        const q =
            query
                .trim()
                .replace(/[%_,()]/g, '')
                .replace(/\s+/g, ' ');

        if (q.length < 2) {
            if (container) {
                container.innerHTML = '';
            }
            return;
        }

        const { data, error } =
            await client
                .from('usuarios')
                .select(`
                    id,
                    nombre,
                    handle,
                    avatar_url,
                    online,
                    verificado
                `)
                .or(
                    `nombre.ilike.%${q}%,handle.ilike.%${q}%`
                )
                .neq(
                    'id',
                    session.user.id
                )
                .limit(10);

        if (error) {
            throw error;
        }

        if (!container) return;

        if (!data || data.length === 0) {

            container.innerHTML = `
                <div
                    style="
                        padding:12px;
                        text-align:center;
                        color:var(--text-muted);
                        font-size:0.75rem;
                    "
                >
                    No se encontraron usuarios
                </div>
            `;

            return;
        }

        /*
         * Contactos existentes del usuario actual.
         */

        const {
            data: contactosExistentes,
            error: errorContactos
        } = await client
            .from('contactos')
            .select('contacto_id, estado')
            .eq(
                'usuario_id',
                session.user.id
            );

        if (errorContactos) {
            throw errorContactos;
        }

        const idsExistentes =
            new Set(
                (contactosExistentes || [])
                    .map(
                        contacto =>
                            contacto.contacto_id
                    )
            );

        container.innerHTML =
            data.map(usuario => {

                const yaEsContacto =
                    idsExistentes.has(
                        usuario.id
                    );

                const estaOnline =
                    usuario.online === true;

                const nombre =
                    usuario.nombre ||
                    'Usuario';

                const handle =
                    usuario.handle ||
                    'usuario';

                const nombreHTML =
                    escapeHTML(nombre);

                const handleHTML =
                    escapeHTML(handle);

                const id =
                    escapeAttr(usuario.id);

                const inicial =
                    escapeHTML(
                        nombre
                            .trim()
                            .charAt(0)
                            .toUpperCase() ||
                        '◈'
                    );

                const avatar =
                    usuario.avatar_url
                        ? `
                            <img
                                src="${escapeAttr(
                                    usuario.avatar_url
                                )}"
                                alt="${nombreHTML}"
                                style="
                                    width:100%;
                                    height:100%;
                                    object-fit:cover;
                                "
                            >
                        `
                        : inicial;

                return `
                    <div
                        class="resultado-item"
                        style="
                            display:flex;
                            align-items:center;
                            gap:10px;
                            padding:8px 12px;
                            border-bottom:
                                1px solid
                                rgba(212,175,55,0.05);
                        "
                    >

                        <div
                            class="avatar"
                            style="
                                width:36px;
                                height:36px;
                                min-width:36px;
                                border-radius:50%;
                                background:
                                    linear-gradient(
                                        135deg,
                                        var(--green-deep),
                                        var(--gold)
                                    );
                                display:flex;
                                align-items:center;
                                justify-content:center;
                                color:white;
                                font-size:0.8rem;
                                overflow:hidden;
                                border:2px solid
                                    ${
                                        estaOnline
                                            ? 'var(--success)'
                                            : 'var(--text-muted)'
                                    };
                            "
                        >
                            ${avatar}
                        </div>

                        <div style="flex:1;min-width:0;">

                            <div
                                style="
                                    font-weight:600;
                                    font-size:0.8rem;
                                "
                            >
                                ${nombreHTML}

                                ${
                                    usuario.verificado
                                        ? '<span class="verified">✦</span>'
                                        : ''
                                }
                            </div>

                            <div
                                style="
                                    font-size:0.6rem;
                                    color:var(--text-muted);
                                "
                            >
                                @${handleHTML}

                                ${
                                    estaOnline
                                        ? ' · 🟢 En línea'
                                        : ''
                                }
                            </div>

                        </div>

                        ${
                            yaEsContacto
                                ? `
                                    <span
                                        style="
                                            font-size:0.55rem;
                                            color:var(--success);
                                            background:
                                                rgba(
                                                    0,
                                                    214,
                                                    143,
                                                    0.1
                                                );
                                            padding:
                                                2px 10px;
                                            border-radius:12px;
                                            white-space:nowrap;
                                        "
                                    >
                                        ✓ Contacto
                                    </span>
                                `
                                : `
                                    <button
                                        onclick="agregarContacto('${id}')"
                                        style="
                                            background:
                                                linear-gradient(
                                                    135deg,
                                                    var(--gold),
                                                    var(--gold-dark)
                                                );
                                            color:var(--space);
                                            border:none;
                                            padding:4px 12px;
                                            border-radius:12px;
                                            font-size:0.6rem;
                                            font-weight:600;
                                            cursor:pointer;
                                            white-space:nowrap;
                                        "
                                    >
                                        + Agregar
                                    </button>
                                `
                        }

                    </div>
                `;

            }).join('');

    } catch (error) {

        console.error(
            'Error buscando usuarios:',
            error
        );

        if (container) {

            container.innerHTML = `
                <div
                    style="
                        padding:12px;
                        text-align:center;
                        color:var(--text-muted);
                        font-size:0.7rem;
                    "
                >
                    No fue posible realizar la búsqueda
                </div>
            `;
        }
    }
}

/* ================================================================
   AGREGAR CONTACTO
   TABLA REAL: public.contactos
   ================================================================ */

async function agregarContacto(contactoId) {

    try {

        const session =
            await getSession();

        if (!session) {

            showToast(
                '⚠️ Inicia sesión',
                'error'
            );

            return;
        }

        if (!contactoId) {

            showToast(
                '⚠️ Usuario inválido',
                'error'
            );

            return;
        }

        if (
            contactoId ===
            session.user.id
        ) {

            showToast(
                '⚠️ No puedes agregarte a ti mismo',
                'warning'
            );

            return;
        }

        const client = sb();

        /*
         * Comprobación previa para evitar
         * duplicados.
         */

        const {
            data: existe,
            error: errorExiste
        } = await client
            .from('contactos')
            .select(`
                id,
                estado
            `)
            .eq(
                'usuario_id',
                session.user.id
            )
            .eq(
                'contacto_id',
                contactoId
            )
            .maybeSingle();

        if (errorExiste) {
            throw errorExiste;
        }

        if (existe) {

            if (existe.estado !== 'activo') {

                const {
                    error: errorReactivar
                } = await client
                    .from('contactos')
                    .update({
                        estado: 'activo'
                    })
                    .eq(
                        'id',
                        existe.id
                    );

                if (errorReactivar) {
                    throw errorReactivar;
                }

                showToast(
                    '✅ Contacto restaurado',
                    'success'
                );

            } else {

                showToast(
                    '⚠️ Ya es tu contacto',
                    'warning'
                );
            }

            await cargarContactos();

            return;
        }

        const {
            error
        } = await client
            .from('contactos')
            .insert({
                usuario_id:
                    session.user.id,

                contacto_id:
                    contactoId,

                estado:
                    'activo',

                es_favorito:
                    false
            });

        if (error) {
            throw error;
        }

        showToast(
            '✅ Contacto agregado',
            'success'
        );

        const input =
            document.getElementById(
                'searchInputModal'
            );

        if (input) {
            input.value = '';
        }

        const resultados =
            document.getElementById(
                'resultadosBusqueda'
            );

        if (resultados) {
            resultados.innerHTML = '';
        }

        cerrarModalBuscar();

        await cargarContactos();

    } catch (error) {

        console.error(
            'Error agregando contacto:',
            error
        );

        showToast(
            '❌ No fue posible agregar el contacto',
            'error'
        );
    }
}

/* ================================================================
   BLOQUEAR CONTACTO
   TABLA REAL: public.bloqueos

   COLUMNAS:
   - id
   - usuario_id
   - bloqueado_id
   - created_at
   ================================================================ */

async function bloquearContacto(contactoId) {

    if (!contactoId) return;

    if (
        !confirm(
            '¿Bloquear a este usuario?'
        )
    ) {
        return;
    }

    try {

        const session =
            await getSession();

        if (!session) {

            showToast(
                '⚠️ Inicia sesión',
                'error'
            );

            return;
        }

        const client = sb();

        /*
         * Evitar duplicar bloqueo.
         */

        const {
            data: bloqueoExistente,
            error: errorBusqueda
        } = await client
            .from('bloqueos')
            .select('id')
            .eq(
                'usuario_id',
                session.user.id
            )
            .eq(
                'bloqueado_id',
                contactoId
            )
            .maybeSingle();

        if (errorBusqueda) {
            throw errorBusqueda;
        }

        if (!bloqueoExistente) {

            const {
                error: errorBloqueo
            } = await client
                .from('bloqueos')
                .insert({
                    usuario_id:
                        session.user.id,

                    bloqueado_id:
                        contactoId
                });

            if (errorBloqueo) {
                throw errorBloqueo;
            }
        }

        /*
         * Eliminar la relación de contactos.
         */

        const {
            error: errorContacto
        } = await client
            .from('contactos')
            .delete()
            .eq(
                'usuario_id',
                session.user.id
            )
            .eq(
                'contacto_id',
                contactoId
            );

        if (errorContacto) {
            throw errorContacto;
        }

        contactos =
            contactos.filter(
                contacto =>
                    contacto._id !== contactoId
            );

        actualizarContadores();

        aplicarFiltros();

        showToast(
            '🚫 Usuario bloqueado',
            'warning'
        );

    } catch (error) {

        console.error(
            'Error bloqueando usuario:',
            error
        );

        showToast(
            '❌ No fue posible bloquear al usuario',
            'error'
        );
    }
}

/* ================================================================
   MENSAJES
   ================================================================ */

function irAMensajes(contactoId) {

    if (!contactoId) return;

    const id =
        encodeURIComponent(
            contactoId
        );

    window.location.href =
        `/features/mensajes/mensajes.html?contacto=${id}`;
}

/* ================================================================
   FAVORITO
   TABLA REAL: public.contactos
   ================================================================ */

async function toggleFavorito(contactoId) {

    const session =
        await getSession();

    if (!session) {

        showToast(
            '⚠️ Inicia sesión',
            'error'
        );

        return;
    }

    try {

        const contacto =
            contactos.find(
                item =>
                    item._id === contactoId
            );

        if (!contacto) {
            return;
        }

        const nuevoEstado =
            !contacto.esFavorito;

        const client = sb();

        const {
            error
        } = await client
            .from('contactos')
            .update({
                es_favorito:
                    nuevoEstado
            })
            .eq(
                'usuario_id',
                session.user.id
            )
            .eq(
                'contacto_id',
                contactoId
            );

        if (error) {
            throw error;
        }

        contacto.esFavorito =
            nuevoEstado;

        aplicarFiltros();

        showToast(
            nuevoEstado
                ? '◆ Agregado a favoritos'
                : '◆ Favorito eliminado',
            'success'
        );

    } catch (error) {

        console.error(
            'Error actualizando favorito:',
            error
        );

        showToast(
            '❌ Error al actualizar favorito',
            'error'
        );
    }
}

/* ================================================================
   ELIMINAR CONTACTO
   ================================================================ */

async function eliminarContacto(contactoId) {

    if (!contactoId) return;

    if (
        !confirm(
            '¿Eliminar este contacto?'
        )
    ) {
        return;
    }

    const session =
        await getSession();

    if (!session) {

        showToast(
            '⚠️ Inicia sesión',
            'error'
        );

        return;
    }

    try {

        const client = sb();

        const {
            error
        } = await client
            .from('contactos')
            .delete()
            .eq(
                'usuario_id',
                session.user.id
            )
            .eq(
                'contacto_id',
                contactoId
            );

        if (error) {
            throw error;
        }

        contactos =
            contactos.filter(
                contacto =>
                    contacto._id !== contactoId
            );

        actualizarContadores();

        aplicarFiltros();

        showToast(
            '✅ Contacto eliminado',
            'success'
        );

    } catch (error) {

        console.error(
            'Error eliminando contacto:',
            error
        );

        showToast(
            '❌ Error al eliminar contacto',
            'error'
        );
    }
}

/* ================================================================
   INVITACIONES
   TABLA REAL: public.invitaciones

   COLUMNAS:
   - id
   - usuario_id
   - codigo
   - usado_por
   - usado
   - fecha_creacion
   - fecha_uso
   - created_at
   - activo
   - expira_en
   ================================================================ */

async function invitarContacto() {

    try {

        const session =
            await getSession();

        if (!session) {

            showToast(
                '⚠️ Inicia sesión',
                'error'
            );

            return;
        }

        const client = sb();

        let codigo;

        /*
         * Generar código y comprobar que no exista.
         */

        for (let intento = 0; intento < 5; intento++) {

            const candidato =
                'SAR-' +
                Math.random()
                    .toString(36)
                    .substring(2, 8)
                    .toUpperCase();

            const {
                data: existente,
                error: errorBusqueda
            } = await client
                .from('invitaciones')
                .select('id')
                .eq(
                    'codigo',
                    candidato
                )
                .maybeSingle();

            if (errorBusqueda) {
                throw errorBusqueda;
            }

            if (!existente) {

                codigo =
                    candidato;

                break;
            }
        }

        if (!codigo) {

            showToast(
                '❌ No se pudo generar un código único',
                'error'
            );

            return;
        }

        const {
            data,
            error
        } = await client
            .from('invitaciones')
            .insert({
                usuario_id:
                    session.user.id,

                codigo,

                activo:
                    true,

                usado:
                    false
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        const modal =
            document.getElementById(
                'modalInvitacion'
            );

        const codigoEl =
            document.getElementById(
                'codigoInvitacion'
            );

        if (
            modal &&
            codigoEl
        ) {

            codigoEl.textContent =
                data.codigo;

            modal.classList.add('show');

            modal.style.display =
                'flex';
        }

        showToast(
            '✅ Código generado',
            'success'
        );

    } catch (error) {

        console.error(
            'Error generando invitación:',
            error
        );

        showToast(
            '❌ Error al generar invitación',
            'error'
        );
    }
}

/* ================================================================
   CERRAR INVITACIÓN
   ================================================================ */

function cerrarModalInvitacion() {

    const modal =
        document.getElementById(
            'modalInvitacion'
        );

    if (!modal) return;

    modal.classList.remove('show');

    modal.style.display =
        'none';
}

/* ================================================================
   COPIAR INVITACIÓN
   ================================================================ */

async function copiarCodigoInvitacion() {

    const codigoEl =
        document.getElementById(
            'codigoInvitacion'
        );

    const codigo =
        codigoEl?.textContent?.trim();

    if (!codigo) {
        return;
    }

    const texto =
        `◈ Únete a Sariel's con mi código: ${codigo}`;

    try {

        if (
            navigator.clipboard &&
            navigator.clipboard.writeText
        ) {

            await navigator.clipboard
                .writeText(texto);

        } else {

            throw new Error(
                'Clipboard no disponible'
            );
        }

        showToast(
            '📋 Código copiado',
            'success'
        );

    } catch (error) {

        prompt(
            'Copia este código:',
            codigo
        );
    }
}

/* ================================================================
   ORDENAR CONTACTOS
   ================================================================ */

function ordenarContactos(criterio) {

    if (!Array.isArray(contactos)) {
        return;
    }

    switch (criterio) {

        case 'nombre':

            contactos.sort(
                (a, b) =>
                    (a.nombre || '')
                        .localeCompare(
                            b.nombre || '',
                            undefined,
                            {
                                sensitivity:
                                    'base'
                            }
                        )
            );

            break;

        case 'online':

            contactos.sort(
                (a, b) =>
                    Number(
                        b.online === true
                    ) -
                    Number(
                        a.online === true
                    )
            );

            break;

        case 'reciente':

            contactos.sort(
                (a, b) => {

                    const fechaA =
                        a.ultima_conexion
                            ? new Date(
                                a.ultima_conexion
                            ).getTime()
                            : 0;

                    const fechaB =
                        b.ultima_conexion
                            ? new Date(
                                b.ultima_conexion
                            ).getTime()
                            : 0;

                    return fechaB - fechaA;
                }
            );

            break;
    }

    aplicarFiltros();
}

/* ================================================================
   ABRIR MODAL BUSCAR
   ================================================================ */

function abrirAgregarContacto() {

    const modal =
        document.getElementById(
            'modalBuscarContacto'
        );

    if (!modal) return;

    modal.classList.add('show');

    modal.style.display =
        'flex';

    setTimeout(() => {

        const input =
            document.getElementById(
                'searchInputModal'
            );

        if (input) {
            input.focus();
        }

    }, 300);
}

/* ================================================================
   CERRAR MODAL BUSCAR
   ================================================================ */

function cerrarModalBuscar() {

    const modal =
        document.getElementById(
            'modalBuscarContacto'
        );

    if (modal) {

        modal.classList.remove('show');

        modal.style.display =
            'none';
    }

    const input =
        document.getElementById(
            'searchInputModal'
        );

    if (input) {
        input.value = '';
    }

    const resultados =
        document.getElementById(
            'resultadosBusqueda'
        );

    if (resultados) {
        resultados.innerHTML = '';
    }
}

/* ================================================================
   LIMPIAR REALTIME
   ================================================================ */

function limpiarRecursosContactos() {

    const client = sb();

    if (!client) {
        return;
    }

    if (canalContactos) {

        try {
            client.removeChannel(
                canalContactos
            );
        } catch (error) {}

        canalContactos = null;
    }

    if (canalUsuarios) {

        try {
            client.removeChannel(
                canalUsuarios
            );
        } catch (error) {}

        canalUsuarios = null;
    }
}

/* ================================================================
   INIT
   ================================================================ */

document.addEventListener(
    'DOMContentLoaded',
    function () {

        console.log(
            "◈ Sariel's - Contactos inicializando..."
        );

        /* --------------------------------------------------------
           FILTROS
           -------------------------------------------------------- */

        const filtros =
            document.querySelectorAll(
                '.filtro'
            );

        filtros.forEach(btn => {

            btn.addEventListener(
                'click',
                function () {

                    filtros.forEach(
                        item =>
                            item.classList
                                .remove(
                                    'active'
                                )
                    );

                    this.classList.add(
                        'active'
                    );

                    filtroActual =
                        this.getAttribute(
                            'data-filtro'
                        ) ||
                        'todos';

                    if (
                        filtroActual ===
                        'online'
                    ) {

                        ordenarContactos(
                            'online'
                        );

                    } else if (
                        filtroActual ===
                        'recientes'
                    ) {

                        ordenarContactos(
                            'reciente'
                        );

                    } else if (
                        filtroActual ===
                        'favoritos'
                    ) {

                        aplicarFiltros();

                    } else {

                        ordenarContactos(
                            'nombre'
                        );
                    }
                }
            );
        });

        /* --------------------------------------------------------
           ESPERAR SUPABASE
           -------------------------------------------------------- */

        let intentos = 0;

        function init() {

            const client = sb();

            if (
                !client ||
                !client.auth
            ) {

                intentos++;

                if (intentos < 30) {

                    setTimeout(
                        init,
                        500
                    );

                    return;
                }

                console.error(
                    "❌ Supabase no estuvo disponible después de 15 segundos."
                );

                mostrarSinContactos();

                return;
            }

            console.log(
                "✅ Cliente Supabase disponible."
            );

            verificarAutenticacion()
                .then(async autenticado => {

                    if (!autenticado) {

                        mostrarSinContactos();

                        return;
                    }

                    await actualizarOnline(
                        true
                    );

                    await cargarContactos();

                })
                .catch(error => {

                    console.error(
                        'Error inicializando Contactos:',
                        error
                    );

                    mostrarSinContactos();
                });
        }

        init();

        /* --------------------------------------------------------
           BÚSQUEDA DE USUARIOS
           -------------------------------------------------------- */

        const searchModal =
            document.getElementById(
                'searchInputModal'
            );

        if (searchModal) {

            let timeout;

            searchModal.addEventListener(
                'input',
                function () {

                    clearTimeout(
                        timeout
                    );

                    const valor =
                        this.value;

                    timeout =
                        setTimeout(
                            () =>
                                buscarUsuarios(
                                    valor
                                ),
                            300
                        );
                }
            );

            searchModal.addEventListener(
                'keydown',
                function (event) {

                    if (
                        event.key ===
                        'Enter'
                    ) {

                        buscarUsuarios(
                            this.value
                        );
                    }
                }
            );
        }

        /* --------------------------------------------------------
           BÚSQUEDA EN CONTACTOS
           -------------------------------------------------------- */

        const searchInput =
            document.getElementById(
                'searchInput'
            );

        if (searchInput) {

            searchInput.addEventListener(
                'input',
                aplicarFiltros
            );
        }

        /* --------------------------------------------------------
           ESC
           -------------------------------------------------------- */

        document.addEventListener(
            'keydown',
            function (event) {

                if (
                    event.key ===
                    'Escape'
                ) {

                    cerrarModalBuscar();

                    cerrarModalInvitacion();
                }
            }
        );
    }
);

/* ================================================================
   AL SALIR
   ================================================================ */

window.addEventListener(
    'beforeunload',
    function () {

        /*
         * Se mantiene síncrono en cuanto al
         * cierre de canales.
         */

        limpiarRecursosContactos();

        /*
         * Intentamos marcar offline.
         * El navegador puede cancelar operaciones
         * asíncronas durante beforeunload, por eso
         * no dependemos de esto como mecanismo único.
         */

        try {
            actualizarOnline(false);
        } catch (error) {}
    }
);

/* ================================================================
   EXPORTACIONES GLOBALES
   ================================================================ */

window.cargarContactos =
    cargarContactos;

window.irAMensajes =
    irAMensajes;

window.toggleFavorito =
    toggleFavorito;

window.eliminarContacto =
    eliminarContacto;

window.abrirAgregarContacto =
    abrirAgregarContacto;

window.buscarUsuarios =
    buscarUsuarios;

window.agregarContacto =
    agregarContacto;

window.bloquearContacto =
    bloquearContacto;

window.invitarContacto =
    invitarContacto;

window.copiarCodigoInvitacion =
    copiarCodigoInvitacion;

window.cerrarModalInvitacion =
    cerrarModalInvitacion;

window.cerrarModalBuscar =
    cerrarModalBuscar;

window.ordenarContactos =
    ordenarContactos;

window.actualizarOnline =
    actualizarOnline;

window.showToast =
    showToast;

window.aplicarFiltros =
    aplicarFiltros;

window.limpiarRecursosContactos =
    limpiarRecursosContactos;

console.log(
    "◈ Sariel's Contactos JS cargado."
);