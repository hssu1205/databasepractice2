import { useState, useRef, useEffect } from 'react';
import { db, storage, auth, googleProvider } from './firebase';
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithPopup, signOut, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { DrawingCanvas, type DrawingCanvasRef } from './components/DrawingCanvas';
import { TeacherDashboard, type MoodEntry } from './components/TeacherDashboard';
import { ChevronRight, ChevronLeft, Heart, Smile, Sparkles, LogOut } from 'lucide-react';

// 환경 변수(.env.local)에서 교사용 Google 계정 UID 목록 로드
const TEACHER_UIDS = import.meta.env.VITE_TEACHER_UIDS
  ? import.meta.env.VITE_TEACHER_UIDS.split(',').map((uid: string) => uid.trim())
  : [];

// 감정 상태 정의
const EMOTIONS = [
  { key: 'happy', label: '행복', emoji: '😊', description: '신나고 즐거운 마음' },
  { key: 'calm', label: '평온', emoji: '🌿', description: '편안하고 차분한 마음' },
  { key: 'anxious', label: '불안', emoji: '😰', description: '두근거리고 걱정되는 마음' },
  { key: 'sad', label: '슬픔', emoji: '😢', description: '눈물 나고 속상한 마음' },
  { key: 'angry', label: '화남', emoji: '😡', description: '속상하고 씩씩거리는 마음' },
  { key: 'tired', label: '피곤', emoji: '🥱', description: '힘이 없고 쉬고 싶은 마음' }
];

type EmotionType = typeof EMOTIONS[number];
type UserMode = 'select' | 'student' | 'teacher-dashboard';

