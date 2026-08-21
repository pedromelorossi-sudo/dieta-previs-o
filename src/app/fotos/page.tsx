"use client";

/* apple-design · arquétipo B (Índice) + formulário D
 * A grade de miniaturas fica como grade: são objetos independentes com imagem
 * própria, que é o caso em que a árvore de decisão da skill autoriza cartão.
 * O formulário acima dela vira painéis de linhas.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Sex, estimateBfPercentNavy } from "@/lib/bodyComposition";
import { ProgressPhoto, addProgressPhoto, deleteProgressPhoto, loadProgressPhotos } from "@/lib/photos";
import { fmt, fmtDate } from "@/lib/format";
import { IconScale } from "@/components/icons";

const todayISO = () => new Date().toISOString().slice(0, 10);

import { GridPage, PageHero, SectionHeading, FormPanel, FormRow, Panel } from "@/components/apple";

export default function FotosPage() {
  const { ready, user } = useAuth();
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);

  const [date, setDate] = useState(todayISO());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sex, setSex] = useState<Sex>("masculino");
  const [heightCm, setHeightCm] = useState("");
  const [waist, setWaist] = useState("");
  const [neck, setNeck] = useState("");
  const [hip, setHip] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    loadProgressPhotos().then(setPhotos).catch((e) => setError(e.message));
  }, [ready, user]);

  const estimatedBf = useMemo(() => {
    const h = parseFloat(heightCm);
    const w = parseFloat(waist);
    const n = parseFloat(neck);
    const hp = parseFloat(hip);
    if (Number.isNaN(h) || Number.isNaN(w) || Number.isNaN(n) || h <= 0 || w <= 0 || n <= 0) return null;
    if (sex === "feminino" && (Number.isNaN(hp) || hp <= 0)) return null;
    return estimateBfPercentNavy({ sex, heightCm: h, waistCm: w, neckCm: n, hipCm: sex === "feminino" ? hp : undefined });
  }, [sex, heightCm, waist, neck, hip]);

  function handleFileChange(f: File | null) {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !user) return;
    setSaving(true);
    setError(null);
    try {
      await addProgressPhoto({
        date,
        file,
        waistCm: waist ? parseFloat(waist) : null,
        neckCm: neck ? parseFloat(neck) : null,
        hipCm: hip ? parseFloat(hip) : null,
        sex,
        estimatedBfPercent: estimatedBf,
        notes,
        cycleId: null,
      });
      setPhotos(await loadProgressPhotos());
      handleFileChange(null);
      setWaist("");
      setNeck("");
      setHip("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar a foto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(photo: ProgressPhoto) {
    await deleteProgressPhoto(photo);
    setPhotos((prev) => prev?.filter((p) => p.id !== photo.id) ?? null);
  }

  return (
    <GridPage>
      <PageHero
        eyebrow="Progresso"
        title="Fotos de progresso"
        lede="Anexe uma foto por data para comparar sua evolução visualmente. O %BF é calculado pelo método da Marinha dos EUA a partir de medidas de circunferência — não por análise da imagem."
      />

      <form onSubmit={handleSubmit} className="space-y-[clamp(24px,4vw,36px)]">
        <FormPanel label="Registro">
          <FormRow label="Data">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
          </FormRow>
          <FormRow label="Foto" stacked>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="input file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-1.5 file:text-[13px] file:text-white"
              required
            />
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Prévia da foto" className="mt-3 h-40 w-40 rounded-[12px] object-cover" />
            )}
          </FormRow>
          <FormRow label="Notas" hint="Opcional." stacked>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" />
          </FormRow>
        </FormPanel>

        <FormPanel
          label="Medidas de circunferência"
          desc="É daqui que sai o %BF — a foto não é analisada."
          footer={estimatedBf != null ? undefined : "Preencha altura, cintura e pescoço para o %BF aparecer."}
        >
          <FormRow label="Sexo biológico" hint="Define a fórmula usada.">
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)} className="input">
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
            </select>
          </FormRow>
          <FormRow label="Altura" hint="Em centímetros.">
            <input type="number" step="0.1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className="input" placeholder="178" />
          </FormRow>
          <FormRow label="Cintura" hint="Na altura do umbigo.">
            <input type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)} className="input" />
          </FormRow>
          <FormRow label="Pescoço" hint="Em centímetros.">
            <input type="number" step="0.1" value={neck} onChange={(e) => setNeck(e.target.value)} className="input" />
          </FormRow>
          {sex === "feminino" && (
            <FormRow label="Quadril" hint="Em centímetros.">
              <input type="number" step="0.1" value={hip} onChange={(e) => setHip(e.target.value)} className="input" />
            </FormRow>
          )}
          {estimatedBf != null && (
            <div className="panel-row flex items-center justify-between gap-5">
              <span className="flex items-center gap-2 text-[15px] font-semibold">
                <IconScale className="h-4 w-4 text-neutral" />
                %BF estimado
              </span>
              <span className="shrink-0 text-[19px] font-semibold tabular-nums text-accent">
                {fmt(estimatedBf, 1)}%
              </span>
            </div>
          )}
        </FormPanel>

        {error && (
          <Panel>
            <p className="panel-row text-[14.5px] text-danger">{error}</p>
          </Panel>
        )}

        <button type="submit" disabled={saving || !file} className="btn-primary">
          {saving ? "Salvando…" : "Salvar foto"}
        </button>
      </form>

      <section>
        <SectionHeading title="Histórico de fotos" />
        {!photos ? (
          <div className="skeleton h-40 w-full" />
        ) : photos.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma foto registrada ainda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {photos.map((photo) => (
              <div key={photo.id} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.photoUrl} alt={`Foto de ${fmtDate(photo.date)}`} className="h-48 w-full object-cover" />
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{fmtDate(photo.date)}</span>
                    <button onClick={() => handleDelete(photo)} className="text-muted hover:text-danger">
                      excluir
                    </button>
                  </div>
                  {photo.estimatedBfPercent != null && (
                    <div className="text-xs text-accent">%BF estimado: {fmt(photo.estimatedBfPercent, 1)}%</div>
                  )}
                  {photo.notes && <p className="text-xs text-muted">{photo.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </GridPage>
  );
}
