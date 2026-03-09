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
                    backgroundImage: "url('/bg-full.png')",
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
                    fontSize: "clamp(40px, 7vw, 140px)",
                    lineHeight: "100%",
                    top: "45%",
                    left: "57%",
                    transform: "translate(-50%, -50%)",
                    whiteSpace: "nowrap",
                    letterSpacing: "-0.01em",
                }}
            >
                VISUAL:MATH
            </h1>

            {/* ── ENTER PORTAL button ── */}
            <div className="absolute z-[5]" style={{ top: "57%", left: "57%", transform: "translateX(-50%)" }}>
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
                        transition: "opacity 0.2s ease, transform 0.2s ease, background 0.2s ease",
                        fontFamily: "'Georama', sans-serif",
                        fontVariationSettings: "'wdth' 100",
                        fontWeight: 300,
                        fontSize: "clamp(11px, 1vw, 16px)",
                        letterSpacing: "0.18em",
                        color: "rgba(255,255,255,0.85)",
                    }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = "0.85";
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(220,220,220,0.14)";
                        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.02)";
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,200,200,0.08)";
                        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                    }}
                >
                    ENTER PORTAL
                </button>
            </div>
        </div>
    );
}
