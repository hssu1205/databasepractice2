import { useState, useRef, useEffect } from 'react';
import { db, storage, auth } from './firebase';
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { DrawingCanvas, type DrawingCanvasRef } from './components/DrawingCanvas';
import { TeacherDashboard, type MoodEntry } from './components/TeacherDashboard';
import { ChevronRight, ChevronLeft, Heart, Smile, Sparkles, User, Lock, Eye, EyeOff } from 'lucide-react';

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
type UserMode = 'select' | 'student' | 'teacher-login' | 'teacher-dashboard';

function App() {
  // 모드 분기 상태
  const [userMode, setUserMode] = useState<UserMode>('select');
  
  // 학생용 상태
  const [step, setStep] = useState<number>(1);
  const [studentName, setStudentName] = useState<string>('');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedUrl, setSubmittedUrl] = useState<string>('');

  // 교사 로그인용 상태
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // 공통 상태
  const [error, setError] = useState<string | null>(null);
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);

  const canvasRef = useRef<DrawingCanvasRef | null>(null);

  // 1. Firebase Auth 상태 변화 감지 및 세션 연동
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserMode('teacher-dashboard');
      } else {
        // 로그인 해제 시 대시보드 화면에 머물러 있었다면 메인 선택 화면으로 이동
        setUserMode((prev) => (prev === 'teacher-dashboard' ? 'select' : prev));
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. 교사 모드 활성화 시 Firestore 실시간 리스너 작동 (onSnapshot)
  useEffect(() => {
    if (userMode !== 'teacher-dashboard') {
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
  }, [userMode]);

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

  // 교사 로그인 처리
  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setIsLoggingIn(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password.trim());
      // 로그인 성공 시 onAuthStateChanged에 의해 userMode가 'teacher-dashboard'로 변경됨
      setEmail('');
      setPassword('');
    } catch (err: any) {
      console.error('로그인 에러:', err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else {
        setError('로그인에 실패했습니다. 다시 시도해 주세요.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 교사 로그아웃
  const handleTeacherLogout = async () => {
    try {
      setError(null);
      await signOut(auth);
      setUserMode('select');
    } catch (err) {
      console.error('로그아웃 에러:', err);
      setError('로그아웃에 실패했습니다.');
    }
  };

  // 교사 모드에서 첫 선택 화면으로 돌아가기 (로그아웃 동반)
  const handleGoHome = async () => {
    await handleTeacherLogout();
  };

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
            1. 초기 진입로 선택 화면
            ================================================================== */}
        {userMode === 'select' && (
          <div className="mode-selection-container">
            <h2 style={{ fontSize: '32px', marginBottom: '10px' }}>반가워요! 어디로 가볼까요?</h2>
            <div className="mode-cards">
              {/* 학생 입장 카드 */}
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

              {/* 교사 입장 카드 */}
              <div 
                className="mode-card teacher-card"
                onClick={() => {
                  setUserMode('teacher-login');
                  setError(null);
                }}
              >
                <div className="icon-wrapper">👩‍🏫</div>
                <h3>교사 입장</h3>
                <p>학생들의 감정 상태 통계와 미술관 갤러리를 실시간으로 확인해요.</p>
                <button type="button" className="btn btn-secondary" style={{ marginTop: '10px', width: '80%' }}>
                  <span>로그인하기</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================
            2. 교사 로그인 화면
            ================================================================== */}
        {userMode === 'teacher-login' && (
          <div className="card login-card">
            <h2>👩‍🏫 선생님 로그인</h2>
            <p style={{ textAlign: 'center', fontSize: '18px', color: '#8b7e7d', marginBottom: '20px' }}>
              등록된 이메일과 비밀번호를 입력해 주세요.
            </p>
            <form onSubmit={handleTeacherLogin}>
              <div className="input-group">
                <label htmlFor="teacher-email">이메일</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="teacher-email"
                    type="email"
                    placeholder="example@school.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    className="input-field"
                    style={{ paddingLeft: '45px' }}
                    required
                    autoFocus
                  />
                  <User size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#8b7e7d' }} />
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: '30px' }}>
                <label htmlFor="teacher-password">비밀번호</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="teacher-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="비밀번호 입력"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    className="input-field"
                    style={{ paddingLeft: '45px', paddingRight: '45px' }}
                    required
                  />
                  <Lock size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#8b7e7d' }} />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8b7e7d' }}
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보이기'}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="btn-container">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setUserMode('select');
                    setError(null);
                    setEmail('');
                    setPassword('');
                  }}
                  disabled={isLoggingIn}
                >
                  <ChevronLeft size={20} />
                  <span>이전으로</span>
                </button>
                
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isLoggingIn || !email.trim() || !password.trim()}
                >
                  {isLoggingIn ? '로그인 중...' : '로그인'}
                  <ChevronRight size={20} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ==================================================================
            3. 교사 대시보드 화면
            ================================================================== */}
        {userMode === 'teacher-dashboard' && (
          <TeacherDashboard
            entries={moodEntries}
            onLogout={handleTeacherLogout}
            onGoHome={handleGoHome}
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
