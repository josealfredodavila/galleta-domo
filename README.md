​🍪 Csariel's Ecosistema WEB3

​Plataforma Web3 integral que combina comercio físico, activos digitales, red social, marketplace, transmisiones en vivo, mensajería, pagos cripto, pagos con tarjeta, pagos SPEI y servicios digitales en un mismo ecosistema.

​📋 Descripción

​Csariel's Ecosistema conecta productos físicos, tecnología Web3 y servicios digitales mediante una arquitectura desacoplada de alto rendimiento, sirviendo el frontend estático a través de Cloudflare Pages y centralizando la API de negocio y lógica de backend en Railway.

​Arquitectura de Infraestructura

Capa

Plataforma / Tecnología

Función

Frontend CDN

Cloudflare Pages (csariels.pages.dev)

Distribución de activos estáticos, HTML, CSS, JS y enrutamiento amigable (_redirects).

API Backend

Railway (Node.js / Express)

Procesamiento de negocio, webhooks de pagos, endpoints /api/ y conectores.

API Shim

api-config.js (Inyectado en build)

Intercepta llamadas fetch relativas /api/ y las redirige transparente y dinámicamente al backend.

Base de Datos & Realtime

Supabase (PostgreSQL + RLS)

Autenticación, persistencia de datos, storage, funciones RPC y sockets Realtime.

Red Blockchain

Polygon Network

Contratos inteligentes para ES.TOKS y NFTs del sistema de recompensas.

El ecosistema incluye:

​🏠 Domos de galleta con QR únicos

​🪙 ES.TOKS sobre Polygon

​🎁 NFTs asociados al sistema de recompensas

​👤 Perfiles y red social

​📰 Muro social

​💬 Mensajería en tiempo real

​🎥 Live Streaming

​🛒 Mercado, marketplace de productos y servicios

​🚴 Sistema de repartidores

​💳 Csariel's Pay — pagos con tarjeta, SPEI y criptomonedas

​📱 eSIM mediante Telnyx API

​🤖 Funciones de IA y asistente

​🔐 Seguridad, autenticación y protección de datos

​✨ Características principales

​🏠 Sistema de Domos

​Sistema de vinculación entre productos físicos y activos digitales.

​✅ Domos físicos con QR únicos

​✅ Escaneo del QR desde la plataforma

​✅ 1 domo = 1 ES.TOK

​✅ Acumulación de ES.TOKS

​✅ 12 ES.TOKS → recompensa NFT

​✅ Registro de escaneos

​✅ Sistema de canje

​✅ Integración con wallet

​✅ Registro permanente de operaciones blockchain

​🪙 ES.TOKS y Web3

​Los ES.TOKS forman parte del sistema de economía digital del ecosistema.

​✅ Blockchain Polygon

​✅ Conexión mediante MetaMask

​✅ Vinculación de wallet al perfil

​✅ Visualización de activos digitales

​✅ Sistema P2P

​✅ Precios dinámicos

​✅ Integración preparada para DEX

​✅ Operaciones verificables en blockchain

​«Los activos registrados directamente en blockchain son públicos y no pueden eliminarse mediante la eliminación de una cuenta dentro de la plataforma.»


​👤 Perfil de Usuario

​Sistema central de identidad y configuración del usuario.

​✅ Foto de perfil

​✅ Nombre y handle

​✅ Biografía

​✅ Estadísticas

​✅ ES.TOKS

​✅ NFTs

​✅ Seguidores

​✅ Siguiendo

​✅ Estado del usuario

​✅ Wallet Web3

​✅ Preferencias de idioma

​✅ Preferencias de apariencia

​✅ Configuración de cuenta

​✅ Gestión de membresía

​📰 Muro Social

​Red social integrada en el ecosistema.

​✅ Publicaciones de texto

​✅ Imágenes

​✅ Videos

​✅ Likes

​✅ Comentarios

​✅ Hashtags

​✅ Menciones

