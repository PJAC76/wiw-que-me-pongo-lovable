import jsPDF from "jspdf";
import {
  formatDayLabel,
  formatWeekRange,
  groupLogsByWeek,
  type OutfitLog,
} from "./outfit-logs";
import { CATEGORY_LABELS, type ClothingItem } from "./wardrobe";

export interface ExportFilters {
  from?: string;
  to?: string;
  occasions?: string[];
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function describeFilters(f: ExportFilters): string {
  const parts: string[] = [];
  if (f.from && f.to) parts.push(`Rango: ${f.from} — ${f.to}`);
  else if (f.from) parts.push(`Desde: ${f.from}`);
  else if (f.to) parts.push(`Hasta: ${f.to}`);
  if (f.occasions && f.occasions.length > 0)
    parts.push(`Ocasiones (AND): ${f.occasions.join(" + ")}`);
  return parts.length ? parts.join(" · ") : "Sin filtros aplicados";
}

function itemLabel(item: ClothingItem | undefined, id: string): string {
  if (!item) return `(prenda eliminada ${id.slice(0, 6)})`;
  const cat = CATEGORY_LABELS[item.category] ?? item.category;
  return item.name ? `${item.name} (${cat})` : cat;
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportOutfitLogsCSV(
  logs: OutfitLog[],
  itemsById: Map<string, ClothingItem>,
  filters: ExportFilters,
) {
  const header = [
    "fecha",
    "dia",
    "ocasiones",
    "prendas",
    "num_prendas",
    "nota",
  ];
  const rows = logs.map((l) => [
    l.worn_on,
    formatDayLabel(l.worn_on),
    (l.occasions ?? []).join(" + "),
    l.item_ids.map((id) => itemLabel(itemsById.get(id), id)).join(" | "),
    String(l.item_ids.length),
    l.note ?? "",
  ]);

  const meta = [
    `# Historial de outfits`,
    `# Exportado: ${new Date().toISOString()}`,
    `# ${describeFilters(filters)}`,
    `# Total registros: ${logs.length}`,
    "",
  ].join("\n");

  const body = [header, ...rows]
    .map((r) => r.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([meta + body], { type: "text/csv;charset=utf-8" });
  download(blob, `historial-outfits-${todayStamp()}.csv`);
}

export function exportOutfitLogsPDF(
  logs: OutfitLog[],
  itemsById: Map<string, ClothingItem>,
  filters: ExportFilters,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const marginTop = 48;
  const marginBottom = 40;
  let y = marginTop;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const writeWrapped = (
    text: string,
    x: number,
    opts: { size?: number; style?: "normal" | "bold"; color?: [number, number, number]; maxWidth?: number; lineGap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const style = opts.style ?? "normal";
    const color = opts.color ?? [30, 30, 30];
    const maxWidth = opts.maxWidth ?? pageWidth - marginX * 2 - (x - marginX);
    const gap = opts.lineGap ?? 2;
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(size + gap);
      doc.text(line, x, y);
      y += size + gap;
    }
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text("Historial de outfits", marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `Exportado el ${new Intl.DateTimeFormat("es-ES", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date())}`,
    marginX,
    y,
  );
  y += 14;
  writeWrapped(describeFilters(filters), marginX, {
    size: 9,
    color: [110, 110, 110],
  });
  writeWrapped(`Total de registros: ${logs.length}`, marginX, {
    size: 9,
    color: [110, 110, 110],
  });
  y += 6;

  if (logs.length === 0) {
    writeWrapped("Sin resultados para los filtros aplicados.", marginX, {
      size: 11,
    });
  }

  const weeks = groupLogsByWeek(logs);
  for (const week of weeks) {
    ensureSpace(26);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text(formatWeekRange(week.start), marginX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    const countText = `${week.logs.length} ${
      week.logs.length === 1 ? "outfit" : "outfits"
    }`;
    doc.text(
      countText,
      pageWidth - marginX - doc.getTextWidth(countText),
      y,
    );
    y += 6;
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 12;

    for (const log of week.logs) {
      ensureSpace(40);
      writeWrapped(formatDayLabel(log.worn_on), marginX, {
        size: 10,
        style: "bold",
      });
      if (log.occasions.length > 0) {
        writeWrapped(`Ocasiones: ${log.occasions.join(" + ")}`, marginX, {
          size: 9,
          color: [80, 80, 80],
        });
      }
      const itemsText = log.item_ids
        .map((id) => `• ${itemLabel(itemsById.get(id), id)}`)
        .join("   ");
      writeWrapped(itemsText || "• (sin prendas)", marginX, {
        size: 9,
        color: [60, 60, 60],
      });
      if (log.note) {
        writeWrapped(`Nota: ${log.note}`, marginX, {
          size: 9,
          color: [110, 110, 110],
        });
      }
      y += 6;
    }
  }

  // Footer con paginación
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(
      `WIW · Historial de outfits · Página ${i} de ${total}`,
      pageWidth / 2,
      pageHeight - 20,
      { align: "center" },
    );
  }

  doc.save(`historial-outfits-${todayStamp()}.pdf`);
}
