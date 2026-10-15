/* ============================================
   CARRUSEL DE ANUNCIOS · IMAGEN - Csariel's
   Ruta: /features/anuncios/anuncios-carrusel.js
   Requiere: window.supabaseClient (perfil.html) y el contenedor #anunciosImagenes
   Rotación de 8 s. Se pausa al tocar o mantener presionado y sigue al soltar.
   ============================================ */

(function () {
    'use strict';

    var TIPO = 'imagen';
    var ROTACION_MS = 8000;
    var REFRESCO_MS = 5 * 60 * 1000;
    var MOVIMIENTO_TOQUE_PX = 8;

    function esperarCliente() {
        return new Promise(function (resolve) {
            var intentos = 0;
            (function revisar() {
                if (window.supabaseClient) return resolve(window.supabaseClient);
                if (++intentos > 100) return resolve(null);
                setTimeout(revisar, 100);
            })();
        });
    }

    function esRutaInterna(url) {
        return typeof url === 'string' && /^\/(?!\/)/.test(url);
    }

    function esEnlaceSeguro(url) {
        return typeof url === 'string' && url.indexOf('https://') === 0;
    }

    function mostrarAviso(texto) {
        var el = document.createElement('div');
        el.textContent = texto;
        el.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);' +
            'background:rgba(5,8,15,.97);border:1px solid #D4AF37;color:#D4AF37;' +
            'padding:10px 18px;border-radius:99px;font-size:.8rem;z-index:99999;max-width:90vw;text-align:center;';
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 3200);
    }

    function crearSlide(state, anuncio) {
        var slide = document.createElement('div');
        slide.className = 'anuncio-slide';
        slide.setAttribute('data-id', String(anuncio.id));

        var img = document.createElement('img');
        img.src = anuncio.media_url;
        img.alt = anuncio.titulo || 'Anuncio';
        img.loading = 'lazy';
        img.decoding = 'async';

        var etiqueta = document.createElement('span');
        etiqueta.className = 'anuncio-etiqueta';
        etiqueta.textContent = 'Anuncio';

        var info = document.createElement('div');
        info.className = 'anuncio-info';

        var titulo = document.createElement('div');
        titulo.className = 'anuncio-titulo';
        titulo.textContent = anuncio.titulo || '';
        info.appendChild(titulo);

        if (anuncio.texto) {
            var texto = document.createElement('div');
            texto.className = 'anuncio-texto';
            texto.textContent = anuncio.texto;
            info.appendChild(texto);
        }

        slide.appendChild(img);
        slide.appendChild(etiqueta);
        slide.appendChild(info);

        if (anuncio.usuario_id !== state.uid) {
            var reportar = document.createElement('button');
            reportar.type = 'button';
            reportar.className = 'anuncio-reportar';
            reportar.textContent = '⚑ Reportar';
            reportar.addEventListener('click', function (e) {
                e.stopPropagation();
                reportarAnuncio(state, anuncio.id);
            });
            slide.appendChild(reportar);
        }

        slide.addEventListener('click', function () {
            tocarAnuncio(state, anuncio);
        });

        return slide;
    }

    async function tocarAnuncio(state, anuncio) {
        if (state.movido) return;

        try {
            await state.client.rpc('anuncio_registrar_toque', { p_anuncio: anuncio.id });
        } catch (e) {
            console.warn('[Anuncios] toque no registrado:', e);
        }

        if (esRutaInterna(anuncio.destino_url)) {
            window.location.href = anuncio.destino_url;
        } else if (esEnlaceSeguro(anuncio.destino_url)) {
            window.open(anuncio.destino_url, '_blank', 'noopener,noreferrer');
        }
    }

    async function reportarAnuncio(state, id) {
        if (!window.confirm('¿Reportar este anuncio por contenido inapropiado o engañoso?')) return;

        try {
            const r = await state.client.rpc('anuncio_reportar', {
                p_anuncio: id,
                p_motivo: 'reportado_desde_carrusel'
            });
            if (r.error) throw r.error;
            mostrarAviso('Gracias. Revisaremos el anuncio.');
            state.anuncios = state.anuncios.filter(function (a) { return a.id !== id; });
            renderizar(state);
        } catch (e) {
            console.warn('[Anuncios] reporte fallido:', e);
            mostrarAviso('No se pudo enviar el reporte. Intenta de nuevo.');
        }
    }

    function mostrar(state, indice) {
        if (!state.anuncios.length) return;
        state.indice = indice;

        var slides = state.slider.querySelectorAll('.anuncio-slide');
        slides.forEach(function (s, i) { s.classList.toggle('active', i === indice); });

        var dots = state.dots.querySelectorAll('button');
        dots.forEach(function (d, i) { d.classList.toggle('active', i === indice); });

        var anuncio = state.anuncios[indice];
        if (anuncio && !state.vistos.has(anuncio.id)) {
            state.vistos.add(anuncio.id);
            state.client.rpc('anuncio_registrar_vista', { p_anuncio: anuncio.id })
                .catch(function (e) { console.warn('[Anuncios] vista no registrada:', e); });
        }

        programar(state);
    }

    function programar(state) {
        clearTimeout(state.timer);
        if (state.pausado || document.hidden || state.anuncios.length < 2) return;
        state.timer = setTimeout(function () {
            mostrar(state, (state.indice + 1) % state.anuncios.length);
        }, ROTACION_MS);
    }

    function pausar(state) {
        state.pausado = true;
        clearTimeout(state.timer);
    }

    function reanudar(state) {
        state.pausado = false;
        programar(state);
    }

    function renderizar(state) {
        state.slider.innerHTML = '';
        state.dots.innerHTML = '';

        if (!state.anuncios.length) {
            state.root.hidden = true;
            clearTimeout(state.timer);
            return;
        }
        state.root.hidden = false;

        state.anuncios.forEach(function (a, i) {
            state.slider.appendChild(crearSlide(state, a));

            var punto = document.createElement('button');
            punto.type = 'button';
            punto.setAttribute('aria-label', 'Anuncio ' + (i + 1));
            punto.addEventListener('click', function () { mostrar(state, i); });
            state.dots.appendChild(punto);
        });

        state.indice = Math.min(state.indice, state.anuncios.length - 1);
        mostrar(state, state.indice);
    }

    async function cargar(state) {
        try {
            const r = await state.client.rpc('anuncios_carrusel', { p_tipo: TIPO, p_limite: 20 });
            if (r.error) throw r.error;
            state.anuncios = Array.isArray(r.data) ? r.data : [];
        } catch (e) {
            console.warn('[Anuncios] no se pudieron cargar:', e);
            state.anuncios = [];
        }
        renderizar(state);
    }

    async function iniciar() {
        var root = document.getElementById('anunciosImagenes');
        if (!root) return;

        var client = await esperarCliente();
        if (!client) {
            root.hidden = true;
            return;
        }

        var sesion = await client.auth.getSession();
        var uid = sesion && sesion.data && sesion.data.session ? sesion.data.session.user.id : null;

        root.innerHTML = '';
        root.classList.add('anuncios-imagen-contenedor');

        var slider = document.createElement('div');
        slider.className = 'anuncios-slider';

        var dots = document.createElement('div');
        dots.className = 'anuncio-dots';

        root.appendChild(slider);
        root.appendChild(dots);

        var state = {
            root: root,
            slider: slider,
            dots: dots,
            client: client,
            uid: uid,
            anuncios: [],
            indice: 0,
            vistos: new Set(),
            timer: null,
            pausado: false,
            movido: false
        };

        // Pausa al tocar o mantener presionado; sigue al soltar
        var inicioX = 0, inicioY = 0;
        slider.addEventListener('pointerdown', function (e) {
            inicioX = e.clientX;
            inicioY = e.clientY;
            state.movido = false;
            pausar(state);
        });
        slider.addEventListener('pointermove', function (e) {
            if (Math.abs(e.clientX - inicioX) > MOVIMIENTO_TOQUE_PX ||
                Math.abs(e.clientY - inicioY) > MOVIMIENTO_TOQUE_PX) {
                state.movido = true;
            }
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evento) {
            slider.addEventListener(evento, function () {
                setTimeout(function () { reanudar(state); }, 400);
            });
        });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) pausar(state); else reanudar(state);
        });

        await cargar(state);
        setInterval(function () { cargar(state); }, REFRESCO_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
