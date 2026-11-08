// @ts-nocheck
import './styles.css';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  canEncodeAudio,
} from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { createCaptionStudio } from './caption-studio';

const $ = id => document.getElementById(id);
const video = $('video');
const canvas = $('canvas');
const ctx = canvas.getContext('2d', { alpha: true });
const captions = createCaptionStudio({
  getFile: () => state.file,
  getDuration: () => state.duration,
  getTime: () => (state.demo ? 1.5 : video.currentTime),
  preview: () => draw(),
});
const state = {
  file: null,
  url: '',
  width: 0,
  height: 0,
  duration: 0,
  bg: 'original',
  format: 'original',
  crop: 'fit',
  segmenter: null,
  segmenterPromise: null,
  customImage: null,
  customUrl: '',
  exportSize: 'original',
  demo: false,
  rendering: false,
  previousMask: null,
  audioContext: null,
  sourceNode: null,
  destination: null,
  exporting: false,
  subjectCanvas: null,
  segmentationCanvas: null,
  exportFile: null,
  exportObjectUrl: '',
  aacFallbackRegistered: false,
  exportProfile: 'balanced',
  maskWorkA: null,
  maskWorkB: null,
  maskRefined: null,
};
const show = (id, yes = true) => $(id).classList.toggle('hidden', !yes);
const fmtTime = s =>
  Number.isFinite(s)
    ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    : '0:00';
