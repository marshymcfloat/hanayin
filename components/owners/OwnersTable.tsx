"use client";

import { Owner, User } from "@/prisma/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Edit, Crown, ShieldCheck, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { setPrimaryOwnerAction } from "@/features/workforce/actions/owners";

type OwnerWithUser = Owner & {
  user: User;
};

interface OwnersTableProps {
  owners: OwnerWithUser[];
  onEditSpecialties: (owner: OwnerWithUser) => void;
  onEditPermissions: (owner: OwnerWithUser) => void;
}

export function OwnersTable({
  owners,
  onEditSpecialties,
  onEditPermissions,
}: OwnersTableProps) {
  const router = useRouter();

  async function handleSetPrimary(owner: OwnerWithUser) {
    const result = await setPrimaryOwnerAction(owner.id);
    if (result.success) {
      toast.success(`${owner.user.name} set as primary owner`);
      router.refresh();
    } else {
      toast.error(result.error || "Failed to set primary owner");
    }
  }
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
      {/* Mobile Card View — switched to lg:hidden so iPad portrait
          (768) still shows cards instead of the overflowing desktop
          table. */}
      <div className="lg:hidden grid grid-cols-1 gap-3">
        {owners.map((owner) => (
          <Card
            key={owner.id}
            className="bg-card rounded-2xl border border-border"
          >
            <CardContent className="p-4 space-y-4">
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 bg-primary/10 text-primary shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Crown className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                      {owner.user.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {owner.user.contact_number}
                    </p>
                    {owner.is_primary ? (
                      <Badge
                        variant="outline"
                        className="mt-1 w-fit text-[10px] h-5 px-1.5 border-amber-300 text-amber-700 bg-amber-50"
                        title="Primary owner of record"
                      >
                        <Star className="h-3 w-3 mr-0.5 fill-amber-400 text-amber-500" />
                        Primary
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">
                  Service Specialties
                </p>
                <div className="flex flex-wrap gap-1">
                  {owner.specialties.length > 0 ? (
                    owner.specialties.map((specialty) => (
                      <Badge
                        key={specialty}
                        variant="secondary"
                        className="text-xs capitalize border-primary/30 bg-primary/10 text-primary"
                      >
                        {specialty}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm italic">
                      All services
                    </span>
                  )}
                </div>
              </div>

              {/* Persistent action row — mirrors the desktop hover
                  buttons. Stays visible because mobile has no hover
                  state. */}
              <div className="grid grid-cols-3 gap-1 pt-3 border-t border-border/50">
                {!owner.is_primary ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 cursor-pointer text-xs hover:bg-amber-50 hover:text-amber-700"
                    onClick={() => handleSetPrimary(owner)}
                  >
                    <Star className="h-3.5 w-3.5 mr-1.5" />
                    Set Primary
                  </Button>
                ) : (
                  <div className="text-[10px] text-muted-foreground text-center self-center">
                    Primary owner
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 cursor-pointer text-xs hover:bg-accent/30"
                  onClick={() => onEditPermissions(owner)}
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  Permissions
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 cursor-pointer text-xs hover:bg-accent/30"
                  onClick={() => onEditSpecialties(owner)}
                >
                  <Edit className="h-3.5 w-3.5 mr-1.5" />
                  Specialties
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block rounded-2xl border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border bg-muted/50">
              <TableHead className="pl-6 h-11 w-[300px] font-semibold text-muted-foreground">Owner</TableHead>
              <TableHead className="h-11 font-semibold text-muted-foreground">Contact Number</TableHead>
              <TableHead className="h-11 font-semibold text-muted-foreground">Service Specialties</TableHead>
              <TableHead className="text-right pr-6 h-11 w-[100px] font-semibold text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {owners.map((owner) => (
              <TableRow
                key={owner.id}
                className="border-border/50 hover:bg-accent/30 transition-colors group"
              >
                <TableCell className="pl-6 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 bg-primary/10 text-primary">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                        {getInitials(owner.user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm text-foreground">
                        {owner.user.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="w-fit text-[10px] h-5 px-1.5 border-primary/30 text-primary bg-primary/10"
                        >
                          <Crown className="h-3 w-3 mr-0.5" />
                          Owner
                        </Badge>
                        {owner.is_primary ? (
                          <Badge
                            variant="outline"
                            className="w-fit text-[10px] h-5 px-1.5 border-amber-300 text-amber-700 bg-amber-50"
                            title="Primary owner of record"
                          >
                            <Star className="h-3 w-3 mr-0.5 fill-amber-400 text-amber-500" />
                            Primary
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <span className="text-sm text-muted-foreground">
                    {owner.user.contact_number}
                  </span>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex flex-wrap gap-1">
                    {owner.specialties.length > 0 ? (
                      owner.specialties.map((specialty) => (
                        <Badge
                          key={specialty}
                          variant="secondary"
                          className="text-xs capitalize border-primary/30 bg-primary/10 text-primary"
                        >
                          {specialty}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-sm italic">
                        All services
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right pr-6 py-4">
                  <div className="inline-flex items-center gap-1">
                    {!owner.is_primary ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Set as primary owner"
                        aria-label="Set as primary owner"
                        className="h-8 w-8 hover:bg-amber-50 hover:text-amber-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                        onClick={() => handleSetPrimary(owner)}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Edit permissions"
                      aria-label="Edit permissions"
                      className="h-8 w-8 hover:bg-accent/30 hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                      onClick={() => onEditPermissions(owner)}
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Edit specialties"
                      aria-label="Edit specialties"
                      className="h-8 w-8 hover:bg-accent/30 hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                      onClick={() => onEditSpecialties(owner)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