​✅ Edición de publicaciones

​✅ Eliminación de publicaciones

​✅ Reportes

​✅ Publicaciones guardadas

​✅ Compartir contenido

​✅ Notificaciones

​✅ Recompensas por interacción

​✅ Marketplace P2P de ES.TOKS

​💬 Mensajería

​Sistema de comunicación en tiempo real.

​✅ Chat individual

​✅ Supabase Realtime

​✅ Contactos

​✅ Búsqueda de usuarios

​✅ Imágenes

​✅ Videos

​✅ Archivos

​✅ Mensajes de voz

​✅ Edición de mensajes

​✅ Eliminación de mensajes

​✅ Bloqueo de usuarios

​✅ Mensajes vistos

​✅ Indicador de escritura

​✅ Estados de conexión

​✅ Asistente IA

​🤖 Asistente IA

​El ecosistema incorpora funciones de inteligencia artificial para interacción con usuarios.

​✅ Chat IA

​✅ Conversación por voz

​✅ Transcripción de audio

​✅ Respuestas generadas por IA

​✅ Síntesis de voz

​✅ Integración con el sistema de mensajería

​🎥 Live Streaming

​Sistema de transmisiones en vivo basado en WebRTC.

​✅ Live Streaming mediante LiveKit

​✅ Chat en vivo

​✅ Moderación

​✅ Seguidores

​✅ Notificaciones

​✅ Donaciones

​✅ Efectos visuales

​✅ Diferentes niveles de donación

​✅ Grabación de transmisiones

​✅ VOD

​✅ Estadísticas

​✅ Transmisiones asociadas a grupos

​🛒 Mercado

​Marketplace del ecosistema.

​Mercado es un módulo independiente del Muro diseñado como marketplace de productos y servicios, con una experiencia similar a las plataformas modernas de comercio y entrega.

​«Mercado utiliza sus propias tablas con prefijo mercado_ y no modifica la estructura del Muro existente.»


​🏪 Para vendedores

​Los vendedores pueden crear y administrar su propia tienda.

​✅ Creación de tienda

​✅ Catálogo de productos

​✅ Categorías

​✅ Imágenes de productos

​✅ Video de producto según plan

​✅ Control de inventario

​✅ Gestión de pedidos

​✅ Estadísticas

​✅ Reseñas

​✅ Membresías comerciales

​✅ Control de almacenamiento

​✅ Límites de productos según plan

​📦 Categorías

​Mercado contempla categorías como:

​🍔 Comida

​🥤 Bebidas

​🍰 Postres

​🛒 Abarrotes

​🔧 Servicios

​💻 Tecnología

​👕 Ropa

​🏠 Hogar

​📦 Otros

​💳 Membresías de Mercado

​Los vendedores utilizan membresías para operar sus tiendas.
Plan

Precio

Productos

Pedidos

Almacenamiento

Fotos

Básico

$100 MXN / 30 días

10

20/mes

100 MB

1

Pro

$200 MXN / 30 días

50

100/mes

500 MB

5

Máximo

$300 MXN / 30 días

500

Ilimitados

2 GB

10 + video

💳 Csariel's Pay

​Csariel's Pay es la capa de pagos unificada del ecosistema. Provee una experiencia única para cobrar, pagar y retirar dinero, ocultando la complejidad de los proveedores financieros detrás de una sola interfaz.

​«Csariel's Pay utiliza sus propias tablas con prefijo pay_ y no modifica la estructura de Mercado ni del resto del ecosistema.»


​💰 Métodos de pago

Método

Proveedor

Disponibilidad

💳 Tarjeta (Visa, Mastercard, AMEX)

Stripe

México, Colombia, Chile, Argentina, Perú, Ecuador

🏦 SPEI (transferencia bancaria)

Fintoc

Solo México

₿ USDT (TRC20, BSC, Polygon, Solana, ETH)

NOWPayments

Global

