# 📐 Arquitectura del Sistema — Csariel's Ecosystem

> Documentación técnica de la arquitectura, módulos, stack y flujos del ecosistema **Csariel's**.

---

## 1. Resumen Ejecutivo

**Csariel's Ecosystem** es una infraestructura digital **multi-tenant** de alta escalabilidad que integra:

- 🤖 **Inteligencia Artificial** conversacional con memoria persistente
- ⛓️ **Protocolos blockchain** (Web3) sobre Polygon
- 💰 **Rieles financieros multi-canal** (fiat + cripto)
- 📱 **Telecomunicaciones** (eSIM, SMS, VoIP)
- 🛒 **Marketplace** multi-tenant con logística de última milla
- 📹 **Streaming** en vivo con WebRTC
- 💬 **Mensajería** en tiempo real
- 🌐 **Red social** integrada

Diseñado bajo principios de **separación de responsabilidades**, **aislamiento multi-tenant** y **seguridad defensiva en profundidad**.

---

## 2. Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                      │
│  (HTML5 + CSS3 + JavaScript Vanilla)                        │
│                                                              │
│  features/    legal/    marketing/    info/                 │
│    ├── marquinhos/                                          │
│    ├── mercado/                                             │
│    ├── mensajes/                                            │
│    ├── live/                                                │
│    ├── muro/                                                │
│    ├── perfil/                                              │
│    └── ...                                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ HTTPS / WebSocket
┌─────────────────────────────────────────────────────────────┐
│                     CAPA DE API (REST)                       │
│  Node.js + Express                                          │
│                                                              │
│  routes/                                                     │
│    ├── auth.js                                              │
│    ├── ai-chat-pet.js    ← Marquinhos                       │
│    ├── ai-tts.js         ← TTS                              │
│    ├── mercado.js                                           │
│    ├── membresia.js                                         │
│    ├── payments.js                                          │
│    ├── telnyx.js                                            │
│    ├── livekit.js                                           │
│    └── ...                                                  │
│                                                              │
│  middleware/                                                 │
│    ├── auth.js           ← JWT validation                   │
│    ├── rateLimit.js      ← Anti-DDoS                        │
│    └── validation.js     ← Sanitization                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   CAPA DE LÓGICA DE NEGOCIO                  │
│  controllers/ + services/                                    │
│                                                              │
│  • Reglas de negocio por dominio                             │
│  • Orquestación de servicios externos                        │
│  • Validación de estados                                     │
│  • Idempotencia y atomicidad                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   CAPA DE PERSISTENCIA                       │
│                                                              │
│  PostgreSQL (Supabase)         Redis                        │
│  ├── usuarios                  ├── Cache                    │
│  ├── marquinhos_*              ├── Rate limiting            │
│  ├── mercado_*                 └── Colas de trabajos        │
│  ├── pay_*                                                  │
│  └── ...                                                    │
│                                                              │
│  Supabase Storage              Polygon Blockchain           │
│  ├── Audios TTS                ├── ES.TOKS (ERC-20)         │
│  ├── Avatares                  └── NFTs (ERC-721)           │
│  └── Imágenes                                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVICIOS EXTERNOS                        │
│                                                              │
│  IA                Pagos               Telecom              │
│  ├── Groq          ├── Stripe          ├── Telnyx           │
│  ├── ElevenLabs    ├── Stripe Connect  └── ...              │
│  └── Whisper       ├── NOWPayments                          │
│                    ├── Fintoc          Blockchain           │
│                    └── ...             ├── Polygon RPC      │
│                                        └── WalletConnect    │
│  Video                                                       │
│  ├── LiveKit        Seguridad          Otros                │
│  └── ...            ├── Turnstile      ├── NVIDIA           │
│                     └── ...            └── ...              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Módulos del Sistema

### 3.1 🤖 IA Cognitiva — Marquinhos

**Ubicación:** `features/marquinhos/` + `routes/ai-chat-pet.js` + `routes/ai-tts.js` + `routes/ai-voice.js`

**Responsabilidad:** Agente conversacional autónomo con memoria persistente.

