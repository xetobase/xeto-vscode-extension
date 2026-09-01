// Sweep all .xeto/.xetod files through the extension's compiled parser
// and report parse-level diagnostics. Usage: node scripts/parse-sweep.js <dir>...
const fs = require("fs");
const path = require("path");
const { ProtoCompiler } = require("../server/out/compiler/Compiler");

function collect(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (/\.xetod?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const roots = process.argv.slice(2);
const files = roots.flatMap((r) => collect(r, []));

let bad = 0;
for (const file of files) {
  const compiler = new ProtoCompiler(file);
  try {
    compiler.run(fs.readFileSync(file, "utf8"));
  } catch (e) {
    bad++;
    console.log(`CRASH ${file}: ${e.message}`);
    continue;
  }
  if (compiler.errs.length > 0) {
    bad++;
    console.log(`${file}`);
    for (const err of compiler.errs) {
      console.log(`  [${err.loc?.line + 1}:${err.loc?.col}] ${err.message}`);
    }
  }
}
console.log(`\n${files.length} files parsed, ${bad} with errors`);
