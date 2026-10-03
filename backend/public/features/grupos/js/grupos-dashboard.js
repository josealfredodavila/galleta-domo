// ================================================================
// GRUPOS · DASHBOARD
// ================================================================
// Carga "Mis Canales" y "En Vivo Ahora" + switch de tabs.
// Depende de: grupos-config.js, grupos-utils.js
// ================================================================

// ================================================================
// CARGAR DASHBOARD (Mis Canales + En Vivo)
// ================================================================
async function cargarDashboard() {
    var misCanalesDiv = document.getElementById('misCanalesLista');
    var enVivoDiv = document.getElementById('enVivoGrid');
    if (!misCanalesDiv || !enVivoDiv) return;

    if (!(await esperarSupabase())) {
        console.warn('[Grupos] cargarDashboard: supabaseClient no disponible');
        return;
    }

    try {
        if (!window.supabaseClient) return;

        // ---- MIS CANALES ----
        if (!sessionUser) {
            misCanalesDiv.innerHTML = '<div class="empty-state" style="padding:20px;"><svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg><p style="font-size:0.7rem;">Inicia sesión para ver tus canales.</p></div>';
        } else {
            var misGruposResult = await window.supabaseClient
                .from('grupos_video_miembros')
                .select('grupo_id')
                .eq('usuario_id', sessionUser.id)
                .eq('estado', 'activo');
            var ids = (misGruposResult.data || []).map(function(m) { return m.grupo_id; });

            if (ids.length > 0) {
                var misCanalesData = await window.supabaseClient
                    .from('grupos_video')
                    .select('id, nombre, avatar_url, precio_usdt, marketplace_activo')
                    .in('id', ids);
                misCanalesCache = misCanalesData.data || [];

                misCanalesDiv.innerHTML = misCanalesCache.map(function(g) {
                    var avatar = g.avatar_url
                        ? '<img src="' + grpEscapeHTML(grpSafeUrl(g.avatar_url)) + '">'
                        : '◈';
                    var precio = g.precio_usdt > 0 ? '$' + g.precio_usdt + ' USDT' : 'Gratis';
                    var mkIcon = g.marketplace_activo
                        ? '<svg class="icon icon-sm" viewBox="0 0 24 24" style="vertical-align:middle;"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>'
                        : '';
                    return '<div class="canal-item" onclick="abrirGrupo(\'' + g.id + '\')">' +
                        '<div class="avatar-mini">' + avatar + '</div>' +
                        '<div class="info">' +
                        '<div class="nombre">' + grpEscapeHTML(g.nombre) + ' ' + mkIcon + '</div>' +
                        '<div class="stats">' + precio + '</div>' +
                        '</div></div>';
                }).join('');
            } else {
                misCanalesDiv.innerHTML = '<div class="empty-state" style="padding:20px;"><svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg><p style="font-size:0.7rem;">No sigues ningún canal aún.</p></div>';
            }
        }

        // ---- EN VIVO AHORA ----
        var livesResult = await window.supabaseClient
            .from('transmisiones')
            .select(`*, grupo:grupos_video(id, nombre, avatar_url)`)
            .eq('estado', 'en_vivo')
            .eq('is_live', true)
            .order('created_at', { ascending: false })
            .limit(20);

        var lives = livesResult.data || [];

        if (lives.length === 0) {
            var botonAireHTML;
            if (misCanalesCache && misCanalesCache.length > 0) {
                botonAireHTML = '<button class="btn-salir-aire" onclick="abrirGrupo(\'' + misCanalesCache[0].id + '\')">' +
                    '<svg class="icon icon-sm" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg>' +
                    'SALIR AL AIRE EN ' + grpEscapeHTML(misCanalesCache[0].nombre).toUpperCase() +
                    '</button>';
            } else {
                botonAireHTML = '<button class="btn-salir-aire" onclick="abrirModalCrearGrupo()">' +
                    '<svg class="icon icon-sm" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg>' +
                    'Crear mi canal' +
                    '</button>';
            }
            enVivoDiv.innerHTML = `<div class="no-live-box">
                <svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg>
                <h3>Nadie al aire por ahora</h3>
                <p>Sé el primero en transmitir en tu canal</p>
                ${botonAireHTML}
            </div>`;
        } else {
            enVivoDiv.innerHTML = lives.map(function(l) {
                var g = l.grupo || {};
                var img = grpSafeUrl(g.avatar_url);
                return `<div class="en-vivo-card" onclick="abrirGrupo('${g.id}')">
                    <div class="live-tag-small">
                        <svg class="icon icon-sm" viewBox="0 0 24 24" style="color:#fff;fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg>
                        EN VIVO
                    </div>
                    <div style="width:100%; height:130px; background:#000; display:flex; align-items:center; justify-content:center; color:#fff; font-size:2rem; position:relative;">
                        ${img ? `<img src="${grpEscapeHTML(img)}" style="width:60px; height:60px; border-radius:50%; border:2px solid var(--gold); box-shadow: 0 0 20px rgba(212,175,55,0.6);">` : '◈'}
                    </div>
                    <div class="info">
                        <div class="titulo">${grpEscapeHTML(l.titulo || 'Sin título')}</div>
                        <div class="canal">${grpEscapeHTML(g.nombre || 'Canal')}</div>
                        <div class="stats">
                            <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            ${l.espectadores || 0} viendo
                        </div>
                    </div>
                </div>`;
            }).join('');
        }
    } catch (e) {
        console.warn('[Grupos] Error cargando dashboard:', e);
    }
}

// ================================================================
// SWITCH ENTRE TABS MÓVILES (Mis Canales / En Vivo)
// ================================================================
function switchTab(tab) {
    var tabMis = document.getElementById('tabMisCanales');
    var tabVivo = document.getElementById('tabEnVivo');
    var colMis = document.getElementById('colMisCanales');
    var colVivo = document.getElementById('colEnVivo');

    if (tab === 'mis-canales') {
        tabMis.classList.add('active');
        tabVivo.classList.remove('active');
        colMis.style.display = 'block';
        colVivo.style.display = 'none';
    } else {
        tabVivo.classList.add('active');
        tabMis.classList.remove('active');
        colVivo.style.display = 'block';
        colMis.style.display = 'none';
    }
}