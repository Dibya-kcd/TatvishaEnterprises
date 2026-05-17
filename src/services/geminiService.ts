import { GoogleGenAI } from "@google/genai";

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

async function callGeminiProxy(prompt: string, fileData?: string, mimeType?: string) {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, fileData, mimeType })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'AI request failed');
  }
  return await response.json() as { text: string };
}

export async function extractInvoiceFromMedia(
  fileData: string, // base64
  mimeType: string
): Promise<ExtractionResult> {
  const prompt = `Extract purchase invoice details from this image/PDF.
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

  try {
    const data = await callGeminiProxy(prompt, fileData, mimeType);
    const text = data.text || "";
    const cleanText = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanText) as ExtractionResult;
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    return { error: error instanceof Error ? error.message : "AI extraction failed" };
  }
}

export async function extractInvoiceFromCSV(csvData: string): Promise<ExtractionResult> {
  const prompt = `Analyze this CSV data from a purchase invoice and extract details.
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
  2. Ensure all numerical values are numbers.`;

  try {
    const data = await callGeminiProxy(prompt + "\n\n" + csvData);
    const text = data.text || "";
    const cleanText = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanText) as ExtractionResult;
  } catch (error) {
    console.error("Gemini CSV Error:", error);
    return { error: error instanceof Error ? error.message : "AI CSV parsing failed" };
  }
}

export async function extractInvoiceFromText(text: string): Promise<ExtractionResult> {
  const prompt = `Analyze this purchase invoice text and extract details.
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
  2. Ensure all numerical values are numbers.`;

  try {
    const data = await callGeminiProxy(prompt + "\n\n" + text);
    const cleanText = (data.text || "").replace(/```json|```/g, "").trim();
    return JSON.parse(cleanText) as ExtractionResult;
  } catch (error) {
    console.error("Gemini Text Error:", error);
    return { error: error instanceof Error ? error.message : "AI text extraction failed" };
  }
}

export async function getEngagementTip(): Promise<string> {
  const prompt = "Give a very short, one-sentence business tip for a spice distributor (Tatvisha Enterprises) to improve dealer engagement or sales today.";
  try {
    const data = await callGeminiProxy(prompt);
    return data.text || "Focus on sampling your new premium spice blends to top-performing retailers.";
  } catch (error) {
    console.error("Gemini Tip Error:", error);
    return "Remind retailers about the upcoming festival season demand for high-quality spices.";
  }
}
