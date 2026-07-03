import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, Download, Loader2, Mic, 
  Settings2, Volume2, FileAudio, CheckCircle2, AlertCircle
} from 'lucide-react';

// Chave da API injetada pelo ambiente
const apiKey = "";

// Categorização aproximada das vozes disponíveis no Gemini TTS
const VOICES = [
  { id: 'Kore', name: 'Kore', gender: 'Feminina', type: 'Jovem' },
  { id: 'Aoede', name: 'Aoede', gender: 'Feminina', type: 'Adulta' },
  { id: 'Leda', name: 'Leda', gender: 'Feminina', type: 'Adulta' },
  { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'Feminina', type: 'Adulta' },
  { id: 'Despina', name: 'Despina', gender: 'Feminina', type: 'Jovem' },
  { id: 'Erinome', name: 'Erinome', gender: 'Feminina', type: 'Adulta' },
  { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'Feminina', type: 'Adulta' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'Feminina', type: 'Madura' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'Masculina', type: 'Grave' },
  { id: 'Orus', name: 'Orus', gender: 'Masculina', type: 'Forte' },
  { id: 'Charon', name: 'Charon', gender: 'Masculina', type: 'Maduro' },
  { id: 'Enceladus', name: 'Enceladus', gender: 'Masculina', type: 'Grave' },
  { id: 'Iapetus', name: 'Iapetus', gender: 'Masculina', type: 'Maduro' },
  { id: 'Algieba', name: 'Algieba', gender: 'Masculina', type: 'Adulta' },
  { id: 'Algenib', name: 'Algenib', gender: 'Masculina', type: 'Adulta' },
  { id: 'Puck', name: 'Puck', gender: 'Infantil', type: 'Criança/Neutra' },
  { id: 'Zephyr', name: 'Zephyr', gender: 'Infantil', type: 'Criança/Neutra' },
  { id: 'Autonoe', name: 'Autonoe', gender: 'Infantil', type: 'Criança/Neutra' },
  { id: 'Schedar', name: 'Schedar', gender: 'Infantil', type: 'Jovem' },
];

