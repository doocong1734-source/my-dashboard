import { NextRequest, NextResponse } from 'next/server';

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || 'WLvsOawpAT3V87AdQrmx';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '8qYFix6w5h';

function cleanHtml(str: string) {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query = searchParams.get('query') || '코스피';
  const display = searchParams.get('display') || '20';
  const sort = searchParams.get('sort') || 'date';

  try {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
      next: { revalidate: 300 }, // 5분 캐시
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Naver API error', status: res.status }, { status: 500 });
    }

    const data = await res.json();
    const cleanItems = data.items.map((item: Record<string, string>) => ({
      ...item,
      title: cleanHtml(item.title),
      description: cleanHtml(item.description),
    }));

    return NextResponse.json({ ...data, items: cleanItems });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
