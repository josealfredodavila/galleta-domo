# 🍪 Csariel's Ecosistema WEB3

Plataforma Web3 integral y super-app multimedia que combina comercio físico, activos digitales, cámara inteligente con IA multimodal, red social, marketplace, transmisiones en vivo, mensajería, pagos cripto, pagos con tarjeta, pagos SPEI y servicios digitales en un mismo ecosistema.

---

## 📋 Descripción

**Csariel's Ecosistema** conecta productos físicos, tecnología Web3, inteligencia artificial generativa y servicios digitales mediante una arquitectura desacoplada de alto rendimiento, sirviendo el frontend estático a través de Cloudflare Pages y centralizando la API de negocio, orquestación de IA y lógica de backend en Railway.

### Arquitectura de Infraestructura

| Capa | Plataforma / Tecnología | Función |
| :--- | :--- | :--- |
| **Frontend CDN** | Cloudflare Pages (`csariels.pages.dev`) | Distribución de activos estáticos, HTML, CSS, JS, PWA y enrutamiento amigable (`_redirects`). |
| **API Backend & AI Orchestrator** | Railway (Node.js / Express) | Procesamiento de negocio, webhooks de pagos, endpoints `/api/` y orquestación inteligente de motores de IA. |
| **API Shim** | `api-config.js` (Inyectado en build) | Intercepta llamadas fetch relativas `/api/` y las redirige transparente y dinámicamente al backend. |
| **Base de Datos & Storage** | Supabase (PostgreSQL + RLS + Storage) | Autenticación, persistencia de datos, almacenamiento multimedia por cuotas, funciones RPC y sockets Realtime. |
| **Motores de IA Multimodal** | MediaPipe + OpenAI + NVIDIA NIM + Anthropic | Procesamiento facial local en tiempo real, edición generativa, video IA y comprensión visual de escenas. |
| **Distribución Multimedia** | Cloudflare Images & Stream | Optimización dinámica de imágenes, distribución global de medios y streaming de video. |
| **Red Blockchain** | Polygon Network | Contratos inteligentes para ES.TOKS y NFTs del sistema de recompensas. |

---

### El ecosistema incluye:

* 🏠 **Domos de galleta** con QR únicos
* 🪙 **ES.TOKS** sobre Polygon
* 🎁 **NFTs** asociados al sistema de recompensas
* 📸 **Csariel's AI Camera** — cámara inteligente multimodal (Web + Mobile)
* 👤 **Perfiles y red social** con niveles Sariel's Pro
* 📰 **Muro social**
* 💬 **Mensajería en tiempo real**
* 🎥 **Live Streaming**
* 🛒 **Mercado**, marketplace de productos y servicios
* 🚴 **Sistema de repartidores**
* 💳 **Csariel's Pay** — pagos con tarjeta, SPEI y criptomonedas
* 📱 **eSIM** mediante Telnyx API
* 🤖 **Funciones de IA y asistente**
* 🔐 **Seguridad, autenticación y protección de datos**

---

## ✨ Características principales

### 📸 Csariel's AI Camera (Web + Android + iOS)

Plataforma de fotografía y video con inteligencia artificial multimodal integrada directamente al flujo social y de creación de contenido del ecosistema.

* ✅ **Motor Híbrido Compartido:** Arquitectura unificada para Web/PWA y dispositivos móviles nativos (Capacitor / CameraX / AVFoundation).
* ✅ **Procesamiento Local en Tiempo Real:** Seguimiento facial de 478 puntos, expresiones y efectos en vivo a 30 FPS mediante **Google MediaPipe** con aceleración GPU.
* ✅ **Orquestación Inteligente Multi-Proveedor:** Selección automática del motor óptimo desde Railway sin depender de un solo proveedor:
  * **AI Portrait Studio (OpenAI GPT Image):** Retoque natural, iluminación inteligente, corrección de color, desenfoque y retratos profesionales conservando la identidad facial.
  * **AI Magic Editor (OpenAI + NVIDIA NIM):** Eliminación y sustitución de objetos, cambio de fondos, restauración y expansión de fotografías.
  * **AI Creative Studio:** Transformación artística, generación de escenarios y creación de avatares listos para publicar.
  * **AI Video Studio:** Mejora de iluminación, eliminación de ruido, subtítulos automáticos, efectos cinematográficos y animación de fotografías.
  * **AI Vision Assistant (Anthropic Claude):** Reconocimiento de escenas y objetos, extracción de texto e instrucciones de edición mediante lenguaje natural.
* ✅ **Flujo Seguro y Publicación Directa:** Almacenamiento privado con control RLS en Supabase Storage (conservando el original y versiones editadas) con publicación instantánea hacia Muro, Muro Live, Perfil o Mensajes.

### 🏠 Sistema de Domos

Sistema de vinculación entre productos físicos y activos digitales.

