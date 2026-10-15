'use client';
import { useState } from 'react';
import Link from 'next/link';
import { helpArticles } from '@/lib/site-content';
export function HelpCenter() {
  const [search,setSearch] = useState('');
  const [category,setCategory] = useState('All topics');
  const categories = ['All topics',...new Set(helpArticles.map(article => article.category))];
  const results = helpArticles.filter(article => (category === 'All topics' || article.category === category) && `${article.question} ${article.answer}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <><label className="field">Search the help center<input className="search-input" type="search" placeholder="Try “password”, “credits”, or “cancel”…" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="help-topics" role="group" aria-label="Filter topics">{categories.map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><p className="small-copy" role="status">{results.length} {results.length === 1 ? 'answer' : 'answers'} found</p>{results.map(article => <details className="faq" key={article.question}><summary>{article.question}</summary><p>{article.answer}</p></details>)}{!results.length && <div className="panel empty-state">No matching answers. Try a shorter search or <Link href="/contact" className="text-link">contact our team</Link>.</div>}</>;
}
