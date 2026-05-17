import { ReceiptBuilder } from "./ReceiptBuilder";
import { InvoiceData } from "./InvoiceData.types";

export class ThermalReceiptBuilder extends ReceiptBuilder {
  buildInvoice(data: InvoiceData): Uint8Array {
    this.lines = [
      { type: 'header', value: data.businessName },
      { type: 'text', value: data.businessTagline },
      { type: 'divider' },
      { type: 'text', value: `Memo: ${data.memoNumber}` },
      { type: 'text', value: `Date: ${data.date}` },
      { type: 'text', value: `Order: ${data.orderNumber}` },
      { type: 'divider' },
      { type: 'text', value: `Bill To: ${data.billTo}` },
      { type: 'divider' },
      ...data.items.map(item => ({
        type: 'item',
        name: item.product,
        qty: item.qty,
        amount: item.amount
      })),
      { type: 'divider' },
      { type: 'row', label: 'Subtotal', value: data.subtotal },
      { type: 'row', label: 'GST', value: data.gst },
      ...(data.discount ? [{ type: 'row', label: 'Discount', value: -data.discount }] : []),
      { type: 'total', label: 'TOTAL', value: data.total },
      { type: 'footer', value: data.footerNote }
    ];
    
    // In a real app, this would generate ESC/POS bytes
    return new Uint8Array([0x1B, 0x40]); // ESC @ (Initialize printer)
  }
}
