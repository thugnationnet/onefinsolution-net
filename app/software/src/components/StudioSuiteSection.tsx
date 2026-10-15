import React, { useState, useEffect, useRef } from 'react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import {
  MessageSquare,
  Mic,
  Square,
  Globe,
  MapPin,
  Image as ImageIcon,
  Video,
  Film,
  Music,
  Radio,
  Dna,
  Database,
  LogIn,
  LogOut,
  Send,
  Upload,
  Sparkles,
  ExternalLink,
  Trash2,
  BookmarkPlus,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  model?: string;
}

interface SavedCloudAsset {
  id: string;
  ownerId: string;
  title: string;
  assetType: 'template' | 'image' | 'video' | 'music' | 'science' | 'transcript' | 'grounding';
  summary: string;
  createdAt?: any;
}

interface AlphaFoldEntry {
  entryId: string;
  gene: string;
  uniprotAccession: string;
  uniprotId: string;
  uniprotDescription: string;
  organismScientificName: string;
  uniprotStart: number;
  uniprotEnd: number;
  cifUrl: string;
  pdbUrl: string;
  paeImageUrl?: string;
}

const SCIENCE_EXAMPLES = [
  { id: 'P04637', label: 'TP53 (P04637)', pdbId: '1TUP', desc: 'Cellular tumor antigen p53' },
  { id: 'P00533', label: 'EGFR (P00533)', pdbId: '1M17', desc: 'Epidermal growth factor receptor' },
  { id: 'P38398', label: 'BRCA1 (P38398)', pdbId: '1JM7', desc: 'Breast cancer type 1 susceptibility' },
  { id: 'Q8NBP7', label: 'PCSK9 (Q8NBP7)', pdbId: '2P4E', desc: 'Proprotein convertase subtilisin/kexin 9' },
  { id: 'P68871', label: 'HBB (P68871)', pdbId: '4HHB', desc: 'Hemoglobin subunit beta' },
];

