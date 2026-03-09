import { useNavigate } from "react-router";

const geoStyle = {
    fontFamily: "'Georama', sans-serif",
    fontVariationSettings: "'wdth' 100",
} as const;

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div
            className="relative w-full h-screen overflow-hidden bg-black"
            style={geoStyle}
        >
            {/* ── Background: full image ── swap filename below ── */}
            <div
                className="absolute inset-0 z-0"
                style={{
                    backgroundImage: "url('/bg-full3.png')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            />

            {/* ── Background: video layer — place hero.mp4 in /public/video/ ── */}
            <video
                className="absolute inset-0 z-[1] w-full h-full object-cover opacity-60"
                src="/video/hero.mp4"
                autoPlay
                muted
                loop
                playsInline
                onError={(e) => { (e.target as HTMLVideoElement).style.display = "none"; }}
            />

            {/* ── VISUAL:MATH title ── */}
            <h1
                className="absolute z-[4] text-white leading-none select-none"
                style={{
                    fontWeight: 100,
                    fontSize: "clamp(34px, 5.95vw, 119px)",
                    lineHeight: "100%",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -75px)",
                    whiteSpace: "nowrap",
                    letterSpacing: "-0.01em",
                }}
            >
                VISUAL:MATH
            </h1>

            {/* ── ENTER PORTAL button ── */}
            <div className="absolute z-[5]" style={{ top: "50%", left: "50%", transform: "translate(-50%, 55px)" }}>
                <button
                    onClick={() => navigate("/studio")}
                    style={{
                        display: "flex",
                        width: "clamp(180px, 22vw, 380px)",
                        padding: "16px 48px",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "10px",
                        borderRadius: "225px",
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(200,200,200,0.08)",
                        boxShadow:
                            "0 4px 32px 0 rgba(0,0,0,0.18), 0 0 24px 0 rgba(255,255,255,0.06) inset",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        cursor: "pointer",
                        transition: "opacity 0.2s ease, transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
                        fontFamily: "'Georama', sans-serif",
                        fontVariationSettings: "'wdth' 100",
                        fontWeight: 300,
                        fontSize: "clamp(11px, 1vw, 16px)",
                        letterSpacing: "0.18em",
                        color: "rgba(255,255,255,0.85)",
                    }}
                    onMouseEnter={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        btn.style.opacity = "1";
                        btn.style.background = "rgba(127,161,228,0.10)";
                        btn.style.transform = "scale(1.02)";
                        btn.style.borderColor = "#7FA1E4";
                        btn.style.color = "#7FA1E4";
                        btn.style.textShadow = "0 0 12px rgba(127,161,228,0.8), 0 0 24px rgba(127,161,228,0.4)";
                        btn.style.boxShadow = "0 4px 32px 0 rgba(0,0,0,0.18), 0 0 18px 2px rgba(127,161,228,0.25) inset";
                    }}
                    onMouseLeave={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        btn.style.opacity = "1";
                        btn.style.background = "rgba(200,200,200,0.08)";
                        btn.style.transform = "scale(1)";
                        btn.style.borderColor = "rgba(255,255,255,0.18)";
                        btn.style.color = "rgba(255,255,255,0.85)";
                        btn.style.textShadow = "none";
                        btn.style.boxShadow = "0 4px 32px 0 rgba(0,0,0,0.18), 0 0 24px 0 rgba(255,255,255,0.06) inset";
                    }}
                    onMouseDown={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        btn.style.background = "rgba(81,116,186,0.18)";
                        btn.style.borderColor = "#5174BA";
                        btn.style.color = "#5174BA";
                        btn.style.textShadow = "0 0 10px rgba(81,116,186,0.9), 0 0 20px rgba(81,116,186,0.5)";
                        btn.style.boxShadow = "0 4px 32px 0 rgba(0,0,0,0.25), 0 0 18px 2px rgba(81,116,186,0.35) inset";
                        btn.style.transform = "scale(0.98)";
                    }}
                    onMouseUp={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        btn.style.background = "rgba(127,161,228,0.10)";
                        btn.style.borderColor = "#7FA1E4";
                        btn.style.color = "#7FA1E4";
                        btn.style.textShadow = "0 0 12px rgba(127,161,228,0.8), 0 0 24px rgba(127,161,228,0.4)";
                        btn.style.transform = "scale(1.02)";
                    }}
                >
                    ENTER PORTAL
                </button>
            </div>
        </div>
    );
}