₮ USDC (Polygon, Solana, BSC, ETH)

NOWPayments

Global

📱 Para vendedores

​✅ Generación de QR de cobro con monto dinámico

​✅ Página pública de pago (el comprador escanea y paga sin necesidad de cuenta)

​✅ Visualización de saldo disponible y pendiente

​✅ Historial completo de movimientos

​✅ Generación de QR para compartir por link

​✅ Cobros asociados a pedidos de Mercado

​✅ Panel con estados en tiempo real

​🚴 Para repartidores

​✅ Visualización de ganancias por entregas

​✅ Historial de pagos recibidos

​✅ Retiros a cuenta bancaria o wallet

​🧾 QR de cobro

​El QR de Csariel's Pay es dinámico. Cada QR apunta a una solicitud de pago específica (con monto, concepto y vendedor embebidos en un token público seguro). El comprador escanea, elige el método y paga. El QR no marca un pago como realizado por sí mismo: la confirmación viene exclusivamente del webhook firmado del proveedor.

​Flujo de Pago:

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

👛 Retiros de Csariel's Pay

​Los vendedores y repartidores pueden retirar sus ganancias disponibles a través de diferentes rieles según el país.


Riel

Proveedor

Estado

🏦 SPEI

Fintoc

Disponible en México (requiere cuenta Business verificada)

💳 Tarjeta

Stripe Connect

Disponible (requiere onboarding del vendedor)

₿ Crypto

NOWPayments

Disponible (requiere payouts habilitados)

​✅ Solicitud de retiro desde el panel

​✅ Validación de saldo disponible

​✅ Reserva atómica de fondos (nunca se descuenta dos veces)

​✅ Idempotencia por idempotency_key

​✅ Estados claros: pending, processing, completed, failed, cancelled 

​✅ Reverso automático de saldo si el retiro falla

​✅ Historial de retiros con detalle

​🔗 Stripe Connect

​Para habilitar retiros por tarjeta, el vendedor debe vincular su cuenta de Stripe.

​✅ Onboarding manejado por Stripe (KYC incluido)

​✅ Los datos bancarios nunca pasan por Csariel's

​✅ Interfaz de vinculación integrada

​✅ Estado de vinculación visible desde el panel

​✅ Vinculación persistente por usuario

​✅ Compatible con Connect Express (recomendado) o Connect Standard

​🌎 Cobertura internacional

​Csariel's Pay está diseñado para operar en múltiples países. Actualmente activo en:

​🇲🇽 México (tarjeta + SPEI + USDT + USDC)

​🇨🇴 Colombia (tarjeta + USDT + USDC)

​🇨🇱 Chile (tarjeta + USDT + USDC)

​🇦🇷 Argentina (tarjeta + USDT + USDC)

​🇵🇪 Perú (tarjeta + USDT + USDC)

​🇪🇨 Ecuador (tarjeta + USDT + USDC)

​La arquitectura permite agregar nuevos países, métodos de pago locales y proveedores adicionales sin modificar la lógica de negocio existente.

​🔐 Seguridad de Csariel's Pay

​✅ Verificación de firma obligatoria en todos los webhooks

​✅ Confirmación de pago exclusivamente vía webhook firmado (nunca desde el navegador)

​✅ Idempotencia en intenciones, webhooks y retiros

​✅ Reserva atómica de saldo antes de ejecutar payouts

​✅ Validación de ownership por usuario autenticado

​✅ Aislamiento por service_role en el backend

​✅ Row Level Security (RLS) en todas las tablas pay_*

​✅ Prevención de duplicación de pagos y retiros

​✅ Auto-creación de cuentas de pago al activar tiendas o repartidores

​💳 Integración de Proveedores de Pago

​NOWPayments

​La plataforma utiliza NOWPayments para procesar pagos con criptomonedas.

​✅ USDT / USDC

​✅ Webhooks firmados

​✅ Confirmación automática

​✅ Registro de pagos e idempotencia

