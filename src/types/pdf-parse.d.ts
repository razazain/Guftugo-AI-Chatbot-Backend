declare module 'pdf-parse' {
  interface PdfParseOptions {
    /** Maximum number of pages to extract. A value <= 0 parses all pages. */
    max?: number;
    version?: string;
  }
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info?: Record<string, unknown> | null;
    metadata?: unknown;
    text: string;
    version?: string;
  }
  function pdfParse(dataBuffer: Buffer, options?: PdfParseOptions): Promise<PdfParseResult>;
  export default pdfParse;
}
