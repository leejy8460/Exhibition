const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

async function titleForImage(apiKey, imageUrl) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
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

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );
  return results;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || pathname !== "/api/captions") {
      return json({ error: "Not found" }, 404);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON 본문이 필요합니다." }, 400);
    }

    const images = Array.isArray(body?.images) ? body.images : null;
    if (!images || images.length === 0) {
      return json({ error: "images 배열이 필요합니다." }, 400);
    }
    if (images.length > 8) {
      return json({ error: "한 요청에 최대 8장까지 가능합니다." }, 400);
    }

    try {
      const captions = await mapPool(images, 4, async (item) => {
        const id = item?.id;
        const url = item?.url;
        if (typeof id !== "string" || typeof url !== "string") {
          return { id, title: "", error: "잘못된 항목" };
        }
        try {
          const title = await titleForImage(env.OPENAI_API_KEY, url);
          return { id, title };
        } catch (error) {
          return { id, title: "", error: "생성 실패" };
        }
      });
      return json({ captions });
    } catch (error) {
      return json({ error: "제목 생성 중 오류가 발생했습니다." }, 500);
    }
  },
};
