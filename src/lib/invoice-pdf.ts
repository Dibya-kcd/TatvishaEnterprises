import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate, fmtINR, formatPackLabel } from "./format";
import { Database } from "@/integrations/supabase/types";
import { COMPANY_NAME, COMPANY_TAGLINE } from "@/lib/config";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Shop = Database["public"]["Tables"]["shops"]["Row"];

interface InvoiceItem {
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  line_total: number;
}

interface InvoiceData {
  invoice: Invoice; 
  order: { order_number: string };
  shop: Shop;
  items: InvoiceItem[];
  format?: 'A4' | '80mm';
}

export async function generateInvoicePDF({ invoice, order, shop, items, format = 'A4' }: InvoiceData): Promise<jsPDF> {
  const isThermal = format === '80mm';
  
  // 80mm = ~226 pts (72 dpi) or ~3.15 inches
  // We'll use a dynamic height or a large enough default
  const doc = isThermal 
    ? new jsPDF({ unit: 'mm', format: [80, 250] }) // 80mm wide, 250mm tall (standard receipt length)
    : new jsPDF();

  const title = invoice.type === "gst" ? "TAX INVOICE" : "CASH MEMO";
  const margin = isThermal ? 5 : 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  if (isThermal) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(COMPANY_NAME, pageWidth / 2, 12, { align: "center" });
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(COMPANY_TAGLINE, pageWidth / 2, 17, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title, pageWidth / 2, 24, { align: "center" });
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`Memo: ${invoice.invoice_number}`, margin, 31);
    doc.text(`Date: ${fmtDate(invoice.created_at)}`, margin, 35);
    doc.text(`Order: ${order.order_number}`, margin, 39);
  } else {
    doc.setFontSize(20);
    doc.setTextColor(44, 62, 80);
    doc.setFont("helvetica", "bold");
    doc.text(COMPANY_NAME, 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(127, 140, 141);
    doc.setFont("helvetica", "normal");
    doc.text(COMPANY_TAGLINE, 14, 28);
    
    doc.setFontSize(14);
    doc.setTextColor(44, 62, 80);
    doc.setFont("helvetica", "bold");
    doc.text(title, 140, 22);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Number: ${invoice.invoice_number}`, 140, 28);
    doc.text(`Date: ${fmtDate(invoice.created_at)}`, 140, 33);
    doc.text(`Order: ${order.order_number}`, 140, 38);
  }

  // Divider
  doc.setDrawColor(200, 200, 200);
  const startY = isThermal ? 42 : 45;
  doc.line(margin, startY, pageWidth - margin, startY);

  // Shop Details
  const currentY = startY + (isThermal ? 6 : 10);
  doc.setFontSize(isThermal ? 8 : 10);
  doc.setTextColor(52, 73, 94);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO:", margin, currentY);
  
  doc.setFont("helvetica", "normal");
  doc.setTextColor(44, 62, 80);
  doc.text(shop.name, margin, currentY + (isThermal ? 4 : 6));
  
  let shopY = currentY + (isThermal ? 4 : 6);
  doc.setFontSize(isThermal ? 7 : 9);
  doc.setTextColor(127, 140, 141);
  
  if (shop.address) {
    shopY += (isThermal ? 4 : 5);
    const splitAddress = doc.splitTextToSize(shop.address, isThermal ? 70 : 80);
    doc.text(splitAddress, margin, shopY);
    shopY += (splitAddress.length * (isThermal ? 3 : 4));
  }
  
  if (shop.phone) {
    shopY += (isThermal ? 3 : 4);
    doc.text(`Phone: ${shop.phone}`, margin, shopY);
  }
  
  if (shop.gstin) {
    shopY += (isThermal ? 4 : 5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text(`GSTIN: ${shop.gstin}`, margin, shopY);
  }

  // Items Table
  const tableData = items.map((item, idx) => {
    if (isThermal) {
      // For thermal, combine Qty and Unit to save space and align better
      const unit = (item.unit || "Unit").toLowerCase();
      let unitShort = "U";
      if (unit.includes("piece") || unit.includes("pcs") || unit.includes("pc")) unitShort = "Pc";
      else if (unit.includes("packet") || unit.includes("pkt") || unit.includes("pag")) unitShort = "Pk";
      else if (unit.includes("case") || unit.includes("box") || unit.includes("ocs") || unit.includes("ctn")) unitShort = "Cs";
      else if (unit.includes("kg")) unitShort = "Kg";
      else if (unit.includes("bag")) unitShort = "Bg";
      else if (unit.length > 2) unitShort = unit.substring(0, 2).charAt(0).toUpperCase() + unit.substring(1, 2);
      
      const qtyStr = `${item.quantity}${unitShort}`;
      return [
        item.name,
        qtyStr,
        fmtINR(item.unit_price).replace("Rs. ", ""),
        fmtINR(item.line_total * (1 + item.gst_rate / 100)).replace("Rs. ", "")
      ];
    }
    return [
      idx + 1,
      item.name,
      item.quantity,
      formatPackLabel(item.unit),
      fmtINR(item.unit_price).replace("Rs. ", ""),
      `${item.gst_rate}%`,
      fmtINR(item.line_total * (1 + item.gst_rate / 100)).replace("Rs. ", "")
    ];
  });

  const tableHeader = isThermal 
    ? ["Item", "Qty", "Rate", "Total"]
    : ["#", "Product", "Qty", "Unit", "Rate", "GST", "Amount"];

  autoTable(doc, {
    startY: shopY + 6,
    margin: { left: margin, right: margin },
    head: [tableHeader],
    body: tableData,
    headStyles: { 
      fillColor: isThermal ? [255, 255, 255] : [44, 62, 80], 
      textColor: isThermal ? [0, 0, 0] : [255, 255, 255],
      fontSize: isThermal ? 8 : 9,
      fontStyle: 'bold'
    },
    bodyStyles: { 
      fontSize: isThermal ? 7 : 8,
      textColor: [44, 62, 80]
    },
    columnStyles: isThermal ? {
      0: { cellWidth: "auto" },
      1: { halign: "center", cellWidth: 15 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 18 },
    } : {
      0: { cellWidth: 10 },
      1: { cellWidth: "auto" },
      2: { halign: "center", cellWidth: 15 },
      3: { halign: "center", cellWidth: 20 },
      4: { halign: "right", cellWidth: 25 },
      5: { halign: "center", cellWidth: 15 },
      6: { halign: "right", cellWidth: 30 },
    },
    theme: isThermal ? "plain" : "striped"
  });

  // Totals
  let finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + (isThermal ? 6 : 10);
  const totalLabelX = pageWidth - (isThermal ? 45 : 70);
  const totalValueX = pageWidth - margin;

  doc.setFontSize(isThermal ? 8 : 10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(44, 62, 80);
  
  doc.text("Subtotal:", totalLabelX, finalY);
  doc.text(fmtINR(Number(invoice.subtotal)).replace("Rs. ", "").trim(), totalValueX, finalY, { align: "right" });
  
  finalY += (isThermal ? 4 : 6);
  doc.text("GST:", totalLabelX, finalY);
  doc.text(fmtINR(Number(invoice.gst_total)).replace("Rs. ", "").trim(), totalValueX, finalY, { align: "right" });
  
  if (Number(invoice.discount_amount || 0) > 0) {
    finalY += (isThermal ? 4 : 6);
    doc.text("Discount:", totalLabelX, finalY);
    doc.text("-" + fmtINR(Number(invoice.discount_amount)).replace("Rs. ", "").trim(), totalValueX, finalY, { align: "right" });
  }

  finalY += (isThermal ? 6 : 8);
  doc.setFontSize(isThermal ? 10 : 12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", totalLabelX, finalY);
  // Important: Use fmtINR which now includes "Rs. " prefix
  doc.text(fmtINR(Number(invoice.total)).trim(), totalValueX, finalY, { align: "right" });

  // Footer
  finalY += (isThermal ? 10 : 20);
  doc.setFontSize(isThermal ? 7 : 8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150, 150, 150);
  doc.text("This is a computer generated invoice.", pageWidth / 2, isThermal ? finalY : 285, { align: "center" });

  if (isThermal) {
    finalY += 4;
    doc.text("Thank you for your business!", pageWidth / 2, finalY, { align: "center" });
  }

  return doc;
}

export async function shareOrDownloadInvoice(data: InvoiceData) {
  const doc = await generateInvoicePDF(data);
  const { invoice, shop } = data;
  
  // Share or Download
  const pdfOutput = doc.output("blob");
  const url = URL.createObjectURL(pdfOutput);
  
  if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    try {
      const file = new File([pdfOutput], `Invoice_${invoice.invoice_number}.pdf`, { type: "application/pdf" });
      await navigator.share({
        files: [file],
        title: `Invoice ${invoice.invoice_number}`,
        text: `Invoice for ${shop.name}`
      });
    } catch (err) {
      window.open(url, "_blank");
    }
  } else {
    window.open(url, "_blank");
  }
}