const fmtBytes = n => {
  const u = ['o', 'Ko', 'Mo', 'Go'];
  let i = 0;
  while (n >= 1024 && i < 3) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${u[i]}`;
};

function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${kind}`;
}
function wait(target, event) {
  return new Promise((resolve, reject) => {
    const ok = () => {
      clean();
      resolve();
    };
    const bad = () => {
      clean();
      reject(target.error || new Error('media error'));
    };
    const clean = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener('error', bad);
    };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener('error', bad, { once: true });
  });
}
function aspect() {
  if (state.format === '16:9') return 16 / 9;
  if (state.format === '9:16') return 9 / 16;
  if (state.format === '1:1') return 1;
  if (state.format === '4:5') return 4 / 5;
  return state.width && state.height ? state.width / state.height : 16 / 9;
}
function resizeCanvas() {
  const a = aspect();
  let w = state.width || 1280;
  let h = state.height || 720;
  const max = 1280;
  if (state.format !== 'original') {
    if (a >= 1) {
      w = max;
      h = Math.round(w / a);
    } else {
      h = max;
      w = Math.round(h * a);
    }
  }
  const scale = Math.min(1, max / Math.max(w, h));
  canvas.width = Math.max(2, Math.round(w * scale));
  canvas.height = Math.max(2, Math.round(h * scale));
  $('stage').style.aspectRatio = `${canvas.width}/${canvas.height}`;
  draw();
}
function rect(cw, ch) {
  const sa = (state.width || 1280) / (state.height || 720);
  const ta = cw / ch;
  let w, h;
  const fit = state.crop === 'fit';
  if ((fit && sa > ta) || (!fit && sa < ta)) {
    w = cw;
    h = w / sa;
  } else {
    h = ch;
    w = h * sa;
  }
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}
function background(targetCtx, w, h, r) {
  if (state.bg === 'remove') {
    targetCtx.clearRect(0, 0, w, h);
    return;
  }
  if (state.bg === 'blur' && !state.demo) {
    targetCtx.save();
    targetCtx.filter = 'blur(22px)';
    targetCtx.drawImage(video, r.x - 20, r.y - 20, r.w + 40, r.h + 40);
    targetCtx.restore();
    return;
  }
  if (state.bg === 'custom' && state.customImage) {
    const a = state.customImage.naturalWidth / state.customImage.naturalHeight;
    const ta = w / h;
    let dw, dh;
    if (a > ta) {
      dh = h;
      dw = h * a;
    } else {
      dw = w;
      dh = w / a;
    }
    targetCtx.drawImage(state.customImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return;
  }
  if (state.bg === 'studio') {
    const g = targetCtx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#070a12');
    g.addColorStop(0.55, '#111a2d');
    g.addColorStop(1, '#05060a');
    targetCtx.fillStyle = g;
    targetCtx.fillRect(0, 0, w, h);
    targetCtx.fillStyle = 'rgba(78, 126, 255, 0.24)';
    targetCtx.fillRect(w * 0.06, h * 0.16, w * 0.025, h * 0.62);
    targetCtx.fillStyle = 'rgba(151, 89, 255, 0.2)';
    targetCtx.fillRect(w * 0.915, h * 0.12, w * 0.022, h * 0.66);
    targetCtx.fillStyle = 'rgba(255,255,255,0.04)';
    targetCtx.fillRect(w * 0.12, h * 0.76, w * 0.76, h * 0.03);
    return;
  }
  if (state.bg === 'office') {
    const g = targetCtx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#dce4eb');
    g.addColorStop(1, '#8795a4');
    targetCtx.fillStyle = g;
    targetCtx.fillRect(0, 0, w, h);
    targetCtx.fillStyle = '#8fb5cf';
    targetCtx.fillRect(w * 0.08, h * 0.12, w * 0.27, h * 0.45);
    targetCtx.fillStyle = 'rgba(255,255,255,0.7)';
    targetCtx.fillRect(w * 0.205, h * 0.12, w * 0.012, h * 0.45);
    targetCtx.fillRect(w * 0.08, h * 0.33, w * 0.27, h * 0.012);
    targetCtx.fillStyle = '#3a414a';
    targetCtx.fillRect(w * 0.67, h * 0.23, w * 0.22, h * 0.025);
    targetCtx.fillRect(w * 0.67, h * 0.39, w * 0.22, h * 0.025);
    targetCtx.fillStyle = '#5a4232';
    targetCtx.fillRect(0, h * 0.79, w, h * 0.21);
    return;
  }
  if (state.bg === 'tech') {
    const g = targetCtx.createRadialGradient(
      w * 0.5,
      h * 0.42,
      0,
      w * 0.5,
      h * 0.5,
      w * 0.7
    );
    g.addColorStop(0, '#172844');
    g.addColorStop(1, '#03060b');
    targetCtx.fillStyle = g;
    targetCtx.fillRect(0, 0, w, h);
    targetCtx.strokeStyle = 'rgba(56,189,248,0.23)';
    targetCtx.lineWidth = Math.max(1, w / 900);
    for (let x = 0; x < w; x += Math.max(40, w / 14)) {
      targetCtx.beginPath();
      targetCtx.moveTo(x, 0);
      targetCtx.lineTo(x, h);
      targetCtx.stroke();
    }
    for (let y = 0; y < h; y += Math.max(40, h / 9)) {
      targetCtx.beginPath();
      targetCtx.moveTo(0, y);
      targetCtx.lineTo(w, y);
      targetCtx.stroke();
    }
    return;
  }
  const gradients = {
    blue: ['#071426', '#1265e7'],
    violet: ['#07050b', '#7142c2'],
    warm: ['#5f4a35', '#d7c09a'],
  };
  const colors = gradients[state.bg] || ['#08090d', '#1b1e29'];
  const g = targetCtx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  targetCtx.fillStyle = g;
  targetCtx.fillRect(0, 0, w, h);
}
function drawDemo(target = canvas) {
  const c = target.getContext('2d');
  const g = c.createLinearGradient(0, 0, target.width, target.height);
  g.addColorStop(0, '#16192a');
  g.addColorStop(1, '#4f3faf');
  c.fillStyle = g;
  c.fillRect(0, 0, target.width, target.height);
  c.fillStyle = '#eef0ff';
  c.beginPath();
  c.arc(
    target.width / 2,
    target.height * 0.35,
    Math.min(target.width, target.height) * 0.1,
    0,
    Math.PI * 2
  );
  c.fill();
  c.fillStyle = '#cbd0ff';
  c.fillRect(
    target.width * 0.4,
    target.height * 0.46,
    target.width * 0.2,
    target.height * 0.34
  );
}
function drawOriginal(target = canvas) {
  const c = target.getContext('2d');
  c.clearRect(0, 0, target.width, target.height);
  if (state.demo) {
    drawDemo(target);
    captions.render(c, 1.5, target.width, target.height);
    return;
  }
  if (!state.file || video.readyState < 2) return;
  c.fillStyle = '#050608';
  c.fillRect(0, 0, target.width, target.height);
  const r = rect(target.width, target.height);
  c.drawImage(video, r.x, r.y, r.w, r.h);
  captions.render(c, video.currentTime, target.width, target.height);
}

async function initSegmenter() {
  if (state.segmenterPromise) return state.segmenterPromise;
  state.segmenterPromise = (async () => {
    setStatus('Préparation de l’IA…');
    const { FilesetResolver, ImageSegmenter } =
      await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
    );
    const options = {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      outputCategoryMask: true,
      outputConfidenceMasks: true,
    };
    try {
      state.segmenter = await ImageSegmenter.createFromOptions(vision, options);
    } catch {
      options.baseOptions.delegate = 'CPU';
      state.segmenter = await ImageSegmenter.createFromOptions(vision, options);
    }
    setStatus('IA prête', 'success');
    return state.segmenter;
  })().catch(e => {
    console.error(e);
    setStatus('IA indisponible', 'error');
    throw e;
  });
  return state.segmenterPromise;
}
function getSegmentationInput() {
  const maxSide = 512;
  const sourceW = state.width || video.videoWidth || 1280;
  const sourceH = state.height || video.videoHeight || 720;
  const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH));
  const w = Math.max(2, Math.round(sourceW * scale));
  const h = Math.max(2, Math.round(sourceH * scale));
  if (!state.segmentationCanvas)
    state.segmentationCanvas = document.createElement('canvas');
  const input = state.segmentationCanvas;
  if (input.width !== w) input.width = w;
  if (input.height !== h) input.height = h;
  const inputCtx = input.getContext('2d', { alpha: false });
  inputCtx.drawImage(video, 0, 0, w, h);
  return input;
}

