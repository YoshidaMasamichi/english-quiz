export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { existingQuestions } = req.body;

  const usedVocab = existingQuestions.filter(q => q.type === "vocab").map(q => q.en).join(", ");
  const usedGrammar = existingQuestions.filter(q => q.type === "grammar").map(q => q.question?.slice(0, 20)).join("; ");

  const prompt = `あなたは英語学習クイズの問題作成者です。学校・勉強をテーマにした新しい英語クイズ問題を6問生成してください。単語(vocab)2問、文法(grammar)2問、雑学(trivia)2問。既出単語: ${usedVocab || "なし"}。既出文法: ${usedGrammar || "なし"}。被らないこと。4択で答えは1つ。

【重要なルール】
- 必ず1行のJSON配列のみを返す（改行・コードブロック・前置き不要）
- 文章中に "（ダブルクオート）は使わない。引用が必要な場合は「」を使う
- explanationは日本語で丁寧に、triviaは絵文字つきの豆知識

[{"type":"vocab","en":"英単語","choices":["正解","不正解1","不正解2","不正解3"],"answer":"正解","explanation":"解説","trivia":"😊 豆知識"},{"type":"grammar","question":"問題文","choices":["正解","不正解1","不正解2","不正解3"],"answer":"正解","explanation":"解説","trivia":"😊 豆知識"},{"type":"trivia","question":"問題文","choices":["正解","不正解1","不正解2","不正解3"],"answer":"正解","explanation":"解説","trivia":"😊 豆知識"}]`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!data.content) {
      console.error("Anthropic API error:", JSON.stringify(data));
      return res.status(500).json({ error: "Anthropic API error", detail: data });
    }

    const text = data.content.map(i => i.text || "").join("");

    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) {
      console.error("No JSON array found:", text);
      return res.status(500).json({ error: "No JSON array found", raw: text });
    }

    let clean = text.slice(start, end + 1);
    // JSON内の生の改行・タブを除去（AIが文章中に改行を入れてしまうのを防ぐ）
    clean = clean.replace(/[\r\n\t]+/g, " ");

    let questions;
    try {
      questions = JSON.parse(clean);
    } catch (parseErr) {
      console.error("Parse error:", parseErr.message, "RAW:", clean);
      return res.status(500).json({ error: "JSON parse failed", message: parseErr.message, raw: clean.slice(0, 500) });
    }

    return res.status(200).json({ questions });
  } catch (error) {
    console.error("Generate error:", error);
    return res.status(500).json({ error: "Failed to generate questions", message: error.message });
  }
}
