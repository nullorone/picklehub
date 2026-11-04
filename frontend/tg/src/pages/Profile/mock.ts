import { Achievement, RecentMatch, UserProfile, UserStats } from "./types.ts";

export const userProfile: UserProfile = {
    name: "Alex Johnson",
    email: "alex.johnson@email.com",
    joinDate: "March 2024",
    profileImage: null,
    bio: "Passionate pickleball player who loves the competitive spirit and community aspect of the game.",
    favoritePosition: "Doubles - Left Side",
    hometown: "Portland, OR",
};

export const userStats: UserStats = {
    gamesPlayed: 47,
    gamesWon: 32,
    winRate: 68,
    currentStreak: 3,
    bestStreak: 7,
    averageScore: 9.2,
    totalPoints: 432,
    tournamentsEntered: 5,
    tournamentsWon: 1,
    clubsJoined: 2,
    dupr: "3.0",
    ranking: 1847,
};

export const achievements: Achievement[] = [
    {
        id: 1,
        title: "First Victory",
        description: "Win your first game",
        icon: "🏆",
        earned: true,
        earnedDate: "March 15, 2024",
    },
    {
        id: 2,
        title: "Tournament Champion",
        description: "Win a tournament",
        icon: "👑",
        earned: true,
        earnedDate: "April 2, 2024",
    },
    {
        id: 3,
        title: "Streak Master",
        description: "Win 5 games in a row",
        icon: "🔥",
        earned: true,
        earnedDate: "April 10, 2024",
    },
    {
        id: 4,
        title: "Century Club",
        description: "Score 100 total points",
        icon: "💯",
        earned: true,
        earnedDate: "April 15, 2024",
    },
    {
        id: 5,
        title: "Social Butterfly",
        description: "Join 3 different clubs",
        icon: "🦋",
        earned: false,
    },
    {
        id: 6,
        title: "Perfect Game",
        description: "Win a game 11-0",
        icon: "⭐",
        earned: false,
    },
];

export const recentMatches: RecentMatch[] = [
    {
        id: 1,
        opponent: "Sarah M. & Mike R.",
        score: "11-8, 7-11, 11-6",
        result: "win",
        date: "Today",
        tournament: "Spring League",
    },
    {
        id: 2,
        opponent: "Tom H.",
        score: "11-9, 11-7",
        result: "win",
        date: "Yesterday",
    },
    {
        id: 3,
        opponent: "Lisa K. & Emma W.",
        score: "6-11, 11-9, 8-11",
        result: "loss",
        date: "2 days ago",
    },
    {
        id: 4,
        opponent: "Chris B.",
        score: "11-5, 11-3",
        result: "win",
        date: "3 days ago",
        tournament: "Weekend Cup",
    },
];
