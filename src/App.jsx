import { useState, useEffect, useRef } from "react";

const SEED_QUESTIONS = [
  { type: "vocab", en: "pencil", choices: ["鉛筆", "消しゴム", "定規", "ノート"], answer: "鉛筆", explanation: "pencil は「鉛筆」。ラテン語の peniculus が語源。", trivia: "🖊️ 鉛筆1本で書ける線の長さは約50km！" },
  { type: "vocab", en: "homework", choices: ["授業", "宿題", "試験", "成績"], answer: "宿題", explanation: "home（家）+ work（仕事）で、家でやる仕事という意味。", trivia: "📚 フィンランドでは宿題がほぼなく、世界トップクラスの学力！" },
  { type: "grammar", question: "「私は毎日学校へ行きます」の英訳は？", choices: ["I go to school every day.", "I went to school every day.", "I am going to school every day.", "I goes to school every day."], answer: "I go to school every day.", explanation: "習慣には現在形。主語が I なので goes ではなく go。", trivia: "🔄 英語の現在形は習慣・事実に使うことが多い！" },
  { type: "trivia", question: "英語で「カンニング」は何という？", choices: ["cunning", "cheating", "copying", "stealing"], answer: "cheating", explanation: "日本語の「カンニング」は和製英語！英語では cheating という。", trivia: "😅 「ノートパソコン」→ laptop など和製英語は多数！" },
];

const TOTAL_TIME = 60;
const TYPE_LABEL = { vocab: "単語", grammar: "文法", trivia: "雑学" };
const TYPE_COLOR = { vocab: "#38bdf8", grammar: "#a78bfa", trivia: "#fb923c" };
const MEDALS = ["🥇", "🥈", "🥉"];

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function today() { return new Date().toISOString().slice(0, 10); }

function lsGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

async function generateQuestions(existingQuestions) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ existingQuestions }),
  });
  if (!res.ok) throw new Error("Failed");
  const data = await res.json();
  return data.questions.map(q => ({ ...q, choices: shuffle(q.choices) }));
}

function loadRanking() {
  return lsGet("ranking-v1") || [];
}
function saveRanking(ranking) {
  lsSet("ranking-v1", ranking);
}
function submitScore(name, score, accuracy, total) {
  const ranking = loadRanking();
  const entry = { name, score, accuracy, total, date: today(), ts: Date.now() };
  const others = ranking.filter(r => r.name !== name);
  const myBest = ranking.find(r => r.name === name);
  const keep = myBest && myBest.score >= score ? myBest : entry;
  const updated = [...others, keep].sort((a, b) => b.score - a.score || b.accuracy - a.accuracy).slice(0, 50);
  saveRanking(updated);
  return updated;
}

