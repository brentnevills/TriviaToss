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

const getHoneycombLayout = (N: number) => {
  const C = Math.ceil(Math.sqrt(N));
  let coords = [];
  let itemsLeft = N;
  let isEven = true;
  let rowIdx = 0;
  
  while (itemsLeft > 0) {
    let capacity = isEven ? C : C - 1;
    let k = Math.min(itemsLeft, capacity);
    
    // Calculate integer offset to center the row on the global lattice
    const offset = Math.round((C - k) / 2 - (!isEven ? 0.5 : 0));
    
    for (let c = 0; c < k; c++) {
      coords.push({ rowIdx, colIdx: c + offset, k, C });
    }
    itemsLeft -= k;
    isEven = !isEven;
    rowIdx++;
  }
  
  const HEX_WIDTH = Math.sqrt(3);
  const HEX_HEIGHT = 2;
  const HORIZ_SPACING = Math.sqrt(3);
  const VERT_SPACING = 1.5;
  
  const spotsWithCenters = coords.map((spot, i) => {
    // Map strictly to a perfect offset honeycomb lattice
    const cx = (spot.colIdx + (spot.rowIdx % 2 === 1 ? 0.5 : 0)) * HORIZ_SPACING;
    const cy = spot.rowIdx * VERT_SPACING;
    return { ...spot, index: i, cx, cy };
  });
  
  let minCx = Infinity, maxCx = -Infinity;
  let minCy = Infinity, maxCy = -Infinity;
  spotsWithCenters.forEach(s => {
    minCx = Math.min(minCx, s.cx);
    maxCx = Math.max(maxCx, s.cx);
    minCy = Math.min(minCy, s.cy);
    maxCy = Math.max(maxCy, s.cy);
  });
  
  const totalWidth = (maxCx - minCx) + HEX_WIDTH;
  const totalHeight = (maxCy - minCy) + HEX_HEIGHT;
  const aspectRatio = totalWidth / totalHeight;
  
  return {
    aspectRatio,
    spots: spotsWithCenters.map(s => {
      const width = (HEX_WIDTH / totalWidth) * 100;
      const height = (HEX_HEIGHT / totalHeight) * 100;
      const left = ((s.cx - HEX_WIDTH/2 - (minCx - HEX_WIDTH/2)) / totalWidth) * 100;
      const top = ((s.cy - HEX_HEIGHT/2 - (minCy - HEX_HEIGHT/2)) / totalHeight) * 100;
      
      return {
        index: s.index,
        left,
        top,
        width,
        height,
        cx: left + width / 2,
        cy: top + height / 2
      };
    })
  };
};

