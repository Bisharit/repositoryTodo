import { execSync } from "node:child_process";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(rootDir, "dist");

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.log("Building production bundle...");
  execSync("npm run build", { stdio: "inherit", cwd: rootDir });
}

const app = express();
app.use(express.static(distDir, { maxAge: "1h" }));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`SKmyTodo live at http://0.0.0.0:${port}`);
});
