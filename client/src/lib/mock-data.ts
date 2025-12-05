import { addDays, subDays, format } from "date-fns";

export type LoadStatus = "CREATED" | "DISPATCHED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED" | "PLANNED";
export type StopStatus = "PLANNED" | "EN_ROUTE" | "ARRIVED" | "DEPARTED" | "SKIPPED";
export type StopType = "PICKUP" | "DELIVERY" | "DROP" | "YARD";

export interface Stop {
  id: string;
  type: StopType;
  sequence: number;
  city: string;
  state: string;
  addressLine1: string;
  zip: string;
  windowStart: string;
  windowEnd: string;
  status: StopStatus;
  arrivedAt?: string;
  departedAt?: string;
  name?: string; // Facility name
}

export interface Driver {
  id?: string;
  name: string;
  phone?: string;
  truckNumber?: string;
  trailerNumber?: string;
}

export interface Load {
  id: string;
  externalLoadId: string; // Acts as loadNumber
  brokerName: string;
  shipperName?: string;
  carrierName?: string;
  customerReference?: string;
  internalReference?: string;
  equipmentType?: string;
  status: LoadStatus;
  rateAmount: number;
  rateCurrency?: string;
  stops: Stop[];
  lastLocationCity?: string;
  lastLocationState?: string;
  lastLocationAt?: string;
  driver?: Driver;
  driverTrackingLink?: string | null;
  customerTrackingLink?: string | null;
  // New fields
  brokerEmail?: string;
  driverPhone?: string;
  brokerWorkspaceId?: string;
  
  // New backend-aligned fields
  loadNumber?: string;
  trackingToken?: string;
  driverToken?: string;
  pickupEta?: string;
  deliveryEta?: string;
  billingMonth?: string;
  isBillable?: boolean;
}

export interface TrackingPing {
  id: string;
  loadId: string;
  driverId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  source: string;
  createdAt: string;
}

export interface RateConfirmationFile {
  id: string;
  loadId: string;
  fileUrl: string;
  originalName: string;
  uploadedAt: string;
}

const TODAY = new Date();

// Initial mock data
const INITIAL_LOADS: Load[] = [
  {
    id: "ld_cuid123456",
    externalLoadId: "LD-2025-001",
    brokerName: "Soar Transportation Group",
    shipperName: "General Mills",
    carrierName: "Soar Transportation",
    customerReference: "PO-998877",
    internalReference: "INT-101",
    equipmentType: "REEFER",
    status: "IN_TRANSIT",
    rateAmount: 1250.00,
    rateCurrency: "USD",
    lastLocationCity: "Ogden",
    lastLocationState: "UT",
    lastLocationAt: new Date().toISOString(),
    driverTrackingLink: "https://pingpoint.app/driver/track/token123",
    customerTrackingLink: "https://pingpoint.app/public/track/token123",
    driver: {
      name: "John Doe",
      phone: "555-0123",
      truckNumber: "TRK-101",
      trailerNumber: "TLR-505"
    },
    stops: [
      {
        id: "stop_1",
        type: "PICKUP",
        sequence: 1,
        name: "General Mills Plant",
        city: "Salt Lake City",
        state: "UT",
        addressLine1: "2200 S 4000 W",
        zip: "84120",
        windowStart: subDays(TODAY, 1).toISOString(),
        windowEnd: subDays(TODAY, 1).toISOString(),
        status: "DEPARTED",
        arrivedAt: subDays(TODAY, 1).toISOString(),
        departedAt: subDays(TODAY, 1).toISOString(),
      },
      {
        id: "stop_2",
        type: "DELIVERY",
        sequence: 2,
        name: "Costco DC",
        city: "Boise",
        state: "ID",
        addressLine1: "1500 Main St",
        zip: "83702",
        windowStart: addDays(TODAY, 1).toISOString(),
        windowEnd: addDays(TODAY, 1).toISOString(),
        status: "PLANNED",
      },
    ],
  },
  {
    id: "ld_cuid789012",
    externalLoadId: "LD-2025-002",
    brokerName: "Cowan Systems",
    shipperName: "Samsung Electronics",
    carrierName: "Cowan Logistics",
    equipmentType: "VAN",
    status: "CREATED",
    rateAmount: 850.00,
    rateCurrency: "USD",
    stops: [
      {
        id: "stop_3",
        type: "PICKUP",
        sequence: 1,
        name: "Samsung Warehouse",
        city: "Las Vegas",
        state: "NV",
        addressLine1: "3500 Las Vegas Blvd",
        zip: "89109",
        windowStart: addDays(TODAY, 2).toISOString(),
        windowEnd: addDays(TODAY, 2).toISOString(),
        status: "PLANNED",
      },
      {
        id: "stop_4",
        type: "DELIVERY",
        sequence: 2,
        name: "Best Buy DC",
        city: "Phoenix",
        state: "AZ",
        addressLine1: "100 W Washington St",
        zip: "85003",
        windowStart: addDays(TODAY, 3).toISOString(),
        windowEnd: addDays(TODAY, 3).toISOString(),
        status: "PLANNED",
      },
    ],
  },
  {
    id: "ld_cuid345678",
    externalLoadId: "LD-2024-999",
    brokerName: "TQL",
    shipperName: "Kroger",
    carrierName: "TQL Carrier",
    status: "DELIVERED",
    rateAmount: 2100.00,
    rateCurrency: "USD",
    lastLocationCity: "Denver",
    lastLocationState: "CO",
    lastLocationAt: subDays(TODAY, 5).toISOString(),
    stops: [
      {
        id: "stop_5",
        type: "PICKUP",
        sequence: 1,
        name: "Kroger Supplier",
        city: "Grand Junction",
        state: "CO",
        addressLine1: "200 Main St",
        zip: "81501",
        windowStart: subDays(TODAY, 6).toISOString(),
        windowEnd: subDays(TODAY, 6).toISOString(),
        status: "DEPARTED",
      },
      {
        id: "stop_6",
        type: "DELIVERY",
        sequence: 2,
        name: "Kroger Store #55",
        city: "Denver",
        state: "CO",
        addressLine1: "500 16th St",
        zip: "80202",
        windowStart: subDays(TODAY, 5).toISOString(),
        windowEnd: subDays(TODAY, 5).toISOString(),
        status: "ARRIVED",
      },
    ],
  },
];

