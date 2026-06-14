export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { existingQuestions, genre = "mix" } = req.body;

  const usedVocab = existingQuestions.filter(q => q.type === "vocab").map(q => q.en).join(", ");
  const usedGrammar = existingQuestions.filter(q => q.type === "grammar").map(q => q.question?.slice(0, 20)).join("; ");
  const usedGeo = existingQuestions.filter(q => q.type === "geography").map(q => q.question?.slice(0, 25)).join("; ");

  let distribution;
  if (genre === "english") {
    distribution = "単語(vocab)3問、文法(grammar)3問、英語雑学(trivia)2問。地理問題は含めないこと。";
  } else if (genre === "geography") {
    distribution = "日本地理(geography)8問のみ。英語の問題は含めないこと。";
  } else {
    distribution = "単語(vocab)2問、文法(grammar)2問、英語雑学(trivia)2問、日本地理(geography)2問。";
  }

  const geoSection = genre !== "english" ? `

【地理問題(geography)の作り方】
- 「〇〇の生産量・出荷数・観光客数などが1位の都道府県は？」形式
- 対象は農産物・工業製品・観光・特産品など何でもよい
- explanationは必ず3層構造で書く：
  1. 答えとなる都道府県の直接的な理由（気候・地形・歴史など）
  2. その理由を支える、より広い地域・地方レベルの背景（なぜその地方全体が向いているか）
  両方を1つの文章として自然につなげる
- triviaにはシェア率や意外な事実を入れる
- 既出の地理問題: ${usedGeo || "なし"}` : "";

  const prompt = `あなたはLumo Atlasという知識クイズアプリの問題作成者です。新しいクイズ問題を8問生成してください。${distribution}既出単語: ${usedVocab || "なし"}。既出文法: ${usedGrammar || "なし"}。被らないこと。4択で答えは1つ。${geoSection}

【共通ルール】
- 必ず1行のJSON配列のみを返す（改行・コードブロック・前置き不要）
- 文章中に "（ダブルクオート）は使わない。引用が必要な場合は「」を使う
- vocab/grammar/triviaのexplanationは日本語で丁寧に、triviaフィールドは絵文字つきの豆知識

[{"type":"vocab","en":"英単語","choices":["正解","不正解1","不正解2","不正解3"],"answer":"正解","explanation":"解説","trivia":"😊 豆知識"},{"type":"grammar","question":"問題文","choices":["正解","不正解1","不正解2","不正解3"],"answer":"正解","explanation":"解説","trivia":"😊 豆知識"},{"type":"trivia","question":"問題文","choices":["正解","不正解1","不正解2","不正解3"],"answer":"正解","explanation":"解説","trivia":"😊 豆知識"},{"type":"geography","question":"〇〇の生産量1位の都道府県は？","choices":["正解","不正解1","不正解2","不正解3"],"answer":"正解","explanation":"県レベルの理由＋地方レベルの背景をつなげた解説","trivia":"😊 シェア率などの豆知識"}]`;

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
        max_tokens: 6000,
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
