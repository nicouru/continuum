# Auditoría de Arquitectura: Continuum + Diario de Ocurrencias
**Fecha:** 2026-05-17
**Auditor:** Claude Sonnet 4.6
**Repos:** continuum@598e2717 / diario-de-ocurrencias@codex/work (f65257d)
**Branch auditoría:** claude/audit-architecture-refactor-continuum-diario-2026-05-17

---

## 1. Resumen Ejecutivo

### Estado general

Continuum es un monorepo Tauri/React/TypeScript en etapa de producto funcional temprana. La app corre en macOS, sincroniza notas con Diario de Ocurrencias (Next.js 16 + SQLite), tiene un editor TipTap con conversión bidireccional hacia un formato propio (`StructuredNoteDraft`), y acaba de recibir un panel de corrección con IA (OpenAI). El conjunto es técnicamente sólido en su núcleo de datos: el contrato `StructuredNoteDraft` está bien definido y es idéntico entre ambos repos (al nivel de tipos). Los tests unitarios cubren los paths más críticos de conversión, diff y storage.

### Nivel de riesgo global: MEDIO-ALTO

Los riesgos más graves no son bugs sino problemas estructurales acumulados:

1. **`App.tsx` tiene 3062 líneas** — el componente más crítico de la app gestiona TODO el estado y la lógica de negocio sin separación de responsabilidades. Es el principal vector de regresión.
2. **La API key de OpenAI se guarda en texto plano** en `tauri-plugin-store` (un JSON en AppLocalData), sin Keychain/Stronghold.
3. **La cookie de sesión de Diario se guarda en texto plano** en el mismo store, con solo una validación de expiración por `expiresAt` sin verificación criptográfica.
4. **CSP nula en `tauri.conf.json`** (`"csp": null`) — sin Content Security Policy, una XSS en el webview tendría acceso a las APIs nativas de Tauri.
5. **Sin FTS5 en SQLite** — la búsqueda full-text no está implementada aunque el schema la menciona como trabajo futuro.
6. **Sin preparación real para iOS/Android** — el código usa plugins de Tauri (SQL, Store, FS, HTTP) que no tienen equivalente directo en Tauri Mobile sin adaptación.
7. **Duplicación del contrato de datos** — `StructuredNoteDraft/types.ts` existe verbatim en ambos repos (Continuum `packages/core/src/structured-note-draft/types.ts` y Diario `src/admin/structured-note-draft/types.ts`), sin un paquete npm compartido.

### Principales decisiones pendientes

- Definir si el contrato compartido pasa a un paquete npm/jsr publicado, o si se mantiene como duplicación coordinada.
- Decidir la estrategia de secretos: Keychain (macOS), Stronghold (Tauri), o delegarlo a un backend proxy.
- Decidir cuándo extraer el estado de `App.tsx` a reducers/máquinas de estado.
- Definir hoja de ruta mobile concreta (capacitor vs. tauri mobile, o web-first iOS).

---

## 2. Mapa de Arquitectura Actual

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CONTINUUM (macOS Tauri 2)                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          App.tsx (3062 líneas)                       │   │
│  │   ┌─────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │   │
│  │   │  UI State   │  │  Editor State    │  │  Sync/Conflict State  │ │   │
│  │   │ - notes[]   │  │ - editor         │  │ - syncLabel           │ │   │
│  │   │ - selectedId│  │ - livePayload    │  │ - conflicts[]         │ │   │
│  │   │ - fullNote  │  │ - aiCorrection   │  │ - syncStatus          │ │   │
│  │   │ - folder    │  │ - aiPanelOpen    │  │ - syncBusy            │ │   │
│  │   │ - sidebar   │  │ - editorRevision │  │ - offline             │ │   │
│  │   │ - title     │  │ - lexicalLookup  │  │ - engineRef           │ │   │
│  │   │ - writtenAt │  │ - editorMenu     │  └───────────────────────┘ │   │
│  │   └─────────────┘  └──────────────────┘                           │   │
│  │                                                                      │   │
│  │   40+ useState, 15+ useEffect, 20+ useCallback, 8+ useRef/useMemo   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│          ┌───────────────────┼────────────────────────┐                   │
│          ▼                   ▼                        ▼                   │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────────┐       │
│  │ @continuum/   │  │ @continuum/      │  │ @continuum/sync      │       │
│  │ editor        │  │ storage          │  │                      │       │
│  │               │  │                  │  │ DraftSyncEngine      │       │
│  │ ContinuumEditor│  │ BetterSqlite3   │  │ (setInterval 15s)   │       │
│  │ TipTap conv.  │  │ SQLite local     │  │ DraftRemoteClient    │       │
│  │ tiptap-doc.ts │  │ migrations       │  │ DiarioDraftHttp...   │       │
│  │ correction-   │  │ conflict-resol.  │  └──────────────────────┘       │
│  │ range.ts      │  │ revisions cap 80 │           │                     │
│  └───────┬───────┘  └──────────────────┘           │ HTTP (fetch Tauri)  │
│          │                   │                      ▼                     │
│          │           ┌───────────────┐  ┌──────────────────────────────┐ │
│          │           │ @continuum/   │  │   DIARIO DE OCURRENCIAS      │ │
│          │           │ correction    │  │   (Next.js 16 + SQLite)      │ │
│          │           │               │  │                              │ │
│          │           │ OpenAI API    │  │ POST /api/admin/v1/tiptap-   │ │
│          │           │ (HTTP Tauri)  │  │      draft                   │ │
│          │           │ gpt-5.4-mini  │  │ GET  /api/admin/v1/tiptap-   │ │
│          │           └───────────────┘  │      draft?noteId=...        │ │
│          │                              │ GET  /api/admin/v1/tiptap-   │ │
│          ▼                              │      drafts                  │ │
│  ┌───────────────┐                      │ POST /api/admin/v1/commands  │ │
│  │ @continuum/   │                      │      {type: note:publish}    │ │
│  │ lexical        │                      │ POST /api/admin/v1/login     │ │
│  │               │                      └──────────────────────────────┘ │
│  │ RAE API       │                                                        │
│  └───────────────┘                                                        │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                      @continuum/core                              │    │
│  │  StructuredNoteDraft types + normalization + conversion           │    │
│  │  domain-types (Note, Reference, Citation, Aphorism…)             │    │
│  └───────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘

Persistencia local:
  SQLite (better-sqlite3 vía tauri-plugin-sql)  →  continuum.db
  Tauri Store (JSON en AppLocalData)            →  continuum-auth.json
                                                    continuum-preferences.json
                                                    ai-correction-sessions.json (via store)
  Filesystem (AppLocalData)                     →  continuum/emergency-draft.json

Secretos actuales (TEXTO PLANO en JSON):
  continuum-auth.json:    { session.sessionCookie, session.expiresAt, ... }
  continuum-preferences.json: { openAiApiKey, ... }
```

---

## 3. Mapa de Arquitectura Recomendada

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CONTINUUM (macOS Tauri 2 → + Mobile)                    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Capa de presentación                             │  │
│  │                                                                        │  │
│  │  App.tsx (coordinador ligero, ~400 líneas)                           │  │
│  │   ├── useAppBootstrap()     ← bootstrap + repo + session             │  │
│  │   ├── useNoteList()         ← lista + folder + selección             │  │
│  │   ├── useNoteEditor()       ← editor + autosave + livePayload        │  │
│  │   ├── useSyncEngine()       ← sync + conflictos + estado sync        │  │
│  │   ├── useAiCorrection()     ← panel IA + sugerencias + sesiones      │  │
│  │   └── useLexicalLookup()    ← RAE lookup                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                       Capa de dominio (sin cambios)                   │  │
│  │                                                                        │  │
│  │  @continuum/core    @continuum/editor   @continuum/storage            │  │
│  │  @continuum/sync    @continuum/correction  @continuum/lexical         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Capa de infraestructura                          │  │
│  │                                                                        │  │
│  │  Secretos:  Tauri Stronghold / Keychain nativo                       │  │
│  │  Storage:   SQLite (actual) + FTS5 (pendiente)                       │  │
│  │  HTTP:      tauri-plugin-http (actual, válido en mobile con adapter)  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                 Contrato compartido (nuevo paquete)                   │  │
│  │                                                                        │  │
│  │  @diario/shared-draft-contract (npm/jsr privado)                     │  │
│  │    types.ts         — StructuredNoteDraft, etc.                      │  │
│  │    normalization.ts — normalizeStructuredNoteDraft                   │  │
│  │    validation.ts    — getStructuredNoteDraftWarnings                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Análisis por Área

### 4.1 Monorepo y configuración

**Estructura actual:**
```
continuum/
  package.json          — pnpm workspace root (packageManager: pnpm@10.33.2)
  tsconfig.base.json    — target: ES2022, moduleResolution: bundler
  vitest.config.ts      — aliases manuales de workspace
  packages/
    core/               — tipos, normalización, conversión
    storage/            — SQLite local (better-sqlite3)
    sync/               — motor de sincronización
    editor/             — TipTap + conversiones
    correction/         — IA corrección OpenAI
    lexical/            — consulta RAE
  apps/
    mac/                — Tauri 2 app