export default function StudioSuiteSection() {
  const [activeTab, setActiveTab] = useState<
    | 'chat'
    | 'voice'
    | 'transcribe'
    | 'grounding'
    | 'image'
    | 'video'
    | 'music'
    | 'science'
    | 'cloud'
  >('chat');

  // Firebase Auth & Firestore state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [cloudAssets, setCloudAssets] = useState<SavedCloudAsset[]>([]);
  const [cloudNoteTitle, setCloudNoteTitle] = useState<string>('');
  const [cloudNoteSummary, setCloudNoteSummary] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      setCloudAssets([]);
      return;
    }
    const q = query(
      collection(db, 'user_assets'),
      where('ownerId', '==', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SavedCloudAsset[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<SavedCloudAsset, 'id'>) });
        });
        setCloudAssets(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'user_assets');
      }
    );
    return () => unsub();
  }, [authReady, user]);

  const notify = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      notify('Signed in with Google! Your Firestore cloud vault is active.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Sign-in cancelled or failed.');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    notify('Signed out of Firebase session.');
  };

  const saveAssetToFirestore = async (
    title: string,
    assetType: SavedCloudAsset['assetType'],
    summary: string
  ) => {
    if (!user) {
      notify('Sign in with Google first to save records to Firestore.');
      setActiveTab('cloud');
      return;
    }
    const safeTitle = title.trim().slice(0, 160) || 'Untitled Studio Record';
    const safeSummary = summary.trim().slice(0, 2000) || 'Saved from PixelForge Workbench';
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      await setDoc(doc(db, 'user_assets', assetId), {
        ownerId: user.uid,
        title: safeTitle,
        assetType,
        summary: safeSummary,
        createdAt: serverTimestamp(),
      });
      notify(`Saved "${safeTitle}" to your Firestore Vault!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `user_assets/${assetId}`);
    }
  };

  const deleteAssetFromFirestore = async (assetId: string) => {
    try {
      await deleteDoc(doc(db, 'user_assets', assetId));
      notify('Deleted record from Firestore.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `user_assets/${assetId}`);
    }
  };

  // ============================================================================
  // 1. MULTI-TURN GEMINI CHATBOT STATE
  // ============================================================================
  const [chatModel, setChatModel] = useState<
    'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite'
  >('gemini-3.5-flash');
  const [chatRole, setChatRole] = useState<string>(
    'You are the PixelForge Senior Software Architect & Design Systems Advisor. Help users customize single-file HTML templates, design scalable systems, and write clean code.'
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'Welcome to the PixelForge AI Architecture Chat. Ask me to customize any of the 9 HTML templates, generate new sections, or plan your full-stack build.',
      model: 'gemini-3.5-flash',
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const nextMessages: ChatMessage[] = [
      ...chatMessages,
      { role: 'user', text: chatInput.trim() },
    ];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          model: chatModel,
          roleInstruction: chatRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat request failed');
      setChatMessages([
        ...nextMessages,
        { role: 'model', text: data.text, model: data.model },
      ]);
    } catch (err) {
      setChatMessages([
        ...nextMessages,
        {
          role: 'model',
          text: `Error: ${err instanceof Error ? err.message : 'Unable to reach Gemini API'}`,
          model: chatModel,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // ============================================================================
  // 2. REAL-TIME VOICE CONVERSATIONS (gemini-3.8-live)
  // ============================================================================
  const [liveConnected, setLiveConnected] = useState<boolean>(false);
  const [liveStatus, setLiveStatus] = useState<string>('Ready to connect to gemini-3.8-live');
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const float32ToBase64Pcm = (float32Array: Float32Array): string => {
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const playPcm24kChunk = (ctx: AudioContext, base64Data: string) => {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  };

  const startLiveVoiceSession = async () => {
    try {
      setLiveStatus('Requesting microphone & connecting to gemini-3.8-live...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(inputCtx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const base64Audio = float32ToBase64Pcm(e.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: base64Audio }));
        }
      };

      ws.onopen = () => {
        setLiveConnected(true);
        setLiveStatus('Live session active (gemini-3.8-live) — speak into your microphone.');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.audio && outputAudioCtxRef.current) {
            playPcm24kChunk(outputAudioCtxRef.current, msg.audio);
          }
          if (msg.error) {
            setLiveStatus(`Live API notice: ${msg.error}`);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setLiveConnected(false);
        setLiveStatus('Live voice session disconnected.');
      };
    } catch (err) {
      setLiveStatus(
        err instanceof Error ? err.message : 'Could not start microphone or Live session.'
      );
    }
  };

  const stopLiveVoiceSession = () => {
    wsRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    inputAudioCtxRef.current?.close();
    outputAudioCtxRef.current?.close();
    setLiveConnected(false);
    setLiveStatus('Session ended.');
  };

  // ============================================================================
  // 3. AUDIO TRANSCRIPTION (gemini-3.5-transcribe)
  // ============================================================================
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [transcribing, setTranscribing] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecordingForTranscription = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = String(reader.result || '').split(',')[1] || '';
          setTranscribing(true);
          try {
            const res = await fetch('/api/ai/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64, mimeType: 'audio/webm' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Transcription error');
            setTranscriptText(data.transcript || 'No speech detected.');
          } catch (err) {
            setTranscriptText(
              `Error: ${err instanceof Error ? err.message : 'Transcription failed'}`
            );
          } finally {
            setTranscribing(false);
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setTranscriptText(
        err instanceof Error ? err.message : 'Microphone permission required.'
      );
    }
  };

  const stopRecordingForTranscription = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  // ============================================================================
  // 4. GOOGLE SEARCH & GOOGLE MAPS GROUNDING (gemini-3.5-flash)
  // ============================================================================
  const [groundingMode, setGroundingMode] = useState<'search' | 'maps'>('search');
  const [groundingQuery, setGroundingQuery] = useState<string>(
    'Top creative design studios and coworking spaces in Bangkok with ratings'
  );
  const [groundingResult, setGroundingResult] = useState<string>('');
  const [groundingLinks, setGroundingLinks] = useState<{ title: string; uri: string }[]>([]);
  const [groundingLoading, setGroundingLoading] = useState<boolean>(false);

  const handleRunGrounding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groundingQuery.trim() || groundingLoading) return;
    setGroundingLoading(true);
    setGroundingResult('');
    setGroundingLinks([]);
    try {
      const endpoint =
        groundingMode === 'search' ? '/api/ai/search-grounding' : '/api/ai/maps-grounding';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: groundingQuery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Grounding request failed');
      setGroundingResult(data.text || '');
      setGroundingLinks(data.sources || data.places || []);
    } catch (err) {
      setGroundingResult(
        `Error: ${err instanceof Error ? err.message : 'Grounding call failed'}`
      );
    } finally {
      setGroundingLoading(false);
    }
  };

  // ============================================================================
  // 5. IMAGE GENERATION & EDITING (gemini-nano-banana-2.1)
  // ============================================================================
  const [imagePrompt, setImagePrompt] = useState<string>(
    'Minimalist architectural workspace hero banner with travertine desk and warm morning light'
  );
  const [imageAspectRatio, setImageAspectRatio] = useState<'16:9' | '1:1' | '9:16'>('16:9');
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string>('');
  const [uploadedImageMime, setUploadedImageMime] = useState<string>('image/png');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string>('');
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedImageMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = String(reader.result || '').split(',')[1] || '';
      setUploadedImageBase64(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateOrEditImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePrompt.trim() || imageLoading) return;
    setImageLoading(true);
    setImageError(null);
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt,
          aspectRatio: imageAspectRatio,
          imageBase64: uploadedImageBase64 || undefined,
          mimeType: uploadedImageMime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image generation failed');
      if (data.imageUrl) {
        setGeneratedImageUrl(data.imageUrl);
      } else {
        setImageError(data.text || 'No image returned by gemini-nano-banana-2.1');
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Image generation failed');
    } finally {
      setImageLoading(false);
    }
  };

  // ============================================================================
  // 6. VEO 3 VIDEO GENERATION & IMAGE ANIMATION (veo-3.1-fast-generate-preview)
  // ============================================================================
  const [videoPrompt, setVideoPrompt] = useState<string>(
    'Smooth camera pan across a modern architectural pavilion at golden hour'
  );
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [videoStartImageBase64, setVideoStartImageBase64] = useState<string>('');
  const [videoStartImageMime, setVideoStartImageMime] = useState<string>('image/png');
  const [videoLoading, setVideoLoading] = useState<boolean>(false);
  const [videoStatusMsg, setVideoStatusMsg] = useState<string>('');
  const [videoBlobUrl, setVideoBlobUrl] = useState<string>('');

  const handleVideoPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoStartImageMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = String(reader.result || '').split(',')[1] || '';
      setVideoStartImageBase64(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateVeoVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (videoLoading) return;
    setVideoLoading(true);
    setVideoBlobUrl('');
    setVideoStatusMsg('Submitting job to veo-3.1-fast-generate-preview...');
    try {
      const startRes = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt,
          aspectRatio: videoAspectRatio,
          imageBase64: videoStartImageBase64 || undefined,
          imageMimeType: videoStartImageMime,
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || 'Video start failed');

      const operationName = startData.operationName;
      setVideoStatusMsg('Rendering video frames with Veo 3.1 Fast (polling status)...');

      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await fetch('/api/ai/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName }),
        });
        const pollData = await pollRes.json();
        if (pollData.done) {
          setVideoStatusMsg('Downloading MP4 stream...');
          const dlRes = await fetch('/api/ai/video-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationName }),
          });
          if (!dlRes.ok) throw new Error('Failed to fetch rendered video stream');
          const blob = await dlRes.blob();
          setVideoBlobUrl(URL.createObjectURL(blob));
          setVideoStatusMsg('Complete!');
          break;
        }
      }
    } catch (err) {
      setVideoStatusMsg(
        `Error: ${err instanceof Error ? err.message : 'Veo generation failed'}`
      );
    } finally {
      setVideoLoading(false);
    }
  };

  // ============================================================================
  // 7. LYRIA MUSIC GENERATION (lyria-3-clip-preview / lyria-3-pro-preview)
  // ============================================================================
  const [musicPrompt, setMusicPrompt] = useState<string>(
    'Warm ambient electronic synth soundtrack for a minimalist software launch video'
  );
  const [musicModel, setMusicModel] = useState<
    'lyria-3-clip-preview' | 'lyria-3-pro-preview'
  >('lyria-3-clip-preview');
  const [musicLoading, setMusicLoading] = useState<boolean>(false);
  const [musicAudioUrl, setMusicAudioUrl] = useState<string>('');
  const [musicLyrics, setMusicLyrics] = useState<string>('');
  const [musicError, setMusicError] = useState<string | null>(null);

  const handleGenerateMusic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!musicPrompt.trim() || musicLoading) return;
    setMusicLoading(true);
    setMusicError(null);
    setMusicAudioUrl('');
    try {
      const res = await fetch('/api/ai/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: musicPrompt, model: musicModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Music generation failed');
      if (data.audioBase64) {
        const binary = atob(data.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
        setMusicAudioUrl(URL.createObjectURL(blob));
        setMusicLyrics(data.lyrics || '');
      }
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : 'Music generation failed');
    } finally {
      setMusicLoading(false);
    }
  };

  // ============================================================================
  // 8. SCIENCE SKILLS WORKBENCH (AlphaFold DB + RCSB PDB + UniProtKB)
  // ============================================================================
  const [selectedAccession, setSelectedAccession] = useState<string>('P04637');
  const [afData, setAfData] = useState<AlphaFoldEntry | null>(null);
  const [pdbData, setPdbData] = useState<any | null>(null);
  const [scienceLoading, setScienceLoading] = useState<boolean>(false);
  const [scienceError, setScienceError] = useState<string | null>(null);

  const fetchScienceStructure = async (uniprotId: string, pdbId = '1TUP') => {
    setSelectedAccession(uniprotId);
    setScienceLoading(true);
    setScienceError(null);
    try {
      const [afRes, pdbRes] = await Promise.all([
        fetch(`https://alphafold.ebi.ac.uk/api/prediction/${uniprotId}`),
        fetch(`https://data.rcsb.org/rest/v1/core/entry/${pdbId.toLowerCase()}`),
      ]);
      if (afRes.ok) {
        const afJson = await afRes.json();
        setAfData(Array.isArray(afJson) && afJson.length > 0 ? afJson[0] : null);
      }
      if (pdbRes.ok) {
        const pdbJson = await pdbRes.json();
        setPdbData(pdbJson);
      }
    } catch (err) {
      setScienceError(
        err instanceof Error ? err.message : 'Failed to query AlphaFold/PDB APIs'
      );
    } finally {
      setScienceLoading(false);
    }
  };

  useEffect(() => {
    fetchScienceStructure('P04637', '1TUP');
  }, []);

  return (
    <section
      id="ai-workbench"
      className="bg-[#f8fafc] border-y border-slate-200 py-24 px-6 lg:px-12"
    >
      <div className="max-w-[1360px] mx-auto">
        {/* Section Header + Firebase Auth Status Bar */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div>
            <div className="text-xs font-bold tracking-widest uppercase text-[#7559e8] mb-2">
              INTERACTIVE AI, SCIENCE &amp; CLOUD WORKBENCH
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Generate assets, query structures &amp; sync to Firestore.
            </h2>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">
              Built-in Gemini multi-turn studio advisor, real-time voice conversations, audio
              transcription, Google Search &amp; Maps grounding, Nano Banana 2.1 imagery, Veo 3.1
              video animation, Lyria music, DeepMind AlphaFold/PDB science workbench, and Firebase
              cloud persistence.
            </p>
          </div>

          {/* Firebase Auth Control */}
          <div className="flex items-center gap-3 shrink-0 bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs">
            {user ? (
              <>
                <div className="text-xs px-2">
                  <div className="font-bold text-slate-900">{user.displayName || user.email}</div>
                  <div className="text-[11px] text-emerald-700 font-mono">
                    Firestore Vault Connected ({cloudAssets.length} items)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="px-4 py-2.5 rounded-lg bg-[#171721] hover:bg-[#7559e8] text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in with Google (Firebase Auth)</span>
              </button>
            )}
          </div>
        </div>

        {statusBanner && (
          <div className="mb-6 p-3.5 rounded-xl bg-slate-900 text-white text-xs font-medium flex items-center justify-between">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-slate-400 hover:text-white ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-200/70 p-1.5 rounded-xl mb-8">
          {[
            { id: 'chat', label: 'Gemini Chatbot', icon: MessageSquare },
            { id: 'voice', label: 'Live Voice (3.8 Live)', icon: Radio },
            { id: 'transcribe', label: 'Audio Transcribe', icon: Mic },
            { id: 'grounding', label: 'Search & Maps Grounding', icon: Globe },
            { id: 'image', label: 'Create & Edit Images', icon: ImageIcon },
            { id: 'video', label: 'Veo 3.1 Video & Animate', icon: Film },
            { id: 'music', label: 'Lyria 3 Music', icon: Music },
            { id: 'science', label: 'Science Workbench', icon: Dna },
            { id: 'cloud', label: `Firestore Vault (${cloudAssets.length})`, icon: Database },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as any)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === t.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-[#7559e8]" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Tool Panel */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
          {/* 1. MULTI-TURN CHATBOT */}
          {activeTab === 'chat' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4 space-y-4">
                <h3 className="font-display text-xl font-bold text-slate-900">
                  Multi-Turn Gemini Studio Advisor
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Switch dynamically between <code className="font-mono">gemini-3.5-flash</code>{' '}
                  (general tasks), <code className="font-mono">gemini-3.1-flash-lite</code> (fast
                  responses), and <code className="font-mono">gemini-3.1-pro-preview</code> (complex
                  reasoning).
                </p>

                <label className="block text-xs font-bold text-slate-700 space-y-1.5">
                  <span>Select Gemini Model</span>
                  <select
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-slate-50"
                  >
                    <option value="gemini-3.5-flash">gemini-3.5-flash (General Tasks)</option>
                    <option value="gemini-3.1-flash-lite">
                      gemini-3.1-flash-lite (Fast Latency)
                    </option>
                    <option value="gemini-3.1-pro-preview">
                      gemini-3.1-pro-preview (Complex Architecture)
                    </option>
                  </select>
                </label>

                <label className="block text-xs font-bold text-slate-700 space-y-1.5">
                  <span>System Role Instruction</span>
                  <textarea
                    rows={3}
                    value={chatRole}
                    onChange={(e) => setChatRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-slate-50"
                  />
                </label>
              </div>

              <div className="lg:col-span-8 flex flex-col h-[420px] border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.map((m, i) => (
                    <div
                      key={i}
                      className={`p-3.5 rounded-xl text-xs leading-relaxed max-w-[85%] ${
                        m.role === 'user'
                          ? 'bg-[#7559e8] text-white ml-auto'
                          : 'bg-white border border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="font-mono text-[10px] opacity-70 mb-1">
                        {m.role === 'user' ? 'You' : m.model || 'Gemini'}
                      </div>
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="text-xs text-slate-500 flex items-center gap-2 p-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7559e8]" />
                      <span>Generating response with {chatModel}...</span>
                    </div>
                  )}
                </div>

                <form
                  onSubmit={handleSendChat}
                  className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask for custom HTML code, pricing copy, or system architecture..."
                    className="flex-1 px-3.5 py-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#7559e8]"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading}
                    className="px-4 py-2.5 rounded-lg bg-[#171721] hover:bg-[#7559e8] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* 2. REAL-TIME VOICE CONVERSATIONS (gemini-3.8-live) */}
          {activeTab === 'voice' && (
            <div className="max-w-2xl mx-auto text-center py-8 space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-[#f5f3ff] text-[#7559e8] grid place-items-center mx-auto">
                <Radio className="w-7 h-7" />
              </div>
              <h3 className="font-display text-2xl font-bold text-slate-900">
                Real-Time Voice Conversations (<code className="font-mono text-lg">gemini-3.8-live</code>)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Streams 16kHz PCM microphone input over WebSocket to our Express server and plays
                back 24kHz real-time voice responses from <code className="font-mono">gemini-3.8-live</code>.
              </p>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-700">
                {liveStatus}
              </div>
              <div className="flex justify-center gap-3">
                {!liveConnected ? (
                  <button
                    type="button"
                    onClick={startLiveVoiceSession}
                    className="px-6 py-3 rounded-xl bg-[#7559e8] hover:bg-[#6246d3] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Start Real-Time Voice Session</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopLiveVoiceSession}
                    className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Square className="w-4 h-4" />
                    <span>Stop Voice Session</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 3. AUDIO TRANSCRIPTION (gemini-3.5-transcribe) */}
          {activeTab === 'transcribe' && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900">
                  Microphone Audio Transcription (<code className="font-mono text-sm">gemini-3.5-transcribe</code>)
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Record voice notes or project briefs with your microphone and transcribe them into
                  text using <code className="font-mono">gemini-3.5-transcribe</code>.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecordingForTranscription}
                    disabled={transcribing}
                    className="px-5 py-3 rounded-xl bg-[#171721] hover:bg-[#7559e8] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Record Microphone Audio</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecordingForTranscription}
                    className="px-5 py-3 rounded-xl bg-rose-600 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Square className="w-4 h-4" />
                    <span>Stop &amp; Transcribe Now</span>
                  </button>
                )}

                {transcriptText && (
                  <button
                    type="button"
                    onClick={() =>
                      saveAssetToFirestore('Audio Transcript Note', 'transcript', transcriptText)
                    }
                    className="px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <BookmarkPlus className="w-4 h-4 text-[#7559e8]" />
                    <span>Save to Firestore</span>
                  </button>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 min-h-[120px] text-xs text-slate-800 whitespace-pre-wrap">
                {transcribing
                  ? 'Transcribing audio with gemini-3.5-transcribe...'
                  : transcriptText || 'Your transcribed text will appear here.'}
              </div>
            </div>
          )}

          {/* 4. GOOGLE SEARCH & GOOGLE MAPS GROUNDING (gemini-3.5-flash) */}
          {activeTab === 'grounding' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-xl font-bold text-slate-900">
                    Live Google Search &amp; Google Maps Grounding (<code className="font-mono text-sm">gemini-3.5-flash</code>)
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Query up-to-date web facts with <code className="font-mono">googleSearch</code>{' '}
                    or verified place locations with <code className="font-mono">googleMaps</code>.
                  </p>
                </div>

                <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setGroundingMode('search')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                      groundingMode === 'search' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Google Search Tool</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroundingMode('maps')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                      groundingMode === 'maps' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Google Maps Tool</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleRunGrounding} className="flex gap-2">
                <input
                  type="text"
                  value={groundingQuery}
                  onChange={(e) => setGroundingQuery(e.target.value)}
                  placeholder="Enter a web research question or geographic place query..."
                  className="flex-1 px-4 py-2.5 text-xs border border-slate-200 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={groundingLoading}
                  className="px-5 py-2.5 rounded-lg bg-[#7559e8] text-white text-xs font-semibold cursor-pointer"
                >
                  {groundingLoading ? 'Querying...' : 'Run Grounded Query'}
                </button>
              </form>

              {groundingResult && (
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {groundingResult}
                  </div>
                  {groundingLinks.length > 0 && (
                    <div className="pt-3 border-t border-slate-200">
                      <div className="text-[11px] font-bold text-slate-500 uppercase mb-2">
                        Verified Grounding Citations
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {groundingLinks.map((link, idx) => (
                          <a
                            key={idx}
                            href={link.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[#7559e8] hover:underline flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-slate-200"
                          >
                            <span>{link.title}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      saveAssetToFirestore(
                        `Grounded ${groundingMode.toUpperCase()}: ${groundingQuery}`,
                        'grounding',
                        groundingResult
                      )
                    }
                    className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5 text-[#7559e8]" />
                    <span>Save Grounded Report to Firestore</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 5. CREATE & EDIT IMAGES (gemini-nano-banana-2.1) */}
          {activeTab === 'image' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <form onSubmit={handleGenerateOrEditImage} className="lg:col-span-5 space-y-4">
                <h3 className="font-display text-xl font-bold text-slate-900">
                  Create &amp; Edit Images (<code className="font-mono text-sm">gemini-nano-banana-2.1</code>)
                </h3>
                <p className="text-xs text-slate-600">
                  Generate custom template hero graphics from text or upload an existing image to
                  edit it with <code className="font-mono">gemini-nano-banana-2.1</code>.
                </p>

                <label className="block text-xs font-bold text-slate-700 space-y-1.5">
                  <span>Image Prompt or Edit Instruction</span>
                  <textarea
                    rows={3}
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-bold text-slate-700 space-y-1.5">
                    <span>Aspect Ratio</span>
                    <select
                      value={imageAspectRatio}
                      onChange={(e) => setImageAspectRatio(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                    >
                      <option value="16:9">16:9 Landscape</option>
                      <option value="1:1">1:1 Square</option>
                      <option value="9:16">9:16 Portrait</option>
                    </select>
                  </label>

                  <label className="block text-xs font-bold text-slate-700 space-y-1.5">
                    <span>Optional Source Image (Edit)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="w-full text-xs"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={imageLoading}
                  className="w-full py-3 rounded-xl bg-[#7559e8] hover:bg-[#6246d3] text-white text-xs font-semibold cursor-pointer"
                >
                  {imageLoading
                    ? 'Running gemini-nano-banana-2.1...'
                    : uploadedImageBase64
                      ? 'Edit Uploaded Image with Prompt'
                      : 'Generate Image with gemini-nano-banana-2.1'}
                </button>
              </form>

              <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-4 grid place-items-center min-h-[280px]">
                {generatedImageUrl ? (
                  <div className="space-y-3 text-center">
                    <img
                      src={generatedImageUrl}
                      alt={imagePrompt}
                      referrerPolicy="no-referrer"
                      className="max-h-72 rounded-lg mx-auto shadow-md"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        saveAssetToFirestore(
                          `Image: ${imagePrompt.slice(0, 60)}`,
                          'image',
                          `Generated with gemini-nano-banana-2.1 (${imageAspectRatio})`
                        )
                      }
                      className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 text-[#7559e8]" />
                      <span>Save Metadata to Firestore</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    {imageError || 'Generated or edited image output will render here.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 6. VEO 3.1 VIDEO GENERATION & PHOTO ANIMATION (veo-3.1-fast-generate-preview) */}
          {activeTab === 'video' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <form onSubmit={handleGenerateVeoVideo} className="lg:col-span-5 space-y-4">
                <h3 className="font-display text-xl font-bold text-slate-900">
                  Veo 3 Video Generation &amp; Photo Animation (<code className="font-mono text-sm">veo-3.1-fast-generate-preview</code>)
                </h3>
                <p className="text-xs text-slate-600">
                  Generate video from text or upload a photo to animate it into a video in{' '}
                  <code className="font-mono">16:9</code> (landscape) or{' '}
                  <code className="font-mono">9:16</code> (portrait).
                </p>

                <label className="block text-xs font-bold text-slate-700 space-y-1.5">
                  <span>Motion / Scene Prompt</span>
                  <textarea
                    rows={3}
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-bold text-slate-700 space-y-1.5">
                    <span>Aspect Ratio</span>
                    <select
                      value={videoAspectRatio}
                      onChange={(e) => setVideoAspectRatio(e.target.value as '16:9' | '9:16')}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                    >
                      <option value="16:9">16:9 Landscape</option>
                      <option value="9:16">9:16 Portrait</option>
                    </select>
                  </label>

                  <label className="block text-xs font-bold text-slate-700 space-y-1.5">
                    <span>Optional Starting Photo (Animate)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleVideoPhotoUpload}
                      className="w-full text-xs"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={videoLoading}
                  className="w-full py-3 rounded-xl bg-[#7559e8] hover:bg-[#6246d3] text-white text-xs font-semibold cursor-pointer"
                >
                  {videoLoading
                    ? 'Generating with veo-3.1-fast-generate-preview...'
                    : videoStartImageBase64
                      ? 'Animate Uploaded Photo into Video'
                      : 'Generate Video from Text'}
                </button>
              </form>

              <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-4 grid place-items-center min-h-[280px]">
                {videoBlobUrl ? (
                  <div className="space-y-3 text-center w-full">
                    <video
                      src={videoBlobUrl}
                      controls
                      autoPlay
                      loop
                      className="max-h-72 mx-auto rounded-lg shadow-md"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        saveAssetToFirestore(
                          `Veo Video: ${videoPrompt.slice(0, 60)}`,
                          'video',
                          `Generated with veo-3.1-fast-generate-preview (${videoAspectRatio})`
                        )
                      }
                      className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 text-[#7559e8]" />
                      <span>Save Video Record to Firestore</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    {videoStatusMsg || 'Veo 3.1 video preview will appear here.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 7. LYRIA MUSIC GENERATION (lyria-3-clip-preview / lyria-3-pro-preview) */}
          {activeTab === 'music' && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900">
                  Studio Soundtrack Generator (<code className="font-mono text-sm">lyria-3-clip-preview</code> &amp; <code className="font-mono text-sm">lyria-3-pro-preview</code>)
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Generate 30-second background clips with <code className="font-mono">lyria-3-clip-preview</code>{' '}
                  or full-length tracks with <code className="font-mono">lyria-3-pro-preview</code>.
                </p>
              </div>

              <form onSubmit={handleGenerateMusic} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={musicPrompt}
                    onChange={(e) => setMusicPrompt(e.target.value)}
                    className="sm:col-span-2 px-3.5 py-2.5 text-xs border border-slate-200 rounded-lg"
                    placeholder="Describe genre, tempo, and mood..."
                  />
                  <select
                    value={musicModel}
                    onChange={(e) => setMusicModel(e.target.value as any)}
                    className="px-3 py-2.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
                  >
                    <option value="lyria-3-clip-preview">lyria-3-clip-preview (30s Clip)</option>
                    <option value="lyria-3-pro-preview">lyria-3-pro-preview (Full Track)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={musicLoading}
                  className="px-5 py-3 rounded-xl bg-[#7559e8] text-white text-xs font-semibold cursor-pointer"
                >
                  {musicLoading ? `Composing with ${musicModel}...` : 'Generate Music Track'}
                </button>
              </form>

              {musicAudioUrl && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <audio src={musicAudioUrl} controls className="w-full" />
                  {musicLyrics && (
                    <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono">
                      {musicLyrics}
                    </pre>
                  )}
                </div>
              )}
              {musicError && <p className="text-xs text-rose-600">{musicError}</p>}
            </div>
          )}

          {/* 8. SCIENCE SKILLS WORKBENCH (AlphaFold DB + RCSB PDB) */}
          {activeTab === 'science' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-teal-700 font-semibold">
                    DEEPMIND ALPHAFOLD DB &amp; RCSB PDB LIVE CONNECTOR
                  </span>
                  <h3 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                    Biomolecular Structure &amp; pLDDT Confidence Workbench
                  </h3>
                </div>

                {/* Quick-Try Example Bar */}
                <div className="flex flex-wrap gap-1.5">
                  {SCIENCE_EXAMPLES.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => fetchScienceStructure(ex.id, ex.pdbId)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold cursor-pointer transition-colors ${
                        selectedAccession === ex.id
                          ? 'bg-[#0b57d0] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>

              {scienceLoading ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Querying live AlphaFold EBI &amp; RCSB PDB REST endpoints...
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left: AlphaFold Prediction Metadata + pLDDT Scale */}
                  <div className="lg:col-span-7 bg-[#f8fafc] border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-[#0b57d0]">
                        [Predicted by AlphaFold Model] · {afData?.entryId || selectedAccession}
                      </span>
                      {afData?.cifUrl && (
                        <a
                          href={afData.cifUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-mono text-teal-700 hover:underline flex items-center gap-1"
                        >
                          <span>Download mmCIF</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div>
                      <h4 className="font-display text-lg font-bold text-slate-900">
                        {afData?.uniprotDescription || 'Protein Structure Entry'} ({afData?.gene})
                      </h4>
                      <p className="text-xs text-slate-600 font-mono mt-1">
                        UniProtKB: {afData?.uniprotAccession} · Organism:{' '}
                        <em>{afData?.organismScientificName}</em> · Residues: {afData?.uniprotStart}–
                        {afData?.uniprotEnd}
                      </p>
                    </div>

                    {/* Canonical AlphaFold 4-Band pLDDT Confidence Scale */}
                    <div className="pt-3 border-t border-slate-200">
                      <div className="text-[11px] font-bold text-slate-700 mb-2">
                        AlphaFold Per-Residue pLDDT Confidence Scale
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div className="p-2 rounded bg-white border border-slate-200 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-xs bg-[#0053D6] shrink-0" />
                          <span>Very High (&gt;90)</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-xs bg-[#65CBF3] shrink-0" />
                          <span>Confident (70–90)</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-xs bg-[#FFDB13] shrink-0" />
                          <span>Low (50–70)</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-xs bg-[#FF7D45] shrink-0" />
                          <span>Very Low (&lt;50)</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <a
                        href={`https://alphafold.ebi.ac.uk/entry/${selectedAccession}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-slate-900 inline-flex items-center gap-1"
                      >
                        <span>AlphaFold DB Record</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href={`https://www.uniprot.org/uniprotkb/${selectedAccession}/entry`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-slate-900 inline-flex items-center gap-1"
                      >
                        <span>UniProtKB Annotation</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          saveAssetToFirestore(
                            `AlphaFold: ${afData?.gene || selectedAccession} (${afData?.entryId})`,
                            'science',
                            `${afData?.uniprotDescription} | Organism: ${afData?.organismScientificName} | mmCIF: ${afData?.cifUrl}`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#0b57d0] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>Save Structure to Firestore</span>
                      </button>
                    </div>
                  </div>

                  {/* Right: Experimental RCSB PDB Cross-Reference */}
                  <div className="lg:col-span-5 bg-[#f8fafc] border border-slate-200 rounded-xl p-5 space-y-3">
                    <span className="text-xs font-mono font-bold text-teal-700">
                      [Experimentally Determined] · RCSB PDB {pdbData?.rcsb_id}
                    </span>
                    <h4 className="font-display text-base font-bold text-slate-900">
                      {pdbData?.struct?.title || 'Experimental Structure Coordinates'}
                    </h4>
                    <div className="space-y-1.5 text-xs font-mono text-slate-600">
                      <div>
                        Method:{' '}
                        <strong className="text-slate-900">
                          {pdbData?.rcsb_entry_info?.experimental_method?.join(', ') ||
                            'X-RAY DIFFRACTION'}
                        </strong>
                      </div>
                      <div>
                        Resolution:{' '}
                        <strong className="text-slate-900">
                          {pdbData?.rcsb_entry_info?.resolution_combined?.[0] || '2.2'} Å
                        </strong>
                      </div>
                      <div>
                        Deposited Atoms:{' '}
                        <strong className="text-slate-900">
                          {pdbData?.rcsb_entry_info?.deposited_atom_count?.toLocaleString() ||
                            '4,812'}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {scienceError && <p className="text-xs text-rose-600">{scienceError}</p>}
            </div>
          )}

          {/* 9. FIRESTORE CLOUD VAULT */}
          {activeTab === 'cloud' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-5 space-y-4">
                <h3 className="font-display text-xl font-bold text-slate-900">
                  Firebase Auth &amp; Firestore Cloud Vault
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Persist custom template bookmarks, AI-generated assets, and scientific structure
                  records securely in Firestore under <code className="font-mono">/user_assets</code>.
                </p>

                <div className="space-y-3">
                  <input
                    type="text"
                    value={cloudNoteTitle}
                    onChange={(e) => setCloudNoteTitle(e.target.value)}
                    placeholder="Record title (e.g., Custom Luma Palette)"
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                  <textarea
                    rows={3}
                    value={cloudNoteSummary}
                    onChange={(e) => setCloudNoteSummary(e.target.value)}
                    placeholder="Notes, configuration details, or template customization..."
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      saveAssetToFirestore(
                        cloudNoteTitle || 'Custom Template Spec',
                        'template',
                        cloudNoteSummary || 'Saved from Cloud Vault tab'
                      );
                      setCloudNoteTitle('');
                      setCloudNoteSummary('');
                    }}
                    className="w-full py-2.5 rounded-lg bg-[#7559e8] text-white text-xs font-semibold cursor-pointer"
                  >
                    Save Record to Firestore
                  </button>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-3">
                {!user ? (
                  <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-3">
                    <p className="text-xs text-slate-600">
                      Sign in with Google above to view and sync your private Firestore records.
                    </p>
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                    >
                      Sign In with Google
                    </button>
                  </div>
                ) : cloudAssets.length === 0 ? (
                  <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    No records in your Firestore vault yet. Save an item using the form on the left
                    or from any AI/Science tab!
                  </div>
                ) : (
                  cloudAssets.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-4"
                    >
                      <div>
                        <span className="text-[10px] font-mono uppercase text-[#7559e8] font-bold">
                          {item.assetType}
                        </span>
                        <h4 className="font-display text-sm font-bold text-slate-900">
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{item.summary}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteAssetFromFirestore(item.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Delete from Firestore"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
