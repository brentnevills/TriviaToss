import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Schema } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post('/api/generate-quiz', async (req, res) => {
    try {
      const { course, topic, count } = req.body;
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is required' });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Generate a trivia quiz about "${topic}" specifically aligned with the Ontario school curriculum for the course "${course}". Create exactly ${count} questions. Make sure the difficulty, terminology, and concepts are strictly appropriate for Ontario students taking this specific course.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                q: { type: Type.STRING, description: "The trivia question" },
                a: { type: Type.STRING, description: "The answer to the question" },
                pts: { type: Type.INTEGER, description: "Points for this question (e.g. 100, 200, 300, 400)" }
              },
              required: ["q", "a", "pts"]
            }
          }
        }
      });

      const data = JSON.parse(response.text || '[]');
      res.json(data);
    } catch (error: any) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: error.message || 'Failed to generate questions' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
