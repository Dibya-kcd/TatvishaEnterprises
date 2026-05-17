import React, { createContext, useContext, useState, ReactNode } from 'react';

import { PrinterContext, type PrinterState, type PrinterDevice, type PrinterContextType } from './PrinterContextCore';

export const PrinterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PrinterState>('disconnected');
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);

  const connect = async (device: PrinterDevice) => {
    setState('connecting');
    // Mock connection
    setTimeout(() => {
      setConnectedDevice(device);
      setState('connected');
    }, 1000);
  };

  const disconnect = async () => {
    setConnectedDevice(null);
    setState('disconnected');
  };

  const scan = async () => {
    setState('scanning');
    setTimeout(() => setState('disconnected'), 2000);
  };

  return (
    <PrinterContext.Provider value={{ state, connectedDevice, connect, disconnect, scan }}>
      {children}
    </PrinterContext.Provider>
  );
};