**Componentes:**
| Archivo | Función |
|---------|---------|
| `marquinhos-pet.js` | Widget flotante (avatar interactivo) |
| `marquinhos-pet.css` | Estilos del widget + modales |
| `marquinhos-brain.js` | Cliente al backend IA |
| `marquinhos-boca.js` | Análisis de texto → visemas |
| `marquinhos-animaciones.js` | Animaciones de brazos, ojos, cabeza |
| `marquinhos-accesorios-svg.js` | Biblioteca de accesorios SVG |
| `marquinhos-fit.js` | Coordenadas compartidas |
| `tienda.js` + `tienda.html` | Tienda de accesorios |

**Stack IA:**
- **LLM:** Llama 3.3 70B vía Groq (inferencia ultra-rápida)
- **STT:** Whisper API / Web Speech API
- **TTS:** Backend propio + respaldo navegador
- **Memoria:** PostgreSQL + pgvector (RAG multi-tenant)

📖 **Documentación completa:** [Ficha de Marquinhos](../features/marquinhos.md)

---

### 3.2 🛒 Marketplace — Mercado

**Ubicación:** `features/mercado/` + `routes/mercado*.js` + `services/mercado/`

**Responsabilidad:** Marketplace multi-tenant con tiendas, productos, pedidos y repartidores.

**Subsistemas:**
- **Vendedores:** Creación de tiendas, catálogo, inventario
- **Compradores:** Carrito, checkout, pedidos
- **Repartidores:** Asignación de pedidos, tracking de entrega
- **Membresías comerciales:** Básico / Pro / Máximo

**Prefijo de tablas:** `mercado_*` (aislado del resto)

**Flujo de pedido:**
```
Cliente → Selecciona tienda → Productos → Pedido
   ↓
Tienda recibe → Prepara → Repartidor asume → Entrega → Reseña
```

---

### 3.3 💳 Csariel's Pay

**Ubicación:** `routes/payments.js`, `routes/pay/`, `routes/payments/` + `services/stripe.js`, `services/fintoc.js`, `services/nowpayments.js`

**Responsabilidad:** Capa unificada de pagos multi-proveedor.

**Prefijo de tablas:** `pay_*`

**Métodos de pago:**
| Método | Proveedor | Cobertura |
|--------|-----------|-----------|
| 💳 Tarjeta | Stripe | México, Colombia, Chile, Argentina, Perú, Ecuador |
| 🏦 SPEI | Fintoc | México |
| ₿ USDT | NOWPayments | Global |
| ₮ USDC | NOWPayments | Global |

**Rieles de retiro:**
| Riel | Proveedor |
|------|-----------|
| 🏦 SPEI saliente | Fintoc |
| 💳 Tarjeta (payout) | Stripe Connect |
| ₿ Crypto (payout) | NOWPayments |

**Seguridad financiera:**
- Verificación de firma obligatoria en webhooks
- Confirmación exclusiva vía webhook (nunca desde el navegador)
- Idempotencia por `idempotency_key`
- Reserva atómica de saldo antes de payouts
- RLS en todas las tablas `pay_*`

---

### 3.4 💬 Mensajería

**Ubicación:** `features/mensajes/` + `routes/mensajes.js`

**Responsabilidad:** Chat en tiempo real entre usuarios.

**Características:**
- Chat 1 a 1 (Supabase Realtime)
- Multimedia: imágenes, videos, archivos, voz
- Indicadores de escritura y conexión
- Bloqueo de usuarios
- Asistente IA integrado (Marquinhos en modo mensajería)

---

### 3.5 📹 Live Streaming

**Ubicación:** `features/live/` + `routes/livekit.js` + `services/webrtc.js`

**Responsabilidad:** Transmisiones en vivo con WebRTC.

**Stack:**
- **LiveKit** para el transporte de audio/video
- Chat en vivo con moderación
- Sistema de donaciones con niveles
- Grabación y VOD
- Transmisiones asociadas a grupos

---

### 3.6 📱 Telecom — eSIM

**Ubicación:** `features/internet/` + `routes/telnyx.js` + `services/telnyx/`

**Responsabilidad:** Aprovisionamiento de eSIM, SMS y VoIP.

**Stack:**
- **Telnyx** para SIM provisioning
- Compra de paquetes de datos
- Activación / desactivación remota
- QR de activación
- Monitoreo de consumo

---

### 3.7 ⛓️ Web3 — ES.TOKS + NFTs

**Ubicación:** `web3/` (repo separado con Hardhat)

