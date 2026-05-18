// server.ts
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3e3;
  const MODEL_NAME = "gemini-1.5-flash";
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(503).json({ error: "AI generation is not configured" });
        return;
      }
      const genAI = new GoogleGenAI({ apiKey });
      const { prompt, fileData, mimeType } = req.body;
      const contents = fileData ? [
        {
          inlineData: {
            data: fileData,
            mimeType
          }
        },
        { text: prompt }
      ] : prompt;
      const result = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents
      });
      res.json({ text: result.text });
    } catch (error) {
      console.error("Gemini Proxy Error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "AI generation failed" });
    }
  });
  let boardState = {
    columns: [
      { id: "todo", title: "To Do", taskIds: ["task-1", "task-2"] },
      { id: "in-progress", title: "In Progress", taskIds: [] },
      { id: "done", title: "Done", taskIds: [] }
    ],
    tasks: {
      "task-1": { id: "task-1", content: "Design the UI" },
      "task-2": { id: "task-2", content: "Implement real-time sync" }
    }
  };
  app.get("/api/board", (req, res) => {
    res.json(boardState);
  });
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    socket.emit("board-update", boardState);
    socket.on("update-board", (newState) => {
      boardState = newState;
      socket.broadcast.emit("board-update", boardState);
    });
    socket.on("create-task", ({ columnId, content }) => {
      const taskId = `task-${Date.now()}`;
      boardState.tasks[taskId] = { id: taskId, content };
      const col = boardState.columns.find((c) => c.id === columnId);
      if (col) {
        col.taskIds.push(taskId);
      }
      io.emit("board-update", boardState);
    });
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
  if (process.env.NODE_ENV === "development") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.mjs.map
