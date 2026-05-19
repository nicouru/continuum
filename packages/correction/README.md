# Continuum AI Correction

Paquete de corrección ortográfica y gramatical conservadora para Continuum. La UI
de Mac consume `CorrectionProvider` y no depende directamente de OpenAI.

## Arquitectura

1. **Proveedor** (`OpenAiCorrectionProvider`): llama a la [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) con [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
2. **Diff local** (`diff.ts`, `suggestions.ts`): compara `originalText` y `correctedText` en el cliente; no se confían offsets del modelo.
3. **Editor** (`@continuum/editor`, `correction-range.ts`): mapea la selección TipTap a texto plano y aplica sugerencias de forma segura (stale/unsafe).

El texto seleccionado por el usuario **solo** va en `input` (rol `user`). Las instrucciones del sistema y el esquema JSON son constantes y van al inicio del prefijo cacheable.

## Variables de entorno (app Mac)

| Variable | Obligatoria | Default | Descripción |
|----------|-------------|---------|-------------|
| `VITE_OPENAI_API_KEY` | No | — | Clave de API OpenAI para builds/dev. En la app Mac también puede cargarse desde el panel de corrección y se guarda localmente. |
| `VITE_OPENAI_CORRECTION_MODEL` | No | `gpt-5.4-mini` | Modelo de la Responses API |
| `VITE_OPENAI_PROMPT_CACHE_KEY` | No | `continuum-ai-correction-v1` | Clave estable para [prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) |
| `VITE_OPENAI_PROMPT_CACHE_RETENTION` | No | *(omitido)* | `in-memory` o `24h`; si falta o es inválido, se omite y OpenAI usa el default. Por compatibilidad, `in_memory` se normaliza a `in-memory`. |

Configurá las variables en `apps/mac/.env` o en el entorno de build. Para probar la app ya instalada, abrí el panel de corrección (`Cmd+Shift+8`) y pegá la API key en el cuadro de configuración local.

## Prompt caching

OpenAI cachea prefijos **idénticos** del prompt (instrucciones + esquema + formato). Continuum:

- Mantiene `SYSTEM_INSTRUCTION` y `CORRECTION_RESPONSE_JSON_SCHEMA` estables.
- Envía `prompt_cache_key` en cada request (default `continuum-ai-correction-v1`).
- Opcionalmente envía `prompt_cache_retention` solo si configurás `VITE_OPENAI_PROMPT_CACHE_RETENTION` (`in-memory` o `24h`). **No** se habilita `24h` por defecto.
- Coloca el texto seleccionado **al final** (`input`), sin IDs de nota, títulos, cursor ni estado de UI en el prefijo.

El caching reduce costo/latencia de tokens de entrada; **no** reutiliza respuestas anteriores. Los prompts &lt; 1024 tokens pueden reportar `cached_tokens: 0`.

## Forma del request (Responses API)

```json
{
  "model": "gpt-5.4-mini",
  "instructions": "<SYSTEM_INSTRUCTION constante>",
  "prompt_cache_key": "continuum-ai-correction-v1",
  "prompt_cache_retention": "in-memory",
  "input": [
    {
      "role": "user",
      "content": [{ "type": "input_text", "text": "<texto seleccionado>" }]
    }
  ],
  "text": {
    "format": {
      "type": "json_schema",
      "name": "continuum_correction",
      "strict": true,
      "schema": { "corrected_text", "warnings" }
    }
  }
}
```

`prompt_cache_retention` solo se incluye si está configurado en el entorno.

## Respuesta y métricas de uso

El modelo devuelve JSON estricto (`corrected_text`, `warnings`). Opcionalmente, `CorrectionResult.usage` incluye:

- `inputTokens` ← `usage.input_tokens`
- `cachedInputTokens` ← `usage.input_tokens_details.cached_tokens` o `usage.prompt_tokens_details.cached_tokens`
- `outputTokens` ← `usage.output_tokens`
- `totalTokens` ← `usage.total_tokens`
- `model`, `promptCacheKey`, `promptCacheRetention`

Si OpenAI omite `usage`, el proveedor no falla. En la app, esto aparece en un `<details>` discreto «Uso de la API» en el panel izquierdo.

## Por qué diff local

Los offsets que devuelven los LLM sobre texto editado no son fiables en documentos con marcas TipTap. Continuum calcula un diff por tokens (palabras/espacios) y genera sugerencias con offset en el texto plano de la selección.

## Limitaciones conocidas

- Las fórmulas inline se envían como texto protegido estilo `$...$`; si el modelo intenta cambiarlas, la sugerencia queda `unsafe`.
- Las citas/superíndices como marks y los bloques `referenceInsert` ya no bloquean la corrección; al aplicar cambios se preservan las marks originales del texto.
- Aplicar una sugerencia requiere un único segmento de texto mapeable; si cruza fórmula, salto estructural o varios segmentos, queda `unsafe`.
- Si el documento cambia tras la corrección, sugerencias pendientes pasan a `stale`.
- «Aplicar todas» solo si todas las pendientes son seguras.
- No se envía contexto de nota al modelo (solo el fragmento seleccionado).

## Validación

Desde la raíz del monorepo:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @continuum/mac tauri build --bundles app
```

## Instalar la app en macOS

```bash
# Cerrar Continuum si está abierto
rm -rf /Applications/Continuum.app
cp -R apps/mac/src-tauri/target/release/bundle/macos/Continuum.app /Applications/
open /Applications/Continuum.app
```

## Atajo en la app

`Cmd+Shift+8` abre el panel de corrección (ver `apps/mac/src/App.tsx`).
