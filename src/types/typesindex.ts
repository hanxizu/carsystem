export interface VehicleInfo {
  plate: string;
  ownerName: string;
  licenseIssueDate: string;
  vehicleTypeRaw: string;
  useNatureRaw: string;
}

export interface TaskData {
  taskId: string;
  plate: string;
  ownerName: string;
  date: string;
  vehicleType: 'private_gas' | 'private_ev' | 'truck_gas' | 'truck_ev';
  operationType: 'non_commercial' | 'commercial' | 'rideshare';
  businessType: 'new' | 'renewal' | 'transfer';
  combos: string[];
  phone: string;
  status: 'pending' | 'distributing' | 'completed';
  createdAt: string;
}

export interface QuoteData {
  displayId: string;
  combo: string;
  premium: number;
  thirdLimit?: string;
  channel: string;
  rawText: string;
}

export interface SessionData {
  userId: string;
  step: 'welcome' | 'uploading' | 'selecting_combo' | 'completed';
  businessDirection?: 'renewal' | 'new_car';
  uploadedFiles: {
    drivingLicense?: Buffer;
    idCard?: Buffer;
    invoice?: Buffer;
    certificate?: Buffer;
    businessLicense?: Buffer;
    operationPermit?: Buffer;
    ridesharePermit?: Buffer;
  };
  phone?: string;
  combos?: string[];
  vehicleInfo?: VehicleInfo;
  taskId?: string;
}