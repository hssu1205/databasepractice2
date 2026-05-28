import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Eraser, Trash2 } from 'lucide-react';

export interface DrawingCanvasRef {
  getJpgBlob: () => Promise<Blob | null>;
  clearCanvas: () => void;
  hasDrawn: () => boolean;
}

const COLORS = [
  { value: '#4a3e3d', label: '초코' },
  { value: '#ff8b8b', label: '딸기' },
  { value: '#ffb570', label: '오렌지' },
  { value: '#ffe485', label: '바나나' },
  { value: '#a2e8a9', label: '메론' },
  { value: '#9bd1ff', label: '소다' },
  { value: '#d5b3ff', label: '포도' }
];

const BRUSH_SIZES = [
  { value: 6, label: '얇게', dotSize: 6 },
  { value: 12, label: '중간', dotSize: 12 },
  { value: 24, label: '두껍게', dotSize: 20 }
];

export const DrawingCanvas = forwardRef<DrawingCanvasRef, {}>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState('#4a3e3d');
  const [brushSize, setBrushSize] = useState(12);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);
  const [drawn, setDrawn] = useState(false); // 그림을 그렸는지 여부 기록

  // 캔버스 초기 배경을 흰색으로 설정
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 브러시 설정 초기화
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, []);

  // 외부(부모)로 노출할 기능 정의
  useImperativeHandle(ref, () => ({
    getJpgBlob: (): Promise<Blob | null> => {
      return new Promise((resolve) => {
        const canvas = canvasRef.current;
        if (canvas) {
          // JPG 포맷으로 변환 (품질 0.9)
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/jpeg', 0.9);
        } else {
          resolve(null);
        }
      });
    },
    clearCanvas: () => {
      handleClear();
    },
    hasDrawn: () => drawn
  }));

  // 그리기 지우기 초기화 기능
  const handleClear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setDrawn(false);
      }
    }
  };

  // 좌표 계산 도우미 (터치 & 마우스 대응)
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    // 터치 이벤트인 경우
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    }
    
    // 마우스 이벤트인 경우
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  // 그리기 시작
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = isEraser ? '#ffffff' : color;
    ctx.lineWidth = brushSize;
    
    setIsDrawing(true);
  };

  // 그리는 중
  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);

    ctx.lineTo(x, y);
    ctx.stroke();
    setDrawn(true);
  };

  // 그리기 중단
  const stopDrawing = () => {
    setIsDrawing(false);
  };

  return (
    <div className="canvas-container">
      {/* 캔버스 드로잉 영역 */}
      <div className="canvas-outline">
        <canvas
          ref={canvasRef}
          width={360}
          height={320}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{ display: 'block' }}
        />
      </div>

      {/* 그림 그리기 도구 상자 */}
      <div className="canvas-toolbar">
        {/* 색상 선택 */}
        <div className="tool-section">
          <span className="tool-label">색깔:</span>
          <div className="color-picker">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`color-swatch ${color === c.value && !isEraser ? 'active' : ''}`}
                style={{ backgroundColor: c.value }}
                onClick={() => {
                  setColor(c.value);
                  setIsEraser(false);
                }}
                title={c.label}
              />
            ))}
          </div>
        </div>

        {/* 선 굵기 선택 */}
        <div className="tool-section" style={{ marginLeft: '10px' }}>
          <span className="tool-label">두께:</span>
          <div className="brush-sizes">
            {BRUSH_SIZES.map((b) => (
              <button
                key={b.value}
                type="button"
                className={`brush-btn ${brushSize === b.value ? 'active' : ''}`}
                onClick={() => setBrushSize(b.value)}
                style={{ width: '36px', height: '36px' }}
                title={b.label}
              >
                <div
                  className="brush-dot"
                  style={{
                    width: `${b.dotSize}px`,
                    height: `${b.dotSize}px`,
                    backgroundColor: brushSize === b.value ? '#4a3e3d' : '#8b7e7d'
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* 도구 액션 */}
        <div className="tool-section" style={{ marginLeft: '10px', gap: '8px' }}>
          <button
            type="button"
            className={`canvas-action-btn ${isEraser ? 'active' : ''}`}
            onClick={() => setIsEraser(true)}
            title="지우개로 지워요"
          >
            <Eraser size={16} />
            <span>지우개</span>
          </button>
          
          <button
            type="button"
            className="canvas-action-btn"
            onClick={handleClear}
            title="처음부터 다시 그려요"
          >
            <Trash2 size={16} />
            <span>비우기</span>
          </button>
        </div>
      </div>
    </div>
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';
