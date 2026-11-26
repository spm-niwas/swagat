import QRCode from 'qrcode';
import type { AccessZone } from '../types/swagat';

export interface QrPassCardInput {
  guestName: string;
  guestType: string;
  destination: string;
  hostName?: string;
  zone: AccessZone;
  otp: string;
  timeLabel: string;
  note?: string;
  vehicleNumber?: string;
  logoDataUrl?: string;
}

export interface GeneratedQrPassCard {
  dataUrl: string;
  blob: Blob;
  fileName: string;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export async function generateQrDataUrl(payload: {
  otp: string;
  guestName: string;
  destination: string;
  zone: AccessZone;
}): Promise<string> {
  const zoneLabel = payload.zone === 'OFFICE' ? 'Corporate Office' : 'Residential Wing';
  const qrText = [
    'SPM NIWAS - SWAGAT PASS',
    `OTP - ${payload.otp}`,
    `Guest - ${payload.guestName}`,
    `Unit - ${payload.destination}`,
    `Zone - ${zoneLabel}`,
  ].join('\n');
  return QRCode.toDataURL(qrText, {
    width: 360,
    margin: 2,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}

export async function generateMobileQrPassCard(
  input: QrPassCardInput
): Promise<GeneratedQrPassCard> {
  const width = 720;
  const height = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize canvas context.');
  }

  const isOffice = input.zone === 'OFFICE';
  const zoneAccent = isOffice ? '#2563eb' : '#059669';
  const zoneSoftBg = isOffice ? '#eff6ff' : '#ecfdf5';
  const zoneBorder = isOffice ? '#bfdbfe' : '#a7f3d0';
  const zoneTitle = isOffice ? 'CORPORATE OFFICE PASS' : 'RESIDENTIAL WING PASS';

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  // Top Header Banner
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, 210);

  // Subtle accent stripe below header
  ctx.fillStyle = zoneAccent;
  ctx.fillRect(0, 210, width, 10);

  // Optional Institute Logo in Header
  let headerTextX = 48;
  if (input.logoDataUrl) {
    try {
      const logoImg = await loadImage(input.logoDataUrl);
      drawRoundedRect(ctx, 48, 52, 92, 92, 20);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.save();
      drawRoundedRect(ctx, 52, 56, 84, 84, 16);
      ctx.clip();
      ctx.drawImage(logoImg, 56, 60, 76, 76);
      ctx.restore();
      headerTextX = 162;
    } catch {
      headerTextX = 48;
    }
  }

  ctx.fillStyle = '#fbbf24';
  ctx.font = '700 20px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('SPM NIWAS · GUEST WELCOME PASS', headerTextX, 88);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 46px Georgia, serif';
  ctx.fillText('Swagat', headerTextX, 142);

  // Zone Pill
  drawRoundedRect(ctx, 48, 252, width - 96, 56, 16);
  ctx.fillStyle = zoneSoftBg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = zoneBorder;
  ctx.stroke();

  ctx.fillStyle = zoneAccent;
  ctx.font = '800 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(zoneTitle, width / 2, 288);

  // White QR + OTP Container Card
  drawRoundedRect(ctx, 48, 332, width - 96, 396, 28);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  // Render Scannable QR Code
  const qrDataUrl = await generateQrDataUrl({
    otp: input.otp,
    guestName: input.guestName,
    destination: input.destination,
    zone: input.zone,
  });
  const qrImg = await loadImage(qrDataUrl);
  const qrSize = 264;
  ctx.drawImage(qrImg, (width - qrSize) / 2, 354, qrSize, qrSize);

  // 4-Digit Entry OTP Label
  ctx.fillStyle = '#64748b';
  ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('4-DIGIT MAIN GATE OTP', width / 2, 650);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 54px "JetBrains Mono", monospace';
  ctx.fillText(input.otp.split('').join(' '), width / 2, 708);

  // Visitor Details Card
  drawRoundedRect(ctx, 48, 750, width - 96, 240, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  ctx.textAlign = 'left';
  const leftCol = 78;
  const maxTextWidth = width - 156;

  // Guest Name
  ctx.fillStyle = '#64748b';
  ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('PRE-APPROVED GUEST', leftCol, 788);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 30px "Plus Jakarta Sans", system-ui, sans-serif';
  const nameLines = wrapLines(ctx, input.guestName, maxTextWidth, 1);
  ctx.fillText(nameLines[0] || input.guestName, leftCol, 824);

  // Category & Vehicle
  ctx.fillStyle = '#475569';
  ctx.font = '600 20px "Plus Jakarta Sans", system-ui, sans-serif';
  const subMeta = `${input.guestType}${input.vehicleNumber ? ` · ${input.vehicleNumber}` : ''} · ${input.timeLabel}`;
  ctx.fillText(subMeta, leftCol, 856);

  // Divider
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(leftCol, 876, maxTextWidth, 2);

  // Destination
  ctx.fillStyle = '#64748b';
  ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('VISITING UNIT / HOST', leftCol, 908);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
  const destLines = wrapLines(ctx, input.destination, maxTextWidth, 1);
  ctx.fillText(destLines[0] || input.destination, leftCol, 938);

  if (input.note?.trim()) {
    ctx.fillStyle = '#475569';
    ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
    const noteLines = wrapLines(ctx, `Note: ${input.note.trim()}`, maxTextWidth, 1);
    ctx.fillText(noteLines[0], leftCol, 970);
  } else if (input.hostName) {
    ctx.fillStyle = '#475569';
    ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`Invited by ${input.hostName}`, leftCol, 970);
  }

  // Footer Instructions
  ctx.textAlign = 'center';
  ctx.fillStyle = '#475569';
  ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Show this QR Pass or OTP at the SPM NIWAS Main Gate', width / 2, 1038);

  const dataUrl = canvas.toDataURL('image/png', 0.95);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Could not export pass image.'));
    }, 'image/png');
  });

  const safeGuest = input.guestName.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Guest';
  const fileName = `Swagat-Pass-${safeGuest}-${input.otp}.png`;

  return { dataUrl, blob, fileName };
}

export function triggerQrPassDownload(card: GeneratedQrPassCard): void {
  const link = document.createElement('a');
  link.href = card.dataUrl;
  link.download = card.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function copyQrPassImage(card: GeneratedQrPassCard): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== 'function' ||
    typeof ClipboardItem === 'undefined'
  ) {
    return false;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': card.blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export type ShareQrResult = 'shared' | 'cancelled' | 'copied_and_downloaded' | 'downloaded';

export async function shareQrPassImage(
  card: GeneratedQrPassCard,
  caption: string
): Promise<ShareQrResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([card.blob], card.fileName, { type: 'image/png' });
      const navWithCanShare = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (!navWithCanShare.canShare || navWithCanShare.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Swagat Guest Entry Pass',
          text: caption,
        });
        return 'shared';
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  const copied = await copyQrPassImage(card);
  triggerQrPassDownload(card);
  return copied ? 'copied_and_downloaded' : 'downloaded';
}

export function openWhatsAppChatLink(phone: string | undefined, message: string): void {
  const digits = (phone || '').replace(/\D/g, '').slice(-10);
  const url =
    digits.length === 10 && /^[6-9]/.test(digits)
      ? `https://wa.me/91${digits}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


