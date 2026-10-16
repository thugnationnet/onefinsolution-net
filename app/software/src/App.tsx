'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Blocks,
  Check,
  Code2,
  Eye,
  LayoutDashboard,
  Monitor,
  MonitorSmartphone,
  Search,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Tablet,
  X,
} from 'lucide-react';
import { TemplatePreviewModal } from './components/TemplatePreviewModal';
import { softwareCatalog, softwareServices, type SoftwareProduct } from './data/catalog';
import { HTML_STOREFRONT_TEMPLATES as STOREFRONT_TEMPLATES, type TemplateProduct } from './data/templatesData';

const formatUsd = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

const templateInquiryHref = (template: TemplateProduct) =>
  `/software/checkout?kind=template&id=${encodeURIComponent(template.id)}`;

const productIcons = {
  agency: Blocks,
  admin: LayoutDashboard,
  commerce: ShoppingBag,
  landing: Sparkles,
  mobile: MonitorSmartphone,
  crm: BarChart3,
  finance: BarChart3,
  restaurant: ShoppingBag,
  'real-estate': Blocks,
  portfolio: Sparkles,
  booking: MonitorSmartphone,
  education: LayoutDashboard,
};

function ProductPreview({ product }: { product: SoftwareProduct }) {
  return (
    <div className={`product-preview preview-${product.id}`} aria-hidden="true">
      <div className="mock-window">
        <div className="mock-window-bar"><i /><i /><i /><span /></div>
        <div className="mock-window-body">
          <div className="mock-sidebar"><b /><i /><i /><i /><i /></div>
          <div className="mock-content">
            <div className="mock-title"><b /><i /></div>
            <div className="mock-metrics"><i /><i /><i /></div>
            <div className="mock-chart"><span /><span /><span /><span /><span /><span /><span /></div>
            <div className="mock-table"><i /><i /><i /></div>
          </div>
        </div>
      </div>
      {product.id === 'mobile' && <div className="mock-phone"><i /><b /><span /><span /><em /></div>}
    </div>
  );
}

