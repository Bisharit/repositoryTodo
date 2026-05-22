import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(rootDir, "dist");
const indexPath = path.join(distDir, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error("Missing dist/index.html — run: npm run build");
  process.exit(1);
}

const app = express();
app.use(express.static(distDir, { maxAge: "1h" }));

app.get(/.*/, (_req, res) => {
  res.sendFile(indexPath);
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`SKmyTodo live at http://0.0.0.0:${port}`);
});
