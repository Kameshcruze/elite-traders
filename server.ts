import app from "./api/index";
import { createServer as createViteServer } from "vite";
import path from "path";
import express from "express";

const PORT = 3000;

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[Elite Traders Hub] Vite Dev server middleware is mounting on Express...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Elite Traders Hub] Serving static assets from /dist on Express...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Elite Traders Hub] Server started in mode '${process.env.NODE_ENV || "development"}'. Running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Elite Traders Hub] Failed to start local server:", err);
  process.exit(1);
});