async function segmentMask() {
  if (state.demo || !state.segmenter || video.readyState < 2) return null;
  return new Promise(resolve => {
    try {
      state.segmenter.segmentForVideo(
        getSegmentationInput(),
        performance.now(),
        result => {
          const confidenceMasks = result.confidenceMasks || [];
          const confidence = confidenceMasks[1] || confidenceMasks[0] || null;
          const category = result.categoryMask || null;
          const mask = confidence || category;
          if (!mask) return resolve(null);
          const w = mask.width || 256;
          const h = mask.height || 144;
          const mc = document.createElement('canvas');
          mc.width = w;
          mc.height = h;
          const mctx = mc.getContext('2d');
          const im = mctx.createImageData(w, h);
          const confidenceData = confidence?.getAsFloat32Array?.() || null;
          const categoryData = category?.getAsUint8Array?.() || null;
          const data = confidenceData || categoryData;
          if (!data) return resolve(null);
          const smoothing = Number($('smoothing').value) / 100;
          if (!state.previousMask || state.previousMask.length !== data.length)
            state.previousMask = new Float32Array(data.length);
          for (let i = 0, j = 0; i < data.length; i++, j += 4) {
            const current = confidenceData
              ? Math.round(Math.max(0, Math.min(1, data[i])) * 255)
              : data[i] === 1
                ? 255
                : 0;
            const alpha =
              current * (1 - smoothing) + state.previousMask[i] * smoothing;
            state.previousMask[i] = alpha;
            im.data[j] = 255;
            im.data[j + 1] = 255;
            im.data[j + 2] = 255;
            im.data[j + 3] = alpha;
          }
          mctx.putImageData(im, 0, 0);
          confidenceMasks.forEach(item => item?.close?.());
          category?.close?.();
          resolve(mc);
        }
      );
    } catch (e) {
      console.error(e);
      resolve(null);
    }
  });
}
function compositeWithMask(target, mask) {
  const c = target.getContext('2d');
  c.clearRect(0, 0, target.width, target.height);
  const r = rect(target.width, target.height);
  background(c, target.width, target.height, r);
  if (!state.subjectCanvas)
    state.subjectCanvas = document.createElement('canvas');
  const subject = state.subjectCanvas;
  if (subject.width !== target.width) subject.width = target.width;
  if (subject.height !== target.height) subject.height = target.height;
  const s = subject.getContext('2d');
  s.clearRect(0, 0, subject.width, subject.height);
  s.globalCompositeOperation = 'source-over';
  s.filter = 'none';
  s.drawImage(video, r.x, r.y, r.w, r.h);
  s.globalCompositeOperation = 'destination-in';
  const softness = Number($('softness').value);
  if (softness) s.filter = `blur(${softness}px)`;
  s.drawImage(mask, r.x, r.y, r.w, r.h);
  s.filter = 'none';
  s.globalCompositeOperation = 'source-over';
  c.drawImage(subject, 0, 0);
  captions.render(c, video.currentTime, target.width, target.height);
}

async function draw(target = canvas) {
  if (state.rendering || state.exporting) return;
  state.rendering = true;
  try {
    if (state.bg === 'original' || state.demo) {
      drawOriginal(target);
      return;
    }
    await initSegmenter();
    const mask = await segmentMask();
    if (!mask) {
      drawOriginal(target);
      return;
    }
    compositeWithMask(target, mask);
  } finally {
    state.rendering = false;
  }
}
function frameLoop() {
  if (state.exporting || video.paused || video.ended || state.demo) return;
  draw().finally(() => {
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype)
      video.requestVideoFrameCallback(frameLoop);
    else requestAnimationFrame(frameLoop);
  });
}

