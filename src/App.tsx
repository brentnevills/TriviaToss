import { useState, useEffect } from 'react';
import { CardData, DisplayStrategy, GameMode, Team, Quiz } from './types';
import defaultQuestions from './data/questions.json';
import QuizEditor from './components/QuizEditor';
import { Target, Play, Plus, Edit2, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { loginWithGoogle, logout, db, auth } from './lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

export type TreeNode = {
  type: 'leaf';
  card: CardData;
} | {
  type: 'node';
  isRow: boolean;
  left: TreeNode;
  right: TreeNode;
};

const DEFAULT_QUIZ: Quiz = {
  id: 'default-quiz',
  name: 'General Trivia (Default)',
  bank: defaultQuestions as any
};

export default function App() {
  const [gameState, setGameState] = useState<'setup' | 'editing' | 'playing' | 'gameover'>('setup');
  
  // Quizzes state
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<string>('');
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);

  // Setup state
  const [teamCount, setTeamCount] = useState(2);
  const [questionCount, setQuestionCount] = useState(6);
  const [mode, setMode] = useState<GameMode>('standard');
  const [displayStrategy, setDisplayStrategy] = useState<DisplayStrategy>('show');
  
  // Playing state
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeamIdx, setCurrentTeamIdx] = useState(0);
  const [activeQuestions, setActiveQuestions] = useState<CardData[]>([]);
  const [conquerTree, setConquerTree] = useState<TreeNode | null>(null);
  
  // Modal state
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  // Auth State
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        // Load local quizzes if not logged in
        const saved = localStorage.getItem('trivia-quizzes');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.length > 0) {
              setQuizzes(parsed);
              setSelectedQuizId(parsed[0].id);
              return;
            }
          } catch (e) {
            console.error('Failed to parse saved quizzes');
          }
        }
        setQuizzes([DEFAULT_QUIZ]);
        setSelectedQuizId(DEFAULT_QUIZ.id);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Firestore quizzes when user changes
  useEffect(() => {
    if (user) {
      const q = query(collection(db, 'quizzes'), where('userId', '==', user.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const firestoreQuizzes: Quiz[] = snapshot.docs.map(doc => doc.data() as Quiz);
        const combined = [DEFAULT_QUIZ, ...firestoreQuizzes];
        setQuizzes(combined);
      });
      return () => unsubscribe();
    }
  }, [user]);

  // Keep selectedQuizId valid
  useEffect(() => {
    if (quizzes.length > 0 && !quizzes.find(q => q.id === selectedQuizId)) {
      setSelectedQuizId(quizzes[0].id);
    }
  }, [quizzes, selectedQuizId]);

  const saveQuizzes = async (quiz: Quiz) => {
    if (user) {
      // Save to Firestore
      const quizToSave = { ...quiz, userId: user.uid };
      await setDoc(doc(db, 'quizzes', quizToSave.id), quizToSave);
    } else {
      // Save to LocalStorage
      const existingIdx = quizzes.findIndex(q => q.id === quiz.id);
      let newQuizzes = [...quizzes];
      if (existingIdx >= 0) {
        newQuizzes[existingIdx] = quiz;
      } else {
        newQuizzes.push(quiz);
      }
      setQuizzes(newQuizzes);
      localStorage.setItem('trivia-quizzes', JSON.stringify(newQuizzes.filter(q => q.id !== 'default-quiz')));
    }
  };

  const handleCreateQuiz = () => {
    const newQuiz: Quiz = {
      id: `quiz-${Date.now()}`,
      name: 'New Quiz',
      bank: []
    };
    setEditingQuiz(newQuiz);
    setGameState('editing');
  };

  const handleEditQuiz = () => {
    const quiz = quizzes.find(q => q.id === selectedQuizId);
    if (quiz && quiz.id !== 'default-quiz') {
      setEditingQuiz(quiz);
      setGameState('editing');
    } else {
      alert("Cannot edit the default quiz. Please create a new one!");
    }
  };

  const handleSaveQuiz = (quiz: Quiz) => {
    saveQuizzes(quiz);
    setSelectedQuizId(quiz.id);
    setGameState('setup');
  };

  const buildTree = (questions: CardData[], isRow: boolean): TreeNode => {
    if (questions.length === 1) return { type: 'leaf', card: questions[0] };
    const mid = Math.floor(questions.length / 2);
    return {
      type: 'node',
      isRow,
      left: buildTree(questions.slice(0, mid), !isRow),
      right: buildTree(questions.slice(mid), !isRow)
    };
  };

  const startGame = () => {
    const selectedQuiz = quizzes.find(q => q.id === selectedQuizId);
    if (!selectedQuiz) return;
    
    if (questionCount > selectedQuiz.bank.length) {
      alert(`You requested ${questionCount} questions, but the quiz only has ${selectedQuiz.bank.length} cards. Add more cards to the quiz, or lower the question count.`);
      return;
    }

    const newTeams: Team[] = [];
    for (let i = 0; i < teamCount; i++) {
      newTeams.push({ name: `Team ${i + 1}`, score: 0 });
    }
    setTeams(newTeams);
    setCurrentTeamIdx(0);

    // Shuffle and add unique IDs
    const shuffled = [...selectedQuiz.bank].sort(() => 0.5 - Math.random());
    const selectedWithIds = shuffled.slice(0, questionCount).map((q, i) => ({
      ...q,
      id: `card-${i}-${Date.now()}`
    })) as CardData[];
    
    setActiveQuestions(selectedWithIds);
    if (mode === 'conquer' && selectedWithIds.length > 0) {
      setConquerTree(buildTree(selectedWithIds, true));
    }
    setGameState('playing');
  };

  const nextTurn = () => {
    setCurrentTeamIdx((prev) => (prev + 1) % teams.length);
  };

  const handleCardClick = (card: CardData) => {
    setSelectedCard(card);
    setShowAnswer(false);
  };

  const handleQuestionAnswer = (isCorrect: boolean) => {
    if (isCorrect && selectedCard && selectedCard.type === 'q') {
      const newTeams = [...teams];
      newTeams[currentTeamIdx].score += selectedCard.pts;
      setTeams(newTeams);
    }
    closeModalAndRemoveCard();
  };

  const handleWildcardResolve = () => {
    if (!selectedCard || selectedCard.type !== 'w') return;
    
    const action = selectedCard.action;
    const pts = selectedCard.pts;
    const newTeams = [...teams];
    const currentTeam = newTeams[currentTeamIdx];

    if (action === 'free') {
      currentTeam.score += pts;
    } else if (action === 'lose') {
      currentTeam.score += pts;
    } else if (action === 'steal') {
      let leaderIdx = 0;
      newTeams.forEach((t, i) => { 
        if(t.score > newTeams[leaderIdx].score) leaderIdx = i; 
      });
      if (leaderIdx !== currentTeamIdx) {
        newTeams[leaderIdx].score -= pts;
        currentTeam.score += pts;
      }
    } else if (action === 'swap') {
      const others = newTeams.filter((_, idx) => idx !== currentTeamIdx);
      if(others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        const targetIdx = newTeams.findIndex(t => t.name === target.name);
        const temp = currentTeam.score;
        currentTeam.score = newTeams[targetIdx].score;
        newTeams[targetIdx].score = temp;
        alert(`Swapped scores with ${target.name}!`);
      }
    }
    setTeams(newTeams);
    closeModalAndRemoveCard();
  };

  const closeModalAndRemoveCard = () => {
    if (!selectedCard) return;
    
    const updatedQuestions = activeQuestions.filter(q => q.id !== selectedCard.id);
    setActiveQuestions(updatedQuestions);
    setSelectedCard(null);
    nextTurn();

    if (updatedQuestions.length === 0) {
      setTimeout(() => {
        setGameState('gameover');
      }, 500);
    }
  };

  const getCardColor = (id: string, isMystery?: boolean) => {
    if (isMystery) return 'bg-slate-200 border-b-[6px] border-slate-400 text-slate-700 active:border-b-0 active:translate-y-[6px]';
    const colors = [
      'bg-red-500 border-b-[6px] border-red-700 text-white active:border-b-0 active:translate-y-[6px]',
      'bg-blue-500 border-b-[6px] border-blue-700 text-white active:border-b-0 active:translate-y-[6px]',
      'bg-yellow-400 border-b-[6px] border-yellow-600 text-slate-900 active:border-b-0 active:translate-y-[6px]',
      'bg-green-500 border-b-[6px] border-green-700 text-white active:border-b-0 active:translate-y-[6px]',
    ];
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const renderConquerTree = (node: TreeNode, activeIds: Set<string>) => {
    if (node.type === 'leaf') {
      if (!activeIds.has(node.card.id)) return null;
      return renderCard(node.card);
    }
    
    const leftChild = renderConquerTree(node.left, activeIds);
    const rightChild = renderConquerTree(node.right, activeIds);
    
    if (!leftChild && !rightChild) return null;
    if (!leftChild) return rightChild;
    if (!rightChild) return leftChild;

    return (
      <div className={`flex flex-1 gap-2 md:gap-3 min-h-0 min-w-0 ${node.isRow ? 'flex-row' : 'flex-col'}`}>
        {leftChild}
        {rightChild}
      </div>
    );
  };

  const renderCard = (q: CardData) => {
    const isHidden = displayStrategy === 'hide';
    const isWildcard = q.type === 'w';
    
    const baseClasses = "w-full h-full flex-1 flex items-center justify-center rounded-2xl md:rounded-[2rem] text-4xl sm:text-5xl md:text-7xl font-black hover:opacity-90 transition-opacity";
    
    let colorClass = "";
    let content = "";

    if (isHidden) {
      colorClass = getCardColor(q.id, true);
      content = '❓'; 
    } else if (isWildcard) {
      colorClass = 'bg-purple-500 border-b-[6px] border-purple-700 text-white active:border-b-0 active:translate-y-[6px]';
      content = 'WILD';
    } else {
      colorClass = getCardColor(q.id);
      content = `${q.pts}`;
    }
    
    return (
      <button
        key={q.id}
        onClick={() => handleCardClick(q)}
        className={`${baseClasses} ${colorClass}`}
        style={{ minHeight: '90px', minWidth: '90px', textShadow: isHidden || (q.type !== 'w' && getCardColor(q.id).includes('yellow')) ? 'none' : '0 2px 4px rgba(0,0,0,0.3)' }}
      >
        {content}
      </button>
    );
  };

  if (gameState === 'editing' && editingQuiz) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <QuizEditor 
          initialQuiz={editingQuiz} 
          onSave={handleSaveQuiz} 
          onCancel={() => setGameState('setup')} 
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col text-slate-900">
      {gameState === 'setup' && (
        <div className="max-w-4xl w-full mx-auto p-6 md:p-12 flex-1 animate-in fade-in duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
            <h1 className="text-5xl md:text-6xl font-black tracking-tight text-center md:text-left flex" style={{ textShadow: '0 4px 0 rgba(0,0,0,0.1)' }}>
              <span className="text-red-500">T</span>
              <span className="text-blue-500">r</span>
              <span className="text-yellow-400">i</span>
              <span className="text-green-500">v</span>
              <span className="text-red-500">i</span>
              <span className="text-blue-500">a</span>
              <span className="text-yellow-400">T</span>
              <span className="text-green-500">o</span>
              <span className="text-red-500">s</span>
              <span className="text-blue-500">s</span>
              <span className="text-yellow-400">!</span>
            </h1>
            <div className="flex items-center justify-center md:justify-end">
              {user ? (
                <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-full border-2 border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-700 font-black">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border-2 border-slate-200" referrerPolicy="no-referrer" />
                    ) : (
                      <UserIcon className="w-5 h-5" />
                    )}
                    <span className="hidden sm:inline">{user.displayName || 'Teacher'}</span>
                  </div>
                  <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Logout">
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button onClick={loginWithGoogle} className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 font-black py-2 px-6 rounded-full transition-all shadow-sm">
                  <LogIn className="w-5 h-5" /> Teacher Login
                </button>
              )}
            </div>
          </div>
          
          <div className="space-y-8 bg-white p-8 md:p-10 rounded-[2rem] shadow-xl border-2 border-slate-200">
            
            <div className="bg-slate-100 p-6 rounded-2xl border-2 border-slate-200 mb-6">
              <label className="block text-sm font-black text-slate-700 mb-3 uppercase tracking-wider">Select Quiz</label>
              <div className="flex flex-col md:flex-row gap-4">
                <select 
                  value={selectedQuizId} 
                  onChange={e => setSelectedQuizId(e.target.value)}
                  className="flex-1 px-5 py-4 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-sm font-black text-lg text-slate-800 transition-all outline-none"
                >
                  {quizzes.map(q => (
                    <option key={q.id} value={q.id}>{q.name} ({q.bank.length} cards)</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleEditQuiz} className="flex items-center justify-center gap-2 px-6 py-4 bg-white hover:bg-slate-50 text-slate-700 border-b-[6px] border-slate-300 rounded-xl font-black transition-all active:border-b-0 active:translate-y-[6px]">
                    <Edit2 className="w-5 h-5" /> Edit
                  </button>
                  <button onClick={handleCreateQuiz} className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-500 hover:bg-blue-400 text-white border-b-[6px] border-blue-700 rounded-xl font-black transition-all active:border-b-0 active:translate-y-[6px]">
                    <Plus className="w-5 h-5" /> New
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="block text-sm font-black text-slate-700 uppercase tracking-wider">Teams</label>
                <input 
                  type="number" 
                  value={teamCount} 
                  onChange={e => setTeamCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-5 py-3 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-lg bg-white"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-black text-slate-700 uppercase tracking-wider">Questions per Game</label>
                <input 
                  type="number" 
                  value={questionCount} 
                  onChange={e => setQuestionCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-5 py-3 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-lg bg-white"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-black text-slate-700 uppercase tracking-wider">Board Fill Mode</label>
                <select 
                  value={mode} 
                  onChange={e => setMode(e.target.value as GameMode)}
                  className="w-full px-5 py-3 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-lg bg-white"
                >
                  <option value="standard">Standard Grid (Equal)</option>
                  <option value="conquer">Conquer Mode (Absorb)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-black text-slate-700 uppercase tracking-wider">Display Strategy</label>
                <select 
                  value={displayStrategy} 
                  onChange={e => setDisplayStrategy(e.target.value as DisplayStrategy)}
                  className="w-full px-5 py-3 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-lg bg-white"
                >
                  <option value="show">Show Points</option>
                  <option value="hide">Mystery Mode (Hidden)</option>
                </select>
              </div>
            </div>

            <button 
              onClick={startGame}
              className="mt-8 w-full bg-green-500 hover:bg-green-400 border-b-[8px] border-green-700 active:border-b-0 active:translate-y-[8px] text-white font-black py-5 px-8 rounded-2xl transition-all flex items-center justify-center gap-3 text-3xl"
            >
              <Play className="w-8 h-8 fill-current" /> PLAY NOW
            </button>
          </div>
        </div>
      )}

      {gameState === 'playing' && (
        <div className="flex-1 flex flex-col p-2 md:p-4 animate-in fade-in duration-500 bg-slate-50">
          <header className="flex flex-wrap gap-4 justify-center mb-4">
            {teams.map((t, i) => (
              <div 
                key={i} 
                className={`px-6 py-3 rounded-2xl font-black text-xl md:text-2xl transition-all duration-300 border-2 ${
                  i === currentTeamIdx 
                    ? 'bg-white text-slate-800 border-slate-300 scale-105 shadow-xl' 
                    : 'bg-slate-200 text-slate-400 border-transparent'
                }`}
              >
                {t.name}: {t.score}
              </div>
            ))}
          </header>

          <div className="flex-1 flex min-h-0 bg-slate-200 rounded-[2rem] p-3 md:p-4 shadow-inner border-2 border-slate-300 overflow-hidden relative">
            {mode === 'standard' ? (
              <div 
                className="w-full h-full grid gap-3 md:gap-4"
                style={{ 
                  gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(activeQuestions.length))}, minmax(0, 1fr))`,
                  gridAutoRows: '1fr'
                }}
              >
                {activeQuestions.map(renderCard)}
              </div>
            ) : (
              <div className="w-full h-full flex">
                {conquerTree && renderConquerTree(conquerTree, new Set(activeQuestions.map(q => q.id)))}
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-center pb-4">
            <button 
              onClick={nextTurn}
              className="bg-slate-300 hover:bg-slate-400 text-slate-700 border-b-[6px] border-slate-500 font-black py-4 px-10 rounded-2xl transition-all flex items-center gap-3 text-xl active:border-b-0 active:translate-y-[6px]"
            >
              <Target className="w-7 h-7" /> Missed the Board (Skip Turn)
            </button>
          </div>
        </div>
      )}

      {gameState === 'gameover' && (
        <div className="flex-1 flex items-center justify-center p-6 text-center animate-in zoom-in duration-500">
          <div className="bg-white border-2 border-slate-200 p-12 rounded-[3rem] shadow-xl max-w-2xl w-full">
            <h2 className="text-6xl font-black text-blue-500 mb-12" style={{ textShadow: '0 4px 0 rgba(0,0,0,0.1)' }}>Game Over!</h2>
            <div className="space-y-4 mb-12">
              {teams.sort((a, b) => b.score - a.score).map((t, i) => (
                <div key={i} className={`flex justify-between items-center px-8 py-5 rounded-2xl ${i === 0 ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-slate-50 border-2 border-slate-200'}`}>
                  <span className={`font-black text-2xl ${i === 0 ? 'text-yellow-600' : 'text-slate-600'}`}>
                    {i === 0 && '👑 '} {t.name}
                  </span>
                  <span className={`font-black text-4xl ${i === 0 ? 'text-yellow-600' : 'text-slate-600'}`}>{t.score}</span>
                </div>
              ))}
            </div>
            <button 
              onClick={() => setGameState('setup')}
              className="bg-blue-500 hover:bg-blue-400 border-b-[8px] border-blue-700 active:border-b-0 active:translate-y-[8px] text-white font-black py-5 px-10 rounded-2xl w-full transition-all text-2xl"
            >
              Return to Setup
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {selectedCard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-3xl w-full p-10 md:p-14 text-center animate-in fade-in zoom-in-95 duration-300 relative border-4 border-slate-200">
            
            <h3 className="text-4xl md:text-5xl font-black text-slate-800 mb-12 leading-tight">
              {selectedCard.type === 'q' ? selectedCard.q : selectedCard.text}
            </h3>

            {selectedCard.type === 'q' && (
              <div className="space-y-12">
                {showAnswer ? (
                  <div className="bg-slate-100 p-10 rounded-3xl border-2 border-slate-200 shadow-inner animate-in fade-in slide-in-from-top-8">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Answer</p>
                    <p className="text-4xl font-black text-slate-800">{selectedCard.a}</p>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowAnswer(true)}
                    className="bg-blue-500 hover:bg-blue-400 border-b-[8px] border-blue-700 active:border-b-0 active:translate-y-[8px] text-white font-black py-5 px-12 rounded-2xl text-2xl transition-all"
                  >
                    Show Answer
                  </button>
                )}

                {showAnswer && (
                  <div className="flex flex-col sm:flex-row gap-6 justify-center mt-8">
                    <button 
                      onClick={() => handleQuestionAnswer(false)}
                      className="flex-1 bg-red-500 hover:bg-red-400 border-b-[6px] border-red-700 active:border-b-0 active:translate-y-[6px] text-white font-black py-6 px-6 rounded-2xl text-2xl transition-all"
                    >
                      Incorrect
                    </button>
                    <button 
                      onClick={() => handleQuestionAnswer(true)}
                      className="flex-1 bg-green-500 hover:bg-green-400 border-b-[6px] border-green-700 active:border-b-0 active:translate-y-[6px] text-white font-black py-6 px-6 rounded-2xl text-2xl transition-all"
                    >
                      Correct (+{selectedCard.pts})
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedCard.type === 'w' && (
              <div className="mt-12">
                <button 
                  onClick={handleWildcardResolve}
                  className="bg-purple-500 hover:bg-purple-400 border-b-[8px] border-purple-700 active:border-b-0 active:translate-y-[8px] text-white font-black py-5 px-16 rounded-2xl text-3xl transition-all"
                >
                  Continue
                </button>
              </div>
            )}
            
            <button 
               onClick={() => setSelectedCard(null)} 
               className="absolute top-6 right-6 p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
               aria-label="Close"
            >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}