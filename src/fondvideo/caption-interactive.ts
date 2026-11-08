// @ts-nocheck
// Éditeur visuel de sous-titres : chaque groupe de quatre mots peut avoir son propre style.
export function createCaptionInteraction({state, catalog, getTime, getDuration, remember, refresh, repaint, report}) {
  const $ = id => document.getElementById(id);
  const mount = $('capInspectorMount');
  mount.innerHTML = [
    '<section class="cap-inspector" aria-label="Personnalisation des sous-titres">',
    '<h4>Éditer comme sur CapCut <small id="capSelection" style="color:#c9aaff">Tous les blocs</small></h4>',
    '<p>Sélectionne un sous-titre dans la vidéo ou la piste. Par défaut, le même design est appliqué à toute la vidéo.</p>',
    '<label class="cap-mode-switch"><input type="checkbox" id="capLocalMode"> Personnaliser uniquement ce bloc (désynchroniser)</label>',
    '<p id="capModeHint">Mode synchronisé : toute modification de style, taille ou position affecte tous les sous-titres.</p>',
    '<textarea id="capBlockText" rows="2" placeholder="Sélectionne un bloc pour modifier son texte" aria-label="Texte du bloc sélectionné"></textarea>',
    '<div class="cap-inspector-actions"><button id="capApplyBlock" type="button">Modifier cette phrase</button><button id="capResetAppearance" type="button">Réinitialiser ce bloc</button><button id="capDeselect" type="button">Désélectionner</button></div>',
    '<div class="cap-inspector-actions"><button id="capAddPhrase" type="button">＋ Ajouter mon propre texte</button></div>',
    '<div class="cap-inspector-grid">',
    '<label>Couleur du texte<input id="capTextColor" type="color" value="#ffffff"></label>',
    '<label>Couleur de surbrillance<input id="capAccentColor" type="color" value="#fde047"></label>',
    '<label>Position horizontale <span id="capXNum">50 %</span><input id="capXSlider" type="range" min="5" max="95" value="50"></label>',
    '<label>Rotation <span id="capRotationNum">0°</span><input id="capRotationSlider" type="range" min="-25" max="25" value="0"></label>',
    '<label>Opacité <span id="capOpacityNum">100 %</span><input id="capOpacitySlider" type="range" min="20" max="100" value="100"></label>',
    '</div></section>'
  ].join('');
  const tools = $('capCanvasTools');
  const box = document.createElement('div');
  box.className = 'cap-edit-box';
  box.hidden = true;
  box.innerHTML = '<span class="cap-drag-label" id="capDragLabel"></span><button class="cap-handle" type="button" aria-label="Agrandir ou réduire le sous-titre"></button><button class="cap-pen" type="button" aria-label="Modifier le texte du sous-titre">✎</button>';
  tools.append(box);
  const handle = box.querySelector('.cap-handle');
  const pen = box.querySelector('.cap-pen');
  const label = box.querySelector('.cap-drag-label');
  let selected = -1;
  let localMode = false;
  const startOf = index => index < 0 ? -1 : Math.floor(index / 4) * 4;
  const leader = () => state.words[selected] || null;
  const value = name => (localMode ? leader()?.appearance?.[name] : undefined) ?? state[name];
  // Un design global ne doit pas être supplanté par d'anciennes personnalisations.
  function clearOverrides(name) {
    for (const word of state.words) {
      if (word.appearance && Object.prototype.hasOwnProperty.call(word.appearance, name)) {
        delete word.appearance[name];
        if (!Object.keys(word.appearance).length) delete word.appearance;
      }
    }
  }
  function groupAtTime() {
    const index = state.words.findIndex(w => getTime() >= w.start && getTime() < w.end);
    return startOf(index);
  }
  function put(name, val, save = false) {
    if (save) remember();
    const word = leader();
    if (localMode && word) word.appearance = { ...(word.appearance || {}), [name]: val };
    else { state[name] = val; clearOverrides(name); }
    sync(); repaint();
  }
  function syncControls() {
    const w = leader(), preset = catalog.find(p => p.id === (value('style') || state.style)) || catalog[0];
    $('capSelection').textContent = (localMode && w) ? '· Bloc ' + (Math.floor(selected / 4) + 1) + ' seul' : '· Design synchronisé';
    $('capBlockText').disabled = !w;
    $('capApplyBlock').disabled = !w;
    $('capResetAppearance').disabled = !w;
    $('capLocalMode').disabled = !w;
    $('capLocalMode').checked = localMode;
    $('capModeHint').textContent = localMode
      ? 'Mode individuel : les changements de design ne concernent que le bloc sélectionné.'
      : 'Mode synchronisé : le design, la taille et la position s’appliquent à tous les sous-titres.';
    if (document.activeElement !== $('capBlockText'))
      $('capBlockText').value = w ? state.words.slice(selected, selected+4).map(x=>x.text).join(' ') : '';
    const knobs = [
      ['capXSlider','capXNum','x',' %'],
      ['capRotationSlider','capRotationNum','rotation','°'],
      ['capOpacitySlider','capOpacityNum','opacity',' %'],
      ['capSize','capSizeValue','size',' %'],
      ['capPosition',null,'y','']
    ];
    for (const [id,num,name,suffix] of knobs) {
      if ($(id)) $(id).value = String(value(name));
      if (num && $(num)) $(num).textContent = value(name)+suffix;
    }
    $('capTextColor').value = value('fg') || preset.fg;
    $('capAccentColor').value = value('accent') || preset.accent;
    document.querySelectorAll('[data-style]').forEach(el => el.classList.toggle('selected',el.dataset.style === (value('style') || state.style)));
    Array.from($('capTimeline').querySelectorAll('.cap-clip')).forEach((el,i) => el.classList.toggle('cap-selected',i === selected / 4 && selected >= 0));
  }
  function select(i, seek = false) {
    selected = startOf(i);
    if (seek && selected >= 0) {
      const video = $('video');
      if (Number.isFinite(video.duration)) {
        video.pause();
        video.currentTime = Math.max(0, Math.min(video.duration, state.words[selected].start + 0.02));
        $('timeline').value = String(Math.round(video.currentTime / video.duration * 1000));
        $('current').textContent = Math.floor(video.currentTime/60)+':'+String(Math.floor(video.currentTime%60)).padStart(2,'0');
      }
    }
    sync(); repaint();
  }
  function sync() {
    syncControls();
    const active = groupAtTime();
    const word = state.words[active];
    const shown = !!word && state.enabled && $('captions').classList.contains('activePanel') && !$('editor').classList.contains('hidden');
    box.hidden = !shown;
    if (!shown) return;
    const p = word.appearance || {};
    const x = p.x ?? state.x, y = p.y ?? state.y;
    const font = Math.max(12, Math.min(120, Math.min($('stage').clientWidth,$('stage').clientHeight) * (p.size ?? state.size) / 100));
    const text = state.words.slice(active,active+4).map(x=>x.text).join(' ');
    const width = $('stage').clientWidth;
    const lineW = text.length * font * .55;
    box.style.left = x + '%';
    box.style.top = y + '%';
    box.style.width = Math.max(68,Math.min(width*.88,lineW)+font*.8)+'px';
    box.style.height = Math.max(36,font * (lineW > width*.88 ? 2.7 : 1.5))+'px';
    box.style.transform = 'translate(-50%,-50%) rotate('+(p.rotation ?? state.rotation ?? 0)+'deg)';
    box.style.borderColor = selected === active ? '#ffffff' : '#bd9fff';
    box.dataset.group = String(active);
    label.textContent = ''; // Le texte est déjà dessiné dans le canvas : ne jamais le dupliquer dans l'outil de sélection.
    box.setAttribute('aria-label','Déplacer ou redimensionner : '+text);
  }
  function drag(e, mode) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const i = Number(box.dataset.group);
    if (!Number.isInteger(i) || !state.words[i]) return;
    e.preventDefault(); e.stopPropagation();
    select(i);
    remember();
    const w = state.words[i];
    const rect = $('stage').getBoundingClientRect();
    const initial = { x:value('x'),y:value('y'),size:value('size') };
    const x=e.clientX,y=e.clientY,target=e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = ev => {
      const dx=ev.clientX-x,dy=ev.clientY-y;
      if(mode==='resize') {
        const size=Math.max(4,Math.min(30,initial.size + dx / rect.width * 60));
        if(localMode) w.appearance={...(w.appearance||{}),size};
        else { state.size=size; clearOverrides('size'); }
      } else {
        const newX=Math.max(5,Math.min(95,initial.x+dx/rect.width*100));
        const newY=Math.max(5,Math.min(95,initial.y+dy/rect.height*100));
        if(localMode) w.appearance={...(w.appearance||{}),x:newX,y:newY};
        else { state.x=newX;state.y=newY;clearOverrides('x');clearOverrides('y'); }
      }
      sync(); repaint();
    };
    const stop=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',stop);target.removeEventListener('pointercancel',stop);refresh();};
    target.addEventListener('pointermove',move);
    target.addEventListener('pointerup',stop,{once:true});
    target.addEventListener('pointercancel',stop,{once:true});
  }
  box.addEventListener('pointerdown', e=>{if(e.target.closest('button'))return;drag(e,'move');});
  handle.addEventListener('pointerdown',e=>drag(e,'resize'));
  handle.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();select(Number(box.dataset.group));
    put('size',Math.max(4,Math.min(30,value('size')+(e.key==='ArrowRight'?.5:-.5))),true);
  });
  pen.onclick=()=>{select(Number(box.dataset.group));$('capBlockText').focus();$('capBlockText').select();};
  box.addEventListener('dblclick',e=>{if(e.target===pen)return;pen.click();});
  $('capTimeline').addEventListener('pointerdown',e=>{
    const clip=e.target.closest('.cap-clip');
    if(!clip)return;
    const i=Array.from(clip.parentNode.children).indexOf(clip);
    if(i>=0)select(i*4);
  },true);
  $('capTimeline').addEventListener('click',e=>{
    const clip=e.target.closest('.cap-clip');
    if(!clip)return;
    const i=Array.from(clip.parentNode.children).indexOf(clip);
    if(i>=0)select(i*4,true);
  });
  $('capTimeline').addEventListener('dblclick',e=>{
    if(!e.target.closest('.cap-clip'))return;
    $('capBlockText').focus();$('capBlockText').select();
  });
  $('capDeselect').onclick=()=>{localMode=false; select(-1);};
  $('capLocalMode').onchange=e=>{
    localMode=e.target.checked && !!leader();
    sync();repaint();
    report(localMode ? 'Personnalisation individuelle activée.' : 'Design synchronisé pour tous les sous-titres.');
  };
  $('capResetAppearance').onclick=()=>{
    if(!leader())return;
    remember();delete leader().appearance;refresh();repaint();report('Style de ce bloc réinitialisé.');
  };
  $('capApplyBlock').onclick=()=>{
    if(!leader())return;
    const text=$('capBlockText').value.trim();
    if(!text)return report('Saisis le texte de ce bloc.');
    remember();
    const old=state.words.slice(selected,selected+4);
    const tokens=text.split(/\s+/u).filter(Boolean);
    const start=old[0].start,end=old.at(-1).end,span=Math.max(.1,end-start);
    const fresh=tokens.map((text,i)=>({text,start:start+span*i/tokens.length,end:start+span*(i+1)/tokens.length}));
    fresh[0].appearance=old[0].appearance;
    state.words.splice(selected,old.length,...fresh);
    refresh();repaint();report('Texte du bloc corrigé.');
  };
  function attachInput(id,name,convert=Number) {
    $(id).addEventListener('pointerdown',()=>remember());
    $(id).addEventListener('input',e=>put(name,convert(e.target.value)));
  }
  attachInput('capXSlider','x');
  attachInput('capRotationSlider','rotation');
  attachInput('capOpacitySlider','opacity');
  attachInput('capTextColor','fg',String);
  attachInput('capAccentColor','accent',String);
  $('capSize').max='30';
  // En sélection, intercepter les contrôles globaux sans toucher aux autres sous-titres.
  for(const [id,name] of [['capSize','size'],['capPosition','y']]){
    $(id).addEventListener('pointerdown',()=>remember(),true);
    $(id).addEventListener('input',e=>{
      if (!localMode) {
        clearOverrides(name);
        queueMicrotask(() => {sync();repaint();});
        return;
      }
      if(!leader())return;
      e.stopImmediatePropagation();put(name,Number(e.target.value));
    },true);
  }
  $('capStyles').addEventListener('click',e=>{
    const b=e.target.closest('[data-style]');
    if(!b)return;
    if(!localMode) {
      clearOverrides('style');
      queueMicrotask(()=>{sync();repaint();});
      return;
    }
    if(!leader())return;
    e.preventDefault();e.stopImmediatePropagation();
    put('style',b.dataset.style,true);refresh();
  },true);
  $('capAddPhrase').onclick=()=>{
    const existing=$('capBlockText').value.trim();
    const phrase=window.prompt('Quel texte veux-tu ajouter à la vidéo ?',existing && !leader() ? existing : '');
    if(phrase===null || !phrase.trim())return;
    const input=phrase.trim().split(/\s+/u).filter(Boolean);
    const t=Math.max(0,Number(getTime())||0);
    const end=Math.min(Math.max(t+2,Number(getDuration())||t+2),t+4);
    const words=input.map((text,i)=>({text,start:t+(end-t)*i/input.length,end:t+(end-t)*(i+1)/input.length}));
    remember();
    state.words.push(...words);
    state.words.sort((a,b)=>a.start-b.start);
    localMode=false;
    refresh();select(state.words.indexOf(words[0]));repaint();
    report('Texte ajouté à '+t.toFixed(1)+' s. Ajuste sa durée dans la piste.');
  };
  sync();
  return {sync,clear(){selected=-1;localMode=false;sync();}};
}