export default function App() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [filter, setFilter] = useState('Todas');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  
  const [audioUrl, setAudioUrl] = useState(null);
  const [mp3Blob, setMp3Blob] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');

  const audioRef = useRef(null);

  // Filtro de vozes
  const filteredVoices = VOICES.filter(v => 
    filter === 'Todas' ? true : v.gender === filter
  );

  // Monitorar estado do Audio Player
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const onEnded = () => setIsPlaying(false);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);

    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  // Funções Auxiliares: Chunking, Retry, WAV e MP3
  const chunkText = (str, maxLength = 800) => {
    const words = str.split(/(\s+)/);
    const chunks = [];
    let current = "";
    for (const word of words) {
      if (current.length + word.length > maxLength) {
        if (current.trim()) chunks.push(current.trim());
        current = word;
      } else {
        current += word;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  };

  const fetchWithRetry = async (url, options, maxRetries = 5) => {
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Erro API: ${response.status} - ${err}`);
        }
        return await response.json();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await new Promise(res => setTimeout(res, delays[i]));
      }
    }
  };

  const pcmToWav = (pcmData, sampleRate) => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const chunkSize = 36 + dataSize;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, chunkSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const pcmView = new Uint8Array(buffer, 44);
    pcmView.set(pcmData);

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  const convertWavToMp3 = async (wavBlob) => {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js');
      const arrayBuffer = await wavBlob.arrayBuffer();
      // O header WAV que criamos tem 44 bytes
      const pcmData = new Int16Array(arrayBuffer, 44); 
      
      const encoder = new window.lamejs.Mp3Encoder(1, 24000, 128); // Mono, 24kHz, 128kbps
      const mp3Data = [];
      const sampleBlockSize = 1152; 
      
      for (let i = 0; i < pcmData.length; i += sampleBlockSize) {
        const sampleChunk = pcmData.subarray(i, i + sampleBlockSize);
        const mp3buf = encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
      }
      
      const mp3buf = encoder.flush();
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
      
      return new Blob(mp3Data, { type: 'audio/mp3' });
    } catch (e) {
      console.error("Falha ao converter MP3", e);
      return wavBlob; // Fallback elegante
    }
  };

  // Processo de Geração
  const handleGenerate = async () => {
    if (!text.trim()) {
      setError('Por favor, digite algum texto para gerar o áudio.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setAudioUrl(null);
    setMp3Blob(null);

    try {
      // Chunking para não esbarrar em limites de caracteres!
      const chunks = chunkText(text);
      const allPcmData = [];
      let currentSampleRate = 24000;

      for (let i = 0; i < chunks.length; i++) {
        setProgress({ 
          current: i + 1, 
          total: chunks.length, 
          message: `Sintetizando áudio (${i + 1}/${chunks.length})...` 
        });

        const payload = {
          contents: [{ parts: [{ text: chunks[i] }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice }
              }
            }
          },
          model: "gemini-2.5-flash-preview-tts"
        };

        const result = await fetchWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );

        const inlineData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        
        if (inlineData && inlineData.data) {
          // Extrair taxa de amostragem
          const rateMatch = inlineData.mimeType?.match(/rate=(\d+)/);
          if (rateMatch) currentSampleRate = parseInt(rateMatch[1]);

          // Converter base64 para Uint8Array
          const binaryStr = atob(inlineData.data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let b = 0; b < binaryStr.length; b++) {
            bytes[b] = binaryStr.charCodeAt(b);
          }
          allPcmData.push(bytes);
        } else {
          throw new Error("Resposta da API não conteve dados de áudio válidos.");
        }
      }

      // Concatenar todos os chunks
      setProgress({ current: 0, total: 0, message: 'Unindo fragmentos e processando áudio...' });
      const totalLen = allPcmData.reduce((acc, arr) => acc + arr.length, 0);
      const mergedPcm = new Uint8Array(totalLen);
      let offset = 0;
      for (const arr of allPcmData) {
        mergedPcm.set(arr, offset);
        offset += arr.length;
      }

      // Converter para WAV primeiro
      const wavBlob = pcmToWav(mergedPcm, currentSampleRate);
      
      // Converter para MP3 para download usando Lamejs
      setProgress({ current: 0, total: 0, message: 'Codificando arquivo final em MP3...' });
      const finalMp3Blob = await convertWavToMp3(wavBlob);
      
      const url = URL.createObjectURL(finalMp3Blob);
      setAudioUrl(url);
      setMp3Blob(finalMp3Blob);

    } catch (err) {
      setError(err.message || 'Ocorreu um erro ao gerar a voz.');
    } finally {
      setIsGenerating(false);
      setProgress({ current: 0, total: 0, message: '' });
    }
  };

  const downloadMp3 = () => {
    if (!mp3Blob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(mp3Blob);
    link.download = `Gemini_Studio_${selectedVoice}_${new Date().getTime()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-4 sm:p-8 font-sans">
      <div className="max-w-4xl w-full space-y-6">
        
        {/* Header */}
        <header className="flex items-center space-x-3 mb-8">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-500/20">
            <Mic className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
              Gemini Voice Studio
            </h1>
            <p className="text-slate-400 text-sm">Gerador avançado sem limites de caracteres com exportação MP3</p>
          </div>
        </header>

        {/* Alertas */}
        {error && (
          <div className="bg-red-900/40 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl flex items-center space-x-3 animate-pulse">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Main Content Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
          
          <div className="p-6 border-b border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <FileAudio className="w-4 h-4" /> Texto para Narração
              </label>
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-md">
                {text.length} caracteres
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite ou cole o texto que deseja transformar em áudio aqui. Múltiplos parágrafos ou textos longos são suportados..."
              className="w-full h-48 bg-slate-950 text-slate-200 rounded-xl p-4 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-y text-base leading-relaxed placeholder-slate-600 scrollbar-thin scrollbar-thumb-slate-700"
            />
          </div>

          <div className="p-6 bg-slate-800/30">
            <div className="flex flex-col md:flex-row gap-6">
              
              {/* Voice Selection */}
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Settings2 className="w-4 h-4" /> Configuração de Voz
                </div>
                
                <div className="flex gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700 overflow-x-auto">
                  {['Todas', 'Feminina', 'Masculina', 'Infantil'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilter(cat)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                        filter === cat 
                          ? 'bg-indigo-600 text-white shadow-md' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {filteredVoices.map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => setSelectedVoice(voice.id)}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                        selectedVoice === voice.id
                          ? 'bg-indigo-600/20 border-indigo-500 shadow-sm'
                          : 'bg-slate-900 border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800'
                      }`}
                    >
                      <span className="font-semibold text-slate-200">{voice.name}</span>
                      <span className="text-xs text-slate-400 mt-1">{voice.gender} • {voice.type}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
          
          {/* Action Footer */}
          <div className="p-6 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !text.trim()}
              className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                isGenerating 
                  ? 'bg-indigo-600/50 cursor-not-allowed text-slate-300' 
                  : !text.trim()
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {progress.message || 'Gerando...'}
                </>
              ) : (
                <>
                  <Volume2 className="w-5 h-5" />
                  Sintetizar Voz
                </>
              )}
            </button>

            {/* Audio Controls - Visible only when audio is ready */}
            <div className={`flex items-center gap-3 transition-opacity duration-500 ${audioUrl ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <audio ref={audioRef} src={audioUrl} className="hidden" />
              
              <button
                onClick={togglePlay}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-800 border border-slate-700 hover:border-indigo-400 text-indigo-400 hover:text-indigo-300 transition-all hover:scale-105 active:scale-95"
                title={isPlaying ? "Pausar" : "Ouvir Previsão"}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
              </button>
              
              <button
                onClick={downloadMp3}
                className="px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-900/20 hover:shadow-emerald-500/20 active:scale-95"
              >
                <Download className="w-5 h-5" />
                Baixar MP3
              </button>
            </div>
            
          </div>
        </div>
        
        {/* Features Legend */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-8 text-xs text-slate-500">
          <div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Sem limites de caracteres</div>
          <div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Conversão Nativa em MP3</div>
          <div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Vozes de Alta Fidelidade (Gemini)</div>
        </div>

      </div>
    </div>
  );
}