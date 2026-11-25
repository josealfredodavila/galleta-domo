// ================================================================
// CSARIEL'S · VIDEOS · MAPA DE UBICACIÓN (v1)
// ================================================================
// Muestra la ubicación de un video en la hoja #hojaMapa con Leaflet.
// - Crea el mapa la primera vez y después reutiliza la misma instancia.
// - Coloca un marcador con el nombre de la ubicación y sus coordenadas.
// - Espera a que la hoja termine su animación antes de medir el mapa.
// Expuesto en window.VideosApp.mapa.
// Requiere: config, utils, hojas. Leaflet (L) cargado antes.
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

    /* Crea el mapa la primera vez. Después solo se reutiliza. */
    function crearMapa(lat, lng) {
        var mapa = L.map(ID_MAPA, { zoomControl: false, attributionControl: false })
            .setView([lat, lng], ZOOM_INICIAL);

        L.tileLayer(ESTILO_MAPA, { maxZoom: 19, subdomains: 'abcd' }).addTo(mapa);
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
        if (!lat || !lng) return;
        if (typeof L === 'undefined') {
            U.showToast('El mapa no está disponible', 'error');
            return;
        }

        VA.hojas.abrirHoja('hojaMapa');

        // Espera a que la hoja termine su animación para que Leaflet mida bien.
        setTimeout(function () {
            if (!S.mapaLeaflet) {
                S.mapaLeaflet = crearMapa(lat, lng);
            } else {
                S.mapaLeaflet.setView([lat, lng], ZOOM_INICIAL);
            }

            limpiarMarcadores(S.mapaLeaflet);

            var marcador = L.marker([lat, lng], { icon: iconoPin() }).addTo(S.mapaLeaflet);
            var popupHtml =
                '<div class="popup-titulo">' + U.escapeHTML(nombre || 'Ubicación') + '</div>' +
                '<div class="popup-desc">Coordenadas: ' + lat.toFixed(4) + ', ' + lng.toFixed(4) + '</div>';

            marcador.bindPopup(popupHtml, { maxWidth: 260, closeButton: true }).openPopup();
            S.mapaLeaflet.invalidateSize();
        }, RETARDO_ANIMACION_MS);
    }

    VA.mapa = {
        abrirMapa: abrirMapa
    };
})();