function ProductCard({
  product,
  onPreview,
}: {
  product: SoftwareProduct;
  onPreview: (product: SoftwareProduct) => void;
}) {
  const Icon = productIcons[product.id];
  return (
    <article className="product-card">
      <ProductPreview product={product} />
      <div className="product-card-content">
        <span className="product-category"><Icon size={14} aria-hidden="true" />{product.category}</span>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="product-card-footer">
          <strong>{product.priceLabel}</strong>
          <button type="button" onClick={() => onPreview(product)} aria-label={`Preview ${product.name}`}>
            Preview template <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [previewProduct, setPreviewProduct] = useState<SoftwareProduct | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<TemplateProduct | null>(null);
  const [previewTab, setPreviewTab] = useState<'preview' | 'specs'>('preview');
  const [viewportSize, setViewportSize] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const closeTemplatePreview = useCallback(() => setPreviewProduct(null), []);

  useEffect(() => {
    if (!previewTemplate) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewTemplate(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewTemplate]);

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return STOREFRONT_TEMPLATES.filter((template) => {
      const matchesCategory = activeCategory === 'all' || template.category === activeCategory;
      const matchesQuery = !query || [
        template.name,
        template.subtitle,
        template.categoryLabel,
        template.description,
        ...template.features,
        ...template.techStack,
      ].some((value) => value.toLowerCase().includes(query));
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, searchQuery]);

  return (
    <div className="ofs-app">
      <div className="software-content">
        <nav className="software-section-nav" aria-label="Software section">
          <a href="#design-library">Preview library</a>
          <a href="#templates">Software catalog</a>
          <a href="#services">Custom development</a>
          <a href="#process">How it works</a>
          <Link href="/software/account">My Software account</Link>
        </nav>
        <section className="ofs-hero" id="home">
          <div className="hero-copy">
            <span className="ofs-eyebrow"><Sparkles size={15} aria-hidden="true" /> DIGITAL PRODUCTS &amp; DEVELOPMENT</span>
            <h1>Custom Software &amp; Digital Templates <span>for Your Business</span></h1>
            <p>Discover ready-made website templates, SaaS dashboards, e-commerce designs, and mobile UI kits—or get custom software built around your business needs.</p>
            <div className="hero-actions">
              <a className="ofs-button primary" href="#design-library">Explore templates <ArrowDown size={16} aria-hidden="true" /></a>
              <a className="ofs-button secondary" href="#services">Get custom software <ArrowRight size={16} aria-hidden="true" /></a>
            </div>
            <div className="hero-assurance"><span><Check size={14} aria-hidden="true" /></span> Practical digital foundations, tailored to your next idea.</div>
          </div>
          <div className="hero-art" role="img" aria-label="Stylized previews of a website, business dashboard, and mobile interface">
            <div className="hero-art-glow" />
            <div className="hero-back-window">
              <div className="hero-window-bar"><i /><i /><i /></div>
              <div className="hero-back-content"><span /><b /><i /><i /><em /></div>
            </div>
            <div className="hero-dashboard">
              <div className="hero-dashboard-top"><span className="hero-brand-mark"><Blocks size={14} /></span><i /><b /><b /></div>
              <div className="hero-dashboard-main">
                <div className="hero-dashboard-nav"><i /><i /><i /><i /><i /></div>
                <div className="hero-dashboard-content">
                  <div className="hero-dashboard-title"><b /><span /></div>
                  <div className="hero-dashboard-stats"><i /><i /><i /></div>
                  <div className="hero-chart"><div><i /><i /><i /><i /></div><svg viewBox="0 0 300 100" preserveAspectRatio="none"><path d="M0 82 C30 76 33 56 65 63 S104 84 130 51 S170 60 195 34 S235 47 260 20 S285 25 300 8" /></svg></div>
                  <div className="hero-dashboard-bottom"><i /><i /><i /></div>
                </div>
              </div>
            </div>
            <div className="hero-phone"><i /><b /><span /><span /><em /></div>
            <div className="hero-art-label"><span><Code2 size={15} /></span><b>Designed for what’s next<small>Web · software · mobile</small></b></div>
          </div>
        </section>

        <section className="design-library-section" id="design-library">
          <div className="section-heading">
            <div><span className="ofs-eyebrow">INTERACTIVE DESIGN COLLECTION</span><h2>Explore the template library</h2></div>
            <p>Search and filter the collection, inspect a live responsive preview, and choose a payment amount to start your request.</p>
          </div>
          <div className="design-library-controls">
            <div className="template-category-filters" role="group" aria-label="Filter templates by category">
              {[
                { id: 'all', label: `All templates (${STOREFRONT_TEMPLATES.length})` },
                { id: 'website', label: 'Websites' },
                { id: 'dashboard', label: 'Dashboards' },
                { id: 'commerce', label: 'Commerce' },
                { id: 'saas', label: 'SaaS' },
                { id: 'mobile', label: 'Mobile UI' },
              ].map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={activeCategory === category.id ? 'is-active' : ''}
                  aria-pressed={activeCategory === category.id}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <label className="template-search">
              <Search size={16} aria-hidden="true" />
              <span className="visually-hidden">Search templates</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search templates and features"
              />
            </label>
          </div>
          {filteredTemplates.length === 0 ? (
            <div className="template-empty-state">
              <p>No templates match “{searchQuery}”.</p>
              <button type="button" onClick={() => { setActiveCategory('all'); setSearchQuery(''); }}>Reset filters</button>
            </div>
          ) : (
            <div className="template-library-grid">
              {filteredTemplates.map((template) => (
                <article className="library-template-card" key={template.id}>
                  <button
                    className="library-template-art"
                    style={{
                      background: template.accentColor,
                      backgroundImage: `linear-gradient(115deg, color-mix(in srgb, ${template.accentColor} 88%, #182b2a), rgba(24, 43, 42, .42)), url('${template.category === 'mobile' ? '/images/iages8.png' : '/images/iages9.jpg'}')`,
                    }}
                    type="button"
                    onClick={() => { setPreviewTemplate(template); setPreviewTab('preview'); }}
                    aria-label={`Open full preview of ${template.name}`}
                  >
                    <span className="library-template-window" aria-hidden="true"><i /><i /><i /><span /></span>
                    <strong>{template.name}</strong>
                    <small>{template.categoryLabel} · {template.pagesCount}</small>
                    <span className="library-template-preview-label"><Eye size={14} /> Live preview</span>
                  </button>
                  <div className="library-template-info">
                    <div className="library-template-title">
                      <div><h3>{template.name}</h3><p>{template.subtitle}</p></div>
                      <strong>{formatUsd(template.price)} USD</strong>
                    </div>
                    <p className="library-template-description">{template.description}</p>
                    <div className="library-template-meta">
                      <span>{template.format}</span><span>{template.fileSize}</span><span>Updated {template.updatedAt}</span>
                    </div>
                    <div className="library-template-actions">
                      <button type="button" className="template-preview-button" onClick={() => { setPreviewTemplate(template); setPreviewTab('preview'); }}>
                        <Eye size={15} aria-hidden="true" /> Full preview
                      </button>
                      <Link className="template-enquiry-button" href={templateInquiryHref(template)}>
                        Send inquiry
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="template-enquiry-note">Prices are shown in USD. Choose an amount from $5 up to the listed price to submit a paid inquiry.</p>
        </section>

        <section className="content-section" id="templates">
          <div className="section-heading">
            <div><span className="ofs-eyebrow">SOFTWARE STARTING POINTS</span><h2>Explore the software catalog</h2></div>
            <p>Preview available directions and choose an amount to start a paid inquiry for a selected product.</p>
          </div>
          <div className="product-grid">
            {softwareCatalog.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onPreview={setPreviewProduct}
              />
            ))}
          </div>
          <p className="catalog-note">All catalog prices are shown in USD. Custom development is quoted separately in USD.</p>
        </section>

        <section className="content-section services-section" id="services">
          <div className="section-heading">
            <div><span className="ofs-eyebrow">BUILT AROUND YOUR BUSINESS</span><h2>Custom development</h2></div>
            <p>Get in touch to discuss scope, requirements, and a tailored approach.</p>
          </div>
          <div className="service-grid">
            {softwareServices.map(({ id, name, description, priceLabel, Icon }, index) => (
              <article className="service-card" key={id}>
                <span className="service-icon"><Icon size={20} aria-hidden="true" /></span>
                <span className="service-number">0{index + 1}</span>
                <h3>{name}</h3>
                <p>{description}</p>
                <strong>{priceLabel}</strong>
                <Link href={`/contact?category=general&subject=${encodeURIComponent(`${name} enquiry`)}`}>Request a USD quote <ArrowRight size={15} aria-hidden="true" /></Link>
              </article>
            ))}
          </div>
        </section>

        <section className="benefits-section">
          <div><span className="ofs-eyebrow">WHY ONE FIN</span><h2>Good software should make work feel simpler.</h2><p>Start with a ready-made foundation or plan a custom product around your goals.</p></div>
          <ul>
            {['Responsive design for desktop, tablet, and mobile', 'Clean code and reusable components', 'Customization to fit your brand and workflow', 'Professional development focused on your needs'].map((benefit) => <li key={benefit}><span><Check size={14} /></span>{benefit}</li>)}
          </ul>
        </section>

        <section className="content-section process-section" id="process">
          <div className="section-heading"><div><span className="ofs-eyebrow">A CLEAR, SIMPLE PROCESS</span><h2>From first idea to launch</h2></div><p>Start with the right foundation, then shape it into something that works for you.</p></div>
          <ol className="process-grid">
            {[
              ['01', 'Choose a Template', 'Find a starting point that fits your project.'],
              ['02', 'Customize', 'Adapt the details to your brand and requirements.'],
              ['03', 'Develop', 'Build a cohesive and responsive experience.'],
              ['04', 'Launch', 'Prepare your finished project for its next step.'],
            ].map(([number, title, description]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></li>)}
          </ol>
        </section>

        <section className="final-cta">
          <div><span className="ofs-eyebrow">YOUR NEXT STEP STARTS HERE</span><h2>Ready to Build Something Great?</h2><p>Explore a template or tell us about the software you need.</p></div>
          <div className="hero-actions"><a className="ofs-button light" href="#templates">Browse templates <ArrowDown size={16} /></a><a className="ofs-button outline" href="#services">Explore custom development <ArrowRight size={16} /></a></div>
        </section>
      </div>

      {previewTemplate && (
        <div className="template-library-preview-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewTemplate(null); }}>
          <section className="template-library-preview" role="dialog" aria-modal="true" aria-label={`${previewTemplate.name} template preview`}>
            <header className="template-library-preview-toolbar">
              <div className="template-library-preview-dots" aria-hidden="true"><i /><i /><i /></div>
              <strong>{previewTemplate.name}</strong>
              <button type="button" onClick={() => setPreviewTemplate(null)} aria-label="Close template preview"><X size={19} /></button>
            </header>
            <div className="template-library-preview-controls">
              <div className="template-preview-tabs" role="tablist" aria-label="Template preview details">
                <button type="button" role="tab" aria-selected={previewTab === 'preview'} onClick={() => setPreviewTab('preview')}>Live preview</button>
                <button type="button" role="tab" aria-selected={previewTab === 'specs'} onClick={() => setPreviewTab('specs')}>Specifications</button>
              </div>
              {previewTab === 'preview' && (
                <div className="template-viewport-controls" role="group" aria-label="Preview viewport size">
                  <button type="button" className={viewportSize === 'desktop' ? 'is-active' : ''} onClick={() => setViewportSize('desktop')} aria-label="Desktop viewport"><Monitor size={16} /></button>
                  <button type="button" className={viewportSize === 'tablet' ? 'is-active' : ''} onClick={() => setViewportSize('tablet')} aria-label="Tablet viewport"><Tablet size={16} /></button>
                  <button type="button" className={viewportSize === 'mobile' ? 'is-active' : ''} onClick={() => setViewportSize('mobile')} aria-label="Mobile viewport"><Smartphone size={16} /></button>
                </div>
              )}
            </div>
            {previewTab === 'preview' ? (
              <div className="template-library-iframe-stage">
                <div className={`template-library-iframe-frame viewport-${viewportSize}`}>
                  <iframe
                    title={`${previewTemplate.name} live preview`}
                    src={previewTemplate.previewUrl}
                    srcDoc={previewTemplate.previewUrl ? undefined : previewTemplate.htmlSource}
                    sandbox="allow-scripts allow-modals"
                  />
                </div>
              </div>
            ) : (
              <div className="template-library-specs">
                <span className="ofs-eyebrow">{previewTemplate.categoryLabel} · {previewTemplate.format}</span>
                <h2>{previewTemplate.name}</h2>
                <p>{previewTemplate.description}</p>
                <dl>
                  <div><dt>Sections</dt><dd>{previewTemplate.pagesCount}</dd></div>
                  <div><dt>File size</dt><dd>{previewTemplate.fileSize}</dd></div>
                  <div><dt>Last updated</dt><dd>{previewTemplate.updatedAt}</dd></div>
                  <div><dt>Fixed price (USD)</dt><dd>{formatUsd(previewTemplate.price)}</dd></div>
                </dl>
                <h3>Included features</h3>
                <ul>{previewTemplate.features.map((feature) => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul>
                <h3>Technology</h3>
                <div className="template-tech-stack">{previewTemplate.techStack.map((technology) => <span key={technology}>{technology}</span>)}</div>
                <p className="template-enquiry-note">Select a payment amount from $5 up to the listed USD price to submit a paid inquiry.</p>
              </div>
            )}
            <footer className="template-library-preview-footer">
              <span>{formatUsd(previewTemplate.price)} <small>fixed template price · USD</small></span>
              <div className="template-library-preview-actions">
                <Link href={templateInquiryHref(previewTemplate)}>Send inquiry <ArrowUpRight size={15} aria-hidden="true" /></Link>
                <button type="button" onClick={() => setPreviewTemplate(null)}>Close preview</button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {previewProduct && (
        <TemplatePreviewModal
          product={previewProduct}
          onClose={closeTemplatePreview}
        />
      )}
    </div>
  );
}
