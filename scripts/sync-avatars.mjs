// Copies characters/<id>/avatar.* into public/characters/<id>/ so Next.js
// can serve them as static assets. characters/ stays the single source of
// truth per the architecture (adding a folder there is enough — no code
// changes needed); this script just mirrors what Next requires.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const charactersDir = path.join(root, "characters");
const publicCharactersDir = path.join(root, "public", "characters");

if (!fs.existsSync(charactersDir)) {
  process.exit(0);
}

const ids = fs.readdirSync(charactersDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const id of ids) {
  const srcDir = path.join(charactersDir, id);
  const files = fs.readdirSync(srcDir).filter((f) => /^avatar\.(jpg|jpeg|png|webp)$/i.test(f));
  if (files.length === 0) continue;

  const destDir = path.join(publicCharactersDir, id);
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

console.log(`[sync-avatars] synced ${ids.length} character folder(s) into public/characters/`);
