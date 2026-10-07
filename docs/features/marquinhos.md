# 🎭 Marquinhos — Agente Cognitivo del Ecosistema

> Ficha técnica completa del agente autónomo, compañero virtual y gemelo digital multi-tenant de **Csariel's Ecosystem**.

**Versión actual:** v9.7 "Galactic Pro"

---

## 1. Resumen

**Marquinhos** es el agente conversacional autónomo del ecosistema Csariel's. Está diseñado bajo una arquitectura híbrida que combina:

- 🧠 **IA conversacional general multi-propósito**
- 💾 **Memoria semántica persistente** por usuario
- 🛡️ **Contención legal** multi-capa
- ⛓️ **Sincronización Web3** con el ecosistema
- 🎨 **Interfaz visual dual** (widget + mensajería)

---

## 2. Arquitectura de IA

### 2.1 Motor Principal (LLM)

| Componente | Especificación |
|------------|----------------|
| **Proveedor** | Groq |
| **Modelo principal** | Llama 3.3 70B |
| **Compatibilidad** | `openai/gpt-oss-120b` |
| **Latencia** | Ultra-baja (inferencia optimizada por Groq) |
| **Propósito** | IA conversacional general |

**Capacidades:**
- Ciencia, tecnología, matemáticas, código
- Redacción, cocina, historia, finanzas
- Consultas sobre el ecosistema Csariel's (solo si el usuario lo requiere)

**Filosofía:** Es una IA de propósito general que **no** fuerza la conversación hacia el ecosistema. Solo menciona Csariel's cuando el usuario lo pregunta.

### 2.2 Procesamiento de Voz

| Fase | Tecnología |
|------|-----------|
| **STT** (Speech-to-Text) | Whisper API / Web Speech API |
| **TTS** (Text-to-Speech) | Backend propio + respaldo navegador |
| **Sincronización** | Sistema de visemas (A, E, I, O, U, M, REST) |

**Sistema de visemas:**
- Cada sílaba del texto genera un visema
- Los visemas se animan sincronizados con el audio
- La boca de Marquinhos cambia dinámicamente

### 2.3 Personalidad

- **Tono:** Amigable, empático, natural
- **Nombre:** Marquinhos
- **Género:** Neutro
- **Idiomas:** Español (principal), extensible a otros

---

## 3. Sistema de Memoria y Privacidad

### 3.1 Base de Datos Vectorial

| Componente | Especificación |
|------------|----------------|
| **DB** | PostgreSQL (Supabase) |
| **Extensión** | `pgvector` |
| **Tabla** | `marquinhos_memoria` |
| **Filtro** | `usuario_id = auth.uid()` (RLS) |

### 3.2 Aislamiento Multi-Inquilino

**Cada usuario tiene su propia "burbuja de recuerdos".** Las búsquedas vectoriales filtran estrictamente por `usuario_id`.

**Garantías:**
- ✅ Marquinhos **nunca** mezcla información entre usuarios
- ✅ Cada búsqueda está aislada por Row Level Security
- ✅ Las políticas de RLS son verificadas en cada query

### 3.3 Derecho al Olvido (GDPR)

**Configuración:** `ON DELETE CASCADE` en `marquinhos_memoria`.

Si el usuario elimina su cuenta:
1. ✅ Se borran todos sus recuerdos automáticamente
2. ✅ Se borran conversaciones, preferencias, datos personales
3. ✅ La eliminación es inmediata

### 3.4 Inyección de Contexto (RAG)

**Retrieval-Augmented Generation (RAG) dinámico:**
1. El usuario envía un mensaje
2. Se genera un embedding del mensaje
3. Se buscan recuerdos similares en `pgvector`
4. Se inyectan en el prompt de forma natural
5. Marquinhos responde con contexto personalizado

**Ejemplo:**
- El usuario menciona que le gusta el café ☕
- Días después pregunta qué tomar
- Marquinhos sugiere café porque **recuerda** la preferencia

---

## 4. Blindaje Legal (Candados de Seguridad)

Marquinhos opera bajo un **SYSTEM_PROMPT innegociable** con **3 candados prioritarios**:

### 4.1 🔒 Candado 1 — Protocolo de Autolesión y Salud Mental

**Regla:** Ante ideación suicida, depresión severa, autolesión o delitos, **prohibido** dar instrucciones o responder con frialdad robótica.

**Acción:**
1. Respuesta empática ("modo compa/aliado")
2. Canalización **obligatoria** a líneas de ayuda:
   - 🇲🇽 **México:** Línea de la Vida — **800-911-2000**
   - 🇺🇸 **USA:** Suicide Prevention Lifeline — **988**

