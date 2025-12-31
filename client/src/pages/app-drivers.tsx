import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Truck, Phone, Calendar, Loader2, Plus, Search, Star, Ban, Edit, Percent, Package } from "lucide-react";
import { format } from "date-fns";

interface Driver {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  truckNumber: string | null;
  equipmentType: string | null;
  tags: string[];
  isFavorite: boolean;
  isBlocked: boolean;
  statsTotalLoads: number;
  statsOnTimeLoads: number;
  statsLateLoads: number;
  onTimePercent: number | null;
  createdAt: string;
}

interface DriversResponse {
  items: Driver[];
  page: number;
  limit: number;
  total: number;
}

export default function AppDrivers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    truckNumber: "",
    equipmentType: "",
    tags: "",
    isFavorite: false,
    isBlocked: false,
  });

  const { data: driversData, isLoading, error } = useQuery<DriversResponse>({
    queryKey: ["/api/drivers", search, showFavorites, showBlocked],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (showFavorites) params.set("favorite", "true");
      if (showBlocked) params.set("blocked", "true");
      params.set("limit", "50");
      
      const res = await fetch(`/api/drivers?${params.toString()}`, { credentials: "include" });
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

  const createDriverMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...data,
          tags: data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      if (!res.ok) throw new Error("Failed to create driver");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
      setIsAddDialogOpen(false);
      resetForm();
    },
  });

  const updateDriverMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await fetch(`/api/drivers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...data,
          tags: data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      if (!res.ok) throw new Error("Failed to update driver");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
      setEditingDriver(null);
      resetForm();
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      truckNumber: "",
      equipmentType: "",
      tags: "",
      isFavorite: false,
      isBlocked: false,
    });
  };

  const openEditDialog = (driver: Driver) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name || "",
      phone: driver.phone,
      email: driver.email || "",
      truckNumber: driver.truckNumber || "",
      equipmentType: driver.equipmentType || "",
      tags: driver.tags?.join(", ") || "",
      isFavorite: driver.isFavorite,
      isBlocked: driver.isBlocked,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDriver) {
      updateDriverMutation.mutate({ id: editingDriver.id, data: formData });
    } else {
      createDriverMutation.mutate(formData);
    }
  };

  const drivers = driversData?.items || [];

  return (
    <AppLayout>
      <div className="min-h-screen p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Truck className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-wide" data-testid="text-drivers-title">DRIVERS</h1>
              <p className="text-muted-foreground text-sm">
                Manage your drivers and view performance stats
              </p>
            </div>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-driver">
            <Plus className="w-4 h-4 mr-2" />
            Add Driver
          </Button>
        </div>

        <Card className="border-primary/20 bg-card/50 backdrop-blur">
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, phone, email, truck..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-drivers"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={showFavorites}
                    onCheckedChange={setShowFavorites}
                    data-testid="switch-favorites"
                  />
                  <span className="text-sm flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500" />
                    Favorites
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={showBlocked}
                    onCheckedChange={setShowBlocked}
                    data-testid="switch-blocked"
                  />
                  <span className="text-sm flex items-center gap-1">
                    <Ban className="w-4 h-4 text-destructive" />
                    Blocked
                  </span>
                </label>
              </div>
            </div>
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
                <p className="text-muted-foreground">No drivers found</p>
                <p className="text-sm text-muted-foreground/70 mt-2">
                  Add your first driver to get started.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          Phone
                        </div>
                      </TableHead>
                      <TableHead>Equipment</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Package className="w-4 h-4" />
                          Loads
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Percent className="w-4 h-4" />
                          On-Time
                        </div>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drivers.map((driver) => (
                      <TableRow key={driver.id} data-testid={`row-driver-${driver.id}`}>
                        <TableCell className="font-medium" data-testid={`text-name-${driver.id}`}>
                          <div className="flex items-center gap-2">
                            {driver.isFavorite && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                            {driver.name || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono" data-testid={`text-phone-${driver.id}`}>
                          {driver.phone}
                        </TableCell>
                        <TableCell data-testid={`text-equipment-${driver.id}`}>
                          {driver.equipmentType || "-"}
                        </TableCell>
                        <TableCell data-testid={`text-tags-${driver.id}`}>
                          <div className="flex flex-wrap gap-1">
                            {driver.tags?.map((tag, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                            )) || "-"}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-total-loads-${driver.id}`}>
                          {driver.statsTotalLoads}
                        </TableCell>
                        <TableCell data-testid={`text-ontime-${driver.id}`}>
                          {driver.onTimePercent !== null ? (
                            <span className={driver.onTimePercent >= 90 ? "text-green-500" : driver.onTimePercent >= 70 ? "text-yellow-500" : "text-destructive"}>
                              {driver.onTimePercent}%
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {driver.isBlocked ? (
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                              <Ban className="w-3 h-3" />
                              Blocked
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-500 border-green-500">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(driver)}
                            data-testid={`button-edit-${driver.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isAddDialogOpen || !!editingDriver} onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setEditingDriver(null);
            resetForm();
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingDriver ? "Edit Driver" : "Add Driver"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                  data-testid="input-driver-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 555 123 4567"
                  required
                  data-testid="input-driver-phone"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="driver@example.com"
                  data-testid="input-driver-email"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="truckNumber">Truck Number</Label>
                  <Input
                    id="truckNumber"
                    value={formData.truckNumber}
                    onChange={(e) => setFormData({ ...formData, truckNumber: e.target.value })}
                    placeholder="T-1234"
                    data-testid="input-driver-truck"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="equipmentType">Equipment</Label>
                  <Input
                    id="equipmentType"
                    value={formData.equipmentType}
                    onChange={(e) => setFormData({ ...formData, equipmentType: e.target.value })}
                    placeholder="Dry Van"
                    data-testid="input-driver-equipment"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="reefer, team, hazmat"
                  data-testid="input-driver-tags"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={formData.isFavorite}
                    onCheckedChange={(checked) => setFormData({ ...formData, isFavorite: checked })}
                    data-testid="switch-driver-favorite"
                  />
                  <span className="text-sm flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500" />
                    Favorite
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={formData.isBlocked}
                    onCheckedChange={(checked) => setFormData({ ...formData, isBlocked: checked })}
                    data-testid="switch-driver-blocked"
                  />
                  <span className="text-sm flex items-center gap-1">
                    <Ban className="w-4 h-4 text-destructive" />
                    Blocked
                  </span>
                </label>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setEditingDriver(null);
                    resetForm();
                  }}
                  data-testid="button-cancel-driver"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createDriverMutation.isPending || updateDriverMutation.isPending}
                  data-testid="button-save-driver"
                >
                  {(createDriverMutation.isPending || updateDriverMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingDriver ? "Save Changes" : "Add Driver"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
