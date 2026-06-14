import { useState, useEffect, useRef } from "react";

const SEED_QUESTIONS = [
  { type: "vocab", en: "pencil", choices: ["鉛筆", "消しゴム", "定規", "ノート"], answer: "鉛筆", explanation: "pencil は「鉛筆」。ラテン語の peniculus が語源。", trivia: "🖊️ 鉛筆1本で書ける線の長さは約50km！" },
  { type: "vocab", en: "homework", choices: ["授業", "宿題", "試験", "成績"], answer: "宿題", explanation: "home（家）+ work（仕事）で、家でやる仕事という意味。", trivia: "📚 フィンランドでは宿題がほぼなく、世界トップクラスの学力！" },
  { type: "grammar", question: "「私は毎日学校へ行きます」の英訳は？", choices: ["I go to school every day.", "I went to school every day.", "I am going to school every day.", "I goes to school every day."], answer: "I go to school every day.", explanation: "習慣には現在形。主語が I なので goes ではなく go。", trivia: "🔄 英語の現在形は習慣・事実に使うことが多い！" },
    { type: "trivia", question: "英語で「カンニング」は何という？", choices: ["cunning", "cheating", "copying", "stealing"], answer: "cheating", explanation: "日本語の「カンニング」は和製英語！英語では cheating という。", trivia: "😅 「ノートパソコン」→ laptop など和製英語は多数！" },
  { type: "geography", question: "みかんの生産量1位の都道府県は？", choices: ["和歌山県", "愛媛県", "静岡県", "長崎県"], answer: "和歌山県", explanation: "和歌山県は南向きの段々畑が多く、太陽光と海面反射の両方を受けられる。さらに黒潮の影響で冬も温暖で霜が少ない。実はこの「黒潮＋南向き斜面」という条件は、愛媛・静岡など太平洋側の産地全体に共通する強みでもある。", trivia: "🍊 和歌山・愛媛・静岡の上位3県で全国生産量の約半分を占める" },
];

