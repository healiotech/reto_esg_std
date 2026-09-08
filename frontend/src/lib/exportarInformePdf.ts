import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CanalResultado, Categoria, ClienteInput, DetalleNorma, Estatus, PerfilTamano, ResultadoEvaluacion, SimulacionFinanciera } from '../types';
import { formatMiles, formatPesos, formatRangoPesos, formatVeces } from './formatMoney';
import { BANDA_COLOR as BANDA_HEX, BANDA_TEXT_ON, bandaSoftHex } from './banda';

// Documento ejecutivo lineal generado con texto nativo (no captura de pantalla):
// lee el mismo `resultado` que ya está en pantalla y lo reformatea como reporte,
// sin tocar scoring, exposición ni ninguna lógica de cálculo.

const PAGE_W = 215.9; // carta
const PAGE_H = 279.4;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_RESERVE = 14;

const RED = '#ec0000';
const RED_700 = '#990000';
const RED_100 = '#fbe5e5';
const GREEN = '#1e8a4c';
const GREEN_BG = '#e4f5ea';
const AMBER = '#b87500';
const AMBER_BG = '#fbf0dd';
const GRAY_BG = '#f5f5f5';
const TEXT_PRIMARY = '#000000';
const TEXT_SECONDARY = '#454545';
const TEXT_TERTIARY = '#6d6d6d';
const BORDER = '#e2e2e2';

const BANDA_COLOR: Record<CanalResultado['banda'], { bg: string; fg: string; strip: string }> = {
  Bajo: { bg: bandaSoftHex('Bajo'), fg: BANDA_HEX.Bajo, strip: BANDA_HEX.Bajo },
  Medio: { bg: bandaSoftHex('Medio'), fg: BANDA_TEXT_ON.Medio, strip: BANDA_HEX.Medio },
  Alto: { bg: bandaSoftHex('Alto'), fg: BANDA_HEX.Alto, strip: BANDA_HEX.Alto },
  // Crítico se queda con relleno sólido (no tinte suave) para que la banda más
  // grave siga destacando de forma distinta a las otras tres, como en el original.
  Crítico: { bg: BANDA_HEX.Crítico, fg: BANDA_TEXT_ON.Crítico, strip: BANDA_HEX.Crítico },
};

const CATEGORIA_LABEL: Record<Categoria, string> = {
  ambiental: 'Ambiental',
  social: 'Social',
  jurisdiccional_documental: 'Gobernanza',
};

const ESTATUS_LABEL: Record<Estatus, string> = {
  cumple: 'Cumple',
  parcial: 'Parcial',
  no_cumple: 'No cumple',
  desconocido: 'Desconocido',
  // No debería llegar al PDF: v_riesgo_norma excluye 'no_aplica' del detalle.
  no_aplica: 'No aplica',
};

const PERFIL_LABEL: Record<PerfilTamano, string> = {
  pyme: 'PyME',
  mediana: 'Mediana empresa',
  cotiza_bolsa: 'Cotiza en bolsa',
  multinacional: 'Multinacional',
};

function sanitizeFilename(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'cliente'
  );
}

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - FOOTER_RESERVE) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function multaTexto(fila: DetalleNorma): string | null {
  const { multa_min, multa_max, multa_unidad, multa_nota } = fila;
  if (multa_unidad === 'UMA' && (multa_min !== null || multa_max !== null)) {
    const min = multa_min ?? multa_max!;
    const max = multa_max ?? multa_min!;
    const rango = min === max ? `${formatMiles(min)} UMA` : `${formatMiles(min)} – ${formatMiles(max)} UMA`;
    return `Sanción potencial: ${rango}`;
  }
  if (multa_nota) {
    const nota = multa_nota.length > 100 ? `${multa_nota.slice(0, 97)}…` : multa_nota;
    return `Sanción potencial: ${nota}`;
  }
  return null;
}

// Parsea el resumen ejecutivo de la IA ("**Encabezado** | cuerpo", bloques
// separados por línea en blanco). Si el modelo no siguió el formato, devuelve
// un único bloque sin encabezado con el texto crudo.
function parseResumenPdf(texto: string): { encabezado: string; cuerpo: string }[] {
  const re = /\*\*(.+?)\*\*\s*\|\s*([\s\S]*?)(?=\n\s*\*\*|\s*$)/g;
  const out: { encabezado: string; cuerpo: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const cuerpo = m[2].trim().replace(/\s*\n\s*/g, ' ');
    if (cuerpo) out.push({ encabezado: m[1].trim(), cuerpo });
  }
  return out.length > 0 ? out : [{ encabezado: '', cuerpo: texto.trim() }];
}

