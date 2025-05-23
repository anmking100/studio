
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, Bot, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UserInsightsInput, UserInsightsOutput } from "@/ai/flows/user-insights-flow";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string | React.ReactNode;
  suggestions?: string[];
}

interface ChatbotWidgetProps {
  // We might pass context like current user being viewed on the report page,
  // or general team data from team overview. For now, it's general.
  pageContext?: {
    userId?: string;
    userName?: string;
    currentScore?: number;
    scoreSummary?: string;
    // Add more context as needed from the parent page
  }
}

export function ChatbotWidget({ pageContext }: ChatbotWidgetProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-bot-message",
      sender: "bot",
      text: "Hello! I'm the FocusFlow Assistant. How can I help you with user insights today?",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      text: inputValue,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Prepare input for the API
    // This is a simplified version. A real implementation would gather more context.
    // For instance, if pageContext.userId is available, you might fetch their
    // latest score and activities to provide to the AI.
    const insightsInput: UserInsightsInput = {
      userId: pageContext?.userId || "general",
      userName: pageContext?.userName || "Team Member",
      currentFragmentationScore: pageContext?.currentScore,
      currentScoreSummary: pageContext?.scoreSummary,
      question: userMessage.text as string,
      // recentActivitiesSample could be fetched or constructed if needed
    };

    try {
      const response = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(insightsInput),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response from assistant.");
      }

      const botResponseData: UserInsightsOutput = await response.json();
      const botMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "bot",
        text: botResponseData.answer,
        suggestions: botResponseData.suggestions,
      };
      setMessages((prev) => [...prev, botMessage]);

    } catch (error: any) {
      console.error("Chatbot API error:", error);
      toast({
        title: "Error",
        description: error.message || "Could not connect to the assistant.",
        variant: "destructive",
      });
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "bot",
        text: "Sorry, I encountered an error. Please try again later.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="default"
        size="icon"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90 text-primary-foreground"
        onClick={() => setIsDialogOpen(true)}
        aria-label="Open Chatbot"
      >
        <MessageSquare className="h-7 w-7" />
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] h-[70vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-6 w-6 text-primary" />
              FocusFlow Assistant
            </DialogTitle>
            <DialogDescription>
              Ask about user focus, fragmentation, or for suggestions.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-grow p-6 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 mb-4 ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.sender === "bot" && (
                  <Avatar className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded-full">
                    <Bot size={18} />
                  </Avatar>
                )}
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-muted text-foreground rounded-bl-none"
                  }`}
                >
                  <p>{msg.text}</p>
                  {msg.sender === "bot" && msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-border/50">
                      <p className="font-medium text-xs mb-1">Suggestions:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {msg.suggestions.map((s, i) => (
                          <li key={i} className="text-xs">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                 {msg.sender === "user" && (
                  <Avatar className="h-8 w-8 bg-secondary text-secondary-foreground flex items-center justify-center rounded-full">
                    <User size={18} />
                  </Avatar>
                )}
              </div>
            ))}
             {isLoading && (
              <div className="flex justify-start gap-3 mb-4">
                <Avatar className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded-full">
                  <Bot size={18} />
                </Avatar>
                <div className="max-w-[75%] rounded-xl px-4 py-2.5 text-sm bg-muted text-foreground rounded-bl-none animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="p-4 border-t bg-background">
            <div className="flex w-full items-center space-x-2">
              <Input
                id="chat-input"
                placeholder="Type your question..."
                className="flex-1"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    handleSendMessage();
                  }
                }}
                disabled={isLoading}
              />
              <Button type="submit" size="icon" onClick={handleSendMessage} disabled={isLoading || !inputValue.trim()}>
                <Send className="h-5 w-5" />
                <span className="sr-only">Send</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Helper for Avatar placeholder, can be moved to a utils file if needed
const Avatar = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex items-center justify-center", className)}>
    {children}
  </div>
);
const cn = (...inputs: any[]) => inputs.filter(Boolean).join(" ");
