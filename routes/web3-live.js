// routes/web3-live.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

// ==========================================
// CACHÉ EN MEMORIA (Evita saturar las APIs)
// ==========================================
let cacheData = null;
let cacheTimestamp = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutos

// ==========================================
// RUTA PRINCIPAL: /api/web3-live
// ==========================================
router.get('/', async (req, res) => {
    try {
        // Si tenemos datos en caché y no han expirado, los devolvemos al instante
        const ahora = Date.now();
        if (cacheData && (ahora - cacheTimestamp < CACHE_TTL)) {
            return res.json({ ok: true, data: cacheData, cached: true });
        }

        console.log('🔄 [Web3 Live] Obteniendo datos frescos de las APIs...');

        // 1. Obtener precios reales (CoinGecko - API gratuita sin key)
        const peticiones = [
            axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,matic-network,solana&vs_currencies=usd&include_24hr_change=true', { timeout: 8000 }),
            axios.get('https://gasstation.polygon.technology/v2', { timeout: 8000 }),
            axios.get('https://api.llama.fi/v2/chains', { timeout: 8000 })
        ];

        // Usamos Promise.allSettled para que si una API falla, las otras sigan funcionando
        const [preciosRes, gasRes, tvlRes] = await Promise.allSettled(peticiones);

        // --- Procesar Precios ---
        let precios = [];
        if (preciosRes.status === 'fulfilled' && preciosRes.value.data) {
            const p = preciosRes.value.data;
            precios = [
                { nombre: "Bitcoin", simbolo: "BTC", precio: p.bitcoin?.usd || 0, cambio: p.bitcoin?.usd_24h_change || 0 },
                { nombre: "Ethereum", simbolo: "ETH", precio: p.ethereum?.usd || 0, cambio: p.ethereum?.usd_24h_change || 0 },
                { nombre: "Polygon", simbolo: "POL", precio: p['matic-network']?.usd || 0, cambio: p['matic-network']?.usd_24h_change || 0 },
                { nombre: "Solana", simbolo: "SOL", precio: p.solana?.usd || 0, cambio: p.solana?.usd_24h_change || 0 }
            ];
        } else {
            console.warn('⚠️ [Web3 Live] Falló CoinGecko');
        }

        // --- Procesar Gas (Polygon) ---
        let gas = { red: "Polygon Mainnet", standard: "N/A", fast: "N/A", unidad: "Gwei" };
        if (gasRes.status === 'fulfilled' && gasRes.value.data) {
            const g = gasRes.value.data;
            gas.standard = g.standard?.maxFee || "N/A";
            gas.fast = g.fast?.maxFee || "N/A";
        } else {
            console.warn('⚠️ [Web3 Live] Falló Polygon Gas Station');
        }

        // --- Procesar DeFi (DefiLlama) ---
        let defi = { tvl_polygon: 0, tvl_ethereum: 0, moneda: "USD" };
        if (tvlRes.status === 'fulfilled' && Array.isArray(tvlRes.value.data)) {
            const chains = tvlRes.value.data;
            defi.tvl_polygon = chains.find(c => c.name === 'Polygon')?.tvl || 0;
            defi.tvl_ethereum = chains.find(c => c.name === 'Ethereum')?.tvl || 0;
        } else {
            console.warn('⚠️ [Web3 Live] Falló DefiLlama');
        }

        // --- Noticias Web3 (Array estático rotativo) ---
        // Nota: Para noticias reales se recomienda usar NewsAPI o CryptoPanic en el futuro.
        const noticias = [
            "Ethereum continúa mejorando su escalabilidad con las actualizaciones de la red principal.",
            "Polygon impulsa el desarrollo de aplicaciones ZK-Rollups para reducir costos de gas.",
            "El volumen de comercio en exchanges descentralizados (DEX) sigue creciendo a nivel global.",
            "Nuevas regulaciones sobre activos digitales buscan dar mayor claridad legal al sector Web3.",
            "La adopción de wallets digitales aumenta entre usuarios que buscan control de sus activos."
        ];

        // Construir respuesta final
        const liveData = {
            precios,
            gas,
            defi,
            noticias,
            timestamp: new Date().toISOString()
        };

        // Guardar en caché
        cacheData = liveData;
        cacheTimestamp = ahora;

        return res.json({ ok: true, data: liveData, cached: false });

    } catch (error) {
        console.error('❌ [Web3 Live] Error general:', error.message);
        
        // Si hay un error catastrófico pero tenemos caché viejo, lo usamos
        if (cacheData) {
            return res.json({ ok: true, data: cacheData, cached: true, warning: "Usando datos en caché por error de red" });
        }

        return res.status(500).json({ ok: false, error: "No se pudieron obtener los datos Web3 en este momento." });
    }
});

module.exports = router;