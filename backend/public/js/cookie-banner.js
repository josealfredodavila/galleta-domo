/* ============================================================
   SARIEL'S — BANNER DE CONSENTIMIENTO GRANULAR v2.1
   Ubicación: backend/public/js/cookie-banner.js

   v2.1:
   - Registra cada decisión en Supabase (tabla consentimientos_cookies).
     Si no hay conexión, queda pendiente y se reintenta en la siguiente visita.
   - Claves de localStorage reales (las de v2.0 no existían en el código).
   - registrarPolitica(hash): evidencia de aceptación de la política.
   ============================================================ */
(function () {
    'use strict';

    if (document.getElementById('cookie-consent-root')) return;

    const STORAGE_KEY = 'sariels_cookie_consent';
    const CONSENT_VERSION = '2.0';
    const TABLA_LOG = 'consentimientos_cookies';

    // Claves que se eliminan si el usuario NO acepta preferencias.
    // Las esenciales (sesión, consentimiento, aceptación de términos) nunca se borran.
    const CLAVES_PREFERENCIAS = [
        'sariels_wallet',
        'mostrar_tema',
        'mostrar_color_acento',
        'mostrar_tamano_fuente',
        'contenido_mostrar_sensible',
        'contenido_auto_reproducir',
        'contenido_imagenes_alta_calidad',
        'contenido_videos_alta_calidad',
        'contenido_ahorrador_datos',
        'sariels_audiencia_prefs',
        'marquinhos_config',
        'marquinhos_accesorios_equipados',
        'sariels_estados_vistas'
    ];
    const PREFIJOS_PREFERENCIAS = ['marquinhos_hist_'];

    // 1. ESTILOS
    const style = document.createElement('style');
    style.textContent = `
        #cookie-consent-root {
            --cc-gold: #E5C158;
            --cc-gold-border: rgba(229, 193, 88, 0.35);
            --cc-text: #F8F9FA;
            --cc-text-sec: #E0E6ED;
            --cc-text-muted: #B8C2CC;
            --cc-bg-solid: #0D1117;
            --cc-bg-panel: #111622;
            position: fixed; inset: 0; z-index: 999999;
            display: flex; align-items: center; justify-content: center;
            padding: 20px; font-family: 'Inter', -apple-system, sans-serif;
            animation: cc-fade-in 0.25s ease-out;
        }
        #cookie-consent-root[hidden] { display: none !important; }
        @keyframes cc-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cc-slide-up { from { opacity: 0; transform: translateY(24px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

        #cookie-consent-root .cc-backdrop {
            position: absolute; inset: 0; background: rgba(5, 8, 15, 0.88);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        #cookie-consent-root .cc-panel {
            position: relative; width: 100%; max-width: 640px; max-height: 92vh;
            overflow-y: auto; background: var(--cc-bg-panel); border: 1px solid var(--cc-gold-border);
            border-radius: 16px; padding: 32px 28px; box-shadow: 0 0 60px rgba(229, 193, 88, 0.15), 0 20px 60px rgba(0,0,0,0.6);
            animation: cc-slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1); color: var(--cc-text); line-height: 1.6;
        }
        #cookie-consent-root .cc-panel::-webkit-scrollbar { width: 6px; }
        #cookie-consent-root .cc-panel::-webkit-scrollbar-thumb { background: var(--cc-gold-border); border-radius: 3px; }

        #cookie-consent-root .cc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--cc-gold-border); }
        #cookie-consent-root .cc-icon { font-size: 1.8rem; filter: drop-shadow(0 0 12px rgba(229,193,88,0.4)); }
        #cookie-consent-root h2.cc-title { font-family: 'Orbitron', monospace; font-size: 1.05rem; color: var(--cc-gold); margin: 0; }
        #cookie-consent-root .cc-intro { font-size: 0.9rem; color: var(--cc-text-sec); margin-bottom: 20px; }
        #cookie-consent-root .cc-intro a { color: var(--cc-gold); text-decoration: underline; text-underline-offset: 3px; }

        #cookie-consent-root .cc-categories { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
        #cookie-consent-root .cc-category { background: var(--cc-bg-solid); border: 1px solid var(--cc-gold-border); border-radius: 10px; padding: 14px 16px; }
        #cookie-consent-root .cc-cat-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        #cookie-consent-root .cc-cat-info { flex: 1; min-width: 0; }
        #cookie-consent-root .cc-cat-title { font-family: 'Orbitron', monospace; font-size: 0.82rem; color: var(--cc-gold); margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        #cookie-consent-root .cc-cat-base { font-size: 0.65rem; padding: 2px 8px; border-radius: 20px; background: rgba(184,194,204,0.12); color: #D0D9E3; border: 1px solid rgba(184,194,204,0.3); font-family: 'Inter', sans-serif; }
        #cookie-consent-root .cc-cat-base.required { background: rgba(0,229,255,0.1); color: #7FE7F5; border-color: rgba(0,229,255,0.35); }
        #cookie-consent-root .cc-cat-desc { font-size: 0.82rem; color: var(--cc-text-sec); line-height: 1.5; }

        #cookie-consent-root .cc-toggle { position: relative; display: inline-block; width: 46px; height: 26px; flex-shrink: 0; }
        #cookie-consent-root .cc-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
        #cookie-consent-root .cc-slider { position: absolute; cursor: pointer; inset: 0; background: rgba(184,194,204,0.2); border: 1px solid var(--cc-gold-border); border-radius: 26px; transition: all 0.3s ease; }
        #cookie-consent-root .cc-slider::before { content: ""; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: var(--cc-text-sec); border-radius: 50%; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        #cookie-consent-root .cc-toggle input:checked + .cc-slider { background: rgba(229,193,88,0.3); border-color: var(--cc-gold); }
        #cookie-consent-root .cc-toggle input:checked + .cc-slider::before { transform: translateX(20px); background: var(--cc-gold); box-shadow: 0 0 12px rgba(229,193,88,0.5); }
        #cookie-consent-root .cc-toggle input:disabled + .cc-slider { opacity: 0.55; cursor: not-allowed; }
        #cookie-consent-root .cc-toggle input:focus-visible + .cc-slider { outline: 2px solid var(--cc-gold); outline-offset: 3px; }

        #cookie-consent-root .cc-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
        #cookie-consent-root .cc-btn { flex: 1 1 auto; min-width: 140px; padding: 12px 20px; border-radius: 40px; font-family: 'Orbitron', monospace; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1px solid transparent; transition: all 0.25s ease; text-transform: uppercase; }
        #cookie-consent-root .cc-btn:disabled { opacity: 0.6; cursor: wait; }
        #cookie-consent-root .cc-btn-primary { background: var(--cc-gold); color: var(--cc-bg-solid); border-color: var(--cc-gold); }
        #cookie-consent-root .cc-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(229,193,88,0.4); }
        #cookie-consent-root .cc-btn-secondary { background: transparent; color: var(--cc-gold); border-color: var(--cc-gold-border); }
        #cookie-consent-root .cc-btn-secondary:hover { background: rgba(229,193,88,0.08); border-color: var(--cc-gold); }
        #cookie-consent-root .cc-btn-ghost { background: transparent; color: var(--cc-text-sec); border-color: rgba(184,194,204,0.25); flex-basis: 100%; }
        #cookie-consent-root .cc-btn-ghost:hover { color: var(--cc-text); border-color: rgba(184,194,204,0.5); }

        #cookie-consent-root .cc-footer-note { margin-top: 16px; font-size: 0.74rem; color: var(--cc-text-muted); text-align: center; }
        #cookie-consent-root .cc-footer-note a { color: var(--cc-gold); text-decoration: none; }

        #cookie-settings-fab { position: fixed; bottom: 20px; left: 20px; z-index: 999998; width: 44px; height: 44px; border-radius: 50%; background: var(--cc-bg-panel, #111622); border: 1px solid var(--cc-gold-border, rgba(229,193,88,0.35)); color: var(--cc-gold, #E5C158); font-size: 1.2rem; cursor: pointer; display: none; align-items: center; justify-content: center; transition: all 0.25s ease; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
        #cookie-settings-fab.visible { display: flex; }
        #cookie-settings-fab:hover { transform: scale(1.08) rotate(15deg); border-color: var(--cc-gold, #E5C158); box-shadow: 0 0 20px rgba(229,193,88,0.3); }

        @media (max-width: 520px) {
            #cookie-consent-root .cc-panel { padding: 24px 18px; border-radius: 12px; }
            #cookie-consent-root h2.cc-title { font-size: 0.92rem; }
            #cookie-consent-root .cc-btn { min-width: 100%; font-size: 0.72rem; }
        }
    `;
    document.head.appendChild(style);

    // 2. HTML
    const bannerHTML = `
        <div id="cookie-consent-root" hidden>
            <div class="cc-backdrop" data-cc-backdrop></div>
            <div class="cc-panel" role="dialog" aria-modal="true" aria-labelledby="cc-title">
                <div class="cc-header">
                    <span class="cc-icon" aria-hidden="true">◈</span>
                    <h2 class="cc-title" id="cc-title">Consentimiento de Cookies y Almacenamiento</h2>
                </div>
                <p class="cc-intro">
                    En <strong>Sariel's</strong> usamos cookies y almacenamiento local para operar la plataforma de forma segura.
                    Puedes aceptar todas, rechazar las no esenciales o configurar cada categoría.
                    Más información en nuestra <a href="/cookies.html">Política Institucional de Cookies</a>.
                </p>
                <form id="cc-form" novalidate>
                    <div class="cc-categories" role="group" aria-label="Categorías de cookies">
                        <div class="cc-category">
                            <div class="cc-cat-head">
                                <div class="cc-cat-info">
                                    <div class="cc-cat-title">Técnicas Esenciales <span class="cc-cat-base required">Siempre activas</span></div>
                                    <div class="cc-cat-desc">Sesión de usuario, seguridad perimetral y funcionamiento del sitio.</div>
                                </div>
                                <label class="cc-toggle" aria-label="Esenciales siempre activas">
                                    <input type="checkbox" id="cc-cat-essential" checked disabled />
                                    <span class="cc-slider"></span>
                                </label>
                            </div>
                        </div>
                        <div class="cc-category">
                            <div class="cc-cat-head">
                                <div class="cc-cat-info">
                                    <div class="cc-cat-title">Preferencias y Personalización <span class="cc-cat-base">Consentimiento</span></div>
                                    <div class="cc-cat-desc">Recuerdan tu wallet conectada, tema visual, tipografía y ajustes de contenido.</div>
                                </div>
                                <label class="cc-toggle" aria-label="Activar preferencias">
                                    <input type="checkbox" id="cc-cat-preferences" />
                                    <span class="cc-slider"></span>
                                </label>
                            </div>
                        </div>
                        <div class="cc-category">
                            <div class="cc-cat-head">
                                <div class="cc-cat-info">
                                    <div class="cc-cat-title">Analítica <span class="cc-cat-base">No activa</span></div>
                                    <div class="cc-cat-desc">Métricas agregadas. Actualmente <strong>no utilizamos</strong> analítica de terceros.</div>
                                </div>
                                <label class="cc-toggle" aria-label="Analítica no disponible">
                                    <input type="checkbox" id="cc-cat-analytics" disabled />
                                    <span class="cc-slider"></span>
                                </label>
                            </div>
                        </div>
                        <div class="cc-category">
                            <div class="cc-cat-head">
                                <div class="cc-cat-info">
                                    <div class="cc-cat-title">Marketing y Publicidad <span class="cc-cat-base">No activa</span></div>
                                    <div class="cc-cat-desc">Personalización de anuncios. Actualmente <strong>no utilizamos</strong> píxeles publicitarios.</div>
                                </div>
                                <label class="cc-toggle" aria-label="Marketing no disponible">
                                    <input type="checkbox" id="cc-cat-marketing" disabled />
                                    <span class="cc-slider"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="cc-actions">
                        <button type="button" class="cc-btn cc-btn-secondary" id="cc-reject-all">Rechazar no esenciales</button>
                        <button type="button" class="cc-btn cc-btn-primary" id="cc-accept-all">Aceptar todas</button>
                        <button type="button" class="cc-btn cc-btn-ghost" id="cc-save-selection">Guardar selección</button>
                    </div>
                </form>
                <p class="cc-footer-note">
                    Puedes cambiar tu decisión en cualquier momento desde el ícono <strong>⚙</strong> o en la
                    <a href="/cookies.html">Política de Cookies</a>.
                </p>
            </div>
        </div>
        <button id="cookie-settings-fab" aria-label="Configurar cookies" title="Configurar cookies">⚙</button>
    `;
    document.body.insertAdjacentHTML('beforeend', bannerHTML);

    // 3. ELEMENTOS
    const root = document.getElementById('cookie-consent-root');
    const fab = document.getElementById('cookie-settings-fab');
    const btnAcceptAll = document.getElementById('cc-accept-all');
    const btnRejectAll = document.getElementById('cc-reject-all');
    const btnSave = document.getElementById('cc-save-selection');
    const cbPreferences = document.getElementById('cc-cat-preferences');
    const cbAnalytics = document.getElementById('cc-cat-analytics');
    const cbMarketing = document.getElementById('cc-cat-marketing');

    // 4. LOCALSTORAGE
    function readConsent() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return (data && data.version === CONSENT_VERSION) ? data : null;
        } catch (e) { return null; }
    }

    function writeConsent(categories, pendiente) {
        const payload = {
            version: CONSENT_VERSION,
            timestamp: new Date().toISOString(),
            categories: {
                essential: true,
                preferences: !!categories.preferences,
                analytics: false,
                marketing: false
            },
            pendiente: !!pendiente
        };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
        return payload;
    }

    function marcarPendiente(valor) {
        const c = readConsent();
        if (!c) return;
        c.pendiente = !!valor;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch (e) {}
    }

    // 5. SUPABASE (registro de evidencia)
    // Usa el cliente compartido de app.js si existe; si no, no registra y queda pendiente.
    async function obtenerCliente() {
        if (window.supabaseClient && window.supabaseClient.from) return window.supabaseClient;
        if (typeof window.getSupabase === 'function') {
            try { return await window.getSupabase(); } catch (e) { return null; }
        }
        return null;
    }

    async function registrarEnSupabase(evento, categorias, hashDocumento) {
        try {
            const client = await obtenerCliente();
            if (!client) return false;

            let usuarioId = null;
            try {
                const s = await client.auth.getSession();
                usuarioId = (s && s.data && s.data.session && s.data.session.user.id) || null;
            } catch (e) {}

            const { error } = await client.from(TABLA_LOG).insert({
                usuario_id: usuarioId,
                evento: evento,
                version: CONSENT_VERSION,
                categorias: categorias,
                hash_documento: hashDocumento || null,
                user_agent: (navigator.userAgent || '').slice(0, 300),
                pagina: (location.pathname || '').slice(0, 200)
            });
            if (error) {
                console.warn('[Consent] No se registró en Supabase:', error.message);
                return false;
            }
            return true;
        } catch (e) {
            console.warn('[Consent] Error registrando:', e);
            return false;
        }
    }

    async function guardarYRegistrar(categories) {
        const saved = writeConsent(categories, true);
        const ok = await registrarEnSupabase('banner_guardado', saved.categories);
        if (ok) marcarPendiente(false);
        return ok;
    }

    // 6. APLICAR CONSENTIMIENTO
    function borrarPreferencias() {
        try {
            CLAVES_PREFERENCIAS.forEach(function (k) { localStorage.removeItem(k); });
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && PREFIJOS_PREFERENCIAS.some(function (p) { return k.indexOf(p) === 0; })) {
                    localStorage.removeItem(k);
                }
            }
        } catch (e) {}
    }

    function applyConsent(categories) {
        if (!categories.preferences) borrarPreferencias();
        window.dispatchEvent(new CustomEvent('sariels:consent-updated', {
            detail: { version: CONSENT_VERSION, categories: categories }
        }));
    }

    // 7. UI
    function showBanner() {
        root.hidden = false;
        document.body.style.overflow = 'hidden';
        setTimeout(function () { btnAcceptAll.focus(); }, 50);
    }

    function hideBanner() {
        root.hidden = true;
        document.body.style.overflow = '';
        fab.classList.add('visible');
    }

    function setTogglesFromCategories(cat) {
        cbPreferences.checked = !!cat.preferences;
    }

    async function commit(categories) {
        btnAcceptAll.disabled = btnRejectAll.disabled = btnSave.disabled = true;
        const saved = writeConsent(categories, true);
        applyConsent(saved.categories);
        hideBanner();

        const ok = await registrarEnSupabase('banner_guardado', saved.categories);
        if (ok) marcarPendiente(false);

        btnAcceptAll.disabled = btnRejectAll.disabled = btnSave.disabled = false;
    }

    btnAcceptAll.addEventListener('click', function () {
        cbPreferences.checked = true;
        commit({ preferences: true, analytics: false, marketing: false });
    });
    btnRejectAll.addEventListener('click', function () {
        cbPreferences.checked = false;
        commit({ preferences: false, analytics: false, marketing: false });
    });
    btnSave.addEventListener('click', function () {
        commit({ preferences: cbPreferences.checked, analytics: false, marketing: false });
    });

    fab.addEventListener('click', function () {
        const saved = readConsent();
        if (saved) setTogglesFromCategories(saved.categories);
        showBanner();
    });

    document.addEventListener('keydown', function (e) {
        if (!root.hidden && e.key === 'Escape') {
            e.preventDefault();
            btnSave.click();
        }
    });

    // 8. ACEPTACIÓN DE LA POLÍTICA (evidencia)
    // hashDocumento: SHA-256 del texto visible de la política en el momento de aceptar.
    async function registrarPolitica(hashDocumento) {
        const c = readConsent();
        const categorias = c ? c.categories : { essential: true, preferences: false, analytics: false, marketing: false };
        return registrarEnSupabase('politica_aceptada', categorias, hashDocumento);
    }

    // 9. INICIO
    const existing = readConsent();
    if (existing) {
        applyConsent(existing.categories);
        fab.classList.add('visible');

        // Reintentar el registro si la visita anterior no llegó a Supabase
        if (existing.pendiente) {
            registrarEnSupabase('banner_guardado', existing.categories).then(function (ok) {
                if (ok) marcarPendiente(false);
            });
        }
    } else {
        showBanner();
    }

    window.SarielsConsent = {
        get: readConsent,
        reopen: function () {
            const saved = readConsent();
            if (saved) setTogglesFromCategories(saved.categories);
            showBanner();
        },
        has: function (cat) {
            const c = readConsent();
            return !!(c && c.categories && c.categories[cat]);
        },
        registrarPolitica: registrarPolitica,
        version: CONSENT_VERSION
    };
})();
