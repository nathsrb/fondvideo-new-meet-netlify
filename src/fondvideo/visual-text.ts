// @ts-nocheck
/**
 * SCELYO Studio — CapCut-style on-canvas caption and decorative text editor.
 * Pure browser/local state. What is drawn on canvas is also exported.
 */
const presets = [
  { id: 'impact', name: 'Impact', font: '900', family: 'Arial,sans-serif', shadow: '#000', stroke: '#10151d' },
  { id: 'clean', name: 'Moderne', font: '700', family: 'Arial,sans-serif', shadow: 'transparent', stroke: '' },
  { id: 'cinema', name: 'Cinéma', font: '700', family: 'Georgia,serif', shadow: '#000', stroke: '' },
  { id: 'neon', name: 'Néon', font: '800', family: 'Arial,sans-serif', shadow: 'glow', stroke: '' },
  { id: 'comic', name: 'Comics', font: '900', family: 'Arial,sans-serif', shadow: '#13131b', stroke: '#13131b' },
  { id: 'minimal', name: 'Discret', font: '500', family: 'Arial,sans-serif', shadow: 'transparent', stroke: '' },
  { id: 'retro', name: 'Rétro', font: '700', family: 'Georgia,serif', shadow: '#451930', stroke: '#451930' },
  { id: 'marker', name: 'Marqueur', font: '900', family: 'Arial,sans-serif', shadow: '#161625', stroke: '' },
  { id: 'bold', name: 'Gros titre', font: '900', family: 'Arial,sans-serif', shadow: '#000', stroke: '#000' },
  { id: 'soft', name: 'Doux', font: '600', family: 'Georgia,serif', shadow: '#0007', stroke: '' },
];
const presetFor = id => presets.find(s=>s.id===id)||presets[0];
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
function drawText(ctx,layer,w,h) {
  const style=presetFor(layer.style);
  const font=clamp(Math.min(w,h)*layer.size/100,13,170);
  const lines=String(layer.text||'').split('\n').slice(0,8);
  ctx.save();
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.lineJoin='round';
  ctx.font=style.font+' '+font+'px '+style.family;
  const x=w*layer.x/100, y=h*layer.y/100;
  const lineHeight=font*1.2;
  lines.forEach((line,i)=>{
    const currentY=y+(i-(lines.length-1)/2)*lineHeight;
    const text=line.length>150?line.slice(0,150):line;
    if(layer.style==='marker'){
      const size=Math.min(w*.94,ctx.measureText(text).width+font*.5);
      ctx.fillStyle=layer.color;
      ctx.beginPath();ctx.roundRect(x-size/2,currentY-font*.6,size,font*1.2,font*.14);ctx.fill();
      ctx.fillStyle='#101420';
    } else ctx.fillStyle=layer.color;
    if(style.shadow==='glow'){
      ctx.shadowColor=layer.color;ctx.shadowBlur=font*.35;
    } else if(style.shadow!=='transparent'){
      ctx.shadowColor=style.shadow;ctx.shadowBlur=font*.12;ctx.shadowOffsetY=font*.09;
    }
    if(style.stroke){
      ctx.lineWidth=font*(layer.style==='comic'?.15:.075);
      ctx.strokeStyle=style.stroke;
      ctx.strokeText(text,x,currentY,w*.9);
    }
    ctx.fillText(text,x,currentY,w*.9);
  });
  ctx.restore();
}

