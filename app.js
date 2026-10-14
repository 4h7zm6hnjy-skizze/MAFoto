/* MAFoto 1.0.0 — offline-first, photography only; no microphone / recording. */
(() => {
  'use strict';
  const VERSION = '1.0.0';
  const $ = (id) => document.getElementById(id);
  const ui = Object.fromEntries([
    'cameraStatus','resolutionLabel','formatTag','focusTag','zoomType','stage','viewfinder','preview',
    'zebraOverlay','gridOverlay','focusMark','captureFlash','timerBadge',
    'noCamera','cameraHint','startCameraBtn','photoSettingsInfo','histogram','gridBtn','zebraBtn',
    'timerBtn','timerLabel','ratioBtn','ratioLabel','zoomSlider','zoomValue','galleryBtn','lastThumbnail',
    'galleryPlaceholder','galleryCount','shutterBtn','flipBtn','adjustBtn','settingsBtn','helpBtn',
    'backdrop','adjustSheet','gallerySheet','detailSheet','settingsSheet','helpSheet','presets',
    'galleryGrid','gallerySummary','galleryEmpty','detailMedia','detailMetadata','detailTitle',
    'saveMediaBtn','shareMediaBtn','deleteMediaBtn','fileFormat','gridType','diagnostics',
    'lensSelectBtn','lensList','checkUpdateBtn','updateStatus','clearGalleryBtn','toast',
    'brightness','contrast','saturation','warmth','brightnessOut','contrastOut','saturationOut','warmthOut',
    'resetAdjust','longPanel','longDuration','longSeconds','longSecondsLabel','longEffectHint',
    'longPreview','longProgress','longProgressTitle','longProgressTime','longFrameCount',
    'progressFill','stopLongBtn'
  ].map(id => [id, $(id)]));
  const ratioList = ['16:9'];
  const timerList = [0,3,10];
  const presets = {
    natural: {brightness:0, contrast:0, saturation:0, warmth:0},
    portrait: {brightness:7, contrast:-7, saturation:-4, warmth:12},
    landscape: {brightness:3, contrast:14, saturation:17, warmth:3},
    cinema: {brightness:-4, contrast:17, saturation:-14, warmth:13},
    mono: {brightness:0, contrast:18, saturation:-100, warmth:0}
  };
  const state = {
    stream:null, track:null, capabilities:{}, facing:'environment', selectedDeviceId:null,
    active:false, opening:false, mode:'photo', ratio:'16:9', frameRatio:9/16, zoom:1,
    nativeZoom:1, digitalZoom:1, zoomQueue:Promise.resolve(), grid:'thirds', zebra:false,
    timer:0, timedShot:false, format:'jpeg', preset:'natural',
    adjust:{...presets.natural},
    overlayTick:null, activeSheet:null, selectedId:null, db:null,
    galleries:[], galleryUrls:[], detailUrl:null, lastThumbUrl:null,
    shotBusy:false, registration:null, updateReady:false,
    longDuration:10, longEffect:'trails', stackQuality:0,
    longRunning:false, longStopRequested:false, longFrames:0, longStartTime:0,
    wakeLock:null
  };
  let toastTimer=0, focusTimer=0;
  function notify(message,error=false){
    ui.toast.textContent=message; ui.toast.classList.toggle('error',!!error);
    ui.toast.classList.remove('hidden'); clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>ui.toast.classList.add('hidden'),4300);
  }
  function safeSettings(){try{return JSON.parse(localStorage.getItem('mafoto-settings')||'{}');}catch{return {};}}
  function persist(){
    const payload={ratio:state.ratio,grid:state.grid,format:state.format,zebra:state.zebra,timer:state.timer,adjust:state.adjust,preset:state.preset,longDuration:state.longDuration,longEffect:state.longEffect,stackQuality:state.stackQuality};
    try{localStorage.setItem('mafoto-settings',JSON.stringify(payload));}catch{/* private browsing */}
  }
  function loadSettings(){
    const s=safeSettings();
    state.ratio='16:9'; // fixed format
    if(['thirds','center','off'].includes(s.grid))state.grid=s.grid;
    if(['jpeg','png'].includes(s.format))state.format=s.format;
    if(typeof s.zebra==='boolean')state.zebra=s.zebra;
    if(timerList.includes(s.timer))state.timer=s.timer;
    if(s.preset in presets)state.preset=s.preset;
    if(Number.isInteger(s.longDuration)&&s.longDuration>=1&&s.longDuration<=300)state.longDuration=s.longDuration;
    if(['trails','silky','night'].includes(s.longEffect))state.longEffect=s.longEffect;
    if([0,1600,2048,2560].includes(s.stackQuality))state.stackQuality=s.stackQuality;
    if(s.adjust && Object.keys(presets.natural).every(k=>Number.isFinite(s.adjust[k]) && s.adjust[k]>=-100 && s.adjust[k]<=100))state.adjust={...s.adjust};
  }
  function filterString(){
    const {brightness,contrast,saturation,warmth}=state.adjust;
    const b=Math.max(.1,1+brightness/155),c=Math.max(.1,1+contrast/110),s=Math.max(0,1+saturation/100);
    const sep=Math.abs(warmth)/170;
    return `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)}) saturate(${s.toFixed(3)}) sepia(${sep.toFixed(3)}) hue-rotate(${warmth===0?0:warmth<0?160:-12}deg)`;
  }
  function updateFilter(){
    ui.preview.style.filter=filterString();
    ui.photoSettingsInfo.textContent=state.mode==='long'?`${state.longEffect.toUpperCase()} · ${state.longDuration} S · LOKAL`:`${state.preset.toUpperCase()} · ${state.format.toUpperCase()} · LOKAL`;
  }
  function updateEditingUI(){
    for(const k of Object.keys(state.adjust)){
      ui[k].value=String(state.adjust[k]);
      ui[k+'Out'].textContent=(state.adjust[k]>0?'+':'')+state.adjust[k];
    }
    ui.presets.querySelectorAll('[data-preset]').forEach(el=>el.classList.toggle('active',el.dataset.preset===state.preset));
    updateFilter();
  }
  function currentRatio(){
    return window.innerWidth>window.innerHeight ? 16/9 : 9/16;
  }
  function layoutFrame(){
    const bounds=ui.stage.getBoundingClientRect();
    const info=ui.stage.querySelector('.stage-info').getBoundingClientRect().height;
    const tools=ui.stage.querySelector('.stage-tools').getBoundingClientRect().height;
    const availableW=Math.max(80,bounds.width-2);
    const availableH=Math.max(50,bounds.height-info-tools-6);
    const ratio=currentRatio();
    let w=Math.min(availableW,availableH*ratio),h=w/ratio;
    if(h>availableH){h=availableH;w=h*ratio;}
    ui.viewfinder.style.width=`${Math.floor(w)}px`;
    ui.viewfinder.style.height=`${Math.floor(h)}px`;
    state.frameRatio=ratio;
    // Show the effective exported 16:9 resolution, not the uncropped stream MP.
    if(ui.preview.videoWidth && ui.preview.videoHeight){
      const output=crop(ui.preview.videoWidth,ui.preview.videoHeight,ratio,1);
      ui.resolutionLabel.textContent=`${(output.ow*output.oh/1e6).toFixed(1)} MP FOTO`;
    }
  }
  function crop(vw,vh,ratio,z){
    // Export exact 16:9 (or 9:16 in portrait), not an approximate aspect ratio.
    const landscape=ratio>1;
    const a=landscape?16:9,b=landscape?9:16;
    const units=Math.max(1,Math.floor(Math.min(vw/a,vh/b)));
    const ow=a*units,oh=b*units;
    const zoom=Math.max(1,z),sw=ow/zoom,sh=oh/zoom;
    return {sx:(vw-sw)/2,sy:(vh-sh)/2,sw,sh,ow,oh};
  }
  function updateRatio(){
    state.ratio='16:9';
    ui.ratioLabel.textContent='16:9';
    ui.ratioBtn.disabled=true;
    ui.ratioBtn.title='Festes Bildformat 16:9 · Hochformat 9:16';
    ui.formatTag.textContent=state.mode==='long'?`16:9 · ${state.longDuration} s`:`16:9 · ${state.format.toUpperCase()}`;
    layoutFrame();persist();
  }
  function refreshGrid(){
    ui.gridOverlay.className=`grid-overlay ${state.grid==='off'?'hidden':state.grid}`;
    ui.gridBtn.classList.toggle('active',state.grid!=='off');
    ui.gridBtn.setAttribute('aria-pressed',String(state.grid!=='off'));
    ui.gridType.value=state.grid;persist();
  }
  function updateTimers(){
    ui.timerLabel.textContent=state.timer?`${state.timer} Sek.`:'Timer aus';
    ui.timerBtn.classList.toggle('active',state.timer>0);
    ui.timerBtn.disabled=state.timedShot||state.shotBusy||state.longRunning;persist();
  }
  function updateZebra(){
    ui.zebraBtn.classList.toggle('active',state.zebra);
    ui.zebraBtn.setAttribute('aria-pressed',String(state.zebra));
    ui.zebraOverlay.classList.toggle('hidden',!state.zebra);
    persist();
  }
  function status(live){
    ui.cameraStatus.classList.toggle('live',!!live);
    ui.cameraStatus.querySelector('span').textContent=live?'LIVE':'Bereit';
  }
  function getTrackSettings(){
    try{return state.track?.getSettings?.()||{};}catch{return {};}
  }
  function syncTrackUI(){
    const s=getTrackSettings(),cap=state.capabilities;
    const pixels=(s.width||ui.preview.videoWidth||0)*(s.height||ui.preview.videoHeight||0);
    ui.resolutionLabel.textContent=pixels?`${(pixels/1e6).toFixed(1)} MP STREAM`:'— MP'; // overwritten with effective 16:9 photo MP by updateRatio
    ui.diagnostics.textContent=state.active?[
      `Aktiver Stream: ${s.width||ui.preview.videoWidth||'?'} × ${s.height||ui.preview.videoHeight||'?'} Pixel`,
      `16:9-Foto: ${crop(ui.preview.videoWidth||s.width||1,ui.preview.videoHeight||s.height||1,currentRatio(),1).ow} × ${crop(ui.preview.videoWidth||s.width||1,ui.preview.videoHeight||s.height||1,currentRatio(),1).oh} Pixel`,
      `Bildrate: ${s.frameRate?Number(s.frameRate).toFixed(1):'nicht angegeben'} fps`,
      `Kamera: ${s.facingMode||'nicht angegeben'}`,
      `Hardware-Zoom gemeldet: ${cap.zoom?`${cap.zoom.min}–${cap.zoom.max}`:'nein'}`,
      `Hardware-Fokussteuerung: ${cap.focusMode?cap.focusMode.join(', '):'nicht freigegeben'}`,
      `Foto: aktueller Videostream, nicht volle iPhone-Sensorauflösung`,
      `RAW / ISO / Zeit: nicht verfügbar über diese WebApp`
    ].join('\n'):'Noch keine Kamera gestartet.';
    ui.focusTag.textContent=cap.focusMode?.length?'AF / BROWSER':'AF AUTO';
    updateRatio();
  }
  function resetZoom(){state.zoom=1;state.nativeZoom=1;state.digitalZoom=1;updateZoomUI();}
  function updateZoomUI(){
    ui.zoomSlider.value=String(state.zoom);
    ui.zoomValue.textContent=`${state.zoom.toFixed(1)}×`;
    document.querySelectorAll('[data-zoom]').forEach(el=>el.classList.toggle('active',Math.abs(Number(el.dataset.zoom)-state.zoom)<.05));
    const hasNative=!!state.capabilities.zoom;
    ui.zoomType.textContent=hasNative?'KAMERA + DIGITAL':'DIGITAL';
    ui.zoomSlider.disabled=state.shotBusy||state.timedShot||state.longRunning;
    document.querySelectorAll('[data-zoom]').forEach(el=>el.disabled=ui.zoomSlider.disabled);
    ui.preview.style.transform=`scale(${state.digitalZoom})${state.facing==='user'?' scaleX(-1)':''}`;
    ui.zebraOverlay.style.transform=state.facing==='user'?'scaleX(-1)':'none';
  }
  function setZoom(next){
    if(state.shotBusy||state.timedShot||state.longRunning)return;
    const amount=Math.min(5,Math.max(1,Math.round(Number(next)*10)/10));
    if(!Number.isFinite(amount))return;
        state.zoom=amount;
    const trackAtCall=state.track;
    state.zoomQueue=state.zoomQueue.catch(()=>{}).then(async()=>{
      if(trackAtCall!==state.track || !trackAtCall){state.nativeZoom=1;state.digitalZoom=state.zoom;updateZoomUI();return;}
      const cap=state.capabilities.zoom;
      let nativeTarget=1;
      if(cap && Number.isFinite(cap.min) && Number.isFinite(cap.max)){
        nativeTarget=Math.max(cap.min,Math.min(cap.max,state.zoom));
        try{await trackAtCall.applyConstraints({advanced:[{zoom:nativeTarget}]});}
        catch{nativeTarget=1;state.capabilities.zoom=null;notify('Hardware-Zoom nicht verfügbar. Foto nutzt Digitalzoom.');}
      }
      if(trackAtCall!==state.track)return;
      state.nativeZoom=nativeTarget;
      state.digitalZoom=Math.max(1,state.zoom/nativeTarget);
      updateZoomUI();syncTrackUI();
    });
    if(!state.track){state.digitalZoom=state.zoom;updateZoomUI();}
    else{ui.zoomValue.textContent=`${state.zoom.toFixed(1)}×`;
      ui.zoomSlider.value=String(state.zoom);
      document.querySelectorAll('[data-zoom]').forEach(el=>el.classList.toggle('active',Math.abs(Number(el.dataset.zoom)-state.zoom)<.05));}
  }
  function stopTracks(){
    if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
    if(state.longRunning)state.longStopRequested=true;
    state.track=null;state.capabilities={};state.active=false;
    ui.preview.pause();ui.preview.srcObject=null;status(false);
    if(state.overlayTick)clearInterval(state.overlayTick);
    state.overlayTick=null;
  }
  async function startCamera(){
    if(state.opening||state.shotBusy||state.longRunning)return;
    if(!navigator.mediaDevices?.getUserMedia){
      ui.cameraHint.textContent='Kamerazugriff fehlt. Safari über HTTPS öffnen (nicht als lokale Datei).';
      notify('Kamera-API nicht verfügbar: HTTPS und Safari verwenden.',true);return;
    }
    state.opening=true;ui.startCameraBtn.disabled=true;ui.startCameraBtn.textContent='Kamera wird geöffnet …';
    stopTracks();
    const portrait=window.innerHeight>=window.innerWidth;
    const video={width:{ideal:portrait?3024:4032},height:{ideal:portrait?4032:3024},frameRate:{ideal:30},facingMode:{ideal:state.facing}};
    if(state.selectedDeviceId)video.deviceId={exact:state.selectedDeviceId};
    try{
      let s;
      try{s=await navigator.mediaDevices.getUserMedia({video,audio:false});}
      catch(e){if(!state.selectedDeviceId)throw e;state.selectedDeviceId=null;delete video.deviceId;s=await navigator.mediaDevices.getUserMedia({video,audio:false});}
      state.stream=s;state.track=s.getVideoTracks()[0];
      if(!state.track)throw Error('Kein Videostream');
      state.track.onended=()=>{stopTracks();ui.noCamera.classList.remove('hidden');notify('Kamera-Verbindung wurde beendet.',true);};
      ui.preview.srcObject=s;
      try{await ui.preview.play();}catch{/* loadedmetadata can unlock preview */}
      state.capabilities=state.track.getCapabilities?.()||{};
      state.active=true;
      const st=getTrackSettings();if(st.facingMode)state.facing=st.facingMode;
      ui.noCamera.classList.add('hidden');status(true);resetZoom();syncTrackUI();updateZoomUI();updateFilter();
      state.overlayTick=setInterval(updateLiveAnalysis,550);
      if(ui.preview.videoWidth)layoutFrame();
      notify('Kamera aktiv. Auflösung im Sucher sichtbar.');
    }catch(e){
      stopTracks();ui.noCamera.classList.remove('hidden');
      const errName=e?.name||'';
      let msg='Kamera konnte nicht gestartet werden.';
      if(errName==='NotAllowedError'||errName==='PermissionDeniedError')msg='Kamerazugriff verweigert. In Safari die Berechtigung erlauben.';
      else if(errName==='NotFoundError')msg='Keine Kamera gefunden.';
      else if(errName==='NotReadableError')msg='Kamera belegt. Andere Kamera-Apps schließen.';
      else if(errName==='OverconstrainedError')msg='Kamera-Einstellung wird nicht unterstützt.';
      ui.cameraHint.textContent=msg;
      notify(msg,true);
    }finally{state.opening=false;ui.startCameraBtn.disabled=false;ui.startCameraBtn.textContent='Kamera starten';}
  }
  async function flipCamera(){
    if(state.shotBusy||state.timedShot||state.opening||state.longRunning)return;
    state.selectedDeviceId=null;
    state.facing=state.facing==='environment'?'user':'environment';
    await startCamera();
  }
  function previewCrop(targetRatio=state.frameRatio, zoom=state.digitalZoom){
    const w=ui.preview.videoWidth,h=ui.preview.videoHeight;
    if(!w||!h)return null;
    return crop(w,h,targetRatio,zoom);
  }
  function makeCaptureCanvas(){
    const v=ui.preview,rect=previewCrop();
    if(!rect)return null;
    // No fake upscaling beyond the dimensions of the current camera stream.
    const canvas=document.createElement('canvas');
    canvas.width=rect.ow;canvas.height=rect.oh;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)return null;
    ctx.save();
    if(state.facing==='user'){ctx.translate(canvas.width,0);ctx.scale(-1,1);}
    if('filter' in ctx)ctx.filter=filterString();
    ctx.drawImage(v,rect.sx,rect.sy,rect.sw,rect.sh,0,0,canvas.width,canvas.height);
    ctx.restore();
    return canvas;
  }
  const toBlob=(canvas,mime,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Kodierung fehlgeschlagen')),mime,quality));
  async function makeThumb(canvas){
    const c=document.createElement('canvas');
    const f=Math.min(1,300/Math.max(canvas.width,canvas.height));
    c.width=Math.max(1,Math.round(canvas.width*f));c.height=Math.max(1,Math.round(canvas.height*f));
    c.getContext('2d').drawImage(canvas,0,0,c.width,c.height);
    return toBlob(c,'image/jpeg',.78);
  }
  function flash(){ui.captureFlash.classList.add('flash');setTimeout(()=>ui.captureFlash.classList.remove('flash'),70);}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
  async function takePhoto(){
    if(!state.active || state.shotBusy){notify('Bitte zuerst die Kamera starten.',true);return;}
    state.shotBusy=true;ui.shutterBtn.disabled=true;
    try{
      if(state.timer){state.timedShot=true;updateTimers();updateZoomUI();
        for(let t=state.timer;t>0;t--){ui.timerBadge.textContent=String(t);ui.timerBadge.classList.remove('hidden');await sleep(1000);if(!state.active)throw Error('Kamera wurde beendet.');}
        ui.timerBadge.classList.add('hidden');}
      const canvas=makeCaptureCanvas();
      if(!canvas)throw Error('Videobild ist noch nicht bereit.');
      const mime=state.format==='png'?'image/png':'image/jpeg';
      const [blob,thumbnail]=await Promise.all([toBlob(canvas,mime,.96),makeThumb(canvas)]);
      const item={id:makeId(),type:'photo',timestamp:Date.now(),mime,width:canvas.width,height:canvas.height,
        filename:`MAFoto_${fileStamp()}_${Math.random().toString(36).slice(2,5)}.${state.format==='png'?'png':'jpg'}`,
        size:blob.size,thumbnail};
      try{await storeMedia(item,blob);await loadGallery();notify(`Foto gespeichert · ${canvas.width} × ${canvas.height} Pixel`);}
      catch(e){notify('Galerie-Speicher nicht verfügbar. Sicherungsdialog wird geöffnet.',true);await shareOrDownload(item,blob);}
      flash();
    }catch(e){notify(e?.message||'Fotoaufnahme fehlgeschlagen.',true);}
    finally{state.shotBusy=false;state.timedShot=false;ui.timerBadge.classList.add('hidden');ui.shutterBtn.disabled=false;updateTimers();updateZoomUI();}
  }
  function fileStamp(d=new Date()){return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;}
  function makeId(){return (globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`).toString();}
  function updateMode(mode){
    if(state.timedShot||state.shotBusy||state.longRunning)return;
    if(!['photo','long'].includes(mode))return;
    state.mode=mode;
    document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    ui.shutterBtn.setAttribute('aria-label',mode==='photo'?'Foto aufnehmen':'Langzeitbelichtung starten');
    ui.longPanel.classList.toggle('hidden',mode!=='long');
    $('app').classList.toggle('long-mode',mode==='long');
    ui.longPreview.classList.add('hidden');ui.longProgress.classList.add('hidden');
    updateRatio();updateZoomUI();updateFilter();updateTimers();
  }

  const EFFECT_DESCRIPTIONS = {
    trails:'Lichtspuren: Helle bewegte Bildteile werden über die Zeit zusammengeführt.',
    silky:'Seidiges Wasser: Die Einzelbilder werden gemittelt, um Bewegungen weich zu zeichnen.',
    night:'Nacht: Bildmittelung kann das Rauschen statischer Motive reduzieren. Keine echte lange Sensorbelichtung.'
  };
  function updateLongControls(){
    ui.longSeconds.value=String(state.longDuration);
    ui.longSecondsLabel.textContent=formatDuration(state.longDuration);
    ui.longDuration.value=Array.from(ui.longDuration.options).some(o=>o.value===String(state.longDuration))?String(state.longDuration):'custom';
    document.querySelectorAll('[data-effect]').forEach(b=>b.classList.toggle('active',b.dataset.effect===state.longEffect));
    ui.longEffectHint.textContent=EFFECT_DESCRIPTIONS[state.longEffect];
    $('stackQuality').value=String(state.stackQuality);
    updateFilter();updateRatio();persist();
  }
  async function lockScreen(){
    if(!('wakeLock' in navigator))return;
    try{state.wakeLock=await navigator.wakeLock.request('screen');}
    catch{notify('Bildschirm bleibt eventuell nicht an: Auto-Sperre vor der Aufnahme ausschalten.',true);}
  }
  async function unlockScreen(){
    if(!state.wakeLock)return;
    try{await state.wakeLock.release();}catch{/* might already be released */}
    state.wakeLock=null;
  }
  function stopLong(){
    if(!state.longRunning)return;
    state.longStopRequested=true;
    ui.stopLongBtn.textContent='Bild wird fertiggestellt …';
  }
  function progressLong(elapsed){
    const sec=Math.max(0,Math.min(state.longDuration,elapsed));
    ui.longProgressTime.textContent=`${formatDuration(Math.floor(sec))} / ${formatDuration(state.longDuration)}`;
    ui.progressFill.style.width=`${(100*sec/state.longDuration).toFixed(1)}%`;
    ui.longFrameCount.textContent=`${state.longFrames} Einzelbilder kombiniert`;
  }
  async function beginLongExposure(){
    if(!state.active||state.shotBusy||state.longRunning){notify('Bitte Kamera starten und Aufnahme abwarten.',true);return;}
    await state.zoomQueue.catch(()=>{});
    if(!ui.preview.videoWidth||!ui.preview.videoHeight){notify('Das Kamerabild ist noch nicht bereit.',true);return;}
    state.shotBusy=true;state.longRunning=true;state.longStopRequested=false;state.longFrames=0;
    ui.longProgress.classList.remove('hidden');
    ui.longPreview.classList.add('hidden');
    ui.stopLongBtn.textContent='Fertigstellen';
    ui.longProgressTitle.textContent=state.longEffect==='trails'?'LICHTSPUREN':state.longEffect==='silky'?'SEIDIGES WASSER':'NACHT-AUFNAHME';
    $('app').classList.add('exposing');
    ui.shutterBtn.setAttribute('aria-label','Langzeitbelichtung vorzeitig beenden und speichern');
    ui.flipBtn.disabled=true;ui.galleryBtn.disabled=true;ui.adjustBtn.disabled=true;
    ui.settingsBtn.disabled=true;ui.helpBtn.disabled=true;
    updateZoomUI();updateTimers();
    let working=null;
    try{
      // The exposure timer starts *after* an optional 3/10 second self-timer.
      if(state.timer){state.timedShot=true;
        for(let n=state.timer;n>0;n--){
          if(!state.active||state.longStopRequested)throw Error('Langzeitaufnahme abgebrochen.');
          ui.timerBadge.textContent=String(n);ui.timerBadge.classList.remove('hidden');await sleep(1000);
        }
        ui.timerBadge.classList.add('hidden');state.timedShot=false;
      }
      await lockScreen();
      const r=previewCrop();if(!r)throw Error('Kamerastream ist noch nicht verfügbar.');
      const scale=state.stackQuality===0?1:Math.min(1,state.stackQuality/Math.max(r.ow,r.oh));
      const width=Math.max(1,Math.round(r.ow*scale)),height=Math.max(1,Math.round(r.oh*scale));
      working=document.createElement('canvas');working.width=width;working.height=height;
      const ctx=working.getContext('2d',{alpha:false});
      if(!ctx)throw Error('2D-Bildverarbeitung vom Browser nicht unterstützt.');
      const preview=ui.longPreview;
      const previewScale=Math.min(1,440/Math.max(width,height));
      preview.width=Math.max(1,Math.round(width*previewScale));preview.height=Math.max(1,Math.round(height*previewScale));
      preview.classList.remove('hidden');
      const pc=preview.getContext('2d');
      const src=ui.preview;
      const desiredMs=state.longDuration*1000;
      const frameMs=state.stackQuality===0?1100:state.longDuration>180?950:state.longDuration>60?750:550;
      state.longStartTime=performance.now();
      const deadline=state.longStartTime+desiredMs;
      let next=state.longStartTime;
      let lastProgress=0;
      while(!state.longStopRequested && state.active){
        const now=performance.now();
        if(now>=deadline && state.longFrames>0)break;
        if(document.hidden){state.longStopRequested=true;break;}
        if(now<next){await sleep(Math.min(120,Math.max(10,next-now)));continue;}
        if(now>next+4500 && state.longFrames>0){
          notify('Aufnahme unterbrochen. Das bisherige Langzeitbild wird gesichert.',true);break;
        }
        ctx.save();
        if(state.longFrames===0){ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;}
        else if(state.longEffect==='trails'){ctx.globalCompositeOperation='lighten';ctx.globalAlpha=1;}
        else{ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1/(state.longFrames+1);}
        if('filter' in ctx)ctx.filter=filterString();
        if(state.facing==='user'){ctx.translate(width,0);ctx.scale(-1,1);}
        ctx.drawImage(src,r.sx,r.sy,r.sw,r.sh,0,0,width,height);
        ctx.restore();
        state.longFrames++;
        const t=performance.now();
        if(t-lastProgress>650||state.longFrames===1){
          // Preview uses a scaled image of the same processed accumulation.
          pc.clearRect(0,0,preview.width,preview.height);pc.drawImage(working,0,0,preview.width,preview.height);
          progressLong((t-state.longStartTime)/1000);
          lastProgress=t;
        }
        next+=frameMs;
      }
      const elapsed=Math.max(0,Math.min(state.longDuration,(performance.now()-state.longStartTime)/1000));
      if(!state.longFrames)throw Error('Keine Einzelbilder aufgenommen.');
      progressLong(elapsed);
      let finished=working;
      if(state.longEffect==='night'){
        // Subtle digital brightening AFTER averaging; does not add real sensor exposure.
        const output=document.createElement('canvas');output.width=width;output.height=height;
        const out=output.getContext('2d',{alpha:false});
        if('filter' in out)out.filter='brightness(1.08) contrast(1.025)';
        out.drawImage(working,0,0);finished=output;
      }
      const mime=state.format==='png'?'image/png':'image/jpeg';
      const [blob,thumbnail]=await Promise.all([toBlob(finished,mime,.96),makeThumb(finished)]);
      const item={id:makeId(),type:'photo',timestamp:Date.now(),mime,width,height,size:blob.size,
        filename:`MAFoto_${fileStamp()}_LANGZEIT_${state.longEffect.toUpperCase()}_${Math.round(elapsed)}S.${state.format==='png'?'png':'jpg'}`,
        thumbnail,longExposure:{mode:state.longEffect,requestedSeconds:state.longDuration,elapsedSeconds:Math.round(elapsed),frames:state.longFrames,kind:'software-stacking'}};
      try{await storeMedia(item,blob);await loadGallery();notify(`Langzeitaufnahme gesichert: ${Math.round(elapsed)} s · ${state.longFrames} Bilder · ${width}×${height} Pixel`);}
      catch{notify('Galeriespeicher nicht verfügbar. Bitte Export sichern.',true);await shareOrDownload(item,blob);}
      flash();
    }catch(e){notify(e?.message||'Langzeitaufnahme fehlgeschlagen.',true);}
    finally{
      await unlockScreen();
      state.longRunning=false;state.longStopRequested=false;state.timedShot=false;state.shotBusy=false;
      ui.timerBadge.classList.add('hidden');ui.longPreview.classList.add('hidden');ui.longProgress.classList.add('hidden');
      $('app').classList.remove('exposing');
      ui.shutterBtn.setAttribute('aria-label','Langzeitbelichtung starten');
      ui.flipBtn.disabled=false;ui.galleryBtn.disabled=false;ui.adjustBtn.disabled=false;
      ui.settingsBtn.disabled=false;ui.helpBtn.disabled=false;
      updateZoomUI();updateTimers();
    }
  }
  function setupModal(id){
    document.querySelectorAll('.sheet').forEach(s=>s.classList.add('hidden'));
    state.activeSheet=id;
    ui.backdrop.classList.remove('hidden');$(id).classList.remove('hidden');
  }
  function closeModal(){
    const prev=state.activeSheet;
    if(prev==='detailSheet'){clearDetailMedia();setupModal('gallerySheet');return;}
    document.querySelectorAll('.sheet').forEach(s=>s.classList.add('hidden'));
    state.activeSheet=null;ui.backdrop.classList.add('hidden');
  }
  function dbRequest(req){return new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error||Error('Datenbankfehler'));});}
  async function openDb(){
    if(!('indexedDB' in window))throw Error('IndexedDB wird nicht unterstützt.');
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open('mafoto-private',1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('metadata'))db.createObjectStore('metadata',{keyPath:'id'});
        if(!db.objectStoreNames.contains('media'))db.createObjectStore('media',{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('IndexedDB nicht verfügbar'));
      req.onblocked=()=>reject(Error('Datenbank blockiert. Andere App-Tabs schließen.'));
    });
  }
  async function storeMedia(meta,blob){
    if(!state.db)state.db=await openDb();
    await new Promise((resolve,reject)=>{
      const tx=state.db.transaction(['metadata','media'],'readwrite');
      tx.objectStore('metadata').put(meta);
      tx.objectStore('media').put({id:meta.id,blob});
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||Error('Speichern fehlgeschlagen'));
      tx.onabort=()=>reject(tx.error||Error('Speicher voll oder Zugriff verweigert'));
    });
  }
  async function listMeta(){
    if(!state.db)state.db=await openDb();
    const tx=state.db.transaction('metadata','readonly');
    const items=await dbRequest(tx.objectStore('metadata').getAll());
    return items.sort((a,b)=>b.timestamp-a.timestamp);
  }
  async function readMedia(id){
    if(!state.db)state.db=await openDb();
    const tx=state.db.transaction('media','readonly');
    const item=await dbRequest(tx.objectStore('media').get(id));
    if(!item?.blob)throw Error('Datei im lokalen Speicher nicht gefunden.');
    return item.blob;
  }
  async function removeMedia(id){
    if(!state.db)return;
    await new Promise((resolve,reject)=>{
      const tx=state.db.transaction(['metadata','media'],'readwrite');
      tx.objectStore('metadata').delete(id);tx.objectStore('media').delete(id);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }
  function cleanupGalleryUrls(){for(const url of state.galleryUrls)URL.revokeObjectURL(url);state.galleryUrls=[];}
  function clearDetailMedia(){if(state.detailUrl){URL.revokeObjectURL(state.detailUrl);state.detailUrl=null;}ui.detailMedia.replaceChildren();}
  function releaseLastThumb(){if(state.lastThumbUrl)URL.revokeObjectURL(state.lastThumbUrl);state.lastThumbUrl=null;}
  async function loadGallery(){
    try{
      state.galleries=await listMeta();cleanupGalleryUrls();releaseLastThumb();
      ui.galleryGrid.replaceChildren();
      ui.galleryCount.textContent=String(state.galleries.length);
      ui.galleryCount.classList.toggle('hidden',!state.galleries.length);
      ui.galleryEmpty.classList.toggle('hidden',!!state.galleries.length);
      ui.gallerySummary.textContent=`${state.galleries.length} ${state.galleries.length===1?'Datei':'Dateien'}`;
      for(const [index,item] of state.galleries.entries()){
        const btn=document.createElement('button');btn.type='button';btn.className='gallery-item';btn.setAttribute('aria-label',`Foto vom ${new Date(item.timestamp).toLocaleString('de-DE')} öffnen`);
        btn.addEventListener('click',()=>showDetail(item.id));
        if(item.thumbnail){const src=URL.createObjectURL(item.thumbnail);state.galleryUrls.push(src);
          const img=document.createElement('img');img.src=src;img.loading=index>12?'lazy':'eager';img.alt='';btn.append(img);}
        ui.galleryGrid.append(btn);
      }
      const last=state.galleries[0];
      if(last?.thumbnail){state.lastThumbUrl=URL.createObjectURL(last.thumbnail);ui.lastThumbnail.src=state.lastThumbUrl;ui.lastThumbnail.classList.remove('hidden');ui.galleryPlaceholder.classList.add('hidden');}
      else{ui.lastThumbnail.removeAttribute('src');ui.lastThumbnail.classList.add('hidden');ui.galleryPlaceholder.classList.remove('hidden');}
    }catch(e){ui.gallerySummary.textContent='Lokale Galerie derzeit nicht verfügbar';notify('Lokaler Gerätespeicher nicht verfügbar.',true);}
  }
  function formatSize(bytes){return (bytes/1024/1024).toFixed(2)+' MB';}
  function formatDuration(sec){return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
  async function showDetail(id){
    const meta=state.galleries.find(m=>m.id===id);if(!meta)return;
    clearDetailMedia();state.selectedId=id;setupModal('detailSheet');
    ui.detailTitle.textContent='Foto ansehen';
    ui.detailMetadata.textContent=[new Date(meta.timestamp).toLocaleString('de-DE'),`${meta.width||'?'} × ${meta.height||'?'} Pixel`,formatSize(meta.size),meta.longExposure?`Software-Langzeit: ${meta.longExposure.elapsedSeconds}s · ${meta.longExposure.frames} Einzelbilder · ${meta.longExposure.mode}`:meta.mime].join(' · ');
    try{
      const blob=await readMedia(id);if(state.selectedId!==id || state.activeSheet!=='detailSheet')return;
      state.detailUrl=URL.createObjectURL(blob);
      const img=document.createElement('img');img.src=state.detailUrl;img.alt='Aufgenommenes Foto';ui.detailMedia.append(img);
    }catch(e){notify(e?.message||'Aufnahme konnte nicht geöffnet werden.',true);}
  }
  async function shareOrDownload(item,blob){
    const file=new File([blob],item.filename,{type:item.mime});
    if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
      try{await navigator.share({files:[file],title:item.filename});return true;}
      catch(e){if(e?.name==='AbortError')return false;}
    }
    downloadFile(item,blob);
    return true;
  }
  function downloadFile(item,blob){
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=item.filename;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    notify('Datei-Download gestartet. Bei iOS ggf. in „Dateien“ sichern.');
  }
  async function selectedBlob(){
    const item=state.galleries.find(m=>m.id===state.selectedId);
    if(!item)throw Error('Keine Aufnahme ausgewählt.');
    return {item,blob:await readMedia(item.id)};
  }
  async function openLensList(){
    if(!navigator.mediaDevices?.enumerateDevices){notify('Geräteauswahl nicht unterstützt.',true);return;}
    try{
      const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
      ui.lensList.replaceChildren();
      if(!devices.length)throw Error('Keine Kameras erkannt. Zuerst Kamera aktivieren.');
      devices.forEach((d,i)=>{
        const btn=document.createElement('button');btn.textContent=`${i+1}. ${d.label||'Kamera '+(i+1)}${d.deviceId===state.selectedDeviceId?' ✓':''}`;
        btn.addEventListener('click',async()=>{
          if(state.longRunning){notify('Während der Aufnahme kann die Kamera nicht gewechselt werden.',true);return;}
          state.selectedDeviceId=d.deviceId;ui.lensList.classList.add('hidden');closeModal();await startCamera();
        });ui.lensList.append(btn);
      });
      ui.lensList.classList.remove('hidden');
    }catch(e){notify(e?.message||'Kameras konnten nicht aufgelistet werden.',true);}
  }
  function drawHistogram(){
    const c=ui.histogram,ctx=c.getContext('2d');
    if(!ctx)return;ctx.clearRect(0,0,c.width,c.height);
    if(!state.active || !ui.preview.videoWidth)return;
    try{
      const sample=document.createElement('canvas');sample.width=120;sample.height=80;
      sample.getContext('2d',{willReadFrequently:true}).drawImage(ui.preview,0,0,120,80);
      const px=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,120,80).data;
      const hist=new Uint32Array(64);
      for(let i=0;i<px.length;i+=16){const v=.2126*px[i]+.7152*px[i+1]+.0722*px[i+2];hist[Math.min(63,Math.floor(v/4))]++;}
      const peak=Math.max(1,...hist);
      ctx.fillStyle='#54c7c8';
      for(let j=0;j<hist.length;j++){const h=Math.max(1,(hist[j]/peak)*c.height);ctx.fillRect(j*c.width/64,c.height-h,c.width/64-.3,h);}
    }catch{/* avoid crashing camera due to frame analysis */}
  }
  function drawZebra(){
    const overlay=ui.zebraOverlay,ctx=overlay.getContext('2d',{willReadFrequently:true});
    if(!ctx || !state.zebra || !state.active || !ui.preview.videoWidth)return;
    const w=160,h=Math.max(60,Math.round(w/state.frameRatio));
    if(overlay.width!==w||overlay.height!==h){overlay.width=w;overlay.height=h;}
    const src=document.createElement('canvas');src.width=w;src.height=h;
    const sctx=src.getContext('2d',{willReadFrequently:true});
    const c=previewCrop();if(!c)return;
    try{
      sctx.drawImage(ui.preview,c.sx,c.sy,c.sw,c.sh,0,0,w,h);
      const srcData=sctx.getImageData(0,0,w,h).data;
      const out=ctx.createImageData(w,h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;const lum=.2126*srcData[i]+.7152*srcData[i+1]+.0722*srcData[i+2];
        if(lum>248 && (x+y)%10<5){out.data[i]=246;out.data[i+1]=165;out.data[i+2]=61;out.data[i+3]=225;}
      }
      ctx.putImageData(out,0,0);
    }catch{/* sample frame may be unavailable */}
  }
  function updateLiveAnalysis(){
    if(document.hidden)return;
    drawHistogram();
    if(state.zebra)drawZebra();
  }
  async function checkUpdates(){
    ui.updateStatus.textContent='Prüfung läuft …';
    if(!state.registration){ui.updateStatus.textContent='Update-Prüfung erfordert HTTPS und Service Worker.';return;}
    try{
      await state.registration.update();
      const waiting=state.registration.waiting;
      if(waiting){state.updateReady=true;ui.updateStatus.textContent='Neue Version bereit. Tippe erneut zum Installieren.';
        ui.checkUpdateBtn.textContent='Update installieren';}
      else{ui.updateStatus.textContent=`Version ${VERSION} · kein neues Update erkannt. Es kann Server-Cache geben.`;
        ui.checkUpdateBtn.textContent='Auf Updates prüfen';}
    }catch{ui.updateStatus.textContent='Update-Prüfung fehlgeschlagen. Bitte Internetverbindung kontrollieren.';}
  }
  async function registerWorker(){
    if(!('serviceWorker' in navigator) || !window.isSecureContext)return;
    try{
      state.registration=await navigator.serviceWorker.register('./sw.js');
      if(state.registration.waiting){state.updateReady=true;ui.checkUpdateBtn.textContent='Update installieren';ui.updateStatus.textContent='Ein Update ist verfügbar.';}
      state.registration.addEventListener('updatefound',()=>{
        const sw=state.registration.installing;
        sw?.addEventListener('statechange',()=>{
          if(sw.state==='installed' && navigator.serviceWorker.controller){state.updateReady=true;ui.checkUpdateBtn.textContent='Update installieren';ui.updateStatus.textContent='Neue App-Version bereit zur Installation.';}
        });
      });
      let once=false;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!once){once=true;location.reload();}});
    }catch{/* works online without SW */}
  }
  function bind(){
    ui.startCameraBtn.addEventListener('click',startCamera);
    ui.flipBtn.addEventListener('click',flipCamera);
    ui.gridBtn.addEventListener('click',()=>{state.grid=state.grid==='off'?'thirds':'off';refreshGrid();});
    ui.zebraBtn.addEventListener('click',()=>{state.zebra=!state.zebra;updateZebra();if(!state.zebra)ui.zebraOverlay.getContext('2d')?.clearRect(0,0,ui.zebraOverlay.width,ui.zebraOverlay.height);});
    ui.timerBtn.addEventListener('click',()=>{state.timer=timerList[(timerList.indexOf(state.timer)+1)%timerList.length];updateTimers();});

    ui.zoomSlider.addEventListener('input',e=>setZoom(e.target.value));
    document.querySelectorAll('[data-zoom]').forEach(b=>b.addEventListener('click',()=>setZoom(b.dataset.zoom)));
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>updateMode(b.dataset.mode)));
    ui.shutterBtn.addEventListener('click',()=>{
      if(state.mode==='photo')takePhoto();
      else if(state.mode==='long'){if(state.longRunning)stopLong();else beginLongExposure();}
    });
    ui.stopLongBtn.addEventListener('click',stopLong);
    ui.longSeconds.addEventListener('input',e=>{if(state.longRunning)return;state.longDuration=Math.max(1,Math.min(300,Number(e.target.value)));updateLongControls();});
    ui.longDuration.addEventListener('change',e=>{if(state.longRunning||e.target.value==='custom')return;state.longDuration=Number(e.target.value);updateLongControls();});
    document.querySelectorAll('[data-effect]').forEach(b=>b.addEventListener('click',()=>{if(state.longRunning)return;state.longEffect=b.dataset.effect;updateLongControls();}));
    $('stackQuality').addEventListener('change',e=>{if(state.longRunning)return;state.stackQuality=Number(e.target.value);persist();});
    ui.viewfinder.addEventListener('click',(e)=>{
      if(!state.active||e.target.closest('button'))return;
      const r=ui.viewfinder.getBoundingClientRect();
      ui.focusMark.style.left=`${Math.max(8,Math.min(92,(e.clientX-r.left)/r.width*100))}%`;
      ui.focusMark.style.top=`${Math.max(8,Math.min(92,(e.clientY-r.top)/r.height*100))}%`;
      ui.focusMark.classList.add('show');clearTimeout(focusTimer);focusTimer=setTimeout(()=>ui.focusMark.classList.remove('show'),1450);
    });
    ui.preview.addEventListener('loadedmetadata',()=>{layoutFrame();syncTrackUI();});
    ui.preview.addEventListener('resize',()=>{layoutFrame();syncTrackUI();});
    ui.galleryBtn.addEventListener('click',()=>{if(!state.longRunning){loadGallery();setupModal('gallerySheet');}});
    ui.adjustBtn.addEventListener('click',()=>{if(!state.longRunning)setupModal('adjustSheet');});
    ui.settingsBtn.addEventListener('click',()=>setupModal('settingsSheet'));
    ui.helpBtn.addEventListener('click',()=>setupModal('helpSheet'));
    ui.backdrop.addEventListener('click',closeModal);
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeModal));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.activeSheet)closeModal();if(e.code==='Space'&&!state.activeSheet&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='BUTTON'){e.preventDefault();ui.shutterBtn.click();}});
    ui.presets.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{
      state.preset=b.dataset.preset;state.adjust={...presets[state.preset]};updateEditingUI();persist();
    }));
    for(const k of Object.keys(state.adjust))ui[k].addEventListener('input',e=>{
      state.adjust[k]=Number(e.target.value);state.preset='custom';updateEditingUI();persist();
    });
    ui.resetAdjust.addEventListener('click',()=>{state.preset='natural';state.adjust={...presets.natural};updateEditingUI();persist();});
    ui.fileFormat.addEventListener('change',e=>{state.format=e.target.value;updateRatio();});
    ui.gridType.addEventListener('change',e=>{state.grid=e.target.value;refreshGrid();});
    ui.lensSelectBtn.addEventListener('click',openLensList);
    ui.saveMediaBtn.addEventListener('click',async()=>{try{const {item,blob}=await selectedBlob();downloadFile(item,blob);}catch(e){notify(e.message,true);}});
    ui.shareMediaBtn.addEventListener('click',async()=>{try{const {item,blob}=await selectedBlob();await shareOrDownload(item,blob);}catch(e){notify(e.message,true);}});
    ui.deleteMediaBtn.addEventListener('click',async()=>{
      if(!state.selectedId||!confirm('Diese Aufnahme endgültig aus der lokalen Galerie löschen?'))return;
      try{await removeMedia(state.selectedId);clearDetailMedia();await loadGallery();setupModal('gallerySheet');notify('Aufnahme gelöscht.');}
      catch{notify('Löschen fehlgeschlagen.',true);}
    });
    ui.clearGalleryBtn.addEventListener('click',async()=>{
      if(!confirm('Wirklich ALLE lokalen Aufnahmen unwiderruflich löschen?'))return;
      try{for(const item of state.galleries)await removeMedia(item.id);await loadGallery();notify('Lokale Galerie geleert.');}
      catch{notify('Galerie konnte nicht vollständig gelöscht werden.',true);}
    });
    ui.checkUpdateBtn.addEventListener('click',async()=>{
      if(state.updateReady&&state.registration?.waiting){state.registration.waiting.postMessage({type:'SKIP_WAITING'});return;}
      await checkUpdates();
    });
    window.addEventListener('resize',layoutFrame);
    window.addEventListener('orientationchange',()=>setTimeout(layoutFrame,250));
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden && state.longRunning)state.longStopRequested=true;
      if(!document.hidden && state.active)ui.preview.play().catch(()=>{});
    });
    if('ResizeObserver' in window)new ResizeObserver(layoutFrame).observe(ui.stage);
  }
  async function init(){
    loadSettings();bind();updateEditingUI();updateZebra();refreshGrid();updateTimers();updateRatio();updateZoomUI();
    ui.fileFormat.value=state.format;ui.gridType.value=state.grid;updateLongControls();
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia){ui.cameraHint.textContent='Für die Kamera muss die WebApp über HTTPS in Safari geöffnet werden.';}
    await Promise.all([loadGallery(),registerWorker()]);
  }
  init().catch(e=>notify(`App-Start: ${e.message}`,true));
})();