export default function App() {
  const [gameState, setGameState] = useState<'setup' | 'editing' | 'playing' | 'gameover'>(() => {
    return (localStorage.getItem('trivia-game-state') as any) || 'setup';
  });
  
  // Quizzes state
  const [quizzes, setQuizzes] = useState<Quiz[]>([DEFAULT_QUIZ]);
  const [selectedQuizId, setSelectedQuizId] = useState<string>(() => {
    return localStorage.getItem('trivia-selected-quiz-id') || DEFAULT_QUIZ.id;
  });
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(() => {
    const saved = localStorage.getItem('trivia-editing-quiz');
    try { return saved ? JSON.parse(saved) : null; } catch { return null; }
  });

  // Persist current state across refreshes
  useEffect(() => { localStorage.setItem('trivia-game-state', gameState); }, [gameState]);
  useEffect(() => { localStorage.setItem('trivia-selected-quiz-id', selectedQuizId); }, [selectedQuizId]);
  useEffect(() => { 
    if (editingQuiz) localStorage.setItem('trivia-editing-quiz', JSON.stringify(editingQuiz));
    else localStorage.removeItem('trivia-editing-quiz');
  }, [editingQuiz]);

  // Setup state
  const [teams, setTeams] = useState<Team[]>([
    { name: 'Team 1', score: 0 },
    { name: 'Team 2', score: 0 }
  ]);
  const [questionCount, setQuestionCount] = useState(10);
  const [mode, setMode] = useState<GameMode>('standard');
  const [displayStrategy, setDisplayStrategy] = useState<DisplayStrategy>('hide');
  
  // Playing state
  const [currentTeamIdx, setCurrentTeamIdx] = useState(0);
  const [activeQuestions, setActiveQuestions] = useState<CardData[]>([]);
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);
  const [conquerSpots, setConquerSpots] = useState<string[]>([]);
  
  // Modal state
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  // Auth State
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Firestore quizzes regardless of user and merge with local
  useEffect(() => {
    const q = query(collection(db, 'quizzes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firestoreQuizzes: Quiz[] = snapshot.docs.map(doc => doc.data() as Quiz);
      
      let localQuizzes: Quiz[] = [];
      const saved = localStorage.getItem('trivia-quizzes');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) localQuizzes = parsed;
        } catch (e) {
          console.error('Failed to parse saved quizzes');
        }
      }

      // Merge and deduplicate by ID (firestore takes precedence if same ID)
      const uniqueQuizzesMap = new Map();
      localQuizzes.forEach(q => uniqueQuizzesMap.set(q.id, q));
      firestoreQuizzes.forEach(q => uniqueQuizzesMap.set(q.id, q));
      const uniqueQuizzes = Array.from(uniqueQuizzesMap.values());
      
      // Sort quizzes by course
      uniqueQuizzes.sort((a, b) => {
        const courseA = a.course || 'Uncategorized';
        const courseB = b.course || 'Uncategorized';
        return courseA.localeCompare(courseB);
      });

      setQuizzes([DEFAULT_QUIZ, ...uniqueQuizzes]);
    }, (error) => {
      console.error("Firestore onSnapshot error:", error);
      
      // Fallback: If Firestore fails entirely (e.g. offline), at least load local quizzes
      let localQuizzes: Quiz[] = [];
      const saved = localStorage.getItem('trivia-quizzes');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) localQuizzes = parsed;
        } catch (e) {}
      }
      setQuizzes([DEFAULT_QUIZ, ...localQuizzes]);
    });
    return () => unsubscribe();
  }, []);

  // Keep selectedQuizId valid
  useEffect(() => {
    if (quizzes.length > 0 && !quizzes.find(q => q.id === selectedQuizId)) {
      setSelectedQuizId(quizzes[0].id);
    }
  }, [quizzes, selectedQuizId]);

  const saveQuizzes = async (quiz: Quiz) => {
    // Optimistic update to prevent race conditions with selectedQuizId
    const existingIdx = quizzes.findIndex(q => q.id === quiz.id);
    let newQuizzes = [...quizzes];
    if (existingIdx >= 0) {
      newQuizzes[existingIdx] = quiz;
    } else {
      newQuizzes.push(quiz);
    }
    setQuizzes(newQuizzes);

    // Always save to Firestore so it can be accessed across devices
    try {
      const quizToSave = { 
        ...quiz, 
        userId: user ? user.uid : (quiz.userId || 'anonymous'), 
        authorName: quiz.authorName || user?.displayName || user?.email || 'Anonymous' 
      };
      await setDoc(doc(db, 'quizzes', quizToSave.id), quizToSave);
    } catch (err) {
      console.error("Failed to save to Firestore:", err);
      // Fallback to local storage if offline
      localStorage.setItem('trivia-quizzes', JSON.stringify(newQuizzes.filter(q => q.id !== 'default-quiz')));
    }
  };

  const handleCreateQuiz = () => {
    const newQuiz: Quiz = {
      id: `quiz-${Date.now()}`,
      name: 'New Quiz',
      course: '',
      authorName: user?.displayName || user?.email || '',
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
    
    // Auto-adjust question count to not exceed available cards
    const actualCount = Math.min(questionCount, selectedQuiz.bank.length);
    if (actualCount === 0) {
      alert("This quiz has no cards! Add some cards before playing.");
      return;
    }

    // Keep user's custom team names, just reset their scores
    setTeams(prev => prev.map(t => ({ ...t, score: 0 })));
    setCurrentTeamIdx(0);

    // Shuffle and add unique IDs
    const shuffled = [...selectedQuiz.bank].sort(() => 0.5 - Math.random());
    const selectedWithIds = shuffled.slice(0, actualCount).map((q, i) => ({
      ...q,
      id: `card-${i}-${Date.now()}`
    })) as CardData[];
    
    setActiveQuestions(selectedWithIds);
    setAnsweredIds([]);
    if (mode === 'conquer' && selectedWithIds.length > 0) {
      setConquerSpots(selectedWithIds.map(q => q.id));
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
    
    const answeredQId = selectedCard.id;
    const newAnsweredIds = [...answeredIds, answeredQId];
    
    if (mode === 'standard') {
      let newActive = [...activeQuestions];
      let newAnswered = [...newAnsweredIds];
      
      // If 5 answered, remove them to re-layout grid
      if (newAnsweredIds.length > 0 && newAnsweredIds.length % 5 === 0) {
        newActive = activeQuestions.filter(q => !newAnsweredIds.includes(q.id));
        newAnswered = [];
      }
      
      setActiveQuestions(newActive);
      setAnsweredIds(newAnswered);
      
      if (newActive.length - newAnswered.length === 0) {
        setTimeout(() => setGameState('gameover'), 500);
      }
    } else {
      // Conquer Mode
      setAnsweredIds(newAnsweredIds);
      
      const { spots: layout } = getHoneycombLayout(activeQuestions.length);
      let newConquerSpots = [...conquerSpots];
      
      const spotsToConquer = layout.filter(s => newConquerSpots[s.index] === answeredQId);
      
      spotsToConquer.forEach(spot => {
        let nearestNeighborId: string | null = null;
        let minDistance = Infinity;
        
        layout.forEach(otherSpot => {
          const ownerId = newConquerSpots[otherSpot.index];
          if (ownerId !== answeredQId && !newAnsweredIds.includes(ownerId)) {
            const dx = spot.cx - otherSpot.cx;
            const dy = spot.cy - otherSpot.cy;
            const dist = dx*dx + dy*dy;
            if (dist < minDistance) {
              minDistance = dist;
              nearestNeighborId = ownerId;
            }
          }
        });
        
        if (nearestNeighborId) {
          newConquerSpots[spot.index] = nearestNeighborId;
        }
      });
      
      setConquerSpots(newConquerSpots);
      
      if (newAnsweredIds.length === activeQuestions.length) {
        setTimeout(() => setGameState('gameover'), 500);
      }
    }
    
    setSelectedCard(null);
    nextTurn();
  };

  const getCardColor = (id: string, isMystery?: boolean, randomizeAll: boolean = false) => {
    // Extensive palette for secret mode to ensure high variety
    const extendedColors = [
      'bg-red-500', 'bg-blue-500', 'bg-yellow-400', 'bg-green-500', 
      'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500',
      'bg-indigo-500', 'bg-lime-500', 'bg-cyan-500', 'bg-rose-500',
      'bg-fuchsia-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500'
    ];
    
    // Core palette for standard mode (excluding purple which is reserved for wild)
    const standardColors = [
      'bg-red-500', 'bg-blue-500', 'bg-yellow-400', 'bg-green-500', 
      'bg-pink-500', 'bg-orange-500', 'bg-teal-500', 'bg-cyan-500'
    ];
    
    if (isMystery && randomizeAll) {
      // In secret mode (hide), assign a random color from the extended palette based on ID
       const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
       const baseColor = extendedColors[hash % extendedColors.length];
       return `${baseColor} ${baseColor.includes('yellow') || baseColor.includes('lime') || baseColor.includes('amber') ? 'text-slate-900' : 'text-white'}`;
    } else if (isMystery) {
      return 'bg-slate-200 text-slate-700';
    }

    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const baseColor = standardColors[hash % standardColors.length];
    return `${baseColor} ${baseColor.includes('yellow') ? 'text-slate-900' : 'text-white'}`;
  };

  // renderCard is no longer needed

  const renderHoneycomb = () => {
    const N = activeQuestions.length;
    if (N === 0) return null;
    
    const { aspectRatio, spots: layout } = getHoneycombLayout(N);
    
    // Group spots by territory (ownerId)
    const groups = new Map<string, typeof layout>();
    layout.forEach(spot => {
      const ownerId = mode === 'conquer' ? conquerSpots[spot.index] : activeQuestions[spot.index]?.id;
      if (!ownerId) return;
      if (!groups.has(ownerId)) groups.set(ownerId, []);
      groups.get(ownerId)!.push(spot);
    });
    
    return (
      <div className="absolute inset-2 md:inset-4 flex items-center justify-center pointer-events-none" style={{ containerType: 'size' }}>
        <div 
          className="relative pointer-events-none"
          style={{
            aspectRatio: `${aspectRatio}`,
            width: '100%',
            height: '100%',
            maxHeight: '100%',
            maxWidth: `calc(100cqh * ${aspectRatio})`,
            containerType: 'inline-size'
          }}
        >
          {Array.from(groups.entries()).map(([ownerId, spots]) => {
            const q = activeQuestions.find(x => x.id === ownerId);
            if (!q) return null;
            const isAnswered = answeredIds.includes(ownerId);
            
            const sumCx = spots.reduce((sum, s) => sum + s.cx, 0);
            const sumCy = spots.reduce((sum, s) => sum + s.cy, 0);
            const avgCx = sumCx / spots.length;
            const avgCy = sumCy / spots.length;
            
            const isHidden = displayStrategy === 'hide';
            const isWildcard = q.type === 'w';
            let colorClass = "";
            let content = "";
            if (isHidden) {
              colorClass = getCardColor(q.id, true, true);
              content = '❓'; 
            } else if (isWildcard) {
              colorClass = 'bg-purple-600 text-white';
              content = 'WILD';
            } else {
              colorClass = getCardColor(q.id);
              content = `${q.pts}`;
            }
            const hasDarkText = colorClass.includes('text-slate-900') || colorClass.includes('text-slate-700');
            
            return (
              <div
                key={`group-${ownerId}`}
                onClick={() => handleCardClick(q)}
                className="absolute inset-0 transition-opacity duration-700 ease-in-out cursor-pointer pointer-events-auto hover:brightness-110"
                style={{
                  opacity: isAnswered ? 0 : 1,
                  zIndex: isAnswered ? 0 : 10,
                  // Apply black border via drop shadow around the merged group
                  filter: isAnswered ? 'none' : 'drop-shadow(2px 2px 0 #000) drop-shadow(-2px -2px 0 #000) drop-shadow(2px -2px 0 #000) drop-shadow(-2px 2px 0 #000) drop-shadow(0 4px 6px rgba(0,0,0,0.5))'
                }}
              >
                {spots.map(spot => (
                  <div
                    key={`spot-${spot.index}`}
                    className={`absolute transition-all duration-700 ease-in-out ${colorClass}`}
                    style={{
                      left: `${spot.left}%`,
                      top: `${spot.top}%`,
                      width: `${spot.width}%`,
                      height: `${spot.height}%`,
                      clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                      transform: 'scale(1.0)' // Exact size, no overlapping
                    }}
                  />
                ))}
                
                <div 
                  className="absolute flex items-center justify-center font-black text-center pointer-events-none"
                  style={{
                    left: `${avgCx}%`,
                    top: `${avgCy}%`,
                    transform: 'translate(-50%, -50%)',
                    width: `${spots[0].width * 0.7}%`,
                    height: `${spots[0].height * 0.7}%`,
                    color: hasDarkText ? '#0f172a' : 'white',
                    textShadow: hasDarkText ? 'none' : '0 2px 4px rgba(0,0,0,0.6)',
                    fontSize: `calc(${spots[0].width}cqi * 0.25)`,
                    lineHeight: '1.1',
                    wordBreak: 'break-word',
                  }}
                >
                  {content}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (gameState === 'editing' && editingQuiz) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <QuizEditor 
          initialQuiz={editingQuiz} 
          onSave={handleSaveQuiz} 
          onAutoSave={(q) => { setEditingQuiz(q); saveQuizzes(q); }}
          onCancel={() => { setEditingQuiz(null); setGameState('setup'); }} 
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
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <label className="block text-sm font-black text-slate-700 uppercase tracking-wider">Select Quiz ({quizzes.length} available)</label>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={handleEditQuiz} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border-b-[4px] border-slate-300 rounded-xl font-black transition-all active:border-b-0 active:translate-y-[4px]">
                    <Edit2 className="w-4 h-4" /> Edit Selected
                  </button>
                  <button onClick={handleCreateQuiz} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white border-b-[4px] border-blue-700 rounded-xl font-black transition-all active:border-b-0 active:translate-y-[4px]">
                    <Plus className="w-4 h-4" /> New Quiz
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                {quizzes.map(q => (
                  <button 
                    key={q.id}
                    onClick={() => setSelectedQuizId(q.id)}
                    className={`flex flex-col text-left p-4 rounded-xl border-2 transition-all group ${selectedQuizId === q.id ? 'bg-blue-50 border-blue-500 ring-4 ring-blue-500/20 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm'}`}
                  >
                    <div className="flex justify-between items-start w-full mb-1 gap-2">
                      <h3 className="font-black text-slate-800 text-lg leading-tight line-clamp-2">{q.name}</h3>
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md shrink-0">{q.bank.length} cards</span>
                    </div>
                    <p className="text-sm font-bold text-slate-500 truncate w-full mt-1">Course: {q.course || 'Uncategorized'}</p>
                    <p className="text-xs text-slate-400 mt-2 font-medium truncate w-full">By: {q.authorName || 'Anonymous'}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4 md:col-span-2">
                <div className="flex justify-between items-end">
                  <label className="block text-sm font-black text-slate-700 uppercase tracking-wider">Teams</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => teams.length > 1 && setTeams(teams.slice(0, -1))}
                      className="p-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 font-bold"
                    >
                      - Remove
                    </button>
                    <button 
                      onClick={() => setTeams([...teams, { name: `Team ${teams.length + 1}`, score: 0 }])}
                      className="p-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 font-bold"
                    >
                      + Add Team
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {teams.map((t, i) => (
                    <input 
                      key={i}
                      type="text" 
                      value={t.name}
                      onChange={(e) => {
                        const newTeams = [...teams];
                        newTeams[i].name = e.target.value;
                        setTeams(newTeams);
                      }}
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-lg bg-white"
                      placeholder={`Team ${i+1}`}
                    />
                  ))}
                </div>
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
        <div className="flex-1 flex flex-col p-2 md:p-3 animate-in fade-in duration-500 bg-slate-50 h-screen overflow-hidden">
          <header className="flex flex-wrap gap-2 items-center justify-between mb-2 w-full px-3 py-2 bg-slate-800 text-white rounded-2xl shadow-md shrink-0">
            <div className="flex gap-2 items-center flex-1 overflow-x-auto pb-1 no-scrollbar">
              {teams.map((t, i) => (
                <div 
                  key={i} 
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-black transition-all border-2 shrink-0 ${
                    i === currentTeamIdx 
                      ? 'bg-white text-slate-800 border-white shadow-md' 
                      : 'bg-slate-700 text-slate-300 border-transparent'
                  }`}
                >
                  <input 
                    type="text"
                    value={t.name}
                    onChange={(e) => {
                      const newTeams = [...teams];
                      newTeams[i].name = e.target.value;
                      setTeams(newTeams);
                    }}
                    className="bg-transparent outline-none w-24 sm:w-32 placeholder-slate-400 font-black text-lg md:text-xl"
                    placeholder={`Team ${i+1}`}
                  />
                  <span className="text-lg md:text-xl">: {t.score}</span>
                </div>
              ))}
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={nextTurn}
                className="bg-red-500 hover:bg-red-400 text-white border-b-[4px] border-red-700 font-black py-1.5 px-3 rounded-xl transition-all flex items-center gap-2 text-sm active:border-b-0 active:translate-y-[4px]"
              >
                <Target className="w-4 h-4" /> Missed Board
              </button>
              
              <button 
                onClick={() => setGameState('setup')}
                className="bg-slate-600 hover:bg-slate-500 text-white border-b-[4px] border-slate-800 font-black py-1.5 px-3 rounded-xl transition-all flex items-center gap-2 text-sm active:border-b-0 active:translate-y-[4px]"
              >
                Home
              </button>
            </div>
          </header>

          <div className="flex-1 flex flex-col min-h-0 bg-slate-200 rounded-[2rem] p-2 md:p-3 shadow-inner border-2 border-slate-300 overflow-hidden relative">
            {renderHoneycomb()}
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