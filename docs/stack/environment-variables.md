# 🔐 Variables de Entorno — Csariel's Ecosystem

> Documentación de todas las variables de configuración del sistema.
> **⚠️ NUNCA comitear valores reales al repositorio.**

---

## 1. Introducción

Las variables de entorno de Csariel's Ecosystem viven **exclusivamente** en:

| Entorno | Dónde se configuran |
|---------|---------------------|
| **Producción** | Railway → Project → Variables |
| **Desarrollo local** | Archivo `.env` (nunca comiteado) |
| **CI/CD** | GitHub Secrets (si se usa) |

**Regla de oro:** El archivo `.env` **NUNCA** se sube al repositorio. Verifica que esté en `.gitignore`.

---

## 2. Categorías

| Categoría | Cantidad aprox. |
|-----------|-----------------|
| 🏗️ Infraestructura | 3 |
| 🗄️ Base de Datos | 4 |
| ⛓️ Blockchain | 6 |
| 🤖 IA | 3 |
| 💳 Pagos | 8 |
| 📱 Telecom | 13 |
| 📹 Video | 4 |
| 🔒 Seguridad | 3 |
| 🌐 URLs | 4 |
| 🎨 Otros | 2 |

**Total aproximado:** ~48 variables

---

## 3. Infraestructura

### `NODE_ENV`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Entorno de ejecución |
| **Valores** | `development`, `production` |
| **Ejemplo** | `production` |

### `PORT`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Puerto del servidor Express |
| **Valor por defecto** | `8080` |
| **Ejemplo** | `8080` |

### `REDIS_URL`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Conexión a Redis (cache, colas, rate limiting) |
| **Formato** | `redis://user:password@host:port` |
| **Ejemplo** | `redis://default:***@redis.railway.internal:6379` |

### `REDIS_PASSWORD`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Password de Redis (si se usa separado) |
| **Formato** | String |
| **Nota** | Preferir autenticación embebida en `REDIS_URL` |

---

## 4. Base de Datos — Supabase

### `SUPABASE_URL`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | URL del proyecto Supabase |
| **Formato** | `https://{project-id}.supabase.co` |
| **Ejemplo** | `https://zultnlogdoajehbswlih.supabase.co` |
| **Uso** | Cliente frontend + backend |

### `SUPABASE_ANON_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Clave pública (segura para frontend) |
| **Formato** | JWT largo |
| **Uso** | Autenticación desde el navegador (respeta RLS) |
| **Nivel de seguridad** | 🟢 Público |

### `SUPABASE_SERVICE_ROLE_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Clave de servicio (ignora RLS) |
| **Formato** | JWT largo |
| **Uso** | Operaciones administrativas desde el backend |
| **Nivel de seguridad** | 🔴 **SECRETO CRÍTICO** |

⚠️ **Nunca exponer esta clave al frontend.** Solo el backend la usa.

---

## 5. Blockchain — Polygon

### `POLYGON_RPC_URL`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Endpoint RPC para Polygon |
| **Formato** | URL HTTPS o WSS |
| **Ejemplo** | `https://polygon-mainnet.g.alchemy.com/v2/***` |
| **Uso** | Leer y escribir en blockchain |

### `POLYGON_CHAIN_ID`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | ID de la red Polygon |
| **Valores** | `137` (Mainnet), `80002` (Amoy testnet) |
| **Uso** | Firmar transacciones |

### `BACKEND_SIGNER_PRIVATE_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Llave privada para firmar transacciones on-chain |
| **Formato** | Hex `0x...` de 32 bytes |
| **Uso** | Emitir ES.TOKS, acuñar NFTs |
| **Nivel de seguridad** | 🔴 **CRÍTICO** |

⚠️ Esta wallet debe tener **fondos MATIC** para gas. Nunca exponer.

### `EIP712_DOMAIN_NAME`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Nombre del dominio EIP-712 (firmas typed) |
| **Ejemplo** | `Csariels` |
| **Uso** | Firmar mensajes off-chain |

### `EIP712_DOMAIN_VERSION`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Versión del dominio EIP-712 |
| **Ejemplo** | `1` |
| **Uso** | Firmas EIP-712 |

### `WALLETCONNECT_PROJECT_ID`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | ID del proyecto WalletConnect |
| **Formato** | String |
| **Uso** | Conexión de wallets desde el frontend |

---

## 6. Inteligencia Artificial

### `GROQ_API_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | API key de Groq (LLM principal) |
| **Formato** | `gsk_...` |
| **Uso** | Chat de Marquinhos (Llama 3.3 70B) |
| **Nivel de seguridad** | 🔴 Secreto |

### `NVIDIA_API_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | API key de NVIDIA |
| **Uso** | Procesamiento IA (imagen/video) |
| **Nivel de seguridad** | 🔴 Secreto |

### `ELEVENLABS_API_KEY` *(si se usa)*
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | API key de ElevenLabs |
| **Uso** | Síntesis de voz (TTS) para Marquinhos |
| **Nivel de seguridad** | 🔴 Secreto |

