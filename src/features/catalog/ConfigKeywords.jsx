import { useEffect, useState } from 'react';
import { Icon } from '../../shared/ui/Icon';
import './ConfigKeywords.css';

const DEFAULT_KEYWORDS = [
  {
    id: 1,
    label: 'Refrigerantes',
    words: ['Refrigerante', 'Bebida', 'Coca', 'Guarana', 'Suco'],
    tone: 50,
    fontSize: 14,
    highlightMode: 'word',
    highlightType: 'bold'
  },
  {
    id: 2,
    label: 'Observacoes',
    words: ['Observacao', 'Aviso', 'Atencao'],
    tone: 30,
    fontSize: 14,
    highlightMode: 'word',
    highlightType: 'bold'
  },
  {
    id: 3,
    label: 'Pagamento',
    words: ['Dinheiro', 'Cartao', 'Pago', 'Cobrar'],
    tone: 50,
    fontSize: 14,
    highlightMode: 'word',
    highlightType: 'bold'
  },
  {
    id: 4,
    label: 'Endereco',
    words: ['Endereco', 'Rua', 'Avenida', 'Av.', 'R.'],
    tone: 50,
    fontSize: 14,
    highlightMode: 'word',
    highlightType: 'bold'
  }
];

const DEFAULT_CATALOGS = [
  {
    id: 1,
    name: 'Esfihas',
    content: `Esfiha de Carne:8,98;
Frango c/ Catupiry:6,99;
Confetes doce:6,49;
Nutella c/ Ninho:6,49;
Pizza:5,49;`
  },
  {
    id: 2,
    name: 'Pizzas e Combos',
    content: `Pizza 35cm (8 Fatias):49,99;
Pizza 40cm (10 Fatias):59,99;
Combo 2 Pizzas 35cm:89,99;
Combo 3 Pizzas 35cm:129,99;`
  },
  {
    id: 3,
    name: 'Refrigerantes',
    content: `Coca-Cola Zero 2L:17,99;
Guarana Lata:6,50;
Agua:3,50;`
  }
];

const normalizeCatalogKey = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const ensureCatalogDefaults = (input) => {
  if (!Array.isArray(input) || !input.length) return DEFAULT_CATALOGS;
  const hasPizzasCombos = input.some(
    (catalog) => normalizeCatalogKey(catalog?.name || '') === normalizeCatalogKey('Pizzas e Combos')
  );
  if (hasPizzasCombos) return input;

  const nextId = Math.max(...input.map((catalog) => Number(catalog?.id) || 0), 0) + 1;
  return [...input, { ...DEFAULT_CATALOGS[1], id: nextId }];
};

const mergeKeywordDefaults = (items) =>
  items.map((item) => ({
    ...(DEFAULT_KEYWORDS.find((entry) => entry.id === item.id) || DEFAULT_KEYWORDS[0]),
    ...item
  }));

const getCatalogIconName = (name = '') => {
  const lower = name.toLowerCase();
  if (lower.includes('esfih') || lower.includes('pizza')) return 'pizza';
  if (lower.includes('refri') || lower.includes('bebida') || lower.includes('coca') || lower.includes('guaran')) {
    return 'drink';
  }
  if (lower.includes('combo')) return 'combo';
  return 'box';
};

