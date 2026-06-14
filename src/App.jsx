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
