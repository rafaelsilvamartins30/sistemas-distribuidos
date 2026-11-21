import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";

export function BrandPanel() {
  return (
    <section className="brand-panel" aria-label="Sobre a UNIR">
      <Link className="brand" to="/" aria-label="UNIR início">
        <BrandMark />
        <span>UNIR</span>
      </Link>
      <div className="brand-message">
        <p className="eyebrow">University Network for Integration and Relationships</p>
        <h1>Conexões que transformam a vida universitária.</h1>
        <p>Descubra eventos, consulte espaços e acompanhe sua trajetória universitária.</p>
      </div>
      <span className="panel-caption">UNIR · Plataforma universitária</span>
    </section>
  );
}
