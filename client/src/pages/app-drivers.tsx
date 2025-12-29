import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, Phone, Calendar, Loader2, Package } from "lucide-react";
import { format } from "date-fns";

interface DriverWithStats {
  id: string;
  phone: string;
  createdAt: string;
  totalLoads: number;
  activeLoads: number;
}

export default function AppDrivers() {
  const { data: driversData, isLoading, error } = useQuery<{ drivers: DriverWithStats[] }>({
    queryKey: ["/api/drivers"],
    queryFn: async () => {
      const res = await fetch("/api/drivers", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login";
          throw new Error("Unauthorized");
        }
        throw new Error("Failed to fetch drivers");
      }
      return res.json();
    },
  });

  const drivers = driversData?.drivers || [];

  return (
    <AppLayout>
      <div className="min-h-screen p-6 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Truck className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-wide" data-testid="text-drivers-title">DRIVERS</h1>
            <p className="text-muted-foreground text-sm">
              View drivers associated with your loads
            </p>
          </div>
        </div>

        <Card className="border-primary/20 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Driver List
            </CardTitle>
            <CardDescription>
              Drivers who have been assigned to your loads
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12" data-testid="loading-drivers">
                <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
                <span className="text-muted-foreground">Loading drivers...</span>
              </div>
            ) : error ? (
              <div className="text-center py-12 text-destructive" data-testid="error-drivers">
                Failed to load drivers. Please try again.
              </div>
            ) : drivers.length === 0 ? (
              <div className="text-center py-12" data-testid="empty-drivers">
                <Truck className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No drivers yet</p>
                <p className="text-sm text-muted-foreground/70 mt-2">
                  Drivers will appear here once they are assigned to your loads.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          Phone
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Package className="w-4 h-4" />
                          Total Loads
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Truck className="w-4 h-4" />
                          Active Loads
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          First Assigned
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drivers.map((driver) => (
                      <TableRow key={driver.id} data-testid={`row-driver-${driver.id}`}>
                        <TableCell className="font-mono" data-testid={`text-phone-${driver.id}`}>
                          {driver.phone}
                        </TableCell>
                        <TableCell data-testid={`text-total-loads-${driver.id}`}>
                          {driver.totalLoads}
                        </TableCell>
                        <TableCell data-testid={`text-active-loads-${driver.id}`}>
                          <span className={driver.activeLoads > 0 ? "text-primary font-semibold" : ""}>
                            {driver.activeLoads}
                          </span>
                        </TableCell>
                        <TableCell data-testid={`text-created-${driver.id}`}>
                          {format(new Date(driver.createdAt), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
