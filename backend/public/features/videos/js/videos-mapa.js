// ================================================================
// CSARIEL'S · VIDEOS · MAPA DE UBICACIÓN (v1.1)
// ================================================================
// Muestra la ubicación de un video en la hoja #hojaMapa con Leaflet.
// - Crea el mapa la primera vez y después reutiliza la misma instancia.
// - Coloca un marcador con el nombre de la ubicación y sus coordenadas.
// - Espera a que la hoja termine su animación antes de medir el mapa.
// Expuesto en window.VideosApp.mapa y window.abrirMapa.
// Requiere: config, utils, hojas. Leaflet (L) cargado antes.
//
// Cambios v1.1:
//  - Validación de lat/lng con Number + Number.isFinite; aviso con
//    U.showToast si faltan coordenadas o Leaflet, en vez de fallar
//    en silencio.
//  - Medición segura en hoja móvil: se reutiliza/crea S.mapaLeaflet
//    tras RETARDO_ANIMACION_MS, se limpian marcadores previos, se
//    coloca el pin con nombre y coords formateadas, se abre popup
//    y se llama invalidateSize() de forma protegida.
//  - Respaldo de red en tiles: manejo de 'tileerror' con aviso suave
//    (una sola vez por sesión de mapa) para conexiones lentas.
//  - Alias global window.abrirMapa además de VA.mapa.abrirMapa.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils || !VA.hojas) {
        console.error('[Videos] videos-mapa.js requiere config, utils y hojas.');
        return;
    }
    if (VA.mapa) return;

    var U = VA.utils;
    var S = VA.state;

    var ID_MAPA = 'mapaLeaflet';
    var RETARDO_ANIMACION_MS = 350;
    var ESTILO_MAPA = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    var ZOOM_INICIAL = 15;

    /* Bandera para no spamear avisos si los tiles fallan repetidamente. */
    var avisoTilesMostrado = false;

    /* Muestra un aviso suave, tolerando distintas firmas de showToast. */
    function avisar(mensaje, tipo) {
        try {
            if (U && typeof U.showToast === 'function') {
                U.showToast(mensaje, tipo || 'info');
            }
        } catch (e) {
            /* No romper el flujo si el toast falla. */
        }
    }

    /* Devuelve {ok:true, lat, lng} si las coordenadas son válidas. */
    function validarCoordenadas(lat, lng) {
        var nLat = Number(lat);
        var nLng = Number(lng);

        if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
            return { ok: false };
        }
        if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
            return { ok: false };
        }
        return { ok: true, lat: nLat, lng: nLng };
    }

    /* Formatea un número a 4 decimales sin lanzar si no es numérico. */
    function formatearCoord(n) {
        return Number.isFinite(n) ? n.toFixed(4) : '—';
    }

    /* Crea el mapa la primera vez. Después solo se reutiliza. */
    function crearMapa(lat, lng) {
        var mapa = L.map(ID_MAPA, { zoomControl: false, attributionControl: false })
            .setView([lat, lng], ZOOM_INICIAL);

        var tiles = L.tileLayer(ESTILO_MAPA, { maxZoom: 19, subdomains: 'abcd' });

        // Respaldo de red: si los mosaicos no cargan (conexión lenta,
        // bloqueo, CDN caído) avisamos una sola vez de forma suave.
        tiles.on('tileerror', function () {
            if (avisoTilesMostrado) return;
            avisoTilesMostrado = true;
            avisar('El mapa no pudo cargar los mosaicos. Revisa tu conexión.', 'info');
        });

        tiles.addTo(mapa);

        L.control.zoom({ position: 'bottomright' }).addTo(mapa);
        L.control.attribution({ position: 'bottomleft', prefix: false })
            .addTo(mapa)
            .addAttribution('&copy; <a href="https://carto.com/">CARTO</a>');

        return mapa;
    }

    /* Quita los marcadores anteriores para dejar solo el del video actual. */
    function limpiarMarcadores(mapa) {
        mapa.eachLayer(function (capa) {
            if (capa instanceof L.Marker) mapa.removeLayer(capa);
        });
    }

    /* Icono con el estilo de pin del ecosistema (clase .pin-lujo en videos.html). */
    function iconoPin() {
        return L.divIcon({
            className: 'pin-lujo-wrapper',
            html: '<div class="pin-lujo"></div>',
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40]
        });
    }

    /* Abre la hoja del mapa y centra el marcador en la ubicación indicada. */
    function abrirMapa(lat, lng, nombre) {
        var coords = validarCoordenadas(lat, lng);

        if (!coords.ok) {
            avisar('Ubicación no disponible', 'warning');
            return;
        }

        if (typeof L === 'undefined') {
            avisar('El mapa no está disponible', 'error');
            return;
        }

        if (!VA.hojas || typeof VA.hojas.abrirHoja !== 'function') {
            avisar('No se pudo abrir la hoja del mapa', 'error');
            return;
        }

        VA.hojas.abrirHoja('hojaMapa');

        // Espera a que la hoja termine su animación para que Leaflet mida bien.
        setTimeout(function () {
            try {
                if (!S.mapaLeaflet) {
                    S.mapaLeaflet = crearMapa(coords.lat, coords.lng);
                } else {
                    S.mapaLeaflet.setView([coords.lat, coords.lng], ZOOM_INICIAL);
                }

                limpiarMarcadores(S.mapaLeaflet);

                var marcador = L.marker([coords.lat, coords.lng], { icon: iconoPin() })
                    .addTo(S.mapaLeaflet);

                var popupHtml =
                    '<div class="popup-titulo">' + U.escapeHTML(nombre || 'Ubicación') + '</div>' +
                    '<div class="popup-desc">Coordenadas: ' +
                        formatearCoord(coords.lat) + ', ' + formatearCoord(coords.lng) +
                    '</div>';

                marcador
                    .bindPopup(popupHtml, { maxWidth: 260, closeButton: true })
                    .openPopup();

                // invalidateSize puede fallar si el contenedor aún no tiene
                // tamaño; lo protegemos para no romper el flujo.
                try {
                    S.mapaLeaflet.invalidateSize();
                } catch (e) {
                    console.warn('[Videos] invalidateSize falló:', e);
                }
            } catch (e) {
                console.error('[Videos] Error al pintar el mapa:', e);
                avisar('No se pudo mostrar el mapa', 'error');
            }
        }, RETARDO_ANIMACION_MS);
    }

    VA.mapa = {
        abrirMapa: abrirMapa
    };

    // Alias global para compatibilidad con código que llame window.abrirMapa.
    window.abrirMapa = abrirMapa;
})();