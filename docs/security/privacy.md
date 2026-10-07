# 🔐 Privacidad y Protección de Datos — Csariel's Ecosystem

> Documentación de las prácticas de privacidad, recolección de datos, cumplimiento legal y derechos del usuario.

---

## 1. Compromiso de Privacidad

**Csariel's Ecosystem** está comprometido con la protección de los datos personales de sus usuarios, cumpliendo con:

- 🇲🇽 **LFPDPPP** — Ley Federal de Protección de Datos Personales en Posesión de los Particulares (México)
- 🇪🇺 **GDPR** — Reglamento General de Protección de Datos (Unión Europea)
- 🌎 Buenas prácticas internacionales de privacidad por diseño

**Principios rectores:**
1. **Minimización** — Solo se recolectan datos necesarios
2. **Finalidad** — Cada dato tiene un propósito claro y declarado
3. **Consentimiento** — El usuario autoriza explícitamente
4. **Transparencia** — El usuario sabe qué se guarda y por qué
5. **Seguridad** — Cifrado y aislamiento multi-tenant
6. **Derecho al olvido** — El usuario puede eliminar su cuenta y sus datos

---

## 2. Datos que Recolectamos

### 2.1 Datos de Identificación

| Dato | Propósito | Almacenamiento | Retención |
|------|-----------|----------------|-----------|
| Email | Autenticación, notificaciones | Supabase (tabla `usuarios`) | Hasta eliminar cuenta |
| Nombre | Personalización | Supabase | Hasta eliminar cuenta |
| Handle (@usuario) | Identidad pública | Supabase | Hasta eliminar cuenta |
| Teléfono | Verificación SMS, 2FA | Supabase | Hasta eliminar cuenta |
| Avatar | Personalización de perfil | Supabase Storage | Hasta eliminar cuenta |
| Bio | Descripción de perfil | Supabase | Hasta eliminar cuenta |

### 2.2 Datos Técnicos

| Dato | Propósito | Retención |
|------|-----------|-----------|
| IP address | Seguridad, geolocalización, logs | 90 días en logs |
| User Agent | Compatibilidad, seguridad | 90 días |
| Session tokens (JWT) | Autenticación | Duración de sesión |
| Timestamps | Auditoría, orden de operaciones | Hasta eliminar cuenta |

### 2.3 Datos de Actividad

| Dato | Propósito | Almacenamiento |
|------|-----------|----------------|
| Conversaciones con Marquinhos | Memoria contextual IA | Supabase (con pgvector) |
| Posteos en Muro | Red social | Supabase |
| Mensajes | Chat entre usuarios | Supabase |
| Compras / pedidos | Mercado | Supabase |
| Historial de pagos | Csariel's Pay | Supabase |
| Escaneos de QR (Domos) | Web3 | Supabase + Blockchain |

### 2.4 Datos Financieros (Csariel's Pay)

**Importante:** Csariel's **NO almacena datos de tarjetas bancarias**. Los pagos con tarjeta son procesados directamente por **Stripe**, que es PCI-DSS compliant.

