import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";

export function OpportunitiesPage() {
  return (
    <div className="browse-page capability-page">
      <PageHeader
        eyebrow="Pesquisa · estágio · extensão"
        title="Oportunidades"
        description="Consulte editais e vagas publicados pelos canais oficiais da universidade."
      />
      <section className="capability-empty" aria-labelledby="opportunities-empty-title">
        <span className="capability-empty-icon">
          <Icon name="opportunity" width="23" height="23" />
        </span>
        <p className="eyebrow">Mural de oportunidades</p>
        <h2 id="opportunities-empty-title">Nenhuma oportunidade está publicada aqui ainda</h2>
        <p>
          A plataforma ainda não recebe oportunidades de estágio, pesquisa ou extensão. Confira os departamentos e
          entidades para chegar aos canais institucionais disponíveis.
        </p>
        <div className="capability-empty-actions">
          <Link className="button button-primary" to="/departamentos">
            Ver departamentos
          </Link>
          <Link className="button button-secondary" to="/entidades">
            Ver entidades
          </Link>
        </div>
      </section>
    </div>
  );
}
