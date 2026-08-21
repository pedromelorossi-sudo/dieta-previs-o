"use client";

/* Camada de composição da skill `apple-design`.
 *
 * `components.md` traz os tijolos em HTML puro; isto é a tradução deles para
 * React, com os tokens do projeto. `patterns.md` define quatro arquétipos de
 * página e cada um se monta com estes componentes:
 *
 *   A. Detalhe/leitura → PageHero + prosa solta (sem cartão em volta)
 *   B. Índice/lista    → PageHero + SectionHeading + Panel/ListRow
 *   C. Home/dashboard  → PageHero + Segmented + Panel (lista unificada)
 *   D. Formulário      → FormPanel + FormRow (rótulo à esquerda, controle à direita)
 *
 * A regra que atravessa todos: itens irmãos moram num painel branco só,
 * separados por fio. Cartão isolado só para objeto que não tem irmão.
 */

import Link from "next/link";
import { ReactNode } from "react";

/* ── containers ─────────────────────────────────────────────────────────────
 * Duas larguras, e só duas: 720px para o que se lê de cima a baixo, 1080px
 * para o que se varre com o olho. */

export function ReadingPage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-[22px] pb-24 pt-[clamp(28px,5vw,44px)] space-y-[clamp(34px,6vw,56px)]">
      {children}
    </div>
  );
}

export function GridPage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1080px] px-[22px] pb-24 pt-[clamp(28px,5vw,44px)] space-y-[clamp(34px,6vw,56px)]">
      {children}
    </div>
  );
}

/* ── herói ───────────────────────────────────────────────────────────────────
 * Entra rápido: sobrancelha → título → uma linha de apoio. Sem preâmbulo.
 * `stat` é a linha de número tabular que o arquétipo C pede. */

export function PageHero({
  eyebrow,
  live,
  title,
  lede,
  stat,
  actions,
}: {
  eyebrow?: ReactNode;
  live?: boolean;
  title: ReactNode;
  lede?: ReactNode;
  stat?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section>
      {eyebrow && (
        <div className="flex items-center gap-2.5 text-[12px] font-semibold tracking-[0.14em] text-neutral">
          {live && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-live animate-glow-pulse" />}
          <span className="uppercase">{eyebrow}</span>
        </div>
      )}
      <h1 className="mt-[15px] text-[clamp(32px,6vw,52px)] leading-[1.06]">{title}</h1>
      {lede && <p className="mt-4 max-w-[560px] text-[clamp(15px,2.5vw,18px)] leading-[1.6] text-muted">{lede}</p>}
      {stat && <div className="mt-5 text-[15px] tabular-nums text-muted">{stat}</div>}
      {actions && <div className="mt-7 flex flex-wrap items-center gap-3">{actions}</div>}
    </section>
  );
}

/* ── cabeçalho de seção ──────────────────────────────────────────────────────
 * Fica ACIMA do painel, nunca dentro. É assim que a Apple rotula grupo. */

export function SectionHeading({
  title,
  desc,
  right,
}: {
  title: ReactNode;
  desc?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[clamp(20px,3.4vw,26px)]">{title}</h2>
        {desc && <p className="mt-1.5 max-w-[560px] text-[14px] leading-[1.55] text-muted">{desc}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* ── painel unificado ───────────────────────────────────────────────────────
 * O padrão anti-fragmentação. O fio entre linhas sai do CSS (`.panel-row +
 * .panel-row`), então não há fio sobrando no topo nem no rodapé. */

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{children}</div>;
}

/* Linha de lista: título, apoio, e um valor à direita.
 * Vira link ou botão conforme receba `href` ou `onClick`. */
export function ListRow({
  title,
  sub,
  right,
  href,
  onClick,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[17px] font-semibold leading-[1.45] tracking-[-0.01em]">{title}</div>
        {sub && <div className="mt-1 text-[13.5px] leading-[1.5] text-muted">{sub}</div>}
      </div>
      {right && <div className="shrink-0 text-right tabular-nums">{right}</div>}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="panel-row block">
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="panel-row block">
        {inner}
      </button>
    );
  }
  return <div className="panel-row">{inner}</div>;
}

/* ── controle segmentado ────────────────────────────────────────────────────
 * Trilho cinza com uma pílula branca que se move. O arquétipo C usa isto para
 * trocar a visão do feed em vez de mostrar as duas ao mesmo tempo. */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-full bg-black/[0.05] p-[3px]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-[15px] py-[7px] text-[13px] transition-all duration-200 ${
              active
                ? "bg-surface font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                : "font-medium text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── formulário (arquétipo D) ───────────────────────────────────────────────
 * A mudança estrutural real: cada grupo é UM painel branco de linhas, e a
 * linha põe o rótulo à esquerda e o controle à direita. O empilhado
 * rótulo-em-cima-do-campo é a forma genérica de web, não a da Apple. */

export function FormPanel({
  label,
  desc,
  children,
  footer,
}: {
  label?: ReactNode;
  desc?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section>
      {label && <h2 className="mb-3 px-1 text-[15px] font-semibold tracking-[-0.01em]">{label}</h2>}
      {desc && <p className="mb-3 px-1 text-[13.5px] leading-[1.55] text-muted">{desc}</p>}
      <div className="panel">{children}</div>
      {footer && <p className="mt-3 px-1 text-[13px] leading-[1.5] text-neutral">{footer}</p>}
    </section>
  );
}

/* Linha de formulário. `stacked` existe para o caso legítimo em que o controle
 * é largo demais para caber ao lado (textarea, grupo de opções) — aí o rótulo
 * sobe, mas a linha continua dentro do mesmo painel. */
export function FormRow({
  label,
  hint,
  children,
  stacked = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <label className="panel-row block">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-[1.45] text-neutral">{hint}</span>}
        <span className="mt-2.5 block">{children}</span>
      </label>
    );
  }
  return (
    <label className="panel-row flex min-h-[44px] items-center justify-between gap-5">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-[1.45] text-neutral">{hint}</span>}
      </span>
      <span className="w-[clamp(120px,38%,220px)] shrink-0">{children}</span>
    </label>
  );
}

/* Linha de leitura: rótulo à esquerda, valor à direita. Mesma forma da linha de
 * formulário, mas sem controle — para painel de resumo. */
export function ValueRow({
  label,
  hint,
  value,
  emphasis = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="panel-row flex items-baseline justify-between gap-5">
      <div className="min-w-0">
        <div className={`text-[15px] ${emphasis ? "font-semibold" : "font-medium"}`}>{label}</div>
        {hint && <div className="mt-0.5 text-[13px] leading-[1.45] text-neutral">{hint}</div>}
      </div>
      <div className={`shrink-0 tabular-nums ${emphasis ? "text-[19px] font-semibold" : "text-[15px] text-muted"}`}>
        {value}
      </div>
    </div>
  );
}
