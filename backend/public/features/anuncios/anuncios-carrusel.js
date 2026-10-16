/* ============================================
   ANUNCIOS · IMAGEN dentro del carrusel - Csariel's
   Ruta: /features/anuncios/anuncios-carrusel.js
   Inserta una tarjeta de anuncio dentro de .carrusel-3d-track,
   justo después de la tarjeta Perfil. Rota cada 8 s y se pausa
   al tocar o mantener presionado. Requiere carrusel-3d.js.
   ============================================ */

(function () {
    'use strict';

    var TIPO = 'imagen';
    var ROTACION_MS = 8000;
    var REFRESCO_MS = 5 * 60 * 1000;
    var MOVIMIENTO_TOQUE_PX = 8;

    var state = {
        client: null,
        uid: null,
        anuncios: [],
        indice: 0,
        vistos: new Set(),
        timer: null,
        pausado: false,
        movido: false,
        card: null,
        inicioX: 0,
        inicioY: 0
    };

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

    // Ejecuta fn cuando el carrusel ya esté listo (o ya lo estaba)
    function cuandoCarruselListo(fn) {
        if (window.carrusel3D && typeof window.carrusel3D.refrescar === 'function') {
            fn();
        } else {
            window.addEventListener('carrusel3d:listo', fn, { once: true });
        }
    }

    function recalcularCarrusel() {
        cuandoCarruselListo(function () {
            if (window.carrusel3D) window.carrusel3D.refrescar();
        });
    }

    function anuncioActual() {
        return state.anuncios[state.indice] || null;
    }

    // Tarjeta de anuncio (se crea una sola vez)
    function crearCard() {
        var card = document.createElement('div');
        card.className = 'carrusel-3d-card anuncio-card';
        card.style.setProperty('--c', '#D4AF37');
        card.setAttribute('aria-label', 'Anuncio');

        var img = document.createElement('img');
        img.className = 'anuncio-img';
        img.alt = '';
        img.decoding = 'async';
        img.loading = 'lazy';

        var etiqueta = document.createElement('span');
        etiqueta.className = 'anuncio-etiqueta';
        etiqueta.textContent = 'Anuncio';

        var titulo = document.createElement('div');
        titulo.className = 'card-title anuncio-titulo';

        var texto = document.createElement('div');
        texto.className = 'card-desc anuncio-texto';

        var reportar = document.createElement('button');
        reportar.type = 'button';
        reportar.className = 'anuncio-reportar';
        reportar.textContent = '⚑ Reportar';
        reportar.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            reportarActual();
        });

        card.appendChild(img);
        card.appendChild(etiqueta);
        card.appendChild(titulo);
        card.appendChild(texto);
        card.appendChild(reportar);

        card.addEventListener('click', function (e) {
            if (state.movido) return;
            tocarActual();
        });

        card.addEventListener('pointerdown', function (e) {
            state.inicioX = e.clientX;
            state.inicioY = e.clientY;
            state.movido = false;
            pausar();
        });
        card.addEventListener('pointermove', function (e) {
            if (Math.abs(e.clientX - state.inicioX) > MOVIMIENTO_TOQUE_PX ||
                Math.abs(e.clientY - state.inicioY) > MOVIMIENTO_TOQUE_PX) {
                state.movido = true;
            }
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evento) {
            card.addEventListener(evento, function () {
                setTimeout(reanudar, 400);
            });
        });

        state.card = card;
        return card;
    }

    // Coloca la tarjeta después de Perfil (o en la posición 2 si no se encuentra)
    function montarCard() {
        var track = document.querySelector('.carrusel-3d-track');
        if (!track || !state.card) return false;
        if (!state.card.isConnected) {
            var perfil = track.querySelector('a.carrusel-3d-card[href*="/features/perfil/perfil.html"]');
            var referencia = perfil ? perfil.nextSibling : (track.children[2] || null);
            track.insertBefore(state.card, referencia);
        }
        return true;
    }

    function quitarCard() {
        if (state.card && state.card.isConnected) state.card.remove();
        recalcularCarrusel();
    }

    function pintar(anuncio) {
        var card = state.card;
        if (!card || !anuncio) return;

        var img = card.querySelector('.anuncio-img');
        img.classList.add('cambiando');
        setTimeout(function () {
            img.src = anuncio.media_url;
            img.alt = anuncio.titulo || 'Anuncio';
            img.classList.remove('cambiando');
        }, 250);

        card.querySelector('.anuncio-titulo').textContent = anuncio.titulo || '';

        var texto = card.querySelector('.anuncio-texto');
        texto.textContent = anuncio.texto || '';
        texto.style.display = anuncio.texto ? '' : 'none';

        card.querySelector('.anuncio-reportar').style.display =
            anuncio.usuario_id === state.uid ? 'none' : '';

        card.setAttribute('data-id', String(anuncio.id));
        card.setAttribute('data-destino', anuncio.destino_url || '');
    }

    function programar() {
        clearTimeout(state.timer);
        if (state.pausado || document.hidden || state.anuncios.length < 2) return;
        state.timer = setTimeout(function () {
            mostrar((state.indice + 1) % state.anuncios.length);
        }, ROTACION_MS);
    }

    function mostrar(indice) {
        if (!state.anuncios.length) return;
        state.indice = indice;

        var anuncio = anuncioActual();
        pintar(anuncio);

        if (anuncio && !state.vistos.has(anuncio.id)) {
            state.vistos.add(anuncio.id);
            state.client.rpc('anuncio_registrar_vista', { p_anuncio: anuncio.id })
                .catch(function (e) { console.warn('[Anuncios] vista no registrada:', e); });
        }

        programar();
    }

    function pausar() {
        state.pausado = true;
        clearTimeout(state.timer);
    }

    function reanudar() {
        state.pausado = false;
        programar();
    }

    async function tocarActual() {
        var anuncio = anuncioActual();
        if (!anuncio) return;

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

    async function reportarActual() {
        var anuncio = anuncioActual();
        if (!anuncio) return;
        if (!window.confirm('¿Reportar este anuncio por contenido inapropiado o engañoso?')) return;

        try {
            const r = await state.client.rpc('anuncio_reportar', {
                p_anuncio: anuncio.id,
                p_motivo: 'reportado_desde_carrusel'
            });
            if (r.error) throw r.error;
            mostrarAviso('Gracias. Revisaremos el anuncio.');
            state.anuncios = state.anuncios.filter(function (a) { return a.id !== anuncio.id; });
            aplicarAnuncios();
        } catch (e) {
            console.warn('[Anuncios] reporte fallido:', e);
            mostrarAviso('No se pudo enviar el reporte. Intenta de nuevo.');
        }
    }

    // Muestra u oculta la tarjeta según haya anuncios disponibles
    function aplicarAnuncios() {
        clearTimeout(state.timer);

        if (!state.anuncios.length) {
            quitarCard();
            return;
        }

        if (state.indice >= state.anuncios.length) state.indice = 0;
        montarCard();
        recalcularCarrusel();
        mostrar(state.indice);
    }

    async function cargar() {
        try {
            const r = await state.client.rpc('anuncios_carrusel', { p_tipo: TIPO, p_limite: 20 });
            if (r.error) throw r.error;
            state.anuncios = Array.isArray(r.data) ? r.data : [];
        } catch (e) {
            console.warn('[Anuncios] no se pudieron cargar:', e);
            state.anuncios = [];
        }
        aplicarAnuncios();
    }

    async function iniciar() {
        if (!document.querySelector('.carrusel-3d-track')) return;

        var client = await esperarCliente();
        if (!client) return;
        state.client = client;

        var sesion = await client.auth.getSession();
        state.uid = sesion && sesion.data && sesion.data.session ? sesion.data.session.user.id : null;

        crearCard();

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) pausar(); else reanudar();
        });

        // Espera a que el carrusel 3D esté listo antes de insertar
        cuandoCarruselListo(function () {
            cargar();
            setInterval(cargar, REFRESCO_MS);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();