**Responsabilidad:** Activos digitales y economía tokenizada.

**Smart Contracts:**
| Contrato | Estándar | Función |
|----------|----------|---------|
| `CsarielsToken.sol` | ERC-20 | ES.TOKS (utility token) |
| `CsarielsNFT.sol` | ERC-721 | NFTs de fidelización |

**Blockchain:** Polygon (EVM compatible)

**Funcionalidades:**
- Domos físicos con QR → 1 domo = 1 ES.TOK
- Acumulación de ES.TOKS
- 12 ES.TOKS → 1 NFT recompensa
- Conexión vía MetaMask + WalletConnect
- Sistema P2P
- Operaciones verificables on-chain

**Nota legal:** Los activos en blockchain son **públicos e inmutables**. La eliminación de una cuenta no puede borrarlos.

---

### 3.8 🌐 Red Social — Muro

**Ubicación:** `features/muro/`

**Responsabilidad:** Publicaciones, interacciones sociales y tendencias.

**Características:**
- Posts (texto, imagen, video)
- Likes, comentarios, hashtags, menciones
- Sistema de notificaciones
- Recompensas por interacción
- Marketplace P2P de ES.TOKS integrado

---

### 3.9 👤 Perfil y Configuración

**Ubicación:** `features/perfil/` + `features/configuracion/`

**Responsabilidad:** Identidad del usuario y preferencias.

**Características:**
- Datos personales, avatar, bio
- Wallet Web3 vinculada
- Preferencias de idioma y apariencia
- Gestión de membresía
- Configuración de seguridad (2FA, biometría)

---

## 4. Stack Tecnológico

### Backend
| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Auth | JWT + Supabase Auth |
| Seguridad | Helmet, CORS, Rate Limiting, Turnstile |
| Containerización | Docker |
| Deploy | Railway |

### Frontend
| Capa | Tecnología |
|------|-----------|
| HTML | HTML5 semántico |
| Estilos | CSS3 vanilla + variables CSS |
| JavaScript | Vanilla ES6+ (sin frameworks) |
| Internacionalización | Sistema de claves `data-clave` |

### Base de Datos
| Componente | Tecnología |
|------------|-----------|
| Principal | PostgreSQL (Supabase) |
| Vectores | pgvector (para memoria IA) |
| Cache / Colas | Redis |
| Storage | Supabase Storage |
| Seguridad | Row Level Security (RLS) |

### Integraciones Externas
| Categoría | Proveedores |
|-----------|-------------|
| IA Conversacional | Groq (Llama 3.3 70B) |
| Voz | ElevenLabs, Whisper |
| Pagos Fiat | Stripe, Stripe Connect, Fintoc |
| Pagos Cripto | NOWPayments |
| Telecom | Telnyx |
| Video | LiveKit (WebRTC) |
| Blockchain | Polygon (RPC), WalletConnect |
| Captcha | Cloudflare Turnstile |
| IA de Imagen | NVIDIA |
| Auth | Supabase Auth |

---

## 5. Flujos de Datos Clave

### 5.1 Autenticación

```
Usuario ingresa credenciales
   ↓
Frontend → POST /api/auth/login
   ↓
Backend valida con Supabase Auth
   ↓
Genera JWT + guarda sesión
   ↓
Cliente guarda JWT en localStorage
   ↓
Cada request incluye: Authorization: Bearer <JWT>
```

### 5.2 Conversación con Marquinhos

```
Usuario toca el avatar
   ↓
SpeechRecognition captura voz
   ↓
Texto → marquinhos-brain.js
   ↓
Backend → Groq API (Llama 3.3 70B)
   ↓
Consulta memoria vectorial (pgvector, filtrada por usuario_id)
   ↓
Respuesta generada
   ↓
TTS (ElevenLabs o navegador) + animación de boca (visemas)
   ↓
Audio reproducido + animación sincronizada
```

### 5.3 Pago de Mercado

```
Comprador → Carrito → Checkout
   ↓
Backend crea intent con el proveedor (Stripe/Fintoc/NOWPayments)
   ↓
Redirige a página de pago del proveedor
   ↓
Comprador completa pago
   ↓
Proveedor envía webhook firmado
   ↓
Backend verifica firma
   ↓
Confirma pedido + acredita saldo al vendedor
   ↓
Notificación al vendedor
```

