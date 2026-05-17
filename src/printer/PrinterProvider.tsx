import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';
import { PrinterContext, type PrinterState, type PrinterDevice, type PrinterContextType } from './PrinterContextCore';
import { WebBluetoothAdapter } from './adapters/WebBluetoothAdapter';

export const PrinterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PrinterState>('disconnected');
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const adapterRef = useRef<WebBluetoothAdapter | null>(null);

  const getAdapter = () => {
    if (!adapterRef.current) {
      adapterRef.current = new WebBluetoothAdapter();
    }
    return adapterRef.current;
  };

  const connect = async (device?: PrinterDevice) => {
    try {
      setState('connecting');
      const adapter = getAdapter();
      // If we have a device from scan, pass it. WebBluetooth usually requests it via scan/navigator.bluetooth.requestDevice
      // But we can also pass the raw device if we stored it.
      await adapter.connect(device?.rawDevice as BluetoothDevice);
      
      setConnectedDevice({
        name: (device?.rawDevice as BluetoothDevice)?.name || 'Bluetooth Printer',
        rawDevice: device?.rawDevice
      });
      setState('connected');
    } catch (error) {
      console.error('Connection failed:', error);
      setState('error');
      setTimeout(() => setState('disconnected'), 3000);
    }
  };

  const disconnect = async () => {
    try {
      const adapter = getAdapter();
      await adapter.disconnect();
      setConnectedDevice(null);
      setState('disconnected');
    } catch (error) {
      console.error('Disconnect failed:', error);
      setState('disconnected');
    }
  };

  const scan = async () => {
    try {
      setState('scanning');
      const adapter = getAdapter();
      const device = await adapter.scan(); // This triggers the browser device picker
      
      const printerDevice: PrinterDevice = {
        name: device.name || 'Unknown Printer',
        rawDevice: device
      };
      
      // Auto-connect after selection is common pattern here
      await connect(printerDevice);
      return [printerDevice];
    } catch (error) {
      console.error('Scan failed:', error);
      setState('disconnected');
    }
  };

  const print = async (data: Uint8Array) => {
    const adapter = getAdapter();
    if (!adapter.isConnected()) {
      throw new Error('Printer not connected');
    }
    await adapter.print(data);
  };

  return (
    <PrinterContext.Provider value={{ state, connectedDevice, connect, disconnect, scan, print }}>
      {children}
    </PrinterContext.Provider>
  );
};
