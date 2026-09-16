/* ================================================================
   SARIEL'S · CONFIGURACIÓN - LAYOUT Y NAVEGACIÓN
   Componentes reutilizables para todas las pantallas de config
   ================================================================ */

(function () {
    'use strict';

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

        const subtitleHtml = subtitle ? `<div class="cfg-header-subtitle">${subtitle}</div>` : '';
        const actionHtml = showAction 
            ? `<button class="cfg-header-action" onclick="${actionOnClick}" title="Acción">${actionIcon}</button>` 
            : '';

        return `
            <header class="cfg-header">
                <a href="${backUrl}" class="cfg-header-back" aria-label="Atrás">
                    ${window.cfgIcon('back')}
                </a>
                <div class="cfg-header-text">
                    <h1 class="cfg-header-title">${title}</h1>
                    ${subtitleHtml}
                </div>
                ${actionHtml}
            </header>
        `;
    }

    // ================================================================
    // ITEM de lista (link o botón)
    // ================================================================
    function cfgRenderItem(opts) {
        opts = opts || {};
        const icon = opts.icon ? `<div class="cfg-item-icon">${window.cfgIcon(opts.icon)}</div>` : '';
        const title = opts.title || '';
        const desc = opts.desc ? `<p class="cfg-item-desc">${opts.desc}</p>` : '';
        const chevron = opts.noChevron === true ? '' : `<div class="cfg-item-chevron">${window.cfgIcon('chevronRight')}</div>`;
        const href = opts.href;
        const onclick = opts.onclick;
        const id = opts.id ? `id="${opts.id}"` : '';
        const extraClass = opts.class || '';
        const extraStyle = opts.style ? `style="${opts.style}"` : '';

        const tag = href ? 'a' : 'button';
        const attr = href 
            ? `href="${href}"` 
            : `type="button"${onclick ? ` onclick="${onclick}"` : ''}`;

        return `
            <${tag} ${attr} class="cfg-item ${extraClass}" ${id} ${extraStyle}>
                ${icon}
                <div class="cfg-item-content">
                    <div class="cfg-item-title">${title}</div>
                    ${desc}
                </div>
                ${chevron}
            </${tag}>
        `;
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
        const desc = opts.desc ? `<p class="cfg-item-desc">${opts.desc}</p>` : '';
        const onChange = opts.onChange || '';

        return `
            <label class="cfg-item" style="cursor:pointer;">
                <div class="cfg-item-content">
                    <div class="cfg-item-title">${title}</div>
                    ${desc}
                </div>
                <div class="cfg-toggle">
                    <input type="checkbox" id="${id}" ${checked} ${disabled} ${onChange ? `onchange="${onChange}"` : ''} />
                    <span class="cfg-toggle-slider"></span>
                </div>
            </label>
        `;
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

        const items = options.map(opt => {
            const active = opt.value === current ? 'active' : '';
            return `
                <div class="cfg-radio-item ${active}" onclick="document.querySelectorAll('.cfg-radio-item').forEach(el=>el.classList.remove('active')); this.classList.add('active'); ${onChange ? `${onChange}('${opt.value}')` : ''}">
                    <div class="cfg-radio-circle"></div>
                    <div class="cfg-radio-content">
                        <div class="cfg-radio-title">${opt.title}</div>
                        ${opt.desc ? `<p class="cfg-radio-desc">${opt.desc}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="cfg-radio-group" data-name="${name}">${items}</div>`;
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

        return new Promise((resolve) => {
            const modalId = 'cfgModal_' + Date.now();
            const overlay = document.createElement('div');
            overlay.id = modalId;
            overlay.className = 'cfg-modal-overlay';
            overlay.innerHTML = `
                <div class="cfg-modal">
                    <h3 class="cfg-modal-title">${title}</h3>
                    ${text ? `<p class="cfg-modal-text">${text}</p>` : ''}
                    <div class="cfg-modal-actions">
                        <button class="cfg-btn cfg-btn-outline" data-action="cancel">${cancelText}</button>
                        <button class="cfg-btn ${danger ? 'cfg-btn-danger' : 'cfg-btn-primary'}" data-action="confirm">${confirmText}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            requestAnimationFrame(() => overlay.classList.add('show'));

            const close = (result) => {
                overlay.classList.remove('show');
                setTimeout(() => overlay.remove(), 200);
                resolve(result);
            };

            overlay.querySelector('[data-action="cancel"]').onclick = () => close(false);
            overlay.querySelector('[data-action="confirm"]').onclick = () => close(true);
            overlay.onclick = (e) => { if (e.target === overlay) close(false); };
        });
    }

    // ================================================================
    // INIT común de página
    // ================================================================
    function cfgInitPage(opts) {
        opts = opts || {};

        const init = async () => {
            const headerSlot = document.getElementById('cfgHeaderSlot');
            if (headerSlot) {
                headerSlot.outerHTML = cfgRenderHeader({
                    title: opts.title,
                    subtitle: opts.subtitle,
                    backUrl: opts.backUrl || '/features/perfil/configuracion/index.html',
                });
            }

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
    // HELPERS de localStorage (preferencias locales)
    // ================================================================
    const CFG_STORAGE_KEY = 'sariels_prefs_v1';

    function cfgGetPrefs() {
        try {
            return JSON.parse(localStorage.getItem(CFG_STORAGE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function cfgSetPref(key, value) {
        const prefs = cfgGetPrefs();
        prefs[key] = value;
        try {
            localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(prefs));
        } catch (e) {
            console.warn('No se pudo guardar preferencia:', e);
        }
    }

    function cfgGetPref(key, defaultVal) {
        const prefs = cfgGetPrefs();
        return prefs[key] !== undefined ? prefs[key] : defaultVal;
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
    window.cfgGetPrefs = cfgGetPrefs;
    window.cfgSetPref = cfgSetPref;
    window.cfgGetPref = cfgGetPref;

})();