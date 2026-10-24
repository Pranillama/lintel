import type { ReceiptLine } from "./receiptLines";

/** Draws receipt lines onto an 80 mm thermal-paper canvas. Browser only. */

export const PAPER_WIDTH_PX = 900;
const PAD = 70;
const LH = 46;
const INK = "#151515";
const MUTED = "#7d7d76";
const PAPER = "#F2F1EC";
const HIGHLIGHT = "rgba(200,242,90,.92)";

export interface ReceiptFonts {
  /** CSS font-family list for the monospace print face. */
  mono: string;
  /** CSS font-family list for the logo face. */
  display: string;
}

export interface DrawnReceipt {
  canvas: HTMLCanvasElement;
  height: number;
  /** Top edge of each line, in canvas pixels, same order as the input lines. */
  tops: number[];
}

function heightOf(line: ReceiptLine): number {
  switch (line.kind) {
    case "logo": return 190;
    case "gap": return LH * line.lines;
    case "head": return LH * 1.5;
    case "big": return 330;
    case "barcode": return 130;
    default: return LH;
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (g.measureText(next).width > max && cur) { out.push(cur); cur = word; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

export function drawReceipt(lines: ReceiptLine[], fonts: ReceiptFonts): DrawnReceipt {
  const probe = document.createElement("canvas").getContext("2d")!;
  const font = (weight: number, size: number) => `${weight} ${size}px ${fonts.mono}`;
  // wrapped text lines need extra height, so measure them first
  const heights = lines.map((line) => {
    if (line.kind !== "text") return heightOf(line);
    probe.font = font(line.bold ? 600 : 500, line.size === "sm" ? 21 : 24);
    return LH * wrap(probe, line.text, PAPER_WIDTH_PX - PAD * 2).length;
  });
  const height = Math.ceil(heights.reduce((a, b) => a + b, 0) + PAD);

  const canvas = document.createElement("canvas");
  canvas.width = PAPER_WIDTH_PX;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, PAPER_WIDTH_PX, height);
  // faint thermal grain, seeded so every redraw looks the same
  let seed = 11;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${rand() * 0.035})`;
    g.fillRect(rand() * PAPER_WIDTH_PX, rand() * height, 1.4, 1.4);
  }

  g.textBaseline = "middle";
  const tops: number[] = [];
  let y = PAD;
  const right = PAPER_WIDTH_PX - PAD;
  lines.forEach((line, i) => {
    const h = heights[i];
    const mid = y + h / 2;
    tops.push(y);
    switch (line.kind) {
      case "logo":
        g.fillStyle = INK; g.beginPath(); g.arc(PAPER_WIDTH_PX / 2, y + 62, 44, 0, Math.PI * 2); g.fill();
        g.fillStyle = PAPER; g.font = `600 44px ${fonts.display}`; g.textAlign = "center"; g.fillText("L", PAPER_WIDTH_PX / 2, y + 64);
        g.fillStyle = INK; g.font = `600 40px ${fonts.display}`; g.fillText("LINTEL", PAPER_WIDTH_PX / 2, y + 150);
        break;
      case "text": {
        g.fillStyle = line.tone === "muted" ? MUTED : INK;
        g.font = font(line.bold ? 600 : 500, line.size === "sm" ? 21 : 24);
        g.textAlign = "center";
        wrap(g, line.text, PAPER_WIDTH_PX - PAD * 2).forEach((t, k) => g.fillText(t, PAPER_WIDTH_PX / 2, y + LH * k + LH / 2));
        break;
      }
      case "rule": {
        g.fillStyle = MUTED; g.font = font(500, 24); g.textAlign = "left";
        let s = "";
        while (g.measureText(s + line.char).width < PAPER_WIDTH_PX - PAD * 2) s += line.char;
        g.fillText(s, PAD, mid);
        break;
      }
      case "head":
        g.fillStyle = INK; g.font = font(700, 26); g.textAlign = "left"; g.fillText(line.text, PAD, mid + 6);
        break;
      case "row": {
        g.font = font(line.bold ? 600 : 500, 25);
        g.textAlign = "left";
        const lw = g.measureText(line.left).width;
        const rw = g.measureText(line.right).width;
        if (line.highlight) {
          g.fillStyle = HIGHLIGHT;
          g.beginPath(); g.moveTo(PAD - 10, mid - 19); g.lineTo(right + 10, mid - 21); g.lineTo(right + 6, mid + 19); g.lineTo(PAD - 7, mid + 21); g.closePath(); g.fill();
        }
        g.fillStyle = line.tone === "muted" ? MUTED : INK;
        g.fillText(line.left, PAD, mid);
        g.textAlign = "right";
        g.fillText(line.right, right, mid);
        g.fillStyle = MUTED; g.textAlign = "left";
        const dot = g.measureText(".").width;
        for (let x = PAD + lw + 14; x < right - rw - 14; x += dot * 1.6) g.fillText(".", x, mid);
        if (line.strike) { g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(right - rw - 6, mid + 1); g.lineTo(right + 6, mid - 1); g.stroke(); }
        break;
      }
      case "big":
        g.fillStyle = INK; g.font = font(700, 230); g.textAlign = "center"; g.fillText(line.value, PAPER_WIDTH_PX / 2, y + 140);
        g.font = font(600, 24); g.fillText(line.caption, PAPER_WIDTH_PX / 2, y + 290);
        break;
      case "barcode": {
        g.fillStyle = INK;
        let s = line.code.split("").reduce((a, c) => a + c.charCodeAt(0), 7);
        for (let x = PAD + 40; x < right - 40;) {
          s = (s * 9301 + 49297) % 233280;
          const w = 2 + (s % 5);
          g.fillRect(x, y + 10, w, h - 40);
          x += w + 2 + (s % 3);
        }
        g.font = font(500, 18); g.textAlign = "center"; g.fillStyle = MUTED; g.fillText(line.code, PAPER_WIDTH_PX / 2, y + h - 12);
        break;
      }
      case "gap":
        break;
    }
    y += h;
  });
  return { canvas, height, tops };
}