function App() {
  // 인증 상태 및 모드 분기 상태
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userMode, setUserMode] = useState<UserMode>('select');
  
  // 학생용 상태
  const [step, setStep] = useState<number>(1);
  const [studentName, setStudentName] = useState<string>('');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedUrl, setSubmittedUrl] = useState<string>('');

  // 공통 및 대시보드 상태
  const [error, setError] = useState<string | null>(null);
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const canvasRef = useRef<DrawingCanvasRef | null>(null);

  // 1. Firebase Auth 상태 변화 감지 및 세션 연동
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        // 로그아웃 시 메인 선택 화면으로 이동
        setUserMode('select');
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. 교사 모드 활성화 시 Firestore 실시간 리스너 작동 (onSnapshot)
  useEffect(() => {
    if (userMode !== 'teacher-dashboard' || !currentUser) {
      setMoodEntries([]);
      return;
    }

    setError(null);
    const q = query(collection(db, 'mood-entries'), orderBy('createdAt', 'desc'));
    
    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      const entriesData: MoodEntry[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        entriesData.push({
          id: doc.id,
          studentName: data.studentName || '이름 없음',
          emotion: data.emotion || '알 수 없음',
          emotionKey: data.emotionKey || 'happy',
          imageUrl: data.imageUrl || '',
          createdAt: data.createdAt,
        });
      });
      setMoodEntries(entriesData);
    }, (err) => {
      console.error('Firestore 구독 오류:', err);
      setError('정서 기록 데이터를 가져오지 못했습니다. 권한 설정을 확인해 주세요.');
    });

    return () => unsubscribeFirestore();
  }, [userMode, currentUser]);

  // Google 로그인 처리
  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Google 로그인 에러:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Google 로그인에 실패했습니다. 다시 시도해 주세요.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 로그아웃 처리
  const handleLogout = async () => {
    try {
      setError(null);
      await signOut(auth);
      setUserMode('select');
    } catch (err) {
      console.error('로그아웃 에러:', err);
      setError('로그아웃에 실패했습니다.');
    }
  };

  // 학생 모드 다음 스텝 이동
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

  // 학생 모드 이전 스텝 이동
  const handlePrevStep = () => {
    setError(null);
    setStep((prev) => prev - 1);
  };

  // 학생용 그림 및 데이터 Firebase에 제출
  const handleSubmit = async () => {
    if (!studentName.trim() || !selectedEmotion) {
      setError('이름과 감정을 다시 확인해 주세요.');
      return;
    }

    const hasDrawn = canvasRef.current?.hasDrawn() ?? false;
    if (!hasDrawn) {
      setError('오늘 내 마음을 담아 그림을 조금이라도 그려주세요!');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const blob = await canvasRef.current?.getJpgBlob();
      if (!blob) {
        throw new Error('그림 파일을 생성하지 못했습니다.');
      }

      const fileName = `drawings/${studentName.trim()}_${Date.now()}.jpg`;
      const storageRef = ref(storage, fileName);
      
      const uploadResult = await uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg',
      });

      const imageUrl = await getDownloadURL(uploadResult.ref);
      setSubmittedUrl(imageUrl);

      await addDoc(collection(db, 'mood-entries'), {
        studentName: studentName.trim(),
        emotion: selectedEmotion.label,
        emotionKey: selectedEmotion.key,
        imageUrl,
        createdAt: serverTimestamp(),
      });

      setStep(4);
    } catch (err: any) {
      console.error('제출 중 오류:', err);
      setError('제출하지 못했습니다. 다시 시도해 주세요!');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 학생 데이터 리셋
  const handleStudentReset = () => {
    setStep(1);
    setStudentName('');
    setSelectedEmotion(null);
    setSubmittedUrl('');
    setError(null);
  };

  // 교사 여부 판정 (구글 로그인 UID가 TEACHER_UIDS 목록에 존재하는지 확인)
  const isTeacher = currentUser ? TEACHER_UIDS.includes(currentUser.uid) : false;

  // UI 헤더 타이틀 및 설명 렌더링 도우미
  const renderHeader = () => {
    if (userMode === 'teacher-dashboard') return null; // 대시보드는 자체 헤더 사용
    
    return (
      <header>
        <h1>🌱 마음 모니터링</h1>
        <p className="description">오늘 내 마음은 어떤 색깔일까요? 솔직하게 표현해 보아요.</p>
      </header>
    );
  };

  return (
    <div className={userMode === 'teacher-dashboard' ? 'dashboard-root' : ''}>
      {renderHeader()}

      {/* 학생 단계 표시기 */}
      {userMode === 'student' && step <= 3 && (
        <div className="steps-indicator">
          <div className={`step-dot ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>1</div>
          <div className={`step-dot ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}>2</div>
          <div className={`step-dot ${step === 3 ? 'active' : ''}`}>3</div>
        </div>
      )}

      {/* 에러 메시지 표시 */}
      {error && <div className="error-msg">⚠️ {error}</div>}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        
        {/* ==================================================================
            1. 로그인 전 화면 (Google 로그인 버튼 노출)
            ================================================================== */}
        {!currentUser && (
          <div className="card" style={{ maxWidth: '500px', margin: '20px auto', textAlign: 'center' }}>
            <h2>오늘 나의 감정 기록하기</h2>
            <p style={{ fontSize: '18px', color: '#8b7e7d', marginBottom: '25px', lineHeight: 1.4 }}>
              로그인 후 오늘 하루의 내 감정을 선택하고 그림판에 예쁘게 그릴 수 있어요.
            </p>
            <button
              type="button"
              className="btn btn-google"
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {/* Google G 로고 */}
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              <span>{isLoggingIn ? '연결 중...' : 'Google 계정으로 로그인'}</span>
            </button>
          </div>
        )}

        {/* ==================================================================
            2. 로그인 후: 진입로 선택 화면
            ================================================================== */}
        {currentUser && userMode === 'select' && (
          <div className="mode-selection-container">
            {/* 로그인 정보 및 로그아웃 영역 */}
            <div className="card" style={{ padding: '16px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '15px' }}>
              <span style={{ fontSize: '20px', color: '#4a3e3d' }}>
                🌱 <strong>{currentUser.displayName || currentUser.email}</strong>님, 환영합니다!
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleLogout}
                style={{ padding: '8px 16px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}
              >
                <LogOut size={16} />
                <span>로그아웃</span>
              </button>
            </div>

            <h2 style={{ fontSize: '32px', marginBottom: '10px' }}>반가워요! 어디로 가볼까요?</h2>
            <div className="mode-cards" style={{ gridTemplateColumns: isTeacher ? '1fr 1fr' : '1fr' }}>
              {/* 학생 입장 카드 (항상 노출) */}
              <div 
                className="mode-card student-card"
                onClick={() => {
                  setUserMode('student');
                  setStep(1);
                  setError(null);
                }}
              >
                <div className="icon-wrapper">🧒</div>
                <h3>학생 입장</h3>
                <p>오늘 내 기분이 어떤지 선택하고 귀여운 그림으로 표현해요!</p>
                <button type="button" className="btn btn-primary" style={{ marginTop: '10px', width: '80%' }}>
                  <span>시작하기</span>
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* 교사 입장 카드 (교사용 UID 목록에 소유자 매칭 시에만 노출) */}
              {isTeacher && (
                <div 
                  className="mode-card teacher-card"
                  onClick={() => {
                    setUserMode('teacher-dashboard');
                    setError(null);
                  }}
                >
                  <div className="icon-wrapper">👩‍🏫</div>
                  <h3>교사 입장</h3>
                  <p>학생들의 감정 상태 통계와 미술관 갤러리를 실시간으로 확인해요.</p>
                  <button type="button" className="btn btn-secondary" style={{ marginTop: '10px', width: '80%' }}>
                    <span>대시보드 보기</span>
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================
            3. 교사 대시보드 화면
            ================================================================== */}
        {userMode === 'teacher-dashboard' && (
          <TeacherDashboard
            entries={moodEntries}
            onLogout={handleLogout}
            onGoHome={() => setUserMode('select')}
          />
        )}

        {/* ==================================================================
            4. 학생 모드: Step 1 (이름 입력)
            ================================================================== */}
        {userMode === 'student' && step === 1 && (
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
                className="btn btn-secondary" 
                onClick={() => {
                  setUserMode('select');
                  setError(null);
                }}
              >
                <ChevronLeft size={20} />
                <span>뒤로</span>
              </button>
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

        {/* ==================================================================
            5. 학생 모드: Step 2 (감정 선택)
            ================================================================== */}
        {userMode === 'student' && step === 2 && (
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

        {/* ==================================================================
            6. 학생 모드: Step 3 (그림 그리기)
            ================================================================== */}
        {userMode === 'student' && step === 3 && (
          <div className="card">
            <h2>지금 느끼는 감정을 그림으로 자유롭게 표현해 주세요!</h2>
            <p style={{ textAlign: 'center', fontSize: '18px', color: '#8b7e7d', marginBottom: '15px' }}>
              선택한 마음: <strong>{selectedEmotion?.emoji} {selectedEmotion?.label}</strong>
            </p>
            
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

        {/* 학생 모드: 제출 중 로딩 */}
        {userMode === 'student' && isSubmitting && (
          <div className="card loading-container">
            <div className="spinner" />
            <h2>{studentName}님의 마음을 안전하게 모으고 있어요...</h2>
            <p style={{ fontSize: '18px', color: '#8b7e7d' }}>잠시만 기다려 주세요! 🌱</p>
          </div>
        )}

        {/* ==================================================================
            7. 학생 모드: Step 4 (성공 완료 화면)
            ================================================================== */}
        {userMode === 'student' && step === 4 && (
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
              <button type="button" className="btn btn-primary" onClick={handleStudentReset}>
                <Smile size={20} />
                <span>새로운 마음 기록하기</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {userMode !== 'teacher-dashboard' && (
        <footer style={{ marginTop: '30px', textAlign: 'center', fontSize: '16px', color: '#b6ada5' }}>
          © {new Date().getFullYear()} 마음 모니터링 웹앱. All rights reserved.
        </footer>
      )}
    </div>
  );
}

export default App;
