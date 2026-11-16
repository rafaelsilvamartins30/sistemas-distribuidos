import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { CampusSpaceCard } from "../components/CampusSpaceCard";
import { Icon } from "../components/Icon";
import { PaginationControls } from "../components/PaginationControls";
import { CampusApiError, getCommunities, type Community } from "../services/campus";

interface WebContext {
  keycloak: Keycloak;
}

export function CommunitiesPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "UNIR — Comunidades";
    let active = true;
    setLoading(true);
    setError(null);

    getCommunities(keycloak.token ?? "", page)
      .then((result) => {
        if (!active) return;
        setCommunities(result.items);
        setTotalPages(result.totalPages);
        setTotalElements(result.totalElements);
        setLoading(false);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof CampusApiError && requestError.status === 404
            ? "Este registro não foi encontrado."
            : "Não foi possível carregar as comunidades do Campus. Tente novamente.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [keycloak, page]);

  return (
    <div className="catalog-page">
      <header className="page-intro product-page-intro">
        <p className="eyebrow">Estrutura universitária</p>
        <h1>Comunidades</h1>
        <p>Consulte as comunidades cadastradas no Campus da UNIR.</p>
      </header>
      <div className="catalog-results-heading">
        <div>
          <h2>Comunidades cadastradas</h2>
          {!loading && !error && <p>{totalElements} comunidades</p>}
        </div>
        <Link className="text-link" to="/entidades">
          Explorar entidades acadêmicas <Icon name="arrowUpRight" width="15" height="15" />
        </Link>
      </div>

      {loading ? (
        <p className="notice" role="status">
          Carregando comunidades…
        </p>
      ) : error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : communities.length ? (
        <div className="entity-directory-grid">
          {communities.map((community) => (
            <CampusSpaceCard
              key={community.id}
              id={community.id}
              name={community.name}
              description={community.description}
              kind={community.category || "Comunidade"}
              detailPath={`/comunidades/${encodeURIComponent(community.id)}`}
              logoUrl={community.logoUrl}
              bannerUrl={community.bannerUrl}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>Nenhuma comunidade cadastrada</strong>
          <span>As comunidades publicadas pelo Campus aparecerão aqui.</span>
        </div>
      )}
      {!loading && !error && <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />}
    </div>
  );
}
