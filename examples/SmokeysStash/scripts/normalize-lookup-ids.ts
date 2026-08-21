import fs from "fs"
import path from "path"
import readline from "readline"

const gameRoot = path.resolve(__dirname, "..")
const buildDir = path.join(gameRoot, "__build__")
const publishDir = path.join(buildDir, "publish_files")

function isTopLevelLookupTable(fileName: string): boolean {
  return /^lookUpTable_.+\.csv$/.test(fileName)
}

function isPublishLookupTable(fileName: string): boolean {
  return /^lookUpTable_.+_0\.csv$/.test(fileName)
}

async function getFirstId(filePath: string): Promise<number | null> {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" })
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  })

  for await (const rawLine of rl) {
    const line = rawLine.trim()
    if (!line) continue

    const comma = line.indexOf(",")
    if (comma === -1) break

    const id = Number(line.slice(0, comma))
    if (Number.isInteger(id)) {
      rl.close()
      stream.destroy()
      return id
    }
    break
  }

  rl.close()
  stream.destroy()
  return null
}

async function normalizeLookupIds(filePath: string): Promise<"normalized" | "skipped"> {
  if (!fs.existsSync(filePath)) return "skipped"

  const firstId = await getFirstId(filePath)
  if (firstId === null || firstId === 0) return "skipped"

  const tempPath = `${filePath}.tmp`
  const readStream = fs.createReadStream(filePath, { encoding: "utf8" })
  const rl = readline.createInterface({
    input: readStream,
    crlfDelay: Infinity,
  })
  const writeStream = fs.createWriteStream(tempPath, { encoding: "utf8" })

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim()
      if (!line) {
        writeStream.write("\n")
        continue
      }

      const comma = line.indexOf(",")
      if (comma === -1) {
        writeStream.write(`${line}\n`)
        continue
      }

      const id = Number(line.slice(0, comma))
      if (!Number.isInteger(id)) {
        writeStream.write(`${line}\n`)
        continue
      }

      const normalizedId = id - firstId
      writeStream.write(`${normalizedId}${line.slice(comma)}\n`)
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end((err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    fs.renameSync(tempPath, filePath)
    return "normalized"
  } catch (error) {
    writeStream.destroy()
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    throw error
  }
}

async function main() {
  const targets: string[] = []

  if (fs.existsSync(buildDir)) {
    for (const name of fs.readdirSync(buildDir)) {
      if (isTopLevelLookupTable(name)) {
        targets.push(path.join(buildDir, name))
      }
    }
  }

  if (fs.existsSync(publishDir)) {
    for (const name of fs.readdirSync(publishDir)) {
      if (isPublishLookupTable(name)) {
        targets.push(path.join(publishDir, name))
      }
    }
  }

  let normalizedCount = 0
  for (const target of targets) {
    const result = await normalizeLookupIds(target)
    if (result === "normalized") normalizedCount += 1
  }

  console.log(
    `[normalize-lookup-ids] Processed ${targets.length} files, normalized ${normalizedCount} file(s).`,
  )
}

main().catch((error) => {
  console.error("[normalize-lookup-ids] Failed:", error)
  process.exit(1)
})