```

**Hallazgos:**

1. **Vitest aliases duplicados**: `vitest.config.ts` define aliases manuales (`@continuum/core → packages/core/src/index.ts`) que replican los `exports` del `package.json` de cada paquete. Si se cambia un export hay que actualizarlo en dos lugares. Los aliases de TypeScript en cada `tsconfig.json` de paquete no están coordinados: no existe un `tsconfig.base.json` con `paths`. El monorepo depende de que `vite` / `vitest` resuelva por `exports`, pero el campo `exports` en los `package.json` de paquetes apunta directamente a `.ts` (ej: `"./": "./src/index.ts"`), lo cual requiere que el resolver del bundler entienda TypeScript source. Esto funciona en dev pero sería un problema en un setup de build clásico.

2. **No hay script de typecheck global efectivo**: `"typecheck": "pnpm -r typecheck"` corre `tsc --noEmit` en cada paquete. Pero `apps/mac` tiene su propio `tsconfig.json` con `"references"` a los paquetes vía paths. Si alguien agrega una dependencia circular entre paquetes, el typecheck individual no lo detecta.

3. **No hay `pnpm-workspace.yaml`**: No se encontró en la raíz. Puede estar implícito por la estructura, pero conviene verificar.

4. **DevDependencies en root son mínimas y correctas**: Solo `typescript` y `vitest`. La gestión de dependencias compartidas está bien delegada a cada paquete.

5. **`tauri.conf.json` usa `"csp": null`**: Este es el hallazgo de seguridad más grave de la configuración. Sin CSP, cualquier XSS en el webview puede invocar comandos Tauri arbitrarios.

---

### 4.2 packages/core — StructuredNoteDraft y contrato de datos

**Archivos clave:**
- `packages/core/src/domain-types.ts` — tipos de dominio (Note, Reference, Citation, Aphorism…)
- `packages/core/src/structured-note-draft/types.ts` — el contrato de wire (StructuredNoteDraft)
- `packages/core/src/structured-note-draft/normalization.ts` — normalización robusta (~737 líneas)
- `packages/core/src/structured-note-draft/conversion.ts` — conversión Note ↔ StructuredNoteDraft
- `packages/core/src/structured-note-draft/validation.ts` — warnings + unsupported features

**Fortalezas:**

1. **`normalizeStructuredNoteDraft` es defensive programming ejemplar**: Acepta `unknown`, maneja legado (shape `version: 1` con `note` anidado), genera IDs únicos para duplicados, resuelve citas huérfanas, reconstruye aphorismos desde bloques. Es el "único punto de entrada" para datos externos.

2. **Separación clara Note vs. StructuredNoteDraft**: `Note` es el tipo persistido en Diario (con `blocks: NoteBlock[]`, `aphorisms`, `citations`). `StructuredNoteDraft` es el contrato de transferencia (con `persistence.safeForCurrentNoteModel`, `warnings`, `source.version: 1`). La conversión bidireccional está bien encapsulada en `conversion.ts`.

3. **`persistence.safeForCurrentNoteModel`**: Flag que indica si el draft puede persistirse sin pérdida de datos. Se calcula a partir de `unsupportedFeatures` (citas no resueltas, referencias insert sin referencia). Bien diseñado como gate antes de publicar/sincronizar.

4. **Cobertura de tests**: `structured-validation.test.ts`, `id-stability.test.ts`, `index-text.test.ts`, `structured-note-draft-golden-fixtures.test.ts` (editor). Parece razonable.

**Hallazgos:**

1. **`StructuredNoteDraft.source.version: 1` no tiene mecanismo de migración**: Si en el futuro se cambia el contrato y se necesita `version: 2`, no hay código de migración. El normalizador maneja legacy `version: 1` con `note` anidado (editor-lab legacy), pero no hay una cadena de upgrades formal.

2. **`StructuredNoteDraftReference.body` es campo legacy/derivado**: En `normalization.ts` líneas 483-484: `body: typeof item.body === "string" ? item.body : getTextDocumentText(sourceText)`. El campo `body` es una cadena plana derivada de `sourceText`. En Diario se usa `sourceText` (TextDocument), en Continuum se usa `body`. Esta dualidad puede causar pérdida de formato si algún path solo lee `body`.

3. **`StructuredNoteDraftCitation.anchor.offset` es opcional en el contrato pero requerido en `Note.CitationAnchor`**: En `packages/core/src/domain-types.ts` línea 112: `offset: number` (requerido). En `structured-note-draft/types.ts` línea 63: `offset?: number` (opcional). La conversión en `conversion.ts` líneas 432-435 calcula `offset` desde segmentos si no viene del draft. Esto es correcto pero el mismatch de tipos es una deuda que puede confundir.

4. **No hay validación de `writtenAt` como fecha**: `writtenAt` es un string libre. No hay validación de formato (YYYY-MM-DD esperado). Un valor inválido se propaga silenciosamente.

5. **`getStructuredDraftDateInput` falta en el export de `utils.ts`**: El archivo `utils.ts` re-exporta `toStructuredDraftDateInput` desde `dates.ts` (`formatDateInput`), pero `formatIdTimestamp` no está visible a nivel de test unitario. Menor.

---

### 4.3 packages/storage — SQLite local

**Archivos clave:**
- `packages/storage/src/better-sqlite-repository.ts` (~557 líneas) — repositorio principal
- `packages/storage/src/migrations.ts` — schema SQL inicial
- `packages/storage/src/types.ts` — tipos (NoteMeta, NoteFull, SaveNoteInput…)
- `packages/storage/src/conflict-resolution.ts` — `cloneStructuredDraftForLocalDuplicate`

**Schema actual (INITIAL_MIGRATION_SQL):**
```sql
notes(id, slug, status, title, written_at, created_at, updated_at, deleted_at,
      local_version, remote_version, device_id, last_synced_at, sync_state,
      structured_draft_json, tiptap_json, plain_text, excerpt)
