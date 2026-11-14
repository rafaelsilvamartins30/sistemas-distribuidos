import { Icon } from "../components/Icon";
import { useAppearance, type ColorMode, type ColorPalette } from "../contexts/AppearanceContext";

const palettes: { id: ColorPalette; name: string; description: string }[] = [
  { id: "green", name: "Floresta", description: "Verde UNIR" },
  { id: "blue", name: "Oceano", description: "Azul sereno" },
  { id: "violet", name: "Lavanda", description: "Violeta suave" },
  { id: "ember", name: "Brasa", description: "Vermelho intenso" },
];

export function AppearancePage() {
  const { mode, palette, setMode, setPalette } = useAppearance();

  return (
    <>
      <div className="page-intro">
        <span className="appearance-kicker">Personalização</span>
        <h2>Deixe a UNIR com a sua cara</h2>
        <p>Escolha o clima e as cores da sua experiência. A mudança aparece na hora em toda a UNIR.</p>
      </div>

      <section className="appearance-settings-section" aria-labelledby="mode-title">
        <div className="appearance-section-heading">
          <span className="appearance-section-number">01</span>
          <div>
            <h3 id="mode-title">Modo de exibição</h3>
            <p>Escolha entre a aparência clara e a noturna.</p>
          </div>
        </div>
        <div className="appearance-options">
          <ModeChoice mode={mode} value="light" onSelect={setMode} label="Claro" description="Fundo claro e arejado" icon="sun" />
          <ModeChoice mode={mode} value="dark" onSelect={setMode} label="Noturno" description="Mais confortável à noite" icon="moon" />
        </div>
      </section>

      <section className="appearance-settings-section" aria-labelledby="palette-title">
        <div className="appearance-section-heading">
          <span className="appearance-section-number">02</span>
          <div>
            <h3 id="palette-title">Paleta de cores</h3>
            <p>A cor escolhida aparece nos botões, nos destaques e na identidade visual.</p>
          </div>
        </div>
        <div className="appearance-options">
          {palettes.map((option) => (
            <button
              aria-pressed={palette === option.id}
              className="choice-card"
              key={option.id}
              onClick={() => setPalette(option.id)}
              type="button"
            >
              <span className={`choice-swatch palette-${option.id}`}>
                {palette === option.id && <Icon name="check" width="17" height="17" />}
              </span>
              <span className="choice-copy choice-copy-grow">
                <strong>{option.name}</strong>
                <span>{option.description}</span>
              </span>
              {palette === option.id && <span className="choice-selected"><Icon name="check" width="13" height="13" /> Ativa</span>}
            </button>
          ))}
        </div>
      </section>

      <p className="appearance-footnote"><Icon name="check" width="15" height="15" /> Suas escolhas são salvas automaticamente neste navegador.</p>
    </>
  );
}

function ModeChoice({
  mode,
  value,
  onSelect,
  label,
  description,
  icon,
}: {
  mode: ColorMode;
  value: ColorMode;
  onSelect: (value: ColorMode) => void;
  label: string;
  description: string;
  icon: "sun" | "moon";
}) {
  const selected = mode === value;

  return (
    <button aria-pressed={selected} className="choice-card" onClick={() => onSelect(value)} type="button">
      <span className="setting-icon"><Icon name={icon} /></span>
      <span className="choice-copy choice-copy-grow">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      {selected && <span className="choice-selected"><Icon name="check" width="13" height="13" /> Ativo</span>}
    </button>
  );
}
