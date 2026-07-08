import { useMemo } from 'react';
import { useAppState } from '../../shared/context/AppStateContext';
import { Icon } from '../../shared/ui/Icon';
import { formatCurrency } from '../../shared/utils/calculations';
import './RateConfig.css';

export function RateConfig() {
  const { appState, actions } = useAppState();

  const defaultRateName = useMemo(() => {
    const rate = appState.rateConfigs.find((item) => item.id === appState.hubConfig.defaultRateId);
    return rate?.name || appState.rateConfigs[0]?.name || '-';
  }, [appState.hubConfig.defaultRateId, appState.rateConfigs]);

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div>
          <p className="page-eyebrow">Configuracao</p>
          <h2 className="page-title">Taxas dinamicas por filial, bairro ou regra</h2>
          <p className="page-description">
            As taxas saem da tela de fechamento e passam a ficar centralizadas aqui. Cada taxa criada aparece
            automaticamente nas colunas dos motoboys.
          </p>
        </div>

        <div className="page-hero-meta">
          <div className="status-note">
            Hoje o fechamento usa <strong>{appState.rateConfigs.length}</strong> taxa(s) configurada(s).
          </div>
          <div className="status-note">
            Taxa padrao usada pelo hub: <strong>{defaultRateName}</strong>
          </div>
        </div>
      </section>

      <section className="rates-layout">
        <article className="card">
          <div className="section-header">
            <div className="section-heading">
              <h3 className="section-title">Lista de taxas</h3>
              <p className="section-description">
                Crie quantas faixas quiser. Isso permite replicar o app para outras filiais sem editar codigo.
              </p>
            </div>

            <div className="section-actions">
              <button type="button" className="btn btn-primary" onClick={actions.addRateConfig}>
                + Nova taxa
              </button>
            </div>
          </div>

          <div className="table-shell">
            <table className="data-table responsive-table">
              <thead>
                <tr>
                  <th>Nome da taxa</th>
                  <th>Valor unitario (R$)</th>
                  <th>Acoes</th>
                </tr>
              </thead>

              <tbody>
                {appState.rateConfigs.map((rate) => (
                  <tr key={rate.id}>
                    <td data-label="Nome da taxa">
                      <input
                        type="text"
                        className="input"
                        value={rate.name}
                        placeholder="Nome da taxa"
                        onChange={(event) => actions.updateRateConfig(rate.id, { name: event.target.value })}
                      />
                    </td>

                    <td data-label="Valor unitario (R$)">
                      <input
                        type="number"
                        step="0.01"
                        className="input rates-value-input"
                        value={rate.value}
                        placeholder="0,00"
                        onChange={(event) => actions.updateRateConfig(rate.id, { value: event.target.value })}
                      />
                    </td>

                    <td data-label="Acoes">
                      <button
                        type="button"
                        className="btn btn-danger btn-icon"
                        onClick={() => actions.removeRateConfig(rate.id)}
                        disabled={appState.rateConfigs.length === 1}
                      >
                        <Icon name="trash" size={15} />
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="rates-side-column">
          <article className="card">
            <div className="section-heading">
              <h3 className="section-title">Resumo rapido</h3>
              <p className="section-description">
                Use nomes operacionais reais para facilitar a leitura no fechamento e no hub.
              </p>
            </div>

            <div className="meta-list">
              <div className="meta-list-item">
                <div className="meta-list-label">Taxas ativas</div>
                <div className="meta-list-value">{appState.rateConfigs.length}</div>
              </div>

              <div className="meta-list-item">
                <div className="meta-list-label">Taxa padrao hub</div>
                <div className="meta-list-value">{defaultRateName}</div>
              </div>
            </div>
          </article>

          <article className="card">
            <div className="section-heading">
              <h3 className="section-title">Valores atuais</h3>
              <p className="section-description">
                Conferencia compacta das configuracoes ja cadastradas.
              </p>
            </div>

            <div className="rates-list">
              {appState.rateConfigs.map((rate) => (
                <div key={rate.id} className="rates-list-item">
                  <span className="rates-list-name">{rate.name}</span>
                  <strong className="rates-list-value">R$ {formatCurrency(rate.value)}</strong>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