async function loadFile(file) {
  reset(false);
  state.file = file;
  state.url = URL.createObjectURL(file);
  video.src = state.url;
  video.load();
  $('fileName').textContent = file.name;
  show('landing', false);
  show('editor');
  show('newProject');
  show('overlay');
  $('overlayTitle').textContent = 'Ouverture de ta vidéo…';
  $('overlayText').textContent = 'Aucun upload cloud.';
  try {
    await wait(video, 'loadedmetadata');
    state.width = video.videoWidth;
    state.height = video.videoHeight;
    state.duration = video.duration;
    $('duration').textContent = fmtTime(video.duration);
    $('fileMeta').textContent =
      `${state.width} × ${state.height} • ${fmtTime(video.duration)} • ${fmtBytes(file.size)}`;
    $('qualityText').textContent =
      `${state.width} × ${state.height} • résolution source`;
    resizeCanvas();
    if (video.readyState < 2) await wait(video, 'loadeddata');
    drawOriginal();
    show('overlay', false);
    initSegmenter().catch(() => {});
  } catch (e) {
    console.error(e);
    $('overlayTitle').textContent = 'Impossible de lire cette vidéo';
    $('overlayText').textContent =
      'Le codec de ce fichier n’est pas pris en charge par ce navigateur. Essaie Safari sur iPhone ou un MP4 H.264.';
  }
}
$('videoInput').addEventListener('change', e => {
  const f = e.target.files?.[0];
  if (f) loadFile(f);
});
$('demoBtn').addEventListener('click', () => {
  reset(false);
  state.demo = true;
  state.width = 1280;
  state.height = 720;
  state.duration = 5;
  $('fileName').textContent = 'Mode démo';
  $('fileMeta').textContent = '1280 × 720 • aperçu synthétique';
  $('qualityText').textContent = '1280 × 720 • démo';
  show('landing', false);
  show('editor');
  show('newProject');
  resizeCanvas();
  setStatus('Mode démo', 'success');
});
$('newProject').addEventListener('click', () => reset(true));
$('play').addEventListener('click', async () => {
  if (state.demo) return;
  if (!state.file) return;
  if (video.paused || video.ended) {
    if (video.ended) video.currentTime = 0;
    await video.play();
    $('play').textContent = '❚❚';
    frameLoop();
  } else {
    video.pause();
    $('play').textContent = '▶';
  }
});
video.addEventListener('timeupdate', () => {
  if (!Number.isFinite(video.duration)) return;
  $('timeline').value = String(
    Math.round((video.currentTime / video.duration) * 1000)
  );
  $('current').textContent = fmtTime(video.currentTime);
  if (video.paused) draw();
});
video.addEventListener('ended', () => ($('play').textContent = '▶'));
$('timeline').addEventListener('input', () => {
  if (state.file && Number.isFinite(video.duration))
    video.currentTime = (Number($('timeline').value) / 1000) * video.duration;
});

document.querySelectorAll('.tab').forEach(b =>
  b.addEventListener('click', () => {
    document
      .querySelectorAll('.tab')
      .forEach(x => x.classList.remove('active'));
    document
      .querySelectorAll('.panel')
      .forEach(x => x.classList.remove('activePanel'));
    b.classList.add('active');
    $(b.dataset.panel).classList.add('activePanel');
  })
);
document.querySelectorAll('.bg').forEach(b =>
  b.addEventListener('click', async () => {
    if (!b.dataset.bg) return;
    document
      .querySelectorAll('.bg')
      .forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    state.bg = b.dataset.bg;
    if (!state.demo && state.bg !== 'original') {
      show('overlay');
      $('overlayTitle').textContent = 'Préparation du détourage…';
      $('overlayText').textContent = 'Calcul local dans ton navigateur.';
      try {
        await initSegmenter();
        await draw();
      } finally {
        show('overlay', false);
      }
    } else draw();
  })
);
$('imageInput').addEventListener('change', async e => {
  const f = e.target.files?.[0];
  if (!f) return;
  if (state.customUrl) URL.revokeObjectURL(state.customUrl);
  state.customUrl = URL.createObjectURL(f);
  const img = new Image();
  img.src = state.customUrl;
  await img.decode();
  state.customImage = img;
  state.bg = 'custom';
  document.querySelectorAll('.bg').forEach(x => x.classList.remove('selected'));
  document.querySelector('label[for="imageInput"]')?.classList.add('selected');
  if (!state.demo) await initSegmenter();
  draw();
});
document.querySelectorAll('.fmt').forEach(b =>
  b.addEventListener('click', () => {
    document
      .querySelectorAll('.fmt')
      .forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    state.format = b.dataset.format;
    resizeCanvas();
  })
);
$('fit').addEventListener('click', () => {
  state.crop = 'fit';
  $('fit').classList.add('selected');
  $('fill').classList.remove('selected');
  draw();
});
$('fill').addEventListener('click', () => {
  state.crop = 'fill';
  $('fill').classList.add('selected');
  $('fit').classList.remove('selected');
  draw();
});
$('softness').addEventListener('input', () => draw());
$('smoothing').addEventListener('input', () => draw());
$('antiHalo').addEventListener('input', () => draw());
$('holeRepair').addEventListener('input', () => draw());
$('stability').addEventListener('input', () => draw());
document.querySelectorAll('.profile').forEach(b =>
  b.addEventListener('click', () => {
    document
      .querySelectorAll('.profile')
      .forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    state.exportProfile = b.dataset.profile || 'balanced';
  })
);
document.querySelectorAll('.size').forEach(b =>
  b.addEventListener('click', () => {
    document
      .querySelectorAll('.size')
      .forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    state.exportSize = b.dataset.size;
  })
);

