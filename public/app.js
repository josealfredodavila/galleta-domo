// public/app.js
class GalletaDomoApp {
    constructor() {
        // En producción, usa Railway
        this.apiUrl = 'https://galleta-domo.up.railway.app/api';
        // En desarrollo, usa localhost
        // this.apiUrl = 'http://localhost:3001/api';
    }
}