import { useState } from 'react';
import { ArrowLeft, Edit3, Star } from 'lucide-react';
import {Link} from "react-router-dom";
import Navigation from "../../components/Navigation/Navigation.tsx";

interface UserStats {
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
  skillLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  ranking: number;
}

interface Achievement {
  id: number;
  title: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedDate?: string;
}

interface RecentMatch {
  id: number;
  opponent: string;
  score: string;
  result: 'win' | 'loss';
  date: string;
  tournament?: string;
}

export default function Profile() {
  const [activeTab, setActiveTab] = useState<'stats' | 'history' | 'achievements' | 'settings'>('stats');
  const [isEditing, setIsEditing] = useState(false);

  // Mock user data
  const userProfile = {
    name: 'Alex Johnson',
    email: 'alex.johnson@email.com',
    joinDate: 'March 2024',
    profileImage: null,
    bio: 'Passionate pickleball player who loves the competitive spirit and community aspect of the game.',
    favoritePosition: 'Doubles - Left Side',
    hometown: 'Portland, OR'
  };

  const userStats: UserStats = {
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
    skillLevel: 'Intermediate',
    ranking: 1847
  };

  const achievements: Achievement[] = [
    {
      id: 1,
      title: 'First Victory',
      description: 'Win your first game',
      icon: '🏆',
      earned: true,
      earnedDate: 'March 15, 2024'
    },
    {
      id: 2,
      title: 'Tournament Champion',
      description: 'Win a tournament',
      icon: '👑',
      earned: true,
      earnedDate: 'April 2, 2024'
    },
    {
      id: 3,
      title: 'Streak Master',
      description: 'Win 5 games in a row',
      icon: '🔥',
      earned: true,
      earnedDate: 'April 10, 2024'
    },
    {
      id: 4,
      title: 'Century Club',
      description: 'Score 100 total points',
      icon: '💯',
      earned: true,
      earnedDate: 'April 15, 2024'
    },
    {
      id: 5,
      title: 'Social Butterfly',
      description: 'Join 3 different clubs',
      icon: '🦋',
      earned: false
    },
    {
      id: 6,
      title: 'Perfect Game',
      description: 'Win a game 11-0',
      icon: '⭐',
      earned: false
    }
  ];

  const recentMatches: RecentMatch[] = [
    {
      id: 1,
      opponent: 'Sarah M. & Mike R.',
      score: '11-8, 7-11, 11-6',
      result: 'win',
      date: 'Today',
      tournament: 'Spring League'
    },
    {
      id: 2,
      opponent: 'Tom H.',
      score: '11-9, 11-7',
      result: 'win',
      date: 'Yesterday'
    },
    {
      id: 3,
      opponent: 'Lisa K. & Emma W.',
      score: '6-11, 11-9, 8-11',
      result: 'loss',
      date: '2 days ago'
    },
    {
      id: 4,
      opponent: 'Chris B.',
      score: '11-5, 11-3',
      result: 'win',
      date: '3 days ago',
      tournament: 'Weekend Cup'
    }
  ];

  const getSkillLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner': return 'text-green-600 dark:text-green-400';
      case 'Intermediate': return 'text-yellow-600 dark:text-yellow-400';
      case 'Advanced': return 'text-orange-600 dark:text-orange-400';
      case 'Expert': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link to="/" className="text-gray-600 dark:text-gray-400">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Profile
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Your pickleball journey
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          <Edit3 size={20} />
        </button>
      </div>

      {/* Profile Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-xl">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold">
              {userProfile.name.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{userProfile.name}</h2>
            <div className="flex items-center space-x-2 text-sm opacity-90">
              <span className={getSkillLevelColor(userStats.skillLevel)}>
                {userStats.skillLevel}
              </span>
              <span>•</span>
              <span>Rank #{userStats.ranking}</span>
            </div>
            <div className="text-sm opacity-75 mt-1">
              Joined {userProfile.joinDate}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
        {[
          { key: 'stats', label: 'Stats' },
          { key: 'history', label: 'History' },
          { key: 'achievements', label: 'Awards' },
          { key: 'settings', label: 'Settings' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`flex-1 py-2 px-2 text-xs font-medium rounded-md transition-colors ${
              activeTab === key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {userStats.gamesWon}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Games Won</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {userStats.winRate}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Win Rate</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {userStats.currentStreak}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Current Streak</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {userStats.averageScore}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Avg Score</div>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Detailed Statistics</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Games Played</span>
                <span className="font-medium text-gray-900 dark:text-white">{userStats.gamesPlayed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Best Win Streak</span>
                <span className="font-medium text-gray-900 dark:text-white">{userStats.bestStreak} games</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Points Scored</span>
                <span className="font-medium text-gray-900 dark:text-white">{userStats.totalPoints}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Tournaments Entered</span>
                <span className="font-medium text-gray-900 dark:text-white">{userStats.tournamentsEntered}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Tournaments Won</span>
                <span className="font-medium text-gray-900 dark:text-white">{userStats.tournamentsWon}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Clubs Joined</span>
                <span className="font-medium text-gray-900 dark:text-white">{userStats.clubsJoined}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Matches</h3>
            <button className="text-blue-600 dark:text-blue-400 text-sm">View All</button>
          </div>
          
          <div className="space-y-3">
            {recentMatches.map((match) => (
              <div
                key={match.id}
                className={`bg-white dark:bg-gray-800 border-l-4 p-4 rounded-lg ${
                  match.result === 'win' 
                    ? 'border-green-500' 
                    : 'border-red-500'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white text-sm">
                      vs {match.opponent}
                    </div>
                    {match.tournament && (
                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        {match.tournament}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${
                      match.result === 'win' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {match.result === 'win' ? 'W' : 'L'}
                    </div>
                    <div className="text-xs text-gray-500">{match.date}</div>
                  </div>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Final: {match.score}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievements Tab */}
      {activeTab === 'achievements' && (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Achievements</h3>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {achievements.filter(a => a.earned).length} of {achievements.length} earned
            </div>
          </div>
          
          <div className="space-y-3">
            {achievements.map((achievement) => (
              <div
                key={achievement.id}
                className={`bg-white dark:bg-gray-800 p-4 rounded-lg border-2 ${
                  achievement.earned
                    ? 'border-yellow-200 dark:border-yellow-800'
                    : 'border-gray-200 dark:border-gray-700 opacity-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">{achievement.icon}</div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {achievement.title}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {achievement.description}
                    </div>
                    {achievement.earned && achievement.earnedDate && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Earned {achievement.earnedDate}
                      </div>
                    )}
                  </div>
                  {achievement.earned && (
                    <Star size={16} className="text-yellow-500 fill-current" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Profile Information</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={userProfile.name}
                  disabled={!isEditing}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={userProfile.email}
                  disabled={!isEditing}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Hometown
                </label>
                <input
                  type="text"
                  value={userProfile.hometown}
                  disabled={!isEditing}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Bio
                </label>
                <textarea
                  value={userProfile.bio}
                  disabled={!isEditing}
                  rows={3}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Preferences</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 dark:text-gray-300">Email Notifications</span>
                <button className="bg-blue-600 text-white px-3 py-1 text-xs rounded-full">ON</button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 dark:text-gray-300">Tournament Alerts</span>
                <button className="bg-blue-600 text-white px-3 py-1 text-xs rounded-full">ON</button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 dark:text-gray-300">Public Profile</span>
                <button className="bg-gray-400 text-white px-3 py-1 text-xs rounded-full">OFF</button>
              </div>
            </div>
          </div>

          {isEditing && (
            <div className="flex space-x-2">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 bg-gray-600 text-white p-3 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
        <Navigation/>
    </div>
  );
}