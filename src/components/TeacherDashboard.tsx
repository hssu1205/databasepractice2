import { useState } from 'react';
import { BarChart3, Image as ImageIcon, X, LogOut, ArrowLeft, Calendar, User } from 'lucide-react';

export interface MoodEntry {
  id: string;
  studentName: string;
  emotion: string;      // '행복', '평온' 등
  emotionKey: string;   // 'happy', 'calm' 등
  imageUrl: string;
  createdAt: any;       // Firestore Timestamp
}

interface TeacherDashboardProps {
  entries: MoodEntry[];
  onLogout: () => void;
  onGoHome: () => void;
}

const EMOTION_METADATA: Record<string, { label: string; emoji: string; colorClass: string }> = {
  happy: { label: '행복', emoji: '😊', colorClass: 'happy' },
  calm: { label: '평온', emoji: '🌿', colorClass: 'calm' },
  anxious: { label: '불안', emoji: '😰', colorClass: 'anxious' },
  sad: { label: '슬픔', emoji: '😢', colorClass: 'sad' },
  angry: { label: '화남', emoji: '😡', colorClass: 'angry' },
  tired: { label: '피곤', emoji: '🥱', colorClass: 'tired' }
};

export function TeacherDashboard({ entries, onLogout, onGoHome }: TeacherDashboardProps) {
  const [selectedEntry, setSelectedEntry] = useState<MoodEntry | null>(null);

  // 1. 감정 통계 데이터 계산
  const emotionCounts: Record<string, number> = {
    happy: 0,
    calm: 0,
    anxious: 0,
    sad: 0,
    angry: 0,
    tired: 0
  };

  entries.forEach((entry) => {
    // 혹시 매칭 안 되는 key가 있으면 무시
    if (emotionCounts[entry.emotionKey] !== undefined) {
      emotionCounts[entry.emotionKey]++;
    }
  });

  const totalCount = entries.length;
  const maxCount = Math.max(...Object.values(emotionCounts), 1);

  // 날짜 변환 함수
  const formatDate = (timestamp: any) => {
    if (!timestamp) return '방금 전';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(
      date.getMinutes()
    ).padStart(2, '0')}`;
  };

  return (
    <div className="dashboard-root" style={{ width: '100%' }}>
      {/* 교사 헤더 */}
      <div className="dashboard-header">
        <div style={{ textAlign: 'left' }}>
          <h2>👩‍🏫 교사 대시보드 모드</h2>
          <p style={{ margin: 0, fontSize: '18px', color: '#8b7e7d' }}>
            학생들이 오늘 보내온 소중한 마음들을 실시간으로 모니터링합니다. (총 {totalCount}개 제출)
          </p>
        </div>
        <div className="btn-container" style={{ margin: 0 }}>
          <button type="button" className="btn btn-secondary" onClick={onGoHome} style={{ padding: '8px 16px', fontSize: '18px' }}>
            <ArrowLeft size={16} />
            <span>첫 화면</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={onLogout} style={{ padding: '8px 16px', fontSize: '18px', backgroundColor: '#ffd4d4' }}>
            <LogOut size={16} />
            <span>로그아웃</span>
          </button>
        </div>
      </div>

      <div className="dashboard-layout">
        {/* 왼쪽: 감정 통계 */}
        <div className="dashboard-panel">
          <h2>
            <BarChart3 size={22} />
            <span>오늘의 마음 온도 (통계)</span>
          </h2>
          <div className="chart-list">
            {Object.entries(EMOTION_METADATA).map(([key, meta]) => {
              const count = emotionCounts[key];
              const percentage = (count / maxCount) * 100;
              const ratio = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;

              return (
                <div key={key} className="chart-item">
                  <div className="chart-label-row">
                    <div className="chart-label-info">
                      <span style={{ fontSize: '24px' }}>{meta.emoji}</span>
                      <span>{meta.label}</span>
                    </div>
                    <span className="chart-count">
                      {count}명 ({ratio}%)
                    </span>
                  </div>
                  <div className="chart-bar-bg">
                    <div
                      className={`chart-bar-fill ${meta.colorClass}`}
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: `var(--color-${key})`,
                        border: `2px solid var(--color-${key}-border)`
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 오른쪽: 그림 갤러리 */}
        <div className="dashboard-panel">
          <h2>
            <ImageIcon size={22} />
            <span>마음 그림 미술관 (갤러리)</span>
          </h2>

          {entries.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🎨</span>
              <p style={{ fontSize: '22px', fontWeight: 'bold' }}>아직 제출된 그림이 없어요.</p>
              <p style={{ fontSize: '18px' }}>학생들이 감정을 제출하면 여기에 실시간으로 나타납니다.</p>
            </div>
          ) : (
            <div className="gallery-grid">
              {entries.map((entry) => {
                const meta = EMOTION_METADATA[entry.emotionKey] || { label: entry.emotion, emoji: '📝', colorClass: 'happy' };
                return (
                  <div
                    key={entry.id}
                    className="gallery-card"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="gallery-img-wrapper">
                      <img src={entry.imageUrl} alt={`${entry.studentName}의 그림`} loading="lazy" />
                    </div>
                    <div className="gallery-info">
                      <div className="gallery-student-row">
                        <span className="gallery-name">{entry.studentName}</span>
                        <span className={`gallery-emotion-badge ${meta.colorClass}`}>
                          {meta.emoji} {meta.label}
                        </span>
                      </div>
                      <span className="gallery-date">{formatDate(entry.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 그림 상세 라이트박스 모달 */}
      {selectedEntry && (
        <div className="modal-overlay" onClick={() => setSelectedEntry(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setSelectedEntry(null)}
              aria-label="닫기"
            >
              <X size={20} />
            </button>
            <div className="modal-image-wrapper">
              <img src={selectedEntry.imageUrl} alt={`${selectedEntry.studentName}의 큰 그림`} />
            </div>
            <div className="modal-body">
              <div className="modal-header-row">
                <span className="modal-student-name">
                  <User size={20} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  {selectedEntry.studentName} 어린이
                </span>
                <span className="modal-date">
                  <Calendar size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  {formatDate(selectedEntry.createdAt)}
                </span>
              </div>
              <div className="modal-details">
                <span style={{ fontSize: '32px' }}>
                  {EMOTION_METADATA[selectedEntry.emotionKey]?.emoji || '😊'}
                </span>
                <div>
                  <strong>{selectedEntry.emotion}</strong> 상태를 그렸어요.
                  <p style={{ fontSize: '15px', color: '#8b7e7d', margin: 0 }}>
                    &quot;{selectedEntry.studentName} 어린이의 오늘 감정은 {selectedEntry.emotion}입니다.&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
