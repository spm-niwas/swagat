import { GoogleGenAI } from '@google/genai';

interface VercelReq {
  method?: string;
  body?: { guestName?: string; destination?: string; otp?: string; note?: string };
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
    const { guestName, destination, otp, note } = req.body || {};
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Write a warm, polite 2-sentence WhatsApp gate pass invitation for ${guestName || 'Guest'} visiting ${destination || 'SPM NIWAS'} at SPM NIWAS. Gate OTP is *${otp || '0000'}*. ${note ? 'Additional note: ' + note : ''}`,
    });
    res.status(200).json({ text: (response.text ?? '').trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate invite.';
    res.status(500).json({ error: message });
  }
}
