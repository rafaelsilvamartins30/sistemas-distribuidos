export function RegistrationRefundPolicy({ origin }: { origin: "eventos" | "esportes" }) {
  const activity = origin === "eventos" ? "o evento" : "o campeonato";
  return (
    <p className="registration-refund-policy">
      Inscrições pagas não podem ser canceladas pelo participante. O estorno só é solicitado se a organização cancelar{" "}
      {activity}.
    </p>
  );
}