**Nota:** Si no ves esta variable en tu Railway, significa que el TTS corre vía otro servicio o el navegador.

---

## 7. Pagos — Stripe

### `STRIPE_PUBLISHABLE_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Clave pública de Stripe |
| **Formato** | `pk_live_...` o `pk_test_...` |
| **Uso** | Frontend (inicializar Stripe.js) |
| **Nivel de seguridad** | 🟢 Público |

### `STRIPE_SECRET_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Clave secreta de Stripe |
| **Formato** | `sk_live_...` o `sk_test_...` |
| **Uso** | Backend (crear PaymentIntents, cobrar) |
| **Nivel de seguridad** | 🔴 **CRÍTICO** |

### `STRIPE_WEBHOOK_SECRET`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Secreto para verificar webhooks de Stripe |
| **Formato** | `whsec_...` |
| **Uso** | Validar firma en `/webhooks/stripe` |
| **Nivel de seguridad** | 🔴 Secreto |

---

## 8. Pagos — Fintoc (SPEI México)

### `FINTOC_SECRET_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Clave secreta de Fintoc |
| **Formato** | `sk_live_...` |
| **Uso** | Crear intents, consultar estado |
| **Nivel de seguridad** | 🔴 Secreto |

### `FINTOC_JWS_PRIVATE_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Llave privada JWS para payouts SPEI |
| **Formato** | PEM o JSON |
| **Uso** | Firmar transferencias salientes |
| **Nivel de seguridad** | 🔴 **CRÍTICO** |

### `FINTOC_WEBHOOK_SECRET`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Secreto para verificar webhooks de Fintoc |
| **Formato** | String |
| **Uso** | Validar firma HMAC-SHA256 |
| **Nivel de seguridad** | 🔴 Secreto |

---

## 9. Pagos — NOWPayments (Cripto)

### `NOWPAYMENTS_API_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | API key de NOWPayments |
| **Formato** | String |
| **Uso** | Crear invoices cripto |
| **Nivel de seguridad** | 🔴 Secreto |

### `NOWPAYMENTS_IPN_SECRET`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Secreto para IPN (Instant Payment Notification) |
| **Formato** | String |
| **Uso** | Verificar webhooks de NOWPayments |
| **Nivel de seguridad** | 🔴 Secreto |

---

## 10. Telecom — Telnyx

### `TELNYX_API_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | API key principal de Telnyx |
| **Formato** | `KEY...` |
| **Uso** | Enviar SMS, gestionar eSIMs, VoIP |
| **Nivel de seguridad** | 🔴 **CRÍTICO** |

### `TELNYX_KEY_ID`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | ID de la API key |
| **Uso** | Autenticación alternativa |

### `TELNYX_PUBLIC_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Clave pública para verificar webhooks |
| **Uso** | Validar firma de webhooks entrantes |
| **Nivel de seguridad** | 🟡 Semi-público |

### `TELNYX_WEBHOOK_SECRET`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Secreto adicional para webhooks |
| **Nivel de seguridad** | 🔴 Secreto |

### `TELNYX_CALLER_ID`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Número desde el que se originan llamadas/SMS |
| **Formato** | `+52...` |
| **Uso** | VoIP saliente, SMS |

### `TELNYX_ALLOWED_PREFIXES`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Prefijos de números permitidos |
| **Formato** | Lista separada por comas |
| **Ejemplo** | `+52,+1` |

### `TELNYX_VOICE_APP_ID`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | ID de la aplicación de voz |
| **Uso** | Enrutamiento de llamadas VoIP |

### `TELNYX_SIP_CONNECTION_ID`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | ID de la conexión SIP |
| **Uso** | Establecer sesiones SIP |

### `TELNYX_SIP_USERNAME`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Usuario SIP |
| **Uso** | Autenticación SIP |

### `TELNYX_SIP_PASSWORD`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Password SIP |
| **Nivel de seguridad** | 🔴 Secreto |

### `TELNYX_WHATSAPP_PHONE_NUMBER`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Número de WhatsApp Business |
| **Formato** | `+52...` |
| **Uso** | Integración WhatsApp |

---

## 11. Video — LiveKit

### `LIVEKIT_API_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | API key de LiveKit |
| **Formato** | `API...` |
| **Uso** | Generar tokens de acceso a salas |
| **Nivel de seguridad** | 🔴 Secreto |

### `LIVEKIT_API_SECRET`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Secreto de LiveKit |
| **Uso** | Firmar tokens de acceso |
| **Nivel de seguridad** | 🔴 **CRÍTICO** |

### `LIVEKIT_URL`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | URL HTTPS del servidor LiveKit |
| **Formato** | `wss://...` o `https://...` |
| **Uso** | Cliente se conecta vía WebSocket |

### `LIVEKIT_WS_URL`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | URL WebSocket de LiveKit |
| **Formato** | `wss://...` |
| **Uso** | Alternativa si `LIVEKIT_URL` no incluye protocolo |