* ✅ Domos físicos con QR únicos
* ✅ Escaneo del QR desde la plataforma
* ✅ 1 domo = 1 ES.TOK
* ✅ Acumulación de ES.TOKS
* ✅ 12 ES.TOKS → recompensa NFT
* ✅ Registro de escaneos
* ✅ Sistema de canje
* ✅ Integración con wallet
* ✅ Registro permanente de operaciones blockchain

### 🪙 ES.TOKS y Web3

Los ES.TOKS forman parte del sistema de economía digital del ecosistema.

* ✅ Blockchain Polygon
* ✅ Conexión mediante MetaMask
* ✅ Vinculación de wallet al perfil
* ✅ Visualización de activos digitales
* ✅ Sistema P2P
* ✅ Precios dinámicos
* ✅ Integración preparada para DEX
* ✅ Operaciones verificables en blockchain

> «Los activos registrados directamente en blockchain son públicos y no pueden eliminarse mediante la eliminación de una cuenta dentro de la plataforma.»

### 👤 Perfil de Usuario y Membresía Sariel's Pro

Sistema central de identidad, almacenamiento y configuración del usuario.

* ✅ Foto de perfil, nombre, handle y biografía
* ✅ Estadísticas, ES.TOKS, NFTs, seguidores y siguiendo
* ✅ Wallet Web3 y estado del usuario
* ✅ Preferencias de idioma, apariencia y configuración de cuenta
* ✅ **Gestión de Membresía Sariel's Pro (Pago único en USDT por 30 días):**
  * **Csariel's AI Camera Studio:** Acceso completo a motores de edición generativa y AI Vision Assistant.
  * **Almacenamiento en Nube Ampliado:** 5 GB de capacidad en Supabase Storage para fotos originales, ediciones IA y videos HD (frente a 1 GB en plan gratuito).
  * **Conservación Ampliada:** Mayor retención activa de archivos multimedia.
  * **Prioridad en Transmisiones:** Posicionamiento preferente en el directorio de Muro Live.
  * **Badge Pro Exclusivo & Soporte Prioritario.**

### 📰 Muro Social

Red social integrada en el ecosistema.

* ✅ Publicaciones de texto, imágenes, videos y creaciones de AI Camera
* ✅ Likes, comentarios, hashtags y menciones
* ✅ Edición, eliminación, reportes y publicaciones guardadas
* ✅ Compartir contenido y notificaciones
* ✅ Recompensas por interacción (protegidas con topes anti-abuso horarios y diarios)
* ✅ Marketplace P2P de ES.TOKS

### 💬 Mensajería

Sistema de comunicación en tiempo real.

* ✅ Chat individual sobre Supabase Realtime
* ✅ Contactos y búsqueda de usuarios
* ✅ Envío de imágenes, videos, creaciones de AI Camera, archivos y mensajes de voz
* ✅ Edición y eliminación de mensajes, bloqueo de usuarios
* ✅ Mensajes vistos, indicador de escritura y estados de conexión
* ✅ Asistente IA integrado

### 🤖 Asistente IA

El ecosistema incorpora funciones de inteligencia artificial para interacción con usuarios.

* ✅ Chat IA y conversación por voz
* ✅ Transcripción de audio y síntesis de voz
* ✅ Respuestas generadas por IA e integración con mensajería y cámara

### 🎥 Live Streaming

Sistema de transmisiones en vivo basado en WebRTC.

* ✅ Live Streaming mediante LiveKit
* ✅ Chat en vivo, moderación, seguidores y notificaciones
* ✅ Donaciones con diferentes niveles y efectos visuales
* ✅ Grabación de transmisiones, VOD y estadísticas
* ✅ Transmisiones asociadas a grupos y prioridad para usuarios Pro

---

## 🛒 Mercado

Marketplace del ecosistema. Mercado es un módulo independiente del Muro diseñado como marketplace de productos y servicios, con una experiencia similar a las plataformas modernas de comercio y entrega.

> «Mercado utiliza sus propias tablas con prefijo `mercado_` y no modifica la estructura del Muro existente.»

### 🏪 Para vendedores

* ✅ Creación de tienda y catálogo de productos por categorías
* ✅ Imágenes y video de producto según plan
* ✅ Control de inventario, gestión de pedidos, estadísticas y reseñas
* ✅ Membresías comerciales con control de almacenamiento y límites de productos

### 📦 Categorías

🍔 Comida · 🥤 Bebidas · 🍰 Postres · 🛒 Abarrotes · 🔧 Servicios · 💻 Tecnología · 👕 Ropa · 🏠 Hogar · 📦 Otros

### 💳 Membresías de Mercado

| Plan | Precio | Productos | Pedidos | Almacenamiento | Fotos |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Básico** | $100 MXN / 30 días | 10 | 20/mes | 100 MB | 1 |
| **Pro** | $200 MXN / 30 días | 50 | 100/mes | 500 MB | 5 |
| **Máximo** | $300 MXN / 30 días | 500 | Ilimitados | 2 GB | 10 + video |

---

## 💳 Csariel's Pay

