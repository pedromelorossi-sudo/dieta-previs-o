"use client";

/* apple-design · arquétipo B (Grade/lista) · coluna de grade 1080
 *
 * A tela que faltava. `upsertDiet` gravava a dieta no banco desde sempre e
 * `loadDiets` existia em dietStorage.ts SEM UM ÚNICO CHAMADOR — exatamente o
 * mesmo defeito que `loadTrainingPrograms` tinha na área de treino. O plano era
 * salvo corretamente e não havia rota nenhuma para voltar nele: a navegação só
 * oferecia "Montar dieta" (/dieta/novo), e /previsao e /previsao-ia também
 * empurram para lá, sempre começando do zero.
 *
 * Do lado de quem usa isso aparecia como "a dieta não fica salva" — e a
 * descrição estava certa quanto ao efeito, embora o dado estivesse íntegro no
 * banco o tempo todo.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Diet, dietTotals } from "@/lib/dietBuilder";
import { loadDiets, deleteDiet } from "@/lib/dietStorage";
import { fmt, fmtDate } from "@/lib/format";
import { GridPage, PageHero, Panel, SectionHeading } from "@/components/apple";

export default function MinhasDietasPage() {
  const { ready, user } = useAuth();
  const [diets, setDiets] = useState<Diet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    loadDiets()
      .then(setDiets)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar as dietas."));
  }, [ready, user]);

  async function handleDelete(diet: Diet) {
    if (!window.confirm(`Excluir "${diet.name}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await deleteDiet(diet.id);
      setDiets((prev) => (prev ? prev.filter((d) => d.id !== diet.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  if (!ready) return <GridPage>Carregando…</GridPage>;

  if (!user) {
    return (
      <GridPage>
        <PageHero
          eyebrow="Plano alimentar"
          title="Minhas dietas"
          lede="Entre na sua conta para ver os planos que você salvou."
          actions={
            <Link href="/login" className="btn-primary">
              Entrar
            </Link>
          }
        />
      </GridPage>
    );
  }

  return (
    <GridPage>
      <PageHero
        eyebrow="Plano alimentar"
        title="Minhas dietas"
        lede="Os planos que você salvou. Abra para ajustar as refeições ou gerar o PDF de novo."
        actions={
          <Link href="/dieta/novo" className="btn-primary">
            Montar nova dieta
          </Link>
        }
      />

      {error && <div className="panel border-warn/30 bg-warn/5 p-4 text-sm text-warn">{error}</div>}

      {!diets ? (
        <div className="skeleton h-40 w-full" />
      ) : diets.length === 0 ? (
        <Panel>
          <div className="panel-row">
            <div className="text-[15px] font-medium">Nenhuma dieta salva ainda</div>
            <p className="mt-1.5 text-[13.5px] leading-[1.5] text-muted">
              Monte um plano em <Link href="/dieta/novo" className="text-accent hover:underline">Montar dieta</Link> e
              clique em Salvar. Ele passa a aparecer aqui.
            </p>
          </div>
        </Panel>
      ) : (
        <section>
          <SectionHeading
            title={diets.length === 1 ? "1 plano salvo" : `${diets.length} planos salvos`}
            desc="O total é o que as refeições somam hoje; a meta é a que estava definida quando o plano foi montado."
          />
          <Panel>
            {diets.map((diet) => {
              const totais = dietTotals(diet);
              return (
                /* Não uso ListRow aqui porque a linha tem DOIS destinos: abrir o
                   plano e excluí-lo. Um <a> envolvendo tudo engoliria o botão. */
                <div key={diet.id} className="panel-row flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/dieta/${diet.id}`}
                      className="text-[17px] font-semibold leading-[1.45] tracking-[-0.01em] hover:text-accent"
                    >
                      {diet.name}
                    </Link>
                    <div className="mt-1 text-[13.5px] leading-[1.5] text-muted">
                      Salvo em {fmtDate(diet.createdAt.slice(0, 10))} · {diet.meals.length}{" "}
                      {diet.meals.length === 1 ? "refeição" : "refeições"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right text-[13.5px] tabular-nums text-muted">
                      <div className="text-foreground">{fmt(totais.kcal, 0)} kcal</div>
                      <div>
                        P {fmt(totais.proteinG, 0)}g · G {fmt(totais.fatG, 0)}g · C {fmt(totais.carbG, 0)}g
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(diet)}
                      aria-label={`Excluir a dieta ${diet.name}`}
                      className="text-[13px] text-warn hover:underline"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </Panel>
        </section>
      )}
    </GridPage>
  );
}