note_revisions(id, note_id, created_at, structured_draft_json, tiptap_json, local_version)
reference_index(id, note_id, payload)
citation_index(id, note_id, payload)
sync_queue(id, note_id, payload, created_at, attempt_count, last_error)
sync_conflicts(id, note_id, created_at, local_payload, remote_payload, resolved)
app_metadata(key, value)
```

**Fortalezas:**

1. **Schema bien diseñado para offline-first**: `sync_state` enum + `sync_queue` + `sync_conflicts` es un patrón clásico bien implementado. El backoff exponencial en `listDirtyIds` (10s, 30s, 60s, 120s, 300s) es correcto.

2. **Transaccionalidad implícita por better-sqlite3**: Todas las operaciones son síncronas y better-sqlite3 es thread-safe en modo single-process. El `upsertNote` + `rebuildIndexes` + `enqueueSync` en `saveNote` son atómicos en la práctica (aunque no están en una transacción explícita — ver hallazgo abajo).

3. **Revisiones con cap de 80**: `appendRevision` + `deleteOldRevisions` con límite de 80 es un buen balance.

4. **`migrateBetterSqlite` con `CREATE TABLE IF NOT EXISTS`**: El schema es idempotente, lo que permite que `createBetterSqlNoteRepository` se llame con seguridad en cada arranque.

5. **`emergencyIsNewer`**: Compara `savedAtMs` del draft de emergencia con `updatedAt` del note en DB. Correcto como fallback anti-corrupción.

**Hallazgos:**

1. **`saveNote` no usa transacción explícita**: Las 3 operaciones (upsertNote, rebuildIndexes, enqueueSync) deberían estar en `db.transaction(...)`. Si `rebuildIndexes` falla a mitad, los índices quedan inconsistentes con la nota guardada. Con better-sqlite3 síncrono el riesgo es bajo pero existe.
   - **Archivo:** `packages/storage/src/better-sqlite-repository.ts`, función `saveNote` (línea ~242)

2. **No hay versioning del schema / migrations**: `INITIAL_MIGRATION_SQL` es solo el schema inicial. Si en el futuro hay que agregar una columna (ej: FTS5, índice de búsqueda), no hay un mecanismo de `ALTER TABLE`. Solo hay un script SQL que se aplica completo con `IF NOT EXISTS`.
   - **Riesgo:** Incompatibilidad en updates de la app. Un usuario con DB vieja no recibirá la nueva columna.

3. **`structured_draft_json` y `tiptap_json` se guardan como TEXT**: No hay validación al leer. `fullRow` en `repository-utils.ts` parsea con `parseJsonDraft` / `parseUnknownJson`. Si la DB contiene JSON corrupto, el error se silencia o devuelve `undefined`.

4. **`reference_index` y `citation_index` son flat**: Se guardan como `payload TEXT NOT NULL` (JSON serializado). No tienen indices secundarios. Una búsqueda de "todas las notas que referencian el referenceId X" requiere un full scan de la tabla. Con < 1000 notas esto es aceptable, pero no escala.

5. **`sync_conflicts.resolved` usa INTEGER (0/1)** en lugar de booleano con CHECK. Menor, pero podría causar inconsistencias si se inserta un valor != 0 o 1.

6. **Falta `updated_at` en `notes`** al hacer `restoreFromTrash`: La query actualiza `sync_state = 'dirty'` y `updated_at = ?`, lo cual es correcto. OK.

7. **`app_metadata` no tiene índice por `key`**: PRIMARY KEY ya crea el índice, está bien.

8. **`tiptap_json` se persiste aunque en algunos flujos es `{type: "doc"}`**: Cuando se importa un draft de Diario y no viene `tiptapJson`, se usa `continuumBootstrapPrototype(draft).tiptap`. Correcto pero no hay test que verifique que el JSON generado es válido TipTap.

---

### 4.4 packages/sync — Sincronización con Diario

**Archivos clave:**
- `packages/sync/src/sync-engine.ts` — `DraftSyncEngine` (class con setInterval)
- `packages/sync/src/types.ts` — `DraftRemoteClient` interface + `DraftRemoteError`
- `packages/sync/src/conflict.ts` — `shouldFlagSyncConflict`
- `packages/sync/src/diario-http-draft-remote-client.ts` — cliente HTTP

**Fortalezas:**

1. **`DraftSyncEngine` es una máquina de estados simple y correcta**: El `inFlight` Set previene sincronizaciones simultáneas del mismo note. El `isOffline()` como función (no valor) permite lazy evaluation. El `start()`/`stop()` con `setInterval` es idiomático.

2. **`shouldFlagSyncConflict` es simple y testeado**: Comparación `serverRemoteVersion > storedRemoteVersion` con estado dirty/syncing/error. Regla MVP correcta.

3. **`canRecoverLostFirstAck`**: Lógica para recuperar el caso donde el primer push llegó al server pero el ACK no llegó al cliente (`remoteVersion === 0` local, `serverRemoteVersion === 1` remoto). Evita falsos positivos de conflicto. Bien pensada.

4. **`DiarioDraftHttpRemoteClient`**: Implementa `DraftRemoteClient` interface. Soporta `sessionCookie` y `bearerToken`. El `fetchRemoteDraftsIndex` intenta primero el endpoint bulk (`/tiptap-drafts`) y si 404, cae a fetch individual por nota. Compatibilidad hacia atrás.

5. **Tests en `sync-engine.test.ts`**: Cubren errores de red, conflictos de revisión, y el caso `canRecoverLostFirstAck`. Bien.

**Hallazgos:**

1. **`DraftSyncEngine` arranca con `intervalMs: 15000`** pero `flushDirty` también se llama en eventos de red/focus en `App.tsx`. Esto puede causar carreras si hay múltiples triggers simultáneos. El `inFlight` Set protege por note pero no hay lock global para evitar `flushDirty` concurrente.
   - **Archivo:** `packages/sync/src/sync-engine.ts`, línea 56

2. **Versioning ambiguo: `remoteVersion` vs `remoteRevision`**: El cliente HTTP maneja ambos nombres (`sync.remoteRevision`, `sync.remoteVersion`, `remoteVersion` top-level). El código tiene múltiples coerciones para normalizar esto (`getRemoteVersionFromData`). La raíz del problema está en que Diario usa `remoteRevision` internamente y el campo de wire ha tenido dos nombres. Habría que unificar en el contrato.
   - **Archivo:** `packages/sync/src/diario-http-draft-remote-client.ts`, función `getRemoteVersionFromData` (líneas 375-389)

3. **`pushDraft` no envía `tiptapJson` al servidor**: En el body del POST solo va `{ baseRemoteRevision, draft }`. El `tiptapJson` NO se sube a Diario. Esto es intencional (Diario es la fuente de verdad del StructuredNoteDraft, el TipTap JSON es local a Continuum). Pero si en el futuro Diario necesita el TipTap JSON para renderizar, habrá que agregar este campo al endpoint.
   - **Archivo:** `packages/sync/src/diario-http-draft-remote-client.ts`, función `pushDraft` (línea 188)

4. **`listRemoteDrafts` hace N+1 requests** si el endpoint bulk no existe: Para cada nota de tipo draft, hace un request individual a `/tiptap-draft?noteId=...`. Con 50 notas son 51 requests. El endpoint bulk `/tiptap-drafts` soluciona esto pero no está garantizado que exista.
   - **Archivo:** `packages/sync/src/diario-http-draft-remote-client.ts`, función `listRemoteDrafts` (líneas 144-184)

5. **Sin retry en `listRemoteDrafts`**: El import inicial en `App.tsx` hace `remote.client.listRemoteDrafts?.()` sin retry. Si falla (timeout, error 5xx), el usuario ve "No se pudo importar Diario" y no hay recovery automático.
   - **Archivo:** `apps/mac/src/App.tsx`, líneas 1750-1794

6. **`DraftSyncEngine` no tiene `pause()` ni modo "solo lectura"**: En un futuro mobile puede necesitarse pausar la sync cuando la app está en background.

---

### 4.5 packages/editor — TipTap y conversiones

**Archivos clave:**
- `packages/editor/src/tiptap-document.ts` (~928 líneas) — conversión TipTap ↔ StructuredNoteDraft
- `packages/editor/src/editor-queries.ts` — queries sobre el editor TipTap
- `packages/editor/src/correction-range.ts` — mapeo texto plano ↔ posiciones TipTap
- `packages/editor/src/aphorism-actions.ts`, `reference-actions.ts` — acciones de edición
- `packages/editor/src/extensions.tsx` — extensiones TipTap custom

**Fortalezas:**

1. **`tiptap-document.ts` es el corazón correcto**: La conversión bidireccional `StructuredNoteDraft → TipTapJsonNode` y `TipTapJsonNode → StructuredNoteDraft` está centralizada, maneja todos los tipos de bloque (paragraph, aphorism, referenceInsert) y segmentos (text, inlineMath, manualIndent, hardBreak). Los IDs de segmento son estables (no se regeneran en cada roundtrip).

2. **`correction-range.ts` es el código más sofisticado del paquete**: El `extractSelectionPlainTextMap` construye un mapa bidireccional entre posiciones TipTap y offsets de texto plano, con soporte para inlineMath (representado como `$tex$`), manualIndent (como 4 espacios) y hardBreak (como `\n`). `applyCorrectionSuggestionToEditor` aplica sugerencias preservando marks (segmentId, citationId) del texto reemplazado. La verificación `plainRangeIsFullyMapped` garantiza que no se aplica una corrección sobre posiciones que no están completamente mapeadas.

3. **Estabilidad de IDs**: La función `getUniqueSegmentId` y `getUniqueCitationId` manejan duplicados generando sufijos `-split-N`. El ID de bloque se preserva desde `attrs.blockId`. Esto garantiza que un roundtrip TipTap→Draft no pierda identidad de segmentos.

4. **`dropEmptyAphorismBlocks`**: Limpieza de bloques de aforismo vacíos en la conversión TipTap→Draft. Maneja el edge case de borrado de aforismo que deja bloques huérfanos.

5. **`trimEditorOnlyEmptyParagraphBlocks`**: Trim de párrafos vacíos de editor (sin aphorismId) al inicio y al final. Correcto para evitar persistir estado de UI.

**Hallazgos:**

1. **`contiguousExistingCitation.anchor.selectedText += child.text` muta el objeto de la cita** (línea ~434 de `tiptap-document.ts`). El `citationsById` Map contiene referencias a objetos que se mutan durante la conversión. Esto es correcto funcionalmente (la cita acumula el texto seleccionado de nodos contiguos) pero es una mutación no aparente que podría introducir bugs si el orden de iteración cambia.

2. **`getTipTapDraftWarnings` en `tiptap-document.ts` duplica lógica de `getStructuredNoteDraftWarnings` en `core/validation.ts`**: Ambas funciones hacen la misma verificación de citas no resueltas y reference inserts sin referencia. La versión de `tiptap-document.ts` además chequea `discontinuous-aphorism` y `duplicate-block-id`. Esta duplicación puede divergir.
   - **Archivos:** `packages/editor/src/tiptap-document.ts` (líneas 692-784), `packages/core/src/structured-note-draft/validation.ts` (líneas 8-53)

3. **No hay tests de integración editor**: No se encontraron tests que ejerciten un ciclo completo `StructuredNoteDraft → TipTap → edición → StructuredNoteDraft`. Solo hay tests de golden fixtures en Diario. Los tests de `packages/editor/src/` cubren partes específicas (correction-range, aphorism selection, editor-starter-kit) pero no el roundtrip completo con casos complejos (aforismos multi-bloque + citas + reference inserts).

4. **`SOFT_BREAK_TEXT = "\n"` y `hardBreak`**: El soft break dentro de un párrafo se representa como `\n` en el texto plano. Esto puede confundir al corrector de IA que recibe el texto plano con `\n` embebidos en un párrafo (no como separador de párrafos). El corrector puede interpretar estos `\n` como saltos de párrafo y modificarlos.

5. **`getAphorismVisibleLabel` solo genera etiqueta para el primer bloque del aforismo**: Si la selección de corrección cae en el segundo bloque de un aforismo multi-bloque, `visibleLabel` sería `""`. Solo es cosmético (para el atributo `visibleLabel` del nodo TipTap) pero puede confundir en el debug.

---

### 4.6 packages/correction — IA con OpenAI

**Archivos clave:**
- `packages/correction/src/types.ts` — tipos (CorrectionRequest, CorrectionResult, CorrectionSuggestion…)
- `packages/correction/src/openai-provider.ts` — `OpenAiCorrectionProvider`
- `packages/correction/src/suggestions.ts` — diff-based suggestion management
- `packages/correction/src/diff.ts` — LCS tokenizado para diff
- `packages/correction/src/session.ts` — `CorrectionSessionRecord` + persistencia en memoria
- `packages/correction/src/schema.ts` — JSON schema para validación de respuesta
- `packages/correction/src/openai-config.ts` — `DEFAULT_PROMPT_CACHE_KEY = "continuum-ai-correction-v1"`

**Fortalezas:**

1. **LCS diff a nivel de tokens**: El diff en `diff.ts` tokeniza el texto en palabras/espacios (`/(\s+|[^\s]+)/gu`) y aplica LCS. Esto produce diffs semánticamente correctos (no a nivel de caracteres). El merge de `delete` + `insert` adyacentes en `replace` es correcto.

2. **`rebaseCorrectionSuggestionOffsets`**: Intenta re-mapear offsets de sugerencias cuando el texto cambia entre la ejecución del corrector y la presentación al usuario. Usa scoring por contexto (prefijo/sufijo de 18 caracteres) para desambiguar ocurrencias múltiples del mismo fragmento. Sofisticado y correcto.

3. **`shiftSuggestionOffsets`**: Al aplicar una sugerencia, ajusta los offsets de las sugerencias pendientes posteriores por el delta de longitud. Correcto y testeado.

4. **`MAX_CORRECTION_SESSIONS = 120`**: Límite razonable para cache en memoria. Las sesiones se ordenan por `updatedAt DESC` y se truncan al máximo.

5. **`CORRECTION_RESPONSE_JSON_SCHEMA`**: Schema estricto para la respuesta de OpenAI (`corrected_text: string`, `warnings: string[]`). El uso de structured outputs con JSON schema es el enfoque correcto para confiabilidad.

6. **`DEFAULT_MODEL = "gpt-5.4-mini"`**: Modelo reciente con buen balance costo/calidad para corrección ortográfica.

**Hallazgos:**

1. **La API key se pasa en texto plano desde `preferences.ts`**: La key se guarda en `continuum-preferences.json` (Tauri Store) como string sin cifrado. Cualquier app con acceso a `AppLocalData` del usuario puede leerla.
   - **Archivos:** `apps/mac/src/preferences.ts` (línea 7, campo `openAiApiKey`), `apps/mac/src/correction-client.ts` (línea 9)

2. **Sin limit de largo de texto para corrección**: No hay validación del largo del texto antes de enviarlo a OpenAI. Un `Ctrl+A` en una nota muy larga podría enviar 50k tokens. El timeout de 45 segundos es el único guard.
   - **Archivo:** `packages/correction/src/openai-provider.ts`, función `correct` (línea 114)

3. **`CorrectionLocale = "es-UY"` y `CorrectionMode = "orthography_grammar"` son constantes de facto**: El `SYSTEM_INSTRUCTION` no varía con el locale/mode recibido. La expansión a otros idiomas/modos requeriría cambiar el provider.

4. **Sin validación semántica post-corrección**: No hay check de que el texto corregido tenga la misma longitud aproximada, los mismos párrafos, las mismas fórmulas matemáticas, etc. El schema solo valida que sea un string, no que sea "conservador".

5. **`promptCacheKey` y `promptCacheRetention` se exponen como VITE env vars**: Configurables por desarrollador pero no documentados. En producción se usa `DEFAULT_PROMPT_CACHE_KEY = "continuum-ai-correction-v1"` sin retención explícita.

6. **`CorrectionSuggestionStatus` incluye "unsafe"**: Este estado se establece cuando `applyCorrectionSuggestionToEditor` devuelve `"unsafe"`. Pero la UI no muestra un mensaje de error específico diferente de "stale". El usuario no sabe por qué una corrección es "unsafe".

7. **`refreshCorrectionSuggestionStatuses` solo detecta staleness por comparación exacta del fragmento**: Si el usuario corrige manualmente el mismo error que la IA había detectado, la sugerencia no se actualiza como "obsoleta" hasta que se llama `refreshCorrectionSuggestionStatuses`. Hay un delay potencial de desync.

---

### 4.7 packages/lexical — Consulta léxica

**Archivos clave:**
- `packages/lexical/src/index.ts` — exports
- `packages/lexical/src/rae-provider.ts` — consulta a RAE API externa
- `packages/lexical/src/provider-chain.ts` — chain de proveedores
- `packages/lexical/src/single-word.ts` — normalización de palabra seleccionada
- `packages/lexical/src/types.ts` — `LexicalProvider`, `LexicalLookupResult`

**Hallazgos:**

1. **`rae-api.com` es una API de tercero no oficial de la RAE**: La URL `https://rae-api.com` no es la API oficial de la RAE. Es un proxy/scraper externo. Dependencia frágil.
   - **Archivo:** `apps/mac/src-tauri/capabilities/default.json`, línea 23

2. **Sin fallback si `rae-api.com` no responde**: La UI muestra un error de timeout, pero no hay fallback a diccionario local o a otra fuente.

3. **El paquete es pequeño y bien separado**: La interfaz `LexicalProvider` permite swappear implementaciones. Correcto.

---

### 4.8 apps/mac — App Tauri, App.tsx, UI state

**Archivos clave:**
- `apps/mac/src/App.tsx` (3062 líneas) — componente raíz
- `apps/mac/src/auth.ts` — login/logout Diario + sesión en Tauri Store
- `apps/mac/src/preferences.ts` — preferencias en Tauri Store
- `apps/mac/src/emergency-draft.ts` — draft de emergencia en filesystem
- `apps/mac/src/correction-client.ts` — factory de `OpenAiCorrectionProvider`
- `apps/mac/src/bootstrap-db.ts` — apertura del repositorio SQLite
- `apps/mac/src/sync-client.ts` — factory del cliente de sync
- `apps/mac/src-tauri/tauri.conf.json` — configuración Tauri
- `apps/mac/src-tauri/capabilities/default.json` — permisos
- `apps/mac/src-tauri/Cargo.toml` — dependencias Rust

