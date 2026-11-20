import { Fragment, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(value: string): ReactNode[] {
  const tokens = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  const output: ReactNode[] = [];
  let offset = 0;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(value))) {
    if (match.index > offset) output.push(value.slice(offset, match.index));
    const token = match[0];
    if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link ? safeHref(link[2]) : null;
      output.push(
        href ? (
          <a
            key={match.index}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noreferrer" : undefined}
          >
            {link?.[1]}
          </a>
        ) : (
          link?.[1]
        ),
      );
    } else if (token.startsWith("`")) {
      output.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      output.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else {
      output.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    }
    offset = match.index + token.length;
  }
  if (offset < value.length) output.push(value.slice(offset));
  return output;
}

export function MarkdownContent({ value }: { value: string }) {
  const lines = value.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const Tag = `h${Math.min(5, heading[1].length + 1)}` as "h2" | "h3" | "h4" | "h5";
      blocks.push(<Tag key={index}>{inlineMarkdown(heading[2])}</Tag>);
      index += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(<blockquote key={index}>{inlineMarkdown(line.slice(2))}</blockquote>);
      index += 1;
      continue;
    }
    const listMatch = /^([-*+] |\d+\. )/.exec(line);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[0]);
      const items: ReactNode[] = [];
      while (
        index < lines.length &&
        (ordered ? /^\d+\. /.test(lines[index].trim()) : /^[-*+] /.test(lines[index].trim()))
      ) {
        const item = lines[index].trim().replace(ordered ? /^\d+\. / : /^[-*+] /, "");
        items.push(<li key={index}>{inlineMarkdown(item)}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol key={`list-${index}`}>{items}</ol> : <ul key={`list-${index}`}>{items}</ul>);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s|^> |^([-*+] |\d+\. )/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
  }
  return (
    <div className="institutional-markdown">
      {blocks.map((block, blockIndex) => (
        <Fragment key={blockIndex}>{block}</Fragment>
      ))}
    </div>
  );
}

export function InstitutionalLinks({ links }: { links: unknown[] }) {
  const items = links.flatMap((item) => {
    if (typeof item === "string") {
      return [{ label: item, href: safeHref(item) }];
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as { label?: unknown; url?: unknown };
    if (typeof candidate.url !== "string") return [];
    const href = safeHref(candidate.url);
    const label = typeof candidate.label === "string" && candidate.label.trim() ? candidate.label : candidate.url;
    return [{ label, href }];
  });
  if (!items.length) return null;
  return (
    <section className="detail-copy-section" aria-labelledby="institutional-links-title">
      <h2 id="institutional-links-title">Links e contatos</h2>
      <ul className="campus-space-links">
        {items.map((item, index) => (
          <li key={`${item.href ?? item.label}-${index}`}>
            {item.href ? (
              <a
                href={item.href}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel={item.href.startsWith("http") ? "noreferrer" : undefined}
              >
                {item.label}
              </a>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export type InstitutionalProfileTab = "profile" | "posts" | "community";

export function useInstitutionalProfileTab(
  community = false,
): [InstitutionalProfileTab, (tab: InstitutionalProfileTab) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const selected: InstitutionalProfileTab =
    requested === "posts" || (community && requested === "community") ? requested : "profile";
  function select(tab: InstitutionalProfileTab) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (tab === "profile") next.delete("tab");
        else next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  }
  return [selected, select];
}

export function InstitutionalProfileTabs({
  selected,
  onSelect,
  community = false,
}: {
  selected: InstitutionalProfileTab;
  onSelect: (tab: InstitutionalProfileTab) => void;
  community?: boolean;
}) {
  const tabs: Array<{ id: InstitutionalProfileTab; label: string }> = [
    { id: "profile", label: "Perfil" },
    { id: "posts", label: "Publicações" },
    ...(community ? [{ id: "community" as const, label: "Central da comunidade" }] : []),
  ];
  return (
    <div className="institutional-profile-tabs" role="tablist" aria-label="Conteúdo do perfil institucional">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`profile-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={selected === tab.id}
          aria-controls={`profile-panel-${tab.id}`}
          tabIndex={selected === tab.id ? 0 : -1}
          className={selected === tab.id ? "is-active" : ""}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
