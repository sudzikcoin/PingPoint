import { addDays, subDays, format } from "date-fns";

export type LoadStatus = "CREATED" | "DISPATCHED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
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
}

export interface Load {
  id: string;
  externalLoadId: string;
  brokerName: string;
  status: LoadStatus;
  rateAmount: number;
  stops: Stop[];
  lastLocationCity?: string;
  lastLocationState?: string;
  lastLocationAt?: string;
}

const TODAY = new Date();

export const MOCK_LOADS: Load[] = [
  {
    id: "ld_cuid123456",
    externalLoadId: "LD-2025-001",
    brokerName: "Soar Transportation Group",
    status: "IN_TRANSIT",
    rateAmount: 1250.00,
    lastLocationCity: "Ogden",
    lastLocationState: "UT",
    lastLocationAt: new Date().toISOString(),
    stops: [
      {
        id: "stop_1",
        type: "PICKUP",
        sequence: 1,
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
    status: "CREATED",
    rateAmount: 850.00,
    stops: [
      {
        id: "stop_3",
        type: "PICKUP",
        sequence: 1,
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
    status: "DELIVERED",
    rateAmount: 2100.00,
    lastLocationCity: "Denver",
    lastLocationState: "CO",
    lastLocationAt: subDays(TODAY, 5).toISOString(),
    stops: [
      {
        id: "stop_5",
        type: "PICKUP",
        sequence: 1,
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

export const getLoadById = (id: string) => MOCK_LOADS.find((l) => l.id === id);

export const getLoadsByView = (view: "today" | "history" | "upcoming") => {
  switch (view) {
    case "today":
      return MOCK_LOADS.filter((l) => l.status === "IN_TRANSIT" || l.status === "DISPATCHED");
    case "upcoming":
      return MOCK_LOADS.filter((l) => l.status === "CREATED");
    case "history":
      return MOCK_LOADS.filter((l) => l.status === "DELIVERED" || l.status === "CANCELLED");
    default:
      return [];
  }
};
