import { Link } from "react-router-dom";

interface CampusSpaceCardProps {
  id: string;
  name: string;
  description: string;
  kind: string;
  detailPath: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  referenceNotice?: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
}

export function CampusSpaceCard({
  id,
  name,
  description,
  kind,
  detailPath,
  logoUrl,
  bannerUrl,
  referenceNotice,
}: CampusSpaceCardProps) {
  return (
    <article className="entity-directory-card campus-space-directory-card" data-record-id={id}>
      <div className="entity-banner">
        {bannerUrl && <img className="campus-space-banner-image" src={bannerUrl} alt="" loading="lazy" />}
        <span>{kind}</span>
        <span className="entity-avatar-large" aria-hidden="true">
          {logoUrl ? <img className="campus-space-logo-image" src={logoUrl} alt="" loading="lazy" /> : initials(name)}
        </span>
      </div>
      <div className="entity-directory-copy">
        <p className="eyebrow">{kind}</p>
        <h3>
          <Link to={detailPath}>{name}</Link>
        </h3>
        <p>{description}</p>
        {referenceNotice && <small className="catalog-reference-notice">{referenceNotice}</small>}
      </div>
    </article>
  );
}
