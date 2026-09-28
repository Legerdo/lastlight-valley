import { mkdir, writeFile } from 'node:fs/promises';
import { boot } from './qa.mjs';
const dir = 'evidence/art'; const { browser, page } = await boot(dir);
try {
  const sheets = await page.evaluate(() => window.__LASTLIGHT__.sheets());
  const qc = [];
  for (const sheet of sheets) {
    await writeFile(`${dir}/${sheet.kind}-original.png`, Buffer.from(sheet.png.split(',')[1], 'base64'));
    const result = await page.evaluate(async sheet => {
      const img = new Image(); img.src = sheet.png; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const clipped = [], empty = [];
      for (const [action, spec] of Object.entries(sheet.frames)) for (let d = 0; d < 4; d++) for (let f = 0; f < spec.count; f++) {
        const data = ctx.getImageData(f * sheet.size, (spec.row + d) * sheet.size, sheet.size, sheet.size).data;
        let count = 0, edge = 0;
        for (let y = 0; y < sheet.size; y++) for (let x = 0; x < sheet.size; x++) if (data[(y * sheet.size + x) * 4 + 3] > 0) { count++; if (x === 0 || x === sheet.size - 1 || y === 0 || y === sheet.size - 1) edge++; }
        if (!count) empty.push({ action, d, f }); if (edge) clipped.push({ action, d, f, edge });
      }
      const scale = 4, preview = document.createElement('canvas'); preview.width = sheet.size * 8 * scale; preview.height = sheet.size * 6 * scale;
      const p = preview.getContext('2d'); p.imageSmoothingEnabled = false; p.fillStyle = '#223640'; p.fillRect(0, 0, preview.width, preview.height);
      Object.values(sheet.frames).forEach((spec, row) => p.drawImage(img, 0, spec.row * sheet.size, sheet.size * 8, sheet.size, 0, row * sheet.size * scale, preview.width, sheet.size * scale));
      const full = document.createElement('canvas'); full.width = sheet.width * scale; full.height = sheet.height * scale;
      const fc = full.getContext('2d'); fc.imageSmoothingEnabled = false; fc.drawImage(img, 0, 0, full.width, full.height);
      return { clipped, empty, preview: preview.toDataURL('image/png'), full: sheet.kind === 'hero' ? full.toDataURL('image/png') : null };
    }, sheet);
    await writeFile(`${dir}/${sheet.kind}-front-4x.png`, Buffer.from(result.preview.split(',')[1], 'base64'));
    if (result.full) await writeFile(`${dir}/${sheet.kind}-full-4x.png`, Buffer.from(result.full.split(',')[1], 'base64'));
    qc.push({ kind: sheet.kind, size: sheet.size, anchor: { x: sheet.size / 2, y: sheet.foot }, totalFrames: Object.values(sheet.frames).reduce((n, s) => n + s.count * 4, 0), clipped: result.clipped, empty: result.empty });
  }
  await writeFile(`${dir}/frame-qc.json`, JSON.stringify(qc, null, 2)); console.log(JSON.stringify(qc, null, 2));
  if (qc.some(s => s.clipped.length || s.empty.length)) process.exitCode = 1;
} finally { await browser.close(); }
