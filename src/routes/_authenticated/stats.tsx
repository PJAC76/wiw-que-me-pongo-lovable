import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Shirt, Sparkles, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { listOutfitLogs, type OutfitLog } from "@/lib/outfit-logs";
import {
  CATEGORY_LABELS,
  listClothingItems,
  type ClothingItem,
} from "@/lib/wardrobe";

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({
    meta: [
      { title: "Estadísticas — WIW" },
      {
        name: "description",
        content:
          "Con qué frecuencia repites cada outfit y qué combinaciones de ocasiones usas más.",
      },
    ],
  }),
  component: StatsScreen,
});

interface OutfitBucket {
  signature: string;
  itemIds: string[];
  count: number;
  lastWorn: string;
  firstWorn: string;
  occasions: Map<string, number>;
}

function outfitSignature(itemIds: string[]): string {
  return [...itemIds].sort().join("|");
}

function occasionComboKey(occasions: string[]): string {
  return [...occasions].map((o) => o.toLowerCase()).sort().join(" + ");
}

function formatDate(dateStr: string, locale = "es-ES") {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr + "T00:00:00"));
}

function StatsScreen() {
  const { user } = useAuth();

  const logsQuery = useQuery({
    queryKey: ["outfit_logs", user?.id, "all"],
    queryFn: () => listOutfitLogs(user!.id),
    enabled: !!user?.id,
  });

  const itemsQuery = useQuery({
    queryKey: ["clothing_items", user?.id],
    queryFn: () => listClothingItems(user!.id),
    enabled: !!user?.id,
  });

  const logs = logsQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const itemMap = useMemo(() => {
    const m = new Map<string, ClothingItem>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  const { outfitBuckets, occasionCombos, singleOccasions, totalLogs } = useMemo(
    () => computeStats(logs),
    [logs],
  );

  const loading = logsQuery.isLoading || itemsQuery.isLoading;

  return (
    <AppShell
      eyebrow="Estadísticas"
      title="Tus patrones"
      rightSlot={
        <Link
          to="/outfits"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Historial
        </Link>
      }
    >
      {loading ? (
        <LoadingState />
      ) : totalLogs === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          <SummaryCards
            totalLogs={totalLogs}
            uniqueOutfits={outfitBuckets.length}
            comboCount={occasionCombos.length}
          />

          <Section
            icon={<Shirt className="h-4 w-4" />}
            title="Outfits más repetidos"
            subtitle="Combinaciones exactas de prendas que has vuelto a poner."
          >
            {outfitBuckets.length === 0 ? (
              <Empty text="Aún no hay outfits repetidos." />
            ) : (
              <ul className="space-y-3">
                {outfitBuckets.slice(0, 10).map((b) => (
                  <OutfitRow key={b.signature} bucket={b} itemMap={itemMap} />
                ))}
              </ul>
            )}
          </Section>

          <Section
            icon={<Sparkles className="h-4 w-4" />}
            title="Combinaciones de ocasión"
            subtitle="Etiquetas usadas juntas en el mismo outfit."
          >
            {occasionCombos.length === 0 ? (
              <Empty text="Registra outfits con más de una etiqueta para ver combinaciones." />
            ) : (
              <BarList
                data={occasionCombos.slice(0, 10).map((c) => ({
                  label: c.key,
                  value: c.count,
                }))}
              />
            )}
          </Section>

          <Section
            icon={<BarChart3 className="h-4 w-4" />}
            title="Ocasiones más frecuentes"
            subtitle="Contando cada etiqueta por separado."
          >
            {singleOccasions.length === 0 ? (
              <Empty text="No hay etiquetas de ocasión registradas." />
            ) : (
              <BarList
                data={singleOccasions.slice(0, 12).map((c) => ({
                  label: c.key,
                  value: c.count,
                }))}
              />
            )}
          </Section>
        </div>
      )}
    </AppShell>
  );
}

function computeStats(logs: OutfitLog[]) {
  const bucketMap = new Map<string, OutfitBucket>();
  const comboMap = new Map<string, number>();
  const singleMap = new Map<string, number>();

  for (const log of logs) {
    if (!log.item_ids || log.item_ids.length === 0) continue;
    const sig = outfitSignature(log.item_ids);
    let bucket = bucketMap.get(sig);
    if (!bucket) {
      bucket = {
        signature: sig,
        itemIds: [...log.item_ids].sort(),
        count: 0,
        lastWorn: log.worn_on,
        firstWorn: log.worn_on,
        occasions: new Map(),
      };
      bucketMap.set(sig, bucket);
    }
    bucket.count += 1;
    if (log.worn_on > bucket.lastWorn) bucket.lastWorn = log.worn_on;
    if (log.worn_on < bucket.firstWorn) bucket.firstWorn = log.worn_on;
    for (const occ of log.occasions ?? []) {
      const k = occ.toLowerCase();
      bucket.occasions.set(k, (bucket.occasions.get(k) ?? 0) + 1);
      singleMap.set(k, (singleMap.get(k) ?? 0) + 1);
    }

    const occs = log.occasions ?? [];
    if (occs.length >= 2) {
      const key = occasionComboKey(occs);
      comboMap.set(key, (comboMap.get(key) ?? 0) + 1);
    }
  }

  const outfitBuckets = Array.from(bucketMap.values())
    .filter((b) => b.count >= 2)
    .sort((a, b) => b.count - a.count || (a.lastWorn < b.lastWorn ? 1 : -1));

  const occasionCombos = Array.from(comboMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  const singleOccasions = Array.from(singleMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  return {
    outfitBuckets,
    occasionCombos,
    singleOccasions,
    totalLogs: logs.length,
  };
}

function SummaryCards({
  totalLogs,
  uniqueOutfits,
  comboCount,
}: {
  totalLogs: number;
  uniqueOutfits: number;
  comboCount: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat label="Registros" value={totalLogs} />
      <Stat label="Repetidos" value={uniqueOutfits} />
      <Stat label="Combos" value={comboCount} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-2xl leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-3 flex items-start gap-2">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

function OutfitRow({
  bucket,
  itemMap,
}: {
  bucket: OutfitBucket;
  itemMap: Map<string, ClothingItem>;
}) {
  const items = bucket.itemIds
    .map((id) => itemMap.get(id))
    .filter((x): x is ClothingItem => !!x);
  const missing = bucket.itemIds.length - items.length;

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span
              key={it.id}
              className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] text-foreground"
              title={CATEGORY_LABELS[it.category as keyof typeof CATEGORY_LABELS] ?? it.category}
            >
              {it.name ||
                CATEGORY_LABELS[it.category as keyof typeof CATEGORY_LABELS] ||
                "Prenda"}
            </span>
          ))}
          {missing > 0 && (
            <span className="inline-flex items-center rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              +{missing} eliminada{missing === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl leading-none tabular-nums">×{bucket.count}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            veces
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>Última: {formatDate(bucket.lastWorn)}</span>
        <span>Primera: {formatDate(bucket.firstWorn)}</span>
        {bucket.occasions.size > 0 && (
          <span className="capitalize">
            {Array.from(bucket.occasions.keys()).slice(0, 3).join(", ")}
          </span>
        )}
      </div>
    </li>
  );
}

function BarList({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs capitalize text-foreground">{d.label}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {d.value}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-foreground/80"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="h-20 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center">
      <BarChart3 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
      <h2 className="text-sm font-medium">Sin datos todavía</h2>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
        Registra qué te pones desde{" "}
        <Link to="/recommendations" className="underline">
          Para hoy
        </Link>{" "}
        y vuelve aquí para ver tus patrones.
      </p>
    </div>
  );
}
