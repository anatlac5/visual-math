import { useRef, useEffect, useCallback, useState } from "react";

interface WaveParams {
    amplitude: number;
    phaseShift: number;
}

interface GhostTrail {
    amplitude: number;
    phaseShift: number;
    opacity: number;
}

type CameraState = "idle" | "loading" | "active" | "denied" | "error";
type InputMode = "mouse" | "camera";

export function SineWaveVisualizer() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const animFrameRef = useRef<number>(0);
    const handLandmarkerRef = useRef<any>(null);

    // Wave parameters
    const paramsRef = useRef<WaveParams>({ amplitude: 1, phaseShift: 0 });
    const targetParamsRef = useRef<WaveParams>({ amplitude: 1, phaseShift: 0 });
    const smoothedHandRef = useRef({ x: 0.5, y: 0.5 });
    const isPinchingRef = useRef(false);
    const ghostTrailsRef = useRef<GhostTrail[]>([]);
    const lastGhostTimeRef = useRef(0);

    const [displayParams, setDisplayParams] = useState<WaveParams>({
        amplitude: 1,
        phaseShift: 0,
    });
    const [isPinching, setIsPinching] = useState(false);
    const [cameraState, setCameraState] = useState<CameraState>("idle");
    const [handDetected, setHandDetected] = useState(false);
    const [inputMode, setInputMode] = useState<InputMode>("mouse");
    const fingerPosRef = useRef<{ x: number; y: number } | null>(null);

    // Mouse/touch interaction refs
    const isMouseDownRef = useRef(false);
    const mousePosRef = useRef<{ x: number; y: number } | null>(null);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    // Initialize MediaPipe — only called on user action
    const initMediaPipe = useCallback(async () => {
        setCameraState("loading");

        try {
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, facingMode: "user" },
                });
            } catch (permErr: any) {
                if (
                    permErr.name === "NotAllowedError" ||
                    permErr.name === "PermissionDeniedError"
                ) {
                    setCameraState("denied");
                } else {
                    setCameraState("error");
                }
                console.warn("Camera access failed:", permErr.message);
                return;
            }

            const vision = await import("@mediapipe/tasks-vision");
            const { HandLandmarker, FilesetResolver } = vision;

            const filesetResolver = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
            );

            let handLandmarker: any;

            try {
                handLandmarker = await HandLandmarker.createFromOptions(
                    filesetResolver,
                    {
                        baseOptions: {
                            modelAssetPath:
                                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                            delegate: "GPU",
                        },
                        runningMode: "VIDEO",
                        numHands: 1,
                    }
                );
            } catch {
                console.warn("GPU delegate unavailable, falling back to CPU");
                handLandmarker = await HandLandmarker.createFromOptions(
                    filesetResolver,
                    {
                        baseOptions: {
                            modelAssetPath:
                                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                            delegate: "CPU",
                        },
                        runningMode: "VIDEO",
                        numHands: 1,
                    }
                );
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

    const processHands = useCallback(() => {
        if (
            !handLandmarkerRef.current ||
            !videoRef.current ||
            videoRef.current.readyState < 2
        )
            return;

        let results: any;
        try {
            results = handLandmarkerRef.current.detectForVideo(
                videoRef.current,
                performance.now()
            );
        } catch {
            return;
        }

        if (results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0];
            const indexTip = landmarks[8];
            const thumbTip = landmarks[4];

            fingerPosRef.current = { x: 1 - indexTip.x, y: indexTip.y };

            const dx = indexTip.x - thumbTip.x;
            const dy = indexTip.y - thumbTip.y;
            const dz = (indexTip.z || 0) - (thumbTip.z || 0);
            const pinchDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const pinching = pinchDist < 0.06;

            isPinchingRef.current = pinching;
            setIsPinching(pinching);
            setHandDetected(true);

            if (pinching) {
                const smoothFactor = 0.15;
                smoothedHandRef.current.x = lerp(
                    smoothedHandRef.current.x,
                    1 - indexTip.x,
                    smoothFactor
                );
                smoothedHandRef.current.y = lerp(
                    smoothedHandRef.current.y,
                    indexTip.y,
                    smoothFactor
                );

                targetParamsRef.current.phaseShift =
                    (smoothedHandRef.current.x - 0.5) * 2 * Math.PI;
                targetParamsRef.current.amplitude =
                    0.2 + (1 - smoothedHandRef.current.y) * 2.8;
            }
        } else {
            setHandDetected(false);
            fingerPosRef.current = null;
        }
    }, []);

    const processMouseInput = useCallback(() => {
        if (inputMode !== "mouse") return;

        if (isMouseDownRef.current && mousePosRef.current) {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const nx = mousePosRef.current.x / canvas.width;
            const ny = mousePosRef.current.y / canvas.height;

            fingerPosRef.current = { x: nx, y: ny };
            isPinchingRef.current = true;
            setIsPinching(true);

            const smoothFactor = 0.15;
            smoothedHandRef.current.x = lerp(
                smoothedHandRef.current.x,
                nx,
                smoothFactor
            );
            smoothedHandRef.current.y = lerp(
                smoothedHandRef.current.y,
                ny,
                smoothFactor
            );

            targetParamsRef.current.phaseShift =
                (smoothedHandRef.current.x - 0.5) * 2 * Math.PI;
            targetParamsRef.current.amplitude =
                0.2 + (1 - smoothedHandRef.current.y) * 2.8;
        } else {
            if (inputMode === "mouse") {
                isPinchingRef.current = false;
                setIsPinching(false);
                fingerPosRef.current = mousePosRef.current
                    ? {
                        x: mousePosRef.current.x / (canvasRef.current?.width || 1),
                        y: mousePosRef.current.y / (canvasRef.current?.height || 1),
                    }
                    : null;
            }
        }
    }, [inputMode]);

    // Mouse/touch event handlers
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
            mousePosRef.current = getPos(e);
        };
        const onMouseMove = (e: MouseEvent) => {
            if (inputMode !== "mouse") return;
            mousePosRef.current = getPos(e);
        };
        const onMouseUp = () => { isMouseDownRef.current = false; };
        const onTouchStart = (e: TouchEvent) => {
            if (inputMode !== "mouse") return;
            isMouseDownRef.current = true;
            mousePosRef.current = getTouchPos(e);
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

    // Main render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d")!;
        let lastDisplayUpdate = 0;

        const render = (time: number) => {
            const w = canvas.width;
            const h = canvas.height;

            if (inputMode === "camera") {
                processHands();
            } else {
                processMouseInput();
            }

            const smoothRate = 0.08;
            paramsRef.current.amplitude = lerp(
                paramsRef.current.amplitude,
                targetParamsRef.current.amplitude,
                smoothRate
            );
            paramsRef.current.phaseShift = lerp(
                paramsRef.current.phaseShift,
                targetParamsRef.current.phaseShift,
                smoothRate
            );

            const { amplitude, phaseShift } = paramsRef.current;

            if (isPinchingRef.current && time - lastGhostTimeRef.current > 120) {
                ghostTrailsRef.current.push({ amplitude, phaseShift, opacity: 0.3 });
                if (ghostTrailsRef.current.length > 12) {
                    ghostTrailsRef.current.shift();
                }
                lastGhostTimeRef.current = time;
            }

            ghostTrailsRef.current = ghostTrailsRef.current
                .map((g) => ({ ...g, opacity: g.opacity * 0.97 }))
                .filter((g) => g.opacity > 0.02);

            if (time - lastDisplayUpdate > 100) {
                setDisplayParams({ amplitude, phaseShift });
                lastDisplayUpdate = time;
            }

            // Clear
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, w, h);

            const centerX = w / 2;
            const centerY = h / 2;
            const scaleX = w / (4 * Math.PI);
            const scaleY = h / 8;

            // Grid
            ctx.strokeStyle = "rgba(60, 60, 60, 0.4)";
            ctx.lineWidth = 0.5;
            for (let i = -4; i <= 4; i++) {
                const x = centerX + (i * Math.PI * scaleX) / 2;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
            for (let i = -4; i <= 4; i++) {
                const y = centerY + i * scaleY;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // Axes
            ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, centerY);
            ctx.lineTo(w, centerY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(centerX, 0);
            ctx.lineTo(centerX, h);
            ctx.stroke();

            // Labels
            ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
            ctx.font = "300 12px 'Georama', sans-serif";
            ctx.textAlign = "center";
            [
                { val: -2, label: "-2π" },
                { val: -1, label: "-π" },
                { val: 1, label: "π" },
                { val: 2, label: "2π" },
            ].forEach(({ val, label }) => {
                ctx.fillText(label, centerX + val * Math.PI * scaleX, centerY + 20);
            });

            ctx.textAlign = "right";
            for (let i = -3; i <= 3; i++) {
                if (i === 0) continue;
                ctx.fillText(i.toString(), centerX - 10, centerY - i * scaleY + 4);
            }

            // Wave drawing helper
            const drawWave = (
                a: number,
                c: number,
                color: string,
                lw: number,
                glow: boolean
            ) => {
                ctx.save();
                if (glow) {
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 20;
                }
                ctx.strokeStyle = color;
                ctx.lineWidth = lw;
                ctx.beginPath();

                const steps = w * 2;
                for (let i = 0; i <= steps; i++) {
                    const px = (i / steps) * w;
                    const mathX = (px - centerX) / scaleX;
                    const mathY = a * Math.sin(mathX - c);
                    const py = centerY - mathY * scaleY;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();

                if (glow) {
                    ctx.shadowBlur = 40;
                    ctx.globalAlpha = 0.4;
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }
                ctx.restore();
            };

            // Ghost trails
            ghostTrailsRef.current.forEach((ghost) => {
                drawWave(
                    ghost.amplitude,
                    ghost.phaseShift,
                    `rgba(136, 171, 255, ${ghost.opacity * 0.3})`,
                    1,
                    false
                );
            });

            // Main wave
            drawWave(amplitude, phaseShift, "rgba(136, 171, 255, 0.9)", 2, true);
            drawWave(amplitude, phaseShift, "rgba(180, 200, 255, 0.5)", 1, false);

            // Cursor indicator
            if (fingerPosRef.current) {
                const fx = fingerPosRef.current.x * w;
                const fy = fingerPosRef.current.y * h;
                const active = isPinchingRef.current;
                const cursorColor = active
                    ? "rgba(136, 171, 255, 0.8)"
                    : "rgba(255, 255, 255, 0.4)";

                ctx.save();
                ctx.beginPath();
                ctx.arc(fx, fy, active ? 8 : 5, 0, Math.PI * 2);
                ctx.fillStyle = cursorColor;
                ctx.shadowColor = cursorColor;
                ctx.shadowBlur = active ? 15 : 5;
                ctx.fill();
                ctx.restore();

                if (active) {
                    ctx.save();
                    ctx.strokeStyle = "rgba(136, 171, 255, 0.15)";
                    ctx.lineWidth = 0.5;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(fx, 0);
                    ctx.lineTo(fx, h);
                    ctx.moveTo(0, fy);
                    ctx.lineTo(w, fy);
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
        targetParamsRef.current = { amplitude: 1, phaseShift: 0 };
        ghostTrailsRef.current = [];
    };

    const formatNum = (n: number) => {
        const sign = n < 0 ? "-" : "";
        return sign + Math.abs(n).toFixed(2);
    };

    const formatEquation = () => {
        const a = displayParams.amplitude;
        const c = displayParams.phaseShift;
        const aStr = Math.abs(a - 1) < 0.01 ? "" : formatNum(a) + " ";
        if (Math.abs(c) < 0.01) return `y = ${aStr}sin(x)`;
        const cSign = c > 0 ? "-" : "+";
        return `y = ${aStr}sin(x ${cSign} ${Math.abs(c).toFixed(2)})`;
    };

    const geoStyle = {
        fontFamily: "'Georama', sans-serif",
        fontWeight: 300,
        fontVariationSettings: "'wdth' 100",
    } as const;

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

    return (
        <div className="relative w-full h-full bg-black overflow-hidden">
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full cursor-crosshair"
            />



            {/* Camera feed preview */}
            <div
                className={`absolute bottom-6 right-6 z-10 transition-opacity duration-300 ${cameraState === "active"
                    ? "opacity-100"
                    : "opacity-0 pointer-events-none"
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
                <p
                    className="text-[11px] text-[rgba(255,255,255,0.4)] text-center mt-1.5"
                    style={geoStyle}
                >
                    CAMERA FEED
                </p>
            </div>

            {/* Info Panel */}
            <div className="absolute left-10 top-1/2 -translate-y-1/2 z-10 w-[340px]" style={geoStyle}>
                <div className="bg-[#141414]/90 rounded-2xl border border-[#2a2a2a] p-5 backdrop-blur-sm">
                    {/* Equation */}
                    <div className="bg-[#1c1c1c] rounded-xl border border-[#333333] px-6 py-5 flex items-center justify-center mb-5">
                        <p
                            className="text-[22px] text-[rgba(228,228,228,0.85)] tracking-wide"
                            style={geoStyle}
                        >
                            {formatEquation()}
                        </p>
                    </div>

                    {/* Parameters */}
                    <div className="flex flex-col gap-3.5">
                        <div className="flex items-center justify-between">
                            <span
                                className="text-[15px] text-[rgba(255,255,255,0.85)]"
                                style={geoStyle}
                            >
                                Amplitude (A)
                            </span>
                            <span
                                className="text-[15px] text-[rgba(255,255,255,0.85)]"
                                style={geoStyle}
                            >
                                {displayParams.amplitude.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span
                                className="text-[15px] text-[rgba(255,255,255,0.85)]"
                                style={geoStyle}
                            >
                                Phase Shift (C)
                            </span>
                            <span
                                className="text-[15px] text-[rgba(255,255,255,0.85)]"
                                style={geoStyle}
                            >
                                {formatNum(displayParams.phaseShift)}
                            </span>
                        </div>

                        {/* Status indicators */}
                        <div className="mt-3 flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: cameraStatusColor() }}
                                />
                                <span
                                    className="text-[13px] text-[rgba(255,255,255,0.65)]"
                                    style={geoStyle}
                                >
                                    {cameraStatusText()}
                                </span>
                            </div>

                            {inputMode === "camera" && cameraState === "active" && (
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{
                                            backgroundColor: handDetected
                                                ? isPinching
                                                    ? "#88ABFF"
                                                    : "#00dc96"
                                                : "#848484",
                                        }}
                                    />
                                    <span
                                        className="text-[13px] text-[rgba(255,255,255,0.65)]"
                                        style={geoStyle}
                                    >
                                        {handDetected
                                            ? isPinching
                                                ? "Pinch active — transforming"
                                                : "Hand detected — open"
                                            : "No hand detected"}
                                    </span>
                                </div>
                            )}

                            {inputMode === "mouse" && (
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{
                                            backgroundColor: isPinching ? "#88ABFF" : "#848484",
                                        }}
                                    />
                                    <span
                                        className="text-[13px] text-[rgba(255,255,255,0.65)]"
                                        style={geoStyle}
                                    >
                                        {isPinching
                                            ? "Click active — transforming"
                                            : "Click + drag to transform"}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mode buttons */}
                    <div className="flex gap-3 mt-6">
                        {inputMode === "mouse" && cameraState !== "active" && (
                            <button
                                onClick={handleEnableCamera}
                                disabled={cameraState === "loading"}
                                className="flex-1 h-10 bg-[#1a2a4a] rounded-[25px] border-[0.5px] border-[#88ABFF44] text-[#88ABFF] text-[13px] tracking-[1px] cursor-pointer hover:bg-[#1f3455] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                style={geoStyle}
                            >
                                {cameraState === "loading" ? "LOADING..." : "ENABLE CAMERA"}
                            </button>
                        )}
                        {inputMode === "camera" && cameraState === "active" && (
                            <button
                                onClick={handleSwitchToMouse}
                                className="flex-1 h-10 bg-[#2a2a2a] rounded-[25px] border-[0.5px] border-[#707070] text-[rgba(255,255,255,0.65)] text-[13px] tracking-[1px] cursor-pointer hover:bg-[#3a3a3a] transition-colors"
                                style={geoStyle}
                            >
                                SWITCH TO MOUSE
                            </button>
                        )}
                        <button
                            onClick={handleReset}
                            className="flex-1 h-10 bg-[#4d4d4d] rounded-[25px] border-[0.5px] border-[#707070] text-white text-[13px] tracking-[1px] cursor-pointer hover:bg-[#5a5a5a] transition-colors"
                            style={geoStyle}
                        >
                            RESET
                        </button>
                    </div>

                    {cameraState === "denied" && (
                        <p
                            className="mt-3 text-[12px] text-[rgba(255,100,100,0.7)]"
                            style={geoStyle}
                        >
                            Camera permission was denied. Check browser settings or use mouse
                            control instead.
                        </p>
                    )}
                </div>
            </div>

            {/* Instructions */}
            <div className="absolute bottom-8 left-10 z-10" style={geoStyle}>
                <ul
                    className="text-[13px] text-[rgba(255,255,255,0.55)] list-disc ml-5 space-y-0.5"
                    style={geoStyle}
                >
                    {inputMode === "mouse" ? (
                        <>
                            <li>Click and drag on the canvas to transform the wave</li>
                            <li>Horizontal movement shifts phase</li>
                            <li>Vertical movement changes amplitude</li>
                            <li>Release to freeze current state</li>
                        </>
                    ) : (
                        <>
                            <li>Pinch thumb + index finger to transform the wave</li>
                            <li>Move hand left/right to shift phase</li>
                            <li>Move hand up/down to change amplitude</li>
                            <li>Release pinch to freeze current state</li>
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
