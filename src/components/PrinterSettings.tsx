import * as React from "react";
import { usePrinter } from "@/printer/PrinterContextCore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "motion/react";
import { 
  Printer, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Zap, 
  Power, 
  Bluetooth, 
  Info,
  CircleDashed,
  Cpu,
  ArrowRight,
  MonitorSmartphone,
  Check
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PrinterSettings() {
  const { 
    state, 
    errorReason, 
    connectedDevice, 
    scan, 
    disconnect, 
    print, 
    isSimulated, 
    setSimulated 
  } = usePrinter();
  
  const [isTesting, setIsTesting] = React.useState(false);

  const handleTestPrint = async () => {
    if (state !== 'connected') {
      toast.error("Not connected", { description: "Establish a link first." });
      return;
    }

    try {
      setIsTesting(true);
      const encoder = new TextEncoder();
      
      const data = new Uint8Array([
        0x1B, 0x40, // Initialize
        0x1B, 0x61, 0x01, // Center
        0x1D, 0x21, 0x11, // Double size
        ...encoder.encode("TATVISHA\n"),
        0x1D, 0x21, 0x00, // Reset size
        ...encoder.encode("DISTRIBUTION SYSTEM\n"),
        ...encoder.encode("--------------------------------\n"),
        ...encoder.encode(`TEST PRINT: OK\n`),
        ...encoder.encode(`DATE: ${new Date().toLocaleString()}\n`),
        ...encoder.encode(`DEVICE: ${connectedDevice?.name}\n`),
        ...encoder.encode("--------------------------------\n"),
        ...encoder.encode("\nThank you for choosing\nTatvisha Enterprises\n"),
        ...encoder.encode("\n\n\n\n"),
        0x1D, 0x56, 0x42, 0x00 // Cut
      ]);
      
      await print(data);
      toast.success("Print job spooled", { description: "Check your thermal printer." });
    } catch (error) {
      console.error(error);
      toast.error("Spooling failed", { 
        description: error instanceof Error ? error.message : "Possible buffer overflow"
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header with Simulator Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-1">
        <div className="space-y-1">
          <h2 className="text-2xl font-black tracking-tight text-slate-900 uppercase italic">Thermal Controller</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full bg-slate-50 border-slate-200 text-slate-500 font-bold text-[10px] uppercase tracking-widest px-3">
              WebBluetooth Stack
            </Badge>
            <div className="flex items-center gap-2 ml-2 group cursor-help" title="Use this for testing UI without real hardware">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider transition-colors group-hover:text-primary">Dev Sandbox</span>
              <Switch 
                checked={isSimulated} 
                onCheckedChange={setSimulated}
                disabled={state !== 'disconnected'}
                className="scale-90"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Connection Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-8 border-0 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] rounded-[2.5rem] overflow-hidden bg-white ring-1 ring-slate-100">
          <CardContent className="p-0">
            {/* Visualizer Frame */}
            <div className="relative aspect-[21/9] sm:aspect-video lg:aspect-auto lg:h-[320px] bg-slate-950 overflow-hidden flex flex-col items-center justify-center p-8">
              {/* Background Effects */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_120%,rgba(59,130,246,0.15),transparent_70%)]" />
                <div className="absolute top-[20%] left-[10%] w-32 h-32 bg-primary/20 rounded-full blur-[80px]" />
                <div className="absolute bottom-[20%] right-[10%] w-32 h-32 bg-indigo-500/10 rounded-full blur-[80px]" />
              </div>

              <AnimatePresence mode="wait">
                {state === 'connected' ? (
                  <motion.div 
                    key="connected"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    className="relative z-10 flex flex-col items-center gap-6"
                  >
                    <div className="relative group">
                      <div className="absolute inset-0 bg-emerald-500/30 rounded-full animate-ping scale-125 duration-[2s]" />
                      <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-pulse scale-150 duration-[3s]" />
                      <div className="relative h-24 w-24 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.4)] border-4 border-white/20 transition-transform duration-500 group-hover:scale-110">
                        <CheckCircle2 className="h-12 w-12 text-white" />
                      </div>
                    </div>
                    <div className="space-y-2 text-center">
                      <h3 className="text-3xl font-black text-white tracking-tighter italic lg:text-4xl">
                        {connectedDevice?.name}
                      </h3>
                      <div className="flex items-center justify-center gap-3">
                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em]">Handshake Active</p>
                      </div>
                    </div>
                  </motion.div>
                ) : state === 'scanning' || state === 'connecting' ? (
                  <motion.div 
                    key="working"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="relative z-10 flex flex-col items-center gap-8"
                  >
                    <div className="relative h-32 w-32 flex items-center justify-center">
                       <CircleDashed className="h-full w-full text-primary/30 animate-[spin_8s_linear_infinite]" strokeWidth={1} />
                       <CircleDashed className="absolute h-24 w-24 text-primary animate-[spin_3s_linear_infinite]" strokeWidth={2} />
                       <div className="absolute h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <Bluetooth className="h-6 w-6 text-primary animate-pulse" />
                       </div>
                    </div>
                    <div className="space-y-2 text-center">
                      <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">
                        {state === 'scanning' ? "Probing Range..." : "Negotiating..."}
                      </h3>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] animate-pulse">Syncing nodes in vicinity</p>
                    </div>
                  </motion.div>
                ) : state === 'error' ? (
                  <motion.div 
                    key="error"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="relative z-10 flex flex-col items-center gap-6"
                  >
                    <div className="h-24 w-24 rounded-full bg-rose-500 flex items-center justify-center shadow-[0_0_40px_rgba(244,63,94,0.3)] border-4 border-white/10">
                      <AlertTriangle className="h-12 w-12 text-white" />
                    </div>
                    <div className="space-y-2 text-center px-6">
                      <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">Link Failed</h3>
                      <p className="text-xs font-bold text-rose-400 uppercase tracking-widest max-w-sm mx-auto leading-relaxed border-t border-white/5 pt-2 mt-2 italic">
                        {errorReason || "Peripheral rejected the connection sequence"}
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="off"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="relative z-10 flex flex-col items-center gap-6"
                  >
                    <div className="h-24 w-24 rounded-full bg-slate-900 border-4 border-slate-800 flex items-center justify-center text-slate-700 transition-colors hover:border-primary/50 hover:text-primary/50 duration-500 group cursor-pointer" onClick={() => scan()}>
                      <Power className="h-12 w-12 transition-transform group-hover:scale-110" />
                    </div>
                    <div className="space-y-2 text-center">
                      <h3 className="text-3xl font-black text-slate-700 italic tracking-tighter uppercase">Station Standby</h3>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">No peripheral active</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Control Panel */}
            <div className="p-8 space-y-6">
              {state === 'connected' ? (
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button 
                    onClick={handleTestPrint}
                    disabled={isTesting}
                    className="flex-[2] h-16 rounded-2xl bg-white hover:bg-slate-50 text-slate-900 border-2 border-slate-100 shadow-sm font-black uppercase text-xs tracking-widest group transition-all active:scale-95 translate-y-0 hover:-translate-y-1"
                  >
                    {isTesting ? (
                      <RefreshCw className="mr-3 h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Zap className="mr-3 h-5 w-5 text-amber-500 fill-amber-500 group-hover:scale-110 transition-transform" />
                    )}
                    Verify Output Channel
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => disconnect()}
                    className="flex-1 h-16 rounded-2xl bg-white border-2 border-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white hover:border-rose-500 font-black uppercase text-xs tracking-widest transition-all active:scale-95"
                  >
                    Sever Link
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <Button 
                    onClick={() => scan()}
                    disabled={state === 'scanning' || state === 'connecting'}
                    className={cn(
                      "w-full h-20 rounded-2xl font-black uppercase tracking-[0.4em] text-sm transition-all shadow-[0_16px_32px_-4px_rgba(0,0,0,0.1)] active:scale-95 translate-y-0 hover:-translate-y-1",
                      state === 'error' ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200" : "bg-primary hover:bg-primary/90 text-white shadow-primary/20"
                    )}
                  >
                    {state === 'scanning' ? (
                      <>
                        <RefreshCw className="mr-4 h-6 w-6 animate-spin" />
                        Awaiting Selection...
                      </>
                    ) : state === 'error' ? "Recalibrate & Retry" : "Initiate Pulse Scan"}
                  </Button>
                  
                  {state === 'disconnected' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-50">
                      {[
                        { icon: Bluetooth, text: "Enable BT", desc: "On your device" },
                        { icon: Power, text: "Power On", desc: "Thermal printer" },
                        { icon: Cpu, text: "Pair Node", desc: "Select device" }
                      ].map((step, i) => (
                        <div key={i} className="bg-slate-50/50 p-4 rounded-2xl border border-transparent hover:border-slate-200 transition-colors group">
                           <div className="flex items-center gap-3 mb-1">
                              <span className="text-[10px] font-black text-slate-300 group-hover:text-primary transition-colors">0{i+1}</span>
                              <step.icon size={14} className="text-slate-400 group-hover:text-primary transition-colors" />
                           </div>
                           <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{step.text}</p>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{step.desc}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Intelligence / Guide Card */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-0 shadow-2xl shadow-slate-200/50 rounded-[2rem] overflow-hidden bg-slate-50">
            <CardContent className="p-8 space-y-8">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] border-b border-slate-200 pb-2">Technical Registry</p>
                <div className="space-y-3">
                  {[
                    { icon: MonitorSmartphone, label: "Interface", value: "ESC/POS v3" },
                    { icon: Activity, label: "Link Speed", value: "115200 bps" },
                    { icon: ShieldCheck, label: "Security", value: "BLE v5.0" }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 shadow-sm group hover:scale-[1.02] transition-transform">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          <item.icon size={14} />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">{item.label}</span>
                      </div>
                      <span className="text-[11px] font-black text-slate-900 tracking-tight">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 rounded-[1.5rem] bg-slate-900 text-white space-y-4 relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 h-20 w-20 bg-primary/20 rounded-full blur-2xl group-hover:bg-primary/40 transition-all" />
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Info size={12} className="text-primary" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Compatibility List</span>
                </div>
                <div className="space-y-2">
                   {[
                     "XP-58 / XP-80 Series",
                     "MTP-II / MTP-III Portable",
                     "POS-58 Mobile Printers",
                     "Zywell / HOIN / GOOJPRT"
                   ].map((brand, i) => (
                     <div key={i} className="flex items-center gap-2">
                        <Check size={10} className="text-emerald-500" />
                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-white transition-colors">{brand}</span>
                     </div>
                   ))}
                </div>
                <p className="text-[9px] font-bold text-slate-500 italic border-t border-white/5 pt-3 leading-relaxed">
                  Requires Chromium browser (Chrome/Edge/Brave). Safari/Firefox do not support the WebBluetooth API.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Troubleshooting */}
          <div className="px-4 py-6 rounded-[2rem] bg-indigo-50/50 border border-indigo-100 space-y-3">
             <div className="flex items-center gap-2 text-indigo-600">
                <Zap size={16} fill="currentColor" />
                <span className="text-[11px] font-black uppercase tracking-tight italic">Low Latency Mode</span>
             </div>
             <p className="text-[10px] font-bold text-indigo-900/60 leading-relaxed italic">
               Bluetooth Auto-Reconnect is disabled to save terminal battery. Re-pair if context is lost.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
