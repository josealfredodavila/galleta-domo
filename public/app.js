// public/app.js
class GalletaDomoApp {
    constructor() {
        // ✅ IMPORTANTE: Para Vercel, la API está en /api
        this.apiUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001/api'
            : '/api';
        // ... resto del código igual
    }
}