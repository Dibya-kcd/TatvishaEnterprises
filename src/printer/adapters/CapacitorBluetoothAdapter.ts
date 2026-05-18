import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import { PrinterAdapter } from "./PrinterAdapter";

function numberToUUID(shortId: number): string {
  return `0000${shortId.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
}

const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

const WRITE_CHARACTERISTIC = '000018f1-0000-1000-8000-00805f9b34fb';

export class CapacitorBluetoothAdapter implements PrinterAdapter {
  private deviceId: string | null = null;
  private _connected = false;

  constructor() {
    this.init();
  }

  private async init() {
    if (Capacitor.isNativePlatform()) {
      try {
        await BleClient.initialize();
      } catch (e) {
        console.error("BLE Init failed:", e);
      }
    }
  }

  async scan(): Promise<object> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error("Capacitor Bluetooth requires a native platform");
    }

    const device = await BleClient.requestDevice({
      services: PRINTER_SERVICE_UUIDS.map(u => {
        const parts = u.split('-');
        if (parts.length > 1 && parts[0].startsWith('0000')) {
             return numberToUUID(parseInt(parts[0], 16));
        }
        return u;
      }),
      optionalServices: PRINTER_SERVICE_UUIDS,
    });

    return device;
  }

  async connect(deviceOrId: string | { deviceId: string }): Promise<void> {
    const id = typeof deviceOrId === 'string' ? deviceOrId : deviceOrId.deviceId;
    this.deviceId = id;

    await BleClient.connect(id, () => {
      this._connected = false;
      console.warn("Capacitor BLE Disconnected");
    });

    this._connected = true;
  }

  async print(data: Uint8Array): Promise<void> {
    if (!this.deviceId || !this._connected) throw new Error("Not connected");

    // Use the first service/char for now or discover them
    // Real implementation would be more robust like WebBluetoothAdapter
    const MTU = 20; // Default BLE MTU is usually small
    for (let i = 0; i < data.length; i += MTU) {
        const chunk = data.slice(i, i + MTU);
        await BleClient.writeWithoutResponse(
            this.deviceId,
            PRINTER_SERVICE_UUIDS[0],
            WRITE_CHARACTERISTIC,
            new DataView(chunk.buffer)
        );
    }
  }

  async disconnect(): Promise<void> {
    if (this.deviceId) {
      await BleClient.disconnect(this.deviceId);
    }
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }
}
