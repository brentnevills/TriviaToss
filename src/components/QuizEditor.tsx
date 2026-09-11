import { useState, useEffect } from 'react';
import { Quiz, QuizItem } from '../types';
import { Trash2, Plus, Save, ArrowLeft, HelpCircle, Zap } from 'lucide-react';

type Props = {
  initialQuiz: Quiz;
  onSave: (quiz: Quiz) => void;
  onAutoSave?: (quiz: Quiz) => void;
  onCancel: () => void;
};

export default function QuizEditor({ initialQuiz, onSave, onAutoSave, onCancel }: Props) {
  const [quiz, setQuiz] = useState<Quiz>(initialQuiz);
  
  // Auto-save whenever the quiz state changes
  useEffect(() => {
    if (onAutoSave) {
      onAutoSave(quiz);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz]);
  
  // New item state
  const [newItemType, setNewItemType] = useState<'q' | 'w'>(() => (localStorage.getItem('trivia-draft-type') as any) || 'q');
  
  // Q state
  const [qText, setQText] = useState(() => localStorage.getItem('trivia-draft-q') || '');
  const [aText, setAText] = useState(() => localStorage.getItem('trivia-draft-a') || '');
  const [qPts, setQPts] = useState(() => parseInt(localStorage.getItem('trivia-draft-qpts') || '100'));
  
  // W state
  const [wAction, setWAction] = useState<'free' | 'lose' | 'steal' | 'swap'>(() => (localStorage.getItem('trivia-draft-waction') as any) || 'free');
  const [wText, setWText] = useState(() => localStorage.getItem('trivia-draft-wtext') || '');
  const [wPts, setWPts] = useState(() => parseInt(localStorage.getItem('trivia-draft-wpts') || '200'));

  // Persist draft fields
  useEffect(() => { localStorage.setItem('trivia-draft-type', newItemType); }, [newItemType]);
  useEffect(() => { localStorage.setItem('trivia-draft-q', qText); }, [qText]);
  useEffect(() => { localStorage.setItem('trivia-draft-a', aText); }, [aText]);
  useEffect(() => { localStorage.setItem('trivia-draft-qpts', qPts.toString()); }, [qPts]);
  useEffect(() => { localStorage.setItem('trivia-draft-waction', wAction); }, [wAction]);
  useEffect(() => { localStorage.setItem('trivia-draft-wtext', wText); }, [wText]);
  useEffect(() => { localStorage.setItem('trivia-draft-wpts', wPts.toString()); }, [wPts]);

  const [editIndex, setEditIndex] = useState<number | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiCourse, setAiCourse] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(10);

  const handleGenerateAI = async () => {
    if (!aiCourse) return alert("Please enter a course code or name.");
    if (!aiTopic) return alert("Please enter a topic.");
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course: aiCourse, topic: aiTopic, count: aiCount })
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setQuiz({ ...quiz, bank: [...quiz.bank, ...data] });
        setAiTopic('');
      } else {
        alert(data.error || "Failed to generate questions");
      }
    } catch (e) {
      alert("Error calling generation API");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditClick = (idx: number, item: QuizItem) => {
    setEditIndex(idx);
    setNewItemType(item.type);
    if (item.type === 'q') {
      setQText(item.q);
      setAText(item.a);
      setQPts(item.pts);
    } else {
      setWAction(item.action);
      setWText(item.text);
      setWPts(item.pts);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddItem = () => {
    let newItem: QuizItem;
    if (newItemType === 'q') {
      if (!qText || !aText) {
        alert("Please enter question and answer text.");
        return;
      }
      newItem = { type: 'q', q: qText, a: aText, pts: qPts };
    } else {
      if (!wText) {
        alert("Please enter wildcard text.");
        return;
      }
      newItem = { type: 'w', action: wAction, text: wText, pts: wPts };
    }
    
    if (editIndex !== null) {
      const newBank = [...quiz.bank];
      newBank[editIndex] = newItem;
      setQuiz({ ...quiz, bank: newBank });
      setEditIndex(null);
    } else {
      setQuiz({ ...quiz, bank: [...quiz.bank, newItem] });
    }
    
    // Reset forms
    setQText('');
    setAText('');
    setWText('');
  };

  const handleRemoveItem = (index: number) => {
    const newBank = [...quiz.bank];
    newBank.splice(index, 1);
    setQuiz({ ...quiz, bank: newBank });
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    onSave(quiz);
    setTimeout(() => setIsSaving(false), 800);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-10 animate-in fade-in duration-500">
      <div className="flex items-center gap-6 mb-10">
        <button onClick={onCancel} className="p-3 bg-white hover:bg-slate-50 border-2 border-slate-300 rounded-2xl transition-all active:scale-95">
          <ArrowLeft className="w-6 h-6 text-slate-600" />
        </button>
        <h1 className="text-4xl font-black text-slate-800">Quiz Editor</h1>
      </div>

      <div className="bg-white p-8 rounded-[2rem] shadow-sm border-2 border-slate-200 mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-black text-slate-700 mb-3 uppercase tracking-wider">Quiz Name</label>
          <input 
            type="text" 
            value={quiz.name} 
            onChange={e => setQuiz({...quiz, name: e.target.value})}
            className="w-full px-5 py-4 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-black text-lg text-slate-800 transition-all outline-none"
            placeholder="e.g., Chapter 1 Review"
          />
        </div>
        <div>
          <label className="block text-sm font-black text-slate-700 mb-3 uppercase tracking-wider">Course / Subject</label>
          <input 
            type="text" 
            value={quiz.course || ''} 
            onChange={e => setQuiz({...quiz, course: e.target.value})}
            className="w-full px-5 py-4 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-black text-lg text-slate-800 transition-all outline-none"
            placeholder="e.g., Math 101"
          />
        </div>
        <div>
          <label className="block text-sm font-black text-slate-700 mb-3 uppercase tracking-wider">Author Name</label>
          <input 
            type="text" 
            value={quiz.authorName || ''} 
            onChange={e => setQuiz({...quiz, authorName: e.target.value})}
            className="w-full px-5 py-4 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-black text-lg text-slate-800 transition-all outline-none"
            placeholder="e.g., Mr. Smith"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border-2 border-slate-200 h-full">
            <h2 className="text-2xl font-black text-slate-800 mb-6">Create Card</h2>
            
            <div className="flex gap-3 mb-8 bg-slate-100 p-2 rounded-2xl border-2 border-slate-200">
              <button 
                onClick={() => setNewItemType('q')}
                className={`flex-1 py-3 px-4 rounded-xl font-black transition-all flex items-center justify-center gap-2 ${newItemType === 'q' ? 'bg-white text-blue-600 shadow-sm border-2 border-slate-200' : 'text-slate-500 hover:text-slate-700 border-2 border-transparent'}`}
              >
                <HelpCircle className="w-5 h-5" /> Question
              </button>
              <button 
                onClick={() => setNewItemType('w')}
                className={`flex-1 py-3 px-4 rounded-xl font-black transition-all flex items-center justify-center gap-2 ${newItemType === 'w' ? 'bg-white text-purple-500 shadow-sm border-2 border-slate-200' : 'text-slate-500 hover:text-slate-700 border-2 border-transparent'}`}
              >
                <Zap className="w-5 h-5" /> Wildcard
              </button>
            </div>

            {newItemType === 'q' ? (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Question</label>
                  <input type="text" value={qText} onChange={e => setQText(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-slate-800" placeholder="What is 2 + 2?" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Answer</label>
                  <input type="text" value={aText} onChange={e => setAText(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-slate-800" placeholder="4" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Points</label>
                  <input type="number" value={qPts} onChange={e => setQPts(Number(e.target.value))} className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-slate-800" />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Action</label>
                  <select value={wAction} onChange={e => setWAction(e.target.value as any)} className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-slate-800">
                    <option value="free">Free Points</option>
                    <option value="lose">Lose Points</option>
                    <option value="steal">Steal from Leader</option>
                    <option value="swap">Swap with Random Team</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Display Text</label>
                  <input type="text" value={wText} onChange={e => setWText(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-slate-800" placeholder="You found a treasure!" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Points (can be negative)</label>
                  <input type="number" value={wPts} onChange={e => setWPts(Number(e.target.value))} className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-slate-800" />
                </div>
              </div>
            )}
            
            <button onClick={handleAddItem} className="mt-8 w-full bg-slate-800 hover:bg-slate-700 border-b-[6px] border-slate-950 active:border-b-0 active:translate-y-[6px] text-white font-black py-4 px-4 rounded-xl flex items-center justify-center gap-2 transition-all">
              <Plus className="w-5 h-5" /> {editIndex !== null ? 'Update Card' : 'Add to Quiz'}
            </button>
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-sm border-2 border-slate-200">
            <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2">
              <Zap className="w-6 h-6 text-yellow-500" /> AI Question Generator
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Ontario Course</label>
                <input type="text" value={aiCourse} onChange={e => setAiCourse(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-slate-800" placeholder="e.g. SNC1W" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Topic</label>
                <input type="text" value={aiTopic} onChange={e => setAiTopic(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-slate-800" placeholder="e.g. Space Exploration" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Count</label>
                <input type="number" value={aiCount} onChange={e => setAiCount(Number(e.target.value))} className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-black text-slate-800" min="1" max="50" />
              </div>
              <button 
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className={`w-full font-black py-4 px-4 rounded-xl flex items-center justify-center gap-2 transition-all ${
                  isGenerating 
                    ? 'bg-slate-200 text-slate-400 border-b-[6px] border-slate-300 translate-y-[6px] border-b-0' 
                    : 'bg-yellow-400 hover:bg-yellow-300 border-b-[6px] border-yellow-600 active:border-b-0 active:translate-y-[6px] text-slate-900'
                }`}
              >
                {isGenerating ? 'Generating...' : 'Generate with Gemini'}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border-2 border-slate-200 h-full flex flex-col">
            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center justify-between">
              Quiz Bank <span className="bg-blue-100 text-blue-700 py-1 px-3 rounded-full text-sm font-black">{quiz.bank.length} cards</span>
            </h2>
            <div className="space-y-4 overflow-y-auto pr-2 flex-1 max-h-[600px]">
              {quiz.bank.map((item, idx) => (
                <div key={idx} className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 border-2 border-slate-200 rounded-2xl bg-white transition-all gap-4">
                  <div className="flex-1 min-w-0">
                    {item.type === 'q' ? (
                      <>
                        <p className="font-black text-slate-800 truncate mb-1"><span className="text-blue-500 mr-2">Q:</span>{item.q}</p>
                        <p className="text-sm font-bold text-slate-500 truncate"><span className="text-slate-400 mr-2">A:</span>{item.a}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-black text-purple-600 truncate"><span className="text-purple-400 mr-2">W ({item.action}):</span>{item.text}</p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-4 sm:justify-end">
                    <span className="font-black text-slate-300 text-xl whitespace-nowrap">{item.pts} pts</span>
                    <button onClick={() => handleEditClick(idx, item)} className="p-3 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors flex-shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100" title="Edit">
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleRemoveItem(idx)} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors flex-shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100" title="Delete">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
              {quiz.bank.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-4">
                  <HelpCircle className="w-12 h-12 opacity-50" />
                  <p className="font-bold">No cards in this quiz yet. Add some on the left!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={isSaving} className={`w-full ${isSaving ? 'bg-slate-400 border-slate-500 translate-y-[8px] border-b-0' : 'bg-green-500 hover:bg-green-400 border-b-[8px] border-green-700 active:border-b-0 active:translate-y-[8px]'} text-white font-black py-5 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 text-3xl`}>
        <Save className="w-7 h-7" /> {isSaving ? 'Saving to System...' : 'Save Quiz'}
      </button>

    </div>
  );
}
