/* ================================================================
   CONTACTOS - SARIEL'S ECOSYSTEM
   PRODUCCIÓN
   ================================================================
   - Usa el cliente Supabase real creado por app.js
   - Compatible con window.supabaseClient y window.supabase
   - No contiene CSS
   - No modifica Videos, Live, Grupos, Transmisiones ni Mensajes
   - Tablas utilizadas:
       public.contactos
       public.usuarios
       public.bloqueos
       public.invitaciones
   ================================================================ */

(function () {
    'use strict';

    // ============================================================
    // SUPABASE
    // ============================================================

    function sb() {
        return window.supabaseClient || window.supabase || null;
    }

    function clienteDisponible() {
        const client = sb();

        return !!(
            client &&
            typeof client.from === 'function' &&
            client.auth &&
            typeof client.auth.getSession === 'function'
        );
    }

    // ============================================================
    // ESCAPE HTML
    // ============================================================

    function escapeHTML(texto) {
        if (texto === null || texto === undefined) return '';

        const div = document.createElement('div');
        div.textContent = String(texto);

        return div.innerHTML;
    }

    // ============================================================
    // TOAST
    // ============================================================

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
                toast.classList.remove(
                    'show',
                    'error',
                    'warning',
                    'success'
                );
            }, 3500);

        } catch (error) {
            console.warn('Error mostrando toast:', error);
        }
    }

    // ============================================================
    // ESTADO
    // ============================================================

    let contactos = [];
    let contactosFiltrados = [];

    let filtroActual = 'todos';

    let usuarioActual = null;

    let canalContactos = null;
    let canalUsuarios = null;

    let cargandoContactos = false;

    // ============================================================
    // SESSION
    // ============================================================

    async function getSession() {
        try {
            const client = sb();

            if (!client || !client.auth) {
                console.warn('Supabase todavía no está disponible.');
                return null;
            }

            const {
                data,
                error
            } = await client.auth.getSession();

            if (error) {
                console.error('Error obteniendo sesión:', error);
                return null;
            }

            return data?.session || null;

        } catch (error) {
            console.error('Error obteniendo sesión:', error);
            return null;
        }
    }

    // ============================================================
    // AUTENTICACIÓN
    // ============================================================

    async function verificarAutenticacion() {
        const session = await getSession();

        if (!session) {
            usuarioActual = null;

            mostrarEstado(
                '◈',
                'Inicia sesión',
                'Necesitas iniciar sesión para ver tus contactos.',
                true
            );

            return false;
        }

        usuarioActual = session.user;

        return true;
    }

    // ============================================================
    // ESTADOS VISUALES
    // ============================================================

    function mostrarEstado(icono, titulo, descripcion = '', mostrarBoton = false) {
        const lista = document.getElementById('contactosList');

        if (!lista) return;

        lista.innerHTML = `
            <div class="empty-state">
                <span class="icon">${escapeHTML(icono)}</span>

                <h3>${escapeHTML(titulo)}</h3>

                ${
                    descripcion
                        ? `<p style="margin-top:8px;">${escapeHTML(descripcion)}</p>`
                        : ''
                }

                ${
                    mostrarBoton
                        ? `
                            <button
                                type="button"
                                class="btn-accion"
                                onclick="abrirAgregarContacto()"
                            >
                                ◈ Agregar contacto
                            </button>
                        `
                        : ''
                }
            </div>
        `;
    }

    function mostrarCargando() {
        mostrarEstado(
            '◈',
            'Cargando contactos...',
            'Estamos consultando tu lista de contactos.'
        );
    }

    function mostrarSinContactos() {
        mostrarEstado(
            '◈',
            'Sin contactos',
            'Comienza a agregar personas a tu red.',
            true
        );
    }

    function mostrarErrorContactos() {
        mostrarEstado(
            '⚠',
            'No se pudieron cargar los contactos',
            'Comprueba tu sesión y vuelve a intentarlo.'
        );
    }

    // ============================================================
    // ESTADO ONLINE DEL USUARIO ACTUAL
    // ============================================================

    async function actualizarOnline(online) {
        try {
            const client = sb();

            if (!client || !usuarioActual) return;

            const { error } = await client
                .from('usuarios')
                .update({
                    online: Boolean(online),
                    ultima_conexion: new Date().toISOString()
                })
                .eq('id', usuarioActual.id);

            if (error) {
                console.error(
                    'Error actualizando estado online:',
                    error
                );
            }

        } catch (error) {
            console.error(
                'Error actualizando estado online:',
                error
            );
        }
    }

    // ============================================================
    // CARGAR CONTACTOS
    // ============================================================

    async function cargarContactos() {
        if (cargandoContactos) return;

        cargandoContactos = true;

        mostrarCargando();

        try {
            const client = sb();

            if (!clienteDisponible()) {
                console.error(
                    'El cliente Supabase no está disponible.'
                );

                mostrarErrorContactos();
                return;
            }

            const autenticado = await verificarAutenticacion();

            if (!autenticado) {
                return;
            }

            /*
             * Relación explícita:
             *
             * contactos.contacto_id
             * -> usuarios.id
             *
             * Se utiliza el nombre de la FK para evitar
             * ambigüedad entre usuario_id y contacto_id.
             */

            const {
                data,
                error
            } = await client
                .from('contactos')
                .select(`
                    id,
                    usuario_id,
                    contacto_id,
                    estado,
                    es_favorito,
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

                mostrarErrorContactos();
                return;
            }

            if (!Array.isArray(data) || data.length === 0) {
                contactos = [];

                actualizarContadores();

                aplicarFiltros();

                iniciarEscuchaContactos();

                return;
            }

            contactos = data
                .filter(registro => registro.contacto)
                .map(registro => {
                    const usuario = registro.contacto;

                    return {
                        _id: usuario.id,

                        nombre:
                            usuario.nombre ||
                            'Usuario',

                        handle:
                            usuario.handle ||
                            '',

                        avatar_url:
                            usuario.avatar_url ||
                            null,

                        online:
                            usuario.online === true,

                        ultima_conexion:
                            usuario.ultima_conexion ||
                            usuario.offline_desde ||
                            null,

                        esFavorito:
                            registro.es_favorito === true,

                        verificado:
                            usuario.verificado === true,

                        estado_relacion:
                            registro.estado ||
                            'activo',

                        created_at:
                            registro.created_at ||
                            registro.fecha ||
                            null
                    };
                });

            actualizarContadores();

            aplicarFiltros();

            iniciarEscuchaContactos();

        } catch (error) {
            console.error(
                'Error inesperado cargando contactos:',
                error
            );

            mostrarErrorContactos();

        } finally {
            cargandoContactos = false;
        }
    }

    // ============================================================
    // REALTIME
    // ============================================================

    function iniciarEscuchaContactos() {
        const client = sb();

        if (!client || !usuarioActual) return;

        detenerRealtime();

        canalContactos = client
            .channel(
                `contactos-${usuarioActual.id}`
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
                () => {
                    cargarContactos();
                }
            )
            .subscribe();

        canalUsuarios = client
            .channel(
                `usuarios-contactos-${usuarioActual.id}`
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'usuarios'
                },
                payload => {
                    const usuario = payload?.new;

                    if (!usuario?.id) return;

                    const contacto =
                        contactos.find(
                            c => c._id === usuario.id
                        );

                    if (!contacto) return;

                    contacto.online =
                        usuario.online === true;

                    contacto.ultima_conexion =
                        usuario.ultima_conexion ||
                        usuario.offline_desde ||
                        null;

                    actualizarContadores();
                    aplicarFiltros();
                }
            )
            .subscribe();
    }

    function detenerRealtime() {
        const client = sb();

        if (!client) return;

        if (canalContactos) {
            try {
                client.removeChannel(
                    canalContactos
                );
            } catch (error) {
                console.warn(
                    'Error removiendo canal contactos:',
                    error
                );
            }

            canalContactos = null;
        }

        if (canalUsuarios) {
            try {
                client.removeChannel(
                    canalUsuarios
                );
            } catch (error) {
                console.warn(
                    'Error removiendo canal usuarios:',
                    error
                );
            }

            canalUsuarios = null;
        }
    }

    // ============================================================
    // CONTADORES
    // ============================================================

    function actualizarContadores() {
        const total = contactos.length;

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

    // ============================================================
    // TIEMPO
    // ============================================================

    function formatearTiempo(fecha) {
        if (!fecha) {
            return 'Desconectado';
        }

        const entonces =
            new Date(fecha);

        if (
            Number.isNaN(
                entonces.getTime()
            )
        ) {
            return 'Desconectado';
        }

        const ahora = new Date();

        const diffMin = Math.floor(
            (
                ahora.getTime() -
                entonces.getTime()
            ) / 60000
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

    // ============================================================
    // RENDER
    // ============================================================

    function renderizarContactos(lista) {
        const listaEl =
            document.getElementById(
                'contactosList'
            );

        if (!listaEl) return;

        if (
            !Array.isArray(lista) ||
            lista.length === 0
        ) {
            if (contactos.length === 0) {
                mostrarSinContactos();
            } else {
                listaEl.innerHTML = `
                    <div class="empty-state">
                        <span class="icon">◇</span>
                        <h3>No hay coincidencias</h3>
                        <p style="margin-top:8px;">
                            No encontramos contactos con ese filtro.
                        </p>
                    </div>
                `;
            }

            return;
        }

        listaEl.innerHTML = lista
            .map(contacto => {
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

                const id =
                    escapeHTML(
                        contacto._id
                    );

                const nombreSeguro =
                    escapeHTML(nombre);

                const handleSeguro =
                    escapeHTML(handle);

                const avatarSeguro =
                    contacto.avatar_url
                        ? escapeHTML(
                            contacto.avatar_url
                        )
                        : '';

                const estadoTexto =
                    esOnline
                        ? '◉ En línea'
                        : `◈ ${formatearTiempo(
                            contacto.ultima_conexion
                        )}`;

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

                            ${
                                avatarSeguro
                                    ? `
                                        <img
                                            src="${avatarSeguro}"
                                            alt="${nombreSeguro}"
                                        >
                                    `
                                    : inicial
                            }

                            ${
                                esOnline
                                    ? `
                                        <span
                                            class="online-dot"
                                        ></span>
                                    `
                                    : ''
                            }

                            ${
                                esFavorito
                                    ? `
                                        <span
                                            class="favorito-badge"
                                        >
                                            ◆
                                        </span>
                                    `
                                    : ''
                            }

                        </div>

                        <div class="contacto-info">

                            <div class="nombre">

                                ${nombreSeguro}

                                ${
                                    contacto.verificado
                                        ? `
                                            <span class="verified">
                                                ✦ VERIFICADO
                                            </span>
                                        `
                                        : ''
                                }

                            </div>

                            <div
                                class="
                                    estado
                                    ${esOnline ? 'online' : 'offline'}
                                "
                            >
                                ${estadoTexto}
                            </div>

                            <div class="contacto-meta">
                                <span>
                                    @${handleSeguro}
                                </span>
                            </div>

                        </div>

                        <div class="contacto-actions">

                            <button
                                type="button"
                                class="mensaje"
                                onclick="irAMensajes('${id}')"
                                title="Enviar mensaje"
                            >
                                ◈
                            </button>

                            <button
                                type="button"
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
                                type="button"
                                class="bloquear"
                                onclick="bloquearContacto('${id}')"
                                title="Bloquear"
                            >
                                🚫
                            </button>

                            <button
                                type="button"
                                class="eliminar"
                                onclick="eliminarContacto('${id}')"
                                title="Eliminar"
                            >
                                ✕
                            </button>

                        </div>

                    </div>
                `;
            })
            .join('');
    }

    // ============================================================
    // FILTROS
    // ============================================================

    function aplicarFiltros() {
        const searchInput =
            document.getElementById(
                'searchInput'
            );

        const query =
            searchInput?.value
                ?.toLowerCase()
                .trim() || '';

        contactosFiltrados =
            contactos.filter(contacto => {
                const nombre =
                    (
                        contacto.nombre || ''
                    ).toLowerCase();

                const handle =
                    (
                        contacto.handle || ''
                    ).toLowerCase();

                const coincideBusqueda =
                    !query ||
                    nombre.includes(query) ||
                    handle.includes(query);

                let coincideFiltro = true;

                if (
                    filtroActual === 'online'
                ) {
                    coincideFiltro =
                        contacto.online === true;
                }

                if (
                    filtroActual === 'favoritos'
                ) {
                    coincideFiltro =
                        contacto.esFavorito === true;
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

    // ============================================================
    // BUSCAR USUARIOS
    // ============================================================

    async function buscarUsuarios(query) {
        const container =
            document.getElementById(
                'resultadosBusqueda'
            );

        if (!container) return;

        const texto =
            String(query || '')
                .trim();

        if (texto.length < 2) {
            container.innerHTML = `
                <div
                    style="
                        padding:20px;
                        text-align:center;
                        color:var(--text-muted);
                        font-size:0.75rem;
                    "
                >
                    Escribe al menos 2 caracteres para buscar
                </div>
            `;

            return;
        }

        try {
            const client = sb();

            const session =
                await getSession();

            if (!client || !session) {
                return;
            }

            const q =
                texto
                    .replace(/[%_,()]/g, '')
                    .trim();

            if (q.length < 2) {
                return;
            }

            const {
                data,
                error
            } = await client
                .from('usuarios')
                .select(`
                    id,
                    nombre,
                    handle,
                    avatar_url,
                    online
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

            const {
                data: existentes,
                error: errorExistentes
            } = await client
                .from('contactos')
                .select('contacto_id')
                .eq(
                    'usuario_id',
                    session.user.id
                );

            if (errorExistentes) {
                throw errorExistentes;
            }

            const idsExistentes =
                new Set(
                    (existentes || [])
                        .map(
                            registro =>
                                registro.contacto_id
                        )
                );

            if (
                !Array.isArray(data) ||
                data.length === 0
            ) {
                container.innerHTML = `
                    <div
                        style="
                            padding:20px;
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

            container.innerHTML =
                data.map(usuario => {
                    const nombre =
                        usuario.nombre ||
                        'Usuario';

                    const handle =
                        usuario.handle ||
                        'usuario';

                    const nombreSeguro =
                        escapeHTML(nombre);

                    const handleSeguro =
                        escapeHTML(handle);

                    const idSeguro =
                        escapeHTML(
                            usuario.id
                        );

                    const avatar =
                        usuario.avatar_url
                            ? escapeHTML(
                                usuario.avatar_url
                            )
                            : '';

                    const inicial =
                        nombre
                            .trim()
                            .charAt(0)
                            .toUpperCase() ||
                        '◈';

                    const online =
                        usuario.online === true;

                    const yaEsContacto =
                        idsExistentes.has(
                            usuario.id
                        );

                    return `
                        <div
                            class="resultado-item"
                            style="
                                display:flex;
                                align-items:center;
                                gap:10px;
                                padding:8px 12px;
                                border-bottom:1px solid rgba(212,175,55,0.05);
                            "
                        >

                            <div
                                class="avatar"
                                style="
                                    width:36px;
                                    height:36px;
                                    border-radius:50%;
                                    background:linear-gradient(
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
                                    border:2px solid ${
                                        online
                                            ? 'var(--success)'
                                            : 'var(--text-muted)'
                                    };
                                "
                            >
                                ${
                                    avatar
                                        ? `
                                            <img
                                                src="${avatar}"
                                                alt="${nombreSeguro}"
                                                style="
                                                    width:100%;
                                                    height:100%;
                                                    object-fit:cover;
                                                "
                                            >
                                        `
                                        : inicial
                                }
                            </div>

                            <div style="flex:1;min-width:0;">

                                <div
                                    style="
                                        font-weight:600;
                                        font-size:0.8rem;
                                    "
                                >
                                    ${nombreSeguro}
                                </div>

                                <div
                                    style="
                                        font-size:0.6rem;
                                        color:var(--text-muted);
                                    "
                                >
                                    @${handleSeguro}
                                    ${
                                        online
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
                                                background:rgba(0,214,143,0.1);
                                                padding:2px 10px;
                                                border-radius:12px;
                                            "
                                        >
                                            ✓ Contacto
                                        </span>
                                    `
                                    : `
                                        <button
                                            type="button"
                                            onclick="agregarContacto('${idSeguro}')"
                                            style="
                                                background:linear-gradient(
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

            container.innerHTML = `
                <div
                    style="
                        padding:20px;
                        text-align:center;
                        color:var(--danger);
                        font-size:0.75rem;
                    "
                >
                    Error al buscar usuarios
                </div>
            `;
        }
    }

    // ============================================================
    // AGREGAR CONTACTO
    // ============================================================

    async function agregarContacto(contactoId) {
        try {
            const client = sb();

            const session =
                await getSession();

            if (!client || !session) {
                showToast(
                    '⚠️ Inicia sesión',
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

            const {
                data: existe,
                error: errorExiste
            } = await client
                .from('contactos')
                .select('id')
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
                showToast(
                    '⚠️ Ya es tu contacto',
                    'warning'
                );
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

            const resultados =
                document.getElementById(
                    'resultadosBusqueda'
                );

            if (input) {
                input.value = '';
            }

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
                '❌ Error al agregar contacto',
                'error'
            );
        }
    }

    // ============================================================
    // BLOQUEAR
    // ============================================================

    async function bloquearContacto(contactoId) {
        if (
            !confirm(
                '¿Bloquear a este usuario?'
            )
        ) {
            return;
        }

        try {
            const client = sb();

            const session =
                await getSession();

            if (!client || !session) {
                showToast(
                    '⚠️ Inicia sesión',
                    'error'
                );
                return;
            }

            const {
                data: bloqueadoExistente,
                error: errorExistente
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

            if (errorExistente) {
                throw errorExistente;
            }

            if (!bloqueadoExistente) {
                const {
                    error
                } = await client
                    .from('bloqueos')
                    .insert({
                        usuario_id:
                            session.user.id,

                        bloqueado_id:
                            contactoId
                    });

                if (error) {
                    throw error;
                }
            }

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
                        contacto._id !==
                        contactoId
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
                '❌ Error al bloquear',
                'error'
            );
        }
    }

    // ============================================================
    // MENSAJES
    // ============================================================

    function irAMensajes(contactoId) {
        if (!contactoId) return;

        window.location.href =
            `/features/mensajes/mensajes.html?contacto=${encodeURIComponent(
                contactoId
            )}`;
    }

    // ============================================================
    // FAVORITO
    // ============================================================

    async function toggleFavorito(contactoId) {
        try {
            const client = sb();

            const session =
                await getSession();

            if (!client || !session) {
                showToast(
                    '⚠️ Inicia sesión',
                    'error'
                );
                return;
            }

            const contacto =
                contactos.find(
                    c => c._id === contactoId
                );

            if (!contacto) return;

            const nuevoEstado =
                !contacto.esFavorito;

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

    // ============================================================
    // ELIMINAR
    // ============================================================

    async function eliminarContacto(contactoId) {
        if (
            !confirm(
                '¿Eliminar este contacto?'
            )
        ) {
            return;
        }

        try {
            const client = sb();

            const session =
                await getSession();

            if (!client || !session) {
                showToast(
                    '⚠️ Inicia sesión',
                    'error'
                );
                return;
            }

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
                        contacto._id !==
                        contactoId
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

    // ============================================================
    // INVITACIÓN
    // ============================================================

    async function invitarContacto() {
        try {
            const client = sb();

            const session =
                await getSession();

            if (!client || !session) {
                showToast(
                    '⚠️ Inicia sesión',
                    'error'
                );
                return;
            }

            const codigo =
                'SAR-' +
                Math.random()
                    .toString(36)
                    .substring(2, 8)
                    .toUpperCase();

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
                        true
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
                    data?.codigo ||
                    codigo;

                modal.classList.add(
                    'show'
                );

                modal.style.display =
                    'flex';

                modal.setAttribute(
                    'aria-hidden',
                    'false'
                );
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

    // ============================================================
    // MODAL INVITACIÓN
    // ============================================================

    function cerrarModalInvitacion() {
        const modal =
            document.getElementById(
                'modalInvitacion'
            );

        if (!modal) return;

        modal.classList.remove('show');

        modal.style.display = 'none';

        modal.setAttribute(
            'aria-hidden',
            'true'
        );
    }

    // ============================================================
    // COPIAR INVITACIÓN
    // ============================================================

    async function copiarCodigoInvitacion() {
        const elemento =
            document.getElementById(
                'codigoInvitacion'
            );

        const codigo =
            elemento?.textContent?.trim();

        if (!codigo) return;

        const texto =
            `◈ Únete a Sariel's con mi código: ${codigo}`;

        try {
            if (
                navigator.clipboard &&
                navigator.clipboard.writeText
            ) {
                await navigator.clipboard.writeText(
                    texto
                );

                showToast(
                    '📋 Código copiado',
                    'success'
                );

                return;
            }

            throw new Error(
                'Clipboard no disponible'
            );

        } catch (error) {
            window.prompt(
                'Copia este código:',
                codigo
            );
        }
    }

    // ============================================================
    // ORDENAR
    // ============================================================

    function ordenarContactos(criterio) {
        if (criterio === 'nombre') {
            contactos.sort(
                (a, b) =>
                    (
                        a.nombre || ''
                    ).localeCompare(
                        b.nombre || '',
                        'es',
                        {
                            sensitivity:
                                'base'
                        }
                    )
            );
        }

        if (criterio === 'online') {
            contactos.sort(
                (a, b) =>
                    Number(
                        b.online
                    ) -
                    Number(
                        a.online
                    )
            );
        }

        if (criterio === 'reciente') {
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
        }

        aplicarFiltros();
    }

    // ============================================================
    // MODAL BUSCAR
    // ============================================================

    function abrirAgregarContacto() {
        const modal =
            document.getElementById(
                'modalBuscarContacto'
            );

        if (!modal) return;

        modal.classList.add('show');

        modal.style.display = 'flex';

        modal.setAttribute(
            'aria-hidden',
            'false'
        );

        setTimeout(() => {
            const input =
                document.getElementById(
                    'searchInputModal'
                );

            if (input) {
                input.focus();
            }
        }, 150);
    }

    function cerrarModalBuscar() {
        const modal =
            document.getElementById(
                'modalBuscarContacto'
            );

        if (modal) {
            modal.classList.remove(
                'show'
            );

            modal.style.display = 'none';

            modal.setAttribute(
                'aria-hidden',
                'true'
            );
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

    // ============================================================
    // LIMPIEZA
    // ============================================================

    function limpiarRecursosContactos() {
        detenerRealtime();
    }

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================

    async function inicializarContactos() {
        console.log(
            "◈ Sariel's - Contactos"
        );

        let intentos = 0;

        while (
            !clienteDisponible() &&
            intentos < 40
        ) {
            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        250
                    )
            );

            intentos++;
        }

        if (!clienteDisponible()) {
            console.error(
                '❌ Supabase no estuvo disponible.'
            );

            mostrarErrorContactos();

            return;
        }

        console.log(
            '✅ Cliente Supabase disponible'
        );

        const autenticado =
            await verificarAutenticacion();

        if (!autenticado) {
            return;
        }

        await actualizarOnline(true);

        await cargarContactos();

        window.addEventListener(
            'beforeunload',
            () => {
                actualizarOnline(false);
                limpiarRecursosContactos();
            },
            {
                once: true
            }
        );
    }

    // ============================================================
    // DOM READY
    // ============================================================

    function iniciarDOM() {
        const filtros =
            document.querySelectorAll(
                '.filtro'
            );

        filtros.forEach(boton => {
            boton.addEventListener(
                'click',
                function () {
                    filtros.forEach(
                        b =>
                            b.classList.remove(
                                'active'
                            )
                    );

                    this.classList.add(
                        'active'
                    );

                    filtroActual =
                        this.getAttribute(
                            'data-filtro'
                        ) || 'todos';

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
                        'todos'
                    ) {
                        ordenarContactos(
                            'nombre'
                        );
                    } else {
                        aplicarFiltros();
                    }
                }
            );
        });

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

        const searchModal =
            document.getElementById(
                'searchInputModal'
            );

        if (searchModal) {
            let timeout;

            searchModal.addEventListener(
                'input',
                function () {
                    clearTimeout(timeout);

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

        inicializarContactos();
    }

    // ============================================================
    // EXPORTACIONES
    // ============================================================

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

    // ============================================================
    // ARRANQUE
    // ============================================================

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            iniciarDOM,
            {
                once: true
            }
        );
    } else {
        iniciarDOM();
    }

})();