export type TipTapJsonMark = {
  attrs?: Record<string, unknown>
  type: string
}

export type TipTapJsonNode = {
  attrs?: Record<string, unknown>
  content?: TipTapJsonNode[]
  marks?: TipTapJsonMark[]
  text?: string
  type: string
}
