// ================================================================
// MARQUINHOS · BOCA v1.0
// ================================================================
// Analiza texto en español y devuelve una secuencia de visemas
// con duración estimada por sílaba.
//
// USO:
//   var visemas = MarquinhosBoca.analizar("¡Hola! ¿Cómo estás?");
//   // Devuelve: [{visema:'O', duracion:120}, {visema:'A', duracion:80}, ...]
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosBoca) return;

    // ============================================================
    // VOCALES → VISEMAS
    // ============================================================
    // El visema es la "forma de la boca" para ese sonido.
    var VOCAL_A_VISEMA = {
        'a': 'A',  // Boca muy abierta
        'á': 'A',
        'e': 'E',  // Boca semiabierta horizontal
        'é': 'E',
        'i': 'I',  // Boca estrecha, sonrisa
        'í': 'I',
        'o': 'O',  // Boca redonda grande
        'ó': 'O',
        'u': 'U',  // Boca redonda pequeña
        'ú': 'U',
        'ü': 'U'
    };

    // Consonantes que cierran la boca momentáneamente
    var CONSONANTES_CERRADAS = ['m', 'b', 'p'];

    // ============================================================
    // SEPARAR EN SÍLABAS (aproximado para español)
    // ============================================================
    function separarSilabas(palabra) {
        if (!palabra) return [];

        // Normalizar
        palabra = palabra.toLowerCase().trim();
        if (!palabra) return [];

        // Las vocales son: a, e, i, o, u (+ á, é, í, ó, ú, ü)
        var esVocal = function(c) {
            return 'aeiouáéíóúü'.indexOf(c) !== -1;
        };

        var esFuerte = function(c) {
            return 'aeoáéó'.indexOf(c) !== -1;
        };

        var esDebil = function(c) {
            return 'iuíúü'.indexOf(c) !== -1;
        };

        var silabas = [];
        var actual = '';
        var i = 0;

        while (i < palabra.length) {
            var c = palabra[i];
            actual += c;

            // ¿Es vocal?
            if (esVocal(c)) {
                var siguiente = palabra[i + 1];

                // Diptongo: vocal débil + vocal fuerte (o al revés)
                if (siguiente && esVocal(siguiente)) {
                    var combinacion = c + siguiente;
                    // Diptongos comunes
                    if (
                        (esDebil(c) && esFuerte(siguiente)) ||
                        (esFuerte(c) && esDebil(siguiente)) ||
                        (esDebil(c) && esDebil(siguiente))
                    ) {
                        actual += siguiente;
                        i++;
                    }
                }

                // Cierre de sílaba
                silabas.push(actual);
                actual = '';
            } else {
                // Consonante. ¿Cierra sílaba?
                var sig = palabra[i + 1];
                if (sig && esVocal(sig)) {
                    // La consonante va con la siguiente vocal
                    // (excepto si ya tenemos 2 consonantes, cerramos sílaba)
                    var consonantesEnActual = 0;
                    for (var k = 0; k < actual.length; k++) {
                        if (!esVocal(actual[k])) consonantesEnActual++;
                    }
                    if (consonantesEnActual >= 2 && silabas.length > 0) {
                        // Consonante huérfana
                        silabas.push(actual);
                        actual = '';
                    }
                }
            }
            i++;
        }

        if (actual) silabas.push(actual);
        return silabas.filter(function(s) { return s.length > 0; });
    }

    // ============================================================
    // SÍLABA → VISEMA (basado en la vocal fuerte)
    // ============================================================
    function silabaAVisema(silaba) {
        if (!silaba) return 'REST';

        // Buscar la vocal fuerte (o la primera vocal)
        var vocalesFuertes = 'aeoáéó';
        var vocalesTodas = 'aeiouáéíóúü';

        // 1. Buscar vocal fuerte
        for (var i = 0; i < silaba.length; i++) {
            var c = silaba[i];
            if (vocalesFuertes.indexOf(c) !== -1) {
                return VOCAL_A_VISEMA[c] || 'O';
            }
        }

        // 2. Si no hay fuerte, buscar cualquier vocal
        for (var j = 0; j < silaba.length; j++) {
            var c2 = silaba[j];
            if (vocalesTodas.indexOf(c2) !== -1) {
                return VOCAL_A_VISEMA[c2] || 'I';
            }
        }

        // 3. Sin vocal (raro). ¿Es m/b/p? → CERRADO
        for (var k = 0; k < silaba.length; k++) {
            if (CONSONANTES_CERRADAS.indexOf(silaba[k]) !== -1) return 'M';
        }

        return 'REST';
    }

    // ============================================================
    // DURACIÓN DE SÍLABA (estimada)
    // ============================================================
    function duracionSilaba(silaba, visema) {
        var base = 100; // 100ms base por sílaba

        // Sílabas con diptongo duran más
        var vocalesCount = 0;
        for (var i = 0; i < silaba.length; i++) {
            if ('aeiouáéíóúü'.indexOf(silaba[i]) !== -1) vocalesCount++;
        }
        if (vocalesCount >= 2) base += 40;

        // Visemas con más apertura duran más
        if (visema === 'A' || visema === 'O') base += 20;
        else if (visema === 'E') base += 10;
        else if (visema === 'I' || visema === 'U') base -= 10;
        else if (visema === 'M') base -= 30;

        // Consonantes finales alargan
        var ultimaLetra = silaba[silaba.length - 1];
        if ('nslrzxj'.indexOf(ultimaLetra) !== -1) base += 20;

        return base;
    }

    // ============================================================
    // ANALIZAR TEXTO → SECUENCIA DE VISEMAS
    // ============================================================
    function analizar(texto) {
        if (!texto || typeof texto !== 'string') return [];

        // Limpiar: quitar signos de puntuación pero conservar espacios
        var limpio = texto
            .replace(/[¡!¿?.,;:()\[\]{}"']/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        if (!limpio) return [];

        var palabras = limpio.split(' ');
        var resultado = [];

        palabras.forEach(function(palabra, idxPalabra) {
            if (!palabra) return;

            var silabas = separarSilabas(palabra);

            silabas.forEach(function(silaba, idxSilaba) {
                var visema = silabaAVisema(silaba);
                var duracion = duracionSilaba(silaba, visema);

                resultado.push({
                    visema: visema,
                    duracion: duracion,
                    silaba: silaba
                });
            });

            // Pausa entre palabras (excepto la última)
            if (idxPalabra < palabras.length - 1) {
                resultado.push({
                    visema: 'REST',
                    duracion: 60,
                    silaba: ' '
                });
            }
        });

        return resultado;
    }

    // ============================================================
    // ESTIMAR DURACIÓN TOTAL (con rate)
    // ============================================================
    function duracionTotal(visemas, rate) {
        if (!visemas || !visemas.length) return 0;
        var rateFactor = rate || 1.0;
        var total = 0;
        visemas.forEach(function(v) {
            total += v.duracion;
        });
        return total / rateFactor;
    }

    // ============================================================
    // EXPONER API
    // ============================================================
    window.MarquinhosBoca = {
        analizar: analizar,
        separarSilabas: separarSilabas,
        silabaAVisema: silabaAVisema,
        duracionSilaba: duracionSilaba,
        duracionTotal: duracionTotal
    };

    console.log('[Marquinhos/Boca] ✅ Analizador de visemas cargado');
})();