/* ================================================================
   SARIEL'S · CONFIGURACIÓN
   LAYOUT COMPARTIDO
   v2 · textos del modal traducibles
   ================================================================ */

(function () {
    'use strict';

    let clienteSupabase = null;
    let promesaSupabase = null;

    let preferencias = {};
    let toastTimer = null;
    let modalResolver = null;

    /* ============================================================
       HELPERS
       ============================================================ */

    function escapeHtml(valor) {
        if (valor === null || valor === undefined) {
            return '';
        }

        const div = document.createElement('div');
        div.textContent = String(valor);

        return div.innerHTML;
    }

    // Texto traducido con respaldo (si idiomas.js aún no cargó, usa respaldo)
    function tt(clave, respaldo) {
        return typeof window.tConFallback === 'function'
            ? window.tConFallback(clave, respaldo)
            : respaldo;
    }

    function obtenerIcono(nombre) {
        if (typeof window.cfgIcon === 'function') {
            return window.cfgIcon(nombre);
        }

        if (window.CFG_ICONS && window.CFG_ICONS[nombre]) {
            return window.CFG_ICONS[nombre];
        }

        return '';
    }

    /* ============================================================
       SUPABASE
       ============================================================ */

    async function crearClienteSupabase() {
        if (clienteSupabase) {
            return clienteSupabase;
        }

        if (window.supabaseClient) {
            clienteSupabase = window.supabaseClient;
            return clienteSupabase;
        }

        if (
            !window.supabase ||
            typeof window.supabase.createClient !== 'function'
        ) {
            throw new Error(
                'La librería de Supabase no está disponible.'
            );
        }

        const respuesta = await fetch(
            '/api/config/public',
            {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json'
                }
            }
        );

        if (!respuesta.ok) {
            throw new Error(
                'No se pudo cargar la configuración pública de Supabase (' +
                respuesta.status +
                ').'
            );
        }

        const config = await respuesta.json();

        const supabaseUrl =
            config &&
            (
                config.supabaseUrl ||
                config.supabase_url
            );

        const supabaseAnonKey =
            config &&
            (
                config.supabaseAnonKey ||
                config.supabase_anon_key
            );

        if (
            typeof supabaseUrl !== 'string' ||
            !supabaseUrl.trim()
        ) {
            throw new Error(
                'Falta supabaseUrl en /api/config/public.'
            );
        }

        if (
            typeof supabaseAnonKey !== 'string' ||
            !supabaseAnonKey.trim()
        ) {
            throw new Error(
                'Falta supabaseAnonKey en /api/config/public.'
            );
        }

        clienteSupabase =
            window.supabase.createClient(
                supabaseUrl.trim(),
                supabaseAnonKey.trim(),
                {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true
                    }
                }
            );

        window.supabaseClient = clienteSupabase;

        return clienteSupabase;
    }

    window.cfgEsperarSupabase = function () {
        if (clienteSupabase) {
            return Promise.resolve(clienteSupabase);
        }

        if (!promesaSupabase) {
            promesaSupabase =
                crearClienteSupabase().catch(function (error) {
                    promesaSupabase = null;
                    throw error;
                });
        }

        return promesaSupabase;
    };

    /* ============================================================
       PREFERENCIAS
       ============================================================ */

    function normalizarValor(valor) {
        if (valor === 'true') {
            return true;
        }

        if (valor === 'false') {
            return false;
        }

        if (
            typeof valor === 'string' &&
            valor !== '' &&
            !Number.isNaN(Number(valor))
        ) {
            return Number(valor);
        }

        return valor;
    }

    function cargarPreferenciasLocales() {
        preferencias = {};

        try {
            Object.keys(localStorage).forEach(function (clave) {
                const valor = localStorage.getItem(clave);

                if (valor !== null) {
                    preferencias[clave] =
                        normalizarValor(valor);
                }
            });

            const agrupadas = [
                'sariels_audiencia_prefs'
            ];

            agrupadas.forEach(function (clave) {
                try {
                    const raw =
                        localStorage.getItem(clave);

                    if (!raw) {
                        return;
                    }

                    const datos = JSON.parse(raw);

                    if (
                        datos &&
                        typeof datos === 'object' &&
                        !Array.isArray(datos)
                    ) {
                        Object.assign(
                            preferencias,
                            datos
                        );
                    }
                } catch (_) {}
            });
        } catch (error) {
            console.warn(
                '[Configuración] No se pudieron leer preferencias locales:',
                error
            );
        }
    }

    async function cargarPreferenciasSupabase() {
        try {
            const client =
                await window.cfgEsperarSupabase();

            const resultadoSession =
                await client.auth.getSession();

            const session =
                resultadoSession &&
                resultadoSession.data
                    ? resultadoSession.data.session
                    : null;

            if (!session || !session.user) {
                return;
            }

            try {
                const resultado =
                    await client.rpc(
                        'obtener_mis_preferencias'
                    );

                if (
                    !resultado.error &&
                    resultado.data
                ) {
                    let datos = resultado.data;

                    if (
                        datos.prefs &&
                        typeof datos.prefs === 'object'
                    ) {
                        datos = datos.prefs;
                    }

                    if (
                        datos &&
                        typeof datos === 'object' &&
                        !Array.isArray(datos)
                    ) {
                        guardarPreferenciasLocales(datos);
                        return;
                    }
                }
            } catch (error) {
                console.warn(
                    '[Configuración] RPC de preferencias no disponible:',
                    error
                );
            }

            try {
                const resultado =
                    await client
                        .from('preferencias_usuario')
                        .select('prefs')
                        .eq(
                            'usuario_id',
                            session.user.id
                        )
                        .maybeSingle();

                if (
                    !resultado.error &&
                    resultado.data &&
                    resultado.data.prefs &&
                    typeof resultado.data.prefs === 'object'
                ) {
                    guardarPreferenciasLocales(
                        resultado.data.prefs
                    );
                }
            } catch (error) {
                console.warn(
                    '[Configuración] No se pudo leer preferencias_usuario:',
                    error
                );
            }
        } catch (error) {
            console.warn(
                '[Configuración] Error sincronizando preferencias:',
                error
            );
        } finally {
            window.dispatchEvent(
                new CustomEvent(
                    'cfg-preferences-ready'
                )
            );
        }
    }

    function guardarPreferenciasLocales(datos) {
        if (
            !datos ||
            typeof datos !== 'object'
        ) {
            return;
        }

        Object.keys(datos).forEach(function (clave) {
            const valor = datos[clave];

            preferencias[clave] = valor;

            try {
                localStorage.setItem(
                    clave,
                    typeof valor === 'object'
                        ? JSON.stringify(valor)
                        : String(valor)
                );
            } catch (_) {}
        });
    }

    window.cfgGetPref = function (clave, defecto) {
        if (
            Object.prototype.hasOwnProperty.call(
                preferencias,
                clave
            )
        ) {
            return preferencias[clave];
        }

        try {
            const valor =
                localStorage.getItem(clave);

            if (valor !== null) {
                const normalizado =
                    normalizarValor(valor);

                preferencias[clave] = normalizado;

                return normalizado;
            }
        } catch (_) {}

        return defecto;
    };

    window.cfgSetPref = async function (clave, valor) {
        preferencias[clave] = valor;

        try {
            localStorage.setItem(
                clave,
                typeof valor === 'object'
                    ? JSON.stringify(valor)
                    : String(valor)
            );
        } catch (error) {
            console.warn(
                '[Configuración] Error local:',
                error
            );
        }

        try {
            const client =
                await window.cfgEsperarSupabase();

            const resultadoSession =
                await client.auth.getSession();

            const session =
                resultadoSession &&
                resultadoSession.data
                    ? resultadoSession.data.session
                    : null;

            if (!session || !session.user) {
                return {
                    ok: false,
                    local: true
                };
            }

            const rpc =
                await client.rpc(
                    'actualizar_preferencia',
                    {
                        p_key: clave,
                        p_value: valor
                    }
                );

            if (!rpc.error) {
                return { ok: true };
            }

            console.warn(
                '[Configuración] actualizar_preferencia falló:',
                rpc.error
            );

            const actual =
                await client
                    .from('preferencias_usuario')
                    .select('prefs')
                    .eq(
                        'usuario_id',
                        session.user.id
                    )
                    .maybeSingle();

            const prefs =
                actual.data &&
                actual.data.prefs &&
                typeof actual.data.prefs === 'object'
                    ? actual.data.prefs
                    : {};

            prefs[clave] = valor;

            const upsert =
                await client
                    .from('preferencias_usuario')
                    .upsert(
                        {
                            usuario_id:
                                session.user.id,
                            prefs: prefs
                        },
                        {
                            onConflict:
                                'usuario_id'
                        }
                    );

            if (upsert.error) {
                return {
                    ok: false,
                    local: true,
                    error:
                        upsert.error.message
                };
            }

            return { ok: true };
        } catch (error) {
            console.warn(
                '[Configuración] No se pudo sincronizar preferencia:',
                error
            );

            return {
                ok: false,
                local: true,
                error: error.message
            };
        }
    };

    /* ============================================================
       ITEM
       ============================================================ */

    window.cfgRenderItem = function (opciones) {
        opciones = opciones || {};

        const icono =
            obtenerIcono(
                opciones.icon || 'settings'
            );

        const titulo =
            escapeHtml(opciones.title || '');

        const descripcion =
            escapeHtml(opciones.desc || '');

        const claseExtra =
            opciones.class
                ? ' ' + opciones.class
                : '';

        const estilo =
            opciones.style
                ? ' style="' +
                  escapeHtml(opciones.style) +
                  '"'
                : '';

        let accion = '';

        if (opciones.href) {
            accion =
                'href="' +
                escapeHtml(opciones.href) +
                '"';
        } else if (opciones.onclick) {
            accion =
                'onclick="' +
                escapeHtml(opciones.onclick) +
                '"';
        }

        const etiqueta =
            opciones.href
                ? 'a'
                : 'button';

        return `
            <${etiqueta}
                class="cfg-item${claseExtra}"
                ${accion}
                ${estilo}
                ${
                    etiqueta === 'button'
                        ? 'type="button"'
                        : ''
                }
            >
                <div class="cfg-item-icon">
                    ${icono}
                </div>

                <div class="cfg-item-content">
                    <div class="cfg-item-title">
                        ${titulo}
                    </div>

                    <div class="cfg-item-desc">
                        ${descripcion}
                    </div>
                </div>

                ${
                    opciones.chevron === false
                        ? ''
                        : `
                            <div class="cfg-item-chevron">
                                ${obtenerIcono('chevronRight')}
                            </div>
                        `
                }
            </${etiqueta}>
        `;
    };

    /* ============================================================
       TOGGLE
       ============================================================ */

    window.cfgRenderToggle = function (opciones) {
        opciones = opciones || {};

        const id =
            opciones.id ||
            'cfgToggle_' +
            Math.random()
                .toString(36)
                .slice(2);

        return `
            <div class="cfg-item">

                ${
                    opciones.icon
                        ? `
                            <div class="cfg-item-icon">
                                ${obtenerIcono(
                                    opciones.icon
                                )}
                            </div>
                        `
                        : ''
                }

                <div class="cfg-item-content">
                    <div class="cfg-item-title">
                        ${escapeHtml(
                            opciones.title || ''
                        )}
                    </div>

                    <div class="cfg-item-desc">
                        ${escapeHtml(
                            opciones.desc || ''
                        )}
                    </div>
                </div>

                <label
                    class="cfg-toggle"
                    for="${escapeHtml(id)}"
                >
                    <input
                        type="checkbox"
                        id="${escapeHtml(id)}"
                        ${
                            opciones.checked === true
                                ? 'checked'
                                : ''
                        }
                        ${
                            opciones.disabled === true
                                ? 'disabled'
                                : ''
                        }
                        ${
                            opciones.onChange
                                ? 'onchange="' +
                                  escapeHtml(
                                      opciones.onChange
                                  ) +
                                  '"'
                                : ''
                        }
                    />

                    <span class="cfg-toggle-slider"></span>
                </label>

            </div>
        `;
    };

    /* ============================================================
       HEADER
       ============================================================ */

    window.cfgInitPage = function (opciones) {
        opciones = opciones || {};

        const slot =
            document.querySelector(
                '#cfgHeaderSlot'
            );

        if (!slot) {
            return;
        }

        const titulo =
            escapeHtml(
                opciones.title ||
                'Configuración'
            );

        const subtitulo =
            escapeHtml(
                opciones.subtitle ||
                ''
            );

        const backUrl =
            opciones.backUrl ||
            '/features/perfil/configuracion/index.html';

        slot.innerHTML = `
            <header class="cfg-header">

                <a
                    class="cfg-header-back"
                    href="${escapeHtml(backUrl)}"
                    aria-label="Volver"
                >
                    ${obtenerIcono('back')}
                </a>

                <div class="cfg-header-text">
                    <h1 class="cfg-header-title">
                        ${titulo}
                    </h1>

                    ${
                        subtitulo
                            ? `
                                <p class="cfg-header-subtitle">
                                    ${subtitulo}
                                </p>
                            `
                            : ''
                    }
                </div>

                ${
                    opciones.action
                        ? `
                            <button
                                type="button"
                                class="cfg-header-action"
                                onclick="${escapeHtml(
                                    opciones.action
                                )}"
                            >
                                ${
                                    opciones.actionIcon
                                        ? obtenerIcono(
                                            opciones.actionIcon
                                        )
                                        : ''
                                }
                            </button>
                        `
                        : ''
                }

            </header>
        `;

        asegurarModal();
    };

    /* ============================================================
       MODAL CENTRAL
       ============================================================ */

    function asegurarModal() {
        let overlay =
            document.getElementById(
                'cfgModal'
            );

        if (overlay) {
            return overlay;
        }

        overlay =
            document.createElement('div');

        overlay.id = 'cfgModal';
        overlay.className = 'cfg-modal-overlay';
        overlay.setAttribute(
            'aria-hidden',
            'true'
        );

        overlay.innerHTML = `
            <div
                class="cfg-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cfgModalTitle"
            >
                <h2
                    id="cfgModalTitle"
                    class="cfg-modal-title"
                ></h2>

                <p
                    id="cfgModalText"
                    class="cfg-modal-text"
                ></p>

                <div class="cfg-modal-actions">
                    <button
                        id="cfgModalCancel"
                        type="button"
                        class="cfg-btn cfg-btn-outline"
                    >
                        Cancelar
                    </button>

                    <button
                        id="cfgModalConfirm"
                        type="button"
                        class="cfg-btn cfg-btn-primary"
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener(
            'click',
            function (event) {
                if (event.target === overlay) {
                    cerrarModal(false);
                }
            }
        );

        return overlay;
    }

    window.cfgConfirm = function (opciones) {
        opciones = opciones || {};

        const overlay =
            asegurarModal();

        const titulo =
            overlay.querySelector(
                '#cfgModalTitle'
            );

        const texto =
            overlay.querySelector(
                '#cfgModalText'
            );

        const cancelar =
            overlay.querySelector(
                '#cfgModalCancel'
            );

        const confirmar =
            overlay.querySelector(
                '#cfgModalConfirm'
            );

        return new Promise(function (resolve) {
            if (modalResolver) {
                modalResolver(false);
            }

            modalResolver = resolve;

            titulo.textContent =
                opciones.title ||
                tt('cfg_confirmar_accion', 'Confirmar acción');

            texto.textContent =
                opciones.text ||
                tt('cfg_quieres_continuar', '¿Quieres continuar?');

            cancelar.textContent =
                opciones.cancelText ||
                tt('cfg_cancelar', 'Cancelar');

            confirmar.textContent =
                opciones.confirmText ||
                tt('cfg_confirmar', 'Confirmar');

            confirmar.className =
                'cfg-btn ' +
                (
                    opciones.danger
                        ? 'cfg-btn-danger'
                        : 'cfg-btn-primary'
                );

            overlay.classList.add('show');
            overlay.setAttribute(
                'aria-hidden',
                'false'
            );

            cancelar.onclick =
                function () {
                    cerrarModal(false);
                };

            confirmar.onclick =
                function () {
                    cerrarModal(true);
                };
        });
    };

    function cerrarModal(resultado) {
        const overlay =
            document.getElementById(
                'cfgModal'
            );

        if (overlay) {
            overlay.classList.remove(
                'show'
            );

            overlay.setAttribute(
                'aria-hidden',
                'true'
            );
        }

        if (modalResolver) {
            const resolver =
                modalResolver;

            modalResolver = null;

            resolver(resultado);
        }
    }

    /* ============================================================
       TOAST
       ============================================================ */

    window.cfgToast = function (
        mensaje,
        tipo,
        duracion
    ) {
        let toast =
            document.getElementById(
                'cfgToast'
            );

        if (!toast) {
            toast =
                document.createElement(
                    'div'
                );

            toast.id = 'cfgToast';
            toast.className = 'cfg-toast';

            toast.setAttribute(
                'role',
                'status'
            );

            toast.setAttribute(
                'aria-live',
                'polite'
            );

            document.body.appendChild(
                toast
            );
        }

        clearTimeout(toastTimer);

        toast.className = 'cfg-toast';

        if (tipo === 'success') {
            toast.classList.add(
                'cfg-toast-success'
            );
        }

        if (tipo === 'error') {
            toast.classList.add(
                'cfg-toast-error'
            );
        }

        if (tipo === 'warning') {
            toast.classList.add(
                'cfg-toast-warning'
            );
        }

        toast.textContent =
            mensaje || '';

        requestAnimationFrame(
            function () {
                toast.classList.add(
                    'show'
                );
            }
        );

        toastTimer =
            setTimeout(
                function () {
                    toast.classList.remove(
                        'show'
                    );
                },
                duracion || 3000
            );
    };

    /* ============================================================
       INICIO
       ============================================================ */

    cargarPreferenciasLocales();

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            function () {
                asegurarModal();

                setTimeout(
                    cargarPreferenciasSupabase,
                    0
                );
            },
            { once: true }
        );
    } else {
        asegurarModal();

        setTimeout(
            cargarPreferenciasSupabase,
            0
        );
    }

    window.addEventListener(
        'storage',
        function (evento) {
            if (!evento.key) {
                return;
            }

            if (
                evento.newValue === null
            ) {
                delete preferencias[
                    evento.key
                ];
                return;
            }

            preferencias[evento.key] =
                normalizarValor(
                    evento.newValue
                );
        }
    );
})();