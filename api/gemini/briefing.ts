import { GoogleGenAI } from '@google/genai';

interface VercelReq {
  method?: string;
  body?: { totalLogs?: number; officeInside?: number; resInside?: number; pendingCount?: number };
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
    const { totalLogs = 0, officeInside = 0, resInside = 0, pendingCount = 0 } = req.body || {};
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Provide a concise 3-bullet executive security briefing for SPM NIWAS campus based on today's live metrics: Total logs today: ${totalLogs}, Corporate Office inside: ${officeInside}, Residential Wing inside: ${resInside}, Pending gate approvals: ${pendingCount}. Keep each bullet sharp and actionable.`,
    });
    res.status(200).json({ text: (response.text ?? '').trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate security briefing.';
    res.status(500).json({ error: message });
  }
}
