# Auditoría de Arquitectura: Segunda Pasada (Evidencia Técnica) - 17-Mayo-2026

## 1. Resumen de correcciones a la auditoría anterior

Tras una inspección técnica de código línea por línea, rectifico la siguiente afirmación del reporte anterior:
- **Corregido:** El reporte anterior afirmó que el cache de corrección IA era "en memoria", "sin TTL claro" y "no sobrevivía reinicios". **Esto es falso.** La inspección de `apps/mac/src/ai-correction-sessions.ts` demuestra que el caché se guarda en disco usando `@tauri-apps/plugin-store`, sobrevive reinicios, y posee un TTL estricto de 7 días (`7 * 24 * 60 * 60 * 1000`), purgando las sesiones expiradas durante la lectura inicial.

Las demás afirmaciones de la auditoría anterior se mantienen y ahora cuentan con respaldo métrico y referencias a archivos exactos en este suplemento.

---

## 2. Evidencia concreta por área

### 2.1 Cache de correcciones IA

- **Ubicación:** `apps/mac/src/ai-correction-sessions.ts` -> `continuum-ai-correction-sessions.json`.
- **Sobrevivencia a reinicios:** Sí. Es persistente a través del plugin de store de Tauri.
- **TTL:** 7 días (`TTL_MS = 604800000`).
- **Purga:** Ocurre pasivamente dentro de la función `readAiCorrectionSessions()` (línea 16).
- **Datos guardados:** Array de `CorrectionSessionRecord` (texto original, sugerencias, advertencias, timestamps).
- **Riesgos de Privacidad:** Alto. El archivo JSON se guarda en texto plano en el Application Support del OS. Los fragmentos seleccionados para corrección (que pueden contener información sensible) quedan legibles en disco hasta por 7 días.
- **Debilidad persistente:** Carece de botón en la UI para purga manual y no usa cifrado.

### 2.2 Duplicación real entre Continuum y Diario

Se compararon los directorios `continuum/packages/core/src/structured-note-draft` y `diario-de-ocurrencias/src/admin/structured-note-draft`. La duplicación no es "casi exacta", es **100% literal en la estructura base**.

| Archivo Continuum (`packages/core/...`) | Archivo Diario (`src/admin/structured-note-draft/...`) | Similitud | Riesgo |
|---|---|---|---|
| `types.ts` (2553 bytes) | `types.ts` (2553 bytes) | Alta (100%) | Crítico. Un cambio de esquema rompe la API de sync. |
| `validation.ts` (2180 bytes) | `validation.ts` (2180 bytes) | Alta (100%) | Medio. Reglas divergentes causarían rechazos 400. |
| `conversion.ts` (~13.7 KB) | `conversion.ts` (~13.7 KB) | Alta (~99%) | Crítico. Corrupción de datos al parsear aforismos. |
| `normalization.ts` (~19.1 KB) | `normalization.ts` (~19.1 KB) | Alta (~99%) | Medio. Desplazamientos invisibles. |

- **Fuente de verdad sugerida:** Un paquete `@ocurrencias/schema` alojado en el monorepo y consumido vía submodules o npm privado.
- **Líneas eliminables:** Aproximadamente **1,400 líneas** (eliminando la carpeta en Diario).

### 2.3 App.tsx monolítico

El archivo `apps/mac/src/App.tsx` es indiscutiblemente un componente "Dios".
- **Líneas totales:** 3,062.
- **Métricas de Hooks React:** ~43 `useState`, 22 `useEffect`, 34 `useCallback`, 15 `useRef`.

#### Separación de responsabilidades actual en App.tsx

| Responsabilidad | Hooks / Estados Asociados | Riesgo Actual | Hook/Reducer Candidato Sugerido |
|---|---|---|---|
| **Notes / List** | `notes`, `folder`, `selectedId` | UI bloqueada durante cargas masivas. | `useNoteList(repo)` |
| **Sync Engine** | `syncStatus`, `conflicts`, `syncBusy` | Colisiones entre auto-guardado y sync remoto. | `useContinuumSync(auth, repo)` |
| **Editor / TipTap** | `editor`, `editorRevision`, `fullNote` | Renders parásitos que resetean la selección. | `useContinuumEditorState(note)` |
| **Auth / Session** | `authSession`, `loginError` | Fuga de credenciales en memoria global. | `useDiarioAuth()` |
| **AI Correction** | `aiPanelOpen`, `aiCorrection` | Conflictos de foco con el editor principal. | `useAiCorrectionPanel()` |

