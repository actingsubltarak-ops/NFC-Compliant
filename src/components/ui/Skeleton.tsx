import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div 
      className={`animate-pulse bg-slate-200 rounded-md ${className}`} 
      style={style}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white p-4 px-5 rounded-[24px] shadow-sm border border-slate-100 flex flex-col gap-2">
      <div className="flex justify-between items-center w-full">
        <Skeleton className="h-7 w-7 rounded-xl" />
        <Skeleton className="h-4 w-10 rounded-md" />
      </div>
      <div className="flex flex-col items-center gap-1.5 mt-1">
        <Skeleton className="h-8 w-16 rounded-md" />
        <Skeleton className="h-3.5 w-24 rounded-md" />
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 h-[450px] flex flex-col gap-6">
      <Skeleton className="h-8 w-1/3" />
      <div className="flex-1 flex items-end gap-2 px-4 pb-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton 
             key={i} 
             className="w-full" 
             style={{ height: `${Math.random() * 60 + 20}%` }} 
          />
        ))}
      </div>
    </div>
  );
}
