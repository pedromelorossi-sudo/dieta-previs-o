type IconProps = { className?: string; style?: React.CSSProperties };

const base = "h-4 w-4";

export function IconFlame({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22c4.2 0 7-2.6 7-6.4 0-3-1.8-4.9-2.9-6.8-.4 1.6-1.3 2.7-2.3 2.7-.3-3.1-1.5-5.2-3.8-6.9C10.4 7.4 9 9.3 9 11.6c-1 .1-1.9-.6-2.3-1.7C5.9 11.2 5 12.9 5 15.2 5 19.2 7.8 22 12 22Z" />
    </svg>
  );
}

export function IconDrumstick({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15.5 8.5c2 2 2.5 5 1 7.5-1.8 3-5.3 3.8-7.6 1.5-2.3-2.3-1.5-5.8 1.5-7.6 2.5-1.5 5.5-1 7.5 1Z" />
      <path d="M8.5 15.5 4 20" />
      <path d="M3 21c-.6-.6-.6-1.6 0-2.2l1.2-1.2c.6-.6 1.6-.6 2.2 0 .6.6.6 1.6 0 2.2L5.2 21c-.6.6-1.6.6-2.2 0Z" />
      <path d="M14 6c.8-1.5 2.6-2.3 4-1.7" />
    </svg>
  );
}

export function IconDroplet({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3c3.5 4 6 7.4 6 10.5a6 6 0 1 1-12 0C6 10.4 8.5 7 12 3Z" />
    </svg>
  );
}

export function IconWheat({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 21V8" />
      <path d="M12 8c-1.8 0-3-1.2-3-3 1.8 0 3 1.2 3 3Z" />
      <path d="M12 8c1.8 0 3-1.2 3-3-1.8 0-3 1.2-3 3Z" />
      <path d="M12 12c-1.8 0-3-1.2-3-3 1.8 0 3 1.2 3 3Z" />
      <path d="M12 12c1.8 0 3-1.2 3-3-1.8 0-3 1.2-3 3Z" />
      <path d="M12 16c-1.8 0-3-1.2-3-3 1.8 0 3 1.2 3 3Z" />
      <path d="M12 16c1.8 0 3-1.2 3-3-1.8 0-3 1.2-3 3Z" />
    </svg>
  );
}

export function IconScale({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}

export function IconTrend({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

export function IconTarget({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function IconCheck({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 12.5 9.5 18 20 6" />
    </svg>
  );
}

/* Marca do Degrau — dragão cuspindo fogo.
 *
 * Desenhado como BRASÃO em silhueta cheia, não como ilustração de traço: a
 * marca precisa viver a 15px dentro do chip da nav, e ali qualquer linha fina
 * fecha e vira mancha. Por isso o desenho tem poucas formas, todas grandes —
 * cabeça de perfil, um chifre varrido para trás, mandíbula aberta, e o fogo
 * saindo em três línguas.
 *
 * O fogo usa `--warn` (o token "heat" da skill), que é o único segundo acento
 * que o sistema autoriza. Em contexto monocromático ele cai para currentColor
 * com opacidade, então a silhueta continua legível sem depender de cor.
 */
/* Marca do Degrau — Hidra de três cabeças, na língua da cerâmica grega de
 * figura vermelha (terracota sobre preto).
 *
 * Desenho original: a referência que o Pedro mandou é arte de banco de imagens,
 * com marca d'água — copiar ou traçar aquilo seria usar obra de terceiro. O que
 * se herda dela é o vocabulário (figura vermelha, greca na borda, o motivo da
 * Hidra), que é estilo e mito, não propriedade de ninguém.
 *
 * Construção: pescoços como traço grosso de ponta arredondada, cabeças como
 * cunhas com a boca aberta em V. Silhueta só — a 15px na nav qualquer detalhe
 * interno fecha, e o que sobrevive é a forma de três pescoços subindo.
 *
 * O mito também assenta no app: cada cabeça cortada volta, e o herói só vence
 * repetindo o golpe ciclo após ciclo. É literalmente o método do Degrau. */
export function IconDegrau({ className = base, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" fill="none">
        <path d="M10.9 19.4C9.7 16 8.2 13.3 6.2 11" />
        <path d="M12 19.9V7.6" />
        <path d="M13.1 19.4c1.2-3.4 2.7-6.1 4.7-8.4" />
      </g>
      {/* cabeças: cunha com a mandíbula aberta */}
      <g fill="currentColor">
        <path d="m6.3 11.2-4.1-1.9 3.1-.3-1.7-2.4 3.9 2.8-1.2 1.8Z" />
        <path d="M12.1 7.8 9.6 4.1l2.7 1.1.9-2.7 1 4.6-2.1.7Z" />
        <path d="m17.7 11.2 4.1-1.9-3.1-.3 1.7-2.4-3.9 2.8 1.2 1.8Z" />
      </g>
      {/* corpo enrolado na base — dá peso e assenta a figura */}
      <path
        fill="currentColor"
        d="M12 18.2c2.9 0 5.2 1 6.9 3H5.1c1.7-2 4-3 6.9-3Z"
      />
    </svg>
  );
}

export function IconClipboard({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h6" />
    </svg>
  );
}

export function IconDumbbell({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6.5 8.5v7M4 10v4" />
      <path d="M17.5 8.5v7M20 10v4" />
      <path d="M8.5 12h7" />
    </svg>
  );
}