function exportDimensions() {
  let w = state.width;
  let h = state.height;
  const a = aspect();
  if (state.format !== 'original') {
    const max = state.exportSize === '720' ? 1280 : 1920;
    if (a >= 1) {
      w = max;
      h = Math.round(w / a);
    } else {
      h = max;
      w = Math.round(h * a);
    }
  } else {
    const cap =
      state.exportSize === '720'
        ? 1280
        : state.exportSize === '1080'
          ? 1920
          : Math.max(w, h);
    if (Math.max(w, h) > cap) {
      const s = cap / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
  }
  if (w % 2) w--;
  if (h % 2) h--;
  return { w: Math.max(2, w), h: Math.max(2, h) };
}
async function createFastExportTarget() {
  if (navigator.storage?.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle('fondvideo-export.mp4', {
        create: true,
      });
      if (handle.createWritable) {
        const writable = await handle.createWritable();
        return {
          target: new StreamTarget(writable, {
            chunked: true,
            chunkSize: 4 * 1024 * 1024,
          }),
          handle,
          bufferTarget: null,
        };
      }
    } catch (e) {
      console.warn('OPFS streaming unavailable, using memory fallback.', e);
    }
  }
  const bufferTarget = new BufferTarget();
  return { target: bufferTarget, handle: null, bufferTarget };
}

async function segmentExportSample(sample, maskState) {
  const sourceW = sample.displayWidth || state.width || 1280;
  const sourceH = sample.displayHeight || state.height || 720;
  const profileMax =
    state.exportProfile === 'fast'
      ? 224
      : state.exportProfile === 'quality'
        ? 384
        : 320;
  const maxSide = profileMax;
  const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH));
  const segW = Math.max(2, Math.round(sourceW * scale));
  const segH = Math.max(2, Math.round(sourceH * scale));
  if (maskState.input.width !== segW) maskState.input.width = segW;
  if (maskState.input.height !== segH) maskState.input.height = segH;
  const inputCtx = maskState.input.getContext('2d', { alpha: false });
  inputCtx.clearRect(0, 0, segW, segH);
  sample.draw(inputCtx, 0, 0, segW, segH);
  return new Promise(resolve => {
    try {
      state.segmenter.segmentForVideo(
        maskState.input,
        performance.now(),
        result => {
          const confidenceMasks = result.confidenceMasks || [];
          const confidence = confidenceMasks[1] || confidenceMasks[0] || null;
          const category = result.categoryMask || null;
          const mask = confidence || category;
          if (!mask) {
            confidenceMasks.forEach(item => item?.close?.());
            category?.close?.();
            resolve(null);
            return;
          }
          const mw = mask.width || segW;
          const mh = mask.height || segH;
          if (maskState.output.width !== mw) maskState.output.width = mw;
          if (maskState.output.height !== mh) maskState.output.height = mh;
          const maskCtx = maskState.output.getContext('2d');
          if (
            !maskState.image ||
            maskState.image.width !== mw ||
            maskState.image.height !== mh
          ) {
            maskState.image = maskCtx.createImageData(mw, mh);
          }
          const image = maskState.image;
          const confidenceData = confidence?.getAsFloat32Array?.() || null;
          const categoryData = category?.getAsUint8Array?.() || null;
          const data = confidenceData || categoryData;
          if (!data) {
            confidenceMasks.forEach(item => item?.close?.());
            category?.close?.();
            resolve(null);
            return;
          }
          if (
            !maskState.temporal ||
            maskState.temporal.length !== data.length
          ) {
            maskState.temporal = new Float32Array(data.length);
          }
          const baseSmoothing = Number($('smoothing').value) / 100;
          const stability = Number($('stability').value) / 100;
          const smoothing = Math.min(
            0.9,
            baseSmoothing * 0.45 + stability * 0.55
          );
          for (let i = 0, j = 0; i < data.length; i++, j += 4) {
            const current = confidenceData
              ? Math.round(Math.max(0, Math.min(1, data[i])) * 255)
              : data[i] === 1
                ? 255
                : 0;
            const alpha =
              current * (1 - smoothing) + maskState.temporal[i] * smoothing;
            maskState.temporal[i] = alpha;
            image.data[j] = 255;
            image.data[j + 1] = 255;
            image.data[j + 2] = 255;
            image.data[j + 3] = alpha;
          }
          maskCtx.putImageData(image, 0, 0);
          const refined = refineMaskCanvas(maskState.output);
          confidenceMasks.forEach(item => item?.close?.());
          category?.close?.();
          resolve(refined);
        }
      );
    } catch (e) {
      console.error(e);
      resolve(null);
    }
  });
}

