import './PlaceholderPage.css';

interface KnowledgeLink {
  label: string;
  url: string;
}

interface ToolInfo {
  name: string;
  description: string;
}

interface CardData {
  icon: string;
  color: 'blue' | 'purple' | 'green' | 'orange';
  title: string;
  desc: string;
  status: 'active' | 'inactive';
  statusText: string;
  meta: string;
  link?: string;
  externalLink?: string;
  knowledgeLinks?: KnowledgeLink[];
  tools?: ToolInfo[];
  config?: Record<string, any>;
}

interface PlaceholderPageProps {
  title: string;
  subtitle: string;
  cards: CardData[];
}

export default function PlaceholderPage({ title, subtitle, cards }: PlaceholderPageProps) {
  return (
    <div className="placeholder-page">
      <div className="content-header">
        <h1 className="content-title">{title}</h1>
        <p className="content-subtitle">{subtitle}</p>
      </div>

      <div className="cards-grid">
        {cards.map((card, index) => (
          <div
            key={index}
            className="placeholder-card"
            onClick={
              card.externalLink
                ? () => window.open(card.externalLink, '_blank', 'noopener,noreferrer')
                : card.link
                  ? () => { window.location.href = card.link!; }
                  : undefined
            }
          >
            <div className="card-header">
              <div className={`card-icon ${card.color}`}>{card.icon}</div>
            </div>
            <div className="card-title">{card.title}</div>
            <div className="card-desc">{card.desc}</div>
            <div className="card-status">
              <span className={`status-dot ${card.status}`} />
              <span className="status-text">{card.statusText}</span>
            </div>
            <div className="card-meta">
              <span>{card.meta}</span>
            </div>
            {card.knowledgeLinks && card.knowledgeLinks.length > 0 && (
              <div className="card-knowledge-links">
                {card.knowledgeLinks.map((kl, i) => (
                  <a
                    key={i}
                    className="knowledge-link-tag"
                    href={kl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    📚 {kl.label}
                  </a>
                ))}
              </div>
            )}
            {card.config && (
              <div className="card-config-section" onClick={(e) => e.stopPropagation()}>
                <h4>MCP 配置</h4>
                <pre>{JSON.stringify(card.config, null, 2)}</pre>
              </div>
            )}
            {card.tools && card.tools.length > 0 && (
              <div className="card-tools-section" onClick={(e) => e.stopPropagation()}>
                <h4>提供的工具</h4>
                <ul>
                  {card.tools.map((tool, i) => (
                    <li key={i}>
                      <strong>{tool.name}</strong>
                      <p>{tool.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
