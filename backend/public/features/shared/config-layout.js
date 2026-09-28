/* ================================================================
SARIEL'S · CONFIGURACIÓN - LAYOUT COMPARTIDO
JavaScript común para todas las páginas de configuración.

Proporciona:

- cfgInitPage()
- cfgRenderItem()
- cfgRenderToggle()
- cfgConfirm()
- cfgToast()
- cfgGetPref()
- cfgSetPref()
- cfgEsperarSupabase()

Supabase:

- Usa /api/config/public
- Nunca expone service_role
- Persistencia en preferencias_usuario
- RPC obtener_mis_preferencias
- RPC actualizar_preferencia
  ================================================================ */

(function () {
'use strict';

/* ============================================================
   ESTADO
   ============================================================ */

let clienteSupabase = null;
let promesaSupabase = null;
let preferencias = {};
let preferenciasCargadas = false;

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

function obtenerIcono(nombre) {
    if (
        typeof window.cfgIcon === 'function'
    ) {
        return window.cfgIcon(nombre);
    }

    if (
        window.CFG_ICONS &&
        window.CFG_ICONS[nombre]
    ) {
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
        clienteSupabase =
            window.supabaseClient;

        return clienteSupabase;
    }

    if (
        !window.supabase ||
        typeof window.supabase.createClient !==
            'function'
    ) {
        throw new Error(
            'La librería de Supabase no está disponible.'
        );
    }

    const respuesta =
        await fetch(
            '/api/config/public',
            {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    'Accept':
                        'application/json'
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

    const config =
        await respuesta.json();

    const supabaseUrl =
        config &&
        config.supabaseUrl;

    const supabaseAnonKey =
        config &&
        config.supabaseAnonKey;

    if (
        typeof supabaseUrl !==
            'string' ||
        !supabaseUrl.trim()
    ) {
        throw new Error(
            'Falta supabaseUrl en /api/config/public.'
        );
    }

    if (
        typeof supabaseAnonKey !==
            'string' ||
        !supabaseAnonKey.trim()
    ) {
        throw new Error(
            'Falta supabaseAnonKey en /api/config/public.'
        );
    }

    window.supabaseClient =
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

    clienteSupabase =
        window.supabaseClient;

    return clienteSupabase;
}

window.cfgEsperarSupabase =
    function () {

        if (clienteSupabase) {
            return Promise.resolve(
                clienteSupabase
            );
        }

        if (!promesaSupabase) {
            promesaSupabase =
                crearClienteSupabase()
                    .catch(function (error) {
                        promesaSupabase = null;
                        throw error;
                    });
        }

        return promesaSupabase;
    };

/* ============================================================
   PREFERENCIAS LOCAL
   ============================================================ */

function normalizarValor(valor) {

    if (
        valor === 'true'
    ) {
        return true;
    }

    if (
        valor === 'false'
    ) {
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

        const claves =
            Object.keys(localStorage);

        claves.forEach(function (clave) {

            /*
             * Las preferencias de configuración
             * se guardan directamente con su clave.
             */
            const valor =
                localStorage.getItem(clave);

            if (
                valor === null
            ) {
                return;
            }

            preferencias[clave] =
                normalizarValor(valor);
        });

        /*
         * Algunas páginas antiguas guardan
         * preferencias agrupadas.
         */
        const grupos = [
            'sariels_audiencia_prefs'
        ];

        grupos.forEach(function (clave) {

            try {

                const raw =
                    localStorage.getItem(
                        clave
                    );

                if (!raw) {
                    return;
                }

                const grupo =
                    JSON.parse(raw);

                if (
                    grupo &&
                    typeof grupo === 'object'
                ) {
                    Object.assign(
                        preferencias,
                        grupo
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

/* ============================================================
   PREFERENCIAS SUPABASE
   ============================================================ */

async function cargarPreferenciasSupabase() {

    try {

        const client =
            await window.cfgEsperarSupabase();

        if (!client) {
            return;
        }

        const sessionResult =
            await client.auth.getSession();

        const session =
            sessionResult &&
            sessionResult.data
                ? sessionResult.data.session
                : null;

        if (
            !session ||
            !session.user
        ) {
            preferenciasCargadas = true;
            return;
        }

        /*
         * Fuente principal:
         * RPC obtener_mis_preferencias
         */
        try {

            const resultado =
                await client.rpc(
                    'obtener_mis_preferencias'
                );

            if (
                !resultado.error &&
                resultado.data
            ) {

                let datos =
                    resultado.data;

                /*
                 * Admite:
                 * { prefs: {...} }
                 * o directamente {...}
                 */
                if (
                    datos.prefs &&
                    typeof datos.prefs ===
                        'object'
                ) {
                    datos =
                        datos.prefs;
                }

                if (
                    typeof datos ===
                        'object' &&
                    !Array.isArray(datos)
                ) {

                    Object.assign(
                        preferencias,
                        datos
                    );

                    guardarPreferenciasLocales(
                        datos
                    );

                    preferenciasCargadas =
                        true;

                    return;
                }
            }

        } catch (rpcError) {

            console.warn(
                '[Configuración] RPC obtener_mis_preferencias no disponible:',
                rpcError
            );
        }

        /*
         * Fallback:
         * tabla preferencias_usuario
         */
        try {

            const resultado =
                await client
                    .from(
                        'preferencias_usuario'
                    )
                    .select(
                        'prefs'
                    )
                    .eq(
                        'usuario_id',
                        session.user.id
                    )
                    .maybeSingle();

            if (
                !resultado.error &&
                resultado.data &&
                resultado.data.prefs &&
                typeof resultado.data.prefs ===
                    'object'
            ) {

                Object.assign(
                    preferencias,
                    resultado.data.prefs
                );

                guardarPreferenciasLocales(
                    resultado.data.prefs
                );
            }

        } catch (tablaError) {

            console.warn(
                '[Configuración] No se pudo leer preferencias_usuario:',
                tablaError
            );
        }

    } catch (error) {

        console.warn(
            '[Configuración] Error sincronizando preferencias:',
            error
        );

    } finally {

        preferenciasCargadas =
            true;

        window.dispatchEvent(
            new CustomEvent(
                'cfg-preferences-ready'
            )
        );
    }
}

function guardarPreferenciasLocales(
    datos
) {

    if (
        !datos ||
        typeof datos !== 'object'
    ) {
        return;
    }

    Object.keys(datos).forEach(
        function (clave) {

            const valor =
                datos[clave];

            preferencias[clave] =
                valor;

            try {

                if (
                    typeof valor ===
                        'object'
                ) {
                    localStorage.setItem(
                        clave,
                        JSON.stringify(
                            valor
                        )
                    );
                } else {
                    localStorage.setItem(
                        clave,
                        String(valor)
                    );
                }

            } catch (_) {}
        }
    );
}

window.cfgGetPref =
    function (
        clave,
        defecto
    ) {

        if (
            Object.prototype.hasOwnProperty.call(
                preferencias,
                clave
            )
        ) {
            return preferencias[
                clave
            ];
        }

        try {

            const valor =
                localStorage.getItem(
                    clave
                );

            if (
                valor !== null
            ) {
                const normalizado =
                    normalizarValor(
                        valor
                    );

                preferencias[clave] =
                    normalizado;

                return normalizado;
            }

        } catch (_) {}

        return defecto;
    };

window.cfgSetPref =
    async function (
        clave,
        valor
    ) {

        preferencias[clave] =
            valor;

        /*
         * 1. Persistencia local inmediata.
         */
        try {

            if (
                typeof valor ===
                    'object'
            ) {
                localStorage.setItem(
                    clave,
                    JSON.stringify(
                        valor
                    )
                );
            } else {
                localStorage.setItem(
                    clave,
                    String(valor)
                );
            }

        } catch (error) {

            console.warn(
                '[Configuración] No se pudo guardar localmente:',
                error
            );
        }

        /*
         * 2. Persistencia Supabase.
         */
        try {

            const client =
                await window.cfgEsperarSupabase();

            if (!client) {
                return {
                    ok: false,
                    local: true
                };
            }

            const sessionResult =
                await client.auth.getSession();

            const session =
                sessionResult &&
                sessionResult.data
                    ? sessionResult.data.session
                    : null;

            if (
                !session ||
                !session.user
            ) {
                return {
                    ok: false,
                    local: true
                };
            }

            /*
             * RPC principal.
             */
            const resultado =
                await client.rpc(
                    'actualizar_preferencia',
                    {
                        p_key: clave,
                        p_value: valor
                    }
                );

            if (
                !resultado.error
            ) {
                return {
                    ok: true
                };
            }

            console.warn(
                '[Configuración] actualizar_preferencia falló:',
                resultado.error
            );

            /*
             * Fallback directo a preferencias_usuario.
             */
            const actual =
                await client
                    .from(
                        'preferencias_usuario'
                    )
                    .select(
                        'prefs'
                    )
                    .eq(
                        'usuario_id',
                        session.user.id
                    )
                    .maybeSingle();

            const nuevoPrefs = {
                ...(
                    actual.data &&
                    actual.data.prefs &&
                    typeof actual.data.prefs ===
                        'object'
                        ? actual.data.prefs
                        : {}
                ),
                [clave]: valor
            };

            const upsert =
                await client
                    .from(
                        'preferencias_usuario'
                    )
                    .upsert(
                        {
                            usuario_id:
                                session.user.id,
                            prefs:
                                nuevoPrefs
                        },
                        {
                            onConflict:
                                'usuario_id'
                        }
                    );

            if (
                upsert.error
            ) {
                console.warn(
                    '[Configuración] Fallback de preferencias falló:',
                    upsert.error
                );

                return {
                    ok: false,
                    local: true,
                    error:
                        upsert.error.message
                };
            }

            return {
                ok: true
            };

        } catch (error) {

            /*
             * La preferencia local ya fue guardada.
             * No rompemos la interfaz por un fallo de red.
             */
            console.warn(
                '[Configuración] No se pudo sincronizar preferencia:',
                error
            );

            return {
                ok: false,
                local: true,
                error:
                    error.message
            };
        }
    };

/* ============================================================
   RENDER ITEM
   ============================================================ */

window.cfgRenderItem =
    function (opciones) {

        opciones =
            opciones || {};

        const icono =
            obtenerIcono(
                opciones.icon ||
                'settings'
            );

        const titulo =
            escapeHtml(
                opciones.title || ''
            );

        const descripcion =
            escapeHtml(
                opciones.desc || ''
            );

        const claseExtra =
            opciones.class
                ? ' ' +
                  opciones.class
                : '';

        const estilo =
            opciones.style
                ? ' style="' +
                  opciones.style +
                  '"'
                : '';

        let accion = '';

        if (opciones.href) {

            accion =
                'href="' +
                escapeHtml(
                    opciones.href
                ) +
                '"';

        } else if (
            opciones.onclick
        ) {

            accion =
                'onclick="' +
                escapeHtml(
                    opciones.onclick
                ) +
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
                    etiqueta ===
                    'button'
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
                    opciones.chevron ===
                    false
                        ? ''
                        : `
                            <div class="cfg-item-chevron">
                                ${obtenerIcono(
                                    'chevronRight'
                                )}
                            </div>
                        `
                }

            </${etiqueta}>
        `;
    };

/* ============================================================
   RENDER TOGGLE
   ============================================================ */

window.cfgRenderToggle =
    function (opciones) {

        opciones =
            opciones || {};

        const id =
            opciones.id ||
            (
                'cfgToggle_' +
                Math.random()
                    .toString(36)
                    .slice(2)
            );

        const icono =
            opciones.icon
                ? `
                    <div class="cfg-item-icon">
                        ${obtenerIcono(
                            opciones.icon
                        )}
                    </div>
                `
                : '';

        const titulo =
            escapeHtml(
                opciones.title || ''
            );

        const descripcion =
            escapeHtml(
                opciones.desc || ''
            );

        const checked =
            opciones.checked === true
                ? 'checked'
                : '';

        const disabled =
            opciones.disabled === true
                ? 'disabled'
                : '';

        const onChange =
            opciones.onChange ||
            '';

        return `
            <div class="cfg-item">

                ${icono}

                <div class="cfg-item-content">

                    <div class="cfg-item-title">
                        ${titulo}
                    </div>

                    <div class="cfg-item-desc">
                        ${descripcion}
                    </div>

                </div>

                <label
                    class="cfg-toggle"
                    for="${escapeHtml(id)}">

                    <input
                        type="checkbox"
                        id="${escapeHtml(id)}"
                        ${checked}
                        ${disabled}
                        ${
                            onChange
                                ? 'onchange="' +
                                  escapeHtml(
                                      onChange
                                  ) +
                                  '"'
                                : ''
                        } />

                    <span
                        class="cfg-toggle-slider">
                    </span>

                </label>

            </div>
        `;
    };

/* ============================================================
   HEADER
   ============================================================ */

window.cfgInitPage =
    function (opciones) {

        opciones =
            opciones || {};

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
                    href="${escapeHtml(
                        backUrl
                    )}"
                    aria-label="Volver">

                    ${obtenerIcono(
                        'back'
                    )}

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
                                )}">
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
    };

/* ============================================================
   TOAST
   ============================================================ */

window.cfgToast =
    function (
        mensaje,
        tipo,
        duracion
    ) {

        let toast =
            document.querySelector(
                '#cfgToast'
            );

        if (!toast) {

            toast =
                document.createElement(
                    'div'
                );

            toast.id =
                'cfgToast';

            toast.className =
                'cfg-toast';

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

        clearTimeout(
            toastTimer
        );

        toast.className =
            'cfg-toast';

        if (
            tipo === 'success'
        ) {
            toast.classList.add(
                'cfg-toast-success'
            );
        } else if (
            tipo === 'error'
        ) {
            toast.classList.add(
                'cfg-toast-error'
            );
        } else if (
            tipo === 'warning'
        ) {
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
   CONFIRM
   ============================================================ */

window.cfgConfirm =
    function (opciones) {

        opciones =
            opciones || {};

        return new Promise(
            function (resolve) {

                const overlay =
                    document.querySelector(
                        '#cfgModal'
                    );

                /*
                 * Si una página no tiene modal propio,
                 * usar confirm nativo como respaldo.
                 */
                if (!overlay) {

                    resolve(
                        window.confirm(
                            opciones.text ||
                            '¿Quieres continuar?'
                        )
                    );

                    return;
                }

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

                if (
                    !titulo ||
                    !texto ||
                    !cancelar ||
                    !confirmar
                ) {

                    resolve(
                        window.confirm(
                            opciones.text ||
                            '¿Quieres continuar?'
                        )
                    );

                    return;
                }

                modalResolver =
                    resolve;

                titulo.textContent =
                    opciones.title ||
                    'Confirmar acción';

                texto.textContent =
                    opciones.text ||
                    '¿Quieres continuar?';

                cancelar.textContent =
                    opciones.cancelText ||
                    'Cancelar';

                confirmar.textContent =
                    opciones.confirmText ||
                    'Confirmar';

                confirmar.className =
                    'cfg-btn ' +
                    (
                        opciones.danger
                            ? 'cfg-btn-danger'
                            : 'cfg-btn-primary'
                    );

                overlay.classList.add(
                    'show'
                );

                overlay.setAttribute(
                    'aria-hidden',
                    'false'
                );

                cancelar.onclick =
                    function () {
                        cerrarModal(
                            false
                        );
                    };

                confirmar.onclick =
                    function () {
                        cerrarModal(
                            true
                        );
                    };

                overlay.onclick =
                    function (event) {

                        if (
                            event.target ===
                            overlay
                        ) {
                            cerrarModal(
                                false
                            );
                        }
                    };
            }
        );
    };

function cerrarModal(
    resultado
) {

    const overlay =
        document.querySelector(
            '#cfgModal'
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

    if (
        modalResolver
    ) {

        const resolver =
            modalResolver;

        modalResolver =
            null;

        resolver(
            resultado
        );
    }
}

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */

cargarPreferenciasLocales();

/*
 * No bloquear la página mientras se sincroniza.
 */
setTimeout(
    function () {
        cargarPreferenciasSupabase();
    },
    0
);

/*
 * Cambios entre pestañas/dispositivos
 * cuando localStorage cambia.
 */
window.addEventListener(
    'storage',
    function (evento) {

        if (
            !evento.key
        ) {
            return;
        }

        if (
            evento.newValue ===
            null
        ) {
            delete preferencias[
                evento.key
            ];
            return;
        }

        preferencias[
            evento.key
        ] =
            normalizarValor(
                evento.newValue
            );
    }
);

})();