**Hallazgos críticos de `App.tsx`:**

1. **3062 líneas en un componente**: El componente `App` contiene:
   - ~40 `useState` calls (líneas 654-726)
   - ~20 `useCallback` calls
   - ~15 `useEffect` calls
   - ~8 refs (`editorRef`, `debounceRef`, `lexicalAbortRef`, `correctionAbortRef`, `aiCorrectionSessionsRef`, `pendingAiHighlightRef`, `lexicalRequestIdRef`, `offlineRef`, `selectedRef`, `remoteImportSessionRef`, `engineRef`, `aiCorrectionSessionSaveTimerRef`)
   - Todos los handlers de negocio (sync, conflict, trash, publish, correction, lexical, etc.)
   - El render JSX completo (~700 líneas de JSX)
   
   Esto hace que cualquier cambio en cualquier parte requiera entender el componente completo. El número de re-renders potenciales es muy alto (cada `setState` puede triggear el re-render del root).

2. **Estado de corrección sin reducer**: El estado de `aiCorrection: ContinuumAiPanelCorrectionState` tiene transiciones complejas (idle → loading → ready | error, con subestados en ready). Estas transiciones están distribuidas en múltiples callbacks (`handleRunAiCorrection`, `syncAiCorrectionWithSelection`, `handleApplyAiSuggestion`, `handleApplyAllAiSuggestions`, `updateSuggestionInCorrectionState`). Sin un reducer formal, es fácil introducir transiciones inválidas.

3. **`void` usado profusamente**: Hay ~30 usos de `void asyncFn()` para "fire and forget". Esto silencia errores de promesa. Los errores de `refreshList()`, `refreshSyncStatus()` después de un save se ignoran.
   - **Ejemplo:** `apps/mac/src/App.tsx` líneas 1725-1727, 1800-1811

4. **`offlineRef.current = offline` patrón de ref-shadow para evitar stale closures**: Correcto como patrón pero añade complejidad. Lo mismo con `selectedRef.current = selectedId`.

5. **`remoteImportSessionRef` para evitar reimport**: La deduplicación del import inicial por `${authSession.baseUrl}:${authSession.userEmail}` es correcta pero frágil — si el usuario cambia de cuenta con el mismo email, no reimportaría.

6. **`emergency-draft.ts` usa JSON sin schema**: `readEmergencyDraft` hace `JSON.parse(raw) as EmergencyDraftFile` sin validación. Si el archivo está corrupto (crash mid-write), la app puede fallar en bootstrap.

7. **`auth.ts` extrae cookie con regex frágil**: `getSessionCookie` líneas 139-148 parsea `set-cookie` header con split por `,(?=[^;,]+=)`. Puede fallar con cookies complejas que tengan paths con `=`.

8. **`loginToDiario` en `auth.ts` no valida `expiresAt`**: Si Diario devuelve un `expiresAt` en formato inesperado, se usa un fallback de `Date.now() + 3600000` (1 hora). No hay alerta al usuario.

9. **Botones de conflicto accesibles sin login check**: `handleKeepLocalConflict`, `handleUseRemoteConflict`, etc., chequean `repo && selectedId && fullNote && syncBusy` pero no verifican que `authSession` no sea null. Podrían ejecutarse en un estado inconsistente si la sesión expiró.

**Tauri y seguridad:**

1. **`"csp": null` en `tauri.conf.json`**: Sin CSP, una XSS en el webview (ej: contenido malicioso en una nota importada de Diario, renderizado sin sanitización) podría invocar APIs nativas de Tauri. Riesgo alto.
   - **Archivo:** `apps/mac/src-tauri/tauri.conf.json`, línea 22

2. **`"unsafe-headers"` feature en `tauri-plugin-http`**: En `Cargo.toml` línea 27: `features = ["unsafe-headers"]`. Permite enviar headers arbitrarios (ej: `Cookie`). Es necesario para el protocolo de auth de Diario pero amplía la superficie de ataque si hay SSRF.

3. **Permisos HTTP amplios**: `capabilities/default.json` permite `https://*.fly.dev` (wildcard). Cualquier subdominio de fly.dev es alcanzable. Si Diario migra de fly.dev pero el allowlist no se actualiza, el wildcard puede quedar como vector.

4. **`store:default` y `fs:default` sin restricciones de path**: Los permisos de store y fs están con el scope `default`. No se restringen a paths específicos dentro de `AppLocalData`.

---

### 4.9 Relación Continuum ↔ Diario online

**Contrato de API (inferido del código):**

```
# Leer draft de una nota
GET /api/admin/v1/tiptap-draft?noteId=<id>
→ { ok: true, data: { draft: StructuredNoteDraft, note: {...}, sync: { remoteRevision, remoteVersion, updatedAt } } }

# Leer draft para nota nueva
GET /api/admin/v1/tiptap-draft?new=1
→ { ok: true, data: { draft: StructuredNoteDraft, source: { kind: "new-structured-draft" }, ... } }

# Leer todos los drafts (bulk)
GET /api/admin/v1/tiptap-drafts
→ { ok: true, data: { drafts: Array<{ draft, note, source, storage, sync }> } }
→ 404 si no implementado (fallback a listado individual)

# Guardar draft
POST /api/admin/v1/tiptap-draft
Body: { draft: StructuredNoteDraft, baseRemoteRevision?: number }
→ 200: { ok: true, data: { action, note, remoteVersion, sync, ... } }
→ 409: { ok: false, error: { code: "conflict", details: { remoteDraft, serverRemoteRevision } } }

# Publicar / despublicar nota
POST /api/admin/v1/commands
Body: { command: { noteId, type: "note:publish" | "note:unpublish" } }
→ 200: { ok: true, data: { execution: { persisted }, note: { status } } }

# Login / logout
POST /api/admin/v1/login
Body: { email, password }
→ set-cookie: session

POST /api/admin/v1/logout
```

**Hallazgos:**

1. **Sin versioning de API en el path del endpoint**: Los endpoints son `/api/admin/v1/...` (versionados), pero el cliente Continuum no tiene modo de manejar breaking changes (ej: si Diario pasa a `/api/admin/v2/...`).

2. **Doble nombre para `remoteVersion` / `remoteRevision`**: El servidor Diario usa `remoteRevision` (según el código de `structured-note-draft-api-handlers.ts` línea 366), mientras que el cliente Continuum normaliza ambos nombres. Esta ambigüedad está presente en 5+ lugares del cliente HTTP. Necesita unificación en Diario o contrato explícito.

3. **`baseRemoteRevision` también tiene alias `baseRemoteVersion`**: En `parseOptionalBaseRemoteRevision` (Diario, línea 461) se acepta `baseRemoteRevision` o `baseRemoteVersion`. Mismo problema de alias.

4. **No hay autenticación bearer token en el flujo normal**: El cliente usa `sessionCookie` para auth. El `bearerToken` existe como opción en el cliente pero no se usa desde la app (la sesión de login devuelve cookie, no token). Esto es correcto para el flujo de browser/macOS, pero bearer token sería necesario para mobile.

5. **Sin paginación en `listRemoteDrafts`**: El bulk endpoint devuelve todos los drafts. Con muchas notas (>200) esto puede ser lento.

6. **La sesión en Diario expira (campo `expiresAt`)**: La app verifica la expiración al leer la sesión guardada (`isUsableSession` en `auth.ts`). Si la sesión expira mientras la app está abierta, los siguientes syncs fallarán con 401. No hay manejo de re-login automático; el usuario ve "Error sync Diario" y necesita re-loggearse manualmente.

---

### 4.10 Seguridad y secretos

**Estado actual (CRÍTICO):**

| Secreto | Donde se guarda | Protección |
|---|---|---|
| OpenAI API key | `continuum-preferences.json` en AppLocalData | **Ninguna — texto plano** |
| Diario session cookie | `continuum-auth.json` en AppLocalData | **Ninguna — texto plano** |
| Session expiresAt | `continuum-auth.json` | No criptográfico, solo temporal |

**Riesgos:**

1. **OpenAI API key en texto plano**: Si el dispositivo tiene otro proceso con acceso a `AppLocalData` del usuario (ej: malware, otra app del mismo usuario), puede leer la API key y hacer peticiones a nombre del usuario.

2. **Session cookie en texto plano**: La cookie de sesión de Diario da acceso completo al admin de Diario (leer/escribir notas, publicar). En texto plano es equivalente a guardar la contraseña.

3. **Sin CSP**: Ataques XSS en contenido renderizado en el webview podrían extraer secretos del store.

4. **`fetch as tauriFetch` con `unsafe-headers`**: Permite enviar cualquier header en HTTP requests. Combinado con SSRF (si el usuario puede importar contenido de URLs arbitrarias), es riesgo de exfiltración.

**Recomendaciones:**

1. **Tauri Stronghold / Keychain nativo**: Usar `tauri-plugin-stronghold` (basado en IOTA Stronghold) para guardar API key y cookie de sesión. Stronghold encripta los datos con una clave maestra derivada de la contraseña del usuario (o del Keychain del SO).
2. **CSP mínima**: Agregar `"csp": "default-src 'self'; connect-src https://ocurrencias.net https://api.openai.com https://rae-api.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'"` o similar.
3. **Separar sesión del store**: La cookie de sesión debería rotarse con frecuencia o usar un token de corta vida.

---

### 4.11 Tests y cobertura

**Tests en Continuum:**

```
packages/core/src/
  id-stability.test.ts           — estabilidad de IDs tras normalización
  index-text.test.ts             — extracción de texto plano
  structured-validation.test.ts  — warnings + unsupportedFeatures

packages/storage/src/
  better-sqlite-repository.test.ts — saveNote, conflict, trash/restore
  conflict.test.ts                 — shouldFlagSyncConflict
  trash-restore.test.ts            — moveToTrash + restoreFromTrash

packages/sync/src/
  sync-engine.test.ts              — DraftSyncEngine (varios escenarios)
  conflict.test.ts
  diario-http-draft-remote-client.test.ts — mock HTTP

packages/editor/src/
  ai-selection-highlight.test.ts
  correction-range.test.ts         — extractSelectionPlainTextMap (bien cubierto)
  editor-starter-kit.test.ts
  structured-note-draft-golden-fixtures.test.ts — roundtrip con fixtures reales
  tiptap-roundtrip.test.ts         — roundtrip básico
  correction-range.test.ts

packages/correction/src/
  correction.test.ts
  openai-provider.test.ts
  
packages/lexical/src/
  lexical.test.ts
```

**Gaps de cobertura:**

1. **Sin test de integración end-to-end**: No hay un test que ejercite el ciclo completo: crear nota → editar en TipTap → autosave → sync → conflict → resolve. Los tests son unitarios y aislados.

