import { ReceiptBuilder } from "./ReceiptBuilder";
import { InvoiceData } from "./InvoiceData.types";
import { fmtINR } from "../lib/format";

export class ThermalReceiptBuilder extends ReceiptBuilder {
  buildInvoice(data: InvoiceData): Uint8Array {
    let bytes: number[] = [
      ...this.initialize(),
      ...this.setAlignment('center'),
      ...this.setBold(true),
      ...this.setSize(2, 2),
      ...this.text(data.businessName),
      ...this.setSize(1, 1),
      ...this.setBold(false),
      ...this.text(data.businessTagline || ""),
      ...this.divider(),
    ];

    bytes = bytes.concat([
      ...this.setAlignment('left'),
      ...this.text(`Memo: ${data.memoNumber}`),
      ...this.text(`Date: ${data.date}`),
      ...this.text(`Order: ${data.orderNumber}`),
      ...this.divider(),
      ...this.text(`Bill To: ${data.billTo}`),
      ...this.divider(),
    ]);

    // Items
    data.items.forEach(item => {
      const rate = item.qty > 0 ? (item.amount / item.qty).toFixed(2) : "0.00";
      bytes = bytes.concat([
        ...this.setBold(true),
        ...this.text(item.product),
        ...this.setBold(false),
        ...this.text(`  ${item.qty} ${item.unit} x ${rate} = ${fmtINR(item.amount)}`),
      ]);
    });

    bytes = bytes.concat([
      ...this.divider(),
      ...this.setAlignment('right'),
      ...this.text(`Subtotal: ${fmtINR(data.subtotal)}`),
      ...this.text(`GST Total: ${fmtINR(data.gst)}`),
    ]);

    if (data.discount) {
      bytes = bytes.concat(this.text(`Discount: -${fmtINR(data.discount)}`));
    }

    bytes = bytes.concat([
      ...this.setBold(true),
      ...this.setSize(1, 2),
      ...this.text(`TOTAL: ${fmtINR(data.total)}`),
      ...this.setSize(1, 1),
      ...this.setBold(false),
      ...this.divider(),
      ...this.setAlignment('center'),
      ...this.text(data.footerNote || ""),
      ...this.feed(4),
      ...this.cut()
    ]);

    return new Uint8Array(bytes);
  }
}
