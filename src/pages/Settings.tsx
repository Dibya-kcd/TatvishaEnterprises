import * as React from "react";
import { usePrinter } from "@/printer/PrinterContextCore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Printer, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  UserCircle, 
  ShieldAlert, 
  RotateCcw, 
  Settings2, 
  Store, 
  Sliders,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContextCore";
import { useSettings } from "@/hooks/useSettings";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";

import { 
  ResponsiveContainer, 
} from "@/components/ui/responsive-ui";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

type SettingsTab = "hardware" | "business" | "account" | "preferences";

export default function Settings() {
  const { state: printerState, connectedDevice, connect, disconnect, scan } = usePrinter();
  const { user, isAdmin, signOut } = useAuth();
  const { settings, updateSetting, resetSettings } = useSettings();
  const { 
    margins, 
    updateMargins, 
    categoryMargins, 
    updateCategoryMargins, 
    varianceThreshold,
    updateVarianceThreshold,
    loading: marginsLoading 
  } = useGlobalSettings();
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("hardware");
  const [isScanning, setIsScanning] = React.useState(false);
  const [localMargins, setLocalMargins] = React.useState(margins);
  const [localCats, setLocalCats] = React.useState(categoryMargins);
  const [localVariance, setLocalVariance] = React.useState(varianceThreshold);

  React.useEffect(() => {
    setLocalMargins(margins);
  }, [margins]);

  React.useEffect(() => {
    setLocalCats(categoryMargins);
  }, [categoryMargins]);

  React.useEffect(() => {
    setLocalVariance(varianceThreshold);
  }, [varianceThreshold]);

  const handleScan = async () => {
    setIsScanning(true);
    await scan();
    setIsScanning(false);
  };

  const handleUpdate = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    updateSetting(key, value);
    toast.success("Settings updated", {
      description: `${key.replace(/([A-Z])/g, ' $1').toLowerCase()} saved successfully.`
    });
  };

  const handleReset = () => {
    resetSettings();
    toast.info("Settings reset", {
      description: "All preferences have been restored to defaults."
    });
  };

  const handleMarginChange = (st: keyof typeof margins, val: string) => {
    const num = parseFloat(val) || 0;
    setLocalMargins(prev => ({ ...prev, [st]: num }));
  };

  const saveMargins = async () => {
    try {
      await updateMargins(localMargins);
      toast.success("Global config saved");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save config";
      toast.error(message);
    }
  };

  const navItems = [
    { id: "hardware", label: "Hardware", icon: Printer, desc: "Devices & Printers" },
    { id: "account", label: "Account", icon: UserCircle, desc: "Your profile & credentials" },
    ...(isAdmin ? [
      { id: "business", label: "Business", icon: Store, desc: "Pricing & margin defaults" },
      { id: "preferences", label: "Preferences", icon: Sliders, desc: "Display & print settings" }
    ] : []),
  ] as const;

  const RestrictedFallback = () => (
    <Card className="border-2 border-dashed border-rose-100 bg-rose-50/30 rounded-3xl p-12 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-500">
          <ShieldAlert size={32} />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-black text-rose-900 uppercase tracking-tight">Access Restricted</h3>
          <p className="text-sm font-bold text-rose-600/60 max-w-xs mx-auto italic">
            This module requires administrative clearances. Operations are locked.
          </p>
        </div>
        <Button 
          variant="outline" 
          className="mt-4 rounded-xl border-rose-200 text-rose-500 font-bold uppercase tracking-widest text-[10px]"
          onClick={() => setActiveTab("account")}
        >
          Return to Profile
        </Button>
      </div>
    </Card>
  );

  return (
    <ResponsiveContainer className="pb-32 px-4 sm:px-6 lg:px-0 overflow-x-hidden">
      <PageHeader 
        title="Settings" 
        subtitle="App configuration" 
      />
      
      <div className="flex flex-col md:flex-row gap-4 sm:gap-8 mt-4 md:mt-8">
        {/* Navigation Sidebar */}
        <aside className="md:w-64 lg:w-80 shrink-0 px-0">
          <div className="md:sticky md:top-24 space-y-2">
            <div className="flex flex-row md:flex-col gap-2 overflow-x-auto pb-4 md:pb-0 no-scrollbar -mx-2 px-3 md:mx-0 md:px-0 snap-x">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex flex-col md:flex-row items-center md:items-center gap-1.5 md:gap-4 px-4 md:px-8 py-3 md:py-5 rounded-2xl md:rounded-[2rem] transition-all relative group shrink-0 md:shrink min-w-[84px] md:min-w-0 border-2 snap-center",
                    activeTab === item.id 
                      ? "bg-primary text-white border-primary shadow-xl shadow-primary/20 scale-[1.02]" 
                      : "bg-white text-slate-500 border-slate-100/50 hover:bg-slate-50"
                  )}
                >
                  <item.icon className={cn("h-4 w-4 md:h-5 md:w-5", activeTab === item.id ? "text-white" : "text-slate-400 group-hover:text-primary transition-colors")} />
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-black tracking-tight leading-none">{item.label}</p>
                    <p className={cn("text-[10px] mt-1.5 font-bold opacity-60 leading-none uppercase tracking-wider", activeTab === item.id ? "text-white" : "text-slate-400")}>{item.desc}</p>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest md:hidden mt-0.5">{item.label}</span>
                </button>
              ))}
              
              <div className="hidden md:block pt-6 px-4">
                <DropdownMenuSeparator className="bg-slate-100 mb-6" />
                <Button 
                  variant="ghost" 
                  className="w-full justify-start gap-4 px-6 py-4 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 font-black h-auto group transition-all"
                  onClick={() => signOut()}
                >
                  <LogOut className="h-6 w-6 group-hover:-translate-x-1 transition-transform" />
                  <div className="text-left">
                    <p className="text-sm leading-none">Logout</p>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        </aside>

        {/* Dynamic Content Area */}
        <main className="flex-1 min-w-0 pb-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 px-1 sm:px-0"
            >
              {activeTab === "hardware" && (
                <div className="space-y-6">
                  <Card className="border-0 shadow-2xl shadow-slate-200/50 rounded-2xl lg:rounded-3xl overflow-hidden bg-white">
                    <CardHeader className="bg-slate-900 p-6 sm:p-10 text-white relative h-32 sm:h-48 overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.05),transparent)]" />
                      <div className="flex items-center justify-between relative z-10">
                        <div className="space-y-0.5 sm:space-y-2">
                          <CardTitle className="text-2xl sm:text-4xl font-black tracking-tighter">Thermal Engine</CardTitle>
                          <CardDescription className="font-black text-white/40 uppercase text-[8px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] leading-none">Peripheral Interface Access</CardDescription>
                        </div>
                        <div className="h-10 w-10 sm:h-16 sm:w-16 rounded-xl sm:rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 backdrop-blur-xl">
                          <Printer className="h-5 w-5 sm:h-8 sm:w-8 text-white/40" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-10 space-y-6 sm:space-y-10">
                      <div className="flex flex-col lg:flex-row items-center lg:items-center justify-between gap-6 sm:gap-10 p-5 sm:p-10 rounded-2xl sm:rounded-[2.5rem] bg-slate-50 border border-slate-100 relative group">
                        <div className="flex items-center gap-4 sm:gap-8 w-full sm:w-auto">
                          <div className={cn(
                            "h-12 w-12 sm:h-20 sm:w-20 rounded-full flex items-center justify-center shadow-inner transition-all duration-500 shrink-0",
                            printerState === 'connected' ? "bg-emerald-50 text-emerald-500 scale-110" : "bg-white text-slate-200"
                          )}>
                            {printerState === 'connected' ? <CheckCircle2 className="h-6 w-6 sm:h-10 sm:w-10 animate-in zoom-in-50" /> : <Printer className="h-6 w-6 sm:h-10 sm:w-10" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-lg sm:text-2xl font-black tracking-tighter text-slate-800 truncate leading-none">
                              {printerState === 'connected' ? connectedDevice?.name : 'Link required'}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge className={cn(
                                "text-[9px] sm:text-[10px] font-black uppercase px-2 sm:px-3 h-5 sm:h-6 border-none rounded-lg tracking-wider",
                                printerState === 'connected' ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                              )}>
                                {printerState === 'connected' ? 'Authenticated' : 'Offline'}
                              </Badge>
                              <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none whitespace-nowrap">Node BT-G5</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 w-full lg:w-auto">
                          {printerState === 'connected' ? (
                            <Button 
                              variant="outline" 
                              onClick={disconnect} 
                              className="w-full lg:w-48 rounded-xl h-14 font-black uppercase text-xs border-2 bg-white border-slate-200 hover:bg-rose-50 hover:text-rose-500 transition-all"
                            >
                              Kill Link
                            </Button>
                          ) : (
                            <Button 
                              onClick={handleScan}
                              disabled={isScanning}
                              className="w-full lg:w-64 bg-primary hover:bg-primary/90 text-white shadow-xl rounded-2xl h-14 sm:h-16 px-6 font-black uppercase text-xs sm:text-sm tracking-widest transition-all active:scale-95"
                            >
                              {isScanning ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                              {isScanning ? "Probing" : "Sync Device"}
                            </Button>
                          )}
                        </div>
                      </div>

                      {printerState === 'scanning' && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }} 
                          animate={{ opacity: 1, scale: 1 }} 
                          className="flex flex-col items-center justify-center p-8 sm:p-16 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/20 gap-4 sm:gap-6"
                        >
                          <div className="relative h-16 w-16 sm:h-20 sm:w-20">
                            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                            <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white border border-slate-100 flex items-center justify-center shadow-lg">
                               <RefreshCw className="h-6 w-6 sm:h-8 sm:w-8 text-primary animate-spin" />
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] text-primary">Discovering local nodes</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-2">Ensure printer is in pairing mode</p>
                          </div>
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === "account" && (
                <Card className="border-0 shadow-2xl shadow-slate-200/50 rounded-2xl sm:rounded-[3rem] overflow-hidden bg-white">
                  <div className="bg-[#0F172A] p-5 sm:p-12 text-white relative min-h-[140px] sm:h-64 flex items-center">
                    <div className="absolute top-0 right-0 h-full w-full bg-[radial-gradient(circle_at_70%_20%,rgba(168,82,43,0.15),transparent_60%)] pointer-events-none" />
                    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-10 relative z-10 w-full px-2 sm:px-0">
                      <div className="h-16 w-16 sm:h-32 sm:w-32 rounded-xl sm:rounded-[3.5rem] bg-white/5 flex items-center justify-center border border-white/10 shadow-2xl backdrop-blur-2xl shrink-0">
                        <UserCircle className="h-8 w-8 sm:h-16 sm:w-16 text-white/40" />
                      </div>
                      <div className="space-y-1 text-center sm:text-left flex-1 min-w-0">
                        <h3 className="text-xl sm:text-5xl font-black tracking-tighter leading-tight italic truncate px-1">{user?.email?.split('@')[0]}</h3>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-4 mt-1 sm:mt-4">
                           <Badge className="bg-primary/20 text-white border-primary/20 font-black text-[8px] sm:text-[10px] px-2 sm:px-4 py-0.5 sm:py-1 h-5 sm:h-7 rounded-lg tracking-widest uppercase">{isAdmin ? "Superuser" : "Standard Agent"}</Badge>
                           <span className="text-white/20 text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] whitespace-nowrap">Access Verifier 1.2</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-5 sm:p-12 space-y-6 sm:space-y-12">
                    <div className="grid md:grid-cols-2 gap-4 sm:gap-10">
                      <div className="space-y-1.5 sm:space-y-3">
                        <Label className="text-[8px] sm:text-[10px] uppercase font-black text-slate-300 tracking-[0.2em] ml-1">Identity Endpoint</Label>
                        <div className="h-11 sm:h-16 flex items-center px-4 sm:px-6 rounded-xl sm:rounded-2xl bg-slate-50 border border-slate-100 text-xs sm:text-sm font-black text-slate-800 shadow-inner font-mono break-all leading-tight">
                          {user?.email}
                        </div>
                      </div>
                      <div className="space-y-1.5 sm:space-y-3">
                        <Label className="text-[8px] sm:text-[10px] uppercase font-black text-slate-300 tracking-[0.2em] ml-1">Assigned Node</Label>
                        <div className="h-11 sm:h-16 flex items-center px-4 sm:px-6 rounded-xl sm:rounded-2xl bg-slate-50 border border-slate-100 text-xs sm:text-sm font-black text-slate-800 shadow-inner uppercase tracking-[0.1em]">
                          NE-DIST-CENTER #03
                        </div>
                      </div>
                    </div>
 
                    <div className="p-4 sm:p-10 bg-amber-50 rounded-xl sm:rounded-2xl border border-amber-100 flex flex-col sm:flex-row gap-3 sm:gap-8 items-start sm:items-center">
                      <div className="h-10 w-10 sm:h-16 sm:w-16 rounded-xl sm:rounded-[1.5rem] bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/10">
                        <ShieldAlert className="h-5 w-5 sm:h-8 sm:w-8 text-amber-600" />
                      </div>
                      <div className="space-y-0.5 sm:space-y-1">
                        <p className="text-sm sm:text-lg font-black text-amber-900 tracking-tight leading-none">Credential Isolation</p>
                        <p className="text-[10px] sm:text-sm font-bold text-amber-600/70 leading-relaxed italic max-w-lg">
                          Security policies and cluster permissions are enforced by the cloud supervisor. Local adjustments are prohibited.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === "business" && (
                isAdmin ? (
                  <Card className="border-0 shadow-2xl shadow-slate-200/50 rounded-2xl sm:rounded-[3rem] overflow-hidden bg-white">
                  <CardHeader className="p-5 sm:p-12 pb-2 sm:pb-6">
                    <CardTitle className="text-xl sm:text-4xl font-black tracking-tighter">Business Matrix</CardTitle>
                    <CardDescription className="text-slate-400 font-bold text-[10px] sm:text-sm tracking-tight mt-1 uppercase tracking-widest leading-tight">Global Pricing & Arithmetic Constants</CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 sm:p-12 pt-2 sm:pt-6 space-y-6 sm:space-y-12">
                    <div className="space-y-6 sm:space-y-12">
                      {/* Tier Based Margins */}
                      <div className="space-y-4 sm:space-y-8">
                        <div className="flex items-center justify-between gap-2 px-2">
                           <Label className="text-[9px] sm:text-[11px] uppercase font-black text-slate-400 tracking-[0.1em] sm:tracking-[0.2em] flex items-center gap-2 sm:gap-3 shrink-0">
                              <Store size={14} className="text-primary shrink-0" /> <span className="truncate">Tier Matrix (%)</span>
                           </Label>
                           <Badge variant="outline" className="border-slate-100 text-slate-300 font-black text-[8px] sm:text-[9px] uppercase tracking-tighter h-5 sm:h-6 px-2 sm:px-3">Sync Active</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-6">
                           {(['premium', 'gold', 'silver', 'bronze', 'basic'] as const).map(tier => (
                             <div key={tier} className="space-y-1.5 sm:space-y-3 p-3 sm:p-6 rounded-xl sm:rounded-2xl bg-slate-50 transition-all hover:bg-white hover:shadow-xl hover:shadow-slate-100 border border-transparent hover:border-slate-100 group">
                               <Label className="text-[8px] sm:text-[10px] uppercase font-black text-slate-400 tracking-widest block text-center mb-0.5 sm:mb-1 group-hover:text-primary transition-colors">{tier}</Label>
                               <div className="relative">
                                 <Input 
                                   type="number" 
                                   step="0.1"
                                   value={localMargins[tier]} 
                                   onChange={(e) => handleMarginChange(tier, e.target.value)}
                                   className="h-10 sm:h-14 rounded-lg sm:rounded-2xl bg-white border-transparent focus:border-primary font-black text-center text-sm sm:text-lg text-slate-900 shadow-sm px-1 transition-all" 
                                 />
                               </div>
                             </div>
                           ))}
                        </div>
                      </div>
  
                      {/* Category Based Margins */}
                      <div className="space-y-4 sm:space-y-8">
                         <div className="flex items-center justify-between px-2 border-t pt-6 sm:pt-12 border-slate-100">
                            <Label className="text-[9px] sm:text-[11px] uppercase font-black text-slate-400 tracking-[0.1em] sm:tracking-[0.2em] flex items-center gap-2 sm:gap-3 shrink-0">
                               <Sliders size={14} className="text-amber-500 shrink-0" /> <span className="truncate">Category Surcharge (%)</span>
                            </Label>
                         </div>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                             {Object.entries(localCats).map(([cat, val]) => (
                              <div key={cat} className="space-y-1.5 sm:space-y-3 p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-[#FFFBF0] border border-amber-100/30 group transition-all hover:bg-white hover:shadow-xl hover:shadow-amber-100/20">
                                 <Label className="text-[8px] sm:text-[10px] uppercase font-bold text-amber-800/60 tracking-wider block leading-tight truncate">{cat}</Label>
                                 <div className="relative">
                                    <Input 
                                      type="number" 
                                      value={val} 
                                      onChange={(e) => setLocalCats({...localCats, [cat]: Number(e.target.value)})}
                                      className="h-9 sm:h-12 rounded-lg bg-white border-transparent focus:border-amber-500 font-black text-sm sm:text-lg text-slate-900 shadow-sm px-2" 
                                    />
                                    <span className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-[8px] sm:text-[10px] font-black text-amber-200">%</span>
                                 </div>
                              </div>
                            ))}
                         </div>
                      </div>

                      {/* Variance Threshold */}
                      <div className="space-y-4 sm:space-y-8">
                         <div className="flex items-center justify-between px-2 border-t pt-6 sm:pt-12 border-slate-100">
                            <Label className="text-[9px] sm:text-[11px] uppercase font-black text-slate-400 tracking-[0.1em] sm:tracking-[0.2em] flex items-center gap-2 sm:gap-3 shrink-0">
                               <ShieldAlert size={14} className="text-rose-500 shrink-0" /> <span className="truncate">Variance Alert Threshold (%)</span>
                            </Label>
                         </div>
                         <div className="max-w-xs">
                           <div className="space-y-1.5 sm:space-y-3 p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-rose-50 border border-rose-100/30 group transition-all hover:bg-white hover:shadow-xl hover:shadow-rose-100/20">
                              <Label className="text-[8px] sm:text-[10px] uppercase font-bold text-rose-800/60 tracking-wider block leading-tight">Price Deviation Limit</Label>
                              <div className="relative">
                                 <Input 
                                   type="number" 
                                   value={localVariance} 
                                   onChange={(e) => setLocalVariance(Number(e.target.value))}
                                   className="h-9 sm:h-12 rounded-lg bg-white border-transparent focus:border-rose-500 font-black text-sm sm:text-lg text-slate-900 shadow-sm px-2" 
                                 />
                                 <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-rose-200">%</span>
                              </div>
                           </div>
                         </div>
                      </div>
                    </div>
  
                    <div className="flex justify-center sm:justify-end pt-6 sm:pt-12 border-t border-slate-100 mt-6 sm:mt-12">
                      <Button 
                        onClick={async () => {
                          await updateMargins(localMargins);
                          await updateCategoryMargins(localCats);
                          await updateVarianceThreshold(localVariance);
                          toast.success("Matrix Synchronized");
                        }}
                        disabled={marginsLoading}
                        className="w-full sm:w-64 bg-slate-900 hover:bg-black text-white shadow-xl sm:shadow-2xl shadow-slate-300 rounded-xl sm:rounded-[1.5rem] h-12 sm:h-16 px-4 sm:px-16 font-black uppercase text-[10px] sm:text-sm tracking-[0.1em] sm:tracking-[0.2em] transition-all transform active:scale-95"
                      >
                        {marginsLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4 font-black" />}
                        {marginsLoading ? "Processing" : "Apply Matrix"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                ) : <RestrictedFallback />
              )}

              {activeTab === "preferences" && (
                isAdmin ? (
                  <Card className="border-0 shadow-2xl shadow-slate-200/50 rounded-2xl sm:rounded-[3rem] overflow-hidden bg-white">
                  <CardHeader className="p-5 sm:p-12 pb-2 sm:pb-6">
                    <CardTitle className="text-xl sm:text-4xl font-black tracking-tighter italic leading-none">Operational Bias</CardTitle>
                    <CardDescription className="text-slate-400 font-bold text-[10px] sm:text-sm tracking-tight mt-1">Logic behavior & observation frequency.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 sm:p-12 pt-2 sm:pt-6 space-y-8 sm:space-y-16">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-12">
                      <div className="space-y-2 sm:space-y-4">
                        <Label className="text-[9px] sm:text-[11px] uppercase font-black text-slate-300 tracking-[0.15em] sm:tracking-[0.2em] mb-1 sm:mb-2 flex items-center gap-2">
                           System Reporting Cycle
                        </Label>
                        <Select 
                          value={settings.reportingPeriod} 
                          onValueChange={(v) => handleUpdate('reportingPeriod', v as "daily" | "weekly" | "monthly")}
                        >
                          <SelectTrigger className="h-12 sm:h-16 rounded-xl sm:rounded-[1.5rem] bg-slate-50 border-slate-100 font-black text-xs sm:text-sm text-slate-800 px-4 sm:px-6 focus:ring-primary shadow-sm transition-all focus:bg-white hover:bg-slate-100/50">
                            <SelectValue placeholder="Period" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-slate-200 shadow-2xl p-2 bg-white">
                            <SelectItem value="daily" className="text-[10px] sm:text-sm font-black py-3 sm:py-4 rounded-xl">DAILY PULSE</SelectItem>
                            <SelectItem value="weekly" className="text-[10px] sm:text-sm font-black py-3 sm:py-4 rounded-xl">WEEKLY FLOW</SelectItem>
                            <SelectItem value="monthly" className="text-[10px] sm:text-sm font-black py-3 sm:py-4 rounded-xl">MONTHLY MASS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
 
                      <div className="space-y-2 sm:space-y-4">
                        <Label className="text-[9px] sm:text-[11px] uppercase font-black text-slate-300 tracking-[0.15em] sm:tracking-[0.2em] mb-1 sm:mb-2">
                          Arithmetic Bias (Tax)
                        </Label>
                        <Select 
                          value={settings.gstRounding} 
                          onValueChange={(v) => handleUpdate('gstRounding', v as "round" | "ceil" | "floor")}
                        >
                          <SelectTrigger className="h-12 sm:h-16 rounded-xl sm:rounded-[1.5rem] bg-slate-50 border-slate-100 font-black text-xs sm:text-sm text-slate-800 px-4 sm:px-6 focus:ring-primary shadow-sm transition-all focus:bg-white hover:bg-slate-100/50">
                            <SelectValue placeholder="Logic" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-slate-200 shadow-2xl p-2 bg-white">
                            <SelectItem value="round" className="text-[10px] sm:text-sm font-black py-3 sm:py-4 rounded-xl">NEAREST INTEGER</SelectItem>
                            <SelectItem value="ceil" className="text-[10px] sm:text-sm font-black py-3 sm:py-4 rounded-xl">CEILING BOUNDARY</SelectItem>
                            <SelectItem value="floor" className="text-[10px] sm:text-sm font-black py-3 sm:py-4 rounded-xl">FLOOR BOUNDARY</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
 
                      <div className="space-y-2 sm:space-y-4">
                        <Label className="text-[9px] sm:text-[11px] uppercase font-black text-slate-300 tracking-[0.15em] sm:tracking-[0.2em] mb-1 sm:mb-2 text-center sm:text-left">
                          Stock Warning Boundary
                        </Label>
                        <div className="relative">
                          <Input 
                            type="number" 
                            value={settings.lowStockThreshold} 
                            onChange={(e) => handleUpdate('lowStockThreshold', Number(e.target.value))}
                            className="h-12 sm:h-16 rounded-xl sm:rounded-[1.5rem] bg-slate-50 border-slate-100 font-black text-xs sm:text-sm text-slate-800 px-4 sm:px-6 pr-12 sm:pr-14 focus:ring-primary focus:bg-white shadow-sm transition-all text-center sm:text-left" 
                          />
                          <span className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-[8px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none">Units</span>
                        </div>
                      </div>
                    </div>
 
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-6 sm:pt-10 border-t border-slate-100">
                      <Button 
                        variant="ghost" 
                        onClick={handleReset}
                        className="w-full sm:w-auto text-[9px] sm:text-[11px] font-black uppercase tracking-[0.1em] sm:tracking-[0.3em] text-slate-400 hover:text-rose-500 hover:bg-rose-50/50 flex items-center justify-center sm:justify-start gap-2.5 sm:gap-3 h-11 sm:h-12 px-6 sm:px-8 rounded-xl sm:rounded-2xl transition-all group"
                      >
                        <RotateCcw size={16} className="group-hover:-rotate-180 transition-transform duration-700" /> 
                        Purge Memory & Reset
                      </Button>
                      <div className="flex items-center gap-2.5 sm:gap-3">
                         <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-emerald-500 animate-pulse" />
                         <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] text-slate-300">System State: Synchronized</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                ) : <RestrictedFallback />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </ResponsiveContainer>
  );
}