| Dato | Quién lo guarda | Propósito |
|------|-----------------|-----------|
| Datos de tarjeta | **Stripe** (nunca Csariel's) | Procesar pago |
| CUENTA bancaria (SPEI) | **Fintoc** | Transferencias |
| Wallet cripto | Supabase + Blockchain | Pagos cripto |
| Saldo USDT/USDC | Supabase | Balance usuario |
| Historial de transacciones | Supabase | Registro usuario |

### 2.5 Datos Biométricos (opcional)

Si el usuario activa la **verificación biométrica**:

| Dato | Propósito | Almacenamiento |
|------|-----------|----------------|
| Selfie / foto facial | Verificación de identidad | Procesado, NO almacenado |
| Detección de vida (Liveness) | Prevención de fraude | Procesado, NO almacenado |

**Nota:** Las imágenes faciales **NO se almacenan**. Solo se procesa la verificación y se guarda un resultado booleano (`verificado: true/false`).

### 2.6 Datos de Blockchain (públicos e inmutables)

| Dato | Dónde vive | Nota |
|------|-----------|------|
| Dirección de wallet | Polygon (público) | Pseudónimo |
| Transacciones ES.TOKS | Polygon (público) | Inmutable |
| NFTs acuñados | Polygon (público) | Inmutable |
| Firma de transacciones | Polygon (público) | No revela identidad |

⚠️ **Aviso importante:** Los datos escritos en blockchain son **públicos e inmutables**. No pueden eliminarse con la eliminación de la cuenta. Esto se declara en los [Términos de Uso](/legal/terminos-marquinhos).

---

## 3. Cómo Usamos los Datos

### 3.1 Finalidades Primarias

| Finalidad | Datos usados |
|-----------|--------------|
| Autenticación y seguridad | Email, teléfono, JWT, IP |
| Funcionamiento del servicio | Todos los datos operativos |
| Personalización de Marquinhos | Conversaciones, preferencias |
| Procesamiento de pagos | Datos financieros necesarios |
| Comunicación | Email, notificaciones push |
| Soporte técnico | Datos de cuenta + historial |

### 3.2 Finalidades Secundarias

| Finalidad | ¿Requiere consentimiento? |
|-----------|---------------------------|
| Análisis agregado (sin identificación) | No |
| Mejora del servicio | Sí (opt-out disponible) |
| Marketing | Sí (explícito) |

---

## 4. Terceros con Acceso a Datos

Solo compartimos datos con terceros **estrictamente necesarios** para operar:

| Tercero | Categoría | Datos compartidos |
|---------|-----------|-------------------|
| **Supabase** | Infraestructura DB | Todos los datos (DB + Auth + Storage) |
| **Railway** | Hosting backend | Logs, tráfico |
| **Groq** | IA conversacional | Texto de conversaciones (anonimizado) |
| **ElevenLabs** | Síntesis de voz | Texto a sintetizar |
| **Stripe** | Pagos tarjeta | Datos de pago (PCI-DSS) |
| **Stripe Connect** | Payouts vendedores | Datos bancarios (KYC) |
| **Fintoc** | SPEI | Datos bancarios (México) |
| **NOWPayments** | Cripto | Wallet address |
| **Telnyx** | eSIM/SMS/VoIP | Teléfono, ICCID |
| **LiveKit** | Video en vivo | Audio/Video en transmisiones |
| **Cloudflare Turnstile** | Captcha | IP, User Agent |
| **Polygon** | Blockchain | Dirección de wallet (pública) |

**Ningún tercero recibe datos para uso independiente.** Todos operan bajo contratos de confidencialidad y solo procesan datos para Csariel's.

---

## 5. Cómo Protegemos los Datos

### 5.1 Seguridad en Tránsito
- **HTTPS/TLS 1.3** en todas las comunicaciones
- **WSS** para WebSocket (LiveKit, Realtime)
- **HSTS** habilitado

### 5.2 Seguridad en Reposo
- **Cifrado AES-256** en Supabase (por defecto)
- **Cifrado a nivel de disco** en Railway
- **URLs firmadas** con expiración para Storage

### 5.3 Seguridad de Acceso
- **JWT** con expiración corta
- **Refresh tokens** para renovación
- **2FA** (opcional/obligatorio según plan)
- **Biometría** para operaciones sensibles
- **Row Level Security** en PostgreSQL

### 5.4 Aislamiento Multi-Tenant
- Cada usuario solo ve **sus propios datos**
- Filtrado obligatorio por `auth.uid()`
- Storage con paths por usuario: `{usuario_id}/archivo`

### 5.5 Idempotencia y Atomicidad
- Operaciones financieras con `idempotency_key`
- Reserva atómica de saldo antes de payouts
- Rollback automático en caso de fallo

---

## 6. Derechos del Usuario (GDPR / LFPDPPP)

### 6.1 Derechos ARCO+

| Derecho | Cómo ejercerlo |
|---------|----------------|
| **Acceso** | Descargar tus datos desde Perfil → Datos |
| **Rectificación** | Editar desde Perfil |
| **Cancelación** | Eliminar cuenta desde Perfil → Seguridad |
| **Oposición** | Configurar preferencias en Perfil → Privacidad |
| **Portabilidad** | Exportar datos en formato JSON |
| **Olvido** | Eliminar cuenta (borra TODO) |
| **Limitación** | Contactar soporte |

### 6.2 Cómo Eliminar tu Cuenta

**Ruta:** `Perfil → Seguridad → Eliminar cuenta`

**Qué pasa al eliminar:**
1. ✅ Se eliminan todos tus datos personales
2. ✅ Se eliminan conversaciones con Marquinhos
3. ✅ Se eliminan posts, mensajes, fotos
4. ✅ Se elimina historial de pedidos
5. ✅ Se elimina wallet vinculada (registro local)
6. ⚠️ **NO se puede eliminar** lo que ya está en blockchain (público e inmutable)

**Tiempo:** La eliminación es **inmediata** en Supabase, con `ON DELETE CASCADE`.

### 6.3 Cómo Exportar tus Datos

**Ruta:** `Perfil → Datos → Descargar mis datos`

**Formato:** JSON + CSV
**Tiempo de generación:** Instantáneo
**Contenido:** Perfil, conversaciones, posts, mensajes, historial de pagos, inventario.

---

## 7. Menores de Edad

### 7.1 Edad Mínima
El uso de Csariel's Ecosystem está permitido **únicamente a mayores de 13 años**.

### 7.2 Menores entre 13 y 18
Requieren supervisión y autorización de padre/tutor legal.

### 7.3 Menores de 13
**Estrictamente prohibido.** Si se detecta, se suspende la cuenta inmediatamente.

### 7.4 Restricciones de contenido
- ❌ Sin contenido sexual, erótico o gore
- ❌ Sin relaciones parasociales románticas con IA
- ❌ Sin solicitud/almacenamiento de datos sensibles de terceros

---

## 8. Cookies y Tecnologías Similares

### 8.1 Cookies Necesarias
| Cookie | Propósito |
|--------|-----------|
| Sesión JWT | Autenticación |
| Preferencias de tema | Día/Noche |
| Idioma | Localización |

### 8.2 Cookies Analíticas (opcionales)
Actualmente **no usamos cookies analíticas de terceros**.

### 8.3 Cloudflare Turnstile
Usamos Turnstile para prevenir bots. No usa cookies de seguimiento.

---

## 9. Retención de Datos

| Tipo de dato | Retención |
|--------------|-----------|
| Datos de cuenta | Hasta eliminar cuenta |
| Conversaciones IA | Hasta eliminar cuenta o borrar memoria |
| Logs de seguridad (IP, UA) | 90 días |
| Historial de pagos | 5 años (obligación fiscal México) |
| Datos biométricos | Solo durante verificación (no persistente) |
| Storage (audios TTS, avatares) | Hasta eliminar cuenta |

---

## 10. Protocolo de Brecha de Seguridad

### 10.1 Detección
Sistemas automáticos monitorean:
- Intentos de acceso anómalos
- Rate limiting excedido
- Errores de firma en webhooks
- Actividad inusual en DB

### 10.2 Respuesta (en 72 horas)
1. **Contención** — Aislar el vector de ataque
2. **Evaluación** — Determinar alcance
3. **Notificación** — A usuarios afectados + autoridades (INAI, AEPD)
4. **Remediación** — Cerrar vulnerabilidad
5. **Post-mortem** — Análisis y mejoras

### 10.3 Contacto de Seguridad
Reportar vulnerabilidades a: `[EMAIL_SEGURIDAD_PENDIENTE]`

---

## 11. Internacionalización y Transferencias

### 11.1 Ubicación de Servidores
- **Supabase:** Servidores en AWS (región configurable)
- **Railway:** Servidores en US-East por defecto
- **Polygon:** Red descentralizada (global)

### 11.2 Transferencias Internacionales
Los datos pueden transferirse a:
- 🇺🇸 Estados Unidos (Railway, Supabase, Stripe, Groq)
- 🇲🇽 México (Fintoc)
- 🌎 Global (NOWPayments, Polygon, Telnyx)

Todas las transferencias cumplen con:
- **Cláusulas contractuales tipo** de la Comisión Europea
- **Privacy Shield** (equivalente)
- **Consentimiento explícito** del usuario

---

## 12. Cumplimiento Normativo

| Normativa | Estado |
|-----------|--------|
| 🇲🇽 LFPDPPP (México) | ✅ Cumple |
| 🇪🇺 GDPR (UE) | ✅ Cumple |
| 🇺🇸 CCPA (California) | ✅ Cumple |
| 💳 PCI-DSS (Pagos) | ✅ Vía Stripe |
| 🔐 SOC 2 | 🚧 Vía Supabase/Railway |

---

## 13. Cambios a Esta Política

Los cambios se notifican por:
1. **Email** a usuarios registrados
2. **Aviso en la app** durante 30 días
3. **Publicación** en `[DOMINIO_PENDIENTE]/privacidad`
4. **Registro de aceptación** (nueva versión)

---

## 14. Contacto

| Canal | Información |
|-------|-------------|
| 📧 **Delegado de Protección de Datos (DPO)** | `[EMAIL_DPO_PENDIENTE]` |
| 📧 **Privacidad general** | `[EMAIL_LEGAL_PENDIENTE]` |
| 📧 **Seguridad** | `[EMAIL_SEGURIDAD_PENDIENTE]` |
| 🌐 **Portal web** | `[DOMINIO_PENDIENTE]/privacidad` |
| 📍 **Dirección** | Heroica Puebla de Zaragoza, Puebla, México |

---

## 15. Anexos

- 📄 [Términos de Uso](/legal/terminos-marquinhos)
- 📄 [Política de Cookies](/cookies)
- 📄 [Aviso de Privacidad](/privacidad)

---

## 📄 Licencia

**Copyright © 2026 Csariel's. Todos los derechos reservados.**

Software confidencial y propietario.

---

*Última actualización: Octubre 2026*