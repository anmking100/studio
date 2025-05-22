"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TaskInputFormProps {
  onSubmit: (tasks: string[]) => Promise<void>;
  isLoading: boolean;
}

export function TaskInputForm({ onSubmit, isLoading }: TaskInputFormProps) {
  const [taskInput, setTaskInput] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim()) {
      toast({
        title: "No Tasks Entered",
        description: "Please enter some task descriptions, one per line.",
        variant: "destructive",
      });
      return;
    }
    const tasks = taskInput.split("\n").map(task => task.trim()).filter(task => task.length > 0);
    if (tasks.length === 0) {
      toast({
        title: "No Valid Tasks",
        description: "Please ensure tasks are entered correctly, one per line.",
        variant: "destructive",
      });
      return;
    }
    await onSubmit(tasks);
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">Describe Your Tasks</CardTitle>
          <Wand2 className="h-6 w-6 text-primary" />
        </div>
        <CardDescription>
          Enter your tasks, one per line. Our AI will suggest how to batch similar tasks for better focus.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="grid w-full gap-2">
            <Label htmlFor="task-descriptions" className="sr-only">Task Descriptions</Label>
            <Textarea
              id="task-descriptions"
              placeholder="E.g.,&#10;- Write blog post about new feature X&#10;- Email client about project update&#10;- Fix bug in user authentication"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              rows={8}
              className="resize-none text-base"
              disabled={isLoading}
            />
            <p className="text-sm text-muted-foreground">
              Tip: Be specific for better suggestions. Aim for 3-10 tasks.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full md:w-auto" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Suggesting Batches...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Suggest Task Batches
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
