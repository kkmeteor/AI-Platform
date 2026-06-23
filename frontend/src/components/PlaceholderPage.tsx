import './PlaceholderPage.css';

interface CardData {
  icon: string;
  color: 'blue' | 'purple' | 'green' | 'orange';
  title: string;
  desc: string;
  status: 'active' | 'inactive';
  statusText: string;
  meta: string;
  link?: string;
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
            onClick={card.link ? () => { window.location.href = card.link!; } : undefined}
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
          </div>
        ))}
      </div>
    </div>
  );
}
