import { useState, useEffect } from 'react';
import { Quiz, QuizItem } from '../types';
import { Trash2, Plus, Save, ArrowLeft, HelpCircle, Zap, Edit2 } from 'lucide-react';
import { User } from 'firebase/auth';
import CourseInput from './CourseInput';

type Props = {
  key?: string;
  user?: User | null;
  initialQuiz: Quiz;
  onSave: (quiz: Quiz) => void;
  onAutoSave?: (quiz: Quiz) => void;
  onCancel: () => void;
};

const safeGetItem = (key: string, fallback: string = ''): string => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

const formatDisplay = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.map(formatDisplay).join(', ');
  if (typeof val === 'object') {
    if (val.text) return formatDisplay(val.text);
    if (val.answer) return formatDisplay(val.answer);
    if (val.value) return formatDisplay(val.value);
    return JSON.stringify(val);
  }
  return String(val);
};

export default function QuizEditor({ user, initialQuiz, onSave, onAutoSave, onCancel }: Props) {
  const [quiz, setQuiz] = useState<Quiz>(() => ({
    ...initialQuiz,
    bank: Array.isArray(initialQuiz?.bank) ? initialQuiz.bank : []
  }));

  // Keep quiz in sync if a different initialQuiz is provided
  useEffect(() => {
    if (initialQuiz) {
      setQuiz({
        ...initialQuiz,
        bank: Array.isArray(initialQuiz.bank) ? initialQuiz.bank : []
      });
    }
  }, [initialQuiz?.id]);
  
  // Auto-save whenever the quiz state changes
  useEffect(() => {
    if (onAutoSave) {
      onAutoSave(quiz);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz]);
  
  // New item state
  const [newItemType, setNewItemType] = useState<'q' | 'w'>(() => (safeGetItem('trivia-draft-type') as any) || 'q');
  
  // Q state
  const [qText, setQText] = useState(() => safeGetItem('trivia-draft-q'));
  const [aText, setAText] = useState(() => safeGetItem('trivia-draft-a'));
  const [qPts, setQPts] = useState(() => {
    const parsed = parseInt(safeGetItem('trivia-draft-qpts', '20'));
    return isNaN(parsed) ? 20 : parsed;
  });
  
  // W state
  const [wAction, setWAction] = useState<'free' | 'lose' | 'steal' | 'swap'>(() => (safeGetItem('trivia-draft-waction') as any) || 'free');
  const [wText, setWText] = useState(() => safeGetItem('trivia-draft-wtext'));
  const [wPts, setWPts] = useState(() => {
    const parsed = parseInt(safeGetItem('trivia-draft-wpts', '20'));
    return isNaN(parsed) ? 20 : parsed;
  });

  // Persist draft fields
  useEffect(() => { try { localStorage.setItem('trivia-draft-type', newItemType); } catch {} }, [newItemType]);
  useEffect(() => { try { localStorage.setItem('trivia-draft-q', qText); } catch {} }, [qText]);
  useEffect(() => { try { localStorage.setItem('trivia-draft-a', aText); } catch {} }, [aText]);
  useEffect(() => { try { localStorage.setItem('trivia-draft-qpts', (qPts || 20).toString()); } catch {} }, [qPts]);
  useEffect(() => { try { localStorage.setItem('trivia-draft-waction', wAction); } catch {} }, [wAction]);
  useEffect(() => { try { localStorage.setItem('trivia-draft-wtext', wText); } catch {} }, [wText]);
  useEffect(() => { try { localStorage.setItem('trivia-draft-wpts', (wPts || 20).toString()); } catch {} }, [wPts]);

  const [editIndex, setEditIndex] = useState<number | null>(null);

  const handleEditClick = (idx: number, item: QuizItem) => {
    setEditIndex(idx);
    setNewItemType(item.type || 'q');
    if (item.type === 'q') {
      setQText(formatDisplay(item.q));
      setAText(formatDisplay(item.a));
      setQPts(typeof item.pts === 'number' ? item.pts : 20);
    } else {
      setWAction((item as any).action || 'free');
      setWText(formatDisplay((item as any).text));
      setWPts(typeof item.pts === 'number' ? item.pts : 20);
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

      <div className="bg-white p-8 rounded-[2rem] shadow-sm border-2 border-slate-200 mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
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
          <label className="block text-sm font-black text-slate-700 mb-3 uppercase tracking-wider">Course</label>
          <CourseInput 
            value={quiz.course || ''} 
            onChange={(val) => setQuiz({...quiz, course: val})}
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
        <div>
          <label className="block text-sm font-black text-slate-700 mb-3 uppercase tracking-wider">Visibility</label>
          <button
            onClick={() => setQuiz({...quiz, isPublic: quiz.isPublic === false ? true : false})}
            className={`w-full px-5 py-4 border-2 rounded-xl font-black text-lg transition-all outline-none flex items-center justify-center gap-2 ${
              quiz.isPublic !== false 
                ? 'bg-green-50 border-green-500 text-green-700' 
                : 'bg-slate-100 border-slate-300 text-slate-600'
            }`}
          >
            {quiz.isPublic !== false ? 'Public' : 'Private'}
          </button>
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
        </div>

        <div className="lg:col-span-7">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border-2 border-slate-200 h-full flex flex-col">
            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center justify-between">
              Quiz Bank <span className="bg-blue-100 text-blue-700 py-1 px-3 rounded-full text-sm font-black">{(quiz.bank || []).length} cards</span>
            </h2>
            <div className="space-y-3 overflow-y-auto pr-2 flex-1 max-h-[600px]">
              {(quiz.bank || []).map((item, idx) => (
                <div key={idx} className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 border-2 border-slate-200 rounded-2xl bg-white transition-all gap-4">
                  <div className="flex-1 min-w-0">
                    {item && item.type === 'q' ? (
                      <>
                        <p className="font-black text-slate-800 truncate mb-1">
                          <span className="text-blue-500 mr-2">Q:</span>
                          {formatDisplay(item.q)}
                        </p>
                        <p className="text-sm font-bold text-slate-500 truncate">
                          <span className="text-slate-400 mr-2">A:</span>
                          {formatDisplay(item.a)}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-black text-purple-600 truncate">
                          <span className="text-purple-400 mr-2">W ({item ? (item as any).action : 'wild'}):</span>
                          {item ? formatDisplay((item as any).text) : ''}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-4 sm:justify-end">
                    <span className="font-black text-slate-300 text-xl whitespace-nowrap">
                      {item && typeof item.pts === 'number' ? item.pts : (parseInt(String(item?.pts || '20')) || 20)} pts
                    </span>
                    <button onClick={() => item && handleEditClick(idx, item)} className="p-3 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors flex-shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100" title="Edit">
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleRemoveItem(idx)} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors flex-shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100" title="Delete">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
              {(!quiz.bank || quiz.bank.length === 0) && (
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
