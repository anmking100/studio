"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, KeyRound, UserCircle } from "lucide-react";
import { Logo } from "@/components/logo";

// Mock users - in a real app, this would come from a database
const mockUsers: Record<string, User> = {
  "dev@example.com": { id: "user1", name: "Developer Dave", email: "dev@example.com", role: "developer", avatarUrl: "https://placehold.co/100x100.png" },
  "hr@example.com": { id: "user2", name: "HR Hannah", email: "hr@example.com", role: "hr", avatarUrl: "https://placehold.co/100x100.png" },
};

export function LoginForm() {
  const [email, setEmail] = useState("dev@example.com");
  const [password, setPassword] = useState("password"); // Mock password
  const [role, setRole] = useState<'developer' | 'hr'>("developer");
  const [error, setError] = useState("");
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Mock authentication logic
    let foundUser: User | undefined;
    if (email === "dev@example.com" && password === "password") {
        foundUser = {...mockUsers["dev@example.com"], role: "developer" };
    } else if (email === "hr@example.com" && password === "password") {
        foundUser = {...mockUsers["hr@example.com"], role: "hr" };
    }
    
    // If user wants to login as a specific role selected in dropdown
    if (role === 'developer' && email !== "dev@example.com") {
        foundUser = { id: "user_custom_dev", name: "Custom Developer", email, role: "developer", avatarUrl: "https://placehold.co/100x100.png" };
    } else if (role === 'hr' && email !== "hr@example.com") {
         foundUser = { id: "user_custom_hr", name: "Custom HR", email, role: "hr", avatarUrl: "https://placehold.co/100x100.png" };
    }


    if (foundUser) {
      login(foundUser);
      router.push("/dashboard");
    } else {
      setError("Invalid email or password. Try dev@example.com or hr@example.com with password 'password'.");
    }
  };

  return (
    <Card className="w-full max-w-md shadow-2xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 w-fit">
          <Logo size="lg" />
        </div>
        <CardTitle className="text-3xl">Welcome Back</CardTitle>
        <CardDescription>Sign in to access your FocusFlow dashboard.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
             <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <div className="relative">
               <UserCircle className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Select value={role} onValueChange={(value: 'developer' | 'hr') => setRole(value)}>
                <SelectTrigger id="role" className="pl-10">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="hr">HR Personnel</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <p className="text-xs text-muted-foreground pt-1">Use 'dev@example.com' or 'hr@example.com' with password 'password' for pre-filled data, or any email to create a mock user with the selected role.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full text-lg py-6">
            Log In
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} FocusFlow. All rights reserved.</p>
      </CardFooter>
    </Card>
  );
}