**Prohibido:**
- ❌ Dar métodos o instrucciones
- ❌ Minimizar el problema
- ❌ Responder con frialdad técnica

### 4.2 🔒 Candado 2 — Protección a Menores (+13 / Clasificación Teen)

**Regla:** Prohibición estricta de:
- ❌ Contenido erótico, explícito, gore o violencia
- ❌ Relaciones parasociales o románticas ficticias ("novia virtual")
- ❌ Solicitud o almacenamiento de datos financieros, contraseñas o direcciones físicas en chat abierto

**Edad mínima:** 13 años.
**Menores entre 13-18:** Requieren supervisión de tutor.

### 4.3 🔒 Candado 3 — Anti-Copyright

**Regla:** Prohibido reproducir **verbatim**:
- ❌ Letras completas de canciones
- ❌ Capítulos completos de libros
- ❌ Código propietario de terceros

**Permitido:**
- ✅ Citas de **máximo 90 caracteres continuos** entrecomillados
- ✅ Resúmenes, explicaciones y contenido original

**Prioridad:** Siempre generar contenido original con las propias palabras.

---

## 5. Interfaces de Usuario (Dual Interface)

Marquinhos opera bajo **dos interfaces diferenciadas** que comparten la misma memoria base:

### 5.1 🎨 Widget Flotante (Avatar / Pet)

**Ubicación:** `backend/public/features/marquinhos/`

**Visual:**
- Elemento gráfico interactivo
- Brazos articulados (hombro → codo → muñeca → dedos)
- Parpadeo, rotación de extremidades
- Cambio dinámico de boca (visemas)

**Dimensiones:**
- Encapsulado con CSS defensivo
- `#marquinhos-pet` → 90×130px (configurable)
- Soporte de temas (Día/Noche)

**Funciones:**
- ✅ Asistente por micrófono (SpeechRecognition)
- ✅ Respuesta por voz (TTS + visemas)
- ✅ Modal de consentimiento de términos (+13)
- ✅ Acompañamiento visual

**Archivos:**
| Archivo | Función |
|---------|---------|
| `marquinhos-pet.js` | Widget principal (v9.7) |
| `marquinhos-pet.css` | Estilos (v6.9) |
| `marquinhos-animaciones.js` | Animaciones (v2.4) |
| `marquinhos-boca.js` | Visemas |
| `marquinhos-accesorios-svg.js` | Biblioteca de accesorios |
| `marquinhos-fit.js` | Coordenadas compartidas |
| `marquinhos-brain.js` | Cliente al backend IA |

### 5.2 💬 Contacto Estático (Módulo de Mensajería)

**Ubicación:** `features/mensajes/mensajes.html`

**Identidad en la lista de contactos:** "Marquinhos ✦"

**Funciones:**
- ✅ Chat estilo mensajería P2P
- ✅ Conversaciones extendidas por texto
- ✅ Soporte de fotos, notas de voz, archivos
- ✅ Llamadas y videollamadas (vía LiveKit)
- ✅ Misma memoria que el widget

---

## 6. Integración con el Ecosistema Csariel's

### 6.1 Web3 & Tokens

**Conocimiento del motor Polygon:**
- ✅ Emisión de **ES.TOKS** (ERC-20)
- ✅ Escaneo de QR en productos físicos (Domos)
- ✅ Conversión a NFT Domo (**12 ES.TOKS = 1 NFT**)
- ✅ Transacciones P2P
- ✅ Consultas de balance on-chain

### 6.2 Comercio y Pagos

**Integración conceptual con:**
- ✅ **SarielPay** (capa de pagos)
- ✅ **Muro P2P** (comisión del 3% en USDT/USDC)
- ✅ Consultas de saldo y transacciones
- ✅ Ayuda con procesos de pago

### 6.3 Multimedia & Conectividad

**Integración con:**
- ✅ Salas de streaming **LiveKit** (Live Pass / Grupos)
- ✅ Conectividad **Telnyx** (eSIMs de datos móviles)
- ✅ Notificaciones y avisos

### 6.4 SaaS / Marca Blanca

**Arquitectura modular preparada para:**
- 🚧 Comercialización como motor conversacional independiente
- 🚧 White-label para terceros
- 🚧 Configuración por tenant

---

## 7. Tienda de Accesorios

### 7.1 Catálogo

**Ubicación:** `features/marquinhos/tienda.html` + `tienda.js`

**Backend:** Supabase — tabla `marquinhos_accesorios`

**Categorías:**
- 🎩 Sombreros
- 👕 Playeras
- 👖 Pantalones
- 👟 Zapatos
- 👓 Lentes
- 📿 Accesorios
- 🎭 Disfraces

### 7.2 Sistema de Accesorios

