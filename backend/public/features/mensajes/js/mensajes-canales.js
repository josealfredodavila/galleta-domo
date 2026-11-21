// ================================================================
// MENSAJES · CANALES Y GRUPOS v2.0 · MÓDULO 6 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-canales.js
// Depende de: mensajes-core.js (db, toast, esc, session)
// Cambios v2.0:
//  - Sin emojis ni símbolos decorativos
//  - Una sola lógica para canales y grupos (antes estaba duplicada)
//  - Tarjetas con delegación de eventos (sin onclick con texto armado)
//  - Los filtros de estado se llenan con todos los datos, no con los filtrados
//  - Validación de campos y protección contra doble envío
//  - Errores técnicos solo en consola; al usuario se le muestra un mensaje claro
//  - cambiarPestana ya no carga el historial: llamadas-ui.js lo hace
// ================================================================

'use strict';

const FIRMA_CANAL = 'Yo me hago cargo de lo que digo aquí';
const LIMITE_LISTA = 50;
const NOMBRE_MAX = 80;
const DESCRIPCION_MAX = 500;

const CFG_CANAL = {
    etiqueta: 'canal',
    visibilidad: 'publico',
    modoIngreso: 'abierto',
    listaId: 'canalesLista',
    buscarId: 'searchCanales',
    filtroId: 'filtroEstadoCanal',
    prefijo: 'canal',
    btnId: 'btnCrearCanal',
    vacio: 'Aún no hay canales públicos.',
    cerrar: () => cerrarModalCrearCanal(),
    recargar: () => cargarCanales()
};

const CFG_GRUPO = {
    etiqueta: 'grupo',
    visibilidad: 'privado',
    modoIngreso: 'invitacion',
    listaId: 'gruposLista',
    buscarId: 'searchGrupos',
    filtroId: 'filtroEstadoGrupo',
    prefijo: 'grupo',
    btnId: 'btnCrearGrupo',
    vacio: 'Aún no hay grupos privados.',
    cerrar: () => cerrarModalCrearGrupo(),
    recargar: () => cargarGrupos()
};

let _timerCanales = null;
let _timerGrupos = null;
let _pestanaActual = 'chats';

/* ---------------- Utilidades ---------------- */

function generarSlug(nombre) {
    const slug = (nombre || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'grupo';
    return slug + '-' + Date.now();
}

function htmlVacio(texto) {
    return `<div class="empty-state-small"><div class="empty-text">${esc(texto)}</div></div>`;
}

function abrirModal(id, campoFoco) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('show');
    setTimeout(() => document.getElementById(campoFoco)?.focus(), 80);
}

function cerrarModal(id) {
    document.getElementById(id)?.classList.remove('show');
}

/* ---------------- Pestañas del sidebar ---------------- */

function cambiarPestana(pestana) {
    _pestanaActual = pestana;

    document.querySelectorAll('.sidebar-tab').forEach(btn => {
        const activa = btn.dataset.tab === pestana;
        btn.classList.toggle('active', activa);
        btn.setAttribute('aria-selected', activa ? 'true' : 'false');
    });

    const paneles = { chats: 'tabChats', canales: 'tabCanales', grupos: 'tabGrupos', llamadas: 'tabLlamadas' };
    Object.keys(paneles).forEach(clave => {
        const el = document.getElementById(paneles[clave]);
        if (el) el.classList.toggle('hidden', clave !== pestana);
    });

    if (pestana === 'canales') cargarCanales();
    else if (pestana === 'grupos') cargarGrupos();
}

function onNuevoClick() {
    if (_pestanaActual === 'chats') newConversation();
    else if (_pestanaActual === 'canales') abrirModalCrearCanal();
    else if (_pestanaActual === 'grupos') abrirModalCrearGrupo();
}

function buscarCanalesDebounce() {
    clearTimeout(_timerCanales);
    _timerCanales = setTimeout(cargarCanales, 300);
}

function buscarGruposDebounce() {
    clearTimeout(_timerGrupos);
    _timerGrupos = setTimeout(cargarGrupos, 300);
}