### 5.4 Compra de Accesorio de Marquinhos

```
Usuario abre tienda
   ↓
Carga catálogo desde Supabase (marquinhos_accesorios)
   ↓
Click en "Comprar"
   ↓
RPC comprar_cosmetico(p_item_id)
   ↓
Validaciones: saldo, plan premium, no duplicado
   ↓
INSERT en marquinhos_inventario + UPDATE marquinhos_accesorios
   ↓
Accesorio equipado → aparece en el pet
```

### 5.5 Escaneo de Domo (Web3)

```
Usuario escanea QR del domo físico
   ↓
Backend verifica QR único
   ↓
1 domo = 1 ES.TOK
   ↓
Firma transacción con BACKEND_SIGNER_PRIVATE_KEY
   ↓
Emisión on-chain en Polygon (ERC-20)
   ↓
Registro en Supabase (para mostrarlo en UI)
   ↓
Acumulación: 12 ES.TOKS → 1 NFT recompensa
```

---

## 6. Seguridad en Profundidad

| Capa | Medidas |
|------|---------|
| **Red** | Railway edge + Turnstile (captcha) |
| **API** | Rate limiting, Helmet, CORS, validación |
| **Auth** | JWT + Supabase Auth + 2FA + biometría |
| **Datos** | RLS por usuario + RPC firmadas |
| **Pagos** | Webhooks firmados + idempotencia + reserva atómica |
| **Web3** | Firma EIP-712 + verificación on-chain |
| **Storage** | URLs firmadas con expiración |
| **Logs** | Auditoría de operaciones sensibles |

📖 **Documentación completa:** [Privacidad y Cumplimiento](../security/privacy.md)

---

## 7. Deploy e Infraestructura

### Plataforma
- **Railway** (PaaS para backend + workers)

### Estructura del deploy
```
┌──────────────────────────────┐
│    Railway Project           │
│  (lucid-heart / production)  │
│                              │
│  ├── galleta-domo (backend)  │
│  ├── worker (background)     │
│  └── PostgreSQL (add-on)     │
└──────────────────────────────┘
                │
                ▼
    ┌───────────────────────┐
    │   Supabase (externo)  │
    │   • PostgreSQL        │
    │   • Auth              │
    │   • Storage           │
    │   • Realtime          │
    └───────────────────────┘
```

### Variables de entorno
Todas las claves sensibles viven en **Railway → Variables**.
Nunca se comitean al repositorio.

📖 **Documentación completa:** [Variables de Entorno](../stack/environment-variables.md)

### Containerización
```bash
# Build
docker build -t csariels-core-engine .

# Run
docker run -p 8080:8080 --env-file .env csariels-core-engine
```

---

## 8. Aislamiento Multi-Tenant

Cada usuario tiene **su propia burbuja de datos**, garantizada por:

1. **Row Level Security (RLS)** en PostgreSQL
2. **Filtrado por `auth.uid()`** en todas las queries
3. **RPC con validación de ownership**
4. **Storage con paths por usuario**

**Ejemplo:**
```sql
-- El usuario solo ve sus propios recuerdos
CREATE POLICY "user_own_memories" ON marquinhos_memoria
  FOR ALL USING (usuario_id = auth.uid());
```

---

## 9. Escalabilidad

| Aspecto | Estrategia |
|---------|-----------|
| **Backend** | Horizontal (múltiples instancias Railway) |
| **DB** | Connection pooling (Supabase) |
| **Cache** | Redis para rate limiting y sesiones |
| **Storage** | Supabase Storage con CDN |
| **Webhooks** | Cola de trabajos (worker.js) |
| **Blockchain** | Polygon (bajo costo, alta velocidad) |

---

## 10. Roadmap Técnico

| Fase | Estado |
|------|--------|
| MVP — Mercado + Pay + Mensajería | ✅ Completado |
| Marquinhos v9.7 | ✅ Completado |
| Sistema de membresías de Marquinhos | 🚧 En desarrollo |
| Documentación OpenAPI | 📋 Planeado |
| Tests automatizados (CI/CD) | 📋 Planeado |
| SaaS / Marca Blanca | 📋 Planeado |

---

## 📄 Licencia

**Copyright © 2026 Csariel's. Todos los derechos reservados.**

Software confidencial y propietario.

---

*Última actualización: Octubre 2026*