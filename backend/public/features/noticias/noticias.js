(function () {
    'use strict';

    const SAVED_KEY = 'sariels_noticias_guardadas';
    const REGION = 'MX';

    const state = {
        category: 'general',
        token: null,
        items: [],
        saved: loadSaved(),
        busy: false,
    };

    const $ = (id) => document.getElementById(id);
    const el = {
        session: $('session'),
        feed: $('feed'),
        chips: $('chips'),
        fab: $('fab'),
        sheet: $('sheet'),
        backdrop: $('backdrop'),
        close: $('close'),
        input: $('pregunta-input'),
        ask: $('consultar-btn'),
        suggest: $('suggest'),
        answer: $('respuesta'),
        answerSrc: $('respuesta-fuentes'),
        toast: $('toast'),
    };

    /* ================= Utilidades ================= */

    function escapeHtml(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[c]);
    }

    function urlSegura(valor) {
        try {
            const url = new URL(String(valor || ''));
            return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#';
        } catch (_) {
            return '#';
        }
    }

    function hostOf(valor) {
        try {
            return new URL(valor).hostname.replace(/^www\./, '');
        } catch (_) {
            return 'Fuente';
        }
    }

    function tiempoRelativo(valor) {
        if (!valor) return 'Hoy';
        const fecha = new Date(valor);
        if (Number.isNaN(fecha.getTime())) return 'Hoy';
        const seg = Math.round((fecha.getTime() - Date.now()) / 1000);
        const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
        const umbrales = [
            ['year', 31536000], ['month', 2592000], ['day', 86400],
            ['hour', 3600], ['minute', 60],
        ];
        for (const [unidad, s] of umbrales) {
            if (Math.abs(seg) >= s) return rtf.format(Math.round(seg / s), unidad);
        }
        return 'hace un momento';
    }

    const ETIQUETAS = {
        general: 'Para ti', mexico: 'México', tecnologia: 'Tecnología',
        conectividad: 'Conectividad', cripto: 'Cripto', negocios: 'Negocios',
    };

    function letraDe(texto) {
        const limpio = String(texto || '').trim();
        return escapeHtml(limpio ? limpio.charAt(0).toUpperCase() : '•');
    }

    function loadSaved() {
        try {
            return new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'));
        } catch (_) {
            return new Set();
        }
    }

    function persistSaved() {
        try {
            localStorage.setItem(SAVED_KEY, JSON.stringify([...state.saved]));
        } catch (_) { /* almacenamiento no disponible */ }
    }

    function toast(mensaje) {
        el.toast.textContent = mensaje;
        el.toast.classList.add('on');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => el.toast.classList.remove('on'), 2200);
    }

    async function waitForSupabase() {
        for (let i = 0; i < 80; i++) {
            if (window.supabaseClient) return window.supabaseClient;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return null;
    }

    /* ================= Sesión ================= */

    function setSession(texto, esError) {
        el.session.textContent = texto;
        el.session.classList.toggle('error', Boolean(esError));
    }

    async function fetchSession() {
        const client = await waitForSupabase();
        if (!client) {
            setSession('Supabase no disponible', true);
            return false;
        }
        try {
            const { data, error } = await client.auth.getSession();
            if (error) throw error;
            if (!data?.session) {
                setSession('Sesión requerida', true);
                return false;
            }
            state.token = data.session.access_token;
            setSession(data.session.user?.email || 'Sesión activa');
            return true;
        } catch (error) {
            console.error('Error cargando sesión:', error);
            setSession('No se pudo validar la sesión', true);
            return false;
        }
    }

    function headers() {
        const h = { 'Content-Type': 'application/json' };
        if (state.token) h.Authorization = `Bearer ${state.token}`;
        return h;
    }

    /* ================= Feed ================= */

    function renderSkeleton() {
        el.feed.innerHTML = `
            <div class="skeleton sk-hero"></div>
            <div class="skeleton sk-card"></div>
            <div class="skeleton sk-card"></div>`;
    }

    function renderEmpty(titulo, texto, conReintento) {
        el.feed.innerHTML = `
            <div class="empty">
                <h3>${escapeHtml(titulo)}</h3>
                <p>${escapeHtml(texto)}</p>
                ${conReintento ? '<button class="retry" type="button" data-action="retry">Reintentar</button>' : ''}
            </div>`;
    }

    /*
     * Portada: foto del artículo si existe; si no, color por categoría
     * con la inicial de la fuente. Si la foto falla, se reemplaza por la
     * portada de respaldo (ver enlazarFotos).
     */
    function coverHtml(item, cat) {
        const imagen = urlSegura(item.imagen);
        const fuente = item.fuentes?.[0]?.titulo || hostOf(item.fuentes?.[0]?.url || '');

        if (imagen !== '#') {
            return `
                <div class="cover cat-${escapeHtml(cat)}">
                    <img class="photo" src="${escapeHtml(imagen)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                </div>`;
        }

        return `<div class="cover cat-${escapeHtml(cat)}"><span class="letra">${letraDe(fuente)}</span></div>`;
    }

    function enlazarFotos() {
        el.feed.querySelectorAll('img.photo').forEach((img) => {
            img.addEventListener('error', () => {
                const portada = img.parentElement;
                const fuente = portada.closest('[data-index]')?.querySelector('.src')?.textContent || '';
                img.remove();
                portada.insertAdjacentHTML('beforeend', `<span class="letra">${letraDe(fuente)}</span>`);
            }, { once: true });
        });
    }

    function actionsHtml(index, fuenteUrl) {
        const id = state.items[index]?.id;
        const guardada = state.saved.has(id);
        const url = urlSegura(fuenteUrl);
        return `
            <footer class="actions">
                <span class="src">${escapeHtml(hostOf(url))}</span>
                <button class="act" type="button" data-action="save" aria-pressed="${guardada}" aria-label="Guardar">
                    <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
                <button class="act" type="button" data-action="share" aria-label="Compartir">
                    <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
                </button>
                ${url !== '#' ? `<a class="read" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Leer</a>` : ''}
            </footer>`;
    }

    function encabezadoHtml(item, cat) {
        return `
            <div class="eyebrow">
                <span class="cat">${escapeHtml(ETIQUETAS[cat] || 'Noticias')}</span>
                <span>· ${escapeHtml(tiempoRelativo(item.publicadoEn))}</span>
            </div>`;
    }

    function heroHtml(item, index) {
        const cat = state.category;
        return `
            <article class="hero" data-index="${index}">
                ${coverHtml(item, cat)}
                <div class="scrim"></div>
                <div class="content">
                    ${encabezadoHtml(item, cat)}
                    <h2>${escapeHtml(item.titulo)}</h2>
                    <p>${escapeHtml(item.resumen)}</p>
                    ${actionsHtml(index, item.fuentes?.[0]?.url)}
                </div>
            </article>`;
    }

    function cardHtml(item, index) {
        const cat = state.category;
        return `
            <article class="card" data-index="${index}">
                ${coverHtml(item, cat)}
                ${encabezadoHtml(item, cat)}
                <h2>${escapeHtml(item.titulo)}</h2>
                <div class="summary-wrap">
                    <p class="summary" data-role="resumen">${escapeHtml(item.resumen)}</p>
                    <button class="more" type="button" data-action="more">Ver más</button>
                </div>
                ${actionsHtml(index, item.fuentes?.[0]?.url)}
            </article>`;
    }

    function renderFeed() {
        if (!state.items.length) {
            renderEmpty('Sin noticias por ahora', 'No hay contenido disponible en esta categoría.', true);
            return;
        }
        const [primera, ...resto] = state.items;
        el.feed.innerHTML = heroHtml(primera, 0) + resto.map((item, i) => cardHtml(item, i + 1)).join('');
        enlazarFotos();
    }

    async function loadFeed() {
        if (!state.token) {
            renderEmpty('Inicia sesión', 'Debes iniciar sesión con Supabase para ver las noticias.', false);
            return;
        }
        if (state.busy) return;
        state.busy = true;
        renderSkeleton();

        try {
            const params = new URLSearchParams({ categoria: state.category, region: REGION });
            const response = await fetch(`/api/noticias?${params.toString()}`, { method: 'GET', headers: headers() });

            if (response.status === 401) {
                renderEmpty('Sesión expirada', 'Vuelve a iniciar sesión para continuar.', false);
                return;
            }
            if (response.status === 404) {
                renderEmpty('Servicio no disponible', 'La API de noticias aún no está activa en el servidor. Intenta más tarde.', true);
                return;
            }
            if (response.status === 429) {
                renderEmpty('Demasiadas consultas', 'Espera unos minutos antes de volver a intentar.', true);
                return;
            }

            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.error || 'No se pudieron cargar las noticias');
            }

            state.items = Array.isArray(body.items) ? body.items : [];
            renderFeed();
        } catch (error) {
            console.error('Error cargando noticias:', error);
            renderEmpty('Ocurrió un problema', error.message || 'No se pudieron cargar las noticias.', true);
        } finally {
            state.busy = false;
        }
    }

    /* ================= Acciones de tarjeta ================= */

    async function compartir(item) {
        const url = urlSegura(item.fuentes?.[0]?.url);
        try {
            if (navigator.share) {
                await navigator.share({
                    title: item.titulo,
                    text: item.resumen,
                    url: url !== '#' ? url : undefined,
                });
                return;
            }
            const texto = url !== '#' ? `${item.titulo}\n${url}` : item.titulo;
            await navigator.clipboard.writeText(texto);
            toast('Enlace copiado');
        } catch (error) {
            if (error?.name !== 'AbortError') toast('No se pudo compartir');
        }
    }

    function toggleSaved(index, boton) {
        const item = state.items[index];
        if (!item) return;
        if (state.saved.has(item.id)) {
            state.saved.delete(item.id);
            boton.setAttribute('aria-pressed', 'false');
            toast('Quitada de guardadas');
        } else {
            state.saved.add(item.id);
            boton.setAttribute('aria-pressed', 'true');
            toast('Guardada');
        }
        persistSaved();
    }

    el.feed.addEventListener('click', (event) => {
        const boton = event.target.closest('[data-action]');
        if (!boton) return;
        const accion = boton.dataset.action;

        if (accion === 'retry') {
            loadFeed();
            return;
        }

        const tarjeta = boton.closest('[data-index]');
        const index = Number(tarjeta?.dataset.index);
        if (Number.isNaN(index)) return;

        if (accion === 'more') {
            const resumen = tarjeta.querySelector('[data-role="resumen"]');
            const abierto = resumen.classList.toggle('open');
            boton.textContent = abierto ? 'Ver menos' : 'Ver más';
        } else if (accion === 'save') {
            toggleSaved(index, boton);
        } else if (accion === 'share') {
            compartir(state.items[index]);
        }
    });

    /* ================= Chips de categoría ================= */

    el.chips.addEventListener('click', (event) => {
        const chip = event.target.closest('.chip');
        if (!chip) return;
        el.chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-selected', 'false'));
        chip.setAttribute('aria-selected', 'true');
        state.category = chip.dataset.category;
        loadFeed();
    });

    /* ================= Hoja de preguntas ================= */

    function abrirHoja() {
        el.sheet.classList.add('on');
        el.backdrop.classList.add('on');
        setTimeout(() => el.input.focus(), 300);
    }

    function cerrarHoja() {
        el.sheet.classList.remove('on');
        el.backdrop.classList.remove('on');
    }

    function renderFuentes(fuentes) {
        const seguras = (fuentes || []).filter((f) => urlSegura(f.url) !== '#');
        el.answerSrc.innerHTML = seguras.map((f) => `
            <a href="${escapeHtml(urlSegura(f.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.titulo || hostOf(f.url))}</a>
        `).join('');
    }

    function mostrarRespuesta(texto, esError) {
        el.answer.hidden = false;
        el.answer.className = esError ? 'answer err' : 'answer';
        el.answer.textContent = texto;
    }

    async function preguntar(texto) {
        const pregunta = String(texto || '').trim();
        if (!pregunta) {
            mostrarRespuesta('Escribe una pregunta antes de consultar.', true);
            return;
        }
        if (!state.token) {
            mostrarRespuesta('Sesión no disponible. Vuelve a iniciar sesión.', true);
            return;
        }

        el.answer.hidden = false;
        el.answer.className = 'answer';
        el.answer.innerHTML = '<span class="thinking"><i></i><i></i><i></i>&nbsp;Buscando información actualizada</span>';
        el.answerSrc.innerHTML = '';
        el.ask.disabled = true;

        try {
            const response = await fetch('/api/noticias/preguntar', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ pregunta }),
            });

            if (response.status === 404) throw new Error('El servicio de preguntas aún no está activo en el servidor.');
            if (response.status === 429) throw new Error('Llegaste al límite de consultas. Intenta en unos minutos.');

            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || 'No se pudo consultar');

            el.answer.textContent = body.respuesta || 'No hubo respuesta disponible.';
            renderFuentes(body.fuentes);
            el.input.value = '';
        } catch (error) {
            mostrarRespuesta(error.message || 'Error al consultar', true);
        } finally {
            el.ask.disabled = false;
        }
    }

    el.fab.addEventListener('click', abrirHoja);
    el.close.addEventListener('click', cerrarHoja);
    el.backdrop.addEventListener('click', cerrarHoja);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') cerrarHoja();
    });

    el.ask.addEventListener('click', () => preguntar(el.input.value));
    el.input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') preguntar(el.input.value);
    });
    el.suggest.addEventListener('click', (event) => {
        const boton = event.target.closest('[data-q]');
        if (!boton) return;
        el.input.value = boton.dataset.q;
        preguntar(boton.dataset.q);
    });

    /* ================= Arranque ================= */

    document.addEventListener('DOMContentLoaded', async () => {
        const ok = await fetchSession();
        if (ok) {
            await loadFeed();
        } else {
            renderEmpty('Inicia sesión', 'Debes iniciar sesión con Supabase para usar esta sección.', false);
        }
    });
})();
