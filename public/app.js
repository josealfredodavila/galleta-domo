// public/app.js
class GalletaDomoApp {
    constructor() {
        // DETECTA AUTOMÁTICAMENTE SI ESTÁ EN PRODUCCIÓN
        this.apiUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001/api'
            : '/api';  // En Vercel, usa la misma URL
        // ... resto del código igual
    }
}