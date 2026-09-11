import { supabase } from '../ruta/a/tu/supabaseClient.js'; // <-- MODIFICA ESTA RUTA

// Variables de estado
let currentUser = null;
let campaigns = [];
let currentWizardData = {};
let currentChartInstances = {};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = '/login.html'; // Redirigir si no está logueado
        return;
    }
    currentUser = user;
    
    await loadPricing();
    await loadCampaigns();
    setupEventListeners();
});

// --- CARGA DE DATOS ---
async function loadPricing() {
    const { data, error } = await supabase
        .from('marketing_pricing')
        .select('*')
        .eq('activo', true);
    if (error) console.error('Error cargando precios:', error);
    // Guardamos el mínimo para validación posterior
    window.marketingPricing = data || [];
}

async function loadCampaigns() {
    const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('anunciante_id', currentUser.id)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error cargando campañas:', error);
        return;
    }
    campaigns = data || [];
    renderCampaigns(campaigns);
    calculateSummary(campaigns);
}

async function loadTargets(type) {
    const table = type === 'live' ? 'lives' : 'grupos'; // ⚠️ CONFIRMA LOS NOMBRES REALES DE TUS TABLAS
    const { data, error } = await supabase.from(table).select('id, nombre'); // Ajusta los campos según tu tabla
    if (error) {
        console.error(`Error cargando ${type}:`, error);
        return [];
    }
    return data || [];
}

// --- RENDERIZADO ---
function renderCampaigns(list) {
    const container = document.getElementById('campaigns-list');
    container.innerHTML = '';
    
    if (list.length === 0) {
        container.innerHTML = '<p style="color: #aaa;">No tienes campañas creadas aún.</p>';
        return;
    }

    list.forEach(camp => {
        const card = document.createElement('div');
        card.className = 'campaign-card';
        card.innerHTML = `
            <h3>${camp.nombre}</h3>
            <p><strong>Estado:</strong> ${camp.estado}</p>
            <p><strong>Presupuesto:</strong> $${camp.presupuesto} ${camp.moneda}</p>
            <p><strong>Gastado:</strong> $${camp.gastado}</p>
            <p><strong>Inicio:</strong> ${new Date(camp.fecha_inicio).toLocaleDateString()}</p>
            <p><strong>Fin:</strong> ${new Date(camp.fecha_fin).toLocaleDateString()}</p>
        `;
        card.addEventListener('click', () => openDetail(camp.id));
        container.appendChild(card);
    });
}

function calculateSummary(list) {
    let budget = 0, active = 0, spent = 0;
    list.forEach(c => {
        budget += parseFloat(c.presupuesto || 0);
        spent += parseFloat(c.gastado || 0);
        if (c.estado === 'activa') active++;
    });
    document.getElementById('total-budget').textContent = `$${budget.toFixed(2)}`;
    document.getElementById('active-campaigns').textContent = active;
    document.getElementById('total-spent').textContent = `$${spent.toFixed(2)}`;
    
    // El alcance e impresiones se cargarán desde daily_stats en el detalle.
    // Aquí ponemos un placeholder vacío hasta que se cargue el detalle.
    document.getElementById('total-reach').textContent = 'Ver detalle';
}

// --- DETALLE DE CAMPAÑA Y GRÁFICOS ---
async function openDetail(campaignId) {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    document.getElementById('detail-title').textContent = campaign.nombre;
    document.getElementById('detail-info').innerHTML = `
        <p><strong>Estado:</strong> ${campaign.estado}</p>
        <p><strong>Presupuesto:</strong> $${campaign.presupuesto} ${campaign.moneda}</p>
        <p><strong>Gastado:</strong> $${campaign.gastado}</p>
        <p><strong>Restante:</strong> $${(campaign.presupuesto - campaign.gastado).toFixed(2)}</p>
        <p><strong>Destino:</strong> ${campaign.objetivo}</p>
    `;

    document.getElementById('modal-detail').classList.remove('hidden');

    // Cargar estadísticas reales
    const { data: stats, error } = await supabase
        .from('marketing_daily_stats')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('fecha', { ascending: true });

    if (error) {
        console.error('Error cargando stats:', error);
        return;
    }

    if (!stats || stats.length === 0) {
        document.getElementById('detail-info').innerHTML += `<p style="color: #f59e0b; margin-top:10px;">Las estadísticas aparecerán cuando la campaña comience a recibir tráfico.</p>`;
        return;
    }

    // Renderizar gráficos con Chart.js (Datos Reales)
    renderCharts(stats);
}

