# Canon Lab

Canon Lab es un laboratorio tipográfico para decidir una fuente de lectura prolongada usando textos reales, comparación ciega y votos ponderados. El objetivo del MVP es **cerrar decisiones**, no explorar infinitas combinaciones.

## Qué hace

- Crear experimentos tipográficos con textos reales y variantes editables.
- Comparar variantes en modo ciego (sin mostrar el nombre de la fuente).
- Puntuar cada combinación texto × variante con tres criterios (1–5).
- Ver ranking agregado con score calculado.
- Elegir ganadora, congelar la decisión por 30 días y exportar CSS.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abrí [http://localhost:3001](http://localhost:3001).

> Si el puerto 3000 ya lo usa otro proyecto (p. ej. Diario), Canon Lab usa **3001** por defecto.

### Validación

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Dónde se guardan los datos

Persistencia local en JSON (sin base de datos):

```txt
data/canon-lab/experiments.json
```

- Se crea automáticamente al primer acceso.
- Si no existe, se genera un experimento demo con 5 textos y 5 variantes editables.
- Las escrituras usan archivo temporal + rename para evitar corrupción.
- Si el JSON está corrupto, la app muestra un error claro (no crashea en silencio).

## Cómo agregar fuentes

1. Abrí un experimento → **Nueva variante** (o editá una existente).
2. Completá `fontFamily` y, si hace falta, `fontImportUrl` (por ejemplo Google Fonts).
3. Ajustá peso, tamaño, interlineado, tracking, word spacing, ancho y color.
4. Usá la vista previa con un texto real del experimento.

## Flujo manual verificado (MVP)

1. Crear experimento (`/experiments/new`).
2. Agregar textos reales en la página del experimento.
3. Agregar o editar variantes tipográficas.
4. **Iniciar comparación ciega** → votar todos los criterios para cada variante y texto.
5. **Terminar sesión** (exige votos completos).
6. **Ver resultados** → ranking con nombres reales de fuente.
7. Elegir ganadora y nota de decisión.
8. **Congelar por 30 días** (requiere votos y ganadora).
9. **Exportar CSS** desde la página de exportación.
10. Recargar el navegador y confirmar que todo persiste en `data/canon-lab/experiments.json`.

## Exportar CSS

Con variante ganadora definida, abrí `/experiments/[id]/export`. El bloque incluye variables `:root` y clase `.body-text`, más `font-variation-settings` si aplica.

## Fórmula de score

```txt
score = readability30m - pretentiousness * 0.65 - fontDominatesText * 0.8
```

## Limitaciones del MVP

- Sin autenticación ni multiusuario.
- Sin base de datos (solo JSON local en disco).
- Sin analytics ni servicios externos (excepto cargar fuentes vía URL que vos configures).
- Una sesión ciega abierta por vez; para otra ronda, terminá la sesión actual.
- El peso tipográfico 350 depende de fuentes variables (Open Sans / Source Sans 3); en fuentes sin ese eje, el navegador aproxima.
- Congelar bloquea edición; no hay descongelar automático al vencer los 30 días (solo referencia visual de `freezeUntil`).
