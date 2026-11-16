import { useEffect, useState } from "react";
import type Keycloak from "keycloak-js";
import { getEvents, type Event } from "../services/events";

interface EventListState {
  events: Event[];
  loading: boolean;
  error: boolean;
}

export function useEventList(keycloak: Keycloak): EventListState {
  const [state, setState] = useState<EventListState>({ events: [], loading: true, error: false });

  useEffect(() => {
    let active = true;

    async function loadEvents() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const result = await getEvents(keycloak.token);
        if (active) setState({ events: result.items, loading: false, error: false });
      } catch {
        if (active) setState({ events: [], loading: false, error: true });
      }
    }

    void loadEvents();
    return () => {
      active = false;
    };
  }, [keycloak]);

  return state;
}
