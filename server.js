const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const envPath = [
  path.join(__dirname, "Exhibition.env"),
  path.join(__dirname, ".env"),
].find((candidate) => fs.existsSync(candidate));

if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const express = require("express");
const OpenAI = require("openai");

const PORT = Number(process.env.PORT) || 5173;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY || OPENAI_API_KEY.includes("your-key-here")) {
  console.error(
    "OPENAI_API_KEY가 없습니다. Exhibition.env 또는 .env에 키를 넣어 주세요."
  );
  process.exit(1);
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

async function titleForImage(imageUrl) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: 40,
    messages: [
      {
        role: "system",
        content:
          "당신은 사진 전시회의 큐레이터입니다. 이미지를 보고 한국어로 짧은 전시 작품 제목만 작성하세요. 제목은 2~8 단어, 설명 문장·따옴표·번호·이모지 없이 제목만 출력하세요.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "이 사진의 전시 제목을 한국어로 하나만 지어 주세요.",
          },
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "low" },
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() || "";
  return raw
    .replace(/^["'「『]+|["'」』]+$/g, "")
    .replace(/^제목\s*[:：]\s*/i, "")
    .trim();
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run()
  );
  await Promise.all(runners);
  return results;
}

app.post("/api/captions", async (req, res) => {
  const images = Array.isArray(req.body?.images) ? req.body.images : null;

  if (!images || images.length === 0) {
    res.status(400).json({ error: "images 배열이 필요합니다." });
    return;
  }

  if (images.length > 30) {
    res.status(400).json({ error: "한 번에 최대 30장까지 가능합니다." });
    return;
  }

  try {
    const captions = await mapPool(images, 4, async (item) => {
      const id = item?.id;
      const url = item?.url;

      if (typeof id !== "string" || typeof url !== "string") {
        return { id, title: "", error: "잘못된 항목" };
      }

      try {
        const title = await titleForImage(url);
        return { id, title };
      } catch (error) {
        console.error("caption failed:", id, error.message);
        return { id, title: "", error: "생성 실패" };
      }
    });

    res.json({ captions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "제목 생성 중 오류가 발생했습니다." });
  }
});

app.listen(PORT, () => {
  console.log(`Classic:  http://127.0.0.1:${PORT}/`);
  console.log(`AI edition: http://127.0.0.1:${PORT}/ai/`);
});
