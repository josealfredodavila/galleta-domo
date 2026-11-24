// Miniatura del anillo: imagen para fotos, icono para videos (nunca <img> con un .mp4)
function miniaturaAnillo(estado, fallbackLetra) {
    if (estado && estado.media_tipo === 'video') {
        return el('span', { class: 'story-avatar story-video' }, [
            el('svg', { class: 'icon', viewBox: '0 0 24 24' }, [
                el('path', { d: 'M7 4.5v15l12-7.5z' })
            ])
        ]);
    }
    var url = estado ? (estado.media_url || estado.imagen_url || '') : '';
    if (url) return el('img', { src: url, alt: '' });
    return el('span', { class: 'story-avatar', text: fallbackLetra || '+' });
}

function renderizarBarraHistorias() {
    var contenedor = document.getElementById('csStoryStrip');
    if (!contenedor) return;
    limpiar(contenedor);

    var miHistoria = historiasDelFeed.find(function (u) {
        return sessionUser && u.usuario_id === sessionUser.id;
    });

    // ---- MI HISTORIA ----
    if (miHistoria && miHistoria.estados.length > 0) {
        var ultimo = miHistoria.estados[miHistoria.estados.length - 1];
        var ringMio = el('span', { class: 'cs-story-ring' }, [miniaturaAnillo(ultimo, 'Tú')]);
        contenedor.appendChild(
            el('button', {
                type: 'button',
                class: 'cs-story-item',
                onclick: function () { abrirHistoriasDe(sessionUser.id); }
            }, [ringMio, el('span', null, 'Tú')])
        );
    } else {
        var ringAdd = el('span', { class: 'cs-story-ring story-add' }, [
            el('span', { class: 'cs-story-plus' }, [
                el('svg', { class: 'icon', viewBox: '0 0 24 24' }, [
                    el('path', { d: 'M12 5v14M5 12h14' })
                ])
            ])
        ]);
        contenedor.appendChild(
            el('button', { type: 'button', class: 'cs-story-item', onclick: crearHistoria },
                [ringAdd, el('span', null, 'Tu historia')])
        );
    }

    // ---- OTRAS HISTORIAS ----
    historiasDelFeed.forEach(function (u) {
        if (sessionUser && u.usuario_id === sessionUser.id) return;

        var vistas = todosVistos(u.estados);
        var inicial = (u.nombre || '?').charAt(0).toUpperCase();
        var ring = el('span', { class: 'cs-story-ring' + (vistas ? ' vista' : '') }, [
            u.avatar_url ? el('img', { src: u.avatar_url, alt: '' }) : el('span', { class: 'story-avatar', text: inicial })
        ]);

        var nombre = u.nombre || u.handle || 'Explorador';
        contenedor.appendChild(
            el('button', {
                type: 'button',
                class: 'cs-story-item',
                onclick: function () { abrirHistoriasDe(u.usuario_id); }
            }, [ring, el('span', null, nombre)])
        );
    });
}
