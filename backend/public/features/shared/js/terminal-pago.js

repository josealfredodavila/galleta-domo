/* ================================================================
   TerminalPago · Csariel's (v2)

   Uso:
     TerminalPago.mount(contenedor, {
        titulo:    'PAGO DE ANUNCIO',
        subtitulo: 'Anuncio · 1 semana',
        monto:     '17.448344',
        moneda:    'USDT',
        red:       'TRON · TRC20',
        direccion: 'TEfLQ6…',
        consultarEstado: async () => ({ estado: 'waiting' | 'confirming' | 'finished' | … }),
        ocultar:   async () => {},       // opcional: marca la orden como oculta en el servidor
        onOcultado: () => {},            // opcional: se llama tras "Posponer"
        onFinal:   (estado) => {}        // opcional: se llama al llegar a un estado final
     });

   Seguridad:
     - La URI de wallet y el QR llevan SOLO la dirección. El monto nunca va en la URI:
       "tron:" no es un estándar de montos y una wallet podría interpretarlo mal.
     - "Posponer" NO cancela el pago. Solo cierra la vista; el webhook sigue activo.
     - El polling tiene tope de intentos para no consultar indefinidamente.
   ================================================================ */
(function (global) {
    'use strict';

    const INTERVALO_MS = 5000;
    const MAX_INTENTOS = 120; // ~10 minutos

    // Mapa estado de NOWPayments → apariencia de la terminal
    const ESTADOS = {
        waiting:        { data: 'buscando',   texto: 'BUSCANDO TU PAGO…' },
        confirming:     { data: 'detectado',  texto: 'TRANSACCIÓN DETECTADA · CONFIRMANDO BLOQUES' },
        sending:        { data: 'detectado',  texto: 'TRANSACCIÓN DETECTADA · CONFIRMANDO BLOQUES' },
        confirmed:      { data: 'detectado',  texto: 'TRANSACCIÓN DETECTADA · CONFIRMANDO BLOQUES' },
        partially_paid: { data: 'error',      texto: 'PAGO PARCIAL · CONTACTA A SOPORTE' },
        finished:       { data: 'confirmado', texto: 'PAGO CONFIRMADO ✓' },
        expired:        { data: 'error',      texto: 'FACTURA EXPIRADA' },
        failed:         { data: 'error',      texto: 'PAGO FALLIDO' },
        refunded:       { data: 'error',      texto: 'PAGO DEVUELTO' },
        canceled:       { data: 'error',      texto: 'CANCELADO' },
        cancelled:      { data: 'error',      texto: 'CANCELADO' }
    };

    const ESTADOS_FINALES = ['finished', 'expired', 'failed', 'refunded', 'canceled', 'cancelled'];

    // ---------- Utilidades DOM ----------
    function el(tag, attrs, hijos) {
        const n = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (k === 'class') n.className = v;
            else if (k === 'text') n.textContent = v;
            else n.setAttribute(k, v);
        });
        (hijos || []).forEach((h) => n.appendChild(h));
        return n;
    }

    function mostrarToast(root, mensaje) {
        const t = root.querySelector('.tp-toast');
        if (!t) return;
        t.textContent = mensaje;
        t.classList.add('show');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('show'), 2600);
    }

    // ---------- Copia con respaldo ----------
    async function copiarTexto(texto) {
        try {
            await navigator.clipboard.writeText(texto);
            return true;
        } catch (_) {
            // Respaldo para navegadores sin Clipboard API o sin contexto seguro
            const ta = document.createElement('textarea');
            ta.value = texto;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
            document.body.removeChild(ta);
            return ok;
        }
    }

    // ---------- QR dinámico (librería qrcode, cargada en la página) ----------
    function pintarQR(canvas, texto, fallback) {
        const QR = global.QRCode;
        if (!QR || typeof QR.toCanvas !== 'function') {
            canvas.style.display = 'none';
            fallback.style.display = 'block';
            return;
        }
        QR.toCanvas(canvas, texto, {
            width: 154,
            margin: 0,
            color: { dark: '#05080f', light: '#ffffff' }
        }, (err) => {
            if (err) {
                canvas.style.display = 'none';
                fallback.style.display = 'block';
            }
        });
    }

    // ---------- Terminal ----------
    function mount(contenedor, cfg) {
        const root = el('div', { class: 'tp-root', 'data-estado': 'buscando' });

        // Encabezado
        const header = el('div', { class: 'tp-header' }, [
            el('div', { class: 'tp-titulo', text: cfg.titulo || 'PAGO' }),
            el('div', { class: 'tp-sub', text: cfg.subtitulo || '' })
        ]);

        // Radar sensorial
        const radar = el('div', { class: 'tp-radar' }, [
            el('div', { class: 'tp-radar-ring' }),
            el('div', { class: 'tp-radar-ring' }),
            el('div', { class: 'tp-radar-ring' }),
            el('div', { class: 'tp-radar-core' })
        ]);

        const estadoTxt = el('div', { class: 'tp-estado-texto', text: 'BUSCANDO TU PAGO…' });

        // Monto exacto y red
        const bloqueMonto = el('div', { class: 'tp-monto-bloque' }, [
            el('div', { class: 'tp-monto', text: cfg.monto + ' ' + cfg.moneda }),
            el('div', { class: 'tp-moneda', text: 'Monto exacto a enviar' }),
            el('span', { class: 'tp-red-badge', text: cfg.red })
        ]);

        // Dirección
        const dir = el('div', { class: 'tp-dir', text: cfg.direccion });

        // QR y su respaldo
        const canvas = el('canvas', { class: 'tp-qr', width: 170, height: 170 });
        const qrFallback = el('div', {
            class: 'tp-qr-fallback',
            text: 'QR no disponible. Usa la dirección de arriba.'
        });
        qrFallback.style.display = 'none';

        // Acciones
        const btnCopiarDir = el('button', { class: 'tp-btn tp-btn-principal', type: 'button', text: '⧉ Copiar dirección' });
        const btnCopiarMonto = el('button', { class: 'tp-btn', type: 'button', text: '⧉ Copiar monto' });
        const btnWallet = el('a', {
            class: 'tp-btn',
            href: 'tron:' + cfg.direccion,
            text: '↗ Abrir en wallet'
        });
        const btnPosponer = el('button', { class: 'tp-btn tp-btn-sec', type: 'button', text: 'Posponer' });

        const acciones = el('div', { class: 'tp-acciones' }, [
            btnCopiarDir, btnCopiarMonto, btnWallet, btnPosponer
        ]);

        const aviso = el('div', {
            class: 'tp-aviso',
            text: 'Envía solo ' + cfg.moneda + ' por la red ' + cfg.red +
                  '. Enviar por otra red puede hacer que se pierda el dinero.'
        });

        const toast = el('div', { class: 'tp-toast', text: '' });

        root.appendChild(header);
        root.appendChild(radar);
        root.appendChild(estadoTxt);
        root.appendChild(bloqueMonto);
        root.appendChild(dir);
        root.appendChild(canvas);
        root.appendChild(qrFallback);
        root.appendChild(acciones);
        root.appendChild(aviso);
        root.appendChild(toast);

        contenedor.innerHTML = '';
        contenedor.appendChild(root);

        pintarQR(canvas, cfg.direccion, qrFallback);

        // ---------- Eventos ----------
        btnCopiarDir.addEventListener('click', async () => {
            const ok = await copiarTexto(cfg.direccion);
            mostrarToast(root, ok ? '¡Copiado! Abre tu wallet y pega' : 'No se pudo copiar. Selecciona la dirección.');
        });

        btnCopiarMonto.addEventListener('click', async () => {
            const ok = await copiarTexto(String(cfg.monto));
            mostrarToast(root, ok ? 'Monto copiado. Pégalo en tu wallet' : 'No se pudo copiar el monto.');
        });

        // Posponer: cierra la vista. No cancela ni modifica el pago.
        btnPosponer.addEventListener('click', async () => {
            if (typeof cfg.ocultar === 'function') {
                try {
                    await cfg.ocultar();
                } catch (e) {
                    mostrarToast(root, (e && e.message) || 'No se pudo ocultar la orden.');
                    return;
                }
            }
            detener();
            contenedor.innerHTML = '';
            if (typeof cfg.onOcultado === 'function') cfg.onOcultado();
        });

        // ---------- Estado y polling ----------
        let intentos = 0;
        let timer = null;

        function detener() {
            if (timer) clearInterval(timer);
            timer = null;
        }

        function pintarEstado(estado) {
            const apariencia = ESTADOS[estado] || {
                data: 'buscando',
                texto: 'ESTADO: ' + String(estado).toUpperCase()
            };
            root.dataset.estado = apariencia.data;
            estadoTxt.textContent = apariencia.texto;
        }

        async function tick() {
            intentos++;
            try {
                const resultado = await cfg.consultarEstado();
                const estado = String((resultado && resultado.estado) || 'waiting').toLowerCase();
                pintarEstado(estado);

                if (ESTADOS_FINALES.includes(estado)) {
                    detener();
                    if (typeof cfg.onFinal === 'function') cfg.onFinal(estado);
                    return;
                }
            } catch (_) {
                // Error transitorio de red: se reintenta en el siguiente ciclo
            }

            if (intentos >= MAX_INTENTOS) {
                detener();
                estadoTxt.textContent = 'AÚN SIN CONFIRMAR · REVISA MÁS TARDE';
            }
        }

        tick();
        timer = setInterval(tick, INTERVALO_MS);

        return { detener, pintarEstado };
    }

    global.TerminalPago = { mount };
})(window);