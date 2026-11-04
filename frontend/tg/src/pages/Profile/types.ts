export interface UserProfile {
    name: string;
    email: string;
    joinDate: string;
    profileImage: null | string;
    bio: string;
    favoritePosition: string;
    hometown: string;
}

export interface UserStats {
    gamesPlayed: number;
    gamesWon: number;
    winRate: number;
    currentStreak: number;
    bestStreak: number;
    averageScore: number;
    totalPoints: number;
    tournamentsEntered: number;
    tournamentsWon: number;
    clubsJoined: number;
    dupr: string;
    ranking: number;
}

export interface Achievement {
    id: number;
    title: string;
    description: string;
    icon: string;
    earned: boolean;
    earnedDate?: string;
}

export interface RecentMatch {
    id: number;
    opponent: string;
    score: string;
    result: "win" | "loss";
    date: string;
    tournament?: string;
}