function ensureMaskCanvas(key, w, h) {
  if (!state[key]) state[key] = document.createElement('canvas');
  const canvas = state[key];
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return canvas;
}

function refineMaskCanvas(mask) {
  if (!mask) return mask;
  const w = mask.width;
  const h = mask.height;
  const repair = Math.min(
    3,
    Math.round(Number($('holeRepair')?.value || 0) / 34)
  );
  const shrink = Math.min(
    3,
    Math.round(Number($('antiHalo')?.value || 0) / 34)
  );
  const softness = Math.max(0, Number($('softness')?.value || 0) * 0.18);
  let current = ensureMaskCanvas('maskWorkA', w, h);
  let scratch = ensureMaskCanvas('maskWorkB', w, h);
  let c = current.getContext('2d');
  c.clearRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
  c.filter = 'none';
  c.drawImage(mask, 0, 0);
  if (repair > 0) {
    const s = scratch.getContext('2d');
    s.clearRect(0, 0, w, h);
    s.globalCompositeOperation = 'source-over';
    for (let y = -repair; y <= repair; y++) {
      for (let x = -repair; x <= repair; x++) s.drawImage(current, x, y);
    }
    [current, scratch] = [scratch, current];
  }
  if (shrink > 0) {
    const s = scratch.getContext('2d');
    s.clearRect(0, 0, w, h);
    s.globalCompositeOperation = 'source-over';
    s.drawImage(current, 0, 0);
    s.globalCompositeOperation = 'destination-in';
    for (let y = -shrink; y <= shrink; y++) {
      for (let x = -shrink; x <= shrink; x++) {
        if (x || y) s.drawImage(current, x, y);
      }
    }
    s.globalCompositeOperation = 'source-over';
    [current, scratch] = [scratch, current];
  }
  const refined = ensureMaskCanvas('maskRefined', w, h);
  const r = refined.getContext('2d');
  r.clearRect(0, 0, w, h);
  r.filter = softness > 0 ? `blur(${softness}px)` : 'none';
  r.drawImage(current, 0, 0);
  r.filter = 'none';
  return refined;
}

function renderExportSample(sample, target, mask, staticBackground = null) {
  const c = target.getContext('2d');
  c.clearRect(0, 0, target.width, target.height);
  const r = rect(target.width, target.height);
  if (state.bg === 'original') {
    c.fillStyle = '#050608';
    c.fillRect(0, 0, target.width, target.height);
    sample.draw(c, r.x, r.y, r.w, r.h);
    captions.render(
      c,
      Number(sample.timestamp) || 0,
      target.width,
      target.height
    );
    return;
  }
  if (state.bg === 'blur') {
    c.save();
    c.filter = 'blur(22px)';
    sample.draw(c, r.x - 20, r.y - 20, r.w + 40, r.h + 40);
    c.restore();
  } else if (staticBackground) {
    c.drawImage(staticBackground, 0, 0);
  } else {
    background(c, target.width, target.height, r);
  }
  if (!mask) {
    sample.draw(c, r.x, r.y, r.w, r.h);
    captions.render(
      c,
      Number(sample.timestamp) || 0,
      target.width,
      target.height
    );
    return;
  }
  if (!state.subjectCanvas)
    state.subjectCanvas = document.createElement('canvas');
  const subject = state.subjectCanvas;
  if (subject.width !== target.width) subject.width = target.width;
  if (subject.height !== target.height) subject.height = target.height;
  const s = subject.getContext('2d');
  s.clearRect(0, 0, subject.width, subject.height);
  s.globalCompositeOperation = 'source-over';
  s.filter = 'none';
  sample.draw(s, r.x, r.y, r.w, r.h);
  s.globalCompositeOperation = 'destination-in';
  s.drawImage(mask, r.x, r.y, r.w, r.h);
  s.filter = 'none';
  s.globalCompositeOperation = 'source-over';
  c.drawImage(subject, 0, 0);
  captions.render(
    c,
    Number(sample.timestamp) || 0,
    target.width,
    target.height
  );
}

