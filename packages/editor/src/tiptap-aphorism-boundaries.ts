export type TipTapAphorismBlockBoundary = {
  aphorismId?: string | null
  position: number
}

export function getAphorismSeparationPositions(
  blocks: readonly TipTapAphorismBlockBoundary[],
  currentPosition: number,
) {
  const currentBlock = blocks.find((block) => block.position === currentPosition)
  const aphorismId = currentBlock?.aphorismId

  if (!aphorismId) {
    return []
  }

  const positions: number[] = []
  let collecting = false

  for (const block of blocks) {
    if (block.position === currentPosition) {
      collecting = true
    }

    if (!collecting) {
      continue
    }

    if (block.aphorismId !== aphorismId) {
      break
    }

    positions.push(block.position)
  }

  return positions
}
