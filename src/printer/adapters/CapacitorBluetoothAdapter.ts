
import { BleClient, type BleDevice, numbersToDataView } from '@capacitor-community/bluetooth-le';
import { PrinterAdapter } from "./PrinterAdapter";
import { Capacitor } from '@capacitor/core';

const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',  // common ESC/POS BLE
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',  // Xprinter / MUNBYN
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',  // Rongta
];

const WRITE_CHARACTERISTIC = '000018f1-0000-1000-8000-00805f9b34fb';

export class CapacitorBluetoothAdapter implements PrinterAdapter {
  private device: BleDevice | null = null;
  private _connected = false;
  private _initialized = false;

  private async ensureInitialized() {
    if (this._initialized) return;
    try {
      await BleClient.initialize();
      this._initialized = true;
    } catch (e) {
      console.error("Failed to initialize BleClient:", e);
      throw new Error("Bluetooth initialization failed");
    }
  }

  async scan(): Promise<BleDevice> {
    await this.ensureInitialized();
    
    // On Android, we need to request permissions
    if (Capacitor.getPlatform() === 'android') {
        // BleClient.requestDevice handles the picker on mobile
    }

    try {
      const device = await BleClient.requestDevice({
        services: PRINTER_SERVICE_UUIDS,
        optionalServices: PRINTER_SERVICE_UUIDS,
      });
      return device;
    } catch (error) {
      console.error('Scan failed:', error);
      throw error;
    }
  }

  async connect(device?: BleDevice): Promise<void> {
    await this.ensureInitialized();
    const targetDevice = device || await this.scan();
    this.device = targetDevice;

    try {
      await BleClient.connect(targetDevice.deviceId, () => {
        this._connected = false;
        console.warn("Printer disconnected");
      });
      this._connected = true;
    } catch (error) {
      this._connected = false;
      console.error('Connection failed:', error);
      throw error;
    }
  }

  async print(data: Uint8Array): Promise<void> {
    if (!this._connected || !this.device) throw new Error('Not connected');

    // Chinking for BLE stability
    const MTU = 20; // Default BLE MTU is small, plugin handles some but small chunks are safer
    for (let i = 0; i < data.length; i += MTU) {
      const chunk = data.slice(i, i + MTU);
      await BleClient.writeWithoutResponse(
        this.device.deviceId,
        PRINTER_SERVICE_UUIDS[0], // Use first service, or discover
        WRITE_CHARACTERISTIC,
        numbersToDataView(Array.from(chunk))
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      await BleClient.disconnect(this.device.deviceId);
    }
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }
}
