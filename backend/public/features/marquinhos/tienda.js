// ================================================================
// TIENDA DE MARQUINHOS · v3.4
// compra ultra-rápida + UI optimista + PROBAR ANTES DE COMPRAR
// ✅ v3.4: posiciones de accesorios ajustadas al nuevo Marquinhos
// ================================================================

'use strict';

(function() {
    let supabase = null;
    let userId = null;
    let accesorios = [];
    let inventario = {};
    let filtroActual = 'todos';
    let saldoActual = { usdt: 0, usdc: 0 };
    let comprasEnVuelo = new Set();
    let pruebas = {};

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

    function reconectarBotones() {
        document.querySelectorAll('.acc-btn').forEach(instalarListenerBoton);
    }

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

            await Promise.all([
                cargarSaldo(),
                cargarCatalogo()
            ]);
            await cargarInventario();

            renderGrid();
            instalarEventos();

            console.log('[Tienda v3.4] ✅ Lista');
        } catch (e) {
            console.error('[Tienda v3.4] Error init:', e);
            toast('Error cargando tienda', 'error');
        }
    }

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
            console.warn('[Tienda v3.4] Error saldo:', e);
            $('saldoValor').textContent = '0.00';
        }
    }

    function pintarSaldo() {
        const el = $('saldoValor');
        const label = $('saldoLabel');
        if (!el) return;

        if (saldoActual.usdc > saldoActual.usdt && saldoActual.usdc > 0) {
            el.textContent = saldoActual.usdc.toFixed(2);
            if (label) label.textContent = 'USDC';
        } else {
            el.textContent = saldoActual.usdt.toFixed(2);
            if (label) label.textContent = 'USDT';
        }
    }

    async function cargarCatalogo() {
        const { data, error } = await supabase
            .from('marquinhos_accesorios')
            .select('*')
            .eq('activo', true)
            .order('orden', { ascending: true });

        if (error) throw error;
        accesorios = data || [];
    }

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

    function instalarListenerBoton(btn) {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const accion = btn.dataset.accion;
            const acc = accesorios.find(x => x.id === id);
            if (!acc) return;

            if (accion === 'probar')          return alternarPrueba(acc);
            if (accion === 'comprar')         return comprar(acc, btn);
            if (accion === 'desequipar')      return desequipar(id);
            if (accion === 'equipar')         return equipar(id);
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
        reconectarBotones();
    }

    function cardHTML(a) {
        const inv = inventario[a.id];
        const equipado = inv && inv.equipado;
        const comprado = !!inv;
        const probando = pruebas[a.categoria] === a.id;
        const moneda = a.moneda || 'USDT';
        const precio = parseFloat(a.precio_usdt).toFixed(2);
        const enVuelo = comprasEnVuelo.has(a.id);

        let btnHTML = '';
        if (!comprado) {
            btnHTML = `
                <div class="acc-botones">
                    <button class="acc-btn acc-btn-probar ${probando ? 'activo' : ''}" data-id="${esc(a.id)}" data-accion="probar" type="button">
                        ${probando ? 'Quitar prueba' : '👁 Probar'}
                    </button>
                    <button class="acc-btn acc-btn-comprar" data-id="${esc(a.id)}" data-accion="comprar" type="button" ${enVuelo ? 'disabled' : ''}>
                        ${enVuelo ? 'Procesando...' : `Comprar · ${precio} ${esc(moneda)}`}
                    </button>
                </div>`;
        } else if (equipado) {
            btnHTML = `<button class="acc-btn acc-btn-desequipar" data-id="${esc(a.id)}" data-accion="desequipar" type="button">Quitar</button>`;
        } else {
            btnHTML = `<button class="acc-btn acc-btn-equipar" data-id="${esc(a.id)}" data-accion="equipar" type="button">Poner</button>`;
        }

        const badge = equipado
            ? '<div class="acc-badge">EQUIPADO</div>'
            : (probando ? '<div class="acc-badge acc-badge-prueba">PROBANDO</div>' : '');

        return `
            <div class="acc-card ${equipado ? 'equipado' : ''} ${probando ? 'probando' : ''}">
                ${badge}
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

        const visibles = [];

        accesorios.forEach(a => {
            const inv = inventario[a.id];
            if (inv && inv.equipado && !pruebas[a.categoria]) visibles.push(a);
        });

        Object.keys(pruebas).forEach(cat => {
            const a = accesorios.find(x => x.id === pruebas[cat]);
            if (a) visibles.push(a);
        });

        layer.innerHTML = visibles.map(a => {
            const pos = posicionPorCategoria(a.categoria);
            return `<text x="${pos.x}" y="${pos.y}" font-size="${pos.size}" text-anchor="middle">${esc(a.svg_data || '')}</text>`;
        }).join('');

        pintarAvisoPrueba();
    }

    function pintarAvisoPrueba() {
        const el = $('previewPrueba');
        if (!el) return;

        const lista = Object.keys(pruebas)
            .map(cat => accesorios.find(x => x.id === pruebas[cat]))
            .filter(Boolean);

        if (!lista.length) {
            el.hidden = true;
            el.textContent = '';
            return;
        }

        el.hidden = false;
        el.textContent = '👁 Probando: ' + lista.map(a => a.nombre).join(', ') +
            ' · aún no los tienes (solo vista previa)';
    }

    // ============================================================
    // ✅ v3.4: POSICIONES AJUSTADAS AL NUEVO MARQUINHOS (v9.4)
    // ============================================================
    // El cuerpo nuevo (viewBox 0 0 200 300):
    //   Antena:  y = 6 a 40
    //   Cabeza:  y = 40 a 160 (rectángulo redondeado, ancho 130, x=35 a 165)
    //   Ojos:    y = 108
    //   Boca:    y = 138
    //   Cuello:  y = 158 a 170
    //   Torso:   y = 165 a 250 (cápsula, x=60 a 140)
    //   Placa:   y = 185 a 207
    //   Piernas: y = 250 a 278
    //   Botas:   y = 278 a 290
    // ============================================================
    function posicionPorCategoria(cat) {
        switch (cat) {
            // Sombrero: sobre la cabeza, ligeramente arriba
            case 'sombrero':   return { x: 100, y: 55,  size: 78 };

            // Lentes: a la altura de los ojos (y=108)
            case 'lentes':     return { x: 100, y: 110, size: 72 };

            // Playera: en la parte alta del torso (y=180)
            case 'playera':    return { x: 100, y: 190, size: 82 };

            // Pantalón: en la parte media-baja del torso (y=225)
            case 'pantalon':   return { x: 100, y: 235, size: 76 };

            // Zapatos: sobre las botas (y=284)
            case 'zapatos':    return { x: 100, y: 284, size: 68 };

            // Accesorio: al lado derecho del cuerpo (torso)
            case 'accesorio':  return { x: 178, y: 200, size: 62 };

            default:           return { x: 100, y: 100, size: 55 };
        }
    }

    function alternarPrueba(acc) {
        if (pruebas[acc.categoria] === acc.id) {
            delete pruebas[acc.categoria];
        } else {
            pruebas[acc.categoria] = acc.id;
        }
        renderGrid();
        renderAccesoriosEquipados();
    }

    function limpiarPruebaDe(acc) {
        if (acc && pruebas[acc.categoria]) {
            delete pruebas[acc.categoria];
        }
    }

    async function comprar(acc, btn) {
        if (!acc) return;

        if (comprasEnVuelo.has(acc.id)) return;
        comprasEnVuelo.add(acc.id);

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
                console.error('[Tienda v3.4] RPC error:', error);
                toast('Error al procesar la compra', 'error');
                return;
            }

            if (!data || data.success !== true) {
                toast(data?.message || 'No se pudo completar la compra', 'error');
                return;
            }

            inventario[acc.id] = data.inventario;

            if (data.moneda === 'USDC') {
                saldoActual.usdc = parseFloat(data.nuevo_saldo);
            } else {
                saldoActual.usdt = parseFloat(data.nuevo_saldo);
            }
            pintarSaldo();

            limpiarPruebaDe(acc);

            repintarTarjeta(acc.id);
            renderAccesoriosEquipados();

            toast(data.message || ('¡' + acc.nombre + ' comprado! 🎉'), 'success');

            await equipar(acc.id);
        } catch (e) {
            console.error('[Tienda v3.4] Error comprando:', e);
            toast('Error al comprar: ' + (e.message || 'desconocido'), 'error');
        } finally {
            comprasEnVuelo.delete(acc.id);
            if (btn && btn.isConnected) {
                btn.disabled = false;
                btn.textContent = btnOriginal;
            }
        }
    }

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

    async function equipar(accId) {
        try {
            const acc = accesorios.find(x => x.id === accId);
            if (!acc) return;

            limpiarPruebaDe(acc);

            const mismaCategoria = accesorios
                .filter(x => x.categoria === acc.categoria)
                .map(x => x.id)
                .filter(id => inventario[id]);

            for (const id of mismaCategoria) {
                if (id === accId) continue;
                if (!inventario[id].equipado) continue;
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

            renderGrid();
            renderAccesoriosEquipados();

            if (window.Marquinhos?.recargarAccesorios) {
                try { window.Marquinhos.recargarAccesorios(); } catch (e) {}
            }
        } catch (e) {
            console.error('[Tienda v3.4] Error equipando:', e);
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
            console.error('[Tienda v3.4] Error desequipando:', e);
        }
    }

    async function resetAccesorios() {
        const hayEquipados = Object.values(inventario).some(i => i && i.equipado);
        if (hayEquipados && !confirm('¿Quitar todos los accesorios equipados?')) return;

        pruebas = {};

        try {
            if (hayEquipados) {
                await supabase
                    .from('marquinhos_inventario')
                    .update({ equipado: false })
                    .eq('usuario_id', userId);

                Object.keys(inventario).forEach(id => {
                    inventario[id].equipado = false;
                });

                if (window.Marquinhos?.recargarAccesorios) {
                    try { window.Marquinhos.recargarAccesorios(); } catch (e) {}
                }
            }

            renderGrid();
            renderAccesoriosEquipados();
            toast('Accesorios quitados', 'success');
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