const TOTAL_TIME = 60;
const TYPE_LABEL = { vocab: "単語", grammar: "文法", trivia: "雑学", geography: "地理" };
const TYPE_COLOR = { vocab: "#38bdf8", grammar: "#a78bfa", trivia: "#fb923c", geography: "#4ade80" };
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
        <div style={{ fontSize: 10, letterSpacing: 6, color: "#475569", marginBottom: 4 }}>LUMO ATLAS</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc" }}>Lumo Atlas</div>
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
            {(phase === "idle" || phase === "result") && tab === "home" && (
        <div style={{ width: "100%", maxWidth: 420 }}>
          {phase === "result" && (
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: "20px", marginBottom: 14 }}>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: 4, color: "#475569", marginBottom: 4 }}>RESULT</div>
                <div style={{ fontSize: 52, fontWeight: 900, color: "#34d399", lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>問正解 / {questions.length}問　正答率 {accuracy}%</div>
              </div>
              {!submitted ? (
                <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12 }}>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>🏆 ランキングに登録する</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="ニックネーム" maxLength={12} style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9", fontSize: 14, padding: "10px 12px", outline: "none" }} />
                    <button onClick={handleSubmitScore} disabled={submitting || !nameInput.trim()} style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, padding: "10px 16px", cursor: "pointer" }}>登録</button>
                  </div>
                </div>
              ) : (
                <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12, textAlign: "center", color: "#34d399", fontSize: 13 }}>✓ 登録完了！{myRank > 0 ? `現在 ${myRank}位` : ""}</div>
              )}
            </div>
          )}

          {totalSessions > 0 && (
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#475569", letterSpacing: 3, marginBottom: 10 }}>MY STATS</div>
              <div style={{ display: "flex", justifyContent: "space-around" }}>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 800, color: "#38bdf8" }}>{totalSessions}</div><div style={{ fontSize: 10, color: "#475569" }}>回プレイ</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>{avgAccuracy}%</div><div style={{ fontSize: 10, color: "#475569" }}>平均正答率</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 800, color: "#a78bfa" }}>{bestScore}</div><div style={{ fontSize: 10, color: "#475569" }}>最高正解</div></div>
                {myRank > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 800, color: "#fb923c" }}>{myRank}位</div><div style={{ fontSize: 10, color: "#475569" }}>順位</div></div>}
              </div>
            </div>
          )}

          {genError && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 10, textAlign: "center" }}>⚠️ AI生成に失敗。既存問題で開始します</div>}
          <button onClick={() => startGame(false)} style={{ ...primaryBtn("#059669", "#0891b2"), width: "100%", marginBottom: 10 }}>AIで新しい問題を生成 ✨</button>
          <button onClick={() => startGame(true)} style={{ width: "100%", background: "transparent", border: "1px solid #334155", borderRadius: 10, color: "#94a3b8", fontSize: 13, padding: "12px", cursor: "pointer" }}>既存の問題でプレイ（{allQuestions.length}問）</button>
        </div>
      )}

      {(phase === "idle" || phase === "result") && tab === "ranking" && (
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 12, textAlign: "center" }}>⚠️ 本番環境ではVercel KVで全ユーザー共有になります</div>
          {ranking.length === 0 ? (
            <div style={{ textAlign: "center", color: "#475569", fontSize: 14, padding: "40px 0" }}>まだ誰も登録していません</div>
          ) : ranking.map((r, i) => (
            <div key={i} style={{ background: r.name === playerName ? "#0f2318" : "#0f172a", border: `1px solid ${r.name === playerName ? "#34d399" : "#1e293b"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: i < 3 ? 22 : 14, fontWeight: 700, color: "#64748b", minWidth: 28, textAlign: "center" }}>{i < 3 ? MEDALS[i] : `${i + 1}`}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: r.name === playerName ? "#34d399" : "#f1f5f9" }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>{r.date}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>{r.score}<span style={{ fontSize: 11, color: "#475569" }}>/{r.total}</span></div>
                <div style={{ fontSize: 11, color: r.accuracy >= 80 ? "#34d399" : r.accuracy >= 60 ? "#facc15" : "#f87171" }}>{r.accuracy}%</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {(phase === "idle" || phase === "result") && tab === "history" && (
        <div style={{ width: "100%", maxWidth: 420 }}>
          {history.length === 0 ? (
            <div style={{ textAlign: "center", color: "#475569", fontSize: 14, padding: "40px 0" }}>まだ記録がありません</div>
          ) : history.map((s, i) => (
            <div key={i} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>{s.date}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: s.accuracy >= 80 ? "#34d399" : s.accuracy >= 60 ? "#facc15" : "#f87171" }}>{s.accuracy}%</span>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
                <span>✓ <strong style={{ color: "#34d399" }}>{s.score}</strong></span>
                <span>✗ <strong style={{ color: "#f87171" }}>{s.missed}</strong></span>
                <span style={{ color: "#475569" }}>/ {s.total}問</span>
                <span style={{ color: "#475569", marginLeft: "auto" }}>{s.elapsed}秒</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {phase === "playing" && q && (
        <div style={{ width: "100%", maxWidth: 460 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11, color: "#475569" }}>
              <span>TIME</span>
              <span style={{ color: timerColor, fontWeight: 700, fontSize: 16 }}>{timeLeft}s</span>
            </div>
            <div style={{ background: "#1e293b", borderRadius: 4, height: 5 }}>
              <div style={{ height: "100%", width: `${timerPct}%`, background: timerColor, transition: "width 1s linear, background 0.5s", borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, fontSize: 12, color: "#475569" }}>
            <span>✓ <strong style={{ color: "#34d399", fontSize: 16 }}>{score}</strong>　✗ <strong style={{ color: "#f87171", fontSize: 16 }}>{missed}</strong></span>
            <span>{current + 1} / {questions.length}</span>
          </div>
          <div style={{ background: "#0f172a", border: `2px solid ${selected ? (selected === q.answer ? "#34d399" : "#f87171") : "#1e293b"}`, borderRadius: 18, padding: "20px 18px", marginBottom: 14, transition: "border-color 0.2s" }}>
            <span style={{ fontSize: 11, color: TYPE_COLOR[q.type], border: `1px solid ${TYPE_COLOR[q.type]}`, borderRadius: 20, padding: "2px 10px", marginBottom: 12, display: "inline-block" }}>{TYPE_LABEL[q.type]}</span>
            {q.type === "vocab"
              ? <div style={{ fontSize: 40, fontWeight: 800, color: "#f1f5f9", textAlign: "center", marginTop: 8 }}>{q.en}</div>
              : <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", lineHeight: 1.7, marginTop: 8 }}>{q.question}</div>
            }
          </div>
          {!showExplanation && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {q.choices.map(c => (
                <button key={c} onClick={() => handleChoice(c)} style={{ background: "#1e293b", border: "2px solid #334155", borderRadius: 14, color: "#f1f5f9", fontSize: 14, fontWeight: 600, padding: "16px 10px", cursor: "pointer" }}>{c}</button>
              ))}
            </div>
          )}
          {showExplanation && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                {q.choices.map(c => {
                  const isCorrect = c === q.answer, isSelected = c === selected;
                  let bg = "#1e293b", border = "#1e293b", color = "#475569";
                  if (isCorrect) { bg = "#052e16"; border = "#34d399"; color = "#34d399"; }
                  else if (isSelected) { bg = "#2d0a0a"; border = "#f87171"; color = "#f87171"; }
                  return <div key={c} style={{ background: bg, border: `2px solid ${border}`, borderRadius: 14, color, fontSize: 14, fontWeight: 600, padding: "16px 10px", textAlign: "center" }}>{isCorrect ? "✓ " : isSelected ? "✗ " : ""}{c}</div>;
                })}
              </div>
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: "14px", marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, letterSpacing: 2 }}>EXPLANATION</div>
                <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.7 }}>{q.explanation}</div>
              </div>
              <div style={{ background: "#1a1200", border: "1px solid #854d0e", borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#ca8a04", marginBottom: 4, letterSpacing: 2 }}>TRIVIA</div>
                <div style={{ fontSize: 13, color: "#fef08a", lineHeight: 1.7 }}>{q.trivia}</div>
              </div>
              <button onClick={next} style={{ ...primaryBtn("#6366f1", "#8b5cf6"), width: "100%", fontSize: 14 }}>
                {current + 1 >= questions.length ? "結果を見る →" : "次の問題 →"}
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const pageStyle = { minHeight: "100vh", background: "#080c14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Helvetica Neue', sans-serif", color: "#e2e8f0", padding: "20px", boxSizing: "border-box" };
function primaryBtn(c1, c2) {
  return { background: `linear-gradient(135deg, ${c1}, ${c2})`, border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, padding: "14px 32px", cursor: "pointer", letterSpacing: 1 };
}

