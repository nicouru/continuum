# Auditoría de Arquitectura y Refactor: Continuum & Diario de Ocurrencias (17-Mayo-2026)

## Resumen Ejecutivo
El sistema se encuentra en un punto de inflexión. Continuum (Desktop) posee una estructura moderna en monorepo (`pnpm workspaces`) que abstrae limpiamente los dominios de sincronización, edición, corrección y almacenamiento. No obstante, existe una alta duplicación de contratos y lógica central (`StructuredNoteDraft`, transformaciones de TipTap) entre Continuum y el backend/frontend de Diario de Ocurrencias. Además, `App.tsx` en Mac se ha convertido en un componente "Dios" extremadamente frágil, carente de una máquina de estados formal, lo cual arriesga la estabilidad de la experiencia. Finalmente, la seguridad local debe madurar urgentemente, moviendo secretos (OpenAI API Key) al Keychain/Stronghold. Esta auditoría presenta un diagnóstico completo y un plan estructurado para estabilizar la arquitectura, eliminar deuda técnica, y preparar el terreno para Android e iOS sin reescribir la lógica de dominio.

## Mapas de Arquitectura

### 1. Mapa de Arquitectura Actual
- **Continuum (Desktop)**:
  - `apps/mac`: Contiene a `App.tsx` (3000+ líneas, estado monolítico), UI principal, integración Tauri (Tauri APIs en hooks).
  - `packages/core`: Define TipTap JSON node, utils sueltos.
  - `packages/editor`: Instancia de TipTap React, plugins, `editor-identity`, `aphorism-actions`.
  - `packages/storage`: SQLite (Better SQLite3/Tauri plugin).
  - `packages/sync`: DraftSyncEngine, manejo de conflictos, peticiones HTTP a Diario.
  - `packages/correction`: Integración con OpenAI, cache rudimentario, mapeo de texto.
  - `Secretos`: En texto plano en Preferences locales (Inseguro).
- **Diario de Ocurrencias (Web)**:
  - `src/admin/structured-note-draft`: **Duplicación casi exacta** de tipos y lógica de conversión TipTap.
  - Base de datos en producción y API HTTP para Sync.

### 2. Mapa de Arquitectura Recomendada
- **Contrato Unificado (Nuevo)**: Extraer `packages/core`, `packages/editor-headless` (pura lógica ProseMirror, sin React) a un paquete NPM privado o submodule compartido con Diario de Ocurrencias.
- **Continuum (Desktop / Mobile)**:
  - `apps/mac`: Solo capa UI, inyección de dependencias Tauri y Stronghold.
  - `apps/mobile`: Futuro contenedor React Native, reutilizando `packages/sync` y `packages/correction`.
  - `packages/state`: (Nuevo) Reducer o XState para el flujo de la App (Sync, Editor, Offline).
  - `packages/security`: Capa abstracción para Keychain (Tauri Stronghold / RN Secure Storage).
- **Diario de Ocurrencias (Web)**:
  - Consume el contrato unificado. Elimina la carpeta `src/admin/structured-note-draft`.

---

## Duplicación y Deuda Técnica

### Tabla de Duplicaciones
| Área | Continuum | Diario de Ocurrencias | Riesgo |
|---|---|---|---|
| Contrato de Datos | `packages/core/src/structured-note-draft` | `src/admin/structured-note-draft/types.ts` | Alto (Desincronización de esquemas corromperá el sync). |
| Conversión TipTap | `packages/editor/src/tiptap-document.ts` | `src/admin/structured-note-draft/conversion.ts` | Alto (Bugs en parseo de aforismos o refs asimétricos). |
| Tipos de Sync | `packages/sync/src/types.ts` | `src/admin/types.ts` | Medio (Puede causar conflictos de merging). |

