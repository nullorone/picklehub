import { useState } from 'react';
import { ArrowLeft, Play, Pause, RotateCcw, Clock } from 'lucide-react';
import {Link} from "react-router-dom";
import Navigation from "../../components/Navigation/Navigation.tsx";

interface GameState {
  team1Score: number;
  team2Score: number;
  servingTeam: 1 | 2;
  servingPlayer: 1 | 2;
  gameNumber: number;
  isPlaying: boolean;
  gameStartTime: Date | null;
  gameEndTime: Date | null;
  gameTarget: 11 | 15 | 21;
}

interface Team {
  player1: string;
  player2?: string;
}

export default function Game() {
  const [gameMode, setGameMode] = useState<'setup' | 'playing' | 'finished'>('setup');
  const [playersMode, setPlayersMode] = useState<'singles' | 'doubles'>('doubles');
  const [team1, setTeam1] = useState<Team>({ player1: '', player2: '' });
  const [team2, setTeam2] = useState<Team>({ player1: '', player2: '' });
  
  const [gameState, setGameState] = useState<GameState>({
    team1Score: 0,
    team2Score: 0,
    servingTeam: 1,
    servingPlayer: 1,
    gameNumber: 1,
    isPlaying: false,
    gameStartTime: null,
    gameEndTime: null,
    gameTarget: 11
  });

  const [gameHistory, setGameHistory] = useState<string[]>([]);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const canScorePoint = () => {
    const { team1Score, team2Score, gameTarget } = gameState;
    
    // Game is over if someone reached target and won by 2
    if (team1Score >= gameTarget && team1Score - team2Score >= 2) return false;
    if (team2Score >= gameTarget && team2Score - team1Score >= 2) return false;
    
    return true;
  };

  const scorePoint = (team: 1 | 2) => {
    if (!canScorePoint() || !gameState.isPlaying) return;

    const newState = { ...gameState };
    
    if (team === 1) {
      newState.team1Score += 1;
    } else {
      newState.team2Score += 1;
    }

    // Check for game end
    const { team1Score, team2Score, gameTarget } = newState;
    if (
      (team1Score >= gameTarget && team1Score - team2Score >= 2) ||
      (team2Score >= gameTarget && team2Score - team1Score >= 2)
    ) {
      newState.isPlaying = false;
      newState.gameEndTime = new Date();
      setGameMode('finished');
    }

    // Switch serve only if the serving team didn't score
    if (team !== newState.servingTeam) {
      if (playersMode === 'doubles') {
        // In doubles, switch serving player first, then team
        if (newState.servingPlayer === 1) {
          newState.servingPlayer = 2;
        } else {
          newState.servingTeam = newState.servingTeam === 1 ? 2 : 1;
          newState.servingPlayer = 1;
        }
      } else {
        // In singles, just switch serving team
        newState.servingTeam = newState.servingTeam === 1 ? 2 : 1;
      }
    }

    // Add to history
    const action = `Team ${team} scores! (${newState.team1Score}-${newState.team2Score})`;
    setGameHistory(prev => [action, ...prev]);
    
    setGameState(newState);
  };

  const startGame = () => {
    if (!team1.player1 || !team2.player1) return;
    
    setGameState(prev => ({
      ...prev,
      isPlaying: true,
      gameStartTime: new Date()
    }));
    setGameMode('playing');
    setGameHistory(['Game started!']);
  };

  const pauseGame = () => {
    setGameState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    setGameHistory(prev => [gameState.isPlaying ? 'Game paused' : 'Game resumed', ...prev]);
  };

  const resetGame = () => {
    setGameState({
      team1Score: 0,
      team2Score: 0,
      servingTeam: 1,
      servingPlayer: 1,
      gameNumber: 1,
      isPlaying: false,
      gameStartTime: null,
      gameEndTime: null,
      gameTarget: 11
    });
    setGameHistory([]);
    setGameMode('setup');
  };

  if (gameMode === 'setup') {
    return (
      <div className="p-4 max-w-md mx-auto space-y-6">
        <div className="flex items-center space-x-3 mb-6">
          <Link to="/" className="text-gray-600 dark:text-gray-400">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              New Game
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Set up your match
            </p>
          </div>
        </div>

        {/* Game Type */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Game Type
          </h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setPlayersMode('singles')}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                playersMode === 'singles'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <div className="text-sm font-medium">Singles</div>
              <div className="text-xs text-gray-500">1 vs 1</div>
            </button>
            <button
              onClick={() => setPlayersMode('doubles')}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                playersMode === 'doubles'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <div className="text-sm font-medium">Doubles</div>
              <div className="text-xs text-gray-500">2 vs 2</div>
            </button>
          </div>
        </div>

        {/* Game Target */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Game Target
          </h2>
          <div className="flex space-x-2">
            {[11, 15, 21].map((target) => (
              <button
                key={target}
                onClick={() => setGameState(prev => ({ ...prev, gameTarget: target as 11 | 15 | 21 }))}
                className={`flex-1 p-2 rounded-lg border-2 transition-colors ${
                  gameState.gameTarget === target
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <div className="font-medium">{target}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Players Setup */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Players
          </h2>
          
          {/* Team 1 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Team 1</h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Player 1 name"
                value={team1.player1}
                onChange={(e) => setTeam1(prev => ({ ...prev, player1: e.target.value }))}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
              {playersMode === 'doubles' && (
                <input
                  type="text"
                  placeholder="Player 2 name"
                  value={team1.player2 || ''}
                  onChange={(e) => setTeam1(prev => ({ ...prev, player2: e.target.value }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
              )}
            </div>
          </div>

          {/* Team 2 */}
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
            <h3 className="font-medium text-red-800 dark:text-red-300 mb-2">Team 2</h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Player 1 name"
                value={team2.player1}
                onChange={(e) => setTeam2(prev => ({ ...prev, player1: e.target.value }))}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
              {playersMode === 'doubles' && (
                <input
                  type="text"
                  placeholder="Player 2 name"
                  value={team2.player2 || ''}
                  onChange={(e) => setTeam2(prev => ({ ...prev, player2: e.target.value }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
              )}
            </div>
          </div>
        </div>

        <button
          onClick={startGame}
          disabled={!team1.player1 || !team2.player1 || (playersMode === 'doubles' && (!team1.player2 || !team2.player2))}
          className="w-full bg-green-600 text-white p-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
        >
          <div className="flex items-center justify-center space-x-2">
            <Play size={20} />
            <span>Start Game</span>
          </div>
        </button>

          <Navigation/>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setGameMode('setup')}
          className="text-gray-600 dark:text-gray-400"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="text-center">
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            Game {gameState.gameNumber}
          </div>
          {gameState.gameStartTime && gameState.isPlaying && (
            <div className="text-sm text-gray-500 flex items-center justify-center space-x-1">
              <Clock size={14} />
              <span>{formatTime(gameState.gameStartTime)}</span>
            </div>
          )}
        </div>
        <div className="flex space-x-2">
          <button
            onClick={pauseGame}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            {gameState.isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            onClick={resetGame}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>

      {/* Score Display */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
        <div className="grid grid-cols-2 gap-6">
          {/* Team 1 */}
          <div className="text-center">
            <div className={`p-4 rounded-lg ${
              gameState.servingTeam === 1 
                ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-400' 
                : 'bg-gray-50 dark:bg-gray-700'
            }`}>
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Team 1 {gameState.servingTeam === 1 && '•'}
              </div>
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                {gameState.team1Score}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {team1.player1}
                {playersMode === 'doubles' && team1.player2 && (
                  <><br/>{team1.player2}</>
                )}
              </div>
              {playersMode === 'doubles' && gameState.servingTeam === 1 && (
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Serving: Player {gameState.servingPlayer}
                </div>
              )}
            </div>
            <button
              onClick={() => scorePoint(1)}
              disabled={!canScorePoint() || !gameState.isPlaying}
              className="w-full mt-3 bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
            >
              +1 Point
            </button>
          </div>

          {/* Team 2 */}
          <div className="text-center">
            <div className={`p-4 rounded-lg ${
              gameState.servingTeam === 2 
                ? 'bg-red-100 dark:bg-red-900/30 border-2 border-red-400' 
                : 'bg-gray-50 dark:bg-gray-700'
            }`}>
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Team 2 {gameState.servingTeam === 2 && '•'}
              </div>
              <div className="text-4xl font-bold text-red-600 dark:text-red-400 mb-2">
                {gameState.team2Score}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {team2.player1}
                {playersMode === 'doubles' && team2.player2 && (
                  <><br/>{team2.player2}</>
                )}
              </div>
              {playersMode === 'doubles' && gameState.servingTeam === 2 && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Serving: Player {gameState.servingPlayer}
                </div>
              )}
            </div>
            <button
              onClick={() => scorePoint(2)}
              disabled={!canScorePoint() || !gameState.isPlaying}
              className="w-full mt-3 bg-red-600 text-white p-3 rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
            >
              +1 Point
            </button>
          </div>
        </div>

        {/* Game Info */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>Playing to {gameState.gameTarget}</span>
            <span>
              {gameMode === 'finished' 
                ? 'Game Finished!' 
                : gameState.isPlaying 
                ? 'Game in Progress' 
                : 'Game Paused'
              }
            </span>
          </div>
        </div>
      </div>

      {/* Game History */}
      {gameHistory.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Game History
          </h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {gameHistory.slice(0, 5).map((action, index) => (
              <div key={index} className="text-xs text-gray-600 dark:text-gray-400">
                {action}
              </div>
            ))}
          </div>
        </div>
      )}

      {gameMode === 'finished' && (
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-center">
          <div className="text-lg font-bold text-green-800 dark:text-green-300 mb-2">
            🏆 Game Complete!
          </div>
          <div className="text-green-700 dark:text-green-400 mb-4">
            {gameState.team1Score > gameState.team2Score 
              ? `Team 1 wins ${gameState.team1Score}-${gameState.team2Score}!`
              : `Team 2 wins ${gameState.team2Score}-${gameState.team1Score}!`
            }
          </div>
          <div className="space-y-2">
            <button
              onClick={resetGame}
              className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              New Game
            </button>
            <Link
              to="/"
              className="block w-full bg-gray-600 text-white p-3 rounded-lg hover:bg-gray-700 transition-colors text-center font-semibold"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      )}
        <Navigation/>
    </div>
  );
}