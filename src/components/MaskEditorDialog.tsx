import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Redo2, RotateCcw, Undo2, WandSparkles } from "lucide-react";

import type { MaskDraft } from "../domain/generation/mask";
import { Button, Dialog, Field, IconButton, SegmentedControl, StatusMessage } from "./ui";

type MaskMode = "brush" | "erase";
interface MaskPoint { x: number; y: number }
interface MaskStroke { mode: MaskMode; size: number; points: MaskPoint[] }

function drawStroke(context: CanvasRenderingContext2D, stroke: MaskStroke): void {
  if (stroke.points.length === 0) return;
  context.save();
  context.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.mode === "erase" ? "rgba(0,0,0,1)" : "rgba(37,99,235,0.48)";
  context.lineWidth = stroke.size;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
  for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
  if (stroke.points.length === 1) context.lineTo(stroke.points[0]!.x + 0.01, stroke.points[0]!.y);
  context.stroke();
  context.restore();
}

function drawStrokes(canvas: HTMLCanvasElement, strokes: MaskStroke[]): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) drawStroke(context, stroke);
}

function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): MaskPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * canvas.width,
    y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * canvas.height,
  };
}

async function maskDraftFromCanvas(canvas: HTMLCanvasElement): Promise<MaskDraft> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持遮罩画布。");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("当前浏览器不支持遮罩导出。");
  const outputData = outputContext.createImageData(canvas.width, canvas.height);
  let selected = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const selectedPixel = pixels[index + 3]! > 0;
    if (selectedPixel) selected += 1;
    outputData.data[index] = 0;
    outputData.data[index + 1] = 0;
    outputData.data[index + 2] = 0;
    outputData.data[index + 3] = selectedPixel ? 0 : 255;
  }
  outputContext.putImageData(outputData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("遮罩导出失败，请重试。");
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    coverage: selected / Math.max(canvas.width * canvas.height, 1),
  };
}

export function MaskEditorDialog({
  open,
  imageUrl,
  imageAlt,
  width,
  height,
  initialPrompt = "",
  saving = false,
  error = null,
  onClose,
  onSave,
}: {
  open: boolean;
  imageUrl: string;
  imageAlt: string;
  width: number;
  height: number;
  initialPrompt?: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (mask: MaskDraft, prompt: string) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<MaskMode>("brush");
  const [brushSize, setBrushSize] = useState(64);
  const [strokes, setStrokes] = useState<MaskStroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<MaskStroke[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("brush");
    setBrushSize(64);
    setStrokes([]);
    setRedoStrokes([]);
    setPrompt(initialPrompt);
    setLocalError(null);
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
      drawStrokes(canvas, []);
    }
  }, [height, initialPrompt, open, width]);

  useEffect(() => {
    if (canvasRef.current) drawStrokes(canvasRef.current, strokes);
  }, [strokes]);

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (saving) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event, canvas);
    setDrawing(true);
    setRedoStrokes([]);
    setStrokes((current) => [...current, { mode, size: brushSize, points: [point] }]);
  };

  const continueDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = pointFromEvent(event, canvas);
    setStrokes((current) => {
      const next = current.slice();
      const last = next.at(-1);
      if (last) next[next.length - 1] = { ...last, points: [...last.points, point] };
      return next;
    });
  };

  const finishDrawing = () => setDrawing(false);
  const undo = () => {
    setStrokes((current) => {
      const last = current.at(-1);
      if (!last) return current;
      setRedoStrokes((redo) => [...redo, last]);
      return current.slice(0, -1);
    });
  };
  const redo = () => {
    setRedoStrokes((current) => {
      const last = current.at(-1);
      if (!last) return current;
      setStrokes((strokesValue) => [...strokesValue, last]);
      return current.slice(0, -1);
    });
  };
  const reset = () => {
    setStrokes([]);
    setRedoStrokes([]);
    setLocalError(null);
  };
  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0 || !prompt.trim()) return;
    setLocalError(null);
    try {
      await onSave(await maskDraftFromCanvas(canvas), prompt.trim());
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "局部编辑失败，请重试。");
    }
  };

  return (
    <Dialog
      open={open}
      title="局部编辑"
      eyebrow="图片工具"
      className="mask-editor-dialog"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>取消</Button>
          <Button disabled={saving || strokes.length === 0 || !prompt.trim()} onClick={() => void save()}>
            <WandSparkles size={15} />
            {saving ? "正在保存..." : "保存编辑"}
          </Button>
        </>
      }
    >
      <div className="mask-editor__canvas-shell">
        <img src={imageUrl} alt={imageAlt} className="mask-editor__image" />
        <canvas
          ref={canvasRef}
          aria-label="遮罩编辑画布"
          className="mask-editor__canvas"
          onPointerDown={startDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
        />
      </div>
      <div className="mask-editor__toolbar">
        <SegmentedControl
          ariaLabel="遮罩工具"
          value={mode}
          disabled={saving}
          options={[{ value: "brush", label: "画笔" }, { value: "erase", label: "橡皮擦" }]}
          onChange={setMode}
        />
        <Field label="画笔大小">
          <input
            aria-label="画笔大小"
            type="range"
            min="8"
            max="240"
            step="4"
            value={brushSize}
            disabled={saving}
            onChange={(event) => setBrushSize(Number(event.target.value))}
          />
        </Field>
        <div className="mask-editor__history-actions">
          <IconButton label="撤销遮罩操作" disabled={saving || strokes.length === 0} onClick={undo}><Undo2 size={16} /></IconButton>
          <IconButton label="重做遮罩操作" disabled={saving || redoStrokes.length === 0} onClick={redo}><Redo2 size={16} /></IconButton>
          <IconButton label="重置遮罩" disabled={saving || strokes.length === 0} onClick={reset}><RotateCcw size={16} /></IconButton>
        </div>
      </div>
      <Field label="局部编辑要求" hint="只描述需要替换或修正的区域，未涂抹部分会尽量保留。">
        <textarea value={prompt} rows={3} disabled={saving} onChange={(event) => setPrompt(event.target.value)} />
      </Field>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {localError ? <StatusMessage tone="danger">{localError}</StatusMessage> : null}
    </Dialog>
  );
}
