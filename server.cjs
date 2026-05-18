var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = require("http");
var import_socket = require("socket.io");
var import_vite = require("vite");
var import_path = __toESM(require("path"), 1);
var import_url = require("url");
var import_genai = require("@google/genai");
var import_meta = {};
var __filename = (0, import_url.fileURLToPath)(import_meta.url);
var __dirname = import_path.default.dirname(__filename);
async function startServer() {
  const app = (0, import_express.default)();
  app.use(import_express.default.json({ limit: "10mb" }));
  const httpServer = (0, import_http.createServer)(app);
  const io = new import_socket.Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3e3;
  const genAI = new import_genai.GoogleGenAI(process.env.GEMINI_API_KEY || "");
  const MODEL_NAME = "gemini-1.5-flash";
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { prompt, fileData, mimeType } = req.body;
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });
      let result;
      if (fileData) {
        result = await model.generateContent([
          {
            inlineData: {
              data: fileData,
              mimeType
            }
          },
          { text: prompt }
        ]);
      } else {
        result = await model.generateContent(prompt);
      }
      const response = await result.response;
      res.json({ text: response.text() });
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
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
