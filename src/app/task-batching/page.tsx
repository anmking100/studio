"use client";

import { useState } from "react";
import { TaskInputForm } from "@/components/task-batching/task-input-form";
import { SuggestedBatchCard } from "@/components/task-batching/suggested-batch-card";
import { suggestTaskBatching, type SuggestTaskBatchingOutput } from "@/ai/flows/suggest-task-batching";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageSearch, Info, Loader2 } from "lucide-react";
import Image from "next/image";

export default function TaskBatchingPage() {
  const [suggestedBatches, setSuggestedBatches] = useState<string[][] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleTaskSubmit = async (tasks: string[]) => {
    setIsLoading(true);
    setError(null);
    setSuggestedBatches(null);
    try {
      const result: SuggestTaskBatchingOutput = await suggestTaskBatching({ taskDescriptions: tasks });
      if (result.suggestedBatches && result.suggestedBatches.length > 0) {
        setSuggestedBatches(result.suggestedBatches);
         toast({
          title: "Task Batches Suggested!",
          description: "AI has analyzed your tasks and suggested batches.",
        });
      } else {
        setSuggestedBatches([]); // Explicitly set to empty array for "no suggestions" state
        toast({
          title: "No Specific Batches Found",
          description: "The AI couldn't find distinct batches for these tasks. They might be too diverse or too few.",
          variant: "default",
        });
      }
    } catch (err) {
      console.error("Error suggesting task batches:", err);
      setError("Failed to get task batching suggestions. Please try again.");
       toast({
        title: "Error",
        description: "Could not fetch task batching suggestions.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary via-indigo-600 to-accent p-6 md:p-8">
           <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-3xl font-bold text-primary-foreground">AI Task Batching</CardTitle>
              <CardDescription className="text-lg text-primary-foreground/80 mt-1">
                Group similar tasks to boost your productivity and focus.
              </CardDescription>
            </div>
            <Image 
              src="https://placehold.co/300x150.png" 
              alt="Task organization illustration" 
              width={150} 
              height={75} 
              className="rounded-lg mt-4 md:mt-0 opacity-80"
              data-ai-hint="task organization"
            />
          </div>
        </CardHeader>
      </Card>
      
      <TaskInputForm onSubmit={handleTaskSubmit} isLoading={isLoading} />

      {isLoading && (
        <Card className="mt-6 shadow-md">
          <CardContent className="p-6 flex flex-col items-center justify-center min-h-[200px]">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-semibold text-foreground">AI is thinking...</p>
            <p className="text-muted-foreground">Generating task batch suggestions for you.</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive" className="mt-6 shadow-md">
          <PackageSearch className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {suggestedBatches && !isLoading && !error && (
        <div className="mt-8">
          <h2 className="text-2xl font-semibold mb-4 text-foreground flex items-center">
            <PackageSearch className="h-7 w-7 mr-2 text-primary" />
            Suggested Task Batches
          </h2>
          {suggestedBatches.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {suggestedBatches.map((batch, index) => (
                <SuggestedBatchCard key={index} batchNumber={index + 1} tasks={batch} />
              ))}
            </div>
          ) : (
            <Alert className="shadow-md">
              <Info className="h-5 w-5" />
              <AlertTitle>No Specific Batches Suggested</AlertTitle>
              <AlertDescription>
                The AI couldn't identify clear batches for the tasks provided. Try adding more tasks or making descriptions more specific.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