export function createVisualTextEditor({stage, canvas, getTime, getDuration, getCaption, redraw, pause}) {
  const layers=[];
  let selected=null, selectedCaption=null, signature='';
  const surface=document.getElementById('visualLayer');
  const btn=document.getElementById('textAdd');
  const list=document.getElementById('textList');
  const message=document.getElementById('textHint');
  const form=document.getElementById('textEditorForm');
  const values={
    text: document.getElementById('textContent'),
    style: document.getElementById('textStyle'),
    color: document.getElementById('textColor'),
    size: document.getElementById('textSize'),
    start: document.getElementById('textStart'),
    end: document.getElementById('textEnd'),
    remove: document.getElementById('textDelete')
  };
  presets.forEach(p=>{
    const option=document.createElement('option');option.value=p.id;option.textContent=p.name;
    values.style.append(option);
  });
  const now=()=>Number(getTime())||0;
  const current=()=>layers.find(l=>l.id===selected)||null;
  const repaint=()=>{redraw();updateSurface(true)};
  const showControls=(layer)=>{
    form.hidden=!layer;
    if(!layer)return;
    values.text.value=layer.text;
    values.style.value=layer.style;
    values.color.value=layer.color;
    values.size.value=layer.size;
    values.start.value=layer.start.toFixed(2);
    values.end.value=layer.end.toFixed(2);
    message.textContent='Texte sélectionné : modifie-le ici ou directement dans l’aperçu. Glisse la poignée pour le déplacer.';
  };
  const listRefresh=()=>{
    list.replaceChildren();
    if(!layers.length){
      list.textContent='Aucun texte ajouté. Clique sur « + Ajouter du texte ».';
      return;
    }
    layers.forEach(layer=>{
      const button=document.createElement('button');button.type='button';
      button.className='scelyo-text-layer'+(selected===layer.id?' selected':'');
      button.textContent=layer.text.replace(/\n/g,' ').slice(0,70)+' · '+layer.start.toFixed(1)+' s';
      button.onclick=()=>{
        selected=layer.id;selectedCaption=null;showControls(layer);listRefresh();
        pause();redraw();updateSurface(true);
      };
      list.append(button);
    });
  };
  const selectLayer=layer=>{
    selected=layer.id;selectedCaption=null;
    pause();showControls(layer);listRefresh();updateSurface(true);redraw();
  };
  const closeCaption=()=>{selectedCaption=null;updateSurface(true);};
  function createCaptionOverlay(group) {
    const anchor=document.createElement('div');
    anchor.className='scelyo-caption-hitbox'+(selectedCaption?' editing':'');
    anchor.style.left=(group.x||50)+'%';
    anchor.style.top=group.y+'%';
    anchor.style.width='min(91%, 520px)';
    anchor.style.minHeight=Math.max(32,canvas.clientHeight*group.size/100*2.0)+'px';
    anchor.style.transform='translate(-50%,-50%)';
    anchor.title='Clique pour modifier ce sous-titre directement sur la vidéo';
    if(!selectedCaption) {
      const button=document.createElement('button');
      button.className='scelyo-caption-tap';button.type='button';
      button.textContent='Modifier les sous-titres';
      button.setAttribute('aria-label','Modifier le sous-titre : '+group.text);
      button.onclick=()=>{
        selected=null;selectedCaption={begin:group.begin,length:group.length};
        pause();showControls(null);listRefresh();updateSurface(true);
      };
      anchor.append(button);
    } else {
      const editor=document.createElement('div');
      editor.className='scelyo-caption-inline';
      const input=document.createElement('textarea');
      input.rows=2;input.value=group.text;
      input.setAttribute('aria-label','Modifier le texte des sous-titres');
      input.placeholder='Modifie le sous-titre directement ici…';
      input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();save();} if(e.key==='Escape')closeCaption();};
      const actions=document.createElement('div');actions.className='scelyo-caption-inline-actions';
      const saveButton=document.createElement('button');saveButton.type='button';saveButton.textContent='✓ Appliquer';
      const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.textContent='Annuler';
      const dragButton=document.createElement('button');dragButton.type='button';dragButton.textContent='↕ Déplacer';
      const save=()=>{getCaption().replaceGroup(group.begin,group.length,input.value);selectedCaption=null;redraw();updateSurface(true)};
      saveButton.onclick=save;cancelButton.onclick=closeCaption;
      let initial=null,moved=false;
      dragButton.onpointerdown=e=>{
        e.preventDefault();e.stopPropagation();
        initial={x:e.clientX,y:e.clientY,px:group.x||50,py:group.y};
        dragButton.setPointerCapture(e.pointerId);
      };
      dragButton.onpointermove=e=>{
        if(!initial)return;
        moved=true;
        const bounds=stage.getBoundingClientRect();
        const x=clamp(initial.px+(e.clientX-initial.x)/bounds.width*100,8,92);
        const y=clamp(initial.py+(e.clientY-initial.y)/bounds.height*100,12,90);
        getCaption().movePosition(x,y);anchor.style.left=x+'%';anchor.style.top=y+'%';
      };
      dragButton.onpointerup=()=>{initial=null;if(moved){updateSurface(true);moved=false}};
      actions.append(saveButton,dragButton,cancelButton);
      editor.append(input,actions);anchor.append(editor);
      requestAnimationFrame(()=>{if(input.isConnected)input.focus()});
    }
    surface.append(anchor);
  }
  function drawLayerHitbox(layer) {
    const item=document.createElement('div');
    const active=selected===layer.id;
    item.className='scelyo-text-hitbox'+(active?' editing':'');
    item.style.left=layer.x+'%';item.style.top=layer.y+'%';
    item.style.transform='translate(-50%,-50%)';
    item.style.minWidth='min(160px, 30%)';
    item.style.maxWidth='88%';
    item.title='Cliquer pour éditer · glisser la poignée pour déplacer';
    if(active) {
      const handle=document.createElement('button');
      handle.type='button';handle.className='scelyo-text-drag';
      handle.textContent='⠿ Déplacer';
      let start=null;
      handle.onpointerdown=e=>{
        e.preventDefault();e.stopPropagation();
        start={x:e.clientX,y:e.clientY,px:layer.x,py:layer.y};
        handle.setPointerCapture(e.pointerId);
      };
      handle.onpointermove=e=>{
        if(!start)return;
        const bounds=stage.getBoundingClientRect();
        layer.x=clamp(start.px+(e.clientX-start.x)/bounds.width*100,7,93);
        layer.y=clamp(start.py+(e.clientY-start.y)/bounds.height*100,8,92);
        item.style.left=layer.x+'%';item.style.top=layer.y+'%';
        redraw();
      };
      handle.onpointerup=()=>{start=null;updateSurface(true)};
      const content=document.createElement('div');
      content.className='scelyo-text-inline';
      content.contentEditable='true';
      content.spellcheck=true;
      content.textContent=layer.text;
      content.setAttribute('role','textbox');
      content.setAttribute('aria-label','Modifier directement ce texte sur la vidéo');
      content.oninput=()=>{
        layer.text=content.innerText.slice(0,350);values.text.value=layer.text;redraw();
      };
      const preset=presetFor(layer.style);
      content.style.fontFamily=preset.family;
      content.style.fontWeight=preset.font;
      content.style.color=layer.style==='marker'?'#161620':layer.color;
      content.style.fontSize=clamp(canvas.clientHeight*layer.size/100,14,55)+'px';
      item.append(handle,content);
    } else {
      const button=document.createElement('button');
      button.type='button';button.className='scelyo-text-hitbox-select';
      button.textContent='✎';button.setAttribute('aria-label','Modifier le texte : '+layer.text);
      button.title='Clique ici pour modifier ce texte';
      button.onclick=()=>selectLayer(layer);
      item.append(button);
    }
    surface.append(item);
  }
  function updateSurface(force=false) {
    if(!stage.isConnected)return;
    const t=now(), caption=getCaption().activeGroup(t);
    if(selectedCaption && (!caption||caption.begin!==selectedCaption.begin))selectedCaption=null;
    const active=layers.filter(l=>t>=l.start&&t<l.end);
    const key=[
      caption?.begin,caption?.text,caption?.x,caption?.y,
      ...active.map(l=>[l.id,l.text,l.x,l.y,l.size,l.style].join(':')),
      selected,selectedCaption?.begin
    ].join('|');
    if(!force&&key===signature)return;
    // Preserve text field focus/caret during typing if its node is still active:
    // input handlers never force reconstruction on every render frame.
    if(!force && surface.contains(document.activeElement))return;
    signature=key;surface.replaceChildren();
    if(caption)createCaptionOverlay(caption);
    active.forEach(drawLayerHitbox);
  }
  btn.onclick=()=>{
    const t=clamp(now(),0,Math.max(0,getDuration()));
    const layer={
      id:crypto.randomUUID(),text:'Ton texte ici',
      start:t,end:Math.min(Math.max(t+3,getDuration()),t+3),
      x:50,y:36,size:8.4,style:'impact',color:'#ffffff'
    };
    layers.push(layer);selectLayer(layer);
    message.textContent='Écris ton texte directement sur la vidéo, déplace-le et personnalise son style.';
  };
  values.text.oninput=e=>{const layer=current();if(!layer)return;layer.text=e.target.value.slice(0,350);redraw();updateSurface(true);listRefresh()};
  values.style.onchange=e=>{const l=current();if(!l)return;l.style=e.target.value;repaint()};
  values.color.oninput=e=>{const l=current();if(!l)return;l.color=e.target.value;repaint()};
  values.size.oninput=e=>{const l=current();if(!l)return;l.size=Number(e.target.value);repaint()};
  values.start.onchange=e=>{const l=current();if(!l)return;l.start=clamp(Number(e.target.value)||0,0,l.end-.05);repaint();listRefresh()};
  values.end.onchange=e=>{const l=current();if(!l)return;l.end=Math.max(l.start+.1,Number(e.target.value)||l.start+2);repaint();listRefresh()};
  values.remove.onclick=()=>{
    const index=layers.findIndex(l=>l.id===selected);
    if(index>=0)layers.splice(index,1);
    selected=null;showControls(null);listRefresh();repaint();
  };
  listRefresh();showControls(null);
  return {
    render(ctx,time,w,h) {
      for(const layer of layers)if(time>=layer.start&&time<layer.end)drawText(ctx,layer,w,h);
    },
    updateSurface,
    reset() {layers.length=0;selected=null;selectedCaption=null;signature='';showControls(null);listRefresh();updateSurface(true)},
  };
}
