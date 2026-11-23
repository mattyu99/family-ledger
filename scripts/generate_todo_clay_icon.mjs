import fs from 'fs';
import { PNG } from 'pngjs';

const size = 512;
const scale = 2; // 2x supersampling for ultra smooth antialiasing
const renderSize = size * scale;

// 輔助函式
function length(x, y) { return Math.hypot(x, y); }
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.min(Math.max(qx, qy), 0) + length(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function sdSegment(px, py, ax, ay, bx, by, r) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return length(pax - bax * h, pay - bay * h) - r;
}

// 光照參數
const lx = -0.45, ly = -0.55, lz = 0.7;
const lLen = Math.hypot(lx, ly, lz);
const lightDir = [lx / lLen, ly / lLen, lz / lLen];

function shadeClay(normal, baseColor, specPower = 18, specIntensity = 0.35) {
  const nx = normal[0], ny = normal[1], nz = normal[2];
  const ndotl = Math.max(0, nx * lightDir[0] + ny * lightDir[1] + nz * lightDir[2]);
  
  // 雙光源微調 (微弱冷色背光)
  const backLight = Math.max(0, -nx * 0.3 - ny * 0.3 + nz * 0.4) * 0.15;
  
  // 柔和漫反射 (Clay Diffuse)
  const ambient = 0.48;
  const diffuse = ndotl * 0.52;
  const totalLight = ambient + diffuse + backLight;
  
  // 高光 (Blinn-Phong)
  const hx = lightDir[0], hy = lightDir[1], hz = lightDir[2] + 1.0;
  const hLen = Math.hypot(hx, hy, hz);
  const hndoth = Math.max(0, (nx * hx + ny * hy + nz * hz) / hLen);
  const spec = Math.pow(hndoth, specPower) * specIntensity;
  
  // 邊緣柔光 (Fresnel rim)
  const rim = Math.pow(1.0 - Math.max(0, nz), 2.2) * 0.18;
  
  const r = clamp(Math.round(baseColor[0] * totalLight + spec * 255 + rim * 255), 0, 255);
  const g = clamp(Math.round(baseColor[1] * totalLight + spec * 255 + rim * 255), 0, 255);
  const b = clamp(Math.round(baseColor[2] * totalLight + spec * 255 + rim * 255), 0, 255);
  
  return [r, g, b];
}

// 建立 1024x1024 緩衝區
const buf = new Uint8ClampedArray(renderSize * renderSize * 4);

console.log('Rendering 3D Clay Todo Icon...');

