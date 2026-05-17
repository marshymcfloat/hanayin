"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Owner {
  id: number;
  user: {
    name: string;
    contact_number: string;
  };
  specialties: string[];
}

export function OwnersListTable({
  owners,
}: {
  owners: Owner[];
  businessSlug: string;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact Number</TableHead>
            <TableHead>Service Specialties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {owners.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-center text-muted-foreground"
              >
                No owners found
              </TableCell>
            </TableRow>
          ) : (
            owners.map((owner) => (
              <TableRow key={owner.id}>
                <TableCell className="font-medium">{owner.user.name}</TableCell>
                <TableCell>{owner.user.contact_number}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {owner.specialties.length > 0 ? (
                      owner.specialties.map((specialty) => (
                        <Badge key={specialty} variant="secondary">
                          {specialty}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        All services
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
