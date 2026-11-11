import { useEffect, useRef, useState } from 'react';
import { api, ws } from './netlify-transport';
import { MeetingMusicMixer } from './meeting-music';
import { ClearVoiceProcessor, type VoiceProfile } from './clearvoice';
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
  Music2,
  AudioLines,
  Volume2,
  Pause,
  Play,
  Repeat2,
  FileAudio,
} from 'lucide-react';

type Member = { id: string; name: string };
type RoomSettings = { locked: boolean; allowScreenShare: boolean; allowRecording: boolean };
const defaultRoomSettings: RoomSettings = { locked: false, allowScreenShare: true, allowRecording: true };
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
function musicClock(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
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
  mirror = false,
  fit = 'contain',
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
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
        style={{ objectFit: fit }}
        className={
          (mirror ? 'mirror ' : '') + (!hasVideo ? 'audio-only-video' : '')
        }
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
  const [roomSettings,setRoomSettings]=useState<RoomSettings>(defaultRoomSettings);
  const [hostBusy,setHostBusy]=useState(false);
  const [gallery,setGallery]=useState(false);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [bg, setBg] = useState('original');
  const [format, setFormat] = useState('original');
  const [quality, setQuality] = useState('1080');
  const [recordVideoQuality, setRecordVideoQuality] = useState<'1080'|'original'>('1080');
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
  // Public OAuth ID supplied by Netlify; previously saved IDs are a local fallback.
  const configuredGoogleClientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const [clientId, setClientId] = useState(
    configuredGoogleClientId || localStorage.getItem('nexa_google_client') || ''
  );
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState('');
  const [driveStatus, setDriveStatus] = useState<'idle' | 'uploading' | 'saved' | 'failed'>('idle');
  const [driveAdvanced, setDriveAdvanced] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micTestRecording, setMicTestRecording] = useState(false);
  const [micTestUrl, setMicTestUrl] = useState('');
  const [recordMode, setRecordMode] = useState<'video' | 'audio'>('video');
  const [recordIncludeMusic, setRecordIncludeMusic] = useState(false);
  const [recordedWithMusic, setRecordedWithMusic] = useState(false);
  const [downloadWithMusic, setDownloadWithMusic] = useState(false);
  const [alternateRecording, setAlternateRecording] = useState<Recording | null>(null);
  const [pendingRecordMode, setPendingRecordMode] = useState<'video' | 'audio' | null>(null);
  const [recordReady, setRecordReady] = useState<Recording | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [musicPanelOpen, setMusicPanelOpen] = useState(false);
  const [musicName, setMusicName] = useState('');
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(45);
  const [musicLoop, setMusicLoop] = useState(false);
  const [musicMonitor, setMusicMonitor] = useState(false);
  const [musicTime, setMusicTime] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicBusy, setMusicBusy] = useState(false);
  const [noiseReduction, setNoiseReduction] = useState(false);
  const [noiseStrength, setNoiseStrength] = useState(2);
  const [noiseAttenuation, setNoiseAttenuation] = useState(0);
  const [noiseActive, setNoiseActive] = useState(false);
  const [voiceEnhancement, setVoiceEnhancement] = useState(false);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>('balanced');
  const [clearVoiceOpen, setClearVoiceOpen] = useState(false);
  const [clearVoiceReady, setClearVoiceReady] = useState(false);
  const [clearVoiceGateReady, setClearVoiceGateReady] = useState(false);

  // Deep-link Vault from SCELYO Studio without changing meeting routing.
  useEffect(() => {
    const openVaultRoute = () => {
      if (location.hash === '#/vault') setLibraryOpen(true);
    };
    openVaultRoute();
    window.addEventListener('hashchange', openVaultRoute);
    return () => window.removeEventListener('hashchange', openVaultRoute);
  }, []);

  const [savedItems, setSavedItems] = useState<SavedRecording[]>([]);
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savingLocal, setSavingLocal] = useState(false);
  const [importingLocal, setImportingLocal] = useState(false);
  const [fullStage, setFullStage] = useState(false);
  const [fillStage, setFillStage] = useState(false);
  const [portraitView, setPortraitView] = useState(() => window.innerHeight >= window.innerWidth);
  const isPhone = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const nativeNoiseSupported = Boolean(navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression);
  const [uploadedLink, setUploadedLink] = useState('');
  const [remoteRecording, setRemoteRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const musicRef = useRef<MeetingMusicMixer | null>(null);
  const clearVoiceRef = useRef<ClearVoiceProcessor | null>(null);
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
  const micTestUrlRef = useRef('');
  const stopCaptureRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef('');
  const readyRef = useRef<Recording | null>(null);
  const alternateRef = useRef<Recording | null>(null);
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
        if(active && !configuredGoogleClientId && typeof configured === 'string' && configured.endsWith('.apps.googleusercontent.com')) {
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
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullStage(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  useEffect(() => {
    if (recordReady && !recording) {
      requestAnimationFrame(() => {
        document.getElementById('scelyo-record-download')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
    }
  }, [recordReady, recording]);

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
  async function updateHostSettings(changes: Partial<RoomSettings>) {
    if (hostId !== peerId.current || hostBusy) return;
    setHostBusy(true);
    try {
      const response = await api.post('/api/rooms/'+roomRef.current+'/settings', { from: peerId.current, ...changes });
      setRoomSettings(response.data.settings as RoomSettings);
      toast('Paramètres de la réunion actualisés.');
    } catch(err) {
      toast('Modification impossible : ' + readableError(err));
    } finally { setHostBusy(false); }
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
      toast('Capture enregistrée dans SCELYO Vault sur cet appareil.');
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

  async function saveVideoToPhotos(item:Pick<SavedRecording,'name'|'blob'>) {
    const file=new File([item.blob],item.name,{type:item.blob.type || 'video/mp4'});
    if(navigator.share && navigator.canShare?.({files:[file]})) {
      try { await navigator.share({files:[file],title:item.name}); }
      catch(error){if((error as Error)?.name!=='AbortError')toast('Partage impossible : '+readableError(error));}
    } else {
      downloadRecording(item);
      toast('Le partage vers Photos est indisponible. Ouvre la vidéo et utilise Partager > Enregistrer la vidéo.');
    }
  }

  function downloadRecording(item:Pick<SavedRecording,'name'|'blob'>) {
    const url=URL.createObjectURL(item.blob);
    const link=document.createElement('a');link.href=url;link.download=item.name;
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }

  async function shareRecording(item:SavedRecording) {
    const file=new File([item.blob],item.name,{type:item.mime||'application/octet-stream'});
    if(navigator.share && navigator.canShare?.({files:[file]})) {
      try { await navigator.share({files:[file],title:item.name}); }
      catch(err){if((err as Error)?.name!=='AbortError')toast('Partage impossible : '+readableError(err));}
    } else {
      downloadRecording(item);
      toast('Le partage natif de fichier n’est pas disponible ici. Utilise le fichier téléchargé pour Drive, Photos ou YouTube.');
    }
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
    setHostId(null);setRoomSettings(defaultRoomSettings);setShareOwner(null);shareRef.current=null;
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

  // One stable processed microphone track is shared by Live, music and the
  // recording mixer. Music is added AFTER ClearVoice, never noise-suppressed.
  function processedMicrophoneTrack() {
    // The neutral/default mode must never route the voice through WebAudio.
    // ClearVoice becomes opt-in; the native mic goes straight to WebRTC.
    const native = rawRef.current?.getAudioTracks()[0] || null;
    if (!voiceEnhancement && !noiseReduction) return native;
    return clearVoiceRef.current?.track || native;
  }
  async function ensureClearVoice(enhancement = voiceEnhancement, suppression = noiseReduction) {
    const track = rawRef.current?.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') return null;
    if (clearVoiceRef.current) {
      clearVoiceRef.current.setEnabled(enhancement);
      clearVoiceRef.current.setNoiseReduction(suppression);
      return clearVoiceRef.current;
    }
    let processor: ClearVoiceProcessor | null = null;
    try {
      processor = new ClearVoiceProcessor(track, enhancement, voiceProfile, suppression);
      processor.setNoiseStrength(noiseStrength);
      processor.subscribeNoiseStats(stats => {
        setNoiseAttenuation(stats.attenuationDb);
        setNoiseActive(stats.isReducing);
      });
      if (!await processor.resume()) throw new Error('Traitement non disponible');
      clearVoiceRef.current = processor;
      setClearVoiceReady(true);
      setClearVoiceGateReady(processor.noiseGateReady);
      return processor;
    } catch {
      if (processor) await processor.destroy().catch(()=>{});
      setClearVoiceReady(false);
      setClearVoiceGateReady(false);
      toast('ClearVoice indisponible : le microphone naturel reste utilisé.');
      return null;
    }
  }
  function outboundAudioTrack() {
    return musicRef.current?.track || processedMicrophoneTrack();
  }

  async function restoreOutboundAudio(track: MediaStreamTrack | null) {
    const senders = [...pcs.current.values()]
      .flatMap(pc => pc.getSenders())
      .filter(sender => sender.track?.kind === 'audio');
    await Promise.allSettled(senders.map(sender => sender.replaceTrack(track)));
  }

  async function loadMusic(file: File | null) {
    if (!file) return;
    if (hostId !== peerId.current) {
      toast('Seul l’organisateur peut diffuser une musique dans SCELYO Live.');
      return;
    }
    if (!/\.(mp3|wav|m4a|aac)$/i.test(file.name)) {
      toast('Choisis un fichier MP3, WAV ou M4A.');
      return;
    }
    if (file.size > 150 * 1024 * 1024) {
      toast('Le fichier dépasse 150 Mo. Sélectionne une piste plus légère.');
      return;
    }
    const microphone = processedMicrophoneTrack();
    if (!microphone || microphone.readyState !== 'live') {
      toast('Autorise le microphone avant de diffuser de la musique.');
      return;
    }
    setMusicBusy(true);
    let next: MeetingMusicMixer | null = null;
    const previous = musicRef.current;
    try {
      next = new MeetingMusicMixer(file, new MediaStream([microphone]), progress => {
        setMusicPlaying(progress.playing);
        setMusicTime(progress.currentTime);
        setMusicDuration(progress.duration);
      });
      next.setVolume(musicVolume);
      next.setLoop(musicLoop);
      next.setMonitor(musicMonitor);
      const senders = [...pcs.current.values()].flatMap(pc => pc.getSenders())
        .filter(sender => sender.track?.kind === 'audio');
      const switched = await Promise.allSettled(senders.map(sender => sender.replaceTrack(next!.track)));
      if (switched.some(result => result.status === 'rejected')) {
        await Promise.allSettled(senders.map(sender => sender.replaceTrack(previous?.track || microphone)));
        throw new Error('La diffusion de musique est indisponible sur cette connexion.');
      }
      musicRef.current = next;
      setMusicName(file.name);
      setMusicTime(0);
      setMusicDuration(0);
      setMusicPlaying(false);
      if (previous) await previous.destroy();
      toast('Musique prête : appuie sur Lecture pour la diffuser aux participants.');
    } catch (error) {
      if (next && musicRef.current !== next) await next.destroy();
      toast('Impossible de charger la musique : ' + readableError(error));
    } finally {
      setMusicBusy(false);
    }
  }

  async function clearMusic() {
    const previous = musicRef.current;
    if (!previous) return;
    setMusicBusy(true);
    try {
      const microphone = processedMicrophoneTrack();
      await restoreOutboundAudio(microphone);
      musicRef.current = null;
      await previous.destroy();
      setMusicPlaying(false);
      setMusicName('');
      setMusicTime(0);
      setMusicDuration(0);
      setMusicMonitor(false);
    } finally {
      setMusicBusy(false);
    }
  }

  async function toggleMusicPlayback() {
    const current = musicRef.current;
    if (!current) return;
    try {
      if (musicPlaying) current.pause();
      else await current.play();
    } catch (error) {
      toast('Lecture impossible : ' + readableError(error) + '. Réessaie en touchant Lecture.');
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
          track.kind === 'audio' ? (outboundAudioTrack() || track)
          : track.kind === 'video' && screenRef.current
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
    if(data?.kind==='settings'&&data.settings)setRoomSettings(data.settings as RoomSettings);
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
          audio: {
            echoCancellation: true,
            noiseSuppression: noiseReduction,
            autoGainControl: false,
          },
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
      const microphoneTrack = media?.getAudioTracks()[0];
      // In the natural default mode, do not launch worklets or resample the mic.
      if (microphoneTrack && (voiceEnhancement || noiseReduction))
        await ensureClearVoice(voiceEnhancement, noiseReduction);
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
      setRoomSettings(state.data.settings || defaultRoomSettings);
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
      setRoomSettings(joinedRoom.data.settings || defaultRoomSettings);
      isJoinedRef.current = true;focusRef.current=peerId.current;setActiveSpeaker(peerId.current);
      setJoined(true);
      for (const member of joinedRoom.data.members || [])
        await initiate(member.id);
    } catch (e) {
      toast('Impossible de rejoindre : ' + readableError(e));
      connRef.current?.disconnect();
      connRef.current = null;
      const clearVoice = clearVoiceRef.current;
      clearVoiceRef.current = null;
      if (clearVoice) await clearVoice.destroy();
      setClearVoiceReady(false);
      setClearVoiceGateReady(false);
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
    const currentMusic = musicRef.current;
    musicRef.current = null;
    if (currentMusic) await currentMusic.destroy();
    const clearVoice = clearVoiceRef.current;
    clearVoiceRef.current = null;
    if (clearVoice) await clearVoice.destroy();
    setClearVoiceReady(false);
    setClearVoiceGateReady(false);
    setNoiseAttenuation(0);
    setNoiseActive(false);
    setClearVoiceOpen(false);
    setMusicName('');
    setMusicPlaying(false);
    setMusicTime(0);
    setMusicDuration(0);
    setMusicMonitor(false);
    setMusicPanelOpen(false);
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
    setFullStage(false);
    setRoomSettings(defaultRoomSettings);
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
  async function changeNoiseReduction(enabled: boolean) {
    const track = rawRef.current?.getAudioTracks()[0];
    if (enabled && track && !await ensureClearVoice(voiceEnhancement, true) && !nativeNoiseSupported) {
      toast('La réduction du bruit est indisponible sur ce navigateur.');
      return;
    }
    clearVoiceRef.current?.setNoiseReduction(enabled);
    setNoiseReduction(enabled);
    if (!enabled) {
      setNoiseAttenuation(0);
      setNoiseActive(false);
    }
    if (track && nativeNoiseSupported) {
      try { await track.applyConstraints({ noiseSuppression: enabled }); }
      catch { toast('Le navigateur n’a pas accepté le filtre anti-bruit natif.'); }
    }
    if (!musicRef.current) {
      const native=rawRef.current?.getAudioTracks()[0] || null;
      void restoreOutboundAudio((enabled || voiceEnhancement) ? clearVoiceRef.current?.track || native : native);
    }
  }
  function changeNoiseStrength(level: number) {
    setNoiseStrength(level);
    clearVoiceRef.current?.setNoiseStrength(level);
  }
  async function changeVoiceEnhancement(enabled: boolean) {
    if (enabled && rawRef.current && !await ensureClearVoice(true, noiseReduction)) return;
    clearVoiceRef.current?.setEnabled(enabled);
    setVoiceEnhancement(enabled);
    if (!musicRef.current) {
      const native = rawRef.current?.getAudioTracks()[0] || null;
      void restoreOutboundAudio((enabled || noiseReduction) ? clearVoiceRef.current?.track || native : native);
    }
  }
  function changeVoiceProfile(profile: VoiceProfile) {
    clearVoiceRef.current?.setProfile(profile);
    setVoiceProfile(profile);
  }
  function toggleCam() {
    (rawRef.current || localRef.current)
      ?.getVideoTracks()
      .forEach(t => (t.enabled = !camOn));
    setCamOn(!camOn);
  }
  async function toggleScreen() {
    if (!screenRef.current && hostId !== peerId.current && !roomSettings.allowScreenShare) {
      toast('L’organisateur a désactivé le partage d’écran.');
      return;
    }
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

  function recordCanvasAndAudio(mode: 'video' | 'audio', includeMusic: boolean) {
    // Prefer the unprocessed microphone for recordings. Live ClearVoice,
    // the WebRTC music path and compression have already shaped that track:
    // running those processors through a second recording compressor can
    // make speech metallic, pump or stutter.
    const mic = rawRef.current?.getAudioTracks().find(track => track.readyState === 'live')
      || processedMicrophoneTrack();
    const nativeIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const remoteAudio = Object.entries(streamsRef.current)
      .filter(([, stream]) => stream.getAudioTracks().some(track => track.readyState === 'live'));
    const musicAudio = musicRef.current?.musicOnlyStream.getAudioTracks()[0];
    const hasMusic = Boolean(musicAudio && musicAudio.readyState === 'live');
    // Even if music is loaded, an audio-only recording without soundtrack
    // must stay on the ORIGINAL native microphone track.
    const directMicRecording = Boolean(mic && !remoteAudio.length && !includeMusic);
    // iPhone: reuse the already-running Live music mixer instead of creating
    // a second AudioContext and two more copies of the microphone.
    const reuseLiveMix = nativeIOS && includeMusic && hasMusic && !remoteAudio.length;
    const needsSecondaryMixer = !directMicRecording && !reuseLiveMix;

    let audioContext: AudioContext | null = null;
    let mixedDestination: MediaStreamAudioDestinationNode | null = null;
    let voiceDestination: MediaStreamAudioDestinationNode | null = null;
    let audioTimer = 0;
    const nodes = new Map<string,{track:MediaStreamTrack;source:MediaStreamAudioSourceNode;voice:boolean}>();

    // For a solo capture WITHOUT music, the browser records the microphone
    // directly. No Web Audio, resampling, worklet or second encoder involved.
    if (needsSecondaryMixer) {
      const ctx = new AudioContext({ latencyHint: 'playback' });
      audioContext = ctx;
      void ctx.resume().catch(() => {});
      mixedDestination = ctx.createMediaStreamDestination();
      voiceDestination = ctx.createMediaStreamDestination();
      const speech = ctx.createGain();
      speech.gain.value = 1; // all speech tracks enter the recorder at unity gain
      const soundtrack = ctx.createGain();
      soundtrack.gain.value = 0.82; // background music already follows the Live volume slider

      // No compressor, EQ or resampler after the microphone's native input.
      // The clean voice-only track is an unchanged unity-gain copy.
      speech.connect(voiceDestination);

      const mixedBus = ctx.createGain();
      mixedBus.gain.value = 1;
      // Peak-only protection: speech is NOT continuously compressed to
      // make room for the soundtrack; gain reduction only near digital clipping.
      const mixProtection = ctx.createDynamicsCompressor();
      mixProtection.threshold.value = -0.8;
      mixProtection.knee.value = 0;
      mixProtection.ratio.value = 16;
      mixProtection.attack.value = 0.001;
      mixProtection.release.value = 0.09;
      speech.connect(mixedBus);
      soundtrack.connect(mixedBus);
      mixedBus.connect(mixProtection);
      mixProtection.connect(mixedDestination);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const analysisMute = ctx.createGain();
      analysisMute.gain.value = 0;
      speech.connect(analyser);
      analyser.connect(analysisMute);
      analysisMute.connect(mixedBus);
      const samples = new Float32Array(512);
      let lastSpeech = 0;

      const link = (track: MediaStreamTrack, bus: GainNode, voice: boolean, active: Set<string>) => {
        if (track.readyState !== 'live') return;
        active.add(track.id);
        if (nodes.has(track.id)) return;
        try {
          const source = ctx.createMediaStreamSource(new MediaStream([track]));
          source.connect(bus);
          nodes.set(track.id,{track,source,voice});
        } catch { /* Ignore an unsupported individual source track. */ }
      };
      const sync = () => {
        const active = new Set<string>();
        if (mic) link(mic, speech, true, active);
        for (const stream of Object.values(streamsRef.current))
          for (const track of stream.getAudioTracks()) link(track, speech, true, active);
        const currentMusic = musicRef.current?.musicOnlyStream.getAudioTracks()[0];
        if (currentMusic && hasMusic) link(currentMusic, soundtrack, false, active);
        for (const [id,node] of nodes) {
          if (active.has(id) && node.track.readyState === 'live') continue;
          node.source.disconnect();
          nodes.delete(id);
        }
        // Never turn voices down in response to music or participant count.
        // The final peak-only limiter protects simultaneous speech peaks.
        speech.gain.setTargetAtTime(1, ctx.currentTime, 0.05);

        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const rms = Math.sqrt(energy / samples.length);
        const now = performance.now();
        if (rms > 0.02) lastSpeech = now;
        const speaking = rms > 0.013 || now - lastSpeech < 550;
        // Music follows the user's slider upstream. Only music is ducked:
        // voice always stays at unity gain and remains the focus.
        soundtrack.gain.setTargetAtTime(speaking ? 0.70 : 1, ctx.currentTime, speaking ? 0.06 : 0.28);
      };
      sync();
      audioTimer = window.setInterval(sync, 130);
    }

    const local = localRef.current;
    const localVideo = local ? new MediaStream(local.getVideoTracks()) : null;
    const videoStreams = () => [
      { key: 'local', stream: localVideo },
      ...Object.entries(streamsRef.current).map(([key, stream]) => ({ key, stream })),
    ].filter(item => item.stream) as Array<{key:string;stream:MediaStream}>;
    const canvas = document.createElement('canvas');
    const dimensions = videoDimensions(
      format === 'original' ? '16:9' : format,
      quality === '2160' ? '1080' : quality
    );
    canvas.width = nativeIOS ? 16 : dimensions.width;
    canvas.height = nativeIOS ? 9 : dimensions.height;
    const canvasCtx = canvas.getContext('2d')!;
    const videos = new Map<string, HTMLVideoElement>();
    const draw = () => {
      if (mode === 'audio') return;
      const items = videoStreams();
      const key = shareRef.current || pinRef.current || focusRef.current;
      const item = items.find(v => v.key === key) || items.find(v => v.key === 'local') || items[0];
      canvasCtx.fillStyle = '#090d19';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      if (!item) return;
      const source = item.key === 'local' && screenRef.current ? screenRef.current : item.stream;
      let v = videos.get(item.key);
      if (!v || v.srcObject !== source) {
        if (v) { v.pause(); v.srcObject = null; }
        v = document.createElement('video');
        v.srcObject = source;
        v.muted = true;
        v.playsInline = true;
        void v.play().catch(() => {});
        videos.set(item.key, v);
      }
      if (v.readyState >= 2 && v.videoWidth) {
        const sourceRatio = v.videoWidth / v.videoHeight;
        if (Math.abs(sourceRatio - canvas.width / canvas.height) > 0.02) {
          const cover = Math.max(canvas.width / v.videoWidth, canvas.height / v.videoHeight);
          const bw = v.videoWidth * cover, bh = v.videoHeight * cover;
          canvasCtx.save();
          canvasCtx.filter = 'blur(20px) brightness(0.4)';
          canvasCtx.drawImage(v, (canvas.width - bw) / 2, (canvas.height - bh) / 2, bw, bh);
          canvasCtx.restore();
        }
        const scale = Math.min(canvas.width / v.videoWidth, canvas.height / v.videoHeight);
        const width = v.videoWidth * scale, height = v.videoHeight * scale;
        canvasCtx.drawImage(v, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      }
    };
    if (mode === 'video' && !nativeIOS) draw();
    const interval = mode === 'video' && !nativeIOS ? window.setInterval(draw, 80) : 0;
    let videoStream: MediaStream | null = null;
    let fallback = false;
    if (mode === 'video') {
      try {
        if (!nativeIOS && typeof canvas.captureStream === 'function') videoStream = canvas.captureStream(24);
      } catch { /* Fallback to the camera's own track. */ }
      if (!videoStream?.getVideoTracks().length) {
        const items = videoStreams();
        const focus = shareRef.current || pinRef.current || focusRef.current;
        const chosen = items.find(x => x.key === focus) || items.find(x => x.key === 'local') || items[0];
        const track = (chosen?.key === 'local'
          ? screenRef.current?.getVideoTracks()[0] || (nativeIOS ? rawRef.current?.getVideoTracks()[0] : null)
          : null)
          || chosen?.stream.getVideoTracks()[0] || rawRef.current?.getVideoTracks()[0];
        if (!track) throw new Error('Aucune caméra disponible pour enregistrer la vidéo.');
        const captureTrack = nativeIOS ? track.clone() : track;
        // Apply the requested resolution BEFORE starting MediaRecorder.
        // "original" must not modify the camera track's dimensions.
        // The 1080p choice requests Full HD if the camera/browser supports it.
        videoStream = new MediaStream([captureTrack]);
        fallback = true;
      }
    }

    const dryAudio = directMicRecording ? mic : voiceDestination?.stream.getAudioTracks()[0];
    const mixedAudio = hasMusic ? mixedDestination?.stream.getAudioTracks()[0] : dryAudio;
    const chosenAudio = reuseLiveMix ? musicRef.current?.track : (includeMusic ? mixedAudio : dryAudio);
    if (mode === 'audio' && !chosenAudio) throw new Error('Aucun son du micro à enregistrer.');
    const combined = new MediaStream([
      ...(videoStream?.getVideoTracks() || []),
      ...(chosenAudio ? [chosenAudio] : []),
    ]);
    // Dual capture is limited to desktop audio, only when music exists. On
    // phones we preserve one high-quality recording to avoid encoder overload.
    // Prioritize the fidelity of the main recording over a simultaneous
    // second encoder, which can overload Safari and lower-powered devices.
    // The soundtrack is chosen before recording; no automatic second capture.
    const alternateStream: MediaStream | null = null;
    const cleanup = () => {
      window.clearInterval(interval);
      window.clearInterval(audioTimer);
      // Only stop tracks owned by the recorder. Never stop the live camera.
      if (nativeIOS || !fallback) videoStream?.getTracks().forEach(track => track.stop());
      nodes.forEach(node => node.source.disconnect());
      nodes.clear();
      mixedDestination?.stream.getTracks().forEach(track => track.stop());
      voiceDestination?.stream.getTracks().forEach(track => track.stop());
      if (audioContext) void audioContext.close().catch(() => {});
      videos.forEach(v => { v.pause(); v.srcObject = null; });
    };
    return { stream: combined, alternateStream, cleanup, fallback, directMicRecording };
  }

  function testMicrophone() {
    if (micTestRecording) return;
    const microphone=rawRef.current?.getAudioTracks()[0];
    if (!microphone || microphone.readyState!=='live') {
      toast('Le microphone est indisponible. Active-le avant ce test.');
      return;
    }
    if (typeof MediaRecorder==='undefined') {
      toast('Le test de capture audio n’est pas compatible avec ce navigateur.');
      return;
    }
    if (micTestUrlRef.current) URL.revokeObjectURL(micTestUrlRef.current);
    micTestUrlRef.current='';
    setMicTestUrl('');
    let clone: MediaStreamTrack | null=null;
    try {
      clone=microphone.clone();
      const ua=navigator.userAgent;
      const preferMp4=/iPhone|iPad|iPod|Safari(?!.*Chrome|.*CriOS)/i.test(ua);
      const candidates=preferMp4
        ? ['audio/mp4','audio/webm;codecs=opus','audio/webm']
        : ['audio/webm;codecs=opus','audio/webm','audio/mp4'];
      let recorder:MediaRecorder|null=null;
      for(const mimeType of candidates) {
        if(!MediaRecorder.isTypeSupported(mimeType))continue;
        try {
          recorder=new MediaRecorder(new MediaStream([clone]),{
            mimeType,audioBitsPerSecond:192000
          });
          break;
        } catch {/* another codec may work */}
      }
      if(!recorder)recorder=new MediaRecorder(new MediaStream([clone]),{audioBitsPerSecond:192000});
      const activeRecorder=recorder;
      const captured:BlobPart[]=[];
      setMicTestRecording(true);
      activeRecorder.ondataavailable=event=>{if(event.data.size)captured.push(event.data)};
      activeRecorder.onerror=()=>toast('Échec du test audio natif sur ce navigateur.');
      activeRecorder.onstop=()=>{
        clone?.stop();
        setMicTestRecording(false);
        const file=new Blob(captured,{type:activeRecorder.mimeType || 'audio/webm'});
        if(!file.size) {
          toast('Le test audio est vide. Vérifie l’autorisation du microphone.');
          return;
        }
        const url=URL.createObjectURL(file);
        micTestUrlRef.current=url;
        setMicTestUrl(url);
        toast('Test prêt : écoute ta voix, puis compare avec l’enregistrement SCELYO.');
      };
      activeRecorder.start();
      window.setTimeout(()=>{
        if(activeRecorder.state==='recording')activeRecorder.stop();
      },4000);
    } catch (error) {
      clone?.stop();
      setMicTestRecording(false);
      toast('Test micro impossible : '+readableError(error));
    }
  }

  async function startRecording(mode: 'video' | 'audio') {
    if (!joined || recording) return;
    if (hostId !== peerId.current && !roomSettings.allowRecording) {
      toast('L’organisateur a désactivé les enregistrements.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      toast('Enregistrement non pris en charge sur ce navigateur.');
      return;
    }
    try {
      const hadMusic = Boolean(musicRef.current);
      const selectedWithMusic = hadMusic && recordIncludeMusic;
      const { stream, alternateStream, cleanup, fallback, directMicRecording } =
        recordCanvasAndAudio(mode, selectedWithMusic);
      const nativeIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
      if(mode==='video' && nativeIOS && recordVideoQuality==='1080'){
        const videoTrack=stream.getVideoTracks()[0];
        if(videoTrack){
          try{
            await videoTrack.applyConstraints({
              width:{ideal:1920},height:{ideal:1080},
              frameRate:{ideal:24,max:30}
            });
          }catch{
            toast('La caméra ne permet pas de forcer 1080p. Résolution native conservée.');
          }
        }
      }
      if (directMicRecording) {
        toast('Capture audio naturelle : micro enregistré directement, sans traitement vocal supplémentaire.');
      }
      if(fallback)toast('Capture caméra directe sur iPhone : qualité '+(recordVideoQuality==='1080'?'1080p demandée':'d’origine')+'. Les effets virtuels et changements d’intervenant ne seront pas inclus.');
      const types =
        mode === 'video'
          ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
          : /iPhone|iPad|iPod|Safari(?!.*Chrome)/i.test(navigator.userAgent)
            ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
            : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const rate=nativeIOS
        ? recordVideoQuality==='1080'?5500000:7000000
        : quality==='720'?2600000:5500000;
      let recorder:MediaRecorder|null=null;
      let recorderError:unknown=null;
      for(const candidate of [...types.filter(t=>MediaRecorder.isTypeSupported(t)),'']){
        try{
          recorder=new MediaRecorder(stream,mode==='video'
            ?{...(candidate?{mimeType:candidate}:{}),videoBitsPerSecond:rate,audioBitsPerSecond:192000}
            :{...(candidate?{mimeType:candidate}:{}),audioBitsPerSecond:192000});
          break;
        }catch(e){recorderError=e;}
      }
      if(!recorder)throw new Error('Format vidéo non pris en charge : '+readableError(recorderError));
      let alternateRecorder: MediaRecorder | null = null;
      const alternateChunks: BlobPart[] = [];
      // An audio-only session can be saved in both variants without any
      // postprocessing or extra video encoder. If the browser rejects the
      // second recorder, the original selected mix remains available.
      if (alternateStream) {
        try {
          alternateRecorder = new MediaRecorder(alternateStream, {
            ...(recorder.mimeType ? { mimeType: recorder.mimeType } : {}),
            audioBitsPerSecond: 192000,
          });
          alternateRecorder.ondataavailable = event => {
            if (event.data.size) alternateChunks.push(event.data);
          };
        } catch {
          alternateRecorder = null;
        }
      }
      recorder.onerror=event=>{
        console.warn('SCELYO recorder error',event);
        toast('La capture a été interrompue par le navigateur. Essaie en 720p sans musique.');
        if(recorder?.state==='recording'){try{recorder.stop()}catch{/* already stopped */}}
      };
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = e => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        if (alternateRecorder && alternateRecorder.state === 'recording') {
          await new Promise<void>(resolve => {
            alternateRecorder!.addEventListener('stop', () => resolve(), { once: true });
            try { alternateRecorder!.stop(); } catch { resolve(); }
          });
        }
        cleanup();
        stopCaptureRef.current = null;
        const type =
          recorder.mimeType || (mode === 'video' ? 'video/webm' : 'audio/webm');
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
        const baseName =
          'SCELYO-Live-' + roomRef.current + '-' +
          new Date().toISOString().replace(/[:.]/g, '-');
        const filename = baseName + (selectedWithMusic ? '-avec-musique' : '-sans-musique') + '.' + ext;
        const item = { blob, name: filename, url: URL.createObjectURL(blob) };
        if (readyRef.current) URL.revokeObjectURL(readyRef.current.url);
        readyRef.current = item;
        setRecordReady(item);
        if (alternateChunks.length && alternateRecorder) {
          const alternateType = alternateRecorder.mimeType || type;
          const alternateBlob = new Blob(alternateChunks, { type: alternateType });
          if (alternateBlob.size) {
            const otherExt = alternateType.includes('mp4') ? 'm4a' : 'webm';
            const otherFilename = baseName + (selectedWithMusic ? '-sans-musique' : '-avec-musique') + '.' + otherExt;
            const otherItem = {
              blob: alternateBlob, name: otherFilename, url: URL.createObjectURL(alternateBlob),
            };
            if (alternateRef.current) URL.revokeObjectURL(alternateRef.current.url);
            alternateRef.current = otherItem;
            setAlternateRecording(otherItem);
            void saveRecording(alternateBlob, otherFilename)
              .then(saved => setSavedItems(previous => [saved, ...previous]))
              .catch(() => toast('La seconde version est disponible au téléchargement, mais pas enregistrée dans Vault.'));
          }
        }
        setRecording(false);
        void keepRecording(blob,filename);
        void emit('recording', { active: false }).catch(() => {});
        // Do not download or upload anything without a user click.
        // Local IndexedDB persistence is separate from file downloading.
        setDriveStatus('idle');
        toast('Enregistrement prêt : choisis la version, puis clique sur Télécharger.');
      };
      recorderRef.current = recorder;
      stopCaptureRef.current = cleanup;
      setRecordReady(null);
      setAlternateRecording(null);
      if (readyRef.current) URL.revokeObjectURL(readyRef.current.url);
      if (alternateRef.current) URL.revokeObjectURL(alternateRef.current.url);
      readyRef.current = null;
      alternateRef.current = null;
      setRecordedWithMusic(selectedWithMusic);
      setDownloadWithMusic(selectedWithMusic);
      setUploadedLink('');
      setSeconds(0);
      setRecordMode(mode);
      recorder.start(2000); // periodic chunks reduce Safari memory pressure
      if (alternateRecorder) {
        try { alternateRecorder.start(); } // continuous audio output
        catch {
          alternateRecorder = null;
          toast('Le navigateur ne permet pas deux versions simultanées. La version choisie avant la capture sera conservée.');
        }
      }
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
          toast('Google Drive connecté. Pour envoyer une capture, clique sur « Envoyer sur Drive » après l’enregistrement.');
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

  async function uploadToDrive(rec: Pick<Recording, 'blob' | 'name'>) {
    if (!tokenRef.current) {
      setShowSettings(true);
      toast('Connecte ton compte Google Drive avant de sauvegarder.');
      return;
    }
    setUploading(true);
    setDriveStatus('uploading');
    setNotice('');
    try {
      // Look up the folder through the currently authenticated Google account.
      // A cached folder ID may belong to a different account.
      const folderQuery = encodeURIComponent("trashed = false and name = 'FondVidéo Meet - Enregistrements' and mimeType = 'application/vnd.google-apps.folder'");
      const folders = await driveFetch('https://www.googleapis.com/drive/v3/files?q=' + folderQuery + '&fields=files(id,name)&pageSize=20');
      let folderId = folders.files?.[0]?.id || '';
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
      toast((rec.blob.type.startsWith('audio/') ? 'Audio' : 'Vidéo') + ' sauvegardé dans ton Google Drive.');
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
  const chosenRecording = recordReady && (
    recordedWithMusic === downloadWithMusic
      ? recordReady
      : alternateRecording || recordReady
  );

  return (
    <div className="app-shell">
      {fullStage && joined && !gallery && (
        <button type="button" className="scelyo-fullscreen-exit"
          onClick={() => setFullStage(false)} aria-label="Quitter le plein écran" title="Échap pour quitter">
          <Minimize2 size={19}/> Quitter le plein écran <span>Échap</span>
        </button>
      )}
      {pendingRecordMode && joined && (
        <div className="modal-backdrop scelyo-rec-setup-backdrop"
          onMouseDown={event=>{if(event.target===event.currentTarget)setPendingRecordMode(null);}}>
          <section className="scelyo-rec-setup" role="dialog" aria-modal="true" aria-labelledby="scelyo-rec-title">
            <div className="scelyo-rec-setup-head">
              <span className="scelyo-rec-setup-icon">{pendingRecordMode==='audio'?<Headphones size={26}/>:<Video size={26}/>}</span>
              <div><span>SCELYO LIVE / CAPTURE</span><h2 id="scelyo-rec-title">Avant d’enregistrer</h2></div>
              <button type="button" onClick={()=>setPendingRecordMode(null)} aria-label="Annuler l'enregistrement"><X size={22}/></button>
            </div>
            <p>Choisis ce que le fichier final doit contenir. Le micro naturel est privilégié pour la capture, sans effet vocal supplémentaire. Rien ne sera téléchargé ni envoyé sur Drive sans ton accord.</p>
            {pendingRecordMode==='video' && (
              <fieldset className="scelyo-rec-music-options">
                <legend>Qualité de la vidéo enregistrée</legend>
                <label className={recordVideoQuality==='1080'?'selected':''}>
                  <input type="radio" name="scelyo-record-quality"
                    checked={recordVideoQuality==='1080'}
                    onChange={()=>setRecordVideoQuality('1080')}/>
                  <Video size={21}/><span><strong>1080p Full HD</strong>
                    <small>Demande 1920 × 1080 si la caméra et Safari le permettent</small></span>
                </label>
                <label className={recordVideoQuality==='original'?'selected':''}>
                  <input type="radio" name="scelyo-record-quality"
                    checked={recordVideoQuality==='original'}
                    onChange={()=>setRecordVideoQuality('original')}/>
                  <Video size={21}/><span><strong>Qualité d’origine</strong>
                    <small>Conserve la résolution réelle du flux caméra, sans la réduire</small></span>
                </label>
              </fieldset>
            )}
            <fieldset className="scelyo-rec-music-options">
              <legend>Musique dans l’enregistrement</legend>
              <label className={!recordIncludeMusic?'selected':''}>
                <input type="radio" name="scelyo-record-music" checked={!recordIncludeMusic}
                  onChange={()=>setRecordIncludeMusic(false)}/>
                <Mic size={21}/><span><strong>Sans musique</strong><small>Voix des participants uniquement</small></span>
              </label>
              <label className={recordIncludeMusic?'selected':''}>
                <input type="radio" name="scelyo-record-music" checked={recordIncludeMusic}
                  disabled={!musicName} onChange={()=>setRecordIncludeMusic(true)}/>
                <Music2 size={21}/><span><strong>Avec la musique de fond</strong>
                  <small>{musicName?'Le niveau musical suit la jauge ; la voix ne baisse pas.':'Importe d’abord une musique dans Live'}</small></span>
              </label>
            </fieldset>
            <p className="scelyo-rec-setup-footnote">
              {pendingRecordMode==='audio' && musicName
                ? 'Pour préserver le son des voix, SCELYO enregistre une seule version de haute qualité : choisis avec ou sans musique avant de démarrer.'
                : 'Tu pourras télécharger le fichier en un clic après l’arrêt. Pour la vidéo, choisis la musique avant la capture.'}
            </p>
            <div className="scelyo-mic-test-box">
              <div><strong>Vérifier la qualité du microphone</strong><small>Test local de 4 secondes, sans musique, sans filtre ni envoi sur Internet. Utilise un casque pour éviter les échos.</small></div>
              <button type="button" disabled={micTestRecording}
                onClick={testMicrophone}>{micTestRecording?'Enregistrement du test…':'Tester mon micro (4 s)'}</button>
              {micTestUrl && <audio controls src={micTestUrl} preload="metadata" aria-label="Écouter le test du microphone naturel"/>}
            </div>
            <div className="scelyo-rec-setup-actions">
              <button type="button" className="scelyo-rec-cancel" onClick={()=>setPendingRecordMode(null)}>Annuler</button>
              <button type="button" className="scelyo-rec-start" onClick={()=>{
                const mode = pendingRecordMode;
                setPendingRecordMode(null);
                if(mode) void startRecording(mode);
              }}><Circle size={17} fill="currentColor"/> Démarrer l’enregistrement {pendingRecordMode==='audio'?'audio':'vidéo'}</button>
            </div>
          </section>
        </div>
      )}
      <header className="header scelyo-header">
        <button type="button" className="scelyo-brand" aria-label="SCELYO · Accueil"
          onClick={() => { if (!joined) { location.hash = ''; setRoom(''); setMenuOpen(false); } }}>
          <img src="./scelyo-mark.svg" alt="" width="40" height="40" />
          <span className="scelyo-brand-name">SCELYO</span>
          <span className="scelyo-brand-divider" />
          <span className="scelyo-brand-descriptor">Le live devient création</span>
        </button>
        <nav className="scelyo-header-nav" aria-label="Espaces SCELYO">
          <button type="button" className="scelyo-nav-item selected" onClick={() => { if (!joined) { location.hash = ''; setRoom(''); } }}><Video size={17}/> Live</button>
          <a className="scelyo-nav-item" href="./fondvideo.html"><Camera size={17}/> Studio</a>
          <button type="button" className="scelyo-nav-item" onClick={() => setLibraryOpen(true)}><Library size={17}/> Vault</button>
        </nav>
        <div className="scelyo-header-actions">
          <button type="button" className={'scelyo-drive-btn ' + (driveConnected ? 'connected' : '')} onClick={() => setShowSettings(true)} title="Sauvegarde Google Drive">
            <CloudUpload size={18}/><span>{driveConnected ? 'Drive connecté' : 'Connecter Drive'}</span>
          </button>
          <button type="button" className="scelyo-menu-toggle" aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X size={22}/> : <Menu size={22}/>}
          </button>
        </div>
        {menuOpen && (
          <nav className="scelyo-mobile-menu" aria-label="Navigation mobile">
            <button type="button" onClick={() => {setMenuOpen(false);if(!joined){location.hash='';setRoom('');}}}><Video size={18}/> SCELYO Live <ArrowRight size={16}/></button>
            <a href="./fondvideo.html"><Camera size={18}/> SCELYO Studio <ArrowRight size={16}/></a>
            <button type="button" onClick={() => {setMenuOpen(false);setLibraryOpen(true);}}><Library size={18}/> SCELYO Vault <ArrowRight size={16}/></button>
            <button type="button" onClick={() => {setMenuOpen(false);setShowSettings(true);}}><CloudUpload size={18}/> Google Drive <ArrowRight size={16}/></button>
          </nav>
        )}
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
        <main className="fv-dashboard">
          <aside className="fv-sidebar" aria-label="Navigation principale">
            <div className="fv-sidebar-label">SCELYO / ESPACES</div>
            <div className="fv-sidebar-active"><Video size={19}/> Tableau de bord <span>01</span></div>
            <button type="button" onClick={() => openRoom(newCode())}><Plus size={19}/> Nouvelle session <ArrowRight size={16}/></button>
            <a href="./fondvideo.html"><Camera size={19}/> SCELYO Studio <ArrowRight size={16}/></a>
            <button type="button" onClick={() => setLibraryOpen(true)}><Library size={19}/> SCELYO Vault <ArrowRight size={16}/></button>
            <div className="fv-sidebar-bottom">
              <div className="fv-sidebar-orb"><Video size={20}/></div>
              <strong>Le live devient création.</strong>
              <p>Crée, échange et enregistre tes idées au même endroit.</p>
              <span><ShieldCheck size={14}/> Ton espace, tes contenus</span>
            </div>
          </aside>

          <div className="fv-dashboard-content">
            <div className="fv-dashboard-topline"><span><span className="fv-online-dot"/> TON UNIVERS SCELYO</span><span>LIVE · STUDIO · VAULT</span></div>
            <section className="fv-feature-hero">
              <div className="fv-feature-content">
                <div className="fv-kicker"><span className="fv-kicker-dash"/> CRÉER. RÉUNIR. CAPTURER.</div>
                <h1>Le live devient<br/><em>création.</em></h1>
                <p>Lance tes sessions, transforme tes vidéos et retrouve tes captures dans un seul espace créatif.</p>
                <div className="fv-hero-buttons">
                  <button className="fv-hero-primary" onClick={() => openRoom(newCode())}><Plus size={21}/> Créer une session <ArrowRight size={18}/></button>
                  <a className="fv-hero-secondary" href="./fondvideo.html"><PlayCircle size={21}/> Ouvrir le Studio</a>
                </div>
                <div className="fv-feature-metrics"><span><span className="fv-metric-dot"/> ÉCHANGES EN DIRECT</span><span><ShieldCheck size={15}/> ACCÈS PRIVÉ</span></div>
              </div>
              <div className="fv-hero-showcase" aria-hidden="true">
                <div className="fv-showcase-orbit fv-orbit-one"/>
                <div className="fv-showcase-orbit fv-orbit-two"/>
                <div className="fv-showcase-glow"/>
                <div className="fv-glass-frame">
                  <div className="fv-glass-head"><span><i/> <i/> <i/></span><b>SCELYO / LIVE</b><span>● LIVE</span></div>
                  <div className="fv-glass-stage">
                    <div className="fv-glass-guest guest-one"><div className="fv-guest-avatar"><Users size={38}/></div><small>Caméra principale</small></div>
                    <div className="fv-glass-guest guest-two"><div className="fv-guest-avatar"><Video size={22}/></div><small>Invité connecté</small></div>
                  </div>
                  <div className="fv-glass-controls"><span><Mic size={16}/></span><span><Video size={16}/></span><span><MonitorUp size={16}/></span><span className="fv-glass-hangup"><PhoneOff size={16}/></span></div>
                </div>
                <div className="fv-floating-label"><span><Circle size={9} fill="currentColor"/></span><div><strong>À toi de créer</strong><small>Le studio est prêt.</small></div></div>
              </div>
            </section>

            <div className="fv-section-heading"><div><span>TON WORKSPACE</span><h2>Quelle sera ta prochaine création ?</h2></div><span className="fv-heading-index">/ 03 POSSIBILITÉS</span></div>
            <section className="fv-action-grid">
              <button className="fv-action-card fv-action-meet" onClick={() => openRoom(newCode())}>
                <span className="fv-action-top"><span className="fv-action-icon"><Video size={26}/></span><ArrowRight size={21}/></span>
                <span className="fv-action-bottom"><small>01 / SE CONNECTER</small><strong>Nouvelle session</strong><span>Lance une session vidéo en un instant.</span></span>
              </button>
              <a className="fv-action-card fv-action-studio" href="./fondvideo.html">
                <span className="fv-action-top"><span className="fv-action-icon"><Camera size={26}/></span><ArrowRight size={21}/></span>
                <span className="fv-action-bottom"><small>02 / CRÉER</small><strong>SCELYO Studio</strong><span>Mets tes vidéos en scène et exporte-les.</span></span>
              </a>
              <button className="fv-action-card fv-action-library" onClick={() => setLibraryOpen(true)}>
                <span className="fv-action-top"><span className="fv-action-icon"><Library size={26}/></span><ArrowRight size={21}/></span>
                <span className="fv-action-bottom"><small>03 / RETROUVER</small><strong>SCELYO Vault</strong><span>Retrouve tes captures sur cet appareil.</span></span>
              </button>
            </section>

            <section className="fv-join-strip">
              <div className="fv-join-copy"><span className="fv-join-icon"><Link2 size={23}/></span><div><strong>Une invitation à rejoindre ?</strong><p>Entre un code pour accéder à une session.</p></div></div>
              <div className="fv-join-form">
                <input value={newRoom} onChange={e => setNewRoom(e.target.value.toLowerCase())}
                  placeholder="Code de session (12 caractères)" aria-label="Code de session"
                  onKeyDown={e => {if(e.key==='Enter'){if(/^[a-z2-9]{12}$/.test(newRoom.trim()))openRoom(newRoom.trim());else toast('Saisis un code valide de 12 caractères.');}}}/>
                <button title="Rejoindre la session" onClick={() => /^[a-z2-9]{12}$/.test(newRoom.trim()) ? openRoom(newRoom.trim()) : toast('Saisis un code valide de 12 caractères.')}><ArrowRight size={21}/></button>
              </div>
            </section>
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
              <div className="eyebrow">SCELYO LIVE / AVANT LA SESSION</div>
              <h2>Rejoindre la session</h2>
              <p>Prépare ta présence avant d'entrer en direct.</p>
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
              <section className="scelyo-clearvoice-prejoin" aria-label="SCELYO ClearVoice avant la réunion">
                <div className="scelyo-clearvoice-prejoin-header">
                  <div className="scelyo-clearvoice-headline">
                    <span className="scelyo-clearvoice-icon"><AudioLines size={20}/></span>
                    <span><strong>SCELYO ClearVoice</strong><small>Ta voix, plus claire pendant la session</small></span>
                  </div>
                </div>
                <label className="scelyo-clearvoice-option">
                  <span><strong>Réduire les bruits de fond</strong><small>Traitement local, avec réduction native si disponible</small></span>
                  <input type="checkbox" checked={noiseReduction}
                    onChange={event => void changeNoiseReduction(event.target.checked)}
                    aria-label="Réduire les bruits de fond"/>
                </label>
                <label className="scelyo-clearvoice-option">
                  <span><strong>Améliorer la voix</strong><small>Clarté, fréquences et volume</small></span>
                  <input type="checkbox" checked={voiceEnhancement}
                    onChange={event => void changeVoiceEnhancement(event.target.checked)}
                    aria-label="Améliorer la voix"/>
                </label>
                <label className="scelyo-clearvoice-level">Profil de voix
                  <select value={voiceProfile} disabled={!voiceEnhancement}
                    onChange={event => changeVoiceProfile(event.target.value as VoiceProfile)}>
                    <option value="natural">Naturel</option>
                    <option value="balanced">Équilibré</option>
                    <option value="strong">Renforcé</option>
                  </select>
                </label>
                <p className="scelyo-clearvoice-note">Par défaut, le son est naturel sans traitement supplémentaire. Active ces filtres seulement si tu le souhaites ; les bruits faibles sont surtout atténués pendant les pauses.</p>
              </section>
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
                {busy ? 'Connexion…' : 'Entrer dans la session'}{' '}
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
              <div className="eyebrow">SCELYO LIVE / EN DIRECT</div>
              <h2>
                SCELYO Live <span className="meeting-id">#{room}</span>
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
              <Camera size={17} /> Mise en scène
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
          {clearVoiceOpen && (
            <section className="scelyo-clearvoice-panel" aria-label="Réglages SCELYO ClearVoice">
              <div className="scelyo-clearvoice-panel-header">
                <div className="scelyo-clearvoice-headline">
                  <span className="scelyo-clearvoice-icon"><AudioLines size={21}/></span>
                  <span><strong>SCELYO ClearVoice</strong><small>Réglages audio de cette session</small></span>
                </div>
                <button type="button" className="scelyo-clearvoice-close" title="Fermer ClearVoice"
                  onClick={() => setClearVoiceOpen(false)}><X size={18}/></button>
              </div>
              <label className="scelyo-clearvoice-option">
                <span><strong>Réduction des bruits de fond</strong><small>Atténue les sons parasites pendant les échanges</small></span>
                <input type="checkbox" checked={noiseReduction}
                  disabled={!rawRef.current?.getAudioTracks().length}
                  onChange={event => void changeNoiseReduction(event.target.checked)}/>
              </label>
              <div className="scelyo-noise-status" role="status" aria-live="off">
                <span className={'scelyo-noise-indicator '+(noiseReduction && (clearVoiceGateReady || nativeNoiseSupported) ? (noiseActive ? 'reducing' : 'enabled') : 'inactive')}/>
                <div>
                  <strong>{!noiseReduction ? 'Filtre désactivé'
                    : !clearVoiceGateReady && !nativeNoiseSupported ? 'Filtre non disponible'
                    : noiseActive ? 'Bruits atténués en ce moment'
                    : 'Filtre actif · micro surveillé'}</strong>
                  <small>{noiseReduction && clearVoiceGateReady
                    ? (noiseAttenuation > 0 ? 'Atténuation locale : '+noiseAttenuation+' dB' : 'En attente d’un bruit à atténuer')
                    : nativeNoiseSupported && noiseReduction ? 'Réduction du bruit gérée par le navigateur'
                    : 'Active le filtre ou autorise le micro'}</small>
                </div>
              </div>
              {clearVoiceGateReady && (
                <label className="scelyo-clearvoice-level">Force du filtre anti-bruit
                  <select value={noiseStrength} disabled={!noiseReduction}
                    onChange={event=>changeNoiseStrength(Number(event.target.value))}>
                    <option value={1}>Légère</option>
                    <option value={2}>Normale</option>
                    <option value={3}>Forte</option>
                  </select>
                </label>
              )}
              <label className="scelyo-clearvoice-option">
                <span><strong>Amélioration de la voix</strong><small>Filtre et équilibre la voix en temps réel</small></span>
                <input type="checkbox" checked={voiceEnhancement}
                  disabled={!rawRef.current?.getAudioTracks().length}
                  onChange={event => void changeVoiceEnhancement(event.target.checked)}/>
              </label>
              <label className="scelyo-clearvoice-level">Intensité de l’amélioration
                <select value={voiceProfile} disabled={!voiceEnhancement || !clearVoiceReady}
                  onChange={event => changeVoiceProfile(event.target.value as VoiceProfile)}>
                  <option value="natural">Naturel</option>
                  <option value="balanced">Équilibré</option>
                  <option value="strong">Renforcé</option>
                </select>
              </label>
              <p className="scelyo-clearvoice-note">
                {clearVoiceReady && (voiceEnhancement || noiseReduction)
                  ? 'ClearVoice est activé volontairement pour le Live. La piste native reste prioritaire pour les enregistrements.'
                  : 'Qualité naturelle : le microphone natif reste prioritaire, sans égalisation ou compression supplémentaire.'}
                {' '}Les bruits de fond sont surtout réduits pendant les silences, sans promettre de supprimer une autre voix qui parle en même temps. La musique partagée n’est pas filtrée.
              </p>
            </section>
          )}
          {isHost && musicPanelOpen && (
            <section className="scelyo-music-panel" aria-label="Musique d’ambiance SCELYO Live">
              <div className="scelyo-music-panel-head">
                <div className="scelyo-music-title"><span className="scelyo-music-title-icon"><Music2 size={22}/></span><div><strong>Musique d’ambiance</strong><small>SCELYO Live · diffusion dans la session</small></div></div>
                <button type="button" className="scelyo-music-close" title="Fermer" onClick={() => setMusicPanelOpen(false)}><X size={20}/></button>
              </div>
              <div className="scelyo-music-panel-body">
                <label className="scelyo-music-upload">
                  <FileAudio size={19}/>
                  <span>{musicName ? 'Changer de morceau' : 'Importer un fichier audio'}</span>
                  <small>MP3 · WAV · M4A</small>
                  <input type="file" accept=".mp3,.wav,.m4a,.aac,audio/mpeg,audio/wav,audio/mp4"
                    disabled={musicBusy} hidden onChange={event => {
                      const file = event.currentTarget.files?.[0] || null;
                      event.currentTarget.value = '';
                      void loadMusic(file);
                    }}/>
                </label>
                {musicName ? (
                  <div className="scelyo-music-player">
                    <div className="scelyo-music-track"><div><Music2 size={18}/><span title={musicName}>{musicName}</span></div><span className={musicPlaying ? 'scelyo-music-live' : 'scelyo-music-paused'}>{musicPlaying ? '● DIFFUSION' : 'PRÊT / PAUSE'}</span></div>
                    <div className="scelyo-music-transport">
                      <button type="button" disabled={musicBusy} onClick={() => void toggleMusicPlayback()}
                        title={musicPlaying ? 'Mettre en pause' : 'Diffuser la musique'}>
                        {musicPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
                        <span>{musicPlaying ? 'Pause' : 'Lecture'}</span>
                      </button>
                      <input type="range" min="0" max={Math.max(1, musicDuration || 1)} step="0.1"
                        value={Math.min(musicTime, Math.max(1, musicDuration || 1))}
                        disabled={!musicDuration || musicBusy}
                        aria-label="Position dans la musique"
                        onChange={event => musicRef.current?.seek(Number(event.target.value))}/>
                      <span>{musicClock(musicTime)} / {musicClock(musicDuration)}</span>
                      <button type="button" title="Retirer la musique" disabled={musicBusy}
                        className="scelyo-music-delete" onClick={() => void clearMusic()}><X size={18}/></button>
                    </div>
                    <div className="scelyo-music-settings">
                      <label className="scelyo-music-volume">
                        <Volume2 size={18}/> <span>Musique en arrière-plan : {musicVolume}%</span>
                        <input type="range" min="0" max="100" value={musicVolume}
                          aria-label="Volume de la musique d’ambiance" onChange={event => {
                            const next = Number(event.target.value);
                            setMusicVolume(next);
                            musicRef.current?.setVolume(next);
                          }}/>
                      </label>
                      <p className="scelyo-music-volume-note">Réglage indépendant du micro : plus tu montes la jauge, plus la musique s’entend. Elle baisse automatiquement pendant les prises de parole.</p>
                      <label className="scelyo-music-check"><input type="checkbox" checked={musicLoop}
                        onChange={event => {setMusicLoop(event.target.checked);musicRef.current?.setLoop(event.target.checked);}}/>
                        <Repeat2 size={17}/> En boucle</label>
                      <label className="scelyo-music-check"><input type="checkbox" checked={musicMonitor}
                        onChange={event => {setMusicMonitor(event.target.checked);musicRef.current?.setMonitor(event.target.checked);}}/>
                        <Headphones size={17}/> Écoute locale</label>
                    </div>
                  </div>
                ) : <p className="scelyo-music-empty">Choisis une musique depuis ton appareil, puis appuie sur Lecture pour la diffuser à tous les participants.</p>}
              </div>
              <p className="scelyo-music-note"><ShieldCheck size={15}/> Le fichier reste sur ton appareil : seul le son est partagé pendant la session. Pour l’écoute locale, utilise un casque afin d’éviter les échos.</p>
            </section>
          )}
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
                {isHost && <div className="scelyo-host-security">
                  <strong><ShieldCheck size={17}/> Sécurité de la réunion</strong>
                  <label><span><b>Verrouiller la réunion</b><small>Empêche de nouveaux participants de rejoindre.</small></span><input type="checkbox" disabled={hostBusy} checked={roomSettings.locked} onChange={e => void updateHostSettings({locked:e.target.checked})}/></label>
                  <label><span><b>Autoriser le partage d’écran</b><small>Pour les participants (l’hôte conserve ce droit).</small></span><input type="checkbox" disabled={hostBusy} checked={roomSettings.allowScreenShare} onChange={e => void updateHostSettings({allowScreenShare:e.target.checked})}/></label>
                  <label><span><b>Autoriser les enregistrements</b><small>Pour les participants (l’hôte conserve ce droit).</small></span><input type="checkbox" disabled={hostBusy} checked={roomSettings.allowRecording} onChange={e => void updateHostSettings({allowRecording:e.target.checked})}/></label>
                  <p>Tu peux également couper les micros ou retirer une personne ci-dessous. La salle reste accessible aux invités déjà présents.</p>
                </div>}
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
                <button type="button"
                  className={clearVoiceOpen ? 'tool-btn active-tool' : 'tool-btn'}
                  onClick={() => setClearVoiceOpen(open => !open)}
                  title={noiseReduction ? (noiseActive ? 'ClearVoice atténue les bruits ('+noiseAttenuation+' dB)' : 'ClearVoice anti-bruit actif') : 'ClearVoice désactivé'}
                  aria-label="Réglages SCELYO ClearVoice" aria-expanded={clearVoiceOpen}>
                  <AudioLines />
                  {noiseReduction && (clearVoiceGateReady || nativeNoiseSupported) && (
                    <span className={'scelyo-toolbar-noise-dot '+(noiseActive?'reducing':'enabled')}
                      aria-hidden="true"/>
                  )}
                </button>
                <button
                  className={camOn ? 'tool-btn' : 'tool-btn disabled-tool'}
                  onClick={toggleCam}
                  title={camOn ? 'Couper la caméra' : 'Activer la caméra'}
                >
                  {camOn ? <Video /> : <VideoOff />}
                </button>
                {isHost && (
                  <button type="button" className={musicPanelOpen || musicPlaying ? 'tool-btn active-tool scelyo-music-button' : 'tool-btn scelyo-music-button'}
                    onClick={() => setMusicPanelOpen(open => !open)}
                    title="Diffuser une musique d’ambiance" aria-label="Musique d’ambiance" aria-expanded={musicPanelOpen}>
                    <Music2/>
                    {musicPlaying && <span className="scelyo-music-indicator"/>}
                  </button>
                )}
                <span className="tool-separator" />
                <button
                  className={sharing ? 'tool-btn active-tool' : 'tool-btn'}
                  onClick={toggleScreen}
                  title={!isHost&&!roomSettings.allowScreenShare?'Partage d’écran désactivé par l’hôte':'Partager l’écran'}
                  disabled={!sharing&&!isHost&&!roomSettings.allowScreenShare}
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
                    recording ? stopRecording : () => setPendingRecordMode('video')
                  }
                  title={
                    recording ? 'Arrêter l’enregistrement' : 'Enregistrer vidéo'
                  }
                  disabled={!recording&&!isHost&&!roomSettings.allowRecording}
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
                <div className="scelyo-record-music-choice">
                  <Music2 size={17}/>
                  <span><b>{recording ? 'Enregistrement en cours' : 'Musique : à choisir avant de démarrer'}</b>
                    <small>Au démarrage, choisis avec ou sans musique ; le téléchargement se fera seulement après la capture.</small>
                  </span>
                </div>
                {!recording && (
                  <button onClick={() => setPendingRecordMode('audio')} disabled={!isHost&&!roomSettings.allowRecording}>
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
                  <span className="drive-transfer"><CloudUpload size={16} /> Envoi de l’enregistrement vers Drive…</span>
                )}
                {driveStatus === 'saved' && uploadedLink && (
                  <span className="drive-transfer success"><Check size={16} /> Enregistrement sauvegardé sur Drive</span>
                )}
                {recordReady && chosenRecording && !recording && (
                  <section id="scelyo-record-download" className="scelyo-download-card" aria-label="Télécharger mon enregistrement">
                    <div className="scelyo-download-card-head">
                      <span className="scelyo-download-status"><Check size={21}/></span>
                      <div><strong>Enregistrement terminé !</strong>
                        <p>Ton fichier est prêt. Sur iPhone, choisis « Enregistrer la vidéo » dans la feuille de partage pour l’ajouter à Photos. Aucun transfert n’est automatique.</p>
                      </div>
                    </div>
                    {alternateRecording && recordMode === 'audio' ? (
                      <fieldset className="scelyo-download-variants">
                        <legend>Choisis la version à télécharger</legend>
                        <label className={!downloadWithMusic?'selected':''}>
                          <input type="radio" name="scelyo-finished-recording-music" checked={!downloadWithMusic} onChange={()=>{setDownloadWithMusic(false);setUploadedLink('');}} />
                          <Mic size={18}/><span><b>Voix uniquement</b><small>Sans musique</small></span>
                        </label>
                        <label className={downloadWithMusic?'selected':''}>
                          <input type="radio" name="scelyo-finished-recording-music" checked={downloadWithMusic} onChange={()=>{setDownloadWithMusic(true);setUploadedLink('');}} />
                          <Music2 size={18}/><span><b>Voix + musique de fond</b><small>Musique atténuée sous la voix</small></span>
                        </label>
                      </fieldset>
                    ) : (
                      <p className="scelyo-download-format-note">
                        {recordedWithMusic ? 'Version avec musique' : 'Version sans musique'}
                        {' · '}
                        {recordMode === 'audio' ? 'Ton navigateur a conservé la version choisie avant la capture.' : 'Pour la vidéo, ce choix s’effectue avant de démarrer l’enregistrement.'}
                      </p>
                    )}
                    <button type="button" className="scelyo-download-main"
                      onClick={()=>recordMode==='video' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
                        ? void saveVideoToPhotos(chosenRecording)
                        : downloadRecording(chosenRecording)}>
                      <Download size={29}/>
                      <span><strong>{recordMode==='video' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
                        ? 'Enregistrer dans Photos'
                        : 'Télécharger '+(recordMode==='audio'?'l’audio':'la vidéo')}</strong>
                        <small>{downloadWithMusic && alternateRecording ? 'Avec musique de fond' : !downloadWithMusic && alternateRecording ? 'Sans musique' : (recordedWithMusic ? 'Avec musique' : 'Sans musique')} · {(chosenRecording.blob.size/1048576).toFixed(1)} Mo</small>
                      </span>
                      <ArrowRight size={22}/>
                    </button>
                    <div className="scelyo-download-more">
                      <button type="button" onClick={()=>setLibraryOpen(true)} disabled={savingLocal}>
                        <Library size={15}/>{savingLocal?'Sauvegarde locale…':'Ouvrir SCELYO Vault'}
                      </button>
                      <button type="button" onClick={()=>void shareRecording({
                        id:'current',name:chosenRecording.name,blob:chosenRecording.blob,
                        mime:chosenRecording.blob.type,size:chosenRecording.blob.size,createdAt:Date.now()
                      })}><Share2 size={15}/> Photos / Partager</button>
                      {recordMode==='video' && /iPhone|iPad|iPod/i.test(navigator.userAgent) && (
                        <button type="button" onClick={()=>downloadRecording(chosenRecording)}>
                          <Download size={15}/> Enregistrer dans Fichiers
                        </button>
                      )}
                      <button type="button" disabled={uploading}
                        onClick={() => driveConnected ? void uploadToDrive(chosenRecording) : setShowSettings(true)}>
                        <CloudUpload size={15}/>
                        {uploading?'Envoi en cours…':driveConnected?'Envoyer cette version sur Drive':'Connecter Google Drive'}
                      </button>
                    </div>
                    {uploadedLink && <a href={uploadedLink} target="_blank" rel="noreferrer" className="scelyo-download-drive-link"><ExternalLink size={16}/> Voir dans Drive</a>}
                  </section>
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
              <div><div className="eyebrow">SCELYO / VAULT LOCAL</div><h2><Library size={22}/> Mes enregistrements</h2></div>
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
                    <button onClick={()=>void shareRecording(item)}><Share2 size={15}/> Photos / Drive / Partager</button>
                    <button disabled={uploading} onClick={()=>driveConnected ? void uploadToDrive(item) : (setLibraryOpen(false),setShowSettings(true))}><CloudUpload size={15}/>{uploading?'Envoi en cours…':driveConnected?'Envoyer sur Drive':'Connecter Drive'}</button>
                    <button className="danger" onClick={()=>void removeRecording(item)}><Trash2 size={15}/> Supprimer</button>
                  </div>
                </article>)}
              </div>}
            <div className="recordings-destinations">
              <strong>Vers Google Drive, Photos ou YouTube</strong>
              <p>Sur iPhone, utilise « Partager » pour ouvrir les applications compatibles. Sur PC, télécharge puis importe le fichier sur le service souhaité. Aucune connexion OAuth n’est nécessaire pour cet export manuel.</p>
              <div><a href="https://drive.google.com/drive/u/0/my-drive" target="_blank" rel="noreferrer">Ouvrir Drive <ExternalLink size={13}/></a><a href="https://studio.youtube.com/" target="_blank" rel="noreferrer">Ouvrir YouTube Studio <ExternalLink size={13}/></a></div>
            </div>
          </section>
        </div>
      )}
      <footer className="footer">
        <span>© SCELYO · Version de prévisualisation</span>
        <span>Live · Studio · Vault — Tes captures restent sous ton contrôle</span>
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
                <div className="eyebrow">SCELYO / DRIVE</div>
                <h2>SCELYO & Google Drive</h2>
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
                <strong>Conserver tes enregistrements</strong>
                <p>Après connexion, tes nouveaux enregistrements rejoignent le dossier dédié sur ton Google Drive après la fin de l’enregistrement.</p>
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
                <p className="drive-password-note"><ShieldCheck size={15}/> L’identification se fait chez Google, jamais dans SCELYO. Aucun mot de passe n’est demandé par SCELYO.</p>
                {!clientId.trim().endsWith('.apps.googleusercontent.com') && (
                  <p className="drive-needs-setup">La connexion Google doit être configurée une seule fois pour cette prévisualisation. Le bouton sera fonctionnel dès que cette configuration aura été ajoutée.</p>
                )}
              </>
            )}
            <div className="drive-automation">
              <Check size={17}/>
              <span><strong>{driveConnected ? 'Envoi vers Drive disponible' : 'Google Drive non connecté'}</strong><small>{driveConnected ? 'Envoi manuel après ton choix de fichier.' : 'Sans OAuth, utilise Photos / Drive / Partager pour envoyer le fichier manuellement.'}</small></span>
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
