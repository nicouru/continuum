import { createId } from "./id";
import type { Experiment } from "./types";

const now = new Date().toISOString();

export function createDemoExperiment(): Experiment {
  return {
    id: createId(),
    title: "Demo — lectura prolongada",
    description:
      "Experimento de ejemplo para probar Canon Lab. Podés borrar los textos y variantes y cargar los tuyos.",
    createdAt: now,
    updatedAt: now,
    status: "draft",
    criteria: {
      readability30m: "¿Lo leería 30 minutos?",
      pretentiousness: "¿La letra se siente pretenciosa?",
      fontDominatesText: "¿La letra habla más que el texto?",
    },
    texts: [
      {
        id: createId(),
        content:
          "La tipografía no adorna el texto: lo sostiene. Cuando elegimos una fuente para lectura larga, estamos eligiendo cuánta fricción tendrá cada párrafo antes de llegar al sentido.",
        createdAt: now,
      },
      {
        id: createId(),
        content:
          "Un buen cuerpo tipográfico desaparece después del tercer párrafo. Si seguís notando la letra, algo en peso, interlineado o ancho está compitiendo con la idea.",
        createdAt: now,
      },
      {
        id: createId(),
        content:
          "Comparar variantes con textos reales evita decisiones estéticas vacías. La pregunta no es si la fuente es bonita, sino si aguanta treinta minutos de atención sin cansar.",
        createdAt: now,
      },
      {
        id: createId(),
        content:
          "Canon Lab existe para cerrar decisiones, no para abrir infinitas alternativas. Congelar una elección por treinta días obliga a vivir con ella antes de volver a dudar.",
        createdAt: now,
      },
      {
        id: createId(),
        content:
          "Cuando exportás CSS, llevás la decisión al producto. Variables claras, valores medidos y una sola variante ganadora: eso es lo que convierte una prueba en canon.",
        createdAt: now,
      },
    ],
    variants: [
      {
        id: createId(),
        label: "Lato 300",
        fontFamily: '"Lato", sans-serif',
        fontImportUrl:
          "https://fonts.googleapis.com/css2?family=Lato:wght@300&display=swap",
        fontWeight: 300,
        fontSizeRem: 1.05,
        lineHeight: 1.65,
        letterSpacingEm: 0,
        wordSpacingEm: 0,
        maxWidthRem: 42,
        color: "#1a1a1a",
      },
      {
        id: createId(),
        label: "Open Sans 350",
        fontFamily: '"Open Sans", sans-serif',
        fontImportUrl:
          "https://fonts.googleapis.com/css2?family=Open+Sans:wdth,wght@100..100,300..800&display=swap",
        fontWeight: 350,
        fontSizeRem: 1.05,
        lineHeight: 1.62,
        letterSpacingEm: 0.01,
        wordSpacingEm: 0,
        maxWidthRem: 42,
        color: "#1a1a1a",
        fontVariationSettings: '"wght" 350',
      },
      {
        id: createId(),
        label: "Source Sans 3 350",
        fontFamily: '"Source Sans 3", sans-serif',
        fontImportUrl:
          "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300..700&display=swap",
        fontWeight: 350,
        fontSizeRem: 1.05,
        lineHeight: 1.64,
        letterSpacingEm: 0.005,
        wordSpacingEm: 0,
        maxWidthRem: 42,
        color: "#1a1a1a",
        fontVariationSettings: '"wght" 350',
      },
      {
        id: createId(),
        label: "Newsreader 400",
        fontFamily: '"Newsreader", serif',
        fontImportUrl:
          "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400&display=swap",
        fontWeight: 400,
        fontSizeRem: 1.08,
        lineHeight: 1.6,
        letterSpacingEm: 0,
        wordSpacingEm: 0,
        maxWidthRem: 40,
        color: "#1f1f1f",
      },
      {
        id: createId(),
        label: "Google Sans Flex custom",
        fontFamily: '"Google Sans Flex", sans-serif',
        fontImportUrl:
          "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wdth,wght@8..144,25..151,1..1000&display=swap",
        fontWeight: 400,
        fontSizeRem: 1.05,
        lineHeight: 1.63,
        letterSpacingEm: 0.01,
        wordSpacingEm: 0.02,
        maxWidthRem: 42,
        color: "#1a1a1a",
        fontVariationSettings: '"wght" 420, "wdth" 100',
        notes: "Variable font con peso visual ~420.",
      },
    ],
    sessions: [],
  };
}
