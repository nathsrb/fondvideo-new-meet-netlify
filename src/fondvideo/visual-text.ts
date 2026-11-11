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
  let manipulating=false;
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
    const active=Boolean(selectedCaption);
    anchor.className='scelyo-caption-hitbox'+(active?' editing':'');
    anchor.style.left=(group.x||50)+'%';
    anchor.style.top=group.y+'%';
    anchor.style.width='min(91%, 540px)';
    anchor.style.minHeight=Math.max(32,canvas.clientHeight*group.size/100*2.0)+'px';
    anchor.style.transform='translate(-50%,-50%)';
    anchor.title='Cliquer pour modifier, déplacer ou redimensionner le sous-titre';
    if(!active) {
      const button=document.createElement('button');
      button.className='scelyo-caption-tap';
      button.type='button';
      button.textContent='✎ Modifier le sous-titre';
      button.setAttribute('aria-label','Modifier le sous-titre : '+group.text);
      button.onclick=()=>{
        selected=null;selectedCaption={begin:group.begin,length:group.length};
        pause();showControls(null);listRefresh();updateSurface(true);
      };
      anchor.append(button);
    } else {
      const editor=document.createElement('div');
      editor.className='scelyo-caption-inline';
      editor.setAttribute('aria-label','Modifier les sous-titres directement sur la vidéo');
      const headline=document.createElement('div');
      headline.className='scelyo-caption-editor-head';
      const name=document.createElement('span');name.textContent='✎ Sous-titre sélectionné';
      const hint=document.createElement('small');hint.textContent='Déplace ou redimensionne avec les poignées';
      headline.append(name,hint);
      const input=document.createElement('textarea');
      input.rows=2;
      input.value=group.text;
      input.setAttribute('aria-label','Texte du sous-titre');
      input.placeholder='Modifie le sous-titre directement ici…';
      const actions=document.createElement('div');
      actions.className='scelyo-caption-inline-actions';
      const saveButton=document.createElement('button');
      saveButton.type='button';saveButton.textContent='✓ Appliquer';
      const cancelButton=document.createElement('button');
      cancelButton.type='button';cancelButton.textContent='Fermer';
      const dragButton=document.createElement('button');
      dragButton.type='button';dragButton.className='scelyo-caption-move-handle';
      dragButton.textContent='⠿ Déplacer';
      dragButton.setAttribute('aria-label','Glisser pour déplacer les sous-titres');
      const resizeButton=document.createElement('button');
      resizeButton.type='button';resizeButton.className='scelyo-caption-resize-handle';
      resizeButton.textContent='↘ Taille';
      resizeButton.setAttribute('aria-label','Glisser pour agrandir ou réduire les sous-titres');
      const sizeRow=document.createElement('label');
      sizeRow.className='scelyo-caption-size-row';
      const sizeCaption=document.createElement('span');
      sizeCaption.textContent='Taille';
      const slider=document.createElement('input');
      slider.type='range';slider.min='2.5';slider.max='24';slider.step='.2';
      slider.value=String(group.size);
      slider.setAttribute('aria-label','Taille du sous-titre');
      const sizeValue=document.createElement('output');
      sizeValue.textContent=Number(group.size).toFixed(1)+' %';
      const applySize = size => {
        const next=clamp(size,2.5,24);
        slider.value=String(next);
        sizeValue.textContent=next.toFixed(1)+' %';
        getCaption().setSize(next);
      };
      slider.oninput=()=>applySize(Number(slider.value));
      const smaller=document.createElement('button');
      smaller.type='button';smaller.className='scelyo-caption-size-step';
      smaller.textContent='−';smaller.title='Réduire le sous-titre';
      smaller.setAttribute('aria-label','Réduire la taille des sous-titres');
      smaller.onclick=()=>applySize(Number(slider.value)-0.8);
      const larger=document.createElement('button');
      larger.type='button';larger.className='scelyo-caption-size-step';
      larger.textContent='+';larger.title='Agrandir le sous-titre';
      larger.setAttribute('aria-label','Agrandir la taille des sous-titres');
      larger.onclick=()=>applySize(Number(slider.value)+0.8);
      sizeRow.append(sizeCaption,smaller,slider,larger,sizeValue);
      const save=()=>{
        getCaption().replaceGroup(group.begin,group.length,input.value);
        selectedCaption=null;redraw();updateSurface(true);
      };
      input.onkeydown=e=>{
        if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();save()}
        if(e.key==='Escape')closeCaption();
      };
      saveButton.onclick=save;
      cancelButton.onclick=closeCaption;
      const connectPointerDrag=(handle,kind)=>{
        let gesture=null;
        handle.onpointerdown=e=>{
          if(e.button!==0&&e.pointerType==='mouse')return;
          e.preventDefault();e.stopPropagation();
          manipulating=true;
          gesture={x:e.clientX,y:e.clientY,px:group.x||50,py:group.y,size:Number(slider.value)};
          handle.setPointerCapture(e.pointerId);
        };
        handle.onpointermove=e=>{
          if(!gesture)return;
          e.preventDefault();
          const bounds=stage.getBoundingClientRect();
          const deltaX=e.clientX-gesture.x,deltaY=e.clientY-gesture.y;
          if(kind==='move'){
            const x=clamp(gesture.px+deltaX/Math.max(1,bounds.width)*100,8,92);
            const y=clamp(gesture.py+deltaY/Math.max(1,bounds.height)*100,12,90);
            getCaption().movePosition(x,y);
            anchor.style.left=x+'%';anchor.style.top=y+'%';
          }else{
            const delta=Math.max(deltaX,deltaY*0.9);
            const size=clamp(gesture.size+delta/Math.max(1,bounds.height)*100,2.5,24);
            getCaption().setSize(size);
            slider.value=String(size);
            sizeValue.textContent=size.toFixed(1)+' %';
            anchor.style.minHeight=Math.max(32,canvas.clientHeight*size/100*2.0)+'px';
          }
        };
        const endGesture=()=>{
          if(!gesture)return;
          gesture=null;manipulating=false;
          redraw();updateSurface(true);
        };
        handle.onpointerup=endGesture;
        handle.onpointercancel=endGesture;
        handle.onlostpointercapture=endGesture;
      };
      connectPointerDrag(headline,'move');
      connectPointerDrag(dragButton,'move');
      connectPointerDrag(resizeButton,'size');
      actions.append(saveButton,dragButton,resizeButton,cancelButton);
      editor.append(headline,input,sizeRow,actions);
      anchor.append(editor);
      requestAnimationFrame(()=>{if(input.isConnected&&!manipulating)input.focus()});
    }
    surface.append(anchor);
  }
  function drawLayerHitbox(layer) {
    const item=document.createElement('div');
    const active=selected===layer.id;
    item.className='scelyo-text-hitbox'+(active?' editing':'');
    item.style.left=layer.x+'%';item.style.top=layer.y+'%';
    item.style.transform='translate(-50%,-50%)';
    item.style.width=Math.min(88,Math.max(28,String(layer.text).length*layer.size*.48))+'%';
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
    if(!stage.isConnected || manipulating)return;
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
      start:t,end:Math.min(Math.max(t+.15,getDuration()),t+3),
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
