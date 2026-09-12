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
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.post("/api/generate-quiz", async (req, res) => {
    try {
      const { course, topic, count } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "System Gemini API Key is missing." });
      }
      const ai = new import_genai.GoogleGenAI({ apiKey });
      let response;
      let retries = 3;
      let delay = 1e3;
      while (retries > 0) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: `Generate a trivia quiz about "${topic}" specifically aligned with the Ontario school curriculum for the course "${course}". Create exactly ${count} questions. Make sure the difficulty, terminology, and concepts are strictly appropriate for Ontario students taking this specific course.`,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    q: { type: import_genai.Type.STRING, description: "The trivia question" },
                    a: { type: import_genai.Type.STRING, description: "The answer to the question" },
                    pts: { type: import_genai.Type.INTEGER, description: "Points for this question (e.g. 100, 200, 300, 400)" }
                  },
                  required: ["q", "a", "pts"]
                }
              }
            }
          });
          break;
        } catch (e) {
          retries--;
          if (retries === 0 || e.status !== 503) {
            throw e;
          }
          console.log(`Gemini API high demand (503). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
      const rawData = JSON.parse(response?.text || "[]");
      const data = rawData.map((item) => ({ ...item, type: "q" }));
      res.json(data);
    } catch (error) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate questions" });
    }
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
