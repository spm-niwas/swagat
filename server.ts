import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const SUPERADMIN_EMAIL = 'director@spmniwas.in';
const DATA_DIR = path.resolve(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'swagat-db.json');

interface DirectoryEntry {
  id: string;
  zone: 'SUPERADMIN' | 'GUARD' | 'OFFICE' | 'RESIDENTIAL' | 'ADMIN';
  unit: string;
  name: string;
  email?: string;
  phone: string;
  pin: string;
  pinMustChange: boolean;
  pinResetRequested: boolean;
  isFamilyMember?: boolean;
  isPrimaryHost?: boolean;
}

interface VisitorRecord {
  id: string;
  visitorName: string;
  visitorPhone: string;
  visitorType: string;
  zone: 'OFFICE' | 'RESIDENTIAL';
  destination: string;
  hostPhone?: string;
  vehicleNumber: string;
  passCode: string;
  status: 'PENDING' | 'PRE_APPROVED' | 'APPROVED' | 'DENIED' | 'CHECKED_OUT';
  createdAt: number;
  timeLabel: string;
}

interface GeofenceConfig {
  enabled: boolean;
  lat: number | null;
  lng: number | null;
  radiusMeters: number;
}

interface DatabaseSchema {
  visitors: VisitorRecord[];
  directory: DirectoryEntry[];
  housingUnits: string[];
  geofence: GeofenceConfig;
  branding: { logoDataUrl: string };
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizePhone(raw: string): string {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function createSeedDatabase(): DatabaseSchema {
  const now = Date.now();
  return {
    directory: [
      { id: 'dir_superadmin_1', zone: 'SUPERADMIN', unit: 'Director Office', name: 'Director SPM NIWAS', email: SUPERADMIN_EMAIL, phone: SUPERADMIN_EMAIL, pin: '0000', pinMustChange: false, pinResetRequested: false },
      { id: 'dir_guard_1', zone: 'GUARD', unit: 'Main Gate', name: 'Ramesh Singh', phone: '9000000001', pin: '1111', pinMustChange: false, pinResetRequested: false },
      { id: 'dir_1', zone: 'OFFICE', unit: 'IT Dept (Floor 2)', name: 'Rahul Sharma', phone: '9876543210', pin: '2222', pinMustChange: false, pinResetRequested: false },
      { id: 'dir_5', zone: 'RESIDENTIAL', unit: 'Flat A-402', name: 'Rahul Sharma', phone: '9876543210', pin: '2222', pinMustChange: false, pinResetRequested: false },
      { id: 'dir_2', zone: 'OFFICE', unit: 'HR & Admin (Floor 1)', name: 'Priya Nair', phone: '9822233344', pin: '4444', pinMustChange: false, pinResetRequested: false },
      { id: 'dir_3', zone: 'OFFICE', unit: 'Finance Wing (Floor 3)', name: 'Amitabh Roy', phone: '9833344455', pin: '5555', pinMustChange: false, pinResetRequested: false },
      { id: 'dir_4', zone: 'OFFICE', unit: 'Executive Lounge', name: 'Reception', phone: '9844455566', pin: '6666', pinMustChange: false, pinResetRequested: false },
      { id: 'dir_6', zone: 'RESIDENTIAL', unit: 'Flat B-105', name: 'Dr. Anita Sen', phone: '9811122233', pin: '3333', pinMustChange: false, pinResetRequested: false },
      { id: 'dir_7', zone: 'RESIDENTIAL', unit: 'Flat A-201', name: 'K. Subramanian', phone: '9855566677', pin: '7777', pinMustChange: false, pinResetRequested: false },
      { id: 'dir_8', zone: 'RESIDENTIAL', unit: 'Flat B-304', name: 'Neha Kapoor', phone: '9866677788', pin: '8888', pinMustChange: false, pinResetRequested: false },
      { id: 'dir_admin_1', zone: 'ADMIN', unit: 'Management Office', name: 'SPM NIWAS Admin', phone: '9999999999', pin: '9999', pinMustChange: false, pinResetRequested: false },
    ],
    visitors: [
      {
        id: 'vis_1',
        visitorName: 'Arjun Malhotra',
        visitorPhone: '98765 43210',
        visitorType: 'Official Visitor',
        zone: 'OFFICE',
        destination: 'IT Dept (Floor 2) - Rahul Sharma',
        vehicleNumber: 'WB 02 AN 4512',
        passCode: '7391',
        status: 'PENDING',
        createdAt: now - 120000,
        timeLabel: formatTime(now - 120000),
      },
      {
        id: 'vis_2',
        visitorName: 'Zomato Delivery',
        visitorPhone: '91234 56789',
        visitorType: 'Delivery',
        zone: 'RESIDENTIAL',
        destination: 'Flat A-402 - Rahul Sharma',
        vehicleNumber: 'WB 06 K 8821',
        passCode: '2050',
        status: 'PRE_APPROVED',
        createdAt: now - 300000,
        timeLabel: formatTime(now - 300000),
      },
      {
        id: 'vis_3',
        visitorName: 'Meera Krishnan',
        visitorPhone: '99887 76655',
        visitorType: 'Personal Guest',
        zone: 'RESIDENTIAL',
        destination: 'Flat B-105 - Dr. Anita Sen',
        vehicleNumber: '',
        passCode: '5140',
        status: 'APPROVED',
        createdAt: now - 900000,
        timeLabel: formatTime(now - 900000),
      },
    ],
    housingUnits: ['Flat A-201', 'Flat A-402', 'Flat B-105', 'Flat B-304'],
    geofence: {
      enabled: false,
      lat: null,
      lng: null,
      radiusMeters: 100,
    },
    branding: {
      logoDataUrl: '',
    },
  };
}

function loadDatabase(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const seed = createSeedDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
      return seed;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!Array.isArray(parsed.directory) || !Array.isArray(parsed.visitors)) {
      const seed = createSeedDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
      return seed;
    }
    if (!parsed.directory.some((d) => d.zone === 'SUPERADMIN' || d.email?.toLowerCase() === SUPERADMIN_EMAIL)) {
      parsed.directory.unshift(createSeedDatabase().directory[0]);
    }
    if (!Array.isArray(parsed.housingUnits)) {
      const seen = new Set<string>();
      const derived: string[] = [];
      for (const entry of parsed.directory) {
        if (entry.zone === 'RESIDENTIAL' && entry.unit.trim()) {
          const key = entry.unit.trim().toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            derived.push(entry.unit.trim());
          }
        }
      }
      parsed.housingUnits = derived.sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
    }
    return parsed;
  } catch {
    return createSeedDatabase();
  }
}

