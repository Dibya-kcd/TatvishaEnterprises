import { GoogleGenAI } from "@google/genai";

// Reads from .env as VITE_GEMINI_API_KEY (safe for GitHub Pages)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const MODEL_NAME = "gemini-1.5-flash";

export interface ExtractedItem {
  sku_or_name: string;
  quantity: number;
  pack_type: "unit" | "packet" | "case" | "kg" | "g" | "ml" | "ltr";
  cost_per_pack: number;
  expiry_date: string;
  extracted_multipliers?: {
    units_per_packet?: number;
    packets_per_case?: number;
  };
}

export interface ExtractionResult {
  invoice_number?: string;
  supplier_name?: string;
  invoice_date?: string;
  total_freight?: number;
  total_handling?: number;
  items?: ExtractedItem[];
  error?: string;
}

// ─── Shared JSON extraction prompt ───────────────────────────────────────────
const INVOICE_JSON_SCHEMA = `
Return JSON only:
{
  "invoice_number": string,
  "supplier_name": string,
  "invoice_date": "YYYY-MM-DD",
  "total_freight": number,
  "total_handling": number,
  "items": [
    {
      "sku_or_name": string,
      "quantity": number,
      "pack_type": "unit" | "packet" | "case" | "kg" | "g" | "ml" | "ltr",
      "cost_per_pack": number,
      "expiry_date": "YYYY-MM-DD",
      "extracted_multipliers": {
        "units_per_packet": number,
        "packets_per_case": number
      }
    }
  ]
}
Rules:
1. Normalize "pack_type" to one of: unit, packet, case, kg, g, ml, ltr.
2. For Spice/Distribution Packaging (Unit -> Pack -> Case):
   - Example: "[500 g x 32 pouchs x 1 case]" -> base size 500g, 32 units per case. Set units_per_packet=1, packets_per_case=32.
3. Ensure all numerical values are numbers.`;

// ─── Extract from image / PDF (base64) ───────────────────────────────────────
export async function extractInvoiceFromMedia(
  fileData: string, // base64
  mimeType: string
): Promise<ExtractionResult> {
  const prompt = `Extract purchase invoice details from this image/PDF.\n${INVOICE_JSON_SCHEMA}`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: fileData, mimeType } },
            { text: prompt },
          ],
        },
      ],
    });

    const text = response.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ExtractionResult;
  } catch (error) {
    console.error("Gemini Media Extraction Error:", error);
    return { error: error instanceof Error ? error.message : "AI extraction failed" };
  }
}

// ─── Extract from CSV text ────────────────────────────────────────────────────
export async function extractInvoiceFromCSV(csvData: string): Promise<ExtractionResult> {
  const prompt = `Analyze this CSV data from a purchase invoice and extract details.\n${INVOICE_JSON_SCHEMA}\n\n${csvData}`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    const text = response.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ExtractionResult;
  } catch (error) {
    console.error("Gemini CSV Error:", error);
    return { error: error instanceof Error ? error.message : "AI CSV parsing failed" };
  }
}

// ─── Extract from plain text ──────────────────────────────────────────────────
export async function extractInvoiceFromText(text: string): Promise<ExtractionResult> {
  const prompt = `Analyze this purchase invoice text and extract details.\n${INVOICE_JSON_SCHEMA}\n\n${text}`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    const raw = response.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ExtractionResult;
  } catch (error) {
    console.error("Gemini Text Error:", error);
    return { error: error instanceof Error ? error.message : "AI text extraction failed" };
  }
}

// ─── Engagement tip ───────────────────────────────────────────────────────────
export async function getEngagementTip(): Promise<string> {
  const prompt =
    "Give a very short, one-sentence business tip for a spice distributor (Tatvisha Enterprises) to improve dealer engagement or sales today.";
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    return response.text || "Focus on sampling your new premium spice blends to top-performing retailers.";
  } catch (error) {
    console.error("Gemini Tip Error:", error);
    return "Remind retailers about the upcoming festival season demand for high-quality spices.";
  }
}

// ─── AI Coach chat ────────────────────────────────────────────────────────────
export async function getAICoachResponse(
  userMessage: string,
  context: string
): Promise<string> {
  const prompt = `You are an AI business coach for Tatvisha Enterprises, a spice distribution company.
Context: ${context}
User question: ${userMessage}
Give a concise, practical answer in 2-3 sentences.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    return response.text || "I'm here to help. Could you rephrase your question?";
  } catch (error) {
    console.error("Gemini Coach Error:", error);
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
}
