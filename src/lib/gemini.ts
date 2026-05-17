import { GoogleGenAI } from "@google/genai";

// Use a robust way to get the API key that works in both dev and production
// System-provided keys are usually in process.env, while user-provided Vite keys start with VITE_
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : "") || "";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export async function getDailyAffirmation() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: "Generate a short, powerful mindfulness affirmation for today. Keep it under 15 words.",
    });
    return response.text || "Focus on the present moment.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The path to focus starts with a single breath.";
  }
}

export async function prioritizeTasks(tasks: string[]) {
  try {
    const prompt = `Here are some tasks: ${tasks.join(", ")}. Prioritize them based on productivity and well-being. Return a JSON array of strings in order of importance.`;
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    return JSON.parse(response.text || "[]") as string[];
  } catch (error) {
    console.error("Gemini Error:", error);
    return tasks;
  }
}