let dbState: DatabaseSchema = loadDatabase();
const sseClients = new Set<Response>();

function persistAndBroadcast(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(dbState, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist database:', err);
  }
  const payload = `data: ${JSON.stringify(dbState)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Live SSE sync stream
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(dbState)}\n\n`);
    sseClients.add(res);

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // Full state endpoint
  app.get('/api/state', (_req: Request, res: Response) => {
    res.json(dbState);
  });

  // Visitors CRUD
  app.post('/api/visitors', (req: Request, res: Response) => {
    const body = req.body as Partial<VisitorRecord>;
    if (!body.visitorName || !body.destination || !body.zone) {
      res.status(400).json({ error: 'Missing visitorName, destination, or zone.' });
      return;
    }
    const now = Date.now();
    const record: VisitorRecord = {
      id: `vis_${now}_${Math.random().toString(36).slice(2, 7)}`,
      visitorName: String(body.visitorName).trim(),
      visitorPhone: String(body.visitorPhone || 'Pre-Approved').trim(),
      visitorType: String(body.visitorType || 'Personal Guest'),
      zone: body.zone === 'RESIDENTIAL' ? 'RESIDENTIAL' : 'OFFICE',
      destination: String(body.destination).trim(),
      hostPhone: body.hostPhone ? String(body.hostPhone) : '',
      vehicleNumber: String(body.vehicleNumber || '').trim().toUpperCase(),
      passCode: String(body.passCode || Math.floor(1000 + Math.random() * 9000)),
      status: body.status || 'PENDING',
      createdAt: body.createdAt || now,
      timeLabel: body.timeLabel || formatTime(now),
    };
    dbState.visitors.unshift(record);
    persistAndBroadcast();
    res.status(201).json(record);
  });

  app.patch('/api/visitors/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body as { status?: VisitorRecord['status'] };
    const idx = dbState.visitors.findIndex((v) => v.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Visitor not found.' });
      return;
    }
    if (status) {
      dbState.visitors[idx] = { ...dbState.visitors[idx], status };
      persistAndBroadcast();
    }
    res.json(dbState.visitors[idx]);
  });

  // Directory CRUD
  app.post('/api/directory', (req: Request, res: Response) => {
    const body = req.body as { entries?: Array<Omit<DirectoryEntry, 'id'>> };
    const items = Array.isArray(body.entries) ? body.entries : [req.body as Omit<DirectoryEntry, 'id'>];
    const created: DirectoryEntry[] = [];
    for (const item of items) {
      if (!item || !item.name || !item.zone || !item.phone) continue;
      const entry: DirectoryEntry = {
        id: `dir_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        zone: item.zone,
        unit: String(item.unit || '').trim(),
        name: String(item.name).trim(),
        email: item.email,
        phone: item.zone === 'SUPERADMIN' ? String(item.phone) : normalizePhone(String(item.phone)) || String(item.phone),
        pin: String(item.pin || Math.floor(1000 + Math.random() * 9000)),
        pinMustChange: Boolean(item.pinMustChange),
        pinResetRequested: Boolean(item.pinResetRequested),
        isFamilyMember: Boolean(item.isFamilyMember),
        isPrimaryHost: Boolean(item.isPrimaryHost),
      };
      dbState.directory.unshift(entry);
      created.push(entry);
    }
    dbState.directory.sort((a, b) => a.unit.localeCompare(b.unit));
    persistAndBroadcast();
    res.status(201).json({ created });
  });

  app.patch('/api/directory/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const idx = dbState.directory.findIndex((d) => d.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Directory entry not found.' });
      return;
    }
    const patch = req.body as Partial<DirectoryEntry>;
    dbState.directory[idx] = {
      ...dbState.directory[idx],
      ...patch,
      phone: patch.phone ? normalizePhone(patch.phone) || patch.phone : dbState.directory[idx].phone,
    };
    persistAndBroadcast();
    res.json(dbState.directory[idx]);
  });

  app.post('/api/directory/pin-update', (req: Request, res: Response) => {
    const { phone, pin, pinMustChange, pinResetRequested } = req.body as {
      phone: string;
      pin: string;
      pinMustChange?: boolean;
      pinResetRequested?: boolean;
    };
    const cleanPhone = normalizePhone(phone);
    let updated = 0;
    dbState.directory = dbState.directory.map((d) => {
      if (normalizePhone(d.phone) === cleanPhone || d.phone.toLowerCase() === phone.toLowerCase()) {
        updated++;
        return {
          ...d,
          pin,
          ...(pinMustChange !== undefined ? { pinMustChange } : {}),
          ...(pinResetRequested !== undefined ? { pinResetRequested } : {}),
        };
      }
      return d;
    });
    if (updated === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    persistAndBroadcast();
    res.json({ updated });
  });

  app.post('/api/directory/pin-reset-request', (req: Request, res: Response) => {
    const { phone } = req.body as { phone: string };
    const cleanPhone = normalizePhone(phone);
    let found = false;
    dbState.directory = dbState.directory.map((d) => {
      if (normalizePhone(d.phone) === cleanPhone) {
        found = true;
        return { ...d, pinResetRequested: true };
      }
      return d;
    });
    if (!found) {
      res.status(404).json({ error: 'Mobile number not found in SPM NIWAS directory.' });
      return;
    }
    persistAndBroadcast();
    res.json({ ok: true });
  });

  app.delete('/api/directory/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const target = dbState.directory.find((d) => d.id === id);
    if (!target) {
      res.status(404).json({ error: 'Directory entry not found.' });
      return;
    }
    if (target.zone === 'SUPERADMIN') {
      res.status(403).json({ error: 'Super Admin account cannot be deleted.' });
      return;
    }
    dbState.directory = dbState.directory.filter((d) => d.id !== id);
    persistAndBroadcast();
    res.json({ ok: true });
  });

  app.delete('/api/directory/by-phone/:phone', (req: Request, res: Response) => {
    const cleanPhone = normalizePhone(String(req.params.phone));
    const zoneFilter = req.query.zone ? String(req.query.zone) : null;
    dbState.directory = dbState.directory.filter((d) => {
      if (normalizePhone(d.phone) !== cleanPhone) return true;
      if (d.zone === 'SUPERADMIN' || d.zone === 'ADMIN') return true;
      if (zoneFilter && d.zone !== zoneFilter) return true;
      return false;
    });
    persistAndBroadcast();
    res.json({ ok: true });
  });

  // Housing Units CRUD
  app.post('/api/housing-units', (req: Request, res: Response) => {
    const body = req.body as { units?: string[]; unitsText?: string };
    const rawItems = Array.isArray(body.units)
      ? body.units
      : String(body.unitsText || '').split(',');
    const existingKeys = new Set(dbState.housingUnits.map((u) => u.trim().toLowerCase()));
    const added: string[] = [];

    for (const raw of rawItems) {
      const cleaned = String(raw || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      dbState.housingUnits.push(cleaned);
      added.push(cleaned);
    }

    dbState.housingUnits.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
    persistAndBroadcast();
    res.status(201).json({ added, housingUnits: dbState.housingUnits });
  });

  app.delete('/api/housing-units/:unit', (req: Request, res: Response) => {
    const target = decodeURIComponent(String(req.params.unit || '')).trim().toLowerCase();
    dbState.housingUnits = dbState.housingUnits.filter(
      (u) => u.trim().toLowerCase() !== target
    );
    persistAndBroadcast();
    res.json({ ok: true, housingUnits: dbState.housingUnits });
  });

  // Settings endpoints
  app.put('/api/settings/branding', (req: Request, res: Response) => {
    const { logoDataUrl } = req.body as { logoDataUrl?: string };
    dbState.branding = { logoDataUrl: logoDataUrl || '' };
    persistAndBroadcast();
    res.json(dbState.branding);
  });

  app.put('/api/settings/geofence', (req: Request, res: Response) => {
    const body = req.body as Partial<GeofenceConfig>;
    dbState.geofence = {
      enabled: Boolean(body.enabled),
      lat: typeof body.lat === 'number' ? body.lat : null,
      lng: typeof body.lng === 'number' ? body.lng : null,
      radiusMeters: typeof body.radiusMeters === 'number' ? body.radiusMeters : 100,
    };
    persistAndBroadcast();
    res.json(dbState.geofence);
  });

  // Server-side Gemini AI endpoints (@google/genai)
  app.post('/api/gemini/ocr', async (req: Request, res: Response) => {
    try {
      const { base64Data, mimeType } = req.body as { base64Data?: string; mimeType?: string };
      if (!base64Data) {
        res.status(400).json({ error: 'Missing image payload.' });
        return;
      }
      const ai = getGeminiClient();
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
      res.json({
        name: String(parsed.name || '').trim(),
        vehicle: String(parsed.vehicle || '').trim().toUpperCase(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze image with Gemini AI.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/gemini/invite', async (req: Request, res: Response) => {
    try {
      const { guestName, destination, otp, note } = req.body as {
        guestName?: string;
        destination?: string;
        otp?: string;
        note?: string;
      };
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Write a warm, polite 2-sentence WhatsApp gate pass invitation for ${guestName || 'Guest'} visiting ${destination || 'SPM NIWAS'} at SPM NIWAS. Gate OTP is *${otp || '0000'}*. ${note ? 'Additional note: ' + note : ''}`,
      });
      res.json({ text: (response.text ?? '').trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate invite.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/gemini/briefing', async (req: Request, res: Response) => {
    try {
      const { totalLogs, officeInside, resInside, pendingCount } = req.body as {
        totalLogs: number;
        officeInside: number;
        resInside: number;
        pendingCount: number;
      };
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Provide a concise 3-bullet executive security briefing for SPM NIWAS campus based on today's live metrics: Total logs today: ${totalLogs}, Corporate Office inside: ${officeInside}, Residential Wing inside: ${resInside}, Pending gate approvals: ${pendingCount}. Keep each bullet sharp and actionable.`,
      });
      res.json({ text: (response.text ?? '').trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate security briefing.';
      res.status(500).json({ error: message });
    }
  });

  // Vite middleware in dev, static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Swagat SPM NIWAS server running at http://localhost:${PORT}`);
  });
}

startServer();
