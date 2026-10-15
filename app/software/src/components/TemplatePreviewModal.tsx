import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import type { SoftwareProduct } from '../data/catalog';

interface TemplatePreviewModalProps {
  product: SoftwareProduct;
  onClose: () => void;
}

export function TemplatePreviewModal({
  product,
  onClose,
}: TemplatePreviewModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const { preview } = product;
  const templateRootId = `template-preview-${product.id}`;

  return (
    <div
      className="template-preview-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section ref={dialogRef} className={`template-preview-dialog theme-${preview.theme}`} role="dialog" aria-modal="true" aria-labelledby="template-preview-title" tabIndex={-1}>
        <div className="template-preview-toolbar">
          <div className="template-preview-browser-dots" aria-hidden="true"><i /><i /><i /></div>
          <span className="template-preview-address">{product.name} <span>· Preview</span></span>
          <button ref={closeButtonRef} className="template-preview-close" type="button" onClick={onClose} aria-label="Close template preview"><X size={18} /></button>
        </div>

        <div className="template-preview-scroll" id={templateRootId}>
          <header className="template-site-header">
            <a className="template-site-brand" href={`#${templateRootId}`} onClick={onClose} aria-label={`${preview.brand} preview home`}>
              <span>{preview.brand.slice(0, 1)}</span>{preview.brand}
            </a>
            <nav aria-label={`${preview.brand} preview navigation`}>
              {preview.navigation.map((item, index) => <a key={item} href={`#${templateRootId}-section-${index}`}>{item}</a>)}
            </nav>
            <span className="template-site-nav-cta">{preview.action}<ArrowRight size={13} aria-hidden="true" /></span>
          </header>

          <main className="template-site-main">
            <section className="template-site-hero">
              <div className="template-site-hero-copy">
                <span className="template-site-eyebrow"><i />{product.category} template</span>
                <h1 id="template-preview-title">{preview.headline}</h1>
                <p>{preview.description}</p>
                <span className="template-site-hero-action">{preview.action}<ArrowRight size={15} aria-hidden="true" /></span>
                <span className="template-site-proof"><Check size={14} aria-hidden="true" />Thoughtfully designed for real-world use</span>
              </div>
              <div className="template-site-hero-art" aria-hidden="true">
                <div className="template-art-orbit" />
                <div className="template-art-card template-art-card-back"><span /><span /><i /></div>
                <div className="template-art-card template-art-card-front">
                  <span className="template-art-card-label">{preview.brand}</span>
                  <strong>{preview.sections[0].title}</strong>
                  <small>{preview.sections[0].description}</small>
                  <div className="template-art-lines"><i /><i /><i /></div>
                  <b><Check size={12} /> A clear next step</b>
                </div>
              </div>
            </section>

            <div className="template-site-section-intro">
              <span className="template-site-eyebrow">A closer look</span>
              <h2>Designed to bring the details together.</h2>
            </div>
            <div className="template-site-sections">
              {preview.sections.map((section, index) => (
                <section className="template-site-section" id={`${templateRootId}-section-${index}`} key={section.title}>
                  <span className="template-section-number">0{index + 1}</span>
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.description}</p>
                    <ul>{section.points.map((point) => <li key={point}><Check size={14} aria-hidden="true" />{point}</li>)}</ul>
                  </div>
                  <div className="template-section-visual" aria-hidden="true">
                    <span /><span /><span /><span />
                    <div><i /><i /><i /><i /><i /></div>
                  </div>
                </section>
              ))}
            </div>

            <section className="template-site-cta">
              <span className="template-site-eyebrow">Make it your own</span>
              <h2>A strong starting point for what comes next.</h2>
              <p>Explore a design direction, then shape the details around your business.</p>
              <span className="template-site-hero-action">{preview.action}<ArrowRight size={15} aria-hidden="true" /></span>
            </section>
          </main>

          <footer className="template-site-footer">
            <a className="template-site-brand" href={`#${templateRootId}`} onClick={onClose}><span>{preview.brand.slice(0, 1)}</span>{preview.brand}</a>
            <p>{preview.footer}</p>
            <nav aria-label={`${preview.brand} preview footer navigation`}>
              {preview.navigation.map((item) => <span key={item}>{item}</span>)}
            </nav>
            <small>Design preview · {product.name}</small>
          </footer>
        </div>

        <div className="template-preview-purchase-bar">
          <div>
            <span>Indicative price</span>
            <strong>{product.priceLabel}</strong>
          </div>
          <p>Choose a payment amount from $5 up to the listed USD price to start your inquiry.</p>
          <Link href={`/software/checkout?kind=software&id=${encodeURIComponent(product.id)}`}>
            Send inquiry <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
