import { useRef, useEffect, useCallback, useState } from "react";

interface ShapeParams {
    tx: number;
    ty: number;
    scale: number;
    rotation: number;
    reflectX: boolean;
    reflectY: boolean;
}

interface GhostTrail {
    tx: number; ty: number; scale: number; rotation: number;
    reflectX: boolean; reflectY: boolean;
    opacity: number;
}

type CameraState = "idle" | "loading" | "active" | "denied" | "error";
type InputMode = "mouse" | "camera";

// Square is exactly 1×1 math unit
const SQUARE_HALF = 0.5;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const dist3D = (p: any, q: any) => {
    const dx = p.x - q.x, dy = p.y - q.y, dz = (p.z || 0) - (q.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export function ShapeTransformVisualizer() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const animFrameRef = useRef<number>(0);
    const handLandmarkerRef = useRef<any>(null);

    const paramsRef = useRef<ShapeParams>({ tx: 0, ty: 0, scale: 1, rotation: 0, reflectX: false, reflectY: false });
    const targetRef = useRef<ShapeParams>({ tx: 0, ty: 0, scale: 1, rotation: 0, reflectX: false, reflectY: false });

    const smTxRef = useRef(0);
    const smTyRef = useRef(0);
    const smScaleRef = useRef(1);
    const smRotRef = useRef(0);
    const accRotRef = useRef(0);

    const ghostTrailsRef = useRef<GhostTrail[]>([]);
    const lastGhostTimeRef = useRef(0);

    const isPinchingRef = useRef(false);
    const fingerPosRef = useRef<{ x: number; y: number } | null>(null);
    const rawLandmarksRef = useRef<any[] | null>(null);
    const rawLandmarks2Ref = useRef<any[] | null>(null);

    const isMouseDownRef = useRef(false);
    const isRightDownRef = useRef(false);
    const mousePosRef = useRef<{ x: number; y: number } | null>(null);
    const mouseStartRef = useRef<{ x: number; y: number } | null>(null);
    const startTxRef = useRef(0);
    const startTyRef = useRef(0);
    const startRotRef = useRef(0);
    const startMouseRotRef = useRef<{ x: number; y: number } | null>(null);

    const prevPinchDistRef = useRef<number | null>(null);
    const prevHandAngleRef = useRef<number | null>(null);
    const prevScaleRef = useRef(1);

    const smHandRef = useRef({ x: 0.5, y: 0.5 });
    const prevHandPosRef = useRef<{ x: number; y: number } | null>(null);
    const startPinchPosRef = useRef<{ x: number; y: number } | null>(null);
    const startPinchTxRef = useRef(0);
    const startPinchTyRef = useRef(0);

    const [displayParams, setDisplayParams] = useState<ShapeParams>({
        tx: 0, ty: 0, scale: 1, rotation: 0, reflectX: false, reflectY: false,
    });
    const [isPinching, setIsPinching] = useState(false);
    const [cameraState, setCameraState] = useState<CameraState>("idle");
    const [handDetected, setHandDetected] = useState(false);
    const [inputMode, setInputMode] = useState<InputMode>("mouse");

    // Math domain — x: ±5, y: ±3.25
    const MATH_X_RANGE = 10;
    const MATH_Y_RANGE = 6.5;

    // ── MediaPipe ────────────────────────────────────────────────────────────
    const initMediaPipe = useCallback(async () => {
        setCameraState("loading");
        try {
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, facingMode: "user" },
                });
            } catch (permErr: any) {
                setCameraState(permErr.name === "NotAllowedError" || permErr.name === "PermissionDeniedError" ? "denied" : "error");
                return;
            }
            const vision = await import("@mediapipe/tasks-vision");
            const { HandLandmarker, FilesetResolver } = vision;
            const filesetResolver = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
            );
            const modelOpts = (delegate: "GPU" | "CPU") => ({
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                    delegate,
                },
                runningMode: "VIDEO" as const,
                numHands: 2,
            });
            let handLandmarker: any;
            try { handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, modelOpts("GPU")); }
            catch { handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, modelOpts("CPU")); }
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

    // ── Hand processing ────────────────────────────────────────────────────
    const processHands = useCallback(() => {
        if (!handLandmarkerRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
        let results: any;
        try { results = handLandmarkerRef.current.detectForVideo(videoRef.current, performance.now()); }
        catch { return; }

        const hands = results.landmarks ?? [];
        if (hands.length === 0) {
            rawLandmarksRef.current = null;
            rawLandmarks2Ref.current = null;
            setHandDetected(false);
            fingerPosRef.current = null;
            isPinchingRef.current = false;
            setIsPinching(false);
            prevPinchDistRef.current = null;
            prevHandAngleRef.current = null;
            startPinchPosRef.current = null;
            prevHandPosRef.current = null;
            return;
        }

        setHandDetected(true);
        const lm0 = hands[0];
        rawLandmarksRef.current = lm0;
        rawLandmarks2Ref.current = hands[1] ?? null;

        const indexTip0 = lm0[8];
        const thumbTip0 = lm0[4];
        fingerPosRef.current = { x: 1 - indexTip0.x, y: indexTip0.y };
        const pinchDist0 = dist3D(indexTip0, thumbTip0);
        const wasPinching = isPinchingRef.current;
        const pinching = wasPinching ? pinchDist0 < 0.085 : pinchDist0 < 0.055;
        isPinchingRef.current = pinching;
        setIsPinching(pinching);

        if (hands.length >= 2) {
            const lm1 = hands[1];
            const wrist0 = lm0[0]; const wrist1 = lm1[0];
            const dx = (1 - wrist1.x) - (1 - wrist0.x);
            const dy = wrist1.y - wrist0.y;
            const handDist = Math.sqrt(dx * dx + dy * dy);
            const handAngle = Math.atan2(dy, dx);
            if (prevPinchDistRef.current !== null) {
                const newScale = clamp(prevScaleRef.current + (handDist - prevPinchDistRef.current) * 3.5, 0.15, 6);
                targetRef.current.scale = newScale;
                prevScaleRef.current = newScale;
            }
            prevPinchDistRef.current = handDist;
            if (prevHandAngleRef.current !== null) {
                let angleDelta = handAngle - prevHandAngleRef.current;
                if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
                if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;
                accRotRef.current += angleDelta * 1.5;
                targetRef.current.rotation = accRotRef.current;
            }
            prevHandAngleRef.current = handAngle;
        } else {
            prevPinchDistRef.current = null;
            prevHandAngleRef.current = null;
        }

        if (pinching) {
            const wrist0 = lm0[0];
            const wx = 1 - wrist0.x; const wy = wrist0.y;
            const prev = prevHandPosRef.current;
            const sf = prev && Math.sqrt((wx - prev.x) ** 2 + (wy - prev.y) ** 2) > 0.15 ? 0.05 : 0.18;
            smHandRef.current.x = lerp(smHandRef.current.x, wx, sf);
            smHandRef.current.y = lerp(smHandRef.current.y, wy, sf);
            prevHandPosRef.current = { x: wx, y: wy };
            if (!startPinchPosRef.current) {
                startPinchPosRef.current = { ...smHandRef.current };
                startPinchTxRef.current = targetRef.current.tx;
                startPinchTyRef.current = targetRef.current.ty;
            }
            targetRef.current.tx = clamp(startPinchTxRef.current + (smHandRef.current.x - startPinchPosRef.current.x) * MATH_X_RANGE, -4.5, 4.5);
            targetRef.current.ty = clamp(startPinchTyRef.current - (smHandRef.current.y - startPinchPosRef.current.y) * MATH_Y_RANGE, -3, 3);
        } else {
            startPinchPosRef.current = null;
            prevHandPosRef.current = null;
        }
    }, [MATH_X_RANGE, MATH_Y_RANGE]);

    // ── Mouse processing ───────────────────────────────────────────────────
    const processMouseInput = useCallback(() => {
        if (inputMode !== "mouse") return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const toMathX = (px: number) => (px / canvas.width - 0.5) * MATH_X_RANGE;
        const toMathY = (py: number) => (0.5 - py / canvas.height) * MATH_Y_RANGE;

        if (isMouseDownRef.current && mousePosRef.current && mouseStartRef.current) {
            fingerPosRef.current = { x: mousePosRef.current.x / canvas.width, y: mousePosRef.current.y / canvas.height };
            isPinchingRef.current = true;
            setIsPinching(true);
            targetRef.current.tx = clamp(startTxRef.current + toMathX(mousePosRef.current.x) - toMathX(mouseStartRef.current.x), -4.5, 4.5);
            targetRef.current.ty = clamp(startTyRef.current + toMathY(mousePosRef.current.y) - toMathY(mouseStartRef.current.y), -3, 3);
        } else {
            isPinchingRef.current = false;
            setIsPinching(false);
            fingerPosRef.current = mousePosRef.current
                ? { x: mousePosRef.current.x / canvas.width, y: mousePosRef.current.y / canvas.height }
                : null;
        }
        if (isRightDownRef.current && mousePosRef.current && startMouseRotRef.current) {
            const dxPx = mousePosRef.current.x - startMouseRotRef.current.x;
            accRotRef.current = startRotRef.current + dxPx * 0.008;
            targetRef.current.rotation = accRotRef.current;
        }
    }, [inputMode, MATH_X_RANGE, MATH_Y_RANGE]);

    // ── Wheel: scale ──────────────────────────────────────────────────────
    useEffect(() => {
        if (inputMode !== "mouse") return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const next = clamp(targetRef.current.scale + (-e.deltaY * 0.003), 0.1, 6);
            targetRef.current.scale = next;
            prevScaleRef.current = next;
        };
        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => canvas.removeEventListener("wheel", onWheel);
    }, [inputMode]);

    // ── Keyboard: reflect ─────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "r" || e.key === "R") {
                targetRef.current.reflectX = !targetRef.current.reflectX;
                paramsRef.current.reflectX = targetRef.current.reflectX;
                setDisplayParams((p) => ({ ...p, reflectX: targetRef.current.reflectX }));
            }
            if (e.key === "f" || e.key === "F") {
                targetRef.current.reflectY = !targetRef.current.reflectY;
                paramsRef.current.reflectY = targetRef.current.reflectY;
                setDisplayParams((p) => ({ ...p, reflectY: targetRef.current.reflectY }));
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // ── Mouse events ──────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const getPos = (e: MouseEvent) => {
            const r = canvas.getBoundingClientRect();
            return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
        };
        const getTouchPos = (e: TouchEvent) => {
            const r = canvas.getBoundingClientRect(); const t = e.touches[0];
            return { x: ((t.clientX - r.left) / r.width) * canvas.width, y: ((t.clientY - r.top) / r.height) * canvas.height };
        };
        const onMouseDown = (e: MouseEvent) => {
            if (inputMode !== "mouse") return;
            if (e.button === 2) {
                isRightDownRef.current = true;
                startMouseRotRef.current = getPos(e);
                startRotRef.current = accRotRef.current;
            } else {
                isMouseDownRef.current = true;
                const pos = getPos(e);
                mousePosRef.current = pos; mouseStartRef.current = pos;
                startTxRef.current = targetRef.current.tx; startTyRef.current = targetRef.current.ty;
            }
        };
        const onMouseMove = (e: MouseEvent) => { if (inputMode !== "mouse") return; mousePosRef.current = getPos(e); };
        const onMouseUp = (e: MouseEvent) => { if (e.button === 2) { isRightDownRef.current = false; startMouseRotRef.current = null; } else { isMouseDownRef.current = false; } };
        const onCtx = (e: Event) => e.preventDefault();
        const onTouchStart = (e: TouchEvent) => {
            if (inputMode !== "mouse") return;
            isMouseDownRef.current = true;
            const pos = getTouchPos(e); mousePosRef.current = pos; mouseStartRef.current = pos;
            startTxRef.current = targetRef.current.tx; startTyRef.current = targetRef.current.ty;
        };
        const onTouchMove = (e: TouchEvent) => { if (inputMode !== "mouse") return; mousePosRef.current = getTouchPos(e); };
        const onTouchEnd = () => { isMouseDownRef.current = false; };
        const onLeave = () => { mousePosRef.current = null; fingerPosRef.current = null; };

        canvas.addEventListener("mousedown", onMouseDown);
        canvas.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("contextmenu", onCtx);
        canvas.addEventListener("mouseleave", onLeave);
        canvas.addEventListener("touchstart", onTouchStart, { passive: true });
        canvas.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("touchend", onTouchEnd);
        return () => {
            canvas.removeEventListener("mousedown", onMouseDown);
            canvas.removeEventListener("mousemove", onMouseMove);
            canvas.removeEventListener("contextmenu", onCtx);
            canvas.removeEventListener("mouseleave", onLeave);
            canvas.removeEventListener("touchstart", onTouchStart);
            canvas.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("touchend", onTouchEnd);
        };
    }, [inputMode]);

    // ── Render loop ────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        let lastDisplayUpdate = 0;

        const render = (time: number) => {
            const cw = canvas.width;
            const ch = canvas.height;

            if (inputMode === "camera") processHands();
            else processMouseInput();

            const sr = 0.09;
            smTxRef.current = lerp(smTxRef.current, targetRef.current.tx, sr);
            smTyRef.current = lerp(smTyRef.current, targetRef.current.ty, sr);
            smScaleRef.current = lerp(smScaleRef.current, targetRef.current.scale, sr);
            smRotRef.current = lerp(smRotRef.current, targetRef.current.rotation, sr);
            paramsRef.current = {
                tx: smTxRef.current, ty: smTyRef.current,
                scale: smScaleRef.current, rotation: smRotRef.current,
                reflectX: targetRef.current.reflectX, reflectY: targetRef.current.reflectY,
            };
            const p = paramsRef.current;

            // Ghost trails
            const moving = isPinchingRef.current || isRightDownRef.current;
            if (moving && time - lastGhostTimeRef.current > 100) {
                ghostTrailsRef.current.push({ ...p, opacity: 0.5 });
                if (ghostTrailsRef.current.length > 12) ghostTrailsRef.current.shift();
                lastGhostTimeRef.current = time;
            }
            ghostTrailsRef.current = ghostTrailsRef.current
                .map((g) => ({ ...g, opacity: g.opacity * 0.96 }))
                .filter((g) => g.opacity > 0.02);

            if (time - lastDisplayUpdate > 80) {
                setDisplayParams({ ...p });
                lastDisplayUpdate = time;
            }

            // ── Clear ────────────────────────────────────────────────────
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, cw, ch);

            const scaleX = cw / MATH_X_RANGE;
            const scaleY = ch / MATH_Y_RANGE;
            const ox = cw / 2;
            const oy = ch / 2;
            const toCanX = (mx: number) => ox + mx * scaleX;
            const toCanY = (my: number) => oy - my * scaleY;

            // ── Grid ─────────────────────────────────────────────────────
            // Minor grid (every 1 unit)
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
            for (let mx = -5; mx <= 5; mx++) {
                const gx = toCanX(mx);
                ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, ch); ctx.stroke();
            }
            for (let my = -3; my <= 3; my++) {
                const gy = toCanY(my);
                ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cw, gy); ctx.stroke();
            }

            // ── Axes ─────────────────────────────────────────────────────
            ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(cw, oy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, ch); ctx.stroke();

            // ── Axis labels ───────────────────────────────────────────────
            ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
            ctx.font = "300 12px 'Georama', sans-serif";
            ctx.textAlign = "center";
            for (let mx = -4; mx <= 4; mx++) {
                if (mx === 0) continue;
                ctx.fillText(mx.toString(), toCanX(mx), oy + 18);
            }
            ctx.textAlign = "right";
            for (let my = -3; my <= 3; my++) {
                if (my === 0) continue;
                ctx.fillText(my.toString(), ox - 8, toCanY(my) + 4);
            }

            // ── Draw square helper (using explicit polygon, no ctx.scale trick) ─
            // This avoids shadow bleed. We compute the 4 corner pixels directly.
            const drawSquarePoly = (
                dtx: number, dty: number, dscale: number, drot: number,
                drX: boolean, drY: boolean,
                color: string, lw: number, glowColor?: string, glowSize?: number, dash?: number[]
            ) => {
                const half = SQUARE_HALF * dscale;
                const effectiveRotX = drX ? -1 : 1;
                const effectiveRotY = drY ? -1 : 1;

                // Local corners in math units
                const localCorners: [number, number][] = [
                    [-half * effectiveRotX, -half * effectiveRotY],
                    [half * effectiveRotX, -half * effectiveRotY],
                    [half * effectiveRotX, half * effectiveRotY],
                    [-half * effectiveRotX, half * effectiveRotY],
                ];

                // Rotate and translate → canvas pixels
                const cosR = Math.cos(drot);
                const sinR = Math.sin(drot);
                const corners = localCorners.map(([lx, ly]) => {
                    const rx = lx * cosR - ly * sinR;
                    const ry = lx * sinR + ly * cosR;
                    return [toCanX(dtx + rx), toCanY(dty + ry)] as [number, number];
                });

                ctx.save();
                if (dash) ctx.setLineDash(dash);
                ctx.strokeStyle = color;
                ctx.lineWidth = lw;
                if (glowColor && glowSize) {
                    ctx.shadowColor = glowColor;
                    ctx.shadowBlur = glowSize;
                }
                ctx.beginPath();
                corners.forEach(([cx, cy], i) => { if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy); });
                ctx.closePath();
                ctx.stroke();
                ctx.restore();
            };

            // Ghost origin square at (0,0)
            drawSquarePoly(0, 0, 1, 0, false, false, "rgba(255,255,255,0.1)", 1, undefined, undefined, [5, 5]);

            // Trail ghosts
            ghostTrailsRef.current.forEach((g) => {
                drawSquarePoly(g.tx, g.ty, g.scale, g.rotation, g.reflectX, g.reflectY,
                    `rgba(136,171,255,${g.opacity * 0.35})`, 1);
            });

            // Main square — crisp white outline, subtle glow
            drawSquarePoly(p.tx, p.ty, p.scale, p.rotation, p.reflectX, p.reflectY,
                "rgba(255,255,255,0.92)", 1.5, "rgba(136,171,255,0.6)", 6);

            // Pivot dot
            const pivX = toCanX(p.tx);
            const pivY = toCanY(p.ty);
            ctx.save();
            ctx.beginPath(); ctx.arc(pivX, pivY, 3, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(136,171,255,0.9)";
            ctx.shadowColor = "rgba(136,171,255,0.8)";
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.restore();

            // Dashed line from origin to pivot
            if (Math.abs(p.tx) > 0.05 || Math.abs(p.ty) > 0.05) {
                ctx.save();
                ctx.strokeStyle = "rgba(136,171,255,0.15)";
                ctx.lineWidth = 0.5;
                ctx.setLineDash([3, 5]);
                ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(pivX, pivY);
                ctx.stroke();
                ctx.restore();
            }

            // ── Hand skeleton ────────────────────────────────────────────
            const drawSkeleton = (lm: any[], alpha: number) => {
                const lx = (i: number) => (1 - lm[i].x) * cw;
                const ly = (i: number) => lm[i].y * ch;
                const pinchA = isPinchingRef.current;
                const jc = `rgba(136,171,255,${alpha})`;
                const chains = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]];
                const palmLinks = [[0, 5], [5, 9], [9, 13], [13, 17], [0, 17]];
                ctx.save();
                ctx.lineCap = "round";
                ctx.strokeStyle = `rgba(136,171,255,${alpha * 0.4})`;
                ctx.lineWidth = 1.5;
                ctx.shadowBlur = 0;
                ctx.beginPath();
                for (const chain of chains) for (let i = 0; i < chain.length - 1; i++) { ctx.moveTo(lx(chain[i]), ly(chain[i])); ctx.lineTo(lx(chain[i + 1]), ly(chain[i + 1])); }
                for (const [a, b] of palmLinks) { ctx.moveTo(lx(a), ly(a)); ctx.lineTo(lx(b), ly(b)); }
                ctx.stroke();
                ctx.fillStyle = jc;
                for (let i = 0; i < 21; i++) { ctx.beginPath(); ctx.arc(lx(i), ly(i), [4, 8, 12, 16, 20].includes(i) ? 3 : 1.5, 0, Math.PI * 2); ctx.fill(); }
                if (pinchA) {
                    ctx.fillStyle = "rgba(255,255,255,0.9)";
                    ctx.shadowColor = jc; ctx.shadowBlur = 10;
                    ctx.beginPath(); ctx.arc(lx(4), ly(4), 5, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(lx(8), ly(8), 5, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            };
            if (inputMode === "camera") {
                if (rawLandmarksRef.current) drawSkeleton(rawLandmarksRef.current, 0.45);
                if (rawLandmarks2Ref.current) drawSkeleton(rawLandmarks2Ref.current, 0.3);
            }

            // Mouse cursor dot
            if (fingerPosRef.current && inputMode !== "camera") {
                const fx = fingerPosRef.current.x * cw;
                const fy = fingerPosRef.current.y * ch;
                const active = isPinchingRef.current;
                ctx.save();
                ctx.beginPath(); ctx.arc(fx, fy, active ? 6 : 4, 0, Math.PI * 2);
                ctx.fillStyle = active ? "rgba(136,171,255,0.85)" : "rgba(255,255,255,0.3)";
                ctx.shadowColor = active ? "rgba(136,171,255,0.6)" : "none";
                ctx.shadowBlur = active ? 8 : 0;
                ctx.fill();
                ctx.restore();
            }

            animFrameRef.current = requestAnimationFrame(render);
        };

        const handleResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        handleResize();
        window.addEventListener("resize", handleResize);
        animFrameRef.current = requestAnimationFrame(render);
        return () => { window.removeEventListener("resize", handleResize); cancelAnimationFrame(animFrameRef.current); };
    }, [processHands, processMouseInput, inputMode, MATH_X_RANGE, MATH_Y_RANGE]);

    useEffect(() => {
        return () => {
            if (videoRef.current?.srcObject) {
                const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach((t) => t.stop());
            }
        };
    }, []);

    const handleEnableCamera = () => initMediaPipe();
    const handleSwitchToMouse = () => {
        if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        handLandmarkerRef.current = null;
        setCameraState("idle"); setInputMode("mouse"); setHandDetected(false);
    };
    const handleReset = () => {
        targetRef.current = { tx: 0, ty: 0, scale: 1, rotation: 0, reflectX: false, reflectY: false };
        accRotRef.current = 0; prevScaleRef.current = 1;
        prevPinchDistRef.current = null; prevHandAngleRef.current = null;
        ghostTrailsRef.current = [];
    };
    const handleToggleReflectX = () => {
        targetRef.current.reflectX = !targetRef.current.reflectX;
        paramsRef.current.reflectX = targetRef.current.reflectX;
        setDisplayParams((p) => ({ ...p, reflectX: targetRef.current.reflectX }));
    };
    const handleToggleReflectY = () => {
        targetRef.current.reflectY = !targetRef.current.reflectY;
        paramsRef.current.reflectY = targetRef.current.reflectY;
        setDisplayParams((p) => ({ ...p, reflectY: targetRef.current.reflectY }));
    };

    const cameraStatusText = () => ({ idle: "Camera off — using mouse", loading: "Starting camera...", active: "Camera active", denied: "Camera permission denied", error: "Camera unavailable" }[cameraState]);
    const cameraStatusColor = () => ({ active: "#00dc96", denied: "#ff4444", error: "#ff4444", idle: "#848484", loading: "#848484" }[cameraState]);

    const geoStyle = { fontFamily: "'Georama', sans-serif", fontWeight: 300, fontVariationSettings: "'wdth' 100" } as const;

    const rotDeg = ((displayParams.rotation * 180 / Math.PI) % 360).toFixed(1);

    // 2x2 transform matrix components
    const cosR = Math.cos(displayParams.rotation);
    const sinR = Math.sin(displayParams.rotation);
    const sx = displayParams.scale * (displayParams.reflectX ? -1 : 1);
    const sy = displayParams.scale * (displayParams.reflectY ? -1 : 1);
    const m00 = (sx * cosR).toFixed(2);
    const m01 = (-sy * sinR).toFixed(2);
    const m10 = (sx * sinR).toFixed(2);
    const m11 = (sy * cosR).toFixed(2);

    return (
        <div className="relative w-full h-full bg-black overflow-hidden">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair" />

            {/* Camera feed */}
            <div className={`absolute bottom-6 right-6 z-10 transition-opacity duration-300 ${cameraState === "active" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                <div className="rounded-xl overflow-hidden border border-[#2a2a2a]">
                    <video ref={videoRef} className="w-[180px] h-[130px] object-cover block" style={{ transform: "scaleX(-1)" }} playsInline muted autoPlay />
                </div>
                <p className="text-[10px] text-[rgba(255,255,255,0.35)] text-center mt-1" style={geoStyle}>CAMERA FEED</p>
            </div>

            {/* Info Panel */}
            <div className="absolute left-10 top-1/2 -translate-y-1/2 z-10 w-[340px]" style={geoStyle}>
                <div className="bg-[#141414]/90 rounded-2xl border border-[#2a2a2a] p-5 backdrop-blur-sm">

                    {/* Matrix display — styled like the equation box in other modes */}
                    <div className="bg-[#1c1c1c] rounded-xl border border-[#333333] px-6 py-5 flex flex-col items-center justify-center mb-5">
                        <p className="text-[11px] text-[rgba(255,255,255,0.35)] tracking-[1.5px] mb-3 self-start" style={geoStyle}>TRANSFORM MATRIX</p>
                        <div className="flex flex-col gap-1 text-[20px] text-[rgba(228,228,228,0.85)]" style={geoStyle}>
                            <div className="flex gap-8">
                                <span className="w-[56px] text-right">{m00}</span>
                                <span className="w-[56px] text-right">{m01}</span>
                            </div>
                            <div className="flex gap-8">
                                <span className="w-[56px] text-right">{m10}</span>
                                <span className="w-[56px] text-right">{m11}</span>
                            </div>
                        </div>
                    </div>

                    {/* Parameters */}
                    <div className="flex flex-col gap-3.5">
                        {[
                            { label: "Scale Factor", val: displayParams.scale.toFixed(2) + "×" },
                            { label: "Rotation", val: rotDeg + "°" },
                            { label: "Translation X", val: displayParams.tx.toFixed(2) },
                            { label: "Translation Y", val: displayParams.ty.toFixed(2) },
                            { label: "Reflection", val: displayParams.reflectX || displayParams.reflectY ? [displayParams.reflectX && "Y-axis", displayParams.reflectY && "X-axis"].filter(Boolean).join(", ") : "none" },
                        ].map(({ label, val }) => (
                            <div key={label} className="flex items-center justify-between">
                                <span className="text-[15px] text-[rgba(255,255,255,0.85)]" style={geoStyle}>{label}</span>
                                <span className="text-[15px] text-[rgba(255,255,255,0.85)]" style={geoStyle}>{val}</span>
                            </div>
                        ))}
                    </div>



                    {/* Reflect toggles */}
                    <div className="flex gap-3 mt-5">
                        <button onClick={handleToggleReflectX}
                            className={`flex-1 h-10 rounded-[25px] text-[13px] tracking-[1px] cursor-pointer transition-all duration-200 border ${displayParams.reflectX ? "bg-[#88ABFF]/15 text-[#88ABFF] border-[#88ABFF]/30" : "bg-[#1e1e1e] text-[rgba(255,255,255,0.5)] border-[#333]"}`}
                            style={geoStyle}>REFLECT Y-AXIS</button>
                        <button onClick={handleToggleReflectY}
                            className={`flex-1 h-10 rounded-[25px] text-[13px] tracking-[1px] cursor-pointer transition-all duration-200 border ${displayParams.reflectY ? "bg-[#88ABFF]/15 text-[#88ABFF] border-[#88ABFF]/30" : "bg-[#1e1e1e] text-[rgba(255,255,255,0.5)] border-[#333]"}`}
                            style={geoStyle}>REFLECT X-AXIS</button>
                    </div>

                    {/* Camera / Reset */}
                    <div className="flex gap-3 mt-3">
                        {inputMode === "mouse" && cameraState !== "active" && (
                            <button onClick={handleEnableCamera} disabled={cameraState === "loading"}
                                className="flex-1 h-10 bg-[#1a2a4a] rounded-[25px] border-[0.5px] border-[#88ABFF44] text-[#88ABFF] text-[13px] tracking-[1px] cursor-pointer hover:bg-[#1f3455] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                style={geoStyle}>{cameraState === "loading" ? "LOADING..." : "ENABLE CAMERA"}</button>
                        )}
                        {inputMode === "camera" && cameraState === "active" && (
                            <button onClick={handleSwitchToMouse}
                                className="flex-1 h-10 bg-[#2a2a2a] rounded-[25px] border-[0.5px] border-[#707070] text-[rgba(255,255,255,0.65)] text-[13px] tracking-[1px] cursor-pointer hover:bg-[#3a3a3a] transition-colors"
                                style={geoStyle}>SWITCH TO MOUSE</button>
                        )}
                        <button onClick={handleReset}
                            className="flex-1 h-10 bg-[#4d4d4d] rounded-[25px] border-[0.5px] border-[#707070] text-white text-[13px] tracking-[1px] cursor-pointer hover:bg-[#5a5a5a] transition-colors"
                            style={geoStyle}>RESET</button>
                    </div>

                    {cameraState === "denied" && (
                        <p className="mt-3 text-[12px] text-[rgba(255,100,100,0.7)]" style={geoStyle}>Camera permission denied. Check browser settings or use mouse mode.</p>
                    )}
                </div>
            </div>

            {/* Instructions */}
            <div className="absolute bottom-8 left-10 z-10" style={geoStyle}>
                <ul className="text-[13px] text-[rgba(255,255,255,0.55)] list-disc ml-5 space-y-0.5" style={geoStyle}>
                    {inputMode === "mouse" ? (
                        <>
                            <li>Left drag — translate square</li>
                            <li>Scroll wheel — scale</li>
                            <li>Right drag — rotate</li>
                            <li>Press R / F — toggle reflections</li>
                        </>
                    ) : (
                        <>
                            <li>Pinch + drag (one hand) — translate</li>
                            <li>Spread two hands apart — scale</li>
                            <li>Tilt angle between two hands — rotate</li>
                            <li>Use panel buttons to reflect</li>
                        </>
                    )}
                </ul>
            </div>

            {isPinching && (
                <div className="absolute top-8 right-10 z-10 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#88ABFF] animate-pulse" />
                    <span className="text-[13px] text-[#88ABFF]" style={geoStyle}>TRANSFORMING</span>
                </div>
            )}
        </div>
    );
}