function renderCharts(stats) {
    // Destruir gráficos anteriores si existen
    Object.values(currentChartInstances).forEach(chart => chart.destroy());
    currentChartInstances = {};

    const labels = stats.map(s => new Date(s.fecha).toLocaleDateString());
    const reachData = stats.map(s => s.alcance);
    const impressionsData = stats.map(s => s.impresiones);
    const spentData = stats.map(s => s.gasto);

    const commonOptions = {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: '#aaa' } }, y: { ticks: { color: '#aaa' } } }
    };

    currentChartInstances.reach = new Chart(document.getElementById('chart-reach'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Alcance', data: reachData, borderColor: '#3b82f6', tension: 0.3 }] },
        options: { ...commonOptions, plugins: { title: { display: true, text: 'Alcance por día', color: '#fff' } } }
    });

    currentChartInstances.impressions = new Chart(document.getElementById('chart-impressions'), {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Impresiones', data: impressionsData, backgroundColor: '#10b981' }] },
        options: { ...commonOptions, plugins: { title: { display: true, text: 'Impresiones por día', color: '#fff' } } }
    });

    currentChartInstances.spent = new Chart(document.getElementById('chart-spent'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Gasto', data: spentData, borderColor: '#ef4444', tension: 0.3 }] },
        options: { ...commonOptions, plugins: { title: { display: true, text: 'Gasto por día', color: '#fff' } } }
    });
}

// --- WIZARD DE CREACIÓN ---
function setupEventListeners() {
    // Abrir modal creación
    document.getElementById('btn-create-campaign').addEventListener('click', () => {
        document.getElementById('modal-create').classList.remove('hidden');
        resetWizard();
    });

    // Cerrar modales
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.add('hidden');
        });
    });

    // Paso 1: Tipo
    document.querySelectorAll('.btn-option').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const type = e.target.dataset.type;
            currentWizardData.target_tipo = type;
            const targets = await loadTargets(type);
            const select = document.getElementById('select-target');
            select.innerHTML = targets.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('');
            showStep(2);
        });
    });

    // Paso 2: Destino
    document.querySelector('#wizard-step-2 .btn-next').addEventListener('click', () => {
        currentWizardData.target_id = document.getElementById('select-target').value;
        showStep(3);
    });

    // Paso 3: Nombre
    document.querySelector('#wizard-step-3 .btn-next').addEventListener('click', () => {
        currentWizardData.nombre = document.getElementById('campaign-name').value;
        showStep(4);
    });

    // Paso 4: Objetivo
    document.querySelector('#wizard-step-4 .btn-next').addEventListener('click', () => {
        currentWizardData.objetivo = document.getElementById('campaign-objective').value;
        showStep(5);
    });

    // Paso 5: Presupuesto
    document.querySelector('#wizard-step-5 .btn-next').addEventListener('click', () => {
        const budget = parseFloat(document.getElementById('campaign-budget').value);
        // Validar mínimo consultando marketing_pricing
        const pricing = window.marketingPricing.find(p => p.tipo === currentWizardData.target_tipo);
        const min = pricing ? pricing.minimo : 0;
        
        if (budget < min) {
            alert(`El presupuesto mínimo para este tipo es $${min} MXN`);
            return;
        }
        currentWizardData.presupuesto = budget;
        showStep(6);
    });

    // Paso 6: Contenido
    document.querySelector('#wizard-step-6 .btn-next').addEventListener('click', () => {
        currentWizardData.ad = {
            titulo: document.getElementById('ad-title').value,
            descripcion: document.getElementById('ad-description').value,
            imagen_url: document.getElementById('ad-image').value,
            video_url: document.getElementById('ad-video').value,
            cta_texto: document.getElementById('ad-cta').value,
        };
        renderSummary();
        showStep(7);
    });

    // Paso 7: Pago
    document.getElementById('btn-pay').addEventListener('click', processPayment);
}

