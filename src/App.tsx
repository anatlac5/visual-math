import { BrowserRouter, Routes, Route } from "react-router";
import { useState } from "react";
import LandingPage from "./pages/LandingPage";
import { SineWaveVisualizer } from "./components/SineWaveVisualizer";
import { ParabolaVisualizer } from "./components/ParabolaVisualizer";

type VisualizerMode = "sine" | "parabola";

const geoStyle = {
    fontFamily: "'Georama', sans-serif",
    fontWeight: 300,
    fontVariationSettings: "'wdth' 100",
} as const;

function StudioPage() {
    const [mode, setMode] = useState<VisualizerMode>("sine");

    return (
        <div className="w-full h-screen bg-black relative overflow-hidden">
            {/* Mode switcher — top center */}
            <div
                className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-[#141414]/90 border border-[#2a2a2a] rounded-full px-1.5 py-1.5 backdrop-blur-sm"
                style={geoStyle}
            >
                <button
                    onClick={() => setMode("sine")}
                    className={`h-8 px-5 rounded-full text-[12px] tracking-[1.5px] transition-all duration-300 cursor-pointer ${mode === "sine"
                            ? "bg-[#88ABFF]/15 text-[#88ABFF] border border-[#88ABFF]/30"
                            : "text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.65)] border border-transparent"
                        }`}
                    style={geoStyle}
                >
                    SINE WAVE
                </button>
                <button
                    onClick={() => setMode("parabola")}
                    className={`h-8 px-5 rounded-full text-[12px] tracking-[1.5px] transition-all duration-300 cursor-pointer ${mode === "parabola"
                            ? "bg-[#88ABFF]/15 text-[#88ABFF] border border-[#88ABFF]/30"
                            : "text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.65)] border border-transparent"
                        }`}
                    style={geoStyle}
                >
                    PARABOLA
                </button>
            </div>

            {/* Visualizers — rendered on top of each other, hidden when inactive */}
            <div
                className={`absolute inset-0 transition-opacity duration-500 ${mode === "sine" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    }`}
            >
                <SineWaveVisualizer />
            </div>
            <div
                className={`absolute inset-0 transition-opacity duration-500 ${mode === "parabola" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    }`}
            >
                <ParabolaVisualizer />
            </div>
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/studio" element={<StudioPage />} />
            </Routes>
        </BrowserRouter>
    );
}