$('exportBtn').addEventListener('click', async () => {
  if (state.demo) {
    $('exportInfo').textContent =
      'Le mode démo ne génère pas de fichier. Importe une vraie vidéo.';
    return;
  }
  if (!state.file || state.exporting) return;
  if (!window.VideoEncoder || !window.VideoDecoder) {
    $('exportInfo').textContent =
      'L’export rapide WebCodecs n’est pas pris en charge par ce navigateur.';
    return;
  }
  const exportButton = $('exportBtn');
  const newProjectButton = $('newProject');
  const oldTime = video.currentTime;
  const wasPaused = video.paused;
  let wakeLock = null;
  state.exporting = true;
  exportButton.disabled = true;
  newProjectButton.disabled = true;
  exportButton.textContent = 'Export rapide…';
  video.pause();
  show('download', false);
  show('savePhotos', false);
  if (state.exportObjectUrl) {
    URL.revokeObjectURL(state.exportObjectUrl);
    state.exportObjectUrl = '';
  }
  const startedAt = performance.now();
  let pausedMs = 0;
  let pauseStartedAt = 0;
  try {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {}
    if (!(await canEncodeAudio('aac')) && !state.aacFallbackRegistered) {
      registerAacEncoder();
      state.aacFallbackRegistered = true;
    }
    if (state.bg !== 'original') await initSegmenter();
    const { w, h } = exportDimensions();
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const maskState = {
      input: document.createElement('canvas'),
      output: document.createElement('canvas'),
      temporal: null,
      image: null,
    };
    let staticBackground = null;
    if (!['original', 'blur', 'remove'].includes(state.bg)) {
      staticBackground = document.createElement('canvas');
      staticBackground.width = w;
      staticBackground.height = h;
      background(staticBackground.getContext('2d'), w, h, rect(w, h));
    }
    const cores = navigator.hardwareConcurrency || 4;
    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const profileFps =
      state.exportProfile === 'fast'
        ? 4
        : state.exportProfile === 'quality'
          ? 10
          : 7;
    const desktopBoost = !isAppleMobile && cores >= 8 ? 1 : 0;
    const maskFps = isAppleMobile
      ? Math.max(4, profileFps - 2)
      : profileFps + desktopBoost;
    const maskInterval = 1 / maskFps;
    let cachedMask = null;
    let lastMaskTime = -Infinity;
    const input = new Input({
      source: new BlobSource(state.file),
      formats: ALL_FORMATS,
    });
    const targetSetup = await createFastExportTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target: targetSetup.target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        codec: 'avc',
        quality: new Quality('very-high'),
        hardwareAcceleration: 'prefer-hardware',
        keyFrameInterval: 2,
        forceTranscode: true,
        processedWidth: w,
        processedHeight: h,
        process: async sample => {
          const timestamp = Number(sample.timestamp) || 0;
          if (
            state.bg !== 'original' &&
            (!cachedMask || timestamp - lastMaskTime >= maskInterval)
          ) {
            const nextMask = await segmentExportSample(sample, maskState);
            if (nextMask) cachedMask = nextMask;
            lastMaskTime = timestamp;
          }
          renderExportSample(sample, out, cachedMask, staticBackground);
          return out;
        },
      },
    });
    if (!conversion.isValid) {
      console.warn('Discarded tracks:', conversion.discardedTracks);
      throw new Error('Conversion WebCodecs non compatible avec ce fichier.');
    }
    let lastPercent = -1;
    conversion.onProgress = progress => {
      const percent = Math.min(99, Math.max(0, Math.floor(progress * 100)));
      if (percent === lastPercent) return;
      lastPercent = percent;
      const elapsed = Math.max(
        0.1,
        (performance.now() - startedAt - pausedMs) / 1000
      );
      const eta =
        progress > 0.02
          ? Math.max(0, (elapsed * (1 - progress)) / progress)
          : 0;
      $('exportInfo').textContent =
        eta > 1
          ? `Export WebCodecs… ${percent} % • environ ${fmtTime(eta)} restantes`
          : `Export WebCodecs… ${percent} %`;
    };
    const waitForVisible = async () => {
      if (!document.hidden) {
        if (pauseStartedAt) {
          pausedMs += performance.now() - pauseStartedAt;
          pauseStartedAt = 0;
        }
        return;
      }
      if (!pauseStartedAt) pauseStartedAt = performance.now();
      $('exportInfo').textContent =
        `Export en pause à ${Math.max(0, lastPercent)} % • reprise automatique au retour`;
      await new Promise(resolve => {
        const onVisible = () => {
          if (!document.hidden) {
            document.removeEventListener('visibilitychange', onVisible);
            resolve();
          }
        };
        document.addEventListener('visibilitychange', onVisible);
      });
      pausedMs += performance.now() - pauseStartedAt;
      pauseStartedAt = 0;
      try {
        wakeLock = await navigator.wakeLock?.request('screen');
      } catch {}
      $('exportInfo').textContent =
        `Reprise de l’export… ${Math.max(0, lastPercent)} %`;
    };
    while (conversion.state !== 'done') {
      await waitForVisible();
      const pauseController = new AbortController();
      const pauseOnHide = () => {
        if (document.hidden && conversion.state === 'executing') {
          if (!pauseStartedAt) pauseStartedAt = performance.now();
          wakeLock?.release?.().catch?.(() => {});
          wakeLock = null;
          pauseController.abort();
        }
      };
      document.addEventListener('visibilitychange', pauseOnHide);
      try {
        await conversion.execute({ pauseSignal: pauseController.signal });
      } catch (error) {
        if (!pauseController.signal.aborted) throw error;
      } finally {
        document.removeEventListener('visibilitychange', pauseOnHide);
      }
      if (conversion.state === 'idle') await waitForVisible();
    }
    let exportedFile;
    if (targetSetup.handle) {
      exportedFile = await targetSetup.handle.getFile();
    } else {
      const buffer = targetSetup.bufferTarget?.buffer;
      if (!buffer) throw new Error('Fichier exporté introuvable.');
      exportedFile = new File([buffer], 'fondvideo.mp4', { type: 'video/mp4' });
    }
    if (!exportedFile || exportedFile.size < 1024) throw new Error('Export MP4 vide ou incomplet.');
    state.exportFile = exportedFile;
    state.exportObjectUrl = URL.createObjectURL(exportedFile);
    $('download').href = state.exportObjectUrl;
    $('download').download = 'fondvideo.mp4';
    show('download');
    const canShareFile = Boolean(
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [state.exportFile] })
    );
    show('savePhotos', canShareFile);
    const elapsed = Math.max(
      0.1,
      (performance.now() - startedAt - pausedMs) / 1000
    );
    const speed = state.duration > 0 ? state.duration / elapsed : 0;
    const speedText = speed > 0 ? ` • ${speed.toFixed(1)}× temps réel` : '';
    $('exportInfo').textContent = canShareFile
      ? `Prêt en ${fmtTime(elapsed)}${speedText} • ${w} × ${h} • ${fmtBytes(exportedFile.size)} • Enregistrer dans Photos`
      : `Prêt en ${fmtTime(elapsed)}${speedText} • ${w} × ${h} • ${fmtBytes(exportedFile.size)}`;
  } catch (e) {
    console.error(e);
    $('exportInfo').textContent =
      `L’export rapide a échoué : ${e?.message || 'format non compatible'}.`;
  } finally {
    try {
      await wakeLock?.release?.();
    } catch {}
    state.exporting = false;
    state.previousMask = null;
    state.maskWorkA = null;
    state.maskWorkB = null;
    state.maskRefined = null;
    exportButton.disabled = false;
    newProjectButton.disabled = false;
    exportButton.textContent = 'Exporter la vidéo';
    video.currentTime = oldTime;
    if (!wasPaused)
      video
        .play()
        .then(frameLoop)
        .catch(() => {});
    else draw();
  }
});
$('savePhotos').addEventListener('click', async () => {
  if (!state.exportFile) return;
  try {
    if (
      !navigator.share ||
      !navigator.canShare?.({ files: [state.exportFile] })
    )
      throw new Error('file sharing unavailable');
    await navigator.share({ files: [state.exportFile], title: 'SCELYO Studio' });
    $('exportInfo').textContent =
      'Dans le menu iPhone, choisis « Enregistrer la vidéo » pour l’ajouter à Photos.';
  } catch (e) {
    if (e?.name === 'AbortError') return;
    $('exportInfo').textContent =
      'L’enregistrement direct dans Photos n’est pas disponible ici. Utilise Télécharger la vidéo.';
    show('download');
  }
});
function reset(landing = true) {
  try {
    video.pause();
  } catch {}
  if (state.url) URL.revokeObjectURL(state.url);
  if (state.customUrl) URL.revokeObjectURL(state.customUrl);
  captions.reset();
  state.file = null;
  state.url = '';
  state.width = 0;
  state.height = 0;
  state.bg = 'original';
  state.format = 'original';
  state.crop = 'fit';
  state.demo = false;
  state.customImage = null;
  state.previousMask = null;
  state.exporting = false;
  state.subjectCanvas = null;
  state.segmentationCanvas = null;
  state.exportFile = null;
  if (state.exportObjectUrl) URL.revokeObjectURL(state.exportObjectUrl);
  state.exportObjectUrl = '';
  video.removeAttribute('src');
  video.load();
  show('editor', false);
  show('newProject', false);
  show('download', false);
  show('savePhotos', false);
  if (landing) show('landing');
}
