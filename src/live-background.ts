// @ts-nocheck
// Réutilisation du moteur de décors de FondVidéo pour les appels en direct.
export const backgrounds = [
  ['original', 'Original'],
  ['blur', 'Flou'],
  ['studio', 'Studio'],
  ['office', 'Bureau'],
  ['tech', 'Tech'],
  ['blue', 'Bleu'],
  ['violet', 'Violet'],
  ['warm', 'Beige'],
  ['custom', 'Mon image'],
];
export const formats = [
  ['original', 'Original'],
  ['16:9', 'YouTube 16:9'],
  ['9:16', 'TikTok 9:16'],
  ['1:1', 'Carré 1:1'],
  ['4:5', 'Instagram 4:5'],
];
export function videoDimensions(
  format,
  quality,
  sourceW = 1920,
  sourceH = 1080
) {
  const ratio =
    format === '9:16'
      ? 9 / 16
      : format === '1:1'
        ? 1
        : format === '4:5'
          ? 4 / 5
          : format === '16:9'
            ? 16 / 9
            : sourceW / (sourceH || 1);
  // Avoid huge 4K AI canvas allocations on iPhone; camera input is independent.
  const max = quality === '720' ? 1280 : 1920;
  const w = ratio >= 1 ? max : Math.round(max * ratio),
    h = ratio >= 1 ? Math.round(max / ratio) : max;
  return {
    width: Math.max(2, Math.round(w / 2) * 2),
    height: Math.max(2, Math.round(h / 2) * 2),
  };
}
// Keep the camera source and background config local to this stream.
// A module-level mutable <video> caused interference between render instances.
function background(targetCtx, w, h, r, source, bg, customImage) {
  if (bg === 'remove') {
    targetCtx.clearRect(0, 0, w, h);
    return;
  }
  if (bg === 'blur') {
    // Blur a full-frame "cover" copy, *under* the segmented foreground.
    // Never paint an unmasked sharp frame over it while the mask is loading.
    const sourceW = source.videoWidth || w, sourceH = source.videoHeight || h;
    const scale = Math.max(w / sourceW, h / sourceH);
    const drawW = sourceW * scale, drawH = sourceH * scale;
    const padding = Math.max(24, Math.round(Math.min(w, h) * .065));
    targetCtx.save();
    targetCtx.filter = 'blur(' + padding + 'px) brightness(.93)';
    targetCtx.drawImage(source, (w - drawW) / 2 - padding, (h - drawH) / 2 - padding, drawW + 2 * padding, drawH + 2 * padding);
    targetCtx.restore();
    return;
  }
  if (bg === 'custom' && customImage) {
    const a = customImage.naturalWidth / customImage.naturalHeight;
    const ta = w / h;
    let dw, dh;
    if (a > ta) {
      dh = h;
      dw = h * a;
    } else {
      dw = w;
      dh = w / a;
    }
    targetCtx.drawImage(customImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return;
  }
  if (bg === 'studio') {
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
  if (bg === 'office') {
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
  if (bg === 'tech') {
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
  const colors = gradients[bg] || ['#08090d', '#1b1e29'];
  const g = targetCtx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  targetCtx.fillStyle = g;
  targetCtx.fillRect(0, 0, w, h);
}

export async function processCamera(raw, initial, report) {
  const input = document.createElement('video');
  input.srcObject = raw;
  input.muted = true;
  input.autoplay = true;
  input.playsInline = true;
  await input.play();
  let config = initial,
    stopped = false,
    pending = false,
    lastSegmentAt = 0;
  let segmenter = null,
    segmenterPromise = null,
    maskCanvas = null,
    oldMask = null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  // Keep a reusable foreground buffer instead of allocating a 1080p canvas on every frame.
  const person = document.createElement('canvas');
  const personCtx = person.getContext('2d');
  let lastMaskReady = 0;
  if (!ctx || !canvas.captureStream)
    throw Error('Canvas caméra non compatible.');
  function syncSize() {
    const dims = videoDimensions(
      config.format,
      config.quality,
      input.videoWidth || 1280,
      input.videoHeight || 720
    );
    if (canvas.width !== dims.width) canvas.width = dims.width;
    if (canvas.height !== dims.height) canvas.height = dims.height;
    if (person.width !== canvas.width) person.width = canvas.width;
    if (person.height !== canvas.height) person.height = canvas.height;
  }
  async function initSegmentation() {
    if (!segmenterPromise) {
      segmenterPromise = (async () => {
        const { FilesetResolver, ImageSegmenter } = await import(
          /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm'
        );
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
        );
        const options = {
          baseOptions: {
            modelAssetPath:
              input.videoHeight > input.videoWidth
                ? 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
                : 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: true,
        };
        try {
          return await ImageSegmenter.createFromOptions(vision, options);
        } catch {
          options.baseOptions.delegate = 'CPU';
          return ImageSegmenter.createFromOptions(vision, options);
        }
      })();
    }
    return segmenterPromise;
  }
  const segCanvas = document.createElement('canvas');
  const segCtx = segCanvas.getContext('2d');
  async function updateMask() {
    if (pending || stopped || config.bg === 'original' || input.readyState < 2)
      return;
    pending = true;
    try {
      if (!segmenter) {
        report('Préparation du détourage caméra…');
        segmenter = await initSegmentation();
        report('Arrière-plan caméra prêt.');
      }
      const scale = Math.min(
        1,
        512 / Math.max(input.videoWidth, input.videoHeight)
      );
      segCanvas.width = Math.max(2, Math.round(input.videoWidth * scale));
      segCanvas.height = Math.max(2, Math.round(input.videoHeight * scale));
      segCtx.drawImage(input, 0, 0, segCanvas.width, segCanvas.height);
      await new Promise(resolve => {
        try {
          segmenter.segmentForVideo(segCanvas, performance.now(), result => {
            try {
              const confidence =
                result.confidenceMasks?.[1] ||
                result.confidenceMasks?.[0] ||
                null;
              const category = result.categoryMask || null;
              const mask = confidence || category;
              if (!mask) return resolve();
              if (!maskCanvas) maskCanvas = document.createElement('canvas');
              maskCanvas.width = mask.width || 256;
              maskCanvas.height = mask.height || 144;
              const c = maskCanvas.getContext('2d');
              const img = c.createImageData(
                maskCanvas.width,
                maskCanvas.height
              );
              const floats = confidence?.getAsFloat32Array?.() || null;
              const data = floats || category?.getAsUint8Array?.();
              if (!data) return resolve();
              if (!oldMask || oldMask.length !== data.length)
                oldMask = new Float32Array(data.length);
              for (let i = 0, j = 0; i < data.length; i++, j += 4) {
                const alpha = floats
                  ? Math.max(0, Math.min(255, data[i] * 255))
                  : data[i] === 1
                    ? 255
                    : 0;
                const pixel = alpha < 12 ? 0 : alpha > 247 ? 255 : alpha;
                // Soft temporal smoothing, matching FondVidéo's mask pipeline.
                oldMask[i] = pixel * 0.82 + oldMask[i] * 0.18;
                img.data[j] = 255;
                img.data[j + 1] = 255;
                img.data[j + 2] = 255;
                img.data[j + 3] = oldMask[i];
              }
              c.putImageData(img, 0, 0);
              lastMaskReady = performance.now();
              result.confidenceMasks?.forEach(m => m?.close?.());
              category?.close?.();
            } finally {
              resolve();
            }
          });
        } catch {
          resolve();
        }
      });
    } catch (err) {
      report('Décor indisponible sur cet appareil. Réessaie avec Original.');
    } finally {
      pending = false;
    }
  }
  let id = 0;
  function paint() {
    if (stopped) return;
    if (input.readyState >= 2 && input.videoWidth) {
      try {
        syncSize();
        const ratio = input.videoWidth / input.videoHeight,
          target = canvas.width / canvas.height;
        let w, h;
        // Default to contain, not cover: portrait iPhone camera must never be
        // vertically cropped inside a 16:9 landscape conference frame.
        // The unused space is filled by the configured virtual background.
        if (ratio > target) {
          w = canvas.width;
          h = w / ratio;
        } else {
          h = canvas.height;
          w = h * ratio;
        }
        const r = {
          x: (canvas.width - w) / 2,
          y: (canvas.height - h) / 2,
          w,
          h,
        };
        ctx.fillStyle = '#060810';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (config.bg === 'original') ctx.drawImage(input, r.x, r.y, r.w, r.h);
        else {
          background(ctx, canvas.width, canvas.height, r, input, config.bg, config.photo);
          // Segmentation can run slower than 3fps on phones. Preserve the last
          // valid matte longer so the sharp camera never erases the blurred backdrop.
          if (maskCanvas && personCtx && performance.now() - lastMaskReady < 1600) {
            // FondVidéo classic's compositing: softly feathered mask, rather than sharp edges.
            personCtx.globalCompositeOperation = 'source-over';
            personCtx.filter = 'none';
            personCtx.clearRect(0, 0, person.width, person.height);
            personCtx.drawImage(input, r.x, r.y, r.w, r.h);
            personCtx.globalCompositeOperation = 'destination-in';
            personCtx.filter = 'blur(1.6px)';
            personCtx.drawImage(maskCanvas, r.x, r.y, r.w, r.h);
            personCtx.filter = 'none';
            personCtx.globalCompositeOperation = 'source-over';
            ctx.drawImage(person, 0, 0);
          } else if (config.bg !== 'blur') {
            // For other scenes, show camera while AI initializes.
            // In blur mode the blurry backdrop remains visible rather than
            // silently showing an entirely sharp picture.
            ctx.drawImage(input, r.x, r.y, r.w, r.h);
          }
          if (!pending && performance.now() - lastSegmentAt > (config.bg === 'blur' ? 55 : 38)) {
            lastSegmentAt = performance.now();
            void updateMask();
          }
        }
      } catch {}
    }
    id = requestAnimationFrame(paint);
  }
  syncSize();
  paint();
  const output = canvas.captureStream(24);
  const stream = new MediaStream([
    ...output.getVideoTracks(),
    ...raw.getAudioTracks(),
  ]);
  return {
    stream,
    update(value) {
      config = value;
      maskCanvas = null;
      oldMask = null;
      syncSize();
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(id);
      output.getTracks().forEach(t => t.stop());
      input.pause();
      input.srcObject = null;
      segmenter?.close?.();
    },
  };
}