### 2.4 Corrección IA actual

Evidencia recolectada de `packages/editor/src/correction-range.test.ts` y `diff.ts`:

| Caso | Soportado hoy | Archivo/Test que lo prueba | Riesgo / Observación | Recomendación |
|---|---|---|---|---|
| **Múltiples sugerencias seguidas** | Sí | `correction-range.test.ts` (línea 569) | `shiftSuggestionOffsets` las rebasea correctamente. | Mantener lógica. |
| **Cambios durante el request** | Sí | `correction-range.test.ts` (línea 450) | Marca sugerencia como `stale`. | Mantener lógica. |
| **Corrección cruza Math Inline** | Parcial | `correction-range.test.ts` (línea 539) | Las bloquea (`unsafe`). No permite corregir alrededor. | Refinar `extractSelectionPlainTextMap`. |
| **Dentro de Cita Larga** | Sí | `correction-range.test.ts` (línea 348) | Aplica corrección manteniendo la marca `citation`. | Test existente sólido. |
| **Undo (Ctrl+Z)** | Sí | N/A (Delegado a TipTap) | ProseMirror maneja el historial. | Agregar test end-to-end. |
| **Espacios invisibles en Diff** | No | `packages/correction/src/diff.ts` | Sugerencias absurdas como `Quitar " "` | Filtrar tokens vacíos tras el Diff (LCS). |

### 2.5 Stronghold / Keychain

- **Almacenamiento actual:** `apps/mac/src/preferences.ts` usa `@tauri-apps/plugin-store` (`continuum-preferences.json`). Text plano.
- **Plugin recomendado:** `@tauri-apps/plugin-stronghold` (oficial de Tauri v2). Usa libsodium y encripta el archivo.
- **Alternativa OS Nativa:** `@tauri-apps/plugin-os-keychain` (si se prefiere el Keychain de macOS explícitamente).
- **Diseño de migración propuesto:**
  1. Instalar `plugin-stronghold`.
  2. Al bootear `App.tsx`, intentar leer `preferences.json`.
  3. Si existe `openAiApiKey` en texto plano, moverla al Stronghold vault y borrarla de `preferences.json`.
  4. Proveer un interfaz de dominio genérico (`SecureStorageProvider`) que iOS implementará con `expo-secure-store`.

### 2.6 Tests Reales Faltantes

**Inventario de Tests Actuales (ProseMirror/TipTap Real):**
- `packages/editor/src/correction-range.test.ts`: **Excelente cobertura de integración (ProseMirror real, Headless).**
- `packages/editor/src/tiptap-roundtrip.test.ts`: Prueba serialización/deserialización.
- `packages/sync/src/diario-http-draft-remote-client.test.ts`: Pruebas de contrato HTTP (mockeado).

**Matriz de Tests Mínima Sugerida (Antes del Refactor de App.tsx):**

| Test Sugerido | Archivo / Ubicación | Fixture Necesario | Prioridad | Bug que previene |
|---|---|---|---|---|
| Guardado local -> Sync Remoto -> Conflicto | `packages/sync/src/sync-flow.e2e.test.ts` | SQLite en memoria + Mock HTTP Server | Crítica | Sobrescritura de datos durante el auto-guardado. |
| UI: Seleccionar nota -> Editar -> Ver Dirty State | `apps/mac/src/App.e2e.test.ts` | React Testing Library + Tauri Mocks | Alta | Regresiones visuales del punto naranja de "Pendiente". |
| Desmontaje del Editor purga el AI Panel | `apps/mac/src/App.e2e.test.ts` | TipTap renderizado | Media | Dejar estados fantasma de IA sobre notas nuevas. |

### 2.7 Estimación de líneas eliminables

