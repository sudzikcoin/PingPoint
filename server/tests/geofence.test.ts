import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase, createTestBroker, createTestDriver, createTestLoad, createTestStop } from "./utils/dbTestUtils";
import { haversineMeters, isInsideGeofence, isOutsideWithHysteresis, evaluateGeofencesForActiveLoad } from "../geofence";
import { db } from "../db";
import { stops, stopGeofenceState } from "@shared/schema";
import { eq } from "drizzle-orm";

describe("Geofence Logic", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe("haversineMeters", () => {
    it("should calculate distance between two points", () => {
      const lat1 = 32.7767;
      const lng1 = -96.7970;
      const lat2 = 32.7868;
      const lng2 = -96.7980;
      
      const distance = haversineMeters(lat1, lng1, lat2, lng2);
      
      expect(distance).toBeGreaterThan(1000);
      expect(distance).toBeLessThan(1200);
    });

    it("should return 0 for same point", () => {
      const lat = 32.7767;
      const lng = -96.7970;
      
      const distance = haversineMeters(lat, lng, lat, lng);
      
      expect(distance).toBe(0);
    });
  });

  describe("isInsideGeofence", () => {
    it("should return true when inside radius", () => {
      expect(isInsideGeofence(100, 300)).toBe(true);
      expect(isInsideGeofence(300, 300)).toBe(true);
    });

    it("should return false when outside radius", () => {
      expect(isInsideGeofence(301, 300)).toBe(false);
      expect(isInsideGeofence(500, 300)).toBe(false);
    });
  });

  describe("isOutsideWithHysteresis", () => {
    it("should return false when barely outside", () => {
      expect(isOutsideWithHysteresis(310, 300)).toBe(false);
    });

    it("should return true when well outside hysteresis zone", () => {
      expect(isOutsideWithHysteresis(500, 300)).toBe(true);
    });

    it("should use minimum 100m hysteresis", () => {
      expect(isOutsideWithHysteresis(210, 100)).toBe(true);
      expect(isOutsideWithHysteresis(190, 100)).toBe(false);
    });
  });

  describe("evaluateGeofencesForActiveLoad", () => {
    it("should not auto-arrive with single ping inside geofence", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const driver = await createTestDriver();
      const load = await createTestLoad({ brokerId: broker.id, driverId: driver.id });
      
      const stopLat = "32.7767";
      const stopLng = "-96.7970";
      await createTestStop({
        loadId: load.id,
        type: "PICKUP",
        sequence: 1,
        lat: stopLat,
        lng: stopLng,
        geofenceRadiusM: 300,
      });

      await evaluateGeofencesForActiveLoad(driver.id, load.id, 32.7767, -96.7970);

      const [stop] = await db.select().from(stops).where(eq(stops.loadId, load.id));
      expect(stop.arrivedAt).toBeNull();
    });

    it("should auto-arrive after 2 consecutive pings inside geofence", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const driver = await createTestDriver();
      const load = await createTestLoad({ brokerId: broker.id, driverId: driver.id });
      
      const stopLat = "32.7767";
      const stopLng = "-96.7970";
      await createTestStop({
        loadId: load.id,
        type: "PICKUP",
        sequence: 1,
        lat: stopLat,
        lng: stopLng,
        geofenceRadiusM: 300,
      });

      await evaluateGeofencesForActiveLoad(driver.id, load.id, 32.7767, -96.7970);
      await evaluateGeofencesForActiveLoad(driver.id, load.id, 32.7768, -96.7971);

      const [stop] = await db.select().from(stops).where(eq(stops.loadId, load.id));
      expect(stop.arrivedAt).not.toBeNull();
    });

    it("should not auto-arrive for stops without coordinates", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const driver = await createTestDriver();
      const load = await createTestLoad({ brokerId: broker.id, driverId: driver.id });
      
      await createTestStop({
        loadId: load.id,
        type: "PICKUP",
        sequence: 1,
      });

      await evaluateGeofencesForActiveLoad(driver.id, load.id, 32.7767, -96.7970);
      await evaluateGeofencesForActiveLoad(driver.id, load.id, 32.7768, -96.7971);

      const [stop] = await db.select().from(stops).where(eq(stops.loadId, load.id));
      expect(stop.arrivedAt).toBeNull();
    });

    it("should skip stops that have already departed", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const driver = await createTestDriver();
      const load = await createTestLoad({ brokerId: broker.id, driverId: driver.id });
      
      const stopLat = "32.7767";
      const stopLng = "-96.7970";
      const [stop] = await db.insert(stops).values({
        loadId: load.id,
        type: "PICKUP",
        sequence: 1,
        name: "Test Location",
        fullAddress: "123 Test St",
        city: "Test City",
        state: "TX",
        lat: stopLat,
        lng: stopLng,
        geofenceRadiusM: 300,
        arrivedAt: new Date(Date.now() - 3600000),
        departedAt: new Date(),
      }).returning();

      await evaluateGeofencesForActiveLoad(driver.id, load.id, 32.7767, -96.7970);
      await evaluateGeofencesForActiveLoad(driver.id, load.id, 32.7768, -96.7971);

      const [updatedStop] = await db.select().from(stops).where(eq(stops.id, stop.id));
      expect(updatedStop.departedAt).toBeDefined();
    });

    it("should reset inside streak when moving outside", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const driver = await createTestDriver();
      const load = await createTestLoad({ brokerId: broker.id, driverId: driver.id });
      
      const stopLat = "32.7767";
      const stopLng = "-96.7970";
      await createTestStop({
        loadId: load.id,
        type: "PICKUP",
        sequence: 1,
        lat: stopLat,
        lng: stopLng,
        geofenceRadiusM: 300,
      });

      await evaluateGeofencesForActiveLoad(driver.id, load.id, 32.7767, -96.7970);
      await evaluateGeofencesForActiveLoad(driver.id, load.id, 32.9, -96.9);

      const [stop] = await db.select().from(stops).where(eq(stops.loadId, load.id));
      expect(stop.arrivedAt).toBeNull();
    });
  });
});
