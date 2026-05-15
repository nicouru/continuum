import type { TipTapJsonNode } from "./tiptap-types"

const blockNodeTypes = new Set([
  "aphorism",
  "doc",
  "paragraph",
  "referenceInsert",
  "structuredParagraph",
])

export function serializeTipTapClipboardNodesToPlainText(
  value:
    | TipTapJsonNode
    | TipTapJsonNode[]
    | null
    | undefined,
) {
  const nodes = Array.isArray(value) ? value : value ? [value] : []

  return serializeTipTapClipboardNodeList(nodes).trim()
}

function serializeTipTapClipboardNodeList(nodes: TipTapJsonNode[]) {
  const renderedNodes = nodes
    .map((node) => serializeTipTapClipboardNode(node))
    .filter((text) => text.length > 0)
  const hasBlockNodes = nodes.some((node) => blockNodeTypes.has(node.type))

  return renderedNodes.join(hasBlockNodes ? "\n\n" : "")
}

function serializeTipTapClipboardNode(node: TipTapJsonNode): string {
  if (node.type === "inlineMath") {
    return serializeInlineMathNode(node)
  }

  if (node.type === "manualIndent") {
    return "    "
  }

  if (node.type === "hardBreak") {
    return "\n"
  }

  if (node.type === "text") {
    return serializeTextNode(node)
  }

  if (!node.content?.length) {
    return ""
  }

  return serializeTipTapClipboardNodeList(node.content)
}

function serializeInlineMathNode(node: TipTapJsonNode) {
  const tex = getStringAttribute(node.attrs, "tex")

  return tex ? `$${tex}$` : ""
}

function serializeTextNode(node: TipTapJsonNode) {
  const citationNumber = getCitationNumber(node)

  return `${node.text ?? ""}${citationNumber ? `^${citationNumber}` : ""}`
}

function getCitationNumber(node: TipTapJsonNode) {
  const citation = node.marks?.find((mark) => mark.type === "citation")

  return getStringAttribute(citation?.attrs, "visibleNumber")
}

function getStringAttribute(
  attrs: Record<string, unknown> | undefined,
  key: string,
) {
  const value = attrs?.[key]

  return typeof value === "string" && value.trim() ? value : undefined
}
