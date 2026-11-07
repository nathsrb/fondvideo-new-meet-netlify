// @ts-nocheck
// FondVidéo : sous-titres animés, transcription IA cloud (clé privée serveur).
import { Input, BlobSource, ALL_FORMATS, AudioSampleSink } from 'mediabunny';

const catalog = [
  ['viral', 'Viral jaune', 'highlight', '#ffffff', '#fde047'],
  ['karaoke', 'Karaoké', 'karaoke', '#ffffff', '#34eec7'],
  ['pop', 'Pop', 'pop', '#ffffff', '#fc4e82'],
  ['neon', 'Néon', 'neon', '#ffffff', '#2bdcff'],
  ['cinema', 'Cinéma', 'cinema', '#ffefd2', '#d4af37'],
  ['minimal', 'Minimal', 'minimal', '#ffffff', '#ffffff'],
  ['comic', 'Comic', 'comic', '#ffffff', '#ff48c2'],
  ['gaming', 'Gaming', 'pop', '#ffffff', '#a3ff36'],
  ['outline', 'Contour', 'outline', '#ffffff', '#9484fc'],
  ['bubble', 'Bulle', 'bubble', '#14202a', '#ffffff'],
  ['gradient', 'Dégradé', 'gradient', '#ffb8dc', '#847cff'],
  ['glitch', 'Glitch', 'glitch', '#ffffff', '#00ffe1'],
  ['retro', 'Rétro', 'cinema', '#f6d7aa', '#e76f51'],
  ['type', 'Machine à écrire', 'minimal', '#f2f2e9', '#e9bd85'],
  ['glass', 'Glass', 'glass', '#ffffff', '#88bdfa'],
  ['shadow', 'Ombre 3D', 'shadow', '#ffffff', '#151629'],
  ['fire', 'Flamme', 'neon', '#fff7dd', '#ff6b29'],
  ['ice', 'Glace', 'neon', '#ffffff', '#97ebff'],
  ['sunset', 'Sunset', 'gradient', '#ffd58c', '#ff2f7c'],
  ['sticker', 'Sticker', 'sticker', '#ffffff', '#e94fb3'],
  ['gold', 'Gold', 'cinema', '#ffe4a3', '#dfa81b'],
  ['news', 'Breaking', 'boxed', '#ffffff', '#ed2546'],
  ['street', 'Street', 'comic', '#ffffff', '#f34134'],
  ['soft', 'Discret', 'minimal', '#e5e7eb', '#bbb8ff'],
  ['zoom', 'Zoom', 'pop', '#ffffff', '#f9d521'],
  ['vintage', 'Vintage', 'cinema', '#ece0bf', '#829a84'],
  ['purple', 'Violet', 'neon', '#ffffff', '#bc7dff'],
  ['marker', 'Marqueur', 'highlight', '#ffffff', '#a3ff47'],
  ['underline', 'Souligné', 'underline', '#ffffff', '#ee92cc'],
  ['tv', 'TV', 'boxed', '#ffffff', '#3d71ff'],
  ['impact', 'Impact', 'shadow', '#ffffff', '#fd7956'],
  ['pastel', 'Pastel', 'bubble', '#251d36', '#f9c0e1'],
  ['focus', 'Focus', 'karaoke', '#ffffff', '#ffd24d'],
  ['motion', 'Motion', 'pop', '#ffffff', '#2dd4bf'],
  ['luxury', 'Luxe', 'cinema', '#f5ecda', '#d3b15b'],
  ['electric', 'Électrique', 'glitch', '#ffffff', '#71aaff'],
].map(([id, name, kind, fg, accent]) => ({ id, name, kind, fg, accent }));
const initial = () => ({
  words: [],
  style: 'viral',
  size: 8.2,
  y: 76,
  enabled: true,
});
const byId = id => document.getElementById(id);
const wordsOf = value => value.trim().split(/\s+/u).filter(Boolean);
const distribute = (text, start, end) => {
  const words = wordsOf(text),
    span = Math.max(0.1, end - start);
  return words.map((text, i) => ({
    text,
    start: start + (span * i) / words.length,
    end: start + (span * (i + 1)) / words.length,
  }));
};
const timestamp = v => {
  const n = Math.round(Math.max(0, v) * 1000);
  return (
    [
      Math.floor(n / 3600000),
      Math.floor((n % 3600000) / 60000),
      Math.floor((n % 60000) / 1000),
    ]
      .map(x => String(x).padStart(2, '0'))
      .join(':') +
    ',' +
    String(n % 1000).padStart(3, '0')
  );
};
const parseStamp = str => {
  const p = str.replace(',', '.').split(':').map(Number);
  return p[0] * 3600 + p[1] * 60 + p[2];
};
export function drawCaption(ctx, time, w, h, model) {
  if (!model.enabled || !model.words.length) return;
  const index = model.words.findIndex(
    word => time >= word.start && time < word.end
  );
  if (index < 0) return;
  const start = Math.floor(index / 4) * 4,
    words = model.words.slice(start, start + 4),
    active = index - start;
  const preset = catalog.find(item => item.id === model.style) || catalog[0];
  const font = Math.max(12, Math.min(120, (Math.min(w, h) * model.size) / 100));
  const kind = preset.kind,
    width = w * 0.88;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.font =
    '900 ' +
    font +
    'px ' +
    (['cinema', 'minimal'].includes(kind)
      ? 'Georgia,serif'
      : 'system-ui,Arial,sans-serif');
  const lines = [[]];
  let running = 0;
  words.forEach((word, j) => {
    const label = ['minimal', 'cinema', 'bubble', 'glass'].includes(kind)
      ? word.text
      : word.text.toLocaleUpperCase('fr');
    const tw = ctx.measureText(label).width;
    if (lines.at(-1).length && running + tw + font * 0.28 > width) {
      lines.push([]);
      running = 0;
    }
    lines.at(-1).push({ label, j, tw });
    running += tw + font * 0.28;
  });
  let y =
    Math.max(font * 1.8, Math.min(h - font * 1.8, (h * model.y) / 100)) -
    (lines.length - 1) * font * 0.66;
  const current = model.words[index];
  const fraction = Math.max(
    0,
    Math.min(
      1,
      (time - current.start) / Math.max(0.05, current.end - current.start)
    )
  );
  lines.forEach(line => {
    const total =
      line.reduce((a, v) => a + v.tw, 0) +
      Math.max(0, line.length - 1) * font * 0.28;
    let x = w / 2 - total / 2;
    line.forEach(word => {
      const focus = word.j === active,
        p =
          1 +
          (focus
            ? (1 - fraction) * (['pop', 'comic'].includes(kind) ? 0.2 : 0.08)
            : 0);
      ctx.save();
      ctx.translate(x + word.tw / 2, y);
      ctx.scale(p, p);
      if (kind === 'glitch' && focus)
        ctx.translate(Math.sin(time * 74) * font * 0.06, 0);
      if (kind === 'pop' && focus) ctx.rotate((1 - fraction) * -0.065);
      if (['boxed', 'bubble', 'glass', 'sticker'].includes(kind)) {
        ctx.fillStyle =
          kind === 'bubble'
            ? preset.accent
            : kind === 'glass'
              ? 'rgba(14,28,52,.7)'
              : kind === 'boxed'
                ? 'rgba(8,10,22,.9)'
                : preset.accent;
        ctx.beginPath();
        ctx.roundRect(
          -word.tw / 2 - font * 0.14,
          -font * 0.58,
          word.tw + font * 0.28,
          font * 1.16,
          font * 0.16
        );
        ctx.fill();
      }
      if (['highlight', 'karaoke'].includes(kind) && focus) {
        ctx.fillStyle = preset.accent;
        ctx.beginPath();
        ctx.roundRect(
          -word.tw / 2 - font * 0.13,
          -font * 0.59,
          word.tw + font * 0.26,
          font * 1.18,
          font * 0.1
        );
        ctx.fill();
      }
      ctx.lineWidth = ['minimal', 'cinema'].includes(kind)
        ? font * 0.03
        : font * 0.11;
      ctx.strokeStyle = '#11131b';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      if (kind === 'neon') {
        ctx.shadowColor = preset.accent;
        ctx.shadowBlur = font * (focus ? 0.5 : 0.18);
      }
      if (kind === 'shadow') {
        ctx.shadowColor = '#000';
        ctx.shadowBlur = font * 0.13;
        ctx.shadowOffsetY = font * 0.11;
      }
      if (kind === 'glitch' && focus) {
        ctx.shadowColor = '#f6047a';
        ctx.shadowBlur = font * 0.18;
        ctx.shadowOffsetX = font * 0.06;
      }
      if (!['minimal'].includes(kind)) ctx.strokeText(word.label, 0, 0);
      if (kind === 'gradient') {
        const g = ctx.createLinearGradient(0, -font * 0.6, 0, font * 0.6);
        g.addColorStop(0, preset.fg);
        g.addColorStop(1, preset.accent);
        ctx.fillStyle = g;
      } else
        ctx.fillStyle =
          kind === 'highlight' && focus
            ? '#10151c'
            : focus
              ? preset.accent
              : preset.fg;
      ctx.fillText(word.label, 0, 0);
      if (kind === 'underline' && focus) {
        ctx.fillStyle = preset.accent;
        ctx.fillRect(-word.tw / 2, font * 0.53, word.tw, font * 0.09);
      }
      if (kind === 'karaoke' && focus) {
        ctx.fillStyle = preset.accent;
        ctx.fillRect(
          -word.tw / 2,
          font * 0.54,
          word.tw * fraction,
          font * 0.06
        );
      }
      ctx.restore();
      x += word.tw + font * 0.28;
    });
    y += font * 1.32;
  });
  ctx.restore();
}
function parseSrt(text) {
  const words = [];
  for (const block of text
    .replace(/\r/g, '')
    .trim()
    .split(/\n\s*\n/)) {
    const lines = block.split('\n'),
      i = lines.findIndex(line => line.includes('-->'));
    if (i < 0) continue;
    const match = lines[i].match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );
    if (!match) continue;
    const a = parseStamp(match[1]),
      b = parseStamp(match[2]);
    if (b > a) words.push(...distribute(lines.slice(i + 1).join(' '), a, b));
  }
  return words;
}
function exportSrt(words) {
  const blocks = [];
  for (let i = 0; i < words.length; i += 4) {
    const group = words.slice(i, i + 4);
    blocks.push(
      String(blocks.length + 1) +
        '\n' +
        timestamp(group[0].start) +
        ' --> ' +
        timestamp(group.at(-1).end) +
        '\n' +
        group.map(x => x.text).join(' ')
    );
  }
  const url = URL.createObjectURL(
    new Blob([blocks.join('\n\n')], { type: 'application/x-subrip' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fondvideo.srt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}
async function extractAudio(file, seconds, report, offset = 0) {
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error('Aucune piste audio détectée.');
  if (!(await track.canDecode()))
    throw new Error('Codec audio non pris en charge.');
  const sink = new AudioSampleSink(track),
    output = new Float32Array(Math.ceil(seconds * 16000));
  for await (const sample of sink.samples(offset, offset + seconds)) {
    try {
      const opt = { planeIndex: 0, format: 'f32-planar' };
      const data = new Float32Array(sample.allocationSize(opt) / 4);
      sample.copyTo(data, opt);
      const begin = Math.max(0, Math.ceil((sample.timestamp - offset) * 16000));
      const end = Math.min(
        output.length,
        Math.floor((sample.timestamp + sample.duration - offset) * 16000)
      );
      for (let j = begin; j < end; j++) {
        const p = Math.max(
          0,
          Math.min(
            data.length - 1,
            (offset + j / 16000 - sample.timestamp) * sample.sampleRate
          )
        );
        const k = Math.floor(p),
          f = p - k;
        output[j] =
          data[k] * (1 - f) + data[Math.min(data.length - 1, k + 1)] * f;
      }
      if (Math.random() < 0.002)
        report(
          'Extraction audio locale… ' +
            Math.round((end / output.length) * 100) +
            ' %'
        );
    } finally {
      sample.close();
    }
  }
  return output;
}

function audioToWav16(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (position, value) => { for (let i = 0; i < value.length; i++) view.setUint8(position + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true);
  write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.min(1, Math.max(-1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// Legacy local Whisper retained for compatibility but not used by cloud transcription.
const whisperPipelines = new Map();
async function getWhisper(report, quality = 'balanced') {
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const candidates = quality === 'maximum'
    ? ['onnx-community/whisper-small', 'onnx-community/whisper-base', 'onnx-community/whisper-tiny']
    : quality === 'fast'
      ? ['onnx-community/whisper-tiny']
      : ['onnx-community/whisper-base', 'onnx-community/whisper-tiny'];
  const { pipeline } = await import('@huggingface/transformers');
  const configs = !mobile && navigator.gpu
    ? [{ device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } }, { device: 'wasm', dtype: 'q8' }]
    : [{ device: 'wasm', dtype: 'q8' }];
  let last;
  for (const model of candidates) {
    for (const config of configs) {
      const key = model + '/' + config.device;
      if (whisperPipelines.has(key)) return whisperPipelines.get(key);
      try {
        report('Chargement de ' + model.split('/').pop() + ' (' + config.device + ')…');
        const pipe = await pipeline('automatic-speech-recognition', model, {
          ...config,
          progress_callback: data => {
            if (data.status === 'progress' && Number.isFinite(data.progress))
              report('Téléchargement du modèle… ' + Math.round(data.progress) + ' %');
          },
        });
        whisperPipelines.set(key, pipe);
        return pipe;
      } catch (err) {
        last = err;
        report('Modèle indisponible, essai d’un modèle plus léger…');
      }
    }
  }
  throw last || new Error('Whisper indisponible.');
}
function resultsToWords(result, offset, length) {
  const chunks = (result.chunks || []).filter(x => x.text?.trim());
  const valid =
    chunks.length &&
    chunks.every(
      x =>
        Number.isFinite(x.timestamp?.[0]) &&
        Number.isFinite(x.timestamp?.[1]) &&
        x.timestamp[1] > x.timestamp[0] &&
        x.timestamp[1] < length + 2
    );
  if (!valid) return distribute(result.text || '', offset, offset + length);
  return chunks.flatMap(x =>
    distribute(x.text, offset + x.timestamp[0], offset + x.timestamp[1])
  );
}
export function createCaptionStudio({
  getFile,
  getDuration,
  getTime,
  preview,
}) {
  let page=0;
  const undoStack = [];
  const redoStack = [];
  const snapshot = () => state.words.map(w => ({...w}));
  function remember() {
    undoStack.push(snapshot());
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
  }
  function restore(words) {
    state.words = words.map(w => ({...w}));
    refresh(); repaint();
  }
  const pageSize=100;
  const state = initial(),
    report = text => {
      byId('capStatus').textContent = text;
    };
  const repaint=()=>preview();
  function renderTimeline(){
    const holder=byId('capTimeline');
    if(!holder)return;
    holder.replaceChildren();
    if(!state.words.length){holder.textContent='Ajoute des mots pour remplir la piste.';return;}
    const duration=Math.max(1,Number(getDuration())||0,...state.words.map(w=>w.end));
    const width=Math.min(7000,Math.max(800,duration*24));
    const lane=document.createElement('div');lane.className='cap-lane';lane.style.width=width+'px';
    for(let i=0;i<state.words.length;i+=4){
      const group=state.words.slice(i,i+4),first=group[0],last=group.at(-1);
      const clip=document.createElement('button');clip.type='button';clip.className='cap-clip';
      clip.textContent=group.map(w=>w.text).join(' ');
      const update=()=>{
        clip.style.left=(first.start/duration*100)+'%';
        clip.style.width=(Math.max(.06,last.end-first.start)/duration*100)+'%';
      };update();
      clip.ondblclick=()=>{const inputs=byId('capWords').querySelectorAll('.cap-word input[type=text]');page=Math.floor(i/pageSize);refresh();byId('capWords').querySelector('input[type=text]')?.focus();};
      clip.onpointerdown=e=>{
        if(e.button!==0)return;
        e.preventDefault();
        const box=clip.getBoundingClientRect();
        const mode=e.clientX-box.left<10?'start':box.right-e.clientX<10?'end':'move';
        remember();
        const x=e.clientX,original=group.map(w=>({start:w.start,end:w.end}));
        clip.setPointerCapture(e.pointerId);
        const move=ev=>{
          const delta=(ev.clientX-x)/width*duration;
          if(mode==='start')first.start=Math.max(0,Math.min(original[0].end-.05,original[0].start+delta));
          else if(mode==='end')last.end=Math.max(original.at(-1).start+.05,Math.min(duration,original.at(-1).end+delta));
          else{
            const shift=Math.max(-original[0].start,Math.min(duration-original.at(-1).end,delta));
            group.forEach((w,j)=>{w.start=original[j].start+shift;w.end=original[j].end+shift;});
          }
          update();repaint();
        };
        const done=()=>{
          clip.removeEventListener('pointermove',move);
          clip.removeEventListener('pointerup',done);
          clip.removeEventListener('pointercancel',done);
          state.words.sort((a,b)=>a.start-b.start);refresh();repaint();
        };
        clip.addEventListener('pointermove',move);
        clip.addEventListener('pointerup',done,{once:true});
        clip.addEventListener('pointercancel',done,{once:true});
      };
      lane.append(clip);
    }
    holder.append(lane);
  }
  const refresh = () => {
    document.querySelectorAll('[data-style]').forEach(b => {
      const selected = b.dataset.style === state.style;
      b.classList.toggle('selected', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
    byId('capCount').textContent = state.words.length + ' mots';
    const list = byId('capWords');
    list.replaceChildren();
    page=Math.min(page,Math.max(0,Math.ceil(state.words.length/pageSize)-1));
    state.words.slice(page*pageSize,(page+1)*pageSize).forEach((word,i)=>{
      const index=page*pageSize+i;
      const row = document.createElement('div');
      row.className = 'cap-word';
      const start = document.createElement('input');
      start.type = 'number';
      start.step = '.05';
      start.min = '0';
      start.value = word.start.toFixed(2);
      start.title = 'Début en secondes';
      const end = document.createElement('input');
      end.type = 'number';
      end.step = '.05';
      end.min = '0';
      end.value = word.end.toFixed(2);
      end.title = 'Fin en secondes';
      const label = document.createElement('input');
      label.type = 'text';
      label.value = word.text;
      label.maxLength = 120;
      label.title = 'Mot';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Supprimer';
      start.onchange = () => {
        remember();
        word.start = Math.max(0,Math.min(word.end-.05,Number(start.value)||0));
        state.words.sort((a,b)=>a.start-b.start);refresh();repaint();
      };
      end.onchange = () => {
        remember();
        word.end = Math.max(
          word.start + 0.05,
          Number(end.value) || word.start + 0.1
        );
        refresh();repaint();
      };
      label.onfocus = () => remember();
      label.oninput = () => {
        word.text = label.value;
        renderTimeline();repaint();
      };
      remove.onclick = () => {
        remember();
        state.words.splice(index, 1);
        refresh();
        repaint();
      };
      row.append(start, end, label, remove);
      list.append(row);
    });
    const n=state.words.length;
    byId('capRange').textContent=n?((page*pageSize+1)+'–'+Math.min(n,(page+1)*pageSize)+' / '+n):'0 mot';
    byId('capPrev').disabled=page===0;
    byId('capNext').disabled=(page+1)*pageSize>=n;
    renderTimeline();
  };
  byId('capUndo').onclick = () => {
    if (!undoStack.length) return;
    redoStack.push(snapshot()); restore(undoStack.pop());
  };
  byId('capRedo').onclick = () => {
    if (!redoStack.length) return;
    undoStack.push(snapshot()); restore(redoStack.pop());
  };
  byId('capReplaceAll').onclick = () => {
    const from = byId('capFind').value.trim();
    const to = byId('capReplace').value.trim();
    if (!from) return report('Saisis le mot ou l’expression à corriger.');
    const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escapeRegex(from), 'giu');
    const needle = from.toLocaleLowerCase().split(/\s+/u);
    let count = 0;
    const updated = state.words.map(w => ({...w}));
    // Multi-word correction keeps the original time range and redistributes it.
    if (needle.length > 1) {
      for (let i = updated.length - needle.length; i >= 0; i--) {
        const match = updated.slice(i, i + needle.length)
          .map(w => w.text.replace(/[.,!?;:]+$/gu, '').toLocaleLowerCase());
        if (!match.every((text, j) => text === needle[j])) continue;
        const first = updated[i], last = updated[i + needle.length - 1];
        updated.splice(i, needle.length, ...distribute(to, first.start, last.end));
        count++;
      }
    } else {
      for (const w of updated) {
        re.lastIndex = 0;
        if (re.test(w.text)) {
          re.lastIndex = 0;
          w.text = w.text.replace(re, to);
          count++;
        }
      }
    }
    if (!count) return report('Aucune correspondance trouvée.');
    remember(); state.words = updated; refresh(); repaint();
    report(count + ' mot(s) corrigé(s). Tu peux annuler la modification.');
  };
  byId('capPrev').onclick=()=>{page=Math.max(0,page-1);refresh();};
  byId('capNext').onclick=()=>{page+=1;refresh();};
  catalog.forEach(preset => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cap-style';
    b.dataset.style = preset.id;
    const sample = document.createElement('span');
    sample.className = 'cap-sample';
    sample.textContent = 'WOW !';
    sample.style.color = ['highlight', 'bubble'].includes(preset.kind)
      ? '#12151b'
      : preset.fg;
    sample.style.background = ['highlight', 'bubble', 'boxed'].includes(
      preset.kind
    )
      ? preset.accent
      : 'transparent';
    sample.style.textShadow =
      preset.kind === 'neon'
        ? '0 0 10px ' + preset.accent
        : '2px 2px 0 #050509';
    const title = document.createElement('small');
    title.textContent = preset.name;
    b.append(sample, title);
    b.onclick = () => {
      state.style = preset.id;
      refresh();
      repaint();
    };
    byId('capStyles').append(b);
  });
  byId('capEnabled').onchange = e => {
    state.enabled = e.target.checked;
    repaint();
  };
  byId('capSize').oninput = e => {
    state.size = Number(e.target.value);
    byId('capSizeValue').textContent = state.size + ' %';
    repaint();
  };
  byId('capPosition').oninput = e => {
    state.y = Number(e.target.value);
    repaint();
  };
  byId('capManual').onclick = () => {
    const text = byId('capText').value.trim();
    if (!text) {
      report('Écris d’abord ton texte.');
      return;
    }
    remember();
    state.words = distribute(text, 0, Math.max(2, getDuration()));
    refresh();
    repaint();
    report('Sous-titres créés. Ajuste les temps si nécessaire.');
  };
  byId('capAdd').onclick = () => {
    const t = Math.max(0, getTime());
    remember();
    state.words.push({ text: 'Nouveau', start: t, end: t + 1.2 });
    state.words.sort((a, b) => a.start - b.start);
    refresh();
    repaint();
    report('Mot ajouté.');
  };
  byId('capSrtIn').onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const words = parseSrt(await f.text());
    if (words.length) {
      remember();
      state.words = words;
      refresh();
      repaint();
      report('Fichier SRT importé.');
    } else report('Le fichier SRT ne contient aucun sous-titre lisible.');
    e.target.value = '';
  };
  byId('capSrtOut').onclick = () => {
    if (!state.words.length) {
      report('Aucun sous-titre à exporter.');
      return;
    }
    exportSrt(state.words);
    report('SRT téléchargé.');
  };
  byId('capGenerate').onclick = async () => {
    const file = getFile();
    if (!file) {
      report('Importe une vraie vidéo avec du son.');
      return;
    }
    const duration = getDuration();
    if (!Number.isFinite(duration) || duration <= 0) {
      report('Durée de vidéo inconnue.');
      return;
    }
    const seconds = duration;
    const btn = byId('capGenerate');
    btn.disabled = true;
    btn.textContent = 'Transcription IA…';
    try {
      const language = byId('capLanguage').value;
      const languageCode = { french: 'fr', english: 'en', spanish: 'es' }[language] || '';
      const chunkSize = 24;
      const overlap = 1.5;
      const words = [];
      for (let start = 0; start < seconds; start += chunkSize - overlap) {
        const length = Math.min(chunkSize, seconds - start);
        report('Préparation audio… ' + Math.round(start / seconds * 100) + ' %');
        const audio = await extractAudio(file, length, report, start);
        const wav = audioToWav16(audio, 16000);
        const form = new FormData();
        form.append('audio', wav, 'extrait.wav');
        if (languageCode) form.append('language', languageCode);
        const context = byId('capVocabulary')?.value?.trim();
        if (context) form.append('prompt', context.slice(0, 1000));
        report('Reconnaissance haute précision sur serveur… ' + Math.round(start / seconds * 100) + ' %');
        const response = await fetch('/.netlify/functions/transcribe', { method: 'POST', body: form });
        let data;
        try { data = await response.json(); } catch { throw new Error('Réponse de transcription illisible'); }
        if (!response.ok) throw new Error(data.error || 'Erreur du service de transcription');
        const chunkWords = Array.isArray(data.words) && data.words.length
          ? data.words.map(w => ({ text: String(w.text || w.word || '').trim(), start: Number(w.start) + start, end: Number(w.end) + start }))
          : (data.segments || []).flatMap(seg => distribute(seg.text || '', Number(seg.start) + start, Number(seg.end) + start));
        const cutoff = start === 0 ? 0 : start + overlap / 2;
        for (const word of chunkWords) {
          if (!word.text || !Number.isFinite(word.start) || !Number.isFinite(word.end)) continue;
          if (word.end <= word.start || (word.start + word.end) / 2 < cutoff) continue;
          if (words.some(prev => Math.abs(prev.start - word.start) < .24 && prev.text.toLowerCase() === word.text.toLowerCase())) continue;
          words.push(word);
        }
        if (start + length >= seconds) break;
      }
      if (!words.length) throw new Error('Aucune parole détectée.');
      remember();
      state.words = words.sort((a, b) => a.start - b.start);
      refresh();
      repaint();
      report(words.length + ' mots transcrits avec Whisper Large V3. Corrige les éventuelles erreurs directement dans la piste.');
    } catch (e) {
      console.error(e);
      report(
        'Transcription indisponible : ' +
          (e.message || 'erreur') +
          '. Utilise le texte manuel ou un SRT.'
      );
    } finally {
      btn.disabled = false;
      btn.textContent = 'Générer automatiquement';
    }
  };
  refresh();
  return {
    render: (ctx, time, w, h) => drawCaption(ctx, time, w, h, state),
    reset: () => {
      Object.assign(state, initial());page=0;undoStack.length=0;redoStack.length=0;
      byId('capText').value = '';
      byId('capEnabled').checked = true;
      byId('capSize').value = String(state.size);
      byId('capSizeValue').textContent = state.size + ' %';
      byId('capPosition').value = String(state.y);
      refresh();
      report('Sous-titres prêts.');
    },
  };
}
