import { UiSkeleton } from "@/components/ui/UiSkeleton";

export function CardsSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {Array.from({ length: 8 }, (_, i) => (
        <UiSkeleton key={i} heightClass="h-64" />
      ))}
    </div>
  );
}
