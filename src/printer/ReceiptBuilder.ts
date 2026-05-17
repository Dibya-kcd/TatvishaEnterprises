export class ReceiptBuilder {
  protected lines: Record<string, unknown>[] = [];

  getPreview() {
    return this.lines;
  }

  build(data: Record<string, unknown>): Uint8Array {
    this.lines = [{ type: 'text', value: 'Generic Receipt' }];
    return new Uint8Array();
  }
}
