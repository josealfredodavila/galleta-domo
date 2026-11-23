/* ================================================================
   REACCIONES GLOBAL · Csariel's · v5.0
   Módulo compartido para TODO el ecosistema (muro, perfil, perfil
   público, grupos, videos, live).

   Fuente de verdad: public.reacciones_emojis (activo = true),
   leída con la RPC obtener_emojis_reaccion().
   Escritura: public.publicaciones_reacciones, validada en la base
   (clave foránea al catálogo + políticas RLS).

   Uso en cualquier página:
     <link rel="stylesheet" href="/features/shared/css/reacciones-global.css">
     <script src="/features/shared/js/reacciones-global.js"></script>

     await ReaccionesGlobal.preparar(client);
     var barra = ReaccionesGlobal.crearBarra({
         client: client,
         publicacionId: id,
         usuarioId: uid,
         resumen: resumen        // opcional
     });
     contenedor.appendChild(barra.el);
   ================================================================ */
(function () {
    'use strict';

    var VERSION = '5.0';

    if (window.ReaccionesGlobal && window.ReaccionesGlobal.version === VERSION) return;

    var CSS_PATH = '/features/shared/css/reacciones-global.css';

    /* Respaldo SOLO si la base no responde. */
    var RESPALDO = ['❤️', '😂', '🥺', '💎'];

    var CLASE = {
        '❤️': 'rg-corazon',
        '😂': 'rg-risa',
        '🥺': 'rg-brillo',
        '💎': 'rg-diamante',
        '🤩': 'rg-estrellas'
    };

    var TODAS_CLASES = ['rg-corazon', 'rg-risa', 'rg-brillo', 'rg-diamante', 'rg-estrellas', 'rg-fluido'];

    var catalogo = null;
    var cargandoCatalogo = null;
    var cerradorInstalado = false;

    /* ================= UTILIDADES ================= */

    function asegurarCss() {
        if (document.querySelector('link[href="' + CSS_PATH + '"]')) return;

        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = CSS_PATH;
        document.head.appendChild(link);
    }

    function codigosActivos() {
        var lista = catalogo || RESPALDO.map(function (c) { return { codigo: c }; });
        return lista.map(function (f) { return f.codigo; });
    }

    function esValido(emoji) {
        return codigosActivos().indexOf(emoji) !== -1;
    }

    function normalizar(emoji) {
        if (esValido(emoji)) return emoji;
        var codigos = codigosActivos();
        return codigos[0] || '❤️';
    }

    function claseEmoji(emoji) {
        return CLASE[emoji] || 'rg-fluido';
    }

    function toastAviso(msg, tipo) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, tipo || 'info');
        } else {
            console.warn('[ReaccionesGlobal]', msg);
        }
    }

    /* Asigna la animación del emoji con duración y desfase aleatorios
       para que no se muevan todos al mismo ritmo. */
    function aplicarMotor(nodo, emoji) {
        if (!nodo) return;

        nodo.classList.add('rg-emo');

        TODAS_CLASES.forEach(function (c) {
            nodo.classList.remove(c);
        });

        nodo.classList.add(claseEmoji(emoji));

        var duracion = 1.6 + Math.random() * 1.2;

        nodo.style.setProperty('--dur', duracion.toFixed(2) + 's');
        nodo.style.setProperty('--delay', (-Math.random() * duracion).toFixed(2) + 's');
    }

    /* Resume filas { tipo, usuario_id } en totales, total y reacción propia. */
    function resumir(filas, usuarioId) {
        var totales = {};
        var total = 0;
        var miTipo = null;

        (filas || []).forEach(function (f) {
            if (!f || !f.tipo) return;

            totales[f.tipo] = (totales[f.tipo] || 0) + 1;
            total++;

            if (usuarioId && f.usuario_id === usuarioId) miTipo = f.tipo;
        });

        return { totales: totales, total: total, miTipo: miTipo };
    }

    function dominante(resumen) {
        var claves = Object.keys(resumen.totales || {});

        if (!claves.length) return null;

        claves.sort(function (a, b) {
            return resumen.totales[b] - resumen.totales[a];
        });

        return claves[0];
    }

    /* ================= CATÁLOGO ================= */

    async function preparar(client) {
        if (catalogo) return catalogo;
        if (!client) return null;

        if (!cargandoCatalogo) {
            cargandoCatalogo = (async function () {
                try {
                    var r = await client.rpc('obtener_emojis_reaccion');

                    if (r.error) throw r.error;

                    var filas = (Array.isArray(r.data) ? r.data : [])
                        .filter(function (f) { return f && f.codigo; });

                    if (!filas.length) throw new Error('Catálogo vacío');

                    catalogo = filas.map(function (f) {
                        return {
                            codigo: f.codigo,
                            nombre: f.nombre || '',
                            orden: f.orden || 0
                        };
                    });
                } catch (e) {
                    console.warn('[ReaccionesGlobal] Usando respaldo:', e);
                } finally {
                    cargandoCatalogo = null;
                }

                return catalogo;
            })();
        }

        return cargandoCatalogo;
    }

    /* ================= DATOS ================= */

    async function cargarResumen(client, publicacionId, usuarioId) {
        var r = await client
            .from('publicaciones_reacciones')
            .select('tipo, usuario_id')
            .eq('publicacion_id', publicacionId);

        if (r.error) throw r.error;

        return resumir(r.data || [], usuarioId);
    }

    /* Devuelve un Map: publicacion_id (texto) → resumen. */
    async function cargarResumenLote(client, ids, usuarioId) {
        var mapa = new Map();
        var lista = (ids || []).filter(Boolean);

        if (!client || !lista.length) return mapa;

        var r = await client
            .from('publicaciones_reacciones')
            .select('publicacion_id, tipo, usuario_id')
            .in('publicacion_id', lista);

        if (r.error) throw r.error;

        var porPub = {};

        (r.data || []).forEach(function (row) {
            var k = String(row.publicacion_id);
            (porPub[k] = porPub[k] || []).push(row);
        });

        lista.forEach(function (id) {
            mapa.set(String(id), resumir(porPub[String(id)] || [], usuarioId));
        });

        return mapa;
    }

    /* Reglas: mismo emoji = quitar; otro emoji = cambiar; ninguno = agregar.
       Devuelve el resumen actualizado. */
    async function alternar(client, publicacionId, emoji, usuarioId) {
        if (!usuarioId) throw new Error('Inicia sesión para reaccionar.');
        if (!esValido(emoji)) throw new Error('Esa reacción no está disponible.');

        var existente = await client
            .from('publicaciones_reacciones')
            .select('id, tipo')
            .eq('publicacion_id', publicacionId)
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (existente.error) throw existente.error;

        var res;

        if (existente.data && existente.data.tipo === emoji) {
            res = await client
                .from('publicaciones_reacciones')
                .delete()
                .eq('id', existente.data.id);
        } else if (existente.data) {
            res = await client
                .from('publicaciones_reacciones')
                .update({ tipo: emoji })
                .eq('id', existente.data.id);
        } else {
            res = await client
                .from('publicaciones_reacciones')
                .insert({
                    publicacion_id: publicacionId,
                    usuario_id: usuarioId,
                    tipo: emoji
                });
        }

        if (res.error) throw res.error;

        return cargarResumen(client, publicacionId, usuarioId);
    }

    /* ================= COMPONENTE ================= */

    function cerrarTodos() {
        document.querySelectorAll('.rg-menu').forEach(function (m) {
            m.hidden = true;
        });
    }

    function instalarCerrador() {
        if (cerradorInstalado) return;

        cerradorInstalado = true;

        document.addEventListener('click', function (e) {
            if (!e.target.closest || !e.target.closest('.rg-wrap')) {
                cerrarTodos();
            }
        });
    }

    function construir(resumen, reaccionar) {
        var r = resumen || { totales: {}, total: 0, miTipo: null };

        var wrap = document.createElement('div');
        wrap.className = 'rg-wrap';

        var menu = document.createElement('div');
        menu.className = 'rg-menu';
        menu.hidden = true;

        codigosActivos().forEach(function (emoji) {
            var b = document.createElement('button');

            b.type = 'button';
            b.className = 'rg-opcion' + (r.miTipo === emoji ? ' activa' : '');
            b.setAttribute('data-codigo', emoji);
            b.setAttribute('aria-label', 'Reaccionar con ' + emoji);

            var ico = document.createElement('span');
            ico.className = 'rg-icono';
            ico.textContent = emoji;
            aplicarMotor(ico, emoji);

            b.appendChild(ico);

            var n = r.totales[emoji] || 0;

            if (n > 0) {
                var cuenta = document.createElement('span');
                cuenta.className = 'rg-count';
                cuenta.textContent = String(n);
                b.appendChild(cuenta);
            }

            b.addEventListener('click', function (ev) {
                ev.stopPropagation();
                menu.hidden = true;
                reaccionar(emoji);
            });

            menu.appendChild(b);
        });

        var trigger = document.createElement('button');

        trigger.type = 'button';
        trigger.className = 'rg-disparador' + (r.miTipo ? ' activa' : '');
        trigger.setAttribute('aria-label', 'Reacciones');

        var emojiMostrado = r.miTipo || dominante(r) || normalizar(null);

        var icoTrig = document.createElement('span');
        icoTrig.className = 'rg-icono';
        icoTrig.textContent = emojiMostrado;
        aplicarMotor(icoTrig, emojiMostrado);

        var texto = document.createElement('span');
        texto.className = 'rg-total';
        texto.textContent = r.total > 0 ? String(r.total) : 'Reaccionar';

        trigger.appendChild(icoTrig);
        trigger.appendChild(texto);

        trigger.addEventListener('click', function (ev) {
            ev.stopPropagation();

            var abrir = menu.hidden;

            cerrarTodos();
            menu.hidden = !abrir;
        });

        wrap.appendChild(menu);
        wrap.appendChild(trigger);

        return wrap;
    }

    function crearBarra(opciones) {
        opciones = opciones || {};

        var client = opciones.client;
        var publicacionId = opciones.publicacionId;
        var usuarioId = opciones.usuarioId || null;

        var estado = {
            ocupado: false,
            resumen: opciones.resumen || { totales: {}, total: 0, miTipo: null },
            raiz: null
        };

        instalarCerrador();

        function marcarBotones(desactivar) {
            if (!estado.raiz) return;

            estado.raiz.querySelectorAll('button').forEach(function (b) {
                b.disabled = desactivar;
            });
        }

        function pintar(resumen) {
            estado.resumen = resumen;

            var nueva = construir(resumen, reaccionar);

            if (estado.raiz && estado.raiz.parentNode) {
                estado.raiz.parentNode.replaceChild(nueva, estado.raiz);
            }

            estado.raiz = nueva;
        }

        async function reaccionar(emoji) {
            if (estado.ocupado) return;

            if (!usuarioId) {
                toastAviso('Inicia sesión para reaccionar.', 'warning');
                return;
            }

            estado.ocupado = true;
            marcarBotones(true);

            try {
                var nuevo = await alternar(client, publicacionId, emoji, usuarioId);

                pintar(nuevo);

                if (typeof opciones.onCambio === 'function') {
                    opciones.onCambio(nuevo);
                }
            } catch (e) {
                console.warn('[ReaccionesGlobal] Reacción:', e);

                toastAviso(
                    'No se pudo guardar tu reacción' + (e && e.message ? ' (' + e.message + ')' : ''),
                    'error'
                );
            } finally {
                estado.ocupado = false;
                marcarBotones(false);
            }
        }

        estado.raiz = construir(estado.resumen, reaccionar);

        return {
            get el() { return estado.raiz; },
            actualizar: pintar,
            resumen: function () { return estado.resumen; }
        };
    }

    /* ================= API PÚBLICA ================= */

    var API = {
        version: VERSION,
        preparar: preparar,
        emojis: codigosActivos,
        esValido: esValido,
        normalizar: normalizar,
        claseEmoji: claseEmoji,
        aplicarMotor: aplicarMotor,
        resumir: resumir,
        cargarResumen: cargarResumen,
        cargarResumenLote: cargarResumenLote,
        alternar: alternar,
        crearBarra: crearBarra,
        cerrarTodos: cerrarTodos,
        asegurarCss: asegurarCss
    };

    /* Compatibilidad con código que leía EMOJIS / POR_DEFECTO. */
    Object.defineProperty(API, 'EMOJIS', { get: codigosActivos });
    Object.defineProperty(API, 'POR_DEFECTO', {
        get: function () { return codigosActivos()[0] || '❤️'; }
    });

    window.ReaccionesGlobal = API;

    asegurarCss();
    instalarCerrador();
})();