import { GoogleGenAI, Type } from '@google/genai';

interface VercelReq {
  method?: string;
  body?: { base64Data?: string; mimeType?: string };
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
      return;
    }
    const { base64Data, mimeType } = req.body || {};
    if (!base64Data) {
      res.status(400).json({ error: 'Missing image payload.' });
      return;
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: base64Data,
            },
          },
          {
            text: 'Extract the visitor full name (if an ID card or badge is shown) and Indian vehicle registration plate number (if a vehicle plate is shown) from this image. Return empty strings if either is not visible.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'Visitor full name if visible, else empty string' },
            vehicle: { type: Type.STRING, description: 'Vehicle registration plate if visible, else empty string' },
          },
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.status(200).json({
      name: String(parsed.name || '').trim(),
      vehicle: String(parsed.vehicle || '').trim().toUpperCase(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to analyze image with Gemini AI.';
    res.status(500).json({ error: message });
  }
}
