import PDFDocument from 'pdfkit';
import {
  bandLabelFromScore,
  formatDate,
  formatDocument,
  gradeFromScore,
  RISK_LEVEL_LABEL,
  riskColor,
  riskFromScore,
  SCORE_BANDS,
  SCORE_MAX,
  type RatingFactor,
} from '@rating-pro/shared';

export interface ReportData {
  brandName: string;
  orderCode: string;
  score: number;
  summary: string | null;
  factors: RatingFactor[];
  validUntil: Date;
  issuedAt: Date;
  issuedByName: string;
  client: {
    name: string;
    document: string;
    personType: 'pf' | 'pj';
    city: string | null;
    state: string | null;
  };
  resellerName: string;
}

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const PAGE_MARGIN = 48;

/** Gera o laudo em PDF e devolve o buffer pronto para upload. */
export async function buildReportPdf(data: ReportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    info: {
      Title: `Laudo de Rating ${data.orderCode}`,
      Author: data.brandName,
      Subject: `Rating de crédito — ${data.client.name}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - PAGE_MARGIN * 2;
  const grade = gradeFromScore(data.score);
  const risk = riskFromScore(data.score);
  const accent = riskColor(risk);

  drawHeader(doc, data, pageWidth);
  drawClientBox(doc, data, pageWidth);
  drawScoreBlock(doc, data, pageWidth, grade, risk, accent);
  drawScale(doc, data.score, pageWidth);
  drawFactors(doc, data.factors, pageWidth);
  drawSummary(doc, data, pageWidth);
  drawFooter(doc, data, pageWidth);

  doc.end();
  return finished;
}

function drawHeader(doc: PDFKit.PDFDocument, data: ReportData, width: number): void {
  doc.rect(0, 0, doc.page.width, 96).fill(INK);

  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(data.brandName, PAGE_MARGIN, 30);

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#cbd5e1')
    .text('Laudo de Rating de Crédito', PAGE_MARGIN, 56);

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#ffffff')
    .text(data.orderCode, PAGE_MARGIN, 30, { width, align: 'right' });

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#cbd5e1')
    .text(`Emitido em ${formatDate(data.issuedAt)}`, PAGE_MARGIN, 47, { width, align: 'right' })
    .text(`Válido até ${formatDate(data.validUntil)}`, PAGE_MARGIN, 60, { width, align: 'right' });

  doc.y = 128;
}

function drawClientBox(doc: PDFKit.PDFDocument, data: ReportData, width: number): void {
  const top = doc.y;
  const height = 76;

  doc.roundedRect(PAGE_MARGIN, top, width, height, 6).lineWidth(1).stroke(LINE);

  const label = (text: string, x: number, y: number) =>
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(text.toUpperCase(), x, y);
  const value = (text: string, x: number, y: number, w: number) =>
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(text, x, y, { width: w });

  const colWidth = (width - 48) / 2;
  const leftX = PAGE_MARGIN + 16;
  const rightX = PAGE_MARGIN + 16 + colWidth + 16;

  label('Avaliado', leftX, top + 14);
  value(data.client.name, leftX, top + 26, colWidth);

  label(data.client.personType === 'pf' ? 'CPF' : 'CNPJ', leftX, top + 48);
  value(formatDocument(data.client.document), leftX, top + 58, colWidth);

  const location = [data.client.city, data.client.state].filter(Boolean).join(' / ') || '—';
  label('Localidade', rightX, top + 14);
  value(location, rightX, top + 26, colWidth);

  label('Solicitante', rightX, top + 48);
  value(data.resellerName, rightX, top + 58, colWidth);

  doc.y = top + height + 24;
}

function drawScoreBlock(
  doc: PDFKit.PDFDocument,
  data: ReportData,
  width: number,
  grade: string,
  risk: ReturnType<typeof riskFromScore>,
  accent: string,
): void {
  const top = doc.y;
  const height = 110;
  const scoreBoxWidth = 168;

  doc.roundedRect(PAGE_MARGIN, top, scoreBoxWidth, height, 6).fill(accent);

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#ffffff')
    .text('SCORE', PAGE_MARGIN, top + 16, { width: scoreBoxWidth, align: 'center' });

  doc
    .font('Helvetica-Bold')
    .fontSize(48)
    .fillColor('#ffffff')
    .text(String(data.score), PAGE_MARGIN, top + 30, { width: scoreBoxWidth, align: 'center' });

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#ffffff')
    .text(`de ${SCORE_MAX} pontos`, PAGE_MARGIN, top + 84, {
      width: scoreBoxWidth,
      align: 'center',
    });

  const infoX = PAGE_MARGIN + scoreBoxWidth + 20;
  const infoWidth = width - scoreBoxWidth - 20;

  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('CLASSIFICAÇÃO', infoX, top + 14);
  doc.font('Helvetica-Bold').fontSize(30).fillColor(INK).text(grade, infoX, top + 26);

  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('FAIXA DE RISCO', infoX + 110, top + 14);
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(accent)
    .text(RISK_LEVEL_LABEL[risk], infoX + 110, top + 30, { width: infoWidth - 110 });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(MUTED)
    .text(`Perfil: ${bandLabelFromScore(data.score)}`, infoX + 110, top + 52, {
      width: infoWidth - 110,
    });

  doc.y = top + height + 28;
}

/** Régua 0-1000 colorida por faixa, com um marcador na posição do score. */
function drawScale(doc: PDFKit.PDFDocument, score: number, width: number): void {
  const top = doc.y;
  const barHeight = 14;

  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Posição na escala', PAGE_MARGIN, top);

  const barY = top + 20;
  // SCORE_BANDS vem do melhor para o pior; invertemos para desenhar 0 -> 1000.
  const ascending = [...SCORE_BANDS].reverse();

  ascending.forEach((band, index) => {
    const next = ascending[index + 1];
    const start = band.min;
    const end = next ? next.min : SCORE_MAX;
    const x = PAGE_MARGIN + (start / SCORE_MAX) * width;
    const segmentWidth = ((end - start) / SCORE_MAX) * width;

    doc.rect(x, barY, segmentWidth, barHeight).fill(riskColor(band.risk));
  });

  const markerX = PAGE_MARGIN + (Math.min(score, SCORE_MAX) / SCORE_MAX) * width;

  doc
    .moveTo(markerX, barY - 6)
    .lineTo(markerX + 5, barY - 14)
    .lineTo(markerX - 5, barY - 14)
    .closePath()
    .fill(INK);

  doc.rect(markerX - 1, barY - 4, 2, barHeight + 8).fill(INK);

  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text('0', PAGE_MARGIN, barY + barHeight + 6);
  doc.text('500', PAGE_MARGIN + width / 2 - 10, barY + barHeight + 6);
  doc.text(String(SCORE_MAX), PAGE_MARGIN + width - 24, barY + barHeight + 6);

  doc.y = barY + barHeight + 30;
}

function drawFactors(doc: PDFKit.PDFDocument, factors: RatingFactor[], width: number): void {
  if (factors.length === 0) return;

  const top = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Fatores avaliados', PAGE_MARGIN, top);

  let y = top + 20;
  const colWeight = PAGE_MARGIN + width - 150;
  const colScore = PAGE_MARGIN + width - 60;

  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text('FATOR', PAGE_MARGIN, y);
  doc.text('PESO', colWeight, y, { width: 50, align: 'right' });
  doc.text('NOTA', colScore, y, { width: 60, align: 'right' });

  y += 14;
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + width, y).lineWidth(1).stroke(LINE);
  y += 8;

  for (const factor of factors) {
    doc.font('Helvetica').fontSize(10).fillColor(INK);
    doc.text(factor.label, PAGE_MARGIN, y, { width: colWeight - PAGE_MARGIN - 10 });
    doc.text(`${Math.round(factor.weight * 100)}%`, colWeight, y, { width: 50, align: 'right' });

    doc
      .font('Helvetica-Bold')
      .fillColor(riskColor(riskFromScore(factor.score)))
      .text(String(factor.score), colScore, y, { width: 60, align: 'right' });

    y += 20;
  }

  doc.y = y + 10;
}

function drawSummary(doc: PDFKit.PDFDocument, data: ReportData, width: number): void {
  if (!data.summary) return;

  const top = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Parecer', PAGE_MARGIN, top);

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#334155')
    .text(data.summary, PAGE_MARGIN, top + 18, { width, align: 'justify', lineGap: 2 });

  doc.y += 16;
}

function drawFooter(doc: PDFKit.PDFDocument, data: ReportData, width: number): void {
  const footerY = doc.page.height - PAGE_MARGIN - 58;

  doc.moveTo(PAGE_MARGIN, footerY).lineTo(PAGE_MARGIN + width, footerY).lineWidth(1).stroke(LINE);

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      `Documento informativo emitido por ${data.brandName} em ${formatDate(data.issuedAt)}, ` +
        `sob responsabilidade de ${data.issuedByName}. A classificação reflete os dados ` +
        'disponíveis na data de emissão e não constitui garantia de crédito nem recomendação ' +
        'de investimento. Válido até ' +
        `${formatDate(data.validUntil)}.`,
      PAGE_MARGIN,
      footerY + 10,
      { width, align: 'justify' },
    );

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(MUTED)
    .text(data.orderCode, PAGE_MARGIN, footerY + 44, { width, align: 'right' });
}
