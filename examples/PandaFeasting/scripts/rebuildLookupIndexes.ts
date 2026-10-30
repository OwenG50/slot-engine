import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { lookupIndex } from "../src/lookupIndex"
import { MODES } from "../src/settings"

const build = path.resolve(__dirname, "../__build__")
for (const mode of Object.keys(MODES)) {
  const text = readFileSync(
    path.join(build, "publish_files", `lookUpTable_${mode}_0.csv`),
    "utf8",
  )
  writeFileSync(path.join(build, `lookUpTable_${mode}.index`), lookupIndex(text))
}
console.log("Regenerated all seven lookup indexes from final published CSVs.")