​✅ Pagos de membresías de Mercado y Csariel's Pay

​Stripe

​La plataforma utiliza Stripe para procesar pagos con tarjeta.

​✅ Visa, Mastercard, American Express

​✅ PaymentIntent (API moderna de Stripe)

​✅ Confirmación 3D Secure cuando aplique

​✅ Webhooks firmados e idempotencia por intento

​Fintoc

​La plataforma utiliza Fintoc para procesar pagos mediante SPEI.

​✅ Transferencias SPEI entrantes

​✅ Conciliación automática por metadata

​✅ Webhooks firmados con HMAC-SHA256

​✅ Tolerancia anti-replay de 5 minutos

​✅ Payouts SPEI salientes (con firma JWS)

​🚴 Sistema de Repartidores

​Mercado incorpora un sistema independiente de entrega.

​✅ Registro de repartidores

​✅ Perfil de repartidor e información de vehículo

​✅ Configuración de disponibilidad

​✅ Gestión y seguimiento de pedidos asignados

​✅ Sistema preparado para operación internacional

​✅ Sin membresía para repartidores

​💵 Pago de entrega

​Durante la primera fase:

​El comprador paga directamente al repartidor el costo de la entrega.

​Mercado no aplica comisión sobre la venta de productos durante esta fase.

​La arquitectura queda preparada para incorporar posteriormente un sistema de comisiones.

​📦 Pedidos de Mercado

​Sistema completo de gestión de pedidos.

​Flujo general:

Cliente → Selecciona tienda → Selecciona productos → Realiza pedido
  ↓
Tienda recibe pedido → Tienda prepara pedido
  ↓
Repartidor recibe/asume entrega → Entrega al cliente
  ↓
Pedido completado → Reseña


📱 eSIM

​Integración con Telnyx para servicios de conectividad móvil y datos.

​✅ Compra de paquetes de datos

​✅ Gestión y activación de eSIM mediante QR

​✅ Información de consumo en tiempo real

​✅ Integración lista para operación internacional

​🔐 Seguridad e Infraestructura

​La plataforma utiliza múltiples capas de seguridad optimizadas para la arquitectura desacoplada.

​Frontend CDN (Cloudflare Pages)

​✅ HTTPS estricto con SSL/TLS global

​✅ Reglas de redirección amigables mediante _redirects

​✅ Shim dinámico de API (api-config.js) inyectado en tiempo de build

​Backend (Railway)

​✅ JWT (JSON Web Tokens) + Supabase Auth (Bearer)

​✅ Cabeceras de seguridad con Helmet

​✅ Rate Limiting y políticas de CORS_ORIGINS restringidas al dominio de Cloudflare

​✅ Middleware de autenticación y protección de endpoints

​✅ Webhooks verificados obligatoriamente con firma criptográfica

​Base de datos (Supabase)

​✅ PostgreSQL con Row Level Security (RLS) activo

​✅ Funciones RPC, triggers e índices optimizados

​✅ Idempotencia estricta en transacciones financieras

​Protección de cuentas

​✅ Cloudflare Turnstile anti-bot

​✅ Eliminación segura de cuenta con resguardo de auditoría

​⚖️ Privacidad y Aceptación Legal

​El ecosistema incorpora mecanismos legales avanzados:

​✅ Términos y condiciones / Políticas de privacidad

​✅ Registro de aceptación con Hash SHA-256, timestamp e información de versión

​✅ Cumplimiento de eliminación de datos centralizados (manteniendo intactos los registros inmutables en la blockchain pública)

​🌎 Internacionalización

​Idiomas configurados mediante arquitectura de claves (data-clave):

​🇲🇽 Español

​🇺🇸 English

​🇧🇷 Português

​🇩🇪 Deutsch

​🇫🇷 Français

​🇮🇹 Italiano

​📜 Licencia

​Proyecto privado. Todos los derechos reservados.

© Csariel's Ecosistema WEB3
