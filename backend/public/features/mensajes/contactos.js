/* ============================================================
   contactos.js
   Sariel's Ecosystem · Contactos

   PRODUCCIÓN

   Tablas utilizadas:
   - public.contactos
   - public.usuarios
   - public.invitaciones
   - public.bloqueos

   NO utiliza:
   - solicitudes_amistad
   - amigos
   - seguidores

   Seguridad:
   - Supabase Auth
   - RLS
   - Sin onclick dinámicos con datos de DB
   - Búsqueda mediante ilike parametrizado
   - Bloqueo mediante RPC transaccional
   - Invitaciones mediante RPC
   ============================================================ */

(() => {
    'use strict';

    const CONTACTOS_TABLE = 'contactos';
    const USUARIOS_TABLE = 'usuarios';
    const INVITACIONES_TABLE = 'invitaciones';
    const BLOQUEOS_TABLE = 'bloqueos';

    const RPC_BLOQUEAR_CONTACTO = 'bloquear_contacto';
    const RPC_INVITACION = 'obtener_o_crear_invitacion';

    const MAX_RESULTADOS_BUSQUEDA = 20;
    const MIN_CARACTERES_BUSQUEDA = 2;
    const MAX_CARACTERES_BUSQUEDA = 80;

    let contactos = [];
    let filtroActual = 'todos';
    let textoBusqueda = '';
    let initialized = false;
    let busquedaTimer = null;

    /* ============================================================
       SUPABASE
       ============================================================ */

    function sb() {
        if (
            window.supabaseClient &&
            typeof window.supabaseClient.from === 'function'
        ) {
            return window.supabaseClient;
        }

        if (
            window.supabase &&
            typeof window.supabase.from === 'function'
        ) {
            return window.supabase;
        }

        return null;
    }

    async function getSession() {
        const client = sb();

        if (!client || !client.auth) {
            return null;
        }

        try {
            const { data, error } =
                await client.auth.getSession();

            if (error) {
                console.error(
                    'Error obteniendo sesión:',
                    error
                );

                return null;
            }

            return data?.session || null;

        } catch (error) {
            console.error(
                'Excepción obteniendo sesión:',
                error
            );

            return null;
        }
    }

    /* ============================================================
       TOAST
       ============================================================ */

    function showToast(mensaje, tipo = '') {
        const toast =
            document.getElementById('toast');

        if (!toast) {
            console.log(mensaje);
            return;
        }

        toast.textContent = String(mensaje ?? '');
        toast.className = 'toast';

        if (tipo) {
            toast.classList.add(tipo);
        }

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        clearTimeout(
            window.__contactosToastTimer
        );

        window.__contactosToastTimer =
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3500);
    }

    window.showToast = showToast;

    /* ============================================================
       ESCAPE HTML
       ============================================================ */

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /* ============================================================
       NORMALIZACIÓN DE TEXTO
       ============================================================ */

    function normalizarTextoBusqueda(value) {
        return String(value ?? '')
            .replace(/\u0000/g, '')
            .trim()
            .slice(
                0,
                MAX_CARACTERES_BUSQUEDA
            );
    }

    /* ============================================================
       URL DE AVATAR SEGURA
       ============================================================ */

    function obtenerAvatarSeguro(url) {
        if (!url) {
            return '';
        }

        const valor =
            String(url).trim();

        if (!valor) {
            return '';
        }

        try {
            /*
             * Permitimos URLs HTTP/HTTPS y rutas relativas.
             * Se rechazan javascript:, data:, etc.
             */

            if (
                valor.startsWith('/') &&
                !valor.startsWith('//')
            ) {
                return valor;
            }

            const parsed =
                new URL(
                    valor,
                    window.location.origin
                );

            if (
                parsed.protocol !== 'http:' &&
                parsed.protocol !== 'https:'
            ) {
                return '';
            }

            return parsed.href;

        } catch {
            return '';
        }
    }

    /* ============================================================
       INICIALIZACIÓN
       ============================================================ */

    async function inicializarContactos() {
        if (initialized) {
            return;
        }

        initialized = true;

        configurarEventos();

        const session =
            await getSession();

        if (!session) {
            mostrarEstadoVacio(
                '◈',
                'Inicia sesión para ver tus contactos.'
            );

            actualizarEstadisticas([]);

            return;
        }

        await cargarContactos();
    }

    /* ============================================================
       EVENTOS
       ============================================================ */

    function configurarEventos() {
        const searchInput =
            document.getElementById(
                'searchInput'
            );

        if (searchInput) {
            searchInput.addEventListener(
                'input',
                () => {
                    textoBusqueda =
                        searchInput.value
                            .trim()
                            .toLowerCase();

                    renderizarContactos();
                }
            );
        }

        document
            .querySelectorAll(
                '.filtros .filtro'
            )
            .forEach((boton) => {
                boton.addEventListener(
                    'click',
                    () => {
                        document
                            .querySelectorAll(
                                '.filtros .filtro'
                            )
                            .forEach(
                                (item) => {
                                    item.classList.remove(
                                        'active'
                                    );
                                }
                            );

                        boton.classList.add(
                            'active'
                        );

                        filtroActual =
                            boton.dataset.filtro ||
                            'todos';

                        renderizarContactos();
                    }
                );
            });

        const modalInput =
            document.getElementById(
                'searchInputModal'
            );

        if (modalInput) {
            modalInput.addEventListener(
                'input',
                () => {
                    clearTimeout(
                        busquedaTimer
                    );

                    const texto =
                        normalizarTextoBusqueda(
                            modalInput.value
                        );

                    if (
                        texto.length <
                        MIN_CARACTERES_BUSQUEDA
                    ) {
                        mostrarMensajeBusqueda(
                            'Escribe al menos 2 caracteres para buscar'
                        );

                        return;
                    }

                    busquedaTimer =
                        setTimeout(
                            () => {
                                buscarUsuarios(
                                    texto
                                );
                            },
                            300
                        );
                }
            );
        }

        /*
         * Event delegation para botones de contactos.
         * No se utiliza onclick="" con datos provenientes
         * de Supabase.
         */

        const lista =
            document.getElementById(
                'contactosList'
            );

        if (lista) {
            lista.addEventListener(
                'click',
                manejarClickListaContactos
            );
        }

        /*
         * Event delegation para resultados de búsqueda.
         */

        const resultados =
            document.getElementById(
                'resultadosBusqueda'
            );

        if (resultados) {
            resultados.addEventListener(
                'click',
                manejarClickResultadosBusqueda
            );
        }

        document.addEventListener(
            'keydown',
            (event) => {
                if (event.key === 'Escape') {
                    cerrarModalBuscar();
                    cerrarModalInvitacion();
                }
            }
        );

        /*
         * Cierre de modales haciendo click en el fondo.
         */

        document.addEventListener(
            'click',
            (event) => {
                const buscar =
                    document.getElementById(
                        'modalBuscarContacto'
                    );

                const invitacion =
                    document.getElementById(
                        'modalInvitacion'
                    );

                if (
                    buscar &&
                    event.target === buscar
                ) {
                    cerrarModalBuscar();
                }

                if (
                    invitacion &&
                    event.target === invitacion
                ) {
                    cerrarModalInvitacion();
                }
            }
        );
    }

    /* ============================================================
       EVENT DELEGATION — CONTACTOS
       ============================================================ */

    function manejarClickListaContactos(event) {
        const boton =
            event.target.closest(
                'button[data-action]'
            );

        if (!boton) {
            return;
        }

        const accion =
            boton.dataset.action;

        const id =
            boton.dataset.id || '';

        if (accion === 'mensaje') {
            abrirMensaje(id);
            return;
        }

        if (accion === 'favorito') {
            toggleFavorito(
                id,
                boton.dataset.value === 'true'
            );

            return;
        }

        if (accion === 'bloquear') {
            bloquearContacto(id);
            return;
        }

        if (accion === 'eliminar') {
            eliminarContacto(id);
        }
    }

    /* ============================================================
       EVENT DELEGATION — RESULTADOS
       ============================================================ */

    function manejarClickResultadosBusqueda(
        event
    ) {
        const boton =
            event.target.closest(
                'button[data-action="agregar"]'
            );

        if (!boton) {
            return;
        }

        const usuarioId =
            boton.dataset.usuarioId || '';

        agregarContacto(usuarioId);
    }

    /* ============================================================
       CARGAR CONTACTOS
       ============================================================ */

    async function cargarContactos() {
        const client = sb();
        const session =
            await getSession();

        if (!client || !session) {
            mostrarEstadoVacio(
                '◈',
                'Inicia sesión para ver tus contactos.'
            );

            actualizarEstadisticas([]);

            return;
        }

        mostrarCargando();

        try {
            const { data, error } =
                await client
                    .from(CONTACTOS_TABLE)
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
                            username,
                            avatar_url,
                            online,
                            ultima_conexion,
                            verificado
                        )
                    `)
                    .eq(
                        'usuario_id',
                        session.user.id
                    )
                    .order(
                        'fecha',
                        {
                            ascending: false
                        }
                    );

            if (error) {
                throw error;
            }

            contactos =
                Array.isArray(data)
                    ? data
                    : [];

            actualizarEstadisticas(
                contactos
            );

            renderizarContactos();

        } catch (error) {
            console.error(
                'Error cargando contactos:',
                error
            );

            contactos = [];

            actualizarEstadisticas([]);

            mostrarEstadoVacio(
                '⚠️',
                'No se pudieron cargar los contactos.'
            );

            showToast(
                '❌ Error al cargar contactos',
                'error'
            );
        }
    }

    window.cargarContactos =
        cargarContactos;

    /* ============================================================
       NORMALIZAR CONTACTO
       ============================================================ */

    function normalizarContacto(item) {
        const usuario =
            item?.contacto || {};

        const nombre =
            usuario.nombre ||
            usuario.username ||
            usuario.handle ||
            'Usuario';

        const handle =
            usuario.handle ||
            usuario.username ||
            '';

        return {
            id: item?.id || null,

            contacto_id:
                item?.contacto_id || null,

            nombre:
                String(nombre),

            handle:
                String(handle),

            avatar_url:
                obtenerAvatarSeguro(
                    usuario.avatar_url
                ),

            online:
                usuario.online === true,

            verificado:
                usuario.verificado === true,

            es_favorito:
                item?.es_favorito === true,

            estado:
                item?.estado || 'activo',

            fecha:
                item?.fecha ||
                item?.created_at ||
                null,

            ultima_conexion:
                usuario.ultima_conexion ||
                null
        };
    }

    /* ============================================================
       RENDER
       ============================================================ */

    function renderizarContactos() {
        const lista =
            document.getElementById(
                'contactosList'
            );

        if (!lista) {
            return;
        }

        let listaContactos =
            contactos.map(
                normalizarContacto
            );

        if (
            filtroActual ===
            'online'
        ) {
            listaContactos =
                listaContactos.filter(
                    (contacto) =>
                        contacto.online
                );
        }

        if (
            filtroActual ===
            'favoritos'
        ) {
            listaContactos =
                listaContactos.filter(
                    (contacto) =>
                        contacto.es_favorito
                );
        }

        if (
            filtroActual ===
            'recientes'
        ) {
            listaContactos =
                listaContactos
                    .filter(
                        (contacto) =>
                            contacto.fecha
                    )
                    .sort(
                        (a, b) => {
                            const fechaA =
                                new Date(
                                    a.fecha
                                ).getTime();

                            const fechaB =
                                new Date(
                                    b.fecha
                                ).getTime();

                            return (
                                fechaB -
                                fechaA
                            );
                        }
                    )
                    .slice(0, 10);
        }

        if (textoBusqueda) {
            listaContactos =
                listaContactos.filter(
                    (contacto) => {
                        const nombre =
                            contacto.nombre
                                .toLowerCase();

                        const handle =
                            contacto.handle
                                .toLowerCase();

                        return (
                            nombre.includes(
                                textoBusqueda
                            ) ||
                            handle.includes(
                                textoBusqueda
                            )
                        );
                    }
                );
        }

        if (!listaContactos.length) {
            mostrarEstadoVacio(
                '◈',
                textoBusqueda
                    ? 'No se encontraron contactos.'
                    : 'No hay contactos para este filtro.'
            );

            return;
        }

        lista.innerHTML =
            listaContactos
                .map(
                    renderizarTarjeta
                )
                .join('');
    }

    function renderizarTarjeta(
        contacto
    ) {
        const inicial =
            escapeHtml(
                (
                    contacto.nombre ||
                    'U'
                )
                    .charAt(0)
                    .toUpperCase()
            );

        const avatar =
            contacto.avatar_url
                ? `
                    <img
                        src="${escapeHtml(contacto.avatar_url)}"
                        alt="${escapeHtml(contacto.nombre)}"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        onerror="this.remove();"
                    >
                `
                : inicial;

        let estadoTexto =
            'Desconectado';

        if (
            contacto.estado ===
            'pendiente'
        ) {
            estadoTexto =
                'Pendiente';
        } else if (
            contacto.online
        ) {
            estadoTexto =
                'En línea';
        }

        const handleTexto =
            contacto.handle
                ? `@${String(
                      contacto.handle
                  ).replace(
                      /^@/,
                      ''
                  )}`
                : '';

        const favorito =
            contacto.es_favorito
                ? 'active'
                : '';

        const verificado =
            contacto.verificado
                ? `<span class="verified">✓ Verificado</span>`
                : '';

        const favoritoNuevo =
            contacto.es_favorito
                ? 'false'
                : 'true';

        return `
            <article
                class="contacto-card"
                data-contacto-id="${escapeHtml(contacto.contacto_id)}"
            >

                <div
                    class="contacto-avatar ${
                        contacto.online
                            ? 'online'
                            : ''
                    }"
                >
                    ${avatar}

                    ${
                        contacto.online
                            ? '<span class="online-dot"></span>'
                            : ''
                    }

                    ${
                        contacto.es_favorito
                            ? '<span class="favorito-badge">◆</span>'
                            : ''
                    }
                </div>

                <div class="contacto-info">

                    <div class="nombre">
                        ${escapeHtml(
                            contacto.nombre
                        )}
                        ${verificado}
                    </div>

                    <div
                        class="estado ${
                            contacto.online
                                ? 'online'
                                : ''
                        }"
                    >
                        ${escapeHtml(
                            estadoTexto
                        )}
                    </div>

                    ${
                        handleTexto
                            ? `
                                <div class="contacto-meta">
                                    ${escapeHtml(
                                        handleTexto
                                    )}
                                </div>
                            `
                            : ''
                    }

                </div>

                <div class="contacto-actions">

                    <button
                        type="button"
                        class="mensaje"
                        title="Enviar mensaje"
                        aria-label="Enviar mensaje"
                        data-action="mensaje"
                        data-id="${escapeHtml(
                            contacto.contacto_id
                        )}"
                    >
                        ◈
                    </button>

                    <button
                        type="button"
                        class="favorito ${favorito}"
                        title="${
                            contacto.es_favorito
                                ? 'Quitar de favoritos'
                                : 'Agregar a favoritos'
                        }"
                        aria-label="${
                            contacto.es_favorito
                                ? 'Quitar de favoritos'
                                : 'Agregar a favoritos'
                        }"
                        data-action="favorito"
                        data-id="${escapeHtml(
                            contacto.id
                        )}"
                        data-value="${favoritoNuevo}"
                    >
                        ◆
                    </button>

                    <button
                        type="button"
                        class="bloquear"
                        title="Bloquear"
                        aria-label="Bloquear"
                        data-action="bloquear"
                        data-id="${escapeHtml(
                            contacto.contacto_id
                        )}"
                    >
                        ⛔
                    </button>

                    <button
                        type="button"
                        class="eliminar"
                        title="Eliminar contacto"
                        aria-label="Eliminar contacto"
                        data-action="eliminar"
                        data-id="${escapeHtml(
                            contacto.id
                        )}"
                    >
                        ✕
                    </button>

                </div>

            </article>
        `;
    }

    /* ============================================================
       ESTADOS VISUALES
       ============================================================ */

    function mostrarCargando() {
        const lista =
            document.getElementById(
                'contactosList'
            );

        if (!lista) {
            return;
        }

        lista.innerHTML = `
            <div class="empty-state">
                <span class="icon">◈</span>
                <h3>Cargando contactos...</h3>
            </div>
        `;
    }

    function mostrarEstadoVacio(
        icono,
        mensaje
    ) {
        const lista =
            document.getElementById(
                'contactosList'
            );

        if (!lista) {
            return;
        }

        lista.innerHTML = `
            <div class="empty-state">

                <span class="icon">
                    ${escapeHtml(icono)}
                </span>

                <h3>
                    ${escapeHtml(mensaje)}
                </h3>

                ${
                    !contactos.length
                        ? `
                            <button
                                type="button"
                                class="btn-accion"
                                data-contactos-action="agregar"
                            >
                                ◆ Agregar contacto
                            </button>
                        `
                        : ''
                }

            </div>
        `;

        const boton =
            lista.querySelector(
                '[data-contactos-action="agregar"]'
            );

        if (boton) {
            boton.addEventListener(
                'click',
                abrirAgregarContacto,
                {
                    once: true
                }
            );
        }
    }

    /* ============================================================
       ESTADÍSTICAS
       ============================================================ */

    function actualizarEstadisticas(
        lista
    ) {
        const total =
            document.getElementById(
                'totalContactos'
            );

        const online =
            document.getElementById(
                'onlineContactos'
            );

        if (total) {
            total.textContent =
                String(
                    Array.isArray(lista)
                        ? lista.length
                        : 0
                );
        }

        if (online) {
            online.textContent =
                String(
                    Array.isArray(lista)
                        ? lista.filter(
                              (item) =>
                                  item?.contacto
                                      ?.online ===
                                  true
                          ).length
                        : 0
                );
        }
    }

    /* ============================================================
       MODAL AGREGAR
       ============================================================ */

    function abrirAgregarContacto() {
        const modal =
            document.getElementById(
                'modalBuscarContacto'
            );

        if (!modal) {
            return;
        }

        modal.classList.add('show');

        modal.setAttribute(
            'aria-hidden',
            'false'
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

            clearTimeout(
                busquedaTimer
            );

            setTimeout(() => {
                input.focus();
            }, 100);
        }

        if (resultados) {
            resultados.innerHTML = `
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
        }
    }

    window.abrirAgregarContacto =
        abrirAgregarContacto;

    function cerrarModalBuscar() {
        const modal =
            document.getElementById(
                'modalBuscarContacto'
            );

        if (!modal) {
            return;
        }

        modal.classList.remove(
            'show'
        );

        modal.setAttribute(
            'aria-hidden',
            'true'
        );
    }

    window.cerrarModalBuscar =
        cerrarModalBuscar;

    /* ============================================================
       BUSCAR USUARIOS
       ============================================================ */

    async function buscarUsuarios(
        texto
    ) {
        const client = sb();

        const session =
            await getSession();

        if (!client || !session) {
            mostrarMensajeBusqueda(
                'Inicia sesión para buscar contactos.'
            );

            return;
        }

        const termino =
            normalizarTextoBusqueda(
                texto
            )
                .replace(
                    /^@+/,
                    ''
                )
                .trim();

        if (
            termino.length <
            MIN_CARACTERES_BUSQUEDA
        ) {
            mostrarMensajeBusqueda(
                'Escribe al menos 2 caracteres para buscar'
            );

            return;
        }

        try {
            /*
             * Se hacen tres búsquedas independientes.
             *
             * Esto evita construir manualmente una expresión
             * .or() con texto introducido por el usuario.
             */

            const patron =
                `%${termino}%`;

            const [
                resultadoNombre,
                resultadoHandle,
                resultadoUsername
            ] =
                await Promise.all([
                    client
                        .from(
                            USUARIOS_TABLE
                        )
                        .select(`
                            id,
                            nombre,
                            handle,
                            username,
                            avatar_url,
                            online,
                            verificado
                        `)
                        .neq(
                            'id',
                            session.user.id
                        )
                        .ilike(
                            'nombre',
                            patron
                        )
                        .limit(
                            MAX_RESULTADOS_BUSQUEDA
                        ),

                    client
                        .from(
                            USUARIOS_TABLE
                        )
                        .select(`
                            id,
                            nombre,
                            handle,
                            username,
                            avatar_url,
                            online,
                            verificado
                        `)
                        .neq(
                            'id',
                            session.user.id
                        )
                        .ilike(
                            'handle',
                            patron
                        )
                        .limit(
                            MAX_RESULTADOS_BUSQUEDA
                        ),

                    client
                        .from(
                            USUARIOS_TABLE
                        )
                        .select(`
                            id,
                            nombre,
                            handle,
                            username,
                            avatar_url,
                            online,
                            verificado
                        `)
                        .neq(
                            'id',
                            session.user.id
                        )
                        .ilike(
                            'username',
                            patron
                        )
                        .limit(
                            MAX_RESULTADOS_BUSQUEDA
                        )
                ]);

            const errores = [
                resultadoNombre.error,
                resultadoHandle.error,
                resultadoUsername.error
            ].filter(Boolean);

            if (errores.length) {
                throw errores[0];
            }

            const mapa =
                new Map();

            [
                ...(resultadoNombre.data || []),
                ...(resultadoHandle.data || []),
                ...(resultadoUsername.data || [])
            ].forEach(
                (usuario) => {
                    if (
                        usuario?.id &&
                        !mapa.has(
                            usuario.id
                        )
                    ) {
                        mapa.set(
                            usuario.id,
                            usuario
                        );
                    }
                }
            );

            const usuarios =
                Array.from(
                    mapa.values()
                ).slice(
                    0,
                    MAX_RESULTADOS_BUSQUEDA
                );

            if (!usuarios.length) {
                mostrarMensajeBusqueda(
                    'No se encontraron usuarios.'
                );

                return;
            }

            /*
             * Evitar mostrar usuarios que ya son contactos.
             */

            const idsContactos =
                new Set(
                    contactos
                        .map(
                            (item) =>
                                item?.contacto_id
                        )
                        .filter(Boolean)
                );

            /*
             * También evitamos usuarios bloqueados.
             */

            let idsBloqueados =
                new Set();

            try {
                const {
                    data: bloqueados,
                    error:
                        errorBloqueados
                } =
                    await client
                        .from(
                            BLOQUEOS_TABLE
                        )
                        .select(
                            'bloqueado_id'
                        )
                        .eq(
                            'usuario_id',
                            session.user.id
                        );

                if (
                    !errorBloqueados &&
                    Array.isArray(
                        bloqueados
                    )
                ) {
                    idsBloqueados =
                        new Set(
                            bloqueados
                                .map(
                                    (item) =>
                                        item?.bloqueado_id
                                )
                                .filter(
                                    Boolean
                                )
                        );
                }

            } catch (
                errorBloqueados
            ) {
                /*
                 * Si la consulta de bloqueos falla,
                 * no mostramos error global de búsqueda.
                 * RLS sigue siendo la autoridad.
                 */

                console.warn(
                    'No se pudieron consultar bloqueos:',
                    errorBloqueados
                );
            }

            const disponibles =
                usuarios.filter(
                    (usuario) =>
                        !idsContactos.has(
                            usuario.id
                        ) &&
                        !idsBloqueados.has(
                            usuario.id
                        )
                );

            if (!disponibles.length) {
                mostrarMensajeBusqueda(
                    'Los usuarios encontrados ya están en tus contactos o están bloqueados.'
                );

                return;
            }

            renderizarResultadosBusqueda(
                disponibles
            );

        } catch (error) {
            console.error(
                'Error buscando usuarios:',
                error
            );

            mostrarMensajeBusqueda(
                'No fue posible realizar la búsqueda.'
            );
        }
    }

    function renderizarResultadosBusqueda(
        usuarios
    ) {
        const contenedor =
            document.getElementById(
                'resultadosBusqueda'
            );

        if (!contenedor) {
            return;
        }

        contenedor.innerHTML =
            usuarios
                .map(
                    (usuario) => {
                        const inicial =
                            (
                                usuario.nombre ||
                                usuario.username ||
                                usuario.handle ||
                                'U'
                            )
                                .charAt(0)
                                .toUpperCase();

                        const avatarUrl =
                            obtenerAvatarSeguro(
                                usuario.avatar_url
                            );

                        const avatar =
                            avatarUrl
                                ? `
                                    <img
                                        src="${escapeHtml(avatarUrl)}"
                                        alt=""
                                        loading="lazy"
                                        referrerpolicy="no-referrer"
                                        style="
                                            width:40px;
                                            height:40px;
                                            border-radius:50%;
                                            object-fit:cover;
                                        "
                                    >
                                `
                                : `
                                    <div
                                        style="
                                            width:40px;
                                            height:40px;
                                            border-radius:50%;
                                            display:flex;
                                            align-items:center;
                                            justify-content:center;
                                            background:linear-gradient(
                                                135deg,
                                                var(--green-deep),
                                                var(--gold)
                                            );
                                            color:white;
                                        "
                                    >
                                        ${escapeHtml(
                                            inicial
                                        )}
                                    </div>
                                `;

                        const nombre =
                            usuario.nombre ||
                            usuario.username ||
                            usuario.handle ||
                            'Usuario';

                        const handle =
                            usuario.handle ||
                            usuario.username ||
                            '';

                        return `
                            <div
                                style="
                                    display:flex;
                                    align-items:center;
                                    gap:10px;
                                    padding:10px;
                                    border-bottom:1px solid var(--glass-border);
                                "
                            >

                                ${avatar}

                                <div
                                    style="
                                        flex:1;
                                        min-width:0;
                                    "
                                >

                                    <div
                                        style="
                                            font-weight:600;
                                            color:var(--text-primary);
                                        "
                                    >
                                        ${escapeHtml(
                                            nombre
                                        )}

                                        ${
                                            usuario.verificado
                                                ? `
                                                    <span
                                                        style="
                                                            color:var(--gold);
                                                            font-size:0.6rem;
                                                        "
                                                    >
                                                        ✓
                                                    </span>
                                                `
                                                : ''
                                        }
                                    </div>

                                    ${
                                        handle
                                            ? `
                                                <div
                                                    style="
                                                        color:var(--text-muted);
                                                        font-size:0.65rem;
                                                    "
                                                >
                                                    @${escapeHtml(
                                                        String(
                                                            handle
                                                        ).replace(
                                                            /^@/,
                                                            ''
                                                        )
                                                    )}
                                                </div>
                                            `
                                            : ''
                                    }

                                </div>

                                <button
                                    type="button"
                                    class="btn-agregar"
                                    data-action="agregar"
                                    data-usuario-id="${escapeHtml(
                                        usuario.id
                                    )}"
                                    style="
                                        padding:7px 12px;
                                        font-size:0.65rem;
                                    "
                                >
                                    ◆ Agregar
                                </button>

                            </div>
                        `;
                    }
                )
                .join('');
    }

    function mostrarMensajeBusqueda(
        mensaje
    ) {
        const contenedor =
            document.getElementById(
                'resultadosBusqueda'
            );

        if (!contenedor) {
            return;
        }

        contenedor.innerHTML = `
            <div
                style="
                    padding:20px;
                    text-align:center;
                    color:var(--text-muted);
                    font-size:0.75rem;
                "
            >
                ${escapeHtml(mensaje)}
            </div>
        `;
    }

    /* ============================================================
       AGREGAR CONTACTO
       ============================================================ */

    async function agregarContacto(
        contactoId
    ) {
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

        if (!contactoId) {
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

        /*
         * Protección adicional de cliente.
         * La autorización real sigue estando en RLS.
         */

        const yaExiste =
            contactos.some(
                (item) =>
                    item?.contacto_id ===
                    contactoId
            );

        if (yaExiste) {
            showToast(
                '⚠️ Ya es tu contacto',
                'warning'
            );

            return;
        }

        try {
            const {
                data: existente,
                error:
                    errorExiste
            } =
                await client
                    .from(
                        CONTACTOS_TABLE
                    )
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

            if (existente) {
                showToast(
                    '⚠️ Ya es tu contacto',
                    'warning'
                );

                await cargarContactos();

                return;
            }

            const {
                error
            } =
                await client
                    .from(
                        CONTACTOS_TABLE
                    )
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
                if (
                    error.code ===
                    '23505'
                ) {
                    showToast(
                        '⚠️ Ya es tu contacto',
                        'warning'
                    );

                    await cargarContactos();

                    return;
                }

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
                resultados.innerHTML =
                    '';
            }

            cerrarModalBuscar();

            await cargarContactos();

        } catch (error) {
            console.error(
                'Error agregando contacto:',
                error
            );

            showToast(
                '❌ No se pudo agregar el contacto',
                'error'
            );
        }
    }

    window.agregarContacto =
        agregarContacto;

    /* ============================================================
       FAVORITO
       ============================================================ */

    async function toggleFavorito(
        contactoRowId,
        nuevoValor
    ) {
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

        if (!contactoRowId) {
            return;
        }

        try {
            const {
                error
            } =
                await client
                    .from(
                        CONTACTOS_TABLE
                    )
                    .update({
                        es_favorito:
                            nuevoValor ===
                            true
                    })
                    .eq(
                        'id',
                        contactoRowId
                    )
                    .eq(
                        'usuario_id',
                        session.user.id
                    );

            if (error) {
                throw error;
            }

            showToast(
                nuevoValor
                    ? '◆ Agregado a favoritos'
                    : '◇ Eliminado de favoritos',
                'success'
            );

            await cargarContactos();

        } catch (error) {
            console.error(
                'Error actualizando favorito:',
                error
            );

            showToast(
                '❌ No se pudo actualizar favorito',
                'error'
            );
        }
    }

    window.toggleFavorito =
        toggleFavorito;

    /* ============================================================
       ELIMINAR CONTACTO
       ============================================================ */

    async function eliminarContacto(
        contactoRowId
    ) {
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

        if (!contactoRowId) {
            return;
        }

        const confirmar =
            window.confirm(
                '¿Quieres eliminar este contacto?'
            );

        if (!confirmar) {
            return;
        }

        try {
            const {
                error
            } =
                await client
                    .from(
                        CONTACTOS_TABLE
                    )
                    .delete()
                    .eq(
                        'id',
                        contactoRowId
                    )
                    .eq(
                        'usuario_id',
                        session.user.id
                    );

            if (error) {
                throw error;
            }

            showToast(
                '✅ Contacto eliminado',
                'success'
            );

            await cargarContactos();

        } catch (error) {
            console.error(
                'Error eliminando contacto:',
                error
            );

            showToast(
                '❌ No se pudo eliminar el contacto',
                'error'
            );
        }
    }

    window.eliminarContacto =
        eliminarContacto;

    /* ============================================================
       BLOQUEAR CONTACTO
       ============================================================ */

    async function bloquearContacto(
        contactoId
    ) {
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

        if (!contactoId) {
            return;
        }

        if (
            contactoId ===
            session.user.id
        ) {
            showToast(
                '⚠️ No puedes bloquearte a ti mismo',
                'warning'
            );

            return;
        }

        const confirmar =
            window.confirm(
                '¿Quieres bloquear a este usuario?'
            );

        if (!confirmar) {
            return;
        }

        try {
            /*
             * Operación atómica en PostgreSQL:
             *
             * 1. INSERT bloqueos
             * 2. DELETE contactos
             *
             * Si una parte falla, toda la operación
             * se revierte.
             */

            const {
                data,
                error
            } =
                await client.rpc(
                    RPC_BLOQUEAR_CONTACTO,
                    {
                        p_contacto_id:
                            contactoId
                    }
                );

            if (error) {
                throw error;
            }

            if (
                data !== true &&
                data !== null
            ) {
                console.warn(
                    'Respuesta inesperada al bloquear:',
                    data
                );
            }

            showToast(
                '⛔ Usuario bloqueado',
                'success'
            );

            await cargarContactos();

        } catch (error) {
            console.error(
                'Error bloqueando contacto:',
                error
            );

            showToast(
                '❌ No se pudo bloquear al usuario',
                'error'
            );
        }
    }

    window.bloquearContacto =
        bloquearContacto;

    /* ============================================================
       ABRIR MENSAJE
       ============================================================ */

    function abrirMensaje(
        contactoId
    ) {
        if (!contactoId) {
            return;
        }

        const url =
            `/features/mensajes/mensajes.html?usuario=${encodeURIComponent(
                contactoId
            )}`;

        window.location.href =
            url;
    }

    window.abrirMensaje =
        abrirMensaje;

    /* ============================================================
       INVITACIONES
       ============================================================ */

    async function invitarContacto() {
        const client = sb();

        const session =
            await getSession();

        if (!client || !session) {
            showToast(
                '⚠️ Inicia sesión para invitar',
                'error'
            );

            return;
        }

        const modal =
            document.getElementById(
                'modalInvitacion'
            );

        const codigoElemento =
            document.getElementById(
                'codigoInvitacion'
            );

        if (modal) {
            modal.classList.add(
                'show'
            );

            modal.setAttribute(
                'aria-hidden',
                'false'
            );
        }

        if (codigoElemento) {
            codigoElemento.textContent =
                '⏳ Generando...';
        }

        try {
            /*
             * La generación se hace en PostgreSQL.
             *
             * No utilizamos Math.random().
             */

            const {
                data,
                error
            } =
                await client.rpc(
                    RPC_INVITACION
                );

            if (error) {
                throw error;
            }

            const invitacion =
                Array.isArray(data)
                    ? data[0]
                    : data;

            if (
                !invitacion?.codigo
            ) {
                throw new Error(
                    'Supabase no devolvió un código de invitación.'
                );
            }

            if (codigoElemento) {
                codigoElemento.textContent =
                    String(
                        invitacion.codigo
                    );
            }

        } catch (error) {
            console.error(
                'Error generando invitación:',
                error
            );

            if (codigoElemento) {
                codigoElemento.textContent =
                    'ERROR';
            }

            showToast(
                '❌ No se pudo generar la invitación',
                'error'
            );
        }
    }

    window.invitarContacto =
        invitarContacto;

    /* ============================================================
       COPIAR INVITACIÓN
       ============================================================ */

    async function copiarCodigoInvitacion() {
        const elemento =
            document.getElementById(
                'codigoInvitacion'
            );

        if (!elemento) {
            return;
        }

        const codigo =
            elemento.textContent.trim();

        if (
            !codigo ||
            codigo ===
                '⏳ Generando...' ||
            codigo === 'ERROR'
        ) {
            return;
        }

        try {
            if (
                navigator.clipboard &&
                typeof navigator
                    .clipboard
                    .writeText ===
                    'function'
            ) {
                await navigator.clipboard
                    .writeText(
                        codigo
                    );
            } else {
                /*
                 * Fallback para navegadores antiguos.
                 */

                const temporal =
                    document.createElement(
                        'textarea'
                    );

                temporal.value =
                    codigo;

                temporal.setAttribute(
                    'readonly',
                    ''
                );

                temporal.style.position =
                    'fixed';

                temporal.style.opacity =
                    '0';

                document.body.appendChild(
                    temporal
                );

                temporal.select();

                const correcto =
                    document.execCommand(
                        'copy'
                    );

                temporal.remove();

                if (!correcto) {
                    throw new Error(
                        'No se pudo copiar'
                    );
                }
            }

            showToast(
                '📋 Código copiado',
                'success'
            );

        } catch (error) {
            console.error(
                'Error copiando código:',
                error
            );

            showToast(
                '❌ No se pudo copiar el código',
                'error'
            );
        }
    }

    window.copiarCodigoInvitacion =
        copiarCodigoInvitacion;

    /* ============================================================
       CERRAR MODAL INVITACIÓN
       ============================================================ */

    function cerrarModalInvitacion() {
        const modal =
            document.getElementById(
                'modalInvitacion'
            );

        if (!modal) {
            return;
        }

        modal.classList.remove(
            'show'
        );

        modal.setAttribute(
            'aria-hidden',
            'true'
        );
    }

    window.cerrarModalInvitacion =
        cerrarModalInvitacion;

    /* ============================================================
       ARRANQUE
       ============================================================ */

    function esperarSupabase() {
        let intentos = 0;

        const timer =
            setInterval(
                async () => {
                    intentos++;

                    if (sb()) {
                        clearInterval(
                            timer
                        );

                        await inicializarContactos();

                        return;
                    }

                    if (
                        intentos >=
                        100
                    ) {
                        clearInterval(
                            timer
                        );

                        console.error(
                            '❌ Supabase no estuvo disponible.'
                        );

                        mostrarEstadoVacio(
                            '⚠️',
                            'No se pudo inicializar la conexión.'
                        );
                    }
                },
                100
            );
    }

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            esperarSupabase,
            {
                once: true
            }
        );
    } else {
        esperarSupabase();
    }

})();