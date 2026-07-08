import { useEffect, useMemo, useState } from 'react';
import styles from './Tour.module.css';

function getRect(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top + window.scrollY,
    left: r.left + window.scrollX,
    width: r.width,
    height: r.height,
  };
}

function Tour({ isOpen, steps = [], onClose, onStepChange }) {
  const [index, setIndex] = useState(0);
  const step = steps[index] || null;
  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let canceled = false;
    const updateRect = () => {
      if (canceled) return;
      const r = getRect(step?.selector);
      if (r) {
        setRect(r);
        setMissing(false);
        document.querySelector(step.selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setRect(null);
        setMissing(true);
      }
    };
    // initial check and polling while missing (helps quando o DOM muda apos criar dados demo)
    const timer = setTimeout(updateRect, 120);
    const poll = setInterval(() => {
      if (!isOpen) return;
      if (!step?.selector) return;
      const r = getRect(step.selector);
      if (r) {
        setRect(r);
        setMissing(false);
        clearInterval(poll);
        document.querySelector(step.selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
    const onResize = () => updateRect();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      canceled = true;
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen) return;
    onStepChange?.(index);
  }, [index, isOpen, onStepChange]);

  const total = useMemo(() => steps.length, [steps]);

  if (!isOpen || !step) return null;

  const next = () => {
    if (index + 1 >= total) {
      onClose?.();
    } else {
      setIndex((i) => i + 1);
    }
  };
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  return (
    <div className={styles.overlay}>
      {rect && (
        <div
          className={styles.highlight}
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.stepBadge}>{index + 1} / {total}</span>
          <h3>{step.title || 'Passo'}</h3>
        </div>
        <p className={styles.description}>
          {missing ? 'Este passo nao esta visivel agora. Tente criar o elemento (ex: um motoboy ou viagem) e avance.' : step.description}
        </p>
        <div className={styles.actions}>
          <button type="button" className="secondary-btn" onClick={onClose}>Sair</button>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className="secondary-btn" onClick={prev} disabled={index === 0}>Voltar</button>
            <button type="button" className="primary-btn" onClick={next}>{index + 1 === total ? 'Concluir' : 'Proximo'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Tour;
