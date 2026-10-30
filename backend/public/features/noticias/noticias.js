(function () {
    'use strict';

    const state = {
        category: 'general',
        session: null,
        token: null,
    };

    const statusEl = document.getElementById('status');
    const gridEl = document.getElementById('news-grid');
    const preguntaInput = document.getElementById('pregunta-input');
    const consultarBtn = document.getElementById('consultar-btn');
    const respuestaEl = document.getElementById('respuesta');

    function escapeHtml(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
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

    function formatearFecha(valor) {
        if (!valor) return 'Actualidad';
        const fecha = new Date(valor);
        if (Number.isNaN(fecha.getTime())) return 'Actualidad';
        return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    async function waitForSupabase() {
        for (let i = 0; i < 80; i++) {
            if (window.supabaseClient) return window.supabaseClient;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return null;
    }

    function setStatus(message, isError) {
        statusEl.textContent = message;
        statusEl.style.color = isError ? '#ff8d8d' : '#b6c9bf';
    }

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (state.token) {
            headers.Authorization = `Bearer ${state.token}`;
        }
        return headers;
    }

    async function fetchSession() {
        const client = await waitForSupabase();
        if (!client) {
            setStatus('Supabase no está disponible', true);
            return false;
        }

        try {
            const { data, error } = await client.auth.getSession();
            if (error) throw error;

            if (!data?.session) {
                setStatus('Sesión requerida. Inicia sesión antes de continuar.', true);
                return false;
            }

            state.session = data.session;
            state.token = data.session.access_token;
            setStatus(`Sesión activa · ${data.session.user?.email || 'usuario autenticado'}`);
            return true;
        } catch (error) {
            console.error('Error cargando sesión:', error);
            setStatus('No se pudo validar la sesión', true);
            return false;
        }
    }

    function renderLoading() {
        gridEl.innerHTML = '<div class="card"><h3>Cargando noticias…</h3><p>Consultando contenido actualizado.</p></div>';
    }

    function renderError(message) {
        gridEl.innerHTML = `<div class="card"><h3>Ocurrió un problema</h3><p class="error">${escapeHtml(message)}</p></div>`;
    }

    function renderNoticias(items) {
        if (!items || items.length === 0) {
            gridEl.innerHTML = '<div class="card"><h3>Sin resultados</h3><p>No hay noticias disponibles en este momento.</p></div>';
            return;
        }

        gridEl.innerHTML = items.map((item) => `
            <article class="card">
                <div class="meta">${escapeHtml(formatearFecha(item.publicadoEn))}</div>
                <h3>${escapeHtml(String(item.titulo || 'Sin título').slice(0, 140))}</h3>
                <p>${escapeHtml(String(item.resumen || 'Sin resumen').slice(0, 220))}</p>
                <div class="links">
                    ${(item.fuentes || []).map((fuente) => `
                        <a href="${escapeHtml(urlSegura(fuente.url))}" target="_blank" rel="noopener noreferrer">Fuente</a>
                    `).join('')}
                </div>
            </article>
        `).join('');
    }

    async function cargarNoticias() {
        if (!state.token) {
            renderError('Sesión no disponible.');
            return;
        }

        renderLoading();

        try {
            const params = new URLSearchParams({ categoria: state.category, region: 'MX' });
            const response = await fetch(`/api/noticias?${params.toString()}`, {
                method: 'GET',
                headers: getHeaders(),
            });

            if (response.status === 401) {
                renderError('Token inválido o expirado. Vuelve a iniciar sesión.');
                return;
            }

            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(body.error || 'No se pudieron cargar las noticias');
            }

            renderNoticias(body.items || []);
        } catch (error) {
            console.error('Error cargando noticias:', error);
            renderError(error.message || 'No se pudieron cargar las noticias.');
        }
    }

    async function consultarActualidad() {
        const pregunta = (preguntaInput.value || '').trim();
        if (!pregunta) {
            respuestaEl.style.display = 'block';
            respuestaEl.className = 'respuesta error';
            respuestaEl.textContent = 'Escribe una pregunta antes de consultar.';
            return;
        }

        if (!state.token) {
            respuestaEl.style.display = 'block';
            respuestaEl.className = 'respuesta error';
            respuestaEl.textContent = 'Sesión no disponible. Vuelve a iniciar sesión.';
            return;
        }

        respuestaEl.style.display = 'block';
        respuestaEl.className = 'respuesta';
        respuestaEl.textContent = 'Consultando información actualizada…';
        consultarBtn.disabled = true;

        try {
            const response = await fetch('/api/noticias/preguntar', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ pregunta }),
            });

            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || 'No se pudo consultar');

            respuestaEl.textContent = body.respuesta || 'No hubo respuesta disponible.';

            const fuentesSeguras = (body.fuentes || []).filter((f) => urlSegura(f.url) !== '#');
            if (fuentesSeguras.length > 0) {
                const links = fuentesSeguras
                    .map((f) => `\n- ${f.titulo}: ${urlSegura(f.url)}`)
                    .join('');
                respuestaEl.textContent += links;
            }

            preguntaInput.value = '';
        } catch (error) {
            respuestaEl.className = 'respuesta error';
            respuestaEl.textContent = error.message || 'Error al consultar';
        } finally {
            consultarBtn.disabled = false;
        }
    }

    document.querySelectorAll('.pill').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.pill').forEach((btn) => btn.classList.remove('active'));
            button.classList.add('active');
            state.category = button.dataset.category;
            cargarNoticias();
        });
    });

    consultarBtn.addEventListener('click', consultarActualidad);

    preguntaInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            consultarActualidad();
        }
    });

    document.addEventListener('DOMContentLoaded', async () => {
        const ok = await fetchSession();
        if (ok) {
            await cargarNoticias();
        } else {
            renderError('Debes iniciar sesión con Supabase para usar esta sección.');
        }
    });
})();
