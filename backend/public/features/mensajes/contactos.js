/* ============================================================
   contactos.js
   Sariel's Ecosystem · Contactos

   Tablas utilizadas:
   - public.contactos
   - public.usuarios
   - public.invitaciones
   - public.bloqueos

   NO utiliza:
   - solicitudes_amistad
   - amigos
   - seguidores
   - tablas inventadas
   ============================================================ */

(() => {
    'use strict';

    const CONTACTOS_TABLE = 'contactos';
    const USUARIOS_TABLE = 'usuarios';
    const INVITACIONES_TABLE = 'invitaciones';
    const BLOQUEOS_TABLE = 'bloqueos';

    let contactos = [];
    let filtroActual = 'todos';
    let textoBusqueda = '';
    let initialized = false;

    /* ============================================================
       SUPABASE
       ============================================================ */

    function sb() {
        if (window.supabaseClient) {
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

        const { data, error } = await client.auth.getSession();

        if (error) {
            console.error('Error obteniendo sesión:', error);
            return null;
        }

        return data?.session || null;
    }

    /* ============================================================
       TOAST
       ============================================================ */

    function showToast(mensaje, tipo = '') {
        const toast = document.getElementById('toast');

        if (!toast) {
            console.log(mensaje);
            return;
        }

        toast.textContent = mensaje;
        toast.className = 'toast';

        if (tipo) {
            toast.classList.add(tipo);
        }

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        clearTimeout(window.__contactosToastTimer);

        window.__contactosToastTimer = setTimeout(() => {
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
       INICIALIZACIÓN
       ============================================================ */

    async function inicializarContactos() {
        if (initialized) {
            return;
        }

        initialized = true;

        configurarEventos();

        const session = await getSession();

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
        const searchInput = document.getElementById('searchInput');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                textoBusqueda = searchInput.value.trim().toLowerCase();
                renderizarContactos();
            });
        }

        document
            .querySelectorAll('.filtros .filtro')
            .forEach((boton) => {
                boton.addEventListener('click', () => {
                    document
                        .querySelectorAll('.filtros .filtro')
                        .forEach((item) => {
                            item.classList.remove('active');
                        });

                    boton.classList.add('active');

                    filtroActual =
                        boton.dataset.filtro || 'todos';

                    renderizarContactos();
                });
            });

        const modalInput =
            document.getElementById('searchInputModal');

        if (modalInput) {
            let timer = null;

            modalInput.addEventListener('input', () => {
                clearTimeout(timer);

                const texto = modalInput.value.trim();

                if (texto.length < 2) {
                    mostrarMensajeBusqueda(
                        'Escribe al menos 2 caracteres para buscar'
                    );
                    return;
                }

                timer = setTimeout(() => {
                    buscarUsuarios(texto);
                }, 300);
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                cerrarModalBuscar();
                cerrarModalInvitacion();
            }
        });
    }

    /* ============================================================
       CARGAR CONTACTOS
       ============================================================ */

    async function cargarContactos() {
        const client = sb();
        const session = await getSession();

        if (!client || !session) {
            mostrarEstadoVacio(
                '◈',
                'Inicia sesión para ver tus contactos.'
            );
            return;
        }

        mostrarCargando();

        try {
            /*
             * La tabla contactos tiene:
             * usuario_id
             * contacto_id
             * es_favorito
             * estado
             * fecha
             * created_at
             */

            const { data, error } = await client
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
                .eq('usuario_id', session.user.id)
                .order('fecha', {
                    ascending: false
                });

            if (error) {
                throw error;
            }

            contactos = Array.isArray(data)
                ? data
                : [];

            actualizarEstadisticas(contactos);
            renderizarContactos();

        } catch (error) {
            console.error(
                'Error cargando contactos:',
                error
            );

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

    window.cargarContactos = cargarContactos;

    /* ============================================================
       NORMALIZAR CONTACTO
       ============================================================ */

    function normalizarContacto(item) {
        const usuario = item?.contacto || {};

        return {
            id: item?.id,
            contacto_id: item?.contacto_id,

            nombre:
                usuario.nombre ||
                usuario.username ||
                usuario.handle ||
                'Usuario',

            handle:
                usuario.handle ||
                usuario.username ||
                '',

            avatar_url:
                usuario.avatar_url || '',

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
                usuario.ultima_conexion || null
        };
    }

    /* ============================================================
       RENDER
       ============================================================ */

    function renderizarContactos() {
        const lista =
            document.getElementById('contactosList');

        if (!lista) {
            return;
        }

        let listaContactos =
            contactos.map(normalizarContacto);

        if (filtroActual === 'online') {
            listaContactos =
                listaContactos.filter(
                    (contacto) => contacto.online
                );
        }

        if (filtroActual === 'favoritos') {
            listaContactos =
                listaContactos.filter(
                    (contacto) =>
                        contacto.es_favorito
                );
        }

        if (filtroActual === 'recientes') {
            listaContactos =
                listaContactos
                    .filter((contacto) => contacto.fecha)
                    .sort((a, b) => {
                        return (
                            new Date(b.fecha) -
                            new Date(a.fecha)
                        );
                    })
                    .slice(0, 10);
        }

        if (textoBusqueda) {
            listaContactos =
                listaContactos.filter((contacto) => {
                    const nombre =
                        contacto.nombre.toLowerCase();

                    const handle =
                        contacto.handle.toLowerCase();

                    return (
                        nombre.includes(textoBusqueda) ||
                        handle.includes(textoBusqueda)
                    );
                });
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
                .map(renderizarTarjeta)
                .join('');
    }

    function renderizarTarjeta(contacto) {
        const inicial =
            escapeHtml(
                (contacto.nombre || 'U')
                    .charAt(0)
                    .toUpperCase()
            );

        const avatar = contacto.avatar_url
            ? `
                <img
                    src="${escapeHtml(contacto.avatar_url)}"
                    alt="${escapeHtml(contacto.nombre)}"
                    loading="lazy"
                    onerror="this.style.display='none';"
                >
            `
            : inicial;

        const estadoTexto = contacto.online
            ? 'En línea'
            : 'Desconectado';

        const handleTexto = contacto.handle
            ? `@${contacto.handle.replace(/^@/, '')}`
            : '';

        const favorito =
            contacto.es_favorito ? 'active' : '';

        const verificado =
            contacto.verificado
                ? `<span class="verified">✓ Verificado</span>`
                : '';

        return `
            <article
                class="contacto-card"
                data-contacto-id="${escapeHtml(contacto.contacto_id)}"
            >

                <div
                    class="contacto-avatar ${contacto.online ? 'online' : ''}"
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
                        ${escapeHtml(contacto.nombre)}
                        ${verificado}
                    </div>

                    <div
                        class="estado ${contacto.online ? 'online' : ''}"
                    >
                        ${estadoTexto}
                    </div>

                    ${
                        handleTexto
                            ? `
                                <div class="contacto-meta">
                                    ${escapeHtml(handleTexto)}
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
                        onclick="abrirMensaje('${escapeHtml(contacto.contacto_id)}')"
                    >
                        ◈
                    </button>

                    <button
                        type="button"
                        class="favorito ${favorito}"
                        title="Favorito"
                        aria-label="Favorito"
                        onclick="toggleFavorito('${escapeHtml(contacto.id)}', ${!contacto.es_favorito})"
                    >
                        ◆
                    </button>

                    <button
                        type="button"
                        class="bloquear"
                        title="Bloquear"
                        aria-label="Bloquear"
                        onclick="bloquearContacto('${escapeHtml(contacto.contacto_id)}')"
                    >
                        ⛔
                    </button>

                    <button
                        type="button"
                        class="eliminar"
                        title="Eliminar contacto"
                        aria-label="Eliminar contacto"
                        onclick="eliminarContacto('${escapeHtml(contacto.id)}')"
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
            document.getElementById('contactosList');

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

    function mostrarEstadoVacio(icono, mensaje) {
        const lista =
            document.getElementById('contactosList');

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
                                onclick="abrirAgregarContacto()"
                            >
                                ◆ Agregar contacto
                            </button>
                        `
                        : ''
                }

            </div>
        `;
    }

    /* ============================================================
       ESTADÍSTICAS
       ============================================================ */

    function actualizarEstadisticas(lista) {
        const total =
            document.getElementById('totalContactos');

        const online =
            document.getElementById('onlineContactos');

        if (total) {
            total.textContent = lista.length;
        }

        if (online) {
            online.textContent =
                lista.filter((item) => {
                    return (
                        item?.contacto?.online === true
                    );
                }).length;
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
        modal.setAttribute('aria-hidden', 'false');

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
            setTimeout(() => input.focus(), 100);
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

        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
    }

    window.cerrarModalBuscar =
        cerrarModalBuscar;

    /* ============================================================
       BUSCAR USUARIOS
       ============================================================ */

    async function buscarUsuarios(texto) {
        const client = sb();
        const session = await getSession();

        if (!client || !session) {
            mostrarMensajeBusqueda(
                'Inicia sesión para buscar contactos.'
            );
            return;
        }

        try {
            const termino =
                texto.replace(/^@/, '').trim();

            /*
             * Se buscan solamente columnas existentes
             * en public.usuarios.
             */

            const filtros =
                `nombre.ilike.%${termino}%,handle.ilike.%${termino}%,username.ilike.%${termino}%`;

            const { data, error } = await client
                .from(USUARIOS_TABLE)
                .select(`
                    id,
                    nombre,
                    handle,
                    username,
                    avatar_url,
                    online,
                    verificado
                `)
                .neq('id', session.user.id)
                .or(filtros)
                .limit(20);

            if (error) {
                throw error;
            }

            const usuarios =
                Array.isArray(data) ? data : [];

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
                    contactos.map(
                        (item) => item.contacto_id
                    )
                );

            const disponibles =
                usuarios.filter(
                    (usuario) =>
                        !idsContactos.has(usuario.id)
                );

            if (!disponibles.length) {
                mostrarMensajeBusqueda(
                    'Los usuarios encontrados ya están en tus contactos.'
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
                .map((usuario) => {
                    const inicial =
                        (usuario.nombre ||
                            usuario.username ||
                            usuario.handle ||
                            'U')
                            .charAt(0)
                            .toUpperCase();

                    const avatar =
                        usuario.avatar_url
                            ? `
                                <img
                                    src="${escapeHtml(usuario.avatar_url)}"
                                    alt=""
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
                                    ${escapeHtml(inicial)}
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

                            <div style="flex:1;min-width:0;">

                                <div
                                    style="
                                        font-weight:600;
                                        color:var(--text-primary);
                                    "
                                >
                                    ${escapeHtml(nombre)}

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
                                                    handle.replace(/^@/, '')
                                                )}
                                            </div>
                                        `
                                        : ''
                                }

                            </div>

                            <button
                                type="button"
                                class="btn-agregar"
                                style="
                                    padding:7px 12px;
                                    font-size:0.65rem;
                                "
                                onclick="agregarContacto('${escapeHtml(usuario.id)}')"
                            >
                                ◆ Agregar
                            </button>

                        </div>
                    `;
                })
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

    async function agregarContacto(contactoId) {
        const client = sb();
        const session = await getSession();

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

        if (contactoId === session.user.id) {
            showToast(
                '⚠️ No puedes agregarte a ti mismo',
                'warning'
            );
            return;
        }

        try {
            /*
             * Verificación A → B.
             */

            const { data: existe, error: errorExiste } =
                await client
                    .from(CONTACTOS_TABLE)
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

            /*
             * Solamente insertamos la relación del usuario actual.
             *
             * NO intentamos escribir B → A desde el cliente.
             * Esto evita problemas con RLS y mantiene una sola
             * autoridad para la relación.
             */

            const { error } = await client
                .from(CONTACTOS_TABLE)
                .insert({
                    usuario_id: session.user.id,
                    contacto_id: contactoId,
                    estado: 'activo',
                    es_favorito: false
                });

            if (error) {
                /*
                 * Si existe una restricción de unicidad
                 * o trigger de reciprocidad, lo tratamos
                 * como ya existente.
                 */

                if (error.code === '23505') {
                    showToast(
                        '⚠️ Ya es tu contacto',
                        'warning'
                    );
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
        const session = await getSession();

        if (!client || !session) {
            showToast(
                '⚠️ Inicia sesión',
                'error'
            );
            return;
        }

        try {
            const { error } = await client
                .from(CONTACTOS_TABLE)
                .update({
                    es_favorito: nuevoValor
                })
                .eq('id', contactoRowId)
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
        const session = await getSession();

        if (!client || !session) {
            showToast(
                '⚠️ Inicia sesión',
                'error'
            );
            return;
        }

        const confirmar = window.confirm(
            '¿Quieres eliminar este contacto?'
        );

        if (!confirmar) {
            return;
        }

        try {
            const { error } = await client
                .from(CONTACTOS_TABLE)
                .delete()
                .eq('id', contactoRowId)
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
        const session = await getSession();

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

        const confirmar = window.confirm(
            '¿Quieres bloquear a este usuario?'
        );

        if (!confirmar) {
            return;
        }

        try {
            /*
             * La tabla bloqueos utiliza:
             * usuario_id
             * bloqueado_id
             */

            const { error: errorBloqueo } =
                await client
                    .from(BLOQUEOS_TABLE)
                    .insert({
                        usuario_id:
                            session.user.id,
                        bloqueado_id:
                            contactoId
                    });

            if (
                errorBloqueo &&
                errorBloqueo.code !== '23505'
            ) {
                throw errorBloqueo;
            }

            /*
             * Eliminamos la relación del contacto
             * del usuario actual.
             */

            const { error: errorContacto } =
                await client
                    .from(CONTACTOS_TABLE)
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

    function abrirMensaje(contactoId) {
        if (!contactoId) {
            return;
        }

        const url =
            `/features/mensajes/mensajes.html?usuario=${encodeURIComponent(contactoId)}`;

        window.location.href = url;
    }

    window.abrirMensaje =
        abrirMensaje;

    /* ============================================================
       INVITACIONES
       ============================================================ */

    async function invitarContacto() {
        const client = sb();
        const session = await getSession();

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
            modal.classList.add('show');
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
             * Primero reutilizamos una invitación activa
             * todavía no utilizada cuando exista.
             */

            const { data: existente, error: errorExistente } =
                await client
                    .from(INVITACIONES_TABLE)
                    .select(`
                        id,
                        codigo,
                        usado,
                        activo,
                        expira_en
                    `)
                    .eq(
                        'usuario_id',
                        session.user.id
                    )
                    .eq('usado', false)
                    .eq('activo', true)
                    .gt(
                        'expira_en',
                        new Date().toISOString()
                    )
                    .order(
                        'fecha_creacion',
                        {
                            ascending: false
                        }
                    )
                    .limit(1)
                    .maybeSingle();

            if (errorExistente) {
                throw errorExistente;
            }

            if (existente?.codigo) {
                if (codigoElemento) {
                    codigoElemento.textContent =
                        existente.codigo;
                }

                return;
            }

            /*
             * Código compatible con varchar + unique.
             */

            const codigo =
                generarCodigoInvitacion();

            const { data, error } =
                await client
                    .from(INVITACIONES_TABLE)
                    .insert({
                        usuario_id:
                            session.user.id,
                        codigo,
                        usado: false,
                        activo: true
                    })
                    .select(`
                        id,
                        codigo,
                        expira_en
                    `)
                    .single();

            if (error) {
                /*
                 * En caso excepcional de colisión
                 * de código, reintentamos una vez.
                 */

                if (error.code === '23505') {
                    const segundoCodigo =
                        generarCodigoInvitacion();

                    const segundo =
                        await client
                            .from(
                                INVITACIONES_TABLE
                            )
                            .insert({
                                usuario_id:
                                    session.user.id,
                                codigo:
                                    segundoCodigo,
                                usado: false,
                                activo: true
                            })
                            .select(`
                                id,
                                codigo,
                                expira_en
                            `)
                            .single();

                    if (segundo.error) {
                        throw segundo.error;
                    }

                    if (codigoElemento) {
                        codigoElemento.textContent =
                            segundo.data.codigo;
                    }

                    return;
                }

                throw error;
            }

            if (codigoElemento) {
                codigoElemento.textContent =
                    data.codigo;
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

    function generarCodigoInvitacion() {
        const caracteres =
            'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

        let resultado = '';

        for (let i = 0; i < 8; i++) {
            resultado +=
                caracteres.charAt(
                    Math.floor(
                        Math.random() *
                            caracteres.length
                    )
                );
        }

        return resultado;
    }

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
            codigo === '⏳ Generando...' ||
            codigo === 'ERROR'
        ) {
            return;
        }

        try {
            await navigator.clipboard.writeText(
                codigo
            );

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

    function cerrarModalInvitacion() {
        const modal =
            document.getElementById(
                'modalInvitacion'
            );

        if (!modal) {
            return;
        }

        modal.classList.remove('show');
        modal.setAttribute(
            'aria-hidden',
            'true'
        );
    }

    window.cerrarModalInvitacion =
        cerrarModalInvitacion;

    /* ============================================================
       CIERRE DE MODALES AL HACER CLICK FUERA
       ============================================================ */

    document.addEventListener('click', (event) => {
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
    });

    /* ============================================================
       ARRANQUE
       ============================================================ */

    function esperarSupabase() {
        let intentos = 0;

        const timer = setInterval(async () => {
            intentos++;

            if (sb()) {
                clearInterval(timer);
                await inicializarContactos();
                return;
            }

            if (intentos >= 100) {
                clearInterval(timer);

                console.error(
                    '❌ Supabase no estuvo disponible.'
                );

                mostrarEstadoVacio(
                    '⚠️',
                    'No se pudo inicializar la conexión.'
                );
            }
        }, 100);
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