export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { existingQuestions } = req.body;

  const usedVocab = existingQuestions.filter(q => q.type === "vocab").map(q => q.en).join(", ");
  const usedGrammar = existingQuestions.filter(q => q.type === "grammar").map(q => q.question?.slice(0, 20)).join("; ");

  const prompt = `あなたは英語学習クイズの問題作成者です。学校・勉強をテーマにした新しい英語クイズ問題を8問生成してください。単語(vocab)3問、文法(grammar)3問、雑学(trivia)2問。既出単語: ${usedVocab || "なし"}。既出文法: ${usedGrammar || "なし"}。被らないこと。4択で答えは1つ。explanationは日本語で丁寧に、triviaは絵文字つきの豆知識。JSONのみ返す。
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
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content.map(i => i.text || "").join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const questions = JSON.parse(clean);

    return res.status(200).json({ questions });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate questions" });
  }
}
