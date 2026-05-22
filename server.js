import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(rootDir, "dist");
const rootIndex = path.join(rootDir, "index.html");
const distIndex = path.join(distDir, "index.html");

const staticDir = fs.existsSync(distIndex) ? distDir : rootDir;
const indexPath = fs.existsSync(distIndex) ? distIndex : rootIndex;

if (!fs.existsSync(indexPath)) {
  console.error("Missing index.html — run: npm run build");
  process.exit(1);
}

const app = express();
app.use(express.static(staticDir, { maxAge: "1h" }));
if (staticDir !== rootDir) {
  app.use(express.static(rootDir, { maxAge: "1h" }));
}

app.get(/.*/, (_req, res) => {
  res.sendFile(indexPath);
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`SKmyTodo live at http://0.0.0.0:${port} (static: ${staticDir})`);
});