### Tabla de Deuda Técnica
| Componente | Problema | Costo Estimado |
|---|---|---|
| `App.tsx` | +3000 líneas. Mezcla UI, auth, persistencia, sync, y eventos de TipTap. | Alto (Extraer a Contextos/Reducers). |
| OpenAI API Key | Almacenada en preferencias sin cifrar en disco. | Medio (Implementar Tauri Stronghold). |
| Tests TipTap | Falta de tests de integración con nodos complejos (Math, Citas, Aforismos). | Alto (Escribir Cypress/Playwright o RTL complex). |
| Sync Engine | Conflict handling manual altamente acoplado a React. | Medio. |
| Cache de Corrección | Cache en memoria que no sobrevive reinicios, sin TTL claro ni purga. | Bajo (Implementar purga y persistencia segura). |

---

## Hallazgos Principales

### 1. `App.tsx` requiere una Máquina de Estados (o Reducers)
- **Severidad:** Crítica.
- **Archivos Involucrados:** `apps/mac/src/App.tsx`.
- **Explicación:** El estado reactivo mezcla operaciones de red, manejo del DOM/Editor, y timers en cientos de hooks `useState` y `useEffect`. Esto provoca renders innecesarios y condiciones de carrera (ej. auto-save chocando con la carga inicial).
- **Riesgo Actual:** Pérdida accidental de cambios por estados de "dirty" mal calculados, o bloqueos en la UI.
- **Recomendación:** Mover el estado a un `useReducer` complejo o `XState`, encapsulando transiciones (ej. `IDLE -> SYNCING -> ERROR`).
- **Costo / Orden:** Alto / Batch 2.
- **Impacto Mac / Mobile:** Facilita inmensamente la adopción en iOS/Android porque la lógica de la UI estará separada del componente de render.

### 2. Seguridad Inadecuada de Secretos (Stronghold)
- **Severidad:** Alta.
- **Archivos Involucrados:** `apps/mac/src/preferences.ts`, `apps/mac/src/App.tsx`.
- **Explicación:** La API Key de OpenAI para corrección IA se guarda en disco en texto plano.
- **Riesgo Actual:** Exposición de credenciales si la máquina del usuario se ve comprometida.
- **Recomendación:** Implementar `tauri-plugin-stronghold` para cifrar secretos en el sistema nativo de Mac (Keychain). Proveer una abstracción en `packages/core` para inyectar este storage de manera que iOS/Android utilicen `expo-secure-store` en el futuro.
- **Costo / Orden:** Medio / Batch 1.

### 3. Duplicación Crítica del Contrato `StructuredNoteDraft`
- **Severidad:** Crítica.
- **Archivos Involucrados:** `continuum/packages/core` vs `diario-de-ocurrencias/src/admin/structured-note-draft`.
- **Explicación:** Si Continuum añade un nuevo atributo a un aforismo, Diario fallará al validarlo, corrompiendo la sincronización.
- **Recomendación:** Publicar el núcleo como paquete `@ocurrencias/schema` (NPM o workspace compartido/submodule).
- **Líneas eliminables:** ~1500 líneas redundantes en Diario.
- **Orden:** Batch 3.

### 4. Tests de Integración Inexistentes para Nodos Complejos
- **Severidad:** Alta.
- **Archivos Involucrados:** `packages/editor/src/*`.
- **Explicación:** Los tests unitarios no capturan el comportamiento real del cursor sobre nodos no triviales (`math`, `referenceInsert`, `citation`, `aphorism`).
- **Recomendación:** Bloquear refactors del editor hasta tener tests de integración (Playwright/Vitest Browser) verificando que las correcciones IA que insertan/borran texto no rompen los nodos.
- **Orden:** Batch 4.