2. **`correction-range.ts` necesita más casos extremos**: La función `applyCorrectionSuggestionToEditor` tiene casos edge importantes (pure insertion, multiline replacement, suggestion at block boundary). Los tests existentes cubren los casos básicos.

3. **Sin test de `emergency-draft.ts`**: La lógica de bootstrap que compara el draft de emergencia con la DB (`emergencyIsNewer`) tiene un test en `better-sqlite-repository.test.ts` para la función pura, pero no hay test del flujo completo en la app.

4. **Sin test de `auth.ts`**: La función `getSessionCookie` con el regex de parsing de set-cookie no tiene test. Es una función frágil.

5. **Sin test de migración de DB**: No hay test que verifique que una DB creada con una versión anterior del schema migra correctamente.

**Tests en Diario:**
El `package.json` de Diario tiene una batería extensa de scripts de test (`test:tiptap-core`, `test:admin-core`, etc.), indicando que la cobertura en el lado del servidor es más completa. Tiene tests específicos de TipTap (`test:tiptap-persistence-roundtrip`, `test:tiptap-replacement-readiness`, `test:tiptap-real-note-readiness`) que validan el mismo contrato que Continuum usa.

---

### 4.12 Preparación iOS/Android

**Estado actual: NO preparado.**

Los plugins de Tauri usados son:
- `tauri-plugin-sql` (SQLite vía better-sqlite3) — **no disponible en mobile sin reescritura**
- `tauri-plugin-store` (Tauri Store JSON) — **disponible en mobile**
- `tauri-plugin-fs` (FileSystem) — **disponible en mobile con paths restringidos**
- `tauri-plugin-http` (HTTP con unsafe-headers) — **disponible en mobile con limitaciones**

**Tauri Mobile** (Tauri 2 con feature `mobile`) permite compilar para iOS y Android pero:
1. El plugin SQL no tiene soporte mobile oficial estable.
2. Las capabilities de iOS requieren una estructura diferente.
3. `AppLocalData` tiene rutas distintas en iOS (dentro del sandbox de la app).
4. Las cookies de sesión HTTP tienen comportamiento diferente en mobile (no hay cookie jar del SO).

**Rutas alternativas para mobile:**
1. **Tauri Mobile + SQLite nativo**: Usar `rusqlite` directo en Rust + exponer commands Tauri. Requiere reescribir el acceso a la DB desde Rust en lugar de JS.
2. **Capacitor**: Migrar la UI a Capacitor + usar `@capacitor-community/sqlite`. Mantiene el mismo código React pero requiere cambiar los plugins.
3. **Web app como PWA**: Para iOS, la mejor opción a corto plazo es una Web App (PWA) usando IndexedDB o OPFS como storage. El contrato de datos (`@continuum/core`) es agnóstico de plataforma.

**Bloqueantes específicos:**
- `readTextFile`, `writeTextFile`, `mkdir` de `@tauri-apps/plugin-fs` → necesitan abstract de storage
- `load()` de `@tauri-apps/plugin-store` → puede reemplazarse con `localStorage` + cifrado en mobile
- `DraftSyncEngine` con `setInterval` → funciona en mobile pero necesita manejo de background
- `fetch` de `@tauri-apps/plugin-http` → en mobile se puede usar `fetch` nativo pero sin `unsafe-headers`

---

## 5. Hallazgos por Severidad

### CRÍTICO (bloquean seguridad o integridad de datos)

---

#### HALLAZGO C-01: CSP nula — XSS con acceso a APIs nativas Tauri

- **Severidad:** CRÍTICA
- **Archivo:** `apps/mac/src-tauri/tauri.conf.json`, línea 22: `"csp": null`
- **Explicación:** Sin Content Security Policy, cualquier código JavaScript inyectado en el webview (vía contenido de nota, renderizado sin sanitización, o vulnerabilidad en dependencia) puede invocar los comandos Tauri nativos, leer el filesystem, o exfiltrar secretos del store.
- **Riesgo actual:** Bajo en uso normal (no hay renderización de HTML arbitrario de notas). Pero si alguien importara una nota de Diario con contenido malicioso o si una dependencia npm tuviera XSS...
- **Recomendación:** Agregar CSP mínima: `"csp": "default-src 'self'; connect-src <dominios autorizados>; script-src 'self'; style-src 'self' 'unsafe-inline'"`.
- **Costo estimado:** 2 horas.
- **Orden:** Sprint 1.
- **Impacto:** Mac. Sin impacto en iOS/Android/Diario.
- **Tests recomendados:** Test E2E que intente ejecutar `window.__TAURI__` desde contenido inyectado.

---

#### HALLAZGO C-02: OpenAI API key en texto plano (Tauri Store JSON)

- **Severidad:** CRÍTICA
- **Archivos:** `apps/mac/src/preferences.ts` (líneas 7, 16, 31-33), `apps/mac/src/correction-client.ts` (línea 9)
- **Explicación:** La API key de OpenAI se guarda como string en `continuum-preferences.json` en `AppLocalData`. Este archivo es legible por cualquier proceso con acceso al directorio del usuario. En macOS, esto incluye procesos ejecutándose como el mismo usuario.
- **Riesgo actual:** Exposición de API key → cargos no autorizados en la cuenta de OpenAI.
- **Recomendación:** Usar `tauri-plugin-stronghold` o el Keychain nativo de macOS. El Keychain es la opción más apropiada para macOS. Para iOS/Android, Stronghold o el Keystore del SO.
- **Costo estimado:** 8-16 horas (integrar tauri-plugin-stronghold, cambiar el flow de write/read de API key).
- **Orden:** Sprint 1 (junto con C-01).
- **Impacto:** Mac. Define el approach para mobile desde el inicio.
- **Tests recomendados:** Test de integración que verifica que la API key NO aparece en texto plano en el filesystem.

---

#### HALLAZGO C-03: Session cookie de Diario en texto plano (Tauri Store JSON)

- **Severidad:** CRÍTICA
- **Archivo:** `apps/mac/src/auth.ts` (función `saveDiarioAuthSession`, líneas 47-51)
- **Explicación:** La cookie de sesión de Diario (que da acceso completo al admin: leer/escribir/publicar notas) se guarda en texto plano en `continuum-auth.json`. Es equivalente a guardar la contraseña en texto claro.
- **Riesgo actual:** Cualquier malware o proceso con acceso a AppLocalData puede robar la sesión y acceder al admin de Diario.
- **Recomendación:** Guardar la cookie en el Keychain de macOS (mismo enfoque que C-02). Opcionalmente, usar tokens de corta vida en lugar de cookies de larga duración.
- **Costo estimado:** 4 horas (parte del mismo trabajo que C-02).
- **Orden:** Sprint 1.
- **Impacto:** Mac + Diario (puede requerir cambios en el tiempo de vida de tokens en Diario).

---

### ALTO (degradan mantenibilidad o pueden causar bugs en producción)

---

#### HALLAZGO A-01: App.tsx de 3062 líneas sin separación de responsabilidades

- **Severidad:** ALTA
- **Archivo:** `apps/mac/src/App.tsx` (todo el archivo)
- **Explicación:** Un único componente React contiene todo el estado de la app (~40 useState), toda la lógica de negocio (sync, correction, conflict, trash, auth), todos los efectos secundarios (~15 useEffect) y todo el JSX de renderización (~700 líneas). Esto hace que:
  - Cualquier cambio puede tener efectos secundarios no aparentes.
  - Los re-renders de la raíz son costosos.
  - Los tests de componente son imposibles sin el entorno completo.
  - La incorporación de nuevas funcionalidades amplía un archivo ya difícil de razonar.
- **Riesgo actual:** Alto. Ya se han introducido bugs de interacción entre el estado de AI correction y el estado de sync (la lógica de `syncAiCorrectionWithSelection` interactúa con `editorRevision`, `aiPanelOpen`, `selectedId` y `persistAiCorrectionState`, todo en el mismo component).
- **Recomendación:** Extraer hooks custom por dominio:
  - `useNoteList(repo, folder)` → `notes, selectedId, setSelectedId, selectedNoteIds, ...`
  - `useNoteEditor(fullNote, repo, deviceId)` → `editor, livePayload, scheduleAutosave, runSave`
  - `useSyncEngine(repo, remote, deviceId)` → `syncStatus, conflicts, engineRef, flushDirty`
  - `useAiCorrection(editorRef, selectedId, correctionProvider)` → `aiCorrection, handleRunAiCorrection, handleApplyAiSuggestion`
  - `useLexicalLookup(editorRef)` → `lexicalLookup, startLexicalLookup`
- **Líneas eliminables (conservador):** 500 de App.tsx → movidas a hooks.
- **Líneas eliminables (agresivo):** 1200 de App.tsx → movidas a hooks + reducers.
- **Costo estimado:** 24-40 horas.
- **Orden:** Sprint 2 (después de los críticos de seguridad).
- **Impacto:** Solo Mac. Sin impacto en iOS/Android/Diario.
- **Tests recomendados:** Tests unitarios de cada hook custom.

---

#### HALLAZGO A-02: Estado de corrección sin reducer formal

- **Severidad:** ALTA
- **Archivo:** `apps/mac/src/App.tsx` (funciones `handleRunAiCorrection`, `syncAiCorrectionWithSelection`, `handleApplyAiSuggestion`, `handleApplyAllAiSuggestions`, `updateSuggestionInCorrectionState`, líneas ~1284-1538)
- **Explicación:** El estado `aiCorrection: ContinuumAiPanelCorrectionState` tiene transiciones de estado complejas (idle → loading → ready, ready → idle al cambiar nota, etc.) distribuidas en 6+ callbacks diferentes. Sin un reducer formal, es fácil introducir transiciones inválidas o estados inconsistentes. Por ejemplo: si `handleRunAiCorrection` se llama mientras hay un loading en curso, hay un abort del AbortController pero el `setAiCorrection` puede ser antiguo si el controller ya fue reemplazado.
- **Riesgo actual:** Hay casos de timing que pueden dejar el estado de corrección en `"loading"` indefinidamente si la nota se cambia exactamente entre el start y el response de la API.
- **Recomendación:** Implementar un `useReducer` con acciones explícitas (`START_CORRECTION`, `CORRECTION_READY`, `CORRECTION_ERROR`, `APPLY_SUGGESTION`, `SKIP_SUGGESTION`, `RESET`).
- **Costo estimado:** 12-16 horas.
- **Orden:** Sprint 2.
- **Tests recomendados:** Tests del reducer con escenarios de timing y edge cases.

---

#### HALLAZGO A-03: `saveNote` sin transacción explícita en storage

