type TransferEntry = {
  kind?: string
  type?: string
}

type IndexedTransferList<T extends TransferEntry> = {
  length: number
  [index: number]: T | null | undefined
}

type TransferPayload = {
  files?: IndexedTransferList<TransferEntry> | readonly TransferEntry[] | null
  items?: IndexedTransferList<TransferEntry> | readonly TransferEntry[] | null
}

export function shouldBlockTipTapMediaTransfer(payload: TransferPayload | null) {
  return hasImageEntry(payload?.items) || hasImageEntry(payload?.files)
}

function hasImageEntry(
  entries:
    | IndexedTransferList<TransferEntry>
    | readonly TransferEntry[]
    | null
    | undefined,
) {
  if (!entries) {
    return false
  }

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]

    if (entry?.type?.toLowerCase().startsWith("image/")) {
      return true
    }
  }

  return false
}