export default function QuizGame() {
  const [phase, setPhase] = useState("loading");
  const [questions, setQuestions] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [playerName, setPlayerName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [genError, setGenError] = useState(false);
  const [tab, setTab] = useState("home");
  const timerRef = useRef(null);
  const sessionStart = useRef(null);

  const q = questions[current];

  useEffect(() => {
    const h = lsGet("quiz-history") || [];
    const qs = lsGet("quiz-questions") || [];
    const r = loadRanking();
    const name = lsGet("player-name");
    setHistory(h);
    setAllQuestions(qs.length > 0 ? qs : SEED_QUESTIONS);
    setRanking(r);
    if (name) { setPlayerName(name); setNameInput(name); }
    setPhase("idle");
  }, []);

  useEffect(() => {
    if (phase === "playing") {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { clearInterval(timerRef.current); setPhase("result"); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const startGame = async (useExisting = false) => {
    clearInterval(timerRef.current);
    setGenError(false);
    sessionStart.current = Date.now();
    setSubmitted(false);

    if (useExisting) {
      const qs = shuffle(allQuestions).slice(0, 10).map(q => ({ ...q, choices: shuffle(q.choices) }));
      setQuestions(qs); reset(); return;
    }
    setPhase("generating");
    try {
      const newQs = await generateQuestions(allQuestions);
      const combined = [...allQuestions, ...newQs];
      setAllQuestions(combined);
      lsSet("quiz-questions", combined);
      const qs = shuffle(newQs).slice(0, 10).map(q => ({ ...q, choices: shuffle(q.choices) }));
      setQuestions(qs); reset();
    } catch {
      setGenError(true);
      const qs = shuffle(allQuestions).slice(0, 10).map(q => ({ ...q, choices: shuffle(q.choices) }));
      setQuestions(qs); reset();
    }
  };

  const reset = () => {
    setCurrent(0); setScore(0); setMissed(0);
    setSelected(null); setShowExplanation(false); setResults([]);
    setTimeLeft(TOTAL_TIME); setPhase("playing");
  };

  const handleChoice = (choice) => {
    if (selected) return;
    const isCorrect = choice === q.answer;
    setSelected(choice); setShowExplanation(true);
    if (isCorrect) setScore(s => s + 1); else setMissed(m => m + 1);
    setResults(r => [...r, { ...q, selected: choice, correct: isCorrect }]);
  };

  const next = () => {
    setSelected(null); setShowExplanation(false);
    if (current + 1 >= questions.length) {
      clearInterval(timerRef.current);
      const elapsed = Math.round((Date.now() - sessionStart.current) / 1000);
      const acc = Math.round((score / questions.length) * 100);
      const session = { date: today(), score, missed, total: questions.length, accuracy: acc, elapsed };
      const h = [session, ...history].slice(0, 30);
      setHistory(h);
      lsSet("quiz-history", h);
      setPhase("result");
    } else {
      setCurrent(c => c + 1);
    }
  };

  const handleSubmitScore = () => {
    const name = nameInput.trim();
    if (!name) return;
    setSubmitting(true);
    setPlayerName(name);
    lsSet("player-name", name);
    const acc = Math.round((score / questions.length) * 100);
    const updated = submitScore(name, score, acc, questions.length);
    setRanking(updated);
    setSubmitting(false);
    setSubmitted(true);
  };

  const timerPct = (timeLeft / TOTAL_TIME) * 100;
  const timerColor = timeLeft > 30 ? "#34d399" : timeLeft > 15 ? "#facc15" : "#f87171";
  const accuracy = score + missed > 0 ? Math.round((score / (score + missed)) * 100) : 100;
  const totalSessions = history.length;
  const avgAccuracy = totalSessions > 0 ? Math.round(history.reduce((a, s) => a + s.accuracy, 0) / totalSessions) : 0;
  const bestScore = totalSessions > 0 ? Math.max(...history.map(s => s.score)) : 0;
  const myRank = playerName ? ranking.findIndex(r => r.name === playerName) + 1 : 0;

  const TABS = [
    { id: "home", label: "🏠 ホーム" },
    { id: "ranking", label: "🏆 ランキング" },
    { id: "history", label: "📊 履歴" },
  ];

  if (phase === "loading") return <div style={pageStyle}><div style={{ color: "#475569" }}>読み込み中...</div></div>;

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 18, textAlign: "center" }}>
        <div style={{ fontSize: 10, letterSpacing: 6, color: "#475569", marginBottom: 4 }}>AI ENGLISH QUIZ</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc" }}>英語トレーニング</div>
        {playerName && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>👤 {playerName}{myRank > 0 ? `　🏆 ${myRank}位` : ""}</div>}
      </div>

      {(phase === "idle" || phase === "result") && (
        <div style={{ display: "flex", gap: 6, marginBottom: 18, width: "100%", maxWidth: 420 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, background: tab === t.id ? "#1e293b" : "transparent", border: `1px solid ${tab === t.id ? "#334155" : "#1e293b"}`, borderRadius: 10, color: tab === t.id ? "#f1f5f9" : "#475569", fontSize: 11, fontWeight: 600, padding: "8px 4px", cursor: "pointer" }}>{t.label}</button>
          ))}
        </div>
      )}

      {phase === "generating" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 16, display: "inline-block", animation: "spin 1s linear infinite" }}>⚙️</div>
          <div style={{ fontSize: 15, color: "#94a3b8" }}>AIが新しい問題を作成中…</div>
        </div>
      )}