for (let y = 0; y < renderSize; y++) {
  const py = y / scale;
  for (let x = 0; x < renderSize; x++) {
    const px = x / scale;
    const idx = (y * renderSize + x) * 4;

    // 座標居中 (256, 256)
    const cx = px - 256;
    const cy = py - 256;

    let finalColor = [0, 0, 0, 0]; // RGBA

    // 1. 底板陰影 (Board Drop Shadow)
    const dBoardShadow = sdRoundedBox(cx - 6, cy - 14, 126, 165, 34);
    if (dBoardShadow < 24) {
      const shadowAlpha = clamp((1.0 - dBoardShadow / 24) * 0.28, 0, 1);
      finalColor = [180, 130, 150, Math.round(shadowAlpha * 255)];
    }

    // 2. 夾板主體 (Clay Clipboard) - 溫柔杏粉黏土色
    const dBoard = sdRoundedBox(cx, cy - 2, 126, 165, 34);
    if (dBoard < 0) {
      const depth = Math.max(0, 18 - Math.abs(dBoard));
      const eps = 1.0;
      const dX = sdRoundedBox(cx + eps, cy - 2, 126, 165, 34) - sdRoundedBox(cx - eps, cy - 2, 126, 165, 34);
      const dY = sdRoundedBox(cx, cy - 2 + eps, 126, 165, 34) - sdRoundedBox(cx, cy - 2 - eps, 126, 165, 34);
      const len = Math.hypot(dX, dY, 1.6);
      const normal = [-dX / len, -dY / len, 1.6 / len];

      // 溫暖米粉桃色黏土 #F4C4B8 ~ #F7D1C7
      const boardBase = [244, 196, 184];
      const rgb = shadeClay(normal, boardBase, 12, 0.25);
      finalColor = [rgb[0], rgb[1], rgb[2], 255];
    }

    // 3. 便簽白紙 (Paper Sheet) - 圓潤象牙白
    const dPaper = sdRoundedBox(cx, cy + 14, 106, 132, 22);
    // 紙張投影在板上
    if (dPaper >= 0 && dPaper < 12 && dBoard < 0) {
      const shadowOnBoard = (1.0 - dPaper / 12) * 0.22;
      finalColor[0] = Math.round(finalColor[0] * (1 - shadowOnBoard));
      finalColor[1] = Math.round(finalColor[1] * (1 - shadowOnBoard));
      finalColor[2] = Math.round(finalColor[2] * (1 - shadowOnBoard));
    }
    if (dPaper < 0) {
      const eps = 1.0;
      const dX = sdRoundedBox(cx + eps, cy + 14, 106, 132, 22) - sdRoundedBox(cx - eps, cy + 14, 106, 132, 22);
      const dY = sdRoundedBox(cx, cy + 14 + eps, 106, 132, 22) - sdRoundedBox(cx, cy + 14 - eps, 106, 132, 22);
      const len = Math.hypot(dX, dY, 2.2);
      const normal = [-dX / len, -dY / len, 2.2 / len];

      // 象牙雪白 #FFFFFF
      const paperBase = [253, 253, 255];
      const rgb = shadeClay(normal, paperBase, 16, 0.3);
      finalColor = [rgb[0], rgb[1], rgb[2], 255];
    }

    // 4. 清單項目條目 (List Items on Paper)
    const listRows = [
      { y: -64, checked: true, color: [74, 222, 128], lineW: 56 },   // 第1列：綠色打勾方塊 + 橫線
      { y: -18, checked: true, color: [251, 191, 36], lineW: 66 },   // 第2列：黃色打勾方塊 + 橫線
      { y: 28, checked: false, color: [203, 213, 225], lineW: 48 },  // 第3列：淡灰待辦方塊 + 橫線
      { y: 74, checked: false, color: [203, 213, 225], lineW: 58 },  // 第4列：淡灰待辦方塊 + 橫線
    ];

    if (dPaper < -3) {
      for (const row of listRows) {
        // 核取小方塊 (Check box)
        const dBox = sdRoundedBox(cx + 62, cy - row.y, 11, 11, 4.5);
        if (dBox < 0) {
          const eps = 0.8;
          const dX = sdRoundedBox(cx + 62 + eps, cy - row.y, 11, 11, 4.5) - sdRoundedBox(cx + 62 - eps, cy - row.y, 11, 11, 4.5);
          const dY = sdRoundedBox(cx + 62, cy - row.y + eps, 11, 11, 4.5) - sdRoundedBox(cx + 62, cy - row.y - eps, 11, 11, 4.5);
          const len = Math.hypot(dX, dY, 1.2);
          const normal = [-dX / len, -dY / len, 1.2 / len];
          const rgb = shadeClay(normal, row.checked ? row.color : [241, 245, 249], 14, 0.3);
          finalColor = [rgb[0], rgb[1], rgb[2], 255];
        }

        // 待辦文字條 (Text line bar)
        const dLine = sdRoundedBox(cx - 8, cy - row.y, row.lineW, 6.5, 3.5);
        if (dLine < 0) {
          const eps = 0.8;
          const dX = sdRoundedBox(cx - 8 + eps, cy - row.y, row.lineW, 6.5, 3.5) - sdRoundedBox(cx - 8 - eps, cy - row.y, row.lineW, 6.5, 3.5);
          const dY = sdRoundedBox(cx - 8, cy - row.y + eps, row.lineW, 6.5, 3.5) - sdRoundedBox(cx - 8, cy - row.y - eps, row.lineW, 6.5, 3.5);
          const len = Math.hypot(dX, dY, 1.4);
          const normal = [-dX / len, -dY / len, 1.4 / len];
          const rgb = shadeClay(normal, [226, 232, 240], 10, 0.2);
          finalColor = [rgb[0], rgb[1], rgb[2], 255];
        }
      }
    }

    // 5. 頂部黏土夾子 (Top Binder Clip) - 奢華玫瑰金/柔金黏土
    const dClipBase = sdRoundedBox(cx, cy + 128, 48, 18, 9);
    const dClipShadow = sdRoundedBox(cx - 3, cy + 120, 48, 18, 9);
    if (dClipShadow < 8 && dPaper < 0 && dClipBase >= 0) {
      const sh = (1.0 - dClipShadow / 8) * 0.35;
      finalColor[0] = Math.round(finalColor[0] * (1 - sh));
      finalColor[1] = Math.round(finalColor[1] * (1 - sh));
      finalColor[2] = Math.round(finalColor[2] * (1 - sh));
    }
    if (dClipBase < 0) {
      const eps = 0.8;
      const dX = sdRoundedBox(cx + eps, cy + 128, 48, 18, 9) - sdRoundedBox(cx - eps, cy + 128, 48, 18, 9);
      const dY = sdRoundedBox(cx, cy + 128 + eps, 48, 18, 9) - sdRoundedBox(cx, cy + 128 - eps, 48, 18, 9);
      const len = Math.hypot(dX, dY, 1.5);
      const normal = [-dX / len, -dY / len, 1.5 / len];

      // 溫潤暖金夾子 #F59E0B
      const clipBase = [245, 175, 75];
      const rgb = shadeClay(normal, clipBase, 28, 0.6);
      finalColor = [rgb[0], rgb[1], rgb[2], 255];
    }

    // 夾子中央小孔
    const dHole = length(cx, cy + 128) - 6;
    if (dHole < 0) {
      finalColor = [210, 140, 50, 255];
    }

    // 6. ⭐ 焦點立體大打勾 (Volumetric 3D Hero Checkmark)
    // 稍微向右下偏移、大膽浮凸於紙張上方，極度搶眼！
    const chkOffX = -22;
    const chkOffY = -12;
    // 打勾兩段 (短段: -38, 10 -> -8, 46; 長段: -8, 46 -> 58, -32)
    const seg1Ax = chkOffX - 38, seg1Ay = chkOffY + 12;
    const seg1Bx = chkOffX - 8,  seg1By = chkOffY + 46;
    const seg2Ax = chkOffX - 8,  seg2Ay = chkOffY + 46;
    const seg2Bx = chkOffX + 58, seg2By = chkOffY - 32;
    const chkRadius = 16.5;

    // 大打勾投影在下方物體上 (Checkmark Drop Shadow)
    const dChk1Sh = sdSegment(cx - 7, cy - 14, seg1Ax, seg1Ay, seg1Bx, seg1By, chkRadius);
    const dChk2Sh = sdSegment(cx - 7, cy - 14, seg2Ax, seg2Ay, seg2Bx, seg2By, chkRadius);
    const dChkShadow = Math.min(dChk1Sh, dChk2Sh);
    if (dChkShadow < 14 && dBoard < 0) {
      const shAlpha = (1.0 - dChkShadow / 14) * 0.42;
      finalColor[0] = Math.round(finalColor[0] * (1 - shAlpha));
      finalColor[1] = Math.round(finalColor[1] * (1 - shAlpha));
      finalColor[2] = Math.round(finalColor[2] * (1 - shAlpha));
    }

    // 大打勾本體 (Emerald / Mint Clay Checkmark)
    const dChk1 = sdSegment(cx, cy, seg1Ax, seg1Ay, seg1Bx, seg1By, chkRadius);
    const dChk2 = sdSegment(cx, cy, seg2Ax, seg2Ay, seg2Bx, seg2By, chkRadius);
    const dChk = Math.min(dChk1, dChk2);

    if (dChk < 0) {
      const eps = 0.8;
      const getDist = (x, y) => Math.min(
        sdSegment(x, y, seg1Ax, seg1Ay, seg1Bx, seg1By, chkRadius),
        sdSegment(x, y, seg2Ax, seg2Ay, seg2Bx, seg2By, chkRadius)
      );
      const dX = getDist(cx + eps, cy) - getDist(cx - eps, cy);
      const dY = getDist(cx, cy + eps) - getDist(cx, cy - eps);
      const len = Math.hypot(dX, dY, 1.4);
      const normal = [-dX / len, -dY / len, 1.4 / len];

      // 鮮活翡翠綠/薄荷綠 3D 黏土 #10B981 ~ #34D399
      const tY = clamp((cy - (chkOffY - 32)) / 78, 0, 1);
      const checkBase = [
        lerp(34, 16, tY),   // R: 34 -> 16
        lerp(211, 185, tY), // G: 211 -> 185
        lerp(153, 129, tY), // B: 153 -> 129
      ];
      const rgb = shadeClay(normal, checkBase, 24, 0.45);
      finalColor = [rgb[0], rgb[1], rgb[2], 255];
    }

    buf[idx] = finalColor[0];
    buf[idx + 1] = finalColor[1];
    buf[idx + 2] = finalColor[2];
    buf[idx + 3] = finalColor[3];
  }
}

// 下採樣為 512x512
const finalPng = new PNG({ width: size, height: size });
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < scale; sy++) {
      for (let sx = 0; sx < scale; sx++) {
        const srcIdx = ((y * scale + sy) * renderSize + (x * scale + sx)) * 4;
        r += buf[srcIdx];
        g += buf[srcIdx + 1];
        b += buf[srcIdx + 2];
        a += buf[srcIdx + 3];
      }
    }
    const destIdx = (y * size + x) * 4;
    finalPng.data[destIdx] = Math.round(r / (scale * scale));
    finalPng.data[destIdx + 1] = Math.round(g / (scale * scale));
    finalPng.data[destIdx + 2] = Math.round(b / (scale * scale));
    finalPng.data[destIdx + 3] = Math.round(a / (scale * scale));
  }
}

// 輸出至 assets/shortcuts/shortcut_todo.png
const outPath = 'assets/shortcuts/shortcut_todo.png';
fs.writeFileSync(outPath, PNG.sync.write(finalPng));
console.log('Saved:', outPath);

// 同步複製一份至 assets/widgets/widget_icon_todo.png
fs.copyFileSync(outPath, 'assets/widgets/widget_icon_todo.png');
console.log('Saved: assets/widgets/widget_icon_todo.png');