// In-memory store
let MOCK_LOADS = [...INITIAL_LOADS];

export const getLoads = () => {
  // TODO: replace with fetch from backend API
  return [...MOCK_LOADS];
};

export const getLoadById = (id: string) => {
  // TODO: replace with fetch from backend API
  return MOCK_LOADS.find((l) => l.id === id);
};

export const createLoad = (loadData: Partial<Load>) => {
  // TODO: replace with real API call
  const newLoad: Load = {
    id: `ld_${Date.now()}`,
    externalLoadId: `LD-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
    status: "PLANNED",
    brokerName: loadData.brokerName || "Unknown Broker",
    shipperName: loadData.shipperName || "Unknown Shipper",
    carrierName: loadData.carrierName || "Unknown Carrier",
    stops: loadData.stops || [],
    rateAmount: loadData.rateAmount || 0,
    rateCurrency: loadData.rateCurrency || "USD",
    customerReference: loadData.customerReference,
    internalReference: loadData.internalReference,
    equipmentType: loadData.equipmentType,
    driver: loadData.driver,
    brokerEmail: loadData.brokerEmail,
    driverPhone: loadData.driverPhone,
    brokerWorkspaceId: loadData.brokerWorkspaceId,
    ...loadData
  } as Load;

  MOCK_LOADS.push(newLoad);
  return newLoad;
};

export const updateLoad = (id: string, updates: Partial<Load>) => {
  // TODO: replace with real API call
  const index = MOCK_LOADS.findIndex(l => l.id === id);
  if (index !== -1) {
    MOCK_LOADS[index] = { ...MOCK_LOADS[index], ...updates };
    return MOCK_LOADS[index];
  }
  return null;
};

export const getLoadsByView = (view: "today" | "history" | "upcoming") => {
  switch (view) {
    case "today":
      return MOCK_LOADS.filter((l) => l.status === "IN_TRANSIT" || l.status === "DISPATCHED");
    case "upcoming":
      return MOCK_LOADS.filter((l) => l.status === "CREATED" || l.status === "PLANNED");
    case "history":
      return MOCK_LOADS.filter((l) => l.status === "DELIVERED" || l.status === "CANCELLED");
    default:
      return [];
  }
};
