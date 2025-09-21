import { Plus, Trophy, Clock, Users, TrendingUp } from 'lucide-react';
import {Link} from "react-router-dom";
import Navigation from "../../components/Navigation/Navigation.tsx";

export default function MainDashboard() {
  // Mock data for demonstration
  const currentGames = [
    {
      id: 1,
      players: ['John D.', 'Sarah M.', 'Mike R.', 'Lisa K.'],
      score: { team1: 8, team2: 6 },
      gameNumber: 1,
      startTime: '2:30 PM',
      status: 'active'
    },
    {
      id: 2,
      players: ['Alex P.', 'Emma W.'],
      score: { team1: 4, team2: 7 },
      gameNumber: 1,
      startTime: '2:45 PM',
      status: 'paused'
    }
  ];

  const recentScores = [
    {
      id: 1,
      players: ['Tom H.', 'Anna L.', 'Chris B.', 'Maya S.'],
      finalScore: { team1: 11, team2: 9 },
      winner: 'Team 1',
      date: 'Today',
      duration: '28 min'
    },
    {
      id: 2,
      players: ['David K.', 'Sophie R.'],
      finalScore: { team1: 7, team2: 11 },
      winner: 'Team 2',
      date: 'Yesterday',
      duration: '22 min'
    },
    {
      id: 3,
      players: ['Ryan M.', 'Olivia T.', 'Jake W.', 'Zoe C.'],
      finalScore: { team1: 11, team2: 6 },
      winner: 'Team 1',
      date: '2 days ago',
      duration: '31 min'
    }
  ];

  const stats = {
    totalGames: 15,
    winRate: 67,
    averageScore: 9.2,
    activeTournaments: 2
  };

  return (
      <main className="min-h-screen pb-20">
        <div className="p-4 max-w-md mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Pickleball Hub
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Welcome back! Ready to play?
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats.totalGames}
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-300">
            Games Played
          </div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {stats.winRate}%
          </div>
          <div className="text-xs text-green-700 dark:text-green-300">
            Win Rate
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/game"
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg"
          >
            <div className="flex items-center space-x-2 mb-2">
              <Plus size={20} />
              <span className="font-semibold">Start Game</span>
            </div>
            <div className="text-xs opacity-90">Begin new match</div>
          </Link>
          
          <Link
            to="/tournament"
            className="bg-gradient-to-r from-green-600 to-green-700 text-white p-4 rounded-xl hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-lg"
          >
            <div className="flex items-center space-x-2 mb-2">
              <Trophy size={20} />
              <span className="font-semibold">Tournaments</span>
            </div>
            <div className="text-xs opacity-90">View & join events</div>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/clubs"
            className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all duration-200 shadow-lg"
          >
            <div className="flex items-center space-x-2 mb-2">
              <Users size={20} />
              <span className="font-semibold">Find Clubs</span>
            </div>
            <div className="text-xs opacity-90">Join local groups</div>
          </Link>

          <Link
            to="/profile"
            className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 rounded-xl hover:from-orange-700 hover:to-orange-800 transition-all duration-200 shadow-lg"
          >
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp size={20} />
              <span className="font-semibold">My Stats</span>
            </div>
            <div className="text-xs opacity-90">View progress</div>
          </Link>
        </div>
      </div>

      {/* Current Games */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Current Games
          </h2>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-500 dark:text-gray-400">Live</span>
          </div>
        </div>
        
        {currentGames.length > 0 ? (
          <div className="space-y-3">
            {currentGames.map((game) => (
              <div
                key={game.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm"
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center space-x-2">
                    <Clock size={16} className="text-gray-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Started {game.startTime}
                    </span>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    game.status === 'active' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                  }`}>
                    {game.status === 'active' ? 'Active' : 'Paused'}
                  </span>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {game.players.length === 4 ? (
                      <div>
                        <div><strong>Team 1:</strong> {game.players[0]}, {game.players[1]}</div>
                        <div><strong>Team 2:</strong> {game.players[2]}, {game.players[3]}</div>
                      </div>
                    ) : (
                      <div><strong>Players:</strong> {game.players.join(' vs ')}</div>
                    )}
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {game.score.team1} - {game.score.team2}
                    </div>
                    <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors">
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg text-center">
            <div className="text-gray-400 mb-2">
              <Plus size={24} className="mx-auto" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No active games
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Start a new game to begin tracking scores
            </p>
          </div>
        )}
      </div>

      {/* Recent Scores */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Recent Scores
        </h2>
        
        {recentScores.length > 0 ? (
          <div className="space-y-2">
            {recentScores.map((match) => (
              <div
                key={match.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 rounded-lg"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {match.date} • {match.duration}
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {match.finalScore.team1} - {match.finalScore.team2}
                  </div>
                </div>
                
                <div className="text-xs text-gray-700 dark:text-gray-300 mb-1">
                  {match.players.length === 4 ? (
                    <div>
                      {match.players[0]}, {match.players[1]} vs {match.players[2]}, {match.players[3]}
                    </div>
                  ) : (
                    <div>{match.players.join(' vs ')}</div>
                  )}
                </div>
                
                <div className="text-xs font-medium text-green-600 dark:text-green-400">
                  🏆 {match.winner} wins!
                </div>
              </div>
            ))}
            
            <button className="w-full text-center text-blue-600 dark:text-blue-400 text-sm hover:text-blue-700 dark:hover:text-blue-300 py-2">
              View all matches →
            </button>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg text-center">
            <div className="text-gray-400 mb-2">
              <Trophy size={24} className="mx-auto" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No recent games
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Your match history will appear here
            </p>
          </div>
        )}
      </div>
    </div>
          <Navigation/>
      </main>
  );
}
