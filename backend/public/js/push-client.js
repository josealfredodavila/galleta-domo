// ================================================================
// PUSH CLIENT - SARIEL'S ECOSYSTEM
// ================================================================
// Registra el Service Worker, pide permiso y suscribe al usuario.
// ================================================================

(function () {
    'use strict';

    const SW_PATH = '/sw.js';
    const API_BASE = '/api/push';

    let swRegistration = null;

    // ================================================================
    // DETECTAR PLATAFORMA
    // ================================================================
    function detectarDispositivo() {
        const ua = navigator.userAgent;
        if (/android/i.test(ua)) return 'android';
        if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';
        if (/Windows|Macintosh|Linux/i.test(ua) && !/Mobile/i.test(ua)) return 'desktop';
        return 'unknown';
    }

    // ================================================================
    // VERIFICAR SOPORTE
    // ================================================================
    function soportaPush() {
        return (
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window
        );
    }

    // ================================================================
    // REGISTRAR SERVICE WORKER
    // ================================================================
    async function registrarSW() {
        try {
            swRegistration = await navigator.serviceWorker.register(SW_PATH, {
                scope: '/'
            });
            console.log('[Push] Service Worker registrado:', swRegistration.scope);
            return swRegistration;
        } catch (error) {
            console.error('[Push] Error registrando SW:', error);
            return null;
        }
    }

    // ================================================================
    // OBTENER VAPID PUBLIC KEY
    // ================================================================
    async function obtenerVapidKey() {
        try {
            const res = await fetch(`${API_BASE}/vapid-public-key`);
            if (!res.ok) throw new Error('No se pudo obtener VAPID key');
            const data = await res.json();
            return data.publicKey;
        } catch (error) {
            console.error('[Push] Error obteniendo VAPID key:', error);
            return null;
        }
    }

    // ================================================================
    // CONVERTIR VAPID KEY
    // ================================================================
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // ================================================================
    // OBTENER SESIÓN
    // ================================================================
    async function obtenerSession() {
        try {
            const client = await window.supabaseReady;
            if (!client) return null;
            const { data: { session } } = await client.auth.getSession();
            return session;
        } catch (e) {
            return null;
        }
    }

    // ================================================================
    // PEDIR PERMISO Y SUSCRIBIR
    // ================================================================
    async function pedirPermisoYSuscribir() {
        if (!soportaPush()) {
            console.warn('[Push] Navegador no soporta push');
            return { success: false, error: 'no_soportado' };
        }

        let permiso = Notification.permission;
        if (permiso === 'denied') {
            return { success: false, error: 'permiso_denegado' };
        }

        if (permiso === 'default') {
            permiso = await Notification.requestPermission();
            if (permiso !== 'granted') {
                return { success: false, error: 'permiso_rechazado' };
            }
        }

        if (!swRegistration) {
            swRegistration = await registrarSW();
        }
        if (!swRegistration) {
            return { success: false, error: 'sw_error' };
        }

        const vapidKey = await obtenerVapidKey();
        if (!vapidKey) {
            return { success: false, error: 'vapid_error' };
        }

        try {
            let subscription = await swRegistration.pushManager.getSubscription();

            if (!subscription) {
                subscription = await swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey)
                });
            }

            const session = await obtenerSession();
            if (!session) {
                return { success: false, error: 'sin_sesion' };
            }

            const p256dhArray = new Uint8Array(subscription.getKey('p256dh'));
            const authArray = new Uint8Array(subscription.getKey('auth'));
            const p256dh = btoa(String.fromCharCode.apply(null, p256dhArray));
            const auth = btoa(String.fromCharCode.apply(null, authArray));

            const res = await fetch(`${API_BASE}/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + session.access_token
                },
                body: JSON.stringify({
                    endpoint: subscription.endpoint,
                    keys: { p256dh, auth },
                    device_type: detectarDispositivo()
                })
            });

            if (!res.ok) throw new Error('Error al enviar suscripción al backend');

            return { success: true, subscription };
        } catch (error) {
            console.error('[Push] Error suscribiendo:', error);
            return { success: false, error: error.message };
        }
    }

    // ================================================================
    // DESUSCRIBIR
    // ================================================================
    async function desuscribir() {
        try {
            if (!swRegistration) return { success: false };
            const subscription = await swRegistration.pushManager.getSubscription();
            if (!subscription) return { success: true };

            const session = await obtenerSession();
            if (session) {
                await fetch(`${API_BASE}/unsubscribe`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + session.access_token
                    },
                    body: JSON.stringify({ endpoint: subscription.endpoint })
                });
            }

            await subscription.unsubscribe();
            return { success: true };
        } catch (error) {
            console.error('[Push] Error desuscribiendo:', error);
            return { success: false, error: error.message };
        }
    }

    // ================================================================
    // VERIFICAR ESTADO
    // ================================================================
    async function estaSuscrito() {
        if (!swRegistration) return false;
        try {
            const sub = await swRegistration.pushManager.getSubscription();
            return sub !== null;
        } catch (e) {
            return false;
        }
    }

    // ================================================================
    // AUTO-REGISTRAR SW AL CARGAR
    // ================================================================
    if (soportaPush()) {
        registrarSW();
    }

    // ================================================================
    // API PÚBLICA
    // ================================================================
    window.CsarielsPush = {
        soporta: soportaPush,
        pedirPermisoYSuscribir,
        desuscribir,
        estaSuscrito,
        registrarSW,
        permisoActual: () => typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
        dispositivo: detectarDispositivo
    };

    console.log('[Push] Módulo cargado. Soporte:', soportaPush());
})();