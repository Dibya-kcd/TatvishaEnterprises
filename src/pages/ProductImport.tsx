import * as React from "react";
import { useAuth } from "@/context/AuthContextCore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Upload, ChevronLeft, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Info, Download, X, AlertTriangle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { supabase } from "@/integrations/supabase/client";
import { productImportService } from "@/services/productImportService";
import type { ImportSummary } from "@/services/productImportService";

const TEMPLATE_HEADERS = [
  "name", "mrp", "units_per_packet", "packets_per_case", "pack_size_value", "pack_size_unit", "item_pack_type", "category"
];

const EXAMPLE_ROW = [
  "B.M Chilli Packet 100g", 45.00, 10, 20, 100, "g", "packet", "Spices"
];

type ImportStep = "UPLOAD" | "MAPPING" | "PREVIEW" | "CONFIRM" | "RESULT";

const MANDATORY_COLUMNS = ["Product Name", "SKU"];

export default function ProductImport() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const [step, setStep] = React.useState<ImportStep>("UPLOAD");
  const [file, setFile] = React.useState<File | null>(null);
  
  // Validation State
  const [validationResult, setValidationResult] = React.useState<ImportSummary | null>(null);
  const [mappings, setMappings] = React.useState<Record<string, string>>({});
  const [skipErrors, setSkipErrors] = React.useState(true);
  
  // Confirmation State
  const [importResult, setImportResult] = React.useState<{
    imported_count: number;
    updated_count: number;
    skipped_count: number;
    failed_rows: Record<string, unknown>[];
  } | null>(null);

  const readyToImportCount = React.useMemo(() => {
    if (!validationResult) return 0;
    return validationResult.rows.filter(r => r.status !== 'error' || !skipErrors).length;
  }, [validationResult, skipErrors]);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive opacity-50" />
        <h2 className="mt-4 text-xl font-bold">Unauthorized</h2>
        <p className="text-muted-foreground">Only admins can import products.</p>
      </div>
    );
  }

  const downloadTemplate = () => {
    const headers = [
      "Product Name", "SKU", "MRP", "GST Rate (%)", "Category", "Sub Category", "Item Pack Type", 
      "Units per Packet", "Packs per Case", "QTY Case/Carton", "Pack Size", "Preferred Sell Unit", 
      "Chain Pack?", "Chain MRP Label", "Opening Stock"
    ];
    
    // Examples based on user provided data and categories
    const examples = [
      // EXAMPLE - DO NOT REMOVE
      ["EXAMPLE - DO NOT REMOVE", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      
      // Blended Spices (Packet/PCS)
      ["Chilli Powder 100g Packet", "BS-CP-100G", "45", "5", "Spices", "Blended", "packet", "10", "25", "25kg", "100g", "packet", "No", "", "500"],
      ["Turmeric 200g Packet", "BS-TM-200G", "85", "5", "Spices", "Blended", "packet", "1", "50", "10kg", "200g", "packet", "No", "", "300"],
      
      // Processing Spices (Bulk/KG) - Multiplier logic will use 16kg/0.5kg = 32 units
      ["Panch Phutan 500g (16kg Case)", "WS-PP-16KG", "1200", "5", "Spices", "Processing", "packet", "1", "32", "16kg", "500g", "packet", "No", "", "320"],
      ["Cumin Seed 10kg Bag", "WS-CS-10KG", "4500", "5", "Spices", "Processing", "bag", "1", "2", "20kg", "10kg", "kg", "No", "", "30"],
      
      // CHAIN ITEM Rs.1/- (100pc)
      ["Turmeric Rs.1/- (100pc)", "CH-TM-R1", "1", "5", "Chain Items", "Rs.1/-", "packet", "100", "20", "2000", "Rs.1/-(100pc)", "packet", "Yes", "Rs.1/-(100pc)", "2000"],
      
      // CARD BOARD ITEM (ACB)
      ["Chicken Masala Rs.5/- (ACB)", "ACB-CH-R5", "5", "5", "Cardboard Items", "ACB", "pcs", "20", "21", "420", "Rs.5/-(20pc)", "pcs", "No", "", "420"]
    ];

    const csvContent = [
      headers.join(','),
      ...examples.map(ex => ex.map(val => `"${val}"`).join(',')) // Use quotes for safety
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ProductImport_Template_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    validateFile(selectedFile);
  };

  const validateFile = async (fileToValidate: File, customMappings?: Record<string, string>) => {
    setLoading(true);
    try {
      const buffer = await fileToValidate.arrayBuffer();
      const result = await productImportService.parseFile(buffer, fileToValidate.name, customMappings);
      setValidationResult(result);
      
      // Check if any mandatory columns are unmapped
      const hasUnmappedMandatory = MANDATORY_COLUMNS.some(col => !result.mappings[col]);
      
      if (hasUnmappedMandatory && step !== "MAPPING") {
        setStep("MAPPING");
        toast.warning("Some mandatory columns could not be auto-detected.");
      } else if (step === "MAPPING") {
        setStep("PREVIEW");
        toast.success("Mapping confirmed");
      } else {
        setStep("PREVIEW");
        toast.success("File validated successfully");
      }
    } catch (error) {
      console.error('[Context]', error);
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!validationResult) return;
    
    setLoading(true);
    const rowsToImport = validationResult.rows
      .filter(r => r.status !== 'error' || !skipErrors)
      .map(r => r.mapped_data);

    try {
      const { data, error } = await supabase.rpc('confirm_product_import', {
        p_rows: rowsToImport,
        p_skip_errors: skipErrors,
        p_user_id: user?.id
      });

      if (error) throw error;

      const result = data as {
        imported_count: number;
        updated_count: number;
        skipped_count: number;
        failed_rows: Record<string, unknown>[];
      };

      setImportResult(result);
      setStep("RESULT");
      toast.success("Import processed successfully");
    } catch (error) {
      console.error('[Context]', error);
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const resetImport = () => {
    setStep("UPLOAD");
    setValidationResult(null);
    setImportResult(null);
    setFile(null);
  };

  const renderStep = () => {
    switch (step) {
      case "UPLOAD":
        return (
          <div className="space-y-6">
            <Card className="border-dashed border-2 bg-muted/5 group hover:border-brand-primary/50 transition-colors cursor-pointer relative">
              <input 
                type="file" 
                className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
              />
              <CardContent className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="h-20 w-20 rounded-full bg-brand-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload className="h-10 w-10 text-brand-primary" />
                </div>
                <div className="text-center">
                  <h3 className="font-bold text-xl">Upload Product List</h3>
                  <p className="text-sm text-muted-foreground">Click to browse your computer (.xlsx, .csv)</p>
                </div>
                {loading && (
                  <div className="flex items-center gap-2 text-brand-primary font-bold animate-pulse">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating file...
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col md:flex-row items-stretch gap-4 p-6 bg-brand-accent/30 rounded-2xl border border-brand-primary/10">
              <div className="flex-1 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="font-bold">Unit Logic Guide</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <span className="font-bold text-emerald-700">Packet:</span> Case contains Packets, Packets contain Base Units (e.g. 10 pcs per packet).<br/>
                    <span className="font-bold text-emerald-700">Weight:</span> For 5Kg bags, use <code className="bg-white px-1">pack_size_value: 5, pack_size_unit: kg</code>.
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={downloadTemplate} className="rounded-xl border-emerald-600/20 hover:bg-emerald-50 text-emerald-700 font-bold whitespace-nowrap">
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
            </div>
          </div>
        );

      case "MAPPING":
        return (
          <div className="space-y-6">
            <Card className="border-brand-primary/20 shadow-xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-brand-primary text-white p-8">
                <CardTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
                  <FileSpreadsheet className="h-6 w-6" />
                  Column Mapping
                </CardTitle>
                <CardDescription className="text-white/70 italic">Some columns couldn't be auto-detected. Please map them manually.</CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <div className="max-h-[400px] overflow-auto border border-border/50 rounded-2xl">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0">
                      <TableRow>
                        <TableHead>System Column</TableHead>
                        <TableHead>Detected File Column</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.keys(validationResult?.mappings || {}).map((sysCol) => {
                        const isMandatory = MANDATORY_COLUMNS.includes(sysCol);
                        const currentMapping = mappings[sysCol] || validationResult?.mappings[sysCol] || "";
                        
                        return (
                          <TableRow key={sysCol}>
                            <TableCell className="font-bold py-4">
                              {sysCol} {isMandatory && <span className="text-red-500">*</span>}
                            </TableCell>
                            <TableCell>
                              <select 
                                className={cn(
                                  "w-full h-10 px-3 rounded-xl border border-border bg-white text-sm font-medium focus:ring-2 focus:ring-brand-primary outline-none",
                                  isMandatory && !currentMapping ? "border-red-500 bg-red-50/50" : ""
                                )}
                                value={currentMapping}
                                onChange={(e) => setMappings(prev => ({ ...prev, [sysCol]: e.target.value }))}
                              >
                                <option value="">-- Skip Column --</option>
                                {validationResult?.available_headers.map(h => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/20 p-8 flex justify-between border-t border-border/40">
                <Button variant="ghost" onClick={() => setStep("UPLOAD")} className="font-bold">
                  <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
                <Button 
                  onClick={() => {
                    const finalMappings = { ...validationResult?.mappings, ...mappings };
                    const cleanMappings: Record<string, string> = {};
                    Object.entries(finalMappings).forEach(([k, v]) => { if (v) cleanMappings[k] = v; });
                    if (file) validateFile(file, cleanMappings);
                  }} 
                  disabled={loading || MANDATORY_COLUMNS.some(col => !mappings[col] && !validationResult?.mappings[col])}
                  className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl px-12 shadow-brand font-black uppercase tracking-widest text-xs h-14"
                >
                  {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                  Confirm Mapping
                </Button>
              </CardFooter>
            </Card>
          </div>
        );

      case "PREVIEW":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-emerald-50/50 border-emerald-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-emerald-700 leading-none">{validationResult?.valid_count}</p>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Ready</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-amber-50/50 border-amber-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-amber-700 leading-none">{validationResult?.warning_count}</p>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Warnings</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-red-50/50 border-red-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <X className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-red-700 leading-none">{validationResult?.error_count}</p>
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Errors</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="overflow-hidden border-border/50">
              <div className="max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResult?.rows.map((row) => (
                      <TableRow key={row.row_index} className={cn(
                        row.status === 'error' ? "bg-red-50/30" : row.status === 'warning' ? "bg-amber-50/30" : ""
                      )}>
                        <TableCell className="text-xs font-mono text-muted-foreground">{row.row_index}</TableCell>
                        <TableCell className="font-medium">{row.mapped_data.name || "N/A"}</TableCell>
                        <TableCell className="font-mono text-xs">{row.mapped_data.sku || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant={
                            row.status === 'valid' ? "default" : 
                            row.status === 'warning' ? "secondary" : "destructive"
                          } className="rounded-full px-2 py-0.5 text-[9px] uppercase font-black">
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.errors.concat(row.warnings).map((msg, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <span className={row.errors.includes(msg) ? "text-red-600" : "text-amber-600"}>•</span>
                              {msg}
                            </div>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <CardFooter className="px-0 py-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 self-start bg-muted/50 p-4 rounded-xl border border-border/50 w-full">
                <Checkbox 
                  id="skip-errors" 
                  checked={skipErrors} 
                  onCheckedChange={(checked) => setSkipErrors(!!checked)} 
                />
                <Label htmlFor="skip-errors" className="text-xs font-bold flex items-center gap-2 cursor-pointer">
                  Skip rows with errors and continue
                </Label>
              </div>
              
              <div className="flex justify-between w-full">
                <Button variant="outline" onClick={() => setStep("UPLOAD")} className="rounded-xl font-bold border-border/50">
                  <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
                <Button 
                  onClick={() => setStep("CONFIRM")} 
                  disabled={readyToImportCount === 0}
                  className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl px-8 shadow-brand font-black uppercase tracking-widest text-[10px] h-12"
                >
                  Continue with {readyToImportCount} Rows <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardFooter>
          </div>
        );

      case "CONFIRM":
        return (
          <Card className="border-brand-primary/20 shadow-xl overflow-hidden rounded-3xl">
            <CardHeader className="bg-brand-primary text-white p-8">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Confirm Import</CardTitle>
              <CardDescription className="text-white/70">Review the actions that will be performed on the database.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="grid gap-4">
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Action Type: Upsert</p>
                      <p className="text-xs text-muted-foreground">New products will be created, existing ones will be updated.</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-xl py-1 px-3">{readyToImportCount}</Badge>
                </div>

                <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Stock Protection</p>
                      <p className="text-xs text-muted-foreground italic">Existing product stock will NOT be overwritten.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/10 rounded-2xl border border-dashed border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <X className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Skipped Rows</p>
                      <p className="text-xs text-muted-foreground">Rows marked as errors will be excluded.</p>
                    </div>
                  </div>
                  <Badge variant="ghost" className="text-muted-foreground font-mono text-xl">
                    {(validationResult?.error_count || 0) + ((validationResult?.total || 0) - (readyToImportCount + (validationResult?.error_count || 0)))}
                  </Badge>
                </div>
              </div>

              {loading && (
                <div className="space-y-2 text-center py-4">
                  <Loader2 className="h-10 w-10 animate-spin text-brand-primary mx-auto" />
                  <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Processing Import...</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/20 p-8 flex justify-between border-t border-border/40">
              <Button variant="ghost" onClick={() => setStep("PREVIEW")} disabled={loading} className="font-bold">
                <ChevronLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button 
                onClick={confirmImport} 
                disabled={loading}
                className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl px-12 shadow-brand font-black uppercase tracking-widest text-xs h-14"
              >
                {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Upload className="mr-2 h-5 w-5" />}
                Confirm and Start Import
              </Button>
            </CardFooter>
          </Card>
        );

      case "RESULT":
        return (
          <Card className="border-emerald-200 shadow-2xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-emerald-600 text-white p-10 text-center">
              <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-6 scale-110">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <CardTitle className="text-3xl font-black uppercase tracking-tighter">Import Complete!</CardTitle>
              <CardDescription className="text-emerald-100 text-lg">Your product catalog has been synchronized.</CardDescription>
            </CardHeader>
            <CardContent className="p-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                <div className="text-center p-6 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <p className="text-4xl font-black text-emerald-700">{importResult?.imported_count}</p>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-1">New Products</p>
                </div>
                <div className="text-center p-6 rounded-2xl bg-blue-50 border border-blue-100">
                  <p className="text-4xl font-black text-blue-700">{importResult?.updated_count}</p>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">Updated</p>
                </div>
              </div>

              {importResult?.failed_rows && importResult.failed_rows.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black uppercase tracking-widest text-[10px] text-red-600 flex items-center gap-2">
                      <X className="h-3 w-3" /> {importResult.failed_rows.length} Failed Rows
                    </h4>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-[10px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        const headers = Object.keys(importResult.failed_rows[0]);
                        const csvContent = [
                          headers.join(','),
                          ...importResult.failed_rows.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
                        ].join('\n');
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `Failed_Products_${new Date().getTime()}.csv`;
                        a.click();
                        window.URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="mr-2 h-3 w-3" />
                      Download Failed
                    </Button>
                  </div>
                  <div className="max-h-40 overflow-auto border border-red-100 rounded-xl">
                    <Table>
                      <TableBody>
                        {importResult.failed_rows.map((row, i) => (
                          <TableRow key={i} className="bg-red-50/50">
                            <TableCell className="font-mono text-[10px]">{row.sku}</TableCell>
                            <TableCell className="text-[10px] text-red-700">{row.error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="p-10 pt-0 flex gap-4">
              <Button 
                variant="outline" 
                className="flex-1 rounded-2xl h-14 font-bold border-emerald-600/20 text-emerald-700 hover:bg-emerald-50"
                onClick={resetImport}
              >
                Import Another File
              </Button>
              <Button 
                className="flex-1 rounded-2xl h-14 bg-brand-primary hover:bg-brand-primary/90 text-white shadow-brand font-black uppercase tracking-widest"
                onClick={() => navigate("/products")}
              >
                View Products
              </Button>
            </CardFooter>
          </Card>
        );
    }
  };

  return (
    <TooltipProvider>
      <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/products")} className="h-12 w-12 rounded-2xl bg-white border border-border/50 shadow-xs hover:bg-muted">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-brand-primary" />
                Inventory Pilot
              </h1>
              <p className="text-muted-foreground font-medium">Bulk synchronize your master product data and warehouse inventory.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-2xl h-12 border border-border/50">
            {["UPLOAD", "MAPPING", "PREVIEW", "CONFIRM"].map((s, i) => (
              <div 
                key={s} 
                className={cn(
                  "px-4 h-full flex items-center rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  step === s ? "bg-white shadow-sm text-brand-primary" : "text-muted-foreground/50"
                )}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {renderStep()}
      </div>
    </TooltipProvider>
  );
}
