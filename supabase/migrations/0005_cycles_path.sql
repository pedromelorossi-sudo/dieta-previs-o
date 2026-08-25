-- O ciclo passa a guardar a ESTRATÉGIA que foi prescrita nele.
--
-- Sem esta coluna, `previousPath` era reconstruído reclassificando o %BF do
-- ciclo anterior isoladamente — sem o previousPath DELE. Isso perde a corrente:
-- um ciclo que era bulking, mas cujo %BF sozinho cai na faixa do meio (13-16%
-- em homem), volta como "normocalorico". E a histerese de `classifyPathFromBf`
-- só trata "bulking" e "cutting", então a pessoa reentra na faixa morta ciclo
-- após ciclo.
--
-- O efeito medido num usuário real (1,90m, 85kg, lido em 14-15%BF, em superávit
-- declarado): estratégia "normocalórico" com superávit ZERO e um roteiro de 24
-- meses para ganhar 0,7kg — porque a fase de manutenção tem alvo igual ao %BF
-- de partida, nunca termina, e a projeção roda até o teto do horizonte.
--
-- A histerese existia no código desde sempre, com comentário explicando que ela
-- é "o que faz a sequência FECHAR". Ela nunca teve como funcionar, porque o
-- dado que ela precisa não era guardado em lugar nenhum.

alter table public.cycles add column if not exists path text;

comment on column public.cycles.path is
  'Estratégia prescrita neste ciclo: bulking | cutting | normocalorico. Alimenta a histerese de classifyPathFromBf no ciclo seguinte — sem ela a fase é readivinhada pelo %BF e alterna por ruído de leitura.';
