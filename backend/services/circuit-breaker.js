// ================================================================
// backend/services/circuit-breaker.js
// ================================================================
// Circuit breaker en memoria. Una instancia por proveedor.
//
// Si un proveedor falla N veces seguidas, se "abre el circuito"
// y no se le llama por X tiempo. Así evitamos gastar cuota y
// tiempo cuando el proveedor está caído.
// ================================================================

'use strict';

class CircuitBreaker {
    constructor({ nombre, umbral = 5, pausaMs = 10 * 60 * 1000 } = {}) {
        this.nombre = nombre;
        this.umbral = umbral;
        this.pausaMs = pausaMs;
        this.fallos = 0;
        this.abiertoHasta = 0;
    }

    estaAbierto() {
        if (this.abiertoHasta === 0) return false;
        if (Date.now() < this.abiertoHasta) return true;

        // Pasó la pausa: se vuelve a intentar desde cero
        this.abiertoHasta = 0;
        this.fallos = 0;
        return false;
    }

    registrarExito() {
        this.fallos = 0;
    }

    registrarFallo() {
        this.fallos += 1;
        if (this.fallos >= this.umbral) {
            this.abiertoHasta = Date.now() + this.pausaMs;
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                mod: 'circuit-breaker',
                evento: 'circuito_abierto',
                proveedor: this.nombre,
                pausa_ms: this.pausaMs
            }));
        }
    }
}

module.exports = { CircuitBreaker };