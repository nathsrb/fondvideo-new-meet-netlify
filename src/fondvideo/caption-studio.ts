// @ts-nocheck
// FondVidéo : sous-titres animés et transcription sans API distante.
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
  x: 50,
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
  const font = Math.max(9, Math.min(240, (Math.min(w, h) * model.size) / 100));
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
    let x = (w * (model.x ?? 50)) / 100 - total / 2;
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
async function extractAudio(file, seconds, report) {
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
  for await (const sample of sink.samples(0, seconds)) {
    try {
      const opt = { planeIndex: 0, format: 'f32-planar' };
      const data = new Float32Array(sample.allocationSize(opt) / 4);
      sample.copyTo(data, opt);
      const begin = Math.max(0, Math.ceil(sample.timestamp * 16000));
      const end = Math.min(
        output.length,
        Math.floor((sample.timestamp + sample.duration) * 16000)
      );
      for (let j = begin; j < end; j++) {
        const p = Math.max(
          0,
          Math.min(
            data.length - 1,
            (j / 16000 - sample.timestamp) * sample.sampleRate
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
// 16 kHz mono PCM WAV makes upload size predictable, with word-level
// timestamps returned directly by Groq Whisper Large V3.
function wavOf(part) {
  const buffer = new ArrayBuffer(44 + part.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset, text) => { for (let i=0;i<text.length;i++) view.setUint8(offset+i,text.charCodeAt(i)); };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + part.length*2, true);
  ascii(8, 'WAVE');ascii(12, 'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,16000,true);view.setUint32(28,32000,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);
  ascii(36,'data');view.setUint32(40,part.length*2,true);
  for (let i=0;i<part.length;i++) {
    const n = Math.max(-1, Math.min(1,part[i]));
    view.setInt16(44+i*2, Math.round(n < 0 ? n*32768 : n*32767),true);
  }
  return buffer;
}
async function groqTranscribe(audio, seconds, language, report) {
  const words = [];
  const chunks = Math.ceil(seconds / 25);
  for (let i=0;i<chunks;i++) {
    const start = i * 25;
    const length = Math.min(25, seconds - start);
    const part = audio.subarray(Math.round(start*16000),Math.round((start+length)*16000));
    if(!part.length) continue;
    report('Whisper Large V3 : extrait '+(i+1)+' / '+chunks+'…');
    const response = await fetch('/scelyo-transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav', 'x-scelyo-language': ({
        french:'fr', english:'en', spanish:'es'
      })[language] || 'auto' },
      body: wavOf(part),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 404
      ? 'Service de transcription introuvable sur cette prévisualisation.'
      : data.error || 'Whisper Large V3 indisponible (erreur '+response.status+').');
    const returned = (data.words || []).filter(w =>
      w.word?.trim() && Number.isFinite(w.start) && Number.isFinite(w.end));
    if(returned.length) {
      words.push(...returned.map(w => ({
        text: w.word.trim(),
        start: Math.max(0, start+w.start),
        end: Math.max(start+w.start+0.05, start+w.end)
      })));
    } else if(data.segments?.length) {
      for (const segment of data.segments) {
        words.push(...distribute(segment.text||'',start+segment.start,start+segment.end));
      }
    } else if(data.text) {
      words.push(...distribute(data.text,start,start+length));
    }
  }
  if (!words.length) throw new Error('Aucune parole reconnue avec Whisper Large V3.');
  return words;
}
let whisper = null;
async function getWhisper(report) {
  if (whisper) return whisper;
  const { pipeline } = await import('@huggingface/transformers');
  const mobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const configs =
    !mobile && navigator.gpu
      ? [
          {
            device: 'webgpu',
            dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
          },
          { device: 'wasm', dtype: 'q8' },
        ]
      : [{ device: 'wasm', dtype: 'q8' }];
  let last;
  for (const config of configs) {
    try {
      report('Téléchargement / chargement du modèle Whisper gratuit…');
      whisper = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-tiny',
        {
          ...config,
          progress_callback: data => {
            if (data.status === 'progress' && Number.isFinite(data.progress))
              report('Chargement Whisper… ' + Math.round(data.progress) + ' %');
          },
        }
      );
      return whisper;
    } catch (err) {
      last = err;
      report('Accélération indisponible, essai du mode CPU…');
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
      clip.onpointerdown=e=>{
        if(e.button!==0)return;
        e.preventDefault();
        const box=clip.getBoundingClientRect();
        const mode=e.clientX-box.left<10?'start':box.right-e.clientX<10?'end':'move';
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
      label.title = 'Mot — clique pour corriger';
      label.className = 'cap-word-text';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Supprimer';
      start.onchange = () => {
        word.start = Math.max(0,Math.min(word.end-.05,Number(start.value)||0));
        state.words.sort((a,b)=>a.start-b.start);refresh();repaint();
      };
      end.onchange = () => {
        word.end = Math.max(
          word.start + 0.05,
          Number(end.value) || word.start + 0.1
        );
        refresh();repaint();
      };
      label.oninput = () => {
        word.text = label.value;
        renderTimeline();repaint();
      };
      remove.onclick = () => {
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
    state.words = distribute(text, 0, Math.max(2, getDuration()));
    refresh();
    repaint();
    report('Sous-titres créés. Ajuste les temps si nécessaire.');
  };
  byId('capAdd').onclick = () => {
    const t = Math.max(0, getTime());
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
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const seconds = Math.min(duration, mobile ? 600 : 1200);
    const btn = byId('capGenerate');
    btn.disabled = true;
    btn.textContent = 'Transcription…';
    try {
      report('Préparation de la piste audio…');
      const audio = await extractAudio(file, seconds, report);
      const language = byId('capLanguage').value;
      let words = [];
      let engine = 'Whisper Large V3 (Groq)';
      if (byId('capEngine').value === 'groq') {
        words = await groqTranscribe(audio, seconds, language, report);
      } else {
        const pipe = await getWhisper(report);
        const params = { task: 'transcribe', return_timestamps: true };
        if (language !== 'auto') params.language = language;
        engine = 'Whisper Tiny (local)';
        for (let start = 0; start < audio.length / 16000; start += 25) {
        const len = Math.min(25, audio.length / 16000 - start);
        report(
          'Transcription sur ton appareil… ' +
            Math.round((start / seconds) * 100) +
            ' %'
        );
        const audioPart = audio.subarray(
          Math.round(start * 16000), Math.round((start + len) * 16000)
        );
        let piece;
        try {
          piece = await pipe(audioPart, params);
        } catch (e) {
          const reason = String(e?.message || e);
          if (!reason.includes('timestamp') && !reason.includes('cross attentions')) throw e;
          report('Horodatage approximatif utilisé pour ce modèle Whisper…');
          piece = await pipe(audioPart, { ...params, return_timestamps: false });
        }
          words.push(...resultsToWords(piece, start, len));
        }
      }
      if (!words.length) throw new Error('Aucune parole reconnue.');
      state.words = words;
      refresh();
      repaint();
      report(
        words.length + ' mots transcrits avec ' + engine + '. Vérifie et corrige les noms propres.' +
          (seconds < duration
            ? ' Les premières ' +
              Math.round(seconds) +
              ' secondes ont été traitées pour préserver la mémoire.'
            : '')
      );
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
    activeGroup: time => {
      if (!state.enabled) return null;
      const index=state.words.findIndex(word=>time>=word.start && time<word.end);
      if(index<0)return null;
      const begin=Math.floor(index/4)*4;
      const group=state.words.slice(begin,begin+4);
      return {
        begin, length:group.length,
        text:group.map(w=>w.text).join(' '),
        start:group[0].start,end:group.at(-1).end,
        x:state.x??50,y:state.y,size:state.size,style:state.style
      };
    },
    replaceGroup: (begin,length,text) => {
      const group=state.words.slice(begin,begin+length);
      if(!group.length || !text.trim())return false;
      const tokens=wordsOf(text);
      if(tokens.length===group.length){
        group.forEach((word,index)=>word.text=tokens[index]);
      }else{
        const first=group[0].start,end=group.at(-1).end;
        state.words.splice(begin,length,...distribute(tokens,first,end));
      }
      refresh();repaint();
      report('Sous-titre modifié directement depuis l’aperçu.');
      return true;
    },
    movePosition: (x,y) => {
      state.x=Math.max(8,Math.min(92,Number(x)||50));
      state.y=Math.max(12,Math.min(90,Number(y)||76));
      byId('capPosition').value=String(state.y);
      repaint();
    },
    setSize: size => {
      state.size=Math.max(2.5,Math.min(24,Number(size)||8.2));
      byId('capSize').value=String(state.size);
      byId('capSizeValue').textContent=state.size.toFixed(1)+' %';
      repaint();
    },
    setStyle: value => {
      if(!catalog.some(style=>style.id===value))return;
      state.style=value;
      refresh();repaint();
    },
    styles: catalog.map(style=>({id:style.id,name:style.name})),
    editAtTime: time => {
      const index = state.words.findIndex(w => time>=w.start && time<w.end);
      if(index < 0) return false;
      page = Math.floor(index / pageSize);
      refresh();
      const input = byId('capWords').querySelectorAll('.cap-word-text')[index % pageSize];
      if (!input) return false;
      input.scrollIntoView({ block:'center', behavior:'smooth' });
      input.focus();
      input.select();
      report('Corrige le mot sélectionné, puis continue la lecture.');
      return true;
    },
    snapshot: () => JSON.parse(JSON.stringify(state)),
    restore: saved => {
      if (!saved || !Array.isArray(saved.words)) return;
      Object.assign(state, initial(), saved);
      state.words = saved.words.filter(w => typeof w.text === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end));
      page = 0;
      byId('capEnabled').checked = state.enabled;
      byId('capSize').value = String(state.size);
      byId('capSizeValue').textContent = state.size + ' %';
      byId('capPosition').value = String(state.y);
      refresh(); repaint();
    },
    reset: () => {
      Object.assign(state, initial());page=0;
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
