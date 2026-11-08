import { useEffect, useRef, useState } from 'react';
import { api, ws } from './netlify-transport';
import {
  processCamera,
  videoDimensions,
  formats,
  backgrounds,
} from './live-background';
import { saveRecording, listRecordings, deleteRecording, type SavedRecording } from './recording-library';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  MonitorOff,
  PhoneOff,
  Copy,
  Plus,
  ArrowRight,
  ArrowLeft,
  MessageSquare,
  Users,
  Circle,
  Square,
  Settings,
  CloudUpload,
  Download,
  ShieldCheck,
  Check,
  X,
  Link2,
  Menu,
  Send,
  HardDrive,
  AlertCircle,
  ExternalLink,
  Camera,
  Headphones,
  Library,
  Share2,
  Trash2,
  Maximize2,
  Minimize2,
  PlayCircle,
} from 'lucide-react';

type Member = { id: string; name: string };
type ChatItem = {
  id: string;
  from: string;
  name: string;
  text: string;
  ts: number;
};
type Recording = { blob: Blob; name: string; url: string };
type AnySignal = {
  type: string;
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, n => alphabet[n % alphabet.length]).join('');
}
function currentRoom() {
  const match = location.hash.match(/^#\/room\/([a-z2-9]{12})$/);
  return match ? match[1] : '';
}
function readableError(e: unknown) {
  return e instanceof Error ? e.message : 'Une erreur est survenue.';
}

function StreamVideo({
  stream,
  muted = false,
  fit = 'contain',
}: {
  stream: MediaStream | null;
  muted?: boolean;
  fit?: 'contain' | 'cover';
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  if (!stream)
    return (
      <div className="empty-avatar">
        <Users size={38} />
      </div>
    );
  const hasVideo = stream.getVideoTracks().length > 0;
  return (
    <>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        // Never mirror front camera: local preview, remote view and exported
        // recordings must all use the same natural left-to-right orientation.
        style={{ objectFit: fit, transform: 'none' }}
        className={!hasVideo ? 'audio-only-video' : ''}
      />
      {!hasVideo && (
        <div className="empty-avatar">
          <Users size={38} />
        </div>
      )}
    </>
  );
}

function StreamAudio({stream}:{stream:MediaStream|null}) {
  const ref=useRef<HTMLAudioElement>(null);
  useEffect(()=>{if(ref.current){ref.current.srcObject=stream;void ref.current.play().catch(()=>{});}},[stream]);
  return <audio ref={ref} autoPlay playsInline style={{display:'none'}}/>;
}
function App() {
  const [room, setRoom] = useState(currentRoom);
  const [newRoom, setNewRoom] = useState('');
  const [displayName, setDisplayName] = useState(
    localStorage.getItem('nexa_name') || ''
  );
  const [joined, setJoined] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [hostId,setHostId]=useState<string|null>(null);
  const [activeSpeaker,setActiveSpeaker]=useState<string>('');
  const [shareOwner,setShareOwner]=useState<string|null>(null);
  const [pinned,setPinned]=useState<string|null>(null);
  const [participantsOpen,setParticipantsOpen]=useState(false);
  const [gallery,setGallery]=useState(false);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [bg, setBg] = useState('original');
  const [format, setFormat] = useState('original');
  const [quality, setQuality] = useState('1080');
  const [face, setFace] = useState('user');
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [cameraInfo, setCameraInfo] = useState('');
  const [effectBusy, setEffectBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [clientId, setClientId] = useState(
    localStorage.getItem('nexa_google_client') || ''
  );
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState('');
  const [driveStatus, setDriveStatus] = useState<'idle' | 'uploading' | 'saved' | 'failed'>('idle');
  const [driveAdvanced, setDriveAdvanced] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordMode, setRecordMode] = useState<'video' | 'audio'>('video');
  const [recordReady, setRecordReady] = useState<Recording | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedRecording[]>([]);
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savingLocal, setSavingLocal] = useState(false);
  const [importingLocal, setImportingLocal] = useState(false);
  const [fullStage, setFullStage] = useState(false);
  const [fillStage, setFillStage] = useState(false);
  const [portraitView, setPortraitView] = useState(() => window.innerHeight >= window.innerWidth);
  const isPhone = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const [uploadedLink, setUploadedLink] = useState('');
  const [remoteRecording, setRemoteRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const peerId = useRef(crypto.randomUUID());
  const connRef = useRef<ReturnType<typeof ws.connect> | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const streamsRef = useRef<Record<string, MediaStream>>({});
  const localRef = useRef<MediaStream | null>(null);
  const rawRef = useRef<MediaStream | null>(null);
  const effectRef = useRef<Awaited<ReturnType<typeof processCamera>> | null>(
    null
  );
  const configRef = useRef({
    bg: 'original',
    format: 'original',
    quality: '1080',
    photo: null as HTMLImageElement | null,
  });
  const screenRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stopCaptureRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef('');
  const readyRef = useRef<Recording | null>(null);
  const handleRef = useRef<(msg: any) => void>(() => {});
  const roomRef = useRef(room);
  const nameRef = useRef(displayName);
  const isJoinedRef = useRef(false);

  useEffect(() => {
    // Public Google OAuth client ID can be configured once by the app owner.
    // End users only see the standard Google authorization window.
    let active = true;
    api.get('/api/drive/config')
      .then(result => {
        const configured = result.data?.clientId;
        if(active && typeof configured === 'string' && configured.endsWith('.apps.googleusercontent.com')) {
          setClientId(configured);
          localStorage.setItem('nexa_google_client', configured);
        }
      })
      .catch(() => { /* Local fallback remains available */ });
    return () => { active = false; };
  }, []);

  const focusRef=useRef(peerId.current);
  const shareRef=useRef<string|null>(null);
  const pinRef=useRef<string|null>(null);

  useEffect(() => {
    const onHash = () => {
      const value = currentRoom();
      if (isJoinedRef.current && value !== roomRef.current) {
        leaveMeeting();
      }
      roomRef.current = value;
      setRoom(value);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  useEffect(()=>{
    if(!joined)return;
    const audio=new AudioContext();void audio.resume().catch(()=>{});
    const nodes=new Map<string,{stream:MediaStream,source:MediaStreamAudioSourceNode,analyser:AnalyserNode,values:Uint8Array}>();
    let candidate='',votes=0;
    const timer=window.setInterval(()=>{
      const current=[{id:peerId.current,stream:rawRef.current},
        ...Object.entries(streamsRef.current).map(([id,stream])=>({id,stream}))
      ].filter(i=>i.stream?.getAudioTracks().length) as {id:string;stream:MediaStream}[];
      for(const [id,node] of nodes)if(!current.some(i=>i.id===id&&i.stream===node.stream)){
        node.source.disconnect();node.analyser.disconnect();nodes.delete(id);
      }
      for(const item of current)if(!nodes.has(item.id)){
        try {
          const source=audio.createMediaStreamSource(item.stream);
          const analyser=audio.createAnalyser();analyser.fftSize=512;source.connect(analyser);
          nodes.set(item.id,{stream:item.stream,source,analyser,values:new Uint8Array(512)});
        }catch{ /* microphone unavailable */ }
      }
      let top='',strength=.05;
      for(const [id,node] of nodes) {
        node.analyser.getByteTimeDomainData(node.values as Uint8Array<ArrayBuffer>);
        let sum=0;
        for(const value of node.values){const v=(value-128)/128;sum+=v*v;}
        const rms=Math.sqrt(sum/node.values.length);
        if(rms>strength){top=id;strength=rms;}
      }
      if(top){
        if(top===candidate)votes++;else{candidate=top;votes=1;}
        if(votes>=2&&focusRef.current!==top){focusRef.current=top;setActiveSpeaker(top);}
      }
    },240);
    return()=>{clearInterval(timer);for(const node of nodes.values()){node.source.disconnect();node.analyser.disconnect();}void audio.close();};
  },[joined]);

  function pinParticipant(id:string){
    const next=pinRef.current===id?null:id;
    pinRef.current=next;setPinned(next);
  }
  async function muteParticipant(id:string){
    try{await api.post('/api/rooms/'+roomRef.current+'/mute',{from:peerId.current,to:id});toast('Micro coupé.');}
    catch(err){toast('Modération impossible : '+readableError(err));}
  }
  async function muteAllParticipants(){
    const results=await Promise.allSettled(members.map(m=>api.post('/api/rooms/'+roomRef.current+'/mute',{from:peerId.current,to:m.id})));
    toast(results.some(r=>r.status==='rejected')?'Un ou plusieurs micros n’ont pas pu être coupés.':'Les autres micros ont été coupés.');
  }
  async function removeParticipant(id:string){
    if(!window.confirm('Retirer cette personne de la réunion ?'))return;
    try{await api.post('/api/rooms/'+roomRef.current+'/kick',{from:peerId.current,to:id});toast('Participant retiré.');}
    catch(err){toast('Retrait impossible : '+readableError(err));}
  }


  useEffect(() => {
    if (!libraryOpen) return;
    let active=true;
    listRecordings().then(items => { if (active) setSavedItems(items); })
      .catch(e=>{if(active)toast('Impossible de lire la bibliothèque : '+readableError(e));});
    return ()=>{active=false;};
  },[libraryOpen]);

  useEffect(()=>{return ()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);};},[previewUrl]);

  async function keepRecording(blob:Blob,name:string) {
    setSavingLocal(true);
    try {
      const item=await saveRecording(blob,name);
      setSavedItems(previous=>[item,...previous.filter(x=>x.id!==item.id)]);
      toast('Enregistrement sauvegardé dans Mes enregistrements sur cet appareil.');
    } catch(err) {
      toast('Stockage insuffisant ou inaccessible : '+readableError(err)+'. Télécharge la vidéo avant de quitter.');
    } finally {
      setSavingLocal(false);
    }
  }

  async function importRecordings(files: FileList | null) {
    if (!files?.length) return;
    setImportingLocal(true);
    let added = 0;
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) continue;
        const saved = await saveRecording(file, file.name);
        setSavedItems(previous => [saved, ...previous]);
        added++;
      }
      toast(added ? `${added} fichier(s) ajouté(s) à la bibliothèque locale.` : 'Sélectionne un fichier audio ou vidéo.');
    } catch(error) {
      toast('Import incomplet : ' + readableError(error) + '. Vérifie le stockage disponible sur ton appareil.');
    } finally { setImportingLocal(false); }
  }

  function downloadRecording(item:SavedRecording) {
    const url=URL.createObjectURL(item.blob);
    const link=document.createElement('a');link.href=url;link.download=item.name;
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }

  async function shareRecording(item:SavedRecording) {
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isVideo = item.mime.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(item.name);
    // Remove codecs parameters from the MIME type: iOS share targets expect
    // video/mp4, not video/mp4;codecs=avc1..., which can fail canShare().
    const mime = /\.mp4$/i.test(item.name) || item.mime.includes('video/mp4')
      ? 'video/mp4'
      : /\.m4a$/i.test(item.name) || item.mime.includes('audio/mp4')
        ? 'audio/mp4'
        : item.mime.split(';')[0] || 'application/octet-stream';
    if (ios && isVideo && mime !== 'video/mp4') {
      toast('Photos sur iPhone exige un fichier MP4 compatible. Cet enregistrement est en ' + mime + ' ; essaie un nouvel enregistrement dans Safari ou télécharge-le dans Fichiers.');
    }
    const file = new File([item.blob], item.name, {type:mime, lastModified:Date.now()});
    const data = {files:[file], title:item.name};
    // Important: navigator.share() is invoked synchronously from the click.
    // iOS does not allow a website to write silently to the Photos library.
    if (navigator.share && navigator.canShare?.({files:[file]})) {
      if (ios && isVideo && mime === 'video/mp4')
        toast('Sur iPhone, choisis « Enregistrer la vidéo » dans la feuille de partage pour l’ajouter à Photos.');
      try { await navigator.share(data); return; }
      catch(err) {
        if ((err as Error)?.name === 'AbortError') return;
        toast('Partage iPhone indisponible : ' + readableError(err) + '. Essaie le lecteur vidéo ou Fichiers.');
        return;
      }
    }
    if (ios && isVideo && mime === 'video/mp4') {
      // Safari may support its own native video viewer even if Web Share files
      // are not supported. Keep the current preview/link as fallback.
      const url = URL.createObjectURL(item.blob);
      const viewer = window.open(url, '_blank');
      if (viewer) {
        window.setTimeout(() => URL.revokeObjectURL(url), 120000);
        toast('Vidéo ouverte. Utilise le menu Partager du lecteur Safari puis « Enregistrer la vidéo ».');
        return;
      }
      URL.revokeObjectURL(url);
    }
    downloadRecording(item);
    toast('Partage direct non disponible sur ce navigateur : fichier téléchargé. Ouvre-le depuis Fichiers ou utilise Safari.');
  }

  function previewRecording(item:SavedRecording) {
    if(activePreview===item.id){setActivePreview(null);setPreviewUrl(null);return;}
    setPreviewUrl(URL.createObjectURL(item.blob));setActivePreview(item.id);
  }

  async function removeRecording(item:SavedRecording) {
    if(!window.confirm('Supprimer définitivement cet enregistrement de cet appareil ?'))return;
    try {
      await deleteRecording(item.id);
      setSavedItems(previous=>previous.filter(x=>x.id!==item.id));
      if(activePreview===item.id){setActivePreview(null);setPreviewUrl(null);}
      toast('Enregistrement supprimé.');
    } catch(err){toast('Suppression impossible : '+readableError(err));}
  }

  useEffect(() => {
    const update = () => setPortraitView(window.innerHeight >= window.innerWidth);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('orientationchange', update); };
  }, []);
  function openRoom(value: string) {
    roomRef.current = value;
    location.hash = '/room/' + value;
    setRoom(value);
    setNotice('');
    setChat([]);
    setMembers([]);
    setHostId(null);setShareOwner(null);shareRef.current=null;
    setPinned(null);pinRef.current=null;focusRef.current=peerId.current;setActiveSpeaker(peerId.current);
    setRecordReady(null);
    setUploadedLink('');
  }

  function toast(message: string) {
    setNotice(message);
  }

  async function emit(kind: string, data: Record<string, unknown> = {}) {
    if (!roomRef.current) return;
    await api.post('/api/rooms/' + roomRef.current + '/event', {
      from: peerId.current,
      kind,
      name: nameRef.current,
      ...data,
    });
  }

  async function sendSignal(to: string, signal: unknown) {
    if (!roomRef.current) return;
    try {
      await api.post('/api/rooms/' + roomRef.current + '/signal', {
        from: peerId.current,
        to,
        signal,
      });
    } catch (e) {
      console.warn('Signal failed', e);
    }
  }

  function getPeer(id: string) {
    const existing = pcs.current.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    pcs.current.set(id, pc);
    const source = localRef.current;
    if (source && source.getTracks().length) {
      source.getTracks().forEach(track => {
        const selected =
          track.kind === 'video' && screenRef.current
            ? screenRef.current.getVideoTracks()[0]
            : track;
        if (selected) pc.addTrack(selected, source);
      });
    } else {
      // A listen-only guest can still negotiate and receive audio and video.
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
    }
    pc.onicecandidate = evt => {
      if (evt.candidate)
        sendSignal(id, {
          type: 'candidate',
          candidate: evt.candidate.toJSON(),
        });
    };
    pc.ontrack = evt => {
      const stream = evt.streams[0] || new MediaStream([evt.track]);
      streamsRef.current = { ...streamsRef.current, [id]: stream };
      setStreams({ ...streamsRef.current });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed')
        toast(
          'Connexion instable : certains réseaux nécessitent un relais TURN.'
        );
    };
    return pc;
  }

  async function initiate(id: string) {
    if (id === peerId.current) return;
    try {
      const pc = getPeer(id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(id, { type: 'offer', sdp: pc.localDescription?.sdp });
    } catch (e) {
      console.error(e);
    }
  }

  async function onSignal(from: string, signal: any) {
    try {
      const pc = getPeer(from);
      if (signal.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(from, {
          type: 'answer',
          sdp: pc.localDescription?.sdp,
        });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(signal.candidate);
        } else {
          pendingIce.current.set(from, [
            ...(pendingIce.current.get(from) || []),
            signal.candidate,
          ]);
        }
      }
      if (pc.remoteDescription && pendingIce.current.has(from)) {
        const queued = pendingIce.current.get(from) || [];
        pendingIce.current.delete(from);
        for (const item of queued)
          await pc.addIceCandidate(item).catch(() => {});
      }
    } catch (e) {
      console.warn('RTC signaling', e);
    }
  }

  function closePeer(id: string) {
    pcs.current.get(id)?.close();
    pcs.current.delete(id);
    const { [id]: _removed, ...rest } = streamsRef.current;
    streamsRef.current = rest;
    setStreams(rest);
    pendingIce.current.delete(id);
    if(pinRef.current===id){pinRef.current=null;setPinned(null);}
    if(shareRef.current===id){shareRef.current=null;setShareOwner(null);}
    if(focusRef.current===id){focusRef.current=peerId.current;setActiveSpeaker(peerId.current);}
  }

  handleRef.current = (message: any) => {
    if(message?.type==='host.mute'&&message.payload?.roomId===roomRef.current) {
      rawRef.current?.getAudioTracks().forEach(t=>t.enabled=false);
      setMicOn(false);toast('L’hôte a coupé ton micro. Tu peux le réactiver.');
      return;
    }
    if(message?.type==='host.kick'&&message.payload?.roomId===roomRef.current) {
      void leaveMeeting();toast('L’hôte t’a retiré de la réunion.');
      return;
    }
    if (message?.type === 'rtc.signal') {
      const p = message.payload;
      if (p?.roomId === roomRef.current && p?.from && p?.signal)
        onSignal(p.from, p.signal);
      return;
    }
    if (message?.type !== 'entity.update') return;
    const msg = message.payload;
    if (msg?.entity_type !== 'room' || msg.entity_id !== roomRef.current)
      return;
    const data = msg.data;
    if(data?.hostId)setHostId(data.hostId);
    if (data?.kind === 'join' && data.member?.id !== peerId.current) {
      setMembers(prev => [
        ...prev.filter(m => m.id !== data.member.id),
        data.member,
      ]);
    }
    if (data?.kind === 'leave') {
      setMembers(prev => prev.filter(m => m.id !== data.id));
      closePeer(data.id);
    }
    if (data?.kind === 'chat') {
      setChat(prev =>
        [
          ...prev,
          {
            id: crypto.randomUUID(),
            from: data.from,
            name: data.name,
            text: data.text,
            ts: data.ts,
          },
        ].slice(-60)
      );
    }
    if(data?.kind==='screen'){
      const owner=data.active?data.from:null;
      shareRef.current=owner;setShareOwner(owner);
    }
    if (data?.kind === 'recording' && data.from !== peerId.current) {
      setRemoteRecording(Boolean(data.active));
    }
  };

  async function changeCamera(
    nextBg: string,
    nextFormat: string,
    nextQuality: string,
    nextPhoto: HTMLImageElement | null = photo
  ) {
    setBg(nextBg);
    setFormat(nextFormat);
    setQuality(nextQuality);
    configRef.current = {
      bg: nextBg,
      format: nextFormat,
      quality: nextQuality,
      photo: nextPhoto,
    };
    if (!isJoinedRef.current || !rawRef.current) return;
    setEffectBusy(true);
    try {
      let stream = rawRef.current;
      if (nextBg !== 'original' || nextFormat !== 'original') {
        if (effectRef.current) effectRef.current.update(configRef.current);
        else
          effectRef.current = await processCamera(
            rawRef.current,
            configRef.current,
            toast
          );
        stream = effectRef.current.stream;
      } else {
        effectRef.current?.stop();
        effectRef.current = null;
      }
      localRef.current = stream;
      setLocalStream(stream);
      const videoTrack = stream.getVideoTracks()[0] || null;
      for (const pc of pcs.current.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(videoTrack);
      }
    } catch (err) {
      toast('Décor indisponible : ' + readableError(err));
      effectRef.current?.stop();
      effectRef.current = null;
      localRef.current = rawRef.current;
      setLocalStream(rawRef.current);
    } finally {
      setEffectBusy(false);
    }
  }

  function choosePhoto(file: File | null) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      setPhoto(image);
      void changeCamera('custom', format, quality, image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast('Image invalide.');
    };
    image.src = url;
  }

  async function joinMeeting() {
    if (busy) return;
    const name = displayName.trim();
    if (!name) {
      toast('Indique ton prénom pour rejoindre la réunion.');
      return;
    }
    setBusy(true);
    setNotice('');
    localStorage.setItem('nexa_name', name);
    nameRef.current = name;
    let media: MediaStream | null = null;
    try {
      try {
        media = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: face,
            width: { ideal: quality === '2160' ? 3840 : quality === '720' ? 1280 : 1920 },
            height: { ideal: quality === '2160' ? 2160 : quality === '720' ? 720 : 1080 },
            frameRate: { ideal: 30, max: 30 },
          },
        });
        media.getAudioTracks().forEach(t => (t.enabled = micOn));
        media.getVideoTracks().forEach(t => (t.enabled = camOn));
      } catch {
        toast('Caméra ou micro indisponible. Connexion en mode écoute seule.');
      }
      rawRef.current = media;
      localRef.current = media;
      setLocalStream(media);
      const settings = media?.getVideoTracks()[0]?.getSettings();
      if (settings?.width && settings?.height) {
        setCameraInfo(settings.width + ' × ' + settings.height + ' (capture réelle)');
      } else {
        setCameraInfo('Résolution non fournie par le navigateur');
      }
      if (
        media &&
        (configRef.current.bg !== 'original' ||
          configRef.current.format !== 'original')
      ) {
        try {
          effectRef.current = await processCamera(
            media,
            configRef.current,
            toast
          );
          localRef.current = effectRef.current.stream;
          setLocalStream(effectRef.current.stream);
        } catch (err) {
          toast('Effet indisponible : ' + readableError(err));
        }
      }
      const connection = ws.connect();
      connRef.current = connection;
      connection.onMessage(msg => handleRef.current(msg));
      await connection.ready;
      if (!connection.connectionId)
        throw new Error('Connexion temps réel indisponible.');
      const id = roomRef.current;
      // Initial load, subscription, then join: prevents missed events.
      const state = await api.get('/api/rooms/' + id);
      setMembers(state.data.members || []);setHostId(state.data.hostId||peerId.current);
      await api.post('/api/subscriptions', {
        entity_type: 'room',
        entity_id: id,
        connection_id: connection.connectionId,
      });
      const joinedRoom = await api.post('/api/rooms/' + id + '/join', {
        peer_id: peerId.current,
        connection_id: connection.connectionId,
        name,
      });
      setMembers(joinedRoom.data.members || []);setHostId(joinedRoom.data.hostId||peerId.current);
      isJoinedRef.current = true;focusRef.current=peerId.current;setActiveSpeaker(peerId.current);
      setJoined(true);
      for (const member of joinedRoom.data.members || [])
        await initiate(member.id);
    } catch (e) {
      toast('Impossible de rejoindre : ' + readableError(e));
      connRef.current?.disconnect();
      connRef.current = null;
      media?.getTracks().forEach(t => t.stop());
      effectRef.current?.stop();
      effectRef.current = null;
      rawRef.current = null;
      localRef.current = null;
      setLocalStream(null);
    } finally {
      setBusy(false);
    }
  }

  async function leaveMeeting() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    try {
      if (isJoinedRef.current) {
        await api.post('/api/rooms/' + roomRef.current + '/leave', {
          peer_id: peerId.current,
        });
      }
      if (connRef.current?.connectionId) {
        await api.post('/api/subscriptions/remove', {
          entity_type: 'room',
          entity_id: roomRef.current,
          connection_id: connRef.current.connectionId,
        });
      }
    } catch (e) {
      console.warn(e);
    }
    connRef.current?.disconnect();
    connRef.current = null;
    pcs.current.forEach(pc => pc.close());
    pcs.current.clear();
    pendingIce.current.clear();
    effectRef.current?.stop();
    effectRef.current = null;
    rawRef.current?.getTracks().forEach(t => t.stop());
    rawRef.current = null;
    localRef.current?.getTracks().forEach(t => t.stop());
    localRef.current = null;
    screenRef.current?.getTracks().forEach(t => t.stop());
    screenRef.current = null;
    streamsRef.current = {};
    setLocalStream(null);
    setScreenStream(null);
    setStreams({});
    setMembers([]);setHostId(null);setShareOwner(null);shareRef.current=null;
    setPinned(null);pinRef.current=null;
    setJoined(false);
    isJoinedRef.current = false;
    setSharing(false);
    setRemoteRecording(false);
    location.hash = '';
    roomRef.current = '';
    setRoom('');
    peerId.current = crypto.randomUUID();
  }

  function toggleMic() {
    (rawRef.current || localRef.current)
      ?.getAudioTracks()
      .forEach(t => (t.enabled = !micOn));
    setMicOn(!micOn);
  }
  function toggleCam() {
    (rawRef.current || localRef.current)
      ?.getVideoTracks()
      .forEach(t => (t.enabled = !camOn));
    setCamOn(!camOn);
  }
  async function toggleScreen() {
    if (screenRef.current) {
      const videoTrack = localRef.current?.getVideoTracks()[0];
      for (const pc of pcs.current.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(videoTrack || null);
      }
      screenRef.current.getTracks().forEach(t => t.stop());
      screenRef.current = null;
      setScreenStream(null);
      setSharing(false);
      shareRef.current=null;setShareOwner(null);
      void emit('screen',{active:false}).catch(()=>{});
      return;
    }
    try {
      if (!navigator.mediaDevices.getDisplayMedia)
        throw new Error('Ce navigateur ne propose pas de partage d’écran : sur iPhone, utilise Safari avec iOS 27 ou une version compatible ; sinon partage depuis un PC.');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      screenRef.current = stream;
      setScreenStream(stream);
      setSharing(true);shareRef.current=peerId.current;setShareOwner(peerId.current);
      void emit('screen',{active:true}).catch(() => {});
      for (const pc of pcs.current.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
        else if (localRef.current) {
          pc.addTrack(track, localRef.current);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          // Renegotiation may be limited with some peers.
          await sendSignal(
            [...pcs.current.entries()].find(([, value]) => value === pc)?.[0] ||
              '',
            { type: 'offer', sdp: offer.sdp }
          );
        }
      }
      track.onended = () => {
        if (screenRef.current) void toggleScreen();
      };
    } catch (e) {
      toast(readableError(e));
    }
  }

  async function sendChat() {
    const text = draft.trim().slice(0, 2000);
    if (!text) return;
    setDraft('');
    const item: ChatItem = {
      id: crypto.randomUUID(),
      from: peerId.current,
      name: nameRef.current,
      text,
      ts: Date.now(),
    };
    setChat(prev => [...prev, item].slice(-60));
    try {
      await emit('chat', { text, ts: item.ts });
    } catch {
      toast('Message non envoyé aux participants.');
    }
  }

  function recordCanvasAndAudio(mode: 'video' | 'audio') {
    const ctx = new AudioContext();
    void ctx.resume().catch(() => {});
    const dest = ctx.createMediaStreamDestination();
    const nodes: MediaStreamAudioSourceNode[] = [];
    const allStreams = () => {
      const candidates = [
        { key: 'local', stream: localRef.current },
        ...Object.entries(streamsRef.current).map(([key, stream]) => ({
          key,
          stream,
        })),
      ];
      return candidates.filter(x => x.stream) as Array<{
        key: string;
        stream: MediaStream;
      }>;
    };
    const linked = new Set<string>();
    const linkAudio = () => {
      for (const s of allStreams()) {
        if (linked.has(s.key) || !s.stream.getAudioTracks().length) continue;
        try {
          const node = ctx.createMediaStreamSource(s.stream);
          node.connect(dest);
          nodes.push(node);
          linked.add(s.key);
        } catch {
          /* no audio track */
        }
      }
    };
    const oscillator = ctx.createOscillator();
    const silence = ctx.createGain();
    silence.gain.value = 0;
    oscillator.connect(silence);
    silence.connect(dest);
    oscillator.start();
    linkAudio();
    const canvas = document.createElement('canvas');
    const dimensions = videoDimensions(
      format === 'original' ? '16:9' : format,
      quality === '2160' ? '1080' : quality
    );
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const canvasCtx = canvas.getContext('2d')!;
    const videos = new Map<string, HTMLVideoElement>();
    const draw = () => {
      linkAudio();
      if(mode==='audio')return;
      const items=allStreams();
      const key=shareRef.current||pinRef.current||focusRef.current;
      const item=items.find(v=>v.key===key)||items.find(v=>v.key==='local')||items[0];
      canvasCtx.fillStyle='#090d19';canvasCtx.fillRect(0,0,canvas.width,canvas.height);
      if(!item)return;
      const source=item.key==='local'&&screenRef.current?screenRef.current:item.stream;
      let v=videos.get(item.key);
      if(!v||v.srcObject!==source){
        if(v){v.pause();v.srcObject=null;}
        v=document.createElement('video');
        v.srcObject=source;v.muted=true;v.playsInline=true;void v.play().catch(()=>{});
        videos.set(item.key,v);
      }
      if(v.readyState>=2&&v.videoWidth){
        // Frame fills visually with a dim blurred background, but the full
        // camera/screen remains visible in the center: no face cropping.
        const sourceRatio=v.videoWidth/v.videoHeight;
        if(Math.abs(sourceRatio-canvas.width/canvas.height)>0.02){
          const cover=Math.max(canvas.width/v.videoWidth,canvas.height/v.videoHeight);
          const bw=v.videoWidth*cover,bh=v.videoHeight*cover;
          canvasCtx.save();
          canvasCtx.filter='blur(20px) brightness(0.4)';
          canvasCtx.drawImage(v,(canvas.width-bw)/2,(canvas.height-bh)/2,bw,bh);
          canvasCtx.restore();
        }
        const scale=Math.min(canvas.width/v.videoWidth,canvas.height/v.videoHeight);
        const width=v.videoWidth*scale,height=v.videoHeight*scale;
        canvasCtx.drawImage(v,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
      }
    };
    draw();
    const nativeIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    // Keep the composited frame stream alive on iPhone too. Previously iOS
    // forcibly recorded the raw track, losing effects and correct orientation.
    const interval = window.setInterval(draw, nativeIOS ? 100 : 80);
    let videoStream: MediaStream | null = null;
    let fallback = false;
    if(mode==='video'){
      try { if(typeof canvas.captureStream==='function') videoStream=canvas.captureStream(nativeIOS ? 20 : 24); }
      catch { /* provide source-track recording fallback */ }
      if(!videoStream?.getVideoTracks().length){
        const items=allStreams();
        const focus=shareRef.current||pinRef.current||focusRef.current;
        const chosen=items.find(x=>x.key===focus)||items.find(x=>x.key==='local')||items[0];
        const source=(chosen?.key==='local' ? screenRef.current?.getVideoTracks()[0] : null) || chosen?.stream.getVideoTracks()[0] || rawRef.current?.getVideoTracks()[0];
        if(!source)throw new Error('La caméra ne fournit pas de piste vidéo enregistrable.');
        videoStream=new MediaStream([source]);
        fallback=true;
      }
    }
    const combined=new MediaStream([
      ...(videoStream?.getVideoTracks()||[]),
      ...dest.stream.getAudioTracks(),
    ]);
    const cleanup = () => {
      window.clearInterval(interval);
      if(!fallback)videoStream?.getTracks().forEach(t => t.stop());
      nodes.forEach(n => n.disconnect());
      oscillator.stop();
      void ctx.close();
      videos.forEach(v => {
        v.pause();
        v.srcObject = null;
      });
    };
    return { stream: combined, cleanup, fallback };
  }

  async function startRecording(mode: 'video' | 'audio') {
    if (!joined || recording) return;
    if (typeof MediaRecorder === 'undefined') {
      toast('Enregistrement non pris en charge sur ce navigateur.');
      return;
    }
    try {
      const { stream, cleanup, fallback } = recordCanvasAndAudio(mode);
      if(fallback)toast('Capture directe de secours : les effets de fond et le changement automatique d’intervenant peuvent être absents.');
      const types =
        mode === 'video'
          ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
          : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
      const rate=quality==='720'?2600000:5500000;
      let recorder:MediaRecorder|null=null;
      let recorderError:unknown=null;
      for(const candidate of [...types.filter(t=>MediaRecorder.isTypeSupported(t)),'']){
        try{
          recorder=new MediaRecorder(stream,mode==='video'
            ?{...(candidate?{mimeType:candidate}:{}),videoBitsPerSecond:rate,audioBitsPerSecond:128000}
            :{...(candidate?{mimeType:candidate}:{}),audioBitsPerSecond:128000});
          break;
        }catch(e){recorderError=e;}
      }
      if(!recorder)throw new Error('Format vidéo non pris en charge : '+readableError(recorderError));
      recorder.onerror=()=>toast('Erreur de capture vidéo : essaie Safari sur iPhone et le format 720p.');
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = e => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        cleanup();
        stopCaptureRef.current = null;
        const recordedType =
          recorder.mimeType || (mode === 'video' ? 'video/webm' : 'audio/webm');
        const type = recordedType.toLowerCase().includes('mp4')
          ? (mode === 'video' ? 'video/mp4' : 'audio/mp4')
          : (mode === 'video' ? 'video/webm' : 'audio/webm');
        const blob = new Blob(chunks, { type });
        if(!blob.size){
          setRecording(false);
          setRecordReady(null);
          recorderRef.current=null;
          toast('Enregistrement vide : aucun fichier vidéo exploitable. Essaie 720p ou un autre navigateur.');
          return;
        }
        const ext = type.includes('mp4')
          ? mode === 'video'
            ? 'mp4'
            : 'm4a'
          : 'webm';
        const filename =
          'FondVideo-New-Meet-' +
          roomRef.current +
          '-' +
          new Date().toISOString().replace(/[:.]/g, '-') +
          '.' +
          ext;
        const item = { blob, name: filename, url: URL.createObjectURL(blob) };
        if (readyRef.current) URL.revokeObjectURL(readyRef.current.url);
        readyRef.current = item;
        setRecordReady(item);
        setRecording(false);
        void keepRecording(blob,filename);
        void emit('recording', { active: false }).catch(() => {});
        // Audio and video are uploaded immediately after stopping, whenever
        // Drive is connected. No second click is needed.
        if (tokenRef.current) {
          void uploadToDrive(item);
        } else {
          setDriveStatus('idle');
          toast(isPhone && mode === 'video'
            ? (type === 'video/mp4'
              ? 'Vidéo MP4 prête ! Clique sur « Enregistrer dans Photos » puis choisis « Enregistrer la vidéo » dans le partage iPhone.'
              : 'Vidéo prête, mais le format proposé par ce navigateur peut ne pas être accepté par Photos.')
            : 'Enregistrement disponible dans Mes enregistrements : télécharge-le ou partage-le.');
        }
      };
      recorderRef.current = recorder;
      stopCaptureRef.current = cleanup;
      setRecordReady(null);
      readyRef.current = null;
      setUploadedLink('');
      setSeconds(0);
      setRecordMode(mode);
      recorder.start();
      setRecording(true);
      void emit('recording', { active: true }).catch(() => {});
    } catch (e) {
      stopCaptureRef.current?.();
      setRecording(false);
      toast('Enregistrement impossible : ' + readableError(e));
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  function connectDrive() {
    if (!clientId.trim().match(/\.apps\.googleusercontent\.com$/)) {
      setDriveAdvanced(true);
      toast('Google Drive n’est pas encore configuré pour cette application. Une configuration initiale est nécessaire.');
      return;
    }
    const google=(window as any).google;
    if(!google?.accounts?.oauth2) {
      toast('Connexion Google momentanément indisponible. Recharge la page puis réessaie.');
      return;
    }
    try {
      const oauthClient=google.accounts.oauth2.initTokenClient({
        client_id:clientId.trim(),
        scope:'https://www.googleapis.com/auth/drive.file',
        callback:async (response:any)=>{
          if(response.error || !response.access_token){
            toast('Connexion Google annulée ou refusée : '+(response.error||'autorisation manquante'));
            return;
          }
          tokenRef.current=response.access_token;
          setDriveConnected(true);
          setDriveStatus('idle');
          setDriveEmail('');
          try {
            const about=await driveFetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)');
            setDriveEmail(about.user?.emailAddress||'');
          } catch {
            // An unreadable account profile does not block the Drive upload.
          }
          toast('Google Drive connecté. Les enregistrements audio et vidéo seront envoyés automatiquement après leur arrêt.');
          if(readyRef.current)void uploadToDrive(readyRef.current);
        }
      });
      oauthClient.requestAccessToken({prompt:'consent'});
    } catch(e) {
      toast('Connexion impossible : '+readableError(e));
    }
  }

  function disconnectDrive() {
    tokenRef.current='';
    setDriveConnected(false);
    setDriveEmail('');
    setDriveStatus('idle');
    localStorage.removeItem('nexa_drive_folder');
    toast('Google Drive déconnecté de cette session.');
  }

  async function driveFetch(url: string, init: RequestInit = {}) {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + tokenRef.current,
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        'Drive (' + response.status + ') : ' + detail.slice(0, 180)
      );
    }
    return response.json();
  }

  async function uploadToDrive(rec: Recording) {
    if (!tokenRef.current) {
      setShowSettings(true);
      toast('Connecte ton compte Google Drive avant de sauvegarder.');
      return;
    }
    setUploading(true);
    setDriveStatus('uploading');
    setNotice('');
    try {
      let folderId = localStorage.getItem('nexa_drive_folder') || '';
      if (!folderId) {
        const folder = await driveFetch(
          'https://www.googleapis.com/drive/v3/files?fields=id,name',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'FondVidéo Meet - Enregistrements',
              mimeType: 'application/vnd.google-apps.folder',
            }),
          }
        );
        folderId = folder.id;
        localStorage.setItem('nexa_drive_folder', folderId);
      }
      const meta={name:rec.name,mimeType:rec.blob.type,parents:[folderId]};
      const session=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink',{
        method:'POST',
        headers:{Authorization:'Bearer '+tokenRef.current,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':rec.blob.type||'application/octet-stream','X-Upload-Content-Length':String(rec.blob.size)},
        body:JSON.stringify(meta)
      });
      if(!session.ok)throw Error('Initialisation Drive impossible ('+session.status+').');
      const destination=session.headers.get('Location');
      if(!destination)throw Error('Navigateur non autorisé à démarrer le transfert Drive.');
      let file:any=null;
      const bytes=8*1024*1024;
      for(let pos=0;pos<rec.blob.size;pos+=bytes){
        const end=Math.min(rec.blob.size,pos+bytes);
        const result=await fetch(destination,{method:'PUT',headers:{Authorization:'Bearer '+tokenRef.current,'Content-Range':'bytes '+pos+'-'+(end-1)+'/'+rec.blob.size},body:rec.blob.slice(pos,end)});
        if(result.status===308)continue;
        if(!result.ok)throw Error('Transfert Drive impossible ('+result.status+').');
        file=await result.json();
      }
      if(!file?.id)throw Error('Google Drive n’a pas confirmé le fichier.');
      setUploadedLink(
        file.webViewLink ||
          'https://drive.google.com/file/d/' + file.id + '/view'
      );
      setDriveStatus('saved');
      toast((rec.blob.type.startsWith('audio/') ? 'Audio' : 'Vidéo') + ' sauvegardé automatiquement dans ton Google Drive.');
    } catch (e) {
      setDriveStatus('failed');
      toast('Envoi Drive échoué : ' + readableError(e) + ' — le fichier reste téléchargeable, réessaie depuis la réunion.');
    } finally {
      setUploading(false);
    }
  }

  const inviteUrl = location.origin + location.pathname + '#/room/' + room;
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast('Lien d’invitation copié !');
    } catch {
      toast('Lien à partager : ' + inviteUrl);
    }
  };
  const count=members.length+1;
  const isHost=hostId===peerId.current;
  const focused=shareOwner||pinned||activeSpeaker;
  const stageId=focused===peerId.current||streams[focused]?focused:peerId.current;
  const stageStream=stageId===peerId.current?(screenStream||localStream):(streams[stageId]||null);
  const stageName=stageId===peerId.current?displayName+' (vous)':(members.find(m=>m.id===stageId)?.name||'Participant');
  const sharedStage=Boolean(shareOwner && stageId===shareOwner);
  const formattedTime =
    String(Math.floor(seconds / 60)).padStart(2, '0') +
    ':' +
    String(seconds % 60).padStart(2, '0');

  return (
    <div className="app-shell">
      <header className="header">
        <div
          className="brand"
          onClick={() => {
            if (!joined) {
              location.hash = '';
              setRoom('');
            }
          }}
        >
          <div className="brand-mark">
            <Video size={23} strokeWidth={2.7} />
          </div>
          <strong>
            Fond<span>Vidéo New Meet</span>
          </strong>
        </div>
        <span className="header-caption">Vos réunions, sans compromis</span>
        <div className="header-right">
          <a className="studio-nav" href="./fondvideo.html">Studio vidéo</a>
          <button className="library-nav" onClick={()=>setLibraryOpen(true)}><Library size={18}/> <span>Mes enregistrements</span></button>
          <span className="private-pill">
            <ShieldCheck size={15} /> Lien privé
          </span>
          <button
            className={'drive-header-action ' + (driveConnected ? 'connected' : '')}
            title="Connexion Google Drive"
            onClick={() => setShowSettings(true)}
          >
            <CloudUpload size={17} />
            <span>{driveConnected ? 'Drive connecté' : 'Drive : en attente'}</span>
          </button>
        </div>
      </header>

      {notice && (
        <div className="toast" role="status">
          <AlertCircle size={17} />
          <span>{notice}</span>
          <button onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}

      {!room && !joined && (
        <main className="landing">
          <div className="hero-glow" />
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> LA VISIO, SIMPLEMENT
            </div>
            <h1>
              Vos meilleures idées
              <br />
              <em>méritent de se rencontrer.</em>
            </h1>
            <p>
              Ton studio FondVidéo et ta visioconférence réunis. Fonds en
              direct, formats sociaux, enregistrements et partage d’écran.
            </p>
            <div className="launch-actions">
              <button
                className="btn primary large"
                onClick={() => openRoom(newCode())}
              >
                <Plus size={20} /> Nouvelle réunion
              </button>
              <a className="btn subtle large" href="./fondvideo.html"><Camera size={18}/> Ouvrir FondVidéo</a>
              <button className="btn subtle large" onClick={()=>setLibraryOpen(true)}><Library size={18}/> Mes enregistrements</button>
              <div className="join-form">
                <Link2 size={18} />
                <input
                  value={newRoom}
                  onChange={e => setNewRoom(e.target.value.toLowerCase())}
                  placeholder="Code de la réunion"
                  aria-label="Code de la réunion"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (/^[a-z2-9]{12}$/.test(newRoom.trim()))
                        openRoom(newRoom.trim());
                      else
                        toast(
                          'Saisis un code de réunion valide (12 caractères).'
                        );
                    }
                  }}
                />
                <button
                  title="Rejoindre"
                  onClick={() =>
                    /^[a-z2-9]{12}$/.test(newRoom.trim())
                      ? openRoom(newRoom.trim())
                      : toast(
                          'Saisis un code de réunion valide (12 caractères).'
                        )
                  }
                >
                  <ArrowRight size={19} />
                </button>
              </div>
            </div>
            <div className="hero-badges">
              <span>
                <Check size={16} /> Audio & vidéo
              </span>
              <span>
                <Check size={16} /> Partage d’écran
              </span>
              <span>
                <Check size={16} /> Enregistrement & Drive
              </span>
            </div>
          </div>
          <div className="preview-art">
            <div className="art-top">
              <div className="art-dots">
                <i />
                <i />
                <i />
              </div>
              <span>Réunion en cours</span>
              <span className="art-lock">
                <ShieldCheck size={14} />
              </span>
            </div>
            <div className="art-grid">
              <div className="art-person person-1">
                <div className="avatar-shape a1" />
                <span>Vous</span>
              </div>
              <div className="art-person person-2">
                <div className="avatar-shape a2" />
                <span>Invité</span>
              </div>
              <div className="art-person person-3">
                <div className="avatar-shape a3" />
                <span>Collègue</span>
              </div>
              <div className="art-person person-4">
                <div className="avatar-shape a4" />
                <span>Partenaire</span>
              </div>
            </div>
            <div className="art-controls">
              <span>
                <Mic size={16} />
              </span>
              <span>
                <Video size={16} />
              </span>
              <span>
                <MonitorUp size={16} />
              </span>
              <span className="art-end">
                <PhoneOff size={16} />
              </span>
            </div>
            <div className="art-float">
              <span className="small-purple">
                <Circle size={13} fill="currentColor" />
              </span>
              <div>
                <strong>Enregistrement prêt</strong>
                <small>Sauvegarde Google Drive</small>
              </div>
              <Check size={16} />
            </div>
          </div>
        </main>
      )}

      {room && !joined && (
        <main className="prejoin">
          <button
            className="text-back"
            onClick={() => {
              location.hash = '';
              setRoom('');
            }}
          >
            <ArrowLeft size={18} /> Retour
          </button>
          <div className="prejoin-grid">
            <div className="prejoin-visual">
              <div className="prejoin-avatar">
                <Camera size={53} />
              </div>
              <div className="camera-note">
                La caméra et le micro seront demandés à l’entrée.
              </div>
              <div className="preview-bottom">
                <ShieldCheck size={16} /> Salon accessible par invitation
              </div>
            </div>
            <div className="prejoin-card">
              <div className="eyebrow">PRÊT À REJOINDRE ?</div>
              <h2>Rejoindre la réunion</h2>
              <p>Choisis ton nom d’affichage avant d’entrer dans le salon.</p>
              <label className="field-label" htmlFor="name">
                Ton prénom
              </label>
              <input
                id="name"
                className="text-input"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Ex. Nathan"
                maxLength={40}
                onKeyDown={e => {
                  if (e.key === 'Enter') void joinMeeting();
                }}
              />
              <div className="control-toggles">
                <button
                  className={micOn ? 'toggle-on' : 'toggle-off'}
                  onClick={() => setMicOn(!micOn)}
                >
                  {micOn ? <Mic size={19} /> : <MicOff size={19} />} Micro{' '}
                  {micOn ? 'activé' : 'coupé'}
                </button>
                <button
                  className={camOn ? 'toggle-on' : 'toggle-off'}
                  onClick={() => setCamOn(!camOn)}
                >
                  {camOn ? <Video size={19} /> : <VideoOff size={19} />} Caméra{' '}
                  {camOn ? 'activée' : 'coupée'}
                </button>
              </div>
              <div className="camera-options">
                <label>Caméra</label>
                <select value={face} onChange={e => setFace(e.target.value)}>
                  <option value="user">Avant</option>
                  <option value="environment">Arrière</option>
                </select>
                <label>Qualité de capture demandée</label>
                <select
                  value={quality}
                  onChange={e => {
                    setQuality(e.target.value);
                    configRef.current.quality = e.target.value;
                  }}
                >
                  <option value="2160">4K si disponible (plus gourmand)</option>
                  <option value="1080">1080p (si disponible)</option>
                  <option value="720">720p</option>
                </select>
                <p>iPhone : le navigateur détermine la résolution réelle.</p>
              </div>
              <button
                className="btn primary wide"
                disabled={busy}
                onClick={joinMeeting}
              >
                {busy ? 'Connexion…' : 'Rejoindre maintenant'}{' '}
                <ArrowRight size={18} />
              </button>
              <div className="room-code">
                <span>
                  Code : <strong>{room}</strong>
                </span>
                <button onClick={copyInvite}>
                  <Copy size={16} /> Copier le lien
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {room && joined && (
        <main className="meeting">
          <div className="meeting-header">
            <div>
              <div className="eyebrow">RÉUNION EN DIRECT</div>
              <h2>
                FondVidéo Meet <span className="meeting-id">#{room}</span>
              </h2>
            </div>
            <div className="meeting-meta">
              {remoteRecording && (
                <span className="rec-banner">
                  <Circle size={12} fill="currentColor" /> Un participant
                  enregistre
                </span>
              )}
              {recording && (
                <span className="rec-banner">
                  <Circle size={12} fill="currentColor" /> REC {formattedTime}
                </span>
              )}
              <span className="meeting-members">
                <Users size={17} /> {count} participant{count > 1 ? 's' : ''}
              </span>
              <button className="btn subtle" onClick={copyInvite}>
                <Copy size={16} /> <span className="desktop-only">Inviter</span>
              </button>
            </div>
          </div>
          <div className="live-tools">
            <strong>
              <Camera size={17} /> Studio caméra
            </strong>
            <label>
              Fond
              <select
                value={bg}
                disabled={effectBusy}
                onChange={e =>
                  void changeCamera(e.target.value, format, quality)
                }
              >
                {backgrounds
                  .filter(([v]) => v !== 'custom')
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                {photo && <option value="custom">Mon image</option>}
              </select>
            </label>
            <label className="upload">
              + Image
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={e => choosePhoto(e.target.files?.[0] || null)}
              />
            </label>
            <label>
              Format
              <select
                value={format}
                disabled={effectBusy}
                onChange={e => void changeCamera(bg, e.target.value, quality)}
              >
                {formats.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <small>
              {effectBusy ? 'Décor en cours…' : cameraInfo || 'Qualité adaptative'}
              {' · Cadrage entier, sans recadrage numérique'}
              {quality === '2160' && ' · Décors IA limités à 1080p'}
            </small>
            {format === '16:9' && isPhone && portraitView && (
              <div className="landscape-notice" role="status">
                <MonitorUp size={19} />
                <span><strong>Format YouTube paysage :</strong> tourne ton téléphone à l’horizontale. Désactive le verrouillage de rotation dans le centre de contrôle si nécessaire.</span>
              </div>
            )}
          </div>
          <div className="meeting-main">
            <section className="meeting-videos">
              <div className="program-heading"><strong>INTERVENANT : {stageName}</strong><span>{sharedStage?'Écran partagé':'Caméra'} · seule cette image est enregistrée</span><button onClick={()=>setFullStage(value=>!value)}>{fullStage?<Minimize2 size={16}/>:<Maximize2 size={16}/>} {fullStage?'Réduire':'Plein écran'}</button><button onClick={()=>setFillStage(v=>!v)} title="Agrandir peut rogner les bords">{fillStage?'Tout voir':'Remplir l’écran'}</button></div>
              {gallery ? <div className={'video-grid tiles-'+Math.min(count,6)}>
                <div className="video-tile own"><StreamVideo stream={screenStream||localStream} muted/><span className="tile-name">{displayName} (vous)</span></div>
                {members.map(m=><div className="video-tile" key={m.id}><StreamVideo stream={streams[m.id]||null} muted/><span className="tile-name">{m.name}</span></div>)}
              </div> : <div className={'program-stage '+(fullStage?'stage-fullscreen':'')}>
                <div className="program-screen"><StreamVideo stream={stageStream} muted fit={fillStage?'cover':'contain'}/><span className="tile-name">{stageName}{sharedStage?' • Écran partagé':''}</span>{fullStage&&<button className="stage-exit" onClick={()=>setFullStage(false)}><Minimize2 size={16}/> Quitter le plein écran</button>}</div>
                <div className="program-thumbnails">
                  <button className={'program-thumb '+(pinned===peerId.current?'pinned':'')} onClick={()=>pinParticipant(peerId.current)}><StreamVideo stream={screenStream||localStream} muted/><span>Vous</span></button>
                  {members.map(m=><button className={'program-thumb '+(pinned===m.id?'pinned':'')} key={m.id} onClick={()=>pinParticipant(m.id)}><StreamVideo stream={streams[m.id]||null} muted/><span>{m.name}</span></button>)}
                </div>
              </div>}
              {members.map(m=><StreamAudio key={'audio-'+m.id} stream={streams[m.id]||null}/>)}
              <div className="program-actions">
                <button onClick={()=>setGallery(!gallery)}>{gallery?'Vue intervenant':'Vue mosaïque'}</button>
                {pinned&&<button onClick={()=>pinParticipant(pinned)}>Suivi automatique</button>}
                <button onClick={()=>setParticipantsOpen(!participantsOpen)}>Participants et modération</button>
              </div>
              {participantsOpen&&<div className="moderation-panel">
                <div className="moderation-head"><strong>Participants ({count})</strong>{isHost&&<button onClick={muteAllParticipants}>Couper tous les micros</button>}</div>
                <div className="moderation-row"><strong>{displayName} (vous){isHost?' — Hôte':''}</strong><span>{micOn?'Micro activé':'Micro coupé'}</span></div>
                {members.map(m=><div className="moderation-row" key={m.id}><strong>{m.name}{hostId===m.id?' — Hôte':''}</strong><div>
                  <button onClick={()=>pinParticipant(m.id)}>Épingler</button>
                  {isHost&&<><button onClick={()=>muteParticipant(m.id)}>Couper micro</button><button onClick={()=>removeParticipant(m.id)}>Retirer</button></>}
                </div></div>)}
              </div>}
              <div className="meeting-toolbar">
                <button
                  className={micOn ? 'tool-btn' : 'tool-btn disabled-tool'}
                  onClick={toggleMic}
                  title={micOn ? 'Couper le micro' : 'Activer le micro'}
                >
                  {micOn ? <Mic /> : <MicOff />}
                </button>
                <button
                  className={camOn ? 'tool-btn' : 'tool-btn disabled-tool'}
                  onClick={toggleCam}
                  title={camOn ? 'Couper la caméra' : 'Activer la caméra'}
                >
                  {camOn ? <Video /> : <VideoOff />}
                </button>
                <span className="tool-separator" />
                <button
                  className={sharing ? 'tool-btn active-tool' : 'tool-btn'}
                  onClick={toggleScreen}
                  title="Partager l’écran"
                >
                  {sharing ? <MonitorOff /> : <MonitorUp />}
                </button>
                <button
                  className={chatOpen ? 'tool-btn active-tool' : 'tool-btn'}
                  onClick={() => setChatOpen(!chatOpen)}
                  title="Messages"
                >
                  <MessageSquare />
                </button>
                <button
                  className={recording ? 'tool-btn recording-tool' : 'tool-btn'}
                  onClick={
                    recording ? stopRecording : () => startRecording('video')
                  }
                  title={
                    recording ? 'Arrêter l’enregistrement' : 'Enregistrer vidéo'
                  }
                >
                  {recording ? <Square fill="currentColor" /> : <Circle />}
                </button>
                <button
                  className="tool-btn end-tool"
                  onClick={leaveMeeting}
                  title="Quitter la réunion"
                >
                  <PhoneOff />
                </button>
              </div>
              <div className="secondary-actions">
                {!recording && (
                  <button onClick={() => startRecording('audio')}>
                    <Headphones size={16} /> Enregistrer l’audio
                  </button>
                )}
                {recording && (
                  <span className="record-note">
                    Enregistrement {recordMode === 'audio' ? 'audio' : 'vidéo'}{' '}
                    en cours · Participants informés
                  </span>
                )}
                {uploading && (
                  <span className="drive-transfer"><CloudUpload size={16} /> Envoi automatique de l’enregistrement sur Drive…</span>
                )}
                {driveStatus === 'saved' && uploadedLink && (
                  <span className="drive-transfer success"><Check size={16} /> Enregistrement sauvegardé sur Drive</span>
                )}
                {recordReady && !recording && (
                  <div className="record-links">
                    <button onClick={()=>setLibraryOpen(true)} disabled={savingLocal}><Library size={15}/>{savingLocal?'Enregistrement local…':'Mes enregistrements'}</button>
                    <a href={recordReady.url} download={recordReady.name}>
                      <Download size={15} /> Télécharger dans Fichiers
                    </a>
                    <button onClick={()=>void shareRecording({
                      id:'current',name:recordReady.name,blob:recordReady.blob,
                      mime:recordReady.blob.type,size:recordReady.blob.size,createdAt:Date.now()
                    })}><Share2 size={15}/> {isPhone && recordMode === 'video' ? 'Enregistrer dans Photos (Partager)' : 'Photos / Drive / Partager'}</button>
                    {isPhone && recordMode === 'video' && <span className="photos-help">iPhone : touche ce bouton, puis « Enregistrer la vidéo » dans le partage iOS. Safari ne permet pas l’ajout silencieux à Photos.</span>}
                    {uploadedLink ? (
                      <a href={uploadedLink} target="_blank" rel="noreferrer">
                        <ExternalLink size={15} /> Ouvrir dans Drive
                      </a>
                    ) : (
                      <button
                        disabled={uploading}
                        onClick={() => driveConnected ? uploadToDrive(recordReady) : setShowSettings(true)}
                      >
                        <CloudUpload size={15} />{' '}
                        {uploading ? 'Envoi automatique…' : driveConnected ? (driveStatus === 'failed' ? 'Réessayer l’envoi Drive' : 'Envoyer sur Drive') : 'Connecter Drive'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
            {chatOpen && (
              <aside className="chat-panel">
                <div className="chat-heading">
                  <strong>Messages de la réunion</strong>
                  <button onClick={() => setChatOpen(false)}>
                    <X size={19} />
                  </button>
                </div>
                <div className="chat-scroll">
                  {chat.length ? (
                    chat.map(m => (
                      <div
                        key={m.id}
                        className={
                          'chat-message ' +
                          (m.from === peerId.current ? 'self-chat' : '')
                        }
                      >
                        <div>
                          <strong>
                            {m.from === peerId.current ? 'Vous' : m.name}
                          </strong>
                          <time>
                            {new Date(m.ts).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                        <p>{m.text}</p>
                      </div>
                    ))
                  ) : (
                    <div className="chat-empty">
                      <MessageSquare size={29} />
                      <strong>Commencez la discussion</strong>
                      <p>Les messages sont visibles pendant la réunion.</p>
                    </div>
                  )}
                </div>
                <div className="chat-entry">
                  <input
                    placeholder="Écrire un message…"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') void sendChat();
                    }}
                    maxLength={2000}
                  />
                  <button onClick={sendChat}>
                    <Send size={18} />
                  </button>
                </div>
              </aside>
            )}
          </div>
          <p className="meeting-footnote">
            <ShieldCheck size={13} /> Prévisualisation : 2 à 4 personnes
            conseillées. La qualité dépend du navigateur et du réseau ;
            enregistrement local tant que l’onglet reste ouvert.
          </p>
        </main>
      )}

      {libraryOpen && (
        <div className="modal-backdrop local-recordings-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setLibraryOpen(false);}}>
          <section className="local-recordings-panel" role="dialog" aria-modal="true" aria-label="Mes enregistrements">
            <div className="modal-header">
              <div><div className="eyebrow">BIBLIOTHÈQUE DE CET APPAREIL</div><h2><Library size={22}/> Mes enregistrements</h2></div>
              <button className="icon-btn" onClick={()=>setLibraryOpen(false)} aria-label="Fermer"><X size={21}/></button>
            </div>
            <p className="local-recordings-hint">Tes enregistrements restent dans ce navigateur, même après fermeture de l’onglet. Ils ne sont pas synchronisés entre appareils et peuvent disparaître si tu effaces les données du navigateur. Pour les conserver durablement, télécharge-les ou partage-les.</p>
            <label className="library-import-action">
              <CloudUpload size={17} /> {importingLocal?'Importation…':'Importer des vidéos ou des audios depuis cet appareil'}
              <input type="file" accept="video/*,audio/*,.mp4,.mov,.webm,.m4a" multiple hidden disabled={importingLocal}
                onChange={event=>{void importRecordings(event.target.files);event.target.value='';}} />
            </label>
            {savedItems.length===0
              ? <div className="recordings-empty"><Library size={34}/><strong>Aucun enregistrement enregistré</strong><span>Termine un enregistrement audio ou vidéo pendant une réunion pour le retrouver ici.</span></div>
              : <div className="recordings-list">
                {savedItems.map(item=><article key={item.id} className="recording-item">
                  <div className="recording-item-head">
                    <div className="recording-kind">{item.mime.startsWith('audio/')?<Headphones size={19}/>:<Video size={19}/>}</div>
                    <div className="recording-info"><strong title={item.name}>{item.name}</strong><small>{item.mime.startsWith('audio/')?'Audio':'Vidéo'} · {(item.size/1048576).toFixed(1)} Mo · {new Date(item.createdAt).toLocaleString('fr-FR')}</small></div>
                  </div>
                  {activePreview===item.id&&previewUrl && (item.mime.startsWith('audio/')
                    ? <audio src={previewUrl} controls className="recording-player"/>
                    : <video src={previewUrl} controls playsInline className="recording-player"/>)}
                  <div className="recording-item-actions">
                    <button onClick={()=>previewRecording(item)}><PlayCircle size={15}/> {activePreview===item.id?'Fermer':'Lire'}</button>
                    <button onClick={()=>downloadRecording(item)}><Download size={15}/> Télécharger</button>
                    <button onClick={()=>void shareRecording(item)}><Share2 size={15}/> {isPhone && item.mime.startsWith('video/') ? 'Enregistrer dans Photos (Partager)' : 'Photos / Drive / Partager'}</button>
                    <button className="danger" onClick={()=>void removeRecording(item)}><Trash2 size={15}/> Supprimer</button>
                  </div>
                </article>)}
              </div>}
            <div className="recordings-destinations">
              <strong>Vers Google Drive, Photos ou YouTube</strong>
              <p>Sur iPhone, « Enregistrer dans Photos (Partager) » ouvre la feuille native : choisis « Enregistrer la vidéo ». Une application web ne peut pas déposer automatiquement un fichier dans Photos sans interaction. Utilise Safari et privilégie les MP4. Sur PC, télécharge ou partage le fichier.</p>
              <div><a href="https://drive.google.com/drive/u/0/my-drive" target="_blank" rel="noreferrer">Ouvrir Drive <ExternalLink size={13}/></a><a href="https://studio.youtube.com/" target="_blank" rel="noreferrer">Ouvrir YouTube Studio <ExternalLink size={13}/></a></div>
            </div>
          </section>
        </div>
      )}
      <footer className="footer">
        <span>© FondVidéo New Meet · Prévisualisation Netlify</span>
        <span>Appels WebRTC · Vos enregistrements vous appartiennent</span>
      </footer>

      {showSettings && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <section
            className="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Paramètres Google Drive"
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">ENREGISTREMENTS</div>
                <h2>Connecter Google Drive</h2>
              </div>
              <button
                className="icon-btn"
                onClick={() => setShowSettings(false)}
              >
                <X size={21} />
              </button>
            </div>
            <div className="drive-connect-intro">
              <div className="drive-icon"><CloudUpload size={30}/></div>
              <div>
                <strong>Enregistrements automatiquement sauvegardés</strong>
                <p>Après connexion, chaque audio et chaque vidéo rejoint ton dossier <b>FondVidéo Meet - Enregistrements</b> sur Google Drive à la fin de l'enregistrement.</p>
              </div>
            </div>
            {driveConnected ? (
              <div className="drive-account">
                <div className="drive-account-icon"><Check size={22}/></div>
                <div><strong>Google Drive connecté</strong><small>{driveEmail || 'Autorisation active pour cette session'}</small></div>
                <button onClick={disconnectDrive}>Déconnecter</button>
              </div>
            ) : (
              <>
                <button className="btn primary wide google-connect-btn" onClick={connectDrive}>
                  <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.5l6.8-6.8C35.9 2.2 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.5 17.8 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.9 24.5c0-1.6-.2-3.1-.4-4.5H24v9h12.8c-.6 2.9-2.2 5.4-4.7 7.1l7.3 5.7c4.3-4 7.5-9.9 7.5-17.3z"/>
                    <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/>
                    <path fill="#34A853" d="M24 48c6.4 0 11.8-2.1 15.7-5.8l-7.3-5.7c-2 1.3-4.8 2-8.4 2-6.2 0-11.6-4-13.5-9.5l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
                  </svg>
                  Se connecter avec Google
                </button>
                <p className="drive-password-note"><ShieldCheck size={15}/> L’identification se fait chez Google, jamais dans FondVidéo. Aucun mot de passe n'est demandé par notre application.</p>
                {!clientId.trim().endsWith('.apps.googleusercontent.com') && (
                  <p className="drive-needs-setup">La connexion Google doit être configurée une seule fois pour cette prévisualisation. Le bouton sera fonctionnel dès que cette configuration aura été ajoutée.</p>
                )}
              </>
            )}
            <div className="drive-automation">
              <Check size={17}/>
              <span><strong>{driveConnected ? 'Envoi automatique activé' : 'Google Drive non connecté'}</strong><small>{driveConnected ? 'Envoi automatique en fin d’enregistrement.' : 'Sans OAuth, utilise Photos / Drive / Partager pour envoyer le fichier manuellement.'}</small></span>
            </div>
            <details className="drive-advanced" open={driveAdvanced} onToggle={e=>setDriveAdvanced((e.currentTarget as HTMLDetailsElement).open)}>
              <summary>Configuration avancée (administrateur uniquement)</summary>
              <p>La configuration Google OAuth n'est nécessaire qu'une fois par application. Les autres utilisateurs n'auront qu'à cliquer sur « Se connecter avec Google ».</p>
              <ol>
                <li>Dans Google Cloud, active l’API Google Drive et configure l’écran de consentement OAuth.</li>
                <li>Crée un client OAuth 2.0 « Application Web » avec cette origine JavaScript autorisée :</li>
              </ol>
              <code className="drive-origin">{location.origin}</code>
              <label className="field-label" htmlFor="client-id">Identifiant public OAuth Google</label>
              <input
                id="client-id"
                className="text-input"
                placeholder="...apps.googleusercontent.com"
                value={clientId}
                onChange={e => {
                  setClientId(e.target.value);
                  localStorage.setItem('nexa_google_client', e.target.value);
                }}
              />
              <p className="settings-hint">Une fois la configuration validée, la connexion se fait uniquement dans la fenêtre sécurisée de Google.</p>
              <a target="_blank" rel="noreferrer" href="https://console.cloud.google.com/apis/credentials">
                Configurer Google Cloud <ExternalLink size={14}/>
              </a>
            </details>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