export function ConfigKeywords() {
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedKeywordId, setSelectedKeywordId] = useState(null);
  const [catalogs, setCatalogs] = useState(DEFAULT_CATALOGS);
  const [newCatalogName, setNewCatalogName] = useState('Novo catalogo');

  useEffect(() => {
    const savedKeywords = localStorage.getItem('keywords');
    if (savedKeywords) {
      try {
        const parsed = JSON.parse(savedKeywords);
        if (Array.isArray(parsed)) {
          setKeywords(mergeKeywordDefaults(parsed));
        }
      } catch {
        setKeywords(DEFAULT_KEYWORDS);
      }
    }

    const savedCatalogs = localStorage.getItem('catalogs');
    if (savedCatalogs) {
      try {
        const parsed = JSON.parse(savedCatalogs);
        if (Array.isArray(parsed)) {
          const withDefaults = ensureCatalogDefaults(parsed);
          setCatalogs(withDefaults);
          if (withDefaults.length !== parsed.length) {
            localStorage.setItem('catalogs', JSON.stringify(withDefaults));
          }
        }
      } catch {
        setCatalogs(DEFAULT_CATALOGS);
      }
    }
  }, []);

  const saveKeywords = (next) => {
    setKeywords(next);
    localStorage.setItem('keywords', JSON.stringify(next));
  };

  const addKeyword = () => {
    const newId = Math.max(...keywords.map((keyword) => keyword.id), 0) + 1;
    saveKeywords([
      ...keywords,
      {
        id: newId,
        label: 'Novo Topico',
        words: ['Palavra'],
        tone: 50,
        fontSize: 14,
        highlightMode: 'word',
        highlightType: 'bold'
      }
    ]);
  };

  const deleteKeyword = (id) => {
    saveKeywords(keywords.filter((keyword) => keyword.id !== id));
  };

  const updateKeyword = (id, field, value) => {
    const next = keywords.map((keyword) =>
      keyword.id === id ? { ...keyword, [field]: value } : keyword
    );
    saveKeywords(next);
  };

  const updateWords = (id, text) => {
    const words = text
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean);

    updateKeyword(id, 'words', words);
  };

  const resetToDefault = () => {
    if (window.confirm('Tem certeza que deseja voltar ao padrao de fabrica?')) {
      saveKeywords(DEFAULT_KEYWORDS);
    }
  };

  const saveCatalogs = (next) => {
    setCatalogs(next);
    localStorage.setItem('catalogs', JSON.stringify(next));
  };

  const resetCatalogs = () => {
    if (window.confirm('Voltar para os 3 catalogos padrao (Esfihas, Pizzas e Combos e Refrigerantes)?')) {
      saveCatalogs(DEFAULT_CATALOGS);
      setNewCatalogName('Novo catalogo');
    }
  };

  const addCatalog = () => {
    const newId = Math.max(...catalogs.map((catalog) => catalog.id), 0) + 1;
    saveCatalogs([
      ...catalogs,
      { id: newId, name: newCatalogName || `Catalogo ${newId}`, content: '' }
    ]);
    setNewCatalogName('Novo catalogo');
  };

  const updateCatalog = (id, field, value) => {
    const next = catalogs.map((catalog) =>
      catalog.id === id ? { ...catalog, [field]: value } : catalog
    );
    saveCatalogs(next);
  };

  const deleteCatalog = (id) => {
    const next = catalogs.filter((catalog) => catalog.id !== id);
    saveCatalogs(next.length ? next : DEFAULT_CATALOGS);
  };

  const openConfigModal = (id) => {
    setSelectedKeywordId(id);
    setModalOpen(true);
  };

  const getBackgroundColor = (tone) => {
    const lightness = Math.round((tone / 100) * 100);
    return `hsl(0, 0%, ${lightness}%)`;
  };

  const getTextColor = (tone) => (tone > 60 ? '#000000' : '#FFFFFF');

  const getPreviewContent = (keyword) => {
    const exampleTexts = {
      1: 'Refrigerante Coca-Cola 2L',
      2: 'Observacao importante: sem gelo',
      3: 'Pagamento: Dinheiro',
      4: 'Endereco: Rua das Flores, 123'
    };

    const text = exampleTexts[keyword.id] || 'Exemplo de texto com palavra chave';
    const words = Array.isArray(keyword.words) ? keyword.words : [];

    if (!words.length) return text;

    const bgColor = getBackgroundColor(keyword.tone);
    const textColor = getTextColor(keyword.tone);

    if (keyword.highlightMode === 'line') {
      const hasKeyword = words.some((word) => text.toLowerCase().includes(word.toLowerCase()));
      if (!hasKeyword) return text;

      const style =
        keyword.highlightType === 'bold'
          ? `background-color:${bgColor};color:${textColor};padding:2px 4px;font-weight:bold;`
          : `background-color:${bgColor};color:${textColor};padding:2px 4px;border:2px solid ${textColor};`;

      return `<span style="${style}">${text}</span>`;
    }

    let result = text;
    words.forEach((word) => {
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');

      if (keyword.highlightType === 'bold') {
        result = result.replace(regex, '<strong>$&</strong>');
      } else {
        result = result.replace(
          regex,
          `<span style="background-color:${bgColor};color:${textColor};padding:2px 6px;border:2px solid ${textColor};display:inline-block;border-radius:3px;">$&</span>`
        );
      }
    });

    return result;
  };

  const selectedKeyword = keywords.find((keyword) => keyword.id === selectedKeywordId);

  return (
    <div className="config-keywords">
      <div className="keywords-header">
        <h2>Catalogo e Palavras-Chave</h2>
        <p>Cadastre precos e palavras-chave para calcular combos e destacar itens na comanda.</p>
      </div>

      <section className="block block-catalogs">
        <div className="block-row">
          <div>
            <h3>Catalogos de preco</h3>
            <p>Formato: Nome:valor; Ex.: Esfiha de Carne:5,99; Coca Lata:6,50;</p>
          </div>

          <div className="block-actions">
            <input
              type="text"
              value={newCatalogName}
              onChange={(event) => setNewCatalogName(event.target.value)}
              placeholder="Nome do novo catalogo"
            />

            <button type="button" onClick={addCatalog}>
              + Novo catalogo
            </button>

            <button type="button" className="btn-reset-catalogs icon-with-label" onClick={resetCatalogs}>
              <Icon name="refresh" size={14} />
              <span>3 catalogos padrao</span>
            </button>
          </div>
        </div>

        <div className="catalogs-carousel">
          {catalogs.map((catalog) => (
            <div key={catalog.id} className="catalog-card">
              <div className="catalog-card-header">
                <span className="catalog-icon" aria-hidden="true">
                  <Icon name={getCatalogIconName(catalog.name)} size={16} />
                </span>

                <input
                  type="text"
                  value={catalog.name}
                  onChange={(event) => updateCatalog(catalog.id, 'name', event.target.value)}
                  className="catalog-name-input"
                />

                <button
                  type="button"
                  className="catalog-delete"
                  onClick={() => deleteCatalog(catalog.id)}
                  disabled={catalogs.length === 1}
                  title="Remover catalogo"
                  aria-label="Remover catalogo"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>

              <textarea
                className="catalog-textarea"
                value={catalog.content}
                onChange={(event) => updateCatalog(catalog.id, 'content', event.target.value)}
                placeholder="Ex.: Esfiha de Carne:5,99; Coca Lata:6,50;"
              />

              <small className="catalog-hint">
                Use ponto e virgula para separar os itens.
              </small>
            </div>
          ))}
        </div>
      </section>

      <section className="block block-keywords">
        <div className="block-row">
          <div>
            <h3>Palavras-chave</h3>
            <p>Use para grifos e realces. Os catalogos ficam na secao acima.</p>
          </div>

          <div className="block-actions">
            <button type="button" className="btn-add-keyword" onClick={addKeyword}>
              + Adicionar topico
            </button>

            <button type="button" className="btn-reset-default icon-with-label" onClick={resetToDefault}>
              <Icon name="refresh" size={14} />
              <span>Padrao de Fabrica</span>
            </button>
          </div>
        </div>

        <div className="keywords-container">
          <div className="keywords-carousel">
            {keywords.map((keyword) => (
              <div key={keyword.id} className="keyword-card">
                <div className="card-header">
                  <h4>{keyword.label}</h4>
                </div>

                <textarea
                  value={Array.isArray(keyword.words) ? keyword.words.join(', ') : ''}
                  onChange={(event) => updateWords(keyword.id, event.target.value)}
                  className="card-textarea"
                  placeholder="Palavra1, Palavra2, Palavra3..."
                />

                <div className="card-actions">
                  <button
                    type="button"
                    className="btn-card-config"
                    onClick={() => openConfigModal(keyword.id)}
                    title="Configurar estilo"
                    aria-label="Configurar estilo"
                  >
                    <Icon name="settings" size={14} />
                  </button>

                  <button
                    type="button"
                    className="btn-card-delete"
                    onClick={() => deleteKeyword(keyword.id)}
                    title="Excluir topico"
                    aria-label="Excluir topico"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {modalOpen && selectedKeyword && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Configurar: {selectedKeyword.label}</h2>

              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div className="config-group">
                <label>Nome do Topico:</label>
                <input
                  type="text"
                  value={selectedKeyword.label}
                  onChange={(event) => updateKeyword(selectedKeywordId, 'label', event.target.value)}
                  className="keyword-input"
                  placeholder="Ex: Bebidas"
                />
              </div>

              <div className="config-group">
                <label>Contraste de Cor (Escuro para Claro):</label>
                <div className="slider-container">
                  <span className="tone-label escuro">Escuro</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedKeyword.tone}
                    onChange={(event) =>
                      updateKeyword(selectedKeywordId, 'tone', Number.parseInt(event.target.value, 10))
                    }
                    className="tone-slider"
                  />
                  <span className="tone-label claro">Claro</span>
                </div>
              </div>

              <div className="config-group">
                <label>Modo de Grifo:</label>
                <div className="highlight-mode-buttons">
                  <button
                    type="button"
                    className={`mode-btn ${selectedKeyword.highlightMode === 'word' ? 'active' : ''}`}
                    onClick={() => updateKeyword(selectedKeywordId, 'highlightMode', 'word')}
                  >
                    Por Palavra
                  </button>

                  <button
                    type="button"
                    className={`mode-btn ${selectedKeyword.highlightMode === 'line' ? 'active' : ''}`}
                    onClick={() => updateKeyword(selectedKeywordId, 'highlightMode', 'line')}
                  >
                    Por Linha
                  </button>
                </div>
              </div>

              <div className="config-group">
                <label>Tipo de Grifo:</label>
                <div className="highlight-type-buttons">
                  <button
                    type="button"
                    className={`type-btn ${selectedKeyword.highlightType === 'bold' ? 'active' : ''}`}
                    onClick={() => updateKeyword(selectedKeywordId, 'highlightType', 'bold')}
                  >
                    <strong>Negrito</strong>
                  </button>

                  <button
                    type="button"
                    className={`type-btn ${selectedKeyword.highlightType === 'box' ? 'active' : ''}`}
                    onClick={() => updateKeyword(selectedKeywordId, 'highlightType', 'box')}
                    style={{
                      border: `2px solid ${getTextColor(selectedKeyword.tone)}`,
                      padding: '6px 12px'
                    }}
                  >
                    Caixa
                  </button>
                </div>
              </div>

              <div className="config-group">
                <label>Tamanho da Fonte:</label>
                <div className="size-buttons">
                  {[12, 14, 16, 18, 20].map((size) => (
                    <button
                      type="button"
                      key={size}
                      className={`size-btn ${selectedKeyword.fontSize === size ? 'active' : ''}`}
                      onClick={() => updateKeyword(selectedKeywordId, 'fontSize', size)}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-group">
                <label>Previa:</label>
                <div
                  className="preview-box"
                  style={{ fontSize: `${selectedKeyword.fontSize}px` }}
                  dangerouslySetInnerHTML={{ __html: getPreviewContent(selectedKeyword) }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-modal-save icon-with-label" onClick={() => setModalOpen(false)}>
                <Icon name="check" size={14} />
                <span>Concluido</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