- **Severidad:** ALTA (potencial corrupción de índices)
- **Archivo:** `packages/storage/src/better-sqlite-repository.ts`, función `saveNote` (línea ~242)
- **Explicación:** Las operaciones `upsertNote.run(...)` + `rebuildIndexes(draft.id, draft)` + `enqueueSync(...)` no están envueltas en `db.transaction(...)`. Si `rebuildIndexes` falla (ej: constraint violation en `reference_index`), la nota ya fue persistida pero los índices quedan incorrectos. Con better-sqlite3 síncrono este riesgo es bajo, pero existe.
- **Riesgo actual:** Bajo en la práctica (las operaciones son simples inserts), pero la falta de transacción es una deuda que puede manifestarse en condiciones de carrera con el sync engine (que también hace queries a la DB).
- **Recomendación:** Envolver todo `saveNote` en `db.transaction(fn)`.
- **Costo estimado:** 2 horas.
- **Orden:** Sprint 1 (simple y bajo riesgo de introducir bugs).
- **Tests recomendados:** Test que fuerza un fallo en `rebuildIndexes` y verifica que la nota no se persiste.

---

#### HALLAZGO A-04: Duplicación de `StructuredNoteDraft/types.ts` entre repos

- **Severidad:** ALTA (riesgo de divergencia del contrato)
- **Archivos:**
  - `continuum/packages/core/src/structured-note-draft/types.ts`
  - `diario-de-ocurrencias/src/admin/structured-note-draft/types.ts`
- **Explicación:** Los tipos son idénticos a nivel de definición al momento de esta auditoría. Pero son mantenidos de forma independiente. Si se agrega un campo en uno sin actualizarlo en el otro, el contrato de sincronización se rompe silenciosamente (el campo es ignorado por el normalizador defensivo, pero no se propaga).
- **Riesgo actual:** Medio. Requiere coordinación manual en cada cambio de contrato.
- **Recomendación:** Publicar un paquete npm privado (o jsr) `@diario/shared-draft-contract` con los tipos y la lógica de normalización, y consumirlo en ambos repos. Alternativa más ligera: mantener un archivo de referencia en Diario y un script que compara las versiones.
- **Costo estimado:** 16-24 horas (publicar el paquete y migrar imports en ambos repos).
- **Orden:** Sprint 3.
- **Impacto:** Mac + Diario. Define la estrategia para mobile.

---

#### HALLAZGO A-05: No hay mecanismo de migración de schema SQLite

- **Severidad:** ALTA
- **Archivo:** `packages/storage/src/migrations.ts`
- **Explicación:** Solo existe `INITIAL_MIGRATION_SQL` con `CREATE TABLE IF NOT EXISTS`. No hay tabla de versión de schema ni mecanismo para `ALTER TABLE`. Si se agrega una columna en una versión nueva de la app, las instancias existentes con DB antigua no la tendrán y el código que asume la nueva columna fallará.
- **Riesgo actual:** No hay impacto hoy, pero al agregar FTS5 o cualquier nueva columna se convertirá en un bug de upgrade.
- **Recomendación:** Agregar una tabla `schema_migrations(version INTEGER)` y un array de migraciones ordenadas. En el bootstrap, aplicar solo las migraciones no aplicadas.
- **Costo estimado:** 8 horas.
- **Orden:** Sprint 2 (antes de necesitar agregar FTS5).

---

### MEDIO (degradan calidad o crean deuda técnica)

---

#### HALLAZGO M-01: `void asyncFn()` silencia errores

- **Severidad:** MEDIA
- **Archivo:** `apps/mac/src/App.tsx` (~30 ocurrencias de `void`)
- **Explicación:** Patrones como `void refreshList()`, `void refreshSyncStatus()`, `void writePreferences(...)` ignoran silenciosamente los errores de las promesas. Si `refreshList` falla (DB error), el usuario no ve ningún error y la lista queda desactualizada.
- **Recomendación:** Agregar `.catch(console.error)` como mínimo en los casos de fire-and-forget. Mejor aún: tratar los errores explícitamente en los hooks customizados.
- **Costo estimado:** 4 horas.
- **Orden:** Sprint 2.

---

#### HALLAZGO M-02: Parsing frágil de `set-cookie` header en `auth.ts`

- **Severidad:** MEDIA
- **Archivo:** `apps/mac/src/auth.ts`, función `getSessionCookie` (líneas 139-148)
- **Explicación:** El header `set-cookie` se parsea con `split(/,(?=[^;,]+=)/)`. Esto falla con cookies que tienen `Expires=` (que tiene `=` y puede contener comas en fechas como `Wed, 09 Jun 2021`). Aunque los navegadores modernos usan `max-age` en lugar de `Expires`, el parsing es frágil.
- **Recomendación:** Usar una librería de parsing de cookies o parsear el header línea por línea en lugar de split por coma.
- **Costo estimado:** 2 horas.

---

#### HALLAZGO M-03: `listRemoteDrafts` hace N+1 requests en fallback

- **Severidad:** MEDIA
- **Archivo:** `packages/sync/src/diario-http-draft-remote-client.ts`, función `listRemoteDrafts` (líneas 144-184)
- **Explicación:** Si el endpoint `/tiptap-drafts` no existe (404), se hace un request por cada nota de tipo draft. Con 50 notas son 51 requests en secuencia.
- **Recomendación:** Implementar el endpoint `/tiptap-drafts` en Diario (ya existe según el código de `getStructuredNoteDrafts` en `structured-note-draft-api-handlers.ts`) y eliminar el fallback individual una vez que el endpoint esté estable.
- **Costo estimado:** 4 horas (deprecar el fallback, no agregar más código en Diario).

---

#### HALLAZGO M-04: Nombre `remoteVersion` vs `remoteRevision` en el contrato

- **Severidad:** MEDIA
- **Archivos:** `packages/sync/src/diario-http-draft-remote-client.ts` (función `getRemoteVersionFromData`), `diario-de-ocurrencias/src/server/structured-note-draft-api-handlers.ts` (función `getDraftSyncPayload`)
- **Explicación:** El wire tiene `sync.remoteRevision`, `sync.remoteVersion`, y `remoteVersion` top-level, todos representando el mismo concepto. El cliente Continuum tiene lógica de normalización (`getRemoteVersionFromData`) que cubre todos los casos. Pero agregar un nuevo endpoint o respuesta requiere mantener esta lógica.
- **Recomendación:** Unificar en `remoteVersion` en toda la API y deprecar `remoteRevision`. Actualizar Diario para devolver solo `remoteVersion` en el campo `sync`.
- **Costo estimado:** 4 horas en Diario + 1 hora en Continuum.

---

#### HALLAZGO M-05: Sesión expirada no relanza re-login automático

- **Severidad:** MEDIA
- **Archivo:** `apps/mac/src/App.tsx` — el `DraftSyncEngine` no maneja 401
- **Explicación:** Si la sesión de Diario expira mientras la app está abierta, los syncs fallan con 401. La app muestra "Error sync Diario" en el label de sync pero no dirige al usuario al re-login. El usuario debe descubrir que necesita re-loggearse.
- **Recomendación:** En el callback `onError` del sync engine, detectar `DraftRemoteError` con `status === 401` y setear `authSession(null)` para forzar el flujo de re-login.
- **Costo estimado:** 4 horas.

---

#### HALLAZGO M-06: Sin validación de largo de texto en corrección IA

- **Severidad:** MEDIA
- **Archivo:** `packages/correction/src/openai-provider.ts`, función `correct` (línea 114)
- **Explicación:** No hay validación de `text.length` antes de enviar a OpenAI. Un texto de 50k caracteres puede generar >10k tokens y un error de la API o un costo inesperado.
- **Recomendación:** Agregar un límite configurable (ej: 8000 caracteres / ~2000 tokens) con un error de `CorrectionError` descriptivo si se supera.
- **Costo estimado:** 1 hora.

---

#### HALLAZGO M-07: `getTipTapDraftWarnings` duplica lógica de `core/validation.ts`

- **Severidad:** MEDIA
- **Archivos:** `packages/editor/src/tiptap-document.ts` (líneas 692-784), `packages/core/src/structured-note-draft/validation.ts` (líneas 8-53)
- **Explicación:** La función de warnings en el editor duplica la lógica de warnings del core (citas no resueltas, reference inserts sin referencia) y agrega warnings específicos del editor (duplicate-block-id, discontinuous-aphorism). Si se agrega un nuevo tipo de warning en el core, no se propagará automáticamente al editor.
- **Recomendación:** Hacer que `getTipTapDraftWarnings` llame a `getStructuredNoteDraftWarnings` del core y le agregue solo los warnings específicos del TipTap.
- **Costo estimado:** 2 horas.

---

### BAJA (deuda técnica menor o mejoras de calidad)

---

#### HALLAZGO B-01: `source.version: 1` sin mecanismo de migración

- **Severidad:** BAJA
- **Archivo:** `packages/core/src/structured-note-draft/types.ts` (línea 116)
- **Recomendación:** Documentar el versioning del contrato. Cuando llegue `version: 2`, agregar una función `migrateStructuredNoteDraft(v1: V1Draft): StructuredNoteDraft`.

---

#### HALLAZGO B-02: `StructuredNoteDraftCitation.anchor.offset` opcionalidad inconsistente

- **Severidad:** BAJA
- **Archivos:** `packages/core/src/domain-types.ts` (línea 112), `packages/core/src/structured-note-draft/types.ts` (línea 63)
- **Recomendación:** Unificar: en `StructuredNoteDraft` el offset debería ser requerido (siempre se calcula en la conversión).

---

#### HALLAZGO B-03: `rae-api.com` es API no oficial

- **Severidad:** BAJA
- **Archivo:** `apps/mac/src-tauri/capabilities/default.json` (línea 23)
- **Recomendación:** Documentar la dependencia. Considerar fallback o scraperless alternative (diccionario local).

---

#### HALLAZGO B-04: `pushDraft` no sube `tiptapJson`

- **Severidad:** BAJA (intencional hoy)
- **Archivo:** `packages/sync/src/diario-http-draft-remote-client.ts` (línea 188)
- **Recomendación:** Documentar explícitamente en el código que `tiptapJson` es local-only. Añadir un comentario en el contrato `DraftPushPayload` indicando que `tiptapJson` no se envía al servidor.

---

#### HALLAZGO B-05: No hay typing para `continuumBootstrapPrototype` retorno

- **Severidad:** BAJA
- **Referencia:** Usado en `App.tsx` líneas 1763, 2139, etc.
- **Recomendación:** Verificar que el retorno de `continuumBootstrapPrototype` tiene tipo explícito en `packages/editor/src/index.ts`.

---

#### HALLAZGO B-06: `emergency-draft.ts` sin validación del JSON leído

- **Severidad:** BAJA (alta frecuencia de crash potencial en bootstrap)
- **Archivo:** `apps/mac/src/emergency-draft.ts`, función `readEmergencyDraft` (línea 41)
- **Explicación:** `JSON.parse(raw) as EmergencyDraftFile` sin try/catch ni validación. Un crash durante el write del emergency draft puede dejar un JSON truncado.
- **Recomendación:** Envolver en try/catch y devolver `null` en caso de error.
- **Costo estimado:** 30 minutos.

---

## 6. Secciones especiales (puntos postergados)

### 6.1 Stronghold / Keychain para API key

**Estado:** No implementado. La API key y la sesión de Diario están en texto plano.

**Opciones técnicas:**