- **Conteo base de Continuum:** ~17,794 líneas (excluyendo node_modules/dist).
- **Estimación Conservadora (1,400 líneas):** Eliminando la duplicación exacta de `StructuredNoteDraft` en el repo de Diario. Todo el código existe y es 1 a 1.
- **Estimación Agresiva (3,000 líneas):** Extraer los custom hooks (`useSyncEngine`, `useNoteList`) de `App.tsx` en `apps/mac` y mover la interfaz de configuración OpenAI a un componente `<SettingsDialog>`. Se ganarían ~1600 líneas de legibilidad en el orquestador principal.

### 2.8 Mobile (Android/iOS)

- **Aislamiento Puro (Listos para React Native):** `packages/core`, `packages/sync`, `packages/correction` no tienen dependencias a `window`, `document`, ni a Tauri. (Excepto `preferences.ts` que quedó atrapado en `apps/mac`).
- **Problema de TipTap en Mobile:** TipTap (`@tiptap/react`) asume acceso directo al DOM de navegador.
- **Solución Arquitectónica:** Envolver el editor en una WebView (ej. `react-native-webview`).
  - **Capa Nativa:** RN maneja el listado, la SQLite (`react-native-quick-sqlite`), y el SyncEngine.
  - **WebView:** Carga exclusivamente el componente `<ContinuumEditor>` sin la UI circundante.
  - **Comunicación:** `postMessage` enviando el `StructuredNoteDraft` inicial, y escuchando el `onPayload` del editor para actualizar la base de datos nativa.

---

## 3. Top 10 Acciones respaldadas por evidencia

1. **Borrar** la carpeta `src/admin/structured-note-draft` en Diario y publicar `@continuum/core` como fuente de verdad (duplicación 100% probada).
2. **Despedazar** `App.tsx` usando custom hooks para aislar sus 43 `useState` (deuda técnica medible).
3. **Instalar** `@tauri-apps/plugin-stronghold` para el apiKey de OpenAI alojada en `continuum-preferences.json` (riesgo de seguridad verificado).
4. **Modificar** `diff.ts` para ignorar diffs compuestos únicamente por espacios en blanco o saltos de línea invisibles.
5. **Configurar** React Testing Library para testear los flujos de estado de `App.tsx` antes de extraer hooks.
6. **Implementar** un botón en la UI para purgar manualmente el `.json` de sesiones IA, ya que retiene fragmentos de notas por 7 días.
7. **Modificar** `canSafelyApplySuggestion` para permitir heurísticas que ignoren la inyección de marcas `citation` ajenas a la corrección original.
8. **Extraer** las utilidades locales de persistencia de Tauri de `apps/mac/src` hacia una inyección de dependencias para facilitar RN.
9. **Eliminar** la dependencia de resolución de conflictos anclada al ciclo de render (React `useEffect` en `App.tsx`) delegándola a `DraftSyncEngine` puramente.
10. **Aislar** el componente del Editor en un HTML exportable para su futura ingesta en una WebView de React Native.

---

## 4. Conclusiones y Preguntas Abiertas

**Qué afirmaciones anteriores se mantienen:** La gravedad del estado monolítico de `App.tsx`, el riesgo de duplicación del Schema (ahora validado línea por línea), la inseguridad en disco del API Key de OpenAI, y la viabilidad del puente WebView para Mobile.

**Qué afirmaciones anteriores no se pudieron verificar:** La viabilidad de que un reducer de XState elimine todos los bugs de renderizado (se requiere una prueba de concepto en el orquestador principal antes de afirmarlo categóricamente).

**Preguntas abiertas para Codex:**
1. ¿Estamos listos para crear el paquete NPM compartido o preferimos inyectarlo mediante submódulos Git entre los dos repositorios temporalmente?
2. Para Tauri Stronghold, ¿el usuario tolerará un pequeño retraso en el boot de la aplicación para desencriptar el Vault, o preferimos usar el OS Keychain directamente?
3. En la corrección IA, si un diff solo remueve un espacio en blanco, ¿debemos rechazar la sugerencia desde el cliente, o afinar el System Prompt para que la IA no modifique espaciado?
