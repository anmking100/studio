"use client";

import { useEffect, useState } from "react";
import type { FragmentationDataPoint } from "@/lib/types";
import { detectFragmentationAnomalies, type DetectFragmentationAnomaliesOutput } from "@/ai/flows/detect-fragmentation-anomalies";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Info, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AnomalyAlertProps {
  fragmentationScores: FragmentationDataPoint[];
}

export function AnomalyAlert({ fragmentationScores }: AnomalyAlertProps) {
  const [anomalyResult, setAnomalyResult] = useState<DetectFragmentationAnomaliesOutput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fragmentationScores && fragmentationScores.length > 0) {
      const scores = fragmentationScores.map(s => s.score);
      setIsLoading(true);
      setError(null);
      detectFragmentationAnomalies({ fragmentationScores: scores, threshold: 2.0 })
        .then(result => {
          setAnomalyResult(result);
        })
        .catch(err => {
          console.error("Error detecting anomalies:", err);
          setError("Failed to analyze fragmentation data. Please try again later.");
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, [fragmentationScores]);

  if (isLoading) {
    return (
      <Alert className="bg-card border-border shadow-md">
        <Info className="h-5 w-5" />
        <AlertTitle className="font-semibold">Analyzing Focus Data</AlertTitle>
        <AlertDescription className="flex items-center">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Checking for any significant changes in your fragmentation score...
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="shadow-md">
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle className="font-semibold">Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  
  if (!anomalyResult || (anomalyResult && !anomalyResult.isAnomaly)) {
    return (
       <Alert className="bg-card border-green-500/50 text-green-700 dark:border-green-400/50 dark:text-green-400 shadow-md">
        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-500" />
        <AlertTitle className="font-semibold text-green-700 dark:text-green-400">Focus Stability Normal</AlertTitle>
        <AlertDescription className="text-green-600 dark:text-green-500">
          No significant anomalies detected in your recent fragmentation scores. Keep up the great work!
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive" className="shadow-lg border-destructive/70">
      <AlertTriangle className="h-5 w-5" />
      <AlertTitle className="text-lg font-bold">Anomaly Detected!</AlertTitle>
      <AlertDescription>
        <p className="mb-2">{anomalyResult.message}</p>
        {anomalyResult.anomalyIndex !== undefined && fragmentationScores[anomalyResult.anomalyIndex] && (
           <p className="text-sm">
            The anomaly occurred on <strong className="font-semibold">{new Date(fragmentationScores[anomalyResult.anomalyIndex].date).toLocaleDateString()}</strong>.
          </p>
        )}
        <p className="mt-3 text-sm">
          Consider reviewing your activities around this period to identify potential causes for increased fragmentation.
        </p>
        <Button variant="outline" size="sm" className="mt-4 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive">
            View Details (coming soon)
        </Button>
      </AlertDescription>
    </Alert>
  );
}
