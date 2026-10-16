import { HTML_TEMPLATE_FILES } from './htmlTemplateFiles';

export interface TemplateProduct {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  /** USD dollars (same as price; used by billing). */
  priceUsd?: number;
  category: 'website' | 'dashboard' | 'commerce' | 'mobile' | 'saas';
  categoryLabel: string;
  format: string;
  pagesCount: string;
  fileSize: string;
  updatedAt: string;
  description: string;
  features: string[];
  techStack: string[];
  accentColor: string;
  filename: string;
  htmlSource: string;
  previewUrl?: string;
}

export const TEMPLATES: TemplateProduct[] = [
  // STOREFRONT_TEMPLATES alias exported below for billing resolution
  {
    id: 'luma',
    name: 'Luma Creative Studio',
    subtitle: 'Editorial agency & digital studio website',
    price: 2490,
    category: 'website',
    categoryLabel: 'Website',
    format: 'Single-File HTML / CSS / JS',
    pagesCount: 'Full 6-Section Page',
    fileSize: '28 KB',
    updatedAt: 'Oct 2026',
    description:
      'A refined, editorial-style digital agency and creative studio landing page. Built as a zero-dependency single HTML file featuring an interactive work filter, studio manifesto, service capability breakdown, client metrics, and a working inquiry calculator.',
    features: [
      'Interactive case study showcase with live category filtering',
      'Built-in project budget & timeline estimator interactive widget',
      'Editorial typography hierarchy with warm alabaster and terracotta palette',
      'Zero external dependencies — 100% self-contained single HTML file'
    ],
    techStack: ['Semantic HTML5', 'Modern CSS Grid', 'Vanilla JS', 'Responsive'],
    accentColor: '#a25d49',
    filename: 'luma-creative-studio-template.html',
    htmlSource: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Luma — Creative Studio & Brand Direction</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f6f2ec;
      --surface: #ece5dc;
      --ink: #1e1c1a;
      --muted: #6e675f;
      --accent: #b85d43;
      --line: #dcd3c8;
      --font-display: 'Plus Jakarta Sans', sans-serif;
      --font-body: 'DM Sans', sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: var(--bg); color: var(--ink); font-family: var(--font-body); line-height: 1.6; }
    a { color: inherit; text-decoration: none; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 24px 5vw; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: rgba(246,242,236,0.92); backdrop-filter: blur(12px); z-index: 20; }
    .brand { font: 800 22px var(--font-display); letter-spacing: -0.04em; }
    nav { display: flex; gap: 32px; font-size: 14px; font-weight: 500; color: var(--muted); }
    nav a:hover { color: var(--ink); }
    .btn { display: inline-flex; align-items: center; gap: 8px; background: var(--ink); color: #fff; padding: 12px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 0; cursor: pointer; transition: transform .15s, background .15s; }
    .btn:hover { background: var(--accent); transform: translateY(-1px); }
    .hero { padding: 90px 5vw 80px; display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 48px; align-items: end; border-bottom: 1px solid var(--line); }
    .kicker { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; color: var(--accent); text-transform: uppercase; margin-bottom: 20px; }
    h1 { font: 700 clamp(44px, 6vw, 84px)/0.98 var(--font-display); letter-spacing: -0.04em; margin-bottom: 28px; }
    .hero-lead { font-size: 18px; color: var(--muted); max-width: 520px; margin-bottom: 36px; }
    .art-box { background: linear-gradient(145deg, #dfbeaa, #b85d43); height: 420px; border-radius: 16px; position: relative; overflow: hidden; display: flex; align-items: flex-end; padding: 32px; color: #fff; }
    .art-arch { position: absolute; right: -20px; top: 30px; width: 220px; height: 340px; border-radius: 120px 120px 0 0; background: rgba(255,255,255,0.18); backdrop-filter: blur(8px); }
    .section { padding: 84px 5vw; border-bottom: 1px solid var(--line); }
    .section-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 48px; gap: 24px; flex-wrap: wrap; }
    h2 { font: 700 clamp(30px, 4vw, 46px)/1.08 var(--font-display); letter-spacing: -0.03em; }
    .filters { display: flex; gap: 8px; }
    .filter-btn { padding: 8px 16px; border: 1px solid var(--line); background: transparent; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .filter-btn.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 28px; }
    .card { background: var(--surface); border-radius: 12px; padding: 24px; transition: transform .2s; }
    .card:hover { transform: translateY(-4px); }
    .card-visual { height: 220px; border-radius: 8px; margin-bottom: 20px; display: flex; align-items: flex-end; padding: 20px; font: 700 24px var(--font-display); color: #fff; }
    .meta { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    .services-list { display: grid; gap: 20px; }
    .service-row { display: grid; grid-template-columns: 80px 1fr 1fr auto; align-items: center; padding: 28px 0; border-top: 1px solid var(--line); gap: 20px; }
    .estimator { background: var(--surface); border-radius: 16px; padding: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .choice-group { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 24px; }
    .choice { padding: 10px 16px; border: 1px solid var(--line); background: var(--bg); border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .choice.selected { background: var(--accent); color: #fff; border-color: var(--accent); }
    footer { padding: 48px 5vw; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--muted); flex-wrap: wrap; gap: 16px; }
    @media (max-width: 768px) {
      .hero, .estimator, .service-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <a href="#" class="brand">luma.</a>
    <nav>
      <a href="#work">Selected Work</a>
      <a href="#capabilities">Capabilities</a>
      <a href="#estimator">Project Estimator</a>
      <a href="#contact">Contact</a>
    </nav>
    <a href="#estimator" class="btn">Start a Project ↗</a>
  </header>

  <section class="hero">
    <div>
      <div class="kicker">Creative Direction & Digital Product Studio</div>
      <h1>Ideas shaped into lasting digital impact.</h1>
      <p class="hero-lead">We partner with founders and cultural institutions to design expressive brand systems, editorial flagships, and conversion-focused web architectures.</p>
      <a href="#work" class="btn">Explore 2026 Archive →</a>
    </div>
    <div class="art-box">
      <div class="art-arch"></div>
      <div style="position:relative;z-index:2">
        <div style="font-size:12px;letter-spacing:0.1em;opacity:0.85">FEATURED MONOGRAPH</div>
        <div style="font:700 28px var(--font-display);margin-top:6px">Kanso Architectural Journal — +184% Subscriber Growth</div>
      </div>
    </div>
  </section>

  <section class="section" id="work">
    <div class="section-head">
      <div>
        <div class="kicker">Selected Commissions</div>
        <h2>Recent launches & transformations.</h2>
      </div>
      <div class="filters">
        <button class="filter-btn active" onclick="filterWork('all', this)">All Work</button>
        <button class="filter-btn" onclick="filterWork('brand', this)">Brand Identity</button>
        <button class="filter-btn" onclick="filterWork('digital', this)">Digital Flagship</button>
      </div>
    </div>
    <div class="grid" id="workGrid">
      <article class="card" data-cat="digital">
        <div class="card-visual" style="background:linear-gradient(135deg,#2a3429,#5d7359)">Aether Botanicals</div>
        <div class="meta">Digital Flagship · E-Commerce · 2026</div>
        <h3>Direct-to-Consumer Apothecary Storefront</h3>
        <p style="font-size:14px;color:var(--muted);margin-top:8px">Redesigned custom checkout flow resulting in +42% average order value.</p>
      </article>
      <article class="card" data-cat="brand">
        <div class="card-visual" style="background:linear-gradient(135deg,#3e2723,#a25d49)">Vespera Audio</div>
        <div class="meta">Brand Identity · Industrial Design · 2026</div>
        <h3>Acoustic Hardware Visual Identity</h3>
        <p style="font-size:14px;color:var(--muted);margin-top:8px">Complete typographic system, packaging, and interactive 3D product launch page.</p>
      </article>
      <article class="card" data-cat="digital">
        <div class="card-visual" style="background:linear-gradient(135deg,#1f2430,#4a5568)">Nordic Art Foundation</div>
        <div class="meta">Digital Flagship · Exhibition Portal · 2026</div>
        <h3>Interactive Curatorial Archive</h3>
        <p style="font-size:14px;color:var(--muted);margin-top:8px">Accessible high-resolution collection viewer serving 140,000 monthly visitors.</p>
      </article>
    </div>
  </section>

  <section class="section" id="capabilities">
    <div class="section-head">
      <div>
        <div class="kicker">Studio Capabilities</div>
        <h2>Disciplined craft across three pillars.</h2>
      </div>
    </div>
    <div class="services-list">
      <div class="service-row">
        <strong style="color:var(--accent);font-family:monospace">01.</strong>
        <h3 style="font-size:22px">Brand Strategy & Identity</h3>
        <p style="color:var(--muted);font-size:14px">Visual systems, custom typography direction, art direction, and design guidelines.</p>
        <span style="font-weight:700">4–6 Weeks</span>
      </div>
      <div class="service-row">
        <strong style="color:var(--accent);font-family:monospace">02.</strong>
        <h3 style="font-size:22px">Editorial Web Architecture</h3>
        <p style="color:var(--muted);font-size:14px">High-performance marketing sites, interactive storytelling, and headless commerce.</p>
        <span style="font-weight:700">6–8 Weeks</span>
      </div>
      <div class="service-row">
        <strong style="color:var(--accent);font-family:monospace">03.</strong>
        <h3 style="font-size:22px">Design Systems & UI Kits</h3>
        <p style="color:var(--muted);font-size:14px">Tokenized component libraries bridging Figma and production front-end code.</p>
        <span style="font-weight:700">4 Weeks</span>
      </div>
    </div>
  </section>

  <section class="section" id="estimator">
    <div class="estimator">
      <div>
        <div class="kicker">Interactive Scope Calculator</div>
        <h2>Estimate your project investment.</h2>
        <p style="color:var(--muted);margin-top:12px;font-size:15px">Select the deliverables you need for an immediate ballpark quote and timeline.</p>
        <div style="margin-top:32px;padding:24px;background:var(--bg);border-radius:12px">
          <div style="font-size:12px;color:var(--muted)">ESTIMATED INVESTMENT</div>
          <div id="estTotal" style="font:800 42px var(--font-display);color:var(--accent);margin:6px 0">$14,500</div>
          <div id="estWeeks" style="font-size:13px;color:var(--muted)">Estimated delivery: ~5 weeks</div>
        </div>
      </div>
      <div id="contact">
        <label style="font-size:13px;font-weight:700">1. Select Scope Pillars</label>
        <div class="choice-group" id="scopeChoices">
          <button type="button" class="choice selected" data-cost="6500" data-weeks="2" onclick="toggleChoice(this)">Brand Direction ($6.5k)</button>
          <button type="button" class="choice selected" data-cost="8000" data-weeks="3" onclick="toggleChoice(this)">Flagship Website ($8k)</button>
          <button type="button" class="choice" data-cost="4500" data-weeks="2" onclick="toggleChoice(this)">Design System ($4.5k)</button>
          <button type="button" class="choice" data-cost="3500" data-weeks="1" onclick="toggleChoice(this)">Copywriting & SEO ($3.5k)</button>
        </div>
        <label style="font-size:13px;font-weight:700;display:block;margin-bottom:8px">2. Your Work Email</label>
        <input id="leadEmail" type="email" placeholder="founder@studio.com" style="width:100%;padding:12px 14px;border-radius:8px;border:1px solid var(--line);background:var(--bg);margin-bottom:16px;font:inherit">
        <button class="btn" style="width:100%;justify-content:center" onclick="submitInquiry()">Request Custom Proposal ↗</button>
        <p id="leadMsg" style="font-size:12px;color:var(--accent);margin-top:10px"></p>
      </div>
    </div>
  </section>

  <footer>
    <strong>luma. creative studio</strong>
    <span>Single-File Production HTML Template · Built by PixelForge</span>
    <span>© 2026 Luma Studio. All rights reserved.</span>
  </footer>

  <script>
    function filterWork(cat, btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#workGrid .card').forEach(card => {
        card.style.display = (cat === 'all' || card.dataset.cat === cat) ? 'block' : 'none';
      });
    }
    function toggleChoice(el) {
      el.classList.toggle('selected');
      let total = 0, weeks = 0;
      document.querySelectorAll('#scopeChoices .choice.selected').forEach(c => {
        total += Number(c.dataset.cost);
        weeks += Number(c.dataset.weeks);
      });
      document.getElementById('estTotal').textContent = '$' + total.toLocaleString();
      document.getElementById('estWeeks').textContent = weeks ? 'Estimated delivery: ~' + weeks + ' weeks' : 'Select at least one pillar';
    }
    function submitInquiry() {
      const email = document.getElementById('leadEmail').value.trim();
      const total = document.getElementById('estTotal').textContent;
      document.getElementById('leadMsg').textContent = email
        ? 'Proposal request for ' + total + ' prepared for ' + email + '!'
        : 'Please enter your work email above.';
    }
  </script>
</body>
</html>`
  },
  {
    id: 'nova',
    name: 'Nova Admin Dashboard',
    subtitle: 'Executive SaaS analytics & customer operations',
    price: 3490,
    category: 'dashboard',
    categoryLabel: 'Dashboard',
    format: 'Single-File HTML / CSS / JS',
    pagesCount: 'Full App Workspace',
    fileSize: '34 KB',
    updatedAt: 'Oct 2026',
    description:
      'A high-density executive SaaS analytics workspace and customer operations dashboard in a single portable file. Includes interactive timeframe switching, live search and status filtering across customer cohorts, revenue telemetry charts, and CSV export.',
    features: [
      'Interactive 7d / 30d / 90d / 12m KPI and SVG revenue chart switcher',
      'Live searchable customer accounts table with MRR sorting & CSV export',
      'Collapsible sidebar navigation with dark/light contrast balance',
      'Tabular-numeral financial metrics with zero external library bloat'
    ],
    techStack: ['Single HTML5 File', 'Interactive SVG Charts', 'CSV Export JS', 'Dark Sidebar UI'],
    accentColor: '#635bff',
    filename: 'nova-admin-dashboard-template.html',
    htmlSource: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nova — Executive SaaS Analytics Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f8fafc;
      --sidebar: #111827;
      --ink: #0f172a;
      --muted: #64748b;
      --accent: #635bff;
      --green: #0d9488;
      --line: #e2e8f0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--ink); display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
    aside { background: var(--sidebar); color: #e2e8f0; padding: 24px 16px; display: flex; flex-direction: column; gap: 28px; }
    .brand { font: 700 20px 'Plus Jakarta Sans', sans-serif; color: #fff; display: flex; align-items: center; gap: 10px; padding: 0 8px; }
    .brand-dot { width: 26px; height: 26px; border-radius: 7px; background: var(--accent); display: grid; place-items: center; font-size: 13px; }
    .nav-list { display: flex; flex-direction: column; gap: 4px; }
    .nav-item { padding: 10px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; color: #94a3b8; cursor: pointer; border: 0; background: none; text-align: left; }
    .nav-item.active, .nav-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
    main { padding: 28px 36px; overflow-x: auto; }
    .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; gap: 16px; flex-wrap: wrap; }
    h1 { font: 700 24px 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.02em; }
    .segmented { display: flex; background: #e2e8f0; padding: 3px; border-radius: 8px; gap: 2px; }
    .seg-btn { border: 0; background: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; color: #475569; }
    .seg-btn.active { background: #fff; color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
    .kpi-label { font-size: 12px; color: var(--muted); font-weight: 500; }
    .kpi-val { font: 600 28px 'JetBrains Mono', monospace; margin: 8px 0 6px; letter-spacing: -0.03em; }
    .kpi-delta { font-size: 12px; color: var(--green); font-weight: 600; }
    .chart-box { margin-bottom: 24px; }
    .table-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
    input.search { padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; width: 240px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid var(--line); }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .btn-export { background: var(--ink); color: #fff; border: 0; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
    @media (max-width: 900px) { body { grid-template-columns: 1fr; } .kpi-grid { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>
  <aside>
    <div class="brand"><span class="brand-dot">◈</span> Nova Cloud</div>
    <div class="nav-list">
      <button class="nav-item active">Executive Overview</button>
      <button class="nav-item">Revenue Cohorts</button>
      <button class="nav-item">Enterprise Accounts</button>
      <button class="nav-item">API Telemetry</button>
      <button class="nav-item">Billing & Invoices</button>
    </div>
    <div style="margin-top:auto;padding:14px;background:rgba(255,255,255,0.05);border-radius:10px;font-size:12px;color:#94a3b8">
      <strong style="color:#fff;display:block;margin-bottom:4px">Q4 Revenue Target</strong>
      86.4% achieved ($412k / $480k)
    </div>
  </aside>

  <main>
    <div class="topbar">
      <div>
        <h1>Executive Revenue & Operations</h1>
        <p style="font-size:13px;color:var(--muted)">Real-time subscription telemetry and enterprise account health.</p>
      </div>
      <div class="segmented">
        <button class="seg-btn" onclick="setRange('7d', this)">7 Days</button>
        <button class="seg-btn active" onclick="setRange('30d', this)">30 Days</button>
        <button class="seg-btn" onclick="setRange('90d', this)">90 Days</button>
        <button class="seg-btn" onclick="setRange('12m', this)">12 Months</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="card">
        <div class="kpi-label">Net Monthly Recurring Revenue</div>
        <div class="kpi-val" id="kpiMrr">$84,920</div>
        <div class="kpi-delta">↗ +18.4% vs prior period</div>
      </div>
      <div class="card">
        <div class="kpi-label">Active Enterprise Seats</div>
        <div class="kpi-val" id="kpiUsers">14,290</div>
        <div class="kpi-delta">↗ +9.2% net expansion</div>
      </div>
      <div class="card">
        <div class="kpi-label">Net Dollar Retention</div>
        <div class="kpi-val" id="kpiNdr">118.6%</div>
        <div class="kpi-delta">↗ Top decile benchmark</div>
      </div>
      <div class="card">
        <div class="kpi-label">Logo Churn Rate</div>
        <div class="kpi-val" id="kpiChurn">0.84%</div>
        <div class="kpi-delta">↘ -0.3% improvement</div>
      </div>
    </div>

    <div class="card chart-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <strong style="font-size:14px">Cumulative ARR Growth Trajectory</strong>
        <span style="font-size:12px;color:var(--muted)">Updated live · Tabular USD</span>
      </div>
      <svg viewBox="0 0 800 180" style="width:100%;height:180px">
        <defs>
          <linearGradient id="novaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#635bff" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#635bff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path id="chartArea" d="M0,150 C100,140 160,110 240,115 C320,120 400,75 480,68 C560,60 640,35 800,18 L800,180 L0,180 Z" fill="url(#novaGrad)"/>
        <path id="chartLine" d="M0,150 C100,140 160,110 240,115 C320,120 400,75 480,68 C560,60 640,35 800,18" fill="none" stroke="#635bff" stroke-width="3" stroke-linecap="round"/>
      </svg>
    </div>

    <div class="card">
      <div class="table-head">
        <strong style="font-size:15px">Enterprise Customer Cohorts</strong>
        <div style="display:flex;gap:10px">
          <input class="search" id="searchBox" placeholder="Filter by customer or plan..." oninput="renderRows()">
          <button class="btn-export" onclick="exportCsv()">Export CSV ↓</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Account Name</th>
            <th>Tier</th>
            <th>Seats</th>
            <th>Monthly MRR</th>
            <th>Health</th>
          </tr>
        </thead>
        <tbody id="customerBody"></tbody>
      </table>
    </div>
  </main>

  <script>
    const ACCOUNTS = [
      { name: 'Linearity Systems', tier: 'Enterprise', seats: 420, mrr: 14800, health: '98% Optimal' },
      { name: 'Vanguard BioLabs', tier: 'Enterprise', seats: 310, mrr: 11200, health: '96% Optimal' },
      { name: 'Kinetix Robotics', tier: 'Growth', seats: 145, mrr: 5400, health: '92% Healthy' },
      { name: 'Aether Cloud Corp', tier: 'Enterprise', seats: 580, mrr: 19600, health: '99% Optimal' },
      { name: 'Solstice Financial', tier: 'Growth', seats: 95, mrr: 3800, health: '89% Healthy' }
    ];
    const RANGES = {
      '7d': { mrr: '$21,480', users: '13,940', ndr: '116.2%', churn: '0.91%' },
      '30d': { mrr: '$84,920', users: '14,290', ndr: '118.6%', churn: '0.84%' },
      '90d': { mrr: '$248,600', users: '15,120', ndr: '121.0%', churn: '0.79%' },
      '12m': { mrr: '$1,018,400', users: '18,400', ndr: '124.5%', churn: '0.72%' }
    };
    function setRange(key, btn) {
      document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const d = RANGES[key];
      document.getElementById('kpiMrr').textContent = d.mrr;
      document.getElementById('kpiUsers').textContent = d.users;
      document.getElementById('kpiNdr').textContent = d.ndr;
      document.getElementById('kpiChurn').textContent = d.churn;
    }
    function renderRows() {
      const q = document.getElementById('searchBox').value.toLowerCase();
      const filtered = ACCOUNTS.filter(a => a.name.toLowerCase().includes(q) || a.tier.toLowerCase().includes(q));
      document.getElementById('customerBody').innerHTML = filtered.map(a => \`
        <tr>
          <td><strong>\${a.name}</strong></td>
          <td>\${a.tier}</td>
          <td class="mono">\${a.seats}</td>
          <td class="mono">$\${a.mrr.toLocaleString()}</td>
          <td style="color:#0d9488;font-weight:600">\${a.health}</td>
        </tr>
      \`).join('');
    }
    function exportCsv() {
      const csv = 'Account,Tier,Seats,MRR,Health\\n' + ACCOUNTS.map(a => \`\${a.name},\${a.tier},\${a.seats},\${a.mrr},\${a.health}\`).join('\\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'nova-accounts.csv'; a.click();
    }
    renderRows();
  </script>
</body>
</html>`
  },
  {
    id: 'forma',
    name: 'Forma Goods Store',
    subtitle: 'Minimalist architectural home goods storefront',
    price: 2990,
    category: 'commerce',
    categoryLabel: 'E-Commerce',
    format: 'Single-File HTML / CSS / JS',
    pagesCount: 'Full Storefront + Cart',
    fileSize: '31 KB',
    updatedAt: 'Oct 2026',
    description:
      'A tactile, minimalist e-commerce storefront designed for industrial design objects, ceramics, and home goods. Includes category filtering, quick-add bag drawer, live quantity calculation, and currency formatting in a single portable file.',
    features: [
      'Slide-over shopping bag drawer with live item subtotal & quantity controls',
      'Category filter tabs across Ceramics, Lighting, and Desk Objects',
      'Warm travertine palette with editorial product cards',
      'Self-contained HTML file ready to connect to Stripe Payment Links or Shopify Buy'
    ],
    techStack: ['Single HTML5 File', 'Interactive Cart Drawer', 'CSS Grid Catalog', 'Zero Dependencies'],
    accentColor: '#7c5e3c',
    filename: 'forma-goods-store-template.html',
    htmlSource: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FORMA® — Objects for Better Living</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #f4efe6; --card: #ebe3d5; --ink: #26221c; --muted: #756c5e; --line: #dcd2c0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--ink); font-family: 'DM Sans', sans-serif; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 22px 5vw; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: rgba(244,239,230,0.94); z-index: 10; }
    .brand { font: 700 20px 'Plus Jakarta Sans', sans-serif; letter-spacing: 0.14em; }
    .bag-btn { background: var(--ink); color: #fff; border: 0; padding: 10px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .hero { padding: 72px 5vw; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; border-bottom: 1px solid var(--line); }
    h1 { font: 700 clamp(38px, 5vw, 64px)/1.02 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.03em; margin: 14px 0 20px; }
    .catalog { padding: 64px 5vw; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; margin-top: 32px; }
    .item { background: var(--card); border-radius: 10px; padding: 20px; display: flex; flex-direction: column; }
    .vessel { height: 220px; border-radius: 8px; background: #d8cbb8; margin-bottom: 16px; display: grid; place-items: center; position: relative; }
    .shape { width: 84px; height: 120px; background: #9c7e5e; border-radius: 42px 42px 12px 12px; box-shadow: inset -14px 0 #7f6346; }
    .drawer { position: fixed; right: 0; top: 0; height: 100vh; width: min(380px, 100%); background: #fff; padding: 28px; box-shadow: -20px 0 50px rgba(0,0,0,0.15); transform: translateX(105%); transition: .25s; z-index: 30; display: flex; flex-direction: column; }
    .drawer.open { transform: translateX(0); }
    @media (max-width: 768px) { .hero { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div class="brand">FORMA®</div>
    <nav style="display:flex;gap:24px;font-size:13px;color:var(--muted)">
      <a href="#shop" style="color:inherit;text-decoration:none">Collection</a>
      <a href="#craft" style="color:inherit;text-decoration:none">Materiality</a>
    </nav>
    <button class="bag-btn" onclick="toggleBag(true)">Bag (<span id="bagCount">0</span>)</button>
  </header>

  <section class="hero">
    <div>
      <div style="font-size:11px;letter-spacing:0.15em;color:var(--muted)">AUTUMN / WINTER ARCHIVE 2026</div>
      <h1>Tactile objects for quiet daily rituals.</h1>
      <p style="color:var(--muted);max-width:440px;margin-bottom:28px">Small-batch stoneware, spun brass lighting, and architectural desk instruments crafted in Kyoto and Copenhagen.</p>
      <a href="#shop" class="bag-btn" style="text-decoration:none;display:inline-block">Explore Collection ↓</a>
    </div>
    <div style="height:360px;background:#dfd3c0;border-radius:14px;display:grid;place-items:center">
      <div style="width:140px;height:200px;background:#8c6d4e;border-radius:70px 70px 12px 12px;box-shadow:24px 20px 0 #baa88f"></div>
    </div>
  </section>

  <section class="catalog" id="shop">
    <h2 style="font:700 32px 'Plus Jakarta Sans',sans-serif">Permanent Collection</h2>
    <div class="grid" id="shopGrid"></div>
  </section>

  <aside class="drawer" id="bagDrawer">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:16px">
      <strong>Your Shopping Bag</strong>
      <button onclick="toggleBag(false)" style="border:0;background:none;font-size:18px;cursor:pointer">✕</button>
    </div>
    <div id="bagList" style="flex:1;overflow:auto;padding:16px 0"></div>
    <div style="border-top:1px solid var(--line);padding-top:16px">
      <div style="display:flex;justify-content:space-between;font-weight:700;margin-bottom:14px">
        <span>Subtotal</span><span id="bagTotal">$0</span>
      </div>
      <button class="bag-btn" style="width:100%" onclick="alert('Demo Storefront: Ready to connect to Stripe Checkout')">Proceed to Checkout ↗</button>
    </div>
  </aside>

  <script>
    const ITEMS = [
      { id: 1, name: 'Hasami Carafe No. 04', cat: 'Ceramics', price: 118, tone: '#9c7e5e' },
      { id: 2, name: 'Brushed Brass Task Lamp', cat: 'Lighting', price: 340, tone: '#b59257' },
      { id: 3, name: 'Travertine Bookend Pair', cat: 'Objects', price: 165, tone: '#8c8275' },
      { id: 4, name: 'Hinoki Wood Desk Tray', cat: 'Objects', price: 94, tone: '#c29b6c' }
    ];
    let bag = [];
    document.getElementById('shopGrid').innerHTML = ITEMS.map(i => \`
      <div class="item">
        <div class="vessel"><div class="shape" style="background:\${i.tone}"></div></div>
        <div style="font-size:12px;color:var(--muted)">\${i.cat}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 14px">
          <strong style="font-size:16px">\${i.name}</strong>
          <span>$\${i.price}</span>
        </div>
        <button class="bag-btn" style="margin-top:auto" onclick="addItem(\${i.id})">Add to Bag +</button>
      </div>
    \`).join('');
    function addItem(id) {
      const item = ITEMS.find(x => x.id === id);
      bag.push(item);
      renderBag();
      toggleBag(true);
    }
    function renderBag() {
      document.getElementById('bagCount').textContent = bag.length;
      document.getElementById('bagTotal').textContent = '$' + bag.reduce((s, x) => s + x.price, 0);
      document.getElementById('bagList').innerHTML = bag.length ? bag.map((x, idx) => \`
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;font-size:14px">
          <span>\${x.name}</span>
          <strong>$\${x.price}</strong>
        </div>
      \`).join('') : '<p style="color:#777;font-size:13px">Your bag is empty.</p>';
    }
    function toggleBag(open) {
      document.getElementById('bagDrawer').classList.toggle('open', open);
    }
    renderBag();
  </script>
</body>
</html>`
  },
  {
    id: 'flow',
    name: 'Flow Wellness App UI',
    subtitle: 'Mindful focus timer & daily ritual mobile kit',
    price: 1790,
    category: 'mobile',
    categoryLabel: 'Mobile UI',
    format: 'Single-File HTML / CSS / JS',
    pagesCount: '3 Interactive Screens',
    fileSize: '26 KB',
    updatedAt: 'Oct 2026',
    description:
      'A calming mobile wellness application showcase and interactive prototype inside a single HTML file. Features a working Pomodoro breathing timer, interactive daily ritual checklist, mood reflection log, and bottom-tab screen switcher.',
    features: [
      'Working countdown focus timer with start, pause, and reset controls',
      'Interactive daily habit checklist with real-time completion progress bar',
      'Multi-screen mobile frame switcher (Today, Breathing Timer, Insights)',
      'Organic sage and warm alabaster color system built for mobile PWAs'
    ],
    techStack: ['Single HTML5 File', 'Mobile PWA Layout', 'Live Timer JS', 'Zero Dependencies'],
    accentColor: '#3b6e52',
    filename: 'flow-wellness-mobile-ui-template.html',
    htmlSource: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Flow — Daily Rituals & Mindful Focus</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; font-family: 'DM Sans', sans-serif; background: #dce5d8; color: #1e2820; display: grid; place-items: center; min-height: 100vh; padding: 24px; }
    .showcase { display: grid; grid-template-columns: 1fr 360px; gap: 56px; max-width: 980px; width: 100%; align-items: center; }
    .phone-shell { background: #f8f8f2; border: 8px solid #1e2820; border-radius: 40px; height: 680px; padding: 28px 22px 20px; display: flex; flex-direction: column; box-shadow: 0 25px 60px rgba(30,40,32,0.18); position: relative; }
    .notch { width: 90px; height: 8px; background: #1e2820; border-radius: 10px; margin: 0 auto 22px; }
    .timer-ring { width: 170px; height: 170px; border-radius: 50%; background: #e3ece0; border: 6px solid #3b6e52; display: grid; place-items: center; margin: 18px auto; font: 700 32px 'Plus Jakarta Sans', sans-serif; }
    .task { background: #fff; border: 1px solid #e2e8df; padding: 12px 14px; border-radius: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 14px; }
    .task.done { opacity: 0.6; text-decoration: line-through; background: #eef3ec; }
    .btn { background: #3b6e52; color: #fff; border: 0; padding: 11px 18px; border-radius: 10px; font-weight: 600; cursor: pointer; }
    @media (max-width: 820px) { .showcase { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="showcase">
    <div>
      <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:#3b6e52">MOBILE UI KIT & PWA PROTOTYPE</div>
      <h1 style="font:700 48px/1.05 'Plus Jakarta Sans',sans-serif;margin:14px 0 18px;letter-spacing:-0.03em">Make quiet space for what matters.</h1>
      <p style="color:#4a584d;font-size:16px;line-height:1.7;margin-bottom:24px">Flow is a complete mobile habit and mindful breathing interface built in clean HTML/CSS/JS. Try the live timer and ritual checklist inside the interactive device frame.</p>
      <div style="display:flex;gap:16px;font-size:13px;color:#3b6e52;font-weight:600">
        <span>✓ Interactive Focus Timer</span>
        <span>✓ Habit State Persistence</span>
        <span>✓ PWA Ready</span>
      </div>
    </div>

    <div class="phone-shell">
      <div class="notch"></div>
      <div style="font-size:11px;letter-spacing:0.1em;color:#5c6b5e;font-weight:700">YOUR DAILY FLOW</div>
      <h2 style="font:700 24px 'Plus Jakarta Sans',sans-serif;margin:6px 0 4px">Morning Clarity</h2>

      <div class="timer-ring" id="timerDisplay">25:00</div>
      <div style="display:flex;justify-content:center;gap:8px;margin-bottom:20px">
        <button class="btn" onclick="toggleTimer()" id="startBtn">Start Session</button>
        <button class="btn" style="background:#dce5d8;color:#1e2820" onclick="resetTimer()">Reset</button>
      </div>

      <div style="font-size:12px;font-weight:700;margin-bottom:8px">TODAY'S RITUALS</div>
      <div class="task done" onclick="this.classList.toggle('done')">✓ 10 min morning sunlight</div>
      <div class="task" onclick="this.classList.toggle('done')">○ Deep work sprint (25m)</div>
      <div class="task" onclick="this.classList.toggle('done')">○ Evening gratitude note</div>

      <div style="margin-top:auto;padding-top:12px;border-top:1px solid #e2e8df;display:flex;justify-content:space-around;font-size:12px;font-weight:600;color:#3b6e52">
        <span>Today</span><span>Breathe</span><span>Journal</span>
      </div>
    </div>
  </div>

  <script>
    let secs = 1500, timer = null;
    function renderTime() {
      const m = String(Math.floor(secs / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      document.getElementById('timerDisplay').textContent = m + ':' + s;
    }
    function toggleTimer() {
      const btn = document.getElementById('startBtn');
      if (timer) { clearInterval(timer); timer = null; btn.textContent = 'Resume'; }
      else {
        btn.textContent = 'Pause';
        timer = setInterval(() => { if (secs > 0) { secs--; renderTime(); } }, 1000);
      }
    }
    function resetTimer() {
      clearInterval(timer); timer = null; secs = 1500; renderTime();
      document.getElementById('startBtn').textContent = 'Start Session';
    }
  </script>
</body>
</html>`
  },
  {
    id: 'arc',
    name: 'Arc Architecture Portfolio',
    subtitle: 'Spatial monograph & architectural practice site',
    price: 2290,
    category: 'website',
    categoryLabel: 'Portfolio',
    format: 'Single-File HTML / CSS / JS',
    pagesCount: 'Full Monograph Page',
    fileSize: '27 KB',
    updatedAt: 'Oct 2026',
    description:
      'An architectural monograph and spatial design studio portfolio template. Features a filterable project index with floor-area and completion-year tabular data, architectural elevation diagrams, and studio ethos sections.',
    features: [
      'Interactive project index switchable between Grid View and Architectural Spec Table',
      'Clean editorial numbering and Brutalist-inspired Swiss grid layout',
      'Project detail modal with square-meter specifications and material palette',
      'Single-file zero-dependency HTML ready for immediate static hosting'
    ],
    techStack: ['Single HTML5 File', 'Swiss Grid CSS', 'Spec Table Switcher', 'Responsive'],
    accentColor: '#4b5548',
    filename: 'arc-architecture-portfolio-template.html',
    htmlSource: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ARC / Architecture & Spatial Practice</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #eae7e1; --ink: #22211e; --muted: #6e6c65; --line: #d2cec5; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--ink); font-family: 'DM Sans', sans-serif; }
    header { display: flex; justify-content: space-between; padding: 24px 5vw; border-bottom: 1px solid var(--line); font-size: 13px; font-weight: 600; }
    .hero { padding: 80px 5vw; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 40px; align-items: end; }
    h1 { font: 700 clamp(42px, 6vw, 76px)/0.96 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.04em; }
    .monolith { height: 360px; background: linear-gradient(135deg, #c8c5bc, #8f9187); position: relative; overflow: hidden; border-radius: 6px; }
    .tower { position: absolute; right: 40px; top: 30px; width: 160px; height: 340px; background: linear-gradient(90deg, #dfdcd2 0 30%, #9b9d93 30% 100%); transform: skewY(-8deg); }
    .section { padding: 72px 5vw; }
    table { width: 100%; border-collapse: collapse; margin-top: 28px; font-size: 14px; }
    th, td { padding: 16px 8px; border-bottom: 1px solid var(--line); text-align: left; }
    .mono { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
    @media (max-width: 768px) { .hero { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <span>ARC / ARCHITECTURAL PRACTICE</span>
    <span>ZÜRICH · TOKYO · OSLO</span>
    <a href="#index" style="color:inherit">WORKS INDEX ↓</a>
  </header>

  <section class="hero">
    <div>
      <div class="mono" style="color:var(--muted);margin-bottom:16px">MONOGRAPH 2019–2026</div>
      <h1>Spaces built with timber, light, and permanence.</h1>
    </div>
    <div class="monolith"><div class="tower"></div></div>
  </section>

  <section class="section" id="index">
    <h2 style="font:700 32px 'Plus Jakarta Sans',sans-serif">Selected Works Ledger</h2>
    <table>
      <thead>
        <tr><th>Ref</th><th>Project Title</th><th>Location</th><th>Typology</th><th>Area</th><th>Year</th></tr>
      </thead>
      <tbody>
        <tr><td class="mono">01</td><td><strong>Karuizawa Forest Pavilion</strong></td><td>Nagano, JP</td><td>Cultural</td><td class="mono">1,420 m²</td><td class="mono">2026</td></tr>
        <tr><td class="mono">02</td><td><strong>Fjord Timber Residence</strong></td><td>Bergen, NO</td><td>Residential</td><td class="mono">480 m²</td><td class="mono">2025</td></tr>
        <tr><td class="mono">03</td><td><strong>Limmat Atelier & Archive</strong></td><td>Zürich, CH</td><td>Commercial</td><td class="mono">2,850 m²</td><td class="mono">2025</td></tr>
        <tr><td class="mono">04</td><td><strong>Solitude Nordic Bathhouse</strong></td><td>Tromsø, NO</td><td>Hospitality</td><td class="mono">960 m²</td><td class="mono">2024</td></tr>
      </tbody>
    </table>
  </section>
</body>
</html>`
  },
  {
    id: 'spark',
    name: 'Spark Finance Dashboard',
    subtitle: 'Treasury, portfolio & wealth analytics UI',
    price: 3190,
    category: 'dashboard',
    categoryLabel: 'Finance UI',
    format: 'Single-File HTML / CSS / JS',
    pagesCount: 'Full Wealth Terminal',
    fileSize: '33 KB',
    updatedAt: 'Oct 2026',
    description:
      'A dark-mode institutional wealth and personal treasury analytics dashboard. Features interactive asset allocation rebalancing, compound return projection sliders, and real-time transaction ledger filtering.',
    features: [
      'Interactive compound yield & monthly contribution wealth simulator',
      'Emerald-on-obsidian high-contrast financial telemetry with tabular numerals',
      'Asset allocation breakdown across Equities, Treasury Bills, and Private Credit',
      'Single-file zero-dependency HTML architecture'
    ],
    techStack: ['Single HTML5 File', 'Wealth Simulator JS', 'SVG Telemetry', 'Dark Mode UI'],
    accentColor: '#10b981',
    filename: 'spark-finance-dashboard-template.html',
    htmlSource: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spark Finance — Treasury & Portfolio Terminal</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@500;600&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #111617; --card: #1a2223; --ink: #eef6f2; --muted: #8ca39b; --emerald: #34d399; --line: #283536; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--ink); font-family: 'DM Sans', sans-serif; padding: 32px 5vw; }
    header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 24px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 24px; }
    .val { font: 600 42px 'JetBrains Mono', monospace; margin: 10px 0; }
    input[type=range] { width: 100%; accent-color: var(--emerald); margin: 10px 0 20px; }
    @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <strong style="font:700 20px 'Plus Jakarta Sans',sans-serif">✳ spark finance</strong>
    <span class="mono" style="font-size:12px;color:var(--emerald)">● LIVE TREASURY FEED</span>
  </header>

  <div class="grid">
    <div class="card">
      <div style="font-size:12px;color:var(--muted);letter-spacing:0.08em">NET LIQUID PORTFOLIO VALUE</div>
      <div class="val">$128,430.80</div>
      <div style="color:var(--emerald);font-size:13px;font-weight:600;margin-bottom:20px">↗ +$14,580.20 (+12.8%) Last 30 Days</div>
      <svg viewBox="0 0 600 150" style="width:100%;height:150px">
        <path d="M0,130 Q60,115 110,120 T220,80 T340,65 T460,35 T600,12" fill="none" stroke="#34d399" stroke-width="3.5"/>
      </svg>
    </div>

    <div class="card">
      <strong style="font-size:16px;display:block;margin-bottom:16px">Treasury Yield Simulator</strong>
      <label style="font-size:12px;color:var(--muted)">Monthly Contribution: <strong id="contribLbl" class="mono" style="color:#fff">$2,500</strong></label>
      <input type="range" min="500" max="10000" step="250" value="2500" oninput="calcYield(this.value)">
      <div style="padding:18px;background:var(--bg);border-radius:10px;margin-top:8px">
        <div style="font-size:11px;color:var(--muted)">5-YEAR PROJECTED VALUE (8.4% APY)</div>
        <div id="projVal" class="mono" style="font-size:28px;color:var(--emerald);margin-top:6px">$342,910</div>
      </div>
    </div>
  </div>

  <script>
    function calcYield(monthly) {
      document.getElementById('contribLbl').textContent = '$' + Number(monthly).toLocaleString();
      const base = 128430;
      const r = 0.084 / 12;
      const n = 60;
      const fv = base * Math.pow(1 + r, n) + Number(monthly) * ((Math.pow(1 + r, n) - 1) / r);
      document.getElementById('projVal').textContent = '$' + Math.round(fv).toLocaleString();
    }
  </script>
</body>
</html>`
  },
  {
    id: 'kinetix',
    name: 'Kinetix AI SaaS Landing',
    subtitle: 'B2B workflow automation & interactive ROI page',
    price: 2890,
    category: 'saas',
    categoryLabel: 'SaaS Landing',
    format: 'Single-File HTML / CSS / JS',
    pagesCount: 'Full Conversion Funnel',
    fileSize: '30 KB',
    updatedAt: 'Oct 2026',
    description:
      'A high-converting B2B SaaS product launch template with an interactive team seat & ROI calculator, Monthly/Annual billing toggle, architecture bento grid, and technical FAQ accordion.',
    features: [
      'Interactive Monthly vs. Annual billing toggle with automatic 20% discount math',
      'Live engineering hours saved & annual ROI calculator slider',
      'Asymmetric feature bento grid with code snippet preview',
      'Zero-dependency single HTML file ready for SaaS launches'
    ],
    techStack: ['Single HTML5 File', 'Pricing Toggle JS', 'ROI Calculator', 'Responsive Bento'],
    accentColor: '#4f46e5',
    filename: 'kinetix-saas-landing-template.html',
    htmlSource: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kinetix — Automated Release Pipelines for Engineering Teams</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@500&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #ffffff; --surface: #f8fafc; --ink: #0f172a; --muted: #64748b; --indigo: #4f46e5; --line: #e2e8f0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', sans-serif; color: var(--ink); background: var(--bg); }
    header { display: flex; justify-content: space-between; align-items: center; padding: 20px 5vw; border-bottom: 1px solid var(--line); }
    .hero { text-align: center; padding: 84px 5vw 64px; max-width: 860px; margin: 0 auto; }
    h1 { font: 800 clamp(38px, 5.5vw, 66px)/1.03 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.04em; margin: 16px 0 20px; }
    .btn { background: var(--indigo); color: #fff; padding: 13px 22px; border-radius: 8px; font-weight: 700; border: 0; cursor: pointer; font-size: 14px; }
    .pricing { padding: 64px 5vw; background: var(--surface); border-top: 1px solid var(--line); }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; max-width: 980px; margin: 32px auto 0; }
    .card { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 28px; }
    .price { font: 700 36px 'JetBrains Mono', monospace; margin: 16px 0; }
  </style>
</head>
<body>
  <header>
    <strong style="font:800 20px 'Plus Jakarta Sans',sans-serif">kinetix.dev</strong>
    <button class="btn">Start 14-Day Trial ↗</button>
  </header>

  <section class="hero">
    <div style="font-size:12px;font-weight:700;color:var(--indigo);letter-spacing:0.1em">DETERMINISTIC CI/CD PIPELINES</div>
    <h1>Ship production builds in 90 seconds, not 45 minutes.</h1>
    <p style="font-size:17px;color:var(--muted);margin-bottom:28px">Incremental remote caching and automated preview environments for high-velocity TypeScript and Rust monorepos.</p>
    <button class="btn" onclick="document.getElementById('pricing').scrollIntoView()">Calculate Team Pricing ↓</button>
  </section>

  <section class="pricing" id="pricing">
    <div style="text-align:center">
      <h2 style="font:700 32px 'Plus Jakarta Sans',sans-serif">Predictable seat-based pricing</h2>
      <div style="margin-top:14px">
        <button class="btn" id="toggleBill" onclick="toggleBilling()">Switch to Annual (Save 20%)</button>
      </div>
    </div>
    <div class="cards">
      <div class="card">
        <strong>Starter Team</strong>
        <div class="price" data-m="$49" data-y="$39">$49<small style="font-size:13px;color:var(--muted)">/mo</small></div>
        <p style="font-size:13px;color:var(--muted)">Up to 10 active committers and 5,000 remote cache minutes.</p>
      </div>
      <div class="card" style="border-color:var(--indigo)">
        <strong style="color:var(--indigo)">Scale Organization</strong>
        <div class="price" data-m="$189" data-y="$149">$189<small style="font-size:13px;color:var(--muted)">/mo</small></div>
        <p style="font-size:13px;color:var(--muted)">Unlimited committers, SOC2 audit logs, and dedicated bare-metal runners.</p>
      </div>
    </div>
  </section>

  <script>
    let annual = false;
    function toggleBilling() {
      annual = !annual;
      document.getElementById('toggleBill').textContent = annual ? 'Showing Annual Pricing (20% Off)' : 'Switch to Annual (Save 20%)';
      document.querySelectorAll('.price').forEach(el => {
        el.innerHTML = (annual ? el.dataset.y : el.dataset.m) + '<small style="font-size:13px;color:#64748b">/mo</small>';
      });
    }
  </script>
</body>
</html>`
  },
  {
    id: 'atelier',
    name: 'Atelier Culinary & Hospitality',
    subtitle: 'Tasting menu & table reservation flagship',
    price: 2190,
    category: 'commerce',
    categoryLabel: 'E-Commerce',
    format: 'Single-File HTML / CSS / JS',
    pagesCount: 'Menu + Booking Widget',
    fileSize: '27 KB',
    updatedAt: 'Oct 2026',
    description:
      'An atmospheric hospitality, fine dining, and boutique hotel template. Includes an interactive seasonal tasting course switcher (Omnivore, Botanical, Wine Pairing) and an instant table reservation booking widget.',
    features: [
      'Interactive seasonal tasting menu course switcher with sommelier notes',
      'Live guest count, date, and seating time table reservation widget',
      'Warm espresso and parchment editorial typography',
      'Self-contained single HTML file with zero external dependencies'
    ],
    techStack: ['Single HTML5 File', 'Booking Widget JS', 'Menu Course Switcher', 'Responsive'],
    accentColor: '#8c492d',
    filename: 'atelier-hospitality-template.html',
    htmlSource: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ATELIER SORA — Seasonal Wood-Fired Dining</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #221c18; --card: #2d2520; --ink: #f5ede6; --muted: #b8a99a; --accent: #d97757; --line: #3d332c; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--ink); font-family: 'DM Sans', sans-serif; padding: 0 5vw; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 26px 0; border-bottom: 1px solid var(--line); }
    .hero { padding: 80px 0; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 40px; border-bottom: 1px solid var(--line); align-items: center; }
    h1 { font: 700 clamp(38px, 5vw, 64px)/1.04 'Plus Jakarta Sans', sans-serif; margin: 12px 0 20px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 28px; }
    .btn { background: var(--accent); color: #fff; border: 0; padding: 12px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; width: 100%; margin-top: 12px; }
    input, select { width: 100%; padding: 11px; margin: 6px 0 14px; background: var(--bg); border: 1px solid var(--line); color: #fff; border-radius: 6px; }
    @media (max-width: 768px) { .hero { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <strong style="letter-spacing:0.15em">ATELIER SORA</strong>
    <span style="font-size:13px;color:var(--muted)">TUESDAY–SUNDAY · 18:00 – 23:00</span>
  </header>

  <section class="hero">
    <div>
      <div style="font-size:12px;color:var(--accent);letter-spacing:0.14em">AUTUMN HARVEST TASTING MENU</div>
      <h1>Hearth-roasted ingredients from coastal farms.</h1>
      <p style="color:var(--muted);line-height:1.7">Seven courses celebrating wild mushrooms, line-caught sea bream, and biodynamic cellar pairings in an intimate 28-seat dining room.</p>
    </div>

    <div class="card">
      <strong style="font-size:18px;display:block;margin-bottom:12px">Reserve a Table</strong>
      <label style="font-size:12px;color:var(--muted)">Party Size</label>
      <select id="guests"><option>2 Guests — Dining Room</option><option>4 Guests — Chef's Counter</option><option>6 Guests — Private Alcove</option></select>
      <label style="font-size:12px;color:var(--muted)">Seating Time</label>
      <select id="seating"><option>18:30 First Seating</option><option>20:45 Second Seating</option></select>
      <button class="btn" onclick="document.getElementById('resConfirm').textContent='✓ Table held! Confirmation sent for ' + document.getElementById('guests').value">Confirm Reservation ↗</button>
      <p id="resConfirm" style="font-size:12px;color:var(--accent);margin-top:10px"></p>
    </div>
  </section>
</body>
</html>`
  },
  {
    id: 'pulse',
    name: 'Pulse DevOps & Status Portal',
    subtitle: 'Real-time uptime monitor & incident changelog',
    price: 2590,
    category: 'saas',
    categoryLabel: 'SaaS Landing',
    format: 'Single-File HTML / CSS / JS',
    pagesCount: 'Live Status + Changelog',
    fileSize: '29 KB',
    updatedAt: 'Oct 2026',
    description:
      'A developer-focused infrastructure status portal and release changelog template. Includes 90-day uptime bar visualizations, regional latency probes, and an interactive webhook subscriber modal.',
    features: [
      '90-day interactive SVG/CSS uptime bar strips for API, Edge CDN, and Database clusters',
      'Region-by-region latency telemetry switcher (US-East, EU-Central, AP-Southeast)',
      'Incident history timeline with root-cause postmortem expandable notes',
      'Single-file zero-dependency HTML ready for status subdomains'
    ],
    techStack: ['Single HTML5 File', 'Uptime Bar Grid', 'Region Filter JS', 'Developer UI'],
    accentColor: '#0284c7',
    filename: 'pulse-status-portal-template.html',
    htmlSource: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pulse Status — Systems Operational</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@500;600&family=Plus+Jakarta+Sans:wght@700&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #0b0f17; --card: #131b29; --ink: #f1f5f9; --muted: #94a3b8; --green: #10b981; --line: #1e293b; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--ink); font-family: 'DM Sans', sans-serif; max-width: 880px; margin: 0 auto; padding: 40px 24px; }
    .banner { background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.35); padding: 20px 24px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin: 28px 0; }
    .service { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
    .bars { display: grid; grid-template-columns: repeat(45, 1fr); gap: 3px; height: 28px; margin-top: 12px; }
    .bar { background: var(--green); border-radius: 2px; }
    .mono { font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center">
    <strong style="font:700 20px 'Plus Jakarta Sans',sans-serif">pulse.status</strong>
    <span class="mono" style="font-size:12px;color:var(--muted)">99.994% 90-DAY SLA</span>
  </div>

  <div class="banner">
    <strong style="color:var(--green)">✓ All Systems Operational Across 14 Edge Regions</strong>
    <span class="mono" style="font-size:12px;color:var(--muted)">p95 Latency: 18ms</span>
  </div>

  <div class="service">
    <div style="display:flex;justify-content:space-between"><strong>Core GraphQL & REST API</strong><span class="mono" style="color:var(--green)">99.99% Uptime</span></div>
    <div class="bars" id="bars1"></div>
  </div>

  <div class="service">
    <div style="display:flex;justify-content:space-between"><strong>Global Edge Worker Mesh</strong><span class="mono" style="color:var(--green)">100.0% Uptime</span></div>
    <div class="bars" id="bars2"></div>
  </div>

  <script>
    ['bars1', 'bars2'].forEach(id => {
      document.getElementById(id).innerHTML = Array.from({length: 45}, (_, i) =>
        \`<div class="bar" style="opacity:\${i === 19 && id === 'bars1' ? 0.45 : 1}" title="Day \${i+1}: 100% Operational"></div>\`
      ).join('');
    });
  </script>
</body>
</html>`
  }
];

function templateNameFromFilename(filename: string) {
  const stem = filename.replace(/\.html$/i, '');
  const landingPageNumber = stem.match(/^landing_page(?:\((\d+)\))?$/);
  if (landingPageNumber) return `Landing Page${landingPageNumber[1] ? ` ${landingPageNumber[1]}` : ''}`;

  return stem
    .replace(/\((\d+)\)$/, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function templateCategory(filename: string): TemplateProduct['category'] {
  if (/pawprint|landing_page\(20\)|local_personal_services/.test(filename)) return 'mobile';
  if (/landing_page\((11|12)\)/.test(filename)) return 'dashboard';
  if (/landing_page\((10|13|14)\)|atlas_haul_freight|electronics_technology/.test(filename)) return 'saas';
  if (/eyewear|fashion|books|botanica|bakery|burger|electronics|footwear|kornerstone|living|harvest|landing_page\((6|7|8|18|19)\)|velvet_bean|nomad_compass/.test(filename)) return 'commerce';
  return 'website';
}

const categoryLabels: Record<TemplateProduct['category'], string> = {
  website: 'Website',
  dashboard: 'Dashboard',
  commerce: 'Commerce',
  mobile: 'Mobile UI',
  saas: 'SaaS',
};

const categoryColors: Record<TemplateProduct['category'], string> = {
  website: '#2457d6',
  dashboard: '#1749bd',
  commerce: '#9a623c',
  mobile: '#3b6e52',
  saas: '#0284c7',
};

/** Deterministic $499–$999 tiers for storefront HTML templates. */
const TEMPLATE_PRICE_TIERS = [
  499, 529, 549, 579, 599, 629, 649, 679, 699, 729, 749, 779, 799, 829, 849, 879, 899, 929, 949, 979, 999,
] as const;

function templatePriceUsd(_filename: string, index: number): number {
  return TEMPLATE_PRICE_TIERS[index % TEMPLATE_PRICE_TIERS.length]!;
}

export const HTML_STOREFRONT_TEMPLATES: TemplateProduct[] = HTML_TEMPLATE_FILES.map((filename, index) => {
  const category = templateCategory(filename);
  const name = templateNameFromFilename(filename);
  return {
    id: filename,
    name,
    subtitle: `${categoryLabels[category]} template`,
    price: templatePriceUsd(filename, index),
    category,
    categoryLabel: categoryLabels[category],
    format: 'HTML template',
    pagesCount: 'Full-page preview',
    fileSize: 'HTML',
    updatedAt: 'Oct 2026',
    description: `Preview the complete ${name} template and choose a payment amount to start your project inquiry.`,
    features: [],
    techStack: ['HTML', 'CSS', 'JavaScript'],
    accentColor: categoryColors[category],
    filename,
    htmlSource: '',
    previewUrl: `/software/template-preview/${encodeURIComponent(filename)}`,
  };
});

export function generateMasterLandingHtml(): string {
  // Generates the complete standalone single-file HTML bundle of the entire PixelForge Storefront
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Premium website templates, dashboards, and custom software development — single-file portable edition.">
  <title>PixelForge — Digital Products & Custom Software Storefront</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{--ink:#171721;--muted:#737382;--purple:#7559e8;--pale:#f5f3ff;--line:#e9e7ef;--green:#1a9d72;--font:'DM Sans',sans-serif;--display:'Plus Jakarta Sans',sans-serif}
    *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:90px}body{margin:0;color:var(--ink);font-family:var(--font);background:#fff}a{color:inherit;text-decoration:none}button,input,textarea,select{font:inherit}
    .site-header{height:78px;display:flex;align-items:center;justify-content:space-between;padding:0 max(5vw,24px);border-bottom:1px solid #f0eef5;position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:blur(16px);z-index:20}
    .brand{font:700 22px var(--display);letter-spacing:-0.8px}
    .site-header nav{display:flex;gap:32px;color:#555464;font-size:13px;font-weight:600}
    .header-cta{font-size:13px;font-weight:700;background:var(--ink);color:white;padding:12px 18px;border-radius:9px}
    .section{padding:88px max(5vw,24px)}
    .hero{display:grid;grid-template-columns:1fr 1fr;gap:45px;align-items:center}
    .hero h1{font:700 clamp(44px,5.2vw,72px)/1.04 var(--display);letter-spacing:-0.04em;margin:18px 0}
    .hero h1 span{color:var(--purple)}
    .btn{display:inline-flex;align-items:center;gap:10px;border:0;border-radius:9px;padding:14px 20px;font-weight:700;font-size:13px;cursor:pointer;background:var(--purple);color:#fff}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:24px;margin-top:32px}
    .card{border:1px solid var(--line);border-radius:12px;padding:22px;background:#fff}
  </style>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="#home">pixelforge</a>
    <nav><a href="#products">Templates</a><a href="#services">Services</a><a href="#pricing">Pricing</a><a href="#contact">Contact</a></nav>
    <a class="header-cta" href="#contact">Start a project ↗</a>
  </header>
  <main>
    <section class="hero section" id="home">
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:1.6px;color:var(--purple)">DIGITAL PRODUCTS & SOFTWARE STUDIO</div>
        <h1>Build something <span>remarkable.</span></h1>
        <p style="color:var(--muted);font-size:16px;line-height:1.7;max-width:480px;margin-bottom:28px">Beautiful, production-minded templates and custom software that help ambitious teams move faster.</p>
        <a class="btn" href="#products">Explore templates ↗</a>
      </div>
      <div style="background:#f5f3ff;border:1px solid var(--line);border-radius:16px;padding:32px">
        <div style="font-size:11px;color:var(--muted)">TOTAL REVENUE</div>
        <strong style="font:700 36px var(--display);display:block;margin:6px 0">$48,290</strong>
        <span style="color:var(--green);font-size:12px;font-weight:600">↗ +18.4% this month</span>
      </div>
    </section>
    <section class="section" id="products">
      <h2 style="font:700 36px var(--display)">Included Template Catalog (${TEMPLATES.length} Production Templates)</h2>
      <div class="grid">
        ${TEMPLATES.map(
          (t) => `<article class="card">
          <div style="font-size:11px;color:var(--purple);font-weight:700">${t.categoryLabel} · ${t.format}</div>
          <h3 style="font:700 18px var(--display);margin:8px 0">${t.name}</h3>
          <p style="font-size:13px;color:var(--muted);line-height:1.6">${t.description}</p>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid var(--line)">
            <strong style="font:700 16px var(--display)">฿${t.price.toLocaleString()}</strong>
            <span style="font-size:12px;color:var(--muted)">${t.pagesCount}</span>
          </div>
        </article>`
        ).join('')}
      </div>
    </section>
    <section class="section" id="pricing" style="background:#f7f6fb;border-top:1px solid var(--line)">
      <div style="font-size:11px;font-weight:700;letter-spacing:1.6px;color:var(--purple)">SIDE-BY-SIDE LICENSE COMPARISON</div>
      <h2 style="font:700 34px var(--display);margin:10px 0 8px">Single Template vs. All-Access Bundle</h2>
      <p style="font-size:14px;color:var(--muted);margin-bottom:28px">Buying all 9 templates individually costs <s>฿23,910</s>. Get the All-Access Bundle for <strong>฿7,900</strong> (Save ฿16,010 · 67% off).</p>
      <div style="overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:12px">
        <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left">
          <thead>
            <tr style="border-bottom:1px solid var(--line);background:#faf9fd">
              <th style="padding:16px">Deliverables &amp; License Rights</th>
              <th style="padding:16px">Single Template (฿1,790–฿3,490)</th>
              <th style="padding:16px;color:var(--purple);background:var(--pale)">All-Access Bundle (฿7,900)</th>
              <th style="padding:16px">Custom Studio Build (From ฿18,000)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--line)"><td style="padding:14px 16px"><strong>Included Production HTML Templates</strong></td><td style="padding:14px 16px">1 chosen template</td><td style="padding:14px 16px;background:var(--pale);font-weight:700">All 9 templates + future drops</td><td style="padding:14px 16px">All 9 + custom architected app</td></tr>
            <tr style="border-bottom:1px solid var(--line)"><td style="padding:14px 16px"><strong>Total Retail Value</strong></td><td style="padding:14px 16px">Up to ฿3,490 value</td><td style="padding:14px 16px;background:var(--pale);font-weight:700;color:var(--green)">฿23,910 value (Save ฿16,010)</td><td style="padding:14px 16px">Tailored to project scope</td></tr>
            <tr style="border-bottom:1px solid var(--line)"><td style="padding:14px 16px"><strong>PixelForge Master Storefront Source (.html)</strong></td><td style="padding:14px 16px">Not included</td><td style="padding:14px 16px;background:var(--pale);font-weight:700">✓ Included</td><td style="padding:14px 16px">✓ Included</td></tr>
            <tr style="border-bottom:1px solid var(--line)"><td style="padding:14px 16px"><strong>Commercial &amp; Client Domains</strong></td><td style="padding:14px 16px">1 project / 1 domain</td><td style="padding:14px 16px;background:var(--pale);font-weight:700">Unlimited client &amp; own domains</td><td style="padding:14px 16px">Unlimited enterprise license</td></tr>
            <tr><td style="padding:14px 16px"><strong>Lifetime Template Releases &amp; Support</strong></td><td style="padding:14px 16px">1 template (48h email)</td><td style="padding:14px 16px;background:var(--pale);font-weight:700">All future releases + Priority (12h)</td><td style="padding:14px 16px">Dedicated engineer &amp; Slack</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

/** Curated purchasable templates (billing / checkout allowlist). */
export const STOREFRONT_TEMPLATES = TEMPLATES;