### 5. Arquitectura del Diff y "Quitar" invisible
- **Severidad:** Media.
- **Archivos Involucrados:** `ContinuumAiPanel.tsx`.
- **Explicación:** La UI de corrección asume un diff ingenuo con `Quitar " "`.
- **Recomendación:** Filtrar micro-cambios (como espacios dobles o saltos de línea invisibles) en la capa de parsing para no saturar al usuario, y mostrar un diff estilo GitHub para cambios estructurales de los aforismos. El corrector debe trabajar siempre sobre el `plainText` indexado, pero la aplicación debe remapearlo al árbol ProseMirror a través de `transformPasted` o commands exactos para no romper atributos.
- **Orden:** Batch 6.

### 6. Preparación para Mobile (Android/iOS)
- **Severidad:** Baja (por ahora, estratégica a futuro).
- **Archivos Involucrados:** Monorepo.
- **Explicación:** El Editor es un componente React (`EditorContent` de TipTap). React Native no soporta TipTap directamente porque TipTap depende del DOM.
- **Recomendación:**
  1. Extraer la lógica pura a `packages/core`.
  2. En móvil, se deberá usar una WebView inyectando el bundle web de TipTap, conectada por un puente (postMessage) a la capa nativa (React Native). Mantener las dependencias limpias de Tauri en los paquetes `packages/*` es fundamental.
- **Impacto iOS/Android:** Evita reescribir 3 aplicaciones.

---

## Refactors y Líneas Eliminables

### Top 10 Refactors Recomendados
1. **Implementar Tauri Stronghold** para la OpenAI API Key.
2. **Extraer el estado de App.tsx** a múltiples hooks lógicos (`useSyncEngine`, `useNoteList`, `useEditorState`).
3. **Consolidar el paquete de schemas** entre Continuum y Diario (contrato único).
4. **Agregar Vitest Browser tests** sobre el editor TipTap real con interacciones complejas.
5. **Implementar una base de Cache (TTL/LRU)** para peticiones HTTP repetitivas del panel de IA.
6. **Refinar la heurística de Diff** en la IA (esconder diferencias triviales como espacios finales).
7. **Refactorizar el Sync Engine** para usar una cola de operaciones robusta (offline-first real) en lugar de promesas imperativas esparcidas.
8. **Mover peticiones HTTP** de Auth/Sync fuera del render React.
9. **Abstraer dependencias de Tauri** mediante Dependency Injection para facilitar tests y RN.
10. **Sanear y purgar la base SQLite** de notas huérfanas periódicamente.

### Estimación de Líneas Eliminables
- **Conservadora:** 1,200 líneas (Removiendo duplicaciones exactas menores, moviendo TipTap schemas).
- **Agresiva:** 3,500 líneas (Centralizando el contrato en un monorepo superior, reduciendo lógica imperativa en React por máquinas de estado compactas).

---

## Qué NO conviene refactorizar todavía
1. **El motor de SQLite (Better-SQLite):** Aunque se puede optimizar, la abstracción actual funciona y el volumen de datos en una nota local es bajo.
2. **La UI base del editor:** TipTap, aunque complejo, es el corazón. No buscar alternativas a ProseMirror/TipTap.

## Qué conviene bloquear con tests antes de tocar
- Lógica de mapeo de índices `plainText` ↔ `ProseMirror` (`packages/editor/src/ai-selection-highlight.ts`).
- Conversión `StructuredNoteDraft` ↔ `TipTapJsonNode`.

---

## Plan por Batches Sugerido
- **Batch 1 (Seguridad/Bugs críticos):** Implementación de Tauri Stronghold para API keys, sanitización del local storage.
- **Batch 2 (Extracción de estado):** Despiece de `App.tsx` en hooks, migración a `useReducer` o XState.
- **Batch 3 (Contrato compartido):** Unificación de `packages/core` con el backend de Diario de Ocurrencias.
- **Batch 4 (Tests integración):** Setup de Playwright/Vitest Browser y tests de TipTap real.
- **Batch 5 (Preparación Mobile):** Limpieza de dependencias DOM/Tauri de los paquetes de negocio.
- **Batch 6 (Limpieza Final):** Mejoras de UX en diff IA, purga de SQLite y caché TTL.
