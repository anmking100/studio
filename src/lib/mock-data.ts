import type { FragmentationDataPoint, TeamMemberFocus, Task } from "@/lib/types";
import type { ChartConfig } from "@/components/ui/chart";


export const mockFragmentationScores: FragmentationDataPoint[] = [
  { date: "2024-07-01", score: 1.5 },
  { date: "2024-07-02", score: 1.8 },
  { date: "2024-07-03", score: 1.6 },
  { date: "2024-07-04", score: 2.1 },
  { date: "2024-07-05", score: 1.9 },
  { date: "2024-07-06", score: 2.5 },
  { date: "2024-07-07", score: 2.2 },
  { date: "2024-07-08", score: 1.7 },
  { date: "2024-07-09", score: 3.8 }, // Potential anomaly
  { date: "2024-07-10", score: 2.0 },
  { date: "2024-07-11", score: 1.9 },
  { date: "2024-07-12", score: 2.3 },
  { date: "2024-07-13", score: 2.1 },
  { date: "2024-07-14", score: 1.8 },
];

export const mockCurrentFragmentationScore = mockFragmentationScores.length > 0 ? mockFragmentationScores.slice(-1)[0].score : 2.0;

export const mockTeamData: TeamMemberFocus[] = [
  { id: "dev1", name: "Alice Wonderland", email: "alice@example.com", role: "developer", fragmentationScore: 1.8, lastWeekTrend: -0.2, overloadStatus: "Stable", avatarUrl: "https://placehold.co/100x100.png?text=AW" },
  { id: "dev2", name: "Bob The Builder", email: "bob@example.com", role: "developer", fragmentationScore: 2.5, lastWeekTrend: 0.5, overloadStatus: "At Risk", avatarUrl: "https://placehold.co/100x100.png?text=BB" },
  { id: "dev3", name: "Charlie Brown", email: "charlie@example.com", role: "developer", fragmentationScore: 3.5, lastWeekTrend: 1.1, overloadStatus: "Overloaded", avatarUrl: "https://placehold.co/100x100.png?text=CB" },
  { id: "dev4", name: "Diana Prince", email: "diana@example.com", role: "developer", fragmentationScore: 1.5, lastWeekTrend: -0.5, overloadStatus: "Stable", avatarUrl: "https://placehold.co/100x100.png?text=DP" },
  { id: "dev5", name: "Edward Scissorhands", email: "edward@example.com", role: "developer", fragmentationScore: 2.9, lastWeekTrend: 0.1, overloadStatus: "At Risk", avatarUrl: "https://placehold.co/100x100.png?text=ES" },
];

export const mockTasks: Task[] = [
  { id: "task1", description: "Implement user authentication module" },
  { id: "task2", description: "Design database schema for new feature" },
  { id: "task3", description: "Write unit tests for API endpoints" },
  { id: "task4", description: "Refactor user profile page styling" },
  { id: "task5", description: "Create CI/CD pipeline for deployment" },
  { id: "task6", description: "Review pull request for authentication fixes" },
  { id: "task7", description: "Update documentation for user authentication flow" },
];

// Data for charts - ensure it matches ChartConfig structure if used directly
export const chartData = mockFragmentationScores.map(d => ({
  date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  score: d.score,
}));

export const chartConfig = {
  score: {
    label: "Fragmentation Score",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

