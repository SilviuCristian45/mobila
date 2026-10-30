// Miniatură ca BMP 24 biți în data-URL: fără canvas/DOM (merge în Node și jsdom), deci previzualizările se testează.
export function encodeBmpDataUrl(rgba: Uint8Array, width: number, height: number): string {
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + rowBytes * height;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true); // pozitiv = rânduri de jos în sus
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, rowBytes * height, true);
  for (let y = 0; y < height; y++) {
    const dst = 54 + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      out[dst + x * 3] = rgba[s + 2]!;
      out[dst + x * 3 + 1] = rgba[s + 1]!;
      out[dst + x * 3 + 2] = rgba[s]!;
    }
  }
  let bin = '';
  for (let i = 0; i < out.length; i += 0x8000)
    bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return `data:image/bmp;base64,${btoa(bin)}`;
}
