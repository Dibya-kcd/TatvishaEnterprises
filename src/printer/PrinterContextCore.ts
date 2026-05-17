import { createContext, useContext } from 'react';

export type PrinterState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'scanning';

export interface PrinterDevice {
  name: string;
  address?: string;
}

export interface PrinterContextType {
  state: PrinterState;
  connectedDevice: PrinterDevice | null;
  connect: (device: PrinterDevice) => Promise<void>;
  disconnect: () => Promise<void>;
  scan: () => Promise<void>;
}

export const PrinterContext = createContext<PrinterContextType | undefined>(undefined);

export const usePrinter = () => {
  const context = useContext(PrinterContext);
  if (context === undefined) {
    throw new Error('usePrinter must be used within a PrinterProvider');
  }
  return context;
};