Csariel's Pay es la capa de pagos unificada del ecosistema. Provee una experiencia única para cobrar, pagar y retirar dinero, ocultando la complejidad de los proveedores financieros detrás de una sola interfaz.

> «Csariel's Pay utiliza sus propias tablas con prefijo `pay_` y no modifica la estructura de Mercado ni del resto del ecosistema.»

### 💰 Métodos de pago

| Método | Proveedor | Disponibilidad |
| :--- | :--- | :--- |
| 💳 **Tarjeta** (Visa, Mastercard, AMEX) | Stripe | México, Colombia, Chile, Argentina, Perú, Ecuador |
| 🏦 **SPEI** (transferencia bancaria) | Fintoc | Solo México |
| ₿ **USDT** (TRC20, BSC, Polygon, Solana, ETH) | NOWPayments | Global |
| ₮ **USDC** (Polygon, Solana, BSC, ETH) | NOWPayments | Global |

### 📱 Para vendedores y repartidores

* ✅ **Vendedores:** Generación de QR dinámico de cobro, página pública de pago sin cuenta, saldo disponible/pendiente, historial completo, cobros asociados a pedidos y panel en tiempo real.
* ✅ **Repartidores:** Visualización de ganancias por entregas, historial de pagos recibidos y retiros a cuenta bancaria o wallet.

### 🧾 Flujo de Cobro por QR Dinámico

```text
Vendedor genera intención
        ↓
QR / Link público
        ↓
Comprador escanea
        ↓
Elige método (tarjeta / SPEI / crypto)
        ↓
Backend crea orden con el proveedor
        ↓
Comprador paga
        ↓
Webhook firmado del proveedor
        ↓
Backend verifica y confirma
        ↓
Pedido actualizado + saldo acreditado


👛 Retiros y Stripe Connect

RielProveedorEstado
🏦 SPEIFintocDisponible en México (requiere cuenta Business verificada)
💳 TarjetaStripe ConnectDisponible (onboarding KYC manejado por Stripe)
₿ CryptoNOWPaymentsDisponible (requiere payouts habilitados)

​✅ Solicitud de retiro con validación de saldo, reserva atómica de fondos e idempotencia (idempotency_key).
​✅ Estados claros (pending, processing, completed, failed, cancelled) y reverso automático si falla.
​✅ Datos bancarios aislados mediante Stripe Connect Express / Standard.
​🔐 Seguridad y Proveedores de Csariel's Pay
​✅ Verificación criptográfica obligatoria en todos los webhooks (HMAC-SHA256, firmas JWS, 3D Secure).
​✅ Confirmación de pagos exclusivamente vía webhook firmado y aislamiento por service_role.
​✅ Row Level Security (RLS) activo en todas las tablas pay_*.
​✅ Cobertura activa en México, Colombia, Chile, Argentina, Perú y Ecuador.
​🚴 Sistema de Repartidores y Pedidos
​✅ Registro de repartidores, perfil vehicular, disponibilidad y seguimiento de pedidos sin costo de membresía.
​✅ Durante la primera fase, el comprador paga directamente al repartidor el costo de entrega y Mercado no aplica comisión sobre ventas.

Cliente → Selecciona tienda → Selecciona productos → Realiza pedido
  ↓
Tienda recibe pedido → Tienda prepara pedido
  ↓
Repartidor recibe/asume entrega → Entrega al cliente
  ↓
Pedido completado → Reseña

📱 eSIM
​Integración con Telnyx para servicios de conectividad móvil y datos internacionales.
​✅ Compra de paquetes de datos, activación mediante QR y monitoreo de consumo en tiempo real.
​🔐 Seguridad e Infraestructura
​Frontend CDN (Cloudflare Pages): HTTPS estricto con SSL/TLS global, reglas _redirects y shim api-config.js.
​Backend & AI Orchestrator (Railway): JWT + Supabase Auth (Bearer), Helmet, Rate Limiting, CORS restringido y aislamiento estricto de llaves privadas de IA (OpenAI, NVIDIA, Anthropic).
​Base de Datos y Storage (Supabase): PostgreSQL con RLS activo, funciones RPC blindadas por rol y sesión (auth.uid()), límites anti-farma en recompensas y cuotas de almacenamiento por plan.
​Protección de Cuentas: Cloudflare Turnstile anti-bot, protección contra contraseñas filtradas y eliminación segura de cuenta con resguardo de auditoría.
​⚖️ Privacidad y Aceptación Legal
​✅ Términos, condiciones y políticas de privacidad con registro de aceptación mediante Hash SHA-256, timestamp y control de versión.
​✅ Cumplimiento de eliminación de datos centralizados manteniendo intactos los registros inmutables en blockchain.
​🌎 Internacionalización
​Idiomas configurados mediante arquitectura de claves (data-clave):
🇲🇽 Español · 🇺🇸 English · 🇧🇷 Português · 🇩🇪 Deutsch · 🇫🇷 Français · 🇮🇹 Italiano
​📜 Licencia
​Proyecto privado. Todos los derechos reservados.
© Csariel's Ecosistema WEB3
