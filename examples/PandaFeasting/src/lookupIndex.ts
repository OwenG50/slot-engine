/** Byte offsets used by the engine to read published CSV lookup rows. */
export function lookupIndex(text: string): Buffer {
  const offsets: number[] = []
  let offset = 0
  for (const line of text.split("\n")) {
    if (line.trim()) offsets.push(offset)
    offset += Buffer.byteLength(line + "\n", "utf8")
  }
  const index = Buffer.alloc(offsets.length * 8)
  offsets.forEach((value, row) => index.writeBigUInt64LE(BigInt(value), row * 8))
  return index
}
