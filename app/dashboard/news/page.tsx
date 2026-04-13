'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, Clock, Search, X } from 'lucide-react';

interface NewsItem {
  title: string;
  description: string;
  link: string;
  originallink: string;
  pubDate: string;
}

const DEFAULT_KEYWORDS = ['코스피', '나스닥', '반도체', '미국주식', '환율', '부동산'];

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function extractSource(url: string) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    const map: Record<string, string> = {
      'chosun.com': '조선', 'joongang.co.kr': '중앙', 'donga.com': '동아',
      'hani.co.kr': '한겨레', 'hankyung.com': '한경', 'mk.co.kr': '매경',
      'edaily.co.kr': '이데일리', 'yna.co.kr': '연합', 'sedaily.com': '서경',
      'news.naver.com': '네이버', 'n.news.naver.com': '네이버',
    };
    for (const [k, v] of Object.entries(map)) {
      if (host.includes(k)) return v;
    }
    return host.split('.')[0].toUpperCase();
  } catch {
    return 'NEWS';
  }
}

export default function NewsPage() {
  const [activeKeyword, setActiveKeyword] = useState(DEFAULT_KEYWORDS[0]);
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortMode, setSortMode] = useState('date');

  const fetchNews = useCallback(async (keyword: string, sort = sortMode) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/news?query=${encodeURIComponent(keyword)}&display=20&sort=${sort}`);
      const data = await res.json();
      setNews(data.items || []);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sortMode]);

  useEffect(() => {
    fetchNews(activeKeyword);
    const interval = setInterval(() => fetchNews(activeKeyword), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [activeKeyword, fetchNews]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    const kw = searchInput.trim();
    if (!keywords.includes(kw)) setKeywords(prev => [...prev, kw]);
    setActiveKeyword(kw);
    setSearchInput('');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-black uppercase tracking-tight">뉴스 피드</h1>
          <p className="text-xs font-bold text-gray-500 mt-0.5">네이버 뉴스 실시간</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400 font-mono">
              <Clock size={12} className="inline mr-1" />
              {lastUpdated.toLocaleTimeString('ko-KR')}
            </span>
          )}
          <button
            onClick={() => fetchNews(activeKeyword)}
            className="flex items-center gap-1.5 px-3 py-2 border-2 border-black bg-[#FFE500] font-bold text-xs hover:shadow-[3px_3px_0_black] transition-all"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>
      </div>

      {/* Search + Sort */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className="flex-1 flex border-2 border-black max-w-md">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="키워드 검색..."
            className="flex-1 px-3 py-2 text-sm font-mono bg-white outline-none"
          />
          <button type="submit" className="px-3 bg-black text-white hover:bg-gray-800">
            <Search size={14} />
          </button>
        </div>
        <select
          value={sortMode}
          onChange={e => { setSortMode(e.target.value); fetchNews(activeKeyword, e.target.value); }}
          className="border-2 border-black px-3 py-2 text-sm font-bold bg-white outline-none cursor-pointer"
        >
          <option value="date">최신순</option>
          <option value="sim">관련도순</option>
        </select>
      </form>

      {/* Keyword Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {keywords.map(kw => (
          <button
            key={kw}
            onClick={() => setActiveKeyword(kw)}
            className={`flex items-center gap-1 px-3 py-1.5 border-2 border-black text-sm font-bold transition-all
              ${activeKeyword === kw
                ? 'bg-black text-[#FFE500] shadow-[3px_3px_0_#FFE500]'
                : 'bg-white text-black hover:bg-[#FFE500] hover:shadow-[3px_3px_0_black]'
              }`}
          >
            {kw}
            {!DEFAULT_KEYWORDS.includes(kw) && (
              <X
                size={12}
                onClick={e => {
                  e.stopPropagation();
                  setKeywords(prev => prev.filter(k => k !== kw));
                  if (activeKeyword === kw) setActiveKeyword(DEFAULT_KEYWORDS[0]);
                }}
                className="ml-1 hover:text-red-500"
              />
            )}
          </button>
        ))}
      </div>

      {/* News Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <RefreshCw size={32} className="animate-spin mx-auto mb-3 text-gray-400" />
            <p className="text-sm font-bold text-gray-500">뉴스 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {news.map((item, i) => (
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block border-2 border-black p-4 bg-white hover:bg-[#FFFDE7] hover:shadow-[4px_4px_0_black] transition-all group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black bg-black text-[#FFE500] px-2 py-0.5">
                  {extractSource(item.originallink || item.link)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono">{timeAgo(item.pubDate)}</span>
                  <ExternalLink size={12} className="text-gray-300 group-hover:text-black transition-colors" />
                </div>
              </div>
              <h3 className="text-sm font-bold text-black leading-snug mb-2 line-clamp-2">
                {item.title}
              </h3>
              {item.description && (
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                  {item.description}
                </p>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
