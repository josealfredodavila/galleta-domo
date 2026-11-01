// ================================================================
// CSARIEL'S · NAVEGACIÓN v1.1
// Sin parpadeo blanco, precarga de pestañas y transición suave.
// No reemplaza páginas ni scripts: solo mejora la carga entre ellas.
// Cargar SÍNCRONO en el <head>, después de auth-global.js.
//
// v1.1:
// - Detección correcta de transiciones entre documentos (PageSwapEvent).
//   Antes el fundido de respaldo quedaba desactivado en muchos navegadores.
// - Soporta .nav y .main-nav (contactos.html usa .main-nav).
// - El fondo oscuro solo se aplica durante la carga; el tema día no se toca.
// ================================================================
(function () {
    'use strict';
    if (window.__sarielsNav) return;
    window.__sarielsNav = true;

    var TTL_MS = 5 * 60 * 1000;
    var precargadas = new Map();
    var reducirMovimiento = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Transición nativa entre documentos (Chrome/Android modernos).
    // PageSwapEvent solo existe donde las transiciones entre páginas funcionan.
    var soportaTransicion = 'PageSwapEvent' in window;

    // Fondo oscuro mientras carga + fundido de entrada
    var estilo = document.createElement('style');
    estilo.textContent =
        'html.nav-in-start{background:#05080f;}' +
        '@view-transition{navigation:auto;}' +
        'html.nav-in-start body{opacity:0;}' +
        'body{transition:opacity .16s ease;}' +
        'body.nav-out{opacity:0;}' +
        '@media (prefers-reduced-motion: reduce){' +
            'body,body.nav-out{transition:none;}' +
            '@view-transition{navigation:none;}' +
        '}';
    document.head.appendChild(estilo);
    document.documentElement.classList.add('nav-in-start');

    document.addEventListener('DOMContentLoaded', function () {
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                document.documentElement.classList.remove('nav-in-start');
            });
        });
    });

    function esEnlaceInterno(a) {
        if (!a || !a.href) return false;
        var u;
        try { u = new URL(a.href, location.href); } catch (e) { return false; }
        if (u.origin !== location.origin) return false;
        if (a.target && a.target !== '_self') return false;
        if (a.hasAttribute('download')) return false;
        if (u.pathname === location.pathname && u.hash) return false;
        return true;
    }

    // Precarga una pestaña una sola vez por ventana de TTL
    function precargar(href) {
        var ahora = Date.now();
        var ultima = precargadas.get(href);
        if (ultima && ahora - ultima < TTL_MS) return;
        precargadas.set(href, ahora);

        var l = document.createElement('link');
        l.rel = 'prefetch';
        l.as = 'document';
        l.href = href;
        document.head.appendChild(l);
    }

    // Acepta la barra de Mensajes (.nav) y la de Contactos (.main-nav)
    var SELECTOR_NAV = '.nav a, .main-nav a';

    function enlaceNav(target) {
        var a = target && target.closest ? target.closest(SELECTOR_NAV) : null;
        return esEnlaceInterno(a) ? a : null;
    }

    // Precarga al pasar el dedo o el mouse sobre la pestaña
    document.addEventListener('pointerover', function (e) {
        var a = enlaceNav(e.target);
        if (a) precargar(a.href);
    }, { passive: true });

    document.addEventListener('touchstart', function (e) {
        var a = enlaceNav(e.target);
        if (a) precargar(a.href);
    }, { passive: true });

    // Precarga todas las pestañas cuando el navegador esté libre
    window.addEventListener('load', function () {
        var iniciar = function () {
            document.querySelectorAll(SELECTOR_NAV).forEach(function (a) {
                if (esEnlaceInterno(a)) precargar(a.href);
            });
        };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(iniciar, { timeout: 2000 });
        } else {
            setTimeout(iniciar, 1500);
        }
    });

    // Navegador sin transiciones entre documentos: fundido manual
    document.addEventListener('click', function (e) {
        if (soportaTransicion || reducirMovimiento) return;
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        var a = enlaceNav(e.target);
        if (!a) return;
        if (a.href === location.href) { e.preventDefault(); return; }

        e.preventDefault();
        document.body.classList.add('nav-out');
        setTimeout(function () { location.href = a.href; }, 160);
    });

    // Volver atrás (bfcache): quitar el estado de salida
    window.addEventListener('pageshow', function () {
        document.body && document.body.classList.remove('nav-out');
    });
})();