/* ================================================================
   SISTEMA GLOBAL DE COMPARTIR · CSARIEL'S (v2)
   Archivo: backend/public/features/shared/js/compartir-global.js

   - La URL pública sale de /api/config/public (PUBLIC_APP_URL en Railway).
     Al comprar un dominio, cambia esa variable y los enlaces se actualizan.
   - Espera a que la configuración llegue antes de compartir.
   - Textos cortos para que el menú del celular no los corte.
   ================================================================ */

(function () {
    'use strict';

    const MARCA = "Csariel's";

    // Valor de respaldo si el servidor no responde
    let URL_BASE = 'https://galleta-domo-production.up.railway.app';

    // Promesa que se resuelve cuando la configuración ya llegó (o falló)
    const configLista = (async function () {
        try {
            const res = await fetch('/api/config/public', { cache: 'no-store' });
            const data = await res.json();
            if (data && data.publicUrl) {
                URL_BASE = String(data.publicUrl).replace(/\/$/, '');
            }
        } catch (error) {
            console.warn('[Compartir] Usando URL de respaldo:', error);
        }
    })();

    const TEXTOS = {
        marketing: 'Mira mi marketing con IA en ' + MARCA,
        perfil: function (handle) {
            return 'Mira el perfil de @' + (handle || 'usuario') + ' en ' + MARCA;
        },
        publicacion: 'Mira esta publicación en ' + MARCA,
        generico: 'Únete a ' + MARCA
    };

    function construirUrl(tipo, parametro) {
        if (tipo === 'marketing') {
            return URL_BASE + '/marketing/marketing.html';
        }
        if (tipo === 'perfil' && parametro) {
            return URL_BASE + '/features/perfil/perfil-publico.html?u=' + encodeURIComponent(parametro);
        }
        if (tipo === 'publicacion' && parametro) {
            return URL_BASE + '/features/muro/muro.html?id=' + encodeURIComponent(parametro);
        }
        return URL_BASE;
    }

    function construirTexto(tipo, parametro) {
        const t = TEXTOS[tipo];
        if (typeof t === 'function') return t(parametro);
        return t || TEXTOS.generico;
    }

    async function compartirGlobal(tipo, parametro) {
        await configLista;

        const url = construirUrl(tipo, parametro);
        const texto = construirTexto(tipo, parametro);

        if (navigator.share) {
            try {
                await navigator.share({ title: MARCA, text: texto, url: url });
                return;
            } catch (error) {
                // El usuario canceló: no hacemos nada más
                if (error && error.name === 'AbortError') return;
            }
        }

        try {
            await navigator.clipboard.writeText(texto + ' ' + url);
            alert('Enlace copiado. Puedes pegarlo donde quieras.');
        } catch (error) {
            window.open(
                'https://api.whatsapp.com/send?text=' + encodeURIComponent(texto + ' ' + url),
                '_blank'
            );
        }
    }

    async function mostrarQRGlobal(handle) {
        await configLista;

        const urlPerfil = construirUrl('perfil', handle);
        const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' +
            encodeURIComponent(urlPerfil);

        const modal = document.getElementById('qrModal');
        const img = document.getElementById('qrImage');
        const textoUrl = document.getElementById('qrUrlTexto');

        if (modal && img) {
            img.src = qrUrl;
            if (textoUrl) textoUrl.textContent = urlPerfil;
            modal.classList.add('active');
        } else {
            window.open(qrUrl, '_blank');
        }
    }

    window.compartirGlobal = compartirGlobal;
    window.mostrarQRGlobal = mostrarQRGlobal;
    window.SHARE_CONFIG = {
        marca: MARCA,
        obtenerUrlBase: async function () {
            await configLista;
            return URL_BASE;
        }
    };
})();
