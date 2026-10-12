import { describe, expect, it } from 'vitest';
import { extractPdfText, MAX_PDF_PAGES } from '../src/services/documentService';

function makeOnePagePdf(message: string): Buffer {
  const stream = `BT /F1 12 Tf 72 100 Td (${message}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

describe('PDF document text extraction', () => {
  it('extracts selectable text from a valid PDF', async () => {
    const text = await extractPdfText(makeOnePagePdf('Guftugo PDF extraction works'));
    expect(text).toContain('Guftugo PDF extraction works');
  });

  it('rejects files that do not contain a PDF signature', async () => {
    await expect(extractPdfText(Buffer.from('not a PDF'))).rejects.toMatchObject({
      code: 'INVALID_PDF_FILE',
      statusCode: 400,
    });
  });

  it('documents an extraction page limit', () => {
    expect(MAX_PDF_PAGES).toBe(100);
  });
});