// Dictamen de bancabilidad (mismo criterio que DictamenBancabilidad en pantalla).
function dictamenBancabilidad(
  e: { bancable_base: boolean; dscr_base: number | null; reestructurable: boolean; plazo_optimo: number | null; dscr_optimo: number | null; deficit_flujo: number },
  plazoBase: number,
): { verdicto: string; razon: string } {
  if (e.bancable_base) {
    return {
      verdicto: 'Bancable',
      razon:
        e.dscr_base != null
          ? `El servicio de deuda queda cubierto con la estructura actual (DSCR ${e.dscr_base.toFixed(2)}x, plazo ${plazoBase} años). Sujeto de crédito sin garantía adicional.`
          : 'El servicio de deuda queda cubierto con la estructura actual. Sujeto de crédito sin garantía adicional.',
    };
  }
  if (e.reestructurable && e.plazo_optimo != null && e.dscr_optimo != null) {
    return {
      verdicto: 'Bancable con reestructura',
      razon: `Ampliar el plazo de la deuda de ${plazoBase} a ${e.plazo_optimo} años eleva el DSCR a ${e.dscr_optimo.toFixed(2)}x y el crédito se vuelve viable.`,
    };
  }
  return {
    verdicto: 'Requiere garantía FEGA',
    razon: `No alcanza el mínimo bancable ni reestructurando a 10 años. Faltan ${formatPesos(e.deficit_flujo)} de flujo anual para cubrir el servicio de deuda; requeriría respaldo de garantía FEGA de FIRA.`,
  };
}

function flagsDeCanal(canal: CanalResultado): string[] {
  const flags: string[] = [];
  if (canal.forzado_por_descalificante) {
    flags.push('Norma descalificante incumplida — forzado a la banda máxima.');
  }
  if (canal.multiplicador_sistemico > 1) {
    flags.push(`Patrón de riesgo en múltiples categorías (×${canal.multiplicador_sistemico}).`);
  }
  return flags;
}

export interface ExportarInformeArgs {
  cliente: ClienteInput;
  sectorNombre: string;
  jurisdiccionNombre: string;
  resultado: ResultadoEvaluacion;
  /** Tip cualitativo del estado (jurisdicciones.contexto_riesgo); no modula el score. */
  contextoRiesgo?: string | null;
  /**
   * Simulación financiera con el PERFIL POR DEFECTO del sector (nunca la
   * versión con supuestos editados en pantalla). Si es null/undefined —
   * aún no cargó o falló — la sección simplemente no se incluye.
   */
  simulacionFinanciera?: SimulacionFinanciera | null;
}

