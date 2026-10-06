// ================================================================
// TIENDA DE MARQUINHOS · v3.1
// compra ultra-rápida + UI optimista
// v3.1: al comprar, equipa el nuevo y quita el anterior de la misma
//       categoría (ya no se ven dos sombreros "montados");
//       sombrero reubicado para no cortarse arriba del avatar.
// ================================================================

'use strict';

(function() {
    let supabase = null;
    let userId = null;
    let accesorios = [];
    let inventario = {};
    let filtroActual = 'todos';
    let saldoActual = { usdt: 0, usdc: 0 };
    let comprasEnVuelo = new Set();   // bloqueo por item_id

    function $(id) { return document.getElementById(id); }

    function toast(msg, tipo) {
        const t = $('tiendaToast');
        if (!t) return;
        t.textContent = msg;
        t.className = 'tienda-toast show' + (tipo ? ' ' + tipo : '');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('show'), 3000);
    }

    function esc(v) {
        const d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }

    // ============================================================
    // INIT
    // ============================================================
    async function init() {
        try {
            supabase = window.supabaseClient
                || (window.supabase && window.supabase.createClient
                    ? window.supabase.createClient(
                        'https://zultnlogdoajehbswlih.supabase.co',
                        'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
                    )
                    : null);

            if (!supabase) { toast('Sin conexión a Supabase', 'error'); return; }
            window.supabaseClient = supabase;

            const s = await supabase.auth.getSession();
            if (!s.data.session) {
                toast('Inicia sesión primero', 'error');
                setTimeout(() => window.location.href = '/', 1500);
                return;
            }
            userId = s.data.session.user.id;

            // Cargar todo EN PARALELO para velocidad
            await Promise.all([
                cargarSaldo(),
                cargarCatalogo()
            ]);
            await cargarInventario();

            renderGrid();
            instalarEventos();

            console.log('[Tienda v3.1] ✅ Lista');
        } catch (e) {
            console.error('[Tienda v3.1] Error init:', e);
            toast('Error cargando tienda', 'error');
        }
    }

    // ============================================================
    // SALDO
    // ============================================================
    async function cargarSaldo() {
        try {
            const { data, error } = await supabase
                .from('usuarios')
                .select('usdt_balance, usdc_balance')
                .eq('id', userId)
                .maybeSingle();

            if (error) throw error;

            saldoActual.usdt = parseFloat(data?.usdt_balance || 0);
            saldoActual.usdc = parseFloat(data?.usdc_balance || 0);

            pintarSaldo();
        } catch (e) {
            console.warn('[Tienda v3.1] Error saldo:', e);
            $('saldoValor').textContent = '0.00';
        }
    }

    function pintarSaldo() {
        const el = $('saldoValor');
        const label = $('saldoLabel');
        if (!el) return;

        // Mostrar el saldo de la moneda "predominante"
        if (saldoActual.usdc > saldoActual.usdt && saldoActual.usdc > 0) {
            el.textContent = saldoActual.usdc.toFixed(2);
            if (label) label.textContent = 'USDC';
        } else {
            el.textContent = saldoActual.usdt.toFixed(2);
            if (label) label.textContent = 'USDT';
        }
    }

    // ============================================================
    // CATÁLOGO
    // ============================================================
    async function cargarCatalogo() {
        const { data, error } = await supabase
            .from('marquinhos_accesorios')
            .select('*')
            .eq('activo', true)
            .order('orden', { ascending: true });

        if (error) throw error;
        accesorios = data || [];
    }

    // ============================================================
    // INVENTARIO
    // ============================================================
    async function cargarInventario() {
        const { data, error } = await supabase
            .from('marquinhos_inventario')
            .select('*')
            .eq('usuario_id', userId);

        if (error) throw error;
        inventario = {};
        (data || []).forEach(item => {
            inventario[item.accesorio_id] = item;
        });
        renderAccesoriosEquipados();
    }

    // ============================================================
    // RENDER
    // ============================================================
    function instalarListenerBoton(btn) {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const acc = accesorios.find(x => x.id === id);
            const inv = inventario[id];
            if (inv) {
                inv.equipado ? desequipar(id) : equipar(id);
            } else {
                comprar(acc, btn);
            }
        });
    }

    function renderGrid() {
        const grid = $('tiendaGrid');
        const lista = filtroActual === 'todos'
            ? accesorios
            : accesorios.filter(a => a.categoria === filtroActual);

        if (!lista.length) {
            grid.innerHTML = '<div class="tienda-empty">No hay accesorios en esta categoría.</div>';
            return;
        }

        grid.innerHTML = lista.map(a => cardHTML(a)).join('');
        grid.querySelectorAll('.acc-btn').forEach(instalarListenerBoton);
    }

    function cardHTML(a) {
        const inv = inventario[a.id];
        const equipado = inv && inv.equipado;
        const comprado = !!inv;
        const moneda = a.moneda || 'USDT';
        const precio = parseFloat(a.precio_usdt).toFixed(2);
        const enVuelo = comprasEnVuelo.has(a.id);

        let btnHTML = '';
        if (!comprado) {
            btnHTML = `<button class="acc-btn acc-btn-comprar" data-id="${esc(a.id)}" type="button" ${enVuelo ? 'disabled' : ''}>
                ${enVuelo ? 'Procesando...' : `Comprar · ${precio} ${esc(moneda)}`}
            </button>`;
        } else if (equipado) {
            btnHTML = `<button class="acc-btn acc-btn-desequipar" data-id="${esc(a.id)}" type="button">Quitar</button>`;
        } else {
            btnHTML = `<button class="acc-btn acc-btn-equipar" data-id="${esc(a.id)}" type="button">Poner</button>`;
        }

        return `
            <div class="acc-card ${equipado ? 'equipado' : ''}">
                ${equipado ? '<div class="acc-badge">EQUIPADO</div>' : ''}
                <div class="acc-emoji">${esc(a.svg_data || '❓')}</div>
                <div class="acc-nombre">${esc(a.nombre)}</div>
                <div class="acc-desc">${esc(a.descripcion || '')}</div>
                <div class="acc-precio">${precio} ${esc(moneda)}</div>
                ${btnHTML}
            </div>
        `;
    }

    function renderAccesoriosEquipados() {
        const layer = $('accesoriosLayer');
        if (!layer) return;

        const equipados = accesorios.filter(a => {
            const inv = inventario[a.id];
            return inv && inv.equipado;
        });

        layer.innerHTML = equipados.map(a => {
            const pos = posicionPorCategoria(a.categoria);
            return `<text x="${pos.x}" y="${pos.y}" font-size="${pos.size}" text-anchor="middle">${esc(a.svg_data || '')}</text>`;
        }).join('');
    }

    function posicionPorCategoria(cat) {
        switch (cat) {
            // sombrero bajado y más chico: antes (y=35, 70) se cortaba arriba del avatar
            case 'sombrero':   return { x: 100, y: 52,  size: 56 };
            case 'playera':    return { x: 100, y: 195, size: 90 };
            case 'pantalon':   return { x: 100, y: 235, size: 70 };
            case 'zapatos':    return { x: 100, y: 258, size: 60 };
            case 'lentes':     return { x: 100, y: 82,  size: 60 };
            case 'accesorio':  return { x: 175, y: 195, size: 60 };
            default:           return { x: 100, y: 100, size: 50 };
        }
    }

    // ============================================================
    // COMPRAR · UI optimista + RPC atómica
    // ============================================================
    async function comprar(acc, btn) {
        if (!acc) return;

        // Bloqueo de doble clic
        if (comprasEnVuelo.has(acc.id)) return;
        comprasEnVuelo.add(acc.id);

        // UI optimista: mostrar "Procesando..."
        const btnOriginal = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Procesando...';
        }

        try {
            const { data, error } = await supabase.rpc('comprar_cosmetico', {
                p_item_id: acc.id
            });

            if (error) {
                console.error('[Tienda v3.1] RPC error:', error);
                toast('Error al procesar la compra', 'error');
                return;
            }

            if (!data || data.success !== true) {
                toast(data?.message || 'No se pudo completar la compra', 'error');
                return;
            }

            // ✅ Éxito
            inventario[acc.id] = data.inventario;

            // Actualizar saldo local sin ir al servidor
            if (data.moneda === 'USDC') {
                saldoActual.usdc = parseFloat(data.nuevo_saldo);
            } else {
                saldoActual.usdt = parseFloat(data.nuevo_saldo);
            }
            pintarSaldo();

            repintarTarjeta(acc.id);
            renderAccesoriosEquipados();

            toast(data.message || ('¡' + acc.nombre + ' comprado! 🎉'), 'success');

            // La RPC deja el nuevo accesorio equipado; equipar() además
            // quita el anterior de la misma categoría (evita dos sombreros juntos)
            await equipar(acc.id);
        } catch (e) {
            console.error('[Tienda v3.1] Error comprando:', e);
            toast('Error al comprar: ' + (e.message || 'desconocido'), 'error');
        } finally {
            comprasEnVuelo.delete(acc.id);
            if (btn && btn.isConnected) {
                btn.disabled = false;
                btn.textContent = btnOriginal;
            }
        }
    }

    // Re-pinta UNA sola tarjeta
    function repintarTarjeta(accId) {
        const grid = $('tiendaGrid');
        if (!grid) return;
        const acc = accesorios.find(x => x.id === accId);
        if (!acc) return;

        const cards = grid.querySelectorAll('.acc-card');
        for (const card of cards) {
            const btn = card.querySelector('.acc-btn');
            if (btn && btn.dataset.id === accId) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = cardHTML(acc).trim();
                const newCard = wrapper.firstElementChild;
                card.replaceWith(newCard);
                newCard.querySelectorAll('.acc-btn').forEach(instalarListenerBoton);
                return;
            }
        }
    }

    // ============================================================
    // EQUIPAR / DESEQUIPAR
    // ============================================================
    async function equipar(accId) {
        try {
            const acc = accesorios.find(x => x.id === accId);
            if (!acc) return;

            const mismaCategoria = accesorios
                .filter(x => x.categoria === acc.categoria)
                .map(x => x.id)
                .filter(id => inventario[id]);

            for (const id of mismaCategoria) {
                if (id === accId) continue;
                if (!inventario[id].equipado) continue;   // solo si estaba puesto
                await supabase
                    .from('marquinhos_inventario')
                    .update({ equipado: false })
                    .eq('usuario_id', userId)
                    .eq('accesorio_id', id);
                inventario[id].equipado = false;
                repintarTarjeta(id);
            }

            const { data: upd, error } = await supabase
                .from('marquinhos_inventario')
                .update({ equipado: true })
                .eq('usuario_id', userId)
                .eq('accesorio_id', accId)
                .select('*')
                .single();

            if (error) throw error;
            inventario[accId] = upd;

            repintarTarjeta(accId);
            renderAccesoriosEquipados();

            if (window.Marquinhos?.recargarAccesorios) {
                try { window.Marquinhos.recargarAccesorios(); } catch (e) {}
            }
        } catch (e) {
            console.error('[Tienda v3.1] Error equipando:', e);
            toast('Error al equipar', 'error');
        }
    }

    async function desequipar(accId) {
        try {
            const { data: upd, error } = await supabase
                .from('marquinhos_inventario')
                .update({ equipado: false })
                .eq('usuario_id', userId)
                .eq('accesorio_id', accId)
                .select('*')
                .single();

            if (error) throw error;
            inventario[accId] = upd;

            repintarTarjeta(accId);
            renderAccesoriosEquipados();

            if (window.Marquinhos?.recargarAccesorios) {
                try { window.Marquinhos.recargarAccesorios(); } catch (e) {}
            }
        } catch (e) {
            console.error('[Tienda v3.1] Error desequipando:', e);
        }
    }

    async function resetAccesorios() {
        if (!confirm('¿Quitar todos los accesorios equipados?')) return;
        try {
            await supabase
                .from('marquinhos_inventario')
                .update({ equipado: false })
                .eq('usuario_id', userId);

            Object.keys(inventario).forEach(id => {
                inventario[id].equipado = false;
            });

            renderGrid();
            renderAccesoriosEquipados();
            toast('Accesorios quitados', 'success');

            if (window.Marquinhos?.recargarAccesorios) {
                try { window.Marquinhos.recargarAccesorios(); } catch (e) {}
            }
        } catch (e) {
            console.error(e);
        }
    }

    function instalarEventos() {
        document.querySelectorAll('.filtro-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filtroActual = btn.dataset.cat;
                renderGrid();
            });
        });

        const resetBtn = $('btnResetAccesorios');
        if (resetBtn) resetBtn.addEventListener('click', resetAccesorios);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.MarquinhosTienda = {
        recargarSaldo: cargarSaldo,
        recargar: init
    };
})();
