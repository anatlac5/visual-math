import { useRef, useEffect, useCallback, useState } from "react";

interface ParabolaParams {
    a: number; // vertical stretch/flip
    h: number; // horizontal shift (vertex x)
    k: number; // vertical shift (vertex y)
}

interface GhostTrail {
    a: number;
    h: number;
    k: number;
    opacity: number;
}

type CameraState = "idle" | "loading" | "active" | "denied" | "error";
type InputMode = "mouse" | "camera";

export function ParabolaVisualizer() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const animFrameRef = useRef<number>(0);
    const handLandmarkerRef = useRef<any>(null);

    // Parabola parameters
    const paramsRef = useRef<ParabolaParams>({ a: 1, h: 0, k: 0 });
    const targetParamsRef = useRef<ParabolaParams>({ a: 1, h: 0, k: 0 });
    const smoothedHandRef = useRef({ x: 0.5, y: 0.5 });
    const isPinchingRef = useRef(false);
    const prevPinchDistRef = useRef<number | null>(null);
    const ghostTrailsRef = useRef<GhostTrail[]>([]);
    const lastGhostTimeRef = useRef(0);
    // Smoothed sign of a (palm orientation), starts positive
    const palmSignRef = useRef<number>(1);
    const smoothedSpreadRef = useRef<number>(0.15);

    const [displayParams, setDisplayParams] = useState<ParabolaParams>({ a: 1, h: 0, k: 0 });
    const [isPinching, setIsPinching] = useState(false);
    const [palmSign, setPalmSign] = useState<number>(1);
    const [cameraState, setCameraState] = useState<CameraState>("idle");
    const [handDetected, setHandDetected] = useState(false);
    const [inputMode, setInputMode] = useState<InputMode>("mouse");
    const fingerPosRef = useRef<{ x: number; y: number } | null>(null);

    // Mouse/touch refs
    const isMouseDownRef = useRef(false);
    const mousePosRef = useRef<{ x: number; y: number } | null>(null);
    const mouseStartRef = useRef<{ x: number; y: number } | null>(null);
    const startParamsOnPressRef = useRef<ParabolaParams>({ a: 1, h: 0, k: 0 });

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    // ── MediaPipe ──────────────────────────────────────────────────────────────
    const initMediaPipe = useCallback(async () => {
        setCameraState("loading");
        try {
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, facingMode: "user" },
                });
            } catch (permErr: any) {
                setCameraState(
                    permErr.name === "NotAllowedError" || permErr.name === "PermissionDeniedError"
                        ? "denied"
                        : "error"
                );
                console.warn("Camera access failed:", permErr.message);
                return;
            }

            const vision = await import("@mediapipe/tasks-vision");
            const { HandLandmarker, FilesetResolver } = vision;

            const filesetResolver = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
            );

            let handLandmarker: any;
            const modelOpts = (delegate: "GPU" | "CPU") => ({
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                    delegate,
                },
                runningMode: "VIDEO" as const,
                numHands: 1,
            });

            try {
                handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, modelOpts("GPU"));
            } catch {
                console.warn("GPU unavailable, falling back to CPU");
                handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, modelOpts("CPU"));
            }

            handLandmarkerRef.current = handLandmarker;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadeddata = () => {
                    videoRef.current?.play();
                    setCameraState("active");
                    setInputMode("camera");
                };
            }
        } catch (err) {
            console.error("MediaPipe init error:", err);
            setCameraState("error");
        }
    }, []);

    // ── Hand processing ────────────────────────────────────────────────────────
    const processHands = useCallback(() => {
        if (!handLandmarkerRef.current || !videoRef.current || videoRef.current.readyState < 2) return;

        let results: any;
        try {
            results = handLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
        } catch {
            return;
        }

        if (results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0];
            const wrist = landmarks[0];
            const thumbTip = landmarks[4];
            const indexMCP = landmarks[5];
            const indexTip = landmarks[8];
            const pinkyMCP = landmarks[17];
            const pinkyTip = landmarks[20];

            // Mirror x so hand feels like a mirror
            fingerPosRef.current = { x: 1 - indexTip.x, y: indexTip.y };

            // ── Pinch detection: index tip ↔ thumb tip ──────────────────────
            const pdx = indexTip.x - thumbTip.x;
            const pdy = indexTip.y - thumbTip.y;
            const pdz = (indexTip.z || 0) - (thumbTip.z || 0);
            const pinchDist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
            const pinching = pinchDist < 0.07;

            // ── Palm normal → sign of a ─────────────────────────────────────
            // Compute two edge vectors from wrist: wrist→indexMCP and wrist→pinkyMCP
            // Cross product Z tells us if palm faces the camera (+) or away (-)
            const v1x = indexMCP.x - wrist.x;
            const v1y = indexMCP.y - wrist.y;
            const v2x = pinkyMCP.x - wrist.x;
            const v2y = pinkyMCP.y - wrist.y;
            const crossZ = v1x * v2y - v1y * v2x; // z-component of cross product
            // crossZ > 0 → palm faces camera (right hand) → positive a
            // crossZ < 0 → palm faces away → negative a
            const rawSign = crossZ > 0 ? 1 : -1;
            // Smooth the sign to avoid snapping — actually we want snappy sign for clarity
            palmSignRef.current = rawSign;
            setPalmSign(rawSign);

            // ── |a| magnitude: lateral spread index→pinky MCPs ─────────────
            // Normalized by distance wrist→middle_mcp for scale invariance
            const spreadDx = pinkyTip.x - indexMCP.x;
            const spreadDy = pinkyTip.y - indexMCP.y;
            const rawSpread = Math.sqrt(spreadDx * spreadDx + spreadDy * spreadDy);
            // Smooth the spread
            smoothedSpreadRef.current = lerp(smoothedSpreadRef.current, rawSpread, 0.15);
            // Map spread ~0.08-0.35 → |a| 0.15-4.0
            const aMag = clamp((smoothedSpreadRef.current - 0.04) / 0.28 * 3.85 + 0.15, 0.15, 4.0);

            isPinchingRef.current = pinching;
            setIsPinching(pinching);
            setHandDetected(true);

            if (pinching) {
                const sf = 0.10;
                smoothedHandRef.current.x = lerp(smoothedHandRef.current.x, 1 - indexTip.x, sf);
                smoothedHandRef.current.y = lerp(smoothedHandRef.current.y, indexTip.y, sf);

                // h: horizontal hand position → [-5, 5]
                targetParamsRef.current.h = (smoothedHandRef.current.x - 0.5) * 10;
                // k: vertical hand position → [-3, 3]
                targetParamsRef.current.k = (0.5 - smoothedHandRef.current.y) * 6;
                // a: magnitude × sign — allows full flip
                targetParamsRef.current.a = aMag * palmSignRef.current;
            }
        } else {
            setHandDetected(false);
            fingerPosRef.current = null;
        }
    }, []);

    // ── Mouse processing ───────────────────────────────────────────────────────
    const processMouseInput = useCallback(() => {
        if (inputMode !== "mouse") return;

        if (isMouseDownRef.current && mousePosRef.current && mouseStartRef.current) {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const nx = mousePosRef.current.x / canvas.width;
            const ny = mousePosRef.current.y / canvas.height;

            fingerPosRef.current = { x: nx, y: ny };
            isPinchingRef.current = true;
            setIsPinching(true);

            const sf = 0.12;
            smoothedHandRef.current.x = lerp(smoothedHandRef.current.x, nx, sf);
            smoothedHandRef.current.y = lerp(smoothedHandRef.current.y, ny, sf);

            // h: horizontal mouse → [-5, 5]
            targetParamsRef.current.h = (smoothedHandRef.current.x - 0.5) * 10;
            // k: vertical mouse → [-3, 3]
            targetParamsRef.current.k = (0.5 - smoothedHandRef.current.y) * 6;

            // a: use vertical drag distance from press start for stretch
            const startNy = mouseStartRef.current.y / canvas.height;
            const deltaY = startNy - ny; // drag up = positive
            targetParamsRef.current.a = clamp(startParamsOnPressRef.current.a + deltaY * 6, -4, 4) || 0.1;
        } else {
            isPinchingRef.current = false;
            setIsPinching(false);
            fingerPosRef.current = mousePosRef.current
                ? {
                    x: mousePosRef.current.x / (canvasRef.current?.width || 1),
                    y: mousePosRef.current.y / (canvasRef.current?.height || 1),
                }
                : null;
        }
    }, [inputMode]);

    // ── Scroll wheel controls 'a' in mouse mode ───────────────────────────────
    useEffect(() => {
        if (inputMode !== "mouse") return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            // scrolling up (negative deltaY) = increase a, down = decrease
            const delta = -e.deltaY * 0.005;
            const current = targetParamsRef.current.a;
            // Allow crossing zero smoothly but avoid exactly-zero
            let next = current + delta;
            if (Math.abs(next) < 0.08) next = 0.08 * Math.sign(next || 1);
            targetParamsRef.current.a = clamp(next, -4, 4);
        };

        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => canvas.removeEventListener("wheel", onWheel);
    }, [inputMode]);

    // ── Mouse/touch event listeners ────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const getPos = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: ((e.clientX - rect.left) / rect.width) * canvas.width,
                y: ((e.clientY - rect.top) / rect.height) * canvas.height,
            };
        };
        const getTouchPos = (e: TouchEvent) => {
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            return {
                x: ((touch.clientX - rect.left) / rect.width) * canvas.width,
                y: ((touch.clientY - rect.top) / rect.height) * canvas.height,
            };
        };

        const onMouseDown = (e: MouseEvent) => {
            if (inputMode !== "mouse") return;
            isMouseDownRef.current = true;
            const pos = getPos(e);
            mousePosRef.current = pos;
            mouseStartRef.current = pos;
            startParamsOnPressRef.current = { ...targetParamsRef.current };
        };
        const onMouseMove = (e: MouseEvent) => {
            if (inputMode !== "mouse") return;
            mousePosRef.current = getPos(e);
        };
        const onMouseUp = () => { isMouseDownRef.current = false; };
        const onTouchStart = (e: TouchEvent) => {
            if (inputMode !== "mouse") return;
            isMouseDownRef.current = true;
            const pos = getTouchPos(e);
            mousePosRef.current = pos;
            mouseStartRef.current = pos;
            startParamsOnPressRef.current = { ...targetParamsRef.current };
        };
        const onTouchMove = (e: TouchEvent) => {
            if (inputMode !== "mouse") return;
            mousePosRef.current = getTouchPos(e);
        };
        const onTouchEnd = () => { isMouseDownRef.current = false; };
        const onMouseLeave = () => {
            mousePosRef.current = null;
            fingerPosRef.current = null;
        };

        canvas.addEventListener("mousedown", onMouseDown);
        canvas.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        canvas.addEventListener("touchstart", onTouchStart, { passive: true });
        canvas.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onTouchEnd);
        canvas.addEventListener("mouseleave", onMouseLeave);

        return () => {
            canvas.removeEventListener("mousedown", onMouseDown);
            canvas.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            canvas.removeEventListener("touchstart", onTouchStart);
            canvas.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onTouchEnd);
            canvas.removeEventListener("mouseleave", onMouseLeave);
        };
    }, [inputMode]);

    // ── Main render loop ───────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        let lastDisplayUpdate = 0;

        // Coordinate system: math units per pixel
        // We want y = x^2 to look good at default scale
        // Math domain: x ∈ [-6, 6], y ∈ [-4, 4]
        const MATH_X_RANGE = 12; // total x span in math units
        const MATH_Y_RANGE = 8;  // total y span in math units

        const render = (time: number) => {
            const cw = canvas.width;
            const ch = canvas.height;

            if (inputMode === "camera") {
                processHands();
            } else {
                processMouseInput();
            }

            // Smooth params
            const smoothRate = 0.07;
            paramsRef.current.a = lerp(paramsRef.current.a, targetParamsRef.current.a, smoothRate);
            paramsRef.current.h = lerp(paramsRef.current.h, targetParamsRef.current.h, smoothRate);
            paramsRef.current.k = lerp(paramsRef.current.k, targetParamsRef.current.k, smoothRate);

            const { a, h: ph, k } = paramsRef.current;

            // Scaling factors: pixels per math unit
            const scaleX = cw / MATH_X_RANGE;
            const scaleY = ch / MATH_Y_RANGE;

            // Canvas coords of math origin
            const originX = cw / 2;
            const originY = ch / 2;

            // Math → canvas
            const toCanvasX = (mx: number) => originX + mx * scaleX;
            const toCanvasY = (my: number) => originY - my * scaleY;

            // Ghost trail
            if (isPinchingRef.current && time - lastGhostTimeRef.current > 130) {
                ghostTrailsRef.current.push({ a, h: ph, k, opacity: 0.35 });
                if (ghostTrailsRef.current.length > 10) ghostTrailsRef.current.shift();
                lastGhostTimeRef.current = time;
            }
            ghostTrailsRef.current = ghostTrailsRef.current
                .map((g) => ({ ...g, opacity: g.opacity * 0.97 }))
                .filter((g) => g.opacity > 0.02);

            // Display update throttled
            if (time - lastDisplayUpdate > 80) {
                setDisplayParams({ a, h: ph, k });
                lastDisplayUpdate = time;
            }

            // ── Draw ──────────────────────────────────────────────────────────

            // Background
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, cw, ch);

            // Subtle grid
            ctx.strokeStyle = "rgba(50, 50, 50, 0.35)";
            ctx.lineWidth = 0.5;
            for (let mx = -6; mx <= 6; mx++) {
                const gx = toCanvasX(mx);
                ctx.beginPath();
                ctx.moveTo(gx, 0);
                ctx.lineTo(gx, ch);
                ctx.stroke();
            }
            for (let my = -4; my <= 4; my++) {
                const gy = toCanvasY(my);
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.lineTo(cw, gy);
                ctx.stroke();
            }

            // Axes
            ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, originY);
            ctx.lineTo(cw, originY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(originX, 0);
            ctx.lineTo(originX, ch);
            ctx.stroke();

            // Axis labels
            ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
            ctx.font = "300 11px 'Georama', sans-serif";
            ctx.textAlign = "center";
            for (let mx = -5; mx <= 5; mx++) {
                if (mx === 0) continue;
                ctx.fillText(mx.toString(), toCanvasX(mx), originY + 16);
            }
            ctx.textAlign = "right";
            for (let my = -3; my <= 3; my++) {
                if (my === 0) continue;
                ctx.fillText(my.toString(), originX - 8, toCanvasY(my) + 4);
            }

            // Parabola drawing helper
            const drawParabola = (
                da: number, dh: number, dk: number,
                color: string, lw: number, glow: boolean
            ) => {
                ctx.save();
                if (glow) {
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 18;
                }
                ctx.strokeStyle = color;
                ctx.lineWidth = lw;
                ctx.beginPath();

                const steps = cw * 2;
                let started = false;
                for (let i = 0; i <= steps; i++) {
                    const px = (i / steps) * cw;
                    const mathX = (px - originX) / scaleX;
                    const mathY = da * (mathX - dh) * (mathX - dh) + dk;
                    const py = toCanvasY(mathY);

                    // Clip to canvas
                    if (py < -ch || py > ch * 2) {
                        started = false;
                        continue;
                    }
                    if (!started) {
                        ctx.moveTo(px, py);
                        started = true;
                    } else {
                        ctx.lineTo(px, py);
                    }
                }
                ctx.stroke();

                if (glow) {
                    ctx.shadowBlur = 36;
                    ctx.globalAlpha = 0.35;
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }
                ctx.restore();
            };

            // Ghost trails
            ghostTrailsRef.current.forEach((g) => {
                drawParabola(
                    g.a, g.h, g.k,
                    `rgba(160, 190, 255, ${g.opacity * 0.28})`,
                    1, false
                );
            });

            // Main parabola (double-pass glow)
            drawParabola(a, ph, k, "rgba(136, 171, 255, 0.9)", 2, true);
            drawParabola(a, ph, k, "rgba(180, 205, 255, 0.45)", 1, false);

            // ── Axis of symmetry (dashed vertical through vertex) ─────────────
            const vertexCX = toCanvasX(ph);
            ctx.save();
            ctx.strokeStyle = "rgba(136, 171, 255, 0.18)";
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 6]);
            ctx.beginPath();
            ctx.moveTo(vertexCX, 0);
            ctx.lineTo(vertexCX, ch);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // ── Vertex dot ────────────────────────────────────────────────────
            const vertexCY = toCanvasY(k);
            if (vertexCY >= -20 && vertexCY <= ch + 20) {
                // Outer glow ring
                ctx.save();
                ctx.beginPath();
                ctx.arc(vertexCX, vertexCY, 10, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(136, 171, 255, 0.25)";
                ctx.lineWidth = 1;
                ctx.shadowColor = "rgba(136, 171, 255, 0.8)";
                ctx.shadowBlur = 15;
                ctx.stroke();
                ctx.restore();

                // Core dot
                ctx.save();
                ctx.beginPath();
                ctx.arc(vertexCX, vertexCY, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(160, 195, 255, 0.95)";
                ctx.shadowColor = "rgba(136, 171, 255, 1)";
                ctx.shadowBlur = 20;
                ctx.fill();
                ctx.restore();
            }

            // ── Cursor / finger indicator ─────────────────────────────────────
            if (fingerPosRef.current) {
                const fx = fingerPosRef.current.x * cw;
                const fy = fingerPosRef.current.y * ch;
                const active = isPinchingRef.current;
                const cursorColor = active ? "rgba(136, 171, 255, 0.85)" : "rgba(255, 255, 255, 0.35)";

                ctx.save();
                ctx.beginPath();
                ctx.arc(fx, fy, active ? 8 : 5, 0, Math.PI * 2);
                ctx.fillStyle = cursorColor;
                ctx.shadowColor = cursorColor;
                ctx.shadowBlur = active ? 14 : 5;
                ctx.fill();
                ctx.restore();

                if (active) {
                    ctx.save();
                    ctx.strokeStyle = "rgba(136, 171, 255, 0.12)";
                    ctx.lineWidth = 0.5;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(fx, 0);
                    ctx.lineTo(fx, ch);
                    ctx.moveTo(0, fy);
                    ctx.lineTo(cw, fy);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            animFrameRef.current = requestAnimationFrame(render);
        };

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        handleResize();
        window.addEventListener("resize", handleResize);
        animFrameRef.current = requestAnimationFrame(render);

        return () => {
            window.removeEventListener("resize", handleResize);
            cancelAnimationFrame(animFrameRef.current);
        };
    }, [processHands, processMouseInput, inputMode]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (videoRef.current?.srcObject) {
                const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach((t) => t.stop());
            }
        };
    }, []);

    const handleEnableCamera = () => { initMediaPipe(); };

    const handleSwitchToMouse = () => {
        if (videoRef.current?.srcObject) {
            const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
            tracks.forEach((t) => t.stop());
        }
        handLandmarkerRef.current = null;
        setCameraState("idle");
        setInputMode("mouse");
        setHandDetected(false);
    };

    const handleReset = () => {
        targetParamsRef.current = { a: 1, h: 0, k: 0 };
        ghostTrailsRef.current = [];
        prevPinchDistRef.current = null;
    };

    // ── Equation formatting ────────────────────────────────────────────────────
    const formatNum = (n: number, decimals = 2) => {
        const fixed = Math.abs(n).toFixed(decimals);
        return n < 0 ? `−${fixed}` : fixed;
    };

    const formatEquation = () => {
        const { a, h, k } = displayParams;

        // a coefficient
        const aAbs = Math.abs(a).toFixed(2);
        const aStr = Math.abs(a - 1) < 0.015 ? "" : Math.abs(a + 1) < 0.015 ? "−" : `${a < 0 ? "−" : ""}${aAbs}`;

        // (x - h) part
        const hAbs = Math.abs(h).toFixed(2);
        let xPart: string;
        if (Math.abs(h) < 0.015) {
            xPart = "x²";
        } else {
            const hSign = h > 0 ? "−" : "+";
            xPart = `(x ${hSign} ${hAbs})²`;
        }

        // + k part
        const kPart =
            Math.abs(k) < 0.015
                ? ""
                : k > 0
                    ? ` + ${k.toFixed(2)}`
                    : ` − ${Math.abs(k).toFixed(2)}`;

        return `y = ${aStr}${xPart}${kPart}`;
    };

    const cameraStatusText = () => {
        switch (cameraState) {
            case "idle": return "Camera off — using mouse";
            case "loading": return "Starting camera...";
            case "active": return "Camera active";
            case "denied": return "Camera permission denied";
            case "error": return "Camera unavailable";
        }
    };

    const cameraStatusColor = () => {
        switch (cameraState) {
            case "active": return "#00dc96";
            case "denied":
            case "error": return "#ff4444";
            default: return "#848484";
        }
    };

    const geoStyle = {
        fontFamily: "'Georama', sans-serif",
        fontWeight: 300,
        fontVariationSettings: "'wdth' 100",
    } as const;

    return (
        <div className="relative w-full h-full bg-black overflow-hidden">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair" />

            {/* Camera feed */}
            <div
                className={`absolute bottom-6 right-6 z-10 transition-opacity duration-300 ${cameraState === "active" ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
            >
                <div className="rounded-xl overflow-hidden border border-[#2a2a2a] shadow-lg">
                    <video
                        ref={videoRef}
                        className="w-[200px] h-[150px] object-cover block"
                        style={{ transform: "scaleX(-1)" }}
                        playsInline
                        muted
                        autoPlay
                    />
                </div>
                <p className="text-[11px] text-[rgba(255,255,255,0.4)] text-center mt-1.5" style={geoStyle}>
                    CAMERA FEED
                </p>
            </div>

            {/* Info Panel */}
            <div className="absolute left-10 top-1/2 -translate-y-1/2 z-10 w-[340px]" style={geoStyle}>
                <div className="bg-[#141414]/90 rounded-2xl border border-[#2a2a2a] p-5 backdrop-blur-sm">
                    {/* Equation display */}
                    <div className="bg-[#1c1c1c] rounded-xl border border-[#333333] px-6 py-5 flex items-center justify-center mb-5">
                        <p
                            className="text-[20px] text-[rgba(228,228,228,0.85)] tracking-wide leading-tight text-center"
                            style={geoStyle}
                        >
                            {formatEquation()}
                        </p>
                    </div>

                    {/* Parameters */}
                    <div className="flex flex-col gap-3">
                        {[
                            { label: "Stretch (a)", value: displayParams.a.toFixed(2) },
                            { label: "Horizontal shift (h)", value: formatNum(displayParams.h) },
                            { label: "Vertical shift (k)", value: formatNum(displayParams.k) },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between">
                                <span className="text-[14px] text-[rgba(255,255,255,0.75)]" style={geoStyle}>
                                    {label}
                                </span>
                                <span
                                    className="text-[14px] font-mono text-[rgba(136,171,255,0.9)]"
                                    style={{ fontFamily: "'Georama', monospace" }}
                                >
                                    {value}
                                </span>
                            </div>
                        ))}

                        {/* Status indicators */}
                        <div className="mt-2 flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cameraStatusColor() }} />
                                <span className="text-[13px] text-[rgba(255,255,255,0.55)]" style={geoStyle}>
                                    {cameraStatusText()}
                                </span>
                            </div>

                            {inputMode === "camera" && cameraState === "active" && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-1.5 h-1.5 rounded-full shrink-0"
                                            style={{
                                                backgroundColor: handDetected
                                                    ? isPinching ? "#88ABFF" : "#00dc96"
                                                    : "#848484",
                                            }}
                                        />
                                        <span className="text-[13px] text-[rgba(255,255,255,0.55)]" style={geoStyle}>
                                            {handDetected
                                                ? isPinching ? "Pinch active — transforming" : "Hand detected — open"
                                                : "No hand detected"}
                                        </span>
                                    </div>
                                    {/* Palm direction indicator */}
                                    {handDetected && (
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                                style={{ backgroundColor: palmSign > 0 ? "#88ABFF" : "#ff8c6b" }}
                                            />
                                            <span className="text-[13px] text-[rgba(255,255,255,0.55)]" style={geoStyle}>
                                                {palmSign > 0
                                                    ? "Palm facing you — opens ↑"
                                                    : "Palm facing away — flips ↓"}
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}

                            {inputMode === "mouse" && (
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ backgroundColor: isPinching ? "#88ABFF" : "#848484" }}
                                    />
                                    <span className="text-[13px] text-[rgba(255,255,255,0.55)]" style={geoStyle}>
                                        {isPinching ? "Drag: move vertex · Scroll: flip" : "Click drag to move · Scroll to flip"}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mode buttons */}
                    <div className="flex gap-3 mt-5">
                        {inputMode === "mouse" && cameraState !== "active" && (
                            <button
                                onClick={handleEnableCamera}
                                disabled={cameraState === "loading"}
                                className="flex-1 h-10 bg-[#1a2a4a] rounded-[25px] border-[0.5px] border-[#88ABFF44] text-[#88ABFF] text-[12px] tracking-[1px] cursor-pointer hover:bg-[#1f3455] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                style={geoStyle}
                            >
                                {cameraState === "loading" ? "LOADING..." : "ENABLE CAMERA"}
                            </button>
                        )}
                        {inputMode === "camera" && cameraState === "active" && (
                            <button
                                onClick={handleSwitchToMouse}
                                className="flex-1 h-10 bg-[#2a2a2a] rounded-[25px] border-[0.5px] border-[#707070] text-[rgba(255,255,255,0.65)] text-[12px] tracking-[1px] cursor-pointer hover:bg-[#3a3a3a] transition-colors"
                                style={geoStyle}
                            >
                                SWITCH TO MOUSE
                            </button>
                        )}
                        <button
                            onClick={handleReset}
                            className="flex-1 h-10 bg-[#4d4d4d] rounded-[25px] border-[0.5px] border-[#707070] text-white text-[12px] tracking-[1px] cursor-pointer hover:bg-[#5a5a5a] transition-colors"
                            style={geoStyle}
                        >
                            RESET
                        </button>
                    </div>

                    {cameraState === "denied" && (
                        <p className="mt-3 text-[12px] text-[rgba(255,100,100,0.7)]" style={geoStyle}>
                            Camera permission was denied. Check browser settings or use mouse control instead.
                        </p>
                    )}
                </div>
            </div>

            {/* Instructions */}
            <div className="absolute bottom-8 left-10 z-10" style={geoStyle}>
                <ul className="text-[13px] text-[rgba(255,255,255,0.45)] list-disc ml-5 space-y-0.5">
                    {inputMode === "mouse" ? (
                        <>
                            <li>Click and drag to move the vertex (h and k)</li>
                            <li>Scroll wheel up/down to flip &amp; stretch (a)</li>
                        </>
                    ) : (
                        <>
                            <li>Pinch thumb + index to start transforming</li>
                            <li>Hand left/right → h &nbsp;·&nbsp; up/down → k</li>
                            <li>Finger spread (wide/narrow hand) → stretch magnitude</li>
                            <li>Palm toward you = opens ↑ &nbsp;·&nbsp; flip away = opens ↓</li>
                        </>
                    )}
                </ul>
            </div>

            {/* Active indicator */}
            {isPinching && (
                <div className="absolute top-8 right-10 z-10 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#88ABFF] animate-pulse" />
                    <span className="text-[13px] text-[#88ABFF]" style={geoStyle}>
                        TRANSFORMING
                    </span>
                </div>
            )}
        </div>
    );
}