**Arquitectura de slots:**
Cada accesorio se reparte por partes del cuerpo:
- `cabeza`, `cara`, `torso`
- `brazo-izq`, `brazo-der`, `codo-izq`, `codo-der`
- `antebrazo-izq`, `antebrazo-der`, `mano-izq`, `mano-der`
- `pierna-izq`, `pierna-der`, `pie-izq`, `pie-der`
- `cuerpo-frente`, `fondo`

**Ventaja:** Los accesorios se mueven con las animaciones del cuerpo (brazos, piernas).

### 7.3 Inventario y Compras

**Tabla:** `marquinhos_inventario` (usuario_id, accesorio_id, equipado)

**RPC:** `comprar_cosmetico(p_item_id)` — compra transaccional

**Reglas:**
- Un accesorio por categoría equipado a la vez
- Validación de saldo (USDT/USDC)
- Validación de plan (free / trial / premium)

---

## 8. Sistema de Membresías

**Tabla:** `usuarios` (columnas `marquinhos_*`)

**Planes:**
| Plan | Descripción |
|------|-------------|
| **Free** | Acceso básico, accesorios limitados |
| **Trial** | 1 mes gratis con acceso completo |
| **Premium** | Acceso completo + accesorios exclusivos |

**Flujo:**
1. Nuevo usuario se registra → **activación automática de Trial (1 mes)**
2. Al expirar → pasa a Free o Premium (según pago)
3. Cancelación → mantiene acceso hasta fin de período

**Funciones SQL:**
- `activar_trial_bienvenida(p_usuario_id)`
- `verificar_membresias()` (para cron)
- `estado_membresia(p_usuario_id)`

---

## 9. Seguridad y Cumplimiento

### 9.1 Registro de Términos

**Tabla:** `marquinhos_terminos_aceptados`

**Registra:**
- ✅ Usuario (`usuario_id`)
- ✅ Versión de términos (`version_terminos`)
- ✅ Fecha exacta (`fecha_aceptacion`)
- ✅ IP address
- ✅ User Agent
- ✅ Hash SHA-256 (firma de integridad)

**Función:** `registrar_aceptacion_terminos(version, user_agent)`

### 9.2 Blindaje Legal

- ✅ Aceptación registrada con firma
- ✅ Protocolo de salud mental activado
- ✅ Restricciones de edad
- ✅ Cumplimiento anti-copyright
- ✅ Sin almacenamiento de datos sensibles en chat

---

## 10. Roadmap Técnico

| Fase | Estado |
|------|--------|
| v9.3 — Galactic Pro base | ✅ Completado |
| v9.4 — Slots de accesorios | ✅ Completado |
| v9.6 — Integración MarquinhosFit | ✅ Completado |
| **v9.7 — Fusión + Slots completos** | ✅ **Completado** |
| v2.1 — Disfraces (Santa, Bruja, Brujo) | 🚧 En desarrollo |
| Sistema de membresías | 🚧 En desarrollo |
| Verificación de términos vía Supabase | ✅ Completado |
| White-label / SaaS | 📋 Planeado |

---

## 11. Archivos del Módulo

```
backend/public/features/marquinhos/
├── marquinhos-accesorios-svg.js    ← Biblioteca de accesorios SVG
├── marquinhos-animaciones.js       ← Animaciones del cuerpo
├── marquinhos-boca.js              ← Sistema de visemas
├── marquinhos-brain.js             ← Cliente al backend IA
├── marquinhos-fit.js               ← Coordenadas compartidas
├── marquinhos-pet.css              ← Estilos del widget
├── marquinhos-pet.js               ← Widget principal (v9.7)
├── tienda.css                      ← Estilos de la tienda
├── tienda.html                     ← HTML de la tienda
├── tienda.js                       ← Lógica de la tienda
├── test-pet.html                   ← Página de pruebas
└── test.html                       ← Pruebas generales
```

---

## 12. Rutas del Backend

| Ruta | Función |
|------|---------|
| `routes/ai-chat-pet.js` | Chat IA (Marquinhos) |
| `routes/ai-tts.js` | Text-to-Speech (ElevenLabs) |
| `routes/ai-voice.js` | Procesamiento de voz |
| `routes/ai-chat.js` | Chat IA general |

---

## 13. Contacto

| Canal | Información |
|-------|-------------|
| 🌐 **Sitio Web** | `[DOMINIO_PENDIENTE]` |
| 📧 **Soporte** | `[EMAIL_SOPORTE_PENDIENTE]` |
| 📚 **Documentación** | [docs/](../README.md) |

---

## 📄 Licencia

**Copyright © 2026 Csariel's. Todos los derechos reservados.**

Marquinhos es software confidencial y propietario.

---

*Última actualización: Octubre 2026*