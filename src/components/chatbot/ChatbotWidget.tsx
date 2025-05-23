
"use client";

import { useState, useEffect, useRef } from "react";
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
import { MessageSquare, Send, Bot, User, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UserInsightsInput, UserInsightsOutput } from "@/ai/flows/user-insights-flow";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string | React.ReactNode; // Keep ReactNode for potential rich content, but stringify for localStorage
  suggestions?: string[];
}

interface ChatbotWidgetProps {
  pageContext?: {
    userId?: string;
    userName?: string;
    currentScore?: number;
    scoreSummary?: string;
  }
}

const CHAT_STORAGE_KEY = "focusflow.chatbotMessages";
const MAX_HISTORY_LENGTH = 50; // Limit the number of messages stored

const initialBotMessage: ChatMessage = {
  id: "initial-bot-message",
  sender: "bot",
  text: "Hello! I'm the FocusFlow Assistant. How can I help you with user insights today?",
};

export function ChatbotWidget({ pageContext }: ChatbotWidgetProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Load messages from localStorage on initial load
    if (typeof window !== 'undefined') {
      try {
        const storedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
        if (storedMessages) {
          const parsedMessages = JSON.parse(storedMessages) as ChatMessage[];
          // Ensure 'text' is always a string if it was stringified
          return parsedMessages.map(msg => ({ ...msg, text: String(msg.text) }));
        }
      } catch (error) {
        console.error("Error loading chat messages from localStorage:", error);
      }
    }
    return [initialBotMessage];
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Only store string versions of 'text' for simplicity with JSON
        const messagesToStore = messages.map(msg => ({
          ...msg,
          text: typeof msg.text === 'string' ? msg.text : 'Complex message content' // Placeholder for non-string
        })).slice(-MAX_HISTORY_LENGTH); // Keep only the last N messages
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesToStore));
      } catch (error) {
        console.error("Error saving chat messages to localStorage:", error);
      }
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessageText = inputValue.trim();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      text: userMessageText,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    const insightsInput: UserInsightsInput = {
      userId: pageContext?.userId || "general_focus_flow_user", // Use a more specific default ID
      userName: pageContext?.userName || "User",
      currentFragmentationScore: pageContext?.currentScore,
      currentScoreSummary: pageContext?.scoreSummary,
      question: userMessageText,
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

  const handleClearChatHistory = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    }
    setMessages([initialBotMessage]);
    toast({
      title: "Chat History Cleared",
      description: "Your chat history has been cleared.",
    });
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
          <DialogHeader className="p-4 pb-2 border-b flex flex-row justify-between items-center">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              <DialogTitle className="text-lg">
                FocusFlow Assistant
              </DialogTitle>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleClearChatHistory} aria-label="Clear chat history">
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Clear Chat History</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogHeader>
          <DialogDescription className="px-4 text-xs text-muted-foreground">
            Ask about user focus, fragmentation, or for suggestions.
          </DialogDescription>

          <ScrollArea className="flex-grow p-4 space-y-4" ref={scrollAreaRef}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 mb-4 ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.sender === "bot" && (
                  <AvatarContainer className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded-full">
                    <Bot size={18} />
                  </AvatarContainer>
                )}
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm shadow-sm ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-muted text-foreground rounded-bl-none"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}</p>
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
                  <AvatarContainer className="h-8 w-8 bg-secondary text-secondary-foreground flex items-center justify-center rounded-full">
                    <User size={18} />
                  </AvatarContainer>
                )}
              </div>
            ))}
             {isLoading && (
              <div className="flex justify-start gap-3 mb-4">
                <AvatarContainer className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded-full">
                  <Bot size={18} />
                </AvatarContainer>
                <div className="max-w-[75%] rounded-xl px-4 py-2.5 text-sm bg-muted text-foreground rounded-bl-none animate-pulse shadow-sm">
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

// Helper for Avatar placeholder, to avoid conflict with ShadCN Avatar if used elsewhere
const AvatarContainer = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex items-center justify-center shrink-0", className)}>
    {children}
  </div>
);

// Importing Tooltip related components that were missing for clear history button
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
