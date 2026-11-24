import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { useToast } from "../contexts/ToastContext.js";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type CampusNotification,
} from "../services/campusSocial.js";
import { extractErrorMessage } from "../utils/apiError.js";
import { campusProfilePath } from "../utils/profileRoutes.js";

interface WebContext {
  keycloak: Keycloak;
}

export function notificationPath(notification: CampusNotification): string {
  if (notification.resourceType === "REQUEST") return "/solicitacoes";
  const id = encodeURIComponent(notification.resourceId);
  if (notification.resourceType === "UNIVERSITY") return "/universidade?tab=posts";
  if (notification.resourceType === "ACADEMIC_UNIT") return `/unidades/${id}?tab=posts`;
  if (notification.resourceType === "DEPARTMENT")
    return `${campusProfilePath("DEPARTMENT", notification.resourceId)}?tab=posts`;
  if (notification.resourceType === "ACADEMIC_ENTITY")
    return `${campusProfilePath("ACADEMIC_ENTITY", notification.resourceId)}?tab=posts`;
  if (notification.resourceType === "COMMUNITY") {
    if (notification.eventType === "COMMUNITY_SPACE_POST" || notification.eventType === "COMMUNITY_SPACE_COMMENT") {
      return `/comunidades/${id}/central`;
    }
    return `${campusProfilePath("COMMUNITY", notification.resourceId)}?tab=posts`;
  }
  return "/";
}

export function NotificationsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const toast = useToast();
  const [items, setItems] = useState<CampusNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const token = keycloak.token ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getNotifications(token);
      setItems(page.items);
      setUnreadCount(page.unreadCount ?? 0);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível carregar sua central de notificações."));
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    document.title = "UNIR — Notificações";
    void load();
  }, [load]);

  async function markOne(item: CampusNotification) {
    if (item.readAt) return;
    try {
      const updated = await markNotificationRead(token, item.id);
      setItems((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível atualizar o estado da notificação."));
    }
  }

  async function markAll() {
    try {
      await markAllNotificationsRead(token);
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
      toast.success("Todas as notificações foram marcadas como lidas.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível marcar as notificações como lidas."));
    }
  }

  return (
    <div className="campus-requests-page">
      <header className="page-intro product-page-intro">
        <p className="eyebrow">Campus</p>
        <h1>Notificações</h1>
        <p>Atualizações das solicitações e dos perfis que você acompanha.</p>
      </header>
      <div className="catalog-results-heading">
        <div>
          <h2>Sua central</h2>
          <p>{unreadCount} não lidas</p>
        </div>
        <button className="button button-secondary" disabled={!unreadCount} onClick={() => void markAll()}>
          Marcar todas como lidas
        </button>
      </div>
      {loading ? (
        <p className="notice" role="status">
          Carregando notificações…
        </p>
      ) : items.length ? (
        <div className="campus-notification-list">
          {items.map((item) => (
            <article className={`campus-notification-card ${item.readAt ? "is-read" : "is-unread"}`} key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <time>
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(
                    new Date(item.createdAt),
                  )}
                </time>
              </div>
              <div className="campus-notification-actions">
                {!item.readAt && (
                  <button className="text-link" onClick={() => void markOne(item)}>
                    Marcar como lida
                  </button>
                )}
                <Link className="text-link" to={notificationPath(item)} onClick={() => void markOne(item)}>
                  Abrir
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>Você não tem notificações</strong>
        </div>
      )}
    </div>
  );
}
