import { useState, useRef } from 'react';
import { db, storage } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { DrawingCanvas, type DrawingCanvasRef } from './components/DrawingCanvas';
import { ChevronRight, ChevronLeft, Heart, Smile, Sparkles } from 'lucide-react';

// 감정 상태 정의 (행복, 평온, 불안, 슬픔, 화남, 피곤)
const EMOTIONS = [
  { key: 'happy', label: '행복', emoji: '😊', description: '신나고 즐거운 마음' },
  { key: 'calm', label: '평온', emoji: '🌿', description: '편안하고 차분한 마음' },
  { key: 'anxious', label: '불안', emoji: '😰', description: '두근거리고 걱정되는 마음' },
  { key: 'sad', label: '슬픔', emoji: '😢', description: '눈물 나고 속상한 마음' },
  { key: 'angry', label: '화남', emoji: '😡', description: '속상하고 씩씩거리는 마음' },
  { key: 'tired', label: '피곤', emoji: '🥱', description: '힘이 없고 쉬고 싶은 마음' }
];

type EmotionType = typeof EMOTIONS[number];

function App() {
  const [step, setStep] = useState<number>(1);
  const [studentName, setStudentName] = useState<string>('');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedUrl, setSubmittedUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<DrawingCanvasRef | null>(null);

  // 다음 스텝으로 이동
  const handleNextStep = () => {
    if (step === 1 && !studentName.trim()) {
      setError('이름을 입력해 주세요!');
      return;
    }
    if (step === 2 && !selectedEmotion) {
      setError('지금 내 감정을 선택해 주세요!');
      return;
    }
    setError(null);
    setStep((prev) => prev + 1);
  };

  // 이전 스텝으로 이동
  const handlePrevStep = () => {
    setError(null);
    setStep((prev) => prev - 1);
  };

  // Firebase에 최종 데이터 제출
  const handleSubmit = async () => {
    if (!studentName.trim() || !selectedEmotion) {
      setError('이름과 감정 상태를 다시 확인해 주세요.');
      return;
    }

    const hasDrawn = canvasRef.current?.hasDrawn() ?? false;
    if (!hasDrawn) {
      setError('지금 내 마음을 담아 그림을 조금이라도 그려주세요!');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Canvas에서 그림 데이터를 JPG Blob으로 가져오기
      const blob = await canvasRef.current?.getJpgBlob();
      if (!blob) {
        throw new Error('그림 데이터를 가져오는 데 실패했어요.');
      }

      // 2. Firebase Storage에 이미지 파일 업로드
      // 파일명: drawings/[학생이름]_[timestamp].jpg
      const fileName = `drawings/${studentName.trim()}_${Date.now()}.jpg`;
      const storageRef = ref(storage, fileName);
      
      const uploadResult = await uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg',
      });

      // 3. 업로드된 파일의 다운로드 URL 가져오기
      const imageUrl = await getDownloadURL(uploadResult.ref);
      setSubmittedUrl(imageUrl);

      // 4. Firestore에 학생 이름, 감정 상태, 이미지 파일 URL 저장
      await addDoc(collection(db, 'mood-entries'), {
        studentName: studentName.trim(),
        emotion: selectedEmotion.label,
        emotionKey: selectedEmotion.key,
        imageUrl,
        createdAt: serverTimestamp(),
      });

      // 5. 완료 화면으로 이동
      setStep(4);
    } catch (err: any) {
      console.error('제출 에러:', err);
      setError('저장하는 동안 에러가 발생했어요. 다시 한 번 시도해 보세요!');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 모든 데이터를 초기화하고 처음으로 돌아가기
  const handleReset = () => {
    setStep(1);
    setStudentName('');
    setSelectedEmotion(null);
    setSubmittedUrl('');
    setError(null);
  };

  return (
    <>
      <header>
        <h1>🌱 마음 모니터링</h1>
        <p className="description">오늘 내 마음은 어떤 색깔일까요? 솔직하게 표현해 보아요.</p>
      </header>

      {/* 단계별 표시기 (완료 화면이 아닐 때만 렌더링) */}
      {step <= 3 && (
        <div className="steps-indicator">
          <div className={`step-dot ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>1</div>
          <div className={`step-dot ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}>2</div>
          <div className={`step-dot ${step === 3 ? 'active' : ''}`}>3</div>
        </div>
      )}

      {/* 에러 메시지 표시 */}
      {error && <div className="error-msg">⚠️ {error}</div>}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {/* Step 1: 학생 이름 입력 */}
        {step === 1 && (
          <div className="card">
            <h2>반가워요! 내 이름을 알려줄래요?</h2>
            <div className="input-group">
              <label htmlFor="student-name">이름</label>
              <input
                id="student-name"
                type="text"
                placeholder="예) 홍길동"
                value={studentName}
                onChange={(e) => {
                  setStudentName(e.target.value);
                  if (error) setError(null);
                }}
                className="input-field"
                maxLength={10}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNextStep();
                }}
                autoFocus
              />
            </div>
            <div className="btn-container">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNextStep}
                disabled={!studentName.trim()}
              >
                <span>시작하기</span>
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: 감정 상태 선택 */}
        {step === 2 && (
          <div className="card">
            <h2>지금 {studentName}님의 마음 상태는 어떤가요?</h2>
            <div className="emotion-grid">
              {EMOTIONS.map((emotion) => (
                <button
                  key={emotion.key}
                  type="button"
                  onClick={() => {
                    setSelectedEmotion(emotion);
                    if (error) setError(null);
                  }}
                  className={`emotion-card ${emotion.key} ${
                    selectedEmotion?.key === emotion.key ? 'active' : ''
                  }`}
                  aria-label={emotion.description}
                >
                  <span className="emoji" role="img" aria-hidden="true">
                    {emotion.emoji}
                  </span>
                  <span className="label">{emotion.label}</span>
                </button>
              ))}
            </div>
            
            {selectedEmotion && (
              <p style={{ textAlign: 'center', fontSize: '20px', color: '#8b7e7d', marginBottom: '15px' }}>
                <Sparkles size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                지금 내 상태는 <strong>&quot;{selectedEmotion.label}&quot;</strong> ({selectedEmotion.description}) 이에요.
              </p>
            )}

            <div className="btn-container">
              <button type="button" className="btn btn-secondary" onClick={handlePrevStep}>
                <ChevronLeft size={20} />
                <span>뒤로</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNextStep}
                disabled={!selectedEmotion}
              >
                <span>다음으로</span>
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 그림 그리기 */}
        {step === 3 && (
          <div className="card">
            <h2>지금 느끼는 감정을 그림으로 자유롭게 표현해 주세요!</h2>
            <p style={{ textAlign: 'center', fontSize: '18px', color: '#8b7e7d', marginBottom: '15px' }}>
              선택한 마음: <strong>{selectedEmotion?.emoji} {selectedEmotion?.label}</strong>
            </p>
            
            {/* 드로잉 캔버스 컴포넌트 */}
            <DrawingCanvas ref={canvasRef} />

            <div className="btn-container">
              <button type="button" className="btn btn-secondary" onClick={handlePrevStep}>
                <ChevronLeft size={20} />
                <span>뒤로</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                style={{ backgroundColor: '#ffde7d' }}
              >
                <Heart size={20} fill="currentColor" />
                <span>마음 보내기</span>
              </button>
            </div>
          </div>
        )}

        {/* 로딩 인디케이터 (제출 중) */}
        {isSubmitting && (
          <div className="card loading-container">
            <div className="spinner" />
            <h2>{studentName}님의 마음을 안전하게 모으고 있어요...</h2>
            <p style={{ fontSize: '18px', color: '#8b7e7d' }}>잠시만 기다려 주세요! 🌱</p>
          </div>
        )}

        {/* Step 4: 제출 성공 피드백 */}
        {step === 4 && (
          <div className="card success-container">
            <div className="success-badge">🎉</div>
            <h2 className="success-title">마음 보내기 성공!</h2>
            <p style={{ fontSize: '22px' }}>
              <strong>{studentName}</strong>님의 소중한 감정이 선생님께 전달되었어요.
            </p>
            <p style={{ fontSize: '18px', color: '#8b7e7d' }}>
              오늘 하루도 정말 애썼고 고마워요. 내일 또 만나요!
            </p>

            {submittedUrl && (
              <div className="success-preview">
                <img src={submittedUrl} alt="내가 그린 그림" />
                <div className="success-preview-label">
                  {studentName}님이 그린 {selectedEmotion?.emoji} {selectedEmotion?.label}의 순간
                </div>
              </div>
            )}

            <div className="btn-container">
              <button type="button" className="btn btn-primary" onClick={handleReset}>
                <Smile size={20} />
                <span>새로운 마음 기록하기</span>
              </button>
            </div>
          </div>
        )}
      </main>

      <footer style={{ marginTop: '30px', textAlign: 'center', fontSize: '16px', color: '#b6ada5' }}>
        © {new Date().getFullYear()} 마음 모니터링 웹앱. All rights reserved.
      </footer>
    </>
  );
}

export default App;