export function exportarInformePdf({
  cliente,
  sectorNombre,
  jurisdiccionNombre,
  resultado,
  contextoRiesgo,
  simulacionFinanciera,
}: ExportarInformeArgs): void {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const ahoraIso = new Date().toISOString();

  let y = 20;

  // ---- Encabezado corporativo -------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(RED);
  doc.text('Santander', MARGIN, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(TEXT_TERTIARY);
  doc.text(`Generado el ${fechaLarga(ahoraIso)}`, PAGE_W - MARGIN, y, { align: 'right' });

  y += 6;
  doc.setDrawColor(RED);
  doc.setLineWidth(0.9);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(TEXT_PRIMARY);
  doc.text('Informe de Riesgo Regulatorio ESG', MARGIN, y);

  y += 9;

  // ---- Sello de estado (prominente, declara su propia autoridad) --------
  const cerrada = resultado.estado === 'cerrada';
  const selloLabel = cerrada ? 'VERIFICADO' : 'PRELIMINAR — No verificado';
  const selloSubRaw = cerrada
    ? `Cerrada el ${resultado.cerrada_en ? fechaLarga(resultado.cerrada_en) : '—'}${resultado.cerrada_por ? ` por ${resultado.cerrada_por}` : ''}.`
    : 'Esta evaluación aún no ha sido verificada ni cerrada por un analista. Puede incluir datos autoreportados sin validar.';
  const selloColor = cerrada ? { bg: GREEN_BG, fg: GREEN } : { bg: AMBER_BG, fg: AMBER };

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const selloSubLines = doc.splitTextToSize(selloSubRaw, CONTENT_W - 12);
  const selloBoxH = 8 + 6 + 1.5 + selloSubLines.length * 4 + 5;

  doc.setFillColor(selloColor.bg);
  doc.roundedRect(MARGIN, y, CONTENT_W, selloBoxH, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(selloColor.fg);
  doc.text(selloLabel, MARGIN + 6, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(selloSubLines, MARGIN + 6, y + 15);

  y += selloBoxH + 8;

  // ---- Resumen ejecutivo (IA) — lo primero que lee el comité -----------
  if (resultado.resumen_ejecutivo && resultado.resumen_ejecutivo.trim()) {
    y = ensureSpace(doc, y, 26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(TEXT_PRIMARY);
    doc.text('Resumen ejecutivo', MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(TEXT_TERTIARY);
    doc.text('Generado por IA: traduce el análisis del modelo determinista a prosa. No calcula ni altera ninguna cifra.', MARGIN, y);
    y += 6;

    for (const s of parseResumenPdf(resultado.resumen_ejecutivo)) {
      if (s.encabezado) {
        y = ensureSpace(doc, y, 12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(TEXT_PRIMARY);
        doc.text(s.encabezado, MARGIN, y);
        y += 4.5;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(TEXT_SECONDARY);
      const lineas = doc.splitTextToSize(s.cuerpo, CONTENT_W) as string[];
      y = ensureSpace(doc, y, lineas.length * 4.2 + 4);
      doc.text(lineas, MARGIN, y);
      y += lineas.length * 4.2 + 4;
    }

    if (resultado.resumen_generado_en) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(TEXT_TERTIARY);
      doc.text(`Generado el ${fechaLarga(resultado.resumen_generado_en)}`, MARGIN, y);
      y += 6;
    }
    y += 2;
  }

  // ---- Datos del cliente ---------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(TEXT_PRIMARY);
  doc.text('Datos del cliente', MARGIN, y);
  y += 6;

  const campos: [string, string][] = [
    ['Cliente', cliente.nombre],
    ['Sector', sectorNombre],
    ['Opera en', jurisdiccionNombre],
    ['Perfil de tamaño', PERFIL_LABEL[cliente.perfil_tamano]],
    ['Exportador', cliente.es_exportador ? 'Sí' : 'No'],
    ...(cliente.en_zona_riesgo ? ([['Zona sensible', 'Sí']] as [string, string][]) : []),
  ];
  const colW = CONTENT_W / 2;
  campos.forEach(([label, valor], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN + col * colW;
    const rowY = y + row * 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(TEXT_TERTIARY);
    doc.text(label.toUpperCase(), x, rowY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(TEXT_PRIMARY);
    doc.text(valor, x, rowY + 5);
  });
  y += Math.ceil(campos.length / 2) * 12 + 6;

  // ---- Contexto de la operación (cualitativo, no modula el score) -------
  const notasContexto: string[] = [];
  if (contextoRiesgo) notasContexto.push(`${jurisdiccionNombre}: ${contextoRiesgo}`);
  if (cliente.en_zona_riesgo) {
    notasContexto.push(`Activo en zona sensible.${cliente.zona_riesgo_nota ? ` ${cliente.zona_riesgo_nota}` : ''}`);
  }
  if (notasContexto.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const lineasPorNota = notasContexto.map((n) => doc.splitTextToSize(n, CONTENT_W - 12) as string[]);
    const totalLineas = lineasPorNota.reduce((n, l) => n + l.length, 0);
    const boxH = 8 + totalLineas * 4 + (notasContexto.length - 1) * 2 + 5;

    y = ensureSpace(doc, y, boxH + 6);
    doc.setFillColor(AMBER_BG);
    doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(AMBER);
    doc.text('CONTEXTO DE LA OPERACIÓN', MARGIN + 6, y + 6);
    let ny = y + 11;
    doc.setFont('helvetica', 'normal');
    lineasPorNota.forEach((lineas) => {
      doc.text(lineas, MARGIN + 6, ny);
      ny += lineas.length * 4 + 2;
    });
    y += boxH + 8;
  }

  // ---- Veredicto de riesgo ---------------------------------------------
  y = ensureSpace(doc, y, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(TEXT_PRIMARY);
  doc.text('Veredicto de riesgo', MARGIN, y);
  y += 5;

  const boxGap = 6;
  const boxW = (CONTENT_W - boxGap) / 2;
  const flagsCredito = flagsDeCanal(resultado.credito);
  const flagsReputacion = flagsDeCanal(resultado.reputacion);
  const wrapFlag = (f: string) => doc.splitTextToSize(f, boxW - 10) as string[];
  const flagLinesCredito = flagsCredito.reduce((n, f) => n + wrapFlag(f).length, 0);
  const flagLinesReputacion = flagsReputacion.reduce((n, f) => n + wrapFlag(f).length, 0);
  const flagLinesMax = Math.max(flagLinesCredito, flagLinesReputacion);
  const boxH = 40 + (flagLinesMax > 0 ? flagLinesMax * 4 + 5 : 0);

  y = ensureSpace(doc, y, boxH + 4);

  function dibujarCanalBox(x: number, titulo: string, canal: CanalResultado, flags: string[]) {
    const soft = BANDA_COLOR[canal.banda];
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, 'S');
    doc.setFillColor(soft.strip);
    doc.roundedRect(x, y, boxW, 1.4, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(TEXT_TERTIARY);
    doc.text(titulo.toUpperCase(), x + 5, y + 8);

    const pillLabel = canal.banda.toUpperCase();
    doc.setFontSize(8);
    const pillW = doc.getTextWidth(pillLabel) + 6;
    doc.setFillColor(soft.bg);
    doc.roundedRect(x + boxW - pillW - 5, y + 4.5, pillW, 5.5, 2, 2, 'F');
    doc.setTextColor(soft.fg);
    doc.text(pillLabel, x + boxW - pillW / 2 - 5, y + 8.3, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(TEXT_PRIMARY);
    const scoreLabel = canal.score.toFixed(3);
    doc.text(scoreLabel, x + 5, y + 21);
    const scoreW = doc.getTextWidth(scoreLabel);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(TEXT_TERTIARY);
    doc.text('score', x + 5 + scoreW + 2, y + 21);

    doc.setDrawColor(BORDER);
    doc.line(x + 5, y + 25.5, x + boxW - 5, y + 25.5);

    const stats: [string, string][] = [
      ['Base', canal.score_base.toFixed(3)],
      ['Norma máx.', canal.max_norma.toFixed(2)],
      ['Factor tamaño', `×${canal.factor_tamano}`],
    ];
    const statW = (boxW - 10) / 3;
    stats.forEach(([label, valor], i) => {
      const sx = x + 5 + i * statW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(TEXT_TERTIARY);
      doc.text(label, sx, y + 30.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(TEXT_PRIMARY);
      doc.text(valor, sx, y + 35);
    });

    if (flags.length > 0) {
      let fy = y + 40;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(AMBER);
      flags.forEach((f) => {
        const lines = wrapFlag(f);
        doc.text(lines, x + 5, fy);
        fy += lines.length * 3.6;
      });
    }
  }

  dibujarCanalBox(MARGIN, 'Riesgo crediticio', resultado.credito, flagsCredito);
  dibujarCanalBox(MARGIN + boxW + boxGap, 'Riesgo reputacional', resultado.reputacion, flagsReputacion);
  y += boxH + 6;

  // ---- Confianza del análisis --------------------------------------------
  const pctVerificado = Math.round((1 - resultado.pct_autoreportado) * 100);
  const pctAutoreportado = 100 - pctVerificado;
  y = ensureSpace(doc, y, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(TEXT_SECONDARY);
  doc.text(`Confianza del análisis: ${pctVerificado}% verificado · ${pctAutoreportado}% autoreportado`, MARGIN, y);
  y += 3;
  const barW = 70;
  doc.setFillColor(RED_100);
  doc.rect(MARGIN, y, barW, 2.4, 'F');
  doc.setFillColor(GREEN);
  doc.rect(MARGIN, y, (barW * pctVerificado) / 100, 2.4, 'F');
  y += 10;

  // Espacio reservado para "Recomendación ejecutiva" (capa de IA, iteración
  // futura): irá aquí, entre el veredicto y la exposición. No se genera aún.

  // ---- Exposición financiera estimada ------------------------------------
  const exp = resultado.exposicion;
  const tieneCifra = exp.exposicion_min_mxn > 0 || exp.exposicion_max_mxn > 0;
  const vacioTotal = !tieneCifra && !exp.hay_no_cuantificable;

  y = ensureSpace(doc, y, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(TEXT_PRIMARY);
  doc.text('Exposición financiera estimada', MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(TEXT_TERTIARY);
  const expSubLines = doc.splitTextToSize(
    'Estimación orientativa basada en supuestos de fiscalización. No es una predicción ni forma parte del score de riesgo.',
    CONTENT_W,
  );
  doc.text(expSubLines, MARGIN, y);
  y += expSubLines.length * 4 + 2;

  if (tieneCifra) {
    y = ensureSpace(doc, y, 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(TEXT_PRIMARY);
    const cifra = formatRangoPesos(exp.exposicion_min_mxn, exp.exposicion_max_mxn);
    doc.text(cifra, MARGIN, y + 6);
    const cifraW = doc.getTextWidth(cifra);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(TEXT_TERTIARY);
    doc.text('MXN', MARGIN + cifraW + 3, y + 6);
    y += 12;

    if (exp.detalle_cuantificable.length > 0) {
      y = ensureSpace(doc, y, 6 + exp.detalle_cuantificable.length * 5.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(TEXT_TERTIARY);
      doc.text(`DESGLOSE POR NORMA (${exp.detalle_cuantificable.length})`, MARGIN, y);
      y += 5;
      exp.detalle_cuantificable.forEach((d) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(TEXT_SECONDARY);
        doc.text(d.norma_titulo, MARGIN, y);
        const monto = formatRangoPesos(d.min_mxn, d.max_mxn);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(TEXT_PRIMARY);
        doc.text(monto, PAGE_W - MARGIN, y, { align: 'right' });
        y += 5.5;
      });
      y += 2;
    }
  }

  if (vacioTotal) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(TEXT_TERTIARY);
    doc.text('Sin exposición financiera estimada (sin incumplimientos cuantificables).', MARGIN, y);
    y += 8;
  }

  if (exp.hay_no_cuantificable) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const introLines = doc.splitTextToSize(
      'Además, esta evaluación tiene riesgos de impacto categórico que no están incluidos en la cifra anterior:',
      CONTENT_W - 10,
    ) as string[];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const items = exp.no_cuantificables.map((n) => ({
      titulo: doc.splitTextToSize(n.norma_titulo, CONTENT_W - 14) as string[],
      motivo: doc.splitTextToSize(n.motivo, CONTENT_W - 14) as string[],
    }));
    const itemsLineas = items.reduce((n, it) => n + it.titulo.length + it.motivo.length + 1, 0);
    const boxH2 = 6 + introLines.length * 4 + 3 + itemsLineas * 4 + 4;

    y = ensureSpace(doc, y, boxH2 + 4);
    doc.setFillColor(AMBER_BG);
    doc.roundedRect(MARGIN, y, CONTENT_W, boxH2, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(AMBER);
    doc.text(introLines, MARGIN + 5, y + 6);
    let ny = y + 6 + introLines.length * 4 + 3;
    items.forEach((it) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(it.titulo, MARGIN + 5, ny);
      ny += it.titulo.length * 4;
      doc.setFont('helvetica', 'normal');
      doc.text(it.motivo, MARGIN + 5, ny);
      ny += it.motivo.length * 4 + 2;
    });
    y += boxH2 + 8;
  } else {
    y += 4;
  }

  // ---- Simulador de impacto financiero (proyección, no parte del score) --
  // Siempre con el perfil por defecto del sector — nunca con supuestos
  // editados en pantalla. Si aún no cargó, se omite la sección entera.
  if (simulacionFinanciera) {
    y = ensureSpace(doc, y, 26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(TEXT_PRIMARY);
    doc.text('Simulador de impacto financiero', MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(TEXT_TERTIARY);
    const simSubLines = doc.splitTextToSize(
      'Proyección orientativa del efecto de los riesgos regulatorios sobre los indicadores financieros del cliente, con el perfil financiero ' +
        'por defecto del sector, bajo tres escenarios de cumplimiento. No es una predicción ni parte del score.',
      CONTENT_W,
    );
    doc.text(simSubLines, MARGIN, y);
    y += simSubLines.length * 4 + 2;

    if (simulacionFinanciera.origen_parametros.perfil_base === 'placeholder') {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(TEXT_TERTIARY);
      doc.text('Perfil financiero basado en supuestos genéricos del sector, pendientes de validación.', MARGIN, y);
      y += 6;
    }

    // ---- Vista "Actual" (mezcla real del cliente, el ancla) ----------------
    const actual = simulacionFinanciera.actual;
    y = ensureSpace(doc, y, 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(TEXT_PRIMARY);
    doc.text('VISTA ACTUAL DEL CLIENTE', MARGIN, y);
    y += 6;
    // Deuda/EBITDA y cobertura pueden salir negativos cuando el EBITDA es
    // negativo (pérdida operativa real) — es información honesta, se muestra
    // en rojo como el resto de los negativos, nunca como "—". "—" es solo
    // para `null` (EBITDA exactamente 0).
    const statsActual: [string, string, boolean][] = [
      ['Deuda / EBITDA', formatVeces(actual.indicadores.deuda_ebitda), (actual.indicadores.deuda_ebitda ?? 0) < 0],
      ['Cobertura de intereses', formatVeces(actual.indicadores.cobertura_intereses), (actual.indicadores.cobertura_intereses ?? 0) < 0],
      ['Utilidad neta', formatPesos(actual.estado_resultados.utilidad_neta), actual.estado_resultados.utilidad_neta < 0],
    ];
    const statW = CONTENT_W / 3;
    statsActual.forEach(([label, valor, alerta], i) => {
      const sx = MARGIN + i * statW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(TEXT_TERTIARY);
      doc.text(label, sx, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(alerta ? RED_700 : TEXT_PRIMARY);
      doc.text(valor, sx, y + 5.5);
    });
    y += 14;

    // ---- Escenarios de referencia (comparación) -----------------------------
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(TEXT_PRIMARY);
    doc.text('ESCENARIOS DE REFERENCIA (COMPARACIÓN)', MARGIN, y);
    y += 5;

    const porVista = new Map(simulacionFinanciera.escenarios.map((e) => [e.vista, e]));
    const cumpleE = porVista.get('cumple');
    const parcialE = porVista.get('parcial');
    const incumpleE = porVista.get('incumple');
    const tresVistas = [cumpleE, parcialE, incumpleE];

    y = ensureSpace(doc, y, 40);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_RESERVE },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.4, textColor: TEXT_SECONDARY, lineColor: BORDER, lineWidth: 0.2 },
      headStyles: { fillColor: RED, textColor: '#ffffff', fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: CONTENT_W * 0.34, fontStyle: 'bold', textColor: TEXT_PRIMARY },
        1: { cellWidth: CONTENT_W * 0.22, halign: 'right' },
        2: { cellWidth: CONTENT_W * 0.22, halign: 'right' },
        3: { cellWidth: CONTENT_W * 0.22, halign: 'right' },
      },
      head: [['Indicador', 'Cumple', 'Parcial', 'Incumple']],
      body: [
        ['Deuda / EBITDA', ...tresVistas.map((v) => formatVeces(v?.indicadores.deuda_ebitda ?? null))],
        ['Cobertura de intereses', ...tresVistas.map((v) => formatVeces(v?.indicadores.cobertura_intereses ?? null))],
        ['Utilidad neta (MXN)', ...tresVistas.map((v) => (v ? formatPesos(v.estado_resultados.utilidad_neta) : '—'))],
        ['CAPEX de cumplimiento (MXN)', ...tresVistas.map((v) => (v ? formatPesos(v.capex_cumplimiento) : '—'))],
      ],
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index === 0) return;
        const v = tresVistas[data.column.index - 1];
        if (!v) return;
        // Deuda/EBITDA y cobertura negativos (EBITDA negativo) y utilidad
        // neta negativa se marcan en rojo — la única fila que no puede dar
        // negativa es CAPEX de cumplimiento (fila 3), así que no se toca.
        if (data.row.index === 0 && (v.indicadores.deuda_ebitda ?? 0) < 0) data.cell.styles.textColor = RED_700;
        if (data.row.index === 1 && (v.indicadores.cobertura_intereses ?? 0) < 0) data.cell.styles.textColor = RED_700;
        if (data.row.index === 2 && v.estado_resultados.utilidad_neta < 0) data.cell.styles.textColor = RED_700;
      },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y) + 8;

    // Helper: tabla comparativa Actual | Cumple | Parcial | Incumple.
    const nextY = () => ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7;
    const vistas4: (typeof actual | undefined)[] = [actual, cumpleE, parcialE, incumpleE];
    const tablaVistas = (
      titulo: string,
      filas: [string, (v: typeof actual) => string, ((v: typeof actual) => boolean)?][],
    ) => {
      y = ensureSpace(doc, y, 16 + filas.length * 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(TEXT_PRIMARY);
      doc.text(titulo.toUpperCase(), MARGIN, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_RESERVE },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, textColor: TEXT_SECONDARY, lineColor: BORDER, lineWidth: 0.2 },
        headStyles: { fillColor: RED, textColor: '#ffffff', fontStyle: 'bold', fontSize: 8.5 },
        columnStyles: {
          0: { cellWidth: CONTENT_W * 0.34, fontStyle: 'bold', textColor: TEXT_PRIMARY },
          1: { cellWidth: CONTENT_W * 0.165, halign: 'right' },
          2: { cellWidth: CONTENT_W * 0.165, halign: 'right' },
          3: { cellWidth: CONTENT_W * 0.165, halign: 'right' },
          4: { cellWidth: CONTENT_W * 0.165, halign: 'right' },
        },
        head: [['Concepto', 'Actual', 'Cumple', 'Parcial', 'Incumple']],
        body: filas.map(([label, fmt]) => [label, ...vistas4.map((v) => (v ? fmt(v) : '—'))]),
        didParseCell: (data) => {
          if (data.section !== 'body' || data.column.index === 0) return;
          const v = vistas4[data.column.index - 1];
          const alerta = filas[data.row.index]?.[2];
          if (v && alerta && alerta(v)) data.cell.styles.textColor = RED_700;
        },
      });
      y = nextY();
    };

    // ---- Ciclo de conversión de efectivo ----------------------------------
    tablaVistas('Ciclo de conversión de efectivo', [
      ['Ciclo de conversión (días)', (v) => `${v.indicadores.ciclo_conversion_efectivo}`, (v) => v.indicadores.ciclo_conversion_efectivo > actual.indicadores.ciclo_conversion_efectivo],
      ['Capital de trabajo neto', (v) => formatPesos(v.indicadores.capital_trabajo_neto)],
      ['Días de cobro', (v) => `${v.indicadores.dias_cobro}`],
      ['Días de inventario', (v) => `${v.indicadores.dias_inventario}`],
      ['Días de pago', (v) => `${v.indicadores.dias_pago}`],
      ['Cuentas por cobrar', (v) => formatPesos(v.indicadores.cuentas_por_cobrar)],
      ['Inventario', (v) => formatPesos(v.indicadores.inventario_valor)],
      ['Cuentas por pagar', (v) => formatPesos(v.indicadores.cuentas_por_pagar)],
    ]);

    // ---- Estados financieros --------------------------------------------
    tablaVistas('Estado de resultados', [
      ['Ingresos', (v) => formatPesos(v.estado_resultados.ingresos)],
      ['EBITDA', (v) => formatPesos(v.estado_resultados.ebitda), (v) => v.estado_resultados.ebitda < 0],
      ['(−) Depreciación', (v) => formatPesos(-v.estado_resultados.depreciacion)],
      ['(−) Multa', (v) => formatPesos(-v.estado_resultados.multa)],
      ['(−) Intereses', (v) => formatPesos(-v.estado_resultados.intereses)],
      ['Utilidad neta', (v) => formatPesos(v.estado_resultados.utilidad_neta), (v) => v.estado_resultados.utilidad_neta < 0],
    ]);
    tablaVistas('Balance general', [
      ['Activo fijo', (v) => formatPesos(v.balance.activo_fijo)],
      ['Circulante operativo', (v) => formatPesos(v.balance.otros_activos)],
      ['Caja', (v) => formatPesos(v.balance.caja), (v) => v.balance.caja < 0],
      ['Activo total', (v) => formatPesos(v.balance.activo_total)],
      ['Deuda financiera', (v) => formatPesos(v.balance.deuda)],
      ['Proveedores', (v) => formatPesos(v.balance.cuentas_por_pagar)],
      ['Capital', (v) => formatPesos(v.balance.capital)],
      ['Pasivo + Capital', (v) => formatPesos(v.balance.pasivo_capital_total)],
    ]);

    // ---- Costo del crédito ---------------------------------------------
    const spreadAct = simulacionFinanciera.spread.actual;
    y = ensureSpace(doc, y, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(TEXT_PRIMARY);
    doc.text('COSTO DEL CRÉDITO', MARGIN, y);
    y += 5;
    if (spreadAct.aplica && spreadAct.spread_pct != null && spreadAct.tasa_total_pct != null) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(TEXT_PRIMARY);
      doc.text(`TIIE + ${spreadAct.spread_pct.toFixed(2)}%  (= ${spreadAct.tasa_total_pct.toFixed(2)}%)`, MARGIN, y);
      y += 5;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(TEXT_SECONDARY);
    const spreadLineas = doc.splitTextToSize(spreadAct.nota, CONTENT_W) as string[];
    y = ensureSpace(doc, y, spreadLineas.length * 4 + 6);
    doc.text(spreadLineas, MARGIN, y);
    y += spreadLineas.length * 4 + 8;

    // ---- Decisión de crédito -----------------------------------------
    const plazoBase = simulacionFinanciera.perfil_usado.amortizacion_anios;
    const dict = dictamenBancabilidad(simulacionFinanciera.estructura_deuda.actual, plazoBase);
    y = ensureSpace(doc, y, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(TEXT_PRIMARY);
    doc.text('DECISIÓN DE CRÉDITO · BANCABILIDAD ACTUAL', MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(dict.verdicto === 'Bancable' ? GREEN : dict.verdicto === 'Bancable con reestructura' ? AMBER : RED_700);
    doc.text(`${dict.verdicto}:`, MARGIN, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(TEXT_SECONDARY);
    const dictLineas = doc.splitTextToSize(dict.razon, CONTENT_W) as string[];
    y = ensureSpace(doc, y, dictLineas.length * 4 + 6);
    doc.text(dictLineas, MARGIN, y);
    y += dictLineas.length * 4 + 8;
  }

  // ---- Detalle por norma (caja de cristal) -------------------------------
  y = ensureSpace(doc, y, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(TEXT_PRIMARY);
  doc.text('Detalle por norma', MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(TEXT_TERTIARY);
  doc.text('Cómo se construyó el puntaje, norma por norma, con su fuente. Filas resaltadas: estatus distinto de "cumple".', MARGIN, y);
  y += 5;

  // 'no_aplica' no debería aparecer: v_riesgo_norma la excluye del detalle.
  // Entradas solo por completitud del tipo.
  const rowFillFor: Record<Estatus, string | null> = {
    cumple: null,
    parcial: AMBER_BG,
    no_cumple: RED_100,
    desconocido: GRAY_BG,
    no_aplica: GRAY_BG,
  };
  const rowTextFor: Record<Estatus, string> = {
    cumple: TEXT_PRIMARY,
    parcial: AMBER,
    no_cumple: RED_700,
    desconocido: TEXT_TERTIARY,
    no_aplica: TEXT_TERTIARY,
  };

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_RESERVE },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, valign: 'top', textColor: TEXT_SECONDARY, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: RED, textColor: '#ffffff', fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 44 },
      1: { cellWidth: 24 },
      2: { cellWidth: 20 },
      3: { cellWidth: 22 },
      4: { cellWidth: 24 },
      5: { cellWidth: CONTENT_W - (44 + 24 + 20 + 22 + 24) },
    },
    head: [['Norma', 'Categoría', 'Estatus', 'Aporte crédito', 'Aporte reputación', 'Fuente']],
    body: resultado.detalle.map((fila) => {
      const multa = multaTexto(fila);
      const nombreNorma = multa ? `${fila.norma_titulo}\n${fila.norma_clave} — ${multa}` : `${fila.norma_titulo}\n${fila.norma_clave}`;
      return [
        nombreNorma,
        CATEGORIA_LABEL[fila.categoria],
        ESTATUS_LABEL[fila.estatus],
        `+${fila.riesgo_credito.toFixed(2)}`,
        `+${fila.riesgo_reputacion.toFixed(2)}`,
        fila.fuente,
      ];
    }),
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const fila = resultado.detalle[data.row.index];
      if (!fila) return;
      const fill = rowFillFor[fila.estatus];
      if (fill) data.cell.styles.fillColor = fill;
      if (data.column.index === 2) {
        data.cell.styles.textColor = rowTextFor[fila.estatus];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ---- Pie de página (nota metodológica + numeración) --------------------
  const totalPaginas = doc.getNumberOfPages();
  const nota =
    'Score ordinal de riesgo regulatorio; la banda es el indicador de decisión. La exposición financiera es una estimación orientativa, no una predicción.';
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(TEXT_TERTIARY);
    doc.text(nota, MARGIN, PAGE_H - 8, { maxWidth: CONTENT_W - 26 });
    if (totalPaginas > 1) {
      doc.text(`Página ${p} de ${totalPaginas}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
    }
  }

  const fechaArchivo = new Date().toISOString().slice(0, 10);
  doc.save(`Informe_Riesgo_ESG_${sanitizeFilename(cliente.nombre)}_${fechaArchivo}.pdf`);
}
