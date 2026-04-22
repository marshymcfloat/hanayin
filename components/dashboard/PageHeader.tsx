import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";

interface PageHeaderProps {
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}

interface PageHeaderActionProps {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  variant?: "default" | "outline" | "secondary" | "ghost";
}

export function PageHeader({
  title,
  description,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="space-y-0.5">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 mt-3 sm:mt-0 flex-wrap">
          {children}
        </div>
      )}
    </div>
  );
}

export function PageHeaderAction({
  label,
  href,
  onClick,
  icon: Icon = Plus,
  variant = "default",
}: PageHeaderActionProps) {
  const content = (
    <>
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">Add</span>
    </>
  );

  if (href) {
    return (
      <Button asChild variant={variant} size="sm" className="cursor-pointer">
        <Link href={href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button onClick={onClick} variant={variant} size="sm" className="cursor-pointer">
      {content}
    </Button>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-[180px]" />
        <Skeleton className="h-4 w-[260px]" />
      </div>
      <div className="flex items-center gap-2 mt-3 sm:mt-0">
        <Skeleton className="h-8 w-[100px] rounded-lg" />
      </div>
    </div>
  );
}
