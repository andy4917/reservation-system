import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  { size: 16, paths: [path.join(root, "icons", "icon16.png"), path.join(root, "extension", "icons", "icon16.png")] },
  { size: 32, paths: [path.join(root, "icons", "icon32.png")] },
  { size: 48, paths: [path.join(root, "icons", "icon48.png"), path.join(root, "extension", "icons", "icon48.png")] },
  { size: 64, paths: [path.join(root, "icons", "icon64.png")] },
  { size: 128, paths: [path.join(root, "icons", "icon128.png"), path.join(root, "extension", "icons", "icon128.png")] },
  { size: 256, paths: [path.join(root, "icons", "icon256.png")] },
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function createCanvas(size) {
  return Buffer.alloc(size * size * 4);
}

function rgba(hex, alpha = 255) {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
    alpha,
  ];
}

function setPixel(canvas, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const index = (y * size + x) * 4;
  canvas[index] = color[0];
  canvas[index + 1] = color[1];
  canvas[index + 2] = color[2];
  canvas[index + 3] = color[3];
}

function drawRoundedRect(canvas, size, x, y, width, height, radius, color) {
  const x2 = x + width;
  const y2 = y + height;
  for (let py = y; py < y2; py += 1) {
    for (let px = x; px < x2; px += 1) {
      const dx = px < x + radius ? x + radius - px : px >= x2 - radius ? px - (x2 - radius - 1) : 0;
      const dy = py < y + radius ? y + radius - py : py >= y2 - radius ? py - (y2 - radius - 1) : 0;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(canvas, size, px, py, color);
      }
    }
  }
}

function drawRect(canvas, size, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      setPixel(canvas, size, px, py, color);
    }
  }
}

function renderIcon(size) {
  const canvas = createCanvas(size);
  const base = rgba("#173f3d");
  const card = rgba("#f6f0e8");
  const accent = rgba("#c86e4a");
  const gold = rgba("#d4a046");
  const shadow = rgba("#224f4d");

  const pad = Math.round(size * 0.08);
  const outerRadius = Math.max(2, Math.round(size * 0.2));
  drawRoundedRect(canvas, size, pad, pad, size - pad * 2, size - pad * 2, outerRadius, base);

  const cardX = Math.round(size * 0.18);
  const cardY = Math.round(size * 0.22);
  const cardW = size - cardX * 2;
  const cardH = size - Math.round(size * 0.2) - cardY;
  drawRoundedRect(canvas, size, cardX, cardY, cardW, cardH, Math.max(2, Math.round(size * 0.08)), card);

  const headerH = Math.max(3, Math.round(size * 0.16));
  drawRoundedRect(canvas, size, cardX, cardY, cardW, headerH + Math.round(size * 0.03), Math.max(2, Math.round(size * 0.06)), accent);

  const pinY = cardY - Math.max(1, Math.round(size * 0.03));
  const pinW = Math.max(2, Math.round(size * 0.08));
  const pinH = Math.max(3, Math.round(size * 0.12));
  drawRoundedRect(canvas, size, cardX + Math.round(size * 0.08), pinY, pinW, pinH, Math.max(1, Math.round(size * 0.03)), card);
  drawRoundedRect(canvas, size, cardX + cardW - Math.round(size * 0.08) - pinW, pinY, pinW, pinH, Math.max(1, Math.round(size * 0.03)), card);

  const gridTop = cardY + headerH + Math.max(2, Math.round(size * 0.08));
  const cellGap = Math.max(1, Math.round(size * 0.045));
  const cellW = Math.round((cardW - cellGap * 3) / 2);
  const cellH = Math.round((cardH - headerH - cellGap * 3) / 2);
  drawRoundedRect(canvas, size, cardX + cellGap, gridTop, cellW, cellH, Math.max(1, Math.round(size * 0.04)), shadow);
  drawRoundedRect(canvas, size, cardX + cellGap * 2 + cellW, gridTop, cellW, cellH, Math.max(1, Math.round(size * 0.04)), gold);
  drawRoundedRect(canvas, size, cardX + cellGap, gridTop + cellGap + cellH, cellW, cellH, Math.max(1, Math.round(size * 0.04)), gold);
  drawRoundedRect(canvas, size, cardX + cellGap * 2 + cellW, gridTop + cellGap + cellH, cellW, cellH, Math.max(1, Math.round(size * 0.04)), shadow);

  const checkColor = rgba("#f6f0e8");
  const cx = cardX + Math.round(cardW * 0.67);
  const cy = gridTop + Math.round(cellH * 0.58);
  const stroke = Math.max(1, Math.round(size * 0.05));
  for (let i = 0; i < Math.round(size * 0.12); i += 1) {
    drawRect(canvas, size, cx - i, cy + i, stroke, stroke, checkColor);
  }
  for (let i = 0; i < Math.round(size * 0.22); i += 1) {
    drawRect(canvas, size, cx + i, cy + Math.round(size * 0.1) - i, stroke, stroke, checkColor);
  }

  return canvas;
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + entries.length * 16;
  const payloads = [];
  entries.forEach((entry, index) => {
    const widthByte = entry.size >= 256 ? 0 : entry.size;
    const heightByte = entry.size >= 256 ? 0 : entry.size;
    const base = index * 16;
    directory[base] = widthByte;
    directory[base + 1] = heightByte;
    directory[base + 2] = 0;
    directory[base + 3] = 0;
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(entry.png.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    payloads.push(entry.png);
    offset += entry.png.length;
  });
  return Buffer.concat([header, directory, ...payloads]);
}

async function main() {
  const icoEntries = [];
  for (const target of targets) {
    const png = encodePng(target.size, renderIcon(target.size));
    for (const outputPath of target.paths) {
      await ensureDir(outputPath);
      await fs.writeFile(outputPath, png);
    }
    if ([16, 32, 48, 64, 128, 256].includes(target.size)) {
      icoEntries.push({ size: target.size, png });
    }
  }
  const icoPath = path.join(root, "icons", "desktop-icon.ico");
  await ensureDir(icoPath);
  await fs.writeFile(icoPath, buildIco(icoEntries));
  const brandDocPath = path.join(root, "icons", "BRAND_ICON_NOTES.md");
  await fs.writeFile(
    brandDocPath,
    [
      "# UHS App Icon",
      "",
      "- Deep teal shell for the desktop app workspace",
      "- Warm beige card to match the app background",
      "- Terracotta header and gold highlights for task/alert contrast",
      "- Shared across desktop and extension surfaces",
      "",
      "Regenerate with `npm run app:icons:regen`.",
      "",
    ].join("\n"),
    "utf8",
  );
  console.log("generate_app_icons: OK");
}

await main();
