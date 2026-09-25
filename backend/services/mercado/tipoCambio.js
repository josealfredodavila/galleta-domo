'use strict';

/**
 * Mercado — Tipo de cambio USDT/MXN
 *
 * Obtiene un tipo de cambio referencial USDT/MXN desde CoinGecko.
 * Si CoinGecko falla, utiliza un valor de contingencia configurado
 * explícitamente en mercado_configuracion.
 *
 * IMPORTANTE:
 * - No utiliza un tipo de cambio fijo inventado.
 * - No permite continuar si no existe un tipo de cambio válido.
 * - Devuelve un snapshot con fuente y fecha/hora para trazabilidad.
 */

const DEFAULT_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=mxn';

const TIMEOUT_MS = 5000;

function numeroPositivo(value) {
  const numero = Number(value);

  return Number.isFinite(numero) && numero > 0
    ? numero
    : null;
}

/**
 * Obtiene USDT/MXN.
 *
 * @param {Object} options
 * @param {Object} options.supabaseClient Cliente Supabase opcional
 * @param {Function} options.fetchImpl fetch inyectable para pruebas
 * @param {Date} options.now fecha inyectable para pruebas
 *
 * @returns {Promise<Object>}
 * {
 *   tipo_cambio_mxn: number,
 *   tipo_cambio_fuente: string,
 *   tipo_cambio_at: string
 * }
 */
async function obtenerTipoCambioUSDTMXN({
  supabaseClient = null,
  fetchImpl = globalThis.fetch,
  now = new Date()
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'TIPO_CAMBIO_FETCH_UNAVAILABLE'
    );
  }

  const url =
    process.env.MERCADO_USDT_MXN_URL ||
    DEFAULT_URL;

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  try {
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          accept: 'application/json'
        },
        signal: controller.signal
      });

      if (response.ok) {
        const data = await response.json();

        const tipoCambio = numeroPositivo(
          data?.tether?.mxn
        );

        if (tipoCambio) {
          return {
            tipo_cambio_mxn: Number(
              tipoCambio.toFixed(8)
            ),
            tipo_cambio_fuente:
              process.env.MERCADO_USDT_MXN_FUENTE ||
              'CoinGecko · tether/mxn',
            tipo_cambio_at:
              now.toISOString()
          };
        }
      }

      console.warn(
        '[TIPO_CAMBIO] CoinGecko no devolvió un tipo de cambio válido.'
      );
    } catch (error) {
      console.warn(
        '[TIPO_CAMBIO] Error consultando CoinGecko:',
        error.message
      );
    }

    /*
     * Fallback controlado:
     * solamente se acepta si existe una configuración explícita
     * en mercado_configuracion.
     */
    if (supabaseClient) {
      const {
        data,
        error
      } = await supabaseClient
        .from('mercado_configuracion')
        .select('valor')
        .eq(
          'clave',
          'tipo_cambio_usdt_mxn_fallback'
        )
        .maybeSingle();

      if (!error && data) {
        const fallback = numeroPositivo(
          data.valor
        );

        if (fallback) {
          return {
            tipo_cambio_mxn: Number(
              fallback.toFixed(8)
            ),
            tipo_cambio_fuente:
              'mercado_configuracion · tipo_cambio_usdt_mxn_fallback',
            tipo_cambio_at:
              now.toISOString()
          };
        }
      }
    }

    /*
     * No se utiliza un valor fijo de emergencia.
     * Una operación financiera no debe continuar
     * utilizando un tipo de cambio inventado.
     */
    const error = new Error(
      'TIPO_CAMBIO_USDT_MXN_NO_DISPONIBLE'
    );

    error.code =
      'TIPO_CAMBIO_USDT_MXN_NO_DISPONIBLE';

    throw error;

  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convierte una cantidad de USDT a MXN usando
 * exclusivamente el snapshot recibido.
 *
 * @param {number|string} cantidadCripto
 * @param {Object} snapshot
 * @returns {number}
 */
function convertirCriptoAMxn(
  cantidadCripto,
  snapshot
) {
  const cantidad = numeroPositivo(
    cantidadCripto
  );

  if (!cantidad) {
    throw new Error(
      'CANTIDAD_CRIPTO_INVALIDA'
    );
  }

  const tipoCambio = numeroPositivo(
    snapshot?.tipo_cambio_mxn
  );

  if (!tipoCambio) {
    throw new Error(
      'SNAPSHOT_TIPO_CAMBIO_INVALIDO'
    );
  }

  return Number(
    (cantidad * tipoCambio).toFixed(2)
  );
}

module.exports = {
  obtenerTipoCambioUSDTMXN,
  convertirCriptoAMxn
};