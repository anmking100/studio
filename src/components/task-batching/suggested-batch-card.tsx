"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Package } from "lucide-react";

interface SuggestedBatchCardProps {
  batchNumber: number;
  tasks: string[];
}

export function SuggestedBatchCard({ batchNumber, tasks }: SuggestedBatchCardProps) {
  if (tasks.length === 0) return null;

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 bg-secondary/30 dark:bg-secondary/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" />
          <div>
            <CardTitle className="text-lg font-semibold">Suggested Batch #{batchNumber}</CardTitle>
            <Badge variant="outline" className="mt-1">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {tasks.map((task, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-foreground/90">
              <CheckSquare className="h-5 w-5 mt-0.5 shrink-0 text-accent" />
              <span>{task}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
