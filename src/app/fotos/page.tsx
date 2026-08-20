"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Sex, estimateBfPercentNavy } from "@/lib/bodyComposition";
import { ProgressPhoto, addProgressPhoto, deleteProgressPhoto, loadProgressPhotos } from "@/lib/photos";
import { fmt, fmtDate } from "@/lib/format";
import { IconScale } from "@/components/icons";

const todayISO = () => new Date().toISOString().slice(0, 10);

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
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Fotos de progresso</h1>
        <p className="text-sm text-muted mt-2">
          Anexe uma foto por data para comparar sua evolução visualmente. O %BF é calculado pelo método da Marinha
          dos EUA a partir de medidas de circunferência — não por análise da imagem.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
          </Field>
          <Field label="Foto">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="input file:mr-3 file:rounded-md file:border-0 file:bg-accent/15 file:text-accent file:px-3 file:py-1.5 file:text-xs"
              required
            />
          </Field>
        </div>

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Prévia da foto" className="h-40 w-40 object-cover rounded-md border border-border" />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sexo biológico (fórmula do %BF)">
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)} className="input">
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
            </select>
          </Field>
          <Field label="Altura (cm)">
            <input type="number" step="0.1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className="input" placeholder="ex: 178" />
          </Field>
          <Field label="Cintura (cm)">
            <input type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)} className="input" placeholder="na altura do umbigo" />
          </Field>
          <Field label="Pescoço (cm)">
            <input type="number" step="0.1" value={neck} onChange={(e) => setNeck(e.target.value)} className="input" />
          </Field>
          {sex === "feminino" && (
            <Field label="Quadril (cm)">
              <input type="number" step="0.1" value={hip} onChange={(e) => setHip(e.target.value)} className="input" />
            </Field>
          )}
        </div>

        {estimatedBf != null && (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
              <IconScale className="h-3.5 w-3.5" />
            </span>
            %BF estimado: <span className="font-semibold">{fmt(estimatedBf, 1)}%</span>
          </div>
        )}

        <Field label="Notas (opcional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" />
        </Field>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button type="submit" disabled={saving || !file} className="btn-primary">
          {saving ? "Salvando…" : "Salvar foto"}
        </button>
      </form>

      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Histórico de fotos</h2>
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
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
