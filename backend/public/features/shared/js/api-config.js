/* ================================================================
   API-CONFIG.JS · Csariel's (servidor Railway)
   Mismo origen: el frontend y la API viven en galleta-domo.
   No se genera en build: esto es el archivo estático del servidor.
   ================================================================ */
(function () {
    'use strict';

    var ORIGEN = window.location.origin;

    window.API_BASE = ORIGEN;
    window.PUBLIC_APP_URL = ORIGEN;
})();