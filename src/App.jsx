import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, Timestamp } from 'firebase/firestore';
import { MessageCircle, LayoutDashboard, Send, User, ShieldCheck, Database, Heart, AlertCircle, LogIn } from 'lucide-react';

// --- Firebase & 환경 설정 ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'pastor-counseling-center';
const apiKey = ""; 

const PASTOR_SYSTEM_PROMPT = `
당신은 '와니' 목사님의 페르소나를 가진 전문 상담가입니다. 
당신은 감리교회의 전통과 존 웨슬리의 신학을 따르며, 공황장애와 우울증을 겪는 이들에게 깊이 공감합니다.
'인생의 사용기한', '믿음의 데이터', '그리스도인의 향기' 등 목사님의 설교 키워드를 사용해 설명하세요.
처음부터 가르치려 들지 말고 "마음의 날씨는 어떤가요?"처럼 질문하며 상황을 충분히 듣습니다.
`;

export default function App() {
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState(''); // 성도 이름 저장
  const [isNameSet, setIsNameSet] = useState(false); // 이름 입력 여부
  const [view, setView] = useState('user'); 
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [counselingLogs, setCounselingLogs] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const chatEndRef = useRef(null);

  // 1. 인증 로직
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("인증 실패:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 관리자용 데이터베이스 리스너
  useEffect(() => {
    if (!user || view !== 'admin') return;

    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'counseling_logs');
    const unsubscribe = onSnapshot(logsRef, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCounselingLogs(logs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    }, (err) => {
      setErrorMessage("데이터베이스를 불러올 수 없습니다.");
    });
    return () => unsubscribe();
  }, [user, view]);

  // 3. AI 호출 (Retry Logic 포함)
  const callGemini = async (userPrompt) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: PASTOR_SYSTEM_PROMPT }] }
    };
    let delay = 1000;
    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (response.ok) return await response.json();
      } catch (e) { if (i === 2) throw e; }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  };

  // 4. 대화 전송 및 DB 저장
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userText = input;
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setInput('');
    setIsTyping(true);

    try {
      const data = await callGemini(userText);
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "잠시 기도로 마음을 가다듬고 있습니다.";
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);

      if (user) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'counseling_logs'), {
          userId: user.uid,
          memberName: userName, // 이름 저장!
          userMessage: userText,
          aiResponse: aiResponse,
          timestamp: Timestamp.now(),
          category: userText.includes("죽") || userText.includes("힘들") ? "긴급 심방" : "일반 고민"
        });
      }
    } catch (err) {
      setErrorMessage("연결이 잠시 끊겼습니다.");
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b p-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Heart size={22} fill="currentColor" /></div>
          <div>
            <h1 className="text-lg font-bold leading-none">디지털 마음 심방 센터</h1>
            <p className="text-[10px] text-slate-400 mt-1 uppercase">Pastor Wani's Care System</p>
          </div>
        </div>
        <div className="flex bg-slate-100 rounded-lg p-1 border">
          <button onClick={() => setView('user')} className={`px-4 py-1.5 rounded-md text-xs font-semibold ${view === 'user' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>성도 모드</button>
          <button onClick={() => setView('admin')} className={`px-4 py-1.5 rounded-md text-xs font-semibold ${view === 'admin' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>목사님 모드 (DB)</button>
        </div>
      </header>

      <main className="flex-grow flex flex-col max-w-4xl mx-auto w-full p-4 overflow-hidden">
        {view === 'user' ? (
          !isNameSet ? (
            /* 상담 시작 전 이름 입력 화면 */
            <div className="flex-grow flex flex-col items-center justify-center space-y-6">
              <div className="text-center space-y-2">
                <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                   <LogIn size={40} />
                </div>
                <h2 className="text-2xl font-bold">상담을 시작합니다</h2>
                <p className="text-slate-400">목사님이 누구신지 알 수 있도록 성함을 적어주세요.</p>
              </div>
              <div className="w-full max-w-sm space-y-3">
                <input 
                  type="text" 
                  value={userName} 
                  onChange={(e) => setUserName(e.target.value)} 
                  placeholder="성함을 입력하세요 (예: 김세움)"
                  className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 outline-none transition-all text-center text-lg font-medium"
                />
                <button 
                  onClick={() => userName.trim() && setIsNameSet(true)}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 shadow-lg active:scale-95 transition-all"
                >
                  상담실 입장하기
                </button>
              </div>
            </div>
          ) : (
            /* 실제 상담창 */
            <div className="bg-white rounded-3xl shadow-xl flex flex-col h-full border border-slate-200 overflow-hidden">
              <div className="p-4 border-b bg-indigo-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-indigo-600" size={16} />
                  <span className="text-xs text-slate-500">환영합니다, <strong>{userName}</strong> 성도님</span>
                </div>
                <button onClick={() => setIsNameSet(false)} className="text-[10px] text-slate-400 underline">이름 수정</button>
              </div>
              
              <div className="flex-grow overflow-y-auto p-6 space-y-6">
                {messages.length === 0 && (
                  <div className="text-center py-16 space-y-4">
                    <User size={32} className="text-slate-200 mx-auto" />
                    <p className="text-slate-400 text-sm">마음의 이야기를 들려주시면 목사님이 함께 고민하겠습니다.</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none'}`}>
                      <p className="text-[15px] leading-relaxed">{m.content}</p>
                    </div>
                  </div>
                ))}
                {isTyping && <div className="text-slate-400 text-xs animate-pulse ml-2">목사님이 답변을 작성 중입니다...</div>}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 border-t bg-slate-50">
                <div className="flex gap-2 bg-white p-2 rounded-2xl border shadow-sm">
                  <input value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} placeholder="여기에 마음을 적어주세요..." className="flex-grow px-3 py-2 outline-none text-sm" />
                  <button onClick={handleSend} disabled={!input.trim()} className="p-3 bg-indigo-600 text-white rounded-xl shadow-md"><Send size={18} /></button>
                </div>
              </div>
            </div>
          )
        ) : (
          /* 목사님 관리자 대시보드 (DB) */
          <div className="flex flex-col h-full gap-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-white p-4 rounded-2xl border shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">상담 누적</p>
                <p className="text-2xl font-black text-indigo-600">{counselingLogs.length}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">긴급 심방</p>
                <p className="text-2xl font-black text-red-500">{counselingLogs.filter(l => l.category === "긴급 심방").length}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">오늘 상담</p>
                <p className="text-2xl font-black text-green-500">LIVE</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-xl flex-grow border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-5 bg-slate-50 border-b flex items-center gap-2">
                <Database size={18} className="text-indigo-600" />
                <h3 className="font-bold text-slate-700">심방 기록 데이터베이스</h3>
              </div>
              <div className="flex-grow overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b text-[10px] text-slate-400 font-bold uppercase">
                    <tr>
                      <th className="p-4">시간</th>
                      <th className="p-4">성함</th>
                      <th className="p-4">내용</th>
                      <th className="p-4">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {counselingLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-slate-400 text-xs">{log.timestamp?.toDate().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="p-4 font-bold text-indigo-600">{log.memberName || "익명"}</td>
                        <td className="p-4 max-w-xs truncate">{log.userMessage}</td>
                        <td className="p-4 text-xs font-black text-red-400 uppercase">{log.category === '긴급 심방' ? '!! URGENT' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
      <footer className="p-4 text-center text-[10px] text-slate-400 font-medium">
        &copy; 2026 Seum Ministry Digital Care | 상담 자료는 목회 보조 도구로만 활용됩니다.
      </footer>
    </div>
  );
}
