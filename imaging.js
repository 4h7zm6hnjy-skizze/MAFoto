/* LUMEN PRO: deterministic photo algorithms, no external dependencies. */
(function (root) {
  'use strict';
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function ratioFromLabel(label, portrait) {
    const ratio = label === '1:1' ? 1 : label === '3:2' ? 1.5 : 4 / 3;
    return portrait ? 1 / ratio : ratio;
  }
  function getCrop(width, height, outputRatio, zoom) {
    const z = Math.max(1, Number(zoom) || 1);
    const actualRatio = width / height;
    let cropW = width, cropH = height;
    if (actualRatio > outputRatio) cropW = height * outputRatio;
    else cropH = width / outputRatio;
    cropW /= z; cropH /= z;
    return { x: (width - cropW) / 2, y: (height - cropH) / 2, width: cropW, height: cropH };
  }
  function accumulatorFor(length, effect) {
    return { values: new Uint32Array(length), count: 0, effect };
  }
  function blendFrame(acc, pixels) {
    if (pixels.length !== acc.values.length) throw new Error('Bildgrößen stimmen nicht überein.');
    const a = acc.values;
    if (acc.effect === 'trails') {
      for (let i = 0; i < a.length; i += 4) {
        a[i] = Math.max(a[i], pixels[i]);
        a[i + 1] = Math.max(a[i + 1], pixels[i + 1]);
        a[i + 2] = Math.max(a[i + 2], pixels[i + 2]);
      }
    } else {
      for (let i = 0; i < a.length; i += 4) {
        a[i] += pixels[i];
        a[i + 1] += pixels[i + 1];
        a[i + 2] += pixels[i + 2];
      }
    }
    acc.count++;
  }
  function renderAccumulator(acc, destination) {
    const vals = acc.values, n = Math.max(1, acc.count);
    if (destination.length !== vals.length) throw new Error('Bildgrößen stimmen nicht überein.');
    const trails = acc.effect === 'trails';
    for (let i = 0; i < vals.length; i += 4) {
      destination[i] = trails ? vals[i] : Math.round(vals[i] / n);
      destination[i + 1] = trails ? vals[i + 1] : Math.round(vals[i + 1] / n);
      destination[i + 2] = trails ? vals[i + 2] : Math.round(vals[i + 2] / n);
      destination[i + 3] = 255;
    }
    return destination;
  }
  function applyLook(data, settings) {
    const brightness = (Number(settings.brightness) || 0) * 1.65;
    const contrast = (100 + (Number(settings.contrast) || 0)) / 100;
    const saturation = Math.max(0, (100 + (Number(settings.saturation) || 0)) / 100);
    const warmth = Number(settings.warmth) || 0;
    const warmingR = warmth * 0.65, warmingB = -warmth * 0.70;
    const mono = settings.preset === 'mono';
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i+1], b = data[i+2];
      const l = r * .2126 + g * .7152 + b * .0722;
      r = l + (r - l) * saturation;
      g = l + (g - l) * saturation;
      b = l + (b - l) * saturation;
      r = (r - 128) * contrast + 128 + brightness + warmingR;
      g = (g - 128) * contrast + 128 + brightness;
      b = (b - 128) * contrast + 128 + brightness + warmingB;
      if (mono) { const y = r*.2126+g*.7152+b*.0722; r=y;g=y;b=y; }
      data[i] = clamp(Math.round(r), 0, 255);
      data[i + 1] = clamp(Math.round(g), 0, 255);
      data[i + 2] = clamp(Math.round(b), 0, 255);
    }
    return data;
  }
  root.LumenImaging = { getCrop, ratioFromLabel, accumulatorFor, blendFrame, renderAccumulator, applyLook, clamp };
  if (typeof module === 'object' && module.exports) module.exports = root.LumenImaging;
})(typeof window !== 'undefined' ? window : globalThis);
