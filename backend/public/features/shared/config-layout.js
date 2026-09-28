/* ================================================================
   SARIEL'S · CONFIGURACIÓN - LAYOUT Y NAVEGACIÓN
   AHORA CON SINCRONIZACIÓN SUPABASE + localStorage FALLBACK

   IMPORTANTE:
   - Este archivo YA NO crea un cliente Supabase propio.
   - Usa window.supabaseClient creado por el bloque centralizado
     de cada página vía /api/config/public.
   - Si window.supabaseClient no existe todavía, espera.
   - No contiene credenciales hardcodeadas.
   ================================================================ */

(function () {
    'use strict';

    // ================================================================
    // CLIENTE SUPABASE
    // Reutiliza window.supabaseClient (creado por cada página).
    // Ya NO crea uno propio con credenciales.
    // ================================================================
    function getSupabase() {
        if (window.supabaseClient) {
            return window.supabaseClient;
        }
        return null;
    }

    // Espera a que window.supabaseClient esté disponible.
    // Útil cuando un HTML no tiene el bloque centralizado.
    async function esperarSupabase(maxMs) {
        const limite = maxMs || 10000;
        const inicio = Date.now();

        while (Date.now() - inicio < limite) {
            if (window.supabaseClient) {
                return window.supabaseClient;
            }
            await new Promise(function (r) { setTimeout(r, 100); });
        }

        console.warn('[Config] window.supabaseClient no está disponible. Revisa /api/config/public.');
        return null;
    }

    // ================================================================
    // TOAST
    // ================================================================
    function cfgToast(msg, type) {
        type = type || '';
        let t = document.getElementById('cfgToast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'cfgToast';
            t.className = 'cfg-toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.className = 'cfg-toast show';
        if (type === 'success') t.classList.add('cfg-toast-success');
        else if (type === 'error') t.classList.add('cfg-toast-error');
        else if (type === 'warning') t.classList.add('cfg-toast-warning');

        clearTimeout(t._timeout);
        t._timeout = setTimeout(() => {
            t.classList.remove('show');
        }, 3000);
    }

    // ================================================================
    // HEADER con botón atrás
    // ================================================================
    function cfgRenderHeader(opts) {
        opts = opts || {};
        const title = opts.title || 'Configuración';
        const subtitle = opts.subtitle || '';
        const backUrl = opts.backUrl || '/features/perfil/configuracion/index.html';
        const showAction = opts.showAction || false;
        const actionIcon = opts.actionIcon || '⚙️';
        const actionOnClick = opts.actionOnClick || '';

        const subtitleHtml = subtitle ? '<div class="cfg-header-subtitle">' + subtitle + '</div>' : '';
        const actionHtml = showAction
            ? '<button class="cfg-header-action" onclick="' + actionOnClick + '" title="Acción">' + actionIcon + '</button>'
            : '';

        return (
            '<header class="cfg-header">' +
                '<a href="' + backUrl + '" class="cfg-header-back" aria-label="Atrás">' +
                    window.cfgIcon('back') +
                '</a>' +
                '<div class="cfg-header-text">' +
                    '<h1 class="cfg-header-title">' + title + '</h1>' +
                    subtitleHtml +
                '</div>' +
                actionHtml +
            '</header>'
        );
    }

    // ================================================================
    // ITEM de lista
    // Si NO tiene href ni onclick, se renderiza como div no clickeable.
    // ================================================================
    function cfgRenderItem(opts) {
        opts = opts || {};
        const icon = opts.icon ? '<div class="cfg-item-icon">' + window.cfgIcon(opts.icon) + '</div>' : '';
        const title = opts.title || '';
        const desc = opts.desc ? '<p class="cfg-item-desc">' + opts.desc + '</p>' : '';
        const chevron = opts.noChevron === true ? '' : '<div class="cfg-item-chevron">' + window.cfgIcon('chevronRight') + '</div>';
        const href = opts.href;
        const onclick = opts.onclick;
        const id = opts.id ? 'id="' + opts.id + '"' : '';
        const extraClass = opts.class || '';
        const extraStyle = opts.style ? 'style="' + opts.style + '"' : '';

        const esInformativo = !href && !onclick;

        if (esInformativo) {
            return (
                '<div class="cfg-item ' + extraClass + '" ' + id + ' ' + extraStyle + ' style="cursor: default; pointer-events: none; ' + (opts.style || '') + '">' +
                    icon +
                    '<div class="cfg-item-content">' +
                        '<div class="cfg-item-title">' + title + '</div>' +
                        desc +
                    '</div>' +
                    chevron +
                '</div>'
            );
        }

        if (href) {
            return (
                '<a href="' + href + '" class="cfg-item ' + extraClass + '" ' + id + ' ' + extraStyle + '>' +
                    icon +
                    '<div class="cfg-item-content">' +
                        '<div class="cfg-item-title">' + title + '</div>' +
                        desc +
                    '</div>' +
                    chevron +
                '</a>'
            );
        }

        return (
            '<button type="button" onclick="' + onclick + '" class="cfg-item ' + extraClass + '" ' + id + ' ' + extraStyle + '>' +
                icon +
                '<div class="cfg-item-content">' +
                    '<div class="cfg-item-title">' + title + '</div>' +
                    desc +
                '</div>' +
                chevron +
            '</button>'
        );
    }

    // ================================================================
    // TOGGLE
    // ================================================================
    function cfgRenderToggle(opts) {
        opts = opts || {};
        const id = opts.id || 'toggle_' + Math.random().toString(36).slice(2, 8);
        const checked = opts.checked === true ? 'checked' : '';
        const disabled = opts.disabled === true ? 'disabled' : '';
        const title = opts.title || '';
        const desc = opts.desc ? '<p class="cfg-item-desc">' + opts.desc + '</p>' : '';
        const onChange = opts.onChange || '';

        return (
            '<label class="cfg-item" style="cursor:pointer;">' +
                '<div class="cfg-item-content">' +
                    '<div class="cfg-item-title">' + title + '</div>' +
                    desc +
                '</div>' +
                '<div class="cfg-toggle">' +
                    '<input type="checkbox" id="' + id + '" ' + checked + ' ' + disabled + ' ' + (onChange ? 'onchange="' + onChange + '"' : '') + ' />' +
                    '<span class="cfg-toggle-slider"></span>' +
                '</div>' +
            '</label>'
        );
    }

    // ================================================================
    // RADIO GROUP
    // ================================================================
    function cfgRenderRadioGroup(opts) {
        opts = opts || {};
        const name = opts.name || 'radio_' + Date.now();
        const options = opts.options || [];
        const current = opts.current || '';
        const onChange = opts.onChange || '';

        const items = options.map(function (opt) {
            const active = opt.value === current ? 'active' : '';
            return (
                '<div class="cfg-radio-item ' + active + '" onclick="document.querySelectorAll(\'.cfg-radio-item\').forEach(el=>el.classList.remove(\'active\')); this.classList.add(\'active\'); ' + (onChange ? onChange + "('" + opt.value + "')" : '') + '">' +
                    '<div class="cfg-radio-circle"></div>' +
                    '<div class="cfg-radio-content">' +
                        '<div class="cfg-radio-title">' + opt.title + '</div>' +
                        (opt.desc ? '<p class="cfg-radio-desc">' + opt.desc + '</p>' : '') +
                    '</div>' +
                '</div>'
            );
        }).join('');

        return '<div class="cfg-radio-group" data-name="' + name + '">' + items + '</div>';
    }

    // ================================================================
    // MODAL DE CONFIRMACIÓN
    // ================================================================
    function cfgConfirm(opts) {
        opts = opts || {};
        const title = opts.title || '¿Estás seguro?';
        const text = opts.text || '';
        const confirmText = opts.confirmText || 'Confirmar';
        const cancelText = opts.cancelText || 'Cancelar';
        const danger = opts.danger === true;

        return new Promise(function (resolve) {
            const modalId = 'cfgModal_' + Date.now();
            const overlay = document.createElement('div');
            overlay.id = modalId;
            overlay.className = 'cfg-modal-overlay';
            overlay.innerHTML =
                '<div class="cfg-modal">' +
                    '<h3 class="cfg-modal-title">' + title + '</h3>' +
                    (text ? '<p class="cfg-modal-text">' + text + '</p>' : '') +
                    '<div class="cfg-modal-actions">' +
                        '<button class="cfg-btn cfg-btn-outline" data-action="cancel">' + cancelText + '</button>' +
                        '<button class="cfg-btn ' + (danger ? 'cfg-btn-danger' : 'cfg-btn-primary') + '" data-action="confirm">' + confirmText + '</button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(overlay);

            requestAnimationFrame(function () { overlay.classList.add('show'); });

            const close = function (result) {
                overlay.classList.remove('show');
                setTimeout(function () { overlay.remove(); }, 200);
                resolve(result);
            };

            overlay.querySelector('[data-action="cancel"]').onclick = function () { close(false); };
            overlay.querySelector('[data-action="confirm"]').onclick = function () { close(true); };
            overlay.onclick = function (e) { if (e.target === overlay) close(false); };
        });
    }

    // ================================================================
    // INIT común de página
    // ================================================================
    function cfgInitPage(opts) {
        opts = opts || {};

        const init = async function () {
            const headerSlot = document.getElementById('cfgHeaderSlot');
            if (headerSlot) {
                headerSlot.outerHTML = cfgRenderHeader({
                    title: opts.title,
                    subtitle: opts.subtitle,
                    backUrl: opts.backUrl || '/features/perfil/configuracion/index.html'
                });
            }

            await cfgCargarPreferencias();

            if (typeof opts.onReady === 'function') {
                await opts.onReady();
            }

            document.body.classList.add('cfg-ready');
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    // ================================================================
    // SISTEMA DE PREFERENCIAS (Supabase + localStorage fallback)
    // ================================================================
    const CFG_STORAGE_KEY = 'sariels_prefs_v1';

    let prefsCache = null;
    let supabaseReady = false;

    function cfgGetPrefsLocal() {
        try {
            return JSON.parse(localStorage.getItem(CFG_STORAGE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function cfgSavePrefsLocal(prefs) {
        try {
            localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(prefs));
        } catch (e) {
            console.warn('No se pudo guardar preferencia local:', e);
        }
    }

    async function cfgCargarPreferencias() {
        prefsCache = cfgGetPrefsLocal();

        const client = await esperarSupabase(10000);
        if (!client) {
            console.warn('⚠️ Supabase no disponible. Usando solo localStorage.');
            return prefsCache;
        }

        try {
            const { data, error } = await client.rpc('obtener_mis_preferencias');

            if (error) {
                if (error.message && error.message.indexOf('Usuario no autenticado') !== -1) {
                    console.log('ℹ️ Usuario no autenticado. Usando localStorage.');
                    return prefsCache;
                }
                throw error;
            }

            if (data && typeof data === 'object') {
                prefsCache = data;
                cfgSavePrefsLocal(data);
                supabaseReady = true;
                console.log('✅ Preferencias cargadas desde Supabase:', data);
            }

            return prefsCache;
        } catch (error) {
            console.warn('⚠️ No se pudieron cargar preferencias desde Supabase. Usando localStorage.', error);
            return prefsCache;
        }
    }

    async function cfgSetPrefs(prefs) {
        prefsCache = prefs;
        cfgSavePrefsLocal(prefs);

        const client = await esperarSupabase(10000);
        if (!client) return;

        try {
            const { error } = await client.rpc('actualizar_mis_preferencias', {
                p_prefs: prefs
            });
            if (error) throw error;
            console.log('✅ Preferencias guardadas en Supabase');
        } catch (error) {
            console.warn('⚠️ Guardado local; pendiente sync Supabase:', error);
        }
    }

    function cfgGetPref(key, defaultVal) {
        if (!prefsCache) prefsCache = cfgGetPrefsLocal();
        return prefsCache[key] !== undefined ? prefsCache[key] : defaultVal;
    }

    async function cfgSetPref(key, value) {
        if (!prefsCache) prefsCache = cfgGetPrefsLocal();
        prefsCache[key] = value;
        cfgSavePrefsLocal(prefsCache);

        const client = await esperarSupabase(10000);
        if (!client) return;

        try {
            const { error } = await client.rpc('actualizar_preferencia', {
                p_key: key,
                p_value: value
            });
            if (error) {
                if (error.message && error.message.indexOf('Usuario no autenticado') !== -1) {
                    console.log('ℹ️ Sin sesión. Guardado solo local.');
                    return;
                }
                throw error;
            }
            console.log('✅ Preferencia sincronizada:', key, '=', value);
        } catch (error) {
            console.warn('⚠️ Guardado local; pendiente sync Supabase:', error);
        }
    }

    async function cfgSincronizar() {
        await cfgCargarPreferencias();
        return prefsCache;
    }

    // ================================================================
    // EXPORTAR
    // ================================================================
    window.cfgToast = cfgToast;
    window.cfgRenderHeader = cfgRenderHeader;
    window.cfgRenderItem = cfgRenderItem;
    window.cfgRenderToggle = cfgRenderToggle;
    window.cfgRenderRadioGroup = cfgRenderRadioGroup;
    window.cfgConfirm = cfgConfirm;
    window.cfgInitPage = cfgInitPage;
    window.cfgGetPrefs = cfgGetPrefsLocal;
    window.cfgSetPrefs = cfgSetPrefs;
    window.cfgGetPref = cfgGetPref;
    window.cfgSetPref = cfgSetPref;
    window.cfgCargarPreferencias = cfgCargarPreferencias;
    window.cfgSincronizar = cfgSincronizar;
    window.cfgEsperarSupabase = esperarSupabase;

})();