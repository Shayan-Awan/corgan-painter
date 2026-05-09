"use client";

import { useState, useRef, useCallback } from "react";

interface ColorRec {
  name: string;
  hex: string;
  brand: string;
  mood: string;
  reason: string;
}

function BrandStripe() {
  return (
    <div
      className="h-1 w-full"
      style={{
        background:
          "linear-gradient(to right, #B8962E, #2A4A3A, #3DA2A9, #6B3A2A, #C75E29)",
      }}
    />
  );
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
    </svg>
  );
}

const LOADING_MESSAGES = [
  "Sending your room to AI…",
  "Analysing wall surfaces…",
  "Applying your chosen colour…",
  "Rendering shadows and lighting…",
  "Almost there — finishing touches…",
];

export default function RoomPainter() {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/jpeg");

  const [recs, setRecs] = useState<ColorRec[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [customHex, setCustomHex] = useState("#FFFFFF");
  const [usingCustom, setUsingCustom] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [view, setView] = useState<"original" | "generated">("original");
  const [dragging, setDragging] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [paintError, setPaintError] = useState("");
  const [showPromo, setShowPromo] = useState(false);

  const activeColor =
    usingCustom || selectedIdx === null
      ? { hex: customHex, name: "Custom Colour" }
      : { hex: recs[selectedIdx].hex, name: recs[selectedIdx].name };

  const loadFile = useCallback((file: File) => {
    const isImage = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
    if (!isImage) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      // Convert to JPEG via canvas — handles HEIC/HEIF from iPhone cameras
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        const jpeg = canvas.toDataURL("image/jpeg", 0.92);
        setOriginalUrl(jpeg);
        setImageBase64(jpeg.split(",")[1]);
        setMimeType("image/jpeg");
        setImageLoaded(true);
      };
      img.onerror = () => {
        // Fallback if canvas decode fails
        setOriginalUrl(dataUrl);
        setImageBase64(dataUrl.split(",")[1]);
        setMimeType(file.type || "image/jpeg");
        setImageLoaded(true);
      };
      img.src = dataUrl;
      setGeneratedUrl(null);
      setRecs([]);
      setSelectedIdx(null);
      setUsingCustom(false);
      setView("original");
      setAnalyzeError("");
      setPaintError("");
    };
    reader.readAsDataURL(file);
  }, []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    loadFile(e.dataTransfer.files[0]);
  };

  const analyze = async () => {
    if (!imageBase64) return;
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const img = new window.Image();
      img.src = originalUrl!;
      await new Promise((r) => (img.onload = r));
      const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const b64 = c.toDataURL("image/jpeg", 0.85).split(",")[1];

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mimeType: "image/jpeg" }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRecs(data.colors);
      setSelectedIdx(0);
      setUsingCustom(false);
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const paint = async () => {
    if (!imageBase64) return;
    setGenerating(true);
    setPaintError("");
    setLoadingMsg(0);
    const interval = setInterval(() => {
      setLoadingMsg((n) => Math.min(n + 1, LOADING_MESSAGES.length - 1));
    }, 8000);
    try {
      const res = await fetch("/api/paint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          colorName: activeColor.name,
          colorHex: activeColor.hex,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedUrl(`data:image/png;base64,${data.imageBase64}`);
      setView("generated");
      setShowPromo(true);
    } catch (err: unknown) {
      setPaintError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      clearInterval(interval);
      setGenerating(false);
    }
  };

  const download = () => {
    const url = view === "generated" && generatedUrl ? generatedUrl : originalUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.download = `corgan-room-${view}-${Date.now()}.png`;
    a.href = url;
    a.click();
  };

  const newPhoto = () => {
    setImageLoaded(false);
    setOriginalUrl(null);
    setGeneratedUrl(null);
    setImageBase64(null);
    setRecs([]);
    setSelectedIdx(null);
    setView("original");
    setAnalyzeError("");
    setPaintError("");
    setShowPromo(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ── Header ── */}
      <header className="bg-corgan-navy text-white shadow-lg sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <a href="https://corgan.ca" target="_blank" rel="noopener noreferrer">
              <img
                src="/corgan-logo-white.png"
                alt="Corgan Enterprises"
                className="h-10 sm:h-12 w-auto object-contain"
              />
            </a>
          </div>
          {/* Tagline */}
          <p className="hidden lg:block text-[11px] text-corgan-gold-light text-right leading-relaxed font-light italic">
            Building Trust. Delivering Excellence.<br />Strengthening Communities.
          </p>
        </div>
        <BrandStripe />
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-start">

          {/* ── Image column ── */}
          <div className="lg:col-span-2 flex flex-col gap-3">

            {/* Upload zone */}
            {!imageLoaded && (
              <div
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all cursor-pointer select-none min-h-[260px] sm:min-h-[380px] ${
                  dragging
                    ? "border-corgan-gold bg-corgan-gold/5"
                    : "border-gray-300 bg-white active:bg-gray-50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <div className="text-5xl sm:text-7xl mb-3 sm:mb-5 select-none">🏠</div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-700 mb-1">Upload a Room Photo</h2>
                <p className="text-gray-400 text-sm text-center mb-5 max-w-xs px-4">
                  Drag &amp; drop, browse files, or use your camera
                </p>
                <div className="flex gap-3">
                  <button
                    className="px-5 py-3 bg-corgan-navy text-white text-sm font-semibold rounded-xl shadow-sm active:bg-corgan-navy-dark"
                    onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                  >
                    Browse Files
                  </button>
                  <button
                    className="px-5 py-3 border-2 border-gray-200 text-gray-600 text-sm font-semibold rounded-xl active:border-corgan-gold"
                    onClick={(e) => { e.stopPropagation(); cameraRef.current?.click(); }}
                  >
                    📷 Camera
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
              </div>
            )}

            {/* Image viewer */}
            {imageLoaded && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                  <button
                    onClick={() => setView("original")}
                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                      view === "original"
                        ? "text-corgan-navy border-b-2 border-corgan-navy"
                        : "text-gray-400"
                    }`}
                  >
                    Original
                  </button>
                  <button
                    onClick={() => setView("generated")}
                    disabled={!generatedUrl}
                    className={`flex-1 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                      view === "generated"
                        ? "text-corgan-gold border-b-2 border-corgan-gold"
                        : generatedUrl
                        ? "text-gray-400"
                        : "text-gray-200"
                    }`}
                  >
                    ✨ AI Result
                    {generatedUrl && (
                      <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-corgan-teal align-middle" />
                    )}
                  </button>
                </div>

                {/* Image */}
                <div className="relative bg-gray-50">
                  {generating && (
                    <div className="absolute inset-0 bg-corgan-navy/85 flex flex-col items-center justify-center z-10">
                      <Spinner className="h-10 w-10 text-corgan-gold mb-4" />
                      <p className="text-white font-semibold text-sm px-6 text-center">{LOADING_MESSAGES[loadingMsg]}</p>
                      <p className="text-corgan-navy-light text-xs mt-2">Usually takes 20–40 seconds</p>
                    </div>
                  )}

                  {view === "original" && originalUrl && (
                    <img src={originalUrl} alt="Original room" className="w-full h-auto block max-h-[55vh] object-contain" />
                  )}
                  {view === "generated" && generatedUrl && (
                    <img src={generatedUrl} alt="AI painted room" className="w-full h-auto block max-h-[55vh] object-contain" />
                  )}
                  {view === "generated" && !generatedUrl && !generating && (
                    <div className="py-16 text-center text-gray-400">
                      <p className="text-4xl mb-3">🎨</p>
                      <p className="text-sm">Tap <strong className="text-corgan-gold">Paint My Room</strong> below to generate</p>
                    </div>
                  )}
                </div>

                {/* Colour chip on result */}
                {view === "generated" && generatedUrl && (
                  <div className="px-4 py-2 bg-corgan-gold/10 border-t border-corgan-gold/20 flex items-center gap-2">
                    <div className="w-4 h-4 rounded border border-black/10 flex-shrink-0" style={{ backgroundColor: activeColor.hex }} />
                    <p className="text-xs font-medium text-corgan-navy truncate">
                      <strong>{activeColor.name}</strong>{" "}
                      <span className="font-mono text-gray-500">{activeColor.hex.toUpperCase()}</span>
                    </p>
                  </div>
                )}

                {/* Toolbar */}
                <div className="px-3 py-2.5 border-t border-gray-100 flex items-center gap-2">
                  <button
                    onClick={newPhoto}
                    className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg bg-white active:bg-gray-50"
                  >
                    📂 New Photo
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={download}
                    className="px-4 py-2 text-xs font-semibold bg-corgan-navy text-white rounded-lg shadow-sm active:bg-corgan-navy-dark"
                  >
                    ⬇ Download
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Controls column ── */}
          <div className="flex flex-col gap-3">

            {/* Before upload: how it works */}
            {!imageLoaded && (
              <div className="bg-corgan-navy rounded-2xl p-5 text-white">
                <h3 className="font-bold mb-3 text-sm tracking-wide uppercase text-corgan-gold">How It Works</h3>
                <ol className="text-xs leading-relaxed text-corgan-navy-light space-y-2 list-decimal list-inside">
                  <li>Upload a photo of your room</li>
                  <li>AI suggests paint colours that suit your space</li>
                  <li>Pick a suggestion or choose your own colour</li>
                  <li>Tap Paint My Room — AI repaints it photorealistically</li>
                  <li>Download and share with your client</li>
                </ol>
                <div className="mt-4"><BrandStripe /></div>
              </div>
            )}

            {/* Step 1 — Analyse */}
            {imageLoaded && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-corgan-navy text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <h3 className="font-bold text-corgan-navy text-sm uppercase tracking-wide">Analyse Room</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3 ml-7">GPT-4o suggests colours that suit your space.</p>
                <button
                  onClick={analyze}
                  disabled={analyzing}
                  className="w-full py-3.5 bg-corgan-navy text-white font-bold text-sm rounded-xl shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:bg-corgan-navy-dark"
                >
                  {analyzing ? <><Spinner /> Analysing…</> : "✦ Get AI Colour Suggestions"}
                </button>
                {analyzeError && (
                  <p className="mt-2 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 leading-relaxed">{analyzeError}</p>
                )}
              </div>
            )}

            {/* Step 2 — Pick colour */}
            {imageLoaded && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-corgan-navy text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <h3 className="font-bold text-corgan-navy text-sm uppercase tracking-wide">Choose Colour</h3>
                </div>

                {/* AI swatches */}
                {recs.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {recs.map((rec, i) => (
                      <button
                        key={i}
                        onClick={() => { setSelectedIdx(i); setUsingCustom(false); }}
                        className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                          !usingCustom && selectedIdx === i
                            ? "border-corgan-gold bg-corgan-gold/5"
                            : "border-gray-100 bg-gray-50/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex-shrink-0 border border-black/10 shadow-sm"
                            style={{ backgroundColor: rec.hex }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-sm text-gray-800">{rec.name}</span>
                              <span className="font-mono text-xs text-gray-400">{rec.hex.toUpperCase()}</span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{rec.brand}</p>
                            <p className="text-xs font-medium text-corgan-teal">{rec.mood}</p>
                          </div>
                          {!usingCustom && selectedIdx === i && (
                            <div className="w-5 h-5 rounded-full bg-corgan-gold flex items-center justify-center flex-shrink-0">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                        {!usingCustom && selectedIdx === i && (
                          <p className="mt-2 text-xs text-gray-600 leading-relaxed border-t border-corgan-gold/20 pt-2">{rec.reason}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom picker */}
                <div
                  onClick={() => setUsingCustom(true)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    usingCustom ? "border-corgan-gold bg-corgan-gold/5" : "border-gray-100 bg-gray-50/50"
                  }`}
                >
                  <input
                    type="color"
                    value={customHex}
                    onChange={(e) => { setCustomHex(e.target.value); setUsingCustom(true); setSelectedIdx(null); }}
                    className="w-10 h-10 rounded-lg cursor-pointer border-2 border-gray-200 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-700">Custom Colour</p>
                    <p className="text-xs font-mono text-gray-500">{customHex.toUpperCase()}</p>
                  </div>
                  {usingCustom && (
                    <div className="w-5 h-5 rounded-full bg-corgan-gold flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3 — Generate */}
            {imageLoaded && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-corgan-navy text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                  <h3 className="font-bold text-corgan-navy text-sm uppercase tracking-wide">Paint My Room</h3>
                </div>

                <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg border border-black/10 shadow-sm flex-shrink-0" style={{ backgroundColor: activeColor.hex }} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-700 truncate">{activeColor.name}</p>
                    <p className="text-xs font-mono text-gray-500">{activeColor.hex.toUpperCase()}</p>
                  </div>
                </div>

                <button
                  onClick={paint}
                  disabled={generating}
                  className="w-full py-4 bg-corgan-gold text-white font-bold text-base rounded-xl shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:bg-corgan-gold-dark"
                >
                  {generating ? <><Spinner /> Generating…</> : "🎨 Paint My Room"}
                </button>

                {paintError && (
                  <p className="mt-2 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 leading-relaxed">{paintError}</p>
                )}

                <p className="mt-2.5 text-xs text-center text-gray-400">Takes ~20–40 seconds</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Promo modal ── */}
      {showPromo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPromo(false)}
        >
          <div
            className="relative bg-corgan-navy text-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <BrandStripe />
            <div className="mt-5 mb-4 text-4xl">🎉</div>
            <h2 className="text-xl font-bold text-corgan-gold mb-1">Your room looks great!</h2>
            <p className="text-corgan-gold-light text-xs uppercase tracking-widest font-semibold mb-4">Special Offer</p>
            <p className="text-white/90 text-sm leading-relaxed mb-5">
              Message us and get{" "}
              <span className="text-corgan-gold font-bold text-base">10% off</span>{" "}
              your house or building painting!
            </p>
            <div className="space-y-3 mb-6">
              <a
                href="https://www.facebook.com/profile.php?id=100063497285003"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#1877F2] hover:bg-[#166fe5] text-white font-semibold rounded-xl text-sm transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                Facebook @Corgan
              </a>
              <a
                href="https://wa.me/17802152769"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold rounded-xl text-sm transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp 780-215-2769
              </a>
            </div>
            <button
              onClick={() => setShowPromo(false)}
              className="text-xs text-corgan-navy-light hover:text-white transition-colors"
            >
              No thanks, close
            </button>
          </div>
        </div>
      )}

      <footer className="mt-auto border-t border-gray-200 py-4 text-center">
        <p className="text-xs text-gray-400">
          © 2026 Corgan Enterprises Ltd. · Fort McMurray, AB ·{" "}
          <a href="mailto:admin@corgan.ca" className="hover:text-corgan-gold">admin@corgan.ca</a>
        </p>
      </footer>
    </div>
  );
}