1. **`tauri-plugin-stronghold`** (Tauri oficial): Cifrado con clave maestra derivada de una contraseña (PBKDF2/Argon2). Requiere que el usuario ingrese una clave maestra al arrancar la app, o derivar la clave del Keychain del SO.

2. **`tauri-plugin-keychain`** (community): Acceso directo al Keychain de macOS / Credential Manager de Windows / Secret Service de Linux. Sin password adicional, usa las credenciales del SO.

3. **Enfoque recomendado**: Usar el Keychain nativo via `tauri-plugin-keychain` para API key y cookie de sesión. Es transparente para el usuario y usa la seguridad del SO.

**Plan de implementación:**
```
1. Agregar `tauri-plugin-keychain` a Cargo.toml
2. Crear `apps/mac/src/secrets.ts`:
   - writeSecret(key: string, value: string): Promise<void>
   - readSecret(key: string): Promise<string | null>
   - deleteSecret(key: string): Promise<void>
3. Reemplazar `store.set("openAiApiKey", ...)` por `writeSecret("openai-api-key", ...)`
4. Reemplazar `store.get("openAiApiKey")` por `readSecret("openai-api-key")`
5. Reemplazar auth session store por keychain
6. Migración: leer del store viejo, mover al keychain, borrar del store
```

### 6.2 Reducer / máquina de estados formal para UI correction

**Estado:** El estado de corrección usa múltiples `setState` anidados y callbacks interdependientes.

**Propuesta de reducer:**

```typescript
type AiCorrectionAction =
  | { type: 'START'; identity: AiCorrectionSelectionIdentity }
  | { type: 'READY'; result: CorrectionResult; identity: AiCorrectionSelectionIdentity }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' }
  | { type: 'APPLY_SUGGESTION'; suggestionId: string; result: ApplyCorrectionSuggestionResult; newMap: SelectionPlainTextMap }
  | { type: 'SKIP_SUGGESTION'; suggestionId: string }
  | { type: 'SELECTION_CHANGED'; identity: AiCorrectionSelectionIdentity }
  | { type: 'NOTE_CHANGED' }

function aiCorrectionReducer(
  state: ContinuumAiPanelCorrectionState,
  action: AiCorrectionAction
): ContinuumAiPanelCorrectionState
```

Las transiciones inválidas (ej: APPLY_SUGGESTION cuando status !== 'ready') devuelven el estado sin cambios y logean un warning.

### 6.3 Tests de integración TipTap completos

**Tests que faltan:**

1. **Roundtrip con aforismo multi-bloque + citas**: Crear un StructuredNoteDraft con aforismo de 3 bloques + 2 citas, convertir a TipTap, hacer una edición programática, convertir de vuelta, verificar que los IDs de bloque son estables y las citas están correctamente ancladas.

2. **Correction range con math y manual indent**: Seleccionar un bloque con `inlineMath` y `manualIndent`, verificar que `extractSelectionPlainTextMap` mapea correctamente y que `applyCorrectionSuggestionToEditor` no afecta los nodos no-text.

3. **Sync roundtrip (mock)**: Usar `MockDraftRemoteClient`, crear una nota, guardarla, sincronizarla, modificarla localmente, sincronizarla de nuevo, verificar `remoteVersion` y `syncState`.

4. **Conflict resolution**: Simular un conflicto (server remoteVersion > stored), verificar que se registra en `sync_conflicts`, que `resolveConflictUseRemote` aplica el draft remoto correctamente.

### 6.4 Mejor UX del diff de corrección

**Estado actual:** Las sugerencias se muestran como lista de (original → replacement) con botones "aplicar" y "omitir". No hay resaltado del texto en el editor.

**Mejoras posibles (postergadas):**
1. Resaltado inline en el editor de las sugerencias pendientes (usar el mecanismo de `aiSelectionHighlightPluginKey` ya existente, expandido para sugerencias individuales).
2. Preview de la sugerencia al hover (mostrar antes/después en un tooltip).
3. Agrupación de sugerencias por tipo (ortografía, puntuación, acentuación).
4. Contador de progreso (3/7 sugerencias aplicadas).

### 6.5 Seguridad semántica del corrector

**Estado actual:** No hay validación de que el texto corregido sea "conservador". El modelo puede reescribir frases completas si el prompt no lo impide suficientemente.

**Mejoras posibles:**
1. Calcular el ratio de cambio (changed_chars / total_chars). Si > 20%, mostrar advertencia.
2. Verificar que el número de párrafos no cambió (no se agregaron ni eliminaron saltos de bloque).
3. Verificar que las fórmulas matemáticas ($...$) no fueron modificadas (ya está en el prompt, pero verificación post-hoc).
4. Agregar un segundo paso de validación: enviar `original` y `corrected` a un prompt de "¿este cambio es conservador?" antes de mostrar las sugerencias.

### 6.6 Persistencia/cache de sesiones de corrección

**Estado actual:** Las sesiones de corrección se guardan en `aiCorrectionSessionsRef` (memoria) + `ai-correction-sessions.ts` (Tauri Store). Se escriben con debounce de 350ms.

**Hallazgos:**
- El store se escribe en el cleanup effect (`writeAiCorrectionSessions(aiCorrectionSessionsRef.current).catch(() => {})` — líneas 838-841 de App.tsx) para no perder sesiones al cerrar.
- `MAX_CORRECTION_SESSIONS = 120` es el límite en memoria.
- No hay expiración de sesiones por tiempo. Una sesión de corrección de hace 6 meses sigue en el store.

**Mejoras posibles:**
1. Expirar sesiones > 30 días en `normalizeCorrectionSessionRecords`.
2. Considerar mover las sesiones a SQLite (tabla `correction_sessions`) para queries más eficientes y evitar serialización/deserialización de JSON grande.

---

## 7. Tablas de análisis

### 7.1 Tabla de duplicaciones Continuum ↔ Diario

| Archivo | Continuum | Diario | Tipo de dup. | Riesgo |
|---|---|---|---|---|
| `StructuredNoteDraft` types | `packages/core/src/structured-note-draft/types.ts` | `src/admin/structured-note-draft/types.ts` | Copia exacta | ALTO — puede divergir |
| `normalizeStructuredNoteDraft` | `packages/core/src/structured-note-draft/normalization.ts` | `src/admin/structured-note-draft/normalization.ts` | Copia (verificar) | ALTO |
| `convertNoteToStructuredDraft` | `packages/core/src/structured-note-draft/conversion.ts` | `src/admin/structured-note-draft/conversion.ts` | Copia (verificar) | ALTO |
| `tiptap-document.ts` | `packages/editor/src/tiptap-document.ts` | `src/admin/tiptap-document.ts` | Similar/derivado | MEDIO |
| `aphorism-actions` | `packages/editor/src/aphorism-actions.ts` | `src/admin/tiptap-aphorism-actions.ts` | Similar | MEDIO |
| `editor-queries` | `packages/editor/src/editor-queries.ts` | `src/components/AdminTipTapEditorQueries.ts` | Similar | BAJO |
| `reference-actions` | `packages/editor/src/reference-actions.ts` | `src/admin/tiptap-autosave.ts` (parcial) | Parcial | BAJO |
| TipTap node types | `packages/editor/src/tiptap-types.ts` | `src/admin/tiptap-types.ts` | Similar | MEDIO |
| `domain-types.ts` (Note, Ref, Citation) | `packages/core/src/domain-types.ts` | `src/lib/types.ts` | Similar/derivado | MEDIO |

### 7.2 Tabla de deuda técnica

| ID | Área | Descripción | Severidad | Costo (h) | Sprint |
|---|---|---|---|---|---|
| C-01 | Seguridad | CSP nula | CRÍTICA | 2 | 1 |
| C-02 | Seguridad | OpenAI key en texto plano | CRÍTICA | 12 | 1 |
| C-03 | Seguridad | Session cookie en texto plano | CRÍTICA | 4 | 1 |
| A-01 | Arquitectura | App.tsx monolítico 3062 líneas | ALTA | 32 | 2 |
| A-02 | Arquitectura | Estado corrección sin reducer | ALTA | 14 | 2 |
| A-03 | Storage | saveNote sin transacción explícita | ALTA | 2 | 1 |
| A-04 | Contrato | StructuredNoteDraft duplicado | ALTA | 20 | 3 |
| A-05 | Storage | Sin migración de schema SQLite | ALTA | 8 | 2 |
| M-01 | Calidad | void silencia errores async | MEDIA | 4 | 2 |
| M-02 | Seguridad | Parsing de cookie frágil | MEDIA | 2 | 2 |
| M-03 | Sync | N+1 requests en listRemoteDrafts | MEDIA | 4 | 2 |
| M-04 | Contrato | remoteVersion vs remoteRevision | MEDIA | 5 | 3 |
| M-05 | UX | 401 no dispara re-login | MEDIA | 4 | 2 |
| M-06 | IA | Sin límite de largo en corrección | MEDIA | 1 | 2 |
| M-07 | Calidad | Duplicación de warnings logic | MEDIA | 2 | 2 |
| B-01 | Contrato | source.version sin migración | BAJA | 2 | 4 |
| B-02 | Tipado | offset inconsistente en Citation | BAJA | 1 | 4 |
| B-03 | Deps | rae-api.com no oficial | BAJA | - | 5 |
| B-06 | Robustez | emergency-draft sin validación | BAJA | 0.5 | 2 |