function showStep(stepNumber) {
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.add('hidden'));
    document.getElementById(`wizard-step-${stepNumber}`).classList.remove('hidden');
}

function resetWizard() {
    currentWizardData = {};
    document.querySelectorAll('.wizard-step input, .wizard-step select, .wizard-step textarea').forEach(el => el.value = '');
    showStep(1);
}

function renderSummary() {
    const summary = document.getElementById('summary-content');
    summary.innerHTML = `
        <p><strong>Campaña:</strong> ${currentWizardData.nombre}</p>
        <p><strong>Destino:</strong> ${currentWizardData.target_tipo} (ID: ${currentWizardData.target_id})</p>
        <p><strong>Objetivo:</strong> ${currentWizardData.objetivo}</p>
        <p><strong>Presupuesto:</strong> $${currentWizardData.presupuesto} MXN</p>
        <p><strong>Contenido:</strong> ${currentWizardData.ad.titulo}</p>
    `;
}

// --- PAGO Y CREACIÓN FINAL ---
async function processPayment() {
    // 1. Crear la campaña en estado 'borrador' o 'pendiente_pago'
    const { data: campaignData, error: campaignError } = await supabase
        .from('marketing_campaigns')
        .insert([{
            anunciante_id: currentUser.id,
            nombre: currentWizardData.nombre,
            objetivo: currentWizardData.objetivo,
            presupuesto: currentWizardData.presupuesto,
            moneda: 'MXN',
            estado: 'pendiente_pago', // Estado inicial para ir a pagar
            fecha_inicio: new Date().toISOString(),
            fecha_fin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 días por defecto
        }])
        .select()
        .single();

    if (campaignError) {
        console.error('Error creando campaña:', campaignError);
        alert('Error al crear la campaña');
        return;
    }

    // 2. Crear el anuncio vinculado
    const { error: adError } = await supabase
        .from('marketing_ads')
        .insert([{
            campaign_id: campaignData.id,
            titulo: currentWizardData.ad.titulo,
            descripcion: currentWizardData.ad.descripcion,
            imagen_url: currentWizardData.ad.imagen_url,
            video_url: currentWizardData.ad.video_url,
            cta_texto: currentWizardData.ad.cta_texto,
            activo: true
        }]);

    if (adError) {
        console.error('Error creando anuncio:', adError);
        // Nota: Podrías querer hacer un rollback de la campaña aquí
    }

    // 3. Crear el target
    const targetField = currentWizardData.target_tipo === 'live' ? 'live_id' : 'grupo_id';
    await supabase.from('marketing_campaign_targets').insert([{
        campaign_id: campaignData.id,
        target_tipo: currentWizardData.target_tipo,
        [targetField]: currentWizardData.target_id
    }]);

    // 4. Integración con el flujo de pago existente.
    // ⚠️ AQUÍ DEBES LLAMAR A TU BACKEND DE NOWPAYMENTS O AL MÓDULO DE PAGOS EXISTENTE
    // NO inventes la API. Si ya tienes un endpoint, reemplaza esto:
    // window.location.href = `/api/pagos/nowpayments?campaign_id=${campaignData.id}`;
    
    alert('Campaña creada. Redirigiendo al sistema de pagos existente...');
    // Simulación de redirección:
    // window.location.href = '/ruta-a-tu-modulo-de-pagos'; 
}