// ================================================================
// config/redes-pago.js — Csariel's
// Fuente ÚNICA de redes de pago NOWPayments.
// Usado por: routes/payments.js, routes/campanas.js
// y debe reflejarse en la lista REDES_PAGO del frontend de marketing.
//
// Los mínimos están en USD y son los que ya usa payments.js en
// producción para Muro y transmisiones. Antes de cambiarlos, verifica
// los mínimos vigentes con GET https://api.nowpayments.io/v1/min-amount
// ================================================================

'use strict';

const MXN_A_USD_APROX = 0.055;

const REDES_PERMITIDAS = {
    usdttrc20: { moneda: 'USDT', red: 'TRON',     minimo_usd: 16 },
    usdtbsc:   { moneda: 'USDT', red: 'BSC',      minimo_usd: 16 },
    usdtmatic: { moneda: 'USDT', red: 'Polygon',  minimo_usd: 16 },
    usdtsol:   { moneda: 'USDT', red: 'Solana',   minimo_usd: 16 },
    usdterc20: { moneda: 'USDT', red: 'Ethereum', minimo_usd: 20 },
    usdcsol:   { moneda: 'USDC', red: 'Solana',   minimo_usd: 16 },
    usdcmatic: { moneda: 'USDC', red: 'Polygon',  minimo_usd: 16 },
    usdcbsc:   { moneda: 'USDC', red: 'BSC',      minimo_usd: 16 },
    usdc:      { moneda: 'USDC', red: 'Ethereum', minimo_usd: 20 }
};

module.exports = { REDES_PERMITIDAS, MXN_A_USD_APROX };
