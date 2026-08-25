-- A coluna que derrubava o ciclo inteiro.
--
-- `addCycle` (src/lib/storage.ts) grava `muscle_assessment` desde que a leitura
-- por grupo muscular passou a existir, e o `schema.sql` declara a coluna na
-- linha 111. Mas essa linha nunca chegou ao banco: o schema.sql é o documento
-- do formato, não o que foi aplicado — quem aplica é `supabase/migrations/`, e
-- lá só existiam 0001 a 0003.
--
-- Consequência, verificada com o insert real do addCycle dentro de uma
-- transação revertida:
--
--     insert COM muscle_assessment:  FALHOU
--       column "muscle_assessment" of relation "cycles" does not exist
--     insert SEM muscle_assessment:  OK
--
-- O PostgREST recusa o insert inteiro por causa de uma coluna, então NENHUM
-- ciclo era gravado. E como `addCycle` roda no meio do `handleAnalyze`, ele
-- levava junto tudo o que vem depois — dieta e programa de treino incluídos.
-- Era por isso que o administrador não via a dieta nem o treino de quem tinha
-- acabado de enviar as fotos: a foto grava antes do ciclo e sobrevive; o resto
-- vem depois e morria no mesmo erro.
--
-- É também o que sumia com a análise de %BF por foto: a leitura por grupo
-- muscular viaja DENTRO do ciclo. Sem a coluna, ela era calculada, exibida uma
-- vez na tela e descartada.

alter table public.cycles add column if not exists muscle_assessment jsonb;

comment on column public.cycles.muscle_assessment is
  'Leitura visual por grupo muscular vinda da análise de foto: [{muscle, relativeDevelopment, confidence}]. Alimenta o ponto fraco do gerador de treino e a evolução por grupo.';
