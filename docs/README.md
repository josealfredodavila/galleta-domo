# 📚 Documentación Técnica — Csariel's Ecosystem

> Documentación técnica interna del ecosistema **Csariel's**.
> Complementa el [README principal](../README.md) con detalles de arquitectura, seguridad, features y stack.

---

## 📖 Antes de Empezar

**Si es tu primera vez aquí, lee primero:**
👉 [README principal del proyecto](../README.md)

Ahí encontrarás la **visión general** de todo el ecosistema.

Esta carpeta (`docs/`) contiene **documentación técnica profunda** para desarrolladores, auditores e integradores.

---

## 🗂️ Índice de Documentación Técnica

### 📐 Arquitectura
- **[Visión General del Sistema](./architecture/overview.md)**
  - Capas del sistema
  - Diagramas de flujo
  - Stack tecnológico completo
  - Módulos y responsabilidades

### 🎭 Features
- **[Marquinhos — Agente Cognitivo](./features/marquinhos.md)**
  - Arquitectura de IA (Groq + Llama 3.3 70B)
  - Sistema de memoria vectorial (pgvector)
  - Candados legales y protocolos de seguridad
  - Interfaces duales (widget + mensajería)

### 🔐 Seguridad y Cumplimiento
- **[Privacidad y Protección de Datos](./security/privacy.md)**
  - Recolección y almacenamiento de datos
  - Cumplimiento LFPDPPP (México) + GDPR
  - Derecho al olvido
  - Protocolo de brecha de seguridad

### 🛠️ Stack Técnico
- **[Variables de Entorno](./stack/environment-variables.md)**
  - Listado documentado de todas las variables
  - Propósito de cada una
  - Buenas prácticas de seguridad

---

## 🎯 Guía Rápida por Rol

| Si eres... | Empieza por... |
|------------|----------------|
| 👨‍💻 **Desarrollador nuevo** | [Arquitectura](./architecture/overview.md) → [Variables de Entorno](./stack/environment-variables.md) |
| 🔒 **Auditor de seguridad** | [Privacidad y Cumplimiento](./security/privacy.md) |
| 💼 **Inversor / Socio** | [README principal](../README.md) |
| 🎭 **Interesado en Marquinhos** | [Ficha de Marquinhos](./features/marquinhos.md) |
| 🔌 **Integrador externo** | Próximamente: contratos OpenAPI (en desarrollo) |

---

## 🏛️ Resumen del Ecosistema

**Csariel's Ecosystem** es una infraestructura digital **multi-tenant** que integra:

| Vertical | Descripción |
|----------|-------------|
| 🤖 **IA Cognitiva** | Agente conversacional autónomo (Marquinhos) con memoria persistente, voz y personalización. |
| ⛓️ **Web3** | Smart contracts en Polygon (ERC-20/ERC-721), tokens ES.TOKS y NFTs. |
| 💰 **Fintech** | Liquidación dual: fiat (Stripe Connect / Fintoc) y cripto (NOWPayments). |
| 📱 **Telecom** | Aprovisionamiento de eSIM, SMS y VoIP vía Telnyx. |
| 🛒 **Marketplace** | Motor multi-tenant con vendedores, repartidores y logística de última milla. |
| 📹 **Streaming** | Videollamadas y salas en vivo con LiveKit (WebRTC). |
| 💬 **Mensajería** | Chat en tiempo real con soporte multimedia. |
| 🌐 **Red Social** | Muro, grupos y tendencias. |
| 💳 **Pagos** | Csariel's Pay — capa unificada de pagos (tarjeta, SPEI, cripto). |

---

## 📞 Contacto

| Canal | Información |
|-------|-------------|
| 🌐 **Sitio Web** | `[DOMINIO_PENDIENTE]` |
| 📧 **Email Legal** | `[EMAIL_LEGAL_PENDIENTE]` |
| 📧 **Email Técnico** | `[EMAIL_TECNICO_PENDIENTE]` |
| 🐙 **Repositorio** | `[URL_REPO_PENDIENTE]` |
| 📍 **Ubicación** | Heroica Puebla de Zaragoza, Puebla, México |

---

## 📄 Licencia y Propiedad Intelectual

**Copyright © 2026 Csariel's. Todos los derechos reservados.**

Software **confidencial y propietario**. La copia, distribución o ingeniería inversa no autorizada de este repositorio por cualquier medio está estrictamente prohibida sin autorización explícita de la empresa.

---

## 📝 Changelog de Documentación

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | Octubre 2026 | Documentación inicial completa |

---

*Última actualización: Octubre 2026*