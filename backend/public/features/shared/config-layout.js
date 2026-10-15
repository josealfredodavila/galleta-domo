/* ================================================================
   SARIEL'S · CONFIGURACIÓN
   LAYOUT COMPARTIDO v2.2
   Archivo: backend/public/features/shared/config-layout.js

   Conserva sin cambios:
   - Textos del modal traducibles (tConFallback).
   - Cliente Supabase compartido.
   - Preferencias locales y remotas.
   - Modal de confirmación y toasts.

   v2.2:
   - Microinteracciones táctiles con transform y brillo (sin tocar layout).
   - Transiciones de toasts y modales más suaves.
   - CSS inyectado consolidado en una sola lista de selectores.
   - prefers-reduced-motion respetado en todas las animaciones.
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

        const respuesta = await fetch('/api/config/public', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
                Accept: 'application/json'
            }
        });

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
            (config.supabaseUrl || config.supabase_url);

        const supabaseAnonKey =
            config &&
            (config.supabaseAnonKey || config.supabase_anon_key);

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

        clienteSupabase = window.supabase.createClient(
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
        if (window.supabaseClient) {
            clienteSupabase = window.supabaseClient;
            return Promise.resolve(clienteSupabase);
        }

        if (clienteSupabase) {
            return Promise.resolve(clienteSupabase);
        }

        if (!promesaSupabase) {
            promesaSupabase = crearClienteSupabase().catch(
                function (error) {
                    promesaSupabase = null;
                    throw error;
                }
            );
        }

        return promesaSupabase;
    };

    /* ============================================================
       PREFERENCIAS
       ============================================================ */

    function normalizarValor(valor) {
        if (valor === 'true') return true;
        if (valor === 'false') return false;

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
                    preferencias[clave] = normalizarValor(valor);
                }
            });

            const agrupadas = [
                'sariels_audiencia_prefs'
            ];

            agrupadas.forEach(function (clave) {
                try {
                    const raw = localStorage.getItem(clave);
                    if (!raw) return;

                    const datos = JSON.parse(raw);

                    if (
                        datos &&
                        typeof datos === 'object' &&
                        !Array.isArray(datos)
                    ) {
                        Object.assign(preferencias, datos);
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
            const client = await window.cfgEsperarSupabase();

            const resultadoSession = await client.auth.getSession();

            const session =
                resultadoSession && resultadoSession.data
                    ? resultadoSession.data.session
                    : null;

            if (!session || !session.user) return;

            try {
                const resultado = await client.rpc(
                    'obtener_mis_preferencias'
                );

                if (!resultado.error && resultado.data) {
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
                const resultado = await client
                    .from('preferencias_usuario')
                    .select('prefs')
                    .eq('usuario_id', session.user.id)
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
                new CustomEvent('cfg-preferences-ready')
            );
        }
    }

    function guardarPreferenciasLocales(datos) {
        if (!datos || typeof datos !== 'object') return;

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
            const valor = localStorage.getItem(clave);

            if (valor !== null) {
                const normalizado = normalizarValor(valor);
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
            const client = await window.cfgEsperarSupabase();

            const resultadoSession = await client.auth.getSession();

            const session =
                resultadoSession && resultadoSession.data
                    ? resultadoSession.data.session
                    : null;

            if (!session || !session.user) {
                return {
                    ok: false,
                    local: true
                };
            }

            const rpc = await client.rpc(
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

            const actual = await client
                .from('preferencias_usuario')
                .select('prefs')
                .eq('usuario_id', session.user.id)
                .maybeSingle();

            if (actual.error) {
                return {
                    ok: false,
                    local: true,
                    error: actual.error.message
                };
            }

            const prefs =
                actual.data &&
                actual.data.prefs &&
                typeof actual.data.prefs === 'object'
                    ? { ...actual.data.prefs }
                    : {};

            prefs[clave] = valor;

            const upsert = await client
                .from('preferencias_usuario')
                .upsert(
                    {
                        usuario_id: session.user.id,
                        prefs: prefs
                    },
                    {
                        onConflict: 'usuario_id'
                    }
                );

            if (upsert.error) {
                return {
                    ok: false,
                    local: true,
                    error: upsert.error.message
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

        const icono = obtenerIcono(
            opciones.icon || 'settings'
        );

        const titulo = escapeHtml(opciones.title || '');
        const descripcion = escapeHtml(opciones.desc || '');

        const claseExtra = opciones.class
            ? ' ' + opciones.class
            : '';

        const estilo = opciones.style
            ? ' style="' + escapeHtml(opciones.style) + '"'
            : '';

        let accion = '';

        if (opciones.href) {
            accion = 'href="' + escapeHtml(opciones.href) + '"';
        } else if (opciones.onclick) {
            accion =
                'onclick="' +
                escapeHtml(opciones.onclick) +
                '"';
        }

        const etiqueta = opciones.href ? 'a' : 'button';

        return `
            <${etiqueta}
                class="cfg-item${claseExtra}"
                ${accion}
                ${estilo}
                ${etiqueta === 'button' ? 'type="button"' : ''}
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
            Math.random().toString(36).slice(2);

        return `
            <div class="cfg-item">

                ${
                    opciones.icon
                        ? `
                            <div class="cfg-item-icon">
                                ${obtenerIcono(opciones.icon)}
                            </div>
                        `
                        : ''
                }

                <div class="cfg-item-content">
                    <div class="cfg-item-title">
                        ${escapeHtml(opciones.title || '')}
                    </div>

                    <div class="cfg-item-desc">
                        ${escapeHtml(opciones.desc || '')}
                    </div>
                </div>

                <label class="cfg-toggle" for="${escapeHtml(id)}">
                    <input
                        type="checkbox"
                        id="${escapeHtml(id)}"
                        ${opciones.checked === true ? 'checked' : ''}
                        ${opciones.disabled === true ? 'disabled' : ''}
                        ${
                            opciones.onChange
                                ? 'onchange="' +
                                  escapeHtml(opciones.onChange) +
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

        const slot = document.querySelector('#cfgHeaderSlot');
        if (!slot) return;

        const titulo = escapeHtml(
            opciones.title || 'Configuración'
        );

        const subtitulo = escapeHtml(
            opciones.subtitle || ''
        );

        const backUrl = opciones.backUrl ||
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
                                onclick="${escapeHtml(opciones.action)}"
                            >
                                ${
                                    opciones.actionIcon
                                        ? obtenerIcono(opciones.actionIcon)
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
        let overlay = document.getElementById('cfgModal');

        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'cfgModal';
        overlay.className = 'cfg-modal-overlay';
        overlay.setAttribute('aria-hidden', 'true');

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

        overlay.addEventListener('click', function (evento) {
            if (evento.target === overlay) {
                cerrarModal(false);
            }
        });

        return overlay;
    }

    window.cfgConfirm = function (opciones) {
        opciones = opciones || {};

        const overlay = asegurarModal();

        const titulo = overlay.querySelector('#cfgModalTitle');
        const texto = overlay.querySelector('#cfgModalText');
        const cancelar = overlay.querySelector('#cfgModalCancel');
        const confirmar = overlay.querySelector('#cfgModalConfirm');

        return new Promise(function (resolve) {
            if (modalResolver) {
                modalResolver(false);
            }

            modalResolver = resolve;

            titulo.textContent = opciones.title ||
                tt('cfg_confirmar_accion', 'Confirmar acción');

            texto.textContent = opciones.text ||
                tt('cfg_quieres_continuar', '¿Quieres continuar?');

            cancelar.textContent = opciones.cancelText ||
                tt('cfg_cancelar', 'Cancelar');

            confirmar.textContent = opciones.confirmText ||
                tt('cfg_confirmar', 'Confirmar');

            confirmar.className = 'cfg-btn ' +
                (
                    opciones.danger
                        ? 'cfg-btn-danger'
                        : 'cfg-btn-primary'
                );

            overlay.classList.add('show');
            overlay.setAttribute('aria-hidden', 'false');

            cancelar.onclick = function () {
                cerrarModal(false);
            };

            confirmar.onclick = function () {
                cerrarModal(true);
            };
        });
    };

    function cerrarModal(resultado) {
        const overlay = document.getElementById('cfgModal');

        if (overlay) {
            overlay.classList.remove('show');
            overlay.setAttribute('aria-hidden', 'true');
        }

        if (modalResolver) {
            const resolver = modalResolver;
            modalResolver = null;
            resolver(resultado);
        }
    }

    /* ============================================================
       TOAST
       ============================================================ */

    window.cfgToast = function (mensaje, tipo, duracion) {
        let toast = document.getElementById('cfgToast');

        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cfgToast';
            toast.className = 'cfg-toast';

            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');

            document.body.appendChild(toast);
        }

        clearTimeout(toastTimer);

        toast.className = 'cfg-toast';

        if (tipo === 'success') {
            toast.classList.add('cfg-toast-success');
        }

        if (tipo === 'error') {
            toast.classList.add('cfg-toast-error');
        }

        if (tipo === 'warning') {
            toast.classList.add('cfg-toast-warning');
        }

        toast.textContent = mensaje || '';

        requestAnimationFrame(function () {
            toast.classList.add('show');
        });

        toastTimer = setTimeout(function () {
            toast.classList.remove('show');
        }, duracion || 3000);
    };

    /* ============================================================
       MICROINTERACCIONES
       Solo transform, brillo, color, sombra y opacidad.
       Nunca dimensiones, márgenes ni escalas de contenedores.
       ============================================================ */

    // Lista única de elementos interactivos del layout
    const SELECTOR_INTERACTIVO = [
        '.cfg-item',
        '.cfg-btn',
        '.cfg-header-back',
        '.cfg-header-action'
    ].join(',');

    // Elementos que reaccionan al toque con una compresión sutil
    const SELECTOR_PRESIONABLE = [
        '.cfg-item',
        '.cfg-btn',
        '.cfg-header-back',
        '.cfg-header-action'
    ].join(',');

    const CSS_LAYOUT = `
        .cfg-item,
        .cfg-btn,
        .cfg-header-back,
        .cfg-header-action,
        .cfg-toggle-slider {
            -webkit-tap-highlight-color: transparent;
        }

        ${SELECTOR_INTERACTIVO} {
            transition:
                color 140ms ease,
                background-color 160ms ease,
                border-color 160ms ease,
                box-shadow 180ms ease,
                filter 140ms ease,
                transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        ${SELECTOR_PRESIONABLE}:active {
            transform: scale(0.98);
            filter: brightness(1.08);
        }

        ${SELECTOR_INTERACTIVO}:focus-visible {
            outline: 2px solid var(--accent, #D4AF37);
            outline-offset: 2px;
        }

        .cfg-modal-overlay {
            transition: opacity 180ms ease;
        }

        .cfg-modal {
            transition: box-shadow 180ms ease, transform 180ms ease;
        }

        .cfg-toast {
            transition: opacity 180ms ease, transform 180ms ease;
        }

        @media (hover: hover) and (pointer: fine) {
            .cfg-item:hover,
            .cfg-btn:hover {
                box-shadow: 0 0 0 1px
                    color-mix(in srgb, var(--accent, #D4AF37) 22%, transparent);
            }
        }

        @media (prefers-reduced-motion: reduce) {
            ${SELECTOR_INTERACTIVO},
            .cfg-modal-overlay,
            .cfg-modal,
            .cfg-toast {
                transition: none !important;
                animation: none !important;
            }

            ${SELECTOR_PRESIONABLE}:active {
                transform: none !important;
            }
        }
    `;

    function instalarMicrointeraccionesLayout() {
        if (document.getElementById('cfg-motion-safe-css')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'cfg-motion-safe-css';
        style.textContent = CSS_LAYOUT;

        (document.head || document.documentElement).appendChild(style);
    }

    /* ============================================================
       INICIO
       ============================================================ */

    cargarPreferenciasLocales();
    instalarMicrointeraccionesLayout();

    if (document.readyState === 'loading') {
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

    window.addEventListener('storage', function (evento) {
        if (!evento.key) return;

        if (evento.newValue === null) {
            delete preferencias[evento.key];
            return;
        }

        preferencias[evento.key] = normalizarValor(
            evento.newValue
        );
    });
})();