### 7.3 Tabla de riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Exfiltración de API key OpenAI | Baja (sin malware activo) | ALTO (cargos financieros) | Keychain (Sprint 1) |
| Exfiltración de sesión Diario | Baja | ALTO (acceso al contenido) | Keychain (Sprint 1) |
| XSS via contenido de nota → Tauri API | Muy baja (contenido controlado) | CRÍTICO | CSP (Sprint 1) |
| Divergencia silenciosa del contrato StructuredNoteDraft | Media (cada feature nueva) | ALTO (datos corruptos en sync) | Paquete compartido (Sprint 3) |
| DB sin migración → upgrade rompe la app | Alta (próxima feature) | ALTO (pérdida de datos) | Migración schema (Sprint 2) |
| App.tsx introduce bug de regresión en corrección/sync | Alta (cada PR) | MEDIO | Refactor hooks (Sprint 2) |
| Sesión de Diario expira sin re-login automático | Alta (sesión de 1h) | MEDIO (sync para) | Handler 401 (Sprint 2) |
| `rae-api.com` deja de funcionar | Media | BAJO (solo lookup léxico) | Fallback local |
| N+1 en import inicial con muchas notas | Baja (depende de # notas) | BAJO (lentitud) | Endpoint bulk ya existe |

### 7.4 Tabla de refactors posibles

| Refactor | Beneficio | Riesgo de introducir bug | Líneas eliminadas |
|---|---|---|---|
| Extraer `useNoteList` de App.tsx | Alto | Bajo | ~300 |
| Extraer `useSyncEngine` de App.tsx | Alto | Medio (manejo de refs) | ~250 |
| Extraer `useAiCorrection` de App.tsx | Alto | Medio | ~400 |
| Extraer `useLexicalLookup` de App.tsx | Medio | Bajo | ~80 |
| `useNoteEditor` con autosave | Alto | Alto (debounce/refs) | ~200 |
| Reducer para `aiCorrection` | Alto | Medio | ~100 (neto) |
| Unificar `getStructuredNoteDraftWarnings` | Bajo | Bajo | ~50 en editor |
| `saveNote` con transacción explícita | Medio (seguridad) | Muy bajo | 0 (solo refactor) |

### 7.5 Estimación de líneas eliminables

| Escenario | App.tsx | Otros archivos | Total |
|---|---|---|---|
| **Conservador**: extraer hooks sin reducer | -800 | +800 (hooks) | 0 neto, mejor organización |
| **Moderado**: hooks + reducer corrección | -1200 | +900 | -300 neto |
| **Agresivo**: hooks + reducer + simplificación JSX | -1600 | +1000 | -600 neto App.tsx |

La reducción real de código total es baja porque la lógica se mueve, no se elimina. El beneficio es de organización y testeabilidad, no de reducción de LOC.

**Líneas genuinamente eliminables** (código que puede desaparecer sin mover a otro lugar):
- `getRemoteVersionFromData` en el cliente HTTP: ~15 líneas → simplificado a 5 si se unifica el campo en el contrato (M-04).
- Lógica de normalización de conflicto payload en App.tsx: ~60 líneas → si el contrato de error de sync es más estricto.
- `getConflictRemoteVersion` + `getConflictRemoteDraft` + `parseConflictRemoteDraftValue`: ~80 líneas que podrían simplificarse con un contrato de error tipado.
- Duplicación de warnings en `tiptap-document.ts`: ~40 líneas (M-07).

**Total genuinamente eliminable (conservador):** ~195 líneas
**Total genuinamente eliminable (agresivo, incluyendo simplificación de contrato):** ~400 líneas

---

## 8. Qué NO refactorizar todavía

1. **`normalizeStructuredNoteDraft` en `packages/core`**: Es robusto, bien testeado, y defensivo. Cualquier cambio puede romper la compatibilidad con datos históricos. No tocar hasta tener un plan de versioning completo.

2. **El schema SQLite actual**: Aunque falta la tabla de migraciones, el schema existente funciona bien. Agregar migración sin cambiar las tablas existentes (solo agregar la infra de versionado).

3. **`DraftSyncEngine`**: La lógica de sync es correcta y tiene buenos tests. El `setInterval` + `inFlight` es un patrón válido. No refactorizar hasta tener una necesidad concreta (ej: mobile background handling).

4. **El LCS diff en `correction/src/diff.ts`**: El algoritmo es correcto y eficiente para el uso actual. No hay razón para cambiarlo.

5. **Los tipos de TipTap nodes custom** (aphorism, structuredParagraph, referenceInsert, inlineMath, manualIndent, segment mark, citation mark): El schema de extensiones está bien definido y es estable. Cambiarlo requeriría migración de todos los documentos guardados.

6. **`createBetterSqlNoteRepository`**: El API del repositorio es coherente y bien tipado. Lo que hay que cambiar es interno (transacciones), no la interfaz.

7. **`ContinuumAiPanel.tsx`** y **`ContinuumEditorMenu.tsx`**: Son componentes de UI relativamente simples. Esperar a que estén más estabilizados antes de refactorizar.

8. **El mecanismo de `VITE_*` env vars**: Funciona bien para el desarrollo y para configuración del modelo/cache. No complicar con un sistema más sofisticado.

---

## 9. Qué bloquear con tests antes de tocar

1. **Antes de refactorizar App.tsx** (A-01):
   - Test E2E de flujo completo: crear nota → editar → autosave → ver en lista
   - Test E2E: iniciar corrección → aplicar sugerencia → verificar cambio en editor
   - Test de integración del sync engine con mock de Diario

2. **Antes de cambiar el contrato StructuredNoteDraft** (A-04):
   - Test de roundtrip con todas las features: aforismo multi-bloque, citas ancladas, reference inserts, inline math, manual indent, literary break
   - Test de que una nota de Diario serializada hoy puede parsearse con el nuevo normalizador

3. **Antes de agregar migración de schema** (A-05):
   - Test que verifica que la DB "vieja" (solo con tablas actuales) migra correctamente a la nueva versión
   - Test que verifica idempotencia de las migraciones (correr dos veces no falla)

4. **Antes de mover secretos a Keychain** (C-02, C-03):
   - Test de que la migración de credenciales desde el store antiguo al keychain funciona sin pérdida
   - Test que verifica que el store antiguo se limpia después de migrar

5. **Antes de cambiar `pushDraft`** para incluir `tiptapJson`:
   - Test de que Diario acepta el campo sin romper nada (backward compatible)
   - Test de roundtrip: guardar con tiptapJson, leer, verificar que el TipTap es usable

---

## 10. Plan de implementación por batches

### Batch 1: Seguridad y bugs críticos (Sprint 1, ~20h)

| Tarea | Hallazgo | Horas |
|---|---|---|
| Agregar CSP mínima en `tauri.conf.json` | C-01 | 2h |
| Integrar `tauri-plugin-keychain` o Stronghold para API key | C-02 | 8h |
| Mover session cookie de Diario a Keychain | C-03 | 4h |
| Envolver `saveNote` en transacción explícita | A-03 | 2h |
| Agregar try/catch en `readEmergencyDraft` | B-06 | 0.5h |
| Agregar límite de largo de texto en `correct()` | M-06 | 1h |
| **Total** | | **17.5h** |

**Criterio de salida:** Sin secretos en texto plano. CSP activa. Transacciones en storage.

---

### Batch 2: Extracción de estado y reducers (Sprint 2, ~60h)

| Tarea | Hallazgo | Horas |
|---|---|---|
| Extraer `useNoteList` de App.tsx | A-01 | 8h |
| Extraer `useSyncEngine` de App.tsx | A-01 | 10h |
| Extraer `useAiCorrection` de App.tsx con reducer | A-01, A-02 | 16h |
| Extraer `useLexicalLookup` de App.tsx | A-01 | 4h |
| Implementar mecanismo de migraciones SQLite | A-05 | 8h |
| Agregar `.catch(console.error)` en fire-and-forget | M-01 | 4h |
| Handler 401 → setAuthSession(null) | M-05 | 4h |
| Parseo robusto de set-cookie | M-02 | 2h |
| Unificar `getTipTapDraftWarnings` con core | M-07 | 2h |
| **Total** | | **58h** |

**Criterio de salida:** App.tsx < 1200 líneas. Tests de hooks unitarios. Schema con versión.

---

### Batch 3: Contrato compartido Continuum/Diario (Sprint 3, ~24h)

| Tarea | Hallazgo | Horas |
|---|---|---|
| Auditar diferencias actuales entre los dos `types.ts` | A-04 | 2h |
| Crear paquete `@diario/shared-draft-contract` (o decidir alternativa) | A-04 | 8h |
| Migrar imports en Continuum | A-04 | 4h |
| Migrar imports en Diario | A-04 | 4h |
| Unificar `remoteVersion` / `remoteRevision` en API + cliente | M-04 | 6h |
| **Total** | | **24h** |

**Criterio de salida:** Ambos repos importan el contrato del mismo lugar. Tests de roundtrip actualizados.

---

### Batch 4: Tests de integración (Sprint 4, ~32h)

| Tarea | Horas |
|---|---|
| Test de integración de sync roundtrip con mock | 8h |
| Test de roundtrip TipTap completo con todas las features | 8h |
| Test de conflict resolution (keepLocal + useRemote + duplicate) | 6h |
| Test de correction range edge cases (math, indent, multiblock) | 6h |
| Test de schema migration (idempotencia + upgrade desde v0) | 4h |
| **Total** | **32h** |

**Criterio de salida:** Suite de integración en CI. Coverage de paths críticos > 80%.

---

### Batch 5: Preparación mobile (Sprint 5, ~60h)

| Tarea | Horas |
|---|---|
| Investigar y decidir estrategia mobile (Tauri Mobile vs Capacitor vs PWA) | 8h |
| Abstract de storage (interface `IStorageBackend` con implementaciones SQLite/OPFS) | 16h |
| Abstract de secrets (interface `ISecretsBackend` con Keychain/Stronghold) | 8h |
| Abstract de HTTP (`IFetchBackend` wrapping tauri-plugin-http / native fetch) | 8h |
| Prueba de concepto en iOS (si se decide Tauri Mobile o Capacitor) | 16h |
| Documentar decisiones en ADRs | 4h |
| **Total** | **60h** |

**Criterio de salida:** PoC funcionando en iOS. Interfaces bien definidas. Sin código específico de Tauri desktop en los paquetes de dominio.

---

### Batch 6: Limpieza final (Sprint 6, ~20h)

| Tarea | Horas |
|---|---|
| Agregar FTS5 para búsqueda full-text (con migración) | 12h |
| Deprecar fallback N+1 en `listRemoteDrafts` (si Diario bulk endpoint está estable) | 4h |
| Documentar ADRs de decisiones arquitectónicas | 4h |
| **Total** | **20h** |

**Criterio de salida:** Búsqueda implementada. Documentación al día.

---

## Apéndice A: Árbol de paquetes npm de Continuum

```
@continuum/mac (app)
├── @continuum/core          (sin deps externas)
├── @continuum/editor        
│   ├── @continuum/core
│   └── @tiptap/core
├── @continuum/storage       
│   ├── @continuum/core
│   └── better-sqlite3
├── @continuum/sync          
│   ├── @continuum/core
│   └── @continuum/storage
├── @continuum/correction    (sin deps externas)
└── @continuum/lexical       (sin deps externas)
```

Dependencias externas directas en `apps/mac`:
- `@tauri-apps/{api, plugin-fs, plugin-http, plugin-sql, plugin-store}` — Tauri 2
- `@tiptap/core` ^3.23.4
- `react` ^19.1.0
- `katex` ^0.16.46

## Apéndice B: Tecnologías clave de Diario

- **Framework:** Next.js 16.2.6 (App Router)
- **DB:** SQLite via `better-sqlite3` ^12.9.0 + Drizzle ORM ^0.45.2
- **Editor:** TipTap ^3.22.4 + TipTap React
- **Auth:** Sesión custom con cookies HTTPOnly
- **Testing:** scripts `.mjs` + tsx + Playwright para UI
- **TypeScript:** 6.0.3 (más nuevo que Continuum que usa ~5.8.3)

## Apéndice C: Campos de StructuredNoteDraft no en Continuum/core pero sí en el API de Diario

Los responses del endpoint `/tiptap-draft` incluyen campos adicionales no parte del StructuredNoteDraft base:
- `source: { kind: "local-note" | "new-structured-draft", noteId? }` — origen del draft
- `storage: { kind: "local-sqlite" | "memory", path }` — tipo de storage en Diario
- `sync: { remoteRevision, remoteVersion, updatedAt }` — estado de sync en Diario

Estos campos son del envelope de la respuesta, no del draft en sí. El cliente Continuum los extrae del envelope. Bien separados.

---

*Fin del reporte de auditoría. Generado automáticamente a partir de lectura directa del código en ambos repos.*