/* ---------------- Listados ---------------- */

function llenarFiltroEstados(select, items) {
    if (!select) return;
    const valorActual = select.value;
    const estados = [...new Set(items.map(i => i.estado_region).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es'));
    select.innerHTML = '<option value="">Todos los estados</option>' +
        estados.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
    if (valorActual && estados.includes(valorActual)) select.value = valorActual;
}

function renderCanalCard(item, tipo) {
    const esCanal = tipo !== 'grupo';
    const inicial = esc(((item.nombre || 'U').charAt(0)).toUpperCase());
    const avatar = item.avatar_url ? `<img src="${esc(item.avatar_url)}" alt="">` : inicial;
    const ubicacion = [item.municipio, item.estado_region].filter(Boolean).join(', ') || 'Sin ubicación';
    const descripcion = (item.descripcion || '').trim().slice(0, 120) || 'Sin descripción';
    const clase = esCanal ? 'publico' : 'privado';

    return `
        <div class="canal-card ${clase}" role="button" tabindex="0" data-id="${esc(item.id)}">
            <div class="canal-avatar">${avatar}</div>
            <div class="canal-info">
                <div class="canal-nombre">${esc(item.nombre || 'Sin nombre')}</div>
                <div class="canal-desc">${esc(descripcion)}</div>
                <div class="canal-meta">
                    <span class="canal-badge ${clase}">${esCanal ? 'Público' : 'Privado'}</span>
                    ${item.marketplace_activo ? '<span class="canal-badge marketplace">Marketplace</span>' : ''}
                    <span>${esc(ubicacion)}</span>
                </div>
            </div>
        </div>`;
}

async function cargarLista(cfg) {
    const lista = document.getElementById(cfg.listaId);
    if (!lista) return;
    lista.innerHTML = htmlVacio('Cargando…');

    try {
        const s = await session();
        if (!s) {
            lista.innerHTML = htmlVacio('Inicia sesión para ver esta sección.');
            return;
        }

        const { data, error } = await db.from('grupos_video')
            .select('id, nombre, descripcion, municipio, estado_region, marketplace_activo, avatar_url, created_at')
            .eq('visibilidad', cfg.visibilidad)
            .eq('activo', true)
            .order('created_at', { ascending: false })
            .limit(LIMITE_LISTA);
        if (error) throw error;

        const todos = data || [];
        const selectEstado = document.getElementById(cfg.filtroId);
        llenarFiltroEstados(selectEstado, todos);

        const q = (document.getElementById(cfg.buscarId)?.value || '').trim().toLowerCase();
        const estado = selectEstado?.value || '';

        let items = todos;
        if (q) items = items.filter(i =>
            (i.nombre || '').toLowerCase().includes(q) ||
            (i.descripcion || '').toLowerCase().includes(q));
        if (estado) items = items.filter(i => i.estado_region === estado);

        if (!items.length) {
            lista.innerHTML = htmlVacio(q || estado ? 'Sin resultados para tu búsqueda.' : cfg.vacio);
            return;
        }
        lista.innerHTML = items.map(i => renderCanalCard(i, cfg.etiqueta)).join('');
    } catch (e) {
        console.error(`[Mensajes/${cfg.etiqueta}] Error al cargar:`, e);
        lista.innerHTML = htmlVacio('No se pudo cargar. Intenta de nuevo.');
    }
}

function cargarCanales() { return cargarLista(CFG_CANAL); }
function cargarGrupos() { return cargarLista(CFG_GRUPO); }

/* ---------------- Abrir canal o grupo ---------------- */

function abrirCanalOGrupo(id) {
    if (!id) return;
    window.location.href = '/features/grupos/grupos.html?grupo=' + encodeURIComponent(id);
}

/* ---------------- Modales de creación ---------------- */

function abrirModalCrearCanal() { abrirModal('modalCrearCanal', 'canalNombre'); }
function cerrarModalCrearCanal() { cerrarModal('modalCrearCanal'); }
function abrirModalCrearGrupo() { abrirModal('modalCrearGrupo', 'grupoNombre'); }
function cerrarModalCrearGrupo() { cerrarModal('modalCrearGrupo'); }

function leerFormulario(prefijo) {
    const campo = (nombre) => (document.getElementById(prefijo + nombre)?.value || '').trim();
    return {
        nombre: campo('Nombre'),
        descripcion: campo('Descripcion'),
        estado: campo('Estado'),
        municipio: campo('Municipio'),
        ciudad: campo('Ciudad'),
        pais: campo('Pais') || 'México'
    };
}

function validarFormulario(f) {
    if (!f.nombre) return 'El nombre es obligatorio.';
    if (f.nombre.length > NOMBRE_MAX) return `El nombre no puede tener más de ${NOMBRE_MAX} caracteres.`;
    if (f.descripcion.length > DESCRIPCION_MAX) return `La descripción no puede tener más de ${DESCRIPCION_MAX} caracteres.`;
    if (!f.municipio) return 'El municipio es obligatorio.';
    return null;
}

function limpiarFormulario(prefijo) {
    ['Nombre', 'Descripcion', 'Estado', 'Municipio', 'Ciudad'].forEach(c => {
        const el = document.getElementById(prefijo + c);
        if (el) el.value = '';
    });
    const pais = document.getElementById(prefijo + 'Pais');
    if (pais) pais.value = 'México';
}

async function crearItem(cfg) {
    const btn = document.getElementById(cfg.btnId);
    if (!btn || btn.disabled) return;

    const f = leerFormulario(cfg.prefijo);
    const aviso = validarFormulario(f);
    if (aviso) { toast(aviso, 'warning'); return; }

    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = 'Creando…';

    try {
        const s = await session();
        if (!s) { toast('Inicia sesión para crear.', 'error'); return; }

        const { error } = await db.from('grupos_video').insert({
            creador_id: s.user.id,
            nombre: f.nombre,
            slug: generarSlug(f.nombre),
            descripcion: f.descripcion || null,
            ciudad: f.ciudad || null,
            estado_region: f.estado || null,
            municipio: f.municipio,
            pais: f.pais,
            visibilidad: cfg.visibilidad,
            modo_ingreso: cfg.modoIngreso,
            precio_usdt: 0,
            marketplace_activo: false,
            activo: true,
            firma_ligera: FIRMA_CANAL
        });
        if (error) throw error;

        toast(cfg.etiqueta === 'canal' ? 'Canal creado.' : 'Grupo creado.', 'success');
        limpiarFormulario(cfg.prefijo);
        cfg.cerrar();
        await cfg.recargar();
    } catch (e) {
        console.error(`[Mensajes/${cfg.etiqueta}] Error al crear:`, e);
        toast(e && e.code === '42501'
            ? 'No tienes permiso para crear esto.'
            : 'No se pudo crear. Intenta de nuevo.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = textoOriginal;
    }
}

function crearCanal() { return crearItem(CFG_CANAL); }
function crearGrupo() { return crearItem(CFG_GRUPO); }

/* ---------------- Eventos ---------------- */

function configurarEventosCanales() {
    const tarjetaDesde = (el) => (el && el.closest) ? el.closest('.canal-card[data-id]') : null;

    ['canalesLista', 'gruposLista'].forEach(id => {
        const cont = document.getElementById(id);
        if (!cont) return;
        cont.addEventListener('click', e => {
            const t = tarjetaDesde(e.target);
            if (t) abrirCanalOGrupo(t.dataset.id);
        });
        cont.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            const t = tarjetaDesde(e.target);
            if (t) abrirCanalOGrupo(t.dataset.id);
        });
    });

    document.getElementById('btnCrearCanal')?.addEventListener('click', crearCanal);
    document.getElementById('btnCrearGrupo')?.addEventListener('click', crearGrupo);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', configurarEventosCanales, { once: true });
} else {
    configurarEventosCanales();
}