---

## 12. Seguridad

### `TURNSTILE_SECRET_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Cloudflare Turnstile (captcha) — clave secreta |
| **Uso** | Verificar tokens de captcha en backend |
| **Nivel de seguridad** | 🔴 Secreto |

### `TURNSTILE_SITE_KEY`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Cloudflare Turnstile — clave pública |
| **Uso** | Frontend (renderizar widget) |
| **Nivel de seguridad** | 🟢 Público |

### `JWT_SECRET` *(si aplica)*
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | Secreto para firmar JWT propios |
| **Nivel de seguridad** | 🔴 Secreto |

**Nota:** Si Supabase Auth maneja los JWT, esta variable podría no existir.

---

## 13. URLs Públicas

### `PUBLIC_URL`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | URL principal de la app |
| **Formato** | `https://[DOMINIO_PENDIENTE]` |
| **Uso** | Links en emails, redirecciones |

### `PUBLIC_APP_URL`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | URL de la app (frontend) |
| **Uso** | Redirecciones post-login |

### `DEFAULT_PUBLIC_APP_URL`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | URL por defecto si no hay otra |
| **Uso** | Fallback |

### `SITE_URL`
| Propiedad | Valor |
|-----------|-------|
| **Propósito** | URL canónica del sitio |
| **Uso** | SEO, meta tags |

---

## 14. Buenas Prácticas

### ✅ HACER

- ✅ Guardar todas las claves en **Railway → Variables**
- ✅ Usar **claves diferentes** para dev y producción
- ✅ **Rotar claves** cada 90 días (especialmente críticas)
- ✅ Verificar que `.env` esté en `.gitignore`
- ✅ Usar `SUPABASE_SERVICE_ROLE_KEY` **solo en backend**
- ✅ Habilitar **2FA** en las cuentas de proveedores (Stripe, Telnyx, etc.)
- ✅ Documentar nuevas variables aquí al agregarlas

### ❌ NO HACER

- ❌ **NUNCA** comitear `.env` al repo
- ❌ **NUNCA** exponer `SERVICE_ROLE_KEY` al frontend
- ❌ **NUNCA** compartir capturas donde se vean claves
- ❌ **NUNCA** usar claves de producción en desarrollo
- ❌ **NUNCA** reutilizar claves entre proyectos
- ❌ **NUNCA** poner claves en el código fuente (hardcoded)

---

## 15. Cómo Agregar una Nueva Variable

**Checklist:**

1. ✅ Agregar la variable en **Railway → Variables**
2. ✅ Agregarla también en tu `.env` local
3. ✅ Documentarla **aquí** con:
   - Nombre
   - Propósito
   - Formato
   - Uso
   - Nivel de seguridad
4. ✅ Verificar que `.env` no se comitee
5. ✅ Hacer deploy y verificar que todo funcione

---

## 16. Cómo Rotar Claves (si hay brecha)

| Paso | Acción |
|------|--------|
| 1 | **Revocar** la clave comprometida en el proveedor |
| 2 | **Generar** una nueva clave |
| 3 | **Actualizar** en Railway |
| 4 | **Actualizar** en `.env` local (devs) |
| 5 | **Redesplegar** en Railway |
| 6 | **Notificar** al equipo |
| 7 | **Registrar** en el log de incidentes |

### Prioridad de rotación

| Prioridad | Variables |
|-----------|-----------|
| 🔴 **Inmediata** | `SUPABASE_SERVICE_ROLE_KEY`, `BACKEND_SIGNER_PRIVATE_KEY`, `STRIPE_SECRET_KEY`, `TELNYX_API_KEY` |
| 🟠 **24 horas** | `GROQ_API_KEY`, `LIVEKIT_API_SECRET`, `FINTOC_SECRET_KEY`, `NOWPAYMENTS_API_KEY` |
| 🟡 **72 horas** | Webhook secrets, claves públicas |

---

## 17. Verificación de Configuración

**Al hacer deploy, verifica:**

```bash
# Backend
✅ Servidor arranca sin errores
✅ Conexión a Supabase OK
✅ Conexión a Redis OK
✅ Conexión a Polygon RPC OK
✅ Endpoint /health responde

# Servicios externos
✅ Stripe: cobro de prueba OK
✅ Fintoc: webhook test OK
✅ Telnyx: SMS de prueba OK
✅ LiveKit: token generado OK
✅ Groq: consulta IA OK
```

---

## 18. Contacto

| Canal | Información |
|-------|-------------|
| 🌐 **Sitio Web** | `[DOMINIO_PENDIENTE]` |
| 📧 **Soporte técnico** | `[EMAIL_TECNICO_PENDIENTE]` |
| 🔐 **Seguridad** | `[EMAIL_SEGURIDAD_PENDIENTE]` |

---

## 📄 Licencia

**Copyright © 2026 Csariel's. Todos los derechos reservados.**

---

*Última actualización: Octubre 2026*